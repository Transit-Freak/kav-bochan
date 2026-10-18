// צילומי מסך של הקו המודיע (זמני — לא נכנס ל-main)
import { chromium } from 'playwright';
import fs from 'fs';
const ids = JSON.parse(fs.readFileSync('tools/_probe/pick.json', 'utf8'));
const b = await chromium.launch();
async function shot(url, file, w, h, full = false, wait = 3500) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await p.goto('http://localhost:8000/' + url, { waitUntil: 'networkidle' }).catch(() => {});
  await p.waitForTimeout(wait);
  await p.screenshot({ path: 'shots/' + file, fullPage: full });
  await p.close();
}
fs.mkdirSync('shots', { recursive: true });
await shot('alerts/', 'list.png', 1400, 900);
for (const [i, id] of ids.entries()) await shot('alerts/#' + id, `d${i}.png`, 1400, 1000, true);
await shot('alerts/#' + ids[0], 'm-detail.png', 390, 844, true);
await shot('alerts/', 'm-list.png', 390, 844);
await shot('tools/_probe/card.html', 'card.png', 900, 560, false, 2500);
await b.close();
