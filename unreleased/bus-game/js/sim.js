// הסימולציה: שעון משחק, יציאת אוטובוסים לפי תדירות, נסיעה, עצירה בתחנות, עולים ויורדים, נוסעים ממתינים.
// אין כאן ציור — רק מצב ואירועים (events) שהתצוגה קוראת.
// אוטובוס יוצא רק אם לקו יש רכב פנוי (def.fleet) ורק בשעות הפעילות של הקו; הקיבולת לפי סוג הרכב;
// כסף נכנס בכל נסיעה (פעם אחת, גם עם מעבר) ויוצא על ק"מ ושעות נהג (fleet.js).
// הנוסעים באים ממודל הביקוש (demand.js): לכל אחד מוצא ויעד, ומסלול של קו אחד עד שלושה קווים.
import { TYPES, FARE, DEADHEAD_SPEED, LAYOVER, typeOf, dayOf } from './fleet.js';
import { Network, inHours } from './demand.js';
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

const hourOf = t => Math.floor((t / 3600) % 24);
const DECEL = 1.2;       // בלימה (מ/ש²) — כמו בפרופיל המהירות
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
    if (this.demand) this.spawn(h);
    // מי שסיים ללכת לקו הבא (מעבר) נכנס לתור
    if (this.pending.length) this.pending = this.pending.filter(x => x.at > this.time || (this.joinQueue(x.p), false));
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
      if (L.off) L.nextDispatch = Math.max(L.nextDispatch, this.time + 1);
      while (!L.off && this.time >= L.nextDispatch) {
        if (this.available(L) <= 0 || L.buses.length >= 30) { L.short = true; break; }
        const type = typeOf(L.def), T = TYPES[type];
        const b = { id: BID++, line: L, type, cap: T.cap, s: 0, v: 0, next: 0, state: 'drive', pax: [], door: 0, t: 0, ph: null, born: this.time, fade: 1 };
        L.buses.push(b); this.events.push({ type: 'bus', bus: b });
        L.dispatches.push(this.time); if (L.dispatches.length > 6) L.dispatches.shift();
        L.stats.trips++; L.stats.hCap[H] += T.cap;
        // יציאה באיחור גדול: הלוח מתחיל מחדש מעכשיו, כדי שלא ייצאו כמה אוטובוסים בבת אחת
        const late = this.time - L.nextDispatch;
        L.nextDispatch = late > hw / 2 ? this.time + hw : L.nextDispatch + hw;
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

  // נוסעים חדשים לפי מודל הביקוש. כל מי ש"רוצה לנסוע" נספר; נוסע רק מי שיש לו מסלול בקווים שפועלים עכשיו,
  // ובסיכוי שתלוי בזמן הכולל (תדירות בפועל, הליכה, מעברים)
  spawn(h) {
    const D = this.demand, N = D.N;
    // הטבלה מתעדכנת כשקו נפתח/נסגר, ופעם ב-10 דקות משחק (התדירות בפועל משתנה)
    if (this.time - this.netT > 600) { this.netT = this.time; this.net.refresh(); }
    const tab = this.net.table(this.time);
    let x = D.rateAt(this.time) / 3600 * h;
    const H = hourOf(this.time), T = this.today;
    for (; x > 0; x -= 1) {
      if (this.rand() >= Math.min(1, x)) continue;
      const k = D.sample(this.time, this.rand);
      T.pot[H]++;
      const legs = tab.legs[k];
      if (!legs) { T.none[H]++; T.pairNone[D.zoneOf[(k / N) | 0] * D.Z + D.zoneOf[k % N]]++; continue; }
      if (this.rand() >= tab.p[k]) { T.declined[H]++; continue; }
      T.ride[H]++; T.trips++; if (legs.length > 1) T.xferTrips++;
      const p = { id: PID++, legs: legs.map(g => ({ ...g })), leg: 0, t0: this.time, paid: false, o: k / N | 0, d: k % N };
      for (const g of legs) g.L.stats.hWant[H]++;
      this.joinQueue(p);
    }
  }
  joinQueue(p) {
    const g = this.mapLeg(p.legs[p.leg]);
    if (!g || !this.lines.includes(g.L)) return;          // הקו נמחק בינתיים
    p.legs[p.leg] = g; p.line = g.L; p.from = g.from; p.to = g.to; p.t0 = this.time;
    g.L.queues[g.from].push(p);
    this.events.push({ type: 'spawn', p, stop: g.L.stops[g.from] });
  }

  // האם האוטובוס צריך לעצור בתחנה k
  needStop(L, b, k) {
    if (k === 0 || k === L.stops.length - 1) return true;
    if (b.pax.some(p => p.to === k)) return true;
    if (b.pax.length >= b.cap) return false;
    return L.queues[k].length > 0 || !!this.altRider(L, k, L.stops[k], false);
  }

  moveBus(L, b, ahead, h) {
    if (b.state === 'drive') {
      let target = L.stopS[b.next];
      // עוצרים רק כשצריך: מישהו יורד, או מישהו מחכה לקו ויש מקום. ההחלטה נקבעת כשמגיעים למרחק בלימה
      // (מי שמגיע לתחנה אחרי זה — מפספס). התחנה הראשונה והאחרונה — תמיד.
      if (b.decided !== b.next && (target - b.s <= b.v * b.v / (2 * DECEL) + 30)) {
        b.decided = b.next;
        b.stopHere = this.needStop(L, b, b.next);
      }
      if (b.decided === b.next && !b.stopHere && b.s >= target - 0.05) {
        // חולפים על פני התחנה. אוטובוס מלא שמשאיר ממתינים — נספר כ"נשארו"
        const stop = L.stops[b.next], ss = this.stopStats.get(stop.id), left = L.queues[b.next].length;
        if (left && b.pax.length >= b.cap) { L.stats.left += left; ss.left += left; this.events.push({ type: 'full', bus: b, stop, n: left }); }
        this.events.push({ type: 'pass', bus: b, stop });
        b.next++; target = L.stopS[b.next];
      }
      const stopping = b.decided !== b.next || b.stopHere;
      let v = Math.max(0.8, (L.profileFree || L.profile).get(b.s + 1.2));
      if (stopping) v = Math.min(v, Math.sqrt(2 * DECEL * Math.max(0, target - b.s)) + 0.25);
      if (ahead && ahead.state !== 'done' && ahead.s - b.s < BUS.gap + 4) v = Math.min(v, Math.max(0, (ahead.s - b.s - BUS.gap) * 0.5));
      b.v += Math.max(-2.5 * h, Math.min(1.2 * h, v - b.v));
      b.v = Math.max(0, Math.min(v, b.v + 0.0001));
      b.s += b.v * h;
      this.charge(L, b.type, b.v * h, 0);
      if (stopping && b.s >= target - 0.05) {
        b.s = target; b.v = 0; b.state = 'dwell'; b.ph = 'open'; b.t = 0; b.dw = 0;
        b.ta = 0; b.tb = 0;
        this.events.push({ type: 'arrive', bus: b, stop: L.stops[b.next] });
      }
    } else if (b.state === 'dwell') {
      const k = b.next, last = k === L.stops.length - 1, stop = L.stops[k], ss = this.stopStats.get(stop.id);
      b.dw += h;
      if (b.ph === 'open') {
        b.door = Math.min(1, b.door + h / BUS.doorTime);
        if (b.door >= 1) b.ph = 'xchg';
      } else if (b.ph === 'xchg') {
        b.ta += h; b.tb += h;
        let busy = false;
        const off = b.pax.findIndex(p => p.to === k || last);
        // כיסא גלגלים (js/access.js): בזמן שהנהג מוציא ומקפל את המשטח, היורדים מחכים
        if (off >= 0 && b.access) busy = true;
        else if (off >= 0) {
          busy = true;
          if (b.ta >= BUS.alightEvery) {
            b.ta = 0; const p = b.pax.splice(off, 1)[0];
            L.stats.alight++; ss.alight++;
            if (p.wheel) b.access = true;      // נוסע בכיסא גלגלים יורד: האוטובוס מחכה לנהג ולמשטח (access.js)
            this.events.push({ type: 'alight', bus: b, p, stop });
            if (p.leg + 1 < p.legs.length) this.transfer(p, L, stop);
          }
        }
        if (!last && b.pax.length < b.cap && (L.queues[k].length || this.altRider(L, k, stop, false))) {
          busy = true;
          if (b.tb >= BUS.boardEvery) {
            b.tb = 0; const p = L.queues[k].shift() || this.altRider(L, k, stop, true); p.tb = this.time; b.pax.push(p);
            if (p.wheel) b.access = true;      // עולה בכיסא גלגלים: האוטובוס מחכה עד שהנהג חוזר למקום (access.js)
            L.stats.board++; L.stats.hBoard[hourOf(this.time)]++; ss.board++; L.stats.waitSum += this.time - p.t0; L.stats.waitN++;
            // מעבר בחינם (כמו "רב-קו": עד 90 דק') — משלמים רק בעלייה הראשונה
            if (!p.paid) { p.paid = true; this.bank?.earn(FARE, L.id); } else L.stats.xferIn++;
            this.events.push({ type: 'board', bus: b, p, stop });
          }
        }
        // מחכים שכל מי שהולך לדלת (או יוצא ממנה) יסיים, כדי שאף אחד לא יישאר באמצע הכביש
        if ((b.walking || 0) > 0 && b.dw < 90) busy = true;
        if (b.access && b.dw < 600) busy = true;
        if (!busy && b.dw >= BUS.minDwell + BUS.doorTime) b.ph = 'close';
      } else if (b.ph === 'close') {
        b.door = Math.max(0, b.door - h / BUS.doorTime);
        if (b.door <= 0) {
          // אוטובוס מלא נוסע ומשאיר אנשים בתחנה
          const left = last ? 0 : L.queues[k].length;
          if (left && b.pax.length >= b.cap) { L.stats.left += left; ss.left += left; this.events.push({ type: 'full', bus: b, stop, n: left }); }
          if (last) {
            b.state = 'done'; b.t = 0; b.doneAt = this.time;
            // הרכב נוסע ריק חזרה לתחנה הראשונה ונח במסוף; רק אז הוא פנוי שוב (את הנסיעה הזו לא מציירים)
            const dead = L.poly.length / DEADHEAD_SPEED;
            if (L.def.fleet != null) this.current(L).returning.push(this.time + dead + LAYOVER);
            this.charge(L, b.type, L.poly.length, dead + LAYOVER);
            this.events.push({ type: 'done', bus: b });
          }
          else { b.state = 'drive'; b.next++; this.events.push({ type: 'depart', bus: b, stop }); }
        }
      }
    } else if (b.state === 'done') {
      b.t += h; b.fade = Math.max(0, 1 - b.t / 4);
      if (b.t > 4) b.state = 'gone';
    }
  }

  // קווים מקבילים: מי שמחכה לקו אחר, והאוטובוס הזה מגיע ישר לאותה תחנת ירידה — עולה גם הוא (לא מחכים דווקא לקו "שלהם").
  // take=false: רק בודקים אם יש כזה
  altRider(L, k, stop, take) {
    for (const M of this.lines) {
      if (M === L || M.retired) continue;
      for (let j = 0; j < M.stops.length - 1; j++) {
        if (M.stops[j] !== stop) continue;
        const Q = M.queues[j];
        for (let i = 0; i < Q.length; i++) {
          const p = Q[i], dest = M.stops[p.to];
          let t = -1; for (let x = k + 1; x < L.stops.length; x++) if (L.stops[x] === dest) { t = x; break; }
          if (t < 0) continue;
          if (!take) return true;
          Q.splice(i, 1);
          p.legs[p.leg] = { L, from: k, to: t }; p.line = L; p.from = k; p.to = t;
          return p;
        }
      }
    }
    return null;
  }
  // ירד באמצע הדרך כדי לעלות לקו הבא: הולך לתחנה של הקו הבא (אם היא אחרת — עד 400 מ') ומחכה שם
  transfer(p, L, stop) {
    const next = this.mapLeg(p.legs[p.leg + 1]);
    if (!next) return;
    p.leg++; p.legs[p.leg] = next;
    const to = next.L.stops[next.from];
    const walk = Math.hypot(to.x - stop.x, to.y - stop.y) * 1.2 / 1.3;
    this.pending.push({ p, at: this.time + 15 + walk });
    const key = this.current(L).id + '>' + next.L.id, T = this.today;
    T.xfer.set(key, (T.xfer.get(key) || 0) + 1);
    T.xferStop.set(stop.id, (T.xferStop.get(stop.id) || 0) + 1);
    this.stopStats.get(stop.id).xfer++;
  }

  // עלות: מטרים ושניות של רכב מסוג type
  charge(L, type, m, sec) {
    const T = TYPES[type];
    L.stats.km += m / 1000; L.stats.hours += sec / 3600;
    if (!this.bank || L.def.fleet == null) return;
    if (m) this.bank.spend('km', m / 1000 * T.km, L.id);
    if (sec) this.bank.spend('drivers', sec / 3600 * T.hour, L.id);
  }
  // חצות: סיכום היום בקופה, והמונים של הקווים והתחנות מתאפסים
  newDay() {
    this.bank?.roll(this.time);
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
