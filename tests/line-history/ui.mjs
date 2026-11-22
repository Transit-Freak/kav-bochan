// בדיקת "הקו בזמן" בדפדפן, על נתונים קבועים וקטנים (tests/fixtures/line-history/data): חיפוש קו ופתיחת העמוד שלו
// (ציר הזמן, סינון לפי סוג וחודש, מפה, לו"ז, חלופות), "שינויים לפי יום" (שנים, חודשים, ימים, שורת המקורות —
// משרד התחבורה / אתר מגיעים / אתרי מידע לנוסעים / הודעות החברות), לשונית התחנות ועמוד של תחנה אחת.
// הדף נטען כמו באתר: חלקי הקוד ב-line-history/src מחוברים ומקומפלים בדפדפן ב-Babel. השעה קבועה (22.11.2026), והרשת החיצונית חסומה.
// הבדיקה לא מחליפה את tools/check_line_history_ui.mjs (שרצה על הנתונים המלאים ב-main).
//
// הרצה:   npm i --no-save playwright leaflet@1.9.4 && node tests/line-history/ui.mjs
// משתנים: CHROME — הדפדפן (ברירת מחדל: Chromium של Playwright, ואם אין — /usr/bin/google-chrome)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..', '..');
const FIX = path.join(REPO, 'tests', 'fixtures', 'line-history', 'data');
const { chromium } = require('playwright');
const LEAFLET = process.env.LEAFLET_DIR || path.join(path.dirname(require.resolve('leaflet/package.json')), 'dist');
const NOW = '2026-11-22T10:00:00+02:00';
const WAIT = 15000;

// מה שמצפים לו בנתונים הקבועים (make_fixtures.py). אחרי בנייה מחדש של הנתונים — לעדכן כאן
const LINE = { rd: '13146-1-0', back: '13146-2-0', num: '146', op: 'סופרבוס', mkt: '13146-0-1', to: 'קניון איילון-בני ברק',
  last: '10.11.2026', lastKind: 'שינוי מסלול', added: "שד' ירושלים/הלהב (36356)", prev: '05.07.2026', firstTime: '05:30', month: '03.2026' };
const OTHER = { rd: '15145-1-0', num: '145', q: '145 סופרבוס' };
const STOP = { code: '36356', name: "שד' ירושלים/הלהב", type: 'תחנה רגילה', row: '3 קווים התחילו לעצור בתחנה: 172, 146, 141' };
const SRC = { mot: 'משרד התחבורה', mag: 'צילום ממקור נוסף · אתר מגיעים', web: 'צילום ממקור נוסף · אתרי מידע לנוסעים' };

const J = (f) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
const IDX = J('lines.json'), MONTHS = J('months.json');
const NEWS = J('news-dan.json').concat(J('news-egged.json'));
const dmy = (d) => d.split('-').reverse().join('.');           // 2026-11-10 ← 10.11.2026
const perDay = (m) => { const o = {}; J('changes/' + m + '.json').changes.forEach((c) => { o[c.d] = (o[c.d] || 0) + 1; }); return o; };
const newsOf = (y, op) => NEWS.filter((x) => x.d.startsWith(y) && (!op || x.op === op));

const problems = [];
const bad = (m) => { problems.push(m); console.log('  ✗ ' + m); };
const ok = (cond, m) => { if (!cond) bad(m); return !!cond; };
const same = (got, want, m) => ok(JSON.stringify(got) === JSON.stringify(want), m + ' — יש ' + JSON.stringify(got) + ', צריך ' + JSON.stringify(want));
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.jsx': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const asked = new Set(), missing = new Set();
function serve() {
  return new Promise((res) => {
    const srv = http.createServer((rq, rs) => {
      let p = decodeURIComponent(rq.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      // הנתונים של הכלי — מהתיקייה הקבועה; נתוני 2012 (magihim-2012) לא חלק מהבדיקה
      const data = p.startsWith('/line-history/data/'), f = data ? path.join(FIX, p.slice('/line-history/data/'.length)) : path.join(REPO, p);
      if (data) asked.add(p.slice('/line-history/data/'.length));
      if (p.startsWith('/magihim-2012/') || !f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        if (!data && !p.startsWith('/magihim-2012/')) missing.add(p);
        rs.writeHead(404); rs.end(); return;
      }
      rs.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rs);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

async function main() {
  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port, url = base + '/line-history/';
  let exe = process.env.CHROME;
  if (!exe) { try { exe = chromium.executablePath(); if (!fs.existsSync(exe)) exe = ''; } catch (e) { exe = ''; } }
  const b = await chromium.launch(exe ? { executablePath: exe } : { executablePath: '/usr/bin/google-chrome' });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
  await ctx.route(/unpkg\.com\/leaflet@1\.9\.4\/dist\/([^?]+)/, (r) => r.fulfill({ path: path.join(LEAFLET, r.request().url().split('/dist/')[1].split('?')[0]) }));
  await ctx.route((u) => !u.href.startsWith(base) && !/unpkg\.com\/leaflet/.test(u.href), (r) => r.abort());   // אריחים, גופנים, התראות, ארכיון — חסומים
  // כל טעינה מתחילה נקייה: בלי חיפוש, תצוגה או חודש שנשמרו בשלב קודם. נשאר רק הקוד המקומפל (lh-js-…), כמו בביקור חוזר
  await ctx.addInitScript(() => { try { Object.keys(localStorage).forEach((k) => { if (!k.startsWith('lh-js-')) localStorage.removeItem(k); }); } catch (e) {} });
  let pg;
  // דף חדש עם שעה קבועה
  const open = async (hash = '') => {
    if (pg) await pg.close();
    pg = await ctx.newPage();
    await pg.clock.setFixedTime(new Date(NOW));
    pg.setDefaultTimeout(WAIT);
    pg.on('pageerror', (e) => bad('שגיאת דף: ' + e.message));
    await pg.goto(url + hash);
    await pg.waitForSelector('.wrap header h1', { timeout: 60000 });
  };
  const $ = (sel, opt) => pg.locator(sel, opt);
  const texts = async (sel) => (await $(sel).allInnerTexts()).map(clean);
  const text = async (sel) => clean(await $(sel).first().innerText({ timeout: WAIT }));
  // מחכים שתנאי בדף יתקיים; אם לא — בעיה עם שם ברור, והשלב נעצר (ההמשך שלו תלוי במה שלא הופיע). השלבים הבאים רצים
  const STOP_STEP = new Error('stop');
  const until = async (what, fn, arg) => { try { await pg.waitForFunction(fn, arg, { timeout: WAIT }); } catch (e) { bad(what + ' — לא הופיע תוך ' + WAIT / 1000 + ' שניות'); throw STOP_STEP; } };
  const untilText = (what, sel, t) => until(what, ([s, x]) => [...document.querySelectorAll(s)].some((e) => e.innerText.replace(/\s+/g, ' ').includes(x)), [sel, t]);
  const untilGone = (what, sel) => until(what, (s) => !document.querySelector(s), sel);
  const step = async (name, fn) => {
    const n0 = problems.length, t0 = Date.now();
    console.log('▸ ' + name);
    try { await fn(); } catch (e) { if (e !== STOP_STEP) bad(name + ': ' + String(e && e.message || e).split('\n').filter((l) => l.trim() && !/^Call log/.test(l)).slice(0, 2).map((l) => l.replace(/\x1b\[\d+m/g, '').trim()).join(' ')); }
    console.log((problems.length === n0 ? '  ✓ ' : '  ✗ ') + ((Date.now() - t0) / 1000).toFixed(1) + ' שניות');
  };
  const tab = (label) => $('.tabs a[role=tab]', { hasText: label });
  const pressed = (sel) => pg.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.getAttribute('aria-pressed') === 'true').map((e) => e.innerText.replace(/\s+/g, ' ').trim()), sel);
  // "שינויים לפי יום": שורת השנים היא ה-.months הראשונה; שורת החודשים — זו שאחרי שורת המקור
  const yearChip = (y) => $('.card .months >> nth=0').locator('button.mchip', { hasText: y });
  const monthChips = () => pg.evaluate(() => [...document.querySelectorAll('.card .months button.mchip')].map((e) => e.innerText.trim()).filter((t) => /^\d\d\.\d{4}$/.test(t)));
  const dayHeads = () => texts('.card .dayhead');

  await step('הדף נטען: כותרת, לשוניות, מספר הקווים והשינויים האחרונים', async () => {
    await open();
    same(await text('header h1'), 'הקו בזמן', 'כותרת הדף');
    same(await texts('.tabs a[role=tab]'), ['🚌 קווים', '🚏 תחנות', '🗺️ מפה', '🚆 רכבת', '🚕 מוניות שירות'], 'הלשוניות הראשיות (קישורים, role=tab)');
    same(await pg.evaluate(() => [...document.querySelectorAll('.tabs a[role=tab]')].filter((a) => a.getAttribute('aria-selected') === 'true').length), 1, 'לשונית אחת מסומנת');
    await untilText('מספר הוריאנטים בראש הדף', 'header .stats', IDX.lines.length.toLocaleString('en-US') + ' וריאנטים מתועדים');
    ok((await text('header .stats')).includes('עודכן: ' + IDX.gen), 'בראש הדף חסר "עודכן: ' + IDX.gen + '"');
    // המסך הראשי: היום האחרון עם שינויים, והקו שלנו בתוכו
    await untilText('השינויים האחרונים במסך הראשי', '.card', LINE.last);
    ok(await $('.card a.lrow[href="#' + LINE.rd + '"]').count() > 0, 'במסך הראשי אין שורה לקו ' + LINE.num + ' (שינוי מ-' + LINE.last + ')');
    ok(await $('input.search').count() === 1, 'אין שדה חיפוש קו במסך הראשי');
    ok(await $('#data-sources .srcitem').count() >= 4, 'ברשימת המקורות (בתחתית) פחות מ-4 מקורות');
  });

  await step('חיפוש קו: קבוצה לקו, כל החלופות, חיפוש בשתי מילים וחיפוש בלי תוצאות', async () => {
    await $('input.search').fill(LINE.num);
    await untilText('תוצאות החיפוש', '.llist .lgroup', LINE.num);
    same(await text('.llist .lgroup >> nth=0 >> .lghead .badge'), LINE.num, 'מספר הקו בראש הקבוצה הראשונה');
    const want = IDX.lines.filter((l) => l.line === LINE.num).map((l) => l.rd).sort();
    const got = (await pg.evaluate(() => [...document.querySelectorAll('.llist .lgroup')[0].querySelectorAll('a.lrow')].map((a) => decodeURIComponent(a.getAttribute('href').slice(1))))).sort();
    same(got, want, 'החלופות בקבוצה של קו ' + LINE.num);
    const row = clean(await $('.llist a.lrow[href="#' + LINE.rd + '"]').innerText());
    ok(row.includes(LINE.op) && row.includes('מק״ט ' + LINE.mkt), 'בשורת החלופה חסרים המפעיל או המק״ט: ' + row);
    ok(/\d+ שינויים/.test(row), 'בשורת החלופה חסר מספר השינויים: ' + row);
    ok(await $('.llist .lrow .k', { hasText: 'חלופה בוטלה' }).count() > 0, 'אין תג "חלופה בוטלה" לחלופות הישנות של הקו');
    // שתי מילים: מספר ומפעיל
    await $('input.search').fill(OTHER.q);
    await until('תוצאה לחיפוש "' + OTHER.q + '"', (h) => !!document.querySelector('.llist a.lrow[href="' + h + '"]') && !document.querySelector('.llist a.lrow[href="#13146-1-0"]'), '#' + OTHER.rd);
    await $('input.search').fill('99999 אין כזה');
    await untilText('הודעה כשאין תוצאות', '.llist .empty', 'לא נמצא קו תואם');
  });

  await step('עמוד הקו: כותרת, ציר הזמן, סינון לפי סוג ולפי חודש', async () => {
    await $('input.search').fill(LINE.num);
    await $('.llist a.lrow[href="#' + LINE.rd + '"]').click();
    await untilText('עמוד הקו', '.linehead .badge', LINE.num);
    same(decodeURIComponent(new URL(pg.url()).hash), '#' + LINE.rd, 'הכתובת אחרי פתיחת הקו');
    ok((await text('.linehead .dest')).includes(LINE.to), 'ביעד של הקו חסר "' + LINE.to + '"');
    await untilText('פרטי הקו', '.facts', 'גרסאות מתועדות');
    const facts = await text('.facts');
    ok(facts.includes(LINE.op) && facts.includes('מק״ט ' + LINE.mkt), 'בפרטי הקו חסרים המפעיל או המק״ט: ' + facts);
    const nver = +(facts.match(/(\d+) גרסאות מתועדות/) || [])[1];
    // ציר הזמן: מהחדש לישן, האירוע האחרון מסומן
    await untilText('ציר הזמן', '.tl .ev', LINE.last);
    const dates = async () => (await texts('.tl .ev .d')).map((t) => t.slice(0, 10));
    const iso = (d) => d.split('.').reverse().join('-');
    const d0 = await dates();
    ok(d0.length >= 3, 'בציר הזמן פחות מ-3 אירועים: ' + d0.join(', '));
    same(d0, d0.slice().sort((a, b) => iso(b).localeCompare(iso(a))), 'ציר הזמן מהחדש לישן');
    const first = await text('.tl .ev >> nth=0');
    ok(first.startsWith(LINE.last) && first.includes(LINE.lastKind), 'האירוע הראשון בציר: ' + first);
    ok(first.includes('נוספו: ' + LINE.added), 'באירוע הראשון חסרה התחנה שנוספה (' + LINE.added + ')');
    ok(first.includes('מקור:'), 'באירוע הראשון חסרה שורת המקור');
    same(await $('.tl .ev.sel').count(), 1, 'אירוע אחד מסומן בציר');
    ok((await text('.tl .ev.sel')).startsWith(LINE.last), 'האירוע המסומן אינו האחרון');
    // סינון לפי סוג: "הכול" מציג את כל הגרסאות, והמספרים שעל הכפתורים מסתכמים למספר הגרסאות
    const sum = await pg.evaluate(() => [...document.querySelectorAll('.kfilter .kchip b')].reduce((s, x) => s + (+x.textContent || 0), 0));
    same(sum, nver, 'סכום המספרים בכפתורי הסוגים מול "גרסאות מתועדות"');
    ok(await $('.kfilter .kchip.off').count() > 0, 'אין סוגים כבויים בברירת המחדל (לו״ז, סוג רכב)');
    await $('.kfilter .kchip', { hasText: 'הכול' }).click();
    await until('כל האירועים אחרי "הכול"', (n) => document.querySelectorAll('.tl .ev').length === n, nver);
    same(await $('.kfilter .kchip.off').count(), 0, 'סוגים כבויים אחרי "הכול"');
    ok((await texts('.tl .ev')).some((t) => t.includes('שינוי לו"ז')), 'אחרי "הכול" אין אירוע של שינוי לו"ז');
    // כיבוי סוג אחד מוריד בדיוק את האירועים שלו
    const chip = $('.kfilter .kchip', { hasText: LINE.lastKind });
    const nk = +(await chip.locator('b').innerText());
    await chip.click();
    await until('כיבוי "' + LINE.lastKind + '"', (n) => document.querySelectorAll('.tl .ev').length === n, nver - nk);
    ok(!(await dates()).includes(LINE.last), 'האירוע מ-' + LINE.last + ' נשאר אחרי כיבוי הסוג שלו');
    await $('.kfilter .kchip', { hasText: 'הכול' }).click();
    await until('החזרת כל הסוגים', (n) => document.querySelectorAll('.tl .ev').length === n, nver);
    // סינון לפי חודש
    const mchip = $('.card.side .months .mchip', { hasText: LINE.month });
    const nm = +(await mchip.innerText()).trim().split(/\s+/).pop();
    await mchip.click();
    await until('אירועי ' + LINE.month + ' בלבד', (n) => document.querySelectorAll('.tl .ev').length === n, nm);
    ok((await dates()).every((d) => d.endsWith(LINE.month)), 'אחרי בחירת ' + LINE.month + ' יש אירועים מחודש אחר: ' + (await dates()).join(', '));
    await $('.card.side .months .mchip', { hasText: 'הכול' }).click();
    await until('החזרת כל החודשים', (n) => document.querySelectorAll('.tl .ev').length === n, nver);
  });

  await step('עמוד הקו: מפה, בחירת גרסה, לו"ז, חלופות וחזרה לחיפוש', async () => {
    same(await text('.card.main .vhead b >> nth=0'), LINE.last, 'הגרסה שמוצגת במפה');
    await until('המסלול והתחנות במפה', () => document.querySelectorAll('.mapwrap .leaflet-container path.leaflet-interactive').length > 10);
    const stops = +((await text('.card.main')).match(/(\d+) תחנות בגרסה זו/) || [])[1];
    const pool = J('lines/' + LINE.rd + '.json');
    same(stops, pool.versions.filter((v) => !v.hid && (v.stops || []).length).pop().stops.length, 'מספר התחנות בגרסה האחרונה');
    ok((await texts('.card.main .legend')).join(' ').includes('תחנה שנוספה'), 'במקרא המפה חסר "תחנה שנוספה"');
    // הלו"ז המלא
    await $('.schedbox summary').click();
    await untilText('לוח הזמנים', '.schedbox .schedtbl', LINE.firstTime);
    const sched = J('sched/' + LINE.rd.slice(0, 2) + '.json').lines[LINE.rd];
    // ימים עם אותן שעות מוצגים בשורה אחת (ראשון–חמישי)
    same(await $('.schedbox .tchip').count(), [...new Set(Object.values(sched).map((a) => a.join()))].reduce((n, a) => n + a.split(',').length, 0), 'מספר השעות בלו"ז המלא');
    ok(await $('.schedbox .schedtbl tr').count() >= 2, 'בלו"ז המלא פחות משתי שורות ימים');
    // בחירת גרסה קודמת בציר
    await $('.kbtn[aria-label^="בחירת האירוע מ-' + LINE.prev + '"]').click();
    await untilText('הגרסה שנבחרה', '.card.main .vhead', 'גרסת ' + LINE.prev);
    ok((await text('.tl .ev.sel')).startsWith(LINE.prev), 'האירוע מ-' + LINE.prev + ' לא מסומן אחרי לחיצה');
    await until('המפה של הגרסה שנבחרה', () => document.querySelectorAll('.mapwrap .leaflet-container path.leaflet-interactive').length > 10);
    // חלופות וכיוונים: מעבר לכיוון השני מחליף את העמוד ואת הכתובת
    await $('.alt-selector button.sib').click();
    const sibs = await pg.evaluate(() => [...document.querySelectorAll('#alternative-options a.sib')].map((a) => decodeURIComponent(a.getAttribute('href').slice(1))));
    same(sibs.slice().sort(), IDX.lines.filter((l) => l.rd.split('-')[0] === LINE.rd.split('-')[0]).map((l) => l.rd).sort(), 'רשימת החלופות והכיוונים');
    await $('#alternative-options a.sib[href="#' + LINE.back + '"]').click();
    await until('המעבר לכיוון השני', (rd) => decodeURIComponent(location.hash) === '#' + rd, LINE.back);
    await untilText('ציר הזמן של הכיוון השני', '.facts', 'גרסאות מתועדות');
    ok((await text('.linehead .dest')).startsWith(LINE.to), 'היעד של הכיוון השני לא מתחיל ב"' + LINE.to + '": ' + await text('.linehead .dest'));
    ok(await $('.tl .ev').count() >= 2, 'בציר הזמן של הכיוון השני פחות משני אירועים');
    // חזרה: רשימת החיפוש עם מה שהוקלד
    await $('button.back, a.back').first().click();
    await untilText('תוצאות החיפוש אחרי חזרה', '.llist .lgroup', LINE.num);
    same(await $('input.search').inputValue(), LINE.num, 'החיפוש נשמר אחרי חזרה מהקו');
    ok(!/#\d/.test(new URL(pg.url()).hash), 'אחרי חזרה נשאר קו בכתובת: ' + pg.url());
  });

  await step('קישור ישיר לקו, כפתור "אחורה" של הדפדפן וקו שלא קיים', async () => {
    await open('#' + OTHER.rd);
    await untilText('עמוד הקו מקישור ישיר', '.linehead .badge', OTHER.num);
    await untilText('ציר הזמן מקישור ישיר', '.facts', 'גרסאות מתועדות');
    ok(await $('.tl .ev').count() >= 2, 'בקישור ישיר לקו ' + OTHER.num + ' אין ציר זמן');
    // מעבר לקו אחר דרך הכתובת (hashchange), וחזרה בדפדפן
    await pg.evaluate((rd) => { location.hash = '#' + rd; }, LINE.rd);
    await untilText('הקו אחרי שינוי הכתובת', '.linehead .badge', LINE.num);
    await pg.goBack();
    await untilText('הקו הקודם אחרי "אחורה"', '.linehead .badge', OTHER.num);
    await open('#99999-1-0');
    await until('הודעה על קו שאין לו נתונים', () => /לא נמצא|אין נתונים|לא קיים|לא הצלחנו|לא ירדו/.test(document.querySelector('#root').innerText));
    ok(!(await text('#root')).includes('משהו השתבש בדף'), 'קו שלא קיים מפיל את הדף');
  });

  await step('שינויים לפי יום: שנים, חודשים, ימים, סינון ופתיחת קו', async () => {
    await open();
    await $('button.kathead[aria-pressed]').click();
    const years = [...new Set(MONTHS.months.map((m) => m.slice(0, 4)).concat(NEWS.map((x) => x.d.slice(0, 4))))].sort().reverse();
    await until('שורת השנים', (n) => document.querySelectorAll('.card .months')[0] && document.querySelectorAll('.card .months')[0].querySelectorAll('button.mchip').length === n, years.length);
    same(await texts('.card .months >> nth=0 >> button.mchip'), years, 'כפתורי השנים (חודשי הנתונים והודעות החברות)');
    const last = MONTHS.months.slice().sort().pop(), y = last.slice(0, 4);
    const mine = MONTHS.officialMonths.filter((m) => m.startsWith(y)).sort().reverse().map((m) => m.split('-').reverse().join('.'));
    await untilText('ימי החודש האחרון', '.card .dayhead', dmy(last).slice(-7));
    same(await monthChips(), mine, 'כפתורי החודשים של ' + y);
    ok((await pressed('.card .months button.mchip')).includes(y) && (await pressed('.card .months button.mchip')).includes(mine[0]), 'השנה והחודש האחרונים לא מסומנים: ' + (await pressed('.card .months button.mchip')).join(', '));
    same(await $('.card .srcrow').count(), 0, 'שורת מקורות בשנה שיש לה מקור אחד (' + y + ')');
    ok((await text('.card .srcnote')).startsWith('מקור: ' + SRC.mot), 'שורת המקור של ' + y + ': ' + await text('.card .srcnote'));
    // כותרת לכל יום, עם מספר השינויים שבקובץ
    const heads = async () => (await dayHeads()).map((t) => { const m = t.match(/^(\d\d\.\d\d\.\d{4}) · יום \S+ · ([\d,]+) שינויים/); return m ? [m[1], +m[2].replace(/,/g, '')] : [t, -1]; });
    const wantDays = (m) => Object.entries(perDay(m)).sort((a, b) => b[0].localeCompare(a[0])).map(([d, n]) => [dmy(d), n]);
    same(await heads(), wantDays(last), 'כותרות הימים של ' + last);
    const r = $('.card a.lrow[href="#' + LINE.rd + '"]');
    ok(clean(await r.first().innerText()).includes(LINE.lastKind), 'בשורה של קו ' + LINE.num + ' חסר סוג השינוי');
    // שינויי לו"ז ודומיהם מקופלים לשורה אחת; לחיצה פותחת
    const low = $('.card button.lowgrp').first();
    if (ok(await low.count() > 0, 'אין שורה מקופלת של שינויים קטנים (lowgrp)')) {
      const n0 = await $('.card a.lrow').count(), k = +(clean(await low.innerText()).match(/(\d+) (קו|קווים)/) || [])[1];
      await low.click();
      await until('פתיחת השורה המקופלת', (n) => document.querySelectorAll('.card a.lrow').length === n, n0 + k);
    }
    // יום אחד
    const days = wantDays(last);
    if (days.length > 1) {
      await $('.card .months button.mchip', { hasText: days[1][0].slice(0, 5) }).click();
      await until('יום אחד בלבד', () => document.querySelectorAll('.card .dayhead').length === 1);
      ok((await dayHeads())[0].startsWith(days[1][0]), 'נבחר ' + days[1][0] + ' ומוצג ' + (await dayHeads())[0]);
      await $('.card .months button.mchip', { hasText: 'כל החודש' }).click();
      await until('כל ימי החודש', (n) => document.querySelectorAll('.card .dayhead').length === n, days.length);
    }
    // סינון לפי מספר קו
    await $('.card input.search').fill(LINE.num);
    await until('סינון לפי קו ' + LINE.num, (n) => { const b = [...document.querySelectorAll('.card a.lrow .badge')]; return b.length > 0 && b.every((x) => x.textContent.trim() === n); }, LINE.num);
    await $('.card input.search').fill('');
    // חודש קודם
    const prev = MONTHS.officialMonths.filter((m) => m.startsWith(y)).sort().reverse()[1];
    if (prev) {
      await $('.card .months button.mchip', { hasText: dmy(prev) }).click();
      await untilText('ימי החודש הקודם', '.card .dayhead', dmy(prev));
      same(await heads(), wantDays(prev), 'כותרות הימים של ' + prev);
      // פתיחת קו מהרשימה וחזרה: נשארים באותו חודש
      await $('.card a.lrow[href^="#' + LINE.rd.split('-')[0] + '-"]').first().click();
      await untilText('עמוד הקו מתוך "שינויים לפי יום"', '.linehead .badge', LINE.num);
      await $('button.back, a.back').first().click();
      await untilText('חזרה ל"שינויים לפי יום"', '.card .dayhead', dmy(prev));
      ok((await pressed('.card .months button.mchip')).includes(dmy(prev)), 'אחרי חזרה מהקו החודש ' + dmy(prev) + ' לא מסומן');
    }
    // חזרה לחיפוש הקווים
    await $('button.kathead[aria-pressed="true"]').click();
    await until('חזרה לחיפוש הקווים', () => !!document.querySelector('.card > input.search[placeholder^="חיפוש קו"]'));
  });

  await step('שורת המקורות: משרד התחבורה, אתר מגיעים, אתרי מידע לנוסעים והודעות החברות', async () => {
    await open();
    await $('button.kathead[aria-pressed]').click();
    await yearChip('2012').click();
    await until('שורת המקורות של 2012', () => !!document.querySelector('.card .srcrow'));
    const ops = (yy) => ['דן', 'אגד'].filter((o) => newsOf(yy, o).length).join(' ו');
    same(await texts('.card .srcrow button.mchip'), [SRC.mot, SRC.mag, SRC.web, 'הודעות החברות · ' + ops('2012')], 'כפתורי המקורות של 2012');
    same(await pressed('.card .srcrow button.mchip'), [SRC.mot], 'המקור המסומן בכניסה ל-2012');
    const off = MONTHS.officialMonths.filter((m) => m.startsWith('2012')), web = MONTHS.webMonths.filter((m) => m.startsWith('2012')).sort().reverse();
    same(await monthChips(), off.map(dmy), 'חודשי משרד התחבורה ב-2012');
    await until('שורת המקור של משרד התחבורה ב-2012', () => !!document.querySelector('.card .srcnote.src-gtfs2012'));
    ok(await $('.card .srcnote.src-gtfs2012').count() === 1 && (await text('.card .srcnote')).startsWith('מקור: ' + SRC.mot), 'שורת המקור של משרד התחבורה ב-2012: ' + await text('.card .srcnote'));
    const n12 = J('changes/' + off[0] + '.json').changes.length;
    await untilText('הצילום של 2012', '.card .dayhead', n12 + ' שינויים');
    // אתרי מידע לנוסעים: חודשים משלהם, ורק שורות מהמקור הזה
    await $('.card .srcrow button.src-web').click();
    await until('שורת המקור של אתרי המידע', () => !!document.querySelector('.card .srcnote.src-web'));
    same(await pressed('.card .srcrow button.mchip'), [SRC.web], 'המקור המסומן אחרי בחירת אתרי המידע');
    same(await monthChips(), web.map(dmy), 'חודשי צילומי האתרים ב-2012');
    await untilText('הצילומים של ' + web[0], '.card .dayhead', dmy(web[0]).slice(-7));
    await $('.card button.lowgrp').first().click();
    await until('שורות הצילומים', () => document.querySelectorAll('.card a.lrow').length > 0);
    const hrefs = await pg.evaluate(() => [...document.querySelectorAll('.card a.lrow')].map((a) => a.getAttribute('href')));
    ok(hrefs.every((h) => h.startsWith('#website')), 'במקור "אתרי מידע" יש שורות ממקור אחר: ' + hrefs.join(' '));
    await $('.card .months button.mchip', { hasText: dmy(web[1]) }).click();
    await untilText('הצילומים של ' + web[1], '.card .dayhead', dmy(web[1]).slice(-7));
    // אתר מגיעים
    await $('.card .srcrow button.src-mag').click();
    await until('שורת המקור של אתר מגיעים', () => !!document.querySelector('.card .srcnote.src-mag'));
    same(await pressed('.card .srcrow button.mchip'), [SRC.mag], 'המקור המסומן אחרי בחירת אתר מגיעים');
    same(await monthChips(), [], 'כפתורי חודשים במקור "אתר מגיעים"');
    // הודעות החברות
    await $('.card .srcrow button.src-news').click();
    await until('שורת המקור של הודעות החברות', () => !!document.querySelector('.card .srcnote.src-news'));
    const all = newsOf('2012');
    ok((await text('.card .srcnote.src-news')).includes(all.length + ' הודעות'), 'מספר ההודעות בשורת המקור: ' + await text('.card .srcnote.src-news'));
    same(await pressed('.card .srcrow button.mchip'), ['הודעות החברות · ' + ops('2012')], 'המקור המסומן אחרי בחירת ההודעות');
    same(await monthChips(), [], 'כפתורי חודשים במקור "הודעות החברות"');
    same(await $('.card .newsrow').count(), all.length, 'מספר ההודעות של 2012');
    const newest = all.slice().sort((a, c) => (a.d < c.d ? 1 : a.d > c.d ? -1 : 0))[0];
    ok((await text('.card .newsrow >> nth=0')).includes('פורסם ' + dmy(newest.d)), 'ההודעה הראשונה אינה החדשה ביותר (' + dmy(newest.d) + ')');
    const links = await pg.evaluate(() => [...document.querySelectorAll('.card .newsrow .newsmeta a')].map((a) => a.href));
    ok(links.length === all.length && links.every((h) => h.startsWith('https://web.archive.org/web/')), 'לא לכל הודעה יש קישור לארכיון');
    same(await texts('.card .months >> nth=1 >> button.mchip'), ['כל החברות', 'דן', 'אגד'], 'כפתורי החברות');
    await $('.card .months >> nth=1').locator('button.mchip', { hasText: 'אגד' }).click();
    await until('הודעות אגד בלבד', (n) => document.querySelectorAll('.card .newsrow').length === n, newsOf('2012', 'אגד').length);
    ok((await texts('.card .newsrow .newsmeta')).every((t) => t.startsWith('אגד ·')), 'אחרי בחירת אגד יש הודעות של חברה אחרת');
    await $('.card .months >> nth=1').locator('button.mchip', { hasText: 'כל החברות' }).click();
    // סינון לפי מספר קו מההודעה
    const ln = (all.find((x) => (x.l || []).length) || {}).l[0];
    const hit = all.filter((x) => (x.l || []).includes(ln) || (x.t + ' ' + (x.b || '')).includes(ln)).length;
    await $('.card input.search').fill(ln);
    await until('סינון ההודעות לפי קו ' + ln, (n) => document.querySelectorAll('.card .newsrow').length === n, hit);
    await $('.card input.search').fill('');
    // חזרה למשרד התחבורה
    await $('.card .srcrow button.src-mot').click();
    await untilGone('סגירת ההודעות', '.card .newsrow');
    same(await monthChips(), off.map(dmy), 'חודשי משרד התחבורה אחרי חזרה מההודעות');
    // שנה עם צילומי אתרים והודעות, בלי משרד התחבורה
    await yearChip('2011').click();
    await until('שורת המקורות של 2011', () => { const b = document.querySelectorAll('.card .srcrow button.mchip'); return b.length === 2; });
    same(await texts('.card .srcrow button.mchip'), [SRC.web, 'הודעות החברות · ' + ops('2011')], 'כפתורי המקורות של 2011');
    same(await pressed('.card .srcrow button.mchip'), [SRC.web], 'המקור המסומן ב-2011');
    same(await monthChips(), MONTHS.webMonths.filter((m) => m.startsWith('2011')).sort().reverse().map(dmy), 'חודשי 2011');
    // שנה שיש בה רק הודעות
    await yearChip('2005').click();
    await until('ההודעות של 2005', (n) => document.querySelectorAll('.card .newsrow').length === n, newsOf('2005').length);
    same(await texts('.card .srcrow button.mchip'), ['הודעות החברות · ' + ops('2005')], 'כפתורי המקורות של 2005');
    same(await monthChips(), [], 'כפתורי חודשים בשנה שיש בה רק הודעות');
    // וחזרה לשנה רגילה
    const y = MONTHS.months.slice().sort().pop().slice(0, 4);
    await yearChip(y).click();
    await untilGone('סגירת ההודעות במעבר ל-' + y, '.card .newsrow');
    await until('החודשים של ' + y, () => [...document.querySelectorAll('.card .months button.mchip')].some((e) => /^\d\d\.\d{4}$/.test(e.innerText.trim())));
    same(await $('.card .srcrow').count(), 0, 'שורת מקורות אחרי חזרה ל-' + y);
  });

  await step('לשונית התחנות: שינויי החודש, "כל התקופה" ועמוד התחנה', async () => {
    await open();
    await tab('תחנות').click();
    await until('הכתובת של לשונית התחנות', () => location.hash === '#t=stops');
    const sm = MONTHS.stopMonths.slice().sort().reverse();
    await until('שינויי התחנות של החודש', () => document.querySelectorAll('.slist .srow').length > 0);
    same(await monthChips(), sm.map(dmy), 'חודשי התחנות');
    const cur = J('changes/stops-' + sm[0] + '.json').changes;
    const codes = async () => [...new Set(await pg.evaluate(() => [...document.querySelectorAll('.slist .srow a.latlink')].map((a) => a.getAttribute('href').replace('#stop=', ''))))].sort();
    same(await codes(), [...new Set(cur.filter((c) => !['new', 'del'].includes(c.k)).map((c) => String(c.c)))].sort(), 'התחנות ששינו שם / מקום / רציף ב-' + dmy(sm[0]));
    const ren = cur.find((c) => c.k === 'renamed');
    if (ren) ok((await texts('.slist .srow')).some((t) => t.includes(ren.on) && t.includes(ren.nn) && t.includes('שינוי שם')), 'חסרה שורת שינוי השם של תחנה ' + ren.c);
    await $('.card .months button.mchip', { hasText: dmy(sm[1]) }).click();
    const c2 = J('changes/stops-' + sm[1] + '.json').changes.find((c) => !['new', 'del'].includes(c.k));
    await until('שינויי התחנות של החודש הקודם', (c) => !!document.querySelector('.slist .srow a.latlink[href="#stop=' + c + '"]'), String(c2.c));
    // "כל התקופה": קורות החיים של התחנות; חיפוש לפי מק"ט
    await $('.card .months button.mchip', { hasText: 'כל התקופה' }).click();
    await $('.card input.search').fill(STOP.code);
    await until('התחנה ב"כל התקופה"', (c) => !!document.querySelector('.slist .srow a.latlink[href="#stop=' + c + '"]'), STOP.code);
    ok((await text('.slist .srow')).includes(STOP.name + ' (' + STOP.code + ')'), 'בשורת התחנה חסר השם: ' + await text('.slist .srow'));
    // ציר הקווים של התחנה
    await $('.slist .srow a.latlink[href="#stop=' + STOP.code + '"]').first().click();
    await untilText('ציר הקווים של התחנה', '.lat', 'עוצרים בה היום');
    same(new URL(pg.url()).hash, '#stop=' + STOP.code, 'הכתובת אחרי פתיחת התחנה');
  });

  await step('קישור ישיר לתחנה: סוג התחנה, הקווים שעוצרים בה, ציר הקווים ומעבר לקו', async () => {
    await open('#stop=' + STOP.code);
    await untilText('ציר הקווים של התחנה מקישור ישיר', '.lat', 'עוצרים בה היום');
    same(await pg.evaluate(() => document.querySelector('.tabs a[role=tab][aria-selected="true"]').innerText.trim()), '🚏 תחנות', 'הלשונית המסומנת בקישור לתחנה');
    await untilText('סוג התחנה', '.lat', STOP.type);
    await untilText('שורת התחנה', '.slist .srow', STOP.name + ' (' + STOP.code + ')');
    const ev = J('stopev/' + STOP.code.slice(0, 2) + '.json')[STOP.code];
    const lastBy = {}; ev.ev.forEach((e) => { lastBy[e[2]] = e; });
    const now = [...new Set(Object.values(lastBy).filter((e) => !['out', 'mvout'].includes(e[3]) && e[1] && ev.a.includes(e[2])).map((e) => e[1]))].sort();
    same((await texts('.lat .latnow a.latb')).sort(), now, 'הקווים שעוצרים בתחנה היום');
    ok((await texts('.lat .latlist .latrow')).some((t) => t.includes(STOP.row)), 'בציר הקווים חסרה השורה "' + STOP.row + '"');
    const ld = (await texts('.lat .latlist .latrow .latd')).map((d) => d.split('.').reverse().join('-'));
    same(ld, ld.slice().sort().reverse(), 'ציר הקווים של התחנה מהחדש לישן');
    // מהתחנה לקו
    await $('.lat .latnow a.latb[href="#' + LINE.rd + '"]').click();
    await untilText('עמוד הקו מתוך התחנה', '.linehead .badge', LINE.num);
    await untilText('ציר הזמן של הקו מתוך התחנה', '.tl .ev', LINE.last);
  });

  await step('התפריט ⋯ והתצוגה הקודמת', async () => {
    await open();
    await $('button.dmore').click();
    await until('התפריט', () => !!document.querySelector('.lmenu[role=dialog]'));
    same(await $('.lmenu .lmitem').count(), 6, 'מספר השורות בתפריט ⋯');
    await $('.lmenu .lmitem', { hasText: 'לתצוגה הקודמת' }).click();
    await untilGone('סגירת התפריט', '.lmenu');
    // בתצוגה הקודמת: השינויים האחרונים עם ההערות, והחיפוש עובד כמו קודם
    await untilText('השינויים האחרונים בתצוגה הקודמת', '.card', LINE.last);
    await $('input.search').fill(LINE.num);
    await until('תוצאות החיפוש בתצוגה הקודמת', (h) => !!document.querySelector('.llist a.lrow[href="' + h + '"]'), '#' + LINE.rd);
    await $('.llist a.lrow[href="#' + LINE.rd + '"]').click();
    await untilText('עמוד הקו בתצוגה הקודמת', '.tl .ev', LINE.last);
    await $('button.back, a.back').first().click();
    await $('input.search').fill('');
    await $('button.kathead[aria-pressed]').click();
    await untilText('"שינויים לפי יום" בתצוגה הקודמת', '.card .dayhead', LINE.last);
    ok(await $('.card a.lrow[href="#' + LINE.rd + '"] .lmeta').count() > 0, 'בתצוגה הקודמת חסרה שורת המפעיל והמק״ט (lmeta) בשורה של קו ' + LINE.num);
    await $('button.dmore').click();
    ok(await $('.lmenu .lmitem', { hasText: 'לתצוגה החדשה' }).count() === 1, 'אחרי המעבר אין בתפריט "לתצוגה החדשה"');
  });

  // קבצים של הכלי שלא נמצאו (למשל קובץ שפוצל ולא נטען), ונתונים קבועים שאף שלב לא ביקש
  [...missing].filter((p) => p.startsWith('/line-history/') || p.startsWith('/vendor/')).forEach((p) => bad('קובץ של הכלי לא נמצא (404): ' + p));
  const have = [];
  (function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : have.push(path.relative(FIX, path.join(d, e.name)).split(path.sep).join('/')))); })(FIX);
  have.filter((f) => !asked.has(f)).forEach((f) => bad('קובץ בנתונים הקבועים שהדף לא ביקש: ' + f + ' (הכתובת השתנתה? או שהקובץ מיותר)'));

  await b.close(); srv.close();
  if (problems.length) { console.log('\n❌ ' + problems.length + ' בעיות:\n' + [...new Set(problems)].map((p) => ' · ' + p).join('\n')); process.exit(1); }
  console.log('\n✓ הקו בזמן: כל הבדיקות עברו');
}
main().catch((e) => { console.error(e); process.exit(1); });
