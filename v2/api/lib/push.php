<?php
declare(strict_types=1);

/**
 * Dependency-free Web Push (RFC 8291 aes128gcm payload encryption + RFC 8292 VAPID).
 * Needs only the openssl and curl extensions, so there is no Composer step on Hostinger.
 * VAPID keys are generated on first use and stored in the settings table.
 */

function b64u_enc(string $bin): string
{
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

function b64u_dec(string $s): string
{
    $s = strtr($s, '-_', '+/');
    return base64_decode($s . str_repeat('=', (4 - strlen($s) % 4) % 4)) ?: '';
}

function ec_new_key()
{
    $opts = ['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC];
    $key = openssl_pkey_new($opts);
    if (!$key) {
        // Windows builds (e.g. XAMPP under Apache) need an explicit openssl.cnf
        foreach ([getenv('OPENSSL_CONF') ?: '', dirname(PHP_BINARY) . '/extras/ssl/openssl.cnf', 'C:/xampp/php/extras/ssl/openssl.cnf', 'C:/xampp/apache/conf/openssl.cnf'] as $cnf) {
            if ($cnf && is_file($cnf) && ($key = openssl_pkey_new($opts + ['config' => $cnf]))) break;
        }
    }
    if (!$key) throw new RuntimeException('Cannot create EC key: ' . openssl_error_string());
    return $key;
}

function ec_public_raw($key): string
{
    $d = openssl_pkey_get_details($key);
    return "\x04" . str_pad($d['ec']['x'], 32, "\0", STR_PAD_LEFT) . str_pad($d['ec']['y'], 32, "\0", STR_PAD_LEFT);
}

function ec_public_from_raw(string $raw)
{
    // SubjectPublicKeyInfo header for an uncompressed P-256 point
    $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $raw;
    $pem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
    $k = openssl_pkey_get_public($pem);
    if (!$k) throw new RuntimeException('Invalid subscription public key');
    return $k;
}

function vapid_keys(): array
{
    $raw = setting_get('v2.vapid');
    if ($raw) {
        $k = json_decode($raw, true);
        if (!empty($k['private']) && !empty($k['public'])) return $k;
    }
    $key = ec_new_key();
    openssl_pkey_export($key, $pem);
    $k = ['private' => $pem, 'public' => b64u_enc(ec_public_raw($key))];
    setting_set('v2.vapid', json_encode($k));
    return $k;
}

function vapid_public_key(): ?string
{
    try {
        return vapid_keys()['public'];
    } catch (Throwable $e) {
        return null;
    }
}

/** Converts an OpenSSL DER ECDSA signature into the raw r||s form JWT ES256 needs. */
function der_to_raw_sig(string $der): string
{
    $pos = 2;
    if (ord($der[1]) & 0x80) $pos += ord($der[1]) & 0x7f;
    $out = '';
    for ($i = 0; $i < 2; $i++) {
        $pos++; // 0x02 INTEGER tag
        $len = ord($der[$pos++]);
        $int = substr($der, $pos, $len);
        $pos += $len;
        $out .= str_pad(ltrim($int, "\0"), 32, "\0", STR_PAD_LEFT);
    }
    return $out;
}

function vapid_header(string $endpoint): string
{
    $keys = vapid_keys();
    $u = parse_url($endpoint);
    $aud = $u['scheme'] . '://' . $u['host'] . (isset($u['port']) ? ':' . $u['port'] : '');
    $subject = setting_get('v2.push_subject') ?: 'https://localhost';
    $header = b64u_enc(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
    $claims = b64u_enc(json_encode(['aud' => $aud, 'exp' => time() + 12 * 3600, 'sub' => $subject], JSON_UNESCAPED_SLASHES));
    $input = $header . '.' . $claims;
    if (!openssl_sign($input, $der, $keys['private'], OPENSSL_ALGO_SHA256)) {
        throw new RuntimeException('VAPID signing failed');
    }
    return 'vapid t=' . $input . '.' . b64u_enc(der_to_raw_sig($der)) . ', k=' . $keys['public'];
}

function hkdf_expand(string $prk, string $info, int $len): string
{
    return substr(hash_hmac('sha256', $info . "\x01", $prk, true), 0, $len);
}

function push_encrypt(string $payload, string $uaPublicB64, string $authB64): string
{
    $uaPublic = b64u_dec($uaPublicB64);
    $authSecret = b64u_dec($authB64);
    if (strlen($uaPublic) !== 65 || strlen($authSecret) < 16) throw new RuntimeException('Bad subscription keys');

    $local = ec_new_key();
    $localPublic = ec_public_raw($local);
    $shared = openssl_pkey_derive(ec_public_from_raw($uaPublic), $local, 32);
    if ($shared === false) throw new RuntimeException('ECDH failed');

    $prkKey = hash_hmac('sha256', $shared, $authSecret, true);
    $ikm = hkdf_expand($prkKey, "WebPush: info\x00" . $uaPublic . $localPublic, 32);
    $salt = random_bytes(16);
    $prk = hash_hmac('sha256', $ikm, $salt, true);
    $cek = hkdf_expand($prk, "Content-Encoding: aes128gcm\x00", 16);
    $nonce = hkdf_expand($prk, "Content-Encoding: nonce\x00", 12);

    $tag = '';
    $cipher = openssl_encrypt($payload . "\x02", 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag);
    if ($cipher === false) throw new RuntimeException('Encryption failed');
    return $salt . pack('N', 4096) . chr(strlen($localPublic)) . $localPublic . $cipher . $tag;
}

/** Returns the HTTP status from the push service (201 = delivered). */
function push_send(array $sub, array $payload, int $ttl = 600): int
{
    $body = push_encrypt(json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $sub['p256dh'], $sub['auth']);
    $ch = curl_init($sub['endpoint']);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_HTTPHEADER => [
            'Authorization: ' . vapid_header($sub['endpoint']),
            'Content-Encoding: aes128gcm',
            'Content-Type: application/octet-stream',
            'TTL: ' . $ttl,
            'Urgency: high',
            'Topic: ' . substr(preg_replace('/[^A-Za-z0-9_-]/', '', $payload['tag'] ?? 'todo'), -32),
        ],
    ]);
    curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $status;
}

function push_broadcast(array $payload): array
{
    $results = [];
    foreach (q('SELECT * FROM v2_push_subscriptions')->fetchAll() as $sub) {
        try {
            $status = push_send($sub, $payload);
        } catch (Throwable $e) {
            $status = 0;
        }
        if ($status === 404 || $status === 410) {
            q('DELETE FROM v2_push_subscriptions WHERE endpoint_hash = ?', [$sub['endpoint_hash']]);
        }
        $results[] = $status;
    }
    return $results;
}

/** Sends any scheduled notifications that are due. Returns how many were sent. */
function push_dispatch_due(): int
{
    $now = now_ms();
    $due = q('SELECT id, due_at, payload FROM v2_scheduled_pushes WHERE sent_at IS NULL AND due_at <= ? ORDER BY due_at LIMIT 20', [$now + 1500])->fetchAll();
    foreach ($due as $p) {
        // Claim first so overlapping cron runs never double-send
        $claimed = q('UPDATE v2_scheduled_pushes SET sent_at = ? WHERE id = ? AND sent_at IS NULL', [$now, $p['id']])->rowCount();
        // A "time for a break" alert that is minutes late is noise — drop it
        if ($claimed && (int)$p['due_at'] >= $now - 120000) push_broadcast(json_decode($p['payload'], true));
    }
    q('DELETE FROM v2_scheduled_pushes WHERE sent_at IS NOT NULL AND sent_at < ?', [$now - 86400000]);
    return count($due);
}
