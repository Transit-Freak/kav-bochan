/* העין משחקת עם סמלי החג — דף הבית בלבד (נטען מ-hagim.js, שם גם הטבלה PLAY: איזה סמל → איזה משחק).

   מדי פעם (בערך פעם בשלושה-ארבעה מבטים, אף פעם לא פעמיים ברצף על אותו סמל), כשהעין הגדולה מסתכלת על סמל
   של החג, היא משחקת איתו לפי הסוג שלו, והסמל חוזר למקומו תוך כשתיים-שלוש שניות:
     eat   — פה קטן נפתח מתחת לעין, הסמל עף לתוכו מהצד, העין לועסת בחיוך קל (נשארת פתוחה), והסמל צומח מחדש בכפתור
     read  — המגילה נפתחת מול העין והאישון זז מימין לשמאל כמו בקריאה
     light — החנוכייה באה מול העין, הנרות כבים ונדלקים אחד אחרי השני (השמש קודם)
     spin  — העין מסובבת את הסביבון, הוא מאט, נוטה ומראה אות
     wear  — הכתר עף לראש העין, היא חובשת אותו לרגע בגאווה ומחזירה
   מגע או ריחוף על סמל באמצע — המשחק נעצר בעדינות והכול חוזר למקום. השכבה לא תופסת לחיצות (pointer-events:none).
   הכול transform/opacity (WAAPI) — בלי ספריות. לא רץ כשביקשו "בלי תנועה" (גם אם הכפתור נלחץ אחרי שהדף נטען).
   בדיקה: ‎?hag=hanukkah&eyeplay=eat‎ (או read / light / spin / wear / all) — העין פונה מיד לסמל וחוזרת על המשחק בלולאה. */
(function () {
  "use strict";
  var W = window, D = document, CFG = W.__hagPlay;
  if (!CFG || W.HagPlay || !Element.prototype.animate) return;
  var q = /[?&]eyeplay=([a-z]+)/.exec(location.search), DBG = q ? q[1] : "";
  var EYE = "M14 60 Q60 20 106 60 Q60 100 14 60 Z";
  var LETTERS = ["נ", "ג", "ה", "פ"];

  function still() {
    try { return D.documentElement.classList.contains("a11y-nomotion") || W.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return true; }
  }
  function div(cls, html) { var d = D.createElement("div"); d.className = cls; if (html) d.innerHTML = html; return d; }
  function rel(r, S) { return { l: r.left - S.left, t: r.top - S.top, w: r.width, h: r.height }; }
  function cx(r) { return r.l + r.w / 2; }
  function cy(r) { return r.t + r.h / 2; }
  function segs(s) {   // אותיות אמוג'י שלמות (👑👑 → ["👑","👑"])
    try { if (W.Intl && Intl.Segmenter) return Array.from(new Intl.Segmenter("he", { granularity: "grapheme" }).segment(s), function (x) { return x.segment; }); } catch (e) { /* ignore */ }
    return Array.from(s);
  }

  var css = ".hag-play{position:absolute;inset:0;z-index:6;pointer-events:none;overflow:visible}" +
    ".hag-play>div{position:absolute;left:0;top:0;transform-origin:50% 50%;will-change:transform,opacity;backface-visibility:hidden}" +
    ".hag-play svg{display:block;width:100%;height:100%;overflow:visible}" +
    ".hag-play .hp-em{display:flex;align-items:center;justify-content:center;line-height:1;white-space:nowrap;filter:drop-shadow(0 3px 4px rgba(0,0,0,.3))}" +
    ".hag-play .hp-em>*{font-size:inherit!important;margin:0!important;letter-spacing:0!important}" +
    ".hag-play .hp-fly>svg{filter:drop-shadow(0 4px 5px rgba(0,0,0,.3))}" +
    ".hag-play .hp-bub{display:grid;place-items:center;border-radius:50%;background:#fff;border:2px solid #1d4ed8;color:#1d4ed8;font:900 1em/1 'Heebo',system-ui,sans-serif;box-shadow:0 4px 10px rgba(15,23,42,.25)}";

  function attach(stage) {
    if (!stage || stage.__hagPlay) return;
    stage.__hagPlay = 1;
    if (!D.getElementById("hag-play-css")) { var st = D.createElement("style"); st.id = "hag-play-css"; st.textContent = css; D.head.appendChild(st); }
    var layer = div("hag-play"); layer.setAttribute("aria-hidden", "true"); stage.appendChild(layer);
    var iris = stage.querySelector(".kb-iris-js"), eyeEl = stage.querySelector(".eye");
    var cur = null, since = 0, last = null, force = null, gap = 3;

    // ---------- מתי משחקים ----------
    stage.addEventListener("kbh:gaze", function (e) {
      var o = e.detail && e.detail.orb; if (!o) return;
      since++;
      var act = CFG.play[o.getAttribute("data-k")], forced = force === o; force = null;
      if (cur || !act || still() || !stage.isConnected || !o.querySelector(".hag-tile")) return;
      if (!forced) {
        if (DBG) return;
        if (since < gap || o === last || Math.random() > .75) return;
      }
      start(o, act);
    });
    function orbsFor(a) { return [].filter.call(stage.querySelectorAll(".orb[data-k]"), function (o) { var x = CFG.play[o.getAttribute("data-k")]; return x && (a === "all" || x === a); }); }
    if (DBG) {
      var n = 0;
      var next = function () {
        if (!stage.isConnected) return;
        var L = orbsFor(DBG); if (!L.length || !stage.kbhLook) return;
        if (cur) { setTimeout(next, 600); return; }
        force = L[n++ % L.length]; stage.kbhLook(force.getAttribute("data-k"));
      };
      W.__hagPlayNext = next;
      var go = function () { setTimeout(next, 1500); };
      if (D.readyState === "complete") go(); else W.addEventListener("load", go, { once: true });
    }

    // עצירה עדינה: מגע/ריחוף/פוקוס על סמל, החלפת לשונית, שינוי גודל
    function onTouch(e) { if (cur && e.target.closest && e.target.closest(".orb")) abort(); }
    stage.addEventListener("pointerover", onTouch);
    stage.addEventListener("pointerdown", onTouch);
    stage.addEventListener("focusin", onTouch);
    W.addEventListener("resize", function () { if (cur) abort(); });
    D.addEventListener("visibilitychange", function () { if (cur && D.hidden) abort(); });

    // ---------- תשתית ----------
    function start(o, act) {
      stage.kbhPlay = true;
      cur = { o: o, act: act, anims: [], els: [], undo: [], timers: [] };
      // העין רק עכשיו התחילה לזוז לסמל (מעבר של 0.8 שנ') — מחכים שתגיע
      later(780, function () { try { RUN[act](o); } catch (err) { finish(); } });
    }
    function later(ms, fn) { var c = cur; if (!c) return; c.timers.push(setTimeout(function () { if (cur === c) fn(); }, ms)); }
    function A(node, kf, opt) {
      var a = node.animate(kf, Object.assign({ fill: "both", easing: "ease-in-out" }, opt));
      if (cur) cur.anims.push(a); return a;
    }
    function add(node, r) {
      node.style.width = r.w + "px"; node.style.height = r.h + "px";
      node.style.transform = "translate(" + r.l + "px," + r.t + "px)";
      layer.appendChild(node); if (cur) cur.els.push(node); return node;
    }
    // הכלים של כל משחק: מידות הבמה, העין (יחידות של 120 לרוחב הריבוע) והסמל
    function geo(o) {
      var S = stage.getBoundingClientRect(), E = rel(eyeEl.getBoundingClientRect(), S), u = E.w / 120;
      return { S: S, E: E, u: u, box: function (x, y, w, h) { return { l: E.l + x * u, t: E.t + y * u, w: w * u, h: h * u }; } };
    }
    // transform של רכיב שגודלו r כך שייראה כמו המלבן src (מרכז + קנה מידה), אפשר עם הזזה/סיבוב נוספים
    function T(r, at, s, extra) { return "translate(" + (r.l + (at.x - cx(r))) + "px," + (r.t + (at.y - cy(r))) + "px) scale(" + s + ")" + (extra || ""); }
    function ctr(r) { return { x: cx(r), y: cy(r) }; }
    function hide(node) { if (!node) return; var v = node.style.visibility; node.style.visibility = "hidden"; cur.undo.push(function () { node.style.visibility = v; }); }
    function irisTo(frames, dur) {   // frames: [[offset, x, y]] — מהמבט הנוכחי ובחזרה אליו
      if (!iris) return;
      var base = iris.style.transform || "translate(0px,0px)";
      var kf = [{ transform: base, offset: 0 }];
      frames.forEach(function (f) { kf.push({ transform: "translate(" + f[1] + "px," + f[2] + "px)", offset: f[0] }); });
      kf.push({ transform: base, offset: 1 });
      A(iris, kf, { duration: dur, fill: "none", easing: "ease-in-out" });
    }
    // פריט שעף: העתק של הסמל (SVG או אמוג'י) בגודל היעד, שמתחיל בדיוק במקום ובגודל של המקור
    function flyer(src, srcRect, destW, cls) {
      var d = div("hp-fly " + (cls || "")), node = src.cloneNode(true), h;
      node.removeAttribute("class"); node.style.cssText = "";
      if (node.tagName && node.tagName.toLowerCase() === "svg") { node.setAttribute("preserveAspectRatio", "xMidYMid meet"); h = destW * srcRect.h / srcRect.w; }
      else { d.className += " hp-em"; d.style.fontSize = (parseFloat(getComputedStyle(src).fontSize) * destW / srcRect.w) + "px"; h = destW * srcRect.h / srcRect.w; }
      d.appendChild(node);
      return { el: d, w: destW, h: h };
    }
    function face(g, kind) {   // שכבות על ריבוע העין: smile (פה סגור), mouth (פה פתוח), squint (עין מחייכת), blush
      var ln = CFG.line, n, r;
      if (kind === "mouth") {
        n = div("", "<svg viewBox='0 0 48 30'><path d='M4 3 Q24 -1 44 3 Q42 29 24 29 Q6 29 4 3 Z' fill='#7f1d1d' stroke='" + ln + "' stroke-width='3' stroke-linejoin='round'/>" +
          "<path d='M10 22 Q24 14 38 22 Q34 27 24 27 Q14 27 10 22 Z' fill='#fb7185'/><rect x='17' y='3' width='14' height='5' rx='1.5' fill='#fff'/></svg>");
        r = g.box(36, 93, 48, 30); n.style.transformOrigin = "50% 8%";
      } else if (kind === "smile") {
        n = div("", "<svg viewBox='0 0 48 30'><path d='M11 6 Q24 18 37 6' stroke='" + ln + "' stroke-width='3.5' stroke-linecap='round' fill='none'/></svg>");
        r = g.box(36, 93, 48, 30);
      } else if (kind === "squint") {
        // חיוך קל: העפעף התחתון עולה כרבע מגובה העין (העין נשארת פתוחה, עם הקשתית והאישון) —
        // באותו רקע של הריבוע, כך שרק החלק התחתון של העין מתכסה
        n = div("", "<svg viewBox='0 0 120 120'><defs><linearGradient id='hpBg' x1='0' y1='0' x2='0' y2='120' gradientUnits='userSpaceOnUse'><stop offset='0' stop-color='#fff'/><stop offset='1' stop-color='#e0f2fe'/></linearGradient>" +
          "<clipPath id='hpLid'><path d='M8 60 Q60 80 112 60 L112 92 L8 92 Z'/></clipPath><clipPath id='hpTile'><path d='" + EYE + "' transform='translate(60 60) scale(1.08) translate(-60 -60)'/></clipPath></defs>" +
          "<g clip-path='url(#hpTile)'><g clip-path='url(#hpLid)'><rect width='120' height='120' fill='url(#hpBg)'/>" + (CFG.bg || "") + "</g></g>" +
          "<path d='M19 62 Q60 79 101 62' stroke='" + ln + "' stroke-width='4' stroke-linecap='round' fill='none'/></svg>");
        r = g.box(0, 0, 120, 120);
      } else {
        n = div("", "<svg viewBox='0 0 120 120'><ellipse cx='20' cy='92' rx='11' ry='6' fill='#fb7185' opacity='.55'/><ellipse cx='100' cy='92' rx='11' ry='6' fill='#fb7185' opacity='.55'/></svg>");
        r = g.box(0, 0, 120, 120);
      }
      n.style.opacity = 0; add(n, r); return { el: n, r: r };
    }
    function show(f, t, dur, to) { later(t, function () { A(f.el, [{ opacity: to == null ? 0 : 1 - to }, { opacity: to == null ? 1 : to }], { duration: dur || 160 }); }); }
    function happy(g, t0, t1) {   // עין מחייכת + סומק בין t0 ל-t1
      var sq = face(g, "squint"), bl = face(g, "blush");
      show(sq, t0, 140); show(bl, t0, 220);
      show(sq, t1, 160, 0); show(bl, t1, 260, 0);
    }
    function pop(o, t) {   // הסמל חוזר לכפתור בקפיצה קטנה
      later(t, function () {
        var art = o.querySelector(".hag-art"), u = cur.undo.splice(0);
        u.forEach(function (f) { f(); });
        if (art) A(art, [{ transform: "scale(.2)", opacity: 0 }, { transform: "scale(1.15)", opacity: 1, offset: .6 }, { transform: "scale(1)", opacity: 1 }], { duration: 380, fill: "none", easing: "cubic-bezier(.3,1.4,.5,1)" });
      });
    }
    function backHome(t) { later(t, function () { var u = cur.undo.splice(0); u.forEach(function (f) { f(); }); }); }
    function finish() {
      var c = cur; if (!c) return;
      c.timers.forEach(clearTimeout);
      c.undo.forEach(function (f) { f(); });
      c.anims.forEach(function (a) { try { a.cancel(); } catch (e) { /* ignore */ } });
      c.els.forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
      cur = null; stage.kbhPlay = false; last = c.o; since = 0; gap = 3 + (Math.random() < .5 ? 1 : 0);
      if (DBG && W.__hagPlayNext) setTimeout(W.__hagPlayNext, 1400);
    }
    function abort() {   // דהייה מהירה של מה שבאוויר, והסמל חוזר מיד
      var c = cur; if (!c) return;
      c.timers.forEach(clearTimeout); c.timers = [];
      c.undo.forEach(function (f) { f(); }); c.undo = [];
      var o = c.o, art = o.querySelector(".hag-art");
      if (art) art.animate([{ opacity: .2 }, { opacity: 1 }], { duration: 180 });
      c.els.forEach(function (n) { n.animate([{ opacity: getComputedStyle(n).opacity }, { opacity: 0 }], { duration: 160, fill: "forwards" }); });
      if (iris) iris.getAnimations().forEach(function (a) { a.cancel(); });
      setTimeout(function () { if (cur === c) finish(); }, 180);
    }
    function end(t) { later(t, finish); }

    // ---------- המשחקים ----------
    var RUN = {
      // אוכל: פה נפתח, הסמל עף פנימה, לעיסה בעיניים מחייכות, והסמל צומח שוב בכפתור
      eat: function (o) {
        var g = geo(o), art = o.querySelector(".hag-art"), src = art.querySelector(".hag-em") || art.firstElementChild;
        var sr = rel(src.getBoundingClientRect(), g.S), m = g.box(60, 103, 0, 0), mouthAt = { x: m.l, y: m.t };
        var f = flyer(src, sr, sr.w, ""), box = { l: 0, t: 0, w: f.w, h: f.h };
        add(f.el, box); hide(src);
        var s1 = Math.min(1, 34 * g.u / sr.w), mid = { x: (cx(sr) + mouthAt.x) / 2 - 10 * g.u, y: (cy(sr) + mouthAt.y) / 2 - 16 * g.u };
        // סמל שמעל הפה עף מסביב לצד של העין (לא מול האישון): דרך נקודה ליד הפינה התחתונה של הריבוע, בצד של הסמל
        if (cy(sr) < g.E.t + 100 * g.u) mid = { x: g.E.l + (cx(sr) >= g.E.l + 60 * g.u ? 134 : -14) * g.u, y: g.E.t + 86 * g.u };
        A(f.el, [
          { transform: T(box, ctr(sr), 1), opacity: 1, offset: 0 },
          { transform: T(box, mid, (1 + s1) / 2, " rotate(-14deg)"), opacity: 1, offset: .55, easing: "ease-in-out" },
          { transform: T(box, { x: mouthAt.x, y: mouthAt.y - 4 * g.u }, s1, " rotate(-24deg)"), opacity: 1, offset: .86 },
          { transform: T(box, { x: mouthAt.x, y: mouthAt.y + 2 * g.u }, s1 * .35, " rotate(-30deg)"), opacity: 0, offset: 1 }
        ], { duration: 560, easing: "ease-out" });
        var sm = face(g, "smile"), mo = face(g, "mouth");
        show(sm, 0, 120); show(sm, 160, 100, 0);
        later(150, function () { A(mo.el, [{ opacity: 0, transform: T(mo.r, ctr(mo.r), 1) + " scaleY(.1)" }, { opacity: 1, transform: T(mo.r, ctr(mo.r), 1) + " scaleY(1)" }], { duration: 260, easing: "cubic-bezier(.3,1.5,.5,1)" }); });
        // לעיסה
        later(560, function () {
          var b = T(mo.r, ctr(mo.r), 1);
          A(mo.el, [{ transform: b + " scale(1,1)" }, { transform: b + " scale(1.06,.32)", offset: .12 }, { transform: b + " scale(.96,.62)", offset: .3 },
            { transform: b + " scale(1.08,.26)", offset: .46 }, { transform: b + " scale(.96,.58)", offset: .64 }, { transform: b + " scale(1.08,.24)", offset: .82 },
            { transform: b + " scale(1,.2)", opacity: 1, offset: .94 }, { transform: b + " scale(1,.2)", opacity: 0 }], { duration: 900, easing: "ease-in-out" });
          // פירורים
          [[-1, 0], [1, 120], [-1, 330]].forEach(function (c, i) {
            later(c[1], function () {
              var cr = div("", "<svg viewBox='0 0 10 10'><circle cx='5' cy='5' r='4' fill='" + (i % 2 ? "#b45309" : "#f59e0b") + "'/></svg>"), r = g.box(58 + c[0] * 14, 103, 4, 4);
              add(cr, r);
              A(cr, [{ transform: T(r, ctr(r), 1), opacity: 1 }, { transform: T(r, { x: cx(r) + c[0] * 12 * g.u, y: cy(r) - 8 * g.u }, 1.1), opacity: 1, offset: .4 }, { transform: T(r, { x: cx(r) + c[0] * 18 * g.u, y: cy(r) + 14 * g.u }, .6), opacity: 0 }], { duration: 520, easing: "ease-out" });
            });
          });
        });
        happy(g, 600, 1620);
        irisTo([[.2, 0, 4], [.45, -2, 4.5], [.6, 2, 4.5], [.75, 0, 3]], 1900);
        show(sm, 1440, 160); show(sm, 1760, 160, 0);
        pop(o, 1360);
        end(1960);
      },

      // מגילה: עפה אל מול העין, נפתחת, האישון קורא מימין לשמאל, נגללת וחוזרת
      read: function (o) {
        var g = geo(o), art = o.querySelector(".hag-art"), src = art.firstElementChild, sr = rel(src.getBoundingClientRect(), g.S);
        var dest = g.box(-14, 80, 148, 50), at = ctr(dest), u = g.u;
        var f = flyer(src, sr, 46 * u), fb = { l: 0, t: 0, w: f.w, h: f.h };
        add(f.el, fb); hide(src);
        var s0 = sr.w / f.w, mid = { x: (cx(sr) + at.x) / 2, y: Math.min(cy(sr), at.y) - 24 * u };
        A(f.el, [{ transform: T(fb, ctr(sr), s0) }, { transform: T(fb, mid, (s0 + 1) / 2, " rotate(8deg)"), offset: .5 }, { transform: T(fb, at, 1), opacity: 1, offset: .9 }, { transform: T(fb, at, 1), opacity: 0 }], { duration: 520, easing: "ease-in-out" });
        // המגילה הגדולה: קלף ושני מוטות
        var lines = "";
        for (var i = 0; i < 3; i++) {
          var y = 17 + i * 8, x = 120;
          while (x > 24) { var w = 4 + ((i * 7 + x) % 9); lines += "<rect x='" + (x - w) + "' y='" + y + "' width='" + w + "' height='3' rx='1.2' fill='#78350f' opacity='.75'/>"; x -= w + 3; }
        }
        var parch = div("", "<svg viewBox='0 0 148 50' preserveAspectRatio='none'><rect x='12' y='7' width='124' height='36' fill='#fef3c7' stroke='#92400e' stroke-width='2'/><rect x='12' y='7' width='124' height='5' fill='#fde68a'/>" + lines + "</svg>");
        add(parch, dest); parch.style.opacity = 0;
        var rod = "<svg viewBox='0 0 16 50'><rect x='5' y='0' width='6' height='50' rx='3' fill='#78350f'/><rect x='1' y='5' width='14' height='40' rx='6' fill='#92400e' stroke='#5b2a07' stroke-width='1.5'/><rect x='4' y='8' width='3' height='34' rx='1.5' fill='#fff' opacity='.25'/></svg>";
        var rr = g.box(0, 80, 16, 50), rL = div("", rod), rR = div("", rod);
        add(rL, rr); add(rR, rr); rL.style.opacity = rR.style.opacity = 0;
        var cyR = cy(rr), xL = cx(dest) - 70 * u, xR = cx(dest) + 70 * u, xc = cx(dest);
        later(470, function () {
          A(rL, [{ transform: T(rr, { x: xc - 7 * u, y: cyR }, 1), opacity: 0 }, { transform: T(rr, { x: xc - 7 * u, y: cyR }, 1), opacity: 1, offset: .15 }, { transform: T(rr, { x: xL, y: cyR }, 1), opacity: 1 }], { duration: 420, easing: "cubic-bezier(.3,.9,.4,1)" });
          A(rR, [{ transform: T(rr, { x: xc + 7 * u, y: cyR }, 1), opacity: 0 }, { transform: T(rr, { x: xc + 7 * u, y: cyR }, 1), opacity: 1, offset: .15 }, { transform: T(rr, { x: xR, y: cyR }, 1), opacity: 1 }], { duration: 420, easing: "cubic-bezier(.3,.9,.4,1)" });
          A(parch, [{ transform: T(dest, at, 1) + " scaleX(.08)", opacity: 0 }, { transform: T(dest, at, 1) + " scaleX(.1)", opacity: 1, offset: .15 }, { transform: T(dest, at, 1) + " scaleX(1)", opacity: 1 }], { duration: 420, easing: "cubic-bezier(.3,.9,.4,1)" });
        });
        // קריאה: שתי שורות, מימין לשמאל
        irisTo([[.2, 0, 5], [.3, 9, 5.5], [.52, -9, 5.5], [.57, 9, 6.5], [.79, -9, 6.5], [.88, 0, 4]], 2300);
        later(1900, function () {
          A(rL, [{ transform: T(rr, { x: xL, y: cyR }, 1), opacity: 1 }, { transform: T(rr, { x: xc - 7 * u, y: cyR }, 1), opacity: 1, offset: .85 }, { transform: T(rr, { x: xc - 7 * u, y: cyR }, 1), opacity: 0 }], { duration: 300, easing: "ease-in" });
          A(rR, [{ transform: T(rr, { x: xR, y: cyR }, 1), opacity: 1 }, { transform: T(rr, { x: xc + 7 * u, y: cyR }, 1), opacity: 1, offset: .85 }, { transform: T(rr, { x: xc + 7 * u, y: cyR }, 1), opacity: 0 }], { duration: 300, easing: "ease-in" });
          A(parch, [{ transform: T(dest, at, 1) + " scaleX(1)", opacity: 1 }, { transform: T(dest, at, 1) + " scaleX(.1)", opacity: 1, offset: .85 }, { transform: T(dest, at, 1) + " scaleX(.08)", opacity: 0 }], { duration: 300, easing: "ease-in" });
        });
        later(2160, function () {
          A(f.el, [{ transform: T(fb, at, 1), opacity: 0 }, { transform: T(fb, at, 1), opacity: 1, offset: .12 }, { transform: T(fb, mid, (s0 + 1) / 2, " rotate(-8deg)"), offset: .55 }, { transform: T(fb, ctr(sr), s0), opacity: 1 }], { duration: 480, easing: "ease-in-out" });
        });
        backHome(2640);
        end(2680);
      },

      // חנוכייה: באה מול העין, הנרות כבים בדרך ונדלקים אחד אחרי השני — השמש ואז משמאל לימין
      light: function (o) {
        var g = geo(o), art = o.querySelector(".hag-art"), src = art.querySelector("svg") || art.firstElementChild, sr = rel(src.getBoundingClientRect(), g.S), u = g.u;
        var f = flyer(src, sr, 104 * u), fb = { l: 0, t: 0, w: f.w, h: f.h }, at = { x: g.E.l + 60 * u, y: g.E.t + 92 * u + f.h / 2 };
        add(f.el, fb); hide(src);
        var svg = f.el.querySelector("svg"), flames = [];
        [].forEach.call(svg.querySelectorAll(".hag-flame"), function (fl) {
          var gg = D.createElementNS("http://www.w3.org/2000/svg", "g"), inner = fl.nextElementSibling;
          fl.parentNode.insertBefore(gg, fl); gg.appendChild(fl); if (inner && inner.tagName.toLowerCase() === "ellipse") gg.appendChild(inner);
          gg.style.transformBox = "fill-box"; gg.style.transformOrigin = "50% 100%";
          flames.push({ g: gg, x: +fl.getAttribute("cx") });
        });
        var sham = flames.filter(function (x) { return x.x === 80; })[0], rest = flames.filter(function (x) { return x !== sham; }).sort(function (a, b) { return a.x - b.x; });
        var order = (sham ? [sham] : []).concat(rest);
        var s0 = sr.w / f.w, mid = { x: (cx(sr) + at.x) / 2, y: Math.min(cy(sr), at.y) - 20 * u };
        A(f.el, [{ transform: T(fb, ctr(sr), s0) }, { transform: T(fb, mid, (s0 + 1) / 2), offset: .5 }, { transform: T(fb, at, 1) }], { duration: 520, easing: "ease-in-out" });
        order.forEach(function (fl) { A(fl.g, [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(.2)", opacity: 0 }], { duration: 220, delay: 60 }); });
        var t0 = 620, dt = 115, tr = [[.18, 0, 6]];
        order.forEach(function (fl, i) {
          var t = t0 + (i ? 120 + (i - 1) * dt : 0);
          later(t, function () { A(fl.g, [{ transform: "scale(.1)", opacity: 0 }, { transform: "scale(1.35)", opacity: 1, offset: .55 }, { transform: "scale(1)", opacity: 1 }], { duration: 260, easing: "ease-out" }); });
          tr.push([(t + 60) / 2300, ((fl.x - 80) / 60 * 9).toFixed(1), fl === sham ? 4 : 6.5]);
        });
        tr.push([.8, 0, 5]);
        irisTo(tr, 2300);
        happy(g, 1560, 1900);
        later(1800, function () {
          A(f.el, [{ transform: T(fb, at, 1) }, { transform: T(fb, mid, (s0 + 1) / 2), offset: .5 }, { transform: T(fb, ctr(sr), s0) }], { duration: 480, easing: "ease-in-out" });
        });
        backHome(2290);
        end(2320);
      },

      // סביבון: העין מסובבת אותו, הוא מאט, נוטה ומראה אות
      spin: function (o) {
        var g = geo(o), art = o.querySelector(".hag-art"), part = art.querySelector(".hag-dreidel") || art.firstElementChild, sr = rel(part.getBoundingClientRect(), g.S), u = g.u;
        var L = Math.floor(Math.random() * 4), strip = "";
        for (var k = 0; k < 16; k++) strip += "<text x='" + (20 + k * 28) + "' y='34' text-anchor='middle' font-size='21' font-weight='900' fill='#fff' font-family='Heebo,system-ui,sans-serif'>" + LETTERS[k % 4] + "</text>";
        var d = div("hp-fly", "<svg viewBox='0 0 40 66'><defs><clipPath id='hpFace'><rect x='6' y='13' width='28' height='28'/></clipPath></defs>" +
          "<rect x='17' y='0' width='6' height='14' rx='2' fill='#0f172a'/><rect x='4' y='11' width='32' height='32' rx='4' fill='#2563eb' stroke='#0f172a' stroke-width='2.5'/>" +
          "<g clip-path='url(#hpFace)'><g class='hp-strip'>" + strip + "</g></g><path d='M4 43 L36 43 L20 64 Z' fill='#1d4ed8' stroke='#0f172a' stroke-width='2.5' stroke-linejoin='round'/>" +
          "<path d='M8 15 V39' stroke='#fff' stroke-width='2.5' stroke-linecap='round' opacity='.3'/></svg>");
        var dw = 34 * u, db = { l: 0, t: 0, w: dw, h: dw * 66 / 40 }, at = { x: g.E.l + 60 * u, y: g.E.t + 90 * u + db.h / 2 };
        d.style.transformOrigin = "50% 97%";
        add(d, db); hide(part);
        // הסביבון מסתובב סביב העוקץ (למטה) — מתקנים את המרכז כשהוא מוקטן
        var Tb = function (r, p, sc, ex) { return T(r, { x: p.x, y: p.y - .47 * r.h * (1 - sc) }, sc, ex); };
        var s0 = sr.h / (db.h * 1.08), mid = { x: (cx(sr) + at.x) / 2, y: Math.min(cy(sr), at.y) - 22 * u };
        A(d, [{ transform: Tb(db, ctr(sr), s0, " rotate(22deg)") }, { transform: Tb(db, mid, (s0 + 1) / 2, " rotate(-10deg)"), offset: .55 },
          { transform: Tb(db, { x: at.x, y: at.y - 6 * u }, 1, " rotate(4deg)"), offset: .85 }, { transform: Tb(db, at, 1, " rotate(0deg)") }], { duration: 520, easing: "ease-in-out" });
        var st = d.querySelector(".hp-strip");
        later(500, function () {
          // הפנים זזות (הסביבון "מסתובב") ומאטות עד האות; הגוף מתנדנד קצת
          A(st, [{ transform: "translateX(0px)" }, { transform: "translateX(" + (-28 * (8 + L)) + "px)" }], { duration: 1150, easing: "cubic-bezier(.2,.75,.35,1)" });
          var b = function (r) { return Tb(db, at, 1, " rotate(" + r + "deg)"); };
          A(d, [{ transform: b(0) }, { transform: b(-5), offset: .1 }, { transform: b(5), offset: .2 }, { transform: b(-5), offset: .3 }, { transform: b(5), offset: .42 },
            { transform: b(-6), offset: .56 }, { transform: b(7), offset: .7 }, { transform: b(-8), offset: .82 }, { transform: b(0) }], { duration: 1150, easing: "linear" });
        });
        irisTo([[.18, 0, 6], [.3, 3, 7], [.36, -3, 7], [.42, 3, 7], [.48, -3, 7], [.55, 2, 7], [.62, -2, 7], [.68, 0, 6.5], [.82, 0, 5]], 2700);
        later(1650, function () {
          var b = function (r) { return Tb(db, at, 1, " rotate(" + r + "deg)"); };
          A(d, [{ transform: b(0) }, { transform: b(30), offset: .55, easing: "ease-in" }, { transform: b(20), offset: .78 }, { transform: b(26) }], { duration: 380, easing: "ease-out" });
          var bub = div("hp-bub", LETTERS[L]), br = g.box(84, 70, 30, 30);
          bub.style.fontSize = (19 * u) + "px"; bub.style.opacity = 0;
          add(bub, br);
          A(bub, [{ transform: T(br, ctr(br), .2), opacity: 0 }, { transform: T(br, ctr(br), 1.15), opacity: 1, offset: .6 }, { transform: T(br, ctr(br), 1), opacity: 1 }], { duration: 300, delay: 220, easing: "ease-out" });
          later(820, function () { A(bub, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 }); });
        });
        happy(g, 1900, 2380);
        later(2240, function () {
          A(d, [{ transform: Tb(db, at, 1, " rotate(26deg)") }, { transform: Tb(db, mid, (s0 + 1) / 2, " rotate(-6deg)"), offset: .5 }, { transform: Tb(db, ctr(sr), s0, " rotate(22deg)") }], { duration: 480, easing: "ease-in-out" });
        });
        backHome(2720);
        end(2760);
      },

      // כתר: עף לראש העין, היא חובשת אותו לרגע (הכתר הקטן של הקישוט זז הצידה) ומחזירה
      wear: function (o) {
        var g = geo(o), art = o.querySelector(".hag-art"), src = art.querySelector(".hag-em") || art.firstElementChild, u = g.u, sr, f;
        var hat = stage.querySelector(".hag-eyedeco .hag-hat"), txt = src.firstChild;
        var parts = txt && txt.nodeType === 3 ? segs(txt.nodeValue) : [];
        if (parts.length > 1) {
          // לוקחים כתר אחד מתוך שניים
          var rg = D.createRange(); rg.setStart(txt, 0); rg.setEnd(txt, parts[0].length);
          sr = rel(rg.getBoundingClientRect(), g.S);
          var full = txt.nodeValue; txt.nodeValue = full.slice(parts[0].length);
          cur.undo.push(function () { txt.nodeValue = full; });
          var one = D.createElement("span"); one.textContent = parts[0];
          var fs = parseFloat(getComputedStyle(src).fontSize);
          f = { el: div("hp-fly hp-em"), w: 62 * u, h: 62 * u * sr.h / sr.w }; f.el.style.fontSize = (fs * 62 * u / sr.w) + "px"; f.el.appendChild(one);
        } else {
          sr = rel(src.getBoundingClientRect(), g.S); f = flyer(src, sr, 62 * u); hide(src);
        }
        var fb = { l: 0, t: 0, w: f.w, h: f.h }, at = { x: g.E.l + 60 * u, y: g.E.t + 9 * u - f.h * .32 };
        add(f.el, fb);
        if (hat) { hat.style.transition = "opacity .2s"; hat.style.opacity = 0; cur.undo.push(function () { hat.style.opacity = ""; }); }
        var s0 = sr.w / f.w, mid = { x: (cx(sr) + at.x) / 2, y: Math.min(cy(sr), at.y) - 30 * u };
        var c = function (p, s, r) { return T(fb, p, s, " rotate(" + r + "deg)"); };
        A(f.el, [{ transform: c(ctr(sr), s0, 0) }, { transform: c(mid, (s0 + 1) / 2, -16), offset: .5 }, { transform: c({ x: at.x, y: at.y - 8 * u }, 1, -6), offset: .78 },
          { transform: c(at, 1, 0) + " scale(1.12,.86)", offset: .9 }, { transform: c(at, 1, -4) }], { duration: 560, easing: "ease-in-out" });
        later(860, function () { A(f.el, [{ transform: c(at, 1, -4) }, { transform: c(at, 1, 5), offset: .3 }, { transform: c(at, 1, -5), offset: .65 }, { transform: c(at, 1, -4) }], { duration: 560 }); });
        // נצנוצים
        [[18, 6, 600], [104, 2, 760], [96, 112, 900]].forEach(function (s) {
          later(s[2], function () {
            var sp = div("", "<svg viewBox='0 0 20 20'><path d='M10 0 Q11 9 20 10 Q11 11 10 20 Q9 11 0 10 Q9 9 10 0Z' fill='#facc15' stroke='#b45309' stroke-width='.8'/></svg>"), r = g.box(s[0] - 7, s[1] - 7, 14, 14);
            add(sp, r); A(sp, [{ transform: T(r, ctr(r), .1, " rotate(0deg)"), opacity: 0 }, { transform: T(r, ctr(r), 1.2, " rotate(45deg)"), opacity: 1, offset: .5 }, { transform: T(r, ctr(r), .2, " rotate(90deg)"), opacity: 0 }], { duration: 560 });
          });
        });
        irisTo([[.25, 0, -6], [.6, 0, -6.5], [.8, 0, -3]], 1900);
        happy(g, 640, 1380);
        later(1460, function () {
          A(f.el, [{ transform: c(at, 1, -4) }, { transform: c(mid, (s0 + 1) / 2, 10), offset: .5 }, { transform: c(ctr(sr), s0, 0) }], { duration: 480, easing: "ease-in-out" });
        });
        backHome(1940);
        end(1980);
      }
    };
  }

  W.HagPlay = { attach: attach };
})();
