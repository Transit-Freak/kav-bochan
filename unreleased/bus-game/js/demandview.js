// שכבת הביקוש במפה ("מאיפה לאן"), לפי שכונות:
//  - כל שכונה מצוירת בגבולות האמיתיים שלה (מפ"י / GovMap; המושבים — OSM), בגוון רך לפי השימוש העיקרי
//    (מגורים / עבודה / לימודים / מסחר — משני, גם במילים), עם רווח לבן דק בין שכנות.
//  - לכל שכונה סמל משלה (צורה), והוא מסמן אותה בכל מקום: הסיכה במפה, הכרטיס, סמלי הביקוש, החיצים והטבלה.
//  - מבט על: ליד כל שכונה — סמלים של שכונות היעד (הסמל של היעד עצמו), סמל אחד = U נוסעים בשעה.
//    המצב של כל יעד: מלא אדום — אין קו, חצי כתום — חלקי, חלול אפור — יש קו (צורה + מילוי, ובמקרא גם מילים — לא צבע לבד).
//  - הקשה על שכונה: חיצים ממנה ליעדים (או מהמקורות אליה), עובי לפי נוסעים בשעה, צבע לפי מצב הקו,
//    ובקצה כל חץ — כרטיס עם הסמל של מצב הקו, השם והמספר.
// החיצים והגבולות: עובי בפיקסלים (לא במטרים), כך שהם קריאים בכל זום — shader קטן שמזיז כל קודקוד על המסך.
// הסיכות, השמות והמספרים מצוירים על קנבס דו־ממדי מעל המפה, עם מניעת חפיפות.
import * as THREE from 'three';

// צבעי מצב (status palette) — תמיד יחד עם סמל ותווית במקרא, אף פעם לא צבע לבד
export const FLOW_COL = { none: '#d03b3b', some: '#ec835a', good: '#94a3b8' };
export const FLOW_ICON = { none: '✕', some: '½', good: '✓' };
export const FLOW_TXT = { none: 'אין קו', some: 'חלקי', good: 'יש קו' };
export const flowClass = share => share >= 0.7 ? 'good' : share >= 0.2 ? 'some' : 'none';
const FILL = { none: 1, some: 0.5, good: 0 };       // כמה מהסמל ממולא: מלא / חצי / חלול
const INK = '#0f172a', INK2 = '#334155';
const FONT = 'Heebo, "IBM Plex Sans Hebrew", Arial, sans-serif';

// סוג השכונה (משני): גוון רך של השטח, ותמיד גם במילים. פלטה קטגורית שנבדקה ב-validate_palette (כל הזוגות;
// CVD בטווח 6–8 בין מסחר ללימודים — לכן תמיד גם מילים במקרא ובכרטיס)
export const ZTYPES = [
  { txt: 'מגורים', short: 'מגורים', col: '#eda100' },
  { txt: 'עבודה ותעשייה', short: 'עבודה', col: '#2a78d6' },
  { txt: 'לימודים', short: 'לימודים', col: '#1baf7a' },
  { txt: 'מסחר', short: 'מסחר', col: '#e87ba4' },
];

// ---------- הצורות: נתיבי SVG בתיבה 24×24 — אותו ציור במפה (Path2D) ובממשק (svg)
const f1 = v => +v.toFixed(2);
const reg = (n, r, cy = 12, rot = -90) => 'M' + Array.from({ length: n }, (_, k) => {
  const a = (rot + k * 360 / n) * Math.PI / 180; return `${f1(12 + r * Math.cos(a))} ${f1(cy + r * Math.sin(a))}`; }).join('L') + 'z';
const star = (R, r, cy) => 'M' + Array.from({ length: 10 }, (_, k) => {
  const a = (-90 + k * 36) * Math.PI / 180, q = k % 2 ? r : R; return `${f1(12 + q * Math.cos(a))} ${f1(cy + q * Math.sin(a))}`; }).join('L') + 'z';
export const SHAPES = {
  circle: 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0z',
  triangle: 'M12 2L22.5 20.5H1.5z',
  square: 'M3 3h18v18H3z',
  star: star(11.5, 4.9, 13),
  diamond: 'M12 1L23 12L12 23L1 12z',
  plus: 'M8.5 2h7v6.5H22v7h-6.5V22h-7v-6.5H2v-7h6.5z',
  heart: 'M12 21.5C5 16 1.5 12.2 1.5 7.8A5.3 5.3 0 0 1 12 5.6a5.3 5.3 0 0 1 10.5 2.2c0 4.4-3.5 8.2-10.5 13.7z',
  hexagon: reg(6, 11, 12, 0),
  crescent: 'M14.5 2.3A10 10 0 1 0 21.8 15.2A8 8 0 0 1 14.5 2.3z',
  drop: 'M12 1.5C12 1.5 4 10.5 4 15a8 8 0 0 0 16 0c0-4.5-8-13.5-8-13.5z',
  flag: 'M4 2h2.6v1.6H21l-4 5.2 4 5.2H6.6V22H4z',
  bolt: 'M14.5 1L3.5 13.5h7L8.5 23l12-13.5h-7z',
  tridown: 'M1.5 3.5h21L12 22z',
  xmark: 'M4.8 1.9L12 9.1l7.2-7.2 2.9 2.9-7.2 7.2 7.2 7.2-2.9 2.9-7.2-7.2-7.2 7.2-2.9-2.9 7.2-7.2-7.2-7.2z',
  hourglass: 'M3 2h18L12 12 21 22H3l9-10z',
  shield: 'M12 1.5L21 5v6.5c0 5.5-4 9-9 11-5-2-9-5.5-9-11V5z',
  semicircle: 'M1.5 17.5a10.5 10.5 0 0 1 21 0z',
  chevron: 'M12 3L22.5 13.5v7.5L12 10.5 1.5 21v-7.5z',
  pentagon: reg(5, 11.5, 13),
  leaf: 'M3 21C3 9 9 3 21 3c0 12-6 18-18 18z',
  tee: 'M2 3h20v6.5h-6.5V22h-7V9.5H2z',
  parallelogram: 'M7.5 4H23l-6.5 16H1z',
};
const PATHS = {};
if (typeof Path2D !== 'undefined') for (const k in SHAPES) PATHS[k] = new Path2D(SHAPES[k]);
// סמל כ-svg לממשק. fill: 1 מלא, 0.5 חצי, 0 חלול; col — צבע (ברירת מחדל: דיו)
let svgN = 0;
export function symSvg(sym, cls = '', fill = 1, col = INK2) {
  const d = SHAPES[sym] || SHAPES.circle;
  if (fill >= 1) return `<svg class="zg ${cls}" viewBox="-1 -1 26 26" aria-hidden="true"><path d="${d}" fill="${col}" stroke="${col}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  if (fill <= 0) return `<svg class="zg ${cls}" viewBox="-1 -1 26 26" aria-hidden="true"><path d="${d}" fill="#fff" stroke="${col}" stroke-width="2.6" stroke-linejoin="round"/></svg>`;
  const id = 'hf' + (++svgN);
  return `<svg class="zg ${cls}" viewBox="-1 -1 26 26" aria-hidden="true"><defs><clipPath id="${id}"><rect x="-1" y="12" width="26" height="14"/></clipPath></defs>`
    + `<path d="${d}" fill="#fff"/><path d="${d}" fill="${col}" clip-path="url(#${id})"/><path d="${d}" fill="none" stroke="${col}" stroke-width="2.6" stroke-linejoin="round"/></svg>`;
}
export const statusSvg = (k, sym = 'circle') => symSvg(sym, 'ss-' + k, FILL[k], FLOW_COL[k]);

const HH = 24;          // גובה השכבה מעל הקרקע (מ')

const vert = `
attribute vec3 color; attribute vec3 dir; attribute vec2 off;
uniform vec2 res;
varying vec3 vCol;
void main() {
  vec4 a = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec4 b = projectionMatrix * modelViewMatrix * vec4(position + dir, 1.0);
  vec2 sa = a.xy / a.w * res, sb = b.xy / b.w * res;
  vec2 t = normalize(sb - sa + vec2(1e-5, 0.0)), n = vec2(-t.y, t.x);
  vec2 o = (t * off.x + n * off.y) * 0.5;      // off בחצאי פיקסלים של CSS
  a.xy += o / res * a.w;
  vCol = color;
  gl_Position = a;
}`;
const frag = `varying vec3 vCol; uniform float alpha; void main() { gl_FragColor = vec4(vCol, alpha); }`;

// נקודה בתוך פוליגון (טבעת חיצונית וחורים)
function inRing(x, y, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [x0, y0] = r[i], [x1, y1] = r[j];
    if ((y0 > y) !== (y1 > y) && x < (x1 - x0) * (y - y0) / (y1 - y0) + x0) c = !c;
  }
  return c;
}
const inPart = (x, y, part) => inRing(x, y, part[0]) && !part.slice(1).some(h => inRing(x, y, h));
const ringArea = r => Math.abs(r.reduce((a, [x0, y0], i) => { const [x1, y1] = r[(i + 1) % r.length]; return a + x0 * y1 - x1 * y0; }, 0) / 2);

export class DemandLayer {
  // zones: demand.zones (עם type, sym, poly), stops: city.stops (עם zone)
  constructor(scene, zones, stops, buildings, half = [3000, 3000]) {
    this.group = new THREE.Group(); this.group.visible = false; this.group.name = 'demand-layer';
    scene.add(this.group);
    this.zones = zones; this.half = half;
    this.anchor = zones.map(z => [z.x, z.y]);
    this.area = zones.map(z => (z.poly || []).reduce((a, p) => a + ringArea(p[0]), 0));
    // העיר מתעמעמת מתחת
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(half[0] * 4, half[1] * 4),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.66, depthTest: false, depthWrite: false }));
    veil.rotation.x = -Math.PI / 2; veil.position.y = HH - 2; veil.renderOrder = 9; this.group.add(veil);
    const mk = a => new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, transparent: true, depthTest: false, depthWrite: false,
      uniforms: { res: { value: new THREE.Vector2(400, 400) }, alpha: { value: a } }, side: THREE.DoubleSide });
    this.mat = mk(0.92); this.halo = mk(0.95); this.lineMat = mk(1);
    this.meshes = []; this.built = false;
    // שכבה דו־ממדית מעל המפה: סיכות, שמות, סמלים ומספרים
    const cv = this.cv = document.createElement('canvas');
    cv.id = 'dOverlay'; cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;display:none';
    document.querySelector('#view').after(cv);
    this.state = null; this.drawKey = '';
  }

  // ---------- שטחי השכונות: פוליגון לכל שכונה, וקו לבן דק בין שכנות (בפיקסלים)
  buildAreas() {
    this.built = true;
    this.fills = this.zones.map(z => {
      const shapes = (z.poly || []).map(part => {
        const s = new THREE.Shape(part[0].map(([x, y]) => new THREE.Vector2(x, y)));
        for (const h of part.slice(1)) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
        return s;
      });
      const m = new THREE.Mesh(new THREE.ShapeGeometry(shapes),
        new THREE.MeshBasicMaterial({ color: ZTYPES[z.type]?.col || '#94a3b8', transparent: true, opacity: 0.2, depthTest: false, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.y = HH - 1; m.renderOrder = 10; m.frustumCulled = false;
      this.group.add(m); return m;
    });
    this.edges = this.ribbon(this.zones.flatMap(z => (z.poly || []).flat()), '#ffffff', 2.2, this.lineMat, 10.5);
    this.group.add(this.edges);
  }
  // קו בעובי קבוע בפיקסלים לאורך טבעות סגורות
  ribbon(rings, color, px, mat, order) {
    const pos = [], dir3 = [], off = [], col = [], c = new THREE.Color(color).convertLinearToSRGB(), W = px, E = px;
    const push = (x, y, d, ox, oy) => { pos.push(x, HH, -y); dir3.push(d[0], 0, -d[1]); off.push(ox, oy); col.push(c.r, c.g, c.b); };
    for (const r of rings) for (let i = 0; i < r.length; i++) {
      const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length], d = [x1 - x0, y1 - y0];
      if (!d[0] && !d[1]) continue;
      push(x0, y0, d, -E, W); push(x0, y0, d, -E, -W); push(x1, y1, d, E, -W);
      push(x0, y0, d, -E, W); push(x1, y1, d, E, -W); push(x1, y1, d, E, W);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('dir', new THREE.Float32BufferAttribute(dir3, 3));
    g.setAttribute('off', new THREE.Float32BufferAttribute(off, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = order;
    return m;
  }
  // גוון השטחים. strength: לכל שכונה 0..1 (null = כולן רגיל)
  paintAreas(strength) {
    this.fills.forEach((m, i) => { m.material.opacity = strength ? [0.06, 0.16, 0.3][strength[i]] : 0.2; });
  }

  setVisible(v) {
    if (v && !this.built) this.buildAreas();
    this.group.visible = v; this.cv.style.display = v ? 'block' : 'none'; this.drawKey = ''; }
  resize(w, h) { for (const m of [this.mat, this.halo, this.lineMat]) m.uniforms.res.value.set(w / 2, h / 2); this.drawKey = ''; }
  anchorV(i) { const [x, y] = this.anchor[i]; return new THREE.Vector3(x, HH, -y); }
  screenOf(i, camera, rect) {
    const v = this.anchorV(i).project(camera);
    return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height, ok: v.z < 1 };
  }
  // איזו שכונה בנקודה הזו על המסך: קודם סיכה קרובה, ואחר כך השטח עצמו (בשתי שכונות — הקטנה)
  pick(cx, cy, camera, rect, near = 26) {
    let best = null, bd = near;
    this.zones.forEach((z, i) => { const p = this.screenOf(i, camera, rect); if (!p.ok) return;
      const d = Math.hypot(p.x - cx, p.y - cy); if (d < bd) { bd = d; best = i; } });
    if (best != null) return best;
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((cx - rect.left) / rect.width * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1), camera);
    const p = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -(HH - 1)), p)) return null;
    const x = p.x, y = -p.z;
    let hit = null;
    this.zones.forEach((z, i) => { if ((z.poly || []).some(part => inPart(x, y, part)) && (hit == null || this.area[i] < this.area[hit])) hit = i; });
    return hit;
  }

  // מבט על: sym[i] = [{s, k}] — סמל היעד ומצב הקו (כבר חתוך למקסימום), more[i] — יש עוד
  setOverview({ sym, more }) {
    this.clearArrows(); if (this.built) this.paintAreas(null);
    this.state = { mode: 'over', sym, more }; this.drawKey = '';
  }
  // שכונה אחת: rows = [{z, rate, share}], dir 'out' | 'in', maxRate — לעובי
  setFocus({ focus, rows, dir, maxRate }) {
    this.clearArrows();
    const inv = new Set(rows.map(r => r.z));
    if (this.built) this.paintAreas(this.zones.map((_, i) => i === focus ? 2 : inv.has(i) ? 1 : 0));
    const order = rows.slice().sort((a, b) => a.rate - b.rate), arrows = [];
    const build = halo => {
      const pos = [], dir3 = [], off = [], col = [], c = new THREE.Color();
      const push = (p, d, ox, oy) => { pos.push(p.x, p.y, p.z); dir3.push(d.x, d.y, d.z); off.push(ox, oy); col.push(c.r, c.g, c.b); };
      for (const f of order) {
        const [ax, ay] = this.anchor[dir === 'out' ? focus : f.z], [bx, by] = this.anchor[dir === 'out' ? f.z : focus];
        const L = Math.hypot(bx - ax, by - ay) || 1;
        // קשת עדינה, כדי שחיצים לכיוונים קרובים לא יתלכדו
        const nx = (by - ay) / L, ny = -(bx - ax) / L, bend = Math.min(0.12 * L, 160);
        const mx = (ax + bx) / 2 + nx * bend, my = (ay + by) / 2 + ny * bend;
        const w = 2 * (0.75 + 2.75 * Math.sqrt(Math.min(1, f.rate / maxRate))), hw = halo ? 3 : 0;     // חצאי פיקסלים: עובי 1.5–7 פיקסלים
        c.set(halo ? '#ffffff' : FLOW_COL[flowClass(f.share)]).convertLinearToSRGB();     // ה-shader כותב את הצבע כמו שהוא (sRGB)
        const pts = [], S = 24;
        for (let i = 0; i <= S; i++) {
          const t = i / S, u = 1 - t;
          pts.push(new THREE.Vector3(u * u * ax + 2 * u * t * mx + t * t * bx, HH, -(u * u * ay + 2 * u * t * my + t * t * by)));
        }
        if (!halo) arrows.push({ pts, f });
        // ההתחלה והסוף נעצרים לפני הסיכות של השכונות (בפיקסלים)
        const start = 2 * 14, tip = 2 * 14, head = 2 * (5 + w / 4), hwid = w + 2 * 3.5;
        for (let i = 0; i < S; i++) {
          const p0 = pts[i], p1 = pts[i + 1], d = p1.clone().sub(p0);
          const o0 = i === 0 ? start : 0, o1 = i === S - 1 ? -(tip + head - 2) : 0;
          const W = w + hw;
          push(p0, d, o0, W); push(p0, d, o0, -W); push(p1, d, o1, -W);
          push(p0, d, o0, W); push(p1, d, o1, -W); push(p1, d, o1, W);
        }
        // ראש החץ
        const pe = pts[S], de = pe.clone().sub(pts[S - 1]), hh = halo ? 3 : 0;
        push(pe, de, -tip + hh, 0); push(pe, de, -(tip + head) - hh, hwid + hh); push(pe, de, -(tip + head) - hh, -hwid - hh);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('dir', new THREE.Float32BufferAttribute(dir3, 3));
      g.setAttribute('off', new THREE.Float32BufferAttribute(off, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const m = new THREE.Mesh(g, halo ? this.halo : this.mat); m.frustumCulled = false; m.renderOrder = halo ? 11 : 12;
      this.group.add(m); this.meshes.push(m);
    };
    // גבול כהה דק סביב השכונה שנבחרה
    const ring = this.ribbon((this.zones[focus].poly || []).flat(), INK2, 1.2, this.lineMat, 10.7);
    this.group.add(ring); this.meshes.push(ring);
    if (rows.length) { build(true); build(false); }
    this.state = { mode: 'focus', focus, rows, dir, arrows, inv, rate: new Map(rows.map(r => [r.z, r])) }; this.drawKey = '';
  }
  clearArrows() { for (const m of this.meshes) { this.group.remove(m); m.geometry.dispose(); } this.meshes = []; }

  // ---------- ציור השכבה הדו־ממדית (רק כשהמצלמה או הנתונים השתנו)
  draw(camera) {
    if (!this.group.visible || !this.state) return;
    const cv = this.cv, dpr = Math.min(3, devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    const ui = this.obstacles ? this.obstacles() : [];
    const key = camera.matrixWorld.elements.map(v => v.toFixed(2)).join(',') + camera.projectionMatrix.elements[0].toFixed(4) + W + 'x' + H
      + ui.map(r => `${r.left | 0},${r.top | 0},${r.right | 0},${r.bottom | 0}`).join(';');
    if (key === this.drawKey) return; this.drawKey = key;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const rect = { left: 0, top: 0, width: W, height: H };
    const P = this.zones.map((_, i) => this.screenOf(i, camera, rect));
    const S = this.state, boxes = ui.map(r => ({ x: r.left - 2, y: r.top - 2, w: r.right - r.left + 4, h: r.bottom - r.top + 4 }));
    const hit = b => boxes.some(o => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);
    const phone = W <= 820, R = phone ? 10 : 11;     // רדיוס הסיכה
    const vis = i => P[i].ok && P[i].x > -60 && P[i].x < W + 60 && P[i].y > -60 && P[i].y < H + 60;
    const order = this.zones.map((_, i) => i).filter(vis);
    for (const i of order) boxes.push({ x: P[i].x - R - 2, y: P[i].y - R - 2, w: 2 * R + 4, h: 2 * R + 4 });
    // סדר עדיפות לכרטיסים: בפוקוס — השכונה עצמה ואז היעדים לפי גודל; במבט על — לפי כמות הסמלים
    let pri;
    if (S.mode === 'focus') {
      const rank = new Map(S.rows.map((r, k) => [r.z, k]));
      pri = order.filter(i => i === S.focus || rank.has(i)).sort((a, b) => (a === S.focus ? -1 : rank.get(a)) - (b === S.focus ? -1 : rank.get(b)));
    } else pri = order.slice().sort((a, b) => (S.sym[b]?.length || 0) - (S.sym[a]?.length || 0) || this.area[b] - this.area[a]);
    // כרטיס רק לשכונה שהסיכה שלה נראית (לא מחוץ למסך ולא מתחת למקרא/ללוח)
    const inUi = i => ui.some(r => P[i].x > r.left && P[i].x < r.right && P[i].y > r.top && P[i].y < r.bottom);
    pri = pri.filter(i => P[i].x > 0 && P[i].x < W && P[i].y > 0 && P[i].y < H && !inUi(i));
    const blocks = [];
    const SZ = phone ? 12 : 14, GAP = 3, PER = 6;
    const NAMEF = (b, s) => `${b} ${s}px ${FONT}`;
    for (const i of pri) {
      const z = this.zones[i], focus = S.mode === 'focus' && i === S.focus, fr = S.mode === 'focus' && !focus ? S.rate.get(i) : null;
      const sym = S.mode === 'over' ? S.sym[i] || [] : [], more = S.mode === 'over' && S.more[i];
      g.font = NAMEF(focus ? 800 : 700, focus ? 13.5 : 12);
      const nameW = g.measureText(z.name).width;
      g.font = NAMEF(500, 10.5);
      const type = ZTYPES[z.type]?.short || '', typeW = type ? g.measureText(type).width + 6 : 0;
      let numTxt = '', numW = 0;
      if (fr) { numTxt = Math.round(fr.rate).toLocaleString('en-US'); g.font = NAMEF(800, 12); numW = g.measureText(numTxt).width + 6 + 16; }
      const n = sym.length + (more ? 1 : 0), rows = Math.ceil(n / PER), symW = n ? Math.min(n, PER) * (SZ + GAP) - GAP : 0, symH = rows ? rows * (SZ + GAP) - GAP : 0;
      // כרטיס קטן (שם, סוג, סמלים / מספר) עם "חוד" לכיוון הסיכה
      const tryPlace = (withName, withType, withSym, noName) => {
        const lineW = (withName ? (noName ? 0 : nameW) + numW + (withType ? typeW : 0) : 0);
        const bw = Math.max(lineW, withSym ? symW : 0) + 12, nameH = withName ? (focus ? 18 : 16) : 0;
        const bh = nameH + (withSym ? symH : 0) + (withName && withSym ? 3 : 0) + 7;
        const { x, y } = P[i], d = R + 6;
        const cand = [[x - bw / 2, y + d, 0], [x - bw / 2, y - d - bh, 3], [x - d - bw, y - bh / 2, 1], [x + d, y - bh / 2, 2],
          [x - bw + 16, y + d, 0], [x - 16, y + d, 0], [x - bw + 16, y - d - bh, 3], [x - 16, y - d - bh, 3],
          [x - d - bw, y - bh + 10, 1], [x - d - bw, y - 10, 1], [x + d, y - bh + 10, 2], [x + d, y - 10, 2]];
        for (const [bx, by, side] of cand) {
          const sx = side === 0 || side === 3 ? Math.min(Math.max(bx, 4), W - 4 - bw) : bx;
          if (sx < 2 || sx + bw > W - 2 || (side === 0 || side === 3) && (x < sx + 12 || x > sx + bw - 12)) continue;
          const b = { x: sx, y: by, w: bw, h: bh };
          if (!hit({ x: b.x - 2, y: b.y - 2, w: b.w + 4, h: b.h + 4 })) return { b, withName, withType, withSym, side, nameH, noName };
        }
        return null;
      };
      // אם אין מקום: בלי הסוג, ואז בלי השם (הסיכה מראה את הצורה של השכונה; בפוקוס נשאר המספר)
      const pl = tryPlace(true, !fr && !phone, n > 0) || tryPlace(true, false, n > 0) || (fr ? tryPlace(true, false, false, true) : n ? tryPlace(false, false, true) : null);
      if (!pl) continue;
      boxes.push(pl.b);
      blocks.push({ i, pl, nameW, typeW, type, numTxt, numW, symW, sym, more, focus, fr });
    }
    // ציור: הסיכות, ואז הכרטיסים
    for (const i of order) {
      const dim = S.mode === 'focus' && i !== S.focus && !S.inv.has(i);
      this.drawPin(g, P[i].x, P[i].y, R, this.zones[i].sym, dim ? 0.35 : 1, S.mode === 'focus' && i === S.focus);
    }
    for (const B of blocks) {
      const { b, withName, withType, withSym, side, nameH } = B.pl, p = P[B.i], z = this.zones[B.i];
      g.fillStyle = B.focus ? INK : 'rgba(255,255,255,.96)'; g.strokeStyle = B.focus ? '#fff' : 'rgba(15,23,42,.16)'; g.lineWidth = 1;
      callout(g, b, side, p); g.fill(); g.stroke();
      g.textBaseline = 'middle'; g.direction = 'rtl';
      let y = b.y + 3.5;
      if (withName) {
        const cy = y + nameH / 2 + 0.5;
        // מימין לשמאל: [מצב] שם · מספר | סוג
        let xr = b.x + b.w - 6;
        if (B.fr) {
          const k = flowClass(B.fr.share);
          g.beginPath(); g.arc(xr - 7, cy, 7, 0, Math.PI * 2); g.fillStyle = FLOW_COL[k]; g.fill();
          g.font = `800 9px ${FONT}`; g.textAlign = 'center'; g.fillStyle = '#fff';
          g.fillText(FLOW_ICON[k], xr - 7, cy + 0.5); xr -= 18;
        }
        g.font = `${B.focus ? 800 : 700} ${B.focus ? 13.5 : 12}px ${FONT}`; g.textAlign = 'right'; g.fillStyle = B.focus ? '#fff' : INK;
        if (!B.pl.noName) { g.fillText(z.name, xr, cy); xr -= B.nameW; }
        if (B.fr) { g.font = `800 12px ${FONT}`; g.fillStyle = INK; g.fillText(B.numTxt, xr - 6, cy); xr -= B.numW - 16; }
        if (withType) { g.font = `500 10.5px ${FONT}`; g.fillStyle = B.focus ? '#cbd5e1' : '#64748b'; g.fillText(B.type, xr - 6, cy + 0.5); }
        y += nameH + (withSym ? 3 : 0);
      }
      if (withSym) {
        const x0 = b.x + b.w / 2 - B.symW / 2;
        const items = B.sym.slice(); if (B.more) items.push(null);
        items.forEach((s, k) => {      // מימין לשמאל, כמו הטקסט
          const col = k % PER, row = (k / PER) | 0;
          const sx = x0 + B.symW - col * (SZ + GAP) - SZ / 2, sy = y + row * (SZ + GAP) + SZ / 2;
          if (s == null) { g.font = `800 13px ${FONT}`; g.fillStyle = INK; g.textAlign = 'center'; g.fillText('+', sx, sy + 1); return; }
          drawShape(g, s.s, sx, sy, SZ, s.k);
        });
      }
    }
  }
  // הסיכה של שכונה: עיגול לבן עם הסמל שלה בדיו (בשכונה שנבחרה — הפוך)
  drawPin(g, x, y, r, sym, alpha, focus) {
    g.save(); g.globalAlpha = alpha;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = focus ? INK : '#fff'; g.fill();
    g.lineWidth = 1; g.strokeStyle = focus ? '#fff' : 'rgba(15,23,42,.35)'; g.stroke();
    const s = r * 1.15;
    g.translate(x - s / 2, y - s / 2); g.scale(s / 24, s / 24);
    g.fillStyle = focus ? '#fff' : INK2; g.fill(PATHS[sym] || PATHS.circle);
    g.restore();
  }
}
// סמל קטן במצב קו: none — מלא אדום; some — חצי כתום; good — חלול אפור
function drawShape(g, sym, cx, cy, s, k) {
  const path = PATHS[sym] || PATHS.circle, col = FLOW_COL[k], f = FILL[k];
  g.save(); g.translate(cx - s / 2, cy - s / 2); g.scale(s / 24, s / 24);
  g.lineJoin = 'round';
  g.fillStyle = '#fff'; g.fill(path);
  if (f > 0) {
    g.save(); if (f < 1) { g.beginPath(); g.rect(-2, 12, 28, 14); g.clip(); }
    g.fillStyle = col; g.fill(path); g.restore();
  }
  g.lineWidth = f >= 1 ? 1.5 : 2.6; g.strokeStyle = col; g.stroke(path);
  g.restore();
}
// מלבן מעוגל עם חוד קטן לכיוון הנקודה p. side: 0 החוד למעלה, 3 למטה, 1 מימין, 2 משמאל
function callout(g, b, side, p) {
  const r = 6, k = 5, { x, y, w, h } = b;
  const cx = Math.min(Math.max(p.x, x + r + k), x + w - r - k), cy = Math.min(Math.max(p.y, y + r + k), y + h - r - k);
  g.beginPath(); g.moveTo(x + r, y);
  if (side === 0) { g.lineTo(cx - k, y); g.lineTo(cx, y - k); g.lineTo(cx + k, y); }
  g.arcTo(x + w, y, x + w, y + h, r);
  if (side === 1) { g.lineTo(x + w, cy - k); g.lineTo(x + w + k, cy); g.lineTo(x + w, cy + k); }
  g.arcTo(x + w, y + h, x, y + h, r);
  if (side === 3) { g.lineTo(cx + k, y + h); g.lineTo(cx, y + h + k); g.lineTo(cx - k, y + h); }
  g.arcTo(x, y + h, x, y, r);
  if (side === 2) { g.lineTo(x, cy + k); g.lineTo(x - k, cy); g.lineTo(x, cy - k); }
  g.arcTo(x, y, x + w, y, r); g.closePath();
}
