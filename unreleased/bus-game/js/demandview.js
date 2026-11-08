// שכבת הביקוש במפה ("מאיפה לאן"): קו אחד בין כל שתי שכונות (שני הכיוונים יחד), עיגול לכל שכונה לפי כמה נוסעים יוצאים ממנה ונכנסים אליה,
// ומספר על הקווים הגדולים. העיצוב לפי כללי ויזואליזציה:
//  - הדגשה: רק מה שצריך פעולה בולט — "אין קו" (אדום) ו"חלקי" (כתום); "יש קו" בצבע אפור שקט.
//  - מעט קווים כברירת מחדל (10 הגדולים), ומספרים רק על הגדולים.
//  - העיר מתחת מתעמעמת (שכבה לבנה שקופה), כדי שהקווים יבלטו.
// העובי בפיקסלים (לא במטרים), כך שהקווים קריאים בכל זום: shader קטן שמזיז כל קודקוד על המסך.
import * as THREE from 'three';
import { labelSprite } from './lines.js';

// צבעי מצב (status palette) — תמיד יחד עם סמל ותווית במקרא, אף פעם לא צבע לבד
export const FLOW_COL = { none: '#d03b3b', some: '#ec835a', good: '#94a3b8' };
export const FLOW_ICON = { none: '✕', some: '½', good: '✓' };
export const FLOW_TXT = { none: 'אין קו', some: 'חלקי', good: 'יש קו' };
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

// עיגול לשכונה: מילוי כהה עם טבעת לבנה (2px "רווח" מהקווים שמתחת)
function dotTexture(fill) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.beginPath(); g.arc(32, 32, 29, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
  g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.fillStyle = fill; g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class DemandLayer {
  constructor(scene, zones, half = [3000, 3000]) {
    this.group = new THREE.Group(); this.group.visible = false; this.group.name = 'demand-layer';
    scene.add(this.group);
    // העיר מתעמעמת מתחת לקווים
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(half[0] * 4, half[1] * 4),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthTest: false, depthWrite: false }));
    veil.rotation.x = -Math.PI / 2; veil.position.y = H - 4; veil.renderOrder = 9; this.group.add(veil);
    const mk = a => new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, transparent: true, depthTest: false, depthWrite: false,
      uniforms: { res: { value: new THREE.Vector2(400, 400) }, alpha: { value: a } }, side: THREE.DoubleSide });
    this.mat = mk(0.92); this.halo = mk(0.95);
    this.meshes = [];
    this.zones = zones;
    this.dotTex = { base: dotTexture('#475569'), focus: dotTexture('#2a78d6') };
    this.dots = zones.map(z => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dotTex.base, depthTest: false, transparent: true, sizeAttenuation: false }));
      s.position.set(z.x, H + 1, -z.y); s.renderOrder = 13; this.group.add(s); return s;
    });
    this.names = new THREE.Group(); this.group.add(this.names);
    this.nums = new THREE.Group(); this.group.add(this.nums);
  }
  setVisible(v) { this.group.visible = v; }
  resize(w, h) { for (const m of [this.mat, this.halo]) m.uniforms.res.value.set(w / 2, h / 2); }
  screenOf(i, camera, rect) {
    const z = this.zones[i], v = new THREE.Vector3(z.x, H + 1, -z.y).project(camera);
    return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height, ok: v.z < 1 };
  }
  // flows: [{a, b, rate, share}] — שכונות a,b (בלי כיוון), rate נסיעות בשעה בשני הכיוונים.
  // zoneTot: נסיעות בשעה לכל שכונה; focus: שכונה מודגשת או null; labelled: כמה קווים מקבלים מספר
  set({ flows, maxRate, zoneTot, maxTot, focus = null, labelled = 5 }) {
    for (const m of this.meshes) { this.group.remove(m); m.geometry.dispose(); }
    this.meshes = [];
    this.nums.clear(); this.names.clear();
    // שכונות: עיגול לפי סך הנסיעות, שם מעל
    this.zones.forEach((z, i) => {
      const t = zoneTot[i] || 0, s = this.dots[i], dim = focus != null && i !== focus && !flows.some(f => f.a === i || f.b === i);
      const r = 0.014 + 0.02 * Math.sqrt(t / (maxTot || 1));
      s.scale.set(r, r, 1); s.material.map = i === focus ? this.dotTex.focus : this.dotTex.base;
      s.material.opacity = dim ? 0.35 : 1; s.material.needsUpdate = true;
      if (dim) return;
      const lab = labelSprite(i === focus ? `${z.name} · ${Math.round(t).toLocaleString('en-US')}` : z.name,
        i === focus ? '#2a78d6' : 'rgba(255,255,255,.96)', 0.5, i === focus ? '#fff' : '#0f172a');
      lab.position.set(z.x, H + 2, -z.y); lab.center.set(0.5, -0.9); lab.renderOrder = 14; this.names.add(lab);
    });
    if (!flows.length) return;
    // מהקטן לגדול, כך שהגדולים מצוירים מעל
    const order = flows.slice().sort((a, b) => a.rate - b.rate);
    const line = (halo) => {
      const pos = [], dir = [], off = [], col = [], c = new THREE.Color();
      const push = (p, d, ox, oy) => { pos.push(p.x, p.y, p.z); dir.push(d.x, d.y, d.z); off.push(ox, oy); col.push(c.r, c.g, c.b); };
      for (const f of order) {
        const A = this.zones[f.a], B = this.zones[f.b];
        const ax = A.x, ay = A.y, bx = B.x, by = B.y, L = Math.hypot(bx - ax, by - ay) || 1;
        // קשת עדינה, כדי שקווים שעוברים באותה שכונה לא יתלכדו
        const nx = (by - ay) / L, ny = -(bx - ax) / L, bend = Math.min(0.1 * L, 140);
        const mx = (ax + bx) / 2 + nx * bend, my = (ay + by) / 2 + ny * bend;
        const w = 1.5 + 7.5 * Math.sqrt(f.rate / maxRate) + (halo ? 2.5 : 0);
        c.set(halo ? '#ffffff' : FLOW_COL[flowClass(f.share)]);
        const pts = [], S = 18;
        for (let i = 0; i <= S; i++) {
          const t = i / S, u = 1 - t;
          pts.push(new THREE.Vector3(u * u * ax + 2 * u * t * mx + t * t * bx, H, -(u * u * ay + 2 * u * t * my + t * t * by)));
        }
        f.mid = pts[S >> 1];
        for (let i = 0; i < S; i++) {
          const p0 = pts[i], p1 = pts[i + 1], d = p1.clone().sub(p0);
          push(p0, d, 0, w); push(p0, d, 0, -w); push(p1, d, 0, -w);
          push(p0, d, 0, w); push(p1, d, 0, -w); push(p1, d, 0, w);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('dir', new THREE.Float32BufferAttribute(dir, 3));
      g.setAttribute('off', new THREE.Float32BufferAttribute(off, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const m = new THREE.Mesh(g, halo ? this.halo : this.mat); m.frustumCulled = false; m.renderOrder = halo ? 10 : 11;
      this.group.add(m); this.meshes.push(m);
    };
    line(true); line(false);
    // מספר (נסיעות בשעה) רק על הקווים הגדולים
    flows.slice().sort((a, b) => b.rate - a.rate).slice(0, labelled).forEach(f => {
      const sp = labelSprite(Math.round(f.rate).toLocaleString('en-US'), '#0f172a', 0.42);
      sp.position.copy(f.mid).setY(H + 1.5); sp.renderOrder = 15; this.nums.add(sp);
    });
  }
}
