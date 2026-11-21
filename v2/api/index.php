<?php
declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';

handle_errors(function () {
    app_boot();
    $route = trim((string)($_GET['r'] ?? ''), '/');
    $method = $_SERVER['REQUEST_METHOD'];
    $body = [];
    if ($method === 'POST' && str_starts_with($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')) {
        $body = json_decode(file_get_contents('php://input') ?: '[]', true) ?: [];
    }

    // --- Public ---
    if ($route === 'auth/login' && $method === 'POST') {
        json_out(login((string)($body['passphrase'] ?? '')));
    }

    $token = require_auth();

    switch ("{$method} {$route}") {
        case 'GET auth/check':
            json_out(['ok' => true, 'serverNow' => now_ms()]);

        case 'POST auth/logout':
            logout($token);
            json_out(['ok' => true]);

        case 'GET bootstrap':
            json_out(bootstrap($_GET['today'] ?? null));

        case 'GET sync':
            $since = (int)($_GET['since'] ?? 0);
            if (needs_resync($since)) json_out(['resync' => true, 'serverNow' => now_ms()]);
            $changes = changes_since($since);
            json_out([
                'changes' => $changes,
                'cursor' => $changes ? end($changes)['id'] : max($since, 0),
                'serverNow' => now_ms(),
            ]);

        case 'POST mutate':
            $ops = $body['ops'] ?? [];
            if (!is_array($ops) || count($ops) > 100) throw new ApiError('Invalid ops');
            $results = [];
            foreach ($ops as $op) {
                // Each op commits on its own: one bad op must not block the rest of the queue
                db()->beginTransaction();
                try {
                    $results[] = ['ok' => true] + apply_op((array)$op);
                    db()->commit();
                } catch (Throwable $e) {
                    if (db()->inTransaction()) db()->rollBack();
                    if (!$e instanceof ApiError) error_log('[todo-v2] op failed: ' . $e->getMessage());
                    $results[] = ['ok' => false, 'error' => $e instanceof ApiError ? $e->getMessage() : 'Server error'];
                }
            }
            if (!empty(array_filter($ops, fn($o) => ($o['type'] ?? '') === 'push.subscribe'))) {
                $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
                setting_set('v2.push_subject', (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https://' : 'http://') . $host);
            }
            json_out(['results' => $results, 'serverNow' => now_ms()]);

        case 'GET stats':
            $from = is_date($_GET['from'] ?? null) ? $_GET['from'] : date('Y-m-d', strtotime('-371 days'));
            $to = is_date($_GET['to'] ?? null) ? $_GET['to'] : date('Y-m-d', strtotime('+1 day'));
            json_out(['focus' => focus_stats($from, $to)]);

        case 'POST music/upload':
            json_out(['tracks' => music_upload()]);

        case 'GET music/stream':
            music_stream(v_uid($_GET['uid'] ?? null));

        case 'POST push/test':
            json_out(['results' => push_broadcast(['title' => 'Notifications are on', 'body' => 'You will be told when it is time for a break.', 'tag' => 'test-' . now_ms(), 'url' => './'])]);
    }
    throw new ApiError('Not found', 404);
});
