<?php
// c:\Users\oluba\Documents\projects\todo\loadEnv.php

function loadEnv($path)
{
    if (!is_readable($path)) {
        throw new \RuntimeException(sprintf('%s not found or not readable.', $path));
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) {
            continue;
        }

        list($name, $value) = explode('=', $line, 2);
        $name = trim($name);
        $value = trim(trim($value), '"'); // Trim whitespace and quotes

        if (!array_key_exists($name, $_SERVER) && !array_key_exists($name, $_ENV)) {
            putenv(sprintf('%s=%s', $name, $value));
            $_ENV[$name] = $value;
        }
    }
}