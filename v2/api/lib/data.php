<?php
declare(strict_types=1);

// ---------------------------------------------------------------------------
// Serialisation (DB row -> JSON shape used by the web app)
// ---------------------------------------------------------------------------

function ser_task(array $r, array $tagUids = []): array
{
    return [
        'uid' => $r['uid'],
        'text' => (string)$r['text'],
        'done' => (bool)$r['is_done'],
        'date' => $r['task_date'] ?: null,
        'priority' => $r['priority'] ?: 'low',
        'position' => (int)($r['position'] ?? 0),
        'notes' => $r['notes'] ?? null,
        'dueTime' => $r['due_time'] ?? null,
        'estimateMin' => isset($r['estimate_min']) ? (int)$r['estimate_min'] : null,
        'trackedSec' => (int)($r['tracked_sec'] ?? 0),
        'originalDate' => $r['original_date'] ?? null,
        'recurrenceUid' => $r['recurrence_uid'] ?? null,
        'completedAt' => isset($r['completed_at']) ? (int)$r['completed_at'] : null,
        'createdAt' => isset($r['created_at']) ? (int)$r['created_at'] : null,
        'updatedAt' => isset($r['updated_at']) ? (int)$r['updated_at'] : null,
        'tagUids' => $tagUids,
    ];
}

function task_tag_map(?array $taskUids = null): array
{
    if ($taskUids === []) return [];
    if ($taskUids === null) {
        $rows = q('SELECT task_uid, tag_uid FROM v2_task_tags')->fetchAll();
    } else {
        $in = implode(',', array_fill(0, count($taskUids), '?'));
        $rows = q("SELECT task_uid, tag_uid FROM v2_task_tags WHERE task_uid IN ($in)", $taskUids)->fetchAll();
    }
    $map = [];
    foreach ($rows as $r) $map[$r['task_uid']][] = $r['tag_uid'];
    return $map;
}

function load_task(string $uid): ?array
{
    // v1 inserts rows without a uid; give them one lazily
    $r = q('SELECT * FROM tasks WHERE uid = ?', [$uid])->fetch();
    if (!$r) return null;
    return ser_task($r, task_tag_map([$uid])[$uid] ?? []);
}

function ser_subtask(array $r): array
{
    return ['uid' => $r['uid'], 'taskUid' => $r['task_uid'], 'text' => $r['text'], 'done' => (bool)$r['is_done'], 'position' => (int)$r['position']];
}

function ser_tag(array $r): array
{
    return ['uid' => $r['uid'], 'name' => $r['name'], 'color' => $r['color'], 'position' => (int)$r['position']];
}

function ser_recurrence(array $r): array
{
    return [
        'uid' => $r['uid'],
        'text' => $r['text'],
        'priority' => $r['priority'],
        'notes' => $r['notes'],
        'dueTime' => $r['due_time'],
        'estimateMin' => $r['estimate_min'] !== null ? (int)$r['estimate_min'] : null,
        'tagUids' => json_decode($r['tag_uids'] ?: '[]', true) ?: [],
        'rule' => json_decode($r['rule'], true),
        'startDate' => $r['start_date'],
        'endDate' => $r['end_date'],
        'active' => (bool)$r['active'],
    ];
}

function ser_note(array $r): array
{
    return ['date' => $r['note_date'], 'content' => $r['content'], 'mood' => $r['mood'] !== null ? (int)$r['mood'] : null, 'reviewed' => (bool)$r['reviewed']];
}

function ser_music(array $r): array
{
    return ['uid' => $r['uid'], 'title' => $r['title'], 'mime' => $r['mime'], 'size' => (int)$r['size_bytes'], 'position' => (int)$r['position']];
}

function get_prefs(): array
{
    $raw = setting_get('v2.prefs');
    $p = $raw ? json_decode($raw, true) : null;
    return is_array($p) ? $p : [];
}

// ---------------------------------------------------------------------------
// Change log (drives live sync)
// ---------------------------------------------------------------------------

$GLOBALS['CLIENT_ID'] = 'server';

function record_change(string $entity, string $id, string $op, $data = null): void
{
    q('INSERT INTO v2_changes (entity, entity_id, op, data, client_id, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
        $entity, $id, $op,
        $data === null ? null : json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        $GLOBALS['CLIENT_ID'], now_ms(),
    ]);
}

function current_cursor(): int
{
    return (int)q('SELECT COALESCE(MAX(id), 0) FROM v2_changes')->fetchColumn();
}

function changes_since(int $since, int $limit = 500): array
{
    $rows = q('SELECT id, entity, entity_id, op, data, client_id FROM v2_changes WHERE id > ? ORDER BY id ASC LIMIT ' . (int)$limit, [$since])->fetchAll();
    return array_map(fn($r) => [
        'id' => (int)$r['id'],
        'entity' => $r['entity'],
        'key' => $r['entity_id'],
        'op' => $r['op'],
        'data' => $r['data'] !== null ? json_decode($r['data'], true) : null,
        'clientId' => $r['client_id'],
    ], $rows);
}

function needs_resync(int $since): bool
{
    if ($since <= 0) return false;
    $min = q('SELECT MIN(id) FROM v2_changes')->fetchColumn();
    return $min !== null && $min !== false && (int)$min > $since + 1;
}

// ---------------------------------------------------------------------------
// Dates, recurrence & rollover
// ---------------------------------------------------------------------------

function user_tz(): DateTimeZone
{
    $tz = get_prefs()['timezone'] ?? 'UTC';
    try {
        return new DateTimeZone($tz);
    } catch (Exception $e) {
        return new DateTimeZone('UTC');
    }
}

function local_date_for_ms(int $ms): string
{
    return (new DateTimeImmutable('@' . intdiv($ms, 1000)))->setTimezone(user_tz())->format('Y-m-d');
}

function days_between(string $a, string $b): int
{
    $da = new DateTimeImmutable($a . ' 00:00:00', new DateTimeZone('UTC'));
    $db = new DateTimeImmutable($b . ' 00:00:00', new DateTimeZone('UTC'));
    return (int)round(($db->getTimestamp() - $da->getTimestamp()) / 86400);
}

/** Mirror of web/src/lib/recurrence.ts — keep both in sync. */
function rule_matches(array $rule, string $start, string $date): bool
{
    if ($date < $start) return false;
    $interval = max(1, (int)($rule['interval'] ?? 1));
    $days = days_between($start, $date);
    $d = new DateTimeImmutable($date, new DateTimeZone('UTC'));
    $s = new DateTimeImmutable($start, new DateTimeZone('UTC'));
    switch ($rule['freq'] ?? 'daily') {
        case 'daily':
            return $days % $interval === 0;
        case 'weekly':
            $byDay = $rule['byDay'] ?? [(int)$s->format('w')];
            if (!in_array((int)$d->format('w'), array_map('intval', $byDay), true)) return false;
            $sMon = $s->modify('-' . (((int)$s->format('w') + 6) % 7) . ' days');
            $dMon = $d->modify('-' . (((int)$d->format('w') + 6) % 7) . ' days');
            $weeks = intdiv(days_between($sMon->format('Y-m-d'), $dMon->format('Y-m-d')), 7);
            return $weeks % $interval === 0;
        case 'monthly':
            $months = ((int)$d->format('Y') * 12 + (int)$d->format('n')) - ((int)$s->format('Y') * 12 + (int)$s->format('n'));
            if ($months % $interval !== 0) return false;
            $want = min((int)$s->format('j'), (int)$d->format('t'));
            return (int)$d->format('j') === $want;
    }
    return false;
}

/** Moves unfinished, non-recurring tasks from earlier days onto $today. */
function rollover(string $today): void
{
    $uids = q('SELECT uid FROM tasks WHERE is_done = 0 AND task_date IS NOT NULL AND task_date < ? AND recurrence_uid IS NULL', [$today])->fetchAll(PDO::FETCH_COLUMN);
    if (!$uids) return;
    $now = now_ms();
    q('UPDATE tasks SET original_date = COALESCE(original_date, task_date), task_date = ?, updated_at = ? WHERE is_done = 0 AND task_date IS NOT NULL AND task_date < ? AND recurrence_uid IS NULL', [$today, $now, $today]);
    foreach ($uids as $uid) {
        if ($t = load_task($uid)) record_change('task', $uid, 'upsert', $t);
    }
}

/** Creates today's instance of each recurring task (future ones are virtual on the client). */
function materialize_recurrences(string $date): void
{
    $recs = q('SELECT * FROM v2_recurrences WHERE active = 1 AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)', [$date, $date])->fetchAll();
    foreach ($recs as $r) {
        $rule = json_decode($r['rule'], true);
        if (!is_array($rule) || !rule_matches($rule, $r['start_date'], $date)) continue;
        $skipped = q('SELECT 1 FROM v2_recurrence_skips WHERE recurrence_uid = ? AND skip_date = ?', [$r['uid'], $date])->fetchColumn();
        if ($skipped) continue;
        $uid = uuid4();
        $now = now_ms();
        $st = q('INSERT IGNORE INTO tasks (uid, text, is_done, task_date, priority, position, notes, due_time, estimate_min, recurrence_uid, created_at, updated_at)
                 VALUES (?, ?, 0, ?, ?, 0, ?, ?, ?, ?, ?, ?)', [
            $uid, $r['text'], $date, $r['priority'], $r['notes'], $r['due_time'], $r['estimate_min'], $r['uid'], $now, $now,
        ]);
        if ($st->rowCount() === 1) {
            foreach (json_decode($r['tag_uids'] ?: '[]', true) ?: [] as $tagUid) {
                q('INSERT IGNORE INTO v2_task_tags (task_uid, tag_uid) VALUES (?, ?)', [$uid, $tagUid]);
            }
            record_change('task', $uid, 'upsert', load_task($uid));
        }
    }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

function v_text($v, int $max = 2000): string
{
    if (!is_string($v)) throw new ApiError('Text must be a string');
    $v = trim($v);
    if ($v === '') throw new ApiError('Text cannot be empty');
    return mb_substr($v, 0, $max);
}

function v_opt_text($v, int $max = 20000): ?string
{
    if ($v === null || $v === '') return null;
    if (!is_string($v)) throw new ApiError('Invalid text');
    return mb_substr($v, 0, $max);
}

function v_opt_date($v): ?string
{
    if ($v === null || $v === '') return null;
    if (!is_date($v)) throw new ApiError('Invalid date');
    return $v;
}

function v_opt_time($v): ?string
{
    if ($v === null || $v === '') return null;
    if (!is_string($v) || !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $v)) throw new ApiError('Invalid time');
    return $v;
}

function v_opt_int($v, int $min, int $max): ?int
{
    if ($v === null || $v === '') return null;
    if (!is_numeric($v)) throw new ApiError('Invalid number');
    return max($min, min($max, (int)$v));
}

function v_uid($v): string
{
    if (!is_uuid($v)) throw new ApiError('Invalid id');
    return strtolower($v);
}

function v_priority($v): string
{
    if (!in_array($v, PRIORITIES, true)) throw new ApiError('Invalid priority');
    return $v;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

function set_task_tags(string $taskUid, array $tagUids): void
{
    q('DELETE FROM v2_task_tags WHERE task_uid = ?', [$taskUid]);
    foreach (array_unique($tagUids) as $tagUid) {
        if (is_uuid($tagUid)) q('INSERT IGNORE INTO v2_task_tags (task_uid, tag_uid) VALUES (?, ?)', [$taskUid, strtolower($tagUid)]);
    }
}

function op_task_upsert(array $d): array
{
    $uid = v_uid($d['uid'] ?? null);
    $cols = [];
    if (array_key_exists('text', $d)) $cols['text'] = v_text($d['text']);
    if (array_key_exists('done', $d)) {
        $cols['is_done'] = $d['done'] ? 1 : 0;
        $cols['completed_at'] = $d['done'] ? (isset($d['completedAt']) ? (int)$d['completedAt'] : now_ms()) : null;
    }
    if (array_key_exists('date', $d)) $cols['task_date'] = v_opt_date($d['date']);
    if (array_key_exists('priority', $d)) $cols['priority'] = v_priority($d['priority']);
    if (array_key_exists('position', $d)) $cols['position'] = (int)$d['position'];
    if (array_key_exists('notes', $d)) $cols['notes'] = v_opt_text($d['notes']);
    if (array_key_exists('dueTime', $d)) $cols['due_time'] = v_opt_time($d['dueTime']);
    if (array_key_exists('estimateMin', $d)) $cols['estimate_min'] = v_opt_int($d['estimateMin'], 1, 1440);
    if (array_key_exists('originalDate', $d)) $cols['original_date'] = v_opt_date($d['originalDate']);
    if (array_key_exists('recurrenceUid', $d)) $cols['recurrence_uid'] = $d['recurrenceUid'] ? v_uid($d['recurrenceUid']) : null;
    $cols['updated_at'] = now_ms();

    $exists = q('SELECT 1 FROM tasks WHERE uid = ?', [$uid])->fetchColumn();
    $replacedUid = null;
    if (!$exists) {
        if (!isset($cols['text'])) throw new ApiError('Text is required for new tasks');
        $cols['uid'] = $uid;
        $cols['created_at'] = $cols['updated_at'];
        $cols += ['is_done' => 0, 'priority' => 'low', 'position' => 0];
        $names = array_keys($cols);
        try {
            q('INSERT INTO tasks (`' . implode('`,`', $names) . '`) VALUES (' . implode(',', array_fill(0, count($names), '?')) . ')', array_values($cols));
        } catch (PDOException $e) {
            // Another device already materialised this recurring instance: merge into it
            if ($e->getCode() !== '23000' || empty($cols['recurrence_uid'])) throw $e;
            $existing = q('SELECT uid FROM tasks WHERE recurrence_uid = ? AND task_date = ?', [$cols['recurrence_uid'], $cols['task_date'] ?? null])->fetchColumn();
            if (!$existing) throw $e;
            $replacedUid = $uid;
            $uid = $existing;
            unset($cols['uid'], $cols['created_at']);
            $sets = implode(',', array_map(fn($c) => "`$c` = ?", array_keys($cols)));
            q("UPDATE tasks SET $sets WHERE uid = ?", [...array_values($cols), $uid]);
        }
    } else {
        $sets = implode(',', array_map(fn($c) => "`$c` = ?", array_keys($cols)));
        q("UPDATE tasks SET $sets WHERE uid = ?", [...array_values($cols), $uid]);
    }
    if (array_key_exists('tagUids', $d) && is_array($d['tagUids'])) set_task_tags($uid, $d['tagUids']);

    $task = load_task($uid);
    if ($replacedUid) record_change('task', $replacedUid, 'delete');
    record_change('task', $uid, 'upsert', $task);
    return ['entity' => $task, 'replacedUid' => $replacedUid];
}

function op_task_delete(array $d): array
{
    $uid = v_uid($d['uid'] ?? null);
    $row = q('SELECT recurrence_uid, task_date FROM tasks WHERE uid = ?', [$uid])->fetch();
    if ($row && $row['recurrence_uid'] && $row['task_date']) {
        q('INSERT IGNORE INTO v2_recurrence_skips (recurrence_uid, skip_date) VALUES (?, ?)', [$row['recurrence_uid'], $row['task_date']]);
    }
    q('DELETE FROM v2_subtasks WHERE task_uid = ?', [$uid]);
    q('DELETE FROM v2_task_tags WHERE task_uid = ?', [$uid]);
    q('DELETE FROM tasks WHERE uid = ?', [$uid]);
    record_change('task', $uid, 'delete');
    return [];
}

function op_task_reorder(array $d): array
{
    $uids = $d['uids'] ?? [];
    if (!is_array($uids)) throw new ApiError('uids must be an array');
    $now = now_ms();
    foreach (array_values($uids) as $i => $uid) {
        $uid = v_uid($uid);
        q('UPDATE tasks SET position = ?, updated_at = ? WHERE uid = ?', [$i, $now, $uid]);
        if ($t = load_task($uid)) record_change('task', $uid, 'upsert', $t);
    }
    return [];
}

function op_subtask_upsert(array $d): array
{
    $uid = v_uid($d['uid'] ?? null);
    $taskUid = v_uid($d['taskUid'] ?? null);
    $row = q('SELECT * FROM v2_subtasks WHERE uid = ?', [$uid])->fetch();
    $text = array_key_exists('text', $d) ? v_text($d['text'], 1000) : ($row['text'] ?? null);
    if ($text === null) throw new ApiError('Text is required');
    $done = array_key_exists('done', $d) ? ($d['done'] ? 1 : 0) : (int)($row['is_done'] ?? 0);
    $pos = array_key_exists('position', $d) ? (int)$d['position'] : (int)($row['position'] ?? 0);
    q('REPLACE INTO v2_subtasks (uid, task_uid, text, is_done, position, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [$uid, $taskUid, $text, $done, $pos, now_ms()]);
    $entity = ser_subtask(q('SELECT * FROM v2_subtasks WHERE uid = ?', [$uid])->fetch());
    record_change('subtask', $uid, 'upsert', $entity);
    return ['entity' => $entity];
}

function op_subtask_delete(array $d): array
{
    $uid = v_uid($d['uid'] ?? null);
    q('DELETE FROM v2_subtasks WHERE uid = ?', [$uid]);
    record_change('subtask', $uid, 'delete');
    return [];
}

function op_tag_upsert(array $d): array
{
    $uid = v_uid($d['uid'] ?? null);
    $name = v_text($d['name'] ?? '', 64);
    $color = preg_match('/^[a-z]{2,12}$/', (string)($d['color'] ?? '')) ? $d['color'] : 'cyan';
    q('REPLACE INTO v2_tags (uid, name, color, position, updated_at) VALUES (?, ?, ?, ?, ?)', [$uid, $name, $color, (int)($d['position'] ?? 0), now_ms()]);
    $entity = ser_tag(q('SELECT * FROM v2_tags WHERE uid = ?', [$uid])->fetch());
    record_change('tag', $uid, 'upsert', $entity);
    return ['entity' => $entity];
}

function op_tag_delete(array $d): array
{
    $uid = v_uid($d['uid'] ?? null);
    q('DELETE FROM v2_task_tags WHERE tag_uid = ?', [$uid]);
    q('DELETE FROM v2_tags WHERE uid = ?', [$uid]);
    record_change('tag', $uid, 'delete');
    return [];
}

function op_recurrence_upsert(array $d): array
{
    $uid = v_uid($d['uid'] ?? null);
    $rule = $d['rule'] ?? null;
    if (!is_array($rule) || !in_array($rule['freq'] ?? '', ['daily', 'weekly', 'monthly'], true)) throw new ApiError('Invalid repeat rule');
    $clean = ['freq' => $rule['freq'], 'interval' => max(1, min(52, (int)($rule['interval'] ?? 1)))];
    if ($rule['freq'] === 'weekly') {
        $days = array_values(array_unique(array_filter(array_map('intval', (array)($rule['byDay'] ?? [])), fn($x) => $x >= 0 && $x <= 6)));
        if ($days) $clean['byDay'] = $days;
    }
    $start = v_opt_date($d['startDate'] ?? null);
    if (!$start) throw new ApiError('Start date required');
    q('REPLACE INTO v2_recurrences (uid, text, priority, notes, due_time, estimate_min, tag_uids, rule, start_date, end_date, active, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        $uid, v_text($d['text'] ?? ''), v_priority($d['priority'] ?? 'low'), v_opt_text($d['notes'] ?? null),
        v_opt_time($d['dueTime'] ?? null), v_opt_int($d['estimateMin'] ?? null, 1, 1440),
        json_encode(array_values(array_filter((array)($d['tagUids'] ?? []), 'is_uuid'))), json_encode($clean),
        $start, v_opt_date($d['endDate'] ?? null), isset($d['active']) && !$d['active'] ? 0 : 1, now_ms(),
    ]);
    $entity = ser_recurrence(q('SELECT * FROM v2_recurrences WHERE uid = ?', [$uid])->fetch());
    record_change('recurrence', $uid, 'upsert', $entity);
    return ['entity' => $entity];
}

function op_recurrence_delete(array $d): array
{
    $uid = v_uid($d['uid'] ?? null);
    q('DELETE FROM v2_recurrences WHERE uid = ?', [$uid]);
    q('DELETE FROM v2_recurrence_skips WHERE recurrence_uid = ?', [$uid]);
    // Detach existing instances so they behave like normal tasks from now on
    $uids = q('SELECT uid FROM tasks WHERE recurrence_uid = ?', [$uid])->fetchAll(PDO::FETCH_COLUMN);
    q('UPDATE tasks SET recurrence_uid = NULL, updated_at = ? WHERE recurrence_uid = ?', [now_ms(), $uid]);
    foreach ($uids as $t) record_change('task', $t, 'upsert', load_task($t));
    record_change('recurrence', $uid, 'delete');
    return [];
}

function op_recurrence_skip(array $d): array
{
    $uid = v_uid($d['uid'] ?? null);
    $date = v_opt_date($d['date'] ?? null);
    if (!$date) throw new ApiError('Date required');
    q('INSERT IGNORE INTO v2_recurrence_skips (recurrence_uid, skip_date) VALUES (?, ?)', [$uid, $date]);
    record_change('skip', $uid . '|' . $date, 'upsert', ['recurrenceUid' => $uid, 'date' => $date]);
    return [];
}

function op_note_upsert(array $d): array
{
    $date = v_opt_date($d['date'] ?? null);
    if (!$date) throw new ApiError('Date required');
    $row = q('SELECT * FROM v2_daily_notes WHERE note_date = ?', [$date])->fetch() ?: [];
    $content = array_key_exists('content', $d) ? v_opt_text($d['content']) : ($row['content'] ?? null);
    $mood = array_key_exists('mood', $d) ? v_opt_int($d['mood'], 1, 5) : ($row['mood'] ?? null);
    $reviewed = array_key_exists('reviewed', $d) ? ($d['reviewed'] ? 1 : 0) : (int)($row['reviewed'] ?? 0);
    q('REPLACE INTO v2_daily_notes (note_date, content, mood, reviewed, updated_at) VALUES (?, ?, ?, ?, ?)', [$date, $content, $mood, $reviewed, now_ms()]);
    $entity = ser_note(q('SELECT * FROM v2_daily_notes WHERE note_date = ?', [$date])->fetch());
    record_change('note', $date, 'upsert', $entity);
    return ['entity' => $entity];
}

function op_prefs_set(array $d): array
{
    $patch = $d['prefs'] ?? null;
    if (!is_array($patch)) throw new ApiError('prefs must be an object');
    $prefs = array_merge(get_prefs(), $patch);
    $json = json_encode($prefs, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (strlen($json) > 60000) throw new ApiError('Preferences too large');
    setting_set('v2.prefs', $json);
    record_change('prefs', 'prefs', 'upsert', $prefs);
    return ['entity' => $prefs];
}

function op_music_update(array $d): array
{
    $uid = v_uid($d['uid'] ?? null);
    if (array_key_exists('title', $d)) q('UPDATE v2_music_tracks SET title = ? WHERE uid = ?', [v_text($d['title'], 255), $uid]);
    if (array_key_exists('position', $d)) q('UPDATE v2_music_tracks SET position = ? WHERE uid = ?', [(int)$d['position'], $uid]);
    $row = q('SELECT * FROM v2_music_tracks WHERE uid = ?', [$uid])->fetch();
    if (!$row) throw new ApiError('Track not found', 404);
    record_change('music', $uid, 'upsert', ser_music($row));
    return ['entity' => ser_music($row)];
}

function op_music_delete(array $d): array
{
    $uid = v_uid($d['uid'] ?? null);
    $row = q('SELECT filename FROM v2_music_tracks WHERE uid = ?', [$uid])->fetch();
    if ($row) {
        $path = music_dir() . '/' . basename($row['filename']);
        if (is_file($path)) @unlink($path);
        q('DELETE FROM v2_music_tracks WHERE uid = ?', [$uid]);
    }
    record_change('music', $uid, 'delete');
    return [];
}

function op_push_subscribe(array $d): array
{
    $endpoint = $d['endpoint'] ?? '';
    $keys = $d['keys'] ?? [];
    if (!is_string($endpoint) || !preg_match('#^https://#', $endpoint) || empty($keys['p256dh']) || empty($keys['auth'])) {
        throw new ApiError('Invalid push subscription');
    }
    q('REPLACE INTO v2_push_subscriptions (endpoint_hash, endpoint, p256dh, auth, device, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
        hash('sha256', $endpoint), $endpoint, (string)$keys['p256dh'], (string)$keys['auth'],
        mb_substr((string)($d['device'] ?? ''), 0, 255), now_ms(),
    ]);
    return [];
}

function op_push_unsubscribe(array $d): array
{
    q('DELETE FROM v2_push_subscriptions WHERE endpoint_hash = ?', [hash('sha256', (string)($d['endpoint'] ?? ''))]);
    return [];
}

function apply_op(array $op): array
{
    $type = $op['type'] ?? '';
    $data = $op['data'] ?? [];
    if (!is_array($data)) throw new ApiError('Invalid op data');
    $handlers = [
        'task.upsert' => 'op_task_upsert',
        'task.delete' => 'op_task_delete',
        'task.reorder' => 'op_task_reorder',
        'subtask.upsert' => 'op_subtask_upsert',
        'subtask.delete' => 'op_subtask_delete',
        'tag.upsert' => 'op_tag_upsert',
        'tag.delete' => 'op_tag_delete',
        'recurrence.upsert' => 'op_recurrence_upsert',
        'recurrence.delete' => 'op_recurrence_delete',
        'recurrence.skip' => 'op_recurrence_skip',
        'note.upsert' => 'op_note_upsert',
        'prefs.set' => 'op_prefs_set',
        'focus.set' => 'op_focus_set',
        'music.update' => 'op_music_update',
        'music.delete' => 'op_music_delete',
        'push.subscribe' => 'op_push_subscribe',
        'push.unsubscribe' => 'op_push_unsubscribe',
    ];
    if (!isset($handlers[$type])) throw new ApiError("Unknown operation {$type}");
    return $handlers[$type]($data);
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

function bootstrap(?string $today): array
{
    q('UPDATE tasks SET uid = UUID() WHERE uid IS NULL');
    q('DELETE FROM v2_changes WHERE created_at < ?', [now_ms() - 14 * 86400000]);
    if ($today && is_date($today)) {
        rollover($today);
        materialize_recurrences($today);
    }
    focus_finalize_due();

    $cursor = current_cursor();
    $tags = task_tag_map();
    $tasks = array_map(fn($r) => ser_task($r, $tags[$r['uid']] ?? []), q('SELECT * FROM tasks ORDER BY task_date, position, id')->fetchAll());

    $skipFrom = $today && is_date($today) ? $today : date('Y-m-d');
    return [
        'cursor' => $cursor,
        'serverNow' => now_ms(),
        'tasks' => $tasks,
        'subtasks' => array_map('ser_subtask', q('SELECT * FROM v2_subtasks ORDER BY position')->fetchAll()),
        'tags' => array_map('ser_tag', q('SELECT * FROM v2_tags ORDER BY position, name')->fetchAll()),
        'recurrences' => array_map('ser_recurrence', q('SELECT * FROM v2_recurrences')->fetchAll()),
        'skips' => q('SELECT recurrence_uid AS recurrenceUid, skip_date AS date FROM v2_recurrence_skips WHERE skip_date >= ?', [$skipFrom])->fetchAll(),
        'notes' => array_map('ser_note', q('SELECT * FROM v2_daily_notes WHERE note_date >= DATE_SUB(CURDATE(), INTERVAL 120 DAY)')->fetchAll()),
        'prefs' => get_prefs(),
        'focus' => focus_current(),
        'music' => array_map('ser_music', q('SELECT * FROM v2_music_tracks ORDER BY position, created_at')->fetchAll()),
        'vapidPublicKey' => vapid_public_key(),
    ];
}
