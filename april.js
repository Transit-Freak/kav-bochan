/* אחד באפריל (בחירת שלמה 07.09): "הקו הבוחן 1997".

   ב-1 באפריל (שעון ישראל) דף הבית נראה כמו אתר מלפני שלושים שנה — רקע
   אבנים אפור, כותרת ורודה, שורה רצה ("האתר בבנייה"), כרטיסים בקופסאות עם
   מסגרת תלת-ממדית, תגי NEW! מהבהבים, מונה מבקרים 000042, תגי 88x31, ספר
   אורחים ו-ICQ 12706. בלי שורת זכויות יוצרים (שלמה 07.09). המראה חל רק על
   מסך הבחירה של דף הבית; כשפותחים כלי (קו פח וכו׳) הוא יורד, וביציאה חוזר.
   תצוגה מקדימה בכל יום: ‎?april=1‎. מכבד "בלי תנועה" (טקסט קבוע במקום שורה
   רצה, בלי הבהוב). */
(function () {
  "use strict";
  function todayIL() {
    try {
      var s = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      var p = s.split("-");
      return { y: +p[0], m: +p[1], d: +p[2] };
    } catch (e) { var n = new Date(); return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() }; }
  }
  var preview = /[?&]april/.test(location.search);
  var t = todayIL();
  if (!(t.m === 4 && t.d === 1) && !preview) return;
  var noMotion = false;
  try { noMotion = (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) || document.documentElement.classList.contains("a11y-nomotion"); } catch (e) { /* ignore */ }
  function el(tag, attrs, html) { var e = document.createElement(tag); if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); }); if (html != null) e.innerHTML = html; return e; }

  var TILE = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%23c8c8c8'/%3E%3Ccircle cx='9' cy='11' r='6' fill='%23bdbdbd'/%3E%3Ccircle cx='28' cy='27' r='8' fill='%23d4d4d4'/%3E%3Ccircle cx='31' cy='6' r='3' fill='%23b5b5b5'/%3E%3C/svg%3E\")";
  var H = "html.kb-1997 ";   // המראה חל רק כשמסך הבחירה של דף הבית מוצג
  var css = [
    H + ", " + H + "body{background:#c0c0c0 " + TILE + " !important;font-family:'Times New Roman','David','FrankRuehl',serif !important}",
    H + "*:not(#kb-a11y-btn):not(#kb-a11y-btn *){border-radius:0 !important;box-shadow:none !important;text-shadow:none !important;backdrop-filter:none !important}",
    H + "body > div, " + H + ".min-h-screen{background:transparent !important;background-image:none !important}",
    H + ".group{background:#fff !important;border:4px outset #e8e8e8 !important;padding:10px !important;margin:0 !important;transform:none !important}",
    H + ".group > div.absolute{display:none !important}",
    H + ".group h2{color:#000080 !important;font-family:'Times New Roman',serif !important;font-size:22px !important;text-decoration:underline}",
    H + ".group p{color:#000 !important;font-family:'Times New Roman',serif !important;font-size:14px !important;font-weight:normal !important}",
    H + ".group span.inline-flex{background:#c0c0c0 !important;color:#000 !important;border:3px outset #f4f4f4 !important;font-family:Arial,sans-serif !important;font-weight:bold !important;font-size:12px !important;padding:3px 12px !important}",
    H + ".group > div.relative > div:first-child{height:90px !important;margin-bottom:8px !important;border:1px solid #808080;background:#fff}",
    H + ".group svg, " + H + ".group img{filter:none !important}",
    H + "h1{font-family:'Comic Sans MS','Arial Black',Impact,sans-serif !important;color:#f0f !important;font-size:44px !important;letter-spacing:0 !important;-webkit-text-stroke:1px #000080}",
    H + "h1 + p{color:#000080 !important;font-family:'Times New Roman',serif !important;font-style:italic}",
    H + "summary{color:#00e !important;text-decoration:underline;font-family:'Times New Roman',serif !important}",
    "#r97-marq{background:#000080;color:#ff0;font:bold 16px Arial,sans-serif;padding:6px 10px;border:3px ridge #c0c0c0;margin:8px auto;max-width:960px;direction:rtl;text-align:center;overflow:hidden;white-space:nowrap}",
    "#r97-marq marquee{display:block;width:100%}",
    ".r97-blink{color:#f00;font-weight:bold;font-family:Arial,sans-serif}html:not(.a11y-nomotion) .r97-blink,html:not(.a11y-nomotion) .r97-new{animation:r97b 1s steps(1) infinite}@keyframes r97b{50%{opacity:0}}",
    ".r97-new{position:absolute;top:6px;left:8px;background:#f00;color:#ff0;font:bold 11px Arial,sans-serif;padding:1px 5px;border:2px outset #ff8080;z-index:2}",
    ".r97-uc{font:bold 14px Arial,sans-serif;color:#000;background:#ff0;border:2px dashed #000;padding:3px 10px;display:inline-block;margin-top:8px}",
    "#r97-foot{max-width:960px;margin:18px auto 30px;text-align:center;font-family:'Times New Roman',serif;color:#000;font-size:14px;direction:rtl}",
    ".r97-count{display:inline-block;border:3px inset #808080;background:#000;color:#0f0;font:bold 22px 'Courier New',monospace;letter-spacing:4px;padding:2px 10px;direction:ltr}",
    ".r97-badges{display:flex;gap:8px;justify-content:center;margin:12px 0;flex-wrap:wrap}.r97-badges span{display:inline-block;width:88px;height:31px;line-height:31px;font:bold 10px Arial,sans-serif;color:#fff;border:1px solid #000;text-align:center;direction:ltr}",
    ".r97-hr{border:0;border-top:2px groove #fff;margin:12px auto;max-width:960px}",
    ".r97-links a{color:#00e;text-decoration:underline;margin:0 6px}",
    "#r97-bubble{position:fixed;bottom:14px;left:50%;transform:translateX(-50%);background:#ffffe1;border:1px solid #000;padding:6px 12px;font:13px Arial,sans-serif;direction:rtl;z-index:99997;max-width:92vw}"
  ].join("\n");
  var MARQ = "*** ברוכים הבאים לאתר הקו הבוחן !!! *** האתר בבנייה 🚧 *** עדכון אחרון: 1.4.1997 *** מומלץ לצפייה ב-Netscape Navigator 4.0 ברזולוציה 800x600 *** הדף נטען ב-28.8kbps, תודה על הסבלנות *** אל תשכחו לחתום בספר האורחים !!! ***";
  var FOOT = "<hr class='r97-hr'>מונה מבקרים: <span class='r97-count'>000042</span><br><br>" +
    "<div class='r97-badges'><span style='background:#000080'>Netscape NOW!</span><span style='background:#008000'>Best viewed 800x600</span><span style='background:#800000'>Made with Notepad</span><span style='background:#ff8000'>Kav Bochan '97</span><span style='background:#000'>GeoCities</span></div>" +
    "<div class='r97-links'><a href='#' onclick='return false'>ספר אורחים</a> | <a href='#' onclick='return false'>קישורים מגניבים</a> | <a href='mailto:shlomihartman@gmail.com'>דואר אלקטרוני</a> | <a href='#' onclick='return false'>ICQ: 12706</a> | <a href='#' onclick='return false'>הדף הזה בעברית</a></div>" +
    "<p style='margin-top:10px'>האתר ישודרג ב-2 באפריל. באמת.</p>";
  function isHub() {
    // מסך הבחירה: הכותרת "הקו הבוחן" (או שם חג) עם כרטיסי הכלים; בתוך כלי — h1 אחר
    var h1 = document.querySelector("h1");
    return !!(h1 && document.querySelector(".group h2") && /כלים לניתוח/.test((h1.parentNode && h1.parentNode.parentNode || h1).textContent || ""));
  }
  function apply() {
    var hub = isHub();
    document.documentElement.classList.toggle("kb-1997", hub);
    var m = document.getElementById("r97-marq");
    if (m) m.style.display = hub ? "" : "none";
    var bub = document.getElementById("r97-bubble");
    if (bub) bub.style.display = hub ? "" : "none";
    if (!hub) return;
    var h1 = document.querySelector("h1");
    var head = h1.parentNode.parentNode;
    if (head && !head.querySelector(".r97-uc")) head.appendChild(el("div", { "data-r97": "1" }, "<span class='r97-uc'>🚧 האתר בבנייה 🚧</span> <span class='r97-blink'>חדש!!!</span>"));
    Array.prototype.forEach.call(document.querySelectorAll(".group"), function (a, i) {
      if (i % 3 === 0 && !a.querySelector(".r97-new")) a.appendChild(el("span", { "class": "r97-new", "aria-hidden": "true" }, "NEW!"));
    });
    if (!document.getElementById("r97-foot")) {
      var cards = document.querySelectorAll(".group");
      var grid = cards.length ? cards[cards.length - 1].closest("div").parentNode : null;
      if (grid) grid.appendChild(el("div", { id: "r97-foot" }, FOOT));
    }
  }
  function init() {
    document.head.appendChild(el("style", null, css));
    var m = el("div", { id: "r97-marq", role: "presentation" }, noMotion ? MARQ.slice(0, 70) + "…" : "<marquee scrollamount='6'>" + MARQ + "</marquee>");
    document.body.insertBefore(m, document.body.firstChild);
    document.body.appendChild(el("div", { id: "r97-bubble" }, "💬 האתר ישודרג ב-2 באפריל. באמת. 1 באפריל שמח"));
    apply();
    try { new MutationObserver(apply).observe(document.body, { childList: true, subtree: true }); } catch (e) { /* ignore */ }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
