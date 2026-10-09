/* אחד באפריל (שלמה 09.10, במקום "הקו הבוחן 1997"): "אופס… בטעות נמחק כל המידע מהאתר".
   ב-1 באפריל (שעון ישראל), בכניסה לכל כלי: מסך כהה עם הודעת המחיקה, פס שחזור תקוע וכפתור "המשך".
   "המשך" פותח את הגרסה הראשונה האמיתית של אותו כלי — הקוד המקורי מההיסטוריה של הריפו, בתיקייה
   april/<כלי>/ — ושם פס אדום סופר 60 שניות ובסוף קופץ "1 באפריל!" עם חזרה לאתר של היום
   (april-old.js). כל מבקר רואה את זה פעם אחת לכל כלי באותו יום. תצוגה מקדימה בכל יום: ‎?april=1‎.
   נגישות אזורי תעשייה — בלי (כמו מספר הגרסה). קו באג טוען את הקובץ מ-kavbochan.app עם data-tool. */
(function () {
  "use strict";
  var me = document.currentScript;
  var root = (me && me.src) ? me.src.replace(/[^/]*$/, "") : "/";
  function todayIL() {
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date()); }
    catch (e) { var n = new Date(); return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0"); }
  }
  var preview = /[?&]april/.test(location.search);
  var day = todayIL();
  if (day.slice(5) !== "04-01" && !preview) return;
  function toolOf() {
    var t = me && me.getAttribute("data-tool");
    if (t) return t;
    var p = location.pathname;
    if (/\/april\//.test(p) || /\/parks\//.test(p)) return null;
    if (/\/rail\/reception\//.test(p)) return "reception";
    var m = p.match(/\/(line-history|fleet|bus|rail|fares|ratzif|skip-stops|next-station)\//);
    if (m) return m[1];
    return /\/(index\.html)?$/.test(p) ? "home" : null;
  }
  var tool = toolOf();
  if (!tool) return;
  var KEY = "kbApril:" + day + ":" + tool;
  try { if (!preview && localStorage.getItem(KEY)) return; } catch (e) { /* בלי אחסון — מציגים */ }
  var CSS = "#kb-oops{position:fixed;inset:0;z-index:2147483000;background:#0f172a;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:30px;direction:rtl;font:16px/1.6 Heebo,Arial,sans-serif}" +
    "#kb-oops .ic{font-size:72px;line-height:1}#kb-oops h1{font-size:30px;margin:12px 0 6px;font-weight:900;color:#fff}" +
    "#kb-oops p{color:#cbd5e1;max-width:420px;margin:4px 0}" +
    "#kb-oops .kb-obar{width:80%;max-width:360px;height:8px;background:#334155;border-radius:9px;margin:18px 0 6px;overflow:hidden}" +
        "#kb-oops small{color:#94a3b8}" +
    "#kb-oops button{margin-top:20px;border:none;background:#fff;color:#0f172a;font:800 17px Heebo,Arial,sans-serif;padding:12px 34px;border-radius:999px;cursor:pointer}";
  function show() {
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    var o = document.createElement("div"); o.id = "kb-oops"; o.setAttribute("role", "alertdialog"); o.setAttribute("aria-label", "אופס");
    o.innerHTML = '<h1>אופס...</h1><p>בטעות מחקתי את כל המידע מהאתר.</p><p>השחזור בתהליך.</p>' +
      '<div class="kb-obar"><span style="display:block;width:12%;height:100%;background:#f59e0b;border-radius:9px"></span></div><small>משחזר… 12%</small><button type="button">המשך</button>';
    document.body.appendChild(o);
    document.documentElement.style.overflow = "hidden";
    var b = o.querySelector("button"); b.focus();
    b.addEventListener("click", function () {
      var back = location.href.replace(/([?&])april(=[^&#]*)?&?/, "$1").replace(/[?&](#|$)/, "$1");   // בלי ?april=1 — שהחזרה לא תפתח שוב
      location.href = root + "april/" + (tool === "kavpach" ? "home" : tool) + "/?back=" + encodeURIComponent(back);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", show); else show();
})();
