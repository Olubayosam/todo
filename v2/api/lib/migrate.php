<?php
declare(strict_types=1);

/**
 * Additive, idempotent schema migrations.
 *
 * Rules: v1 (the original app) keeps running against the same database while
 * v2 is tested, so every change must be backwards compatible:
 *  - only ADD columns (with defaults) and tables, never drop or rename;
 *  - widen the priority ENUM (v1 values stay valid);
 *  - task_date becomes nullable (undated Inbox tasks), which v1 simply never queries.
 */

const SCHEMA_VERSION = 1;

function column_exists(string $table, string $column): bool
{
    return (bool)q(
        'SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [$table, $column]
    )->fetchColumn();
}

function column_type(string $table, string $column): ?string
{
    $t = q(
        'SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [$table, $column]
    )->fetchColumn();
    return $t === false ? null : (string)$t;
}

function index_exists(string $table, string $index): bool
{
    return (bool)q(
        'SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
        [$table, $index]
    )->fetchColumn();
}

function add_column(string $table, string $column, string $definition): void
{
    if (!column_exists($table, $column)) {
        db()->exec("ALTER TABLE `{$table}` ADD COLUMN `{$column}` {$definition}");
    }
}

function run_migrations(): void
{
    $pdo = db();
    // settings must exist before we can read the schema version
    $pdo->exec("CREATE TABLE IF NOT EXISTS `settings` (
        `setting_key` varchar(255) NOT NULL,
        `setting_value` text NOT NULL,
        PRIMARY KEY (`setting_key`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $current = (int)setting_get('v2.schema_version', '0');
    if ($current >= SCHEMA_VERSION) return;

    $got = (int)q("SELECT GET_LOCK('todo_v2_migrate', 15)")->fetchColumn();
    if ($got !== 1) throw new RuntimeException('Could not acquire migration lock');
    try {
        $current = (int)setting_get('v2.schema_version', '0');
        if ($current < 1) migration_1();
        setting_set('v2.schema_version', (string)SCHEMA_VERSION);
    } finally {
        q("SELECT RELEASE_LOCK('todo_v2_migrate')");
    }
}

function migration_1(): void
{
    $pdo = db();

    // --- Tables v1 created (no-ops on the live database) ---
    $pdo->exec("CREATE TABLE IF NOT EXISTS `auth_tokens` (
        `token` varchar(255) NOT NULL,
        `expires_at` datetime NOT NULL,
        PRIMARY KEY (`token`),
        INDEX `expires_at_index` (`expires_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `tasks` (
        `id` int NOT NULL AUTO_INCREMENT,
        `text` text NOT NULL,
        `is_done` tinyint(1) NOT NULL DEFAULT 0,
        `task_date` date NULL,
        `priority` enum('low','medium','high','urgent') DEFAULT 'low',
        `position` int DEFAULT 0,
        PRIMARY KEY (`id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    add_column('tasks', 'position', 'INT DEFAULT 0');
    add_column('tasks', 'priority', "ENUM('low','medium','high','urgent') DEFAULT 'low'");

    // Widen priority with 'urgent' (keeps v1's low/medium/high valid)
    $type = column_type('tasks', 'priority') ?? '';
    if (stripos($type, 'urgent') === false) {
        $pdo->exec("UPDATE `tasks` SET `priority` = 'low' WHERE `priority` IS NULL OR `priority` = ''");
        $pdo->exec("ALTER TABLE `tasks` MODIFY `priority` ENUM('low','medium','high','urgent') DEFAULT 'low'");
    }

    // Allow undated (Inbox) tasks, keeping whatever type v1 used
    $dateType = column_type('tasks', 'task_date');
    if ($dateType) {
        $pdo->exec("ALTER TABLE `tasks` MODIFY `task_date` {$dateType} NULL");
    }

    add_column('tasks', 'uid', 'CHAR(36) NULL');
    add_column('tasks', 'notes', 'TEXT NULL');
    add_column('tasks', 'due_time', 'CHAR(5) NULL');
    add_column('tasks', 'estimate_min', 'INT NULL');
    add_column('tasks', 'tracked_sec', 'INT NOT NULL DEFAULT 0');
    add_column('tasks', 'original_date', 'DATE NULL');
    add_column('tasks', 'recurrence_uid', 'CHAR(36) NULL');
    add_column('tasks', 'completed_at', 'BIGINT NULL');
    add_column('tasks', 'created_at', 'BIGINT NULL');
    add_column('tasks', 'updated_at', 'BIGINT NULL');

    $pdo->exec('UPDATE `tasks` SET `uid` = UUID() WHERE `uid` IS NULL');
    if (!index_exists('tasks', 'uq_tasks_uid')) {
        $pdo->exec('ALTER TABLE `tasks` ADD UNIQUE INDEX `uq_tasks_uid` (`uid`)');
    }
    if (!index_exists('tasks', 'uq_tasks_recurrence_date')) {
        $pdo->exec('ALTER TABLE `tasks` ADD UNIQUE INDEX `uq_tasks_recurrence_date` (`recurrence_uid`, `task_date`)');
    }
    if (!index_exists('tasks', 'idx_tasks_date')) {
        $pdo->exec('ALTER TABLE `tasks` ADD INDEX `idx_tasks_date` (`task_date`)');
    }

    // --- New v2 tables ---
    $pdo->exec("CREATE TABLE IF NOT EXISTS `v2_subtasks` (
        `uid` CHAR(36) NOT NULL,
        `task_uid` CHAR(36) NOT NULL,
        `text` TEXT NOT NULL,
        `is_done` TINYINT(1) NOT NULL DEFAULT 0,
        `position` INT NOT NULL DEFAULT 0,
        `updated_at` BIGINT NULL,
        PRIMARY KEY (`uid`),
        INDEX `idx_subtasks_task` (`task_uid`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `v2_tags` (
        `uid` CHAR(36) NOT NULL,
        `name` VARCHAR(64) NOT NULL,
        `color` VARCHAR(16) NOT NULL DEFAULT 'cyan',
        `position` INT NOT NULL DEFAULT 0,
        `updated_at` BIGINT NULL,
        PRIMARY KEY (`uid`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `v2_task_tags` (
        `task_uid` CHAR(36) NOT NULL,
        `tag_uid` CHAR(36) NOT NULL,
        PRIMARY KEY (`task_uid`, `tag_uid`),
        INDEX `idx_task_tags_tag` (`tag_uid`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `v2_recurrences` (
        `uid` CHAR(36) NOT NULL,
        `text` TEXT NOT NULL,
        `priority` VARCHAR(8) NOT NULL DEFAULT 'low',
        `notes` TEXT NULL,
        `due_time` CHAR(5) NULL,
        `estimate_min` INT NULL,
        `tag_uids` TEXT NULL,
        `rule` TEXT NOT NULL,
        `start_date` DATE NOT NULL,
        `end_date` DATE NULL,
        `active` TINYINT(1) NOT NULL DEFAULT 1,
        `updated_at` BIGINT NULL,
        PRIMARY KEY (`uid`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `v2_recurrence_skips` (
        `recurrence_uid` CHAR(36) NOT NULL,
        `skip_date` DATE NOT NULL,
        PRIMARY KEY (`recurrence_uid`, `skip_date`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `v2_changes` (
        `id` BIGINT NOT NULL AUTO_INCREMENT,
        `entity` VARCHAR(32) NOT NULL,
        `entity_id` VARCHAR(64) NOT NULL,
        `op` VARCHAR(8) NOT NULL,
        `data` MEDIUMTEXT NULL,
        `client_id` VARCHAR(64) NULL,
        `created_at` BIGINT NOT NULL,
        PRIMARY KEY (`id`),
        INDEX `idx_changes_created` (`created_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `v2_focus_sessions` (
        `uid` CHAR(36) NOT NULL,
        `state` MEDIUMTEXT NOT NULL,
        `status` VARCHAR(16) NOT NULL,
        `version` INT NOT NULL DEFAULT 1,
        `logged_work_sec` INT NOT NULL DEFAULT 0,
        `started_at` BIGINT NOT NULL,
        `ended_at` BIGINT NULL,
        `updated_at` BIGINT NOT NULL,
        PRIMARY KEY (`uid`),
        INDEX `idx_focus_status` (`status`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `v2_focus_log` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `session_uid` CHAR(36) NOT NULL,
        `log_date` DATE NOT NULL,
        `work_sec` INT NOT NULL,
        `task_uids` TEXT NULL,
        `logged_at` BIGINT NOT NULL,
        PRIMARY KEY (`id`),
        INDEX `idx_focus_log_date` (`log_date`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `v2_daily_notes` (
        `note_date` DATE NOT NULL,
        `content` TEXT NULL,
        `mood` TINYINT NULL,
        `reviewed` TINYINT(1) NOT NULL DEFAULT 0,
        `updated_at` BIGINT NULL,
        PRIMARY KEY (`note_date`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `v2_music_tracks` (
        `uid` CHAR(36) NOT NULL,
        `title` VARCHAR(255) NOT NULL,
        `filename` VARCHAR(255) NOT NULL,
        `mime` VARCHAR(64) NOT NULL,
        `size_bytes` BIGINT NOT NULL,
        `position` INT NOT NULL DEFAULT 0,
        `created_at` BIGINT NOT NULL,
        PRIMARY KEY (`uid`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `v2_push_subscriptions` (
        `endpoint_hash` CHAR(64) NOT NULL,
        `endpoint` TEXT NOT NULL,
        `p256dh` VARCHAR(255) NOT NULL,
        `auth` VARCHAR(255) NOT NULL,
        `device` VARCHAR(255) NULL,
        `created_at` BIGINT NOT NULL,
        PRIMARY KEY (`endpoint_hash`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `v2_scheduled_pushes` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `session_uid` CHAR(36) NOT NULL,
        `due_at` BIGINT NOT NULL,
        `payload` TEXT NOT NULL,
        `sent_at` BIGINT NULL,
        PRIMARY KEY (`id`),
        INDEX `idx_pushes_due` (`sent_at`, `due_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `v2_login_attempts` (
        `ip` VARCHAR(64) NOT NULL,
        `attempts` INT NOT NULL DEFAULT 0,
        `first_at` BIGINT NOT NULL,
        `locked_until` BIGINT NOT NULL DEFAULT 0,
        PRIMARY KEY (`ip`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}
