// העיר שבמשחק. כל עיר היא מפה נפרדת (שלב נפרד) עם שמירה משלה.
// הרשימה: world/cities.json (שם ותיקייה לכל עיר; אותו קובץ משמש את כלי הבנייה ב-tools/).
// הבחירה: ‎?city=<מזהה> בכתובת, אחרת העיר האחרונה שנבחרה במכשיר (busgame.city), אחרת ברירת המחדל.
// השמירות: busgame.<מזהה העיר>.<שם> — לקריית מלאכי אלה בדיוק המפתחות שהיו עד עכשיו, כך ששמירה קיימת לא משתנה.
export const DEFAULT_CITY = 'kiryat-malachi';
const CHOICE = 'busgame.city';
const ok = s => typeof s === 'string' && /^[a-z0-9-]{1,40}$/.test(s);
let id = null;
try { id = new URLSearchParams(location.search).get('city'); } catch { }
if (!ok(id)) { try { id = localStorage.getItem(CHOICE); } catch { } }
export const CITY_ID = ok(id) ? id : DEFAULT_CITY;
export const cityKey = name => `busgame.${CITY_ID}.${name}`;
// מפתח שהיה משותף לפני שהיו ערים (בלי מזהה עיר): בקריית מלאכי נשאר כמו שהיה, בעיר אחרת — לפי העיר
export const legacyKey = name => CITY_ID === DEFAULT_CITY ? `busgame.${name}` : cityKey(name);

// פרטי העיר הנוכחית (מתמלא ב-loadCities): name — השם להצגה, dir — תיקיית קבצי העולם (עם / בסוף)
export const cityInfo = { id: CITY_ID, name: '', dir: 'world/', all: {} };
export async function loadCities() {
  const d = await (await fetch('world/cities.json')).json();
  cityInfo.all = d.cities || {};
  const c = cityInfo.all[CITY_ID];
  if (!c) { forget(); throw new Error('אין עיר כזו: ' + CITY_ID); }
  cityInfo.name = c.name; cityInfo.dir = c.dir.replace(/\/*$/, '/');
  cityInfo.entries = c.entries || null; cityInfo.towns = c.towns || null;      // residents.js: מי שבא מבחוץ
  return cityInfo;
}
function forget() { try { localStorage.removeItem(CHOICE); } catch { } }
// מעבר לעיר אחרת: הבחירה נשמרת, והדף נטען מחדש עם העולם והשמירה של העיר
export function switchCity(to) {
  if (!ok(to) || to === CITY_ID) return;
  try { localStorage.setItem(CHOICE, to); } catch { }
  const u = new URL(location.href); u.searchParams.set('city', to); location.href = u.toString();
}
// עיר שהקבצים שלה לא נטענו (עוד לא נבנתה): חוזרים לברירת המחדל
export function backToDefault() {
  if (CITY_ID === DEFAULT_CITY) return false;
  forget(); const u = new URL(location.href); u.searchParams.delete('city'); location.replace(u.toString()); return true;
}
// האם המפתח שייך לעיר הנוכחית (ל"התחל מחדש": מוחקים רק את העיר הזו; מפתחות כלליים ישנים שייכים לברירת המחדל)
export function ownKey(k) {
  if (k === CHOICE || !k.startsWith('busgame.')) return false;
  if (k.startsWith(`busgame.${CITY_ID}.`)) return true;
  if (CITY_ID !== DEFAULT_CITY) return false;
  return !Object.keys(cityInfo.all).some(c => c !== CITY_ID && k.startsWith(`busgame.${c}.`));
}
