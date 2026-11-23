/* קו פח · 03-cache-icons.jsx — המטמון בדפדפן (IndexedDB) למידע המעובד, ומפתח הקאש לפי הכותרות; הסמלים (ICONS, Ic).
   חלק מ-kavpach/src (הסדר ב-files.json). כל החלקים מחוברים לפי הסדר ומקומפלים יחד (tools/build_kavpach.mjs → KavPach.js),
   כך שכל השמות משותפים בין החלקים כמו בקובץ אחד. */

// ── IndexedDB cache ─────────────────────────────────────────────
// שומרים את התוצאה המעובדת (trips + מאפים + טבלת בנצ'מרק) ב-IndexedDB,
// תחת מפתח משולב מ-last-modified+content-length של כל קבצי המקור. בכניסה
// הבאה, אם אף קובץ לא השתנה, מדלגים על ההורדה ועל הפרסור (~50-80% מזמן הטעינה).
// Maps ו-Sets נשמרים native בזכות structured clone של IDB.
const IDB_NAME = 'kavpach-cache';
const IDB_STORE = 'parsed';
const IDB_KEY = 'data-v3';

const openCacheDB = () => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') { reject(new Error('no idb')); return; }
  const req = indexedDB.open(IDB_NAME, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const idbGetCache = async (key) => {
  try {
    const db = await openCacheDB();
    return await new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  } catch (e) {
    return null;
  }
};

const idbSetCache = async (key, value) => {
  try {
    const db = await openCacheDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch (e) { /* silent — cache is best-effort */ }
};

// מפיק מפתח קאש מהכותרות של תגובת HTTP. last-modified יציב, content-length
// תופס שינוי גם אם השרת מחזיר תאריכי last-modified זהים בטעות.
const fileKeyFromHeaders = (res) => {
  if (!res) return null;
  const lm = res.headers.get('last-modified') || '';
  const cl = res.headers.get('content-length') || '';
  const et = res.headers.get('etag') || '';
  if (!lm && !cl && !et) return null;
  return `${lm}|${cl}|${et}`;
};


// ── Icons ────────────────────────────────────────────────────────────────────
const ICONS = {
  trash: "M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6",
  upload: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12",
  download: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4",
  search: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  clock:  "M12 2a10 10 0 100 20A10 10 0 0012 2zm0 5v5l3 3",
  zap:    "M13 10V3L4 14h7v7l9-11h-7z",
  loader: "M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4",
  calendar: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  list: "M4 6h16M4 12h16M4 18h16",
  alert: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  info: "M13 16h-1v-4h-1m1-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  chevronUp: "M5 15l7-7 7 7",
  chevronDown: "M19 9l-7 7-7-7",
  settings: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  moon: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z",
  chart: "M18 20V10 M12 20V4 M6 20V16",
  mapPin: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  copy: "M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2 M16 3h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2",
  star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
};

const Ic = ({ n, size = 18, cls = "", animate = false, strokeWidth = "2.5" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={`${cls} ${animate ? "animate-spin" : ""}`}>
    <path d={ICONS[n] || ""} />
  </svg>
);
