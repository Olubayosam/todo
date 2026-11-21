<?php
declare(strict_types=1);

/**
 * Server-Sent Events stream for live sync.
 *
 * Shared hosting limits long-running PHP workers, so each connection lives
 * ~25s and then closes; EventSource reconnects automatically and resumes from
 * Last-Event-ID. Only one tab per browser holds a stream (the web app elects a
 * leader tab), so a laptop + phone use about two PHP workers.
 */

require __DIR__ . '/lib/bootstrap.php';

handle_errors(function () {
    app_boot();
    require_auth();

    $since = (int)($_SERVER['HTTP_LAST_EVENT_ID'] ?? ($_GET['since'] ?? 0));

    @ini_set('zlib.output_compression', '0');
    @ini_set('output_buffering', '0');
    @ini_set('implicit_flush', '1');
    if (function_exists('apache_setenv')) @apache_setenv('no-gzip', '1');
    while (ob_get_level()) ob_end_flush();
    set_time_limit(40);
    ignore_user_abort(false);

    header('Content-Type: text/event-stream; charset=utf-8');
    header('Cache-Control: no-cache, no-transform');
    header('X-Accel-Buffering: no'); // nginx / LiteSpeed: do not buffer
    header('Connection: keep-alive');

    $send = function (string $event, $data, ?int $id = null) {
        if ($id !== null) echo "id: {$id}\n";
        echo "event: {$event}\n";
        echo 'data: ' . json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n\n";
        flush();
    };

    // 2KB padding defeats proxies that buffer the first chunk
    echo ':' . str_repeat(' ', 2048) . "\n";
    echo "retry: 1500\n\n";

    if (needs_resync($since)) {
        $send('resync', ['serverNow' => now_ms()]);
        return;
    }

    $send('hello', ['serverNow' => now_ms(), 'cursor' => $since]);
    $started = time();
    $lastPing = time();
    while (time() - $started < 25) {
        if (connection_aborted()) return;
        $changes = changes_since($since, 200);
        foreach ($changes as $c) {
            $since = $c['id'];
            $send('change', $c, $c['id']);
        }
        if (time() - $lastPing >= 8) {
            $send('ping', ['serverNow' => now_ms()]);
            $lastPing = time();
        }
        usleep($changes ? 200000 : 800000);
    }
    $send('bye', ['cursor' => $since]);
});
