/* קו פח · 07-golden.jsx — GoldenApp — הכלי "הקו המוזהב": קווים מצטיינים, הלשוניות וההרחבה.
   חלק מ-kavpach/src (הסדר ב-files.json). כל החלקים מחוברים לפי הסדר ומקומפלים יחד (tools/build_kavpach.mjs → KavPach.js),
   כך שכל השמות משותפים בין החלקים כמו בקובץ אחד. */

// ── GoldenApp — כלי "הקו המוזהב": קווים מצטיינים ─────────────────────────
function GoldenApp({ onBack, trips, costBenchmarkTable, lineCitiesMap, liveOf, liveGen, focusMakat, onClearFocus, hashTab }) {
  const [goldenTab, setGoldenTab] = useState(() => (GOLD_TABS.includes(hashTab) ? hashTab : 'top'));
  useEffect(() => { if (GOLD_TABS.includes(hashTab)) setGoldenTab(hashTab); }, [hashTab]);
  useEffect(() => { syncTabHash('מוזהב', GOLD_TABS, goldenTab); }, [goldenTab]);
  const [filterDistrict, setFilterDistrict] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
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
  useEffect(() => { setExpandDir(null); }, [selectedLine && selectedLine.groupKey]);
  const [gTripsCity, setGTripsCity] = useState('');
  const [gTripsCrowded, setGTripsCrowded] = useState(false);
  const [gTripsSort, setGTripsSort] = useState({ key: 'peakLoad', direction: 'desc' });
  const [gTripsVisible, setGTripsVisible] = useState(80);
  const [areaFilter, setAreaFilter] = useState(null);
  // הגדרות הניקוד של המשתמש (שלמה 07.09) + סינון מספרי על הרשימה
  const [gset, updGset, resetGset, gsetDefault] = useStoredSettings('kb-golden-score', GOLD_DEFAULTS);
  const [gFilt, setGFilt] = useState({ minRiders: null, minTrips: null, maxCost: null, minPeak: null });
  const gFiltOn = Object.values(gFilt).some(v => v != null);

  // ניקוד מוזהב (0-100, גבוה יותר = טוב יותר) — ברוח הפוכה לניקוד קו פח,
  // אבל עם רכיבים ומשקולות משלו — לא "הפוך מדויק"
  const goldenLines = useMemo(() => {
    if (!trips || trips.length === 0) return [];

    const cityOnlyStr = (s) => s ? (s.indexOf(' - ') > 0 ? s.slice(0, s.indexOf(' - ')).trim() : s.split('/')[0].trim()) : '';
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

      const totalRiders = data.reduce((s, t) => s + (t.ridership * t.tripCount), 0);
      const avgRiders = totalTrips > 0 ? (totalRiders / totalTrips) : 0;
      const totalPeaks = data.reduce((s, t) => s + (t.peakLoad * t.tripCount), 0);
      const avgPeak = totalTrips > 0 ? (totalPeaks / totalTrips) : 0;

      // הקיבולת מחושבת לפני שער הכניסה, משוקללת בנסיעות — ממוצע פשוט על
      // שורות נתן משקל שווה לווריאנט של נסיעה אחת ולווריאנט של מאה
      const avgCapacity = (data.reduce((s, t) => s + (t.capacity || 50) * t.tripCount, 0) / (totalTrips || 1)) || 50;
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
        isFeeding: data[0].isFeedingLine,
      });
      // בקו המוזהב: סף = ממוצע ארצי × 1.5 לפי קטגוריה; לילה נשאר 25 כפי שנקבע
      const isUrban = category === 'עירוני תדירות גבוהה' || category === 'עירוני תדירות נמוכה';
      const GOLDEN_RIDER_THRESHOLD = {
        'עירוני תדירות גבוהה': 44,
        'עירוני תדירות נמוכה': 21,
        'בינעירוני ארוך':       26,
        'בינעירוני קצר':        22,
        'תלמידים':              23,
        'אזורי':                12,
        'קווים מזינים':         12,
        'לילה':                 25,
      };
      const lowRiderTh = GOLDEN_RIDER_THRESHOLD[category] ?? (LOW_RIDER_THRESHOLD[category] || 10);
      const costBenchmark = lookupCostBenchmark(costBenchmarkTable, category, data[0].district);

      const lowTrips = data.filter(t => t.ridership < lowRiderTh);
      const lowCount = lowTrips.reduce((s, t) => s + t.tripCount, 0);
      const percentLow = totalTrips > 0 ? (lowCount / totalTrips) * 100 : 0;

      const wastedKm = Math.round(lowTrips.reduce((s, t) => s + ((t.distance || 0) * t.tripCount), 0));
      const totalKm = Math.round(data.reduce((s, t) => s + ((t.distance || 0) * t.tripCount), 0));
      const wastedRatio = totalKm > 0 ? (wastedKm / totalKm) : 0;

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
      const fullCostTh = G.cost.full != null ? G.cost.full / 100 : (isUrban ? 0.90 : 0.80);
      let fCost = 0;
      if (costRatio === 0) fCost = 0.5;
      else if (costRatio <= fullCostTh) fCost = 1;
      else if (costRatio <= 1.0) fCost = 0.6;
      else if (costRatio <= 1.3) fCost = 0.3;
      else fCost = 0;

      // 4. עמוס נוסעים — ממוצע נוסעים לנסיעה: מלוא הנקודות מ-2×סף הקטגוריה,
      //    חצי (בקירוב) מ-1.2×; המשתמש יכול לקבוע "כמה אנשים = מלוא הנקודות"
      const rFull = G.avgRiders.full != null ? G.avgRiders.full : lowRiderTh * 2 * scale;
      const rHalf = G.avgRiders.half != null ? G.avgRiders.half : (G.avgRiders.full != null ? G.avgRiders.full * 0.6 : lowRiderTh * 1.2 * scale);
      let fAvgRiders = 0;
      if (avgRiders >= rFull) fAvgRiders = 1;
      else if (avgRiders >= rHalf) fAvgRiders = 8 / 15;

      // 5. עמוס שיא — 30 נוסעים בקטע העמוס (לפי קיבולת) = מלוא הנקודות, 20 = חצי
      const pFull = G.peak.full != null ? G.peak.full : 30 * scale;
      const pHalf = G.peak.half != null ? G.peak.half : (G.peak.full != null ? G.peak.full * 2 / 3 : 20 * scale);
      let fPeak = 0;
      if (avgPeak >= pFull) fPeak = 1;
      else if (avgPeak >= pHalf) fPeak = 0.5;

      // 6. נפח שבועי = ממוצע נוסעים × נסיעות שבועיות — מתגמל קווים שגם
      //    עמוסים וגם תדירים; קו פעם/יום לא יוכל להגיע ל-100
      const weeklyVolume = avgRiders * totalTrips;
      const volHalf = G.volume.half != null ? G.volume.half : (G.volume.full != null ? G.volume.full * 0.4 : lowRiderTh * 20);
      const volFull = G.volume.full != null ? G.volume.full : lowRiderTh * 50;
      let fVolume = 0;
      if (weeklyVolume >= volFull) fVolume = 1;
      else if (weeklyVolume >= volHalf) fVolume = 0.5;

      const pts = (k, f) => (G[k].on ? f * (Number(G[k].max) || 0) : 0);
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
        live,   // דלתא מהארכיון — לתג "הושבת וחזר" על הכרטיס
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
        lowRiderTh,
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
          volume: Math.round(volumeScore),
        },
        maxSum,
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
    if (sortBy === 'riders') r.sort((a, b) => Number(b.avg) - Number(a.avg));
    else if (sortBy === 'cost') r.sort((a, b) => (a.costRatio || Infinity) - (b.costRatio || Infinity));
    else if (sortBy === 'km') r.sort((a, b) => b.totalKm - a.totalKm);
    else r.sort((a, b) => b.score - a.score);
    return r;
  }, [goldenLines, filterDistrict, filterCategory, submittedSearch, sortBy, lineCitiesMap, focusMakat, gFilt]);

  const areaStats = useMemo(() => {
    const map = new Map();
    goldenLines.forEach(line => {
      if (!line.district) return;
      if (line.score < 80) return;
      if (!map.has(line.district)) map.set(line.district, { key: line.district, count: 0, totalScore: 0, totalRiders: 0, totalTrips: 0, totalKm: 0 });
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
      avgRiders: (s.totalRiders / s.count).toFixed(1),
    })).sort((a, b) => b.count - a.count);
  }, [goldenLines]);

  const isLoading = !trips || trips.length === 0;

  const selectCls = "bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 font-black outline-none focus:border-slate-900 text-right shadow-sm w-full md:w-auto appearance-none cursor-pointer";

  const exportAreaToExcel = async (areaKey) => {
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
      'ק"מ סרק': Math.round(l.wastedKm || 0),
    }));
    const ws = window.XLSX.utils.json_to_sheet(data);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'קווים_מצטיינים');
    // גיליון מימין לשמאל — ב-SheetJS זה מוגדר בחוברת (Workbook.Views), ו-!views של הגיליון לא נקרא
    wb.Workbook = { Views: [{ RTL: true }] };
    window.XLSX.writeFile(wb, `קו_מוזהב_${areaKey.replace(/\s+/g, '_')}.xlsx`);
  };

  return (
    <div className="kbt kbt-gold min-h-screen bg-[#F8FAFC] text-slate-900 p-4 md:p-6 pb-20" style={{ fontFamily: "'Heebo', sans-serif" }} dir="rtl">
      <KbToolBar name="הקו המוזהב" onHome={onBack} />
      <div className="max-w-6xl mx-auto">

        <header className="kbt-hero">
          <KbToolIcon k="golden" />
          <div className="kbt-hero-txt">
            <div className="kbt-titlerow">
              <h1 className="kbt-h1">הקו המוזהב</h1>
              <span className="kbt-by">נבנה על ידי שלמה הרטמן</span>
            </div>
            <p className="kbt-sub">מאתרים קווים מצטיינים • יעילות גבוהה, נוסעים רבים</p>
            <p className="kbt-meta">
              נתוני נוסעים ועלויות: צילום משרד התחבורה, יוני 2026
              {/* תאריך ההצלבה מגיע מקובץ נפרד — נשמר לו מקום כבר עכשיו, שהכותרת לא תגדל ותדחוף את הדף (Lighthouse: CLS) */}
              {' · הצלבה מול רישום הקווים העדכני: '}{liveGen ? String(liveGen).split('-').reverse().join('.') : <span className="inline-block w-16 h-[1em] align-middle bg-slate-100 rounded" aria-hidden="true" />}
            </p>
          </div>
        </header>

        <nav className="flex bg-slate-200/50 backdrop-blur p-1.5 rounded-[2rem] mb-12 max-w-4xl mx-auto shadow-inner border border-slate-200 overflow-x-auto">
          {[['top', 'star', 'הקווים המצטיינים', 'bg-white text-amber-700 shadow-md'], ['areas', 'chart', 'ניתוח אזורי', 'bg-white text-amber-700 shadow-md'], ['expand', 'zap', 'הזדמנויות הרחבה', 'bg-white text-emerald-700 shadow-md'], ['allTrips', 'list', 'כל הנסיעות', 'bg-white text-rose-600 shadow-md'], ['about', 'info', 'על המערכת', 'bg-white text-indigo-600 shadow-md']].map(([id, icon, label, activeCls]) => (
            <a key={id} href={tabHref('מוזהב', GOLD_TABS, id)} onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); setGoldenTab(id); }}
              aria-current={goldenTab === id ? 'page' : undefined}
              className={`flex-1 min-w-[120px] py-3.5 rounded-[1.5rem] font-black text-sm transition-all flex items-center justify-center gap-2 ${goldenTab === id ? activeCls : 'text-slate-600 hover:text-slate-800'}`}>
              <Ic n={icon} size={16} /> {label}
            </a>
          ))}
        </nav>

        {/* ── טאב: קווים מצטיינים ── */}
        {goldenTab === 'top' && (
          <div className="space-y-8 transition-opacity duration-300 opacity-100">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col xl:flex-row justify-between items-center gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-900">הקווים הכי מצטיינים</h2>
                <p className="text-slate-500 font-bold">דירוג המציג את הקווים החזקים ביותר במערכת — ביקוש גבוה, יעילות גבוהה ועלות נמוכה</p>
              </div>
              <div className="flex flex-col md:flex-row gap-3 relative w-full xl:w-auto">
                <select aria-label="מיון הקווים המצטיינים" value={sortBy} onChange={e => { setSortBy(e.target.value); setVisibleCount(60); }} className={selectCls}>
                  <option value="score">מיון: לפי ניקוד מוזהב</option>
                  <option value="riders">מיון: ממוצע נוסעים (גבוה לנמוך)</option>
                  <option value="cost">מיון: עלות לנוסע (נמוך לגבוה)</option>
                  <option value="km">מיון: ק"מ שבועי</option>
                </select>
                <select aria-label="סינון לפי מחוז" value={filterDistrict} onChange={e => { setFilterDistrict(e.target.value); setVisibleCount(60); }} className={selectCls}>
                  <option value="all">כל המחוזות</option>
                  {allDistricts.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <select aria-label="סינון לפי קטגוריה" value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setVisibleCount(60); }} className={selectCls}>
                  <option value="all">כל הקטגוריות</option>
                  {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div className="relative w-full md:w-64">
                  <SearchInput value={submittedSearch} onSubmit={v => { setSubmittedSearch(v); setVisibleCount(60); }} placeholder="חיפוש עיר — Enter"
                    className="bg-slate-50 border-2 border-slate-200 rounded-2xl px-6 py-3 pl-12 font-black outline-none focus:border-slate-900 text-right shadow-sm w-full" />
                </div>
              </div>
            </div>

            {/* מה נחשב קו מוזהב — לבחירת המשתמש (שלמה 07.09) */}
            <ScoreSettingsPanel
              title="מה נחשב קו מוזהב? כאן קובעים את הניקוד"
              accent="amber"
              settings={gset} update={updGset} reset={resetGset} isDefault={gsetDefault}
              intro='לכל דבר שנמדד אפשר לקבוע כמה נקודות הוא נותן, ולכמה נוסעים מגיעות מלוא הנקודות. שדה סף ריק = הסף האוטומטי של האתר לפי קטגוריית הקו (עירוני, בינעירוני וכו׳). הרשימה מתעדכנת מיד.'
              rows={[
                { key: 'highTrips', label: 'נסיעות בביקוש גבוה', hint: 'איזה חלק מהנסיעות עובר את סף הנוסעים של הקטגוריה' },
                { key: 'efficientKm', label: 'יעילות ק"מ', hint: 'איזה חלק מהקילומטרים נסוע על נסיעות מאוכלסות' },
                { key: 'cost', label: 'עלות לנוסע', hint: 'ביחס לממוצע הקטגוריה', params: [{ k: 'full', label: 'מלוא הנקודות עד', auto: '90/80', unit: '% מהממוצע', min: 10, max: 300, width: 'w-20', title: 'ברירת המחדל: עירוני 90%, שאר הקווים 80%' }] },
                { key: 'avgRiders', label: 'ממוצע נוסעים לנסיעה', hint: 'כמה אנשים בממוצע בנסיעה', params: [{ k: 'full', label: 'מלוא הנקודות מ-', auto: 'אוטו', unit: 'נוסעים', min: 1, max: 500, title: 'ברירת המחדל: פי 2 מסף הקטגוריה, לפי קיבולת הרכב' }, { k: 'half', label: 'חצי מ-', auto: 'אוטו', unit: 'נוסעים', min: 1, max: 500 }] },
                { key: 'peak', label: 'עומס שיא', hint: 'כמה אנשים בקטע העמוס ביותר', params: [{ k: 'full', label: 'מלוא הנקודות מ-', auto: '30', unit: 'נוסעים', min: 1, max: 300 }, { k: 'half', label: 'חצי מ-', auto: '20', unit: 'נוסעים', min: 1, max: 300 }] },
                { key: 'volume', label: 'נפח שבועי', hint: 'ממוצע נוסעים × נסיעות בשבוע', params: [{ k: 'full', label: 'מלוא הנקודות מ-', auto: 'אוטו', unit: 'נוסעים בשבוע', min: 1, max: 999999, width: 'w-24' }, { k: 'half', label: 'חצי מ-', auto: 'אוטו', unit: 'נוסעים בשבוע', min: 1, max: 999999, width: 'w-24' }] },
              ]}
              extras={
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-[12px] font-bold text-slate-700 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                  <label className="inline-flex items-center gap-2">סף כניסה: ממוצע נוסעים וגם עומס שיא מעל
                    <NumField value={gset.entryRiders} onChange={v => updGset(s => ({ ...s, entryRiders: v == null ? 0 : Math.max(0, v) }))} min={0} max={300} suffix="נוסעים (לפי קיבולת)" title="קו שלא עובר את שני הספים לא נכנס לרשימה בכלל" />
                  </label>
                  <label className="inline-flex items-center gap-2">קו מוזהב = ציון של לפחות
                    <NumField value={gset.minScore} onChange={v => updGset(s => ({ ...s, minScore: v == null ? 0 : Math.max(0, Math.min(100, v)) }))} min={0} max={100} suffix="מתוך 100" />
                  </label>
                </div>
              }
              footnote='ההגדרות נשמרות בדפדפן הזה בלבד. הניתוח האזורי ממשיך לספור קווים עם ציון 80 ומעלה לפי הניקוד שקבעתם.'
            />
            {/* סינון מספרי על הרשימה */}
            <div className="bg-white border-2 border-slate-100 rounded-[2rem] px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-[12px] font-bold text-slate-700">
              <span className="font-black text-slate-900 text-sm">🔎 סינון:</span>
              <label className="inline-flex items-center gap-2">ממוצע נוסעים מ-<NumField value={gFilt.minRiders} onChange={v => { setGFilt(f => ({ ...f, minRiders: v })); setVisibleCount(60); }} min={0} max={500} width="w-16" /></label>
              <label className="inline-flex items-center gap-2">עומס שיא מ-<NumField value={gFilt.minPeak} onChange={v => { setGFilt(f => ({ ...f, minPeak: v })); setVisibleCount(60); }} min={0} max={300} width="w-16" /></label>
              <label className="inline-flex items-center gap-2">נסיעות בשבוע מ-<NumField value={gFilt.minTrips} onChange={v => { setGFilt(f => ({ ...f, minTrips: v })); setVisibleCount(60); }} min={0} max={5000} width="w-16" /></label>
              <label className="inline-flex items-center gap-2">עלות לנוסע עד<NumField value={gFilt.maxCost} onChange={v => { setGFilt(f => ({ ...f, maxCost: v })); setVisibleCount(60); }} min={1} max={500} width="w-16" suffix="% מהממוצע" /></label>
              {gFiltOn && <button type="button" onClick={() => setGFilt({ minRiders: null, minTrips: null, maxCost: null, minPeak: null })} className="text-xs font-black text-amber-700 hover:text-amber-900 underline">✕ נקה סינון</button>}
              <span className="text-slate-500 mr-auto">{filtered.length.toLocaleString()} קווים</span>
            </div>

            {focusMakat && (
              <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                <span className="text-sm font-black text-amber-800">🔗 מציג קו משותף (מק"ט {focusMakat})</span>
                <button className="text-xs font-black text-amber-700 hover:text-amber-900 underline" onClick={onClearFocus}>
                  ✕ הצג את כל הקווים
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.slice(0, visibleCount).map((line, idx) => (
                <div key={line.groupKey} className="vcard bg-white border-2 border-slate-100 rounded-[2.5rem] p-7 shadow-sm hover:border-slate-900 transition-all text-right flex flex-col group relative">
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex flex-col gap-2 items-start text-right">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="px-4 py-1.5 rounded-full text-[11px] font-black border bg-emerald-50 text-emerald-700 border-emerald-200">
                          ניקוד {line.score}/100
                        </div>
                        <div className="px-3 py-1.5 rounded-full text-[11px] font-black bg-slate-100 text-slate-700 border border-slate-200">
                          {line.category}
                        </div>
                      </div>
                      <div className="text-[10px] font-bold text-slate-500">מק&quot;ט: {String(line.makat || '').replace(/^0+/, '') || '—'}</div>
                    </div>
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <div className="bg-slate-900 text-white w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl shadow-lg">{line.lineNum}</div>
                      <button className="text-[10px] font-black text-slate-500 hover:text-slate-900 transition-colors"
                        title="העתקת קישור ישיר לקו הזה"
                        onClick={(e) => {
                          const url = location.origin + location.pathname + '#מוזהב/קו/' + String(line.makat || '').replace(/^0+/, '');
                          try { navigator.clipboard.writeText(url); } catch (err) { /* ignore */ }
                          const b = e.currentTarget; const t = b.textContent; b.textContent = '✓ הועתק';
                          setTimeout(() => { b.textContent = t; }, 1500);
                        }}>🔗 שיתוף</button>
                    </div>
                  </div>

                  <div className="flex-1 mb-5">
                    <div className="flex items-center justify-start gap-3 mb-2 min-w-0">
                      <div className="text-slate-900 font-black text-lg truncate leading-tight">{line.origin}</div>
                      <div className="text-slate-300 text-2xl font-black shrink-0 leading-none">←</div>
                      <div className="text-slate-900 font-black text-lg truncate leading-tight">{line.dest}</div>
                    </div>
                    <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">{line.district}</span>
                    {/* הצלבה מול הארכיון (סעיף 29): השבתה זמנית משפיעה על נתוני הצילום */}
                    {line.live && !line.live.rm && line.live.gap && (
                      <span className="mr-2 text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full"
                        title={'הקו הושבת בין ' + String(line.live.gap[0]).split('-').reverse().join('.') + ' ל-' + String(line.live.gap[1]).split('-').reverse().join('.') + ' וחזר — נתוני הנוסעים עשויים לשקף גם את תקופת ההשבתה'}>
                        ⏸ הושבת וחזר</span>
                    )}

                    <div className="text-xs font-bold text-slate-500 mt-4 mb-4 flex items-center gap-2">
                      <span>ניקוד מוזהב:</span>
                      <span className="font-black text-emerald-700">{line.score}/100</span>
                    </div>

                    <div className="space-y-2.5 pt-4 border-t border-slate-100">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-700 font-bold">ממוצע נוסעים לנסיעה</span>
                        <span className="font-black text-slate-900">{line.avg}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-700 font-bold">עומס שיא ממוצע</span>
                        <span className="font-black text-slate-900">{line.avgPeak}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-700 font-bold">נסיעות בשבוע</span>
                        <span className="font-black text-slate-900">{line.count}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm gap-2">
                        <span className="text-slate-700 font-bold">עלות תפעולית לנוסע</span>
                        <span className="text-right">
                          <span className="font-black text-slate-900">{line.cost > 0 ? `₪${line.cost.toFixed(2)}` : 'לא זמין'}</span>
                          {line.cost > 0 && line.costBenchmark > 0 && (
                            <div className="text-[10px] font-bold text-slate-500">
                              ממוצע {line.category}: ₪{line.costBenchmark}
                              {line.costRatio < 1 && (
                                <span className="text-emerald-700 mr-1">(×{line.costRatio.toFixed(2)})</span>
                              )}
                              {line.costRatio >= 1 && (
                                <span className="text-slate-500 mr-1">(×{line.costRatio.toFixed(2)})</span>
                              )}
                            </div>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-700 font-bold">ק&quot;מ לא מבוזבז (שימושי)</span>
                        <span className="font-black text-emerald-700">{(line.nonWastedKm || 0).toLocaleString()} ק&quot;מ</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600 font-bold">ק&quot;מ מבוזבז (נסיעות סרק)</span>
                        <span className="font-black text-rose-600">{line.wastedKm.toLocaleString()} ק&quot;מ</span>
                      </div>
                    </div>

                  </div>

                  <div className="mb-4"><RidershipBlock makat={line.makat} /></div>

                  <button
                    onClick={() => { setSelectedLine(line); setGoldenTab('expand'); }}
                    className="w-full py-4 bg-slate-900 text-white rounded-2xl text-xs font-black hover:bg-black transition-all shadow-md"
                  >
                    חפש הזדמנויות הרחבה
                  </button>
                </div>
              ))}
              {filtered.length === 0 && (
                /* אותו טיפול כמו בקו פח: קישור משותף לקו שירד מהרשימה */
                focusMakat && trips.some(t => String(t.makat || '').replace(/^0+/, '').trim() === String(focusMakat).replace(/^0+/, '').trim()) ? (
                  <div className="col-span-full bg-white border-2 border-amber-200 rounded-[2rem] p-8 text-right shadow-sm">
                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                      <span className="bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-4 py-1.5 text-[11px] font-black">ירד מהרשימה בעדכון האחרון</span>
                      <span className="font-black text-slate-900 text-lg">מק"ט {focusMakat}</span>
                    </div>
                    <p className="text-slate-600 font-bold text-sm leading-relaxed">
                      הקו קיים במערכת, אבל בעדכון הנתונים האחרון הוא כבר לא עובר את הסף לרשימת המצטיינים.
                    </p>
                    <button onClick={onClearFocus}
                      className="mt-4 bg-slate-900 hover:bg-black text-white px-6 py-3 rounded-2xl text-xs font-black transition-colors">✕ נקה את הסינון וחזור לרשימה</button>
                  </div>
                ) : (
                <div className="col-span-full text-center py-20 text-slate-500 font-bold">לא נמצאו קווים מצטיינים בסינון הנוכחי.</div>
                )
              )}
            </div>
            {filtered.length > visibleCount && (
              <button onClick={() => setVisibleCount(v => v + 60)} className="w-full py-4 rounded-[2rem] border-2 border-slate-200 text-slate-500 font-black text-sm hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm">
                טען עוד ({filtered.length - visibleCount} נותרו)
              </button>
            )}
          </div>
        )}

        {/* ── טאב: ניתוח אזורי ── */}
        {goldenTab === 'areas' && (
          <div className="space-y-8 transition-opacity duration-300 opacity-100">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col xl:flex-row justify-between items-center gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-900">האזורים הכי חזקים</h2>
                <p className="text-slate-500 font-bold">ריכוז הקווים המצטיינים לפי מחוז — לחץ על מחוז לצפייה בקוויו</p>
              </div>
              {areaFilter && (
                <button onClick={() => setAreaFilter(null)} className="shrink-0 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-2xl font-black text-sm transition-colors">
                  ✕ נקה סינון: {areaFilter}
                </button>
              )}
            </div>

            {!areaFilter && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {areaStats.map((area, idx) => (
                  <div key={area.key} onClick={() => setAreaFilter(area.key)}
                    className="bg-white border-2 border-slate-100 rounded-[2.5rem] p-7 shadow-sm hover:border-slate-900 transition-all text-right flex flex-col cursor-pointer group">
                    <div className="flex justify-between items-start mb-6">
                      <div className="px-4 py-1.5 rounded-full text-[11px] font-black border bg-emerald-50 border-emerald-200 text-emerald-700">ניקוד ממוצע: {area.avgScore}</div>
                      <button onClick={e => { e.stopPropagation(); exportAreaToExcel(area.key); }} className="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm transition-all shrink-0" title="ייצוא נתוני האזור לאקסל">
                        <Ic n="download" size={20} />
                      </button>
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 mb-4">{area.key}</h3>
                    <div className="space-y-3 pt-4 border-t border-slate-100 text-sm mb-5">
                      <div className="flex justify-between"><span className="text-slate-600 font-bold">קווים מצטיינים</span><span className="font-black text-slate-900">{area.count} קווים</span></div>
                      <div className="flex justify-between"><span className="text-slate-600 font-bold">ממוצע נוסעים</span><span className="font-black text-slate-900">{area.avgRiders}</span></div>
                      <div className="flex justify-between"><span className="text-slate-600 font-bold">סה"כ נסיעות שבועיות</span><span className="font-black text-slate-900">{area.totalTrips.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span className="text-slate-600 font-bold">סה"כ ק"מ שבועיים</span><span className="font-black text-slate-900">{area.totalKm.toLocaleString()} ק"מ</span></div>
                    </div>
                    <button className="mt-auto w-full py-4 bg-slate-900 text-white rounded-2xl text-xs font-black hover:bg-black transition-all shadow-md">צפה בקווים אלו</button>
                  </div>
                ))}
                {areaStats.length === 0 && (
                  <div className="col-span-full text-center py-20 text-slate-500 font-bold">אין נתונים.</div>
                )}
              </div>
            )}

            {areaFilter && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {goldenLines.filter(l => l.district === areaFilter && l.score >= 80).map(line => (
                    <div key={line.groupKey} className="bg-white border-2 border-slate-100 rounded-[2.5rem] p-7 shadow-sm hover:border-slate-900 transition-all text-right flex flex-col group">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex flex-col gap-2 items-start">
                          <div className="px-4 py-1.5 rounded-full text-[11px] font-black border bg-emerald-50 text-emerald-700 border-emerald-200">ניקוד {line.score}/100</div>
                          <div className="px-3 py-1.5 rounded-full text-[11px] font-black bg-slate-100 text-slate-700 border border-slate-200">{line.category}</div>
                        </div>
                        <div className="bg-slate-900 text-white w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl shadow-lg shrink-0">{line.lineNum}</div>
                      </div>
                      <div className="flex items-center gap-3 mb-3 min-w-0">
                        <div className="text-slate-900 font-black text-lg truncate leading-tight">{line.origin}</div>
                        <div className="text-slate-300 text-2xl font-black shrink-0">←</div>
                        <div className="text-slate-900 font-black text-lg truncate leading-tight">{line.dest}</div>
                      </div>
                      <div className="space-y-2 text-sm border-t border-slate-100 pt-3 mb-5 flex-1">
                        <div className="flex justify-between"><span className="text-slate-600 font-bold">ממוצע נוסעים</span><span className="font-black">{line.avg}</span></div>
                        <div className="flex justify-between"><span className="text-slate-600 font-bold">עומס שיא</span><span className="font-black">{line.avgPeak}</span></div>
                        <div className="flex justify-between"><span className="text-slate-600 font-bold">עלות לנוסע</span><span className="font-black">{line.cost > 0 ? `₪${line.cost.toFixed(2)}` : '—'}</span></div>
                      </div>
                      <button onClick={() => { setSelectedLine(line); setGoldenTab('expand'); }} className="w-full py-3 bg-slate-900 text-white rounded-2xl text-xs font-black hover:bg-black transition-all shadow-md">חפש הזדמנויות הרחבה</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── טאב: הזדמנויות הרחבה ── */}
        {goldenTab === 'expand' && (() => {
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
                const cityOnly2 = (s2) => s2 ? (s2.indexOf(' - ') > 0 ? s2.slice(0, s2.indexOf(' - ')).trim() : s2.split('/')[0].trim()) : '';
                const seen = new Map();
                trips.forEach(t => {
                  if (String(t.lineNum) !== q && String(t.makat || '').replace(/^0+/, '') !== qn) return;
                  const pair = [cityOnly2(t.origin), cityOnly2(t.dest)].sort().join('-');
                  const gk = `${t.lineNum}_${pair}`;
                  if (!seen.has(gk)) seen.set(gk, { lineNum: t.lineNum, makat: t.makat, origin: t.origin, dest: t.dest, district: t.district || '', groupKey: gk, notGolden: true });
                });
                matches = [...seen.values()];
              }
              const c = expandCity.trim().toLowerCase();
              if (c) matches = matches.filter(l => (l.origin || '').toLowerCase().includes(c) || (l.dest || '').toLowerCase().includes(c));
              if (matches.length === 1) { setSelectedLine(matches[0]); setExpandMatches([]); }
              else setExpandMatches(matches);
            };
            return (
              <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm max-w-4xl mx-auto transition-opacity duration-300 opacity-100">
                <header className="mb-8">
                  <h2 className="text-2xl font-black text-slate-900 mb-2">הזדמנויות הרחבה</h2>
                  <p className="text-slate-500 font-bold text-sm leading-relaxed">
                    המערכת מזהה את חלונות הזמן העמוסים של הקו ומציעה <strong>שעות יציאה קונקרטיות להוספה</strong>,
                    עד להורדת העומס לרמה נוחה (85% מהקיבולת). אפשר לנתח <strong>כל קו במערכת</strong> — לא רק את המצטיינים.
                  </p>
                </header>

                <div className="bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 mb-4 shadow-inner">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-2">
                    <div>
                      <label className="block text-xs font-[900] text-slate-500 mb-3 pr-2 uppercase tracking-wider">מספר קו / מק&quot;ט</label>
                      <input
                        type="text"
                        value={expandSearch}
                        onChange={e => { setExpandSearch(e.target.value); setExpandMatches([]); setExpandSearched(false); }}
                        onKeyDown={e => e.key === 'Enter' && doExpandSearch()}
                        placeholder="למשל 1, 480..."
                        className="w-full bg-white border-2 border-slate-200 rounded-2xl px-5 py-3 font-black text-sm outline-none focus:border-slate-900 shadow-sm transition-all text-right"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-[900] text-slate-500 mb-3 pr-2 uppercase tracking-wider">עיר (רשות — לצמצום תוצאות)</label>
                      <input
                        type="text"
                        value={expandCity}
                        onChange={e => { setExpandCity(e.target.value); setExpandMatches([]); setExpandSearched(false); }}
                        onKeyDown={e => e.key === 'Enter' && doExpandSearch()}
                        placeholder="הקלד שם עיר..."
                        className="w-full bg-white border-2 border-slate-200 rounded-2xl px-5 py-3 font-black text-sm outline-none focus:border-slate-900 shadow-sm transition-all text-right"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 pt-6 border-t border-slate-200 mt-6">
                    <button
                      onClick={doExpandSearch}
                      className="bg-amber-500 hover:bg-amber-600 text-white px-10 py-4 rounded-2xl font-black transition-all shadow-lg active:scale-95 flex items-center gap-3"
                    >
                      <Ic n="zap" size={20} /> חפש הזדמנויות
                    </button>
                    <a href="#מוזהב" onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); setGoldenTab('top'); }} className="inline-flex items-center justify-center bg-white border-2 border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300 px-6 py-4 rounded-2xl font-black text-sm transition-colors">← חזרה לרשימת המצטיינים</a>
                  </div>
                </div>

                {expandMatches.length > 1 && (
                  <div className="space-y-2 mb-2 mt-6">
                    <p className="text-xs font-black text-slate-500 text-right">נמצאו מספר מסלולים — בחר:</p>
                    {expandMatches.map(l => (
                      <button key={l.groupKey} onClick={() => { setSelectedLine(l); setExpandMatches([]); }}
                        className="w-full text-right bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-300 rounded-2xl px-5 py-3 font-black text-sm transition-colors">
                        קו {l.lineNum} · {l.origin} ← {l.dest} · {l.district}
                        {l.notGolden && <span className="mr-2 text-[10px] font-black bg-slate-100 text-slate-500 border border-slate-200 rounded-full px-2 py-0.5">לא ברשימת המצטיינים</span>}
                      </button>
                    ))}
                  </div>
                )}
                {expandSearched && expandMatches.length === 0 && expandSearch && (
                  <p className="text-xs font-bold text-rose-700 text-right mt-4">קו {expandSearch} לא נמצא במערכת{expandCity ? " בעיר שהוקלדה" : ""}</p>
                )}
              </div>
            );
          }

          // מסננים לפי אותו groupKey שבו מקובצים הקווים המצטיינים (lineNum + צמד ערים),
          // אחרת "קו 1" יאסוף את כל הקווים שמספרם 1 בכל הארץ וידלל את העומס
          const cityOnly = (s) => s ? (s.indexOf(' - ') > 0 ? s.slice(0, s.indexOf(' - ')).trim() : s.split('/')[0].trim()) : '';
          const lineTrips = trips.filter(t => {
            const pair = [cityOnly(t.origin), cityOnly(t.dest)].sort().join('-');
            return `${t.lineNum}_${pair}` === selectedLine.groupKey;
          });
          // ניתוח לפי כיוון (כמו בסימולטור של קו פח): מיצוע הלוך+חזור הסתיר
          // כיוון בוקר דחוס מאחורי כיוון חוזר ריק, ו"השעות המוצעות" נבנו
          // משני הכיוונים יחד — מרווחים שלא קיימים באף כיוון בפועל.
          // ברירת המחדל: הכיוון העמוס יותר.
          const dirs = [...new Set(lineTrips.map(t => String(t.direction || '')))].filter(Boolean).sort();
          const dirWeight = (d) => lineTrips.filter(t => String(t.direction || '') === d)
            .reduce((s, t) => s + (t.peakLoad || 0) * t.tripCount, 0);
          const chosenDir = dirs.length > 1
            ? (expandDir && dirs.includes(expandDir) ? expandDir : dirs.slice().sort((a, b) => dirWeight(b) - dirWeight(a))[0])
            : (dirs[0] || null);
          const dirTrips = dirs.length > 1 ? lineTrips.filter(t => String(t.direction || '') === chosenDir) : lineTrips;
          const periods = { 'לילה (00-06)': [], 'בוקר שיא (06-09)': [], 'בוקר (09-12)': [], 'צהריים (12-15)': [], 'אחה"צ שיא (15-18)': [], 'ערב (18-22)': [], 'לילה מאוחר (22-24)': [] };
          const periodRange = [[0,360],[360,540],[540,720],[720,900],[900,1080],[1080,1320],[1320,1440]];
          dirTrips.forEach(t => {
            const mins = t.timeMins;
            if (mins == null) return;
            const idx = periodRange.findIndex(([a,b]) => mins >= a && mins < b);
            if (idx >= 0) { const key = Object.keys(periods)[idx]; periods[key].push(t); }
          });
          // יעד עומס נוח = 85% מקיבולת האוטובוס. מעבר לזה — האוטובוס צפוף וצריך נסיעות נוספות.
          // נסיעות להוספה = נסיעות שיביאו את העומס הממוצע חזרה ליעד הנוח.
          const TARGET_LOAD = 0.85;
          const minsToStr = (m) => `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(Math.round(m)%60).padStart(2,'0')}`;
          // שעות יציאה מוצעות — בדיוק כמספר הנסיעות שההמלצה קובעת (בקשת
          // שלמה, סעיף 32): קודם הרשימה הציעה עשרות שעות (ציפוף כל הלוח
          // ל-5 דקות) ליד המלצה של "הוסיפו 3" — שני מספרים סותרים על אותו
          // כרטיס. עכשיו: בכל פעם מפוצל המרווח הגדול ביותר שנותר בלוח,
          // עד שמגיעים למספר המומלץ. מרווח של 5 דקות ומטה לא מפוצל.
          const MIN_HEADWAY = 5;
          const suggestTimes = (pts, n) => {
            const times = [...new Set(pts.map(t => t.timeMins).filter(m => m != null && m > 0))].sort((a,b) => a-b);
            if (times.length < 2 || !n || n <= 0) return { times: [], total: 0 };
            const gaps = [];
            for (let i=0; i<times.length-1; i++) gaps.push([times[i], times[i+1]]);
            const picks = [];
            for (let k=0; k<n; k++) {
              gaps.sort((a,b) => (b[1]-b[0]) - (a[1]-a[0]));
              const g = gaps[0];
              if (!g || (g[1]-g[0]) <= MIN_HEADWAY * 2) break;   // אין מרווח שאפשר לפצל
              const mid = Math.round((g[0]+g[1]) / 2);
              picks.push(mid);
              gaps.shift(); gaps.push([g[0], mid], [mid, g[1]]);
            }
            picks.sort((a,b) => a-b);
            return { times: picks.map(minsToStr), total: picks.length };
          };
          const periodStats = Object.entries(periods).map(([label, pts]) => {
            if (pts.length === 0) return { label, count: 0, avgRiders: 0, avgPeak: 0, capacity: 0, occupancy: 0, tripsToAdd: 0, suggestedTimes: [], moreTimes: 0 };
            const totalTrips = pts.reduce((s,t) => s + t.tripCount, 0);
            const avgRiders = totalTrips > 0 ? pts.reduce((s,t) => s + t.ridership * t.tripCount, 0) / totalTrips : 0;
            const avgPeak = totalTrips > 0 ? pts.reduce((s,t) => s + t.peakLoad * t.tripCount, 0) / totalTrips : 0;
            // קיבולת מייצגת לחלון — הקיבולת הגדולה ביותר בין נסיעות החלון
            const capacity = Math.max(...pts.map(t => t.capacity || 50), 50);
            const target = capacity * TARGET_LOAD;
            const occupancy = capacity > 0 ? avgPeak / capacity : 0;
            let tripsToAdd = 0;
            if (avgPeak > target && totalTrips > 0) {
              const needed = Math.ceil(totalTrips * avgPeak / target);
              tripsToAdd = Math.max(0, needed - totalTrips);
            }
            const sug = tripsToAdd > 0 ? suggestTimes(pts, tripsToAdd) : { times: [], total: 0 };
            return { label, count: totalTrips, avgRiders: avgRiders.toFixed(1), avgPeak: Math.round(avgPeak), capacity, occupancy, tripsToAdd, suggestedTimes: sug.times, moreTimes: Math.max(0, sug.total - sug.times.length) };
          }).filter(p => p.count > 0);
          const maxRiders = Math.max(...periodStats.map(p => Number(p.avgRiders)), 1);
          const totalTripsToAdd = periodStats.reduce((s,p) => s + p.tripsToAdd, 0);
          const crowdedWindows = periodStats.filter(p => p.tripsToAdd > 0).sort((a,b) => b.tripsToAdd - a.tripsToAdd);

          return (
            <div className="space-y-8 transition-opacity duration-300 opacity-100">
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col xl:flex-row justify-between items-start gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <div className="bg-slate-900 text-white w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl shadow-md">{selectedLine.lineNum}</div>
                    <div>
                      <h2 className="text-2xl font-black text-slate-900">הזדמנויות הרחבה — קו {selectedLine.lineNum}
                        {selectedLine.notGolden && <span className="mr-2 align-middle text-[11px] font-black bg-slate-100 text-slate-500 border border-slate-200 rounded-full px-3 py-1">נבחר ידנית — לא ברשימת המצטיינים</span>}
                      </h2>
                      <p className="text-slate-500 font-bold">{selectedLine.origin} ← {selectedLine.dest} · {selectedLine.district}</p>
                    </div>
                  </div>
                  <p className="text-slate-500 font-bold text-sm mt-2">חישוב כמה נסיעות כדאי להוסיף כדי להוריד את העומס לרמה נוחה (עד 85% מקיבולת האוטובוס)</p>
                  {/* קו שנבחר ידנית ("כל קו במערכת") יכול להיות מבוטל — המלצת
                      "הוסיפו נסיעות" עליו חסרת משמעות (סעיף 29) */}
                  {(() => { const sl = liveOf ? liveOf(selectedLine.makat) : null; return sl && sl.rm ? (
                    <div className="mt-3 bg-red-50 border-2 border-red-200 text-red-700 rounded-2xl px-4 py-3 text-sm font-black">
                      ✖ לפי ארכיון "הקו בזמן", הקו הזה כבר אינו קיים ברישום{sl.rmd ? ' (נעלם ב-' + String(sl.rmd).split('-').reverse().join('.') + ')' : ''} — אין טעם להוסיף לו נסיעות. הניתוח מוצג לתיעוד בלבד.
                    </div>
                  ) : null; })()}
                  {dirs.length > 1 && (
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <span className="text-xs font-black text-slate-500">הניתוח לכל כיוון בנפרד:</span>
                      {dirs.map(d => {
                        const t0 = lineTrips.find(t => String(t.direction || '') === d) || {};
                        return (
                          <button key={d} onClick={() => setExpandDir(d)}
                            className={"px-4 py-2 rounded-xl text-xs font-black border-2 transition-colors " + (chosenDir === d ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400")}>
                            כיוון {d} · {t0.origin} ← {t0.dest}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="shrink-0 flex flex-wrap gap-2">
                  {/* בלי הכפתור הזה, מי שבחר קו נשאר תקוע עליו — טופס החיפוש
                      לא היה נגיש יותר בלי רענון של הדף */}
                  <button onClick={() => { setSelectedLine(null); setExpandMatches([]); setExpandSearch(''); setExpandCity(''); setExpandSearched(false); }}
                    className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-2xl font-black text-sm transition-colors shadow-md">🔍 נתח קו אחר</button>
                  <a href="#מוזהב" onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); setGoldenTab('top'); }} className="inline-block bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-2xl font-black text-sm transition-colors">← חזרה לרשימה</a>
                </div>
              </div>

              {/* סיכום: סך נסיעות להוספה */}
              <div className={`rounded-[2.5rem] p-8 shadow-sm border-2 ${totalTripsToAdd > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="text-center md:text-right">
                    <p className={`font-bold text-sm ${totalTripsToAdd > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>סך נסיעות מומלצות להוספה (שבועי)</p>
                    <p className={`text-5xl font-[900] mt-1 ${totalTripsToAdd > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>{totalTripsToAdd > 0 ? `+${totalTripsToAdd}` : '0'}</p>
                  </div>
                  <div className="text-center md:text-left max-w-sm">
                    <p className="text-slate-600 font-bold text-sm leading-relaxed">
                      {totalTripsToAdd > 0
                        ? `הקו עמוס ב-${crowdedWindows.length} חלונות זמן. הוספת ${totalTripsToAdd} נסיעות שבועיות תוריד את העומס הממוצע לרמה נוחה ותקצר המתנה.`
                        : 'בכל חלונות הזמן העומס מתחת ל-85% מהקיבולת — אין צורך בהוספת נסיעות כרגע. הקו פועל ביעילות מיטבית.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* ניתוח עומס לפי שעה */}
              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-7">
                <h3 className="text-lg font-black text-slate-900 mb-5">עומס שיא לפי שעה</h3>
                <div className="space-y-3">
                  {periodStats.map(p => {
                    const occPct = Math.round(p.occupancy * 100);
                    const over = p.tripsToAdd > 0;
                    return (
                      <div key={p.label}>
                        <div className="flex justify-between text-sm font-bold mb-1">
                          <span className="text-slate-700">{p.label}</span>
                          <span className={over ? 'text-emerald-700 font-black' : 'text-slate-900 font-black'}>{occPct}% תפוסה · {p.count} נסיעות</span>
                        </div>
                        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${over ? 'bg-emerald-500' : 'bg-slate-900'}`} style={{ width: `${Math.min(100, p.occupancy * 100)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  {periodStats.length === 0 && <p className="text-slate-500 font-bold text-sm">אין נתוני זמן לקו זה</p>}
                </div>
                <p className="text-slate-500 text-xs font-bold mt-4 pt-3 border-t border-slate-100">קו ירוק = העומס עובר 85% מהקיבולת — חלון מועמד להוספת נסיעות</p>
              </div>

              {/* המלצות להוספה — כרטיסים בסגנון קו פח, מראים איפה צריך להוסיף */}
              <div>
                <div className="flex items-center gap-2 mb-4 px-1">
                  <Ic n="zap" size={20} cls="text-emerald-700" />
                  <h3 className="text-lg font-black text-slate-900">
                    {crowdedWindows.length > 0 ? `נמצאו ${crowdedWindows.length} חלונות שמומלץ להוסיף בהם נסיעות` : 'אין חלונות שדורשים הוספת נסיעות'}
                  </h3>
                </div>
                <div className="space-y-4">
                  {crowdedWindows.length === 0 && (
                    <div className="bg-slate-50/50 border-2 border-slate-100 p-6 rounded-[2rem] text-center">
                      <p className="text-slate-500 font-bold">העומס בכל חלונות הזמן מתחת ל-85% מהקיבולת — הקו פועל ביעילות מיטבית.</p>
                    </div>
                  )}
                  {crowdedWindows.map((p, i) => {
                    const occPct = Math.round(p.occupancy * 100);
                    const busLabel = p.capacity >= 90 ? 'מפרקי' : p.capacity >= 50 ? 'אוטובוס' : p.capacity >= 35 ? 'מידי' : 'מיני';
                    return (
                      <div key={p.label} className="bg-white border-2 border-slate-50 p-6 rounded-[2rem] flex flex-col lg:flex-row lg:items-center justify-between gap-6 hover:shadow-lg transition-all border-r-4 border-r-emerald-500">
                        <div className="flex items-start gap-4">
                          <div className="bg-emerald-50 text-emerald-700 p-3.5 rounded-2xl mt-1"><Ic n="zap" size={24} /></div>
                          <div>
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <span className="font-black text-slate-900 text-lg">קו {selectedLine.lineNum}</span>
                              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold">{selectedLine.category}</span>
                            </div>
                            <div className="text-sm font-bold text-slate-500 mb-3">{selectedLine.origin} ← {selectedLine.dest} · {selectedLine.district}</div>
                            <div className="flex flex-wrap gap-2">
                              <span className="text-[11px] font-black bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md">{p.label}</span>
                              <span className="text-[11px] font-black bg-rose-100 text-rose-700 px-2 py-1 rounded-md">{occPct}% תפוסה</span>
                              <span className="text-[11px] font-black bg-slate-100 text-slate-500 px-2 py-1 rounded-md">{p.count} נסיעות כיום</span>
                              <span className="text-[11px] font-black bg-purple-100 text-purple-700 px-2 py-1 rounded-md">{busLabel}</span>
                            </div>
                          </div>
                        </div>
                        <div className="bg-slate-50/80 px-6 py-4 rounded-2xl flex-1 max-w-md w-full">
                          <div className="flex justify-between items-center mb-3 text-sm">
                            <span className="font-bold text-slate-500">עומס שיא ממוצע:</span>
                            <span className="font-black text-slate-700">{p.avgPeak} <span className="text-xs text-slate-500 font-normal">על קיבולת {p.capacity}</span></span>
                          </div>
                          <div className="flex justify-between items-center mb-4 text-sm">
                            <span className="font-bold text-slate-500">נסיעות שבועיות כיום:</span>
                            <span className="font-black text-slate-700">{p.count}</span>
                          </div>
                          <div className="pt-3 border-t border-slate-200 flex justify-between items-center mb-3">
                            <span className="font-black text-emerald-700">מומלץ להוסיף:</span>
                            <span className="font-black text-2xl text-emerald-700 bg-white px-3 py-1 rounded-xl shadow-sm">+{p.tripsToAdd} נסיעות</span>
                          </div>
                          {p.suggestedTimes.length > 0 ? (
                            <div>
                              <div className="text-xs font-bold text-slate-500 mb-2">שעות יציאה מוצעות (קירוב לתדירות של 5 דק'):</div>
                              {p.suggestedTimes.length < p.tripsToAdd && (
                                <div className="text-[11px] font-bold text-amber-700 mb-2">
                                  בלוח יש מקום רק ל-{p.suggestedTimes.length} מתוך {p.tripsToAdd} — לשאר עדיף רכב גדול יותר.
                                </div>
                              )}
                              <div className="flex flex-wrap gap-2">
                                {p.suggestedTimes.map((t, ti) => (
                                  <span key={ti} className="font-black text-sm text-emerald-700 bg-white border border-emerald-200 px-3 py-1.5 rounded-xl shadow-sm">{t}</span>
                                ))}
                                {p.moreTimes > 0 && (
                                  <span className="font-black text-sm text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl">ועוד {p.moreTimes}</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                              {p.count >= 2
                                ? <>הלוח כבר רץ בתדירות של עד 5 דקות — עדיף לשדרג ל{p.capacity < 90 ? 'אוטובוס מפרקי (90 מקומות)' : 'תוספת קיבולת'} מאשר להוסיף נסיעות.</>
                                : <>בחלון הזה יש מעט יציאות מכדי לחשב שעות מוצעות — כנראה עדיף רכב גדול יותר.</>}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* נתוני קו */}
              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-7">
                <h3 className="text-lg font-black text-slate-900 mb-5">{selectedLine.notGolden ? 'נתוני הקו' : 'נתוני הקו המצטיין'}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {/* קו שנבחר ידנית ("כל קו במערכת") אינו נושא ניקוד ונתוני
                      סיכום — בלי הסינון הוצג undefined/100 ומשבצות ריקות */}
                  {[
                    ['ניקוד מוזהב', selectedLine.score != null ? `${selectedLine.score}/100` : 'לא מדורג'],
                    ['ממוצע נוסעים', selectedLine.avg != null ? selectedLine.avg : '—'],
                    ['עומס שיא', selectedLine.avgPeak != null ? selectedLine.avgPeak : '—'],
                    ['נסיעות בשבוע', selectedLine.count != null ? selectedLine.count : '—'],
                    ['עלות לנוסע', selectedLine.cost > 0 ? `₪${selectedLine.cost.toFixed(2)}` : '—'],
                    ['ק"מ שימושי', selectedLine.nonWastedKm != null ? `${(selectedLine.nonWastedKm||0).toLocaleString()} ק"מ` : '—'],
                    ['קטגוריה', selectedLine.category || '—'],
                  ].map(([label, val]) => (
                    <div key={label} className="bg-slate-50 rounded-2xl p-4 text-right">
                      <div className="text-slate-500 text-xs font-bold mb-1">{label}</div>
                      <div className="font-black text-slate-900 text-lg">{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── טאב: אודות ── */}
        {/* ── טאב: כל הנסיעות — הפוך מקו פח: מהעמוסה ביותר לריקה ── */}
        {goldenTab === 'allTrips' && (() => {
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
          const { key, direction } = gTripsSort;
          const sortVal = (t) => key === 'peakLoad' ? (t.peakLoad || 0) / (t.capacity || 50) : (t[key] || 0);
          rows = [...rows].sort((a, b) => direction === 'desc' ? sortVal(b) - sortVal(a) : sortVal(a) - sortVal(b));
          const SortBtns = ({ k }) => (
            <span className="inline-flex flex-col -space-y-1.5 mr-1 align-middle">
              <button onClick={() => setGTripsSort({ key: k, direction: 'desc' })} className={key === k && direction === 'desc' ? 'text-amber-700' : 'text-slate-300 hover:text-slate-500'}><Ic n="chevronUp" size={12} strokeWidth="3" /></button>
              <button onClick={() => setGTripsSort({ key: k, direction: 'asc' })} className={key === k && direction === 'asc' ? 'text-amber-700' : 'text-slate-300 hover:text-slate-500'}><Ic n="chevronDown" size={12} strokeWidth="3" /></button>
            </span>
          );
          return (
            <div className="bg-white p-6 md:p-8 rounded-[3rem] border border-slate-200 shadow-sm">
              <header className="mb-8 flex flex-col md:flex-row justify-between items-center gap-6">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 mb-2">כל הנסיעות במערכת</h2>
                  <p className="text-slate-500 font-bold text-sm">כמו בקו פח — אבל הפוך: מהנסיעה העמוסה ביותר לריקה. אתרו נסיעות שמתפקעות ודורשות תגבור.</p>
                </div>
                <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                  <label className="flex items-center gap-3 bg-amber-50/60 border-2 border-amber-100 text-amber-800 px-4 py-3 rounded-2xl cursor-pointer hover:bg-amber-50 transition-colors w-full md:w-auto font-black text-sm">
                    <input type="checkbox" checked={gTripsCrowded} onChange={e => setGTripsCrowded(e.target.checked)} className="w-5 h-5 accent-amber-600 rounded" />
                    רק נסיעות עמוסות (85%+ מהקיבולת)
                  </label>
                  <SearchInput value={gTripsCity} onSubmit={setGTripsCity} placeholder="חיפוש עיר או מספר קו — Enter"
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 pl-12 font-black outline-none focus:border-slate-900 text-right shadow-sm" />
                </div>
              </header>
              <div className="overflow-x-auto rounded-[2rem] border-2 border-slate-100 max-h-[60vh]">
                <table className="w-full text-right border-collapse">
                  <thead className="sticky top-0 bg-slate-50 shadow-sm z-20">
                    <tr className="text-slate-500 text-xs font-black uppercase">
                      <th className="p-5">מס&apos; קו</th>
                      <th className="p-5">מוצא</th>
                      <th className="p-5">יעד</th>
                      <th className="p-5">שעה</th>
                      <th className="p-5"><span className="inline-flex items-center gap-1">נוסעים <SortBtns k="ridership" /></span></th>
                      <th className="p-5"><span className="inline-flex items-center gap-1">עומס שיא <SortBtns k="peakLoad" /></span></th>
                    </tr>
                  </thead>
                  <tbody className="text-sm font-bold text-slate-700">
                    {/* חיפוש בלי תוצאות השאיר טבלה עם כותרות וריקה מתחת — בלי
                        שום הסבר (סעיף 34) */}
                    {rows.length === 0 && (
                      <tr><td colSpan={6} className="p-10 text-center text-slate-500 font-black">
                        לא נמצאו נסיעות{sCity ? ' ל"' + gTripsCity.trim() + '"' : ''} — נסו שם עיר או מספר קו אחר
                        {sCity ? <button onClick={() => setGTripsCity('')} className="mr-3 bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-xl text-xs font-black transition-colors">✕ נקה חיפוש</button> : null}
                      </td></tr>
                    )}
                    {rows.slice(0, gTripsVisible).map((t, i) => {
                      const occ = (t.capacity || 50) > 0 ? Math.round((t.peakLoad / (t.capacity || 50)) * 100) : 0;
                      return (
                        <tr key={`gt-${t.id || i}`} className="vrow border-t border-slate-100 hover:bg-amber-50/40 transition-colors">
                          <td className="p-5 font-black"><span className="bg-amber-500 text-white px-3 py-1.5 rounded-xl">{t.lineNum}</span></td>
                          <td className="p-5">{t.origin}</td>
                          <td className="p-5">{t.dest}</td>
                          <td className="p-5 font-black">{t.time}</td>
                          <td className="p-5">{t.ridership}</td>
                          <td className={`p-5 font-black ${occ >= 85 ? 'text-rose-600' : occ >= 60 ? 'text-amber-700' : ''}`}>{Math.round(t.peakLoad)} <span className="text-[11px] text-slate-500">({occ}%)</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {rows.length > gTripsVisible && (
                <button onClick={() => setGTripsVisible(gTripsVisible + 150)}
                  className="mt-5 w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-2xl font-black text-sm transition-colors">
                  הצג עוד ({(rows.length - gTripsVisible).toLocaleString()} נסיעות נוספות)
                </button>
              )}
            </div>
          );
        })()}

        {goldenTab === 'about' && (
          <div className="space-y-8">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
              <h2 className="text-2xl font-black text-slate-900 mb-4">מה זה הקו המוזהב?</h2>
              <p className="text-slate-600 leading-relaxed font-bold mb-6">הקו המוזהב הוא תמונת הראי של קו פח — הוא מאתר את הקווים שעושים את העבודה הכי טוב. קווים עם ביקוש גבוה, עלות לנוסע נמוכה, ורוב הנסיעות מלאות.</p>
              <h3 className="font-black text-slate-900 text-lg mb-4">ניקוד מוזהב (0–100)</h3>
              <p className="text-slate-600 leading-relaxed font-bold mb-4 text-sm">אלה ברירות המחדל של האתר. בטאב "הקווים המצטיינים" יש לוח ⚙️ שבו כל אחד קובע לעצמו כמה נקודות כל דבר נותן ולכמה נוסעים מגיעות מלוא הנקודות{gsetDefault ? '' : ' — כרגע פועלות ההגדרות שלכם'}.</p>
              <div className="space-y-3">
                {[
                  ['נסיעות בביקוש גבוה', `עד ${gset.c.highTrips.on ? gset.c.highTrips.max : 0} נקודות`, 'כמה מהנסיעות עוברות את סף הנוסעים לקטגוריה'],
                  ['יעילות ק"מ', `עד ${gset.c.efficientKm.on ? gset.c.efficientKm.max : 0} נקודות`, 'כמה מהקילומטרים נסועים על נסיעות מאוכלסות'],
                  ['עלות לנוסע', `עד ${gset.c.cost.on ? gset.c.cost.max : 0} נקודות`, 'עירוני: חייב להיות 10% מתחת לממוצע הקטגוריה — כל השאר: 20% מתחת'],
                  ['עומס נוסעים ממוצע', `עד ${gset.c.avgRiders.on ? gset.c.avgRiders.max : 0} נקודות`, 'ממוצע הנוסעים לנסיעה ביחס לסף המחמיר של הקטגוריה'],
                  ['עומס שיא', `עד ${gset.c.peak.on ? gset.c.peak.max : 0} נקודות`, 'כמה אנשים בקטע העמוס ביותר — מתחת ל-20 = לא עמוס, מקבל 0 נקודות'],
                  ['נפח שבועי', `עד ${gset.c.volume.on ? gset.c.volume.max : 0} נקודות`, 'ממוצע נוסעים × נסיעות שבועיות — מונע מקווי תלמידים וקווי פעם ביום להגיע ל-100'],
                ].map(([title, pts, desc]) => (
                  <div key={title} className="flex items-start justify-between p-5 rounded-2xl bg-slate-50 border border-slate-100">
                    <div>
                      <div className="font-black text-slate-800 text-sm">{title}</div>
                      <div className="text-slate-500 text-xs font-bold mt-1">{desc}</div>
                    </div>
                    <span className="shrink-0 ml-4 px-3 py-1 rounded-full text-[11px] font-black bg-slate-200 text-slate-700">{pts}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100">
                <h4 className="font-black text-slate-700 text-sm mb-3">סף נוסעים מינימלי לקטגוריה (קו מוזהב)</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[['עירוני תדירות גבוהה','44'],['עירוני תדירות נמוכה','21'],['תלמידים','23'],['בינעירוני ארוך','26'],['בינעירוני קצר','22'],['קווים מזינים','12'],['אזורי','12'],['לילה','25']].map(([cat,th]) => (
                    <div key={cat} className="bg-slate-50 rounded-xl p-2.5 text-right border border-slate-100">
                      <div className="text-slate-500 text-[10px] font-bold">{cat}</div>
                      <div className="font-black text-slate-900 text-sm">{th} נוסעים</div>
                    </div>
                  ))}
                </div>
                <p className="text-slate-500 text-xs font-bold mt-4">* מוצגים רק קווים עם ניקוד 60 ומעלה</p>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
