// טעינת טקסטורות ישירות מהבייטים (createImageBitmap), בלי כתובות blob: ובלי בדיקת WebP דרך תמונת data:.
// בדפים מוגבלים (למשל התצוגה הפרטית בטלפון) אלה עלולים להיחסם, ואז האנשים והאוטובוס נראים בצבע אחיד.
import * as THREE from 'three';
const WRAP = { 33071: THREE.ClampToEdgeWrapping, 33648: THREE.MirroredRepeatWrapping, 10497: THREE.RepeatWrapping };
export const texStats = { ok: 0, fail: 0, err: '' };
class BitmapTextures {
  constructor(parser) { this.parser = parser; this.name = 'kb_bitmap_textures'; this.cache = new Map(); }
  loadTexture(index) {
    if (typeof createImageBitmap === 'undefined') return null;
    const p = this.parser, json = p.json, td = json.textures[index];
    const src = td.extensions?.EXT_texture_webp?.source ?? td.source;
    const img = json.images[src];
    if (!img || img.bufferView === undefined) return null;
    if (!this.cache.has(src)) this.cache.set(src, p.getDependency('bufferView', img.bufferView)
      .then(buf => createImageBitmap(new Blob([buf], { type: img.mimeType || 'image/png' }), { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' })));
    return this.cache.get(src).then(bmp => {
      const t = new THREE.Texture(bmp);
      t.flipY = false; t.name = td.name || img.name || '';
      const s = json.samplers?.[td.sampler] || {};
      t.magFilter = s.magFilter === 9728 ? THREE.NearestFilter : THREE.LinearFilter;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.wrapS = WRAP[s.wrapS] ?? THREE.RepeatWrapping; t.wrapT = WRAP[s.wrapT] ?? THREE.RepeatWrapping;
      t.needsUpdate = true; texStats.ok++;
      p.associations.set(t, { textures: index });
      return t;
    }, e => { texStats.fail++; texStats.err = String(e && e.message || e).slice(0, 60); return null; });
  }
}
export function useBitmapTextures(loader) { loader.pluginCallbacks.unshift(parser => new BitmapTextures(parser)); return loader; }
