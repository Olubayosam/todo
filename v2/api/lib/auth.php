<?php
declare(strict_types=1);

/**
 * Passcode auth — same mechanism and tables as v1, so both apps share the
 * passphrase in .env and the auth_tokens table.
 */

function sync_passphrase(): void
{
    $passphrase = env('PASSPHRASE');
    if (!$passphrase) throw new RuntimeException('PASSPHRASE not set in .env');
    $hash = setting_get('passphrase_hash');
    if ($hash && password_verify($passphrase, $hash)) return;
    setting_set('passphrase_hash', password_hash($passphrase, PASSWORD_DEFAULT));
}

function session_days(): int
{
    return max(1, (int)env('SESSION_DURATION_DAYS', '30'));
}

function client_ip(): string
{
    return substr($_SERVER['REMOTE_ADDR'] ?? 'unknown', 0, 64);
}

function login(string $passphrase): array
{
    $ip = client_ip();
    $now = now_ms();
    $row = q('SELECT attempts, first_at, locked_until FROM v2_login_attempts WHERE ip = ?', [$ip])->fetch();
    if ($row && (int)$row['locked_until'] > $now) {
        $mins = (int)ceil(((int)$row['locked_until'] - $now) / 60000);
        throw new ApiError("Too many attempts. Try again in {$mins} min.", 429);
    }

    sync_passphrase();
    $hash = setting_get('passphrase_hash');
    if (!$hash || $passphrase === '' || !password_verify($passphrase, $hash)) {
        // 10 failures within 15 minutes locks this IP for 15 minutes
        $windowStart = $now - 15 * 60000;
        if (!$row || (int)$row['first_at'] < $windowStart) {
            q('REPLACE INTO v2_login_attempts (ip, attempts, first_at, locked_until) VALUES (?, 1, ?, 0)', [$ip, $now]);
        } else {
            $attempts = (int)$row['attempts'] + 1;
            $locked = $attempts >= 10 ? $now + 15 * 60000 : 0;
            q('UPDATE v2_login_attempts SET attempts = ?, locked_until = ? WHERE ip = ?', [$attempts, $locked, $ip]);
        }
        usleep(400000);
        throw new ApiError('That passcode is not right.', 401);
    }

    q('DELETE FROM v2_login_attempts WHERE ip = ?', [$ip]);
    $token = bin2hex(random_bytes(32));
    q('INSERT INTO auth_tokens (token, expires_at) VALUES (?, DATE_ADD(NOW(), INTERVAL ? DAY))', [$token, session_days()]);
    q('DELETE FROM auth_tokens WHERE expires_at < NOW()');
    return ['token' => $token];
}

function bearer_token(): ?string
{
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!$h && function_exists('getallheaders')) {
        foreach (getallheaders() as $k => $v) {
            if (strcasecmp($k, 'Authorization') === 0) $h = $v;
        }
    }
    if (preg_match('/Bearer\s+([a-f0-9]{64})/i', $h, $m)) return $m[1];
    // EventSource and <audio> cannot send headers, so they pass ?token=
    $t = $_GET['token'] ?? null;
    if (is_string($t) && preg_match('/^[a-f0-9]{64}$/i', $t)) return $t;
    return null;
}

/** Validates the token and slides its expiry forward when it is past half-life. */
function require_auth(): string
{
    $token = bearer_token();
    if (!$token) throw new ApiError('Unauthorized', 401);
    $row = q('SELECT TIMESTAMPDIFF(SECOND, NOW(), expires_at) AS remaining FROM auth_tokens WHERE token = ? AND expires_at > NOW()', [$token])->fetch();
    if (!$row) throw new ApiError('Unauthorized', 401);
    $days = session_days();
    if ((int)$row['remaining'] < $days * 86400 / 2) {
        q('UPDATE auth_tokens SET expires_at = DATE_ADD(NOW(), INTERVAL ? DAY) WHERE token = ?', [$days, $token]);
    }
    return $token;
}

function logout(string $token): void
{
    q('DELETE FROM auth_tokens WHERE token = ?', [$token]);
}
