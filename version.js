/* מספר גרסה ו"מה חדש" בתחתית כל כלי (שלמה 09.10): שורה קטנה "גרסה 4.1", ולחיצה עליה פותחת כרטיס
   עם מה שהשתנה בגרסה הזו; הגרסאות הקודמות בתוך הכרטיס, וכל אחת נפתחת בלחיצה.
   הנתונים ב-versions.json שליד הקובץ. הכלי נקבע לפי data-tool בתגית הסקריפט, ואם אין — לפי הכתובת.
   קו באג (ריפו נפרד) טוען את הקובץ מ-kavbochan.app עם data-tool="kavbug". */
(function () {
  "use strict";
  var me = document.currentScript;
  var base = (me && me.src) ? me.src.replace(/[^/]*$/, "") : "/";
  function toolOf() {
    var t = me && me.getAttribute("data-tool");
    if (t) return t;
    var p = location.pathname;
    if (/\/rail\/reception\//.test(p)) return "reception";
    var m = p.match(/\/(line-history|fleet|bus|rail|fares|ratzif|skip-stops|next-station)\//);
    if (m) return m[1];
    return /^#(פח|מוזהב)/.test(decodeURIComponent(location.hash || "")) ? "kavpach" : "home";
  }
  var DATA = null;
  var CSS = "#kb-ver{display:flex;justify-content:center;padding:14px 12px 22px;direction:rtl}" +
    "#kb-ver button{all:unset;cursor:pointer;font:600 12.5px/1.4 Heebo,Arial,sans-serif;color:#64748b;border:1px solid #e2e8f0;background:#fff;border-radius:999px;padding:5px 13px}" +
    "#kb-ver button:hover,#kb-ver button:focus-visible{color:#5b21b6;border-color:#c4b5fd;outline:none}" +
    "#kb-ver-ov{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:100000;display:flex;align-items:flex-end;justify-content:center;direction:rtl}" +
    "@media(min-width:640px){#kb-ver-ov{align-items:center}}" +
    "#kb-ver-card{background:#fff;color:#0f172a;width:100%;max-width:460px;max-height:82vh;overflow:auto;border-radius:18px 18px 0 0;padding:18px 18px 22px;font:15px/1.6 Heebo,Arial,sans-serif;box-shadow:0 -8px 30px rgba(15,23,42,.25)}" +
    "@media(min-width:640px){#kb-ver-card{border-radius:18px}}" +
    "#kb-ver-card h2{margin:0;font-size:18px;font-weight:800;display:flex;align-items:center;gap:8px}" +
    "#kb-ver-card .vx{all:unset;cursor:pointer;margin-inline-start:auto;font-size:20px;color:#94a3b8;padding:0 4px}" +
    "#kb-ver-card .vd{color:#64748b;font-size:13px;margin:2px 0 10px}" +
    "#kb-ver-card ul{margin:0;padding-inline-start:20px}#kb-ver-card li{margin:3px 0}" +
    "#kb-ver-card .vold{margin-top:14px;border-top:1px solid #eef0f4;padding-top:8px}" +
    "#kb-ver-card .vold h3{margin:4px 0 6px;font-size:13px;color:#64748b;font-weight:700}" +
    "#kb-ver-card .vrow{all:unset;box-sizing:border-box;cursor:pointer;display:flex;width:100%;gap:8px;align-items:center;padding:8px 2px;border-bottom:1px solid #f1f5f9;font-weight:700;font-size:14px}" +
    "#kb-ver-card .vrow small{color:#94a3b8;font-weight:500;margin-inline-start:auto}" +
    "#kb-ver-card .vbody{padding:4px 2px 8px;font-size:14px;color:#334155}" +
    "#kb-ver-card .vtag{background:#ede9fe;color:#5b21b6;border-radius:999px;padding:1px 10px;font-size:13px;font-weight:800}";
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmtD(d) { var p = String(d || "").split("-"); return p.length === 3 ? (+p[2]) + "." + (+p[1]) + "." + p[0] : ""; }
  function list(items) { return "<ul>" + (items || []).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>"; }
  function close() { var o = document.getElementById("kb-ver-ov"); if (o) o.remove(); document.removeEventListener("keydown", onKey); var b = document.querySelector("#kb-ver button"); if (b) b.focus(); }
  function onKey(e) { if (e.key === "Escape") close(); }
  function open(t) {
    var T = DATA && DATA[t]; if (!T) return;
    var vs = T.versions || [], cur = vs[0];
    var ov = document.createElement("div"); ov.id = "kb-ver-ov";
    ov.innerHTML = '<div id="kb-ver-card" role="dialog" aria-modal="true" aria-label="מה חדש">' +
      '<h2>' + esc(T.name) + ' <span class="vtag">גרסה ' + esc(cur.v) + '</span><button class="vx" aria-label="סגירה">✕</button></h2>' +
      '<div class="vd">' + fmtD(cur.d) + '</div>' + list(cur.items) +
      (vs.length > 1 ? '<div class="vold"><h3>גרסאות קודמות</h3>' + vs.slice(1).map(function (v, i) {
        return '<button class="vrow" aria-expanded="false" data-i="' + (i + 1) + '">גרסה ' + esc(v.v) + '<small>' + fmtD(v.d) + ' ⌄</small></button><div class="vbody" hidden>' + list(v.items) + '</div>';
      }).join("") + '</div>' : '') + '</div>';
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    ov.querySelector(".vx").addEventListener("click", close);
    [].forEach.call(ov.querySelectorAll(".vrow"), function (b) {
      b.addEventListener("click", function () {
        var body = b.nextElementSibling, on = body.hidden;
        body.hidden = !on; b.setAttribute("aria-expanded", on ? "true" : "false");
        b.querySelector("small").textContent = fmtD(vs[+b.getAttribute("data-i")].d) + (on ? " ⌃" : " ⌄");
      });
    });
    document.body.appendChild(ov);
    document.addEventListener("keydown", onKey);
    ov.querySelector(".vx").focus();
  }
  function render() {
    var t = toolOf(), T = DATA && DATA[t];
    var box = document.getElementById("kb-ver");
    if (!T || !(T.versions || []).length) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement("div"); box.id = "kb-ver";
      document.body.appendChild(box);
    }
    box.innerHTML = '<button type="button" title="מה השתנה בגרסה הזו">' + esc(T.name) + ' · גרסה ' + esc(T.versions[0].v) + '</button>';
    box.querySelector("button").onclick = function () { open(t); };
  }
  function start() {
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    fetch(base + "versions.json?v=" + Math.floor(Date.now() / 36e5)).then(function (r) { return r.json(); })
      .then(function (d) { DATA = d; render(); window.addEventListener("hashchange", render); })
      .catch(function () { /* בלי גרסה — לא מפריע לשום דבר אחר בדף */ });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
