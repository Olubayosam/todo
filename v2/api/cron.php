<?php
declare(strict_types=1);

/**
 * Background worker — run every minute from Hostinger's Cron Jobs panel:
 *   /usr/bin/php /home/<user>/public_html/todo-v2/api/cron.php
 *
 * Each run loops for ~55s, checking every 5s, so break notifications arrive
 * within a few seconds even though cron itself only fires once a minute.
 * It also completes focus sessions whose time is up when no tab is open.
 *
 * Can also be triggered over HTTP (e.g. from cron-job.org) with
 *   https://<site>/todo-v2/api/cron.php?key=<v2.cron_key from settings>
 */

require __DIR__ . '/lib/bootstrap.php';

$isCli = PHP_SAPI === 'cli';
load_env();
run_migrations();

if (!$isCli) {
    $key = setting_get('v2.cron_key');
    if (!$key || !hash_equals($key, (string)($_GET['key'] ?? ''))) {
        http_response_code(403);
        exit('Forbidden');
    }
}

$lockOk = (int)q("SELECT GET_LOCK('todo_v2_cron', 0)")->fetchColumn() === 1;
if (!$lockOk) exit("Another cron run is active\n");

$start = time();
$sent = 0;
do {
    try {
        $sent += push_dispatch_due();
        focus_finalize_due();
    } catch (Throwable $e) {
        error_log('[todo-v2 cron] ' . $e->getMessage());
    }
    if (time() - $start >= 54) break;
    sleep(5);
} while (true);

q("SELECT RELEASE_LOCK('todo_v2_cron')");
setting_set('v2.cron_last_run', (string)now_ms());
echo "ok, sent {$sent}\n";
