/* קו פח · 05-shared-ui.jsx — רכיבים משותפים לשני הכלים: לוח הגדרות הניקוד, קיבולת וימים, תגיות מק"ט, נוסעים לפי רבעון, הפס העליון.
   חלק מ-kavpach/src (הסדר ב-files.json). כל החלקים מחוברים לפי הסדר ומקומפלים יחד (tools/build_kavpach.mjs → KavPach.js),
   כך שכל השמות משותפים בין החלקים כמו בקובץ אחד. */

// לוח ההגדרות — משותף לשני הכלים. rows: [{ key, label, hint, params: [{ k, label, auto, unit, min, max, step }] }]
function ScoreSettingsPanel({ title, intro, settings, update, reset, isDefault, rows, extras, footnote, accent }) {
  const [open, setOpen] = useState(false);
  const maxSum = maxSumOf(settings.c);
  const ac = accent || 'amber';
  const setC = (key, k, v) => update(s => ({ ...s, c: { ...s.c, [key]: { ...s.c[key], [k]: v } } }));
  return (
    <div className={`bg-white border-2 border-${ac}-200 rounded-[2rem] shadow-sm overflow-hidden`}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-6 py-4 text-right">
        <span className="font-black text-slate-900 text-base">⚙️ {title}{!isDefault && <span className={`mr-2 text-[11px] font-black bg-${ac}-100 text-${ac}-800 border border-${ac}-300 rounded-full px-2 py-0.5`}>הגדרות שלך</span>}</span>
        <span className="text-slate-500 font-black text-sm shrink-0">{open ? '▲ סגירה' : '▼ פתיחה'}</span>
      </button>
      {open && (
        <div className="px-6 pb-6 space-y-4">
          <p className="text-slate-600 font-bold text-sm leading-relaxed">{intro}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] font-black text-slate-500 border-b border-slate-200">
                  <th className="text-right py-2 pl-2">נספר?</th>
                  <th className="text-right py-2">מה נמדד</th>
                  <th className="text-right py-2">כמה נקודות לכל היותר</th>
                  <th className="text-right py-2">הסף (ריק = אוטומטי)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const c = settings.c[r.key];
                  return (
                    <tr key={r.key} className={`border-b border-slate-100 align-top ${c.on ? '' : 'opacity-50'}`}>
                      <td className="py-2.5 pl-2"><input type="checkbox" checked={!!c.on} onChange={e => setC(r.key, 'on', e.target.checked)} className="w-4 h-4 accent-amber-600" aria-label={`לספור: ${r.label}`} /></td>
                      <td className="py-2.5 pl-3">
                        <div className="font-black text-slate-900">{r.label}</div>
                        {r.hint && <div className="text-[11px] font-bold text-slate-500 leading-snug max-w-xs">{r.hint}</div>}
                      </td>
                      <td className="py-2.5 pl-3">
                        <NumField value={c.max} onChange={v => setC(r.key, 'max', v == null ? 0 : Math.max(0, Math.min(100, v)))} min={0} max={100} suffix="נק׳" title="כמה נקודות הרכיב הזה נותן כשהוא במלואו" />
                      </td>
                      <td className="py-2.5">
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                          {(r.params || []).map(p => (
                            <label key={p.k} className="inline-flex items-center gap-2 text-[12px] font-bold text-slate-700">
                              <span>{p.label}</span>
                              <NumField value={c[p.k]} onChange={v => setC(r.key, p.k, v)} placeholder={p.auto || 'אוטו'} min={p.min} max={p.max} step={p.step} suffix={p.unit} width={p.width} title={p.title} />
                            </label>
                          ))}
                          {!(r.params || []).length && <span className="text-[11px] font-bold text-slate-400">—</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {extras}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="text-[12px] font-bold text-slate-600">
              סה"כ נקודות אפשריות: <b className="text-slate-900">{maxSum}</b>
              {maxSum !== 100 && maxSum > 0 && <span> · הציון מנורמל ל-100 (כל רכיב שווה {Math.round(100 / maxSum * 100) / 100} מנקודותיו)</span>}
              {maxSum === 0 && <span className="text-rose-600"> · כל הרכיבים כבויים — אין ציון</span>}
            </div>
            <button type="button" onClick={reset} disabled={isDefault}
              className={`px-4 py-2 rounded-xl text-xs font-black border-2 ${isDefault ? 'border-slate-200 text-slate-400' : 'border-slate-900 text-slate-900 hover:bg-slate-900 hover:text-white'}`}>
              ↺ חזרה לברירת המחדל של האתר
            </button>
          </div>
          {footnote && <p className="text-[11px] font-bold text-slate-500 leading-relaxed">{footnote}</p>}
        </div>
      )}
    </div>
  );
}

// "איך זה מחושב" (26.11) — הפירוט הארוך מקופל, כדי שהטקסט הגלוי יישאר קצר
const HowCalc = ({ children, className }) => (
  <details className={`text-xs text-slate-500 font-bold leading-relaxed ${className || 'mt-3'}`}>
    <summary className="cursor-pointer font-black text-slate-600 select-none">איך זה מחושב</summary>
    <div className="mt-2 space-y-1.5">{children}</div>
  </details>
);

// תג עם הסבר (26.11): בטלפון אין ריחוף, אז לחיצה על התג מציגה את ההסבר מתחתיו
const TipBadge = ({ className, tip, children }) => {
  const [o, setO] = useState(false);
  return (
    <span className="inline-flex flex-col items-start max-w-full">
      <button type="button" className={className + ' cursor-pointer'} title={tip} aria-expanded={o}
        onClick={(e) => { e.stopPropagation(); setO(x => !x); }}>{children}</button>
      {o && <span className="text-[10px] font-bold text-slate-600 mt-1 leading-snug" style={{ maxWidth: '16rem' }}>{tip}</span>}
    </span>
  );
};

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



// רכיב לעיצוב המק"ט, הכיוון והחלופה בתגיות ברורות (Badge style)
// שקלים בקריאה אנושית: 12,400 → "12.4 אלף ₪", 3,180,000 → "3.2 מיליון ₪"
const fmtShekels = (v) => {
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + ' מיליון ₪';
  if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + ' אלף ₪';
  return Math.round(v).toLocaleString() + ' ₪';
};

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

// ── נוסעים לפי רבעון (שלמה 23.10) — ממאגר "נסועה בקווי אוטובוס" של משרד התחבורה ──
// kavpach-ridership.json (tools/kavpach_ridership.py, פעם בשבוע): לכל מק"ט — נוסעים בשבוע לכל רבעון,
// והמלצת המשרד מהרבעון האחרון. נטען פעם אחת, ברקע; קו בלי נתונים — בלי התיבה.
let RIDE_P = null;
const loadRide = () => RIDE_P || (RIDE_P = fetch('kavpach-ridership.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null));
const QHE = ['', 'א', 'ב', 'ג', 'ד'];
const RidershipBlock = ({ makat }) => {
  const [d, setD] = useState(null);
  useEffect(() => { let on = true; loadRide().then(x => { if (on) setD(x); }); return () => { on = false; }; }, []);
  const mk = String(makat || '').replace(/^0+/, '');
  const e = d && d.m && d.m[mk];
  if (!e) return null;
  const pts = e.w.map((v, i) => [d.q[i], v]).filter(p => p[1] != null);
  if (pts.length < 2) return null;
  const [lq, lv] = pts[pts.length - 1];
  const ly = +lq.slice(0, 4), lqn = +lq.slice(-1);
  // מגמה: מול אותו רבעון בשנה שעברה; אם אין — מול הרבעון הקודם שיש לו נתונים
  const yago = pts.find(p => p[0] === (ly - 1) + '-Q' + lqn);
  const base = yago || pts[pts.length - 2];
  const pct = base[1] > 0 ? Math.round((lv / base[1] - 1) * 100) : null;
  const up = pct != null && pct >= 0;
  const mx = Math.max(...pts.map(p => p[1]), 1);
  const lab = q => QHE[+q.slice(-1)] + '/' + q.slice(2, 4);
  const rec = e.rec ? e.rec.replace(/^לבחון ביטול\/דילול\/שינוי /, '') : '';
  return (
    <div className="mt-4 rounded-2xl border border-slate-200 p-3" style={{ direction: 'rtl' }}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="font-black text-slate-800" style={{ fontSize: 12.5 }}>נוסעים בשבוע לפי רבעון</span>
        {pct != null && <span className="font-black rounded-full" style={{ fontSize: 11, padding: '2px 8px', whiteSpace: 'nowrap', background: up ? '#dcfce7' : '#fee2e2', color: up ? '#166534' : '#991b1b' }}>
          {up ? '↑' : '↓'} {Math.abs(pct)}% {yago ? 'משנה שעברה' : 'מהרבעון הקודם'}</span>}
      </div>
      <div className="flex items-end gap-1" style={{ height: 78 }}>
        {pts.map(([q, v], i) => (
          <div key={q} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
            <div className="font-bold text-slate-500" style={{ fontSize: 9.5 }}>{v >= 1000 ? (v / 1000).toFixed(1) + 'K' : v}</div>
            <div className="w-full rounded" style={{ maxWidth: 22, height: Math.max(3, Math.round(v / mx * 46)), background: i === pts.length - 1 ? (up ? '#16a34a' : '#dc2626') : '#cbd5e1' }} />
            <div className="text-slate-500" style={{ fontSize: 9.5, whiteSpace: 'nowrap' }}>{lab(q)}</div>
          </div>))}
      </div>
      {(rec || e.add) && <div className="text-slate-700 mt-2" style={{ fontSize: 11.5 }}><b>משרד התחבורה ({lab(lq)}):</b> {rec ? 'לבחון ביטול, דילול או שינוי — ' + rec : 'מסומן לתגבור (דרגה ' + e.add + ' מתוך 3)'}</div>}
      <div className="text-slate-400 mt-1" style={{ fontSize: 10 }}>{lab(lq)} = רבעון {QHE[lqn]}׳ של {ly} · מקור: "נסועה בקווי אוטובוס", משרד התחבורה · כל הכיוונים יחד</div>
    </div>
  );
};

// ── המראה של קו פח והקו המוזהב (שלמה 06.11) — כמו דף הבית: פס עליון שקוף עם "הקו הבוחן" ושם הכלי,
// הסמל הגדול של הכלי (KBH.ICON מ-home/home.js) וכותרת. העיצוב עצמו ב-home/home.css, תחת .kbt.
// כפתור "חזרה לקו הבוחן" יושב בתוך הפס (לא צף מעל הכותרת בטלפון).
const KbToolBar = ({ name, onHome }) => {
  const home = (e) => { if (!plainClick(e)) return; e.preventDefault(); onHome(); };
  return (
    <header className="kbt-bar">
      <div className="kbt-bar-in">
        <span className="kbt-crumbs" data-kb-chrome="">
          <span className="kbt-brand">הקו הבוחן</span>
          <span className="kbt-slash" aria-hidden="true">/</span>
          <span className="kbt-tool">{name}</span>
        </span>
        {/* כפתור הנגישות (a11y.js) נכנס לכאן — בתוך הפס, לא צף. React לא מצייר בו ילדים, אז הכפתור לא נמחק ברינדור */}
        <span data-a11y-slot="" style={{ display: 'inline-flex', flex: 'none', width: 44, height: 44 }} />
        <a href="./" onClick={home} className="kb-home" title="חזרה לעמוד הראשי">← חזרה לקו הבוחן</a>
      </div>
    </header>
  );
};
const KbToolIcon = ({ k }) => {
  const html = useMemo(() => { try { return window.KBH.ICON[k](); } catch (e) { return ''; } }, [k]);
  useEffect(() => { try { window.KBH.ensureDefs(); } catch (e) { /* בלי home.js — בלי סמל */ } }, []);
  return <div className="kbt-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />;
};
