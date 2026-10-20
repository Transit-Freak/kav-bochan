/* הקו המודיע — רשימת התראות השירות ומפה לכל התראה (שלמה 18.10.2026).
   הנתונים: data/alerts.json (כל ההתראות), data/rc/<id>.json (מסלולים ותחנות). */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var CAUSE_COLOR = { works: "#B45309", police: "#1E3A8A", protest: "#7C3AED", event: "#0E7490", accident: "#BE123C",
    stuck: "#9A3412", weather: "#0369A1", strike: "#4B5563", traffic: "#A16207", fault: "#57534E", relocate: "#0F766E", other: "#6B7280" };
  var ALL = [], CAUSES = {}, ALIAS = {}, GROUPS = {}, sel = null, when = "now", cause = null, map = null, layer = null, cur = null;
  var TZ = "Asia/Jerusalem";
  var fmtD = function (t) { return new Intl.DateTimeFormat("he-IL", { timeZone: TZ, day: "numeric", month: "numeric" }).format(new Date(t * 1000)); };
  var fmtT = function (t) { return new Intl.DateTimeFormat("he-IL", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(t * 1000)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var now = function () { return Date.now() / 1000; };
  function dayBounds() {
    // היום לפי שעון ישראל
    var p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    var noon = Date.parse(p + "T12:00:00Z") / 1000;
    var h = +new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(new Date(noon * 1000));
    var start = noon - 12 * 3600 - (h - 12) * 3600;
    return [start, start + 86400];
  }
  function periods(a) { return (a.per || []).map(function (p) { return [p[0] || 0, p[1] || 4e9]; }); }
  function isNow(a) { var t = now(); return periods(a).some(function (p) { return p[0] <= t && t <= p[1]; }); }
  function isToday(a) { var b = dayBounds(); return periods(a).some(function (p) { return p[0] < b[1] && p[1] > b[0]; }); }
  // התאריכים והשעות (שלמה 19.10: "14.10 05:00 – 20.10 23:30" מבלבל — מספרים צמודים בלי מילים):
  // כמה פעמים באותן שעות → "14.10–20.10, כל לילה 23:30–05:00"; תקופה אחת → "מ-14.10 בשעה 05:00 עד 20.10 בשעה 23:30"
  function span(a) {
    var ps = periods(a); if (!ps.length) return "";
    var s = Math.min.apply(null, ps.map(function (p) { return p[0]; })), e = Math.max.apply(null, ps.map(function (p) { return p[1]; }));
    var open = e > 3.9e9;
    if (ps.length > 1 && !open) {
      var hrs = {}; ps.forEach(function (p) { hrs[fmtT(p[0]) + "|" + fmtT(p[1])] = 1; });
      var keys = Object.keys(hrs);
      if (keys.length === 1) {
        var t0 = fmtT(ps[0][0]), t1 = fmtT(ps[0][1]), night = fmtD(ps[0][0]) !== fmtD(ps[0][1]);
        var dd = fmtD(s) === fmtD(e - (night ? 86400 : 0)) ? fmtD(s) : fmtD(s) + "–" + fmtD(e - (night ? 86400 : 0));
        return dd + ", " + (night ? "כל לילה " : "כל יום ") + t0 + "–" + t1;
      }
    }
    // כמה פעמים בשעות שונות (שישי קצר יותר, למשל) — התאריכים, ומספר הפעמים; השעות של כל פעם בנוסח
    if (ps.length > 1 && !open) return (fmtD(s) === fmtD(e) ? fmtD(s) : fmtD(s) + "–" + fmtD(e)) + ", " + ps.length + " פעמים בשעות שונות";
    var multi = ps.length > 1 ? " (" + ps.length + " פעמים)" : "";
    if (open) return "מ-" + fmtD(s) + " בשעה " + fmtT(s) + ", עד הודעה חדשה" + multi;
    if (fmtD(s) === fmtD(e)) return fmtD(s) + ", " + fmtT(s) + "–" + fmtT(e) + multi;
    return "מ-" + fmtD(s) + " בשעה " + fmtT(s) + " עד " + fmtD(e) + " בשעה " + fmtT(e) + multi;
  }
  // מספרי הקווים בהתראה, ממוינים לפי המספר: 3, 5, 5א, 6, 32, 80, 80א
  var lineKey = function (x) { var m = /^(\d+)/.exec(x); return [m ? +m[1] : 1e9, x]; };
  function nums(a) {
    var seen = {}, out = [];
    (a.lines || []).forEach(function (l) { if (l[0] && !seen[l[0]]) { seen[l[0]] = 1; out.push(String(l[0])); } });
    return out.sort(function (x, y) { var p = lineKey(x), q = lineKey(y); return p[0] - q[0] || (p[1] < q[1] ? -1 : p[1] > q[1] ? 1 : 0); });
  }
  // חיפוש לפי מילים (שלמה 18.10: "16 אשדוד" לא מצא כלום): כל מילה צריכה להתאים —
  // מספר קו בדיוק (16 לא מוצא 160), ומילה — בכותרת, בנוסח, בשמות התחנות או ביעד
  function matches(a, q) {
    if (!q) return true;
    var hay = null, ns = null;
    return q.split(/\s+/).every(function (w) {
      w = w.replace(/^קו$/, "");
      if (!w) return true;
      if (/^\d+[א-ת]?$/.test(w)) return (ns = ns || nums(a)).indexOf(w) >= 0;
      hay = hay || [a.h, a.d, (a.ag || []).join(" "), (a.rm || []).map(function (s) { return s.join(" "); }).join(" "),
        (a.add || []).map(function (s) { return s.join(" "); }).join(" "), (a.lines || []).map(function (l) { return l[2]; }).join(" ")].join(" ");
      return hay.indexOf(w) >= 0;
    });
  }
  function visible() {
    var q = $("q").value.trim(), only = $("onlyMap").checked;
    return ALL.filter(function (a) {
      if (when === "now" && !isNow(a)) return false;
      if (when === "today" && !isToday(a)) return false;
      if (cause && a.cause !== cause) return false;
      if (only && !a.map) return false;
      return matches(a, q);
    });
  }
  function drawChips() {
    var base = ALL.filter(function (a) { return (when === "all" || (when === "now" ? isNow(a) : isToday(a))); });
    // הודעות מקובצות נספרות פעם אחת, כמו בכרטיסים
    var g = {}; base = base.filter(function (a) { var k = a.grp && GROUPS[a.grp] && GROUPS[a.grp].length > 1 ? "g" + a.grp : a.id; if (g[k]) return false; g[k] = 1; return true; });
    var cnt = {}; base.forEach(function (a) { cnt[a.cause] = (cnt[a.cause] || 0) + 1; });
    var keys = Object.keys(cnt).sort(function (x, y) { return cnt[y] - cnt[x]; });
    $("causes").innerHTML = '<button type="button" class="chip' + (cause ? "" : " on") + '" data-c="">הכול <b>' + base.length + "</b></button>" +
      keys.map(function (k) { return '<button type="button" class="chip' + (cause === k ? " on" : "") + '" data-c="' + k + '"><i style="background:' + (CAUSE_COLOR[k] || "#888") + '"></i>' + esc(CAUSES[k] || k) + " <b>" + cnt[k] + "</b></button>"; }).join("");
    Array.prototype.forEach.call($("causes").querySelectorAll("button"), function (b) {
      b.onclick = function () { cause = b.getAttribute("data-c") || null; drawChips(); drawList(); };
    });
  }
  // כמה הודעות של חברות שונות על אותן עבודות (grp, tools/alerts_fetch.py group_alerts) — כרטיס אחד
  // ודף אחד: כל הקווים על מפה אחת, והנוסח של כל חברה בנפרד (שלמה 20.10)
  function members(a) { return a.grp && GROUPS[a.grp] && GROUPS[a.grp].length > 1 ? GROUPS[a.grp] : [a]; }
  function combine(a) {
    var ms = members(a);
    if (ms.length < 2) return a;
    var uniq = function (arr, key) { var seen = {}; return arr.filter(function (x) { var k = key(x); if (seen[k]) return false; seen[k] = 1; return true; }); };
    var cat = function (f) { return [].concat.apply([], ms.map(f)); };
    return Object.assign({}, a, {
      ms: ms,
      lines: uniq(cat(function (m) { return m.lines || []; }), function (l) { return l[0] + "|" + l[1]; }),
      rm: uniq(cat(function (m) { return m.rm || []; }), function (x) { return x[0]; }),
      add: uniq(cat(function (m) { return m.add || []; }), function (x) { return x[0]; }),
      ag: uniq(cat(function (m) { return m.ag || []; }), function (x) { return x; }),
      dep: cat(function (m) { return m.dep || []; }),
      per: cat(function (m) { return m.per || []; }),
      rcs: uniq(cat(function (m) { return m.rcs || (m.map ? [m.id] : []); }), function (x) { return x; }),
      map: ms.some(function (m) { return m.map; }),
    });
  }
  function drawList() {
    var seenG = {};
    var v = visible().filter(function (a) { if (!a.grp || !GROUPS[a.grp] || GROUPS[a.grp].length < 2) return true; if (seenG[a.grp]) return false; seenG[a.grp] = 1; return true; })
      .map(combine);
    if (!v.length) { $("list").innerHTML = '<div class="empty">אין התראות שמתאימות לחיפוש</div>'; return; }
    $("list").innerHTML = v.map(function (a) {
      var n = nums(a);
      // קישור אמיתי (שלמה 19.10): לחיצה ארוכה או גלגלת פותחות את ההתראה בכרטיסייה חדשה
      var ids = (a.ms || [a]).map(function (m) { return m.id; });
      return '<a class="card' + (ids.indexOf(sel) >= 0 ? " on" : "") + '" href="#' + esc(a.id) + '" data-id="' + a.id + '" data-ids="' + ids.join(" ") + '">' +
        '<div class="meta"><span class="cz" style="background:' + (CAUSE_COLOR[a.cause] || "#888") + '">' + esc(CAUSES[a.cause] || "") + "</span>" +
        (isNow(a) ? '<span class="now">פעיל עכשיו</span>' : "") + "<span>" + esc(span(a)) + "</span></div>" +
        '<div class="h">' + esc(a.h || "התראה") + "</div>" +
        (a.ms ? '<div class="meta"><span class="grp">' + a.ms.length + " הודעות על אותן עבודות · " + esc(a.ag.join(", ")) + "</span></div>" : "") +
        '<div class="meta">' + (n.length ? "<span>" + n.slice(0, 12).map(function (x) { return '<span class="ln">' + esc(x) + "</span>"; }).join("") + (n.length > 12 ? " +" + (n.length - 12) : "") + "</span>" : "") +
        (a.rm && a.rm.length ? "<span>" + a.rm.length + " תחנות בוטלו זמנית</span>" : "") +
        (a.map ? "<span>🗺 מפה</span>" : "") + (a.dep && a.dep.length ? "<span>שינוי בשעות</span>" : "") + "</div></a>";
    }).join("");
    Array.prototype.forEach.call($("list").querySelectorAll(".card"), function (c) {
      c.onclick = function (e) {
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button > 0) return;   // כרטיסייה או חלון חדש — הדפדפן מטפל
        e.preventDefault(); open(c.getAttribute("data-id"), true);
      };
    });
  }
  function getJSON(u) { return fetch(u, { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }

  function open(id, push) {
    if (ALIAS[id]) id = ALIAS[id];   // הודעה שאוחדה להודעה מפורטת יותר על אותו שינוי
    var a = ALL.filter(function (x) { return x.id === id; })[0];
    if (!a) return;
    a = combine(a);
    sel = id;
    if (push) { try { history.replaceState(null, "", "#" + id); } catch (e) { /* ignore */ } }
    Array.prototype.forEach.call($("list").querySelectorAll(".card"), function (c) { c.classList.toggle("on", (c.getAttribute("data-ids") || "").split(" ").indexOf(id) >= 0); });
    var rmL = (a.rm || []).map(function (s) { return '<li><span class="c">' + esc(s[0]) + "</span><span>" + esc(s[1]) + "</span></li>"; }).join("");
    var adL = (a.add || []).map(function (s) { return '<li><span class="c">' + esc(s[0]) + "</span><span>" + esc(s[1]) + "</span></li>"; }).join("");
    var dep = (a.dep || []).map(function (d) {
      return "<tr><td><b>" + esc(d[0]) + "</b> " + esc(d[2] || "") + '</td><td class="hrs">' +
        (d[3] || []).map(function (h) { return '<span class="add">+' + esc(h) + "</span>"; }).join(" ") + " " +
        (d[4] || []).map(function (h) { return '<span class="rem">' + esc(h) + "</span>"; }).join(" ") + "</td></tr>";
    }).join("");
    // הקווים בהתראה — כל אחד מקשר לדף שלו בהקו בזמן (כשידוע הכיוון והחלופה)
    var seen = {}, lnL = (a.lines || []).filter(function (l) { var k = l[0] + "|" + (l[2] || ""); if (!l[0] || seen[k]) return false; seen[k] = 1; return true; })
      .sort(function (x, y) { return (parseInt(x[0], 10) || 1e9) - (parseInt(y[0], 10) || 1e9) || String(x[0]).localeCompare(String(y[0])); })
      .map(function (l) {
        var t = '<b>' + esc(l[0]) + "</b>" + (l[2] ? " ← " + esc(l[2]) : "");
        return /-/.test(l[1] || "") ? '<a class="lnk" href="../line-history/#' + encodeURIComponent(l[1]) + '" title="ההיסטוריה של הקו בהקו בזמן">' + t + "</a>" : '<span class="lnk">' + t + "</span>";
      }).join("");
    document.body.classList.add("sel");
    $("det").innerHTML =
      '<button type="button" class="back" id="back">→ לכל ההתראות</button>' +
      '<div class="meta"><span class="cz" style="background:' + (CAUSE_COLOR[a.cause] || "#888") + '">' + esc(CAUSES[a.cause] || "") + "</span>" +
      (isNow(a) ? '<span class="now">פעיל עכשיו</span>' : "") + "<span>" + esc(span(a)) + "</span>" + (a.ag && a.ag.length ? "<span>" + esc(a.ag.join(", ")) + "</span>" : "") + "</div>" +
      "<h2>" + esc(a.h || "התראה") + "</h2>" +
      (lnL && !a.map ? '<div><h3>הקווים</h3><div class="lns">' + lnL + "</div></div>" : "") +
      (a.map ? '<div class="routes" id="routes"></div><div id="map"></div><div class="legend" id="legend"></div><div id="vbox"></div>' : "") +
      (a.ms ? '<div><h3>נוסח ההודעות (' + a.ms.length + ")</h3>" + a.ms.map(function (m) {
        return '<details class="msg"' + (m.id === id ? " open" : "") + "><summary><b>" + esc((m.ag || []).join(", ") || "הודעה") + "</b> · " + esc(m.h || "") +
          ' <span class="when">' + esc(span(m)) + '</span></summary><div class="txt">' + esc(m.d || "אין פירוט בהודעה.") + "</div></details>";
      }).join("") : '<div><h3>נוסח ההודעה</h3><div class="txt">' + esc(a.d || "אין פירוט בהודעה.") + "</div>") +
      (a.also && a.also.length ? '<p class="note">' + (a.also.length === 1 ? "הודעה נוספת על אותו שינוי, עם פחות פרטים, אוחדה לכאן." : a.also.length + " הודעות נוספות על אותו שינוי, עם פחות פרטים, אוחדו לכאן.") + "</p>" : "") + "</div>" +
      (rmL || adL ? '<div class="two">' + (rmL ? '<div><h3>תחנות שבוטלו זמנית</h3><ul class="st">' + rmL + "</ul></div>" : "") + (adL ? '<div><h3>תחנות חלופיות</h3><ul class="st">' + adL + "</ul></div>" : "") + "</div>" : "") +
      (dep ? '<div><h3>שינויים בשעות היציאה</h3><table class="dep"><tr><th>קו</th><th>שעות שנוספו / בוטלו</th></tr>' + dep + "</table></div>" : "");
    $("back").onclick = function () {
      document.body.classList.remove("sel"); sel = null;
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ }
      Array.prototype.forEach.call($("list").querySelectorAll(".card"), function (c) { c.classList.remove("on"); if ((c.getAttribute("data-ids") || "").split(" ").indexOf(id) >= 0) c.scrollIntoView({ block: "center" }); });
    };
    if (matchMedia("(max-width: 900px)").matches) window.scrollTo(0, 0);
    if (!a.map) return;
    // המפה של ההתראה, ושל הודעות שאוחדו אליה — קווים שאין במפה שלה מתווספים
    Promise.all((a.rcs || [id]).map(function (x) { return getJSON("data/rc/" + x + ".json"); })).then(function (all) {
      if (sel !== id) return;
      var rc = null;
      all.forEach(function (x) {
        if (!x || !x.routes) return;
        if (!rc) { rc = x; return; }
        var have = {}; rc.routes.forEach(function (r) { have[r.rd] = 1; });
        rc.routes = rc.routes.concat(x.routes.filter(function (r) { return !have[r.rd]; }));
        rc.stops = Object.assign({}, x.stops || {}, rc.stops || {});
        rc.xadd = (rc.xadd || []).concat((x.xadd || []).filter(function (s) { return (rc.xadd || []).indexOf(s) < 0; }));
      });
      if (!rc || !rc.routes || !rc.routes.length) { $("routes").innerHTML = '<p class="note">המפה של ההתראה הזו לא נטענה.</p>'; return; }
      rc.routes.sort(function (x, y) { var p = lineKey(String(x.num || "")), q = lineKey(String(y.num || "")); return p[0] - q[0] || (p[1] < q[1] ? -1 : p[1] > q[1] ? 1 : 0) || String(x.to || "").localeCompare(String(y.to || ""), "he"); });
      cur = { a: a, rc: rc };
      $("routes").innerHTML = rc.routes.map(function (r, i) {
        return '<button type="button" data-i="' + i + '">קו ' + esc(r.num) + " ← " + esc(r.to || "") + (r.alt && r.alt !== "#" ? " · " + esc(r.alt) : "") + "</button>";
      }).join("");
      Array.prototype.forEach.call($("routes").querySelectorAll("button"), function (b) { b.onclick = function () { showRoute(+b.getAttribute("data-i")); }; });
      showRoute(0);
    });
  }

  function nearestIdx(shape, p) {
    var best = 0, bd = 1e18;
    for (var i = 0; i < shape.length; i++) { var dx = shape[i][0] - p[0], dy = (shape[i][1] - p[1]) * 0.85, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
    return best;
  }
  function showRoute(i) {
    var r = cur.rc.routes[i], stops = cur.rc.stops || {};
    Array.prototype.forEach.call($("routes").querySelectorAll("button"), function (b) { b.classList.toggle("on", +b.getAttribute("data-i") === i); });
    if (!window.L) { $("map").innerHTML = '<p class="note" style="padding:12px">המפה לא נטענה.</p>'; return; }
    // כל התראה בונה את #map מחדש — מפה שנוצרה על האלמנט הקודם כבר לא בדף, ומה שמצויר
    // עליה לא נראה (שלמה 18.10: מהתראה שנייה והלאה — ריבוע אפור)
    if (map && map.getContainer() !== $("map")) { map.remove(); map = null; layer = null; }
    if (!map) {
      map = L.map("map", { scrollWheelZoom: !(window.matchMedia && window.matchMedia("(pointer: coarse)").matches) });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>', maxZoom: 19 }).addTo(map);
    } else { map.invalidateSize(); }
    if (layer) layer.remove();
    layer = L.layerGroup().addTo(map);
    var shape = r.shape || [];
    var del = (r.del || []).filter(function (s) { return stops[s]; });
    var seq = (r.seq || []).filter(function (s) { return stops[s[0]]; });
    var focus = [];
    // הקטע הסגור במסלול הרגיל: בין התחנה המבוטלת הראשונה לאחרונה
    var ci = del.map(function (s) { return nearestIdx(shape, stops[s]); });
    var c0 = ci.length ? Math.min.apply(null, ci) : -1, c1 = ci.length ? Math.max.apply(null, ci) : -1;
    var est = r.est && r.est.path;
    if (est) { c0 = nearestIdx(shape, est[0]); c1 = Math.max(c0, nearestIdx(shape, est[est.length - 1])); }
    else if (ci.length) {
      // תחנת המוצא (או הסוף) בוטלה: הקו מתחיל בתחנה הראשונה שנשארה, והקטע שלפניה לא נסוע (שלמה 20.10:
      // סומנה רק התחנה המבוטלת, בלי הקטע)
      var kept = seq.filter(function (s) { return !s[1]; }).map(function (s) { return nearestIdx(shape, stops[s[0]]); });
      if (kept.length) {
        var kmin = Math.min.apply(null, kept), kmax = Math.max.apply(null, kept);
        if (c1 < kmin) { c0 = 0; c1 = kmin; } else if (c0 > kmax) { c0 = kmax; c1 = shape.length - 1; }
      }
    }
    if (c0 >= 0) {
      L.polyline(shape.slice(0, c0 + 1), { color: "#64748B", weight: 4, opacity: 0.8 }).addTo(layer);
      L.polyline(shape.slice(c0, c1 + 1), { color: "#64748B", weight: 4, opacity: 0.7, dashArray: "6 7" }).addTo(layer);
      L.polyline(shape.slice(c1), { color: "#64748B", weight: 4, opacity: 0.8 }).addTo(layer);
      focus = focus.concat(shape.slice(Math.max(0, c0 - 3), c1 + 4));
    } else {
      L.polyline(shape, { color: "#64748B", weight: 4, opacity: 0.8 }).addTo(layer);
    }
    var legend = ['<span><svg viewBox="0 0 26 12"><path d="M1 6H25" stroke="#64748B" stroke-width="3" fill="none"/></svg>המסלול הרגיל</span>',
      '<span><svg viewBox="0 0 26 12"><path d="M1 6H25" stroke="#64748B" stroke-width="3" stroke-dasharray="4 3" fill="none"/></svg>הקטע שנסגר</span>'];
    var note = "";
    if (est) {
      L.polyline(est, { color: "#fff", weight: 9, opacity: 0.9 }).addTo(layer);
      L.polyline(est, { color: "#E2531F", weight: 5 }).addTo(layer);
      focus = focus.concat(est);
      legend.push('<span><svg viewBox="0 0 26 12"><path d="M1 6H25" stroke="#E2531F" stroke-width="4" fill="none"/></svg>מסלול חלופי משוער, לפי ההודעה</span>');
    } else {
      // בלי מסלול לפי הנוסח — רק התחנות, בלי קו ישר ביניהן (שלמה 18.10)
      note = r.why === "no-text" ? "בהודעה אין תיאור של המסלול החלופי, ולכן אין מסלול על המפה — רק התחנות."
        : r.why === "stops-only" ? "בהודעה יש רק רשימה של תחנות שבוטלו, בלי תיאור של המסלול החלופי. לכן על המפה רק התחנות."
        : r.why === "skip" ? "לפי ההודעה הקו נשאר במסלול שלו ורק לא עוצר בתחנה שבוטלה."
        : r.why === "relocate" ? "התחנה הועתקה למקום אחר, והקו נשאר במסלול שלו."
        : "לא הצלחנו למצוא את המסלול החלופי לפי הנוסח של ההודעה (" + ({ "no-match": "הרחובות לא נמצאו במפה או שהנוסח לא מתאים לקו", "no-cut": "לא ברור איפה הקטע שנסגר", area: "האזור גדול מדי", osm: "מפת הרחובות לא נטענה", time: "עוד לא חושב — יושלם בעדכון הבא" }[r.why || "time"] || "לא ידוע") + "). מוצגות רק התחנות.";
    }
    del.forEach(function (s) {
      var st = stops[s];
      L.marker(st.slice(0, 2), { icon: L.divIcon({ className: "", html: '<div class="xm"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }) })
        .bindTooltip((st[3] || "") + (st[2] ? " · " + st[2] : "") + " · מבוטלת").addTo(layer);
      focus.push(st.slice(0, 2));
    });
    seq.forEach(function (s) {
      if (!s[1]) return;
      var st = stops[s[0]];
      L.marker(st.slice(0, 2), { icon: L.divIcon({ className: "", html: '<div class="am"></div>', iconSize: [12, 12], iconAnchor: [6, 6] }) })
        .bindTooltip((st[3] || "") + (st[2] ? " · " + st[2] : "") + " · תחנה חלופית").addTo(layer);
      focus.push(st.slice(0, 2));
    });
    // תחנות חלופיות שכתובות רק בנוסח ההודעה (xadd): של הפסקה של הקו כשיש (r.xadd), אחרת של ההודעה —
    // ולא תחנה שמבוטלת בקו הזה (תל אביב 20.10, אבן גבירול: 25621 חלופית לקו 149 ומבוטלת בקו 445)
    var xadd = (r.xadd || cur.rc.xadd || []).filter(function (s) {
      return stops[s] && del.indexOf(s) < 0 && !seq.some(function (q) { return q[0] === s && q[1]; });
    });
    xadd.forEach(function (s) {
      var st = stops[s];
      L.marker(st.slice(0, 2), { icon: L.divIcon({ className: "", html: '<div class="am"></div>', iconSize: [12, 12], iconAnchor: [6, 6] }) })
        .bindTooltip((st[3] || "") + (st[2] ? " · " + st[2] : "") + " · תחנה חלופית").addTo(layer);
      focus.push(st.slice(0, 2));
    });
    if (del.length) legend.push('<span><div class="xm"></div>תחנה מבוטלת</span>');
    if (xadd.length || seq.some(function (s) { return s[1]; })) legend.push('<span><div class="am"></div>תחנה חלופית</span>');
    $("legend").innerHTML = legend.join("");
    $("vbox").innerHTML = (note ? '<p class="note">' + esc(note) + "</p>" : "") +
      (r.rd ? '<p class="note"><a href="../line-history/#' + encodeURIComponent(r.rd) + '">ההיסטוריה של הקו בהקו בזמן ←</a></p>' : "");
    var b = L.latLngBounds(focus.length > 1 ? focus : shape);
    if (b.isValid()) map.fitBounds(b.pad(0.25), { maxZoom: 17 });
  }

  getJSON("data/alerts.json").then(function (d) {
    if (!d) { $("list").innerHTML = '<div class="empty">הנתונים לא נטענו. נסו לרענן.</div>'; return; }
    ALL = d.alerts || []; CAUSES = d.causes || {}; ALIAS = d.alias || {};
    ALL.forEach(function (a) { if (a.grp) (GROUPS[a.grp] = GROUPS[a.grp] || []).push(a); });
    if (d.gen) $("upd").textContent = "עודכן " + new Intl.DateTimeFormat("he-IL", { timeZone: TZ, day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(d.gen));
    var h = "";
    try { h = decodeURIComponent((location.hash || "").slice(1)); } catch (e) { h = ""; }
    if (ALIAS[h]) h = ALIAS[h];
    if (h && ALL.some(function (a) { return a.id === h; })) {
      var a = ALL.filter(function (x) { return x.id === h; })[0];
      if (!isNow(a)) { when = isToday(a) ? "today" : "all"; }
    }
    Array.prototype.forEach.call($("when").querySelectorAll("button"), function (b) {
      b.classList.toggle("on", b.getAttribute("data-v") === when);
      b.onclick = function () { when = b.getAttribute("data-v"); Array.prototype.forEach.call($("when").querySelectorAll("button"), function (x) { x.classList.toggle("on", x === b); }); drawChips(); drawList(); };
    });
    $("q").oninput = drawList; $("onlyMap").onchange = drawList;
    drawChips(); drawList();
    window.addEventListener("hashchange", function () {
      var k = ""; try { k = decodeURIComponent((location.hash || "").slice(1)); } catch (e) { k = ""; }
      if (k && k !== sel) open(k, false);
    });
    if (h) open(h, false);
    // במחשב: בלי התראה בקישור — הראשונה ברשימה נפתחת, במקום חלון ריק ליד הרשימה
    else if (!matchMedia("(max-width: 900px)").matches) { var f = $("list").querySelector(".card"); if (f) open(f.getAttribute("data-id"), false); }
  });
})();
