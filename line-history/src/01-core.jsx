/* הקו בזמן · 01-core.jsx — בסיס: סוגי האירועים וצבעיהם, טעינת הנתונים, עזרי תאריכים וטקסט.
   חלק מ-line-history/src (הסדר ב-files.json). כל החלקים מחוברים לפי הסדר ומקומפלים יחד בדפדפן (index.html),
   כך שכל השמות משותפים בין החלקים כמו בקובץ אחד. */
/* הקו בזמן — היסטוריית מסלולים ותחנות מהשוואת GTFS יומית.
   הנתונים: line-history/data, נוצר ע"י tools/linehistory.py ב-GitHub Actions. */
const { useState, useEffect, useMemo, useRef, useDeferredValue } = React;
// מספר הגרסה של קובצי הנתונים (?v=): כאן ולא ב-index.html, כי הקוד נטען תמיד טרי
// (חותמת זמן בכתובת) ואילו index.html יושב במטמון ה-CDN עד 10 דקות (שלמה 22.09)
const BUILD = "197-estimated-website-maps";

// כרום באנדרואיד: ההחלפה בין "אתר למחשב" ל"אתר לנייד" טוענת מחדש את הכתובת
// שאיתה נכנסו לדף — לא את המצב הנוכחי (טאב, קו פתוח) שהאתר כתב בשורת הכתובת
// בלי טעינה. לכן המצב האחרון נשמר ללשונית (sessionStorage) ומשוחזר כשטעינה
// מחדש נוחתת על אחת הכתובות המקוריות (שלמה 07.09: "מחזיר אותך לדף הקודם").
(function () {
  try {
    const K = "kbNav", now = location.href, base = (u) => String(u).split("#")[0].split("?")[0];
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
    // קישור עם #: "?" ריק לפני ה-# — אחרת כרום מחליף לגרסת מחשב בלי טעינה וחוזר לנייד (כמו ב-nav-restore.js, שלמה 30.10)
    if (location.hash && !location.href.includes("?")) rep0(history.state, "", location.pathname + "?" + location.hash);
    // אותו דבר בכל מעבר בתוך הדף (שלמה 20.11, כמו ב-nav-restore.js): כתובת ששונה מהדף רק אחרי ה-# (קו פתוח,
    // לשונית) — "אתר למחשב" טוען אותה מחדש עם זהות של טלפון, והדף נשאר צר. "?" ריק לפני ה-# בכל כתובת
    // שהכלי כותב (pushState / replaceState / קישור #) הופך את המעבר לטעינה אמיתית במצב מחשב
    const q = (u) => {
      if (u == null) return u;
      try {
        const a = new URL(String(u), location.href);
        if (a.hash && a.origin === location.origin && !a.href.split("#")[0].includes("?")) return a.pathname + "?" + a.hash;
      } catch (e) { /* ignore */ }
      return u;
    };
    history.pushState = function (st, t, u) { push0(st, t, q(u)); last = location.href; note(); save(); };
    history.replaceState = function (st, t, u) { rep0(st, t, q(u)); last = location.href; save(); };
    // "קודם"/"הבא" בין כתובת בלי "?" (הכניסה לדף) לכתובת עם "?#…": הדפדפן שולח רק popstate, בלי hashchange,
    // כי הכתובות שונות גם לפני ה-#. הקוד שמקשיב ל-hashchange (קישורי #) מקבל אותו מכאן, אחרי ה-popstate
    let last = location.href;
    window.addEventListener("popstate", () => {
      const prev = last, cur = location.href; last = cur; save();
      const a = prev.split("#"), b = cur.split("#");
      if (a[0] !== b[0] && (a[1] || "") !== (b[1] || ""))
        setTimeout(() => { if (location.href === cur) window.dispatchEvent(new HashChangeEvent("hashchange", { oldURL: prev, newURL: cur })); }, 0);
    });
    window.addEventListener("hashchange", () => {
      if (location.href.includes("#") && !location.href.split("#")[0].includes("?")) rep0(history.state, "", location.pathname + "?" + location.hash);
      last = location.href; note(); save();
    });
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
                  baseline: "תיעוד וצילומים" };
const KINDS = {
  baseline:    { label: "תיעוד ראשון", color: "#64748b", tip: "הפעם הראשונה שהקו מופיע בתיעוד, לא בהכרח היום שבו נפתח" },
  snapshot:    { label: "צילום מתועד", color: "#64748b", tip: "צילום של הקו מהארכיון; תאריך הצילום אינו מועד שינוי" },
  new:         { label: "וריאנט חדש", color: "#15803d" },
  route:       { label: "שינוי מסלול", color: "#7c3aed" },
  redraw:      { label: "תיקון שרטוט", color: "#0e7490", tip: "הקו על המפה תוקן; התחנות לא השתנו" },
  terminal:    { label: "שינוי קצה המסלול", color: "#a21caf", tip: "הקו הוארך, קוצר או החליף תחנת קצה" },
  extend:      { label: "הארכת קו", color: "#15803d" },
  shorten:     { label: "קיצור קו", color: "#c2410c" },
  "stops-add": { label: "תחנות נוספו", color: "#3f6212" },
  "stops-del": { label: "תחנות ירדו", color: "#be123c" },
  notrips:     { label: "אין נסיעות בקובץ", color: "#94a3b8", tip: "הקו רשום בקובץ, אבל בלי אף נסיעה באותו יום" },   // הקו קיים בקובץ בלי אף נסיעה באותו יום (ארכיון אוטובוס פתוח)
  stops:       { label: "שינוי תחנות", color: "#b45309" },
  operator:    { label: "החלפת מפעיל", color: "#0f766e" },
  dest:        { label: "שינוי יעד", color: "#9333ea" },
  renum:       { label: "שינוי מספר", color: "#be185d" },
  renamed:     { label: "שינוי שם תחנת קצה", color: "#b45309" },
  mode:        { label: "שינוי סוג הקו", color: "#0369a1" },
  access:      { label: "שינוי נגישות", color: "#0f766e" },
  vehicle:     { label: "שינוי סוג הרכב", color: "#7c3aed" },
  ltype:       { label: "שינוי סוג הקו", color: "#0e7490", tip: "הקו עבר בין עירוני, אזורי ובינעירוני, או בין סוגים כמו תלמידים, לילה ומזין" },
  returned:    { label: "בוטל וחזר", color: "#f59e0b", tip: "הקו בוטל ואחר כך חזר לפעול" },
  board:       { label: "שינוי עלייה/ירידה", color: "#854d0e" },
  platform:    { label: "שינוי רציף", color: "#0e7490", tip: "הקו עבר לרציף אחר במסוף" },
  "planned-dropped": { label: "תוכנן ולא נכנס לפעול", color: "#9f1239", tip: "פורסם בנתוני משרד התחבורה, וירד לפני שנכנס לפעול" },
  "planned-new": { label: "קו שפורסם ולא נכנס לפעול", color: "#9f1239", tip: "פורסם בנתוני משרד התחבורה, וירד לפני שנכנס לפעול" },
  "planned-route": { label: "שינוי תחנות שפורסם ולא נכנס לפעול", color: "#7f1d1d", tip: "פורסם בנתוני משרד התחבורה, וירד לפני שנכנס לפעול" },
  removed:     { label: "בוטל", color: "#dc2626" },
  "removed-year": { label: "בוטל — מעל שנה לא חזר", color: "#7f1d1d", tip: "בוטל ולא חזר יותר משנה" },
  freq:        { label: "שינוי מספר הרכבים באותה נסיעה", color: "#b45309", tip: "כמה אוטובוסים יוצאים יחד באותה שעה (תגבור)" },
  sched:       { label: "שינוי לו\"ז", color: "#4338ca" },
  times:       { label: "הלו\"ז האחרון", color: "#0e7490", tip: "השעות מהיום האחרון שבו הקו פעל" },
  temp:        { label: "שינוי זמני", color: "#ea580c", tip: "עבודות, עקיפות ותחנות שבוטלו זמנית, מהודעות משרד התחבורה" },   // הודעות משרד התחבורה — useTempEvents
};
// הסבר קצר לתגית סוג השינוי (title) — לסוגים שהשם שלהם לא מספיק
const kTip = (k) => (KINDS[k] || {}).tip;
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
  const g = lineGoneAt(l);
  return !!g && (Date.now() - new Date(g)) / 864e5 >= 365;
}
// תאריך הנתונים (idx.gen) — "היום" של בדיקת "לא נצפה מעל שנה"
let DATA_GEN = null;
// מבוטל = removed מפורש, או notrips/תיעוד היסטורי בלי נסיעות
// (שלמה 28.09: 10111-2-# לא נצפה מאז 2017 הוצג רק "אינה פעילה כרגע").
// מחזיר את תאריך הביטול או null
function variantGone(lk, ld, historicalOnly, ntr, observationOnly = false) {
  if(observationOnly)return null;
  if (lk === "removed") return ld || null;
  // שלמה 28.09: ברגע שאין לו"ז ואין נסיעות — מבוטל כבר עכשיו, בלי המתנה של שנה
  if ((lk === "notrips" || historicalOnly) && !(ntr > 0) && ld) return ld;
  return null;
}
const lineGoneAt = (l) => variantGone(l.lk, l.ld, l.historicalOnly, l.ntr, l.observationOnly || String(l.rd||"").startsWith("website"));
// מבוטל בלי removed מפורש — מוצג "לא נצפה מאז"
const goneStale = (l) => l.lk !== "removed" && !!lineGoneAt(l);
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
  // הודעות משרד התחבורה (הקו המודיע) — עבודות, עקיפות ותחנות שבוטלו זמנית (שלמה 20.10)
  { title: "שינויים זמניים", items: ["temp"] },
  // השערה לפי התחנות, לא מידע רשמי (שלמה 28.10) — tools/line_successors.py
  { title: "השערות — לפי התחנות, לא מידע רשמי", items: ["succ"] },
];
const CAT_LABELS = {
  succ: "🔮 קו ממשיך — השערה: איזה קו החליף אותו",
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
  temp: "שינוי זמני — עבודות, עקיפות ותחנות שבוטלו זמנית",
};
const CAT_COLORS = { "removed-now": "#dc2626", "removed-past": "#f59e0b", succ: "#7c3aed",
                     endpoint: "#a21caf" };
function catColor(k) { return CAT_COLORS[k] || (KINDS[k] || {}).color || "#64748b"; }
const ENDPOINT_KINDS = ["extend", "shorten", "terminal"];
// שלוש קטגוריות הביטול זרות זו לזו: קו שלא חזר מעל שנה הוא מבוטל בפועל,
// ואילו ביטול טרי עוד עשוי להתברר כהפסקה. ההבחנה נשארה לבקשת המשתמש.
function catMatch(l, k) {
  if (k === "temp") return !!l.tmp;   // data/temp/index.json — מצורף לקווים בטעינת האינדקס
  if (k === "succ") return !!l.succ;  // data/successors/index.json — מצורף בטעינת האינדקס
  if (k === "removed-year") return isRemovedYear(l);
  if (k === "removed-now") return !!lineGoneAt(l) && !isRemovedYear(l);
  if (k === "removed-past") return !lineGoneAt(l) && (l.ks || []).includes("removed");
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
// "אין נסיעות בקובץ" לא מוצג בציר הזמן ובסרגל (שלמה 20.10: "הקטגוריה אין נסיעות בקובץ תסיר!") —
// האירועים נשארים בנתונים, ומצב הקו (מבוטל / לא נצפה) עדיין מחושב לפיהם
const hiddenEv = (e) => e && (e.hid || (e.k === "platform" && !e.pv) || e.k === "notrips");
const SKINDS = {
  new:     { label: "חדשה", color: "#15803d" },
  del:     { label: "בוטלה", color: "#dc2626" },
  renamed: { label: "שינוי שם", color: "#b45309" },
  moved:   { label: "הזזת מיקום", color: "#2563eb" },
  city:    { label: "שינוי עיר", color: "#b91c1c" },
  pubdest: { label: "תחנת יעד לפרסום", color: "#7e22ce" },
  // סוג התחנה במאגר של משרד התחבורה (StationTypeName): תחנה רגילה, מסוף, גבול מחנה צבאי… (שלמה 10.10)
  stype:   { label: "שינוי סוג תחנה", color: "#0f766e" },
  platform: { label: "רציף נוסף/בוטל", color: "#0e7490" },
  // רישום התחנות של יוני 2012 (GTFS של משרד התחבורה דרך OpenStreetMap, changeset 12028672):
  // אירוע אחד לכל תחנה שהייתה ברישום אז — שם, כתובת ומיקום של 2012 (שלמה 22.09)
  gtfs2012: { label: "ברישום 2012", color: "#78350f" },
};
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
// שם דף-השיתוף ב-s/ — חייב להתאים ל-fsafe ב-tools/share_stubs.py, אחרת הקישור מוביל לדף שלא קיים (22.10)
function ssafe(rd) { return rd.replace(/#/g, "H").replace(/\*/g, "X").replace(/:/g, "-").replace(/\//g, "_"); }
function fmtD(d) { return (d || "").split("-").reverse().join("."); }
// סיומת התאריכים "(2025-07-10 ← 2025-07-11)" בהערות הסריקה מוסתרת
// בתצוגה (בקשת שלמה): תאריך הביצוע כבר כתוב בכותרת האירוע — זהו
// הערות שמספרות איך השינוי נמצא (סריקת ארכיון, שחזור, השוואת צילומים) לא מוצגות — התאריך הוא
// יום השינוי, ושורת המקור כבר אומרת מאיפה הוא. ההערות נשארות בנתונים: הניקוי הלילי
// (collapse_wobbles) מזהה לפיהן אירועים ששוחזרו (שלמה 18.10: "למה זה משפיע על המשתמש")
const NOTE_HOW = /^(?:שוחזר בדיעבד|הרשימות חושבו מחדש מול האירוע ששוחזר|והסריקה דילגה על האירוע|השינוי אותר ותוארך בהשוואת צילומי הארכיון|שינוי שאותר בהשוואת צילומי הארכיון)/;
function noteFix(s) {
  if (["שינוי שנמצא בהשוואת שני צילומים זמינים של אותו מק״ט, כיוון וחלופה.", "צילום היסטורי של פרסום משרד התחבורה. מועד התיעוד אינו מועד פתיחת הקו או שינוי המסלול."].includes(String(s || "").trim())) return "";
  const t = String(s || "").replace(/\s*\(\d{4}-\d{2}-\d{2} ← \d{4}-\d{2}-\d{2}\)/g, "");
  if (/^שוחזר בדיעבד ממצב הסריקה היומי/.test(t.trim())) return "";
  return t.split(" · ").filter((x) => !NOTE_HOW.test(x.trim())).join(" · ");
}
function fmtM(d) { const p = (d || "").split("-"); return p[1] + "." + p[0]; }
// תקופה: חודש "YYYY-MM" או שנה שלמה "Y:YYYY" (שלמה 22.09: "לפי שנה ולא רק לפי חודש")
const isYear = (m) => typeof m === "string" && m.startsWith("Y:");
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
const rdTxt = (rd) => String(rd || "");   // מזהה גולמי; בתצוגה ליד "מק״ט" — mkShow
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
// מטמון: נרמול שמות הערים לכל קו פעם אחת, לא בכל הקשה בחיפוש (הקלדה לאגה)
const _cstCache = new WeakMap();
const _baseCache = new WeakMap();
function citySearchText(data, rd, date) {
  if (!data) return "";
  if (!date) {
    let m = _cstCache.get(data);
    if (!m) { m = new Map(); _cstCache.set(data, m); }
    let v = m.get(rd);
    if (v === undefined) { v = (data.routes[rd] || []).map(([id]) => citySearchNorm(data.cities[id])).join(" | "); m.set(rd, v); }
    return v;
  }
  const day = date ? Math.floor((Date.parse(date) - Date.parse(data.epoch)) / 86400000) : null;
  return (data.routes[rd] || []).filter(([, a, b]) => day === null || (a <= day && (b === null || day < b)))
    .map(([id]) => citySearchNorm(data.cities[id])).join(" | ");
}
function matchesRouteSearch(line, query, data, date, prefix = false) {
  if (line.rd && sQ(query).trim() === sQ(line.rd)) return true;
  const tokens = citySearchNorm(query).split(/\s+/).filter(t => t && t !== "קו");
  if (!tokens.length) return true;
  let bc = _baseCache.get(line);
  if (!bc) { bc = {}; _baseCache.set(line, bc); }
  const bk = prefix ? "p" : "f";
  const base = bc[bk] !== undefined ? bc[bk] : (bc[bk] = citySearchNorm((prefix ? [line.dest, line.op, line.tw] : [line.line, line.rd, line.dest, line.op, line.tw]).join(" ")
    // "מונית" מוצא את מוניות השירות — בתיאור כתוב "תחנת מוניות", ובמוניות מחופש המידע גם זה לא
    + (line.tt === "taxi" ? " מונית שירות מוניות" : "")));
  const towns = citySearchText(data, line.rd, date);
  return tokens.every(t => {
    // A line number must not match random digits inside an archive route ID.
    // מק"ט נבדק רק כשמקלידים 4 ספרות ומעלה; "22" לא אמור למצוא את קו 6 בגלל המק"ט 22006
    if (/^\d+[א-ת]?$/.test(t)) return String(line.line || "").startsWith(t) || (t.length >= 4 && String(line.rd || "").startsWith(t));
    return base.includes(t) || towns.includes(t) ||
      (prefix && (String(line.line || "").startsWith(t) || (t.length >= 4 && String(line.rd || "").startsWith(t))));
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
// שלמה 13.10: "טוען" יותר משתי דקות בטלפון. חותמת-הזמן שנוספה ב-02.10 (&update=) עקפה את
// הבדיקה הזו, וכל כניסה הורידה מחדש כ-3.5MB; והבקשה לא הוגבלה בזמן, כך שבקשה שנתקעה ברשת
// השאירה "טוען…" לתמיד. עכשיו: בלי חותמת (העדכון מגיע עד 10 דק' אחרי הפרסום), ועד 20 שניות
// לתשובה מהשרת — ואז ניסיון נוסף. הזמן נמדד עד שהשרת עונה, לא עד סוף ההורדה של קובץ גדול.
// data/changes נשמר בפרסום מכווץ (‎X.json.gz‎, שלמה 03.11 — גודל האתר). מחזירים Response רגיל עם ה-JSON
// הפתוח, כך שהקוראים (‎.json()‎, ‎r.ok‎) לא משתנים; בלי מכווץ או בדפדפן ישן — הקובץ הרגיל
const dfetchGz = async (p) => {
  if (!window.DecompressionStream) return null;
  try {
    const r = await fetch(p + ".gz?v=" + BUILD, { cache: "no-cache" });
    if (!r.ok) return null;
    const b = new Uint8Array(await r.arrayBuffer());
    const body = b[0] === 0x1f && b[1] === 0x8b ? await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream("gzip"))).text() : new TextDecoder().decode(b);
    return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
  } catch (e) { return null; }
};
const dfetch = async (p, tries = 2) => {
  if (/^data\/changes\/[^/?]+\.json$/.test(p)) { const z = await dfetchGz(p); if (z) return z; }
  const url = p + (p.includes("?") ? "&" : "?") + "v=" + BUILD;
  for (let i = 1; ; i++) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 20000);
    try { return await fetch(url, { cache: "no-cache", signal: ctl.signal }); }
    catch (e) { if (i >= tries) throw e; }
    finally { clearTimeout(timer); }
  }
};

// דיוק התאריך נקבע לפי המרווח בין שני צילומי הארכיון שביניהם אותר השינוי.
// בארכיון של 2020 הצילומים יומיים והתאריך מדויק; ב-2017 הם במרחק שבועיים,
// ואז יום מדויק הוא המצאה — במקרה כזה נכתב החודש בלבד. (בקשת המשתמש.)
function evDate(v) {
  // נתוני משרד התחבורה (חופש מידע): התאריך נגזר מהנסיעה האחרונה של המסלול הקודם — מוצג בדיוק של חודש, או כטווח
  if (v.ap === "r") return { txt: fmtM(v.sd) === fmtM(v.d) ? fmtM(v.d) : fmtM(v.sd) + "–" + fmtM(v.d), exact: false, tip: "בין " + fmtD(v.sd) + " ל-" + fmtD(v.d) + " — לפי נתוני משרד התחבורה (חופש מידע)" };
  if (v.ap === "m") return { txt: fmtM(v.d), exact: false, tip: (v.sd ? "בערך ב-" + fmtD(v.d) + ", יום אחרי הנסיעה האחרונה במסלול הקודם (" + fmtD(v.sd) + ")" : "בערך ב-" + fmtD(v.d)) + " — לפי נתוני משרד התחבורה (חופש מידע)" };
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
