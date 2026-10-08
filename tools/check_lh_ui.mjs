// בדיקת עשן ל"הקו בזמן" — נולדה עם תיקוני פאנל שלב ב.
//
// בודקת: הדף עולה בלי חריגות · "מה השתנה לאחרונה" מוצג · האינדקס הכבד
// לא חוסם את המסך (סעיף 12) · "שינויים לפי יום" נפתח על החודש הנוכחי
// ולא על מרץ 2017 (סעיף 1) · חיפוש עם גרשיים מוצא תוצאות (סעיף 3) ·
// טאב התחנות עולה. הכל מוגש מקומית: React מ-vendor, לפלט בסטאב Proxy.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { createRequire } from 'module';

const ROOT = process.cwd();
const require_ = createRequire(path.join(process.env.PW_MODULES || ROOT, 'noop.js'));
const { chromium } = require_('playwright-core');
const fail = (msg) => { console.error('❌', msg); process.exit(1); };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.jsx': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  try {
    const p = path.join(ROOT, rel.startsWith('line-history') || rel.startsWith('magihim') || rel.startsWith('vendor') ? '' : 'line-history', rel);
    let body = fs.readFileSync(p);
    if (p.endsWith('index.html')) body = Buffer.from(body.toString().replace(/\s(integrity|crossorigin)="[^"]*"/g, ''));
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const port = srv.address().port;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox'],
});

// הבדיקות הקיימות רצות על התצוגה הקודמת (המלאה), שנשארה זמינה מהתפריט ⋯; התצוגה החדשה נבדקת בנפרד
const _rawNewPage = browser.newPage.bind(browser);
{ const _np = browser.newPage.bind(browser);
  browser.newPage = async (...a) => { const p = await _np(...a); await p.addInitScript(() => { try { localStorage.lhLite = '0'; } catch (e) {} }); return p; }; }
// דף בתצוגה החדשה, עם אותן הפניות כמו הדף הראשי
const _newLitePage = async (opts) => {
  const p = await _rawNewPage(opts);
  await p.route('**://unpkg.com/**', (r) => {
    const u = r.request().url();
    if (u.endsWith('.css')) return r.fulfill({ contentType: 'text/css', body: '' });
    if (u.includes('react-dom')) return r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(ROOT, 'vendor/react-dom.development.js')) });
    if (u.includes('react')) return r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(ROOT, 'vendor/react.development.js')) });
    if (u.includes('babel')) return r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(ROOT, 'vendor/babel.min.js')) });
    return r.fulfill({ contentType: 'text/javascript', body: `(function(){var P=new Proxy(function(){},{get:function(t,k){if(k===Symbol.toPrimitive||k==='toString')return function(){return ''};return P;},apply:function(){return P;},construct:function(){return P;}});window.L=P;})();` });
  });
  await p.route('**://fonts.g**/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await p.route('**://*.tile.openstreetmap.org/**', (r) => r.fulfill({ body: Buffer.from([]) }));
  return p;
};
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 140)));
await page.route('**://unpkg.com/**', (r) => {
  const u = r.request().url();
  if (u.endsWith('.css')) return r.fulfill({ contentType: 'text/css', body: '' });
  if (u.includes('react-dom')) return r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(ROOT, 'vendor/react-dom.development.js')) });
  if (u.includes('react')) return r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(ROOT, 'vendor/react.development.js')) });
  if (u.includes('babel')) return r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(ROOT, 'vendor/babel.min.js')) });
  return r.fulfill({ contentType: 'text/javascript', body: `(function(){var P=new Proxy(function(){},{get:function(t,k){if(k===Symbol.toPrimitive||k==='toString')return function(){return ''};return P;},apply:function(){return P;},construct:function(){return P;}});window.L=P;})();` });
});
await page.route('**://fonts.g**/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
await page.route('**://*.tile.openstreetmap.org/**', (r) => r.fulfill({ body: Buffer.from([]) }));

await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' });
// המסך חייב להופיע גם לפני שהאינדקס הכבד הגיע — ואחריו הפיד האחרון
await page.waitForSelector('.tabs', { timeout: 120000 }).catch(() => fail('הטאבים לא הופיעו — האתר עדיין חסום על האינדקס'));
await page.waitForSelector('.recent .dayhead', { timeout: 120000 }).catch(() => fail('"מה השתנה לאחרונה" לא נטען'));
const firstDay = await page.locator('.recent .dayhead').first().textContent();
console.log('✓ מסך הבית עלה · היום הראשון בפיד:', firstDay.split('·')[0].trim());

// חיפוש עם גרשיים (סעיף 3): בנתונים כתוב רשל''צ בשני גרשים
await page.locator('.search').first().fill('רשל"צ');
await page.waitForTimeout(1200);
const hits = await page.locator('.llist .lrow').count();
console.log('✓ חיפוש רשל"צ (גרשיים):', hits, 'תוצאות');
if (!hits) fail('נירמול הגרשיים לא עובד — אפס תוצאות על רשל"צ');
await page.locator('.search').first().fill('');
await page.waitForTimeout(600);

// "שינויים לפי יום" נפתח על החודש הנוכחי ולא על מרץ 2017 (סעיף 1)
await page.locator('button:has-text("שינויים לפי יום")').first().click();
await page.waitForSelector('.dayhead', { timeout: 60000 }).catch(() => fail('הפיד היומי לא נטען'));
const onChip = await page.locator('.months .mchip.on').first().textContent();
if (onChip.includes('2017')) fail('הפיד היומי עדיין נפתח על 2017 (צ׳יפ פעיל: ' + onChip + ')');
console.log('✓ הפיד היומי נפתח על:', onChip.trim());
await page.locator('button:has-text("חזרה לחיפוש הקווים")').click();

// טאב תחנות
await page.locator('button.tab:has-text("תחנות")').click();
await page.waitForSelector('.slist .srow, .slist .sgroup', { timeout: 60000 }).catch(() => fail('טאב התחנות לא נטען'));
const srows = await page.locator('.slist .srow').count();
console.log('✓ טאב התחנות:', srows, 'שורות');

// רגרסיה לבאג הדף הלבן שמצא שלמה: קישור ישיר לקו נפתח בזמן שהאינדקס
// הכבד (3.6MB) עדיין בדרך — עמוד הקו חייב לעלות בלי לקרוס
const page2 = await browser.newPage();
const errs2 = [];
page2.on('pageerror', (e) => errs2.push(e.message.slice(0, 140)));
await page2.route('**://unpkg.com/**', (r) => {
  const u = r.request().url();
  if (u.endsWith('.css')) return r.fulfill({ contentType: 'text/css', body: '' });
  if (u.includes('babel')) return r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(ROOT, 'vendor/babel.min.js')) });
  return r.fulfill({ contentType: 'text/javascript', body: `(function(){var P=new Proxy(function(){},{get:function(t,k){if(k===Symbol.toPrimitive||k==='toString')return function(){return ''};return P;},apply:function(){return P;},construct:function(){return P;}});window.L=P;})();` });
});
await page2.route('**://fonts.g**/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
await page2.route('**://*.tile.openstreetmap.org/**', (r) => r.fulfill({ body: Buffer.from([]) }));
await page2.route('**/data/lines.json*', async (r) => { await new Promise((res) => setTimeout(res, 3000)); r.continue(); });
await page2.goto(`http://127.0.0.1:${port}/index.html#82001-2-0`, { waitUntil: 'domcontentloaded' });
await page2.waitForSelector('.linehead .badge', { timeout: 60000 })
  .catch(() => fail('קישור ישיר לקו לא נפתח בזמן שהאינדקס בדרך (רגרסיית הדף הלבן)'));
if (errs2.length) fail('חריגות JS בקישור ישיר: ' + errs2.slice(0, 3).join(' | '));
console.log('✓ קישור ישיר לקו עולה גם לפני שהאינדקס הגיע (הבאג של שלמה תוקן)');

// ---- התצוגה החדשה (ברירת המחדל באתר; שלמה 08.10) ----
{
  const p3 = await _newLitePage({ viewport: { width: 390, height: 844 } });   // טלפון
  const e3 = [];
  p3.on('pageerror', (e) => e3.push(e.message.slice(0, 140)));
  await p3.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' });
  await p3.waitForSelector('.lite-recent .dayhead', { timeout: 120000 }).catch(() => fail('תצוגה חדשה: סיכום היום לא הופיע'));
  if (await p3.isVisible('header .stats')) fail('תצוגה חדשה: שורת המספרים עדיין מוצגת');
  await p3.click('.dmore');
  await p3.waitForSelector('.lmitem:has-text("לתצוגה הקודמת")', { timeout: 10000 }).catch(() => fail('תצוגה חדשה: אין מעבר לתצוגה הקודמת בתפריט'));
  await p3.click('.lmx');
  await p3.locator('.lite-recent .lrow').first().click();
  // עמוד הקו בעיצוב הקודם גם בתצוגה החדשה (שלמה 08.10), עם סרגל הקטגוריות; לו"ז/תגבור/רישום כבויים כברירת מחדל
  await p3.waitForSelector('.linewrap .linehead', { timeout: 60000 }).catch(() => fail('תצוגה חדשה: עמוד הקו לא נפתח'));
  if (await p3.locator('.linewrap.lt').count()) fail('תצוגה חדשה: עמוד הקו עדיין בעיצוב "הקל"');
  await p3.waitForSelector('.tl .ev', { state: 'visible', timeout: 30000 }).catch(() => fail('תצוגה חדשה: רשימת השינויים ריקה'));
  if (await p3.locator('.kfilter').count() && !(await p3.isVisible('.kfilter'))) fail('תצוגה חדשה: סרגל הקטגוריות מוסתר בעמוד הקו');
  await p3.click('.dmore'); await p3.click('.lmitem:has-text("לתצוגה הקודמת")');
  await p3.waitForSelector('header .stats', { state: 'visible', timeout: 10000 }).catch(() => fail('המעבר לתצוגה הקודמת לא החזיר את שורת המספרים'));
  if (e3.length) fail('חריגות JS בתצוגה החדשה: ' + e3.slice(0, 3).join(' | '));
  console.log('✓ תצוגה חדשה: סיכום היום, תפריט, עמוד קו בעיצוב הקודם ומעבר לתצוגה הקודמת');
}

// "שינויים לפי יום" בתצוגה החדשה: אותו עיצוב שורה כמו בדף הראשי (שלמה 08.10)
{
  const p4 = await _newLitePage();
  await p4.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' });
  await p4.waitForSelector('.lite-recent .recmore', { timeout: 120000 }).catch(() => fail('תצוגה חדשה: אין כפתור לכל השינויים של היום'));
  await p4.click('.lite-recent .recmore');
  await p4.waitForSelector('.lrow.lite-row', { timeout: 60000 }).catch(() => fail('לפי יום: השורות לא בעיצוב של הדף הראשי'));
  const t = await p4.locator('.lrow.lite-row .ldest').first().innerText();
  if (t.includes('<->')) fail('לפי יום: הכותרת עדיין שם המסלול הגולמי: ' + t.slice(0, 80));
  const kLast = await p4.locator('.lrow.lite-row').first().evaluate((a) => a.lastElementChild.classList.contains('k') || !!a.querySelector('.ldest + .k'));
  if (!kLast) fail('לפי יום: סוג השינוי לא אחרי הכותרת');
  console.log('✓ לפי יום בתצוגה החדשה: "' + t.split('\n')[0].slice(0, 40) + '"');
  await p4.close();
}

if (errs.length) fail('חריגות JS: ' + errs.slice(0, 3).join(' | '));
console.log('✅ בדיקת הקו בזמן עברה');
await browser.close();
srv.close();
process.exit(0);
