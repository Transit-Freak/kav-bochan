#!/usr/bin/env node
// הקו המזין — סיכום שבועי מוכן מראש (שלמה 14.10: "תוודא שהאתר ידע לסכם כבר, שלא ייקח הרבה זמן טעינה").
// מריץ את feeder/core.js — אותו חישוב בדיוק של הדף — על 7 הימים האחרונים שיש להם גם נתוני אוטובוסים
// (bus/data/feeder/D.json) וגם נתוני רכבות (rail/data/days/D.json), בהגדרות ברירת המחדל של הדף
// (טווחים 0–4/5–7/8–12/13–17, עד 7 דק' הליכה, קווים מזינים ומסוף), ומצרף לכל תחנה × כיוון × קו.
// הדף טוען את הסיכום (קטן) במקום שבעה קובצי יום; שינוי טווחים, הליכה או "כל הקווים" — חישוב מחדש מקובץ יום.
//
//   node tools/feeder_summary.mjs [--days 7]
// פלט: bus/data/feeder/summary.json
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const N = +(process.argv[process.argv.indexOf('--days') + 1] || 7) || 7;
const FD = path.join(ROOT, 'bus/data/feeder'), RD = path.join(ROOT, 'rail/data/days');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

// core.js בסביבת דפדפן מדומה: fetch קורא מהדיסק
const ctx = { window: {}, document: { currentScript: { src: 'file:///feeder/core.js' } }, console, Math, JSON, Object, Array, Set, Map, Promise, String, Number, isFinite, Infinity };
ctx.fetch = async (u) => {
  const p = path.join(ROOT, String(u).replace(/^file:\/\/\//, '').replace(/\?.*$/, ''));
  if (!fs.existsSync(p)) return { ok: false, status: 404 };
  return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) };
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'feeder/core.js'), 'utf8'), ctx);
const K = ctx.window.FeederCore;
K.C.STN = read('rail/data/stations.json');

const days = fs.readdirSync(FD).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10))
  .filter((d) => fs.existsSync(path.join(RD, d + '.json'))).sort().slice(-N);
if (!days.length) { console.error('אין ימים עם נתוני אוטובוסים ורכבות יחד'); process.exit(0); }

const O = { walk: 7, lines: 1, th: K.DEF_TH.slice() };   // מזינים + מסוף ליד הרכבת (ברירת המחדל בדף)
const mid = (O.th[1] + O.th[2] - 1) / 2;
const out = { built: new Date().toISOString(), days, th: O.th, walk: O.walk, lines: O.lines, meas: 0, modes: {}, routes: {}, dirs: {} };
const agg = { to: new Map(), from: new Map() };
let measSum = 0;
for (const d of days) {
  await K.load(d);
  measSum += K.C.meas;
  for (const mode of ['to', 'from']) {
    for (const r of K.allRows(Object.assign({ mode }, O))) {
      const key = r.st + '|' + r.dir.dk + '|' + r.rid;
      let a = agg[mode].get(key);
      if (!a) {
        a = { st: r.st, dk: r.dir.dk, rid: r.rid, num: r.num, op: r.op, from: r.from, to: r.to, feed: r.feed, mkt: r.R[3],
          name: r.dir.name, via: r.dir.via, cnt: [0, 0, 0, 0, 0], gaps: [], hours: {}, days: {} };
        agg[mode].set(key, a);
      }
      a.name = r.dir.name; a.feed = Math.max(a.feed, r.feed);
      r.cnt.forEach((v, i) => a.cnt[i] += v);
      for (const x of r.rows) if (x.c < 4) a.gaps.push(Math.round(x.gap * 10) / 10);
      for (const [h, c] of Object.entries(r.hours)) { const t = (a.hours[h] = a.hours[h] || [0, 0, 0, 0, 0]); c.forEach((v, i) => t[i] += v); }
      a.days[d] = [r.cnt[0], r.cnt[0] + r.cnt[1] + r.cnt[2] + r.cnt[3]];   // דורש עדכון, חיבורים
    }
  }
}
out.meas = Math.round(1000 * measSum / days.length) / 1000;
// הצבע של כל שעה: הקטגוריה שרוב החיבורים בה (כמו בדף); "-" = אין נסיעות בשעה הזו
const hourStr = (hs) => { let s = ''; for (let h = 5; h < 24; h++) { const c = hs[h]; if (!c) { s += '-'; continue; } const n = c[0] + c[1] + c[2] + c[3] || 1; s += c[0] / n > .5 ? 0 : c[1] / n > .5 ? 1 : c[2] / n >= .5 ? 2 : c[3] ? 3 : 4; } return s; };
for (const mode of ['to', 'from']) {
  const rows = [...agg[mode].values()];
  for (const a of rows) {
    a.gaps.sort((x, y) => x - y);
    a.conn = a.gaps.length;
    a.med = a.conn ? a.gaps[a.conn >> 1] : null;
    a.shift = a.med == null || (a.med >= O.th[1] && a.med < O.th[2]) ? 0 : Math.round(mode === 'to' ? a.med - mid : mid - a.med);
  }
  // הכיוון שהקו מותאם אליו בתחנה — על פני כל השבוע (כמו allRows ליום אחד)
  const best = new Map();
  for (const a of rows) {
    if (!a.conn) continue;
    const k = a.st + '|' + a.rid, b = best.get(k), sc = (x) => [x.conn, -Math.abs(x.med - mid)];
    if (!b || sc(a)[0] > sc(b)[0] || (sc(a)[0] === sc(b)[0] && sc(a)[1] > sc(b)[1])) best.set(k, a);
  }
  const main = new Set(best.values());
  // שורה: [תחנה, כיוון, route_id, ראשי, cnt×5, חציון, הזזה, שעות, ימים]; פרטי הקו והכיוון — פעם אחת, למטה
  out.modes[mode] = rows.filter((a) => a.cnt.some((v) => v)).map((a) => {
    const m = main.has(a);
    out.routes[a.rid] = [a.num, a.op, a.from, a.to, a.feed, a.mkt];
    (out.dirs[mode] = out.dirs[mode] || {})[a.st + '|' + a.dk] = [a.name, a.via];
    return [a.st, a.dk, a.rid, m ? 1 : 0, ...a.cnt, a.med == null ? null : Math.round(a.med * 10) / 10, a.shift,
      m ? hourStr(a.hours) : '', m ? days.map((d) => a.days[d] || [0, 0]) : 0];
  });
}
out.cols = { row: 'st,dk,rid,main,upd,edge,ok,chk,far,med,shift,hours(05–23: 0–4 קטגוריה, - אין),days([דורש עדכון, חיבורים] לכל יום ב-days)', routes: 'rid → [קו, מפעיל, מגיע מ, נוסע ל, 2 מזין/1 מסוף, מק"ט]', dirs: 'מצב → תחנה|כיוון → [יעדי הרכבות, התחנה הבאה/הקודמת]' };
fs.writeFileSync(path.join(FD, 'summary.json'), JSON.stringify(out));
const sz = fs.statSync(path.join(FD, 'summary.json')).size;
console.log(`סיכום הקו המזין: ${days.length} ימים (${days[0]}–${days[days.length - 1]}) · ${out.modes.to.length} + ${out.modes.from.length} שורות · ${(sz / 1e6).toFixed(2)}MB`);
