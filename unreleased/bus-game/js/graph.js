// רשת הנסיעה: מסלול קצר ביותר בין תחנות (Dijkstra על רשת OSM מכוונת), וכלים לקו שבור
export class RoadGraph {
  constructor(city) {
    this.nodes = city.nodes;              // [x,y,...]
    this.edges = city.edges;              // [a,b,...]
    this.cls = city.edgeCls || '';        // סוג הרחוב לכל קשת (n = צר)
    const N = this.nodes.length / 2;
    this.N = N;
    this.out = Array.from({ length: N }, () => []);
    for (let e = 0; e < this.edges.length / 2; e++) {
      const a = this.edges[2 * e], b = this.edges[2 * e + 1];
      this.out[a].push([b, this.len(a, b), e]);
    }
  }
  narrow(e) { return this.cls[e] === 'n'; }
  xy(i) { return [this.nodes[2 * i], this.nodes[2 * i + 1]]; }
  len(a, b) { const [ax, ay] = this.xy(a), [bx, by] = this.xy(b); return Math.hypot(bx - ax, by - ay); }
  edge(e) { return [this.edges[2 * e], this.edges[2 * e + 1]]; }
  // הנקודה של תחנה על הקשת שלה
  stopPoint(stop) {
    const [a, b] = this.edge(stop.e), [ax, ay] = this.xy(a), [bx, by] = this.xy(b);
    return [ax + (bx - ax) * stop.t, ay + (by - ay) * stop.t];
  }

  dijkstra(src, dst) {
    if (src === dst) { const p = [src]; p.edges = []; return p; }
    const N = this.N, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), prevE = new Int32Array(N).fill(-1);
    const heap = new MinHeap();
    dist[src] = 0; heap.push(0, src);
    const [tx, ty] = this.xy(dst);
    while (heap.size) {
      const [d, v] = heap.pop();
      if (v === dst) break;
      if (d > dist[v] + 1e-9) continue;
      for (const [w, l, e] of this.out[v]) {
        const nd = dist[v] + l;
        if (nd < dist[w]) { dist[w] = nd; prev[w] = v; prevE[w] = e; heap.push(nd, w); }
      }
    }
    if (!isFinite(dist[dst])) return null;
    const path = [], pe = [];
    for (let v = dst; v !== -1; v = prev[v]) { path.push(v); if (prevE[v] >= 0) pe.push(prevE[v]); }
    path.reverse(); path.edges = pe.reverse();
    return path;
  }

  // מסלול מתחנה לתחנה: מנקודת התחנה קדימה לסוף הקשת, Dijkstra, ומתחילת הקשת של היעד אל נקודת היעד.
  // narrowM: כמה מטרים מהקטע עוברים ברחובות צרים
  route(sA, sB) {
    const pA = this.stopPoint(sA), pB = this.stopPoint(sB);
    const [a1, b1] = this.edge(sA.e), [a2] = this.edge(sB.e);
    const elen = e => this.len(...this.edge(e));
    if (sA.e === sB.e && sB.t >= sA.t) { const r = [pA, pB]; r.narrowM = this.narrow(sA.e) ? elen(sA.e) * (sB.t - sA.t) : 0; return r; }
    const mid = this.dijkstra(b1, a2);
    if (!mid) return null;
    const r = [pA, ...mid.map(v => this.xy(v)), pB];
    r.narrowM = (this.narrow(sA.e) ? elen(sA.e) * (1 - sA.t) : 0) + (this.narrow(sB.e) ? elen(sB.e) * sB.t : 0)
      + mid.edges.reduce((a, e) => a + (this.narrow(e) ? elen(e) : 0), 0);
    return r;
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
