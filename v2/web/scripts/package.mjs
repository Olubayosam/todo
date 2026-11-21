// Builds a ready-to-upload folder + zip for Hostinger:
//   v2/deploy/todo-v2/        (static app + api/)
//   v2/deploy/todo-v2.zip     (upload to public_html and extract)
// Run with: npm run package   (after npm run build)
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, '..');
const api = path.resolve(web, '../api');
const deploy = path.resolve(web, '../deploy');
const target = path.join(deploy, 'todo-v2');

await stat(path.join(web, 'dist/index.html')).catch(() => {
  console.error('dist/ is missing — run "npm run build" first.');
  process.exit(1);
});

await rm(deploy, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(path.join(web, 'dist'), target, { recursive: true });
await cp(api, path.join(target, 'api'), {
  recursive: true,
  // never ship local secrets or uploaded media
  filter: (src) => {
    const rel = path.relative(api, src).replace(/\\/g, '/');
    return !(rel === '.env' || rel.startsWith('storage'));
  },
});

// bsdtar (bundled with Windows 10+, macOS) writes zip with -a
execFileSync('tar', ['-a', '-c', '-f', 'todo-v2.zip', 'todo-v2'], { cwd: deploy, stdio: 'inherit' });
console.log(`\nReady: ${path.join(deploy, 'todo-v2.zip')}`);
