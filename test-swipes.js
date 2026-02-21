const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000');
  await page.screenshot({ path: '/Users/syam/.gemini/antigravity/brain/4a92912a-dbc0-47ca-82bf-53533d0dc5b2/media_test_swipe.png' });
  await browser.close();
})();
