// בדיקת קו פח (והקו המוזהב, שיושב באותו קוד) ודף הבית בדפדפן, מול תמונה-במילים קבועה (snapshots.json).
// הדף (index.html) נטען ב-Chromium משרת מקומי קטן, עם נתונים קבועים וקטנים (tests/fixtures/kavpach — 84 קווים
// בערד, דימונה, שדרות וקרית מלאכי) במקום קובצי הנתונים של האתר. הבדיקה עוברת על הלשוניות, מסננת, מחפשת קו ועיר,
// ורושמת מה יצא: אילו קווים ברשימה ובאיזה ציון, והטקסט של הכרטיסים והטבלאות. לא משווים פיקסלים.
// הקוד שב-kavpach/src (החלקים מחוברים לפי הסדר ב-files.json) מקומפל כאן (Babel המצורף), ודף הבית הקבוע נבנה כאן מ-home/home.js — כך נבדק הקוד שב-PR,
// גם לפני שה-workflow (kavpach-build) בנה את KavPach.js ואת index.html.
// השעה בדפדפן קבועה (22.11.2026), והרשת החיצונית חסומה (גופנים, סטטיסטיקה).
//
// הרצה:   npm i --no-save playwright && node tests/kavpach/app.mjs
// עדכון:  UPDATE_SNAPSHOTS=1 node tests/kavpach/app.mjs   (אחרי שבדקתם שהשינוי רצוי — ראו README.md)
// משתנים: CHROME — הדפדפן (ברירת מחדל: Chromium של Playwright); BUNDLE=1 — לבדוק את KavPach.js ואת index.html הבנויים שבריפו;
//         ONLY=home,list,… — רק חלק מהשלבים
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..', '..');
const FIX = path.join(REPO, 'tests', 'fixtures', 'kavpach');
const SNAP = path.join(HERE, 'snapshots.json');
const { chromium } = require('playwright');

// קובצי הנתונים שהכלי טוען — כולם מהנתונים הקבועים
const DATA = ['data-lines.json', 'data-main.json', 'data-schedule.json', 'data-stops.json', 'data-benchmark.json',
  'kavpach-live.json', 'kavpach-overlap.json', 'kavpach-ridership.json', 'bus/data/deadhead.json'];
const DEPS = ['kavpach-live.json', 'kavpach-overlap.json', 'bus/data/deadhead.json'];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const XLSX_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';   // הספרייה לייצוא — מוגשת מ-vendor/

const problems = [];
const snap = {};
const bad = (where, msg) => problems.push(where + ': ' + msg);
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const on = (k) => !ONLY.length || ONLY.includes(k);

// ── kavpach/src → JS, כמו tools/build_kavpach.mjs (בלי מיזעור) ──
let built = null;
function buildJs() {
  if (built) return built;
  const c = { window: {}, self: {}, console };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(REPO, 'vendor/babel.min.js'), 'utf8'), c);
  const SRC = path.join(REPO, 'kavpach', 'src');
  c.src = JSON.parse(fs.readFileSync(path.join(SRC, 'files.json'), 'utf8')).map((f) => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n');
  built = vm.runInContext("Babel.transform(src, { presets: ['react'], filename: 'kavpach.jsx' }).code", c);
  return built;
}
// index.html עם דף הבית הקבוע בנוי מחדש מ-home/home.js ומ-versions.json (שלב 3 ב-tools/build_kavpach.mjs) —
// ב-PR שמשנה את home/ בלי להריץ את הבנייה, נבדק מה שייצא אחרי שה-workflow יבנה ב-main
function buildIndex() {
  const h = { window: {}, console };
  vm.createContext(h);
  vm.runInContext(fs.readFileSync(path.join(REPO, 'home/home.js'), 'utf8'), h);
  let ver = null;
  try { ver = JSON.parse(fs.readFileSync(path.join(REPO, 'versions.json'), 'utf8')); } catch (e) { /* בלי גרסאות */ }
  const home = h.window.KBH.html(ver);
  return fs.readFileSync(path.join(REPO, 'index.html'), 'utf8').replace(/<!-- kbh:start -->[\s\S]*?<!-- kbh:end -->/, () => '<!-- kbh:start -->\n' + home + '\n<!-- kbh:end -->');
}

// ── השרת: הריפו כמו שהוא, קובצי הנתונים מהנתונים הקבועים ──
let hits = {};            // כמה פעמים כל קובץ התבקש מאז טעינת הדף האחרונה (גם HEAD: בטעינה שנייה הנסיעות מגיעות מהקאש של הדפדפן)
let gets = {};            // רק GET
let slow = false;          // הקבצים הנלווים (חפיפות, ארכיון, נסיעות תפעוליות) מתעכבים 2 שניות
let noPre = false;        // בלי הקובץ המוכן (data-lines.json) — הדף מחשב הכל בדפדפן
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  if (!p || p.endsWith('/')) p += 'index.html';
  let body = null;
  try {
    if (p === 'KavPach.js' && !process.env.BUNDLE) body = Buffer.from(buildJs());
    else if (p === 'index.html' && !process.env.BUNDLE) body = Buffer.from(buildIndex());
    else if (p === 'data-lines.json' && noPre) body = null;
    else if (DATA.includes(p)) body = fs.readFileSync(path.join(FIX, p));
    // מתי עודכן קובץ משרד התחבורה — השורה שבתחתית הדף (version.js); בריפו הקובץ נוצר רק בצינור הלילי
    else if (p === 'line-history/data/gtfs-info.json') body = fs.readFileSync(path.join(FIX, 'gtfs-info.json'));
    // מתי עודכנו הנתונים של כל כלי (הכרטיסים בדף הבית) — נבנה רק בפריסה (tools/build_data_dates.py)
    else if (p === 'data-dates.json') body = fs.readFileSync(path.join(FIX, 'data-dates.json'));
    else if (/\.(xlsx|csv)$/.test(p)) body = null;
    else { const f = path.join(REPO, p); if (f.startsWith(REPO) && fs.statSync(f).isFile()) body = fs.readFileSync(f); }
  } catch (e) { body = null; }
  hits[p] = (hits[p] || 0) + 1;
  if (req.method === 'GET') gets[p] = (gets[p] || 0) + 1;
  if (!body) { res.writeHead(404); res.end(); return; }
  const send = () => {
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream', 'content-length': body.length, 'cache-control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  };
  if (slow && DEPS.includes(p)) setTimeout(send, 2000); else send();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', acceptDownloads: true });
await ctx.clock.setFixedTime(new Date('2026-11-22T10:00:00+02:00'));
// כרטיסים ושורות מחוץ למסך לא מצוירים בדף (content-visibility) והטקסט שלהם לא נקרא — כאן מציירים הכל,
// כדי שמה שנרשם לא יהיה תלוי בגופן ובגודל המסך
await ctx.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.vcard,.vrow{content-visibility:visible!important}'; document.head.appendChild(st); }); });
// כמה Workers (פענוח הנסיעות והתחנות) עוד עובדים — הדף סוגר כל אחד כשסיים
await ctx.addInitScript(() => {
  const W = window.Worker; if (!W) return;
  window.__kpWorkers = 0;
  window.Worker = function (...a) {
    const w = new W(...a), term = w.terminate.bind(w); let open = true;
    window.__kpWorkers++;
    w.terminate = () => { if (open) { open = false; window.__kpWorkers--; } return term(); };
    return w;
  };
});
await ctx.route((u) => !u.href.startsWith(BASE), (r) => {
  if (r.request().url() === XLSX_CDN) return r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(REPO, 'vendor/xlsx.full.min.js')) });
  return r.abort();
});

// ── דף חדש שאוסף שגיאות: חריגה בדף, console.error, קובץ מקומי שלא נמצא, ומסך "משהו השתבש" ──
let where = '';
const missOk = new Set();   // קבצים שמותר שלא יימצאו (בשלב "בלי הקובץ המוכן")
async function newPage() {
  const pg = await ctx.newPage();
  pg.setDefaultTimeout(8000);
  pg.on('pageerror', (e) => bad(where, 'שגיאה בדף — ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) bad(where, 'console.error — ' + m.text().slice(0, 300)); });
  pg.on('response', (r) => { const u = r.url(); if (u.startsWith(BASE) && r.status() >= 400 && !missOk.has(new URL(u).pathname.slice(1))) bad(where, 'קובץ לא נמצא (' + r.status() + ') — ' + decodeURIComponent(new URL(u).pathname)); });
  return pg;
}
let nav = 0;
// טעינה מלאה של הדף (כתובת חדשה בכל פעם, כדי שגם שינוי ב-# בלבד יטען מחדש)
async function open(pg, hash) { hits = {}; gets = {}; await pg.goto(BASE + '/?t=' + (++nav) + hash); }
const mainText = (pg) => pg.evaluate(() => { const m = document.querySelector('main') || document.querySelector('#root'); return m ? m.innerText : ''; });
// בקו המוזהב אין <main> — הטקסט שאחרי שורת הלשוניות
const body = (tx) => tx.slice(tx.indexOf('על המערכת') + 1);
const lines = (s) => String(s || '').replace(/[ \t ‎‏]+/g, ' ').split('\n').map((x) => x.trim()).filter(Boolean);
// מחכים שהנתונים נטענו ושהמסך נרגע: כל הקבצים שב-need התבקשו, הטקסט לא משתנה 1.2 שניות,
// ואין Worker באמצע עבודה (לזה מחכים עד 10 שניות, ואז ממשיכים בכל מקרה)
async function settle(pg, need = []) {
  const t0 = Date.now(); let last = null, since = Date.now();
  for (;;) {
    const miss = need.filter((f) => !hits[f]);
    const cur = miss.length ? null : await mainText(pg);
    if (cur !== last) { last = cur; since = Date.now(); }
    else if (cur !== null && Date.now() - since >= 1200 && (Date.now() - since >= 10000 || !(await pg.evaluate(() => window.__kpWorkers || 0)))) return;
    if (Date.now() - t0 > 60000) { bad(where, miss.length ? 'הדף לא ביקש את ' + miss.join(', ') : 'המסך לא נרגע אחרי דקה'); return; }
    await pg.waitForTimeout(200);
  }
}
const ALL_DATA = DATA.filter((f) => f !== 'kavpach-ridership.json');   // נוסעים לפי רבעון נטען רק כשכרטיס על המסך
// הכרטיסים שעל המסך: "מק"ט:ציון" (בקו המוזהב — הציון המוזהב)
const cardSeq = (pg) => pg.evaluate(() => [...document.querySelectorAll('.vcard')].map((c) => {
  const mk = [...c.querySelectorAll('span, div')].map((s) => (s.textContent.match(/^\s*מק"ט:\s*(\d+)\s*$/) || [])[1]).find(Boolean);
  return (mk || '?') + ':' + ((c.textContent.match(/(\d+)\s*\/\s*100/) || [])[1] || '?');
}));
const cardText = async (pg, i = 0) => lines(await pg.evaluate((i) => { const c = document.querySelectorAll('.vcard')[i]; if (!c) return ''; c.scrollIntoView({ block: 'center' }); return c.innerText; }, i));
// פותח את כל הרשימה ("הצג עוד קווים") ומחזיר את הכרטיסים
async function allCards(pg) {
  for (let i = 0; i < 20; i++) {
    const b = pg.locator('main button', { hasText: /^הצג עוד קווים/ });
    if (!(await b.count())) break;
    await b.first().click(); await pg.waitForTimeout(150);
  }
  return cardSeq(pg);
}
const tabClick = async (pg, base, t) => { await pg.click('a[href="#' + base + (t ? '/' + t : '') + '"]'); await pg.waitForTimeout(400); };
const scoreOf = (s) => +s.split(':')[1];
// אלגוריתם הייעול: מ"תוצאות הייעול" והלאה
const results = (tx) => tx.slice(Math.max(0, tx.indexOf('תוצאות הייעול')), Math.max(0, tx.indexOf('תוצאות הייעול')) + 90);
// הספרייה של האקסל (vendor/) — לקריאת הקובץ שהדף מוריד
const XLSX = require(path.join(REPO, 'vendor', 'xlsx.full.min.js'));
async function download(pg, clickFn) {
  const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 30000 }), clickFn()]);
  const wb = XLSX.read(fs.readFileSync(await dl.path()));
  return { name: dl.suggestedFilename(), sheets: wb.SheetNames.map((n) => ({ n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1 }) })) };
}

// ══ דף הבית: הכרטיסים מ-home/home.js, המספר במילים, וכניסה לכלי מהכרטיס ══
const WORDS = { 'עשרה': 10, 'אחד-עשר': 11, 'שנים-עשר': 12, 'שלושה-עשר': 13, 'ארבעה-עשר': 14, 'חמישה-עשר': 15, 'שישה-עשר': 16, 'שבעה-עשר': 17, 'שמונה-עשר': 18, 'תשעה-עשר': 19, 'עשרים': 20, 'עשרים ואחד': 21, 'עשרים ושניים': 22, 'עשרים ושלושה': 23, 'עשרים וארבעה': 24, 'עשרים וחמישה': 25 };
async function home() {
  where = 'דף הבית';
  const h = { window: {}, console };
  vm.createContext(h);
  vm.runInContext(fs.readFileSync(path.join(REPO, 'home/home.js'), 'utf8'), h);
  const K = h.window.KBH, tools = K.GROUPS.flatMap((g) => g.tools);
  if (WORDS[K.COUNT] == null) bad(where, 'COUNT ב-home/home.js הוא "' + K.COUNT + '" — מספר שהבדיקה לא מכירה');
  else if (WORDS[K.COUNT] !== tools.length) bad(where, 'COUNT אומר "' + K.COUNT + '" אבל ב-GROUPS יש ' + tools.length + ' כלים');
  // ה-HTML הקבוע (לפני שהסקריפטים רצים) — בנוי מאותה רשימה; עם BUNDLE=1 נבדק הקובץ שבריפו כמו שהוא
  const html = process.env.BUNDLE ? fs.readFileSync(path.join(REPO, 'index.html'), 'utf8') : buildIndex();
  const stat = ((html.match(/<!-- kbh:start -->([\s\S]*?)<!-- kbh:end -->/) || [])[1] || '');
  const statKeys = [...stat.matchAll(/<a class="card[^"]*" data-k="([^"]+)"/g)].map((m) => m[1]);
  if (statKeys.join() !== tools.map((t) => t.k).join()) bad(where, 'הכרטיסים הקבועים ב-index.html לא תואמים את home/home.js (להריץ node tools/build_kavpach.mjs): ' + statKeys.join(' '));
  if (!stat.includes(K.COUNT + ' כלים')) bad(where, 'בדף הקבוע ב-index.html לא כתוב "' + K.COUNT + ' כלים"');

  const pg = await newPage();
  await open(pg, '');
  await pg.waitForFunction(() => window.__kavpachReady && document.querySelector('#root .kbh-host .kbh'), null, { timeout: 30000 }).catch(() => bad(where, 'האפליקציה לא עלתה (אין .kbh-host בתוך #root)'));
  const got = await pg.evaluate(() => ({
    h1: (document.querySelector('.kbh .h1') || {}).textContent || '',
    cards: [...document.querySelectorAll('.kbh a.card[data-k]')].map((a) => ({ k: a.getAttribute('data-k'), n: (a.querySelector('h2') || {}).textContent || '', d: (a.querySelector('p') || {}).textContent || '', vis: a.getBoundingClientRect().height > 20, ico: !!a.querySelector('.ico svg, .ico img') })),
    parks: !!document.querySelector('.kbh .p-card[data-k="parks"]'),
    hosts: document.querySelectorAll('.kbh').length
  }));
  if (!got.h1.includes(K.COUNT + ' כלים')) bad(where, 'בכותרת כתוב "' + got.h1 + '" ולא "' + K.COUNT + ' כלים…"');
  if (got.hosts !== 1) bad(where, 'דף הבית מופיע ' + got.hosts + ' פעמים');
  if (got.cards.length !== tools.length) bad(where, 'יש ' + got.cards.length + ' כרטיסים במקום ' + tools.length);
  tools.forEach((t, i) => {
    const c = got.cards[i];
    if (!c || c.k !== t.k) { bad(where, 'כרטיס ' + (i + 1) + ': ' + (c ? c.k : 'חסר') + ' במקום ' + t.k); return; }
    if (c.n !== t.n) bad(where, 'כרטיס ' + t.k + ': השם "' + c.n + '" במקום "' + t.n + '"');
    if (!c.d.trim()) bad(where, 'כרטיס ' + t.k + ': בלי תיאור');
    if (!c.vis) bad(where, 'כרטיס ' + t.k + ' לא נראה');
    if (!c.ico) bad(where, 'כרטיס ' + t.k + ': בלי סמל');
  });
  if (!got.parks) bad(where, 'חסר הכרטיס של נגישות אזורי תעשייה');
  for (const k of ['kavpach', 'golden']) if (!tools.some((t) => t.k === k)) bad(where, 'אין כרטיס ' + k + ' ב-home/home.js');
  if (DATA.some((f) => gets[f])) bad(where, 'דף הבית הוריד נתונים של קו פח: ' + DATA.filter((f) => gets[f]).join(', '));

  // לחיצה על הכרטיס של קו פח פותחת את הכלי בלי טעינה מחדש, ו"חזרה" מחזירה לדף הבית
  await pg.click('.kbh a.card[data-k="kavpach"]');
  await pg.waitForSelector('.vcard', { timeout: 30000 }).catch(() => bad(where, 'לחיצה על הכרטיס של קו פח לא פתחה את הרשימה'));
  const st = await pg.evaluate(() => ({ h1: (document.querySelector('h1.kbt-h1') || {}).textContent, hash: decodeURIComponent(location.hash) }));
  if (st.h1 !== 'קו פח') bad(where, 'אחרי לחיצה על קו פח הכותרת היא "' + st.h1 + '"');
  if (!/^#(פח|kavpach)$/.test(st.hash)) bad(where, 'אחרי לחיצה על קו פח הכתובת היא ' + st.hash);
  await pg.goBack();
  await pg.waitForSelector('#root .kbh-host .kbh a.card', { timeout: 15000 }).catch(() => bad(where, '"חזרה" מקו פח לא החזירה את דף הבית'));
  await pg.click('.kbh a.card[data-k="golden"]');
  await pg.waitForFunction(() => (document.querySelector('h1.kbt-h1') || {}).textContent === 'הקו המוזהב' && document.querySelector('.vcard'), null, { timeout: 60000 }).catch(() => bad(where, 'לחיצה על הכרטיס של הקו המוזהב לא פתחה את הכלי'));
  await pg.close();
}

// ══ קו פח — הרשימה: מיון, סינון, חיפוש קו ועיר, הגדרות הניקוד, קישור לקו, ייצוא ══
async function list() {
  where = 'קו פח · הרשימה';
  const pg = await newPage();
  slow = true;
  await open(pg, '#פח');
  // המסך הראשון עולה מהקובץ המוכן, לפני שהנסיעות והקבצים הנלווים ירדו
  await pg.waitForSelector('.vcard', { timeout: 30000 }).catch(() => bad(where, 'הרשימה לא עלתה'));
  slow = false;
  if (gets['data-schedule.json']) bad(where, 'המסך הראשון חיכה ללוח הזמנים (data-schedule.json) ולא עלה מהקובץ המוכן');
  const first = await cardSeq(pg);
  const head = await pg.evaluate(() => ({ h1: (document.querySelector('h1.kbt-h1') || {}).textContent, tabs: [...document.querySelectorAll('a[href^="#פח"]')].map((a) => a.getAttribute('href') + ' ' + a.textContent.trim()) }));
  if (head.h1 !== 'קו פח') bad(where, 'הכותרת היא "' + head.h1 + '"');
  snap['list/tabs'] = head.tabs;
  await settle(pg, ALL_DATA);
  // אחרי שהקבצים הנלווים נטענו הציונים מחושבים בדפדפן — צריכים לצאת כמו בקובץ המוכן
  const after = await cardSeq(pg);
  if (first.join() !== after.join()) bad(where, 'הרשימה השתנתה אחרי טעינת שאר הנתונים: ' + first.slice(0, 6).join(' ') + ' ← ' + after.slice(0, 6).join(' '));
  snap['list/meta'] = lines(await pg.evaluate(() => (document.querySelector('.kbt-meta') || {}).innerText));
  snap['list/top'] = lines(await mainText(pg)).slice(0, 60);
  snap['list/card-1'] = await cardText(pg, 0);
  snap['list/card-2'] = await cardText(pg, 1);
  if (first.length !== 30) bad(where, 'בעמוד הראשון ' + first.length + ' כרטיסים ולא 30');
  const all = await allCards(pg);
  snap['list/all'] = all;
  if (all.some((s) => !/^\d+:\d+$/.test(s))) bad(where, 'כרטיס בלי מק"ט או בלי ציון: ' + all.filter((s) => !/^\d+:\d+$/.test(s)).join(' '));
  if (all.some((s, i) => i && scoreOf(s) > scoreOf(all[i - 1]))) bad(where, 'הרשימה לא ממוינת לפי ציון');
  if (all.some((s) => scoreOf(s) < 25)) bad(where, 'ברשימה קו עם ציון נמוך מ-25');
  if (new Set(all).size !== all.length) bad(where, 'קו מופיע פעמיים ברשימה');

  // מיון
  for (const [k, v] of [['wasted', 'ק"מ מבוזבז'], ['cost', 'עלות לנוסע'], ['trips', 'כמות נסיעות']]) {
    const opt = await pg.evaluate((v) => { const s = document.querySelector('select[aria-label="מיון הרשימה"]'); const o = [...s.options].find((o) => o.textContent.includes(v)); return o ? o.value : null; }, v);
    if (opt == null) { bad(where, 'אין אפשרות מיון "' + v + '"'); continue; }
    await pg.selectOption('select[aria-label="מיון הרשימה"]', opt); await pg.waitForTimeout(300);
    const s = await allCards(pg);
    snap['list/sort-' + k] = s.slice(0, 12);
    if ([...s].sort().join() !== [...all].sort().join()) bad(where, 'מיון לפי ' + v + ' שינה את הקווים שברשימה');
  }
  await pg.selectOption('select[aria-label="מיון הרשימה"]', { index: 0 }); await pg.waitForTimeout(300);

  // סינון לפי ציון, מחוז, קטגוריה וחברה
  const bands = await pg.evaluate(() => [...document.querySelectorAll('[aria-label="בחירה לפי ציון"] button')].map((b) => b.textContent.trim()));
  snap['list/bands'] = bands;
  for (const [txt, lo, hi] of [['חמור', 80, 100], ['לא יעיל', 65, 79], ['טעון בדיקה', 45, 64], ['סטייה קלה', 25, 44]]) {
    await pg.locator('[aria-label="בחירה לפי ציון"] button', { hasText: txt }).click(); await pg.waitForTimeout(300);
    const s = await allCards(pg), want = all.filter((x) => scoreOf(x) >= lo && scoreOf(x) <= hi);
    if (s.join() !== want.join()) bad(where, 'סינון "' + txt + '": ' + s.join(' ') + ' במקום ' + want.join(' '));
  }
  await pg.locator('[aria-label="בחירה לפי ציון"] button', { hasText: 'הכל' }).click(); await pg.waitForTimeout(300);
  for (const [lab, key] of [['סינון לפי מחוז', 'district'], ['סינון לפי קטגוריה', 'category'], ['חברה מפעילה', 'operator']]) {
    const sel = 'select[aria-label="' + lab + '"]';
    const opts = await pg.evaluate((sel) => { const s = document.querySelector(sel); return s ? [...s.options].map((o) => ({ v: o.value, t: o.textContent.trim() })) : null; }, sel);
    if (!opts) { bad(where, 'אין תיבת בחירה "' + lab + '"'); continue; }
    snap['list/' + key + '-options'] = opts.map((o) => o.t);
    const out = {}; let sum = 0;
    for (const o of opts.slice(1)) {
      await pg.selectOption(sel, o.v); await pg.waitForTimeout(250);
      const s = await allCards(pg); out[o.t] = s; sum += s.length;
      // בחירת חברה מציגה את כל הקווים שלה, גם מתחת לסף — במחוז ובקטגוריה רק קווים מהרשימה
      if (key !== 'operator' && s.some((x) => !all.includes(x))) bad(where, lab + ' = ' + o.t + ': קו שלא היה ברשימה המלאה');
      if (key === 'operator' && s.length !== +(o.t.match(/\((\d+)\)/) || [])[1]) bad(where, lab + ' = ' + o.t + ': ' + s.length + ' קווים');
    }
    snap['list/' + key] = out;
    if (key === 'district' && sum !== all.length) bad(where, lab + ': סכום הקווים בכל האפשרויות ' + sum + ' ולא ' + all.length);
    await pg.selectOption(sel, opts[0].v); await pg.waitForTimeout(250);
  }

  // חיפוש קו (מספר קו, מק"ט, כמה קווים) — בוחרים קו ורואים את הפרטים שלו
  const line = 'input[aria-label="מספר קו או מק״ט"]';
  await pg.fill(line, '688'); await pg.waitForTimeout(400);
  let s = await allCards(pg);
  if (s.join() !== '10688:' + scoreOf(all.find((x) => x.startsWith('10688:')) || ':-1')) bad(where, 'חיפוש קו 688 הציג ' + s.join(' '));
  snap['list/line-688'] = await cardText(pg, 0);
  await pg.fill(line, '10688'); await pg.waitForTimeout(400);
  if ((await allCards(pg)).join() !== s.join()) bad(where, 'חיפוש לפי מק"ט 10688 לא הציג את קו 688');
  await pg.fill(line, '688, 4'); await pg.waitForTimeout(400);
  snap['list/line-688,4'] = await allCards(pg);
  await pg.fill(line, '99999'); await pg.waitForTimeout(400);
  if ((await cardSeq(pg)).length || !/לא נמצאו קווים/.test(await mainText(pg))) bad(where, 'חיפוש קו שלא קיים לא הציג "לא נמצאו קווים"');
  await pg.fill(line, ''); await pg.waitForTimeout(400);
  if ((await allCards(pg)).join() !== all.join()) bad(where, 'אחרי ניקוי החיפוש הרשימה לא חזרה');

  // חיפוש עיר
  const city = 'input[type="search"][placeholder^="הקלד עיר"]';
  const byCity = {};
  for (const c of ['ערד', 'קרית מלאכי']) {
    await pg.fill(city, c); await pg.press(city, 'Enter'); await pg.waitForTimeout(500);
    byCity[c] = await allCards(pg);
    if (!byCity[c].length || byCity[c].length >= all.length) bad(where, 'חיפוש העיר ' + c + ' הציג ' + byCity[c].length + ' קווים');
    if (byCity[c].some((x) => !all.includes(x))) bad(where, 'חיפוש העיר ' + c + ': קו שלא היה ברשימה המלאה');
  }
  snap['list/city'] = byCity;
  snap['list/city-top'] = lines(await mainText(pg)).slice(0, 60);
  await pg.fill(city, ''); await pg.press(city, 'Enter'); await pg.waitForTimeout(500);
  if ((await allCards(pg)).join() !== all.join()) bad(where, 'אחרי ניקוי העיר הרשימה לא חזרה');

  // סינון לפי מספרים (ציון מ-…)
  const nf = pg.locator('label', { hasText: 'ציון מ-' }).locator('input');
  await nf.fill('70'); await nf.press('Tab'); await pg.waitForTimeout(400);
  s = await allCards(pg);
  if (s.join() !== all.filter((x) => scoreOf(x) >= 70).join()) bad(where, '"ציון מ-70" הציג ' + s.join(' '));
  await nf.fill(''); await nf.press('Tab'); await pg.waitForTimeout(400);

  // הגדרות הניקוד: נפתח, שינוי משנה את הרשימה, ואיפוס מחזיר
  await pg.locator('main button', { hasText: 'מה נחשב קו לא יעיל' }).click(); await pg.waitForTimeout(400);
  const panel = pg.locator('main button', { hasText: 'מה נחשב קו לא יעיל' }).locator('xpath=ancestor::*[.//input][1]');
  snap['list/settings'] = lines(await panel.innerText().catch(() => ''));
  const ms = pg.locator('main label, main div', { hasText: /^.{0,60}מתוך 100/ }).locator('input[type="number"]').last();
  if (await ms.count()) {
    await ms.fill('60'); await ms.press('Tab'); await settle(pg);
    s = await allCards(pg);
    if (s.join() !== all.filter((x) => scoreOf(x) >= 60).join()) bad(where, 'סף תצוגה 60 בהגדרות הציג ' + s.join(' '));
    await pg.reload(); await pg.waitForSelector('.vcard'); await settle(pg, ALL_DATA);
    if ((await allCards(pg)).join() !== s.join()) bad(where, 'הגדרות הניקוד לא נשמרו אחרי טעינה מחדש');
    await pg.evaluate(() => { Object.keys(localStorage).filter((k) => k.startsWith('kb-')).forEach((k) => localStorage.removeItem(k)); });
    await pg.reload(); await pg.waitForSelector('.vcard'); await settle(pg, ALL_DATA);
    if ((await allCards(pg)).join() !== all.join()) bad(where, 'אחרי איפוס ההגדרות הרשימה לא חזרה');
  } else bad(where, 'לא נמצא השדה של סף התצוגה בהגדרות הניקוד');

  // ייצוא לאקסל — שורה לכל קו ברשימה
  const x = await download(pg, () => pg.locator('main button', { hasText: 'ייצוא לאקסל' }).click());
  const rows = x.sheets[0] ? x.sheets[0].rows : [];
  snap['list/xlsx'] = { sheets: x.sheets.map((s) => s.n + ' · ' + (s.rows.length - 1)), head: rows[0], row1: rows[1] };
  if (rows.length - 1 !== all.length) bad(where, 'בקובץ האקסל ' + (rows.length - 1) + ' שורות ולא ' + all.length);

  // קישור לקו בודד (#פח/קו/…), וקו שלא ברשימה
  await pg.goto(BASE + '/?t=' + nav + '#פח/קו/10688'); await pg.waitForTimeout(600);
  s = await allCards(pg);
  if (s.length !== 1 || !s[0].startsWith('10688:')) bad(where, 'הקישור #פח/קו/10688 הציג ' + s.join(' '));
  if (!/מציג קו משותף \(מק"ט 10688\)/.test(await mainText(pg))) bad(where, 'בקישור לקו חסרה השורה "מציג קו משותף"');
  await pg.locator('main button', { hasText: 'הצג את כל הקווים' }).click(); await pg.waitForTimeout(500);
  if ((await allCards(pg)).join() !== all.join()) bad(where, '"הצג את כל הקווים" לא החזיר את הרשימה');
  await pg.goto(BASE + '/?t=' + nav + '#פח/קו/39080'); await pg.waitForTimeout(800);
  { const tx = lines(await mainText(pg)); snap['list/link-off-list'] = tx.slice(tx.findIndex((x) => /^\d+ קווים$/.test(x))); }
  if (!/ירד מהרשימה/.test(snap['list/link-off-list'].join(' '))) bad(where, 'קישור לקו שלא ברשימה (39080) לא הציג "ירד מהרשימה"');

  // "חפש הזדמנויות התייעלות" בכרטיס — עובר לאלגוריתם הייעול עם הקו
  await pg.goto(BASE + '/?t=' + nav + '#פח'); await pg.waitForTimeout(500);
  await pg.fill(line, '688'); await pg.waitForTimeout(400);
  await pg.locator('.vcard button', { hasText: 'חפש הזדמנויות התייעלות' }).first().click();
  await settle(pg);
  const sim = await pg.evaluate(() => ({ hash: decodeURIComponent(location.hash), cur: (document.querySelector('a[aria-current="page"]') || {}).textContent }));
  if (sim.hash !== '#פח/simulator' || !/אלגוריתם ייעול/.test(sim.cur || '')) bad(where, '"חפש הזדמנויות התייעלות" לא עבר לאלגוריתם הייעול (' + sim.hash + ')');
  snap['list/optimize-688'] = results(lines(await mainText(pg)));
  await pg.close();
}

// ══ קו פח — שאר הלשוניות ══
async function tabs() {
  const pg = await newPage();
  where = 'קו פח · ניתוח אזורי';
  await open(pg, '#פח/areas');
  await pg.waitForSelector('main', { timeout: 30000 });
  await settle(pg, ALL_DATA);
  const areaNames = () => pg.evaluate(() => [...document.querySelectorAll('main button')].filter((b) => b.textContent.trim() === 'צפה בקווים אלו').map((b) => { const c = b.parentElement; return c.innerText.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 4).join(' | '); }));
  snap['areas/city'] = await areaNames();
  snap['areas/city-card-1'] = lines(await pg.evaluate(() => { const b = [...document.querySelectorAll('main button')].find((b) => b.textContent.trim() === 'צפה בקווים אלו'); return b ? b.parentElement.innerText : ''; }));
  if (!snap['areas/city'].length) bad(where, 'אין כרטיסי ערים');
  await pg.locator('main button', { hasText: /^לפי מחוז$/ }).click(); await pg.waitForTimeout(500);
  snap['areas/district'] = await areaNames();
  if (!snap['areas/district'].length) bad(where, 'אין כרטיסי מחוזות');
  await pg.locator('main button', { hasText: /^לפי עיר$/ }).click(); await pg.waitForTimeout(500);
  // "צפה בקווים אלו" — חוזר לרשימה עם העיר
  await pg.locator('main button', { hasText: 'צפה בקווים אלו' }).first().click(); await pg.waitForTimeout(600);
  const back = await pg.evaluate(() => ({ cur: (document.querySelector('a[aria-current="page"]') || {}).textContent, city: (document.querySelector('input[type="search"]') || {}).value }));
  if (!/קווים לא יעילים/.test(back.cur || '') || !back.city) bad(where, '"צפה בקווים אלו" לא חזר לרשימה עם העיר (' + back.cur + ' / ' + back.city + ')');
  snap['areas/view-lines'] = { city: back.city, cards: await allCards(pg) };
  if (!snap['areas/view-lines'].cards.length) bad(where, '"צפה בקווים אלו" הציג רשימה ריקה');

  where = 'קו פח · כל הנסיעות';
  await tabClick(pg, 'פח', 'allTrips'); await settle(pg);
  const trows = () => pg.evaluate(() => [...document.querySelectorAll('main table tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
  const more = () => pg.evaluate(() => [...document.querySelectorAll('main button')].map((b) => b.textContent.trim()).filter((t) => /^הצג עוד/.test(t)).join());
  const tcity = 'main input[type="search"]';
  // העיר מ"צפה בקווים אלו" נשארת גם כאן
  if ((await pg.inputValue(tcity)) !== back.city) bad(where, 'העיר שנבחרה בניתוח האזורי (' + back.city + ') לא מופיעה כאן');
  snap['allTrips/city-' + back.city] = { more: await more(), first: (await trows()).slice(0, 6) };
  await pg.fill(tcity, ''); await pg.press(tcity, 'Enter'); await pg.waitForTimeout(500);
  let r = await trows();
  snap['allTrips/top'] = lines(await pg.evaluate(() => { const m = document.querySelector('main'), t = m.querySelector('table'); return m.innerText.slice(0, m.innerText.indexOf(t.innerText.slice(0, 15))) + t.querySelector('thead').innerText; }));
  snap['allTrips/rows'] = { more: await more(), first: r.slice(0, 8) };
  if (r.length < 20) bad(where, 'בטבלה רק ' + r.length + ' נסיעות');
  await pg.locator('main button', { hasText: /^הצג עוד/ }).click(); await pg.waitForTimeout(400);
  if ((await trows()).length <= r.length) bad(where, '"הצג עוד תוצאות" לא הוסיף שורות');
  const crowded = pg.locator('main label', { hasText: 'הצג רק נסיעות עמוסות' }).locator('input[type="checkbox"]');
  await crowded.check(); await pg.waitForTimeout(500);
  const busy = await trows();
  snap['allTrips/busy'] = { more: await more(), n: busy.length, first: busy.slice(0, 5) };
  if (!busy.length || busy.join('\n') === r.join('\n')) bad(where, '"הצג רק נסיעות עמוסות" הציג ' + busy.length + ' שורות');
  await crowded.uncheck(); await pg.waitForTimeout(500);
  // מיון לפי נוסעים ולפי עומס שיא (שני חיצים בכל עמודה)
  for (const [k, col] of [['ridership', 5], ['peak', 6]]) for (const [d, i] of [['desc', 1], ['asc', 2]]) {
    await pg.locator('main table thead th:nth-of-type(' + col + ') button').nth(i).click(); await pg.waitForTimeout(500);
    snap['allTrips/sort-' + k + '-' + d] = (await trows()).slice(0, 4);
  }
  // סוג הקו
  const tsel = 'main table thead select';
  const types = await pg.evaluate((q) => { const e = document.querySelector(q); return e ? [...e.options].map((o) => ({ v: o.value, t: o.textContent.trim() })) : []; }, tsel);
  if (types.length < 3) bad(where, 'אין בחירת סוג קו בכותרת הטבלה');
  for (const o of types.slice(1)) {
    await pg.selectOption(tsel, o.v); await pg.waitForTimeout(500);
    const x = await trows();
    snap['allTrips/type-' + o.t] = { more: await more(), first: x.slice(0, 3) };
    if (!x.length || x.some((row) => !row.endsWith(' ' + o.t))) bad(where, 'סינון סוג "' + o.t + '": ' + (x.length ? 'נסיעה מסוג אחר' : 'אין שורות'));
  }
  if (types.length) await pg.selectOption(tsel, types[0].v);
  await pg.fill(tcity, 'ערד'); await pg.press(tcity, 'Enter'); await pg.waitForTimeout(500);
  { const x = await trows(); snap['allTrips/city-ערד'] = { more: await more(), first: x.slice(0, 4) }; if (!x.length || x.some((row) => !row.includes('ערד'))) bad(where, 'סינון העיר ערד: ' + (x.length ? 'נסיעה בלי ערד' : 'אין שורות')); }
  await pg.fill(tcity, ''); await pg.press(tcity, 'Enter'); await pg.waitForTimeout(300);

  where = 'קו פח · אלגוריתם ייעול';
  await tabClick(pg, 'פח', 'simulator'); await settle(pg);
  snap['simulator/form'] = lines(await mainText(pg)).slice(0, 40);
  const run = async (lineNum) => {
    const inp = pg.locator('main label, main div', { hasText: /^מספר קו \/ מק"ט/ }).locator('input').first();
    await inp.fill(lineNum);
    await pg.locator('main button', { hasText: 'הרץ אלגוריתם' }).click(); await settle(pg);
    return lines(await mainText(pg));
  };
  const all0 = await run('');
  snap['simulator/all'] = results(all0);
  if (!all0.includes('תוצאות הייעול')) bad(where, 'הרצה לכל הקווים לא הציגה תוצאות');
  const one = await run('4');
  snap['simulator/line-4'] = results(one);
  if (one.join('\n') === all0.join('\n')) bad(where, 'הרצה לקו 4 יצאה זהה להרצה לכל הקווים');
  const x = pg.locator('main button', { hasText: /אקסל/ });
  if (await x.count()) {
    const f = await download(pg, () => x.first().click());
    snap['simulator/xlsx'] = f.sheets.map((s) => ({ n: s.n, rows: s.rows.length - 1, head: s.rows[0] }));
  } else snap['simulator/xlsx'] = null;

  where = 'קו פח · נסיעות תפעוליות';
  await tabClick(pg, 'פח', 'deadhead'); await settle(pg);
  r = await trows();
  snap['deadhead/top'] = lines(await mainText(pg)).slice(0, 30);
  snap['deadhead/rows'] = r;
  if (!r.length || /לא נמצאו/.test(r[0])) bad(where, 'הטבלה ריקה');
  else {
    await pg.locator('main table tbody tr').first().click(); await pg.waitForTimeout(500);
    const open1 = await trows();
    snap['deadhead/open'] = lines(open1.slice(1).join('\n')).map((s) => s.slice(0, 400));
    if (open1.length <= r.length) bad(where, 'לחיצה על שורה לא פתחה את הדוגמאות');
  }

  where = 'קו פח · על המערכת';
  await tabClick(pg, 'פח', 'about'); await settle(pg);
  snap['about/headings'] = await pg.evaluate(() => [...document.querySelectorAll('main h2, main h3, main h4')].map((h) => h.textContent.trim()));
  if ((await mainText(pg)).length < 1500) bad(where, 'הדף כמעט ריק');
  // כניסה ישירה ללשונית (#פח/deadhead) — מחשבת מיד, עם פונקציות מהליבה
  where = 'קו פח · כניסה ישירה לנסיעות תפעוליות';
  await open(pg, '#פח/deadhead'); await pg.waitForSelector('main', { timeout: 30000 }); await settle(pg, ALL_DATA);
  if ((await trows()).join('\n') !== r.join('\n')) bad(where, 'הטבלה שונה מזו שמתקבלת במעבר מלשונית אחרת');
  await pg.close();
}

// ══ בלי הקובץ המוכן (data-lines.json): הדף מחשב את הרשימה בדפדפן (kavpach-core.js) — אותה רשימה ══
async function nopre() {
  where = 'קו פח · בלי הקובץ המוכן';
  noPre = true; missOk.add('data-lines.json');
  const pg = await newPage();
  await open(pg, '#פח');
  await pg.waitForSelector('.vcard', { timeout: 60000 }).catch(() => bad(where, 'הרשימה לא עלתה'));
  await settle(pg, ALL_DATA.filter((f) => f !== 'data-lines.json'));
  const s = await allCards(pg);
  snap['nopre/all'] = s;
  // הציונים לא זהים לגמרי לקובץ המוכן: "תחנות ייחודיות" מחושב כאן רק מול 84 הקווים שבנתונים הקבועים
  if (s.length < 30 || s.some((x, i) => i && scoreOf(x) > scoreOf(s[i - 1]))) bad(where, 'הרשימה שחושבה בדפדפן קצרה או לא ממוינת (' + s.length + ' קווים)');
  if (gets['data-lines.json'] !== 1) bad(where, 'הדף לא ניסה להוריד את data-lines.json');
  snap['nopre/card-1'] = await cardText(pg, 0);
  await pg.close();
  noPre = false; missOk.delete('data-lines.json');
}

// ══ הקו המוזהב (אותו קוד, אותם נתונים) ══
async function golden() {
  where = 'הקו המוזהב';
  const pg = await newPage();
  await open(pg, '#מוזהב');
  await pg.waitForSelector('.vcard', { timeout: 60000 }).catch(() => bad(where, 'הרשימה לא עלתה'));
  await settle(pg, ['data-main.json', 'data-schedule.json', 'data-stops.json', 'kavpach-live.json']);
  const head = await pg.evaluate(() => ({ h1: (document.querySelector('h1.kbt-h1') || {}).textContent, tabs: [...document.querySelectorAll('a[href^="#מוזהב"]')].map((a) => a.getAttribute('href') + ' ' + a.textContent.trim()) }));
  if (head.h1 !== 'הקו המוזהב') bad(where, 'הכותרת היא "' + head.h1 + '"');
  snap['golden/tabs'] = head.tabs;
  snap['golden/top'] = body(lines(await mainText(pg))).slice(0, 40);
  snap['golden/cards'] = await cardSeq(pg);
  snap['golden/card-1'] = await cardText(pg, 0);
  if (!snap['golden/cards'].length) bad(where, 'אין כרטיסים');
  for (const t of head.tabs.map((x) => x.split(' ')[0].split('/')[1]).filter(Boolean)) {
    where = 'הקו המוזהב · ' + t;
    await tabClick(pg, 'מוזהב', t); await settle(pg);
    const tx = lines(await mainText(pg));
    snap['golden/' + t] = body(tx).slice(0, 50);
    if (body(tx).length < 5) bad(where, 'הלשונית כמעט ריקה');
  }
  // "חפש הזדמנויות הרחבה" בכרטיס — עובר ללשונית עם הקו
  where = 'הקו המוזהב · הזדמנויות הרחבה';
  await tabClick(pg, 'מוזהב', ''); await pg.waitForTimeout(300);
  await pg.locator('.vcard button', { hasText: 'חפש הזדמנויות הרחבה' }).first().click(); await settle(pg);
  { const tx = body(lines(await mainText(pg))); snap['golden/expand-card-1'] = tx.slice(0, 70);
    if (decodeURIComponent(await pg.evaluate(() => location.hash)) !== '#מוזהב/expand' || tx.length < 12) bad(where, 'הכפתור בכרטיס לא פתח את הזדמנויות ההרחבה של הקו'); }
  where = 'הקו המוזהב · קישור לקו';
  const mk = (snap['golden/cards'][0] || '').split(':')[0];
  await open(pg, '#מוזהב/קו/' + mk); await pg.waitForSelector('.vcard', { timeout: 60000 }).catch(() => {}); await settle(pg);
  const s = await cardSeq(pg);
  if (s.length !== 1 || s[0] !== snap['golden/cards'][0]) bad(where, 'הקישור #מוזהב/קו/' + mk + ' הציג ' + s.join(' '));
  await pg.close();
}

const t0 = Date.now();
const STEPS = { home, list, tabs, nopre, golden };
for (const [k, fn] of Object.entries(STEPS)) {
  if (!on(k)) continue;
  const t = Date.now();
  try { await fn(); } catch (e) { bad(where, 'הבדיקה נעצרה — ' + String(e && e.message || e).split('\n')[0]); }
  console.log('· ' + k + ' — ' + ((Date.now() - t) / 1000).toFixed(1) + ' שניות');
}
await browser.close();
server.close();

// ── השוואה לתמונה-במילים ──
const old = fs.existsSync(SNAP) ? JSON.parse(fs.readFileSync(SNAP, 'utf8')) : {};
if (process.env.UPDATE_SNAPSHOTS) {
  const out = ONLY.length ? Object.assign({}, old, snap) : snap;
  fs.writeFileSync(SNAP, JSON.stringify(out, null, 1) + '\n');
  console.log('התמונה-במילים עודכנה (' + Object.keys(snap).length + ' קטעים)');
} else {
  const flat = (v) => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))) : JSON.stringify(v, null, 1).split('\n'));
  for (const k of Object.keys(snap)) {
    if (!(k in old)) { bad('תמונה-במילים', k + ' — אין בקובץ (להריץ עם UPDATE_SNAPSHOTS=1)'); continue; }
    const a = flat(old[k]), b = flat(snap[k]);
    if (a.join('\n') === b.join('\n')) continue;
    let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
    bad('תמונה-במילים', k + ' — שורה ' + (i + 1) + ': היה "' + String(a[i] === undefined ? '(סוף)' : a[i]).slice(0, 160) + '" ועכשיו "' + String(b[i] === undefined ? '(סוף)' : b[i]).slice(0, 160) + '"' + (a.length !== b.length ? ' (' + a.length + ' ← ' + b.length + ' שורות)' : ''));
  }
  if (!ONLY.length) for (const k of Object.keys(old)) if (!(k in snap)) bad('תמונה-במילים', k + ' — לא נבדק בהרצה הזו');
}

console.log((problems.length ? '✗ ' + problems.length + ' בעיות' : '✓ הכל תקין') + ' · ' + ((Date.now() - t0) / 1000).toFixed(0) + ' שניות');
for (const p of problems) console.log('  ✗ ' + p);
process.exit(problems.length ? 1 : 0);
