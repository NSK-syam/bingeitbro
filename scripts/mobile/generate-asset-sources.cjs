// Generates Capacitor asset sources (assets/) from public/bib-icon.svg.
// Usage (repo root): node scripts/mobile/generate-asset-sources.cjs && node scripts/mobile/generate-native-assets.cjs
// (generate-native-assets.cjs is a stand-in for `@capacitor/assets generate`, whose bundled sharp needs blocked install scripts.)
const fs = require('fs');
const path = require('path');
const sharp = require(path.resolve('node_modules/sharp'));

const BG = '#0A0A0C';
const svg = fs.readFileSync('public/bib-icon.svg', 'utf8');
const out = 'assets';
fs.mkdirSync(out, { recursive: true });

// Full-bleed variant: outer background squares instead of rounded (OS applies its own mask).
const fullBleed = svg.replace(/rx="56"/g, 'rx="0"');

// Background layer only (dark + halo), full bleed.
const bgSvg = fullBleed
  .replace(/<rect x="24"[\s\S]*<\/svg>/, '</svg>');

// Foreground: the orange tile + holes + text, on transparent, with outer layers removed.
const fgInner = svg
  .replace(/<rect width="256" height="256" rx="56" fill="#0A0A0C"\/>/, '')
  .replace(/<rect width="256" height="256" rx="56" fill="url\(#bibHalo\)"\/>/, '');

const render = (s, size) =>
  sharp(Buffer.from(s), { density: Math.ceil((72 * size) / 256) * 1 })
    .resize(size, size)
    .png();

(async () => {
  // icon-only: full bleed, flattened, no alpha
  await render(fullBleed, 1024).flatten({ background: BG }).removeAlpha().toFile(`${out}/icon-only.png`);
  // icon-background: full bleed dark + halo
  await render(bgSvg, 1024).flatten({ background: BG }).removeAlpha().toFile(`${out}/icon-background.png`);
  // icon-foreground: tile (208/256 of canvas) scaled so it sits inside the adaptive-icon safe zone (~61%).
  const tile = await render(fgInner, 1024).toBuffer(); // tile occupies 832px of 1024
  const scaled = await sharp(tile).resize(760, 760).png().toBuffer(); // tile ~ 617px => ~60%
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: scaled, gravity: 'center' }])
    .png()
    .toFile(`${out}/icon-foreground.png`);
  // splash: rounded icon centered on dark bg
  const splashIcon = await render(svg, Math.round(2732 * 0.4)).toBuffer();
  for (const name of ['splash.png', 'splash-dark.png']) {
    await sharp({ create: { width: 2732, height: 2732, channels: 3, background: BG } })
      .composite([{ input: splashIcon, gravity: 'center' }])
      .flatten({ background: BG })
      .removeAlpha()
      .png()
      .toFile(`${out}/${name}`);
  }
  console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });
