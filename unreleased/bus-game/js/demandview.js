// שכבת הביקוש במפה: קווי רצון (מאיפה לאן) בין מרכזי האזורים. העובי — נסיעות לשעה, הצבע — כמה מזה יש לו חיבור בקווים.
// העובי בפיקסלים (לא במטרים), כך שהקווים קריאים בכל זום: shader קטן שמזיז כל קודקוד על המסך.
import * as THREE from 'three';
import { labelSprite } from './lines.js';

export const FLOW_COL = { good: '#16a34a', some: '#f59e0b', none: '#dc2626' };
export const flowClass = share => share >= 0.7 ? 'good' : share >= 0.2 ? 'some' : 'none';
const H = 26;                       // גובה הקווים מעל הקרקע (מ')

const vert = `
attribute vec3 color; attribute vec3 dir; attribute vec2 off;
uniform vec2 res;
varying vec3 vCol;
void main() {
  vec4 a = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec4 b = projectionMatrix * modelViewMatrix * vec4(position + dir, 1.0);
  vec2 sa = a.xy / a.w * res, sb = b.xy / b.w * res;
  vec2 t = normalize(sb - sa + vec2(1e-5, 0.0)), n = vec2(-t.y, t.x);
  vec2 o = (t * off.x + n * off.y) * 0.5;      // בפיקסלים של CSS
  a.xy += o / res * a.w;
  vCol = color;
  gl_Position = a;
}`;
const frag = `varying vec3 vCol; uniform float alpha; void main() { gl_FragColor = vec4(vCol, alpha); }`;

export class DemandLayer {
  constructor(scene, zones) {
    this.group = new THREE.Group(); this.group.visible = false; this.group.name = 'demand-layer';
    scene.add(this.group);
    this.mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, transparent: true, depthTest: false, depthWrite: false,
      uniforms: { res: { value: new THREE.Vector2(400, 400) }, alpha: { value: 0.78 } }, side: THREE.DoubleSide });
    this.mesh = null;
    this.labels = new THREE.Group(); this.group.add(this.labels);
    for (const z of zones) {
      const sp = labelSprite(z.name, 'rgba(15,23,42,.82)', 0.5);
      sp.position.set(z.x, H + 6, -z.y); sp.renderOrder = 12; this.labels.add(sp);
    }
    this.zones = zones;
  }
  setVisible(v) { this.group.visible = v; }
  resize(w, h) { this.mat.uniforms.res.value.set(w / 2, h / 2); }
  // flows: [{a, b, rate, share}] — a,b אינדקסים של אזורים; maxRate לקנה המידה
  set(flows, maxRate) {
    if (this.mesh) { this.group.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; }
    if (!flows.length) return;
    const pos = [], dir = [], off = [], col = [], c = new THREE.Color();
    const push = (p, d, ox, oy) => { pos.push(p.x, p.y, p.z); dir.push(d.x, d.y, d.z); off.push(ox, oy); col.push(c.r, c.g, c.b); };
    for (const f of flows) {
      const A = this.zones[f.a], B = this.zones[f.b];
      const ax = A.x, ay = A.y, bx = B.x, by = B.y, L = Math.hypot(bx - ax, by - ay) || 1;
      // קשת שנוטה ימינה לכיוון הנסיעה — כך הלוך וחזור לא מסתירים זה את זה
      const nx = (by - ay) / L, ny = -(bx - ax) / L, bend = Math.min(0.22 * L, 260);
      const mx = (ax + bx) / 2 + nx * bend, my = (ay + by) / 2 + ny * bend;
      const w = 1.5 + 8.5 * Math.sqrt(f.rate / maxRate);   // עובי בפיקסלים
      c.set(FLOW_COL[flowClass(f.share)]);
      const pts = [], S = 20, t0 = 0.08, t1 = 0.86;
      for (let i = 0; i <= S; i++) {
        const t = t0 + (t1 - t0) * i / S, u = 1 - t;
        pts.push(new THREE.Vector3(u * u * ax + 2 * u * t * mx + t * t * bx, H, -(u * u * ay + 2 * u * t * my + t * t * by)));
      }
      for (let i = 0; i < S; i++) {
        const p0 = pts[i], p1 = pts[i + 1], d = p1.clone().sub(p0);
        push(p0, d, 0, w); push(p0, d, 0, -w); push(p1, d, 0, -w);
        push(p0, d, 0, w); push(p1, d, 0, -w); push(p1, d, 0, w);
      }
      // ראש חץ בסוף
      const e = pts[S], d = e.clone().sub(pts[S - 1]), hw = w + 8, len = 2 * (w + 7);
      push(e, d, 0, hw); push(e, d, 0, -hw); push(e, d, len, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('dir', new THREE.Float32BufferAttribute(dir, 3));
    g.setAttribute('off', new THREE.Float32BufferAttribute(off, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 11;
    this.group.add(this.mesh);
  }
}
