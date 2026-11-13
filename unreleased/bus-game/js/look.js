// המראה של העולם: תאורה, צללים, שמיים, ערפל ומיפוי טונים — במקום אחד.
// זול לטלפון: אור שמש אחד עם מפת צל אחת (1024 במגע), בלי עיבוד-אחרי. המסגרת של הצל עוקבת אחרי המצלמה
// וגדלה במדרגות כשמתרחקים (צל חד מקרוב, רך ממבט גבוה). הצל לא נכבה אף פעם — כיבוי והדלקה מקמפלים מחדש את כל החומרים.
import * as THREE from 'three';
import { keep } from './texkeep.js';

export const SKY_TOP = 0xb2d5f1, SKY_HORIZON = 0xe6f0f6;

export function setupLook(renderer, scene, { touch = false } = {}) {
  // מיפוי טונים ניטרלי: שומר על הגוונים הבהירים (קירות לבנים, צבעי הקווים) ורק מרכך את האור החזק
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = touch ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;

  // שמיים: מעבר צבע מתכלת למעלה לאובך בהיר באופק (אותו צבע כמו הערפל)
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#' + new THREE.Color(SKY_TOP).getHexString());
  gr.addColorStop(0.62, '#d0e4f2');
  gr.addColorStop(1, '#' + new THREE.Color(SKY_HORIZON).getHexString());
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const sky = keep(new THREE.CanvasTexture(c)); sky.colorSpace = THREE.SRGBColorSpace;
  scene.background = sky;
  scene.fog = new THREE.Fog(SKY_HORIZON, 1400, 4200);

  // מילוי: שמיים קרירים מלמעלה, החזר חם של אבן ואדמה מלמטה; שמש חמה נמוכה מדרום-מערב
  const hemi = new THREE.HemisphereLight(0xe2efff, 0xd2cbbb, 1.6);
  const sun = new THREE.DirectionalLight(0xfff0de, 2.2);
  sun.castShadow = true;
  const S = touch ? 1024 : 2048;
  sun.shadow.mapSize.set(S, S);
  sun.shadow.bias = -0.0004;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 1600;
  scene.add(hemi, sun, sun.target);
  const dir = new THREE.Vector3(-450, 520, 380).normalize();
  return { sun, hemi, dir, mapSize: S, fog: scene.fog, fogMin: { near: 0, far: 0 } };
}

// כל פריים: מסגרת הצל סביב מה שהמצלמה רואה, והערפל לפי המרחק
const _t = new THREE.Vector3();
export function updateLook(L, camera, target) {
  const d = camera.position.distanceTo(target);
  const sun = L.sun, cam = sun.shadow.camera;
  {
    // חצי רוחב המסגרת: 24 מ' ומעלה, במדרגות של ×1.25 (כך שההצמדה לרשת יציבה בזמן זום)
    const half = 24 * Math.pow(1.25, Math.max(0, Math.min(17, Math.round(Math.log(d * 0.85 / 24) / Math.log(1.25)))));
    // מצמידים את מרכז הצל לרשת של כמה פיקסלי צל — פחות "רעידה" של קצוות הצל כשהמצלמה זזה
    const step = (half * 2) / L.mapSize * 4;
    _t.set(Math.round(target.x / step) * step, 0, Math.round(target.z / step) * step);
    sun.target.position.copy(_t);
    sun.position.copy(_t).addScaledVector(L.dir, 700);
    if (cam.right !== half) {
      cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half; cam.updateProjectionMatrix();
      sun.shadow.normalBias = (half * 2) / L.mapSize * 1.5;   // כפיקסל וחצי של מפת הצל — בלי "אקנה" ובלי צל שמתנתק
    }
  }
  // אובך עדין לאופק: מתחיל הרחק ממה שמסתכלים עליו (פי 2.6 מהמרחק), כך שרק הרקע הרחוק דוהה.
  // fogMin — מה שהמשחק דורש (במבט על כל העיר הערפל רחוק יותר)
  const fog = L.fog;
  fog.near = Math.max(L.fogMin.near, 260, d * 2.6);
  fog.far = Math.max(L.fogMin.far, fog.near * 3.2);
  return d;
}
