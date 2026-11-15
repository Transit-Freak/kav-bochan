import fs from 'fs'; import path from 'path';
import { ROOT, loadChromium, serveStatic, launchChromium } from './lib/browser.mjs';
const chromium = loadChromium();
const { srv, port } = await serveStatic((rel) => (rel.startsWith('vendor/babel')||rel==='a11y.js')?path.join(ROOT,rel):path.join(ROOT,'skip-stops',rel), { stripSri: true, mime: { '.mjs': 'application/octet-stream' } });
const browser = await launchChromium({ chromium });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e=>errs.push(e.message.slice(0,120)));
await page.route('**://unpkg.com/**', r => {
  const u = r.request().url();
  if (u.endsWith('.css')) return r.fulfill({contentType:'text/css',body:''});
  if (u.includes('babel')) return r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(ROOT,'vendor/babel.min.js'))});
  return r.fulfill({contentType:'text/javascript',body:`(function(){var P=new Proxy(function(){},{get:function(t,k){if(k===Symbol.toPrimitive||k==='toString')return function(){return ''};return P;},apply:function(){return P;},construct:function(){return P;}});window.L=P;})();`});
});
await page.route('**://fonts.g**/**', r=>r.fulfill({contentType:'text/css',body:''}));
await page.route('**://*.tile.openstreetmap.org/**', r=>r.fulfill({body:Buffer.from([])}));
await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil:'domcontentloaded' });
await page.waitForSelector('.it', { timeout: 60000 }).catch(()=>{ console.log('❌ אין כרטיסים', errs.slice(0,3)); process.exit(1); });
const rows = await page.locator('.it').count();
// חיפוש
await page.locator('.search').fill('חיפה');
await page.waitForTimeout(700);
const after = await page.locator('.it').count();
// קישור עמוק
await page.evaluate(()=>{ location.hash = 'ק/1'; });
await page.waitForTimeout(700);
const qv = await page.locator('.search').inputValue();
// פתיחת כרטיס
await page.evaluate(()=>{ location.hash=''; });
await page.locator('.search').fill('');
await page.waitForTimeout(500);
await page.locator('.it-head').first().click();
await page.waitForSelector('.detail, .grp-list', { timeout: 10000 }).catch(()=>{ console.log('❌ הפירוט לא נפתח'); process.exit(1); });
// אם זו קבוצה — פותחים ממצא פנימי כדי להגיע לפירוט עצמו
console.log('debug: grp-list=', await page.locator('.grp-list').count(), '· detail=', await page.locator('.detail').count(), '· inner rows=', await page.locator('.grp-list .it-head').count());
if (!(await page.locator('.detail').count())) {
  await page.locator('.grp-list .it-head').first().click();
  await page.waitForSelector('.detail', { timeout: 10000 }).catch(async ()=>{ console.log('שגיאות:', errs.slice(0,4)); console.log('openKey classes:', await page.locator('.grp-list .it').first().getAttribute('class')); console.log('❌ הפירוט הפנימי לא נפתח'); process.exit(1); });
}
const shareBtn = await page.locator('button:has-text("שיתוף הממצאים")').count();
console.log(`✓ ${rows} כרטיסים · חיפוש: ${after} · קישור עמוק מילא: "${qv}" · פירוט נפתח · שיתוף: ${shareBtn>0?'כן':'לא'}`);
if (errs.length) { console.log('❌ שגיאות JS:', errs.slice(0,3)); process.exit(1); }
if (qv !== '1') { console.log('❌ הקישור העמוק לא עבד'); process.exit(1); }
console.log('✅ הקו המדלג עובר');
await browser.close(); srv.close(); process.exit(0);
