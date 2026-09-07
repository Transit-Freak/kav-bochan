/* אחד באפריל (בחירת שלמה 07.09) — שלושה דברים, רק ב-1 באפריל (שעון ישראל):

   1. "הקו הבוחן 1997": דף הבית נראה כמו אתר מלפני שלושים שנה — רקע אבנים
      אפור, כותרת ורודה, שורה רצה ("האתר בבנייה"), כרטיסים בקופסאות עם
      מסגרת תלת-ממדית, תגי NEW! מהבהבים, מונה מבקרים 000042, תגי 88x31,
      ספר אורחים ו-ICQ 12706. בלי שורת זכויות יוצרים (שלמה 07.09). המראה חל
      רק על מסך הבחירה של דף הבית; כשפותחים כלי (קו פח וכו׳) הוא יורד.
   2. "האם אתה מדייק יותר מאוטובוס?": שאלון של שלוש שאלות שנמשך זמן אקראי
      של 10–15 שניות ("האוטובוס יוצא בעוד N שניות"). מי שלא סיים בזמן מקבל
      "האוטובוס יצא בלעדיך. כמו תמיד." מי שסיים — ציון דיוק אישי מול אחוז
      ההגעות בזמן האמיתי של האוטובוסים מאתמול (bus/data/index.json). פעם
      אחת ביום לכל מבקר (localStorage).
   3. טקס פרסי הפח — בקו פח (KavPach.jsx, APRIL_FOOLS).
   תצוגה מקדימה בכל יום: ‎?april=1‎. מכבד "בלי תנועה" (בלי שורה רצה, בלי הבהוב). */
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
  var isApril = t.m === 4 && t.d === 1;
  if (!isApril && !preview) return;
  var key = "kb-april-" + t.y;
  var seen = false;
  try { seen = !!localStorage.getItem(key); } catch (e) { /* מצב פרטי */ }
  var noMotion = false;
  try { noMotion = (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) || document.documentElement.classList.contains("a11y-nomotion"); } catch (e) { /* ignore */ }
  var base = "";
  try { base = (document.currentScript && document.currentScript.src) ? document.currentScript.src.replace(/april\.js.*$/, "") : ""; } catch (e) { /* ignore */ }
  function el(tag, attrs, html) { var e = document.createElement(tag); if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); }); if (html != null) e.innerHTML = html; return e; }

  // ---------- 1997 ----------
  var TILE = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%23c8c8c8'/%3E%3Ccircle cx='9' cy='11' r='6' fill='%23bdbdbd'/%3E%3Ccircle cx='28' cy='27' r='8' fill='%23d4d4d4'/%3E%3Ccircle cx='31' cy='6' r='3' fill='%23b5b5b5'/%3E%3C/svg%3E\")";
  var H = "html.kb-1997 ";   // המראה חל רק כשמסך הבחירה של דף הבית מוצג
  var retroCss = [
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
  function retroApply() {
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
  function retro() {
    document.head.appendChild(el("style", null, retroCss));
    var m = el("div", { id: "r97-marq", role: "presentation" }, noMotion ? MARQ.slice(0, 70) + "…" : "<marquee scrollamount='6'>" + MARQ + "</marquee>");
    document.body.insertBefore(m, document.body.firstChild);
    document.body.appendChild(el("div", { id: "r97-bubble" }, "💬 האתר ישודרג ב-2 באפריל. באמת. 1 באפריל שמח"));
    retroApply();
    try { new MutationObserver(retroApply).observe(document.body, { childList: true, subtree: true }); } catch (e) { /* ignore */ }
  }

  // ---------- השאלון ----------
  // שלוש שאלות; לכל תשובה "אחוז דיוק" — כמו קטגוריות המדד: מוקדם, בזמן, איחור קל, איחור כבד
  var Q = [
    { q: "מתי יצאת היום מהבית, לעומת מה שתכננת?", a: [["מוקדם, אני כזה", 95], ["בדיוק בזמן", 100], ["עד 5 דקות איחור", 70], ["בוא לא נדבר על זה", 20]] },
    { q: "כמה פעמים השבוע אמרת \"אני כבר בדרך\" כשעוד היית בבית?", a: [["אף פעם", 100], ["פעם-פעמיים", 75], ["כל יום", 40], ["אני עכשיו בבית", 10]] },
    { q: "קבעת ל-8:00. מתי הגעת?", a: [["7:55", 95], ["8:00", 100], ["8:10", 60], ["8:30, ויש סיפור על פקק", 15]] }
  ];
  var css = [
    "#kba-bg{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.66);display:flex;align-items:center;justify-content:center;padding:16px;direction:rtl;font-family:'Heebo',system-ui,sans-serif}",
    "#kba-card{background:#fff;border-radius:22px;padding:18px 18px 16px;max-width:420px;width:100%;box-shadow:0 24px 60px rgba(0,0,0,.45);text-align:right;position:relative;color:#0f172a}",
    "html:not(.a11y-nomotion) #kba-card{animation:kba-pop .4s cubic-bezier(.2,1.4,.4,1) both}@keyframes kba-pop{from{transform:scale(.7);opacity:0}to{transform:none;opacity:1}}",
    "#kba-x{position:absolute;top:10px;left:12px;border:0;background:#f1f5f9;border-radius:50%;width:32px;height:32px;font-size:18px;cursor:pointer;color:#475569;font-family:inherit}",
    ".kba-kicker{font-size:12px;font-weight:900;color:#e11d48;letter-spacing:.02em}",
    ".kba-title{font-size:22px;font-weight:900;margin:2px 0 10px;line-height:1.15}",
    ".kba-bus{display:flex;align-items:center;gap:8px;background:#fef3c7;border:2px solid #f59e0b;border-radius:14px;padding:7px 10px;font-weight:900;font-size:14px;color:#78350f;margin-bottom:10px}",
    ".kba-bus b{font-variant-numeric:tabular-nums;min-width:1.6em;text-align:center}",
    ".kba-bar{height:8px;background:#fde68a;border-radius:99px;overflow:hidden;flex:1}.kba-bar i{display:block;height:100%;background:#f59e0b;border-radius:99px;width:100%}",
    "html:not(.a11y-nomotion) .kba-bar i{transition:width 1s linear}",
    ".kba-q{font-weight:900;font-size:16px;margin:8px 0 8px}.kba-step{font-size:12px;color:#64748b;font-weight:800}",
    ".kba-a{display:grid;grid-template-columns:1fr 1fr;gap:8px}.kba-a button{border:2px solid #e2e8f0;background:#f8fafc;border-radius:14px;padding:11px 10px;font:900 14px/1.2 'Heebo',system-ui,sans-serif;color:#0f172a;cursor:pointer;text-align:center}",
    ".kba-a button:hover,.kba-a button:focus-visible{border-color:#0f172a;background:#fff;outline:none}",
    ".kba-res{font-size:52px;font-weight:900;line-height:1;text-align:center;margin:12px 0 4px}.kba-res small{font-size:16px;color:#64748b;display:block;font-weight:800;margin-top:6px}",
    ".kba-verdict{background:#f1f5f9;border-radius:14px;padding:10px 12px;font-weight:800;font-size:14px;line-height:1.5;margin:10px 0}",
    ".kba-gone{text-align:center;font-size:20px;font-weight:900;padding:18px 6px 8px;line-height:1.4}.kba-gone span{display:block;font-size:44px;margin-bottom:8px}",
    "html:not(.a11y-nomotion) .kba-gone span{animation:kba-drive 1.6s ease-in forwards}@keyframes kba-drive{from{transform:translateX(0)}to{transform:translateX(-120vw)}}",
    ".kba-foot{font-size:12px;color:#64748b;font-weight:800;text-align:center;margin-top:8px}",
    ".kba-ok{display:block;width:100%;margin-top:10px;border:0;background:#0f172a;color:#fff;border-radius:14px;padding:11px;font:900 14px 'Heebo',system-ui,sans-serif;cursor:pointer}"
  ].join("\n");

  var bg, card, timer = null, left, answers = [], step = 0, done = false, busPct = null, busDay = "";

  // אחוז ההגעות בזמן האמיתי — היום האחרון במדד (בלי ימי שידור חלקי)
  function loadBus() {
    return fetch(base + "bus/data/index.json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (j) {
      var days = (j.days || []).filter(function (d) { return d.meas && !(d.sched > 0 && d.obs < d.sched * 0.3); });
      var last = days[days.length - 1];
      if (last) { busPct = Math.round(100 * last.c[1] / last.meas); busDay = String(last.d).split("-").reverse().join("."); }
    }).catch(function () { /* בלי נתון — התוצאה בלי השוואה */ });
  }
  function close() {
    if (timer) clearInterval(timer);
    if (bg) bg.remove();
    try { localStorage.setItem(key, "1"); } catch (e) { /* ignore */ }
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) { if (e.key === "Escape") close(); }
  function busLine() { return "<div class='kba-bus'><span>🚌</span><span>האוטובוס יוצא בעוד <b id='kba-n'>" + left + "</b> שנ׳</span><span class='kba-bar'><i id='kba-fill'></i></span></div>"; }
  function render() {
    var body = card.querySelector("#kba-body");
    if (step < Q.length) {
      var q = Q[step];
      body.innerHTML = busLine() + "<div class='kba-step'>שאלה " + (step + 1) + " מתוך " + Q.length + "</div><div class='kba-q'>" + q.q + "</div><div class='kba-a'>" +
        q.a.map(function (a, i) { return "<button type='button' data-i='" + i + "'>" + a[0] + "</button>"; }).join("") + "</div>";
      Array.prototype.forEach.call(body.querySelectorAll(".kba-a button"), function (b) {
        b.addEventListener("click", function () { if (done) return; answers.push(q.a[+b.dataset.i][1]); step++; render(); });
      });
      var first = body.querySelector(".kba-a button"); if (first) first.focus();
      updateBar();
    } else {
      finish();
    }
  }
  function updateBar() {
    var n = card.querySelector("#kba-n"), f = card.querySelector("#kba-fill");
    if (n) n.textContent = left;
    if (f) f.style.width = Math.max(0, 100 * left / total) + "%";
  }
  var total;
  function finish() {
    done = true; if (timer) clearInterval(timer);
    var me = Math.round(answers.reduce(function (s, v) { return s + v; }, 0) / answers.length);
    var body = card.querySelector("#kba-body");
    var verdict;
    if (busPct == null) verdict = "את האוטובוסים לא הצלחנו למדוד הרגע, אז ננחש: ניצחת.";
    else if (me > busPct) verdict = "ניצחת את האוטובוסים. בארץ " + busPct + "% מההגעות לתחנות היו בזמן ב-" + busDay + ". יש לך על מה להתגאות, ולהם יש למי לשאוף.";
    else if (me === busPct) verdict = "תיקו עם האוטובוסים: גם הם " + busPct + "% בזמן ב-" + busDay + ". אתם עשויים מאותו חומר.";
    else verdict = "האוטובוסים ניצחו אותך: " + busPct + "% בזמן ב-" + busDay + ", ואתה " + me + "%. אולי תנסה לנסוע בהם.";
    body.innerHTML = "<div class='kba-res'>" + me + "%<small>מהזמן אתה בזמן (לפי עדותך)</small></div><div class='kba-verdict'>" + verdict + "</div>" +
      "<button type='button' class='kba-ok' id='kba-ok'>אחד באפריל שמח 🚌</button><div class='kba-foot'>הנתון על האוטובוסים אמיתי, ממדד דיוק האוטובוסים. הנתון עליך — לפי מה שסיפרת.</div>";
    card.querySelector("#kba-ok").addEventListener("click", close);
    card.querySelector("#kba-ok").focus();
  }
  function gone() {
    done = true; if (timer) clearInterval(timer);
    var body = card.querySelector("#kba-body");
    body.innerHTML = "<div class='kba-gone'><span>🚌</span>האוטובוס יצא בלעדיך.<br>כמו תמיד.</div><button type='button' class='kba-ok' id='kba-ok'>אחד באפריל שמח</button><div class='kba-foot'>השאלון נמשך " + total + " שניות, בדיוק כמו הזמן שאוטובוס מחכה בתחנה. כלומר, לא.</div>";
    card.querySelector("#kba-ok").addEventListener("click", close);
    card.querySelector("#kba-ok").focus();
    setTimeout(function () { if (bg && bg.parentNode) close(); }, 6000);
  }
  function open() {
    total = 10 + Math.floor(Math.random() * 6);   // 10–15 שניות (בקשת שלמה)
    left = total;
    document.head.appendChild(el("style", null, css));
    bg = el("div", { id: "kba-bg", role: "dialog", "aria-modal": "true", "aria-label": "האם אתה מדייק יותר מאוטובוס?" });
    card = el("div", { id: "kba-card" }, "<button id='kba-x' type='button' aria-label='סגירה'>×</button><div class='kba-kicker'>1 באפריל · הקו הבוחן בוחן אותך</div><div class='kba-title'>האם אתה מדייק יותר מאוטובוס?</div><div id='kba-body'></div>");
    bg.appendChild(card);
    document.body.appendChild(bg);
    card.querySelector("#kba-x").addEventListener("click", close);
    bg.addEventListener("click", function (e) { if (e.target === bg) close(); });
    document.addEventListener("keydown", onKey);
    render();
    timer = setInterval(function () {
      left--; updateBar();
      if (left <= 0 && !done) gone();
    }, 1000);
  }
  function init() {
    retro();
    if (seen && !preview) return;   // השאלון — פעם אחת ביום; המראה של 1997 נשאר כל היום
    loadBus(); open();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
