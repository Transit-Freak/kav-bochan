/* נבנה אוטומטית מ-KavPach.jsx (tools/build_kavpach.mjs) — לא לערוך ידנית */
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function kavPachOverlapScore(row) {
  const stops = row?.[3],
    shape = row?.[5],
    route = shape?.selfPct;
  if (shape?.status !== 'estimated' || !Number.isFinite(stops) || !Number.isFinite(route) || stops < 0 || stops > 100 || route < 0 || route > 100) return null;
  return (stops + route) / 2;
}
function kavPachVisibleOverlaps(rows) {
  return (rows || []).filter(row => {
    const score = kavPachOverlapScore(row);
    return score !== null && score >= 50;
  }).sort((a, b) => kavPachOverlapScore(b) - kavPachOverlapScore(a));
}
const {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef
} = React;

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
    s.src = src;
    s.onload = () => {
      _xlsxLoaded = true;
      res();
    };
    s.onerror = rej;
    document.head.appendChild(s);
  });
};

// yields control to the browser so it can paint / handle input.
// setTimeout(0) is more aggressive than rAF — rAF can pile up when the next chunk
// of JS is already queued, which is exactly when we *want* the UI to breathe.
const yieldFrame = () => new Promise(r => setTimeout(r, 0));
const CitiesDatalist = React.memo(function CitiesDatalist({
  cities
}) {
  return /*#__PURE__*/React.createElement("datalist", {
    id: "cities-list"
  }, cities.map(c => /*#__PURE__*/React.createElement("option", {
    key: `dl-city-${c}`,
    value: c
  })));
});

// ── SearchInput ─────────────────────────────────────────────
// אינפוט חיפוש שמופעל בלחיצה / Enter בלבד — בלי דיבאונס, בלי עדכון אוטומטי.
// state פנימי לטקסט; הסינון בהורה רץ רק כשהמשתמש לוחץ "חפש" או Enter,
// או מנקה את השדה (clear -> ריקון מיידי כדי לחזור לתצוגה המלאה).
//
// הערה — לא מצרפים datalist בשלב הזה: על קבצי נתונים עם מאות ערים, הדפדפן
// סורק את כל ה-<option>-ים בכל הקלדה ויוצר לאג מורגש (בעיקר בנייד), אפילו
// ש-state הריאקטי נשאר מקומי. עדיף UX של חיפוש חופשי.
const SearchInput = React.memo(function SearchInput({
  value,
  onSubmit,
  placeholder,
  className
}) {
  const [local, setLocal] = React.useState(value || '');
  const lastExternal = React.useRef(value);
  React.useEffect(() => {
    if (value !== lastExternal.current) {
      lastExternal.current = value;
      setLocal(value || '');
    }
  }, [value]);
  const submit = v => {
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
  const handleKey = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      clear();
    }
  };
  const isDirty = local !== (value || '');
  return /*#__PURE__*/React.createElement("div", {
    className: "relative w-full"
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: local,
    onChange: e => setLocal(e.target.value),
    onKeyDown: handleKey,
    placeholder: placeholder,
    className: className
  }), local && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: clear,
    className: "absolute top-1/2 -translate-y-1/2 left-3 w-6 h-6 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 font-black text-sm flex items-center justify-center transition-colors",
    title: "\u05E0\u05E7\u05D4",
    "aria-label": "\u05E0\u05E7\u05D4"
  }, "\xD7"), isDirty && /*#__PURE__*/React.createElement("div", {
    className: "absolute -bottom-5 right-2 text-[10px] font-bold text-slate-500"
  }, "\u05D4\u05E7\u05E9 Enter \u05DC\u05D7\u05D9\u05E4\u05D5\u05E9"));
});

// ── IndexedDB cache ─────────────────────────────────────────────
// שומרים את התוצאה המעובדת (trips + מאפים + טבלת בנצ'מרק) ב-IndexedDB,
// תחת מפתח משולב מ-last-modified+content-length של כל קבצי המקור. בכניסה
// הבאה, אם אף קובץ לא השתנה, מדלגים על ההורדה ועל הפרסור (~50-80% מזמן הטעינה).
// Maps ו-Sets נשמרים native בזכות structured clone של IDB.
const IDB_NAME = 'kavpach-cache';
const IDB_STORE = 'parsed';
const IDB_KEY = 'data-v3';
const openCacheDB = () => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') {
    reject(new Error('no idb'));
    return;
  }
  const req = indexedDB.open(IDB_NAME, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
const idbGetCache = async key => {
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
  } catch (e) {/* silent — cache is best-effort */}
};

// מפיק מפתח קאש מהכותרות של תגובת HTTP. last-modified יציב, content-length
// תופס שינוי גם אם השרת מחזיר תאריכי last-modified זהים בטעות.
const fileKeyFromHeaders = res => {
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
const DebouncedInput = React.memo(function DebouncedInput({
  value,
  onDebouncedChange,
  debounceMs = 250,
  ...rest
}) {
  const [local, setLocal] = React.useState(value || '');
  const lastExternal = React.useRef(value);
  const timerRef = React.useRef(null);
  React.useEffect(() => {
    if (value !== lastExternal.current) {
      lastExternal.current = value;
      setLocal(value || '');
    }
  }, [value]);
  const handleChange = e => {
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
  return /*#__PURE__*/React.createElement("input", _extends({}, rest, {
    value: local,
    onChange: handleChange
  }));
});

// ── Icons ────────────────────────────────────────────────────────────────────
const ICONS = {
  trash: "M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6",
  upload: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12",
  download: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4",
  search: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  clock: "M12 2a10 10 0 100 20A10 10 0 0012 2zm0 5v5l3 3",
  zap: "M13 10V3L4 14h7v7l9-11h-7z",
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
  star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
};
const Ic = ({
  n,
  size = 18,
  cls = "",
  animate = false,
  strokeWidth = "2.5"
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: strokeWidth,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className: `${cls} ${animate ? "animate-spin" : ""}`
}, /*#__PURE__*/React.createElement("path", {
  d: ICONS[n] || ""
}));

// ── פונקציות עזר ─────────────────────────────────────────────────────────────
const fmtTime = v => {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") {
    const totalMins = Math.round(v * 1440);
    const h = Math.floor(totalMins / 60) % 24;
    const m = totalMins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  if (/^\d{1,2}:\d{2}/.test(s)) return s.slice(0, 5);
  return s;
};
const timeToMins = t => {
  if (!t || !t.includes(':')) return null;
  const [h, m] = t.split(':').map(Number);
  if (h > 29 || m > 59) return null;
  return h * 60 + m;
};
const getPeriod = mins => {
  if (mins === null) return "לא ידוע";
  if (mins < 360) return "לילה";
  if (mins < 600) return "בוקר";
  if (mins < 960) return "צהריים";
  if (mins < 1140) return "ערב";
  return "לילה";
};
const getLineCategory = typeStr => {
  if (!typeStr) return 'urban';
  const t = typeStr.replace(/\s/g, '');
  if (t.includes('אזורי') || t.includes('מועצה')) return 'regional';
  if (t.includes('בין') || t.includes('בינעירוני')) return 'intercity';
  return 'urban';
};

// (הסיווג, הבנצ'מרקים, ספי השפל ותוויות הסטטוס עברו ל-kavpach-core.js — משותף לאתר ולחישוב המוקדם ב-Actions)

// ── הגדרות ניקוד לבחירת המשתמש (שלמה 07.09: "שהמשתמש יוכל לבחור מה כמה כל
//    דבר נותן ציון, כמה אנשים בציון 10") ────────────────────────────────────
// כל רכיב ניקוד: דלוק/כבוי, כמה נקודות לכל היותר, וסף מספרי כשיש כזה
// (ריק = הסף האוטומטי של האתר, לפי קטגוריית הקו). הציון תמיד מנורמל
// ל-100 לפי סכום הנקודות של הרכיבים הדלוקים, כך שאפשר לשחק במשקלים בלי
// לחשב שהם מסתכמים ל-100. ההגדרות נשמרות בדפדפן הזה בלבד.
const numOrNull = v => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const mergeSettings = (dflt, saved) => {
  if (!saved || typeof saved !== 'object') return dflt;
  const out = {
    ...dflt
  };
  Object.keys(dflt).forEach(k => {
    const d = dflt[k],
      s = saved[k];
    if (d && typeof d === 'object' && !Array.isArray(d)) out[k] = mergeSettings(d, s);else if (s !== undefined && (typeof s === typeof d || s === null || d === null)) out[k] = s;
  });
  return out;
};
function useStoredSettings(key, defaults) {
  const [s, setS] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return mergeSettings(defaults, JSON.parse(raw));
    } catch (e) {/* אין אחסון */}
    return defaults;
  });
  const update = useCallback(fn => setS(prev => {
    const next = fn(prev);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch (e) {/* אין אחסון */}
    return next;
  }), [key]);
  const reset = useCallback(() => {
    try {
      localStorage.removeItem(key);
    } catch (e) {/* אין אחסון */}
    setS(defaults);
  }, [key, defaults]);
  const isDefault = JSON.stringify(s) === JSON.stringify(defaults);
  return [s, update, reset, isDefault];
}

// שדה מספר קטן; ריק = אוטומטי
const NumField = ({
  value,
  onChange,
  placeholder,
  min,
  max,
  step,
  width,
  suffix,
  title
}) => /*#__PURE__*/React.createElement("span", {
  className: "inline-flex items-center gap-1 whitespace-nowrap",
  title: title
}, /*#__PURE__*/React.createElement("input", {
  type: "number",
  inputMode: "decimal",
  value: value == null ? '' : value,
  placeholder: placeholder || '',
  min: min,
  max: max,
  step: step || 1,
  onChange: e => onChange(e.target.value === '' ? null : Number(e.target.value)),
  className: `bg-white border-2 border-slate-200 rounded-xl px-2 py-1.5 font-black text-sm text-center outline-none focus:border-amber-500 ${width || 'w-20'}`
}), suffix ? /*#__PURE__*/React.createElement("span", {
  className: "text-[11px] font-bold text-slate-500"
}, suffix) : null);

// ברירות המחדל — בדיוק הניקוד שהאתר עבד איתו עד עכשיו
const GOLD_DEFAULTS = {
  entryRiders: 30,
  minScore: 60,
  c: {
    highTrips: {
      on: true,
      max: 20
    },
    efficientKm: {
      on: true,
      max: 15
    },
    cost: {
      on: true,
      max: 20,
      full: null
    },
    avgRiders: {
      on: true,
      max: 15,
      full: null,
      half: null
    },
    peak: {
      on: true,
      max: 10,
      full: null,
      half: null
    },
    volume: {
      on: true,
      max: 20,
      full: null,
      half: null
    }
  }
};
const PACH_DEFAULTS = {
  minScore: 25,
  c: {
    lowTrips: {
      on: true,
      max: 30
    },
    wastedKm: {
      on: true,
      max: 20
    },
    cost: {
      on: true,
      max: 20
    },
    riders: {
      on: true,
      max: 30,
      low: null,
      peak: null
    },
    deadhead: {
      on: true,
      max: 10
    } // הקו משמש להסעת רכבים במסווה (הלוך-חזור של אותו רכב תוך 15 דק', מהשידורים)
  },
  // הגנות — נקודות שמופחתות מהציון; 0 = ההגנה כבויה
  p: {
    exclusive: 15,
    train: 10,
    school: 10,
    prebook: 20,
    weekend: 10,
    newLine: 10,
    reduced: 10,
    noAlt: 10
  }
};

// ניקוד נסיעות תפעוליות — אותה מסגרת כמו ציון אי-היעילות של קו: רכיבים עם
// נקודות לבחירת המשתמש, נרמול ל-100 לפי הרכיבים הדלוקים, הגנות שמופחתות
const DEADHEAD_DEFAULTS = {
  minScore: 25,
  c: {
    obs: {
      on: true,
      max: 40
    },
    // כמה פעמים בשבוע נצפה הרכב עושה הלוך-חזור צמוד
    tight: {
      on: true,
      max: 20
    },
    // כמה מהר יצא חזרה (עד 5 דק' = מלוא הנקודות)
    hot: {
      on: true,
      max: 30
    },
    // קו עמוס באזור באותה שעה
    crush: {
      on: true,
      max: 15
    },
    // ואם הקו הזה ממש נחנק (מעל הקיבולת) — צריך תגבור, והאוטובוס הריק נסע לידו
    empty: {
      on: true,
      max: 10
    } // נסיעת החזרה ריקה גם בספירות המשרד
  },
  // הגנות: קו לילה, סופ"ש, תצפית בודדת
  p: {
    night: 10,
    weekend: 10,
    rare: 10
  }
};

// לוח ההגדרות — משותף לשני הכלים. rows: [{ key, label, hint, params: [{ k, label, auto, unit, min, max, step }] }]
function ScoreSettingsPanel({
  title,
  intro,
  settings,
  update,
  reset,
  isDefault,
  rows,
  extras,
  footnote,
  accent
}) {
  const [open, setOpen] = useState(false);
  const maxSum = maxSumOf(settings.c);
  const ac = accent || 'amber';
  const setC = (key, k, v) => update(s => ({
    ...s,
    c: {
      ...s.c,
      [key]: {
        ...s.c[key],
        [k]: v
      }
    }
  }));
  return /*#__PURE__*/React.createElement("div", {
    className: `bg-white border-2 border-${ac}-200 rounded-[2rem] shadow-sm overflow-hidden`
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setOpen(o => !o),
    "aria-expanded": open,
    className: "w-full flex items-center justify-between gap-3 px-6 py-4 text-right"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-black text-slate-900 text-base"
  }, "\u2699\uFE0F ", title, !isDefault && /*#__PURE__*/React.createElement("span", {
    className: `mr-2 text-[11px] font-black bg-${ac}-100 text-${ac}-800 border border-${ac}-300 rounded-full px-2 py-0.5`
  }, "\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05E9\u05DC\u05DA")), /*#__PURE__*/React.createElement("span", {
    className: "text-slate-500 font-black text-sm shrink-0"
  }, open ? '▲ סגירה' : '▼ פתיחה')), open && /*#__PURE__*/React.createElement("div", {
    className: "px-6 pb-6 space-y-4"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-slate-600 font-bold text-sm leading-relaxed"
  }, intro), /*#__PURE__*/React.createElement("div", {
    className: "overflow-x-auto"
  }, /*#__PURE__*/React.createElement("table", {
    className: "w-full text-sm"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    className: "text-[11px] font-black text-slate-500 border-b border-slate-200"
  }, /*#__PURE__*/React.createElement("th", {
    className: "text-right py-2 pl-2"
  }, "\u05E0\u05E1\u05E4\u05E8?"), /*#__PURE__*/React.createElement("th", {
    className: "text-right py-2"
  }, "\u05DE\u05D4 \u05E0\u05DE\u05D3\u05D3"), /*#__PURE__*/React.createElement("th", {
    className: "text-right py-2"
  }, "\u05DB\u05DE\u05D4 \u05E0\u05E7\u05D5\u05D3\u05D5\u05EA \u05DC\u05DB\u05DC \u05D4\u05D9\u05D5\u05EA\u05E8"), /*#__PURE__*/React.createElement("th", {
    className: "text-right py-2"
  }, "\u05D4\u05E1\u05E3 (\u05E8\u05D9\u05E7 = \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9)"))), /*#__PURE__*/React.createElement("tbody", null, rows.map(r => {
    const c = settings.c[r.key];
    return /*#__PURE__*/React.createElement("tr", {
      key: r.key,
      className: `border-b border-slate-100 align-top ${c.on ? '' : 'opacity-50'}`
    }, /*#__PURE__*/React.createElement("td", {
      className: "py-2.5 pl-2"
    }, /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      checked: !!c.on,
      onChange: e => setC(r.key, 'on', e.target.checked),
      className: "w-4 h-4 accent-amber-600",
      "aria-label": `לספור: ${r.label}`
    })), /*#__PURE__*/React.createElement("td", {
      className: "py-2.5 pl-3"
    }, /*#__PURE__*/React.createElement("div", {
      className: "font-black text-slate-900"
    }, r.label), r.hint && /*#__PURE__*/React.createElement("div", {
      className: "text-[11px] font-bold text-slate-500 leading-snug max-w-xs"
    }, r.hint)), /*#__PURE__*/React.createElement("td", {
      className: "py-2.5 pl-3"
    }, /*#__PURE__*/React.createElement(NumField, {
      value: c.max,
      onChange: v => setC(r.key, 'max', v == null ? 0 : Math.max(0, Math.min(100, v))),
      min: 0,
      max: 100,
      suffix: "\u05E0\u05E7\u05F3",
      title: "\u05DB\u05DE\u05D4 \u05E0\u05E7\u05D5\u05D3\u05D5\u05EA \u05D4\u05E8\u05DB\u05D9\u05D1 \u05D4\u05D6\u05D4 \u05E0\u05D5\u05EA\u05DF \u05DB\u05E9\u05D4\u05D5\u05D0 \u05D1\u05DE\u05DC\u05D5\u05D0\u05D5"
    })), /*#__PURE__*/React.createElement("td", {
      className: "py-2.5"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap gap-x-4 gap-y-2"
    }, (r.params || []).map(p => /*#__PURE__*/React.createElement("label", {
      key: p.k,
      className: "inline-flex items-center gap-2 text-[12px] font-bold text-slate-700"
    }, /*#__PURE__*/React.createElement("span", null, p.label), /*#__PURE__*/React.createElement(NumField, {
      value: c[p.k],
      onChange: v => setC(r.key, p.k, v),
      placeholder: p.auto || 'אוטו',
      min: p.min,
      max: p.max,
      step: p.step,
      suffix: p.unit,
      width: p.width,
      title: p.title
    }))), !(r.params || []).length && /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-bold text-slate-400"
    }, "\u2014"))));
  })))), extras, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap items-center justify-between gap-3 pt-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-[12px] font-bold text-slate-600"
  }, "\u05E1\u05D4\"\u05DB \u05E0\u05E7\u05D5\u05D3\u05D5\u05EA \u05D0\u05E4\u05E9\u05E8\u05D9\u05D5\u05EA: ", /*#__PURE__*/React.createElement("b", {
    className: "text-slate-900"
  }, maxSum), maxSum !== 100 && maxSum > 0 && /*#__PURE__*/React.createElement("span", null, " \xB7 \u05D4\u05E6\u05D9\u05D5\u05DF \u05DE\u05E0\u05D5\u05E8\u05DE\u05DC \u05DC-100 (\u05DB\u05DC \u05E8\u05DB\u05D9\u05D1 \u05E9\u05D5\u05D5\u05D4 ", Math.round(100 / maxSum * 100) / 100, " \u05DE\u05E0\u05E7\u05D5\u05D3\u05D5\u05EA\u05D9\u05D5)"), maxSum === 0 && /*#__PURE__*/React.createElement("span", {
    className: "text-rose-600"
  }, " \xB7 \u05DB\u05DC \u05D4\u05E8\u05DB\u05D9\u05D1\u05D9\u05DD \u05DB\u05D1\u05D5\u05D9\u05D9\u05DD \u2014 \u05D0\u05D9\u05DF \u05E6\u05D9\u05D5\u05DF")), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: reset,
    disabled: isDefault,
    className: `px-4 py-2 rounded-xl text-xs font-black border-2 ${isDefault ? 'border-slate-200 text-slate-400' : 'border-slate-900 text-slate-900 hover:bg-slate-900 hover:text-white'}`
  }, "\u21BA \u05D7\u05D6\u05E8\u05D4 \u05DC\u05D1\u05E8\u05D9\u05E8\u05EA \u05D4\u05DE\u05D7\u05D3\u05DC \u05E9\u05DC \u05D4\u05D0\u05EA\u05E8")), footnote && /*#__PURE__*/React.createElement("p", {
    className: "text-[11px] font-bold text-slate-500 leading-relaxed"
  }, footnote)));
}
const getCapacity = sizeStr => {
  if (!sizeStr) return 50;
  const s = String(sizeStr).replace(/\s/g, '');
  if (s.includes("מפרקי")) return 90;
  if (s.includes("מידי")) return 35;
  if (s.includes("מיני")) return 19;
  return 50;
};
const parseDays = raw => {
  if (!raw || String(raw).trim() === "undefined") return {
    list: [],
    text: "כללי"
  };
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
    if (joined === '12345') return {
      list,
      text: "א'-ה'"
    };
    if (joined === '123456') return {
      list,
      text: "א'-ו'"
    };
    if (joined === '2345') return {
      list,
      text: "ב'-ה'"
    };
    if (joined === '1234567') return {
      list,
      text: "כל השבוע"
    };
    const names = {
      '1': 'ראשון',
      '2': 'שני',
      '3': 'שלישי',
      '4': 'רביעי',
      '5': 'חמישי',
      '6': 'שישי',
      '7': 'שבת'
    };
    return {
      list,
      text: list.map(d => names[d]).join(', ')
    };
  }
  return {
    list,
    text: String(raw).trim()
  };
};
const parseCity = stopName => {
  if (!stopName) return "";
  const s = String(stopName);
  const idx = s.indexOf(' - ');
  return idx > 0 ? s.slice(0, idx).trim() : s.split('/')[0].trim();
};
const cityOnlyStr = s => s ? s.indexOf(' - ') > 0 ? s.slice(0, s.indexOf(' - ')).trim() : s.split('/')[0].trim() : '';

// רכיב לעיצוב המק"ט, הכיוון והחלופה בתגיות ברורות (Badge style)
// שקלים בקריאה אנושית: 12,400 → "12.4 אלף ₪", 3,180,000 → "3.2 מיליון ₪"
const fmtShekels = v => {
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + ' מיליון ₪';
  if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + ' אלף ₪';
  return Math.round(v).toLocaleString() + ' ₪';
};
const RouteFormat = ({
  val
}) => {
  if (!val) return null;
  const parts = String(val).split('-');
  const makat = parts[0] || '';
  const dir = parts[1] || '';
  const alt = parts[2] && parts[2] !== '0' && parts[2] !== '#' ? parts[2] : '';
  return /*#__PURE__*/React.createElement("div", {
    className: "inline-flex flex-wrap items-center gap-1.5 whitespace-nowrap text-[11px]",
    dir: "rtl"
  }, /*#__PURE__*/React.createElement("span", {
    className: "bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-slate-600 font-medium shadow-sm"
  }, "\u05DE\u05E7\"\u05D8: ", /*#__PURE__*/React.createElement("strong", {
    className: "font-black text-slate-900"
  }, makat)), dir && /*#__PURE__*/React.createElement("span", {
    className: "bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-slate-600 font-medium shadow-sm"
  }, "\u05DB\u05D9\u05D5\u05D5\u05DF: ", /*#__PURE__*/React.createElement("strong", {
    className: "font-black text-slate-900"
  }, dir)), alt && /*#__PURE__*/React.createElement("span", {
    className: "bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded text-indigo-800 font-medium shadow-sm"
  }, "\u05D7\u05DC\u05D5\u05E4\u05D4: ", /*#__PURE__*/React.createElement("strong", {
    className: "font-black"
  }, alt)));
};

// ── BusArt — אוטובוס SVG. variant: 'scrap' (לבן, לפח) או 'gold' (מוזהב) ──
const BusArt = ({
  variant = 'scrap',
  className = ''
}) => {
  const gold = variant === 'gold';
  const gid = gold ? 'busGold' : 'busScrap';
  const winFill = gold ? '#fffbeb' : '#dbeafe';
  const winStroke = gold ? '#92400e' : '#bfdbfe';
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 170 96",
    className: className,
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: gid,
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1"
  }, gold ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("stop", {
    offset: "0%",
    stopColor: "#fef3c7"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "45%",
    stopColor: "#fbbf24"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "100%",
    stopColor: "#d97706"
  })) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("stop", {
    offset: "0%",
    stopColor: "#ffffff"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "100%",
    stopColor: "#eef2f6"
  })))), /*#__PURE__*/React.createElement("rect", {
    x: "8",
    y: "20",
    width: "154",
    height: "50",
    rx: "12",
    fill: `url(#${gid})`,
    stroke: gold ? '#b45309' : '#cbd5e1',
    strokeWidth: "3.5"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "8",
    y: "47",
    width: "154",
    height: "7",
    fill: gold ? '#b45309' : '#e2e8f0',
    opacity: "0.6"
  }), [26, 54, 82, 110].map((x, i) => /*#__PURE__*/React.createElement("rect", {
    key: i,
    x: x,
    y: "27",
    width: "22",
    height: "15",
    rx: "3",
    fill: winFill,
    stroke: winStroke,
    strokeWidth: "1.5"
  })), /*#__PURE__*/React.createElement("rect", {
    x: "138",
    y: "27",
    width: "16",
    height: "30",
    rx: "3",
    fill: winFill,
    stroke: winStroke,
    strokeWidth: "1.5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "158",
    cy: "63",
    r: "3",
    fill: gold ? '#fde68a' : '#fbbf24'
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "44",
    cy: "72",
    r: "11",
    fill: "#0f172a"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "44",
    cy: "72",
    r: "4.5",
    fill: gold ? '#fbbf24' : '#94a3b8'
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "124",
    cy: "72",
    r: "11",
    fill: "#0f172a"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "124",
    cy: "72",
    r: "4.5",
    fill: gold ? '#fbbf24' : '#94a3b8'
  }), gold && /*#__PURE__*/React.createElement("circle", {
    cx: "30",
    cy: "31",
    r: "3",
    fill: "#ffffff",
    opacity: "0.85"
  }));
};

// ── TrashBin — פח אשפה ────────────────────────────────────────────────
const TrashBin = ({
  className = ''
}) => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 120 120",
  className: className,
  xmlns: "http://www.w3.org/2000/svg",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("rect", {
  x: "52",
  y: "18",
  width: "16",
  height: "10",
  rx: "2",
  fill: "#1e293b"
}), /*#__PURE__*/React.createElement("rect", {
  x: "18",
  y: "26",
  width: "84",
  height: "12",
  rx: "3",
  fill: "#334155"
}), /*#__PURE__*/React.createElement("path", {
  d: "M26 40 L94 40 L86 112 Q85 116 81 116 L39 116 Q35 116 34 112 Z",
  fill: "#475569"
}), /*#__PURE__*/React.createElement("path", {
  d: "M46 48 L51 108",
  stroke: "#64748b",
  strokeWidth: "4",
  strokeLinecap: "round"
}), /*#__PURE__*/React.createElement("path", {
  d: "M60 48 L60 108",
  stroke: "#64748b",
  strokeWidth: "4",
  strokeLinecap: "round"
}), /*#__PURE__*/React.createElement("path", {
  d: "M74 48 L69 108",
  stroke: "#64748b",
  strokeWidth: "4",
  strokeLinecap: "round"
}));

// ── ChoiceScreen — מסך פתיחה: בחירה בין קו פח להקו המוזהב ──────────────
function ChoiceScreen({
  onPick
}) {
  const [aboutMe, setAboutMe] = useState(false);
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4",
    dir: "rtl",
    style: {
      fontFamily: "'Heebo', sans-serif"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "max-w-7xl w-full"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-center mb-10"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-center gap-3.5"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 120 120",
    className: "w-11 h-11 md:w-14 md:h-14 flex-none"
  }, /*#__PURE__*/React.createElement("rect", {
    width: "120",
    height: "120",
    rx: "26",
    fill: "#0f172a"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M14 60 Q60 20 106 60 Q60 100 14 60 Z",
    stroke: "#38bdf8",
    strokeWidth: "6",
    fill: "none",
    strokeLinejoin: "round"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "60",
    cy: "60",
    r: "20",
    fill: "#38bdf8"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "60",
    cy: "60",
    r: "9.5",
    fill: "#0f172a"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "66",
    cy: "54",
    r: "3.5",
    fill: "#fff"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M22 60 H34 M86 60 H98",
    stroke: "#38bdf8",
    strokeWidth: "4",
    strokeLinecap: "round",
    strokeDasharray: "1 7"
  })), /*#__PURE__*/React.createElement("h1", {
    className: "text-4xl md:text-5xl font-[900] text-slate-900 tracking-tight"
  }, "\u05D4\u05E7\u05D5 \u05D4\u05D1\u05D5\u05D7\u05DF")), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-500 font-bold mt-3 text-base md:text-lg"
  }, "\u05E9\u05DC\u05D5\u05E9\u05D4-\u05E2\u05E9\u05E8 \u05DB\u05DC\u05D9\u05DD \u05DC\u05E0\u05D9\u05EA\u05D5\u05D7 \u05D4\u05EA\u05D7\u05D1\u05D5\u05E8\u05D4 \u05D4\u05E6\u05D9\u05D1\u05D5\u05E8\u05D9\u05EA \u2014 \u05D1\u05DE\u05D4 \u05DC\u05D1\u05D7\u05D5\u05E8?"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setAboutMe(v => !v),
    className: "mt-3 text-sm font-black text-sky-700 hover:text-sky-900 hover:underline"
  }, "\uD83D\uDC4B \u05E7\u05E6\u05EA \u05E2\u05DC\u05D9\u05D9 ", aboutMe ? '▲' : '▼'), aboutMe && /*#__PURE__*/React.createElement("div", {
    className: "max-w-3xl mx-auto mt-4 bg-white rounded-2xl shadow-md border border-slate-200 p-6 text-right leading-relaxed text-slate-700 font-medium text-sm md:text-base md:flex md:gap-6 md:items-start"
  }, /*#__PURE__*/React.createElement("figure", {
    className: "flex-none w-48 md:w-52 mx-auto md:mx-0 mb-4 md:mb-0"
  }, /*#__PURE__*/React.createElement("img", {
    src: "media/shlomi.jpg",
    alt: "\u05E9\u05DC\u05D5\u05DE\u05D9 \u05DC\u05D9\u05D3 \u05E9\u05DC\u05D8 \u05EA\u05D7\u05E0\u05D4 \u05D0\u05D9\u05E9\u05D9 \u05E9\u05E7\u05D9\u05D1\u05DC \u05DC\u05D9\u05D5\u05DD \u05D4\u05D5\u05DC\u05D3\u05EA\u05D5",
    className: "w-full rounded-xl shadow-md border border-slate-200",
    loading: "lazy"
  }), /*#__PURE__*/React.createElement("figcaption", {
    className: "text-[11px] text-slate-500 font-bold mt-2 leading-snug"
  }, "\u05D4\u05EA\u05D7\u05E0\u05D4 \u05D4\u05E4\u05E8\u05D8\u05D9\u05EA \u05E9\u05DC\u05D9 \uD83D\uDE8F \u05DE\u05EA\u05E0\u05EA \u05D9\u05D5\u05DD \u05D4\u05D5\u05DC\u05D3\u05EA 20 \u05DE\u05D4\u05D4\u05D5\u05E8\u05D9\u05DD \u05D4\u05DB\u05D9 \u05E0\u05E4\u05DC\u05D0\u05D9\u05DD \u05D1\u05E2\u05D5\u05DC\u05DD: \u05DE\u05E1\u05E4\u05E8 \u05D4\u05EA\u05D7\u05E0\u05D4 \u05D4\u05D5\u05D0 \u05EA\u05D0\u05E8\u05D9\u05DA \u05D4\u05DC\u05D9\u05D3\u05D4 \u05E9\u05DC\u05D9, \u05D5\u05D4\u05E7\u05D5\u05D5\u05D9\u05DD \u05E2\u05DC \u05D4\u05E9\u05DC\u05D8 \u2014 \u05E7\u05D5\u05D5\u05D9\u05DD \u05E9\u05E9\u05D9\u05E0\u05D9\u05EA\u05D9.")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", null, "\u05E9\u05DC\u05D5\u05DD, \u05E9\u05DE\u05D9 \u05E9\u05DC\u05DE\u05D4 (\u05E9\u05DC\u05D5\u05DE\u05D9) \u05D4\u05E8\u05D8\u05DE\u05DF, \u05D1\u05DF 20 \u05DE\u05E7\u05E8\u05D9\u05D9\u05EA \u05DE\u05DC\u05D0\u05DB\u05D9. \u05EA\u05D7\u05D1\u05D5\u05E8\u05D4 \u05E6\u05D9\u05D1\u05D5\u05E8\u05D9\u05EA \u05D6\u05D5\u05E8\u05DE\u05EA \u05D0\u05E6\u05DC\u05D9 \u05D1\u05D3\u05DD \u05DE\u05D2\u05D9\u05DC \u05E7\u05D8\u05DF."), /*#__PURE__*/React.createElement("p", {
    className: "mt-3"
  }, "\u05D1\u05D9\u05DF 2023 \u05DC\u05BE2025 \u05E2\u05E8\u05DB\u05EA\u05D9 \u05D4\u05DE\u05D5\u05DF \u05D1\u05D5\u05D5\u05D9\u05E7\u05D9\u05E4\u05D3\u05D9\u05D4 \u05EA\u05D7\u05EA \u05D4\u05E9\u05DD ", /*#__PURE__*/React.createElement("a", {
    href: "https://he.wikipedia.org/wiki/%D7%9E%D7%A9%D7%AA%D7%9E%D7%A9:%D7%A4%D7%A8%D7%99%D7%A7_%D7%94%D7%AA%D7%97%D7%A6",
    target: "_blank",
    rel: "noopener",
    className: "text-sky-700 font-black hover:underline"
  }, "\u05E4\u05E8\u05D9\u05E7 \u05D4\u05EA\u05D7\u05E6"), ". \u05D1\u05BE2026, \u05DB\u05E9\u05E0\u05DE\u05D0\u05E1 \u05DC\u05D9 \u05DE\u05D4\u05EA\u05E9\u05D5\u05D1\u05D5\u05EA \u05D4\u05E7\u05D1\u05D5\u05E2\u05D5\u05EA \u05E9\u05DC \u05DE\u05E9\u05E8\u05D3 \u05D4\u05EA\u05D7\u05D1\u05D5\u05E8\u05D4 \u2014 \"\u05D0\u05D9\u05DF \u05EA\u05E7\u05E6\u05D9\u05D1\" \u2014 \u05D7\u05E9\u05D1\u05EA\u05D9 \u05DC\u05E2\u05E6\u05DE\u05D9: \u05DC\u05DE\u05D4 \u05E9\u05DC\u05D0 \u05D0\u05D1\u05E0\u05D4 \u05D0\u05EA\u05E8 \u05E9\u05DE\u05E8\u05D0\u05D4 \u05D0\u05EA \u05DB\u05DC \u05D4\u05D1\u05D6\u05D1\u05D5\u05D6? \u05DB\u05DA \u05E0\u05D5\u05DC\u05D3 \u05E7\u05D5 \u05E4\u05D7."), /*#__PURE__*/React.createElement("p", {
    className: "mt-3"
  }, "\u05D1\u05D4\u05EA\u05D7\u05DC\u05D4 \u05D4\u05D5\u05D0 \u05D4\u05D9\u05D4 \u05D4\u05D0\u05EA\u05E8 \u05D4\u05D9\u05D7\u05D9\u05D3, \u05D0\u05D1\u05DC \u05DC\u05D0\u05D8 \u05DC\u05D0\u05D8 \u05D4\u05D2\u05D9\u05E2\u05D5 \u05E2\u05D5\u05D3 \u05E8\u05E2\u05D9\u05D5\u05E0\u05D5\u05EA: \u05E7\u05D5 \u05D1\u05D0\u05D2, \u05D4\u05EA\u05D7\u05E0\u05D4 \u05D4\u05D1\u05D0\u05D4 \u05D5\u05D4\u05E7\u05D5 \u05D4\u05DE\u05D5\u05D6\u05D4\u05D1. \u05DB\u05E9\u05E0\u05DB\u05E0\u05E1\u05D4 \u05D4\u05EA\u05D7\u05E0\u05D4 \u05D4\u05D1\u05D0\u05D4 \u05D0\u05DE\u05E8\u05EA\u05D9 \u05DC\u05E2\u05E6\u05DE\u05D9 \u2014 \u05DC\u05DE\u05D4 \u05DC\u05D0 \u05D0\u05EA\u05E8 \u05D0\u05D7\u05D3 \u05E9\u05DE\u05E8\u05DB\u05D6 \u05D0\u05EA \u05DB\u05D5\u05DC\u05DD? \u05D5\u05DB\u05DA \u05E0\u05D5\u05E6\u05E8 \u05D4\u05E7\u05D5 \u05D4\u05D1\u05D5\u05D7\u05DF."), /*#__PURE__*/React.createElement("p", {
    className: "mt-3"
  }, "\u05D5\u05D4\u05D3\u05D1\u05E8 \u05E9\u05D4\u05DB\u05D9 \u05DE\u05D3\u05D4\u05D9\u05DD \u05D0\u05D5\u05EA\u05D9: \u05D0\u05EA \u05DB\u05DC \u05D4\u05D0\u05EA\u05E8\u05D9\u05DD \u05D4\u05D0\u05DC\u05D4 \u05D0\u05E0\u05D9 \u05D1\u05D5\u05E0\u05D4 \u05D9\u05D7\u05D3 \u05E2\u05DD \u05D1\u05D9\u05E0\u05D4 \u05DE\u05DC\u05D0\u05DB\u05D5\u05EA\u05D9\u05EA (\u05E7\u05DC\u05D5\u05D3) \u2014 \u05D0\u05E0\u05D9 \u05DE\u05D1\u05D9\u05D0 \u05D0\u05EA \u05D4\u05E8\u05E2\u05D9\u05D5\u05E0\u05D5\u05EA, \u05D4\u05D9\u05D3\u05E2 \u05D5\u05D4\u05D4\u05E0\u05D7\u05D9\u05D5\u05EA, \u05D5\u05D4\u05D9\u05D0 \u05D0\u05EA \u05D4\u05E7\u05D5\u05D3. \u05DB\u05DB\u05D4 \u05E7\u05DD \u05DB\u05DC\u05D9 \u05D0\u05D7\u05E8\u05D9 \u05DB\u05DC\u05D9 \u05D1\u05EA\u05D5\u05DA \u05D9\u05DE\u05D9\u05DD, \u05D1\u05D6\u05DE\u05DF \u05E9\u05DC\u05DE\u05E9\u05E8\u05D3 \u05D4\u05EA\u05D7\u05D1\u05D5\u05E8\u05D4 \u05DC\u05D5\u05E7\u05D7 \u05E9\u05E0\u05D9\u05DD \u05DC\u05D4\u05E7\u05D9\u05DD \u05D0\u05EA\u05E8 \u05D0\u05D7\u05D3."), /*#__PURE__*/React.createElement("p", {
    className: "mt-3"
  }, "\u05D1\u05D6\u05DB\u05D5\u05EA \u05D4\u05D0\u05EA\u05E8 \u05E4\u05E0\u05D5 \u05D0\u05DC\u05D9\u05D9 \u05D0\u05E0\u05E9\u05D9\u05DD \u05DE\u05D4\u05D4\u05E1\u05EA\u05D3\u05E8\u05D5\u05EA \u05D5\u05DE\u05D4\u05DE\u05DB\u05D5\u05DF \u05D4\u05D8\u05DB\u05E0\u05D5\u05DC\u05D5\u05D2\u05D9 \u05D7\u05D5\u05DC\u05D5\u05DF \u2014 \u05D4\u05E8\u05D2\u05E2 \u05D4\u05DE\u05D0\u05D5\u05E9\u05E8 \u05D1\u05D7\u05D9\u05D9. \u05D0\u05D5\u05DC\u05D9 \u05D1\u05E2\u05EA\u05D9\u05D3 \u05D9\u05D9\u05E6\u05D0\u05D5 \u05D0\u05D9\u05EA\u05DD \u05D0\u05EA\u05E8\u05D9\u05DD \u05D7\u05D3\u05E9\u05D9\u05DD."), /*#__PURE__*/React.createElement("p", {
    className: "mt-3"
  }, "\u05D9\u05E9 \u05DC\u05DB\u05DD \u05E8\u05E2\u05D9\u05D5\u05DF \u05DC\u05D0\u05EA\u05E8? \u05D0\u05E9\u05DE\u05D7 \u05DC\u05E9\u05DE\u05D5\u05E2 \u2014 ", /*#__PURE__*/React.createElement("a", {
    href: "mailto:shlomihartman@gmail.com",
    className: "text-sky-700 font-black hover:underline"
  }, "\u05DB\u05EA\u05D1\u05D5 \u05DC\u05D9"), ". \u05DC\u05DA \u05EA\u05D3\u05E2\u05D5, \u05D0\u05D5\u05DC\u05D9 \u05D3\u05D5\u05D5\u05E7\u05D0 \u05D4\u05E8\u05E2\u05D9\u05D5\u05DF \u05E9\u05DC\u05DB\u05DD \u05D9\u05E6\u05D0 \u05DC\u05E4\u05D5\u05E2\u05DC.")))), /*#__PURE__*/React.createElement("div", {
    className: "grid md:grid-cols-2 xl:grid-cols-4 gap-6"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => onPick('kavpach'),
    className: "group relative overflow-hidden bg-slate-900 rounded-[2.5rem] p-8 text-right shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute -left-8 -top-8 w-44 h-44 bg-slate-800 rounded-full opacity-50"
  }), /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: "relative h-32 mb-5"
  }, /*#__PURE__*/React.createElement(BusArt, {
    variant: "scrap",
    className: "w-32 absolute z-0 drop-shadow-xl transition-transform duration-300 group-hover:translate-y-1.5"
  }), /*#__PURE__*/React.createElement(TrashBin, {
    className: "w-24 h-24 absolute bottom-0 z-10 drop-shadow-md"
  })), /*#__PURE__*/React.createElement("h2", {
    className: "text-3xl font-[900] text-white"
  }, "\u05E7\u05D5 \u05E4\u05D7"), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-300 font-bold mt-2 text-sm leading-relaxed"
  }, "\u05E7\u05D5\u05D5\u05D9\u05DD \u05E8\u05D9\u05E7\u05D9\u05DD \u05D5\u05D1\u05D6\u05D1\u05D6\u05E0\u05D9\u05D9\u05DD \u2014 \u05DE\u05D5\u05E2\u05DE\u05D3\u05D9\u05DD \u05DC\u05D1\u05D9\u05D8\u05D5\u05DC \u05D0\u05D5 \u05E6\u05DE\u05E6\u05D5\u05DD"), /*#__PURE__*/React.createElement("span", {
    className: "inline-flex items-center gap-2 mt-5 bg-white text-slate-900 px-5 py-2.5 rounded-2xl font-black text-sm group-hover:gap-3.5 transition-all"
  }, "\u05DB\u05E0\u05D9\u05E1\u05D4 ", /*#__PURE__*/React.createElement("span", null, "\u2190")))), /*#__PURE__*/React.createElement("button", {
    onClick: () => onPick('golden'),
    className: "group relative overflow-hidden rounded-[2.5rem] p-8 text-right shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300",
    style: {
      background: 'linear-gradient(155deg,#1f2937 0%,#3b2f12 52%,#92400e 100%)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute -left-8 -top-8 w-44 h-44 rounded-full opacity-25",
    style: {
      background: '#fbbf24'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-end mb-6 h-28"
  }, /*#__PURE__*/React.createElement(BusArt, {
    variant: "gold",
    className: "w-40 drop-shadow-xl transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-2"
  })), /*#__PURE__*/React.createElement("h2", {
    className: "text-3xl font-[900] text-amber-300"
  }, "\u05D4\u05E7\u05D5 \u05D4\u05DE\u05D5\u05D6\u05D4\u05D1"), /*#__PURE__*/React.createElement("p", {
    className: "text-amber-100/80 font-bold mt-2 text-sm leading-relaxed"
  }, "\u05D4\u05E7\u05D5\u05D5\u05D9\u05DD \u05D4\u05DE\u05E6\u05D8\u05D9\u05D9\u05E0\u05D9\u05DD \u2014 \u05D4\u05E1\u05D8\u05E0\u05D3\u05E8\u05D8 \u05E9\u05D0\u05DC\u05D9\u05D5 \u05DB\u05D3\u05D0\u05D9 \u05DC\u05E9\u05D0\u05D5\u05E3"), /*#__PURE__*/React.createElement("span", {
    className: "inline-flex items-center gap-2 mt-5 bg-amber-400 text-amber-950 px-5 py-2.5 rounded-2xl font-black text-sm group-hover:gap-3.5 transition-all"
  }, "\u05DB\u05E0\u05D9\u05E1\u05D4 ", /*#__PURE__*/React.createElement("span", null, "\u2190")))), /*#__PURE__*/React.createElement("a", {
    href: "https://transit-freak.github.io/kav-bug/",
    className: "group relative block overflow-hidden rounded-[2.5rem] p-8 text-right shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300",
    style: {
      background: 'linear-gradient(155deg,#1e1b4b 0%,#312e81 55%,#4338ca 100%)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute -left-8 -top-8 w-44 h-44 rounded-full opacity-25",
    style: {
      background: '#6366f1'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-end mb-6 h-28"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 140 90",
    className: "w-40 drop-shadow-xl transition-transform duration-300 group-hover:-translate-y-1",
    xmlns: "http://www.w3.org/2000/svg"
  }, /*#__PURE__*/React.createElement("line", {
    x1: "18",
    y1: "64",
    x2: "122",
    y2: "64",
    stroke: "#1f9d57",
    strokeWidth: "10",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "18,64 44,18 70,64 96,18 122,64",
    fill: "none",
    stroke: "#ef8a17",
    strokeWidth: "11",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "18",
    cy: "64",
    r: "9",
    fill: "#fff"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "122",
    cy: "64",
    r: "9",
    fill: "#fff"
  }))), /*#__PURE__*/React.createElement("h2", {
    className: "text-3xl font-[900] text-indigo-200"
  }, "\u05E7\u05D5 \u05D1\u05D0\u05D2"), /*#__PURE__*/React.createElement("p", {
    className: "text-indigo-100/80 font-bold mt-2 text-sm leading-relaxed"
  }, "\u05EA\u05E7\u05DC\u05D5\u05EA \u05D2\u05D0\u05D5\u05DE\u05D8\u05E8\u05D9\u05D5\u05EA \u05D1\u05DE\u05E1\u05DC\u05D5\u05DC\u05D9 \u05D4\u05E7\u05D5\u05D5\u05D9\u05DD \u2014 \u05E2\u05D9\u05E7\u05D5\u05E4\u05D9\u05DD \u05D5\u05D1\u05DC\u05D9\u05D8\u05D5\u05EA \u05DE\u05D9\u05D5\u05EA\u05E8\u05D9\u05DD"), /*#__PURE__*/React.createElement("span", {
    className: "inline-flex items-center gap-2 mt-5 bg-indigo-400 text-indigo-950 px-5 py-2.5 rounded-2xl font-black text-sm group-hover:gap-3.5 transition-all"
  }, "\u05DB\u05E0\u05D9\u05E1\u05D4 ", /*#__PURE__*/React.createElement("span", null, "\u2190")))), /*#__PURE__*/React.createElement("a", {
    href: "next-station/",
    className: "group relative block overflow-hidden rounded-[2.5rem] p-8 text-right shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300",
    style: {
      background: 'linear-gradient(155deg,#0b2545 0%,#13386e 52%,#2563eb 100%)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute -left-8 -top-8 w-44 h-44 rounded-full opacity-25",
    style: {
      background: '#60a5fa'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between mb-6 h-28"
  }, /*#__PURE__*/React.createElement("span", {
    className: "drop-shadow-xl transition-transform duration-300 group-hover:-translate-y-1",
    style: {
      fontSize: '90px',
      lineHeight: 1
    }
  }, "\uD83D\uDE8F")), /*#__PURE__*/React.createElement("h2", {
    className: "text-3xl font-[900] text-sky-200"
  }, "\u05D4\u05EA\u05D7\u05E0\u05D4 \u05D4\u05D1\u05D0\u05D4"), /*#__PURE__*/React.createElement("p", {
    className: "text-sky-100/80 font-bold mt-2 text-sm leading-relaxed"
  }, "\u05EA\u05D7\u05E0\u05D5\u05EA \u05E9\u05E9\u05DE\u05DF \u05D0\u05D9\u05E0\u05D5 \u05EA\u05D5\u05D0\u05DD \u05DC\u05E8\u05D7\u05D5\u05D1 \u05E9\u05D1\u05DB\u05EA\u05D5\u05D1\u05EA"), /*#__PURE__*/React.createElement("span", {
    className: "inline-flex items-center gap-2 mt-5 bg-sky-400 text-sky-950 px-5 py-2.5 rounded-2xl font-black text-sm group-hover:gap-3.5 transition-all"
  }, "\u05DB\u05E0\u05D9\u05E1\u05D4 ", /*#__PURE__*/React.createElement("span", null, "\u2190")))), /*#__PURE__*/React.createElement("a", {
    href: "skip-stops/",
    className: "group relative block overflow-hidden rounded-[2.5rem] p-8 text-right shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300",
    style: {
      background: 'linear-gradient(155deg,#451a03 0%,#7c2d12 52%,#d97706 100%)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute -left-8 -top-8 w-44 h-44 rounded-full opacity-25",
    style: {
      background: '#f59e0b'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between mb-6 h-28"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "4 4 26 26",
    style: {
      width: '96px',
      height: '96px'
    },
    className: "drop-shadow-xl transition-transform duration-300 group-hover:-translate-y-1",
    xmlns: "http://www.w3.org/2000/svg"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M4 26 L10 26 Q17 15 24 26 L30 26",
    stroke: "#fde68a",
    strokeWidth: "2",
    fill: "none",
    strokeDasharray: "2.5 2",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "17",
    cy: "26",
    r: "2.6",
    fill: "#7c2d12",
    stroke: "#fff",
    strokeWidth: "1.4"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "7",
    cy: "26",
    r: "2.6",
    fill: "#fff"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "27",
    cy: "26",
    r: "2.6",
    fill: "#fff"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "10",
    y: "6",
    width: "14",
    height: "9",
    rx: "2.5",
    fill: "#fff"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "12",
    y: "8",
    width: "4",
    height: "3.5",
    rx: "1",
    fill: "#d97706"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "18",
    y: "8",
    width: "4",
    height: "3.5",
    rx: "1",
    fill: "#d97706"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "13",
    cy: "15",
    r: "1.6",
    fill: "#7c2d12"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "21",
    cy: "15",
    r: "1.6",
    fill: "#7c2d12"
  }))), /*#__PURE__*/React.createElement("h2", {
    className: "text-3xl font-[900] text-amber-200"
  }, "\u05D4\u05E7\u05D5 \u05D4\u05DE\u05D3\u05DC\u05D2"), /*#__PURE__*/React.createElement("p", {
    className: "text-amber-100/80 font-bold mt-2 text-sm leading-relaxed"
  }, "\u05E7\u05D5\u05D5\u05D9\u05DD \u05E9\u05D7\u05D5\u05DC\u05E4\u05D9\u05DD \u05DC\u05D9\u05D3 \u05EA\u05D7\u05E0\u05D4 \u05E4\u05E2\u05D9\u05DC\u05D4 \u2014 \u05D1\u05DC\u05D9 \u05DC\u05E2\u05E6\u05D5\u05E8 \u05D1\u05D4"), /*#__PURE__*/React.createElement("span", {
    className: "inline-flex items-center gap-2 mt-5 bg-amber-400 text-amber-950 px-5 py-2.5 rounded-2xl font-black text-sm group-hover:gap-3.5 transition-all"
  }, "\u05DB\u05E0\u05D9\u05E1\u05D4 ", /*#__PURE__*/React.createElement("span", null, "\u2190")))), /*#__PURE__*/React.createElement("a", {
    href: "line-history/",
    className: "group relative block overflow-hidden rounded-[2.5rem] p-8 text-right shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300",
    style: {
      background: 'linear-gradient(155deg,#2e1065 0%,#4c1d95 52%,#7c3aed 100%)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute -left-8 -top-8 w-44 h-44 rounded-full opacity-25",
    style: {
      background: '#a78bfa'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between mb-6 h-28"
  }, /*#__PURE__*/React.createElement("span", {
    className: "drop-shadow-xl transition-transform duration-300 group-hover:-translate-y-1",
    style: {
      fontSize: '90px',
      lineHeight: 1
    }
  }, "\uD83D\uDD70\uFE0F")), /*#__PURE__*/React.createElement("h2", {
    className: "text-3xl font-[900] text-violet-200"
  }, "\u05D4\u05E7\u05D5 \u05D1\u05D6\u05DE\u05DF"), /*#__PURE__*/React.createElement("p", {
    className: "text-violet-100/80 font-bold mt-2 text-sm leading-relaxed"
  }, "\u05D4\u05D9\u05E1\u05D8\u05D5\u05E8\u05D9\u05D9\u05EA \u05D4\u05E9\u05D9\u05E0\u05D5\u05D9\u05D9\u05DD \u05E9\u05DC \u05DB\u05DC \u05E7\u05D5 \u05DE\u05DE\u05E8\u05E5 2017 \u05D5\u05E2\u05D3 \u05D4\u05D9\u05D5\u05DD \u2014 \u05DE\u05E1\u05DC\u05D5\u05DC, \u05E9\u05E8\u05D8\u05D5\u05D8, \u05EA\u05D7\u05E0\u05D5\u05EA \u05D5\u05E9\u05DE\u05D5\u05EA"), /*#__PURE__*/React.createElement("span", {
    className: "inline-flex items-center gap-2 mt-5 bg-violet-300 text-violet-950 px-5 py-2.5 rounded-2xl font-black text-sm group-hover:gap-3.5 transition-all"
  }, "\u05DB\u05E0\u05D9\u05E1\u05D4 ", /*#__PURE__*/React.createElement("span", null, "\u2190")))), /*#__PURE__*/React.createElement("a", {
    href: "fares/",
    className: "group relative block overflow-hidden rounded-[2.5rem] p-8 text-right shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300",
    style: {
      background: 'linear-gradient(155deg,#022c22 0%,#065f46 52%,#059669 100%)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute -left-8 -top-8 w-44 h-44 rounded-full opacity-25",
    style: {
      background: '#34d399'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between mb-6 h-28"
  }, /*#__PURE__*/React.createElement("span", {
    className: "drop-shadow-xl transition-transform duration-300 group-hover:-translate-y-1",
    style: {
      fontSize: '90px',
      lineHeight: 1
    }
  }, "\uD83C\uDFAB")), /*#__PURE__*/React.createElement("h2", {
    className: "text-3xl font-[900] text-emerald-200"
  }, "\u05D4\u05DE\u05D7\u05D9\u05E8\u05D5\u05DF"), /*#__PURE__*/React.createElement("p", {
    className: "text-emerald-100/80 font-bold mt-2 text-sm leading-relaxed"
  }, "\u05DB\u05DE\u05D4 \u05E2\u05D5\u05DC\u05D4 \u05D4\u05E0\u05E1\u05D9\u05E2\u05D4 \u2014 \u05D1\u05D5\u05D3\u05D3\u05EA, \u05D9\u05D5\u05DE\u05D9 \u05D5\u05D7\u05D5\u05D3\u05E9\u05D9, \u05DC\u05DB\u05DC \u05E7\u05D5 \u05D0\u05D5 \u05D1\u05D9\u05DF \u05E9\u05EA\u05D9 \u05EA\u05D7\u05E0\u05D5\u05EA"), /*#__PURE__*/React.createElement("span", {
    className: "inline-flex items-center gap-2 mt-5 bg-emerald-300 text-emerald-950 px-5 py-2.5 rounded-2xl font-black text-sm group-hover:gap-3.5 transition-all"
  }, "\u05DB\u05E0\u05D9\u05E1\u05D4 ", /*#__PURE__*/React.createElement("span", null, "\u2190")))), /*#__PURE__*/React.createElement("a", {
    href: "ratzif/",
    className: "group relative block overflow-hidden rounded-[2.5rem] p-8 text-right shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300",
    style: {
      background: 'linear-gradient(155deg,#083344 0%,#155e75 52%,#0891b2 100%)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute -left-8 -top-8 w-44 h-44 rounded-full opacity-20",
    style: {
      background: '#22d3ee'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between mb-6 h-28"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "126",
    height: "96",
    viewBox: "0 0 63 48",
    className: "drop-shadow-xl transition-transform duration-300 group-hover:-translate-y-1"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "2",
    width: "59",
    height: "9",
    rx: "2.5",
    fill: "#a5f3fc"
  }), /*#__PURE__*/React.createElement("text", {
    x: "31.5",
    y: "9",
    fontSize: "6.2",
    fontWeight: "800",
    fill: "#083344",
    textAnchor: "middle",
    fontFamily: "Rubik,Arial"
  }, "\u05E8\u05E6\u05D9\u05E3 1"), /*#__PURE__*/React.createElement("path", {
    d: "M14 13v31",
    stroke: "#e0f2fe",
    strokeWidth: "2",
    strokeDasharray: "4 3",
    fill: "none"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M49 13v31",
    stroke: "#e0f2fe",
    strokeWidth: "2",
    strokeDasharray: "4 3",
    fill: "none"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "17.5",
    y: "14",
    width: "13",
    height: "32",
    rx: "4",
    fill: "#f8fafc",
    stroke: "#334155",
    strokeWidth: "1.1"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "19.5",
    y: "15.5",
    width: "9",
    height: "3.6",
    rx: "1.6",
    fill: "#1e293b"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "20",
    y: "22",
    width: "8",
    height: "20",
    rx: "2.5",
    fill: "#e2e8f0"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "32.5",
    y: "14",
    width: "13",
    height: "32",
    rx: "4",
    fill: "#f8fafc",
    stroke: "#334155",
    strokeWidth: "1.1"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "34.5",
    y: "15.5",
    width: "9",
    height: "3.6",
    rx: "1.6",
    fill: "#1e293b"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "35",
    y: "22",
    width: "8",
    height: "20",
    rx: "2.5",
    fill: "#e2e8f0"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "31.5",
    cy: "30",
    r: "7.6",
    fill: "#fbbf24",
    stroke: "#78350f",
    strokeWidth: "1.2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M31.5 30 V25.4 M31.5 30 L35 31.8",
    stroke: "#78350f",
    strokeWidth: "1.6",
    strokeLinecap: "round",
    fill: "none"
  }))), /*#__PURE__*/React.createElement("h2", {
    className: "text-3xl font-[900] text-cyan-200"
  }, "\u05E8\u05E6\u05D9\u05E3 \u05DB\u05E4\u05D5\u05DC"), /*#__PURE__*/React.createElement("p", {
    className: "text-cyan-100/80 font-bold mt-2 text-sm leading-relaxed"
  }, "\u05E9\u05E0\u05D9 \u05D0\u05D5\u05D8\u05D5\u05D1\u05D5\u05E1\u05D9\u05DD \u05D0\u05D5 \u05D9\u05D5\u05EA\u05E8 \u05E9\u05D0\u05DE\u05D5\u05E8\u05D9\u05DD \u05DC\u05E6\u05D0\u05EA \u05DE\u05D0\u05D5\u05EA\u05D5 \u05E8\u05E6\u05D9\u05E3 \u05DE\u05D5\u05E6\u05D0 \u05D1\u05D0\u05D5\u05EA\u05D4 \u05D3\u05E7\u05D4 \u2014 \u05DC\u05E4\u05D9 \u05DC\u05D5\u05D7 \u05D4\u05E8\u05D9\u05E9\u05D5\u05D9 \u05D4\u05E8\u05E9\u05DE\u05D9"), /*#__PURE__*/React.createElement("span", {
    className: "inline-flex items-center gap-2 mt-5 bg-cyan-300 text-cyan-950 px-5 py-2.5 rounded-2xl font-black text-sm group-hover:gap-3.5 transition-all"
  }, "\u05DB\u05E0\u05D9\u05E1\u05D4 ", /*#__PURE__*/React.createElement("span", null, "\u2190")))), /*#__PURE__*/React.createElement("a", {
    href: "fleet/",
    className: "group relative block overflow-hidden rounded-[2.5rem] p-8 text-right shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300",
    style: {
      background: 'linear-gradient(155deg,#0b1220 0%,#10172a 52%,#475569 100%)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute -left-8 -top-8 w-44 h-44 rounded-full opacity-25",
    style: {
      background: '#94a3b8'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between mb-6 h-28"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "126",
    height: "90",
    viewBox: "4 14 56 40",
    className: "drop-shadow-xl transition-transform duration-300 group-hover:-translate-y-1"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 16h16l4 5h32v32H6z",
    fill: "#3b82f6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M6 16h16l4 5h32v5H6z",
    fill: "#2563eb"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "16",
    y: "30",
    width: "32",
    height: "16",
    rx: "4",
    fill: "none",
    stroke: "#fff",
    strokeWidth: "2.6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16 39h32",
    stroke: "#fff",
    strokeWidth: "2.2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "23",
    cy: "46",
    r: "2.8",
    fill: "#fff"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "41",
    cy: "46",
    r: "2.8",
    fill: "#fff"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "20",
    y: "33",
    width: "6",
    height: "4",
    rx: "1",
    fill: "#fff"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "28",
    y: "33",
    width: "6",
    height: "4",
    rx: "1",
    fill: "#fff"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "36",
    y: "33",
    width: "6",
    height: "4",
    rx: "1",
    fill: "#fff"
  }))), /*#__PURE__*/React.createElement("h2", {
    className: "text-3xl font-[900] text-slate-200"
  }, "\u05E6\u05D9 \u05D4\u05E8\u05DB\u05D1\u05D9\u05DD"), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-100/80 font-bold mt-2 text-sm leading-relaxed"
  }, "\u05DB\u05DC \u05D4\u05D0\u05D5\u05D8\u05D5\u05D1\u05D5\u05E1\u05D9\u05DD \u05E9\u05E0\u05E6\u05E4\u05D5 \u05D1\u05E9\u05D9\u05D3\u05D5\u05E8\u05D9 \u05D4\u05D0\u05D9\u05DB\u05D5\u05DF \u2014 \u05DC\u05D0\u05D9\u05D6\u05D5 \u05D7\u05D1\u05E8\u05D4 \u05DB\u05DC \u05E8\u05DB\u05D1 \u05E9\u05D9\u05D9\u05DA, \u05DE\u05D0\u05D9\u05D6\u05D5 \u05E9\u05E0\u05D4, \u05DE\u05EA\u05D9 \u05E0\u05E6\u05E4\u05D4 \u05D5\u05DE\u05D4 \u05E4\u05E8\u05D8\u05D9\u05D5 \u05D1\u05DE\u05D0\u05D2\u05E8 \u05D4\u05E8\u05D9\u05E9\u05D5\u05D9"), /*#__PURE__*/React.createElement("span", {
    className: "inline-flex items-center gap-2 mt-5 bg-slate-300 text-slate-950 px-5 py-2.5 rounded-2xl font-black text-sm group-hover:gap-3.5 transition-all"
  }, "\u05DB\u05E0\u05D9\u05E1\u05D4 ", /*#__PURE__*/React.createElement("span", null, "\u2190")))), /*#__PURE__*/React.createElement("a", {
    href: "rail/",
    className: "group relative block overflow-hidden rounded-[2.5rem] p-8 text-right shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300",
    style: {
      background: 'linear-gradient(155deg,#0f172a 0%,#1e293b 45%,#0369a1 100%)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute -left-8 -top-8 w-44 h-44 rounded-full opacity-25",
    style: {
      background: '#7dd3fc'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center mb-6 h-28"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-[72px] leading-none drop-shadow-xl transition-transform duration-300 group-hover:-translate-y-1"
  }, "\uD83D\uDE86")), /*#__PURE__*/React.createElement("h2", {
    className: "text-3xl font-[900] text-sky-100"
  }, "\u05DE\u05D3\u05D3 \u05D0\u05DE\u05D9\u05E0\u05D5\u05EA \u05D4\u05E8\u05DB\u05D1\u05EA"), /*#__PURE__*/React.createElement("p", {
    className: "text-sky-100/80 font-bold mt-2 text-sm leading-relaxed"
  }, "\u05DB\u05DC \u05E8\u05DB\u05D1\u05EA \u05E9\u05D1\u05DC\u05D5\"\u05D6 \u05DE\u05D5\u05DC \u05D4\u05DE\u05D9\u05E7\u05D5\u05DD \u05E9\u05E9\u05D9\u05D3\u05E8\u05D4 \u05D1\u05E4\u05D5\u05E2\u05DC: \u05DB\u05DE\u05D4 \u05E8\u05DB\u05D1\u05D5\u05EA \u05D4\u05D2\u05D9\u05E2\u05D5 \u05D1\u05D6\u05DE\u05DF, \u05D0\u05D9\u05D7\u05D5\u05E8 \u05DC\u05E4\u05D9 \u05E7\u05D5, \u05EA\u05D7\u05E0\u05D4 \u05D5\u05E9\u05E2\u05D4, \u05D5\u05DB\u05DC \u05E0\u05E1\u05D9\u05E2\u05D4 \u05E2\u05DC \u05D4\u05DE\u05E4\u05D4 \u2014 \u05D9\u05D5\u05DD \u05D0\u05D7\u05E8\u05D9 \u05D9\u05D5\u05DD, \u05DE\u05E0\u05EA\u05D5\u05E0\u05D9 \u05D3\u05D0\u05D8\u05D0\u05D1\u05D5\u05E1"), /*#__PURE__*/React.createElement("span", {
    className: "inline-flex items-center gap-2 mt-5 bg-sky-200 text-sky-950 px-5 py-2.5 rounded-2xl font-black text-sm group-hover:gap-3.5 transition-all"
  }, "\u05DB\u05E0\u05D9\u05E1\u05D4 ", /*#__PURE__*/React.createElement("span", null, "\u2190")))), /*#__PURE__*/React.createElement("a", {
    href: "rail/reception/",
    className: "group relative block overflow-hidden rounded-[2.5rem] p-8 text-right shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300",
    style: {
      background: 'linear-gradient(155deg,#0f172a 0%,#1e293b 45%,#6d28d9 100%)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute -left-8 -top-8 w-44 h-44 rounded-full opacity-25",
    style: {
      background: '#c4b5fd'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center mb-6 h-28"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-[72px] leading-none drop-shadow-xl transition-transform duration-300 group-hover:-translate-y-1"
  }, "\uD83D\uDCF6")), /*#__PURE__*/React.createElement("h2", {
    className: "text-3xl font-[900] text-violet-100"
  }, "\u05E7\u05DC\u05D9\u05D8\u05D4 \u05D1\u05E8\u05DB\u05D1\u05EA"), /*#__PURE__*/React.createElement("p", {
    className: "text-violet-100/80 font-bold mt-2 text-sm leading-relaxed"
  }, "\u05D0\u05D9\u05E4\u05D4 \u05D9\u05E9 \u05E7\u05DC\u05D9\u05D8\u05D4 \u05E1\u05DC\u05D5\u05DC\u05E8\u05D9\u05EA \u05D1\u05E8\u05DB\u05D1\u05EA \u05D5\u05D0\u05D9\u05E4\u05D4 \u05DC\u05D0: \u05DB\u05DC 100 \u05DE\u05D8\u05E8 \u05DE\u05E1\u05D9\u05DC\u05D4 \u05DC\u05E4\u05D9 \u05D4\u05D0\u05E0\u05D8\u05E0\u05D5\u05EA \u05E9\u05DC \u05DB\u05DC \u05D7\u05D1\u05E8\u05D4, \u05D4\u05DE\u05E0\u05D4\u05E8\u05D5\u05EA, \u05DE\u05D4\u05D9\u05E8\u05D5\u05EA \u05D4\u05E0\u05E1\u05D9\u05E2\u05D4 \u05D1\u05E4\u05D5\u05E2\u05DC \u05D5\u05E1\u05D5\u05D2 \u05D4\u05E7\u05E8\u05D5\u05DF \u2014 \u05E4\u05DC\u05D0\u05E4\u05D5\u05DF, \u05E1\u05DC\u05E7\u05D5\u05DD, \u05E4\u05E8\u05D8\u05E0\u05E8 \u05D5\u05D4\u05D5\u05D8, \u05D3\u05D5\u05E8 4 \u05D5\u05D3\u05D5\u05E8 5"), /*#__PURE__*/React.createElement("span", {
    className: "inline-flex items-center gap-2 mt-5 bg-violet-200 text-violet-950 px-5 py-2.5 rounded-2xl font-black text-sm group-hover:gap-3.5 transition-all"
  }, "\u05DB\u05E0\u05D9\u05E1\u05D4 ", /*#__PURE__*/React.createElement("span", null, "\u2190")))), /*#__PURE__*/React.createElement("a", {
    href: "bus/",
    className: "group relative block overflow-hidden rounded-[2.5rem] p-8 text-right shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300",
    style: {
      background: 'linear-gradient(155deg,#0f172a 0%,#1e293b 45%,#047857 100%)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute -left-8 -top-8 w-44 h-44 rounded-full opacity-25",
    style: {
      background: '#6ee7b7'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center mb-6 h-28"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-[72px] leading-none drop-shadow-xl transition-transform duration-300 group-hover:-translate-y-1"
  }, "\uD83D\uDE8C")), /*#__PURE__*/React.createElement("h2", {
    className: "text-3xl font-[900] text-emerald-100"
  }, "\u05DE\u05D3\u05D3 \u05D3\u05D9\u05D5\u05E7 \u05D4\u05D0\u05D5\u05D8\u05D5\u05D1\u05D5\u05E1\u05D9\u05DD"), /*#__PURE__*/React.createElement("p", {
    className: "text-emerald-100/80 font-bold mt-2 text-sm leading-relaxed"
  }, "\u05DB\u05DC \u05D0\u05D5\u05D8\u05D5\u05D1\u05D5\u05E1 \u05D1\u05D0\u05E8\u05E5 \u05DE\u05D5\u05DC \u05D4\u05DC\u05D5\"\u05D6, \u05EA\u05D7\u05E0\u05D4 \u05D0\u05D7\u05E8\u05D9 \u05EA\u05D7\u05E0\u05D4: \u05DB\u05DE\u05D4 \u05D4\u05D2\u05D9\u05E2\u05D5 \u05D1\u05D6\u05DE\u05DF, \u05DE\u05D9 \u05D9\u05E6\u05D0 \u05DE\u05D5\u05E7\u05D3\u05DD \u05D5\u05DE\u05D9 \u05D0\u05D9\u05D7\u05E8 \u05D5\u05D0\u05D9\u05E4\u05D4 \u05DC\u05D0\u05D5\u05E8\u05DA \u05D4\u05E7\u05D5 \u2014 \u05DC\u05E4\u05D9 \u05E7\u05D5, \u05DE\u05E4\u05E2\u05D9\u05DC, \u05E2\u05D9\u05E8 \u05D5\u05E9\u05E2\u05D4, \u05D9\u05D5\u05DD \u05D0\u05D7\u05E8\u05D9 \u05D9\u05D5\u05DD, \u05DE\u05E0\u05EA\u05D5\u05E0\u05D9 \u05D3\u05D0\u05D8\u05D0\u05D1\u05D5\u05E1"), /*#__PURE__*/React.createElement("span", {
    className: "inline-flex items-center gap-2 mt-5 bg-emerald-200 text-emerald-950 px-5 py-2.5 rounded-2xl font-black text-sm group-hover:gap-3.5 transition-all"
  }, "\u05DB\u05E0\u05D9\u05E1\u05D4 ", /*#__PURE__*/React.createElement("span", null, "\u2190"))))), /*#__PURE__*/React.createElement("div", {
    id: "partners",
    className: "mt-12 pt-8 border-t border-slate-200"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-2xl font-black text-slate-800 mb-6"
  }, "\u05E9\u05D9\u05EA\u05D5\u05E4\u05D9 \u05E4\u05E2\u05D5\u05DC\u05D4"), /*#__PURE__*/React.createElement("div", {
    className: "grid md:grid-cols-2 xl:grid-cols-4 gap-6"
  }, /*#__PURE__*/React.createElement("a", {
    href: "parks/",
    className: "group relative block overflow-hidden rounded-[2.5rem] p-8 text-right shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300",
    style: {
      background: 'linear-gradient(155deg,#0c1e4a 0%,#1e3a8a 52%,#2563eb 100%)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute -left-8 -top-8 w-44 h-44 rounded-full opacity-25",
    style: {
      background: '#93c5fd'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap items-center justify-between mb-6 min-h-28 gap-3"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-[72px] leading-none drop-shadow-xl transition-transform duration-300 group-hover:-translate-y-1"
  }, "\uD83C\uDFED"), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap items-center justify-end gap-2",
    style: {
      flex: "1 1 170px",
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "parks/histadrut-logo-96.webp",
    alt: "\u05EA\u05D7\u05D5\u05DD \u05E7\u05D9\u05D3\u05D5\u05DD \u05EA\u05D7\u05D1\u05D5\u05E8\u05D4 \u05E6\u05D9\u05D1\u05D5\u05E8\u05D9\u05EA \u2014 \u05D4\u05D4\u05E1\u05EA\u05D3\u05E8\u05D5\u05EA",
    className: "h-12 max-w-full object-contain bg-white rounded-xl px-2.5 py-1.5 shadow"
  }), /*#__PURE__*/React.createElement("img", {
    src: "parks/rahokim-logo-96.webp",
    alt: "\u05E8\u05D7\u05D5\u05E7\u05D9\u05DD \u05D0\u05D1\u05DC \u05E9\u05D5\u05D5\u05D9\u05DD",
    className: "h-12 max-w-full object-contain bg-white rounded-xl px-2 py-1 shadow"
  }))), /*#__PURE__*/React.createElement("h2", {
    className: "text-3xl font-[900] text-blue-100"
  }, "\u05E0\u05D2\u05D9\u05E9\u05D5\u05EA \u05D0\u05D6\u05D5\u05E8\u05D9 \u05EA\u05E2\u05E9\u05D9\u05D9\u05D4"), /*#__PURE__*/React.createElement("p", {
    className: "text-blue-100/80 font-bold mt-2 text-sm leading-relaxed"
  }, "\u05E6\u05D9\u05D5\u05DF \u05E0\u05D2\u05D9\u05E9\u05D5\u05EA \u05DC\u05EA\u05D7\u05D1\u05D5\u05E8\u05D4 \u05E6\u05D9\u05D1\u05D5\u05E8\u05D9\u05EA \u05DC-414 \u05D0\u05D6\u05D5\u05E8\u05D9 \u05EA\u05E2\u05E9\u05D9\u05D9\u05D4 \u05D5\u05EA\u05E2\u05E1\u05D5\u05E7\u05D4: \u05EA\u05D3\u05D9\u05E8\u05D5\u05EA \u05D1\u05E9\u05E2\u05D5\u05EA \u05D4\u05E9\u05D9\u05D0 \u05D5\u05D4\u05DC\u05D9\u05DB\u05D4 \u05DE\u05D4\u05DE\u05E4\u05E2\u05DC \u05D4\u05E8\u05D7\u05D5\u05E7 \u05DC\u05EA\u05D7\u05E0\u05D4, \u05DE\u05E4\u05D4, \u05D3\u05D9\u05E8\u05D5\u05D2 \u05D5\u05D3\u05D5\"\u05D7 \xB7 \u05D1\u05E9\u05D9\u05EA\u05D5\u05E3 \u05DE\u05D7\u05DC\u05E7\u05EA \u05E7\u05D9\u05D3\u05D5\u05DD \u05EA\u05D7\u05D1\u05D5\u05E8\u05D4 \u05E6\u05D9\u05D1\u05D5\u05E8\u05D9\u05EA \u05D1\u05D4\u05E1\u05EA\u05D3\u05E8\u05D5\u05EA"), /*#__PURE__*/React.createElement("span", {
    className: "inline-flex items-center gap-2 mt-5 bg-blue-200 text-blue-950 px-5 py-2.5 rounded-2xl font-black text-sm group-hover:gap-3.5 transition-all"
  }, "\u05DB\u05E0\u05D9\u05E1\u05D4 ", /*#__PURE__*/React.createElement("span", null, "\u2190")))))), /*#__PURE__*/React.createElement("p", {
    "data-copyright": "",
    className: "text-center text-slate-500 font-bold text-xs mt-8"
  }, "\xA9 2026 \u05E9\u05DC\u05DE\u05D4 \u05D4\u05E8\u05D8\u05DE\u05DF \xB7 \u05E0\u05D1\u05E0\u05D4 \u05D1\u05E2\u05D6\u05E8\u05EA \u05D1\u05D9\u05E0\u05D4 \u05DE\u05DC\u05D0\u05DB\u05D5\u05EA\u05D9\u05EA \u05DC\u05E4\u05D9 \u05D4\u05E0\u05D7\u05D9\u05D5\u05EA\u05D9\u05D5 \xB7 \u05DE\u05D5\u05EA\u05E8 \u05DC\u05E6\u05D8\u05D8 \u05D5\u05DC\u05E7\u05E9\u05E8 \u05D1\u05E6\u05D9\u05D5\u05DF \u05D4\u05DE\u05E7\u05D5\u05E8 \xB7 ", /*#__PURE__*/React.createElement("a", {
    href: "mailto:shlomihartman@gmail.com",
    className: "hover:underline",
    dir: "ltr"
  }, "shlomihartman@gmail.com"), " \xB7 ", /*#__PURE__*/React.createElement("a", {
    href: "links.html",
    className: "hover:underline"
  }, "\u05E7\u05D9\u05E9\u05D5\u05E8\u05D9\u05DD"), " \xB7 ", /*#__PURE__*/React.createElement("a", {
    href: "terms.html#copyright",
    className: "hover:underline"
  }, "\u05D6\u05DB\u05D5\u05D9\u05D5\u05EA \u05D9\u05D5\u05E6\u05E8\u05D9\u05DD \u05D5\u05EA\u05E0\u05D0\u05D9 \u05E9\u05D9\u05DE\u05D5\u05E9"), " \xB7 ", /*#__PURE__*/React.createElement("a", {
    href: "accessibility.html",
    className: "hover:underline"
  }, "\u05D4\u05E6\u05D4\u05E8\u05EA \u05E0\u05D2\u05D9\u05E9\u05D5\u05EA"))));
}

// ── GoldenApp — כלי "הקו המוזהב": קווים מצטיינים ─────────────────────────
function GoldenApp({
  onBack,
  trips,
  costBenchmarkTable,
  lineCitiesMap,
  liveOf,
  liveGen,
  focusMakat,
  onClearFocus
}) {
  const [goldenTab, setGoldenTab] = useState('top');
  const [filterDistrict, setFilterDistrict] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [sortBy, setSortBy] = useState('score');
  const [visibleCount, setVisibleCount] = useState(60);
  const [selectedLine, setSelectedLine] = useState(null);
  const [expandSearch, setExpandSearch] = useState('');
  const [expandCity, setExpandCity] = useState('');
  const [expandMatches, setExpandMatches] = useState([]);
  // "לא נמצא" הוצג כבר מההקשה הראשונה, לפני שחיפשו — הדגל נדלק רק בלחיצת חיפוש
  const [expandSearched, setExpandSearched] = useState(false);
  // ניתוח לפי כיוון נסיעה — ערבוב הלוך+חזור מיצע כיוון עמוס עם כיוון ריק
  const [expandDir, setExpandDir] = useState(null);
  useEffect(() => {
    setExpandDir(null);
  }, [selectedLine && selectedLine.groupKey]);
  const [gTripsCity, setGTripsCity] = useState('');
  const [gTripsCrowded, setGTripsCrowded] = useState(false);
  const [gTripsSort, setGTripsSort] = useState({
    key: 'peakLoad',
    direction: 'desc'
  });
  const [gTripsVisible, setGTripsVisible] = useState(80);
  const [areaFilter, setAreaFilter] = useState(null);
  // הגדרות הניקוד של המשתמש (שלמה 07.09) + סינון מספרי על הרשימה
  const [gset, updGset, resetGset, gsetDefault] = useStoredSettings('kb-golden-score', GOLD_DEFAULTS);
  const [gFilt, setGFilt] = useState({
    minRiders: null,
    minTrips: null,
    maxCost: null,
    minPeak: null
  });
  const gFiltOn = Object.values(gFilt).some(v => v != null);

  // ניקוד מוזהב (0-100, גבוה יותר = טוב יותר) — ברוח הפוכה לניקוד קו פח,
  // אבל עם רכיבים ומשקולות משלו — לא "הפוך מדויק"
  const goldenLines = useMemo(() => {
    if (!trips || trips.length === 0) return [];
    const cityOnlyStr = s => s ? s.indexOf(' - ') > 0 ? s.slice(0, s.indexOf(' - ')).trim() : s.split('/')[0].trim() : '';
    const groups = {};
    for (let i = 0; i < trips.length; i++) {
      const t = trips[i];
      // הסינון ברמת הנסיעה: קבוצה מקובצת לפי מספר-קו+ערים ויכולה לערבב
      // מק"ט מבוטל עם מק"ט חי (קווי 97/85/87 בחיפה) — פסילה לפי המק"ט
      // הראשון העלימה את הקו החי כולו מהרשימה (ציד הבאגים, סבב ב)
      const tl = liveOf ? liveOf(t.makat) : null;
      if (tl && tl.rm) continue;
      const o = cityOnlyStr(t.origin);
      const d = cityOnlyStr(t.dest);
      const cityPair = [o, d].sort().join('-');
      const groupKey = `${t.lineNum}_${cityPair}`;
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(t);
    }
    return Object.entries(groups).map(([groupKey, data]) => {
      const lineNum = data[0].lineNum;
      // קו שכבר בוטל לפי ארכיון "הקו בזמן" לא יכול להיות "מצטיין" של היום,
      // ובטח לא לקבל המלצת "הוסיפו נסיעות" (סעיף 29). הצילום הוא מיוני
      // 2026 — ההצלבה מגלה ביטולים שקרו מאז.
      const live = liveOf ? liveOf(data[0].makat) : null;
      if (live && live.rm) return null;
      const totalTrips = data.reduce((s, t) => s + t.tripCount, 0);
      if (totalTrips < 3) return null;
      const totalRiders = data.reduce((s, t) => s + t.ridership * t.tripCount, 0);
      const avgRiders = totalTrips > 0 ? totalRiders / totalTrips : 0;
      const totalPeaks = data.reduce((s, t) => s + t.peakLoad * t.tripCount, 0);
      const avgPeak = totalTrips > 0 ? totalPeaks / totalTrips : 0;

      // הקיבולת מחושבת לפני שער הכניסה, משוקללת בנסיעות — ממוצע פשוט על
      // שורות נתן משקל שווה לווריאנט של נסיעה אחת ולווריאנט של מאה
      const avgCapacity = data.reduce((s, t) => s + (t.capacity || 50) * t.tripCount, 0) / (totalTrips || 1) || 50;
      const scale = avgCapacity / 50;

      // דרישת סף לקו מוזהב: ממוצע הנוסעים והשיא ביחס לקיבולת. הסף הקבוע
      // (30) חסם פיזית קווי מיניבוס — קיבולת 19 לא מגיעה לשיא 30 לעולם,
      // ומצוינות בפריפריה נשארה בלתי-נראית. עכשיו מיניבוס מלא נמדד כמו
      // אוטובוס מלא: 30 × (קיבולת/50).
      // סף הכניסה (30) ניתן לשינוי בהגדרות הניקוד של המשתמש
      const entryTh = (Number(gset.entryRiders) || 0) * scale;
      if (avgRiders <= entryTh || avgPeak <= entryTh) return null;
      const category = classifyLine({
        opGroup: data[0].opGroup,
        uniqueness: data[0].uniquenessVal,
        lineType: data[0].lineType,
        distance: data[0].distance,
        trips: totalTrips,
        isNight: data[0].isNightLine,
        isFeeding: data[0].isFeedingLine
      });
      // בקו המוזהב: סף = ממוצע ארצי × 1.5 לפי קטגוריה; לילה נשאר 25 כפי שנקבע
      const isUrban = category === 'עירוני תדירות גבוהה' || category === 'עירוני תדירות נמוכה';
      const GOLDEN_RIDER_THRESHOLD = {
        'עירוני תדירות גבוהה': 44,
        'עירוני תדירות נמוכה': 21,
        'בינעירוני ארוך': 26,
        'בינעירוני קצר': 22,
        'תלמידים': 23,
        'אזורי': 12,
        'קווים מזינים': 12,
        'לילה': 25
      };
      const lowRiderTh = GOLDEN_RIDER_THRESHOLD[category] ?? (LOW_RIDER_THRESHOLD[category] || 10);
      const costBenchmark = lookupCostBenchmark(costBenchmarkTable, category, data[0].district);
      const lowTrips = data.filter(t => t.ridership < lowRiderTh);
      const lowCount = lowTrips.reduce((s, t) => s + t.tripCount, 0);
      const percentLow = totalTrips > 0 ? lowCount / totalTrips * 100 : 0;
      const wastedKm = Math.round(lowTrips.reduce((s, t) => s + (t.distance || 0) * t.tripCount, 0));
      const totalKm = Math.round(data.reduce((s, t) => s + (t.distance || 0) * t.tripCount, 0));
      const wastedRatio = totalKm > 0 ? wastedKm / totalKm : 0;
      const validCosts = data.filter(t => t.cost > 0);
      const avgCost = validCosts.length > 0 ? validCosts.reduce((s, t) => s + t.cost, 0) / validCosts.length : 0;
      const costRatio = costBenchmark > 0 && avgCost > 0 ? avgCost / costBenchmark : 0;

      // ── ניקוד מוזהב ──
      // כל רכיב מחושב כשבר (0–1) ומוכפל בנקודות שהמשתמש קבע לו (ברירת
      // המחדל: 20/15/20/15/10/20). סף ריק = הסף האוטומטי לפי הקטגוריה;
      // סף שהמשתמש הקליד הוא מספר נוסעים מוחלט (לא לפי קיבולת הרכב).
      const G = gset.c;
      // 1. נסיעות ברמה גבוהה — חלק הנסיעות שמעל סף הנוסעים של הקטגוריה
      const fHighTrips = Math.max(0, Math.min(1, (100 - percentLow) / 100));

      // 2. יעילות ק"מ — חלק הק"מ שנסוע על נסיעות מאוכלסות
      const fEfficientKm = Math.max(0, Math.min(1, 1 - wastedRatio));

      // 3. עלות לנוסע — מתחת ל-90% (עירוני) / 80% (שאר) מהממוצע = מלוא הנקודות
      const fullCostTh = G.cost.full != null ? G.cost.full / 100 : isUrban ? 0.90 : 0.80;
      let fCost = 0;
      if (costRatio === 0) fCost = 0.5;else if (costRatio <= fullCostTh) fCost = 1;else if (costRatio <= 1.0) fCost = 0.6;else if (costRatio <= 1.3) fCost = 0.3;else fCost = 0;

      // 4. עמוס נוסעים — ממוצע נוסעים לנסיעה: מלוא הנקודות מ-2×סף הקטגוריה,
      //    חצי (בקירוב) מ-1.2×; המשתמש יכול לקבוע "כמה אנשים = מלוא הנקודות"
      const rFull = G.avgRiders.full != null ? G.avgRiders.full : lowRiderTh * 2 * scale;
      const rHalf = G.avgRiders.half != null ? G.avgRiders.half : G.avgRiders.full != null ? G.avgRiders.full * 0.6 : lowRiderTh * 1.2 * scale;
      let fAvgRiders = 0;
      if (avgRiders >= rFull) fAvgRiders = 1;else if (avgRiders >= rHalf) fAvgRiders = 8 / 15;

      // 5. עמוס שיא — 30 נוסעים בקטע העמוס (לפי קיבולת) = מלוא הנקודות, 20 = חצי
      const pFull = G.peak.full != null ? G.peak.full : 30 * scale;
      const pHalf = G.peak.half != null ? G.peak.half : G.peak.full != null ? G.peak.full * 2 / 3 : 20 * scale;
      let fPeak = 0;
      if (avgPeak >= pFull) fPeak = 1;else if (avgPeak >= pHalf) fPeak = 0.5;

      // 6. נפח שבועי = ממוצע נוסעים × נסיעות שבועיות — מתגמל קווים שגם
      //    עמוסים וגם תדירים; קו פעם/יום לא יוכל להגיע ל-100
      const weeklyVolume = avgRiders * totalTrips;
      const volHalf = G.volume.half != null ? G.volume.half : G.volume.full != null ? G.volume.full * 0.4 : lowRiderTh * 20;
      const volFull = G.volume.full != null ? G.volume.full : lowRiderTh * 50;
      let fVolume = 0;
      if (weeklyVolume >= volFull) fVolume = 1;else if (weeklyVolume >= volHalf) fVolume = 0.5;
      const pts = (k, f) => G[k].on ? f * (Number(G[k].max) || 0) : 0;
      const highTripsScore = pts('highTrips', fHighTrips);
      const efficientKmScore = pts('efficientKm', fEfficientKm);
      const costScore = pts('cost', fCost);
      const avgRidersScore = pts('avgRiders', fAvgRiders);
      const peakScore = pts('peak', fPeak);
      const volumeScore = pts('volume', fVolume);
      const maxSum = maxSumOf(G);
      const rawScore = normScore(highTripsScore + efficientKmScore + costScore + avgRidersScore + peakScore + volumeScore, maxSum);

      // קו מוזהב דורש ניקוד 60 ומעלה (ניתן לשינוי בהגדרות)
      if (rawScore < (Number(gset.minScore) || 0)) return null;
      const sortedData = [...data].sort((a, b) => Number(String(a.direction).replace(/\D/g, '')) - Number(String(b.direction).replace(/\D/g, '')));
      return {
        lineNum,
        groupKey,
        live,
        // דלתא מהארכיון — לתג "הושבת וחזר" על הכרטיס
        score: rawScore,
        category,
        district: sortedData[0].district,
        origin: sortedData[0].origin,
        dest: sortedData[0].dest,
        makat: sortedData[0].makat,
        count: totalTrips,
        avg: avgRiders.toFixed(1),
        avgPeak: Math.round(avgPeak),
        percentLow: Math.round(percentLow),
        wastedKm,
        totalKm,
        nonWastedKm: Math.max(0, totalKm - wastedKm),
        cost: avgCost,
        costRatio: Number(costRatio.toFixed(2)),
        costBenchmark,
        // הפירוט חייב להסתכם לציון — רכיב הנפח השבועי (עד 20 נק') היה
        // מושמט מכאן, ומי שחיבר את המספרים המוצגים לא הגיע לסכום
        componentScores: {
          highTrips: Math.round(highTripsScore),
          efficientKm: Math.round(efficientKmScore),
          cost: Math.round(costScore),
          avgRiders: Math.round(avgRidersScore),
          peak: Math.round(peakScore),
          volume: Math.round(volumeScore)
        },
        maxSum
      };
    }).filter(Boolean).sort((a, b) => b.score - a.score);
  }, [trips, costBenchmarkTable, liveOf, gset]);
  const allDistricts = useMemo(() => [...new Set(goldenLines.map(l => l.district).filter(Boolean))].sort(), [goldenLines]);
  const allCategories = useMemo(() => [...CATEGORIES], []);
  const filtered = useMemo(() => {
    let r = [...goldenLines];
    // קישור עמוק לקו בודד — מסנן אליו בלבד עד שהמשתמש מנקה
    if (focusMakat) {
      const fm = String(focusMakat).replace(/^0+/, '').trim();
      r = r.filter(l => String(l.makat || '').replace(/^0+/, '').trim() === fm);
    }
    if (filterDistrict !== 'all') r = r.filter(l => l.district === filterDistrict);
    if (filterCategory !== 'all') r = r.filter(l => l.category === filterCategory);
    // סינון מספרי (שלמה 07.09: "גם בקו המוזהב אפשרות לעשות סינון")
    if (gFilt.minRiders != null) r = r.filter(l => Number(l.avg) >= gFilt.minRiders);
    if (gFilt.minPeak != null) r = r.filter(l => l.avgPeak >= gFilt.minPeak);
    if (gFilt.minTrips != null) r = r.filter(l => l.count >= gFilt.minTrips);
    if (gFilt.maxCost != null) r = r.filter(l => l.costRatio > 0 && l.costRatio <= gFilt.maxCost / 100);
    if (submittedSearch) {
      const q = submittedSearch.toLowerCase();
      r = r.filter(l => {
        if (l.origin.toLowerCase().includes(q) || l.dest.toLowerCase().includes(q)) return true;
        if (String(l.lineNum).includes(q)) return true;
        const cleanMakat = String(l.makat || '').replace(/^0+/, '').trim();
        const citiesSet = lineCitiesMap.get(cleanMakat);
        return citiesSet ? Array.from(citiesSet).some(c => c.includes(q)) : false;
      });
    }
    if (sortBy === 'riders') r.sort((a, b) => Number(b.avg) - Number(a.avg));else if (sortBy === 'cost') r.sort((a, b) => (a.costRatio || Infinity) - (b.costRatio || Infinity));else if (sortBy === 'km') r.sort((a, b) => b.totalKm - a.totalKm);else r.sort((a, b) => b.score - a.score);
    return r;
  }, [goldenLines, filterDistrict, filterCategory, submittedSearch, sortBy, lineCitiesMap, focusMakat, gFilt]);
  const areaStats = useMemo(() => {
    const map = new Map();
    goldenLines.forEach(line => {
      if (!line.district) return;
      if (line.score < 80) return;
      if (!map.has(line.district)) map.set(line.district, {
        key: line.district,
        count: 0,
        totalScore: 0,
        totalRiders: 0,
        totalTrips: 0,
        totalKm: 0
      });
      const s = map.get(line.district);
      s.count++;
      s.totalScore += line.score;
      s.totalRiders += Number(line.avg);
      s.totalTrips += line.count;
      s.totalKm += line.totalKm;
    });
    return [...map.values()].map(s => ({
      ...s,
      avgScore: Math.round(s.totalScore / s.count),
      avgRiders: (s.totalRiders / s.count).toFixed(1)
    })).sort((a, b) => b.count - a.count);
  }, [goldenLines]);
  const isLoading = !trips || trips.length === 0;
  const scoreColor = s => s >= 85 ? '#d97706' : s >= 70 ? '#b45309' : '#92400e';
  const GoldBadge = ({
    score
  }) => /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-center w-14 h-14 rounded-2xl flex-shrink-0 font-black text-xl shadow-inner",
    style: {
      background: 'linear-gradient(145deg,#fef3c7,#fbbf24)',
      color: scoreColor(score),
      border: '2px solid #f59e0b'
    }
  }, score);
  const selectCls = "bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 font-black outline-none focus:border-slate-900 text-right shadow-sm w-full md:w-auto appearance-none cursor-pointer";
  const exportAreaToExcel = async areaKey => {
    await loadXLSX();
    const lines = goldenLines.filter(l => l.district === areaKey && l.score >= 80);
    if (!lines.length) return;
    const data = lines.map(l => ({
      'מספר קו': l.lineNum,
      'מק"ט': l.makat || '',
      'מוצא': l.origin || '',
      'יעד': l.dest || '',
      'מחוז': l.district || '',
      'קטגוריה': l.category || '',
      'ניקוד מוזהב': l.score,
      'ממוצע נוסעים לנסיעה': parseFloat(l.avg),
      'עומס שיא ממוצע': l.avgPeak,
      'נסיעות בשבוע': l.count,
      'עלות לנוסע': l.cost > 0 ? `₪${l.cost.toFixed(2)}` : 'לא זמין',
      'ק"מ שבועי כולל': Math.round(l.totalKm || 0),
      'ק"מ סרק': Math.round(l.wastedKm || 0)
    }));
    const ws = window.XLSX.utils.json_to_sheet(data);
    if (!ws['!views']) ws['!views'] = [];
    ws['!views'].push({
      rightToLeft: true
    });
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'קווים_מצטיינים');
    window.XLSX.writeFile(wb, `קו_מוזהב_${areaKey.replace(/\s+/g, '_')}.xlsx`);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen bg-[#F8FAFC] text-slate-900 p-4 md:p-6 pb-20",
    style: {
      fontFamily: "'Heebo', sans-serif"
    },
    dir: "rtl"
  }, /*#__PURE__*/React.createElement("div", {
    className: "max-w-6xl mx-auto"
  }, /*#__PURE__*/React.createElement("header", {
    className: "mb-10 flex flex-col md:flex-row items-center justify-between gap-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-center md:text-right"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3 justify-center md:justify-end"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-slate-900 text-white p-2.5 rounded-2xl rotate-3 shadow-lg"
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "star",
    size: 28,
    strokeWidth: "2"
  })), /*#__PURE__*/React.createElement("h1", {
    className: "text-4xl font-[900] text-slate-900 tracking-tighter leading-none"
  }, "\u05D4\u05E7\u05D5 \u05D4\u05DE\u05D5\u05D6\u05D4\u05D1"), /*#__PURE__*/React.createElement("span", {
    className: "text-xs font-bold text-slate-500 mr-3"
  }, "\u05E0\u05D1\u05E0\u05D4 \u05E2\u05DC \u05D9\u05D3\u05D9 \u05E9\u05DC\u05DE\u05D4 \u05D4\u05E8\u05D8\u05DE\u05DF")), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-500 text-sm font-bold mt-2 pr-1"
  }, "\u05DE\u05D0\u05EA\u05E8\u05D9\u05DD \u05E7\u05D5\u05D5\u05D9\u05DD \u05DE\u05E6\u05D8\u05D9\u05D9\u05E0\u05D9\u05DD \u2022 \u05D9\u05E2\u05D9\u05DC\u05D5\u05EA \u05D2\u05D1\u05D5\u05D4\u05D4, \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05E8\u05D1\u05D9\u05DD"), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-500 text-[11px] font-bold mt-1 pr-1"
  }, "\u05E0\u05EA\u05D5\u05E0\u05D9 \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05D5\u05E2\u05DC\u05D5\u05D9\u05D5\u05EA: \u05E6\u05D9\u05DC\u05D5\u05DD \u05DE\u05E9\u05E8\u05D3 \u05D4\u05EA\u05D7\u05D1\u05D5\u05E8\u05D4, \u05D9\u05D5\u05E0\u05D9 2026", ' · הצלבה מול רישום הקווים העדכני: ', liveGen ? String(liveGen).split('-').reverse().join('.') : /*#__PURE__*/React.createElement("span", {
    className: "inline-block w-16 h-[1em] align-middle bg-slate-100 rounded",
    "aria-hidden": "true"
  }))), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onBack,
    className: "kb-home",
    title: "\u05D7\u05D6\u05E8\u05D4 \u05DC\u05E2\u05DE\u05D5\u05D3 \u05D4\u05E8\u05D0\u05E9\u05D9"
  }, "\u2190 \u05D7\u05D6\u05E8\u05D4 \u05DC\u05E7\u05D5 \u05D4\u05D1\u05D5\u05D7\u05DF")), /*#__PURE__*/React.createElement("nav", {
    className: "flex bg-slate-200/50 backdrop-blur p-1.5 rounded-[2rem] mb-12 max-w-4xl mx-auto shadow-inner border border-slate-200 overflow-x-auto"
  }, [['top', 'star', 'הקווים המצטיינים', 'bg-white text-amber-700 shadow-md'], ['areas', 'chart', 'ניתוח אזורי', 'bg-white text-amber-700 shadow-md'], ['expand', 'zap', 'הזדמנויות הרחבה', 'bg-white text-emerald-700 shadow-md'], ['allTrips', 'list', 'כל הנסיעות', 'bg-white text-rose-600 shadow-md'], ['about', 'info', 'על המערכת', 'bg-white text-indigo-600 shadow-md']].map(([id, icon, label, activeCls]) => /*#__PURE__*/React.createElement("button", {
    key: id,
    onClick: () => setGoldenTab(id),
    className: `flex-1 min-w-[120px] py-3.5 rounded-[1.5rem] font-black text-sm transition-all flex items-center justify-center gap-2 ${goldenTab === id ? activeCls : 'text-slate-600 hover:text-slate-800'}`
  }, /*#__PURE__*/React.createElement(Ic, {
    n: icon,
    size: 16
  }), " ", label))), goldenTab === 'top' && /*#__PURE__*/React.createElement("div", {
    className: "space-y-8 transition-opacity duration-300 opacity-100"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col xl:flex-row justify-between items-center gap-4"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    className: "text-2xl font-black text-slate-900"
  }, "\u05D4\u05E7\u05D5\u05D5\u05D9\u05DD \u05D4\u05DB\u05D9 \u05DE\u05E6\u05D8\u05D9\u05D9\u05E0\u05D9\u05DD"), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-500 font-bold"
  }, "\u05D3\u05D9\u05E8\u05D5\u05D2 \u05D4\u05DE\u05E6\u05D9\u05D2 \u05D0\u05EA \u05D4\u05E7\u05D5\u05D5\u05D9\u05DD \u05D4\u05D7\u05D6\u05E7\u05D9\u05DD \u05D1\u05D9\u05D5\u05EA\u05E8 \u05D1\u05DE\u05E2\u05E8\u05DB\u05EA \u2014 \u05D1\u05D9\u05E7\u05D5\u05E9 \u05D2\u05D1\u05D5\u05D4, \u05D9\u05E2\u05D9\u05DC\u05D5\u05EA \u05D2\u05D1\u05D5\u05D4\u05D4 \u05D5\u05E2\u05DC\u05D5\u05EA \u05E0\u05DE\u05D5\u05DB\u05D4")), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col md:flex-row gap-3 relative w-full xl:w-auto"
  }, /*#__PURE__*/React.createElement("select", {
    "aria-label": "\u05DE\u05D9\u05D5\u05DF \u05D4\u05E7\u05D5\u05D5\u05D9\u05DD \u05D4\u05DE\u05E6\u05D8\u05D9\u05D9\u05E0\u05D9\u05DD",
    value: sortBy,
    onChange: e => {
      setSortBy(e.target.value);
      setVisibleCount(60);
    },
    className: selectCls
  }, /*#__PURE__*/React.createElement("option", {
    value: "score"
  }, "\u05DE\u05D9\u05D5\u05DF: \u05DC\u05E4\u05D9 \u05E0\u05D9\u05E7\u05D5\u05D3 \u05DE\u05D5\u05D6\u05D4\u05D1"), /*#__PURE__*/React.createElement("option", {
    value: "riders"
  }, "\u05DE\u05D9\u05D5\u05DF: \u05DE\u05DE\u05D5\u05E6\u05E2 \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD (\u05D2\u05D1\u05D5\u05D4 \u05DC\u05E0\u05DE\u05D5\u05DA)"), /*#__PURE__*/React.createElement("option", {
    value: "cost"
  }, "\u05DE\u05D9\u05D5\u05DF: \u05E2\u05DC\u05D5\u05EA \u05DC\u05E0\u05D5\u05E1\u05E2 (\u05E0\u05DE\u05D5\u05DA \u05DC\u05D2\u05D1\u05D5\u05D4)"), /*#__PURE__*/React.createElement("option", {
    value: "km"
  }, "\u05DE\u05D9\u05D5\u05DF: \u05E7\"\u05DE \u05E9\u05D1\u05D5\u05E2\u05D9")), /*#__PURE__*/React.createElement("select", {
    "aria-label": "\u05E1\u05D9\u05E0\u05D5\u05DF \u05DC\u05E4\u05D9 \u05DE\u05D7\u05D5\u05D6",
    value: filterDistrict,
    onChange: e => {
      setFilterDistrict(e.target.value);
      setVisibleCount(60);
    },
    className: selectCls
  }, /*#__PURE__*/React.createElement("option", {
    value: "all"
  }, "\u05DB\u05DC \u05D4\u05DE\u05D7\u05D5\u05D6\u05D5\u05EA"), allDistricts.map(d => /*#__PURE__*/React.createElement("option", {
    key: d,
    value: d
  }, d))), /*#__PURE__*/React.createElement("select", {
    "aria-label": "\u05E1\u05D9\u05E0\u05D5\u05DF \u05DC\u05E4\u05D9 \u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4",
    value: filterCategory,
    onChange: e => {
      setFilterCategory(e.target.value);
      setVisibleCount(60);
    },
    className: selectCls
  }, /*#__PURE__*/React.createElement("option", {
    value: "all"
  }, "\u05DB\u05DC \u05D4\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D5\u05EA"), allCategories.map(c => /*#__PURE__*/React.createElement("option", {
    key: c,
    value: c
  }, c))), /*#__PURE__*/React.createElement("div", {
    className: "relative w-full md:w-64"
  }, /*#__PURE__*/React.createElement("input", {
    type: "text",
    placeholder: "\u05D4\u05E7\u05DC\u05D3 \u05E2\u05D9\u05E8 \u05D5\u05DC\u05D7\u05E5 Enter...",
    value: searchQuery,
    onChange: e => setSearchQuery(e.target.value),
    onKeyDown: e => {
      if (e.key === 'Enter') {
        setSubmittedSearch(searchQuery);
        setVisibleCount(60);
      }
      if (e.key === 'Escape') {
        setSearchQuery('');
        setSubmittedSearch('');
      }
    },
    className: "bg-slate-50 border-2 border-slate-200 rounded-2xl px-6 py-3 pl-12 font-black outline-none focus:border-slate-900 text-right shadow-sm w-full"
  }), searchQuery && /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setSearchQuery('');
      setSubmittedSearch('');
    },
    className: "absolute top-1/2 -translate-y-1/2 left-3 w-6 h-6 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 font-black text-sm flex items-center justify-center transition-colors"
  }, "\xD7")))), /*#__PURE__*/React.createElement(ScoreSettingsPanel, {
    title: "\u05DE\u05D4 \u05E0\u05D7\u05E9\u05D1 \u05E7\u05D5 \u05DE\u05D5\u05D6\u05D4\u05D1? \u05DB\u05D0\u05DF \u05E7\u05D5\u05D1\u05E2\u05D9\u05DD \u05D0\u05EA \u05D4\u05E0\u05D9\u05E7\u05D5\u05D3",
    accent: "amber",
    settings: gset,
    update: updGset,
    reset: resetGset,
    isDefault: gsetDefault,
    intro: "\u05DC\u05DB\u05DC \u05D3\u05D1\u05E8 \u05E9\u05E0\u05DE\u05D3\u05D3 \u05D0\u05E4\u05E9\u05E8 \u05DC\u05E7\u05D1\u05D5\u05E2 \u05DB\u05DE\u05D4 \u05E0\u05E7\u05D5\u05D3\u05D5\u05EA \u05D4\u05D5\u05D0 \u05E0\u05D5\u05EA\u05DF, \u05D5\u05DC\u05DB\u05DE\u05D4 \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05DE\u05D2\u05D9\u05E2\u05D5\u05EA \u05DE\u05DC\u05D5\u05D0 \u05D4\u05E0\u05E7\u05D5\u05D3\u05D5\u05EA. \u05E9\u05D3\u05D4 \u05E1\u05E3 \u05E8\u05D9\u05E7 = \u05D4\u05E1\u05E3 \u05D4\u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9 \u05E9\u05DC \u05D4\u05D0\u05EA\u05E8 \u05DC\u05E4\u05D9 \u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D9\u05EA \u05D4\u05E7\u05D5 (\u05E2\u05D9\u05E8\u05D5\u05E0\u05D9, \u05D1\u05D9\u05E0\u05E2\u05D9\u05E8\u05D5\u05E0\u05D9 \u05D5\u05DB\u05D5\u05F3). \u05D4\u05E8\u05E9\u05D9\u05DE\u05D4 \u05DE\u05EA\u05E2\u05D3\u05DB\u05E0\u05EA \u05DE\u05D9\u05D3.",
    rows: [{
      key: 'highTrips',
      label: 'נסיעות בביקוש גבוה',
      hint: 'איזה חלק מהנסיעות עובר את סף הנוסעים של הקטגוריה'
    }, {
      key: 'efficientKm',
      label: 'יעילות ק"מ',
      hint: 'איזה חלק מהקילומטרים נסוע על נסיעות מאוכלסות'
    }, {
      key: 'cost',
      label: 'עלות לנוסע',
      hint: 'ביחס לממוצע הקטגוריה',
      params: [{
        k: 'full',
        label: 'מלוא הנקודות עד',
        auto: '90/80',
        unit: '% מהממוצע',
        min: 10,
        max: 300,
        width: 'w-20',
        title: 'ברירת המחדל: עירוני 90%, שאר הקווים 80%'
      }]
    }, {
      key: 'avgRiders',
      label: 'ממוצע נוסעים לנסיעה',
      hint: 'כמה אנשים בממוצע בנסיעה',
      params: [{
        k: 'full',
        label: 'מלוא הנקודות מ-',
        auto: 'אוטו',
        unit: 'נוסעים',
        min: 1,
        max: 500,
        title: 'ברירת המחדל: פי 2 מסף הקטגוריה, לפי קיבולת הרכב'
      }, {
        k: 'half',
        label: 'חצי מ-',
        auto: 'אוטו',
        unit: 'נוסעים',
        min: 1,
        max: 500
      }]
    }, {
      key: 'peak',
      label: 'עומס שיא',
      hint: 'כמה אנשים בקטע העמוס ביותר',
      params: [{
        k: 'full',
        label: 'מלוא הנקודות מ-',
        auto: '30',
        unit: 'נוסעים',
        min: 1,
        max: 300
      }, {
        k: 'half',
        label: 'חצי מ-',
        auto: '20',
        unit: 'נוסעים',
        min: 1,
        max: 300
      }]
    }, {
      key: 'volume',
      label: 'נפח שבועי',
      hint: 'ממוצע נוסעים × נסיעות בשבוע',
      params: [{
        k: 'full',
        label: 'מלוא הנקודות מ-',
        auto: 'אוטו',
        unit: 'נוסעים בשבוע',
        min: 1,
        max: 999999,
        width: 'w-24'
      }, {
        k: 'half',
        label: 'חצי מ-',
        auto: 'אוטו',
        unit: 'נוסעים בשבוע',
        min: 1,
        max: 999999,
        width: 'w-24'
      }]
    }],
    extras: /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap gap-x-6 gap-y-2 text-[12px] font-bold text-slate-700 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3"
    }, /*#__PURE__*/React.createElement("label", {
      className: "inline-flex items-center gap-2"
    }, "\u05E1\u05E3 \u05DB\u05E0\u05D9\u05E1\u05D4: \u05DE\u05DE\u05D5\u05E6\u05E2 \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05D5\u05D2\u05DD \u05E2\u05D5\u05DE\u05E1 \u05E9\u05D9\u05D0 \u05DE\u05E2\u05DC", /*#__PURE__*/React.createElement(NumField, {
      value: gset.entryRiders,
      onChange: v => updGset(s => ({
        ...s,
        entryRiders: v == null ? 0 : Math.max(0, v)
      })),
      min: 0,
      max: 300,
      suffix: "\u05E0\u05D5\u05E1\u05E2\u05D9\u05DD (\u05DC\u05E4\u05D9 \u05E7\u05D9\u05D1\u05D5\u05DC\u05EA)",
      title: "\u05E7\u05D5 \u05E9\u05DC\u05D0 \u05E2\u05D5\u05D1\u05E8 \u05D0\u05EA \u05E9\u05E0\u05D9 \u05D4\u05E1\u05E4\u05D9\u05DD \u05DC\u05D0 \u05E0\u05DB\u05E0\u05E1 \u05DC\u05E8\u05E9\u05D9\u05DE\u05D4 \u05D1\u05DB\u05DC\u05DC"
    })), /*#__PURE__*/React.createElement("label", {
      className: "inline-flex items-center gap-2"
    }, "\u05E7\u05D5 \u05DE\u05D5\u05D6\u05D4\u05D1 = \u05E6\u05D9\u05D5\u05DF \u05E9\u05DC \u05DC\u05E4\u05D7\u05D5\u05EA", /*#__PURE__*/React.createElement(NumField, {
      value: gset.minScore,
      onChange: v => updGset(s => ({
        ...s,
        minScore: v == null ? 0 : Math.max(0, Math.min(100, v))
      })),
      min: 0,
      max: 100,
      suffix: "\u05DE\u05EA\u05D5\u05DA 100"
    }))),
    footnote: "\u05D4\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05E0\u05E9\u05DE\u05E8\u05D5\u05EA \u05D1\u05D3\u05E4\u05D3\u05E4\u05DF \u05D4\u05D6\u05D4 \u05D1\u05DC\u05D1\u05D3. \u05D4\u05E0\u05D9\u05EA\u05D5\u05D7 \u05D4\u05D0\u05D6\u05D5\u05E8\u05D9 \u05DE\u05DE\u05E9\u05D9\u05DA \u05DC\u05E1\u05E4\u05D5\u05E8 \u05E7\u05D5\u05D5\u05D9\u05DD \u05E2\u05DD \u05E6\u05D9\u05D5\u05DF 80 \u05D5\u05DE\u05E2\u05DC\u05D4 \u05DC\u05E4\u05D9 \u05D4\u05E0\u05D9\u05E7\u05D5\u05D3 \u05E9\u05E7\u05D1\u05E2\u05EA\u05DD."
  }), /*#__PURE__*/React.createElement("div", {
    className: "bg-white border-2 border-slate-100 rounded-[2rem] px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-[12px] font-bold text-slate-700"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-black text-slate-900 text-sm"
  }, "\uD83D\uDD0E \u05E1\u05D9\u05E0\u05D5\u05DF:"), /*#__PURE__*/React.createElement("label", {
    className: "inline-flex items-center gap-2"
  }, "\u05DE\u05DE\u05D5\u05E6\u05E2 \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05DE-", /*#__PURE__*/React.createElement(NumField, {
    value: gFilt.minRiders,
    onChange: v => {
      setGFilt(f => ({
        ...f,
        minRiders: v
      }));
      setVisibleCount(60);
    },
    min: 0,
    max: 500,
    width: "w-16"
  })), /*#__PURE__*/React.createElement("label", {
    className: "inline-flex items-center gap-2"
  }, "\u05E2\u05D5\u05DE\u05E1 \u05E9\u05D9\u05D0 \u05DE-", /*#__PURE__*/React.createElement(NumField, {
    value: gFilt.minPeak,
    onChange: v => {
      setGFilt(f => ({
        ...f,
        minPeak: v
      }));
      setVisibleCount(60);
    },
    min: 0,
    max: 300,
    width: "w-16"
  })), /*#__PURE__*/React.createElement("label", {
    className: "inline-flex items-center gap-2"
  }, "\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05D1\u05E9\u05D1\u05D5\u05E2 \u05DE-", /*#__PURE__*/React.createElement(NumField, {
    value: gFilt.minTrips,
    onChange: v => {
      setGFilt(f => ({
        ...f,
        minTrips: v
      }));
      setVisibleCount(60);
    },
    min: 0,
    max: 5000,
    width: "w-16"
  })), /*#__PURE__*/React.createElement("label", {
    className: "inline-flex items-center gap-2"
  }, "\u05E2\u05DC\u05D5\u05EA \u05DC\u05E0\u05D5\u05E1\u05E2 \u05E2\u05D3", /*#__PURE__*/React.createElement(NumField, {
    value: gFilt.maxCost,
    onChange: v => {
      setGFilt(f => ({
        ...f,
        maxCost: v
      }));
      setVisibleCount(60);
    },
    min: 1,
    max: 500,
    width: "w-16",
    suffix: "% \u05DE\u05D4\u05DE\u05DE\u05D5\u05E6\u05E2"
  })), gFiltOn && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setGFilt({
      minRiders: null,
      minTrips: null,
      maxCost: null,
      minPeak: null
    }),
    className: "text-xs font-black text-amber-700 hover:text-amber-900 underline"
  }, "\u2715 \u05E0\u05E7\u05D4 \u05E1\u05D9\u05E0\u05D5\u05DF"), /*#__PURE__*/React.createElement("span", {
    className: "text-slate-500 mr-auto"
  }, filtered.length.toLocaleString(), " \u05E7\u05D5\u05D5\u05D9\u05DD")), focusMakat && /*#__PURE__*/React.createElement("div", {
    className: "mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-sm font-black text-amber-800"
  }, "\uD83D\uDD17 \u05DE\u05E6\u05D9\u05D2 \u05E7\u05D5 \u05DE\u05E9\u05D5\u05EA\u05E3 (\u05DE\u05E7\"\u05D8 ", focusMakat, ")"), /*#__PURE__*/React.createElement("button", {
    className: "text-xs font-black text-amber-700 hover:text-amber-900 underline",
    onClick: onClearFocus
  }, "\u2715 \u05D4\u05E6\u05D2 \u05D0\u05EA \u05DB\u05DC \u05D4\u05E7\u05D5\u05D5\u05D9\u05DD")), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
  }, filtered.slice(0, visibleCount).map((line, idx) => /*#__PURE__*/React.createElement("div", {
    key: line.groupKey,
    className: "vcard bg-white border-2 border-slate-100 rounded-[2.5rem] p-7 shadow-sm hover:border-slate-900 transition-all text-right flex flex-col group relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-start justify-between mb-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col gap-2 items-start text-right"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 flex-wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "px-4 py-1.5 rounded-full text-[11px] font-black border bg-emerald-50 text-emerald-700 border-emerald-200"
  }, "\u05E0\u05D9\u05E7\u05D5\u05D3 ", line.score, "/100"), /*#__PURE__*/React.createElement("div", {
    className: "px-3 py-1.5 rounded-full text-[11px] font-black bg-slate-100 text-slate-700 border border-slate-200"
  }, line.category)), /*#__PURE__*/React.createElement("div", {
    className: "text-[10px] font-bold text-slate-500"
  }, "\u05DE\u05E7\"\u05D8: ", String(line.makat || '').replace(/^0+/, '') || '—')), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col items-center gap-1 shrink-0"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-slate-900 text-white w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl shadow-lg"
  }, line.lineNum), /*#__PURE__*/React.createElement("button", {
    className: "text-[10px] font-black text-slate-500 hover:text-slate-900 transition-colors",
    title: "\u05D4\u05E2\u05EA\u05E7\u05EA \u05E7\u05D9\u05E9\u05D5\u05E8 \u05D9\u05E9\u05D9\u05E8 \u05DC\u05E7\u05D5 \u05D4\u05D6\u05D4",
    onClick: e => {
      const url = location.origin + location.pathname + '#מוזהב/קו/' + String(line.makat || '').replace(/^0+/, '');
      try {
        navigator.clipboard.writeText(url);
      } catch (err) {/* ignore */}
      const b = e.currentTarget;
      const t = b.textContent;
      b.textContent = '✓ הועתק';
      setTimeout(() => {
        b.textContent = t;
      }, 1500);
    }
  }, "\uD83D\uDD17 \u05E9\u05D9\u05EA\u05D5\u05E3"))), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 mb-5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-start gap-3 mb-2 min-w-0"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-slate-900 font-black text-lg truncate leading-tight"
  }, line.origin), /*#__PURE__*/React.createElement("div", {
    className: "text-slate-300 text-2xl font-black shrink-0 leading-none"
  }, "\u2190"), /*#__PURE__*/React.createElement("div", {
    className: "text-slate-900 font-black text-lg truncate leading-tight"
  }, line.dest)), /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md"
  }, line.district), line.live && !line.live.rm && line.live.gap && /*#__PURE__*/React.createElement("span", {
    className: "mr-2 text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full",
    title: 'הקו הושבת בין ' + String(line.live.gap[0]).split('-').reverse().join('.') + ' ל-' + String(line.live.gap[1]).split('-').reverse().join('.') + ' וחזר — נתוני הנוסעים עשויים לשקף גם את תקופת ההשבתה'
  }, "\u23F8 \u05D4\u05D5\u05E9\u05D1\u05EA \u05D5\u05D7\u05D6\u05E8"), /*#__PURE__*/React.createElement("div", {
    className: "text-xs font-bold text-slate-500 mt-4 mb-4 flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("span", null, "\u05E0\u05D9\u05E7\u05D5\u05D3 \u05DE\u05D5\u05D6\u05D4\u05D1:"), /*#__PURE__*/React.createElement("span", {
    className: "font-black text-emerald-700"
  }, line.score, "/100")), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2.5 pt-4 border-t border-slate-100"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between text-sm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-700 font-bold"
  }, "\u05DE\u05DE\u05D5\u05E6\u05E2 \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05DC\u05E0\u05E1\u05D9\u05E2\u05D4"), /*#__PURE__*/React.createElement("span", {
    className: "font-black text-slate-900"
  }, line.avg)), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between text-sm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-700 font-bold"
  }, "\u05E2\u05D5\u05DE\u05E1 \u05E9\u05D9\u05D0 \u05DE\u05DE\u05D5\u05E6\u05E2"), /*#__PURE__*/React.createElement("span", {
    className: "font-black text-slate-900"
  }, line.avgPeak)), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between text-sm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-700 font-bold"
  }, "\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05D1\u05E9\u05D1\u05D5\u05E2"), /*#__PURE__*/React.createElement("span", {
    className: "font-black text-slate-900"
  }, line.count)), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between text-sm gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-700 font-bold"
  }, "\u05E2\u05DC\u05D5\u05EA \u05EA\u05E4\u05E2\u05D5\u05DC\u05D9\u05EA \u05DC\u05E0\u05D5\u05E1\u05E2"), /*#__PURE__*/React.createElement("span", {
    className: "text-right"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-black text-slate-900"
  }, line.cost > 0 ? `₪${line.cost.toFixed(2)}` : 'לא זמין'), line.cost > 0 && line.costBenchmark > 0 && /*#__PURE__*/React.createElement("div", {
    className: "text-[10px] font-bold text-slate-500"
  }, "\u05DE\u05DE\u05D5\u05E6\u05E2 ", line.category, ": \u20AA", line.costBenchmark, line.costRatio < 1 && /*#__PURE__*/React.createElement("span", {
    className: "text-emerald-700 mr-1"
  }, "(\xD7", line.costRatio.toFixed(2), ")"), line.costRatio >= 1 && /*#__PURE__*/React.createElement("span", {
    className: "text-slate-500 mr-1"
  }, "(\xD7", line.costRatio.toFixed(2), ")")))), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between text-sm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-700 font-bold"
  }, "\u05E7\"\u05DE \u05DC\u05D0 \u05DE\u05D1\u05D5\u05D6\u05D1\u05D6 (\u05E9\u05D9\u05DE\u05D5\u05E9\u05D9)"), /*#__PURE__*/React.createElement("span", {
    className: "font-black text-emerald-700"
  }, (line.nonWastedKm || 0).toLocaleString(), " \u05E7\"\u05DE")), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between text-sm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-600 font-bold"
  }, "\u05E7\"\u05DE \u05DE\u05D1\u05D5\u05D6\u05D1\u05D6 (\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05E1\u05E8\u05E7)"), /*#__PURE__*/React.createElement("span", {
    className: "font-black text-rose-600"
  }, line.wastedKm.toLocaleString(), " \u05E7\"\u05DE")))), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setSelectedLine(line);
      setGoldenTab('expand');
    },
    className: "w-full py-4 bg-slate-900 text-white rounded-2xl text-xs font-black hover:bg-black transition-all shadow-md"
  }, "\u05D7\u05E4\u05E9 \u05D4\u05D6\u05D3\u05DE\u05E0\u05D5\u05D9\u05D5\u05EA \u05D4\u05E8\u05D7\u05D1\u05D4"))), filtered.length === 0 && (/* אותו טיפול כמו בקו פח: קישור משותף לקו שירד מהרשימה */
  focusMakat && trips.some(t => String(t.makat || '').replace(/^0+/, '').trim() === String(focusMakat).replace(/^0+/, '').trim()) ? /*#__PURE__*/React.createElement("div", {
    className: "col-span-full bg-white border-2 border-amber-200 rounded-[2rem] p-8 text-right shadow-sm"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3 mb-3 flex-wrap"
  }, /*#__PURE__*/React.createElement("span", {
    className: "bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-4 py-1.5 text-[11px] font-black"
  }, "\u05D9\u05E8\u05D3 \u05DE\u05D4\u05E8\u05E9\u05D9\u05DE\u05D4 \u05D1\u05E2\u05D3\u05DB\u05D5\u05DF \u05D4\u05D0\u05D7\u05E8\u05D5\u05DF"), /*#__PURE__*/React.createElement("span", {
    className: "font-black text-slate-900 text-lg"
  }, "\u05DE\u05E7\"\u05D8 ", focusMakat)), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-600 font-bold text-sm leading-relaxed"
  }, "\u05D4\u05E7\u05D5 \u05E7\u05D9\u05D9\u05DD \u05D1\u05DE\u05E2\u05E8\u05DB\u05EA, \u05D0\u05D1\u05DC \u05D1\u05E2\u05D3\u05DB\u05D5\u05DF \u05D4\u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05D4\u05D0\u05D7\u05E8\u05D5\u05DF \u05D4\u05D5\u05D0 \u05DB\u05D1\u05E8 \u05DC\u05D0 \u05E2\u05D5\u05D1\u05E8 \u05D0\u05EA \u05D4\u05E1\u05E3 \u05DC\u05E8\u05E9\u05D9\u05DE\u05EA \u05D4\u05DE\u05E6\u05D8\u05D9\u05D9\u05E0\u05D9\u05DD."), /*#__PURE__*/React.createElement("button", {
    onClick: onClearFocus,
    className: "mt-4 bg-slate-900 hover:bg-black text-white px-6 py-3 rounded-2xl text-xs font-black transition-colors"
  }, "\u2715 \u05E0\u05E7\u05D4 \u05D0\u05EA \u05D4\u05E1\u05D9\u05E0\u05D5\u05DF \u05D5\u05D7\u05D6\u05D5\u05E8 \u05DC\u05E8\u05E9\u05D9\u05DE\u05D4")) : /*#__PURE__*/React.createElement("div", {
    className: "col-span-full text-center py-20 text-slate-500 font-bold"
  }, "\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D5 \u05E7\u05D5\u05D5\u05D9\u05DD \u05DE\u05E6\u05D8\u05D9\u05D9\u05E0\u05D9\u05DD \u05D1\u05E1\u05D9\u05E0\u05D5\u05DF \u05D4\u05E0\u05D5\u05DB\u05D7\u05D9."))), filtered.length > visibleCount && /*#__PURE__*/React.createElement("button", {
    onClick: () => setVisibleCount(v => v + 60),
    className: "w-full py-4 rounded-[2rem] border-2 border-slate-200 text-slate-500 font-black text-sm hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
  }, "\u05D8\u05E2\u05DF \u05E2\u05D5\u05D3 (", filtered.length - visibleCount, " \u05E0\u05D5\u05EA\u05E8\u05D5)")), goldenTab === 'areas' && /*#__PURE__*/React.createElement("div", {
    className: "space-y-8 transition-opacity duration-300 opacity-100"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col xl:flex-row justify-between items-center gap-4"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    className: "text-2xl font-black text-slate-900"
  }, "\u05D4\u05D0\u05D6\u05D5\u05E8\u05D9\u05DD \u05D4\u05DB\u05D9 \u05D7\u05D6\u05E7\u05D9\u05DD"), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-500 font-bold"
  }, "\u05E8\u05D9\u05DB\u05D5\u05D6 \u05D4\u05E7\u05D5\u05D5\u05D9\u05DD \u05D4\u05DE\u05E6\u05D8\u05D9\u05D9\u05E0\u05D9\u05DD \u05DC\u05E4\u05D9 \u05DE\u05D7\u05D5\u05D6 \u2014 \u05DC\u05D7\u05E5 \u05E2\u05DC \u05DE\u05D7\u05D5\u05D6 \u05DC\u05E6\u05E4\u05D9\u05D9\u05D4 \u05D1\u05E7\u05D5\u05D5\u05D9\u05D5")), areaFilter && /*#__PURE__*/React.createElement("button", {
    onClick: () => setAreaFilter(null),
    className: "shrink-0 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-2xl font-black text-sm transition-colors"
  }, "\u2715 \u05E0\u05E7\u05D4 \u05E1\u05D9\u05E0\u05D5\u05DF: ", areaFilter)), !areaFilter && /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
  }, areaStats.map((area, idx) => /*#__PURE__*/React.createElement("div", {
    key: area.key,
    onClick: () => setAreaFilter(area.key),
    className: "bg-white border-2 border-slate-100 rounded-[2.5rem] p-7 shadow-sm hover:border-slate-900 transition-all text-right flex flex-col cursor-pointer group"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-start mb-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "px-4 py-1.5 rounded-full text-[11px] font-black border bg-emerald-50 border-emerald-200 text-emerald-700"
  }, "\u05E0\u05D9\u05E7\u05D5\u05D3 \u05DE\u05DE\u05D5\u05E6\u05E2: ", area.avgScore), /*#__PURE__*/React.createElement("button", {
    onClick: e => {
      e.stopPropagation();
      exportAreaToExcel(area.key);
    },
    className: "bg-emerald-100 hover:bg-emerald-200 text-emerald-700 w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm transition-all shrink-0",
    title: "\u05D9\u05D9\u05E6\u05D5\u05D0 \u05E0\u05EA\u05D5\u05E0\u05D9 \u05D4\u05D0\u05D6\u05D5\u05E8 \u05DC\u05D0\u05E7\u05E1\u05DC"
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "download",
    size: 20
  }))), /*#__PURE__*/React.createElement("h3", {
    className: "text-2xl font-black text-slate-900 mb-4"
  }, area.key), /*#__PURE__*/React.createElement("div", {
    className: "space-y-3 pt-4 border-t border-slate-100 text-sm mb-5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-600 font-bold"
  }, "\u05E7\u05D5\u05D5\u05D9\u05DD \u05DE\u05E6\u05D8\u05D9\u05D9\u05E0\u05D9\u05DD"), /*#__PURE__*/React.createElement("span", {
    className: "font-black text-slate-900"
  }, area.count, " \u05E7\u05D5\u05D5\u05D9\u05DD")), /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-600 font-bold"
  }, "\u05DE\u05DE\u05D5\u05E6\u05E2 \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD"), /*#__PURE__*/React.createElement("span", {
    className: "font-black text-slate-900"
  }, area.avgRiders)), /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-600 font-bold"
  }, "\u05E1\u05D4\"\u05DB \u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05E9\u05D1\u05D5\u05E2\u05D9\u05D5\u05EA"), /*#__PURE__*/React.createElement("span", {
    className: "font-black text-slate-900"
  }, area.totalTrips.toLocaleString())), /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-600 font-bold"
  }, "\u05E1\u05D4\"\u05DB \u05E7\"\u05DE \u05E9\u05D1\u05D5\u05E2\u05D9\u05D9\u05DD"), /*#__PURE__*/React.createElement("span", {
    className: "font-black text-slate-900"
  }, area.totalKm.toLocaleString(), " \u05E7\"\u05DE"))), /*#__PURE__*/React.createElement("button", {
    className: "mt-auto w-full py-4 bg-slate-900 text-white rounded-2xl text-xs font-black hover:bg-black transition-all shadow-md"
  }, "\u05E6\u05E4\u05D4 \u05D1\u05E7\u05D5\u05D5\u05D9\u05DD \u05D0\u05DC\u05D5"))), areaStats.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "col-span-full text-center py-20 text-slate-500 font-bold"
  }, "\u05D0\u05D9\u05DF \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD.")), areaFilter && /*#__PURE__*/React.createElement("div", {
    className: "space-y-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
  }, goldenLines.filter(l => l.district === areaFilter && l.score >= 80).map(line => /*#__PURE__*/React.createElement("div", {
    key: line.groupKey,
    className: "bg-white border-2 border-slate-100 rounded-[2.5rem] p-7 shadow-sm hover:border-slate-900 transition-all text-right flex flex-col group"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-start justify-between mb-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col gap-2 items-start"
  }, /*#__PURE__*/React.createElement("div", {
    className: "px-4 py-1.5 rounded-full text-[11px] font-black border bg-emerald-50 text-emerald-700 border-emerald-200"
  }, "\u05E0\u05D9\u05E7\u05D5\u05D3 ", line.score, "/100"), /*#__PURE__*/React.createElement("div", {
    className: "px-3 py-1.5 rounded-full text-[11px] font-black bg-slate-100 text-slate-700 border border-slate-200"
  }, line.category)), /*#__PURE__*/React.createElement("div", {
    className: "bg-slate-900 text-white w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl shadow-lg shrink-0"
  }, line.lineNum)), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3 mb-3 min-w-0"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-slate-900 font-black text-lg truncate leading-tight"
  }, line.origin), /*#__PURE__*/React.createElement("div", {
    className: "text-slate-300 text-2xl font-black shrink-0"
  }, "\u2190"), /*#__PURE__*/React.createElement("div", {
    className: "text-slate-900 font-black text-lg truncate leading-tight"
  }, line.dest)), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2 text-sm border-t border-slate-100 pt-3 mb-5 flex-1"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-600 font-bold"
  }, "\u05DE\u05DE\u05D5\u05E6\u05E2 \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD"), /*#__PURE__*/React.createElement("span", {
    className: "font-black"
  }, line.avg)), /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-600 font-bold"
  }, "\u05E2\u05D5\u05DE\u05E1 \u05E9\u05D9\u05D0"), /*#__PURE__*/React.createElement("span", {
    className: "font-black"
  }, line.avgPeak)), /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-600 font-bold"
  }, "\u05E2\u05DC\u05D5\u05EA \u05DC\u05E0\u05D5\u05E1\u05E2"), /*#__PURE__*/React.createElement("span", {
    className: "font-black"
  }, line.cost > 0 ? `₪${line.cost.toFixed(2)}` : '—'))), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setSelectedLine(line);
      setGoldenTab('expand');
    },
    className: "w-full py-3 bg-slate-900 text-white rounded-2xl text-xs font-black hover:bg-black transition-all shadow-md"
  }, "\u05D7\u05E4\u05E9 \u05D4\u05D6\u05D3\u05DE\u05E0\u05D5\u05D9\u05D5\u05EA \u05D4\u05E8\u05D7\u05D1\u05D4")))))), goldenTab === 'expand' && (() => {
    if (!selectedLine) {
      const doExpandSearch = () => {
        const q = expandSearch.trim();
        if (!q) return;
        setExpandSearched(true);
        // מק"ט מוקלד כפי שמוצג בכרטיס (עם אפסים מובילים) החמיץ — משווים בלי אפסים
        const qn = q.replace(/^0+/, '');
        let matches = goldenLines.filter(l => String(l.lineNum) === q || String(l.makat || '').replace(/^0+/, '') === qn);
        if (matches.length === 0) {
          // הקו לא ברשימת המצטיינים — בונים אותו ישירות מנתוני הנסיעות (כל קו במערכת)
          const cityOnly2 = s2 => s2 ? s2.indexOf(' - ') > 0 ? s2.slice(0, s2.indexOf(' - ')).trim() : s2.split('/')[0].trim() : '';
          const seen = new Map();
          trips.forEach(t => {
            if (String(t.lineNum) !== q && String(t.makat || '').replace(/^0+/, '') !== qn) return;
            const pair = [cityOnly2(t.origin), cityOnly2(t.dest)].sort().join('-');
            const gk = `${t.lineNum}_${pair}`;
            if (!seen.has(gk)) seen.set(gk, {
              lineNum: t.lineNum,
              makat: t.makat,
              origin: t.origin,
              dest: t.dest,
              district: t.district || '',
              groupKey: gk,
              notGolden: true
            });
          });
          matches = [...seen.values()];
        }
        const c = expandCity.trim().toLowerCase();
        if (c) matches = matches.filter(l => (l.origin || '').toLowerCase().includes(c) || (l.dest || '').toLowerCase().includes(c));
        if (matches.length === 1) {
          setSelectedLine(matches[0]);
          setExpandMatches([]);
        } else setExpandMatches(matches);
      };
      return /*#__PURE__*/React.createElement("div", {
        className: "bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm max-w-4xl mx-auto transition-opacity duration-300 opacity-100"
      }, /*#__PURE__*/React.createElement("header", {
        className: "mb-8"
      }, /*#__PURE__*/React.createElement("h2", {
        className: "text-2xl font-black text-slate-900 mb-2"
      }, "\u05D4\u05D6\u05D3\u05DE\u05E0\u05D5\u05D9\u05D5\u05EA \u05D4\u05E8\u05D7\u05D1\u05D4"), /*#__PURE__*/React.createElement("p", {
        className: "text-slate-500 font-bold text-sm leading-relaxed"
      }, "\u05D4\u05DE\u05E2\u05E8\u05DB\u05EA \u05DE\u05D6\u05D4\u05D4 \u05D0\u05EA \u05D7\u05DC\u05D5\u05E0\u05D5\u05EA \u05D4\u05D6\u05DE\u05DF \u05D4\u05E2\u05DE\u05D5\u05E1\u05D9\u05DD \u05E9\u05DC \u05D4\u05E7\u05D5 \u05D5\u05DE\u05E6\u05D9\u05E2\u05D4 ", /*#__PURE__*/React.createElement("strong", null, "\u05E9\u05E2\u05D5\u05EA \u05D9\u05E6\u05D9\u05D0\u05D4 \u05E7\u05D5\u05E0\u05E7\u05E8\u05D8\u05D9\u05D5\u05EA \u05DC\u05D4\u05D5\u05E1\u05E4\u05D4"), ", \u05E2\u05D3 \u05DC\u05D4\u05D5\u05E8\u05D3\u05EA \u05D4\u05E2\u05D5\u05DE\u05E1 \u05DC\u05E8\u05DE\u05D4 \u05E0\u05D5\u05D7\u05D4 (85% \u05DE\u05D4\u05E7\u05D9\u05D1\u05D5\u05DC\u05EA). \u05D0\u05E4\u05E9\u05E8 \u05DC\u05E0\u05EA\u05D7 ", /*#__PURE__*/React.createElement("strong", null, "\u05DB\u05DC \u05E7\u05D5 \u05D1\u05DE\u05E2\u05E8\u05DB\u05EA"), " \u2014 \u05DC\u05D0 \u05E8\u05E7 \u05D0\u05EA \u05D4\u05DE\u05E6\u05D8\u05D9\u05D9\u05E0\u05D9\u05DD.")), /*#__PURE__*/React.createElement("div", {
        className: "bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 mb-4 shadow-inner"
      }, /*#__PURE__*/React.createElement("div", {
        className: "grid grid-cols-1 md:grid-cols-2 gap-6 mb-2"
      }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
        className: "block text-xs font-[900] text-slate-500 mb-3 pr-2 uppercase tracking-wider"
      }, "\u05DE\u05E1\u05E4\u05E8 \u05E7\u05D5 / \u05DE\u05E7\"\u05D8"), /*#__PURE__*/React.createElement("input", {
        type: "text",
        value: expandSearch,
        onChange: e => {
          setExpandSearch(e.target.value);
          setExpandMatches([]);
          setExpandSearched(false);
        },
        onKeyDown: e => e.key === 'Enter' && doExpandSearch(),
        placeholder: "\u05DC\u05DE\u05E9\u05DC 1, 480...",
        className: "w-full bg-white border-2 border-slate-200 rounded-2xl px-5 py-3 font-black text-sm outline-none focus:border-slate-900 shadow-sm transition-all text-right"
      })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
        className: "block text-xs font-[900] text-slate-500 mb-3 pr-2 uppercase tracking-wider"
      }, "\u05E2\u05D9\u05E8 (\u05E8\u05E9\u05D5\u05EA \u2014 \u05DC\u05E6\u05DE\u05E6\u05D5\u05DD \u05EA\u05D5\u05E6\u05D0\u05D5\u05EA)"), /*#__PURE__*/React.createElement("input", {
        type: "text",
        value: expandCity,
        onChange: e => {
          setExpandCity(e.target.value);
          setExpandMatches([]);
          setExpandSearched(false);
        },
        onKeyDown: e => e.key === 'Enter' && doExpandSearch(),
        placeholder: "\u05D4\u05E7\u05DC\u05D3 \u05E9\u05DD \u05E2\u05D9\u05E8...",
        className: "w-full bg-white border-2 border-slate-200 rounded-2xl px-5 py-3 font-black text-sm outline-none focus:border-slate-900 shadow-sm transition-all text-right"
      }))), /*#__PURE__*/React.createElement("div", {
        className: "flex flex-wrap items-center gap-4 pt-6 border-t border-slate-200 mt-6"
      }, /*#__PURE__*/React.createElement("button", {
        onClick: doExpandSearch,
        className: "bg-amber-500 hover:bg-amber-600 text-white px-10 py-4 rounded-2xl font-black transition-all shadow-lg active:scale-95 flex items-center gap-3"
      }, /*#__PURE__*/React.createElement(Ic, {
        n: "zap",
        size: 20
      }), " \u05D7\u05E4\u05E9 \u05D4\u05D6\u05D3\u05DE\u05E0\u05D5\u05D9\u05D5\u05EA"), /*#__PURE__*/React.createElement("button", {
        onClick: () => setGoldenTab('top'),
        className: "bg-white border-2 border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300 px-6 py-4 rounded-2xl font-black text-sm transition-colors"
      }, "\u2190 \u05D7\u05D6\u05E8\u05D4 \u05DC\u05E8\u05E9\u05D9\u05DE\u05EA \u05D4\u05DE\u05E6\u05D8\u05D9\u05D9\u05E0\u05D9\u05DD"))), expandMatches.length > 1 && /*#__PURE__*/React.createElement("div", {
        className: "space-y-2 mb-2 mt-6"
      }, /*#__PURE__*/React.createElement("p", {
        className: "text-xs font-black text-slate-500 text-right"
      }, "\u05E0\u05DE\u05E6\u05D0\u05D5 \u05DE\u05E1\u05E4\u05E8 \u05DE\u05E1\u05DC\u05D5\u05DC\u05D9\u05DD \u2014 \u05D1\u05D7\u05E8:"), expandMatches.map(l => /*#__PURE__*/React.createElement("button", {
        key: l.groupKey,
        onClick: () => {
          setSelectedLine(l);
          setExpandMatches([]);
        },
        className: "w-full text-right bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-300 rounded-2xl px-5 py-3 font-black text-sm transition-colors"
      }, "\u05E7\u05D5 ", l.lineNum, " \xB7 ", l.origin, " \u2190 ", l.dest, " \xB7 ", l.district, l.notGolden && /*#__PURE__*/React.createElement("span", {
        className: "mr-2 text-[10px] font-black bg-slate-100 text-slate-500 border border-slate-200 rounded-full px-2 py-0.5"
      }, "\u05DC\u05D0 \u05D1\u05E8\u05E9\u05D9\u05DE\u05EA \u05D4\u05DE\u05E6\u05D8\u05D9\u05D9\u05E0\u05D9\u05DD")))), expandSearched && expandMatches.length === 0 && expandSearch && /*#__PURE__*/React.createElement("p", {
        className: "text-xs font-bold text-rose-700 text-right mt-4"
      }, "\u05E7\u05D5 ", expandSearch, " \u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0 \u05D1\u05DE\u05E2\u05E8\u05DB\u05EA", expandCity ? " בעיר שהוקלדה" : ""));
    }

    // מסננים לפי אותו groupKey שבו מקובצים הקווים המצטיינים (lineNum + צמד ערים),
    // אחרת "קו 1" יאסוף את כל הקווים שמספרם 1 בכל הארץ וידלל את העומס
    const cityOnly = s => s ? s.indexOf(' - ') > 0 ? s.slice(0, s.indexOf(' - ')).trim() : s.split('/')[0].trim() : '';
    const lineTrips = trips.filter(t => {
      const pair = [cityOnly(t.origin), cityOnly(t.dest)].sort().join('-');
      return `${t.lineNum}_${pair}` === selectedLine.groupKey;
    });
    // ניתוח לפי כיוון (כמו בסימולטור של קו פח): מיצוע הלוך+חזור הסתיר
    // כיוון בוקר דחוס מאחורי כיוון חוזר ריק, ו"השעות המוצעות" נבנו
    // משני הכיוונים יחד — מרווחים שלא קיימים באף כיוון בפועל.
    // ברירת המחדל: הכיוון העמוס יותר.
    const dirs = [...new Set(lineTrips.map(t => String(t.direction || '')))].filter(Boolean).sort();
    const dirWeight = d => lineTrips.filter(t => String(t.direction || '') === d).reduce((s, t) => s + (t.peakLoad || 0) * t.tripCount, 0);
    const chosenDir = dirs.length > 1 ? expandDir && dirs.includes(expandDir) ? expandDir : dirs.slice().sort((a, b) => dirWeight(b) - dirWeight(a))[0] : dirs[0] || null;
    const dirTrips = dirs.length > 1 ? lineTrips.filter(t => String(t.direction || '') === chosenDir) : lineTrips;
    const periods = {
      'לילה (00-06)': [],
      'בוקר שיא (06-09)': [],
      'בוקר (09-12)': [],
      'צהריים (12-15)': [],
      'אחה"צ שיא (15-18)': [],
      'ערב (18-22)': [],
      'לילה מאוחר (22-24)': []
    };
    const periodRange = [[0, 360], [360, 540], [540, 720], [720, 900], [900, 1080], [1080, 1320], [1320, 1440]];
    dirTrips.forEach(t => {
      const mins = t.timeMins;
      if (mins == null) return;
      const idx = periodRange.findIndex(([a, b]) => mins >= a && mins < b);
      if (idx >= 0) {
        const key = Object.keys(periods)[idx];
        periods[key].push(t);
      }
    });
    // יעד עומס נוח = 85% מקיבולת האוטובוס. מעבר לזה — האוטובוס צפוף וצריך נסיעות נוספות.
    // נסיעות להוספה = נסיעות שיביאו את העומס הממוצע חזרה ליעד הנוח.
    const TARGET_LOAD = 0.85;
    const minsToStr = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`;
    // שעות יציאה מוצעות — בדיוק כמספר הנסיעות שההמלצה קובעת (בקשת
    // שלמה, סעיף 32): קודם הרשימה הציעה עשרות שעות (ציפוף כל הלוח
    // ל-5 דקות) ליד המלצה של "הוסיפו 3" — שני מספרים סותרים על אותו
    // כרטיס. עכשיו: בכל פעם מפוצל המרווח הגדול ביותר שנותר בלוח,
    // עד שמגיעים למספר המומלץ. מרווח של 5 דקות ומטה לא מפוצל.
    const MIN_HEADWAY = 5;
    const suggestTimes = (pts, n) => {
      const times = [...new Set(pts.map(t => t.timeMins).filter(m => m != null && m > 0))].sort((a, b) => a - b);
      if (times.length < 2 || !n || n <= 0) return {
        times: [],
        total: 0
      };
      const gaps = [];
      for (let i = 0; i < times.length - 1; i++) gaps.push([times[i], times[i + 1]]);
      const picks = [];
      for (let k = 0; k < n; k++) {
        gaps.sort((a, b) => b[1] - b[0] - (a[1] - a[0]));
        const g = gaps[0];
        if (!g || g[1] - g[0] <= MIN_HEADWAY * 2) break; // אין מרווח שאפשר לפצל
        const mid = Math.round((g[0] + g[1]) / 2);
        picks.push(mid);
        gaps.shift();
        gaps.push([g[0], mid], [mid, g[1]]);
      }
      picks.sort((a, b) => a - b);
      return {
        times: picks.map(minsToStr),
        total: picks.length
      };
    };
    const periodStats = Object.entries(periods).map(([label, pts]) => {
      if (pts.length === 0) return {
        label,
        count: 0,
        avgRiders: 0,
        avgPeak: 0,
        capacity: 0,
        occupancy: 0,
        tripsToAdd: 0,
        suggestedTimes: [],
        moreTimes: 0
      };
      const totalTrips = pts.reduce((s, t) => s + t.tripCount, 0);
      const avgRiders = totalTrips > 0 ? pts.reduce((s, t) => s + t.ridership * t.tripCount, 0) / totalTrips : 0;
      const avgPeak = totalTrips > 0 ? pts.reduce((s, t) => s + t.peakLoad * t.tripCount, 0) / totalTrips : 0;
      // קיבולת מייצגת לחלון — הקיבולת הגדולה ביותר בין נסיעות החלון
      const capacity = Math.max(...pts.map(t => t.capacity || 50), 50);
      const target = capacity * TARGET_LOAD;
      const occupancy = capacity > 0 ? avgPeak / capacity : 0;
      let tripsToAdd = 0;
      if (avgPeak > target && totalTrips > 0) {
        const needed = Math.ceil(totalTrips * avgPeak / target);
        tripsToAdd = Math.max(0, needed - totalTrips);
      }
      const sug = tripsToAdd > 0 ? suggestTimes(pts, tripsToAdd) : {
        times: [],
        total: 0
      };
      return {
        label,
        count: totalTrips,
        avgRiders: avgRiders.toFixed(1),
        avgPeak: Math.round(avgPeak),
        capacity,
        occupancy,
        tripsToAdd,
        suggestedTimes: sug.times,
        moreTimes: Math.max(0, sug.total - sug.times.length)
      };
    }).filter(p => p.count > 0);
    const maxRiders = Math.max(...periodStats.map(p => Number(p.avgRiders)), 1);
    const totalTripsToAdd = periodStats.reduce((s, p) => s + p.tripsToAdd, 0);
    const crowdedWindows = periodStats.filter(p => p.tripsToAdd > 0).sort((a, b) => b.tripsToAdd - a.tripsToAdd);
    return /*#__PURE__*/React.createElement("div", {
      className: "space-y-8 transition-opacity duration-300 opacity-100"
    }, /*#__PURE__*/React.createElement("div", {
      className: "bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col xl:flex-row justify-between items-start gap-4"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-3 mb-2 flex-wrap"
    }, /*#__PURE__*/React.createElement("div", {
      className: "bg-slate-900 text-white w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl shadow-md"
    }, selectedLine.lineNum), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
      className: "text-2xl font-black text-slate-900"
    }, "\u05D4\u05D6\u05D3\u05DE\u05E0\u05D5\u05D9\u05D5\u05EA \u05D4\u05E8\u05D7\u05D1\u05D4 \u2014 \u05E7\u05D5 ", selectedLine.lineNum, selectedLine.notGolden && /*#__PURE__*/React.createElement("span", {
      className: "mr-2 align-middle text-[11px] font-black bg-slate-100 text-slate-500 border border-slate-200 rounded-full px-3 py-1"
    }, "\u05E0\u05D1\u05D7\u05E8 \u05D9\u05D3\u05E0\u05D9\u05EA \u2014 \u05DC\u05D0 \u05D1\u05E8\u05E9\u05D9\u05DE\u05EA \u05D4\u05DE\u05E6\u05D8\u05D9\u05D9\u05E0\u05D9\u05DD")), /*#__PURE__*/React.createElement("p", {
      className: "text-slate-500 font-bold"
    }, selectedLine.origin, " \u2190 ", selectedLine.dest, " \xB7 ", selectedLine.district))), /*#__PURE__*/React.createElement("p", {
      className: "text-slate-500 font-bold text-sm mt-2"
    }, "\u05D7\u05D9\u05E9\u05D5\u05D1 \u05DB\u05DE\u05D4 \u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05DB\u05D3\u05D0\u05D9 \u05DC\u05D4\u05D5\u05E1\u05D9\u05E3 \u05DB\u05D3\u05D9 \u05DC\u05D4\u05D5\u05E8\u05D9\u05D3 \u05D0\u05EA \u05D4\u05E2\u05D5\u05DE\u05E1 \u05DC\u05E8\u05DE\u05D4 \u05E0\u05D5\u05D7\u05D4 (\u05E2\u05D3 85% \u05DE\u05E7\u05D9\u05D1\u05D5\u05DC\u05EA \u05D4\u05D0\u05D5\u05D8\u05D5\u05D1\u05D5\u05E1)"), (() => {
      const sl = liveOf ? liveOf(selectedLine.makat) : null;
      return sl && sl.rm ? /*#__PURE__*/React.createElement("div", {
        className: "mt-3 bg-red-50 border-2 border-red-200 text-red-700 rounded-2xl px-4 py-3 text-sm font-black"
      }, "\u2716 \u05DC\u05E4\u05D9 \u05D0\u05E8\u05DB\u05D9\u05D5\u05DF \"\u05D4\u05E7\u05D5 \u05D1\u05D6\u05DE\u05DF\", \u05D4\u05E7\u05D5 \u05D4\u05D6\u05D4 \u05DB\u05D1\u05E8 \u05D0\u05D9\u05E0\u05D5 \u05E7\u05D9\u05D9\u05DD \u05D1\u05E8\u05D9\u05E9\u05D5\u05DD", sl.rmd ? ' (נעלם ב-' + String(sl.rmd).split('-').reverse().join('.') + ')' : '', " \u2014 \u05D0\u05D9\u05DF \u05D8\u05E2\u05DD \u05DC\u05D4\u05D5\u05E1\u05D9\u05E3 \u05DC\u05D5 \u05E0\u05E1\u05D9\u05E2\u05D5\u05EA. \u05D4\u05E0\u05D9\u05EA\u05D5\u05D7 \u05DE\u05D5\u05E6\u05D2 \u05DC\u05EA\u05D9\u05E2\u05D5\u05D3 \u05D1\u05DC\u05D1\u05D3.") : null;
    })(), dirs.length > 1 && /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap items-center gap-2 mt-3"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-xs font-black text-slate-500"
    }, "\u05D4\u05E0\u05D9\u05EA\u05D5\u05D7 \u05DC\u05DB\u05DC \u05DB\u05D9\u05D5\u05D5\u05DF \u05D1\u05E0\u05E4\u05E8\u05D3:"), dirs.map(d => {
      const t0 = lineTrips.find(t => String(t.direction || '') === d) || {};
      return /*#__PURE__*/React.createElement("button", {
        key: d,
        onClick: () => setExpandDir(d),
        className: "px-4 py-2 rounded-xl text-xs font-black border-2 transition-colors " + (chosenDir === d ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400")
      }, "\u05DB\u05D9\u05D5\u05D5\u05DF ", d, " \xB7 ", t0.origin, " \u2190 ", t0.dest);
    }))), /*#__PURE__*/React.createElement("div", {
      className: "shrink-0 flex flex-wrap gap-2"
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => {
        setSelectedLine(null);
        setExpandMatches([]);
        setExpandSearch('');
        setExpandCity('');
        setExpandSearched(false);
      },
      className: "bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-2xl font-black text-sm transition-colors shadow-md"
    }, "\uD83D\uDD0D \u05E0\u05EA\u05D7 \u05E7\u05D5 \u05D0\u05D7\u05E8"), /*#__PURE__*/React.createElement("button", {
      onClick: () => setGoldenTab('top'),
      className: "bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-2xl font-black text-sm transition-colors"
    }, "\u2190 \u05D7\u05D6\u05E8\u05D4 \u05DC\u05E8\u05E9\u05D9\u05DE\u05D4"))), /*#__PURE__*/React.createElement("div", {
      className: `rounded-[2.5rem] p-8 shadow-sm border-2 ${totalTripsToAdd > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex flex-col md:flex-row items-center justify-between gap-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-center md:text-right"
    }, /*#__PURE__*/React.createElement("p", {
      className: `font-bold text-sm ${totalTripsToAdd > 0 ? 'text-emerald-700' : 'text-slate-500'}`
    }, "\u05E1\u05DA \u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05DE\u05D5\u05DE\u05DC\u05E6\u05D5\u05EA \u05DC\u05D4\u05D5\u05E1\u05E4\u05D4 (\u05E9\u05D1\u05D5\u05E2\u05D9)"), /*#__PURE__*/React.createElement("p", {
      className: `text-5xl font-[900] mt-1 ${totalTripsToAdd > 0 ? 'text-emerald-700' : 'text-slate-500'}`
    }, totalTripsToAdd > 0 ? `+${totalTripsToAdd}` : '0')), /*#__PURE__*/React.createElement("div", {
      className: "text-center md:text-left max-w-sm"
    }, /*#__PURE__*/React.createElement("p", {
      className: "text-slate-600 font-bold text-sm leading-relaxed"
    }, totalTripsToAdd > 0 ? `הקו עמוס ב-${crowdedWindows.length} חלונות זמן. הוספת ${totalTripsToAdd} נסיעות שבועיות תוריד את העומס הממוצע לרמה נוחה ותקצר המתנה.` : 'בכל חלונות הזמן העומס מתחת ל-85% מהקיבולת — אין צורך בהוספת נסיעות כרגע. הקו פועל ביעילות מיטבית.')))), /*#__PURE__*/React.createElement("div", {
      className: "bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-7"
    }, /*#__PURE__*/React.createElement("h3", {
      className: "text-lg font-black text-slate-900 mb-5"
    }, "\u05E2\u05D5\u05DE\u05E1 \u05E9\u05D9\u05D0 \u05DC\u05E4\u05D9 \u05E9\u05E2\u05D4"), /*#__PURE__*/React.createElement("div", {
      className: "space-y-3"
    }, periodStats.map(p => {
      const occPct = Math.round(p.occupancy * 100);
      const over = p.tripsToAdd > 0;
      return /*#__PURE__*/React.createElement("div", {
        key: p.label
      }, /*#__PURE__*/React.createElement("div", {
        className: "flex justify-between text-sm font-bold mb-1"
      }, /*#__PURE__*/React.createElement("span", {
        className: "text-slate-700"
      }, p.label), /*#__PURE__*/React.createElement("span", {
        className: over ? 'text-emerald-700 font-black' : 'text-slate-900 font-black'
      }, occPct, "% \u05EA\u05E4\u05D5\u05E1\u05D4 \xB7 ", p.count, " \u05E0\u05E1\u05D9\u05E2\u05D5\u05EA")), /*#__PURE__*/React.createElement("div", {
        className: "h-3 bg-slate-100 rounded-full overflow-hidden"
      }, /*#__PURE__*/React.createElement("div", {
        className: `h-full rounded-full transition-all ${over ? 'bg-emerald-500' : 'bg-slate-900'}`,
        style: {
          width: `${Math.min(100, p.occupancy * 100)}%`
        }
      })));
    }), periodStats.length === 0 && /*#__PURE__*/React.createElement("p", {
      className: "text-slate-500 font-bold text-sm"
    }, "\u05D0\u05D9\u05DF \u05E0\u05EA\u05D5\u05E0\u05D9 \u05D6\u05DE\u05DF \u05DC\u05E7\u05D5 \u05D6\u05D4")), /*#__PURE__*/React.createElement("p", {
      className: "text-slate-500 text-xs font-bold mt-4 pt-3 border-t border-slate-100"
    }, "\u05E7\u05D5 \u05D9\u05E8\u05D5\u05E7 = \u05D4\u05E2\u05D5\u05DE\u05E1 \u05E2\u05D5\u05D1\u05E8 85% \u05DE\u05D4\u05E7\u05D9\u05D1\u05D5\u05DC\u05EA \u2014 \u05D7\u05DC\u05D5\u05DF \u05DE\u05D5\u05E2\u05DE\u05D3 \u05DC\u05D4\u05D5\u05E1\u05E4\u05EA \u05E0\u05E1\u05D9\u05E2\u05D5\u05EA")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-2 mb-4 px-1"
    }, /*#__PURE__*/React.createElement(Ic, {
      n: "zap",
      size: 20,
      cls: "text-emerald-700"
    }), /*#__PURE__*/React.createElement("h3", {
      className: "text-lg font-black text-slate-900"
    }, crowdedWindows.length > 0 ? `נמצאו ${crowdedWindows.length} חלונות שמומלץ להוסיף בהם נסיעות` : 'אין חלונות שדורשים הוספת נסיעות')), /*#__PURE__*/React.createElement("div", {
      className: "space-y-4"
    }, crowdedWindows.length === 0 && /*#__PURE__*/React.createElement("div", {
      className: "bg-slate-50/50 border-2 border-slate-100 p-6 rounded-[2rem] text-center"
    }, /*#__PURE__*/React.createElement("p", {
      className: "text-slate-500 font-bold"
    }, "\u05D4\u05E2\u05D5\u05DE\u05E1 \u05D1\u05DB\u05DC \u05D7\u05DC\u05D5\u05E0\u05D5\u05EA \u05D4\u05D6\u05DE\u05DF \u05DE\u05EA\u05D7\u05EA \u05DC-85% \u05DE\u05D4\u05E7\u05D9\u05D1\u05D5\u05DC\u05EA \u2014 \u05D4\u05E7\u05D5 \u05E4\u05D5\u05E2\u05DC \u05D1\u05D9\u05E2\u05D9\u05DC\u05D5\u05EA \u05DE\u05D9\u05D8\u05D1\u05D9\u05EA.")), crowdedWindows.map((p, i) => {
      const occPct = Math.round(p.occupancy * 100);
      const busLabel = p.capacity >= 90 ? 'מפרקי' : p.capacity >= 50 ? 'אוטובוס' : p.capacity >= 35 ? 'מידי' : 'מיני';
      return /*#__PURE__*/React.createElement("div", {
        key: p.label,
        className: "bg-white border-2 border-slate-50 p-6 rounded-[2rem] flex flex-col lg:flex-row lg:items-center justify-between gap-6 hover:shadow-lg transition-all border-r-4 border-r-emerald-500"
      }, /*#__PURE__*/React.createElement("div", {
        className: "flex items-start gap-4"
      }, /*#__PURE__*/React.createElement("div", {
        className: "bg-emerald-50 text-emerald-700 p-3.5 rounded-2xl mt-1"
      }, /*#__PURE__*/React.createElement(Ic, {
        n: "zap",
        size: 24
      })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
        className: "flex items-center gap-2 mb-1.5 flex-wrap"
      }, /*#__PURE__*/React.createElement("span", {
        className: "font-black text-slate-900 text-lg"
      }, "\u05E7\u05D5 ", selectedLine.lineNum), /*#__PURE__*/React.createElement("span", {
        className: "text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold"
      }, selectedLine.category)), /*#__PURE__*/React.createElement("div", {
        className: "text-sm font-bold text-slate-500 mb-3"
      }, selectedLine.origin, " \u2190 ", selectedLine.dest, " \xB7 ", selectedLine.district), /*#__PURE__*/React.createElement("div", {
        className: "flex flex-wrap gap-2"
      }, /*#__PURE__*/React.createElement("span", {
        className: "text-[11px] font-black bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md"
      }, p.label), /*#__PURE__*/React.createElement("span", {
        className: "text-[11px] font-black bg-rose-100 text-rose-700 px-2 py-1 rounded-md"
      }, occPct, "% \u05EA\u05E4\u05D5\u05E1\u05D4"), /*#__PURE__*/React.createElement("span", {
        className: "text-[11px] font-black bg-slate-100 text-slate-500 px-2 py-1 rounded-md"
      }, p.count, " \u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05DB\u05D9\u05D5\u05DD"), /*#__PURE__*/React.createElement("span", {
        className: "text-[11px] font-black bg-purple-100 text-purple-700 px-2 py-1 rounded-md"
      }, busLabel)))), /*#__PURE__*/React.createElement("div", {
        className: "bg-slate-50/80 px-6 py-4 rounded-2xl flex-1 max-w-md w-full"
      }, /*#__PURE__*/React.createElement("div", {
        className: "flex justify-between items-center mb-3 text-sm"
      }, /*#__PURE__*/React.createElement("span", {
        className: "font-bold text-slate-500"
      }, "\u05E2\u05D5\u05DE\u05E1 \u05E9\u05D9\u05D0 \u05DE\u05DE\u05D5\u05E6\u05E2:"), /*#__PURE__*/React.createElement("span", {
        className: "font-black text-slate-700"
      }, p.avgPeak, " ", /*#__PURE__*/React.createElement("span", {
        className: "text-xs text-slate-500 font-normal"
      }, "\u05E2\u05DC \u05E7\u05D9\u05D1\u05D5\u05DC\u05EA ", p.capacity))), /*#__PURE__*/React.createElement("div", {
        className: "flex justify-between items-center mb-4 text-sm"
      }, /*#__PURE__*/React.createElement("span", {
        className: "font-bold text-slate-500"
      }, "\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05E9\u05D1\u05D5\u05E2\u05D9\u05D5\u05EA \u05DB\u05D9\u05D5\u05DD:"), /*#__PURE__*/React.createElement("span", {
        className: "font-black text-slate-700"
      }, p.count)), /*#__PURE__*/React.createElement("div", {
        className: "pt-3 border-t border-slate-200 flex justify-between items-center mb-3"
      }, /*#__PURE__*/React.createElement("span", {
        className: "font-black text-emerald-700"
      }, "\u05DE\u05D5\u05DE\u05DC\u05E5 \u05DC\u05D4\u05D5\u05E1\u05D9\u05E3:"), /*#__PURE__*/React.createElement("span", {
        className: "font-black text-2xl text-emerald-700 bg-white px-3 py-1 rounded-xl shadow-sm"
      }, "+", p.tripsToAdd, " \u05E0\u05E1\u05D9\u05E2\u05D5\u05EA")), p.suggestedTimes.length > 0 ? /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
        className: "text-xs font-bold text-slate-500 mb-2"
      }, "\u05E9\u05E2\u05D5\u05EA \u05D9\u05E6\u05D9\u05D0\u05D4 \u05DE\u05D5\u05E6\u05E2\u05D5\u05EA (\u05E7\u05D9\u05E8\u05D5\u05D1 \u05DC\u05EA\u05D3\u05D9\u05E8\u05D5\u05EA \u05E9\u05DC 5 \u05D3\u05E7'):"), p.suggestedTimes.length < p.tripsToAdd && /*#__PURE__*/React.createElement("div", {
        className: "text-[11px] font-bold text-amber-700 mb-2"
      }, "\u05D1\u05DC\u05D5\u05D7 \u05D9\u05E9 \u05DE\u05E7\u05D5\u05DD \u05E8\u05E7 \u05DC-", p.suggestedTimes.length, " \u05DE\u05EA\u05D5\u05DA ", p.tripsToAdd, " \u2014 \u05DC\u05E9\u05D0\u05E8 \u05E2\u05D3\u05D9\u05E3 \u05E8\u05DB\u05D1 \u05D2\u05D3\u05D5\u05DC \u05D9\u05D5\u05EA\u05E8."), /*#__PURE__*/React.createElement("div", {
        className: "flex flex-wrap gap-2"
      }, p.suggestedTimes.map((t, ti) => /*#__PURE__*/React.createElement("span", {
        key: ti,
        className: "font-black text-sm text-emerald-700 bg-white border border-emerald-200 px-3 py-1.5 rounded-xl shadow-sm"
      }, t)), p.moreTimes > 0 && /*#__PURE__*/React.createElement("span", {
        className: "font-black text-sm text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl"
      }, "\u05D5\u05E2\u05D5\u05D3 ", p.moreTimes))) : /*#__PURE__*/React.createElement("div", {
        className: "text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2"
      }, p.count >= 2 ? /*#__PURE__*/React.createElement(React.Fragment, null, "\u05D4\u05DC\u05D5\u05D7 \u05DB\u05D1\u05E8 \u05E8\u05E5 \u05D1\u05EA\u05D3\u05D9\u05E8\u05D5\u05EA \u05E9\u05DC \u05E2\u05D3 5 \u05D3\u05E7\u05D5\u05EA \u2014 \u05E2\u05D3\u05D9\u05E3 \u05DC\u05E9\u05D3\u05E8\u05D2 \u05DC", p.capacity < 90 ? 'אוטובוס מפרקי (90 מקומות)' : 'תוספת קיבולת', " \u05DE\u05D0\u05E9\u05E8 \u05DC\u05D4\u05D5\u05E1\u05D9\u05E3 \u05E0\u05E1\u05D9\u05E2\u05D5\u05EA.") : /*#__PURE__*/React.createElement(React.Fragment, null, "\u05D1\u05D7\u05DC\u05D5\u05DF \u05D4\u05D6\u05D4 \u05D9\u05E9 \u05DE\u05E2\u05D8 \u05D9\u05E6\u05D9\u05D0\u05D5\u05EA \u05DE\u05DB\u05D3\u05D9 \u05DC\u05D7\u05E9\u05D1 \u05E9\u05E2\u05D5\u05EA \u05DE\u05D5\u05E6\u05E2\u05D5\u05EA \u2014 \u05DB\u05E0\u05E8\u05D0\u05D4 \u05E2\u05D3\u05D9\u05E3 \u05E8\u05DB\u05D1 \u05D2\u05D3\u05D5\u05DC \u05D9\u05D5\u05EA\u05E8."))));
    }))), /*#__PURE__*/React.createElement("div", {
      className: "bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-7"
    }, /*#__PURE__*/React.createElement("h3", {
      className: "text-lg font-black text-slate-900 mb-5"
    }, selectedLine.notGolden ? 'נתוני הקו' : 'נתוני הקו המצטיין'), /*#__PURE__*/React.createElement("div", {
      className: "grid grid-cols-2 md:grid-cols-4 gap-4"
    }, [['ניקוד מוזהב', selectedLine.score != null ? `${selectedLine.score}/100` : 'לא מדורג'], ['ממוצע נוסעים', selectedLine.avg != null ? selectedLine.avg : '—'], ['עומס שיא', selectedLine.avgPeak != null ? selectedLine.avgPeak : '—'], ['נסיעות בשבוע', selectedLine.count != null ? selectedLine.count : '—'], ['עלות לנוסע', selectedLine.cost > 0 ? `₪${selectedLine.cost.toFixed(2)}` : '—'], ['ק"מ שימושי', selectedLine.nonWastedKm != null ? `${(selectedLine.nonWastedKm || 0).toLocaleString()} ק"מ` : '—'], ['קטגוריה', selectedLine.category || '—']].map(([label, val]) => /*#__PURE__*/React.createElement("div", {
      key: label,
      className: "bg-slate-50 rounded-2xl p-4 text-right"
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-slate-500 text-xs font-bold mb-1"
    }, label), /*#__PURE__*/React.createElement("div", {
      className: "font-black text-slate-900 text-lg"
    }, val))))));
  })(), goldenTab === 'allTrips' && (() => {
    const sCity = gTripsCity.trim().toLowerCase();
    // חיפוש אחיד עם הטאב המקביל בקו פח (סעיף 35): גם ערי מעבר
    // (lineCitiesMap), לא רק מוצא/יעד ומספר קו מדויק
    let rows = trips;
    if (sCity) rows = rows.filter(t => {
      if ((t.origin || '').toLowerCase().includes(sCity) || (t.dest || '').toLowerCase().includes(sCity)) return true;
      if (String(t.lineNum) === gTripsCity.trim()) return true;
      const makatKey = String(t.makat || '').replace(/^0+/, '').trim();
      const lineKey = String(t.lineNum || '').replace(/^0+/, '').trim();
      const citiesSet = lineCitiesMap.get(makatKey) || lineCitiesMap.get(lineKey);
      return citiesSet ? Array.from(citiesSet).some(c => c.includes(sCity)) : false;
    });
    if (gTripsCrowded) rows = rows.filter(t => t.peakLoad >= (t.capacity || 50) * 0.85);
    // המיון "מהעמוסה לריקה" לפי אחוז תפוסה, לא לפי מספר מוחלט —
    // מיניבוס דחוס נחשב עמוס מאוטובוס ענק חצי ריק (סעיף 34)
    const {
      key,
      direction
    } = gTripsSort;
    const sortVal = t => key === 'peakLoad' ? (t.peakLoad || 0) / (t.capacity || 50) : t[key] || 0;
    rows = [...rows].sort((a, b) => direction === 'desc' ? sortVal(b) - sortVal(a) : sortVal(a) - sortVal(b));
    const SortBtns = ({
      k
    }) => /*#__PURE__*/React.createElement("span", {
      className: "inline-flex flex-col -space-y-1.5 mr-1 align-middle"
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => setGTripsSort({
        key: k,
        direction: 'desc'
      }),
      className: key === k && direction === 'desc' ? 'text-amber-700' : 'text-slate-300 hover:text-slate-500'
    }, /*#__PURE__*/React.createElement(Ic, {
      n: "chevronUp",
      size: 12,
      strokeWidth: "3"
    })), /*#__PURE__*/React.createElement("button", {
      onClick: () => setGTripsSort({
        key: k,
        direction: 'asc'
      }),
      className: key === k && direction === 'asc' ? 'text-amber-700' : 'text-slate-300 hover:text-slate-500'
    }, /*#__PURE__*/React.createElement(Ic, {
      n: "chevronDown",
      size: 12,
      strokeWidth: "3"
    })));
    return /*#__PURE__*/React.createElement("div", {
      className: "bg-white p-6 md:p-8 rounded-[3rem] border border-slate-200 shadow-sm"
    }, /*#__PURE__*/React.createElement("header", {
      className: "mb-8 flex flex-col md:flex-row justify-between items-center gap-6"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
      className: "text-2xl font-black text-slate-900 mb-2"
    }, "\u05DB\u05DC \u05D4\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05D1\u05DE\u05E2\u05E8\u05DB\u05EA"), /*#__PURE__*/React.createElement("p", {
      className: "text-slate-500 font-bold text-sm"
    }, "\u05DB\u05DE\u05D5 \u05D1\u05E7\u05D5 \u05E4\u05D7 \u2014 \u05D0\u05D1\u05DC \u05D4\u05E4\u05D5\u05DA: \u05DE\u05D4\u05E0\u05E1\u05D9\u05E2\u05D4 \u05D4\u05E2\u05DE\u05D5\u05E1\u05D4 \u05D1\u05D9\u05D5\u05EA\u05E8 \u05DC\u05E8\u05D9\u05E7\u05D4. \u05D0\u05EA\u05E8\u05D5 \u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05E9\u05DE\u05EA\u05E4\u05E7\u05E2\u05D5\u05EA \u05D5\u05D3\u05D5\u05E8\u05E9\u05D5\u05EA \u05EA\u05D2\u05D1\u05D5\u05E8.")), /*#__PURE__*/React.createElement("div", {
      className: "flex flex-col md:flex-row items-center gap-4 w-full md:w-auto"
    }, /*#__PURE__*/React.createElement("label", {
      className: "flex items-center gap-3 bg-amber-50/60 border-2 border-amber-100 text-amber-800 px-4 py-3 rounded-2xl cursor-pointer hover:bg-amber-50 transition-colors w-full md:w-auto font-black text-sm"
    }, /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      checked: gTripsCrowded,
      onChange: e => setGTripsCrowded(e.target.checked),
      className: "w-5 h-5 accent-amber-600 rounded"
    }), "\u05E8\u05E7 \u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05E2\u05DE\u05D5\u05E1\u05D5\u05EA (85%+ \u05DE\u05D4\u05E7\u05D9\u05D1\u05D5\u05DC\u05EA)"), /*#__PURE__*/React.createElement(SearchInput, {
      value: gTripsCity,
      onSubmit: setGTripsCity,
      placeholder: "\u05D7\u05D9\u05E4\u05D5\u05E9 \u05E2\u05D9\u05E8 \u05D0\u05D5 \u05DE\u05E1\u05E4\u05E8 \u05E7\u05D5 \u2014 Enter",
      className: "w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 pl-12 font-black outline-none focus:border-slate-900 text-right shadow-sm"
    }))), /*#__PURE__*/React.createElement("div", {
      className: "overflow-x-auto rounded-[2rem] border-2 border-slate-100 max-h-[60vh]"
    }, /*#__PURE__*/React.createElement("table", {
      className: "w-full text-right border-collapse"
    }, /*#__PURE__*/React.createElement("thead", {
      className: "sticky top-0 bg-slate-50 shadow-sm z-20"
    }, /*#__PURE__*/React.createElement("tr", {
      className: "text-slate-500 text-xs font-black uppercase"
    }, /*#__PURE__*/React.createElement("th", {
      className: "p-5"
    }, "\u05DE\u05E1' \u05E7\u05D5"), /*#__PURE__*/React.createElement("th", {
      className: "p-5"
    }, "\u05DE\u05D5\u05E6\u05D0"), /*#__PURE__*/React.createElement("th", {
      className: "p-5"
    }, "\u05D9\u05E2\u05D3"), /*#__PURE__*/React.createElement("th", {
      className: "p-5"
    }, "\u05E9\u05E2\u05D4"), /*#__PURE__*/React.createElement("th", {
      className: "p-5"
    }, /*#__PURE__*/React.createElement("span", {
      className: "inline-flex items-center gap-1"
    }, "\u05E0\u05D5\u05E1\u05E2\u05D9\u05DD ", /*#__PURE__*/React.createElement(SortBtns, {
      k: "ridership"
    }))), /*#__PURE__*/React.createElement("th", {
      className: "p-5"
    }, /*#__PURE__*/React.createElement("span", {
      className: "inline-flex items-center gap-1"
    }, "\u05E2\u05D5\u05DE\u05E1 \u05E9\u05D9\u05D0 ", /*#__PURE__*/React.createElement(SortBtns, {
      k: "peakLoad"
    }))))), /*#__PURE__*/React.createElement("tbody", {
      className: "text-sm font-bold text-slate-700"
    }, rows.length === 0 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
      colSpan: 6,
      className: "p-10 text-center text-slate-500 font-black"
    }, "\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D5 \u05E0\u05E1\u05D9\u05E2\u05D5\u05EA", sCity ? ' ל"' + gTripsCity.trim() + '"' : '', " \u2014 \u05E0\u05E1\u05D5 \u05E9\u05DD \u05E2\u05D9\u05E8 \u05D0\u05D5 \u05DE\u05E1\u05E4\u05E8 \u05E7\u05D5 \u05D0\u05D7\u05E8", sCity ? /*#__PURE__*/React.createElement("button", {
      onClick: () => setGTripsCity(''),
      className: "mr-3 bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-xl text-xs font-black transition-colors"
    }, "\u2715 \u05E0\u05E7\u05D4 \u05D7\u05D9\u05E4\u05D5\u05E9") : null)), rows.slice(0, gTripsVisible).map((t, i) => {
      const occ = (t.capacity || 50) > 0 ? Math.round(t.peakLoad / (t.capacity || 50) * 100) : 0;
      return /*#__PURE__*/React.createElement("tr", {
        key: `gt-${t.id || i}`,
        className: "vrow border-t border-slate-100 hover:bg-amber-50/40 transition-colors"
      }, /*#__PURE__*/React.createElement("td", {
        className: "p-5 font-black"
      }, /*#__PURE__*/React.createElement("span", {
        className: "bg-amber-500 text-white px-3 py-1.5 rounded-xl"
      }, t.lineNum)), /*#__PURE__*/React.createElement("td", {
        className: "p-5"
      }, t.origin), /*#__PURE__*/React.createElement("td", {
        className: "p-5"
      }, t.dest), /*#__PURE__*/React.createElement("td", {
        className: "p-5 font-black"
      }, t.time), /*#__PURE__*/React.createElement("td", {
        className: "p-5"
      }, t.ridership), /*#__PURE__*/React.createElement("td", {
        className: `p-5 font-black ${occ >= 85 ? 'text-rose-600' : occ >= 60 ? 'text-amber-700' : ''}`
      }, Math.round(t.peakLoad), " ", /*#__PURE__*/React.createElement("span", {
        className: "text-[11px] text-slate-500"
      }, "(", occ, "%)")));
    })))), rows.length > gTripsVisible && /*#__PURE__*/React.createElement("button", {
      onClick: () => setGTripsVisible(gTripsVisible + 150),
      className: "mt-5 w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-2xl font-black text-sm transition-colors"
    }, "\u05D4\u05E6\u05D2 \u05E2\u05D5\u05D3 (", (rows.length - gTripsVisible).toLocaleString(), " \u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05E0\u05D5\u05E1\u05E4\u05D5\u05EA)"));
  })(), goldenTab === 'about' && /*#__PURE__*/React.createElement("div", {
    className: "space-y-8"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-2xl font-black text-slate-900 mb-4"
  }, "\u05DE\u05D4 \u05D6\u05D4 \u05D4\u05E7\u05D5 \u05D4\u05DE\u05D5\u05D6\u05D4\u05D1?"), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-600 leading-relaxed font-bold mb-6"
  }, "\u05D4\u05E7\u05D5 \u05D4\u05DE\u05D5\u05D6\u05D4\u05D1 \u05D4\u05D5\u05D0 \u05EA\u05DE\u05D5\u05E0\u05EA \u05D4\u05E8\u05D0\u05D9 \u05E9\u05DC \u05E7\u05D5 \u05E4\u05D7 \u2014 \u05D4\u05D5\u05D0 \u05DE\u05D0\u05EA\u05E8 \u05D0\u05EA \u05D4\u05E7\u05D5\u05D5\u05D9\u05DD \u05E9\u05E2\u05D5\u05E9\u05D9\u05DD \u05D0\u05EA \u05D4\u05E2\u05D1\u05D5\u05D3\u05D4 \u05D4\u05DB\u05D9 \u05D8\u05D5\u05D1. \u05E7\u05D5\u05D5\u05D9\u05DD \u05E2\u05DD \u05D1\u05D9\u05E7\u05D5\u05E9 \u05D2\u05D1\u05D5\u05D4, \u05E2\u05DC\u05D5\u05EA \u05DC\u05E0\u05D5\u05E1\u05E2 \u05E0\u05DE\u05D5\u05DB\u05D4, \u05D5\u05E8\u05D5\u05D1 \u05D4\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05DE\u05DC\u05D0\u05D5\u05EA."), /*#__PURE__*/React.createElement("h3", {
    className: "font-black text-slate-900 text-lg mb-4"
  }, "\u05E0\u05D9\u05E7\u05D5\u05D3 \u05DE\u05D5\u05D6\u05D4\u05D1 (0\u2013100)"), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-600 leading-relaxed font-bold mb-4 text-sm"
  }, "\u05D0\u05DC\u05D4 \u05D1\u05E8\u05D9\u05E8\u05D5\u05EA \u05D4\u05DE\u05D7\u05D3\u05DC \u05E9\u05DC \u05D4\u05D0\u05EA\u05E8. \u05D1\u05D8\u05D0\u05D1 \"\u05D4\u05E7\u05D5\u05D5\u05D9\u05DD \u05D4\u05DE\u05E6\u05D8\u05D9\u05D9\u05E0\u05D9\u05DD\" \u05D9\u05E9 \u05DC\u05D5\u05D7 \u2699\uFE0F \u05E9\u05D1\u05D5 \u05DB\u05DC \u05D0\u05D7\u05D3 \u05E7\u05D5\u05D1\u05E2 \u05DC\u05E2\u05E6\u05DE\u05D5 \u05DB\u05DE\u05D4 \u05E0\u05E7\u05D5\u05D3\u05D5\u05EA \u05DB\u05DC \u05D3\u05D1\u05E8 \u05E0\u05D5\u05EA\u05DF \u05D5\u05DC\u05DB\u05DE\u05D4 \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05DE\u05D2\u05D9\u05E2\u05D5\u05EA \u05DE\u05DC\u05D5\u05D0 \u05D4\u05E0\u05E7\u05D5\u05D3\u05D5\u05EA", gsetDefault ? '' : ' — כרגע פועלות ההגדרות שלכם', "."), /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, [['נסיעות בביקוש גבוה', `עד ${gset.c.highTrips.on ? gset.c.highTrips.max : 0} נקודות`, 'כמה מהנסיעות עוברות את סף הנוסעים לקטגוריה'], ['יעילות ק"מ', `עד ${gset.c.efficientKm.on ? gset.c.efficientKm.max : 0} נקודות`, 'כמה מהקילומטרים נסועים על נסיעות מאוכלסות'], ['עלות לנוסע', `עד ${gset.c.cost.on ? gset.c.cost.max : 0} נקודות`, 'עירוני: חייב להיות 10% מתחת לממוצע הקטגוריה — כל השאר: 20% מתחת'], ['עומס נוסעים ממוצע', `עד ${gset.c.avgRiders.on ? gset.c.avgRiders.max : 0} נקודות`, 'ממוצע הנוסעים לנסיעה ביחס לסף המחמיר של הקטגוריה'], ['עומס שיא', `עד ${gset.c.peak.on ? gset.c.peak.max : 0} נקודות`, 'כמה אנשים בקטע העמוס ביותר — מתחת ל-20 = לא עמוס, מקבל 0 נקודות'], ['נפח שבועי', `עד ${gset.c.volume.on ? gset.c.volume.max : 0} נקודות`, 'ממוצע נוסעים × נסיעות שבועיות — מונע מקווי תלמידים וקווי פעם ביום להגיע ל-100']].map(([title, pts, desc]) => /*#__PURE__*/React.createElement("div", {
    key: title,
    className: "flex items-start justify-between p-5 rounded-2xl bg-slate-50 border border-slate-100"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "font-black text-slate-800 text-sm"
  }, title), /*#__PURE__*/React.createElement("div", {
    className: "text-slate-500 text-xs font-bold mt-1"
  }, desc)), /*#__PURE__*/React.createElement("span", {
    className: "shrink-0 ml-4 px-3 py-1 rounded-full text-[11px] font-black bg-slate-200 text-slate-700"
  }, pts)))), /*#__PURE__*/React.createElement("div", {
    className: "mt-6 pt-4 border-t border-slate-100"
  }, /*#__PURE__*/React.createElement("h4", {
    className: "font-black text-slate-700 text-sm mb-3"
  }, "\u05E1\u05E3 \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05DE\u05D9\u05E0\u05D9\u05DE\u05DC\u05D9 \u05DC\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4 (\u05E7\u05D5 \u05DE\u05D5\u05D6\u05D4\u05D1)"), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 md:grid-cols-4 gap-2"
  }, [['עירוני תדירות גבוהה', '44'], ['עירוני תדירות נמוכה', '21'], ['תלמידים', '23'], ['בינעירוני ארוך', '26'], ['בינעירוני קצר', '22'], ['קווים מזינים', '12'], ['אזורי', '12'], ['לילה', '25']].map(([cat, th]) => /*#__PURE__*/React.createElement("div", {
    key: cat,
    className: "bg-slate-50 rounded-xl p-2.5 text-right border border-slate-100"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-slate-500 text-[10px] font-bold"
  }, cat), /*#__PURE__*/React.createElement("div", {
    className: "font-black text-slate-900 text-sm"
  }, th, " \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD")))), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-500 text-xs font-bold mt-4"
  }, "* \u05DE\u05D5\u05E6\u05D2\u05D9\u05DD \u05E8\u05E7 \u05E7\u05D5\u05D5\u05D9\u05DD \u05E2\u05DD \u05E0\u05D9\u05E7\u05D5\u05D3 60 \u05D5\u05DE\u05E2\u05DC\u05D4"))))));
}

// ── נסיעות תפעוליות במסווה ─────────────────────────────────────────────
// חברה שלא רוצה לנסוע ריק בלי תשלום רושמת את הסעת הרכב למסוף כנסיעת
// שירות (רעיון שלמה, 18.09: קו 71 קריית מלאכי). הסימן: זוג נסיעות של אותו
// קו, בשני הכיוונים, צמודות בזמן, שבספירות המשרד עלו אליהן ~0 נוסעים.
// נסיעה בודדת עם 0 נוסעים לא מספיקה (קו לילה ריק הוא לא הסעה תפעולית).
const cityOnly2 = x => x ? x.indexOf(' - ') > 0 ? x.slice(0, x.indexOf(' - ')).trim() : x.split('/')[0].trim() : '';
const DEADHEAD_MAX_RIDERS = 1.5; // עד כאן "כמעט ריק"
const DEADHEAD_SURE_RIDERS = 0.5; // עד כאן "ריק"
const DEADHEAD_GAP_MIN = 100; // כמה דקות בין היציאות של זוג
function computeDeadheadCounts(trips, lineStopsMap, dset) {
  const PC = (dset || DEADHEAD_DEFAULTS).c,
    PP = (dset || DEADHEAD_DEFAULTS).p;
  const ptsOf = (k, f) => PC[k].on ? Math.max(0, Math.min(1, f)) * (Number(PC[k].max) || 0) : 0;
  const maxSum = maxSumOf(PC);
  const cityOnly = x => x ? x.indexOf(' - ') > 0 ? x.slice(0, x.indexOf(' - ')).trim() : x.split('/')[0].trim() : '';
  const groups = new Map();
  for (const t of trips) {
    if (t.timeMins == null || !t.direction) continue;
    const key = `${t.lineNum}_${[cityOnly(t.origin), cityOnly(t.dest)].sort().join('-')}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const daysOverlap = (a, b) => {
    const la = a.daysList || [],
      lb = b.daysList || [];
    if (!la.length || !lb.length) return true;
    return la.some(d => lb.includes(d));
  };
  // "קו עמוס באזור": נסיעה עמוסה (80% מקיבולת הרכב — ההגדרה של האתר) של קו
  // אחר, באותה עיר, שיוצאת עד 30 דק' מהנסיעה הריקה. הסעה ריקה ליד קו שנחנק
  // היא הבזבוז הבולט ביותר — אותו אוטובוס יכול היה לתגבר אותו (שלמה 18.09).
  const DEADHEAD_NEAR_MIN = 30;
  const crowdedByCity = new Map();
  for (const t of trips) {
    if (t.timeMins == null) continue;
    const cap80 = (t.capacity || 50) * 0.8;
    if (t.ridership < cap80 && t.peakLoad < cap80) continue;
    for (const c of new Set([cityOnly(t.origin), cityOnly(t.dest)])) {
      if (!c) continue;
      if (!crowdedByCity.has(c)) crowdedByCity.set(c, []);
      crowdedByCity.get(c).push(t);
    }
  }
  // "באזור" = אותה עיר, וכשיש מפת תחנות — גם לפחות תחנה משותפת (אותו
  // מסדרון). בלי זה בירושלים או בתל אביב כל נסיעה ריקה הייתה "ליד" קו עמוס.
  const stopsOf = t => lineStopsMap && lineStopsMap.get(String(t.makat || '').replace(/^0+/, '')) || null;
  const sharesStop = (t, x) => {
    const A = stopsOf(t),
      B = stopsOf(x);
    if (!A || !B) return true;
    for (const st of A) if (B.has(st)) return true;
    return false;
  };
  const crowdedNear = t => {
    let best = null;
    for (const c of new Set([cityOnly(t.origin), cityOnly(t.dest)])) {
      for (const x of crowdedByCity.get(c) || []) {
        if (String(x.lineNum) === String(t.lineNum)) continue;
        const d = Math.abs(x.timeMins - t.timeMins);
        if (d > DEADHEAD_NEAR_MIN) continue;
        if (!sharesStop(t, x)) continue;
        if (!best || Math.max(x.ridership, x.peakLoad) > Math.max(best.ridership, best.peakLoad)) best = x;
      }
    }
    return best;
  };
  const pairs = [];
  for (const [groupKey, list] of groups) {
    // קו שכל נסיעותיו 0 — כנראה אין לו ספירות בכלל, לא צי ריק
    if (!list.some(t => t.ridership > DEADHEAD_MAX_RIDERS)) continue;
    const near = list.filter(t => t.ridership <= DEADHEAD_MAX_RIDERS);
    if (near.length < 2) continue;
    const used = new Set();
    near.sort((a, b) => a.timeMins - b.timeMins);
    for (let i = 0; i < near.length; i++) {
      const a = near[i];
      if (used.has(a.id)) continue;
      let best = null;
      for (let j = i + 1; j < near.length; j++) {
        const b = near[j];
        if (used.has(b.id) || String(b.direction) === String(a.direction)) continue;
        const gap = b.timeMins - a.timeMins;
        if (gap > DEADHEAD_GAP_MIN) break;
        if (!daysOverlap(a, b)) continue;
        if (!best || gap < best.gap) best = {
          b,
          gap
        };
      }
      if (!best) continue;
      used.add(a.id);
      used.add(best.b.id);
      const b = best.b;
      const weekly = Math.min(a.tripCount || 1, b.tripCount || 1);
      const km = ((a.distance || 0) + (b.distance || 0)) * weekly;
      const sure = a.ridership <= DEADHEAD_SURE_RIDERS && b.ridership <= DEADHEAD_SURE_RIDERS;
      const hot = crowdedNear(a) || crowdedNear(b);
      // ניקוד 0–100 לכל זוג, באותה רוח של ציון אי-היעילות לקו:
      //   ריקות (עד 40)   — כמה נוסעים בכל זאת עלו בשני הכיוונים יחד
      //   צמידות (עד 20)  — כמה קרובות היציאות (הסעה למסוף = דקות ספורות)
      //   קו עמוס באזור (עד 30) — האוטובוס יכול היה לתגבר קו שנחנק
      //   היקף (עד 10)    — כמה פעמים בשבוע זה חוזר
      const riders = a.ridership + b.ridership;
      // כל רכיב = שבר 0–1 כפול הנקודות שנקבעו לו; הציון מנורמל ל-100 לפי
      // סכום הרכיבים הדלוקים — בדיוק כמו ציון אי-היעילות של קו
      const parts = {
        empty: ptsOf('obs', 1 - riders / (2 * DEADHEAD_MAX_RIDERS)),
        tight: ptsOf('tight', 1 - Math.max(0, best.gap - 15) / (DEADHEAD_GAP_MIN - 15)),
        hot: ptsOf('hot', hot ? 1 : 0),
        volume: ptsOf('empty', weekly / 6)
      };
      const rawScore = normScore(parts.empty + parts.tight + parts.hot + parts.volume, maxSum);
      Object.keys(parts).forEach(k => {
        parts[k] = Math.round(parts[k]);
      });
      // הגנות — נקודות שמופחתות
      const protections = [];
      if (PP.night > 0 && (a.isNightLine || b.isNightLine || a.timeMins < 5 * 60)) protections.push({
        name: 'קו לילה',
        value: PP.night
      });
      const wk = a.daysList || [];
      if (PP.weekend > 0 && wk.length && wk.every(d => d === 6 || d === 7)) protections.push({
        name: 'קו סופ"ש',
        value: PP.weekend
      });
      if (PP.rare > 0 && weekly <= 1) protections.push({
        name: 'זוג בודד בשבוע',
        value: PP.rare
      });
      const deduction = protections.reduce((s2, x) => s2 + x.value, 0);
      const score = Math.max(0, rawScore - deduction);
      pairs.push({
        near: hot,
        score,
        rawScore,
        parts,
        protections,
        groupKey,
        lineNum: a.lineNum,
        makat: a.makat,
        origin: a.origin,
        dest: a.dest,
        cluster: a.cluster || a.clusterVal || '',
        district: a.district || '',
        lineType: a.lineType || '',
        a,
        b,
        gap: best.gap,
        weekly,
        km,
        sure,
        edge: a.timeMins < 6 * 60 || b.timeMins >= 21 * 60 // קצה יום — מתאים להוצאה/הכנסה של רכב
      });
    }
  }
  pairs.sort((x, y) => y.score - x.score || y.km - x.km);
  const byLine = new Map();
  for (const p of pairs) {
    const k = p.groupKey;
    if (!byLine.has(k)) byLine.set(k, {
      groupKey: k,
      lineNum: p.lineNum,
      makat: p.makat,
      origin: p.origin,
      dest: p.dest,
      cluster: p.cluster,
      district: p.district,
      lineType: p.lineType,
      pairs: [],
      weekly: 0,
      km: 0,
      sure: 0
    });
    const L = byLine.get(k);
    L.pairs.push(p);
    L.weekly += p.weekly;
    L.km += p.km;
    if (p.sure) L.sure += 1;
    if (p.near) L.near = (L.near || 0) + 1;
  }
  // ציון הקו = ממוצע ציוני הזוגות שלו, משוקלל לפי כמה פעמים בשבוע כל זוג חוזר
  for (const L of byLine.values()) {
    const w = L.pairs.reduce((s2, p) => s2 + p.weekly, 0) || 1;
    L.score = Math.round(L.pairs.reduce((s2, p) => s2 + p.score * p.weekly, 0) / w);
    L.maxScore = Math.max(...L.pairs.map(p => p.score));
    L.statusTier = getStatusTier(L.score);
    L.status = L.statusTier.label;
  }
  const minScore = Number((dset || DEADHEAD_DEFAULTS).minScore) || 0;
  const lines = [...byLine.values()].filter(L => L.score >= minScore).sort((x, y) => y.score - x.score || y.km - x.km);
  return {
    pairs,
    lines,
    totalPairs: pairs.length,
    weekly: pairs.reduce((s, p) => s + p.weekly, 0),
    km: Math.round(pairs.reduce((s, p) => s + p.km, 0)),
    sure: pairs.filter(p => p.sure).length,
    near: pairs.filter(p => p.near).length
  };
}

// נסיעות תפעוליות במסווה — ההגדרה של שלמה (18.09): לפי מספר הרכב. הרכב מגיע
// לקצה נסיעה, ותוך 15 דק' יוצא לנסיעה שמסתיימת ליד המקום שבו התחיל — לא
// חייב אותו קו (89 הלוך, 80 חזור). הזוגות נצפים בשידורי המיקום (מדד הדיוק)
// ונאספים ב-bus/data/deadhead.json (14 יום). כאן: הצלבה עם ספירות המשרד
// (האם נסיעת החזרה ריקה גם בספירות), קו עמוס באזור, וניקוד.
const hms = sec => sec == null ? '' : `${String(Math.floor(sec / 3600) % 24).padStart(2, '0')}:${String(Math.floor(sec / 60) % 60).padStart(2, '0')}`;
function computeDeadhead(trips, lineStopsMap, dset, obs) {
  if (!obs || !obs.lines || !Object.keys(obs.lines).length) return {
    mode: 'counts',
    ...computeDeadheadCounts(trips, lineStopsMap, dset)
  };
  const PC = (dset || DEADHEAD_DEFAULTS).c,
    PP = (dset || DEADHEAD_DEFAULTS).p;
  const ptsOf = (k, f) => PC[k] && PC[k].on ? Math.max(0, Math.min(1, f)) * (Number(PC[k].max) || 0) : 0;
  const maxSum = maxSumOf(PC);
  const cityOnly = cityOnly2;
  const nDays = (obs.days || []).length || 14;
  const byMakat = new Map();
  for (const t of trips) {
    const k = String(t.makat || '').replace(/^0+/, '');
    if (!k) continue;
    if (!byMakat.has(k)) byMakat.set(k, []);
    byMakat.get(k).push(t);
  }
  // קווים עמוסים לפי עיר — ההגדרה של האתר (80% מקיבולת הרכב)
  const crowdedByCity = new Map();
  for (const t of trips) {
    if (t.timeMins == null) continue;
    const cap80 = (t.capacity || 50) * 0.8;
    if (t.ridership < cap80 && t.peakLoad < cap80) continue;
    for (const c of new Set([cityOnly(t.origin), cityOnly(t.dest)])) {
      if (!c) continue;
      if (!crowdedByCity.has(c)) crowdedByCity.set(c, []);
      crowdedByCity.get(c).push(t);
    }
  }
  const stopsOf = mk => lineStopsMap && lineStopsMap.get(String(mk)) || null;
  const sharesStop = (mk, x) => {
    const A = stopsOf(mk),
      B = stopsOf(String(x.makat || '').replace(/^0+/, ''));
    if (!A || !B) return true;
    for (const st of A) if (B.has(st)) return true;
    return false;
  };
  // התאמת רכב לקו העמוס (שלמה 18.09): רכב בינעירוני לא מבצע קו עירוני ולהפך;
  // תקן הרכב של הקו העמוס הוא מינימום — מיניבוס לא מתגבר קו שדורש אוטובוס,
  // אבל אוטובוס כן מתגבר קו מיניבוס. (נגישות אינה בקובץ המשרד — לא נבדקת.)
  const SIZE_RANK = {
    'מיניבוס': 1,
    'מידיבוס': 2,
    'אוטובוס': 3,
    'מפרקי': 4
  };
  const sizeRank = bs => {
    const k = String(bs || '').replace(/\s/g, '');
    for (const [n, r] of Object.entries(SIZE_RANK)) if (k.includes(n.replace(/\s/g, ''))) return r;
    return 3;
  };
  const svcKind = lt => {
    const t = String(lt || '');
    return t.includes('בינעירוני') ? 'inter' : t.includes('עירוני') ? 'urban' : 'other';
  };
  const vehicleFits = (veh, line) => {
    const a = svcKind(veh.lineType),
      b = svcKind(line.lineType);
    if (a === 'inter' && b === 'urban' || a === 'urban' && b === 'inter') return false;
    return sizeRank(veh.busSize) >= sizeRank(line.busSize);
  };
  // הקו העמוס חייב לצאת מהעיר שבה הרכב נמצא (קצה הנסיעה שסיים = מוצא החזרה),
  // ובחלון של עד 30 דק' אחרי שהגיע — רכב שנמצא בשוהם לא יתגבר קו שיוצא מבאר יעקב.
  const crowdedNear = (veh, mk, city, arrMins) => {
    if (!city) return null;
    let best = null;
    for (const x of crowdedByCity.get(city) || []) {
      if (String(x.lineNum) === String(veh.lineNum)) continue;
      if (cityOnly(x.origin) !== city) continue;
      if (x.timeMins < arrMins || x.timeMins - arrMins > 30) continue;
      if (!vehicleFits(veh, x)) continue;
      if (!sharesStop(mk, x)) continue;
      if (!best || Math.max(x.ridership, x.peakLoad) > Math.max(best.ridership, best.peakLoad)) best = x;
    }
    return best;
  };
  // ספירות המשרד לנסיעת החזרה: הנסיעה המתוכננת הקרובה ביותר (אותו קו וכיוון, עד 10 דק')
  // קו שכל נסיעותיו 0 בקובץ המשרד = אין לו ספירות (הקובץ מתעדכן רבעונית) —
  // לא "ריק". אז אין ראיה מהספירות, לא לטובה ולא לרעה (שלמה 18.09).
  const hasCounts = mk => (byMakat.get(String(mk)) || []).some(t => t.ridership > 0);
  const ridersOf = (mk, dir, sec) => {
    if (!hasCounts(mk)) return null;
    const mins = sec / 60;
    let best = null;
    for (const t of byMakat.get(String(mk)) || []) {
      if (t.timeMins == null || String(t.direction) !== String(dir)) continue;
      const d = Math.abs(t.timeMins - mins);
      if (d <= 10 && (!best || d < best.d)) best = {
        d,
        r: t.ridership
      };
    }
    return best ? best.r : null;
  };
  const lines = [];
  let unknown = 0,
    normal = 0,
    noCountsN = 0;
  for (const [mk, e] of Object.entries(obs.lines)) {
    const ts = byMakat.get(String(mk));
    if (!ts || !ts.length) {
      unknown++;
      continue;
    }
    const info = ts[0];
    const perWeek = e.n / nDays * 7;
    const ex = (e.ex || []).map(x => {
      const [day, veh, mkA, dirA, depA, endA, mkB, dirB, depB, gap, schA, schB] = x;
      const aInfo = (byMakat.get(String(mkA)) || [])[0];
      const bAll = byMakat.get(String(mkB)) || [];
      const bInfo = bAll.find(t => String(t.direction) === String(dirB)) || bAll[0];
      return {
        day,
        veh,
        mkA,
        dirA,
        depA,
        endA,
        mkB,
        dirB,
        depB,
        gap,
        schA,
        schB,
        aLine: aInfo ? aInfo.lineNum : mkA,
        bLine: bInfo ? bInfo.lineNum : mkB,
        bOrigin: bInfo ? bInfo.origin : '',
        bDest: bInfo ? bInfo.dest : '',
        bRiders: ridersOf(mkB, dirB, schB != null ? schB : depB)
      };
    });
    const withR = ex.filter(x => x.bRiders != null);
    const emptyFrac = withR.length ? withR.filter(x => x.bRiders <= DEADHEAD_MAX_RIDERS).length / withR.length : 0;
    const noCounts = !withR.length; // אין ספירות לנסיעות החזרה — הרכיב "ריק בספירות" לא נספר, ולא נטען שהיא ריקה
    // הלוך-חזור צמוד של אותו רכב הוא גם שירות עירוני רגיל (הרכב עומד בקצה
    // ויוצא חזרה). מה שהופך אותו לנסיעה תפעולית הוא שהחזרה ריקה — לכן
    // ספירות המשרד הן תנאי כניסה: בלי ספירות לא נכנס, ועם נוסעים בחזרה זה שירות.
    if (noCounts) {
      noCountsN++;
      continue;
    }
    if (emptyFrac < 0.5) {
      normal++;
      continue;
    }
    // הקו העמוס נבדק לכל דוגמה בנפרד, לפי שעת החזרה שלה — ומוצג מתחתיה
    let hot = null;
    for (const x of ex) {
      // הרכב שסיים את קו A: התקן שלו הוא לפחות תקן קו A — לפיו נבדקת ההתאמה
      const aInfo = (byMakat.get(String(x.mkA)) || [])[0] || info;
      x.hot = crowdedNear(aInfo, mk, cityOnly(x.bOrigin), x.endA / 60);
      if (x.hot && (!hot || Math.max(x.hot.ridership, x.hot.peakLoad) / (x.hot.capacity || 50) > Math.max(hot.ridership, hot.peakLoad) / (hot.capacity || 50))) hot = x.hot;
    }
    // "צריך תגבור": העומס בקו העמוס ביחס לקיבולת הרכב — מעל 100% = מלוא הנקודות, 90% = חצי
    const hotLoad = hot ? Math.max(hot.ridership, hot.peakLoad) / (hot.capacity || 50) : 0;
    const parts = {
      obs: ptsOf('obs', perWeek / 7),
      tight: ptsOf('tight', 1 - Math.max(0, e.gap - 5) / 10),
      hot: ptsOf('hot', hot ? 1 : 0),
      crush: ptsOf('crush', hotLoad >= 1 ? 1 : hotLoad >= 0.9 ? 0.5 : 0),
      empty: ptsOf('empty', emptyFrac)
    };
    const rawScore = normScore(parts.obs + parts.tight + parts.hot + parts.crush + parts.empty, maxSum);
    Object.keys(parts).forEach(k => {
      parts[k] = Math.round(parts[k]);
    });
    const protections = [];
    const nightShare = ex.length ? ex.filter(x => x.depB < 5 * 3600 || x.depB >= 24 * 3600).length / ex.length : 0;
    if (PP.night > 0 && nightShare >= 0.6) protections.push({
      name: 'קו לילה',
      value: PP.night
    });
    const wkShare = ex.length ? ex.filter(x => {
      const d = new Date(x.day + 'T12:00:00').getDay();
      return d === 5 || d === 6;
    }).length / ex.length : 0;
    if (PP.weekend > 0 && ex.length && wkShare >= 0.6) protections.push({
      name: 'סופ"ש',
      value: PP.weekend
    });
    if (PP.rare > 0 && e.n <= 1) protections.push({
      name: 'תצפית בודדת',
      value: PP.rare
    });
    const deduction = protections.reduce((s2, x) => s2 + x.value, 0);
    const score = Math.max(0, rawScore - deduction);
    const st = getStatusTier(score);
    lines.push({
      groupKey: mk,
      makat: mk,
      lineNum: info.lineNum,
      origin: info.origin,
      dest: info.dest,
      cluster: info.cluster || info.clusterVal || '',
      district: info.district || '',
      n: e.n,
      days: e.days,
      veh: e.veh,
      other: e.other || 0,
      gap: e.gap,
      end: e.end,
      perWeek,
      emptyFrac,
      noCounts,
      hot,
      hotLoad,
      ex,
      score,
      rawScore,
      parts,
      protections,
      statusTier: st,
      status: st.label
    });
  }
  const minScore = Number((dset || DEADHEAD_DEFAULTS).minScore) || 0;
  lines.sort((x, y) => y.score - x.score || y.n - x.n);
  return {
    mode: 'vehicle',
    nDays,
    updated: obs.updated,
    unknown,
    normal,
    noCountsN,
    lines: lines.filter(L => L.score >= minScore),
    allLines: lines,
    totalPairs: lines.reduce((s2, L) => s2 + L.n, 0),
    other: lines.reduce((s2, L) => s2 + L.other, 0),
    near: lines.filter(L => L.hot).length,
    emptyLines: lines.filter(L => L.emptyFrac >= 0.5).length
  };
}
function KavPach() {
  // appMode: 'choice' (מסך בחירה) · 'kavpach' (קו פח) · 'golden' (הקו המוזהב)
  // מאותחל מה-hash כדי שלינקים ישירים ורענון דף יישמרו (אותה כתובת בסיס).
  // קישור עמוק לקו בודד: ‎#פח/קו/10415‎ או ‎#מוזהב/קו/10415‎ — פותח את
  // הכלי, מסנן אל הקו ומבליט אותו. בלי זה אי אפשר לשתף ממצא ספציפי.
  const parseHash = () => {
    const h = decodeURIComponent((window.location.hash || '').replace('#', '').trim());
    const m = h.match(/^(פח|kavpach|מוזהב|golden)\/קו\/(\S+)$/);
    if (m) return {
      mode: m[1] === 'golden' || m[1] === 'מוזהב' ? 'golden' : 'kavpach',
      makat: m[2]
    };
    if (h === 'golden' || h === 'מוזהב') return {
      mode: 'golden',
      makat: null
    };
    if (h === 'kavpach' || h === 'פח') return {
      mode: 'kavpach',
      makat: null
    };
    return {
      mode: 'choice',
      makat: null
    };
  };
  const [appMode, setAppMode] = useState(() => {
    if (typeof window === 'undefined') return 'choice';
    return parseHash().mode;
  });
  const [focusMakat, setFocusMakat] = useState(() => {
    if (typeof window === 'undefined') return null;
    return parseHash().makat;
  });
  const pickMode = useCallback(m => {
    try {
      window.location.hash = m === 'choice' ? '' : m;
    } catch (e) {/* ignore */}
    setAppMode(m);
  }, []);

  // סנכרון כפתור Back/Forward של הדפדפן עם appMode
  useEffect(() => {
    const onHash = () => {
      const {
        mode,
        makat
      } = parseHash();
      setAppMode(mode);
      setFocusMakat(makat);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const [trips, setTrips] = useState([]);
  const [lineCitiesMap, setLineCitiesMap] = useState(new Map());
  const [lineStopsMap, setLineStopsMap] = useState(new Map());
  const [dset, updDset, resetDset, dsetDefault] = useStoredSettings('kb-deadhead-score-v3', DEADHEAD_DEFAULTS);
  const [dhObs, setDhObs] = useState(null); // bus/data/deadhead.json — הלוך-חזור של אותו רכב מהשידורים (14 יום)
  // data-lines.json — הצבירה לכל קו, מחושבת מראש ב-GitHub Actions (tools/precompute_kavpach.mjs).
  // איתה המסך הראשון עולה בלי להוריד ולפענח את לוח הזמנים; הנסיעות נטענות ברקע ללשוניות האחרות
  const [linesPre, setLinesPre] = useState(null);
  const [linesPreDone, setLinesPreDone] = useState(false);
  const [linesPreMeta, setLinesPreMeta] = useState(null); // deps/src של הקובץ המוכן — לבדיקת עדכניות
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('data-lines.json', {
          cache: 'no-cache'
        });
        const d = r.ok ? await r.json() : null;
        if (!d || !Array.isArray(d.lines) || !d.lines.length) return;
        // עדכניות: הקובץ המוכן נבנה מקובצי הנתונים בגודל מסוים; אם הקבצים החיים באתר
        // שונים (עודכנו ועוד לא נבנה מחדש) — לא משתמשים בו, ומחשבים בדפדפן כמו קודם
        try {
          const heads = await Promise.all(['data-main.json', 'data-schedule.json'].map(f => fetch(f, {
            method: 'HEAD',
            cache: 'no-cache'
          }).then(h => h.ok ? h.headers.get('content-length') : null).catch(() => null)));
          const want = [d.src && d.src.main, d.src && d.src.schedule];
          const stale = heads.some((h, i) => h && want[i] && String(h) !== String(want[i]));
          if (stale) {
            console.warn('data-lines.json לא תואם את קובצי הנתונים — מחשבים בדפדפן');
            return;
          }
        } catch (e) {/* בלי HEAD — מקבלים את הקובץ */}
        setLinesPreMeta({
          deps: d.deps || {},
          updated: d.updated
        });
        setLinesPre(d.lines);
      } catch (e) {/* אין קובץ מוכן — המסלול הישן */} finally {
        setLinesPreDone(true);
      }
    })();
  }, []);
  // הקבצים הנלווים (ארכיון, חפיפות, נסיעות תפעוליות, ~3MB) נטענים אחרי המסך הראשון:
  // הניקוד המוכן בקובץ כבר כולל אותם, והם נחוצים רק להגדרות מותאמות ולפרטים בכרטיסים
  const [depsStart, setDepsStart] = useState(false);
  const [depsDone, setDepsDone] = useState(0);
  useEffect(() => {
    if (!linesPreDone) return;
    if (!linesPre) {
      setDepsStart(true);
      return;
    }
    const later = typeof requestIdleCallback === 'function' ? f => requestIdleCallback(f, {
      timeout: 3000
    }) : f => setTimeout(f, 1500);
    later(() => setDepsStart(true));
  }, [linesPreDone, linesPre]);
  useEffect(() => {
    if (!depsStart) return;
    fetch('bus/data/deadhead.json', {
      cache: 'no-cache'
    }).then(r => r.ok ? r.json() : null).then(d => d && setDhObs(d)).catch(() => {}).finally(() => setDepsDone(n => n + 1));
  }, [depsStart]);
  // מחושב רק כשהלשונית פתוחה (dhOpened) — לא מכביד על טעינת האתר
  const [dhOpened, setDhOpened] = useState(false);
  const deadhead = useMemo(() => dhOpened ? computeDeadhead(trips || [], lineStopsMap, dset, dhObs) : null, [dhOpened, trips, lineStopsMap, dset, dhObs]);
  const [lineNormStopsMap, setLineNormStopsMap] = useState(new Map());
  const [costBenchmarkTable, setCostBenchmarkTable] = useState(null);
  const [csvLoadFailed, setCsvLoadFailed] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [fileLoad, setFileLoad] = useState({
    active: false,
    progress: 0,
    message: "מנתח נתונים..."
  });
  const setFileLoading = active => setFileLoad(s => ({
    ...s,
    active
  }));
  const setFileProgress = progress => setFileLoad(s => ({
    ...s,
    progress
  }));
  const setFileMessage = message => setFileLoad(s => ({
    ...s,
    message
  }));
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [tab, setTab] = useState("redundant");
  useEffect(() => {
    if (tab === "deadhead") setDhOpened(true);
  }, [tab]);
  const [dhOpen, setDhOpen] = useState(null); // קו פתוח בטבלת הנסיעות התפעוליות
  const [dhSureOnly, setDhSureOnly] = useState(false);
  const [dhNearOnly, setDhNearOnly] = useState(false);
  const [searchCity, setSearchCity] = useState("");
  const [overlapMap, setOverlapMap] = useState(null); // חפיפת מסלולים בין קווים (kavpach-overlap.json, מתעדכן לילית)
  useEffect(() => {
    if (!depsStart) return;
    fetch('kavpach-overlap.json', {
      cache: 'no-cache'
    }).then(r => r.ok ? r.json() : null).then(d => d && setOverlapMap(d.lines || null)).catch(() => {}).finally(() => setDepsDone(n => n + 1));
  }, [depsStart]);
  // הדלתא מהארכיון של "הקו בזמן" (kavpach-live.json, נבנה לילית): קווים
  // שכבר בוטלו, נסיעות עדכניות, צמצומים, קווים חדשים והשבתות. נתוני
  // הליבה כאן הם צילום מיוני 2026 — בלי זה הכלי ממליץ לבטל קווים
  // שכבר בוטלו. נטען ברקע; אם איננו — הכל עובד כמו קודם.
  const [liveMap, setLiveMap] = useState(null);
  const [liveGen, setLiveGen] = useState('');
  useEffect(() => {
    if (linesPreMeta && linesPreMeta.deps && linesPreMeta.deps.live) setLiveGen(g => g || linesPreMeta.deps.live);
  }, [linesPreMeta]);
  useEffect(() => {
    if (!depsStart) return;
    fetch('kavpach-live.json').then(r => r.ok ? r.json() : null).then(d => {
      if (d) {
        setLiveMap(d.lines || null);
        setLiveGen(d.gen || '');
      }
    }).catch(() => {}).finally(() => setDepsDone(n => n + 1));
  }, [depsStart]);
  // הכרטיסים מאגדים את שני הכיוונים — לכן החיפוש ברמת המקט השלם
  // (מפתח בלי מקף בדלתא); המקט בקו פח מגיע עם אפסים מובילים
  const liveOf = useCallback(makat => {
    if (!liveMap) return null;
    const mk = String(makat || '').replace(/^0+/, '').trim();
    return liveMap[mk] || null;
  }, [liveMap]);
  const [filterDistrict, setFilterDistrict] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [redundantSortBy, setRedundantSortBy] = useState("score");
  // הגדרות הניקוד של המשתמש (שלמה 07.09: "לבחור מה זה קו טוב") + סינון מספרי
  const [pset, updPset, resetPset, psetDefault] = useStoredSettings('kb-pach-score', PACH_DEFAULTS);
  const [pFilt, setPFilt] = useState({
    minScore: null,
    minWasted: null,
    maxRiders: null,
    minTrips: null
  });
  const pFiltOn = Object.values(pFilt).some(v => v != null);
  const [showCrowded, setShowCrowded] = useState(false);
  const [visibleTripsCount, setVisibleTripsCount] = useState(60);
  const [visibleLineCount, setVisibleLineCount] = useState(30);
  const [filterLineType, setFilterLineType] = useState("all");

  // ── אזורים חלשים State ──
  const [areaViewMode, setAreaViewMode] = useState("city");
  const [areaSortBy, setAreaSortBy] = useState("wastedKm");
  const [debugLine, setDebugLine] = useState("");
  const [debugResult, setDebugResult] = useState(null);
  const runLineDebug = line => {
    const ln = String(line).replace(/^0+/, '').trim();
    if (!ln) {
      setDebugResult(null);
      return;
    }
    const matches = trips.filter(x => String(x.lineNum).replace(/^0+/, '') === ln);
    if (!matches.length) {
      setDebugResult({
        line: ln,
        found: false,
        msg: 'לא נמצא בנתונים'
      });
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
        stopsFirst: stopsSet ? [...stopsSet].slice(0, 10) : []
      });
    }
    setDebugResult({
      line: ln,
      found: true,
      variants
    });
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
  const explainRef = useRef(null);

  // ── מצב מפה ──────────────────────────────────────────────────────────────
  const [simLoading, setSimLoading] = useState(false);
  const [simSkipped, setSimSkipped] = useState(0); // קווים מבוטלים שהוחרגו מהסימולציה

  useEffect(() => {
    if (!activeExplainId) return;
    const handler = e => {
      if (explainRef.current && !explainRef.current.contains(e.target)) {
        setActiveExplainId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [activeExplainId]);
  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: 'desc'
  });
  const [activeTooltip, setActiveTooltip] = useState(null);
  const tooltipRef = useRef(null);

  // searchCity מתעדכן רק אחרי debounce (מתוך DebouncedInput) —
  // לכן ניתן להשתמש בו ישירות לסינון בלי לדחוף עוד מממואיזציה נוספת.

  useEffect(() => {
    setVisibleTripsCount(60);
  }, [searchCity, showCrowded, sortConfig, tab, filterLineType]);
  useEffect(() => {
    if (!activeTooltip) return;
    const handler = e => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target)) {
        setActiveTooltip(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [activeTooltip]);
  const {
    allDistricts,
    allCities,
    allDirections,
    allLineTypes
  } = useMemo(() => {
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
    // לפני שהנסיעות הגיעו — מהרשומות המחושבות מראש
    for (const r of linesPre || []) {
      if (r.district) dists.add(r.district);
      if (r.origin) cits.add(r.origin);
      if (r.dest) cits.add(r.dest);
    }
    return {
      allDistricts: Array.from(dists).sort(),
      allCities: Array.from(cits).sort(),
      allDirections: Array.from(dirs).sort(),
      allLineTypes: Array.from(types).sort()
    };
  }, [trips, linesPre]);
  const DAYS_FILTER = [{
    id: "1",
    label: "ראשון"
  }, {
    id: "2",
    label: "שני"
  }, {
    id: "3",
    label: "שלישי"
  }, {
    id: "4",
    label: "רביעי"
  }, {
    id: "5",
    label: "חמישי"
  }, {
    id: "6",
    label: "שישי"
  }, {
    id: "7",
    label: "שבת"
  }];

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
      const findCol = names => {
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
          const getValue = idx => idx >= 0 && idx < values.length ? values[idx].replace(/^"|"$/g, '') : '';
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
        const pct = 50 + Math.round((i - 1) / lines.length * 45);
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
  // שלב עצל: קובץ התחנות נטען ומפוענח ב-worker אחרי שהמסך הראשון הוצג. עד אז
  // חיפוש לפי עיר עובד לפי מוצא/יעד בלבד, וחפיפת תחנות בנסיעות התפעוליות לא נבדקת.
  const stopsStageRef = useRef(false);
  useEffect(() => {
    if (initialLoading || !trips.length || appMode === 'choice') return;
    if (lineStopsMap.size > 0 || stopsStageRef.current) return;
    stopsStageRef.current = true;
    const aliases = [];
    const seen = new Set();
    for (const t of trips) {
      const m = String(t.makat || '').replace(/^0+/, '');
      if (!m || seen.has(m)) continue;
      seen.add(m);
      aliases.push([m, String(t.lineNum || '')]);
    }
    const go = async () => {
      try {
        if (fileKeyRef.current) {
          const c = await idbGetCache(IDB_KEY + '-stops').catch(() => null);
          if (c && c.fileKey === fileKeyRef.current && c.lineStopsMap instanceof Map && c.lineStopsMap.size) {
            setLineCitiesMap(c.lineCitiesMap instanceof Map ? c.lineCitiesMap : new Map());
            setLineStopsMap(c.lineStopsMap);
            setLineNormStopsMap(c.lineNormStopsMap instanceof Map ? c.lineNormStopsMap : new Map());
            return;
          }
        }
        const res = await fetch('data-stops.json', {
          cache: 'no-cache'
        });
        if (!res.ok) return;
        const buf = await res.arrayBuffer();
        const worker = new Worker('xlsx-worker.js?v=20260918a');
        worker.onmessage = ev => {
          const msg = ev.data || {};
          if (msg.type === 'stops') {
            const lcm = msg.lineCitiesMap instanceof Map ? msg.lineCitiesMap : new Map();
            const lsm = msg.lineStopsMap instanceof Map ? msg.lineStopsMap : new Map();
            const lnsm = msg.lineNormStopsMap instanceof Map ? msg.lineNormStopsMap : new Map();
            setLineCitiesMap(lcm);
            setLineStopsMap(lsm);
            setLineNormStopsMap(lnsm);
            // המפות נשמרות תחת מפתח משלהן — בלי לשכפל שוב את 200 אלף הנסיעות
            if (fileKeyRef.current) idbSetCache(IDB_KEY + '-stops', {
              fileKey: fileKeyRef.current,
              lineCitiesMap: lcm,
              lineStopsMap: lsm,
              lineNormStopsMap: lnsm,
              savedAt: Date.now()
            });
          }
          worker.terminate();
        };
        worker.onerror = () => worker.terminate();
        worker.postMessage({
          type: 'stops',
          jsonStopsBuf: buf,
          aliases
        }, [buf]);
      } catch (e) {/* בלי תחנות — האתר עובד, בלי חיפוש עיר מדויק */}
    };
    const later = typeof requestIdleCallback === 'function' ? f => requestIdleCallback(f, {
      timeout: 4000
    }) : f => setTimeout(f, 1500);
    later(go);
  }, [initialLoading, trips, appMode, lineStopsMap]);

  // ── טעינה אוטומטית בעליית הקומפוננטה ──────────────────────────────────────
  // 4 קבצי מקור: מצומצם(ראשי) · מרחוב(לוז/שעות) · תחנות · עלות לנוסע(בנצ'מרק)
  const loadFromXLSX = useCallback(async () => {
    const FILES = {
      main: 'מצומצם.xlsx',
      schedule: 'מרחוב.xlsx',
      stops: 'תחנות.xlsx',
      benchmark: 'עלות לנוסע.xlsx'
    };
    // מפתח הקאש נגזר מהקבצים שבאמת נטענים — ה-JSON. ה-HEAD לקובצי ה-xlsx
    // הישנים החזיר 404, המפתח נשאר ריק, והקאש המקומי (IndexedDB) לא שימש
    // אף פעם: כל כניסה הורידה ופענחה מחדש 31MB (שלמה 18.09: "האתר איטי")
    const KEY_FILES = ['data-main.json', 'data-schedule.json', 'data-stops.json', 'data-benchmark.json'];
    try {
      // שלב 1: HEAD מקביל לכל הקבצים → מפתח קאש משולב.
      let fileKey = null;
      try {
        const sigs = await Promise.all(KEY_FILES.map(f =>
        // cache: 'no-cache' מאלץ אימות-מחדש מול השרת (304 אם לא השתנה) —
        // כך חתימת הקובץ תמיד עדכנית והקאש המקומי מתעדכן כשהנתונים משתנים.
        fetch(f, {
          method: 'HEAD',
          cache: 'no-cache'
        }).then(r => r.ok ? fileKeyFromHeaders(r) || '' : '').catch(() => '')));
        const combined = sigs.filter(Boolean).join('|');
        if (combined) fileKey = combined;
      } catch (e) {/* HEAD נכשל — נמשיך בלי קאש */}

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
          setCostBenchmarkTable(cached.costBenchmark || null);
          // DEBUG: חשיפה ל-window גם בטעינה מהקאש
          if (typeof window !== 'undefined') {
            window.__kp_trips = cached.trips;
            window.__kp_maps = {
              cities: cached.lineCitiesMap || new Map(),
              stops: cached.lineStopsMap || new Map(),
              normStops: cached.lineNormStopsMap || new Map()
            };
            window.__kp_bench = cached.costBenchmark || null;
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

      // שלב 3: אין קאש מתאים — הורדה מקבילה + פרסור.
      setFileLoading(true);
      setFileProgress(3);
      setFileMessage('מוריד קבצי נתונים…');
      fileKeyRef.current = fileKey;

      // הורדה עם מעקב progress לכל קובץ
      const grabWithProgress = async (f, required, onBytes) => {
        let res;
        try {
          res = await fetch(f, {
            cache: 'no-cache'
          });
        } catch (e) {
          if (required) throw e;
          return null;
        }
        if (!res.ok) {
          if (required) throw new Error(f + ' missing');
          return null;
        }
        const total = Number(res.headers.get('content-length') || 0);
        const reader = res.body.getReader();
        const chunks = [];
        let received = 0;
        while (true) {
          const {
            done,
            value
          } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          if (total > 0 && onBytes) onBytes(received, total);
        }
        const buf = new Uint8Array(received);
        let pos = 0;
        for (const c of chunks) {
          buf.set(c, pos);
          pos += c.length;
        }
        return buf.buffer;
      };

      // ── מסלול מהיר: JSON (אם קיים) ──────────────────────────────────────
      // קבצי JSON נוצרים מראש ע"י convert-to-json.js (~12MB במקום 46MB XLSX).
      // JSON.parse מהיר 50× מ-SheetJS — ~5 שניות במובייל במקום ~2 דקות.
      const jsonProbeCtl = new AbortController();
      const jsonProbeTimer = setTimeout(() => jsonProbeCtl.abort(), 3000);
      const jsonMainRes = await fetch('data-main.json', {
        cache: 'no-cache',
        signal: jsonProbeCtl.signal
      }).catch(() => null);
      clearTimeout(jsonProbeTimer);
      if (jsonMainRes && jsonMainRes.ok) {
        setFileMessage('מוריד נתונים (JSON)…');
        const JSON_EST = {
          main: 965_000,
          schedule: 9_840_000,
          benchmark: 3_000
        };
        const jsonTotalEst = Object.values(JSON_EST).reduce((a, b) => a + b, 0);
        const jsonReceived = {
          main: 0,
          schedule: 0,
          benchmark: 0
        };
        const updateJsonProgress = () => {
          const done = Object.entries(jsonReceived).reduce((s, [k, v]) => s + Math.min(v, JSON_EST[k]), 0);
          setFileProgress(Math.min(20, 2 + Math.round(done / jsonTotalEst * 18)));
        };
        // הקובץ הראשי כבר נטען — נמשוך ממנו את הנתונים
        const jsonMainReader = jsonMainRes.body.getReader();
        const jsonMainChunks = [];
        let jmRec = 0;
        while (true) {
          const {
            done,
            value
          } = await jsonMainReader.read();
          if (done) break;
          jsonMainChunks.push(value);
          jmRec += value.length;
          jsonReceived.main = jmRec;
          updateJsonProgress();
          setFileMessage('מוריד נתוני קווים…');
        }
        const jmBuf = new Uint8Array(jmRec);
        let jmPos = 0;
        for (const c of jsonMainChunks) {
          jmBuf.set(c, jmPos);
          jmPos += c.length;
        }

        // קובץ התחנות (15MB, הכבד מכולם) לא נטען כאן: הוא נדרש רק לחיפוש לפי עיר,
        // לחפיפות ולנסיעות התפעוליות — נטען בעצלות אחרי שהמסך הראשון הוצג (שלמה 18.09)
        const [jsonScheduleBuf, jsonBenchmarkBuf] = await Promise.all([grabWithProgress('data-schedule.json', false, b => {
          jsonReceived.schedule = b;
          updateJsonProgress();
        }), grabWithProgress('data-benchmark.json', false, b => {
          jsonReceived.benchmark = b;
          updateJsonProgress();
        })]);
        setFileMessage('מנתח נתונים…');
        await runWorker({
          jsonMainBuf: jmBuf.buffer,
          jsonScheduleBuf,
          jsonBenchmarkBuf
        });
        return true;
      }

      // ── מסלול רגיל: XLSX ─────────────────────────────────────────────────
      // גדלי קבצים משוערים (בבייטים) לחישוב progress כולל
      const EST = {
        main: 1_200_000,
        schedule: 24_000_000,
        stops: 22_000_000,
        benchmark: 20_000
      };
      const totalEst = Object.values(EST).reduce((a, b) => a + b, 0);
      const received = {
        main: 0,
        schedule: 0,
        stops: 0,
        benchmark: 0
      };
      const updateProgress = () => {
        const done = Object.entries(received).reduce((s, [k, v]) => s + Math.min(v, EST[k]), 0);
        const pct = Math.min(20, 2 + Math.round(done / totalEst * 18));
        const mb = (done / 1_000_000).toFixed(1);
        const totalMb = (totalEst / 1_000_000).toFixed(0);
        setFileProgress(pct);
        setFileMessage(`מוריד נתונים… ${mb} / ${totalMb} MB`);
      };
      const [main, schedule, stops, benchmark] = await Promise.all([grabWithProgress(FILES.main, true, b => {
        received.main = b;
        updateProgress();
      }), grabWithProgress(FILES.schedule, false, b => {
        received.schedule = b;
        updateProgress();
      }), grabWithProgress(FILES.stops, false, b => {
        received.stops = b;
        updateProgress();
      }), grabWithProgress(FILES.benchmark, false, b => {
        received.benchmark = b;
        updateProgress();
      })]);
      setFileMessage('מנתח נתונים…');
      await runWorker({
        main,
        schedule,
        stops,
        benchmark
      });
      return true;
    } catch (err) {
      console.log('xlsx auto-load failed:', err.message);
      setInitialLoading(false);
      setLoadError(true);
      return false;
    }
  }, []);

  // סדר עדיפויות ברשת (שלמה 18.09): קודם הקובץ המוכן (~400KB) והמסך הראשון, ורק
  // אחר כך הורדת הנסיעות (~1.7MB דחוס) — אחרת שני הקבצים חולקים את הפס והמסך
  // הראשון מחכה לכבד. אם אין קובץ מוכן — מיד, כמו קודם.
  useEffect(() => {
    if (!linesPreDone) return;
    setLoadError(false);
    setInitialLoading(true);
    setFileProgress(0);
    setFileMessage('טוען נתונים…');
    let cancelled = false;
    const go = () => {
      if (cancelled) return;
      (async () => {
        const ok = await loadFromXLSX();
        if (!ok) loadFromCSV();
      })();
    };
    let h = null;
    if (linesPre && linesPre.length) {
      // שלוש שניות אחרי המסך הראשון — שהמשתמש יראה ויתחיל לגלול לפני שהמעבד עסוק בנסיעות
      h = setTimeout(() => {
        const later = typeof requestIdleCallback === 'function' ? f => requestIdleCallback(f, {
          timeout: 3000
        }) : f => setTimeout(f, 300);
        later(go);
      }, 3000);
    } else go();
    return () => {
      cancelled = true;
    };
  }, [loadFromXLSX, loadFromCSV, retryCount, linesPreDone]);

  // טוען את ספריית XLSX ברקע (לצרכי ייצוא לאקסל בלבד — הפרסור עצמו רץ ב-worker).
  // קריאה לא חוסמת — אם הפרסור מסתיים לפני שה-XLSX הסתיים, אין בעיה.
  useEffect(() => {
    loadXLSX().catch(() => {/* swallow */});
  }, []);

  // ── runWorker — שולח payload ל-Web Worker ומטמיע את התוצאה ──────────────
  // payload: { buffer } (קובץ יחיד/ידני) או { main, schedule, stops, benchmark }.
  const runWorker = payload => {
    return new Promise(resolve => {
      let worker;
      try {
        worker = new Worker('xlsx-worker.js?v=20260918a'); // ?v= cache-busting — עדכן בכל פריסה
      } catch (err) {
        console.error('Worker creation failed:', err);
        alert('שגיאה ביצירת thread עיבוד: ' + err.message);
        setFileLoading(false);
        resolve();
        return;
      }
      worker.onmessage = ev => {
        const msg = ev.data;
        if (!msg) return;
        if (msg.type === 'progress') {
          // הורדה מסתיימת ב-42%; ממירים את אחוזי ה-Worker (0-100) לטווח 42-100
          // כך שהסרגל ממשיך קדימה ולא קופץ אחורה בעת מעבר משלב הורדה לשלב פרסור
          const remapped = 20 + Math.round(msg.percent / 100 * 79);
          setFileProgress(Math.min(remapped, 99));
          setFileMessage(msg.message);
        } else if (msg.type === 'done') {
          // lineCitiesMap מגיע כ-Map עם Set-ים בזכות structured clone
          const lcm = msg.lineCitiesMap instanceof Map ? msg.lineCitiesMap : new Map();
          const lsm = msg.lineStopsMap instanceof Map ? msg.lineStopsMap : new Map();
          const lnsm = msg.lineNormStopsMap instanceof Map ? msg.lineNormStopsMap : new Map();
          const bench = msg.costBenchmark || null;
          setLineCitiesMap(lcm);
          setLineStopsMap(lsm);
          setLineNormStopsMap(lnsm);
          setCostBenchmarkTable(bench);
          // DEBUG: חשיפה זמנית ל-window לטובת איתור באגים מהקונסול
          if (typeof window !== 'undefined') {
            window.__kp_trips = msg.trips || [];
            window.__kp_maps = {
              cities: lcm,
              stops: lsm,
              normStops: lnsm
            };
            window.__kp_bench = bench;
          }
          setTrips(msg.trips || []);
          setFileProgress(100);
          setFileMessage(`נטענו ${(msg.trips || []).length.toLocaleString()} נסיעות ✓`);
          setFileLoading(false);
          setInitialLoading(false);
          // שמירה בקאש (best-effort) — אחרי שהמסך הראשון צויר: השכפול של 200 אלף
          // נסיעות ל-IndexedDB חסם את התגובה הראשונה (Lighthouse: TBT)
          if (fileKeyRef.current) {
            const payload = {
              fileKey: fileKeyRef.current,
              trips: msg.trips || [],
              costBenchmark: bench,
              savedAt: Date.now()
            };
            const later = typeof requestIdleCallback === 'function' ? f => requestIdleCallback(f, {
              timeout: 8000
            }) : f => setTimeout(f, 2500);
            later(() => idbSetCache(IDB_KEY, payload));
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
      worker.onerror = err => {
        console.error('Worker exception:', err);
        alert('שגיאה בעיבוד הקובץ: ' + (err.message || 'unknown'));
        setFileLoading(false);
        worker.terminate();
        resolve();
      };

      // העברה ב-transfer: ה-buffers עוברים למחזיק ה-worker בלי copy.
      const buffers = payload.buffer ? [payload.buffer] : ['main', 'schedule', 'stops', 'benchmark'].map(k => payload[k]).filter(Boolean);
      try {
        worker.postMessage({
          type: 'parse',
          ...payload
        }, buffers);
      } catch (err) {
        // fallback אם הדפדפן לא תומך ב-transferable
        worker.postMessage({
          type: 'parse',
          ...payload
        });
      }
    });
  };

  // העלאה ידנית של קובץ יחיד (זרימת legacy — workbook עם כל הגיליונות).
  const onFile = async e => {
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
    return runWorker({
      buffer
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
  // הדירוג בשני שלבים (שלמה 18.09, בעקבות ההצעה לחישוב מוקדם):
  //   1. צבירה לכל קו (הכבד: 205 אלף נסיעות → ~5,000 רשומות) — aggregateLineGroups
  //      ב-kavpach-core.js. רץ ב-GitHub Actions בכל שינוי נתונים ונשמר ב-data-lines.json,
  //      והאתר טוען את התוצאה במקום לחשב בטלפון. אם הקובץ חסר — מחושב כאן כמו קודם.
  //   2. ניקוד לפי ההגדרות של המשתמש, הארכיון, החפיפות והנסיעות התפעוליות —
  //      scoreGroup, זול, רץ בדפדפן על הרשומות.
  const lineRecords = useMemo(() => {
    if (appMode !== 'kavpach') return [];
    if (linesPre && linesPre.length) return linesPre;
    if (!trips.length) return [];
    return aggregateLineGroups(trips, costBenchmarkTable);
  }, [trips, costBenchmarkTable, appMode, linesPre]);
  const redundantLines = useMemo(() => {
    if (appMode !== 'kavpach') return [];
    // הניקוד המוכן (ברירת מחדל, מהשרת) עד שהקבצים הנלווים נטענו; אחר כך — חישוב זהה
    // בדפדפן, שמעדכן אם קובץ נלווה התחדש מאז הבנייה או אם המשתמש שינה הגדרות
    const usePre = linesPre && linesPre.length && psetDefault && depsDone < 3 && lineRecords[0] && lineRecords[0].sc;
    const ctx = {
      pset,
      liveOf,
      overlapMap,
      dhObs
    };
    return lineRecords.map(r => usePre ? toLine(r, r.sc) : scoreGroup(r, ctx)).filter(l => l.score >= (Number(pset.minScore) || 0)).sort((a, b) => b.score - a.score);
  }, [lineRecords, liveOf, overlapMap, pset, appMode, dhObs, linesPre, psetDefault, depsDone]);
  const filteredRedundant = useMemo(() => {
    let result = [...redundantLines];
    // קישור עמוק לקו בודד — מסנן אליו בלבד עד שהמשתמש מנקה
    if (focusMakat) {
      const fm = String(focusMakat).replace(/^0+/, '').trim();
      result = result.filter(r => String(r.makat || '').replace(/^0+/, '').trim() === fm);
    }
    if (filterDistrict !== "all") {
      result = result.filter(r => r.district === filterDistrict);
    }
    if (filterCategory !== "all") {
      result = result.filter(r => r.category === filterCategory);
    }
    // סינון מספרי (שלמה 07.09)
    if (pFilt.minScore != null) result = result.filter(r => r.score >= pFilt.minScore);
    if (pFilt.minWasted != null) result = result.filter(r => r.wastedKm >= pFilt.minWasted);
    if (pFilt.maxRiders != null) result = result.filter(r => Number(r.avg) <= pFilt.maxRiders);
    if (pFilt.minTrips != null) result = result.filter(r => r.count >= pFilt.minTrips);
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
  }, [redundantLines, searchCity, filterDistrict, filterCategory, lineCitiesMap, redundantSortBy, focusMakat, pFilt]);
  useEffect(() => {
    setVisibleLineCount(30);
  }, [filteredRedundant]);
  const areaStats = useMemo(() => {
    if (tab !== 'areas') return []; // מחושב רק כשהלשונית פתוחה (שלמה: lazy calculating)
    const map = new Map();
    redundantLines.forEach(line => {
      // כאן הוספנו את הסינון - הניתוח האזורי יתייחס רק לקווים מיותרים לחלוטין (80 ומעלה)
      if (line.score < 80) return;
      // קו שכבר בוטל — הבזבוז שלו כבר נגמר; לספור אותו בניתוח האזורי
      // היה מנפח את "פוטנציאל החיסכון" של האזור במשהו שכבר נחסך
      if (line.live && line.live.rm) return;
      const keys = areaViewMode === 'district' ? [line.district] : Array.from(new Set([line.origin, line.dest]));
      keys.forEach(key => {
        if (!key || key === "לא ידוע" || key === "כללי") return;
        if (!map.has(key)) {
          map.set(key, {
            name: key,
            totalScore: 0,
            lineCount: 0,
            totalWastedKm: 0,
            totalCost: 0,
            validCostCount: 0,
            sumAvgRiders: 0,
            totalAreaTrips: 0,
            totalAreaRiders: 0,
            totalAnnualExcess: 0
          });
        }
        const entry = map.get(key);
        entry.totalScore += line.score;
        entry.lineCount += 1;
        entry.totalWastedKm += line.wastedKm;
        entry.totalAnnualExcess += line.annualExcess || 0;
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
        avgAreaRiders: entry.totalAreaTrips > 0 ? (entry.totalAreaRiders / entry.totalAreaTrips).toFixed(1) : 0,
        annualExcess: entry.totalAnnualExcess
      };
    }).sort((a, b) => {
      if (areaSortBy === 'wastedKm') return b.wastedKm - a.wastedKm;
      if (areaSortBy === 'lineCount') return b.lineCount - a.lineCount;
      if (areaSortBy === 'avgRiders') return parseFloat(a.avgAreaRiders) - parseFloat(b.avgAreaRiders);
      return b.avgScore - a.avgScore;
    });
  }, [tab, redundantLines, areaViewMode, areaSortBy]);
  const handleViewAreaLines = areaName => {
    if (areaViewMode === 'district') {
      setFilterDistrict(areaName);
      setSearchCity("");
    } else {
      setFilterDistrict("all");
      setSearchCity(areaName);
    }
    // מיון לפי ציון — הקווים שהכרטיס האזורי ספר (80+) מופיעים ראשונים
    setRedundantSortBy("score");
    setTab("redundant");
  };
  const exportAreaToExcel = (areaName, viewMode) => {
    // סינון הקווים הרלוונטיים לאזור שנבחר, ורק אלו שחשודים כמיותרים (ציון 80 ומעלה) כדי שיתאים לתצוגה.
    // קווים שכבר בוטלו מוחרגים — בדיוק כמו בספירה שעל הכרטיס (areaStats),
    // אחרת הקובץ המיוצא מכיל יותר שורות מהמספר שהכרטיס מציג
    const filteredLines = redundantLines.filter(line => {
      if (line.live && line.live.rm) return false;
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
      'ק"מ שימושי (ללא סרק)': line.nonWastedKm
    }));
    const ws = window.XLSX.utils.json_to_sheet(exportData);
    if (!ws['!views']) ws['!views'] = [];
    ws['!views'].push({
      rightToLeft: true
    }); // הגדרה מימין לשמאל
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "קווים_חשודים_כמיותרים");
    const fileName = `קווים_חשודים_כמיותרים_${areaName.replace(/\s+/g, '_')}.xlsx`;
    window.XLSX.writeFile(wb, fileName);
  };
  const tableTrips = useMemo(() => {
    if (appMode !== 'kavpach' || tab !== 'allTrips') return [];
    const sCity = searchCity.toLowerCase();
    // חיפוש אחיד עם הטאב המקביל במוזהב (סעיף 35): גם מספר קו/מק"ט, לא רק עיר
    const sLine = searchCity.trim().replace(/^0+/, '');
    let filtered = trips.filter(t => {
      if (filterLineType !== "all" && t.lineType !== filterLineType) return false;
      if (sCity) {
        const isLine = sLine && (String(t.lineNum).trim() === searchCity.trim() || String(t.makat || '').replace(/^0+/, '').trim() === sLine);
        const isOriginDest = t.origin.toLowerCase().includes(sCity) || t.dest.toLowerCase().includes(sCity);
        let isTransit = false;
        if (!isOriginDest && !isLine) {
          const makatKey = String(t.makat || '').replace(/^0+/, '').trim();
          const lineKey = String(t.lineNum || '').replace(/^0+/, '').trim();
          const citiesSet = lineCitiesMap.get(makatKey) || lineCitiesMap.get(lineKey);
          isTransit = citiesSet ? Array.from(citiesSet).some(c => c.includes(sCity)) : false;
        }
        if (!isOriginDest && !isTransit && !isLine) return false;
      }
      // "עמוסה" נמדדת מול הקיבולת של אותו רכב (80%, כמו ההדגשה האדומה
      // בטבלה) ולא מול סף קבוע של 40 — מיניבוס מלא נחשב עמוס, אוטובוס
      // גדול חצי ריק לא (בקשת שלמה, סעיף 25)
      if (showCrowded) {
        const cap80 = (t.capacity || 50) * 0.8;
        if (t.ridership < cap80 && t.peakLoad < cap80) return false;
      }
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
  }, [trips, searchCity, showCrowded, sortConfig, lineCitiesMap, filterLineType, appMode, tab]);
  const runOptimization = async (overrideLine, overrideCity, overrideDirection, overrideDays) => {
    const lineToUse = typeof overrideLine === 'string' ? overrideLine : optLine;
    const cityToUse = typeof overrideCity === 'string' ? overrideCity : optCity;
    const dirToUse = typeof overrideDirection === 'string' ? overrideDirection : optDirection;
    const daysToUse = Array.isArray(overrideDays) ? overrideDays : optDays;
    setSimLoading(true);
    setVisibleOptCount(50);
    await yieldFrame();

    // קווים שכבר בוטלו לפי ארכיון "הקו בזמן" לא נכנסים לסימולציה: בלעדי
    // הבדיקה הכלי המליץ "לבטל" נסיעות של קווים מתים — כולל באקסל המיוצא
    const skippedMakats = new Set();
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
        const makatKey = String(t.makat || '').replace(/^0+/, '').trim();
        const lineKey = String(t.lineNum || '').replace(/^0+/, '').trim();
        const citiesSet = lineCitiesMap.get(makatKey) || lineCitiesMap.get(lineKey);
        const matchesTransit = citiesSet ? Array.from(citiesSet).some(c => c.includes(sCity)) : false;
        if (!matchesOriginDest && !matchesTransit) return false;
      }
      if (dirToUse && dirToUse !== "all" && !String(t.direction).includes(dirToUse)) return false;
      if (daysToUse && daysToUse.length > 0) {
        const hasMatchingDay = daysToUse.some(day => t.daysList.includes(String(day)));
        if (!hasMatchingDay) return false;
      }
      // בדיקת הביטול אחרונה — נספרים רק קווים שבאמת היו נכנסים לריצה
      // הזו, לא כל 338 המבוטלים שבמאגר (ציד הבאגים, סבב ב)
      const live = liveOf(t.makat);
      if (live && live.rm) {
        skippedMakats.add(t.makat);
        return false;
      }
      return true;
    });
    setSimSkipped(skippedMakats.size);
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
      // המק"ט בתוך מפתח הקיבוץ (בקשת שלמה): שתי חלופות מסלול של אותו
      // מספר קו הן קווים שונים בשטח — איחוד נסיעה מחלופה א' עם נסיעה
      // מחלופה ב' אינו אפשרי לנוסע שתלוי בתחנה שקיימת רק באחת מהן
      const key = `${t.makat || ''}|${t.lineNum}|${t.direction}|${t.days}|${t.origin}|${t.dest}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(t);
      const countKey = `${t.makat || ''}|${t.lineNum}|${t.daysList.join('')}`;
      lineDayCounts[countKey] = (lineDayCounts[countKey] || 0) + t.tripCount;
    });
    const customGapValue = parseInt(optCustomGap, 10);
    const groupEntries = Object.values(grouped);
    const GSIM_CHUNK = 300;
    for (let gi = 0; gi < groupEntries.length; gi++) {
      const group = groupEntries[gi];
      group.sort((a, b) => a.timeMins - b.timeMins);
      const usedTrips = new Set();
      // נסיעות שבוטלו בריצה הזו — נסיעה מבוטלת אינה "חלופה קרובה" למי
      // שבא לבטל את השכנה שלה (אחרת שתי נסיעות סמוכות מבטלות זו את זו)
      const cancelledIds = new Set();
      // שעת היעד החדשה של נסיעות שאוחדו — בדיקת "חלופה קרובה" נמדדת
      // מהשעה האמיתית אחרי ההזזה, לא מהשעה המקורית (ציד הבאגים, סבב ב)
      const effTime = new Map();
      const cancelInfo = new Map(); // id -> {rec, gapCheck, dayKey} לאימות בדיעבד
      let cancelledInGroup = 0;
      for (let i = 0; i < group.length; i++) {
        const t1 = group[i];
        if (usedTrips.has(t1.id)) continue;
        const t2 = i < group.length - 1 ? group[i + 1] : null;
        // שתי יציאות באותה דקה: בעבר t1 פשוט דולג ונעלם מהתוצאות (לוח
        // זמנים חסר). עכשיו הוא ממשיך לבדיקה רגילה — זוג באותה דקה עם
        // מעט נוסעים הוא מועמד האיחוד הטבעי ביותר (gap 0), ועם הרבה
        // נוסעים הוא מוצג כ"תקין" כמו כל נסיעה אחרת.

        let merged = false;
        const category = getLineCategory(t1.lineType);
        const totalTripsInDay = lineDayCounts[`${t1.makat || ''}|${t1.lineNum}|${t1.daysList.join('')}`] || 0;
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
        const getMetricVal = t => optMetric === 'peakLoad' && t.peakLoad > 0 ? t.peakLoad : t.ridership;
        if (t2 && !usedTrips.has(t2.id) && totalTripsInDay >= 6) {
          const gap1 = t2.timeMins - t1.timeMins;
          const val1 = getMetricVal(t1);
          const val2 = getMetricVal(t2);
          const totalVal1 = val1 + val2;
          const t3 = i < group.length - 2 ? group[i + 2] : null;
          let skipForBetterMerge = false;
          if (t3 && !usedTrips.has(t3.id)) {
            const gap2 = t3.timeMins - t2.timeMins;
            const val3 = getMetricVal(t3);
            const totalVal2 = val2 + val3;
            if (gap2 >= 0 && gap2 < gap1 && gap2 <= maxGapMerge && val2 < maxRidersEach && val3 < maxRidersEach && totalVal2 < maxTotalMerge) {
              skipForBetterMerge = true;
            }
          }
          if (!skipForBetterMerge && gap1 >= 0 && gap1 <= maxGapMerge && val1 < maxRidersEach && val2 < maxRidersEach && totalVal1 < maxTotalMerge && (!isNight || hasCustomGap)) {
            const suggestedMins = Math.floor((t1.timeMins + t2.timeMins) / 2);
            const suggestedTime = `${String(Math.floor(suggestedMins / 60)).padStart(2, '0')}:${String(suggestedMins % 60).padStart(2, '0')}`;
            results.push({
              type: 'merge',
              isNightLine: t1.isNightLine,
              isEilatPrebooked: t1.isEilatPrebooked,
              isFeedingLine: t1.isFeedingLine,
              categoryLabel: category === 'urban' ? 'עירוני' : category === 'regional' ? 'אזורי' : 'בין-עירוני',
              line: t1.lineNum,
              origin: t1.origin,
              dest: t1.dest,
              direction: t1.direction,
              from: t1.time,
              to: t2.time,
              timeMins: t1.timeMins,
              suggestedTime: suggestedTime,
              days: t1.days,
              gap: gap1,
              usedMetric: optMetric,
              total: Number(totalVal1.toFixed(2)),
              val1: val1,
              val2: val2,
              busSize: t1.busSize,
              capacity: t1.capacity,
              efficiency: t1.efficiency,
              metricVal: val1
            });
            usedTrips.add(t1.id);
            usedTrips.add(t2.id);
            merged = true;
            actionTaken = true;
            effTime.set(t1.id, suggestedMins);
            effTime.set(t2.id, suggestedMins);
          }
        }
        if (!merged) {
          const valCancel = getMetricVal(t1);
          if (valCancel < cancelRiders) {
            let allowCancel = true;
            const dayKey = `${t1.makat || ''}|${t1.lineNum}|${t1.daysList.join('')}`;
            const totalTripsBothDirs = lineDayCounts[dayKey] || 0;
            const currentCancelledBoth = cancelledCountByLineDay[dayKey] || 0;
            const userMinTrips = parseInt(optMinTrips, 10);
            const minRequired = !isNaN(userMinTrips) ? userMinTrips : category === 'regional' ? 3 : 0;
            if (totalTripsBothDirs - currentCancelledBoth <= minRequired) {
              allowCancel = false;
            }

            // הגנה חדשה: אסור לבטל נסיעה ראשונה או אחרונה ביום של הקו והכיוון.
            // ביטול קצוות יומיים פוגע פגיעה לא פרופורציונלית בנוסעים שתלויים בקו.
            const isFirstOfDay = i === 0;
            const isLastOfDay = i === group.length - 1;
            if (isFirstOfDay || isLastOfDay) {
              allowCancel = false;
            }
            if (allowCancel) {
              let hasAlternative = false;
              const prev = i > 0 ? group[i - 1] : null;
              const next = t2;
              const prevT = prev ? effTime.has(prev.id) ? effTime.get(prev.id) : prev.timeMins : 0;
              if (prev && !cancelledIds.has(prev.id) && t1.timeMins - prevT <= cancelGapCheck) hasAlternative = true;
              if (next && next.timeMins - t1.timeMins <= cancelGapCheck) hasAlternative = true;
              if (hasAlternative) {
                results.push({
                  type: 'cancel',
                  isNightLine: t1.isNightLine,
                  isEilatPrebooked: t1.isEilatPrebooked,
                  isFeedingLine: t1.isFeedingLine,
                  categoryLabel: category === 'urban' ? 'עירוני' : category === 'regional' ? 'אזורי' : 'בין-עירוני',
                  line: t1.lineNum,
                  origin: t1.origin,
                  dest: t1.dest,
                  direction: t1.direction,
                  time: t1.time,
                  timeMins: t1.timeMins,
                  days: t1.days,
                  usedMetric: optMetric,
                  metricVal: valCancel,
                  efficiency: t1.efficiency,
                  busSize: t1.busSize,
                  capacity: t1.capacity
                });
                usedTrips.add(t1.id);
                cancelledIds.add(t1.id);
                cancelledInGroup++;
                cancelledCountByLineDay[dayKey] = (cancelledCountByLineDay[dayKey] || 0) + 1;
                actionTaken = true;
                cancelInfo.set(t1.id, {
                  rec: results[results.length - 1],
                  gapCheck: cancelGapCheck,
                  dayKey
                });
              }
            }
          }
        }
        if (!actionTaken && !usedTrips.has(t1.id)) {
          results.push({
            type: 'ok',
            isNightLine: t1.isNightLine,
            isEilatPrebooked: t1.isEilatPrebooked,
            isFeedingLine: t1.isFeedingLine,
            categoryLabel: category === 'urban' ? 'עירוני' : category === 'regional' ? 'אזורי' : 'בין-עירוני',
            line: t1.lineNum,
            origin: t1.origin,
            dest: t1.dest,
            direction: t1.direction,
            time: t1.time,
            timeMins: t1.timeMins,
            days: t1.days,
            usedMetric: optMetric,
            metricVal: getMetricVal(t1),
            efficiency: t1.efficiency,
            busSize: t1.busSize,
            capacity: t1.capacity
          });
          usedTrips.add(t1.id);
        }
      }
      // אימות בדיעבד: ביטול שנשען על "חלופה" שבוטלה או הוזזה אחריו —
      // מוחזר. כך שרשרת ביטולים (קווי לילה בעיקר) לא משאירה נוסעים
      // בלי חלופה אמיתית בטווח שהכלי מבטיח (ציד הבאגים, סבב ב)
      let revalidate = true;
      while (revalidate) {
        revalidate = false;
        for (const [cid, info] of cancelInfo) {
          if (!cancelledIds.has(cid)) continue;
          const ct = group.find(x => x.id === cid);
          if (!ct) continue;
          const stillOk = group.some(m => m.id !== cid && !cancelledIds.has(m.id) && Math.abs((effTime.has(m.id) ? effTime.get(m.id) : m.timeMins) - ct.timeMins) <= info.gapCheck);
          if (!stillOk) {
            cancelledIds.delete(cid);
            info.rec.type = 'ok';
            cancelledCountByLineDay[info.dayKey] = Math.max(0, (cancelledCountByLineDay[info.dayKey] || 1) - 1);
            cancelledInGroup = Math.max(0, cancelledInGroup - 1);
            revalidate = true;
          }
        }
      }
      if (gi % GSIM_CHUNK === GSIM_CHUNK - 1) await yieldFrame();
    }
    results.sort((a, b) => {
      if (cityToUse && cityToUse !== "all") {
        const getWeight = lbl => lbl === 'עירוני' ? 1 : lbl === 'אזורי' ? 2 : 3;
        const wA = getWeight(a.categoryLabel);
        const wB = getWeight(b.categoryLabel);
        if (wA !== wB) return wA - wB;
      }
      const lineComp = String(a.line || "").localeCompare(String(b.line || ""), 'he', {
        numeric: true
      });
      if (lineComp !== 0) return lineComp;
      const pairA = [String(a.origin || "").trim(), String(a.dest || "").trim()].sort().join('-');
      const pairB = [String(b.origin || "").trim(), String(b.dest || "").trim()].sort().join('-');
      const pairComp = pairA.localeCompare(pairB, 'he');
      if (pairComp !== 0) return pairComp;
      const dirComp = String(a.direction || "").localeCompare(String(b.direction || ""), 'he', {
        numeric: true
      });
      if (dirComp !== 0) return dirComp;
      const getDayVal = d => {
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
        return {
          'מספר קו': opt.line,
          'סוג קו': opt.categoryLabel,
          'סוג רכב': opt.busSize,
          'מוצא': opt.origin,
          'יעד': opt.dest,
          'כיוון': opt.direction,
          'ימי פעילות': opt.days,
          'פעולה מומלצת': 'איחוד נסיעות',
          'שעות מקוריות': `${opt.from}, ${opt.to}`,
          'שעה מוצעת (חדשה)': opt.suggestedTime,
          'מדד (נוסעים / עומס)': `סה"כ ${metricName}: ${opt.total} (נסיעה 1: ${opt.val1}, נסיעה 2: ${opt.val2})`,
          'הערות': opt.gap === 0 ? 'שתי יציאות באותה דקה — איחוד לרכב אחד' : `איחוד 2 נסיעות בהפרש של ${opt.gap} דקות`
        };
      } else if (opt.type === 'cancel') {
        return {
          'מספר קו': opt.line,
          'סוג קו': opt.categoryLabel,
          'סוג רכב': opt.busSize,
          'מוצא': opt.origin,
          'יעד': opt.dest,
          'כיוון': opt.direction,
          'ימי פעילות': opt.days,
          'פעולה מומלצת': 'ביטול נסיעה',
          'שעות מקוריות': opt.time,
          'שעה מוצעת (חדשה)': '--',
          'מדד (נוסעים / עומס)': `${metricName}: ${opt.metricVal}`,
          'הערות': 'חשד לנסיעה מיותרת עם חלופה קרובה בזמן'
        };
      } else {
        return {
          'מספר קו': opt.line,
          'סוג קו': opt.categoryLabel,
          'סוג רכב': opt.busSize,
          'מוצא': opt.origin,
          'יעד': opt.dest,
          'כיוון': opt.direction,
          'ימי פעילות': opt.days,
          'פעולה מומלצת': 'ללא שינוי (תקין)',
          'שעות מקוריות': opt.time,
          'שעה מוצעת (חדשה)': opt.time,
          'מדד (נוסעים / עומס)': `${metricName}: ${opt.metricVal}`,
          'הערות': 'נסיעה תקינה שעומדת בתנאי'
        };
      }
    });
    const ws = window.XLSX.utils.json_to_sheet(exportData);
    if (!ws['!views']) ws['!views'] = [];
    ws['!views'].push({
      rightToLeft: true
    });
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
  const toggleDay = dayId => {
    setOptDays(prev => prev.includes(dayId) ? prev.filter(d => d !== dayId) : [...prev, dayId]);
  };
  const renderTransitChip = (origin, dest) => {
    if (!optCity || optCity === "all") return null;
    const sCity = optCity.toLowerCase();
    const isOriginDest = (origin || "").toLowerCase().includes(sCity) || (dest || "").toLowerCase().includes(sCity);
    if (isOriginDest) return null;
    return /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-black bg-teal-100 text-teal-700 px-2 py-1 rounded-md"
    }, "\u05E2\u05D5\u05D1\u05E8 \u05D3\u05E8\u05DA: ", optCity);
  };
  const renderPrebookedInfo = (id, isPrebooked) => {
    if (!isPrebooked) return null;
    const showExplain = activeExplainId === id;
    return /*#__PURE__*/React.createElement("div", {
      className: "relative inline-flex items-center"
    }, /*#__PURE__*/React.createElement("button", {
      onClick: e => {
        e.stopPropagation();
        setActiveExplainId(showExplain ? null : id);
      },
      className: "w-5 h-5 rounded-full bg-slate-100 text-slate-600 font-bold text-sm flex items-center justify-center border border-slate-300 hover:bg-slate-200 transition-colors mx-1 outline-none relative z-10",
      title: "\u05DE\u05D9\u05D3\u05E2 \u05E2\u05DC \u05E0\u05EA\u05D5\u05E0\u05D9 \u05D4\u05E7\u05D5"
    }, "!"), showExplain && /*#__PURE__*/React.createElement("div", {
      ref: explainRef,
      className: "absolute top-8 right-0 left-auto p-3 sm:p-4 bg-white text-slate-800 text-xs sm:text-sm rounded-xl shadow-2xl z-[9999] leading-relaxed font-normal text-right normal-case border border-slate-200 ring-1 ring-slate-900/5",
      style: {
        position: 'absolute',
        width: 'min(16rem, calc(100vw - 3rem))'
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: e => {
        e.stopPropagation();
        setActiveExplainId(null);
      },
      "aria-label": "\u05E1\u05D2\u05D9\u05E8\u05EA \u05D4\u05D4\u05E1\u05D1\u05E8",
      className: "absolute top-2 left-2 w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 font-black text-sm leading-none transition-colors"
    }, "\xD7"), /*#__PURE__*/React.createElement("strong", {
      className: "block mb-2 text-slate-900 text-base"
    }, "\u05E7\u05D5 \u05D1\u05D4\u05D6\u05DE\u05E0\u05D4 \u05DE\u05E8\u05D0\u05E9"), "\u05D1\u05D2\u05DC\u05DC \u05E9\u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05E8\u05D5\u05DB\u05E9\u05D9\u05DD \u05DB\u05E8\u05D8\u05D9\u05E1 \u05DE\u05E8\u05D0\u05E9, \u05D7\u05DC\u05E7\u05DD \u05DC\u05D0 \u05DE\u05EA\u05E7\u05E4\u05D9\u05DD \u05E9\u05D5\u05D1 \u05D1\u05E2\u05DC\u05D9\u05D9\u05D4 \u05DC\u05D0\u05D5\u05D8\u05D5\u05D1\u05D5\u05E1. \u05DC\u05DB\u05DF, \u05E0\u05EA\u05D5\u05E0\u05D9 \u05D4\u05EA\u05D9\u05E7\u05D5\u05E4\u05D9\u05DD \u05DB\u05D0\u05DF \u05D7\u05DC\u05E7\u05D9\u05D9\u05DD \u05D5\u05E2\u05DC\u05D5\u05DC\u05D9\u05DD \u05DC\u05D4\u05E6\u05D9\u05D2 \u05E2\u05D5\u05DE\u05E1 \u05E0\u05DE\u05D5\u05DA \u05DE\u05DE\u05D4 \u05E9\u05E7\u05D5\u05E8\u05D4 \u05D1\u05E4\u05D5\u05E2\u05DC."));
  };
  const renderFeedingLineInfo = (id, isFeeding) => {
    if (!isFeeding) return null;
    const showExplain = activeExplainId === id;
    return /*#__PURE__*/React.createElement("div", {
      className: "relative inline-flex items-center"
    }, /*#__PURE__*/React.createElement("button", {
      onClick: e => {
        e.stopPropagation();
        setActiveExplainId(showExplain ? null : id);
      },
      className: "w-5 h-5 rounded-full bg-sky-100 text-sky-700 font-bold text-sm flex items-center justify-center border border-sky-300 hover:bg-sky-200 transition-colors mx-1 outline-none relative z-10",
      title: "\u05DE\u05D9\u05D3\u05E2 \u05E2\u05DC \u05E7\u05D5 \u05DE\u05D6\u05D9\u05DF \u05E8\u05DB\u05D1\u05EA"
    }, "!"), showExplain && /*#__PURE__*/React.createElement("div", {
      ref: explainRef,
      className: "absolute top-8 right-0 left-auto p-3 sm:p-4 bg-white text-slate-800 text-xs sm:text-sm rounded-xl shadow-2xl z-[9999] leading-relaxed font-normal text-right normal-case border border-slate-200 ring-1 ring-slate-900/5",
      style: {
        position: 'absolute',
        width: 'min(16rem, calc(100vw - 3rem))'
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: e => {
        e.stopPropagation();
        setActiveExplainId(null);
      },
      "aria-label": "\u05E1\u05D2\u05D9\u05E8\u05EA \u05D4\u05D4\u05E1\u05D1\u05E8",
      className: "absolute top-2 left-2 w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 font-black text-sm leading-none transition-colors"
    }, "\xD7"), /*#__PURE__*/React.createElement("strong", {
      className: "block mb-2 text-slate-900 text-base"
    }, "\u05E7\u05D5 \u05DE\u05D6\u05D9\u05DF \u05E8\u05DB\u05D1\u05EA"), "\u05DE\u05D8\u05E8\u05EA \u05E7\u05D5 \u05D6\u05D4 \u05D4\u05D9\u05D0 \u05DC\u05D0\u05E1\u05D5\u05E3 \u05D0\u05D5 \u05DC\u05E4\u05D6\u05E8 \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05DE\u05EA\u05D7\u05E0\u05EA \u05D4\u05E8\u05DB\u05D1\u05EA. \u05DC\u05DB\u05DF, \u05DC\u05E4\u05E0\u05D9 \u05E7\u05D1\u05DC\u05EA \u05D4\u05D7\u05DC\u05D8\u05D4 \u05E2\u05DC \u05D1\u05D9\u05D8\u05D5\u05DC \u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05D0\u05D5 \u05E9\u05D9\u05E0\u05D5\u05D9 \u05E9\u05E2\u05D5\u05EA \u05D4\u05E4\u05E2\u05D9\u05DC\u05D5\u05EA \u05E9\u05DC\u05D5, \u05DE\u05D5\u05DE\u05DC\u05E5 \u05DC\u05D1\u05D3\u05D5\u05E7 \u05D5\u05DC\u05D4\u05E6\u05DC\u05D9\u05D1 \u05D0\u05EA \u05D4\u05DE\u05D9\u05D3\u05E2 \u05E2\u05DD \u05DC\u05D5\u05D7 \u05D4\u05D6\u05DE\u05E0\u05D9\u05DD \u05D4\u05DE\u05E2\u05D5\u05D3\u05DB\u05DF \u05E9\u05DC \u05D4\u05E8\u05DB\u05D1\u05EA."));
  };
  const handleOptimizeLineForm = (lineNum, city) => {
    setOptLine(lineNum);
    setOptCity(city || "all");
    setOptDirection("all");
    setOptDays([]);
    setTab("simulator");
    runOptimization(lineNum, city || "all", "all", []);
  };

  // מסך טעינה מלא — מוצג רק כשנכנסים לכלי לפני שהנתונים מוכנים
  // מסך הטעינה מעוגן למעלה (לא ממורכז אנכית): כשהאפליקציה מופיעה הכותרת לא קופצת — Lighthouse: CLS 0.41
  const fullLoadingScreen = /*#__PURE__*/React.createElement("div", {
    key: "loading",
    className: "min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-start gap-6 px-6 pt-24 md:pt-32",
    dir: "rtl",
    style: {
      fontFamily: "'Heebo', sans-serif"
    }
  }, loadError ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "w-16 h-16 rounded-full bg-red-100 flex items-center justify-center"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 28
    }
  }, "\u26A0\uFE0F")), /*#__PURE__*/React.createElement("div", {
    className: "text-center"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-slate-900 font-black text-lg"
  }, "\u05D4\u05D8\u05E2\u05D9\u05E0\u05D4 \u05E0\u05DB\u05E9\u05DC\u05D4"), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-500 font-bold text-sm mt-1"
  }, "\u05D1\u05D3\u05D5\u05E7 \u05D7\u05D9\u05D1\u05D5\u05E8 \u05DC\u05D0\u05D9\u05E0\u05D8\u05E8\u05E0\u05D8 \u05D5\u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1")), /*#__PURE__*/React.createElement("button", {
    onClick: () => setRetryCount(c => c + 1),
    className: "bg-slate-900 text-white font-black px-8 py-3.5 rounded-2xl shadow-md hover:bg-slate-700 transition-colors"
  }, "\u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Ic, {
    n: "loader",
    size: 48,
    cls: "text-slate-900",
    animate: true
  }), /*#__PURE__*/React.createElement("div", {
    className: "text-center w-full max-w-xs"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-slate-800 font-black text-lg mb-3"
  }, fileLoad.message || 'טוען נתונים…'), /*#__PURE__*/React.createElement("div", {
    className: "w-full bg-slate-200 rounded-full h-3 overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "h-3 rounded-full bg-slate-900 transition-all duration-500",
    style: {
      width: `${fileLoad.progress || 2}%`
    }
  })), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-500 font-black text-sm mt-2"
  }, fileLoad.progress || 0, "%"))));

  // מסך בחירה — תמיד נגיש מיד (לא מחכה לנתונים)
  if (appMode === 'choice') return /*#__PURE__*/React.createElement(ChoiceScreen, {
    onPick: pickMode
  });
  // כלים — מחכים לנתונים; מראים טעינה עד שהם מוכנים
  // עם הרשומות המחושבות מראש המסך עולה מיד; בלעדיהן (או במוזהב, שצריך נסיעות) מחכים לנסיעות
  const preReady = !!(linesPre && linesPre.length) && appMode === 'kavpach';
  if (!preReady && (initialLoading || trips.length === 0)) return fullLoadingScreen;
  if (appMode === 'golden') return /*#__PURE__*/React.createElement(GoldenApp, {
    onBack: () => pickMode('choice'),
    trips: trips,
    costBenchmarkTable: costBenchmarkTable,
    lineCitiesMap: lineCitiesMap,
    liveOf: liveOf,
    liveGen: liveGen,
    focusMakat: focusMakat,
    onClearFocus: () => {
      setFocusMakat(null);
      try {
        window.location.hash = 'מוזהב';
      } catch (e) {}
    }
  });

  // key נפרד למסך הטעינה ולאפליקציה: בלי זה React השתמש באותו DOM והאלמנט "זז" — Lighthouse: CLS
  return /*#__PURE__*/React.createElement("div", {
    key: "app",
    className: "min-h-screen bg-[#F8FAFC] text-slate-900 p-4 md:p-6 pb-20",
    style: {
      fontFamily: "'Heebo', sans-serif"
    },
    dir: "rtl"
  }, /*#__PURE__*/React.createElement(CitiesDatalist, {
    cities: allCities
  }), /*#__PURE__*/React.createElement("div", {
    className: "max-w-6xl mx-auto"
  }, /*#__PURE__*/React.createElement("header", {
    className: "mb-10 flex flex-col md:flex-row items-center justify-between gap-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-center md:text-right"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3 justify-center md:justify-end"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-slate-900 text-white p-2.5 rounded-2xl rotate-3 shadow-lg"
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "trash",
    size: 28
  })), /*#__PURE__*/React.createElement("h1", {
    className: "text-4xl font-[900] text-slate-900 tracking-tighter leading-none"
  }, "\u05E7\u05D5 \u05E4\u05D7"), /*#__PURE__*/React.createElement("div", {
    className: "relative mr-3 flex items-center gap-3"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-xs font-bold text-slate-500"
  }, "\u05E0\u05D1\u05E0\u05D4 \u05E2\u05DC \u05D9\u05D3\u05D9 \u05E9\u05DC\u05DE\u05D4 \u05D4\u05E8\u05D8\u05DE\u05DF"))), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-500 text-sm font-bold mt-2 pr-1"
  }, "\u05DE\u05D0\u05EA\u05E8\u05D9\u05DD \u05E7\u05D5\u05D5\u05D9\u05DD \u05E8\u05D9\u05E7\u05D9\u05DD \u2022 \u05DE\u05D9\u05D9\u05E2\u05DC\u05D9\u05DD \u05D0\u05EA \u05D4\u05DC\u05D5\"\u05D6"), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-500 text-[11px] font-bold mt-1 pr-1"
  }, "\u05E0\u05EA\u05D5\u05E0\u05D9 \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05D5\u05E2\u05DC\u05D5\u05D9\u05D5\u05EA: \u05E6\u05D9\u05DC\u05D5\u05DD \u05DE\u05E9\u05E8\u05D3 \u05D4\u05EA\u05D7\u05D1\u05D5\u05E8\u05D4, \u05D9\u05D5\u05E0\u05D9 2026", ' · הצלבה מול רישום הקווים העדכני: ', liveGen ? String(liveGen).split('-').reverse().join('.') : /*#__PURE__*/React.createElement("span", {
    className: "inline-block w-16 h-[1em] align-middle bg-slate-100 rounded",
    "aria-hidden": "true"
  }))), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => pickMode('choice'),
    className: "kb-home",
    title: "\u05D7\u05D6\u05E8\u05D4 \u05DC\u05E2\u05DE\u05D5\u05D3 \u05D4\u05E8\u05D0\u05E9\u05D9"
  }, "\u2190 \u05D7\u05D6\u05E8\u05D4 \u05DC\u05E7\u05D5 \u05D4\u05D1\u05D5\u05D7\u05DF")), (fileLoad.active || initialLoading) && trips.length === 0 && linesPre && linesPre.length ?
  /*#__PURE__*/
  /* הרשומות המחושבות מראש כבר על המסך — הנסיעות (ללשוניות האחרות) נטענות ברקע, פס דק בלבד */
  /* צף בתחתית המסך — לא דוחף את התוכן (Lighthouse: CLS) */
  React.createElement("div", {
    className: "fixed bottom-4 left-4 z-40 bg-white/95 border border-slate-200 rounded-2xl shadow-lg px-4 py-2 flex items-center gap-3 text-xs font-bold text-slate-600",
    style: {
      width: 'min(20rem, calc(100vw - 2rem))'
    },
    role: "status",
    "aria-live": "polite"
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "loader",
    size: 14,
    cls: "text-slate-500",
    animate: true
  }), /*#__PURE__*/React.createElement("span", {
    className: "whitespace-nowrap"
  }, fileLoad.message || 'טוען את הנסיעות ברקע…'), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "h-1.5 rounded-full bg-slate-700",
    style: {
      width: `${fileLoad.progress || 2}%`,
      transition: 'width 0.3s ease'
    }
  }))) : null, (fileLoad.active || initialLoading) && !(linesPre && linesPre.length) ? /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col items-center justify-center py-40 text-center gap-6"
  }, fileLoad.progress < 48 ? /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col items-center gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center"
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "loader",
    size: 28,
    cls: "text-white",
    animate: true
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-xl font-black text-slate-900"
  }, initialLoading && !fileLoad.active ? "טוען נתונים..." : fileLoad.message), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-500 text-sm font-bold mt-1"
  }, "\u05D9\u05E7\u05D7 \u05DB\u05DE\u05D4 \u05E9\u05E0\u05D9\u05D5\u05EA"))) : /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col items-center gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      willChange: 'transform'
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "loader",
    size: 64,
    cls: "text-slate-900",
    animate: true
  })), /*#__PURE__*/React.createElement("p", {
    className: "text-xl font-black text-slate-800"
  }, fileLoad.message), /*#__PURE__*/React.createElement("div", {
    className: "w-72 bg-slate-200 rounded-full h-3 overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "h-3 rounded-full bg-slate-900",
    style: {
      width: `${fileLoad.progress}%`,
      transition: 'width 0.3s ease'
    }
  })), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-500 font-bold text-sm"
  }, fileLoad.progress, "%"))) : trips.length === 0 && !preReady && csvLoadFailed ? /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col items-center justify-center py-32 px-6 bg-white rounded-[3rem] border-4 border-dashed border-slate-200 shadow-sm text-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-slate-50 p-8 rounded-full mb-8"
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "upload",
    size: 48,
    cls: "text-slate-300"
  })), /*#__PURE__*/React.createElement("h2", {
    className: "text-3xl font-black text-slate-800 mb-4"
  }, "\u05DE\u05D5\u05DB\u05E0\u05D9\u05DD \u05DC\u05D6\u05E8\u05D5\u05E7 \u05E7\u05D5\u05D5\u05D9\u05DD?"), /*#__PURE__*/React.createElement("h3", {
    className: "text-xl font-black text-slate-700 mb-3 bg-indigo-50 text-indigo-800 px-5 py-2 rounded-xl border border-indigo-100 shadow-sm inline-block"
  }, "\u05D4\u05DE\u05E2\u05E8\u05DB\u05EA \u05E9\u05DE\u05D5\u05E6\u05D0\u05EA \u05E7\u05D5\u05D5\u05D9\u05DD \u05E9\u05D0\u05E4\u05E9\u05E8 \u05DC\u05D6\u05E8\u05D5\u05E7 \u05DC\u05E4\u05D7"), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-500 font-medium mb-6 max-w-md"
  }, "\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0 \u05E7\u05D5\u05D1\u05E5 \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05DE\u05E7\u05D5\u05DE\u05D9 (data.csv)."), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-500 font-medium mb-12 max-w-md"
  }, "\u05D4\u05E2\u05DC\u05D5 \u05E7\u05D5\u05D1\u05E5 \u05D0\u05E7\u05E1\u05DC \u05E2\u05DD \u05E0\u05EA\u05D5\u05E0\u05D9 \u05EA\u05D9\u05E7\u05D5\u05E4\u05D9\u05DD \u05DB\u05D3\u05D9 \u05DC\u05D4\u05EA\u05D7\u05D9\u05DC \u05D1\u05E0\u05D9\u05EA\u05D5\u05D7 \u05D4\u05DE\u05E2\u05E8\u05DB\u05EA."), /*#__PURE__*/React.createElement("label", {
    className: "bg-slate-900 hover:bg-black text-white px-16 py-5 rounded-[2rem] font-black text-xl cursor-pointer transition-all shadow-xl hover:scale-105 active:scale-95"
  }, "\u05D4\u05E2\u05DC\u05D0\u05EA \u05E7\u05D5\u05D1\u05E5 \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD", /*#__PURE__*/React.createElement("input", {
    type: "file",
    className: "hidden",
    accept: ".xlsx,.xls",
    onChange: onFile
  }))) : trips.length === 0 && !preReady ? /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col items-center justify-center py-40 text-center gap-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col items-center gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center"
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "loader",
    size: 28,
    cls: "text-white",
    animate: true
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-xl font-black text-slate-900"
  }, "\u05D8\u05D5\u05E2\u05DF \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD..."), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-500 text-sm font-bold mt-1"
  }, "\u05D9\u05E7\u05D7 \u05DB\u05DE\u05D4 \u05E9\u05E0\u05D9\u05D5\u05EA")))) : /*#__PURE__*/React.createElement("main", null, /*#__PURE__*/React.createElement("nav", {
    className: "flex bg-slate-200/50 backdrop-blur p-1.5 rounded-[2rem] mb-12 max-w-4xl mx-auto shadow-inner border border-slate-200 overflow-x-auto"
  }, ["redundant", "areas", "allTrips", "simulator", "deadhead", "about"].map(tabName => {
    const isSelected = tab === tabName;
    let colorClass = "text-slate-500";
    let iconName = "";
    let label = "";
    if (tabName === "redundant") {
      colorClass = isSelected ? "bg-white text-rose-600 shadow-md" : "text-slate-600 hover:text-slate-800";
      iconName = "trash";
      label = "קווים לא יעילים";
    }
    if (tabName === "deadhead") {
      colorClass = isSelected ? "bg-white text-orange-700 shadow-md" : "text-slate-600 hover:text-slate-800";
      iconName = "alert";
      label = "נסיעות תפעוליות";
    }
    if (tabName === "areas") {
      colorClass = isSelected ? "bg-white text-amber-700 shadow-md" : "text-slate-600 hover:text-slate-800";
      iconName = "chart";
      label = "ניתוח אזורי";
    }
    if (tabName === "allTrips") {
      colorClass = isSelected ? "bg-white text-indigo-600 shadow-md" : "text-slate-600 hover:text-slate-800";
      iconName = "list";
      label = "כל הנסיעות";
    }
    if (tabName === "simulator") {
      colorClass = isSelected ? "bg-white text-slate-900 shadow-md" : "text-slate-600 hover:text-slate-800";
      iconName = "zap";
      label = "אלגוריתם ייעול";
    }
    if (tabName === "about") {
      colorClass = isSelected ? "bg-white text-indigo-600 shadow-md" : "text-slate-600 hover:text-slate-800";
      iconName = "info";
      label = "על המערכת";
    }
    return /*#__PURE__*/React.createElement("button", {
      key: `nav-${tabName}`,
      onClick: () => {
        setTab(tabName);
      },
      className: `flex-1 min-w-[120px] py-3.5 rounded-[1.5rem] font-black text-sm transition-all flex items-center justify-center gap-2 ${colorClass}`
    }, /*#__PURE__*/React.createElement(Ic, {
      n: iconName,
      size: 16
    }), " ", label);
  })), tab === "redundant" && /*#__PURE__*/React.createElement("div", {
    className: "space-y-8 transition-opacity duration-300 opacity-100"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col xl:flex-row justify-between items-center gap-4"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    className: "text-2xl font-black text-slate-900"
  }, "\u05D4\u05E7\u05D5\u05D5\u05D9\u05DD \u05D4\u05DB\u05D9 \u05DC\u05D0 \u05D9\u05E2\u05D9\u05DC\u05D9\u05DD"), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-500 font-bold"
  }, "\u05D3\u05D9\u05E8\u05D5\u05D2 \u05D4\u05DE\u05E6\u05D9\u05D2 \u05D0\u05EA \u05D4\u05E7\u05D5\u05D5\u05D9\u05DD \u05D4\u05D7\u05DC\u05E9\u05D9\u05DD \u05D1\u05D9\u05D5\u05EA\u05E8 \u05D1\u05DE\u05E2\u05E8\u05DB\u05EA, \u05DC\u05E6\u05D5\u05E8\u05DA \u05D1\u05D7\u05D9\u05E0\u05D4 \u05D5\u05D9\u05D9\u05E2\u05D5\u05DC")), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col md:flex-row gap-3 relative w-full xl:w-auto"
  }, /*#__PURE__*/React.createElement("select", {
    "aria-label": "\u05E1\u05D9\u05E0\u05D5\u05DF \u05DC\u05E4\u05D9 \u05DE\u05D7\u05D5\u05D6",
    value: redundantSortBy,
    onChange: e => setRedundantSortBy(e.target.value),
    className: "bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 font-black outline-none focus:border-slate-900 text-right shadow-sm w-full md:w-56 appearance-none cursor-pointer"
  }, /*#__PURE__*/React.createElement("option", {
    value: "score"
  }, "\u05DE\u05D9\u05D5\u05DF: \u05DC\u05E4\u05D9 \u05D0\u05D9-\u05D9\u05E2\u05D9\u05DC\u05D5\u05EA"), /*#__PURE__*/React.createElement("option", {
    value: "wastedKm"
  }, "\u05DE\u05D9\u05D5\u05DF: \u05E7\"\u05DE \u05DE\u05D1\u05D5\u05D6\u05D1\u05D6 (\u05D2\u05D1\u05D5\u05D4 \u05DC\u05E0\u05DE\u05D5\u05DA)"), /*#__PURE__*/React.createElement("option", {
    value: "cost"
  }, "\u05DE\u05D9\u05D5\u05DF: \u05E2\u05DC\u05D5\u05EA \u05DC\u05E0\u05D5\u05E1\u05E2 (\u05D2\u05D1\u05D5\u05D4\u05D4 \u05DC\u05E0\u05DE\u05D5\u05DB\u05D4)"), /*#__PURE__*/React.createElement("option", {
    value: "count"
  }, "\u05DE\u05D9\u05D5\u05DF: \u05DB\u05DE\u05D5\u05EA \u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05D1\u05E9\u05D1\u05D5\u05E2")), /*#__PURE__*/React.createElement("select", {
    "aria-label": "\u05E1\u05D9\u05E0\u05D5\u05DF \u05DC\u05E4\u05D9 \u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4",
    value: filterDistrict,
    onChange: e => setFilterDistrict(e.target.value),
    className: "bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 font-black outline-none focus:border-slate-900 text-right shadow-sm w-full md:w-48 appearance-none cursor-pointer"
  }, /*#__PURE__*/React.createElement("option", {
    value: "all"
  }, "\u05DB\u05DC \u05D4\u05DE\u05D7\u05D5\u05D6\u05D5\u05EA"), allDistricts.map(d => /*#__PURE__*/React.createElement("option", {
    key: `dist-${d}`,
    value: d
  }, d))), /*#__PURE__*/React.createElement("select", {
    "aria-label": "\u05DE\u05D9\u05D5\u05DF \u05D4\u05E8\u05E9\u05D9\u05DE\u05D4",
    value: filterCategory,
    onChange: e => setFilterCategory(e.target.value),
    className: "bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 font-black outline-none focus:border-slate-900 text-right shadow-sm w-full md:w-56 appearance-none cursor-pointer"
  }, /*#__PURE__*/React.createElement("option", {
    value: "all"
  }, "\u05DB\u05DC \u05D4\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D5\u05EA"), CATEGORIES.map(c => /*#__PURE__*/React.createElement("option", {
    key: `cat-${c}`,
    value: c
  }, c))), /*#__PURE__*/React.createElement("div", {
    className: "flex relative w-full xl:w-64"
  }, /*#__PURE__*/React.createElement(SearchInput, {
    value: searchCity,
    onSubmit: setSearchCity,
    placeholder: "\u05D4\u05E7\u05DC\u05D3 \u05E2\u05D9\u05E8 \u05D5\u05DC\u05D7\u05E5 Enter...",
    className: "bg-slate-50 border-2 border-slate-200 rounded-2xl px-6 py-3 pl-12 font-black outline-none focus:border-slate-900 text-right shadow-sm w-full"
  })))), /*#__PURE__*/React.createElement(ScoreSettingsPanel, {
    title: "\u05DE\u05D4 \u05E0\u05D7\u05E9\u05D1 \u05E7\u05D5 \u05DC\u05D0 \u05D9\u05E2\u05D9\u05DC? \u05DB\u05D0\u05DF \u05E7\u05D5\u05D1\u05E2\u05D9\u05DD \u05D0\u05EA \u05D4\u05E0\u05D9\u05E7\u05D5\u05D3",
    accent: "rose",
    settings: pset,
    update: updPset,
    reset: resetPset,
    isDefault: psetDefault,
    intro: "\u05DC\u05DB\u05DC \u05D3\u05D1\u05E8 \u05E9\u05E0\u05DE\u05D3\u05D3 \u05D0\u05E4\u05E9\u05E8 \u05DC\u05E7\u05D1\u05D5\u05E2 \u05DB\u05DE\u05D4 \u05E0\u05E7\u05D5\u05D3\u05D5\u05EA \u05D0\u05D9-\u05D9\u05E2\u05D9\u05DC\u05D5\u05EA \u05D4\u05D5\u05D0 \u05E0\u05D5\u05EA\u05DF, \u05D5\u05DE\u05EA\u05D7\u05EA \u05DC\u05DB\u05DE\u05D4 \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05E7\u05D5 \u05E0\u05D7\u05E9\u05D1 \u05E8\u05D9\u05E7. \u05E9\u05D3\u05D4 \u05E1\u05E3 \u05E8\u05D9\u05E7 = \u05D4\u05E1\u05E3 \u05D4\u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9 \u05E9\u05DC \u05D4\u05D0\u05EA\u05E8 \u05DC\u05E4\u05D9 \u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D9\u05EA \u05D4\u05E7\u05D5. \u05D2\u05DD \u05D4\u05D4\u05D2\u05E0\u05D5\u05EA (\u05D4\u05E0\u05E7\u05D5\u05D3\u05D5\u05EA \u05E9\u05DE\u05D5\u05E4\u05D7\u05EA\u05D5\u05EA \u05DE\u05D4\u05E6\u05D9\u05D5\u05DF) \u05DC\u05D1\u05D7\u05D9\u05E8\u05EA\u05DB\u05DD. \u05D4\u05E8\u05E9\u05D9\u05DE\u05D4 \u05DE\u05EA\u05E2\u05D3\u05DB\u05E0\u05EA \u05DE\u05D9\u05D3.",
    rows: [{
      key: 'lowTrips',
      label: 'נסיעות שפל',
      hint: 'אחוז הנסיעות עם פחות נוסעים מסף הקטגוריה'
    }, {
      key: 'wastedKm',
      label: 'קילומטר מבוזבז',
      hint: 'חלק הק"מ בנסיעות ריקות, ועוד תוספת אם יש מעל 100 ק"מ סרק בשבוע'
    }, {
      key: 'cost',
      label: 'עלות תפעולית לנוסע',
      hint: 'ביחס לממוצע הקטגוריה — מדרגות מפי 1.3 ועד פי 6'
    }, {
      key: 'deadhead',
      label: 'נסיעה תפעולית במסווה',
      hint: 'כמה פעמים בשבוע נצפה רכב מגיע לקצה הקו וחוזר תוך 15 דקות (מהשידורים, 14 יום) — 7 ומעלה = מלוא הנקודות'
    }, {
      key: 'riders',
      label: 'ממוצע נוסעים ועומס שיא',
      hint: 'חצי מהנקודות על ממוצע נמוך, חצי על שיא נמוך',
      params: [{
        k: 'low',
        label: 'קו ריק = ממוצע מתחת ל-',
        auto: 'אוטו',
        unit: 'נוסעים',
        min: 1,
        max: 300,
        title: 'ברירת המחדל: 60% מסף הקטגוריה, לפי קיבולת הרכב'
      }, {
        k: 'peak',
        label: 'שיא נמוך = מתחת ל-',
        auto: '15',
        unit: 'נוסעים',
        min: 1,
        max: 300
      }]
    }],
    extras: /*#__PURE__*/React.createElement("div", {
      className: "space-y-3"
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[12px] font-black text-slate-900"
    }, "\u05D4\u05D2\u05E0\u05D5\u05EA \u2014 \u05E0\u05E7\u05D5\u05D3\u05D5\u05EA \u05E9\u05DE\u05D5\u05E4\u05D7\u05EA\u05D5\u05EA \u05DE\u05D4\u05E6\u05D9\u05D5\u05DF (0 = \u05D1\u05DC\u05D9 \u05D4\u05D2\u05E0\u05D4):"), /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap gap-x-5 gap-y-2 text-[12px] font-bold text-slate-700 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3"
    }, [['exclusive', 'תחנות ייחודיות'], ['train', 'מותאם רכבת'], ['school', 'תלמידים בשעות בי"ס'], ['prebook', 'הזמנה מראש (אילת)'], ['weekend', 'קו סופ"ש'], ['newLine', 'קו חדש בהרצה'], ['reduced', 'כבר צומצם'], ['noAlt', 'אין חפיפת תחנות משמעותית']].map(([k, lbl]) => /*#__PURE__*/React.createElement("label", {
      key: k,
      className: "inline-flex items-center gap-2"
    }, lbl, /*#__PURE__*/React.createElement(NumField, {
      value: pset.p[k],
      onChange: v => updPset(s => ({
        ...s,
        p: {
          ...s.p,
          [k]: v == null ? 0 : Math.max(0, Math.min(100, v))
        }
      })),
      min: 0,
      max: 100,
      width: "w-16",
      suffix: "\u05E0\u05E7\u05F3"
    })))), /*#__PURE__*/React.createElement("label", {
      className: "inline-flex items-center gap-2 text-[12px] font-bold text-slate-700 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3"
    }, "\u05E0\u05DB\u05E0\u05E1 \u05DC\u05E8\u05E9\u05D9\u05DE\u05D4 \u05DE\u05E6\u05D9\u05D5\u05DF \u05E9\u05DC \u05DC\u05E4\u05D7\u05D5\u05EA", /*#__PURE__*/React.createElement(NumField, {
      value: pset.minScore,
      onChange: v => updPset(s => ({
        ...s,
        minScore: v == null ? 0 : Math.max(0, Math.min(100, v))
      })),
      min: 0,
      max: 100,
      suffix: "\u05DE\u05EA\u05D5\u05DA 100"
    }))),
    footnote: "\u05D4\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05E0\u05E9\u05DE\u05E8\u05D5\u05EA \u05D1\u05D3\u05E4\u05D3\u05E4\u05DF \u05D4\u05D6\u05D4 \u05D1\u05DC\u05D1\u05D3. \u05EA\u05D5\u05D5\u05D9\u05D5\u05EA \u05D4\u05E1\u05D8\u05D8\u05D5\u05E1 (\u05D7\u05DE\u05D5\u05E8 / \u05DC\u05D0 \u05D9\u05E2\u05D9\u05DC / \u05D8\u05E2\u05D5\u05DF \u05D1\u05D3\u05D9\u05E7\u05D4) \u05D5\u05D4\u05E0\u05D9\u05EA\u05D5\u05D7 \u05D4\u05D0\u05D6\u05D5\u05E8\u05D9 (\u05E6\u05D9\u05D5\u05DF 80+) \u05E4\u05D5\u05E2\u05DC\u05D9\u05DD \u05E2\u05DC \u05D4\u05E6\u05D9\u05D5\u05DF \u05E9\u05E7\u05D1\u05E2\u05EA\u05DD."
  }), /*#__PURE__*/React.createElement("div", {
    className: "bg-white border-2 border-slate-100 rounded-[2rem] px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-[12px] font-bold text-slate-700"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-black text-slate-900 text-sm"
  }, "\uD83D\uDD0E \u05E1\u05D9\u05E0\u05D5\u05DF:"), /*#__PURE__*/React.createElement("label", {
    className: "inline-flex items-center gap-2"
  }, "\u05E6\u05D9\u05D5\u05DF \u05DE-", /*#__PURE__*/React.createElement(NumField, {
    value: pFilt.minScore,
    onChange: v => setPFilt(f => ({
      ...f,
      minScore: v
    })),
    min: 0,
    max: 100,
    width: "w-16"
  })), /*#__PURE__*/React.createElement("label", {
    className: "inline-flex items-center gap-2"
  }, "\u05E7\"\u05DE \u05DE\u05D1\u05D5\u05D6\u05D1\u05D6 \u05D1\u05E9\u05D1\u05D5\u05E2 \u05DE-", /*#__PURE__*/React.createElement(NumField, {
    value: pFilt.minWasted,
    onChange: v => setPFilt(f => ({
      ...f,
      minWasted: v
    })),
    min: 0,
    max: 99999,
    width: "w-20"
  })), /*#__PURE__*/React.createElement("label", {
    className: "inline-flex items-center gap-2"
  }, "\u05DE\u05DE\u05D5\u05E6\u05E2 \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05E2\u05D3", /*#__PURE__*/React.createElement(NumField, {
    value: pFilt.maxRiders,
    onChange: v => setPFilt(f => ({
      ...f,
      maxRiders: v
    })),
    min: 0,
    max: 500,
    width: "w-16"
  })), /*#__PURE__*/React.createElement("label", {
    className: "inline-flex items-center gap-2"
  }, "\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05D1\u05E9\u05D1\u05D5\u05E2 \u05DE-", /*#__PURE__*/React.createElement(NumField, {
    value: pFilt.minTrips,
    onChange: v => setPFilt(f => ({
      ...f,
      minTrips: v
    })),
    min: 0,
    max: 5000,
    width: "w-16"
  })), pFiltOn && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setPFilt({
      minScore: null,
      minWasted: null,
      maxRiders: null,
      minTrips: null
    }),
    className: "text-xs font-black text-rose-700 hover:text-rose-900 underline"
  }, "\u2715 \u05E0\u05E7\u05D4 \u05E1\u05D9\u05E0\u05D5\u05DF"), /*#__PURE__*/React.createElement("span", {
    className: "text-slate-500 mr-auto"
  }, filteredRedundant.length.toLocaleString(), " \u05E7\u05D5\u05D5\u05D9\u05DD")), focusMakat && /*#__PURE__*/React.createElement("div", {
    className: "mb-4 flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-sm font-black text-indigo-800"
  }, "\uD83D\uDD17 \u05DE\u05E6\u05D9\u05D2 \u05E7\u05D5 \u05DE\u05E9\u05D5\u05EA\u05E3 (\u05DE\u05E7\"\u05D8 ", focusMakat, ")"), /*#__PURE__*/React.createElement("button", {
    className: "text-xs font-black text-indigo-700 hover:text-indigo-900 underline",
    onClick: () => {
      setFocusMakat(null);
      try {
        window.location.hash = 'פח';
      } catch (e) {}
    }
  }, "\u2715 \u05D4\u05E6\u05D2 \u05D0\u05EA \u05DB\u05DC \u05D4\u05E7\u05D5\u05D5\u05D9\u05DD")), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
  }, filteredRedundant.length > 0 ? filteredRedundant.slice(0, visibleLineCount).map((res, i) => /*#__PURE__*/React.createElement("div", {
    key: `red-${res.groupKey}-${i}`,
    className: "vcard bg-white border-2 border-slate-100 rounded-[2.5rem] p-7 shadow-sm hover:border-slate-900 transition-all text-right flex flex-col group relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-start justify-between mb-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col gap-2 items-start text-right"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 flex-wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: `px-4 py-1.5 rounded-full text-[11px] font-black border ${res.statusTier.bg} ${res.statusTier.color}`
  }, res.status), /*#__PURE__*/React.createElement("div", {
    className: "px-3 py-1.5 rounded-full text-[11px] font-black bg-slate-100 text-slate-700 border border-slate-200"
  }, res.category), res.dhWeekly > 0 && /*#__PURE__*/React.createElement("span", {
    className: "px-3 py-1.5 rounded-full text-[11px] font-black bg-orange-100 text-orange-800 border border-orange-200",
    title: "\u05D4\u05DC\u05D5\u05DA-\u05D7\u05D6\u05D5\u05E8 \u05E9\u05DC \u05D0\u05D5\u05EA\u05D5 \u05E8\u05DB\u05D1 \u05EA\u05D5\u05DA 15 \u05D3\u05E7' \u2014 \u05DE\u05D4\u05E9\u05D9\u05D3\u05D5\u05E8\u05D9\u05DD"
  }, "\u05E0\u05E1\u05D9\u05E2\u05D4 \u05EA\u05E4\u05E2\u05D5\u05DC\u05D9\u05EA \xB7 ", res.dhWeekly.toFixed(1), " \u05D1\u05E9\u05D1\u05D5\u05E2"), res.isNightLine && /*#__PURE__*/React.createElement("span", {
    className: "text-indigo-400 bg-indigo-50 p-1 rounded-full",
    title: "\u05E7\u05D5 \u05DC\u05D9\u05DC\u05D4"
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "moon",
    size: 14
  })), renderPrebookedInfo('red-' + i, res.isEilatPrebooked), renderFeedingLineInfo('red-' + i, res.isFeedingLine), res.live && res.live.rm && /*#__PURE__*/React.createElement("span", {
    className: "px-3 py-1.5 rounded-full text-[11px] font-black bg-red-600 text-white border border-red-700",
    title: 'לפי ארכיון "הקו בזמן" — הקו כבר אינו קיים ברישום' + (res.live.rmd ? '. נעלם ב-' + String(res.live.rmd).split('-').reverse().join('.') : '')
  }, "\u2716 \u05D4\u05E7\u05D5 \u05DB\u05D1\u05E8 \u05D1\u05D5\u05D8\u05DC"), res.live && !res.live.rm && res.live.gap && /*#__PURE__*/React.createElement("span", {
    className: "px-3 py-1.5 rounded-full text-[11px] font-black bg-amber-100 text-amber-800 border border-amber-200",
    title: 'הקו הושבת בין ' + String(res.live.gap[0]).split('-').reverse().join('.') + ' ל-' + String(res.live.gap[1]).split('-').reverse().join('.') + ' וחזר — נתוני הנוסעים עשויים לשקף גם את תקופת ההשבתה'
  }, "\u23F8 \u05D4\u05D5\u05E9\u05D1\u05EA \u05D5\u05D7\u05D6\u05E8")), /*#__PURE__*/React.createElement("div", {
    className: "mt-1"
  }, /*#__PURE__*/React.createElement(RouteFormat, {
    val: res.makat
  }))), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col items-center gap-1 shrink-0"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-slate-900 text-white w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl shadow-lg"
  }, res.lineNum), /*#__PURE__*/React.createElement("button", {
    className: "text-[10px] font-black text-slate-500 hover:text-slate-900 transition-colors",
    title: "\u05D4\u05E2\u05EA\u05E7\u05EA \u05E7\u05D9\u05E9\u05D5\u05E8 \u05D9\u05E9\u05D9\u05E8 \u05DC\u05E7\u05D5 \u05D4\u05D6\u05D4",
    onClick: e => {
      const url = location.origin + location.pathname + '#פח/קו/' + String(res.makat || '').replace(/^0+/, '');
      try {
        navigator.clipboard.writeText(url);
      } catch (err) {/* ignore */}
      const b = e.currentTarget;
      const t = b.textContent;
      b.textContent = '✓ הועתק';
      setTimeout(() => {
        b.textContent = t;
      }, 1500);
    }
  }, "\uD83D\uDD17 \u05E9\u05D9\u05EA\u05D5\u05E3"))), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 mb-5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-start gap-3 mb-2 min-w-0"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-slate-900 font-black text-lg truncate leading-tight",
    title: res.origin
  }, res.origin), /*#__PURE__*/React.createElement("div", {
    className: "text-slate-300 text-2xl font-black shrink-0 leading-none"
  }, "\u2190"), /*#__PURE__*/React.createElement("div", {
    className: "text-slate-900 font-black text-lg truncate leading-tight",
    title: res.dest
  }, res.dest)), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap items-center gap-2 mb-4"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md shrink-0"
  }, res.district), (() => {
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
    return /*#__PURE__*/React.createElement("span", {
      className: "text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 whitespace-nowrap shrink-0"
    }, "\u05E2\u05D5\u05D1\u05E8 \u05D3\u05E8\u05DA: ", matchedCity);
  })()), /*#__PURE__*/React.createElement("div", {
    className: "text-xs font-bold text-slate-500 mb-4 flex items-center gap-2 flex-wrap"
  }, /*#__PURE__*/React.createElement("span", null, "\u05E6\u05D9\u05D5\u05DF \u05D0\u05D9-\u05D9\u05E2\u05D9\u05DC\u05D5\u05EA:"), /*#__PURE__*/React.createElement("span", {
    className: `font-black ${res.statusTier.color}`
  }, res.score, "/100"), res.totalDeduction > 0 && /*#__PURE__*/React.createElement("span", {
    className: "text-slate-500 font-bold"
  }, "(\u05D2\u05D5\u05DC\u05DE\u05D9 ", res.rawScore, ", \u05D4\u05D5\u05E4\u05D7\u05EA\u05D5 ", res.totalDeduction, " \u05D1\u05D2\u05D9\u05DF \u05D4\u05D2\u05E0\u05D5\u05EA)")), (() => {
    const ov = kavPachVisibleOverlaps(overlapMap && overlapMap[String(res.makat || '').replace(/^0+/, '').trim()]);
    if (!ov || !ov.length) return null;
    return /*#__PURE__*/React.createElement("div", {
      className: "mb-4 bg-sky-50 border border-sky-200 rounded-2xl px-3 py-2"
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-[10px] font-black text-sky-700 mb-1"
    }, "\uD83D\uDD00 \u05D7\u05E4\u05D9\u05E4\u05EA \u05DE\u05E1\u05DC\u05D5\u05DC"), /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap gap-1.5"
    }, ov.map(([mk2, num2, long2, pct, shared, shape]) => /*#__PURE__*/React.createElement("details", {
      key: mk2,
      className: "text-[10px] font-black bg-white border border-sky-200 text-sky-800 rounded-2xl",
      style: {
        maxWidth: '100%'
      }
    }, /*#__PURE__*/React.createElement("summary", {
      className: "cursor-pointer flex items-center gap-1 list-none",
      style: {
        listStyle: 'none',
        padding: '6px 10px',
        minHeight: 24
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "font-black"
    }, "\u05E7\u05D5 ", num2, " \xB7 ", ((pct + shape.selfPct) / 2).toLocaleString('he-IL', {
      maximumFractionDigits: 1
    }), "%"), /*#__PURE__*/React.createElement("span", {
      "aria-label": `הסבר חפיפה עם קו ${num2}`,
      title: "\u05D0\u05D9\u05DA \u05DE\u05D7\u05D5\u05E9\u05D1\u05EA \u05D4\u05D7\u05E4\u05D9\u05E4\u05D4?",
      className: "inline-flex items-center justify-center rounded-full border border-sky-300 font-black",
      style: {
        width: 14,
        height: 14,
        fontSize: 10
      }
    }, "?")), /*#__PURE__*/React.createElement("div", {
      className: "border-t border-sky-100 leading-relaxed",
      style: {
        padding: 10,
        maxWidth: 380,
        fontSize: 12
      }
    }, /*#__PURE__*/React.createElement("div", null, shared, " \u05EA\u05D7\u05E0\u05D5\u05EA \u05DE\u05E9\u05D5\u05EA\u05E4\u05D5\u05EA \xB7 ", pct, "% \u05D1\u05DE\u05D3\u05D3 \u05D4\u05EA\u05D7\u05E0\u05D5\u05EA."), /*#__PURE__*/React.createElement("div", null, shape.selfPct, "% \u05DE\u05EA\u05D5\u05D5\u05D0\u05D9 \u05E7\u05D5 ", res.lineNum, " \u05DE\u05E9\u05D5\u05EA\u05E3 \u05DC\u05E7\u05D5 ", num2, ", \u05D1\u05D0\u05D5\u05EA\u05D5 \u05DB\u05D9\u05D5\u05D5\u05DF \u05E0\u05E1\u05D9\u05E2\u05D4."), /*#__PURE__*/React.createElement("div", {
      className: "mt-2"
    }, "\u05D0\u05D7\u05D5\u05D6 \u05D4\u05D7\u05E4\u05D9\u05E4\u05D4 \u05D4\u05D5\u05D0 \u05DE\u05DE\u05D5\u05E6\u05E2 \u05E9\u05DC \u05E9\u05E0\u05D9 \u05D4\u05DE\u05D3\u05D3\u05D9\u05DD \u05D1\u05DE\u05E9\u05E7\u05DC \u05E9\u05D5\u05D5\u05D4. \u05DE\u05D5\u05E6\u05D2\u05D9\u05DD \u05E8\u05E7 \u05E7\u05D5\u05D5\u05D9\u05DD \u05E2\u05DD 50% \u05D5\u05DE\u05E2\u05DC\u05D4. \u05DB\u05E9\u05D7\u05E1\u05E8 \u05DE\u05D3\u05D3, \u05D4\u05E7\u05D5 \u05D0\u05D9\u05E0\u05D5 \u05DE\u05D5\u05E6\u05D2 \u05D1\u05E8\u05E9\u05D9\u05DE\u05D4."), /*#__PURE__*/React.createElement("div", {
      className: "mt-2"
    }, "\u05EA\u05D5\u05D5\u05D0\u05D9 \u05DE\u05E9\u05D5\u05EA\u05E3 \u05D1\u05D0\u05D5\u05DE\u05D3\u05DF: ", shape.sharedKm.toLocaleString('he-IL', {
      maximumFractionDigits: 2
    }), " \u05E7\u05F4\u05DE \xB7 \u05D4\u05DE\u05E7\u05D8\u05E2 \u05D4\u05E8\u05E6\u05D9\u05E3 \u05D4\u05D0\u05E8\u05D5\u05DA \u05D1\u05D9\u05D5\u05EA\u05E8: ", shape.longestKm.toLocaleString('he-IL', {
      maximumFractionDigits: 2
    }), " \u05E7\u05F4\u05DE."), /*#__PURE__*/React.createElement("div", {
      className: "mt-2"
    }, "\u05D4\u05DE\u05E1\u05DC\u05D5\u05DC\u05D9\u05DD \u05E9\u05E0\u05D1\u05D3\u05E7\u05D5:"), /*#__PURE__*/React.createElement("div", null, "\u05E7\u05D5 ", res.lineNum, ": ", shape.selfRouteName, " \xB7 ", shape.selfKm, " \u05E7\u05F4\u05DE."), /*#__PURE__*/React.createElement("div", null, "\u05E7\u05D5 ", num2, ": ", shape.otherRouteName || long2, " \xB7 ", shape.otherKm, " \u05E7\u05F4\u05DE \xB7 \u05DE\u05E7\u05F4\u05D8 ", mk2, "."), /*#__PURE__*/React.createElement("div", {
      className: "mt-2"
    }, "\u05DE\u05D3\u05D3 \u05D4\u05EA\u05D7\u05E0\u05D5\u05EA \u05DE\u05D7\u05D5\u05E9\u05D1 \u05D1\u05D9\u05D7\u05E1 \u05DC\u05DE\u05E1\u05DC\u05D5\u05DC \u05E9\u05D1\u05D5 \u05E4\u05D7\u05D5\u05EA \u05EA\u05D7\u05E0\u05D5\u05EA. \u05D4\u05EA\u05D5\u05D5\u05D0\u05D9 \u05E0\u05D1\u05D3\u05E7 \u05DC\u05E4\u05D9 \u05E7\u05E8\u05D1\u05D4 \u05D5\u05DB\u05D9\u05D5\u05D5\u05DF \u05D1\u05E0\u05EA\u05D5\u05E0\u05D9 GTFS \u05D5\u05E2\u05DC\u05D5\u05DC \u05DC\u05D4\u05D9\u05D5\u05EA \u05DE\u05D5\u05E9\u05E4\u05E2 \u05DE\u05D0\u05D9\u05BE\u05D3\u05D9\u05D5\u05E7 \u05D1\u05E0\u05EA\u05D5\u05E0\u05D9\u05DD. \u05DC\u05D0 \u05E0\u05D1\u05D3\u05E7\u05D5 \u05D9\u05DE\u05D9 \u05D5\u05E9\u05E2\u05D5\u05EA \u05D4\u05E4\u05E2\u05D9\u05DC\u05D5\u05EA \u05D0\u05D5 \u05DE\u05D2\u05D1\u05DC\u05D5\u05EA \u05D0\u05D9\u05E1\u05D5\u05E3 \u05D5\u05D4\u05D5\u05E8\u05D3\u05D4."), /*#__PURE__*/React.createElement("div", {
      className: "mt-2"
    }, "\u05D4\u05D7\u05E4\u05D9\u05E4\u05D4 \u05D0\u05D9\u05E0\u05D4 \u05DE\u05D5\u05DB\u05D9\u05D7\u05D4 \u05E9\u05D4\u05E7\u05D5 \u05D4\u05D5\u05D0 \u05D7\u05DC\u05D5\u05E4\u05D4 \u05DE\u05DC\u05D0\u05D4, \u05D5\u05D0\u05D9\u05E0\u05D4 \u05D4\u05DE\u05DC\u05E6\u05D4 \u05DC\u05D1\u05D9\u05D8\u05D5\u05DC \u05D0\u05D5 \u05DC\u05D0\u05D9\u05D7\u05D5\u05D3 \u05E7\u05D5\u05D5\u05D9\u05DD. \u05D4\u05D7\u05D9\u05E9\u05D5\u05D1 \u05E0\u05E4\u05E8\u05D3 \u05DE\u05E6\u05D9\u05D5\u05DF \u05D0\u05D9\u05BE\u05D4\u05D9\u05E2\u05D9\u05DC\u05D5\u05EA."))))));
  })(), res.protections.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "mb-4 bg-emerald-50 border border-emerald-200 rounded-2xl px-3 py-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-[10px] font-black text-emerald-700 mb-1"
  }, "\u05D4\u05D2\u05E0\u05D5\u05EA \u05E4\u05E2\u05D9\u05DC\u05D5\u05EA"), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-1.5"
  }, res.protections.map((p, k) => /*#__PURE__*/React.createElement("span", {
    key: `prot-${i}-${k}`,
    className: "bg-white border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-bold",
    title: p.detail
  }, p.name, " \u2212", p.value)))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2.5 pt-4 border-t border-slate-100"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between text-sm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-700 font-bold"
  }, "\u05DE\u05DE\u05D5\u05E6\u05E2 \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05DC\u05E0\u05E1\u05D9\u05E2\u05D4"), /*#__PURE__*/React.createElement("span", {
    className: "font-black text-slate-900"
  }, res.avg)), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between text-sm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-700 font-bold"
  }, "\u05E2\u05D5\u05DE\u05E1 \u05E9\u05D9\u05D0 \u05DE\u05DE\u05D5\u05E6\u05E2"), /*#__PURE__*/React.createElement("span", {
    className: "font-black text-slate-900"
  }, res.avgPeak)), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between text-sm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-700 font-bold"
  }, "\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05D1\u05E9\u05D1\u05D5\u05E2"), /*#__PURE__*/React.createElement("span", {
    className: "text-right"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-black text-slate-900"
  }, res.count), res.live && !res.live.rm && res.live.ntr > 0 && /*#__PURE__*/React.createElement("div", {
    className: "text-[10px] font-bold text-slate-500",
    title: "\u05DE\u05E1\u05E4\u05E8 \u05D4\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05D1\u05E4\u05D9\u05D3 \u05D4\u05E2\u05D3\u05DB\u05E0\u05D9, \u05DE\u05D0\u05E8\u05DB\u05D9\u05D5\u05DF \"\u05D4\u05E7\u05D5 \u05D1\u05D6\u05DE\u05DF\" \u2014 \u05E0\u05EA\u05D5\u05E0\u05D9 \u05D4\u05DB\u05E8\u05D8\u05D9\u05E1 \u05D4\u05DD \u05E6\u05D9\u05DC\u05D5\u05DD \u05DE\u05D9\u05D5\u05E0\u05D9 2026"
  }, "\u05D4\u05D9\u05D5\u05DD \u05D1\u05E4\u05D9\u05D3: ", res.live.ntr.toLocaleString(), " \u05D1\u05D9\u05D5\u05DD"))), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between text-sm gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-700 font-bold"
  }, "\u05E2\u05DC\u05D5\u05EA \u05EA\u05E4\u05E2\u05D5\u05DC\u05D9\u05EA \u05DC\u05E0\u05D5\u05E1\u05E2"), /*#__PURE__*/React.createElement("span", {
    className: "text-right"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-black text-slate-900"
  }, res.cost > 0 ? `₪${res.cost.toFixed(2)}` : 'לא זמין'), res.cost > 0 && res.costBenchmark > 0 && /*#__PURE__*/React.createElement("div", {
    className: "text-[10px] font-bold text-slate-500"
  }, "\u05DE\u05DE\u05D5\u05E6\u05E2 ", res.category, ": \u20AA", res.costBenchmark, res.costRatio > 1 && /*#__PURE__*/React.createElement("span", {
    className: "text-rose-700 mr-1"
  }, "(\xD7", res.costRatio.toFixed(2), ")")))), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between text-sm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-700 font-bold"
  }, "\u05E7\"\u05DE \u05DC\u05D0 \u05DE\u05D1\u05D5\u05D6\u05D1\u05D6 (\u05E9\u05D9\u05DE\u05D5\u05E9\u05D9)"), /*#__PURE__*/React.createElement("span", {
    className: "font-black text-emerald-700"
  }, res.nonWastedKm.toLocaleString(), " \u05E7\"\u05DE")), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between text-sm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-600 font-bold"
  }, "\u05E7\"\u05DE \u05DE\u05D1\u05D5\u05D6\u05D1\u05D6 (\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05E1\u05E8\u05E7)"), /*#__PURE__*/React.createElement("span", {
    className: "font-black text-rose-600"
  }, res.wastedKm.toLocaleString(), " \u05E7\"\u05DE")), res.annualExcess > 0 && !(res.live && res.live.rm) && /*#__PURE__*/React.createElement("div", {
    className: "text-sm bg-rose-50 rounded-xl px-3 py-2 border border-rose-100"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-rose-700 font-bold flex items-center"
  }, "\u05E2\u05DC\u05D5\u05EA \u05E2\u05D5\u05D3\u05E4\u05EA \u05D1\u05D0\u05D5\u05DE\u05D3\u05DF", /*#__PURE__*/React.createElement("button", {
    onClick: e => {
      e.stopPropagation();
      setActiveExplainId(activeExplainId === 'exc-' + i ? null : 'exc-' + i);
    },
    className: "w-5 h-5 rounded-full bg-rose-100 text-rose-700 font-bold text-sm flex items-center justify-center border border-rose-300 hover:bg-rose-200 transition-colors mx-1 outline-none relative z-10",
    title: "\u05D0\u05D9\u05DA \u05D7\u05D5\u05E9\u05D1 \u05D4\u05D0\u05D5\u05DE\u05D3\u05DF?"
  }, "?")), /*#__PURE__*/React.createElement("span", {
    className: "font-black text-rose-700"
  }, "~", fmtShekels(res.annualExcess), " \u05D1\u05E9\u05E0\u05D4")), activeExplainId === 'exc-' + i && /*#__PURE__*/React.createElement("div", {
    ref: explainRef,
    className: "mt-2 p-3 sm:p-4 bg-white text-slate-800 text-xs sm:text-sm rounded-xl shadow-lg leading-relaxed font-normal text-right border border-slate-200 relative"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: e => {
      e.stopPropagation();
      setActiveExplainId(null);
    },
    "aria-label": "\u05E1\u05D2\u05D9\u05E8\u05EA \u05D4\u05D4\u05E1\u05D1\u05E8",
    className: "absolute top-2 left-2 w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 font-black text-base leading-none transition-colors"
  }, "\xD7"), /*#__PURE__*/React.createElement("strong", {
    className: "block mb-2 text-slate-900 text-base"
  }, "\u05D0\u05D9\u05DA \u05DE\u05D7\u05D5\u05E9\u05D1\u05EA \u05D4\u05E2\u05DC\u05D5\u05EA \u05D4\u05E2\u05D5\u05D3\u05E4\u05EA?"), "\u05DB\u05DE\u05D4 \u05E2\u05D5\u05DC\u05D4 \u05DC\u05D4\u05E1\u05D9\u05E2 \u05E0\u05D5\u05E1\u05E2 \u05D1\u05E7\u05D5 \u05D4\u05D6\u05D4, \u05DC\u05E2\u05D5\u05DE\u05EA \u05DB\u05DE\u05D4 \u05D6\u05D4 \u05E2\u05D5\u05DC\u05D4 \u05D1\u05E7\u05D5 \u05DE\u05DE\u05D5\u05E6\u05E2 \u05DE\u05D0\u05D5\u05EA\u05D5 \u05E1\u05D5\u05D2 \u2014 \u05DB\u05E4\u05D5\u05DC \u05DB\u05DC \u05D4\u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05D1\u05E9\u05E0\u05D4.", /*#__PURE__*/React.createElement("div", {
    className: "my-2 bg-slate-50 rounded-lg p-2 font-bold text-slate-700",
    style: {
      direction: 'rtl'
    }
  }, "(\u20AA", res.cost.toFixed(2), " \u05DC\u05E0\u05D5\u05E1\u05E2 \u05D1\u05E7\u05D5 \u05D4\u05D6\u05D4 \u2212 \u20AA", Number(res.costBenchmark).toFixed(2), " \u05DE\u05DE\u05D5\u05E6\u05E2 ", res.category, ")", /*#__PURE__*/React.createElement("br", null), "\xD7 ", res.avg, " \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05D1\u05E0\u05E1\u05D9\u05E2\u05D4 \xD7 ", res.count, " \u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05D1\u05E9\u05D1\u05D5\u05E2 \xD7 52 \u05E9\u05D1\u05D5\u05E2\u05D5\u05EA", /*#__PURE__*/React.createElement("br", null), "= ~", fmtShekels(res.annualExcess), " \u05D1\u05E9\u05E0\u05D4"), /*#__PURE__*/React.createElement("span", {
    className: "text-slate-500"
  }, "\u05D6\u05D4\u05D5 \u05D0\u05D5\u05DE\u05D3\u05DF \u05DC\u05D4\u05DE\u05D7\u05E9\u05D4, \u05DC\u05D0 \u05E0\u05EA\u05D5\u05DF \u05EA\u05E7\u05E6\u05D9\u05D1\u05D9 \u05E8\u05E9\u05DE\u05D9: \u05D4\u05E2\u05DC\u05D5\u05EA \u05DC\u05E0\u05D5\u05E1\u05E2 \u05DE\u05D2\u05D9\u05E2\u05D4 \u05DE\u05D3\u05D5\u05D7 \u05DE\u05E9\u05E8\u05D3 \u05D4\u05EA\u05D7\u05D1\u05D5\u05E8\u05D4 (\u05D9\u05D5\u05E0\u05D9 2026), \u05D5\u05D4\u05D7\u05D9\u05E9\u05D5\u05D1 \u05DE\u05E0\u05D9\u05D7 \u05E9\u05D4\u05D9\u05D0 \u05D0\u05D7\u05D9\u05D3\u05D4 \u05E2\u05DC \u05E4\u05E0\u05D9 \u05D4\u05E9\u05E0\u05D4. \u05D4\u05DE\u05E1\u05E4\u05E8 \u05E2\u05D5\u05E0\u05D4 \u05E2\u05DC \u05E9\u05D0\u05DC\u05D4 \u05D0\u05D7\u05EA \u2014 \u05D1\u05DB\u05DE\u05D4 \u05D4\u05E7\u05D5 \u05D4\u05D6\u05D4 \u05D9\u05E7\u05E8 \u05D9\u05D5\u05EA\u05E8 \u05DE\u05E7\u05D5 \u05E8\u05D2\u05D9\u05DC \u05DE\u05E1\u05D5\u05D2\u05D5."))))), res.live && res.live.rm ? /*#__PURE__*/React.createElement("div", {
    className: "w-full py-4 bg-slate-100 text-slate-500 rounded-2xl text-xs font-black text-center"
  }, "\u05D4\u05E7\u05D5 \u05DB\u05D1\u05E8 \u05D1\u05D5\u05D8\u05DC \u2014 \u05D4\u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05E0\u05E9\u05DE\u05E8\u05D9\u05DD \u05DC\u05EA\u05D9\u05E2\u05D5\u05D3 \u05D1\u05DC\u05D1\u05D3") : /*#__PURE__*/React.createElement("button", {
    onClick: () => handleOptimizeLineForm(res.lineNum, res.origin),
    className: "w-full py-4 bg-slate-900 text-white rounded-2xl text-xs font-black hover:bg-black transition-all shadow-md"
  }, "\u05D7\u05E4\u05E9 \u05D4\u05D6\u05D3\u05DE\u05E0\u05D5\u05D9\u05D5\u05EA \u05D4\u05EA\u05D9\u05D9\u05E2\u05DC\u05D5\u05EA"))) : (
  /* קישור משותף לקו שירד מהרשימה בעדכון הלילי: במקום מסך
     ריק — הסבר קצר וכפתור ניקוי */
  focusMakat && trips.some(t => String(t.makat || '').replace(/^0+/, '').trim() === String(focusMakat).replace(/^0+/, '').trim()) ? /*#__PURE__*/React.createElement("div", {
    className: "col-span-full bg-white border-2 border-sky-200 rounded-[2rem] p-8 text-right shadow-sm"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3 mb-3 flex-wrap"
  }, /*#__PURE__*/React.createElement("span", {
    className: "bg-sky-50 text-sky-700 border border-sky-200 rounded-full px-4 py-1.5 text-[11px] font-black"
  }, "\u05D9\u05E8\u05D3 \u05DE\u05D4\u05E8\u05E9\u05D9\u05DE\u05D4 \u05D1\u05E2\u05D3\u05DB\u05D5\u05DF \u05D4\u05D0\u05D7\u05E8\u05D5\u05DF"), /*#__PURE__*/React.createElement("span", {
    className: "font-black text-slate-900 text-lg"
  }, "\u05DE\u05E7\"\u05D8 ", focusMakat)), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-600 font-bold text-sm leading-relaxed"
  }, "\u05D4\u05E7\u05D5 \u05E7\u05D9\u05D9\u05DD \u05D1\u05DE\u05E2\u05E8\u05DB\u05EA, \u05D0\u05D1\u05DC \u05D0\u05D7\u05E8\u05D9 \u05E2\u05D3\u05DB\u05D5\u05DF \u05D4\u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05D4\u05D0\u05D7\u05E8\u05D5\u05DF \u05D4\u05E6\u05D9\u05D5\u05DF \u05E9\u05DC\u05D5 \u05DB\u05D1\u05E8 \u05DC\u05D0 \u05E2\u05D5\u05D1\u05E8 \u05D0\u05EA \u05E1\u05E3 \u05D4\u05EA\u05E6\u05D5\u05D2\u05D4 \u2014 \u05DB\u05DC\u05D5\u05DE\u05E8 \u05D4\u05D5\u05D0 \u05DB\u05D1\u05E8 \u05DC\u05D0 \u05E0\u05E8\u05D0\u05D4 \"\u05D7\u05E9\u05D5\u05D3 \u05DB\u05DE\u05D9\u05D5\u05EA\u05E8\". \u05D6\u05D4 \u05D3\u05D5\u05D5\u05E7\u05D0 \u05E1\u05D9\u05DE\u05DF \u05D8\u05D5\u05D1."), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setFocusMakat(null);
      try {
        window.location.hash = 'פח';
      } catch (e) {}
    },
    className: "mt-4 bg-slate-900 hover:bg-black text-white px-6 py-3 rounded-2xl text-xs font-black transition-colors"
  }, "\u2715 \u05E0\u05E7\u05D4 \u05D0\u05EA \u05D4\u05E1\u05D9\u05E0\u05D5\u05DF \u05D5\u05D7\u05D6\u05D5\u05E8 \u05DC\u05E8\u05E9\u05D9\u05DE\u05D4")) : /*#__PURE__*/React.createElement("div", {
    className: "col-span-full text-center py-20 text-slate-500 font-bold"
  }, "\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D5 \u05E7\u05D5\u05D5\u05D9\u05DD \u05DC\u05E1\u05D9\u05E0\u05D5\u05DF \u05D4\u05DE\u05D1\u05D5\u05E7\u05E9."))), filteredRedundant.length > visibleLineCount && /*#__PURE__*/React.createElement("div", {
    className: "text-center pt-6"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setVisibleLineCount(n => n + 30),
    className: "bg-slate-900 text-white font-black px-6 py-3 rounded-2xl"
  }, "\u05D4\u05E6\u05D2 \u05E2\u05D5\u05D3 \u05E7\u05D5\u05D5\u05D9\u05DD (", visibleLineCount, " \u05DE\u05EA\u05D5\u05DA ", filteredRedundant.length.toLocaleString(), ")"))), tab === "areas" && /*#__PURE__*/React.createElement("div", {
    className: "space-y-8 transition-opacity duration-300 opacity-100"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col xl:flex-row justify-between items-center gap-4"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    className: "text-2xl font-black text-slate-900"
  }, "\u05D4\u05D0\u05D6\u05D5\u05E8\u05D9\u05DD \u05D4\u05DB\u05D9 \u05DC\u05D0 \u05D9\u05E2\u05D9\u05DC\u05D9\u05DD"), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-500 font-bold"
  }, "\u05E8\u05D9\u05DB\u05D5\u05D6 \u05E9\u05DC \u05D4\u05E7\u05D5\u05D5\u05D9\u05DD \u05D4\u05DE\u05D9\u05D5\u05EA\u05E8\u05D9\u05DD \u05DC\u05D7\u05DC\u05D5\u05D8\u05D9\u05DF \u05D5\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05D4\u05E1\u05E8\u05E7 \u05DC\u05E4\u05D9 \u05E2\u05E8\u05D9\u05DD \u05D0\u05D5 \u05DE\u05D7\u05D5\u05D6\u05D5\u05EA")), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col md:flex-row gap-3 relative w-full xl:w-auto"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex bg-slate-100 p-1 rounded-2xl shadow-inner"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setAreaViewMode('city'),
    className: `px-6 py-2.5 rounded-xl font-black text-sm transition-all ${areaViewMode === 'city' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600 hover:text-slate-800'}`
  }, "\u05DC\u05E4\u05D9 \u05E2\u05D9\u05E8"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setAreaViewMode('district'),
    className: `px-6 py-2.5 rounded-xl font-black text-sm transition-all ${areaViewMode === 'district' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600 hover:text-slate-800'}`
  }, "\u05DC\u05E4\u05D9 \u05DE\u05D7\u05D5\u05D6")), /*#__PURE__*/React.createElement("select", {
    "aria-label": "\u05EA\u05E6\u05D5\u05D2\u05EA \u05D4\u05E0\u05D9\u05EA\u05D5\u05D7 \u05D4\u05D0\u05D6\u05D5\u05E8\u05D9",
    value: areaSortBy,
    onChange: e => setAreaSortBy(e.target.value),
    className: "bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 font-black outline-none focus:border-slate-900 text-right shadow-sm w-full md:w-48 appearance-none cursor-pointer"
  }, /*#__PURE__*/React.createElement("option", {
    value: "wastedKm"
  }, "\u05DE\u05D9\u05D5\u05DF: \u05E7\"\u05DE \u05DE\u05D1\u05D5\u05D6\u05D1\u05D6 (\u05DE\u05D5\u05DE\u05DC\u05E5)"), /*#__PURE__*/React.createElement("option", {
    value: "score"
  }, "\u05DE\u05D9\u05D5\u05DF: \u05DE\u05D3\u05D3 \u05D7\u05D5\u05DE\u05E8\u05D4 \u05D0\u05D6\u05D5\u05E8\u05D9"), /*#__PURE__*/React.createElement("option", {
    value: "lineCount"
  }, "\u05DE\u05D9\u05D5\u05DF: \u05DB\u05DE\u05D5\u05EA \u05E7\u05D5\u05D5\u05D9\u05DD \u05DE\u05D9\u05D5\u05EA\u05E8\u05D9\u05DD"), /*#__PURE__*/React.createElement("option", {
    value: "avgRiders"
  }, "\u05DE\u05D9\u05D5\u05DF: \u05DE\u05DE\u05D5\u05E6\u05E2 \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD (\u05E0\u05DE\u05D5\u05DA \u05DC\u05D2\u05D1\u05D5\u05D4)")))), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
  }, areaStats.map((area, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "bg-white border-2 border-slate-100 rounded-[2.5rem] p-7 shadow-sm hover:border-amber-400 transition-all text-right flex flex-col group relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-start mb-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: `px-4 py-1.5 rounded-full text-[11px] font-black border ${area.avgScore >= 80 ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-amber-50 border-amber-200 text-amber-700'}`
  }, "\u05DE\u05D3\u05D3 \u05D7\u05D5\u05DE\u05E8\u05D4: ", area.avgScore), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: e => {
      e.stopPropagation();
      exportAreaToExcel(area.name, areaViewMode);
    },
    className: "bg-emerald-100 hover:bg-emerald-200 text-emerald-700 w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm transition-all",
    title: "\u05D9\u05D9\u05E6\u05D5\u05D0 \u05E0\u05EA\u05D5\u05E0\u05D9 \u05D4\u05D0\u05D6\u05D5\u05E8 \u05DC\u05D0\u05E7\u05E1\u05DC"
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "download",
    size: 20
  })))), /*#__PURE__*/React.createElement("h3", {
    className: "text-2xl font-black text-slate-900 mb-4"
  }, area.name), /*#__PURE__*/React.createElement("div", {
    className: "space-y-3 pt-4 border-t border-slate-100 text-sm mb-5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-600 font-bold"
  }, "\u05E7\u05D5\u05D5\u05D9\u05DD \u05DE\u05D9\u05D5\u05EA\u05E8\u05D9\u05DD \u05D1\u05D0\u05D6\u05D5\u05E8"), /*#__PURE__*/React.createElement("span", {
    className: "font-black text-slate-900"
  }, area.lineCount, " \u05E7\u05D5\u05D5\u05D9\u05DD")), /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-600 font-bold"
  }, "\u05E1\u05D4\"\u05DB \u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05D1\u05E9\u05D1\u05D5\u05E2"), /*#__PURE__*/React.createElement("span", {
    className: "font-black text-slate-900"
  }, area.totalTrips.toLocaleString())), /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-600 font-bold"
  }, "\u05DE\u05DE\u05D5\u05E6\u05E2 \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05D1\u05E0\u05E1\u05D9\u05E2\u05D4"), /*#__PURE__*/React.createElement("span", {
    className: "font-black text-slate-900"
  }, area.avgAreaRiders)), /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-600 font-bold"
  }, "\u05E7\"\u05DE \u05DE\u05D1\u05D5\u05D6\u05D1\u05D6 (\u05E1\u05D4\"\u05DB)"), /*#__PURE__*/React.createElement("span", {
    className: "font-black text-rose-600"
  }, area.wastedKm.toLocaleString(), " \u05E7\"\u05DE")), /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-600 font-bold"
  }, "\u05E2\u05DC\u05D5\u05EA \u05EA\u05E4\u05E2\u05D5\u05DC\u05D9\u05EA \u05DE\u05DE\u05D5\u05E6\u05E2\u05EA"), /*#__PURE__*/React.createElement("span", {
    className: "font-black text-slate-900"
  }, area.avgCost > 0 ? `₪${area.avgCost.toFixed(2)}` : 'לא זמין')), area.annualExcess > 0 && /*#__PURE__*/React.createElement("div", {
    className: "bg-rose-50 rounded-xl px-3 py-2 border border-rose-100"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-rose-700 font-bold flex items-center"
  }, "\u05E2\u05DC\u05D5\u05EA \u05E2\u05D5\u05D3\u05E4\u05EA \u05D1\u05D0\u05D5\u05DE\u05D3\u05DF", /*#__PURE__*/React.createElement("button", {
    onClick: e => {
      e.stopPropagation();
      setActiveExplainId(activeExplainId === 'aexc-' + i ? null : 'aexc-' + i);
    },
    className: "w-5 h-5 rounded-full bg-rose-100 text-rose-700 font-bold text-sm flex items-center justify-center border border-rose-300 hover:bg-rose-200 transition-colors mx-1 outline-none relative z-10",
    title: "\u05D0\u05D9\u05DA \u05D7\u05D5\u05E9\u05D1 \u05D4\u05D0\u05D5\u05DE\u05D3\u05DF?"
  }, "?")), /*#__PURE__*/React.createElement("span", {
    className: "font-black text-rose-700"
  }, "~", fmtShekels(area.annualExcess), " \u05D1\u05E9\u05E0\u05D4")), activeExplainId === 'aexc-' + i && /*#__PURE__*/React.createElement("div", {
    ref: explainRef,
    className: "mt-2 p-3 bg-white text-slate-800 text-xs sm:text-sm rounded-xl shadow-lg leading-relaxed font-normal text-right border border-slate-200 relative"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: e => {
      e.stopPropagation();
      setActiveExplainId(null);
    },
    "aria-label": "\u05E1\u05D2\u05D9\u05E8\u05EA \u05D4\u05D4\u05E1\u05D1\u05E8",
    className: "absolute top-2 left-2 w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 font-black text-base leading-none transition-colors"
  }, "\xD7"), /*#__PURE__*/React.createElement("strong", {
    className: "block mb-1 text-slate-900"
  }, "\u05D0\u05D9\u05DA \u05DE\u05D7\u05D5\u05E9\u05D1 \u05D4\u05E1\u05DB\u05D5\u05DD \u05D4\u05D0\u05D6\u05D5\u05E8\u05D9?"), "\u05D7\u05D9\u05D1\u05D5\u05E8 \u05E9\u05DC \u05D0\u05D5\u05DE\u05D3\u05E0\u05D9 \u05D4\u05E2\u05DC\u05D5\u05EA \u05D4\u05E2\u05D5\u05D3\u05E4\u05EA \u05E9\u05DC ", area.lineCount, " \u05D4\u05E7\u05D5\u05D5\u05D9\u05DD \u05D4\u05D7\u05DE\u05D5\u05E8\u05D9\u05DD (\u05E6\u05D9\u05D5\u05DF 80+) \u05D1\u05D0\u05D6\u05D5\u05E8. \u05D4\u05D0\u05D5\u05DE\u05D3\u05DF \u05DC\u05DB\u05DC \u05E7\u05D5: (\u05E2\u05DC\u05D5\u05EA \u05DC\u05E0\u05D5\u05E1\u05E2 \u2212 \u05DE\u05DE\u05D5\u05E6\u05E2 \u05D4\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4) \xD7 \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \xD7 \u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05E9\u05D1\u05D5\u05E2\u05D9\u05D5\u05EA \xD7 52 \u2014 \u05D4\u05D4\u05E1\u05D1\u05E8 \u05D4\u05DE\u05DC\u05D0 \u05DE\u05D5\u05E4\u05D9\u05E2 \u05E2\u05DC \u05DB\u05DC \u05DB\u05E8\u05D8\u05D9\u05E1 \u05E7\u05D5 (\u05DB\u05E4\u05EA\u05D5\u05E8 \u05D4-?). \u05D0\u05D5\u05DE\u05D3\u05DF \u05DC\u05D4\u05DE\u05D7\u05E9\u05D4, \u05DC\u05D0 \u05E0\u05EA\u05D5\u05DF \u05EA\u05E7\u05E6\u05D9\u05D1\u05D9 \u05E8\u05E9\u05DE\u05D9."))), /*#__PURE__*/React.createElement("button", {
    onClick: () => handleViewAreaLines(area.name),
    className: "mt-auto w-full py-4 bg-slate-900 text-white rounded-2xl text-xs font-black hover:bg-black transition-all shadow-md"
  }, "\u05E6\u05E4\u05D4 \u05D1\u05E7\u05D5\u05D5\u05D9\u05DD \u05D0\u05DC\u05D5"))), areaStats.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "col-span-full text-center py-20 text-slate-500 font-bold"
  }, "\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D5 \u05D0\u05D6\u05D5\u05E8\u05D9\u05DD \u05EA\u05D5\u05D0\u05DE\u05D9\u05DD \u05DC\u05E1\u05D9\u05E0\u05D5\u05DF."))), tab === "deadhead" && (() => {
    const D = deadhead;
    if (trips.length === 0) return /*#__PURE__*/React.createElement("div", {
      className: "p-10 text-center text-slate-500 font-bold"
    }, "\u05D4\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05E2\u05D3\u05D9\u05D9\u05DF \u05E0\u05D8\u05E2\u05E0\u05D5\u05EA \u05D1\u05E8\u05E7\u05E2 \u2014 \u05D4\u05DC\u05E9\u05D5\u05E0\u05D9\u05EA \u05EA\u05EA\u05DE\u05DC\u05D0 \u05DB\u05E9\u05D4\u05DF \u05D9\u05D2\u05D9\u05E2\u05D5 (\u05DB\u05DE\u05D4 \u05E9\u05E0\u05D9\u05D5\u05EA).");
    if (!D) return /*#__PURE__*/React.createElement("div", {
      className: "p-10 text-center text-slate-500 font-bold"
    }, "\u05DE\u05D7\u05E9\u05D1 \u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05EA\u05E4\u05E2\u05D5\u05DC\u05D9\u05D5\u05EA\u2026");
    const fmtN = n => Math.round(n).toLocaleString('he-IL');
    const settingsPanel = /*#__PURE__*/React.createElement(ScoreSettingsPanel, {
      title: "\u05DE\u05D4 \u05E0\u05D7\u05E9\u05D1 \u05E0\u05E1\u05D9\u05E2\u05D4 \u05EA\u05E4\u05E2\u05D5\u05DC\u05D9\u05EA \u05DE\u05D9\u05D5\u05EA\u05E8\u05EA? \u05DB\u05D0\u05DF \u05E7\u05D5\u05D1\u05E2\u05D9\u05DD \u05D0\u05EA \u05D4\u05E0\u05D9\u05E7\u05D5\u05D3",
      accent: "rose",
      settings: dset,
      update: updDset,
      reset: resetDset,
      isDefault: dsetDefault,
      intro: "\u05D0\u05D5\u05EA\u05D4 \u05E9\u05D9\u05D8\u05D4 \u05DB\u05DE\u05D5 \u05E6\u05D9\u05D5\u05DF \u05D0\u05D9-\u05D4\u05D9\u05E2\u05D9\u05DC\u05D5\u05EA \u05E9\u05DC \u05E7\u05D5: \u05DC\u05DB\u05DC \u05E8\u05DB\u05D9\u05D1 \u05E7\u05D5\u05D1\u05E2\u05D9\u05DD \u05DB\u05DE\u05D4 \u05E0\u05E7\u05D5\u05D3\u05D5\u05EA \u05D4\u05D5\u05D0 \u05E0\u05D5\u05EA\u05DF, \u05D4\u05E6\u05D9\u05D5\u05DF \u05DE\u05E0\u05D5\u05E8\u05DE\u05DC \u05DC-100, \u05D5\u05D4\u05D4\u05D2\u05E0\u05D5\u05EA \u05DE\u05D5\u05E4\u05D7\u05EA\u05D5\u05EA \u05DE\u05DE\u05E0\u05D5. \u05D4\u05E8\u05E9\u05D9\u05DE\u05D4 \u05DE\u05EA\u05E2\u05D3\u05DB\u05E0\u05EA \u05DE\u05D9\u05D3.",
      rows: [{
        key: 'obs',
        label: 'תצפיות',
        hint: 'כמה פעמים בשבוע נצפה רכב מגיע לקצה וחוזר תוך 15 דקות — 7 בשבוע ומעלה = מלוא הנקודות'
      }, {
        key: 'tight',
        label: 'צמידות',
        hint: 'כמה מהר הרכב יצא חזרה — עד 5 דקות = מלוא הנקודות, 15 דקות = אפס'
      }, {
        key: 'hot',
        label: 'קו עמוס באזור',
        hint: 'יוצא קו אחר עמוס (80% מקיבולת הרכב) מהעיר שבה הרכב נמצא, עד 30 דקות אחרי שהגיע, עם תחנה משותפת — ורק אם הרכב מתאים לקו: עירוני/בינעירוני לא מתחלפים, ותקן הרכב של הקו העמוס הוא מינימום (אוטובוס מתגבר קו מיניבוס, לא להפך)'
      }, {
        key: 'crush',
        label: 'קו שצריך תגבור',
        hint: 'תוספת חומרה כשהקו העמוס ממש נחנק: מעל 100% מהקיבולת = מלוא הנקודות, 90% = חצי — האוטובוס הריק נסע ליד קו שהיה צריך אותו'
      }, {
        key: 'empty',
        label: 'ריק גם בספירות',
        hint: 'חלק נסיעות החזרה שבספירות משרד התחבורה עלו אליהן עד 1.5 נוסעים'
      }],
      extras: /*#__PURE__*/React.createElement("div", {
        className: "space-y-3"
      }, /*#__PURE__*/React.createElement("div", {
        className: "text-[12px] font-black text-slate-900"
      }, "\u05D4\u05D2\u05E0\u05D5\u05EA \u2014 \u05E0\u05E7\u05D5\u05D3\u05D5\u05EA \u05E9\u05DE\u05D5\u05E4\u05D7\u05EA\u05D5\u05EA \u05DE\u05D4\u05E6\u05D9\u05D5\u05DF (0 = \u05D1\u05DC\u05D9 \u05D4\u05D2\u05E0\u05D4):"), /*#__PURE__*/React.createElement("div", {
        className: "flex flex-wrap gap-x-5 gap-y-2 text-[12px] font-bold text-slate-700 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3"
      }, [['night', 'קו לילה (רוב החזרות לפני 05:00)'], ['weekend', 'סופ"ש'], ['rare', 'תצפית בודדת']].map(([k, lbl]) => /*#__PURE__*/React.createElement("label", {
        key: k,
        className: "inline-flex items-center gap-2"
      }, lbl, /*#__PURE__*/React.createElement(NumField, {
        value: dset.p[k],
        onChange: v => updDset(s2 => ({
          ...s2,
          p: {
            ...s2.p,
            [k]: v == null ? 0 : Math.max(0, Math.min(100, v))
          }
        })),
        min: 0,
        max: 100,
        width: "w-16",
        suffix: "\u05E0\u05E7\u05F3"
      })))), /*#__PURE__*/React.createElement("label", {
        className: "inline-flex items-center gap-2 text-[12px] font-bold text-slate-700 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3"
      }, "\u05E0\u05DB\u05E0\u05E1 \u05DC\u05E8\u05E9\u05D9\u05DE\u05D4 \u05DE\u05E6\u05D9\u05D5\u05DF \u05E9\u05DC \u05DC\u05E4\u05D7\u05D5\u05EA", /*#__PURE__*/React.createElement(NumField, {
        value: dset.minScore,
        onChange: v => updDset(s2 => ({
          ...s2,
          minScore: v == null ? 0 : Math.max(0, Math.min(100, v))
        })),
        min: 0,
        max: 100,
        suffix: "\u05DE\u05EA\u05D5\u05DA 100"
      }))),
      footnote: "\u05D4\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05E0\u05E9\u05DE\u05E8\u05D5\u05EA \u05D1\u05D3\u05E4\u05D3\u05E4\u05DF \u05D4\u05D6\u05D4 \u05D1\u05DC\u05D1\u05D3. \u05EA\u05D5\u05D5\u05D9\u05D5\u05EA \u05D4\u05E1\u05D8\u05D8\u05D5\u05E1 (\u05D7\u05DE\u05D5\u05E8 / \u05DC\u05D0 \u05D9\u05E2\u05D9\u05DC / \u05D8\u05E2\u05D5\u05DF \u05D1\u05D3\u05D9\u05E7\u05D4 / \u05E1\u05D8\u05D9\u05D9\u05D4 \u05E7\u05DC\u05D4 / \u05EA\u05E7\u05D9\u05DF) \u05D4\u05DF \u05D0\u05D5\u05EA\u05DF \u05EA\u05D5\u05D5\u05D9\u05D5\u05EA \u05E9\u05DC \u05E7\u05D5\u05D5\u05D9\u05DD \u05DC\u05D0 \u05D9\u05E2\u05D9\u05DC\u05D9\u05DD."
    });
    if (D.mode !== 'vehicle') {
      return /*#__PURE__*/React.createElement("div", {
        className: "space-y-8"
      }, /*#__PURE__*/React.createElement("div", {
        className: "bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm"
      }, /*#__PURE__*/React.createElement("h2", {
        className: "text-2xl font-black text-slate-900"
      }, "\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05EA\u05E4\u05E2\u05D5\u05DC\u05D9\u05D5\u05EA \u05D1\u05DE\u05E1\u05D5\u05D5\u05D4"), /*#__PURE__*/React.createElement("p", {
        className: "text-slate-500 font-bold mt-2"
      }, "\u05E0\u05EA\u05D5\u05E0\u05D9 \u05D4\u05E9\u05D9\u05D3\u05D5\u05E8\u05D9\u05DD (\u05D4\u05DC\u05D5\u05DA-\u05D7\u05D6\u05D5\u05E8 \u05E9\u05DC \u05D0\u05D5\u05EA\u05D5 \u05E8\u05DB\u05D1) \u05E2\u05D3\u05D9\u05D9\u05DF \u05DC\u05D0 \u05E0\u05D1\u05E0\u05D5 \u2014 \u05D4\u05E8\u05D9\u05E6\u05D4 \u05D4\u05D9\u05D5\u05DE\u05D9\u05EA \u05E9\u05DC \u05DE\u05D3\u05D3 \u05D4\u05D3\u05D9\u05D5\u05E7 \u05DB\u05D5\u05EA\u05D1\u05EA \u05D0\u05D5\u05EA\u05DD. \u05D1\u05D9\u05E0\u05EA\u05D9\u05D9\u05DD \u05D0\u05D9\u05DF \u05DE\u05D4 \u05DC\u05D4\u05E6\u05D9\u05D2 \u05DB\u05D0\u05DF.")));
    }
    const rows = D.lines.filter(L => !dhNearOnly || L.hot);
    return /*#__PURE__*/React.createElement("div", {
      className: "space-y-8 transition-opacity duration-300 opacity-100"
    }, /*#__PURE__*/React.createElement("div", {
      className: "bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm"
    }, /*#__PURE__*/React.createElement("h2", {
      className: "text-2xl font-black text-slate-900"
    }, "\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05EA\u05E4\u05E2\u05D5\u05DC\u05D9\u05D5\u05EA \u05D1\u05DE\u05E1\u05D5\u05D5\u05D4"), /*#__PURE__*/React.createElement("p", {
      className: "text-slate-500 font-bold mt-1"
    }, "\u05DC\u05E4\u05D9 \u05DE\u05E1\u05E4\u05E8 \u05D4\u05E8\u05DB\u05D1, \u05DE\u05D4\u05E9\u05D9\u05D3\u05D5\u05E8\u05D9\u05DD: \u05D0\u05D5\u05D8\u05D5\u05D1\u05D5\u05E1 \u05E9\u05D4\u05D2\u05D9\u05E2 \u05DC\u05E7\u05E6\u05D4 \u05E0\u05E1\u05D9\u05E2\u05D4 \u05D5\u05EA\u05D5\u05DA 15 \u05D3\u05E7\u05D5\u05EA \u05D9\u05E6\u05D0 \u05DC\u05E0\u05E1\u05D9\u05E2\u05D4 \u05E9\u05DE\u05E1\u05EA\u05D9\u05D9\u05DE\u05EA \u05D1\u05DE\u05E7\u05D5\u05DD \u05E9\u05DE\u05DE\u05E0\u05D5 \u05D4\u05EA\u05D7\u05D9\u05DC \u2014 \u05DC\u05D0 \u05D1\u05D4\u05DB\u05E8\u05D7 \u05D1\u05D0\u05D5\u05EA\u05D5 \u05E7\u05D5. \u05D5\u05E0\u05E1\u05D9\u05E2\u05EA \u05D4\u05D7\u05D6\u05E8\u05D4 \u05E8\u05D9\u05E7\u05D4 \u05D2\u05DD \u05D1\u05E1\u05E4\u05D9\u05E8\u05D5\u05EA \u05DE\u05E9\u05E8\u05D3 \u05D4\u05EA\u05D7\u05D1\u05D5\u05E8\u05D4 \u2014 \u05D4\u05DC\u05D5\u05DA-\u05D7\u05D6\u05D5\u05E8 \u05E6\u05DE\u05D5\u05D3 \u05DC\u05D1\u05D3\u05D5 \u05D4\u05D5\u05D0 \u05D2\u05DD \u05E9\u05D9\u05E8\u05D5\u05EA \u05E2\u05D9\u05E8\u05D5\u05E0\u05D9 \u05E8\u05D2\u05D9\u05DC, \u05D4\u05D7\u05D6\u05E8\u05D4 \u05D4\u05E8\u05D9\u05E7\u05D4 \u05D4\u05D9\u05D0 \u05DE\u05D4 \u05E9\u05D4\u05D5\u05E4\u05DA \u05D0\u05D5\u05EA\u05D5 \u05DC\u05D4\u05E1\u05E2\u05D4 \u05E9\u05E0\u05E8\u05E9\u05DE\u05D4 \u05DB\u05E9\u05D9\u05E8\u05D5\u05EA.", D.nDays, " \u05D4\u05D9\u05DE\u05D9\u05DD \u05D4\u05D0\u05D7\u05E8\u05D5\u05E0\u05D9\u05DD, \u05E2\u05D3\u05DB\u05D5\u05DF ", String(D.updated || '').slice(0, 10), "."), /*#__PURE__*/React.createElement("div", {
      className: "grid grid-cols-2 md:grid-cols-5 gap-3 mt-6"
    }, [['קווים', fmtN(D.allLines.length), 'text-slate-900'], ['זוגות שנצפו', fmtN(D.totalPairs), 'text-slate-900'], ['חזרה בקו אחר', fmtN(D.other), 'text-slate-900'], ['ליד קו עמוס', fmtN(D.near), 'text-rose-700'], ['ריקים גם בספירות', fmtN(D.emptyLines), 'text-orange-700']].map(([l, v, c]) => /*#__PURE__*/React.createElement("div", {
      key: l,
      className: "bg-slate-50 rounded-2xl p-4 text-center"
    }, /*#__PURE__*/React.createElement("div", {
      className: `text-2xl font-black ${c}`
    }, v), /*#__PURE__*/React.createElement("div", {
      className: "text-xs font-bold text-slate-500 mt-1"
    }, l)))), /*#__PURE__*/React.createElement("label", {
      className: "inline-flex items-center gap-2 mt-5 text-sm font-black text-rose-700 cursor-pointer"
    }, /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      checked: dhNearOnly,
      onChange: e => setDhNearOnly(e.target.checked),
      className: "w-4 h-4 accent-rose-600"
    }), "\u05E8\u05E7 \u05DB\u05E9\u05D9\u05E9 \u05E7\u05D5 \u05E2\u05DE\u05D5\u05E1 \u05D1\u05D0\u05D6\u05D5\u05E8 \u05D1\u05D0\u05D5\u05EA\u05D4 \u05E9\u05E2\u05D4")), settingsPanel, /*#__PURE__*/React.createElement("div", {
      className: "bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-200 shadow-sm overflow-x-auto"
    }, /*#__PURE__*/React.createElement("table", {
      className: "w-full text-right border-collapse text-sm"
    }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
      className: "text-slate-500 text-xs border-b border-slate-200"
    }, /*#__PURE__*/React.createElement("th", {
      className: "p-3"
    }, "\u05E0\u05D9\u05E7\u05D5\u05D3"), /*#__PURE__*/React.createElement("th", {
      className: "p-3"
    }, "\u05E1\u05D8\u05D8\u05D5\u05E1"), /*#__PURE__*/React.createElement("th", {
      className: "p-3"
    }, "\u05E7\u05D5"), /*#__PURE__*/React.createElement("th", {
      className: "p-3"
    }, "\u05DE\u05E1\u05DC\u05D5\u05DC"), /*#__PURE__*/React.createElement("th", {
      className: "p-3"
    }, "\u05D0\u05E9\u05DB\u05D5\u05DC"), /*#__PURE__*/React.createElement("th", {
      className: "p-3"
    }, "\u05D6\u05D5\u05D2\u05D5\u05EA (", D.nDays, " \u05D9\u05D5\u05DD)"), /*#__PURE__*/React.createElement("th", {
      className: "p-3"
    }, "\u05D9\u05DE\u05D9\u05DD"), /*#__PURE__*/React.createElement("th", {
      className: "p-3"
    }, "\u05E8\u05DB\u05D1\u05D9\u05DD"), /*#__PURE__*/React.createElement("th", {
      className: "p-3"
    }, "\u05D1\u05E7\u05D5 \u05D0\u05D7\u05E8"), /*#__PURE__*/React.createElement("th", {
      className: "p-3"
    }, "\u05E4\u05E2\u05E8 \u05DE\u05DE\u05D5\u05E6\u05E2"), /*#__PURE__*/React.createElement("th", {
      className: "p-3"
    }, "\u05DC\u05D9\u05D3 \u05E7\u05D5 \u05E2\u05DE\u05D5\u05E1"), /*#__PURE__*/React.createElement("th", {
      className: "p-3"
    }, "\u05E8\u05D9\u05E7 \u05D1\u05E1\u05E4\u05D9\u05E8\u05D5\u05EA"), /*#__PURE__*/React.createElement("th", {
      className: "p-3"
    }))), /*#__PURE__*/React.createElement("tbody", null, rows.slice(0, 300).map(L => /*#__PURE__*/React.createElement(React.Fragment, {
      key: L.groupKey
    }, /*#__PURE__*/React.createElement("tr", {
      className: "border-b border-slate-100 hover:bg-orange-50/40 cursor-pointer",
      onClick: () => setDhOpen(dhOpen === L.groupKey ? null : L.groupKey)
    }, /*#__PURE__*/React.createElement("td", {
      className: "p-3"
    }, /*#__PURE__*/React.createElement("span", {
      className: `font-black text-base ${L.statusTier.color}`
    }, L.score, "/100")), /*#__PURE__*/React.createElement("td", {
      className: "p-3"
    }, /*#__PURE__*/React.createElement("span", {
      className: `px-3 py-1 rounded-full text-[11px] font-black border ${L.statusTier.bg} ${L.statusTier.color}`
    }, L.status)), /*#__PURE__*/React.createElement("td", {
      className: "p-3 font-black text-lg"
    }, L.lineNum), /*#__PURE__*/React.createElement("td", {
      className: "p-3 font-bold"
    }, cityOnly2(L.origin), " \u2013 ", cityOnly2(L.dest)), /*#__PURE__*/React.createElement("td", {
      className: "p-3 text-slate-600"
    }, L.cluster || L.district), /*#__PURE__*/React.createElement("td", {
      className: "p-3 font-black"
    }, L.n), /*#__PURE__*/React.createElement("td", {
      className: "p-3"
    }, L.days), /*#__PURE__*/React.createElement("td", {
      className: "p-3"
    }, L.veh), /*#__PURE__*/React.createElement("td", {
      className: "p-3"
    }, L.other || '—'), /*#__PURE__*/React.createElement("td", {
      className: "p-3"
    }, L.gap, " \u05D3\u05E7'"), /*#__PURE__*/React.createElement("td", {
      className: "p-3 font-black text-rose-700"
    }, L.hot ? `קו ${L.hot.lineNum}` : '—'), /*#__PURE__*/React.createElement("td", {
      className: "p-3 font-black text-orange-700"
    }, Math.round(L.emptyFrac * 100), "%"), /*#__PURE__*/React.createElement("td", {
      className: "p-3 text-slate-400"
    }, /*#__PURE__*/React.createElement(Ic, {
      n: dhOpen === L.groupKey ? 'chevronUp' : 'chevronDown',
      size: 16
    }))), dhOpen === L.groupKey && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
      colSpan: 13,
      className: "p-0"
    }, /*#__PURE__*/React.createElement("div", {
      className: "bg-slate-50 rounded-2xl m-2 p-4 text-sm"
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-slate-600 text-xs font-bold mb-2"
    }, "\u05E0\u05D9\u05E7\u05D5\u05D3: \u05EA\u05E6\u05E4\u05D9\u05D5\u05EA ", L.parts.obs, "/", dset.c.obs.on ? dset.c.obs.max : 0, " (", L.perWeek.toFixed(1), " \u05D1\u05E9\u05D1\u05D5\u05E2) \xB7 \u05E6\u05DE\u05D9\u05D3\u05D5\u05EA ", L.parts.tight, "/", dset.c.tight.on ? dset.c.tight.max : 0, " \xB7 \u05E7\u05D5 \u05E2\u05DE\u05D5\u05E1 \u05D1\u05D0\u05D6\u05D5\u05E8 ", L.parts.hot, "/", dset.c.hot.on ? dset.c.hot.max : 0, " \xB7 \u05E6\u05E8\u05D9\u05DA \u05EA\u05D2\u05D1\u05D5\u05E8 ", L.parts.crush, "/", dset.c.crush.on ? dset.c.crush.max : 0, " \xB7 \u05E8\u05D9\u05E7 \u05D1\u05E1\u05E4\u05D9\u05E8\u05D5\u05EA ", L.parts.empty, "/", dset.c.empty.on ? dset.c.empty.max : 0, L.protections.length ? ` · הגנות: ${L.protections.map(x => `${x.name} (−${x.value})`).join(', ')}` : ''), /*#__PURE__*/React.createElement("div", {
      className: "text-slate-500 text-xs font-bold mb-1"
    }, "\u05D3\u05D5\u05D2\u05DE\u05D0\u05D5\u05EA \u05DE\u05D4\u05E9\u05D9\u05D3\u05D5\u05E8\u05D9\u05DD:"), L.ex.slice(0, 8).map((x, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      className: "py-1.5 border-b border-slate-200 last:border-0"
    }, /*#__PURE__*/React.createElement("span", {
      className: "font-black"
    }, x.day.split('-').reverse().join('.')), " \xB7 \u05E8\u05DB\u05D1 ", /*#__PURE__*/React.createElement("span", {
      dir: "ltr",
      className: "font-black"
    }, x.veh), " \xB7 \u05E7\u05D5 ", x.aLine, " \u05DB\u05D9\u05D5\u05D5\u05DF ", x.dirA, x.schA != null ? ` (מתוכנן ${hms(x.schA)})` : '', " ", hms(x.depA), "\u2013", hms(x.endA), " \u2190 \u05D7\u05D6\u05E8 ", x.aLine === x.bLine ? 'באותו קו' : `בקו ${x.bLine}`, " \u05DB\u05D9\u05D5\u05D5\u05DF ", x.dirB, x.schB != null ? `, מתוכנן ${hms(x.schB)}` : '', ", \u05D9\u05E6\u05D0 ", hms(x.depB), " \xB7 ", /*#__PURE__*/React.createElement("span", {
      className: "font-black"
    }, Math.round(x.gap / 60), " \u05D3\u05E7'"), " \u05D0\u05D7\u05E8\u05D9 \u05E9\u05D4\u05D2\u05D9\u05E2", x.bRiders != null ? /*#__PURE__*/React.createElement("span", {
      className: x.bRiders <= DEADHEAD_MAX_RIDERS ? 'text-orange-700 font-black' : 'text-slate-600'
    }, " \xB7 \u05D1\u05E1\u05E4\u05D9\u05E8\u05D5\u05EA \u05D4\u05DE\u05E9\u05E8\u05D3: ", x.bRiders, " \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05D1\u05D7\u05D6\u05E8\u05D4") : null, x.hot ? (() => {
      const ld = Math.max(x.hot.ridership, x.hot.peakLoad) / (x.hot.capacity || 50);
      return /*#__PURE__*/React.createElement("div", {
        className: "text-rose-700 text-xs font-bold mt-1 pr-4"
      }, "\u05D1\u05D0\u05D5\u05EA\u05D4 \u05E9\u05E2\u05D4 \u05E7\u05D5 ", x.hot.lineNum, " (", cityOnly2(x.hot.origin), " \u2190 ", cityOnly2(x.hot.dest), ", ", x.hot.time, ") \u05E0\u05D5\u05E1\u05E2 \u05E2\u05DE\u05D5\u05E1: ", Math.round(Math.max(x.hot.ridership, x.hot.peakLoad)), " \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05E2\u05DC \u05E7\u05D9\u05D1\u05D5\u05DC\u05EA ", x.hot.capacity, ld >= 0.9 ? ` — ${Math.round(ld * 100)}% מהקיבולת, קו שצריך תגבור` : '');
    })() : null))))))), !rows.length && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
      colSpan: 13,
      className: "p-8 text-center text-slate-500 font-bold"
    }, "\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D5 \u05E7\u05D5\u05D5\u05D9\u05DD \u05DC\u05E4\u05D9 \u05D4\u05E1\u05D9\u05E0\u05D5\u05DF")))), /*#__PURE__*/React.createElement("p", {
      className: "text-xs text-slate-500 font-bold mt-4 leading-relaxed"
    }, "\u05D4\u05D4\u05D2\u05D3\u05E8\u05D4: \u05D0\u05D5\u05EA\u05D5 \u05E8\u05DB\u05D1 (\u05DC\u05E4\u05D9 \u05DE\u05E1\u05E4\u05E8\u05D5 \u05D1\u05E9\u05D9\u05D3\u05D5\u05E8) \u05DE\u05D2\u05D9\u05E2 \u05DC\u05E7\u05E6\u05D4 \u05E0\u05E1\u05D9\u05E2\u05D4, \u05D5\u05EA\u05D5\u05DA 15 \u05D3\u05E7\u05D5\u05EA \u05D9\u05D5\u05E6\u05D0 \u05DC\u05E0\u05E1\u05D9\u05E2\u05D4 \u05E9\u05DE\u05E1\u05EA\u05D9\u05D9\u05DE\u05EA \u05E2\u05D3 1.5 \u05E7\"\u05DE \u05DE\u05D4\u05DE\u05E7\u05D5\u05DD \u05E9\u05D1\u05D5 \u05D4\u05EA\u05D7\u05D9\u05DC \u2014 \u05D1\u05D0\u05D5\u05EA\u05D5 \u05E7\u05D5 \u05D0\u05D5 \u05D1\u05E7\u05D5 \u05D0\u05D7\u05E8. \u05DB\u05DC \u05D6\u05D5\u05D2 \u05E0\u05E8\u05E9\u05DD \u05E4\u05E2\u05DD \u05D0\u05D7\u05EA, \u05E2\u05DC \u05E7\u05D5 \u05D4\u05D7\u05D6\u05E8\u05D4. \u05D1\u05DB\u05DC \u05D3\u05D5\u05D2\u05DE\u05D4: \u05D4\u05E9\u05E2\u05D4 \u05D4\u05DE\u05EA\u05D5\u05DB\u05E0\u05E0\u05EA \u05D1\u05DC\u05D5\"\u05D6 \u05DC\u05E6\u05D3 \u05D4\u05E9\u05E2\u05D4 \u05E9\u05D1\u05D4 \u05D9\u05E6\u05D0 \u05D1\u05E4\u05D5\u05E2\u05DC. \u05D4\u05E0\u05D9\u05E7\u05D5\u05D3 (0\u2013100) \u05D1\u05D3\u05D9\u05D5\u05E7 \u05DB\u05DE\u05D5 \u05E6\u05D9\u05D5\u05DF \u05D0\u05D9-\u05D4\u05D9\u05E2\u05D9\u05DC\u05D5\u05EA \u05E9\u05DC \u05E7\u05D5: \u05E8\u05DB\u05D9\u05D1\u05D9\u05DD \u05E2\u05DD \u05E0\u05E7\u05D5\u05D3\u05D5\u05EA \u05E9\u05E0\u05E7\u05D1\u05E2\u05D5\u05EA \u05D1\u05DC\u05D5\u05D7 \u05DC\u05DE\u05E2\u05DC\u05D4, \u05E0\u05E8\u05DE\u05D5\u05DC \u05DC-100, \u05D5\u05D4\u05D2\u05E0\u05D5\u05EA \u05E9\u05DE\u05D5\u05E4\u05D7\u05EA\u05D5\u05EA. \u05EA\u05D5\u05D5\u05D9\u05D5\u05EA \u05D4\u05E1\u05D8\u05D8\u05D5\u05E1 \u05D6\u05D4\u05D5\u05EA. \u05DC\u05D0 \u05D1\u05E8\u05E9\u05D9\u05DE\u05D4: ", D.normal.toLocaleString('he-IL'), " \u05E7\u05D5\u05D5\u05D9\u05DD \u05E9\u05E0\u05E6\u05E4\u05D4 \u05D1\u05D4\u05DD \u05D4\u05DC\u05D5\u05DA-\u05D7\u05D6\u05D5\u05E8 \u05E6\u05DE\u05D5\u05D3 \u05D0\u05D1\u05DC \u05E0\u05E1\u05D9\u05E2\u05EA \u05D4\u05D7\u05D6\u05E8\u05D4 \u05E9\u05DC\u05D4\u05DD \u05E2\u05DD \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05D1\u05E1\u05E4\u05D9\u05E8\u05D5\u05EA \u2014 \u05E9\u05D9\u05E8\u05D5\u05EA \u05E8\u05D2\u05D9\u05DC; ", D.noCountsN.toLocaleString('he-IL'), " \u05E7\u05D5\u05D5\u05D9\u05DD \u05D1\u05DC\u05D9 \u05E1\u05E4\u05D9\u05E8\u05D5\u05EA \u05D1\u05E7\u05D5\u05D1\u05E5 \u05D4\u05DE\u05E9\u05E8\u05D3 (\u05DE\u05EA\u05E2\u05D3\u05DB\u05DF \u05E8\u05D1\u05E2\u05D5\u05E0\u05D9\u05EA) \u2014 \u05DC\u05D0 \u05E0\u05D8\u05E2\u05DF \u05E9\u05D4\u05DD \u05E8\u05D9\u05E7\u05D9\u05DD.", D.unknown ? ` ${D.unknown} קווים מהשידורים לא נמצאו בקובץ המשרד ולכן אינם ברשימה.` : '')));
  })(), tab === "allTrips" && /*#__PURE__*/React.createElement(React.Fragment, null, trips.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "mb-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm font-bold text-amber-800"
  }, "\u05D4\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05E2\u05D3\u05D9\u05D9\u05DF \u05E0\u05D8\u05E2\u05E0\u05D5\u05EA \u05D1\u05E8\u05E7\u05E2 \u2014 \u05D4\u05DC\u05E9\u05D5\u05E0\u05D9\u05EA \u05D4\u05D6\u05D5 \u05EA\u05EA\u05DE\u05DC\u05D0 \u05DB\u05E9\u05D4\u05DF \u05D9\u05D2\u05D9\u05E2\u05D5 (\u05DB\u05DE\u05D4 \u05E9\u05E0\u05D9\u05D5\u05EA)."), /*#__PURE__*/React.createElement("div", {
    className: "bg-white p-6 md:p-8 rounded-[3rem] border border-slate-200 shadow-sm transition-opacity duration-300 opacity-100"
  }, /*#__PURE__*/React.createElement("header", {
    className: "mb-8 flex flex-col md:flex-row justify-between items-center gap-6"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    className: "text-2xl font-black text-slate-900 mb-2"
  }, "\u05DB\u05DC \u05D4\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05D1\u05DE\u05E2\u05E8\u05DB\u05EA"), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-500 font-bold text-sm"
  }, "\u05E1\u05E0\u05DF \u05DC\u05E4\u05D9 \u05E2\u05D9\u05E8 \u05D5\u05DE\u05E6\u05D0 \u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05E2\u05DE\u05D5\u05E1\u05D5\u05EA.")), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col md:flex-row items-center gap-4 w-full md:w-auto"
  }, /*#__PURE__*/React.createElement("label", {
    className: "flex items-center gap-3 bg-rose-50/50 border-2 border-rose-100 text-rose-800 px-4 py-3 rounded-2xl cursor-pointer hover:bg-rose-50 transition-colors w-full md:w-auto font-black text-sm"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: showCrowded,
    onChange: e => setShowCrowded(e.target.checked),
    className: "w-5 h-5 accent-rose-600 rounded"
  }), "\u05D4\u05E6\u05D2 \u05E8\u05E7 \u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05E2\u05DE\u05D5\u05E1\u05D5\u05EA"), /*#__PURE__*/React.createElement("div", {
    className: "flex relative w-full md:w-auto"
  }, /*#__PURE__*/React.createElement(SearchInput, {
    value: searchCity,
    onSubmit: setSearchCity,
    placeholder: "\u05D7\u05D9\u05E4\u05D5\u05E9 \u05E2\u05D9\u05E8 (\u05DE\u05D5\u05E6\u05D0 \u05D0\u05D5 \u05D9\u05E2\u05D3) \u2014 Enter",
    className: "w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 pl-12 font-black outline-none focus:border-slate-900 text-right shadow-sm"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "overflow-x-auto rounded-[2rem] border-2 border-slate-100 max-h-[60vh] pb-32"
  }, /*#__PURE__*/React.createElement("table", {
    className: "w-full text-right border-collapse"
  }, /*#__PURE__*/React.createElement("thead", {
    className: "sticky top-0 bg-slate-50 shadow-sm z-20",
    ref: tooltipRef
  }, /*#__PURE__*/React.createElement("tr", {
    className: "text-slate-500 text-xs font-black uppercase"
  }, /*#__PURE__*/React.createElement("th", {
    className: "p-5"
  }, "\u05DE\u05E1' \u05E7\u05D5"), /*#__PURE__*/React.createElement("th", {
    className: "p-5"
  }, "\u05DE\u05D5\u05E6\u05D0"), /*#__PURE__*/React.createElement("th", {
    className: "p-5"
  }, "\u05D9\u05E2\u05D3"), /*#__PURE__*/React.createElement("th", {
    className: "p-5"
  }, "\u05E9\u05E2\u05D4"), /*#__PURE__*/React.createElement("th", {
    className: "p-5 relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-1.5"
  }, /*#__PURE__*/React.createElement("span", null, "\u05E0\u05D5\u05E1\u05E2\u05D9\u05DD (\u05D9\u05E2\u05D9\u05DC\u05D5\u05EA)"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setActiveTooltip(activeTooltip === 'ridership' ? null : 'ridership'),
    className: "text-slate-500 hover:text-indigo-600 transition-colors"
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "info",
    size: 14
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col -space-y-1.5 mr-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setSortConfig({
      key: 'ridership',
      direction: 'desc'
    }),
    className: `${sortConfig.key === 'ridership' && sortConfig.direction === 'desc' ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-500'}`
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "chevronUp",
    size: 12,
    strokeWidth: "3"
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => setSortConfig({
      key: 'ridership',
      direction: 'asc'
    }),
    className: `${sortConfig.key === 'ridership' && sortConfig.direction === 'asc' ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-500'}`
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "chevronDown",
    size: 12,
    strokeWidth: "3"
  })))), activeTooltip === 'ridership' && /*#__PURE__*/React.createElement("div", {
    className: "absolute z-30 top-full right-0 mt-2 w-64 p-3 bg-slate-800 text-white text-xs rounded-xl shadow-xl font-normal normal-case text-right leading-relaxed border border-slate-700"
  }, /*#__PURE__*/React.createElement("strong", {
    className: "block mb-1 text-indigo-300"
  }, "\u05E0\u05D5\u05E1\u05E2\u05D9\u05DD (\u05D9\u05E2\u05D9\u05DC\u05D5\u05EA):"), " \u05E1\u05DA \u05DB\u05DC \u05D4\u05D0\u05E0\u05E9\u05D9\u05DD \u05E9\u05E2\u05DC\u05D5 \u05E2\u05DC \u05D4\u05D0\u05D5\u05D8\u05D5\u05D1\u05D5\u05E1 \u05DC\u05D0\u05D5\u05E8\u05DA \u05DB\u05DC \u05D4\u05DE\u05E1\u05DC\u05D5\u05DC. \u05DE\u05D3\u05D3 \u05D4\u05D9\u05E2\u05D9\u05DC\u05D5\u05EA \u05D1\u05E1\u05D5\u05D2\u05E8\u05D9\u05D9\u05DD \u05DE\u05D7\u05D5\u05E9\u05D1 \u05D1\u05D9\u05D7\u05E1 \u05DC\u05E7\u05D9\u05D1\u05D5\u05DC\u05EA \u05D4\u05D0\u05D5\u05D8\u05D5\u05D1\u05D5\u05E1 \u05D4\u05E1\u05E4\u05E6\u05D9\u05E4\u05D9 \u05E9\u05D4\u05D5\u05D2\u05D3\u05E8 (\u05DE\u05D9\u05E0\u05D9\u05D1\u05D5\u05E1, \u05DE\u05D9\u05D3\u05D9\u05D1\u05D5\u05E1, \u05D0\u05D5\u05D8\u05D5\u05D1\u05D5\u05E1 \u05E8\u05D2\u05D9\u05DC \u05D0\u05D5 \u05DE\u05E4\u05E8\u05E7\u05D9).")), /*#__PURE__*/React.createElement("th", {
    className: "p-5 relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-1.5"
  }, /*#__PURE__*/React.createElement("span", null, "\u05E2\u05D5\u05DE\u05E1 \u05E9\u05D9\u05D0"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setActiveTooltip(activeTooltip === 'peakLoad' ? null : 'peakLoad'),
    className: "text-slate-500 hover:text-indigo-600 transition-colors"
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "info",
    size: 14
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col -space-y-1.5 mr-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setSortConfig({
      key: 'peakLoad',
      direction: 'desc'
    }),
    className: `${sortConfig.key === 'peakLoad' && sortConfig.direction === 'desc' ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-500'}`
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "chevronUp",
    size: 12,
    strokeWidth: "3"
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => setSortConfig({
      key: 'peakLoad',
      direction: 'asc'
    }),
    className: `${sortConfig.key === 'peakLoad' && sortConfig.direction === 'asc' ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-500'}`
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "chevronDown",
    size: 12,
    strokeWidth: "3"
  })))), activeTooltip === 'peakLoad' && /*#__PURE__*/React.createElement("div", {
    className: "absolute z-30 top-full left-0 mt-2 w-64 p-3 bg-slate-800 text-white text-xs rounded-xl shadow-xl font-normal normal-case text-right leading-relaxed border border-slate-700"
  }, /*#__PURE__*/React.createElement("strong", {
    className: "block mb-1 text-indigo-300"
  }, "\u05E2\u05D5\u05DE\u05E1 \u05E9\u05D9\u05D0:"), " \u05D4\u05DE\u05E1\u05E4\u05E8 \u05D4\u05DE\u05E7\u05E1\u05D9\u05DE\u05DC\u05D9 \u05E9\u05DC \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05E9\u05D4\u05D9\u05D5 \u05D1\u05EA\u05D5\u05DA \u05D4\u05D0\u05D5\u05D8\u05D5\u05D1\u05D5\u05E1 \u05D1\u05D5-\u05D6\u05DE\u05E0\u05D9\u05EA \u05D1\u05E0\u05E7\u05D5\u05D3\u05D4 \u05D4\u05E2\u05DE\u05D5\u05E1\u05D4 \u05D1\u05D9\u05D5\u05EA\u05E8 \u05D1\u05DE\u05E1\u05DC\u05D5\u05DC \u05E9\u05DC\u05D5.")), /*#__PURE__*/React.createElement("th", {
    className: "p-5 relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("span", null, "\u05E1\u05D5\u05D2"), /*#__PURE__*/React.createElement("div", {
    className: "relative inline-block"
  }, /*#__PURE__*/React.createElement("select", {
    "aria-label": "\u05D1\u05D7\u05D9\u05E8\u05EA \u05DB\u05D9\u05D5\u05D5\u05DF \u05D4\u05E0\u05E1\u05D9\u05E2\u05D4 \u05D1\u05E1\u05D9\u05DE\u05D5\u05DC\u05D8\u05D5\u05E8",
    value: filterLineType,
    onChange: e => setFilterLineType(e.target.value),
    className: "appearance-none bg-slate-100 border border-slate-200 text-slate-600 rounded-md pl-6 pr-2 py-1 text-[10px] font-black outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer hover:bg-slate-200 transition-colors"
  }, /*#__PURE__*/React.createElement("option", {
    value: "all"
  }, "\u05D4\u05DB\u05DC"), allLineTypes.map(t => /*#__PURE__*/React.createElement("option", {
    key: `type-${t}`,
    value: t
  }, t))), /*#__PURE__*/React.createElement("div", {
    className: "absolute left-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500"
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "chevronDown",
    size: 10,
    strokeWidth: "3"
  }))))))), /*#__PURE__*/React.createElement("tbody", {
    className: "text-sm font-bold text-slate-700"
  }, tableTrips.slice(0, visibleTripsCount).map((t, i) => /*#__PURE__*/React.createElement("tr", {
    key: `trip-${t.id || i}`,
    className: "vrow border-t border-slate-100 hover:bg-slate-50 transition-colors"
  }, /*#__PURE__*/React.createElement("td", {
    className: "p-5 font-black"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col items-start gap-1 relative"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 justify-start"
  }, t.isNightLine && /*#__PURE__*/React.createElement("span", {
    className: "text-indigo-400 bg-indigo-50 p-1 rounded-full",
    title: "\u05E7\u05D5 \u05DC\u05D9\u05DC\u05D4"
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "moon",
    size: 16
  })), renderPrebookedInfo('trip-' + i, t.isEilatPrebooked), renderFeedingLineInfo('trip-' + i, t.isFeedingLine), /*#__PURE__*/React.createElement("span", {
    className: "bg-slate-900 text-white px-3 py-1.5 rounded-xl"
  }, t.lineNum)), (() => {
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
    return /*#__PURE__*/React.createElement("span", {
      className: "text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 whitespace-nowrap shrink-0"
    }, "\u05E2\u05D5\u05D1\u05E8 \u05D3\u05E8\u05DA: ", matchedCity);
  })())), /*#__PURE__*/React.createElement("td", {
    className: "p-5"
  }, t.origin), /*#__PURE__*/React.createElement("td", {
    className: "p-5"
  }, t.dest), /*#__PURE__*/React.createElement("td", {
    className: "p-5 font-black"
  }, t.time), /*#__PURE__*/React.createElement("td", {
    className: `p-5 flex items-center gap-2 ${t.ridership >= t.capacity * 0.8 ? 'text-rose-600 font-black' : ''}`
  }, t.ridership, /*#__PURE__*/React.createElement("span", {
    className: `text-[10px] px-2 py-0.5 rounded-full ${t.efficiency > 0.5 ? 'bg-emerald-100 text-emerald-700' : t.efficiency > 0.2 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`,
    title: `רכב: ${t.busSize} (קיבולת: ${t.capacity})`
  }, t.efficiency)), /*#__PURE__*/React.createElement("td", {
    className: `p-5 ${t.peakLoad >= t.capacity * 0.8 ? 'text-rose-600 font-black' : ''}`
  }, t.peakLoad), /*#__PURE__*/React.createElement("td", {
    className: "p-5 text-slate-500 text-xs"
  }, t.lineType))))), tableTrips.length > visibleTripsCount && /*#__PURE__*/React.createElement("div", {
    className: "text-center py-6 bg-slate-50 border-t border-slate-100"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setVisibleTripsCount(prev => prev + 300),
    className: "bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-black py-2.5 px-6 rounded-xl transition-all shadow-sm text-sm"
  }, "\u05D4\u05E6\u05D2 \u05E2\u05D5\u05D3 \u05EA\u05D5\u05E6\u05D0\u05D5\u05EA (", visibleTripsCount, " \u05DE\u05EA\u05D5\u05DA ", tableTrips.length.toLocaleString(), ")")), tableTrips.length <= visibleTripsCount && tableTrips.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "text-center py-4 text-xs font-bold text-slate-500 bg-slate-50 border-t border-slate-100"
  }, "\u05D4\u05D5\u05E6\u05D2\u05D5 \u05DB\u05DC ", tableTrips.length.toLocaleString(), " \u05D4\u05EA\u05D5\u05E6\u05D0\u05D5\u05EA.")))), tab === "simulator" && /*#__PURE__*/React.createElement(React.Fragment, null, trips.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "mb-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm font-bold text-amber-800"
  }, "\u05D4\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05E2\u05D3\u05D9\u05D9\u05DF \u05E0\u05D8\u05E2\u05E0\u05D5\u05EA \u05D1\u05E8\u05E7\u05E2 \u2014 \u05D4\u05DC\u05E9\u05D5\u05E0\u05D9\u05EA \u05D4\u05D6\u05D5 \u05EA\u05EA\u05DE\u05DC\u05D0 \u05DB\u05E9\u05D4\u05DF \u05D9\u05D2\u05D9\u05E2\u05D5 (\u05DB\u05DE\u05D4 \u05E9\u05E0\u05D9\u05D5\u05EA)."), /*#__PURE__*/React.createElement("div", {
    className: "bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm max-w-4xl mx-auto transition-opacity duration-300 opacity-100"
  }, /*#__PURE__*/React.createElement("header", {
    className: "mb-8"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-2xl font-black text-slate-900 mb-2"
  }, "\u05D0\u05DC\u05D2\u05D5\u05E8\u05D9\u05EA\u05DD \u05D9\u05D9\u05E2\u05D5\u05DC \u05D5\u05E9\u05D9\u05E4\u05D5\u05E8 \u05DC\u05D5\u05D7\u05D5\u05EA \u05D6\u05DE\u05E0\u05D9\u05DD"), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-500 font-bold text-sm leading-relaxed"
  }, "\u05D4\u05DE\u05E2\u05E8\u05DB\u05EA \u05DE\u05D6\u05D4\u05D4 \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05EA \u05D0\u05EA \u05E1\u05D5\u05D2 \u05D4\u05E9\u05D9\u05E8\u05D5\u05EA (\u05E2\u05D9\u05E8\u05D5\u05E0\u05D9/\u05D0\u05D6\u05D5\u05E8\u05D9/\u05D1\u05D9\u05E0\u05E2\u05D9\u05E8\u05D5\u05E0\u05D9) \u05D5\u05D0\u05EA ", /*#__PURE__*/React.createElement("strong", null, "\u05D2\u05D5\u05D3\u05DC \u05D4\u05E8\u05DB\u05D1"), " (\u05DE\u05E4\u05E8\u05E7\u05D9, \u05DE\u05D9\u05E0\u05D9\u05D1\u05D5\u05E1 \u05D5\u05DB\u05D5'), \u05D5\u05DE\u05EA\u05D0\u05D9\u05DE\u05D4 \u05D0\u05EA \u05E8\u05E3 \u05D4\u05D1\u05D9\u05D8\u05D5\u05DC \u05D5\u05D7\u05D5\u05E7\u05D9 \u05D4\u05D0\u05D9\u05D7\u05D5\u05D3 \u05D1\u05D0\u05D5\u05E4\u05DF \u05D3\u05D9\u05E0\u05DE\u05D9 \u05DC\u05DB\u05DC \u05E0\u05E1\u05D9\u05E2\u05D4.")), /*#__PURE__*/React.createElement("div", {
    className: "bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 mb-8 shadow-inner"
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "block text-xs font-[900] text-slate-500 mb-3 pr-2 uppercase tracking-wider"
  }, "\u05DE\u05E1\u05E4\u05E8 \u05E7\u05D5 / \u05DE\u05E7\"\u05D8"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: optLine,
    onChange: e => setOptLine(e.target.value),
    onKeyDown: e => {
      if (e.key === 'Enter' && optLine.trim() !== '' && !optLine.trim().endsWith(',')) {
        e.preventDefault();
        setOptLine(prev => prev.trim() + ', ');
      }
    },
    placeholder: "\u05DC\u05DE\u05E9\u05DC 1, 150...",
    className: "w-full bg-white border-2 border-slate-200 rounded-2xl px-5 py-3 font-black text-sm outline-none focus:border-slate-900 shadow-sm transition-all"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "block text-xs font-[900] text-slate-500 mb-3 pr-2 uppercase tracking-wider"
  }, "\u05E2\u05D9\u05E8 (\u05DE\u05D5\u05E6\u05D0 \u05D0\u05D5 \u05D9\u05E2\u05D3)"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    list: "cities-list",
    value: optCity === "all" ? "" : optCity,
    onChange: e => setOptCity(e.target.value || "all"),
    placeholder: "\u05D4\u05E7\u05DC\u05D3 \u05E9\u05DD \u05E2\u05D9\u05E8...",
    className: "w-full bg-white border-2 border-slate-200 rounded-2xl px-5 py-3 font-black outline-none focus:border-slate-900 text-right transition-all shadow-sm"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "block text-xs font-[900] text-slate-500 mb-3 pr-2 uppercase tracking-wider"
  }, "\u05DB\u05D9\u05D5\u05D5\u05DF \u05E0\u05E1\u05D9\u05E2\u05D4"), /*#__PURE__*/React.createElement("select", {
    value: optDirection,
    onChange: e => setOptDirection(e.target.value),
    className: "w-full bg-white border-2 border-slate-200 rounded-2xl px-5 py-3 font-black outline-none focus:border-slate-900 cursor-pointer text-right shadow-sm appearance-none"
  }, /*#__PURE__*/React.createElement("option", {
    value: "all"
  }, "\u05DB\u05DC \u05D4\u05DB\u05D9\u05D5\u05D5\u05E0\u05D9\u05DD"), allDirections.map(d => /*#__PURE__*/React.createElement("option", {
    key: `dir-${d}`,
    value: d
  }, d))))), /*#__PURE__*/React.createElement("div", {
    className: "mb-8"
  }, /*#__PURE__*/React.createElement("label", {
    className: "block text-xs font-[900] text-slate-500 mb-4 pr-2 uppercase tracking-wider"
  }, "\u05D9\u05DE\u05D9 \u05E4\u05E2\u05D9\u05DC\u05D5\u05EA (\u05E1\u05D9\u05E0\u05D5\u05DF \u05DE\u05E8\u05D5\u05D1\u05D4)"), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-3"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setOptDays([]),
    className: `px-5 py-2.5 rounded-2xl text-sm font-black transition-all border-2 ${optDays.length === 0 ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'}`
  }, "\u05DB\u05DC \u05D4\u05D9\u05DE\u05D9\u05DD"), DAYS_FILTER.map(d => /*#__PURE__*/React.createElement("button", {
    key: `day-${d.id}`,
    onClick: () => toggleDay(d.id),
    className: `px-5 py-2.5 rounded-2xl text-sm font-black transition-all border-2 ${optDays.includes(d.id) ? 'bg-teal-600 text-white border-teal-600 shadow-md' : 'bg-white border-slate-200 text-slate-500 hover:border-teal-600'}`
  }, d.label)))), /*#__PURE__*/React.createElement("div", {
    className: "border-t border-slate-200 pt-6 mb-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowAdvanced(prev => !prev),
    className: "flex items-center gap-2 text-xs font-black text-slate-500 hover:text-slate-900 transition-colors bg-slate-200/50 px-4 py-2 rounded-xl"
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "settings",
    size: 14
  }), "\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05D0\u05DC\u05D2\u05D5\u05E8\u05D9\u05EA\u05DD \u05DE\u05EA\u05E7\u05D3\u05DE\u05D5\u05EA", /*#__PURE__*/React.createElement(Ic, {
    n: showAdvanced ? "chevronUp" : "chevronDown",
    size: 14
  })), showAdvanced && /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-6 p-6 bg-white rounded-3xl border border-slate-200 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300"
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement("label", {
    className: "block text-[11px] font-black text-slate-500 uppercase pr-1"
  }, "\u05DE\u05D3\u05D3 \u05DC\u05E0\u05D9\u05EA\u05D5\u05D7"), /*#__PURE__*/React.createElement("select", {
    value: optMetric,
    onChange: e => setOptMetric(e.target.value),
    className: "w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-black text-sm outline-none focus:border-teal-600 cursor-pointer text-right transition-all"
  }, /*#__PURE__*/React.createElement("option", {
    value: "ridership"
  }, "\u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05D1\u05E4\u05D5\u05E2\u05DC"), /*#__PURE__*/React.createElement("option", {
    value: "peakLoad"
  }, "\u05E2\u05D5\u05DE\u05E1 \u05E9\u05D9\u05D0"))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement("label", {
    className: "block text-[11px] font-black text-slate-500 uppercase pr-1"
  }, "\u05DE\u05E8\u05D5\u05D5\u05D7 \u05D0\u05D9\u05D7\u05D5\u05D3 (\u05D3\u05E7')"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: optCustomGap,
    onChange: e => setOptCustomGap(e.target.value),
    placeholder: "\u05DC\u05E4\u05D9 \u05E1\u05D5\u05D2 \u05E7\u05D5",
    className: "w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-black text-sm outline-none focus:border-slate-900 text-right transition-all"
  })), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement("label", {
    className: "block text-[11px] font-black text-slate-500 uppercase pr-1"
  }, "\u05DE\u05D9\u05E0\u05D9\u05DE\u05D5\u05DD \u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05D1\u05D9\u05D5\u05DD"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: optMinTrips,
    onChange: e => setOptMinTrips(e.target.value),
    placeholder: "3 \u05E0\u05E1\u05D9\u05E2\u05D5\u05EA",
    className: "w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-black text-sm outline-none focus:border-slate-900 text-right transition-all"
  })), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement("label", {
    className: "block text-[11px] font-black text-slate-500 uppercase pr-1"
  }, "\u05E8\u05E3 \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05DC\u05D1\u05D9\u05D8\u05D5\u05DC"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: optCancelThreshold,
    onChange: e => setOptCancelThreshold(e.target.value),
    placeholder: "\u05DE\u05EA\u05D7\u05EA \u05DC-5",
    className: "w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-black text-sm outline-none focus:border-slate-900 text-right transition-all"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap items-center gap-4 pt-8 border-t border-slate-200 mt-6"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => runOptimization(),
    className: "bg-slate-900 hover:bg-black text-white px-10 py-4 rounded-2xl font-black transition-all shadow-lg active:scale-95 flex items-center gap-3 disabled:opacity-60"
  }, simLoading ? /*#__PURE__*/React.createElement(Ic, {
    n: "loader",
    size: 20,
    animate: true
  }) : /*#__PURE__*/React.createElement(Ic, {
    n: "zap",
    size: 20
  }), "\u05D4\u05E8\u05E5 \u05D0\u05DC\u05D2\u05D5\u05E8\u05D9\u05EA\u05DD"), optimizations.length > 0 && /*#__PURE__*/React.createElement("button", {
    onClick: exportOptimizationsToExcel,
    className: "bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-2xl font-black text-sm transition-all shadow-lg flex items-center gap-3"
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "download",
    size: 18
  }), "\u05D9\u05D9\u05E6\u05D5\u05D0 \u05DC\u05D0\u05E7\u05E1\u05DC"))), optimizations.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4 border-b border-slate-200 pb-4"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    className: "text-xl font-black text-slate-900"
  }, "\u05EA\u05D5\u05E6\u05D0\u05D5\u05EA \u05D4\u05D9\u05D9\u05E2\u05D5\u05DC"), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-500 text-sm font-bold"
  }, "\u05E0\u05DE\u05E6\u05D0\u05D5 ", optimizations.filter(o => o.type !== 'ok').length, " \u05D4\u05DE\u05DC\u05E6\u05D5\u05EA \u05DC\u05E9\u05D9\u05E0\u05D5\u05D9\u05D9\u05DD \u05D1\u05DC\u05D5\u05D7 \u05D4\u05D6\u05DE\u05E0\u05D9\u05DD"), simSkipped > 0 && /*#__PURE__*/React.createElement("p", {
    className: "text-red-500 text-xs font-bold mt-1"
  }, "\u2716 ", simSkipped, " \u05E7\u05D5\u05D5\u05D9\u05DD \u05E9\u05DB\u05D1\u05E8 \u05D1\u05D5\u05D8\u05DC\u05D5 (\u05DC\u05E4\u05D9 \u05D0\u05E8\u05DB\u05D9\u05D5\u05DF \"\u05D4\u05E7\u05D5 \u05D1\u05D6\u05DE\u05DF\") \u05D4\u05D5\u05D7\u05E8\u05D2\u05D5 \u05DE\u05D4\u05E1\u05D9\u05DE\u05D5\u05DC\u05E6\u05D9\u05D4")), /*#__PURE__*/React.createElement("label", {
    className: "flex items-center gap-2 bg-slate-100 px-4 py-2.5 rounded-xl cursor-pointer hover:bg-slate-200 transition-colors"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: showAllTripsInSimulator,
    onChange: e => setShowAllTripsInSimulator(e.target.checked),
    className: "w-4 h-4 accent-indigo-600 rounded"
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-sm font-bold text-slate-700"
  }, "\u05D4\u05E6\u05D2 \u05D0\u05EA \u05DB\u05DC \u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05D4\u05E7\u05D5 (\u05DB\u05D5\u05DC\u05DC \u05EA\u05E7\u05D9\u05E0\u05D5\u05EA)"))), !simLoading && optimizations.length === 0 && simSkipped > 0 && /*#__PURE__*/React.createElement("div", {
    className: "text-center py-8 text-red-500 font-black text-sm bg-red-50 border border-red-200 rounded-2xl"
  }, "\u2716 ", simSkipped === 1 ? 'הקו שחיפשת כבר בוטל (לפי ארכיון "הקו בזמן") — לכן אין תוצאות.' : simSkipped + ' קווים שתאמו את החיפוש כבר בוטלו (לפי ארכיון "הקו בזמן") — לכן אין תוצאות.'), /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, !simLoading && optimizations.length > 0 ? (() => {
    const optsToRender = showAllTripsInSimulator ? optimizations : optimizations.filter(o => o.type !== 'ok');
    return /*#__PURE__*/React.createElement(React.Fragment, null, optsToRender.slice(0, visibleOptCount).map((opt, i) => opt.type === 'merge' ? /*#__PURE__*/React.createElement("div", {
      key: `opt-${i}`,
      className: "bg-white border-2 border-slate-50 p-6 rounded-[2rem] flex flex-col lg:flex-row lg:items-center justify-between gap-6 hover:shadow-lg transition-all border-r-4 border-r-indigo-500"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-start gap-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "bg-indigo-50 text-indigo-600 p-3.5 rounded-2xl mt-1"
    }, /*#__PURE__*/React.createElement(Ic, {
      n: "calendar",
      size: 24
    })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-2 mb-1.5"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-2"
    }, /*#__PURE__*/React.createElement("span", {
      className: "font-black text-slate-900 text-lg"
    }, "\u05E7\u05D5 ", opt.line), opt.isNightLine && /*#__PURE__*/React.createElement("span", {
      className: "text-indigo-400 bg-indigo-50 p-1 rounded-full",
      title: "\u05E7\u05D5 \u05DC\u05D9\u05DC\u05D4"
    }, /*#__PURE__*/React.createElement(Ic, {
      n: "moon",
      size: 16
    })), renderPrebookedInfo('sim-' + i, opt.isEilatPrebooked), renderFeedingLineInfo('feed-' + i, opt.isFeedingLine)), /*#__PURE__*/React.createElement("span", {
      className: "text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold"
    }, opt.categoryLabel)), /*#__PURE__*/React.createElement("div", {
      className: "text-sm font-bold text-slate-500 mb-3"
    }, opt.origin, " \u2190 ", opt.dest), /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap gap-2"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-black bg-slate-100 text-slate-500 px-2 py-1 rounded-md"
    }, "\u05D9\u05D5\u05DD ", opt.days), renderTransitChip(opt.origin, opt.dest), /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-black bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md"
    }, "\u05DE\u05D5\u05DE\u05DC\u05E6\u05EA \u05DC\u05D0\u05D9\u05D7\u05D5\u05D3"), /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-black bg-sky-100 text-sky-700 px-2 py-1 rounded-md"
    }, "\u05DB\u05D9\u05D5\u05D5\u05DF ", opt.direction), /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-black bg-purple-100 text-purple-700 px-2 py-1 rounded-md"
    }, opt.busSize)))), /*#__PURE__*/React.createElement("div", {
      className: "bg-slate-50/80 px-6 py-4 rounded-2xl flex-1 max-w-md w-full"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex justify-between items-center mb-3 text-sm"
    }, /*#__PURE__*/React.createElement("span", {
      className: "font-bold text-slate-500"
    }, "\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05E0\u05D5\u05DB\u05D7\u05D9\u05D5\u05EA:"), /*#__PURE__*/React.createElement("span", {
      className: "font-black text-slate-700"
    }, opt.from, " \u05D5-", opt.to, " ", /*#__PURE__*/React.createElement("span", {
      className: "text-xs text-slate-500 font-normal"
    }, opt.gap === 0 ? '(באותה דקה — איחוד לרכב אחד)' : `(${opt.gap} דק' הפרש)`))), /*#__PURE__*/React.createElement("div", {
      className: "flex justify-between items-center mb-4 text-sm"
    }, /*#__PURE__*/React.createElement("span", {
      className: "font-bold text-slate-500"
    }, opt.usedMetric === 'peakLoad' ? 'עומס שיא מצטבר:' : 'נוסעים מצטבר:'), /*#__PURE__*/React.createElement("span", {
      className: "font-black text-slate-700"
    }, opt.total, " ", /*#__PURE__*/React.createElement("span", {
      className: "text-xs text-slate-500 font-normal mr-1"
    }, "(", opt.val1, " \u05D1\u05E0\u05E1\u05D9\u05E2\u05D4 \u05D4-1, ", opt.val2, " \u05D1\u05E0\u05E1\u05D9\u05E2\u05D4 \u05D4-2)"))), /*#__PURE__*/React.createElement("div", {
      className: "pt-3 border-t border-slate-200 flex justify-between items-center"
    }, /*#__PURE__*/React.createElement("span", {
      className: "font-black text-indigo-700"
    }, "\u05E9\u05E2\u05D4 \u05DE\u05D5\u05DE\u05DC\u05E6\u05EA \u05DC\u05D0\u05D9\u05D7\u05D5\u05D3:"), /*#__PURE__*/React.createElement("span", {
      className: "font-black text-2xl text-indigo-600 bg-white px-3 py-1 rounded-xl shadow-sm"
    }, opt.suggestedTime)))) : opt.type === 'cancel' ? /*#__PURE__*/React.createElement("div", {
      key: `opt-${i}`,
      className: `bg-white border-2 border-slate-50 p-6 rounded-[2rem] flex flex-col lg:flex-row lg:items-center justify-between gap-6 hover:shadow-lg transition-all border-r-4 border-r-rose-500`
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-start gap-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: `bg-rose-50 text-rose-600 p-3.5 rounded-2xl mt-1`
    }, /*#__PURE__*/React.createElement(Ic, {
      n: "alert",
      size: 24
    })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-2 mb-1.5"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-2"
    }, /*#__PURE__*/React.createElement("span", {
      className: "font-black text-slate-900 text-lg"
    }, "\u05E7\u05D5 ", opt.line), opt.isNightLine && /*#__PURE__*/React.createElement("span", {
      className: "text-indigo-400 bg-indigo-50 p-1 rounded-full",
      title: "\u05E7\u05D5 \u05DC\u05D9\u05DC\u05D4"
    }, /*#__PURE__*/React.createElement(Ic, {
      n: "moon",
      size: 16
    })), renderPrebookedInfo('sim-' + i, opt.isEilatPrebooked), renderFeedingLineInfo('feed-' + i, opt.isFeedingLine)), /*#__PURE__*/React.createElement("span", {
      className: "text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold"
    }, opt.categoryLabel)), /*#__PURE__*/React.createElement("div", {
      className: "text-sm font-bold text-slate-500 mb-3"
    }, opt.origin, " \u2190 ", opt.dest), /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap gap-2"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-black bg-slate-100 text-slate-500 px-2 py-1 rounded-md"
    }, "\u05D9\u05D5\u05DD ", opt.days), renderTransitChip(opt.origin, opt.dest), /*#__PURE__*/React.createElement("span", {
      className: `text-[11px] font-black px-2 py-1 rounded-md bg-rose-100 text-rose-700`
    }, "\u05D7\u05E9\u05D3 \u05DC\u05E0\u05E1\u05D9\u05E2\u05D4 \u05DE\u05D9\u05D5\u05EA\u05E8\u05EA"), /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-black bg-sky-100 text-sky-700 px-2 py-1 rounded-md"
    }, "\u05DB\u05D9\u05D5\u05D5\u05DF ", opt.direction), /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-black bg-purple-100 text-purple-700 px-2 py-1 rounded-md"
    }, opt.busSize)))), /*#__PURE__*/React.createElement("div", {
      className: "bg-slate-50/80 px-6 py-4 rounded-2xl flex-1 max-w-md w-full"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex justify-between items-center mb-3 text-sm"
    }, /*#__PURE__*/React.createElement("span", {
      className: "font-bold text-slate-500"
    }, "\u05E9\u05E2\u05EA \u05D4\u05E0\u05E1\u05D9\u05E2\u05D4:"), /*#__PURE__*/React.createElement("span", {
      className: `font-black text-2xl text-rose-600`
    }, opt.time)), /*#__PURE__*/React.createElement("div", {
      className: "flex justify-between items-center mb-3 text-sm"
    }, /*#__PURE__*/React.createElement("span", {
      className: "font-bold text-slate-500"
    }, opt.usedMetric === 'peakLoad' ? 'עומס שיא:' : 'נוסעים בפועל:'), /*#__PURE__*/React.createElement("span", {
      className: "font-black text-slate-700"
    }, opt.metricVal)), /*#__PURE__*/React.createElement("div", {
      className: "flex justify-between items-center text-sm pt-3 border-t border-slate-200"
    }, /*#__PURE__*/React.createElement("span", {
      className: "font-bold text-slate-500"
    }, "\u05E6\u05D9\u05D5\u05DF \u05D9\u05E2\u05D9\u05DC\u05D5\u05EA:"), /*#__PURE__*/React.createElement("span", {
      className: `font-black text-rose-600`
    }, opt.efficiency)))) : /*#__PURE__*/React.createElement("div", {
      key: `opt-${i}`,
      className: "bg-slate-50/50 border-2 border-slate-100 p-6 rounded-[2rem] flex flex-col lg:flex-row lg:items-center justify-between gap-6 opacity-70 hover:opacity-100 transition-all"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-start gap-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "bg-slate-200 text-slate-500 p-3.5 rounded-2xl mt-1"
    }, /*#__PURE__*/React.createElement(Ic, {
      n: "list",
      size: 24
    })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-2 mb-1.5"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-2"
    }, /*#__PURE__*/React.createElement("span", {
      className: "font-black text-slate-700 text-lg"
    }, "\u05E7\u05D5 ", opt.line), opt.isNightLine && /*#__PURE__*/React.createElement("span", {
      className: "text-indigo-400 bg-indigo-50 p-1 rounded-full",
      title: "\u05E7\u05D5 \u05DC\u05D9\u05DC\u05D4"
    }, /*#__PURE__*/React.createElement(Ic, {
      n: "moon",
      size: 16
    })), renderPrebookedInfo('sim-ok-' + i, opt.isEilatPrebooked), renderFeedingLineInfo('feed-ok-' + i, opt.isFeedingLine)), /*#__PURE__*/React.createElement("span", {
      className: "text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-bold"
    }, opt.categoryLabel)), /*#__PURE__*/React.createElement("div", {
      className: "text-sm font-bold text-slate-500 mb-3"
    }, opt.origin, " \u2190 ", opt.dest), /*#__PURE__*/React.createElement("div", {
      className: "flex flex-wrap gap-2"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-black bg-slate-200 text-slate-600 px-2 py-1 rounded-md"
    }, "\u05D9\u05D5\u05DD ", opt.days), renderTransitChip(opt.origin, opt.dest), /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-black bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md"
    }, "\u05E0\u05E1\u05D9\u05E2\u05D4 \u05EA\u05E7\u05D9\u05E0\u05D4 (\u05DC\u05DC\u05D0 \u05E9\u05D9\u05E0\u05D5\u05D9)"), /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-black bg-sky-100 text-sky-700 px-2 py-1 rounded-md"
    }, "\u05DB\u05D9\u05D5\u05D5\u05DF ", opt.direction), /*#__PURE__*/React.createElement("span", {
      className: "text-[11px] font-black bg-purple-100 text-purple-700 px-2 py-1 rounded-md"
    }, opt.busSize)))), /*#__PURE__*/React.createElement("div", {
      className: "bg-white border border-slate-200 px-6 py-4 rounded-2xl flex-1 max-w-md w-full"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex justify-between items-center mb-3 text-sm"
    }, /*#__PURE__*/React.createElement("span", {
      className: "font-bold text-slate-500"
    }, "\u05E9\u05E2\u05EA \u05D4\u05E0\u05E1\u05D9\u05E2\u05D4:"), /*#__PURE__*/React.createElement("span", {
      className: "font-black text-xl text-slate-700"
    }, opt.time)), /*#__PURE__*/React.createElement("div", {
      className: "flex justify-between items-center mb-1 text-sm"
    }, /*#__PURE__*/React.createElement("span", {
      className: "font-bold text-slate-500"
    }, opt.usedMetric === 'peakLoad' ? 'עומס שיא:' : 'נוסעים בפועל:'), /*#__PURE__*/React.createElement("span", {
      className: "font-black text-slate-700"
    }, opt.metricVal))))), optsToRender.length > visibleOptCount && /*#__PURE__*/React.createElement("div", {
      className: "pt-4 text-center"
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => setVisibleOptCount(prev => prev + 50),
      className: "w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-sm transition-all shadow-md flex items-center justify-center gap-2"
    }, /*#__PURE__*/React.createElement(Ic, {
      n: "chevronDown",
      size: 18
    }), "\u05D4\u05E6\u05D2 \u05E2\u05D5\u05D3 \u05EA\u05D5\u05E6\u05D0\u05D5\u05EA", /*#__PURE__*/React.createElement("span", {
      className: "bg-indigo-500 text-white text-xs px-2.5 py-1 rounded-full font-black"
    }, visibleOptCount, " / ", optsToRender.length.toLocaleString()))));
  })() : !simLoading ? /*#__PURE__*/React.createElement("div", {
    className: "py-20 text-center bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-slate-300 font-black italic text-lg mb-2"
  }, "\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D5 \u05D4\u05D6\u05D3\u05DE\u05E0\u05D5\u05D9\u05D5\u05EA \u05D9\u05D9\u05E2\u05D5\u05DC \u05DC\u05E1\u05D9\u05E0\u05D5\u05DF \u05D4\u05DE\u05D1\u05D5\u05E7\u05E9"), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-500 text-sm font-bold px-10"
  }, "\u05E0\u05E1\u05D4 \u05DC\u05E9\u05E0\u05D5\u05EA \u05D0\u05EA \u05D4\u05E1\u05D9\u05E0\u05D5\u05DF \u05D0\u05D5 \u05DC\u05D1\u05D7\u05D5\u05E8 \u05E7\u05D5/\u05E2\u05D9\u05E8 \u05D0\u05D7\u05E8\u05D9\u05DD.")) : null))), tab === "about" && /*#__PURE__*/React.createElement("div", {
    className: "bg-white p-8 md:p-12 rounded-[3rem] border border-slate-200 shadow-sm max-w-4xl mx-auto transition-opacity duration-300 opacity-100"
  }, /*#__PURE__*/React.createElement("header", {
    className: "mb-10 text-center border-b border-slate-100 pb-8"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-3xl font-black text-slate-900 mb-4"
  }, "\u05E2\u05DC \u05D4\u05DE\u05E2\u05E8\u05DB\u05EA \u05D5\u05E9\u05D9\u05D8\u05D5\u05EA \u05D4\u05D7\u05D9\u05E9\u05D5\u05D1"), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-500 font-bold text-lg max-w-2xl mx-auto leading-relaxed"
  }, "\u05DE\u05E2\u05E8\u05DB\u05EA \"\u05E7\u05D5 \u05E4\u05D7\" \u05E4\u05D5\u05EA\u05D7\u05D4 \u05DB\u05DB\u05DC\u05D9 \u05E2\u05D6\u05E8 \u05DC\u05DE\u05EA\u05DB\u05E0\u05E0\u05D9 \u05EA\u05D7\u05D1\u05D5\u05E8\u05D4, \u05D1\u05DE\u05D8\u05E8\u05D4 \u05DC\u05E0\u05EA\u05D7 \u05E0\u05EA\u05D5\u05E0\u05D9 \u05D0\u05DE\u05EA, \u05DC\u05D0\u05EA\u05E8 \u05D7\u05D5\u05E1\u05E8 \u05D9\u05E2\u05D9\u05DC\u05D5\u05EA \u05D5\u05DC\u05E9\u05E4\u05E8 \u05D0\u05EA \u05DC\u05D5\u05D7\u05D5\u05EA \u05D4\u05D6\u05DE\u05E0\u05D9\u05DD \u05E9\u05DC \u05D4\u05D0\u05D5\u05D8\u05D5\u05D1\u05D5\u05E1\u05D9\u05DD.")), /*#__PURE__*/React.createElement("div", {
    className: "space-y-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "border-t border-slate-100 pt-2"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "text-2xl font-black text-slate-900 mb-2"
  }, "\u05D0\u05D9\u05DA \u05D4\u05DE\u05E2\u05E8\u05DB\u05EA \u05E2\u05D5\u05D1\u05D3\u05EA"), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-500 font-medium text-sm"
  }, "\u05D4\u05E1\u05D1\u05E8 \u05E2\u05DC \u05DB\u05DC \u05D0\u05D7\u05D3 \u05DE\u05D4\u05DB\u05DC\u05D9\u05DD: \u05DE\u05D4 \u05D4\u05D5\u05D0 \u05DE\u05E6\u05D9\u05D2, \u05D0\u05D9\u05DA \u05D4\u05D7\u05D9\u05E9\u05D5\u05D1 \u05E2\u05D5\u05D1\u05D3, \u05D5\u05DE\u05EA\u05D9 \u05DB\u05D3\u05D0\u05D9 \u05DC\u05D4\u05E9\u05EA\u05DE\u05E9 \u05D1\u05D5.")), /*#__PURE__*/React.createElement("section", {
    className: "bg-rose-50/40 rounded-[2rem] p-6 border border-rose-100"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3 mb-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-rose-600 text-white p-2 rounded-xl"
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "trash",
    size: 18
  })), /*#__PURE__*/React.createElement("h3", {
    className: "text-xl font-black text-rose-700"
  }, "\u05E7\u05D5\u05D5\u05D9\u05DD \u05DC\u05D0 \u05D9\u05E2\u05D9\u05DC\u05D9\u05DD")), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-700 font-medium text-sm mb-4 leading-relaxed"
  }, /*#__PURE__*/React.createElement("strong", null, "\u05DE\u05D4 \u05D4\u05D5\u05D0 \u05E2\u05D5\u05E9\u05D4:"), " \u05DE\u05D3\u05E8\u05D2 \u05DB\u05DC \u05E7\u05D5 \u05D1\u05E1\u05D5\u05DC\u05DD 0\u2013100 \u05DC\u05E4\u05D9 \u05E8\u05DE\u05EA \u05D0\u05D9-\u05D4\u05D9\u05E2\u05D9\u05DC\u05D5\u05EA \u05E9\u05DC\u05D5, \u05D5\u05DE\u05E6\u05D9\u05D2 \u05E8\u05E7 \u05E7\u05D5\u05D5\u05D9\u05DD \u05E2\u05DD \u05E6\u05D9\u05D5\u05DF 25+. \u05DB\u05DC \u05E7\u05D5 \u05DE\u05E7\u05D1\u05DC \u05D2\u05DD \u05EA\u05D5\u05D5\u05D9\u05EA \u05E1\u05D8\u05D8\u05D5\u05E1 \u05D1\u05D5\u05DC\u05D8\u05EA (\u05D7\u05DE\u05D5\u05E8 / \u05DC\u05D0 \u05D9\u05E2\u05D9\u05DC / \u05D8\u05E2\u05D5\u05DF \u05D1\u05D3\u05D9\u05E7\u05D4 / \u05E1\u05D8\u05D9\u05D9\u05D4 \u05E7\u05DC\u05D4 / \u05EA\u05E7\u05D9\u05DF) \u05D5\u05E6\u05D1\u05E2 \u05DE\u05EA\u05D0\u05D9\u05DD."), /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-2xl border border-rose-100 p-4 mb-3"
  }, /*#__PURE__*/React.createElement("h4", {
    className: "font-black text-slate-800 text-sm mb-2"
  }, "\u05E9\u05DC\u05D1 1: \u05E1\u05D9\u05D5\u05D5\u05D2 \u05DC-8 \u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D5\u05EA"), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-600 text-sm leading-relaxed mb-2"
  }, "\u05DC\u05E4\u05E0\u05D9 \u05E9\u05DE\u05D7\u05E9\u05D1\u05D9\u05DD \u05E6\u05D9\u05D5\u05DF, \u05D4\u05E7\u05D5 \u05DE\u05E1\u05D5\u05D5\u05D2 \u05DC\u05D0\u05D7\u05EA \u05DE-8 \u05D4\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D5\u05EA \u05D4\u05E8\u05E9\u05DE\u05D9\u05D5\u05EA \u05E9\u05DC \u05DE\u05E9\u05E8\u05D3 \u05D4\u05EA\u05D7\u05D1\u05D5\u05E8\u05D4 \u2014 \u05DC\u05E4\u05D9 \u05E9\u05D3\u05D4 \"\u05D9\u05D9\u05D7\u05D5\u05D3\u05D9\u05D5\u05EA\", \"\u05E7\u05D1\u05D5\u05E6\u05EA \u05D9\u05E2\u05D9\u05DC\u05D5\u05EA \u05EA\u05E4\u05E2\u05D5\u05DC\u05D9\u05EA\", \u05E1\u05D5\u05D2 \u05E9\u05D9\u05E8\u05D5\u05EA, \u05D0\u05D5\u05E8\u05DA \u05DE\u05E1\u05DC\u05D5\u05DC (\u05E1\u05E3 45 \u05E7\"\u05DE) \u05D5\u05EA\u05D3\u05D9\u05E8\u05D5\u05EA \u05E9\u05D1\u05D5\u05E2\u05D9\u05EA (\u05E1\u05E3 600)."), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-1.5 text-[11px] font-black"
  }, /*#__PURE__*/React.createElement("span", {
    className: "bg-slate-100 text-slate-700 px-2 py-1 rounded-md"
  }, "\u05D0\u05D6\u05D5\u05E8\u05D9"), /*#__PURE__*/React.createElement("span", {
    className: "bg-slate-100 text-slate-700 px-2 py-1 rounded-md"
  }, "\u05D1\u05D9\u05E0\u05E2\u05D9\u05E8\u05D5\u05E0\u05D9 \u05D0\u05E8\u05D5\u05DA"), /*#__PURE__*/React.createElement("span", {
    className: "bg-slate-100 text-slate-700 px-2 py-1 rounded-md"
  }, "\u05D1\u05D9\u05E0\u05E2\u05D9\u05E8\u05D5\u05E0\u05D9 \u05E7\u05E6\u05E8"), /*#__PURE__*/React.createElement("span", {
    className: "bg-slate-100 text-slate-700 px-2 py-1 rounded-md"
  }, "\u05E2\u05D9\u05E8\u05D5\u05E0\u05D9 \u05EA\u05D3\u05D9\u05E8\u05D5\u05EA \u05D2\u05D1\u05D5\u05D4\u05D4"), /*#__PURE__*/React.createElement("span", {
    className: "bg-slate-100 text-slate-700 px-2 py-1 rounded-md"
  }, "\u05E2\u05D9\u05E8\u05D5\u05E0\u05D9 \u05EA\u05D3\u05D9\u05E8\u05D5\u05EA \u05E0\u05DE\u05D5\u05DB\u05D4"), /*#__PURE__*/React.createElement("span", {
    className: "bg-slate-100 text-slate-700 px-2 py-1 rounded-md"
  }, "\u05DC\u05D9\u05DC\u05D4"), /*#__PURE__*/React.createElement("span", {
    className: "bg-slate-100 text-slate-700 px-2 py-1 rounded-md"
  }, "\u05E7\u05D5\u05D5\u05D9\u05DD \u05DE\u05D6\u05D9\u05E0\u05D9\u05DD"), /*#__PURE__*/React.createElement("span", {
    className: "bg-slate-100 text-slate-700 px-2 py-1 rounded-md"
  }, "\u05EA\u05DC\u05DE\u05D9\u05D3\u05D9\u05DD"))), /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-2xl border border-rose-100 p-4 mb-3"
  }, /*#__PURE__*/React.createElement("h4", {
    className: "font-black text-slate-800 text-sm mb-2"
  }, "\u05E9\u05DC\u05D1 2: \u05E0\u05D9\u05E7\u05D5\u05D3 (0\u2013100)"), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-600 text-sm leading-relaxed mb-2"
  }, "\u05D7\u05DE\u05D9\u05E9\u05D4 \u05E8\u05DB\u05D9\u05D1\u05D9\u05DD, \u05E1\u05E3 \u05D4\u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05D1\u05DB\u05DC \u05D0\u05D7\u05D3 \u05DE\u05D4\u05DD \u05DE\u05D5\u05EA\u05D0\u05DD \u05DC\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4 (5 \u05DC\u05D0\u05D6\u05D5\u05E8\u05D9/\u05DC\u05D9\u05DC\u05D4, 8 \u05DC\u05E7\u05E6\u05E8/\u05DE\u05D6\u05D9\u05DF, 10 \u05DC\u05D0\u05E8\u05D5\u05DA/\u05EA\u05D3\u05D9\u05E8\u05D5\u05EA \u05E0\u05DE\u05D5\u05DB\u05D4, 15 \u05DC\u05EA\u05D3\u05D9\u05E8\u05D5\u05EA \u05D2\u05D1\u05D5\u05D4\u05D4/\u05EA\u05DC\u05DE\u05D9\u05D3\u05D9\u05DD):"), /*#__PURE__*/React.createElement("ul", {
    className: "list-disc list-inside text-slate-600 text-sm space-y-1.5 pr-2"
  }, /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05E9\u05E4\u05DC (\u05E2\u05D3 ", pset.c.lowTrips.on ? pset.c.lowTrips.max : 0, " \u05E0\u05E7'):"), " \u05D0\u05D7\u05D5\u05D6 \u05D4\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05E2\u05DD \u05E4\u05D7\u05D5\u05EA \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05DE\u05E1\u05E3 \u05D4\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "\u05E7\u05D9\u05DC\u05D5\u05DE\u05D8\u05E8 \u05DE\u05D1\u05D5\u05D6\u05D1\u05D6 (\u05E2\u05D3 ", pset.c.wastedKm.on ? pset.c.wastedKm.max : 0, " \u05E0\u05E7'):"), " \u05DE\u05E9\u05E7\u05DC\u05DC \u05D0\u05D7\u05D5\u05D6 \u05E7\"\u05DE \u05E1\u05E8\u05E7 \u05D5\u05DB\u05DE\u05D5\u05EA \u05DE\u05D5\u05D7\u05DC\u05D8\u05EA."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "\u05E2\u05DC\u05D5\u05EA \u05EA\u05E4\u05E2\u05D5\u05DC\u05D9\u05EA \u05DC\u05E0\u05D5\u05E1\u05E2 (\u05E2\u05D3 ", pset.c.cost.on ? pset.c.cost.max : 0, " \u05E0\u05E7'):"), " \u05D9\u05D7\u05E1 \u05DC\u05D1\u05E0\u05E6'\u05DE\u05E8\u05E7 \u05D4\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4 (\u20AA31.8 \u05DC\u05D0\u05D6\u05D5\u05E8\u05D9, \u20AA9.4 \u05DC\u05E2\u05D9\u05E8\u05D5\u05E0\u05D9 \u05EA\u05D3\u05D9\u05E8\u05D5\u05EA \u05D2\u05D1\u05D5\u05D4\u05D4, \u05D5\u05DB\u05D5')."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "\u05DE\u05DE\u05D5\u05E6\u05E2 \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05D5\u05E2\u05D5\u05DE\u05E1 \u05E9\u05D9\u05D0 (\u05E2\u05D3 ", pset.c.riders.on ? pset.c.riders.max : 0, " \u05E0\u05E7'):"), " \u05D1\u05D9\u05D7\u05E1 \u05DC\u05E7\u05D9\u05D1\u05D5\u05DC\u05EA \u05D4\u05E8\u05DB\u05D1 \u2014 \u05DE\u05D9\u05E0\u05D9\u05D1\u05D5\u05E1 (19), \u05DE\u05D9\u05D3\u05D9 (35), \u05E8\u05D2\u05D9\u05DC (50), \u05DE\u05E4\u05E8\u05E7\u05D9 (90)."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "\u05E0\u05E1\u05D9\u05E2\u05D4 \u05EA\u05E4\u05E2\u05D5\u05DC\u05D9\u05EA \u05D1\u05DE\u05E1\u05D5\u05D5\u05D4 (\u05E2\u05D3 ", pset.c.deadhead && pset.c.deadhead.on ? pset.c.deadhead.max : 0, " \u05E0\u05E7'):"), " \u05DB\u05DE\u05D4 \u05E4\u05E2\u05DE\u05D9\u05DD \u05D1\u05E9\u05D1\u05D5\u05E2 \u05E0\u05E6\u05E4\u05D4 \u05D1\u05E9\u05D9\u05D3\u05D5\u05E8\u05D9\u05DD \u05E8\u05DB\u05D1 \u05E9\u05D4\u05D2\u05D9\u05E2 \u05DC\u05E7\u05E6\u05D4 \u05D4\u05E7\u05D5 \u05D5\u05D7\u05D6\u05E8 \u05EA\u05D5\u05DA 15 \u05D3\u05E7\u05D5\u05EA \u2014 \u05D4\u05E1\u05E2\u05EA \u05E8\u05DB\u05D1 \u05E9\u05E0\u05E8\u05E9\u05DE\u05D4 \u05DB\u05E9\u05D9\u05E8\u05D5\u05EA. 7 \u05D1\u05E9\u05D1\u05D5\u05E2 \u05D5\u05DE\u05E2\u05DC\u05D4 = \u05DE\u05DC\u05D5\u05D0 \u05D4\u05E0\u05E7\u05D5\u05D3\u05D5\u05EA. \u05D4\u05E4\u05D9\u05E8\u05D5\u05D8 \u05D1\u05DC\u05E9\u05D5\u05E0\u05D9\u05EA \"\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05EA\u05E4\u05E2\u05D5\u05DC\u05D9\u05D5\u05EA\"."), /*#__PURE__*/React.createElement("li", {
    className: "text-slate-500"
  }, "\u05D0\u05DC\u05D4 \u05D1\u05E8\u05D9\u05E8\u05D5\u05EA \u05D4\u05DE\u05D7\u05D3\u05DC", psetDefault ? '' : ' — כרגע פועלות ההגדרות שלכם', ". \u05D1\u05D8\u05D0\u05D1 \"\u05E7\u05D5\u05D5\u05D9\u05DD \u05DC\u05D0 \u05D9\u05E2\u05D9\u05DC\u05D9\u05DD\" \u05D9\u05E9 \u05DC\u05D5\u05D7 \u2699\uFE0F \u05E9\u05D1\u05D5 \u05DB\u05DC \u05D0\u05D7\u05D3 \u05E7\u05D5\u05D1\u05E2 \u05DC\u05E2\u05E6\u05DE\u05D5 \u05DB\u05DE\u05D4 \u05E0\u05E7\u05D5\u05D3\u05D5\u05EA \u05DB\u05DC \u05D3\u05D1\u05E8 \u05E0\u05D5\u05EA\u05DF, \u05DE\u05EA\u05D7\u05EA \u05DC\u05DB\u05DE\u05D4 \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05E7\u05D5 \u05E0\u05D7\u05E9\u05D1 \u05E8\u05D9\u05E7, \u05D5\u05D0\u05D9\u05DC\u05D5 \u05D4\u05D2\u05E0\u05D5\u05EA \u05E4\u05D5\u05E2\u05DC\u05D5\u05EA."))), /*#__PURE__*/React.createElement("div", {
    className: "bg-orange-50 rounded-2xl border border-orange-100 p-4 mb-3"
  }, /*#__PURE__*/React.createElement("h4", {
    className: "font-black text-orange-800 text-sm mb-2"
  }, "\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05EA\u05E4\u05E2\u05D5\u05DC\u05D9\u05D5\u05EA \u05D1\u05DE\u05E1\u05D5\u05D5\u05D4 \u2014 \u05DC\u05E9\u05D5\u05E0\u05D9\u05EA \u05E0\u05E4\u05E8\u05D3\u05EA"), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-600 text-sm leading-relaxed mb-2"
  }, /*#__PURE__*/React.createElement("strong", null, "\u05DE\u05D4 \u05D6\u05D4:"), " \u05DE\u05E4\u05E2\u05D9\u05DC \u05E9\u05DC\u05D0 \u05E8\u05D5\u05E6\u05D4 \u05DC\u05D4\u05E1\u05D9\u05E2 \u05E8\u05DB\u05D1 \u05E8\u05D9\u05E7 \u05DC\u05DE\u05E1\u05D5\u05E3 \u05D1\u05DC\u05D9 \u05EA\u05E9\u05DC\u05D5\u05DD \u05E8\u05D5\u05E9\u05DD \u05D0\u05EA \u05D4\u05D4\u05E1\u05E2\u05D4 \u05DB\u05E0\u05E1\u05D9\u05E2\u05EA \u05E9\u05D9\u05E8\u05D5\u05EA. ", /*#__PURE__*/React.createElement("strong", null, "\u05D0\u05D9\u05DA \u05DE\u05D6\u05D4\u05D9\u05DD:"), " \u05DC\u05E4\u05D9 \u05DE\u05E1\u05E4\u05E8 \u05D4\u05E8\u05DB\u05D1 \u05D1\u05E9\u05D9\u05D3\u05D5\u05E8\u05D9 \u05D4\u05DE\u05D9\u05E7\u05D5\u05DD \u2014 \u05D4\u05E8\u05DB\u05D1 \u05DE\u05D2\u05D9\u05E2 \u05DC\u05E7\u05E6\u05D4 \u05E0\u05E1\u05D9\u05E2\u05D4 \u05D5\u05EA\u05D5\u05DA 15 \u05D3\u05E7\u05D5\u05EA \u05D9\u05D5\u05E6\u05D0 \u05DC\u05E0\u05E1\u05D9\u05E2\u05D4 \u05E9\u05DE\u05E1\u05EA\u05D9\u05D9\u05DE\u05EA \u05E2\u05D3 1.5 \u05E7\"\u05DE \u05DE\u05D4\u05DE\u05E7\u05D5\u05DD \u05E9\u05DE\u05DE\u05E0\u05D5 \u05D4\u05EA\u05D7\u05D9\u05DC, \u05D1\u05D0\u05D5\u05EA\u05D5 \u05E7\u05D5 \u05D0\u05D5 \u05D1\u05E7\u05D5 \u05D0\u05D7\u05E8 (89 \u05D4\u05DC\u05D5\u05DA, 80 \u05D7\u05D6\u05D5\u05E8). 14 \u05D4\u05D9\u05DE\u05D9\u05DD \u05D4\u05D0\u05D7\u05E8\u05D5\u05E0\u05D9\u05DD."), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-600 text-sm leading-relaxed mb-2"
  }, /*#__PURE__*/React.createElement("strong", null, "\u05D4\u05E0\u05D9\u05E7\u05D5\u05D3"), " \u05D1\u05D0\u05D5\u05EA\u05D4 \u05E9\u05D9\u05D8\u05D4 (\u05E8\u05DB\u05D9\u05D1\u05D9\u05DD \u05DC\u05D1\u05D7\u05D9\u05E8\u05D4, \u05E0\u05E8\u05DE\u05D5\u05DC \u05DC-100, \u05D4\u05D2\u05E0\u05D5\u05EA, \u05D0\u05D5\u05EA\u05DF \u05EA\u05D5\u05D5\u05D9\u05D5\u05EA \u05E1\u05D8\u05D8\u05D5\u05E1):"), /*#__PURE__*/React.createElement("ul", {
    className: "list-disc list-inside text-slate-600 text-sm space-y-1.5 pr-2"
  }, /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "\u05EA\u05E6\u05E4\u05D9\u05D5\u05EA (\u05E2\u05D3 ", dset.c.obs.on ? dset.c.obs.max : 0, "):"), " \u05DB\u05DE\u05D4 \u05E4\u05E2\u05DE\u05D9\u05DD \u05D1\u05E9\u05D1\u05D5\u05E2 \u05D6\u05D4 \u05E7\u05D5\u05E8\u05D4; 7 \u05D5\u05DE\u05E2\u05DC\u05D4 = \u05DE\u05DC\u05D5\u05D0 \u05D4\u05E0\u05E7\u05D5\u05D3\u05D5\u05EA."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "\u05E6\u05DE\u05D9\u05D3\u05D5\u05EA (\u05E2\u05D3 ", dset.c.tight.on ? dset.c.tight.max : 0, "):"), " \u05DB\u05DE\u05D4 \u05DE\u05D4\u05E8 \u05D4\u05E8\u05DB\u05D1 \u05D9\u05E6\u05D0 \u05D7\u05D6\u05E8\u05D4 \u2014 \u05E2\u05D3 5 \u05D3\u05E7\u05D5\u05EA = \u05DE\u05DC\u05D5\u05D0 \u05D4\u05E0\u05E7\u05D5\u05D3\u05D5\u05EA, 15 = \u05D0\u05E4\u05E1."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "\u05E7\u05D5 \u05E2\u05DE\u05D5\u05E1 \u05D1\u05D0\u05D6\u05D5\u05E8 (", dset.c.hot.on ? dset.c.hot.max : 0, "):"), " \u05D4\u05E8\u05DB\u05D1 \u05D4\u05E8\u05D9\u05E7 \u05D4\u05D9\u05D4 \u05D9\u05DB\u05D5\u05DC \u05DC\u05EA\u05D2\u05D1\u05E8 \u05E7\u05D5 \u05D0\u05D7\u05E8: \u05DE\u05D4\u05E2\u05D9\u05E8 \u05E9\u05D1\u05D4 \u05D4\u05D5\u05D0 \u05E0\u05DE\u05E6\u05D0 (\u05E7\u05E6\u05D4 \u05D4\u05E0\u05E1\u05D9\u05E2\u05D4 \u05E9\u05E1\u05D9\u05D9\u05DD) \u05D9\u05D5\u05E6\u05D0, \u05E2\u05D3 30 \u05D3\u05E7\u05D5\u05EA \u05D0\u05D7\u05E8\u05D9 \u05E9\u05D4\u05D2\u05D9\u05E2, \u05E7\u05D5 \u05E2\u05DE\u05D5\u05E1 (80% \u05DE\u05E7\u05D9\u05D1\u05D5\u05DC\u05EA \u05D4\u05E8\u05DB\u05D1) \u05E2\u05DD \u05EA\u05D7\u05E0\u05D4 \u05DE\u05E9\u05D5\u05EA\u05E4\u05EA. \u05E0\u05D1\u05D3\u05E7 \u05D2\u05DD \u05E9\u05D4\u05E8\u05DB\u05D1 \u05DE\u05EA\u05D0\u05D9\u05DD \u05DC\u05E7\u05D5 \u2014 \u05E8\u05DB\u05D1 \u05D1\u05D9\u05E0\u05E2\u05D9\u05E8\u05D5\u05E0\u05D9 \u05DC\u05D0 \u05DE\u05D1\u05E6\u05E2 \u05E7\u05D5 \u05E2\u05D9\u05E8\u05D5\u05E0\u05D9 \u05D5\u05DC\u05D4\u05E4\u05DA, \u05D5\u05EA\u05E7\u05DF \u05D4\u05E8\u05DB\u05D1 \u05E9\u05DC \u05D4\u05E7\u05D5 \u05D4\u05E2\u05DE\u05D5\u05E1 \u05D4\u05D5\u05D0 \u05DE\u05D9\u05E0\u05D9\u05DE\u05D5\u05DD: \u05D0\u05D5\u05D8\u05D5\u05D1\u05D5\u05E1 \u05D9\u05DB\u05D5\u05DC \u05DC\u05EA\u05D2\u05D1\u05E8 \u05E7\u05D5 \u05E9\u05DE\u05D5\u05D2\u05D3\u05E8 \u05DE\u05D9\u05E0\u05D9\u05D1\u05D5\u05E1, \u05D0\u05D1\u05DC \u05DE\u05D9\u05E0\u05D9\u05D1\u05D5\u05E1 \u05DC\u05D0 \u05D9\u05EA\u05D2\u05D1\u05E8 \u05E7\u05D5 \u05E9\u05D3\u05D5\u05E8\u05E9 \u05D0\u05D5\u05D8\u05D5\u05D1\u05D5\u05E1. (\u05E0\u05D2\u05D9\u05E9\u05D5\u05EA \u05D0\u05D9\u05E0\u05D4 \u05D1\u05E7\u05D5\u05D1\u05E5 \u05D4\u05DE\u05E9\u05E8\u05D3 \u05D5\u05DC\u05DB\u05DF \u05DC\u05D0 \u05E0\u05D1\u05D3\u05E7\u05EA.)"), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "\u05E7\u05D5 \u05E9\u05E6\u05E8\u05D9\u05DA \u05EA\u05D2\u05D1\u05D5\u05E8 (\u05E2\u05D3 ", dset.c.crush.on ? dset.c.crush.max : 0, "):"), " \u05EA\u05D5\u05E1\u05E4\u05EA \u05D7\u05D5\u05DE\u05E8\u05D4 \u05DB\u05E9\u05D4\u05E7\u05D5 \u05D4\u05E2\u05DE\u05D5\u05E1 \u05DE\u05DE\u05E9 \u05E0\u05D7\u05E0\u05E7 \u2014 \u05DE\u05E2\u05DC 100% \u05DE\u05D4\u05E7\u05D9\u05D1\u05D5\u05DC\u05EA = \u05DE\u05DC\u05D5\u05D0 \u05D4\u05E0\u05E7\u05D5\u05D3\u05D5\u05EA, 90% = \u05D7\u05E6\u05D9. \u05D4\u05D0\u05D5\u05D8\u05D5\u05D1\u05D5\u05E1 \u05D4\u05E8\u05D9\u05E7 \u05E0\u05E1\u05E2 \u05DC\u05D9\u05D3 \u05E7\u05D5 \u05E9\u05D4\u05D9\u05D4 \u05E6\u05E8\u05D9\u05DA \u05D0\u05D5\u05EA\u05D5."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "\u05E8\u05D9\u05E7 \u05D2\u05DD \u05D1\u05E1\u05E4\u05D9\u05E8\u05D5\u05EA (\u05E2\u05D3 ", dset.c.empty.on ? dset.c.empty.max : 0, "):"), " \u05E0\u05E1\u05D9\u05E2\u05EA \u05D4\u05D7\u05D6\u05E8\u05D4 \u05E8\u05D9\u05E7\u05D4 \u05D2\u05DD \u05D1\u05E1\u05E4\u05D9\u05E8\u05D5\u05EA \u05DE\u05E9\u05E8\u05D3 \u05D4\u05EA\u05D7\u05D1\u05D5\u05E8\u05D4 (\u05E2\u05D3 1.5 \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD). \u05E7\u05D5 \u05E9\u05D0\u05D9\u05DF \u05DC\u05D5 \u05E1\u05E4\u05D9\u05E8\u05D5\u05EA \u05D1\u05E7\u05D5\u05D1\u05E5 (\u05DE\u05EA\u05E2\u05D3\u05DB\u05DF \u05E8\u05D1\u05E2\u05D5\u05E0\u05D9\u05EA) \u05DC\u05D0 \u05E0\u05D8\u05E2\u05DF \u05DB\u05E8\u05D9\u05E7."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "\u05D4\u05D2\u05E0\u05D5\u05EA:"), " \u05E7\u05D5 \u05DC\u05D9\u05DC\u05D4 (\u2212", dset.p.night, "), \u05E1\u05D5\u05E4\"\u05E9 (\u2212", dset.p.weekend, "), \u05EA\u05E6\u05E4\u05D9\u05EA \u05D1\u05D5\u05D3\u05D3\u05EA (\u2212", dset.p.rare, ")."))), /*#__PURE__*/React.createElement("div", {
    className: "bg-emerald-50 rounded-2xl border border-emerald-100 p-4 mb-3"
  }, /*#__PURE__*/React.createElement("h4", {
    className: "font-black text-emerald-800 text-sm mb-2"
  }, "\u05E9\u05DC\u05D1 3: \u05D4\u05D2\u05E0\u05D5\u05EA (\u05DE\u05D5\u05E4\u05D7\u05EA\u05D5\u05EA \u05DE\u05D4\u05E6\u05D9\u05D5\u05DF)"), /*#__PURE__*/React.createElement("ul", {
    className: "list-disc list-inside text-emerald-700 text-sm font-medium space-y-1 pr-2"
  }, /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "\u05EA\u05D7\u05E0\u05D5\u05EA \u05D1\u05DC\u05E2\u05D3\u05D9\u05D5\u05EA / \u05D9\u05E2\u05D3 \u05D9\u05D9\u05D7\u05D5\u05D3\u05D9 (\u221215):"), " \u05D4\u05E7\u05D5 \u05DE\u05E9\u05E8\u05EA \u05EA\u05D7\u05E0\u05D5\u05EA \u05E9\u05D0\u05D9\u05DF \u05D0\u05DC\u05D9\u05D4\u05DF \u05E7\u05D5 \u05D0\u05D7\u05E8."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "\u05DE\u05D5\u05EA\u05D0\u05DD \u05E8\u05DB\u05D1\u05EA (\u221210):"), " \u05E2\u05DE\u05D5\u05D3\u05EA \"\u05D9\u05D9\u05D7\u05D5\u05D3\u05D9\u05D5\u05EA\" \u05DE\u05E6\u05D9\u05D9\u05E0\u05EA \u05D6\u05D0\u05EA \u05D1\u05DE\u05E4\u05D5\u05E8\u05E9."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "\u05EA\u05DC\u05DE\u05D9\u05D3\u05D9\u05DD \u05D1\u05E9\u05E2\u05D5\u05EA \u05D1\u05D9\"\u05E1 (\u221210):"), " 60%+ \u05DE\u05D4\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05D1-7:00\u20138:30 \u05D0\u05D5 13:00\u201315:30."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "\u05D4\u05D6\u05DE\u05E0\u05D4 \u05DE\u05E8\u05D0\u05E9 (\u221220):"), " \u05D1\u05E7\u05D5\u05D5\u05D9\u05DD \u05D1\u05D4\u05D6\u05DE\u05E0\u05D4 \u05DE\u05E8\u05D0\u05E9 (\u05D0\u05D9\u05DC\u05EA) \u05D4\u05EA\u05D9\u05E7\u05D5\u05E4\u05D9\u05DD \u05D7\u05DC\u05E7\u05D9\u05D9\u05DD \u05D1\u05D4\u05D2\u05D3\u05E8\u05D4 \u2014 \u05D4\u05E2\u05D5\u05DE\u05E1 \u05D1\u05E4\u05D5\u05E2\u05DC \u05D2\u05D1\u05D5\u05D4 \u05DE\u05D4\u05E0\u05DE\u05D3\u05D3."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "\u05E7\u05D5 \u05E1\u05D5\u05E4\"\u05E9 (\u221210):"), " 60%+ \u05DE\u05D4\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05D1\u05E9\u05D9\u05E9\u05D9-\u05E9\u05D1\u05EA, \u05E9\u05D1\u05D4\u05DD \u05D3\u05E4\u05D5\u05E1 \u05D4\u05D1\u05D9\u05E7\u05D5\u05E9 \u05E9\u05D5\u05E0\u05D4 \u05DE\u05E7\u05D5\u05D5\u05D9 \u05D7\u05D5\u05DC."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "\u05E7\u05D5 \u05D7\u05D3\u05E9 \u05D1\u05D4\u05E8\u05E6\u05D4 (\u221210):"), " \u05D4\u05E7\u05D5 \u05D4\u05D5\u05E4\u05D9\u05E2 \u05DC\u05E8\u05D0\u05E9\u05D5\u05E0\u05D4 \u05D1\u05E9\u05E0\u05D4 \u05D4\u05D0\u05D7\u05E8\u05D5\u05E0\u05D4 \u2014 \u05DE\u05E2\u05D8 \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05D6\u05D4 \u05E9\u05DC\u05D1 \u05D1\u05E0\u05D9\u05D9\u05EA \u05D4\u05D1\u05D9\u05E7\u05D5\u05E9, \u05DC\u05D0 \u05D1\u05D6\u05D1\u05D5\u05D6. \u05DE\u05D6\u05D5\u05D4\u05D4 \u05DE\u05D0\u05E8\u05DB\u05D9\u05D5\u05DF \"\u05D4\u05E7\u05D5 \u05D1\u05D6\u05DE\u05DF\"."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "\u05DB\u05D1\u05E8 \u05E6\u05D5\u05DE\u05E6\u05DD (\u221210):"), " \u05E9\u05E0\u05D9 \u05E6\u05DE\u05E6\u05D5\u05DE\u05D9 \u05E9\u05D9\u05E8\u05D5\u05EA \u05D5\u05DE\u05E2\u05DC\u05D4 \u05D1\u05E9\u05E0\u05D4 \u05D4\u05D0\u05D7\u05E8\u05D5\u05E0\u05D4 \u2014 \u05D4\u05E6\u05DE\u05E6\u05D5\u05DD \u05DB\u05D1\u05E8 \u05E7\u05E8\u05D4. \u05DE\u05D6\u05D5\u05D4\u05D4 \u05DE\u05D4\u05D0\u05E8\u05DB\u05D9\u05D5\u05DF."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "\u05D0\u05D9\u05DF \u05D7\u05E4\u05D9\u05E4\u05EA \u05EA\u05D7\u05E0\u05D5\u05EA \u05DE\u05E9\u05DE\u05E2\u05D5\u05EA\u05D9\u05EA (\u221210):"), " \u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D4 \u05D7\u05E4\u05D9\u05E4\u05EA \u05EA\u05D7\u05E0\u05D5\u05EA \u05DE\u05E2\u05DC \u05E1\u05E3 \u05D4\u05DE\u05D3\u05D3. \u05D6\u05D5 \u05D4\u05D2\u05E0\u05D4 \u05E1\u05D8\u05D8\u05D9\u05E1\u05D8\u05D9\u05EA; \u05D2\u05DD \u05DB\u05E9\u05E0\u05DE\u05E6\u05D0\u05D4 \u05D7\u05E4\u05D9\u05E4\u05D4, \u05DC\u05D0 \u05D0\u05D5\u05DE\u05EA\u05D4 \u05D7\u05DC\u05D5\u05E4\u05D4 \u05E9\u05D9\u05DE\u05D5\u05E9\u05D9\u05EA \u05DC\u05E0\u05D5\u05E1\u05E2\u05D9\u05DD."))), /*#__PURE__*/React.createElement("div", {
    className: "bg-rose-50 rounded-2xl border border-rose-100 p-4 mb-3"
  }, /*#__PURE__*/React.createElement("h4", {
    className: "font-black text-rose-800 text-sm mb-2"
  }, "\u05E2\u05DC\u05D5\u05EA \u05E2\u05D5\u05D3\u05E4\u05EA \u05D1\u05D0\u05D5\u05DE\u05D3\u05DF \u2014 \u05DE\u05D4 \u05D6\u05D4 \u05D5\u05D0\u05D9\u05DA \u05DE\u05D7\u05D5\u05E9\u05D1"), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-700 text-sm leading-relaxed mb-2"
  }, "\u05EA\u05E8\u05D2\u05D5\u05DD \u05E9\u05DC \u05D7\u05D5\u05E1\u05E8 \u05D4\u05D9\u05E2\u05D9\u05DC\u05D5\u05EA \u05DC\u05E9\u05E7\u05DC\u05D9\u05DD: \u05DB\u05DE\u05D4 \u05E2\u05D5\u05DC\u05D4 \u05DC\u05D4\u05E1\u05D9\u05E2 \u05E0\u05D5\u05E1\u05E2 \u05D1\u05E7\u05D5 \u05D4\u05D6\u05D4, \u05DC\u05E2\u05D5\u05DE\u05EA \u05DB\u05DE\u05D4 \u05D6\u05D4 \u05E2\u05D5\u05DC\u05D4 \u05D1\u05E7\u05D5 \u05DE\u05DE\u05D5\u05E6\u05E2 \u05DE\u05D0\u05D5\u05EA\u05D4 \u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4 \u2014 \u05DB\u05E4\u05D5\u05DC \u05DB\u05DC \u05D4\u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05D1\u05E9\u05E0\u05D4."), /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-xl border border-rose-100 p-3 text-sm font-bold text-slate-700 mb-2",
    style: {
      direction: 'rtl'
    }
  }, "(\u05E2\u05DC\u05D5\u05EA \u05DC\u05E0\u05D5\u05E1\u05E2 \u05D1\u05E7\u05D5 \u2212 \u05E2\u05DC\u05D5\u05EA \u05DE\u05DE\u05D5\u05E6\u05E2\u05EA \u05D1\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4) \xD7 \u05DE\u05DE\u05D5\u05E6\u05E2 \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05D1\u05E0\u05E1\u05D9\u05E2\u05D4 \xD7 \u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05D1\u05E9\u05D1\u05D5\u05E2 \xD7 52 \u05E9\u05D1\u05D5\u05E2\u05D5\u05EA"), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-600 text-xs leading-relaxed"
  }, "\u05D4\u05DE\u05E1\u05E4\u05E8 \u05DE\u05D5\u05E6\u05D2 \u05E8\u05E7 \u05DB\u05E9\u05D4\u05E2\u05DC\u05D5\u05EA \u05DC\u05E0\u05D5\u05E1\u05E2 \u05D2\u05D1\u05D5\u05D4\u05D4 \u05DE\u05D4\u05DE\u05DE\u05D5\u05E6\u05E2, \u05D5\u05D4\u05D5\u05D0 ", /*#__PURE__*/React.createElement("strong", null, "\u05D0\u05D5\u05DE\u05D3\u05DF \u05DC\u05D4\u05DE\u05D7\u05E9\u05D4 \u05D5\u05DC\u05D0 \u05E0\u05EA\u05D5\u05DF \u05EA\u05E7\u05E6\u05D9\u05D1\u05D9 \u05E8\u05E9\u05DE\u05D9"), ": \u05D4\u05E2\u05DC\u05D5\u05EA \u05DC\u05E0\u05D5\u05E1\u05E2 \u05DE\u05D2\u05D9\u05E2\u05D4 \u05DE\u05D3\u05D5\u05D7 \u05DE\u05E9\u05E8\u05D3 \u05D4\u05EA\u05D7\u05D1\u05D5\u05E8\u05D4 (\u05D9\u05D5\u05E0\u05D9 2026), \u05D4\u05D7\u05D9\u05E9\u05D5\u05D1 \u05DE\u05E0\u05D9\u05D7 \u05E9\u05D4\u05D9\u05D0 \u05D0\u05D7\u05D9\u05D3\u05D4 \u05DC\u05D0\u05D5\u05E8\u05DA \u05D4\u05E9\u05E0\u05D4, \u05D5\u05E7\u05D5\u05D5\u05D9\u05DD \u05E9\u05DB\u05D1\u05E8 \u05D1\u05D5\u05D8\u05DC\u05D5 \u05D0\u05D9\u05E0\u05DD \u05E0\u05E1\u05E4\u05E8\u05D9\u05DD. \u05DC\u05D7\u05D9\u05E6\u05D4 \u05E2\u05DC \u05DB\u05E4\u05EA\u05D5\u05E8 \u05D4-? \u05E9\u05DC\u05D9\u05D3 \u05D4\u05DE\u05E1\u05E4\u05E8 \u05D1\u05DB\u05DC \u05DB\u05E8\u05D8\u05D9\u05E1 \u05DE\u05E6\u05D9\u05D2\u05D4 \u05D0\u05EA \u05D4\u05D7\u05D9\u05E9\u05D5\u05D1 \u05D4\u05DE\u05DC\u05D0 \u05E2\u05DD \u05D4\u05DE\u05E1\u05E4\u05E8\u05D9\u05DD \u05E9\u05DC \u05D0\u05D5\u05EA\u05D5 \u05E7\u05D5.")), /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-2xl border border-rose-100 p-4"
  }, /*#__PURE__*/React.createElement("h4", {
    className: "font-black text-slate-800 text-sm mb-2"
  }, "\u05E9\u05DC\u05D1 4: \u05EA\u05D9\u05D5\u05D2 \u05E1\u05D8\u05D8\u05D5\u05E1"), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 md:grid-cols-5 gap-2 text-[11px] font-black"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl p-2 text-center"
  }, "0\u201324 \u05EA\u05E7\u05D9\u05DF"), /*#__PURE__*/React.createElement("div", {
    className: "bg-amber-50 border border-amber-200 text-amber-700 rounded-xl p-2 text-center"
  }, "25\u201344 \u05E1\u05D8\u05D9\u05D9\u05D4 \u05E7\u05DC\u05D4"), /*#__PURE__*/React.createElement("div", {
    className: "bg-orange-50 border border-orange-200 text-orange-600 rounded-xl p-2 text-center"
  }, "45\u201364 \u05D8\u05E2\u05D5\u05DF \u05D1\u05D3\u05D9\u05E7\u05D4"), /*#__PURE__*/React.createElement("div", {
    className: "bg-rose-50 border border-rose-200 text-rose-600 rounded-xl p-2 text-center"
  }, "65\u201379 \u05DC\u05D0 \u05D9\u05E2\u05D9\u05DC"), /*#__PURE__*/React.createElement("div", {
    className: "bg-rose-100 border border-rose-300 text-rose-700 rounded-xl p-2 text-center"
  }, "80+ \u05D7\u05DE\u05D5\u05E8")))), /*#__PURE__*/React.createElement("section", {
    className: "bg-amber-50/40 rounded-[2rem] p-6 border border-amber-100"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3 mb-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-amber-600 text-white p-2 rounded-xl"
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "chart",
    size: 18
  })), /*#__PURE__*/React.createElement("h3", {
    className: "text-xl font-black text-amber-700"
  }, "\u05E0\u05D9\u05EA\u05D5\u05D7 \u05D0\u05D6\u05D5\u05E8\u05D9")), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-700 font-medium text-sm mb-4 leading-relaxed"
  }, /*#__PURE__*/React.createElement("strong", null, "\u05DE\u05D4 \u05D4\u05D5\u05D0 \u05E2\u05D5\u05E9\u05D4:"), " \u05DE\u05E6\u05D9\u05D2 \u05DE\u05E4\u05EA \u05D7\u05D5\u05DD \u05D0\u05D6\u05D5\u05E8\u05D9\u05EA \u05E9\u05DC \u05D1\u05E2\u05D9\u05D5\u05EA \u05D9\u05E2\u05D9\u05DC\u05D5\u05EA \u2014 \u05DC\u05E4\u05D9 \u05E2\u05D9\u05E8 \u05D0\u05D5 \u05DC\u05E4\u05D9 \u05DE\u05D7\u05D5\u05D6. \u05E2\u05D5\u05D6\u05E8 \u05DC\u05D6\u05D4\u05D5\u05EA \u05D0\u05D6\u05D5\u05E8\u05D9\u05DD \u05D2\u05D9\u05D0\u05D5\u05D2\u05E8\u05E4\u05D9\u05D9\u05DD \u05E2\u05DD \u05E8\u05D9\u05DB\u05D5\u05D6 \u05D2\u05D1\u05D5\u05D4 \u05E9\u05DC \u05E7\u05D5\u05D5\u05D9\u05DD \u05D1\u05E2\u05D9\u05D9\u05EA\u05D9\u05D9\u05DD."), /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-2xl border border-amber-100 p-4"
  }, /*#__PURE__*/React.createElement("h4", {
    className: "font-black text-slate-800 text-sm mb-2"
  }, "\u05D0\u05D9\u05DA \u05D4\u05D7\u05D9\u05E9\u05D5\u05D1 \u05E2\u05D5\u05D1\u05D3"), /*#__PURE__*/React.createElement("ul", {
    className: "list-disc list-inside text-slate-600 text-sm space-y-1.5 pr-2"
  }, /*#__PURE__*/React.createElement("li", null, "\u05D4\u05E0\u05D9\u05EA\u05D5\u05D7 \u05DE\u05EA\u05D9\u05D9\u05D7\u05E1 ", /*#__PURE__*/React.createElement("strong", null, "\u05E8\u05E7 \u05DC\u05E7\u05D5\u05D5\u05D9\u05DD \u05E2\u05DD \u05E6\u05D9\u05D5\u05DF 80+"), " (\u05E1\u05D8\u05D8\u05D5\u05E1 \"\u05D7\u05DE\u05D5\u05E8 \u2014 \u05D3\u05D5\u05E8\u05E9 \u05D4\u05EA\u05E2\u05E8\u05D1\u05D5\u05EA\"), \u05DB\u05D3\u05D9 \u05DC\u05D6\u05E7\u05E7 \u05D0\u05EA \u05D4\u05EA\u05DE\u05D5\u05E0\u05D4."), /*#__PURE__*/React.createElement("li", null, "\u05DC\u05DB\u05DC \u05E2\u05D9\u05E8/\u05DE\u05D7\u05D5\u05D6 \u05E0\u05E1\u05DB\u05DE\u05D9\u05DD: \u05DE\u05E1\u05E4\u05E8 \u05D4\u05E7\u05D5\u05D5\u05D9\u05DD \u05D4\u05D7\u05DE\u05D5\u05E8\u05D9\u05DD, \u05E1\u05DA \u05D4\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA, \u05E1\u05DA \u05E7\"\u05DE \u05DE\u05D1\u05D5\u05D6\u05D1\u05D6, \u05DE\u05DE\u05D5\u05E6\u05E2 \u05E2\u05DC\u05D5\u05EA \u05EA\u05E4\u05E2\u05D5\u05DC\u05D9\u05EA, \u05D5\u05E1\u05DB\u05D5\u05DD \u05D4\u05E2\u05DC\u05D5\u05EA \u05D4\u05E2\u05D5\u05D3\u05E4\u05EA \u05D1\u05D0\u05D5\u05DE\u05D3\u05DF (\u05D4\u05E1\u05D1\u05E8 \u05DE\u05DC\u05D0 \u05D1\u05E1\u05E2\u05D9\u05E3 \u05DC\u05DE\u05E2\u05DC\u05D4). \u05E7\u05D5\u05D5\u05D9\u05DD \u05E9\u05DB\u05D1\u05E8 \u05D1\u05D5\u05D8\u05DC\u05D5 \u05D0\u05D9\u05E0\u05DD \u05E0\u05E1\u05E4\u05E8\u05D9\u05DD."), /*#__PURE__*/React.createElement("li", null, "\u05DC\u05D7\u05D9\u05E6\u05D4 \u05E2\u05DC \u05D0\u05D6\u05D5\u05E8 \u05DE\u05E2\u05D1\u05D9\u05E8\u05D4 \u05D9\u05E9\u05D9\u05E8\u05D5\u05EA \u05DC\u05D8\u05D0\u05D1 \"\u05E7\u05D5\u05D5\u05D9\u05DD \u05DC\u05D0 \u05D9\u05E2\u05D9\u05DC\u05D9\u05DD\" \u05E2\u05DD \u05E4\u05D9\u05DC\u05D8\u05E8 \u05DE\u05EA\u05D0\u05D9\u05DD.")))), /*#__PURE__*/React.createElement("section", {
    className: "bg-indigo-50/40 rounded-[2rem] p-6 border border-indigo-100"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3 mb-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-indigo-600 text-white p-2 rounded-xl"
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "list",
    size: 18
  })), /*#__PURE__*/React.createElement("h3", {
    className: "text-xl font-black text-indigo-700"
  }, "\u05DB\u05DC \u05D4\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05D1\u05DE\u05E2\u05E8\u05DB\u05EA")), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-700 font-medium text-sm mb-4 leading-relaxed"
  }, /*#__PURE__*/React.createElement("strong", null, "\u05DE\u05D4 \u05D4\u05D5\u05D0 \u05E2\u05D5\u05E9\u05D4:"), " \u05D8\u05D1\u05DC\u05D4 \u05DE\u05DC\u05D0\u05D4 \u05E9\u05DC \u05DB\u05DC \u05D4\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05D1\u05DE\u05E2\u05E8\u05DB\u05EA, \u05E2\u05DD \u05D0\u05E4\u05E9\u05E8\u05D5\u05EA \u05DC\u05E1\u05D9\u05E0\u05D5\u05DF, \u05D7\u05D9\u05E4\u05D5\u05E9 \u05D5\u05DE\u05D9\u05D5\u05DF. \u05E9\u05D9\u05DE\u05D5\u05E9\u05D9 \u05DC\u05D0\u05D9\u05EA\u05D5\u05E8 \u05E0\u05E7\u05D5\u05D3\u05EA\u05D9 \u05E9\u05DC \u05E0\u05E1\u05D9\u05E2\u05D4 \u05E1\u05E4\u05E6\u05D9\u05E4\u05D9\u05EA \u05D0\u05D5 \u05DC\u05D1\u05D7\u05D9\u05E0\u05EA \u05E2\u05D5\u05DE\u05E1 \u05D1\u05E2\u05D9\u05E8 \u05DE\u05E1\u05D5\u05D9\u05DE\u05EA."), /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-2xl border border-indigo-100 p-4"
  }, /*#__PURE__*/React.createElement("h4", {
    className: "font-black text-slate-800 text-sm mb-2"
  }, "\u05E4\u05D9\u05DC\u05D8\u05E8\u05D9\u05DD \u05D6\u05DE\u05D9\u05E0\u05D9\u05DD"), /*#__PURE__*/React.createElement("ul", {
    className: "list-disc list-inside text-slate-600 text-sm space-y-1.5 pr-2"
  }, /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "\u05D7\u05D9\u05E4\u05D5\u05E9 \u05E2\u05D9\u05E8:"), " \u05DE\u05E1\u05E0\u05DF \u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05E9\u05E2\u05D5\u05D1\u05E8\u05D5\u05EA \u05D3\u05E8\u05DA \u05E2\u05D9\u05E8 \u05DE\u05E1\u05D5\u05D9\u05DE\u05EA (\u05DE\u05D5\u05E6\u05D0, \u05D9\u05E2\u05D3, \u05D0\u05D5 \u05D3\u05E8\u05DA). \u05D4\u05E1\u05D9\u05E0\u05D5\u05DF \u05DE\u05EA\u05D1\u05E6\u05E2 \u05D1\u05D4\u05E7\u05E9\u05EA Enter."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "\u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05E2\u05DE\u05D5\u05E1\u05D5\u05EA:"), " \u05D8\u05D5\u05D2\u05DC \u05E9\u05DE\u05E1\u05E0\u05DF \u05E8\u05E7 \u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05E2\u05DD \u05E0\u05D9\u05E6\u05D5\u05DC\u05EA \u05DE\u05E2\u05DC 80% \u05DE\u05E7\u05D9\u05D1\u05D5\u05DC\u05EA \u05D4\u05E8\u05DB\u05D1."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "\u05E1\u05D5\u05D2 \u05E7\u05D5:"), " \u05E1\u05D9\u05E0\u05D5\u05DF \u05DC\u05E4\u05D9 \u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D9\u05EA \u05D4\u05E7\u05D5 (\u05E2\u05D9\u05E8\u05D5\u05E0\u05D9 / \u05D1\u05D9\u05E0\u05E2\u05D9\u05E8\u05D5\u05E0\u05D9 / \u05D0\u05D6\u05D5\u05E8\u05D9 \u05D5\u05DB\u05D5')."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "\u05DE\u05D9\u05D5\u05DF:"), " \u05DC\u05E4\u05D9 \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05D0\u05D5 \u05E2\u05D5\u05DE\u05E1 \u05E9\u05D9\u05D0 \u2014 \u05E2\u05D5\u05DC\u05D4 \u05D0\u05D5 \u05D9\u05D5\u05E8\u05D3.")))), /*#__PURE__*/React.createElement("section", {
    className: "bg-slate-50 rounded-[2rem] p-6 border border-slate-200"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3 mb-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-slate-900 text-white p-2 rounded-xl"
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "zap",
    size: 18
  })), /*#__PURE__*/React.createElement("h3", {
    className: "text-xl font-black text-slate-900"
  }, "\u05D0\u05DC\u05D2\u05D5\u05E8\u05D9\u05EA\u05DD \u05D9\u05D9\u05E2\u05D5\u05DC (\u05E1\u05D9\u05DE\u05D5\u05DC\u05D8\u05D5\u05E8)")), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-700 font-medium text-sm mb-4 leading-relaxed"
  }, /*#__PURE__*/React.createElement("strong", null, "\u05DE\u05D4 \u05D4\u05D5\u05D0 \u05E2\u05D5\u05E9\u05D4:"), " \u05DE\u05E7\u05D1\u05DC \u05E7\u05D5 \u05DE\u05E1\u05D5\u05D9\u05DD \u05D5\u05DE\u05E6\u05D9\u05D2 \u05D4\u05DE\u05DC\u05E6\u05D5\u05EA \u05E4\u05E2\u05D5\u05DC\u05D4 \u05DC\u05DB\u05DC \u05E0\u05E1\u05D9\u05E2\u05D4: ", /*#__PURE__*/React.createElement("strong", null, "\u05D0\u05D9\u05D7\u05D5\u05D3"), " \u05E9\u05EA\u05D9 \u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05E6\u05DE\u05D5\u05D3\u05D5\u05EA, ", /*#__PURE__*/React.createElement("strong", null, "\u05D1\u05D9\u05D8\u05D5\u05DC"), " \u05E0\u05E1\u05D9\u05E2\u05EA \u05E1\u05E8\u05E7, \u05D0\u05D5 ", /*#__PURE__*/React.createElement("strong", null, "\u05D4\u05E9\u05D0\u05E8\u05D4"), ". \u05DB\u05DC \u05D4\u05DE\u05DC\u05E6\u05D4 \u05DB\u05D5\u05DC\u05DC\u05EA \u05E0\u05D9\u05DE\u05D5\u05E7 \u05D5\u05D4\u05E9\u05E4\u05E2\u05D4 \u05E6\u05E4\u05D5\u05D9\u05D4."), /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-2xl border border-slate-200 p-4 mb-3"
  }, /*#__PURE__*/React.createElement("h4", {
    className: "font-black text-slate-800 text-sm mb-2"
  }, "\u05EA\u05E0\u05D0\u05D9 \u05D0\u05D9\u05D7\u05D5\u05D3"), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-600 text-sm leading-relaxed mb-2"
  }, "\u05D4\u05DE\u05E2\u05E8\u05DB\u05EA \u05DE\u05D7\u05E4\u05E9\u05EA \u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05E6\u05DE\u05D5\u05D3\u05D5\u05EA \u05E9\u05E0\u05D9\u05EA\u05DF \u05DC\u05D0\u05D7\u05D3 \u05D1\u05DC\u05D9 \u05DC\u05D2\u05E8\u05D5\u05DD \u05DC\u05E2\u05D5\u05DE\u05E1. \u05D4\u05E1\u05E3 \u05D4\u05D6\u05DE\u05E0\u05D9:"), /*#__PURE__*/React.createElement("ul", {
    className: "list-disc list-inside text-slate-600 text-sm space-y-1 pr-2 mb-3"
  }, /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "\u05E2\u05D9\u05E8\u05D5\u05E0\u05D9:"), " \u05E2\u05D3 30 \u05D3\u05E7\u05D5\u05EA \u05E4\u05E2\u05E8."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "\u05D1\u05D9\u05DF-\u05E2\u05D9\u05E8\u05D5\u05E0\u05D9:"), " \u05E2\u05D3 \u05E9\u05E2\u05D4."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "\u05D0\u05D6\u05D5\u05E8\u05D9:"), " \u05E2\u05D3 3 \u05E9\u05E2\u05D5\u05EA (\u05D0\u05D5 \u05DC\u05E4\u05D9 \u05D6\u05DE\u05DF \u05D4\u05DE\u05EA\u05E0\u05D4 \u05D9\u05D3\u05E0\u05D9).")), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-700 font-bold text-sm mb-1"
  }, "\u05E1\u05E3 \u05E1\u05DA \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05DC\u05D0\u05D9\u05D7\u05D5\u05D3 (\u05DE\u05EA\u05D0\u05D9\u05DD \u05DC\u05E7\u05D9\u05D1\u05D5\u05DC\u05EA \u05D4\u05E8\u05DB\u05D1):"), /*#__PURE__*/React.createElement("ul", {
    className: "list-none text-slate-600 text-sm space-y-1 pr-2"
  }, /*#__PURE__*/React.createElement("li", null, "\u2022 ", /*#__PURE__*/React.createElement("strong", null, "\u05DE\u05D9\u05E0\u05D9\u05D1\u05D5\u05E1 (19):"), " \u05E2\u05D3 ~7 \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05D9\u05D7\u05D3."), /*#__PURE__*/React.createElement("li", null, "\u2022 ", /*#__PURE__*/React.createElement("strong", null, "\u05DE\u05D9\u05D3\u05D9\u05D1\u05D5\u05E1 (35):"), " \u05E2\u05D3 ~13."), /*#__PURE__*/React.createElement("li", null, "\u2022 ", /*#__PURE__*/React.createElement("strong", null, "\u05E8\u05D2\u05D9\u05DC (50):"), " \u05E2\u05D3 ~18\u201320."), /*#__PURE__*/React.createElement("li", null, "\u2022 ", /*#__PURE__*/React.createElement("strong", null, "\u05DE\u05E4\u05E8\u05E7\u05D9 (90):"), " \u05E2\u05D3 ~32\u201336."))), /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-2xl border border-slate-200 p-4"
  }, /*#__PURE__*/React.createElement("h4", {
    className: "font-black text-slate-800 text-sm mb-2"
  }, "\u05EA\u05E0\u05D0\u05D9 \u05D1\u05D9\u05D8\u05D5\u05DC"), /*#__PURE__*/React.createElement("ul", {
    className: "list-disc list-inside text-slate-600 text-sm space-y-2 pr-2"
  }, /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "\u05E8\u05E3 \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05E0\u05DE\u05D5\u05DA:"), " ~5 \u05E0\u05D5\u05E1\u05E2\u05D9\u05DD \u05D1\u05D0\u05D5\u05D8\u05D5\u05D1\u05D5\u05E1 \u05E8\u05D2\u05D9\u05DC \u05DC\u05E2\u05D9\u05E8\u05D5\u05E0\u05D9, ~3 \u05DC\u05D0\u05D6\u05D5\u05E8\u05D9. \u05D1\u05E8\u05DB\u05D1\u05D9\u05DD \u05E7\u05D8\u05E0\u05D9\u05DD \u05D4\u05E8\u05E3 \u05D9\u05D5\u05E8\u05D3, \u05D1\u05DE\u05E4\u05E8\u05E7\u05D9 \u05D4\u05D5\u05D0 \u05E2\u05D5\u05DC\u05D4."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "\u05D7\u05DC\u05D5\u05E4\u05D4 \u05D6\u05DE\u05D9\u05E0\u05D4 \u05D7\u05D5\u05D1\u05D4:"), " \u05E2\u05D3 15 \u05D3\u05E7' \u05D1\u05E2\u05D9\u05E8\u05D5\u05E0\u05D9, \u05E9\u05E2\u05D4 \u05D1\u05D1\u05D9\u05DF-\u05E2\u05D9\u05E8\u05D5\u05E0\u05D9, \u05D0\u05D5 \u05E2\u05D3 4 \u05E9\u05E2\u05D5\u05EA \u05D1\u05D0\u05D6\u05D5\u05E8\u05D9."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "\u05D4\u05D2\u05E0\u05EA \u05E8\u05E9\u05EA (\u05D0\u05D6\u05D5\u05E8\u05D9\u05D9\u05DD):"), " \u05D0\u05DC\u05D2\u05D5\u05E8\u05D9\u05EA\u05DD \u05D4\u05D1\u05D9\u05D8\u05D5\u05DC \u05E0\u05E2\u05E6\u05E8 \u05D0\u05DD \u05EA\u05E8\u05D3 \u05DE\u05EA\u05D7\u05EA \u05DC-3 \u05E0\u05E1\u05D9\u05E2\u05D5\u05EA \u05D1\u05D9\u05D5\u05DD \u2014 \u05DC\u05E9\u05DE\u05D5\u05E8 \u05E2\u05DC \u05E7\u05D5 \u05D7\u05D9\u05D9\u05DD \u05D1\u05E1\u05D9\u05E1\u05D9."), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("strong", null, "\u05D4\u05D2\u05E0\u05D4 \u05E2\u05DC \u05E0\u05E1\u05D9\u05E2\u05D4 \u05E8\u05D0\u05E9\u05D5\u05E0\u05D4/\u05D0\u05D7\u05E8\u05D5\u05E0\u05D4 \u05D1\u05D9\u05D5\u05DD:"), " \u05DC\u05E2\u05D5\u05DC\u05DD \u05DC\u05D0 \u05EA\u05D5\u05E6\u05E2 \u05DC\u05D1\u05D9\u05D8\u05D5\u05DC, \u05D2\u05DD \u05D0\u05DD \u05E8\u05D9\u05E7\u05D4."))))), /*#__PURE__*/React.createElement("div", {
    className: "mt-12 bg-indigo-50/50 p-6 md:p-8 rounded-[2rem] border border-indigo-100 flex flex-col items-center text-center"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "font-black text-slate-900 text-lg mb-2"
  }, "\u05D0\u05D5\u05D3\u05D5\u05EA \u05D4\u05E4\u05E8\u05D5\u05D9\u05E7\u05D8"), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-600 text-sm font-medium leading-relaxed max-w-lg mb-5"
  }, "\u05D4\u05E4\u05E8\u05D5\u05D9\u05E7\u05D8 \u05D4\u05D5\u05E7\u05DD \u05D1\u05D4\u05EA\u05E0\u05D3\u05D1\u05D5\u05EA \u05D5\u05DC\u05DC\u05D0 \u05DB\u05D5\u05D5\u05E0\u05D5\u05EA \u05E8\u05D5\u05D5\u05D7.", /*#__PURE__*/React.createElement("br", null), "\u05E0\u05D1\u05E0\u05D4 \u05E2\u05DC \u05D9\u05D3\u05D9 ", /*#__PURE__*/React.createElement("strong", {
    className: "text-slate-900"
  }, "\u05E9\u05DC\u05DE\u05D4 \u05D4\u05E8\u05D8\u05DE\u05DF"), " \u05D1\u05E9\u05D9\u05DC\u05D5\u05D1 \u05DE\u05D5\u05D3\u05DC \u05D4\u05D1\u05D9\u05E0\u05D4 \u05D4\u05DE\u05DC\u05D0\u05DB\u05D5\u05EA\u05D9\u05EA ", /*#__PURE__*/React.createElement("strong", {
    className: "text-slate-900"
  }, "Gemini"), "."), /*#__PURE__*/React.createElement("div", {
    className: "bg-white border-2 border-indigo-100 text-slate-700 px-6 py-3 rounded-xl font-black shadow-sm flex flex-col md:flex-row items-center gap-2"
  }, /*#__PURE__*/React.createElement("span", null, "\u05DC\u05D4\u05E6\u05E2\u05D5\u05EA \u05D5\u05DC\u05E9\u05D9\u05E4\u05D5\u05E8\u05D9\u05DD:"), /*#__PURE__*/React.createElement("a", {
    href: "mailto:shlomihartman@gmail.com",
    className: "text-indigo-600 hover:underline",
    dir: "ltr"
  }, "shlomihartman@gmail.com")))))));
}