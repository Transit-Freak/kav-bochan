/* קו פח · 01-core.jsx — בסיס: ניקוד החפיפות, ה-hooks של React, קישורי הלשוניות (#פח/…), טעינת ספריית האקסל לפי דרישה, yieldFrame.
   חלק מ-kavpach/src (הסדר ב-files.json). כל החלקים מחוברים לפי הסדר ומקומפלים יחד (tools/build_kavpach.mjs → KavPach.js),
   כך שכל השמות משותפים בין החלקים כמו בקובץ אחד. */
function kavPachOverlapScore(row) {
  const stops = row?.[3], shape = row?.[5], route = shape?.selfPct;
  if (shape?.status !== 'estimated' || !Number.isFinite(stops) || !Number.isFinite(route) ||
      stops < 0 || stops > 100 || route < 0 || route > 100) return null;
  return (stops + route) / 2;
}
function kavPachVisibleOverlaps(rows) {
  return (rows || []).filter(row => {
    const score = kavPachOverlapScore(row);
    return score !== null && score >= 50;
  }).sort((a,b) => kavPachOverlapScore(b) - kavPachOverlapScore(a));
}

const { useState, useMemo, useEffect, useCallback, useRef } = React;

// קישור אמיתי (<a href>) לכל מה שפותח מסך אחר — כדי שאפשר יהיה לפתוח בלשונית חדשה
// (Ctrl/אמצעית/לחיצה ארוכה בטלפון). לחיצה רגילה נשארת ניווט בתוך הדף.
const plainClick = (e) => !(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button);
// לשוניות בקישור: ‎#פח/areas‎ · ‎#מוזהב/allTrips‎ (הלשונית הראשונה — בלי סיומת)
// שדה סינון פעיל — מסגרת כחולה (סגנון home.css דורס את מחלקות המסגרת של Tailwind)
const ACTIVE_FILTER_STYLE = { borderColor: '#2563eb', borderWidth: 2 };
// למה נסיעה חלשה נשארת אחרי ההמלצות (אלגוריתם ייעול)
const KM_REASONS = [
  ['edge', 'נסיעה ראשונה או אחרונה ביום (לא מבטלים)'],
  ['noalt', 'אין נסיעה אחרת קרובה בשעה הזו'],
  ['min', 'מינימום נסיעות ביום לקו'],
  ['above', 'מעט נוסעים, אבל יותר מרף הביטול'],
  ['merge', 'גם אחרי האיחוד מעט נוסעים'],
];
const KP_TABS = ['redundant', 'areas', 'allTrips', 'simulator', 'deadhead', 'about'];
const GOLD_TABS = ['top', 'areas', 'expand', 'allTrips', 'about'];
const tabHref = (base, tabs, t) => '#' + base + (t === tabs[0] ? '' : '/' + t);
// מעדכן את הכתובת ללשונית הנוכחית בלי רשומה חדשה בהיסטוריה (כמו קודם: Back לא עובר בין לשוניות)
const syncTabHash = (base, tabs, t) => {
  try {
    const h = decodeURIComponent((location.hash || '').replace('#', '').trim());
    if (/\/קו\//.test(h)) return;                       // קישור לקו בודד — לא דורסים
    const cur = h.split('/')[1] || tabs[0];
    if (cur === t) return;
    history.replaceState(history.state, '', tabHref(base, tabs, t));
  } catch (e) { /* ignore */ }
};

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
// רשת ביטחון לכל הדף (שלמה 18.10): בלי זה, שגיאה בכל רכיב מורידה את העמוד כולו ומשאירה דף ריק.
// עם זה מוצגת הודעה קצרה עם כפתור רענון, והשגיאה נכתבת לקונסול.
class RootSafe extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error('RootSafe:', err, info && info.componentStack); }
  render() {
    if (!this.state.err) return this.props.children;
    return <div dir="rtl" style={{ maxWidth: 520, margin: '15vh auto', padding: '24px 20px', textAlign: 'center', font: '16px/1.6 system-ui, sans-serif' }}>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>משהו השתבש בדף</div>
      <div style={{ opacity: .75, marginBottom: 16 }}>רענון של הדף בדרך כלל פותר את זה.</div>
      <button type="button" onClick={() => location.reload()} style={{ font: 'inherit', fontWeight: 700, padding: '10px 22px', borderRadius: 12, border: 0, background: '#0f172a', color: '#fff', cursor: 'pointer' }}>רענון</button>
    </div>;
  }
}
if (typeof window !== 'undefined') window.RootSafe = RootSafe;   // index.html עוטף בו את KavPach

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
