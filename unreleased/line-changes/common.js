/* מה משתנה בקווים — עזרים משותפים לדף הראשי ולדפי הקווים */
var LC = (function () {
  var DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
  function pd(iso) { var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dm(iso) { var d = pd(iso); return d.getDate() + '.' + (d.getMonth() + 1); }
  function dmy(iso) { return dm(iso) + '.' + pd(iso).getFullYear(); }
  function wd(iso) { return 'יום ' + DAYS[pd(iso).getDay()]; }
  function addDays(iso, n) {
    var d = pd(iso); d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function daysBetween(a, b) { return Math.round((pd(b) - pd(a)) / 864e5); }
  /* "בעוד 3 ימים" / "מחר" / "היום" / "לפני יומיים" */
  function rel(today, iso) {
    var n = daysBetween(today, iso);
    if (n === 0) return 'היום';
    if (n === 1) return 'מחר';
    if (n === 2) return 'בעוד יומיים';
    if (n > 2) return 'בעוד ' + n + ' ימים';
    if (n === -1) return 'אתמול';
    if (n === -2) return 'לפני יומיים';
    return 'לפני ' + (-n) + ' ימים';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function stopsWord(n, kind) {   // kind: 'rem' | 'add' | 'mv'
    if (kind === 'rem') return n === 1 ? 'תחנה אחת יורדת' : n + ' תחנות יורדות';
    if (kind === 'add') return n === 1 ? 'תחנה חדשה אחת' : n + ' תחנות חדשות';
    return n === 1 ? 'תחנה אחת זזה' : n + ' תחנות זזות';
  }
  /* תגיות סיכום לכיוון או לקו (geo/add/rem/mv) */
  function chips(c) {
    var h = '';
    if (c.geo) h += '<span class="chip geo">המסלול משתנה</span>';
    if (c.rem) h += '<span class="chip rem">' + stopsWord(c.rem, 'rem') + '</span>';
    if (c.add) h += '<span class="chip add">' + stopsWord(c.add, 'add') + '</span>';
    if (c.mv) h += '<span class="chip mv">' + stopsWord(c.mv, 'mv') + '</span>';
    return h;
  }
  function od(o) { return (o && o[0] && o[1]) ? o[0] + ' ↔ ' + o[1] : ''; }
  function dirOd(o) { return (o && o[0] && o[1]) ? o[0] + ' ← ' + o[1] : ''; }
  function getJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
  }
  /* polyline מקודד (דיוק 1e-5) → [[lat, lon], ...] — אותו פורמט כמו ב"הקו בזמן" */
  function decodePoly(s) {
    var pts = [], i = 0, la = 0, lo = 0;
    if (!s || typeof s !== 'string') return pts;
    while (i < s.length) {
      for (var ref = 0; ref < 2; ref++) {
        var sh = 0, res = 0, b;
        do { b = s.charCodeAt(i++) - 63; res |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20 && i < s.length);
        var d = (res & 1) ? ~(res >> 1) : (res >> 1);
        if (ref === 0) la += d; else lo += d;
      }
      pts.push([la / 1e5, lo / 1e5]);
    }
    return pts;
  }
  /* "תחנה-עיר<->תחנה-עיר-1#" → [עיר מוצא, עיר יעד] (כמו od_of בבונה) */
  function odOf(long) {
    var out = (long || '').split('<->').map(function (side) {
      side = side.replace(/(-\d+[א-ת]?#?\s*)+$/, '').trim();
      if ((side.match(/-/g) || []).length > 1) side = side.replace(/-[0-9#א-ת]{1,3}$/, '');
      var k = side.lastIndexOf('-');
      return k >= 0 ? side.slice(k + 1).trim() : side;
    });
    return [out[0] || '', out[1] || ''];
  }
  /* השוואת טקסט בחיפוש: בלי גרשיים, י כפולה = י אחת */
  function norm(s) { return String(s || '').replace(/["'״׳`]/g, '').replace(/יי/g, 'י').replace(/-/g, ' ').replace(/\s+/g, ' ').trim(); }
  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  return { decodePoly: decodePoly, odOf: odOf, norm: norm, todayIso: todayIso, daysBetween: daysBetween, dm: dm, dmy: dmy, wd: wd, rel: rel, esc: esc, chips: chips, od: od, dirOd: dirOd,
           addDays: addDays, getJSON: getJSON, stopsWord: stopsWord };
})();
