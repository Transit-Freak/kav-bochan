/* קו פח · 04-helpers-settings.jsx — עזרי זמן ותקופה, קטגוריית קו, הגדרות הניקוד שנשמרות בדפדפן (useStoredSettings) וברירות המחדל.
   חלק מ-kavpach/src (הסדר ב-files.json). כל החלקים מחוברים לפי הסדר ומקומפלים יחד (tools/build_kavpach.mjs → KavPach.js),
   כך שכל השמות משותפים בין החלקים כמו בקובץ אחד. */

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

// (הסיווג, הבנצ'מרקים, ספי השפל ותוויות הסטטוס עברו ל-kavpach-core.js — משותף לאתר ולחישוב המוקדם ב-Actions)

// ── הגדרות ניקוד לבחירת המשתמש (שלמה 07.09: "שהמשתמש יוכל לבחור מה כמה כל
//    דבר נותן ציון, כמה אנשים בציון 10") ────────────────────────────────────
// כל רכיב ניקוד: דלוק/כבוי, כמה נקודות לכל היותר, וסף מספרי כשיש כזה
// (ריק = הסף האוטומטי של האתר, לפי קטגוריית הקו). הציון תמיד מנורמל
// ל-100 לפי סכום הנקודות של הרכיבים הדלוקים, כך שאפשר לשחק במשקלים בלי
// לחשב שהם מסתכמים ל-100. ההגדרות נשמרות בדפדפן הזה בלבד.
const mergeSettings = (dflt, saved) => {
  if (!saved || typeof saved !== 'object') return dflt;
  const out = { ...dflt };
  Object.keys(dflt).forEach(k => {
    const d = dflt[k], s = saved[k];
    if (d && typeof d === 'object' && !Array.isArray(d)) out[k] = mergeSettings(d, s);
    else if (s !== undefined && (typeof s === typeof d || s === null || d === null)) out[k] = s;
  });
  return out;
};
function useStoredSettings(key, defaults) {
  const [s, setS] = useState(() => {
    try { const raw = localStorage.getItem(key); if (raw) return mergeSettings(defaults, JSON.parse(raw)); } catch (e) { /* אין אחסון */ }
    return defaults;
  });
  const update = useCallback((fn) => setS(prev => {
    const next = fn(prev);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch (e) { /* אין אחסון */ }
    return next;
  }), [key]);
  const reset = useCallback(() => { try { localStorage.removeItem(key); } catch (e) { /* אין אחסון */ } setS(defaults); }, [key, defaults]);
  const isDefault = JSON.stringify(s) === JSON.stringify(defaults);
  return [s, update, reset, isDefault];
}

// שדה מספר קטן; ריק = אוטומטי
const NumField = ({ value, onChange, placeholder, min, max, step, width, suffix, title }) => (
  <span className="inline-flex items-center gap-1 whitespace-nowrap" title={title}>
    <input type="number" inputMode="decimal" value={value == null ? '' : value} placeholder={placeholder || ''}
      min={min} max={max} step={step || 1}
      onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
      className={`bg-white border-2 border-slate-200 rounded-xl px-2 py-1.5 font-black text-sm text-center outline-none focus:border-amber-500 ${width || 'w-20'}`} />
    {suffix ? <span className="text-[11px] font-bold text-slate-500">{suffix}</span> : null}
  </span>
);

// ברירות המחדל — בדיוק הניקוד שהאתר עבד איתו עד עכשיו
const GOLD_DEFAULTS = {
  entryRiders: 30, minScore: 60,
  c: {
    highTrips:   { on: true, max: 20 },
    efficientKm: { on: true, max: 15 },
    cost:        { on: true, max: 20, full: null },
    avgRiders:   { on: true, max: 15, full: null, half: null },
    peak:        { on: true, max: 10, full: null, half: null },
    volume:      { on: true, max: 20, full: null, half: null },
  },
};
const PACH_DEFAULTS = {
  minScore: 25,
  c: {
    lowTrips: { on: true, max: 30 },
    wastedKm: { on: true, max: 20 },
    cost:     { on: true, max: 20 },
    riders:   { on: true, max: 30, low: null, peak: null },
    deadhead: { on: true, max: 10 },   // הקו משמש להסעת רכבים במסווה (הלוך-חזור של אותו רכב תוך 15 דק', מהשידורים)
  },
  // הגנות — נקודות שמופחתות מהציון; 0 = ההגנה כבויה
  p: { exclusive: 15, train: 10, school: 10, prebook: 20, weekend: 10, newLine: 10, reduced: 10, noAlt: 10 },
};

// ניקוד נסיעות תפעוליות — אותה מסגרת כמו ציון אי-היעילות של קו: רכיבים עם
// נקודות לבחירת המשתמש, נרמול ל-100 לפי הרכיבים הדלוקים, הגנות שמופחתות
const DEADHEAD_DEFAULTS = {
  minScore: 25,
  c: {
    obs:   { on: true, max: 40 },   // כמה פעמים בשבוע נצפה הרכב עושה הלוך-חזור צמוד
    tight: { on: true, max: 20 },   // כמה מהר יצא חזרה (עד 5 דק' = מלוא הנקודות)
    hot:   { on: true, max: 30 },   // קו עמוס באזור באותה שעה
    crush: { on: true, max: 15 },   // ואם הקו הזה ממש נחנק (מעל הקיבולת) — צריך תגבור, והאוטובוס הריק נסע לידו
    empty: { on: true, max: 10 },   // נסיעת החזרה ריקה גם בספירות המשרד
  },
  // הגנות: קו לילה, סופ"ש, תצפית בודדת
  p: { night: 10, weekend: 10, rare: 10 },
};
