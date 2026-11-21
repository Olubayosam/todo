# Deploying v2 to Hostinger (`/todo-v2/`)

v2 runs next to the original app and uses **the same database and passcode**. Its migrations only *add* tables and columns, so v1 keeps working while you try v2.

## 1. Before you start (5 min)

1. **Back up the database.** hPanel → Databases → phpMyAdmin → select the todo database → Export → Quick → Go.
2. **PHP version.** hPanel → Advanced → PHP Configuration → choose **PHP 8.2** (8.1+ works).
   Leave the default extensions on (`openssl`, `curl`, `pdo_mysql`, `mbstring`).
3. **Upload limits (for music uploads).** PHP Configuration → PHP options:
   `upload_max_filesize = 64M`, `post_max_size = 256M`, `max_execution_time = 120`.

## 2. Upload

1. On your computer: `cd v2/web && npm install && npm run build && npm run package`
   → creates `v2/deploy/todo-v2.zip`.
2. hPanel → File Manager → `public_html` → Upload `todo-v2.zip` → right-click → **Extract**.
   You should now have `public_html/todo-v2/index.html` and `public_html/todo-v2/api/`.
3. Visit `https://<your-domain>/todo-v2/` and unlock with your usual passcode.
   The first request creates the new tables automatically.

v2 finds the existing `public_html/.env` (it searches upward from `todo-v2/api/`), so there is nothing to copy.

## 3. Protect `.env` (important — please check)

The v1 `.env` (passphrase + DB password) lives in the web root. Open
`https://<your-domain>/.env` in a private window. **If it downloads or shows text, it is public.**
Add this to the top of `public_html/.htaccess` (create the file if it doesn't exist):

```apache
<FilesMatch "^\.">
    Require all denied
</FilesMatch>
```

Reload the URL: you should get *403 Forbidden*. Also delete `public_html/setup_db.php` if it is still there.

## 4. Break alerts when the app is closed (cron)

hPanel → Advanced → **Cron Jobs** → *Custom*:

- Command: `/usr/bin/php /home/<hostinger-user>/domains/<your-domain>/public_html/todo-v2/api/cron.php`
  (File Manager shows the exact path at the top — use the folder that contains `public_html`.)
- Schedule: every minute (`* * * * *`).

Each run stays alive ~55 s and checks every 5 s, so alerts arrive within seconds. No Composer or SSH needed —
push encryption is built in.

Then on **each device**: Settings → *Break alerts* → **Turn on for this device** → *Send a test*.
On iPhone, first open the site in Safari → Share → **Add to Home Screen**, open it from the icon, then turn alerts on.

## 5. Music

- **Desktop (Chrome/Edge):** Focus mode → *My folder* → choose a folder of music. Nothing is uploaded.
- **Phone / other browsers:** Settings → *Focus music* → Upload tracks. Files go to
  `todo-v2/api/storage/music/` (not web-accessible; streamed only to a logged-in session).

## Updating to a new build

The zip never contains `.env` (so secrets never end up in a download or in git). To update:

1. Upload the new `todo-v2.zip` next to the existing folder and **Extract → overwrite** into it.
   Don't delete the old folder first — if your `.env` lives inside it, deleting the folder deletes the `.env`.
2. If you did replace the folder, put `.env` back. The API looks for it in these places, in order:
   `…/todo-v2/api/.env`, `…/todo-v2/.env`, `public_html/.env`, and the folder above `public_html`.
   Keeping it in `public_html` (or above it) means app updates can never remove it.

If something is wrong with the setup, the login screen now says so directly, for example
*"Server setup: the .env file is missing"* or *"can't connect to the database"*, and the sync dot turns red
(*Server problem*). Your changes stay saved on the device and are sent once the server is fixed.

## 6. Switching v2 to be the main app (later)

When you're happy, either point people at `/todo-v2/`, or move v1's files into a `todo-v1/` folder and
extract the zip's *contents* into `public_html` directly. Everything uses relative paths, so both work.

## Rollback

v1 is untouched. Delete `public_html/todo-v2/` to remove v2. The added tables (`v2_*`) and columns are
harmless to v1; restore the backup from step 1 only if you want them gone.

## Local development

- XAMPP (Apache + MySQL) serves the API at `http://localhost/todo-v2/api/` via an alias in
  `C:\xampp\apache\conf\httpd.conf` pointing at `v2/api`.
- `v2/api/.env` (git-ignored) holds the local settings; local passcode: `local-dev`.
- `cd v2/web && npm run dev` → http://localhost:5173 (proxies `/api` to Apache).
- Regenerate brand icons: `npm run icons`.
