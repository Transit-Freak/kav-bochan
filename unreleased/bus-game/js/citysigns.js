// השלטים האלקטרוניים באוטובוס העירוני (הרגיל והחשמלי — אותו פנים): במקום המסך שהיה תלוי מהתקרה באמצע —
// שני מסכי מידע רחבים (60×25 ס"מ) צמודים לקיר הצד מעל החלונות, באלכסון של הקשת שבין החלון לתקרה, פונים אל המעבר
// (אחד בכל צד, ליד הדלת האמצעית), ופס לד כתום דק בתקרה מקדימה, מעל אזור הנהג, עם שם התחנה הבאה.
// מתעדכנים רק באוטובוס שהמצלמה בתוכו (actors.js); בשאר האוטובוסים — מסך כהה. קנבס קטן, חומר אחד לכל סוג שלט.
import * as THREE from 'three';
import { keep } from './texkeep.js';

const FONT = 'Heebo, "IBM Plex Sans Hebrew", Arial, sans-serif';
// הקשת שבין קצה החלון (y = 2.72) לתקרה: מ-(x 1.21, y 2.84) עד (x 0.89, y 3.06). המסך — מעט לפניה
const SCR = { w: 0.6, h: 0.25, b: [1.19, 2.745], t: [1.005, 2.905] };
export const CITY_SCREENS = [[1, 1.75], [-1, -1.75]];   // [צד, z]: מול הדלת האמצעית מקדימה (צד הנהג) ומאחוריה (צד הדלתות)
const LED = { w: 0.9, h: 0.075, y: 2.97, z: 4.62 };       // במקום המסך התלוי הישן

const TILT = Math.atan2(SCR.b[0] - SCR.t[0], SCR.t[1] - SCR.b[1]);   // הזווית מהאנכי
// g במרכז, פונה ל-‎+Z → פונה אל המעבר (‎-s·x), נוטה עם הקשת (הקצה העליון פנימה), ו-out מטרים מאחורי המסך
function onCove(g, s, z, out = 0) {
  g.rotateY(-s * Math.PI / 2); g.rotateZ(s * TILT);
  return g.translate(s * ((SCR.b[0] + SCR.t[0]) / 2 + out * Math.cos(TILT)), (SCR.b[1] + SCR.t[1]) / 2 + out * Math.sin(TILT), z);
}
function canvasMat(w, h, name, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d', { willReadFrequently: true });
  const t = keep(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ name, map: t, toneMapped: false });
  let key = null;
  return { mat, draw(d) { const k = JSON.stringify(d); if (k === key) return; key = k; draw(c.getContext('2d'), w, h, d); t.image = c; keep(t); } };
}
function fit(x, s, max, px, w) { let p = px; x.font = `${w} ${p}px ${FONT}`; while (p > 12 && x.measureText(s).width > max) { p -= 2; x.font = `${w} ${p}px ${FONT}`; } }

// מסך המידע: מימין מספר הקו והיעד, ומשמאל שלוש התחנות הבאות עם הדקות, ובפינה השעה
function drawScreen(x, W, H, d) {
  x.direction = 'rtl'; x.fillStyle = '#0d1b2e'; x.fillRect(0, 0, W, H);
  if (!d) return;
  x.fillStyle = '#12304f'; x.fillRect(W - 200, 0, 200, H);
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#ffb020'; fit(x, d.num, 180, 110, 800); x.fillText(d.num, W - 100, 112);
  x.fillStyle = '#ffffff'; fit(x, d.dest ? 'אל ' + d.dest : '', 184, 26, 600); x.fillText(d.dest ? 'אל ' + d.dest : '', W - 100, 232);
  x.textBaseline = 'alphabetic';
  x.direction = 'ltr'; x.textAlign = 'left'; x.fillStyle = '#ffffff'; x.font = `700 30px ${FONT}`; x.fillText(d.clock || '', 18, 40); x.direction = 'rtl';
  const rows = d.rows.slice(1).filter(r => r.name), top = 78, step = (H - top - 14) / 3;
  rows.slice(0, 3).forEach((r, i) => {
    const y = top + i * step + step / 2, cur = i === 0;
    x.fillStyle = cur ? '#1d4f80' : 'rgba(255,255,255,.06)'; x.fillRect(16, y - step / 2 + 4, W - 236, step - 8);
    x.textAlign = 'right'; x.fillStyle = cur ? '#ffb020' : '#aab6c6'; x.font = `600 20px ${FONT}`; x.fillText(r.label, W - 232, y - 12);
    x.fillStyle = '#ffffff'; fit(x, r.name, W - 400, cur ? 32 : 28, cur ? 800 : 600); x.fillText(r.name, W - 232, y + 22);
    if (r.min != null) { x.direction = 'ltr'; x.textAlign = 'left'; x.font = `500 18px ${FONT}`; x.fillStyle = '#aab6c6'; x.fillText("דק'", 30, y + 14);
      x.textAlign = 'right'; x.fillStyle = cur ? '#ffb020' : '#ffffff'; x.font = `800 ${cur ? 40 : 32}px ${FONT}`; x.fillText(String(r.min), 120, y + 16); x.direction = 'rtl'; }
  });
}
// פס הלד: "התחנה הבאה: ..." בכתום על שחור, עם רשת נקודות
function drawLed(x, W, H, d) {
  x.fillStyle = '#080808'; x.fillRect(0, 0, W, H);
  if (d) { x.direction = 'rtl'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#ff8a00'; const s = d.next ? 'התחנה הבאה: ' + d.next : '';
    fit(x, s, W - 30, 40, 700); x.fillText(s, W / 2, H / 2 + 2); }
  x.fillStyle = 'rgba(0,0,0,.4)'; for (let y = 0; y < H; y += 3) x.fillRect(0, y, W, 1); for (let X = 0; X < W; X += 3) x.fillRect(X, 0, 1, H);
}
let idle = null;
const idleMats = () => idle || (idle = (() => { const a = canvasMat(32, 16, 'M_CityDetScrIdle', drawScreen), b = canvasMat(64, 8, 'M_CityDetLedIdle', drawLed); a.draw(null); b.draw(null); return { scr: a.mat, led: b.mat }; })());
// החיים — מסך אחד ופס אחד לכל המשחק (רק לאוטובוס שהמצלמה בתוכו)
export function cityDisplays() { return { scr: canvasMat(768, 320, 'M_CityDetScr', drawScreen), led: canvasMat(1024, 64, 'M_CityDetLed', drawLed) }; }

// פעם אחת לדגם: מוציאים את המסך התלוי ואת התושבת שלו, ומוסיפים את השלטים
export function addCitySigns(root) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert(), v = [0, 1, 2].map(() => new THREE.Vector3()), c = new THREE.Vector3(), list = [];
  root.traverse(o => { if (o.isMesh && !Array.isArray(o.material) && o.geometry.index && o.material.name !== 'M_CeilPerf') list.push(o); });
  for (const o of list) {
    if (o.material.name === 'M_LCD') { o.visible = false; continue; }
    const M = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), g = o.geometry, pos = g.attributes.position, idx = g.index.array, kept = [];
    for (let t = 0; t < idx.length; t += 3) { for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, idx[t + k]).applyMatrix4(M);
      c.copy(v[0]).add(v[1]).add(v[2]).multiplyScalar(1 / 3);
      if (!(Math.abs(c.x) < 0.56 && c.y > 2.55 && c.y < 2.98 && c.z > 4.55 && c.z < 4.8)) kept.push(idx[t], idx[t + 1], idx[t + 2]); }
    if (kept.length !== idx.length) { o.geometry = g.clone(); o.geometry.setIndex(kept); }
  }
  const I = idleMats(), frame = new THREE.MeshStandardMaterial({ name: 'M_CitySignFrame', color: 0x1a1c1f, roughness: 0.4 });
  const grp = new THREE.Group(); grp.name = 'CitySigns'; root.add(grp);
  for (const [s, z] of CITY_SCREENS) {
    const back = new THREE.Mesh(onCove(new THREE.BoxGeometry(SCR.w + 0.04, SCR.h + 0.04, 0.02), s, z, -0.012), frame); back.name = 'CitySignFrame';
    const m = new THREE.Mesh(onCove(new THREE.PlaneGeometry(SCR.w, SCR.h), s, z, -0.025), I.scr); m.name = 'CitySignScreen'; grp.add(back, m);   // 2.5 ס"מ לפני הקשת — לא נחתך בה
  }
  const lb = new THREE.Mesh(new THREE.BoxGeometry(LED.w + 0.04, LED.h + 0.04, 0.04), frame); lb.position.set(0, LED.y, LED.z + 0.025); lb.name = 'CitySignFrame';
  const led = new THREE.Mesh(new THREE.PlaneGeometry(LED.w, LED.h).rotateY(Math.PI), I.led); led.position.set(0, LED.y, LED.z); led.name = 'CitySignLed';
  const rod = new THREE.Mesh(new THREE.BoxGeometry(0.03, 3.06 - LED.y - LED.h / 2, 0.02), frame); rod.position.set(0, (3.06 + LED.y + LED.h / 2) / 2, LED.z + 0.025); rod.name = 'CitySignFrame';
  grp.add(lb, led, rod);
}
// לכל שכפול: המסכים והפס שלו, והחומרים הכהים (לחזור אליהם כשהמצלמה יוצאת)
export function cityClone(obj) {
  const scr = [], I = idleMats(); let led = null;
  obj.traverse(o => { if (o.name === 'CitySignScreen') scr.push(o); if (o.name === 'CitySignLed') led = o; });
  return scr.length ? { scr, led, idle: I } : null;
}
