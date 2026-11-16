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
  return { dm: dm, dmy: dmy, wd: wd, rel: rel, esc: esc, chips: chips, od: od, dirOd: dirOd,
           addDays: addDays, getJSON: getJSON, stopsWord: stopsWord };
})();
