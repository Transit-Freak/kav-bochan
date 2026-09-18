// קו פח — חישוב מוקדם של הצבירה לכל קו (שלמה 18.09, בעקבות ההצעה "סקריפט
// שיכין חתיכות מוכנות"): מריץ את אותו פענוח שה-worker מריץ בדפדפן (xlsx-worker.js)
// ואת אותה צבירה (kavpach-core.js) ב-Node, וכותב data-lines.json — ~5,000 רשומות
// במקום 205 אלף נסיעות. האתר טוען את הקובץ ומציג את הדירוג מיד; הנסיעות עצמן
// נטענות ברקע רק ללשוניות שצריכות אותן. רץ ב-GitHub Actions בכל שינוי נתונים/קוד.
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p));
const ab = (p) => { const b = rd(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };   // ArrayBuffer נקי (Buffer של Node חולק מאגר)
const require = createRequire(import.meta.url);

// ה-worker בתוך vm עם חיקוי מינימלי של סביבת Worker
const ctx = { console, TextDecoder, TextEncoder, XLSX: null };
ctx.self = ctx;
ctx.importScripts = () => {};
ctx.postMessage = () => {};
vm.createContext(ctx);
vm.runInContext(rd('xlsx-worker.js').toString('utf8'), ctx, { filename: 'xlsx-worker.js' });
const t0 = Date.now();
const payload = {
  jsonMainBuf: ab('data-main.json'),
  jsonScheduleBuf: ab('data-schedule.json'),
  jsonBenchmarkBuf: fs.existsSync(path.join(ROOT, 'data-benchmark.json')) ? ab('data-benchmark.json') : null,
};
ctx.__payload = payload;
const parsed = vm.runInContext('parseJSON(__payload)', ctx);
console.log(`נסיעות: ${parsed.trips.length.toLocaleString()} (${Date.now() - t0} ms)`);

const core = require(path.join(ROOT, 'kavpach-core.js'));
const t1 = Date.now();
const lines = core.aggregateLineGroups(parsed.trips, parsed.costBenchmark);
console.log(`רשומות קווים: ${lines.length.toLocaleString()} (${Date.now() - t1} ms)`);

// ניקוד בהגדרות ברירת המחדל עם הקבצים הנלווים כפי שהם ברגע הבנייה — כדי שהמסך
// הראשון לא יצטרך להוריד גם אותם (ארכיון, חפיפות, נסיעות תפעוליות: ~3MB)
const PACH_DEFAULTS = {
  minScore: 25,
  c: { lowTrips: { on: true, max: 30 }, wastedKm: { on: true, max: 20 }, cost: { on: true, max: 20 },
       riders: { on: true, max: 30, low: null, peak: null }, deadhead: { on: true, max: 10 } },
  p: { exclusive: 15, train: 10, school: 10, prebook: 20, weekend: 10, newLine: 10, reduced: 10, noAlt: 10 },
};
const optJson = (p) => { try { return JSON.parse(rd(p).toString('utf8')); } catch (e) { return null; } };
const live = optJson('kavpach-live.json'), overlap = optJson('kavpach-overlap.json'), dh = optJson('bus/data/deadhead.json');
const liveMap = live && live.lines ? live.lines : null;
const sctx = {
  pset: PACH_DEFAULTS,
  liveOf: (mk) => (liveMap ? (liveMap[String(mk || '').replace(/^0+/, '').trim()] || null) : null),
  overlapMap: overlap && overlap.lines ? overlap.lines : null,
  dhObs: dh,
};
let nScored = 0;
for (const r of lines) { r.sc = core.scoreCore(r, sctx); nScored++; }
console.log(`ניקוד ברירת מחדל: ${nScored} רשומות`);

const sig = (p) => { const st = fs.statSync(path.join(ROOT, p)); return `${st.size}`; };
const out = {
  updated: new Date().toISOString().slice(0, 10),
  // חתימות המקור: האתר משווה מול הקבצים החיים (Content-Length) — קובץ מוכן שלא תואם נזרק ומחושב בדפדפן
  src: { main: sig('data-main.json'), schedule: sig('data-schedule.json') },
  // תאריכי הקבצים הנלווים שהניקוד המוכן נשען עליהם — קובץ נלווה חדש יותר = חישוב מחדש בדפדפן
  deps: { live: live && live.gen || null, overlap: overlap && overlap.gen || null, deadhead: dh && dh.updated || null },
  core: crypto.createHash('sha1').update(rd('kavpach-core.js')).digest('hex').slice(0, 10),
  psetDefaults: PACH_DEFAULTS,
  lines,
};
fs.writeFileSync(path.join(ROOT, 'data-lines.json'), JSON.stringify(out));
console.log(`data-lines.json: ${(fs.statSync(path.join(ROOT, 'data-lines.json')).size / 1024).toFixed(0)} KB`);
