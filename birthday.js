/* יום ההולדת של שלומי (בקשת שלמה 07.09) — קופץ לבד ב-12.07 בכל שנה, בכל כלי
   האתר: השלט הפרטי שלו ("שלומי בן N", מק״ט 12706 = 12.07.06, הקווים שעל
   השלט האמיתי), קונפטי, וקישוטים קטנים לאותו יום — פייביקון עוגה, בלונים
   בכותרת הדף ובצידי המסך, וכובע מסיבה על כפתור הנגישות.
   מוצג פעם אחת לכל מבקר באותו יום (localStorage); אחרי הסגירה נשאר כפתור
   🎂 קטן שפותח שוב. תצוגה מקדימה בכל יום: ‎?bday=1‎ בכתובת (או ‎#יומולדת‎).
   מכבד "בלי תנועה" (העדפת המערכת או כפתור הנגישות): בלי קונפטי ובלי בלונים. */
(function () {
  "use strict";
  var BDAY = { d: 12, m: 7, y: 2006 };   // מהשלט: מק״ט 12706
  var NAME = "שלומי";
  var SIGN_ROWS = [["469", "באר שבע"], ["557", "בני ברק"], ["1", "שלומי"], ["151", "ראשון לציון"], ["245", "רמלה"], ["436", "חמד"]];

  function todayIL() {
    try {
      var s = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      var p = s.split("-");
      return { y: +p[0], m: +p[1], d: +p[2] };
    } catch (e) { var n = new Date(); return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() }; }
  }
  var preview = /[?&]bday/.test(location.search) || /יומולדת|bday/.test(decodeURIComponent(location.hash || ""));
  var t = todayIL();
  var isBday = t.d === BDAY.d && t.m === BDAY.m;
  if (!isBday && !preview) return;
  var key = "kb-bday-" + t.y;
  var seen = false;
  try { seen = !!localStorage.getItem(key); } catch (e) { /* מצב פרטי */ }
  // הגיל שעל השלט: ביום עצמו — השנה פחות שנת הלידה; בתצוגה מקדימה — הגיל ביום ההולדת הבא
  var age = t.y - BDAY.y;
  if (preview && !isBday && (t.m > BDAY.m || (t.m === BDAY.m && t.d > BDAY.d))) age += 1;

  var base = "";
  try { base = (document.currentScript && document.currentScript.src) ? document.currentScript.src.replace(/birthday\.js.*$/, "") : ""; } catch (e) { /* ignore */ }
  var noMotion = false;
  try { noMotion = (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) || document.documentElement.classList.contains("a11y-nomotion"); } catch (e) { /* ignore */ }

  var css = [
    "#kbb-bg{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.62);display:flex;align-items:center;justify-content:center;padding:16px;direction:rtl;font-family:'Heebo',system-ui,sans-serif}",
    "#kbb-card{background:#fff;border-radius:22px;padding:18px 18px 16px;max-width:380px;width:100%;box-shadow:0 24px 60px rgba(0,0,0,.45);text-align:center;position:relative;animation:kbb-pop .45s cubic-bezier(.2,1.4,.4,1) both}",
    "@keyframes kbb-pop{from{transform:scale(.6) rotate(-4deg);opacity:0}to{transform:none;opacity:1}}",
    ".kbb-sign{background:#f7b500;border:3px solid #1f2937;border-radius:8px;overflow:hidden;box-shadow:inset 0 0 0 2px #fff;text-align:right}",
    ".kbb-head{background:#fff;display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:3px solid #1f2937;flex-direction:row-reverse}",
    ".kbb-head img{width:54px;height:54px;object-fit:cover;object-position:top;border-radius:6px;border:2px solid #1f2937;background:#e2e8f0}",
    ".kbb-name{font-weight:900;font-size:24px;color:#0f172a;line-height:1.1}",
    ".kbb-code{font-weight:800;font-size:12px;color:#475569;margin-top:3px}",
    ".kbb-code small{font-size:10px;color:#64748b;margin-inline-end:4px}",
    ".kbb-row{display:flex;align-items:center;justify-content:space-between;flex-direction:row-reverse;padding:5px 10px;border-bottom:2px solid rgba(31,41,55,.35);font-weight:900;color:#0f172a;font-size:17px}",
    ".kbb-row:last-child{border-bottom:0}",
    ".kbb-num{background:#fff;border:2px solid #1f2937;border-radius:4px;min-width:52px;padding:1px 6px;text-align:center;font-size:17px;direction:ltr}",
    "#kbb-msg{margin:14px 0 12px;font-weight:800;color:#0f172a;font-size:15px;line-height:1.55}",
    "#kbb-msg b{color:#b45309}",
    "#kbb-btns{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}",
    "#kbb-btns button{border:0;border-radius:14px;padding:11px 18px;font-weight:900;font-size:14px;cursor:pointer;font-family:inherit}",
    "#kbb-yay{background:#f59e0b;color:#1f2937;box-shadow:0 4px 14px rgba(245,158,11,.5)}",
    "#kbb-close{background:#e2e8f0;color:#0f172a}",
    "#kbb-x{position:absolute;top:8px;left:10px;border:0;background:transparent;font-size:22px;line-height:1;cursor:pointer;color:#64748b;font-family:inherit}",
    "#kbb-canvas{position:fixed;inset:0;z-index:2147483001;pointer-events:none;width:100%;height:100%}",
    "#kbb-fab{position:fixed;bottom:18px;inset-inline-end:14px;z-index:99998;width:48px;height:48px;border-radius:50%;border:2px solid #fff;background:#f59e0b;font-size:24px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;padding:0}",
    // קישוטים קטנים: כובע מסיבה על כפתור הנגישות, בלונים בצידי המסך
    ".kbb-logo{display:inline-flex;align-items:center;justify-content:center;font-size:42px;line-height:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,.25));animation:kbb-wiggle 2.4s ease-in-out infinite}",
    "@media (min-width:768px){.kbb-logo{font-size:54px}}",
    "@keyframes kbb-wiggle{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}",
    "html.a11y-nomotion .kbb-logo,html.a11y-nomotion .kbb-balloon{animation:none}",
    "html.kbb-day #kb-a11y-btn::after{content:'🥳';position:absolute;top:-16px;inset-inline-end:-8px;font-size:20px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))}",
    ".kbb-balloon{position:fixed;bottom:-80px;z-index:99997;font-size:34px;pointer-events:none;animation:kbb-rise linear infinite;opacity:.9;filter:drop-shadow(0 2px 3px rgba(0,0,0,.25))}",
    "@keyframes kbb-rise{0%{transform:translateY(0) rotate(-6deg)}50%{transform:translateY(-55vh) rotate(6deg)}100%{transform:translateY(-115vh) rotate(-6deg)}}",
    "@media (max-width:420px){.kbb-name{font-size:21px}.kbb-row{font-size:15px}}"
  ].join("\n");

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (html != null) e.innerHTML = html;
    return e;
  }

  // ---- קונפטי ----
  var canvas = null, ctx = null, parts = [], raf = 0;
  var COLORS = ["#f59e0b", "#fbbf24", "#0055aa", "#38bdf8", "#ef4444", "#22c55e", "#ffffff", "#a855f7"];
  function burst(n, x, y) {
    if (noMotion) return;
    if (!canvas) {
      canvas = el("canvas", { id: "kbb-canvas", "aria-hidden": "true" });
      document.body.appendChild(canvas);
      ctx = canvas.getContext("2d");
      var fit = function () { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
      fit(); window.addEventListener("resize", fit);
    }
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = 6 + Math.random() * 9;
      parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 6, w: 6 + Math.random() * 6, h: 4 + Math.random() * 6,
        c: COLORS[(Math.random() * COLORS.length) | 0], r: Math.random() * Math.PI, vr: (Math.random() - .5) * .3, life: 130 + Math.random() * 70 });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.vy += .22; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life--;
      if (p.life <= 0 || p.y > canvas.height + 20) { parts.splice(i, 1); continue; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.globalAlpha = Math.min(1, p.life / 40);
      ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    raf = parts.length ? requestAnimationFrame(tick) : 0;
    if (!raf) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  function rain() {
    if (noMotion) return;
    var W = window.innerWidth;
    burst(160, W * .5, window.innerHeight * .35);
    setTimeout(function () { burst(90, W * .2, window.innerHeight * .3); }, 250);
    setTimeout(function () { burst(90, W * .8, window.innerHeight * .3); }, 500);
  }

  // ---- השלט ----
  var openEl = null, lastFocus = null;
  function openSign() {
    if (openEl) return;
    lastFocus = document.activeElement;
    var bg = el("div", { id: "kbb-bg", role: "dialog", "aria-modal": "true", "aria-labelledby": "kbb-title" });
    var rows = SIGN_ROWS.map(function (r) {
      return '<div class="kbb-row"><span class="kbb-num">' + r[0] + '</span><span class="kbb-dst">' + r[1] + "</span></div>";
    }).join("");
    var img = base ? '<img src="' + base + 'media/shlomi.jpg" alt="">' : "";
    bg.innerHTML =
      '<div id="kbb-card">' +
        '<button id="kbb-x" type="button" aria-label="סגירה">×</button>' +
        '<div class="kbb-sign" aria-hidden="true">' +
          '<div class="kbb-head">' + img + '<div><div class="kbb-name">' + NAME + " בן " + age + '</div><div class="kbb-code"><small>מק״ט</small> <bdi>12706</bdi></div></div></div>' +
          rows +
        "</div>" +
        '<div id="kbb-msg"><span id="kbb-title">🎂 היום יום ההולדת של <b>שלומי הרטמן</b>, האיש שמאחורי הקו הבוחן</span><br>' +
          NAME + " חוגג היום " + age + ". מזל טוב! 🎈</div>" +
        '<div id="kbb-btns"><button id="kbb-yay" type="button">🎉 מזל טוב!</button><button id="kbb-close" type="button">תודה, סגירה</button></div>' +
      "</div>";
    document.body.appendChild(bg);
    openEl = bg;
    var close = function () {
      if (!openEl) return;
      openEl.remove(); openEl = null;
      document.removeEventListener("keydown", onKey);
      try { if (isBday) localStorage.setItem(key, "1"); } catch (e) { /* ignore */ }
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    };
    var onKey = function (ev) { if (ev.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    bg.querySelector("#kbb-x").addEventListener("click", close);
    bg.querySelector("#kbb-close").addEventListener("click", close);
    bg.querySelector("#kbb-yay").addEventListener("click", function (ev) {
      var r = ev.currentTarget.getBoundingClientRect();
      burst(140, r.left + r.width / 2, r.top);
    });
    bg.addEventListener("click", function (ev) { if (ev.target === bg) close(); });
    bg.querySelector("#kbb-close").focus();
    setTimeout(rain, 150);
  }

  // הכותרת "הקו הבוחן" הופכת ל"מזל טוב לי" (שלמה 07.09) — בכותרות הדף (h1–h3)
  // ובשם הלשונית. הכותרת בדף הבית מצוירת מחדש ע"י React אחרי הטעינה, ולכן
  // צופה שינויים מחיל את ההחלפה שוב; ההחלפה לא מחזירה את המקור, אז אין לולאה.
  // סמל האתר (העין, SVG לפני הכותרת בדף הבית) נעלם באותו יום ובמקומו עוגה
  // (שלמה 07.09). מסומן כדי לא להחליף פעמיים כשהצופה רץ שוב.
  var SITE = "הקו הבוחן", GREET = "מזל טוב לי";
  function swapLogo(h) {
    var s = h.previousElementSibling;
    if (!s || s.tagName.toLowerCase() !== "svg" || s.getAttribute("data-kbb") === "1") return;
    s.setAttribute("data-kbb", "1");
    s.style.display = "none";
    var cake = el("span", { "class": "kbb-logo " + (s.getAttribute("class") || ""), "aria-hidden": "true", title: "יום הולדת!" }, "🎂");
    s.parentNode.insertBefore(cake, h);
  }
  function rename() {
    try {
      if (document.title.indexOf(SITE) >= 0) document.title = document.title.split(SITE).join(GREET);
      var hs = document.querySelectorAll("h1, h2, h3");
      Array.prototype.forEach.call(hs, function (h) {
        var w = document.createTreeWalker(h, NodeFilter.SHOW_TEXT), n, hit = false;
        while ((n = w.nextNode())) {
          if (n.nodeValue.indexOf(SITE) >= 0) { n.nodeValue = n.nodeValue.split(SITE).join(GREET); hit = true; }
          else if (n.nodeValue.indexOf(GREET) >= 0) hit = true;
        }
        if (hit && h.tagName.toLowerCase() === "h1") swapLogo(h);
      });
    } catch (e) { /* ignore */ }
  }

  function decorate() {
    document.documentElement.classList.add("kbb-day");
    rename();
    try { new MutationObserver(rename).observe(document.body, { childList: true, subtree: true, characterData: true }); } catch (e) { /* ignore */ }
    // פייביקון עוגה + בלונים בכותרת הדף
    try {
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><text y="52" font-size="52">🎂</text></svg>';
      var href = "data:image/svg+xml," + encodeURIComponent(svg);
      var links = document.querySelectorAll('link[rel~="icon"]');
      if (!links.length) { var l = el("link", { rel: "icon" }); document.head.appendChild(l); links = [l]; }
      Array.prototype.forEach.call(links, function (ln) { ln.setAttribute("href", href); ln.removeAttribute("sizes"); ln.setAttribute("type", "image/svg+xml"); });
      if (document.title.indexOf("🎈") < 0) document.title = "🎈 " + document.title + " 🎂";
    } catch (e) { /* ignore */ }
    // בלונים עולים בצידי המסך
    if (!noMotion) {
      var frag = document.createDocumentFragment();
      var spots = [3, 9, 15, 85, 91, 97];
      spots.forEach(function (left, i) {
        var b = el("span", { "class": "kbb-balloon", "aria-hidden": "true" }, i % 2 ? "🎈" : "🎂");
        b.style.left = left + "%";
        b.style.animationDuration = (9 + (i * 7) % 5) + "s";
        b.style.animationDelay = (-(i * 2.3)) + "s";
        frag.appendChild(b);
      });
      document.body.appendChild(frag);
    }
    // כפתור צף לפתיחה חוזרת
    var fab = el("button", { id: "kbb-fab", type: "button", title: "יום ההולדת של שלומי 🎂", "aria-label": "יום ההולדת של שלומי — פתיחת הברכה" }, "🎂");
    fab.addEventListener("click", openSign);
    document.body.appendChild(fab);
  }

  function init() {
    var st = el("style", null, css);
    document.head.appendChild(st);
    decorate();
    if (!seen || preview) openSign();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
