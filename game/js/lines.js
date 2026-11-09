// קווים: הגדרה, חישוב מסלול על הרשת, ציור, ושמירה ב-localStorage
import * as THREE from 'three';
import { keep } from './texkeep.js?v=18';
import { dedupe, offsetRight, Polyline, speedProfile } from './graph.js?v=18';

export const LANE_OFFSET = 1.8;           // מרכז הנתיב הימני, מטרים ממרכז הכביש
export const COLORS = ['#0ea5e9', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'];
const KEY = 'busgame.kiryat-malachi.lines.v1';

export function loadLines() {
  try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}
export function saveLines(defs) {
  try { localStorage.setItem(KEY, JSON.stringify(defs)); } catch { }
}

// מסלול לרשימת תחנות. מחזיר null + אינדקס הקטע שנכשל
export function computeRoute(graph, stops) {
  let pts = [], stopIdx = [];
  for (let k = 0; k < stops.length; k++) {
    if (k === 0) { pts.push(graph.stopPoint(stops[0])); stopIdx.push(0); continue; }
    const seg = graph.route(stops[k - 1], stops[k]);
    if (!seg) return { error: k };
    for (let i = 1; i < seg.length; i++) {
      const p = seg[i], q = pts[pts.length - 1];
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.05) pts.push(p);
    }
    stopIdx.push(pts.length - 1);
  }
  const off = offsetRight(pts, LANE_OFFSET);
  const poly = new Polyline(off);
  const stopS = stopIdx.map(i => poly.cum[i]);
  return { poly, stopS, center: pts };
}

export class Line {
  constructor(def, graph, stopsById) {
    this.def = def;
    this.stops = def.stopIds.map(id => stopsById.get(id)).filter(Boolean);
    const r = computeRoute(graph, this.stops);
    if (r.error !== undefined) { this.error = r.error; return; }
    this.poly = r.poly; this.stopS = r.stopS;
    this.profile = speedProfile(this.poly, this.stopS);
    // בלי עצירה בתחנות (רק פניות, ההתחלה והסוף) — לאוטובוס שלא צריך לעצור בתחנה
    this.profileFree = speedProfile(this.poly, []);
    this.resetStats();
    this.returning = [];                        // מתי כל רכב שחוזר ריק למסוף יהיה פנוי
    this.dispatches = [];                       // זמני היציאות האחרונות (לתדירות בפועל)
    this.short = false;                         // מחכים עכשיו לרכב פנוי
    this.queues = this.stops.map(() => []);     // ממתינים לפי תחנה
    this.buses = [];
    this.nextDispatch = null;
    this.visible = true;
  }
  resetStats() {
    const z = () => new Float64Array(24);
    this.stats = { board: 0, alight: 0, waitSum: 0, waitN: 0, left: 0, gaveUp: 0, loadSum: 0, loadT: 0, km: 0, hours: 0, trips: 0, xferIn: 0,
      hWant: z(), hBoard: z(), hCap: z() };     // לפי שעה: רצו לעלות (לפי המודל), עלו, מקומות שיצאו
  }
  get id() { return this.def.id; }
  get color() { return this.def.color; }
  get waiting() { return this.queues.reduce((a, q) => a + q.length, 0); }
  get onboard() { return this.buses.reduce((a, b) => a + b.pax.length, 0); }
  get avgWait() { return this.stats.waitN ? this.stats.waitSum / this.stats.waitN : 0; }
  get avgLoad() { return this.stats.loadT ? this.stats.loadSum / this.stats.loadT : 0; }
}

// ---------- ציור הקו: רצועה צבעונית בנתיב, חצים, ומספרי התחנות
export function routeMesh(poly, color, stopPts = [], hi = -1) {
  const g = new THREE.Group();
  const pos = [], W = 0.9, H = 0.2, P = poly.pts;
  for (let i = 0; i + 1 < P.length; i++) {
    const [x0, y0] = P[i], [x1, y1] = P[i + 1];
    const L = Math.hypot(x1 - x0, y1 - y0); if (L < 0.01) continue;
    const nx = -(y1 - y0) / L * W, ny = (x1 - x0) / L * W;
    pos.push(x0 + nx, H, -(y0 + ny), x0 - nx, H, -(y0 - ny), x1 - nx, H, -(y1 - ny), x0 + nx, H, -(y0 + ny), x1 - nx, H, -(y1 - ny), x1 + nx, H, -(y1 + ny));
  }
  // חצים כל 30 מ'
  const tmp = [0, 0], tmp2 = [0, 0];
  for (let s = 15; s < poly.length - 5; s += 30) {
    poly.at(s, tmp); poly.at(s + 1, tmp2);
    const dx = tmp2[0] - tmp[0], dy = tmp2[1] - tmp[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const tip = [tmp[0] + ux * 2.2, tmp[1] + uy * 2.2], l = [tmp[0] - uy * 1.6, tmp[1] + ux * 1.6], r = [tmp[0] + uy * 1.6, tmp[1] - ux * 1.6];
    pos.push(l[0], H + 0.01, -l[1], r[0], H + 0.01, -r[1], tip[0], H + 0.01, -tip[1]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 });
  const m = new THREE.Mesh(geo, mat); m.renderOrder = 2; g.add(m);
  stopPts.forEach(([x, y], k) => {
    const sp = k === hi ? labelSprite(String(k + 1), '#0f172a', 1.2) : labelSprite(String(k + 1), color, 0.9);   // hi: התחנה שנבחרה בעריכה
    sp.position.set(x, 5.2, -y); g.add(sp);
  });
  return g;
}

const spriteCache = new Map();
export function labelSprite(text, color, scale = 1, fg = '#fff') {
  const key = text + color + fg;
  let tex = spriteCache.get(key);
  if (!tex) {
    const c = document.createElement('canvas'); const g = c.getContext('2d');
    const font = '700 44px Heebo, "IBM Plex Sans Hebrew", Arial, sans-serif';
    g.font = font; g.direction = 'rtl'; const w = Math.max(64, g.measureText(text).width + 36);
    c.width = w; c.height = 64; g.font = font; g.direction = 'rtl';
    g.fillStyle = color; roundRect(g, 2, 2, w - 4, 60, 30); g.fill();
    g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,.95)'; g.stroke();
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, 34);
    tex = keep(new THREE.CanvasTexture(c)); tex.colorSpace = THREE.SRGBColorSpace; tex.userData.aspect = w / 64;
    spriteCache.set(key, tex);
  }
  // גודל קבוע על המסך (לא גדל כשמתקרבים)
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
  const k = 0.032 * scale;
  sp.scale.set(k * tex.userData.aspect, k, 1); sp.renderOrder = 10;
  return sp;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
