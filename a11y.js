/* כפתור נגישות צף — לכל כלי האתר (בקשת שלמה).
   הסמל: הסמל הבינלאומי לנגישות (ISA) — לבן על עיגול כחול, כפי שנהוג
   בתקן הישראלי. קובץ אחד עצמאי: מזריק את הכפתור, התפריט וה-CSS שלו,
   ושומר את ההעדפות ב-localStorage כך שהן חלות על כל ביקור ובכל כלי.
   ההחלה דרך מחלקות על <html>; ההגדלה ב-zoom על הילדים של <body> (חוץ
   מהכפתור והתפריט) כדי לא לשבור את המיקום הקבוע של הכפתור עצמו.

   הכפתור לא מסתיר תוכן (18.11): אחרי כל גלילה, שינוי גודל או שינוי בדף
   הוא בודק מה יושב מתחתיו. אם יש שם כפתור, קישור, שדה או טקסט — הוא זז
   למקום פנוי: קודם למעלה באותה פינה, אחר כך לפינה השנייה (וכך גם עולה
   מעל פס תחתון קבוע של הדף). אין צורך בהגדרה בדפים עצמם. */
(function () {
  "use strict";
  if (window.__kbA11y) return;
  window.__kbA11y = true;

  var LS = "kb-a11y";
  var OPTS = [
    ["font1", "טקסט גדול"],
    ["font2", "טקסט גדול מאוד"],
    ["contrast", "ניגודיות גבוהה"],
    ["gray", "גווני אפור"],
    ["links", "הדגשת קישורים"],
    ["readable", "גופן קריא"],
    ["cursor", "סמן עכבר גדול"],
    ["nomotion", "עצירת אנימציות"],
  ];
  var FLAGS = OPTS.map(function (o) { return o[0]; });

  function load() {
    try { return JSON.parse(localStorage.getItem(LS) || "{}") || {}; } catch (e) { return {}; }
  }
  function save(p) {
    try { localStorage.setItem(LS, JSON.stringify(p)); } catch (e) { /* מצב פרטי */ }
  }
  function apply(p) {
    var h = document.documentElement;
    FLAGS.forEach(function (f) { h.classList.toggle("a11y-" + f, !!p[f]); });
    // מפות Leaflet שכבר צוירו מחשבות פיקסלים לפי הגודל הקודם — אירוע
    // resize גורם להן למדוד מחדש (trackResize), אחרת סמן תחנה נוחת
    // במקום שגוי אחרי הפעלת ההגדלה
    try { window.dispatchEvent(new Event("resize")); } catch (e) { /* דפדפן ישן */ }
  }

  // סמן גדול: חץ שחור עם מסגרת לבנה, 40 פיקסלים
  var CURSOR = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Cpath d='M5 3v30l8-7 5 12 6-3-5-11h10z' fill='%23000' stroke='%23fff' stroke-width='2.5' stroke-linejoin='round'/%3E%3C/svg%3E\") 5 3, auto";
  var KIDS = "body > :not(#kb-a11y-btn):not(#kb-a11y-panel):not(script):not(style):not(link)";

  var css = [
    /* הגדלת תצוגה — על התוכן, לא על הכפתור הצף */
    "html.a11y-font1 " + KIDS + " { zoom: 1.12; }",
    "html.a11y-font2 " + KIDS + " { zoom: 1.25; }",
    /* ניגודיות וגווני אפור — דרך שכבת-על עם backdrop-filter ולא filter על
       התוכן: filter הופך אלמנטים צפים (position:fixed) בתוך העמוד
       להיצמד לעמוד במקום למסך והם נגררו עם הגלילה (באג מהביקורת).
       שכבת-העל יושבת מעל הכול, שקופה לאירועים, ומסננת את מה שמתחתיה
       בלי לגעת במיקום של שום דבר. */
    "html.a11y-contrast { --kb-a11y-c: contrast(1.35); }",
    "html.a11y-gray { --kb-a11y-g: grayscale(1); }",
    "html.a11y-contrast::before, html.a11y-gray::before { content: ''; position: fixed; inset: 0; z-index: 2147483646; pointer-events: none;" +
      " backdrop-filter: var(--kb-a11y-c, contrast(1)) var(--kb-a11y-g, grayscale(0)); -webkit-backdrop-filter: var(--kb-a11y-c, contrast(1)) var(--kb-a11y-g, grayscale(0)); }",
    /* הדגשת קישורים וכפתורים */
    "html.a11y-links a, html.a11y-links button { text-decoration: underline !important; text-underline-offset: 2px; }",
    "html.a11y-links a { outline: 1px dashed currentColor; outline-offset: 1px; }",
    /* גופן קריא — בלי לגעת בשקפים שמורדים כ-PDF ובסמלים */
    "html.a11y-readable body :not(svg):not(svg *):not(.slide):not(.slide *) { font-family: Arial, Helvetica, sans-serif !important; }",
    /* סמן עכבר גדול */
    "html.a11y-cursor, html.a11y-cursor * { cursor: " + CURSOR + " !important; }",
    /* ביטול אנימציות ומעברים */
    "html.a11y-nomotion *, html.a11y-nomotion *::before, html.a11y-nomotion *::after { transition: none !important; animation: none !important; scroll-behavior: auto !important; }",

    /* הכפתור */
    "#kb-a11y-btn { position: fixed; bottom: 16px; inset-inline-start: 14px; z-index: 99999; width: 48px; height: 48px; box-sizing: border-box; border-radius: 50%; border: 2px solid #fff; background: #0055aa; box-shadow: 0 2px 10px rgba(0,0,0,.35); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; margin: 0; }",
    "@media (max-width: 640px) { #kb-a11y-btn { width: 44px; height: 44px; bottom: 12px; inset-inline-start: 10px; } #kb-a11y-btn svg { width: 26px; height: 26px; } }",
    "#kb-a11y-btn:hover { background: #0066cc; }",
    "#kb-a11y-btn svg { width: 28px; height: 28px; display: block; pointer-events: none; }",
    "#kb-a11y-btn:focus { outline: none; }",
    "#kb-a11y-btn:focus-visible { outline: 3px solid #0f172a !important; outline-offset: 2px !important; box-shadow: 0 0 0 7px #fff !important; }",

    /* התפריט */
    "#kb-a11y-panel { position: fixed; z-index: 100000; box-sizing: border-box; background: #fff; color: #0f172a; border: 1px solid #94a3b8; border-radius: 14px; box-shadow: 0 8px 30px rgba(0,0,0,.25); padding: 12px; width: 300px; max-width: calc(100vw - 16px); overflow: auto; overscroll-behavior: contain; font: 14px/1.35 Heebo, Arial, sans-serif; direction: rtl; text-align: right; }",
    "#kb-a11y-panel[hidden] { display: none !important; }",
    "#kb-a11y-panel h2 { margin: 0 0 8px; font-size: 16px; font-weight: 800; color: #0f172a; }",
    "#kb-a11y-panel .a11y-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }",
    "#kb-a11y-panel button.a11y-opt { display: flex; align-items: center; gap: 6px; box-sizing: border-box; width: 100%; min-height: 44px; margin: 0; text-align: right; padding: 6px 8px; border-radius: 9px; border: 1.5px solid #94a3b8; background: #f8fafc; color: #0f172a; font: 700 13.5px/1.25 Heebo, Arial, sans-serif; cursor: pointer; text-decoration: none; }",
    "#kb-a11y-panel button.a11y-opt::before { content: ''; flex: 0 0 auto; width: 14px; height: 14px; border-radius: 4px; border: 2px solid #475569; background: #fff; box-sizing: border-box; }",
    "#kb-a11y-panel button.a11y-opt[aria-pressed='true'] { border-color: #0055aa; background: #e6f0fa; color: #003d7a; }",
    "#kb-a11y-panel button.a11y-opt[aria-pressed='true']::before { border-color: #0055aa; background: #0055aa url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Cpath d='M2 5.2l2 2 4-4.4' fill='none' stroke='%23fff' stroke-width='1.8'/%3E%3C/svg%3E\") center/10px no-repeat; }",
    "#kb-a11y-panel button.a11y-reset { grid-column: 1 / -1; justify-content: center; margin-top: 2px; }",
    "#kb-a11y-panel button.a11y-reset::before { display: none; }",
    "#kb-a11y-panel button.a11y-opt:hover { border-color: #0055aa; }",
    "#kb-a11y-panel .a11y-links { display: grid; grid-template-columns: 1fr 1fr; gap: 0 8px; margin-top: 8px; border-top: 1px solid #e2e8f0; padding-top: 4px; }",
    "#kb-a11y-panel a { display: flex; align-items: center; min-height: 44px; font-size: 13px; color: #0055aa; font-weight: 700; text-decoration: underline; text-underline-offset: 2px; }",
    "#kb-a11y-panel button.a11y-opt:focus-visible, #kb-a11y-panel a:focus-visible { outline: 3px solid #0055aa !important; outline-offset: 2px; }",
    "#kb-a11y-panel button.a11y-opt:focus:not(:focus-visible) { outline: none; }",
    "@media print { #kb-a11y-btn, #kb-a11y-panel { display: none !important; } }",
  ].join("\n");

  var ICON = '<svg viewBox="0 0 26 26" aria-hidden="true" focusable="false"><circle cx="13" cy="4.4" r="2.2" fill="#fff"/><path d="M13 7.2 v6.2 h5.6 M13 10.4 h4.6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.9 11.2 a5.6 5.6 0 1 0 7.1 7.4 M18.6 13.6 l1.6 5.6 h1.6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ---------- הכפתור לא יושב על תוכן ---------- */
  var INTERACTIVE = 'a[href],button,input:not([type="hidden"]),select,textarea,summary,label,[role="button"],[role="link"],[role="tab"],' +
    '[role="checkbox"],[role="radio"],[role="switch"],[role="menuitem"],[role="option"],[role="slider"],[contenteditable="true"],[contenteditable=""],[tabindex]:not([tabindex="-1"])';

  // מיקום הכפתור (שלמה 18.11): הכפתור עומד קבוע בפינה ולא "רוקד" בגלילה או בלחיצות.
  // זז רק כשבפינה שלו יושב פס קבוע (למשל סרגל כפתורים בתחתית המסך) — אז עולה מעליו.
  function makePlacer(btn, panel) {
    var dy = 0, timer = 0;
    function ours(el) { return el === btn || btn.contains(el) || panel.contains(el); }
    function fixedOf(el, cache) {
      for (var e = el; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
        var v = cache.get(e);
        if (v === undefined) { var ps = getComputedStyle(e).position; v = (ps === "fixed" || ps === "sticky") ? e : null; cache.set(e, v); }
        if (v) return v;
      }
      return null;
    }
    function place() {
      timer = 0;
      if (!panel.hidden || !document.elementsFromPoint) return;
      try {
        var vh = innerHeight, r = btn.getBoundingClientRect();
        if (!r.width) return;
        var bt = r.top - dy, h = r.height, l = r.left, w = r.width, cache = new Map(), lift = 0;
        for (var round = 0; round < 3; round++) {
          var top = bt - lift, hit = null;
          [[l + 2, top + 2], [l + w - 2, top + 2], [l + 2, top + h - 2], [l + w - 2, top + h - 2], [l + w / 2, top + h / 2]].forEach(function (pt) {
            document.elementsFromPoint(pt[0], pt[1]).forEach(function (el) {
              if (ours(el)) return;
              var f = fixedOf(el, cache);
              if (f && f !== btn) { var fr = f.getBoundingClientRect(); if (fr.bottom >= vh - 2 && fr.height < vh * 0.5) hit = !hit || fr.top < hit.top ? fr : hit; }
            });
          });
          if (!hit) break;
          lift = Math.min(vh * 0.6, bt + h - hit.top + 8);
        }
        if (lift !== -dy) { dy = -lift; btn.style.transform = dy ? "translateY(" + dy + "px)" : ""; }
      } catch (e) { /* דפדפן ישן — הכפתור נשאר במקומו */ }
    }
    function soon(ms) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(place, ms == null ? 300 : ms);
    }
    window.addEventListener("resize", function () { soon(); });
    window.addEventListener("load", function () { soon(0); });
    try {
      new MutationObserver(function (ms) {
        for (var i = 0; i < ms.length; i++) if (!ours(ms[i].target)) { soon(500); return; }
      }).observe(document.body, { childList: true, subtree: true });
    } catch (e) { /* בלי MutationObserver — רק שינוי גודל */ }
    soon(0);
    return { now: place, soon: soon };
  }

  function build() {
    var style = document.createElement("style");
    style.id = "kb-a11y-css";
    style.textContent = css;
    document.head.appendChild(style);

    var prefs = load();
    apply(prefs);

    var me = document.querySelector('script[src*="a11y.js"]');
    // ההצהרה יושבת בשורש האתר — הנתיב מחושב לפי מיקום הסקריפט עצמו,
    // ואם אין src (הזרקה חריגה) נופלים לכתובת המלאה של האתר
    var base = me ? me.getAttribute("src").replace(/a11y\.js.*$/, "") : "https://kavbochan.app/";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "kb-a11y-btn";
    btn.setAttribute("aria-label", "תפריט נגישות");
    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", "kb-a11y-panel");
    btn.title = "נגישות";
    btn.innerHTML = ICON;

    var panel = document.createElement("div");
    panel.id = "kb-a11y-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-labelledby", "kb-a11y-title");
    panel.setAttribute("lang", "he");
    panel.setAttribute("dir", "rtl");
    panel.hidden = true;
    var h = document.createElement("h2");
    h.id = "kb-a11y-title";
    h.textContent = "נגישות";
    panel.appendChild(h);
    var grid = document.createElement("div");
    grid.className = "a11y-grid";
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-labelledby", "kb-a11y-title");
    panel.appendChild(grid);

    function refresh() {
      grid.querySelectorAll(".a11y-opt[data-opt]").forEach(function (x) {
        x.setAttribute("aria-pressed", prefs[x.getAttribute("data-opt")] ? "true" : "false");
      });
    }
    OPTS.forEach(function (o) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "a11y-opt";
      b.setAttribute("data-opt", o[0]);
      b.textContent = o[1];
      b.setAttribute("aria-pressed", prefs[o[0]] ? "true" : "false");
      b.onclick = function () {
        prefs[o[0]] = !prefs[o[0]];
        // שתי דרגות ההגדלה סותרות זו את זו
        if (o[0] === "font1" && prefs.font1) prefs.font2 = false;
        if (o[0] === "font2" && prefs.font2) prefs.font1 = false;
        save(prefs); apply(prefs); refresh();
      };
      grid.appendChild(b);
    });
    var reset = document.createElement("button");
    reset.type = "button";
    reset.className = "a11y-opt a11y-reset";
    reset.textContent = "איפוס כל ההגדרות";
    reset.onclick = function () { prefs = {}; save(prefs); apply(prefs); refresh(); };
    grid.appendChild(reset);

    var links = document.createElement("div");
    links.className = "a11y-links";
    [["accessibility.html", "הצהרת נגישות"],
     // תנאי שימוש ופרטיות — באותה חלונית, בכל עמוד באתר (שלמה 16.09: "תוסיף לכל אתר אותם")
     ["terms.html", "תנאי שימוש ופרטיות"],
     ["terms.html#copyright", "זכויות יוצרים"],
     ["links.html", "קישורים"]].forEach(function (l) {
      var a = document.createElement("a");
      a.href = base + l[0];
      a.textContent = l[1] + "\u00a0←";
      links.appendChild(a);
    });
    panel.appendChild(links);

    document.body.appendChild(btn);
    document.body.appendChild(panel);
    var placer = makePlacer(btn, panel);

    // החלונית נפתחת ליד הכפתור, בכל מקום שהוא נמצא בו
    function position() {
      var r = btn.getBoundingClientRect(), vw = document.documentElement.clientWidth || innerWidth, vh = innerHeight;
      var s = panel.style;
      s.top = s.bottom = s.left = s.right = "";
      var below = r.top + r.height / 2 < vh / 2;
      if (below) { s.top = (r.bottom + 8) + "px"; s.maxHeight = (vh - r.bottom - 16) + "px"; }
      else { s.bottom = (vh - r.top + 8) + "px"; s.maxHeight = (r.top - 16) + "px"; }
      if (r.left + r.width / 2 > vw / 2) s.right = Math.max(8, vw - r.right) + "px";
      else s.left = Math.max(8, r.left) + "px";
    }
    function isOpen() { return !panel.hidden; }
    function open() {
      position();
      panel.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      // המיקוד עובר לאפשרות הראשונה בחלונית
      var f = panel.querySelector("button");
      if (f) f.focus();
    }
    function close(back) {
      if (!isOpen()) return;
      panel.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      if (back) btn.focus();
      placer.soon();
    }
    btn.onclick = function () { isOpen() ? close(false) : open(); };
    document.addEventListener("keydown", function (e) {
      if ((e.key === "Escape" || e.key === "Esc") && isOpen()) {
        var inside = panel.contains(document.activeElement) || document.activeElement === btn;
        close(inside);
        if (inside) e.stopPropagation();
      }
    }, true);
    // יציאה מהחלונית במקלדת (Tab אחרי הקישור האחרון) — סוגרים, בלי מלכודת מיקוד
    panel.addEventListener("focusout", function (e) {
      var to = e.relatedTarget;
      if (to && !panel.contains(to) && to !== btn) close(false);
    });
    btn.addEventListener("blur", function () { placer.soon(); });
    document.addEventListener("click", function (e) {
      if (isOpen() && !panel.contains(e.target) && !btn.contains(e.target)) close(false);
    });
    window.addEventListener("resize", function () { if (isOpen()) position(); });
    // שינוי בלשונית אחרת — ההעדפות מתעדכנות גם כאן
    window.addEventListener("storage", function (e) {
      if (e.key === LS) { prefs = load(); apply(prefs); refresh(); }
    });
  }

  // שורת זכויות יוצרים בתחתית כל עמוד (שלמה 17.09: "תוסיף זכויות יוצרים"). עמוד שכבר מכיל
  // שורה כזו (דף הבית) מסומן ב-data-copyright ולא מקבל עוד אחת.
  function copyright() {
    if (document.querySelector("[data-copyright]")) return;
    var me = document.querySelector('script[src*="a11y.js"]');
    var base = me ? me.getAttribute("src").replace(/a11y\.js.*$/, "") : "https://kavbochan.app/";
    var p = document.createElement("p");
    p.setAttribute("data-copyright", "");
    p.className = "kb-copyright";
    p.setAttribute("style", "margin:28px 16px 72px;text-align:center;font-size:12px;line-height:1.7;color:#596779;font-family:Arial,sans-serif;direction:rtl");
    p.innerHTML = '© 2026 שלמה הרטמן · נבנה בעזרת בינה מלאכותית לפי הנחיותיו · מותר לצטט ולקשר בציון המקור · <a href="' + base + 'terms.html#copyright" style="color:#596779">זכויות יוצרים ותנאי שימוש</a>';
    document.body.appendChild(p);
  }
  function start() { build(); copyright(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
