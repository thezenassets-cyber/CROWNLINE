// Creates WebP versions of the JPEG images in public/images and re-encodes oversized JPEGs.
// Usage: npm run assets:optimize
import { readdir, stat, copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../../', import.meta.url));
const imagesDir = join(root, 'public', 'images');
const fontsDir = join(root, 'public', 'fonts');

const FONTS = [
  ['@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', 'inter-latin-wght-normal.woff2'],
  ['@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2', 'source-serif-4-latin-wght-normal.woff2'],
] as const;

await mkdir(fontsDir, { recursive: true });
for (const [from, to] of FONTS) {
  await copyFile(join(root, 'node_modules', from), join(fontsDir, to));
  console.log(`font  ${to}`);
}

for (const name of (await readdir(imagesDir)).filter((f) => f.endsWith('.jpg'))) {
  const src = join(imagesDir, name);
  const webp = src.replace(/\.jpg$/, '.webp');
  const before = (await stat(src)).size;
  await sharp(src).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 74, effort: 5 }).toFile(webp);
  const after = (await stat(webp)).size;
  console.log(`image ${name}: ${Math.round(before / 1024)} KB jpg -> ${Math.round(after / 1024)} KB webp`);
}
