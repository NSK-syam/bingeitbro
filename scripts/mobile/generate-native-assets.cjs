/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS build script */
// Fallback for @capacitor/assets: writes native icons/splash from assets/ using project sharp.
const fs = require('fs');
const path = require('path');
const sharp = require(path.resolve('node_modules/sharp'));
const BG = { r: 10, g: 10, b: 12 };
const RES = 'android/app/src/main/res';
const XC = 'ios/App/App/Assets.xcassets';
const svg = fs.readFileSync('public/bib-icon.svg', 'utf8');

const roundedIcon = (size) =>
  sharp(Buffer.from(svg), { density: Math.ceil((72 * size) / 256) * 2 }).resize(size, size).png().toBuffer();

async function splash(w, h, file) {
  const iconSize = Math.round(Math.min(w, h) * 0.4);
  await sharp({ create: { width: w, height: h, channels: 3, background: BG } })
    .composite([{ input: await roundedIcon(iconSize), gravity: 'center' }])
    .flatten({ background: BG })
    .removeAlpha()
    .png()
    .toFile(file);
}

(async () => {
  // iOS app icon (no alpha) and splash
  await sharp('assets/icon-only.png').flatten({ background: BG }).removeAlpha().png()
    .toFile(`${XC}/AppIcon.appiconset/AppIcon-512@2x.png`);
  for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    await splash(2732, 2732, `${XC}/Splash.imageset/${f}`);
  }

  // Android launcher icons
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, s] of Object.entries(dens)) {
    const legacy = Math.round(48 * s);
    const fg = Math.round(108 * s);
    const dir = `${RES}/mipmap-${d}`;
    // legacy square icon: rounded-rect logo (transparent corners, as the web icon)
    await sharp(await roundedIcon(legacy)).toFile(`${dir}/ic_launcher.png`);
    // legacy round icon: full-bleed icon masked to a circle
    const circle = Buffer.from(`<svg width="${legacy}" height="${legacy}"><circle cx="${legacy / 2}" cy="${legacy / 2}" r="${legacy / 2}" fill="#fff"/></svg>`);
    await sharp('assets/icon-only.png').resize(legacy, legacy)
      .composite([{ input: circle, blend: 'dest-in' }]).png().toFile(`${dir}/ic_launcher_round.png`);
    // adaptive foreground
    await sharp('assets/icon-foreground.png').resize(fg, fg).png().toFile(`${dir}/ic_launcher_foreground.png`);
  }

  // Android splash drawables (match template dimensions)
  const sizes = {
    drawable: [480, 320],
    'drawable-land-mdpi': [480, 320], 'drawable-land-hdpi': [800, 480], 'drawable-land-xhdpi': [1280, 720],
    'drawable-land-xxhdpi': [1600, 960], 'drawable-land-xxxhdpi': [1920, 1280],
    'drawable-port-mdpi': [320, 480], 'drawable-port-hdpi': [480, 800], 'drawable-port-xhdpi': [720, 1280],
    'drawable-port-xxhdpi': [960, 1600], 'drawable-port-xxxhdpi': [1280, 1920],
  };
  for (const [d, [w, h]] of Object.entries(sizes)) await splash(w, h, `${RES}/${d}/splash.png`);
  console.log('native assets written');
})().catch((e) => { console.error(e); process.exit(1); });
