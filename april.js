/* אחד באפריל (בחירת שלמה 07.09): "האם אתה מדייק יותר מאוטובוס?"

   בכניסה לדף הבית ב-1 באפריל קופץ שאלון קצר של שלוש שאלות על הדיוק של
   המבקר עצמו. הוא נמשך זמן אקראי של 10–15 שניות — "האוטובוס יוצא בעוד N
   שניות" — ומי שלא סיים בזמן מקבל "האוטובוס יצא בלעדיך. כמו תמיד." מי שסיים
   מקבל ציון דיוק אישי מול אחוז ההגעות בזמן האמיתי של האוטובוסים בארץ מאתמול
   (מדד דיוק האוטובוסים, bus/data/index.json). פעם אחת ביום לכל מבקר
   (localStorage). תצוגה מקדימה בכל יום: ‎?april=1‎. מכבד "בלי תנועה".
   טקס פרסי הפח של אותו יום נמצא בקו פח (KavPach.jsx, isAprilFools). */
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
  if (seen && !preview) return;
  var noMotion = false;
  try { noMotion = (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) || document.documentElement.classList.contains("a11y-nomotion"); } catch (e) { /* ignore */ }
  var base = "";
  try { base = (document.currentScript && document.currentScript.src) ? document.currentScript.src.replace(/april\.js.*$/, "") : ""; } catch (e) { /* ignore */ }

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

  function el(tag, attrs, html) { var e = document.createElement(tag); if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); }); if (html != null) e.innerHTML = html; return e; }
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
  function init() { loadBus(); open(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
