/* שחזור המסך האחרון אחרי מעבר "אתר למחשב"/"אתר לנייד" בכרום (אנדרואיד).
   המעבר טוען את הכתובת שאיתה נכנסו ללשונית — לא את המצב שהכלי כתב בשורת
   הכתובת בלי טעינה (קו/עיר/חברה פתוחים). המצב האחרון נשמר ללשונית
   (sessionStorage) ומשוחזר כשנוחתים שוב על אחת הכתובות המקוריות.
   משותף לכל הכלים; "הקו בזמן" מריץ גרסה זהה בתוך app.jsx. */
(function () {
  try {
    var K = "kbNav", now = location.href, base = function (u) { return String(u).split("#")[0].split("?")[0]; };
    var s = null; try { s = JSON.parse(sessionStorage[K] || "null"); } catch (e) {}
    var nav = performance.getEntriesByType ? performance.getEntriesByType("navigation")[0] : null;
    var reload = nav ? nav.type === "reload" : !!(performance.navigation && performance.navigation.type === 1);
    var origs = ((s && Array.isArray(s.origs)) ? s.origs : []).filter(function (u) { return base(u) === base(now); });
    var recent = !!(s && s.ts && Date.now() - s.ts < 15 * 60 * 1000);
    var toggled = !reload && recent && !document.referrer && (!nav || nav.type === "navigate");
    if ((reload || toggled) && s && s.url && s.url !== now && base(s.url) === base(now) && origs.indexOf(now) >= 0)
      history.replaceState(history.state, "", s.url);
    var note = function () { if (origs.indexOf(location.href) < 0) origs.push(location.href); if (origs.length > 30) origs.splice(0, origs.length - 30); };
    var save = function () { try { sessionStorage[K] = JSON.stringify({ origs: origs, url: location.href, ts: Date.now() }); } catch (e) {} };
    note();
    var push0 = history.pushState.bind(history), rep0 = history.replaceState.bind(history);
    history.pushState = function (st, t, u) { push0(st, t, u); note(); save(); };
    history.replaceState = function (st, t, u) { rep0(st, t, u); save(); };
    window.addEventListener("popstate", save);
    window.addEventListener("hashchange", function () { note(); save(); });
    save();
  } catch (e) {}
})();
