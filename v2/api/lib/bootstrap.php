<?php
declare(strict_types=1);

require_once __DIR__ . '/env.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/migrate.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/data.php';
require_once __DIR__ . '/focus.php';
require_once __DIR__ . '/push.php';
require_once __DIR__ . '/music.php';

function app_boot(): void
{
    load_env();
    run_migrations();
    $cid = $_SERVER['HTTP_X_CLIENT_ID'] ?? ($_GET['cid'] ?? null);
    if (is_string($cid) && preg_match('/^[A-Za-z0-9_-]{6,64}$/', $cid)) $GLOBALS['CLIENT_ID'] = $cid;
}

function handle_errors(callable $fn): void
{
    try {
        $fn();
    } catch (ApiError $e) {
        json_out(['error' => $e->getMessage()], $e->status);
    } catch (Throwable $e) {
        error_log('[todo-v2] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
        $debug = env('APP_DEBUG') === '1';
        json_out(['error' => $debug ? $e->getMessage() : 'Something went wrong on the server.'], 500);
    }
}
