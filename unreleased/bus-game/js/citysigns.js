// השלטים האלקטרוניים באוטובוס העירוני (הרגיל והחשמלי — אותו פנים): במקום המסך שהיה תלוי מהתקרה באמצע —
// מסך מידע רחב (1.05×0.32 מ') בלוח קיר אפור-בהיר מעל חלון בכל צד, ליד הדלת האמצעית, עם מסגרת לבנה, פונה אל המעבר:
// מספר הקו והיעד, השעה, וקו מסלול עם ארבע התחנות הבאות (דקות, שם התחנה, והקווים האחרים שעוברים בה), ו"עצור"
// כשנוסע ביקש לרדת. ובתקרה מקדימה, מעל אזור הנהג — פס לד כתום דק עם שם התחנה הבאה.
// מתעדכנים רק באוטובוס שהמצלמה בתוכו (actors.js), פעם בשנייה; בשאר האוטובוסים — מסך כבוי. קנבס אחד לכל סוג שלט.
import * as THREE from 'three';
import { keep } from './texkeep.js';

const FONT = 'Heebo, "IBM Plex Sans Hebrew", Arial, sans-serif';
// הלוח: מעל החלון (ראש הזכוכית ב-2.72, הקשת מתחילה ב-2.84) — הלוח מכסה את החלק העליון של החלון, כמו באוטובוס אמיתי.
// x — לפני הזכוכית (1.25) ולפני השלטים הקטנים שעל הקיר (1.18). z — בין העמודים, כדי שלא יסתירו אותו מהמושבים
const SCR = { w: 1.05, h: 0.32, y: 2.635, x: 1.15, panel: [1.25, 0.43] };
export const CITY_SCREENS = [[1, 2.05], [-1, -2.75]];   // [צד, z]: בצד הנהג בין העמודים שב-1.24 וב-2.84, בצד הדלתות בין ‎-1.96 ל-‎-3.56
const LED = { w: 0.9, h: 0.075, y: 2.97, z: 4.62 };       // במקום המסך התלוי הישן
// g במרכז, פונה ל-‎+Z → על הקיר בצד s, פונה אל המעבר, out מטרים מאחורי פני המסך
const onWall = (g, s, z, out = 0) => g.rotateY(-s * Math.PI / 2).translate(s * (SCR.x + out), SCR.y, z);
function canvasMat(w, h, name, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d', { willReadFrequently: true });
  const t = keep(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ name, map: t, toneMapped: false });
  let key = null;
  return { mat, draw(d) { const k = JSON.stringify(d); if (k === key) return; key = k; draw(c.getContext('2d'), w, h, d); t.image = c; keep(t); } };
}
function fit(x, s, max, px, w) { let p = px; x.font = `${w} ${p}px ${FONT}`; while (p > 12 && x.measureText(s).width > max) { p -= 2; x.font = `${w} ${p}px ${FONT}`; } }

// מסך המידע (רקע בהיר): למעלה מימין מספר הקו והיעד, משמאל השעה; מתחת קו מסלול כחול עם ארבע התחנות הבאות —
// הבאה בקצה השמאלי, עם חץ כחול ו"התחנה הבאה"; מתחת לכל עיגול הדקות, שם התחנה (בשתי שורות, לפי "/"), והקווים האחרים שעוברים בה
const BLUE = '#0b3a7a';
function drawScreen(x, W, H, d) {
  x.fillStyle = '#eef4fb'; x.fillRect(0, 0, W, H);
  if (!d) return;
  x.textBaseline = 'middle'; x.direction = 'rtl';
  // מספר הקו והיעד
  x.textAlign = 'right'; x.fillStyle = BLUE; x.font = `800 92px ${FONT}`; x.fillText(d.num, W - 34, 66);
  const nw = x.measureText(d.num).width; x.fillStyle = '#1e293b'; fit(x, d.dest ? 'ל' + d.dest : '', W - nw - 420, 54, 700); x.fillText(d.dest ? 'ל' + d.dest : '', W - 64 - nw, 68);
  x.direction = 'ltr'; x.textAlign = 'left'; x.fillStyle = '#0f172a'; x.font = `800 72px ${FONT}`; x.fillText(d.clock || '', 36, 66); x.direction = 'rtl';
  // קו המסלול והעיגולים: הבאה משמאל
  const st = d.stops.slice(0, 4), n = Math.max(1, st.length), y = 172, x0 = 250, step = (W - 220 - x0) / 3, cx = i => x0 + i * step;
  x.strokeStyle = BLUE; x.lineWidth = 12; x.beginPath(); x.moveTo(cx(0), y); x.lineTo(n > 1 ? cx(n - 1) + 80 : cx(0) + 80, y); x.stroke();
  st.forEach((p, i) => {
    const X = cx(i), next = i === 0;
    x.fillStyle = next ? BLUE : '#ffffff'; x.beginPath(); x.arc(X, y, next ? 26 : 20, 0, 7); x.fill(); x.lineWidth = 8; x.strokeStyle = BLUE; x.stroke();
    if (next) { x.fillStyle = '#1d6fd6'; x.beginPath(); x.moveTo(X - 46, y); x.lineTo(X - 100, y - 32); x.lineTo(X - 100, y - 13); x.lineTo(X - 150, y - 13); x.lineTo(X - 150, y + 13); x.lineTo(X - 100, y + 13); x.lineTo(X - 100, y + 32); x.closePath(); x.fill();
      x.textAlign = 'center'; x.fillStyle = '#1d6fd6'; x.font = `700 34px ${FONT}`; x.fillText('התחנה הבאה', X, y - 52); }
    x.textAlign = 'center'; x.fillStyle = next ? '#1d6fd6' : '#334155'; x.font = `700 38px ${FONT}`; x.fillText(p.min != null ? `${p.min} דק'` : '', X, y + 62);
    const parts = String(p.name || '').split('/').map(t => t.trim()).filter(Boolean).slice(0, 2);
    x.fillStyle = '#0f172a'; parts.forEach((t, k) => { fit(x, t, step - 24, 44, 800); x.fillText(t, X, y + 118 + k * 50); });
    // הקווים האחרים שעוברים בתחנה: תיבות קטנות עם המספר
    const ls = (p.lines || []).slice(0, 5); if (ls.length) { x.font = `700 28px ${FONT}`; const ws = ls.map(l => Math.max(46, x.measureText(l).width + 18)), tw = ws.reduce((a, b) => a + b + 8, -8); let lx = X + tw / 2;
      ls.forEach((l, k) => { lx -= ws[k]; x.strokeStyle = BLUE; x.lineWidth = 3; rr(x, lx, y + 216, ws[k], 40, 6); x.stroke(); x.fillStyle = BLUE; x.fillText(l, lx + ws[k] / 2, y + 237); lx -= 8; }); }
    if (next && d.stop) { x.fillStyle = '#d61f26'; rr(x, X - 80, H - 62, 160, 50, 25); x.fill(); x.fillStyle = '#ffffff'; x.font = `800 36px ${FONT}`; x.fillText('עצור', X, H - 37); }
  });
  x.textAlign = 'right'; x.fillStyle = '#64748b'; x.font = `500 24px ${FONT}`; x.fillText('מידע לנוסעים', W - 34, H - 22);
}
function rr(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
// הנתונים למסך: ארבע התחנות הבאות, הדקות (כ-25 קמ"ש ו-20 שנ' בכל תחנה), והקווים האחרים בכל תחנה; "עצור" — מישהו יורד בתחנה הבאה
export function cityData(b, lines, clock) {
  const L = b.line, n = L.stops.length, k = Math.min(n - 1, b.next), out = [];
  for (let i = k; i < n && out.length < 4; i++) {
    const s = L.stops[i], others = [...new Set((lines || []).filter(M => M !== L && M.stops?.some(q => q.id === s.id)).map(M => String(M.def.number)))].sort((a, b) => a.localeCompare(b, 'he', { numeric: true }));
    out.push({ name: s.name, min: Math.max(0, Math.round(((L.stopS[i] - b.s) / 7 + 20 * (i - k)) / 60)) || (i === k ? 1 : 0), lines: others });
  }
  return { num: String(L.def.number), dest: L.stops[n - 1]?.name || '', clock, stops: out, stop: b.state === 'drive' && k > 0 && k < n - 1 && b.pax.some(p => p.to === k) };
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
export function cityDisplays() { return { scr: canvasMat(1600, 488, 'M_CityDetScr', drawScreen), led: canvasMat(1024, 64, 'M_CityDetLed', drawLed) }; }

// פעם אחת לדגם: מוציאים את המסך התלוי ואת התושבת שלו, ומוסיפים את השלטים
// במיניבוס החשמלי (emini.js): הגג נמוך יותר (y מעל 2.1 → 2.1 + (y − 2.1) × 0.762), מסך אחד בצד הנהג קרוב לחזית, ופס הלד באותו z
export const EMINI_SIGNS = { screens: [[1, 2.05]], k: 0.762 };
export function addCitySigns(root, opt = null) {
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
  const panel = new THREE.MeshStandardMaterial({ name: 'M_CitySignPanel', color: 0xd9dcdf, roughness: 0.6 }), bezel = new THREE.MeshStandardMaterial({ name: 'M_CitySignBezel', color: 0xf3f4f5, roughness: 0.35 });
  const grp = new THREE.Group(); grp.name = 'CitySigns'; root.add(grp);
  const lowY = y => opt?.k ? 2.1 + (y - 2.1) * opt.k : y, dy = lowY(SCR.y) - SCR.y, ly = lowY(LED.y) - LED.y;
  for (const [s, z] of opt?.screens || CITY_SCREENS) {
    const p = new THREE.Mesh(onWall(new THREE.BoxGeometry(SCR.panel[0], SCR.panel[1], 0.02), s, z, 0.03), panel); p.name = 'CitySignPanel';
    const b = new THREE.Mesh(onWall(new THREE.BoxGeometry(SCR.w + 0.07, SCR.h + 0.07, 0.02), s, z, 0.012), bezel); b.name = 'CitySignBezel';
    const m = new THREE.Mesh(onWall(new THREE.PlaneGeometry(SCR.w, SCR.h), s, z), I.scr); m.name = 'CitySignScreen'; grp.add(p, b, m);
    if (dy) for (const o of [p, b, m]) o.position.y += dy;
  }
  const lb = new THREE.Mesh(new THREE.BoxGeometry(LED.w + 0.04, LED.h + 0.04, 0.04), frame); lb.position.set(0, LED.y, LED.z + 0.025); lb.name = 'CitySignFrame';
  const led = new THREE.Mesh(new THREE.PlaneGeometry(LED.w, LED.h).rotateY(Math.PI), I.led); led.position.set(0, LED.y, LED.z); led.name = 'CitySignLed';
  const rod = new THREE.Mesh(new THREE.BoxGeometry(0.03, 3.06 - LED.y - LED.h / 2, 0.02), frame); rod.position.set(0, (3.06 + LED.y + LED.h / 2) / 2, LED.z + 0.025); rod.name = 'CitySignFrame';
  if (ly) { lb.position.y += ly; led.position.y += ly; rod.visible = false; }   // בגג הנמוך הפס צמוד לתקרה
  grp.add(lb, led, rod);
}
// לכל שכפול: המסכים והפס שלו, והחומרים הכהים (לחזור אליהם כשהמצלמה יוצאת)
export function cityClone(obj) {
  const scr = [], I = idleMats(); let led = null;
  obj.traverse(o => { if (o.name === 'CitySignScreen') scr.push(o); if (o.name === 'CitySignLed') led = o; });
  return scr.length ? { scr, led, idle: I } : null;
}
