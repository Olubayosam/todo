<?php
declare(strict_types=1);

/**
 * Focus session engine. The state is an "anchor": a snapshot of where the
 * session was at `anchorAt` (server ms). Every device computes the live
 * position deterministically from the anchor, so timers agree everywhere and
 * the server can schedule push notifications for future phase boundaries.
 *
 * Mirror of web/src/lib/focusEngine.ts — keep both in sync.
 */

function focus_simulate(array $s, int $now, bool $collectEvents = false): array
{
    $workSec = (float)$s['workSec'];
    $every = (float)($s['breakEverySec'] ?? 0);
    $breakSec = (float)($s['breakSec'] ?? 0);
    $phase = $s['phase'] ?? 'work';
    $phaseElapsed = (float)($s['phaseElapsedSec'] ?? 0);
    $workDone = (float)($s['workDoneSec'] ?? 0);
    $sinceBreak = (float)($s['workSinceBreakSec'] ?? 0);
    $breaks = (int)($s['breaksTaken'] ?? 0);
    $running = ($s['status'] ?? '') === 'running';
    $anchor = (int)$s['anchorAt'];

    $t = $running ? max(0, ($now - $anchor) / 1000) : 0.0;
    $clock = (float)$anchor; // ms timestamp of the simulation cursor
    $completedAt = null;
    $current = null;
    $events = [];

    for ($i = 0; $i < 2000; $i++) {
        if ($phase === 'work') {
            $remainingWork = max(0, $workSec - $workDone);
            $blockLeft = ($every > 0 && $breakSec > 0) ? min($remainingWork, max(0, $every - $sinceBreak)) : $remainingWork;
            if ($current === null && $t < $blockLeft) {
                $current = [
                    'phase' => 'work',
                    'phaseRemainingSec' => $blockLeft - $t,
                    'phaseTotalSec' => $phaseElapsed + $blockLeft,
                    'workDoneSec' => $workDone + $t,
                    'workSinceBreakSec' => $sinceBreak + $t,
                    'phaseElapsedSec' => $phaseElapsed + $t,
                    'breaksTaken' => $breaks,
                ];
                if (!$collectEvents || !$running) break;
            }
            $clock += $blockLeft * 1000;
            if ($current === null) $t -= $blockLeft;
            $workDone += $blockLeft;
            $sinceBreak += $blockLeft;
            if ($workDone >= $workSec - 0.001) {
                $events[] = ['at' => (int)round($clock), 'type' => 'done', 'tag' => 'done'];
                if ($current === null) $completedAt = (int)round($clock);
                break;
            }
            $events[] = ['at' => (int)round($clock), 'type' => 'break', 'tag' => 'b' . ($breaks + 1), 'breakSec' => $breakSec, 'workLeftSec' => $workSec - $workDone];
            $phase = 'break';
            $phaseElapsed = 0;
            $sinceBreak = 0;
        } else {
            $left = max(0, $breakSec - $phaseElapsed);
            if ($current === null && $t < $left) {
                $current = [
                    'phase' => 'break',
                    'phaseRemainingSec' => $left - $t,
                    'phaseTotalSec' => $phaseElapsed + $left,
                    'workDoneSec' => $workDone,
                    'workSinceBreakSec' => 0,
                    'phaseElapsedSec' => $phaseElapsed + $t,
                    'breaksTaken' => $breaks,
                ];
                if (!$collectEvents || !$running) break;
            }
            $clock += $left * 1000;
            if ($current === null) $t -= $left;
            $breaks++;
            $events[] = ['at' => (int)round($clock), 'type' => 'work', 'tag' => 'w' . $breaks, 'workLeftSec' => $workSec - $workDone];
            $phase = 'work';
            $phaseElapsed = 0;
        }
    }

    $done = $current === null;
    if ($done) {
        $current = ['phase' => 'work', 'phaseRemainingSec' => 0, 'phaseTotalSec' => 0, 'workDoneSec' => $workSec, 'workSinceBreakSec' => 0, 'phaseElapsedSec' => 0, 'breaksTaken' => $breaks];
    }
    $current['completed'] = $done;
    $current['completedAt'] = $completedAt;
    $current['events'] = array_values(array_filter($events, fn($e) => $e['at'] > $now));
    return $current;
}

function focus_load(string $uid): ?array
{
    $row = q('SELECT * FROM v2_focus_sessions WHERE uid = ?', [$uid])->fetch();
    if (!$row) return null;
    $state = json_decode($row['state'], true);
    $state['version'] = (int)$row['version'];
    return ['row' => $row, 'state' => $state];
}

/** The running/paused session, or one that finished in the last 2 hours (to show its summary). */
function focus_current(): ?array
{
    $row = q("SELECT * FROM v2_focus_sessions WHERE status IN ('running','paused') ORDER BY updated_at DESC LIMIT 1")->fetch();
    if (!$row) {
        $row = q('SELECT * FROM v2_focus_sessions WHERE ended_at > ? ORDER BY ended_at DESC LIMIT 1', [now_ms() - 2 * 3600000])->fetch();
    }
    if (!$row) return null;
    $state = json_decode($row['state'], true);
    $state['version'] = (int)$row['version'];
    return $state;
}

/** Credits newly-completed work time to the stats log and to each task. */
function focus_log_work(array $row, array $state, int $now): void
{
    $sim = focus_simulate($state, $now);
    $done = (int)floor($sim['workDoneSec']);
    $logged = (int)$row['logged_work_sec'];
    $delta = $done - $logged;
    if ($delta <= 0) return;
    $taskUids = array_values(array_filter((array)($state['taskUids'] ?? []), 'is_uuid'));
    q('INSERT INTO v2_focus_log (session_uid, log_date, work_sec, task_uids, logged_at) VALUES (?, ?, ?, ?, ?)', [
        $state['uid'], local_date_for_ms($now), $delta, json_encode($taskUids), $now,
    ]);
    q('UPDATE v2_focus_sessions SET logged_work_sec = ? WHERE uid = ?', [$done, $state['uid']]);
    if ($taskUids) {
        $share = intdiv($delta, count($taskUids));
        // Side effect of someone else's op: attribute to the server so the
        // originating device does not skip it as its own echo.
        $cid = $GLOBALS['CLIENT_ID'];
        $GLOBALS['CLIENT_ID'] = 'server';
        foreach ($taskUids as $tu) {
            q('UPDATE tasks SET tracked_sec = tracked_sec + ?, updated_at = ? WHERE uid = ?', [$share, $now, $tu]);
            if ($t = load_task($tu)) record_change('task', $tu, 'upsert', $t);
        }
        $GLOBALS['CLIENT_ID'] = $cid;
    }
}

function focus_clean_state(array $s): array
{
    $status = in_array($s['status'] ?? '', ['running', 'paused', 'completed', 'cancelled'], true) ? $s['status'] : 'running';
    return [
        'uid' => v_uid($s['uid'] ?? null),
        'taskUids' => array_values(array_filter((array)($s['taskUids'] ?? []), 'is_uuid')),
        'workSec' => max(60, min(24 * 3600, (int)($s['workSec'] ?? 1500))),
        'breakEverySec' => max(0, min(12 * 3600, (int)($s['breakEverySec'] ?? 0))),
        'breakSec' => max(0, min(3 * 3600, (int)($s['breakSec'] ?? 0))),
        'status' => $status,
        'anchorAt' => (int)($s['anchorAt'] ?? now_ms()),
        'phase' => ($s['phase'] ?? 'work') === 'break' ? 'break' : 'work',
        'phaseElapsedSec' => (float)($s['phaseElapsedSec'] ?? 0),
        'workDoneSec' => max(0, (float)($s['workDoneSec'] ?? 0)),
        'workSinceBreakSec' => max(0, (float)($s['workSinceBreakSec'] ?? 0)),
        'breaksTaken' => max(0, (int)($s['breaksTaken'] ?? 0)),
        'startedAt' => (int)($s['startedAt'] ?? now_ms()),
        'endedAt' => isset($s['endedAt']) ? (int)$s['endedAt'] : null,
        'note' => isset($s['note']) ? mb_substr((string)$s['note'], 0, 200) : null,
    ];
}

function focus_save(array $state, int $version, bool $isNew): array
{
    $now = now_ms();
    $json = json_encode($state, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $ended = in_array($state['status'], ['completed', 'cancelled'], true) ? ($state['endedAt'] ?? $now) : null;
    if ($isNew) {
        q('INSERT INTO v2_focus_sessions (uid, state, status, version, logged_work_sec, started_at, ended_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)', [
            $state['uid'], $json, $state['status'], $version, $state['startedAt'], $ended, $now,
        ]);
    } else {
        q('UPDATE v2_focus_sessions SET state = ?, status = ?, version = ?, ended_at = ?, updated_at = ? WHERE uid = ?', [
            $json, $state['status'], $version, $ended, $now, $state['uid'],
        ]);
    }
    $state['version'] = $version;
    focus_schedule_pushes($state);
    record_change('focus', $state['uid'], 'upsert', $state);
    return $state;
}

/**
 * focus.set — optimistic concurrency: the client sends the version it based
 * its change on; if another device changed the session first, we return the
 * current state and the client re-applies its action on top.
 */
function op_focus_set(array $d): array
{
    $now = now_ms();
    $state = focus_clean_state($d['state'] ?? []);
    $expected = (int)($d['expectedVersion'] ?? 0);
    $existing = focus_load($state['uid']);

    if ($existing) {
        if ((int)$existing['row']['version'] !== $expected) {
            return ['conflict' => true, 'entity' => $existing['state']];
        }
        // Credit work done under the previous state before replacing it
        focus_log_work($existing['row'], $existing['state'], $now);
        $existing['row']['logged_work_sec'] = q('SELECT logged_work_sec FROM v2_focus_sessions WHERE uid = ?', [$state['uid']])->fetchColumn();
        $saved = focus_save($state, $expected + 1, false);
        if (in_array($state['status'], ['completed', 'cancelled'], true)) {
            focus_log_work($existing['row'], $state, $now);
        }
        return ['entity' => $saved];
    }

    // New session: end any other active one first (only one at a time)
    foreach (q("SELECT uid FROM v2_focus_sessions WHERE status IN ('running','paused')")->fetchAll(PDO::FETCH_COLUMN) as $other) {
        $o = focus_load($other);
        focus_log_work($o['row'], $o['state'], $now);
        $sim = focus_simulate($o['state'], $now);
        $o['state'] = array_merge($o['state'], [
            'status' => 'cancelled', 'endedAt' => $now, 'anchorAt' => $now,
            'phase' => $sim['phase'], 'phaseElapsedSec' => $sim['phaseElapsedSec'], 'workDoneSec' => $sim['workDoneSec'],
            'workSinceBreakSec' => $sim['workSinceBreakSec'], 'breaksTaken' => $sim['breaksTaken'],
        ]);
        unset($o['state']['version']);
        focus_save($o['state'], (int)$o['row']['version'] + 1, false);
    }
    return ['entity' => focus_save($state, 1, true)];
}

/** Marks running sessions whose time is up as completed (called by cron and bootstrap). */
function focus_finalize_due(): void
{
    $now = now_ms();
    foreach (q("SELECT uid FROM v2_focus_sessions WHERE status = 'running'")->fetchAll(PDO::FETCH_COLUMN) as $uid) {
        $f = focus_load($uid);
        $sim = focus_simulate($f['state'], $now);
        if (!$sim['completed']) continue;
        focus_log_work($f['row'], $f['state'], $now);
        $state = $f['state'];
        unset($state['version']);
        $state = array_merge($state, [
            'status' => 'completed', 'endedAt' => $sim['completedAt'] ?? $now, 'anchorAt' => $now,
            'workDoneSec' => (float)$state['workSec'], 'phase' => 'work', 'phaseElapsedSec' => 0,
        ]);
        focus_save($state, (int)$f['row']['version'] + 1, false);
    }
}

function fmt_minutes(float $sec): string
{
    $m = (int)round($sec / 60);
    if ($m < 60) return "{$m} min";
    $h = intdiv($m, 60);
    $r = $m % 60;
    return $r ? "{$h}h {$r}m" : "{$h}h";
}

function focus_task_names(array $state): string
{
    $uids = $state['taskUids'] ?? [];
    if (!$uids) return 'your focus session';
    $in = implode(',', array_fill(0, count($uids), '?'));
    $names = q("SELECT text FROM tasks WHERE uid IN ($in)", $uids)->fetchAll(PDO::FETCH_COLUMN);
    if (!$names) return 'your focus session';
    $first = mb_strimwidth($names[0], 0, 60, '…');
    return count($names) > 1 ? $first . ' +' . (count($names) - 1) . ' more' : $first;
}

function focus_schedule_pushes(array $state): void
{
    // Only replace alerts still in the future: one that is already due (e.g. the
    // "complete" alert when a tab marks the session done) must still go out.
    q('DELETE FROM v2_scheduled_pushes WHERE session_uid = ? AND sent_at IS NULL AND due_at > ?', [$state['uid'], now_ms() + 1500]);
    if (($state['status'] ?? '') !== 'running') return;
    $sim = focus_simulate($state, now_ms(), true);
    $names = focus_task_names($state);
    $already = q('SELECT payload FROM v2_scheduled_pushes WHERE session_uid = ?', [$state['uid']])->fetchAll(PDO::FETCH_COLUMN);
    $haveTags = array_map(fn($p) => json_decode($p, true)['tag'] ?? '', $already);
    foreach (array_slice($sim['events'], 0, 40) as $e) {
        if (in_array('focus-' . $state['uid'] . '-' . $e['tag'], $haveTags, true)) continue;
        if ($e['type'] === 'break') {
            $payload = ['title' => 'Time for a break', 'body' => 'Step away for ' . fmt_minutes($e['breakSec']) . '. ' . fmt_minutes($e['workLeftSec']) . ' of focus left.'];
        } elseif ($e['type'] === 'work') {
            $payload = ['title' => 'Break is over', 'body' => 'Back to ' . $names . '.'];
        } else {
            $payload = ['title' => 'Focus session complete', 'body' => 'You focused for ' . fmt_minutes((float)$state['workSec']) . '. Well done.'];
        }
        $payload['tag'] = 'focus-' . $state['uid'] . '-' . $e['tag'];
        $payload['url'] = './#/focus';
        q('INSERT INTO v2_scheduled_pushes (session_uid, due_at, payload) VALUES (?, ?, ?)', [$state['uid'], $e['at'], json_encode($payload)]);
    }
}

function focus_stats(string $from, string $to): array
{
    return q('SELECT log_date AS date, SUM(work_sec) AS sec FROM v2_focus_log WHERE log_date BETWEEN ? AND ? GROUP BY log_date ORDER BY log_date', [$from, $to])
        ->fetchAll(PDO::FETCH_FUNC, fn($date, $sec) => ['date' => $date, 'sec' => (int)$sec]);
}
