// הסימולציה: שעון משחק, יציאת אוטובוסים לפי תדירות, נסיעה, עצירה בתחנות, עולים ויורדים, נוסעים ממתינים.
// אין כאן ציור — רק מצב ואירועים (events) שהתצוגה קוראת.
// אוטובוס יוצא רק אם לקו יש רכב פנוי (def.fleet) ורק בשעות הפעילות של הקו; הקיבולת לפי סוג הרכב;
// כסף נכנס בכל נסיעה (פעם אחת, גם עם מעבר) ומהסבסוד לכל ק"מ בשירות, ויוצא על ק"מ, שעות נהג וליסינג (fleet.js).
// הנוסעים באים ממודל הביקוש (demand.js): לכל אחד מוצא ויעד, ומסלול של קו אחד עד שלושה קווים.
import { TYPES, FARE, DEADHEAD_SPEED, LAYOVER, typeOf, dayOf } from './fleet.js';
import { Network, inHours, lineTimes } from './demand.js';
import { Ops, ROLE } from './ops.js';
import { DRIVER_WAGE } from './sched.js';
export const BUS = {
  capacity: 80,           // ברירת מחדל; הקיבולת האמיתית לפי סוג הרכב (fleet.js)
  doorTime: 1.1,          // פתיחה/סגירה (שנ')
  alightEvery: 0.9,       // יורד אחד כל ... (דלת אמצעית)
  boardEvery: 1.7,        // עולה אחד כל ... (דלת קדמית, תיקוף)
  minDwell: 3,
  doorS: 0,               // s של האוטובוס = מקום הדלת הקדמית
  gap: 18,                // מרחק מינימלי מהאוטובוס שלפניו באותו קו
};
export const PATIENCE = 30 * 60;   // מי שמחכה יותר מזה מוותר והולך (והכרטיס שלו הולך איתו)
const COMMON_WALK = 300, COMMON_SLACK = 5 * 60;   // קווים משותפים: יעד עד 300 מ' מהתחנה המתוכננת, ועד 5 דקות יותר מהקו המתוכנן
const SAME_SLACK = 5 * 60;         // אותו קו באותה תחנה: עולים לאוטובוס שהגיע אם הוא מביא ליעד עד 5 דק' אחרי זה שאחריו

const hourOf = t => Math.floor((t / 3600) % 24);
const DECEL = 1.2;       // בלימה (מ/ש²) — כמו בפרופיל המהירות
// מבט נהג (handDrive): תאוצה בגז מלא, בלימה בבלם מלא (מ/ש²), קצב שינוי התאוצה (מ/ש³), זחילה (מ/ש), האטה בלי דוושה,
// בלימה של המגביל, ותחום העצירה בתחנה (מטרים לפני / אחרי)
export const DRIVE = { acc: 1.4, accV: 5, brake: 4, jerkUp: 2, jerkDown: 3.5, creep: 1.4, coast: 0.25, auto: 2, before: 15, past: 3 };
const emptyToday = Z => ({ pot: new Float64Array(24), ride: new Float64Array(24), none: new Float64Array(24), declined: new Float64Array(24),
  pairNone: new Float64Array(Z * Z), xfer: new Map(), xferStop: new Map(), trips: 0, xferTrips: 0 });

let PID = 1, BID = 1;

export class Sim {
  constructor(stops, bank = null, time = null, demand = null) {
    this.time = time ?? 6.5 * 3600;   // 06:30 ביום הראשון
    this.bank = bank;
    this.speed = 5;
    this.lines = [];
    this.stops = stops;
    this.resetStops();
    this.events = [];
    this.rand = mulberry(7);
    this.demand = demand;
    this.net = demand ? new Network(demand, this) : null;
    this.today = emptyToday(demand?.Z || 1);
    this.pending = [];                 // נוסעים בדרך ברגל לקו הבא (מעבר)
    this.netT = -1e9; this.netKey = '';
    this.ops = new Ops(this);
  }
  resetToday() { this.today = emptyToday(this.demand?.Z || 1); }
  resetStops() { this.stopStats = new Map(this.stops.map(s => [s.id, { board: 0, alight: 0, left: 0, gaveUp: 0, xfer: 0 }])); }
  addLine(line) {
    line.nextDispatch = this.time;
    this.lines.push(line);
    this.net?.invalidate();
  }
  // הקו שבא במקום קו שנערך (או הקו עצמו)
  current(L) { while (L.next) L = L.next; return L; }
  // רכבים פנויים לקו: הצי, פחות מה שבדרך, פחות מה שחוזר ריק למסוף. null = בלי הגבלה (בלי צי)
  // (גם אוטובוסים שעוד מסיימים את המסלול הישן של קו שנערך)
  available(L) {
    if (L.def.fleet == null) return Infinity;
    let busy = L.returning.length;
    for (const K of this.lines) if (K === L || (K.retired && this.current(K) === L))
      for (const b of K.buses) if (b.state === 'drive' || b.state === 'dwell') busy++;
    return L.def.fleet - busy;
  }
  // תדירות בפועל (שנ'): ממוצע הפערים בין היציאות האחרונות, ואם מחכים עכשיו לרכב יותר מזה — ההמתנה הנוכחית
  realHeadway(L) {
    const d = L.dispatches; if (!d.length) return null;
    let avg = null;
    if (d.length >= 2) { const k = Math.min(4, d.length - 1); avg = (d[d.length - 1] - d[d.length - 1 - k]) / k; }
    const since = this.time - d[d.length - 1];
    if (L.short && (avg === null || since > avg)) return since;
    return avg;
  }
  removeLine(line) {
    this.lines = this.lines.filter(l => l !== line && !(l.retired && this.current(l) === line));
    this.pending = this.pending.filter(x => !x.p.legs.some(g => this.current(g.L) === line));
    this.net?.invalidate();
  }
  // מסלול חדש לקו (עריכה): הקו הישן ממשיך רק עם האוטובוסים שכבר בדרך, עד סוף המסלול הישן, ואז נעלם.
  // מי שמחכה בתחנה שנשארה בקו (והיעד שלו עדיין אחריה) — עובר לתור של הקו החדש באותו מקום; האחרים הולכים
  retire(old, neo) {
    old.retired = true; old.next = neo;
    neo.stats = old.stats; neo.returning = old.returning; old.returning = [];
    neo.dispatches = old.dispatches; neo.nextDispatch = old.nextDispatch; neo.visible = old.visible;
    this.lines.push(neo);
    old.queues.forEach((q, k) => {
      for (const p of q) {
        const g = this.mapLeg(p.legs[p.leg]);
        if (g) { p.legs[p.leg] = g; p.from = g.from; p.to = g.to; p.line = neo; neo.queues[g.from].push(p); }
        else this.events.push({ type: 'giveup', p, stop: old.stops[k] });
      }
      q.length = 0;
    });
    this.net?.invalidate();
  }
  // רגל של נסיעה בקו שנערך ← אותה רגל בקו החדש (לפי מזהי התחנות), או null אם אחת התחנות כבר לא בקו
  mapLeg(g) {
    if (!g.L.retired) return g;
    const L = this.current(g.L), a = g.L.stops[g.from].id, b = g.L.stops[g.to].id;
    if (!this.lines.includes(L)) return null;
    const from = L.stops.findIndex((s, k) => s.id === a && k < L.stops.length - 1); if (from < 0) return null;
    const to = L.stops.findIndex((s, k) => s.id === b && k > from); if (to < 0) return null;
    return { L, from, to };
  }

  step(realDt) {
    if (!this.speed) return 0;
    let dt = Math.min(realDt, 0.25) * this.speed;
    const total = dt;
    while (dt > 1e-6) { const h = Math.min(dt, 0.25); this.tick(h); dt -= h; }
    return total;
  }

  tick(h) {
    const day0 = dayOf(this.time);
    this.time += h;
    if (dayOf(this.time) !== day0) this.newDay();
    this.roster?.ensure(); this.roster?.pay(h);
    this.bank?.accrue(this.lines, h);
    this.ops.tick(h); this.ops.spawnInspectors(h);
    if (this.demand) this.spawn(h);
    // מי שסיים ללכת לקו הבא (מעבר) נכנס לתור
    if (this.pending.length) {
      // ריצה לאוטובוס: מי שבדרך לקו הבא ורואה אותו עומד בתחנה (עוד פחות מחצי דקה הליכה) — רץ (מגיע מהר יותר)
      for (const x of this.pending) if (!x.run && x.at - this.time < 30) { const g = x.p.legs[x.p.leg]; if (g && g.L.buses.some(o => o.state === 'dwell' && o.next === g.from)) { x.run = true; this.runs = (this.runs || 0) + 1; x.at = this.time + (x.at - this.time) / 1.8; } }
      this.pending = this.pending.filter(x => x.at > this.time || (this.joinQueue(x.p), false));
    }
    const H = hourOf(this.time);
    for (const L of [...this.lines]) {
      const n = L.stops.length;
      if (L.retired) {
        for (const b of L.buses) if (b.state === 'drive' || b.state === 'dwell') this.charge(L, b.type, 0, h);
        L.buses.sort((a, b) => b.s - a.s);
        for (let i = 0; i < L.buses.length; i++) this.moveBus(L, L.buses[i], L.buses[i - 1], h);
        L.buses = L.buses.filter(b => b.state !== 'gone');
        if (!L.buses.length) this.lines = this.lines.filter(x => x !== L);
        continue;
      }
      // מי שחיכה יותר מדי מוותר. התור לפי סדר ההגעה, אז מספיק לבדוק את הראשונים
      for (let k = 0; k < n - 1; k++) {
        const q = L.queues[k];
        while (q.length && this.time - q[0].t0 > PATIENCE) {
          const p = q.shift(); L.stats.gaveUp++; this.stopStats.get(L.stops[k].id).gaveUp++;
          this.events.push({ type: 'giveup', p, stop: L.stops[k] });
        }
      }
      // רכבים שחזרו למסוף
      if (L.returning.length) L.returning = L.returning.filter(t => t > this.time);
      // יציאה מהמסוף — רק אם יש רכב פנוי. אין: היציאה מחכה, ויוצאת ברגע שרכב חוזר
      const hw = L.def.headway * 60;
      L.short = false;
      L.off = !inHours(L.def, this.time);
      // מחוץ לשעות הפעילות לא יוצאים; כשהקו נפתח — היציאה הראשונה מיד, בלי "להשלים" את מה שהיה בלילה
      if (this.roster?.managed(L)) this.dispatchSched(L);
      else if (L.off) L.nextDispatch = Math.max(L.nextDispatch, this.time + 1);
      while (!this.roster?.managed(L) && !L.off && this.time >= L.nextDispatch) {
        // קו מעגלי: אוטובוס שמחכה במסוף (הגיע לתחנה האחרונה, שהיא גם הראשונה) יוצא לנסיעה הבאה
        const lay = L.buses.find(o => o.lay);
        if (lay) { this.turnaround(L, lay); continue; }
        if (this.available(L) <= 0 || L.buses.length >= 30) { L.short = true; break; }
        const type = typeOf(L.def), T = TYPES[type];
        const b = { id: BID++, line: L, type, cap: T.cap, s: 0, v: 0, next: 0, state: 'drive', pax: [], door: 0, t: 0, ph: null, born: this.time, fade: 1 };
        L.buses.push(b); this.events.push({ type: 'bus', bus: b });
        this.dispatched(L, T.cap);
        this.ops.onDispatch(L, b);
      }
      // תפוסה ממוצעת, ושעות נהג לכל אוטובוס בדרך
      for (const b of L.buses) if (b.state === 'drive' || b.state === 'dwell') {
        L.stats.loadSum += b.pax.length / b.cap * h; L.stats.loadT += h;
        this.charge(L, b.type, 0, h);
      }
      // אוטובוסים: מהראשון (הכי רחוק) לאחרון
      L.buses.sort((a, b) => b.s - a.s);
      for (let i = 0; i < L.buses.length; i++) this.moveBus(L, L.buses[i], L.buses[i - 1], h);
      L.buses = L.buses.filter(b => b.state !== 'gone');
    }
  }

  // יציאות לפי הסידור (sched.js): כל נסיעה שהגיע זמנה — יוצאת ברכב שלה, או מבוטלת עם סיבה.
  // הרכב עוד לא חזר מהנסיעה הקודמת — מחכים לו (הקו "חסר רכב"), ואחרי 20 דק' הנסיעה מבוטלת
  dispatchSched(L) {
    const S = this.roster;
    // קו מעגלי: אוטובוס שמחכה במסוף, והנסיעה הבאה לא שלו (בוטלה / רכב אחר) — מסיים כאן
    for (const o of L.buses) if (o.lay) { const n = S.nextOf(L); if (!n || n.cancel || n.veh !== o.veh) { o.lay = false; o.goOn = false; } }
    for (let x = S.nextOf(L); x && x.dep <= this.time; x = S.nextOf(L)) {
      if (x.cancel) { S.cancel(x, x.reason); continue; }
      const v = x.veh;
      const lay = L.buses.find(o => o.lay);
      if (lay && lay.veh === v) { if (lay.trip) { lay.trip.status = 'done'; lay.trip.end = this.time; } this.turnaround(L, lay); lay.trip = x; lay.sdep = x.dep; v.bus = lay; x.status = 'run'; x.actual = this.time; continue; }
      if (!S.vehReady(v, x) || L.buses.length >= 30) {
        if (this.time > x.dep + 1200) { S.cancel(x, 'הרכב לא חזר בזמן'); continue; }
        L.short = true; break;
      }
      // נסיעה ריקה מהמסוף שבו הרכב עמד (ק"מ ושעות, בלי סבסוד)
      if (v.endAt != null) { const dh = S.dh(v.at, x.from); if (dh > 0) this.charge(L, v.type, dh * DEADHEAD_SPEED, dh, true); }
      if (v.endAt != null) this.charge(L, v.type, 0, LAYOVER, true);
      const T = TYPES[v.type];
      const b = { id: BID++, line: L, type: v.type, cap: T.cap, s: 0, v: 0, next: 0, state: 'drive', pax: [], door: 0, t: 0, ph: null, born: this.time, fade: 1, trip: x, veh: v, sdep: x.dep };
      v.bus = b; x.status = 'run'; x.actual = this.time;
      L.buses.push(b); this.events.push({ type: 'bus', bus: b });
      this.dispatched(L, T.cap);
      this.ops.onDispatch(L, b);
    }
    const n = S.nextOf(L);
    L.nextDispatch = n ? n.dep : this.time + 86400;
  }
  // הקו פועל (לחישובי ביקוש וכיסוי): לפי הסידור, ובלי סידור — אם יש לו רכבים
  inService(L) { return !L.retired && (this.roster?.managed(L) ? this.roster.serves(L) : L.def.fleet > 0); }
  // רישום יציאה מהמסוף. יציאה באיחור גדול: הלוח מתחיל מחדש מעכשיו, כדי שלא ייצאו כמה אוטובוסים בבת אחת
  dispatched(L, cap) {
    const hw = L.def.headway * 60;
    L.dispatches.push(this.time); if (L.dispatches.length > 6) L.dispatches.shift();
    L.stats.trips++; L.stats.hCap[hourOf(this.time)] += cap;
    const late = this.time - L.nextDispatch;
    L.nextDispatch = late > hw / 2 ? this.time + hw : L.nextDispatch + hw;
  }
  // קו מעגלי (התחנה האחרונה היא גם הראשונה): האוטובוס שהגיע לסוף לא נעלם — ממשיך מאותו מקום כנסיעה הבאה,
  // והדלתות נשארות פתוחות כדי שהממתינים יעלו. מי שעלה "מסביב" (wrap) ממשיך לנסוע
  turnaround(L, b) {
    this.ops.onDone(L, b); b.born = this.time; b.express = false;
    b.lay = false; b.goOn = undefined; b.s = L.stopS[0]; b.next = 0; b.dw = 0; b.ta = 0; b.tb = 0; b.v = 0;
    b.state = 'dwell'; if (b.ph !== 'open') b.ph = b.door >= 1 ? 'xchg' : 'open';
    b.decided = 0; b.stopHere = true;
    for (const p of b.pax) p.wrap = false;
    this.dispatched(L, b.cap);
  }
  // האם הקו מעגלי: התחנה האחרונה היא הראשונה, וההתחלה והסוף באותה נקודה (בלי קפיצה)
  cyclic(L) {
    if (L._cyc === undefined) {
      const n = L.stops.length, a = L.poly.pts[0], z = L.poly.pts[L.poly.pts.length - 1];
      L._cyc = n > 2 && L.stops[0] === L.stops[n - 1] && Math.hypot(a[0] - z[0], a[1] - z[1]) < 1.5;
    }
    return L._cyc;
  }

  // נוסעים חדשים לפי מודל הביקוש. כל מי ש"רוצה לנסוע" נספר; נוסע רק מי שיש לו מסלול בקווים שפועלים עכשיו,
  // ובסיכוי שתלוי בזמן הכולל (תדירות בפועל, הליכה, מעברים)
  spawn(h) {
    const D = this.demand, N = D.N;
    // הטבלה מתעדכנת כשקו נפתח/נסגר, ופעם ב-10 דקות משחק (התדירות בפועל משתנה)
    if (this.time - this.netT > 600) { this.netT = this.time; this.net.refresh(); }
    const tab = this.net.table(this.time), R = this.residents;
    // עם תושבים קבועים (residents.js): אקראי — רק קניות ושונות; עבודה, לימודים ומבקרים — לפי לוח הנסיעות של היום
    let x = (R ? D.rateAtOther(this.time) : D.rateAt(this.time)) / 3600 * h;
    for (; x > 0; x -= 1) {
      if (this.rand() >= Math.min(1, x)) continue;
      this.trip(tab, R ? D.sampleOther(this.time, this.rand) : D.sample(this.time, this.rand), null);
    }
    if (R) {
      const day = dayOf(this.time), t = this.time - (day - 1) * 86400;
      if (this.schedDay !== day) { this.schedDay = day; this.sched = R.schedule(day); this.si = 0; while (this.si < this.sched.length && this.sched[this.si][0] < t - 60) this.si++; }
      const S = this.sched;
      while (this.si < S.length && S[this.si][0] <= t) { const [, o, d, who] = S[this.si++]; this.trip(tab, o * N + d, who); }
    }
  }
  // נסיעה אחת (זוג מוצא-יעד k): יש מסלול? נוסעים? — ונכנסים לתור. who — מי זה (תושב קבוע / עובד מבחוץ / מבקר)
  trip(tab, k, who) {
    const D = this.demand, N = D.N, H = hourOf(this.time), T = this.today;
    T.pot[H]++;
    const legs = tab.legs[k];
    if (!legs) { T.none[H]++; T.pairNone[D.zoneOf[(k / N) | 0] * D.Z + D.zoneOf[k % N]]++; return; }
    if (this.rand() >= tab.p[k]) { T.declined[H]++; return; }
    T.ride[H]++; T.trips++; if (legs.length > 1) T.xferTrips++;
    const p = { id: PID++, legs: legs.map(g => ({ ...g })), leg: 0, t0: this.time, paid: false, o: k / N | 0, d: k % N };
    if (who != null) p.who = who;
    for (const g of legs) g.L.stats.hWant[H]++;
    this.joinQueue(p);
  }
  // פקח או מבקר סמוי: נוסע מיוחד בתור (לא נספר בסטטיסטיקה ולא משלם)
  makeRider(L, from, to, role) {
    if (!L || from < 0 || to <= from || to >= L.stops.length) return null;
    const p = { id: PID++, legs: [{ L, from, to }], leg: 0, t0: this.time, paid: true, role, from, to, line: L, o: -1, d: -1 };
    ROLE.set(p.id, role); if (ROLE.size > 400) ROLE.delete(ROLE.keys().next().value);
    L.queues[from].push(p); this.events.push({ type: 'spawn', p, stop: L.stops[from] });
    return p;
  }
  joinQueue(p) {
    const g = this.mapLeg(p.legs[p.leg]);
    if (!g || !this.lines.includes(g.L)) return;          // הקו נמחק בינתיים
    p.legs[p.leg] = g; p.line = g.L; p.from = g.from; p.to = g.to; p.t0 = this.time;
    g.L.queues[g.from].push(p);
    this.events.push({ type: 'spawn', p, stop: g.L.stops[g.from] });
  }

  // מי בתור עולה לאוטובוס הזה: האוטובוס כמעט מלא, והבא של אותו קו מגיע תוך 8 דק' — חלק מהממתינים מעדיפים לחכות לו
  // (ההחלטה פעם אחת לכל אוטובוס; נספר ב-L.stats.waitNext). מחזיר את המקום בתור, או ‎-1
  boarder(L, b, k) {
    const Q = L.queues[k]; if (!Q.length) return -1;
    if (this.noWaitNext) return 0;                      // לבדיקות: בלי ההחלטה (כמו קודם)
    const load = b.pax.length / b.cap; if (load < 0.8) return 0;
    let eta = null;
    for (let i = 0; i < Q.length; i++) {
      const p = Q[i]; if (p.role) return i;
      if (p.skipBus === b.id) continue;
      if (p.decBus !== b.id) {
        p.decBus = b.id;
        if (eta == null) { const nx = L.buses.filter(o => o !== b && (o.state === 'drive' || o.state === 'dwell') && o.s < L.stopS[k]).sort((a, c) => c.s - a.s)[0];
          eta = nx ? (L.stopS[k] - nx.s) / 7 + 20 : (L.nextDispatch - this.time) + L.stopS[k] / 7; }
        if (eta < 480 && Math.random() < Math.min(0.7, (load - 0.8) / 0.2 * 0.7)) { p.skipBus = b.id; L.stats.waitNext = (L.stats.waitNext || 0) + 1; continue; }
      }
      return i;
    }
    return -1;
  }
  // האם האוטובוס צריך לעצור בתחנה k
  needStop(L, b, k) {
    if (k === 0 || k === L.stops.length - 1) return true;
    if (b.pax.some(p => p.to === k)) return true;
    if (b.holdNext) return true;                       // הסדרן ביקש להחזיק בתחנה הבאה
    if (b.pax.length >= b.cap || b.express) return false;
    return L.queues[k].length > 0 || !!this.sameRider(L, b, k, false) || !!this.altRider(L, k, L.stops[k], false);
  }

  // מבט נהג (js/drivectl.js): b.ctl = { drv: true, hands, gas, brake (0–1), front, mid, arrive, kneel, warn(txt) }.
  // הדלתות תמיד בידי הנהג: נפתחות רק בלחיצה על כפתור הדלת, ורק כשעומדים בתחנה. עולים רק בדלת הקדמית הפתוחה,
  // יורדים בדלת פתוחה; דלתות סגורות — אף אחד לא עולה. נסיעה עם דלת פתוחה — אזהרה, והדלתות נסגרות.
  // מהירות: עד שנוגעים בדוושה האוטובוס נוסע לבד ועוצר בתחנות (handDrive — אחרי הנגיעה הראשונה הכל בידי הנהג).
  // בלי b.ctl (כל האוטובוסים האחרים) — הכל כרגיל.
  moveBus(L, b, ahead, h) {
    const c = b.ctl?.drv ? b.ctl : null;      // (b.ctl של אוטובוס עם מבקר סמוי הוא הנוסע — ops.js — לא שליטה)
    // כריעה: רק בעמידה; בנסיעה האוטובוס עולה
    if (c || b.kneel) { const want = c?.kneel && b.v < 0.1 ? 1 : 0; b.kneel = Math.max(0, Math.min(1, (b.kneel || 0) + Math.sign(want - (b.kneel || 0)) * h / 1.5)); }
    if (b.state === 'drive' && c?.hands) { this.handDrive(L, b, ahead, h, c); return; }
    if (b.state === 'drive') {
      let target = L.stopS[b.next];
      // עוצרים רק כשצריך: מישהו יורד, או מישהו מחכה לקו ויש מקום. ההחלטה נקבעת כשמגיעים למרחק בלימה
      // (מי שמגיע לתחנה אחרי זה — מפספס). התחנה הראשונה והאחרונה — תמיד.
      if (b.decided !== b.next && (target - b.s <= b.v * b.v / (2 * DECEL) + 30)) {
        b.decided = b.next;
        b.stopHere = this.needStop(L, b, b.next);
      } else if (b.decided === b.next && !b.stopHere && target - b.s > b.v * b.v / (2 * 2.2) + 1 && ((b.recheck = (b.recheck || 0) + h) >= 1)) {
        // מישהו הגיע לתחנה אחרי ההחלטה: אם עוד אפשר לבלום בנחת — עוצרים בכל זאת
        b.recheck = 0;
        b.stopHere = this.needStop(L, b, b.next);
      }
      if (b.decided === b.next && !b.stopHere && b.s >= target - 0.05) {
        // חולפים על פני התחנה. אוטובוס מלא שמשאיר ממתינים — נספר כ"נשארו"
        const stop = L.stops[b.next], ss = this.stopStats.get(stop.id), left = L.queues[b.next].length;
        if (left && b.pax.length >= b.cap) { L.stats.left += left; ss.left += left; this.events.push({ type: 'full', bus: b, stop, n: left }); for (const p of L.queues[b.next]) p.skips = (p.skips || 0) + 1; }
        this.ops.onPass(L, b, b.next, left > 0);
        this.events.push({ type: 'pass', bus: b, stop });
        b.next++; target = L.stopS[b.next];
      }
      const stopping = b.decided !== b.next || b.stopHere;
      // תקלה או נהג מאחר: האוטובוס עומד
      if (this.ops.stalled(b)) { b.v = 0; return; }
      const v0 = b.v;
      let v = Math.max(0.8, (L.profileFree || L.profile).get(b.s + 1.2)) * this.ops.speedK(L, b);
      if (stopping) v = Math.min(v, Math.sqrt(2 * DECEL * Math.max(0, target - b.s)) + 0.25);
      if (ahead && ahead.state !== 'done' && ahead.s - b.s < BUS.gap + 4) v = Math.min(v, Math.max(0, (ahead.s - b.s - BUS.gap) * 0.5));
      b.v += Math.max(-2.5 * h, Math.min(1.2 * h, v - b.v));
      b.v = Math.max(0, Math.min(v, b.v + 0.0001));
      b.s += b.v * h;
      this.charge(L, b.type, b.v * h, 0);
      if (c) b.a = (b.v - v0) / h;
      if (stopping && b.s >= target - 0.05) { b.s = target; this.arrive(L, b, c); }
    } else if (b.state === 'dwell') {
      const k = b.next, last = k === L.stops.length - 1, stop = L.stops[k], ss = this.stopStats.get(stop.id);
      b.dw += h;
      const man = !!c;
      if (man) {        // הדלתות בידי הנהג: כל דלת לחוד, ונפתחות רק כשהוא לוחץ
        const to = (v, open) => Math.max(0, Math.min(1, (v ?? b.door) + (open ? 1 : -1) * h / BUS.doorTime));
        b.dF = to(b.dF, c.front); b.dM = to(b.dM, c.mid); b.door = Math.max(b.dF, b.dM);
        if (b.door >= 0.5) b.opened = true;
        if (b.ph === 'open') b.ph = 'xchg';
      }
      if (b.ph === 'open') {
        b.door = Math.min(1, b.door + h / BUS.doorTime);
        if (b.door >= 1) b.ph = 'xchg';
      } else if (b.ph === 'xchg') {
        b.ta += h; b.tb += h;
        let busy = false;
        // קו מעגלי: בתחנה האחרונה האוטובוס ממשיך כנסיעה הבאה (או מחכה לה), ומי שעלה "מסביב" נשאר
        if (last && b.goOn === undefined) b.goOn = this.cyclic(L) && !L.retired && !L.off && !L.buses.some(o => o !== b && o.lay)
          && (!b.trip || (() => { const n = this.roster?.nextOf(L); return !!n && !n.cancel && n.veh === b.veh && b.veh?.bus === b; })());
        const off = b.pax.findIndex(p => p.to === k || (last && !(p.wrap && b.goOn)));
        if (off >= 0 && man && b.dM < 1 && b.dF < 1) busy = true;       // יורדים רק כשדלת פתוחה
        else if (off >= 0) {
          busy = true;
          if (b.ta >= BUS.alightEvery) {
            b.ta = 0; const p = b.pax.splice(off, 1)[0];
            if (!p.role) { L.stats.alight++; ss.alight++; }       // פקח / מבקר: לא נוסע רגיל
            const ev = { type: 'alight', bus: b, p, stop }; this.events.push(ev);
            if (!p.role && !p.wrap && p.leg + 1 >= p.legs.length) this.ops.rate(p, L, b, k);
            if (p.role) { }
            else if (p.wrap) { p.wrap = false; p.legs[p.leg] = { L, from: 0, to: p.to }; this.joinQueue(p); }   // האוטובוס לא ממשיך: מחכים לבא
            else if (p.leg + 1 < p.legs.length) { const x = this.transfer(p, L, stop); if (x) { ev.xfer = x.to; ev.at = x.at; } }   // מעבר: התצוגה מראה אותו הולך לתחנה הבאה
          }
        }
        const qi = this.boarder(L, b, k);
        if (!last && !b.express && b.pax.length < b.cap && (!man || b.dF >= 1) && (qi >= 0 || this.sameRider(L, b, k, false) || this.altRider(L, k, stop, false))) {
          busy = true;
          if (b.tb >= BUS.boardEvery) {
            b.tb = 0; const p = (qi >= 0 ? L.queues[k].splice(qi, 1)[0] : null) || this.sameRider(L, b, k, true) || this.altRider(L, k, stop, true); p.tb = this.time; b.pax.push(p);
            p.wait = this.time - p.t0; p.load = b.pax.length / b.cap;
            if (!p.role) {
              L.stats.board++; L.stats.hBoard[hourOf(this.time)]++; ss.board++; L.stats.waitSum += this.time - p.t0; L.stats.waitN++;
              // מעבר בחינם (כמו "רב-קו": עד 90 דק') — משלמים רק בעלייה הראשונה. חלק מהנוסעים לא משלמים (ops.pays)
              if (!p.paid) { p.paid = true; if (this.ops.pays(L)) this.bank?.earn(FARE, L.id); else p.noTicket = true; } else L.stats.xferIn++;   // noTicket — לפקח (main.js)
            }
            this.ops.onLoad(b);
            this.events.push({ type: 'board', bus: b, p, stop });
          }
        }
        // מי שרץ לאוטובוס (מעבר, ומגיע תוך כמה שניות) — האוטובוס מחכה לו, עד דקה בתחנה
        if (!last && b.dw < 60 && this.pending.some(x => x.run && x.at - this.time < 12 && x.p.legs[x.p.leg]?.L === L && x.p.legs[x.p.leg].from === k)) busy = true;
        // הסדרן מחזיק את האוטובוס בתחנה
        if (b.hold > this.time) busy = true;
        // מחכים שכל מי שהולך לדלת (או יוצא ממנה) יסיים, כדי שאף אחד לא יישאר באמצע הכביש
        if ((b.walking || 0) > 0 && b.dw < 90) busy = true;
        if (!busy && !man && last && b.goOn && off < 0) {
          // קו מעגלי במסוף: כולם ירדו. יוצאים לנסיעה הבאה אם הגיע הזמן (או קצת לפני), ואם לא — מחכים עם דלתות פתוחות.
          // אוטובוס של הקו שמתקרב מאחור — יוצאים מיד, כדי לא לחסום אותו
          const W = Math.min(L.def.headway * 30, 300), behind = L.buses.some(o => o !== b && o.state === 'drive' && o.next === k && L.stopS[k] - o.s < 70);
          if (L.retired || L.off) { b.goOn = false; b.lay = false; return; }   // הקו נסגר: מי שעלה "מסביב" יורד, והאוטובוס נגמר
          else if (b.trip) { b.lay = true; return; }                          // לפי הסידור: הנסיעה הבאה יוצאת בזמן שלה (dispatchSched)
          else if (this.time >= L.nextDispatch - W || behind) { this.turnaround(L, b); return; }
          else { b.lay = true; return; }
        }
        if (man) {
          // גז עם דלת פתוחה — אזהרה (וניקוד), והדלתות נסגרות; האוטובוס יוצא כשהן סגורות.
          // יוצאים מהתחנה: בגז כשהדלתות סגורות; בנהיגה לבד (בלי נגיעה בדוושה) — כשהנהג סגר את הדלתות אחרי שפתח;
          // בתחנה האחרונה — כשכולם ירדו והדלתות סגורות
          const shut = b.dF <= 0 && b.dM <= 0;
          if (!shut && c.gas > 0.05) { if (c.front || c.mid) c.warn?.('נסיעה עם דלת פתוחה — הדלתות נסגרות'); c.front = c.mid = false; }
          if (shut && (last ? off < 0 && (b.opened || c.gas > 0.05) : c.hands ? c.gas > 0.05 : b.opened)) { b.door = 0; b.ph = 'close'; }
        } else if (!busy && b.dw >= BUS.minDwell + BUS.doorTime) b.ph = 'close';
      } else if (b.ph === 'close') {
        b.door = Math.max(0, b.door - h / BUS.doorTime);
        if (b.door <= 0) {
          // אוטובוס מלא נוסע ומשאיר אנשים בתחנה
          const left = last ? 0 : L.queues[k].length;
          if (left && b.pax.length >= b.cap) { L.stats.left += left; ss.left += left; this.events.push({ type: 'full', bus: b, stop, n: left }); for (const p of L.queues[k]) p.skips = (p.skips || 0) + 1; }
          if (last) {
            this.ops.onDone(L, b);
            b.state = 'done'; b.t = 0; b.doneAt = this.time;
            // הרכב נוסע ריק חזרה לתחנה הראשונה ונח במסוף; רק אז הוא פנוי שוב (את הנסיעה הזו לא מציירים)
            const dead = L.poly.length / DEADHEAD_SPEED;
            if (b.trip) this.roster?.done(b, L);          // לפי הסידור: הרכב עומד במסוף האחרון; הנסיעה הריקה נרשמת כשהוא יוצא שוב
            else {
              if (L.def.fleet != null) this.current(L).returning.push(this.time + dead + LAYOVER);
              this.charge(L, b.type, L.poly.length, dead + LAYOVER, true);
            }
            this.events.push({ type: 'done', bus: b });
          }
          else { b.state = 'drive'; b.next++; b.goOn = undefined; this.events.push({ type: 'depart', bus: b, stop }); }
          if (c) c.front = c.mid = false;
          b.dF = b.dM = undefined; b.opened = false;
        }
      }
    } else if (b.state === 'done') {
      b.t += h; b.fade = Math.max(0, 1 - b.t / 4);
      if (b.t > 4) b.state = 'gone';
    }
  }

  // הגעה לתחנה. במבט נהג — הדלתות נשארות סגורות עד שהנהג לוחץ
  arrive(L, b, c) {
    b.v = 0; b.a = 0; b.state = 'dwell'; b.t = 0; b.dw = 0; b.ta = 0; b.tb = 0;
    if (c) { b.ph = 'xchg'; b.door = 0; b.dF = b.dM = 0; b.opened = false; c.arrive = false; }
    else b.ph = 'open';
    this.events.push({ type: 'arrive', bus: b, stop: L.stops[b.next] });
    this.ops.onArrive(L, b, b.next);
  }
  // נהיגה בידי הנהג: תאוצה ובלימה לפי עומק הדוושה (0–1), עם שינוי הדרגתי של התאוצה (jerk) כמו באוטובוס עירוני.
  // בלי דוושה: מתחת ל-5 קמ"ש האוטובוס זוחל (תיבה אוטומטית), מעל — מאט לאט; כשעומד — נשאר במקום (בלם עצירה).
  // המהירות לא עולה על מהירות הדרך (מגביל), ולא מתקרבים לאוטובוס שלפנים. עוצרים עד 15 מ' לפני התחנה (או 3 מ' אחריה)
  // ולוחצים על דלת — זו עצירה בתחנה. מי שעובר 3 מ' אחרי התחנה — חלף עליה. בתחנה האחרונה האוטובוס נעצר בכל מקרה.
  handDrive(L, b, ahead, h, c) {
    let k = b.next, target = L.stopS[k];
    const last = k === L.stops.length - 1;
    if (!last && b.s > target + DRIVE.past) {
      const stop = L.stops[k], ss = this.stopStats.get(stop.id), left = L.queues[k].length;
      if (left && b.pax.length >= b.cap) { L.stats.left += left; ss.left += left; this.events.push({ type: 'full', bus: b, stop, n: left }); for (const p of L.queues[k]) p.skips = (p.skips || 0) + 1; }
      this.ops.onPass(L, b, k, left > 0);
      this.events.push({ type: 'pass', bus: b, stop });
      b.next = ++k; target = L.stopS[k];
    }
    if (this.ops.stalled(b)) { b.v = 0; b.a = 0; return; }
    const gas = c.gas || 0, brake = c.brake || 0;
    let want;
    if (brake > 0.01) want = -DRIVE.brake * brake;
    else if (gas > 0.01) want = DRIVE.acc * gas * Math.min(1, DRIVE.accV / Math.max(b.v, 0.1));   // בגז מלא: מעל ~18 קמ"ש התאוצה יורדת (הספק המנוע)
    else if (b.v < 0.05) want = 0;                                   // עומד: נשאר במקום
    else if (b.v < DRIVE.creep) want = Math.min(0.5, (DRIVE.creep - b.v) * 0.6);   // זחילה
    else want = -DRIVE.coast;
    // מגביל: מהירות הדרך (עם תנועה), מרחק מהאוטובוס שלפנים, ועצירה בסוף הקו
    let vmax = Math.max(0.8, (L.profileFree || L.profile).get(b.s + 1.2)) * this.ops.speedK(L, b);
    if (last) vmax = Math.min(vmax, Math.sqrt(2 * DRIVE.auto * Math.max(0, target - b.s)));
    if (ahead && ahead.state !== 'done') vmax = Math.min(vmax, Math.max(0, (ahead.s - b.s - BUS.gap) * 0.5));
    if (b.v > vmax) want = Math.min(want, Math.max(-DRIVE.auto, (vmax - b.v) * 1.5));
    else if (want > 0) want = Math.min(want, (vmax - b.v) * 1.5);
    const a0 = b.a || 0, J = want < a0 ? DRIVE.jerkDown : DRIVE.jerkUp;
    b.a = a0 + Math.max(-J * h, Math.min(J * h, want - a0));
    if (b.v > vmax + 1.5 && b.a > -DRIVE.auto) b.a = Math.min(b.a, -DRIVE.auto * 0.5);   // נכנסים מהר מדי לעיקול — בולמים בכל זאת
    b.v += b.a * h;
    if (b.v <= 0) { b.v = 0; if (b.a < 0) b.a = 0; }
    b.s += b.v * h;
    if (ahead && ahead.state !== 'done' && b.s > ahead.s - BUS.gap) { b.s = Math.max(b.s - b.v * h, ahead.s - BUS.gap); b.v = Math.min(b.v, ahead.v || 0); }
    if (last && b.s > target) { b.s = target; b.v = 0; b.a = 0; }
    this.charge(L, b.type, b.v * h, 0);
    // עצירה בתחנה: עומדים בטווח, והנהג לחץ על דלת
    const d = target - b.s;
    if (c.arrive) { c.arrive = false; if (b.v < 0.05 && d <= DRIVE.before && d >= -DRIVE.past) this.arrive(L, b, c); }
  }

  // אותו קו עובר באותה תחנה פעמיים (הלוך וחזור דרך אותן תחנות, או קו מעגלי): מי שמחכה לפעם האחרת עולה כבר עכשיו,
  // אם האוטובוס הזה הוא הראשון שיגיע אליו (אין אוטובוס של הקו לפניו בדרך) — כך הוא מגיע ליעד באותו זמן, ולא נשאר בתחנה
  // כשהאוטובוס של הקו שלו עוצר מולו. היעד אחרי התחנה הזו בנסיעה הנוכחית, או (בקו מעגלי) בנסיעה הבאה — "מסביב".
  sameRider(L, b, k, take) {
    const stop = L.stops[k], n = L.stops.length;
    let T = null;
    for (let j = 0; j < n - 1; j++) {
      if (j === k || L.stops[j] !== stop || !L.queues[j].length) continue;
      T = T || lineTimes(L);
      // האוטובוס הראשון של הקו שיגיע לממתין בפעם האחרת (j), ובכמה זמן הוא יביא אותו ליעד
      let first = null;
      for (const o of L.buses) if (o !== b && (o.state === 'drive' || o.state === 'dwell') && o.s > b.s && (j < k || o.s <= L.stopS[j]) && (!first || (j > k ? o.s > first.s : o.s < first.s))) first = o;
      const Q = L.queues[j];
      for (let i = 0; i < Q.length; i++) {
        const p = Q[i], dest = L.stops[p.to];
        let t = -1;
        for (let x = k + 1; x < n; x++) if (L.stops[x] === dest) { t = x; break; }
        const wrap = t < 0 && j < k && this.cyclic(L) && !L.retired;      // מסביב: יורד בנסיעה הבאה, ב-p.to
        if (t < 0 && !wrap) continue;
        // הזמן עד היעד באוטובוס הזה, לעומת האוטובוס שלפניו. עולים אם זה לא מאחר ביותר מ-5 דקות
        const mine = wrap ? T[n - 1] - T[k] + T[p.to] : T[t] - T[k];
        const theirs = !first ? Infinity : j > k ? T[p.to] - T[Math.min(first.next, j)] : T[n - 1] - T[Math.min(first.next, n - 1)] + T[p.to];
        if (mine - theirs > SAME_SLACK) continue;
        if (!take) return true;
        Q.splice(i, 1);
        if (wrap) { p.wrap = true; p.from = k; }
        else { p.legs[p.leg] = { L, from: k, to: t }; p.from = k; p.to = t; }
        return p;
      }
    }
    return null;
  }
  // קווים משותפים: מי שמחכה בתחנה לקו אחר עולה גם לאוטובוס הזה, אם הוא מביא אותו לתחנת היעד שלו או לתחנה במרחק הליכה
  // ממנה (עד COMMON_WALK), ולא מאחר בהרבה לעומת הקו שתוכנן לו (עד COMMON_SLACK, כולל ההליכה וההמתנה הצפויה לקו שלו).
  // מי שתוכנן עם החלפה עולה לקו ישיר ליעד הסופי, ושאר ההחלפות מתבטלות. take=false: רק בודקים אם יש כזה.
  // (קודם: רק אותה תחנת ירידה בדיוק, רק לקטע הנוכחי, ובלי בדיקת זמן. this.noCommon — ההתנהגות הקודמת, להשוואה)
  reach(L, k, dest) {
    let best = -1, bd = this.noCommon ? 0.5 : COMMON_WALK;
    for (let x = k + 1; x < L.stops.length; x++) { const s = L.stops[x]; if (s === dest) return [x, 0]; const d = Math.hypot(s.x - dest.x, s.y - dest.y); if (d < bd) { bd = d; best = x; } }
    return best < 0 ? null : [best, bd];
  }
  altRider(L, k, stop, take) {
    let T = null;
    for (const M of this.lines) {
      if (M === L || M.retired) continue;
      for (let j = 0; j < M.stops.length - 1; j++) {
        if (M.stops[j] !== stop) continue;
        const Q = M.queues[j];
        for (let i = 0; i < Q.length; i++) {
          const p = Q[i]; if (p.role) continue;
          const legs = p.legs, lastLeg = legs && legs[legs.length - 1], more = !this.noCommon && legs && p.leg < legs.length - 1 && lastLeg?.L;
          // קודם — ישר ליעד הסופי (בלי ההחלפות שנשארו); אם לא — לתחנת הירידה של הקטע הנוכחי
          let direct = false, r = more ? this.reach(L, k, lastLeg.L.stops[lastLeg.to]) : null;
          if (r) direct = true; else r = this.reach(L, k, M.stops[p.to]);
          if (!r) continue;
          if (!this.noCommon) {
            T = T || lineTimes(L);
            const mine = T[r[0]] - T[k] + r[1] / 1.3, wait = l => (l.def.headway || 20) * 30, TM = lineTimes(M);
            let plan = wait(M) + TM[p.to] - TM[j];
            if (direct) for (let q = p.leg + 1; q < legs.length; q++) { const g = legs[q], TG = g.L.stopS ? lineTimes(g.L) : null; if (TG) plan += wait(g.L) + TG[g.to] - TG[g.from]; }
            if (mine - plan > COMMON_SLACK) continue;
          }
          if (!take) return true;
          Q.splice(i, 1);
          if (direct) { legs.length = p.leg + 1; }
          p.legs[p.leg] = { L, from: k, to: r[0] }; p.line = L; p.from = k; p.to = r[0];
          this.altN = (this.altN || 0) + 1; if (direct) this.altDirect = (this.altDirect || 0) + 1;
          return p;
        }
      }
    }
    return null;
  }
  // הקווים שמתאימים לנוסע שמחכה (הקו שלו, וכל קו אחר בתחנה שמביא אותו ליעד) — לתדירות המשולבת בדעה שלו (main.js)
  commonLines(p) {
    const g = p.legs?.[p.leg]; if (!g) return [];
    const stop = g.L.stops[g.from], dest = g.L.stops[g.to], out = [g.L];
    for (const M of this.lines) { if (M === g.L || M.retired || M.off) continue; const k = M.stops.indexOf(stop); if (k >= 0 && k < M.stops.length - 1 && this.reach(M, k, dest)) out.push(M); }
    return out;
  }
  // ירד באמצע הדרך כדי לעלות לקו הבא: הולך לתחנה של הקו הבא (אם היא אחרת — עד 400 מ') ומחכה שם
  transfer(p, L, stop) {
    const next = this.mapLeg(p.legs[p.leg + 1]);
    if (!next) return;
    p.leg++; p.legs[p.leg] = next;
    const to = next.L.stops[next.from];
    const walk = Math.hypot(to.x - stop.x, to.y - stop.y) * 1.2 / 1.3, x = { p, at: this.time + 15 + walk, to };
    this.pending.push(x);
    const key = this.current(L).id + '>' + next.L.id, T = this.today;
    T.xfer.set(key, (T.xfer.get(key) || 0) + 1);
    T.xferStop.set(stop.id, (T.xferStop.get(stop.id) || 0) + 1);
    this.stopStats.get(stop.id).xfer++;
    return x;
  }

  // עלות: מטרים ושניות של רכב מסוג type. dead — חזרה ריקה למסוף (בלי סבסוד)
  charge(L, type, m, sec, dead = false) {
    const T = TYPES[type];
    L.stats.km += m / 1000; L.stats.hours += sec / 3600;
    if (!this.bank || L.def.fleet == null) return;
    if (m) this.bank.spend('km', m / 1000 * T.km, L.id);
    if (m && !dead) this.bank.subsidize(m / 1000, L.id);
    // לפי הסידור: הנהגים מקבלים שכר לשעת משמרת (sched.js pay), וכאן רק החלק של הרכב (תחזוקה)
    if (sec) { if (this.roster?.managed(L)) this.bank.spend('km', sec / 3600 * Math.max(0, T.hour - DRIVER_WAGE), L.id); else this.bank.spend('drivers', sec / 3600 * T.hour, L.id); }
  }
  // חצות: סיכום היום בקופה, והמונים של הקווים והתחנות מתאפסים
  newDay() {
    this.bank?.roll(this.time); this.ops.roll();
    // תושבים: מעברי דירה ועבודה של היום שהתחיל — ליומן "מה חדש בעיר"
    if (this.residents && this.bank) { const day = dayOf(this.time); for (const t of this.residents.catchUp(day + 1).slice(0, 6)) this.bank.cityNews.unshift({ day, t }); this.bank.cityNews.length = Math.min(this.bank.cityNews.length, 40); }
    for (const L of this.lines) if (!L.retired) L.resetStats();
    this.resetStops();
    this.yesterday = this.today; this.resetToday();
  }

  // סיכום לתחנה: ממתינים לפי קו
  stopSummary(stopId) {
    const per = [];
    for (const L of this.lines) {
      if (L.retired) continue;
      L.stops.forEach((s, k) => { if (s.id === stopId && k < L.stops.length - 1) per.push({ line: L, waiting: L.queues[k].length }); });
    }
    return { per, ...this.stopStats.get(stopId), waiting: per.reduce((a, x) => a + x.waiting, 0) };
  }
}

export function clockText(t) {
  const m = Math.floor(t / 60) % (24 * 60);
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}
function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
