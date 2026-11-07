// הסימולציה: שעון משחק, יציאת אוטובוסים לפי תדירות, נסיעה, עצירה בתחנות, עולים ויורדים, נוסעים ממתינים.
// אין כאן ציור — רק מצב ואירועים (events) שהתצוגה קוראת.
export const BUS = {
  capacity: 80,
  doorTime: 1.1,          // פתיחה/סגירה (שנ')
  alightEvery: 0.9,       // יורד אחד כל ... (דלת אמצעית)
  boardEvery: 1.7,        // עולה אחד כל ... (דלת קדמית, תיקוף)
  minDwell: 3,
  doorS: 0,               // s של האוטובוס = מקום הדלת הקדמית
  gap: 18,                // מרחק מינימלי מהאוטובוס שלפניו באותו קו
};
const BASE_PER_HOUR = 70;  // נוסעים לשעה בתחנה עם משקל ביקוש 1

export function todFactor(t) {             // שעות שיא בבוקר ואחר הצהריים
  const h = (t / 3600) % 24;
  const g = (c, w) => Math.exp(-((h - c) ** 2) / (2 * w * w));
  return 0.35 + 1.2 * g(7.6, 0.9) + 0.9 * g(16.8, 1.3) + 0.35 * g(12.5, 2.2) - (h < 5.5 || h > 23 ? 0.3 : 0);
}

let PID = 1, BID = 1;

export class Sim {
  constructor(stops) {
    this.time = 6.5 * 3600;   // 06:30
    this.speed = 5;
    this.lines = [];
    this.stopStats = new Map(stops.map(s => [s.id, { board: 0, alight: 0 }]));
    this.events = [];
    this.rand = mulberry(7);
  }
  addLine(line) {
    line.nextDispatch = this.time;
    this.lines.push(line);
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
    this.time += h;
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
      // יציאה מהמסוף
      while (this.time >= L.nextDispatch) {
        if (L.buses.length < 14) {
          const b = { id: BID++, line: L, s: 0, v: 0, next: 0, state: 'drive', pax: [], door: 0, t: 0, ph: null, born: this.time, fade: 1 };
          L.buses.push(b); this.events.push({ type: 'bus', bus: b });
        }
        L.nextDispatch += L.def.headway * 60;
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
        if (!last && q.length && b.pax.length < BUS.capacity) {
          busy = true;
          if (b.tb >= BUS.boardEvery) {
            b.tb = 0; const p = q.shift(); p.tb = this.time; b.pax.push(p);
            L.stats.board++; ss.board++; L.stats.waitSum += this.time - p.t0; L.stats.waitN++;
            this.events.push({ type: 'board', bus: b, p, stop });
          }
        }
        // מחכים שכל מי שהולך לדלת (או יוצא ממנה) יסיים, כדי שאף אחד לא יישאר באמצע הכביש
        if ((b.walking || 0) > 0 && b.dw < 90) busy = true;
        if (!busy && b.dw >= BUS.minDwell + BUS.doorTime) b.ph = 'close';
      } else if (b.ph === 'close') {
        b.door = Math.max(0, b.door - h / BUS.doorTime);
        if (b.door <= 0) {
          if (last) { b.state = 'done'; b.t = 0; this.events.push({ type: 'done', bus: b }); }
          else { b.state = 'drive'; b.next++; this.events.push({ type: 'depart', bus: b, stop }); }
        }
      }
    } else if (b.state === 'done') {
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
}

export function clockText(t) {
  const m = Math.floor(t / 60) % (24 * 60);
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}
function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
