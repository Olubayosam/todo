<?php
declare(strict_types=1);

const MUSIC_TYPES = [
    'mp3' => 'audio/mpeg',
    'm4a' => 'audio/mp4',
    'aac' => 'audio/aac',
    'ogg' => 'audio/ogg',
    'oga' => 'audio/ogg',
    'opus' => 'audio/ogg',
    'wav' => 'audio/wav',
    'flac' => 'audio/flac',
    'webm' => 'audio/webm',
];

function music_dir(): string
{
    $dir = __DIR__ . '/../storage/music';
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
        // Files are only served through the authenticated stream endpoint
        file_put_contents(__DIR__ . '/../storage/.htaccess', "Require all denied\nDeny from all\n");
    }
    return $dir;
}

function music_upload(): array
{
    if (empty($_FILES['files'])) throw new ApiError('No files received. The file may exceed the server upload limit (' . ini_get('upload_max_filesize') . ').');
    $files = $_FILES['files'];
    $count = is_array($files['name']) ? count($files['name']) : 1;
    $pos = (int)q('SELECT COALESCE(MAX(position), 0) FROM v2_music_tracks')->fetchColumn();
    $out = [];
    for ($i = 0; $i < $count; $i++) {
        $name = is_array($files['name']) ? $files['name'][$i] : $files['name'];
        $tmp = is_array($files['tmp_name']) ? $files['tmp_name'][$i] : $files['tmp_name'];
        $err = is_array($files['error']) ? $files['error'][$i] : $files['error'];
        $size = is_array($files['size']) ? $files['size'][$i] : $files['size'];
        if ($err !== UPLOAD_ERR_OK) throw new ApiError("Upload of {$name} failed (code {$err}).");
        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        if (!isset(MUSIC_TYPES[$ext])) throw new ApiError("{$name} is not a supported audio file.");
        $uid = uuid4();
        $filename = $uid . '.' . $ext;
        if (!move_uploaded_file($tmp, music_dir() . '/' . $filename)) throw new ApiError("Could not store {$name}.", 500);
        $title = mb_substr(trim(preg_replace('/[_]+/', ' ', pathinfo($name, PATHINFO_FILENAME))), 0, 255) ?: 'Untitled';
        q('INSERT INTO v2_music_tracks (uid, title, filename, mime, size_bytes, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
            $uid, $title, $filename, MUSIC_TYPES[$ext], (int)$size, ++$pos, now_ms(),
        ]);
        $entity = ser_music(q('SELECT * FROM v2_music_tracks WHERE uid = ?', [$uid])->fetch());
        record_change('music', $uid, 'upsert', $entity);
        $out[] = $entity;
    }
    return $out;
}

function music_stream(string $uid): void
{
    $row = q('SELECT * FROM v2_music_tracks WHERE uid = ?', [$uid])->fetch();
    $path = $row ? music_dir() . '/' . basename($row['filename']) : null;
    if (!$path || !is_file($path)) throw new ApiError('Track not found', 404);

    $size = filesize($path);
    $start = 0;
    $end = $size - 1;
    header('Content-Type: ' . $row['mime']);
    header('Accept-Ranges: bytes');
    header('Cache-Control: private, max-age=86400');
    if (isset($_SERVER['HTTP_RANGE']) && preg_match('/bytes=(\d*)-(\d*)/', $_SERVER['HTTP_RANGE'], $m)) {
        if ($m[1] === '' && $m[2] !== '') {
            $start = max(0, $size - (int)$m[2]);
        } else {
            $start = (int)$m[1];
            if ($m[2] !== '') $end = min($end, (int)$m[2]);
        }
        if ($start > $end || $start >= $size) {
            http_response_code(416);
            header("Content-Range: bytes */{$size}");
            exit;
        }
        http_response_code(206);
        header("Content-Range: bytes {$start}-{$end}/{$size}");
    }
    header('Content-Length: ' . ($end - $start + 1));
    while (ob_get_level()) ob_end_clean();
    $fh = fopen($path, 'rb');
    fseek($fh, $start);
    $left = $end - $start + 1;
    while ($left > 0 && !feof($fh) && !connection_aborted()) {
        $chunk = fread($fh, (int)min(65536, $left));
        echo $chunk;
        flush();
        $left -= strlen($chunk);
    }
    fclose($fh);
    exit;
}
