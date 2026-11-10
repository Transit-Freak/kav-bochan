// פרטים בתא הנהג ושלטים בתוך האוטובוס, בנוסף למה שכבר בדגם (מצלמות, מקום לכיסא גלגלים, מספר נוסעים, גובה, יציאת חירום):
// לוח שעונים מפורט (מד מהירות, סל"ד, דלק וחום, נורות אזהרה, מסך קטן), מתגי דלתות עם תוויות, מכשיר רב-קו ליד הנהג,
// מגן שמש, "אין לדבר עם הנהג בזמן הנסיעה", "העישון אסור", לחצני פתיחת דלת עם תווית, ו"פתיחת דלת בחירום".
// כל השלטים מצוירים על קנבס אחד (אטלס) — חומר אחד ורשת אחת לכל אוטובוס. הטקסט בעברית, מימין לשמאל.
// מערכת הצירים של האוטובוס: ‎+Z קדימה, ‎+Y למעלה, הדלתות בצד ‎-X, הנהג בצד ‎+X.
import * as THREE from 'three';
import { keep } from './texkeep.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const FONT = 'Heebo, "IBM Plex Sans Hebrew", Arial, sans-serif';
const S = 1024;                                   // האטלס: 1024×1024, כל שלט במלבן משלו (פיקסלים)
const R = {
  noTalk: [0, 0, 512, 160], noSmoke: [512, 0, 160, 160], cctv2: [672, 0, 352, 160],
  doorBtn: [0, 160, 256, 160], emergency: [256, 160, 512, 128], switches: [0, 336, 512, 192],
  ravkav: [512, 336, 256, 192], visorTag: [768, 160, 256, 96], kneel: [768, 256, 256, 64],
};

function rr(x, X, Y, W, H, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r); x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath(); }
function text(x, s, cx, cy, size, color, weight = 700) {
  x.fillStyle = color; x.font = `${weight} ${size}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.direction = 'rtl'; x.fillText(s, cx, cy);
}
function noSign(x, cx, cy, r) {           // עיגול אדום עם קו אלכסוני
  x.lineWidth = r * 0.16; x.strokeStyle = '#d0021b'; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke();
  x.beginPath(); x.moveTo(cx - r * 0.7, cy - r * 0.7); x.lineTo(cx + r * 0.7, cy + r * 0.7); x.stroke();
}

function atlas() {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, S, S);
  // אין לדבר עם הנהג
  { const [X, Y, W, H] = R.noTalk; x.fillStyle = '#fff'; x.fillRect(X, Y, W, H); x.strokeStyle = '#d0021b'; x.lineWidth = 10; rr(x, X + 8, Y + 8, W - 16, H - 16, 18); x.stroke();
    // אייקון: ראש מדבר עם קו
    const cx = X + W - 78, cy = Y + H / 2; x.fillStyle = '#1f2937'; x.beginPath(); x.arc(cx, cy - 6, 30, 0, 7); x.fill();
    x.fillRect(cx - 22, cy + 20, 44, 22); noSign(x, cx, cy, 52);
    text(x, 'אין לדבר עם הנהג', X + (W - 150) / 2 + 12, Y + 58, 46, '#111');
    text(x, 'בזמן הנסיעה', X + (W - 150) / 2 + 12, Y + 110, 46, '#d0021b'); }
  // העישון אסור
  { const [X, Y, W, H] = R.noSmoke; const cx = X + W / 2, cy = Y + H / 2 - 14;
    x.fillStyle = '#1f2937'; x.fillRect(cx - 38, cy - 6, 62, 14); x.fillStyle = '#ef4444'; x.fillRect(cx + 24, cy - 6, 12, 14);
    x.strokeStyle = '#94a3b8'; x.lineWidth = 4; x.beginPath(); x.moveTo(cx + 30, cy - 12); x.bezierCurveTo(cx + 40, cy - 30, cx + 20, cy - 36, cx + 32, cy - 52); x.stroke();
    noSign(x, cx, cy, 54); text(x, 'העישון אסור', cx, Y + H - 16, 26, '#111'); }
  // האוטובוס מצולם
  { const [X, Y, W, H] = R.cctv2; x.fillStyle = '#0b2545'; rr(x, X + 6, Y + 6, W - 12, H - 12, 16); x.fill();
    text(x, 'האוטובוס מצויד', X + W / 2, Y + 52, 40, '#fff'); text(x, 'במצלמות אבטחה', X + W / 2, Y + 104, 40, '#7dd3fc'); }
  // לחצן פתיחת דלת
  { const [X, Y, W, H] = R.doorBtn; x.fillStyle = '#facc15'; rr(x, X + 6, Y + 6, W - 12, H - 12, 18); x.fill();
    x.fillStyle = '#16a34a'; x.beginPath(); x.arc(X + W / 2, Y + 62, 40, 0, 7); x.fill(); x.fillStyle = '#fff';
    // חיצים של דלת נפתחת
    x.beginPath(); x.moveTo(X + W / 2 - 6, Y + 62); x.lineTo(X + W / 2 - 24, Y + 48); x.lineTo(X + W / 2 - 24, Y + 76); x.fill();
    x.beginPath(); x.moveTo(X + W / 2 + 6, Y + 62); x.lineTo(X + W / 2 + 24, Y + 48); x.lineTo(X + W / 2 + 24, Y + 76); x.fill();
    text(x, 'פתיחת דלת', X + W / 2, Y + 128, 36, '#111'); }
  // פתיחת דלת בחירום
  { const [X, Y, W, H] = R.emergency; x.fillStyle = '#d0021b'; rr(x, X + 4, Y + 4, W - 8, H - 8, 14); x.fill();
    text(x, 'פתיחת דלת בחירום', X + W / 2, Y + 50, 44, '#fff'); text(x, 'סובבו את הידית ודחפו', X + W / 2, Y + 96, 30, '#fee2e2', 500); }
  // מכשיר רב-קו: מסך
  { const [X, Y, W, H] = R.ravkav; x.fillStyle = '#0f172a'; x.fillRect(X, Y, W, H);
    x.fillStyle = '#1d4ed8'; x.fillRect(X + 10, Y + 10, W - 20, 50); text(x, 'רב-קו', X + W / 2, Y + 36, 34, '#fff');
    text(x, 'הצמידו כרטיס', X + W / 2, Y + 90, 30, '#e2e8f0', 500);
    x.strokeStyle = '#38bdf8'; x.lineWidth = 5; for (const r of [14, 26, 38]) { x.beginPath(); x.arc(X + W / 2, Y + 160, r, -0.9, 0.9); x.stroke(); } }
  // תווית על מגן השמש
  { const [X, Y, W, H] = R.visorTag; x.fillStyle = '#facc15'; x.fillRect(X, Y, W, H); text(x, 'זהירות — שטח מת', X + W / 2, Y + 32, 28, '#111'); text(x, 'בדקו במראות', X + W / 2, Y + 68, 26, '#111', 500); }
  // מחוון "כריעה" ליד הדלת (ירוק — האוטובוס כורע)
  { const [X, Y, W, H] = R.kneel; x.fillStyle = '#052e16'; x.fillRect(X, Y, W, H); text(x, '▼ האוטובוס כורע', X + W / 2, Y + H / 2, 30, '#4ade80'); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return keep(t);
}

// לוח השעונים: מד מהירות (קמ"ש), סל"ד, דלק וחום, שורת נורות אזהרה ומסך קטן באמצע — 1024×320
export function gaugeTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 320;
  const x = c.getContext('2d'); x.fillStyle = '#07090c'; x.fillRect(0, 0, 1024, 320);
  const dial = (cx, cy, r, max, step, label, val) => {
    x.fillStyle = '#0d1117'; x.beginPath(); x.arc(cx, cy, r + 8, 0, 7); x.fill();
    x.strokeStyle = '#cbd5e1'; x.lineWidth = 4; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke();
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    for (let v = 0; v <= max; v += step / 2) { const a = a0 + (a1 - a0) * v / max, big = v % step === 0, r0 = big ? r - 22 : r - 12;
      x.strokeStyle = '#e5e7eb'; x.lineWidth = big ? 4 : 2; x.beginPath(); x.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); x.lineTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4)); x.stroke();
      if (big) { x.fillStyle = '#f1f5f9'; x.font = `600 22px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.direction = 'ltr'; x.fillText(String(v), cx + Math.cos(a) * (r - 44), cy + Math.sin(a) * (r - 44)); } }
    text(x, label, cx, cy + r * 0.45, 22, '#94a3b8', 500);
    const a = a0 + (a1 - a0) * val; x.strokeStyle = '#ef4444'; x.lineWidth = 6; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * (r - 18), cy + Math.sin(a) * (r - 18)); x.stroke();
    x.fillStyle = '#334155'; x.beginPath(); x.arc(cx, cy, 10, 0, 7); x.fill();
  };
  dial(170, 165, 135, 120, 20, 'קמ"ש', 0.28);
  dial(854, 165, 135, 30, 5, 'סל"ד ×100', 0.32);
  // באמצע: מסך — מספר הקו, שעה, דלק וחום
  x.fillStyle = '#0b1f3a'; rr(x, 352, 40, 320, 200, 16); x.fill();
  text(x, 'שלום נהג', 512, 78, 30, '#7dd3fc'); text(x, 'דלת: סגורה  ·  בלם: משוחרר', 512, 122, 22, '#e2e8f0', 500);
  for (const [lab, y, k, col] of [['דלק', 168, 0.72, '#22c55e'], ['חום', 206, 0.45, '#38bdf8']]) {
    text(x, lab, 640, y, 22, '#cbd5e1', 500); x.fillStyle = '#1e293b'; x.fillRect(380, y - 9, 220, 18); x.fillStyle = col; x.fillRect(600 - 220 * k, y - 9, 220 * k, 18);
  }
  // נורות אזהרה (שורה תחתונה)
  const lamps = [['#ef4444', 'בלם'], ['#f59e0b', 'ABS'], ['#22c55e', '◀▶'], ['#3b82f6', 'אורות'], ['#f59e0b', 'מנוע'], ['#ef4444', 'מצבר'], ['#22c55e', 'דלתות']];
  lamps.forEach(([col, s], i) => { const cx = 380 + i * 44, cy = 280; x.fillStyle = i % 3 === 0 ? col : '#1f2937'; x.beginPath(); x.arc(cx, cy, 15, 0, 7); x.fill();
    x.fillStyle = '#9ca3af'; x.font = `500 12px ${FONT}`; x.textAlign = 'center'; x.direction = 'rtl'; x.fillText(s, cx, cy + 28); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return keep(t);
}

// שלט: מלבן בגודל w×h מטרים, במרכז p, פונה לכיוון n (ניצב), עם המלבן rect באטלס. up — "למעלה" של הטקסט
function sign(rect, w, h, p, n, up = new THREE.Vector3(0, 1, 0)) {
  const g = new THREE.PlaneGeometry(w, h), [X, Y, W, H] = rect, uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (X + uv.getX(i) * W) / S, 1 - (Y + (1 - uv.getY(i)) * H) / S);
  const z = n.clone().normalize(), xx = new THREE.Vector3().crossVectors(up, z).normalize(), yy = new THREE.Vector3().crossVectors(z, xx);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(xx, yy, z).setPosition(p));
  return g;
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export function addCabDetails(cab, M) {
  const mat = new THREE.MeshStandardMaterial({ name: 'M_CabSigns', map: atlas(), roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.18 });
  mat.emissiveMap = mat.map;
  const FL = 0.675, gs = [];
  // מאחורי הנהג, על המחיצה (פונה לנוסעים, ‎-Z): אין לדבר, העישון אסור, מצלמות
  gs.push(sign(R.noTalk, 0.42, 0.13, V(0.66, 1.27, 4.218), V(0, 0, -1)));
  gs.push(sign(R.noSmoke, 0.15, 0.15, V(0.5, 0.98, 4.218), V(0, 0, -1)));
  gs.push(sign(R.cctv2, 0.3, 0.135, V(0.82, 0.98, 4.218), V(0, 0, -1)));
  // לחצני פתיחת דלת + "פתיחת דלת בחירום" מעל כל דלת (על הקיר שבצד הדלתות, פונה פנימה ‎+X)
  for (const z of [-0.62, 4.42]) gs.push(sign(R.doorBtn, 0.12, 0.075, V(-1.17, 1.32, z), V(1, 0, 0)));
  for (const z of [0.07, 5.2]) gs.push(sign(R.emergency, 0.36, 0.09, V(-1.15, 2.42, z), V(1, 0, 0)));
  // מחוון כריעה ליד הדלת האמצעית
  gs.push(sign(R.kneel, 0.2, 0.05, V(-1.17, 2.28, 0.07), V(1, 0, 0)));
  // מכשיר רב-קו על הזרוע שמעל הקונסולה: גוף, מסך שפונה אל הדלת והנהג
  const dir = V(-0.55, 0.25, -0.8).normalize();
  gs.push(sign(R.ravkav, 0.13, 0.1, V(0.2, 1.47, 5.3).addScaledVector(dir, 0.031), dir));
  // מגן שמש מעל הנהג, ותווית עליו
  gs.push(sign(R.visorTag, 0.2, 0.075, V(0.6, 2.47, 5.86).addScaledVector(V(0, -0.5, -0.87), 0.012), V(0, -0.5, -0.87)));
  // לוח המתגים בקונסולה (רשת נפרדת: במבט נהג לוחצים עליו, והמתגים הפעילים נדלקים — js/drivectl.js)
  const plate = new THREE.Mesh(sign([0, 0, S, S], PLATE.w, PLATE.d, V(PLATE.x, FL + 0.7215, PLATE.z), V(0, 1, 0), V(0, 0, 1)), switchPlate().mat);
  plate.name = 'CabSwitchPlate'; cab.add(plate);
  const geo = mergeGeometries(gs.map(g => g.toNonIndexed()), false);
  const signs = new THREE.Mesh(geo, mat); signs.name = 'CabSigns'; cab.add(signs);
  // גוף מכשיר רב-קו ומגן השמש (מגן כהה ושקוף למחצה)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.13, 0.06), M.dash);
  body.position.set(0.2, 1.47, 5.3); body.lookAt(body.position.clone().add(dir)); body.name = 'RavKavReader'; cab.add(body);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.22, 0.012), new THREE.MeshStandardMaterial({ name: 'M_CabVisor', color: 0x1a1d22, roughness: 0.5, transparent: true, opacity: 0.88 }));
  visor.position.set(0.72, 2.47, 5.87); visor.rotation.x = -0.52; visor.name = 'SunVisor'; cab.add(visor);
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.64, 8).rotateZ(Math.PI / 2), M.trim); hinge.position.set(0.72, 2.57, 5.93); cab.add(hinge);
  return cab;
}

// מסך הקו שבתוך האוטובוס (M_LCD בדגם): לאוטובוס שנוהגים בו — מספר הקו, היעד והתחנה הבאה, מתעדכן
export function lineDisplay() {
  const c = document.createElement('canvas'); c.width = 768; c.height = 256;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; keep(t);
  const mat = new THREE.MeshBasicMaterial({ map: t, name: 'M_LCDLive' });
  let key = '';
  return {
    mat,
    draw(num, color, dest, next, clock) {
      const k = [num, dest, next, clock].join('|'); if (k === key) return; key = k;
      const x = c.getContext('2d'); x.fillStyle = '#eef3f8'; x.fillRect(0, 0, 768, 256);
      x.fillStyle = color || '#0ea5e9'; rr(x, 640, 18, 110, 70, 12); x.fill(); text(x, String(num), 695, 54, 48, '#fff', 800);
      text(x, dest ? `אל ${dest}` : '', 330, 54, 40, '#0f172a', 700);
      x.fillStyle = '#0f172a'; x.fillRect(0, 108, 768, 4);
      text(x, 'התחנה הבאה', 620, 150, 30, '#475569', 500);
      text(x, next || '', 384, 205, 50, '#1d4ed8', 800);
      x.fillStyle = '#334155'; x.font = `700 32px ${FONT}`; x.textAlign = 'left'; x.direction = 'ltr'; x.fillText(clock || '', 20, 150);
      t.needsUpdate = true;
    },
  };
}

// לוח המתגים: שישה מתגים (שתי שורות של שלוש) — מעליהם הכפתורים של התא (driver.js: ‎x = 0.08 + 0.09·col, ‎z = 5.36 + 0.08·row).
// הלוח שוכב, "למעלה" של הטקסט קדימה (‎+Z), ולכן ציר u של הטקסטורה הולך לכיוון ‎-X
export const SWITCHES = [['front', 'דלת 1', '#22c55e'], ['mid', 'דלת 2', '#22c55e'], ['kneel', 'כריעה', '#f59e0b'], ['lights', 'פנסים', '#e5e7eb'], ['wipers', 'מגבים', '#38bdf8'], ['hazard', 'מהבהבים', '#ef4444']];
export const PLATE = { x: 0.17, z: 5.4, w: 0.27, d: 0.1 };
export const switchAt = (x, z) => { const col = Math.round((x - 0.08) / 0.09), row = z > PLATE.z ? 1 : 0; return col >= 0 && col < 3 ? SWITCHES[row * 3 + col] : null; };
export function switchPlate() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 192;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; keep(t);
  const mat = new THREE.MeshStandardMaterial({ name: 'M_CabSwitches', map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.5 });
  let key = null;
  const draw = (on = {}) => {
    const k = JSON.stringify(on); if (k === key) return; key = k;
    const x = c.getContext('2d'); x.fillStyle = '#16181c'; x.fillRect(0, 0, 512, 192);
    SWITCHES.forEach(([id, s, col], i) => {
      const cc = i % 3, row = Math.floor(i / 3), wx = 0.08 + 0.09 * cc, wz = 5.36 + 0.08 * row;
      const cx = (PLATE.x + PLATE.w / 2 - wx) / PLATE.w * 512, cy = (1 - (wz - (PLATE.z - PLATE.d / 2)) / PLATE.d) * 192;
      x.fillStyle = on[id] ? col : '#16181c'; rr(x, cx - 74, cy - 40, 148, 80, 14); x.fill();
      x.strokeStyle = col; x.lineWidth = 5; rr(x, cx - 74, cy - 40, 148, 80, 14); x.stroke();
      text(x, s, cx, cy + 2, s.length > 5 ? 30 : 36, on[id] ? '#111' : '#f8fafc');
    });
    t.needsUpdate = true;
  };
  draw();
  return { mat, draw };
}
