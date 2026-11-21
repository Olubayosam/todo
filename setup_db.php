<?php
// c:\Users\oluba\Documents\projects\todo\setup_db.php

require_once 'loadEnv.php';

try {
    loadEnv(__DIR__ . '/.env');
    require_once 'dbConfig.php';
    $pdo = new PDO($dsn, $user, $pass, $options);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Create settings table
    $pdo->exec("CREATE TABLE IF NOT EXISTS `settings` (
      `setting_key` varchar(255) NOT NULL,
      `setting_value` text NOT NULL,
      PRIMARY KEY (`setting_key`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    echo "Table 'settings' created or already exists.<br>";

    // Create auth_tokens table
    $pdo->exec("CREATE TABLE IF NOT EXISTS `auth_tokens` (
      `token` varchar(255) NOT NULL,
      `expires_at` datetime NOT NULL,
      PRIMARY KEY (`token`),
      INDEX `expires_at_index` (`expires_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    echo "Table 'auth_tokens' created or already exists.<br>";

    // Add position column (catch exception if it already exists)
    try {
        $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `position` INT DEFAULT 0");
        echo "Column 'position' added to 'tasks'.<br>";
    } catch (PDOException $e) { }

    // Add priority column (catch exception if it already exists)
    try {
        $pdo->exec("ALTER TABLE `tasks` ADD COLUMN `priority` ENUM('low', 'medium', 'high') DEFAULT 'low'");
        echo "Column 'priority' added to 'tasks'.<br>";
    } catch (PDOException $e) { }

    echo "<h2>Database setup complete!</h2><p>You can now return to your app and safely delete this setup_db.php file.</p>";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
?>
