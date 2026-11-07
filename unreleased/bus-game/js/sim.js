// הסימולציה: שעון משחק, יציאת אוטובוסים לפי תדירות, נסיעה, עצירה בתחנות, עולים ויורדים, נוסעים ממתינים.
// אין כאן ציור — רק מצב ואירועים (events) שהתצוגה קוראת.
// אוטובוס יוצא רק אם יש לקו רכב פנוי (fleet.js); הקיבולת לפי סוג הרכב; כסף נכנס בכל עלייה ויוצא על נהג, דלק ותחזוקה.
import { TYPES, FARE, DRIVER_HOUR } from './fleet.js';
export const BUS = {
  capacity: 80,           // ברירת מחדל, אם אין רכב (הקיבולת האמיתית — לפי סוג הרכב)
  doorTime: 1.1,          // פתיחה/סגירה (שנ')
  alightEvery: 0.9,       // יורד אחד כל ... (דלת אמצעית)
  boardEvery: 1.7,        // עולה אחד כל ... (דלת קדמית, תיקוף)
  minDwell: 3,
  doorS: 0,               // s של האוטובוס = מקום הדלת הקדמית
  gap: 6,                 // מרחק מינימלי מהאוטובוס שלפניו באותו קו, מעבר לאורך שלו
};
const BASE_PER_HOUR = 70;  // נוסעים לשעה בתחנה עם משקל ביקוש 1

export function todFactor(t) {             // שעות שיא בבוקר ואחר הצהריים
  const h = (t / 3600) % 24;
  const g = (c, w) => Math.exp(-((h - c) ** 2) / (2 * w * w));
  return 0.35 + 1.2 * g(7.6, 0.9) + 0.9 * g(16.8, 1.3) + 0.35 * g(12.5, 2.2) - (h < 5.5 || h > 23 ? 0.3 : 0);
}

let PID = 1, BID = 1;

export class Sim {
  constructor(stops, fleet, time) {
    this.time = time ?? 6.5 * 3600;   // 06:30 ביום הראשון
    this.fleet = fleet;
    this.speed = 5;
    this.lines = [];
    this.stopStats = new Map(stops.map(s => [s.id, { board: 0, alight: 0, passedFull: 0 }]));
    this.events = [];
    this.rand = mulberry(7);
  }
  addLine(line) {
    line.nextDispatch = this.time;
    this.lines.push(line);
  }
  removeLine(line) {
    this.lines = this.lines.filter(l => l !== line);
    this.fleet?.dropLine(line.id);
  }

  step(realDt) {
    if (!this.speed) return 0;
    let dt = Math.min(realDt, 0.25) * this.speed;
    const total = dt;
    while (dt > 1e-6) { const h = Math.min(dt, 0.25); this.tick(h); dt -= h; }
    return total;
  }

  tick(h) {
    this.time += h;
    this.fleet?.tick(h, this.time);
    const tf = todFactor(this.time);
    for (const L of this.lines) {
      // נוסעים חדשים
      const n = L.stops.length;
      for (let k = 0; k < n - 1; k++) {
        const lam = BASE_PER_HOUR / 3600 * (L.stops[k].w ?? 0.3) * tf;
        if (this.rand() < lam * h) {
          const to = this.pickDest(L, k);
          const p = { id: PID++, line: L, from: k, to, t0: this.time };
          L.queues[k].push(p);
          this.events.push({ type: 'spawn', p, stop: L.stops[k] });
        }
      }
      // יציאה מהמסוף — רק אם יש רכב פנוי. אין רכב: היציאה מחכה, ויוצאת ברגע שרכב חוזר למוסך
      const hw = L.def.headway * 60;
      L.short = false;
      while (this.time >= L.nextDispatch) {
        const veh = this.fleet ? (L.buses.length < 14 ? this.fleet.take(L.id, this.time) : null) : null;
        if (this.fleet && !veh) { L.short = true; break; }
        const T = veh ? TYPES[veh.type] : null;
        const b = { id: BID++, line: L, vehicle: veh, type: veh?.type || 'city', cap: T ? T.cap : BUS.capacity, len: T ? T.len : 12,
          s: 0, v: 0, next: 0, state: 'drive', pax: [], door: 0, t: 0, ph: null, born: this.time, fade: 1 };
        L.buses.push(b); this.events.push({ type: 'bus', bus: b });
        const late = this.time - L.nextDispatch;
        if (late > 60) L.stats.late++;
        // יציאה באיחור גדול: מתחילים את הלוח מחדש מעכשיו, כדי שלא ייצאו כמה אוטובוסים בבת אחת
        L.nextDispatch = late > hw / 2 ? this.time + hw : L.nextDispatch + hw;
      }
      // תפוסה ממוצעת: כמה מהקיבולת תפוסה, לאורך הזמן שהאוטובוסים בדרך; ונהגים — לכל אוטובוס בשירות
      for (const b of L.buses) if (b.state === 'drive' || b.state === 'dwell') { L.stats.loadSum += b.pax.length / b.cap * h; L.stats.loadT += h; }
      if (this.fleet) {
        let inService = 0;
        for (const b of L.buses) if (b.state !== 'gone') inService++;
        if (inService) this.fleet.spend('drivers', inService * h / 3600 * DRIVER_HOUR, L.id);
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
      const gap = ahead ? ahead.len + BUS.gap : 0;
      if (ahead && ahead.state !== 'done' && ahead.s - b.s < gap + 4) v = Math.min(v, Math.max(0, (ahead.s - b.s - gap) * 0.5));
      b.v += Math.max(-2.5 * h, Math.min(1.2 * h, v - b.v));
      b.v = Math.max(0, Math.min(v, b.v + 0.0001));
      b.s += b.v * h;
      if (b.vehicle && this.fleet) {
        const km = b.v * h / 1000; b.vehicle.km += km;
        this.fleet.spend('energy', km * TYPES[b.type].km, L.id);
      }
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
            L.boardTimes.push(this.time);
            this.fleet?.earn(FARE, L.id);
            this.events.push({ type: 'board', bus: b, p, stop });
          }
        }
        // מחכים שכל מי שהולך לדלת (או יוצא ממנה) יסיים, כדי שאף אחד לא יישאר באמצע הכביש
        if ((b.walking || 0) > 0 && b.dw < 90) busy = true;
        if (!busy && b.dw >= BUS.minDwell + BUS.doorTime) b.ph = 'close';
      } else if (b.ph === 'close') {
        b.door = Math.max(0, b.door - h / BUS.doorTime);
        if (b.door <= 0) {
          // אוטובוס מלא נוסע ומשאיר ממתינים בתחנה
          const left = last ? 0 : L.queues[k].length;
          if (left && b.pax.length >= b.cap) { L.stats.passedFull += left; ss.passedFull += left; this.events.push({ type: 'full', bus: b, stop, n: left }); }
          if (last) { b.state = 'done'; b.t = 0; this.fleet?.release(b.vehicle, this.time, L); this.events.push({ type: 'done', bus: b }); }
          else { b.state = 'drive'; b.next++; this.events.push({ type: 'depart', bus: b, stop }); }
        }
      }
    } else if (b.state === 'done') {
      // הנוסעים שבתוך האוטובוס כבר ירדו; הרכב "נעלם" בהדרגה — בפועל הוא נוסע ריק למוסך (fleet.release)
      b.t += h; b.fade = Math.max(0, 1 - b.t / 4);
      if (b.t > 4) b.state = 'gone';
    }
  }

  // סיכום לתחנה: ממתינים לפי קו
  stopSummary(stopId) {
    const per = [];
    for (const L of this.lines) {
      L.stops.forEach((s, k) => { if (s.id === stopId && k < L.stops.length - 1) per.push({ line: L, waiting: L.queues[k].length }); });
    }
    return { per, ...this.stopStats.get(stopId), waiting: per.reduce((a, x) => a + x.waiting, 0) };
  }
  // נוסעים בשעה האחרונה (לפי עליות)
  perHour(L) {
    const t0 = this.time - 3600, a = L.boardTimes;
    let i = 0; while (i < a.length && a[i] < t0) i++;
    if (i) a.splice(0, i);
    return a.length;
  }
}

export function clockText(t) {
  const m = Math.floor(t / 60) % (24 * 60);
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}
function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
