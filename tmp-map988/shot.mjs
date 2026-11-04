import { chromium } from 'playwright';
const b = await chromium.launch();
for (const d of ['d1', 'd2']) {
  const p = await b.newPage({ viewport: { width: 1080, height: 1400 }, deviceScaleFactor: 1 });
  p.on('request', r => { if (r.url().includes('tile.openstreetmap')) r.headers(); });
  await p.setExtraHTTPHeaders({ 'Referer': 'https://kavbochan.app/' });
  await p.goto('http://localhost:8000/map.html?d=' + d);
  await p.waitForFunction(() => document.title === 'ready', null, { timeout: 60000 });
  await p.waitForLoadState('networkidle');
  await p.waitForTimeout(2000);
  await p.screenshot({ path: `988-${d}.png`, fullPage: true });
}
await b.close();
