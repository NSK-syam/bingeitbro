/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS build script */
// Generates Capacitor asset sources (assets/*.png) from the app icon SVGs in assets/.
// Usage (repo root): node scripts/mobile/generate-asset-sources.cjs && node scripts/mobile/generate-native-assets.cjs
// (generate-native-assets.cjs is a stand-in for `@capacitor/assets generate`, whose bundled sharp needs blocked install scripts.)
// The app icon (amber "bib") is app-only; the website keeps public/bib-icon.svg.
const fs = require('fs');
const path = require('path');
const sharp = require(path.resolve('node_modules/sharp'));

const DARK = '#0A0A0C';
const AMBER = '#F5A623';
const out = 'assets';
const icon = fs.readFileSync(`${out}/app-icon.svg`);
const foreground = fs.readFileSync(`${out}/app-icon-foreground.svg`);

const render = (svg, size) => sharp(svg, { density: Math.ceil((72 * size) / 1024) * 2 }).resize(size, size).png();
const rounded = async (size) => {
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${Math.round(size * 0.2237)}" fill="#fff"/></svg>`);
  return sharp(await render(icon, size).toBuffer()).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
};

(async () => {
  // icon-only: full bleed, no alpha (App Store requirement)
  await render(icon, 1024).flatten({ background: AMBER }).removeAlpha().toFile(`${out}/icon-only.png`);
  // Android adaptive layers: solid amber background + transparent mark inside the safe zone
  await sharp({ create: { width: 1024, height: 1024, channels: 3, background: AMBER } }).png().toFile(`${out}/icon-background.png`);
  await render(foreground, 1024).toFile(`${out}/icon-foreground.png`);
  // splash: rounded icon centred on the dark launch background
  const splashIcon = await rounded(Math.round(2732 * 0.3));
  for (const name of ['splash.png', 'splash-dark.png']) {
    await sharp({ create: { width: 2732, height: 2732, channels: 3, background: DARK } })
      .composite([{ input: splashIcon, gravity: 'center' }])
      .flatten({ background: DARK })
      .removeAlpha()
      .png()
      .toFile(`${out}/${name}`);
  }
  console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });
