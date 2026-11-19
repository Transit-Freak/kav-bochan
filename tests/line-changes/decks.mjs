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
  '45009-20261115-n': 'קו חדש',
  '71011-20261113-e': 'קו שמבוטל'
};
const BOARDS = { 'board-ltr': 'ltr', 'board-rtl': 'rtl' };   // לוח לפי יעד: קרית מלאכי (עיר), בשני סדרי השעות
const FORMS = ['deck', 'sign', 'status'];

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
  try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
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
      const u = Array.from(td.querySelectorAll('.t')).map((t) => { const rg = document.createRange(); rg.selectNodeContents(t.firstChild); const r = rg.getBoundingClientRect(); return { t: t.firstChild.nodeValue.trim(), x: r.left, xr: r.right, y: r.top, h: r.height, mk: Array.from(t.querySelectorAll('sup,.xn')).map((m) => { const r = m.getBoundingClientRect(); return [r.left, r.right]; }) }; });
      if (!u.length) return;
      const lns = [];
      u.slice().sort((a, b) => a.y - b.y).forEach((v) => { const L = lns[lns.length - 1]; if (L && v.y - L[0].y <= u[0].h * 0.5) L.push(v); else lns.push([v]); });
      const vis = [].concat(...lns.map((L) => L.sort((a, b) => (tord === 'ltr' ? a.x - b.x : b.x - a.x))));
      if (!vis.every((v, i) => v === u[i])) bad.push(td.closest('tr').getAttribute('data-ln') + ': ' + vis.map((v) => v.t).join(' '));
      // כל סימן (×N, ימים) מיד אחרי מה שלפניו — השעה או הסימן הקודם
      u.forEach((v) => { let prev = v.xr; v.mk.forEach(([l, r]) => { const g = l - prev; if (g < -0.1 * v.h || g > 0.8 * v.h) bad.push(td.closest('tr').getAttribute('data-ln') + ': סימן רחוק מ-' + v.t); prev = r; }); });
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
    got[id] = {};
    for (const form of FORMS) {
      await pg.evaluate(() => { window.__lc.fb = []; window.__lc.pl = []; window.__lc.mk = []; });
      await pg.click('[data-form="' + form + '"]', { force: true });
      await pg.waitForTimeout(800);
      await pg.evaluate(() => window.LCApp && window.LCApp.ready && window.LCApp.ready());
      await pg.waitForTimeout(400);
      got[id][form] = await collect(pg, false);
    }
    if (errs.length) problems.push(id + ': שגיאה בדף — ' + errs.join(' | '));
    await pg.close();
  }
  for (const [key, tord] of Object.entries(BOARDS)) {
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
    got[key] = {};
    for (const form of FORMS) {
      await pg.click('[data-form="' + form + '"]', { force: true });
      await pg.waitForTimeout(800);
      // הלוח: כל השורות מכל העמודים יחד (החלוקה לעמודים תלויה בגופן — לא נבדקת), בלי שורות "(המשך)"
      const pages = await collect(pg, true), rows = [];
      Object.keys(pages).forEach((sid) => (pages[sid].rows || []).forEach((r) => { if (!/\(המשך\)\s*$/.test(r)) rows.push(r); }));
      got[key][form] = { rows: rows };
      for (const x of await orderCheck(pg, tord)) problems.push(key + ' ' + form + ': סדר השעות — ' + x);
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
