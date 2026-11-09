// טקסטורות שמצוירות בקוד (קנבס): בטלפון הדפדפן עלול למחוק את התוכן של קנבס כשהדף ברקע (או כשהקשר הגרפי אובד),
// ואז אחרי החזרה הבניינים נראים שחורים והקרקע מנוקדת. לכן שומרים עותק של הפיקסלים (ImageData) ומעלים ממנו, לא מהקנבס.
import * as THREE from 'three';
export function keep(tex) {
  const c = tex.image;
  if (c && c.getContext) {
    try { tex.image = c.getContext('2d').getImageData(0, 0, c.width, c.height); tex.needsUpdate = true; } catch { }
  }
  return tex;
}
// אחרי חזרה לדף / שחזור הקשר הגרפי: מעלים מחדש את כל הטקסטורות ואת מפת הצל
export function refreshAll(scene, renderer, recompile = false) {
  const seen = new Set();
  const touch = t => { if (t && t.isTexture && !seen.has(t)) { seen.add(t); if (t.image) t.needsUpdate = true; } };
  scene.traverse(o => {
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) { for (const k of ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'aoMap', 'envMap']) touch(m[k]); if (recompile) m.needsUpdate = true; }
  });
  touch(scene.background); touch(scene.environment);
  if (renderer.shadowMap) renderer.shadowMap.needsUpdate = true;
  return seen.size;
}
