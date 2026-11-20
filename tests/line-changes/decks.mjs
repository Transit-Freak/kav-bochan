// בדיקת המצגות של "מצגת לשינוי בקו" מול תמונה-במילים קבועה (snapshots.json): כל מצגת בנתונים הקבועים
// (tests/fixtures/line-changes/data) נבנית ב-Chromium, בשלוש הצורות (מצגת, שלט A4, סטטוס), ונרשם מה יצא —
// הטקסט של כל שקף, קטעי המסלול הצבועים במפה (מספר ואורך), גבולות המפה והמקום שבו "כאן המסלול משתנה".
// בלוח לפי יעד — השורות והתאים, ובדיקה שסדר השעות על המסך נכון (משמאל לימין / מימין לשמאל).
// לא משווים פיקסלים. השעה בדפדפן קבועה (19.11.2026), ואריחי המפה והגופנים מהרשת חסומים.
//
// הרצה:   npm i --no-save playwright leaflet@1.9.4 && node tests/line-changes/decks.mjs
// עדכון:  UPDATE_SNAPSHOTS=1 node tests/line-changes/decks.mjs   (אחרי שבדקתם שהשינוי רצוי — ראו README.md)
// משתנים: CHROME — הדפדפן (ברירת מחדל: Chromium של Playwright, ואם אין — /usr/bin/google-chrome); ONLY=<מזהה> — מצגת אחת
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..', '..');
const FIX = path.join(REPO, 'tests', 'fixtures', 'line-changes', 'data');
const SNAP = path.join(HERE, 'snapshots.json');
const { chromium } = require('playwright');
const LEAFLET = process.env.LEAFLET_DIR || path.join(path.dirname(require.resolve('leaflet/package.json')), 'dist');

// המצגות (ראו גם make_fixtures.py) ומה כל אחת בודקת
const DECKS = {
  '10971-20261121': 'שינוי מסלול + חלופה שהוחלפה (השוואה משוערת); רעש בשרטוט ליד חדרה לא נצבע',
  '10999-20261117': 'הרבה תחנות שבוטלו, "לא נמצאה תחנה חלופית קרובה", חלוקה לעמודות',
  '10357-20261120': 'תחנות שנוספו ובוטלו, כמה עמודים',
  '10590-20261120': 'רחוב מקביל (שינוי קטן — עמוד אחד)',
  '11152-20261118': 'שינוי מסלול עם קטע ארוך',
  '10282-20261116': 'רעש בשרטוט שהוסר',
  '14457-20261120': 'רעש בשרטוט — המפה מתמקדת בשינוי',
  '12459-20261120': 'תחנות שבוטלו, עמודות',
  '10970-20261117': 'כמה כיוונים וחלופות',
  '10970-20261115-v': 'חלופה שבוטלה',
  '12285-20261129-v': 'חלופה חדשה',
  '70001-20261118-t': 'שינוי בלוח הזמנים',
  '10436-20261119-t': 'שינוי בלוח הזמנים (קו 436, רק ביום חמישי)',
  '45009-20261115-n': 'קו חדש',
  '11827-20261120-n': 'קו חדש בין ערים, הלוך וחזור: בשקף המפה, בשלט ובסטטוס — בלוק לכל כיוון (תחנות ושעות), סימן לכל כיוון במפה',
  '71011-20261113-e': 'קו שמבוטל',
  '72001-20261120-t': 'שינוי קטן בלו"ז (נסיעה אחת בשישי בוטלה) — עמוד אחד בתקציר'
};
// "איך להציג את לוח הזמנים": כל כרטיס משנה את מה שיוצא (השקפים בכל צורה) ואת קובץ האקסל — בהודעה על שינוי (שני קווים לאותו
// יעד — יש גם "טבלה משולבת"), בשינוי קטן של נסיעה אחת (קו 1 ביתר עילית — בלי "טבלה משולבת", עם הסבר) ובלו"ז עדכני (436 ו-437)
const CARDS = {
  'cards-chg': { url: '?c=70001-20261118-t,45009-20261115-n', comb: true },
  'cards-small': { url: '?c=72001-20261120-t', comb: false, rm: '14:36' },
  'cards-cu': { url: '?m=tt&c=10436,10437', comb: true }
};
// לוח לפי יעד: קרית מלאכי (עיר), בשני סדרי השעות — עם פיצול ימי חול אוטומטי (יום א׳ · ב׳–ד׳ · יום ה׳, וקובץ אקסל
// עם כותרת "יום חול" ממוזגת ותאים ממוזגים); בלי פיצול; "צפוף" + "להכניס לעמוד אחד" — כל הקווים (לא נכנס: נבדק שמופיע
// "צריך לפחות N עמודים"), ובלי הקווים העירוניים (מספר קטן מ-100, נמחקים במצב עריכה) — נבדק שנכנס בעמוד אחד.
// בכל עמוד נבדקות שורת "המידע הוכן על ידי אדם פרטי · לא פרסום רשמי" והקרדיט
const BOARDS = {
  'board-ltr': { tord: 'ltr', xlsx: true }, 'board-rtl': { tord: 'rtl' },
  'board-nosplit': { tord: 'ltr', opts: ['bsp=no'], forms: ['sign'] },
  'board-dense-1': { tord: 'ltr', opts: ['bdn=1', 'bpg=1'], forms: ['sign'] },
  'board-1p': { tord: 'ltr', del: 100, opts: ['bdn=1', 'bpg=1'], forms: ['sign'], pages: 1, xlsx: true }
};
// לוח לפי יעד בלוד (14 קווים, לפי הסדר שבו נוספו): קו 11 (רמלה–לוד) עם שלוש חלופות — לכל חלופה בשורה צבע ואות משלה (בתא,
// בהערה מתחת לתא, במקרא בתחתית העמוד ובאקסל), בשני סדרי השעות; וכל אחת מאפשרויות "סדר הקווים" (נשמרת עם הלוח).
// board-lod-adj — קודם קווים בינעירוניים ואחר כך קווים בעיר: 11 ו-5 (בין לוד לרמלה, רוב התחנות בעיר אחת) — בפס הקווים העירוניים.
// board-hood — לוח של מקום: שכונת גני איילון בלוד
const LOD = '36011,68005,53009,32012,31019,14384,12408,11251,15174,21134,36081,11464,12509,11884';
// לוח לפי יעד בצפת (כל הקווים בעיר, 58) ובשבעת הקווים לצפת מנחמיה (979, 981, 984, 982, 992, 993, 989):
// רוחב עמודות אוטומטי — הלוח נמוך יותר מאשר ברוחב שווה (בפועל, לפי גובה השורות בדף, ולפי המודל); ריקון תא ומחיקת טקסט — בלי גובה;
// מיון בשתי רמות (מפעיל, ואז מספר קו — עם סדר מפעילים שנבחר) ו"בלי פסי יעד"; העברת קו לפס אחר — נשמרת ומגיעה לאקסל
const SAFED7 = '?m=tt&c=14979,10981,10984,10982,11992,12993,11989';
// השורות בלוח לפי הסדר: [פס] קו קו … (קו פעם אחת)
async function lineSeq(pg) {
  return pg.evaluate(() => {
    const out = [];
    document.querySelectorAll('.sitem:not(.off) .s-bd tbody tr').forEach((tr) => {
      if (tr.classList.contains('bband')) { if (!/\(המשך\)/.test(tr.textContent)) out.push('[' + tr.textContent.trim() + ']'); return; }
      const l = tr.getAttribute('data-ln'), mk = tr.getAttribute('data-mk');
      if (l && !out.includes(mk)) out.push(mk);
    });
    const ln = {}; document.querySelectorAll('.sitem:not(.off) .s-bd tr.br').forEach((tr) => { if (tr.querySelector('td.bl')) ln[tr.getAttribute('data-mk')] = tr.getAttribute('data-ln') + '/' + ((tr.querySelector('td.bl small.op') || {}).textContent || ''); });
    return out.map((x) => ln[x] || x);
  });
}
// סכום הגבהים של השורות (קו וכיוון) בכל העמודים, בפיקסלים של השקף (בלי ההקטנה במסך)
async function rowsHeight(pg) {
  return pg.evaluate(() => {
    let t = 0;
    document.querySelectorAll('.sitem:not(.off) .sframe').forEach((f) => { const sl = f.querySelector('.slide'), k = sl.getBoundingClientRect().width / sl.offsetWidth; f.querySelectorAll('.s-bd tbody tr.br').forEach((tr) => { t += tr.getBoundingClientRect().height / k; }); });
    return { h: Math.round(t), pages: document.querySelectorAll('.sitem:not(.off) .s-bd').length, sc: +(document.querySelector('.sitem:not(.off) .s-bd') || { style: { getPropertyValue: () => 1 } }).style.getPropertyValue('--bd') || 1 };
  });
}
async function setEdits(pg, fn) {
  await pg.evaluate((src) => { const k = Object.keys(localStorage).find((x) => x.startsWith('lc-ed2:')); const e = JSON.parse(localStorage.getItem(k)); (new Function('e', src))(e); localStorage.setItem(k, JSON.stringify(e)); window.name = 'keep'; }, fn);
  await pg.reload(); await pg.waitForSelector('.s-bd', { timeout: 30000 }); await pg.click('[data-form="sign"]', { force: true }); await pg.waitForTimeout(1000);
}
async function xlsxSheet(pg) {
  const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.evaluate(() => document.getElementById('xl').click())]);
  const s = fs.readFileSync(await dl.path()).toString('utf8');
  return s.slice(s.indexOf('<worksheet'), s.indexOf('</worksheet>'));
}
const LOD_BOARDS = {
  'board-lod': { url: '?m=tt&c=' + LOD, orders: ['type', 'add', 'dest', 'op', 'num'], alts: '11', xlsx: true, types: true, manual: true, fill: 0.85 },
  'board-lod-adj': { url: '?m=tt&c=14384,11464,12408,53009,36011,68005' },
  'board-hood': { place: 'גני איילון', alts: '11' }
};
// הפסים והקווים בלוח לפי הסדר: "פס: קו קו …"
async function bandSeq(pg) {
  return pg.evaluate(() => {
    const out = [];
    document.querySelectorAll('.sitem:not(.off) .s-bd tbody tr').forEach((tr) => {
      if (tr.classList.contains('bband')) { if (!/\(המשך\)/.test(tr.textContent)) out.push([tr.textContent.trim()]); return; }
      const ln = tr.getAttribute('data-ln'), L = out[out.length - 1];
      if (tr.classList.contains('bsec')) { if (getComputedStyle(tr).display !== 'none') out.push(['§ ' + tr.textContent.trim()]); return; }
      if (L && ln && L[L.length - 1] !== ln) L.push(ln);
    });
    return out.map((L) => L.length > 1 ? L[0] + ': ' + L.slice(1).join(' ') : L[0]);
  });
}
// חלופות בלוח: בכל שורה — לכל אות צבע אחד, ואותיות שונות בצבעים שונים; ניגודיות 4.5 לפחות על לבן; ההערה מתחת לתא באותו צבע
// ועם אותה אות; ובמקרא — אותן אותיות באותם צבעים. מחזיר תיאור לתמונה-במילים ורשימת בעיות
async function altCheck(pg, line) {
  return pg.evaluate((line) => {
    const lum = (c) => { const v = c.match(/\d+/g).slice(0, 3).map((x) => { x = x / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const con = (c) => 1.05 / (lum(c) + 0.05);
    const bad = [], rows = {}, leg = [];
    document.querySelectorAll('.sitem:not(.off) .s-bd tr.br').forEach((tr) => {
      const map = {};
      tr.querySelectorAll('td.bt .t.alt').forEach((t) => {
        const al = t.querySelector('.al'), c = getComputedStyle(t).color;
        if (!al) { bad.push(tr.getAttribute('data-ln') + ': שעה בחלופה בלי אות — ' + t.firstChild.nodeValue); return; }
        if (getComputedStyle(al).color !== c) bad.push(tr.getAttribute('data-ln') + ': האות בצבע אחר מהשעה');
        const L = al.textContent;
        if (map[L] && map[L].c !== c) bad.push(tr.getAttribute('data-ln') + ': ' + L + ' בשני צבעים');
        (map[L] = map[L] || { c, n: 0 }).n++;
        if (con(c) < 4.5) bad.push(tr.getAttribute('data-ln') + ': ניגודיות ' + con(c).toFixed(2) + ' ל-' + L);
      });
      const cs = Object.values(map).map((x) => x.c);
      if (new Set(cs).size !== cs.length) bad.push(tr.getAttribute('data-ln') + ': שתי חלופות באותו צבע');
      tr.querySelectorAll('td.bt .bna').forEach((n) => { const L = Object.keys(map).find((k) => n.textContent.startsWith(k + ' ')); if (!L) bad.push(tr.getAttribute('data-ln') + ': הערה בלי אות — ' + n.textContent); else if (getComputedStyle(n).color !== map[L].c) bad.push(tr.getAttribute('data-ln') + ': הערה בצבע אחר — ' + n.textContent); });
      if (Object.keys(map).length) {
        const k = tr.getAttribute('data-rk'), e = document.querySelector('.sitem:not(.off) .bd-al[data-ak="' + k + '"]');
        if (!e) bad.push(tr.getAttribute('data-ln') + ': אין שורה במקרא');
        else e.querySelectorAll('.bd-ali').forEach((x) => { const L = x.querySelector('.al').textContent; if (!map[L] || getComputedStyle(x).color !== map[L].c) bad.push(tr.getAttribute('data-ln') + ': במקרא ' + L + ' בצבע אחר'); });
        if (tr.getAttribute('data-ln') === line) rows[k] = Object.keys(map).sort().map((L) => L + ' ' + map[L].c + ' ×' + map[L].n).join(' · ');
      }
    });
    document.querySelectorAll('.sitem:not(.off) .bd-al').forEach((e) => { if (e.textContent.indexOf('קו ' + line + ' ') === 0 || e.textContent.indexOf('קו ' + line + ':') === 0) leg.push(e.textContent.replace(/\s+/g, ' ').trim()); });
    return { rows, legend: leg, bad };
  }, line);
}
// באקסל: השעות של חלופה — באותו צבע ועם האות (rich text), ושורה במקרא לכל קו וכיוון עם חלופות
async function xlsxAlts(pg) {
  const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.click('#xl', { force: true })]);
  const s = fs.readFileSync(await dl.path()).toString('utf8');
  const sheet = s.slice(s.indexOf('<worksheet'), s.indexOf('</worksheet>'));
  const pairs = new Set();
  for (const m of sheet.matchAll(/<r><rPr>(?:(?!<\/rPr>).)*<color rgb="FF([0-9A-F]{6})"\/>(?:(?!<\/rPr>).)*<\/rPr><t xml:space="preserve">([^<]*)<\/t><\/r>/g)) {
    const L = (m[2].match(/\d\d:\d\d\u200e?([א-ת]׳)/) || [])[1];   // האות מיד אחרי השעה
    if (L) pairs.add(L + ' ' + m[1]);
  }
  const legend = [...sheet.matchAll(/<c r="A(\d+)"[^>]*><is><t[^>]*>(קו [^<]*)<\/t>/g)].map((m) => m[2]);
  return { cells: [...pairs].sort(), legend };
}
// כמה מלא כל עמוד של הלוח: גובה השורות בטבלה מתוך המקום שיש לטבלה בעמוד (בלי הכותרות של העמודות)
async function pageFill(pg) {
  return pg.evaluate(() => Array.from(document.querySelectorAll('.sitem:not(.off) .sframe')).filter((f) => f.querySelector('.s-bd')).map((f) => {
    const body = f.querySelector('.cu-body'), th = f.querySelector('thead'), tb = f.querySelector('tbody');
    const avail = body.getBoundingClientRect().bottom - th.getBoundingClientRect().bottom, used = tb.getBoundingClientRect().height;
    return Math.round(used / avail * 100) / 100;
  }));
}
// באקסל: כותרות הפרקים (לפי סוג קו) ומספרי הקווים בעמודה B — לפי הסדר
async function xlsxSecs(pg) {
  const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.click('#xl', { force: true })]);
  const s = fs.readFileSync(await dl.path()).toString('utf8');
  const sheet = s.slice(s.indexOf('<worksheet'), s.indexOf('</worksheet>'));
  const secs = [...sheet.matchAll(/<c r="A\d+"[^>]*><is><t[^>]*>(קווים [^<]*)<\/t>/g)].map((m) => m[1]);
  const lines = [...sheet.matchAll(/<c r="B\d+"[^>]*><is><t[^>]*>(\d+[^<]*)<\/t>/g)].map((m) => m[1]);
  return { secs, lines };
}
// הודעה על שינוי בתצוגת "טבלה לפי יעד": שינוי בלו"ז (436, רק ביום חמישי — עמודה משלו) וקו חדש (9), עם סימון מה שמשתנה
const CHG_BOARDS = { 'chg-board': '10436-20261119-t,45009-20261115-n' };
// בכל עמוד של לוח: שורת "אדם פרטי" והקרדיט, בתוך השקף
async function footCheck(pg) {
  return pg.evaluate(() => Array.from(document.querySelectorAll('.sitem:not(.off) .sframe')).filter((f) => f.querySelector('.s-bd')).every((f) => {
    const sl = f.querySelector('.slide').getBoundingClientRect(), cr = f.querySelector('.bd-cr'), pv = f.querySelector('.bd-priv');
    return cr && pv && /המידע הוכן על ידי אדם פרטי · לא פרסום רשמי/.test(pv.textContent) && /kavbochan\.app/.test(cr.textContent) &&
      cr.getBoundingClientRect().bottom <= sl.bottom + 1 && pv.getBoundingClientRect().bottom <= sl.bottom + 1;
  }));
}
// בתא של מספר הקו בלוח: המספר, שם המפעיל וההערות הקטנות ("קו חדש", "עד…", "מ-…") — אחד מתחת לשני, בלי לעלות זה על זה
// ובלי לצאת מהתא (לפי המלבן של כל אחד על המסך)
async function lineCellCheck(pg) {
  return pg.evaluate(() => {
    const bad = [];
    document.querySelectorAll('.sitem:not(.off) .s-bd td.bl').forEach((td) => {
      const tr = td.getBoundingClientRect(), kids = Array.from(td.children).filter((e) => e.getClientRects().length).map((e) => {
        // עם המסגרת שמסביב למספר (box-shadow בעיצוב "צבעי המפעיל") — היא חלק ממה שרואים
        const r = e.getBoundingClientRect(), sh = getComputedStyle(e).boxShadow, k = r.width / (e.offsetWidth || r.width || 1);
        const sp = sh && sh !== 'none' ? Math.max(0, ...(sh.match(/-?[\d.]+px/g) || []).slice(0, 4).map((x, i, a) => i === 3 ? parseFloat(x) + Math.max(Math.abs(parseFloat(a[0])), Math.abs(parseFloat(a[1]))) : 0)) * k : 0;
        return { e, r: { top: r.top - sp, bottom: r.bottom + sp, left: r.left - sp, right: r.right + sp } };
      });
      const ln = td.closest('tr').getAttribute('data-ln') || '?';
      // המספר באמצע התא (לרוחב), בכל אורך — 1, 15, 384, 10א (עד פיקסל)
      const bg = td.querySelector('.badge');
      if (bg && bg.getClientRects().length) { const r = bg.getBoundingClientRect(), d = (r.left + r.right) / 2 - (tr.left + tr.right) / 2; if (Math.abs(d) > 1) bad.push(ln + ': המספר לא באמצע התא (' + d.toFixed(1) + 'px)'); }
      kids.forEach((a, i) => {
        if (a.r.top < tr.top - 0.5 || a.r.bottom > tr.bottom + 0.5) bad.push(ln + ': ' + (a.e.className || a.e.tagName) + ' יוצא מהתא');
        kids.slice(i + 1).forEach((b) => {
          const ov = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top), oh = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
          if (ov > 0.5 && oh > 0.5) bad.push(ln + ': ' + (a.e.className || a.e.tagName) + ' עולה על ' + (b.e.className || b.e.tagName) + ' (' + ov.toFixed(1) + 'px)');
        });
      });
    });
    return bad;
  });
}
// מה יצא בכל הצורות (הטקסט של כל השקפים) ואיזה קובץ אקסל (שמות הגיליונות, וכמה שעות מחוקות)
async function cardRun(pg, tv, tall) {
  await pg.evaluate(([tv, tall]) => { document.querySelector('[data-tv="' + tv + '"]').click(); const t = document.getElementById('tall'); if (tv === 'sum' && t.checked !== tall) t.click(); }, [tv, !!tall]);
  await pg.waitForTimeout(700);
  const out = { checked: await pg.evaluate(() => (document.querySelector('#tvcards [aria-checked="true"]') || {}).getAttribute?.('data-tv')) };
  for (const form of FORMS) {
    await pg.evaluate((f) => document.querySelector('[data-form="' + f + '"]').click(), form);
    await pg.waitForTimeout(700);
    out[form] = await pg.evaluate(() => Array.from(document.querySelectorAll('.sitem:not(.off) .slide')).map((x) => x.innerText.replace(/\s+/g, ' ')).join(' ¶ '));
  }
  out.rm = await pg.evaluate(() => Array.from(document.querySelectorAll('.sitem:not(.off) .s-bd td.bt .t.rm')).map((x) => x.firstChild.nodeValue.trim()));
  await pg.evaluate(() => document.querySelector('[data-form="deck"]').click());
  await pg.waitForTimeout(500);
  const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.evaluate(() => document.getElementById('xl').click())]);
  const x = fs.readFileSync(await dl.path()).toString('utf8');
  out.xlsx = (x.match(/<sheet name="[^"]+"/g) || []).map((m) => m.slice(13, -1)).join(' + ') + ' · מחוקות: ' + (x.match(/<strike\/>/g) || []).length;
  return out;
}
// קובץ האקסל (בלי דחיסה — אפשר לקרוא את ה-XML ישר): הכותרות, התאים הממוזגים בשורות, שורת "אדם פרטי" והקישור בקרדיט
async function xlsxCheck(pg) {
  const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.click('#xl', { force: true })]);
  const s = fs.readFileSync(await dl.path()).toString('utf8');
  const sheet = s.slice(s.indexOf('<worksheet'), s.indexOf('</worksheet>'));
  const merges = (sheet.match(/<mergeCell ref="[^"]+"/g) || []).map((m) => m.slice(16, -1));
  const v = (ref) => { const m = sheet.match(new RegExp('<c r="' + ref + '"[^>]*>(?:<is><t[^>]*>([^<]*)</t></is>)?')); return m ? m[1] || '' : null; };
  const headRow = merges.some((m) => /^D\d+:[E-Z]\d+$/.test(m) && /יום חול/.test(v(m.split(':')[0]) || ''));
  return { wkHead: headRow, rowSpans: merges.filter((m) => { const [a, b] = m.split(':'); return /^[D-H]/.test(a) && a.replace(/\D/g, '') === b.replace(/\D/g, '') && a[0] !== 'A'; }).length,
    priv: /המידע הוכן על ידי אדם פרטי · לא פרסום רשמי/.test(sheet), link: /<hyperlink ref="A\d+"/.test(sheet) && /kavbochan\.app/.test(sheet) };
}
const FORMS = ['deck', 'sign', 'status'];
const TWO_DIRS = ['11827-20261120-n', '45009-20261115-n'];

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
function serve() {
  return new Promise((res) => {
    const srv = http.createServer((rq, rs) => {
      let p = decodeURIComponent(rq.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = p.startsWith('/line-changes/data/') ? path.join(FIX, p.slice('/line-changes/data/'.length)) : path.join(REPO, p);
      if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); rs.end(); return; }
      rs.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rs);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

// ריצה דטרמיניסטית: שעה קבועה, ותפיסת ציורי Leaflet (fitBounds, קווים בצבעי השינוי, סמני "כאן המסלול משתנה")
const INIT = `;(function(){
  var T0 = new Date('2026-11-19T10:00:00+02:00').getTime(), RD = Date, off = T0 - RD.now();
  function D(a,b,c,d,e,f,g){ if (!(this instanceof D)) return new RD(RD.now() + off).toString(); var x = arguments.length ? new (Function.prototype.bind.apply(RD, [null].concat([].slice.call(arguments))))() : new RD(RD.now() + off); Object.setPrototypeOf(x, D.prototype); return x; }
  D.prototype = RD.prototype; D.now = function(){ return RD.now() + off; }; D.UTC = RD.UTC; D.parse = RD.parse; window.Date = D;
  try { if (window.name !== 'keep') { localStorage.clear(); sessionStorage.clear(); } } catch (e) {}   // keep — טעינה מחדש באמצע בדיקה (מה שנשמר נשאר)
  var W = window; W.__lc = { fb: [], pl: [], mk: [] };
  Object.defineProperty(W, 'L', { configurable: true, enumerable: true, get: function(){ return W.__Lv; }, set: function(v){ W.__Lv = v; if (v && v.Map && v.Layer && !v.__hk) { v.__hk = 1; hook(v); } } });
  function hook(L) {
    var tag = function (m) { var c = m._container, f = c && c.closest && c.closest('.sframe'); return (f ? f.getAttribute('data-id') : '?') + (c && c.classList.contains('inset') ? '#mini' : ''); };
    var fb = L.Map.prototype.fitBounds; L.Map.prototype.fitBounds = function (b, o) { W.__lc.fb.push({ m: tag(this), b: L.latLngBounds(b).toBBoxString() }); return fb.call(this, b, o); };
    var ad = L.Layer.prototype.addTo; L.Layer.prototype.addTo = function (map) {
      try {
        if (this instanceof L.Polyline && !(this instanceof L.Polygon)) { var c = this.options.color; if (c === '#1f9152' || c === '#b8361f') { var ll = this.getLatLngs(), len = 0; for (var i = 1; i < ll.length; i++) len += ll[i - 1].distanceTo(ll[i]); W.__lc.pl.push({ m: tag(map), c: c === '#1f9152' ? 'green' : 'red', len: Math.round(len) }); } }
        else if (this instanceof L.Marker && this.options.icon && /lc-mk seg/.test(this.options.icon.options.html || '')) { var p = this.getLatLng(); W.__lc.mk.push({ m: tag(map), at: p.lat.toFixed(4) + ',' + p.lng.toFixed(4) }); }
      } catch (e) {}
      return ad.call(this, map);
    };
  }
})();`;

const rnd = (s) => s.split(',').map((x) => (+x).toFixed(4)).join(',');
async function collect(pg, board) {
  return pg.evaluate(({ board }) => {
    const out = {};
    document.querySelectorAll('.sitem:not(.off) .sframe').forEach((f) => {
      // הטקסט של השקף: כל קטעי הטקסט לפי הסדר, בלי המפה, כלי העריכה ומספר העמוד
      const id = f.getAttribute('data-id'), parts = [];
      const w = document.createTreeWalker(f.querySelector('.slide'), NodeFilter.SHOW_TEXT);
      for (let t; (t = w.nextNode());) { const v = t.nodeValue.replace(/\s+/g, ' ').trim(); if (v && !t.parentElement.closest('.leaflet-container,.smap,.inset,.noprint,.pg,style,script')) parts.push(v); }
      const o = { text: parts.join(' ') };
      if (board) {
        o.rows = Array.from(f.querySelectorAll('.s-bd tbody tr')).map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.innerText.replace(/\s+/g, ' ').trim()).join(' | '));
        o.text = undefined;
      }
      out[id] = o;
    });
    const L = window.__lc;
    for (const x of L.pl) { if (!out[x.m.replace('#mini', '')]) continue; const k = x.m.endsWith('#mini') ? 'mini' : 'map'; const o = out[x.m.replace('#mini', '')]; (o[k] = o[k] || {}); o[k][x.c] = o[k][x.c] || []; o[k][x.c].push(x.len); }
    for (const x of L.fb) { const o = out[x.m.replace('#mini', '')]; if (o) o[x.m.endsWith('#mini') ? 'miniBounds' : 'bounds'] = x.b; }
    for (const x of L.mk) { const o = out[x.m]; if (o) (o.changeAt = o.changeAt || []).push(x.at); }
    return out;
  }, { board }).then((o) => {
    for (const k of Object.keys(o)) {
      const v = o[k];
      for (const m of ['map', 'mini']) if (v[m]) for (const c of Object.keys(v[m])) v[m][c].sort((a, b) => a - b);
      if (v.bounds) v.bounds = rnd(v.bounds);
      if (v.miniBounds) v.miniBounds = rnd(v.miniBounds);
      if (v.changeAt) v.changeAt.sort();
    }
    return o;
  });
}
// בלוח: הסדר על המסך של השעות בכל תא — לפי המיקום (שורה אחרי שורה), מול הסדר ב-DOM; וכל סימן צמוד לשעה שלו
async function orderCheck(pg, tord) {
  return pg.evaluate((tord) => {
    const bad = [];
    document.querySelectorAll('.sitem:not(.off) .s-bd td.bt').forEach((td) => {
      const u = Array.from(td.querySelectorAll('.t')).map((t) => { const rg = document.createRange(); rg.selectNodeContents(t.firstChild); const r = rg.getBoundingClientRect(); return { t: t.firstChild.nodeValue.trim(), x: r.left, xr: r.right, y: r.top, h: r.height, mk: Array.from(t.querySelectorAll('.al,sup,.xn')).map((m) => { const r = m.getBoundingClientRect(); return [r.left, r.right]; }), al: !!t.querySelector('.al') }; });
      if (!u.length) return;
      const lns = [];
      u.slice().sort((a, b) => a.y - b.y).forEach((v) => { const L = lns[lns.length - 1]; if (L && v.y - L[0].y <= u[0].h * 0.5) L.push(v); else lns.push([v]); });
      const vis = [].concat(...lns.map((L) => L.sort((a, b) => (tord === 'ltr' ? a.x - b.x : b.x - a.x))));
      if (!vis.every((v, i) => v === u[i])) bad.push(td.closest('tr').getAttribute('data-ln') + ': ' + vis.map((v) => v.t).join(' '));
      // כל סימן (אות החלופה, ×N, ימים) מיד אחרי מה שלפניו בכיוון הקריאה — השעה או הסימן הקודם (משמאל לימין — מימין לה,
      // מימין לשמאל — משמאל לה). האות של חלופה — צמודה לשעה שלה, וקרובה אליה יותר מאשר לשעה הבאה באותה שורה
      const ln = td.closest('tr').getAttribute('data-ln');
      u.forEach((v, i) => {
        let prev = tord === 'ltr' ? v.xr : v.x;
        v.mk.forEach(([l, r], j) => {
          const g = tord === 'ltr' ? l - prev : prev - r;
          if (g < -0.1 * v.h || g > 0.8 * v.h) bad.push(ln + ': סימן רחוק מ-' + v.t);
          if (j === 0 && v.al && g > 0.25 * v.h) bad.push(ln + ': האות לא צמודה ל-' + v.t);
          prev = tord === 'ltr' ? r : l;
        });
        const nx = vis[vis.indexOf(v) + 1];
        if (v.al && nx && Math.abs(nx.y - v.y) < v.h * 0.5) {
          const end = tord === 'ltr' ? Math.max(...v.mk.map((m) => m[1]), v.xr) : Math.min(...v.mk.map((m) => m[0]), v.x);
          const gNext = tord === 'ltr' ? nx.x - end : end - nx.xr, gOwn = tord === 'ltr' ? v.mk[0][0] - v.xr : v.x - v.mk[0][1];
          if (gNext <= gOwn + 1) bad.push(ln + ': האות של ' + v.t + ' קרובה לשעה הבאה (' + gOwn.toFixed(1) + ' / ' + gNext.toFixed(1) + ')');
        }
      });
    });
    return bad;
  }, tord);
}

async function main() {
  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port;
  let exe = process.env.CHROME;
  if (!exe) { try { exe = chromium.executablePath(); if (!fs.existsSync(exe)) exe = ''; } catch (e) { exe = ''; } }
  const b = await chromium.launch(exe ? { executablePath: exe } : { executablePath: '/usr/bin/google-chrome' });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
  await ctx.addInitScript(INIT);
  await ctx.route(/unpkg\.com\/leaflet@1\.9\.4\/dist\/([^?]+)/, (r) => r.fulfill({ path: path.join(LEAFLET, r.request().url().split('/dist/')[1].split('?')[0]) }));
  await ctx.route((u) => !u.href.startsWith(base) && !/unpkg\.com\/leaflet/.test(u.href), (r) => r.abort());   // אריחים, גופנים, כל השאר — חסומים
  const got = {}, problems = [];
  const only = process.env.ONLY;
  for (const id of Object.keys(DECKS)) {
    if (only && only !== id) continue;
    const pg = await ctx.newPage(), errs = [];
    pg.on('pageerror', (e) => errs.push(e.message));
    await pg.goto(base + '/line-changes/?c=' + id);
    await pg.waitForSelector('.sframe', { timeout: 30000 });
    // מצגת עם לוח זמנים: התצוגה "תקציר" (הלוח — בבדיקות של לוח המודעות למטה)
    await pg.evaluate(() => { const b = document.querySelector('#ttgrp:not([hidden]) [data-tv="sum"]'); if (b) b.click(); });
    await pg.waitForTimeout(800);
    await pg.evaluate(() => window.LCApp && window.LCApp.ready && window.LCApp.ready());
    got[id] = {};
    for (const form of FORMS) {
      await pg.evaluate(() => { window.__lc.fb = []; window.__lc.pl = []; window.__lc.mk = []; });
      await pg.click('[data-form="' + form + '"]', { force: true });
      await pg.waitForTimeout(800);
      await pg.evaluate(() => window.LCApp && window.LCApp.ready && window.LCApp.ready());
      await pg.waitForTimeout(400);
      got[id][form] = await collect(pg, false);
      // קו חדש בשני כיוונים: הבלוקים של שני הכיוונים נכנסים בשקף, בלי לגלוש מעבר לתחתית
      if (TWO_DIRS.includes(id)) {
        const bad = await pg.evaluate(() => Array.from(document.querySelectorAll('.sitem:not(.off) .sframe')).filter((f) => f.querySelector('.kdirs')).map((f) => {
          const r = f.querySelector('.slide').getBoundingClientRect(), n = f.querySelectorAll('.kdir').length;
          const over = Array.from(f.querySelectorAll('.side,.sg-what,.st-what')).some((e) => e.scrollHeight > e.clientHeight + 1) || Array.from(f.querySelectorAll('.kdir, .legend, .sfoot, .sg-foot, .st-foot')).some((e) => e.getBoundingClientRect().bottom > r.bottom + 1);
          return n !== 2 || over ? f.getAttribute('data-id') + (n !== 2 ? ' (' + n + ' כיוונים)' : ' (גולש)') : '';
        }).filter(Boolean));
        const n2 = await pg.evaluate(() => document.querySelectorAll('.sitem:not(.off) .kdirs').length);
        if (!n2) problems.push(id + ' ' + form + ': אין בלוק לכל כיוון');
        for (const x of bad) problems.push(id + ' ' + form + ': ' + x);
      }
    }
    if (errs.length) problems.push(id + ': שגיאה בדף — ' + errs.join(' | '));
    await pg.close();
  }
  for (const [key, ids] of Object.entries(CHG_BOARDS)) {
    if (only && only !== key) continue;
    const pg = await ctx.newPage(), errs = [];
    pg.on('pageerror', (e) => errs.push(e.message));
    await pg.goto(base + '/line-changes/?c=' + ids);
    await pg.waitForSelector('.sframe', { timeout: 30000 });
    await pg.evaluate(() => document.querySelector('[data-tv="board"]').click());
    await pg.waitForSelector('.s-bd', { timeout: 30000 });
    got[key] = {};
    for (const form of FORMS) {
      await pg.click('[data-form="' + form + '"]', { force: true });
      await pg.waitForTimeout(800);
      const pages = await collect(pg, true), rows = [];
      Object.keys(pages).forEach((sid) => (pages[sid].rows || []).forEach((r) => { if (!/\(המשך\)\s*$/.test(r)) rows.push(r); }));
      // הסימונים: חדשה / בשעה חדשה (nw) ושבוטלה (rm), עם השעה
      const marks = await pg.evaluate(() => Array.from(document.querySelectorAll('.sitem:not(.off) .s-bd td.bt .t.nw, .sitem:not(.off) .s-bd td.bt .t.rm, .sitem:not(.off) .s-bd td.bt .was')).map((x) => (x.classList.contains('was') ? 'הערה ' : x.classList.contains('rm') ? 'בוטלה ' : 'חדשה ') + (x.classList.contains('was') ? x.textContent : x.firstChild.nodeValue)));
      const heads = await pg.evaluate(() => { const f = document.querySelector('.sitem:not(.off) .s-bd'); return f ? Array.from(f.querySelectorAll('thead th')).map((t) => t.textContent.trim() + (t.colSpan > 1 ? ' [' + t.colSpan + ']' : '')) : []; });
      got[key][form] = { heads: heads, rows: rows, marks: marks, slides: Object.keys(pages).length };
      if (!(await footCheck(pg))) problems.push(key + ' ' + form + ': חסרה בעמוד שורת "המידע הוכן על ידי אדם פרטי · לא פרסום רשמי" או הקרדיט');
      for (const x of await orderCheck(pg, 'ltr')) problems.push(key + ' ' + form + ': סדר השעות — ' + x);
      for (const x of await lineCellCheck(pg)) problems.push(key + ' ' + form + ': תא הקו — ' + x);
    }
    // אקסל: הלוח החדש עם אותם סימונים, שורת "אדם פרטי" והקישור
    got[key].xlsx = await xlsxCheck(pg);
    // תא מספר הקו: בכל עיצוב, רגיל וצפוף, בשלוש הצורות — במחשב ובטלפון (המספר לא עולה על שם המפעיל)
    for (const vp of [[1440, 1000], [390, 844]]) {
      await pg.setViewportSize({ width: vp[0], height: vp[1] });
      for (const look of ['kav', 'light', 'op', 'large']) {
        await pg.evaluate((l) => document.querySelector('[data-look="' + l + '"]').click(), look);
        for (const dn of ['0', '1']) {
          await pg.evaluate((d) => document.querySelector('[data-bdn="' + d + '"]').click(), dn);
          for (const form of FORMS) {
            await pg.evaluate((f) => document.querySelector('[data-form="' + f + '"]').click(), form);
            await pg.waitForTimeout(400);
            for (const x of await lineCellCheck(pg)) problems.push(key + ' ' + vp[0] + 'px ' + look + (dn === '1' ? ' צפוף' : '') + ' ' + form + ': תא הקו — ' + x);
          }
        }
      }
    }
    if (!got[key].xlsx.priv || !got[key].xlsx.link) problems.push(key + ': באקסל חסרה שורת "אדם פרטי" או הקישור בקרדיט');
    if (errs.length) problems.push(key + ': שגיאה בדף — ' + errs.join(' | '));
    await pg.close();
  }
  for (const [key, cs] of Object.entries(CARDS)) {
    if (only && only !== key) continue;
    const pg = await ctx.newPage(), errs = [];
    pg.on('pageerror', (e) => errs.push(e.message));
    await pg.goto(base + '/line-changes/' + cs.url);
    await pg.waitForSelector('.sframe', { timeout: 30000 });
    const ui = await pg.evaluate(() => ({ shown: !document.getElementById('ttgrp').hidden, dflt: (document.querySelector('#tvcards [aria-checked="true"]') || {}).getAttribute?.('data-tv'),
      comb: !document.querySelector('[data-tv="comb"]').disabled, why: document.getElementById('tvcsub').textContent }));
    if (!ui.shown) problems.push(key + ': אין בחירה של תצוגת לוח הזמנים');
    if (ui.dflt !== 'board') problems.push(key + ': ברירת המחדל ' + ui.dflt + ' במקום לוח מודעות');
    if (ui.comb !== cs.comb) problems.push(key + ': "טבלה משולבת" ' + (ui.comb ? 'פעילה' : 'כבויה') + ' במקום ' + (cs.comb ? 'פעילה' : 'כבויה'));
    if (!ui.comb && !/מופיע כשיש כמה קווים לאותו יעד/.test(ui.why)) problems.push(key + ': "טבלה משולבת" כבויה בלי הסבר');
    const views = [['board'], ['sum'], ['sum', true], ['sep']].concat(cs.comb ? [['comb']] : []), res = {};
    for (const [tv, tall] of views) {
      const k = tv + (tall ? '+all' : '');
      res[k] = await cardRun(pg, tv, tall);
      if (res[k].checked !== tv) problems.push(key + ' ' + k + ': הכרטיס לא נבחר');
    }
    // לוח המודעות שונה מכל השאר בכל הצורות, וכל כרטיס שונה מהאחרים במצגת
    for (const k of Object.keys(res)) {
      if (k === 'board') continue;
      for (const form of FORMS) if (res[k][form] === res.board[form]) problems.push(key + ' ' + form + ': "' + k + '" נראה בדיוק כמו לוח המודעות');
      if (res[k].xlsx === res.board.xlsx) problems.push(key + ': האקסל של "' + k + '" כמו של לוח המודעות (' + res.board.xlsx + ')');
    }
    const ks = Object.keys(res).filter((k) => !(key === 'cards-small' || key === 'cards-cu') || k !== 'sum+all');   // קו אחד: "כל השעות" = טבלה לכל קו
    ks.forEach((a, i) => ks.slice(i + 1).forEach((b) => { if (res[a].deck === res[b].deck && !(a === 'sum+all' && b === 'sep')) problems.push(key + ': "' + a + '" ו-"' + b + '" נראים אותו דבר'); }));
    if (cs.rm && !res.board.rm.includes(cs.rm)) problems.push(key + ': בלוח המודעות אין סימון שבוטלה ל-' + cs.rm + ' (' + res.board.rm.join(', ') + ')');
    if (cs.rm && !/מחוקות: [1-9]/.test(res.board.xlsx)) problems.push(key + ': באקסל של לוח המודעות אין שעה מחוקה');
    got[key] = { xlsx: Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v.xlsx])) };
    if (errs.length) problems.push(key + ': שגיאה בדף — ' + errs.join(' | '));
    await pg.close();
  }
  for (const [key, bo] of Object.entries(BOARDS)) {
    const tord = bo.tord;
    if (only && only !== key) continue;
    const pg = await ctx.newPage(), errs = [];
    pg.on('pageerror', (e) => errs.push(e.message));
    await pg.goto(base + '/line-changes/?m=tt');
    await pg.fill('#q', 'קרית מלאכי');
    await pg.waitForSelector('.res.place', { timeout: 30000 });
    await pg.click('.res.place');
    await pg.waitForSelector('#plall'); await pg.click('#plall');
    await pg.waitForSelector('.s-bd', { timeout: 30000 });
    await pg.click('[data-tto="' + tord + '"]', { force: true });
    if (bo.del) {
      // מחיקת קווים במצב עריכה (לוחצים על מספר הקו ואז Delete): כל קו שהמספר שלו קטן מ-bo.del
      await pg.click('[data-form="sign"]', { force: true }); await pg.waitForTimeout(500);
      await pg.click('#editbtn', { force: true }); await pg.waitForTimeout(300);
      for (let k = 0; k < 60; k++) {
        const ln = await pg.evaluate((min) => {
          const tr = Array.from(document.querySelectorAll('.sitem:not(.off) .s-bd tr.br')).find((t) => !(parseInt(t.getAttribute('data-ln'), 10) >= min));
          if (!tr) return null;
          (tr.querySelector('td.bl') || tr.querySelector('td')).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
          return tr.getAttribute('data-ln');
        }, bo.del);
        if (!ln) break;
        await pg.keyboard.press('Delete'); await pg.waitForTimeout(250);
      }
      await pg.click('#editbtn', { force: true }); await pg.waitForTimeout(500);
    }
    got[key] = {};
    for (const form of bo.forms || FORMS) {
      await pg.click('[data-form="' + form + '"]', { force: true });
      await pg.waitForTimeout(800);
      for (const kv of bo.opts || []) { const [k, v] = kv.split('='); await pg.evaluate(([k, v]) => document.querySelector('[data-' + k + '="' + v + '"]').click(), [k, v]); await pg.waitForTimeout(800); }
      // הלוח: כל השורות מכל העמודים יחד (החלוקה לעמודים תלויה בגופן — לא נבדקת), בלי שורות "(המשך)"; והכותרות של העמודות
      const pages = await collect(pg, true), rows = [];
      Object.keys(pages).forEach((sid) => (pages[sid].rows || []).forEach((r) => { if (!/\(המשך\)\s*$/.test(r)) rows.push(r); }));
      const fit = await pg.evaluate(() => {
        const fr = Array.from(document.querySelectorAll('.sitem:not(.off) .sframe')).filter((f) => f.querySelector('.s-bd'));
        const heads = fr[0] ? Array.from(fr[0].querySelectorAll('thead th')).map((t) => t.textContent.trim() + (t.colSpan > 1 ? ' [' + t.colSpan + ']' : '')) : [];
        const spans = fr.reduce((t, f) => t + f.querySelectorAll('tbody td.bt[colspan]').length, 0);
        const f0 = window.LCDeck && LCDeck.boardFit ? LCDeck.boardFit() : null, nd = document.getElementById('bdneed');
        return { heads, spans, pages: fr.length, need: f0 ? f0.need : 0, want: f0 ? f0.want : 0, needTxt: nd && !nd.hidden ? nd.textContent : '' };
      });
      got[key][form] = { heads: fit.heads, spans: fit.spans, rows: rows };
      if (!(await footCheck(pg))) problems.push(key + ' ' + form + ': חסרה בעמוד שורת "המידע הוכן על ידי אדם פרטי · לא פרסום רשמי" או הקרדיט');
      if (fit.want && fit.pages > fit.want && (fit.need !== fit.pages || fit.needTxt.indexOf('צריך לפחות ' + fit.pages + ' עמודים') < 0)) problems.push(key + ' ' + form + ': ' + fit.pages + ' עמודים במקום ' + fit.want + ', בלי "צריך לפחות"');
      if (bo.pages && fit.pages !== bo.pages) problems.push(key + ' ' + form + ': ' + fit.pages + ' עמודים במקום ' + bo.pages);
      for (const x of await orderCheck(pg, tord)) problems.push(key + ' ' + form + ': סדר השעות — ' + x);
      for (const x of await lineCellCheck(pg)) problems.push(key + ' ' + form + ': תא הקו — ' + x);
    }
    if (bo.xlsx) {
      got[key].xlsx = await xlsxCheck(pg);
      if (!got[key].xlsx.priv || !got[key].xlsx.link) problems.push(key + ': באקסל חסרה שורת "אדם פרטי" או הקישור בקרדיט');
    }
    if (errs.length) problems.push(key + ': שגיאה בדף — ' + errs.join(' | '));
    await pg.close();
  }
  for (const [key, lo] of Object.entries(LOD_BOARDS)) {
    if (only && only !== key) continue;
    const pg = await ctx.newPage(), errs = [];
    pg.on('pageerror', (e) => errs.push(e.message));
    if (lo.place) {
      await pg.goto(base + '/line-changes/?m=tt');
      await pg.fill('#q', lo.place);
      await pg.waitForSelector('.res.place', { timeout: 30000 });
      await pg.click('.res.place');
      await pg.waitForSelector('#plall'); await pg.click('#plall');
    } else await pg.goto(base + '/line-changes/' + lo.url);
    await pg.waitForSelector('.s-bd', { timeout: 30000 });
    got[key] = {};
    const ui = await pg.evaluate(() => ({ shown: !document.getElementById('borseg').closest('[hidden]'), on: (document.querySelector('#borseg [aria-checked="true"]') || {}).getAttribute?.('data-bor') }));
    if (!ui.shown || ui.on !== 'type') problems.push(key + ': "סדר הקווים" לא מופיע, או שברירת המחדל ' + ui.on + ' ולא "לפי סוג קו"');
    for (const form of FORMS) {
      await pg.click('[data-form="' + form + '"]', { force: true });
      await pg.waitForTimeout(800);
      const pages = await collect(pg, true), rows = [];
      Object.keys(pages).forEach((sid) => (pages[sid].rows || []).forEach((r) => { if (!/\(המשך\)\s*$/.test(r)) rows.push(r); }));
      got[key][form] = { bands: await bandSeq(pg), rows };
      if (!(await footCheck(pg))) problems.push(key + ' ' + form + ': חסרה בעמוד שורת "המידע הוכן על ידי אדם פרטי · לא פרסום רשמי" או הקרדיט');
      for (const x of await orderCheck(pg, 'ltr')) problems.push(key + ' ' + form + ': סדר השעות — ' + x);
      for (const x of await lineCellCheck(pg)) problems.push(key + ' ' + form + ': תא הקו — ' + x);
      if (lo.fill && form === 'sign') {
        // שלט A4: כל עמוד חוץ מהאחרון מלא לפחות ב-85% — פס או פרק מתחילים גם בתחתית העמוד, ופס ארוך ממשיך בעמוד הבא
        const fl = await pageFill(pg);
        got[key].pages = fl.length;
        console.log(key + ' ' + form + ' מילוי העמודים: ' + fl.join(' '));
        fl.slice(0, -1).forEach((x, i) => { if (x < lo.fill) problems.push(key + ' ' + form + ': עמוד ' + (i + 1) + ' מלא רק ב-' + Math.round(x * 100) + '%'); });
      }
      if (lo.alts) {
        const a = await altCheck(pg, lo.alts);
        for (const x of a.bad) problems.push(key + ' ' + form + ': חלופות — ' + x);
        if (form === 'sign') got[key].alts = { rows: a.rows, legend: a.legend };
        if (!Object.keys(a.rows).length) problems.push(key + ' ' + form + ': אין חלופות בקו ' + lo.alts);
      }
    }
    if (lo.alts) {
      // מימין לשמאל: אותן אותיות וצבעים, וכל אות צמודה לשעה שלה
      await pg.click('[data-form="sign"]', { force: true });
      await pg.click('[data-tto="rtl"]', { force: true }); await pg.waitForTimeout(800);
      for (const x of await orderCheck(pg, 'rtl')) problems.push(key + ' rtl: סדר השעות — ' + x);
      const a = await altCheck(pg, lo.alts);
      for (const x of a.bad) problems.push(key + ' rtl: חלופות — ' + x);
      if (JSON.stringify(a.rows) !== JSON.stringify(got[key].alts.rows)) problems.push(key + ' rtl: החלופות שונות משמאל לימין');
      await pg.click('[data-tto="ltr"]', { force: true }); await pg.waitForTimeout(500);
    }
    if (lo.xlsx) got[key].xlsx = await xlsxAlts(pg);
    if (lo.orders) {
      // "סדר הקווים": כל אפשרות — הפסים והקווים בשלט, בעמודי המצגת ובסטטוס (אותו סדר), והבחירה נשמרת עם הלוח
      got[key].orders = {};
      for (const o of lo.orders) {
        await pg.click('[data-bor="' + o + '"]', { force: true }); await pg.waitForTimeout(900);
        const seq = {};
        for (const form of FORMS) { await pg.click('[data-form="' + form + '"]', { force: true }); await pg.waitForTimeout(700); seq[form] = await bandSeq(pg); }
        got[key].orders[o] = seq.sign;
        const flat = (L) => L.map((x) => x.split(': ')[0]).join('|');   // החלוקה לעמודים שונה בין הצורות — משווים רק את סדר הפסים
        if (flat(seq.deck) !== flat(seq.sign) || flat(seq.status) !== flat(seq.sign)) problems.push(key + ' ' + o + ': סדר הפסים שונה בין הצורות');
        const saved = await pg.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith('lc-ed2:')); return k ? JSON.parse(localStorage.getItem(k)).bord : null; });
        if ((saved || 'type') !== o) problems.push(key + ': "' + o + '" לא נשמר (' + saved + ')');
        const on = await pg.evaluate(() => (document.querySelector('#borseg [aria-checked="true"]') || {}).getAttribute?.('data-bor'));
        if (on !== o) problems.push(key + ': הכפתור של "' + o + '" לא מסומן');
      }
    }
    if (lo.types) {
      // לפי סוג קו: הרשימה הקטנה (עירוני / בין-עירוני / אזורי) — "אזורי" למעלה פעמיים, ואז בלי "בין-עירוני"; כותרות הפרקים בשלט ובאקסל
      await pg.click('[data-bor="type"]', { force: true }); await pg.click('[data-form="sign"]', { force: true }); await pg.waitForTimeout(800);
      const list = async () => pg.evaluate(() => Array.from(document.querySelectorAll('#btyl li')).map((li) => li.querySelector('b').textContent + ' ' + li.querySelector('small').textContent + (li.querySelector('input').checked ? '' : ' (מוסתר)')).join(' | '));
      const t = { list0: await list() };
      for (let k = 0; k < 2; k++) { await pg.evaluate((q) => document.querySelector(q).click(), '#btyl [data-bty="r"] [data-bty-mv="-1"]'); await pg.waitForTimeout(700); }
      t.list1 = await list(); t.rUp = await bandSeq(pg);
      await pg.evaluate((q) => document.querySelector(q).click(), '#btyl [data-bty="i"] input'); await pg.waitForTimeout(800);
      t.list2 = await list(); t.noI = await bandSeq(pg);
      const xl = await xlsxSecs(pg); t.xlsx = xl;
      await pg.evaluate((q) => document.querySelector(q).click(), '#btyl [data-bty="i"] input'); await pg.waitForTimeout(500);
      for (let k = 0; k < 2; k++) { await pg.evaluate((q) => document.querySelector(q).click(), '#btyl [data-bty="r"] [data-bty-mv="1"]'); await pg.waitForTimeout(500); }
      // "ואז לפי": מספר קו (בתוך כל סוג), ובחזרה — הסדר שהוספתם
      await pg.selectOption('#bk2', 'num'); await pg.waitForTimeout(700);
      t.byNum = await bandSeq(pg);
      await pg.selectOption('#bk2', 'add'); await pg.waitForTimeout(500);
      got[key].types = t;
      if (!/^אזורי/.test(t.list1)) problems.push(key + ': "אזורי" לא עלה לראש הרשימה — ' + t.list1);
      if (t.noI.some((x) => /בין-עירוניים/.test(x))) problems.push(key + ': "בין-עירוני" מוסתר ועדיין בלוח');
    }
    if (lo.manual) {
      // ידני: במצב עריכה בוחרים את קו 9 ומזיזים למעלה (בסרגל), ואת הפס של לוד – תל אביב למעלה; הסדר עובר ל"ידני", נשמר אחרי טעינה מחדש ומגיע לאקסל
      await pg.click('[data-bor="type"]', { force: true }); await pg.click('[data-form="sign"]', { force: true }); await pg.waitForTimeout(700);
      await pg.click('#editbtn', { force: true }); await pg.waitForTimeout(400);
      const pick = async (sel) => pg.evaluate((sel) => { const e = document.querySelector('.sitem:not(.off) ' + sel); e.scrollIntoView({ block: 'center' }); e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); e.click(); return !!e; }, sel);
      await pick('.s-bd tr.br[data-ln="9"] td.bo'); await pg.waitForTimeout(300);
      const tb = await pg.evaluate(() => { const b = document.getElementById('etb'); return b && !b.hidden ? Array.from(b.querySelectorAll('button')).filter((x) => !x.hidden).map((x) => x.textContent + (x.disabled ? ' (כבוי)' : '')) : []; });
      const up = async () => { await pg.evaluate(() => document.querySelector('#etb [data-t="mvup"]').click()); await pg.waitForTimeout(900); };
      await up(); await up();
      await pick('.s-bd tr.bband[data-bkey*="תל אביב"] td'); await pg.waitForTimeout(300);
      await up();
      await pg.click('#editbtn', { force: true }); await pg.waitForTimeout(600);
      const m = { toolbar: tb, on: await pg.evaluate(() => (document.querySelector('#borseg [aria-checked="true"]') || {}).getAttribute?.('data-bor')), seq: await bandSeq(pg) };
      await pg.waitForTimeout(400);
      await pg.evaluate(() => { window.name = 'keep'; });
      await pg.reload(); await pg.waitForSelector('.s-bd', { timeout: 30000 }); await pg.click('[data-form="sign"]', { force: true }); await pg.waitForTimeout(900);
      m.afterReload = await bandSeq(pg);
      m.onAfterReload = await pg.evaluate(() => (document.querySelector('#borseg [aria-checked="true"]') || {}).getAttribute?.('data-bor'));
      m.xlsx = (await xlsxSecs(pg)).lines;
      await pg.evaluate(() => { window.name = ''; });
      got[key].manual = m;
      if (m.on !== 'man' || m.onAfterReload !== 'man') problems.push(key + ': אחרי הזזה הסדר לא עבר ל"ידני" (' + m.on + ', ' + m.onAfterReload + ')');
      if (JSON.stringify(m.seq) !== JSON.stringify(m.afterReload)) problems.push(key + ': הסדר הידני לא נשמר אחרי טעינה מחדש');
      const flatSeq = m.seq.filter((x) => !/^§/.test(x)).map((x) => x.split(': ')[1]).join(' ').split(' ');
      if (flatSeq.join(' ') !== m.xlsx.join(' ')) problems.push(key + ': הסדר באקסל שונה מהלוח — ' + m.xlsx.join(' '));
    }
    if (errs.length) problems.push(key + ': שגיאה בדף — ' + errs.join(' | '));
    await pg.close();
  }
  for (const key of ['board-safed', 'board-safed7']) {
    if (only && only !== key) continue;
    const pg = await ctx.newPage(), errs = [];
    pg.on('pageerror', (e) => errs.push(e.message));
    if (key === 'board-safed') {
      await pg.goto(base + '/line-changes/?m=tt');
      await pg.fill('#q', 'צפת'); await pg.waitForSelector('.res.place', { timeout: 30000 }); await pg.click('.res.place');
      await pg.waitForSelector('#plall'); await pg.click('#plall');
    } else await pg.goto(base + '/line-changes/' + SAFED7);
    await pg.waitForSelector('.s-bd', { timeout: 30000 });
    await pg.click('[data-form="sign"]', { force: true }); await pg.waitForTimeout(1000);
    const g = got[key] = {};
    // A. רוחב עמודות: אוטומטי מול רוחב שווה לכל העמודות (ידני) — בשתי הצפיפויות; הלוח לא גבוה יותר ולא ארוך יותר
    for (const dn of ['0', '1']) {
      await pg.evaluate((d) => document.querySelector('[data-bdn="' + d + '"]').click(), dn); await pg.waitForTimeout(1000);
      const auto = await rowsHeight(pg);
      const model = await pg.evaluate(() => { const w = LCDeck.boardWidths(), T = LCDeck._test, n = w.ws.length, s = w.ws.reduce((a, b) => a + b, 0); return { auto: T.bdCost(w.mt, w.ws), eq: T.bdCost(w.mt, w.ws.map(() => s / n)) }; });
      await setEdits(pg, "var n = Array.from(document.querySelector('.sitem:not(.off) .s-bd').querySelectorAll('col[data-ck]')); e.bcw = { o: 0.16 }; n.forEach(function (c) { e.bcw[c.getAttribute('data-ck')] = 0.84 / n.length; });");
      const eq = await rowsHeight(pg);
      const seg = await pg.evaluate(() => (document.querySelector('#bcwseg [aria-checked="true"]') || {}).getAttribute?.('data-bcw'));
      await pg.evaluate(() => document.querySelector('[data-bcw="auto"]').click()); await pg.waitForTimeout(1000);
      const back = await rowsHeight(pg);
      console.log(key + (dn === '1' ? ' צפוף' : '') + ': רוחב אוטומטי — ' + auto.h + 'px, ' + auto.pages + ' עמודים (גופן ' + auto.sc + '); רוחב שווה — ' + eq.h + 'px, ' + eq.pages + ' עמודים (גופן ' + eq.sc + '); במודל ' + Math.round(model.auto) + ' מול ' + Math.round(model.eq));
      if (model.auto > model.eq + 0.5) problems.push(key + ': רוחב אוטומטי גבוה יותר במודל מרוחב שווה');
      if (auto.pages > eq.pages || (auto.pages === eq.pages && auto.sc === eq.sc && auto.h >= eq.h)) problems.push(key + (dn === '1' ? ' צפוף' : '') + ': רוחב אוטומטי לא מקצר את הלוח (' + auto.h + ' מול ' + eq.h + ')');
      if (seg !== 'man') problems.push(key + ': "רוחב עמודות" לא מסומן "ידני" אחרי רוחב שנשמר');
      if (back.h !== auto.h || back.pages !== auto.pages) problems.push(key + ': "אוטומטי" לא מחזיר את הרוחב האוטומטי');
    }
    await pg.evaluate(() => document.querySelector('[data-bdn="0"]').click()); await pg.waitForTimeout(800);
    if (key === 'board-safed') {
      // C. מיון בשתי רמות: קודם לפי מפעיל (המפעיל השני — למעלה), ואז לפי מספר קו; ו"בלי פסי יעד"
      await pg.selectOption('#bk1', 'op'); await pg.waitForTimeout(900);
      await pg.selectOption('#bk2', 'num'); await pg.waitForTimeout(900);
      const ops0 = await pg.evaluate(() => Array.from(document.querySelectorAll('#bopl li b')).map((b) => b.textContent));
      await pg.evaluate(() => document.querySelectorAll('#bopl [data-bop-mv="-1"]')[1].click()); await pg.waitForTimeout(900);
      const ops1 = await pg.evaluate(() => Array.from(document.querySelectorAll('#bopl li b')).map((b) => b.textContent));
      await pg.evaluate(() => document.getElementById('bflat').click()); await pg.waitForTimeout(900);
      const flat = await lineSeq(pg), xs = await xlsxSheet(pg);
      g.sort = { ops0, ops1, on: await pg.evaluate(() => (document.querySelector('#borseg [aria-checked="true"]') || {}).getAttribute?.('data-bor')), flat };
      if (flat.some((x) => x.startsWith('['))) problems.push(key + ': "בלי פסי יעד" — עדיין יש פסים');
      if (ops1[0] !== ops0[1]) problems.push(key + ': סדר המפעילים לא השתנה');
      // הסדר נכון: המפעילים לפי ops1, ובכל מפעיל — מספר הקו עולה
      const opOf = (x) => x.split('/')[1], numOf = (x) => parseInt(x, 10) * 10 + (/\D/.test(x.split('/')[0]) ? 1 : 0);
      flat.forEach((x, i) => { if (!i) return; const p = flat[i - 1], a = ops1.indexOf(opOf(p)), b2 = ops1.indexOf(opOf(x)); if (a > b2 || (a === b2 && numOf(p) > numOf(x))) problems.push(key + ': מיון בשתי רמות — ' + p + ' לפני ' + x); });
      if (/<c r="A\d+"[^>]*><is><t[^>]*>(צפת – |הקווים העירוניים)/.test(xs)) problems.push(key + ': באקסל יש שורת פס ב"בלי פסי יעד"');
      const xl = [...xs.matchAll(/<c r="B\d+"[^>]*><is><t[^>]*>(\d+[^<]*)<\/t>/g)].map((m) => m[1]);
      if (xl.join(' ') !== flat.map((x) => x.split('/')[0]).join(' ')) problems.push(key + ': הסדר באקסל שונה מהלוח');
    } else {
      // B. מחיקת טקסט (התחנה של 984) וריקון תא (יום שישי של 981, השורה הראשונה): מחוץ לעריכה — בלי גובה; באקסל — ריק; ושחזור
      await pg.click('#editbtn', { force: true }); await pg.waitForTimeout(500);
      await pg.evaluate(() => document.querySelector('.sitem:not(.off) .s-bd tr.br[data-ln="984"] [data-bk$="|s"]').focus()); await pg.waitForTimeout(200);
      await pg.evaluate(() => document.querySelector('#etb [data-t="del"]').click()); await pg.waitForTimeout(900);
      const fri = await pg.evaluate(() => { const tr = document.querySelector('.sitem:not(.off) .s-bd tr.br[data-ln="981"]'), i = Array.from(document.querySelectorAll('.sitem:not(.off) .s-bd thead th')).findIndex((t) => t.textContent.trim() === 'יום שישי'); return { rk: tr.getAttribute('data-rk'), h: tr.getBoundingClientRect().height, i }; });
      const friCell = '.s-bd tr.br[data-rk="' + fri.rk + '"] td.bt [data-bk$="|c' + (await pg.evaluate((rk) => { const ths = Array.from(document.querySelector('.sitem:not(.off) .s-bd table').querySelectorAll('col[data-ck]')).map((c) => c.getAttribute('data-ck')); return ths.indexOf('5'); }, fri.rk)) + '"]';
      await pg.evaluate((q) => { const e = document.querySelector('.sitem:not(.off) ' + q).closest('td'); e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); e.click(); }, friCell); await pg.waitForTimeout(300);
      const tb = await pg.evaluate(() => Array.from(document.querySelectorAll('#etb button')).filter((x) => !x.hidden).map((x) => x.textContent));
      await pg.evaluate(() => document.querySelector('#etb [data-t="cellclr"]').click()); await pg.waitForTimeout(900);
      const inEdit = await pg.evaluate((q) => { const e = document.querySelector('.sitem:not(.off) ' + q); return { pos: getComputedStyle(e).position, del: e.classList.contains('bdel') }; }, friCell);
      await pg.click('#editbtn', { force: true }); await pg.waitForTimeout(900);
      const out = await pg.evaluate((q) => { const st = document.querySelector('.sitem:not(.off) .s-bd tr.br[data-ln="984"] [data-bk$="|s"]'), c = document.querySelector('.sitem:not(.off) ' + q); return { stop: st.getBoundingClientRect().height, cell: c.getBoundingClientRect().height, td: c.closest('td').textContent.trim(), row: c.closest('tr').getBoundingClientRect().height }; }, friCell);
      const xs = await xlsxSheet(pg);
      g.clear = { toolbar: tb, inEdit, stopH: out.stop, cellH: out.cell, cellText: out.td };
      if (out.stop !== 0) problems.push(key + ': טקסט שנמחק תופס ' + out.stop + 'px');
      if (out.cell !== 0 || out.td) problems.push(key + ': תא שרוקן עדיין תופס מקום (' + out.cell + 'px, "' + out.td + '")');
      if (!(out.row < fri.h)) problems.push(key + ': השורה לא התקצרה אחרי ריקון התא (' + fri.h + ' → ' + out.row + ')');
      if (!inEdit.del || inEdit.pos !== 'absolute') problems.push(key + ': במצב עריכה התא שרוקן לא מופיע כסימן קטן');
      const ci5 = await pg.evaluate(() => Array.from(document.querySelector('.sitem:not(.off) .s-bd table').querySelectorAll('col[data-ck]')).map((c) => c.getAttribute('data-ck')).indexOf('5'));
      const r981 = (xs.match(/<c r="B(\d+)"[^>]*><is><t[^>]*>981<\/t>/) || [])[1], fx = r981 && xs.match(new RegExp('<c r="' + 'ABCDEFGHIJ'.charAt(3 + ci5) + r981 + '"[^>]*>(?:<is>(.*?)</is>)?'));
      g.clear.xlsx = fx ? (fx[1] || '').replace(/<[^>]+>/g, '') : null;
      if (!fx || g.clear.xlsx) problems.push(key + ': באקסל יום שישי של 981 לא רוקן (' + (fx ? g.clear.xlsx : 'אין תא') + ')');
      // שחזור התא
      await pg.click('#editbtn', { force: true }); await pg.waitForTimeout(500);
      await pg.evaluate((q) => { const e = document.querySelector('.sitem:not(.off) ' + q).closest('td'); e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); e.click(); }, friCell); await pg.waitForTimeout(300);
      g.clear.restoreBtn = await pg.evaluate(() => document.querySelector('#etb [data-t="cellclr"]').textContent);
      await pg.evaluate(() => document.querySelector('#etb [data-t="cellclr"]').click()); await pg.waitForTimeout(900);
      if (!(await pg.evaluate((q) => document.querySelector('.sitem:not(.off) ' + q).textContent.trim().length > 0, friCell))) problems.push(key + ': "שחזור התא" לא החזיר את השעות');
      // D. ידני: 982 (ראש הפס של ירושלים) — ↑ לסוף הפס של רמת גן, ואחר כך ↓ ובחזרה; נשמר אחרי טעינה ומגיע לאקסל
      g.move = { before: (await lineSeq(pg)).map((x) => x.replace(/\/.*$/, '')) };
      const pk = async (ln) => pg.evaluate((ln) => { const e = document.querySelector('.sitem:not(.off) .s-bd tr.br[data-ln="' + ln + '"] td.bo'); e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); e.click(); }, ln);
      await pk('982'); await pg.waitForTimeout(300);
      g.move.canUp = await pg.evaluate(() => !document.querySelector('#etb [data-t="mvup"]').disabled);
      await pg.evaluate(() => document.querySelector('#etb [data-t="mvup"]').click()); await pg.waitForTimeout(1000);
      g.move.up = (await lineSeq(pg)).map((x) => x.replace(/\/.*$/, ''));
      await pk('989'); await pg.waitForTimeout(300);
      await pg.evaluate(() => document.querySelector('#etb [data-t="mvup"]').click()); await pg.waitForTimeout(1000);
      g.move.up2 = (await lineSeq(pg)).map((x) => x.replace(/\/.*$/, ''));
      await pg.click('#editbtn', { force: true }); await pg.waitForTimeout(600);
      await pg.evaluate(() => { window.name = 'keep'; });
      await pg.reload(); await pg.waitForSelector('.s-bd', { timeout: 30000 }); await pg.click('[data-form="sign"]', { force: true }); await pg.waitForTimeout(1000);
      g.move.afterReload = (await lineSeq(pg)).map((x) => x.replace(/\/.*$/, ''));
      const xs2 = await xlsxSheet(pg);
      g.move.xlsx = [...xs2.matchAll(/<c r="[AB]\d+"[^>]*><is><t[^>]*>([^<]*)<\/t>/g)].map((m) => m[1]).filter((x) => /^\d+$|^צפת – /.test(x));
      await pg.evaluate(() => { window.name = ''; });
      if (JSON.stringify(g.move.up) === JSON.stringify(g.move.before)) problems.push(key + ': ↑ בראש הפס לא העביר את 982');
      if (JSON.stringify(g.move.afterReload) !== JSON.stringify(g.move.up2)) problems.push(key + ': ההעברה בין פסים לא נשמרה אחרי טעינה מחדש');
      const flatSeq = g.move.up2.map((x) => x.startsWith('[') ? x.slice(1, -1) : x.split('/')[0]);
      if (flatSeq.join('|') !== g.move.xlsx.join('|')) problems.push(key + ': ההעברה בין פסים לא הגיעה לאקסל — ' + g.move.xlsx.join(' '));
      // קו שהועבר לפס של יעד אחר — בפס משלו עם היעד שלו (982 תחת "צפת – ירושלים" בתוך רמת גן), ואין שני פסים צמודים עם אותה כותרת
      const segOf = (sq, ln) => { let h = ''; for (const x of sq) { if (x.startsWith('[')) h = x; else if (x === ln) return h; } return null; };
      if (!/ירושלים/.test(segOf(g.move.up, '982') || '')) problems.push(key + ': 982 שהועבר לפס של רמת גן לא קיבל פס עם היעד שלו');
      const dupHead = (sq) => sq.some((x, i) => x.startsWith('[') && i && sq[i - 1].startsWith('['));
      [g.move.up, g.move.up2].forEach((sq) => { if (dupHead(sq)) problems.push(key + ': פס ריק (שתי כותרות צמודות) — ' + sq.join(' ')); });
      // E. הפס של קו שהועבר (989, "צפת – נתניה" בתוך ירושלים) — ↓ על שורת הפס מזיז אותו בתוך הפס של ירושלים, אחרי 993
      await pg.click('#editbtn', { force: true }); await pg.waitForTimeout(500);
      await pg.evaluate(() => { const tr = Array.from(document.querySelectorAll('.sitem:not(.off) .s-bd tr.bband')).find((t) => /נתניה/.test(t.textContent)); const td = tr.querySelector('td'); td.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); td.click(); }); await pg.waitForTimeout(300);
      g.move.bandCanDn = await pg.evaluate(() => !document.querySelector('#etb [data-t="mvdn"]').disabled);
      await pg.evaluate(() => document.querySelector('#etb [data-t="mvdn"]').click()); await pg.waitForTimeout(1000);
      g.move.bandDn = (await lineSeq(pg)).map((x) => x.replace(/\/.*$/, ''));
      g.move.bandSel = await pg.evaluate(() => (document.querySelector('.s-bd tr.bband.bsel') || {}).textContent || '');
      await pg.click('#editbtn', { force: true }); await pg.waitForTimeout(600);
      if (segOf(g.move.bandDn, '989') !== '[צפת – נתניה]' || g.move.bandDn.indexOf('989') < g.move.bandDn.indexOf('993')) problems.push(key + ': ↓ על הפס של 989 לא הזיז אותו — ' + g.move.bandDn.join(' '));
      if (dupHead(g.move.bandDn)) problems.push(key + ': פס ריק אחרי הזזת פס — ' + g.move.bandDn.join(' '));
      // F. מתחת למוצא: "רק כיוון" — בלי שם התחנה והקוד, "לכיוון …" נשאר; "כלום" — רק המוצא; גם באקסל ובצפוף
      const under = async () => pg.evaluate(() => { const q = (s) => document.querySelectorAll('.sitem:not(.off) .s-bd tr.br td.bo ' + s).length; return { rows: q('b'), stop: q('[data-bk$="|s"]'), dir: q('[data-bk$="|w"]') }; });
      g.bstop = { all: await under() };
      for (const m of ['dir', 'none']) {
        await pg.evaluate((m) => document.querySelector('[data-bst="' + m + '"]').click(), m); await pg.waitForTimeout(1000);
        g.bstop[m] = await under();
        g.bstop[m].on = await pg.evaluate(() => (document.querySelector('#bstseg [aria-checked="true"]') || {}).getAttribute?.('data-bst'));
        const xo = await xlsxSheet(pg);
        g.bstop[m].xlsxDir = (xo.match(/לכיוון/g) || []).length;
      }
      await pg.evaluate(() => document.querySelector('[data-bdn="1"]').click()); await pg.waitForTimeout(900);
      g.bstop.noneDense = await under();
      await pg.evaluate(() => document.querySelector('[data-bdn="0"]').click()); await pg.waitForTimeout(600);
      await pg.evaluate(() => document.querySelector('[data-bst="all"]').click()); await pg.waitForTimeout(1000);
      g.bstop.back = await under();
      const S0 = g.bstop;
      if (!(S0.all.stop > 0 && S0.all.dir > 0)) problems.push(key + ': "הכל" — אין תחנה או כיוון מתחת למוצא');
      if (S0.dir.stop || S0.dir.dir !== S0.all.dir || S0.dir.on !== 'dir') problems.push(key + ': "רק כיוון" — ' + JSON.stringify(S0.dir));
      if (S0.none.stop || S0.none.dir || S0.none.on !== 'none' || S0.none.rows !== S0.all.rows) problems.push(key + ': "כלום" — ' + JSON.stringify(S0.none));
      // (במקרא החלופות באקסל הכיוון נשאר — כדי להבחין בין שני הכיוונים של קו)
      if (!S0.dir.xlsxDir || S0.dir.xlsxDir - S0.none.xlsxDir !== S0.all.dir) problems.push(key + ': מתחת למוצא — באקסל (' + S0.dir.xlsxDir + ', ' + S0.none.xlsxDir + ')');
      if (S0.noneDense.stop || S0.noneDense.dir) problems.push(key + ': "כלום" בצפוף — ' + JSON.stringify(S0.noneDense));
      if (JSON.stringify(S0.back) !== JSON.stringify(S0.all)) problems.push(key + ': "הכל" לא מחזיר את התחנה והכיוון');
    }
    if (errs.length) problems.push(key + ': שגיאה בדף — ' + errs.join(' | '));
    await pg.close();
  }
  await b.close(); srv.close();

  const old = fs.existsSync(SNAP) ? JSON.parse(fs.readFileSync(SNAP, 'utf8')) : {};
  if (process.env.UPDATE_SNAPSHOTS) {
    const next = only ? Object.assign({}, old, got) : got;
    fs.writeFileSync(SNAP, JSON.stringify(next, null, 1) + '\n');
    console.log('עודכן: ' + SNAP + ' (' + Object.keys(got).length + ' מצגות)');
  } else {
    for (const id of Object.keys(got)) {
      if (!old[id]) { problems.push(id + ': אין תמונה-במילים — הריצו עם UPDATE_SNAPSHOTS=1'); continue; }
      for (const form of Object.keys(got[id])) {
        const a = old[id][form] || {}, c = got[id][form];
        const ids = new Set(Object.keys(a).concat(Object.keys(c)));   // לכל שקף (בלוח — "rows": כל השורות)
        for (const sid of ids) {
          const x = JSON.stringify(a[sid]), y = JSON.stringify(c[sid]);
          if (x !== y) problems.push(id + ' · ' + form + ' · ' + sid + '\n   היה: ' + (x || '(אין שקף)').slice(0, 600) + '\n   עכשיו: ' + (y || '(אין שקף)').slice(0, 600));
        }
      }
    }
  }
  const n = Object.keys(got).length;
  if (problems.length) { console.log('נכשל (' + problems.length + '):\n' + problems.join('\n')); process.exit(1); }
  console.log('עבר: ' + n + ' מצגות ולוחות, ' + FORMS.length + ' צורות לכל אחת');
}
main().catch((e) => { console.error(e); process.exit(1); });
