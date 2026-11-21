<?php
declare(strict_types=1);

/**
 * Loads the nearest .env file, walking up from the api/ folder.
 * On the server this finds the existing v1 .env in public_html, so v2 shares
 * the same database and passphrase without duplicating secrets.
 */
function load_env(): void
{
    static $loaded = false;
    if ($loaded) return;
    $loaded = true;

    $dir = realpath(__DIR__ . '/..');
    for ($i = 0; $i < 4 && $dir; $i++) {
        $file = $dir . DIRECTORY_SEPARATOR . '.env';
        if (is_readable($file)) {
            foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                $line = trim($line);
                if ($line === '' || $line[0] === '#' || strpos($line, '=') === false) continue;
                [$name, $value] = explode('=', $line, 2);
                $name = trim($name);
                $value = trim(trim($value), "\"'");
                if (!array_key_exists($name, $_ENV)) {
                    $_ENV[$name] = $value;
                }
            }
            return;
        }
        $parent = dirname($dir);
        if ($parent === $dir) break;
        $dir = $parent;
    }
    throw new RuntimeException('.env file not found');
}

function env(string $key, ?string $default = null): ?string
{
    if (array_key_exists($key, $_ENV)) return (string)$_ENV[$key];
    $v = getenv($key);
    return $v === false ? $default : $v;
}
