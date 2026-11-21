// Generates cropped brand SVGs and PWA / favicon PNGs from the brand kit.
// Run with: npm run icons
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const brand = path.resolve(here, '../../../assets/OLUBAYOSAM BRAND IDENTITY');
const out = path.resolve(here, '../public/brand');
await mkdir(out, { recursive: true });

const CARBON = '#0e0e0e';

/** Finds the drawn bounding box of an SVG (in viewBox units) and returns a tightly cropped copy. */
async function crop(svgText, pad = 0) {
  const vb = svgText.match(/viewBox="([\d.\s-]+)"/)[1].split(/\s+/).map(Number);
  const scale = 1;
  const { info } = await sharp(Buffer.from(svgText), { density: 72 * scale })
    .png()
    .trim({ threshold: 1 })
    .toBuffer({ resolveWithObject: true });
  const x = -info.trimOffsetLeft / scale + vb[0] - pad;
  const y = -info.trimOffsetTop / scale + vb[1] - pad;
  const w = info.width / scale + pad * 2;
  const h = info.height / scale + pad * 2;
  return {
    svg: svgText.replace(/viewBox="[^"]+"/, `viewBox="${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}"`),
    w,
    h,
  };
}

const primary = await readFile(path.join(brand, 'Primay Logo/Primary Logo/Primary Logo.svg'), 'utf8');
const white = await readFile(path.join(brand, 'White Primary Logo/White Primary Logo.svg'), 'utf8');
const submark = await readFile(path.join(brand, 'Submark Logo/Submark Logo (Gold).svg'), 'utf8');

const wordDark = await crop(primary, 4);
const wordLight = await crop(white, 4);
await writeFile(path.join(out, 'wordmark-on-light.svg'), wordDark.svg);
await writeFile(path.join(out, 'wordmark-on-dark.svg'), wordLight.svg);

const mark = await crop(submark, 6);
await writeFile(path.join(out, 'submark.svg'), mark.svg);
await writeFile(path.resolve(here, '../public/favicon.svg'), mark.svg);

/** Gold submark centred on a carbon square. `inset` = fraction of the icon the mark may use. */
async function appIcon(size, inset, rounded) {
  const markW = Math.round(size * inset);
  const markPng = await sharp(Buffer.from(mark.svg), { density: 600 }).resize({ width: markW, height: markW, fit: 'inside' }).png().toBuffer();
  const r = rounded ? Math.round(size * 0.22) : 0;
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="${CARBON}"/></svg>`);
  return sharp(bg).composite([{ input: markPng, gravity: 'centre' }]).png().toBuffer();
}

const icons = [
  ['icon-192.png', 192, 0.62, false],
  ['icon-512.png', 512, 0.62, false],
  ['icon-maskable-512.png', 512, 0.5, false],
  ['apple-touch-icon.png', 180, 0.6, false],
  ['favicon-32.png', 32, 0.86, true],
  ['badge-96.png', 96, 0.9, false],
];
for (const [name, size, inset, rounded] of icons) {
  await writeFile(path.resolve(here, '../public', name), await appIcon(size, inset, rounded));
}
// Monochrome badge for Android notification bar (white on transparent)
const badge = await sharp(Buffer.from(mark.svg.replace(/#c9a24d/gi, '#ffffff')), { density: 600 })
  .resize({ width: 96, height: 96, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
await writeFile(path.resolve(here, '../public/badge-96.png'), badge);

console.log('wordmark', Math.round(wordDark.w), 'x', Math.round(wordDark.h), '| submark', Math.round(mark.w), 'x', Math.round(mark.h));
