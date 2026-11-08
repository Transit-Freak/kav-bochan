// שכבת הביקוש במפה ("מאיפה לאן"), לפי שכונות:
//  - כל שכונה היא שטח צבוע על הקרקע (לפי הסוג שלה), עם סמל הסוג והשם: מגורים, עבודה ותעשייה, לימודים, מסחר.
//  - ליד כל שכונה: סמלים קטנים של סוגי היעדים שאנשים משם רוצים לנסוע אליהם בשעה הזו. סמל אחד = U נוסעים בשעה.
//    סמל אדום מלא — אין להם קו; סמל אפור חלול — יש קו. (צבע + מילוי, ובמקרא גם מילים — לא צבע לבד.)
//  - הקשה על שכונה: חיצים ממנה ליעדים (או מהמקורות אליה), עובי לפי נוסעים בשעה, צבע לפי מצב הקו, ומספר על כל חץ.
// השטחים: כל פיקסל בנוי (בניינים + שוליים) שייך לשכונה של התחנה הקרובה אליו; בין שכונות יש רווח לבן דק.
// החיצים: עובי בפיקסלים (לא במטרים), כך שהם קריאים בכל זום — shader קטן שמזיז כל קודקוד על המסך.
// הסמלים, השמות והמספרים מצוירים על קנבס דו־ממדי מעל המפה, עם מניעת חפיפות.
import * as THREE from 'three';

// צבעי מצב (status palette) — תמיד יחד עם סמל ותווית במקרא, אף פעם לא צבע לבד
export const FLOW_COL = { none: '#d03b3b', some: '#ec835a', good: '#94a3b8' };
export const FLOW_ICON = { none: '✕', some: '½', good: '✓' };
export const FLOW_TXT = { none: 'אין קו', some: 'חלקי', good: 'יש קו' };
export const flowClass = share => share >= 0.7 ? 'good' : share >= 0.2 ? 'some' : 'none';
const SERVED = '#64748b';

// ארבעה סוגי שכונה/יעד. הצבעים: פלטה קטגורית שנבדקה (כל הזוגות) — ותמיד יחד עם הצורה והשם.
// הצורות: נתיבי SVG בתיבה 24×24 — אותו ציור במפה (Path2D) ובמקרא (svg).
export const ZTYPES = [
  { txt: 'מגורים', short: 'מגורים', col: '#eda100', d: 'M12 2.5L23 12h-3.2v9.5H4.2V12H1z' },
  { txt: 'עבודה ותעשייה', short: 'עבודה', col: '#6250d6', d: 'M1.5 21.5V10l6 3.6V10l6 3.6V10l3.3 2V2.5h4.2v19z' },
  { txt: 'לימודים', short: 'לימודים', col: '#1baf7a', d: 'M12 3.5l11.5 5.5L12 14.5 0.5 9zM5.5 12.6v4.6c0 2.6 13 2.6 13 0v-4.6L12 15.8zM21 9.8h1.6v6.4H21z' },
  { txt: 'מסחר', short: 'מסחר', col: '#e87ba4', d: 'M3.5 8.5h17l-1.2 13H4.7zM8 8.5V7a4 4 0 0 1 8 0v1.5h-2V7a2 2 0 0 0-4 0v1.5z' },
];
export const glyphSvg = (t, cls = '') => `<svg class="zg ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ZTYPES[t].d}"/></svg>`;
const PATHS = typeof Path2D !== 'undefined' ? ZTYPES.map(z => new Path2D(z.d)) : [];

const HH = 24;          // גובה השכבה מעל הקרקע (מ')
const CELL = 8;         // רזולוציית השטחים (מ' לפיקסל)

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

export class DemandLayer {
  // zones: demand.zones (עם type), stops: city.stops (עם zone), buildings: city.buildings
  constructor(scene, zones, stops, buildings, half = [3000, 3000]) {
    this.group = new THREE.Group(); this.group.visible = false; this.group.name = 'demand-layer';
    scene.add(this.group);
    this.zones = zones; this.half = half;
    // העיר מתעמעמת מתחת
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(half[0] * 4, half[1] * 4),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.62, depthTest: false, depthWrite: false }));
    veil.rotation.x = -Math.PI / 2; veil.position.y = HH - 2; veil.renderOrder = 9; this.group.add(veil);
    this.src = { stops, buildings };      // השטחים נבנים בפעם הראשונה שמציגים את השכבה (לא מאטים את הטעינה)
    const mk = a => new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, transparent: true, depthTest: false, depthWrite: false,
      uniforms: { res: { value: new THREE.Vector2(400, 400) }, alpha: { value: a } }, side: THREE.DoubleSide });
    this.mat = mk(0.95); this.halo = mk(0.95);
    this.meshes = [];
    // שכבה דו־ממדית מעל המפה: סמלים, שמות ומספרים
    const cv = this.cv = document.createElement('canvas');
    cv.id = 'dOverlay'; cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;display:none';
    document.querySelector('#view').after(cv);
    this.state = null; this.drawKey = '';
  }

  // ---------- שטחי השכונות: מסכה של השטח הבנוי, וכל פיקסל — לשכונה של התחנה הקרובה
  buildAreas(stops, buildings) {
    const [hx, hy] = this.half, W = this.gw = Math.ceil(2 * hx / CELL), H = this.gh = Math.ceil(2 * hy / CELL);
    const m = document.createElement('canvas'); m.width = W; m.height = H;
    const g = m.getContext('2d', { willReadFrequently: true });
    g.setTransform(1 / CELL, 0, 0, -1 / CELL, hx / CELL, hy / CELL);      // מטרים ← פיקסלים (צפון למעלה)
    g.fillStyle = g.strokeStyle = '#000'; g.lineJoin = 'round'; g.lineWidth = 70;
    for (const b of buildings) {
      if (b.pts.length < 3) continue;
      g.beginPath(); b.pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill(); g.stroke();
    }
    for (const s of stops) { g.beginPath(); g.arc(s.x, s.y, 60, 0, Math.PI * 2); g.fill(); }
    // ריכוך: סוגרים חורים קטנים בין בניינים
    const m2 = document.createElement('canvas'); m2.width = W; m2.height = H;
    const g2 = m2.getContext('2d', { willReadFrequently: true });
    g2.filter = 'blur(3px)'; g2.drawImage(m, 0, 0); g2.filter = 'none';
    const A = g2.getImageData(0, 0, W, H).data;
    const mask = this.mask = new Float32Array(W * H);
    for (let k = 0; k < W * H; k++) { const a = A[k * 4 + 3] / 255; mask[k] = Math.min(1, Math.max(0, (a - 0.3) / 0.35)); }
    // שכונה לכל פיקסל (התחנה הקרובה, עד 700 מ')
    const zid = this.zid = new Int8Array(W * H).fill(-1);
    const sx = stops.map(s => s.x), sy = stops.map(s => s.y), sz = stops.map(s => s.zone ?? -1);
    for (let r = 0; r < H; r++) {
      const y = hy - (r + 0.5) * CELL;
      for (let c = 0; c < W; c++) {
        const k = r * W + c; if (mask[k] <= 0) continue;
        const x = -hx + (c + 0.5) * CELL;
        let bd = 700 * 700, bz = -1;
        for (let i = 0; i < sx.length; i++) { const dx = sx[i] - x, dy = sy[i] - y, d = dx * dx + dy * dy; if (d < bd && sz[i] >= 0) { bd = d; bz = sz[i]; } }
        zid[k] = bz;
      }
    }
    // גבול בין שכונות: פיקסל ששכן שלו (עד 2 פיקסלים) שייך לשכונה אחרת
    const edge = this.edge = new Uint8Array(W * H);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const k = r * W + c, z = zid[k]; if (z < 0) continue;
      for (let dr = -1; dr <= 1 && !edge[k]; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= H || cc >= W) continue;
        const z2 = zid[rr * W + cc]; if (z2 >= 0 && z2 !== z) { edge[k] = 1; break; }
      }
    }
    // נקודת עיגון לכל שכונה: הפיקסל של השכונה שהכי קרוב למרכז השטח שלה
    const acc = this.zones.map(() => [0, 0, 0]);
    for (let k = 0; k < W * H; k++) { const z = zid[k]; if (z < 0) continue; const w = mask[k]; acc[z][0] += (k % W) * w; acc[z][1] += ((k / W) | 0) * w; acc[z][2] += w; }
    this.anchor = this.zones.map((z, i) => {
      const [ax, ay, n] = acc[i]; if (!n) return [z.x, z.y];
      const cc = ax / n, rr = ay / n; let bd = Infinity, bk = -1;
      for (let k = 0; k < W * H; k++) if (zid[k] === i && !edge[k] && mask[k] > 0.5) {
        const d = (k % W - cc) ** 2 + ((k / W | 0) - rr) ** 2; if (d < bd) { bd = d; bk = k; } }
      if (bk < 0) return [z.x, z.y];
      return [-hx + (bk % W + 0.5) * CELL, hy - ((bk / W | 0) + 0.5) * CELL];
    });
    const out = this.areaCv = document.createElement('canvas'); out.width = W; out.height = H;
    this.areaTex = new THREE.CanvasTexture(out); this.areaTex.colorSpace = THREE.SRGBColorSpace;
    this.areaTex.minFilter = THREE.LinearFilter; this.areaTex.generateMipmaps = false;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(W * CELL, H * CELL),
      new THREE.MeshBasicMaterial({ map: this.areaTex, transparent: true, depthTest: false, depthWrite: false }));
    plane.rotation.x = -Math.PI / 2; plane.position.set(-hx + W * CELL / 2, HH - 1, -(hy - H * CELL / 2)); plane.renderOrder = 10;
    this.group.add(plane);
    this.paintAreas(null);
  }
  // צביעת השטחים. strength: לכל שכונה, כמה חזק (0..1); null = כולן רגיל
  paintAreas(strength) {
    const key = strength ? strength.join(',') : '-'; if (key === this.paintKey) return; this.paintKey = key;
    const W = this.gw, H = this.gh, g = this.areaCv.getContext('2d'), img = g.createImageData(W, H), D = img.data;
    const cols = this.zones.map(z => new THREE.Color(ZTYPES[z.type].col));
    for (let k = 0; k < W * H; k++) {
      const z = this.zid[k]; if (z < 0 || this.edge[k]) continue;
      const s = strength ? strength[z] : 1; if (!s) continue;
      const c = cols[z];
      D[k * 4] = c.r * 255; D[k * 4 + 1] = c.g * 255; D[k * 4 + 2] = c.b * 255; D[k * 4 + 3] = 255 * 0.24 * Math.min(1, s) * this.mask[k] + (s > 1 ? 255 * 0.12 * this.mask[k] : 0);
    }
    g.putImageData(img, 0, 0); this.areaTex.needsUpdate = true;
  }

  setVisible(v) {
    if (v && !this.zid) { this.buildAreas(this.src.stops, this.src.buildings); this.src = null; }
    this.group.visible = v; this.cv.style.display = v ? 'block' : 'none'; this.drawKey = ''; }
  resize(w, h) { for (const m of [this.mat, this.halo]) m.uniforms.res.value.set(w / 2, h / 2); this.drawKey = ''; }
  anchorV(i) { const [x, y] = this.anchor[i]; return new THREE.Vector3(x, HH, -y); }
  screenOf(i, camera, rect) {
    const v = this.anchorV(i).project(camera);
    return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height, ok: v.z < 1 };
  }
  // איזו שכונה בנקודה הזו על המסך: קודם סמל קרוב, ואחר כך השטח עצמו
  pick(cx, cy, camera, rect, near = 26) {
    if (!this.anchor) return null;
    let best = null, bd = near;
    this.zones.forEach((z, i) => { const p = this.screenOf(i, camera, rect); if (!p.ok) return;
      const d = Math.hypot(p.x - cx, p.y - cy); if (d < bd) { bd = d; best = i; } });
    if (best != null) return best;
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((cx - rect.left) / rect.width * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1), camera);
    const p = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -(HH - 1)), p)) return null;
    const c = Math.floor((p.x + this.half[0]) / CELL), r = Math.floor((this.half[1] + p.z) / CELL);
    if (c < 0 || r < 0 || c >= this.gw || r >= this.gh) return null;
    const k = r * this.gw + c;
    return this.zid[k] >= 0 && this.mask[k] > 0.2 ? this.zid[k] : null;
  }

  // מבט על: sym[i] = [{t, bad}] (כבר חתוך למקסימום), more[i] — יש עוד
  setOverview({ sym, more }) {
    this.clearArrows(); this.paintAreas(null);
    this.state = { mode: 'over', sym, more }; this.drawKey = '';
  }
  // שכונה אחת: rows = [{z, rate, share}], dir 'out' | 'in', maxRate — לעובי
  setFocus({ focus, rows, dir, maxRate }) {
    this.clearArrows();
    const inv = new Set(rows.map(r => r.z));
    this.paintAreas(this.zones.map((_, i) => i === focus ? 1.25 : inv.has(i) ? 0.85 : 0.3));
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
        const w = 2 * (1 + 4 * Math.sqrt(Math.min(1, f.rate / maxRate))), hw = halo ? 4 : 0;     // חצאי פיקסלים: עובי 2–10 פיקסלים
        c.set(halo ? '#ffffff' : FLOW_COL[flowClass(f.share)]);
        const pts = [], S = 24;
        for (let i = 0; i <= S; i++) {
          const t = i / S, u = 1 - t;
          pts.push(new THREE.Vector3(u * u * ax + 2 * u * t * mx + t * t * bx, HH, -(u * u * ay + 2 * u * t * my + t * t * by)));
        }
        if (!halo) arrows.push({ pts, f });
        // ההתחלה והסוף נעצרים לפני הסמלים של השכונות (בפיקסלים)
        const start = 2 * 15, tip = 2 * 15, head = 2 * (6 + w / 4), hwid = w + 2 * 4;
        for (let i = 0; i < S; i++) {
          const p0 = pts[i], p1 = pts[i + 1], d = p1.clone().sub(p0);
          const o0 = i === 0 ? start : i === S - 1 ? 0 : 0, o1 = i === S - 1 ? -(tip + head - 2) : 0;
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
    if (rows.length) { build(true); build(false); }
    this.state = { mode: 'focus', focus, rows, dir, arrows, inv }; this.drawKey = '';
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
    const R = 11;     // רדיוס סמל השכונה
    const vis = i => P[i].ok && P[i].x > -60 && P[i].x < W + 60 && P[i].y > -60 && P[i].y < H + 60;
    // מספרים על החיצים קודם בתור "תפוסים", כדי ששמות לא יכסו אותם
    const nums = [];
    if (S.mode === 'focus') {
      g.font = '700 12px Heebo, "IBM Plex Sans Hebrew", Arial, sans-serif';
      for (const a of S.arrows.slice().sort((x, y) => y.f.rate - x.f.rate)) {
        const txt = Math.round(a.f.rate).toLocaleString('en-US'), w = g.measureText(txt).width + 12, h = 18;
        for (const t of [0.55, 0.42, 0.68, 0.32, 0.78]) {
          const v = a.pts[Math.round(t * (a.pts.length - 1))].clone().project(camera);
          if (v.z >= 1) continue;
          const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H, b = { x: x - w / 2, y: y - h / 2, w, h };
          if (!hit(b) || t === 0.78) { boxes.push(b); nums.push({ b, txt }); break; }
        }
      }
    }
    // סמלי השכונות תמיד (תפוסים)
    const order = this.zones.map((_, i) => i).filter(vis);
    for (const i of order) boxes.push({ x: P[i].x - R - 2, y: P[i].y - R - 2, w: 2 * R + 4, h: 2 * R + 4 });
    // סדר עדיפות: בפוקוס — השכונה עצמה ואז היעדים לפי גודל; במבט על — לפי כמות הסמלים
    let pri;
    if (S.mode === 'focus') {
      const rank = new Map(S.rows.map((r, k) => [r.z, k]));
      pri = order.filter(i => i === S.focus || rank.has(i)).sort((a, b) => (a === S.focus ? -1 : rank.get(a)) - (b === S.focus ? -1 : rank.get(b)));
    } else pri = order.slice().sort((a, b) => (S.sym[b]?.length || 0) - (S.sym[a]?.length || 0));
    // בלוק רק לשכונה שהסמל שלה נראה (לא מחוץ למסך ולא מתחת למקרא/ללוח)
    const inUi = i => ui.some(r => P[i].x > r.left && P[i].x < r.right && P[i].y > r.top && P[i].y < r.bottom);
    pri = pri.filter(i => P[i].x > 0 && P[i].x < W && P[i].y > 0 && P[i].y < H && !inUi(i));
    const blocks = [];
    const SZ = W > 820 ? 15 : 13, GAP = 2, PER = 6;
    for (const i of pri) {
      const z = this.zones[i], focus = S.mode === 'focus' && i === S.focus;
      const sym = S.mode === 'over' ? S.sym[i] || [] : [], more = S.mode === 'over' && S.more[i];
      g.font = `${focus ? 800 : 700} ${focus ? 13.5 : 12}px Heebo, "IBM Plex Sans Hebrew", Arial, sans-serif`;
      // שם ארוך — בשתי שורות (חלוקה ברווח הכי קרוב לאמצע)
      let lines = [z.name];
      if (!focus && g.measureText(z.name).width > 112 && z.name.includes(' ')) {
        const sp = [...z.name].map((c, k) => c === ' ' ? k : -1).filter(k => k > 0), mid = z.name.length / 2;
        const k = sp.reduce((a, b) => Math.abs(b - mid) < Math.abs(a - mid) ? b : a);
        lines = [z.name.slice(0, k), z.name.slice(k + 1)];
      }
      const nameW = Math.max(...lines.map(t => g.measureText(t).width)), nameH = focus ? 17 : 15 * lines.length;
      const n = sym.length + (more ? 1 : 0), rows = Math.ceil(n / PER), symW = n ? Math.min(n, PER) * (SZ + GAP) - GAP : 0, symH = rows ? rows * (SZ + GAP) - GAP : 0;
      // כרטיס קטן (שם + סמלים) עם "חוד" לכיוון סמל השכונה, כדי שלא יתבלבלו בין שכונות קרובות
      const tryPlace = (withName, withSym) => {
        const bw = Math.max(withName ? nameW : 0, withSym ? symW : 0) + 12, bh = (withName ? nameH : 0) + (withSym ? symH : 0) + (withName && withSym ? 3 : 0) + 8;
        const { x, y } = P[i], d = R + 7;
        const cand = [[x - bw / 2, y + d, 0], [x - bw / 2, y - d - bh, 3], [x - d - bw, y - bh / 2, 1], [x + d, y - bh / 2, 2],
          [x - bw + 16, y + d, 0], [x - 16, y + d, 0], [x - bw + 16, y - d - bh, 3], [x - 16, y - d - bh, 3]];
        for (const [bx, by, side] of cand) {
          // לא לחתוך בקצה המסך: מזיזים פנימה (אבל לא רחוק מהסמל)
          const sx = side === 0 || side === 3 ? Math.min(Math.max(bx, 4), W - 4 - bw) : bx;
          if (sx < 2 || sx + bw > W - 2 || (side === 0 || side === 3) && (x < sx + 12 || x > sx + bw - 12)) continue;
          const b = { x: sx, y: by, w: bw, h: bh };
          if (!hit({ x: b.x - 1, y: b.y - 1, w: b.w + 2, h: b.h + 2 })) return { b, withName, withSym, side };
        }
        return null;
      };
      const pl = tryPlace(true, n > 0) || (n ? tryPlace(false, true) : null);
      if (!pl) continue;
      boxes.push(pl.b);
      blocks.push({ i, pl, nameW, nameH, symW, symH, sym, more, focus, lines });
    }
    // ציור: סמלי שכונה, ואז הכרטיסים, ואז המספרים
    for (const i of order) {
      const dim = S.mode === 'focus' && i !== S.focus && !S.inv.has(i);
      this.drawZoneIcon(g, P[i].x, P[i].y, R, this.zones[i].type, dim ? 0.45 : 1, S.mode === 'focus' && i === S.focus);
    }
    for (const B of blocks) {
      const { b, withName, withSym, side } = B.pl, p = P[B.i];
      const bg = B.focus ? '#2a78d6' : 'rgba(255,255,255,.95)';
      g.fillStyle = bg; g.strokeStyle = B.focus ? '#fff' : 'rgba(15,23,42,.18)'; g.lineWidth = 1;
      callout(g, b, side, p); g.fill(); g.stroke();
      let y = b.y + 4;
      const cx = b.x + b.w / 2;
      if (withName) {
        g.font = `${B.focus ? 800 : 700} ${B.focus ? 13.5 : 12}px Heebo, "IBM Plex Sans Hebrew", Arial, sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl'; g.fillStyle = B.focus ? '#fff' : '#0f172a';
        B.lines.forEach((t, k) => g.fillText(t, cx, y + (B.focus ? 9 : 7.5) + 15 * k + 1));
        y += B.nameH + (withSym ? 3 : 0);
      }
      if (withSym) {
        const x0 = cx - B.symW / 2;
        // מימין לשמאל, כמו הטקסט
        const items = B.sym.slice(); if (B.more) items.push(null);
        items.forEach((s, k) => {
          const col = k % PER, row = (k / PER) | 0;
          const sx = x0 + B.symW - col * (SZ + GAP) - SZ / 2, sy = y + row * (SZ + GAP) + SZ / 2;
          if (s == null) { g.font = '800 14px Arial, sans-serif'; g.fillStyle = '#0f172a'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('+', sx, sy + 1); return; }
          drawGlyph(g, s.t, sx, sy, SZ, s.bad);
        });
      }
    }
    for (const { b, txt } of nums) {
      g.fillStyle = '#0f172a'; rr(g, b.x, b.y, b.w, b.h, 9); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
      g.font = '700 12px Heebo, "IBM Plex Sans Hebrew", Arial, sans-serif'; g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(txt, b.x + b.w / 2, b.y + b.h / 2 + 1);
    }
  }
  drawZoneIcon(g, x, y, r, t, alpha, focus) {
    g.save(); g.globalAlpha = alpha;
    g.beginPath(); g.arc(x, y, r + 1.5, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
    g.beginPath(); g.arc(x, y, r - 0.5, 0, Math.PI * 2); g.lineWidth = focus ? 3.5 : 2.5; g.strokeStyle = focus ? '#2a78d6' : ZTYPES[t].col; g.stroke();
    g.translate(x - r * 0.62, y - r * 0.62); g.scale(r * 1.24 / 24, r * 1.24 / 24);
    g.fillStyle = '#1e293b'; g.fill(PATHS[t]);
    g.restore();
  }
}
// סמל יעד קטן: אדום מלא — אין קו; אפור חלול — יש קו
function drawGlyph(g, t, cx, cy, s, bad) {
  g.save(); g.translate(cx - s / 2, cy - s / 2); g.scale(s / 24, s / 24);
  if (bad) { g.fillStyle = FLOW_COL.none; g.fill(PATHS[t]); }
  else { g.lineWidth = 2.2; g.lineJoin = 'round'; g.strokeStyle = SERVED; g.stroke(PATHS[t]); }
  g.restore();
}
// מלבן מעוגל עם חוד קטן לכיוון הנקודה p. side: 0 החוד למעלה, 3 למטה, 1 מימין, 2 משמאל
function callout(g, b, side, p) {
  const r = 6, k = 6, { x, y, w, h } = b;
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
function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
