// הולכים מהבית לתחנה, ומהתחנה הביתה או למרכז המסחרי: תושב שעומד לנסוע יוצא מהבניין שלו (homes.js) והולך ברחובות עד
// התחנה, ומגיע בדיוק כשהסימולציה מוסיפה אותו לתור (sim.js מגריל את הנסיעה 4 דקות מראש — COMMUTE_LOOK). מי שיורד בסוף
// הנסיעה ליד הבית או ליד מרכז מסחרי — הולך לשם. רק ליד המצלמה (NEAR) ועד MAX הולכים בבת אחת, בגלל הביצועים; רחוק מהמצלמה
// הנוסע מופיע בתחנה כמו קודם. הסימולציה עצמה לא תלויה בזה. אותו מנגנון של הולכי הרגל (CrowdLayer.walk, מצב 'commute').
import * as THREE from 'three';
import { offsetRight } from './graph.js';
const NEAR = 300, MAX = 10, SPEED = 1.35, SIDE = 3.4, MAXLEN = 650;
export class Commuters {
  constructor(g) {          // g: { city, sim, people, camera, homes(), residents(), demand }
    this.g = g; this.act = []; this.later = []; this.t = 0;
    const n = g.city.nodes.length / 2, E = g.city.edges; this.adj = Array.from({ length: n }, () => []);
    for (let i = 0; i < E.length; i += 2) { const a = E[i], b = E[i + 1], d = Math.hypot(g.city.nodes[2 * a] - g.city.nodes[2 * b], g.city.nodes[2 * a + 1] - g.city.nodes[2 * b + 1]); this.adj[a].push([b, d]); this.adj[b].push([a, d]); }
  }
  nearest(x, y) { const N = this.g.city.nodes; let best = -1, bd = Infinity; for (let i = 0; i < N.length; i += 2) { const d = (N[i] - x) ** 2 + (N[i + 1] - y) ** 2; if (d < bd && this.adj[i / 2].length) { bd = d; best = i / 2; } } return best; }
  // המסלול ברחובות מנקודה לנקודה (Dijkstra על רשת הרחובות), בצד הימני של הרחוב — על המדרכה. [[x, y], ...] או null
  route(ax, ay, bx, by) {
    const N = this.g.city.nodes, s = this.nearest(ax, ay), t = this.nearest(bx, by); if (s < 0 || t < 0) return null;
    const dist = new Map([[s, 0]]), prev = new Map(), open = [[0, s]], done = new Set();
    while (open.length) { let mi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[mi][0]) mi = i; const [d, u] = open.splice(mi, 1)[0]; if (done.has(u)) continue; done.add(u); if (u === t) break; if (d > MAXLEN) return null;
      for (const [v, w] of this.adj[u]) { const nd = d + w; if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, u); open.push([nd, v]); } } }
    if (!done.has(t)) return null;
    const mid = []; for (let u = t; u !== undefined; u = prev.get(u)) mid.push([N[2 * u], N[2 * u + 1]]); mid.reverse();
    let pts = mid.length > 1 ? offsetRight(mid, SIDE) : mid; pts = [[ax, ay], ...pts, [bx, by]].filter((p, i, a) => !i || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 0.6);
    return pts.length > 1 ? pts : null;
  }
  static len(pts) { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return l; }
  // מדלגים על skip המטרים הראשונים (מי שכבר אמור להיות בדרך נכנס למסלול באמצע)
  static trim(pts, skip) { const out = pts.map(p => [...p]); while (out.length > 2 && skip > 0) { const d = Math.hypot(out[1][0] - out[0][0], out[1][1] - out[0][1]); if (d > skip) { const k = skip / d; out[0] = [out[0][0] + (out[1][0] - out[0][0]) * k, out[0][1] + (out[1][1] - out[0][1]) * k]; break; } skip -= d; out.shift(); } return out; }
  start(id, pts, due, info) {
    const w = this.g.people.walk(id, pts.map(p => new THREE.Vector3(p[0], 0.14, -p[1])), 'commute', null); if (!w) return null;
    w.speed = SPEED; const c = { w, id, due, ...info }; this.act.push(c); return c;
  }
  update(dt) {
    const { sim, people, camera } = this.g, R = this.g.residents(), H = this.g.homes(), cam = camera.getWorldPosition(new THREE.Vector3());
    const near = s => Math.hypot(s.x - cam.x, -s.y - cam.z) < NEAR && cam.y < 420;
    // מי שירד בסוף הנסיעה ליד הבית שלו או ליד מרכז מסחרי — הולך לשם (אחרי שירד מהאוטובוס)
    if (R && H) for (const ev of sim.events) { if (ev.type !== 'alight' || !ev.p || ev.p.role || ev.p.wrap || ev.p.leg + 1 < (ev.p.legs?.length || 1) || !near(ev.stop) || this.act.length + this.later.length >= MAX) continue;
      const p = ev.p, home = p.who >= 0 && p.d === R.home[p.who] ? H.homeOf(p.who, p.d) : null, mall = home ? null : p.d >= 0 ? H.mallNear(p.d) : null, to = home || mall; if (!to) continue;
      this.later.push({ at: sim.time + 4, p, stop: ev.stop, to, home: !!home }); }
    this.t += dt; if (this.t < 0.4) return; this.t = 0;
    // ההולכים הפעילים: מי שסיים — יוצא מהרשימה; השאר מתאימים את הקצב כדי להגיע בזמן
    this.act = this.act.filter(c => { const w = c.w; if (w.pid !== c.id || w.mode !== 'commute' || !people.walkers.includes(w)) return false;
      let rem = w.lens[w.seg] - w.d; for (let k = w.seg + 1; k < w.lens.length; k++) rem += w.lens[k]; c.rem = rem;
      if (c.due != null) w.speed = Math.max(0.9, Math.min(2.6, rem / Math.max(1, c.due - sim.time))); return true; });
    if ((sim.speed || 1) > 10) { this.later.length = 0; return; }
    this.later = this.later.filter(x => { if (sim.time < x.at) return true; const pts = this.route(x.stop.x, x.stop.y, x.to.x, x.to.y); if (pts && this.act.length < MAX) this.start(x.p.id, pts, null, { who: x.p.who, o: x.p.o, d: x.p.d, legs: x.p.legs, stop: x.stop, from: true }); return false; });
    const U = sim.upcoming(); if (!U || !R || !H) return;
    for (let i = U.from; i < U.to && this.act.length < MAX; i++) { const e = U.S[i]; if (e[6]) continue;
      const who = e[3]; if (!(who >= 0) || R.home[who] !== e[1]) { e[6] = 1; continue; }
      const legs = sim.preview(e); if (!legs) { e[6] = 1; continue; }
      const stop = legs[0].L.stops[legs[0].from]; if (!stop || !near(stop)) continue;
      const home = H.homeOf(who, e[1]), pts = home && this.route(home.x, home.y, stop.x, stop.y); if (!pts) { e[6] = 1; continue; }
      const due = U.base + e[0], L = Commuters.len(pts), left = due - sim.time; if (left > L / SPEED) continue;      // עוד לא יצא מהבית
      e[6] = 1; const rest = Commuters.trim(pts, L - Math.max(0, left) * SPEED); if (Commuters.len(rest) < 8) continue;
      this.start(e[5], rest, due, { who, o: e[1], d: e[2], legs, stop, from: false });
    }
  }
}
