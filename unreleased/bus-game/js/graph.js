// רשת הנסיעה: מסלול קצר ביותר בין תחנות (Dijkstra על רשת OSM מכוונת), וכלים לקו שבור
export class RoadGraph {
  constructor(city) {
    this.nodes = city.nodes;              // [x,y,...]
    this.edges = city.edges;              // [a,b,...]
    const N = this.nodes.length / 2;
    this.N = N;
    this.E = this.edges.length / 2;
    this.out = Array.from({ length: N }, () => []);
    for (let e = 0; e < this.E; e++) {
      const a = this.edges[2 * e], b = this.edges[2 * e + 1];
      this.out[a].push([b, this.len(a, b), e]);
    }
    this.uturnAt = this.findTurnarounds(city.roads || []);
  }
  // איפה מותר לאוטובוס להסתובב (פרסה): רק בצומת גדולה — 3 רחובות או יותר שאחד מהם ראשי או רחב (9 מ' ומעלה).
  // בכיכר לא צריך פרסה: הכיכר חד-סטרית, והאוטובוס מקיף אותה. ברחוב רגיל או ברחוב ללא מוצא — אסור
  findTurnarounds(roads) {
    const N = this.N, key = (x, y) => Math.round(x * 10) + ',' + Math.round(y * 10), at = new Map();
    for (let i = 0; i < N; i++) at.set(key(this.nodes[2 * i], this.nodes[2 * i + 1]), i);
    const wide = new Uint8Array(N);
    for (const r of roads) {
      if (r.cls === 'f' || !(r.cls === 'm' || r.w >= 9)) continue;
      for (const [x, y] of r.pts) { const i = at.get(key(x, y)); if (i !== undefined) wide[i] = 1; }
    }
    const nb = Array.from({ length: N }, () => new Set());
    for (let e = 0; e < this.E; e++) { const a = this.edges[2 * e], b = this.edges[2 * e + 1]; nb[a].add(b); nb[b].add(a); }
    const ok = new Uint8Array(N);
    for (let i = 0; i < N; i++) ok[i] = nb[i].size >= 3 && wide[i] ? 1 : 0;
    // זנב קצרצר של רחוב במפה (פחות מ-20 מ') שתחנה נצמדה אליו — בפועל זה חלק מהצומת, לא רחוב ללא מוצא
    // (מותר להסתובב שם רק כשהתחנה עצמה על הזנב — ראו route)
    this.stub = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (nb[i].size === 1) { const [j] = nb[i]; if (this.len(i, j) < 20) this.stub[i] = 1; }
    return ok;
  }
  xy(i) { return [this.nodes[2 * i], this.nodes[2 * i + 1]]; }
  len(a, b) { const [ax, ay] = this.xy(a), [bx, by] = this.xy(b); return Math.hypot(bx - ax, by - ay); }
  edge(e) { return [this.edges[2 * e], this.edges[2 * e + 1]]; }
  // הנקודה של תחנה על הקשת שלה
  stopPoint(stop) {
    const [a, b] = this.edge(stop.e), [ax, ay] = this.xy(a), [bx, by] = this.xy(b);
    return [ax + (bx - ax) * stop.t, ay + (by - ay) * stop.t];
  }

  // Dijkstra על קשתות (לא על צמתים), כדי לדעת מאיפה הגענו: אסור לחזור באותו רחוב (פרסה), חוץ מבצומת גדולה
  route(sA, sB) {
    const pA = this.stopPoint(sA), pB = this.stopPoint(sB);
    if (sA.e === sB.e && sB.t >= sA.t) return [pA, pB];
    const E = this.E, dist = new Float64Array(E).fill(Infinity), prev = new Int32Array(E).fill(-1);
    const heap = new MinHeap(), [a1, b1] = this.edge(sA.e);
    const L1 = this.len(a1, b1) * (1 - sA.t);
    const relax = (from, u, v, d) => {
      for (const [w, l, e] of this.out[v]) {
        if (w === u && !this.uturnAt[v] && !(this.stub[v] && (e === sB.e || from === -1))) continue;
        if (d + l < dist[e]) { dist[e] = d + l; prev[e] = from; heap.push(d + l, e); }
      }
    };
    relax(-1, a1, b1, L1);
    let found = false;
    while (heap.size) {
      const [d, e] = heap.pop();
      if (d > dist[e] + 1e-9) continue;
      if (e === sB.e) { found = true; break; }
      const [u, v] = this.edge(e);
      relax(e, u, v, d);
    }
    if (!found) return null;
    const chain = []; for (let e = sB.e; e !== -1; e = prev[e]) chain.push(e);
    chain.reverse();
    // הצמתים: סוף הקשת של התחנה הראשונה, ואחריו תחילת כל קשת בשרשרת
    const mid = chain.map(e => this.xy(this.edge(e)[0]));
    return [pA, ...mid, pB];
  }
}

class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(k, v) {
    const K = this.k, Vv = this.v; let i = K.length; K.push(k); Vv.push(v);
    while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= K[i]) break;[K[p], K[i]] = [K[i], K[p]];[Vv[p], Vv[i]] = [Vv[i], Vv[p]]; i = p; }
  }
  pop() {
    const K = this.k, Vv = this.v, top = [K[0], Vv[0]], lk = K.pop(), lv = Vv.pop();
    if (K.length) {
      K[0] = lk; Vv[0] = lv; let i = 0;
      for (; ;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < K.length && K[l] < K[m]) m = l; if (r < K.length && K[r] < K[m]) m = r;
        if (m === i) break;[K[m], K[i]] = [K[i], K[m]];[Vv[m], Vv[i]] = [Vv[i], Vv[m]]; i = m;
      }
    }
    return top;
  }
}

// ---------- קו שבור עם מרחק מצטבר
export function dedupe(pts) {
  const out = [];
  for (const p of pts) { const q = out[out.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.05) out.push(p); }
  return out;
}

// הזזה ימינה (נסיעה בימין) — נתיב האוטובוס, לא קו המרכז של הכביש
export function offsetRight(pts, d) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let d1x = p[0] - a[0], d1y = p[1] - a[1], d2x = b[0] - p[0], d2y = b[1] - p[1];
    const l1 = Math.hypot(d1x, d1y) || 1, l2 = Math.hypot(d2x, d2y) || 1;
    d1x /= l1; d1y /= l1; d2x /= l2; d2y /= l2;
    if (i === 0) { d1x = d2x; d1y = d2y; } if (i === n - 1) { d2x = d1x; d2y = d1y; }
    let nx = (d1y + d2y), ny = -(d1x + d2x);
    const nl = Math.hypot(nx, ny);
    if (nl < 0.2) { out.push([p[0] + d1y * d, p[1] - d1x * d]); continue; }     // פניית פרסה
    nx /= nl; ny /= nl;
    const cos = nx * d1y + ny * -d1x;
    const k = Math.min(2.2, 1 / Math.max(0.3, cos));
    out.push([p[0] + nx * d * k, p[1] + ny * d * k]);
  }
  return out;
}

export class Polyline {
  constructor(pts) {
    this.pts = pts; this.cum = [0];
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    this.length = this.cum[this.cum.length - 1];
  }
  // נקודה במרחק s, וכיוון
  at(s, out = [0, 0]) {
    const c = this.cum, n = c.length;
    s = Math.max(0, Math.min(this.length, s));
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
    const L = c[hi] - c[lo] || 1, t = (s - c[lo]) / L, a = this.pts[lo], b = this.pts[hi];
    out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t;
    return out;
  }
  // המרחק לאורך הקו של הנקודה הקרובה ביותר
  project(x, y) {
    let best = [Infinity, 0];
    for (let i = 0; i + 1 < this.pts.length; i++) {
      const [ax, ay] = this.pts[i], [bx, by] = this.pts[i + 1];
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
      const d = Math.hypot(ax + dx * t - x, ay + dy * t - y);
      if (d < best[0]) best = [d, this.cum[i] + t * Math.sqrt(L2)];
    }
    return best[1];
  }
}

// פרופיל מהירות: האטה בפניות ועצירה בתחנות. מחזיר מערך מהירויות כל STEP מטרים
export function speedProfile(line, stopsS, cruise = 11, acc = 1.0, dec = 1.2, STEP = 2) {
  const n = Math.ceil(line.length / STEP) + 1, v = new Float32Array(n).fill(cruise);
  const P = line.pts;
  for (let i = 1; i + 1 < P.length; i++) {
    const a1 = Math.atan2(P[i][1] - P[i - 1][1], P[i][0] - P[i - 1][0]);
    const a2 = Math.atan2(P[i + 1][1] - P[i][1], P[i + 1][0] - P[i][0]);
    let da = Math.abs(a2 - a1); if (da > Math.PI) da = 2 * Math.PI - da;
    if (da < 0.15) continue;
    const lim = Math.max(2.8, cruise * (1 - da / 1.9));
    const k = Math.round(line.cum[i] / STEP);
    for (let j = Math.max(0, k - 3); j <= Math.min(n - 1, k + 3); j++) v[j] = Math.min(v[j], lim);
  }
  for (const s of stopsS) { const k = Math.round(s / STEP); if (k >= 0 && k < n) v[k] = 0; }
  v[0] = 0; v[n - 1] = 0;
  for (let i = n - 2; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * dec * STEP));
  for (let i = 1; i < n; i++) v[i] = Math.min(v[i], Math.sqrt(v[i - 1] ** 2 + 2 * acc * STEP));
  return { v, STEP, get(s) { const x = s / STEP, i = Math.floor(x), f = x - i; return i >= n - 1 ? v[n - 1] : v[i] * (1 - f) + v[i + 1] * f; } };
}
