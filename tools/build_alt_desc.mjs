// תיאור החלופות של כל קו ("דרך שכונת…", "דרך רחוב…", "מתחיל ב…") — מחושב כאן, מראש,
// ולא בדפדפן (שלמה 26.09: "במקום לשמור אצלנו להכין את כל החלופות מראש, הוא עשה
// שהתוכנה תבדוק כשנכנסים לקו"). אותו קוד בדיוק שרץ בעמוד: הפונקציות נשלפות מ-
// line-history/app.jsx, כך שכלל שמשתנה שם משתנה גם כאן.
// פלט: line-history/data/alt-desc/<2 ספרות ראשונות>.json = {משפחה: {מק"ט-וריאנט: תיאור}}
// לפי המצב העדכני של כל חלופה. מצב היסטורי (בחירת גרסה ישנה, מסלולי 2012) — עדיין בעמוד.
import fs from 'fs'; import vm from 'vm'; import zlib from 'zlib'; import path from 'path';
const DIR = process.env.OUTDIR || 'line-history/data';
const src = fs.readFileSync('line-history/app.jsx', 'utf8');
// שליפת הגדרה עליונה לפי שם (function X / const X =) עם איזון סוגריים
function grab(name) {
  // ההגדרות בקובץ הן ברמה העליונה: פונקציה נגמרת בשורה שהיא "}" בתחילת שורה,
  // הגדרת const בשורה אחת נגמרת בסוף השורה
  const L = src.split('\n');
  let i = L.findIndex((l) => new RegExp('^(async )?function ' + name + '\\b').test(l));
  if (i < 0) {
    i = L.findIndex((l) => new RegExp('^(const|let) ' + name + '\\b').test(l));
    if (i < 0) throw new Error('missing ' + name);
    if (/;\s*(\/\/.*)?$/.test(L[i])) return L[i];
  }
  let j = i + 1;
  while (j < L.length && !/^\}\)?;?\s*$/.test(L[j])) j++;
  return L.slice(i, j + 1).join('\n');
}
const names = ['fsafe', 'hiddenEv', 'fmtD', 'gapDays', 'materializeLf', 'variantPart', 'variantDirection', 'variantSnapshot', 'variantOrientation',
  'variantBase', 'variantRingContains', 'variantBoundaryDistance', 'variantNeighborhood', 'variantStreet', 'describeVariant'];
const extra = (process.env.EXTRA || '').split(',').filter(Boolean);
const parts = [...names, ...extra].map((n) => { const g = grab(n); if (process.env.DEBUG) console.log('== ' + n + ' ' + g.length + ' ' + JSON.stringify(g.slice(0, 80))); return g; });
const code = parts.join('\n') + '\nthis.api = { fsafe, materializeLf, variantSnapshot, variantBase, describeVariant };';
const ctx = vm.createContext({ console, Map, Set, Math, Number, String, Array, Object, JSON, Date, RegExp });
let STOP_STREETS = null;
try { STOP_STREETS = JSON.parse(fs.readFileSync(`${DIR}/stop-streets.json`, 'utf8')); } catch (e) {}
ctx.STOP_STREETS = STOP_STREETS;
try { ctx.STOP_CITIES = JSON.parse(fs.readFileSync(`${DIR}/stop-cities.json`, 'utf8')); } catch (e) { ctx.STOP_CITIES = null; }
vm.runInContext(code, ctx);
const { fsafe, materializeLf, variantSnapshot, variantBase, describeVariant } = ctx.api;

const areas = [];
for (let i = 0; i < 8; i++) areas.push(...JSON.parse(zlib.gunzipSync(fs.readFileSync(`${DIR}/neighborhoods/${i}.json.gz`)).toString('utf8')));
const idx = JSON.parse(fs.readFileSync(`${DIR}/lines.json`, 'utf8'));
let trips = {};
try { trips = JSON.parse(fs.readFileSync(`${DIR}/line-trips.json`, 'utf8')); } catch (e) {}
const lines = (idx.lines || idx).filter((l) => !l.hgroup).map((l) => ({ ...l, ntr: trips[l.rd] || 0 }));
const fam = new Map();
for (const l of lines) { const f = l.rd.split('-')[0]; if (!fam.has(f)) fam.set(f, []); fam.get(f).push(l); }
// מתי החלופה פועלת לעומת הראשית (לו"ז לשבוע הקרוב, data/sched): "רק בימי שישי", "רק בבוקר" (שלמה 27.09)
const schedCache = {};
const sched = (rd) => {
  const k = fsafe(rd).slice(0, 2);
  if (!(k in schedCache)) { try { schedCache[k] = JSON.parse(fs.readFileSync(`${DIR}/sched/${k}.json`, 'utf8')).lines || {}; } catch (e) { schedCache[k] = {}; } }
  return schedCache[k][rd] || null;
};
const DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const mins = (t) => { const [h, m] = String(Array.isArray(t) ? t[0] : t).split(':').map(Number); return h * 60 + m; };   // ["16:30", 2] = שני רכבים באותה שעה
function when(rd, baseRd) {
  const a = sched(rd), b = baseRd && baseRd !== rd ? sched(baseRd) : null;
  if (!a || !b) return '';
  const da = DAYS.filter((d) => (a[d] || []).length), db = DAYS.filter((d) => (b[d] || []).length);
  const parts = [];
  if (da.length && da.length < db.length && da.every((d) => db.includes(d))) {
    const key = da.join('');
    const named = { 'ו': 'רק בימי שישי', 'ש': 'רק במוצאי שבת', 'וש': 'רק בסוף השבוע', 'אבגדה': 'רק בימי חול', 'אבגדהו': 'לא במוצאי שבת' }[key];
    parts.push(named || 'רק בימים ' + da.map((d) => d + "'").join(', '));
  }
  const ta = da.flatMap((d) => a[d]).map(mins), tb = db.flatMap((d) => b[d]).map(mins);
  if (ta.length && tb.length) {
    const lo = Math.min(...ta), hi = Math.max(...ta), blo = Math.min(...tb), bhi = Math.max(...tb);
    if (hi < 10 * 60 && bhi >= 12 * 60) parts.push('רק בבוקר');
    else if (lo >= 18 * 60 && blo < 12 * 60) parts.push('רק בערב');
    else if (lo >= 12 * 60 && hi < 18 * 60 && blo < 10 * 60 && bhi >= 19 * 60) parts.push('רק בצהריים');
  }
  return parts.join(' · ');
}
const shards = {}; let nFam = 0, nVar = 0, nMiss = 0;
const t0 = process.hrtime.bigint();
for (const [f, sibs] of fam) {
  if (sibs.length < 2) continue;
  const items = sibs.map((s) => {
    let lf = null;
    try { lf = materializeLf(JSON.parse(fs.readFileSync(`${DIR}/lines/${fsafe(s.rd)}.json`, 'utf8'))); } catch (e) { nMiss++; }
    return { ...s, snapshot: lf ? variantSnapshot(lf, null, false) : null };
  });
  const out = {};
  // אותו סדר תחנות = אותו מסלול (הבדל בשרטוט בלבד, למשל בכיכר, אינו חלופה אחרת) — "אותו מסלול כמו חלופה X" (שלמה 27.09)
  const seqKey = (it) => (it.snapshot?.stops || []).map((x) => String(x[0])).join(',');
  const partOf = (rd) => rd.split('-')[2];
  for (const it of items) {
    const base = variantBase(it, items, false);
    let t = describeVariant(it, base, areas);
    const k = seqKey(it);
    if (k && base && base.rd !== it.rd) {
      const twin = seqKey(base) === k ? base : items.find((x) => x.rd !== it.rd && x.rd !== base.rd && x.rd.split('-')[1] === it.rd.split('-')[1] && seqKey(x) === k && x.rd < it.rd);
      if (twin) t = twin === base ? 'אותו מסלול כמו הראשית' : 'אותו מסלול כמו חלופה ' + partOf(twin.rd);
    }
    const w = when(it.rd, base && base.rd);
    if (w) t = t === 'חלופה ראשית' ? t : w + ' · ' + t;
    out[it.rd] = t;
  }
  (shards[f.slice(0, 2).padStart(2, '0')] ||= {})[f] = out;
  nFam++; nVar += items.length;
}
fs.mkdirSync(`${DIR}/alt-desc`, { recursive: true });
for (const old of fs.readdirSync(`${DIR}/alt-desc`)) fs.unlinkSync(`${DIR}/alt-desc/${old}`);
for (const [k, v] of Object.entries(shards)) fs.writeFileSync(`${DIR}/alt-desc/${k}.json`, JSON.stringify(v));
console.log(`תיאורי חלופות: ${nFam} משפחות, ${nVar} חלופות, ${Object.keys(shards).length} שברים, קבצים חסרים ${nMiss}, ${Number(process.hrtime.bigint() - t0) / 1e9 | 0} שנ׳`);
