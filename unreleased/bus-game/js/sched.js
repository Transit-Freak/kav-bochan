// סידור רכבים ונהגים לכל הקווים יחד (בלי ציור).
// הרכבים לא שייכים לקו אחד: כל רכב שנקנה (בטופס של קו כלשהו) נכנס למאגר המשותף של החברה לפי סוג.
// כל יום: כל הנסיעות של כל הקווים (לפי שעות הפעילות והתדירות של כל שעה) משובצות לרכבים ("בלוקים"):
// רכב שסיים נסיעה במסוף לוקח את הנסיעה הבאה שיוצאת מאותו מסוף או ממסוף קרוב (נסיעה ריקה לפי הרשת + הפסקה מינימלית).
// סוג הרכב: רכב גדול יכול לעשות נסיעה של קו קטן ממנו, לא להפך (מיניבוס < רגיל = חשמלי < מפרקי). קודם הסוג של הקו,
// ורכב גדול רק כשזה חוסך רכב או כשבלי זה הנסיעה מתבטלת. לחשמלי אין במשחק טווח או טעינה — מתחלף עם רגיל.
// אחר כך הנהגים: נהג נוהג עד 6 שעות ברצף, ואז הפסקה של 30 דק' לפחות או החלפה במסוף בנהג אחר; משמרת עד 9 שעות.
// מספר הנהגים — כמה שגויסו (bank.drivers). אין רכב או אין נהג — הנסיעה מבוטלת, עם סיבה (לא עוברים על הכללים).
// sim.js מריץ את הנסיעות לפי הסידור (dispatchSched), duty.js לוקח את המשמרת של השחקן מכאן, main.js מצייר את הלוח.
import { TYPES, DEADHEAD_SPEED, typeOf, lineCycle, dayOf } from './fleet.js';
import { hoursOf } from './demand.js';

export const MIN_LAYOVER = 240;          // שנ' — הפסקה מינימלית במסוף בין נסיעות (בתכנון)
export const MIN_TURN = 120;             // שנ' — בפועל: רכב שחזר באיחור יוצא שוב אחרי 2 דק' לפחות
export const MAX_DEADHEAD = 20 * 60;     // נסיעה ריקה בין מסופים — עד 20 דק'
export const MAX_DRIVE = 6 * 3600;       // נהיגה ברצף
export const BREAK = 30 * 60;            // הפסקה שמאפסת את הנהיגה ברצף
export const MAX_SHIFT = 9 * 3600;       // משמרת
export const SLACK = 15 * 60;            // בתכנון: רבע שעה מתחת לגבולות, כדי שאיחור קטן לא יעבור עליהם
export const SIGN_ON = 10 * 60, SIGN_OFF = 5 * 60;   // התייצבות וסיום (בתוך המשמרת)
export const LATE_CANCEL = 20 * 60;      // רכב שלא חזר 20 דק' אחרי היציאה המתוכננת — הנסיעה מבוטלת
export const DRIVER_HIRE = 1_000;        // ₪ גיוס נהג (פעם אחת)
export const DRIVER_WAGE = 80;           // ₪ לשעת משמרת (גם הפסקות והמתנה במסוף). שאר "העלות לשעה" של הרכב (TYPES[].hour) — תחזוקה
export const SIZE = { mini: 1, std: 2, elec: 2, artic: 3 };
export const REASON = { veh: 'אין רכב פנוי', fit: 'אין רכב מתאים', drv: 'אין נהג', late: 'הרכב לא חזר בזמן' };
const HW_OPTS = [5, 10, 15, 20, 30, 60];
const snapHw = m => HW_OPTS.reduce((a, b) => Math.abs(b - m) < Math.abs(a - m) ? b : a, 20);
const DAY = 86400;
const less = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };

// תדירות בשעה h (דק'): קו אמיתי — לפי לוח הזמנים של אותה שעה (ואם אין — כמו בשעה הקודמת), אחרת def.headway
export function headwayAt(def, h, prev) {
  const m = def.real?.hw?.[h];
  return m ? snapHw(m) : prev || def.headway || 20;
}
// הנסיעות של קו ביום day (זמנים מתחילת המשחק)
export function lineTrips(L, day) {
  const d = L.def, D0 = (day - 1) * DAY, [a, b] = hoursOf(d), run = lineCycle(L).run, out = [];
  const ranges = a < b ? [[a, b]] : a === b ? [[0, 1440]] : [[0, b], [a, 1440]];
  for (const [s, e] of ranges) {
    let t = s * 60, hw = null;
    while (t < e * 60) {
      hw = headwayAt(d, Math.floor(t / 3600) % 24, hw);
      out.push({ key: `${L.id}@${t}`, lid: L.id, L, dep: D0 + t, arr: D0 + t + run, from: L.stops[0], to: L.stops[L.stops.length - 1], type: typeOf(d), status: 'plan' });
      t += hw * 60;
    }
  }
  return out;
}

export class Scheduler {
  // sim: הסימולציה. routeLen(a, b) — אורך הדרך בין שתי תחנות ברשת (מ'), או null
  constructor(sim) { this.sim = sim; this.routeLen = null; this.dirty = true; this.plan = null; this.dhCache = new Map(); this.noteAt = new Map(); this.sig = ''; this.sigT = -1e9; }
  get bank() { return this.sim.bank; }
  managed(L) { return !L.retired && L.def.fleet != null && L.stops.length >= 2 && !!L.poly; }
  lines() { return this.sim.lines.filter(L => this.managed(L)); }
  // המאגר: כל הרכבים שנקנו או נלקחו בליסינג, לפי סוג
  pool() {
    const p = { mini: 0, std: 0, artic: 0, elec: 0 };
    for (const L of this.lines()) p[typeOf(L.def)] += L.def.fleet || 0;
    return p;
  }
  hired() { const n = this.bank?.drivers; return n == null ? Infinity : n; }
  // זמן נסיעה ריקה בין שתי תחנות (שנ'): לפי הרשת, ואם אין — קו אווירי × 1.4
  dh(a, b) {
    if (a === b) return 0;
    const k = a.id + '>' + b.id; let v = this.dhCache.get(k);
    if (v === undefined) {
      let len = null; try { len = this.routeLen?.(a, b); } catch { }
      if (!(len >= 0) || !isFinite(len)) len = Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0)) * 1.4;
      v = len / DEADHEAD_SPEED; this.dhCache.set(k, v);
    }
    return v;
  }
  // חתימה של מה שמשפיע על הסידור: קווים, סוגים, כמויות, שעות, תדירות (לא של קו אמיתי — היא משתנה כל שעה לבד), נהגים
  signature() {
    return this.lines().map(L => { const d = L.def; return [L.id, d.vtype, d.fleet, (d.hours || []).join('-'), d.real ? 'r' : d.headway, L.stops.length, Math.round(L.poly.length)].join(':'); }).join('|') + '#' + this.hired();
  }
  // נקרא בכל צעד של הסימולציה: בונים מחדש בתחילת יום, כשמשהו השתנה, או כשסומן dirty
  ensure() {
    const t = this.sim.time, day = dayOf(t);
    if (!this.dirty && this.plan?.day === day && t - this.sigT < 30) return;
    if (!this.dirty && this.plan?.day === day) { this.sigT = t; const s = this.signature(); if (s === this.sig) return; }
    this.rebuild();
  }
  rebuild() {
    const t = this.sim.time, day = dayOf(t), old = this.plan;
    this.dirty = false; this.sigT = t; this.sig = this.signature();
    const lines = this.lines(), pool = this.pool();
    // בשמירה ישנה (בלי ספירת נהגים) — הנהגים שהקווים צריכים נרשמים כמגויסים
    // "צריך": בלי הגבלה של רכבים ונהגים (רכבים), ועם הרכבים שיש בלי הגבלה של נהגים (נהגים)
    const ideal = this.build(lines, day, null, Infinity), withPool = this.build(lines, day, pool, Infinity);
    if (this.bank && this.bank.drivers == null) { this.bank.drivers = withPool.drivers.length; this.bank.driversMigrated = withPool.drivers.length || 0; this.sig = this.signature(); }
    const P = this.hired() >= withPool.drivers.length ? withPool : this.build(lines, day, pool, this.hired());
    P.ideal = { veh: ideal.used, vehN: ideal.vehicles.length, drv: ideal.drivers.length, drvPool: withPool.drivers.length };
    P.alone = lines.reduce((a, L) => a + this.chainCount(lineTrips(L, day)), 0);
    P.pool = pool;
    // מה שכבר קרה היום נשאר: נסיעות שיצאו או בוטלו (לפי המפתח), ואוטובוסים שבדרך עוברים לרכב של הנסיעה שלהם בסידור החדש
    const byKey = new Map(P.trips.map(x => [x.key, x]));
    if (old && old.day === day) {
      for (const x of old.trips) {
        const n = byKey.get(x.key); if (!n || x.status === 'plan') continue;
        n.status = x.status; n.actual = x.actual; if (x.status === 'cancel') { n.reason = x.reason; n.cancel = true; }
      }
    }
    // נסיעות שהזמן שלהן עבר לפני שהיו בסידור (קו חדש, טעינה של שמירה) — לא נספרות, ולא יוצאות כולן בבת אחת
    const had = new Set(old && old.day === day ? old.trips.map(x => x.key) : []);
    for (const x of P.trips) if (x.status === 'plan' && x.dep < t - 60 && !had.has(x.key)) x.status = 'skip';
    for (const K of this.sim.lines) for (const b of K.buses) {
      if (!b.trip || b.state === 'done' || b.state === 'gone') continue;
      const n = byKey.get(b.trip.key);
      if (n && n.veh) { b.trip = n; b.veh = n.veh; n.veh.bus = b; n.status = 'run'; } else b.veh = null;
    }
    P.byLine = new Map();
    for (const x of P.trips) { let a = P.byLine.get(x.lid); if (!a) P.byLine.set(x.lid, a = []); a.push(x); }
    P.ptr = new Map();
    this.plan = P;
    return P;
  }
  // כמה רכבים צריך לקו לבד (בלי שיתוף): כל נסיעה חוזרת ריקה לתחילת הקו
  chainCount(trips) {
    const free = []; let n = 0;
    for (const x of trips) {
      const back = this.dh(x.to, x.from);
      const i = free.findIndex(r => r <= x.dep);
      if (i >= 0) free.splice(i, 1); else n++;
      free.push(x.arr + back + MIN_LAYOVER);
    }
    return n;
  }
  // הסידור עצמו. pool — כמה רכבים מכל סוג (null = בלי הגבלה), nDrv — כמה נהגים
  build(lines, day, pool, nDrv) {
    const trips = lines.flatMap(L => lineTrips(L, day)).sort((a, b) => a.dep - b.dep || (a.lid < b.lid ? -1 : 1));
    const vehicles = [], drivers = [], used = { mini: 0, std: 0, artic: 0, elec: 0 };
    const left = t => pool ? pool[t] - used[t] : Infinity;
    const newVeh = (type, x) => { const v = { id: vehicles.length + 1, type, n: ++used[type], trips: [], readyAt: -Infinity, at: null }; vehicles.push(v); return v; };
    for (const x of trips) {
      const need = SIZE[x.type];
      // רכבים שכבר בדרך היום ויכולים להגיע למסוף בזמן
      const reach = vehicles.filter(v => SIZE[v.type] >= need && v.readyAt + this.dh(v.at, x.from) + MIN_LAYOVER <= x.dep && this.dh(v.at, x.from) <= MAX_DEADHEAD);
      const best = arr => arr.sort((a, b) => this.dh(a.at, x.from) - this.dh(b.at, x.from) || b.readyAt - a.readyAt)[0];
      // הסדר: אותו סוג שכבר בדרך → אותו סוג מהמאגר → רכב גדול יותר (או חשמלי/רגיל) שכבר בדרך → כזה מהמאגר
      const cands = [];
      const same = best(reach.filter(v => v.type === x.type)); if (same) cands.push([same, false]);
      if (left(x.type) > 0) cands.push([null, x.type]);
      const big = best(reach.filter(v => v.type !== x.type)); if (big) cands.push([big, false]);
      for (const t of Object.keys(SIZE).filter(t => t !== x.type && SIZE[t] >= need).sort((a, b) => SIZE[a] - SIZE[b])) if (left(t) > 0) cands.push([null, t]);
      if (!cands.length) {
        // אין רכב: האם יש רכב פנוי, רק קטן מדי?
        const small = vehicles.some(v => SIZE[v.type] < need && v.readyAt + this.dh(v.at, x.from) + MIN_LAYOVER <= x.dep) || Object.keys(SIZE).some(t => SIZE[t] < need && left(t) > 0);
        x.cancel = true; x.reason = small ? REASON.fit : REASON.veh; continue;
      }
      // נהג לנסיעה (לפי הרכב הראשון שמתאים)
      const [v0, nt] = cands[0];
      const d = this.pickDriver(drivers, x, v0, nDrv);
      if (!d) { x.cancel = true; x.reason = REASON.drv; continue; }
      const v = v0 || newVeh(nt, x);
      x.veh = v; x.up = SIZE[v.type] > need; x.swap = !x.up && v.type !== x.type;
      v.trips.push(x); v.readyAt = x.arr; v.at = x.to;
      this.assign(d, x, v);
    }
    for (const d of drivers) d.end = d.lastEnd + SIGN_OFF;
    return { day, trips, vehicles, drivers, used };
  }
  // הנהג לנסיעה x ברכב v (null — רכב חדש מהמאגר). קודם מי שכבר נוהג ברכב הזה, אחר כך נהג פנוי במסוף, ובסוף נהג חדש
  pickDriver(drivers, x, v, nDrv) {
    const ok = d => {
      const onIt = v && d.veh === v && d.lastEnd === v.readyAt && d.at === v.at;
      const travel = onIt ? 0 : this.dh(d.at, x.from);
      if (travel > MAX_DEADHEAD) return null;
      if (d.lastEnd + travel + (onIt ? 0 : MIN_TURN) > x.dep) return null;
      const rest = x.dep - d.lastEnd - travel, cont = rest >= BREAK ? x.dep : d.contStart;
      if (x.arr - cont > MAX_DRIVE - SLACK || x.arr + SIGN_OFF - d.start > MAX_SHIFT - SLACK) return null;
      return { travel, onIt, rest };
    };
    // החלפה במסוף: מי שנוהג ברכב כבר 4 שעות ומעלה, ובמסוף מחכה נהג אחרי הפסקה — הנהג שנח עולה, והראשון יוצא להפסקה
    // (כך נהג אחד נוסף מחליף כמה רכבים לסירוגין, במקום שכל הנהגים יסיימו יחד אחרי 6 שעות)
    const cur = v && drivers.find(d => d.veh === v && d.lastEnd === v.readyAt && d.at === v.at);
    const relief = cur && x.dep - cur.contStart >= 4 * 3600;
    let best = null, bk = null;
    for (const d of drivers) {
      const r = ok(d); if (!r) continue;
      const k = [relief && !r.onIt && r.rest >= BREAK ? -1 : r.onIt ? 0 : 1, r.travel, -d.lastEnd];
      if (!bk || less(k, bk)) { best = d; bk = k; }
    }
    if (best) return best;
    if (drivers.length >= nDrv) return null;
    const d = { id: drivers.length + 1, start: x.dep - SIGN_ON, contStart: x.dep, lastEnd: -Infinity, at: x.from, veh: null, trips: [] };
    drivers.push(d); return d;
  }
  assign(d, x, v) {
    const rest = x.dep - d.lastEnd - (d.trips.length ? this.dh(d.at, x.from) : 0);
    if (!d.trips.length || rest >= BREAK) d.contStart = x.dep;
    d.trips.push(x); d.lastEnd = x.arr; d.at = x.to; d.veh = v; x.drv = d;
  }

  // ---------- בזמן ריצה (sim.js)
  // שכר: כל נהג בסידור מקבל שכר לכל שעה במשמרת (מההתייצבות עד הסיום), על חשבון הקו של הנסיעה הבאה שלו
  pay(h) {
    const P = this.plan, bank = this.bank; if (!P || !bank) return;
    const t = this.sim.time;
    for (const d of P.drivers) {
      if (t < d.start || t >= d.end) continue;
      const x = d.trips.find(x => x.arr > t) || d.trips[d.trips.length - 1];
      bank.spend('drivers', DRIVER_WAGE * h / 3600, x?.lid);
    }
  }
  // הנסיעה הבאה של קו שעוד לא יצאה (או null)
  nextOf(L) {
    const P = this.plan, a = P?.byLine.get(L.id); if (!a) return null;
    let i = P.ptr.get(L.id) || 0; while (i < a.length && a[i].status !== 'plan') i++;
    P.ptr.set(L.id, i); return a[i] || null;
  }
  cancel(x, reason) {
    x.status = 'cancel'; x.cancel = true; x.reason = reason || x.reason;
    const L = x.L, k = L.id + reason, t = this.sim.time;
    // ביומן הסדרן: פעם בשעה לכל קו וסיבה (שלא יציף), אבל כל נסיעה נספרת
    if (!(this.noteAt.get(k) > t - 3600)) { this.noteAt.set(k, t); this.sim.ops.note('cancel', L, `נסיעה ${clock(x.dep)} בוטלה — ${x.reason}`); }
  }
  // רכב פנוי עכשיו לנסיעה x? (חזר מהנסיעה הקודמת + נסיעה ריקה + 2 דק')
  vehReady(v, x) {
    if (v.bus) return false;
    if (v.endAt == null) return true;
    return this.sim.time >= v.endAt + this.dh(v.at, x.from) + MIN_TURN;
  }
  // האוטובוס סיים נסיעה: הרכב פנוי (במסוף האחרון של הקו)
  done(b, L) {
    const v = b.veh; if (!v) return;
    if (v.bus === b) v.bus = null;
    v.endAt = this.sim.time; v.at = L.stops[L.stops.length - 1];
    if (b.trip) { b.trip.status = 'done'; b.trip.end = this.sim.time; }
  }
  // האם הקו פועל היום (יש לו נסיעה שלא בוטלה)
  serves(L) {
    const a = this.plan?.byLine.get(L.id);
    return !!a && a.some(x => !x.cancel);
  }
  // כל הנסיעות של הקו היום משובצות (אף אחת לא מבוטלת בתכנון)
  full(L) { const a = this.plan?.byLine.get(L.id); return !!a && a.length > 0 && !a.some(x => x.cancel); }
  // תדירות בפועל לפי הסידור סביב t (דק'): הנסיעות שלא בוטלו בשעה שלפני ואחרי
  hwOf(L, t) {
    const a = this.plan?.byLine.get(L.id); if (!a) return Infinity;
    const d = a.filter(x => !x.cancel && x.dep >= t - 3600 && x.dep <= t + 3600).map(x => x.dep);
    if (d.length >= 2) return (d[d.length - 1] - d[0]) / (d.length - 1) / 60;
    return d.length ? 120 : Infinity;
  }
  // "אוטובוס נוסף" של הסדרן: רכב מתאים שעומד עכשיו במאגר ולא צריך אותו בשעה הקרובה, ונהג שלא עובד היום
  extra(L) {
    const P = this.plan; if (!P) return false;
    const t = this.sim.time, run = lineCycle(L).run, need = SIZE[typeOf(L.def)];
    const v = P.vehicles.find(v => SIZE[v.type] >= need && !v.bus && (v.endAt == null || t >= v.endAt + this.dh(v.at, L.stops[0]) + MIN_TURN)
      && !v.trips.some(x => x.status === 'plan' && x.dep < t + run + 600 && x.dep > t - 600));
    const spare = this.hired() - P.drivers.length;
    if (!v || spare <= 0) return false;
    const x = { key: `${L.id}@x${Math.round(t)}`, lid: L.id, L, dep: t, arr: t + run, from: L.stops[0], to: L.stops[L.stops.length - 1], type: typeOf(L.def), status: 'plan', veh: v, extra: true, up: SIZE[v.type] > need };
    const d = { id: P.drivers.length + 1, start: t - SIGN_ON, contStart: t, lastEnd: x.arr, end: x.arr + SIGN_OFF, at: x.to, veh: v, trips: [x], extra: true };
    x.drv = d; P.drivers.push(d); v.trips.push(x); v.trips.sort((a, b) => a.dep - b.dep);
    P.trips.push(x); const a = P.byLine.get(L.id) || []; const i = P.ptr.get(L.id) || 0;
    a.splice(i, 0, x); P.byLine.set(L.id, a);
    return true;
  }

  // ---------- סיכומים ובדיקה
  stats() {
    const P = this.plan; if (!P) return null;
    const c = { trips: P.trips.length, run: 0, done: 0, cancel: 0, plan: 0, skip: 0, why: {} };
    for (const x of P.trips) {
      if (x.status === 'cancel' || (x.cancel && x.status === 'plan')) { c.cancel++; c.why[x.reason] = (c.why[x.reason] || 0) + 1; }
      else c[x.status]++;
    }
    c.cancelPlanned = P.trips.filter(x => x.cancel).length;
    c.vehNeed = P.ideal.vehN; c.vehUsed = P.vehicles.length; c.alone = P.alone;
    c.owned = Object.values(P.pool).reduce((a, b) => a + b, 0);
    c.drvNeed = P.ideal.drv; c.drvUsed = P.drivers.length; c.hired = this.hired();
    c.up = P.trips.filter(x => x.up && !x.cancel).length;
    return c;
  }
  // הכללים: נהיגה ברצף (נסיעות עם פער של פחות מ-30 דק' ביניהן — רצף אחד) ואורך משמרת
  // actual — לפי מה שקרה בפועל (יציאה ממסוף וסיום), לא לפי התכנון
  static audit(P, actual = false) {
    const out = [];
    const dep = x => actual ? x.actual ?? x.dep : x.dep, arr = x => actual ? x.end ?? x.arr : x.arr;
    for (const d of P.drivers) {
      const T = d.trips.filter(x => x.status !== 'cancel' && x.status !== 'skip' && !(actual && x.status === 'plan')); if (!T.length) continue;
      let s = dep(T[0]), maxC = 0;
      for (let i = 0; i < T.length; i++) {
        if (i && dep(T[i]) - arr(T[i - 1]) >= BREAK) s = dep(T[i]);
        maxC = Math.max(maxC, arr(T[i]) - s);
      }
      const start = Math.min(d.start, dep(T[0]) - SIGN_ON), end = Math.max(d.end, arr(T[T.length - 1]) + SIGN_OFF);
      out.push({ id: d.id, trips: T.length, start, end, shift: end - start, maxCont: maxC, drive: T.reduce((a, x) => a + arr(x) - dep(x), 0) });
    }
    return out;
  }
  // משמרת לשחקן (duty.js): נהג שיש לו נסיעה בקו L (או בכיוון השני שלו) אחרי t — המוקדם ביותר
  dutyFor(L, t, pair) {
    const P = this.plan; if (!P) return null;
    const ids = new Set([L.id, pair?.id].filter(Boolean));
    let best = null, bt = Infinity;
    for (const d of P.drivers) {
      const x = d.trips.find(x => ids.has(x.lid) && x.dep >= t && x.status === 'plan' && !x.cancel);
      if (x && x.dep < bt) { bt = x.dep; best = { d, from: x }; }
    }
    if (!best) return null;
    const i = best.d.trips.indexOf(best.from);
    return { driver: best.d, trips: best.d.trips.slice(i).filter(x => x.status === 'plan' && !x.cancel) };
  }
}

export function clock(t) {
  const m = Math.floor(t / 60) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}
