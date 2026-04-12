import puppeteer from 'puppeteer';
import { readdirSync } from 'fs';
import { resolve, basename } from 'path';

const memesDir = resolve(import.meta.dirname);
const outDir = resolve(memesDir, 'png');
const htmlFiles = readdirSync(memesDir).filter(f => f.endsWith('.html')).sort();

const browser = await puppeteer.launch({ headless: true });

for (const file of htmlFiles) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 2 });
  await page.goto(`file://${resolve(memesDir, file)}`, { waitUntil: 'networkidle0' });

  const name = basename(file, '.html') + '.png';
  const clip = { x: 0, y: 0, width: 1080, height: 1080 };
  await page.screenshot({ path: resolve(outDir, name), clip, type: 'png' });
  console.log(`✓ ${name}`);
  await page.close();
}

await browser.close();
console.log(`\nDone — ${htmlFiles.length} PNGs saved to memes/png/`);
