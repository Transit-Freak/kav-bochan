/* 1 באפריל (שלמה 09.10) — רץ בתוך העותק של הגרסה הראשונה של כלי (april/<כלי>/): פס אדום עם ספירה
   לאחור של 60 שניות ("טוען את האתר מחדש בעוד…") כדי שאפשר יהיה לחקור את הגרסה הישנה, ובסוף חלון
   "1 באפריל!" עם כפתור חזרה לאתר של היום. הקוד בתיקייה הוא הקוד המקורי מההיסטוריה של הריפו. */
(function () {
  "use strict";
  var me = document.currentScript;
  var tool = (me && me.getAttribute("data-tool")) || "";
  var root = (me && me.src) ? me.src.replace(/[^/]*$/, "") : "/";
  var SECS = 60;
  var REAL = { home: "", "line-history": "line-history/", fleet: "fleet/", bus: "bus/", rail: "rail/", reception: "rail/reception/",
    fares: "fares/", ratzif: "ratzif/", "skip-stops": "skip-stops/", "next-station": "next-station/", kavbug: "https://transit-freak.github.io/kav-bug/" };
  function backUrl() {
    var b = (location.search.match(/[?&]back=([^&]+)/) || [])[1];
    if (b) { try { var u = new URL(decodeURIComponent(b)); if (/(^|\.)kavbochan\.app$|transit-freak\.github\.io$|^127\.0\.0\.1$|^localhost$/.test(u.hostname)) return u.href; } catch (e) { /* כתובת לא תקינה */ } }
    var r = REAL[tool] == null ? "" : REAL[tool];
    return /^https?:/.test(r) ? r : root + r;
  }
  function seen() {
    try { var d = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date()); localStorage.setItem("kbApril:" + d + ":" + (tool === "home" ? "home" : tool), "1"); } catch (e) { /* בלי אחסון */ }
  }
  var CSS = "#kb-apr-bar{position:fixed;top:0;left:0;right:0;z-index:2147483000;background:#c00;color:#fff;font:800 15px/1.3 Heebo,Arial,sans-serif;text-align:center;padding:9px 12px;direction:rtl;box-shadow:0 2px 8px rgba(0,0,0,.3)}" +
    "#kb-apr-bar b{font-size:20px;margin:0 4px}#kb-apr-bar small{display:block;font-weight:600;font-size:12px;opacity:.9}" +
    "html.kb-apr body{padding-top:58px !important}" +
    "#kb-apr-ov{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;direction:rtl}" +
    "#kb-apr-card{background:#fff;color:#0f172a;border-radius:20px;padding:26px 22px;text-align:center;width:86%;max-width:380px;font:16px/1.6 Heebo,Arial,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.35)}" +
    "#kb-apr-card .big{font-size:58px;line-height:1}#kb-apr-card h3{font-size:28px;margin:8px 0 4px;font-weight:900}#kb-apr-card p{color:#475569;margin:6px 0}" +
    "#kb-apr-card a{display:inline-block;margin-top:12px;background:#5b21b6;color:#fff;text-decoration:none;font-weight:800;padding:12px 24px;border-radius:999px}";
  function start(info) {
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    document.documentElement.classList.add("kb-apr");
    var bar = document.createElement("div"); bar.id = "kb-apr-bar"; bar.setAttribute("role", "status");
    document.body.appendChild(bar);
    var left = SECS;
    var sub = info ? "הגרסה הראשונה של " + info.name + " (" + info.v + ", " + info.d + ") · שחזור הנתונים בתהליך" : "שחזור הנתונים בתהליך";
    function draw() { bar.innerHTML = "⏳ טוען את האתר מחדש בעוד <b>" + left + "</b> שניות…<small>" + sub + "</small>"; }
    draw();
    var t = setInterval(function () {
      left--; draw();
      if (left > 0) return;
      clearInterval(t); seen();
      var ov = document.createElement("div"); ov.id = "kb-apr-ov";
      ov.innerHTML = '<div id="kb-apr-card" role="dialog" aria-modal="true" aria-label="1 באפריל"><div class="big">🎉</div><h3>1 באפריל!</h3>' +
        "<p>שום דבר לא נמחק 😄 כל המידע במקום.</p>" +
        (info ? "<p>מה שראית עכשיו זה באמת הקוד המקורי של " + info.name + " מ-" + info.d + ".</p>" : "") +
        '<a href="' + backUrl() + '">חזרה לאתר של היום ←</a></div>';
      document.body.appendChild(ov);
      ov.querySelector("a").focus();
    }, 1000);
  }
  function go() {
    fetch(root + "versions.json").then(function (r) { return r.json(); }).then(function (d) {
      var T = d[tool === "home" ? "kavpach" : tool], v = T && T.versions && T.versions[T.versions.length - 1];
      var p = v ? String(v.d).split("-") : null;
      start(v ? { name: tool === "home" ? "קו פח" : T.name, v: v.v, d: (+p[2]) + "." + (+p[1]) + "." + p[0] } : null);
    }).catch(function () { start(null); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();
