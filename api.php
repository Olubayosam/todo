<?php
// c:\Users\oluba\Documents\projects\todo\api.php

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET,POST,PUT,DELETE");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

require_once 'loadEnv.php';

try {
    loadEnv(__DIR__ . '/.env');
    require_once 'dbConfig.php';
    $pdo = new PDO($dsn, $user, $pass, $options);
} catch (\RuntimeException | \PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server setup or database connection error.']);
    exit;
}

if (!function_exists('getallheaders')) {
    function getallheaders() {
       $headers = [];
       foreach ($_SERVER as $name => $value) {
           if (substr($name, 0, 5) == 'HTTP_') {
               $headers[str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($name, 5)))))] = $value;
           }
       }
       return $headers;
    }
}

function syncPassphrase($pdo) {
    $passphrase = $_ENV['PASSPHRASE'] ?? null;
    if (!$passphrase) {
        throw new \Exception("PASSPHRASE not set in .env file.");
    }

    $stmt = $pdo->prepare("SELECT setting_value FROM settings WHERE setting_key = 'passphrase_hash'");
    $stmt->execute();
    $storedHash = $stmt->fetchColumn();

    if ($storedHash && password_verify($passphrase, $storedHash)) {
        return; // Passphrase is up to date
    }

    $newHash = password_hash($passphrase, PASSWORD_DEFAULT);
    $upsertSql = "INSERT INTO settings (setting_key, setting_value) VALUES ('passphrase_hash', :hash1) ON DUPLICATE KEY UPDATE setting_value = :hash2";
    $stmt = $pdo->prepare($upsertSql);
    $stmt->execute([':hash1' => $newHash, ':hash2' => $newHash]);
}

function getBearerToken() {
    $headers = getallheaders();
    if (isset($headers['Authorization'])) {
        if (preg_match('/Bearer\s(\S+)/', $headers['Authorization'], $matches)) {
            return $matches[1];
        }
    }
    return null;
}

function verifyToken($pdo, $token) {
    if (!$token) return false;
    $stmt = $pdo->prepare("SELECT token FROM auth_tokens WHERE token = ? AND expires_at > NOW()");
    $stmt->execute([$token]);
    return $stmt->fetch() !== false;
}

try {
    syncPassphrase($pdo);
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server configuration error: ' . $e->getMessage()]);
    exit;
}

$action = $_GET['action'] ?? null;
$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input'), true);

// --- Public Routes ---
if ($method === 'POST' && $action === 'login') {
    $passphrase = $input['passphrase'] ?? null;
    $stmt = $pdo->prepare("SELECT setting_value FROM settings WHERE setting_key = 'passphrase_hash'");
    $stmt->execute();
    $hash = $stmt->fetchColumn();

    if ($hash && $passphrase && password_verify($passphrase, $hash)) {
        $token = bin2hex(random_bytes(32));
        $duration = $_ENV['SESSION_DURATION_DAYS'] ?? 3;
        $expires_dt = (new DateTime())->modify("+{$duration} days");
        $expires_at_db = $expires_dt->format('Y-m-d H:i:s');
        $expires_at_iso = $expires_dt->format('c'); // ISO 8601 format for JS

        $stmt = $pdo->prepare("INSERT INTO auth_tokens (token, expires_at) VALUES (?, ?)");
        $stmt->execute([$token, $expires_at_db]);

        echo json_encode(['success' => true, 'token' => $token, 'expires_at' => $expires_at_iso]);
    } else {
        http_response_code(401);
        echo json_encode(['error' => 'Invalid passphrase']);
    }
    exit;
}

$token = getBearerToken();

if ($method === 'POST' && $action === 'verify_session') {
    echo json_encode(['success' => verifyToken($pdo, $token)]);
    exit;
}

// --- Protected Routes ---
if (!verifyToken($pdo, $token)) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

if ($method === 'POST' && $action === 'logout') {
    $stmt = $pdo->prepare("DELETE FROM auth_tokens WHERE token = ?");
    $stmt->execute([$token]);
    echo json_encode(['success' => true]);
    exit;
}

if ($method === 'PUT' && $action === 'reorder') {
    if (isset($input['tasks']) && is_array($input['tasks'])) {
        try {
            $pdo->beginTransaction();
            $stmt = $pdo->prepare("UPDATE tasks SET position = ? WHERE id = ?");
            foreach ($input['tasks'] as $index => $taskId) {
                $stmt->execute([$index, $taskId]);
            }
            $pdo->commit();
            echo json_encode(['success' => true]);
        } catch (\PDOException $e) {
            $pdo->rollBack();
            http_response_code(500);
            echo json_encode(['error' => 'Database error during reorder']);
        }
    }
    exit;
}

switch ($method) { // This switch now only handles task-related actions
    case 'GET':
        // Get tasks for a specific date
        if (isset($_GET['date'])) {
            try {
                $stmt = $pdo->prepare("SELECT id, text, is_done as done, task_date, priority FROM tasks WHERE task_date = ? ORDER BY position ASC, id ASC");
                $stmt->execute([$_GET['date']]);
                $tasks = $stmt->fetchAll();
                
                // Convert 1/0 to boolean for JavaScript
                foreach ($tasks as &$task) {
                    $task['done'] = (bool)$task['done'];
                }
                echo json_encode($tasks);
            } catch (\PDOException $e) {
                http_response_code(500);
                echo json_encode(['error' => 'Database error during GET']);
            }
        }
        break;

    case 'POST':
        // Add new tasks (Batch)
        if (isset($input['tasks']) && isset($input['date'])) {
            try {
                $priority = $input['priority'] ?? 'low';
                $sql = "INSERT INTO tasks (text, is_done, task_date, priority) VALUES (:text, 0, :date, :priority)";
                $stmt = $pdo->prepare($sql);
                $newTasks = [];
                
                $pdo->beginTransaction();
                foreach ($input['tasks'] as $text) {
                    if (trim($text) === '') continue;
                    $stmt->execute([':text' => $text, ':date' => $input['date'], ':priority' => $priority]);
                    $newTasks[] = [
                        'id' => $pdo->lastInsertId(),
                        'text' => $text,
                        'done' => false,
                        'priority' => $priority
                    ];
                }
                $pdo->commit();
                echo json_encode($newTasks);
            } catch (\PDOException $e) {
                $pdo->rollBack();
                http_response_code(500);
                echo json_encode(['error' => 'Database error during POST']);
            }
        }
        break;

    case 'PUT':
        // Update task status
        if (isset($_GET['id'])) {
            try {
                if (isset($input['done'])) {
                    $stmt = $pdo->prepare("UPDATE tasks SET is_done = ? WHERE id = ?");
                    $stmt->execute([$input['done'] ? 1 : 0, $_GET['id']]);
                    echo json_encode(['success' => true]);
                } elseif (isset($input['text'])) {
                    $stmt = $pdo->prepare("UPDATE tasks SET text = ?, priority = ? WHERE id = ?");
                    $stmt->execute([$input['text'], $input['priority'] ?? 'low', $_GET['id']]);
                    echo json_encode(['success' => true]);
                }
            } catch (\PDOException $e) {
                http_response_code(500);
                echo json_encode(['error' => 'Database error during PUT']);
            }
        }
        break;

    case 'DELETE':
        // Delete task
        if (isset($_GET['id'])) {
            try {
                $stmt = $pdo->prepare("DELETE FROM tasks WHERE id = ?");
                $stmt->execute([$_GET['id']]);
                echo json_encode(['success' => true]);
            } catch (\PDOException $e) {
                http_response_code(500);
                echo json_encode(['error' => 'Database error during DELETE']);
            }
        }
        break;
}
?>
