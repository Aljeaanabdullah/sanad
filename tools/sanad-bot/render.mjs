// Renders the Sanad bot SVGs (tools/sanad-bot/svg, from build.py) to the PNGs the app and the panel use.
// Uses sharp from apps/admin/node_modules. Run from the repo root: node tools/sanad-bot/render.mjs
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const sharp = createRequire(join(root, 'apps/admin/package.json'))('sharp');
const svg = (n) => join(here, 'svg', n);
const mobile = (n) => join(root, 'apps/mobile/assets', n);
const admin = (n) => join(root, 'apps/admin', n);
mkdirSync(mobile('bot'), { recursive: true });
mkdirSync(admin('public/brand'), { recursive: true });

const png = (file, size) => sharp(svg(file), { density: 72 * (size / 1024) * 1.0 }).resize(size, size).png();

// Mobile app icon (iOS needs no transparency) and web favicon.
await png('icon-ios.svg', 1024).flatten({ background: '#0d3b41' }).removeAlpha().toFile(mobile('icon.png'));
await png('icon-web.svg', 48).toFile(mobile('favicon.png'));
// Android adaptive icon layers; monochrome = the light parts of the head as a white silhouette.
await png('android-foreground.svg', 1024).toFile(mobile('android-icon-foreground.png'));
await png('android-background.svg', 1024).flatten({ background: '#0d3b41' }).toFile(mobile('android-icon-background.png'));
{
  const fg = await png('android-foreground.svg', 1024).toBuffer();
  const { data, info } = await sharp(fg).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    const a = data[i + 3] > 128 && lum > 90 ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = 255;
    data[i + 3] = a;
  }
  await sharp(data, { raw: info }).png().toFile(mobile('android-icon-monochrome.png'));
}
// Splash.
await png('splash.svg', 1024).toFile(mobile('splash-icon.png'));
// The animated mark's layers (shown up to 64dp; 256 px is sharp at 4x).
for (const n of ['mark-base', 'mark-eyes', 'mark-halo']) await png(`${n}.svg`, 256).toFile(mobile(`bot/${n}.png`));
// The head alone (logo next to the wordmark) and the welcome scene.
await sharp(svg('head.svg'), { density: 72 }).resize({ width: 480 }).png().toFile(mobile('bot/head.png'));
await png('scene.svg', 720).toFile(mobile('bot/scene.png'));

// Panel: favicon (rounded, transparent corners), Apple touch icon (full bleed), and the logo SVG.
await png('icon-web.svg', 512).toFile(admin('src/app/icon.png'));
await png('icon-ios.svg', 180).flatten({ background: '#0d3b41' }).toFile(admin('src/app/apple-icon.png'));
copyFileSync(svg('head.svg'), admin('public/brand/sanad-bot.svg'));

const m = await sharp(mobile('bot/head.png')).metadata();
console.log('png ok; head ratio (h/w) =', (m.height / m.width).toFixed(4));
