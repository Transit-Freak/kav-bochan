/* שחזור המסך האחרון אחרי מעבר "אתר למחשב"/"אתר לנייד" בכרום (אנדרואיד).
   המעבר טוען את הכתובת שאיתה נכנסו ללשונית — לא את המצב שהכלי כתב בשורת
   הכתובת בלי טעינה (קו/עיר/חברה פתוחים). המצב האחרון נשמר ללשונית
   (sessionStorage) ומשוחזר כשנוחתים שוב על אחת הכתובות המקוריות.
   משותף לכל הכלים; "הקו בזמן" מריץ גרסה זהה בתוך הקוד שלו (line-history/src). */
(function () {
  try {
    // פעם אחת בלבד בכל דף (דף הבית טוען את הקובץ גם דרך home.js)
    if (window.__kbNavRestore) return; window.__kbNavRestore = 1;
    var K = "kbNav", now = location.href, base = function (u) { return String(u).split("#")[0].split("?")[0]; };
    // הכתובת שאיתה המסמך הזה נטען — לפני כל שינוי שלנו או של הכלי
    var L = location.href, Lpre = L.split("#")[0];
    // כתובת ש"אתר למחשב" של כרום יטען באמת: (1) "?" ריק לפני ה-# כשאין שאילתה; (2) אם היא עדיין שונה מהכתובת
    // שאיתה המסמך נטען רק אחרי ה-# — משנים גם את החלק שלפני ה-#. זה קורה אחרי רענון או מעבר מחשב/נייד
    // (המסמך כבר נטען עם "?#…"), כשהדף נטען עם "?v=…", וכשהכלי מוחק את ה-# של קישור משותף.
    // "/x/" ← "/x/?", "/x/?" ← "/x/?&", "/x/?v=1" ← "/x/?v=1&", "/x/?v=1&" ← "/x/?v=1"
    var q = function (u) {
      if (u == null) return u;
      try {
        var a = new URL(String(u), location.href);
        if (a.origin !== location.origin) return u;
        var p0 = a.href.split("#")[0], pre = p0, h = a.hash;
        if (h && pre.indexOf("?") < 0) pre += "?";
        if (pre === Lpre && pre + h !== L) pre = pre.indexOf("?") < 0 ? pre + "?" : /&$/.test(pre) ? pre.slice(0, -1) : pre + "&";
        if (pre !== p0) return pre.slice(a.origin.length) + h;
      } catch (e) {}
      return u;
    };
    var s = null; try { s = JSON.parse(sessionStorage[K] || "null"); } catch (e) {}
    var nav = performance.getEntriesByType ? performance.getEntriesByType("navigation")[0] : null;
    var reload = nav ? nav.type === "reload" : !!(performance.navigation && performance.navigation.type === 1);
    var origs = ((s && Array.isArray(s.origs)) ? s.origs : []).filter(function (u) { return base(u) === base(now); });
    var recent = !!(s && s.ts && Date.now() - s.ts < 15 * 60 * 1000);
    var toggled = !reload && recent && !document.referrer && (!nav || nav.type === "navigate");
    if ((reload || toggled) && s && s.url && s.url !== now && base(s.url) === base(now) && origs.indexOf(now) >= 0)
      history.replaceState(history.state, "", q(s.url));
    var note = function () { if (origs.indexOf(location.href) < 0) origs.push(location.href); if (origs.length > 30) origs.splice(0, origs.length - 30); };
    var save = function () { try { sessionStorage[K] = JSON.stringify({ origs: origs, url: location.href, ts: Date.now() }); } catch (e) {} };
    var push0 = history.pushState.bind(history), rep0 = history.replaceState.bind(history);
    note();
    // קישור עם # (קישור משותף): כרום טוען בהחלפה את הכתובת המקורית, ואם היא שונה מהנוכחית רק אחרי ה-#
    // הוא מתייחס לזה כקפיצה בתוך הדף בלי טעינה — והדף חוזר לגרסת הנייד. "?" ריק לפני ה-# הופך את זה
    // לטעינה אמיתית (שלמה 30.10: "עובר לגרסה במחשב ומחזיר ישר לגרסה של הטלפון")
    var fix = function () { try { var n = q(location.href); if (n !== location.href) rep0(history.state, "", n); } catch (e) {} };
    fix();
    // אותו דבר בכל מעבר בתוך הדף (שלמה 20.11, הקלטת רשת של כרום): כתובת שונה מהדף רק אחרי ה-#
    // ("/fleet/#m=city") — "אתר למחשב" טוען אותה מחדש עם זהות של טלפון, והדף נשאר צר. q() מתקן כל כתובת
    // שהכלי כותב (pushState / replaceState / קישור # / אחורה-קדימה) כך שהמעבר יהיה טעינה אמיתית במצב מחשב
    // אחורה/קדימה בין "/x/" ל-"/x/?#a": הכתובות שונות גם לפני ה-#, ולכן הדפדפן שולח רק popstate בלי
    // hashchange — וכלי שמקשיב רק ל-hashchange היה מחליף כתובת בלי להחליף מסך. כשה-# השתנה והדפדפן
    // לא שלח hashchange בעצמו, שולחים אותו כאן (פעם אחת; hashchange אמיתי מבטל את שלנו)
    var last = location.href, pend = null;
    history.pushState = function (st, t, u) { push0(st, t, q(u)); last = location.href; note(); save(); };
    history.replaceState = function (st, t, u) { rep0(st, t, q(u)); last = location.href; save(); };
    window.addEventListener("popstate", function () {
      var old = last; fix(); last = location.href; save();
      if (old.split("#")[1] === last.split("#")[1] && (old.indexOf("#") < 0) === (last.indexOf("#") < 0)) return;
      var me = pend = { o: old, n: last };
      setTimeout(function () {
        if (pend !== me) return; pend = null;
        try { window.dispatchEvent(new HashChangeEvent("hashchange", { oldURL: me.o, newURL: location.href })); } catch (e) {}
      }, 0);
    });
    window.addEventListener("hashchange", function (e) {
      if (e && e.isTrusted) pend = null;
      fix(); last = location.href; note(); save();
    });
    save();
  } catch (e) {}
})();
