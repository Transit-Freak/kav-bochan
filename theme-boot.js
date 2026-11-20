/* תאורת יום / לילה — נטען ב-<head> בלי defer, לפני שהדף מצויר, כדי שלא יהבהב.
   הבחירה נשמרת ב-localStorage (kb-theme): "light" / "dark", ובלי ערך = לפי הטלפון.
   - <html data-theme="light|dark"> לבחירה מפורשת; בלי המאפיין כשזה לפי הטלפון.
   - <html class="kb-dark"> כשהתוצאה בפועל כהה (בחירה, או הטלפון במצב כהה) — לפיה נבחרים
     הצבעים הכהים של כל כלי (dark/<כלי>.css).
   - color-scheme (במאפיין ובתגית meta): "only light" בבהיר, כדי שגם מצב כהה כפוי של Chrome
     ("עיצוב כהה לתוכן אתרים") לא יחשיך את הדף; "dark" בכהה; "light dark" לפי הטלפון.
   הכפתור עצמו ב-a11y.js, ליד כפתור הנגישות. */
(function () {
  "use strict";
  if (window.kbTheme) return;
  var KEY = "kb-theme";
  var root = document.documentElement;
  var mq = null;
  try { mq = window.matchMedia("(prefers-color-scheme: dark)"); } catch (e) { /* דפדפן ישן */ }

  function read() {
    try { var v = localStorage.getItem(KEY); return v === "light" || v === "dark" ? v : "auto"; }
    catch (e) { return "auto"; }
  }
  function sysDark() { return !!(mq && mq.matches); }
  function meta(content) {
    var m = document.querySelector('meta[name="color-scheme"]');
    if (!m) {
      m = document.createElement("meta");
      m.name = "color-scheme";
      (document.head || root).appendChild(m);
    }
    if (m.content !== content) m.content = content;
  }

  // מקום לשני כפתורים (תאורה + נגישות) בפס העליון כבר מההתחלה, כדי ששום דבר לא יזוז כשהם נכנסים
  try {
    var st = document.createElement("style");
    st.id = "kb-theme-boot";
    st.textContent = "[data-a11y-slot]{width:auto!important;min-width:88px}";
    (document.head || root).appendChild(st);
  } catch (e) { /* בלי head */ }

  var mode = read(), printing = false;
  // הדפסה תמיד בהירה (גם כשהמסך כהה)
  function isDark() { return !printing && (mode === "dark" || (mode === "auto" && sysDark())); }
  function apply() {
    var dark = isDark();
    var attr = printing ? "light" : mode;
    if (attr === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", attr);
    root.classList.toggle("kb-dark", dark);
    var cs = mode === "light" ? "only light" : mode === "dark" ? "dark" : "light dark";
    root.style.colorScheme = cs;
    meta(cs);
    inline(dark);
    try { window.dispatchEvent(new CustomEvent("kb-theme", { detail: { mode: mode, dark: dark } })); } catch (e) { /* ישן */ }
  }

  /* ---- צבעים שכתובים ישירות על אלמנט (style="color:..." מתוך JS) ----
     dark/<כלי>.css לא יכול לגבור עליהם, אז במצב כהה הם מומרים כאן באותה שיטה (OKLCH):
     רקע בהיר → כהה, טקסט כהה → בהיר, צבעים עזים נשארים. המקור נשמר וחוזר במעבר לבהיר.
     עמוד שיש לו מצב כהה משלו מוותר על זה ב-data-inline="off" על תגית הסקריפט. */
  var me = document.currentScript;
  var INLINE = !(me && me.getAttribute("data-inline") === "off");
  var PROPS = [["background-color", "bg"], ["color", "fg"], ["border-top-color", "bd"], ["border-right-color", "bd"],
    ["border-bottom-color", "bd"], ["border-left-color", "bd"], ["outline-color", "bd"], ["fill", "svg"], ["stroke", "svg"]];
  var done = [], obs = null, on = false;
  function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function delin(c) { c = Math.max(0, Math.min(1, c)); return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)); }
  function conv(r, g, b, role) {
    var R = lin(r), G = lin(g), B = lin(b);
    var l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B), m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B), s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    var L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    var C = Math.sqrt(A * A + Bb * Bb), h = Math.atan2(Bb, A);
    if (role === "svg") role = L >= 0.85 ? "bg" : L <= 0.4 ? "fg" : "";
    if (role === "bg" || role === "bd") {
      if (L < 0.6 || C > 0.1) { if (role === "bd" && L < 0.36) role = "fg"; else return null; }
      else {
        if (C < 0.012) { C = 0.012; h = 4.6; }
        L = role === "bg" ? 0.215 + (1 - L) * 0.33 : 0.33 + (1 - L) * 0.35; C = Math.min(C, role === "bg" ? 0.075 : 0.09);
      }
    }
    if (role === "fg") { if (L > 0.66) return null; L = 0.955 - L * 0.48; C = Math.min(C, 0.2); }
    if (!role) return null;
    for (var i = 0; i < 40; i++) {
      var a2 = C * Math.cos(h), b2 = C * Math.sin(h);
      var l3 = Math.pow(L + 0.3963377774 * a2 + 0.2158037573 * b2, 3), m3 = Math.pow(L - 0.1055613458 * a2 - 0.0638541728 * b2, 3), s3 = Math.pow(L - 0.0894841775 * a2 - 1.291485548 * b2, 3);
      var x = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3, y = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3, z = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;
      if ((x > -0.001 && x < 1.001 && y > -0.001 && y < 1.001 && z > -0.001 && z < 1.001) || C < 0.001) return [delin(x), delin(y), delin(z)];
      C *= 0.92;
    }
    return null;
  }
  function fix(el) {
    if (!el.getAttribute || el.__kbSt === el.getAttribute("style")) return;
    var st = el.style, orig = el.__kbOrig || null, changed = false, keepFg = false;
    for (var i = 0; i < PROPS.length; i++) {
      var p = PROPS[i][0], v = st.getPropertyValue(p);
      if (!v || (orig && orig[p] && orig[p].out === v)) continue;
      var mm = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/.exec(v);
      if (!mm) continue;
      var a = mm[4] == null ? 1 : parseFloat(mm[4]) / (/%/.test(mm[4]) ? 100 : 1);
      if (PROPS[i][1] === "bg" && a < 0.35) continue;
      // אלמנט ריק עם רקע — עמודה בגרף, נקודה במקרא, פס התקדמות: הצבע נשאר, שיבלוט על הרקע הכהה
      if (PROPS[i][1] === "bg" && !el.firstChild && !/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName) && !/^rgb\(2(4[5-9]|5\d), 2(4[5-9]|5\d), 2(4[5-9]|5\d)\)$/.test(v)) { el.__kbEmpty = true; keepFg = true; continue; }
      if (p === "color" && keepFg) continue;
      var c = conv(+mm[1], +mm[2], +mm[3], PROPS[i][1]);
      // רקע צבעוני שנשאר כמו שהוא — גם הטקסט עליו נשאר
      if (!c) { if (p === "background-color" && a >= 0.9) keepFg = true; continue; }
      var out = a >= 0.999 ? "rgb(" + c.join(", ") + ")" : "rgba(" + c.join(", ") + ", " + a + ")";
      orig = orig || (el.__kbOrig = {});
      orig[p] = { v: v, prio: st.getPropertyPriority(p), out: out };
      st.setProperty(p, out, st.getPropertyPriority(p));
      changed = true;
    }
    if (changed && !el.__kbIn) {
      el.__kbIn = true; done.push(el);
      if (done.length > 4000) done = done.filter(function (x) { if (x.isConnected) return true; x.__kbIn = false; return false; });
    }
    el.__kbSt = el.getAttribute("style");
  }
  function scan(n) {
    if (n.nodeType !== 1) return;
    if (n.hasAttribute("style")) fix(n);
    if (n.firstElementChild) { var l = n.querySelectorAll("[style]"); for (var i = 0; i < l.length; i++) fix(l[i]); }
  }
  function inline(dark) {
    if (!INLINE || dark === on) return;
    on = dark;
    if (dark) {
      scan(root);
      try {
        obs = obs || new MutationObserver(function (ms) {
          for (var i = 0; i < ms.length; i++) {
            var x = ms[i];
            if (x.type === "attributes") fix(x.target);
            else {
              if (x.target.__kbEmpty && x.target.firstChild) { x.target.__kbEmpty = false; x.target.__kbSt = null; fix(x.target); }
              for (var j = 0; j < x.addedNodes.length; j++) scan(x.addedNodes[j]);
            }
          }
        });
        obs.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] });
      } catch (e) { /* בלי MutationObserver */ }
    } else {
      if (obs) obs.disconnect();
      for (var i = 0; i < done.length; i++) {
        var el = done[i], o = el.__kbOrig;
        for (var p in o) if (el.style.getPropertyValue(p) === o[p].out) el.style.setProperty(p, o[p].v, o[p].prio);
        el.__kbOrig = null; el.__kbSt = null; el.__kbIn = false;
      }
      done = [];
    }
  }
  apply();

  if (mq) {
    var onSys = function () { if (mode === "auto") apply(); };
    if (mq.addEventListener) mq.addEventListener("change", onSys);
    else if (mq.addListener) mq.addListener(onSys);
  }
  // בחירה בלשונית אחרת — מתעדכן גם כאן
  window.addEventListener("storage", function (e) {
    if (e.key === KEY || e.key === null) { mode = read(); apply(); }
  });
  // React או סקריפט אחר שמחליף את המחלקות של <html> — מחזירים את kb-dark
  try {
    new MutationObserver(function () {
      var dark = isDark();
      if (root.classList.contains("kb-dark") !== dark) root.classList.toggle("kb-dark", dark);
    }).observe(root, { attributes: true, attributeFilter: ["class"] });
  } catch (e) { /* בלי MutationObserver */ }

  window.addEventListener("beforeprint", function () { printing = true; apply(); });
  window.addEventListener("afterprint", function () { printing = false; apply(); });

  window.kbTheme = {
    get: function () { return mode; },
    isDark: function () { return root.classList.contains("kb-dark"); },
    set: function (m) {
      mode = m === "light" || m === "dark" ? m : "auto";
      try { if (mode === "auto") localStorage.removeItem(KEY); else localStorage.setItem(KEY, mode); } catch (e) { /* מצב פרטי */ }
      apply();
    },
  };
})();

/* "אתר מותאם למחשב" בטלפון (שלמה 20.11): Chrome בטלפון מחליף את זהות הדפדפן למחשב, אבל בדפים שעוברים
   בין מסכים בתוך הדף (history.pushState — למשל צי הרכבים) הוא לא תמיד מרחיב את רוחב הדף. אז כשטלפון
   מזדהה כמחשב (בלי "Mobile"/"Android" בזהות הדפדפן, מסך מגע צר) — הדף מרחיב את עצמו לרוחב מחשב. כשמכבים
   את מצב המחשב הזהות חוזרת לטלפון והדף נשאר ברוחב הטלפון. iPad (מסך רחב מ-600) — לא נוגעים */
(function () {
  "use strict";
  try {
    var ua = navigator.userAgent || "", sw = Math.min(screen.width || 0, screen.height || 0);
    if (/Mobi|Android|iPhone|iPod|iPad/i.test(ua) || !(navigator.maxTouchPoints > 0) || !sw || sw >= 600) return;
    var WIDE = "width=1200";
    var fix = function () {
      var m = document.querySelector('meta[name="viewport"]');
      if (m && m.getAttribute("content") !== WIDE) m.setAttribute("content", WIDE);
      return !!m;
    };
    document.documentElement.classList.add("kb-desk-on-phone");
    if (fix()) return;
    // הסקריפט נטען לפני תגית ה-viewport: מתקנים ברגע שהיא נוספת, לפני הציור הראשון
    var mo = new MutationObserver(function () { if (fix()) mo.disconnect(); });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", function () { fix(); mo.disconnect(); });
  } catch (e) { /* דפדפן ישן */ }
})();
