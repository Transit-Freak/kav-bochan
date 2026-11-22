/* העדכון ה-500 של הקו הבוחן (שלמה 22.11.2026: "סיבה למסיבה") — לשבוע אחד, 22.11–29.11.2026, בדף הבית בלבד:
   - שלט קו מואר כמו בחזית אוטובוס: "עדכון 500", והיעד מתחלף בין כמה הודעות (המספרים — מ-versions.json);
   - קונפטי פעם אחת ביום לכל מבקר (ובלחיצה על מספר הקו), בלי תנועה למי שביקש "בלי תנועה";
   - העין שבמרכז הכלים חוגגת: כובע מסיבה, עין שמחה (^‿^) עם סומק, קפיצה קטנה, והכלים סביבה עולים בגל.
   נכנס לתוך דף הבית (.kbh), ולכן לא מופיע בתוך הכלים. ✕ סוגר את השלט ואת הכובע, ונשאר סגור באותו דפדפן.
   תצוגה מקדימה בכל יום: ‎?c500‎ בכתובת. אחרי 29.11 הקובץ לא עושה כלום, ואפשר להוריד אותו מ-index.html. */
(function () {
  "use strict";
  var FROM = "2026-11-22", TO = "2026-11-29", KEY = "kb-c500", BOOM = "kb-c500-boom";
  var today;
  try { today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date()); }
  catch (e) { today = new Date().toISOString().slice(0, 10); }
  var preview = /[?&]c500/.test(location.search);
  if (!preview && (today < FROM || today > TO)) return;
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  if (!preview && ls(KEY)) return;
  // "בלי תנועה" נבדק בכל פעם מחדש — כפתור הנגישות ("עצירת אנימציות", html.a11y-nomotion) יכול להידלק גם אחרי שהדף נטען
  function still() {
    try { return matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("a11y-nomotion"); }
    catch (e) { return false; }
  }

  /* השלט הוא חפץ פיזי (לוח נוריות כתומות על רקע כהה), ולכן אותו מראה ביום ובלילה */
  var css = document.createElement("style");
  css.textContent = [
    ".kb500{--led:#ffb31a;--panel:#16181d;--rim:#2b2f37;",
    "position:relative;z-index:3;display:flex;flex-wrap:wrap;align-items:stretch;margin:16px auto 0;width:calc(100% - 32px);max-width:860px;",
    "box-sizing:border-box;border-radius:16px;background:var(--panel);border:3px solid var(--rim);",
    "box-shadow:0 14px 34px -16px rgba(2,6,23,.55),inset 0 0 0 1px rgba(255,255,255,.04);overflow:hidden;direction:rtl;font-family:'Rubik','Heebo',sans-serif}",
    /* רשת הנקודות של לוח הנוריות */
    ".kb500::after{content:'';position:absolute;inset:0;pointer-events:none;",
    "background:radial-gradient(circle,transparent 55%,rgba(10,11,14,.55) 60%) 0 0/4px 4px}",
    ".kb500 .rt{position:relative;flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:8px 18px;",
    "border:0;border-inline-end:3px solid var(--rim);background:none;cursor:pointer;color:var(--led);font:inherit}",
    ".kb500 .rt b{font-size:38px;font-weight:900;line-height:1;letter-spacing:1px;text-shadow:0 0 6px rgba(255,179,26,.75),0 0 18px rgba(255,140,0,.35)}",
    ".kb500 .rt small{font-size:11px;font-weight:700;letter-spacing:.6px;opacity:.75}",
    ".kb500 .rt:focus-visible,.kb500 .x:focus-visible{outline:2px solid #7dd3fc;outline-offset:-4px}",
    ".kb500 .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}",
    ".kb500 .dst{position:relative;flex:1;min-width:0;height:64px;overflow:hidden}",
    ".kb500 .ln{position:absolute;inset:0;display:flex;align-items:center;padding:0 16px;color:var(--led);font-size:23px;font-weight:800;",
    "line-height:1.25;text-shadow:0 0 5px rgba(255,179,26,.7),0 0 16px rgba(255,140,0,.3);",
    "transform:translateY(100%);opacity:0;transition:transform .45s cubic-bezier(.2,.8,.2,1),opacity .45s}",
    ".kb500 .ln.on{transform:none;opacity:1}",
    ".kb500 .ln.out{transform:translateY(-100%);opacity:0}",
    ".kb500 .x{position:relative;z-index:1;flex:none;align-self:center;margin-inline:8px 10px;width:32px;height:32px;border-radius:50%;border:0;",
    "background:rgba(255,179,26,.12);color:var(--led);font-size:15px;font-weight:900;cursor:pointer;font-family:inherit}",
    ".kb500 .x:hover{background:rgba(255,179,26,.24)}",
    /* הערת התודה — שורה תחתונה בתוך השלט, בכתב רגיל וחד (מעל רשת הנקודות) כדי שיהיה קל לקרוא */
    ".kb500 .thx{position:relative;z-index:1;flex:0 0 100%;margin:0;padding:9px 16px 11px;border-top:2px solid var(--rim);",
    "text-align:center;font:600 14.5px/1.6 'Rubik','Heebo',sans-serif;color:#f3e3c3;text-wrap:balance}",
    ".kb500-hat{position:absolute;z-index:4;left:53%;top:23.6%;width:11%;aspect-ratio:1/1.15;pointer-events:none;",
    "transform:translateX(-50%) rotate(18deg);transform-origin:50% 100%;filter:drop-shadow(0 4px 6px rgba(2,6,23,.25))}",
    ".kb500-hat svg{display:block;width:100%;height:100%}",
    /* עין שמחה: העפעף התחתון עולה (כמו ^‿^) וסומק בלחיים — שכבה מעל העין, באותו מקום ובאותה קפיצה */
    ".kb500-joy{position:absolute;inset:33%;z-index:3;pointer-events:none}",
    ".kb500-joy svg{display:block;width:100%;height:100%}",
    ".kb-shabbat .kb500-joy{display:none}",
    /* העין חוגגת (שלמה: "זה סוג של יום הולדת שלה"): קפיצה קטנה כל כמה שניות, הכובע קופץ איתה, והכלים סביבה
       עולים בגל. translate/scale נפרדים מ-transform, כדי לא להתנגש בתנועות של דף הבית (העין שמסתכלת, ריחוף על כלי) */
    ".kb500-party:not(.kb-shabbat) .eye{animation:kb5hop 5.2s ease-in-out infinite}",
    ".kb500-party:not(.kb-shabbat) .kb500-hat{animation:kb5hat 5.2s ease-in-out infinite}",
    ".kb500-party:not(.kb-shabbat) .kb500-joy{animation:kb5hop 5.2s ease-in-out infinite}",
    ".kb500-party .orb>span{animation:kb5wave 5.2s ease-in-out infinite;animation-delay:var(--kb5d,0s)}",
    "@keyframes kb5hop{0%,62%,100%{translate:0 0;scale:1}68%{translate:0 -9%;scale:.97 1.04}74%{translate:0 0;scale:1.05 .95}80%{scale:1}}",
    "@keyframes kb5hat{0%,62%,100%{translate:0 0;rotate:0deg}68%{translate:0 -26%;rotate:-10deg}74%{translate:0 0;rotate:6deg}82%{rotate:0deg}}",
    "@keyframes kb5wave{0%,8%,100%{translate:0 0}3%{translate:0 -16%}}",
    "@media (prefers-reduced-motion:reduce){.kb500-party .eye,.kb500-party .kb500-hat,.kb500-party .kb500-joy,.kb500-party .orb>span{animation:none}}",
    "html.a11y-nomotion .kb500-party .eye,html.a11y-nomotion .kb500-party .kb500-hat,html.a11y-nomotion .kb500-party .kb500-joy,html.a11y-nomotion .kb500-party .orb>span{animation:none}",
    "#kb500-cv{position:fixed;inset:0;z-index:2147483000;pointer-events:none;width:100%;height:100%}",
    "@media (max-width:520px){.kb500 .thx{font-size:13.5px;padding:8px 12px 10px}.kb500 .rt{padding:6px 12px}.kb500 .rt b{font-size:30px}.kb500 .dst{height:58px}",
    ".kb500 .ln{font-size:15.5px;padding:0 12px}}",
    "@media (prefers-reduced-motion:reduce){.kb500 .ln{transition:none}}"
  ].join("");
  document.head.appendChild(css);

  /* ---- קונפטי (כמו ביום ההולדת, בצבעי האתר והשלט) ---- */
  var cv = null, cx = null, parts = [], raf = 0;
  var COLORS = ["#ffb31a", "#0ea5e9", "#38bdf8", "#22c55e", "#f43f5e", "#a855f7", "#ffffff", "#0369a1"];
  function burst(n, x, y) {
    if (still()) return;
    if (!cv) {
      cv = document.createElement("canvas"); cv.id = "kb500-cv"; cv.setAttribute("aria-hidden", "true");
      document.body.appendChild(cv); cx = cv.getContext("2d");
      var fit = function () { cv.width = innerWidth; cv.height = innerHeight; }; fit(); addEventListener("resize", fit);
    }
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + (Math.random() - .5) * 2.2, sp = 7 + Math.random() * 9;
      parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, w: 6 + Math.random() * 6, h: 3 + Math.random() * 5,
        c: COLORS[(Math.random() * COLORS.length) | 0], r: Math.random() * 6, vr: (Math.random() - .5) * .3, life: 140 + Math.random() * 70 });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function tick() {
    cx.clearRect(0, 0, cv.width, cv.height);
    if (still()) { parts = []; raf = 0; return; }
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.vy += .2; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life--;
      if (p.life <= 0 || p.y > cv.height + 20) { parts.splice(i, 1); continue; }
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.globalAlpha = Math.min(1, p.life / 40);
      cx.fillStyle = p.c; cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); cx.restore();
    }
    raf = parts.length ? requestAnimationFrame(tick) : 0;
  }
  function boomFrom(el) {
    var r = el.getBoundingClientRect();
    burst(110, r.left + r.width / 2, r.top + r.height / 2);
    setTimeout(function () { burst(60, innerWidth * .15, innerHeight * .55); }, 220);
    setTimeout(function () { burst(60, innerWidth * .85, innerHeight * .55); }, 420);
  }

  /* כובע מסיבה (פסים בצבעי האתר ופומפון כתום) — נוסף ל-.stage ולא ל-.eye, כי העין מתחלפת בשבת */
  var HAT = '<svg viewBox="0 0 40 46" aria-hidden="true"><defs><clipPath id="kb5c"><path d="M20 4 L36 42 Q20 47 4 42 Z"/></clipPath></defs>' +
    '<path d="M20 4 L36 42 Q20 47 4 42 Z" fill="#0ea5e9"/>' +
    '<g clip-path="url(#kb5c)" fill="#ffb31a"><path d="M-4 30 L44 18 L44 24 L-4 36 Z"/><path d="M-4 14 L44 2 L44 8 L-4 20 Z"/></g>' +
    '<g clip-path="url(#kb5c)" fill="#fff" opacity=".9"><circle cx="13" cy="33" r="1.6"/><circle cx="25" cy="27" r="1.4"/><circle cx="19" cy="14" r="1.2"/><circle cx="28" cy="38" r="1.3"/></g>' +
    '<path d="M4 42 Q20 47 36 42" fill="none" stroke="#0369a1" stroke-width="2.4" stroke-linecap="round"/>' +
    '<circle cx="20" cy="4.5" r="4.2" fill="#ffb31a"/><circle cx="18.6" cy="3.2" r="1.3" fill="#fff" opacity=".7"/></svg>';

  /* העפעף התחתון של העין השמחה — באותה מערכת צירים של העין (120×120), בצבע הרקע של ריבוע העין */
  var JOY = '<svg viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="kb5j" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="120">' +
    '<stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e0f2fe"/></linearGradient><clipPath id="kb5jr"><rect x="1.6" y="1.6" width="116.8" height="116.8" rx="24.4"/></clipPath>' +
    '</defs>' +
    '<path clip-path="url(#kb5jr)" d="M0 66 L14 63 Q60 55 106 63 L120 66 L120 120 L0 120 Z" fill="url(#kb5j)"/>' +
    '<path d="M14 63 Q60 55 106 63" fill="none" stroke="#0ea5e9" stroke-width="6" stroke-linecap="round"/>' +
    '<ellipse cx="28" cy="78" rx="9" ry="4.5" fill="#fb7185" opacity=".4"/><ellipse cx="92" cy="78" rx="9" ry="4.5" fill="#fb7185" opacity=".4"/></svg>';

  var LINES = ["העדכון ה-500 של הקו הבוחן"];   // התודה כתובה בשורה התחתונה של השלט (THANKS); השורה של המספרים נוספת כש-versions.json נטען
  var THANKS = "הגענו לעדכון מספר 500 של הקו הבוחן. תודה לכל מי ששלח הערה, דיווח או רעיון — ככה האתר משתפר.";

  function add() {
    var root = document.querySelector(".kbh");
    if (!root) return false;
    if (root.querySelector(".kb500")) return true;
    var el = document.createElement("div");
    el.className = "kb500";
    el.setAttribute("role", "note");
    el.setAttribute("aria-label", "העדכון ה-500 של הקו הבוחן. תודה לכל מי ששלח הערה, דיווח או רעיון.");
    el.innerHTML = '<button type="button" class="rt" title="עוד קונפטי">' +
      '<small aria-hidden="true">עדכון</small><b aria-hidden="true">500</b><span class="sr">עוד קונפטי</span></button>' +
      '<div class="dst" aria-hidden="true"></div>' +
      '<button type="button" class="x" aria-label="סגירת החגיגה">✕</button>';
    var dst = el.querySelector(".dst"), hat = null, joy = null, i = 0, timer = 0, hover = false;
    function draw() {
      dst.innerHTML = LINES.map(function (t, k) { return '<div class="ln' + (k === i ? " on" : "") + '">' + t + "</div>"; }).join("");
    }
    function next() {
      if (hover || document.hidden || still()) return;
      var cur = dst.children[i]; i = (i + 1) % LINES.length; var nx = dst.children[i];
      if (!cur || !nx) return draw();
      cur.className = "ln out"; nx.className = "ln on";
      setTimeout(function () { if (cur.className === "ln out") cur.className = "ln"; }, 480);
    }
    draw();
    timer = setInterval(next, 3600);
    el.addEventListener("mouseenter", function () { hover = true; });
    el.addEventListener("mouseleave", function () { hover = false; });
    el.querySelector(".rt").addEventListener("click", function () { boomFrom(this); });
    el.querySelector(".x").addEventListener("click", function () {
      clearInterval(timer); el.remove(); if (hat) hat.remove(); if (joy) joy.remove(); if (stage) stage.classList.remove("kb500-party"); ls(KEY, "1");
    });
    var top = root.querySelector("header.top");   // מתחת לפס העליון, מעל הכותרת הגדולה
    if (top) top.parentNode.insertBefore(el, top.nextSibling); else root.insertBefore(el, root.firstChild);
    var thx = document.createElement("p"); thx.className = "thx"; thx.textContent = THANKS; el.appendChild(thx);

    var stage = root.querySelector(".stage");
    if (stage && !stage.querySelector(".kb500-hat")) {
      hat = document.createElement("div"); hat.className = "kb500-hat"; hat.innerHTML = HAT; stage.appendChild(hat);
      joy = document.createElement("div"); joy.className = "kb500-joy"; joy.innerHTML = JOY; stage.appendChild(joy);
      // הגל של הכלים: כל כלי עולה מעט אחרי הקודם, בסדר שלהם סביב העין
      [].forEach.call(stage.querySelectorAll(".orb>span"), function (o, k) { o.style.setProperty("--kb5d", (k * 0.09).toFixed(2) + "s"); });
      stage.classList.add("kb500-party");
    }

    // המספרים מתוך "מה חדש" — כמה גרסאות וכמה שינויים נרשמו בכל הכלים
    fetch("versions.json?v=" + Math.floor(Date.now() / 36e5)).then(function (r) { return r.ok ? r.json() : null; }).then(function (V) {
      if (!V) return;
      var nv = 0, ni = 0;
      Object.keys(V).forEach(function (k) { var t = V[k]; if (t && t.versions) { nv += t.versions.length; t.versions.forEach(function (x) { ni += (x.items || []).length; }); } });
      if (nv) { LINES.push(nv.toLocaleString("he-IL") + " גרסאות · " + ni.toLocaleString("he-IL") + " שינויים ב״מה חדש״"); draw(); }
    }).catch(function () {});

    // קונפטי פעם אחת ביום, אחרי שהדף התיישב
    if (preview || ls(BOOM) !== today) {
      ls(BOOM, today);
      setTimeout(function () { if (el.isConnected) boomFrom(el.querySelector(".rt")); }, 700);
    }
    return true;
  }
  if (!add()) document.addEventListener("DOMContentLoaded", add);
})();
