/* צי הרכבים — "מעברים": אילו רכבים עברו מחברה לחברה או מעיר לעיר (שלמה 16.09).

   הלוגיקה יושבת בקובץ נפרד כדי שאפשר יהיה לבדוק אותה אוטומטית (tests/)
   ולא רק בעין. הדף (index.html) טוען אותו כ-<script>, והבדיקה טוענת
   אותו ב-Node דרך module.exports.

   מונחים:
   - "תקופת חברה": רשומת שידור של לוחית אצל מפעיל אחד (מ-fleet.json):
     {op, first, last, days} — נצפה לראשונה/לאחרונה וימי פעילות שנמדדו.
   - "תקופת עיר": העיר של קו שהרכב שירת באותה תקופת חברה. כשיש רישום
     "קו → חודשים" (fleet-moves.json, cm) התקופה היא החודשים של קווי העיר;
     אחרת — כל תקופת החברה.
   - "מעבר" מ-P ל-Q: Q התחילה אחרי P ונמשכה אחריה, ו-P לא נמשכה הרבה
     אחרי תחילת Q (overlap — ברירת מחדל 120 יום: בהחלפת חברה הרכב משדר
     זמן-מה תחת שתי החברות). בתוך אותה חברה — רק עיר→עיר עם רישום
     חודשים, ורק אם העיר הראשונה נגמרה לפני שהשנייה התחילה.
   - minDays: תקופה קצרה מ-X ימי פעילות (בליפ של יום אצל חברה אחות)
     אינה מעבר של ממש. */
(function (root) {
  "use strict";
  var DAY = 864e5, MBASE = 2020 * 12;
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function mFirst(i) { var t = MBASE + i; return Math.floor(t / 12) + "-" + pad(t % 12 + 1) + "-01"; }
  function mLast(i) { var t = MBASE + i, y = Math.floor(t / 12), m = t % 12 + 1; return y + "-" + pad(m) + "-" + pad(new Date(Date.UTC(y, m, 0)).getUTCDate()); }
  function days(a, b) { return Math.round((Date.parse(a) - Date.parse(b)) / DAY); }

  /* recs: [{op, first, last, days}] של לוחית אחת · mv: fleet-moves.m[לוחית] */
  function periods(recs, mv) {
    var out = [];
    recs.forEach(function (r, si) {
      out.push({ kind: "op", key: "op:" + r.op, first: r.first, last: r.last, days: r.days, s: si, mon: false });
      var e = mv && mv[String(r.op)];
      if (!e) return;
      var cities = e[0] || [], cm = e[1] || null;
      cities.forEach(function (c) {
        var m = cm && cm[c];
        out.push({ kind: "city", key: "city:" + c, first: m ? mFirst(m[0]) : r.first, last: m ? mLast(m[1]) : r.last, days: r.days, s: si, mon: !!m });
      });
    });
    return out;
  }

  /* כל המעברים של לוחית אחת: [{from, to, left, arrived, fromDays, toDays}] */
  function moves(recs, mv, opts) {
    opts = opts || {};
    var ov = opts.overlap == null ? 120 : opts.overlap, md = opts.minDays == null ? 0 : opts.minDays;
    var P = periods(recs, mv), out = [];
    for (var i = 0; i < P.length; i++) {
      for (var j = 0; j < P.length; j++) {
        var a = P[i], b = P[j];
        if (i === j || a.key === b.key) continue;
        if (a.s === b.s) {
          if (!(a.kind === "city" && b.kind === "city" && a.mon && b.mon && a.last < b.first)) continue;
        } else {
          if (!(b.first > a.first && b.last > a.last)) continue;
          if (days(a.last, b.first) > ov) continue;
        }
        if (md && ((a.days != null && a.days < md) || (b.days != null && b.days < md))) continue;
        out.push({ from: a.key, to: b.key, left: a.last, arrived: b.first, fromDays: a.days, toDays: b.days });
      }
    }
    return out;
  }

  /* לוחית אחת = רכב אחד (שלמה 18.11): רכב שעבר בין חברות רשום פעם בכל חברה, אבל הוא רכב אחד.
     recs: [{op, first, last, days, r, kd, kt, gaps, occ}] — כל הרשומות של הלוחית.
       days: ימי פעילות שנמדדו (אם אין — אורך התקופה) · r: נסיעות ליום · kd/kt: ק"מ ליום/סה"כ
       gaps: [['YYYY-MM','YYYY-MM']...] חודשים בלי שידור אצל אותה חברה · occ: נסיעות בודדות אצל חברה אחרת
     o: {updated, retireDays}
     מחזיר: נצפה לראשונה/לאחרונה על פני כל החברות, פעיל (לפי התקופה האחרונה בכלל), שרשרת החברות
     לפי סדר הזמן, ממוצעים משוקללים, ונפילות של ממש בלבד — חודשים שבהם הרכב לא שידר אצל אף חברה.
     מעבר לחברה אחרת אינו נפילה. */
  function plate(recs, o) {
    var rs = recs.slice().sort(function (a, b) { return a.first < b.first ? -1 : a.first > b.first ? 1 : 0; });
    var first = null, last = null, chain = [], rw = 0, rs_ = 0, kt = null, kdd = 0, gaps = [];
    rs.forEach(function (r) {
      if (first === null || r.first < first) first = r.first;
      if (last === null || r.last > last) last = r.last;
      if (!r.occ && chain[chain.length - 1] !== r.op) chain.push(r.op);
      if (r.r != null) { var w = r.days != null ? r.days : days(r.last, r.first) + 1; if (w > 0) { rw += w; rs_ += r.r * w; } }
      if (r.kt != null) { kt = (kt || 0) + r.kt; if (r.kd > 0) kdd += r.kt / r.kd; }
      (r.gaps || []).forEach(function (g) {
        var other = rs.some(function (q) { return q !== r && q.first.slice(0, 7) <= g[1] && q.last.slice(0, 7) >= g[0]; });
        if (!other) gaps.push(g);
      });
    });
    var u = o && o.updated, rd = o && o.retireDays != null ? o.retireDays : 30;
    return {
      first: first, last: last, active: u ? days(u, last) <= rd : null, chain: chain,
      r: rw ? Math.round(rs_ / rw * 10) / 10 : null,
      kd: kt != null && kdd > 0 ? Math.round(kt / kdd) : null, kt: kt,
      gaps: gaps.length ? gaps : null
    };
  }

  var api = { periods: periods, moves: moves, plate: plate, mFirst: mFirst, mLast: mLast };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.FleetMoves = api;
})(typeof window !== "undefined" ? window : globalThis);
