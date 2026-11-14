// מטיילים במרכזים המסחריים: כמה הולכי רגל שהולכים לאט על המדרכות ובשבילים שליד המרכז, נעצרים ומסתכלים סביב.
// אותו מנגנון של הולכי הרגל בתחנות (CrowdLayer.walk ב-actors.js, מצב 'stroll'). הם לא נוסעים ולא משפיעים על הסימולציה.
// כמות מתונה (עד MAX בכל העיר), ורק במרכז שהמצלמה קרובה אליו — בגלל הביצועים.
import * as THREE from 'three';
const MAX = 6, NEAR = 380, STEP = 14;
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export class Strollers {
  constructor(city, people, camera) {
    this.people = people; this.camera = camera; this.t = 0; this.n = 0;
    // לכל מרכז מסחרי: הרחובות והשבילים שבתוכו ולידו (לא כבישים ראשיים), שאפשר לטייל לאורכם
    this.places = (city.places || []).filter(p => p.kind === 'mall').map(p => ({ ...p, roads: city.roads.filter(r => r.cls !== 'm' && r.pts.length > 1 && r.pts.some(q => Math.hypot(q[0] - p.x, q[1] - p.y) < p.r + 35)).map(r => {
      const len = [0]; for (let k = 1; k < r.pts.length; k++) len.push(len[k - 1] + Math.hypot(r.pts[k][0] - r.pts[k - 1][0], r.pts[k][1] - r.pts[k - 1][1])); return { pts: r.pts, len, off: r.cls === 'f' ? 0 : r.w / 2 + 1.3 }; }).filter(r => r.len[r.len.length - 1] > 30) })).filter(p => p.roads.length);
  }
  at(r, d, side) {
    const L = r.len, T = L[L.length - 1]; d = Math.max(0, Math.min(T, d)); let k = 1; while (k < L.length - 1 && L[k] < d) k++;
    const a = r.pts[k - 1], b = r.pts[k], sl = L[k] - L[k - 1] || 1, t = (d - L[k - 1]) / sl, nx = -(b[1] - a[1]) / sl, ny = (b[0] - a[0]) / sl;
    return new THREE.Vector3(a[0] + (b[0] - a[0]) * t + nx * r.off * side, 0.14, -(a[1] + (b[1] - a[1]) * t + ny * r.off * side));
  }
  count() { let n = 0; for (const w of this.people.walkers) if (w.mode === 'stroll') n++; return n; }
  update(dt) {
    this.t += dt; if (this.t < 1.2 || !this.places.length) return; this.t = 0;
    const c = this.camera.getWorldPosition(new THREE.Vector3()), near = this.places.filter(p => Math.hypot(p.x - c.x, -p.y - c.z) < p.r + NEAR && c.y < 500);
    if (!near.length || this.count() >= MAX) return;
    const id = 8000000 + (this.n++), P = near[Math.floor(hash(id) * near.length)], r = P.roads[Math.floor(hash(id + 0.3) * P.roads.length)], T = r.len[r.len.length - 1];
    const dir = hash(id + 0.5) < 0.5 ? 1 : -1, side = hash(id + 0.7) < 0.5 ? 1 : -1, d0 = hash(id + 0.9) * T, pts = [];
    for (let k = 0; k < 5; k++) { const d = d0 + dir * k * STEP; if (d < 0 || d > T) break; const q = this.at(r, d, side); if (Math.hypot(q.x - P.x, q.z + P.y) > P.r + 45) break; pts.push(q); }
    if (pts.length < 3) return;
    const w = this.people.walk(id, pts, 'stroll', null); if (w) { w.speed = 0.7; w.pause = 0; w.lastSeg = 0; if (w.mixer) w.mixer.timeScale = 0.6; }
  }
}
