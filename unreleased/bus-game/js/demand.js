// ביקוש: מי רוצה לנסוע מאיפה לאן ומתי (מודל כבידה מעל אזורים ותחנות), ואיך הוא נוסע בקווים של השחקן
// (ישיר, או עם מעבר אחד או שניים, כולל הליכה עד 400 מ' לתחנה). בלי ציור — רק חשבון.
//
// הנתונים: world/demand.json (tools/build_demand.py) — לכל תחנה: אזור, תושבים, ומשקל של עבודה, לימודים וקניות סביבה.
// המודל:
//   נסיעות ביום (רק הלוך) לכל תושב, שאפשר היה לעשות באוטובוס (גם מי שהיום נוסע ברכב): עבודה 0.24, לימודים 0.12,
//   קניות ושונות 0.32. ההלוך מהבית, והחזור — אותה נסיעה הפוכה.
//   היעד: כבידה — כמה יש ביעד (עבודה/לימודים/קניות) × דעיכה עם המרחק, מנורמל לכל מוצא.
//   נסיעות קצרות הולכים ברגל: עד 400 מ' — אין ביקוש, ומעבר לזה מוכפל ב-(1 − e^(−מרחק/700 מ')).
//   שעות: עבודה יוצאים ב-7 וחוזרים ב-16:30; לימודים ב-7:30 וחזרה ב-13:30–15; קניות לאורך היום.
// מי שיש לו מסלול בקווים — נוסע בסיכוי שתלוי בזמן הכולל (הליכה, המתנה, נסיעה ומעברים) לעומת המרחק.
import { lineCycle } from './fleet.js';

export const RATES = { work: 0.24, school: 0.12, other: 0.32 };
const DECAY = { work: 1800, school: 1100, other: 1300 };      // מטרים
export const WALK = 400;           // הכי רחוק שהולכים לתחנה (או בין תחנות במעבר), בקו אווירי
const WALK_K = 1.2;                // הליכה בפועל לעומת קו אווירי
const WALK_V = 78;                 // מ' לדקה
const WALK_W = 1.5;                // דקת הליכה מורגשת כמו דקה וחצי
const XFER = 5;                    // דק' "קנס" לכל מעבר
const PMAX = 0.9;
export const MAX_LEGS = 3;         // עד שני מעברים

const gauss = (h, c, w) => Math.exp(-((h - c) ** 2) / (2 * w * w));
function profile(parts) {
  const a = new Float64Array(24);
  for (let h = 0; h < 24; h++) for (const [c, w, k] of parts) a[h] += k * gauss(h + 0.5, c, w);
  const s = a.reduce((x, y) => x + y, 0);
  return a.map(v => v / s);
}
// לכל מטרה: מתי יוצאים (הלוך) ומתי חוזרים — חלק מהיום לכל שעה (סכום 1)
export const PROFILES = {
  work: { out: profile([[7.1, 0.8, 1], [9, 1.5, 0.25]]), back: profile([[16.6, 1.2, 1], [19, 1.5, 0.3]]) },
  school: { out: profile([[7.5, 0.45, 1]]), back: profile([[13.4, 0.7, 0.6], [15.2, 0.9, 0.4]]) },
  other: { out: profile([[9.8, 1.6, 0.6], [16.5, 2, 0.4]]), back: profile([[12.5, 2, 0.5], [19.5, 1.6, 0.5]]) },
};

export class Demand {
  constructor(data, stops) {
    const N = this.N = stops.length;
    this.stops = stops;
    this.idx = new Map(stops.map((s, i) => [s.id, i]));
    this.zones = data.zones.map(z => ({ ...z, stops: [] }));
    const Z = this.Z = this.zones.length;
    this.zoneOf = new Int16Array(N);
    const pop = this.pop = new Float64Array(N), A = { work: new Float64Array(N), school: new Float64Array(N), other: new Float64Array(N) };
    stops.forEach((s, i) => {
      const r = data.stops[s.id] || [0, 0, 0, 0, 0];
      this.zoneOf[i] = r[0]; this.zones[r[0]]?.stops.push(i);
      pop[i] = r[1]; A.work[i] = r[2]; A.school[i] = r[3]; A.other[i] = r[4];
      s.zone = r[0]; s.pop = r[1];
    });
    this.attr = A;
    // מה יש בכל שכונה: תושבים, ומשקל מקומות העבודה, הלימודים והמסחר — כחלק מכל העיר
    const tot = k => A[k].reduce((a, b) => a + b, 0) || 1;
    const T = { work: tot('work'), school: tot('school'), other: tot('other'), pop: pop.reduce((a, b) => a + b, 0) || 1 };
    for (const z of this.zones) {
      z.pop = 0; z.work = 0; z.school = 0; z.other = 0;
      for (const i of z.stops) { z.pop += pop[i]; z.work += A.work[i] / T.work; z.school += A.school[i] / T.school; z.other += A.other[i] / T.other; }
      // סוג השכונה: מה מייצר בה הכי הרבה נסיעות ביום — יציאות מהבית, או הגעות לעבודה/ללימודים/לקניות
      const trips = [z.pop * (RATES.work + RATES.school + RATES.other), z.work * T.pop * RATES.work, z.school * T.pop * RATES.school, z.other * T.pop * RATES.other];
      z.type = trips.indexOf(Math.max(...trips));
    }
    // מרחקים (קו אווירי) ושכנים בהליכה
    const dist = this.dist = new Float32Array(N * N);
    this.walkNb = [];
    for (let i = 0; i < N; i++) {
      const nb = [];
      for (let j = 0; j < N; j++) {
        const d = Math.hypot(stops[i].x - stops[j].x, stops[i].y - stops[j].y);
        dist[i * N + j] = d;
        if (d <= WALK) nb.push(j, d * WALK_K / WALK_V);
      }
      this.walkNb.push(nb);       // [תחנה, דקות הליכה, ...] כולל התחנה עצמה (0 דק')
    }
    // נסיעות ביום לכל מטרה (מהבית ליעד)
    const daily = {};
    for (const p of Object.keys(RATES)) {
      const T = daily[p] = new Float64Array(N * N);
      for (let o = 0; o < N; o++) {
        if (!pop[o]) continue;
        let sum = 0;
        for (let d = 0; d < N; d++) sum += A[p][d] * Math.exp(-dist[o * N + d] / DECAY[p]);
        if (!sum) continue;
        const prod = pop[o] * RATES[p] / sum;
        for (let d = 0; d < N; d++) {
          const m = dist[o * N + d];
          if (m <= WALK) continue;            // עד 400 מ' — הולכים ברגל
          T[o * N + d] = prod * A[p][d] * Math.exp(-m / DECAY[p]) * (1 - Math.exp(-m / 700));
        }
      }
    }
    // לכל שעה: נסיעות לשעה מכל תחנה לכל תחנה (הלוך + חזור), סכום, והתפלגות מצטברת להגרלה
    // zonePurp[h]: נסיעות לשעה בין אזורים לפי סוג היעד — [(מוצא*Z+יעד)*4 + סוג], סוג: 0 הביתה, 1 עבודה, 2 לימודים, 3 קניות
    this.daily = daily;                   // לתושבים הקבועים (residents.js)
    this.hour = []; this.hourTot = new Float64Array(24); this.cdf = []; this.zoneHour = []; this.zonePurp = [];
    this.cdfOther = []; this.hourTotOther = new Float64Array(24);
    const zo = this.zoneOf;
    for (let h = 0; h < 24; h++) {
      const R = new Float32Array(N * N), ZP = new Float32Array(Z * Z * 4);
      Object.keys(RATES).forEach((p, pi) => {
        const T = daily[p], ko = PROFILES[p].out[h], kb = PROFILES[p].back[h];
        for (let o = 0; o < N; o++) for (let d = 0; d < N; d++) {
          const v = T[o * N + d]; if (!v) continue;
          R[o * N + d] += v * ko; R[d * N + o] += v * kb;
          ZP[(zo[o] * Z + zo[d]) * 4 + pi + 1] += v * ko; ZP[(zo[d] * Z + zo[o]) * 4] += v * kb;
        }
      });
      this.zonePurp.push(ZP);
      const C = new Float64Array(N * N); let acc = 0;
      const ZR = new Float32Array(Z * Z);
      for (let k = 0; k < N * N; k++) {
        acc += R[k]; C[k] = acc;
        if (R[k]) ZR[this.zoneOf[(k / N) | 0] * Z + this.zoneOf[k % N]] += R[k];
      }
      this.hour.push(R); this.cdf.push(C); this.hourTot[h] = acc; this.zoneHour.push(ZR);
      // רק "קניות ושונות" (כשיש תושבים קבועים — עבודה ולימודים באים מהם)
      const T = daily.other, ko = PROFILES.other.out[h], kb = PROFILES.other.back[h], CO = new Float64Array(N * N); let ao = 0;
      for (let k = 0; k < N * N; k++) { const o = (k / N) | 0, d = k % N; ao += T[k] * ko + T[d * N + o] * kb; CO[k] = ao; }
      this.cdfOther.push(CO); this.hourTotOther[h] = ao;
    }
    this.dayTot = this.hourTot.reduce((a, b) => a + b, 0);
  }
  // נסיעות לשעה בזמן t (שניות מתחילת היום הראשון), בהמשכיות בין השעות
  rateAt(t) {
    const x = ((t / 3600) % 24) - 0.5, h0 = Math.floor(x), f = x - h0;
    const a = this.hourTot[(h0 + 24) % 24], b = this.hourTot[(h0 + 1) % 24];
    return a + (b - a) * f;
  }
  rateAtOther(t) {
    const x = ((t / 3600) % 24) - 0.5, h0 = Math.floor(x), f = x - h0;
    const a = this.hourTotOther[(h0 + 24) % 24], b = this.hourTotOther[(h0 + 1) % 24];
    return a + (b - a) * f;
  }
  sampleOther(t, rand) {
    const h = Math.floor((t / 3600) % 24), C = this.cdfOther[h], r = rand() * C[C.length - 1];
    let lo = 0, hi = C.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (C[m] < r) lo = m + 1; else hi = m; }
    return lo;
  }
  // הגרלת זוג מוצא-יעד לפי השעה. מחזיר o*N+d
  sample(t, rand) {
    const h = Math.floor((t / 3600) % 24), C = this.cdf[h], r = rand() * C[C.length - 1];
    let lo = 0, hi = C.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (C[m] < r) lo = m + 1; else hi = m; }
    return lo;
  }
}

// ---------- מסלולים בקווים
// זמן הנסיעה מתחילת הקו לכל תחנה (שנ'), לפי פרופיל המהירות + 20 שנ' לעצירה
export function lineTimes(L) {
  if (L._times) return L._times;
  const P = L.profile, out = new Float64Array(L.stops.length);
  let t = 0, s = 0, k = 0;
  for (let i = 0; i + 1 < P.v.length && k < out.length; i++) {
    while (k < out.length && L.stopS[k] <= s + 1e-6) { out[k] = t + k * 20; k++; }
    t += P.STEP / Math.max(1.5, (P.v[i] + P.v[i + 1]) / 2); s += P.STEP;
  }
  while (k < out.length) { out[k] = t + k * 20; k++; }
  return (L._times = out);
}
// המתנה צפויה (דק') לפי תדירות (דק'): חצי מהתדירות, ובתדירות נמוכה אנשים כבר מתכננים לפי הלוח
export const waitOf = hw => hw <= 20 ? hw / 2 : 10 + (hw - 20) / 4;
// סיכוי לנסוע: זמן "מורגש" (הליכה ×1.5, המתנה ×1.5, נסיעה, 5 דק' לכל מעבר) לעומת 18 דק' + 9 דק' לכל ק"מ
export const rideProb = (cost, metres) => PMAX / (1 + Math.exp((cost - (18 + 9 * metres / 1000)) / 7));

// טבלת מסלולים לכל זוג תחנות, לקווים שנתונים. lines: [{L, hw}] (hw בדקות)
export function buildTable(D, lines) {
  const N = D.N, NN = N * N;
  const tab = { legs: new Array(NN).fill(null), cost: new Float32Array(NN).fill(Infinity), p: new Float32Array(NN), lines: lines.map(x => x.L) };
  if (!lines.length) return tab;
  const prep = lines.map(({ L, hw }) => ({ L, idx: L.stops.map(s => D.idx.get(s.id)), T: lineTimes(L), wait: 1.5 * waitOf(hw) }));
  const R = MAX_LEGS, INF = 1e9;
  const board = [], arr = [], aLine = [], aB = [], aA = [], bFrom = [];
  for (let r = 0; r < R; r++) {
    board.push(new Float64Array(N)); arr.push(new Float64Array(N)); bFrom.push(new Int32Array(N));
    aLine.push(new Int32Array(N)); aB.push(new Int32Array(N)); aA.push(new Int32Array(N));
  }
  for (let o = 0; o < N; o++) {
    board[0].fill(INF);
    const nb0 = D.walkNb[o];
    for (let i = 0; i < nb0.length; i += 2) { board[0][nb0[i]] = WALK_W * nb0[i + 1]; bFrom[0][nb0[i]] = -1; }
    for (let r = 0; r < R; r++) {
      const B = board[r], A = arr[r]; A.fill(INF);
      prep.forEach((pl, li) => {
        const { idx, T, wait } = pl, n = idx.length;
        let best = INF, bk = -1;
        for (let k = 0; k < n; k++) {
          const s = idx[k];
          if (bk >= 0) { const c = best + T[k] / 60; if (c < A[s]) { A[s] = c; aLine[r][s] = li; aB[r][s] = bk; aA[r][s] = k; } }
          if (k < n - 1 && B[s] < INF) { const c = B[s] + wait - T[k] / 60; if (c < best) { best = c; bk = k; } }
        }
      });
      if (r + 1 < R) {
        const NB = board[r + 1]; NB.fill(INF);
        for (let s = 0; s < N; s++) {
          if (A[s] >= INF) continue;
          const nb = D.walkNb[s];
          for (let i = 0; i < nb.length; i += 2) {
            const c = A[s] + WALK_W * nb[i + 1] + XFER;
            if (c < NB[nb[i]]) { NB[nb[i]] = c; bFrom[r + 1][nb[i]] = s; }
          }
        }
      }
    }
    // לכל יעד: התחנה הכי טובה לרדת בה (עד 400 מ' הליכה)
    for (let d = 0; d < N; d++) {
      if (d === o) continue;
      let bc = INF, br = -1, bs = -1;
      const nb = D.walkNb[d];
      for (let r = 0; r < R; r++) for (let i = 0; i < nb.length; i += 2) {
        const s = nb[i], c = arr[r][s] + WALK_W * nb[i + 1];
        if (c < bc) { bc = c; br = r; bs = s; }
      }
      if (br < 0) continue;
      // שחזור: מהרגל האחרונה אחורה
      const legs = []; let s = bs;
      for (let r = br; r >= 0; r--) {
        const pl = prep[aLine[r][s]], from = aB[r][s], to = aA[r][s];
        legs.unshift({ L: pl.L, from, to });
        s = bFrom[r][pl.idx[from]];
      }
      const k = o * N + d;
      tab.legs[k] = legs; tab.cost[k] = bc; tab.p[k] = rideProb(bc, D.dist[k]);
    }
  }
  return tab;
}

// ---------- רשת: מטמון של טבלאות לפי הקווים שפועלים, וסיכומים לתצוגה
export const DEFAULT_HOURS = [300, 1440];     // 05:00–24:00 (דקות מתחילת היום)
export const hoursOf = def => Array.isArray(def.hours) && def.hours.length === 2 ? def.hours : DEFAULT_HOURS;
export function inHours(def, t) {
  const [a, b] = hoursOf(def), m = (t / 60) % 1440;
  return a <= b ? m >= a && m < b : m >= a || m < b;
}

export class Network {
  constructor(D, sim) {
    this.D = D; this.sim = sim;
    this.cache = new Map(); this.ver = 0; this.sums = null;
  }
  invalidate() { this.cache.clear(); this.sums = null; this.ver++; }
  refresh() { this.invalidate(); }       // התדירות בפועל השתנתה
  // תדירות "מורגשת" (דק'): המתוכננת, או מה שהצי מאפשר, או מה שקורה בפועל — הגרוע מביניהם
  hwOf(L) {
    const d = L.def, cyc = lineCycle(L).total / 60;
    let hw = Math.max(d.headway, d.fleet ? cyc / d.fleet : Infinity);
    const real = this.sim.realHeadway(L);
    if (real != null) hw = Math.max(hw, Math.min(real / 60, hw * 3));
    return Math.min(hw, 120);
  }
  active(at) {      // at: זמן (שנ'), או null = כל הקווים שיש להם רכבים, בלי קשר לשעות
    return this.sim.lines.filter(L => !L.retired && L.def.fleet > 0 && (at == null || inHours(L.def, at)));
  }
  table(at = null) {
    const act = this.active(at), key = act.map(L => L.id).join(',') || '-';
    let t = this.cache.get(key);
    if (!t) {
      t = buildTable(this.D, act.map(L => ({ L, hw: this.hwOf(L) })));
      t.key = key; this.cache.set(key, t);
      if (this.cache.size > 12) this.cache.delete(this.cache.keys().next().value);
    }
    return t;
  }
  // טבלה לשעה h (לפי הקווים שפועלים באמצע השעה)
  tableAtHour(h) { return this.table(h * 3600 + 1800); }

  // סיכומים לפי שעה, מחושבים פעם אחת לכל שינוי ברשת:
  //   lineWant[id][h] — כמה ירצו לעלות לקו בשעה h (כאילו הוא פועל כל היממה)
  //   pairs — זוגות אזורים בלי שום חיבור (ליממה), מהגדול לקטן
  summary() {
    if (this.sums) return this.sums;
    const D = this.D, N = D.N, Z = D.Z, all = this.table(null);
    const lineWant = {};
    for (const L of all.lines) lineWant[L.id] = new Float64Array(24);
    const noConn = new Float64Array(Z * Z), dayZ = new Float64Array(Z * Z);
    for (let h = 0; h < 24; h++) {
      const R = D.hour[h];
      for (let k = 0; k < N * N; k++) {
        const r = R[k]; if (!r) continue;
        const zk = D.zoneOf[(k / N) | 0] * Z + D.zoneOf[k % N];
        dayZ[zk] += r;
        const legs = all.legs[k];
        if (!legs) { noConn[zk] += r; continue; }
        const v = r * all.p[k];
        for (const g of legs) lineWant[g.L.id][h] += v;
      }
    }
    const pairs = [];
    for (let i = 0; i < Z; i++) for (let j = i + 1; j < Z; j++) {
      const n = noConn[i * Z + j] + noConn[j * Z + i], tot = dayZ[i * Z + j] + dayZ[j * Z + i];
      if (n >= 5) pairs.push({ a: i, b: j, n, tot });
    }
    pairs.sort((x, y) => y.n - x.n);
    let noDay = 0; for (const v of noConn) noDay += v;
    return (this.sums = { lineWant, pairs, noDay });
  }
  // לשעה h: לכל זוג אזורים — נסיעות לשעה, כמה מהן יש להן חיבור, וכמה צפויים לנסוע בפועל
  zoneFlows(h) {
    const D = this.D, N = D.N, Z = D.Z, T = this.tableAtHour(h), R = D.hour[h];
    const pot = new Float64Array(Z * Z), cov = new Float64Array(Z * Z), ride = new Float64Array(Z * Z);
    for (let k = 0; k < N * N; k++) {
      const r = R[k]; if (!r) continue;
      const zk = D.zoneOf[(k / N) | 0] * Z + D.zoneOf[k % N];
      pot[zk] += r;
      if (T.legs[k] && T.p[k] >= 0.1) cov[zk] += r;
      ride[zk] += r * T.p[k];
    }
    return { pot, cov, ride };
  }
}
