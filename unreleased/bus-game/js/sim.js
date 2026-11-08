// הסימולציה: שעון משחק, יציאת אוטובוסים לפי תדירות, נסיעה, עצירה בתחנות, עולים ויורדים, נוסעים ממתינים.
// אין כאן ציור — רק מצב ואירועים (events) שהתצוגה קוראת.
// אוטובוס יוצא רק אם לקו יש רכב פנוי (def.fleet); הקיבולת לפי סוג הרכב; כסף נכנס בכל עלייה ויוצא על ק"מ ושעות נהג (fleet.js).
import { TYPES, FARE, DEADHEAD_SPEED, LAYOVER, typeOf, dayOf } from './fleet.js';
export const BUS = {
  capacity: 80,           // ברירת מחדל; הקיבולת האמיתית לפי סוג הרכב (fleet.js)
  doorTime: 1.1,          // פתיחה/סגירה (שנ')
  alightEvery: 0.9,       // יורד אחד כל ... (דלת אמצעית)
  boardEvery: 1.7,        // עולה אחד כל ... (דלת קדמית, תיקוף)
  minDwell: 3,
  doorS: 0,               // s של האוטובוס = מקום הדלת הקדמית
  gap: 18,                // מרחק מינימלי מהאוטובוס שלפניו באותו קו
};
const BASE_PER_HOUR = 70;  // נוסעים לשעה בתחנה עם משקל ביקוש 1
export const PATIENCE = 30 * 60;   // מי שמחכה יותר מזה מוותר והולך (והכרטיס שלו הולך איתו)

export function todFactor(t) {             // שעות שיא בבוקר ואחר הצהריים
  const h = (t / 3600) % 24;
  const g = (c, w) => Math.exp(-((h - c) ** 2) / (2 * w * w));
  return 0.35 + 1.2 * g(7.6, 0.9) + 0.9 * g(16.8, 1.3) + 0.35 * g(12.5, 2.2) - (h < 5.5 || h > 23 ? 0.3 : 0);
}

let PID = 1, BID = 1;

export class Sim {
  constructor(stops, bank = null, time = null) {
    this.time = time ?? 6.5 * 3600;   // 06:30 ביום הראשון
    this.bank = bank;
    this.speed = 5;
    this.lines = [];
    this.stops = stops;
    this.resetStops();
    this.events = [];
    this.rand = mulberry(7);
  }
  resetStops() { this.stopStats = new Map(this.stops.map(s => [s.id, { board: 0, alight: 0, left: 0, gaveUp: 0 }])); }
  addLine(line) {
    line.nextDispatch = this.time;
    this.lines.push(line);
  }
  // רכבים פנויים לקו: הצי, פחות מה שבדרך, פחות מה שחוזר ריק למסוף. null = בלי הגבלה (בלי צי)
  available(L) {
    if (L.def.fleet == null) return Infinity;
    let busy = L.returning.length;
    for (const b of L.buses) if (b.state === 'drive' || b.state === 'dwell') busy++;
    return L.def.fleet - busy;
  }
  // מקדם הביקוש לפי התדירות: כל 12 דק' = 1, כל 5 דק' = 1.3, כל 30 דק' = 0.58, כל שעה = 0.38
  demandK(L) {
    if (L.def.fleet === 0) return 0;
    const hw = Math.max(L.def.headway * 60, this.realHeadway(L) ?? 0) / 60;
    return Math.min(1.3, Math.max(0.3, (12 / hw) ** 0.6));
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
    this.lines = this.lines.filter(l => l !== line);
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
    const tf = todFactor(this.time);
    for (const L of this.lines) {
      // נוסעים חדשים. כמה אנשים בוחרים בקו תלוי בתדירות שלו בפועל: אוטובוס תכוף מושך יותר נוסעים,
      // ובלי רכבים אף אחד לא מחכה
      const n = L.stops.length;
      L.demandK = this.demandK(L);
      for (let k = 0; k < n - 1; k++) {
        const lam = BASE_PER_HOUR / 3600 * (L.stops[k].w ?? 0.3) * tf * L.demandK;
        if (this.rand() < lam * h) {
          const to = this.pickDest(L, k);
          const p = { id: PID++, line: L, from: k, to, t0: this.time };
          L.queues[k].push(p);
          this.events.push({ type: 'spawn', p, stop: L.stops[k] });
        }
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
      while (this.time >= L.nextDispatch) {
        if (this.available(L) <= 0 || L.buses.length >= 30) { L.short = true; break; }
        const type = typeOf(L.def), T = TYPES[type];
        const b = { id: BID++, line: L, type, cap: T.cap, s: 0, v: 0, next: 0, state: 'drive', pax: [], door: 0, t: 0, ph: null, born: this.time, fade: 1 };
        L.buses.push(b); this.events.push({ type: 'bus', bus: b });
        L.dispatches.push(this.time); if (L.dispatches.length > 6) L.dispatches.shift();
        L.stats.trips++;
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

  pickDest(L, k) {
    const n = L.stops.length; let tot = 0;
    for (let j = k + 1; j < n; j++) tot += (L.stops[j].w ?? 0.3) + 0.15;
    let r = this.rand() * tot;
    for (let j = k + 1; j < n; j++) { r -= (L.stops[j].w ?? 0.3) + 0.15; if (r <= 0) return j; }
    return n - 1;
  }

  moveBus(L, b, ahead, h) {
    if (b.state === 'drive') {
      const target = L.stopS[b.next];
      let v = Math.max(0.8, L.profile.get(b.s + 1.2));
      if (ahead && ahead.state !== 'done' && ahead.s - b.s < BUS.gap + 4) v = Math.min(v, Math.max(0, (ahead.s - b.s - BUS.gap) * 0.5));
      b.v += Math.max(-2.5 * h, Math.min(1.2 * h, v - b.v));
      b.v = Math.max(0, Math.min(v, b.v + 0.0001));
      b.s += b.v * h;
      this.charge(L, b.type, b.v * h, 0);
      if (b.s >= target - 0.05) {
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
        if (off >= 0) {
          busy = true;
          if (b.ta >= BUS.alightEvery) {
            b.ta = 0; const p = b.pax.splice(off, 1)[0];
            L.stats.alight++; ss.alight++;
            this.events.push({ type: 'alight', bus: b, p, stop });
          }
        }
        const q = L.queues[k];
        if (!last && q.length && b.pax.length < b.cap) {
          busy = true;
          if (b.tb >= BUS.boardEvery) {
            b.tb = 0; const p = q.shift(); p.tb = this.time; b.pax.push(p);
            L.stats.board++; ss.board++; L.stats.waitSum += this.time - p.t0; L.stats.waitN++;
            this.bank?.earn(FARE, L.id);
            this.events.push({ type: 'board', bus: b, p, stop });
          }
        }
        // מחכים שכל מי שהולך לדלת (או יוצא ממנה) יסיים, כדי שאף אחד לא יישאר באמצע הכביש
        if ((b.walking || 0) > 0 && b.dw < 90) busy = true;
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
            if (L.def.fleet != null) L.returning.push(this.time + dead + LAYOVER);
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
    for (const L of this.lines) L.resetStats();
    this.resetStops();
  }

  // סיכום לתחנה: ממתינים לפי קו
  stopSummary(stopId) {
    const per = [];
    for (const L of this.lines) {
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
