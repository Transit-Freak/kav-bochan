/* קו פח · 02-inputs.jsx — שדות קלט: רשימת הערים (CitiesDatalist) ושדה החיפוש (SearchInput).
   חלק מ-kavpach/src (הסדר ב-files.json). כל החלקים מחוברים לפי הסדר ומקומפלים יחד (tools/build_kavpach.mjs → KavPach.js),
   כך שכל השמות משותפים בין החלקים כמו בקובץ אחד. */

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
    clearTimeout(timer.current);
    setLocal('');
    submit('');
  };
  const handleKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    if (e.key === 'Escape') { e.preventDefault(); clear(); }
  };
  // בטלפון (מקלדות אנדרואיד בעברית) Enter לא תמיד מגיע כאירוע מקש — שלמה 30.09:
  // "החיפוש בקו פח הפסיק לעבוד". לכן גם טופס (כפתור "חיפוש" במקלדת שולח submit),
  // וגם חיפוש אוטומטי אחרי הפסקה קצרה בהקלדה.
  const timer = React.useRef(null);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  const onChange = (e) => {
    const v = e.target.value;
    setLocal(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => submit(v), 800);
  };
  const isDirty = local.trim() !== (value || '');
  return (
    <form className="relative w-full" onSubmit={e => { e.preventDefault(); clearTimeout(timer.current); submit(); }} role="search">
      <input
        type="search"
        enterKeyHint="search"
        value={local}
        onChange={onChange}
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
        <div className="absolute -bottom-5 right-2 text-[10px] font-bold text-slate-500">מחפש…</div>
      )}
    </form>
  );
});
