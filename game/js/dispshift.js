// משמרת של הסדרן: חלון זמן (בוקר / צהריים / אחר הצהריים), מטרה ("אמינות מעל 90%"), משאבים מוגבלים
// (אוטובוסי רזרבה ונהגים מחליפים) ואירועים שמחכים לטיפול — ואם לא מטפלים בהם תוך 5 דקות (בשעון המשחק) הם מחמירים.
// הציון בסגנון "מדד האמינות" של משרד התחבורה: כמה מהנסיעות המתוכננות יצאו בזמן (עד 5 דק' אחרי הלוח),
// כמה בוטלו, כמה היו צפופות, כמה נוסעים ויתרו, וכמה קנסות. בלי ציור — ops.js קורא לכאן, dispui.js מציג.

const H = 3600;
export const SHIFTS = [
  { id: 'am', name: 'משמרת בוקר', from: 6 * H, to: 9 * H, peak: true },
  { id: 'noon', name: 'משמרת צהריים', from: 11 * H, to: 14 * H, peak: false },
  { id: 'pm', name: 'משמרת אחר הצהריים', from: 15 * H, to: 18 * H, peak: true },
];
export const GOAL = 90;                    // % נסיעות בזמן
export const ON_TIME = 5 * 60;             // יציאה עד 5 דק' אחרי הלוח נחשבת בזמן (כמו במדד של המשרד: ‎−1 עד ‎+5)
export const ESCALATE = 5 * 60;            // אירוע שלא טיפלו בו — מחמיר אחרי 5 דק'
export const FINE_CANCEL = 500;            // ₪ קנס לכל נסיעה שבוטלה
export const FINE_STRAND = 1000;           // ₪ קנס לתקלה שנוסעים נתקעו בה
const LATE_P = 0.1, BREAK_P = 0.07;       // חלק מהנסיעות: נהג מאחר / תקלה בדרך (בשעות השיא פי 1.5)
const peakAt = t => { const m = (t % 86400) / 60; return (m >= 390 && m < 540) || (m >= 930 && m < 1080); };   // 06:30–09:00, 15:30–18:00
export const KIND = {
  late: { icon: '⏱', name: 'נהג מאחר' },
  break: { icon: '⚠', name: 'תקלה באוטובוס' },
  jam: { icon: '🚦', name: 'פקק' },
};
export function grade(pct) { return pct >= 96 ? 'A' : pct >= 93 ? 'B' : pct >= GOAL ? 'C' : pct >= 85 ? 'D' : 'F'; }

export class DispShift {
  // ops: אובייקט התפעול (ops.js). def: אחד מ-SHIFTS. rand: מחולל אקראי
  constructor(ops, def, rand) {
    this.ops = ops; this.def = def; this.rand = rand;
    const S = ops.sim, day0 = Math.floor(S.time / 86400) * 86400;
    this.start = day0 + def.from; this.end = day0 + def.to;
    this.inc = []; this.nextId = 1; this.lost = new Map(); this.lateKeys = new Set(); this.breakAt = new Map(); this.jamAt = [];
    this.crowded = 0; this.stranded = 0; this.strandN = 0; this.escalated = 0; this.handled = 0; this.done = false; this.report = null;
    this.gave0 = this.gaveNow();
    const trips = this.trips();
    // מי יאחר ואיפה תהיה תקלה — נקבע מראש לפי מספר הנסיעות (שלא תצא משמרת ריקה במקרה), יותר בשעות השיא
    const w = x => peakAt(x.dep) ? 1.5 : 1;
    const pick = (arr, n, skip) => { const out = []; const pool = arr.filter(x => !skip.has(x.key)); while (out.length < n && pool.length) { const tot = pool.reduce((a, x) => a + w(x), 0); let r = this.rand() * tot, i = 0; while (i < pool.length - 1 && (r -= w(pool[i])) > 0) i++; out.push(pool.splice(i, 1)[0]); } return out; };
    const cand = trips.filter(x => x.dep >= this.start + 120 && x.dep < this.end - 20 * 60);
    const nLate = Math.round(cand.reduce((a, x) => a + LATE_P * w(x), 0)), nBreak = Math.round(cand.reduce((a, x) => a + BREAK_P * w(x), 0));
    for (const x of pick(cand, nLate, new Set())) this.lateKeys.add(x.key);
    for (const x of pick(cand, nBreak, this.lateKeys)) this.breakAt.set(x.key, 0.2 + this.rand() * 0.5);
    // המשאבים: פחות ממה שצריך לכל האירועים (בערך שלושה רבעים), כדי שתצטרכו לבחור
    this.res = { bus: Math.max(1, Math.round(this.breakAt.size * 0.7)), drv: Math.max(2, Math.round(this.lateKeys.size * 0.75)) }; this.res0 = { ...this.res };
    // פקקים: בערך אחד לכל 2.5 קווים במשמרת, בזמנים אקראיים (יותר בשעות השיא)
    const nl = S.lines.filter(L => !L.retired).length, nJam = Math.max(2, Math.round(nl / 2.5));
    for (let i = 0; i < nJam; i++) { let t; do t = this.start + 600 + this.rand() * (this.end - this.start - 2400); while (!peakAt(t) && this.rand() < 0.35); this.jamAt.push(t); }
    this.jamAt.sort((a, b) => a - b);
  }
  get sim() { return this.ops.sim; }
  get on() { return !this.done; }
  gaveNow() { return this.sim.lines.reduce((a, L) => a + (L.stats?.gaveUp || 0), 0); }
  // הנסיעות המתוכננות במשמרת (בלי "אוטובוס נוסף" של הסדרן)
  trips() {
    const P = this.sim.roster?.plan; if (!P) return [];
    return P.trips.filter(x => !x.extra && x.status !== 'skip' && x.dep >= this.start && x.dep < this.end);
  }
  // מדד האמינות עד עכשיו. נסיעה "הוכרעה" כשיצאה, בוטלה, או שעברו 5 דק' מהזמן שלה ועוד לא יצאה
  tally(final = false) {
    const t = this.sim.time, c = { planned: 0, decided: 0, ontime: 0, late: 0, cancel: 0 };
    for (const x of this.trips()) {
      c.planned++;
      if (this.lost.has(x.key) || x.status === 'cancel' || x.cancel) { c.decided++; c.cancel++; continue; }
      const dep = (x.status === 'run' || x.status === 'done') ? x.actual : null;
      if (dep != null) { c.decided++; if (dep - x.dep <= ON_TIME) c.ontime++; else c.late++; continue; }
      if (t - x.dep > ON_TIME || (final && t > x.dep)) { c.decided++; c.late++; }
    }
    c.pct = c.decided ? Math.round(1000 * c.ontime / c.decided) / 10 : 100;
    c.fines = c.cancel * FINE_CANCEL + this.strandN * FINE_STRAND;
    return c;
  }
  live() {
    const c = this.tally(), S = this.sim;
    let full = 0; for (const L of S.lines) for (const b of L.buses) if ((b.state === 'drive' || b.state === 'dwell') && b.pax.length >= b.cap * 0.9) full++;
    return { ...c, full, gaveUp: this.gaveNow() - this.gave0 + this.stranded, res: this.res, left: Math.max(0, this.end - S.time), start: this.start, end: this.end };
  }

  // ---------- כל צעד (ops.tick)
  tick(h) {
    const S = this.sim, t = S.time;
    if (this.done) return;
    // פקק לפי התזמון: על קטע שלפני אוטובוס שבדרך (כדי שיהיה אכפת)
    while (this.jamAt.length && t >= this.jamAt[0]) {
      this.jamAt.shift();
      const bs = S.lines.filter(L => !L.retired && L.stops.length > 2).flatMap(L => L.buses.filter(b => b.state === 'drive' && !b.broken && b.next < L.stops.length - 1).map(b => [L, b]));
      if (!bs.length) continue;
      const [L, b] = bs[Math.floor(this.rand() * bs.length)], k = Math.min(L.stops.length - 2, b.next + (this.rand() < 0.5 ? 0 : 1));
      if (this.ops.jams.some(j => j.L === L && j.k === k)) continue;
      const j = { L, k, until: t + 1200 + this.rand() * 600, f: 0.3 };
      this.ops.jams.push(j);
      this.ops.note('jam', L, `פקק בין ${L.stops[k].name} ל${L.stops[k + 1].name}`);
      this.add('jam', L, null, { jam: j });
    }
    // תקלה בדרך: כשהאוטובוס של הנסיעה שנבחרה עבר את החלק שנקבע מהמסלול
    if (this.breakAt.size) for (const L of S.lines) for (const b of L.buses) {
      const f = b.trip && this.breakAt.get(b.trip.key);
      if (f == null || b.state !== 'drive' || b.broken || b.s < f * L.poly.length) continue;
      this.breakAt.delete(b.trip.key);
      b.broken = true; b.stall = t + 3600;          // בלי טיפול — עומד עד שמחליטים (ראו escalate)
      this.ops.note('break', L, 'תקלה באוטובוס — עומד בצד עם הנוסעים', b);
      this.add('break', L, b);
    }
    // אירועים שלא טופלו בזמן — מחמירים
    for (const e of this.inc) if (!e.closed && t >= e.due) this.escalate(e);
    this.inc = this.inc.filter(e => !e.closed || t - e.closedAt < 8);
    if (t >= this.end) this.finish();
  }
  add(kind, L, b, more) {
    const t = this.sim.time, e = { id: this.nextId++, kind, L, bus: b, t0: t, due: t + ESCALATE, closed: false, ...more };
    this.inc.push(e); this.sim.events.push({ type: 'shiftInc', e });
    return e;
  }
  close(e, how) { e.closed = true; e.closedAt = this.sim.time; e.how = how; }
  find(id) { return this.inc.find(e => e.id === id && !e.closed); }

  // יציאה מהמסוף (ops.onDispatch): הנהג של הנסיעה שנבחרה מאחר — האוטובוס עומד במסוף עד שהוא מגיע (10–15 דק')
  onDispatch(L, b) {
    const x = b.trip; if (!x || !this.lateKeys.has(x.key)) return false;
    this.lateKeys.delete(x.key);
    const t = this.sim.time;
    b.stall = t + 600 + this.rand() * 300; b.lateDrv = true; x.actual = null;
    this.ops.note('late', L, `הנהג של ${clockOf(x.dep)} מאחר`, b);
    this.add('late', L, b);
    return true;
  }
  // האוטובוס יצא לדרך אחרי שעמד (ops.stalled): זו שעת היציאה בפועל
  released(b) { if (b.lateDrv) { b.lateDrv = false; if (b.trip && b.trip.actual == null) b.trip.actual = this.sim.time; } }
  // צפיפות: תפוסה מרבית לכל נסיעה
  onLoad(b) { b.maxLoad = Math.max(b.maxLoad || 0, b.pax.length / b.cap); }
  onDone(L, b) {
    const x = b.trip;
    if (x && x.dep >= this.start && x.dep < this.end && (b.maxLoad || 0) >= 0.95) this.crowded++;
    b.maxLoad = 0;
  }

  // ---------- פעולות הסדרן על אירוע
  // נהג מחליף: האוטובוס יוצא תוך דקה
  spare(e) {
    if (!e || e.kind !== 'late' || e.closed || this.res.drv <= 0) return false;
    const b = e.bus; this.res.drv--;
    b.stall = Math.min(b.stall || 0, this.sim.time + 45);
    this.ops.note('spare', e.L, 'הסדרן: נהג מחליף יוצא במקום הנהג המאחר', b);
    this.close(e, 'spare'); this.handled++; return true;
  }
  // אוטובוס רזרבה לתקלה: מגיע תוך 2 דק' והנוסעים ממשיכים
  fixBreak(e) {
    if (!e || e.kind !== 'break' || e.closed || this.res.bus <= 0) return false;
    this.res.bus--; e.bus.stall = Math.min(e.bus.stall, this.sim.time + 120);
    this.close(e, 'reserve'); this.handled++; return true;
  }
  // פקק: מעכבים את האוטובוס שמאחור (כדי שלא ייצמד לזה שתקוע), והעומס מתפזר קצת
  easeJam(e) {
    if (!e || e.kind !== 'jam' || e.closed) return false;
    const j = e.jam, L = e.L, edge = L.stopS[j.k];
    const behind = L.buses.filter(b => (b.state === 'drive' || b.state === 'dwell') && b.s < edge - 30).sort((a, b) => b.s - a.s)[0];
    if (behind) this.ops.hold(behind, 120);
    j.f = Math.max(j.f, 0.65);
    this.close(e, 'hold'); this.handled++; return true;
  }
  // אוטובוס נוסף לקו (צפיפות): אוטובוס רזרבה + נהג מחליף
  canExtra() { return this.res.bus > 0 && this.res.drv > 0; }
  useExtra() { if (!this.canExtra()) return false; this.res.bus--; this.res.drv--; return true; }
  // החלטה אוטומטית אחרי 5 דק' בלי טיפול
  escalate(e) {
    const S = this.sim, t = S.time, L = e.L, b = e.bus;
    this.close(e, 'escalated'); this.escalated++;
    if (e.kind === 'late') {
      // הנהג לא הגיע: הנסיעה מבוטלת, והרכב נשאר במסוף לנסיעה הבאה שלו
      const x = b.trip; if (x) { x.status = 'cancel'; x.cancel = true; x.reason = 'הנהג לא הגיע'; this.lost.set(x.key, 'late'); }
      b.lateDrv = false; b.stall = 0; b.state = 'done'; b.t = 0; b.doneAt = t;
      if (b.veh) { if (b.veh.bus === b) b.veh.bus = null; b.veh.endAt = t; b.veh.at = L.stops[0]; }
      for (const p of b.pax.splice(0)) if (!p.role) L.queues[0]?.push(p);
      S.events.push({ type: 'done', bus: b });
      this.ops.note('cancel', L, `הנהג לא הגיע — נסיעה ${clockOf(x?.dep ?? t)} בוטלה`);
    } else if (e.kind === 'break') {
      // אין רכב חלופי: הנסיעה בוטלה, הנוסעים תקועים, והאוטובוס נגרר (עומד עוד רבע שעה ואז נוסע ריק למסוף)
      if (b.trip) this.lost.set(b.trip.key, 'break');
      const n = b.pax.filter(p => !p.role).length; this.stranded += n; this.strandN++;
      b.stall = t + 900; b.express = true; b.towed = true;
      this.ops.note('cancel', L, `אין רכב חלופי — הנסיעה בוטלה ו-${n} נוסעים נתקעו (קנס ${FINE_STRAND} ₪)`, b);
    } else if (e.kind === 'jam') {
      // הפקק החמיר: האוטובוסים נצמדים זה לזה
      const j = e.jam; j.f = Math.min(j.f, 0.15); j.until = Math.max(j.until, t + 900);
      this.ops.note('jam', L, 'הפקק החמיר — האוטובוסים של הקו נצמדים');
    }
  }
  // סוף המשמרת: הדוח
  finish() {
    if (this.done) return;
    this.done = true;
    for (const e of this.inc) if (!e.closed) this.close(e, 'end');
    const c = this.tally(true);
    const S = this.sim, bank = S.bank;
    if (bank && c.fines) bank.spend('penalty', c.fines);
    this.report = {
      shift: this.def.id, name: this.def.name, from: this.start, to: this.end, ...c,
      crowded: this.crowded, gaveUp: this.gaveNow() - this.gave0 + this.stranded, stranded: this.stranded,
      handled: this.handled, escalated: this.escalated, used: { bus: this.res0.bus - this.res.bus, drv: this.res0.drv - this.res.drv }, res0: this.res0,
      grade: grade(c.pct), goal: c.pct >= GOAL,
    };
    S.events.push({ type: 'shiftEnd', report: this.report });
  }
}
function clockOf(t) { const m = Math.floor(t / 60) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
