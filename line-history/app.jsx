/* הקו בזמן — היסטוריית מסלולים ותחנות מהשוואת GTFS יומית.
   הנתונים: line-history/data, נוצר ע"י tools/linehistory.py ב-GitHub Actions. */
const { useState, useEffect, useMemo, useRef } = React;
// מספר הגרסה של קובצי הנתונים (?v=): כאן ולא ב-index.html, כי הקוד נטען תמיד טרי
// (חותמת זמן בכתובת) ואילו index.html יושב במטמון ה-CDN עד 10 דקות (שלמה 22.09)
const BUILD = "192-exact-line-ranking";

// כרום באנדרואיד: ההחלפה בין "אתר למחשב" ל"אתר לנייד" טוענת מחדש את הכתובת
// שאיתה נכנסו לדף — לא את המצב הנוכחי (טאב, קו פתוח) שהאתר כתב בשורת הכתובת
// בלי טעינה. לכן המצב האחרון נשמר ללשונית (sessionStorage) ומשוחזר כשטעינה
// מחדש נוחתת על אחת הכתובות המקוריות (שלמה 07.09: "מחזיר אותך לדף הקודם").
(function () {
  try {
    const K = "kbNav", now = location.href, base = (u) => String(u).split("#")[0];
    let s = null; try { s = JSON.parse(sessionStorage[K] || "null"); } catch (e) { /* ignore */ }
    const nav = performance.getEntriesByType ? performance.getEntriesByType("navigation")[0] : null;
    const reload = nav ? nav.type === "reload" : !!(performance.navigation && performance.navigation.type === 1);
    const origs = ((s && Array.isArray(s.origs)) ? s.origs : []).filter((u) => base(u) === base(now));
    // ההחלפה "אתר למחשב"/"אתר לנייד" לא תמיד נרשמת כ-reload — לפעמים כניווט
    // רגיל בלי מפנה, ואז נחתנו על הכתובת המקורית (למשל קישור לקו 10) ולא
    // על המסך האחרון. מצב שנשמר בדקות האחרונות באותה לשונית מספיק בשביל
    // לשחזר גם אז (שלמה 18.09: "מקפיץ אותך לקו 10 ולא נותן לחזור לתפריט").
    const recent = !!(s && s.ts && Date.now() - s.ts < 15 * 60 * 1000);
    const toggled = !reload && recent && !document.referrer && (!nav || nav.type === "navigate");
    if ((reload || toggled) && s && s.url && s.url !== now && base(s.url) === base(now) && origs.includes(now)) history.replaceState(history.state, "", s.url);
    const note = () => { if (!origs.includes(location.href)) origs.push(location.href); if (origs.length > 30) origs.splice(0, origs.length - 30); };
    const save = () => { try { sessionStorage[K] = JSON.stringify({ origs, url: location.href, ts: Date.now() }); } catch (e) { /* ignore */ } };
    note();
    const push0 = history.pushState.bind(history), rep0 = history.replaceState.bind(history);
    history.pushState = function (st, t, u) { push0(st, t, u); note(); save(); };
    history.replaceState = function (st, t, u) { rep0(st, t, u); save(); };
    window.addEventListener("popstate", save);
    window.addEventListener("hashchange", () => { note(); save(); });
    save();
  } catch (e) { /* ignore */ }
})();

// איחוד לצורך הסרגל בלבד: שלוש דרגות של שינוי תחנות הן שאלה אחת, וכך גם
// הארכה/קיצור/החלפת קצה. "תיעוד ראשון" ו"צילום מהארכיון" אינם שינויים אלא
// נקודות פתיחה, ולכן הם יחד.
const KGROUP = {
  "stops-add": "stops", "stops-del": "stops",
  extend: "terminal", shorten: "terminal",
  snapshot: "baseline",
};
const KGLABEL = { stops: "שינוי תחנות", terminal: "שינוי קצה המסלול",
                  baseline: "נקודת פתיחה" };
const KINDS = {
  baseline:    { label: "תיעוד ראשון", color: "#64748b" },
  snapshot:    { label: "תיעוד ראשון", color: "#64748b" },
  new:         { label: "וריאנט חדש", color: "#15803d" },
  route:       { label: "שינוי מסלול", color: "#7c3aed" },
  redraw:      { label: "תיקון שרטוט", color: "#0e7490" },
  terminal:    { label: "שינוי קצה המסלול", color: "#a21caf" },
  extend:      { label: "הארכת קו", color: "#15803d" },
  shorten:     { label: "קיצור קו", color: "#c2410c" },
  "stops-add": { label: "תחנות נוספו", color: "#3f6212" },
  "stops-del": { label: "תחנות ירדו", color: "#be123c" },
  stops:       { label: "שינוי תחנות", color: "#b45309" },
  operator:    { label: "החלפת מפעיל", color: "#0f766e" },
  dest:        { label: "שינוי יעד", color: "#9333ea" },
  renum:       { label: "שינוי מספר", color: "#be185d" },
  renamed:     { label: "שינוי שם תחנת קצה", color: "#b45309" },
  mode:        { label: "שינוי סוג הקו", color: "#0369a1" },
  access:      { label: "שינוי נגישות", color: "#0f766e" },
  vehicle:     { label: "שינוי סוג הרכב", color: "#7c3aed" },
  ltype:       { label: "שינוי סוג הקו", color: "#0e7490" },
  returned:    { label: "בוטל וחזר", color: "#f59e0b" },
  board:       { label: "שינוי עלייה/ירידה", color: "#854d0e" },
  platform:    { label: "שינוי רציף", color: "#0e7490" },
  "planned-dropped": { label: "תוכנן ולא נכנס לפעול", color: "#9f1239" },
  "planned-new": { label: "קו שפורסם ולא נכנס לפעול", color: "#9f1239" },
  "planned-route": { label: "שינוי תחנות שפורסם ולא נכנס לפעול", color: "#7f1d1d" },
  removed:     { label: "בוטל", color: "#dc2626" },
  "removed-year": { label: "בוטל — מעל שנה לא חזר", color: "#7f1d1d" },
  freq:        { label: "שינוי מספר הרכבים באותה נסיעה", color: "#b45309" },
  sched:       { label: "שינוי לו\"ז", color: "#4338ca" },
  times:       { label: "הלו\"ז האחרון", color: "#0e7490" },
};
// הגדרת המשתמש: "שינוי מספר הרכבים" = רק תגבור (שני רכבים באותה דקה
// שהשתנו). כל שאר שינויי הכמות/שעות — תחת שינוי לו"ז.
function evKind(v) {
  if (v.k === "freq" && !/תגבור/.test(v.note || "")) return "sched";
  return v.k;
}

function plKindOf(x) { return x.pk || (/הווריאנט/.test(x.note || "") ? "new" : "route"); }
// תוכנית שלא יצאה לפועל — מה היא הייתה משנה ומה קרה במקומה. הקטגוריה נועדה
// למה שלא נכנס לפעול בחיים (שלמה 03.09): תוכנית שבסוף נכנסה נמחקת בריצה
// היומית (tools/repair_planned_entered.py). שלמה 05.09: "לא מעניין אותי מספר
// התחנות אלא אם היה שינוי בין הגרסה הסופית לגרסה של עכשיו", "תציין אם זה
// נכנס בתאריך אחר", "מה היה המסלול השונה". לכן:
//   base      המסלול שהקו נסע בו לפני התוכנית (התיעוד הגיאומטרי האחרון לפניה)
//   removedAt וריאנט שנסע, ירד, ותוכנן לחזור — מתי ירד
//   entered   גרסה מאוחרת עם בדיוק רצף התחנות שתוכנן: נכנס בתאריך אחר
//   changed   מה שנכנס במקום: הגרסה הראשונה אחרי התוכנית שרצף התחנות בה שונה
//             מהבסיס (ב-'new' — שהווריאנט התחיל בה), בתוך חצי שנה מהמועד.
//             שינוי שנכנס שנה אחר כך אינו "במקום" — הוא אירוע רגיל בציר.
//   goneAt    הווריאנט עצמו ירד מהרישום זמן קצר אחרי ואינו נוסע היום
//   vsBase    מה התוכנית הייתה משנה לעומת המסלול שנסע (נוספו / ירדו)
//   vsPlan    במה המסלול שנכנס בפועל (changed) שונה מהתוכנית
// ההשוואות הקודמות אמרו "מה שנכנס אחר כך היה שונה" גם כשמה ש"נכנס" היה צילום
// של המסלול הישן ללא שינוי (קו 2 אילת, 2025) — עכשיו זה "המסלול נשאר כפי שהיה".
const PL_WINDOW = 183;
function stopsDiff(a, b) {
  const ac = new Set((a || []).map((s) => String(s[0]))), bc = new Set((b || []).map((s) => String(s[0])));
  return { add: (a || []).filter((s) => !bc.has(String(s[0]))), rem: (b || []).filter((s) => !ac.has(String(s[0]))) };
}
function plannedInfo(x, i, vs) {
  const kind = plKindOf(x), plan = x.pstops || [];
  const key = (st) => (st || []).map((s) => String(s[0])).join("|");
  const pk = key(plan);
  let base = null, bi = -1;
  for (let j = i - 1; j >= 0; j--) if ((vs[j].stops || []).length) { base = vs[j]; bi = j; break; }
  let removedAt = null;
  for (let j = i - 1; j > bi; j--) if (vs[j].k === "removed") { removedAt = vs[j].d; break; }
  const bk = base ? key(base.stops) : null;
  const until = x.ps ? new Date(x.ps).getTime() + PL_WINDOW * 864e5 : null;
  const soon = (d) => !until || new Date(d).getTime() <= until;
  let entered = null, changed = null;
  for (let j = i + 1; j < vs.length; j++) {
    const w = vs[j];
    if (!(w.stops || []).length) continue;
    const wk = key(w.stops);
    if (plan.length && wk === pk) { entered = w; break; }
    if (!changed && soon(w.d) && (kind === "new" || wk !== bk)) changed = w;
  }
  if (entered) changed = null;
  // הווריאנט עצמו ירד ולא חזר: הגרסה האחרונה בקובץ היא הביטול, זמן קצר אחרי
  // התוכנית. ביטול זמני (ירד וחזר, קו 2 אילת 2025) אינו נחשב.
  const last = vs[vs.length - 1];
  const goneAt = !entered && !changed && last && last.k === "removed" && last.d > x.d && soon(last.d) ? last.d : null;
  const vsBase = base ? stopsDiff(plan, base.stops) : null;
  return { kind, plan, base, removedAt, entered, changed, goneAt, vsBase,
           sameAsBase: !!vsBase && !vsBase.add.length && !vsBase.rem.length,
           vsPlan: changed ? stopsDiff(changed.stops, plan) : null };
}
// שורת המצב של תוכנית שלא יצאה לפועל — מה קרה בסוף
function PlanStatus({ p }) {
  if (p.kind === "new") {
    const w = p.entered || p.changed;
    if (w) return <>הווריאנט התחיל בסוף ב-<b>{fmtD(w.d)}</b>{p.entered ? " באותו מסלול" : " במסלול שונה"}</>;
    if (p.base) return <>הווריאנט {p.removedAt ? <>נסע עד <b>{fmtD(p.removedAt)}</b></> : <>תועד נוסע לאחרונה ב-<b>{fmtD(p.base.d)}</b></>}, תוכנן לחזור ולא חזר עד היום</>;
    return <>הווריאנט לא נסע מעולם</>;
  }
  if (p.entered) return <>השינוי נכנס בסוף ב-<b>{fmtD(p.entered.d)}</b></>;
  if (p.changed) return <>השינוי לא נכנס לפעול; מה שנכנס ב-<b>{fmtD(p.changed.d)}</b> היה שונה</>;
  if (p.goneAt) return <>השינוי לא נכנס לפעול; הקו עצמו ירד מהרישום ב-<b>{fmtD(p.goneAt)}</b></>;
  return <>השינוי לא נכנס לפעול עד היום{p.base ? ", המסלול נשאר כפי שהיה" : ""}</>;
}
// שורות הפירוט — מה התוכנית הייתה משנה, ובמה מה שנכנס בפועל שונה ממנה.
// משותף לכרטיס בציר ולכרטיס הראשי; בלי ספירת תחנות (שלמה 05.09).
function PlanLines({ p, max }) {
  // שם ומק"ט, כמו בשאר כרטיסי האירועים (שלמה 05.09: "תוסיף מספר תחנה")
  const names = (arr) => arr.slice(0, max).map((s) => `${s[1]} (${s[0]})`).join(", ") + (arr.length > max ? ` ועוד ${arr.length - max}` : "");
  const plan = p.plan || [];
  return (<>
    {p.vsBase ? (p.sameAsBase
      ? <div>🟰 {p.kind === "new" ? "המסלול שתוכנן זהה למסלול שבו נסע קודם" : "רצף התחנות שתוכנן זהה למסלול שנסע — השינוי היה בשרטוט בלבד"}</div>
      : <>
        {p.vsBase.add.length > 0 && <div>➕ בתוכנית נוספו: {names(p.vsBase.add)}</div>}
        {p.vsBase.rem.length > 0 && <div>➖ בתוכנית ירדו: {names(p.vsBase.rem)}</div>}
      </>)
      : plan.length > 1 ? <div>🗺️ המסלול שתוכנן: מ{plan[0][1]} עד {plan[plan.length - 1][1]}</div> : null}
    {p.vsPlan && (p.vsPlan.add.length || p.vsPlan.rem.length) ? (
      <div>לעומת התוכנית, במסלול שנכנס ב-{fmtD(p.changed.d)}:
        {p.vsPlan.add.length > 0 && <> ➕ {names(p.vsPlan.add)}</>}
        {p.vsPlan.add.length > 0 && p.vsPlan.rem.length > 0 ? " ·" : ""}
        {p.vsPlan.rem.length > 0 && <> ➖ {names(p.vsPlan.rem)}</>}
      </div>) : null}
  </>);
}
// ביטול שנשאר בתוקף מעל שנה (הגרסה האחרונה היא removed וישנה משנה) מקבל קטגוריה משלו
function dispKind(x, i, vs) {
  // "האחרון" — בלי אירועים נגזרים (סוג רכב ברישוי) שעלולים לבוא אחרי הביטול
  if (x.k === "removed" && vs.slice(i + 1).every((v) => v.syn) && (Date.now() - new Date(x.d)) / 864e5 >= 365) return "removed-year";
  if (x.k === "planned-dropped") return plKindOf(x) === "new" ? "planned-new" : "planned-route";
  return evKind(x);
}
// אותו כלל ברמת האינדקס (lk/ld = הרשומה האחרונה של הווריאנט)
function isRemovedYear(l) {
  return l.lk === "removed" && (Date.now() - new Date(l.ld)) / 864e5 >= 365;
}
// קטגוריות הבחירה — מחולקות לקבוצות, בלי חפיפות: שלוש קטגוריות ביטול
// נפרדות (מעל שנה / פחות משנה / חזר), ותוויות שמסבירות את ההבדל.
// הקטגוריות אוחדו איפה שההפרדה הייתה שלנו ולא של העולם:
// · "מעל שנה" ו"פחות משנה" הן אותו דבר — קו מבוטל. משך הזמן כתוב בתאריך,
//   ואין סיבה לחייב סימון שתי תיבות כדי לראות קווים מבוטלים.
// · הארכה/קיצור/שינוי קצה הופרדו לפי סף שרירותי של שלוש תחנות: קו שקיבל
//   שתיים בקצה נפל לקטגוריה אחת ואחד שקיבל שלוש לאחרת. שלושתן "הקצה זז",
//   וההבחנה נשארת כתובה בתוך האירוע.
// · "תיקון שרטוט" הוא הקטגוריה הגדולה ביותר ואין בה שינוי לנוסע — משרד
//   התחבורה צייר מחדש בלי שאף תחנה זזה. הוצאה לקבוצה טכנית נפרדת.
// שלוש קטגוריות התחנות נשארו: ההבדל בין תחנה שנוספה לתחנה שירדה הוא
// בדיוק מה שמחפשים, ואיחודן היה חוסך שורה ועולה במידע.
const CAT_GROUPS = [
  { title: "ביטולים", items: ["removed-year", "removed-now", "removed-past"] },
  { title: "שינויי מסלול", items: ["route", "endpoint"] },
  { title: "שינויי תחנות", items: ["stops", "stops-add", "stops-del"] },
  { title: "תדירות ולוח זמנים", items: ["freq", "sched"] },
  { title: "רישום ופרטים", items: ["new", "operator", "dest", "renum", "mode", "platform", "vehicle", "ltype"] },
  { title: "שינויים שלא נכנסו לפעול", items: ["planned-new", "planned-route"] },
  { title: "שינויים טכניים", items: ["redraw"] },
];
const CAT_LABELS = {
  "removed-year": "מבוטל — מעל שנה לא חזר",
  "removed-now": "מבוטל כרגע — פחות משנה",
  "removed-past": "בוטל בעבר וחזר לפעול",
  route: "שינוי מסלול (ציור וגם תחנות)",
  endpoint: "שינוי קצה הקו (הארכה, קיצור או החלפת קצה)",
  redraw: "תיקון שרטוט — התחנות לא השתנו",
  stops: "הוחלפו תחנות (נוספו וגם ירדו)",
  "stops-add": "רק נוספו תחנות",
  "stops-del": "רק ירדו תחנות",
  new: "וריאנט חדש ברישום",
  operator: "החלפת מפעיל",
  dest: "שינוי יעד",
  renum: "שינוי מספר קו",
  mode: "שינוי סוג הקו (למשל רגיל ↔ לפי דרישה)",
  platform: "שינוי רציף — הקו עבר לרציף אחר במסוף",
  vehicle: "שינוי סוג הרכב",
  ltype: "שינוי סוג הקו — עירוני / אזורי / בינעירוני, או ייחודיות: תלמידים / לילה / מזין",
  // ניסוח קצר (שלמה 05.09: "זה ארוך ומסורבל"). הכלל המלא כתוב על האירוע עצמו.
  "planned-dropped": "תוכנן ולא נכנס לפעול — ירד מהרישום לפני תאריך ההתחלה",
  "planned-new": "קו שפורסם ולא נכנס לפעול — ירד מהרישום לפני שהתחיל",
  "planned-route": "שינוי תחנות שפורסם ולא נכנס לפעול — ירד מהרישום לפני שנכנס",
  freq: "שינוי מספר הרכבים באותה נסיעה (תגבור)",
  sched: "שינוי שעות היציאה (לו\"ז)",
};
const CAT_COLORS = { "removed-now": "#dc2626", "removed-past": "#f59e0b",
                     endpoint: "#a21caf" };
function catColor(k) { return CAT_COLORS[k] || (KINDS[k] || {}).color || "#64748b"; }
const ENDPOINT_KINDS = ["extend", "shorten", "terminal"];
// שלוש קטגוריות הביטול זרות זו לזו: קו שלא חזר מעל שנה הוא מבוטל בפועל,
// ואילו ביטול טרי עוד עשוי להתברר כהפסקה. ההבחנה נשארה לבקשת המשתמש.
function catMatch(l, k) {
  if (k === "removed-year") return isRemovedYear(l);
  if (k === "removed-now") return l.lk === "removed" && !isRemovedYear(l);
  if (k === "removed-past") return l.lk !== "removed" && (l.ks || []).includes("removed");
  if (k === "endpoint") return ENDPOINT_KINDS.some((x) => (l.ks || []).includes(x));
  return (l.ks || []).includes(k);
}
// אותו כלל ברמת האירוע הבודד בעמוד הקו: האם האירוע הזה שייך לקטגוריה של
// החיפוש. משמש כשנכנסים לקו מתוך חיפוש לפי קטגוריה — הסינון בעמוד נדלק
// אוטומטית על אותה קטגוריה (שלמה 06.09), ואפשר לשנות אותו בסרגל.
function evInCat(x, i, vs, k) {
  const dk = dispKind(x, i, vs);
  if (k === "endpoint") return ENDPOINT_KINDS.includes(dk);
  if (k === "removed-year") return dk === "removed-year";
  if (k === "removed-now") return dk === "removed";
  if (k === "removed-past") return dk === "removed" || dk === "returned";
  if (k === "sched") return dk === "sched" || dk === "freq";
  if (k === "stops" || k === "stops-add" || k === "stops-del") {
    if (dk === k) return true;
    // כמו באינדקס: שינוי מסלול שנוספו/ירדו בו תחנות נספר גם כשינוי תחנות
    if ((x.src === "ob" || x.gd) && dk !== "removed") {
      const a = x.add && x.add.length, r = x.rem && x.rem.length;
      return k === "stops" ? (a && r) : k === "stops-add" ? (a && !r) : (r && !a);
    }
    return false;
  }
  return dk === k;
}
const REMOVAL_CATS = new Set(["removed-year", "removed-now", "removed-past"]);
/* אירועי "שינוי רציף" ישנים (k=platform בלי pv) מוסתרים: עד 07.09 הסורק קרס
   את כל שורות הרציפים של מסוף (בקובץ המשרד יש שורה לכל רציף, אותו מק"ט)
   למספר אחד, והמספר "קפץ" 12→17→8→16→3 בראשל"צ בלי שרציף נוסף או בוטל.
   האירועים החדשים (pv=2, tools/platforms.py) נבנים מהשורות עצמן — רציף
   שקיבל קווים / נשאר בלי קווים בתחנה, וקו שעבר רציף — ומוצגים. */
const hiddenEv = (e) => e && (e.hid || (e.k === "platform" && !e.pv));
const SKINDS = {
  new:     { label: "חדשה", color: "#15803d" },
  del:     { label: "בוטלה", color: "#dc2626" },
  renamed: { label: "שינוי שם", color: "#b45309" },
  moved:   { label: "הזזת מיקום", color: "#2563eb" },
  city:    { label: "שינוי עיר", color: "#b91c1c" },
  pubdest: { label: "תחנת יעד לפרסום", color: "#7e22ce" },
  platform: { label: "רציף נוסף/בוטל", color: "#0e7490" },
  // רישום התחנות של יוני 2012 (GTFS של משרד התחבורה דרך OpenStreetMap, changeset 12028672):
  // אירוע אחד לכל תחנה שהייתה ברישום אז — שם, כתובת ומיקום של 2012 (שלמה 22.09)
  gtfs2012: { label: "ברישום 2012", color: "#78350f" },
};
// אירועי 2012 נבנים בדפדפן מקובץ הרישום (magihim-2012/data/stops-2012.json, או השבר לפי
// קידומת המק"ט), כדי לא לגעת בקורות החיים שהצנרת מתחזקת. dist: המרחק למיקום האחרון
// שידוע לנו מקורות החיים של אותה תחנה, כשיש.
function distM(a, b) {
  const ky = 110540, kx = 111320 * Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * ky, (a[1] - b[1]) * kx);
}
// לכל תחנה: אירוע "ברישום 2012", ואחריו מה שהשתנה באותו מק"ט בין 2012 לתחילת
// התיעוד שלנו (מרץ 2017): שינוי שם, הזזה (30 מ׳ ומעלה), או ביטול (המק"ט אינו
// ברישום מ-2017 ואילך). האירועים האלה מתוארכים "בין 2012 ל-2017" — לא ידוע מתי
// בדיוק (b12), והם ממוינים אחרי 2012 ולפני 2017 (שלמה 22.09).
// האירועים המוכנים מהשרת (magihim-2012/data/stops-2012-events.json, tools/build_stop_lines_2012.py):
// שורות קצרות → אובייקטי אירוע. שום חישוב על התחנות בדפדפן (שלמה 22.09)
function expand2012(rows) {
  const out = [];
  for (const r of rows || []) {
    const c = r[0], k = r[1];
    if (k === 0) out.push({ c, d: "2012-06-26", k: "gtfs2012", n: r[2], t: r[3], la: r[4], lo: r[5], tmp99: !!r[6], lines12: r[7] || 0 });
    else if (k === 1) out.push(r.length > 5 ? { c, d: "2016-12-31", b12: 1, k: "del", n: r[2], la: r[3], lo: r[4], reused: r[5], rdist: r[6] } : { c, d: "2016-12-31", b12: 1, k: "del", n: r[2], la: r[3], lo: r[4] });
    else if (k === 2) out.push({ c, d: "2016-12-31", b12: 1, k: "renamed", on: r[5], nn: r[2], n: r[2], la: r[3], lo: r[4] });
    else if (k === 3) out.push({ c, d: "2016-12-31", b12: 1, k: "moved", n: r[2], la: r[3], lo: r[4], ola: r[5], olo: r[6], dist: r[7] });
  }
  return out;
}
// לתחנה בודדת (שבר לפי קידומת) — אותה לוגיקה, על מעט תחנות
function events2012(snap) {
  const out = [];
  for (const c in snap) {
    const [n, la, lo, addr, , fn, fla, flo, dist, ren] = snap[c];
    // מק"ט 99xxxxx (7 ספרות): מספר זמני שמשרד התחבורה נתן בקובץ 2012 לתחנה בלי מספר שלט
    // (2,600 תחנות, כולן עם stop_id בקובץ המקורי; אף אחת לא קיימת היום באותו מספר) —
    // אין המשכיות למק"ט, ולכן לא "בוטלה" אלא "קיבלה מק"ט אחר" (שלמה 22.09)
    const tmp99 = c.length === 7 && c.startsWith("99");
    // מספר זמני שאף קו ב-2012 לא עצר בו (2,516 מתוך 2,600): רשומה בקובץ בלי שירות — לא מוצגת
    if (tmp99 && (!(snap[c][10] || 0) || snap[c][11])) continue;   // וגם כפילות של תחנה אמיתית עד 100 מ׳ — מוצגת האמיתית
    out.push({ c, d: "2012-06-26", k: "gtfs2012", n, t: addr, la, lo, tmp99, lines12: snap[c][10] || 0 });
    if (tmp99) continue;
    if (fn == null) { out.push({ c, d: "2016-12-31", b12: 1, k: "del", n, la, lo }); continue; }
    // אותו מק"ט במרחק קילומטר ומעלה: זו לא הזזה אלא מק"ט שהוקצה מחדש לתחנה אחרת
    // (למשל 59695: "בית לחם הגלילית ג׳" ב-2012, "צומת נהריה מזרח" מ-2017, 31 ק"מ) —
    // התחנה של 2012 בוטלה, והמק"ט שימש אחר כך תחנה אחרת (שלמה 22.09)
    if (dist >= 1000) { out.push({ c, d: "2016-12-31", b12: 1, k: "del", n, la, lo, reused: fn, rdist: dist }); continue; }
    if (ren) out.push({ c, d: "2016-12-31", b12: 1, k: "renamed", on: n, nn: fn, n: fn, la: fla, lo: flo });
    if (dist >= 30) out.push({ c, d: "2016-12-31", b12: 1, k: "moved", n: fn, la: fla, lo: flo, ola: la, olo: lo, dist });
  }
  return out;
}

// פענוח polyline (precision 5)
// פורמט קובץ דחוס (חיסכון ~30MB, בקשת המשתמש): תחנות ומסלולים נשמרים
// פעם אחת במאגרי pool/spool והגרסאות מפנות באינדקס; כאן פותחים חזרה
// לצורה המלאה — שאר הקוד לא יודע שהקובץ היה דחוס. תאום-לאחור לקבצים ישנים.
function materializeLf(lf) {
  if (!lf) return lf;
  // גרסאות "שינוי רציף" הישנות מסומנות מוסתרות (hid) אבל נשארות במערך: הן
  // נושאות את רצף התחנות של זמנן, והמפה משווה לגרסה הקודמת — הסרתן מהמערך
  // שינתה את ההשוואה, ותחנות שנוספו (קו 38 רחובות, 15.02.2024) איבדו את
  // הסימון הירוק (שלמה 07.09). הסינון נעשה רק בתצוגה (ראו hiddenEv).
  (lf.versions || []).forEach((v) => { if (hiddenEv(v)) v.hid = true; });
  const pool = lf.pool, spool = lf.spool;
  (lf.versions || []).forEach((v) => {
    if (pool && Array.isArray(v.stops) && v.stops.length && typeof v.stops[0] === "number")
      v.stops = v.stops.map((i) => pool[i]);
    if (typeof v.shp === "number") v.shp = (spool && v.shp > 0 && spool[v.shp]) || "";
  });
  delete lf.pool; delete lf.spool;
  // אירועים נגזרים (syn) שנכנסים לציר הזמן כקטגוריות משלהם, בלי גאומטריה
  // ובלי לגעת בגרסאות המסלול (שלמה 06.09: "קטגוריה נפרדת, לא חלק מהטקסט"):
  // · "שינוי סוג רכב" — לכל שינוי במאגר הרישוי של משרד התחבורה (veh =
  //   [[תאריך, סוג, גודל], …]; המצב הנוכחי כתוב בשורת הפרטים, "מיניבוס עירוני נגיש").
  //   "אוטובוס" לבד לא אומר כלום, אז הקטגוריות של המשרד מוצגות כגודל:
  //   אוטובוס רגיל / אוטובוס מפרקי / מידיבוס / מיניבוס, ו"לא מוגדר" = לא נקבע.
  // · "בוטל וחזר" — כרטיס ביום שהקו חזר לרישום אחרי תקופת ביטול, במקום פס
  //   טקסט בכותרת. קו שעדיין מבוטל נשאר עם כרטיס "בוטל" והודעת הסטטוס.
  if (!lf._synMerged) {
    // אותו ניסוח כמו בפיד (tools/linehistory_rishui.py: desc/note_for): תמיד גודל
    // וסוג יחד — "אוטובוס עירוני", "מיניבוס עירוני", "אוטובוס מפרקי בינעירוני" —
    // בלי "רגיל" ובלי "בגודל מלא" (שלמה 06–07.09)
    const UND = "לא מוגדר";
    const desc = (s, t) => {
      if (!s || s === UND) return UND;
      if (s === "מפרקי") return ["אוטובוס מפרקי", t].filter(Boolean).join(" ");
      return [s, t].filter(Boolean).join(" ");
    };
    const real = (lf.versions || []).filter((v) => !v.syn);
    const veh = lf.veh || [], evs = [];
    for (let i = 1; i < veh.length; i++) {
      const [d, t, s] = veh[i], [, pt, ps] = veh[i - 1];
      let note;
      // תבנית אחת — "היה ← נהיה" — גם כשצד אחד "לא מוגדר" (שלמה 07.09, קו 292)
      if (s === UND && ps !== UND) note = `סוג הרכב ברישוי שונה: ${desc(ps, pt)} ← לא מוגדר (המשרד כבר לא קובע לקו סוג רכב)`;
      else if (ps === UND && s !== UND) note = `סוג הרכב ברישוי שונה: לא מוגדר ← ${desc(s, t)} (עד עכשיו המשרד לא קבע לקו סוג רכב)`;
      else if (ps !== s) note = `סוג הרכב ברישוי שונה: ${desc(ps, pt)} ← ${desc(s, t)}`;
      else note = `סוג הקו ברישוי שונה: ${pt || UND} ← ${t || UND} (הרכב: ${desc(s, "")})`;
      evs.push({ d, k: "vehicle", syn: true, stops: [], shp: "", note });
    }
    // · "שינוי סוג הקו" — סוג הקו מרשימת האשכולות של משרד התחבורה (עירוני/אזורי/
    //   בינעירוני) וייחודיות מקובץ הנוסעים (סדיר/תלמידים/לילה/מזינים); lt =
    //   [[תאריך, סוג, ייחודיות, אשכול], …] (tools/linehistory_ltype.py, שלמה 07.09).
    //   ייחודיות ריקה = לא הייתה ידועה אז — לא משווים.
    const UNN = { "קווים מזינים": "מזין" };
    const lt = lf.lt || [];
    for (let i = 1; i < lt.length; i++) {
      const [d, t, u] = lt[i], [, pt, pu] = lt[i - 1], parts = [];
      if (t && pt && t !== pt) parts.push(`סוג הקו ברשימת האשכולות של משרד התחבורה שונה: ${pt} ← ${t}`);
      if (u && pu && u !== pu) parts.push(`ייחודיות הקו בקובץ הנוסעים של המשרד שונתה: ${UNN[pu] || pu} ← ${UNN[u] || u}`);
      if (parts.length) evs.push({ d, k: "ltype", syn: true, stops: [], shp: "", note: parts.join(" · ") });
    }
    // התקופה נגמרת בגרסה הבאה מכל סוג, לא רק ב"וריאנט חדש" (דיווח שלמה 03.09,
    // קו 6 רהט: הסריקה רשמה חזרה כ"שינוי מסלול" בלי אירוע new)
    for (let i = 0; i < real.length; i++) {
      if (real[i].k !== "removed") continue;
      const nx = real[i + 1];
      if (!nx || nx.k === "removed") continue;
      const days = gapDays(real[i].d, nx.d);
      const span = days >= 60 ? Math.round(days / 30.44) + " חודשים" : days + " ימים";
      evs.push({ d: nx.d, k: "returned", syn: true, stops: [], shp: "", src: nx.src,
        note: `הקו לא היה ברישום מ-${fmtD(real[i].d)} עד ${fmtD(nx.d)} (${span}) — ואז חזר לפעול` });
    }
    if (evs.length) {
      lf.versions = [...(lf.versions || []), ...evs]
        .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : (a.syn ? 1 : 0) - (b.syn ? 1 : 0)));
    }
    lf._synMerged = true;
  }
  return lf;
}

function decodeShape(str) {
  const pts = []; let i = 0, la = 0, lo = 0;
  while (i < str.length) {
    for (const which of [0, 1]) {
      let b, shift = 0, result = 0;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = (result & 1) ? ~(result >> 1) : (result >> 1);
      if (which === 0) la += d; else lo += d;
    }
    pts.push([la / 1e5, lo / 1e5]);
  }
  return pts;
}

function fsafe(rd) { return rd.replace(/#/g, "H").replace(/\//g, "_"); }
function fmtD(d) { return (d || "").split("-").reverse().join("."); }
// סיומת התאריכים "(2025-07-10 ← 2025-07-11)" בהערות הסריקה מוסתרת
// בתצוגה (בקשת שלמה): תאריך הביצוע כבר כתוב בכותרת האירוע — זהו
function noteFix(s) {
  if (["שינוי שנמצא בהשוואת שני צילומים זמינים של אותו מק״ט, כיוון וחלופה.", "צילום היסטורי של פרסום משרד התחבורה. מועד התיעוד אינו מועד פתיחת הקו או שינוי המסלול."].includes(String(s || "").trim())) return "";
  return String(s || "").replace(/\s*\(\d{4}-\d{2}-\d{2} ← \d{4}-\d{2}-\d{2}\)/g, "");
}
function fmtM(d) { const p = (d || "").split("-"); return p[1] + "." + p[0]; }
// תקופה: חודש "YYYY-MM" או שנה שלמה "Y:YYYY" (שלמה 22.09: "לפי שנה ולא רק לפי חודש")
const isYear = (m) => typeof m === "string" && m.startsWith("Y:");
const fmtP = (m) => isYear(m) ? "שנת " + m.slice(2) : fmtM(m);
const bP = (m) => isYear(m) ? "בשנת " + m.slice(2) : "ב-" + fmtM(m);   // "בשנת 2025" / "ב-09.2026"
const periodStart = (m) => isYear(m) ? m.slice(2) + "-01-01" : m + "-01";
const periodEnd = (m) => isYear(m) ? m.slice(2) + "-12-31" : m + "-31";
const periodMonths = (m, months) => isYear(m) ? (months || []).filter((x) => x.startsWith(m.slice(2))) : [m];
// טעינת קובצי השינויים של תקופה (חודש אחד או כל חודשי השנה, במקביל) ואיחודם מהחדש לישן
const loadPeriod = (prefix, m, months) => {
  const ms = periodMonths(m, months);
  return Promise.all(ms.map((x) => dfetch("data/changes/" + prefix + x + ".json").then((r) => (r.ok ? r.json() : { changes: [] })).then((d) => d.changes || [])))
    .then((parts) => parts.flat().sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0)));   // תמיד מהחדש לישן — גם חודש בודד, כמו "כל התקופה"
};
function gapDays(a, b) { return Math.round((new Date(b) - new Date(a)) / 864e5); }
// חיפוש סלחני לגרשיים: בנתונים כתוב רשל''צ (שני גרשים) והמשתמש מקליד
// רשל"צ או רשל״צ — כל סימני הגרש/גרשיים מוסרים משני צידי ההשוואה
// מק"ט כמו 21011-1-# מתהפך בטקסט עברי ל-"#-21011-1", כי '#' בסוף רצף ספרות
// נחשב תו ניטרלי ומקבל את כיוון הפסקה (שלמה 07.09). בתצוגה עוזר dir=ltr, אבל
// טקסט שמעתיקים לוואטסאפ מאבד אותו — לכן בתוך הטקסט עצמו יש תווי כיוון
// בלתי-נראים (LRE…PDF) שנוסעים יחד עם ההעתקה ומחזיקים את הסדר בכל מקום.
const rdTxt = (rd) => "\u202A" + String(rd || "") + "\u202C";
// חיפוש: מק"ט שהודבק עם תווי הכיוון האלה חייב עדיין להתאים
const sQ = (t) => String(t || "").replace(/[׳״'"\u200e\u200f\u202a-\u202e\u2066-\u2069]+/g, "");

// Match recorded intermediate towns by exact route identity and service date.
let routeCitiesPromise;
function getRouteCities() {
  if (!routeCitiesPromise) routeCitiesPromise = Promise.all([0, 1].map(i =>
    dfetch("data/route-cities-" + i + ".json").then(r => {
      if (!r.ok) throw new Error("לא ניתן לטעון את ערי התחנות");
      return r.json();
    })
  )).then(parts => ({ epoch: parts[0].epoch, cities: parts[0].cities,
    routes: Object.assign({}, ...parts.map(p => p.routes))
  })).catch(e => { routeCitiesPromise = null; throw e; });
  return routeCitiesPromise;
}
function useRouteCities() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true; setError(false);
    getRouteCities().then(d => { if (live) setData(d); })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [retry]);
  return { data, error, retry: () => setRetry(n => n + 1) };
}
function CitySearchStatus({ state }) {
  return state.error ? <p role="alert">חיפוש לפי תחנות בדרך לא נטען. <button onClick={state.retry}>נסו שוב</button></p>
    : !state.data ? <p role="status">טוען ערים שבהן הקווים עוצרים בדרך…</p> : null;
}
const citySearchNorm = value => sQ(value).replace(/יי/g, "י").replace(/וו/g, "ו").replace(/[-–]/g, " ").replace(/\s+/g, " ").trim();
function citySearchText(data, rd, date) {
  if (!data) return "";
  const day = date ? Math.floor((Date.parse(date) - Date.parse(data.epoch)) / 86400000) : null;
  return (data.routes[rd] || []).filter(([, a, b]) => day === null || (a <= day && (b === null || day < b)))
    .map(([id]) => citySearchNorm(data.cities[id])).join(" | ");
}
function matchesRouteSearch(line, query, data, date, prefix = false) {
  if (line.rd && sQ(query).trim() === sQ(line.rd)) return true;
  const tokens = citySearchNorm(query).split(/\s+/).filter(t => t && t !== "קו");
  if (!tokens.length) return true;
  const base = citySearchNorm((prefix ? [line.dest, line.op] : [line.line, line.rd, line.dest, line.op]).join(" "));
  const towns = citySearchText(data, line.rd, date);
  return tokens.every(t => {
    // A line number must not match random digits inside an archive route ID.
    if (/^\d+[א-ת]?$/.test(t)) return String(line.line || "").startsWith(t) || String(line.rd || "").startsWith(t);
    return base.includes(t) || towns.includes(t) ||
      (prefix && (String(line.line || "").startsWith(t) || String(line.rd || "").startsWith(t)));
  });
}
function routeSearchRank(line, query) {
  const number = citySearchNorm(query).split(/\s+/).find(t => /^\d+[א-ת]?$/.test(t));
  if (!number) return 0;
  const no = String(line.line || "");
  return no === number ? 0 : no.startsWith(number) ? 1 : 2;
}
// קובצי הנתונים מתעדכנים יומית תחת אותה כתובת. חותמת-יום בכתובת החטיאה
// את המטמון פעם ביום גם לקבצים היסטוריים שלא השתנו, ובחלק מהקבצים
// (?v=BUILD בלבד) הוגשה גרסה של אתמול. cache:no-cache מאלץ בדיקת
// טריות מול השרת: קובץ שלא השתנה חוזר 304 זעיר, קובץ שהשתנה מגיע טרי.
const dfetch = (p) => fetch(p + "?v=" + BUILD, { cache: "no-cache" });

// דיוק התאריך נקבע לפי המרווח בין שני צילומי הארכיון שביניהם אותר השינוי.
// בארכיון של 2020 הצילומים יומיים והתאריך מדויק; ב-2017 הם במרחק שבועיים,
// ואז יום מדויק הוא המצאה — במקרה כזה נכתב החודש בלבד. (בקשת המשתמש.)
function evDate(v) {
  const sd = v.sd || (/(\d{4}-\d{2}-\d{2}) ל-(\d{4}-\d{2}-\d{2})/.exec(v.note || "") || [])[1];
  if (!sd || sd === v.d) return { txt: fmtD(v.d), exact: true };
  const g = gapDays(sd, v.d);
  // עד שלושה ימים התאריך נשאר: הוא נכון עד יום-יומיים, וסימון של עשרות
  // אלפי אירועים כ"לא ידוע" בגלל זה היה הופך את הציר לבלתי קריא בלי
  // להוסיף אמת. מעבר לזה היום הוא ניחוש, ואז נכתב החודש בלבד.
  if (g <= 3) return { txt: fmtD(v.d), exact: true,
                       tip: `אותר בין ${fmtD(sd)} ל-${fmtD(v.d)}` };
  if (fmtM(sd) === fmtM(v.d)) return { txt: fmtM(v.d), exact: false, tip: `אותר בין ${fmtD(sd)} ל-${fmtD(v.d)} — ${g} ימים בין צילומי הארכיון, ולכן היום המדויק אינו ידוע` };
  return { txt: `${fmtM(sd)}–${fmtM(v.d)}`, exact: false, tip: `אותר בין ${fmtD(sd)} ל-${fmtD(v.d)} — ${g} ימים בין צילומי הארכיון, ולכן היום המדויק אינו ידוע` };
}
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

/* ---------- איתור הקטעים ששונו בין שתי גאומטריות ----------
   לכל נקודה בגרסה אחת מחשבים את המרחק (במטרים) לקטע הקרוב ביותר בגרסה
   השנייה; רצף נקודות רחוקות = קטע ששונה. עמיד גם כשכל המסלול נדגם מחדש
   בנקודות אחרות (המרחק נשאר ~0 בקטעים שלא זזו באמת). */
function segDiff(cur, prev) {
  if (!cur || cur.length < 2 || !prev || prev.length < 2) return null;
  const ky = 110540, kx = 111320 * Math.cos((cur[0][0] * Math.PI) / 180);
  const M = (p) => [p[1] * kx, p[0] * ky];
  /* דגימה צפופה (כל ~12 מ') של שני השרטוטים לפני ההשוואה: קטע ישר ארוך
     בלי קודקודים באמצע — כמו חציית כיכר בקו ישר — לא נדגם קודם בכלל,
     והתוואי הישן שעבר בתוך הכיכר לא סומן באדום (צילומי שלמה, קו 26,
     צומת ברור חיל וצומת אור הנר). הנקודות הנדגמות יושבות בדיוק על
     הקו המקורי — שום גאומטריה לא מומצאת. */
  function densify(Praw, Pm) {
    const R = [Praw[0]], Q = [Pm[0]];
    for (let i = 1; i < Praw.length; i++) {
      const a = Pm[i - 1], b = Pm[i];
      const n = Math.min(60, Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / 12));
      for (let k = 1; k <= n; k++) {
        const t = k / (n + 1);
        R.push([Praw[i - 1][0] + (Praw[i][0] - Praw[i - 1][0]) * t,
                Praw[i - 1][1] + (Praw[i][1] - Praw[i - 1][1]) * t]);
        Q.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
      R.push(Praw[i]); Q.push(Pm[i]);
    }
    return [R, Q];
  }
  const [cd, A] = densify(cur, cur.map(M));
  const [pd, B] = densify(prev, prev.map(M));
  const CS = 60; // גודל תא הרשת במטרים
  function buildGrid(S) {
    const g = new Map();
    for (let i = 0; i < S.length - 1; i++) {
      const x0 = Math.min(S[i][0], S[i + 1][0]) - 20, x1 = Math.max(S[i][0], S[i + 1][0]) + 20;
      const y0 = Math.min(S[i][1], S[i + 1][1]) - 20, y1 = Math.max(S[i][1], S[i + 1][1]) + 20;
      for (let gx = Math.floor(x0 / CS); gx <= Math.floor(x1 / CS); gx++)
        for (let gy = Math.floor(y0 / CS); gy <= Math.floor(y1 / CS); gy++) {
          const k = gx + ":" + gy;
          if (!g.has(k)) g.set(k, []);
          g.get(k).push(i);
        }
    }
    return g;
  }
  function segd(p, s0, s1) {
    const dx = s1[0] - s0[0], dy = s1[1] - s0[1];
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((p[0] - s0[0]) * dx + (p[1] - s0[1]) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const x = s0[0] + t * dx - p[0], y = s0[1] + t * dy - p[1];
    return Math.sqrt(x * x + y * y);
  }
  function dists(P, S, g) {
    return P.map((p) => {
      const gx = Math.floor(p[0] / CS), gy = Math.floor(p[1] / CS);
      let best = Infinity;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const segs = g.get((gx + dx) + ":" + (gy + dy));
        if (segs) for (const i of segs) { const d = segd(p, S[i], S[i + 1]); if (d < best) best = d; }
      }
      return best;
    });
  }
  function runsIdx(ds, th) {
    const idx = [];
    ds.forEach((d, i) => { if (d > th) idx.push(i); });
    if (!idx.length) return [];
    const out = [];
    let s = idx[0], e = idx[0];
    for (let i = 1; i < idx.length; i++) {
      // גישור הדוק (3 נקודות): גישור רחב הדביק רסיסי-רעש לרצף של מאות
      // מטרים והסימון נראה "בערך" (דיווח שלמה, קו 26 — הכיכר החדשה)
      if (idx[i] - e <= 3) e = idx[i];
      else { out.push([s, e]); s = e = idx[i]; }
    }
    out.push([s, e]);
    return out;
  }
  const gB = buildGrid(B), gA = buildGrid(A);
  const da = dists(A, B, gB), db = dists(B, A, gA);
  // סף מסתגל: שני שרטוטים שדוללו אחרת "רועדים" זה סביב זה לכל האורך,
  // ועם סף קבוע כל המסלול הודגש כאילו הוחלף (דיווח שלמה, קו 26). הסף
  // עולה מעל רעש-הבסיס של ההשוואה כך שרק הסטייה האמיתית מודגשת
  const med = (arr) => {
    const s = [...arr].filter((x) => isFinite(x)).sort((x, y) => x - y);
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  };
  const noise = med(da.concat(db));
  // בלי רף זיהוי (בקשת שלמה: "שלא תהיה הגבלה — שפשוט יסמן את הקטע"):
  // הסף הוא רק דיוק הציור — 5 מ'. כל מקום ששני השרטוטים אינם אותו קו
  // בו מסומן. הרכיב המסתגל מגן רק מצמד שרטוטים ישן ורועד.
  let th = Math.max(5, noise * 2.5 + 3);
  let curRuns = runsIdx(da, th), prevRuns = runsIdx(db, th);
  if (!curRuns.length && !prevRuns.length) {
    th = Math.max(3, noise * 2.5 + 2);
    curRuns = runsIdx(da, th); prevRuns = runsIdx(db, th);
  }
  if (!curRuns.length && !prevRuns.length) return null;
  /* הרחבה עד נקודת האיחוי (בקשת שלמה: "הקטע שמצויר בצבע החלש — שיודגש
     כולו"): רצף שנתפס מעל הסף מתרחב לאורך הקו שלו עד המקום שבו שני
     השרטוטים באמת מתאחדים (מתחת ל-LOW), כך שההדגשה מכסה את כל הקטע
     שנראה נפרד בעין — לא רק את ליבו שחצה את הסף. */
  const LOW = Math.max(3, th - 2);
  const grow = (runs, ds) => {
    const n = ds.length;
    const sep = new Array(n);
    for (let i = 0; i < n; i++) sep[i] = ds[i] > LOW;
    // כשהקו הישן חוצה את החדש המרחק צונח לרגע לאפס — חור של עד 2 דגימות
    // (~24 מ') בנקודת ההצטלבות לא קוטע את הרצף, והזנב שמעבר לה מודגש גם
    for (let i = 1; i < n - 1; i++) {
      if (!sep[i] && sep[i - 1] && (sep[i + 1] || (i + 2 < n && sep[i + 2]))) sep[i] = true;
    }
    const out = [];
    for (let [a, b] of runs) {
      while (a > 0 && sep[a - 1]) a--;
      while (b < n - 1 && sep[b + 1]) b++;
      if (out.length && a <= out[out.length - 1][1] + 3) out[out.length - 1][1] = Math.max(out[out.length - 1][1], b);
      else out.push([a, b]);
    }
    return out;
  };
  curRuns = grow(curRuns, da);
  prevRuns = grow(prevRuns, db);
  /* הסימון מדויק לפי קואורדינטות השרטוטים בלבד (דרישת שלמה, קו 26
     שדרות — "לא לנחש בערך"): לכל קטע ששונה בצד אחד נחתך גם הצד השני
     בדיוק בין ההטלות הגיאומטריות של קצות הקטע על הפוליליין שלו. כך
     האדום עוקב אחרי השרטוט הישן עצמו מנקודת ההתפצלות ועד נקודת
     ההתאחדות, והירוק אחרי החדש — בלי להמציא תוואי ובלי קיטוע. */
  /* קטע-הנגד המדויק: קצות הרצף מוטלים על הפוליליין השני, וכשמסלול
     עובר באותו כביש פעמיים (הלוך-ושוב) יש לכל קצה כמה הטלות אפשריות —
     נבחר צמד ההטלות שממזער את האורך הכלוא ביניהן. בחירה לפי סדר-לאורך-
     הקו כלאה בקו 26 לולאה של 4 ק"מ שקיימת בשני השרטוטים והציגה אותה
     כאילו בוטלה. גם עכשיו: אם האורך הכלוא לא פרופורציונלי לרצף — אין
     תוואי מקביל אמיתי (הארכה מעבר לקצה) ולא ממציאים כלום. */
  const cumOf = (S) => { const c = [0]; for (let i = 1; i < S.length; i++) c.push(c[i - 1] + Math.hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1])); return c; };
  const cumA = cumOf(A), cumB = cumOf(B);
  const lenAt = (c, pos) => { const i = Math.max(0, Math.min(Math.floor(pos), c.length - 2)); return c[i] + (c[i + 1] - c[i]) * (pos - i); };
  function candsOn(q, Sm) {   // אשכולות ההטלות הקרובות (אחד לכל מעבר של הכביש)
    const raw = [];
    let dmin = Infinity;
    for (let i = 0; i < Sm.length - 1; i++) {
      const s0 = Sm[i], s1 = Sm[i + 1];
      const dx = s1[0] - s0[0], dy = s1[1] - s0[1];
      const l2 = dx * dx + dy * dy;
      let t = l2 ? ((q[0] - s0[0]) * dx + (q[1] - s0[1]) * dy) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      const x = s0[0] + t * dx - q[0], y = s0[1] + t * dy - q[1];
      const dd = Math.sqrt(x * x + y * y);
      if (dd < dmin) dmin = dd;
      raw.push({ d: dd, pos: i + t });
    }
    const lim = Math.min(250, Math.max(dmin * 2, dmin + 30));
    const near = raw.filter((c) => c.d <= lim);
    const out = [];
    for (const c of near) {
      if (out.length && c.pos - out[out.length - 1].pos <= 3) {
        if (c.d < out[out.length - 1].d) out[out.length - 1] = { d: c.d, pos: c.pos };
      } else out.push({ d: c.d, pos: c.pos });
    }
    return out;
  }
  const counterIv = (run, Pm, cumP, Sm, cumS) => {
    const a0 = Math.max(0, run[0] - 1), b0 = Math.min(Pm.length - 1, run[1] + 1);
    const c0 = candsOn(Pm[a0], Sm), c1 = candsOn(Pm[b0], Sm);
    const runLen = lenAt(cumP, b0) - lenAt(cumP, a0);
    // הצמד הנבחר: האורך הכלוא הכי דומה לאורך הרצף עצמו (מזעור טהור קרס
    // לאפס כששני הקצוות נפלו על אותה נקודת צומת), עם שובר-שוויון לקרבה
    let best = null;
    for (const u of c0) for (const v of c1) {
      const span = Math.abs(lenAt(cumS, v.pos) - lenAt(cumS, u.pos));
      const score = Math.abs(span - runLen) + (u.d + v.d) * 2;
      if (!best || score < best.score) best = { score, span, lo: Math.min(u.pos, v.pos), hi: Math.max(u.pos, v.pos) };
    }
    if (!best) return null;
    if (best.span > runLen * 3 + 300 || best.span < runLen * 0.15 - 60) return null;
    return [best.lo, best.hi];
  };
  const ivA = curRuns.map(([a, b]) => [Math.max(0, a - 1), Math.min(A.length - 1, b + 1)]);
  const ivB = prevRuns.map(([a, b]) => [Math.max(0, a - 1), Math.min(B.length - 1, b + 1)]);
  for (const r of curRuns) { const iv = counterIv(r, A, cumA, B, cumB); if (iv) ivB.push(iv); }
  for (const r of prevRuns) { const iv = counterIv(r, B, cumB, A, cumA); if (iv) ivA.push(iv); }
  const mergeIv = (iv) => {
    const s = iv.filter(([x, y]) => y - x > 0.05).sort((u, v) => u[0] - v[0]);
    const out = [];
    for (const r of s) {
      if (out.length && r[0] <= out[out.length - 1][1] + 2) out[out.length - 1][1] = Math.max(out[out.length - 1][1], r[1]);
      else out.push([r[0], r[1]]);
    }
    return out;
  };
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const slice = (P, [x0, x1]) => {
    const i0 = Math.floor(x0), i1 = Math.min(Math.floor(x1), P.length - 1);
    const t0 = x0 - i0, t1 = x1 - i1;
    const out = [t0 > 0.001 && i0 < P.length - 1 ? lerp(P[i0], P[i0 + 1], t0) : P[i0]];
    for (let i = i0 + 1; i <= i1; i++) out.push(P[i]);
    if (t1 > 0.001 && i1 < P.length - 1) out.push(lerp(P[i1], P[i1 + 1], t1));
    return out;
  };
  const curSegs = mergeIv(ivA).map((r) => slice(cd, r)).filter((r) => r.length > 1);
  const prevSegs = mergeIv(ivB).map((r) => slice(pd, r)).filter((r) => r.length > 1);
  const derived = curRuns.length && !prevRuns.length ? "prev"
    : prevRuns.length && !curRuns.length ? "cur" : null;
  return { curSegs, prevSegs, derived };
}

/* ---------- מפת לפני/אחרי ---------- */
/* טבלת "לפני / אחרי" ללוח היציאות — לאירועי תדירות/לו"ז שנשמרו עם
   הרשימות המלאות (tl/tn). ריבוי באותה שעה = תגבור, ומוצג כמונה. */
function TimesDiff({ tl, tn }) {
  const [open, setOpen] = useState(true);   // נפתחת מיד עם הלחיצה על האירוע
  const rows = useMemo(() => {
    const cnt = (s) => {
      const c = new Map();
      (s ? s.split(",") : []).forEach((t) => c.set(t, (c.get(t) || 0) + 1));
      return c;
    };
    const a = cnt(tl), b = cnt(tn);
    const times = [...new Set([...a.keys(), ...b.keys()])].sort();
    const out = [], oldOnly = [], newOnly = [];
    times.forEach((t) => {
      const x = a.get(t) || 0, y = b.get(t) || 0;
      if (x > 0 && y > 0) {
        if (x === y) out.push({ key: t, before: x > 1 ? `${t} (${x}×)` : t, cls: "same" });
        else out.push({ key: t, before: `${t} (${x}×)`, after: `${t} (${y}×)`, cls: "changed" });
      } else if (x > 0) oldOnly.push(t);
      else newOnly.push(t);
    });
    // התאמת יציאות שזזו: שעה שירדה מול שעה קרובה שנוספה (עד 20 דק' הפרש)
    const mins = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
    let i = 0, j = 0;
    while (i < oldOnly.length || j < newOnly.length) {
      const o = oldOnly[i], n = newOnly[j];
      if (o != null && n != null && Math.abs(mins(o) - mins(n)) <= 20) {
        out.push({ key: o + n, before: o, after: n, cls: "moved" }); i++; j++;
      } else if (o != null && (n == null || o < n)) {
        out.push({ key: o + "-", before: o, after: "—", cls: "removed" }); i++;
      } else {
        out.push({ key: "-" + n, before: "—", after: n, cls: "added" }); j++;
      }
    }
    out.sort((r, s) => (r.before !== "—" ? r.before : r.after).localeCompare(s.before !== "—" ? s.before : s.after));
    return out;
  }, [tl, tn]);
  const nOld = tl ? tl.split(",").length : 0, nNew = tn ? tn.split(",").length : 0;
  const changed = rows.filter((r) => r.cls !== "same").length;
  return (
    <div className="tdiff">
      <button className="tdiff-btn" aria-expanded={open} onClick={() => setOpen(!open)}
        title="כל היציאות שורה-שורה: השעה לפני מול השעה אחרי; שעה שלא השתנתה מוצגת פעם אחת">
        📊 {open ? "הסתר את" : "הצג את"} טבלת הלפני/אחרי המלאה ({nOld} ← {nNew} יציאות · {changed} השתנו)
      </button>
      {open && (
        <div className="tdiff-wrap">
          <table className="tdiff-tbl">
            <thead><tr><th>לפני</th><th>אחרי</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className={"td-" + r.cls}>
                  {r.cls === "same"
                    ? <td className="num" colSpan={2}>{r.before}</td>
                    : <><td className="num">{r.before}</td><td className="num">{r.after}</td></>}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="tdiff-leg">שורה ממוזגת = היציאה לא השתנתה · כתום = היציאה זזה (השעה הישנה מול החדשה) או תגבור שהשתנה · אדום = יציאה שירדה · ירוק = יציאה שנוספה · 2× = שני אוטובוסים באותה שעה</div>
        </div>
      )}
    </div>
  );
}


// קו מעגלי עוצר באותה תחנה בשני קטעי המסלול — ברשימות ➕/➖ השם הופיע
// פעמיים ונראה כמו באג (קו 114 דן). מאחדים ומציינים ×N במקום לשכפל.
const dedupCount = (arr) => {
  const m = new Map();
  (arr || []).forEach((x) => { const k = typeof x === "string" ? x : x[0] + "|" + x[1]; const e = m.get(k); if (e) e.n += 1; else m.set(k, { x, n: 1 }); });
  return [...m.values()];
};
function DiffMap({ cur, prev, approx, prevApprox, curStops, prevStops, addedCodes, stops12, shape12, remPins, sg, planned, plats }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  // קטעי-שינוי ששולפו מהארכיון (v.sg) — הגאומטריה האמיתית של מה שירד
  // ומה שנוסף גם כשלגרסאות אין שרטוט מלא (בקשת שלמה: רק הקטע ששונה)
  const sgO = useMemo(() => (sg && sg.o ? sg.o.map(decodeShape).filter((r) => r.length > 1) : null), [sg]);
  const sgN = useMemo(() => (sg && sg.n ? sg.n.map(decodeShape).filter((r) => r.length > 1) : null), [sg]);
  // הקטעים ששונו + התחנות ששונו — היעד של מצב "התמקדות" (בקשת המשתמש:
  // בתיקון באג לראות רק את הקטע שהשתנה, לא את כל המסלול).
  // השוואת קטעים רק כששני הצדדים מדויקים — קו מקורב בין תחנות ייתן רעש
  const diff = useMemo(() => (prev && !approx && !prevApprox ? segDiff(cur, prev) : null), [cur, prev, approx, prevApprox]);
  const chStops = useMemo(() => {
    const pts = [];
    const curCodes = new Set((curStops || []).map((s) => s[0]));
    if (addedCodes && (curStops || []).length) {
      pts.push(...(curStops || []).filter((s) => addedCodes.has(s[0])).map((s) => [s[2], s[3]]));
    } else if (prevStops) {
      const prevCodes = new Set((prevStops || []).map((s) => s[0]));
      pts.push(...(curStops || []).filter((s) => !prevCodes.has(s[0])).map((s) => [s[2], s[3]]));
    }
    // גם התחנות שירדו הן חלק מהשינוי — בלעדיהן המיקוד התכווץ לתחנה
    // שנוספה בלבד והשאיר את הירידות מחוץ למסך (דיווח שלמה)
    pts.push(...(prevStops || []).filter((s) => !curCodes.has(s[0])).map((s) => [s[2], s[3]]));
    pts.push(...(remPins || []).map((p) => [p[2], p[3]]));
    return pts;
  }, [curStops, prevStops, addedCodes, remPins]);
  const focusPts = useMemo(() => {
    const pts = [];
    if (diff) { diff.curSegs.forEach((s2) => pts.push(...s2)); diff.prevSegs.forEach((s2) => pts.push(...s2)); }
    (sgO || []).forEach((r) => pts.push(...r));
    (sgN || []).forEach((r) => pts.push(...r));
    pts.push(...chStops);
    return pts;
  }, [diff, chStops, sgO, sgN]);
  const [focus, setFocus] = useState(true);
  const canFocus = focusPts.length > 0;
  useEffect(() => {
    if (!ref.current) return;
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    const map = L.map(ref.current, { scrollWheelZoom: !coarse });
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>', maxZoom: 19,
    }).addTo(map);
    const focused = canFocus && focus;
    const pts12 = (stops12 || []).map((s) => [s[1], s[2]]);
    const pinPts = (remPins || []).map((p) => [p[2], p[3]]);
    const all = focused ? focusPts : cur.concat(prev || []).concat(pts12).concat(shape12 || []).concat(pinPts);
    map.fitBounds(L.latLngBounds(all.length ? all : [[32.08, 34.78]]).pad(focused ? 0.35 : 0.1), { maxZoom: 16 });
    // במצב התמקדות שכבות-הרקע כמעט שקופות: המקווקו האדום העדין שמצויר
    // לאורך כל המסלול נקרא בטעות כ"שינוי לא מסומן" בקטעים שבהם שני
    // השרטוטים זהים והוא מציץ מתחת לירוק (דיווח שלמה)
    if (prev && prev.length > 1) {
      // תוכנית שלא יצאה לפועל: המסלול בפועל הוא רקע אפור, לא "מסלול קודם" אדום
      L.polyline(prev, planned
        ? { color: "#475569", weight: 4, opacity: 0.6 }
        : { color: "#dc2626", weight: focused ? 2 : 4, opacity: focused ? 0.12 : 0.75, dashArray: "8 7" }).addTo(map);
    }
    if (cur.length > 1) {
      L.polyline(cur, planned
        ? { color: "#9f1239", weight: 5, opacity: 0.9, dashArray: "10 8" }   // המסלול שתוכנן ולא נסע — קו מקווקו בין התחנות
        : approx
        ? { color: "#7c3aed", weight: 4, opacity: 0.8, dashArray: "7 9" }   // קו מקורב בין תחנות
        : { color: prev ? "#16a34a" : "#4c1d95", weight: focused ? 3 : 5, opacity: focused ? 0.25 : 0.9 }).addTo(map);
    }
    if (focused && diff && !planned) {
      diff.prevSegs.forEach((s2) => L.polyline(s2, { color: "#dc2626", weight: 6, opacity: 0.95, dashArray: "9 8" }).addTo(map));
      diff.curSegs.forEach((s2) => L.polyline(s2, { color: "#16a34a", weight: 7, opacity: 0.95 }).addTo(map));
    }
    if (!diff && (sgO || sgN)) {
      (sgO || []).forEach((r) => L.polyline(r, { color: "#dc2626", weight: 6, opacity: 0.95, dashArray: "9 8" }).addTo(map));
      (sgN || []).forEach((r) => L.polyline(r, { color: "#16a34a", weight: 7, opacity: 0.95 }).addTo(map));
    }
    // מסלול 2012 — קו חום מקווקו. כשיש מסלול משוער על הכבישים (shape12,
    // tools/shape_2012.py — בקשת שלמה 05.09) הוא מצויר; אחרת קו ישר דרך
    // התחנות שהוצלבו למק"ט (מיקום לפי המאגר של היום)
    if (shape12 && shape12.length > 1) {
      L.polyline(shape12, { color: "#78350f", weight: 4, opacity: 0.8, dashArray: "8 6" }).addTo(map);
    } else if (pts12.length > 1) {
      L.polyline(pts12, { color: "#78350f", weight: 3, opacity: 0.75, dashArray: "3 7" }).addTo(map);
    }
    if (pts12.length) {
      stops12.forEach((s) => {
        L.circleMarker([s[1], s[2]], { radius: 4, color: "#78350f", weight: 2, fillColor: "#fff", fillOpacity: 1 })
          .addTo(map).bindPopup(`<b>${esc(s[0])}</b><br><span class="pst">מסלול 2012</span>` + (s[4] ? `<br><span class="pcode">מק״ט ${esc(String(s[4]))}</span>` : ""), { className: "lh-pop", offset: [0, -4] });
      });
    }
    const curCodes = new Set((curStops || []).map((s) => s[0]));
    const prevCodes = new Set((prevStops || []).map((s) => s[0]));
    // שם התחנה נפתח בחלון קופץ (popup) — הוא מוצמד לעוגן של התחנה והמפה
    // זזה אליו לבד, אז השם תמיד מוצג במקום הנכון גם בקצה המפה ובנייד.
    // האיבר החמישי בתחנה הוא מגבלת עלייה/ירידה מהפיד: אחת מכל תשע עצירות
    // מוגבלת כך, ובשום מקום לא כתוב לנוסע שבתחנה הזו רק מורידים.
    // 1 = אין הורדה (העלאה בלבד), 2 = אין העלאה (הורדה בלבד) — כפי שהצנרת
    // מקודדת (tools/linehistory.py). המיפוי היה הפוך והציג "העלאה בלבד"
    // על תחנות סופיות (דיווח שלמה, תחנה 787)
    const PD = { 1: "איסוף נוסעים בלבד (בלי הורדה)", 2: "הורדת נוסעים בלבד (בלי איסוף)", 3: "לא עוצר לנוסעים" };
    const popHtml = (s, status) =>
      `<b>${esc(s[1])}</b>${status ? `<br><span class="pst">${status}</span>` : ""}` +
      (PD[s[4]] ? `<br><span class="pst">⛔ ${PD[s[4]]}</span>` : "") +
      // הרציף של הווריאנט בתחנה הזו היום (platforms.json) — רק במסופים עם רציפים
      (plats && plats[String(s[0])] ? `<br><span class="pst">🛤️ רציף ${esc(String(plats[String(s[0])]))}</span>` : "") +
      `<br><span class="pcode">מק״ט תחנה ${esc(s[0])}</span>`;
    (curStops || []).forEach((s) => {
      // הגרסה הקודמת עשויה להיות שינוי תדירות בלי רצף תחנות, ואז אין מול מה
      // להשוות. רשימת התחנות שנוספו כבר חושבה בצנרת ונשמרה על הגרסה — היא
      // המקור האמין לסימון, ולא השוואה מול גרסה שאין בה גאומטריה.
      const isNew = addedCodes ? addedCodes.has(s[0]) : (prevStops && !prevCodes.has(s[0]));
      const m = L.circleMarker([s[2], s[3]], {
        radius: isNew ? 8 : 5, color: isNew ? "#fff" : "#4c1d95", weight: 2,
        fillColor: isNew ? "#16a34a" : "#fff", fillOpacity: 1, opacity: focused && !isNew ? 0.4 : 1,
      }).addTo(map)
        .bindPopup(popHtml(s, isNew ? "🟢 תחנה שנוספה בגרסה זו" : ""), { className: "lh-pop", offset: [0, -4] });
      // שם התחנה מוצג רק בלחיצה (popup צמוד לתחנה) — תוויות ריחוף בוטלו
      // לגמרי: הן נתקעו פתוחות והציגו שם כפול/ישן במקום אחר על המפה
    });
    (prevStops || []).forEach((s) => {
      if (curCodes.has(s[0])) return;
      const m = L.circleMarker([s[2], s[3]], { radius: 8, color: "#dc2626", weight: 3, fillColor: "#fff", fillOpacity: 1 })
        .addTo(map)
        .bindPopup(popHtml(s, "🔴 תחנה שירדה מהקו בגרסה זו"), { className: "lh-pop", offset: [0, -4] });
    });
    // תחנות שירדו שאינן באף רשימה בקובץ (הצנרת פענחה מק"ט+מיקום מצילום
    // הארכיון, v.nc) — בלעדיהן התחנה שירדה פשוט לא הופיעה במפה
    (remPins || []).forEach((p) => {
      if (curCodes.has(p[0]) || prevCodes.has(p[0])) return;
      L.circleMarker([p[2], p[3]], { radius: 8, color: "#dc2626", weight: 3, fillColor: "#fff", fillOpacity: 1 })
        .addTo(map)
        .bindPopup(popHtml([p[0], p[1]], "🔴 תחנה שירדה מהקו בגרסה זו"), { className: "lh-pop", offset: [0, -4] });
    });
    return () => { mapRef.current = null; map.remove(); };
  }, [cur, prev, curStops, prevStops, addedCodes, focus, diff, chStops, focusPts, canFocus, stops12, shape12, remPins, sgO, sgN, plats]);
  // סיכום טקסטואלי למי שלא רואה את המפה — המספרים כבר מחושבים ממילא
  const nAdd = (curStops || []).filter((s) => addedCodes && addedCodes.has(s[0])).length;
  const curC = new Set((curStops || []).map((s) => s[0]));
  const nRem = (prevStops || []).filter((s) => !curC.has(s[0])).length;
  const mapLabel = "מפת המסלול" + (prev ? " בהשוואה לגרסה הקודמת" : "") +
    (nAdd ? " · " + nAdd + " תחנות נוספו" : "") + (nRem ? " · " + nRem + " תחנות ירדו" : "");
  return (
    <div className="mapwrap">
      <div className="map" ref={ref} role="img" aria-label={mapLabel} />
      {canFocus && (
        <button className="focusbtn" title="החלפה בין תצוגת כל המסלול לבין התקרבות רק לקטע שבו היה השינוי" onClick={() => setFocus(!focus)}>
          {focus ? "🗺️ כל המסלול" : "🔍 רק הקטע ששונה"}
        </button>
      )}
      {/* כשרק צד אחד חרג מהסף (תיקון שרטוט קטן) — הצד השני הוא חיתוך
          מדויק של השרטוט שלו בין נקודות ההתפצלות; וכשהתוואי הישן עבר
          צמוד (כיכר חדשה בקו 26 — הקו הישן משיק לה) אין בכלל מה לסמן
          באדום, ואומרים את זה במקום להמציא קטע (דרישת שלמה) */}
      {diff && diff.derived === "prev" && diff.prevSegs.length > 0 && (
        <div className="mut">ℹ️ הקטע האדום מסמן את התוואי הישן במקום שבו השרטוט תוקן — חתוך מהשרטוט הישן עצמו, בדיוק בין נקודות ההתפצלות מהתוואי החדש; הירוק הוא התיקון.</div>
      )}
      {diff && diff.derived === "prev" && diff.prevSegs.length === 0 && (
        <div className="mut">ℹ️ כאן נוסף תוואי חדש (הירוק) — התוואי הישן במקום שבו השרטוט תוקן עבר צמוד לחדש, בלי סטייה משלו, ולכן אין קטע אדום.</div>
      )}
      {diff && diff.derived === "cur" && diff.curSegs.length > 0 && (
        <div className="mut">ℹ️ הקטע הירוק מסמן את התוואי החדש במקום שבו השרטוט תוקן — חתוך מהשרטוט החדש עצמו, בדיוק בין נקודות ההתפצלות מהתוואי הישן; האדום הוא מה שירד.</div>
      )}
      {diff && diff.derived === "cur" && diff.curSegs.length === 0 && (
        <div className="mut">ℹ️ כאן ירד תוואי (האדום) — התוואי החדש במקום שבו השרטוט תוקן עובר צמוד לישן, בלי סטייה משלו, ולכן אין קטע ירוק.</div>
      )}
      {diff && !diff.prevSegs.length && !diff.curSegs.length && (
        <div className="mut">ℹ️ שני השרטוטים כמעט חופפים (ההבדל קטן מעשרות מטרים) — לכן אין קטע אדום או ירוק מודגש; הקו האדום המקווקו מסתתר מתחת לירוק.</div>
      )}
    </div>
  );
}

/* שורת קו כקישור אמיתי: קליק רגיל נשאר בתוך האפליקציה, Ctrl/קליק־אמצעי
   פותחים את דף הקו בכרטיסייה חדשה (לכל קו יש כתובת משלו אחרי ה-#) */
const lineHref = (r) => "#" + encodeURIComponent(r);
// לקו יש כתובת משלו ולתחנה לא הייתה — אי אפשר היה לשלוח למישהו שינוי
// בתחנה מסוימת, רק להעתיק לו טקסט. ‎#stop=<מק"ט>‎ פותח את התחנה עם כל
// קורות החיים שלה.
const stopHref = (c) => "#stop=" + encodeURIComponent(c);
const plainClick = (e) => !(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey);

/* תגית עם הסבר שנפתח בהקשה: title מוצג רק בריחוף עכבר, ובטלפון אין
   ריחוף — רוב הקהל לא ראה את ההסברים האלה מעולם. הקשה על התגית פותחת
   את אותו הסבר כשורה קטנה מתחתיה, והקשה נוספת סוגרת. */
function TipTag({ cls, tip, children }) {
  const [open, setOpen] = useState(false);
  // כשאותו רכיב מקבל הסבר אחר (החלפת חודש/סינון עם key זהה) — ההסבר
  // הפתוח נסגר, אחרת הוא נשאר "תקוע" ליד תוכן שכבר התחלף
  useEffect(() => { setOpen(false); }, [tip]);
  return (
    <>
      <span className={(cls || "") + " tiptag"} title={tip} role="button" tabIndex={0}
        aria-expanded={open}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setOpen(!open); } }}>
        {children}</span>
      {open && <span className="tipnote" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>ℹ️ {tip}</span>}
    </>
  );
}

/* הודעת כשל רשת אחידה עם כפתור ניסיון חוזר — במקום "אין נתונים" מטעה */
function NetErr({ onRetry }) {
  return (
    <div className="empty">📡 הנתונים לא ירדו — כנראה תקלת רשת רגעית.{" "}
      <button className="morebtn" onClick={onRetry}>↻ נסו שוב</button></div>
  );
}

/* חיפוש שנשמר בין ניווטים: חזרה מעמוד קו לא מוחקת את מה שהוקלד */
function usePersistedQ(key) {
  const [q, setQ] = useState(() => { try { return sessionStorage.getItem(key) || ""; } catch (e) { return ""; } });
  useEffect(() => { try { sessionStorage.setItem(key, q); } catch (e) { /* דפדפן חוסם אחסון */ } }, [key, q]);
  return [q, setQ];
}
// ערך שמתעדכן רק אחרי הפסקה בהקלדה: הסינון של "כל התקופה" בטאב התחנות מרנדר
// מאות שורות, וכל תו הריץ אותו מחדש — בטלפון זה איטי (שלמה 06.09)
function useDebounced(v, ms) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

/* עוגן 2012: rd -> תקציר המסלול דאז (נטען פעם אחת לכל הדפדוף) */
let ANC2012 = null;
let ANC_SET = new Set();   // המק"טים שהוצלבו — לסינון "2012" בחיפוש
/* months.json נטען פעם אחת לביקור: שלוש קומפוננטות (מסך הבית, הפיד
   היומי וטאב התחנות) ביקשו אותו כל אחת בנפרד. כשל מנקה את המטמון כדי
   שכפתור "נסו שוב" באמת ינסה שוב. */
let MONTHS_P = null;
const getMonths = () => MONTHS_P || (MONTHS_P = dfetch("data/months.json")
  .then((r) => r.json())
  .catch((e) => { MONTHS_P = null; throw e; }));

/* רציפים (platforms.json v2, tools/platforms.py — נכתב בכל ריצה יומית מהשורות
   של הרציפים בקובץ התחנות של המשרד): st — לכל מק"ט הרציפים שיש בהם נסיעות
   בתוקף ומי עוצר בכל אחד; rd — לכל וריאנט הרציף שלו בכל תחנה. נטען פעם אחת;
   כשל או קובץ ישן = בלי רציפים, בלי לשבור את הדף. */
let PLAT_P = null;
const getPlatforms = () => PLAT_P || (PLAT_P = dfetch("data/platforms.json")
  .then((r) => (r.ok ? r.json() : null))
  .then((d) => (d && d.v === 2 ? d : { st: {}, rd: {} }))
  .catch(() => ({ st: {}, rd: {} })));
function usePlatforms() {
  const [p, setP] = useState(null);
  useEffect(() => { let on = true; getPlatforms().then((d) => { if (on) setP(d); }); return () => { on = false; }; }, []);
  return p;
}
const platKey = (p) => (/^\d+$/.test(p) ? [0, parseInt(p, 10)] : [1, p]);
const platSort = (a, b) => { const x = platKey(a), y = platKey(b); return x[0] - y[0] || (x[0] === 0 ? x[1] - y[1] : String(x[1]).localeCompare(String(y[1]))); };

const getAnchors2012 = () =>
  ANC2012 || (ANC2012 = dfetch("data/anchor-2012.json")
    .then((r) => (r.ok ? r.json() : { anchors: {} }))
    .then((d) => { ANC_SET = new Set(Object.keys(d.anchors || {})); return d; })
    .catch(() => ({ anchors: {} })));

/* ---------- עמוד קו ---------- */
/* ---------- השוואה בין חלופות ---------- */
// עד עכשיו אפשר היה להשוות גרסה של קו לגרסה קודמת שלו, אבל לא חלופה
// לחלופה: מי שרצה לדעת במה כיוון 1 שונה מכיוון 2, או ה"ראשית" מהחלופה,
// היה צריך לפתוח שני עמודים ולהחזיק את שתי הרשימות בראש.
function AltCompare({ rd, altRd, label, onClose }) {
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);
  useEffect(() => {
    let ok = true;
    setA(null); setB(null);
    // אותה כתובת בדיוק כמו בעמוד הקו — אחרת אותו קובץ ירד פעמיים תחת
    // שתי חותמות שונות, ובמקרה גרוע חצי מסך הציג נתונים של אתמול
    const get = (r) => dfetch("data/lines/" + fsafe(r) + ".json")
      .then((x) => (x.ok ? x.json() : null)).then(materializeLf);
    get(rd).then((d) => ok && setA(d)).catch(() => ok && setA(false));
    get(altRd).then((d) => ok && setB(d)).catch(() => ok && setB(false));
    return () => { ok = false; };
  }, [rd, altRd]);
  if (a === null || b === null) return <div className="altcmp">טוען…</div>;
  if (!a || !b) return <div className="altcmp">אחת החלופות לא נטענה.</div>;
  // המצב הנוכחי של כל חלופה: הגרסה האחרונה שיש בה רצף תחנות
  const last = (lf) => {
    const vs = (lf.versions || []).filter((v) => (v.stops || []).length);
    return vs[vs.length - 1] || null;
  };
  const va = last(a), vb = last(b);
  if (!va || !vb) return <div className="altcmp">לאחת החלופות אין רצף תחנות מתועד.</div>;
  const ca = va.stops.map((x) => x[0]), cb = vb.stops.map((x) => x[0]);
  const sa = new Set(ca), sb = new Set(cb);
  const onlyA = va.stops.filter((x) => !sb.has(x[0]));
  const onlyB = vb.stops.filter((x) => !sa.has(x[0]));
  const both = ca.filter((x) => sb.has(x)).length;
  const same = ca.length === cb.length && ca.every((x, i) => x === cb[i]);
  return (
    <div className="altcmp">
      <div className="altcmphead">
        <b>השוואת חלופות</b> · {a.dest || rd} <span className="mut">מול</span> {label}
        <button className="cmpx" onClick={onClose}>✕ סיום</button>
      </div>
      <div className="altstat">
        <span>{both.toLocaleString()} תחנות משותפות</span>
        <span className="onlya">{onlyA.length.toLocaleString()} רק כאן</span>
        <span className="onlyb">{onlyB.length.toLocaleString()} רק בחלופה השנייה</span>
        <span className="mut">{fmtD(va.d)} מול {fmtD(vb.d)}</span>
      </div>
      {same && <div className="mut">רצף התחנות זהה בשתיהן — ההבדל הוא בכיוון הנסיעה בלבד.</div>}
      <DiffMap cur={decodeShape(va.shp || "")} prev={decodeShape(vb.shp || "")}
        approx={!va.shp} prevApprox={!vb.shp} curStops={va.stops} prevStops={vb.stops} />
      <div className="legend">
        <span><i style={{ borderColor: "#4c1d95" }} /> החלופה הפתוחה</span>
        <span><i style={{ borderColor: "#16a34a" }} /> החלופה להשוואה</span>
      </div>
      {(onlyA.length > 0 || onlyB.length > 0) && (
        <div className="cmplist">
          {onlyA.length > 0 && <div className="ad">רק כאן: {onlyA.map((x) => `${x[1]} (${x[0]})`).join(", ")}</div>}
          {onlyB.length > 0 && <div className="rm">רק בחלופה השנייה: {onlyB.map((x) => `${x[1]} (${x[0]})`).join(", ")}</div>}
        </div>
      )}
    </div>
  );
}

/* טבלת הלו"ז המלא של החלופה (בקשת שלמה): כל שעות היציאה לפי יום,
   מפרסום הרישוי של 10 הימים הקרובים — אותו קובץ שמזין את מעקב
   התגבורים, ולכן שעה שמתוכננים בה 2+ אוטובוסים מסומנת בה במפורש.
   יושבת בכרטיס הצד ולכן מוצגת בכל גרסה שנבחרת — גם שינוי מסלול
   וכל שינוי שאינו שינוי לו"ז. */
const SCHED_DAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
const SCHED_LBL = { "א": "ראשון", "ב": "שני", "ג": "שלישי", "ד": "רביעי", "ה": "חמישי", "ו": "שישי", "ש": "שבת" };
// היום בשבוע שאירוע לו"ז נגע בו — נשלף מנוסח ההערה ("ימי ראשון" / "שבת")
const schedDayOf = (note) => {
  const m = /\((?:ימי )?([א-ת]+)/.exec(note || "");
  return { "ראשון": "א", "שני": "ב", "שלישי": "ג", "רביעי": "ד",
           "חמישי": "ה", "שישי": "ו", "שבת": "ש" }[m && m[1]] || null;
};
function SchedBox({ rd, vs, selD, isLast }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    let ok = true;
    setD(null);
    dfetch("data/sched/" + fsafe(rd).slice(0, 2) + ".json")
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((j) => { if (ok) setD(j.lines && j.lines[rd] ? { g: j.g, days: j.lines[rd] } : false); })
      .catch(() => { if (ok) setD(false); });
    return () => { ok = false; };
  }, [rd]);
  // אין לו"ז לשבוע הקרוב = החלופה אינה פעילה כרגע — וזה נאמר, לא נשתק (שלמה 07.09:
  // "פעיל" הוא רק מי שיש לו לו"ז לשבוע הקרוב). קו שכבר מסומן מבוטל לא צריך את זה.
  if (d === false) {
    const real = (vs || []).filter((v) => !v.syn && v.k !== "planned-dropped");
    if (real.length && real[real.length - 1].k === "removed") return null;
    return <div className="gapwarn">⏸️ אין לחלופה הזו לו״ז לשבוע הקרוב (לפי פרסום הרישוי ל-10 הימים הקרובים) — היא אינה פעילה כרגע.</div>;
  }
  if (!d) return null;
  // הלו"ז של אז (בקשת שלמה): כשנבחרה גרסה ישנה משחזרים אחורה מהלו"ז של
  // היום — כל אירוע לו"ז שמאוחר מהגרסה מוחזר לשעות הישנות שלו (tl).
  // מהחדש לישן, כך שהאירוע הקרוב ביותר לגרסה קובע אחרון = המצב בזמנה.
  const past = !isLast && selD;
  let days = d.days, touched = new Set();
  if (past) {
    days = {};
    for (const b of SCHED_DAYS) days[b] = (d.days[b] || []).map((t) => Array.isArray(t) ? t[0] : t);
    (vs || []).filter((v) => (v.k === "sched" || v.k === "freq") && v.tl != null && v.d > selD)
      .sort((a, b) => b.d.localeCompare(a.d))
      .forEach((v) => {
        const L = schedDayOf(v.note);
        if (L) { days[L] = String(v.tl || "").split(",").map((s) => s.trim()).filter(Boolean); touched.add(L); }
      });
    // רק מה שתועד באמת: ימים שלא תועד בהם שינוי לו"ז מאז — אין מידע על אותה תקופה,
    // ולא "כנראה כמו היום" (שלמה 13.09). כשאין שום יום כזה — הלו"ז לא מוצג בכלל.
    for (const b of SCHED_DAYS) if (!touched.has(b)) days[b] = [];
  }
  if (past && !touched.size) return null;
  const hasTb = !past && SCHED_DAYS.some((b) => (days[b] || []).some((t) => Array.isArray(t)));
  return (
    <details className="schedbox">
      <summary>🕐 {past ? `הלו"ז כפי שהיה בגרסת ${selD.split("-").reverse().join(".")}` : 'הלו"ז המלא של החלופה — כל שעות היציאה'}{hasTb ? " · יש תגבורים" : ""}</summary>
      <div className="schednote">
        {/* ההערה על השחזור לא הובנה (שלמה 07.09: "מה ההערה המוזרה הזו?") — עכשיו
            במילים פשוטות, ובלי לדבר על ✱ כשאין אף יום כזה בטבלה */}
        {past ? <>
          מוצגות רק השעות שתועדו: בימים עם ✱ נרשם שינוי לו"ז אחרי הגרסה הזו, ולכן
          אלה השעות שהיו לפני השינוי.
          {SCHED_DAYS.some((b) => !touched.has(b)) ? " בשאר הימים אין מידע על הלו\"ז בתאריך המבוקש." : ""}
        </> : <>
          מפרסום הרישוי ל-10 הימים הקרובים (נכון ל-{d.g.split("-").reverse().join(".")}) —
          זה הלו"ז הנוכחי.
          {/* ההסבר על ×N רק כשיש באמת שעה כזאת בלו"ז (שלמה 06.09) */}
          {hasTb ? <> שעה מודגשת עם ×N פירושה ש-N אוטובוסים יוצאים באותה שעה (תגבור).</> : null}
        </>}
      </div>
      <table className="schedtbl"><tbody>
        {(() => {
          // ימים עם אותו לו"ז בדיוק מתאחדים לשורה אחת, גם כשאינם עוקבים:
          // "ראשון–חמישי", "ראשון וחמישי", "ראשון–שלישי וחמישי" (שלמה 06.09)
          const groups = new Map();
          for (const b of SCHED_DAYS) {
            const ts = days[b] || [];
            if (!ts.length) continue;
            const key = JSON.stringify(ts);
            if (!groups.has(key)) groups.set(key, { ts, days: [] });
            groups.get(key).days.push(b);
          }
          const rows = [...groups.values()];
          const lbl = (ds) => {
            const items = [];
            for (let i = 0; i < ds.length;) {
              let j = i;
              while (j + 1 < ds.length && SCHED_DAYS.indexOf(ds[j + 1]) === SCHED_DAYS.indexOf(ds[j]) + 1) j++;
              if (j - i >= 2) items.push(SCHED_LBL[ds[i]] + "–" + SCHED_LBL[ds[j]]);
              else for (let k = i; k <= j; k++) items.push(SCHED_LBL[ds[k]]);
              i = j + 1;
            }
            return items.length === 1 ? items[0] : items.slice(0, -1).join(", ") + " ו" + items[items.length - 1];
          };
          return rows.map((r) => (
            <tr key={r.days.join("")}>
              <th>{lbl(r.days)}{past && r.days.some((b) => touched.has(b)) ? " ✱" : ""}</th>
              <td>{r.ts.map((t, i) => Array.isArray(t)
                ? <span key={i} className="tchip tb" title={`${t[1]} אוטובוסים יוצאים בשעה זו (תגבור)`}>{t[0]} ×{t[1]}</span>
                : <span key={i} className="tchip">{t}</span>)}</td>
            </tr>
          ));
        })()}
      </tbody></table>
    </details>
  );
}

// --- התראות דפדפן (OneSignal) — פעיל רק כשמזהה האפליקציה מוזן ב-index.html ---
const PUSH_ON = typeof window !== "undefined" && !!window.KB_ONESIGNAL_APP_ID;
// תג עיר: מפתחות תגים חייבים להיות ASCII — האש יציב של שם העיר (djb2→base36),
// זהה לחישוב בצד השולח (tools/send_push.py)
const cityTag = (name) => { let h = 5381; const s = String(name || "").trim(); for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return "c" + h.toString(36); };
// מצב ההתראות בדפדפן הזה (שלמה 07.09: "כל פעם שואל אישור ולא מגיעה הודעה"):
// באייפון התראות עובדות רק מהאתר שנוסף למסך הבית; דפדפן שחסם — צריך לפתוח
// בהגדרות האתר. ההרשאה מתבקשת רק כשאין, והמנוי מופעל אם כבה.
const pushSupport = () => {
  try {
    const ua = navigator.userAgent || "";
    const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
    if (ios && !standalone) return { ok: false, why: "באייפון ובאייפד התראות עובדות רק אחרי שמוסיפים את האתר למסך הבית (כפתור השיתוף ← \"הוסף למסך הבית\"), פותחים אותו משם ונרשמים שוב" };
    if (!("Notification" in window) || !("PushManager" in window)) return { ok: false, why: "הדפדפן הזה לא תומך בהתראות. בכרום, סמסונג אינטרנט או פיירפוקס זה עובד" };
    if (Notification.permission === "denied") return { ok: false, why: "הדפדפן חוסם התראות מהאתר. לאפשר: לחיצה על סמל המנעול ליד הכתובת ← התראות ← אפשר, ואז להירשם שוב" };
  } catch (e) { /* ignore */ }
  return { ok: true };
};
async function ensurePush(OS) {
  const sup = pushSupport();
  if (!sup.ok) return sup;
  if (!OS.Notifications.permission) await OS.Notifications.requestPermission();
  if (!OS.Notifications.permission) return { ok: false, why: "ההרשאה להתראות לא אושרה. כשהדפדפן שואל — \"אפשר\", לא לסגור את השאלה" };
  const ps = OS.User.PushSubscription;
  if (ps && ps.optedIn === false) await ps.optIn();
  if (!(ps && ps.id)) return { ok: false, why: "הדפדפן לא יצר מנוי להתראות (בברייב: להדליק \"Use Google services for push messaging\" בהגדרות)" };
  return { ok: true, id: ps.id };
}
// אימות מול השרת של ספק ההתראות ותיקון ישיר — בלי לסמוך על תור הפעולות של
// ה-SDK בדפדפן. אצל שלמה (07.09) המנוי נוצר, הדף הראה "✓ נשמר — 5 ערים",
// ובשרת לא נרשם אף תג. הנתיבים כאן הם אותם נתיבים שה-SDK עצמו קורא מהדפדפן
// (מזהה האפליקציה בלבד, בלי מפתח). מחזיר {have, fixed, ok} או {err}.
const TAG_RE = /^(kb|c[0-9a-z]+|l\d+|freq|kg_\w+)$/;
async function syncServer(OS, want) {
  const sub = OS.User && OS.User.PushSubscription && OS.User.PushSubscription.id;
  if (!sub) return { err: "אין מנוי בדפדפן הזה" };
  const api = "https://api.onesignal.com/apps/" + window.KB_ONESIGNAL_APP_ID;
  const j = async (path, opt, hdr) => {
    const r = await fetch(api + path, { ...(opt || {}), headers: { "content-type": "application/json", ...(hdr ? { "OneSignal-Subscription-Id": sub } : {}) } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  };
  const jj = async (path, opt) => { try { return await j(path, opt, true); } catch (e) { return j(path, opt, false); } };
  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
  try {
    let idn = null;
    for (let i = 0; i < 3 && !(idn && idn.identity && idn.identity.onesignal_id); i++) {
      if (i) await wait(3000);
      try { idn = await jj("/subscriptions/" + sub + "/user/identity"); } catch (e) { idn = null; }
    }
    const oid = idn && idn.identity && idn.identity.onesignal_id;
    if (!oid) return { err: "המנוי עדיין לא מוכר בשרת — נסו שוב בעוד רגע" };
    const tagsOf = (u) => ((u && u.properties && u.properties.tags) || {});
    const diff = (h) => {
      const d = {};
      for (const k in want) if (h[k] !== want[k]) d[k] = want[k];
      for (const k in h) if (h[k] !== "" && !(k in want) && TAG_RE.test(k)) d[k] = "";   // "" = מחיקת תג
      return d;
    };
    let have = tagsOf(await jj("/users/by/onesignal_id/" + oid));
    let d = diff(have), fixed = false;
    if (Object.keys(d).length) {
      await jj("/users/by/onesignal_id/" + oid, { method: "PATCH", body: JSON.stringify({ properties: { tags: d } }) });
      have = tagsOf(await jj("/users/by/onesignal_id/" + oid));
      fixed = true; d = diff(have);
    }
    return { have, fixed, ok: !Object.keys(d).length };
  } catch (e) { return { err: (e && e.message) || String(e) }; }
}
// מצב לתצוגה: {loading, ok, why, id, srv}. כשהכול תקין — התגים מהדפדפן הזה
// נשלחים שוב לספק (resync) ומאומתים מול השרת (שלמה 07.09)
function readPushState(cb, resync) {
  const sup = pushSupport();
  if (!sup.ok) { cb({ ...sup, loading: false }); return; }
  let got = false;
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (OS) => {
    got = true;
    try {
      const ps = OS.User.PushSubscription;
      const ok = !!OS.Notifications.permission && !!(ps && ps.optedIn !== false && ps.id);
      if (resync && Object.keys(resync).length) {
        try {
          // הספק ישקף בדיוק את מה שנשמר בדפדפן הזה: תגים ישנים (עיר שהוסרה,
          // תדירות קודמת) נמחקים, כל השאר נשלחים שוב. גם כשההרשאה עוד לא
          // אושרה — התגים מחכים אצל הספק ותופסים ברגע שהמנוי נפתח (שלמה 07.09:
          // נמצא מנוי בלי שום תג למרות חמש ערים שמורות)
          const cur = (await OS.User.getTags()) || {};
          const stale = Object.keys(cur).filter((k) => !(k in resync) && TAG_RE.test(k));
          if (stale.length) OS.User.removeTags(stale);
          OS.User.addTags(resync);
        } catch (e) { /* ignore */ }
      }
      const st = { loading: false, ok, id: ps && ps.id, why: ok ? "" : (!OS.Notifications.permission ? "עוד לא אושרה הרשאה להתראות בדפדפן הזה — לחצו \"הפעלת התראות\" ואשרו" : "המנוי כבוי — לחצו \"הפעלת התראות\"") };
      cb(st);
      // גם בפתיחת המרכז (לא רק בשמירה): "בודק מול השרת…" נשאר תקוע עד ששמרו (שלמה 13.09)
      if (ps && ps.id && resync) cb({ ...st, srv: Object.keys(resync).length ? await syncServer(OS, resync) : { have: {}, ok: true, fixed: false, empty: true } });
    } catch (e) { cb({ loading: false, ok: false, why: "שירות ההתראות לא נטען (חוסם פרסומות?)" }); }
  });
  setTimeout(() => { if (!got) cb({ loading: false, ok: false, why: "שירות ההתראות לא נטען (חוסם פרסומות או חוסם תוכן בדפדפן)" }); }, 8000);
}
// כל ההרשמה של הדפדפן הזה בתג אחד. ספק ההתראות מגביל את מספר התגים למשתמש,
// ועם תג לכל עיר ההרשמה של שלמה (5 ערים + תדירות + 4 סוגים = 10 תגים) נדחתה
// ב-409 בלי שנשמר כלום (07.09). kb = "f=<תדירות>|g=<סוגים>|c=<ערי המרכז>|
// w=<ערים מכפתור עקוב>|l=<מק"טים>" — הערים כתגים מגובבים כמו קודם; הצד השולח
// (tools/send_push.py, parse_sub) קורא את אותו מבנה.
function savedTags() {
  const parts = [];
  try {
    const n = JSON.parse(localStorage.kbNotify || "{}");
    const cl = n.cities || (n.city ? [n.city] : []);
    if (cl.length) {
      parts.push("f=" + (n.freq || "1"));
      parts.push("g=" + (n.gs || KIND_GROUPS_N.map((g) => g.tag)).map((g) => String(g).replace(/^kg_/, "")).join(","));
      parts.push("c=" + cl.slice(0, 40).map(cityTag).join(","));
    }
  } catch (e) { /* ignore */ }
  try {
    const m = JSON.parse(localStorage.kbFollow || "{}");
    const w = Object.keys(m).filter((k) => /^c[0-9a-z]+$/.test(k)), l = Object.keys(m).filter((k) => /^l\d+$/.test(k)).map((k) => k.slice(1));
    if (w.length) parts.push("w=" + w.slice(0, 40).join(","));
    if (l.length) parts.push("l=" + l.slice(0, 60).join(","));
  } catch (e) { /* ignore */ }
  return parts.length ? { kb: parts.join("|") } : {};
}
// שולח לספק את מה שנשמר בדפדפן הזה, או מוחק את התג כשאין הרשמה
const pushTags = (done) => { const t = savedTags(); osTags(Object.keys(t).length ? t : { kb: null }, done); };
function FollowBtn({ tag, label, title }) {
  const [on, setOn] = useState(() => { try { return !!JSON.parse(localStorage.kbFollow || "{}")[tag]; } catch (e) { return false; } });
  const [st, setSt] = useState("");
  if (!PUSH_ON) return null;
  const toggle = () => {
    const n = !on; setOn(n); setSt("");
    try { const m = JSON.parse(localStorage.kbFollow || "{}"); if (n) m[tag] = label || "מעקב"; else delete m[tag]; localStorage.kbFollow = JSON.stringify(m); } catch (e) {}
    pushTags((r) => setSt(n ? (r.ok ? (r.srv ? (r.srv.ok ? "✓ עוקב — רשום אצל ספק ההתראות" : "✗ לא נרשם אצל ספק ההתראות" + (r.srv.err ? ": " + r.srv.err : "")) : "✓ ההתראות פעילות בדפדפן הזה") : "✗ " + r.why) : ""));
  };
  return <><button className="sharebtn" title={title || "התראת דפדפן כשנרשם שינוי מהותי (מסלול, תחנות, ביטול — לא לו\u05f4ז)"}
    onClick={toggle}>{on ? "🔔 עוקב ✓" : "🔔 " + (label || "קבל התראות")}</button>
    {st && <small style={{ color: st[0] === "✓" ? "#166534" : "#b91c1c", fontWeight: 700, maxWidth: 380, display: "inline-block", marginInlineStart: 6 }}>{st}</small>}</>;
}
// ערי הקצה מהיעד ("מוצא-עיר<->יעד-עיר") — למעקב ברמת עיר
const destCities = (dest) => {
  // העיר = המקטע העברי האחרון; סיומות טכניות ("2#") מדולגות — זהה לצד השולח
  const out = [];
  String(dest || "").split("<->").forEach((side) => {
    const parts = side.trim().split("-");
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i].trim();
      if (p.length >= 2 && !p.includes("#") && /[א-ת]/.test(p) && !/[0-9]/.test(p)) {
        if (!out.includes(p)) out.push(p);
        break;
      }
    }
  });
  return out.slice(0, 2);
};

// הגדרת תגים בבת אחת — הרשאה מתבקשת רק אם אין; done(r) מקבל {ok, why, id}
const osTags = (map, done) => {
  const sup = pushSupport();
  if (!sup.ok) { if (done) done(sup); return; }
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (OS) => {
    let r;
    try {
      r = await ensurePush(OS);
      // התגים נשמרים גם בלי מנוי פעיל — כדי שיחזיקו כשההרשאה תאושר
      const add = {}, rem = [];
      for (const k in map) { if (map[k] == null) rem.push(k); else add[k] = map[k]; }
      if (Object.keys(add).length) OS.User.addTags(add);
      if (rem.length) OS.User.removeTags(rem);
    } catch (e) { r = { ok: false, why: "שגיאה בהרשמה: " + (e && e.message ? e.message : e) }; }
    if (done) done(r);
    // אימות מול השרת ותיקון ישיר: מה שנשמר בדפדפן הזה הוא האמת
    if (r && r.id) { try { const srv = await syncServer(OS, savedTags()); if (done) done({ ...r, srv }); } catch (e) { /* ignore */ } }
  });
};
// שם עיר כפי שהוא בקבצי הקווים — "קריית מלאכי" שהוקלד הופך ל"קרית מלאכי" של
// הרישום, אחרת התג לא יתאים לשום קו והתראה לא תגיע (שלמה 07.09)
const normCity = (s) => String(s || "").trim().replace(/["'׳״]/g, "").replace(/[-–]/g, " ").replace(/\s+/g, " ").replace(/יי/g, "י").replace(/וו/g, "ו");
const canonCity = (name, all) => { const n = normCity(name); if (!n) return null; return (all || []).find((c) => c === name.trim()) || (all || []).find((c) => normCity(c) === n) || null; };
// קבוצות סוגי-שינוי להרשמה (בקשת שלמה) — התג בצד השולח זהה
const KIND_GROUPS_N = [
  { tag: "kg_rem", label: "ביטולי קווים", kinds: ["removed"] },
  { tag: "kg_new", label: "קווים חדשים", kinds: ["new"] },
  { tag: "kg_route", label: "מסלול ותחנות", kinds: ["route", "redraw", "extend", "shorten", "terminal", "stops", "stops-add", "stops-del"] },
  { tag: "kg_ident", label: "יעד, מספר ומפעיל", kinds: ["dest", "renum", "renamed", "operator", "mode"] },
];
// בכל כניסה לאתר: ההרשמות שנשמרו בדפדפן הזה נשלחות שוב לספק (שלמה 07.09: אצל
// הספק נמצא תג עיר אחד מתוך חמש). בלי בקשת הרשאה — רק אם כבר אושרה.
if (PUSH_ON) { try { const t0 = savedTags(); if (Object.keys(t0).length) readPushState(() => {}, t0); } catch (e) { /* ignore */ } }
// "ההרשמות שלי": כל מה שנרשם מהדפדפן הזה (צ'יפים + המרכז), עם ✖ להסרה
function MyFollows({ bump, onChange }) {
  const read = () => {
    // ערי המרכז לא כאן — הן כבר מוצגות כצ'יפים מעל (הופיעו שלוש פעמים; שלמה 13.09).
    // נשארו רק מעקבים ישנים מכפתור "עקוב" — כדי שאפשר יהיה להסיר אותם
    const out = [];
    try {
      const m = JSON.parse(localStorage.kbFollow || "{}");
      for (const t in m) out.push({ tag: t, label: typeof m[t] === "string" ? m[t] : (t[0] === "l" ? "קו (מקט " + t.slice(1) + ")" : "מעקב ישן") });
    } catch (e) {}
    return out;
  };
  const [items, setItems] = useState(read);
  useEffect(() => { setItems(read()); }, [bump]);
  const drop = (it) => {
    if (it.center) {
      try {
        const n = JSON.parse(localStorage.kbNotify || "{}");
        const cl = (n.cities || (n.city ? [n.city] : [])).filter((c) => c !== it.cityName);
        if (!cl.length) delete localStorage.kbNotify;
        else localStorage.kbNotify = JSON.stringify({ ...n, cities: cl, city: undefined });
      } catch (e) {}
    } else {
      try { const m = JSON.parse(localStorage.kbFollow || "{}"); delete m[it.tag]; localStorage.kbFollow = JSON.stringify(m); } catch (e) {}
    }
    pushTags();
    setItems(read());
    // המרכז שמעל מחזיק את רשימת הערים במצב משלו — בלי עדכון, "שמירה" הבאה הייתה
    // מחזירה את העיר שהוסרה כאן (שלמה 07.09: "במקום להוריד הוא מחזיר את העיר")
    if (onChange) onChange();
  };
  if (!items.length) return null;
  return (
    <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
      <b>ההרשמות הפעילות בדפדפן הזה:</b>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
        {items.map((it) => (
          <span key={it.tag + (it.center ? "c" : "")} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #e2e8f0", borderRadius: 999, padding: "3px 10px" }}>
            🔔 {it.label}
            <button title="הסרת ההרשמה הזו" onClick={() => drop(it)}
              style={{ border: "none", background: "none", cursor: "pointer", color: "#b91c1c", fontWeight: 900 }}>✖</button>
          </span>
        ))}
      </div>
    </div>
  );
}
// הרשמה מדף הקו (שלמה 13.09): לוחצים על עיר, בוחרים סוגי שינוי ותדירות, ונרשמים —
// זו אותה הרשמה כמו במרכז ההתראות בעמוד הראשי: העיר מצטרפת לרשימת הערים שם,
// והתדירות וסוגי השינוי משותפים לכל הערים.
function LineFollow({ cities }) {
  const readN = () => { try { const n = JSON.parse(localStorage.kbNotify || "{}"); if (n.city && !n.cities) n.cities = [n.city]; return n; } catch (e) { return {}; } };
  const [openC, setOpenC] = useState(null);
  const [gs, setGs] = useState(() => new Set(readN().gs || KIND_GROUPS_N.map((g) => g.tag)));
  const [freq, setFreq] = useState(() => readN().freq || "1");
  const [st, setSt] = useState("");
  const [, setBump] = useState(0);
  if (!PUSH_ON || !cities.length) return null;
  const isOn = (c) => (readN().cities || []).includes(c);
  const save = (c) => {
    if (!gs.size) { setSt("✗ סמנו לפחות סוג שינוי אחד"); return; }
    try { const n = readN(); const cl = n.cities || []; if (!cl.includes(c)) cl.push(c); localStorage.kbNotify = JSON.stringify({ cities: cl, freq, gs: [...gs] }); } catch (e) { /* ignore */ }
    setSt("שומר…"); setOpenC(null);
    pushTags((r) => { setSt(r.ok ? (r.srv ? (r.srv.ok ? "✓ נרשמתם בהצלחה" : "✗ ההרשמה לא נקלטה בשרת ההתראות — נסו שוב") : "✓ נרשמתם — ההתראות פעילות בדפדפן הזה") : "✗ " + r.why); setBump((b) => b + 1); });
  };
  const remove = (c) => {
    try { const n = readN(); const cl = (n.cities || []).filter((x) => x !== c); if (cl.length) localStorage.kbNotify = JSON.stringify({ ...n, cities: cl, city: undefined }); else delete localStorage.kbNotify; } catch (e) { /* ignore */ }
    pushTags(); setSt("ההרשמה ל" + c + " הוסרה"); setBump((b) => b + 1);
  };
  const pill = { display: "flex", alignItems: "center", gap: 5, border: "1px solid #e2e8f0", borderRadius: 999, padding: "4px 10px", fontWeight: 400 };
  return <>
    {cities.map((c) => isOn(c)
      ? <button key={c} className="sharebtn" title={"רשומים להתראות על קווי " + c + " — לחיצה מסירה את העיר מההרשמה"} onClick={() => remove(c)}>🔔 רשומים: {c} ✓</button>
      : <button key={c} className="sharebtn" title={"הרשמה להתראות על כל שינוי מהותי בקווים של " + c} aria-expanded={openC === c} onClick={() => setOpenC(openC === c ? null : c)}>🔔 הרשמה: {c}</button>)}
    {st && <small style={{ color: st[0] === "✓" ? "#166534" : "#b91c1c", fontWeight: 700, display: "inline-block", marginInlineStart: 6 }}>{st}</small>}
    {openC && (
      <div style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 12px", marginTop: 6, display: "flex", flexDirection: "column", gap: 8 }}>
        <b>הרשמה להתראות על קווי {openC}</b>
        <div style={{ fontWeight: 700 }}>אילו שינויים:
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
            {KIND_GROUPS_N.map((g) => (
              <label key={g.tag} style={pill}><input type="checkbox" checked={gs.has(g.tag)} onChange={() => setGs((p) => { const n = new Set(p); if (n.has(g.tag)) n.delete(g.tag); else n.add(g.tag); return n; })} /> {g.label}</label>
            ))}
          </div>
        </div>
        <div style={{ fontWeight: 700 }}>באיזו תדירות:
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
            {[["1", "כל יום שיש שינוי"], ["3", "סיכום כל 3 ימים"], ["7", "סיכום שבועי"]].map(([v, l]) => (
              <label key={v} style={pill}><input type="radio" name="lffreq" checked={freq === v} onChange={() => setFreq(v)} /> {l}</label>
            ))}
          </div>
        </div>
        <div className="mut">סוגי השינוי והתדירות משותפים לכל הערים שנרשמתם אליהן — אפשר לשנות במרכז ההתראות בעמוד הראשי.</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="kathead" style={{ width: "auto", padding: "6px 14px" }} onClick={() => save(openC)}>שמירה והרשמה</button>
          <button className="sharebtn" onClick={() => setOpenC(null)}>ביטול</button>
        </div>
      </div>
    )}
  </>;
}
function NotifyCenter({ cities: allCities }) {
  const st0 = (() => { try { const s = JSON.parse(localStorage.kbNotify || "{}"); if (s.city && !s.cities) s.cities = [s.city]; return s; } catch (e) { return {}; } })();
  const [open, setOpen] = useState(false);
  const [city, setCity] = useState("");
  const [cities, setCities] = useState(st0.cities || []);
  const [freq, setFreq] = useState(st0.freq || "1");
  const [gs, setGs] = useState(() => new Set(st0.gs || KIND_GROUPS_N.map((g) => g.tag)));
  const [saved, setSaved] = useState(!!(st0.cities || []).length);
  const [msg, setMsg] = useState("");
  const [ps, setPs] = useState({ loading: true });
  useEffect(() => { if (open && PUSH_ON) { setPs({ loading: true }); readPushState((s) => setPs((p) => (typeof s === "function" ? s(p) : s)), savedTags()); } }, [open]);
  if (!PUSH_ON) return null;
  const toggleG = (t) => setGs((p) => { const n = new Set(p); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  // רק שמות ערים כפי שהם ברישום (אחרת התג לא יתאים לשום קו)
  const pick = (raw) => {
    const c = raw.trim(); if (!c) return null;
    const canon = canonCity(c, allCities);
    if (!canon) { setMsg(`"${c}" לא נמצאה בין ערי הקצה של הקווים — בחרו שם מהרשימה שנפתחת בהקלדה`); return null; }
    return canon;
  };
  const addCity = () => { const c = pick(city); if (!c) return; if (!cities.includes(c)) setCities([...cities, c]); setCity(""); setMsg(""); };
  const save = () => {
    const list = [...cities];
    if (city.trim()) { const c = pick(city); if (!c) return; if (!list.includes(c)) list.push(c); }   // מה שהוקלד ולא נלחץ "הוסף"
    if (!list.length) { setMsg("הוסיפו לפחות עיר אחת"); return; }
    if (!gs.size) { setMsg("סמנו לפחות סוג שינוי אחד"); return; }
    setMsg("שומר…");
    try { localStorage.kbNotify = JSON.stringify({ cities: list, freq, gs: [...gs] }); } catch (e) {}
    pushTags((r) => {
      setPs({ loading: false, ok: !!r.ok, why: r.why || "", id: r.id, srv: r.srv });
      setMsg(r.ok ? "✓ נרשמתם בהצלחה. ההתראות פעילות בדפדפן הזה" : `✗ נשמר, אבל ההתראות לא יגיעו: ${r.why}`);
    });
    setCities(list); setCity(""); setSaved(true);
  };
  // קריאה מחדש של מה ששמור בדפדפן — אחרי הסרה מרשימת "ההרשמות הפעילות" שמתחת
  const reload = () => {
    try {
      const s = JSON.parse(localStorage.kbNotify || "{}");
      const cl = s.cities || (s.city ? [s.city] : []);
      setCities(cl); setSaved(!!cl.length); setCity("");
      if (s.freq) setFreq(s.freq);
      if (s.gs) setGs(new Set(s.gs));
    } catch (e) { setCities([]); setSaved(false); }
  };
  // "הפעלת התראות" שולח גם את כל מה שנשמר בדפדפן הזה — לא רק מבקש הרשאה
  const enable = () => { setMsg("…"); pushTags((r) => { setPs({ loading: false, ok: !!r.ok, why: r.why || "", id: r.id, srv: r.srv }); setMsg(r.ok ? "✓ ההתראות פעילות בדפדפן הזה" : "✗ " + r.why); }); };
  // מצב הסנכרון מול שרת ההתראות — בלי לחזור על שמות הערים (הן כבר בצ'יפים; שלמה 13.09)
  const srvText = (s) => {
    if (s.err) return "לא הצלחתי לבדוק מול שרת ההתראות: " + s.err;
    if (s.empty) return "אין עדיין הרשמה בדפדפן הזה";
    if (!s.ok) return "✗ ההרשמה לא נקלטה בשרת ההתראות — נסו לשמור שוב";
    return s.fixed ? "✓ ההרשמה סונכרנה עכשיו עם שרת ההתראות" : "✓ ההרשמה רשומה בשרת ההתראות";
  };
  const cancel = () => {
    try { delete localStorage.kbNotify; } catch (e) {}
    pushTags();
    setCities([]); setSaved(false); setMsg("ההרשמה בוטלה");
  };
  return (
    <div className="katbox" style={{ marginTop: 8 }}>
      <button className="kathead" style={{ fontWeight: 800 }} aria-expanded={open} onClick={() => setOpen(!open)}>
        🔔 הרשמה להתראות על שינויים{saved ? (() => { const cl = (st0.cities || [st0.city]).filter(Boolean); return cl.length > 2 ? ` — רשומים ל-${cl.length} ערים` : ` — רשומים ל${cl.join(" ו")}`; })() : " — עיר, סוגי שינויים ותדירות"}
      </button>
      {open && (
        <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* מצב ההתראות בדפדפן הזה — בלי זה ההרשמה נשמרת אבל שום הודעה לא מגיעה */}
          <div style={{ border: "1px solid " + (ps.loading ? "#e2e8f0" : ps.ok ? "#bbf7d0" : "#fecaca"), background: ps.loading ? "#f8fafc" : ps.ok ? "#f0fdf4" : "#fef2f2", borderRadius: 10, padding: "8px 12px", fontWeight: 700, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {ps.loading ? "בודק את מצב ההתראות בדפדפן הזה…" : ps.ok ? "✓ ההתראות פעילות בדפדפן הזה" : "✗ ההתראות לא פעילות בדפדפן הזה: " + ps.why}
            {!ps.loading && !ps.ok && !/אייפון|לא תומך/.test(ps.why || "") && <button className="kathead" style={{ width: "auto", padding: "5px 12px" }} onClick={enable}>הפעלת התראות</button>}
            {!ps.loading && ps.ok && !ps.srv && <small style={{ width: "100%", fontWeight: 400, color: "var(--muted, #64748b)" }}>בודק מול השרת מה רשום שם…</small>}
            {!ps.loading && ps.srv && <div style={{ width: "100%", fontWeight: 600, fontSize: 13, color: ps.srv.ok ? "#166534" : "#b91c1c" }}>{srvText(ps.srv)}</div>}
          </div>
          <label style={{ fontWeight: 700 }}>ערים (אפשר כמה):
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <input list="kbcities" dir="rtl" value={city} onChange={(e) => setCity(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCity(); } }}
                placeholder="הקלידו שם עיר…" style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", font: "inherit" }} />
              <button className="kathead" style={{ width: "auto", padding: "6px 14px" }} onClick={addCity}>+ הוסף</button>
            </div>
            <datalist id="kbcities">{(allCities || []).map((c) => <option key={c} value={c} />)}</datalist>
            {cities.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, fontWeight: 400 }}>
                {cities.map((ct) => (
                  <span key={ct} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#ede9fe", borderRadius: 999, padding: "3px 10px" }}>
                    {ct} <button onClick={() => setCities(cities.filter((x) => x !== ct))}
                      style={{ border: "none", background: "none", cursor: "pointer", color: "#b91c1c", fontWeight: 900 }}>✖</button>
                  </span>
                ))}
              </div>
            )}
          </label>
          <div style={{ fontWeight: 700 }}>אילו שינויים מעניינים אתכם:
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6, fontWeight: 400 }}>
              {KIND_GROUPS_N.map((g) => (
                <label key={g.tag} style={{ display: "flex", alignItems: "center", gap: 5, border: "1px solid #e2e8f0", borderRadius: 999, padding: "4px 10px" }}>
                  <input type="checkbox" checked={gs.has(g.tag)} onChange={() => toggleG(g.tag)} /> {g.label}
                </label>
              ))}
            </div>
            <div className="mut" style={{ fontWeight: 400 }}>שינויי לו״ז ותדירות אינם נשלחים — רק שינויים מהותיים.</div>
          </div>
          <div style={{ fontWeight: 700 }}>באיזו תדירות:
            <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap", fontWeight: 400 }}>
              {[["1", "כל יום שיש שינוי"], ["3", "סיכום כל 3 ימים"], ["7", "סיכום שבועי"]].map(([v, l]) => (
                <label key={v} style={{ display: "flex", alignItems: "center", gap: 5, border: "1px solid #e2e8f0", borderRadius: 999, padding: "4px 10px" }}>
                  <input type="radio" name="kbfreq" checked={freq === v} onChange={() => setFreq(v)} /> {l}
                </label>
              ))}
            </div>
            <div className="mut" style={{ fontWeight: 400 }}>בסיכום, ההתראה נפתחת לעמוד עם כל השינויים בתקופה — מקובצים לפי סוג.</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="kathead" style={{ background: "#4c1d95", color: "#fff", borderRadius: 10, width: "auto", padding: "8px 18px" }} onClick={save}>שמירה והרשמה</button>
            {saved && <button className="kathead" style={{ width: "auto", padding: "8px 14px" }} onClick={cancel}>ביטול ההרשמה</button>}
            {msg && <span style={{ fontWeight: 700 }}>{msg}</span>}
          </div>
          <MyFollows bump={msg} onChange={reload} />
        </div>
      )}
    </div>
  );
}
// עמוד הסיכום שנפתח מהתראת סיכום: כל השינויים בתקופה, מקובצים לפי סוג —
// קווים עם אותו שינוי באותה שורה, כל אחד בקישור משלו (בקשת שלמה)
function DigestPage({ city, days, onBack, openLine }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch("data/digest.json", { cache: "no-cache" }).then((r) => r.json()).then(setData)
      .catch(() => setData({ items: [] }));
  }, []);
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const cityList = String(city || "").split(",").map((c) => c.trim()).filter(Boolean);
  const items = ((data && data.items) || []).filter((x) => x.d >= since && (x.ct || []).some((c) => cityList.includes(c)));
  const byKind = {};
  items.forEach((x) => { (byKind[x.k] = byKind[x.k] || []).push(x); });
  return (
    <div className="card">
      <button className="back" onClick={onBack}>→ לחיפוש</button>
      <h2 style={{ margin: "6px 0" }}>🔔 סיכום השינויים בקווי {String(city || "").split(",").join(", ")} — {days === 7 ? "השבוע האחרון" : `${days} הימים האחרונים`}</h2>
      {!data ? <div>טוען…</div> : !items.length ? <div className="mut">אין שינויים מהותיים בתקופה הזו.</div> : (
        Object.keys(byKind).map((k) => {
          const seen = new Set();
          const rows = byKind[k].filter((x) => !seen.has(x.mk) && seen.add(x.mk));
          return (
            <div key={k} style={{ margin: "10px 0", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 10 }}>
              <b style={{ color: (KINDS[k] || {}).color || "#0f172a" }}>{(KINDS[k] || {}).label || k}</b> · {rows.length} קווים:{" "}
              {rows.map((x, i) => (
                <React.Fragment key={x.rd + x.d}>
                  {i > 0 && " · "}
                  <a href={"#" + encodeURIComponent(x.rd) + "@" + x.d} onClick={(e) => { e.preventDefault(); openLine(x.rd, x.d); }}
                    style={{ fontWeight: 700 }}>קו {x.line || x.mk}</a>
                </React.Fragment>
              ))}
            </div>
          );
        })
      )}
      <div className="mut">שינויי לו״ז ותדירות אינם נכללים בסיכום.</div>
    </div>
  );
}

function LinePage({ rd, lineGone, sibs, onSwitch, onBack, initDate, initCats }) {
  // "· רציף N" ליד תחנה במסוף — הרציף של הווריאנט הזה לפי שורת הרציף בקובץ
  // התחנות (platforms.json rd), מתעדכן מדי יום
  const plats = usePlatforms();
  const rdPlat = (plats && plats.rd && plats.rd[rd]) || {};
  const withPlat = (str, c) => (c != null && rdPlat[String(c)]) ? `${str} · רציף ${rdPlat[String(c)]}` : str;
  const [lf, setLf] = useState(null);
  const [err, setErr] = useState(null);
  const [sel, setSel] = useState(null);   // אינדקס גרסה נבחרת
  const detailRef = useRef(null);
  const selectEvent = (i, event) => {
    setSel(i);
    if(event.k === "sched" || event.k === "freq"){
      requestAnimationFrame(()=>{
        const panel=detailRef.current;
        if(panel)(panel.querySelector(".early-schedule-diff,.tdiff")||panel).scrollIntoView({block:"start",inline:"nearest",behavior:"instant"});
        window.scrollBy({top:-12,behavior:"instant"});
      });
    }
  };
  const [mon, setMon] = useState("");
  const [offK, setOffK] = useState(() => new Set());   // קטגוריות שכובו בעמוד הקו
  const [cmpI, setCmpI] = useState(null);              // גרסת בסיס להשוואה חופשית
  const [onlyCur, setOnlyCur] = useState(false);       // מפה בלי שכבת העבר
  const [only12, setOnly12] = useState(true);          // חלונית 2012 פתוחה: במפה רק מסלול 2012 (שלמה 05.09), או יחד עם היום
  const [show12, setShow12] = useState(false);
  const [altRd, setAltRd] = useState(null);   // חלופה שנבחרה להשוואה
  const [d12, setD12] = useState(null);   // קובץ הקו של 2012 (נטען בפתיחה)
  const [r12, setR12] = useState(0);      // וריאנט 2012 נבחר
  const [s12, setS12] = useState(null);   // מסלולים משוערים של 2012 על הכבישים (אם חושבו)
  const [rty, setRty] = useState(0);      // מונה "נסו שוב" אחרי כשל רשת
  // העוגן של 2012 מוטמע בקובץ הקו עצמו (lf.anc, מוזרק בצינור הלילי) —
  // בעבר כל פתיחת עמוד קו הורידה את קובץ העוגנים המלא (1.2MB) רק כדי
  // לשלוף שורה אחת, כולל בקווי רכבת ומוניות שאין להם עוגן בכלל.
  const anc = (lf && lf.anc) || null;
  useEffect(() => {
    setShow12(false); setD12(null); setR12(0); setS12(null); setAltRd(null);
  }, [rd]);
  // המסלול המשוער על הכבישים נשמר בקובץ נפרד לכל קו 2012 — קיים רק למה שחושב
  useEffect(() => {
    if (!show12 || s12 || !anc) return;
    dfetch("../magihim-2012/data/shapes/l" + anc.k + ".json")
      .then((r) => (r.ok ? r.json() : { routes: {} }))
      .then(setS12).catch(() => setS12({ routes: {} }));
  }, [show12, anc, s12]);
  useEffect(() => {
    if (!show12 || d12 || !anc) return;
    dfetch("../magihim-2012/data/l" + anc.k + ".json")
      .then((r) => r.json())
      .then((d) => {
        // בחירת וריאנט 2012 שתואם את כיוון הווריאנט הפתוח — לפי דמיון
        // תחנות הקצה (ולא סתם הווריאנט הראשון בקובץ)
        const routes = d.routes || [];
        const cur = ((lf || {}).versions || []).slice(-1)[0] || {};
        const st = cur.stops || [];
        let best = 0;
        if (st.length && routes.length > 1) {
          const tok = (x) => new Set(String(x || "").split(/[^א-ת0-9]+/).filter((w) => w.length >= 3));
          const f0 = tok(st[0][1]), l0 = tok(st[st.length - 1][1]);
          let bs = -1;
          routes.forEach((r, i) => {
            const sc = [...tok(r.f)].filter((w) => f0.has(w)).length * 2 +
              [...tok(r.l)].filter((w) => l0.has(w)).length * 2 + (r.n || 0) / 1000;
            if (sc > bs) { bs = sc; best = i; }
          });
        }
        setR12(best);
        setD12(d);
      })
      .catch(() => setD12({ routes: [] }));
  }, [show12, anc, d12, lf]);
  useEffect(() => {
    // מעבר מהיר בין קווים מייצר שתי בקשות, והתשובה האיטית יותר עלולה
    // לנחות אחרונה ולערבב קו אחד עם מצב של אחר. אותו שמירה כמו בהשוואת
    // החלופות.
    let ok = true;
    setLf(null); setErr(null); setSel(null); setMon(""); setOffK(new Set()); setCmpI(null); setOnlyCur(false);
    dfetch("data/lines/" + fsafe(rd) + ".json")
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((d) => { if (!ok) return; const m = materializeLf(d); setLf(m);
        // קישור מציר תחנה מגיע עם תאריך (‎#מקט@תאריך‎) — נוחתים ישר על
        // הגרסה של אותו שינוי, לא על הגרסה האחרונה
        let s = d.versions.reduce((last,v,i)=>v.hid?last:i, 0);
        if (initDate) {
          const i = d.versions.findIndex((v) => v.d === initDate);
          if (i >= 0) s = i;
        }
        setSel(s);
        // נכנסו מתוך חיפוש לפי קטגוריה: הסרגל נדלק רק על סוגי האירועים
        // שמתאימים לה (שלמה 06.09). הסינון הוא לפי סוג האירוע, כמו בסרגל —
        // סוג שיש בו לפחות אירוע אחד מתאים נשאר דלוק. אם שום אירוע לא
        // מתאים — מציגים הכול, לא עמוד ריק.
        const cats = String(initCats || "").split(",").filter(Boolean);
        if (cats.length) {
          const vs2 = m.versions || [], keep = new Set(), all = new Set();
          vs2.forEach((x, i) => { if (x.hid) return; const dk = dispKind(x, i, vs2); all.add(dk); if (cats.some((c) => evInCat(x, i, vs2, c))) keep.add(dk); });
          if (keep.size && keep.size < all.size) setOffK(new Set([...all].filter((k) => !keep.has(k))));
        } })
      .catch((e) => { if (ok) setErr(e); });
    return () => { ok = false; };
  }, [rd, rty, initDate, initCats]);
  // הודעת שגיאה אחת לשני מצבים שונים הטעתה: כשל רשת רגעי בנייד הוצג
  // כ"לא נמצאו נתונים" והגולש הסיק שאין מה לראות. סטטוס HTTP (404) הוא
  // באמת קו שאין לו קובץ; כל השאר — תקלה, עם כפתור לנסות שוב.
  if (err) return (
    <div className="card"><button className="back" onClick={onBack}>→ חזרה</button>
      {/^\d+$/.test(String(err.message)) ? <div className="empty">לא נמצאו נתונים לוריאנט הזה.</div>
        : <div className="empty">📡 הנתונים לא ירדו — כנראה תקלת רשת רגעית.{" "}
          <button className="morebtn" onClick={() => setRty((n) => n + 1)}>↻ נסו שוב</button></div>}
    </div>);
  if (!lf) return <div className="card">טוען…</div>;
  const vs = lf.versions;
  // מספר הנסיעות מגיע מהאינדקס ולא מקובץ הקו: הוא משתנה מיום ליום, ובקובץ
  // הקו הוא היה משנה את כל 13,000 הקבצים בכל ריצה יומית
  const ntr = ((sibs || []).find((x) => x.rd === rd) || {}).ntr || 0;
  const months = [...new Set(vs.filter((v) => !v.hid).map((v) => v.d.slice(0, 7)))].reverse();
  const shown = vs.map((v, i) => ({ v, i }))
    .filter((x) => !x.v.hid && (!mon || x.v.d.slice(0, 7) === mon) && !offK.has(dispKind(x.v, x.i, vs))).reverse();
  // הקטגוריות שקיימות בקו הזה בפועל, לפי שכיחות — סרגל כיבוי/הדלקה.
  // שלוש קבוצות מאוחדות כאן ולא בתווית שעל האירוע: בסרגל הן שאלה אחת
  // ("להציג שינויי תחנות?") ואילו על האירוע עצמו ההבחנה כן נושאת מידע.
  const kindsHere = (() => {
    // התווית שעל האירוע נגזרת מ-dispKind ולא מ-k הגולמי; סינון לפי k היה
    // יוצר אי-התאמה — כפתור "שינוי מספר הרכבים" שמשאיר אירועים מתויגים
    // "שינוי לו״ז". הסינון והתוויות חייבים לדבר באותה שפה.
    const c = new Map();
    vs.forEach((x, i) => {
      if (x.hid) return;
      const dk = dispKind(x, i, vs), g = KGROUP[dk] || dk;
      const e = c.get(g) || { n: 0, kinds: new Set() };
      e.n += 1; e.kinds.add(dk); c.set(g, e);
    });
    return [...c.entries()].sort((a, b) => b[1].n - a[1].n);
  })();
  const toggleK = (ks, wasOff) => setOffK((prev) => {
    const n = new Set(prev);
    ks.forEach((k) => (wasOff ? n.delete(k) : n.add(k)));
    return n;
  });
  // מס' תחנה לרשימות ➕/➖: בהוספה מחפשים בגרסה עצמה, בהורדה בגרסאות שלפניה
  const codeOf = (name, i, isAdd) => {
    const scan = (l) => { const h = (l || []).find((s) => s && s[1] === name); return h ? h[0] : null; };
    // האינדקס עלול להצביע מחוץ למערך כשמעבר בין קווים מותיר מצב מגרסה
    // קודמת. הגבול התחתון נשמר כאן מאז ומתמיד, אבל העליון לא — ובקו שקיבל
    // תחנות בגרסה האחרונה זה הפיל את כל העמוד.
    const top = Math.min(i, vs.length - 1);
    if (isAdd && vs[top]) { const c = scan(vs[top].stops); if (c) return c; }
    for (let j = top - (isAdd ? 0 : 1); j >= 0; j--) { const c = scan(vs[j].stops); if (c) return c; }
    for (let j = i + 1; j < vs.length; j++) { const c = scan(vs[j].stops); if (c) return c; }
    return null;
  };
  // רשומת ➖ שהיא מק"ט חשוף: הסריקה לא מצאה שם לתחנה שירדה (המק"ט כבר
  // נמחק מהרישום הארצי) ושמרה את המספר עצמו. השם קיים בתיעוד הישן של
  // הקו — מאתרים אותו שם. מחזיר את רשומת התחנה המלאה (מק"ט, שם, מיקום)
  const stopByCode = (code, i) => {
    const top = Math.min(i, vs.length - 1);
    for (let j = top; j >= 0; j--) {
      const h = (vs[j].stops || []).find((s) => s && String(s[0]) === code);
      if (h) return h;
    }
    for (let j = top + 1; j < vs.length; j++) {
      const h = (vs[j].stops || []).find((s) => s && String(s[0]) === code);
      if (h) return h;
    }
    return null;
  };
  // ➖ שנשאר בלי מק"ט: שם התחנה בפיד השתנה מאז התיעוד שלנו (למשל
  // "דוד רמז/הכרם" ששמור אצלנו בשמו הישן "מסוף רמז/דוד רמז"), ולכן חיפוש
  // לפי שם לא מוצא כלום. משלימים מול ההפרש בפועל בין הגרסאות: אם בדיוק
  // מק"ט אחד ירד ולא נתבע על ידי שם אחר ברשימה — הוא-הוא התחנה החסרה
  const remFix = (i) => {
    const out = {};
    const top = Math.min(i, vs.length - 1);
    const v = vs[top];
    if (!v || !(v.stops || []).length || !(v.rem || []).length) return out;
    let prevS = null;
    for (let j = top - 1; j >= 0; j--) { if ((vs[j].stops || []).length) { prevS = vs[j].stops; break; } }
    if (!prevS) return out;
    const curC = new Set(v.stops.map((s) => String(s[0])));
    const claimed = new Set();
    const unresolved = [];
    for (const n of v.rem || []) {
      const e = v.nc && v.nc[n];
      const c = Array.isArray(e) ? String(e[0]) : (e || (/^\d{3,}$/.test(n) ? n : codeOf(n, i, false)));
      if (c) claimed.add(String(c)); else unresolved.push(n);
    }
    const free = prevS.filter((s) => !curC.has(String(s[0])) && !claimed.has(String(s[0])));
    if (unresolved.length === 1 && free.length === 1) out[unresolved[0]] = free[0];
    return out;
  };
  // v.nc — מק"טים שהצנרת פענחה מראש לשמות שאינם בקובץ (תחנה שירדה
  // בגרסה הראשונה של קו ארכיוני, למשל) — נבדק לפני החיפוש הרגיל.
  // הערך: מחרוזת מק"ט, או [מק"ט, lat, lon] כשגם המיקום ידוע (למפה)
  const ncOf = (nv, name) => {
    const e = nv && nv.nc && nv.nc[name];
    return Array.isArray(e) ? e[0] : e;
  };
  // כל המק"טים ששייכים לשם — בסדר הסריקה של codeOf. שם שמופיע פעמיים
  // ברשימה הוא שתי תחנות שונות (שני צידי רחוב), וכל מופע צריך את המספר
  // שלו — לא "×2" עם מק"ט אחד לשתיהן (דיווח שלמה: ישעיהו הנביא)
  const codesFor = (name, i, isAdd) => {
    const out = []; const seen = new Set();
    const take = (l) => (l || []).forEach((s) => {
      if (s && s[1] === name && !seen.has(String(s[0]))) { seen.add(String(s[0])); out.push(String(s[0])); }
    });
    const top = Math.min(i, vs.length - 1);
    if (isAdd && vs[top]) take(vs[top].stops);
    for (let j = top - (isAdd ? 0 : 1); j >= 0; j--) take(vs[j].stops);
    for (let j = i + 1; j < vs.length; j++) take(vs[j].stops);
    return out;
  };
  // רשימת ➕/➖ מוכנה להצגה. הכלל: הזיהוי לפי מספר תחנה, השם רק תצוגה.
  // אירועים חדשים נושאים את המק"ט המדויק לצד כל שם (e.c, מיושר מהסורק);
  // הניחוש-לפי-שם נשאר רק לרשומות ישנות שנשמרו בלי מספרים.
  const labelList = (entries, i, isAdd) => {
    const cnt = {};
    const strs = (entries || []).map((e) => {
      const name = e.n;
      if (e.c) {
        if (/^\d{3,}$/.test(name)) { const h = stopByCode(e.c, i); return h ? withPlat(`${h[1]} (${e.c})`, e.c) : name; }
        return withPlat(`${name} (${e.c})`, e.c);
      }
      if (!isAdd && /^\d{3,}$/.test(name)) {
        const h = stopByCode(name, i);
        return h ? withPlat(`${h[1]} (${name})`, name) : name;
      }
      const k = (cnt[name] = (cnt[name] || 0) + 1) - 1;
      const nv = vs[Math.min(i, vs.length - 1)];
      const cs = codesFor(name, i, isAdd);
      const c = cs[k] != null ? cs[k] : (k === 0 ? ncOf(nv, name) : null);
      if (c) return withPlat(`${name} (${c})`, c);
      if (!isAdd) { const f = remFix(i)[name]; if (f) return withPlat(`${name} (${f[0]})`, f[0]); }
      return name;
    });
    return dedupCount(strs).map(({ x, n: c }) => x + (c > 1 ? ` ×${c}` : "")).join(", ");
  };
  // תחנה שירדה ותחנה שנוספה עם אותו שם ורק רציף שונה — זה מעבר רציף,
  // לא "תחנה חדשה": מזווגים אותן ומציגים שורת מעבר אחת ברורה
  const platOf = (n) => {
    const m = /רציף\s*([^\s/,]+)/.exec(n || "");
    return m ? { plat: m[1], base: (n.replace(/\s*\/?\s*רציף\s*[^\s/,]+/, "").trim() || n) } : null;
  };
  const splitPlatformMoves = (add, rem) => {
    const a = (add || []).map((e) => ({ ...e, p: platOf(e.n), used: false }));
    const r = (rem || []).map((e) => ({ ...e, p: platOf(e.n), used: false }));
    const moves = [];
    for (const x of a) {
      if (!x.p) continue;
      const y = r.find((y2) => y2.p && !y2.used && y2.p.base === x.p.base);
      if (y) { x.used = y.used = true; moves.push({ base: x.p.base, from: y.p.plat, to: x.p.plat }); }
    }
    return { moves,
      add: a.filter((x) => !x.used).map((x) => ({ n: x.n, c: x.c })),
      rem: r.filter((y) => !y.used).map((y) => ({ n: y.n, c: y.c })) };
  };
  // תחנה שירדה ותחנה שנוספה עם אותו שם, מק"ט שונה ואותו מיקום — משרד
  // התחבורה החליף לתחנה את המספר, לא ביטל אותה: שורת החלפה אחת במקום
  // "נוספה"+"ירדה" שנראות כסתירה (קו 80 כפר חב"ד: 33300 ← 33486)
  // סיכות "תחנה שירדה" למפה + מי שנשארה בלי מיקום. תחנה שאי אפשר למקם
  // אסור שתיעלם בשקט (דרישת שלמה) — היא חוזרת ב-unplaced ומוצגת בכיתוב
  const remPinsOf = (v2, vi2, gv2) => {
    const pins = [];
    const unplaced = [];
    (v2.rem || []).forEach((n, j) => {
      // המק"ט המדויק שנשמר עם האירוע (v.rc) קודם לכל ניחוש
      const rc = v2.rc && v2.rc[j] != null ? String(v2.rc[j]) : null;
      if (rc) {
        const h = stopByCode(rc, vi2);
        if (h) { pins.push([rc, /^\d{3,}$/.test(n) ? h[1] : n, h[2], h[3]]); return; }
      }
      const e = v2.nc && v2.nc[n];
      if (Array.isArray(e)) { pins.push([String(e[0]), n, e[1], e[2]]); return; }
      // רשומה שהיא מק"ט חשוף — התחנה מאותרת לפי המספר בתיעוד הישן
      if (/^\d{3,}$/.test(n)) {
        const h = stopByCode(n, vi2);
        if (h) pins.push([n, h[1], h[2], h[3]]); else unplaced.push(n);
        return;
      }
      // התחנה שירדה קיימת עם קואורדינטות ברשימות של גרסאות אחרות —
      // בלי הנפילה הזו לאחור היא הופיעה בטקסט אך לא על המפה
      for (let k = vi2 - 1; k >= 0; k--) {
        const h = (vs[k].stops || []).find((s) => s && s[1] === n);
        if (h) { pins.push([String(h[0]), n, h[2], h[3]]); return; }
      }
      for (let k = vi2 + 1; k < vs.length; k++) {
        const h = (vs[k].stops || []).find((s) => s && s[1] === n);
        if (h) { pins.push([String(h[0]), n, h[2], h[3]]); return; }
      }
      // השם בפיד השתנה מאז התיעוד שלנו — הזיווג מול ההפרש בפועל
      const f = remFix(vi2)[n];
      if (f) pins.push([String(f[0]), n, f[2], f[3]]); else unplaced.push(n);
    });
    return { unplaced,
      pins: pins.filter((p) => p[2] != null && p[3] != null).filter((p) =>
        // מק"ט שהוחלף: תחנה באותו שם ואותו מיקום עדיין בקו — לא מציירים
        // עליה סיכת "ירדה" אדומה שנראית כאילו התחנה בוטלה
        !((gv2 && gv2.stops) || []).some((s) => s && s[1] === p[1] &&
          Math.abs(s[2] - p[2]) < 0.005 && Math.abs(s[3] - p[3]) < 0.005)) };
  };
  const splitRenumbers = (add, rem, i) => {
    const a = (add || []).map((e) => ({ ...e, used: false }));
    const moves = []; const rest = [];
    const oldByName = (n2) => {
      const top = Math.min(i, vs.length - 1);
      for (let j = top - 1; j >= 0; j--) { const h = (vs[j].stops || []).find((s) => s && s[1] === n2); if (h) return h; }
      return remFix(i)[n2] || null;
    };
    const curStops = vs[Math.min(i, vs.length - 1)].stops || [];
    for (const e of rem || []) {
      const bare = !e.c && /^\d{3,}$/.test(e.n);
      // קודם לפי המספר המדויק כשנשמר; חיפוש-שם רק לרשומות ישנות בלעדיו
      const oldStop = (e.c && stopByCode(e.c, i)) || (bare ? stopByCode(e.n, i) : oldByName(e.n));
      const oldName = bare || (e.c && /^\d{3,}$/.test(e.n)) ? (oldStop && oldStop[1]) : e.n;
      const x = oldName && a.find((y) => !y.used && y.n === oldName);
      const newStop = x && ((x.c && curStops.find((s) => s && String(s[0]) === x.c)) ||
        curStops.find((s) => s && s[1] === oldName));
      const near = oldStop && newStop && String(oldStop[0]) !== String(newStop[0]) &&
        Math.abs(oldStop[2] - newStop[2]) < 0.005 && Math.abs(oldStop[3] - newStop[3]) < 0.005;
      if (near) { x.used = true; moves.push({ name: oldName, from: String(e.c || oldStop[0]), to: String(newStop[0]) }); }
      else rest.push(e);
    }
    return { moves, add: a.filter((x) => !x.used).map((x) => ({ n: x.n, c: x.c })), rem: rest };
  };
  const v = vs[sel] || vs[vs.length - 1];
  // ברירת המחדל היא הגרסה הקודמת הסמוכה; במצב השוואה חופשית המשתמש בוחר
  // גרסת בסיס אחרת וכל ההפרש — הרשימה, המפה והמסלול — נמדד מולה.
  const vi = vs.indexOf(v);
  const cmpOn = cmpI != null && cmpI !== vi && cmpI >= 0 && cmpI < vs.length;
  const pi = cmpOn ? cmpI : vi - 1;
  const pv = pi >= 0 ? vs[pi] : null;
  // הפרש התחנות מחושב מהרשימות עצמן — במצב השוואה אי אפשר להסתמך על
  // add/rem ששמורים על הגרסה, כי הם נמדדו מול הגרסה הקודמת ולא מול הבסיס.
  const stopsAt = (idx, dir) => {
    for (let j = idx; dir < 0 ? j >= 0 : j < vs.length; j += dir) {
      if ((vs[j].stops || []).length) return vs[j].stops;
    }
    return null;
  };
  const cmpDiff = (() => {
    if (!cmpOn) return null;
    const a = stopsAt(pi, -1), b = stopsAt(vi, -1);
    if (!a || !b) return null;
    const ac = new Set(a.map((x) => x[0])), bc = new Set(b.map((x) => x[0]));
    return {
      add: b.filter((x) => !ac.has(x[0])),
      rem: a.filter((x) => !bc.has(x[0])),
      from: vs[pi].d, to: vs[vi].d,
    };
  })();
  // גרסת ארכיון בלי גאומטריה אך עם רצף תחנות (שלב ב') — קו מקורב בין התחנות.
  const toPts = (x) => (x.shp ? decodeShape(x.shp) : ((x.stops || []).length > 1 ? x.stops.map((s) => [s[2], s[3]]) : null));
  // במצב השוואה מעניין מצב הקו בשני התאריכים, לא האירוע עצמו: אירוע לו"ז
  // אינו נושא גאומטריה, ובלי זה המפה לא הייתה נפתחת כלל בהשוואה.
  const geoAt = (idx) => {
    for (let j = idx; j >= 0; j--) if ((vs[j].stops || []).length || vs[j].shp) return vs[j];
    return null;
  };
  // אירוע בלי גאומטריה משלו — "הווריאנט הופיע ברישום", "בוטל" — הציג
  // "אין פירוט" גם כשלקו יש מסלול מתועד. בקשת שלמה: שתיפתח מפה גם בתיעוד
  // הראשון וגם באחרון. לוקחים את הגרסה הגיאומטרית הקרובה — אחורה ואם אין
  // אז קדימה (התיעוד הראשון של קו מהארכיון הוא לרוב אירוע-רישום, והצילום
  // עם המסלול נוסף אחריו) — ואומרים מאיזה תאריך המפה.
  const geoNear = (idx) => {
    const back = geoAt(idx);
    if (back) return back;
    for (let j = idx + 1; j < vs.length; j++) if ((vs[j].stops || []).length || vs[j].shp) return vs[j];
    return null;
  };
  const ownGeo = !!(v.shp || (v.stops || []).length > 1);
  // שינוי שתוכנן ולא יצא לפועל (שלמה 03.09: "כל שינוי שלא נכנס אמור להיות
  // מפה"): המפה מציגה את המסלול שתוכנן (pstops) במקווקו, ואת המסלול בפועל
  // של הווריאנט, אם היה כזה, כרקע אפור — בלי סימוני נוספו/ירדו, כי זה לא
  // שינוי שקרה אלא תוכנית שירדה.
  const plannedV = !cmpOn && v.k === "planned-dropped" && (v.pstops || []).length > 1;
  const actualV = plannedV ? geoNear(vi) : null;
  // מה בדיוק לא יצא לפועל (שלמה 03.09: "חוץ מתחנות אני לא מבין מה היה שונה"):
  // 'new' = הווריאנט כולו פורסם עם תאריך התחלה ולא התחיל בו (המסלול עצמו
  // יכול להיות זהה למה שנסע אחר כך — אז מה שנפל הוא המועד); 'route' = תוכנית
  // לשנות מסלול קיים. ההבדל מול המסלול בפועל נמדד ברצף התחנות.
  const plKind = plannedV ? (v.pk || (/הווריאנט/.test(v.note || "") ? "new" : "route")) : null;
  const plDiff = plannedV && actualV && (actualV.stops || []).length ? (() => {
    const pc = new Set(v.pstops.map((s) => String(s[0]))), ac = new Set(actualV.stops.map((s) => String(s[0])));
    return { add: v.pstops.filter((s) => !ac.has(String(s[0]))), rem: actualV.stops.filter((s) => !pc.has(String(s[0]))) };
  })() : null;
  const plSame = !!plDiff && !plDiff.add.length && !plDiff.rem.length;
  const plInfo = plannedV ? plannedInfo(v, vi, vs) : null;
  const gv = plannedV ? { d: v.d, stops: v.pstops, shp: v.pshp || "" } : (cmpOn ? (geoAt(vi) || v) : (ownGeo ? v : (geoNear(vi) || v)));
  const borrowed = !cmpOn && !ownGeo && !plannedV && gv !== v;
  // "מקורב" נמדד על הגרסה שמצוירת בפועל — כשהמפה שאולה מגרסה אחרת,
  // הדיוק שלה הוא של אותה גרסה ולא של האירוע שנבחר
  const approx = !gv.shp && (gv.stops || []).length > 1;
  const cur = toPts(gv) || [];
  // המסלול הקודם מוצג רק כשיש באמת מה להשוות: הגרסה מתעדת שינוי תחנות
  // (כולל הפרש-פער מול "תיעוד ראשון") או שינוי מסלול, או ששתי הגרסאות
  // מדויקות. בלי זה, קירוב-לפי-תחנות מול גאומטריה מלאה מצייר "מסלול ישן"
  // אדום שנראה כמו שינוי אמיתי כשהמסלול בכלל לא השתנה (בקשת שלמה).
  const ROUTE_KINDS = new Set(["route", "redraw", "extend", "shorten", "terminal", "stops", "stops-add", "stops-del"]);
  // צילום מהארכיון / תיעוד-ראשון אינו שינוי: המפה נפתחת נקייה — בלי
  // שכבת "לפני" ובלי סימוני נוספו/ירדו שנראים כאילו קרה משהו (דיווח
  // שלמה, קו 26). כפתור "השווה" עדיין זמין למי שרוצה להשוות במפורש.
  const snapOnly = (v.k === "snapshot" || v.k === "baseline" || v.k === "times")
    && !(v.add || []).length && !(v.rem || []).length;
  // השוואה מפורשת ("השווה") עובדת תמיד — חסימת הצילומים חלה רק על
  // ההשוואה האוטומטית של הכרטיס (התיקון הקודם שבר את ההשוואה, שלמה)
  const comparable = !plannedV && (cmpOn || (!!pv && !snapOnly &&
    (!!(v.add || v.rem) || ROUTE_KINDS.has(v.k) || !!(v.shp && pv.shp))));
  // הגרסה הסמוכה עשויה להיות אירוע-רישום בלי רצף תחנות — ואז "המסלול
  // הקודם" והתחנות שירדו לא צוירו כלל (הבאג שצילם שלמה בקו 35 אשדוד).
  // שואלים את התיעוד הגיאומטרי האחרון שלפני האירוע, כמו במצב השוואה.
  const pgv = plannedV ? actualV : (cmpOn ? (geoAt(pi) || pv)
    : (pv && !(pv.stops || []).length && !pv.shp ? (geoAt(pi) || pv) : pv));
  const prev = plannedV ? (actualV ? toPts(actualV) : null) : (comparable ? toPts(pgv) : null);
  const prevApprox = !!(pgv && prev && !pgv.shp);
  // קובץ 2012 מקבץ את כל הווריאנטים הארציים של המספר — מציגים רק את
  // הרלוונטיים לקו הפתוח (חפיפת מילים עם התחנות/היעד), עם אפשרות לחשוף הכל
  const rel12 = (() => {
    const routes = (d12 && d12.routes) || [];
    if (routes.length <= 1) return routes.map((_, i) => i);
    // התאמת עיר: וריאנט 2012 רלוונטי רק אם עיר של תחנת קצה שלו ("שם - עיר")
    // מופיעה ביעד או בתחנות של הקו הפתוח. מילים גנריות ("תחנה מרכזית",
    // "הרצל") הטעו את הסינון הקודם והכניסו וריאנטים מערים אחרות.
    const hay = String(lf.dest || "") + " " +
      (([...vs].reverse().find((x) => (x.stops || []).length) || {}).stops || []).map((s) => s[1]).join(" ");
    const cityOf = (x) => { const p = String(x || "").split(" - "); return p.length > 1 ? p[p.length - 1].trim() : null; };
    const passCity = (r) => { const a = cityOf(r.f), b = cityOf(r.l); return !!((a && hay.includes(a)) || (b && hay.includes(b))); };
    let rel = routes.map((r, i) => [r, i]).filter((x) => passCity(x[0])).map((x) => x[1]);
    if (!rel.length) {
      const GEN = new Set(["תחנה", "תחנת", "מרכזית", "רכבת", "צומת", "מסוף", "מרכז",
        "קניון", "שוק", "בית", "שדרות", "כביש", "כיכר", "ככר", "דרך", "רחוב"]);
      const tokset = new Set(hay.split(/[^א-ת0-9]+/).filter((w) => w.length >= 3 && !GEN.has(w)));
      const sc = (r) => String((r.f || "") + " " + (r.l || "")).split(/[^א-ת0-9]+/)
        .filter((w) => w.length >= 3 && tokset.has(w)).length;
      rel = routes.map((r, i) => [sc(r), i]).filter((x) => x[0] > 0).map((x) => x[1]);
    }
    return rel.length ? rel : routes.map((_, i) => i);
  })();
  const vis12 = rel12;
  const sel12 = vis12.includes(r12) ? r12 : (vis12[0] ?? 0);
  // מסלול 2012 למפה: רק כשהפאנל פתוח, ורק תחנות שהוצלבו (יש להן קואורדינטות)
  const stops12 = (show12 && d12 && (d12.routes || []).length)
    ? ((d12.routes[sel12] || d12.routes[0]).stops || []).filter((s) => s.length >= 7).map((s) => [s[1], s[5], s[6], s[7] === 1, s[4] && s[4][0]])
    : null;
  const sh12 = (stops12 && s12 && s12.routes && s12.routes[String(sel12)]) || null;
  const shape12 = sh12 ? decodeShape(sh12.pl) : null;
  // כשפותחים את 2012 המפה מציגה רק את מסלול 2012; כפתור מחזיר את שתי השכבות יחד
  const m12only = !!(show12 && only12 && stops12 && stops12.length);
  return (
    <div className="linewrap">
      <div className="card side">
        <button className="back" title="חזרה למסך החיפוש — הטקסט שחיפשתם נשמר" onClick={onBack}>→ חזרה לחיפוש</button>
        {/* לקווי הרכבת אין מספר קו ב-GTFS — הסמל ממלא את מקומו כדי שהתג לא יופיע ריק */}
        <div className="linehead"><span className="badge">{lf.line || TT_ICON[lf.tt] || "—"}</span><span className="dest">{lf.dest}</span>
          {/* שיתוף כמו בהקו המדלג: גיליון השיתוף של הטלפון, ובנפילה — העתקה */}
          <button className="sharebtn" title="שיתוף הקישור לעמוד הקו הזה — כל ההיסטוריה שלו"
            onClick={(e) => {
              // דף-שיתוף ייעודי: מציג בוואטסאפ את שם הקו וסמל האתר, ומקפיץ לדף (בקשת שלמה)
              const url = location.origin + location.pathname.replace(/line-history\/?[^/]*$/, "") + "s/l-" + fsafe(rd) + ".html";
              const b = e.currentTarget;
              // "הועתק" רק אחרי שההעתקה באמת הצליחה; בגיליון השיתוף של
              // הטלפון אין מה להכריז (ציד הבאגים, סבב ב)
              if (navigator.share) { navigator.share({ title: "הקו בזמן — " + (lf.line ? "קו " + lf.line : lf.dest), url }).catch(() => {}); return; }
              const t = b.textContent;
              const done = () => { b.textContent = "✓ הועתק"; setTimeout(() => { b.textContent = t; }, 1500); };
              if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => {});
            }}>🔗 שיתוף</button>
          {/* מעקב לפי קו בודד הוסר (בקשת שלמה 25.08) — הרשמה ברמת עיר בלבד;
              מדף הקו בוחרים סוגי שינוי ותדירות, כמו במרכז (שלמה 13.09) */}
          <LineFollow cities={destCities(lf.dest)} />
        </div>
        {/* "עירוני" פעם אחת בלבד (שלמה 06.09): כשהוא מופיע ליד "נגיש" — התג הנפרד לא מוצג */}
        {/* סוג הקו מרשימת האשכולות של המשרד (ltc), ואם אין — מקובץ הנוסעים (ty); ייחודיות
            (תלמידים/לילה/מזין) ואשכול המכרז — tools/linehistory_ltype.py (שלמה 07.09) */}
        <div className="facts">{lf.op}{(() => { const t = lf.ltc || lf.ty; return t && !(lf.vt && lf.vt.startsWith(t)) ? " · " + t : ""; })()}
          {lf.un && lf.un !== "סדיר" ? " · " + ({ "תלמידים": "קו תלמידים", "לילה": "קו לילה", "קווים מזינים": "קו מזין" }[lf.un] || lf.un) : ""}
          {lf.clu ? " · אשכול " + lf.clu : ""}{lf.tt ? " · " + (TT_LABEL[lf.tt] || "") : ""}
          {/* רציף המוצא לא בשורת הפרטים — רק ליד התחנה ברשימה ובמפה (שלמה 13.09) */}
          {/* נגישות לכיסא גלגלים מגיעה מ-wheelchair_accessible בפיד, והיא
              אחידה לכל נסיעות הקו — ולכן תכונה של הקו. אם תועד אירוע שינוי
              נגישות, התג מציין מאיזה תאריך המצב הנוכחי; שינוי שקרה יחד עם
              שינוי מסלול מסווג route/stops ולא access, ולכן הזיהוי נעזר גם
              בהערה. לקווים שלא נצפה בהם שינוי — תג בלי תאריך, לא תאריך מומצא. */}
          {/* גודל הרכב וסוג הקו מהרישוי נכתבים בביטוי אחד ליד הנגישות —
              "מיניבוס עירוני נגיש" (שלמה 06.09); שינויים בהם — קטגוריה בציר הזמן */}
          {(() => {
            // ביטוי אחד: "מיניבוס עירוני נגיש" — גודל הרכב וסוג הקו מרישוי משרד
            // התחבורה, והנגישות מהפיד הארצי (שלמה 06.09: "פשוט לרשום מיניבוס עירוני
            // נגיש"). "אוטובוס" נשאר כמילה כי "אוטובוס עירוני נגיש" קריא; "לא מוגדר"
            // לא נכתב — נשאר רק סוג הקו.
            const VSZ = { "אוטובוס": "אוטובוס", "מפרקי": "אוטובוס מפרקי", "מיניבוס": "מיניבוס", "מידיבוס": "מידיבוס" };
            const what = [VSZ[lf.vsz] || "", lf.vt || ""].filter(Boolean).join(" ");
            if (lf.wa !== "1" && lf.wa !== "2")
              return what ? <span className="vsz" title="גודל הרכב וסוג הקו שנקבעו לקו ברישוי משרד התחבורה"> · 🚌 {what}</span> : null;
            const chg = [...vs].reverse().find((v) => v.k === "access" || String(v.note || "").includes("הנגישות שוּנתה"));
            const since = chg ? " מאז " + fmtD(chg.d) : "";
            const tip = (lf.wa === "1" ? "לפי הפיד הארצי, הקו מונגש לכיסא גלגלים" : "לפי הפיד הארצי, הקו אינו מונגש לכיסא גלגלים")
              + (chg ? " — השינוי נקלט בפיד ב-" + fmtD(chg.d) : "") + (what ? " · גודל הרכב וסוג הקו לפי רישוי משרד התחבורה: " + what : "");
            // סמל הנגישות רק כשהקו נגיש; לקו שאינו נגיש — סמל אוטובוס והמילים (שלמה 06.09)
            if (lf.wa === "1") return <span className="wa yes" title={tip}> · ♿ {what ? what + " " : ""}נגיש{since}</span>;
            return <span className="wa no" title={tip}> · {what ? "🚌 " + what + " · " : ""}אינו נגיש{since}</span>;
          })()}
          {/* כמה נסיעות מתוכננות יש לחלופה היום. "קיים בפיד" אינו "פועל":
              הפיד מפרסם קווים לפני הפתיחה, והקו הירוק בירושלים נכנס עם
              נסיעה אחת בכיוון מול 680 של הקו הירוק בתל אביב. המספר מוצג
              כעובדה ולא כמסקנה — שליש מהחלופות נוסעות ארבע פעמים ביום או
              פחות (קווי תלמידים, חלופות משנה), ואזהרה עליהן הייתה רעש. */}
          {ntr > 0 && (
            <span title="מספר הנסיעות המתוכננות לחלופה הזו בפיד של היום, לפי לוחות הזמנים שבתוקף">
              {" · "}{ntr === 1 ? "נסיעה אחת ביום" : `${ntr.toLocaleString()} נסיעות ביום`}</span>
          )}
          {" · מק״ט "}<span className="rdnum" dir="ltr">{rdTxt(lf.rd)}</span> · {vs.length} גרסאות מתועדות</div>
        {/* תקופות שבהן הקו לא היה ברישום וחזר — כרטיס "בוטל וחזר" בציר הזמן
            (materializeLf), לא פס טקסט כאן (שלמה 06.09). ביטול שעדיין לא נגמר
            מוצג בהודעת הסטטוס למטה. */}
        {/* רק "שירות לפי דרישה" מקבל הערה, כי היא נושאת מידע שאינו במקום
            אחר: הקו יושב בין קווי האוטובוס ונראה רגיל לחלוטין, ואי אפשר
            לדעת ממנו שהנסיעה מותנית בהזמנה. לשאר הסוגים התווית בשורת
            הפרטים כבר אומרת הכל, והערה נוספת היא רעש. */}
        {lf.historicalOnly && <TipTag cls="mut" tip="הרשומה אינה קובעת אם הקו פועל היום">תיעוד היסטורי</TipTag>}
        {lf.magihim2012Match && <p><a href={"#2012/" + encodeURIComponent(lf.magihim2012Match.key)}>התאמה מוצעת לקו ברשת מגיעים מ־2012 ({lf.magihim2012Match.overlap}% חפיפת תחנות)</a></p>}
        {lf.earlyRelated?.length > 0 && <details className="early-detail"><summary>קובצי GTFS מקוריים מ־2012 לקווים תואמים</summary><p>התאמה לפי מספר קו וחפיפת תחנות לרשת מגיעים שכבר מקושרת לעמוד זה. אינה הוכחה לזהות רציפה לאורך השנים.</p>{lf.earlyRelated.map(e=><p key={e.rd}><a href={"#"+encodeURIComponent(e.rd)}>קו {e.line} · {e.dest}</a> · חפיפה {e.overlap}%</p>)}</details>}
        {lf.tt === "demand" && (
          <div className="ttnote">
            {/* הניסוח הקודם קבע ש"הנסיעה מבוצעת לפי הזמנה מראש". זו פרשנות
                של route_type 715, והנתונים שלנו סותרים אותה: ל-22 מתוך 61
                הקווים האלה מפורסם לוח זמנים עם שעות יציאה ממש. מה שידוע
                הוא הסיווג בפיד, לא אופן ההזמנה בפועל. */}
            🚐 <b>שירות לפי דרישה</b> — כך הקו מסווג בפיד הארצי (route_type 715),
            סיווג שנועד לשירות שאינו יוצא בשעה קבועה. יש קווים בסיווג הזה שכן
            מפורסם להם לוח זמנים, ולכן כדאי לבדוק מול המפעיל איך הנסיעה מוזמנת בפועל.
          </div>
        )}
        {v.k !== "sched" && v.k !== "freq" && <SchedBox rd={rd} vs={vs} selD={sel != null && vs[sel] ? vs[sel].d : null}
          isLast={sel == null || sel >= vs.length - 1} />}
        {anc && !NO_2012.has(lf.tt || "") && (
          <div className="a2012">
            <b>2012</b> · {anc.f} ← {anc.l} · {anc.n} תחנות
            {/* מספר התחנות המשותפות הוא מה שקושר את הקו של אז לקו של היום.
                כשההתאמה נעשתה לפי שם ומספר קו בלבד הוא לא קיים. */}
            {anc.ov && <TipTag cls="a2012ov" tip="מספר התחנות שמופיעות גם במסלול של 2012 וגם במסלול הישן ביותר שידוע לנו — על סמך זה נקבע שמדובר באותו קו">· {anc.ov} תחנות משותפות</TipTag>}
            <button className="a2012btn" title="הצגת רשימת התחנות של הקו כפי שהייתה ב-2012 — כולל המסלול על המפה בקו מקווקו חום" aria-expanded={show12} onClick={() => setShow12(!show12)}>
              {show12 ? "הסתר ▲" : "רצף התחנות ▼"}
            </button>
            {show12 && (d12 ? (d12.routes || []).length ? (
              <div>
                {vis12.length > 1 && (
                  <div className="s12chips">{vis12.map((i) => (
                    <button key={i} className={"rchip12" + (i === sel12 ? " on" : "")} title="מסלול 2012 נוסף של אותו קו — לחיצה מציגה אותו"
                      onClick={() => setR12(i)}>{d12.routes[i].f} ← {d12.routes[i].l} ({d12.routes[i].n})</button>
                  ))}</div>
                )}
                <ol className="s12">
                  {((d12.routes[sel12] || d12.routes[0]).stops || []).map((s) => (
                    <li key={s[0]}>{s[1]}{" "}
                      {s[4] && s[4].length === 1 ? <span className="pcode">מק״ט {s[4][0]}</span>
                        : s[4] && s[4].length > 1 ? <span className="pcode">{s[4].length} מק״טים אפשריים</span>
                          : <span className="pcode">לא הוצלבה</span>}
                    </li>
                  ))}
                </ol>
              </div>
            ) : <div className="mut">הנתונים לא נטענו — נסו לרענן.</div>
              : <div className="mut">טוען…</div>)}
          </div>
        )}
        {sibs && sibs.length > 1 && (
          <div className="sibs">
            <span className="sibt">{sibs.some(s => s.hgroup) ? "מסלולים:" : "חלופות וכיוונים:"}</span>
            {sibs.map((s) => {
              const alt0 = (x) => x.rd.split("-").slice(2).join("-");
              const dir0 = (x) => x.rd.split("-")[1] || "";
              const dir = dir0(s), alt = alt0(s);
              const isBase = alt === "" || alt === "#" || alt === "0";
              const dupDir = sibs.filter((x) => dir0(x) === dir).length > 1;
              const dupBase = dupDir && isBase && sibs.some((x) => x.rd !== s.rd && dir0(x) === dir && ["", "#", "0"].includes(alt0(x)));
              const lbl = s.hgroup ? "מ־" + s.hfrom + " אל " + s.hto : "כיוון " + dir + (isBase
                ? (dupDir ? " · ראשית" + (dupBase ? " (" + (alt || "־") + ")" : "") : "")
                : " · חלופה " + alt);
              return (
                <span key={s.rd} className="sibwrap" style={s.hgroup ? {maxWidth: "100%"} : undefined}>
                  <a className={"sib" + (s.rd === rd ? " on" : "")} title={s.dest}
                    style={s.hgroup ? {minWidth: 0, whiteSpace: "normal", overflowWrap: "anywhere"} : undefined}
                    href={lineHref(s.rd)}
                    onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); if (s.rd !== rd) onSwitch(s.rd); }}>
                    {lbl}
                    {s.lk === "removed" && <span className="sibx">✖</span>}
                  </a>
                  {/* השוואה בין חלופות: עד עכשיו אפשר היה רק לעבור ביניהן,
                      ולהחזיק את ההבדל בראש */}
                  {s.rd !== rd && (
                    <button className="sibcmp" title={"השוואת התחנות והמסלול מול " + lbl}
                      onClick={() => setAltRd(altRd === s.rd ? null : s.rd)}>
                      {altRd === s.rd ? "✕" : "⇄"}</button>
                  )}
                </span>
              );
            })}
          </div>
        )}
        {altRd && (
          <AltCompare rd={rd} altRd={altRd} onClose={() => setAltRd(null)}
            label={(sibs.find((x) => x.rd === altRd) || {}).dest || altRd} />
        )}
        {/* הסטטוס נגזר מהרשומה האחרונה שאינה "תוכנן ולא נכנס לתוקף": תוכנית
            להחזיר קו מבוטל שלא התממשה אינה מבטלת את הביטול */}
        {vs.length > 0 && (() => {
          // וגם לא אירוע נגזר (סוג רכב ברישוי) שתאריכו מאוחר מהביטול
          let li = vs.length - 1;
          while (li > 0 && (vs[li].k === "planned-dropped" || vs[li].syn)) li--;
          const lv = vs[li];
          return lv.k === "removed" && (
          <div className="facts" style={{ color: lineGone ? (KINDS[dispKind(lv, li, vs)] || {}).color : "#c2410c", fontWeight: 700 }}>
            {lineGone
              ? <>❌ הקו בוטל — אין חלופות פעילות — מאז {fmtD(lv.d)}</>
              : <>⚠️ החלופה הזו מבוטלת מאז {fmtD(lv.d)} (לקו יש חלופות פעילות)</>}
            {dispKind(lv, li, vs) === "removed-year" ? " — מעל שנה ולא חזרה" : ""}
          </div>);
        })()}
        {cmpOn && (
          <div className="cmpbar">
            <b>השוואה</b> · {String(vs[pi].d).split("-").reverse().join(".")} ← {String(v.d).split("-").reverse().join(".")}
            {cmpDiff && (
              <span className="cmpsum">
                {cmpDiff.add.length ? ` · ➕ ${cmpDiff.add.length} תחנות` : ""}
                {cmpDiff.rem.length ? ` · ➖ ${cmpDiff.rem.length} תחנות` : ""}
                {!cmpDiff.add.length && !cmpDiff.rem.length ? " · אותן תחנות בדיוק" : ""}
              </span>
            )}
            <button className="cmpx" title="סיום ההשוואה — חזרה להפרש מול הגרסה הקודמת" onClick={() => setCmpI(null)}>✕ סיום</button>
            {cmpDiff && (cmpDiff.add.length || cmpDiff.rem.length) ? (
              <div className="cmplist">
                {cmpDiff.add.length ? <div className="ad">➕ {dedupCount(cmpDiff.add).map(({ x, n: c }) => `${x[1]} (${x[0]})` + (c > 1 ? ` ×${c}` : "")).join(", ")}</div> : null}
                {cmpDiff.rem.length ? <div className="rm">➖ {dedupCount(cmpDiff.rem).map(({ x, n: c }) => `${x[1]} (${x[0]})` + (c > 1 ? ` ×${c}` : "")).join(", ")}</div> : null}
              </div>
            ) : null}
          </div>
        )}
        {kindsHere.length > 1 && initCats && offK.size > 0 && (
          <div className="khint">🔎 מוצגים רק השינויים מהקטגוריה שבחרת בחיפוש. "הכול" מציג את כל השינויים בקו.</div>
        )}
        {kindsHere.length > 1 && (
          <div className="kfilter">
            <button className={"kchip" + (offK.size ? "" : " on")}
              title="הצגת כל סוגי השינויים בקו הזה" onClick={() => setOffK(new Set())}>הכול</button>
            {kindsHere.map(([g, e]) => {
              const off = [...e.kinds].every((k) => offK.has(k));
              return (
                <button key={g} className={"kchip" + (off ? " off" : " on")}
                  style={off ? null : { borderColor: catColor(g), color: catColor(g) }}
                  title={off ? "הדלקה — האירועים האלה יחזרו לרשימה" : "כיבוי — האירועים האלה ייעלמו מהרשימה"}
                  onClick={() => toggleK([...e.kinds], off)}>
                  {KGLABEL[g] || (KINDS[g] || {}).label || g} <b>{e.n}</b>
                </button>
              );
            })}
          </div>
        )}
        {months.length > 1 && (
          <div className="months">
            <button className={"mchip" + (!mon ? " on" : "")} aria-pressed={!mon} title="כל התקופה — בלי סינון לחודש" onClick={() => setMon("")}>הכול</button>
            {months.map((m) => (
              <button key={m} className={"mchip" + (mon === m ? " on" : "")} aria-pressed={mon === m} onClick={() => setMon(m)}>
                {m.split("-").reverse().join(".")} <b>{vs.filter((x) => x.d.slice(0, 7) === m).length}</b>
              </button>
            ))}
          </div>
        )}
        <div className="tl">
          {/* בחירת אירוע חייבת לעבוד גם במקלדת ובקורא מסך (סעיף 4) —
              אבל בלי כפתור-בתוך-כפתור: השורה נשארת לחיצה לעכבר בלבד,
              ותגית הסוג היא הכפתור האמיתי (nested-interactive מהביקורת) */}
          {shown.map(({ v: x, i }) => (
            <div key={x.d + x.k + i} className={"ev" + (i === vs.indexOf(v) ? " sel" : "")}
              onClick={() => selectEvent(i, x)}>
              <div className="d">
                {(() => { const ed = evDate(x); return ed.tip
                  ? <TipTag cls={ed.exact ? "" : "approxd"} tip={ed.tip}>{ed.txt}{ed.exact ? "" : " ≈"}</TipTag>
                  : <span>{ed.txt}</span>; })()}
                {(x.shp || (x.stops || []).length > 1 || (x.pstops || []).length > 1) ? " · 🗺️" : ""}
                {(x.shp || (x.stops || []).length > 1) && (
                <button className={"cmpbtn" + (cmpI === i ? " on" : "")}
                  title={cmpI === i ? "זו גרסת הבסיס להשוואה — לחיצה מבטלת" : "קביעת הגרסה הזו כבסיס, ואז לחיצה על אירוע אחר תשווה מולה"}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (cmpI === i) { setCmpI(null); return; }
                    setCmpI(i);
                    // לחיצה אחת מספיקה: אם האירוע הפתוח הוא הבסיס עצמו אין מה
                    // להשוות, ולכן נפתחת מולו הגרסה העדכנית ביותר.
                    if (vs.indexOf(v) === i) {
                      const last = vs.length - 1;
                      setSel(last === i ? Math.max(0, i - 1) : last);
                    }
                  }}>
                  {cmpI === i ? "⇄ בסיס ההשוואה" : "⇄ השווה"}</button>)}
              </div>
              <div className="t">
                <button className="k kbtn" style={{ background: (KINDS[dispKind(x, i, vs)] || {}).color || "#64748b" }}
                  aria-current={i === vs.indexOf(v)}
                  aria-label={"בחירת האירוע מ-" + evDate(x).txt + ": " + ((KINDS[dispKind(x, i, vs)] || { label: x.k }).label)}
                  onClick={(e) => { e.stopPropagation(); selectEvent(i, x); }}>{(KINDS[dispKind(x, i, vs)] || { label: x.k }).label}</button>
                {x.k === "redraw" && " הגאומטריה תוקנה — רצף התחנות לא השתנה"}
                {/* שינוי שרצף התחנות חזר ממנו מיד. בלי הסימון הזה השורה
                    אומרת שתחנות ירדו, בעוד הקו עוצר בהן עד היום. */}
                {x.rv ? (
                  <TipTag cls="rvflag" tip="רצף התחנות חזר בדיוק למה שהיה לפני השינוי הזה. שינוי שמתבטל מיד הוא כמעט תמיד תנודה בפרסום ולא שינוי במסלול">
                    ↩ חזר כעבור {x.rv === 1 ? "יום" : x.rv + " ימים"}</TipTag>
                ) : x.rvb ? (
                  <TipTag cls="rvflag" tip="השינוי הקודם התבטל כאן — רצף התחנות חזר למה שהיה לפניו">
                    ↩ החזרת המצב הקודם</TipTag>
                ) : null}
                {/* הד: אותן תחנות נוספו ואותן ירדו כבר קודם בחלופה אחרת של הקו (קווי אשדוד: 19.07 בחלופות
                    הראשיות, 13.09 בחלופה 6). זה שינוי אמיתי בחלופה הזאת — נשאר ומדווח — אבל אומרים
                    שהוא כבר נכנס קודם בחלופה אחרת (שלמה 16.09) */}
                {x.echo ? (
                  <TipTag cls="rvflag" tip={"אותן תחנות נוספו ואותן תחנות ירדו כבר ב-" + fmtD(x.echo.d) + " בחלופה " + x.echo.rd + " של הקו. עכשיו השינוי הגיע גם לחלופה הזאת"}>
                    ↻ השינוי כבר נכנס ב-{fmtD(x.echo.d)} בחלופה {x.echo.rd}; עכשיו גם בחלופה הזאת</TipTag>
                ) : null}
                {x.note && x.k !== "planned-dropped" && <span className="evnote"> {noteFix(x.note)}</span>}
              </div>
              {/* מאיפה האירוע הזה הגיע. ההערות אמרו "מארכיון הפיד הארצי"
                  בלי לנקוב בשם, ואי אפשר היה לדעת מה נמדד ומי מדד. */}
              <div className="evsrc">{x.k === "vehicle" ? SRC_LABEL.rishui : x.k === "ltype" ? SRC_LABEL.ctl : (SRC_LABEL[x.src] || SRC_LABEL._daily)}</div>
              {/* שינוי שתוכנן ולא נכנס לתוקף: מה קרה בסוף, שני התאריכים (מתי היה
                  אמור להיכנס, מתי ירד), ומה התוכנית הייתה משנה — במקום מספר
                  התחנות (שלמה 05.09) */}
              {x.k === "planned-dropped" && (x.ps || x.pc) && (() => { const p = plannedInfo(x, i, vs); return (
                <div className="sub">
                  <div><PlanStatus p={p} /> · 📅 היה אמור להיכנס ב-<b>{fmtD(x.ps)}</b>
                    {x.pc && x.ps && x.pc >= x.ps ? <> · ירד מהרישום ב-<b>{fmtD(x.pc)}</b></> : <> · בוטל ב-<b>{fmtD(x.pc || x.d)}</b>, לפני המועד</>}
                    {x.sd && gapDays(x.sd, x.pc || x.d) > 1 ? <> (נראה לאחרונה ב-{fmtD(x.sd)})</> : null}
                    {x.pf ? <> · פורסם לראשונה ב-{fmtD(x.pf)}</> : null}</div>
                  <PlanLines p={p} max={8} />
                </div>); })()}
              {(x.add || x.rem) && (() => {
                // הזיהוי לפי מספר תחנה (x.ac/x.rc, מיושרים לשמות) — השם תצוגה
                const addE = (x.add || []).map((n, j) => ({ n, c: x.ac && x.ac[j] != null ? String(x.ac[j]) : null }));
                const remE = (x.rem || []).map((n, j) => ({ n, c: x.rc && x.rc[j] != null ? String(x.rc[j]) : null }));
                const pm = splitPlatformMoves(addE, remE);
                // החלפת מק"ט (אותו שם, אותו מיקום) היא אירוע של רישום
                // התחנות, לא של הקו — לא מוצגת כאן בכלל (בקשת שלמה)
                const rn = splitRenumbers(pm.add, pm.rem, i);
                if (!pm.moves.length && !rn.add.length && !rn.rem.length) return null;
                return (
                  <div className="sub">
                    {pm.moves.map((m, k) => <div key={k}>🔀 מעבר רציף: {m.base} — מרציף {m.from} לרציף {m.to}</div>)}
                    {rn.add.length > 0 && <div>➕ נוספו: {labelList(rn.add, i, true)}</div>}
                    {rn.rem.length > 0 && <div>➖ ירדו: {labelList(rn.rem, i, false)}</div>}
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      </div>
      <div className="card main" ref={detailRef}>
        <div className="vhead">
          {plannedV ? (plKind === "new" ? <>קו שפורסם להתחלה ב-<b>{fmtD(v.ps)}</b> ולא נכנס לפעול</> : <>שינוי תחנות שפורסם ל-<b>{fmtD(v.ps)}</b> ולא נכנס לפעול</>)
            : cmpOn ? <>השוואה שביקשת: <b>{evDate(v).txt}</b> מול <b>{evDate(pv).txt}</b></>
            : <>גרסת <b>{evDate(v).txt}</b>{prev ? <> מול הגרסה שלפניה (<b>{evDate(pv).txt}</b>)</> : pv ? "" : " — הגרסה המתועדת הראשונה"}</>}
        </div>
        {plannedV && (
          <div className="mut">
            {v.pc && v.ps && v.pc >= v.ps ? <>ירד מהרישום ב-<b>{fmtD(v.pc)}</b></> : <>בוטל ב-<b>{fmtD(v.pc || v.d)}</b>, לפני המועד</>}
            {v.pf ? <> · פורסם לראשונה ב-{fmtD(v.pf)}</> : null}
            {" · "}המסלול שתוכנן במקווקו{actualV
              ? (actualV === plInfo.base
                ? <>; המסלול שהקו נסע בו לפני התוכנית ({plInfo.removedAt ? <>עד {fmtD(plInfo.removedAt)}</> : <>מ-{fmtD(actualV.d)}</>}) באפור</>
                : <>; המסלול שנכנס בפועל, מ-{fmtD(actualV.d)}, באפור</>)
              : <>; הווריאנט לא נסע מעולם</>}.
          </div>
        )}
        {plannedV && (
          <div className="mut" style={{ fontWeight: 700 }}>
            {plKind === "new"
              ? (plInfo.entered ? <>מה לא יצא לפועל: מועד ההתחלה בלבד. הווריאנט התחיל ב-{fmtD(plInfo.entered.d)} באותו מסלול, ולכן שתי השכבות במפה חופפות.</>
                : plInfo.changed ? <>מה לא יצא לפועל: הווריאנט במסלול הזה. בפועל התחיל ב-{fmtD(plInfo.changed.d)} במסלול שונה.</>
                : plInfo.base ? <>מה לא יצא לפועל: חזרת הווריאנט. {plInfo.removedAt ? <>נסע עד {fmtD(plInfo.removedAt)}</> : <>תועד נוסע לאחרונה ב-{fmtD(plInfo.base.d)}</>}, פורסם לחזור ב-{fmtD(v.ps)} ולא חזר.</>
                : <>מה לא יצא לפועל: הווריאנט כולו. פורסם עם תאריך התחלה, ירד לפני שהתחיל ולא נסע מעולם.</>)
              : (plInfo.entered ? <>מה לא יצא לפועל: המועד בלבד. השינוי נכנס בסוף ב-{fmtD(plInfo.entered.d)}.</>
                : plInfo.changed ? <>מה לא יצא לפועל: השינוי שמפורט כאן. מה שנכנס ב-{fmtD(plInfo.changed.d)} היה שונה ממנו.</>
                : plInfo.goneAt ? <>מה לא יצא לפועל: השינוי שמפורט כאן. הקו עצמו ירד מהרישום ב-{fmtD(plInfo.goneAt)}.</>
                : <>מה לא יצא לפועל: השינוי שמפורט כאן. {plInfo.base ? "המסלול נשאר כפי שהיה." : "עד היום לא נכנס."}</>)}
            <div className="sub" style={{ fontWeight: 400 }}>
              <PlanLines p={plInfo} max={20} />
            </div>
          </div>
        )}
        {/* אי-הוודאות אינה בפער שבין שתי הגרסאות: המנוע עובר על כל צילומי
            הארכיון, ולכן פער ארוך בין גרסאות פירושו שהמסלול באמת לא השתנה
            לאורכו. אי-הוודאות היחידה היא המרווח בין שני צילומים סמוכים,
            וזה בדיוק מה ש-'sd' מודד. */}
        {!cmpOn && !evDate(v).exact && (
          <div className="gapwarn">
            <TipTag cls="mut" tip={evDate(v).tip}>תאריך משוער</TipTag>
          </div>
        )}
        {v.k === "times" && v.tb ? (
          /* הלו"ז האחרון של קו מבוטל — צילום מהארכיון (בקשת המשתמש): קו
             שבוטל בלי שום אירוע לו"ז מקבל, שנה אחרי הביטול, את שעות-היציאה
             שלו מיום-הארכיון האחרון שבו פעל */
          <div className="tsnap-wrap">
            <div className="mut">ℹ️ {noteFix(v.note)} — נכון ל-{fmtD(v.d)}, היום האחרון שבו הקו מופיע בארכיון.</div>
            <table className="tsnap"><tbody>
              {v.tb.map(([label, ts]) => (
                <tr key={label}>
                  <th>{label}</th>
                  <td>{ts.split(",").map((t, ti) => <span key={ti} className="tt">{t}</span>)}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        ) : !gv.shp && !((gv.stops || []).length > 1) ? (
          <div className="nogeo">
            ℹ️ {noteFix(v.note) || "אין פירוט לגרסה זו"}<br />
            <span className="mut">רשומת-עבר מארכיון אופן באס (הסדנא לידע ציבורי) — המסלול המדויק לא זמין לתקופה זו. רצף התחנות יושלם במילוי הלילי משלב ב׳.</span>
          </div>
        ) : (<>
        {/* ההשוואה עונה על "מה השתנה", אבל לא על "איך הקו נראה עכשיו" —
            שתי השכבות יחד מקשות לקרוא את המסלול עצמו. הכפתור מסיר את
            שכבת העבר ומשאיר את המסלול המלא כפי שהוא אחרי השינוי. */}
        {!m12only && prev && !plannedV && (
          <div className="onlycur">
            <button className={"kchip" + (onlyCur ? "" : " on")}
              style={onlyCur ? {} : { borderColor: "#7c3aed", color: "#5b21b6" }}
              onClick={() => setOnlyCur(false)}>⇄ מה השתנה</button>
            <button className={"kchip" + (onlyCur ? " on" : "")}
              style={onlyCur ? { borderColor: "#7c3aed", color: "#5b21b6" } : {}}
              onClick={() => setOnlyCur(true)}>🚌 המסלול המלא אחרי השינוי</button>
          </div>
        )}
        {/* חלונית 2012 פתוחה: ברירת המחדל היא מסלול 2012 לבד, כי שתי השכבות
            יחד מקשות לקרוא איך הקו נסע אז; הכפתור השני מציג את שתיהן. */}
        {show12 && stops12 && stops12.length > 0 && (
          <div className="onlycur">
            <button className={"kchip" + (only12 ? " on" : "")}
              style={only12 ? { borderColor: "#78350f", color: "#78350f" } : {}}
              onClick={() => setOnly12(true)}>🕰️ רק מסלול 2012</button>
            <button className={"kchip" + (only12 ? "" : " on")}
              style={only12 ? {} : { borderColor: "#78350f", color: "#78350f" }}
              onClick={() => setOnly12(false)}>⇄ 2012 והיום יחד</button>
          </div>
        )}
        {!m12only && borrowed && (
          <div className="mut">ℹ️ האירוע עצמו אינו נושא מסלול — המפה מציגה את המסלול המתועד
            {gv.d < v.d ? " האחרון לפני האירוע" : " הראשון אחרי האירוע"}, מ-{fmtD(gv.d)}.</div>
        )}
        {!m12only && !cmpOn && !onlyCur && !plannedV && prev && pgv !== pv && (
          <div className="mut">ℹ️ לגרסה הקודמת הסמוכה אין רצף תחנות מתועד — "המסלול הקודם" והתחנות שירדו מוצגים מהתיעוד האחרון שלפני האירוע, מ-{fmtD(pgv.d)}.</div>
        )}
        {/* addedCodes: codeOf מצפה לאינדקס גרסה (vi) — האינדקס בתוך רשימת
            ➕ גרם לסריקה מהגרסאות הישנות ביותר, ותחנה עם שם זהה ומק"ט אחר
            מהעבר קיבלה את הסימון הירוק במקום התחנה שבאמת נוספה */}
        <DiffMap key={v.d + v.k + (cmpOn ? "c" + cmpI : "") + (onlyCur ? "o" : "") + (m12only ? "12" : "")}
          cur={m12only ? [] : cur} prev={onlyCur || m12only ? null : prev} planned={plannedV && !m12only}
          approx={cmpOn ? !gv.shp : approx} prevApprox={prevApprox} curStops={m12only ? [] : gv.stops}
          prevStops={m12only ? null : plannedV ? (plDiff && !plSame ? actualV.stops : null) : (!onlyCur && comparable && pgv && (pgv.stops || []).length ? pgv.stops : null)}
          addedCodes={!m12only && !onlyCur && (!pv || !(pv.stops || []).length) && (v.add || []).length
            ? new Set((v.add || []).map((n, j) => (v.ac && v.ac[j] != null ? String(v.ac[j]) : codeOf(n, vi, true))).filter(Boolean)) : null}
          stops12={onlyCur ? null : stops12} shape12={onlyCur ? null : shape12}
          sg={onlyCur || cmpOn || m12only ? null : (v.sg || null)}
          plats={m12only ? null : rdPlat}
          remPins={onlyCur || cmpOn || m12only ? null : remPinsOf(v, vi, gv).pins} />
        {/* תחנה שירדה ואין לה מיקום באף מקור — נאמרת במפורש, לא נעלמת */}
        {!cmpOn && !onlyCur && !m12only && (() => {
          const un = remPinsOf(v, vi, gv).unplaced
            .filter((n) => !(((pgv && pgv.stops) || []).some((s) => s && s[1] === n)));
          return un.length ? (
            <div className="mut">ℹ️ תחנות שירדו שאין להן מיקום באף תיעוד, ולכן אינן מסומנות במפה: {un.join(", ")}</div>
          ) : null;
        })()}
        <div className="legend">
          {m12only ? null : plannedV ? <>
            <span><i style={{ borderColor: "#9f1239", borderStyle: "dashed" }} /> המסלול שתוכנן ולא יצא לפועל</span>
            {prev && <span><i style={{ borderColor: "#475569" }} /> המסלול בפועל של הווריאנט</span>}
            {plDiff && !plSame && <span><span className="dot" style={{ background: "#16a34a" }} /> תחנה שתוכננה ואינה במסלול בפועל</span>}
            {plDiff && !plSame && <span><span className="dot" style={{ background: "#fff", border: "3px solid #dc2626" }} /> תחנה במסלול בפועל שלא הייתה בתוכנית</span>}
          </> : <>
          {prev && !onlyCur && <span><i style={{ borderColor: "#dc2626", borderStyle: "dashed" }} /> המסלול הקודם{prevApprox ? " (מקורב לפי תחנות)" : ""}</span>}
          <span><i style={{ borderColor: prev && !onlyCur ? "#16a34a" : "#4c1d95" }} /> {prev && !onlyCur ? "המסלול החדש" : "המסלול"}</span>
          <span><span className="dot" style={{ background: "#16a34a" }} /> תחנה שנוספה</span>
          <span><span className="dot" style={{ background: "#fff", border: "3px solid #dc2626" }} /> תחנה שירדה</span>
          </>}
          {stops12 && stops12.length > 1 && <span><i style={{ borderColor: "#78350f", borderStyle: "dashed" }} /> {sh12
            ? `מסלול משוער 2012 — חישוב על כבישי היום דרך ${sh12.n} מ-${sh12.tot} התחנות שמיקומן ידוע`
            : "מסלול 2012 (קו ישר דרך התחנות שהוצלבו)"}</span>}
        </div>
        {!cmpOn && !onlyCur && !m12only && v.sg && ((v.sg.n || []).length + (v.sg.o || []).length > 0) && (
          <div className="mut">🔍 הקטע ששונה שורטט במדויק מצילומי הארכיון — אדום מקווקו = הקטע הישן, ירוק = החדש. שאר המסלול עשוי להיות מקורב.</div>
        )}
        {v.shpref
          ? <div className="mut">ℹ️ רצף התחנות בצילום זהה לגרסה הסמוכה — מוצג המסלול המלא שלה במקום קו מקורב. {(v.stops || []).length} תחנות בגרסה זו.</div>
          : plannedV
          ? <div className="mut">ℹ️ {gv.shp ? "השרטוט המלא של המסלול שתוכנן, כפי שפורסם בפיד" : "המסלול שתוכנן מצויר כקו ישר בין התחנות — לתוכנית הזו לא נשמר שרטוט"}.</div>
          : approx
          ? <div className="mut">ℹ️ מסלול מקורב — קו ישר בין התחנות לפי רצף מארכיון אופן באס; הגאומטריה המלאה לא זמינה לתקופה זו. {(gv.stops || []).length} תחנות{borrowed ? " בגרסה המוצגת" : " בגרסה זו"}.</div>
          : <div className="mut">{(gv.stops || []).length} תחנות{borrowed ? " בגרסה המוצגת" : " בגרסה זו"}.</div>}
        </>)}
        {(v.tl || v.tn) && <TimesDiff tl={v.tl} tn={v.tn} />}
      </div>
    </div>
  );
}

/* ---------- מפת אירוע תחנה: מיקום ישן מול חדש ---------- */
function StopEvMap({ ev }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current, { scrollWheelZoom: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>', maxZoom: 19,
    }).addTo(map);
    const pts = [[ev.la, ev.lo]];
    if (ev.k === "moved" && ev.ola != null) {
      pts.push([ev.ola, ev.olo]);
      L.polyline([[ev.ola, ev.olo], [ev.la, ev.lo]], { color: "#2563eb", weight: 3, dashArray: "5 7", opacity: 0.9 }).addTo(map);
      L.circleMarker([ev.ola, ev.olo], { radius: 9, color: "#dc2626", weight: 3, fillColor: "#fff", fillOpacity: 1 })
        .addTo(map).bindPopup(`<b>המיקום הישן</b><br><span class="pcode" dir="ltr">(${ev.ola}, ${ev.olo})</span>`, { className: "lh-pop" });
    }
    L.circleMarker([ev.la, ev.lo], { radius: 9, color: "#fff", weight: 2,
      fillColor: ev.k === "moved" ? "#16a34a" : ((SKINDS[ev.k] || {}).color || "#2563eb"), fillOpacity: 1 })
      .addTo(map).bindPopup(`<b>${esc(ev.n || ev.nn || "")}</b>${ev.k === "moved" ? "<br>המיקום החדש" : ev.k === "gtfs2012" ? "<br>המיקום ברישום 2012" : ""}<br><span class="pcode" dir="ltr">(${ev.la}, ${ev.lo})</span>`, { className: "lh-pop" });
    map.fitBounds(L.latLngBounds(pts).pad(0.6), { maxZoom: 17 });
    return () => map.remove();
  }, [ev]);
  return <div className="smap" ref={ref} role="img"
    aria-label={ev.k === "moved" ? "מפה: הזזת התחנה מהמיקום הישן לחדש, " + (ev.dist || ev.m || "") + " מטרים" : ev.k === "gtfs2012" ? "מפה: מיקום התחנה ברישום 2012" : "מפה: מיקום התחנה " + (ev.n || ev.nn || "")} />;
}

/* ---------- עמוד קו של 2012 ---------- */
// קו של 2012 נפתח קודם כרשימת תחנות בתוך שורה בפיד, בלי מפה ובלי כתובת
// משלו. זה עמוד לכל דבר: מסלול על המפה דרך התחנות שהוצלבו למק"ט, רצף
// התחנות, ומעבר לקו של היום כשיש כזה.
function Map2012({ stops, shape }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current, { scrollWheelZoom: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>', maxZoom: 19,
    }).addTo(map);
    // מיקום התחנה: מרישום התחנות של 2012 עצמו (GTFS יוני 2012 דרך OpenStreetMap,
    // changeset 12028672 — s[7] === 1), ואם התחנה לא נמצאה שם, מהרישום של היום. תחנה שלא
    // הוצלבה למק"ט אינה על המפה. כשחושב מסלול משוער על הכבישים (shape,
    // tools/shape_2012.py) הוא מצויר; אחרת קו ישר בין התחנות, מקווקו.
    const pts = stops.filter((s) => s[5] != null && s[6] != null).map((s) => [s[5], s[6]]);
    const road = shape && shape.length > 1 ? shape : null;
    if (road) L.polyline(road, { color: "#78350f", weight: 5, opacity: 0.85, dashArray: "10 7" }).addTo(map);
    else if (pts.length > 1) L.polyline(pts, { color: "#78350f", weight: 4, opacity: 0.85, dashArray: "6 8" }).addTo(map);
    stops.forEach((s, i) => {
      if (s[5] == null) return;
      const last = i === stops.length - 1;
      L.circleMarker([s[5], s[6]], { radius: i === 0 || last ? 8 : 5, weight: 2,
        color: i === 0 || last ? "#fff" : "#78350f",
        fillColor: i === 0 ? "#16a34a" : last ? "#dc2626" : "#fff", fillOpacity: 1 })
        .addTo(map).bindPopup(`<b>${esc(s[1])}</b><br><span class="pst">תחנה ${s[0]} במסלול 2012</span>` +
          (s[4] && s[4].length === 1 ? `<br><span class="pcode">מק״ט ${esc(String(s[4][0]))}</span>` : ""),
          { className: "lh-pop", offset: [0, -4] });
    });
    const all = pts.concat(road || []);
    if (all.length) map.fitBounds(L.latLngBounds(all).pad(0.15), { maxZoom: 16 });
    else map.setView([31.5, 34.9], 8);
    return () => map.remove();
  }, [stops, shape]);
  return <div className="map" ref={ref} role="img"
    aria-label={"מפת מסלול 2012 דרך " + (stops || []).filter((x) => x[5] != null).length + " תחנות שהוצלבו למיקום"} />;
}

function Line2012Page({ k12, anchorRd, openLine, onBack }) {
  const [d, setD] = useState(null);
  const [sh, setSh] = useState(null);     // מסלולים משוערים על הכבישים, אם חושבו
  const [ri, setRi] = useState(0);
  useEffect(() => {
    setD(null); setSh(null); setRi(0);
    fetch("../magihim-2012/data/l" + k12 + ".json?v=" + BUILD)
      .then((r) => (r.ok ? r.json() : null)).then(setD).catch(() => setD(false));
    dfetch("../magihim-2012/data/shapes/l" + k12 + ".json")
      .then((r) => (r.ok ? r.json() : { routes: {} })).then(setSh).catch(() => setSh({ routes: {} }));
  }, [k12]);
  if (d === null) return <div className="card">טוען…</div>;
  if (!d) return <div className="card"><button className="back" onClick={onBack}>→ חזרה</button>
    <div className="empty">הקו לא נמצא בצילום 2012.</div></div>;
  const r = (d.routes || [])[ri] || (d.routes || [])[0] || { stops: [] };
  const stops = r.stops || [];
  const matched = stops.filter((s) => s[5] != null).length;
  const rsh = (sh && sh.routes && sh.routes[String((d.routes || []).indexOf(r))]) || null;
  const shape = rsh ? decodeShape(rsh.pl) : null;
  return (
    <div className="card">
      <button className="back" onClick={onBack}>→ חזרה</button>
      <div className="linehead">
        <span className="badge">{d.no}</span>
        <span className="dest">{d.dest}</span>
        <span className="k" style={{ background: "#78350f" }}>צילום 2012</span>
        {/* שיתוף כמו בעמוד קו של היום: דף-שיתוף ייעודי (s/k-*.html) שמציג בוואטסאפ
            את מספר הקו ואת סמל האתר — לקווי 2012 לא היה כזה (שלמה 07.09) */}
        <button className="sharebtn" title="שיתוף הקישור לקו הזה כפי שהיה ב-2012"
          onClick={(e) => {
            const url = location.origin + location.pathname.replace(/line-history\/?[^/]*$/, "") + "s/k-" + fsafe(k12) + ".html";
            const b = e.currentTarget;
            if (navigator.share) { navigator.share({ title: "הקו בזמן — קו " + (d.no || k12) + " (2012)", url }).catch(() => {}); return; }
            const t = b.textContent;
            const done = () => { b.textContent = "✓ הועתק"; setTimeout(() => { b.textContent = t; }, 1500); };
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => {});
          }}>🔗 שיתוף</button>
      </div>
      <div className="facts">{d.an} · {stops.length} תחנות · {(d.routes || []).length} מסלולים ·
        {" "}{matched} תחנות הוצלבו למק"ט · {stops.filter((s) => s[7] === 1).length} מהן מרישום 2012 עצמו
        {anchorRd && <> · <a className="totoday" href={lineHref(anchorRd)}
          onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); openLine(anchorRd); }}>הקו של היום ←</a></>}
      </div>
      {(d.routes || []).length > 1 && (
        <div className="s12chips">{d.routes.map((x, i) => (
          <button key={x.rid} className={"rchip12" + (i === ri ? " on" : "")} onClick={() => setRi(i)}>
            {x.f} ← {x.l} ({x.n})</button>
        ))}</div>
      )}
      <Map2012 stops={stops} shape={shape} />
      <div className="legend">
        <span><i style={{ borderColor: "#78350f", borderStyle: "dashed" }} /> {rsh
          ? `מסלול משוער — חישוב על כבישי היום דרך ${rsh.n} מ-${rsh.tot} התחנות, כ-${(rsh.m / 1000).toFixed(1)} ק"מ`
          : "מסלול 2012 (קו ישר דרך התחנות שהוצלבו)"}</span>
        <span><i className="dot" style={{ background: "#16a34a" }} /> ראשונה</span>
        <span><i className="dot" style={{ background: "#dc2626" }} /> אחרונה</span>
      </div>
      <ol className="s12">
        {stops.map((s) => (
          <li key={s[0]}>{s[1]}{" "}
            {s[4] && s[4].length === 1 ? <span className="pcode">מק״ט {s[4][0]}</span>
              : s[4] && s[4].length > 1 ? <span className="pcode">{s[4].length} מק״טים אפשריים</span>
                : <span className="pcode">לא הוצלבה</span>}
          </li>
        ))}
      </ol>
      <div className="katnote">ℹ️ תחנות המסומנות "2012": המק"ט והמיקום מרישום התחנות של משרד התחבורה מיוני 2012 (קובץ GTFS),
        כפי שיובא ל-<a href="https://www.openstreetmap.org/changeset/12028672" target="_blank" rel="noopener">OpenStreetMap ב-26.06.2012</a> (33,055 תחנות, רישיון ODbL).
        רישום 2012 קודם לכל הצלבה אחרת; תחנה שלא נמצאה בו הוצלבה לרישום התחנות של היום. תחנה שלא הוצלבה כלל אינה מופיעה על המפה{rsh
          ? ", והמסלול ביניהן הוא הערכה: נסיעת אוטובוס בכבישים של היום דרך התחנות הידועות, לפי הסדר. כביש שנפתח מאז 2012 או תחנה שלא הוצלבה יכולים לעקם אותו."
          : ", ולכן הקו מקווקו."}</div>
    </div>
  );
}

/* ---------- שינויים לפי יום (כל הקווים) ---------- */
/* ---------- תוצאות מצילום 2012 ---------- */
// חיפוש "548" החזיר את הקו כפי שהוא היום — קרית מלאכי לכפר חב"ד — ולא רמז
// שב-2012 היה 548 אחר, של אגד, מקרית מלאכי לבני ברק. הוא לא נעלם מהאתר:
// הוא נמצא רק בצילום 2012, כי הארכיון של הפיד מתחיל במרץ 2017 והקו כבר לא
// היה שם. מי שמחפש מספר קו צריך לראות גם את זה.
// חיפוש בקווי 2012: "1 קרית מלאכי" = מספר קו + טקסט (שלמה 06.09: החיפוש לא
// מצא כלום, כי המחרוזת כולה הושוותה למספר הקו). התוצאות ממוינות לפי מספר
// הקו, ומספר מדויק לפני מספר שרק מתחיל כך (חיפוש "קרית מלאכי" החזיר את 301 ראשון).
function parse12(needle) {
  const m = /^\s*(\d+[א-ת]?)?\s*(.*)$/.exec(needle || "");
  return { no: (m && m[1]) || "", text: ((m && m[2]) || "").trim() };
}
function match12(v, needle) {
  const { no, text } = parse12(needle);
  if (!no && !text) return true;
  const vno = String(v.no || "");
  if (no && !(vno === no || (!text && vno.startsWith(no)))) return false;
  if (text && !((v.dest || "").includes(text) || (v.an || "").includes(text))) return false;
  return true;
}
function lineNum(no) { const m = /^(\d+)/.exec(String(no || "")); return m ? parseInt(m[1], 10) : 1e9; }
function sort12(list, needle) {
  const { no } = parse12(needle);
  return list.slice().sort((a, b) => {
    if (no) { const ea = String(a.no) === no ? 0 : 1, eb = String(b.no) === no ? 0 : 1; if (ea !== eb) return ea - eb; }
    return lineNum(a.no) - lineNum(b.no) || String(a.no).localeCompare(String(b.no), "he") || (a.dest || "").localeCompare(b.dest || "", "he");
  });
}
function Res2012({ needle, onOpen }) {
  const [idx12, setIdx12] = useState(null);
  useEffect(() => {
    if (!needle || idx12) return;
    fetch("../magihim-2012/data/index.json?v=" + BUILD)
      .then((r) => (r.ok ? r.json() : { lines: [] }))
      .then(setIdx12).catch(() => setIdx12({ lines: [] }));
  }, [needle, idx12]);
  if (!needle || !idx12) return null;
  const list = sort12((idx12.lines || []).filter((v) => match12(v, needle)), needle).slice(0, 12);
  if (!list.length) return null;
  return (
    <div className="r12">
      <div className="r12head">בצילום 2012 נמצאו גם <b>{list.length}</b> קווים תואמים —
        רשת מגיעים, חמש שנים לפני תחילת הארכיון</div>
      {list.map((v) => (
        <a key={v.k} className="lrow" href={"#2012/" + v.k}
          onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); onOpen(v.k); }}>
          <span className="badge sm">{v.no}</span>
          <span className="k" style={{ background: "#78350f" }}>2012</span>
          <span className="ldest">{v.dest}</span>
          <span className="lmeta">{v.an} · {v.ns} תחנות · רצף התחנות ←</span>
        </a>
      ))}
    </div>
  );
}

/* ---------- שינויים לפי יום (כל הקווים) ---------- */
/* ---------- ביטולים ---------- */
// היה כאן מסך מקובץ משלו — כותרת, מונים ושורת שנים. זו הייתה קטגוריה בתוך
// קטגוריה: מי שמסמן "מבוטל" מצפה לרשימת הקווים הרגילה, כמו בכל קטגוריה
// אחרת, ולא למסך אחר עם חוקים אחרים. הביטולים מוצגים ברשימה הרגילה.

// Display grouping only. Historic route IDs and current license IDs never merge.
function attach2012Groups(idx, data) {
  const rows = new Map((idx.lines || []).map(l => [l.rd, l]));
  const tags = new Map();
  for (const g of data.groups || []) {
    const members = g.members.map(([id, from, to]) => ({rd: "archive2012r" + id + "-0-H", from, to}));
    const valid = members.every(m => {
      const l = rows.get(m.rd), parts = String(l?.dest || "").split("<->");
      const cities = parts.map(p => p.slice(p.lastIndexOf("-") + 1).trim().replace(/\s+/g, " ")).sort();
      return l && l.op === g.op && l.line === g.line && parts.length === 2 &&
        JSON.stringify(cities) === JSON.stringify(g.cities) && !tags.has(m.rd);
    });
    if (!valid || members.length < 2) continue;
    const key = "historical-2012:" + members[0].rd;
    for (const m of members) tags.set(m.rd, {hgroup: key, hfrom: m.from, hto: m.to});
  }
  return {...idx, lines: idx.lines.map(l => tags.has(l.rd) ? {...l, ...tags.get(l.rd)} : l)};
}
function collapse2012Rows(rows, meta = null) {
  const seen = new Set();
  return rows.filter(r => {
    const m = meta ? meta[r.rd] : r;
    if (!m?.hgroup || (meta && !["snapshot", "baseline"].includes(r.k))) return true;
    const key = m.hgroup + (meta ? ":" + r.d + ":" + r.k : "");
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
function lineSiblings(idx, rd) {
  const lines = idx?.lines || [], current = lines.find(l => l.rd === rd);
  return current?.hgroup ? lines.filter(l => l.hgroup === current.hgroup)
    : lines.filter(l => l.rd.split("-")[0] === rd.split("-")[0]);
}

function DayFeed({ idx, openLine, open12, onBack, kats, embedded, mode = "lines" }) {
  const citySearch = useRouteCities();
  const earlyMonths = useHistoricalMonths(mode);
  const [regularMonths, setRegularMonths] = useState([]);
  const [months, setMonths] = useState(null);
  // השנה והחודש שנבחרו נשמרים ללשונית: פתיחת קו וחזרה החזירו ל-2026 (שלמה 13.09)
  const [yr, setYr] = useState(() => { try { return location.hash === "#t=early" ? "2012" : sessionStorage.getItem("lh-day-yr-"+mode) || ""; } catch (e) { return ""; } });
  const [mon, setMon] = useState(() => { try { return location.hash === "#t=early" ? "2012-07" : sessionStorage.getItem("lh-day-mon-"+mode) || ""; } catch (e) { return ""; } });
  useEffect(() => { try { sessionStorage.setItem("lh-day-yr-"+mode, yr); sessionStorage.setItem("lh-day-mon-"+mode, mon); } catch (e) { /* ignore */ } }, [yr, mon]);
  const [chs, setChs] = useState(null);
  const [q, setQ] = usePersistedQ("lh-q-day");
  const [lim, setLim] = useState(300);
  const [dayF, setDayF] = useState(null);   // לחיצה על כותרת יום מציגה רק אותו
  useEffect(() => setLim(300), [q, mon]);
  useEffect(() => setDayF(null), [mon]);
  // יעד ומפעיל לא משוכפלים בקובצי החודש — נשלפים מהאינדקס לפי מק"ט
  const meta = useMemo(() => { const m = {}; ((idx && idx.lines) || []).forEach((l) => { m[l.rd] = l; }); return m; }, [idx]);
  // לשונית 2012: כל קווי הצילום. כל שורה מובילה לעמוד של אותו קו כפי
  // שהיה ב-2012 — מפה ורצף תחנות — ולא נפתחת בתוך השורה
  const [a12, setA12] = useState(null);
  const [idx12, setIdx12] = useState(null);
  useEffect(() => { getAnchors2012().then((d) => setA12(d.anchors || {})); }, []);
  useEffect(() => {
    dfetch("../magihim-2012/data/index.json")
      .then((r) => (r.ok ? r.json() : { lines: [] }))
      .then(setIdx12).catch(() => setIdx12({ lines: [] }));
  }, []);
  const k2rd = useMemo(() => {
    const m = {};
    for (const [rd, v] of Object.entries(a12 || {})) if (!(v.k in m)) m[v.k] = rd;
    return m;
  }, [a12]);
  const rows12 = useMemo(() =>
    (((idx12 && idx12.lines) || []).map((l) => ({ ...l, rd: k2rd[l.k] || null }))),
  [idx12, k2rd]);
  const [mErr, setMErr] = useState(false);
  const [chErr, setChErr] = useState(false);
  const [rty, setRty] = useState(0);
  useEffect(() => {
    let ok = true;
    setMErr(false);
    getMonths()
      .then((d) => {
        if (!ok) return;
        // ממיינים כאן במקום לסמוך על סדר הקובץ: ריצת שלב ב' הפכה את
        // months ליורד, וההנחה "האיבר האחרון הוא הנוכחי" שלחה את הפיד
        // למרץ 2017. מיון מקומי עולה מנתק את התלות בכיוון שבדיסק.
        const regular = mode === "lines" ? (d.months || []) : (d.modeMonths?.[mode] || []);
        setRegularMonths(regular);
        const ms = [...new Set([...regular,...earlyMonths])].sort(); setMonths(ms);
        // לא דורסים בחירה שכבר נעשתה — כניסה מכתובת ‎#2012/<k>‎ קובעת
        // את השנה לפני שהחודשים נטענים. אחרי המיון האיבר האחרון הוא
        // החודש הנוכחי.
        const last = ms[ms.length - 1] || "";
        if (ms.length) { setYr((cur) => cur && ms.some(m => m.startsWith(cur)) ? cur : last.slice(0, 4)); setMon((cur) => cur === "legacy2012" || ms.includes(cur) ? cur : last); }
      })
      .catch(() => { if (ok) { setMErr(true); setMonths([]); } });
    return () => { ok = false; };
  }, [rty, mode, earlyMonths]);
  useEffect(() => {
    if (!mon || mon === "legacy2012" || !regularMonths.includes(mon)) return;
    // מעבר מהיר בין חודשים ברשת איטית: בלי הביטול, תשובה איטית של החודש
    // הקודם עלולה לנחות אחרונה ולהציג רשימה של חודש אחד תחת כותרת של אחר
    let ok = true;
    setChs(null); setChErr(false);
    dfetch("data/changes/" + mon + ".json")
      .then((r) => (r.ok ? r.json() : { changes: [] }))
      .then((d) => { if (ok) setChs((d.changes || []).filter((c) => !hiddenEv(c))); })
      .catch(() => { if (ok) { setChErr(true); setChs([]); } });
    return () => { ok = false; };
  }, [mon, rty, regularMonths]);
  const missingYear = !!yr && mon !== "legacy2012" && months !== null && !regularMonths.includes(mon);
  const wrap = embedded ? "" : "card";
  if (months === null) return <div className={wrap}>טוען…</div>;
  if (mErr) return <div className={wrap}><NetErr onRetry={() => { setMonths(null); setRty((n) => n + 1); }} /></div>;
  const needle = q.trim();
  // הפיד יושב בטאב "קווים", שהוא טאב האוטובוסים. רכבת ומוניות שירות הן
  // טאבים משלהן, וכשהן הופיעו כאן הן גם הגיעו בלי מספר קו — תג ריק.
  // סינון לפי הקטגוריות המסומנות בעמוד (שלמה 13.09: "שינויים לפי יום" באותו עמוד)
  const inKats = (c) => !kats || !kats.size || [...kats].some(k => {
    if(k === "endpoint")return ENDPOINT_KINDS.includes(c.k);
    if(k === "sched")return c.k === "sched" || c.k === "freq";
    if(REMOVAL_CATS.has(k))return c.k === "removed" && catMatch(meta[c.rd] || {},k);
    if(k === "stops" || k === "stops-add" || k === "stops-del"){
      if(c.k === k)return true;
      if(c.k !== "removed"){
        const add=(c.add||[]).length,rem=(c.rem||[]).length;
        return k === "stops" ? add>0&&rem>0 : k === "stops-add" ? add>0&&!rem : rem>0&&!add;
      }
    }
    return c.k === k;
  });
  const list = collapse2012Rows((chs || []).filter((c) => {
    const m = meta[c.rd] || {};
    if (!inHistoryMode(m, mode)) return false;
    if (!inKats(c)) return false;
    // Match words across fields, just like the main line search.
    return matchesRouteSearch({ ...m, rd: c.rd, line: c.line || m.line }, needle, citySearch.data, c.d);

  }).sort((a, b) => routeSearchRank({ ...meta[a.rd], line: a.line || meta[a.rd]?.line }, needle)
    - routeSearchRank({ ...meta[b.rd], line: b.line || meta[b.rd]?.line }, needle)), meta);
  const days = []; const byd = new Map();
  for (const c of list) { let g = byd.get(c.d); if (!g) { g = []; byd.set(c.d, g); days.push(c.d); } g.push(c); }
  days.sort().reverse();
  const WD = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  let shown = 0;
  return (
    <div className={wrap}>
      {!embedded && <button className="back" title="חזרה למסך החיפוש הראשי — הטקסט שחיפשתם נשמר" onClick={onBack}>→ חזרה לחיפוש הקווים</button>}
      <div className="months">
        {/* שנים וחודשים עם נתונים זמינים בלבד. */}
        {[...new Set(months.map((m) => m.slice(0, 4)))].sort().reverse().map((y) => (
          <button key={y} className={"mchip" + (yr === y && mon !== "legacy2012" ? " on" : "")} aria-pressed={yr === y && mon !== "legacy2012"}
            aria-label={y} aria-describedby={y === "2012" ? "source-gtfs-2012" : undefined}
            title={y === "2012" ? "קובצי משרד התחבורה מיולי 2012, שנשמרו דרך עמותת מרחב ו־Internet Archive" : "הצגת השינויים של שנת " + y} onClick={() => { setYr(y); const ms = months.filter((m) => m.startsWith(y)); if (!ms.includes(mon)) setMon(ms[ms.length - 1] || ""); }}>{y}{y === "2012" ? " · משרד התחבורה" : ""}</button>
        ))}
      </div>
      {mode === "lines" && <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 10, margin: "10px 0 14px" }}>
        <span className="pdesc" style={{ marginInlineEnd: 10 }}>צילום ממקור נוסף:</span>
        <button className={"mchip" + (mon === "legacy2012" ? " on" : "")} aria-pressed={mon === "legacy2012"} title="צילום רשת האוטובוסים מאתר מגיעים, 2012"
          onClick={() => { setYr("2012"); setMon("legacy2012"); }}>2012 · אתר מגיעים</button>
      </div>}
      {mode === "lines" && yr === "2012" && mon !== "legacy2012" && <p id="source-gtfs-2012" className="pdesc">מקור: קובצי GTFS של משרד התחבורה מיולי 2012, שנשמרו דרך עמותת מרחב ו־Internet Archive.</p>}
      {yr && mon !== "legacy2012" && (
        <div className="months">
          {months.filter((m) => m.startsWith(yr)).slice().reverse().map((m) => (
            <button key={m} className={"mchip" + (mon === m ? " on" : "")} aria-pressed={mon === m} title="הצגת השינויים של החודש הזה בלבד" onClick={() => setMon(m)}>{m.split("-").reverse().join(".")}</button>
          ))}
        </div>
      )}
      {!missingYear && <CitySearchStatus state={citySearch} />}
      {!missingYear && <input className="search" type="search" placeholder="סינון: מספר קו, עיר בדרך, יעד, מפעיל או מק״ט…" value={q} onChange={(e) => setQ(e.target.value)} />}
      {missingYear ? <HistoricalPeriod key={yr} idx={idx} openLine={openLine} mode={mode} year={yr} month={mon} embedded /> : mon === "legacy2012" ? (() => {
        if (!a12 || !idx12) return "טוען…";
        const list12 = sort12(rows12.filter((v) => match12(v, needle)), needle);
        if (!list12.length) return <div className="empty">אין קווי 2012 תואמים.</div>;
        const linked = list12.filter((v) => v.rd).length;
        return (
          <div>
            <div className="dayhead">צילום מצב 2012 · {list12.length.toLocaleString()} קווים ·
              {" "}{linked.toLocaleString()} מקושרים לקווים של היום</div>
            {list12.slice(0, lim).map((v) => (
              <a key={v.k} className="lrow" href={"#2012/" + encodeURIComponent(v.k)}
                onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); open12(v.k); }}>
                <span className="badge sm">{v.no}</span>
                <span className="k" style={{ background: v.rd ? "#78350f" : "#57534e" }}>
                  {v.rd ? "2012" : "לא קיים היום"}</span>
                <span className="ldest">{v.dest || "—"}</span>
                <span className="lmeta">{v.an} · {v.nr} מסלולים · {v.ns} תחנות · מפה ורצף ←</span>
              </a>
            ))}
            {list12.length > lim && (
              <button className="morebtn" onClick={() => setLim(lim + 500)}>
                ⌄ הצג עוד — מוצגים {Math.min(lim, list12.length).toLocaleString()} מתוך {list12.length.toLocaleString()}
              </button>
            )}
            <div className="katnote">ℹ️ "לא קיים היום" — לא נמצא לקו הזה קו תואם ברשת הנוכחית: בוטל,
              או ששונה עד ללא היכר. לחיצה על השורה פותחת את רצף התחנות שלו מ-2012.</div>
          </div>
        );
      })() : chs === null ? "טוען…" : chErr ? <NetErr onRetry={() => setRty((n) => n + 1)} />
        : days.length === 0 ? <div className="empty">אין שינויים תואמים בחודש הזה.</div> : (
        <div>
          {/* אינדקס הימים של החודש: רואים מראש באילו תאריכים יש שינויים,
              ולחיצה קופצת ישר ליום — בלי לגלול ולגלות אותם אחד-אחד */}
          {days.length > 1 && (
            <div className="months">
              <button className={"mchip" + (!dayF ? " on" : "")} aria-pressed={!dayF} title="כל ימי החודש ברצף" onClick={() => setDayF(null)}>כל החודש</button>
              {days.map((d) => (
                <button key={d} className={"mchip" + (dayF === d ? " on" : "")} aria-pressed={dayF === d}
                  title={"יום " + WD[new Date(d).getDay()] + " · " + byd.get(d).length.toLocaleString() + " שינויים"}
                  onClick={() => setDayF(dayF === d ? null : d)}>{d.slice(8, 10) + "." + d.slice(5, 7)}</button>
              ))}
            </div>
          )}
          {days.filter((d) => !dayF || d === dayF).map((d) => shown >= lim ? null : (
            <React.Fragment key={d}>
              <div className="dayhead" role="button" tabIndex={0} style={{ cursor: "pointer" }}
                title={dayF === d ? "לחיצה חוזרת מציגה שוב את כל החודש" : "לחיצה מציגה רק את היום הזה"}
                onClick={() => setDayF(dayF === d ? null : d)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDayF(dayF === d ? null : d); } }}>
                {fmtD(d)} · יום {WD[new Date(d).getDay()]} · {byd.get(d).length.toLocaleString()} שינויים {dayF === d ? "· 📌" : ""}</div>
              {byd.get(d).map((c, i) => {
                if (shown >= lim) return null;
                shown++;
                const m = meta[c.rd] || {};
                return (
                  <a key={c.rd + c.k + i} className="lrow" href={lineHref(c.rd)}
                    onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); openLine(c.rd); }}>
                    <span className="badge sm">{c.line || TT_ICON[m.tt] || "—"}</span>
                    <span className="k" style={{ background: (KINDS[evKind(c)] || {}).color || "#64748b" }}>{(KINDS[evKind(c)] || { label: c.k }).label}</span>
                    <span className="ldest">{m.dest || rdTxt(c.rd)}</span>
                    <span className="lmeta">{m.op || ""} · מק״ט <span className="rdnum" dir="ltr">{rdTxt(c.rd)}</span></span>
                    {c.sd && gapDays(c.sd, c.d) > 3 ? <TipTag cls="approxd" tip={"אותר בין " + fmtD(c.sd) + " ל-" + fmtD(c.d) + " — היום המדויק אינו ידוע"}>≈ תאריך מקורב</TipTag> : null}
                    {c.k === "planned-dropped" && c.ps ? <span className="lnote">📅 תוכנן ל-{fmtD(c.ps)} · בוטל ב-{fmtD(c.pc || c.d)}</span> : null}
                    {c.note ? <span className="lnote">{noteFix(c.note)}</span> : null}
                  </a>
                );
              })}
            </React.Fragment>
          ))}
          {list.length > lim && (
            <button className="morebtn" onClick={() => setLim(lim + 500)}>
              ⌄ הצג עוד — מוצגים {Math.min(lim, list.length).toLocaleString()} מתוך {list.length.toLocaleString()}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- מק"ט שהוא גם כפתור העתקה ---------- */
// לחיצה על המק"ט מעתיקה את הקישור לתחנה ישר ללוח, בלי תפריט ובלי שלב
// נוסף. הוא נשאר קישור אמיתי, כך שפתיחה בלשונית חדשה (לחיצה אמצעית או
// לחיצה ארוכה) ממשיכה לעבוד כרגיל.
function StopCode({ code }) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (!ok) return;
    const t = setTimeout(() => setOk(false), 1600);
    return () => clearTimeout(t);
  }, [ok]);
  const copy = (e) => {
    e.stopPropagation();
    if (!plainClick(e)) return;      // Ctrl/אמצעית — פתיחה בלשונית חדשה
    e.preventDefault();
    const url = location.origin + location.pathname + stopHref(code);
    const done = () => setOk(true);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, () => fallback(url, done));
    } else fallback(url, done);
  };
  const fallback = (url, done) => {
    const ta = document.createElement("textarea");
    ta.value = url; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); } catch (err) { /* אין לוח — הקישור עדיין ב-href */ }
    document.body.removeChild(ta);
  };
  return (
    <a className={"code slink" + (ok ? " copied" : "")} href={stopHref(code)} onClick={copy}
      title="לחיצה מעתיקה את הקישור לתחנה הזו — כל השינויים שלה, מכל השנים">
      {" "}({code}) {ok ? "✓ הועתק" : "🔗"}</a>
  );
}

/* ---------- מה השתנה לאחרונה ---------- */
// המסך הראשון הציג שורת חיפוש והוראה להקליד, וכל 58 אלף השינויים היו
// מוסתרים מאחורי פעולה שהמבקר צריך ליזום. כאן מוצגים הימים האחרונים
// שבהם קרה משהו, כמו בטאב התחנות שכבר נפתח על החודש האחרון.
const WDR = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
function RecentChanges({ idx, openLine, onAll }) {
  const [rows, setRows] = useState(null);
  const [nerr, setNerr] = useState(false);
  const [rty, setRty] = useState(0);
  const meta = useMemo(() => { const m = {}; ((idx && idx.lines) || []).forEach((l) => { m[l.rd] = l; }); return m; }, [idx]);
  useEffect(() => {
    let ok = true;
    setNerr(false);
    getMonths()
      .then(async (d) => {
        const ms = (d.months || []).slice().sort();
        if (!ms.length) { if (ok) setRows([]); return; }
        const get = (m) => dfetch("data/changes/" + m + ".json")
          .then((r) => (r.ok ? r.json() : { changes: [] }))
          .then((d) => ({ changes: (d.changes || []).filter((c) => !hiddenEv(c)) }));
        let list = (await get(ms[ms.length - 1])).changes || [];
        // ב-1 בחודש הקובץ החדש כמעט ריק, והמסך הראשי נראה כאילו האתר מת —
        // כשחסרים ימים משלימים מהחודש הקודם כדי שתמיד יוצגו הימים האחרונים
        const daysIn = new Set(list.map((c) => c.d));
        if (daysIn.size < 3 && ms.length > 1) {
          list = list.concat((await get(ms[ms.length - 2])).changes || []);
        }
        if (ok) setRows(list.slice().sort((a, b) => b.d.localeCompare(a.d)));
      })
      .catch(() => { if (ok) { setNerr(true); setRows([]); } });
    return () => { ok = false; };
  }, [rty]);
  if (rows === null) return <div className="empty">טוען את השינויים האחרונים…</div>;
  if (nerr) return <NetErr onRetry={() => { setRows(null); setRty((n) => n + 1); }} />;
  if (!rows.length) return <div className="empty">אין עדיין שינויים בחודש הזה.</div>;
  const days = [];
  const byd = new Map();
  for (const c of rows) {
    if (!byd.has(c.d)) { byd.set(c.d, []); days.push(c.d); }
    byd.get(c.d).push(c);
  }
  const top = days.slice(0, 3);
  return (
    <div className="recent">
      {/* בלי כפתור "כל השינויים לפי יום" — הוא שכפל את הכפתור הגדול
          שכבר יושב ממש מעל (שלמה סימן את הכפילות בצילום מסך) */}
      <div className="rechead">
        <b>מה השתנה לאחרונה</b>
      </div>
      {/* אותו סינון כמו בפיד היומי: רכבת/רק"ל/מוניות הן טאבים משלהן */}
      {top.map((d) => (
        <React.Fragment key={d}>
          <div className="dayhead">{fmtD(d)} · יום {WDR[new Date(d).getDay()]} · {byd.get(d).length.toLocaleString()} שינויים</div>
          {byd.get(d).filter((c) => { const m = meta[c.rd] || {}; return !m.tt || m.tt === "demand"; }).slice(0, 8).map((c, i) => {
            const m = meta[c.rd] || {};
            return (
              <a key={c.rd + c.k + i} className="lrow" href={lineHref(c.rd)}
                onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); openLine(c.rd); }}>
                <span className="badge sm">{c.line}</span>
                <span className="k" style={{ background: (KINDS[evKind(c)] || {}).color || "#64748b" }}>{(KINDS[evKind(c)] || { label: c.k }).label}</span>
                <span className="ldest">{m.dest || rdTxt(c.rd)}</span>
                <span className="lmeta">{m.op || ""} · מק״ט <span className="rdnum" dir="ltr">{rdTxt(c.rd)}</span></span>
                {c.sd && gapDays(c.sd, c.d) > 3 ? <TipTag cls="approxd" tip={"אותר בין " + fmtD(c.sd) + " ל-" + fmtD(c.d) + " — היום המדויק אינו ידוע"}>≈ תאריך מקורב</TipTag> : null}
                    {c.k === "planned-dropped" && c.ps ? <span className="lnote">📅 תוכנן ל-{fmtD(c.ps)} · בוטל ב-{fmtD(c.pc || c.d)}</span> : null}
                    {c.note ? <span className="lnote">{noteFix(c.note)}</span> : null}
              </a>
            );
          })}
          {byd.get(d).length > 8 && (
            <button className="recmore" onClick={onAll}>
              ועוד {(byd.get(d).length - 8).toLocaleString()} שינויים ב-{fmtD(d)} ←
            </button>
          )}
        </React.Fragment>
      ))}
      <div className="katnote">
        ℹ️ הקלידו מספר קו כדי לראות את ההיסטוריה שלו, או פתחו את "קטגוריות לבחירה"
        וסמנו אילו סוגי שינויים להציג. התיעוד מתחיל ב-16.03.2017.
      </div>
    </div>
  );
}

/* ---------- טאב תחנות ---------- */
// ציר הקווים של תחנה בודדת: אילו קווים עצרו בה, מי נוסף ומי ירד ומתי
// (בקשת המשתמש). הנתונים: data/stopev/XX.json — נגזרים יומית מקובצי
// הקווים, כך ששינוי אצל קו נרשם אוטומטית גם אצל כל תחנה שהושפעה.
function LinesAtStop({ code, onClose }) {
  const plats = usePlatforms();   // הרציפים הפעילים בתחנה ומי עוצר בכל אחד (שלמה 07.09)
  const [d, setD] = useState(null);
  const [err, setErr] = useState(false);
  const [all, setAll] = useState(false);
  // קווי 2012 שעצרו בתחנה (מגיעים 2012, לפי המק"ט שהוצלב ברישום 2012) — שבר לפי קידומת (שלמה 22.09)
  const [l12, setL12] = useState(null);
  useEffect(() => {
    setD(null); setErr(false); setAll(false); setL12(null);
    dfetch("data/stopev/" + (code.length >= 2 ? code.slice(0, 2) : "0x") + ".json")
      .then((r) => (r.ok ? r.json() : {}))
      .then((m) => setD(m[code] || { ev: [] }))
      .catch(() => setErr(true));
    dfetch("../magihim-2012/data/stop-lines/" + (code.slice(0, 2) || "0").padStart(2, "0") + ".json")
      .then((r) => (r.ok ? r.json() : {}))
      .then((m) => setL12(m[code] || []))
      .catch(() => setL12([]));
  }, [code]);
  const has12 = !!(l12 && l12.length);
  if (err && !has12) return null;
  if (d && !(d.ev || []).length && l12 !== null && !has12) return null;
  if (!d && !err) return <div className="lat"><div className="empty">⏳ טוען את קווי התחנה…</div></div>;
  const ev = (d && d.ev) || [];
  // מצב נוכחי: האירוע האחרון של כל וריאנט קובע אם הוא עוצר כאן היום
  const lastByRd = {};
  ev.forEach((e) => { lastByRd[e[2]] = e; });
  // "היום" = יש לו"ז לשבוע הקרוב (d.a, מפרסום הרישוי ל-10 הימים; נבנה בצינור).
  // וריאנט שהתיעוד אומר שהוא עוצר כאן אבל אין לו לו"ז אינו פעיל (שלמה 07.09)
  const active = Array.isArray(d.a) ? new Set(d.a) : null;
  const nowMap = new Map();
  Object.values(lastByRd).forEach((e) => { if (e[3] !== "out" && e[3] !== "mvout" && e[1] && (!active || active.has(e[2]))) nowMap.set(e[1], e[2]); });
  const now = [...nowMap.entries()].sort((a, b) => (parseInt(a[0]) || 9e9) - (parseInt(b[0]) || 9e9) || String(a[0]).localeCompare(b[0]));
  // ציר הזמן: אירועי "התיעוד הראשון" של אותו תאריך מקובצים לשורה אחת,
  // וחלופות של אותו קו באותו יום לא מוצגות פעמיים
  const rows = [];
  const baseByDate = {};
  ev.forEach((e) => { if (e[3] === "base" && e[1]) (baseByDate[e[0]] = baseByDate[e[0]] || new Map()).set(e[1], e[2]); });
  Object.entries(baseByDate).forEach(([dte, lines]) => rows.push({ d: dte, k: "base", lines: [...lines.entries()] }));
  // mvin/mvout (הצינור מזהה קו שהפסיק בתחנה אחת והתחיל בתחנה שכנה באותו יום)
  // מוצגים כמו in/out רגילים: "קו 38 הפסיק לעצור בתחנה" — הניסוח "עבר לעצור
  // ב…" לא התבקש (שלמה 07.09). מעבר רציף אמיתי (רציף 2 ← רציף 1) מגיע
  // מנתוני הרציפים (platforms.json), לא מניחוש לפי שמות.
  const seen = new Set();
  ev.forEach((e) => {
    if (e[3] === "base") return;
    const k = e[3] === "mvin" ? "in" : e[3] === "mvout" ? "out" : e[3];
    const key = e[0] + "|" + e[1] + "|" + k;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ d: e[0], k, line: e[1] || "—", rd: e[2] });
  });
  rows.sort((a, b) => b.d.localeCompare(a.d));
  // אותו תאריך ואותו סוג — שורה אחת עם כל הקווים, במקום עשר שורות זהות (שלמה 07.09)
  const grouped = [], gk = {};
  rows.forEach((r) => {
    if (r.k === "base") { grouped.push(r); return; }
    const key = r.d + "|" + r.k;
    if (gk[key]) { gk[key].items.push([r.line, r.rd]); return; }
    gk[key] = { d: r.d, k: r.k, items: [[r.line, r.rd]] };
    grouped.push(gk[key]);
  });
  const shown = all ? grouped : grouped.slice(0, 30);
  // רציפים פעילים = רציפים (שורות בקובץ התחנות של המשרד, אותו מק"ט) שיש בהם
  // נסיעות בלוח הזמנים שבתוקף — לא כל הרציפים הבנויים (שלמה 07.09: "בתחנה זו
  // יש 16 רציפים פעילים"; במרכזית ראשל"צ יש גם רציפים בלי קווים)
  const pst = plats && plats.st && plats.st[code];
  const platNos = pst ? Object.keys(pst.p || {}).sort(platSort) : [];
  return (
    <div className="lat">
      <div className="lathead">🚌 הקווים בתחנה הזו לאורך זמן
        {onClose && <button className="latx" title="סגירת ציר הקווים" onClick={onClose}>✕</button>}
      </div>
      {platNos.length > 0 && (
        <details className="latplat">
          <summary title="לפי שורות הרציפים בקובץ התחנות של משרד התחבורה: רציף נחשב פעיל כשיש בו נסיעות בלוח הזמנים שבתוקף — מתעדכן מדי יום">
            🛤️ {platNos.length === 1
              ? <>בתחנה זו רציף פעיל אחד: <b>רציף {platNos[0]}</b></>
              : <>בתחנה זו יש <b>{platNos.length} רציפים פעילים</b> (רציפים שיש בהם קווים היום)</>}
          </summary>
          <div className="platlist">
            {platNos.map((p) => {
              // כמה חלופות של אותו קו באותו רציף — מספר הקו פעם אחת
              const seenL = new Set();
              const items = (pst.p[p] || []).filter(([rd2, l]) => { const k = l || rd2; if (seenL.has(k)) return false; seenL.add(k); return true; });
              return (
                <div key={p} className="platrow"><b>רציף {p}</b>:{" "}
                  {items.map(([rd2, l], j) => (
                    <React.Fragment key={rd2}>{j > 0 ? ", " : ""}<a href={lineHref(rd2)} title={rd2}>{l || rd2}</a></React.Fragment>
                  ))}
                </div>
              );
            })}
          </div>
        </details>
      )}
      {now.length > 0 && (
        <div className="latnow" title="קווים שעוצרים בתחנה לפי התיעוד ויש להם לו״ז לשבוע הקרוב (פרסום הרישוי ל-10 הימים)">עוצרים בה היום (יש להם לו״ז לשבוע הקרוב):{" "}
          {now.slice(0, 40).map(([l, rd2]) => <a key={l} className="badge sm latb" href={lineHref(rd2)}>{l}</a>)}
        </div>
      )}
      {has12 && (
        <div className="latnow" title="לפי מסלולי הקווים במאגר מגיעים 2012, שהוצלבו לרישום התחנות של 2012 (GTFS משרד התחבורה דרך OpenStreetMap). לחיצה פותחת את הקו כפי שהיה ב-2012">🕰️ ב-2012 עצרו כאן (מגיעים 2012):{" "}
          {l12.slice(0, 40).map((x) => <a key={x[0]} className="badge sm latb b12" href={"#2012/" + encodeURIComponent(x[0])} title={"קו " + x[1] + " · " + x[2] + " · " + x[3] + " — רצף התחנות והמסלול כפי שהיו ב-2012"}>{x[1]}</a>)}
          {l12.length > 40 ? <span className="mut">ועוד {l12.length - 40}</span> : null}
        </div>
      )}
      <div className="latlist">
        {shown.map((r, i) => r.k === "base"
          ? <div className="latrow" key={i}><span className="latd">{fmtD(r.d)}</span> {r.lines.length === 1
              ? <>🚏 קו <a href={lineHref(r.lines[0][1]) + "@" + r.d}><b>{r.lines[0][0]}</b></a> תועד בתחנה לראשונה</>
              : <>🚏 בתיעוד הראשון עצרו כאן {r.lines.length} קווים: {r.lines.slice(0, 25).map(([l, rd2], j) =>
                  <React.Fragment key={l + rd2}>{j > 0 ? ", " : ""}<a href={lineHref(rd2) + "@" + r.d}><b>{l}</b></a></React.Fragment>)}{r.lines.length > 25 ? "…" : ""}</>}</div>
          : r.items.length === 1
            ? <div className="latrow" key={i}><span className="latd">{fmtD(r.d)}</span> {r.k === "in"
                ? <>🆕 קו <a href={lineHref(r.items[0][1]) + "@" + r.d}><b>{r.items[0][0]}</b></a> התחיל לעצור בתחנה</>
                : <>➖ קו <a href={lineHref(r.items[0][1]) + "@" + r.d}><b>{r.items[0][0]}</b></a> הפסיק לעצור בתחנה</>}</div>
            : <div className="latrow" key={i}><span className="latd">{fmtD(r.d)}</span> {r.k === "in" ? "🆕" : "➖"} {r.items.length} קווים {r.k === "in" ? "התחילו לעצור בתחנה" : "הפסיקו לעצור בתחנה"}: {r.items.map(([l, rd2], j) =>
                <React.Fragment key={l + rd2}>{j > 0 ? ", " : ""}<a href={lineHref(rd2) + "@" + r.d}><b>{l}</b></a></React.Fragment>)}</div>)}
      </div>
      {grouped.length > shown.length && <button className="morebtn" onClick={() => setAll(true)}>⌄ כל {grouped.length.toLocaleString()} האירועים</button>}
      <div className="latnote">מחושב מהשוואת רצפי התחנות של כל הקווים לאורך התקופה. מעבר רציף נראה כאן כקו שירד — ועלה באותו תאריך ברציף השכן.</div>
    </div>
  );
}

function StopsTab({ sel, selN, idx, openLine }) {
  const [dailyOpen, setDailyOpen] = useState(true);
  useEffect(()=>{if(sel)setDailyOpen(true);},[sel,selN]);
  const earlyMonths = useHistoricalMonths("stops");
  const [months, setMonths] = useState(null);
  const [mon, setMon] = useState("");
  const [yr, setYr] = useState("");   // שנה נבחרת בבוחר החודשים
  const [chs, setChs] = useState(null);
  const [hist, setHist] = useState(null);   // קורות-חיים מצטברים לכל תחנה
  const [kinds, setKinds] = useState(() => new Set());   // סימון מרובה, כמו בקווים
  const [onlyNs, setOnlyNs] = useState(false);           // רק תחנות שהיו ברישום ולא בשירות
  const [katOpen, setKatOpen] = useState(false);
  const [q, setQ] = usePersistedQ("lh-q-stops");
  const [openKey, setOpenKey] = useState(null);   // שורת תחנה פתוחה עם מפה
  // ציר הקווים נסגר ב-✕ או ברגע שהחיפוש כבר לא מציג את התחנה שלו;
  // הסגירה מנקה גם את הכתובת, כדי שריענון לא יחזיר את הפאנל
  const [latHide, setLatHide] = useState(false);
  useEffect(() => setLatHide(false), [sel, selN]);
  const closeLat = () => {
    setLatHide(true);
    if ((location.hash || "").includes("stop=")) history.replaceState(null, "", "#t=stops");
  };
  // גם סגירה עקיפה — שינוי או מחיקה של החיפוש — מנקה את הכתובת, כדי
  // שלחיצה חוזרת על קישור התחנה תיחשב לניווט חדש ותפתח את הפאנל
  // selDone: רק אחרי שהחיפוש כבר קיבל את מק"ט הקישור. בסבב הראשון החיפוש
  // עדיין ריק, והכתובת ‎#stop=274‎ נמחקה ל-‎#t=stops‎ עוד לפני שהתחנה נפתחה —
  // ריענון (או "אתר למחשב") איבד את התחנה (הבדיקה האוטומטית, 18.09)
  useEffect(() => {
    if (sel && selDone.current && q.trim() !== sel && (location.hash || "").includes("stop="))
      history.replaceState(null, "", "#t=stops");
  }, [q, sel]);
  // 100 תחנות בטעינה (היו 250): ב"כל התקופה" כל קבוצה היא כמה שורות, ומאות
  // שורות בכל הקלדה הרגישו כקיפאון בטלפון. "הצג עוד" מרחיב.
  const [lim, setLim] = useState(100);   // "הצג עוד" מרחיב; סינון חדש מאפס
  const dq = useDebounced(q, 220);       // הסינון רץ אחרי הפסקה בהקלדה, לא על כל תו
  useEffect(() => setLim(100), [dq, mon, kinds, onlyNs]);
  // תחנה שהגיעה מהכתובת: כל קורות החיים שלה, ולא רק החודש שנבחר
  useEffect(() => {
    if (!sel) return;
    setMon("all"); setYr(""); setQ(sel); setKinds(new Set()); setOnlyNs(false);
  }, [sel, selN]);
  const toggleKind = (k) => setKinds((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  // קורות החיים של כל התחנות הם 4.5 מגה, והם נדרשים רק ל"כל התקופה".
  // תצוגת חודש בודד מסתדרת עם קובץ של עשרות קילובייט כי הכללים שדרשו
  // אותם מסומנים מראש על האירוע (k1/xb), וקישור לתחנה מסתפק בשבר של
  // הקידומת שלה — כמאתיים קילובייט במקום ארבעה וחצי מגה.
  const [shard, setShard] = useState(null);   // המק"ט שהשבר שנטען שייך לו
  const [snap12, setSnap12] = useState(null); // רישום התחנות של 2012 (כולו ב"כל התקופה", שבר לתחנה מקישור)
  const [snapScope, setSnapScope] = useState(""); // "full" / "shard" — מה נטען ל-snap12
  const needHist = mon === "all" || !!sel;
  // מצב "2012" (שלמה 22.09): רק רישום התחנות של 2012 עם מה שהשתנה בכל תחנה עד 2017 —
  // בלי קורות החיים הכבדים
  const need12 = mon === "2012";
  const [ev12, setEv12] = useState(null);       // האירועים המוכנים מהשרת (2012 מול 2017)
  const [counts12, setCounts12] = useState(null);   // הספירה לכל סוג — קובץ זעיר שמגיע ראשון
  const ev12Busy = useRef(false);   // הקובץ הגדול נטען פעם אחת בלבד
  useEffect(() => {
    if (!(need12 || mon === "all") || ev12 || ev12Busy.current) return;
    ev12Busy.current = true;
    dfetch("../magihim-2012/data/stops-2012-counts.json").then((r) => (r.ok ? r.json() : null)).then((d) => d && setCounts12((c) => c || d)).catch(() => {});
    dfetch("../magihim-2012/data/stops-2012-events.json").then((r) => (r.ok ? r.json() : { events: [] }))
      .then((d) => { setEv12(expand2012(d.events)); if (d.counts) setCounts12(d); })
      .catch(() => setEv12([]));
  }, [need12, mon, ev12]);
  // ההשוואה ל-q הייתה מוקדמת מדי: החיפוש נקבע ל-sel באפקט אחר, ובסבב
  // הראשון הוא עדיין הערך הישן — ואז נטען הקובץ המלא במקום השבר.
  // shardLeft: אחרי שהחיפוש עזב את תחנת הקישור, הדגל נשאר דלוק והשבר
  // נטען שוב ושוב — חיפוש תחנה אחרת רץ בשקט על ~1% מהתחנות בלבד
  // והציג "אין תוצאות" על תחנות קיימות (ציד הבאגים, סבב ב).
  const shardLeft = useRef(false);
  useEffect(() => { shardLeft.current = false; }, [sel]);
  const wantShard = !!sel && !shardLeft.current;
  useEffect(() => {
    if (!needHist || hist) return;
    const done = (d) => setHist(d);
    const done12 = (d) => setSnap12(d && d.stops ? d.stops : d || {});
    setSnap12(null);
    setSnapScope(wantShard ? "shard" : "full");
    if (wantShard) {
      setShard(sel);
      const pre = (sel.slice(0, 2) || "0").padStart(2, "0");
      dfetch("data/stops/" + pre + ".json")
        .then((r) => (r.ok ? r.json() : {})).then(done).catch(() => done({}));
      dfetch("../magihim-2012/data/stops-2012/" + pre + ".json")
        .then((r) => (r.ok ? r.json() : {})).then(done12).catch(() => done12({}));
      return;
    }
    setShard(null);
    dfetch("data/stops-hist.json")
      .then((r) => (r.ok ? r.json() : {})).then(done).catch(() => done({}));
  }, [needHist, hist, wantShard, sel]);
  // חיפוש שיצא מהתחנה של הקישור — השבר כבר לא מספיק, וצריך את הכל.
  // הדגל נחוץ כי בסבב הראשון החיפוש עדיין מחזיק ערך קודם, ובלעדיו השבר
  // היה נזרק ונטען שוב בלולאה אינסופית.
  const selDone = useRef(false);
  useEffect(() => { selDone.current = false; }, [sel]);
  useEffect(() => {
    if (sel && q.trim() === sel) selDone.current = true;
    if (shard && selDone.current && q.trim() !== shard) { shardLeft.current = true; setHist(null); setShard(null); }
  }, [q, shard, sel]);
  // כללי התצוגה (בקשת המשתמש, בעקבות תחנות עונתיות כמו תחנות ההתרעננות):
  // "חדשה" — רק הרישום הראשון אי-פעם של התחנה; הרשמות חוזרות לא מוצגות.
  // "בוטלה" — רק אם עברה שנה בלי שחזרה; ומי שמופיעה ברישום הנוכחי
  // (גם בלי קווים שעוצרים בה) אינה מבוטלת.
  const keepEvent = (c) => {
    // בלי קורות החיים מכריעים לפי הסימונים שחושבו מראש: k1 — זה הרישום
    // הראשון של התחנה, xb — הביטול הזה כבר לא בתוקף. כלל השנה נשאר כאן,
    // כי הוא תלוי בתאריך של היום.
    if (!hist) {
      if (c.k === "new") return !!c.k1;
      if (c.k === "del") return !c.xb && Date.now() - new Date(c.d) >= 365 * 864e5;
      return true;
    }
    const evs = hist[c.c] || [];
    if (c.k === "new") {
      // "חדשה" = לידת התחנה: האירוע הראשון בכלל בקורות-החיים שלה. תחנה
      // שההיסטוריה שלה מתחילה בביטול קיימת מלפני התיעוד — ה"חדשה" שאחריו
      // היא חזרה לרישום, לא לידה
      return !evs.length || (evs[0].k === "new" && evs[0].d === c.d);
    }
    if (c.k === "del") {
      if (evs.some((e) => e.d > c.d && e.k === "new")) return false;   // חזרה לפעול
      const last = evs[evs.length - 1];
      if (last && last.k === "del" && last.now) return false;          // עדיין ברישום
      return Date.now() - new Date(c.d) >= 365 * 864e5;                // מבוטלת = מעל שנה
    }
    return true;
  };
  const [mErr, setMErr] = useState(false);
  const [chErr, setChErr] = useState(false);
  const [rty, setRty] = useState(0);
  useEffect(() => {
    let ok = true;
    setMErr(false);
    getMonths()
      .then((d) => { if (!ok) return;
        // מיון יורד מפורש — לא סומכים על הסדר שבדיסק (ראו הפיד של הקווים)
        const ms = (d.stopMonths || []).slice().sort().reverse();
        setMonths(ms);
        // ברירת המחדל: החודש האחרון — נטען מיידית. "כל התקופה" (פירוק
        // ומיון של כל קורות-החיים, מאות אלפי אירועים) רק בבחירה מפורשת
        // כשהגענו מקישור לתחנה, "כל התקופה" כבר נבחר — וטעינת החודשים
        // דרסה אותו בחודש האחרון, כך שהקישור נחת על מסך ריק
        if (ms.length && !sel) { setMon(ms[0]); setYr(ms[0].slice(0, 4)); } })
      .catch(() => { if (ok) { setMErr(true); setMonths([]); } });
    return () => { ok = false; };
  }, [rty]);
  useEffect(() => {
    // "כל התקופה" נבנית מקורות החיים ולא מקובץ חודש — בלי התנאי הזה נשלחה
    // בקשה ל-stops-all.json שתמיד חוזרת 404
    if (!mon || mon === "all" || mon === "2012" || (earlyMonths.includes(mon) && !months?.includes(mon))) return;
    // ביטול כשעוברים חודש: תשובה איטית של חודש קודם לא דורסת את החדש
    let ok = true;
    setChs(null); setChErr(false);
    // שנה שלמה ("Y:2025"): כל קובצי החודשים של השנה במקביל — כחצי מגה לשנה
    loadPeriod("stops-", mon, months)
      .then((chs) => { if (ok) setChs(chs); })
      .catch(() => { if (ok) { setChErr(true); setChs([]); } });
    return () => { ok = false; };
  }, [mon, rty, months]);
  // ממואם: בלי זה כל הקלדה בחיפוש בנתה ומיינה מחדש את כל האירועים (לאגים).
  // "כל התקופה": כל האירועים מכל הזמנים מתוך קורות-החיים, עם תאריך ליד כל אחד
  const source = useMemo(() => {
    // מחרוזת חיפוש אחת לכל אירוע, מחושבת פעם אחת — במקום ארבע החלפות-regex
    // לכל אירוע בכל הקלדה; המיון בהשוואת מחרוזות רגילה (localeCompare איטי פי 2)
    const withS = (e) => ({ ...e, s: sQ(e.n) + "|" + sQ(e.nn) + "|" + sQ(e.on) + "|" + sQ(e.t) });
    // קישור לתחנה: עד שהחודש הפך ל"כל התקופה" והשבר שלה נטען, הרשימה
    // הראתה לרגע תחנות אחרות מהחודש הנוכחי שמספרן מכיל את המק"ט — מסך
    // "טוען" במקום זה (הבדיקה האוטומטית תפסה: ‎#stop=274‎ "נפתחה על תחנה אחרת")
    if (sel && !shardLeft.current && (mon !== "all" || !hist)) return null;
    const raw = mon === "2012"
      ? (ev12 ? ev12.map(withS).sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0)) : null)
      : mon === "all"
      ? (hist ? Object.entries(hist).flatMap(([c, evs]) => evs.map((e) => withS({ ...e, c })))
          // רישום 2012: אירוע לכל תחנה שהייתה אז — אחרי כל השאר, כי הוא הישן ביותר
          .concat(ev12 ? ev12.map(withS) : []).sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0)) : null)
      : (chs ? chs.map(withS) : chs);
    // כשמגיעים לתחנה מקישור מציגים את כל מה שידוע עליה. כללי התצוגה
    // נועדו לפיד החודשי, ובתחנה מסוימת הם הסתירו גם את מה שביקשו לראות:
    // ‎#stop=48‎ הראה מסך ריק, כי שני האירועים שלה נחשבים "חוזרים".
    return raw === null ? null
      : raw.filter((c) => !hiddenEv(c) && ((sel && c.c === sel) || keepEvent(c)));
  }, [mon, hist, chs, sel, snap12, snapScope, ev12]);
  const counts = useMemo(() => {
    const cn = {};
    (source || []).forEach((c) => { cn[c.k] = (cn[c.k] || 0) + 1; });
    return cn;
  }, [source]);
  // ב-useMemo — הסינון על עשרות אלפי אירועים לא רץ מחדש בפעולות שאינן
  // חיפוש (סעיף 14); הערה קיימת על source מסבירה את אותו לאג
  const { nsCount, list } = useMemo(() => {
    const needle = dq.trim(); const sNeedle = sQ(needle);
    const ls = (source || []).filter((c) => (!kinds.size || kinds.has(c.k)) && (!onlyNs || c.ns) &&
      (!needle || c.s.includes(sNeedle) || c.c === needle));
    return { nsCount: (source || []).filter((c) => c.ns).length, list: ls };
  }, [source, dq, kinds, onlyNs]);
  const availableMonths = [...new Set([...(months || []), ...earlyMonths])].sort().reverse();
  const earlySelected = earlyMonths.includes(mon) && !months?.includes(mon);
  if (months === null) return <div className="card">טוען…</div>;
  if (mErr) return <div className="card"><NetErr onRetry={() => { setMonths(null); setRty((n) => n + 1); }} /></div>;
  if (!months.length) return <div className="card"><div className="empty">עדיין אין נתוני שינויי תחנות — הם יצטברו מהריצות היומיות הקרובות.</div></div>;
  return (
    <div className="card">
      <button className="kathead" aria-expanded={dailyOpen} onClick={()=>setDailyOpen(!dailyOpen)}>📅 שינויים לפי יום — מה השתנה בכל תאריך, בכל התחנות</button>
      {dailyOpen && <>
      {/* בוחר לפי שנה: slice(0,18) הישן הסתיר את כל מה שלפני 02.2025 —
          עכשיו כל שנה נגישה בלחיצה, והחודשים שלה נפתחים מתחתיה */}
      <div className="months">
        <button className={"mchip" + (mon === "all" ? " on" : "")} aria-pressed={mon === "all"} title="כל האירועים מכל השנים ברצף אחד" onClick={() => { setYr(""); setMon("all"); }}>🗓️ כל התקופה</button>
        {/* מהחדשה לישנה, באותו כיוון של החודשים בתוך כל שנה.
            stopMonths ממוין יורד (בניגוד ל-months של הקווים) — החודש
            החדש של שנה הוא ms[0], וה-reverse היה הופך את סדר התצוגה */}
        {[...new Set(availableMonths.map((m) => m.slice(0, 4)))].sort().reverse().map((y) => (
          <button key={y} className={"mchip" + (yr === y ? " on" : "")} aria-pressed={yr === y}
            title={"פתיחת חודשי " + y} onClick={() => { setYr(y); const ms = availableMonths.filter((m) => m.startsWith(y)); if (!ms.includes(mon) && mon !== "Y:" + y) setMon(ms[0]); }}>{y}</button>
        ))}
        <button className={"mchip" + (mon === "2012" ? " on" : "")} aria-pressed={mon === "2012"}
          title="רישום התחנות של משרד התחבורה מ-2012 (דרך OpenStreetMap) — כל תחנה שהייתה אז, ומה השתנה בה עד תחילת התיעוד ב-2017"
          onClick={() => { setYr(""); setMon("2012"); }}>2012 · OpenStreetMap</button>
      </div>
      {mon === "2012" && (
        <p className="pdesc">🕰️ רישום התחנות של 2012: 32,987 תחנות מקובץ ה-GTFS של משרד התחבורה מ-2012, כפי שיובאו ל-<a href="https://www.openstreetmap.org/changeset/14265835" target="_blank" rel="noopener">OpenStreetMap</a> (רישיון ODbL).
          לכל תחנה: השם, הכתובת והמיקום של אז, ואחריהם מה השתנה באותו מק״ט עד תחילת התיעוד שלנו במרץ 2017 — שינוי שם, הזזה (30 מ׳ ומעלה), או ביטול. מק״ט שנמצא מ-2017 במרחק קילומטר ומעלה נחשב מק״ט שהוקצה מחדש לתחנה אחרת, לא הזזה. מק״ט של 7 ספרות שמתחיל ב-99 הוא מספר זמני שמשרד התחבורה נתן בקובץ 2012 לתחנה בלי מספר שלט; 2,516 כאלה שאף קו לא עצר בהן ב-2012 אינן מוצגות (רשומות בקובץ בלי שירות), 49 הן כפילות של תחנה אמיתית באותו שם עד 100 מ׳ (מוצגת האמיתית, וקווי 2012 שלהן עוברים אליה), ורק 35 — בעיקר בסיסים, בתי כלא ומחסומים בלי מספר שלט — מוצגות עם הסימון ״מק״ט זמני״.
          {counts12 ? ` ${counts12.stops.toLocaleString()} תחנות מוצגות; מחושב מראש אצלנו ומתעדכן כל לילה (${counts12.gen}).` : ""}{ev12 ? "" : " טוען את הרשימה…"}</p>
      )}
      {yr && (
        <div className="months">
          {months.some(m=>m.startsWith(yr)) && <button className={"mchip" + (mon === "Y:" + yr ? " on" : "")} aria-pressed={mon === "Y:" + yr} title={"כל שינויי התחנות של שנת " + yr + " ברצף אחד"} onClick={() => setMon("Y:" + yr)}>🗓️ כל {yr}</button>}
          {availableMonths.filter((m) => m.startsWith(yr)).map((m) => (
            <button key={m} className={"mchip" + (mon === m ? " on" : "")} aria-pressed={mon === m} title="הצגת השינויים של החודש הזה בלבד" onClick={() => setMon(m)}>{m.split("-").reverse().join(".")}</button>
          ))}
        </div>
      )}
      {earlySelected ? <HistoricalPeriod key={mon} idx={idx} openLine={openLine} mode="stops" year={yr} month={mon} embedded /> : <>
      <input className="search" type="search" placeholder="חיפוש תחנה / עיר / מק״ט…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="katbox">
        <button className="kathead" aria-expanded={katOpen} onClick={() => setKatOpen(!katOpen)}>
          <span className="katarrow" aria-hidden="true">{katOpen ? "▼" : "◀"}</span>
          🗂️ קטגוריות לבחירה
          {kinds.size > 0 && <b className="katn">{kinds.size} מסומנות</b>}
        </button>
        {katOpen && (
          <div className="katlist">
            {Object.entries(SKINDS).map(([k, v]) => (
              <label key={k} className="katrow">
                <input type="checkbox" checked={kinds.has(k)} onChange={() => toggleKind(k)} />
                <i className="katdot" style={{ background: v.color }} />
                <span className="katlab">{v.label}</span>
                {/* בזמן החלפת תקופה המונה הראה 0 מטעה לכמה שניות (בקשת
                    שלמה) — עד שהנתונים נטענים כתוב בו "טוען" */}
                <b className="katc">{source === null ? (mon === "2012" && counts12 ? (counts12.counts[k] || 0).toLocaleString() : "טוען…") : (counts[k] || 0).toLocaleString()}</b>
              </label>
            ))}
            {/* תחנות שלא נמצאו במסלול של אף קו מהמתועדים אצלנו. חלקן
                אושרו ברישוי ולא נפתחו לציבור — ולכן דווקא הן מעניינות.
                אי אפשר לקבוע שאף קו לא עצר בהן: הכיסוי שלנו חלקי, וזה
                מה שהסינון אומר ולא יותר. */}
            <div className="katgrp">רישום מול שירות</div>
            <label className="katrow">
              <input type="checkbox" checked={onlyNs} onChange={() => setOnlyNs(!onlyNs)} />
              <i className="katdot" style={{ background: "#64748b" }} />
              <span className="katlab">רק תחנות שלא נמצאו במסלול של אף קו</span>
              <b className="katc">{chs === null ? "טוען…" : nsCount.toLocaleString()}</b>
            </label>
            {kinds.size > 0 && (
              <button className="katclear" onClick={() => setKinds(new Set())}>✖ נקה את הבחירה</button>
            )}
          </div>
        )}
      </div>
      {sel && !latHide && q.trim() === sel && <LinesAtStop code={sel} onClose={closeLat} />}
      {source === null ? "טוען…" : (
        <div className="slist">
          {(() => {
            // כל השינויים של אותה תחנה מקובצים יחד (בקשת המשתמש)
            const groups = [];
            const byCode = new Map();
            for (const c of list) {
              let g = byCode.get(c.c);
              if (!g) { g = { code: c.c, evs: [] }; byCode.set(c.c, g); groups.push(g); }
              g.evs.push(c);
            }
            const shown = groups.slice(0, lim);
            const evRow = (c, one) => {
              const k0 = c.c + c.k + c.d;
              return (
                <React.Fragment key={k0}>
                {/* השורה לחיצה לעכבר; הכפתור האמיתי למקלדת/קורא מסך הוא
                    סמל המפה בסופה — בלי כפתור-בתוך-כפתור (הביקורת) */}
                <div className={"srow" + (one ? "" : " sub") + (c.la != null ? " clk" : "")}
                  onClick={() => { if (c.la != null) setOpenKey(openKey === k0 ? null : k0); }}>
                  <span className="k" style={{ background: (SKINDS[c.k] || {}).color }}>{c.k === "platform" && c.pv ? (c.st === "add" ? "רציף נוסף" : "רציף בוטל") : (SKINDS[c.k] || { label: c.k }).label}</span>
                  {one ? (
                    <span className="nm">
                      {c.k === "renamed" ? <><s>{c.on}</s> ← <b>{c.nn}</b></> : <b>{c.n}</b>}
                      <StopCode code={c.c} />
                      <a className="latlink" href={"#stop=" + c.c} title="אילו קווים עצרו בתחנה ומה השתנה"
                        onClick={(e) => e.stopPropagation()}>🚌 קווים</a>
                    </span>
                  ) : (c.k === "renamed" && <span className="nm"><s>{c.on}</s> ← <b>{c.nn}</b></span>)}
                  {/* רשומה ברישום שאף קו לא עצר בה. בלי הסימון "תחנה חדשה"
                      נקרא כאילו נוספה תחנה שאפשר לחכות בה — וזה לא נכון. */}
                  {c.ns && <TipTag cls="nsflag" tip="התחנה לא נמצאה במסלול של אף קו מהקווים שמתועדים אצלנו. ייתכן שהיא אושרה ברישוי ולא נפתחה לציבור, וייתכן שעצר בה קו שרצף התחנות שלו חסר לנו">ברישום בלבד</TipTag>}
                  {/* רק על "תחנה חדשה", ששם זה תיקון של מה שכתוב: התחנה
                      חזרה לרישום, לא נבנתה. על שאר סוגי האירועים זו הערת
                      רקע שלא מוסיפה כלום, ולכן היא לא מוצגת. */}
                  {c.m12 && c.k === "new" && <TipTag cls="m12flag"
                    tip="התחנה כבר הופיעה במסלול של קו במאגר מגיעים מ-2012, ולכן אין מדובר בתחנה שנבנתה עכשיו אלא בחזרה לרישום הארצי">
                    הייתה כבר ב-2012</TipTag>}
                  <span className="meta">
                    {one && c.t ? c.t + " · " : ""}{c.b12 ? <span title="השוואה בין רישום התחנות של 2012 לרישום הראשון שיש לנו, ממרץ 2017 — המועד המדויק לא ידוע">בין 2012 ל-2017</span> : fmtD(c.d)}
                    {/* בלי המיקום הקודם השורה יצאה "הוזזה מ׳ · (, ) ← (…)" —
                        חצים ריקים משני הצדדים. כשהוא חסר מוצג היעד בלבד. */}
                    {/* dir=ltr על זוג הקואורדינטות: בטקסט עברי הפסיק והרווח
                        מקבלים כיוון RTL וסדר lat/lon התהפך ויזואלית */}
                    {c.k === "city" && <> · <s>{c.oc}</s> ← <b>{c.nc}</b></>}
                    {c.reused && <> · המק״ט שימש אחר כך תחנה אחרת: <b>{c.reused}</b>, במרחק {c.rdist >= 1000 ? (c.rdist / 1000).toFixed(1) + " ק״מ" : c.rdist + " מ׳"} — לא אותה תחנה</>}
                    {c.tmp99 && <> · <b>מק״ט זמני</b> (99…): בקובץ 2012 לתחנה לא היה מספר שלט, ומשרד התחבורה נתן לה מספר זמני; היום היא רשומה כנראה תחת מק״ט אחר, ולכן אין כאן המשך</>}
                    {c.k === "gtfs2012" && <> · <span dir="ltr">({c.la}, {c.lo})</span>
                      {" "}· <a href="https://www.openstreetmap.org/changeset/12028672" target="_blank" rel="noopener" title="רישום התחנות של משרד התחבורה מיוני 2012 (GTFS), כפי שיובא ל-OpenStreetMap ב-26.06.2012" onClick={(e) => e.stopPropagation()}>מקור: GTFS 06.2012 דרך OSM</a></>}
                    {/* רציף (pv=2, tools/platforms.py): רציף במסוף שקיבל קווים / נשאר בלי קווים —
                        רק זה "שינוי ברציף התחנה" (שלמה 07.09), לא קפיצה של מספר ברישום */}
                    {/* אירועי הארכיון (src=tf/ob, tools/backfill_platform_rows.py) נגזרים מקובץ
                        התחנות בלבד — הרציף הופיע/נעלם מהרישום, ומי עצר בו לא ידוע */}
                    {c.k === "platform" && c.pv && (c.st === "add"
                      ? <> · 🆕 <b>רציף {c.pl}</b> נוסף{(c.lines || []).length ? <> — עוצרים בו: {c.lines.join(", ")}</> : c.src ? " (לפי קובץ התחנות בארכיון)" : ""}</>
                      : <> · ➖ <b>רציף {c.pl}</b> בוטל{(c.lines || []).length ? <> (נשאר בלי קווים) — עצרו בו: {c.lines.join(", ")}</> : c.src ? " (נעלם מקובץ התחנות בארכיון)" : ""}</>)}
    {/* ניסוח פשוט (בקשת שלמה): "השם הישן היה… השם החדש הוא…". אירועי
                        "הפכה/חדלה להיות תחנת יעד" הוסרו כליל — רק שינויי שם */}
                    {c.k === "pubdest" && c.st === "ren" &&
                      <> · תחנת היעד לפרסום שוּנתה · השם הישן היה: <b>{c.oh}</b> · השם החדש הוא: <b>{c.nh}</b></>}
                    {c.k === "moved" && (c.ola != null
                      ? <> · הוזזה <b>{c.dist || c.m} מ׳</b> · <s dir="ltr">({c.ola}, {c.olo})</s> ← <b dir="ltr">({c.la}, {c.lo})</b></>
                      : <> · הוזזה <b>{c.dist || c.m} מ׳</b> · אל <b dir="ltr">({c.la}, {c.lo})</b></>)}
                    {c.lines && c.lines.length > 0 && c.k !== "platform" && <> · {c.k === "new" ? "קווים שעצרו בה מהפתיחה" : "קווים שעצרו בה אז"}: {c.lines.slice(0, 10).join(", ")}</>}
                    {c.la != null && <> · <button className="mapbtn" aria-expanded={openKey === k0}
                      aria-label={"מפת התחנה " + (c.n || c.nn || c.c)}
                      onClick={(e) => { e.stopPropagation(); setOpenKey(openKey === k0 ? null : k0); }}>🗺️</button></>}
                  </span>
                </div>
                {openKey === k0 && c.la != null && <StopEvMap ev={c} />}
                </React.Fragment>
              );
            };
            const rows = shown.map((g) => {
              if (g.evs.length === 1) return evRow(g.evs[0], true);
              const head = g.evs[0];
              const nm = head.nn || head.n || (g.evs.find((e) => e.n || e.nn) || {}).n || "";
              return (
                <div className="sgroup" key={g.code}>
                  <div className="srow ghead">
                    <span className="nm"><b>{nm}</b>
                      <StopCode code={g.code} />
                      <a className="latlink" href={"#stop=" + g.code} title="אילו קווים עצרו בתחנה ומה השתנה"
                        onClick={(e) => e.stopPropagation()}>🚌 קווים</a></span>
                    <span className="meta">{head.t ? head.t + " · " : ""}{g.evs.length} שינויים</span>
                  </div>
                  {g.evs.map((c) => evRow(c, false))}
                </div>
              );
            });
            return (
              <React.Fragment>
                {rows}
                {groups.length > lim && (
                  <button className="morebtn" onClick={() => setLim(lim + 150)}>
                    ⌄ הצג עוד — מוצגות {shown.length.toLocaleString()} מתוך {groups.length.toLocaleString()} תחנות
                  </button>
                )}
              </React.Fragment>
            );
          })()}
          {list.length === 0 && (chErr
            ? <NetErr onRetry={() => setRty((n) => n + 1)} />
            : <div className="empty">אין שינויים תואמים בתקופה הזו.</div>)}
        </div>
      )}
      </>}
      </>}
    </div>
  );
}


/* ---------- אפליקציה ---------- */
// סוגי תחבורה שאינם אוטובוס. עד יולי 2026 הסורק סינן כל route_type שאינו 3,
// ולכן הרכבת, מוניות השירות והרכבת הקלה לא היו באתר כלל — למרות שהם יושבים
// באותו פיד ונושאים route_desc באותו פורמט. הרכבת הקלה והכרמלית מוצגות
// כקבוצה אחת (בקשת המשתמש).
// כל סוג תחבורה הוא קטגוריה עומדת בפני עצמה — רכבת ומוניות שירות אינן
// אותו דבר ואינן חולקות מסך (בקשת המשתמש). "שירות לפי דרישה" אינו כאן:
// הוא מופעל בידי חברות האוטובוס ויושב תחת "קווים".
/* ---------- מפת העיר לפי חודש (שלמה 18.09) ---------- */
// בוחרים עיר, שנה וחודש — ורואים על המפה איך זה נראה אז: תחנות שהשתנו
// באותו חודש (לחיצה על סימן = מה קרה לתחנה), או קווים — מסומנים רק
// הקווים שבהם בוצעו שינויים מהסוגים שנבחרו, על המסלול כפי שהיה אז.
// צבע לכל קו (לפי מספרו) — כל קווי העיר בצבעים, כמו במפת קווים (שלמה 18.09)
const ALL_IL = "כל הארץ";   // בחירת "עיר" שמציגה את כל הארץ (שלמה 22.09)
const LINE_PALETTE = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#65a30d", "#ea580c", "#4f46e5", "#0d9488", "#c026d3", "#b45309"];
const lineHash = (str) => { let h = 0; for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
const STOP_KIND_LIST = ["new", "del", "renamed", "moved", "city", "pubdest", "platform", "gtfs2012"];
const LINE_KIND_SKIP = new Set(["baseline", "snapshot"]);
function MapTab({ idx, openLine, cities }) {
  const [months, setMonths] = useState(null);
  const [city, setCity] = usePersistedQ("lh-map-city");
  const [yr, setYr] = useState("");
  const [mon, setMon] = useState("");
  const [mode, setMode] = useState("stops");
  const [kinds, setKinds] = useState(() => new Set());
  const [stopChs, setStopChs] = useState(null);
  const [lineChs, setLineChs] = useState(null);
  const [routes, setRoutes] = useState({});       // rd → [[lat,lon],…] של הגרסה שהייתה בתוקף אז
  const [err, setErr] = useState(null);
  // "2012" במפה (שלמה 22.09): כל התחנות שהיו בעיר ברישום התחנות של יוני 2012
  // (GTFS של משרד התחבורה דרך OpenStreetMap, changeset 12028672) — נטען פעם אחת
  const [snap12, setSnap12] = useState(null);
  const is2012 = mon === "snapshot2012";
  useEffect(() => {
    if (!is2012 || snap12) return;
    dfetch("../magihim-2012/data/stops-2012.json").then((r) => (r.ok ? r.json() : { stops: {} })).then((d) => setSnap12(d.stops || {})).catch(() => setSnap12({}));
  }, [is2012, snap12]);
  const mapRef = useRef(null), mapObj = useRef(null), layer = useRef(null);
  const cache = useRef({});
  useEffect(() => { getMonths().then((d) => {
    const ms = (d.months || []).slice().sort();
    setMonths(ms);
    if (ms.length) { const last = ms[ms.length - 1]; setYr((c) => c || last.slice(0, 4)); setMon((c) => c || last); }
  }).catch(() => setErr("months")); }, []);
  const canon = useMemo(() => {
    const c = (city || "").trim();
    if (!c) return "";
    if (c === ALL_IL) return "*";
    return (cities || []).find((x) => x === c) || (cities || []).find((x) => x.includes(c) || c.includes(x)) || c;
  }, [city, cities]);
  const place = canon === "*" ? "כל הארץ" : canon;            // לתצוגה
  const inPlace = canon === "*" ? "בכל הארץ" : "ב" + canon;
  const monthEnd = mon && !is2012 ? periodEnd(mon) : "";
  // מיקוד על העיר ברגע הבחירה (שלמה 18.09) — גבולות התחנות של כל עיר, data/cities.json
  const [cityBox, setCityBox] = useState(null);
  useEffect(() => { dfetch("data/cities.json").then((r) => r.json()).then(setCityBox).catch(() => {}); }, []);
  useEffect(() => {
    const map = mapObj.current;
    if (!map || !canon) return;
    if (canon === "*") { map.fitBounds([[29.45, 34.2], [33.35, 35.95]], { padding: [10, 10] }); return; }
    const b = cityBox && cityBox[canon];
    if (!b) return;
    map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: [20, 20], maxZoom: 14 });
  }, [canon, cityBox]);
  // אירועי תחנות / שינויי קווים של החודש
  // קובצי השינויים של התקופה נשמרים לפי תקופה — מעבר בין תחנות לקווים לא מוריד שוב.
  // שינויי הקווים (6–7 מגה לשנה) נטענים רק במצב קווים; במצב תחנות הם לא מוצגים
  // בכלל, והגעתם הייתה מפעילה מחדש את טעינת המסלולים (סקירה 22.09)
  const chsCache = useRef({});
  useEffect(() => {
    if (!mon || is2012) return;
    setErr(null);
    // ביטול בהחלפת תקופה/מצב: תשובה איטית של שנה שלמה לא דורסת חודש שנבחר אחריה
    let ok = true;
    const get = (prefix) => {
      const k = prefix + mon;
      if (!chsCache.current[k]) chsCache.current[k] = loadPeriod(prefix, mon, months).catch(() => { delete chsCache.current[k]; return []; });
      return chsCache.current[k];
    };
    setStopChs(null);
    get("stops-").then((d) => { if (ok) setStopChs(d); });
    if (mode === "lines") { setLineChs(null); get("").then((d) => { if (ok) setLineChs(d); }); }
    else setLineChs(null);
    return () => { ok = false; };
  }, [mon, months, mode]);
  const lineOf = useMemo(() => { const m = {}; (((idx || {}).lines) || []).forEach((l) => { m[l.rd] = l; }); return m; }, [idx]);
  // תחנות של העיר שהשתנו בחודש — מקובצות לפי מק"ט
  const stopGroups = useMemo(() => {
    if (is2012) {
      if (!snap12 || !canon) return [];
      // העיר היא סוף הכתובת ברישום 2012; שמות ערים שנכתבו אז אחרת
      const ALIAS = { "תל אביב יפו": ["תל אביב"], "נוף הגליל": ["נצרת עילית"], "מעלות תרשיחא": ["מעלות"], "יהוד מונוסון": ["יהוד"], "דייר חנא": ["דיר חנא"] };
      const names = [canon].concat(ALIAS[canon] || []);
      const out = [];
      for (const code in snap12) {
        const [n, la, lo, addr] = snap12[code];
        if (code.length === 7 && code.startsWith("99") && (!(snap12[code][10] || 0) || snap12[code][11])) continue;   // מספר זמני בלי קו ב-2012, או כפילות של תחנה אמיתית
        const a = (addr || "").trim();
        if (canon !== "*" && !names.some((c) => a === c || a.endsWith(" " + c))) continue;
        out.push({ code, evs: [{ c: code, d: "2012-06-26", k: "gtfs2012", n, t: a, la, lo }] });
      }
      return out;
    }
    if (!stopChs || !canon) return [];
    const g = {};
    stopChs.forEach((c) => {
      if (c.la == null || (canon !== "*" && (c.t || "") !== canon)) return;
      if (c.k === "platform" && !c.pv) return;
      if (kinds.size && !kinds.has(c.k)) return;
      (g[c.c] = g[c.c] || []).push(c);
    });
    return Object.entries(g).map(([code, evs]) => ({ code, evs: evs.sort((a, b) => a.d < b.d ? -1 : 1) }));
  }, [stopChs, canon, kinds, is2012, snap12]);
  const stopKindCounts = useMemo(() => {
    const n = {};
    (stopChs || []).forEach((c) => { if (c.la != null && (canon === "*" || (c.t || "") === canon) && !(c.k === "platform" && !c.pv)) n[c.k] = (n[c.k] || 0) + 1; });
    return n;
  }, [stopChs, canon]);
  // קווים של העיר (לפי ערי הקצה) שהשתנו בחודש — לפי סוגי השינוי שנבחרו
  const lineGroups = useMemo(() => {
    if (!lineChs || !canon) return [];
    const g = {};
    lineChs.forEach((c) => {
      const l = lineOf[c.rd];
      if (!l || LINE_KIND_SKIP.has(c.k)) return;
      if (canon !== "*" && !destCities(l.dest).includes(canon)) return;
      (g[c.rd] = g[c.rd] || { rd: c.rd, l, chs: [] }).chs.push(c);
    });
    return Object.values(g).sort((a, b) => lineNum(a.l.line) - lineNum(b.l.line));
  }, [lineChs, canon, lineOf]);
  const lineKindCounts = useMemo(() => {
    const n = {};
    lineGroups.forEach((x) => x.chs.forEach((c) => { n[c.k] = (n[c.k] || 0) + 1; }));
    return n;
  }, [lineGroups]);
  const shownLines = useMemo(() => kinds.size ? lineGroups.filter((x) => x.chs.some((c) => kinds.has(c.k))) : [], [lineGroups, kinds]);
  // כל קווי העיר שיכלו להתקיים באותו חודש (וריאנט שבוטל לפני החודש מדולג);
  // מה שבאמת היה בתוקף אז נקבע מקובץ הקו — הגרסה האחרונה עד סוף החודש
  const cityLines = useMemo(() => {
    if (!canon || !mon) return [];
    // כל הארץ: רק הקווים שהשתנו בתקופה (כל 13 אלף הקווים ברקע היו מאות מגה-בייט)
    if (canon === "*") return lineGroups.map((x) => x.l);
    return (((idx || {}).lines) || []).filter((l) => destCities(l.dest).includes(canon) && !(l.lk === "removed" && (l.ld || "") < periodStart(mon)));
  }, [idx, canon, mon, lineGroups]);
  useEffect(() => setKinds((s) => (s.size ? new Set() : s)), [mode, canon]);
  const toggleKind = (k) => setKinds((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  // מסלולי הקווים המסומנים — הגרסה האחרונה עם שרטוט עד סוף החודש.
  // כל הקווים נטענים (בלי תקרה, בקשת שלמה): במנות של 8 במקביל, המפה
  // מתמלאת תוך כדי ופס התקדמות מראה כמה נשאר.
  const [prog, setProg] = useState(null);   // {done, total} בזמן טעינה
  useEffect(() => {
    if (mode !== "lines" || !monthEnd) return;
    const want = cityLines.map((l) => l.rd).filter((rd) => !(rd + "@" + mon in cache.current));
    // ה-flush מכסה את כל קווי העיר שכבר במטמון, לא רק את מה שהריצה הזו הביאה: הריצה
    // מתחילה מחדש כשקובץ השינויים מגיע (cityLines תלוי ב-lineGroups), וקווים שנטענו
    // בריצה הקודמת היו נעלמים מהמפה (סקירה 22.09)
    const flush = () => setRoutes((r) => { const o = { ...r }; cityLines.forEach((l) => { const k = l.rd + "@" + mon; if (k in cache.current) o[k] = cache.current[k]; }); return o; });
    if (!want.length) { flush(); setProg(null); return; }
    let alive = true, i = 0, done = 0;
    setProg({ done: 0, total: want.length });
    const one = (rd) => dfetch("data/lines/" + fsafe(rd) + ".json").then((r) => r.json()).then((lf) => {
      const m = materializeLf(lf);
      const vs = (m.versions || []).filter((v) => v.d <= monthEnd && !hiddenEv(v));
      const last = vs[vs.length - 1];
      // לא היה בתוקף אז: עוד לא תועד, או שהגרסה האחרונה עד אז היא ביטול
      if (!last || last.k === "removed" || last.k === "planned-dropped") { cache.current[rd + "@" + mon] = null; return; }
      const v = [...vs].reverse().find((x) => typeof x.shp === "string" && x.shp.length > 2);
      cache.current[rd + "@" + mon] = v ? decodeShape(v.shp) : null;
    }).catch(() => { cache.current[rd + "@" + mon] = null; });
    const worker = () => {
      if (!alive) return Promise.resolve();
      if (i >= want.length) return Promise.resolve();
      const rd = want[i++];
      return one(rd).then(() => {
        done++;
        if (!alive) return;
        if (done % 5 === 0 || done === want.length) setProg({ done, total: want.length });   // המפה מצוירת פעם אחת, בסוף
        return worker();
      });
    };
    Promise.all(Array.from({ length: 8 }, worker)).then(() => { if (alive) { flush(); setProg(null); } });
    return () => { alive = false; setProg(null); };   // מעבר למצב תחנות באמצע טעינה — בלי זה הכיסוי נשאר תקוע
  }, [cityLines, mode, monthEnd, mon]);
  // המפה
  useEffect(() => {
    if (!mapRef.current || mapObj.current) return;
    const map = L.map(mapRef.current, { scrollWheelZoom: true, preferCanvas: true });   // canvas — מאות מסלולים בלי להיחנק
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>', maxZoom: 19,
    }).addTo(map);
    map.setView([31.9, 35.0], 8);
    mapObj.current = map;
    layer.current = L.featureGroup().addTo(map);   // featureGroup: אירועי לחיצה של הסמנים עולים לקבוצה
    return () => { map.remove(); mapObj.current = null; layer.current = null; };
  }, []);
  const stopLabel = (c) => c.k === "platform" ? (c.st === "add" ? "רציף " + c.pl + " נוסף" : "רציף " + c.pl + " בוטל")
    : c.k === "renamed" ? "שינוי שם: " + esc(c.on || "") + " ← " + esc(c.nn || c.n || "")
    : c.k === "moved" ? "הוזזה " + (c.dist || c.m || "") + " מ׳"
    : c.k === "city" ? "שינוי עיר: " + esc(c.oc || "") + " ← " + esc(c.nc || "")
    : c.k === "pubdest" ? "תחנת היעד לפרסום שוּנתה"
    : c.k === "gtfs2012" ? "ברישום 2012"
    : c.k === "new" ? "תחנה חדשה" + (c.lines && c.lines.length ? " · קווים: " + c.lines.slice(0, 8).join(", ") : "")
    : c.k === "del" ? "בוטלה" + (c.reused ? " · המק״ט הוקצה מחדש לתחנה אחרת" : "") + (c.lines && c.lines.length ? " · עצרו בה: " + c.lines.slice(0, 8).join(", ") : "")
    : (SKINDS[c.k] || { label: c.k }).label;
  useEffect(() => {
    const map = mapObj.current, lg = layer.current;
    if (!map || !lg) return;
    lg.clearLayers();
    lg.off("click");
    const pts = [];
    if (mode === "stops") {
      // החלון הקופץ נבנה רק לתחנה שנלחצה (33 אלף חלונות מוכנים מראש = 20 מגה זיכרון; סקירה 22.09)
      const stopHtml = (g) => {
        const last = g.evs[g.evs.length - 1];
        return `<b>${esc(last.nn || last.n || "")}</b> <span class="pcode" dir="ltr">${esc(g.code)}</span><br>` +
          (last.k === "gtfs2012" ? `<span class="pst">${esc(last.t || "")}</span><br><span class="pst">רישום 2012 · GTFS 2012 דרך OSM</span><br>` : "") +
          g.evs.map((c) => `<span class="pst"><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${(SKINDS[c.k] || {}).color || "#64748b"};margin-inline-end:5px"></i>${c.b12 ? "בין 2012 ל-2017" : fmtD(c.d)} · ${stopLabel(c)}</span>`).join("<br>") +
          `<br><a href="#stop=${encodeURIComponent(g.code)}" class="plink">כל ההיסטוריה של התחנה ←</a>`;
      };
      lg.on("click", (e) => {
        const g = e.propagatedFrom && e.propagatedFrom._g;
        if (!g) return;
        L.popup({ className: "lh-pop", maxWidth: 320 }).setLatLng(e.latlng).setContent(stopHtml(g)).openOn(map);
      });
      const big = stopGroups.length > 5000;
      const addOne = (g) => {
        const last = g.evs[g.evs.length - 1];
        const color = (SKINDS[last.k] || {}).color || "#2563eb";
        pts.push([last.la, last.lo]);
        const m = L.circleMarker([last.la, last.lo], { radius: big ? 5 : 8, color: "#fff", weight: big ? 1 : 2, fillColor: color, fillOpacity: 0.95 });
        m._g = g;
        m.addTo(lg);
      };
      // עד 2,500 תחנות מצוירות בבת אחת; מעבר לזה (כל הארץ, רישום 2012 — 33 אלף) במנות
      // עם פס התקדמות, כדי שהדפדפן לא ייתקע (שלמה 22.09: "שיטען כמו כל הקווים בעיר").
      // המנות ממוינות לפי קו רוחב, כדי שכל מנה תצייר מחדש אזור קטן ולא את כל הארץ,
      // והמיקוד נעשה פעם אחת לפני הציור (סקירה 22.09: 237 אלף ציורים חוזרים → 100 אלף)
      const CH = 2500;
      if (stopGroups.length > CH) {
        const ordered = stopGroups.slice().sort((a, b) => a.evs[a.evs.length - 1].la - b.evs[b.evs.length - 1].la);
        if (canon !== "*") map.fitBounds(L.latLngBounds(ordered.map((g) => { const l = g.evs[g.evs.length - 1]; return [l.la, l.lo]; })).pad(0.05), { maxZoom: 15 });
        let i = 0, alive = true, timer = null;
        setProg({ done: 0, total: ordered.length });
        const step = () => {
          if (!alive) return;
          const end = Math.min(i + CH, ordered.length);
          for (; i < end; i++) addOne(ordered[i]);
          if (i < ordered.length) { setProg({ done: i, total: ordered.length }); timer = setTimeout(step, 0); }
          else setProg(null);
        };
        timer = setTimeout(step, 0);
        return () => { alive = false; clearTimeout(timer); setProg(null); };
      }
      stopGroups.forEach(addOne);
    } else {
      const sel = new Set(shownLines.map((x) => x.rd));
      // כל קווי העיר כפי שהיו אז — אפור דק; הקווים שהשתנו (לפי הסוגים שנבחרו) מעליהם, צבועים
      cityLines.forEach((l) => {
        const r = routes[l.rd + "@" + mon];
        if (!r || !r.length || sel.has(l.rd)) return;
        r.forEach((p) => pts.push(p));
        const html = `<b>קו ${esc(l.line || "")}</b> · ${esc(l.op || "")}<br><span class="pcode">${esc(l.dest || "")}</span><br><a href="#${encodeURIComponent(l.rd)}" class="plink">לעמוד הקו ←</a>`;
        L.polyline(r, { color: LINE_PALETTE[lineHash(l.line || l.rd) % LINE_PALETTE.length], weight: 2.5, opacity: 0.75 }).bindPopup(html, { className: "lh-pop", maxWidth: 320 }).addTo(lg);
      });
      shownLines.forEach((x) => {
        const r = routes[x.rd + "@" + mon];
        if (!r || !r.length) return;
        r.forEach((p) => pts.push(p));
        const k0 = x.chs.find((c) => kinds.has(c.k)) || x.chs[0];
        const color = catColor(k0.k) || (KINDS[k0.k] || {}).color || "#7c3aed";
        const html = `<b>קו ${esc(x.l.line || "")}</b> · ${esc(x.l.op || "")}<br><span class="pcode">${esc(x.l.dest || "")}</span><br>` +
          x.chs.map((c) => `<span class="pst"><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${catColor(c.k)};margin-inline-end:5px"></i>${fmtD(c.d)} · <b>${esc((KINDS[c.k] || { label: c.k }).label)}</b>${c.note ? " — " + esc(noteFix(c.note)).slice(0, 220) : ""}</span>`).join("<br>") +
          `<br><a href="#${encodeURIComponent(x.rd)}" class="plink">לעמוד הקו ←</a>`;
        // קו שהשתנה: מסגרת לבנה ומעליה צבע הקטגוריה, עבה — בולט מעל שאר הקווים
        L.polyline(r, { color: "#fff", weight: 9, opacity: 0.95 }).addTo(lg);
        L.polyline(r, { color, weight: 5, opacity: 1 }).bindPopup(html, { className: "lh-pop", maxWidth: 340 }).addTo(lg);
      });
    }
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 15 });
  }, [mode, stopGroups, shownLines, cityLines, routes, mon, kinds]);
  const years = months ? [...new Set(months.map((m) => m.slice(0, 4)))].sort().reverse() : [];
  const noRoute = mode === "lines" && shownLines.filter((x) => routes[x.rd + "@" + mon] === null).length;
  return (
    <div className="card">
      <p className="maphint">בוחרים עיר (או ״כל הארץ״), שנה וחודש — או שנה שלמה — והמפה מראה איך זה נראה אז: תחנות שהשתנו בתקופה (לחיצה על סימן = מה קרה לה), או כל קווי העיר על המסלול כפי שהיה אז, כל קו בצבע משלו (בכל הארץ — רק הקווים שהשתנו); סימון סוגי שינוי מבליט בעבה את הקווים שבהם זה קרה. ״2012 · קווים״ מציג את נתוני הקווים; ״2012 · תחנות OpenStreetMap״ מציג את צילום התחנות מהמקור הנוסף.</p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input className="search" style={{ flex: 1, minWidth: 180 }} list="lh-map-cities" value={city} onChange={(e) => setCity(e.target.value)} placeholder="עיר… (למשל חולון)" aria-label="עיר" />
        <button className={"mchip" + (canon === "*" ? " on" : "")} aria-pressed={canon === "*"} title="כל התחנות/הקווים שהשתנו בכל הארץ, בלי לבחור עיר"
          onClick={() => setCity(canon === "*" ? "" : ALL_IL)}>🗺️ כל הארץ</button>
      </div>
      <datalist id="lh-map-cities"><option value={ALL_IL} />{(cities || []).map((c) => <option key={c} value={c} />)}</datalist>
      {months && (
        <div className="months" style={{ marginTop: 10 }}>
          {years.map((y) => (
            <button key={y} className={"mchip" + (yr === y && !is2012 ? " on" : "")} aria-pressed={yr === y && !is2012}
              onClick={() => { setYr(y); if(y === "2012") setMode("lines"); const ms = months.filter((m) => m.startsWith(y)); if (!ms.includes(mon) && mon !== "Y:" + y) setMon(ms[ms.length - 1]); }}>{y === "2012" ? "2012 · קווים" : y}</button>
          ))}
        </div>
      )}
      {months && <div className="months" style={{borderTop:"1px solid #e2e8f0",paddingTop:10}}>
          <span className="pdesc">צילום תחנות ממקור נוסף:</span>
          <button className={"mchip" + (is2012 ? " on" : "")} aria-pressed={is2012} title="כל התחנות שהיו בעיר (או בכל הארץ) ברישום התחנות של משרד התחבורה מ-2012"
            onClick={() => { setYr("2012"); setMon("snapshot2012"); setMode("stops"); setKinds(new Set()); }}>2012 · תחנות OpenStreetMap</button>
        </div>}
      {months && yr && !is2012 && (
        <div className="months">
          <button className={"mchip" + (mon === "Y:" + yr ? " on" : "")} aria-pressed={mon === "Y:" + yr} title={"כל השינויים של שנת " + yr + " יחד"} onClick={() => setMon("Y:" + yr)}>🗓️ כל {yr}</button>
          {months.filter((m) => m.startsWith(yr)).slice().reverse().map((m) => (
            <button key={m} className={"mchip" + (mon === m ? " on" : "")} aria-pressed={mon === m} onClick={() => setMon(m)}>{m.split("-").reverse().join(".")}</button>
          ))}
        </div>
      )}
      <div className="tabs" role="tablist" aria-label="מה להציג על המפה">
        <button role="tab" aria-selected={mode === "stops"} className={"tab" + (mode === "stops" ? " on" : "")} onClick={() => setMode("stops")}>🚏 תחנות שהשתנו</button>
        <button role="tab" aria-selected={mode === "lines"} className={"tab" + (mode === "lines" ? " on" : "")} onClick={() => setMode("lines")}>🚌 קווים שהשתנו</button>
      </div>
      {canon && mon && !is2012 && (
        <div className="months">
          {mode === "stops"
            ? STOP_KIND_LIST.filter((k) => stopKindCounts[k]).map((k) => (
              <button key={k} className={"mchip" + (kinds.has(k) ? " on" : "")} aria-pressed={kinds.has(k)} onClick={() => toggleKind(k)}>
                <i className="katdot" style={{ background: SKINDS[k].color, display: "inline-block", width: 9, height: 9, borderRadius: "50%", marginInlineEnd: 5 }} />{SKINDS[k].label} <b>{stopKindCounts[k]}</b></button>))
            : Object.keys(lineKindCounts).sort((a, b) => lineKindCounts[b] - lineKindCounts[a]).map((k) => (
              <button key={k} className={"mchip" + (kinds.has(k) ? " on" : "")} aria-pressed={kinds.has(k)} onClick={() => toggleKind(k)}>
                <i className="katdot" style={{ background: catColor(k), display: "inline-block", width: 9, height: 9, borderRadius: "50%", marginInlineEnd: 5 }} />{(KINDS[k] || { label: k }).label} <b>{lineKindCounts[k]}</b></button>))}
          {kinds.size > 0 && <button className="katclear" onClick={() => setKinds(new Set())}>✖ נקה</button>}
        </div>
      )}
      <div className="mapstat">
        {is2012 ? (!canon ? "בחרו עיר כדי להתחיל" : !snap12 ? "טוען…" : <>{stopGroups.length.toLocaleString()} תחנות {inPlace} ברישום 2012 · המקור: רישום התחנות של משרד התחבורה מיוני 2012 (GTFS), כפי שיובא ל-<a href="https://www.openstreetmap.org/changeset/14265835" target="_blank" rel="noopener">OpenStreetMap</a> (32,987 תחנות בארץ, רישיון ODbL) · לחיצה על תחנה: שם, מק״ט וכתובת של אז</>)
          : !canon ? "בחרו עיר כדי להתחיל" : !mon ? "בחרו חודש" : (mode === "stops" ? (stopChs === null ? "טוען…" : stopGroups.length ? `${stopGroups.length.toLocaleString()} תחנות ${inPlace} השתנו ${bP(mon)}` : `אין תחנות ${inPlace} שהשתנו ${bP(mon)}`)
          : (lineChs === null || prog ? "טוען…" : canon === "*"
            ? `כל הארץ: ${lineGroups.length.toLocaleString()} קווים השתנו ${bP(mon)} — על המפה רק הם, לא כל קווי הארץ` + (lineGroups.length ? (kinds.size ? ` · ${shownLines.length} מובלטים` : " — סמנו סוגי שינוי כדי להבליט אותם") : "") + (noRoute && shownLines.length ? ` · ל-${noRoute} מהמסומנים אין שרטוט מאותו זמן` : "")
            : `${cityLines.filter((l) => routes[l.rd + "@" + mon]).length} קווים של ${canon} היו בתוקף ${isYear(mon) ? "בסוף " + mon.slice(2) : bP(mon)}` + (lineGroups.length ? (isYear(mon) ? ` · ${lineGroups.length} קווים השתנו באותה שנה` : ` · ${lineGroups.length} מהם השתנו באותו חודש`) + (kinds.size ? ` · ${shownLines.length} מובלטים` : " — סמנו סוגי שינוי כדי לצבוע אותם") : "") + (noRoute && shownLines.length ? ` · ל-${noRoute} מהמסומנים אין שרטוט מאותו זמן` : "")))}
      </div>
      <div className="mapwrap">
        <div className="citymap" ref={mapRef} role="application" aria-label="מפת השינויים לפי מקום ותקופה" />
        {prog && <div className="mapload" role="status" aria-live="polite">
          <div className="mapprog-t">{mode === "stops" ? `מצייר ${prog.total.toLocaleString()} תחנות…` : `טוען את קווי ${place} כפי שהיו ${bP(mon)}…`} {prog.done.toLocaleString()}/{prog.total.toLocaleString()}</div>
          <div className="mapprog-s">{mode === "stops" ? "המפה תוצג כשכל התחנות יהיו מוכנות" : "המפה תוצג כשכל הקווים יהיו מוכנים"}</div>
          <div className="mapprog-b"><i style={{ width: Math.round(prog.done / prog.total * 100) + "%" }} /></div>
        </div>}
      </div>
    </div>
  );
}

const TABS = [
  { k: "rail", icon: "🚆", label: "רכבת", tts: ["rail", "lightrail", "cable"],
    tip: "רכבת ישראל, הרכבת הקלה בירושלים, הכרמלית וכבל אקספרס — היסטוריית מסלולים ותחנות",
    groups: [
      { k: "heavy", icon: "🚆", label: "רכבת ישראל", tts: ["rail"] },
      { k: "light", icon: "🚊", label: "רכבת קלה וכרמלית", tts: ["lightrail", "cable"] },
    ] },
  { k: "taxi", icon: "🚕", label: "מוניות שירות", tts: ["taxi"],
    tip: "קווי מוניות השירות שבפיד הארצי — מסלולים, תחנות והשינויים בהם",
    groups: [] },
];
// רשת 2012 היא אוטובוסים בלבד — לסוגים האלה אין שם מקבילה
const NO_2012 = new Set(["rail", "lightrail", "cable", "taxi"]);
const TT_ICON = { rail: "🚆", taxi: "🚕", lightrail: "🚊", cable: "🚡", demand: "🚐" };
// מקור האירוע — שלושה מקורות שונים לחלוטין, וכל אחד עם דיוק אחר. בלי
// לנקוב בשם, "מארכיון הפיד הארצי" לא אומר מי מדד ומתי.
const SRC_LABEL = {
  miu12: "מקור: ארכיון מרחב ו־Internet Archive.",
  obusOld: "מקור: ארכיון אוטובוס פתוח / הסדנא לידע ציבורי.",
  tf: "מקור: ארכיון TransitFeeds / OpenMobilityData.",
  tf17: "מקור: ארכיון TransitFeeds / OpenMobilityData.",
  ob: "מקור: ארכיון הסדנא לידע ציבורי (Open Bus) — צילומים יומיים, 01.2022–07.2026",
  v10: "מקור: קובץ הרישוי היומי Gtfs_10_days של משרד התחבורה — הפורמט שמייצג כמה רכבים באותה יציאה",
  _daily: "מקור: הסריקה היומית שלנו — השוואת הפיד הארצי, יום מול יום",
  rishui: "מקור: מאגר \"רישוי מערך האוטובוסים\" של משרד התחבורה (data.gov.il) — סוג וגודל הרכב שנקבעו לקו, שורה לכל מק\"ט לכל יום מ-2022",
  ctl: "מקור: רשימת האשכולות (ClusterToLine) שמשרד התחבורה מפרסם לצד לוח הזמנים — סוג הקו ואשכול המכרז, צילום יומי מ-03.2022 בארכיון הסדנא לידע ציבורי; הייחודיות (תלמידים/לילה/מזינים) — קובץ הנוסעים של המשרד",
};

// רשימת המקורות המלאה. היא מוצגת למשתמש ולא רק מתועדת בקוד: מי שקורא
// "תחנה בוטלה ב-2019" צריך לדעת מאיפה זה ידוע, ומה הגבול של מה שידוע.
const SOURCES = [
  {
    "t": "קובצי GTFS ששוחזרו מעמותת מרחב",
    "d": "07–21.07.2012",
    "b": "קובצי GTFS ששוחזרו מקבצים אזוריים של נחמן שלף ועמותת מרחב, שנשמרו ב־Internet Archive. כוללים קווים, תחנות, מסלולים ויציאות מתוכננות. הכיסוי חלקי.",
    "links": [
      [
        "קובצי המקור ותאריכיהם",
        "https://github.com/Transit-Freak/kav-bochan/blob/main/line-history/data/early-sources.json"
      ],
      [
        "Internet Archive",
        "https://web.archive.org/"
      ]
    ]
  },
  {
    "t": "רשת 2012 מאתר מגיעים",
    "d": "צילום יחיד מ-2012",
    "b": "צילום נפרד של רשת האוטובוסים מאתר מגיעים: רצפי תחנות של 3,214 קווים. משמש להשוואה לרשת המאוחרת ולהצגת קווים שעצרו בתחנה. התאמה לקו כיום היא התאמה מוצעת, ולא הוכחה לרציפות לאורך השנים.",
    "links": [
      [
        "הנתונים ששוחזרו באתר",
        "../magihim-2012/data/index.json"
      ],
      [
        "תהליך בניית רשת מגיעים",
        "https://github.com/Transit-Freak/kav-bochan/blob/main/tools/build_magihim_site.py"
      ]
    ]
  },
  {
    "t": "OpenStreetMap: רישום תחנות 2012",
    "d": "2012",
    "b": "מיקומי תחנות ומזהים מתוך רישום היסטורי ב־OpenStreetMap המבוסס על יבוא נתוני משרד התחבורה. משמשים להצלבת תחנות רשת מגיעים ולהצגתן במפה.",
    "links": [
      [
        "OpenStreetMap",
        "https://www.openstreetmap.org/copyright"
      ],
      [
        "תהליך הצלבת התחנות",
        "https://github.com/Transit-Freak/kav-bochan/blob/main/tools/crossref_magihim_stops.py"
      ]
    ]
  },
  {
    "t": "רכבת פתוחה",
    "d": "2013–2014",
    "b": "רישומי רכבת ישראל: מספר רכבת, תחנה, הגעה ויציאה מתוכננות ובפועל. נשמרו במאגר OpenTrainCommunity של הסדנא. זהו מקור נפרד מקובצי GTFS.",
    "links": [
      [
        "ארכיון רכבת פתוחה",
        "https://github.com/hasadna/OpenTrainCommunity/tree/8dd9ba7b3ebed022469723df6974b27bf2c5577d/data"
      ]
    ]
  },
  {
    "t": "הארכיון הישן של אוטובוס פתוח",
    "d": "2015–2018",
    "b": "קובצי GTFS שהורדנו מתיקיית old_gtfs בארכיון הסדנא לידע ציבורי. הקליטה הדרגתית; הכיסוי הזמין מוצג בבחירת השנה.",
    "links": [
      [
        "פרויקט אוטובוס פתוח",
        "https://github.com/hasadna/open-bus"
      ],
      [
        "התקדמות קליטת הקבצים",
        "data/early-progress.json"
      ],
      [
        "רשימת קובצי הארכיון",
        "https://github.com/Transit-Freak/kav-bochan/blob/main/line-history/data/early-sources.json"
      ]
    ]
  },
  {
    "t": "ארכיון TransitFeeds / OpenMobilityData",
    "d": "16.03.2017 – 14.01.2022",
    "b": "צילומי GTFS שהורדנו מארכיון OpenMobilityData, שנקרא בעבר TransitFeeds. משמשים להיסטוריית הקווים והתחנות; הכיסוי אינו בהכרח יומי.",
    "links": [
      [
        "תהליך ההורדה ומיקום הארכיון",
        "https://github.com/Transit-Freak/kav-bochan/blob/main/tools/backfill_tf.py"
      ]
    ]
  },
  {
    "t": "רישוי מערך האוטובוסים — משרד התחבורה",
    "d": "מ-01.2022 והלאה",
    "b": "מאגר ב-data.gov.il עם שורה לכל מק\"ט לכל יום: הסוג (עירוני/בינעירוני) והגודל (אוטובוס/מיניבוס/מידיבוס/מפרקי) של הרכב שנקבע לקו. ממנו מגיעים \"שינוי סוג רכב\" בציר הזמן והתג ליד הנגישות. השדות קיימים רק מ-2022.",
    "links": [
      [
        "מאגרי המידע הממשלתיים",
        "https://data.gov.il/"
      ],
      [
        "תהליך קליטת הרישוי",
        "https://github.com/Transit-Freak/kav-bochan/blob/main/tools/linehistory_rishui.py"
      ]
    ]
  },
  {
    "t": "ארכיון אופן באס — הסדנא לידע ציבורי",
    "d": "16.01.2022 – 24.07.2026",
    "b": "צילומים יומיים של הפיד הארצי. מהם נבנתה היסטוריית הקווים והתחנות לתקופה הזו, וממנו גם השינויים שתוכננו ולא נכנסו לתוקף מינואר 2023 ואילך.",
    "links": [
      [
        "פרויקט אוטובוס פתוח",
        "https://github.com/hasadna/open-bus"
      ],
      [
        "תהליך בדיקת הארכיון",
        "https://github.com/Transit-Freak/kav-bochan/blob/main/tools/audit_archive_daily.py"
      ]
    ]
  },
  {
    "t": "הסריקה היומית שלנו",
    "d": "מ-25.07.2026 והלאה",
    "b": "הורדה יומית של הפיד הארצי (israel-public-transportation.zip) והשוואה מול היום הקודם. זה המקור החי — כל מה שמכאן והלאה נמדד ביום שבו קרה.",
    "links": [
      [
        "תיעוד משרד התחבורה",
        "https://www.gov.il/BlobFolder/generalpage/gtfs_general_transit_feed_specifications/he/GTFS%20-%20Developer%20Information.pdf"
      ]
    ]
  },
  {
    "t": "קובץ הרישוי היומי Gtfs_10_days",
    "d": "מ-08.2026 והלאה",
    "b": "הפורמט החדש של משרד התחבורה, היחיד שמייצג שני אוטובוסים או שלושה שיוצאים באותה דקה על אותה נסיעה. ממנו נרשמים שינויי תגבור. הארכיונים לא שמרו אותו, ולכן אין לו היסטוריה.",
    "links": [
      [
        "תהליך קליטת הנתונים",
        "https://github.com/Transit-Freak/kav-bochan/blob/main/tools/linehistory.py"
      ]
    ]
  }
];

const TT_LABEL = { rail: "רכבת", taxi: "מונית שירות", lightrail: "רכבת קלה",
                   cable: "רכבל/כרמלית", demand: "שירות לפי דרישה" };

function ModesTab({ idx, openLine, spec }) {
  const citySearch = useRouteCities();
  const [daily, setDaily] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  const [q, setQ] = usePersistedQ("lh-q-" + spec.k);
  const [lim, setLim] = useState(200);
  useEffect(() => { setLim(200); setSel(new Set()); }, [spec.k]);
  useEffect(() => setLim(200), [q, sel]);

  const mine = useMemo(() => idx.lines.filter((l) => spec.tts.includes(l.tt)), [idx, spec]);
  const counts = useMemo(() => {
    const c = {};
    spec.groups.forEach((m) => { c[m.k] = mine.filter((l) => m.tts.includes(l.tt)).length; });
    return c;
  }, [mine, spec]);
  const toggle = (k) => setSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  // ב-useMemo — שלא ירוץ מחדש על כל רינדור שאינו קשור לחיפוש (סעיף 14)
  const { list, total } = useMemo(() => {
    const needle = q.trim();
    const allowed = sel.size ? new Set(spec.groups.filter((m) => sel.has(m.k)).flatMap((m) => m.tts)) : null;
    let ls = mine.filter((l) => !allowed || allowed.has(l.tt));
    if (needle) {
      ls = ls.filter(l => matchesRouteSearch(l, needle, citySearch.data, null, true));
    }
    const lnum = (l) => parseInt(l.line) || 1e9;
    ls = ls.slice().sort((a, b) => routeSearchRank(a, needle) - routeSearchRank(b, needle) || lnum(a) - lnum(b) || (a.line || "").localeCompare(b.line || "") || a.rd.localeCompare(b.rd));
    ls = collapse2012Rows(ls);
    return { total: ls.length, list: ls.slice(0, lim) };
  }, [mine, spec, sel, q, lim, citySearch.data]);

  return (
    <div className="card">
      <button className="kathead" aria-expanded={daily} onClick={()=>setDaily(!daily)}>📅 שינויים לפי יום — מה השתנה בכל תאריך, בכל הקווים</button>
      {daily ? <DayFeed key={spec.k} idx={idx} openLine={openLine} mode={spec.k} embedded /> : <>
      {spec.groups.length > 1 && (
        <div className="kfilter">
          <button className={"kchip" + (sel.size ? "" : " on")}
            style={sel.size ? {} : { borderColor: "#7c3aed", color: "#5b21b6" }}
            onClick={() => setSel(new Set())}>הכל<b>{mine.length.toLocaleString()}</b></button>
          {spec.groups.map((m) => (
            <button key={m.k} className={"kchip" + (sel.size && !sel.has(m.k) ? " off" : "")}
              style={sel.has(m.k) ? { borderColor: "#7c3aed", color: "#5b21b6" } : {}}
              onClick={() => toggle(m.k)}>
              {m.icon} {m.label}<b>{(counts[m.k] || 0).toLocaleString()}</b>
            </button>
          ))}
        </div>
      )}
      <input className="search" type="search" dir="rtl"
        placeholder="חיפוש: מספר קו, מק״ט, עיר בדרך, יעד או מפעיל…"
        value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="llist">
        {list.map((l) => (
          <a key={l.rd} className="lrow" href={lineHref(l.rd)}
            onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); openLine(l.rd); }}>
            <span className="badge sm">{l.line || TT_ICON[l.tt] || "—"}</span>
            {l.lk === "removed" && (
              <span className="k" style={{ background: isRemovedYear(l) ? "#7f1d1d" : "#dc2626" }}>
                {isRemovedYear(l) ? "בוטל — מעל שנה" : "בוטל"}
              </span>
            )}
            <span className="ldest">{l.dest}</span>
            <span className="lmeta">{l.op} · מק״ט <span className="rdnum" dir="ltr">{rdTxt(l.rd)}</span> · {l.v > 1 ? (l.v - 1) + " שינויים" : "ללא שינויים עדיין"}</span>
          </a>
        ))}
        {list.length === 0 && <div className="empty">לא נמצא קו תואם.</div>}
        {total > list.length && (
          <button className="morebtn" onClick={() => setLim(lim + 300)}>
            ⌄ הצג עוד — מוצגים {list.length.toLocaleString()} מתוך {total.toLocaleString()}
          </button>
        )}
      </div>
      </>}
    </div>
  );
}

/* הודעת הבדיקה-מחדש (בקשת שלמה): התגלתה תקלה בחלק מהמידע ההיסטורי —
   שרטוטים ומק"טים חסרים ושינויים בלי תאריך מדויק — וכל הארכיון נבדק
   מחדש מול שני המקורות. הטווחים חיים בקובץ סטטוס נפרד לכל מנוע סריקה
   (recheck-ob / recheck-tf) — קובץ משותף גרם לקונפליקטים בין המנועים —
   ו-recheck.json הישן נשאר כבסיס. המיזוג כאן, בדפדפן. */
function RecheckNotice() {
  const [rc, setRc] = useState(null);
  useEffect(() => {
    const grab = (u) => dfetch(u).then((r) => r.json()).catch(() => ({}));
    Promise.all([grab("data/recheck.json"), grab("data/recheck-ob.json"), grab("data/recheck-tf.json")])
      .then(([a, b, c]) => setRc({ ...a, ...b, ...c }))
      .catch(() => {});
  }, []);
  if (!rc || !rc.ob_young) return null;
  const f = (d) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : "");
  const obDone = rc.ob_pass >= 2 || rc.ob_young <= "2022-01-16";
  const tfDone = rc.tf_young && rc.tf_young <= "2017-03-20";
  if (obDone && tfDone && rc.ob_pass >= 2) return null;   // הבדיקה הסתיימה — ההודעה יורדת
  return (
    <div style={{ background: "#fffbeb", border: "1px solid #f3d9a4", borderRadius: 12,
      padding: "10px 14px", margin: "10px 0 2px", fontSize: 14, lineHeight: 1.55, color: "#57534e" }}>
      <b style={{ color: "#92400e" }}>🛠️ הודעה: התגלתה תקלה בחלק מהמידע ההיסטורי, והארכיון נבדק ומתעדכן מחדש מול שני המקורות.</b>
      <div>
        ✅ <b>טווח הנתונים המעודכן והמאומת: {f(rc.ob_young)} ← היום</b>{rc.ob_pass >= 2 ? " (מעבר אימות שני)" : ""}.
      </div>
      <div>
        🔄 נתונים מלפני {f(rc.ob_young)} (עד מרץ 2017) עדיין בבדיקה מחדש ועשויים להתעדכן בימים הקרובים.
      </div>
    </div>
  );
}

// Recovered sources use the same line pages and maps as the rest of הקו בזמן.
async function earlyGrab(url) { const r = await dfetch(url); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }
async function earlyGzip(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("הקובץ לא נטען (" + r.status + ")");
  if (!window.DecompressionStream) throw new Error("לצפייה בקובץ הדחוס נדרש דפדפן מעודכן.");
  return new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).json();
}
function EarlyMap({ stops, shp }) {
  const el = useRef(null);
  useEffect(() => {
    if (!el.current || !window.L || !stops.length) return;
    const map = L.map(el.current, { scrollWheelZoom: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
    const points = stops.map(s => [s[2], s[3]]);
    // Lines between stops are deliberately dashed when no historical shape exists.
    let route = points;
    if (shp) { try { route = decodeShape(shp); } catch(e) { route = points; } }
    L.polyline(route, { color: "#6d28d9", weight: 4, dashArray: shp ? null : "5 8" }).addTo(map);
    stops.forEach(s => {
      const label = document.createElement("span"); label.textContent = s[0] + " · " + s[1];
      L.circleMarker([s[2],s[3]], { radius: 4, color: "#4338ca", fillOpacity: 1 }).addTo(map).bindPopup(label);
    });
    map.fitBounds(L.latLngBounds(points), { padding: [20,20], maxZoom: 15 });
    return () => map.remove();
  }, [stops, shp]);
  return <div ref={el} style={{ height: 330, borderRadius: 14, margin: "12px 0" }} aria-label="מפת התחנות ההיסטוריות" />;
}

// Reconstruct actual service dates so different calendar periods are never counted as simultaneous trips.
function EarlyPatternLoader({ event }) {
  const [data,setData]=useState(null),[err,setErr]=useState("");
  const load=()=>{if(data)return;earlyGzip("data/early-patterns/"+event.earlyPatternsFile+".json.gz").then(setData).catch(e=>setErr(e.message));};
  return <details className="early-detail" onToggle={e=>{if(e.currentTarget.open)load();}}><summary>כל תבניות המסלול ולוחות היציאה ({event.earlyPatternCount})</summary>{err?<p role="alert">{err} <button onClick={load}>ניסיון חוזר</button></p>:data?<EarlyPatterns event={{...event,earlyPatterns:data}} />:<p>טוען…</p>}</details>;
}
function EarlyTripTimes({ pattern, service }) {
  const [trip,setTrip]=useState(0);
  const profile=pattern.timeProfiles?.[service.profiles?.[trip]];
  if(!profile)return null;
  const parts=service.departures[trip].split(":").map(Number);
  const base=parts[0]*3600+parts[1]*60+(parts[2]||0);
  const time=offset=>{if(offset==null)return "לא צוין";const total=base+offset;return [Math.floor(total/3600),Math.floor(total%3600/60),total%60].map(x=>String(x).padStart(2,"0")).join(":");};
  return <><label>זמני מעבר לפי יציאה <select value={trip} onChange={e=>setTrip(+e.target.value)}>{service.departures.map((d,i)=><option key={i} value={i}>{d}</option>)}</select></label><div className="early-scroll"><table><thead><tr><th>תחנה</th><th>הגעה מתוכננת</th><th>יציאה מתוכננת</th></tr></thead><tbody>{pattern.stops.map((stop,i)=><tr key={i}><td>{stop[1]}</td><td dir="ltr">{time(profile[i]?.[0])}</td><td dir="ltr">{time(profile[i]?.[1])}</td></tr>)}</tbody></table></div></>;
}
function EarlyPatterns({ event }) {
  const [pick, setPick] = useState(0);
  const p = (event.earlyPatterns || [])[pick];
  if (!p) return null;
  const weekdays = [["sunday","א׳"],["monday","ב׳"],["tuesday","ג׳"],["wednesday","ד׳"],["thursday","ה׳"],["friday","ו׳"],["saturday","שבת"]];
  const boarding = x => ({"0":"מותר", "1":"לא", "2":"בתיאום טלפוני", "3":"בתיאום עם הנהג"}[x] || "לא צוין");
  return <details className="early-detail"><summary>כל תבניות המסלול ולוחות היציאה מהקובץ ({event.earlyPatterns.length})</summary>
    <label>תבנית מסלול <select value={pick} onChange={e=>setPick(+e.target.value)}>{event.earlyPatterns.map((x,i)=><option key={i} value={i}>{i+1}: {x.stops.length} תחנות · {x.trips} רשומות נסיעה</option>)}</select></label>
    <p>הנתונים כפי שפורסמו אז. מספר הרשומות אינו מספר הנסיעות ביום. תוקף וימי פעילות מפורטים למטה.</p>
    <EarlyMap stops={p.stops} shp={p.shp} />
    {!p.shp && <p>לא נשמר שרטוט כביש לתבנית הזו. הקו המקווקו מחבר את מיקומי התחנות בלבד.</p>}
    <div className="early-scroll"><table><thead><tr><th>תחנה</th><th>מק״ט</th><th>עלייה</th><th>ירידה</th></tr></thead><tbody>{p.stops.map((s,i)=><tr key={i}><td>{i+1}. {s[1]}</td><td>{s[0]}</td><td>{boarding(p.boarding[i][0])}</td><td>{boarding(p.boarding[i][1])}</td></tr>)}</tbody></table></div>
    {p.services.map((s,i)=><details key={i}><summary>{weekdays.filter(([k])=>s.calendar[k]==="1").map(x=>x[1]).join(", ")} · {s.calendar.start_date}–{s.calendar.end_date} · {s.departures.length} יציאות</summary><p dir="ltr">{s.departures.join(" · ")}</p><EarlyTripTimes key={pick+":"+i} pattern={p} service={s} /></details>)}
    <p>מקור: {SRC_LABEL[event.src]} · מזהה הקו בקובץ: {event.routeId}</p>
  </details>;
}
// Historical snapshots share the ordinary transport categories and line pages.
function inHistoryMode(line, mode) {
  if (mode === "lines") return !line.tt || line.tt === "bus" || line.tt === "demand";
  return (TABS.find(t => t.k === mode)?.tts || []).includes(line.tt);
}
// Only published snapshots with data in this category are selectable.
function hasHistoricalData(record, mode) {
  if (!record) return false;
  if (mode === "stops") return record.stops > 0;
  const types = mode === "rail" ? ["0","2","5"] : mode === "taxi" ? ["8"] : null;
  return Object.entries(record.modes || {}).some(([type, count]) =>
    Number(count) > 0 && (types ? types.includes(type) : !["0","2","5","8"].includes(type)));
}
function useHistoricalMonths(mode) {
  const [available, setAvailable] = useState([]);
  useEffect(() => {
    let live = true;
    Promise.all([earlyGrab("data/early-progress.json"),
      mode === "rail" ? earlyGrab("data/early-rail/index.json").catch(() => ({days:[]})) : Promise.resolve({days:[]})
    ]).then(([progress,rail]) => {
      const dates = Object.values(progress.done || {}).filter(r => hasHistoricalData(r,mode)).map(r => r.date);
      if (live) setAvailable([...new Set([...dates,...(rail.days||[])].map(d=>d.slice(0,7)))].sort());
    }).catch(()=>{});
    return () => { live=false; };
  },[mode]);
  return available;
}
function HistoricalPeriod({ idx, openLine, mode, year, month = "", embedded = false }) {
  const [data, setData] = useState(null), [err, setErr] = useState("");
  const [q,setQ] = usePersistedQ("lh-history-q-"+mode);
  const [lim,setLim] = useState(7), [retry,setRetry] = useState(0);
  useEffect(()=>{
    let live=true;setData(null);setErr("");
    Promise.all([earlyGrab("data/early-sources.json"),earlyGrab("data/early-progress.json"),
      mode==="rail"?earlyGrab("data/early-rail/index.json"):Promise.resolve({days:[],sources:[]})])
      .then(([catalog,progress,rail])=>{if(live)setData({catalog,progress,rail});})
      .catch(()=>{if(live)setErr("לא הצלחנו לטעון את הנתונים.");});
    return()=>{live=false;};
  },[mode,retry]);
  useEffect(()=>setLim(7),[mode,month,year]);
  if(err)return <div role="alert">{err} <button onClick={()=>setRetry(retry+1)}>ניסיון נוסף</button></div>;
  if(!data)return <div role="status">טוען את הנתונים…</div>;
  const {catalog,progress,rail}=data;
  const entries=[
    ...catalog.snapshots.filter(s=>s.date.startsWith(month||year)&&hasHistoricalData(progress.done?.[s.id],mode))
      .map(s=>({key:s.id,date:s.date,snapshot:s})),
    ...(rail.days||[]).filter(d=>d.startsWith(month||year)).map(d=>({key:"rail-"+d,date:d,day:d}))
  ].sort((a,b)=>b.date.localeCompare(a.date)||a.key.localeCompare(b.key));
  const label=mode==="stops"?"תחנות":mode==="lines"?"קווי אוטובוס":TABS.find(t=>t.k===mode)?.label;
  return <div className={embedded?"":"card"}>
    <input className="search" aria-label={"חיפוש "+label+" בשנת "+year} value={q} onChange={e=>setQ(e.target.value)} placeholder={"חיפוש "+label+": מספר, שם או עיר…"} />
    <p className="pdesc">הנתונים שנשמרו, מסודרים לפי ימים. פער בתיעוד אינו מעיד שהשירות לא פעל.</p>
    {entries.some(e=>e.day)&&<p className="pdesc">רכבת ישראל: תכנון וביצוע. מקור: ארכיון רכבת פתוחה / הסדנא לידע ציבורי. אלה רישומי מעבר בתחנות; ערך אפס במקור אינו מוכיח הגעה בחצות.</p>}
    {entries.slice(0,lim).map(e=><HistoricalDay key={mode+"-"+e.key} idx={idx} openLine={openLine} mode={mode} catalog={catalog} progress={progress} snapshot={e.snapshot} day={e.day} q={q} />)}
    {!entries.length&&<p>אין נתונים זמינים לחודש הזה.</p>}
    {entries.length>lim&&<button className="morebtn" onClick={()=>setLim(lim+7)}>הצגת ימים נוספים ({entries.length-lim})</button>}
    <details><summary>מקורות וכיסוי הנתונים</summary>
      {(rail.sources||[]).filter(s=>String(s.year)===year).map(s=><p key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">קובץ רכבת {s.year} ↗</a></p>)}
      <p>נקלטו {Object.keys(progress.done||{}).length.toLocaleString()} מתוך {catalog.snapshots.length.toLocaleString()} קבוצות קבצים.</p>
      {catalog.gaps.map(g=><p key={g}>{g}</p>)}
    </details>
  </div>;
}

function HistoricalDay({ idx, openLine, mode, catalog, progress, snapshot, day, q }) {
  const citySearch = useRouteCities();
  const source = snapshot?.id || "";
  const [routes, setRoutes] = useState(null), [stops, setStops] = useState(null);
  const [err, setErr] = useState(""), [lim, setLim] = useState(60), [point, setPoint] = useState(null);
  const [railRows, setRailRows] = useState(null);
  useEffect(()=>{setLim(60);setPoint(null);},[q,source,day]);
  useEffect(()=>{
    let live=true;setRoutes(null);setStops(null);setErr("");
    if(!source||!progress?.done?.[source])return;
    const task=mode==="stops" ? earlyGzip("data/early-stops/"+source+".json.gz?v="+BUILD) : earlyGrab("data/early-routes/"+source+".json");
    task.then(d=>{if(live){if(mode==="stops")setStops(d.stops);else setRoutes(new Set(d.routes));}}).catch(e=>{if(live)setErr(e.message);});
    return()=>{live=false;};
  },[source,progress,mode]);
  useEffect(()=>{let live=true;setRailRows(null);if(!day)return;
    earlyGzip("data/early-rail/"+day+".json.gz?v="+BUILD).then(r=>{if(live)setRailRows(r.rows);}).catch(e=>{if(live)setErr(e.message);});return()=>{live=false;};
  },[day]);
  const selected=snapshot;
  const tokens=sQ(q).split(/\s+/).filter(t=>t&&t!=="קו");
  const match=s=>tokens.every(t=>sQ(s).includes(t));
  const lines=collapse2012Rows(routes&&idx ? idx.lines.filter(l=>routes.has(l.rd)&&inHistoryMode(l,mode)&&matchesRouteSearch(l,q,citySearch.data,snapshot.date))
    .sort((a,b)=>routeSearchRank(a,q)-routeSearchRank(b,q)||String(a.line||"").localeCompare(String(b.line||""),"he",{numeric:true})||a.rd.localeCompare(b.rd)) : []);
  const ss=(stops||[]).filter(s=>match([s.c,s.n,s.desc].join(" ")));
  const rr=(railRows||[]).filter(r=>match(r.join(" ")));
  const label=mode==="stops"?"תחנות":mode==="lines"?"קווי אוטובוס":TABS.find(t=>t.k===mode)?.label;
  return <section className="historical-day" data-date={day || snapshot.date}>
    <h3 className="dayhead">{fmtD(day || snapshot.date)}</h3>
    <CitySearchStatus state={citySearch} />
    {err&&<p role="alert">{err}</p>}
    {snapshot && <>
      <p>מקור: {catalog.credits[selected?.kind]}</p>
      {selected?.validThrough&&<p>תוקף לוח השירות: {fmtD(selected.date)}–{fmtD(selected.validThrough)}.</p>}
      {!progress?.done?.[source] ? <p role="status">הקובץ לתאריך הזה טרם נקלט. הנתונים יוצגו כאן לאחר עיבודו.</p> : mode==="stops" ? <>
        {stops===null ? <p role="status">טוען תחנות…</p> : <><p>{ss.length.toLocaleString()} תחנות</p>{ss.slice(0,lim).map(s=><button className="early-result" key={s.id} onClick={()=>setPoint(s)}>{s.c} · {s.n}<small>{s.desc}</small></button>)}</>}
        {point&&<div><h4>{point.c} · {point.n}</h4><EarlyMap stops={[[point.c,point.n,point.la,point.lo]]} shp="" /></div>}
      </> : <>
        {routes===null||!idx ? <p role="status">טוען קווים…</p> : <><p>{lines.length.toLocaleString()} קווים</p><div className="llist">{lines.slice(0,lim).map(l=><a className="lrow" key={l.rd} href={lineHref(l.rd)} onClick={e=>{if(!plainClick(e))return;e.preventDefault();openLine(l.rd);}}><span className="badge sm">{l.line||TT_ICON[l.tt]||"—"}</span><span className="ldest">{l.dest}</span><span className="lmeta">{l.op} · מק״ט {rdTxt(l.rd)}</span></a>)}</div>{!lines.length&&<p>לא נמצאו {label} תואמים בצילום הזה.</p>}</>}
      </>}
      {(lines.length>lim||ss.length>lim)&&<button className="morebtn" onClick={()=>setLim(lim+100)}>הצגת עוד תוצאות</button>}
    </>}
    {day && <>
      {day&&!railRows&&<p role="status">טוען רישומי רכבות…</p>}{railRows&&<><p>{rr.length.toLocaleString()} רישומים מתאימים</p><div className="early-scroll"><table><thead><tr>{["רכבת","תחנה","קוד","הגעה מתוכננת","הגעה בפועל","יציאה מתוכננת","יציאה בפועל"].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rr.slice(0,lim).map((r,i)=><tr key={i}>{r.map((v,j)=><td key={j}>{v}</td>)}</tr>)}</tbody></table></div>{rr.length>lim&&<button onClick={()=>setLim(lim+100)}>עוד רישומים</button>}</>}
    </>}
    {snapshot && <details><summary>מקור הנתונים ליום הזה</summary>
      {snapshot.coverage&&<p>{snapshot.coverage}</p>}
      {(snapshot.urls||[]).map((u,i)=><p key={u}><a href={u} target="_blank" rel="noopener noreferrer">קובץ המקור {i+1} ↗</a></p>)}
    </details>}
  </section>;
}

function App() {
  const citySearch = useRouteCities();
  const [idx, setIdx] = useState(null);
  const [err, setErr] = useState(null);
  // ‎#t=stops‎ וכד' — הטאב נשמר בכתובת, כדי שריענון לא יחזיר לעמוד הראשי
  const [tab, setTab] = useState(() => {
    const h = decodeURIComponent((location.hash || "").slice(1));
    if (h.startsWith("stop=")) return "stops";
    if (h.startsWith("t=")) {
      const t = h.slice(2);
      if (t === "early") return "lines";
      if (t === "stops" || t === "map" || TABS.some((x) => x.k === t)) return t;
    }
    return "lines";
  });
  const [q, setQ] = usePersistedQ("lh-q-main");
  const [kats, setKats] = useState(() => new Set());   // קטגוריות מסומנות (בחירה מרובה)
  const [katOpen, setKatOpen] = useState(false);
  // דף קו נכנס להיסטוריית הדפדפן (וגם לקישור, אחרי ה-#) — כפתור "אחורה"
  // בטלפון חוזר לרשימה במקום לצאת מהאתר, וקישור לקו נפתח ישירות עליו.
  // ‎#2012/<k>‎ הוא כתובת של קו 2012 בלי מקבילה של היום — נפתח בפיד.
  const H0 = decodeURIComponent((location.hash || "").slice(1));
  const isStopH = (h) => h.startsWith("stop=");
  // ‎#מקט@תאריך‎ — קישור מציר תחנה שנוחת ישר על גרסת השינוי
  const splitRdDate = (h) => { const i = h.lastIndexOf("@"); return i > 0 ? [h.slice(0, i), h.slice(i + 1)] : [h, null]; };
  const isDigestH = (h) => h.startsWith("digest=");
  const parseDigest = (h) => { const [c, d] = h.slice(7).split("@"); return { city: c, days: parseInt(d) || 7 }; };
  const [dig, setDig] = useState(() => (isDigestH(H0) ? parseDigest(H0) : null));
  const _plainH = H0 && !H0.startsWith("2012/") && !isStopH(H0) && !isDigestH(H0) && !H0.startsWith("t=");
  const [rd, setRd] = useState(() => (_plainH ? splitRdDate(H0)[0] : null));
  const [rdDate, setRdDate] = useState(() => (_plainH ? splitRdDate(H0)[1] : null));
  const [stopSel, setStopSel] = useState(() => (isStopH(H0) ? H0.slice(5) : null));
  // מונה פתיחות: לחיצה חוזרת על קישור לאותה תחנה חייבת לפתוח מחדש גם
  // כשהמזהה עצמו לא השתנה
  const [stopSelN, setStopSelN] = useState(0);
  const [byDay, setByDay] = useState(() => location.hash === "#t=early");   // תצוגת "שינויים לפי יום"
  // ‎#2012/<k>‎ הוא עמוד לכל דבר, ולא שורה שנפתחת בתוך הפיד
  const [k12, setK12] = useState(() => (H0.startsWith("2012/") ? H0.slice(5) : null));
  const [anc12, setAnc12] = useState({});      // מפתח קו 2012 -> מק"ט של היום
  useEffect(() => {
    if (!k12) return;
    getAnchors2012().then((d) => {
      const m = {};
      for (const [rd, v] of Object.entries(d.anchors || {})) if (!(v.k in m)) m[v.k] = rd;
      setAnc12(m);
    });
  }, [k12]);
  // ערים להרשמה להתראות — מערי הקצה של כל הקווים בקטלוג
  const notifyCities = useMemo(() => {
    const cnt = {};
    (((idx || {}).lines) || []).forEach((l) => destCities(l.dest).forEach((c) => { cnt[c] = (cnt[c] || 0) + 1; }));
    return Object.keys(cnt).filter((c) => cnt[c] >= 3).sort((a, b) => cnt[b] - cnt[a]);
  }, [idx]);
  const [lim, setLim] = useState(200);   // "הצג עוד" מרחיב; חיפוש חדש מאפס
  useEffect(() => setLim(200), [q, kats]);
  useEffect(() => {
    const onPop = (e) => { setRd((e.state && e.state.rd) || null); setK12((e.state && e.state.k12) || null); };
    const onHash = () => {
      const h = decodeURIComponent((location.hash || "").slice(1));
      if (h.startsWith("2012/")) { setRd(null); setK12(h.slice(5)); return; }
      if (isStopH(h)) { setRd(null); setStopSel(h.slice(5)); setStopSelN((n) => n + 1); setTab("stops"); return; }
      if (isDigestH(h)) { setRd(null); setK12(null); setDig(parseDigest(h)); return; }
      if (h.startsWith("t=")) { setRd(null); setK12(null); const t = h.slice(2); if (t === "early") { setTab("lines"); setByDay(true); try { sessionStorage.setItem("lh-day-yr","2012"); sessionStorage.setItem("lh-day-mon","2012-07"); } catch {} } else if (t === "stops" || t === "lines" || t === "map" || TABS.some((x) => x.k === t)) setTab(t); return; }
      // כתובת של קו נקראה רק בטעינה הראשונה: מי שהדביק קישור לקו בשורת
      // הכתובת של לשונית פתוחה, או ערך את הכתובת ידנית, נשאר במסך הקודם.
      // pushState/replaceState אינם מפעילים hashchange, ולכן אין כאן לולאה.
      if (h) { setK12(null); const [r, dt] = splitRdDate(h); setRd(r); setRdDate(dt); }
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onHash);
    return () => { window.removeEventListener("popstate", onPop); window.removeEventListener("hashchange", onHash); };
  }, []);
  const openLine = (r) => {
    setDig(null); setK12(null); setRdDate(null); history.pushState({ rd: r }, "", "#" + encodeURIComponent(r)); setRd(r); };
  const open12 = (k) => { history.pushState({ k12: k }, "", "#2012/" + encodeURIComponent(k)); setK12(k); };
  const switchLine = (r) => { history.replaceState({ rd: r }, "", "#" + encodeURIComponent(r)); setRd(r); };
  // הכתובת חוזרת לשורש רק בטאב "קווים"; בכל טאב אחר נשאר ‎#t=<טאב>‎ —
  // כך ריענון מחזיר לאותו מקום ולא לעמוד הראשי (בקשת שלמה)
  const clearHashKeepTab = (t) => {
    const tt = typeof t === "string" ? t : tab;
    history.replaceState(null, "", tt && tt !== "lines" ? "#t=" + tt : location.pathname + location.search);
  };
  const backToList = (t) => {
    setRd(null);
    clearHashKeepTab(t);
  };
  const toggleKat = (k) => setKats((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const [rty, setRty] = useState(0);
  useEffect(() => {
    dfetch("data/lines.json")
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(async d => {
        const groups = await dfetch("data/historical-groups-2012.json").then(r => r.ok ? r.json() : {}).catch(() => ({}));
        setIdx(attach2012Groups(d, groups));
      })
      .catch(setErr);
  }, [rty]);
  const counts = useMemo(() => {
    const c = {};
    if (idx) {
      const keys = CAT_GROUPS.flatMap((g) => g.items);
      // אותה אוכלוסייה שהרשימה מציגה. אחרת המספר ליד הקטגוריה גדול ממה
      // שנפתח בלחיצה עליה.
      idx.lines.filter((l) => !l.tt || l.tt === "demand").forEach((l) => {
        keys.forEach((k) => { if (catMatch(l, k)) c[k] = (c[k] || 0) + 1; });
      });
    }
    return c;
  }, [idx]);
  // אילו מק"טים עדיין פעילים — כדי להבדיל חלופה מבוטלת מקו שבוטל כולו
  // הטאב אינו חלק מהכתובת, ולכן ריענון או פתיחת קישור ישיר לקו החזירו
  // תמיד ל"קווים" — וכפתור "חזרה" הוציא את המשתמש מקו רכבת אל רשימת
  // האוטובוסים. הטאב נגזר מסוג הקו הפתוח, כך שהחזרה נוחתת במקום שממנו
  // הגיע גם כשהמצב בזיכרון אבד.
  useEffect(() => {
    if (!idx || !rd) return;
    const l = idx.lines.find((x) => x.rd === rd);
    const t = l && l.tt && TABS.find((x) => x.tts.includes(l.tt));
    setTab(t ? t.k : "lines");
  }, [idx, rd]);
  const mktAlive = useMemo(() => {
    const m = {};
    if (idx) idx.lines.forEach((l) => { if (l.lk !== "removed" && !l.historicalOnly) m[l.rd.split("-")[0]] = true; });
    return m;
  }, [idx]);
  const isLineGone = (l) => l.lk === "removed" && !mktAlive[l.rd.split("-")[0]];
  // הסינון והמיון של 13 אלף שורות ב-useMemo: קודם הם רצו מחדש גם ברינדורים
  // שאינם קשורים לחיפוש — פתיחת קטגוריות, "הצג עוד" — תקיעות מורגשת בנייד
  const searchRes = useMemo(() => {
    const needle = q.trim();
    if (!idx || (!needle && !kats.size)) return { list: [], total: 0 };
    const inKats = (l) => {
      if (!kats.size) return true;
      for (const k of kats) { if (catMatch(l, k)) return true; }
      return false;
    };
    // חיפוש רב-מילים: "13 קרית גת" — כל מילה חייבת להתאים לאחד השדות.
    // ההשוואה דרך sQ: גרשיים בכל צורה (רשל"צ / רשל''צ / רשל״צ) מתאימים
    const toks = sQ(needle).split(/\s+/).filter(Boolean);
    // טאב "קווים" הוא אוטובוסים. קווי "שירות לפי דרישה" מופעלים בידי חברות
    // האוטובוס ונשארים גם כאן, ולא רק בטאב סוגי התחבורה (בקשת המשתמש).
    const buses = idx.lines.filter((l) => !l.tt || l.tt === "demand");
    let list = buses.filter((l) => inKats(l) && matchesRouteSearch(l, needle, citySearch.data, null, true));
    const onlyRemoval = kats.size > 0 && [...kats].every((k) => REMOVAL_CATS.has(k));
    // דירוג: קודם מספר הקו המדויק, אחריו קווים שמתחילים בו, ורק בסוף
    // התאמות מק"ט/יעד/מפעיל — ובתוך כל דרגה לפי סדר מספרי
    const numTok = toks.find((t) => /^\d/.test(t)) || toks[0] || "";
    const rank = (l) => !numTok ? 0 : l.line === numTok ? 0 : l.line.startsWith(numTok) ? 1
      : l.rd.startsWith(numTok) ? 2 : ((l.dest || "").includes(numTok) ? 3 : 4);
    const lnum = (l) => parseInt(l.line) || 1e9;
    if (needle) list.sort((a, b) => rank(a) - rank(b) || lnum(a) - lnum(b) || a.line.localeCompare(b.line) || a.rd.localeCompare(b.rd));
    else if (onlyRemoval) list.sort((a, b) => (b.ld || "").localeCompare(a.ld || ""));
    else list.sort((a, b) => lnum(a) - lnum(b) || a.line.localeCompare(b.line) || a.rd.localeCompare(b.rd));
    list = collapse2012Rows(list);
    return { total: list.length, list: list.slice(0, lim) };
  }, [idx, q, kats, lim, citySearch.data]);
  // סטטוס HTTP = הקובץ באמת לא קיים; כל כשל אחר הוא תקלת רשת — עם כפתור
  // ניסיון חוזר במקום הודעה שגורמת לגולש לחשוב שאין נתונים
  if (err) return (
    <div className="boot">{/^\d+$/.test(String(err && err.message))
      ? "הנתונים עוד לא נוצרו — הריצה הראשונה של הצינור תיצור אותם. נסו לרענן מאוחר יותר."
      : <>📡 הנתונים לא ירדו — כנראה תקלת רשת רגעית.{" "}
        <button className="morebtn" onClick={() => { setErr(null); setRty((n) => n + 1); }}>↻ נסו שוב</button></>}
    </div>);
  // האינדקס (3.6MB) נדרש רק לחיפוש הקווים — טאב התחנות, הפיד היומי ועמודי
  // קווים מקישור ישיר עובדים בלעדיו, ולכן האתר כבר לא מחכה לו כדי להופיע
  const needle = q.trim();
  const { list, total } = searchRes;
  const changed = idx ? idx.lines.filter((l) => l.v > 1).length : 0;
  return (
    <div className="wrap">
      <RecheckNotice />
      <CitySearchStatus state={citySearch} />
      <header>
        <h1>🕰️ הקו בזמן</h1>
        <p className="tag">כל שינוי שנכנס לתוקף במסלולי הקווים ובתחנות — מסלול, שרטוט, תחנות ושמות. מהשוואת ה-GTFS של משרד התחבורה, יום מול יום, ממרץ 2017 ועד היום.</p>
        <div className="stats">
          {idx ? (<>
            <span className="stat"><b>{idx.lines.length.toLocaleString()}</b> וריאנטים מתועדים</span>
            <span className="stat"><b>{changed.toLocaleString()}</b> עם שינויים</span>
            <span className="stat mut">עודכן: {idx.gen}</span>
          </>) : <span className="stat mut">טוען את רשימת הקווים ברקע…</span>}
        </div>
      </header>
      <div className="tabs" role="tablist" aria-label="אזורי האתר">
        <button role="tab" aria-selected={tab === "lines"} className={"tab" + (tab === "lines" ? " on" : "")} title="חיפוש בכל קווי האוטובוס בארץ והיסטוריית השינויים של כל קו" onClick={() => { setTab("lines"); backToList("lines"); }}>🚌 קווים</button>
        <button role="tab" aria-selected={tab === "stops"} className={"tab" + (tab === "stops" ? " on" : "")} title="חיפוש תחנות והיסטוריית השינויים שלהן — שינוי שם, הזזה, ביטול" onClick={() => { setTab("stops"); backToList("stops"); }}>🚏 תחנות</button>
        <button role="tab" aria-selected={tab === "map"} className={"tab" + (tab === "map" ? " on" : "")} title="מפה לפי עיר וחודש: תחנות שהשתנו וקווים שהשתנו, כפי שהיו אז" onClick={() => { setTab("map"); backToList("map"); }}>🗺️ מפה</button>
        {TABS.map((t) => (
          <button key={t.k} role="tab" aria-selected={tab === t.k} className={"tab" + (tab === t.k ? " on" : "")} title={t.tip}
            onClick={() => { setTab(t.k); backToList(t.k); }}>{t.icon} {t.label}</button>
        ))}
      </div>
      {!rd && !k12 && !dig && <NotifyCenter cities={notifyCities} />}
      {dig ? (
        <DigestPage city={dig.city} days={dig.days} openLine={openLine}
          onBack={() => { setDig(null); clearHashKeepTab(); }} />
      ) : k12 ? (
        <Line2012Page k12={k12} anchorRd={anc12[k12] || null} openLine={openLine}
          onBack={() => { setK12(null); clearHashKeepTab(); }} />
      ) : tab === "stops" ? <StopsTab idx={idx} openLine={openLine} sel={stopSel} selN={stopSelN} /> : tab === "map" && !rd ? <MapTab idx={idx} openLine={openLine} cities={notifyCities} /> : (TABS.some((t) => t.k === tab) && !rd) ? (
        idx ? <ModesTab key={tab} idx={idx} openLine={openLine} spec={TABS.find((t) => t.k === tab)} />
          : <div className="card">טוען את רשימת הקווים…</div>
      ) : rd ? (
        /* קישור ישיר לקו נפתח לפני שהאינדקס הגיע — בלי ההגנות האלה הדף
           קרס ללבן (הבאג ששלמה מצא): idx עדיין null ו-idx.lines התפוצץ */
        <LinePage rd={rd} lineGone={idx ? !idx.lines.find(l => l.rd === rd)?.historicalOnly && !mktAlive[rd.split("-")[0]] : false}
          sibs={lineSiblings(idx, rd)}
          onSwitch={switchLine} onBack={backToList} initDate={rdDate}
          initCats={[...kats].sort().join(",")} />
      ) : (
        <div className="card">
          {/* "שינויים לפי יום" באותו עמוד, מתחת לקטגוריות, והקטגוריות המסומנות
              מסננות גם אותו (שלמה 13.09) */}
          {!byDay && <input className="search" type="search" dir="rtl" autoFocus
            placeholder="חיפוש קו: מספר קו, מק״ט, יעד או מפעיל…"
            value={q} onChange={(e) => setQ(e.target.value)} />}
          <div className="katbox">
            <button className="kathead" aria-pressed={byDay} title={byDay ? "חזרה לחיפוש הקווים" : "פיד כרונולוגי: בחירת שנה וחודש ורואים כל שינוי שקרה, בכל קו בארץ, לפי תאריך"} onClick={() => setByDay(!byDay)}>
              {byDay ? "🔎 חזרה לחיפוש הקווים" : "🗓️ שינויים לפי יום — מה השתנה בכל תאריך, בכל הקווים"}
            </button>
          </div>
          <div className="katbox">
            <button className="kathead" aria-expanded={katOpen} onClick={() => setKatOpen(!katOpen)}>
              <span className="katarrow" aria-hidden="true">{katOpen ? "▼" : "◀"}</span>
              🗂️ קטגוריות לבחירה
              {kats.size > 0 && <b className="katn">{kats.size} מסומנות</b>}
            </button>
            {katOpen && (
              <div className="katlist">
                {CAT_GROUPS.map((g) => (
                  <React.Fragment key={g.title}>
                    <div className="katgrp">{g.title}</div>
                    {g.items.map((k) => (
                      <label key={k} className="katrow">
                        <input type="checkbox" checked={kats.has(k)} onChange={() => toggleKat(k)} />
                        <i className="katdot" style={{ background: catColor(k) }} />
                        <span className="katlab">{CAT_LABELS[k]}</span>
                        {/* עד שאינדקס הקווים נטען המונה הראה 0 מטעה */}
                        <b className="katc">{idx === null ? "טוען…" : (counts[k] || 0).toLocaleString()}</b>
                      </label>
                    ))}
                  </React.Fragment>
                ))}
                <div className="katnote">
                  ℹ️ הקטגוריות משותפות לכל השנים. מוצגים שינויים רק כשיש נתונים להשוואה.
                  היוצא מן הכלל הוא שינוי מספר הרכבים באותה יציאה, שנרשם רק מ-08.2026:
                  הוא נשען על קובץ רישוי שהארכיונים לא שמרו.
                </div>
                {kats.size > 0 && (
                  <button className="katclear" onClick={() => setKats(new Set())}>✖ נקה את הבחירה</button>
                )}
              </div>
            )}
          </div>
          {byDay ? (
            <DayFeed idx={idx} openLine={openLine} open12={open12} kats={kats} embedded onBack={() => setByDay(false)} />
          ) : (needle || kats.size > 0) && !idx ? (
            <div className="empty">טוען את רשימת הקווים — החיפוש יעבוד בעוד רגע…</div>
          ) : (needle || kats.size > 0) ? (
            <div className="llist">
              {list.map((l) => (
                <a key={l.rd} className="lrow" href={lineHref(l.rd)}
                  onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); openLine(l.rd); }}>
                  <span className="badge sm">{l.line || TT_ICON[l.tt] || "—"}</span>
                  {l.lk === "removed" && (isLineGone(l) ? (
                    <span className="k" style={{ background: isRemovedYear(l) ? "#7f1d1d" : "#dc2626" }}>
                      {isRemovedYear(l) ? "הקו בוטל — מעל שנה" : "הקו בוטל"}
                    </span>
                  ) : (
                    <span className="k" style={{ background: isRemovedYear(l) ? "#9a3412" : "#ea580c" }}>
                      {isRemovedYear(l) ? "חלופה בוטלה — מעל שנה" : "חלופה בוטלה"}
                    </span>
                  ))}
                  <span className="ldest">{l.dest}</span>
                  <span className="lmeta">{l.op} · מק״ט <span className="rdnum" dir="ltr">{rdTxt(l.rd)}</span> · {l.v > 1 ? (l.v - 1) + " שינויים" : "ללא שינויים עדיין"}
                    {l.historicalOnly && <> · תיעוד היסטורי בלבד; מצב נוכחי לא נקבע</>}
                    {l.lk === "removed" && <> · מבוטל מאז {fmtD(l.ld)}</>}</span>
                </a>
              ))}
              {list.length === 0 && (
                <div className="empty">{kats.size > 0 && !needle
                  ? "אין עדיין קווים בקטגוריות שסימנתם — קטגוריות של מסלול ותחנות מצטברות מההשוואות היומיות מכאן והלאה."
                  : "לא נמצא קו תואם."}</div>
              )}
              {total > list.length && (
                <button className="morebtn" onClick={() => setLim(lim + 300)}>
                  ⌄ הצג עוד — מוצגים {list.length.toLocaleString()} מתוך {total.toLocaleString()}
                </button>
              )}
              <Res2012 needle={needle} onOpen={open12} />
            </div>
          ) : (
            <RecentChanges idx={idx} openLine={openLine} onAll={() => setByDay(true)} />
          )}
        </div>
      )}
      <details className="srcbox" id="data-sources">
        <summary>📚 המקורות — מאיפה מגיע כל פרט, ועד לאן הוא מגיע</summary>
        <div className="srclist">
          {SOURCES.map((s) => (
            <div className="srcitem" key={s.t}>
              <div className="srct">{s.t} <span className="srcd">{s.d}</span></div>
              <div className="srcb">{s.b}</div>
              <div className="srcb">{s.links.map(([label, href], i) => <React.Fragment key={href}>{i > 0 && " · "}<a href={href} target="_blank" rel="noopener noreferrer">{label}</a></React.Fragment>)}</div>
            </div>
          ))}
          <div className="srcfoot">
            רוב היסטוריית הקווים והתחנות מבוססת על צילומי GTFS של משרד התחבורה,
            שנשמרו אצל גופים שונים. רשת מגיעים, רישום התחנות ב־OpenStreetMap ורכבת פתוחה
            הם מקורות נוספים, כמפורט למעלה. שינוי בין צילומים משקף שינוי בפרסום ולא בהכרח
            את מועד השינוי בשטח. כשיש פער בין צילומים, אין ודאות לגבי היום המדויק.
            <p>השנים מציינות את טווחי המקורות, ולא כיסוי מלא לכל יום או לכל קו.
            הקליטה והבדיקה של הארכיונים נמשכות, והכיסוי הזמין מוצג בקטגוריה ובשנה שנבחרו.</p>
            <p><a href="https://gtfs.org/" target="_blank" rel="noopener noreferrer">GTFS.org</a> מתעד את פורמט הנתונים.
            ארכיון GTFS Data Exchange הוזכר במחקר המקורות, אך לא ייבאנו ממנו קבצים;
            אין באתר נתונים ישראליים מאומתים מ־2008.</p>
          </div>
        </div>
      </details>
      <footer>
        במסגרת <a href="../" target="_blank" rel="noopener">הקו הבוחן</a> · מקורות הנתונים: 
        היסטוריה: מרחב ו־Internet Archive (2012), מגיעים ו־OpenStreetMap (2012), רכבת פתוחה (2013–2014), אוטובוס פתוח והסדנא לידע ציבורי (2015–2018, 2022–2026), TransitFeeds/OpenMobilityData (2017–2022). פירוט וקישורים בסעיף המקורות שמעל.
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);



