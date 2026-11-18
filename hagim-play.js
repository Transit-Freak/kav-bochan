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
    // נקודת ביניים בדרך מהסמל ליעד שלא עוברת מול העין: אם הקו הישר חוצה את העין — דרך הפינה של הריבוע בצד של הסמל
    // (למטה כשהיעד מתחת לעין, למעלה כשהיעד מעליה). במקרה אחר — באמצע הדרך, קצת למעלה
    function around(g, from, to, lift) {
      var u = g.u, X = function (p) { return (p.x - g.E.l) / u; }, Y = function (p) { return (p.y - g.E.t) / u; };
      var fy = Y(from), ty = Y(to), side = X(from) >= 60 ? 136 : -16;
      if (ty >= 60 && fy < 92) return { x: g.E.l + side * u, y: g.E.t + 98 * u };
      if (ty < 60 && fy > 28) return { x: g.E.l + side * u, y: g.E.t + 14 * u };
      return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - (lift == null ? 16 : lift) * u };
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
          "<clipPath id='hpLid'><path d='M8 65 Q60 87 112 65 L112 96 L8 96 Z'/></clipPath><clipPath id='hpTile'><path d='" + EYE + "' transform='translate(60 60) scale(1.08) translate(-60 -60)'/></clipPath></defs>" +
          "<g clip-path='url(#hpTile)'><g clip-path='url(#hpLid)'><rect width='120' height='120' fill='url(#hpBg)'/>" + (CFG.bg || "") + "</g></g>" +
          "<path d='M19 66 Q60 86 101 66' stroke='" + ln + "' stroke-width='4' stroke-linecap='round' fill='none'/></svg>");
        r = g.box(0, 0, 120, 120);
      } else {
        n = div("", "<svg viewBox='0 0 120 120'><ellipse cx='20' cy='92' rx='11' ry='6' fill='#fb7185' opacity='.55'/><ellipse cx='100' cy='92' rx='11' ry='6' fill='#fb7185' opacity='.55'/></svg>");
        r = g.box(0, 0, 120, 120);
      }
      n.className = "hp-face"; n.style.opacity = 0; add(n, r); return { el: n, r: r };
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
    // לעיסה: חיוך, פה נפתח, לועס עם פירורים, חיוך קל בעין — מתחיל ב-t0, נמשך כ-1.9 שניות
    function munch(g, t0) {
      var sm = face(g, "smile"), mo = face(g, "mouth");
      show(sm, t0, 120); show(sm, t0 + 160, 100, 0);
      later(t0 + 150, function () { A(mo.el, [{ opacity: 0, transform: T(mo.r, ctr(mo.r), 1) + " scaleY(.1)" }, { opacity: 1, transform: T(mo.r, ctr(mo.r), 1) + " scaleY(1)" }], { duration: 260, easing: "cubic-bezier(.3,1.5,.5,1)" }); });
      // לעיסה
      later(t0 + 560, function () {
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
      happy(g, t0 + 600, t0 + 1620);
      show(sm, t0 + 1440, 160); show(sm, t0 + 1760, 160, 0);
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

    // ---------- עזרים למשחקים הכלליים ----------
    function P(g, x, y) { return { x: g.E.l + x * g.u, y: g.E.t + y * g.u }; }
    // באיזה צד של העין הסמל (1 ימין, ‎-1 שמאל) ונקודה בצד הזה, מחוץ לעין (x ברירת מחדל 142 ביחידות הריבוע)
    function spotSide(o, y, x) {
      var e = eyeEl.getBoundingClientRect(), r = o.getBoundingClientRect(), sd = r.left + r.width / 2 >= e.left + e.width / 2 ? 1 : -1, X = x == null ? 142 : x;
      return { x: sd > 0 ? X : 120 - X, y: y == null ? 66 : y, sd: sd };
    }
    function dirTo(g, o) {   // כיוון המבט אל הסמל (וקטור יחידה)
      var r = rel(o.getBoundingClientRect(), g.S), dx = cx(r) - cx(g.E), dy = cy(r) - cy(g.E), l = Math.sqrt(dx * dx + dy * dy) || 1;
      return { x: dx / l, y: dy / l };
    }
    // הסמל עף לנקודה atU (ביחידות הריבוע) ברוחב wU, מסביב לעין. inner — הסמל עצמו בתוך העטיפה, לסיבובים ולנפנופים
    function visit(o, wU, atU) {
      var g = geo(o), art = o.querySelector(".hag-art"), src = art.querySelector(".hag-em") || art.querySelector("svg") || art.firstElementChild;
      var sr = rel(src.getBoundingClientRect(), g.S), u = g.u, f = flyer(src, sr, wU * u), fb = { l: 0, t: 0, w: f.w, h: f.h }, at = P(g, atU.x, atU.y);
      add(f.el, fb); hide(src);
      var inner = f.el.firstElementChild; inner.style.transformOrigin = "50% 50%"; inner.style.display = "block";
      if (inner.tagName.toLowerCase() !== "svg") inner.style.display = "inline-block";
      var s0 = sr.w / f.w, mid = around(g, ctr(sr), at);
      var pose = function (p, s, r) { return T(fb, p, s, " rotate(" + (r || 0) + "deg)"); };
      A(f.el, [{ transform: pose(ctr(sr), s0, 0) }, { transform: pose(mid, (s0 + 1) / 2, -10), offset: .5 }, { transform: pose(at, 1, 0) }], { duration: 520 });
      var sd = atU.sd || (atU.x >= 60 ? 1 : -1);
      return { g: g, u: u, el: f.el, inner: inner, at: at, atU: atU, sd: sd, pose: pose,
        back: function (t, r, endAt, from) {
          later(t, function () {
            var a = from || at, m2 = around(g, a, ctr(sr));
            A(f.el, [{ transform: pose(a, 1, r || 0), opacity: 1 }, { transform: pose(m2, (s0 + 1) / 2, 8), opacity: 1, offset: .5 }, { transform: pose(ctr(sr), s0, 0), opacity: 1 }], { duration: 480 });
          });
          backHome(t + 480); end(Math.max(t + 520, endAt || 0));
        } };
    }
    function say(g, ch, x, y, t, hold) {   // בועה קטנה עם סימן
      var b = div("hp-bub", ch), r = g.box(x - 13, y - 13, 26, 26);
      b.style.fontSize = (16 * g.u) + "px"; b.style.opacity = 0; add(b, r);
      later(t, function () { A(b, [{ transform: T(r, ctr(r), .2), opacity: 0 }, { transform: T(r, ctr(r), 1.15), opacity: 1, offset: .6 }, { transform: T(r, ctr(r), 1), opacity: 1 }], { duration: 260, easing: "ease-out" }); });
      later(t + 260 + (hold || 300), function () { A(b, [{ opacity: 1 }, { opacity: 0 }], { duration: 180 }); });
    }
    function spark(g, x, y, t) {
      later(t, function () {
        var sp = div("", "<svg viewBox='0 0 20 20'><path d='M10 0 Q11 9 20 10 Q11 11 10 20 Q9 11 0 10 Q9 9 10 0Z' fill='#facc15' stroke='#b45309' stroke-width='.8'/></svg>"), r = g.box(x - 7, y - 7, 14, 14);
        add(sp, r); A(sp, [{ transform: T(r, ctr(r), .1, " rotate(0deg)"), opacity: 0 }, { transform: T(r, ctr(r), 1.2, " rotate(45deg)"), opacity: 1, offset: .5 }, { transform: T(r, ctr(r), .2, " rotate(90deg)"), opacity: 0 }], { duration: 560 });
      });
    }
    function heart(g, x, y, t) {
      later(t, function () {
        var h = div("", "<svg viewBox='0 0 20 18'><path d='M10 17 C2 11 0 7 2 4 C4 1 8 1 10 5 C12 1 16 1 18 4 C20 7 18 11 10 17Z' fill='#f43f5e'/></svg>"), r = g.box(x - 6, y - 5, 12, 11);
        add(h, r); A(h, [{ transform: T(r, ctr(r), .2), opacity: 0 }, { transform: T(r, { x: cx(r), y: cy(r) - 4 * g.u }, 1.1), opacity: 1, offset: .4 }, { transform: T(r, { x: cx(r), y: cy(r) - 14 * g.u }, .8), opacity: 0 }], { duration: 700 });
      });
    }
    function blinkQ(g, t) {   // מצמוץ מהיר אחד (העפעף של העין עצמה)
      var lid = stage.querySelector(".eye-layer");
      later(t, function () { if (lid) A(lid, [{ transform: "scaleY(1)" }, { transform: "scaleY(.1)", offset: .45 }, { transform: "scaleY(1)" }], { duration: 260, fill: "none" }); });
    }

    // ---------- המשחקים ----------
    var RUN = {
      // אוכל: פה נפתח, הסמל עף פנימה, לעיסה בעיניים מחייכות, והסמל צומח שוב בכפתור
      eat: function (o) {
        var g = geo(o), art = o.querySelector(".hag-art"), src = art.querySelector(".hag-em") || art.firstElementChild;
        var sr = rel(src.getBoundingClientRect(), g.S), m = g.box(60, 103, 0, 0), mouthAt = { x: m.l, y: m.t };
        var f = flyer(src, sr, sr.w, ""), box = { l: 0, t: 0, w: f.w, h: f.h };
        add(f.el, box); hide(src);
        var s1 = Math.min(1, 34 * g.u / sr.w), mid = around(g, ctr(sr), mouthAt);
        A(f.el, [
          { transform: T(box, ctr(sr), 1), opacity: 1, offset: 0 },
          { transform: T(box, mid, (1 + s1) / 2, " rotate(-14deg)"), opacity: 1, offset: .55, easing: "ease-in-out" },
          { transform: T(box, { x: mouthAt.x, y: mouthAt.y - 4 * g.u }, s1, " rotate(-24deg)"), opacity: 1, offset: .86 },
          { transform: T(box, { x: mouthAt.x, y: mouthAt.y + 2 * g.u }, s1 * .35, " rotate(-30deg)"), opacity: 0, offset: 1 }
        ], { duration: 560, easing: "ease-out" });
        munch(g, 0);
        irisTo([[.2, 0, 3], [.45, -2, 2], [.6, 2, 2], [.75, 0, 1]], 1900);
        pop(o, 1360);
        end(1960);
      },

      // מגילה: עפה אל מול העין, נפתחת, האישון קורא מימין לשמאל, נגללת וחוזרת
      read: function (o) {
        var g = geo(o), art = o.querySelector(".hag-art"), src = art.firstElementChild, sr = rel(src.getBoundingClientRect(), g.S);
        var dest = g.box(-14, 80, 148, 50), at = ctr(dest), u = g.u;
        var f = flyer(src, sr, 46 * u), fb = { l: 0, t: 0, w: f.w, h: f.h };
        add(f.el, fb); hide(src);
        var s0 = sr.w / f.w, mid = around(g, ctr(sr), at);
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
        var s0 = sr.w / f.w, mid = around(g, ctr(sr), at);
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
        var s0 = sr.h / (db.h * 1.08), mid = around(g, ctr(sr), at);
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
      wear: function (o, wreath) {
        var g = geo(o), art = o.querySelector(".hag-art"), src = art.querySelector(".hag-em") || art.firstElementChild, u = g.u, sr, f;
        var hat = stage.querySelector(".hag-eyedeco .hag-hat"), txt = src.firstChild;
        var parts = txt && txt.nodeType === 3 ? segs(txt.nodeValue) : [];
        if (wreath) {
          // זר עגול: עלים ירוקים ופרחים צבעוניים
          var fl = "", cols = ["#f472b6", "#facc15", "#fff", "#a78bfa", "#fb7185", "#facc15", "#fff"];
          for (var i = 0; i < 7; i++) { var a = Math.PI * (1.05 + i * .15), x = 31 + Math.cos(a) * 26, y = 22 + Math.sin(a) * 12; fl += "<circle cx='" + x.toFixed(1) + "' cy='" + y.toFixed(1) + "' r='4.2' fill='" + cols[i] + "' stroke='#9d174d' stroke-width='.8'/><circle cx='" + x.toFixed(1) + "' cy='" + y.toFixed(1) + "' r='1.5' fill='#f59e0b'/>"; }
          sr = rel(src.getBoundingClientRect(), g.S); hide(src);
          f = { el: div("hp-fly", "<svg viewBox='0 0 62 30'><path d='M5 22 Q31 -6 57 22' stroke='#16a34a' stroke-width='5' fill='none' stroke-linecap='round'/><path d='M5 22 Q31 34 57 22' stroke='#15803d' stroke-width='3' fill='none' stroke-linecap='round' opacity='.6'/>" + fl + "</svg>"), w: 66 * u, h: 32 * u };
        } else if (parts.length > 1) {
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
        var s0 = sr.w / f.w, mid = around(g, ctr(sr), at);
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
      },

      // ---------- משחקים כלליים: הסמל בא לנקודה ליד העין (אף פעם לא מולה), עושה משהו וחוזר ----------
      // קפיצה במקום — לסמלים שאינם חפץ (גרפים, אוטובוסים, שעונים)
      bounce: function (o) {
        var t = o.querySelector(".hag-tile") || o.querySelector("[data-icon]") || o.firstElementChild;
        A(t, [{ transform: "translateY(0) scale(1,1)" }, { transform: "translateY(0) scale(1.12,.84)", offset: .08 }, { transform: "translateY(-30%) scale(.92,1.08)", offset: .22 },
          { transform: "translateY(0) scale(1.1,.88)", offset: .36 }, { transform: "translateY(-18%) scale(.95,1.05)", offset: .5 }, { transform: "translateY(0) scale(1.06,.94)", offset: .64 },
          { transform: "translateY(-8%) scale(1,1)", offset: .78 }, { transform: "translateY(0) scale(1,1)" }], { duration: 1300, fill: "none", easing: "ease-in-out" });
        var g = geo(o), d = dirTo(g, o);
        irisTo([[.15, d.x * 9, d.y * 6], [.3, d.x * 9, d.y * 6 - 3], [.42, d.x * 9, d.y * 6], [.54, d.x * 9, d.y * 6 - 2], [.66, d.x * 9, d.y * 6]], 1500);
        happy(g, 1000, 1500);
        end(1600);
      },

      // זכוכית מגדלת: העין בוחנת את הסמל — "?" ואז "!"
      inspect: function (o) {
        var v = visit(o, 40, spotSide(o, 72)), g = v.g, sd = v.sd;
        var lens = div("", "<svg viewBox='0 0 40 40'><circle cx='16' cy='16' r='12' fill='#e0f2fe' fill-opacity='.35' stroke='#334155' stroke-width='4'/><path d='M8 12 q3 -5 8 -6' stroke='#fff' stroke-width='2.5' fill='none' stroke-linecap='round'/><path d='M25 25 L37 37' stroke='#78350f' stroke-width='6' stroke-linecap='round'/></svg>");
        var lr = g.box(0, 0, 34, 34), p0 = P(g, sd * 140, 120), p1 = P(g, v.atU.x + sd * 4, v.atU.y - 4), p2 = P(g, v.atU.x - sd * 6, v.atU.y + 6);
        add(lens, lr); lens.style.opacity = 0;
        later(480, function () { A(lens, [{ transform: T(lr, p0, .6), opacity: 0 }, { transform: T(lr, p1, 1), opacity: 1, offset: .4 }, { transform: T(lr, p2, 1), opacity: 1, offset: .7 }, { transform: T(lr, p1, 1), opacity: 1 }], { duration: 900 }); });
        later(1380, function () { A(lens, [{ transform: T(lr, p1, 1), opacity: 1 }, { transform: T(lr, p0, .6), opacity: 0 }], { duration: 300 }); });
        later(700, function () { A(v.inner, [{ transform: "scale(1)" }, { transform: "scale(1.3)", offset: .3 }, { transform: "scale(1.3)", offset: .8 }, { transform: "scale(1)" }], { duration: 800 }); });
        say(g, "?", v.atU.x + sd * 6, v.atU.y - 30, 650, 380);
        say(g, "!", v.atU.x + sd * 6, v.atU.y - 30, 1150, 420);
        irisTo([[.2, sd * 10, 2], [.4, sd * 10, 4], [.55, sd * 10, 1], [.75, sd * 10, 3]], 2000);
        happy(g, 1250, 1650);
        v.back(1600);
      },

      // סיבוב במקום (רעשן, פנס, גלגל) — עם קווי תנועה; noise: סימני רעש (בלי קול)
      twirl: function (o, noise) {
        var v = visit(o, 42, spotSide(o, 70)), g = v.g, sd = v.sd;
        later(520, function () { A(v.inner, [{ transform: "rotate(0deg)" }, { transform: "rotate(" + (-sd * 900) + "deg)" }], { duration: 1100, easing: "cubic-bezier(.25,.6,.4,1)" }); });
        var arcs = div("", "<svg viewBox='0 0 60 60'><path d='M8 30 A22 22 0 0 1 30 8' stroke='#94a3b8' stroke-width='3' fill='none' stroke-linecap='round'/><path d='M52 30 A22 22 0 0 1 30 52' stroke='#94a3b8' stroke-width='3' fill='none' stroke-linecap='round'/></svg>"), ar = g.box(v.atU.x - 30, v.atU.y - 30, 60, 60);
        add(arcs, ar); arcs.style.opacity = 0;
        later(560, function () { A(arcs, [{ transform: T(ar, ctr(ar), .8, " rotate(0deg)"), opacity: 0 }, { transform: T(ar, ctr(ar), 1, " rotate(-200deg)"), opacity: .9, offset: .3 }, { transform: T(ar, ctr(ar), 1.1, " rotate(-540deg)"), opacity: 0 }], { duration: 1000 }); });
        if (noise) [[-26, -28, 600], [26, -24, 820], [30, 18, 1040], [-30, 16, 1240]].forEach(function (n) {
          var z = div("", "<svg viewBox='0 0 20 20'><path d='M3 4 L10 8 L5 12 L13 17' stroke='#dc2626' stroke-width='2.6' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>"), zr = g.box(v.atU.x + n[0] - 7, v.atU.y + n[1] - 7, 14, 14);
          add(z, zr); z.style.opacity = 0;
          later(n[2], function () { A(z, [{ transform: T(zr, ctr(zr), .3), opacity: 0 }, { transform: T(zr, { x: cx(zr) + n[0] * .3 * g.u, y: cy(zr) + n[1] * .3 * g.u }, 1.2), opacity: 1, offset: .4 }, { transform: T(zr, { x: cx(zr) + n[0] * .6 * g.u, y: cy(zr) + n[1] * .6 * g.u }, 1), opacity: 0 }], { duration: 420 }); });
        });
        var c = [[.2, sd * 10, 2]]; for (var i = 0; i < 6; i++) c.push([.28 + i * .07, sd * 9 + Math.cos(i * 1.6) * 2, 2 + Math.sin(i * 1.6) * 2.5]);
        irisTo(c.concat([[.8, sd * 9, 2]]), 2200);
        happy(g, 1500, 1900);
        v.back(1720);
      },

      // נפנוף (דגל, לולב): הסמל מתנופף מהבסיס שלו, עם קווי רשרוש; shake — ניענוע מהיר לכל הכיוונים
      wave: function (o, shake) {
        var v = visit(o, 44, spotSide(o, 62)), g = v.g, sd = v.sd;
        v.inner.style.transformOrigin = "50% 100%";
        var k = [], n = shake ? 10 : 6;
        for (var i = 0; i <= n; i++) k.push({ transform: shake ? "translate(" + [0, 4, -4, 0, 0, 3, -3, 0, 4, -4, 0][i] + "px," + [0, 0, 0, -4, 4, -2, 2, 0, 0, 0, 0][i] + "px) rotate(" + (i % 2 ? 9 : -9) * (i === n ? 0 : 1) + "deg)" : "rotate(" + (i === n ? 0 : (i % 2 ? 16 : -16)) + "deg)" });
        later(520, function () { A(v.inner, k, { duration: 1100, easing: "ease-in-out" }); });
        [[-1, 640], [1, 900], [-1, 1160]].forEach(function (w) {
          later(w[1], function () {
            var l = div("", "<svg viewBox='0 0 20 20'><path d='M4 4 q6 6 0 12 M10 2 q7 8 0 16' stroke='" + (shake ? "#65a30d" : "#60a5fa") + "' stroke-width='2.4' fill='none' stroke-linecap='round'/></svg>"), lr = g.box(v.atU.x + w[0] * 24 - 7, v.atU.y - 20, 14, 14);
            add(l, lr);
            A(l, [{ transform: T(lr, ctr(lr), .5, w[0] < 0 ? " scaleX(-1)" : ""), opacity: 0 }, { transform: T(lr, { x: cx(lr) + w[0] * 6 * g.u, y: cy(lr) }, 1, w[0] < 0 ? " scaleX(-1)" : ""), opacity: 1, offset: .4 }, { transform: T(lr, { x: cx(lr) + w[0] * 12 * g.u, y: cy(lr) }, 1, w[0] < 0 ? " scaleX(-1)" : ""), opacity: 0 }], { duration: 380 });
          });
        });
        irisTo([[.2, sd * 10, -1], [.35, sd * 8, -2], [.45, sd * 11, -2], [.55, sd * 8, -1], [.65, sd * 11, -1], [.8, sd * 9, 0]], 2100);
        happy(g, 1400, 1800);
        v.back(1640);
      },

      // תקיעה (שופר, מגפון, חצוצרה): גלי קול יוצאים החוצה מהעין — בלי קול
      blow: function (o) {
        var v = visit(o, 44, spotSide(o, 66, 134)), g = v.g, sd = v.sd;
        later(520, function () { A(v.inner, [{ transform: "scale(1)" }, { transform: "scale(1.12,.92)", offset: .2 }, { transform: "scale(.96,1.05)", offset: .4 }, { transform: "scale(1.1,.94)", offset: .6 }, { transform: "scale(1)" }], { duration: 1000 }); });
        [600, 820, 1040, 1260].forEach(function (t, i) {
          later(t, function () {
            var w = div("", "<svg viewBox='0 0 20 40'><path d='M4 4 Q16 20 4 36' stroke='" + (i % 2 ? "#f59e0b" : CFG.line) + "' stroke-width='3.5' fill='none' stroke-linecap='round'/></svg>"),
              wr = g.box(v.atU.x + sd * 18 - 5, v.atU.y - 10, 10, 20), fl = sd < 0 ? " scaleX(-1)" : "";
            add(w, wr);
            A(w, [{ transform: T(wr, ctr(wr), .5, fl), opacity: 0 }, { transform: T(wr, { x: cx(wr) + sd * 8 * g.u, y: cy(wr) }, 1, fl), opacity: 1, offset: .3 }, { transform: T(wr, { x: cx(wr) + sd * 16 * g.u, y: cy(wr) }, 1.7, fl), opacity: 0 }], { duration: 620, easing: "ease-out" });
          });
        });
        irisTo([[.2, sd * 10, 1], [.4, sd * 11, 0], [.6, sd * 11, 1], [.8, sd * 9, 1]], 2100);
        happy(g, 1300, 1700);
        v.back(1640);
      },

      // הרחה (אתרוג, פרחים): ניחוח עולה מהסמל שמתחת לעין, לבבות קטנים וחיוך
      sniff: function (o) {
        var v = visit(o, 36, { x: 60 + spotSide(o).sd * 30, y: 112 }), g = v.g;
        [[-10, 560], [4, 760], [14, 960]].forEach(function (s) {
          later(s[1], function () {
            var w = div("", "<svg viewBox='0 0 12 30'><path d='M6 28 q-6 -6 0 -12 q6 -6 0 -12' stroke='#84cc16' stroke-width='2.6' fill='none' stroke-linecap='round'/></svg>"), wr = g.box(v.atU.x + s[0] - 4, v.atU.y - 30, 8, 20);
            add(w, wr);
            A(w, [{ transform: T(wr, { x: cx(wr), y: cy(wr) + 6 * g.u }, .6), opacity: 0 }, { transform: T(wr, ctr(wr), 1), opacity: 1, offset: .4 }, { transform: T(wr, { x: cx(wr), y: cy(wr) - 6 * g.u }, 1), opacity: 0 }], { duration: 600 });
          });
        });
        heart(g, v.atU.x < 60 ? 6 : 114, 92, 1150); heart(g, v.atU.x < 60 ? 0 : 120, 78, 1300);
        later(560, function () { A(v.inner, [{ transform: "scale(1)" }, { transform: "scale(1.08)", offset: .5 }, { transform: "scale(1)" }], { duration: 700, iterations: 2 }); });
        irisTo([[.2, (v.atU.x < 60 ? -5 : 5), 6], [.7, (v.atU.x < 60 ? -5 : 5), 6.5]], 2000);
        happy(g, 900, 1700);
        v.back(1680);
      },

      // הצצה (סוכה, קופסה): הסמל נוטה לכיוון העין, האישון מציץ פנימה, ואז "!"
      peek: function (o) {
        var v = visit(o, 46, spotSide(o, 70)), g = v.g, sd = v.sd;
        v.inner.style.transformOrigin = "50% 100%";
        later(520, function () { A(v.inner, [{ transform: "rotate(0deg)" }, { transform: "rotate(" + (-sd * 14) + "deg)", offset: .25 }, { transform: "rotate(0deg)", offset: .45 }, { transform: "rotate(" + (-sd * 14) + "deg)", offset: .7 }, { transform: "rotate(0deg)" }], { duration: 1000 }); });
        irisTo([[.22, sd * 11, 3], [.36, sd * 11, 5], [.5, sd * 10, 2], [.64, sd * 11, 5], [.8, sd * 9, 2]], 2100);
        say(g, "!", v.atU.x, v.atU.y - 34, 1200, 420);
        happy(g, 1300, 1700);
        v.back(1640);
      },

      // שתילה: הסמל נכנס לעציץ קטן ליד העין, טיפות מים, והוא צומח בחזרה לגודלו
      plant: function (o) {
        var g0 = geo(o), sd = spotSide(o).sd, px = sd > 0 ? 126 : -6;
        var pot = div("", "<svg viewBox='0 0 30 24'><path d='M3 2 h24 l-4 20 h-16 Z' fill='#c2410c' stroke='#7c2d12' stroke-width='2'/><rect x='1' y='1' width='28' height='6' rx='2' fill='#ea580c' stroke='#7c2d12' stroke-width='2'/><ellipse cx='15' cy='4' rx='11' ry='2' fill='#713f12'/></svg>"), pr = g0.box(px - 13, 108, 26, 21);
        add(pot, pr); A(pot, [{ transform: T(pr, ctr(pr), .2), opacity: 0 }, { transform: T(pr, ctr(pr), 1), opacity: 1 }], { duration: 260, easing: "cubic-bezier(.3,1.5,.5,1)" });
        var v = visit(o, 38, { x: px, y: 92 }), g = v.g;
        v.inner.style.transformOrigin = "50% 100%";
        later(500, function () { A(v.inner, [{ transform: "scale(.3)" }, { transform: "scale(.3)", offset: .45 }, { transform: "scale(1.12)", offset: .85 }, { transform: "scale(1)" }], { duration: 1100, easing: "ease-out" }); });
        [560, 680, 800, 920].forEach(function (t, i) {
          later(t, function () {
            var d = div("", "<svg viewBox='0 0 10 14'><path d='M5 0 Q10 8 5 13 Q0 8 5 0Z' fill='#38bdf8'/></svg>"), dr = g.box(px - 12 + i * 7, 62, 6, 9);
            add(d, dr); A(d, [{ transform: T(dr, ctr(dr), 1), opacity: 0 }, { transform: T(dr, ctr(dr), 1), opacity: 1, offset: .15 }, { transform: T(dr, { x: cx(dr), y: cy(dr) + 40 * g.u }, .7), opacity: 0 }], { duration: 420, easing: "ease-in" });
          });
        });
        spark(g, px - 16, 74, 1300); spark(g, px + 16, 80, 1420);
        irisTo([[.2, sd * 10, 4], [.45, sd * 10, 6], [.7, sd * 10, 2], [.85, sd * 9, 3]], 2200);
        happy(g, 1350, 1800);
        later(1700, function () { A(pot, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 }); });
        v.back(1720);
      },

      // זיקוקים: שלוש התפוצצויות צבעוניות מעל העין
      boom: function (o) {
        var v = visit(o, 32, spotSide(o, 96, 140)), g = v.g, sd = v.sd;
        [[22, -8, 560, "#f43f5e"], [60, -24, 820, "#facc15"], [98, -8, 1080, "#38bdf8"]].forEach(function (b) {
          later(b[2], function () {
            var rays = ""; for (var i = 0; i < 10; i++) { var a = i * 36 * Math.PI / 180; rays += "<line x1='" + (20 + Math.cos(a) * 6).toFixed(1) + "' y1='" + (20 + Math.sin(a) * 6).toFixed(1) + "' x2='" + (20 + Math.cos(a) * 18).toFixed(1) + "' y2='" + (20 + Math.sin(a) * 18).toFixed(1) + "'/>"; }
            var f = div("", "<svg viewBox='0 0 40 40'><g stroke='" + b[3] + "' stroke-width='3' stroke-linecap='round'>" + rays + "</g><circle cx='20' cy='20' r='3.5' fill='#fff'/></svg>"), fr = g.box(b[0] - 20, b[1] - 20, 40, 40);
            add(f, fr);
            A(f, [{ transform: T(fr, ctr(fr), .1, " rotate(0deg)"), opacity: 0 }, { transform: T(fr, ctr(fr), 1, " rotate(12deg)"), opacity: 1, offset: .35 }, { transform: T(fr, { x: cx(fr), y: cy(fr) + 6 * g.u }, 1.25, " rotate(20deg)"), opacity: 0 }], { duration: 640, easing: "ease-out" });
          });
        });
        irisTo([[.2, -8, -6], [.35, -8, -7], [.48, 0, -7], [.6, 8, -7], [.75, 8, -6], [.85, sd * 6, -2]], 2100);
        happy(g, 1200, 1700);
        v.back(1600);
      },

      // עשן (מנגל, מדורה כבויה): נשיפות אפורות עולות לצדדים, העין ממצמצת קצרות
      smoke: function (o) {
        var v = visit(o, 42, { x: 60, y: 114 }), g = v.g;
        [[-1, 560], [1, 700], [-1, 860], [1, 1000], [-1, 1160]].forEach(function (p, i) {
          later(p[1], function () {
            var s = div("", "<svg viewBox='0 0 20 20'><circle cx='10' cy='10' r='9' fill='#94a3b8' opacity='.75'/></svg>"), sr = g.box(60 + p[0] * 14 - 7, 100, 14, 14);
            add(s, sr);
            A(s, [{ transform: T(sr, ctr(sr), .4), opacity: 0 }, { transform: T(sr, { x: cx(sr) + p[0] * 24 * g.u, y: cy(sr) - 4 * g.u }, 1, ""), opacity: .9, offset: .4 }, { transform: T(sr, { x: cx(sr) + p[0] * (58 + i * 3) * g.u, y: cy(sr) - 30 * g.u }, 1.8), opacity: 0 }], { duration: 900, easing: "ease-out" });
          });
        });
        blinkQ(g, 1100);
        irisTo([[.2, 0, 6], [.45, -5, 4], [.6, 5, 4], [.8, 0, 5]], 2000);
        happy(g, 1350, 1750);
        v.back(1640);
      },

      // מרשמלו על המדורה: המדורה ליד העין, מרשמלו על מקל משחים, והעין אוכלת אותו
      toast: function (o) {
        var sd = spotSide(o).sd, fx = sd > 0 ? 122 : -2;
        var v = visit(o, 40, { x: fx, y: 108 }), g = v.g;
        var m = div("", "<svg viewBox='0 0 40 20'><path d='M40 18 L16 9' stroke='#78350f' stroke-width='2.5' stroke-linecap='round'/><rect class='w' x='4' y='3' width='14' height='12' rx='4' fill='#fff' stroke='#cbd5e1' stroke-width='1.5'/><rect class='b' x='4' y='3' width='14' height='12' rx='4' fill='#d97706' stroke='#92400e' stroke-width='1.5' opacity='0'/></svg>"),
          mr = g.box(fx - 26 * sd - 20, 76, 40, 20), fl = sd < 0 ? "" : " scaleX(-1)";
        add(m, mr); m.style.opacity = 0;
        var over = { x: g.E.l + fx * g.u - 6 * sd * g.u, y: g.E.t + 90 * g.u };
        later(520, function () { A(m, [{ transform: T(mr, { x: over.x + 30 * sd * g.u, y: over.y }, 1, fl), opacity: 0 }, { transform: T(mr, over, 1, fl), opacity: 1 }], { duration: 300 }); });
        later(820, function () { A(m, [{ transform: T(mr, over, 1, fl) }, { transform: T(mr, { x: over.x, y: over.y - 2 * g.u }, 1, fl + " rotate(" + (8 * sd) + "deg)"), offset: .5 }, { transform: T(mr, over, 1, fl) }], { duration: 600 }); A(m.querySelector(".b"), [{ opacity: 0 }, { opacity: 1 }], { duration: 600 }); });
        var mouth = P(g, 60, 103);
        later(1420, function () { A(m, [{ transform: T(mr, over, 1, fl), opacity: 1 }, { transform: T(mr, { x: mouth.x + 8 * sd * g.u, y: mouth.y }, .9, fl), opacity: 1, offset: .8 }, { transform: T(mr, { x: mouth.x + 4 * sd * g.u, y: mouth.y }, .5, fl), opacity: 0 }], { duration: 420, easing: "ease-in" }); });
        munch(g, 1200);
        irisTo([[.12, sd * 9, 6], [.4, sd * 9, 7], [.55, sd * 4, 5], [.8, 0, 3]], 3000);
        v.back(1500, 0, 3100);
      },

      // קשת וחץ: החץ עף מעל העין אל מטרה בצד השני
      shoot: function (o) {
        var v = visit(o, 40, spotSide(o, 8, 128)), g = v.g, sd = v.sd;
        var tg = div("", "<svg viewBox='0 0 30 30'><circle cx='15' cy='15' r='13' fill='#fff' stroke='#dc2626' stroke-width='3'/><circle cx='15' cy='15' r='8' fill='#dc2626'/><circle cx='15' cy='15' r='3.5' fill='#fff'/></svg>"), tr = g.box(60 - sd * 70 - 13, -5, 26, 26);
        add(tg, tr); tg.style.opacity = 0;
        later(400, function () { A(tg, [{ transform: T(tr, ctr(tr), .2), opacity: 0 }, { transform: T(tr, ctr(tr), 1), opacity: 1 }], { duration: 260 }); });
        var ar = div("", "<svg viewBox='0 0 40 10'><path d='M2 5 H32' stroke='#78350f' stroke-width='2.5'/><path d='M30 1 L39 5 L30 9 Z' fill='#64748b'/><path d='M2 5 l-2 -4 M2 5 l-2 4 M6 5 l-2 -4 M6 5 l-2 4' stroke='#dc2626' stroke-width='2'/></svg>"), arr = g.box(0, 0, 32, 8), fl = sd > 0 ? " scaleX(-1)" : "";
        add(ar, arr); ar.style.opacity = 0;
        later(560, function () { A(v.inner, [{ transform: "scale(1)" }, { transform: "scale(.9,1.05)", offset: .7 }, { transform: "scale(1.06,.96)", offset: .85 }, { transform: "scale(1)" }], { duration: 500 }); });
        later(900, function () { A(ar, [{ transform: T(arr, P(g, v.atU.x - sd * 6, 8), 1, fl), opacity: 1 }, { transform: T(arr, P(g, 60 - sd * 70 + sd * 14, 8), 1, fl), opacity: 1 }], { duration: 380, easing: "ease-in" }); });
        later(1280, function () {
          A(tg, [{ transform: T(tr, ctr(tr), 1, " rotate(0deg)") }, { transform: T(tr, ctr(tr), 1.12, " rotate(" + (sd * 10) + "deg)"), offset: .3 }, { transform: T(tr, ctr(tr), 1, " rotate(" + (-sd * 6) + "deg)"), offset: .6 }, { transform: T(tr, ctr(tr), 1, " rotate(0deg)") }], { duration: 420 });
          A(ar, [{ transform: T(arr, P(g, 60 - sd * 70 + sd * 14, 8), 1, fl + " rotate(0deg)") }, { transform: T(arr, P(g, 60 - sd * 70 + sd * 14, 8), 1, fl + " rotate(-6deg)"), offset: .3 }, { transform: T(arr, P(g, 60 - sd * 70 + sd * 14, 8), 1, fl + " rotate(0deg)") }], { duration: 300 });
        });
        spark(g, 60 - sd * 70, -18, 1320);
        later(1800, function () { A(tg, [{ opacity: 1 }, { opacity: 0 }], { duration: 260 }); A(ar, [{ opacity: 1 }, { opacity: 0 }], { duration: 260 }); });
        irisTo([[.18, sd * 9, -5], [.36, sd * 9, -6], [.46, 0, -7], [.56, -sd * 10, -6], [.8, -sd * 9, -5]], 2200);
        happy(g, 1350, 1800);
        v.back(1760);
      },

      // מזיגה: הכד נוטה ומטפטף אל נר קטן שנדלק (lamp) או אל הפה (דבש)
      pour: function (o, intoMouth) {
        var sd = spotSide(o).sd, jx = intoMouth ? 60 + sd * 42 : 60 + sd * 70;
        var v = visit(o, 32, { x: jx, y: intoMouth ? 92 : 88 }), g = v.g;
        var tgt = intoMouth ? { x: 60, y: 103 } : { x: 60 + sd * 50, y: 114 }, lamp = null, flame = null;
        if (!intoMouth) {
          lamp = div("", "<svg viewBox='0 0 30 22'><path d='M2 12 Q15 24 28 12 Z' fill='#b45309' stroke='#78350f' stroke-width='2'/><path d='M24 12 L30 8' stroke='#78350f' stroke-width='3' stroke-linecap='round'/></svg>");
          var lr = g.box(tgt.x - 13, tgt.y - 4, 26, 19); add(lamp, lr);
          A(lamp, [{ transform: T(lr, ctr(lr), .2), opacity: 0 }, { transform: T(lr, ctr(lr), 1), opacity: 1 }], { duration: 300, delay: 300 });
          flame = div("", "<svg viewBox='0 0 12 18'><path d='M6 0 C10 6 12 10 6 17 C0 10 2 6 6 0Z' fill='#fb923c'/><path d='M6 7 C8 10 8 12 6 15 C4 12 4 10 6 7Z' fill='#fde68a'/></svg>");
          var fr = g.box(tgt.x + 13 - 5, tgt.y - 14, 10, 15); add(flame, fr); flame.style.transformOrigin = "50% 100%"; flame.style.opacity = 0;
          later(1350, function () { A(flame, [{ transform: T(fr, ctr(fr), .1), opacity: 0 }, { transform: T(fr, ctr(fr), 1.3), opacity: 1, offset: .5 }, { transform: T(fr, ctr(fr), 1), opacity: 1 }], { duration: 300 }); });
          later(1780, function () { A(flame, [{ opacity: 1 }, { opacity: 0 }], { duration: 250 }); A(lamp, [{ opacity: 1 }, { opacity: 0 }], { duration: 250 }); });
        }
        later(520, function () { A(v.inner, [{ transform: "rotate(0deg)" }, { transform: "rotate(" + (-sd * 55) + "deg)", offset: .25 }, { transform: "rotate(" + (-sd * 55) + "deg)", offset: .8 }, { transform: "rotate(0deg)" }], { duration: 1100 }); });
        var lip = { x: jx - sd * 14, y: (intoMouth ? 92 : 88) - 6 };
        [700, 830, 960, 1090].forEach(function (t) {
          later(t, function () {
            var d = div("", "<svg viewBox='0 0 10 14'><path d='M5 0 Q10 8 5 13 Q0 8 5 0Z' fill='" + (intoMouth ? "#f59e0b" : "#facc15") + "' stroke='#b45309' stroke-width='.8'/></svg>"), dr = g.box(lip.x - 3, lip.y - 4, 6, 8);
            add(d, dr); A(d, [{ transform: T(dr, ctr(dr), 1), opacity: 1 }, { transform: T(dr, { x: cx(dr) + (tgt.x - lip.x) * .5 * g.u, y: cy(dr) + (tgt.y - lip.y) * .35 * g.u }, 1), opacity: 1, offset: .5 }, { transform: T(dr, P(g, tgt.x, tgt.y - 2), .6), opacity: 0 }], { duration: 420, easing: "ease-in" });
          });
        });
        if (intoMouth) munch(g, 520); else { spark(g, tgt.x, tgt.y - 22, 1450); happy(g, 1400, 1800); }
        irisTo([[.15, sd * 7, 5], [.4, sd * 3, 7], [.7, sd * 3, 7], [.85, 0, 4]], intoMouth ? 2500 : 2100);
        v.back(intoMouth ? 1700 : 1650, 0, intoMouth ? 2500 : 0);
      },

      // מטבעות: נשפכים מהסמל לערימה מתחת לעין, קופצים, וחוזרים פנימה
      coins: function (o) {
        var v = visit(o, 36, spotSide(o, 84)), g = v.g, sd = v.sd, cs = [];
        [[44, 112], [60, 114], [76, 112], [52, 104], [68, 104]].forEach(function (p, i) {
          var c = div("", "<svg viewBox='0 0 20 20'><circle cx='10' cy='10' r='9' fill='#facc15' stroke='#b45309' stroke-width='2'/><circle cx='10' cy='10' r='5.5' fill='none' stroke='#b45309' stroke-width='1.2' opacity='.7'/><path d='M7 6 q3 -2 5 0' stroke='#fff' stroke-width='1.5' fill='none' opacity='.8'/></svg>"), cr = g.box(0, 0, 13, 13);
          add(c, cr); c.style.opacity = 0; cs.push([c, cr, p]);
          later(560 + i * 110, function () {
            var a = v.at, b = P(g, p[0], p[1]), top = { x: (a.x + b.x) / 2, y: Math.max(a.y, b.y) - 14 * g.u };
            A(c, [{ transform: T(cr, a, .6, " rotate(0deg)"), opacity: 0 }, { transform: T(cr, top, 1, " rotate(" + (sd * 200) + "deg)"), opacity: 1, offset: .45 }, { transform: T(cr, b, 1, " rotate(" + (sd * 360) + "deg)"), opacity: 1, offset: .8 },
              { transform: T(cr, { x: b.x, y: b.y - 3 * g.u }, 1, " rotate(" + (sd * 360) + "deg)"), opacity: 1, offset: .9 }, { transform: T(cr, b, 1, " rotate(" + (sd * 360) + "deg)"), opacity: 1 }], { duration: 460, easing: "ease-in-out" });
          });
        });
        later(1400, function () { cs.forEach(function (x, i) { A(x[0], [{ transform: T(x[1], P(g, x[2][0], x[2][1]), 1), opacity: 1 }, { transform: T(x[1], v.at, .5), opacity: 0 }], { duration: 300, delay: i * 40, easing: "ease-in" }); }); });
        spark(g, 60, 96, 1180);
        irisTo([[.2, sd * 9, 4], [.4, sd * 3, 7], [.6, -sd * 3, 7], [.8, sd * 5, 4]], 2100);
        happy(g, 1150, 1650);
        v.back(1700);
      },

      // מציאת האפיקומן: הסמל מתחבא בצד אחד, האישון מחפש, והסמל מופיע מהצד השני — "!"
      find: function (o) {
        var v = visit(o, 34, spotSide(o, 108, 128)), g = v.g, sd = v.sd, at2 = P(g, 60 - sd * 68, 108);
        later(560, function () { A(v.el, [{ transform: v.pose(v.at, 1, 0), opacity: 1 }, { transform: v.pose({ x: v.at.x + sd * 10 * g.u, y: v.at.y + 6 * g.u }, .1, sd * 30), opacity: 0 }], { duration: 260, easing: "ease-in" }); });
        later(1300, function () { A(v.el, [{ transform: v.pose({ x: at2.x - sd * 10 * g.u, y: at2.y + 6 * g.u }, .1, -sd * 30), opacity: 0 }, { transform: v.pose(at2, 1.15, 0), opacity: 1, offset: .7 }, { transform: v.pose(at2, 1, 0), opacity: 1 }], { duration: 320, easing: "cubic-bezier(.3,1.5,.5,1)" }); });
        say(g, "!", 60 - sd * 68, 80, 1420, 420);
        spark(g, 60 - sd * 80, 96, 1460); spark(g, 60 - sd * 54, 92, 1560);
        irisTo([[.15, sd * 9, 5], [.27, sd * 10, 3], [.36, -sd * 10, 0], [.45, 0, -6], [.54, sd * 10, 2], [.63, -sd * 10, 5], [.75, -sd * 10, 5]], 2400);
        happy(g, 1500, 1950);
        v.back(1900, 0, 0, at2);
      },

      // הרמה בגאווה (סל ביכורים, גביע): הסמל מורם מעל העין ומתנדנד, עם נצנוצים
      lift: function (o) {
        var v = visit(o, 50, { x: 60, y: -20 }), g = v.g;
        later(520, function () { A(v.inner, [{ transform: "translateY(0) rotate(0deg)" }, { transform: "translateY(-8%) rotate(-6deg)", offset: .25 }, { transform: "translateY(0) rotate(0deg)", offset: .5 }, { transform: "translateY(-8%) rotate(6deg)", offset: .75 }, { transform: "translateY(0) rotate(0deg)" }], { duration: 1000 }); });
        spark(g, 22, 4, 620); spark(g, 98, -4, 800); spark(g, 60, -48, 980);
        irisTo([[.2, 0, -6], [.6, 0, -7], [.8, 0, -4]], 2000);
        happy(g, 700, 1500);
        v.back(1560);
      },

      // לגימה (כוס יין): הכוס באה לצד הפה ונוטה, פה קטן, וסומק קל
      sip: function (o) {
        var sd = spotSide(o).sd, v = visit(o, 28, { x: 60 + sd * 24, y: 100 }), g = v.g;
        v.inner.style.transformOrigin = "50% 80%";
        later(520, function () { A(v.inner, [{ transform: "translate(0,0) rotate(0deg)" }, { transform: "translate(" + (-sd * 14) + "%,0) rotate(" + (-sd * 38) + "deg)", offset: .3 }, { transform: "translate(" + (-sd * 14) + "%,0) rotate(" + (-sd * 44) + "deg)", offset: .7 }, { transform: "translate(0,0) rotate(0deg)" }], { duration: 1000 }); });
        var sm = face(g, "smile"), bl = face(g, "blush");
        show(sm, 500, 160); show(sm, 1500, 160, 0);
        show(bl, 900, 400); show(bl, 1900, 300, 0);
        irisTo([[.2, sd * 4, 6], [.6, sd * 4, 6], [.85, 0, 2]], 2100);
        happy(g, 1300, 1800);
        v.back(1560, 0, 2250);
      },

      // טבילה: התפוח נטבל בצנצנת דבש, דבש נוטף, והעין אוכלת אותו
      dip: function (o) {
        var sd = spotSide(o).sd, jx = 60 + sd * 64;
        var g0 = geo(o), jar = div("", "<svg viewBox='0 0 30 30'><path d='M5 8 h20 v16 q0 4 -4 4 h-12 q-4 0 -4 -4 Z' fill='#f59e0b' stroke='#92400e' stroke-width='2'/><rect x='3' y='4' width='24' height='6' rx='2' fill='#fbbf24' stroke='#92400e' stroke-width='2'/><path d='M9 14 q6 3 12 0' stroke='#fde68a' stroke-width='2' fill='none'/></svg>"), jr = g0.box(jx - 14, 102, 28, 28);
        add(jar, jr); A(jar, [{ transform: T(jr, ctr(jr), .2), opacity: 0 }, { transform: T(jr, ctr(jr), 1), opacity: 1 }], { duration: 280, easing: "cubic-bezier(.3,1.5,.5,1)" });
        var v = visit(o, 26, { x: jx, y: 86 }), g = v.g, mouth = P(g, 60, 103), up = P(g, jx, 86), dn = P(g, jx, 100);
        later(560, function () { A(v.el, [{ transform: v.pose(up, 1, 0) }, { transform: v.pose(dn, 1, 0), offset: .3 }, { transform: v.pose(up, 1, -10), offset: .6 }, { transform: v.pose(dn, 1, 0), offset: .8 }, { transform: v.pose(up, 1, 0) }], { duration: 700 }); });
        later(1260, function () {
          var d = div("", "<svg viewBox='0 0 10 14'><path d='M5 0 Q10 8 5 13 Q0 8 5 0Z' fill='#f59e0b' stroke='#b45309' stroke-width='.8'/></svg>"), dr = g.box(jx - 3, 96, 6, 8);
          add(d, dr); A(d, [{ transform: T(dr, ctr(dr), .4), opacity: 0 }, { transform: T(dr, ctr(dr), 1), opacity: 1, offset: .4 }, { transform: T(dr, { x: cx(dr), y: cy(dr) + 10 * g.u }, .6), opacity: 0 }], { duration: 400 });
          A(v.el, [{ transform: v.pose(up, 1, 0), opacity: 1 }, { transform: v.pose({ x: mouth.x + sd * 8 * g.u, y: mouth.y - 4 * g.u }, .9, -sd * 20), opacity: 1, offset: .8 }, { transform: v.pose(mouth, .3, -sd * 30), opacity: 0 }], { duration: 480, easing: "ease-in" });
          A(jar, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: 300 });
        });
        munch(g, 1300);
        irisTo([[.12, sd * 9, 6], [.3, sd * 9, 7], [.45, sd * 4, 5], [.8, 0, 3]], 3200);
        pop(o, 2600);
        end(3250);
      },

      // גרעיני רימון: הרימון ליד העין, גרעינים קופצים ממנו אל הפה
      seeds: function (o) {
        var sd = spotSide(o).sd, v = visit(o, 36, { x: 60 + sd * 56, y: 104 }), g = v.g, mouth = P(g, 60, 104);
        [700, 860, 1020, 1180].forEach(function (t, i) {
          later(t, function () {
            var s = div("", "<svg viewBox='0 0 10 12'><ellipse cx='5' cy='6' rx='4' ry='5' fill='#dc2626' stroke='#7f1d1d' stroke-width='1'/><ellipse cx='4' cy='4' rx='1.4' ry='2' fill='#fecaca'/></svg>"), r = g.box(0, 0, 6, 7);
            add(s, r); var a = { x: v.at.x - sd * 8 * g.u, y: v.at.y - 10 * g.u }, top = { x: (a.x + mouth.x) / 2, y: g.E.t + (86 - i * 2) * g.u };
            A(s, [{ transform: T(r, a, .5), opacity: 0 }, { transform: T(r, top, 1.1), opacity: 1, offset: .45 }, { transform: T(r, mouth, .7), opacity: 1, offset: .9 }, { transform: T(r, mouth, .3), opacity: 0 }], { duration: 440, easing: "ease-in-out" });
          });
        });
        later(560, function () { A(v.inner, [{ transform: "scale(1)" }, { transform: "scale(1.1,.9)", offset: .5 }, { transform: "scale(1)" }], { duration: 160, iterations: 4, delay: 140 }); });
        munch(g, 560);
        irisTo([[.15, sd * 9, 6], [.35, sd * 4, 6], [.6, 0, 5], [.85, 0, 3]], 2600);
        v.back(1900, 0, 2550);
      },

      // זר פרחים: זר עגול נחבש לראש העין (כמו הכתר)
      wreath: function (o) { RUN.wear(o, true); },
      noise: function (o) { RUN.twirl(o, true); },
      shake: function (o) { RUN.wave(o, true); },
      honey: function (o) { RUN.pour(o, true); }
    };
  }

  W.HagPlay = { attach: attach };
})();
