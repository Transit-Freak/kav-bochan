// בדיקת "צי הרכבים" (fleet/index.html) בדפדפן, מול נתונים קבועים וקטנים (tests/fixtures/fleet):
// המסך הראשי (המספרים למעלה וכרטיסי החברות), דף חברה (לשוניות, סינון, מיון), רשימת הדגמים (כל הדגמים, בלי הגבלה),
// דף דגם (הגרף "אצל אילו חברות הדגם הזה נפוץ" וההערה על נסיעות בודדות), פתיחת שורות לפי חברה (▾), כרטיס רכב,
// קישור ישיר למסך, החיפוש, התפריט "עוד" ושאר המצבים (שנטענים בלי שגיאה). הרשת החיצונית חסומה. לא משווים פיקסלים.
//
// הרצה:   node tests/fleet/page.mjs   (צריך playwright ו-Chromium — ראו README.md)
// משתנים: CHROME — הדפדפן (ברירת מחדל: Chromium של Playwright, ואם אין — /usr/bin/google-chrome)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..', '..');
const FIX = path.join(REPO, 'tests', 'fixtures', 'fleet');
const { chromium } = require('playwright');

// מה שצפוי לפי הנתונים הקבועים (ראו make_fixtures.py). מחליפים נתונים — מעדכנים גם כאן
const OP = { ref: 35, name: 'בית שמש אקספרס', total: 52, active: 22, moved: 28 };
const KAB = { retired: '59', active: '39' };          // "ירדו מהשירות (צי סדיר)" ו"רכבי קבלן פעילים" במסך הראשי
const TOP_OP = ['נתיב אקספרס', '27'];                 // הכרטיס הראשון במסך הראשי: החברה עם הכי הרבה אוטובוסים פעילים
// דגם של רכבי קו: שלושה רכבים שלו דווחו בכמה נסיעות בקוד של חברה אחרת ("נסיעות בודדות")
const M1 = {
  name: 'יוטונג סין TFGBW', head: '11 רכבים, כולם פעילים · נסעו ב-2 חברות',
  chart: [['אלקטרה אפיקים', '11'], ['קווים', '1']],
  occ: 'אלקטרה אפיקים תחבורה (2 רכבים), מטרופולין (רכב אחד)',
  rows: 11, plate: '39733704', subs: ['אלקטרה אפיקים', 'מטרופולין', 'אלקטרה אפיקים תחבורה'], subsOcc: 2,
  chain: ['60333504', 'קווים ← אלקטרה אפיקים']
};
// דגם של רכבי קבלן שעברו בין הרבה חברות: אצלם אין "נסיעות בודדות", ולכן אין הערה
const M2 = { name: 'מאן פולין 430 מנוע RR2', head: '4 פעילים מתוך 11 רכבים · נסעו ב-10 חברות', chartN: 10, chartTop: ['אגד', '7'], rows: 11 };
const HIDDEN = ['חברה מוסתרת', 'מפעיל 99', 'דגם מוסתר'];   // חברה מספר 21 וחברה בלי שם — הדף לא מציג אותן

// מה שאפשר לחשב ישר מהנתונים: כמה רכבים (מספר רכב אחד = רכב אחד), כמה פעילים, כמה חברות וכמה דגמים
function fromFixture() {
  const d = JSON.parse(fs.readFileSync(path.join(FIX, 'fleet.json'), 'utf8'));
  const ops = d.operators.filter((o) => ![2, 20, 21].includes(o.ref) && !/^מפעיל \d+$/.test(o.name));
  const last = {}, models = {};
  for (const o of ops) for (const v of o.vehicles) { if (!last[v[0]] || v[2] > last[v[0]]) last[v[0]] = v[2]; if (v[5]) (models[v[5]] = models[v[5]] || new Set()).add(v[0]); }
  const lim = new Date(new Date(d.updated).getTime() - d.retire_days * 864e5).toISOString().slice(0, 10);
  const maxLast = Object.values(last).sort().pop();
  const top = Object.entries(models).sort((a, b) => b[1].size - a[1].size)[0];
  return {
    plates: Object.keys(last).length, active: Object.values(last).filter((x) => x >= lim).length, ops: ops.length,
    models: Object.keys(models).length, topModel: [top[0], String(top[1].size)], updated: maxLast.split('-').reverse().join('.')
  };
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
// השרת: הריפו כמו שהוא, ובקשות הנתונים של הכלי — מהנתונים הקבועים. קובץ נתונים שאין — 404 (הדף אמור להסתדר)
function serve() {
  return new Promise((res) => {
    const srv = http.createServer((rq, rs) => {
      let p = decodeURIComponent(rq.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = p.startsWith('/fleet/data/') ? path.join(FIX, p.slice('/fleet/data/'.length))
        : p === '/bus/data/gps.json' ? path.join(FIX, 'bus-gps.json')
          : /^\/[^/]+\/data\//.test(p) ? '' : path.join(REPO, p);
      if (!f || !f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); rs.end(); return; }
      rs.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rs);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

const fmt = (n) => n.toLocaleString('en-US');
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  const X = fromFixture();
  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port;
  let exe = process.env.CHROME;
  if (!exe) { try { exe = chromium.executablePath(); if (!fs.existsSync(exe)) exe = ''; } catch (e) { exe = ''; } }
  const b = await chromium.launch(exe ? { executablePath: exe } : { executablePath: '/usr/bin/google-chrome' });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
  await ctx.route((u) => !u.href.startsWith(base), (r) => r.abort());   // תמונות, גופנים, כל השאר — חסומים
  const problems = [], errs = [];
  let checks = 0, nav = 0;
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push(e.message));

  // מחכה עד שהמסך מראה את מה שצפוי (הדף מצייר מחדש כשקובצי הנתונים מגיעים); אם לא — רושם בעיה עם מה שיש על המסך
  async function expect(what, fn, arg, want) {
    checks++;
    let got;
    for (let t = 0; t < 50; t++) {
      try { got = await pg.evaluate(fn, arg); } catch (e) { got = 'שגיאה: ' + e.message.split('\n')[0]; }
      if (want === undefined ? got === true : eq(got, want)) return true;
      await pg.waitForTimeout(200);
    }
    problems.push(what + (want === undefined ? ' — ' + JSON.stringify(got) : '\n   צפוי: ' + JSON.stringify(want) + '\n   יש:   ' + JSON.stringify(got)).slice(0, 900));
    return false;
  }
  // טעינה מלאה של הדף בכתובת (עם הסולמית), כמו מי שקיבל קישור
  const open = (hash) => pg.goto(base + '/fleet/?t=' + (++nav) + (hash || ''));
  const click = async (what, sel) => { try { await pg.click(sel, { timeout: 10000 }); } catch (e) { problems.push(what + ': אין על מה ללחוץ (' + sel + ')'); } };

  // ── 1. המסך הראשי ──
  await open();
  await expect('המסך הראשי: המספרים למעלה', () => [...document.querySelectorAll('#view .kpis .kpi')].map((k) => [k.querySelector('b').textContent, k.querySelector('span').textContent]),
    null, [[fmt(X.plates), 'רכבים במעקב'], [fmt(X.active), 'פעילים'], [KAB.retired, 'ירדו מהשירות (צי סדיר)'], [String(X.ops), 'מפעילים'], [KAB.active, 'רכבי קבלן פעילים']]);
  await expect('המסך הראשי: "הנתונים מעודכנים ל-"', () => (document.querySelector('#view .upd') || {}).textContent, null, 'הנתונים מעודכנים ל-' + X.updated + ' · העדכון הבא בלילה');
  await expect('המסך הראשי: כרטיס לכל חברה', () => document.querySelectorAll('#view .cards a.card.op').length, null, X.ops);
  await expect('המסך הראשי: הכרטיס הראשון', () => { const c = document.querySelector('#view .cards a.card.op'); return c && [c.querySelector('h2').textContent, c.querySelector('.n').textContent]; }, null, TOP_OP);
  await expect('המסך הראשי: החברות לפי מספר האוטובוסים הפעילים, מהגדולה לקטנה',
    () => { const n = [...document.querySelectorAll('#view .cards a.card.op')].filter((c) => c.querySelector('.lbl').textContent === 'אוטובוסים פעילים').map((c) => +c.querySelector('.n').textContent.replace(/\D/g, '')); return n.length > 5 && n.every((x, i) => !i || n[i - 1] >= x); });
  await expect('המסך הראשי: חברות מוסתרות לא מופיעות', (h) => h.filter((x) => document.querySelector('#view').textContent.includes(x)), HIDDEN, []);
  await expect('המסך הראשי: הלשונית "חברות" מסומנת', () => [...document.querySelectorAll('.nav .mode.on')].map((x) => x.textContent), null, ['חברות']);

  // ── 2. דף חברה ──
  await click('כרטיס החברה', `#view .cards a.card.op:has(h2:text-is("${OP.name}"))`);
  await expect('דף חברה: הכותרת', () => { const h = document.querySelector('#view .ophead'); return h && [h.querySelector('h2').textContent, h.querySelector('.sub2').textContent.split(' · ')[0]]; }, null, [OP.name, OP.total + ' רכבים']);
  await expect('דף חברה: פעילים ועברו לחברה אחרת', () => [...document.querySelectorAll('#view .ophead .pills span')].map((x) => x.textContent).filter((x) => /פעילים$|עברו/.test(x) && !/קבלן/.test(x)),
    null, [OP.active + ' פעילים', OP.moved + ' עברו לחברה אחרת']);
  await expect('דף חברה: הכתובת', () => location.hash, null, '#op=' + OP.ref);
  await expect('דף חברה: "איפה אני"', () => (document.querySelector('#view .crumb') || {}).textContent, null, 'צי הרכבים ‹ חברות ‹ ' + OP.name);
  await expect('דף חברה: שלוש לשוניות, "סקירה" פתוחה', () => [...document.querySelectorAll('#view .ctabs a')].map((a) => a.textContent + (a.classList.contains('on') ? '*' : '')), null, ['סקירה*', 'רכבים', 'שנתונים']);
  await expect('דף חברה: בסקירה יש "הצי של"', (n) => (document.querySelector('#view .panel.ov h3') || {}).textContent === 'הצי של ' + n && document.querySelectorAll('#view .panel.ov a.t').length > 0, OP.name);

  await click('הלשונית "רכבים"', '#view .ctabs a:text-is("רכבים")');
  const rowsOf = () => document.querySelectorAll('#view table tbody tr.v').length;
  await expect('דף חברה, רכבים: שורה לכל רכב', rowsOf, null, OP.total);
  await expect('דף חברה, רכבים: המונה', () => (document.querySelector('#view .fcount') || {}).textContent, null, OP.total + ' רכבים');
  await expect('דף חברה, רכבים: כותרות הטבלה', () => [...document.querySelectorAll('#view table thead th')].map((x) => x.textContent.replace(/[ⓘ▲▼]/g, '').trim()),
    null, ['מספר רכב', 'סוג הרכב', 'שנתון', 'יצרן ודגם', 'נסיעות ביום', 'ק"מ ביום (משוער)', 'ק"מ סה"כ (משוער)', 'ק"מ במד (רשמי)', 'נצפה לראשונה', 'נצפה לאחרונה', 'מצב']);
  await click('הסינון "פעילים"', '#view .filters button.fchip:text-is("פעילים")');
  await expect('דף חברה, רכבים: רק פעילים', () => [document.querySelectorAll('#view table tbody tr.v').length, [...new Set([...document.querySelectorAll('#view table tbody tr.v td:last-child')].map((x) => x.textContent))]], null, [OP.active, ['פעיל']]);
  await expect('דף חברה, רכבים: הכתובת אחרי הסינון', () => location.hash, null, '#op=' + OP.ref + '&tab=veh&st=1');
  await click('הסינון "הכול"', '#view .filters button.fchip:text-is("הכול")');
  await expect('דף חברה, רכבים: "הכול" מחזיר את כל הרכבים', rowsOf, null, OP.total);
  await click('הכותרת "שנתון"', '#view table thead th:has-text("שנתון")');
  await expect('דף חברה, רכבים: מיון לפי שנתון, מהחדש לישן', () => { const y = [...document.querySelectorAll('#view table tbody tr.v td:nth-child(3)')].map((x) => +x.textContent || 0); return y.length > 5 && y[0] > y[y.length - 1] && y.every((x, i) => !i || y[i - 1] >= x); });
  await click('הכותרת "שנתון" שוב', '#view table thead th:has-text("שנתון")');
  await expect('דף חברה, רכבים: לחיצה שנייה הופכת את המיון', () => { const y = [...document.querySelectorAll('#view table tbody tr.v td:nth-child(3)')].map((x) => +x.textContent || 0); return y.length > 5 && y[0] < y[y.length - 1] && y.every((x, i) => !i || y[i - 1] <= x); });
  await click('הלשונית "שנתונים"', '#view .ctabs a:text-is("שנתונים")');
  await expect('דף חברה, שנתונים: שורה לכל שנתון', () => document.querySelectorAll('#view .yrow.yact').length > 3 && /כמה רכבים מכל שנתון/.test(document.querySelector('#view .ptitle').textContent));
  await click('"חברות" בשורת "איפה אני"', '#view .crumb a:text-is("חברות")');
  await expect('חזרה מדף חברה למסך הראשי', () => document.querySelectorAll('#view .cards a.card.op').length, null, X.ops);

  // קישור ישיר לדף חברה עם לשונית וסינון
  await open('#op=' + OP.ref + '&tab=veh&st=1');
  await expect('קישור ישיר לחברה, רכבים פעילים', () => [(document.querySelector('#view .ophead h2') || {}).textContent, document.querySelectorAll('#view table tbody tr.v').length], null, [OP.name, OP.active]);

  // ── 3. רשימת הדגמים ──
  await open();
  await expect('המסך הראשי נטען', () => document.querySelectorAll('#view .kpis .kpi').length, null, 5);
  await click('הלשונית "דגמים"', '.nav .mode[data-m="type"]');
  await expect('דגמים: כרטיס לכל דגם, בלי הגבלה (' + X.models + ')', () => document.querySelectorAll('#view .cards a.card').length, null, X.models);
  await expect('דגמים: הדגם הגדול ראשון', () => { const c = document.querySelector('#view .cards a.card'); return c && [c.querySelector('h2').textContent, c.querySelector('.n').textContent]; }, null, X.topModel);
  await expect('דגמים: מהגדול לקטן', () => { const n = [...document.querySelectorAll('#view .cards a.card .n')].map((x) => +x.textContent.replace(/\D/g, '')); return n.length > 48 && n.every((x, i) => !i || n[i - 1] >= x); });
  await expect('דגמים: כל כרטיס עם שם, מספר ו"חברות"', () => [...document.querySelectorAll('#view .cards a.card')].filter((c) => !c.querySelector('h2').textContent.trim() || !(+c.querySelector('.n').textContent.replace(/\D/g, '') > 0) || !/\d+ חברות/.test(c.querySelector('.pills').textContent)).length, null, 0);
  await expect('דגמים: בכרטיס של ' + M1.name + ' — בלי החברות של הנסיעות הבודדות', (m) => { const c = [...document.querySelectorAll('#view .cards a.card')].find((x) => x.querySelector('h2').textContent === m); return c && [...c.querySelectorAll('.pills span')].map((x) => x.textContent); }, M1.name, ['11 פעילים', '2 חברות']);
  await expect('דגמים: דגם של חברה מוסתרת לא מופיע', (h) => h.filter((x) => document.querySelector('#view').textContent.includes(x)), HIDDEN, []);
  await expect('דגמים: הכתובת והלשונית', () => [location.hash, [...document.querySelectorAll('.nav .mode.on')].map((x) => x.textContent)], null, ['#m=type', ['דגמים']]);
  await click('"הכי מקולקלים"', '#view .filters button.fchip:text-is("הכי מקולקלים")');
  await expect('דגמים, "הכי מקולקלים": אחוזים בכרטיסים', () => { const c = [...document.querySelectorAll('#view .cards a.card .n')].map((x) => x.textContent); return c.length > 0 && c.every((x) => /^\d+%$/.test(x)); });
  await click('"מדד אמינות הדגמים"', '#view .filters button.fchip:text-is("מדד אמינות הדגמים")');
  await expect('דגמים, "מדד אמינות הדגמים": נטען', () => document.querySelector('#view .filters button.fchip.on').textContent === 'מדד אמינות הדגמים' && document.querySelector('#view').textContent.length > 400);
  await click('"הדגמים הגדולים"', '#view .filters button.fchip:text-is("הדגמים הגדולים")');
  await expect('דגמים: חזרה ל"הדגמים הגדולים"', () => document.querySelectorAll('#view .cards a.card').length, null, X.models);

  // ── 4. דף דגם: הגרף, ההערה על נסיעות בודדות, הטבלה ──
  await click('כרטיס הדגם', `#view .cards a.card:has(h2:text-is("${M1.name}"))`);
  const chart = () => { const p = [...document.querySelectorAll('#view .panel')].find((x) => (x.querySelector('.ptitle') || {}).textContent === 'אצל אילו חברות הדגם הזה נפוץ'); return p ? [...p.querySelectorAll('.yrow')].map((r) => [r.children[0].textContent, r.querySelector('.c').textContent]) : 'אין גרף'; };
  const notes = () => { const p = [...document.querySelectorAll('#view .panel')].find((x) => (x.querySelector('.ptitle') || {}).textContent === 'אצל אילו חברות הדגם הזה נפוץ'); return p ? [...p.querySelectorAll('p.note')].map((x) => x.textContent) : 'אין גרף'; };
  await expect('דף דגם: הכותרת', () => { const h = document.querySelector('#view .ophead'); return h && [h.querySelector('h2').textContent, h.querySelector('.sub2').textContent]; }, null, [M1.name, M1.head]);
  await expect('דף דגם: הגרף "אצל אילו חברות הדגם הזה נפוץ"', chart, null, M1.chart);
  await expect('דף דגם: ההערות מתחת לגרף (נסיעות בודדות)', notes, null,
    ['רכב שעבר בין חברות נספר בכל אחת', 'לא נספרו נסיעות בודדות או דיווחים שגויים של רכבי הדגם אצל חברות אחרות: ' + M1.occ]);
  await expect('דף דגם: הפס של החברה הראשונה מלא, ושל השנייה קצר ממנו', () => { const p = [...document.querySelectorAll('#view .panel')].find((x) => (x.querySelector('.ptitle') || {}).textContent === 'אצל אילו חברות הדגם הזה נפוץ'); const w = [...p.querySelectorAll('.ybar i')].map((i) => i.getBoundingClientRect().width / i.parentNode.getBoundingClientRect().width); return w.length === 2 && w[0] > 0.98 && w[1] > 0 && w[1] < 0.2; });
  await expect('דף דגם: "אמינות הדגם"', () => [...document.querySelectorAll('#view .ptitle')].map((x) => x.textContent).filter((x) => /^אמינות הדגם/.test(x)), null, ['אמינות הדגם · 11 רכבי קו']);
  await expect('דף דגם: שורה לכל רכב', rowsOf, null, M1.rows);
  await expect('דף דגם: עמודת החברה, ורכב שעבר בין חברות — כל החברות לפי הסדר', (c) => { const th = document.querySelector('#view table thead th'); const tr = [...document.querySelectorAll('#view table tbody tr.v')].find((r) => r.children[1].textContent.trim() === c[0]); return [th && th.textContent, tr && tr.querySelector('.pexp').textContent.replace(/[▾▴]/g, '').trim()]; }, M1.chain, ['חברה', M1.chain[1]]);
  await expect('דף דגם: הכתובת ו"איפה אני"', () => [new URLSearchParams(location.hash.slice(1)).get('model'), (document.querySelector('#view .crumb') || {}).textContent], null, [M1.name, 'צי הרכבים ‹ דגמים ‹ ' + M1.name]);
  await click('שנתון 2025', '#view .filters button.fchip:has-text("2025 · 1")');
  await expect('דף דגם: סינון לפי שנתון', () => [...document.querySelectorAll('#view table tbody tr.v td:nth-child(4)')].map((x) => x.textContent), null, ['2025']);
  await click('"כל השנתונים"', '#view .filters button.fchip:text-is("כל השנתונים")');
  await expect('דף דגם: "כל השנתונים" מחזיר את כל הרכבים', rowsOf, null, M1.rows);

  // ── 5. פתיחת שורה: ▾ מראה שורה לכל חברה, ונסיעות בודדות מסומנות ──
  const row = `#view table tbody tr.v:has(a.vl:text-is("${M1.plate}"))`;
  await click('▾ בשורת הרכב', row + ' .pexp');
  await expect('פתיחת שורה: שורה לכל חברה', () => [...document.querySelectorAll('#view table tbody tr.vsub')].map((r) => r.children[0].childNodes[0].textContent), null, M1.subs);
  await expect('פתיחת שורה: תאריכים בכל שורה, ו"נסיעות בודדות" בשתיים', () => { const r = [...document.querySelectorAll('#view table tbody tr.vsub')]; return [r.every((x) => /^\d\d\.\d\d\.\d{4} – \d\d\.\d\d\.\d{4}$/.test(x.querySelector('.vsd').textContent)), r.filter((x) => x.lastElementChild.textContent === 'נסיעות בודדות').length]; }, null, [true, M1.subsOcc]);
  await expect('פתיחת שורה: הכפתור מסומן כפתוח, וכרטיס הרכב לא נפתח', () => [document.querySelectorAll('#view .pexp[aria-expanded="true"]').length, document.querySelectorAll('#view tr.v.vopen').length, document.querySelectorAll('.ovl').length], null, [1, 1, 0]);
  await click('▴ בשורת הרכב', row + ' .pexp');
  await expect('פתיחת שורה: לחיצה שנייה סוגרת', () => document.querySelectorAll('#view table tbody tr.vsub').length, null, 0);

  // ── 6. כרטיס רכב ──
  await click('שורת הרכב', row + ' td:nth-child(3)');
  await expect('כרטיס רכב: נפתח עם מספר הרכב, המצב והדגם', () => { const m = document.querySelector('.ovl .modal'); return m && [m.querySelector('.plate').textContent, m.querySelector('.mhead .st').textContent, m.querySelector('.vttl').textContent]; }, null, [M1.plate, 'פעיל', M1.name]);
  await expect('כרטיס רכב: פרטי הרכב מהמאגר הממשלתי, ממאגר ציי הרכב ומהשידורים',
    () => { const t = (document.querySelector('.ovl .modal') || { innerText: '' }).innerText; return ['שנת ייצור', 'רישיון בתוקף עד', 'ימי פעילות שנמדדו', 'איפה הוא נסע', 'מד הקילומטרים הרשמי', 'מהמאגר הממשלתי — כל השדות', 'סטטוס רישום'].filter((x) => !t.includes(x)); }, null, []);
  await expect('כרטיס רכב: החברה, ושתי שורות "נסיעות בודדות"', () => { const s = document.querySelector('.ovl .modal .vfold summary'); return s && [s.querySelector('b').textContent, [...s.querySelectorAll('.occ b')].map((x) => x.textContent).sort()]; }, null, ['אלקטרה אפיקים', ['אלקטרה אפיקים תחבורה', 'מטרופולין']]);
  await expect('כרטיס רכב: הכתובת', () => new URLSearchParams(location.hash.slice(1)).get('v'), null, M1.plate);
  await click('"הצגה" ב"איפה הוא נסע"', '.ovl .modal .vfold summary .arr');
  await expect('כרטיס רכב: הפירוט לפי חברה נפתח', () => { const d = document.querySelector('.ovl .modal .vfold'); return d && d.open && [...d.querySelectorAll('.vin .msec')].map((x) => x.textContent).sort(); }, null, ['מהשידורים (דאטאבוס) — אלקטרה אפיקים', 'נסיעות בודדות — אלקטרה אפיקים תחבורה', 'נסיעות בודדות — מטרופולין'].sort());
  await click('סגירת הכרטיס', '.ovl .modal .mhead .x');
  await expect('כרטיס רכב: נסגר, והכתובת בלי הרכב', () => [document.querySelectorAll('.ovl').length, new URLSearchParams(location.hash.slice(1)).get('v')], null, [0, null]);

  // קישור ישיר לדף דגם עם כרטיס רכב פתוח
  await open('#m=type&model=' + encodeURIComponent(M1.name) + '&v=' + M1.plate);
  await expect('קישור ישיר לדגם ולרכב', () => [(document.querySelector('#view .ophead h2') || {}).textContent, (document.querySelector('.ovl .modal .plate') || {}).textContent], null, [M1.name, M1.plate]);
  await expect('קישור ישיר לדגם: ההערה על נסיעות בודדות', notes, null, ['רכב שעבר בין חברות נספר בכל אחת', 'לא נספרו נסיעות בודדות או דיווחים שגויים של רכבי הדגם אצל חברות אחרות: ' + M1.occ]);

  // דגם של רכבי קבלן: הרבה חברות בגרף, ובלי הערה על נסיעות בודדות
  await open('#m=type&model=' + encodeURIComponent(M2.name));
  await expect('דגם של רכבי קבלן: הכותרת', () => { const h = document.querySelector('#view .ophead'); return h && [h.querySelector('h2').textContent, h.querySelector('.sub2').textContent]; }, null, [M2.name, M2.head]);
  await expect('דגם של רכבי קבלן: הגרף', () => { const p = [...document.querySelectorAll('#view .panel')].find((x) => (x.querySelector('.ptitle') || {}).textContent === 'אצל אילו חברות הדגם הזה נפוץ'); if (!p) return 'אין גרף'; const r = [...p.querySelectorAll('.yrow')].map((x) => [x.children[0].textContent, x.querySelector('.c').textContent]); return [r.length, r[0], r.every((x, i) => !i || +r[i - 1][1] >= +x[1])]; }, null, [M2.chartN, M2.chartTop, true]);
  await expect('דגם של רכבי קבלן: בלי הערה על נסיעות בודדות', notes, null, ['רכב שעבר בין חברות נספר בכל אחת']);
  await expect('דגם של רכבי קבלן: שורה לכל רכב', rowsOf, null, M2.rows);

  // ── 7. החיפוש ──
  await open();
  await expect('המסך הראשי נטען', () => document.querySelectorAll('#view .kpis .kpi').length, null, 5);
  await pg.fill('#q', 'TFGBW');
  await expect('חיפוש: הצעה לדגם', () => [...document.querySelectorAll('#sugg a')].map((a) => a.childNodes[0].textContent), null, ['🚌 ' + M1.name]);
  await click('ההצעה בחיפוש', '#sugg a');
  await expect('חיפוש: ההצעה פותחת את דף הדגם', () => [(document.querySelector('#view .ophead h2') || {}).textContent, document.querySelector('#q').value, document.querySelector('#sugg').hidden], null, [M1.name, '', true]);
  await pg.fill('#q', M1.plate.slice(0, 5));
  await expect('חיפוש: הצעה למספר רכב', (p) => [...document.querySelectorAll('#sugg a')].map((a) => a.childNodes[0].textContent).includes('🔢 ' + p), M1.plate);
  await pg.fill('#q', '');

  // ── 8. התפריט "עוד" ושאר המצבים: נטענים בלי שגיאה ──
  await open();
  await expect('המסך הראשי נטען', () => document.querySelectorAll('#view .kpis .kpi').length, null, 5);
  await click('"עוד"', '#nmore');
  await expect('התפריט "עוד"', () => [...document.querySelectorAll('#menu .mitem')].map((x) => x.childNodes[0].textContent), null, ['מעברים', 'אשכול ביום', 'לפי קו', 'כל הרכבים', 'נתונים חשודים', '⬇ הורדה לאקסל', '🔗 שיתוף', 'על המקורות']);
  await click('"כל הרכבים" בתפריט', '#menu .mitem:has-text("כל הרכבים")');
  await expect('כל הרכבים: הכותרת, 200 שורות ראשונות וכפתור "הצגת עוד"', () => [(document.querySelector('#view .ptitle') || {}).textContent, document.querySelectorAll('#view table tbody tr.v').length, !!document.querySelector('#view button.more'), !!document.querySelector('#menu')],
    null, ['כל הרכבים במעקב · ' + fmt(X.plates), 200, true, false]);
  await click('"הצגת עוד"', '#view button.more');
  await expect('כל הרכבים: "הצגת עוד" מראה את כולם', rowsOf, null, X.plates);
  for (const [m, name] of [['moves', 'מעברים'], ['city', 'ערים'], ['cluster', 'אשכול ביום'], ['line', 'לפי קו'], ['suspect', 'נתונים חשודים']]) {
    await open('#m=' + m);
    await expect(name + ': המצב נטען (הלשונית מסומנת ויש תוכן)', (n) => { const v = document.querySelector('#view'); return [...document.querySelectorAll('.nav .mode.on')].map((x) => x.textContent).join() === n && v.textContent.trim().length > 30 && !/טוען/.test(v.textContent); }, name);
  }
  await open('#m=moves');
  await expect('מעברים: בוחרים מאיפה ולאן, והחברה ברשימה', (n) => { const t = document.querySelector('#view').textContent; return /מאיפה ולאן/.test(t) && t.includes(n + ' · '); }, OP.name);

  // ── 9. טלפון: המסך הראשי ודף דגם בלי גלילה לצדדים ──
  await pg.setViewportSize({ width: 390, height: 800 });
  for (const [what, hash] of [['המסך הראשי', ''], ['דף חברה', '#op=' + OP.ref], ['רשימת הדגמים', '#m=type']]) {
    await open(hash);
    await expect('בטלפון, ' + what + ': נטען', () => document.querySelectorAll('#view .kpis .kpi, #view .ophead').length > 0);
    await expect('בטלפון, ' + what + ': בלי גלילה לצדדים', () => document.documentElement.scrollWidth - window.innerWidth, null, 0);
  }

  if (errs.length) problems.push('שגיאות בדף — ' + [...new Set(errs)].join(' | '));
  await b.close(); srv.close();
  if (problems.length) { console.log('נכשל (' + problems.length + ' מתוך ' + checks + '):\n' + problems.join('\n')); process.exit(1); }
  console.log('עבר: ' + checks + ' בדיקות בצי הרכבים');
}
main().catch((e) => { console.error(e); process.exit(1); });
