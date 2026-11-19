/* כפתור נגישות — לכל כלי האתר (בקשת שלמה).
   הסמל: הסמל הבינלאומי לנגישות (ISA) — לבן על עיגול כחול, כפי שנהוג
   בתקן הישראלי. קובץ אחד עצמאי: מזריק את הכפתור, התפריט וה-CSS שלו,
   ושומר את ההעדפות ב-localStorage כך שהן חלות על כל ביקור ובכל כלי.
   ההחלה דרך מחלקות על <html>; ההגדלה ב-zoom על הילדים של <body>.

   מקום הכפתור (שלמה 18.11): בתוך הפס העליון של כל עמוד, ככפתור רגיל בזרימת הדף —
   לא צף, לא זז ולא מסתיר תוכן. כל עמוד מסמן את המקום בפס העליון ב-[data-a11y-slot]
   (span ריק בגודל 44×44, כדי ששום דבר לא יזוז כשהכפתור נכנס). דפים שהפס שלהם נבנה
   מחדש (React) — הכפתור חוזר לבד למקום החדש. עמוד בלי מקום מסומן: פס עליון מוכר,
   ואם אין — שורה קטנה בראש הדף. התפריט נפתח מתחת לכפתור. */
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
  var KIDS = "body > :not(#kb-a11y-btn):not(#kb-a11y-panel):not(#kb-theme-tip):not(script):not(style):not(link)";

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

    /* הכפתור — כפתור רגיל בתוך הפס העליון (לא צף): 44×44 למגע, עיגול כחול של 36 */
    "[data-a11y-slot] { display: inline-flex; flex: none; align-items: center; justify-content: center; gap: 0; width: auto !important; min-width: 88px; min-height: 44px; }",
    "#kb-a11y-btn { position: relative; flex: none; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; width: 44px; height: 44px; min-width: 44px; margin: 0; padding: 0; border: 0; border-radius: 50%; background: transparent; box-shadow: none; cursor: pointer; vertical-align: middle; -webkit-tap-highlight-color: transparent; transform: none; float: none; }",
    "#kb-a11y-btn .kb-a11y-ico { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; box-sizing: border-box; border-radius: 50%; background: #0055aa; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(15,23,42,.3); }",
    "#kb-a11y-btn:hover .kb-a11y-ico, #kb-a11y-btn[aria-expanded='true'] .kb-a11y-ico { background: #0066cc; }",
    "#kb-a11y-btn svg { width: 24px; height: 24px; display: block; pointer-events: none; }",
    "#kb-a11y-btn:focus { outline: none; }",
    "#kb-a11y-btn:focus-visible .kb-a11y-ico { outline: 3px solid #0f172a; outline-offset: 1px; box-shadow: 0 0 0 6px #fff; }",
    /* עמוד בלי פס עליון מסומן — שורה קטנה בראש הדף, בזרימה */
    "#kb-a11y-top { display: flex; justify-content: flex-end; padding: 6px 10px 0; direction: rtl; }",

    /* התפריט */
    "#kb-a11y-panel { position: fixed; z-index: 100000; box-sizing: border-box; background: #fff; color: #0f172a; border: 1px solid #94a3b8; border-radius: 14px; box-shadow: 0 8px 30px rgba(0,0,0,.25); padding: 12px; width: 300px; max-width: calc(100vw - 16px); overflow: auto; overscroll-behavior: contain; font: 14px/1.35 Heebo, Arial, sans-serif; direction: rtl; text-align: right; }",
    "#kb-a11y-panel[hidden] { display: none !important; }",
    "@media (max-width: 520px) { #kb-a11y-panel { width: auto; max-width: none; } }",
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
    /* כפתור תאורת יום / לילה — באותו גודל, ליד כפתור הנגישות */
    "#kb-theme-btn { position: relative; flex: none; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; width: 44px; height: 44px; min-width: 44px; margin: 0; padding: 0; border: 0; border-radius: 50%; background: transparent; box-shadow: none; cursor: pointer; vertical-align: middle; -webkit-tap-highlight-color: transparent; transform: none; float: none; }",
    "#kb-theme-btn .kb-a11y-ico { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; box-sizing: border-box; border-radius: 50%; background: #fff; border: 2px solid #0055aa; box-shadow: 0 1px 4px rgba(15,23,42,.3); color: #0055aa; }",
    "#kb-theme-btn:hover .kb-a11y-ico { background: #e6f0fa; }",
    "#kb-theme-btn svg { width: 22px; height: 22px; display: block; pointer-events: none; }",
    "#kb-theme-btn:focus { outline: none; }",
    "#kb-theme-btn:focus-visible .kb-a11y-ico { outline: 3px solid #0f172a; outline-offset: 1px; box-shadow: 0 0 0 6px #fff; }",
    "#kb-theme-tip { position: fixed; z-index: 100001; background: #0f172a; color: #fff; font: 700 13.5px/1.3 Heebo, Arial, sans-serif; padding: 8px 12px; border-radius: 10px; box-shadow: 0 6px 20px rgba(0,0,0,.3); direction: rtl; pointer-events: none; white-space: nowrap; }",
    "#kb-theme-tip[hidden] { display: none !important; }",
    /* מצב כהה — החלונית, הכפתור ושורת זכויות היוצרים */
    "html.kb-dark #kb-theme-btn .kb-a11y-ico { background: #1e293b; border-color: #93c5fd; color: #fde68a; }",
    "html.kb-dark #kb-theme-btn:hover .kb-a11y-ico { background: #334155; }",
    "html.kb-dark #kb-a11y-btn .kb-a11y-ico { border-color: #93c5fd; }",
    "html.kb-dark #kb-a11y-btn:focus-visible .kb-a11y-ico, html.kb-dark #kb-theme-btn:focus-visible .kb-a11y-ico { outline-color: #f1f5f9; box-shadow: 0 0 0 6px #0f172a; }",
    "html.kb-dark #kb-theme-tip { background: #f1f5f9; color: #0f172a; }",
    "html.kb-dark #kb-a11y-panel { background: #1e293b; color: #e2e8f0; border-color: #475569; box-shadow: 0 8px 30px rgba(0,0,0,.6); }",
    "html.kb-dark #kb-a11y-panel h2 { color: #f1f5f9; }",
    "html.kb-dark #kb-a11y-panel button.a11y-opt { background: #0f172a; color: #e2e8f0; border-color: #64748b; }",
    "html.kb-dark #kb-a11y-panel button.a11y-opt::before { background: #0f172a; border-color: #94a3b8; }",
    "html.kb-dark #kb-a11y-panel button.a11y-opt[aria-pressed='true'] { background: #172554; color: #bfdbfe; border-color: #60a5fa; }",
    "html.kb-dark #kb-a11y-panel button.a11y-opt[aria-pressed='true']::before { border-color: #60a5fa; background-color: #2563eb; }",
    "html.kb-dark #kb-a11y-panel button.a11y-opt:hover { border-color: #93c5fd; }",
    "html.kb-dark #kb-a11y-panel .a11y-links { border-top-color: #334155; }",
    "html.kb-dark #kb-a11y-panel a { color: #93c5fd; }",
    "html.kb-dark #kb-a11y-panel button.a11y-opt:focus-visible, html.kb-dark #kb-a11y-panel a:focus-visible { outline-color: #93c5fd !important; }",
    ".kb-copyright { margin: 28px 16px 72px; text-align: center; font-size: 12px; line-height: 1.7; color: #596779; font-family: Arial, sans-serif; direction: rtl; }",
    ".kb-copyright a { color: inherit; }",
    "html.kb-dark .kb-copyright { color: #a3b1c2; }",
    "@media print { #kb-a11y-btn, #kb-theme-btn, #kb-theme-tip, #kb-a11y-panel, #kb-a11y-top { display: none !important; } }",
  ].join("\n");

  /* סמלי התאורה: לפי הטלפון = עיגול חצוי, בהיר = שמש, כהה = ירח */
  var T_ICONS = {
    auto: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor"/></svg>',
    light: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4.2" fill="currentColor"/><g stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7 7 17M17 7l1.7-1.7"/></g></svg>',
    dark: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6z" fill="currentColor"/></svg>',
  };
  var T_NAMES = { auto: "לפי הטלפון", light: "בהיר", dark: "כהה" };
  var T_NEXT = { auto: "light", light: "dark", dark: "auto" };

  var ICON = '<svg viewBox="0 0 26 26" aria-hidden="true" focusable="false"><circle cx="13" cy="4.4" r="2.2" fill="#fff"/><path d="M13 7.2 v6.2 h5.6 M13 10.4 h4.6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.9 11.2 a5.6 5.6 0 1 0 7.1 7.4 M18.6 13.6 l1.6 5.6 h1.6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ---------- המקום של הכפתור בפס העליון ---------- */
  // פסים עליונים מוכרים — רק אם בעמוד אין [data-a11y-slot] (כל העמודים באתר מסומנים)
  var KNOWN = [".kbt-bar-in", ".kbh .top .wrap", ".top-in", ".kbtop-in", ".hdr-in", ".kb-top-in", ".kb-top", "header .wrap", "body > header", "#app > header"];
  function shown(el) { return !!(el && el.isConnected && el.getClientRects().length); }
  function findSlot() {
    var list = document.querySelectorAll("[data-a11y-slot]"), first = null;
    for (var i = 0; i < list.length; i++) {
      if (shown(list[i])) return list[i];
      if (!first) first = list[i];
    }
    if (first) return first;
    for (var k = 0; k < KNOWN.length; k++) {
      var c = document.querySelector(KNOWN[k]);
      if (shown(c)) {
        var sp = document.createElement("span");
        sp.setAttribute("data-a11y-slot", "");
        sp.style.marginInlineStart = "auto";
        c.appendChild(sp);
        return sp;
      }
    }
    return null;
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
    btn.setAttribute("aria-label", "נגישות");
    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", "kb-a11y-panel");
    btn.title = "נגישות";
    btn.innerHTML = '<span class="kb-a11y-ico">' + ICON + "</span>";

    // כפתור תאורת יום / לילה: כל לחיצה עוברת לפי הטלפון → בהיר → כהה, ובועה קטנה אומרת מה נבחר
    var th = window.kbTheme || null;
    var tbtn = null, tip = null, tipT = 0;
    function tMode() { return th ? th.get() : "auto"; }
    function tRefresh() {
      if (!tbtn) return;
      var m = tMode();
      tbtn.innerHTML = '<span class="kb-a11y-ico">' + T_ICONS[m] + "</span>";
      var lbl = "תאורה: " + T_NAMES[m] + " (לחיצה: " + T_NAMES[T_NEXT[m]] + ")";
      tbtn.setAttribute("aria-label", lbl);
      tbtn.title = lbl;
    }
    function tTip() {
      if (!tip) return;
      tip.textContent = "תאורה: " + T_NAMES[tMode()];
      tip.hidden = false;
      var r = tbtn.getBoundingClientRect(), vw = document.documentElement.clientWidth || innerWidth;
      var w = tip.offsetWidth;
      var left = Math.min(vw - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
      tip.style.left = left + "px";
      tip.style.top = Math.max(8, r.bottom + 6) + "px";
      clearTimeout(tipT);
      tipT = setTimeout(function () { tip.hidden = true; }, 1800);
    }
    if (th) {
      tbtn = document.createElement("button");
      tbtn.type = "button";
      tbtn.id = "kb-theme-btn";
      tRefresh();
      tbtn.onclick = function () { th.set(T_NEXT[tMode()]); tRefresh(); tTip(); };
      tip = document.createElement("div");
      tip.id = "kb-theme-tip";
      tip.setAttribute("role", "status");
      tip.setAttribute("aria-live", "polite");
      tip.hidden = true;
      window.addEventListener("kb-theme", tRefresh);
      window.addEventListener("scroll", function () { if (tip) tip.hidden = true; }, { passive: true, capture: true });
    }

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

    document.body.appendChild(panel);
    if (tip) document.body.appendChild(tip);

    // הכפתור נכנס למקום שלו בפס העליון. אם הפס נבנה מחדש (React) או שהעמוד עבר
    // לכלי אחר באותה אפליקציה — הכפתור עובר למקום החדש לפני הציור הבא (rAF),
    // כך שלא רואים אותו נעלם או קופץ.
    var top = null;
    function pair() {
      if (tbtn && btn.parentNode && (tbtn.parentNode !== btn.parentNode || tbtn.nextSibling !== btn)) btn.parentNode.insertBefore(tbtn, btn);
    }
    function place() { place0(); pair(); }
    function place0() {
      var cur = btn.parentNode;
      if (cur && cur !== top && cur.hasAttribute && cur.hasAttribute("data-a11y-slot") && shown(cur)) return;
      var slot = findSlot();
      if (slot) {
        if (slot !== cur) slot.appendChild(btn);
        if (top && top.parentNode) top.parentNode.removeChild(top);
        return;
      }
      if (cur && cur === top && top.isConnected) return;
      // אין פס עליון בעמוד — שורה קטנה בראש הדף, בזרימת הדף (לא צפה). רק אחרי שהעמוד
      // סיים לעלות: בדפי React הפס נבנה אחרי הסקריפט, ושורה זמנית הייתה מזיזה את הדף.
      if (!lateOk) return;
      top = top || document.createElement("div");
      top.id = "kb-a11y-top";
      top.appendChild(btn);
      document.body.insertBefore(top, document.body.firstChild);
    }
    var lateOk = false;
    function late() { setTimeout(function () { lateOk = true; place(); }, 1500); }
    if (document.readyState === "complete") late(); else window.addEventListener("load", late);
    place();
    var queued = false;
    function soon() {
      if (queued) return;
      queued = true;
      (window.requestAnimationFrame || setTimeout)(function () { queued = false; place(); if (isOpen()) position(); });
    }
    try {
      var mo = new MutationObserver(function (ms) {
        for (var i = 0; i < ms.length; i++) {
          var t = ms[i].target;
          if (t === panel || panel.contains(t) || t === btn || btn.contains(t) || (tbtn && (t === tbtn || tbtn.contains(t))) || t === tip) continue;
          if (!btn.isConnected) { place(); return; } // מיד, בלי לחכות לפריים
          soon(); return;
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    } catch (e) { /* בלי MutationObserver — הכפתור נשאר במקום הראשון */ }
    window.addEventListener("hashchange", soon);

    // החלונית נפתחת מתחת לכפתור (או מעליו, אם הכפתור בתחתית המסך), בתוך גבולות המסך.
    // בטלפון — גיליון ברוחב המסך מתחת לפס העליון.
    function position() {
      var r = btn.getBoundingClientRect(), vw = document.documentElement.clientWidth || innerWidth, vh = innerHeight;
      var s = panel.style;
      s.top = s.bottom = s.left = s.right = "";
      var below = r.top + r.height / 2 < vh * 0.6;
      if (below) { var t = Math.max(8, r.bottom + 6); s.top = t + "px"; s.maxHeight = Math.max(160, vh - t - 8) + "px"; }
      else { s.bottom = Math.max(8, vh - r.top + 6) + "px"; s.maxHeight = Math.max(160, r.top - 14) + "px"; }
      if (vw <= 520) { s.left = "8px"; s.right = "8px"; return; }
      var w = Math.min(300, vw - 16);
      if (r.left + r.width / 2 > vw / 2) s.right = Math.min(vw - w - 8, Math.max(8, vw - r.right)) + "px";
      else s.left = Math.min(vw - w - 8, Math.max(8, r.left)) + "px";
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
    document.addEventListener("click", function (e) {
      if (isOpen() && !panel.contains(e.target) && !btn.contains(e.target)) close(false);
    });
    window.addEventListener("resize", function () { if (isOpen()) position(); });
    // הפס העליון לא תמיד דביק — בגלילה החלונית נשארת צמודה לכפתור
    window.addEventListener("scroll", function () { if (isOpen()) position(); }, { passive: true, capture: true });
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
    p.innerHTML = '© 2026 שלמה הרטמן · נבנה בעזרת בינה מלאכותית לפי הנחיותיו · מותר לצטט ולקשר בציון המקור · <a href="' + base + 'terms.html#copyright">זכויות יוצרים ותנאי שימוש</a>';
    document.body.appendChild(p);
  }
  function start() { build(); copyright(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
