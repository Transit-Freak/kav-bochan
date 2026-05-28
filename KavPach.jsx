const { useState, useMemo, useEffect, useCallback, useRef } = React;

// ── Google Fonts - Heebo ──────────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('heebo-font')) {
  const fontLink = document.createElement("link");
  fontLink.id = "heebo-font";
  fontLink.href = "https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;700;800;900&display=swap";
  fontLink.rel = "stylesheet";
  document.head.appendChild(fontLink);
}

// ── XLSX loader ──────────────────────────────────────────────────────────────
let _xlsxLoaded = false;
const loadXLSX = () => {
  if (_xlsxLoaded) return Promise.resolve();
  return new Promise((res, rej) => {
    const src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    if (typeof window !== 'undefined' && document.querySelector(`script[src="${src}"]`)) { 
      _xlsxLoaded = true; 
      return res(); 
    }
    const s = document.createElement("script");
    s.src = src; s.onload = () => { _xlsxLoaded = true; res(); }; s.onerror = rej;
    document.head.appendChild(s);
  });
};

// yields control to the browser so it can paint / handle input.
// setTimeout(0) is more aggressive than rAF — rAF can pile up when the next chunk
// of JS is already queued, which is exactly when we *want* the UI to breathe.
const yieldFrame = () => new Promise(r => setTimeout(r, 0));

const CitiesDatalist = React.memo(function CitiesDatalist({ cities }) {
  return (
    <datalist id="cities-list">
      {cities.map(c => <option key={`dl-city-${c}`} value={c} />)}
    </datalist>
  );
});

// ── SearchInput ─────────────────────────────────────────────
// אינפוט חיפוש שמופעל בלחיצה / Enter בלבד — בלי דיבאונס, בלי עדכון אוטומטי.
// state פנימי לטקסט; הסינון בהורה רץ רק כשהמשתמש לוחץ "חפש" או Enter,
// או מנקה את השדה (clear -> ריקון מיידי כדי לחזור לתצוגה המלאה).
//
// הערה — לא מצרפים datalist בשלב הזה: על קבצי נתונים עם מאות ערים, הדפדפן
// סורק את כל ה-<option>-ים בכל הקלדה ויוצר לאג מורגש (בעיקר בנייד), אפילו
// ש-state הריאקטי נשאר מקומי. עדיף UX של חיפוש חופשי.
const SearchInput = React.memo(function SearchInput({ value, onSubmit, placeholder, className }) {
  const [local, setLocal] = React.useState(value || '');
  const lastExternal = React.useRef(value);
  React.useEffect(() => {
    if (value !== lastExternal.current) {
      lastExternal.current = value;
      setLocal(value || '');
    }
  }, [value]);
  const submit = (v) => {
    const trimmed = (v ?? local).trim();
    lastExternal.current = trimmed;
    if (React.startTransition) {
      React.startTransition(() => onSubmit(trimmed));
    } else {
      onSubmit(trimmed);
    }
  };
  const clear = () => {
    setLocal('');
    submit('');
  };
  const handleKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    if (e.key === 'Escape') { e.preventDefault(); clear(); }
  };
  const isDirty = local !== (value || '');
  return (
    <div className="relative w-full">
      <input
        type="text"
        value={local}
        onChange={e => setLocal(e.target.value)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        className={className}
      />
      {local && (
        <button
          type="button"
          onClick={clear}
          className="absolute top-1/2 -translate-y-1/2 left-3 w-6 h-6 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 font-black text-sm flex items-center justify-center transition-colors"
          title="נקה"
          aria-label="נקה"
        >×</button>
      )}
      {isDirty && (
        <div className="absolute -bottom-5 right-2 text-[10px] font-bold text-slate-400">הקש Enter לחיפוש</div>
      )}
    </div>
  );
});

// ── IndexedDB cache ─────────────────────────────────────────────
// שומרים את התוצאה המעובדת של data.xlsx (trips + שני המאפים) ב-IndexedDB,
// תחת מפתח שמורכב מ-last-modified+content-length של הקובץ. בכניסה הבאה,
// אם הקובץ לא השתנה, מדלגים על ההורדה ועל הפרסור (~50-80% מזמן הטעינה).
// Maps ו-Sets נשמרים native בזכות structured clone של IDB.
const IDB_NAME = 'kavpach-cache';
const IDB_STORE = 'parsed';
const IDB_KEY = 'data-v2';

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

// ── DebouncedInput ────────────────────────────────────────────────────────
// אינפוט חיפוש שלא מ-re-render-ר את כל העץ בכל הקלדה.
// state פנימי מקומי לטקסט; הפרנט מקבל את הערך רק אחרי debounce.
// אם value מבחוץ משתנה (e.g. setSearchCity(areaName) מטאב אחר) — מסונכרן.
const DebouncedInput = React.memo(function DebouncedInput({ value, onDebouncedChange, debounceMs = 250, ...rest }) {
  const [local, setLocal] = React.useState(value || '');
  const lastExternal = React.useRef(value);
  const timerRef = React.useRef(null);
  React.useEffect(() => {
    if (value !== lastExternal.current) {
      lastExternal.current = value;
      setLocal(value || '');
    }
  }, [value]);
  const handleChange = (e) => {
    const v = e.target.value;
    setLocal(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      lastExternal.current = v;
      // startTransition מסמן את העדכון הזה כעדיפות נמוכה — React רשאי לקטוע
      // אותו אם המשתמש ממשיך להקליד. ככה הסינון הכבד לא חוסם את ה-input.
      if (React.startTransition) {
        React.startTransition(() => onDebouncedChange(v));
      } else {
        onDebouncedChange(v);
      }
    }, debounceMs);
  };
  return <input {...rest} value={local} onChange={handleChange} />;
});

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
  copy: "M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2 M16 3h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2"
};

const Ic = ({ n, size = 18, cls = "", animate = false, strokeWidth = "2.5" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={`${cls} ${animate ? "animate-spin" : ""}`}>
    <path d={ICONS[n] || ""} />
  </svg>
);

// ── פונקציות עזר ─────────────────────────────────────────────────────────────
const fmtTime = (v) => {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") {
    const totalMins = Math.round(v * 1440);
    const h = Math.floor(totalMins / 60) % 24;
    const m = totalMins % 60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
  }
  const s = String(v).trim();
  if (/^\d{1,2}:\d{2}/.test(s)) return s.slice(0, 5);
  return s;
};

const timeToMins = (t) => {
  if (!t || !t.includes(':')) return null;
  const [h, m] = t.split(':').map(Number);
  if (h > 29 || m > 59) return null;
  return h * 60 + m;
};

const getPeriod = (mins) => {
  if (mins === null) return "לא ידוע";
  if (mins < 360) return "לילה";
  if (mins < 600) return "בוקר";
  if (mins < 960) return "צהריים";
  if (mins < 1140) return "ערב";
  return "לילה";
};

const getLineCategory = (typeStr) => {
  if (!typeStr) return 'urban';
  const t = typeStr.replace(/\s/g, '');
  if (t.includes('אזורי') || t.includes('מועצה')) return 'regional';
  if (t.includes('בין') || t.includes('בינעירוני')) return 'intercity';
  return 'urban';
};

// ── סיווג קווים ל-8 קטגוריות לפי משרד התחבורה ───────────────────────────
// הסיווג מבוסס קודם כל על השדה "קבוצת יעילות תפעולית" (opGroup) אם הוא
// זמין, ואחרת נגזר ממאפיינים: ייחודיות (תלמידים/לילה/מזין), אורך מסלול,
// סוג שירות, ותדירות יומית.
const CATEGORIES = [
  'אזורי',
  'בינעירוני ארוך',
  'בינעירוני קצר',
  'עירוני תדירות גבוהה',
  'עירוני תדירות נמוכה',
  'לילה',
  'קווים מזינים',
  'תלמידים',
];

// ממוצעים ארציים רשמיים — עלות תפעולית לנוסע (ש"ח)
const COST_BENCHMARK = {
  'אזורי': 31.8,
  'בינעירוני ארוך': 34.0,
  'בינעירוני קצר': 23.1,
  'לילה': 46.9,
  'עירוני תדירות גבוהה': 9.4,
  'עירוני תדירות נמוכה': 15.4,
  'קווים מזינים': 17.4,
  'תלמידים': 9.7,
};

// סף נוסעים לנסיעת שפל לכל קטגוריה
const LOW_RIDER_THRESHOLD = {
  'אזורי': 5,
  'לילה': 5,
  'בינעירוני קצר': 8,
  'קווים מזינים': 8,
  'בינעירוני ארוך': 10,
  'עירוני תדירות נמוכה': 10,
  'עירוני תדירות גבוהה': 15,
  'תלמידים': 15,
};

// מסווג קו לאחת מ-8 הקטגוריות. מקבל אובייקט עם השדות שצריך.
const classifyLine = ({ opGroup, uniqueness, lineType, distance, trips, isNight, isFeeding }) => {
  const og = (opGroup || '').trim();
  const u = (uniqueness || '').trim();

  // 1. הקטגוריות הברורות מ-uniqueness — ייחודיות גוברת
  if (u.includes('תלמיד')) return 'תלמידים';
  if (isNight || u.includes('לילה')) return 'לילה';
  if (isFeeding || u.includes('מזין')) return 'קווים מזינים';

  // 2. opGroup ישיר אם קיים בקטגוריות שלנו
  for (const c of CATEGORIES) {
    if (og === c) return c;
    // התאמה רכה — opGroup לעיתים מכיל את שם הקטגוריה כתת-מחרוזת
    if (og && og.includes(c)) return c;
  }

  // 3. נגזרים מ-lineType
  const lt = (lineType || '').trim();
  if (lt.includes('אזורי') || lt.includes('מועצה') || lt.includes('כפרי')) return 'אזורי';

  // 4. בינעירוני לפי אורך מסלול
  if (lt.includes('בינעירוני') || lt.includes('בין-עירוני') || lt.includes('בין עירוני')) {
    return (distance && distance > 45) ? 'בינעירוני ארוך' : 'בינעירוני קצר';
  }

  // 5. עירוני — תדירות גבוהה/נמוכה לפי נסיעות שבועיות (מקירוב ליום ג')
  //    100 נסיעות ביום ג' ≈ ~600 נסיעות שבועיות (יום-ג' הוא ~17% מהשבוע)
  if (trips && trips >= 600) return 'עירוני תדירות גבוהה';
  return 'עירוני תדירות נמוכה';
};

// תווית סטטוס לפי ציון (5 רמות)
const STATUS_TIERS = [
  { min: 80, label: 'חמור - דורש התערבות', color: 'text-rose-700', bg: 'bg-rose-100 border-rose-300', dot: 'bg-rose-600' },
  { min: 65, label: 'לא יעיל',              color: 'text-rose-600', bg: 'bg-rose-50 border-rose-200',  dot: 'bg-rose-500' },
  { min: 45, label: 'טעון בדיקה',           color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200', dot: 'bg-orange-500' },
  { min: 25, label: 'סטייה קלה',            color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
  { min: 0,  label: 'תקין',                color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
];
const getStatusTier = (score) => STATUS_TIERS.find(t => score >= t.min) || STATUS_TIERS[STATUS_TIERS.length - 1];

const getCapacity = (sizeStr) => {
  if (!sizeStr) return 50;
  const s = String(sizeStr).replace(/\s/g, '');
  if (s.includes("מפרקי")) return 90;
  if (s.includes("מידי")) return 35;
  if (s.includes("מיני")) return 19;
  return 50; 
};

const parseDays = (raw) => {
  if (!raw || String(raw).trim() === "undefined") return { list: [], text: "כללי" };
  let s = String(raw).trim();
  
  if (!/[1-7]/.test(s)) {
    let mapped = "";
    if (s.includes('ראשון') || /(^|\s)א('|\b)/.test(s)) mapped += '1';
    if (s.includes('שני') || /(^|\s)ב('|\b)/.test(s)) mapped += '2';
    if (s.includes('שלישי') || /(^|\s)ג('|\b)/.test(s)) mapped += '3';
    if (s.includes('רביעי') || /(^|\s)ד('|\b)/.test(s)) mapped += '4';
    if (s.includes('חמישי') || /(^|\s)ה('|\b)/.test(s)) mapped += '5';
    if (s.includes('שישי') || /(^|\s)ו('|\b)/.test(s)) mapped += '6';
    if (s.includes('שבת') || s.includes('מוצ')) mapped += '7';
    if (s.includes('חול') || s.includes("ב'-ה'") || s.includes('ב-ה')) mapped += '2345';
    s += mapped;
  }

  const matches = s.match(/[1-7]/g);
  const list = matches ? Array.from(new Set(matches)).sort() : [];
  if (list.length > 0) {
    const joined = list.join('');
    if (joined === '12345') return { list, text: "א'-ה'" };
    if (joined === '123456') return { list, text: "א'-ו'" };
    if (joined === '2345') return { list, text: "ב'-ה'" };
    if (joined === '1234567') return { list, text: "כל השבוע" };
    
    const names = {'1':'ראשון','2':'שני','3':'שלישי','4':'רביעי','5':'חמישי','6':'שישי','7':'שבת'};
    return { list, text: list.map(d => names[d]).join(', ') };
  }
  return { list, text: String(raw).trim() };
};

const parseCity = (stopName) => {
  if (!stopName) return "";
  const s = String(stopName);
  const idx = s.indexOf(' - ');
  return idx > 0 ? s.slice(0, idx).trim() : s.split('/')[0].trim();
};

const cityOnlyStr = (s) => s ? (s.indexOf(' - ') > 0 ? s.slice(0, s.indexOf(' - ')).trim() : s.split('/')[0].trim()) : '';

// רכיב לעיצוב המק"ט, הכיוון והחלופה בתגיות ברורות (Badge style)
const RouteFormat = ({ val }) => {
  if (!val) return null;
  const parts = String(val).split('-');
  const makat = parts[0] || '';
  const dir = parts[1] || '';
  const alt = parts[2] && parts[2] !== '0' && parts[2] !== '#' ? parts[2] : '';
  
  return (
    <div className="inline-flex flex-wrap items-center gap-1.5 whitespace-nowrap text-[11px]" dir="rtl">
      <span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-slate-600 font-medium shadow-sm">
        מק&quot;ט: <strong className="font-black text-slate-900">{makat}</strong>
      </span>
      {dir && (
        <span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-slate-600 font-medium shadow-sm">
          כיוון: <strong className="font-black text-slate-900">{dir}</strong>
        </span>
      )}
      {alt && (
        <span className="bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded text-indigo-800 font-medium shadow-sm">
          חלופה: <strong className="font-black">{alt}</strong>
        </span>
      )}
    </div>
  );
};

function KavPach() {
  const [trips, setTrips] = useState([]);
  const [lineCitiesMap, setLineCitiesMap] = useState(new Map());
  const [lineStopsMap, setLineStopsMap] = useState(new Map());
  const [lineNormStopsMap, setLineNormStopsMap] = useState(new Map());
  const [lineStopNamesMap, setLineStopNamesMap] = useState(new Map());
  const [csvLoadFailed, setCsvLoadFailed] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const [fileLoad, setFileLoad] = useState({ active: false, progress: 0, message: "מנתח נתונים..." });
  const setFileLoading = (active) => setFileLoad(s => ({ ...s, active }));
  const setFileProgress = (progress) => setFileLoad(s => ({ ...s, progress }));
  const setFileMessage = (message) => setFileLoad(s => ({ ...s, message }));

  const [tab, setTab] = useState("redundant"); 
  const [searchCity, setSearchCity] = useState("");
  const [filterDistrict, setFilterDistrict] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [redundantSortBy, setRedundantSortBy] = useState("score"); 
  const [showCrowded, setShowCrowded] = useState(false);
  const [visibleTripsCount, setVisibleTripsCount] = useState(60);
  const [filterLineType, setFilterLineType] = useState("all");
  
  // ── אזורים חלשים State ──
  const [areaViewMode, setAreaViewMode] = useState("city");
  const [areaSortBy, setAreaSortBy] = useState("wastedKm");

  // ── קווים תאומים State ──
  const [twinSortBy, setTwinSortBy] = useState("score");
  const [twinFilterDistrict, setTwinFilterDistrict] = useState("all");
  const [twinSearch, setTwinSearch] = useState("");
  const [visibleTwinCount, setVisibleTwinCount] = useState(30);
  const [expandedTwin, setExpandedTwin] = useState(null);
  const [debugLine, setDebugLine] = useState("");
  const [debugResult, setDebugResult] = useState(null);

  const runLineDebug = (line) => {
    const ln = String(line).replace(/^0+/, '').trim();
    if (!ln) { setDebugResult(null); return; }
    const matches = trips.filter(x => String(x.lineNum).replace(/^0+/, '') === ln);
    if (!matches.length) {
      setDebugResult({ line: ln, found: false, msg: 'לא נמצא בנתונים' });
      return;
    }
    // קיבוץ לפי מק"ט — כל מק"ט הוא קו שונה גם אם מספר הקו זהה
    const byMakat = new Map();
    for (const t of matches) {
      const m = String(t.makat || '').replace(/^0+/, '');
      if (!byMakat.has(m)) byMakat.set(m, []);
      byMakat.get(m).push(t);
    }
    const variants = [];
    for (const [m, arr] of byMakat) {
      const stopsSet = lineStopsMap.get(m) || lineStopsMap.get(ln);
      const citiesSet = lineCitiesMap.get(m) || lineCitiesMap.get(ln);
      const normSet = lineNormStopsMap.get(m) || lineNormStopsMap.get(ln);
      const origins = [...new Set(arr.map(x => x.origin))];
      const dests = [...new Set(arr.map(x => x.dest))];
      variants.push({
        makat: m,
        tripCount: arr.length,
        district: arr[0].district,
        origins,
        dests,
        stopCount: stopsSet?.size || 0,
        cityCount: citiesSet?.size || 0,
        normStopCount: normSet?.size || 0,
        cities: citiesSet ? [...citiesSet] : [],
        stopsFirst: stopsSet ? [...stopsSet].slice(0, 10) : [],
      });
    }
    setDebugResult({ line: ln, found: true, variants });
  };
  
  const [optLine, setOptLine] = useState("");
  const [optCity, setOptCity] = useState("all");
  const [optDirection, setOptDirection] = useState("all");
  const [optDays, setOptDays] = useState([]); 
  const [optimizations, setOptimizations] = useState([]);
  const [showAllTripsInSimulator, setShowAllTripsInSimulator] = useState(false);
  const [visibleOptCount, setVisibleOptCount] = useState(50);
  
  const [optMetric, setOptMetric] = useState("ridership");
  const [optCustomGap, setOptCustomGap] = useState("");
  const [optMinTrips, setOptMinTrips] = useState("");
  const [optCancelThreshold, setOptCancelThreshold] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [activeExplainId, setActiveExplainId] = useState(null);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  // popup לטאב "קווים תאומים" — מוצג בלחיצה על הטאב, פעם אחת בלבד
  const [showTwinsBeta, setShowTwinsBeta] = useState(false);
  const dismissTwinsBeta = () => {
    try { localStorage.setItem('kavpach_twins_beta_seen_v2', '1'); } catch (e) {}
    setShowTwinsBeta(false);
  };
  const explainRef = useRef(null);

  // ── מצב מפה ──────────────────────────────────────────────────────────────
  const [simLoading, setSimLoading] = useState(false);

  useEffect(() => {
    if (!activeExplainId) return;
    const handler = (e) => {
      if (explainRef.current && !explainRef.current.contains(e.target)) {
        setActiveExplainId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [activeExplainId]);

  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'desc' });
  const [activeTooltip, setActiveTooltip] = useState(null);
  const tooltipRef = useRef(null);

  // searchCity מתעדכן רק אחרי debounce (מתוך DebouncedInput) —
  // לכן ניתן להשתמש בו ישירות לסינון בלי לדחוף עוד מממואיזציה נוספת.

  useEffect(() => {
    setVisibleTripsCount(60);
  }, [searchCity, showCrowded, sortConfig, tab, filterLineType]);

  useEffect(() => {
    if (!activeTooltip) return;
    const handler = (e) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target)) {
        setActiveTooltip(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [activeTooltip]);

  const { allDistricts, allCities, allDirections, allLineTypes } = useMemo(() => {
    const dists = new Set();
    const cits = new Set();
    const dirs = new Set();
    const types = new Set();
    
    for (let i = 0; i < trips.length; i++) {
      const t = trips[i];
      if (t.district) dists.add(t.district);
      if (t.origin) cits.add(t.origin);
      if (t.dest) cits.add(t.dest);
      if (t.direction) dirs.add(t.direction);
      if (t.lineType) types.add(t.lineType);
    }
    
    return {
      allDistricts: Array.from(dists).sort(),
      allCities: Array.from(cits).sort(),
      allDirections: Array.from(dirs).sort(),
      allLineTypes: Array.from(types).sort()
    };
  }, [trips]);

const DAYS_FILTER = [
    { id: "1", label: "ראשון" },
    { id: "2", label: "שני" },
    { id: "3", label: "שלישי" },
    { id: "4", label: "רביעי" },
    { id: "5", label: "חמישי" },
    { id: "6", label: "שישי" },
    { id: "7", label: "שבת" }
  ];

  // ── פונקציית טעינה מקובץ CSV מקומי ──────────────────────────────────────────
  const loadFromCSV = useCallback(async () => {
    try {
      setFileLoading(true);
      setFileProgress(5);
      setFileMessage("טוען נתונים מקובץ מקומי...");
      
      const response = await fetch('data.csv');
      if (!response.ok) {
        throw new Error('לא נמצא קובץ CSV');
      }
      
      setFileProgress(15);
      setFileMessage("קורא את הקובץ...");
      
      const csvText = await response.text();
      if (!csvText || csvText.trim().length === 0) {
        throw new Error('קובץ CSV ריק');
      }
      
      setFileProgress(30);
      setFileMessage("מנתח נתונים...");
      await yieldFrame();
      
      // פירוק CSV לשורות
      const lines = csvText.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        throw new Error('קובץ CSV חייב להכיל לפחות כותרות ושורת נתונים אחת');
      }
      
      // פירוק כותרות
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      
      // מיפוי עמודות
      const findCol = (names) => {
        for (const name of names) {
          const idx = headers.findIndex(h => h.includes(name) || h === name);
          if (idx !== -1) return idx;
        }
        return -1;
      };
      
      const cols = {
        lineNum: findCol(["מספר קו", "קו", "line"]),
        makat: findCol(["מק\"ט", "מקט", "Route_Id"]),
        direction: findCol(["כיוון", "direction"]),
        origin: findCol(["מוצא", "יישוב מוצא", "origin"]),
        dest: findCol(["יעד", "יישוב יעד", "dest"]),
        time: findCol(["שעה", "שעת רישוי", "time"]),
        days: findCol(["ימים", "ימי פעילות", "days"]),
        ridership: findCol(["נוסעים", "תיקופים", "ridership"]),
        peakLoad: findCol(["עומס", "שיא", "peak"]),
        district: findCol(["מחוז", "district"]),
        lineType: findCol(["סוג", "סוג שירות", "type"]),
        distance: findCol(["אורך", "מרחק", "distance"]),
        cost: findCol(["עלות", "cost"]),
        tripCount: findCol(["נסיעות", "כמות נסיעות", "trips"]),
        busSize: findCol(["גודל", "רכב", "bus"])
      };
      
      setFileProgress(50);
      setFileMessage("מעבד שורות...");
      await yieldFrame();
      
      const parsed = [];
      const CHUNK = 500;
      
      for (let i = 1; i < lines.length; i += CHUNK) {
        const end = Math.min(i + CHUNK, lines.length);
        
        for (let j = i; j < end; j++) {
          const line = lines[j];
          // פירוק שורה (תומך בערכים עם פסיקים בתוך גרשיים)
          const values = [];
          let current = '';
          let inQuotes = false;
          
          for (let k = 0; k < line.length; k++) {
            const char = line[k];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              values.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          values.push(current.trim());
          
          const getValue = (idx) => idx >= 0 && idx < values.length ? values[idx].replace(/^"|"$/g, '') : '';
          
          const lineNum = getValue(cols.lineNum);
          if (!lineNum) continue;
          
          const ridership = parseFloat(getValue(cols.ridership)) || 0;
          const peakLoad = parseFloat(getValue(cols.peakLoad)) || 0;
          const distance = parseFloat(getValue(cols.distance)) || 0;
          const cost = parseFloat(getValue(cols.cost)) || 0;
          const tripCount = parseInt(getValue(cols.tripCount)) || 1;
          const busSize = getValue(cols.busSize) || "אוטובוס";
          const capacity = getCapacity(busSize);
          
          const timeStr = getValue(cols.time);
          const parsedTime = fmtTime(timeStr);
          const mins = timeToMins(parsedTime);
          const timeMins = mins !== null ? mins : 0;
          
          const daysRaw = getValue(cols.days);
          const daysInfo = parseDays(daysRaw);
          
          const origin = getValue(cols.origin) || "לא ידוע";
          const dest = getValue(cols.dest) || "לא ידוע";
          const lineType = getValue(cols.lineType) || "עירוני";
          const uniqueness = getValue(findCol(["ייחודיות"]));
          
          parsed.push({
            id: j,
            lineNum,
            makat: getValue(cols.makat),
            direction: getValue(cols.direction),
            origin,
            dest,
            time: mins !== null ? parsedTime : "כללי",
            timeMins,
            period: getPeriod(timeMins),
            days: daysInfo.text,
            daysList: daysInfo.list,
            district: getValue(cols.district) || "כללי",
            lineType,
            ridership: Number(ridership.toFixed(2)),
            peakLoad: Number(peakLoad.toFixed(2)),
            busSize,
            capacity,
            efficiency: Number((Math.max(ridership, peakLoad) / capacity).toFixed(2)),
            distance,
            cost,
            weeklyKm: 0,
            isNightLine: uniqueness.includes("לילה"),
            isEilatPrebooked: origin.includes("אילת") || dest.includes("אילת"),
            isFeedingLine: uniqueness.includes("מזין"),
            opGroup: "",
            uniquenessVal: uniqueness || "",
            exclusiveStops: 0,
            tripCount
          });
        }
        
        const pct = 50 + Math.round(((i - 1) / lines.length) * 45);
        setFileProgress(Math.min(pct, 95));
        setFileMessage(`נמצאו ${parsed.length.toLocaleString()} נסיעות...`);
        await yieldFrame();
      }
      
      if (parsed.length === 0) {
        throw new Error('לא נמצאו נתונים תקינים בקובץ');
      }
      
      setTrips(parsed);
      setFileProgress(100);
      setFileMessage(`נטענו ${parsed.length.toLocaleString()} נסיעות ✓`);
      await yieldFrame();
      setFileLoading(false);
      setInitialLoading(false);
      setCsvLoadFailed(false);
      
    } catch (err) {
      console.log("שגיאה בטעינת CSV:", err.message);
      setFileLoading(false);
      setInitialLoading(false);
      setCsvLoadFailed(true);
    }
  }, []);

  // מפתח הקובץ הנוכחי — נשמר ב-ref כדי שלא יגרור re-render, ומועבר לתוך
  // ה-onmessage של ה-worker בלי להיתפס closure ישן.
  const fileKeyRef = useRef(null);

  // ── טעינה אוטומטית בעליית הקומפוננטה ──────────────────────────────────────
  const loadFromXLSX = useCallback(async () => {
    try {
      // שלב 1: HEAD מהיר כדי לקבל את חתימת הקובץ (לא מוריד את כל ה-MB).
      let fileKey = null;
      try {
        const headRes = await fetch('data.xlsx', { method: 'HEAD' });
        if (headRes.ok) fileKey = fileKeyFromHeaders(headRes);
      } catch (e) { /* HEAD נכשל — נמשיך בלי קאש */ }

      // שלב 2: אם יש מפתח, נסה לטעון מ-IndexedDB. אם תואם — שימוש מיידי.
      if (fileKey) {
        const cached = await idbGetCache(IDB_KEY);
        if (cached && cached.fileKey === fileKey && cached.trips && cached.trips.length > 0) {
          setFileLoading(true);
          setFileMessage('טוען מקאש מקומי...');
          setFileProgress(50);
          // yield קצר כדי שה-UI יציג את הודעת הקאש לפני הצפת ה-render הגדול
          await yieldFrame();
          setLineCitiesMap(cached.lineCitiesMap instanceof Map ? cached.lineCitiesMap : new Map());
          setLineStopsMap(cached.lineStopsMap instanceof Map ? cached.lineStopsMap : new Map());
          setLineNormStopsMap(cached.lineNormStopsMap instanceof Map ? cached.lineNormStopsMap : new Map());
          setLineStopNamesMap(cached.lineStopNamesMap instanceof Map ? cached.lineStopNamesMap : new Map());
          // DEBUG: חשיפה ל-window גם בטעינה מהקאש
          if (typeof window !== 'undefined') {
            window.__kp_trips = cached.trips;
            window.__kp_maps = {
              cities: cached.lineCitiesMap || new Map(),
              stops: cached.lineStopsMap || new Map(),
              normStops: cached.lineNormStopsMap || new Map(),
            };
          }
          setTrips(cached.trips);
          setFileProgress(100);
          setFileMessage(`נטענו ${cached.trips.length.toLocaleString()} נסיעות (מקאש) ✓`);
          setFileLoading(false);
          setInitialLoading(false);
          fileKeyRef.current = fileKey;
          return true;
        }
      }

      // שלב 3: אין קאש מתאים — הורדה + פרסור רגיל.
      setFileLoading(true);
      setFileProgress(3);
      setFileMessage('טוען קובץ Excel...');
      const res = await fetch('data.xlsx');
      if (!res.ok) throw new Error('xlsx missing');
      // ניקח שוב את הכותרות מהתגובה — אם HEAD נכשל קודם, יתפס כאן.
      if (!fileKey) fileKey = fileKeyFromHeaders(res);
      fileKeyRef.current = fileKey;
      const buf = await res.arrayBuffer();
      setInitialLoading(false);
      await onFile(buf);
      return true;
    } catch (err) {
      console.log('xlsx auto-load failed:', err.message);
      return false;
    }
  }, []);

  useEffect(() => {
    (async () => {
      const ok = await loadFromXLSX();
      if (!ok) loadFromCSV();
    })();
  }, [loadFromXLSX, loadFromCSV]);

  // טוען את ספריית XLSX ברקע (לצרכי ייצוא לאקסל בלבד — הפרסור עצמו רץ ב-worker).
  // קריאה לא חוסמת — אם הפרסור מסתיים לפני שה-XLSX הסתיים, אין בעיה.
  useEffect(() => {
    loadXLSX().catch(() => { /* swallow */ });
  }, []);

  const onFile = async (e) => {
    let buffer;
    if (e instanceof ArrayBuffer) {
      buffer = e;
    } else {
      const f = e.target.files[0];
      if (!f) return;
      e.target.value = '';
      setFileLoading(true);
      setFileProgress(2);
      setFileMessage("קורא קובץ...");
      buffer = await f.arrayBuffer();
    }
    setFileLoading(true);
    setFileProgress(2);
    setFileMessage("קורא קובץ...");

    // העברת הפרסור ל-Web Worker — ה-UI נשאר רספונסיבי לחלוטין.
    // הספרייה הכבדה (xlsx) נטענת בתוך ה-worker דרך importScripts.
    return new Promise((resolve) => {
      let worker;
      try {
        worker = new Worker('xlsx-worker.js');
      } catch (err) {
        console.error('Worker creation failed:', err);
        alert('שגיאה ביצירת thread עיבוד: ' + err.message);
        setFileLoading(false);
        resolve();
        return;
      }

      worker.onmessage = (ev) => {
        const msg = ev.data;
        if (!msg) return;
        if (msg.type === 'progress') {
          setFileProgress(msg.percent);
          setFileMessage(msg.message);
        } else if (msg.type === 'done') {
          // lineCitiesMap מגיע כ-Map עם Set-ים בזכות structured clone
          const lcm = msg.lineCitiesMap instanceof Map ? msg.lineCitiesMap : new Map();
          const lsm = msg.lineStopsMap instanceof Map ? msg.lineStopsMap : new Map();
          const lnsm = msg.lineNormStopsMap instanceof Map ? msg.lineNormStopsMap : new Map();
          const lsnm2 = msg.lineStopNamesMap instanceof Map ? msg.lineStopNamesMap : new Map();
          setLineCitiesMap(lcm);
          setLineStopsMap(lsm);
          setLineNormStopsMap(lnsm);
          setLineStopNamesMap(lsnm2);
          // DEBUG: חשיפה זמנית ל-window לטובת איתור באגים מהקונסול
          if (typeof window !== 'undefined') {
            window.__kp_trips = msg.trips || [];
            window.__kp_maps = { cities: lcm, stops: lsm, normStops: lnsm };
          }
          setTrips(msg.trips || []);
          setFileProgress(100);
          setFileMessage(`נטענו ${(msg.trips || []).length.toLocaleString()} נסיעות ✓`);
          setFileLoading(false);
          setInitialLoading(false);
          // שמירה בקאש (best-effort, רץ ברקע) — יעיל לטעינה הבאה
          if (fileKeyRef.current) {
            idbSetCache(IDB_KEY, {
              fileKey: fileKeyRef.current,
              trips: msg.trips || [],
              lineCitiesMap: lcm,
              lineStopsMap: lsm,
              lineNormStopsMap: lnsm,
              lineStopNamesMap: lsnm2,
              savedAt: Date.now(),
            });
          }
          worker.terminate();
          resolve();
        } else if (msg.type === 'error') {
          console.error('Worker error:', msg.message);
          alert('שגיאה: ' + msg.message);
          setFileLoading(false);
          worker.terminate();
          resolve();
        }
      };

      worker.onerror = (err) => {
        console.error('Worker exception:', err);
        alert('שגיאה בעיבוד הקובץ: ' + (err.message || 'unknown'));
        setFileLoading(false);
        worker.terminate();
        resolve();
      };

      // העברה ב-transfer: ה-buffer עובר למחזיק ה-worker בלי copy.
      // זה חוסך חצי שנייה על קבצי 10MB+.
      try {
        worker.postMessage({ type: 'parse', buffer }, [buffer]);
      } catch (err) {
        // fallback אם הדפדפן לא תומך ב-transferable
        worker.postMessage({ type: 'parse', buffer });
      }
    });
  };

  // ── קווים לא יעילים — ניקוד מבוסס קטגוריה ──────────────────────────────
  // 4 רכיבי ניקוד:
  //   1) נסיעות שפל (עד 30) — סף לפי קטגוריה
  //   2) ק"מ מבוזבז (עד 20)
  //   3) עלות תפעולית (עד 20) — יחס לממוצע הקטגוריה
  //   4) ממוצע נוסעים ועומס שיא (עד 30)
  // הגנות (מופחתות אחרי החיבור):
  //   - תחנות בלעדיות / קו עובר: עד 15 נקודות
  //   - מותאם רכבת (uniqueness מכיל "רכבת"): 10 נקודות
  //   - תלמידים בשעות בית ספר: 10 נקודות
  const redundantLines = useMemo(() => {
    // שלב 1: ספירת כמה קווים מגיעים לכל יעד (לזיהוי "תחנת קצה ייחודית")
    const destLineCount = new Map();
    {
      const seen = new Set();
      for (let i = 0; i < trips.length; i++) {
        const t = trips[i];
        const dKey = String(t.dest || '').trim().toLowerCase();
        if (!dKey || dKey === 'לא ידוע' || dKey === 'כללי') continue;
        const pairKey = `${t.lineNum}__${dKey}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        destLineCount.set(dKey, (destLineCount.get(dKey) || 0) + 1);
      }
    }

    const groups = {};
    const cityOnlyStr = (s) => s ? (s.indexOf(' - ') > 0 ? s.slice(0, s.indexOf(' - ')).trim() : s.split('/')[0].trim()) : '';
    for (let i = 0; i < trips.length; i++) {
      const t = trips[i];
      const o = cityOnlyStr(t.origin);
      const d = cityOnlyStr(t.dest);
      const cityPair = [o, d].sort().join('-');
      const groupKey = `${t.lineNum}_${cityPair}`;
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(t);
    }

    return Object.entries(groups).map(([groupKey, data]) => {
      const lineNum = data[0].lineNum;
      const totalTrips = data.reduce((s, t) => s + t.tripCount, 0);
      const totalRiders = data.reduce((s, t) => s + (t.ridership * t.tripCount), 0);
      const avgRiders = totalTrips > 0 ? (totalRiders / totalTrips) : 0;
      const totalPeaks = data.reduce((s, t) => s + (t.peakLoad * t.tripCount), 0);
      const avgPeak = totalTrips > 0 ? (totalPeaks / totalTrips) : 0;

      // סיווג הקו
      const category = classifyLine({
        opGroup: data[0].opGroup,
        uniqueness: data[0].uniquenessVal,
        lineType: data[0].lineType,
        distance: data[0].distance,
        trips: totalTrips,
        isNight: data[0].isNightLine,
        isFeeding: data[0].isFeedingLine,
      });
      const lowRiderTh = LOW_RIDER_THRESHOLD[category] || 10;
      const costBenchmark = COST_BENCHMARK[category] || 20;

      // נסיעות שפל לפי סף הקטגוריה
      const lowTrips  = data.filter(t => t.ridership < lowRiderTh);
      const lowCount  = lowTrips.reduce((s, t) => s + t.tripCount, 0);
      const percentLow = totalTrips > 0 ? (lowCount / totalTrips) * 100 : 0;

      const deadHoursTrips = data.filter(t => t.timeMins >= 540 && t.timeMins <= 840);
      const avgDeadHours = deadHoursTrips.length > 0 ? deadHoursTrips.reduce((s, t) => s + t.ridership, 0) / deadHoursTrips.length : null;

      const avgCapacity = data.reduce((s,t) => s + (t.capacity || 50), 0) / data.length || 50;
      const scale = avgCapacity / 50;

      const wastedKm = Math.round(
        lowTrips.reduce((s, t) => s + ((t.distance || 0) * t.tripCount), 0)
      );

      const validCosts = data.filter(t => t.cost > 0);
      const avgCost = validCosts.length > 0 ? validCosts.reduce((s, t) => s + t.cost, 0) / validCosts.length : 0;
      const costRatio = costBenchmark > 0 && avgCost > 0 ? avgCost / costBenchmark : 0;

      let totalKm = Math.round(data.reduce((s, t) => s + ((t.distance || 0) * t.tripCount), 0));
      if (data[0].weeklyKm > 0 && totalKm === 0) totalKm = Math.round(data[0].weeklyKm);
      const nonWastedKm = Math.max(0, totalKm - wastedKm);

      // ── ניקוד ──
      let score = 0;
      const componentScores = {};

      // 1. נסיעות שפל (עד 30 נק')
      componentScores.lowTrips = Math.min(30, percentLow * 0.3);
      score += componentScores.lowTrips;

      // 2. ק"מ מבוזבז (עד 20 נק')
      const wastedRatio = totalKm > 0 ? (wastedKm / totalKm) : 0;
      let wastedScore = wastedRatio * 10;
      if (wastedKm > 100) wastedScore += 10;
      componentScores.wastedKm = Math.min(20, wastedScore);
      score += componentScores.wastedKm;

      // 3. עלות תפעולית — יחס לממוצע קטגוריה (עד 20 נק')
      let costScore = 0;
      if (costRatio === 0) costScore = 0;
      else if (costRatio <= 0.7) costScore = 0;
      else if (costRatio <= 1.3) costScore = 5;
      else if (costRatio <= 1.7) costScore = 8;
      else if (costRatio <= 2.5) costScore = 12;
      else if (costRatio <= 4)   costScore = 16;
      else if (costRatio <= 6)   costScore = 18;
      else                       costScore = 20;
      componentScores.cost = costScore;
      score += costScore;

      // 4. נוסעים ועומס שיא (עד 30 נק') — תלוי בקיבולת
      let ridersScore = 0;
      if (avgRiders < (lowRiderTh * 0.6 * scale)) ridersScore += 15;
      else if (avgRiders < (lowRiderTh * 1.2 * scale)) ridersScore += 7;
      if (avgPeak < (15 * scale)) ridersScore += 15;
      componentScores.riders = Math.min(30, ridersScore);
      score += componentScores.riders;

      const rawScore = Math.min(100, Math.round(score));

      // ── הגנות (deductions) ──
      const protections = [];
      let totalDeduction = 0;

      // הגנה 1: תחנות בלעדיות / יעד ייחודי
      const exclusiveStops = data[0].exclusiveStops || 0;
      const destKey = String(data[0].dest || '').trim().toLowerCase();
      const isExclusiveDest = destKey && (destLineCount.get(destKey) || 0) <= 1;
      if (exclusiveStops > 0 || isExclusiveDest) {
        protections.push({ name: 'תחנות ייחודיות', value: 15, detail: exclusiveStops > 0 ? `${exclusiveStops} תחנות בלעדיות` : 'יעד יחיד באזור' });
        totalDeduction += 15;
      }

      // הגנה 2: מותאם רכבת — רק אם השדה "ייחודיות" מכיל במפורש "רכבת".
      // לא לבלבל עם Eilat prebooked — זה מושג שונה לגמרי (הזמנה מראש, לא לוז רכבת).
      const isTrainCoord = (data[0].uniquenessVal || '').includes('רכבת');
      if (isTrainCoord) {
        protections.push({ name: 'מותאם רכבת', value: 10, detail: 'יוצא בתיאום עם לוז רכבת' });
        totalDeduction += 10;
      }

      // הגנה 3: תלמידים בשעות בית ספר
      if (category === 'תלמידים') {
        // בית ספר: 7:00-8:30, 13:00-15:30
        const schoolHourTrips = data.filter(t =>
          (t.timeMins >= 420 && t.timeMins <= 510) ||
          (t.timeMins >= 780 && t.timeMins <= 930)
        ).reduce((s, t) => s + t.tripCount, 0);
        const schoolRatio = totalTrips > 0 ? schoolHourTrips / totalTrips : 0;
        if (schoolRatio >= 0.6) {
          protections.push({ name: 'תלמידים בשעות בי"ס', value: 10, detail: `${Math.round(schoolRatio * 100)}% מהנסיעות` });
          totalDeduction += 10;
        }
      }

      const finalScore = Math.max(0, rawScore - totalDeduction);
      const tier = getStatusTier(finalScore);

      const sortedData = [...data].sort((a, b) => {
        const dirA = String(a.direction).replace(/\D/g, '');
        const dirB = String(b.direction).replace(/\D/g, '');
        return Number(dirA) - Number(dirB);
      });

      return {
        lineNum,
        avg: avgRiders.toFixed(1),
        count: totalTrips,
        totalRiders,
        score: finalScore,
        rawScore,
        componentScores,
        protections,
        totalDeduction,
        category,
        costBenchmark,
        costRatio: Number(costRatio.toFixed(2)),
        lowRiderTh,
        origin: sortedData[0].origin,
        dest: sortedData[0].dest,
        district: sortedData[0].district,
        makat: sortedData[0].makat,
        status: tier.label,
        statusTier: tier,
        percentLow: Math.round(percentLow),
        avgPeak: Math.round(avgPeak),
        wastedKm,
        cost: avgCost,
        totalKm,
        nonWastedKm,
        groupKey,
        isNightLine: sortedData[0].isNightLine,
        isEilatPrebooked: sortedData[0].isEilatPrebooked,
        isFeedingLine: sortedData[0].isFeedingLine,
        exclusiveStops,
      };
    }).filter(l => l.score >= 25).sort((a,b) => b.score - a.score);
  }, [trips]);

  // ── קווים תאומים ──────────────────────────────────────────────────────
  // איתור קווים שעושים בעצם את אותו מסלול. השוואה לפי מסלול התחנות המלא (Stop_id)
  // בשני מדדים:
  //   Jaccard = |A ∩ B| / |A ∪ B|  — תופס קווים זהים לגמרי
  //   Overlap  = |A ∩ B| / min(|A|, |B|)  — תופס מצב שקו אחד הוא תת-מסלול של השני
  // מסמן תאום אם אחד מהשניים עובר את הסף (70%).
  const TWIN_JACCARD_THRESHOLD = 0.7;
  const TWIN_OVERLAP_THRESHOLD = 0.7;
  const TWIN_MIN_STOPS = 3;
  const twinLines = useMemo(() => {
    if (!trips.length) return [];
    const useStops = lineStopsMap && lineStopsMap.size > 0;
    const useNormStops = lineNormStopsMap && lineNormStopsMap.size > 0;
    const useCities = lineCitiesMap && lineCitiesMap.size > 0;
    if (!useStops && !useNormStops && !useCities) return [];

    const cityOnlyStr = (s) => s ? (s.indexOf(' - ') > 0 ? s.slice(0, s.indexOf(' - ')).trim() : s.split('/')[0].trim()) : '';

    // ── שלב 1: אגרגציה לפי makat ──
    // חשוב: לא לפי lineNum! מספר קו ("7", "70") חוזר בעשרות חברות באזורים שונים
    // — קו 7 בחיפה ≠ קו 7 בחדרה ≠ קו 7 באשדוד. ה-makat (Route_Id ב-GTFS)
    // הוא המזהה הייחודי האמיתי. כל הכיוונים של אותו makat מתאחדים יחד.
    const lineAgg = new Map();
    for (let i = 0; i < trips.length; i++) {
      const t = trips[i];
      if (!t.makat) continue;
      const aggKey = String(t.makat).replace(/^0+/, '').trim();
      if (!aggKey) continue;

      let agg = lineAgg.get(aggKey);
      if (!agg) {
        const cleanMakat = aggKey;
        const lineKey = String(t.lineNum || '').replace(/^0+/, '').trim();
        const stopsSet = useStops ? (lineStopsMap.get(cleanMakat) || lineStopsMap.get(lineKey)) : null;
        const normStopsSet = useNormStops ? (lineNormStopsMap.get(cleanMakat) || lineNormStopsMap.get(lineKey)) : null;
        const citiesSet = useCities ? (lineCitiesMap.get(cleanMakat) || lineCitiesMap.get(lineKey)) : null;
        agg = {
          lineNum: t.lineNum,
          makat: t.makat,
          district: t.district,
          lineType: t.lineType,
          stops: stopsSet || null,
          normStops: normStopsSet || null,
          cities: citiesSet || null,
          endpointPairs: new Map(), // pair-key -> count
          tripCount: 0,
          riderTripSum: 0,
          peakTripSum: 0,
          distanceKm: 0,         // סכום distance × tripCount לכל השורות (דירקציונלי)
          weeklyKmByDir: new Map(), // direction -> max(weeklyKm)
          costSum: 0,            // סכום cost × ridership × tripCount (משקלול)
          capacity: t.capacity || 50,
          isNightLine: t.isNightLine,
          isFeedingLine: t.isFeedingLine,
          timeBuckets: new Set(),
          directions: new Set(),
          mainOrigin: t.origin,
          mainDest: t.dest,
        };
        lineAgg.set(aggKey, agg);
      }
      const tc = t.tripCount || 1;
      agg.tripCount += tc;
      agg.riderTripSum += (t.ridership || 0) * tc;
      agg.peakTripSum += (t.peakLoad || 0) * tc;
      agg.distanceKm += (t.distance || 0) * tc;
      // השדה weeklyKm במקור הוא לרוב סה"כ שבועי לכל הקו — לא לכיוון.
      // לכן, כדי לכבד כהכפילות, נשמור מוסגרת לכיוון: מקסימום שורה עם אותו כיוון.
      const dirKey = String(t.direction || '').trim() || '0';
      agg.directions.add(dirKey);
      const prevWk = agg.weeklyKmByDir.get(dirKey) || 0;
      if ((t.weeklyKm || 0) > prevWk) agg.weeklyKmByDir.set(dirKey, t.weeklyKm || 0);
      // עלות לנוסע — משקללת בתפוסה האמיתית (ridership × tripCount)
      agg.costSum += (t.cost || 0) * (t.ridership || 0) * tc;
      if (t.timeMins) agg.timeBuckets.add(Math.floor(t.timeMins / 30));

      const o = cityOnlyStr(t.origin);
      const d = cityOnlyStr(t.dest);
      if (o && d) {
        // קווים מעגליים (מוצא = יעד) מקבלים קידומת loop| כדי שיקובצו
        // בבאקט נפרד משלהם, ויושוו רק מול קווים מעגליים אחרים באותה עיר.
        const ep = o.toLowerCase() === d.toLowerCase()
          ? `loop|${o.toLowerCase()}`
          : [o.toLowerCase(), d.toLowerCase()].sort().join('|');
        agg.endpointPairs.set(ep, (agg.endpointPairs.get(ep) || 0) + tc);
        if (o.toLowerCase() === d.toLowerCase()) agg.isCircular = true;
      }
    }

    // רק קווים עם מסלול תחנות מספיק גדול
    // (מעדיפים stops על cities — stops מדויק יותר כי שתי ערים זהה הן 100% גם לקווים במסלולים שונים)
    const lineList = [];
    for (const l of lineAgg.values()) {
      // מקבלים גם stops, גם normStops, גם cities — מתחשבים ל-bucketing וגם לבדיקת סף מינימום.
      // השוואה בפועל תחשב המיטב מהשתיים (Stop_id ושם-תחנה מנורמל).
      const refSet = l.stops || l.normStops || l.cities;
      if (refSet && refSet.size >= TWIN_MIN_STOPS) {
        l.refSet = refSet;
        lineList.push(l);
      }
    }
    if (lineList.length < 2) return [];

    // ── שלב 2: בקטים לפי זוגות ערים שהקו עובר בהן ──
    // לפני שמשווים כל קו לכל קו (O(N²)), קודם מקבצים. הבאקט הוא זוג ערים
    // (תוויה אחת לכל זוג עיר-A/עיר-B שהקו עובר בשתיהן). שני קווים תאומים
    // אמיתיים יחלקו בהכרח לפחות זוג ערים אחד — אחרת אין דרך שהם יחלקו
    // 70% מהתחנות שלהם. הוסף גם את endpointPairs המקוריות (לערים שלא
    // הופיעו ב-lineCitiesMap), כ-fallback.
    const endpointBuckets = new Map();
    const addToBucket = (key, line) => {
      let bucket = endpointBuckets.get(key);
      if (!bucket) { bucket = new Set(); endpointBuckets.set(key, bucket); }
      bucket.add(line);
    };
    for (const l of lineList) {
      // זוגות ערים שהקו עובר בהן
      const lineCities = l.cities ? Array.from(l.cities) : [];
      if (lineCities.length >= 2) {
        for (let i = 0; i < lineCities.length; i++) {
          for (let j = i + 1; j < lineCities.length; j++) {
            const pair = [lineCities[i], lineCities[j]].sort().join('|');
            addToBucket(pair, l);
          }
        }
      } else if (lineCities.length === 1) {
        // קו פנים-עירוני בעיר אחת — באקט לפי loop|<city>
        addToBucket(`loop|${lineCities[0]}`, l);
      }
      // גם endpointPairs המקוריות (לכל מקרה — אם cities ריק)
      for (const ep of l.endpointPairs.keys()) {
        addToBucket(ep, l);
      }
    }

    // ── שלב 3: השוואת Jaccard בתוך כל בקט ──
    // Jaccard = |A ∩ B| / |A ∪ B|. רק מעל הסף נחשב תאום.
    const adj = new Map(); // makatKey -> Map(neighbor -> similarity)
    const seenPairs = new Set();
    for (const lines of endpointBuckets.values()) {
      if (lines.size < 2) continue;
      const arr = Array.from(lines);
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = arr[i], b = arr[j];
          const aKey = String(a.makat || '').replace(/^0+/, '').trim();
          const bKey = String(b.makat || '').replace(/^0+/, '').trim();
          if (!aKey || !bKey || aKey === bKey) continue;
          const pairKey = [aKey, bKey].sort().join('||');
          if (seenPairs.has(pairKey)) continue;
          seenPairs.add(pairKey);

          let inter = 0;
          const aSet = a.refSet, bSet = b.refSet;
          const small = aSet.size <= bSet.size ? aSet : bSet;
          const big = small === aSet ? bSet : aSet;
          for (const c of small) if (big.has(c)) inter++;
          const union = aSet.size + bSet.size - inter;
          let jaccard = union > 0 ? inter / union : 0;
          let overlap = small.size > 0 ? inter / small.size : 0;
          // overlapReverse: how much of the *larger* line is covered — prevents a tiny line
          // from being falsely linked to a huge line that merely passes through the same stops.
          let overlapReverse = big.size > 0 ? inter / big.size : 0;

          // השוואה מקבילה על שמות תחנות מנורמלים (ללא סיומת כיוון) —
          // להלימה במקרה ששני קווים עוברים באותה תחנה פיזית אך ב-Stop_id שוני
          // (בגלל מיקום מקור שונה בתוך נתוני GTFS). לוקחים את ההתאמה הגבוהה מבין השני.
          if (a.normStops && b.normStops && a.normStops.size >= TWIN_MIN_STOPS && b.normStops.size >= TWIN_MIN_STOPS) {
            const aN = a.normStops, bN = b.normStops;
            const smallN = aN.size <= bN.size ? aN : bN;
            const bigN = smallN === aN ? bN : aN;
            let interN = 0;
            for (const c of smallN) if (bigN.has(c)) interN++;
            const unionN = aN.size + bN.size - interN;
            const jaccardN = unionN > 0 ? interN / unionN : 0;
            const overlapN = smallN.size > 0 ? interN / smallN.size : 0;
            const overlapRevN = bigN.size > 0 ? interN / bigN.size : 0;
            if (jaccardN > jaccard) jaccard = jaccardN;
            if (overlapN > overlap) overlap = overlapN;
            if (overlapRevN > overlapReverse) overlapReverse = overlapRevN;
          }
          // קו תאום: Jaccard גבוה (קווים דומים בגודל) OR overlap גבוה מצד הקו הקצר יותר
          // AND overlapReverse מינימלי מצד הקו הארוך — מונע חיבור שגוי בין קו קצר
          // לקו ארוך מאוד שרק עובר דרך אותן תחנות (כגון: קו עירוני עם 150+ תחנות).
          const TWIN_OVERLAP_REVERSE_MIN = 0.25;
          const isTwin = jaccard >= TWIN_JACCARD_THRESHOLD ||
            (overlap >= TWIN_OVERLAP_THRESHOLD && overlapReverse >= TWIN_OVERLAP_REVERSE_MIN);
          const sim = Math.max(jaccard, overlap);

          if (isTwin) {
            if (!adj.has(aKey)) adj.set(aKey, new Map());
            if (!adj.has(bKey)) adj.set(bKey, new Map());
            adj.get(aKey).set(bKey, sim);
            adj.get(bKey).set(aKey, sim);
          }
        }
      }
    }
    if (!adj.size) return [];

    // ── שלב 4: Bron-Kerbosch maximal cliques → קבוצות תאומים ──
    // כל קבוצה היא clique מקסימלי: כל זוג קווים בה מחובר ישירות ב-adj.
    // מונע קבוצות גדולות שנוצרות מחיבור עקיף (A-B-C ב-BFS אפילו ש-A ו-C אינם תאומים).
    const groups = [];
    {
      const allNodes = Array.from(adj.keys());
      // BK with pivot (Tomita variant) for performance
      function bk(R, P, X) {
        if (P.length === 0 && X.length === 0) {
          if (R.length >= 2) groups.push([...R]);
          return;
        }
        // בחירת pivot — הצומת עם הכי הרבה שכנים ב-P (מקטין ענפים)
        let pivot = P[0] || X[0];
        let pivotScore = -1;
        for (const u of [...P, ...X]) {
          const uN = adj.get(u);
          const score = uN ? P.filter(p => uN.has(p)).length : 0;
          if (score > pivotScore) { pivotScore = score; pivot = u; }
        }
        const pivotN = adj.get(pivot) || new Map();
        const candidates = P.filter(v => !pivotN.has(v));
        let P2 = [...P], X2 = [...X];
        for (const v of candidates) {
          const vN = adj.get(v) || new Map();
          bk([...R, v], P2.filter(p => vN.has(p)), X2.filter(x => vN.has(x)));
          P2 = P2.filter(p => p !== v);
          X2 = [...X2, v];
        }
      }
      bk([], allNodes, []);
    }

    // ── שלב 4b: פיצול cliques גדולים לתת-קבוצות (עד 3 קווים כל אחת) ──
    // clique של 4+ קווים מפוצל לזוגות/שלישיות עצמאיות עם חישוב נפרד לכל אחת.
    // אלגוריתם: Greedy maximum-weight matching — מתאים תחילה את הזוגות הכי דומים,
    // ואחר כך מנסה להוסיף קו שלישי שמחובר לשניהם.
    {
      const MAX_GROUP = 3;
      const toSplit = groups.splice(0, groups.length); // drain groups array
      for (const group of toSplit) {
        if (group.length <= MAX_GROUP) { groups.push(group); continue; }

        // אסוף את כל הזוגות הישירים ממוינים לפי דמיון יורד
        const pairs = [];
        for (let i = 0; i < group.length; i++) {
          const ai = adj.get(group[i]);
          if (!ai) continue;
          for (let j = i + 1; j < group.length; j++) {
            if (ai.has(group[j])) pairs.push([i, j, ai.get(group[j])]);
          }
        }
        pairs.sort((a, b) => b[2] - a[2]);

        const assigned = new Set();
        const subgroups = [];

        for (const [i, j] of pairs) {
          if (assigned.has(i) || assigned.has(j)) continue;
          const sg = [group[i], group[j]];
          assigned.add(i); assigned.add(j);
          // נסה להוסיף קו שלישי שמחובר לשניהם
          for (let k = 0; k < group.length; k++) {
            if (assigned.has(k)) continue;
            const kAdj = adj.get(group[k]);
            if (kAdj && kAdj.has(group[i]) && kAdj.has(group[j])) {
              sg.push(group[k]); assigned.add(k); break;
            }
          }
          subgroups.push(sg);
        }

        // קווים שלא שובצו (נדיר ב-clique מלא) — הוסף לתת-קבוצה הכי מתאימה
        for (let i = 0; i < group.length; i++) {
          if (assigned.has(i)) continue;
          const ai = adj.get(group[i]) || new Map();
          let bestSg = null, bestSim = -1;
          for (const sg of subgroups) {
            if (sg.length >= MAX_GROUP) continue;
            for (const m of sg) { const s = ai.get(m) || 0; if (s > bestSim) { bestSim = s; bestSg = sg; } }
          }
          if (bestSg) bestSg.push(group[i]); else subgroups.push([group[i]]);
        }

        for (const sg of subgroups) if (sg.length >= 2) groups.push(sg);
      }
    }

    // ── שלב 5: בניית תוצאה לכל קבוצה ──
    const result = [];
    for (const group of groups) {
      const groupLines = group.map(lineKey => {
        const agg = lineAgg.get(lineKey);
        const avgRiders = agg.tripCount > 0 ? agg.riderTripSum / agg.tripCount : 0;
        // ק"מ שבועי משולב: בקובץ המקור weeklyKm לעיתים מוצג כסך לכל הקו ולעיתים לכיוון.
        // לכן: לכל כיוון לוקחים את הערך הגבוה (כדי לא לכפול), ואז סוכמים על פני הכיוונים.
        // אם השדה ריק לחלוטין, fallback ל-sum של distance × tripCount.
        let weeklyKmCombined = 0;
        for (const v of agg.weeklyKmByDir.values()) weeklyKmCombined += v;
        if (weeklyKmCombined <= 0) weeklyKmCombined = agg.distanceKm;
        // אם sum של distance × tripCount גדול יותר מ-weeklyKm field — סימן שה-field היה directional וצריך לסכום
        if (agg.distanceKm > weeklyKmCombined) weeklyKmCombined = agg.distanceKm;
        const costPerRider = agg.riderTripSum > 0 ? agg.costSum / agg.riderTripSum : 0;
        return {
          lineNum: agg.lineNum,
          makat: agg.makat,
          district: agg.district,
          lineType: agg.lineType,
          tripCount: agg.tripCount,
          directionCount: agg.directions.size,
          avgRiders: Number(avgRiders.toFixed(1)),
          avgPeak: agg.tripCount > 0 ? Number((agg.peakTripSum / agg.tripCount).toFixed(1)) : 0,
          weeklyKm: Math.round(weeklyKmCombined),
          costPerRider: Number(costPerRider.toFixed(2)),
          capacity: agg.capacity,
          cities: agg.cities,
          timeBuckets: agg.timeBuckets,
          isNightLine: agg.isNightLine,
          isFeedingLine: agg.isFeedingLine,
          isCircular: !!agg.isCircular,
          mainOrigin: agg.mainOrigin,
          mainDest: agg.mainDest,
          _lineKey: lineKey,
        };
      }).sort((a, b) => b.tripCount - a.tripCount);

      const mainLine = groupLines[0];

      // ממוצע ומקסימום דמיון בקבוצה
      let simSum = 0, simCount = 0, maxSim = 0;
      for (let i = 0; i < group.length; i++) {
        const ai = adj.get(group[i]);
        if (!ai) continue;
        for (let j = i + 1; j < group.length; j++) {
          if (ai.has(group[j])) {
            const s = ai.get(group[j]);
            simSum += s;
            simCount++;
            if (s > maxSim) maxSim = s;
          }
        }
      }
      const avgSimilarity = simCount > 0 ? Math.round((simSum / simCount) * 100) : 0;
      // כאשר קו אחד מוכל לחלוטין בקו אחר (overlap=100%), הממוצע מוריד ציון בגלל זוגות אחרים בקבוצה.
      // לכן משתמשים ב-maxSimilarity לניקוד — אם לפחות זוג אחד בקבוצה דומה מאוד, הקבוצה רלוונטית.
      const maxSimilarity = Math.round(maxSim * 100);

      // תחנות משותפות לכל הקווים בקבוצה — לתצוגה בלבד (מראה ערים ידידותיות, לא stop_id)
      const firstCities = groupLines[0].cities;
      const commonCities = firstCities ? new Set(firstCities) : new Set();
      for (let i = 1; i < groupLines.length; i++) {
        const otherCities = groupLines[i].cities;
        if (!otherCities) { commonCities.clear(); break; }
        for (const c of Array.from(commonCities)) {
          if (!otherCities.has(c)) commonCities.delete(c);
        }
      }

      // חפיפת שעות
      const bucketCount = new Map();
      const allBuckets = new Set();
      groupLines.forEach(l => l.timeBuckets.forEach(b => {
        allBuckets.add(b);
        bucketCount.set(b, (bucketCount.get(b) || 0) + 1);
      }));
      let overlapBuckets = 0;
      for (const c of bucketCount.values()) if (c >= 2) overlapBuckets++;
      const timeOverlapPct = allBuckets.size > 0 ? Math.round((overlapBuckets / allBuckets.size) * 100) : 0;

      const totalTrips = groupLines.reduce((s, l) => s + l.tripCount, 0);
      const totalKm = groupLines.reduce((s, l) => s + l.weeklyKm, 0);
      const totalRiderTrips = groupLines.reduce((s, l) => s + l.avgRiders * l.tripCount, 0);
      const combinedAvgRiders = totalTrips > 0 ? totalRiderTrips / totalTrips : 0;
      const maxCapacity = Math.max(...groupLines.map(l => l.capacity));
      const utilization = combinedAvgRiders / maxCapacity;

      // ניקוד מבוסס מסלול בלבד: דמיון מסלול הוא העוגן (75 נק'), ניצולת נמוכה (20 נק'), בונוס (5 נק').
      // חפיפת שעות אינה חלק מהניקוד — מוצגת לידוע בלבד.
      let score = 0;
      // 1. דמיון מסלול (עד 75 נק') — עם cliques כל זוג מחובר ישירות, ממוצע מייצג את הקבוצה
      const routeSim = avgSimilarity;
      if (routeSim >= 70) score += Math.min(75, (routeSim - 70) * 3);
      // 2. ניצולת נמוכה (עד 20 נק') — קווים עמוסים אינם מועמדים לאיחוד
      if (utilization < 0.25) score += 20;
      else if (utilization < 0.4) score += 12;
      else if (utilization < 0.6) score += 5;
      // 3. שני הקווים חלשים בנפרד (5 נק' בונוס)
      if (groupLines.every(l => l.avgRiders < 12)) score += 5;
      score = Math.round(Math.max(0, Math.min(100, score)));

      // חיסכון פוטנציאלי משמרני: ק"מ של הקווים המשניים × 5 ש"ח/ק"מ
      const secondaryKm = groupLines.slice(1).reduce((s, l) => s + l.weeklyKm, 0);
      const potentialSavings = Math.round(secondaryKm * 5);

      // הצגת ערי קצה: המוצא/יעד הנפוצים של הקו הראשי
      const mainAggData = lineAgg.get(mainLine._lineKey);
      let cityA = cityOnlyStr(mainAggData.mainOrigin) || '';
      let cityB = cityOnlyStr(mainAggData.mainDest) || '';
      if (!cityA || !cityB) {
        const arr = Array.from(commonCities);
        cityA = cityA || arr[0] || '';
        cityB = cityB || arr[1] || '';
      }
      const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

      // קבוצה נחשבת מעגלית אם כל הקווים בה מעגליים
      const isCircularGroup = groupLines.every(l => l.isCircular);

      // compute overlap range from the pair with highest similarity
      let overlapFrom = '', overlapTo = '', overlapCount = 0;
      {
        // גזע משותף = חיתוך של כל תחנות כל הקווים בקבוצה (לא רק הזוג הכי דומה)
        let trunkSet = null;
        let trunkNm = null; // מפת שמות עבור הקו הקצר ביותר (סדר תחנות שמור)
        let smallestSize = Infinity;
        for (const lineKey of group) {
          const s = lineStopsMap.get(lineKey) || lineStopsMap.get((lineAgg.get(lineKey)||{}).lineNum||'');
          if (!s || s.size === 0) continue;
          if (!trunkSet) {
            trunkSet = new Set(s);
            trunkNm = lineStopNamesMap.get(lineKey);
            smallestSize = s.size;
          } else {
            for (const id of Array.from(trunkSet)) if (!s.has(id)) trunkSet.delete(id);
            // שמור את מפת השמות של הקו הקצר ביותר — מייצגת את סדר התחנות בגזע
            if (s.size < smallestSize) { smallestSize = s.size; trunkNm = lineStopNamesMap.get(lineKey); }
          }
        }
        if (trunkSet && trunkSet.size > 0 && trunkNm) {
          // מסדר את תחנות הגזע לפי סדר ההופעה בקו הקצר ביותר
          const ordered = Array.from(trunkNm.keys()).filter(id => trunkSet.has(id));
          overlapCount = trunkSet.size;
          if (ordered.length > 0) {
            const stripCity = s => { const i = s.indexOf(' - '); return i > 0 ? s.slice(i + 3).trim() : s; };
            overlapFrom = stripCity(trunkNm.get(ordered[0]) || '');
            overlapTo   = stripCity(trunkNm.get(ordered[ordered.length - 1]) || '');
          }
        }
      }

      result.push({
        cityPair: group.slice().sort().join('-'),
        cityA: cap(cityA),
        cityB: cap(cityB),
        isCircular: isCircularGroup,
        lines: groupLines.map(l => {
          const { cities, stops, refSet, timeBuckets, _lineKey, ...rest } = l;
          // directTwins: רק קווים שנמצאים בכרטיס הנוכחי (groupLines), מחוברים ישירות ב-adj,
          // ואינם הקו עצמו (לא לפי key ולא לפי מספר קו — מונע self-reference גם אם שני מק"טים חולקים lineNum).
          const myKey = l._lineKey;
          const groupKeySet = new Set(groupLines.map(gl => gl._lineKey));
          const myAdj = adj.get(myKey);
          rest.directTwins = myAdj
            ? Array.from(groupKeySet)
                .filter(k => k !== myKey && myAdj.has(k))
                .map(k => (lineAgg.get(k)||{}).lineNum)
                .filter(n => Boolean(n) && String(n) !== String(rest.lineNum))
            : [];
          return rest;
        }),
        lineCount: groupLines.length,
        totalTrips,
        totalKm,
        combinedAvgRiders: Number(combinedAvgRiders.toFixed(1)),
        utilization: Number((utilization * 100).toFixed(0)),
        timeOverlapPct,
        avgSimilarity,
        maxSimilarity,
        commonCityCount: commonCities.size,
        commonCities: Array.from(commonCities).slice(0, 8).map(cap),
        score,
        potentialSavings,
        district: mainLine.district,
        districts: new Set(groupLines.map(l => l.district).filter(Boolean)),
        lineNumbers: groupLines.map(l => l.lineNum).join(', '),
        overlapFrom,
        overlapTo,
        overlapCount,
      });
    }

    // סינון: רק קבוצות עם ציון 50 ומעלה מוצגות
    return result
      .filter(t => t.score >= 50)
      .sort((a, b) => b.score - a.score || b.potentialSavings - a.potentialSavings);
  }, [trips, lineCitiesMap, lineStopsMap, lineNormStopsMap, lineStopNamesMap]);

  const filteredTwins = useMemo(() => {
    let result = twinLines;
    if (twinFilterDistrict !== "all") {
      result = result.filter(t => t.districts ? t.districts.has(twinFilterDistrict) : t.district === twinFilterDistrict);
    }
    if (twinSearch) {
      const s = twinSearch.toLowerCase();
      result = result.filter(t =>
        t.cityA.toLowerCase().includes(s) ||
        t.cityB.toLowerCase().includes(s) ||
        t.lineNumbers.includes(s)
      );
    }
    const sorted = [...result];
    if (twinSortBy === "savings") sorted.sort((a, b) => b.potentialSavings - a.potentialSavings);
    else if (twinSortBy === "score") sorted.sort((a, b) => b.score - a.score);
    else if (twinSortBy === "trips") sorted.sort((a, b) => b.totalTrips - a.totalTrips);
    else if (twinSortBy === "overlap") sorted.sort((a, b) => b.timeOverlapPct - a.timeOverlapPct);
    else if (twinSortBy === "lineCount") sorted.sort((a, b) => b.lineCount - a.lineCount);
    return sorted;
  }, [twinLines, twinFilterDistrict, twinSearch, twinSortBy]);

  const filteredRedundant = useMemo(() => {
    let result = [...redundantLines];
    if (filterDistrict !== "all") {
      result = result.filter(r => r.district === filterDistrict);
    }
    if (filterCategory !== "all") {
      result = result.filter(r => r.category === filterCategory);
    }
    if (searchCity) {
      const sCity = searchCity.toLowerCase();
      result = result.filter(r => {
        const isOriginDest = r.origin.toLowerCase().includes(sCity) || r.dest.toLowerCase().includes(sCity);
        if (isOriginDest) return true;
        
        const cleanMakat = String(r.makat || '').replace(/^0+/, '').trim();
        const cleanLine = String(r.lineNum || '').replace(/^0+/, '').trim();
        const citiesSet = lineCitiesMap.get(cleanMakat) || lineCitiesMap.get(cleanLine);
        return citiesSet ? Array.from(citiesSet).some(c => c.includes(sCity)) : false;
      });
    }
    
    result.sort((a, b) => {
      if (redundantSortBy === "wastedKm") return b.wastedKm - a.wastedKm;
      if (redundantSortBy === "cost") return b.cost - a.cost;
      if (redundantSortBy === "count") return b.count - a.count;
      return b.score - a.score;
    });

    return result;
  }, [redundantLines, searchCity, filterDistrict, filterCategory, lineCitiesMap, redundantSortBy]);

  const areaStats = useMemo(() => {
    const map = new Map();
    redundantLines.forEach(line => {
      // כאן הוספנו את הסינון - הניתוח האזורי יתייחס רק לקווים מיותרים לחלוטין (80 ומעלה)
      if (line.score < 80) return;

      const keys = areaViewMode === 'district' 
        ? [line.district] 
        : Array.from(new Set([line.origin, line.dest]));

      keys.forEach(key => {
        if (!key || key === "לא ידוע" || key === "כללי") return;
        if (!map.has(key)) {
          map.set(key, { name: key, totalScore: 0, lineCount: 0, totalWastedKm: 0, totalCost: 0, validCostCount: 0, sumAvgRiders: 0, totalAreaTrips: 0, totalAreaRiders: 0 });
        }
        const entry = map.get(key);
        entry.totalScore += line.score;
        entry.lineCount += 1;
        entry.totalWastedKm += line.wastedKm;
        entry.totalAreaRiders += line.totalRiders;
        entry.totalAreaTrips += line.count;
        entry.sumAvgRiders += parseFloat(line.avg || 0);
        if (line.cost > 0) {
          entry.totalCost += line.cost;
          entry.validCostCount += 1;
        }
      });
    });

    return Array.from(map.values()).map(entry => {
      const baseScore = entry.totalScore / entry.lineCount;
      // קנס חומרה על נפח הבזבוז - כל 15,000 ק"מ סרק מוסיפים נקודה לציון החומרה, עד 40 נקודות תוספת
      const volumePenalty = Math.min(40, entry.totalWastedKm / 15000);
      
      return {
        name: entry.name,
        avgScore: Math.min(100, Math.round(baseScore + volumePenalty)),
        lineCount: entry.lineCount,
        wastedKm: entry.totalWastedKm,
        totalTrips: entry.totalAreaTrips,
        avgCost: entry.validCostCount > 0 ? entry.totalCost / entry.validCostCount : 0,
        avgAreaRiders: entry.totalAreaTrips > 0 ? (entry.totalAreaRiders / entry.totalAreaTrips).toFixed(1) : 0
      };
    }).sort((a, b) => {
      if (areaSortBy === 'wastedKm') return b.wastedKm - a.wastedKm;
      if (areaSortBy === 'lineCount') return b.lineCount - a.lineCount;
      if (areaSortBy === 'avgRiders') return parseFloat(a.avgAreaRiders) - parseFloat(b.avgAreaRiders);
      return b.avgScore - a.avgScore;
    });
  }, [redundantLines, areaViewMode, areaSortBy]);

  const handleViewAreaLines = (areaName) => {
    if (areaViewMode === 'district') {
      setFilterDistrict(areaName);
      setSearchCity("");
    } else {
      setFilterDistrict("all");
      setSearchCity(areaName);
    }
    setTab("redundant");
  };

  const exportAreaToExcel = (areaName, viewMode) => {
    // סינון הקווים הרלוונטיים לאזור שנבחר, ורק אלו שחשודים כמיותרים (ציון 80 ומעלה) כדי שיתאים לתצוגה
    const filteredLines = redundantLines.filter(line => {
      if (line.score < 80) return false;
      if (viewMode === 'district') return line.district === areaName;
      return line.origin === areaName || line.dest === areaName;
    });

    if (filteredLines.length === 0) return;

    // עיצוב הנתונים לקובץ
    const exportData = filteredLines.map(line => ({
      'מספר קו': line.lineNum,
      'מק"ט': line.makat,
      'מוצא': line.origin,
      'יעד': line.dest,
      'מחוז': line.district,
      'ציון אי-יעילות': line.score,
      'ממוצע נוסעים לנסיעה': parseFloat(line.avg),
      'עומס שיא ממוצע': line.avgPeak,
      'כמות נסיעות בשבוע': line.count,
      'עלות תפעולית ממוצעת': line.cost > 0 ? `₪${line.cost.toFixed(2)}` : 'לא זמין',
      'ק"מ מבוזבז': line.wastedKm,
      'ק"מ שימושי (ללא סרק)': line.nonWastedKm,
    }));

    const ws = window.XLSX.utils.json_to_sheet(exportData);
    if(!ws['!views']) ws['!views'] = [];
    ws['!views'].push({ rightToLeft: true }); // הגדרה מימין לשמאל
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "קווים_חשודים_כמיותרים");
    
    const fileName = `קווים_חשודים_כמיותרים_${areaName.replace(/\s+/g, '_')}.xlsx`;
    window.XLSX.writeFile(wb, fileName);
  };

  const tableTrips = useMemo(() => {
    const sCity = searchCity.toLowerCase();
    let filtered = trips.filter(t => {
      if (filterLineType !== "all" && t.lineType !== filterLineType) return false;
      if (sCity) {
        const isOriginDest = t.origin.toLowerCase().includes(sCity) || t.dest.toLowerCase().includes(sCity);
        let isTransit = false;
        if (!isOriginDest) {
            const makatKey = String(t.makat || '').replace(/^0+/, '').trim();
            const lineKey = String(t.lineNum || '').replace(/^0+/, '').trim();
            const citiesSet = lineCitiesMap.get(makatKey) || lineCitiesMap.get(lineKey);
            isTransit = citiesSet ? Array.from(citiesSet).some(c => c.includes(sCity)) : false;
        }
        if (!isOriginDest && !isTransit) return false;
      }
      if (showCrowded && t.ridership < 40 && t.peakLoad < 40) return false;
      return true;
    });

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
        if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [trips, searchCity, showCrowded, sortConfig, lineCitiesMap, filterLineType]);

  const runOptimization = async (overrideLine, overrideCity, overrideDirection, overrideDays) => {
    const lineToUse = typeof overrideLine === 'string' ? overrideLine : optLine;
    const cityToUse = typeof overrideCity === 'string' ? overrideCity : optCity;
    const dirToUse = typeof overrideDirection === 'string' ? overrideDirection : optDirection;
    const daysToUse = Array.isArray(overrideDays) ? overrideDays : optDays;
    setSimLoading(true);
    setVisibleOptCount(50);
    await yieldFrame();

    const filteredTrips = trips.filter(t => {
        if (lineToUse) {
          const searchVals = String(lineToUse).split(',').map(s => s.trim()).filter(Boolean);
          if (searchVals.length > 0) {
            const lineStr = String(t.lineNum).trim();
            const makatStr = String(t.makat || '').trim();
            if (!searchVals.includes(lineStr) && !searchVals.includes(makatStr)) return false;
          }
        }
      
      if (cityToUse && cityToUse !== "all") {
        const sCity = cityToUse.toLowerCase();
        const matchesOriginDest = t.origin.toLowerCase().includes(sCity) || t.dest.toLowerCase().includes(sCity);
        const makatKey  = String(t.makat  || '').replace(/^0+/, '').trim();
        const lineKey   = String(t.lineNum || '').replace(/^0+/, '').trim();
        const citiesSet = lineCitiesMap.get(makatKey) || lineCitiesMap.get(lineKey);
        const matchesTransit = citiesSet ? Array.from(citiesSet).some(c => c.includes(sCity)) : false;
        if (!matchesOriginDest && !matchesTransit) return false;
      }    
      
      if (dirToUse && dirToUse !== "all" && !String(t.direction).includes(dirToUse)) return false;
      
      if (daysToUse && daysToUse.length > 0) {
        const hasMatchingDay = daysToUse.some(day => t.daysList.includes(String(day)));
        if (!hasMatchingDay) return false;
      }
      return true;
    });

    if (filteredTrips.length === 0) {
      setOptimizations([]);
      setSimLoading(false);
      return;
    }

    const results = [];
    const grouped = {};
    const lineDayCounts = {};
    const cancelledCountByLineDay = {};

    filteredTrips.forEach(t => {
      const key = `${t.lineNum}|${t.direction}|${t.days}|${t.origin}|${t.dest}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(t);
      const countKey = `${t.lineNum}|${t.daysList.join('')}`;
      lineDayCounts[countKey] = (lineDayCounts[countKey] || 0) + t.tripCount;
    });

    const customGapValue = parseInt(optCustomGap, 10);
    const groupEntries = Object.values(grouped);
    const GSIM_CHUNK = 300; 

    for (let gi = 0; gi < groupEntries.length; gi++) {
      const group = groupEntries[gi];
      group.sort((a,b) => a.timeMins - b.timeMins);
      const usedTrips = new Set(); 
      let cancelledInGroup = 0;
      
      for(let i = 0; i < group.length; i++) {
        const t1 = group[i];
        if (usedTrips.has(t1.id)) continue;

        const t2 = i < group.length - 1 ? group[i+1] : null;
        if (t2 && t1.timeMins === t2.timeMins) continue;

        let merged = false;
        const category = getLineCategory(t1.lineType);
        const totalTripsInDay = lineDayCounts[`${t1.lineNum}|${t1.daysList.join('')}`] || 0;

        const capacity = t1.capacity || 50;
        const scale = capacity / 50;

        let defaultMaxGap, maxRidersEach, maxTotalMerge, cancelGapCheck;

        if (category === 'urban') {
          defaultMaxGap = 30; 
          maxRidersEach = Math.round(10 * scale); 
          maxTotalMerge = Math.round(18 * scale); 
          cancelGapCheck = 15;
        } else if (category === 'regional') {
          defaultMaxGap = 180; 
          maxRidersEach = Math.round(10 * scale); 
          maxTotalMerge = Math.round(18 * scale); 
          cancelGapCheck = 240; 
        } else {
          defaultMaxGap = 60; 
          maxRidersEach = Math.round(10 * scale); 
          maxTotalMerge = Math.round(20 * scale); 
          cancelGapCheck = 60;
        }
        
        const maxGapMerge = !isNaN(customGapValue) && customGapValue > 0 ? customGapValue : defaultMaxGap;
        const isNight = t1.isNightLine || t1.period === 'לילה';
        const hasCustomGap = !isNaN(customGapValue) && customGapValue > 0;

        if (isNight) cancelGapCheck = 60;

        let defaultCancelRiders = category === 'regional' ? Math.max(1, Math.round(3 * scale)) : Math.max(1, Math.round(5 * scale));
        if (t1.isNightLine) defaultCancelRiders = 1;
        const userCancelThreshold = parseFloat(optCancelThreshold);
        const cancelRiders = !isNaN(userCancelThreshold) ? userCancelThreshold : defaultCancelRiders;
        
        let actionTaken = false;
        const getMetricVal = (t) => optMetric === 'peakLoad' && t.peakLoad > 0 ? t.peakLoad : t.ridership;

        if (t2 && !usedTrips.has(t2.id) && totalTripsInDay >= 6) {
          const gap1 = t2.timeMins - t1.timeMins;
          const val1 = getMetricVal(t1);
          const val2 = getMetricVal(t2);
          const totalVal1 = val1 + val2;
          
          const t3 = i < group.length - 2 ? group[i+2] : null;
          let skipForBetterMerge = false;
          
          if (t3 && !usedTrips.has(t3.id)) {
            const gap2 = t3.timeMins - t2.timeMins;
            const val3 = getMetricVal(t3);
            const totalVal2 = val2 + val3;
            if (gap2 > 0 && gap2 < gap1 && gap2 <= maxGapMerge && val2 < maxRidersEach && val3 < maxRidersEach && totalVal2 < maxTotalMerge) {
              skipForBetterMerge = true; 
            }
          }

          if (!skipForBetterMerge && gap1 > 0 && gap1 <= maxGapMerge && val1 < maxRidersEach && val2 < maxRidersEach && totalVal1 < maxTotalMerge && (!isNight || hasCustomGap)) {
            const suggestedMins = Math.floor((t1.timeMins + t2.timeMins) / 2);
            const suggestedTime = `${String(Math.floor(suggestedMins/60)).padStart(2,'0')}:${String(suggestedMins%60).padStart(2,'0')}`;

            results.push({
              type: 'merge',
              isNightLine: t1.isNightLine,
              isEilatPrebooked: t1.isEilatPrebooked,
              isFeedingLine: t1.isFeedingLine,
              categoryLabel: category === 'urban' ? 'עירוני' : category === 'regional' ? 'אזורי' : 'בין-עירוני',
              line: t1.lineNum, origin: t1.origin, dest: t1.dest, direction: t1.direction,
              from: t1.time, to: t2.time, timeMins: t1.timeMins, suggestedTime: suggestedTime,
              days: t1.days, gap: gap1, usedMetric: optMetric, total: Number(totalVal1.toFixed(2)), val1: val1, val2: val2,
              busSize: t1.busSize, capacity: t1.capacity, efficiency: t1.efficiency, metricVal: val1
            });
            usedTrips.add(t1.id); usedTrips.add(t2.id); merged = true; actionTaken = true;
          }
        }

        if (!merged) {
          const valCancel = getMetricVal(t1);

          if (valCancel < cancelRiders) {
            let allowCancel = true;
            const dayKey = `${t1.lineNum}|${t1.daysList.join('')}`;
            const totalTripsBothDirs = lineDayCounts[dayKey] || 0;
            const currentCancelledBoth = cancelledCountByLineDay[dayKey] || 0;

            const userMinTrips = parseInt(optMinTrips, 10);
            const minRequired = !isNaN(userMinTrips) ? userMinTrips : (category === 'regional' ? 3 : 0);

            if ((totalTripsBothDirs - currentCancelledBoth) <= minRequired) { allowCancel = false; }

            // הגנה חדשה: אסור לבטל נסיעה ראשונה או אחרונה ביום של הקו והכיוון.
            // ביטול קצוות יומיים פוגע פגיעה לא פרופורציונלית בנוסעים שתלויים בקו.
            const isFirstOfDay = i === 0;
            const isLastOfDay  = i === group.length - 1;
            if (isFirstOfDay || isLastOfDay) { allowCancel = false; }

            if (allowCancel) {
              let hasAlternative = false; 
              const prev = i > 0 ? group[i-1] : null; const next = t2;
              
              if (prev && (t1.timeMins - prev.timeMins) <= cancelGapCheck) hasAlternative = true;
              if (next && (next.timeMins - t1.timeMins) <= cancelGapCheck) hasAlternative = true;

              if (hasAlternative) {
                results.push({
                  type: 'cancel', isNightLine: t1.isNightLine, isEilatPrebooked: t1.isEilatPrebooked, isFeedingLine: t1.isFeedingLine,
                  categoryLabel: category === 'urban' ? 'עירוני' : category === 'regional' ? 'אזורי' : 'בין-עירוני',
                  line: t1.lineNum, origin: t1.origin, dest: t1.dest, direction: t1.direction,
                  time: t1.time, timeMins: t1.timeMins, days: t1.days, usedMetric: optMetric, metricVal: valCancel, efficiency: t1.efficiency,
                  busSize: t1.busSize, capacity: t1.capacity
                });
                usedTrips.add(t1.id); cancelledInGroup++; cancelledCountByLineDay[dayKey] = (cancelledCountByLineDay[dayKey] || 0) + 1; actionTaken = true;
              }
            }
          }
        }

        if (!actionTaken && !usedTrips.has(t1.id)) {
           results.push({
              type: 'ok', isNightLine: t1.isNightLine, isEilatPrebooked: t1.isEilatPrebooked, isFeedingLine: t1.isFeedingLine,
              categoryLabel: category === 'urban' ? 'עירוני' : category === 'regional' ? 'אזורי' : 'בין-עירוני',
              line: t1.lineNum, origin: t1.origin, dest: t1.dest, direction: t1.direction, time: t1.time, timeMins: t1.timeMins, days: t1.days, usedMetric: optMetric, metricVal: getMetricVal(t1), efficiency: t1.efficiency,
              busSize: t1.busSize, capacity: t1.capacity
           });
           usedTrips.add(t1.id);
        }
      }
      if (gi % GSIM_CHUNK === GSIM_CHUNK - 1) await yieldFrame();
    }
    
    results.sort((a, b) => {
      if (cityToUse && cityToUse !== "all") {
        const getWeight = (lbl) => lbl === 'עירוני' ? 1 : lbl === 'אזורי' ? 2 : 3;
        const wA = getWeight(a.categoryLabel);
        const wB = getWeight(b.categoryLabel);
        if (wA !== wB) return wA - wB;
      }
      const lineComp = String(a.line || "").localeCompare(String(b.line || ""), 'he', {numeric: true});
      if (lineComp !== 0) return lineComp;
      const pairA = [String(a.origin || "").trim(), String(a.dest || "").trim()].sort().join('-');
      const pairB = [String(b.origin || "").trim(), String(b.dest || "").trim()].sort().join('-');
      const pairComp = pairA.localeCompare(pairB, 'he');
      if (pairComp !== 0) return pairComp;
      const dirComp = String(a.direction || "").localeCompare(String(b.direction || ""), 'he', {numeric: true});
      if (dirComp !== 0) return dirComp;
      const getDayVal = (d) => {
        if (!d) return 99;
        if (d.includes("א'-ה'")) return 1;
        if (d.includes("א'-ו'")) return 2;
        if (d.includes("שישי") || d.includes("ו'")) return 6;
        if (d.includes("שבת") || d.includes("מוצ")) return 7;
        return 5;
      };
      const d1 = getDayVal(a.days);
      const d2 = getDayVal(b.days);
      if (d1 !== d2) return d1 - d2;
      return a.timeMins - b.timeMins;
    });

    setOptimizations(results);
    setSimLoading(false);
  };

  const exportOptimizationsToExcel = () => {
    if (optimizations.length === 0) return;
    const dataToExport = showAllTripsInSimulator ? optimizations : optimizations.filter(o => o.type !== 'ok');
    const exportData = dataToExport.map(opt => {
      const metricName = opt.usedMetric === 'peakLoad' ? 'עומס שיא' : 'נוסעים';
      if (opt.type === 'merge') {
        return { 'מספר קו': opt.line, 'סוג קו': opt.categoryLabel, 'סוג רכב': opt.busSize, 'מוצא': opt.origin, 'יעד': opt.dest, 'כיוון': opt.direction, 'ימי פעילות': opt.days, 'פעולה מומלצת': 'איחוד נסיעות', 'שעות מקוריות': `${opt.from}, ${opt.to}`, 'שעה מוצעת (חדשה)': opt.suggestedTime, 'מדד (נוסעים / עומס)': `סה"כ ${metricName}: ${opt.total} (נסיעה 1: ${opt.val1}, נסיעה 2: ${opt.val2})`, 'הערות': `איחוד 2 נסיעות בהפרש של ${opt.gap} דקות` };
      } else if (opt.type === 'cancel') {
        return { 'מספר קו': opt.line, 'סוג קו': opt.categoryLabel, 'סוג רכב': opt.busSize, 'מוצא': opt.origin, 'יעד': opt.dest, 'כיוון': opt.direction, 'ימי פעילות': opt.days, 'פעולה מומלצת': 'ביטול נסיעה', 'שעות מקוריות': opt.time, 'שעה מוצעת (חדשה)': '--', 'מדד (נוסעים / עומס)': `${metricName}: ${opt.metricVal}`, 'הערות': 'חשד לנסיעה מיותרת עם חלופה קרובה בזמן' };
      } else {
         return { 'מספר קו': opt.line, 'סוג קו': opt.categoryLabel, 'סוג רכב': opt.busSize, 'מוצא': opt.origin, 'יעד': opt.dest, 'כיוון': opt.direction, 'ימי פעילות': opt.days, 'פעולה מומלצת': 'ללא שינוי (תקין)', 'שעות מקוריות': opt.time, 'שעה מוצעת (חדשה)': opt.time, 'מדד (נוסעים / עומס)': `${metricName}: ${opt.metricVal}`, 'הערות': 'נסיעה תקינה שעומדת בתנאי' };
      }
    });
    const ws = window.XLSX.utils.json_to_sheet(exportData);
    if(!ws['!views']) ws['!views'] = [];
    ws['!views'].push({ rightToLeft: true });
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "המלצות_ייעול");
    
    let fileName = "קופח_המלצות_ייעול_לוז.xlsx";
    if (optimizations.length > 0) {
      if (optLine) {
        const o = optimizations.find(x => String(x.line) === String(optLine)) || optimizations[0];
        fileName = `קו ${o.line} ${o.origin} - ${o.dest}.xlsx`;
      } else if (optCity !== "all") {
        fileName = `ייעול_קווים_${optCity}.xlsx`;
      }
    }
    window.XLSX.writeFile(wb, fileName);
  };

  const handleOptimizeLine = (lineNum, city) => {
    setOptLine(lineNum);
    setOptCity(city || "all");
    setOptDirection("all");
    setOptDays([]); 
    setTab("simulator");
    runOptimization(lineNum, city || "all", "all", []);
  };

  const toggleDay = (dayId) => {
    setOptDays(prev => prev.includes(dayId) ? prev.filter(d => d !== dayId) : [...prev, dayId]);
  };

  const renderTransitChip = (origin, dest) => {
    if (!optCity || optCity === "all") return null;
    const sCity = optCity.toLowerCase();
    const isOriginDest = (origin || "").toLowerCase().includes(sCity) || (dest || "").toLowerCase().includes(sCity);
    if (isOriginDest) return null;
    return (
      <span className="text-[11px] font-black bg-teal-100 text-teal-700 px-2 py-1 rounded-md">
        עובר דרך: {optCity}
      </span>
    );
  };

  const renderPrebookedInfo = (id, isPrebooked) => {
    if (!isPrebooked) return null;
    const showExplain = activeExplainId === id;
    return (
      <div className="relative inline-flex items-center">
        <button
          onClick={(e) => { e.stopPropagation(); setActiveExplainId(showExplain ? null : id); }}
          className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 font-bold text-sm flex items-center justify-center border border-slate-300 hover:bg-slate-200 transition-colors mx-1 outline-none relative z-10"
          title="מידע על נתוני הקו"
        >!</button>
        {showExplain && (
          <div 
             ref={explainRef} 
             className="absolute top-8 right-0 left-auto p-3 sm:p-4 bg-white text-slate-800 text-xs sm:text-sm rounded-xl shadow-2xl z-[9999] leading-relaxed font-normal text-right normal-case border border-slate-200 ring-1 ring-slate-900/5"
             style={{ position: 'absolute', width: 'min(16rem, calc(100vw - 3rem))' }}
          >
            <strong className="block mb-2 text-slate-900 text-base">קו בהזמנה מראש</strong>
            בגלל שנוסעים רוכשים כרטיס מראש, חלקם לא מתקפים שוב בעלייה לאוטובוס. לכן, נתוני התיקופים כאן חלקיים ועלולים להציג עומס נמוך ממה שקורה בפועל.
          </div>
        )}
      </div>
    );
  };

  const renderFeedingLineInfo = (id, isFeeding) => {
    if (!isFeeding) return null;
    const showExplain = activeExplainId === id;
    return (
      <div className="relative inline-flex items-center">
        <button
          onClick={(e) => { e.stopPropagation(); setActiveExplainId(showExplain ? null : id); }}
          className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 font-bold text-sm flex items-center justify-center border border-sky-300 hover:bg-sky-200 transition-colors mx-1 outline-none relative z-10"
          title="מידע על קו מזין רכבת"
        >!</button>
        {showExplain && (
          <div 
             ref={explainRef} 
             className="absolute top-8 right-0 left-auto p-3 sm:p-4 bg-white text-slate-800 text-xs sm:text-sm rounded-xl shadow-2xl z-[9999] leading-relaxed font-normal text-right normal-case border border-slate-200 ring-1 ring-slate-900/5"
             style={{ position: 'absolute', width: 'min(16rem, calc(100vw - 3rem))' }}
          >
            <strong className="block mb-2 text-slate-900 text-base">קו מזין רכבת</strong>
            מטרת קו זה היא לאסוף או לפזר נוסעים מתחנת הרכבת. לכן, לפני קבלת החלטה על ביטול נסיעות או שינוי שעות הפעילות שלו, מומלץ לבדוק ולהצליב את המידע עם לוח הזמנים המעודכן של הרכבת.
          </div>
        )}
      </div>
    );
  };

  const handleOptimizeLineForm = (lineNum, city) => {
    setOptLine(lineNum);
    setOptCity(city || "all");
    setOptDirection("all");
    setOptDays([]); 
    setTab("simulator");
    runOptimization(lineNum, city || "all", "all", []);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 p-4 md:p-6 pb-20" style={{ fontFamily: "'Heebo', sans-serif" }} dir="rtl">
      <CitiesDatalist cities={allCities} />

      <div className="max-w-6xl mx-auto">
        <header className="mb-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-right">
            <div className="flex items-center gap-3 justify-center md:justify-end">
              <div className="bg-slate-900 text-white p-2.5 rounded-2xl rotate-3 shadow-lg">
                <Ic n="trash" size={28} />
              </div>
              <h1 className="text-4xl font-[900] text-slate-900 tracking-tighter leading-none">קו פח</h1>
              <div className="relative mr-3 flex items-center gap-3">
                <button
                  onClick={() => setShowWhatsNew(v => !v)}
                  className="bg-indigo-100 text-indigo-800 text-xs font-black px-3 py-1 rounded-full border border-indigo-200 shadow-sm whitespace-nowrap tracking-wide hover:bg-indigo-200 transition-colors cursor-pointer"
                >
                  עדכון גרסה 3.2
                </button>
                <span className="text-xs font-bold text-slate-400">נבנה על ידי שלמה הרטמן</span>
              </div>
            </div>
            <p className="text-slate-500 text-sm font-bold mt-2 pr-1">מאתרים קווים ריקים • מייעלים את הלו&quot;ז</p>
          </div>
        </header>

        {showTwinsBeta && (
          <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[60] p-4" onClick={dismissTwinsBeta}>
            <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full border border-slate-100 text-right" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-purple-100 text-purple-700 rounded-2xl p-3">
                  <Ic n="copy" size={24} />
                </div>
                <div className="flex-1">
                  <div className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-[11px] font-black inline-block mb-1">בבנייה</div>
                  <h3 className="font-black text-xl text-slate-900">טאב "קווים תאומים"</h3>
                </div>
              </div>
              <p className="text-slate-600 text-sm leading-relaxed mb-6">
                הטאב החדש לזיהוי קווים תאומים נמצא בשלבי פיתוח ועדיין לא מוכן לשימוש מלא. ייתכן שהתוצאות חלקיות, לא מדויקות או מציגות קווים שלא באמת תאומים.
              </p>
              <button
                onClick={dismissTwinsBeta}
                className="w-full bg-slate-900 hover:bg-black text-white py-3 rounded-2xl font-black transition-colors"
              >
                הבנתי
              </button>
            </div>
          </div>
        )}

        {showWhatsNew && (
          <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4" onClick={() => setShowWhatsNew(false)}>
            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-2xl w-full border border-slate-100 max-h-[90vh] overflow-y-auto text-right" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="font-black text-2xl text-slate-800">מה חדש בגרסה 3.2</h3>
                  <p className="text-slate-400 font-bold text-xs mt-1">חיפוש מהיר, קאש מקומי, וזיהוי קווים מעגליים</p>
                </div>
                <button onClick={() => setShowWhatsNew(false)} className="text-slate-400 hover:bg-slate-100 hover:text-slate-900 rounded-full w-8 h-8 flex items-center justify-center font-black text-2xl transition-colors leading-none pb-1" title="סגור">
                  &times;
                </button>
              </div>
              <div className="space-y-6 text-slate-700 text-sm leading-relaxed">

                <section>
                  <h4 className="font-black text-slate-900 text-base mb-2 flex items-center gap-2">
                    <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md text-[10px]">ביצועים</span>
                    טעינה מיידית בכניסות חוזרות
                  </h4>
                  <p className="text-slate-600 mb-3">המערכת שומרת את הנתונים המעובדים בקאש מקומי בדפדפן. בכניסה הבאה, כל עוד קובץ המקור לא השתנה, הטעינה נמשכת פחות משנייה — בלי הורדה, בלי פרסור.</p>
                  <ul className="list-disc list-inside space-y-2 marker:text-emerald-400 pr-2">
                    <li><strong>HEAD request זריז</strong> בודק אם הקובץ השתנה. אם כן — הקאש מתעדכן אוטומטית.</li>
                    <li><strong>הקאש פר-משתמש</strong>, נשמר ב-IndexedDB ולא פוגע בהגדרות הדפדפן.</li>
                  </ul>
                </section>

                <section>
                  <h4 className="font-black text-slate-900 text-base mb-2 flex items-center gap-2">
                    <span className="bg-sky-100 text-sky-700 px-2 py-0.5 rounded-md text-[10px]">שיפור</span>
                    חיפוש חלק וללא לאגים
                  </h4>
                  <p className="text-slate-600 mb-3">החיפוש שודרג כך שההקלדה והמחיקה מיידיות גם בנייד. הסינון מתבצע רק בהקשה על <strong>Enter</strong> או בלחיצה על ה-× כדי לנקות — בלי עיבוד מיותר ברקע בכל מקש.</p>
                  <ul className="list-disc list-inside space-y-2 marker:text-sky-400 pr-2">
                    <li><strong>רינדור מותנה (content-visibility):</strong> הדפדפן מציג רק את הכרטיסים שעל המסך, ומדלג על כל מה שמחוץ לתצוגה. גלילה ברשימות גדולות הפכה חלקה.</li>
                    <li><strong>פחות DOM, יותר FPS:</strong> טעינת הטבלה התחלתית קטנה משמעותית — הכפתור "טען עוד" עדיין זמין.</li>
                  </ul>
                </section>

                <section>
                  <h4 className="font-black text-slate-900 text-base mb-2 flex items-center gap-2">
                    <span className="bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-md text-[10px]">חדש</span>
                    זיהוי קווים מעגליים בתאומים
                  </h4>
                  <p className="text-slate-600 mb-3">קווים שהמוצא והיעד שלהם זהים (קווים מעגליים, למשל בתוך עיר אחת) נכנסים עכשיו לחישוב התאומים — באג ידוע שמנע מקבוצות כאלה להופיע. כרטיס תאומים מעגלי מסומן בתווית <span dir="ltr" className="font-bold">↻ מעגלי</span>.</p>
                </section>

                <section>
                  <h4 className="font-black text-slate-900 text-base mb-2 flex items-center gap-2">
                    <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md text-[10px]">תיקון</span>
                    באגים שתוקנו
                  </h4>
                  <ul className="list-disc list-inside space-y-2 marker:text-slate-400 pr-2">
                    <li><strong>טולטיפ "הזמנה מראש" בנייד:</strong> הטולטיפ חרג מהמסך במכשירים צרים. עכשיו הוא מעוגן לימין וברוחב מותאם לרוחב המסך.</li>
                    <li><strong>שאריות JSX מתצוגה:</strong> טקסט קוד מסוים הופיע בטעות מעל שדות חיפוש — נוקה.</li>
                  </ul>
                </section>

              </div>
            </div>
          </div>
        )}

        {fileLoad.active || initialLoading ? (
          <div className="flex flex-col items-center justify-center py-40 text-center gap-6">
            {fileLoad.progress < 48 ? (
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center">
                  <Ic n="loader" size={28} cls="text-white" animate={true} />
                </div>
                <div>
                  <p className="text-xl font-black text-slate-900">{initialLoading && !fileLoad.active ? "טוען נתונים..." : fileLoad.message}</p>
                  <p className="text-slate-400 text-sm font-bold mt-1">יקח כמה שניות</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div style={{ willChange: 'transform' }}>
                  <Ic n="loader" size={64} cls="text-slate-900" animate={true} />
                </div>
                <p className="text-xl font-black text-slate-800">{fileLoad.message}</p>
                <div className="w-72 bg-slate-200 rounded-full h-3 overflow-hidden">
                  <div className="h-3 rounded-full bg-slate-900" style={{ width: `${fileLoad.progress}%`, transition: 'width 0.3s ease' }} />
                </div>
                <p className="text-slate-400 font-bold text-sm">{fileLoad.progress}%</p>
              </div>
            )}
          </div>
        ) : trips.length === 0 && csvLoadFailed ? (
          <div className="flex flex-col items-center justify-center py-32 px-6 bg-white rounded-[3rem] border-4 border-dashed border-slate-200 shadow-sm text-center">
            <div className="bg-slate-50 p-8 rounded-full mb-8"><Ic n="upload" size={48} cls="text-slate-300" /></div>
            <h2 className="text-3xl font-black text-slate-800 mb-4">מוכנים לזרוק קווים?</h2>
            <h3 className="text-xl font-black text-slate-700 mb-3 bg-indigo-50 text-indigo-800 px-5 py-2 rounded-xl border border-indigo-100 shadow-sm inline-block">המערכת שמוצאת קווים שאפשר לזרוק לפח</h3>
            <p className="text-slate-500 font-medium mb-6 max-w-md">לא נמצא קובץ נתונים מקומי (data.csv).</p>
            <p className="text-slate-400 font-medium mb-12 max-w-md">העלו קובץ אקסל עם נתוני תיקופים כדי להתחיל בניתוח המערכת.</p>
            <label className="bg-slate-900 hover:bg-black text-white px-16 py-5 rounded-[2rem] font-black text-xl cursor-pointer transition-all shadow-xl hover:scale-105 active:scale-95">
              העלאת קובץ נתונים
              <input type="file" className="hidden" accept=".xlsx,.xls" onChange={onFile} />
            </label>
          </div>
        ) : trips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-40 text-center gap-6">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center">
                <Ic n="loader" size={28} cls="text-white" animate={true} />
              </div>
              <div>
                <p className="text-xl font-black text-slate-900">טוען נתונים...</p>
                <p className="text-slate-400 text-sm font-bold mt-1">יקח כמה שניות</p>
              </div>
            </div>
          </div>
        ) : (
          <main>
            <nav className="flex bg-slate-200/50 backdrop-blur p-1.5 rounded-[2rem] mb-12 max-w-4xl mx-auto shadow-inner border border-slate-200 overflow-x-auto">
              {["redundant", "twins", "areas", "allTrips", "simulator", "about"].map(tabName => {
                const isSelected = tab === tabName;
                let colorClass = "text-slate-500";
                let iconName = "";
                let label = "";
                if (tabName === "redundant") { colorClass = isSelected ? "bg-white text-rose-600 shadow-md" : "text-slate-500 hover:text-slate-700"; iconName = "trash"; label = "קווים לא יעילים"; }
                if (tabName === "twins") { colorClass = isSelected ? "bg-white text-purple-600 shadow-md" : "text-slate-500 hover:text-slate-700"; iconName = "copy"; label = "קווים תאומים"; }
                if (tabName === "areas") { colorClass = isSelected ? "bg-white text-amber-600 shadow-md" : "text-slate-500 hover:text-slate-700"; iconName = "chart"; label = "ניתוח אזורי"; }
                if (tabName === "allTrips") { colorClass = isSelected ? "bg-white text-indigo-600 shadow-md" : "text-slate-500 hover:text-slate-700"; iconName = "list"; label = "כל הנסיעות"; }
                if (tabName === "simulator") { colorClass = isSelected ? "bg-white text-slate-900 shadow-md" : "text-slate-500 hover:text-slate-700"; iconName = "zap"; label = "אלגוריתם ייעול"; }
                if (tabName === "about") { colorClass = isSelected ? "bg-white text-indigo-600 shadow-md" : "text-slate-500 hover:text-slate-700"; iconName = "info"; label = "על המערכת"; }

                return (
                  <button key={`nav-${tabName}`} onClick={() => {
                    if (tabName === "twins") {
                      let seen = false;
                      try { seen = !!localStorage.getItem('kavpach_twins_beta_seen_v2'); } catch (e) {}
                      if (!seen) setShowTwinsBeta(true);
                    }
                    setTab(tabName);
                  }} className={`flex-1 min-w-[120px] py-3.5 rounded-[1.5rem] font-black text-sm transition-all flex items-center justify-center gap-2 ${colorClass}`}>
                    <Ic n={iconName} size={16} /> {label}
                  </button>
                )
              })}
            </nav>

            {tab === "redundant" && (
              <div className="space-y-8 transition-opacity duration-300 opacity-100">
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col xl:flex-row justify-between items-center gap-4">
                  <div>
                    <h2 className="text-2xl font-black text-slate-900">הקווים הכי לא יעילים</h2>
                    <p className="text-slate-500 font-bold">דירוג המציג את הקווים החלשים ביותר במערכת, לצורך בחינה וייעול</p>
                  </div>
                  <div className="flex flex-col md:flex-row gap-3 relative w-full xl:w-auto">
                    <select 
                      value={redundantSortBy} 
                      onChange={e => setRedundantSortBy(e.target.value)} 
                      className="bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 font-black outline-none focus:border-slate-900 text-right shadow-sm w-full md:w-56 appearance-none cursor-pointer"
                    >
                      <option value="score">מיון: לפי אי-יעילות</option>
                      <option value="wastedKm">מיון: ק&quot;מ מבוזבז (גבוה לנמוך)</option>
                      <option value="cost">מיון: עלות לנוסע (גבוהה לנמוכה)</option>
                      <option value="count">מיון: כמות נסיעות בשבוע</option>
                    </select>
                    <select 
                      value={filterDistrict} 
                      onChange={e => setFilterDistrict(e.target.value)} 
                      className="bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 font-black outline-none focus:border-slate-900 text-right shadow-sm w-full md:w-48 appearance-none cursor-pointer"
                    >
                      <option value="all">כל המחוזות</option>
                      {allDistricts.map(d => <option key={`dist-${d}`} value={d}>{d}</option>)}
                    </select>
                    <select
                      value={filterCategory}
                      onChange={e => setFilterCategory(e.target.value)}
                      className="bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 font-black outline-none focus:border-slate-900 text-right shadow-sm w-full md:w-56 appearance-none cursor-pointer"
                    >
                      <option value="all">כל הקטגוריות</option>
                      {CATEGORIES.map(c => <option key={`cat-${c}`} value={c}>{c}</option>)}
                    </select>
                    <div className="flex relative w-full xl:w-64">
                      <SearchInput
                        value={searchCity} 
                        onSubmit={setSearchCity} 
                        placeholder="הקלד עיר ולחץ Enter..."
                        className="bg-slate-50 border-2 border-slate-200 rounded-2xl px-6 py-3 pl-12 font-black outline-none focus:border-slate-900 text-right shadow-sm w-full"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredRedundant.length > 0 ? filteredRedundant.map((res, i) => (
                    <div key={`red-${res.groupKey}-${i}`} className="vcard bg-white border-2 border-slate-100 rounded-[2.5rem] p-7 shadow-sm hover:border-slate-900 transition-all text-right flex flex-col group relative">
                      <div className="flex items-start justify-between mb-6">
                        <div className="flex flex-col gap-2 items-start text-right">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className={`px-4 py-1.5 rounded-full text-[11px] font-black border ${res.statusTier.bg} ${res.statusTier.color}`}>
                              {res.status}
                            </div>
                            <div className="px-3 py-1.5 rounded-full text-[11px] font-black bg-slate-100 text-slate-700 border border-slate-200">
                              {res.category}
                            </div>
                            {res.isNightLine && (
                              <span className="text-indigo-400 bg-indigo-50 p-1 rounded-full" title="קו לילה">
                                <Ic n="moon" size={14} />
                              </span>
                            )}
                            {renderPrebookedInfo('red-'+i, res.isEilatPrebooked)}
                            {renderFeedingLineInfo('red-'+i, res.isFeedingLine)}
                          </div>
                          <div className="mt-1">
                            <RouteFormat val={res.makat} />
                          </div>
                        </div>
                        <div className="bg-slate-900 text-white w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl shadow-lg shrink-0">{res.lineNum}</div>
                      </div>
                      <div className="flex-1 mb-5">
                        
                        <div className="flex items-center justify-start gap-3 mb-2 min-w-0">
                          <div className="text-slate-900 font-black text-lg truncate leading-tight" title={res.origin}>{res.origin}</div>
                          <div className="text-slate-300 text-2xl font-black shrink-0 leading-none">←</div>
                          <div className="text-slate-900 font-black text-lg truncate leading-tight" title={res.dest}>{res.dest}</div>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-2 mb-4">
                          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md shrink-0">{res.district}</span>
                          {(() => {
                            if (!searchCity) return null;
                            const sCity = searchCity.toLowerCase();
                            const isOriginDest = res.origin.toLowerCase().includes(sCity) || res.dest.toLowerCase().includes(sCity);
                            if (isOriginDest) return null;

                            const cleanMakat = String(res.makat || '').replace(/^0+/, '').trim();
                            const cleanLine = String(res.lineNum || '').replace(/^0+/, '').trim();
                            const citiesSet = lineCitiesMap.get(cleanMakat) || lineCitiesMap.get(cleanLine);
                            
                            if (!citiesSet) return null;
                            
                            const matchedCity = Array.from(citiesSet).find(c => c.includes(sCity));

                            if (!matchedCity) return null;

                            return (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 whitespace-nowrap shrink-0">
                                עובר דרך: {matchedCity}
                              </span>
                            );
                          })()}
                        </div>

                        <div className="text-xs font-bold text-slate-400 mb-4 flex items-center gap-2 flex-wrap">
                          <span>ציון אי-יעילות:</span>
                          <span className={`font-black ${res.statusTier.color}`}>{res.score}/100</span>
                          {res.totalDeduction > 0 && (
                            <span className="text-slate-400 font-bold">
                              (גולמי {res.rawScore}, הופחתו {res.totalDeduction} בגין הגנות)
                            </span>
                          )}
                        </div>

                        {res.protections.length > 0 && (
                          <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-2xl px-3 py-2">
                            <div className="text-[10px] font-black text-emerald-700 mb-1">הגנות פעילות</div>
                            <div className="flex flex-wrap gap-1.5">
                              {res.protections.map((p, k) => (
                                <span key={`prot-${i}-${k}`} className="bg-white border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-bold" title={p.detail}>
                                  {p.name} −{p.value}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="space-y-2.5 pt-4 border-t border-slate-100">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-600 font-bold">ממוצע נוסעים לנסיעה</span>
                            <span className="font-black text-slate-900">{res.avg}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-600 font-bold">עומס שיא ממוצע</span>
                            <span className="font-black text-slate-900">{res.avgPeak}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-600 font-bold">נסיעות בשבוע</span>
                            <span className="font-black text-slate-900">{res.count}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm gap-2">
                            <span className="text-slate-600 font-bold">עלות תפעולית לנוסע</span>
                            <span className="text-right">
                              <span className="font-black text-slate-900">{res.cost > 0 ? `₪${res.cost.toFixed(2)}` : 'לא זמין'}</span>
                              {res.cost > 0 && res.costBenchmark > 0 && (
                                <div className="text-[10px] font-bold text-slate-400">
                                  ממוצע {res.category}: ₪{res.costBenchmark}
                                  {res.costRatio > 1 && (
                                    <span className="text-rose-500 mr-1">(×{res.costRatio.toFixed(2)})</span>
                                  )}
                                </div>
                              )}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-600 font-bold">ק&quot;מ לא מבוזבז (שימושי)</span>
                            <span className="font-black text-emerald-600">{res.nonWastedKm.toLocaleString()} ק&quot;מ</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-600 font-bold">ק&quot;מ מבוזבז (נסיעות סרק)</span>
                            <span className="font-black text-rose-600">{res.wastedKm.toLocaleString()} ק&quot;מ</span>
                          </div>
                        </div>
                      </div>
                      <button onClick={() => handleOptimizeLineForm(res.lineNum, res.origin)} className="w-full py-4 bg-slate-900 text-white rounded-2xl text-xs font-black hover:bg-black transition-all shadow-md">חפש הזדמנויות התייעלות</button>
                    </div>
                  )) : (
                    <div className="col-span-full text-center py-20 text-slate-400 font-bold">לא נמצאו קווים לסינון המבוקש.</div>
                  )}
                </div>
              </div>
            )}

            {tab === "twins" && (
              <div className="space-y-8 transition-opacity duration-300 opacity-100">
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col xl:flex-row justify-between items-center gap-4">
                  <div>
                    <h2 className="text-2xl font-black text-slate-900">קווים תאומים</h2>
                    <p className="text-slate-500 font-bold">קבוצות קווים שהמסלול שלהם זהה ב‏70% ומעלה — מועמדים לאיחוד</p>
                  </div>
                  <div className="flex flex-col md:flex-row gap-3 relative w-full xl:w-auto">
                    <select
                      value={twinSortBy}
                      onChange={e => setTwinSortBy(e.target.value)}
                      className="bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 font-black outline-none focus:border-slate-900 text-right shadow-sm w-full md:w-56 appearance-none cursor-pointer"
                    >
                      <option value="score">מיון: ציון כפילות (גבוה לנמוך)</option>
                      <option value="savings">מיון: חיסכון פוטנציאלי</option>
                      <option value="overlap">מיון: חפיפת שעות</option>
                      <option value="trips">מיון: סך נסיעות שבועיות</option>
                      <option value="lineCount">מיון: מספר קווים בקבוצה</option>
                    </select>
                    <select
                      value={twinFilterDistrict}
                      onChange={e => setTwinFilterDistrict(e.target.value)}
                      className="bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 font-black outline-none focus:border-slate-900 text-right shadow-sm w-full md:w-48 appearance-none cursor-pointer"
                    >
                      <option value="all">כל המחוזות</option>
                      {allDistricts.map(d => <option key={`twin-dist-${d}`} value={d}>{d}</option>)}
                    </select>
                    <div className="flex relative w-full xl:w-64">
                      <SearchInput
                        value={twinSearch}
                        onSubmit={setTwinSearch}
                        placeholder="חיפוש עיר או מספר קו — Enter"
                        className="bg-slate-50 border-2 border-slate-200 rounded-2xl px-6 py-3 pl-12 font-black outline-none focus:border-slate-900 text-right shadow-sm w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* DEBUG: בדיקת קו ספציפי */}
                <details className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4">
                  <summary className="font-black text-amber-800 cursor-pointer text-sm select-none">🔍 בדיקת קו ספציפי (Debug)</summary>
                  <div className="mt-3 space-y-2">
                    <div className="text-xs text-amber-700 font-medium">הקלד מספר קו ולחץ Enter — תראה מה המערכת קלטה עליו.</div>
                    <input
                      type="text"
                      value={debugLine}
                      onChange={e => setDebugLine(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') runLineDebug(debugLine); }}
                      placeholder="לדוגמה: 7 או 70"
                      className="w-full bg-white border border-amber-300 rounded-xl px-4 py-2 font-black outline-none focus:border-amber-500 text-right"
                    />
                    {debugResult && (
                      <div className="bg-white rounded-xl p-3 text-xs font-mono text-slate-700 leading-relaxed border border-amber-100 max-h-96 overflow-auto" dir="ltr">
                        {!debugResult.found ? (
                          <div className="text-rose-600 font-bold">❌ Line {debugResult.line}: {debugResult.msg}</div>
                        ) : (
                          <>
                            <div className="font-bold text-amber-700 mb-2">Line {debugResult.line}: found {debugResult.variants.length} variant(s)</div>
                            {debugResult.variants.map((v, i) => (
                              <div key={i} className="border-t border-slate-200 pt-2 mt-2 first:border-0 first:pt-0 first:mt-0">
                                <div className="font-bold text-slate-900">Variant #{i+1} — Makat: {v.makat}</div>
                                <div><strong>District:</strong> {v.district}</div>
                                <div><strong>Trips:</strong> {v.tripCount}</div>
                                <div><strong>Origins:</strong> {v.origins.join(', ')}</div>
                                <div><strong>Dests:</strong> {v.dests.join(', ')}</div>
                                <div><strong>Stop_id count:</strong> {v.stopCount} {v.stopCount < 3 ? '⚠️' : '✓'}</div>
                                <div><strong>City count:</strong> {v.cityCount}</div>
                                <div><strong>NormStop count:</strong> {v.normStopCount}</div>
                                {v.cities.length > 0 && <div><strong>Cities:</strong> {v.cities.join(' | ')}</div>}
                                {v.stopsFirst.length > 0 && <div><strong>First stops:</strong> {v.stopsFirst.join(', ')}</div>}
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </details>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white border-2 border-slate-100 rounded-[2rem] p-5 text-right">
                    <div className="text-slate-400 font-black text-xs mb-1">קבוצות תאומים</div>
                    <div className="text-3xl font-black text-purple-600">{filteredTwins.length.toLocaleString()}</div>
                  </div>
                  <div className="bg-white border-2 border-slate-100 rounded-[2rem] p-5 text-right">
                    <div className="text-slate-400 font-black text-xs mb-1">קווים מעורבים</div>
                    <div className="text-3xl font-black text-indigo-600">
                      {filteredTwins.reduce((s,t) => s + t.lineCount, 0).toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-white border-2 border-slate-100 rounded-[2rem] p-5 text-right">
                    <div className="text-slate-400 font-black text-xs mb-1">נסיעות שבועיות מצטברות</div>
                    <div className="text-3xl font-black text-slate-900">
                      {filteredTwins.reduce((s,t) => s + t.totalTrips, 0).toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-white border-2 border-slate-100 rounded-[2rem] p-5 text-right">
                    <div className="text-slate-400 font-black text-xs mb-1">חיסכון פוטנציאלי שבועי</div>
                    <div className="text-3xl font-black text-emerald-600">
                      ₪{filteredTwins.reduce((s,t) => s + t.potentialSavings, 0).toLocaleString()}
                    </div>
                  </div>
                </div>

                {filteredTwins.length === 0 ? (
                  <div className="bg-white border-2 border-slate-100 rounded-[2.5rem] p-16 text-center">
                    <div className="text-slate-400 font-black text-lg mb-2">לא נמצאו קווים תאומים בקריטריונים שנבחרו</div>
                    {(!lineCitiesMap || !lineCitiesMap.size) && (
                      <div className="text-slate-500 font-bold text-sm max-w-md mx-auto">זיהוי תאומים דורש גיליון תחנות בקובץ — לא נמצא גיליון כזה.</div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {filteredTwins.slice(0, visibleTwinCount).map((twin, i) => {
                      const isExpanded = expandedTwin === twin.cityPair;
                      return (
                        <div key={`twin-${twin.cityPair}-${i}`} className="vcard bg-white border-2 border-slate-100 rounded-[2.5rem] p-7 shadow-sm hover:border-purple-300 transition-all text-right">
                          <div className="flex items-start justify-between mb-5">
                            <div className="flex flex-col gap-2 items-start text-right">
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className={`px-4 py-1.5 rounded-full text-[11px] font-black border ${twin.score >= 85 ? "bg-purple-50 border-purple-200 text-purple-700" : twin.score >= 70 ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
                                  {twin.score >= 85 ? "תאומים מובהקים" : twin.score >= 70 ? "כמעט תאומים" : "חפיפה משמעותית"}
                                </div>
                                <div className="px-3 py-1.5 rounded-full text-[11px] font-black bg-slate-100 text-slate-600">
                                  {twin.lineCount} קווים
                                </div>
                                {twin.isCircular && (
                                  <div className="px-3 py-1.5 rounded-full text-[11px] font-black bg-cyan-50 border border-cyan-200 text-cyan-700 flex items-center gap-1">
                                    <span className="text-base leading-none">↻</span>
                                    מעגלי
                                  </div>
                                )}
                              </div>
                              <div className="text-slate-400 font-bold text-xs">{twin.district}</div>
                            </div>
                            <div className="bg-purple-600 text-white px-3 py-2 rounded-2xl font-black text-sm shadow-lg shrink-0 flex flex-col items-center min-w-[64px]">
                              <div className="text-[10px] opacity-80 leading-none">ציון</div>
                              <div className="text-2xl leading-none mt-0.5">{twin.score}</div>
                            </div>
                          </div>

                          {/* מקטע משותף */}
                          {twin.overlapCount > 0 && twin.overlapFrom ? (
                            <div className="bg-purple-50 border border-purple-200 rounded-2xl px-4 py-3 mb-4">
                              <div className="text-purple-500 font-black text-[10px] mb-1.5">מקטע משותף · {twin.overlapCount} תחנות</div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-black text-slate-900 text-sm">{twin.overlapFrom}</span>
                                <span className="text-purple-400 font-black">↔</span>
                                <span className="font-black text-slate-900 text-sm">{twin.overlapTo}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 mb-4 min-w-0">
                              {twin.isCircular ? (
                                <>
                                  <div className="text-cyan-600 text-xl font-black shrink-0">↻</div>
                                  <div className="text-slate-900 font-black text-lg truncate">{twin.cityA}</div>
                                  <div className="text-slate-400 font-bold text-xs">(מעגלי)</div>
                                </>
                              ) : (
                                <>
                                  <div className="text-slate-900 font-black text-lg truncate">{twin.cityA}</div>
                                  <div className="text-slate-300 text-xl font-black shrink-0">↔</div>
                                  <div className="text-slate-900 font-black text-lg truncate">{twin.cityB}</div>
                                </>
                              )}
                            </div>
                          )}

                          {/* שורות קווים עם מסלול מלא */}
                          <div className="space-y-2 mb-5">
                            {twin.lines.map((l, j) => (
                              <div key={`twin-line-${j}`} className={`rounded-2xl px-4 py-2.5 ${j === 0 ? "bg-slate-900" : "bg-slate-50 border border-slate-200"}`}>
                                <div className="flex items-center gap-3">
                                  <div className={`font-black text-sm shrink-0 w-8 text-center ${j === 0 ? "text-white" : "text-slate-900"}`}>{l.lineNum}</div>
                                  <div className="flex-1 min-w-0">
                                    {l.mainOrigin && l.mainDest ? (
                                      <div className={`flex items-center gap-1.5 text-[12px] font-bold truncate ${j === 0 ? "text-slate-200" : "text-slate-600"}`}>
                                        <span className="truncate">{l.mainOrigin}</span>
                                        <span className={`shrink-0 ${j === 0 ? "text-slate-500" : "text-slate-300"}`}>→</span>
                                        <span className="truncate">{l.mainDest}</span>
                                      </div>
                                    ) : (
                                      <div className={`text-[12px] font-bold ${j === 0 ? "text-slate-300" : "text-slate-500"}`}>{twin.cityA} ↔ {twin.cityB}</div>
                                    )}
                                  </div>
                                  <div className={`text-[11px] font-bold shrink-0 text-left ${j === 0 ? "text-slate-400" : "text-slate-400"}`}>
                                    {l.tripCount} נסיעות · ~{l.avgRiders} נוסעים
                                  </div>
                                </div>
                                {l.directTwins && l.directTwins.length > 0 && (
                                  <div className={`mt-1.5 pr-11 text-[11px] font-bold ${j === 0 ? "text-slate-400" : "text-purple-600"}`}>
                                    קו {l.lineNum} תאום עם קווים: {l.directTwins.join(', ')}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                            <div className="bg-purple-50 rounded-2xl p-3 text-right">
                              <div className="text-purple-500 font-black text-[10px]">דמיון מסלול</div>
                              <div className="text-lg font-black text-purple-700">{twin.avgSimilarity}%</div>
                            </div>
                            <div className="bg-slate-50 rounded-2xl p-3 text-right">
                              <div className="text-slate-400 font-black text-[10px]">חפיפת שעות</div>
                              <div className="text-lg font-black text-slate-900">{twin.timeOverlapPct}%</div>
                            </div>
                            <div className="bg-slate-50 rounded-2xl p-3 text-right">
                              <div className="text-slate-400 font-black text-[10px]">תפוסה מצטברת</div>
                              <div className="text-lg font-black text-slate-900">{twin.utilization}%</div>
                            </div>
                            <div className="bg-emerald-50 rounded-2xl p-3 text-right">
                              <div className="text-emerald-600 font-black text-[10px]">חיסכון שבועי</div>
                              <div className="text-lg font-black text-emerald-700">₪{twin.potentialSavings.toLocaleString()}</div>
                            </div>
                          </div>

                          {twin.commonCities && twin.commonCities.length > 0 && (
                            <div className="bg-slate-50 rounded-2xl p-3 mb-3">
                              <div className="text-slate-400 font-black text-[10px] mb-1.5">תחנות משותפות ({twin.commonCityCount})</div>
                              <div className="flex flex-wrap gap-1.5">
                                {twin.commonCities.map((c, k) => (
                                  <span key={`cc-${k}`} className="bg-white border border-slate-200 text-slate-700 px-2.5 py-1 rounded-full text-[11px] font-bold">{c}</span>
                                ))}
                                {twin.commonCityCount > twin.commonCities.length && (
                                  <span className="text-slate-400 px-2.5 py-1 text-[11px] font-bold">+ {twin.commonCityCount - twin.commonCities.length} עוד</span>
                                )}
                              </div>
                            </div>
                          )}


                          {isExpanded && (
                            <div className="border-t-2 border-slate-100 pt-4 mt-4 space-y-2">
                              <div className="text-slate-500 font-black text-xs mb-2">פירוט קווים</div>
                              {twin.lines.map((l, j) => (
                                <div key={`twin-detail-${j}`} className="flex items-center justify-between gap-3 bg-slate-50 rounded-2xl px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <div className="bg-slate-900 text-white w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm">{l.lineNum}</div>
                                    <div className="text-right">
                                      <div className="text-slate-900 font-black text-sm">
                                        {l.lineType || "—"}
                                        {l.directionCount > 1 && <span className="text-slate-400 font-bold text-[10px] mr-2">({l.directionCount} כיוונים)</span>}
                                      </div>
                                      <div className="text-slate-400 font-bold text-[11px]">מק"ט {l.makat || "—"}</div>
                                    </div>
                                  </div>
                                  <div className="flex gap-4 text-right">
                                    <div>
                                      <div className="text-slate-400 font-black text-[10px]">נסיעות</div>
                                      <div className="text-sm font-black text-slate-900">{l.tripCount}</div>
                                    </div>
                                    <div>
                                      <div className="text-slate-400 font-black text-[10px]">ממוצע</div>
                                      <div className="text-sm font-black text-slate-900">{l.avgRiders}</div>
                                    </div>
                                    <div>
                                      <div className="text-slate-400 font-black text-[10px]">ק"מ/שבוע</div>
                                      <div className="text-sm font-black text-slate-900">{l.weeklyKm.toLocaleString()}</div>
                                    </div>
                                    {l.costPerRider > 0 && (
                                      <div>
                                        <div className="text-slate-400 font-black text-[10px]">₪/נוסע</div>
                                        <div className="text-sm font-black text-slate-900">{l.costPerRider}</div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          <button
                            onClick={() => setExpandedTwin(isExpanded ? null : twin.cityPair)}
                            className="w-full mt-2 py-2.5 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-black text-sm transition-colors"
                          >
                            {isExpanded ? "הסתר פירוט" : "הצג פירוט קווים"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {filteredTwins.length > visibleTwinCount && (
                  <div className="text-center">
                    <button
                      onClick={() => setVisibleTwinCount(c => c + 30)}
                      className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black shadow-lg hover:bg-slate-700 transition-colors"
                    >
                      הצג עוד 30 ({filteredTwins.length - visibleTwinCount} נוספים)
                    </button>
                  </div>
                )}
              </div>
            )}

            {tab === "areas" && (
              <div className="space-y-8 transition-opacity duration-300 opacity-100">
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col xl:flex-row justify-between items-center gap-4">
                  <div>
                    <h2 className="text-2xl font-black text-slate-900">האזורים הכי לא יעילים</h2>
                    <p className="text-slate-500 font-bold">ריכוז של הקווים המיותרים לחלוטין ונסיעות הסרק לפי ערים או מחוזות</p>
                  </div>
                  <div className="flex flex-col md:flex-row gap-3 relative w-full xl:w-auto">
                    <div className="flex bg-slate-100 p-1 rounded-2xl shadow-inner">
                       <button onClick={() => setAreaViewMode('city')} className={`px-6 py-2.5 rounded-xl font-black text-sm transition-all ${areaViewMode === 'city' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>לפי עיר</button>
                       <button onClick={() => setAreaViewMode('district')} className={`px-6 py-2.5 rounded-xl font-black text-sm transition-all ${areaViewMode === 'district' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>לפי מחוז</button>
                    </div>
                    <select
                      value={areaSortBy}
                      onChange={e => setAreaSortBy(e.target.value)}
                      className="bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 font-black outline-none focus:border-slate-900 text-right shadow-sm w-full md:w-48 appearance-none cursor-pointer"
                    >
                      <option value="wastedKm">מיון: ק&quot;מ מבוזבז (מומלץ)</option>
                      <option value="score">מיון: מדד חומרה אזורי</option>
                      <option value="lineCount">מיון: כמות קווים מיותרים</option>
                      <option value="avgRiders">מיון: ממוצע נוסעים (נמוך לגבוה)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {areaStats.map((area, i) => (
                     <div key={i} className="bg-white border-2 border-slate-100 rounded-[2.5rem] p-7 shadow-sm hover:border-amber-400 transition-all text-right flex flex-col group relative">
                        <div className="flex justify-between items-start mb-6">
                           <div className={`px-4 py-1.5 rounded-full text-[11px] font-black border ${area.avgScore >= 80 ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>מדד חומרה: {area.avgScore}</div>
                           <div className="flex gap-2">
                             <button 
                               onClick={(e) => { e.stopPropagation(); exportAreaToExcel(area.name, areaViewMode); }}
                               className="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm transition-all"
                               title="ייצוא נתוני האזור לאקסל"
                             >
                               <Ic n="download" size={20} />
                             </button>
                           </div>
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 mb-4">{area.name}</h3>
                        <div className="space-y-3 pt-4 border-t border-slate-100 text-sm mb-5">
                           <div className="flex justify-between"><span className="text-slate-600 font-bold">קווים מיותרים באזור</span><span className="font-black text-slate-900">{area.lineCount} קווים</span></div>
                           <div className="flex justify-between"><span className="text-slate-600 font-bold">סה&quot;כ נסיעות בשבוע</span><span className="font-black text-slate-900">{area.totalTrips.toLocaleString()}</span></div>
                           <div className="flex justify-between"><span className="text-slate-600 font-bold">ממוצע נוסעים בנסיעה</span><span className="font-black text-slate-900">{area.avgAreaRiders}</span></div>
                           <div className="flex justify-between"><span className="text-slate-600 font-bold">ק&quot;מ מבוזבז (סה&quot;כ)</span><span className="font-black text-rose-600">{area.wastedKm.toLocaleString()} ק&quot;מ</span></div>
                           <div className="flex justify-between"><span className="text-slate-600 font-bold">עלות תפעולית ממוצעת</span><span className="font-black text-slate-900">{area.avgCost > 0 ? `₪${area.avgCost.toFixed(2)}` : 'לא זמין'}</span></div>
                        </div>
                        <button onClick={() => handleViewAreaLines(area.name)} className="mt-auto w-full py-4 bg-slate-900 text-white rounded-2xl text-xs font-black hover:bg-black transition-all shadow-md">צפה בקווים אלו</button>
                     </div>
                  ))}
                  {areaStats.length === 0 && (
                     <div className="col-span-full text-center py-20 text-slate-400 font-bold">לא נמצאו אזורים תואמים לסינון.</div>
                  )}
                </div>
              </div>
            )}

            {tab === "allTrips" && (
              <div className="bg-white p-6 md:p-8 rounded-[3rem] border border-slate-200 shadow-sm transition-opacity duration-300 opacity-100">
                <header className="mb-8 flex flex-col md:flex-row justify-between items-center gap-6">
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 mb-2">כל הנסיעות במערכת</h2>
                    <p className="text-slate-500 font-bold text-sm">סנן לפי עיר ומצא נסיעות עמוסות.</p>
                  </div>
                  <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                    <label className="flex items-center gap-3 bg-rose-50/50 border-2 border-rose-100 text-rose-800 px-4 py-3 rounded-2xl cursor-pointer hover:bg-rose-50 transition-colors w-full md:w-auto font-black text-sm">
                      <input type="checkbox" checked={showCrowded} onChange={e => setShowCrowded(e.target.checked)} className="w-5 h-5 accent-rose-600 rounded" />
                      הצג רק נסיעות עמוסות
                    </label>
                    <div className="flex relative w-full md:w-auto">
                      <SearchInput
                        value={searchCity} 
                        onSubmit={setSearchCity} 
                        placeholder="חיפוש עיר (מוצא או יעד) — Enter"
                        className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 pl-12 font-black outline-none focus:border-slate-900 text-right shadow-sm"
                      />
                    </div>
                  </div>
                </header>
                
                <div className="overflow-x-auto rounded-[2rem] border-2 border-slate-100 max-h-[60vh] pb-32">
                  <table className="w-full text-right border-collapse">
                    <thead className="sticky top-0 bg-slate-50 shadow-sm z-20" ref={tooltipRef}>
                      <tr className="text-slate-400 text-xs font-black uppercase">
                        <th className="p-5">מס&apos; קו</th>
                        <th className="p-5">מוצא</th>
                        <th className="p-5">יעד</th>
                        <th className="p-5">שעה</th>
                        <th className="p-5 relative">
                          <div className="flex items-center gap-1.5">
                            <span>נוסעים (יעילות)</span>
                            <button onClick={() => setActiveTooltip(activeTooltip === 'ridership' ? null : 'ridership')} className="text-slate-400 hover:text-indigo-600 transition-colors">
                              <Ic n="info" size={14} />
                            </button>
                            <div className="flex flex-col -space-y-1.5 mr-2">
                              <button onClick={() => setSortConfig({key: 'ridership', direction: 'desc'})} className={`${sortConfig.key === 'ridership' && sortConfig.direction === 'desc' ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-500'}`}><Ic n="chevronUp" size={12} strokeWidth="3" /></button>
                              <button onClick={() => setSortConfig({key: 'ridership', direction: 'asc'})} className={`${sortConfig.key === 'ridership' && sortConfig.direction === 'asc' ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-500'}`}><Ic n="chevronDown" size={12} strokeWidth="3" /></button>
                            </div>
                          </div>
                          {activeTooltip === 'ridership' && (
                            <div className="absolute z-30 top-full right-0 mt-2 w-64 p-3 bg-slate-800 text-white text-xs rounded-xl shadow-xl font-normal normal-case text-right leading-relaxed border border-slate-700">
                              <strong className="block mb-1 text-indigo-300">נוסעים (יעילות):</strong> סך כל האנשים שעלו על האוטובוס לאורך כל המסלול. מדד היעילות בסוגריים מחושב ביחס לקיבולת האוטובוס הספציפי שהוגדר (מיניבוס, מידיבוס, אוטובוס רגיל או מפרקי).
                            </div>
                          )}
                        </th>
                        <th className="p-5 relative">
                          <div className="flex items-center gap-1.5">
                            <span>עומס שיא</span>
                            <button onClick={() => setActiveTooltip(activeTooltip === 'peakLoad' ? null : 'peakLoad')} className="text-slate-400 hover:text-indigo-600 transition-colors">
                              <Ic n="info" size={14} />
                            </button>
                            <div className="flex flex-col -space-y-1.5 mr-2">
                              <button onClick={() => setSortConfig({key: 'peakLoad', direction: 'desc'})} className={`${sortConfig.key === 'peakLoad' && sortConfig.direction === 'desc' ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-500'}`}><Ic n="chevronUp" size={12} strokeWidth="3" /></button>
                              <button onClick={() => setSortConfig({key: 'peakLoad', direction: 'asc'})} className={`${sortConfig.key === 'peakLoad' && sortConfig.direction === 'asc' ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-500'}`}><Ic n="chevronDown" size={12} strokeWidth="3" /></button>
                            </div>
                          </div>
                          {activeTooltip === 'peakLoad' && (
                            <div className="absolute z-30 top-full left-0 mt-2 w-64 p-3 bg-slate-800 text-white text-xs rounded-xl shadow-xl font-normal normal-case text-right leading-relaxed border border-slate-700">
                              <strong className="block mb-1 text-indigo-300">עומס שיא:</strong> המספר המקסימלי של נוסעים שהיו בתוך האוטובוס בו-זמנית בנקודה העמוסה ביותר במסלול שלו.
                            </div>
                          )}
                        </th>
                        <th className="p-5 relative">
                          <div className="flex items-center gap-2">
                            <span>סוג</span>
                            <div className="relative inline-block">
                              <select
                                value={filterLineType}
                                onChange={e => setFilterLineType(e.target.value)}
                                className="appearance-none bg-slate-100 border border-slate-200 text-slate-600 rounded-md pl-6 pr-2 py-1 text-[10px] font-black outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer hover:bg-slate-200 transition-colors"
                              >
                                <option value="all">הכל</option>
                                {allLineTypes.map(t => <option key={`type-${t}`} value={t}>{t}</option>)}
                              </select>
                              <div className="absolute left-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                <Ic n="chevronDown" size={10} strokeWidth="3" />
                              </div>
                            </div>
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="text-sm font-bold text-slate-700">
                      {tableTrips.slice(0, visibleTripsCount).map((t, i) => (
                        <tr key={`trip-${t.id || i}`} className="vrow border-t border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="p-5 font-black">
                            <div className="flex flex-col items-start gap-1 relative">
                              <div className="flex items-center gap-2 justify-start">
                                {t.isNightLine && (
                                  <span className="text-indigo-400 bg-indigo-50 p-1 rounded-full" title="קו לילה">
                                    <Ic n="moon" size={16} />
                                  </span>
                                )}
                                {renderPrebookedInfo('trip-'+i, t.isEilatPrebooked)}
                                {renderFeedingLineInfo('trip-'+i, t.isFeedingLine)}
                                <span className="bg-slate-900 text-white px-3 py-1.5 rounded-xl">{t.lineNum}</span>
                              </div>
                              {(() => {
                                if (!searchCity) return null;
                                const sCity = searchCity.toLowerCase();
                                const isOriginDest = t.origin.toLowerCase().includes(sCity) || t.dest.toLowerCase().includes(sCity);
                                if (isOriginDest) return null;

                                const cleanMakat = String(t.makat || '').replace(/^0+/, '').trim();
                                const cleanLine = String(t.lineNum || '').replace(/^0+/, '').trim();
                                const citiesSet = lineCitiesMap.get(cleanMakat) || lineCitiesMap.get(cleanLine);
                                
                                if (!citiesSet) return null;
                                
                                const matchedCity = Array.from(citiesSet).find(c => c.includes(sCity));
                                if (!matchedCity) return null;

                                return (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 whitespace-nowrap shrink-0">
                                    עובר דרך: {matchedCity}
                                  </span>
                                );
                              })()}
                            </div>
                          </td>
                          <td className="p-5">{t.origin}</td>
                          <td className="p-5">{t.dest}</td>
                          <td className="p-5 font-black">{t.time}</td>
                          <td className={`p-5 flex items-center gap-2 ${t.ridership >= (t.capacity * 0.8) ? 'text-rose-600 font-black' : ''}`}>
                            {t.ridership} 
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${t.efficiency > 0.5 ? 'bg-emerald-100 text-emerald-700' : t.efficiency > 0.2 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`} title={`רכב: ${t.busSize} (קיבולת: ${t.capacity})`}>
                              {t.efficiency}
                            </span>
                          </td>
                          <td className={`p-5 ${t.peakLoad >= (t.capacity * 0.8) ? 'text-rose-600 font-black' : ''}`}>{t.peakLoad}</td>
                          <td className="p-5 text-slate-500 text-xs">{t.lineType}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {tableTrips.length > visibleTripsCount && (
                    <div className="text-center py-6 bg-slate-50 border-t border-slate-100">
                      <button
                        onClick={() => setVisibleTripsCount(prev => prev + 300)}
                        className="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-black py-2.5 px-6 rounded-xl transition-all shadow-sm text-sm"
                      >
                        הצג עוד תוצאות ({visibleTripsCount} מתוך {tableTrips.length.toLocaleString()})
                      </button>
                    </div>
                  )}
                  {tableTrips.length <= visibleTripsCount && tableTrips.length > 0 && (
                    <div className="text-center py-4 text-xs font-bold text-slate-400 bg-slate-50 border-t border-slate-100">
                      הוצגו כל {tableTrips.length.toLocaleString()} התוצאות.
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === "simulator" && (
              <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm max-w-4xl mx-auto transition-opacity duration-300 opacity-100">
                <header className="mb-8">
                  <h2 className="text-2xl font-black text-slate-900 mb-2">אלגוריתם ייעול ושיפור לוחות זמנים</h2>
                  <p className="text-slate-500 font-bold text-sm leading-relaxed">
                    המערכת מזהה אוטומטית את סוג השירות (עירוני/אזורי/בינעירוני) ואת <strong>גודל הרכב</strong> (מפרקי, מיניבוס וכו&apos;), ומתאימה את רף הביטול וחוקי האיחוד באופן דינמי לכל נסיעה.
                  </p>
                </header>
                
                <div className="bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 mb-8 shadow-inner">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div>
                      <label className="block text-xs font-[900] text-slate-400 mb-3 pr-2 uppercase tracking-wider">מספר קו / מק&quot;ט</label>
                      <input
                        type="text"
                        value={optLine}
                        onChange={e => setOptLine(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && optLine.trim() !== '' && !optLine.trim().endsWith(',')) {
                            e.preventDefault();
                            setOptLine(prev => prev.trim() + ', ');
                          }
                        }}
                        placeholder="למשל 1, 150..."
                        className="w-full bg-white border-2 border-slate-200 rounded-2xl px-5 py-3 font-black text-sm outline-none focus:border-slate-900 shadow-sm transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-[900] text-slate-400 mb-3 pr-2 uppercase tracking-wider">עיר (מוצא או יעד)</label>
                      <input 
                        type="text" 
                        list="cities-list"
                        value={optCity === "all" ? "" : optCity} 
                        onChange={e => setOptCity(e.target.value || "all")} 
                        placeholder="הקלד שם עיר..."
                        className="w-full bg-white border-2 border-slate-200 rounded-2xl px-5 py-3 font-black outline-none focus:border-slate-900 text-right transition-all shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-[900] text-slate-400 mb-3 pr-2 uppercase tracking-wider">כיוון נסיעה</label>
                      <select value={optDirection} onChange={e => setOptDirection(e.target.value)} className="w-full bg-white border-2 border-slate-200 rounded-2xl px-5 py-3 font-black outline-none focus:border-slate-900 cursor-pointer text-right shadow-sm appearance-none">
                        <option value="all">כל הכיוונים</option>
                        {allDirections.map(d => <option key={`dir-${d}`} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="mb-8">
                    <label className="block text-xs font-[900] text-slate-400 mb-4 pr-2 uppercase tracking-wider">ימי פעילות (סינון מרובה)</label>
                    <div className="flex flex-wrap gap-3">
                      <button 
                        onClick={() => setOptDays([])} 
                        className={`px-5 py-2.5 rounded-2xl text-sm font-black transition-all border-2 ${optDays.length === 0 ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'}`}
                      >
                        כל הימים
                      </button>
                      {DAYS_FILTER.map(d => (
                        <button 
                          key={`day-${d.id}`} 
                          onClick={() => toggleDay(d.id)} 
                          className={`px-5 py-2.5 rounded-2xl text-sm font-black transition-all border-2 ${optDays.includes(d.id) ? 'bg-teal-600 text-white border-teal-600 shadow-md' : 'bg-white border-slate-200 text-slate-500 hover:border-teal-600'}`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-slate-200 pt-6 mb-2">
                    <button
                      onClick={() => setShowAdvanced(prev => !prev)}
                      className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-slate-900 transition-colors bg-slate-200/50 px-4 py-2 rounded-xl"
                    >
                      <Ic n="settings" size={14} />
                      הגדרות אלגוריתם מתקדמות
                      <Ic n={showAdvanced ? "chevronUp" : "chevronDown"} size={14} />
                    </button>

                    {showAdvanced && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-6 p-6 bg-white rounded-3xl border border-slate-200 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="space-y-2">
                          <label className="block text-[11px] font-black text-slate-400 uppercase pr-1">מדד לניתוח</label>
                          <select value={optMetric} onChange={e => setOptMetric(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-black text-sm outline-none focus:border-teal-600 cursor-pointer text-right transition-all">
                            <option value="ridership">נוסעים בפועל</option>
                            <option value="peakLoad">עומס שיא</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="block text-[11px] font-black text-slate-400 uppercase pr-1">מרווח איחוד (דק&apos;)</label>
                          <input
                            type="number"
                            value={optCustomGap}
                            onChange={e => setOptCustomGap(e.target.value)}
                            placeholder="לפי סוג קו"
                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-black text-sm outline-none focus:border-slate-900 text-right transition-all"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="block text-[11px] font-black text-slate-400 uppercase pr-1">מינימום נסיעות ביום</label>
                          <input
                            type="number"
                            value={optMinTrips}
                            onChange={e => setOptMinTrips(e.target.value)}
                            placeholder="3 נסיעות"
                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-black text-sm outline-none focus:border-slate-900 text-right transition-all"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="block text-[11px] font-black text-slate-400 uppercase pr-1">רף נוסעים לביטול</label>
                          <input
                            type="number"
                            value={optCancelThreshold}
                            onChange={e => setOptCancelThreshold(e.target.value)}
                            placeholder="מתחת ל-5"
                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-black text-sm outline-none focus:border-slate-900 text-right transition-all"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-4 pt-8 border-t border-slate-200 mt-6">
                    <button
                      onClick={() => runOptimization()}
                      className="bg-slate-900 hover:bg-black text-white px-10 py-4 rounded-2xl font-black transition-all shadow-lg active:scale-95 flex items-center gap-3 disabled:opacity-60"
                    >
                      {simLoading ? <Ic n="loader" size={20} animate /> : <Ic n="zap" size={20} />}
                      הרץ אלגוריתם
                    </button>

                    {optimizations.length > 0 && (
                      <button onClick={exportOptimizationsToExcel} className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-2xl font-black text-sm transition-all shadow-lg flex items-center gap-3">
                        <Ic n="download" size={18} />
                        ייצוא לאקסל
                      </button>
                    )}
                  </div>
                </div>

                {optimizations.length > 0 && (
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4 border-b border-slate-200 pb-4">
                    <div>
                      <h3 className="text-xl font-black text-slate-900">תוצאות הייעול</h3>
                      <p className="text-slate-500 text-sm font-bold">
                        נמצאו {optimizations.filter(o => o.type !== 'ok').length} המלצות לשינויים בלוח הזמנים
                      </p>
                    </div>
                    <label className="flex items-center gap-2 bg-slate-100 px-4 py-2.5 rounded-xl cursor-pointer hover:bg-slate-200 transition-colors">
                      <input 
                        type="checkbox" 
                        checked={showAllTripsInSimulator} 
                        onChange={(e) => setShowAllTripsInSimulator(e.target.checked)}
                        className="w-4 h-4 accent-indigo-600 rounded"
                      />
                      <span className="text-sm font-bold text-slate-700">הצג את כל נסיעות הקו (כולל תקינות)</span>
                    </label>
                  </div>
                )}

                <div className="space-y-4">
                  {!simLoading && optimizations.length > 0 ? (() => {
                    const optsToRender = showAllTripsInSimulator
                      ? optimizations
                      : optimizations.filter(o => o.type !== 'ok');
                    return (
                      <>
                        {optsToRender.slice(0, visibleOptCount).map((opt, i) => (
                    opt.type === 'merge' ? (
                      <div key={`opt-${i}`} className="bg-white border-2 border-slate-50 p-6 rounded-[2rem] flex flex-col lg:flex-row lg:items-center justify-between gap-6 hover:shadow-lg transition-all border-r-4 border-r-indigo-500">
                        <div className="flex items-start gap-4">
                          <div className="bg-indigo-50 text-indigo-600 p-3.5 rounded-2xl mt-1"><Ic n="calendar" size={24} /></div>
                          <div>
                            <div className="flex items-center gap-2 mb-1.5">
                              <div className="flex items-center gap-2">
                                <span className="font-black text-slate-900 text-lg">קו {opt.line}</span>
                                {opt.isNightLine && (
                                  <span className="text-indigo-400 bg-indigo-50 p-1 rounded-full" title="קו לילה">
                                    <Ic n="moon" size={16} />
                                  </span>
                                )}
                                {renderPrebookedInfo('sim-'+i, opt.isEilatPrebooked)}
                                {renderFeedingLineInfo('feed-'+i, opt.isFeedingLine)}
                              </div>
                              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold">{opt.categoryLabel}</span>
                            </div>
                            <div className="text-sm font-bold text-slate-500 mb-3">{opt.origin} ← {opt.dest}</div>
                            <div className="flex flex-wrap gap-2">
                              <span className="text-[11px] font-black bg-slate-100 text-slate-500 px-2 py-1 rounded-md">יום {opt.days}</span>
                              {renderTransitChip(opt.origin, opt.dest)}
                              <span className="text-[11px] font-black bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md">מומלצת לאיחוד</span>
                              <span className="text-[11px] font-black bg-sky-100 text-sky-700 px-2 py-1 rounded-md">כיוון {opt.direction}</span>
                              <span className="text-[11px] font-black bg-purple-100 text-purple-700 px-2 py-1 rounded-md">{opt.busSize}</span>
                            </div>
                          </div>
                        </div>
                        <div className="bg-slate-50/80 px-6 py-4 rounded-2xl flex-1 max-w-md w-full">
                          <div className="flex justify-between items-center mb-3 text-sm">
                            <span className="font-bold text-slate-500">נסיעות נוכחיות:</span>
                            <span className="font-black text-slate-700">{opt.from} ו-{opt.to} <span className="text-xs text-slate-400 font-normal">({opt.gap} דק&apos; הפרש)</span></span>
                          </div>
                          <div className="flex justify-between items-center mb-4 text-sm">
                            <span className="font-bold text-slate-500">{opt.usedMetric === 'peakLoad' ? 'עומס שיא מצטבר:' : 'נוסעים מצטבר:'}</span>
                            <span className="font-black text-slate-700">
                              {opt.total} <span className="text-xs text-slate-400 font-normal mr-1">({opt.val1} בנסיעה ה-1, {opt.val2} בנסיעה ה-2)</span>
                            </span>
                          </div>
                          <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                            <span className="font-black text-indigo-700">שעה מומלצת לאיחוד:</span>
                            <span className="font-black text-2xl text-indigo-600 bg-white px-3 py-1 rounded-xl shadow-sm">{opt.suggestedTime}</span>
                          </div>
                        </div>
                      </div>
                    ) : opt.type === 'cancel' ? (
                      <div key={`opt-${i}`} className={`bg-white border-2 border-slate-50 p-6 rounded-[2rem] flex flex-col lg:flex-row lg:items-center justify-between gap-6 hover:shadow-lg transition-all border-r-4 border-r-rose-500`}>
                        <div className="flex items-start gap-4">
                          <div className={`bg-rose-50 text-rose-600 p-3.5 rounded-2xl mt-1`}><Ic n="alert" size={24} /></div>
                          <div>
                            <div className="flex items-center gap-2 mb-1.5">
                              <div className="flex items-center gap-2">
                                <span className="font-black text-slate-900 text-lg">קו {opt.line}</span>
                                {opt.isNightLine && (
                                  <span className="text-indigo-400 bg-indigo-50 p-1 rounded-full" title="קו לילה">
                                    <Ic n="moon" size={16} />
                                  </span>
                                )}
                                {renderPrebookedInfo('sim-'+i, opt.isEilatPrebooked)}
                                {renderFeedingLineInfo('feed-'+i, opt.isFeedingLine)}
                              </div>
                              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold">{opt.categoryLabel}</span>
                            </div>
                            <div className="text-sm font-bold text-slate-500 mb-3">{opt.origin} ← {opt.dest}</div>
                            <div className="flex flex-wrap gap-2">
                              <span className="text-[11px] font-black bg-slate-100 text-slate-500 px-2 py-1 rounded-md">יום {opt.days}</span>
                              {renderTransitChip(opt.origin, opt.dest)}
                              <span className={`text-[11px] font-black px-2 py-1 rounded-md bg-rose-100 text-rose-700`}>
                                חשד לנסיעה מיותרת
                              </span>
                              <span className="text-[11px] font-black bg-sky-100 text-sky-700 px-2 py-1 rounded-md">כיוון {opt.direction}</span>
                              <span className="text-[11px] font-black bg-purple-100 text-purple-700 px-2 py-1 rounded-md">{opt.busSize}</span>
                            </div>
                          </div>
                        </div>
                        <div className="bg-slate-50/80 px-6 py-4 rounded-2xl flex-1 max-w-md w-full">
                          <div className="flex justify-between items-center mb-3 text-sm">
                            <span className="font-bold text-slate-500">שעת הנסיעה:</span>
                            <span className={`font-black text-2xl text-rose-600`}>{opt.time}</span>
                          </div>
                          <div className="flex justify-between items-center mb-3 text-sm">
                            <span className="font-bold text-slate-500">{opt.usedMetric === 'peakLoad' ? 'עומס שיא:' : 'נוסעים בפועל:'}</span>
                            <span className="font-black text-slate-700">{opt.metricVal}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm pt-3 border-t border-slate-200">
                            <span className="font-bold text-slate-500">ציון יעילות:</span>
                            <span className={`font-black text-rose-600`}>{opt.efficiency}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div key={`opt-${i}`} className="bg-slate-50/50 border-2 border-slate-100 p-6 rounded-[2rem] flex flex-col lg:flex-row lg:items-center justify-between gap-6 opacity-70 hover:opacity-100 transition-all">
                        <div className="flex items-start gap-4">
                          <div className="bg-slate-200 text-slate-500 p-3.5 rounded-2xl mt-1"><Ic n="list" size={24} /></div>
                          <div>
                            <div className="flex items-center gap-2 mb-1.5">
                              <div className="flex items-center gap-2">
                                <span className="font-black text-slate-700 text-lg">קו {opt.line}</span>
                                {opt.isNightLine && (
                                  <span className="text-indigo-400 bg-indigo-50 p-1 rounded-full" title="קו לילה">
                                    <Ic n="moon" size={16} />
                                  </span>
                                )}
                                {renderPrebookedInfo('sim-ok-'+i, opt.isEilatPrebooked)}
                                {renderFeedingLineInfo('feed-ok-'+i, opt.isFeedingLine)}
                              </div>
                              <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-bold">{opt.categoryLabel}</span>
                            </div>
                            <div className="text-sm font-bold text-slate-500 mb-3">{opt.origin} ← {opt.dest}</div>
                            <div className="flex flex-wrap gap-2">
                              <span className="text-[11px] font-black bg-slate-200 text-slate-600 px-2 py-1 rounded-md">יום {opt.days}</span>
                              {renderTransitChip(opt.origin, opt.dest)}
                              <span className="text-[11px] font-black bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md">נסיעה תקינה (ללא שינוי)</span>
                              <span className="text-[11px] font-black bg-sky-100 text-sky-700 px-2 py-1 rounded-md">כיוון {opt.direction}</span>
                              <span className="text-[11px] font-black bg-purple-100 text-purple-700 px-2 py-1 rounded-md">{opt.busSize}</span>
                            </div>
                          </div>
                        </div>
                        <div className="bg-white border border-slate-200 px-6 py-4 rounded-2xl flex-1 max-w-md w-full">
                           <div className="flex justify-between items-center mb-3 text-sm">
                            <span className="font-bold text-slate-500">שעת הנסיעה:</span>
                            <span className="font-black text-xl text-slate-700">{opt.time}</span>
                          </div>
                          <div className="flex justify-between items-center mb-1 text-sm">
                            <span className="font-bold text-slate-500">{opt.usedMetric === 'peakLoad' ? 'עומס שיא:' : 'נוסעים בפועל:'}</span>
                            <span className="font-black text-slate-700">{opt.metricVal}</span>
                          </div>
                        </div>
                      </div>
                    )
                  ))}
                        {optsToRender.length > visibleOptCount && (
                          <div className="pt-4 text-center">
                            <button
                              onClick={() => setVisibleOptCount(prev => prev + 50)}
                              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-sm transition-all shadow-md flex items-center justify-center gap-2"
                            >
                              <Ic n="chevronDown" size={18} />
                              הצג עוד תוצאות
                              <span className="bg-indigo-500 text-white text-xs px-2.5 py-1 rounded-full font-black">
                                {visibleOptCount} / {optsToRender.length.toLocaleString()}
                              </span>
                            </button>
                          </div>
                        )}
                      </>
                    );
                  })() : !simLoading ? (
                    <div className="py-20 text-center bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
                      <div className="text-slate-300 font-black italic text-lg mb-2">לא נמצאו הזדמנויות ייעול לסינון המבוקש</div>
                      <p className="text-slate-400 text-sm font-bold px-10">נסה לשנות את הסינון או לבחור קו/עיר אחרים.</p>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {tab === "about" && (
              <div className="bg-white p-8 md:p-12 rounded-[3rem] border border-slate-200 shadow-sm max-w-4xl mx-auto transition-opacity duration-300 opacity-100">
                <header className="mb-10 text-center border-b border-slate-100 pb-8">
                  <h2 className="text-3xl font-black text-slate-900 mb-4">על המערכת ושיטות החישוב</h2>
                  <p className="text-slate-500 font-bold text-lg max-w-2xl mx-auto leading-relaxed">
                    מערכת &quot;קו פח&quot; פותחה ככלי עזר למתכנני תחבורה, במטרה לנתח נתוני אמת, לאתר חוסר יעילות ולשפר את לוחות הזמנים של האוטובוסים.
                  </p>
                </header>

                <div className="space-y-6">

                  {/* מה חדש בגרסה הנוכחית — תמיד בהתחלה */}
                  <section className="bg-gradient-to-bl from-indigo-50 to-white rounded-[2rem] p-6 border-2 border-indigo-200 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="bg-indigo-600 text-white text-xs font-black px-3 py-1 rounded-full">גרסה 3.2</span>
                      <h3 className="text-xl font-black text-indigo-700">מה חדש בעדכון הנוכחי</h3>
                    </div>
                    <div className="space-y-4 text-sm text-slate-700 leading-relaxed">

                      <div className="bg-white rounded-2xl p-4 border border-indigo-100">
                        <h4 className="font-black text-slate-900 mb-1.5 flex items-center gap-2">
                          <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md text-[10px]">ביצועים</span>
                          טעינה מיידית בכניסות חוזרות
                        </h4>
                        <p className="text-slate-600 mb-2">המערכת שומרת את הנתונים המעובדים בקאש מקומי בדפדפן. בכניסה הבאה, כל עוד קובץ המקור לא השתנה, הטעינה נמשכת פחות משנייה — בלי הורדה, בלי פרסור.</p>
                        <ul className="list-disc list-inside space-y-1 marker:text-emerald-400 pr-2 text-xs">
                          <li>HEAD request זריז בודק אם הקובץ השתנה — אם כן, הקאש מתעדכן אוטומטית.</li>
                          <li>הקאש פר-משתמש, נשמר ב-IndexedDB ולא פוגע בהגדרות הדפדפן.</li>
                        </ul>
                      </div>

                      <div className="bg-white rounded-2xl p-4 border border-indigo-100">
                        <h4 className="font-black text-slate-900 mb-1.5 flex items-center gap-2">
                          <span className="bg-sky-100 text-sky-700 px-2 py-0.5 rounded-md text-[10px]">שיפור</span>
                          חיפוש חלק וללא לאגים
                        </h4>
                        <p className="text-slate-600 mb-2">החיפוש שודרג כך שההקלדה והמחיקה מיידיות גם בנייד. הסינון מתבצע רק בהקשה על <strong>Enter</strong> או בלחיצה על ה-× כדי לנקות — בלי עיבוד מיותר ברקע בכל מקש.</p>
                        <ul className="list-disc list-inside space-y-1 marker:text-sky-400 pr-2 text-xs">
                          <li><strong>רינדור מותנה (content-visibility):</strong> הדפדפן מציג רק כרטיסים שעל המסך. גלילה ברשימות גדולות הפכה חלקה.</li>
                          <li>טעינת טבלה התחלתית קטנה משמעותית — הכפתור "טען עוד" עדיין זמין.</li>
                        </ul>
                      </div>

                      <div className="bg-white rounded-2xl p-4 border border-indigo-100">
                        <h4 className="font-black text-slate-900 mb-1.5 flex items-center gap-2">
                          <span className="bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-md text-[10px]">חדש</span>
                          זיהוי קווים מעגליים בתאומים
                        </h4>
                        <p className="text-slate-600">קווים שהמוצא והיעד שלהם זהים (מעגליים, בתוך עיר אחת) נכנסים עכשיו לחישוב התאומים — באג ידוע שמנע מקבוצות כאלה להופיע. כרטיס תאומים מעגלי מסומן בתווית <span dir="ltr" className="font-bold">↻ מעגלי</span>.</p>
                      </div>

                      <div className="bg-white rounded-2xl p-4 border border-indigo-100">
                        <h4 className="font-black text-slate-900 mb-1.5 flex items-center gap-2">
                          <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md text-[10px]">תיקון</span>
                          באגים שתוקנו
                        </h4>
                        <ul className="list-disc list-inside space-y-1 marker:text-slate-400 pr-2 text-xs">
                          <li><strong>טולטיפ "הזמנה מראש" בנייד:</strong> חרג מהמסך במכשירים צרים. עכשיו מעוגן לימין וברוחב מותאם.</li>
                          <li><strong>שאריות קוד מתצוגה:</strong> טקסט className הופיע בטעות מעל שדות החיפוש — נוקה.</li>
                        </ul>
                      </div>

                    </div>
                  </section>

                  <div className="border-t border-slate-100 pt-2">
                    <h3 className="text-2xl font-black text-slate-900 mb-2">איך המערכת עובדת</h3>
                    <p className="text-slate-500 font-medium text-sm">הסבר על כל אחד מ-5 הכלים: מה הוא מציג, איך החישוב עובד, ומתי כדאי להשתמש בו.</p>
                  </div>

                  {/* טאב: קווים מיותרים */}
                  <section className="bg-rose-50/40 rounded-[2rem] p-6 border border-rose-100">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="bg-rose-600 text-white p-2 rounded-xl"><Ic n="trash" size={18} /></div>
                      <h3 className="text-xl font-black text-rose-700">קווים לא יעילים</h3>
                    </div>
                    <p className="text-slate-700 font-medium text-sm mb-4 leading-relaxed">
                      <strong>מה הוא עושה:</strong> מדרג כל קו בסולם 0–100 לפי רמת אי-היעילות שלו, ומציג רק קווים עם ציון 25+. כל קו מקבל גם תווית סטטוס בולטת (חמור / לא יעיל / טעון בדיקה / סטייה קלה / תקין) וצבע מתאים.
                    </p>

                    <div className="bg-white rounded-2xl border border-rose-100 p-4 mb-3">
                      <h4 className="font-black text-slate-800 text-sm mb-2">שלב 1: סיווג ל-8 קטגוריות</h4>
                      <p className="text-slate-600 text-sm leading-relaxed mb-2">לפני שמחשבים ציון, הקו מסווג לאחת מ-8 הקטגוריות הרשמיות של משרד התחבורה — לפי שדה "ייחודיות", "קבוצת יעילות תפעולית", סוג שירות, אורך מסלול (סף 45 ק"מ) ותדירות שבועית (סף 600).</p>
                      <div className="flex flex-wrap gap-1.5 text-[11px] font-black">
                        <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-md">אזורי</span>
                        <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-md">בינעירוני ארוך</span>
                        <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-md">בינעירוני קצר</span>
                        <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-md">עירוני תדירות גבוהה</span>
                        <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-md">עירוני תדירות נמוכה</span>
                        <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-md">לילה</span>
                        <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-md">קווים מזינים</span>
                        <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-md">תלמידים</span>
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-rose-100 p-4 mb-3">
                      <h4 className="font-black text-slate-800 text-sm mb-2">שלב 2: ניקוד (0–100)</h4>
                      <p className="text-slate-600 text-sm leading-relaxed mb-2">ארבעה רכיבים, סף הנוסעים בכל אחד מהם מותאם לקטגוריה (5 לאזורי/לילה, 8 לקצר/מזין, 10 לארוך/תדירות נמוכה, 15 לתדירות גבוהה/תלמידים):</p>
                      <ul className="list-disc list-inside text-slate-600 text-sm space-y-1.5 pr-2">
                        <li><strong>נסיעות שפל (עד 30 נק&apos;):</strong> אחוז הנסיעות עם פחות נוסעים מסף הקטגוריה.</li>
                        <li><strong>קילומטר מבוזבז (עד 20 נק&apos;):</strong> משקלל אחוז ק&quot;מ סרק וכמות מוחלטת.</li>
                        <li><strong>עלות תפעולית לנוסע (עד 20 נק&apos;):</strong> יחס לבנצ&apos;מרק הקטגוריה (₪31.8 לאזורי, ₪9.4 לעירוני תדירות גבוהה, וכו&apos;).</li>
                        <li><strong>ממוצע נוסעים ועומס שיא (עד 30 נק&apos;):</strong> ביחס לקיבולת הרכב — מיניבוס (19), מידי (35), רגיל (50), מפרקי (90).</li>
                      </ul>
                    </div>

                    <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-4 mb-3">
                      <h4 className="font-black text-emerald-800 text-sm mb-2">שלב 3: הגנות (מופחתות מהציון)</h4>
                      <ul className="list-disc list-inside text-emerald-700 text-sm font-medium space-y-1 pr-2">
                        <li><strong>תחנות בלעדיות / יעד ייחודי (−15):</strong> הקו משרת תחנות שאין אליהן קו אחר.</li>
                        <li><strong>מותאם רכבת (−10):</strong> עמודת "ייחודיות" מציינת זאת במפורש.</li>
                        <li><strong>תלמידים בשעות בי&quot;ס (−10):</strong> 60%+ מהנסיעות ב-7:00–8:30 או 13:00–15:30.</li>
                      </ul>
                    </div>

                    <div className="bg-white rounded-2xl border border-rose-100 p-4">
                      <h4 className="font-black text-slate-800 text-sm mb-2">שלב 4: תיוג סטטוס</h4>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-[11px] font-black">
                        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl p-2 text-center">0–24 תקין</div>
                        <div className="bg-amber-50 border border-amber-200 text-amber-600 rounded-xl p-2 text-center">25–44 סטייה קלה</div>
                        <div className="bg-orange-50 border border-orange-200 text-orange-600 rounded-xl p-2 text-center">45–64 טעון בדיקה</div>
                        <div className="bg-rose-50 border border-rose-200 text-rose-600 rounded-xl p-2 text-center">65–79 לא יעיל</div>
                        <div className="bg-rose-100 border border-rose-300 text-rose-700 rounded-xl p-2 text-center">80+ חמור</div>
                      </div>
                    </div>
                  </section>

                  {/* טאב: קווים תאומים */}
                  <section className="bg-purple-50/40 rounded-[2rem] p-6 border border-purple-100">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="bg-purple-600 text-white p-2 rounded-xl"><Ic n="copy" size={18} /></div>
                      <h3 className="text-xl font-black text-purple-700">קווים תאומים</h3>
                    </div>
                    <p className="text-slate-700 font-medium text-sm mb-4 leading-relaxed">
                      <strong>מה הוא עושה:</strong> מאתר קבוצות קווים שעושים בעצם את אותו מסלול, ומציע אותם כמועמדים לאיחוד. לכל קבוצה מחושב חיסכון פוטנציאלי שבועי משוער.
                    </p>

                    <div className="bg-white rounded-2xl border border-purple-100 p-4 mb-3">
                      <h4 className="font-black text-slate-800 text-sm mb-2">איך מחושב הדמיון</h4>
                      <p className="text-slate-600 text-sm leading-relaxed mb-2">לכל קו נשמר סט התחנות הבודדות שלו (Stop_id). שני קווים נחשבים תאומים אם אחד משני המדדים עובר את סף 70%:</p>
                      <ul className="list-disc list-inside text-slate-600 text-sm space-y-1 pr-2">
                        <li><strong>Jaccard:</strong> תחנות משותפות חלקי איחוד התחנות — תופס קווים זהים לחלוטין.</li>
                        <li><strong>Overlap:</strong> תחנות משותפות חלקי התחנות של הקו הקצר — תופס מצב שקו קצר הוא תת-מסלול של קו ארוך.</li>
                      </ul>
                      <p className="text-slate-500 text-xs leading-relaxed mt-2">קווים מעגליים (מוצא = יעד) מושווים בנפרד זה לזה ומסומנים בתווית <span dir="ltr" className="font-bold">↻ מעגלי</span>.</p>
                    </div>

                    <div className="bg-white rounded-2xl border border-purple-100 p-4 mb-3">
                      <h4 className="font-black text-slate-800 text-sm mb-2">ציון התאומים (0–100)</h4>
                      <ul className="list-disc list-inside text-slate-600 text-sm space-y-1 pr-2">
                        <li><strong>דמיון מסלול (עד 50 נק&apos;):</strong> מתחיל לצבור רק מ-75% ומעלה.</li>
                        <li><strong>חפיפת שעות:</strong> מוצגת לידוע בלבד — אינה משפיעה על הניקוד.</li>
                        <li><strong>ניצולת נמוכה (עד 20 נק&apos;):</strong> קווים עמוסים אינם מועמדים לאיחוד.</li>
                        <li><strong>שני הקווים חלשים (5 נק&apos; בונוס):</strong> שניהם פחות מ-12 נוסעים בממוצע.</li>
                      </ul>
                    </div>

                    <div className="bg-white rounded-2xl border border-purple-100 p-4">
                      <h4 className="font-black text-slate-800 text-sm mb-2">3 רמות תאומים</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] font-black">
                        <div className="bg-purple-50 border border-purple-200 text-purple-700 rounded-xl p-2 text-center">85+ תאומים מובהקים</div>
                        <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-xl p-2 text-center">70+ כמעט תאומים</div>
                        <div className="bg-slate-50 border border-slate-200 text-slate-600 rounded-xl p-2 text-center">60+ חפיפה משמעותית</div>
                      </div>
                    </div>
                  </section>

                  {/* טאב: ניתוח אזורי */}
                  <section className="bg-amber-50/40 rounded-[2rem] p-6 border border-amber-100">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="bg-amber-600 text-white p-2 rounded-xl"><Ic n="chart" size={18} /></div>
                      <h3 className="text-xl font-black text-amber-700">ניתוח אזורי</h3>
                    </div>
                    <p className="text-slate-700 font-medium text-sm mb-4 leading-relaxed">
                      <strong>מה הוא עושה:</strong> מציג מפת חום אזורית של בעיות יעילות — לפי עיר או לפי מחוז. עוזר לזהות אזורים גיאוגרפיים עם ריכוז גבוה של קווים בעייתיים.
                    </p>
                    <div className="bg-white rounded-2xl border border-amber-100 p-4">
                      <h4 className="font-black text-slate-800 text-sm mb-2">איך החישוב עובד</h4>
                      <ul className="list-disc list-inside text-slate-600 text-sm space-y-1.5 pr-2">
                        <li>הניתוח מתייחס <strong>רק לקווים עם ציון 80+</strong> (סטטוס "חמור — דורש התערבות"), כדי לזקק את התמונה.</li>
                        <li>לכל עיר/מחוז נסכמים: מספר הקווים החמורים, סך הנסיעות, סך ק"מ מבוזבז, וממוצע עלות תפעולית.</li>
                        <li>לחיצה על אזור מעבירה ישירות לטאב "קווים לא יעילים" עם פילטר מתאים.</li>
                      </ul>
                    </div>
                  </section>

                  {/* טאב: כל הנסיעות */}
                  <section className="bg-indigo-50/40 rounded-[2rem] p-6 border border-indigo-100">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="bg-indigo-600 text-white p-2 rounded-xl"><Ic n="list" size={18} /></div>
                      <h3 className="text-xl font-black text-indigo-700">כל הנסיעות במערכת</h3>
                    </div>
                    <p className="text-slate-700 font-medium text-sm mb-4 leading-relaxed">
                      <strong>מה הוא עושה:</strong> טבלה מלאה של כל הנסיעות במערכת, עם אפשרות לסינון, חיפוש ומיון. שימושי לאיתור נקודתי של נסיעה ספציפית או לבחינת עומס בעיר מסוימת.
                    </p>
                    <div className="bg-white rounded-2xl border border-indigo-100 p-4">
                      <h4 className="font-black text-slate-800 text-sm mb-2">פילטרים זמינים</h4>
                      <ul className="list-disc list-inside text-slate-600 text-sm space-y-1.5 pr-2">
                        <li><strong>חיפוש עיר:</strong> מסנן נסיעות שעוברות דרך עיר מסוימת (מוצא, יעד, או דרך). הסינון מתבצע בהקשת Enter.</li>
                        <li><strong>נסיעות עמוסות:</strong> טוגל שמסנן רק נסיעות עם ניצולת מעל 80% מקיבולת הרכב.</li>
                        <li><strong>סוג קו:</strong> סינון לפי קטגוריית הקו (עירוני / בינעירוני / אזורי וכו&apos;).</li>
                        <li><strong>מיון:</strong> לפי נוסעים או עומס שיא — עולה או יורד.</li>
                      </ul>
                    </div>
                  </section>

                  {/* טאב: סימולטור */}
                  <section className="bg-slate-50 rounded-[2rem] p-6 border border-slate-200">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="bg-slate-900 text-white p-2 rounded-xl"><Ic n="zap" size={18} /></div>
                      <h3 className="text-xl font-black text-slate-900">אלגוריתם ייעול (סימולטור)</h3>
                    </div>
                    <p className="text-slate-700 font-medium text-sm mb-4 leading-relaxed">
                      <strong>מה הוא עושה:</strong> מקבל קו מסוים ומציג המלצות פעולה לכל נסיעה: <strong>איחוד</strong> שתי נסיעות צמודות, <strong>ביטול</strong> נסיעת סרק, או <strong>השארה</strong>. כל המלצה כוללת נימוק והשפעה צפויה.
                    </p>

                    <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-3">
                      <h4 className="font-black text-slate-800 text-sm mb-2">תנאי איחוד</h4>
                      <p className="text-slate-600 text-sm leading-relaxed mb-2">המערכת מחפשת נסיעות צמודות שניתן לאחד בלי לגרום לעומס. הסף הזמני:</p>
                      <ul className="list-disc list-inside text-slate-600 text-sm space-y-1 pr-2 mb-3">
                        <li><strong>עירוני:</strong> עד 30 דקות פער.</li>
                        <li><strong>בין-עירוני:</strong> עד שעה.</li>
                        <li><strong>אזורי:</strong> עד 3 שעות (או לפי זמן המתנה ידני).</li>
                      </ul>
                      <p className="text-slate-700 font-bold text-sm mb-1">סף סך נוסעים לאיחוד (מתאים לקיבולת הרכב):</p>
                      <ul className="list-none text-slate-600 text-sm space-y-1 pr-2">
                        <li>• <strong>מיניבוס (19):</strong> עד ~7 נוסעים יחד.</li>
                        <li>• <strong>מידיבוס (35):</strong> עד ~13.</li>
                        <li>• <strong>רגיל (50):</strong> עד ~18–20.</li>
                        <li>• <strong>מפרקי (90):</strong> עד ~32–36.</li>
                      </ul>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 p-4">
                      <h4 className="font-black text-slate-800 text-sm mb-2">תנאי ביטול</h4>
                      <ul className="list-disc list-inside text-slate-600 text-sm space-y-2 pr-2">
                        <li><strong>רף נוסעים נמוך:</strong> ~5 נוסעים באוטובוס רגיל לעירוני, ~3 לאזורי. ברכבים קטנים הרף יורד, במפרקי הוא עולה.</li>
                        <li><strong>חלופה זמינה חובה:</strong> עד 15 דק&apos; בעירוני, שעה בבין-עירוני, או עד 4 שעות באזורי.</li>
                        <li><strong>הגנת רשת (אזוריים):</strong> אלגוריתם הביטול נעצר אם תרד מתחת ל-3 נסיעות ביום — לשמור על קו חיים בסיסי.</li>
                        <li><strong>הגנה על נסיעה ראשונה/אחרונה ביום:</strong> לעולם לא תוצע לביטול, גם אם ריקה.</li>
                      </ul>
                    </div>
                  </section>

                </div>

                <div className="mt-12 bg-indigo-50/50 p-6 md:p-8 rounded-[2rem] border border-indigo-100 flex flex-col items-center text-center">
                  <h3 className="font-black text-slate-900 text-lg mb-2">אודות הפרויקט</h3>
                  <p className="text-slate-600 text-sm font-medium leading-relaxed max-w-lg mb-5">
                    הפרויקט הוקם בהתנדבות וללא כוונות רווח.<br />
                    נבנה על ידי <strong className="text-slate-900">שלמה הרטמן</strong> בשילוב מודל הבינה המלאכותית <strong className="text-slate-900">Gemini</strong>.
                  </p>
                  <div className="bg-white border-2 border-indigo-100 text-slate-700 px-6 py-3 rounded-xl font-black shadow-sm flex flex-col md:flex-row items-center gap-2">
                    <span>להצעות ולשיפורים:</span>
                    <span className="text-indigo-600" dir="ltr">ahlomihartman@gmail.com</span>
                  </div>
                </div>
              </div>
            )}
          </main>
        )}
      </div>
    </div>
  );
}
