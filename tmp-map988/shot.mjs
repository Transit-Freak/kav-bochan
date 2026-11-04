import { chromium } from 'playwright';
const b = await chromium.launch();
for (const d of ['d1', 'd2']) {
  // חלון גבוה מספיק לכל הדף — צילום fullPage משנה את גודל החלון, ו-Leaflet איבד בזה את שכבת הקווים
  const p = await b.newPage({ viewport: { width: 1080, height: 2400 }, deviceScaleFactor: 1 });
  await p.setExtraHTTPHeaders({ 'Referer': 'https://kavbochan.app/' });
  await p.goto('http://localhost:8000/map.html?d=' + d);
  await p.waitForFunction(() => document.title === 'ready', null, { timeout: 60000 });
  await p.waitForLoadState('networkidle');
  await p.waitForTimeout(2500);
  const n = await p.evaluate(() => document.querySelectorAll('.leaflet-overlay-pane path').length);
  const h = await p.evaluate(() => Math.ceil(document.body.getBoundingClientRect().height));
  console.log(d, 'paths', n, 'height', h);
  if (n < 2) throw new Error('route lines missing');
  await p.screenshot({ path: `988-${d}.png`, clip: { x: 0, y: 0, width: 1080, height: h } });
}
await b.close();
