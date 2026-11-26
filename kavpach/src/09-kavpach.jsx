/* קו פח · 09-kavpach.jsx — KavPach — האפליקציה הראשית: טעינת הנתונים, קו פח וכל הלשוניות שלו, והמעבר בין הכלים.
   חלק מ-kavpach/src (הסדר ב-files.json). כל החלקים מחוברים לפי הסדר ומקומפלים יחד (tools/build_kavpach.mjs → KavPach.js),
   כך שכל השמות משותפים בין החלקים כמו בקובץ אחד. */

function KavPach() {
  // appMode: 'choice' (מסך בחירה) · 'kavpach' (קו פח) · 'golden' (הקו המוזהב)
  // מאותחל מה-hash כדי שלינקים ישירים ורענון דף יישמרו (אותה כתובת בסיס).
  // קישור עמוק לקו בודד: ‎#פח/קו/10415‎ או ‎#מוזהב/קו/10415‎ — פותח את
  // הכלי, מסנן אל הקו ומבליט אותו. בלי זה אי אפשר לשתף ממצא ספציפי.
  const parseHash = () => {
    const h = decodeURIComponent((window.location.hash || '').replace('#', '').trim());
    const m = h.match(/^(פח|kavpach|מוזהב|golden)\/קו\/(\S+)$/);
    if (m) return { mode: (m[1] === 'golden' || m[1] === 'מוזהב') ? 'golden' : 'kavpach', makat: m[2], tab: null };
    // לשונית: ‎#פח/areas‎ · ‎#מוזהב/allTrips‎
    const t = h.match(/^(פח|kavpach|מוזהב|golden)(?:\/(\w+))?$/);
    if (t) {
      const gold = t[1] === 'golden' || t[1] === 'מוזהב';
      const tab = t[2] && (gold ? GOLD_TABS : KP_TABS).includes(t[2]) ? t[2] : null;
      return { mode: gold ? 'golden' : 'kavpach', makat: null, tab };
    }
    return { mode: 'choice', makat: null, tab: null };
  };
  const [appMode, setAppMode] = useState(() => {
    if (typeof window === 'undefined') return 'choice';
    return parseHash().mode;
  });
  const [focusMakat, setFocusMakat] = useState(() => {
    if (typeof window === 'undefined') return null;
    return parseHash().makat;
  });
  const [hashTab, setHashTab] = useState(() => (typeof window === 'undefined' ? null : parseHash().tab));
  const pickMode = useCallback((m) => {
    try { window.location.hash = m === 'choice' ? '' : m; } catch (e) { /* ignore */ }
    setAppMode(m);
  }, []);

  // סנכרון כפתור Back/Forward של הדפדפן עם appMode
  useEffect(() => {
    const onHash = () => {
      const { mode, makat, tab } = parseHash();
      setAppMode(mode);
      setFocusMakat(makat);
      setHashTab(tab);
    };
    window.addEventListener('hashchange', onHash);
    // "קודם"/"הבא" בין "/" ל-"/?#פח" (ה-"?" הריק ש-nav-restore.js מוסיף בשביל "אתר מותאם למחשב" בטלפון):
    // הכתובות שונות גם לפני ה-#, ואז הדפדפן שולח רק popstate בלי hashchange (שלמה 20.11)
    window.addEventListener('popstate', onHash);
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('popstate', onHash); };
  }, []);

  const [trips, setTrips] = useState([]);
  const [lineCitiesMap, setLineCitiesMap] = useState(new Map());
  const [lineStopsMap, setLineStopsMap] = useState(new Map());
  const [dset, updDset, resetDset, dsetDefault] = useStoredSettings('kb-deadhead-score-v3', DEADHEAD_DEFAULTS);
  const [dhObs, setDhObs] = useState(null);   // bus/data/deadhead.json — הלוך-חזור של אותו רכב מהשידורים (14 יום)
  // data-lines.json — הצבירה לכל קו, מחושבת מראש ב-GitHub Actions (tools/precompute_kavpach.mjs).
  // איתה המסך הראשון עולה בלי להוריד ולפענח את לוח הזמנים; הנסיעות נטענות ברקע ללשוניות האחרות
  const [linesPre, setLinesPre] = useState(null);
  const [linesPreDone, setLinesPreDone] = useState(false);
  const [linesPreMeta, setLinesPreMeta] = useState(null);   // deps/src של הקובץ המוכן — לבדיקת עדכניות
  // הנתונים של קו פח והקו המוזהב (עשרות MB) נטענים רק כשנכנסים לאחד מהם — לא בדף הבית.
  // הפענוח שלהם תקע את הדפדפן לשניות, והעין בדף הבית נתקעה בסיבוב הראשון (שלמה 07.11)
  const linesPreStarted = useRef(false);
  useEffect(() => {
    if (appMode === 'choice' || linesPreStarted.current) return;
    linesPreStarted.current = true;
    (async () => {
      try {
        const r = await fetch('data-lines.json', { cache: 'no-cache' });
        const d = r.ok ? await r.json() : null;
        if (!d || !Array.isArray(d.lines) || !d.lines.length) return;
        // עדכניות: הקובץ המוכן נבנה מקובצי הנתונים בגודל מסוים; אם הקבצים החיים באתר
        // שונים (עודכנו ועוד לא נבנה מחדש) — לא משתמשים בו, ומחשבים בדפדפן כמו קודם
        try {
          const heads = await Promise.all(['data-main.json', 'data-schedule.json'].map(f => fetch(f, { method: 'HEAD', cache: 'no-cache' }).then(h => (h.ok ? h.headers.get('content-length') : null)).catch(() => null)));
          const want = [d.src && d.src.main, d.src && d.src.schedule];
          const stale = heads.some((h, i) => h && want[i] && String(h) !== String(want[i]));
          if (stale) { console.warn('data-lines.json לא תואם את קובצי הנתונים — מחשבים בדפדפן'); return; }
        } catch (e) { /* בלי HEAD — מקבלים את הקובץ */ }
        setLinesPreMeta({ deps: d.deps || {}, updated: d.updated });
        setLinesPre(d.lines);
      } catch (e) { /* אין קובץ מוכן — המסלול הישן */ }
      finally { setLinesPreDone(true); }
    })();
  }, [appMode]);
  // הקבצים הנלווים (ארכיון, חפיפות, נסיעות תפעוליות, ~3MB) נטענים אחרי המסך הראשון:
  // הניקוד המוכן בקובץ כבר כולל אותם, והם נחוצים רק להגדרות מותאמות ולפרטים בכרטיסים
  const [depsStart, setDepsStart] = useState(false);
  const [depsDone, setDepsDone] = useState(0);
  useEffect(() => {
    if (!linesPreDone) return;
    if (!linesPre) { setDepsStart(true); return; }
    const later = typeof requestIdleCallback === 'function' ? (f) => requestIdleCallback(f, { timeout: 3000 }) : (f) => setTimeout(f, 1500);
    later(() => setDepsStart(true));
  }, [linesPreDone, linesPre]);
  useEffect(() => {
    if (!depsStart) return;
    fetch('bus/data/deadhead.json', {cache:'no-cache'}).then(r => (r.ok ? r.json() : null)).then(d => d && setDhObs(d)).catch(() => {}).finally(() => setDepsDone(n => n + 1));
  }, [depsStart]);
  // מחושב רק כשהלשונית פתוחה (dhOpened) — לא מכביד על טעינת האתר
  const [dhOpened, setDhOpened] = useState(false);
  const deadhead = useMemo(() => (dhOpened ? computeDeadhead(trips || [], lineStopsMap, dset, dhObs) : null),
    [dhOpened, trips, lineStopsMap, dset, dhObs]);
  const [lineNormStopsMap, setLineNormStopsMap] = useState(new Map());
  const [costBenchmarkTable, setCostBenchmarkTable] = useState(null);
  const [csvLoadFailed, setCsvLoadFailed] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const [fileLoad, setFileLoad] = useState({ active: false, progress: 0, message: "מנתח נתונים..." });
  const setFileLoading = (active) => setFileLoad(s => ({ ...s, active }));
  const setFileProgress = (progress) => setFileLoad(s => ({ ...s, progress }));
  const setFileMessage = (message) => setFileLoad(s => ({ ...s, message }));
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const [tab, setTab] = useState(() => (appMode === 'kavpach' && KP_TABS.includes(hashTab) ? hashTab : "redundant"));
  useEffect(() => { if (appMode === 'kavpach' && KP_TABS.includes(hashTab)) setTab(hashTab); }, [hashTab, appMode]);
  useEffect(() => { if (appMode === 'kavpach') syncTabHash('פח', KP_TABS, tab); }, [tab, appMode]);
  useEffect(() => { if (tab === "deadhead") setDhOpened(true); }, [tab]);
  const [dhOpen, setDhOpen] = useState(null);       // קו פתוח בטבלת הנסיעות התפעוליות
  const [dhNearOnly, setDhNearOnly] = useState(false);
  const [searchCity, setSearchCity] = useState("");
  const [overlapMap, setOverlapMap] = useState(null); // חפיפת מסלולים בין קווים (kavpach-overlap.json, מתעדכן לילית)
  useEffect(() => {
    if (!depsStart) return;
    fetch('kavpach-overlap.json', {cache:'no-cache'}).then(r => (r.ok ? r.json() : null)).then(d => d && setOverlapMap(d.lines || null)).catch(() => {}).finally(() => setDepsDone(n => n + 1));
  }, [depsStart]);
  // הדלתא מהארכיון של "הקו בזמן" (kavpach-live.json, נבנה לילית): קווים
  // שכבר בוטלו, נסיעות עדכניות, צמצומים, קווים חדשים והשבתות. נתוני
  // הליבה כאן הם צילום מיוני 2026 — בלי זה הכלי ממליץ לבטל קווים
  // שכבר בוטלו. נטען ברקע; אם איננו — הכל עובד כמו קודם.
  const [liveMap, setLiveMap] = useState(null);
  const [liveGen, setLiveGen] = useState('');
  // החברה המפעילה לכל מקט (ops = שמות, opOf = מקט ← מספר) — לסינון באלגוריתם הייעול
  const [liveOps, setLiveOps] = useState(null);
  useEffect(() => { if (linesPreMeta && linesPreMeta.deps && linesPreMeta.deps.live) setLiveGen(g => g || linesPreMeta.deps.live); }, [linesPreMeta]);
  useEffect(() => {
    if (!depsStart) return;
    fetch('kavpach-live.json').then(r => (r.ok ? r.json() : null)).then(d => {
      if (d) { setLiveMap(d.lines || null); setLiveGen(d.gen || ''); if (d.ops && d.opOf) setLiveOps({ ops: d.ops, opOf: d.opOf }); }
    }).catch(() => {}).finally(() => setDepsDone(n => n + 1));
  }, [depsStart]);
  // הכרטיסים מאגדים את שני הכיוונים — לכן החיפוש ברמת המקט השלם
  // (מפתח בלי מקף בדלתא); המקט בקו פח מגיע עם אפסים מובילים
  const liveOf = useCallback((makat) => {
    if (!liveMap) return null;
    const mk = String(makat || '').replace(/^0+/, '').trim();
    return liveMap[mk] || null;
  }, [liveMap]);
  const operatorOf = useCallback((makat) => {
    if (!liveOps) return '';
    const ix = liveOps.opOf[String(makat || '').replace(/^0+/, '').trim()];
    return ix == null ? '' : (liveOps.ops[ix] || '');
  }, [liveOps]);
  const [filterDistrict, setFilterDistrict] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [redundantSortBy, setRedundantSortBy] = useState("score");
  // חיפוש לפי מספר קו / מק"ט (כמה בפסיקים) ולפי חברה מפעילה — לנציגי חברות ולמשרד (שלמה 18.11).
  // "כל הקווים של החברה" מציג גם קווים יעילים (מתחת לסף הכניסה לרשימה), עם הציון שלהם
  const [redLine, setRedLine] = useState("");
  const [redOperator, setRedOperator] = useState("all");
  const [redAllOfOp, setRedAllOfOp] = useState(true);
  // הגדרות הניקוד של המשתמש (שלמה 07.09: "לבחור מה זה קו טוב") + סינון מספרי
  const [pset, updPset, resetPset, psetDefault] = useStoredSettings('kb-pach-score', PACH_DEFAULTS);
  const [scoreBand, setScoreBand] = useState(null);   // רמת ציון מכרטיס הסיכום (min של STATUS_TIERS), null = הכל
  const [pFilt, setPFilt] = useState({ minScore: null, minWasted: null, maxRiders: null, minTrips: null });
  const pFiltOn = Object.values(pFilt).some(v => v != null);
  const [showCrowded, setShowCrowded] = useState(false);
  const [visibleTripsCount, setVisibleTripsCount] = useState(60);
  const [visibleLineCount, setVisibleLineCount] = useState(30);
  const [filterLineType, setFilterLineType] = useState("all");
  
  // ── אזורים חלשים State ──
  const [areaViewMode, setAreaViewMode] = useState("city");
  const [areaSortBy, setAreaSortBy] = useState("wastedKm");

  const [optLine, setOptLine] = useState("");
  const [optCity, setOptCity] = useState("all");
  const [optOperator, setOptOperator] = useState("all");
  const [optKm, setOptKm] = useState(null);   // ק"מ בשבוע לפני ואחרי ההמלצות של הריצה האחרונה
  const [optRunInfo, setOptRunInfo] = useState({ operator: "all", city: "all" });   // הסינון של הריצה האחרונה — לשורת הסיכום ולשם קובץ האקסל
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
    // לפני שהנסיעות הגיעו — מהרשומות המחושבות מראש
    for (const r of (linesPre || [])) {
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

  // החברות המפעילות שיש להן נסיעות בסימולציה, עם מספר הקווים (מקטים, בלי קווים שכבר בוטלו)
  const operatorOptions = useMemo(() => {
    if (!liveOps || trips.length === 0) return [];
    const byOp = new Map();
    for (let i = 0; i < trips.length; i++) {
      const mk = String(trips[i].makat || '').replace(/^0+/, '').trim();
      if (!mk) continue;
      const op = operatorOf(mk);
      if (!op) continue;
      const live = liveOf(mk);
      if (live && live.rm) continue;
      if (!byOp.has(op)) byOp.set(op, new Set());
      byOp.get(op).add(mk);
    }
    return [...byOp.entries()].map(([name, set]) => ({ name, lines: set.size }))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [trips, liveOps, operatorOf, liveOf]);

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
            // כמו ב-xlsx-worker: רק בינעירוני ארוך לאילת וממנה, לא הקווים העירוניים בתוך אילת
            isEilatPrebooked: (origin.includes("אילת") || dest.includes("אילת")) && lineType.includes("בינעירוני") && distance > 45,
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
      seen.add(m); aliases.push([m, String(t.lineNum || '')]);
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
        const res = await fetch('data-stops.json', { cache: 'no-cache' });
        if (!res.ok) return;
        const buf = await res.arrayBuffer();
        const worker = new Worker('xlsx-worker.js?v=20260918a');
        worker.onmessage = (ev) => {
          const msg = ev.data || {};
          if (msg.type === 'stops') {
            const lcm = msg.lineCitiesMap instanceof Map ? msg.lineCitiesMap : new Map();
            const lsm = msg.lineStopsMap instanceof Map ? msg.lineStopsMap : new Map();
            const lnsm = msg.lineNormStopsMap instanceof Map ? msg.lineNormStopsMap : new Map();
            setLineCitiesMap(lcm); setLineStopsMap(lsm); setLineNormStopsMap(lnsm);
            // המפות נשמרות תחת מפתח משלהן — בלי לשכפל שוב את 200 אלף הנסיעות
            if (fileKeyRef.current) idbSetCache(IDB_KEY + '-stops', { fileKey: fileKeyRef.current, lineCitiesMap: lcm, lineStopsMap: lsm, lineNormStopsMap: lnsm, savedAt: Date.now() });
          }
          worker.terminate();
        };
        worker.onerror = () => worker.terminate();
        worker.postMessage({ type: 'stops', jsonStopsBuf: buf, aliases }, [buf]);
      } catch (e) { /* בלי תחנות — האתר עובד, בלי חיפוש עיר מדויק */ }
    };
    const later = typeof requestIdleCallback === 'function' ? (f) => requestIdleCallback(f, { timeout: 4000 }) : (f) => setTimeout(f, 1500);
    later(go);
  }, [initialLoading, trips, appMode, lineStopsMap]);

  // ── טעינה אוטומטית בעליית הקומפוננטה ──────────────────────────────────────
  // 4 קבצי מקור: מצומצם(ראשי) · מרחוב(לוז/שעות) · תחנות · עלות לנוסע(בנצ'מרק)
  const loadFromXLSX = useCallback(async () => {
    const FILES = {
      main: 'מצומצם.xlsx',
      schedule: 'מרחוב.xlsx',
      stops: 'תחנות.xlsx',
      benchmark: 'עלות לנוסע.xlsx',
    };
    // מפתח הקאש נגזר מהקבצים שבאמת נטענים — ה-JSON. ה-HEAD לקובצי ה-xlsx
    // הישנים החזיר 404, המפתח נשאר ריק, והקאש המקומי (IndexedDB) לא שימש
    // אף פעם: כל כניסה הורידה ופענחה מחדש 31MB (שלמה 18.09: "האתר איטי")
    const KEY_FILES = ['data-main.json', 'data-schedule.json', 'data-stops.json', 'data-benchmark.json'];
    try {
      // שלב 1: HEAD מקביל לכל הקבצים → מפתח קאש משולב.
      let fileKey = null;
      try {
        const sigs = await Promise.all(
          KEY_FILES.map(f =>
            // cache: 'no-cache' מאלץ אימות-מחדש מול השרת (304 אם לא השתנה) —
            // כך חתימת הקובץ תמיד עדכנית והקאש המקומי מתעדכן כשהנתונים משתנים.
            fetch(f, { method: 'HEAD', cache: 'no-cache' }).then(r => (r.ok ? (fileKeyFromHeaders(r) || '') : '')).catch(() => '')
          )
        );
        const combined = sigs.filter(Boolean).join('|');
        if (combined) fileKey = combined;
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
          setCostBenchmarkTable(cached.costBenchmark || null);
          // DEBUG: חשיפה ל-window גם בטעינה מהקאש
          if (typeof window !== 'undefined') {
            window.__kp_trips = cached.trips;
            window.__kp_maps = {
              cities: cached.lineCitiesMap || new Map(),
              stops: cached.lineStopsMap || new Map(),
              normStops: cached.lineNormStopsMap || new Map(),
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
        try { res = await fetch(f, { cache: 'no-cache' }); } catch(e) { if (required) throw e; return null; }
        if (!res.ok) { if (required) throw new Error(f + ' missing'); return null; }
        const total = Number(res.headers.get('content-length') || 0);
        const reader = res.body.getReader();
        const chunks = [];
        let received = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          if (total > 0 && onBytes) onBytes(received, total);
        }
        const buf = new Uint8Array(received);
        let pos = 0;
        for (const c of chunks) { buf.set(c, pos); pos += c.length; }
        return buf.buffer;
      };

      // ── מסלול מהיר: JSON (אם קיים) ──────────────────────────────────────
      // קבצי JSON נוצרים מראש ע"י convert-to-json.js (~12MB במקום 46MB XLSX).
      // JSON.parse מהיר 50× מ-SheetJS — ~5 שניות במובייל במקום ~2 דקות.
      const jsonProbeCtl = new AbortController();
      const jsonProbeTimer = setTimeout(() => jsonProbeCtl.abort(), 3000);
      const jsonMainRes = await fetch('data-main.json', { cache: 'no-cache', signal: jsonProbeCtl.signal }).catch(() => null);
      clearTimeout(jsonProbeTimer);
      if (jsonMainRes && jsonMainRes.ok) {
        setFileMessage('מוריד נתונים (JSON)…');
        const JSON_EST = { main: 965_000, schedule: 9_840_000, benchmark: 3_000 };
        const jsonTotalEst = Object.values(JSON_EST).reduce((a, b) => a + b, 0);
        const jsonReceived = { main: 0, schedule: 0, benchmark: 0 };
        const updateJsonProgress = () => {
          const done = Object.entries(jsonReceived).reduce((s, [k, v]) => s + Math.min(v, JSON_EST[k]), 0);
          setFileProgress(Math.min(20, 2 + Math.round((done / jsonTotalEst) * 18)));
        };
        // הקובץ הראשי כבר נטען — נמשוך ממנו את הנתונים
        const jsonMainReader = jsonMainRes.body.getReader();
        const jsonMainChunks = []; let jmRec = 0;
        while (true) {
          const { done, value } = await jsonMainReader.read();
          if (done) break;
          jsonMainChunks.push(value); jmRec += value.length;
          jsonReceived.main = jmRec; updateJsonProgress(); setFileMessage('מוריד נתוני קווים…');
        }
        const jmBuf = new Uint8Array(jmRec); let jmPos = 0;
        for (const c of jsonMainChunks) { jmBuf.set(c, jmPos); jmPos += c.length; }

        // קובץ התחנות (15MB, הכבד מכולם) לא נטען כאן: הוא נדרש רק לחיפוש לפי עיר,
        // לחפיפות ולנסיעות התפעוליות — נטען בעצלות אחרי שהמסך הראשון הוצג (שלמה 18.09)
        const [jsonScheduleBuf, jsonBenchmarkBuf] = await Promise.all([
          grabWithProgress('data-schedule.json', false, (b) => { jsonReceived.schedule = b; updateJsonProgress(); }),
          grabWithProgress('data-benchmark.json',false, (b) => { jsonReceived.benchmark = b; updateJsonProgress(); }),
        ]);

        setFileMessage('מנתח נתונים…');
        await runWorker({ jsonMainBuf: jmBuf.buffer, jsonScheduleBuf, jsonBenchmarkBuf });
        return true;
      }

      // ── מסלול רגיל: XLSX ─────────────────────────────────────────────────
      // גדלי קבצים משוערים (בבייטים) לחישוב progress כולל
      const EST = { main: 1_200_000, schedule: 24_000_000, stops: 22_000_000, benchmark: 20_000 };
      const totalEst = Object.values(EST).reduce((a, b) => a + b, 0);
      const received = { main: 0, schedule: 0, stops: 0, benchmark: 0 };
      const updateProgress = () => {
        const done = Object.entries(received).reduce((s, [k, v]) => s + Math.min(v, EST[k]), 0);
        const pct = Math.min(20, 2 + Math.round((done / totalEst) * 18));
        const mb = (done / 1_000_000).toFixed(1);
        const totalMb = (totalEst / 1_000_000).toFixed(0);
        setFileProgress(pct);
        setFileMessage(`מוריד נתונים… ${mb} / ${totalMb} MB`);
      };

      const [main, schedule, stops, benchmark] = await Promise.all([
        grabWithProgress(FILES.main,      true,  (b) => { received.main      = b; updateProgress(); }),
        grabWithProgress(FILES.schedule,  false, (b) => { received.schedule  = b; updateProgress(); }),
        grabWithProgress(FILES.stops,     false, (b) => { received.stops     = b; updateProgress(); }),
        grabWithProgress(FILES.benchmark, false, (b) => { received.benchmark = b; updateProgress(); }),
      ]);
      setFileMessage('מנתח נתונים…');
      await runWorker({ main, schedule, stops, benchmark });
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
    const go = () => { if (cancelled) return; (async () => { const ok = await loadFromXLSX(); if (!ok) loadFromCSV(); })(); };
    let h = null;
    if (linesPre && linesPre.length) {
      // שלוש שניות אחרי המסך הראשון — שהמשתמש יראה ויתחיל לגלול לפני שהמעבד עסוק בנסיעות
      h = setTimeout(() => { const later = typeof requestIdleCallback === 'function' ? (f) => requestIdleCallback(f, { timeout: 3000 }) : (f) => setTimeout(f, 300); later(go); }, 3000);
    } else go();
    return () => { cancelled = true; };
  }, [loadFromXLSX, loadFromCSV, retryCount, linesPreDone]);

  // טוען את ספריית XLSX ברקע (לצרכי ייצוא לאקסל בלבד — הפרסור עצמו רץ ב-worker).
  // קריאה לא חוסמת — אם הפרסור מסתיים לפני שה-XLSX הסתיים, אין בעיה.
  useEffect(() => {
    loadXLSX().catch(() => { /* swallow */ });
  }, []);

  // ── runWorker — שולח payload ל-Web Worker ומטמיע את התוצאה ──────────────
  // payload: { buffer } (קובץ יחיד/ידני) או { main, schedule, stops, benchmark }.
  const runWorker = (payload) => {
    return new Promise((resolve) => {
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

      worker.onmessage = (ev) => {
        const msg = ev.data;
        if (!msg) return;
        if (msg.type === 'progress') {
          // הורדה מסתיימת ב-42%; ממירים את אחוזי ה-Worker (0-100) לטווח 42-100
          // כך שהסרגל ממשיך קדימה ולא קופץ אחורה בעת מעבר משלב הורדה לשלב פרסור
          const remapped = 20 + Math.round((msg.percent / 100) * 79);
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
            window.__kp_maps = { cities: lcm, stops: lsm, normStops: lnsm };
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
              savedAt: Date.now(),
            };
            const later = typeof requestIdleCallback === 'function' ? (f) => requestIdleCallback(f, { timeout: 8000 }) : (f) => setTimeout(f, 2500);
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

      worker.onerror = (err) => {
        console.error('Worker exception:', err);
        alert('שגיאה בעיבוד הקובץ: ' + (err.message || 'unknown'));
        setFileLoading(false);
        worker.terminate();
        resolve();
      };

      // העברה ב-transfer: ה-buffers עוברים למחזיק ה-worker בלי copy.
      const buffers = payload.buffer
        ? [payload.buffer]
        : ['main', 'schedule', 'stops', 'benchmark'].map(k => payload[k]).filter(Boolean);
      try {
        worker.postMessage({ type: 'parse', ...payload }, buffers);
      } catch (err) {
        // fallback אם הדפדפן לא תומך ב-transferable
        worker.postMessage({ type: 'parse', ...payload });
      }
    });
  };

  // העלאה ידנית של קובץ יחיד (זרימת legacy — workbook עם כל הגיליונות).
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
    return runWorker({ buffer });
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
  const redundantLinesAll = useMemo(() => {
    if (appMode !== 'kavpach') return [];
    // הניקוד המוכן (ברירת מחדל, מהשרת) עד שהקבצים הנלווים נטענו; אחר כך — חישוב זהה
    // בדפדפן, שמעדכן אם קובץ נלווה התחדש מאז הבנייה או אם המשתמש שינה הגדרות
    const usePre = linesPre && linesPre.length && psetDefault && depsDone < 3 && lineRecords[0] && lineRecords[0].sc;
    const ctx = { pset, liveOf, overlapMap, dhObs };
    return lineRecords.map(r => (usePre ? toLine(r, r.sc) : scoreGroup(r, ctx))).sort((a, b) => b.score - a.score);
  }, [lineRecords, liveOf, overlapMap, pset, appMode, dhObs, linesPre, psetDefault, depsDone]);
  // allScoredLines — כל הקווים עם ציון; redundantLines — רק מה שעובר את סף הכניסה לרשימה
  const allScoredLines = redundantLinesAll;
  const redundantLines = useMemo(() => {
    const th = Number(pset.minScore) || 0;
    return allScoredLines.filter(l => l.score >= th);
  }, [allScoredLines, pset.minScore]);

  const cleanMk = (v) => String(v || '').replace(/^0+/, '').trim();
  // החברות המפעילות של קו (בדרך כלל אחת) — מהמק"טים שלו
  const lineOps = useCallback((l) => {
    const mks = (l.makats && l.makats.length) ? l.makats : [l.makat];
    return [...new Set(mks.map(mk => operatorOf(mk)).filter(Boolean))];
  }, [operatorOf]);
  // החברות לבחירה ברשימת הקווים, עם מספר הקווים של כל אחת
  const redOperatorOptions = useMemo(() => {
    if (!liveOps || !allScoredLines.length) return [];
    const cnt = new Map();
    allScoredLines.forEach(l => lineOps(l).forEach(op => cnt.set(op, (cnt.get(op) || 0) + 1)));
    return [...cnt.entries()].map(([name, lines]) => ({ name, lines })).sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [allScoredLines, liveOps, lineOps]);
  // מק"ט ← הקו (ק"מ שבועי ומבוזבז) — לכרטיסים ולסיכום של אלגוריתם הייעול
  const lineByMakat = useMemo(() => {
    const m = new Map();
    allScoredLines.forEach(l => ((l.makats && l.makats.length) ? l.makats : [l.makat]).forEach(mk => { const k = cleanMk(mk); if (k && !m.has(k)) m.set(k, l); }));
    return m;
  }, [allScoredLines]);
  // ק"מ מבוזבזים בשבוע של הקו (כל הכיוונים) לפי מק"ט; null = אין נתוני ק"מ
  const wastedOfMakat = useCallback((mk) => {
    const l = lineByMakat.get(cleanMk(mk));
    return l && l.totalKm > 0 ? (l.wastedKm || 0) : null;
  }, [lineByMakat]);

  const redLineVals = useMemo(() => redLine.split(',').map(cleanMk).filter(Boolean), [redLine]);
  const redShowAll = redAllOfOp && (redOperator !== "all" || redLineVals.length > 0);
  const filteredRedundant = useMemo(() => {
    let result = [...(redShowAll ? allScoredLines : redundantLines)];
    if (redLineVals.length) {
      result = result.filter(r => redLineVals.includes(cleanMk(r.lineNum)) ||
        ((r.makats && r.makats.length) ? r.makats : [r.makat]).some(mk => redLineVals.includes(cleanMk(mk))));
    }
    if (redOperator !== "all") result = result.filter(r => lineOps(r).includes(redOperator));
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
    // רמת ציון מכרטיס הסיכום (שלמה 18.11): חמור / לא יעיל / טעון בדיקה / סטייה קלה
    if (scoreBand != null) {
      const ti = STATUS_TIERS.findIndex(t => t.min === scoreBand);
      const top = ti > 0 ? STATUS_TIERS[ti - 1].min : Infinity;
      result = result.filter(r => r.score >= scoreBand && r.score < top);
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
  }, [redundantLines, allScoredLines, redShowAll, redLineVals, redOperator, lineOps, searchCity, filterDistrict, filterCategory, lineCitiesMap, redundantSortBy, focusMakat, pFilt, scoreBand]);

  // חוזרים ל-30 רק כשהמשתמש משנה סינון או מיון — לא כשקובץ נתונים נוסף נטען ברקע (אז הרשימה הייתה מתקפלת באמצע הגלילה)
  useEffect(() => { setVisibleLineCount(30); }, [redShowAll, redLineVals, redOperator, searchCity, filterDistrict, filterCategory, redundantSortBy, focusMakat, pFilt, scoreBand]);

  const areaStats = useMemo(() => {
    if (tab !== 'areas') return [];   // מחושב רק כשהלשונית פתוחה (שלמה: lazy calculating)
    const map = new Map();
    redundantLines.forEach(line => {
      // כאן הוספנו את הסינון - הניתוח האזורי יתייחס רק לקווים מיותרים לחלוטין (80 ומעלה)
      if (line.score < 80) return;
      // קו שכבר בוטל — הבזבוז שלו כבר נגמר; לספור אותו בניתוח האזורי
      // היה מנפח את "פוטנציאל החיסכון" של האזור במשהו שכבר נחסך
      if (line.live && line.live.rm) return;

      const keys = areaViewMode === 'district' 
        ? [line.district] 
        : Array.from(new Set([line.origin, line.dest]));

      keys.forEach(key => {
        if (!key || key === "לא ידוע" || key === "כללי") return;
        if (!map.has(key)) {
          map.set(key, { name: key, totalScore: 0, lineCount: 0, totalWastedKm: 0, totalCost: 0, validCostCount: 0, sumAvgRiders: 0, totalAreaTrips: 0, totalAreaRiders: 0, totalAnnualExcess: 0 });
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

  const handleViewAreaLines = (areaName) => {
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

  // סיכום הרשימה המסוננת: ק"מ שבועי וק"מ מבוזבז (רק קווים עם נתוני ק"מ)
  const redSummary = useMemo(() => {
    let km = 0, wasted = 0;
    filteredRedundant.forEach(l => { if (l.totalKm > 0) { km += l.totalKm; wasted += l.wastedKm || 0; } });
    return { lines: filteredRedundant.length, km, wasted, pct: km > 0 ? wasted / km * 100 : null };
  }, [filteredRedundant]);
  // כותרת הסיכום ושם הקובץ — לפי הסינון שנבחר
  const redFilterParts = () => [
    scoreBand != null ? (STATUS_TIERS.find(t => t.min === scoreBand) || {}).label : '',
    redOperator !== "all" ? redOperator : '',
    searchCity || '',
    filterDistrict !== "all" ? filterDistrict : '',
    filterCategory !== "all" ? filterCategory : '',
    redLineVals.length ? `קו ${redLineVals.join(', ')}` : '',
  ].filter(Boolean);

  const exportRedundantToExcel = async () => {
    if (!filteredRedundant.length) return;
    await loadXLSX();
    const pctOf = (l) => (l.totalKm > 0 ? Math.round((l.wastedKm || 0) / l.totalKm * 1000) / 10 : '—');
    const exportData = filteredRedundant.map(l => {
      const mks = (l.makats && l.makats.length) ? l.makats : [l.makat];
      return {
        'מספר קו': l.lineNum,
        'מק"ט': mks.map(cleanMk).filter(Boolean).join(', '),
        'חברה מפעילה': lineOps(l).join(', ') || '—',
        'מוצא – יעד': `${l.origin} – ${l.dest}`,
        'מחוז': l.district,
        'קטגוריה': l.category,
        'ק"מ בשבוע': l.totalKm > 0 ? l.totalKm : '—',
        'ק"מ מבוזבזים בשבוע': l.totalKm > 0 ? (l.wastedKm || 0) : '—',
        'אחוז מבוזבז': pctOf(l),
        'ציון אי-יעילות': l.score,
      };
    });
    const ws = window.XLSX.utils.json_to_sheet(exportData);
    const wb = window.XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] }; // מימין לשמאל — SheetJS קורא את זה רק מהחוברת, לא מ-!views של הגיליון
    window.XLSX.utils.book_append_sheet(wb, ws, "קווים");
    const parts = redFilterParts().map(v => String(v).replace(/,\s*/g, '-').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim());
    window.XLSX.writeFile(wb, parts.length ? `קו_פח_${parts.join('_')}.xlsx` : 'קו_פח_קווים_לא_יעילים.xlsx');
  };

  const exportAreaToExcel = async (areaName, viewMode) => {
    await loadXLSX();   // הספרייה נטענת ברקע — בלי לחכות לה, לחיצה מוקדמת לא עשתה כלום
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
      'ק"מ שימושי (ללא סרק)': line.nonWastedKm,
    }));

    const ws = window.XLSX.utils.json_to_sheet(exportData);
    const wb = window.XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] }; // מימין לשמאל — SheetJS קורא את זה רק מהחוברת, לא מ-!views של הגיליון
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
        const isLine = sLine && (String(t.lineNum).trim() === searchCity.trim() ||
          String(t.makat || '').replace(/^0+/, '').trim() === sLine);
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

  const runOptimization = async (overrideLine, overrideCity, overrideDirection, overrideDays, overrideOperator) => {
    const lineToUse = typeof overrideLine === 'string' ? overrideLine : optLine;
    const cityToUse = typeof overrideCity === 'string' ? overrideCity : optCity;
    const operatorToUse = typeof overrideOperator === 'string' ? overrideOperator : optOperator;
    const dirToUse = typeof overrideDirection === 'string' ? overrideDirection : optDirection;
    const daysToUse = Array.isArray(overrideDays) ? overrideDays : optDays;
    setSimLoading(true);
    setVisibleOptCount(50);
    await yieldFrame();

    // קווים שכבר בוטלו לפי ארכיון "הקו בזמן" לא נכנסים לסימולציה: בלעדי
    // הבדיקה הכלי המליץ "לבטל" נסיעות של קווים מתים — כולל באקסל המיוצא
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

      if (operatorToUse && operatorToUse !== "all" && operatorOf(t.makat) !== operatorToUse) return false;
      
      if (dirToUse && dirToUse !== "all" && !String(t.direction).includes(dirToUse)) return false;
      
      if (daysToUse && daysToUse.length > 0) {
        const hasMatchingDay = daysToUse.some(day => t.daysList.includes(String(day)));
        if (!hasMatchingDay) return false;
      }
      // בדיקת הביטול אחרונה — נספרים רק קווים שבאמת היו נכנסים לריצה
      // הזו, לא כל 338 המבוטלים שבמאגר (ציד הבאגים, סבב ב)
      const live = liveOf(t.makat);
      if (live && live.rm) return false;
      return true;
    });

    setOptRunInfo({ operator: operatorToUse || "all", city: cityToUse || "all" });
    setOptKm(null);
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
      // נסיעות ביום (לא בשבוע): tripCount הוא שבועי לשורה, ולכן מחלקים במספר הימים שלה — הסף 'מינימום נסיעות ביום' וסף האיחוד הם ליום
      const nDays = (t.daysList && t.daysList.length) || 1;
      lineDayCounts[countKey] = (lineDayCounts[countKey] || 0) + (t.tripCount || 1) / nDays;
    });

    const customGapValue = parseInt(optCustomGap, 10);
    const groupEntries = Object.values(grouped);
    const GSIM_CHUNK = 300; 
    // ק"מ בשבוע: היום, נחסך בהמלצות, וק"מ סרק שנשאר — ולמה נשאר
    const kmAgg = { total: 0, wasted: 0, saved: 0, remain: 0, reasons: {}, lines: new Map() };

    for (let gi = 0; gi < groupEntries.length; gi++) {
      const group = groupEntries[gi];
      group.sort((a,b) => a.timeMins - b.timeMins);
      const usedTrips = new Set();
      // נסיעות שבוטלו בריצה הזו — נסיעה מבוטלת אינה "חלופה קרובה" למי
      // שבא לבטל את השכנה שלה (אחרת שתי נסיעות סמוכות מבטלות זו את זו)
      const cancelledIds = new Set();
      // שעת היעד החדשה של נסיעות שאוחדו — בדיקת "חלופה קרובה" נמדדת
      // מהשעה האמיתית אחרי ההזזה, לא מהשעה המקורית (ציד הבאגים, סבב ב)
      const effTime = new Map();
      const cancelInfo = new Map();   // id -> {rec, gapCheck, dayKey} לאימות בדיעבד
      let cancelledInGroup = 0;
      const blockReason = new Map();   // id -> למה נסיעה חלשה לא בוטלה (edge/min/noalt)
      const mergedOut = new Set();     // הנסיעה שיורדת באיחוד
      const mergedKeep = new Map();    // הנסיעה שנשארת באיחוד -> נוסעים של שתיהן
      
      for(let i = 0; i < group.length; i++) {
        const t1 = group[i];
        if (usedTrips.has(t1.id)) continue;

        const t2 = i < group.length - 1 ? group[i+1] : null;
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
        const isNight = t1.isNightLine;   // רק קו שהמשרד מגדיר כקו לילה, לא לפי השעה (שלמה 15.10)
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
            if (gap2 >= 0 && gap2 < gap1 && gap2 <= maxGapMerge && val2 < maxRidersEach && val3 < maxRidersEach && totalVal2 < maxTotalMerge) {
              skipForBetterMerge = true; 
            }
          }

          if (!skipForBetterMerge && gap1 >= 0 && gap1 <= maxGapMerge && val1 < maxRidersEach && val2 < maxRidersEach && totalVal1 < maxTotalMerge && (!isNight || hasCustomGap)) {
            const suggestedMins = Math.floor((t1.timeMins + t2.timeMins) / 2);
            const suggestedTime = `${String(Math.floor(suggestedMins/60)).padStart(2,'0')}:${String(suggestedMins%60).padStart(2,'0')}`;

            results.push({
              type: 'merge',
              isNightLine: t1.isNightLine,
              isEilatPrebooked: t1.isEilatPrebooked,
              isFeedingLine: t1.isFeedingLine,
              categoryLabel: category === 'urban' ? 'עירוני' : category === 'regional' ? 'אזורי' : 'בין-עירוני',
              line: t1.lineNum, makat: t1.makat, origin: t1.origin, dest: t1.dest, direction: t1.direction,
              // ק"מ בשבוע שנחסכים: נסיעה אחת פחות בכל יום פעילות
              km: (Number(t1.distance) || 0) * (Number(t1.tripCount) || 1),
              from: t1.time, to: t2.time, timeMins: t1.timeMins, suggestedTime: suggestedTime,
              days: t1.days, gap: gap1, usedMetric: optMetric, total: Number(totalVal1.toFixed(2)), val1: val1, val2: val2,
              busSize: t1.busSize, capacity: t1.capacity, efficiency: t1.efficiency, metricVal: val1
            });
            usedTrips.add(t1.id); usedTrips.add(t2.id); merged = true; actionTaken = true;
            mergedOut.add(t1.id); mergedKeep.set(t2.id, (t1.ridership || 0) + (t2.ridership || 0));
            effTime.set(t1.id, suggestedMins); effTime.set(t2.id, suggestedMins);
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
            const minRequired = !isNaN(userMinTrips) ? userMinTrips : (category === 'regional' ? 3 : 0);

            if ((totalTripsBothDirs - currentCancelledBoth) <= minRequired) { allowCancel = false; blockReason.set(t1.id, 'min'); }

            // הגנה חדשה: אסור לבטל נסיעה ראשונה או אחרונה ביום של הקו והכיוון.
            // ביטול קצוות יומיים פוגע פגיעה לא פרופורציונלית בנוסעים שתלויים בקו.
            const isFirstOfDay = i === 0;
            const isLastOfDay  = i === group.length - 1;
            if (isFirstOfDay || isLastOfDay) { allowCancel = false; blockReason.set(t1.id, 'edge'); }

            if (allowCancel) {
              let hasAlternative = false; 
              const prev = i > 0 ? group[i-1] : null; const next = t2;
              
              const prevT = prev ? (effTime.has(prev.id) ? effTime.get(prev.id) : prev.timeMins) : 0;
              if (prev && !cancelledIds.has(prev.id) && (t1.timeMins - prevT) <= cancelGapCheck) hasAlternative = true;
              if (next && (next.timeMins - t1.timeMins) <= cancelGapCheck) hasAlternative = true;

              if (!hasAlternative) blockReason.set(t1.id, 'noalt');
              if (hasAlternative) {
                results.push({
                  type: 'cancel', isNightLine: t1.isNightLine, isEilatPrebooked: t1.isEilatPrebooked, isFeedingLine: t1.isFeedingLine,
                  categoryLabel: category === 'urban' ? 'עירוני' : category === 'regional' ? 'אזורי' : 'בין-עירוני',
                  line: t1.lineNum, makat: t1.makat, km: (Number(t1.distance) || 0) * (Number(t1.tripCount) || 1), origin: t1.origin, dest: t1.dest, direction: t1.direction,
                  time: t1.time, timeMins: t1.timeMins, days: t1.days, usedMetric: optMetric, metricVal: valCancel, efficiency: t1.efficiency,
                  busSize: t1.busSize, capacity: t1.capacity
                });
                usedTrips.add(t1.id); cancelledIds.add(t1.id); cancelledInGroup++; cancelledCountByLineDay[dayKey] = (cancelledCountByLineDay[dayKey] || 0) + 1; actionTaken = true;
                cancelInfo.set(t1.id, { rec: results[results.length - 1], gapCheck: cancelGapCheck, dayKey });
              }
            }
          }
        }

        if (!actionTaken && !usedTrips.has(t1.id)) {
           results.push({
              type: 'ok', isNightLine: t1.isNightLine, isEilatPrebooked: t1.isEilatPrebooked, isFeedingLine: t1.isFeedingLine,
              categoryLabel: category === 'urban' ? 'עירוני' : category === 'regional' ? 'אזורי' : 'בין-עירוני',
              line: t1.lineNum, makat: t1.makat, origin: t1.origin, dest: t1.dest, direction: t1.direction, time: t1.time, timeMins: t1.timeMins, days: t1.days, usedMetric: optMetric, metricVal: getMetricVal(t1), efficiency: t1.efficiency,
              busSize: t1.busSize, capacity: t1.capacity
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
          const stillOk = group.some(m => m.id !== cid && !cancelledIds.has(m.id) &&
            Math.abs((effTime.has(m.id) ? effTime.get(m.id) : m.timeMins) - ct.timeMins) <= info.gapCheck);
          if (!stillOk) {
            cancelledIds.delete(cid);
            blockReason.set(cid, 'noalt');
            info.rec.type = 'ok';
            cancelledCountByLineDay[info.dayKey] = Math.max(0, (cancelledCountByLineDay[info.dayKey] || 1) - 1);
            cancelledInGroup = Math.max(0, cancelledInGroup - 1);
            revalidate = true;
          }
        }
      }
      {
        // סרק = נסיעה עם פחות נוסעים מהסף של סוג הקו — אותו סף כמו "ק"מ מבוזבז" בכרטיס הקו
        const L0 = lineByMakat.get(cleanMk(group[0].makat));
        const th = L0 && L0.lowRiderTh ? L0.lowRiderTh : 10;
        const lk = L0 ? L0.groupKey : `${group[0].makat || ''}|${group[0].lineNum}`;
        let LA = kmAgg.lines.get(lk);
        if (!LA) { LA = { line: group[0].lineNum, origin: (L0 || group[0]).origin, dest: (L0 || group[0]).dest, total: 0, saved: 0, wasted: 0, remain: 0 }; kmAgg.lines.set(lk, LA); }
        for (const t of group) {
          const km = (Number(t.distance) || 0) * (Number(t.tripCount) || 1);
          if (!(km > 0)) continue;
          kmAgg.total += km; LA.total += km;
          if (t.ridership < th) { kmAgg.wasted += km; LA.wasted += km; }
          if (cancelledIds.has(t.id) || mergedOut.has(t.id)) { kmAgg.saved += km; LA.saved += km; continue; }
          const riders = mergedKeep.has(t.id) ? mergedKeep.get(t.id) : t.ridership;
          if (riders < th) {
            const r = mergedKeep.has(t.id) ? 'merge' : (blockReason.get(t.id) || 'above');
            kmAgg.remain += km; LA.remain += km; kmAgg.reasons[r] = (kmAgg.reasons[r] || 0) + km;
          }
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

    setOptKm(kmAgg.total > 0 ? { ...kmAgg, lines: [...kmAgg.lines.values()].filter(l => l.total > 0).sort((a, b) => (b.saved - a.saved) || (b.total - a.total)) } : null);
    setOptimizations(results);
    setSimLoading(false);
  };

  const exportOptimizationsToExcel = async () => {
    if (optimizations.length === 0) return;
    await loadXLSX();
    const dataToExport = showAllTripsInSimulator ? optimizations : optimizations.filter(o => o.type !== 'ok');
    const exportData = dataToExport.map(opt => {
      const w = wastedOfMakat(opt.makat);
      const row = exportOptRow(opt);
      if (opt.type !== 'ok') row['ק"מ בשבוע שנחסכים'] = opt.km > 0 ? Math.round(opt.km) : '—';
      row['ק"מ מבוזבזים בקו בשבוע'] = w == null ? '—' : w;
      return row;
    });
    function exportOptRow(opt) {
      const metricName = opt.usedMetric === 'peakLoad' ? 'עומס שיא' : 'נוסעים';
      if (opt.type === 'merge') {
        return { 'מספר קו': opt.line, 'סוג קו': opt.categoryLabel, 'סוג רכב': opt.busSize, 'מוצא': opt.origin, 'יעד': opt.dest, 'כיוון': opt.direction, 'ימי פעילות': opt.days, 'פעולה מומלצת': 'איחוד נסיעות', 'שעות מקוריות': `${opt.from}, ${opt.to}`, 'שעה מוצעת (חדשה)': opt.suggestedTime, 'מדד (נוסעים / עומס)': `סה"כ ${metricName}: ${opt.total} (נסיעה 1: ${opt.val1}, נסיעה 2: ${opt.val2})`, 'הערות': opt.gap === 0 ? 'שתי יציאות באותה דקה — איחוד לרכב אחד' : `איחוד 2 נסיעות בהפרש של ${opt.gap} דקות` };
      } else if (opt.type === 'cancel') {
        return { 'מספר קו': opt.line, 'סוג קו': opt.categoryLabel, 'סוג רכב': opt.busSize, 'מוצא': opt.origin, 'יעד': opt.dest, 'כיוון': opt.direction, 'ימי פעילות': opt.days, 'פעולה מומלצת': 'ביטול נסיעה', 'שעות מקוריות': opt.time, 'שעה מוצעת (חדשה)': '--', 'מדד (נוסעים / עומס)': `${metricName}: ${opt.metricVal}`, 'הערות': 'חשד לנסיעה מיותרת עם חלופה קרובה בזמן' };
      } else {
         return { 'מספר קו': opt.line, 'סוג קו': opt.categoryLabel, 'סוג רכב': opt.busSize, 'מוצא': opt.origin, 'יעד': opt.dest, 'כיוון': opt.direction, 'ימי פעילות': opt.days, 'פעולה מומלצת': 'ללא שינוי (תקין)', 'שעות מקוריות': opt.time, 'שעה מוצעת (חדשה)': opt.time, 'מדד (נוסעים / עומס)': `${metricName}: ${opt.metricVal}`, 'הערות': 'נסיעה תקינה שעומדת בתנאי' };
      }
    }
    const ws = window.XLSX.utils.json_to_sheet(exportData);
    const wb = window.XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] }; // מימין לשמאל — SheetJS קורא את זה רק מהחוברת, לא מ-!views של הגיליון
    window.XLSX.utils.book_append_sheet(wb, ws, "המלצות_ייעול");
    if (optKm) {
      const r0 = v => Math.round(v);
      const kmRows = optKm.lines.map(l => ({ 'קו': l.line, 'מוצא – יעד': `${l.origin} – ${l.dest}`, 'ק"מ בשבוע היום': r0(l.total), 'נחסך בהמלצות': r0(l.saved), 'ק"מ אחרי ההמלצות': r0(l.total - l.saved), 'ק"מ סרק היום': r0(l.wasted), 'ק"מ סרק שנשאר': r0(l.remain) }));
      kmRows.push({ 'קו': 'סה"כ', 'מוצא – יעד': '', 'ק"מ בשבוע היום': r0(optKm.total), 'נחסך בהמלצות': r0(optKm.saved), 'ק"מ אחרי ההמלצות': r0(optKm.total - optKm.saved), 'ק"מ סרק היום': r0(optKm.wasted), 'ק"מ סרק שנשאר': r0(optKm.remain) });
      KM_REASONS.forEach(([k, label]) => { if (optKm.reasons[k] > 0) kmRows.push({ 'קו': '', 'מוצא – יעד': `סרק שנשאר: ${label}`, 'ק"מ סרק שנשאר': r0(optKm.reasons[k]) }); });
      const ws2 = window.XLSX.utils.json_to_sheet(kmRows);
      window.XLSX.utils.book_append_sheet(wb, ws2, "קמ_לפני_ואחרי");
    }
    
    let fileName = "קופח_המלצות_ייעול_לוז.xlsx";
    if (optimizations.length > 0) {
      if (optLine) {
        const o = optimizations.find(x => String(x.line) === String(optLine)) || optimizations[0];
        fileName = `קו ${o.line} ${o.origin} - ${o.dest}.xlsx`;
      } else {
        // חברה מפעילה ו/או עיר מהריצה האחרונה — ייעול_קווים_אפיקים_חיפה.xlsx
        const parts = [optRunInfo.operator, optRunInfo.city].filter(v => v && v !== "all")
          .map(v => String(v).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim());
        if (parts.length) fileName = `ייעול_קווים_${parts.join('_')}.xlsx`;
      }
    }
    window.XLSX.writeFile(wb, fileName);
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
            <button onClick={(e) => { e.stopPropagation(); setActiveExplainId(null); }}
              aria-label="סגירת ההסבר"
              className="absolute top-2 left-2 w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 font-black text-sm leading-none transition-colors">×</button>
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
            <button onClick={(e) => { e.stopPropagation(); setActiveExplainId(null); }}
              aria-label="סגירת ההסבר"
              className="absolute top-2 left-2 w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 font-black text-sm leading-none transition-colors">×</button>
            <strong className="block mb-2 text-slate-900 text-base">קו מזין רכבת</strong>
            קו שמזין את הרכבת. לפני שמשנים אותו, בודקים מול לוח הזמנים של הרכבת.
          </div>
        )}
      </div>
    );
  };

  const handleOptimizeLineForm = (lineNum, city) => {
    setOptLine(lineNum);
    setOptCity(city || "all");
    setOptOperator("all");
    setOptDirection("all");
    setOptDays([]); 
    setTab("simulator");
    runOptimization(lineNum, city || "all", "all", [], "all");
  };

  // מסך טעינה מלא — מוצג רק כשנכנסים לכלי לפני שהנתונים מוכנים
  // מסך הטעינה מעוגן למעלה (לא ממורכז אנכית): כשהאפליקציה מופיעה הכותרת לא קופצת — Lighthouse: CLS 0.41
  const fullLoadingScreen = (
    <div key="loading" className="kbt kbt-loading min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-start gap-6 px-6 pt-24 md:pt-32" dir="rtl" style={{ fontFamily: "'Heebo', sans-serif" }}>
      {loadError ? (
        <>
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
            <span style={{ fontSize: 28 }}>⚠️</span>
          </div>
          <div className="text-center">
            <p className="text-slate-900 font-black text-lg">הטעינה נכשלה</p>
            <p className="text-slate-500 font-bold text-sm mt-1">בדוק חיבור לאינטרנט ונסה שוב</p>
          </div>
          <button
            onClick={() => setRetryCount(c => c + 1)}
            className="bg-slate-900 text-white font-black px-8 py-3.5 rounded-2xl shadow-md hover:bg-slate-700 transition-colors"
          >נסה שוב</button>
        </>
      ) : (
        <>
          <Ic n="loader" size={48} cls="text-slate-900" animate={true} />
          <div className="text-center w-full max-w-xs">
            <p className="text-slate-800 font-black text-lg mb-3">{fileLoad.message || 'טוען נתונים…'}</p>
            <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
              <div className="h-3 rounded-full bg-slate-900 transition-all duration-500" style={{ width: `${fileLoad.progress || 2}%` }} />
            </div>
            <p className="text-slate-500 font-black text-sm mt-2">{fileLoad.progress || 0}%</p>
          </div>
        </>
      )}
    </div>
  );

  // מסך בחירה — תמיד נגיש מיד (לא מחכה לנתונים)
  if (appMode === 'choice') return <ChoiceScreen onPick={pickMode} />;
  // כלים — מחכים לנתונים; מראים טעינה עד שהם מוכנים
  // עם הרשומות המחושבות מראש המסך עולה מיד; בלעדיהן (או במוזהב, שצריך נסיעות) מחכים לנסיעות
  const preReady = !!(linesPre && linesPre.length) && appMode === 'kavpach';
  if (!preReady && (initialLoading || trips.length === 0)) return fullLoadingScreen;
  if (appMode === 'golden') return <GoldenApp onBack={() => pickMode('choice')} trips={trips} costBenchmarkTable={costBenchmarkTable} lineCitiesMap={lineCitiesMap} liveOf={liveOf} liveGen={liveGen} focusMakat={focusMakat} hashTab={hashTab} onClearFocus={() => { setFocusMakat(null); try { window.location.hash = 'מוזהב'; } catch (e) {} }} />;

  // key נפרד למסך הטעינה ולאפליקציה: בלי זה React השתמש באותו DOM והאלמנט "זז" — Lighthouse: CLS
  return (
    <div key="app" className="kbt kbt-pach min-h-screen bg-[#F8FAFC] text-slate-900 p-4 md:p-6 pb-20" style={{ fontFamily: "'Heebo', sans-serif" }} dir="rtl">
      <KbToolBar name="קו פח" onHome={() => pickMode('choice')} />
      <CitiesDatalist cities={allCities} />

      <div className="max-w-6xl mx-auto">
        <header className="kbt-hero">
          <KbToolIcon k="kavpach" />
          <div className="kbt-hero-txt">
            <div className="kbt-titlerow">
              <h1 className="kbt-h1">קו פח</h1>
              <span className="kbt-by">נבנה על ידי שלמה הרטמן</span>
            </div>
            <p className="kbt-sub">מאתרים קווים ריקים • מייעלים את הלו&quot;ז</p>
            <p className="kbt-meta">
              נתוני נוסעים ועלויות: צילום משרד התחבורה, יוני 2026
              {/* תאריך ההצלבה מגיע מקובץ נפרד — נשמר לו מקום כבר עכשיו, שהכותרת לא תגדל ותדחוף את הדף (Lighthouse: CLS) */}
              {' · הצלבה מול רישום הקווים העדכני: '}{liveGen ? String(liveGen).split('-').reverse().join('.') : <span className="inline-block w-16 h-[1em] align-middle bg-slate-100 rounded" aria-hidden="true" />}
            </p>
          </div>
        </header>


        {(fileLoad.active || initialLoading) && trips.length === 0 && (linesPre && linesPre.length) ? (
          /* הרשומות המחושבות מראש כבר על המסך — הנסיעות (ללשוניות האחרות) נטענות ברקע, פס דק בלבד */
          /* צף בתחתית המסך — לא דוחף את התוכן (Lighthouse: CLS) */
          <div className="fixed bottom-4 left-4 z-40 bg-white/95 border border-slate-200 rounded-2xl shadow-lg px-4 py-2 flex items-center gap-3 text-xs font-bold text-slate-600" style={{ width: 'min(20rem, calc(100vw - 2rem))' }} role="status" aria-live="polite">
            <Ic n="loader" size={14} cls="text-slate-500" animate={true} />
            <span className="whitespace-nowrap">{fileLoad.message || 'טוען את הנסיעות ברקע…'}</span>
            <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden"><div className="h-1.5 rounded-full bg-slate-700" style={{ width: `${fileLoad.progress || 2}%`, transition: 'width 0.3s ease' }} /></div>
          </div>
        ) : null}
        {(fileLoad.active || initialLoading) && !(linesPre && linesPre.length) ? (
          <div className="flex flex-col items-center justify-center py-40 text-center gap-6">
            {fileLoad.progress < 48 ? (
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center">
                  <Ic n="loader" size={28} cls="text-white" animate={true} />
                </div>
                <div>
                  <p className="text-xl font-black text-slate-900">{initialLoading && !fileLoad.active ? "טוען נתונים..." : fileLoad.message}</p>
                  <p className="text-slate-500 text-sm font-bold mt-1">יקח כמה שניות</p>
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
                <p className="text-slate-500 font-bold text-sm">{fileLoad.progress}%</p>
              </div>
            )}
          </div>
        ) : trips.length === 0 && !preReady && csvLoadFailed ? (
          <div className="flex flex-col items-center justify-center py-32 px-6 bg-white rounded-[3rem] border-4 border-dashed border-slate-200 shadow-sm text-center">
            <div className="bg-slate-50 p-8 rounded-full mb-8"><Ic n="upload" size={48} cls="text-slate-300" /></div>
            <h2 className="text-3xl font-black text-slate-800 mb-4">מוכנים לזרוק קווים?</h2>
            <h3 className="text-xl font-black text-slate-700 mb-3 bg-indigo-50 text-indigo-800 px-5 py-2 rounded-xl border border-indigo-100 shadow-sm inline-block">המערכת שמוצאת קווים שאפשר לזרוק לפח</h3>
            <p className="text-slate-500 font-medium mb-6 max-w-md">לא נמצא קובץ נתונים מקומי (data.csv).</p>
            <p className="text-slate-500 font-medium mb-12 max-w-md">העלו קובץ אקסל עם נתוני תיקופים כדי להתחיל בניתוח המערכת.</p>
            <label className="bg-slate-900 hover:bg-black text-white px-16 py-5 rounded-[2rem] font-black text-xl cursor-pointer transition-all shadow-xl hover:scale-105 active:scale-95">
              העלאת קובץ נתונים
              <input type="file" className="hidden" accept=".xlsx,.xls" onChange={onFile} />
            </label>
          </div>
        ) : trips.length === 0 && !preReady ? (
          <div className="flex flex-col items-center justify-center py-40 text-center gap-6">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center">
                <Ic n="loader" size={28} cls="text-white" animate={true} />
              </div>
              <div>
                <p className="text-xl font-black text-slate-900">טוען נתונים...</p>
                <p className="text-slate-500 text-sm font-bold mt-1">יקח כמה שניות</p>
              </div>
            </div>
          </div>
        ) : (
          <main>
            <nav className="flex bg-slate-200/50 backdrop-blur p-1.5 rounded-[2rem] mb-12 max-w-4xl mx-auto shadow-inner border border-slate-200 overflow-x-auto">
              {["redundant", "areas", "allTrips", "simulator", "deadhead", "about"].map(tabName => {
                const isSelected = tab === tabName;
                let colorClass = "text-slate-500";
                let iconName = "";
                let label = "";
                if (tabName === "redundant") { colorClass = isSelected ? "bg-white text-rose-600 shadow-md" : "text-slate-600 hover:text-slate-800"; iconName = "trash"; label = "קווים לא יעילים"; }
                if (tabName === "deadhead") { colorClass = isSelected ? "bg-white text-orange-700 shadow-md" : "text-slate-600 hover:text-slate-800"; iconName = "alert"; label = "נסיעות תפעוליות"; }
                if (tabName === "areas") { colorClass = isSelected ? "bg-white text-amber-700 shadow-md" : "text-slate-600 hover:text-slate-800"; iconName = "chart"; label = "ניתוח אזורי"; }
                if (tabName === "allTrips") { colorClass = isSelected ? "bg-white text-indigo-600 shadow-md" : "text-slate-600 hover:text-slate-800"; iconName = "list"; label = "כל הנסיעות"; }
                if (tabName === "simulator") { colorClass = isSelected ? "bg-white text-slate-900 shadow-md" : "text-slate-600 hover:text-slate-800"; iconName = "zap"; label = "אלגוריתם ייעול"; }
                if (tabName === "about") { colorClass = isSelected ? "bg-white text-indigo-600 shadow-md" : "text-slate-600 hover:text-slate-800"; iconName = "info"; label = "על המערכת"; }

                return (
                  <a key={`nav-${tabName}`} href={tabHref('פח', KP_TABS, tabName)} aria-current={isSelected ? 'page' : undefined} onClick={(e) => {
                    if (!plainClick(e)) return; e.preventDefault();
                    setTab(tabName);
                  }} className={`flex-1 min-w-[120px] py-3.5 rounded-[1.5rem] font-black text-sm transition-all flex items-center justify-center gap-2 ${colorClass}`}>
                    <Ic n={iconName} size={16} /> {label}
                  </a>
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
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 relative w-full xl:w-[52rem] shrink-0 items-center">
                    <select aria-label="מיון הרשימה"
                      value={redundantSortBy} 
                      onChange={e => setRedundantSortBy(e.target.value)} 
                      className="bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 font-black outline-none focus:border-slate-900 text-right shadow-sm w-full appearance-none cursor-pointer"
                    >
                      <option value="score">מיון: לפי אי-יעילות</option>
                      <option value="wastedKm">מיון: ק&quot;מ מבוזבז (גבוה לנמוך)</option>
                      <option value="cost">מיון: עלות לנוסע (גבוהה לנמוכה)</option>
                      <option value="count">מיון: כמות נסיעות בשבוע</option>
                    </select>
                    <input type="text" aria-label="מספר קו או מק״ט" title="אפשר כמה קווים או מק״טים, מופרדים בפסיקים"
                      value={redLine}
                      onChange={e => setRedLine(e.target.value)}
                      placeholder="מספר קו / מק״ט"
                      className="bg-slate-50 border-2 rounded-2xl px-4 py-3 font-black outline-none focus:border-slate-900 text-right shadow-sm w-full border-slate-200"
                      style={redLine.trim() ? ACTIVE_FILTER_STYLE : undefined}
                    />
                    {redOperatorOptions.length > 0 && (
                      <select aria-label="חברה מפעילה"
                        value={redOperator}
                        onChange={e => setRedOperator(e.target.value)}
                        className="bg-slate-50 border-2 rounded-2xl px-4 py-3 font-black outline-none focus:border-slate-900 text-right shadow-sm w-full appearance-none cursor-pointer border-slate-200"
                        style={redOperator !== "all" ? ACTIVE_FILTER_STYLE : undefined}
                      >
                        <option value="all">כל החברות המפעילות</option>
                        {redOperator !== "all" && !redOperatorOptions.some(o => o.name === redOperator) && <option value={redOperator}>{redOperator}</option>}
                        {redOperatorOptions.map(o => <option key={`rop-${o.name}`} value={o.name}>{o.name} ({o.lines})</option>)}
                      </select>
                    )}
                    <select aria-label="סינון לפי מחוז"
                      value={filterDistrict} 
                      onChange={e => setFilterDistrict(e.target.value)} 
                      className="bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 font-black outline-none focus:border-slate-900 text-right shadow-sm w-full appearance-none cursor-pointer"
                    >
                      <option value="all">כל המחוזות</option>
                      {allDistricts.map(d => <option key={`dist-${d}`} value={d}>{d}</option>)}
                    </select>
                    <select aria-label="סינון לפי קטגוריה"
                      value={filterCategory}
                      onChange={e => setFilterCategory(e.target.value)}
                      className="bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 font-black outline-none focus:border-slate-900 text-right shadow-sm w-full appearance-none cursor-pointer"
                    >
                      <option value="all">כל הקטגוריות</option>
                      {CATEGORIES.map(c => <option key={`cat-${c}`} value={c}>{c}</option>)}
                    </select>
                    <div className="flex relative w-full">
                      <SearchInput
                        value={searchCity} 
                        onSubmit={setSearchCity} 
                        placeholder="הקלד עיר ולחץ Enter..."
                        className="bg-slate-50 border-2 border-slate-200 rounded-2xl px-6 py-3 pl-12 font-black outline-none focus:border-slate-900 text-right shadow-sm w-full"
                      />
                    </div>
                    {(redOperator !== "all" || redLineVals.length > 0) && (
                      <label className="md:col-span-2 inline-flex items-center gap-2 text-sm font-black text-slate-700 cursor-pointer px-1">
                        <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={redAllOfOp} onChange={e => setRedAllOfOp(e.target.checked)} />
                        {redOperator !== "all" ? 'כל הקווים של החברה, גם יעילים' : 'גם אם הקו יעיל'}
                      </label>
                    )}
                  </div>
                </div>

                {/* סיכום הרשימה המסוננת וייצוא לאקסל — לנציגי חברות ולמשרד (שלמה 18.11) */}
                {(filteredRedundant.length > 0 || scoreBand != null) && (
                  <div className="bg-rose-50 border border-rose-200 rounded-[2rem] px-6 py-4">
                  <div className="flex flex-wrap items-center gap-2 mb-4" role="group" aria-label="בחירה לפי ציון">
                    <span className="text-xs font-black text-slate-600">רמת ציון:</span>
                    {[{ min: null, label: 'הכל' }].concat(STATUS_TIERS.filter(t => t.min > 0 || redShowAll).map(t => ({ min: t.min, label: t.label.replace(/ - .*/, ''), range: STATUS_TIERS.indexOf(t) === 0 ? `${t.min}+` : `${t.min}–${STATUS_TIERS[STATUS_TIERS.indexOf(t) - 1].min - 1}` }))).map(c => (
                      <button key={c.label} type="button" aria-pressed={scoreBand === c.min}
                        onClick={() => setScoreBand(c.min)}
                        className={`px-3 py-2 rounded-xl text-xs font-black border transition-colors ${scoreBand === c.min ? 'bg-rose-700 text-white border-rose-700' : 'bg-white text-slate-700 border-rose-200 hover:border-rose-400'}`}>
                        {c.label}{c.range && <> · <span dir="ltr">{c.range}</span></>}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    <div className="text-base font-black text-slate-900 lg:max-w-xs">
                      {(() => { const p = redFilterParts(); return p.length ? p.join(' · ') : 'כל הקווים ברשימה'; })()}
                      {redShowAll && <span className="block text-xs font-bold text-slate-500 mt-0.5">כולל קווים יעילים</span>}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
                      {[
                        { v: redSummary.lines.toLocaleString(), l: redSummary.lines === 1 ? 'קו' : 'קווים' },
                        { v: redSummary.km > 0 ? Math.round(redSummary.km).toLocaleString() : '—', l: 'ק"מ בשבוע' },
                        { v: redSummary.km > 0 ? Math.round(redSummary.wasted).toLocaleString() : '—', l: 'ק"מ מבוזבזים בשבוע' },
                        { v: redSummary.pct != null ? `${redSummary.pct.toFixed(1)}%` : '—', l: 'מהק"מ מבוזבז' },
                      ].map(c => (
                        <div key={c.l} className="text-center">
                          <div className="text-xl font-black text-rose-700 tabular-nums" dir="ltr">{c.v}</div>
                          <div className="text-xs font-bold text-slate-500">{c.l}</div>
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={exportRedundantToExcel}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white font-black rounded-2xl px-5 py-3 shadow-sm self-stretch lg:self-auto">
                      ייצוא לאקסל
                    </button>
                  </div>
                  {filteredRedundant.length === 0 && <div className="text-sm font-bold text-slate-500 mt-2">אין קווים ברמה הזו לפי הסינון הנוכחי.</div>}
                  </div>
                )}

                {/* מה נחשב קו לא יעיל — לבחירת המשתמש (שלמה 07.09) */}
                <ScoreSettingsPanel
                  title="מה נחשב קו לא יעיל? כאן קובעים את הניקוד"
                  accent="rose"
                  settings={pset} update={updPset} reset={resetPset} isDefault={psetDefault}
                  intro='קובעים כמה נקודות כל דבר שווה. בשדה ריק נשארת ברירת המחדל של האתר.'
                  rows={[
                    { key: 'lowTrips', label: 'נסיעות שפל', hint: 'אחוז הנסיעות עם פחות נוסעים מסף הקטגוריה' },
                    { key: 'wastedKm', label: 'קילומטר מבוזבז', hint: 'חלק הק"מ בנסיעות ריקות, ועוד תוספת אם יש מעל 100 ק"מ סרק בשבוע' },
                    { key: 'cost', label: 'עלות תפעולית לנוסע', hint: 'ביחס לממוצע הקטגוריה — מדרגות מפי 1.3 ועד פי 6' },
                    { key: 'deadhead', label: 'נסיעה תפעולית במסווה', hint: 'כמה פעמים בשבוע נצפה רכב מגיע לקצה הקו וחוזר תוך 15 דקות (מהשידורים, 14 יום) — 7 ומעלה = מלוא הנקודות' },
                    { key: 'riders', label: 'ממוצע נוסעים ועומס שיא', hint: 'חצי מהנקודות על ממוצע נמוך, חצי על שיא נמוך', params: [{ k: 'low', label: 'קו ריק = ממוצע מתחת ל-', auto: 'אוטו', unit: 'נוסעים', min: 1, max: 300, title: 'ברירת המחדל: 60% מסף הקטגוריה, לפי קיבולת הרכב' }, { k: 'peak', label: 'שיא נמוך = מתחת ל-', auto: '15', unit: 'נוסעים', min: 1, max: 300 }] },
                  ]}
                  extras={
                    <div className="space-y-3">
                      <div className="text-[12px] font-black text-slate-900">הגנות — נקודות שמופחתות מהציון (0 = בלי הגנה):</div>
                      <div className="flex flex-wrap gap-x-5 gap-y-2 text-[12px] font-bold text-slate-700 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3">
                        {[['exclusive', 'תחנות ייחודיות'], ['train', 'מותאם רכבת'], ['school', 'תלמידים בשעות בי"ס'], ['weekend', 'קו סופ"ש'], ['newLine', 'קו חדש בהרצה'], ['reduced', 'כבר צומצם'], ['noAlt', 'אין חפיפת תחנות משמעותית']].map(([k, lbl]) => (
                          <label key={k} className="inline-flex items-center gap-2">{lbl}
                            <NumField value={pset.p[k]} onChange={v => updPset(s => ({ ...s, p: { ...s.p, [k]: v == null ? 0 : Math.max(0, Math.min(100, v)) } }))} min={0} max={100} width="w-16" suffix="נק׳" />
                          </label>
                        ))}
                      </div>
                      <label className="flex items-start gap-2 text-[12px] font-bold text-slate-700 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                        <input type="checkbox" className="mt-0.5" checked={pset.p.prebook > 0} onChange={e => updPset(s => ({ ...s, p: { ...s.p, prebook: e.target.checked ? 20 : 0 } }))} />
                        <span>קווים לאילת (הזמנה מראש): בלי הרכיבים שנשענים על ספירת הנוסעים, כי חלק גדול מהנוסעים לא נספר בתיקופים</span>
                      </label>
                      <label className="inline-flex items-center gap-2 text-[12px] font-bold text-slate-700 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3">נכנס לרשימה מציון של לפחות
                        <NumField value={pset.minScore} onChange={v => updPset(s => ({ ...s, minScore: v == null ? 0 : Math.max(0, Math.min(100, v)) }))} min={0} max={100} suffix="מתוך 100" />
                      </label>
                    </div>
                  }
                  footnote='ההגדרות נשמרות בדפדפן הזה בלבד. תוויות הסטטוס (חמור / לא יעיל / טעון בדיקה) והניתוח האזורי (ציון 80+) פועלים על הציון שקבעתם.'
                />
                {/* סינון מספרי על הרשימה */}
                <div className="bg-white border-2 border-slate-100 rounded-[2rem] px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-[12px] font-bold text-slate-700">
                  <span className="font-black text-slate-900 text-sm">🔎 סינון:</span>
                  <label className="inline-flex items-center gap-2">ציון מ-<NumField value={pFilt.minScore} onChange={v => setPFilt(f => ({ ...f, minScore: v }))} min={0} max={100} width="w-16" /></label>
                  <label className="inline-flex items-center gap-2">ק"מ מבוזבז בשבוע מ-<NumField value={pFilt.minWasted} onChange={v => setPFilt(f => ({ ...f, minWasted: v }))} min={0} max={99999} width="w-20" /></label>
                  <label className="inline-flex items-center gap-2">ממוצע נוסעים עד<NumField value={pFilt.maxRiders} onChange={v => setPFilt(f => ({ ...f, maxRiders: v }))} min={0} max={500} width="w-16" /></label>
                  <label className="inline-flex items-center gap-2">נסיעות בשבוע מ-<NumField value={pFilt.minTrips} onChange={v => setPFilt(f => ({ ...f, minTrips: v }))} min={0} max={5000} width="w-16" /></label>
                  {pFiltOn && <button type="button" onClick={() => setPFilt({ minScore: null, minWasted: null, maxRiders: null, minTrips: null })} className="text-xs font-black text-rose-700 hover:text-rose-900 underline">✕ נקה סינון</button>}
                  <span className="text-slate-500 mr-auto">{filteredRedundant.length.toLocaleString()} קווים</span>
                </div>

                {focusMakat && (
                  <div className="mb-4 flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3">
                    <span className="text-sm font-black text-indigo-800">🔗 מציג קו משותף (מק"ט {focusMakat})</span>
                    <button className="text-xs font-black text-indigo-700 hover:text-indigo-900 underline"
                      onClick={() => { setFocusMakat(null); try { window.location.hash = 'פח'; } catch (e) {} }}>
                      ✕ הצג את כל הקווים
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredRedundant.length > 0 ? filteredRedundant.slice(0, visibleLineCount).map((res, i) => (
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
                            {res.dhWeekly > 0 && (
                              <TipBadge className="px-3 py-1.5 rounded-full text-[11px] font-black bg-orange-100 text-orange-800 border border-orange-200" tip={`חזר ריק תוך 15 דקות, ${res.dhWeekly.toFixed(1)} פעמים בשבוע (מהשידורים)`}>
                                נסיעה תפעולית · {res.dhWeekly.toFixed(1)} בשבוע
                              </TipBadge>
                            )}
                            {res.isNightLine && (
                              <span className="text-indigo-400 bg-indigo-50 p-1 rounded-full" title="קו לילה">
                                <Ic n="moon" size={14} />
                              </span>
                            )}
                            {renderPrebookedInfo('red-'+i, res.isEilatPrebooked)}
                            {renderFeedingLineInfo('red-'+i, res.isFeedingLine)}
                            {res.live && res.live.rm && (
                              <span className="px-3 py-1.5 rounded-full text-[11px] font-black bg-red-600 text-white border border-red-700"
                                title={'לפי ארכיון "הקו בזמן" — הקו כבר אינו קיים ברישום' + (res.live.rmd ? '. נעלם ב-' + String(res.live.rmd).split('-').reverse().join('.') : '')}>
                                ✖ הקו כבר בוטל
                              </span>
                            )}
                            {res.live && !res.live.rm && res.live.gap && (
                              <TipBadge className="px-3 py-1.5 rounded-full text-[11px] font-black bg-amber-100 text-amber-800 border border-amber-200"
                                tip={'הקו הושבת בין ' + String(res.live.gap[0]).split('-').reverse().join('.') + ' ל-' + String(res.live.gap[1]).split('-').reverse().join('.') + ' וחזר — נתוני הנוסעים עשויים לשקף גם את תקופת ההשבתה'}>
                                ⏸ הושבת וחזר
                              </TipBadge>
                            )}
                          </div>
                          <div className="mt-1">
                            <RouteFormat val={res.makat} />
                          </div>
                        </div>
                        <div className="flex flex-col items-center gap-1 shrink-0">
                          <div className="bg-slate-900 text-white w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl shadow-lg">{res.lineNum}</div>
                          <button className="text-[10px] font-black text-slate-500 hover:text-slate-900 transition-colors"
                            title="העתקת קישור ישיר לקו הזה"
                            onClick={(e) => {
                              const url = location.origin + location.pathname + '#פח/קו/' + String(res.makat || '').replace(/^0+/, '');
                              try { navigator.clipboard.writeText(url); } catch (err) { /* ignore */ }
                              const b = e.currentTarget; const t = b.textContent; b.textContent = '✓ הועתק';
                              setTimeout(() => { b.textContent = t; }, 1500);
                            }}>🔗 שיתוף</button>
                        </div>
                      </div>
                      <div className="flex-1 mb-5">
                        
                        <div className="flex items-center justify-start gap-3 mb-2 min-w-0">
                          <div className="text-slate-900 font-black text-lg truncate leading-tight" title={res.origin}>{res.origin}</div>
                          <div className="text-slate-300 text-2xl font-black shrink-0 leading-none">←</div>
                          <div className="text-slate-900 font-black text-lg truncate leading-tight" title={res.dest}>{res.dest}</div>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-2 mb-4">
                          <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md shrink-0">{res.district}</span>
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

                        <div className="text-xs font-bold text-slate-500 mb-4 flex items-center gap-2 flex-wrap">
                          <span>ציון אי-יעילות:</span>
                          <span className={`font-black ${res.statusTier.color}`}>{res.score}/100</span>
                          {res.totalDeduction > 0 && (
                            <span className="text-slate-500 font-bold">
                              (גולמי {res.rawScore}, הופחתו {res.totalDeduction} בגין הגנות)
                            </span>
                          )}
                        </div>

                        {res.uncounted && (
                          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2 text-[12px] font-bold text-amber-800 leading-relaxed">
                            לאילת מזמינים מראש, אז רוב הנוסעים לא נספרים. הציון נשען רק על השידורים.
                          </div>
                        )}

                        {(() => {
                          const ov = kavPachVisibleOverlaps(overlapMap && overlapMap[String(res.makat || '').replace(/^0+/, '').trim()]);
                          if (!ov || !ov.length) return null;
                          return (
                            <div className="mb-4 bg-sky-50 border border-sky-200 rounded-2xl px-3 py-2">
                              <div className="text-[10px] font-black text-sky-700 mb-1">🔀 חפיפת מסלול</div>
                              <div className="flex flex-wrap gap-1.5">
                                {ov.map(([mk2, num2, long2, pct, shared, shape]) => (
                                  <details key={mk2} className="text-[10px] font-black bg-white border border-sky-200 text-sky-800 rounded-2xl" style={{maxWidth:'100%'}}>
                                    <summary className="cursor-pointer flex items-center gap-1 list-none" style={{listStyle:'none',padding:'6px 10px',minHeight:24}}>
                                      <span className="font-black">קו {num2} · {((pct + shape.selfPct) / 2).toLocaleString('he-IL', {maximumFractionDigits:1})}%</span>
                                      <span aria-label={`הסבר חפיפה עם קו ${num2}`} title="איך מחושבת החפיפה?" className="inline-flex items-center justify-center rounded-full border border-sky-300 font-black" style={{width:14,height:14,fontSize:10}}>?</span>
                                    </summary>
                                    <div className="border-t border-sky-100 leading-relaxed" style={{padding:10,maxWidth:380,fontSize:12}}>
                                      <div>{shared} תחנות משותפות ו-{Math.round(shape.selfPct)}% מהתוואי משותף. זו לא המלצה לביטול: לא נבדקו שעות הפעילות.</div>
                                      <HowCalc className="mt-2 font-normal">
                                        <div>מדד התחנות: {pct}%, ביחס למסלול שבו פחות תחנות. מדד התוואי: {shape.selfPct}% מתוואי קו {res.lineNum} משותף לקו {num2}, באותו כיוון נסיעה.</div>
                                        <div>אחוז החפיפה הוא ממוצע של שני המדדים במשקל שווה. מוצגים רק קווים עם 50% ומעלה. כשחסר מדד, הקו אינו מוצג ברשימה.</div>
                                        <div>תוואי משותף באומדן: {shape.sharedKm.toLocaleString('he-IL', {maximumFractionDigits:2})} ק״מ · המקטע הרציף הארוך ביותר: {shape.longestKm.toLocaleString('he-IL', {maximumFractionDigits:2})} ק״מ.</div>
                                        <div>המסלולים שנבדקו: קו {res.lineNum}: {shape.selfRouteName} · {shape.selfKm} ק״מ. קו {num2}: {shape.otherRouteName || long2} · {shape.otherKm} ק״מ · מק״ט {mk2}.</div>
                                        <div>התוואי נבדק לפי קרבה וכיוון בנתוני GTFS ועלול להיות מושפע מאי־דיוק בנתונים. לא נבדקו ימי ושעות הפעילות או מגבלות איסוף והורדה. החפיפה אינה מוכיחה שהקו הוא חלופה מלאה, והחישוב נפרד מציון אי־היעילות.</div>
                                      </HowCalc>
                                    </div>
                                  </details>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                        {res.protections.length > 0 && (
                          <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-2xl px-3 py-2">
                            <div className="text-[10px] font-black text-emerald-700 mb-1">הגנות פעילות</div>
                            <div className="flex flex-wrap gap-1.5">
                              {res.protections.map((p, k) => (
                                p.detail ? (
                                <TipBadge key={`prot-${i}-${k}`} className="bg-white border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-bold" tip={p.detail}>
                                  {p.name} −{p.value}
                                </TipBadge>
                                ) : (
                                <span key={`prot-${i}-${k}`} className="bg-white border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                  {p.name} −{p.value}
                                </span>
                                )
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="space-y-2.5 pt-4 border-t border-slate-100">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-700 font-bold">ממוצע נוסעים לנסיעה</span>
                            <span className="font-black text-slate-900">{res.avg}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-700 font-bold">עומס שיא ממוצע</span>
                            <span className="font-black text-slate-900">{res.avgPeak}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-700 font-bold">נסיעות בשבוע</span>
                            <span className="text-right">
                              <span className="font-black text-slate-900">{res.count}</span>
                              {res.live && !res.live.rm && res.live.ntr > 0 && (
                                <div className="text-[10px] font-bold text-slate-500" title='מספר הנסיעות בפיד העדכני, מארכיון "הקו בזמן" — נתוני הכרטיס הם צילום מיוני 2026'>
                                  היום: {res.live.ntr.toLocaleString()} נסיעות ביום, לפי לוח הזמנים העדכני
                                </div>
                              )}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm gap-2">
                            <span className="text-slate-700 font-bold">עלות תפעולית לנוסע</span>
                            <span className="text-right">
                              <span className="font-black text-slate-900">{res.cost > 0 ? `₪${res.cost.toFixed(2)}` : 'לא זמין'}</span>
                              {res.cost > 0 && res.costBenchmark > 0 && (
                                <div className="text-[10px] font-bold text-slate-500">
                                  ממוצע {res.category}: ₪{res.costBenchmark}
                                  {res.costRatio > 1 && (
                                    <span className="text-rose-700 mr-1">(×{res.costRatio.toFixed(2)})</span>
                                  )}
                                </div>
                              )}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-700 font-bold">ק&quot;מ לא מבוזבז (שימושי)</span>
                            <span className="font-black text-emerald-700">{res.totalKm > 0 ? `${res.nonWastedKm.toLocaleString()} ק"מ` : '—'}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-600 font-bold">ק&quot;מ מבוזבז (נסיעות סרק)</span>
                            <span className="font-black text-rose-600">{res.totalKm > 0 ? `${res.wastedKm.toLocaleString()} ק"מ` : '—'}</span>
                          </div>
                          {res.annualExcess > 0 && !(res.live && res.live.rm) && (
                            <div className="text-sm bg-rose-50 rounded-xl px-3 py-2 border border-rose-100">
                              <div className="flex items-center justify-between">
                                <span className="text-rose-700 font-bold flex items-center">
                                  עלות עודפת באומדן
                                  {/* הסבר גלוי בלחיצה — עם המספרים של הקו הזה עצמו,
                                      לא נוסחה כללית (בקשת שלמה: שקיפות מלאה) */}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setActiveExplainId(activeExplainId === 'exc-' + i ? null : 'exc-' + i); }}
                                    className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 font-bold text-sm flex items-center justify-center border border-rose-300 hover:bg-rose-200 transition-colors mx-1 outline-none relative z-10"
                                    title="איך חושב האומדן?"
                                  >?</button>
                                </span>
                                <span className="font-black text-rose-700">~{fmtShekels(res.annualExcess)} בשנה</span>
                              </div>
                              {activeExplainId === 'exc-' + i && (
                                <div ref={explainRef}
                                  className="mt-2 p-3 sm:p-4 bg-white text-slate-800 text-xs sm:text-sm rounded-xl shadow-lg leading-relaxed font-normal text-right border border-slate-200 relative">
                                  {/* כפתור סגירה מפורש — מי שלא מכיר את האתר לא צריך לנחש (הבאג ששלמה מצא) */}
                                  <button onClick={(e) => { e.stopPropagation(); setActiveExplainId(null); }}
                                    aria-label="סגירת ההסבר"
                                    className="absolute top-2 left-2 w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 font-black text-base leading-none transition-colors">×</button>
                                  <strong className="block mb-2 text-slate-900 text-base">איך מחושבת העלות העודפת?</strong>
                                  בכמה הקו יקר יותר מקו ממוצע מסוגו, לכל הנוסעים בשנה. אומדן, לא נתון רשמי.
                                  <div className="my-2 bg-slate-50 rounded-lg p-2 font-bold text-slate-700" style={{ direction: 'rtl' }}>
                                    (₪{res.cost.toFixed(2)} לנוסע בקו הזה − ₪{Number(res.costBenchmark).toFixed(2)} ממוצע {res.category})
                                    <br />× {res.avg} נוסעים בנסיעה × {res.count} נסיעות בשבוע × 52 שבועות
                                    <br />= ~{fmtShekels(res.annualExcess)} בשנה
                                  </div>
                                  <span className="text-slate-500">מקור: דוח משרד התחבורה (יוני 2026). העלות לנוסע מניחה שהיא אחידה לאורך השנה.</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      {/* על קו שכבר בוטל אין מה לייעל — הכפתור הוביל לסימולטור
                          שהציג "חשד לנסיעה מיותרת" על קו שאינו קיים */}
                      <div className="mb-4"><RidershipBlock makat={res.makat} /></div>
                      {res.live && res.live.rm
                        ? <div className="w-full py-4 bg-slate-100 text-slate-500 rounded-2xl text-xs font-black text-center">הקו כבר בוטל — הנתונים נשמרים לתיעוד בלבד</div>
                        : <button onClick={() => handleOptimizeLineForm(res.lineNum, res.origin)} className="w-full py-4 bg-slate-900 text-white rounded-2xl text-xs font-black hover:bg-black transition-all shadow-md">חפש הזדמנויות התייעלות</button>}
                    </div>
                  )) : (
                    /* קישור משותף לקו שירד מהרשימה בעדכון הלילי: במקום מסך
                       ריק — הסבר קצר וכפתור ניקוי */
                    focusMakat && trips.some(t => String(t.makat || '').replace(/^0+/, '').trim() === String(focusMakat).replace(/^0+/, '').trim()) ? (
                      <div className="col-span-full bg-white border-2 border-sky-200 rounded-[2rem] p-8 text-right shadow-sm">
                        <div className="flex items-center gap-3 mb-3 flex-wrap">
                          <span className="bg-sky-50 text-sky-700 border border-sky-200 rounded-full px-4 py-1.5 text-[11px] font-black">ירד מהרשימה בעדכון האחרון</span>
                          <span className="font-black text-slate-900 text-lg">מק"ט {focusMakat}</span>
                        </div>
                        <p className="text-slate-600 font-bold text-sm leading-relaxed">
                          הקו קיים במערכת, אבל אחרי עדכון הנתונים האחרון הציון שלו כבר לא עובר את
                          סף התצוגה — כלומר הוא כבר לא נראה "חשוד כמיותר". זה דווקא סימן טוב.
                        </p>
                        <button onClick={() => { setFocusMakat(null); try { window.location.hash = 'פח'; } catch (e) {} }}
                          className="mt-4 bg-slate-900 hover:bg-black text-white px-6 py-3 rounded-2xl text-xs font-black transition-colors">✕ נקה את הסינון וחזור לרשימה</button>
                      </div>
                    ) : (
                    <div className="col-span-full text-center py-20 text-slate-500 font-bold">לא נמצאו קווים לסינון המבוקש.</div>
                    )
                  )}
                </div>
                {filteredRedundant.length > visibleLineCount && (
                  <div className="text-center pt-6">
                    <button type="button" onClick={() => setVisibleLineCount(n => n + 30)}
                      className="bg-slate-900 text-white font-black px-6 py-3 rounded-2xl">
                      הצג עוד קווים ({visibleLineCount} מתוך {filteredRedundant.length.toLocaleString()})
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
                    <p className="text-slate-500 font-bold">נספרים רק קווים חמורים, עם ציון 80 ומעלה.{areaViewMode === 'city' ? ' קו בין שתי ערים מופיע בשתיהן.' : ''}</p>
                    <p className="text-slate-500 font-bold text-sm mt-1">מדד חומרה: ממוצע ציוני הקווים החמורים, ועוד תוספת על הרבה ק"מ מבוזבזים.</p>
                  </div>
                  <div className="flex flex-col md:flex-row gap-3 relative w-full xl:w-auto">
                    <div className="flex bg-slate-100 p-1 rounded-2xl shadow-inner">
                       <button onClick={() => setAreaViewMode('city')} className={`px-6 py-2.5 rounded-xl font-black text-sm transition-all ${areaViewMode === 'city' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600 hover:text-slate-800'}`}>לפי עיר</button>
                       <button onClick={() => setAreaViewMode('district')} className={`px-6 py-2.5 rounded-xl font-black text-sm transition-all ${areaViewMode === 'district' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600 hover:text-slate-800'}`}>לפי מחוז</button>
                    </div>
                    <select aria-label="תצוגת הניתוח האזורי"
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
                           <div className={`px-4 py-1.5 rounded-full text-[11px] font-black border ${area.avgScore >= 80 ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-amber-50 border-amber-200 text-amber-700'}`} title='ממוצע ציוני הקווים החמורים באזור, ועוד נקודה לכל 15,000 ק"מ מבוזבזים (עד 40), עד 100'>מדד חומרה: {area.avgScore}</div>
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
                           {area.annualExcess > 0 && (
                             <div className="bg-rose-50 rounded-xl px-3 py-2 border border-rose-100">
                               <div className="flex justify-between">
                                 <span className="text-rose-700 font-bold flex items-center">
                                   עלות עודפת באומדן
                                   <button
                                     onClick={(e) => { e.stopPropagation(); setActiveExplainId(activeExplainId === 'aexc-' + i ? null : 'aexc-' + i); }}
                                     className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 font-bold text-sm flex items-center justify-center border border-rose-300 hover:bg-rose-200 transition-colors mx-1 outline-none relative z-10"
                                     title="איך חושב האומדן?"
                                   >?</button>
                                 </span>
                                 <span className="font-black text-rose-700">~{fmtShekels(area.annualExcess)} בשנה</span>
                               </div>
                               {activeExplainId === 'aexc-' + i && (
                                 <div ref={explainRef}
                                   className="mt-2 p-3 bg-white text-slate-800 text-xs sm:text-sm rounded-xl shadow-lg leading-relaxed font-normal text-right border border-slate-200 relative">
                                   <button onClick={(e) => { e.stopPropagation(); setActiveExplainId(null); }}
                                     aria-label="סגירת ההסבר"
                                     className="absolute top-2 left-2 w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 font-black text-base leading-none transition-colors">×</button>
                                   <strong className="block mb-1 text-slate-900">איך מחושב הסכום האזורי?</strong>
                                   סכום העלות העודפת של {area.lineCount} הקווים החמורים באזור. אומדן, לא נתון רשמי.
                                 </div>
                               )}
                             </div>
                           )}
                        </div>
                        <button onClick={() => handleViewAreaLines(area.name)} className="mt-auto w-full py-4 bg-slate-900 text-white rounded-2xl text-xs font-black hover:bg-black transition-all shadow-md">צפה בקווים אלו</button>
                     </div>
                  ))}
                  {areaStats.length === 0 && (
                     <div className="col-span-full text-center py-20 text-slate-500 font-bold">לא נמצאו אזורים תואמים לסינון.</div>
                  )}
                </div>
              </div>
            )}

            {tab === "deadhead" && (() => {
              const D = deadhead;
              if (trips.length === 0) return <div className="p-10 text-center text-slate-500 font-bold">הנסיעות עדיין נטענות ברקע — הלשונית תתמלא כשהן יגיעו (כמה שניות).</div>;
              if (!D) return <div className="p-10 text-center text-slate-500 font-bold">מחשב נסיעות תפעוליות…</div>;
              const fmtN = (n) => Math.round(n).toLocaleString('he-IL');
              const settingsPanel = (
                <ScoreSettingsPanel
                  title="מה נחשב נסיעה תפעולית מיותרת? כאן קובעים את הניקוד"
                  accent="rose"
                  settings={dset} update={updDset} reset={resetDset} isDefault={dsetDefault}
                  intro='אותה שיטה כמו בציון אי-היעילות.'
                  rows={[
                    { key: 'obs', label: 'תצפיות', hint: 'כמה פעמים בשבוע נצפה רכב מגיע לקצה וחוזר תוך 15 דקות — 7 בשבוע ומעלה = מלוא הנקודות' },
                    { key: 'tight', label: 'צמידות', hint: 'כמה מהר הרכב יצא חזרה — עד 5 דקות = מלוא הנקודות, 15 דקות = אפס' },
                    { key: 'hot', label: 'קו עמוס באזור', hint: 'תוך 30 דקות יוצא משם קו עמוס שהרכב הריק יכול היה לתגבר' },
                    { key: 'crush', label: 'קו שצריך תגבור', hint: 'תוספת חומרה כשהקו העמוס ממש נחנק: מעל 100% מהקיבולת = מלוא הנקודות, 90% = חצי — האוטובוס הריק נסע ליד קו שהיה צריך אותו' },
                    { key: 'empty', label: 'ריק גם בספירות', hint: 'חלק נסיעות החזרה שבספירות משרד התחבורה עלו אליהן עד 1.5 נוסעים' },
                  ]}
                  extras={
                    <div className="space-y-3">
                      <div className="text-[12px] font-black text-slate-900">הגנות — נקודות שמופחתות מהציון (0 = בלי הגנה):</div>
                      <div className="flex flex-wrap gap-x-5 gap-y-2 text-[12px] font-bold text-slate-700 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3">
                        {[['night', 'קו לילה (מוגדר כך במשרד)'], ['weekend', 'סופ"ש'], ['rare', 'תצפית בודדת']].map(([k, lbl]) => (
                          <label key={k} className="inline-flex items-center gap-2">{lbl}
                            <NumField value={dset.p[k]} onChange={v => updDset(s2 => ({ ...s2, p: { ...s2.p, [k]: v == null ? 0 : Math.max(0, Math.min(100, v)) } }))} min={0} max={100} width="w-16" suffix="נק׳" />
                          </label>
                        ))}
                      </div>
                      <label className="inline-flex items-center gap-2 text-[12px] font-bold text-slate-700 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3">נכנס לרשימה מציון של לפחות
                        <NumField value={dset.minScore} onChange={v => updDset(s2 => ({ ...s2, minScore: v == null ? 0 : Math.max(0, Math.min(100, v)) }))} min={0} max={100} suffix="מתוך 100" />
                      </label>
                    </div>
                  }
                  footnote='ההגדרות נשמרות רק בדפדפן הזה.'
                />
              );
              if (D.mode !== 'vehicle') {
                return (
                  <div className="space-y-8">
                    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                      <h2 className="text-2xl font-black text-slate-900">נסיעות תפעוליות במסווה</h2>
                      <p className="text-slate-500 font-bold mt-2">נתוני השידורים (הלוך-חזור של אותו רכב) עדיין לא נבנו — הריצה היומית של מדד הדיוק כותבת אותם. בינתיים אין מה להציג כאן.</p>
                    </div>
                  </div>
                );
              }
              const rows = D.lines.filter(L => !dhNearOnly || L.hot);
              return (
              <div className="space-y-8 transition-opacity duration-300 opacity-100">
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                  <h2 className="text-2xl font-black text-slate-900">נסיעות תפעוליות במסווה</h2>
                  <p className="text-slate-500 font-bold mt-1">
                    אוטובוס שחזר ריק לנקודת המוצא תוך 15 דקות, ונרשם כנסיעת שירות. לפי השידורים, {D.nDays} הימים האחרונים (עדכון {String(D.updated || '').slice(0, 10)}).
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6">
                    {[
                      ['קווים', fmtN(D.allLines.length), 'text-slate-900', 'שהחזרה בהם ריקה'],
                      ['זוגות שנצפו', fmtN(D.totalPairs), 'text-slate-900', 'הלוך-חזור של אותו רכב'],
                      ['חזרה בקו אחר', fmtN(D.other), 'text-slate-900', 'זוגות שחזרו בקו אחר'],
                      ['ליד קו עמוס', fmtN(D.near), 'text-rose-700', 'קווים שקו עמוס יצא לידם באותה שעה'],
                      ['ריקים גם בספירות', fmtN(D.emptyLines), 'text-orange-700', 'קווים שרוב החזרות בהם ריקות בספירות'],
                    ].map(([l, v, c, h]) => (
                      <div key={l} className="bg-slate-50 rounded-2xl p-4 text-center" title={h}>
                        <div className={`text-2xl font-black ${c}`}>{v}</div>
                        <div className="text-xs font-bold text-slate-500 mt-1">{l}</div>
                        <div className="text-[10px] font-bold text-slate-400 mt-0.5 leading-snug">{h}</div>
                      </div>
                    ))}
                  </div>
                  <label className="inline-flex items-center gap-2 mt-5 text-sm font-black text-rose-700 cursor-pointer">
                    <input type="checkbox" checked={dhNearOnly} onChange={e => setDhNearOnly(e.target.checked)} className="w-4 h-4 accent-rose-600" />
                    רק כשיש קו עמוס באזור באותה שעה
                  </label>
                </div>

                {settingsPanel}

                <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-200 shadow-sm overflow-x-auto">
                  <p className="text-xs text-slate-500 font-bold mb-3">לחיצה על שורה מציגה דוגמאות מהשידורים.</p>
                  <table className="w-full text-right border-collapse text-sm">
                    <thead><tr className="text-slate-500 text-xs border-b border-slate-200">
                      <th className="p-3">ניקוד</th><th className="p-3">סטטוס</th><th className="p-3">קו</th><th className="p-3">מסלול</th><th className="p-3" title="האשכול של הקו, או המחוז">אשכול</th>
                      <th className="p-3" title="כמה פעמים נצפה הלוך-חזור">זוגות ({D.nDays} יום)</th><th className="p-3" title="בכמה ימים זה קרה">ימים</th><th className="p-3" title="כמה רכבים שונים">רכבים</th><th className="p-3" title="כמה פעמים חזר בקו אחר">בקו אחר</th><th className="p-3" title="דקות מההגעה לקצה ועד היציאה חזרה">פער ממוצע</th><th className="p-3" title="קו עמוס שיצא משם באותה שעה">ליד קו עמוס</th><th className="p-3" title="% מהחזרות שעלו אליהן עד 1.5 נוסעים בספירות">ריק בספירות</th><th className="p-3"></th>
                    </tr></thead>
                    <tbody>
                      {rows.slice(0, 300).map(L => (
                        <React.Fragment key={L.groupKey}>
                          <tr className="border-b border-slate-100 hover:bg-orange-50/40 cursor-pointer" onClick={() => setDhOpen(dhOpen === L.groupKey ? null : L.groupKey)}>
                            <td className="p-3"><span className={`font-black text-base ${L.statusTier.color}`}>{L.score}/100</span></td>
                            <td className="p-3"><span className={`px-3 py-1 rounded-full text-[11px] font-black border ${L.statusTier.bg} ${L.statusTier.color}`}>{L.status}</span></td>
                            <td className="p-3 font-black text-lg">{L.lineNum}</td>
                            <td className="p-3 font-bold">{cityOnly2(L.origin)} – {cityOnly2(L.dest)}</td>
                            <td className="p-3 text-slate-600">{L.cluster || L.district}</td>
                            <td className="p-3 font-black">{L.n}</td>
                            <td className="p-3">{L.days}</td>
                            <td className="p-3">{L.veh}</td>
                            <td className="p-3">{L.other || '—'}</td>
                            <td className="p-3">{L.gap} דק'</td>
                            <td className="p-3 font-black text-rose-700">{L.hot ? `קו ${L.hot.lineNum}` : '—'}</td>
                            <td className="p-3 font-black text-orange-700">{Math.round(L.emptyFrac * 100)}%</td>
                            <td className="p-3 text-slate-400"><Ic n={dhOpen === L.groupKey ? 'chevronUp' : 'chevronDown'} size={16} /></td>
                          </tr>
                          {dhOpen === L.groupKey && (
                            <tr><td colSpan={13} className="p-0">
                              <div className="bg-slate-50 rounded-2xl m-2 p-4 text-sm">
                                <div className="text-slate-600 text-xs font-bold mb-2">ניקוד: תצפיות {L.parts.obs}/{dset.c.obs.on ? dset.c.obs.max : 0} ({L.perWeek.toFixed(1)} בשבוע) · צמידות {L.parts.tight}/{dset.c.tight.on ? dset.c.tight.max : 0} · קו עמוס באזור {L.parts.hot}/{dset.c.hot.on ? dset.c.hot.max : 0} · צריך תגבור {L.parts.crush}/{dset.c.crush.on ? dset.c.crush.max : 0} · ריק בספירות {L.parts.empty}/{dset.c.empty.on ? dset.c.empty.max : 0}{L.protections.length ? ` · הגנות: ${L.protections.map(x => `${x.name} (−${x.value})`).join(', ')}` : ''}</div>
                                <div className="text-slate-500 text-xs font-bold mb-1">דוגמאות מהשידורים:</div>
                                {L.ex.slice(0, 8).map((x, i) => (
                                  <div key={i} className="py-1.5 border-b border-slate-200 last:border-0">
                                    <span className="font-black">{x.day.split('-').reverse().join('.')}</span> · רכב <span dir="ltr" className="font-black">{x.veh}</span> · קו {x.aLine} כיוון {x.dirA}{x.schA != null ? ` (מתוכנן ${hms(x.schA)})` : ''} {hms(x.depA)}–{hms(x.endA)} ← חזר {x.aLine === x.bLine ? 'באותו קו' : `בקו ${x.bLine}`} כיוון {x.dirB}{x.schB != null ? `, מתוכנן ${hms(x.schB)}` : ''}, יצא {hms(x.depB)} · <span className="font-black">{Math.round(x.gap / 60)} דק'</span> אחרי שהגיע
                                    {x.bRiders != null ? <span className={x.bRiders <= DEADHEAD_MAX_RIDERS ? 'text-orange-700 font-black' : 'text-slate-600'}> · בספירות המשרד: {x.bRiders} נוסעים בחזרה</span> : null}
                                    {x.hot ? (() => { const ld = Math.max(x.hot.ridership, x.hot.peakLoad) / (x.hot.capacity || 50); return (
                                      <div className="text-rose-700 text-xs font-bold mt-1 pr-4">באותה שעה קו {x.hot.lineNum} ({cityOnly2(x.hot.origin)} ← {cityOnly2(x.hot.dest)}, {x.hot.time}) נוסע עמוס: {Math.round(Math.max(x.hot.ridership, x.hot.peakLoad))} נוסעים על קיבולת {x.hot.capacity}{ld >= 0.9 ? ` — ${Math.round(ld * 100)}% מהקיבולת, קו שצריך תגבור` : ''}</div>
                                    ); })() : null}
                                  </div>
                                ))}
                              </div>
                            </td></tr>
                          )}
                        </React.Fragment>
                      ))}
                      {!rows.length && <tr><td colSpan={13} className="p-8 text-center text-slate-500 font-bold">לא נמצאו קווים לפי הסינון</td></tr>}
                    </tbody>
                  </table>
                  <p className="text-xs text-slate-500 font-bold mt-4 leading-relaxed">
                    <b>מה בטבלה:</b> "זוגות" — כמה פעמים נצפה הלוך-חזור. "ימים" — בכמה ימים זה קרה. "רכבים" — כמה רכבים שונים. "בקו אחר" — כמה פעמים חזר בקו אחר. "פער ממוצע" — כמה דקות עברו מההגעה לקצה עד היציאה חזרה. "ריק בספירות" — אחוז החזרות שעלו אליהן עד 1.5 נוסעים בספירות.
                  </p>
                  <p className="text-xs text-slate-500 font-bold mt-2 leading-relaxed">
                    לא ברשימה: {D.normal.toLocaleString('he-IL')} קווים שהחזרה בהם עם נוסעים, ו-{D.noCountsN.toLocaleString('he-IL')} קווים בלי ספירות.
                  </p>
                  <HowCalc>
                    <p>אותו רכב (לפי מספרו בשידור) מגיע לקצה נסיעה, ותוך 15 דקות יוצא לנסיעה שמסתיימת עד 1.5 ק"מ מהמקום שבו התחיל — באותו קו או בקו אחר. כל זוג נרשם פעם אחת, על קו החזרה. בכל דוגמה: השעה המתוכננת בלו"ז לצד השעה שבה יצא בפועל.</p>
                    <p>הלוך-חזור צמוד לבדו הוא גם שירות עירוני רגיל. מה שהופך אותו להסעה שנרשמה כשירות הוא שנסיעת החזרה ריקה גם בספירות משרד התחבורה (ברוב הפעמים). קווים שהחזרה בהם עם נוסעים — שירות רגיל, ולא ברשימה.</p>
                    <p>קווים בלי ספירות בקובץ המשרד (מתעדכן רבעונית) לא ברשימה — לא נטען שהם ריקים.{D.unknown ? ` ${D.unknown} קווים מהשידורים לא נמצאו בקובץ המשרד ולכן אינם ברשימה.` : ''}</p>
                  </HowCalc>
                </div>
              </div>
              );
            })()}

            {tab === "allTrips" && (
              <>{trips.length === 0 && <div className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm font-bold text-amber-800">הנסיעות עדיין נטענות ברקע — הלשונית הזו תתמלא כשהן יגיעו (כמה שניות).</div>}
              <div className="bg-white p-6 md:p-8 rounded-[3rem] border border-slate-200 shadow-sm transition-opacity duration-300 opacity-100">
                <header className="mb-8 flex flex-col md:flex-row justify-between items-center gap-6">
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 mb-2">כל הנסיעות במערכת</h2>
                    <p className="text-slate-500 font-bold text-sm">סנן לפי עיר ומצא נסיעות עמוסות.</p>
                  </div>
                  <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                    <label className="flex items-center gap-3 bg-rose-50/50 border-2 border-rose-100 text-rose-800 px-4 py-3 rounded-2xl cursor-pointer hover:bg-rose-50 transition-colors w-full md:w-auto font-black text-sm">
                      <input type="checkbox" checked={showCrowded} onChange={e => setShowCrowded(e.target.checked)} className="w-5 h-5 accent-rose-600 rounded" />
                      הצג רק נסיעות עמוסות (80%+ מהקיבולת)
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
                      <tr className="text-slate-500 text-xs font-black uppercase">
                        <th className="p-5">מס&apos; קו</th>
                        <th className="p-5">מוצא</th>
                        <th className="p-5">יעד</th>
                        <th className="p-5">שעה</th>
                        <th className="p-5 relative">
                          <div className="flex items-center gap-1.5">
                            <span>נוסעים (יעילות)</span>
                            <button onClick={() => setActiveTooltip(activeTooltip === 'ridership' ? null : 'ridership')} className="text-slate-500 hover:text-indigo-600 transition-colors" title="מה זה?" aria-label="מה זה?">
                              <Ic n="info" size={14} />
                            </button>
                            <div className="flex flex-col -space-y-1.5 mr-2">
                              <button title="מיון מהגבוה לנמוך" aria-label="מיון מהגבוה לנמוך" onClick={() => setSortConfig({key: 'ridership', direction: 'desc'})} className={`${sortConfig.key === 'ridership' && sortConfig.direction === 'desc' ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-500'}`}><Ic n="chevronUp" size={12} strokeWidth="3" /></button>
                              <button title="מיון מהנמוך לגבוה" aria-label="מיון מהנמוך לגבוה" onClick={() => setSortConfig({key: 'ridership', direction: 'asc'})} className={`${sortConfig.key === 'ridership' && sortConfig.direction === 'asc' ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-500'}`}><Ic n="chevronDown" size={12} strokeWidth="3" /></button>
                            </div>
                          </div>
                          {activeTooltip === 'ridership' && (
                            <div className="absolute z-30 top-full right-0 mt-2 w-64 p-3 bg-slate-800 text-white text-xs rounded-xl shadow-xl font-normal normal-case text-right leading-relaxed border border-slate-700">
                              <strong className="block mb-1 text-indigo-300">נוסעים (יעילות):</strong> כמה נוסעים עלו לאורך כל המסלול. המספר הקטן הוא חלק מהקיבולת של הרכב: 1 פירושו רכב מלא. הוא מחושב לפי הנוסעים או לפי העומס בשיא, הגבוה מביניהם.
                            </div>
                          )}
                        </th>
                        <th className="p-5 relative">
                          <div className="flex items-center gap-1.5">
                            <span>עומס שיא</span>
                            <button onClick={() => setActiveTooltip(activeTooltip === 'peakLoad' ? null : 'peakLoad')} className="text-slate-500 hover:text-indigo-600 transition-colors" title="מה זה?" aria-label="מה זה?">
                              <Ic n="info" size={14} />
                            </button>
                            <div className="flex flex-col -space-y-1.5 mr-2">
                              <button title="מיון מהגבוה לנמוך" aria-label="מיון מהגבוה לנמוך" onClick={() => setSortConfig({key: 'peakLoad', direction: 'desc'})} className={`${sortConfig.key === 'peakLoad' && sortConfig.direction === 'desc' ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-500'}`}><Ic n="chevronUp" size={12} strokeWidth="3" /></button>
                              <button title="מיון מהנמוך לגבוה" aria-label="מיון מהנמוך לגבוה" onClick={() => setSortConfig({key: 'peakLoad', direction: 'asc'})} className={`${sortConfig.key === 'peakLoad' && sortConfig.direction === 'asc' ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-500'}`}><Ic n="chevronDown" size={12} strokeWidth="3" /></button>
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
                              <select aria-label="סוג קו"
                                value={filterLineType}
                                onChange={e => setFilterLineType(e.target.value)}
                                className="appearance-none bg-slate-100 border border-slate-200 text-slate-600 rounded-md pl-6 pr-2 py-1 text-[10px] font-black outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer hover:bg-slate-200 transition-colors"
                              >
                                <option value="all">הכל</option>
                                {allLineTypes.map(t => <option key={`type-${t}`} value={t}>{t}</option>)}
                              </select>
                              <div className="absolute left-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
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
                    <div className="text-center py-4 text-xs font-bold text-slate-500 bg-slate-50 border-t border-slate-100">
                      הוצגו כל {tableTrips.length.toLocaleString()} התוצאות.
                    </div>
                  )}
                </div>
              </div>
              </>
            )}

            {tab === "simulator" && (
              <>{trips.length === 0 && <div className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm font-bold text-amber-800">הנסיעות עדיין נטענות ברקע — הלשונית הזו תתמלא כשהן יגיעו (כמה שניות).</div>}
              <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm max-w-4xl mx-auto transition-opacity duration-300 opacity-100">
                <header className="mb-8">
                  <h2 className="text-2xl font-black text-slate-900 mb-2">אלגוריתם ייעול ושיפור לוחות זמנים</h2>
                  <p className="text-slate-500 font-bold text-sm leading-relaxed">
                    מציע אילו נסיעות לבטל או לאחד, לפי סוג הקו וגודל הרכב.
                  </p>
                </header>
                
                <div className="bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 mb-8 shadow-inner">
                  <div className={`grid grid-cols-1 ${operatorOptions.length > 0 ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-6 mb-8`}>
                    {/* עם שדה החברה: קו + כיוון בשורה הראשונה, עיר + חברה מפעילה זו ליד זו בשנייה */}
                    <div className={operatorOptions.length > 0 ? 'md:order-1' : ''}>
                      <label className="block text-xs font-[900] text-slate-500 mb-3 pr-2 uppercase tracking-wider">מספר קו / מק&quot;ט</label>
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
                    <div className={operatorOptions.length > 0 ? 'md:order-3' : ''}>
                      <label className="block text-xs font-[900] text-slate-500 mb-3 pr-2 uppercase tracking-wider">עיר (מוצא או יעד)</label>
                      <input 
                        type="text" 
                        list="cities-list"
                        value={optCity === "all" ? "" : optCity} 
                        onChange={e => setOptCity(e.target.value || "all")} 
                        placeholder="הקלד שם עיר..."
                        className="w-full bg-white border-2 border-slate-200 rounded-2xl px-5 py-3 font-black outline-none focus:border-slate-900 text-right transition-all shadow-sm"
                      />
                    </div>
                    {operatorOptions.length > 0 && (
                    <div className="md:order-4">
                      <label htmlFor="opt-operator" className="block text-xs font-[900] text-slate-500 mb-3 pr-2 uppercase tracking-wider">חברה מפעילה <span className="font-bold normal-case tracking-normal">(מספר קווים)</span></label>
                      <select id="opt-operator" value={optOperator} onChange={e => setOptOperator(e.target.value)} className="w-full bg-white border-2 border-slate-200 rounded-2xl px-5 py-3 font-black outline-none focus:border-slate-900 cursor-pointer text-right shadow-sm appearance-none">
                        <option value="all">כל החברות</option>
                        {optOperator !== "all" && !operatorOptions.some(o => o.name === optOperator) && <option value={optOperator}>{optOperator}</option>}
                        {operatorOptions.map(o => <option key={`op-${o.name}`} value={o.name}>{o.name} ({o.lines})</option>)}
                      </select>
                    </div>
                    )}
                    <div className={operatorOptions.length > 0 ? 'md:order-2' : ''}>
                      <label className="block text-xs font-[900] text-slate-500 mb-3 pr-2 uppercase tracking-wider">כיוון נסיעה</label>
                      <select value={optDirection} onChange={e => setOptDirection(e.target.value)} className="w-full bg-white border-2 border-slate-200 rounded-2xl px-5 py-3 font-black outline-none focus:border-slate-900 cursor-pointer text-right shadow-sm appearance-none">
                        <option value="all">כל הכיוונים</option>
                        {allDirections.map(d => <option key={`dir-${d}`} value={d}>{d}</option>)}
                      </select>
                      <p className="text-[11px] font-bold text-slate-500 mt-1.5 pr-2">מספר הכיוון ברישום המשרד: 1 ו-2 הם שני כיווני הקו.</p>
                    </div>
                  </div>

                  <div className="mb-8">
                    <label className="block text-xs font-[900] text-slate-500 mb-4 pr-2 uppercase tracking-wider">ימי פעילות (סינון מרובה)</label>
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
                          <label className="block text-[11px] font-black text-slate-500 uppercase pr-1">מדד לניתוח</label>
                          <select value={optMetric} onChange={e => setOptMetric(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-black text-sm outline-none focus:border-teal-600 cursor-pointer text-right transition-all">
                            <option value="ridership">נוסעים בפועל</option>
                            <option value="peakLoad">עומס שיא</option>
                          </select>
                          <p className="text-[11px] font-bold text-slate-500 leading-snug pr-1">האם להחליט לפי כל מי שעלה בנסיעה, או לפי הרגע הכי עמוס בה.</p>
                        </div>
                        <div className="space-y-2">
                          <label className="block text-[11px] font-black text-slate-500 uppercase pr-1">מרווח איחוד (דק&apos;)</label>
                          <input
                            type="number"
                            value={optCustomGap}
                            onChange={e => setOptCustomGap(e.target.value)}
                            placeholder="לפי סוג קו"
                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-black text-sm outline-none focus:border-slate-900 text-right transition-all"
                          />
                          <p className="text-[11px] font-bold text-slate-500 leading-snug pr-1">מאחדים שתי נסיעות רק אם הפער ביניהן קטן מזה.</p>
                        </div>
                        <div className="space-y-2">
                          <label className="block text-[11px] font-black text-slate-500 uppercase pr-1">מינימום נסיעות ביום</label>
                          <input
                            type="number"
                            value={optMinTrips}
                            onChange={e => setOptMinTrips(e.target.value)}
                            placeholder="3 באזורי"
                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-black text-sm outline-none focus:border-slate-900 text-right transition-all"
                          />
                          <p className="text-[11px] font-bold text-slate-500 leading-snug pr-1">לא מבטלים נסיעות אם יישארו בקו פחות נסיעות ביום.</p>
                        </div>
                        <div className="space-y-2">
                          <label className="block text-[11px] font-black text-slate-500 uppercase pr-1">רף נוסעים לביטול</label>
                          <input
                            type="number"
                            value={optCancelThreshold}
                            onChange={e => setOptCancelThreshold(e.target.value)}
                            placeholder="מתחת ל-5"
                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-black text-sm outline-none focus:border-slate-900 text-right transition-all"
                          />
                          <p className="text-[11px] font-bold text-slate-500 leading-snug pr-1">נסיעה עם פחות נוסעים מזה מוצעת לביטול.</p>
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

                {!simLoading && optimizations.length > 0 && optKm && (() => {
                  // ק"מ בשבוע לפני ואחרי ההמלצות (בקשת ועד התחבורה הר יונה): כמה נחסך,
                  // כמה ק"מ סרק נשאר, ולמה האלגוריתם לא נגע בו
                  const K = optKm;
                  const R = v => Math.round(v).toLocaleString();
                  const cancels = optimizations.filter(o => o.type === 'cancel').length;
                  const merges = optimizations.filter(o => o.type === 'merge').length;
                  const useful = Math.max(0, K.total - K.wasted);
                  const reduced = Math.max(0, K.wasted - K.remain);
                  const w = v => (K.total > 0 ? (v / K.total * 100).toFixed(2) : 0) + '%';
                  const head = [
                    optRunInfo.operator !== "all" ? optRunInfo.operator : '',
                    optRunInfo.city !== "all" ? optRunInfo.city : '',
                  ].filter(Boolean).join(' · ');
                  const shown = K.lines.slice(0, 15);
                  return (
                    <div className="mb-6 bg-white border border-slate-200 rounded-[2rem] p-5 sm:p-6 shadow-sm">
                      <h3 className="text-lg font-black text-slate-900">ק&quot;מ בשבוע: לפני ואחרי ההמלצות</h3>
                      <p className="text-slate-500 text-xs font-bold mb-4">
                        {head ? head + ' · ' : ''}{K.lines.length === 1 ? 'קו אחד' : `${K.lines.length} קווים`} · {cancels} נסיעות לביטול · {merges} איחודים
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 mb-4">
                        <div className="rounded-2xl border-2 border-slate-200 px-3 py-2 flex sm:block items-center justify-between gap-3">
                          <div className="text-xs font-bold text-slate-500">ק&quot;מ היום</div>
                          <div className="text-xl sm:text-2xl font-black whitespace-nowrap text-slate-900 tabular-nums">{R(K.total)}</div>
                        </div>
                        <div className="rounded-2xl border-2 border-rose-200 bg-rose-50 px-3 py-2 flex sm:block items-center justify-between gap-3">
                          <div className="text-xs font-bold text-slate-500">נחסך בהמלצות</div>
                          <div className="text-xl sm:text-2xl font-black whitespace-nowrap text-rose-600 tabular-nums sm:text-right" dir="ltr">−{R(K.saved)}</div>
                        </div>
                        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 px-3 py-2 flex sm:block items-center justify-between gap-3">
                          <div className="text-xs font-bold text-slate-500">ק&quot;מ אחרי ההמלצות</div>
                          <div className="text-xl sm:text-2xl font-black whitespace-nowrap text-emerald-700 tabular-nums">{R(K.total - K.saved)}</div>
                        </div>
                      </div>
                      <div className="text-sm font-black text-slate-900">ק&quot;מ סרק: {R(K.wasted)} היום ← {R(K.remain)} אחרי ההמלצות</div>
                      <div className="flex h-6 rounded-lg overflow-hidden my-2 bg-slate-100">
                        <div style={{ width: w(useful), background: '#10b981' }} />
                        <div style={{ width: w(reduced), background: 'repeating-linear-gradient(45deg,#fda4af 0 6px,#fecdd3 6px 12px)' }} />
                        <div style={{ width: w(K.remain), background: '#f59e0b' }} />
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-slate-600">
                        <span><i className="inline-block w-3 h-3 rounded-sm ml-1 align-[-1px]" style={{ background: '#10b981' }} />ק&quot;מ עם נוסעים {R(useful)}</span>
                        <span><i className="inline-block w-3 h-3 rounded-sm ml-1 align-[-1px]" style={{ background: '#fda4af' }} />סרק שההמלצות מורידות {R(reduced)}</span>
                        <span><i className="inline-block w-3 h-3 rounded-sm ml-1 align-[-1px]" style={{ background: '#f59e0b' }} />סרק שנשאר {R(K.remain)}</span>
                      </div>
                      <div className="text-[11px] font-bold text-slate-400 mt-1">סרק = נסיעות עם פחות נוסעים מהסף של סוג הקו, כמו ב&quot;קווים לא יעילים&quot;</div>
                      {K.remain > 0 && (
                        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm">
                          <div className="font-black text-amber-800 mb-1">למה נשארו {R(K.remain)} ק&quot;מ סרק?</div>
                          {KM_REASONS.filter(([k]) => K.reasons[k] > 0).map(([k, label]) => (
                            <div key={k} className="flex justify-between gap-3 font-bold text-slate-700 py-0.5">
                              <span>{label}</span><span className="tabular-nums">{R(K.reasons[k])}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {K.lines.length > 1 && (
                        <div className="mt-5 overflow-x-auto">
                          <div className="text-sm font-black text-slate-900 mb-2">לפי קו</div>
                          <table className="w-full text-xs sm:text-sm">
                            <thead>
                              <tr className="bg-slate-50 text-slate-500 text-xs">
                                <th className="text-right font-black px-1 sm:px-2 py-2">קו</th>
                                <th className="text-right font-black px-1 sm:px-2 py-2">ק&quot;מ היום</th>
                                <th className="text-right font-black px-1 sm:px-2 py-2">סרק היום</th>
                                <th className="text-right font-black px-1 sm:px-2 py-2">נחסך</th>
                                <th className="hidden sm:table-cell text-right font-black px-1 sm:px-2 py-2">ק&quot;מ אחרי</th>
                                <th className="text-right font-black px-1 sm:px-2 py-2">סרק שנשאר</th>
                              </tr>
                            </thead>
                            <tbody>
                              {shown.map((l, i) => (
                                <tr key={i} className="border-b border-slate-100 font-bold">
                                  <td className="px-1 sm:px-2 py-2"><div className="font-black">{l.line}</div><div className="text-[11px] text-slate-500 leading-tight">{l.origin} – {l.dest}</div></td>
                                  <td className="px-1 sm:px-2 py-2 tabular-nums">{R(l.total)}</td>
                                  <td className="px-1 sm:px-2 py-2 tabular-nums text-slate-500">{R(l.wasted)}</td>
                                  <td className="px-1 sm:px-2 py-2 tabular-nums text-rose-600"><span dir="ltr">{l.saved > 0 ? '−' + R(l.saved) : '0'}</span></td>
                                  <td className="hidden sm:table-cell px-1 sm:px-2 py-2 tabular-nums">{R(l.total - l.saved)}</td>
                                  <td className="px-1 sm:px-2 py-2 tabular-nums text-amber-700">{R(l.remain)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {K.lines.length > shown.length && (
                            <div className="text-xs font-bold text-slate-500 mt-2">ועוד {K.lines.length - shown.length} קווים · כולם בקובץ האקסל</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
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
                            <span className="font-black text-slate-700">{opt.from} ו-{opt.to} <span className="text-xs text-slate-500 font-normal">{opt.gap === 0 ? '(באותה דקה — איחוד לרכב אחד)' : `(${opt.gap} דק' הפרש)`}</span></span>
                          </div>
                          <div className="flex justify-between items-center mb-4 text-sm">
                            <span className="font-bold text-slate-500">{opt.usedMetric === 'peakLoad' ? 'עומס שיא מצטבר:' : 'נוסעים מצטבר:'}</span>
                            <span className="font-black text-slate-700">
                              {opt.total} <span className="text-xs text-slate-500 font-normal mr-1">({opt.val1} בנסיעה ה-1, {opt.val2} בנסיעה ה-2)</span>
                            </span>
                          </div>
                          <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                            <span className="font-black text-indigo-700">שעה מומלצת לאיחוד:</span>
                            <span className="font-black text-2xl text-indigo-600 bg-white px-3 py-1 rounded-xl shadow-sm">{opt.suggestedTime}</span>
                          </div>
                          {opt.km > 0 && (
                            <div className="flex justify-between items-center text-sm pt-3 mt-3 border-t border-slate-200">
                              <span className="font-bold text-emerald-700">חוסך בשבוע:</span>
                              <span className="font-black text-emerald-700">{Math.round(opt.km).toLocaleString()} ק&quot;מ</span>
                            </div>
                          )}
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
                          {opt.km > 0 && (
                            <div className="flex justify-between items-center text-sm pt-3 mt-3 border-t border-slate-200">
                              <span className="font-bold text-emerald-700">חוסך בשבוע:</span>
                              <span className="font-black text-emerald-700">{Math.round(opt.km).toLocaleString()} ק&quot;מ</span>
                            </div>
                          )}
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
                      <p className="text-slate-500 text-sm font-bold px-10">נסה לשנות את הסינון או לבחור קו/עיר אחרים.</p>
                    </div>
                  ) : null}
                </div>
              </div>
              </>
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


                  <div className="border-t border-slate-100 pt-2">
                    <h3 className="text-2xl font-black text-slate-900 mb-2">איך המערכת עובדת</h3>
                    <p className="text-slate-500 font-medium text-sm">הסבר על כל אחד מהכלים: מה הוא מציג, איך החישוב עובד, ומתי כדאי להשתמש בו.</p>
                  </div>

                  {/* טאב: קווים מיותרים */}
                  <section className="bg-rose-50/40 rounded-[2rem] p-6 border border-rose-100">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="bg-rose-600 text-white p-2 rounded-xl"><Ic n="trash" size={18} /></div>
                      <h3 className="text-xl font-black text-rose-700">קווים לא יעילים</h3>
                    </div>
                    <p className="text-slate-700 font-medium text-sm mb-4 leading-relaxed">
                      <strong>מה הוא עושה:</strong> ציון אי-יעילות 0–100 לכל קו. מוצגים קווים מ-25 ומעלה.
                    </p>

                    <div className="bg-white rounded-2xl border border-rose-100 p-4 mb-3">
                      <h4 className="font-black text-slate-800 text-sm mb-2">שלב 1: סיווג ל-8 קטגוריות</h4>
                      <p className="text-slate-600 text-sm leading-relaxed mb-2">כל קו משויך לאחת מ-8 הקטגוריות של משרד התחבורה, לפי סוג, אורך (סף 45 ק"מ) ותדירות (סף 600 בשבוע).</p>
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
                      <p className="text-slate-600 text-sm leading-relaxed mb-2">חמישה רכיבים, סף הנוסעים בכל אחד מהם מותאם לקטגוריה (5 לאזורי/לילה, 8 לקצר/מזין, 10 לארוך/תדירות נמוכה, 15 לתדירות גבוהה/תלמידים):</p>
                      <ul className="list-disc list-inside text-slate-600 text-sm space-y-1.5 pr-2">
                        <li><strong>נסיעות שפל (עד {pset.c.lowTrips.on ? pset.c.lowTrips.max : 0} נק&apos;):</strong> אחוז הנסיעות עם פחות נוסעים מסף הקטגוריה.</li>
                        <li><strong>קילומטר מבוזבז (עד {pset.c.wastedKm.on ? pset.c.wastedKm.max : 0} נק&apos;):</strong> משקלל אחוז ק&quot;מ סרק וכמות מוחלטת.</li>
                        <li><strong>עלות תפעולית לנוסע (עד {pset.c.cost.on ? pset.c.cost.max : 0} נק&apos;):</strong> יחס לבנצ&apos;מרק הקטגוריה (₪31.8 לאזורי, ₪9.4 לעירוני תדירות גבוהה, וכו&apos;).</li>
                        <li><strong>ממוצע נוסעים ועומס שיא (עד {pset.c.riders.on ? pset.c.riders.max : 0} נק&apos;):</strong> ביחס לקיבולת הרכב — מיניבוס (19), מידי (35), רגיל (50), מפרקי (90).</li>
                        <li><strong>נסיעה תפעולית במסווה (עד {pset.c.deadhead && pset.c.deadhead.on ? pset.c.deadhead.max : 0} נק&apos;):</strong> רכב שחזר ריק תוך 15 דקות. מ-7 פעמים בשבוע הקו מקבל את כל הנקודות.</li>
                        <li><strong>קווים לאילת:</strong> נספרת רק הנסיעה התפעולית, כי רוב הנוסעים לא מתקפים.</li>
                        <li className="text-slate-500">אלה ברירות המחדל{psetDefault ? '' : ' — כרגע פועלות ההגדרות שלכם'}. אפשר לשנות את הניקוד בלוח ⚙️ שבלשונית &quot;קווים לא יעילים&quot;.</li>
                      </ul>
                    </div>

                    <div className="bg-orange-50 rounded-2xl border border-orange-100 p-4 mb-3">
                      <h4 className="font-black text-orange-800 text-sm mb-2">נסיעות תפעוליות במסווה — לשונית נפרדת</h4>
                      <p className="text-slate-600 text-sm leading-relaxed mb-2">
                        הסעת רכב ריק שנרשמה כנסיעת שירות. מזהים לפי השידורים: חזרה לנקודת המוצא תוך 15 דקות.
                      </p>
                      <p className="text-slate-600 text-sm leading-relaxed mb-2"><strong>הניקוד</strong> באותה שיטה (רכיבים לבחירה, נרמול ל-100, הגנות, אותן תוויות סטטוס):</p>
                      <ul className="list-disc list-inside text-slate-600 text-sm space-y-1.5 pr-2">
                        <li><strong>תצפיות (עד {dset.c.obs.on ? dset.c.obs.max : 0}):</strong> כמה פעמים בשבוע זה קורה; 7 ומעלה = מלוא הנקודות.</li>
                        <li><strong>צמידות (עד {dset.c.tight.on ? dset.c.tight.max : 0}):</strong> כמה מהר הרכב יצא חזרה — עד 5 דקות = מלוא הנקודות, 15 = אפס.</li>
                        <li><strong>קו עמוס באזור ({dset.c.hot.on ? dset.c.hot.max : 0}):</strong> תוך 30 דקות יצא משם קו עמוס (80%+) שהרכב הריק יכול היה לתגבר. הרכב צריך להתאים: לא בינעירוני לקו עירוני ולהפך, ולא רכב קטן לקו של רכב גדול.</li>
                        <li><strong>קו שצריך תגבור (עד {dset.c.crush.on ? dset.c.crush.max : 0}):</strong> תוספת חומרה כשהקו העמוס ממש נחנק — מעל 100% מהקיבולת = מלוא הנקודות, 90% = חצי. האוטובוס הריק נסע ליד קו שהיה צריך אותו.</li>
                        <li><strong>ריק גם בספירות (עד {dset.c.empty.on ? dset.c.empty.max : 0}):</strong> נסיעת החזרה ריקה גם בספירות משרד התחבורה (עד 1.5 נוסעים). קו שאין לו ספירות בקובץ (מתעדכן רבעונית) לא נטען כריק.</li>
                        <li><strong>הגנות:</strong> קו לילה (−{dset.p.night}), סופ&quot;ש (−{dset.p.weekend}), תצפית בודדת (−{dset.p.rare}).</li>
                      </ul>
                    </div>

                    <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-4 mb-3">
                      <h4 className="font-black text-emerald-800 text-sm mb-2">שלב 3: הגנות (מופחתות מהציון)</h4>
                      <ul className="list-disc list-inside text-emerald-700 text-sm font-medium space-y-1 pr-2">
                        <li><strong>תחנות בלעדיות / יעד ייחודי (−15):</strong> הקו משרת תחנות שאין אליהן קו אחר.</li>
                        <li><strong>מותאם רכבת (−10):</strong> עמודת "ייחודיות" מציינת זאת במפורש.</li>
                        <li><strong>תלמידים בשעות בי&quot;ס (−10):</strong> 60%+ מהנסיעות ב-7:00–8:30 או 13:00–15:30.</li>
                        <li><strong>קו סופ&quot;ש (−10):</strong> 60%+ מהנסיעות בשישי-שבת, שבהם דפוס הביקוש שונה מקווי חול.</li>
                        <li><strong>קו חדש בהרצה (−10):</strong> הקו הופיע לראשונה בשנה האחרונה — מעט נוסעים זה שלב בניית הביקוש, לא בזבוז. מזוהה מארכיון "הקו בזמן".</li>
                        <li><strong>כבר צומצם (−10):</strong> שני צמצומי שירות ומעלה בשנה האחרונה — הצמצום כבר קרה. מזוהה מהארכיון.</li>
                        <li><strong>אין חפיפת תחנות משמעותית (−10):</strong> לא נמצאה חפיפת תחנות מעל סף המדד. זו הגנה סטטיסטית; גם כשנמצאה חפיפה, לא אומתה חלופה שימושית לנוסעים.</li>
                      </ul>
                    </div>

                    <div className="bg-rose-50 rounded-2xl border border-rose-100 p-4 mb-3">
                      <h4 className="font-black text-rose-800 text-sm mb-2">עלות עודפת באומדן — מה זה ואיך מחושב</h4>
                      <p className="text-slate-700 text-sm leading-relaxed mb-2">
                        תרגום של חוסר היעילות לשקלים: כמה עולה להסיע נוסע בקו הזה, לעומת כמה זה עולה בקו ממוצע
                        מאותה קטגוריה — כפול כל הנוסעים בשנה.
                      </p>
                      <div className="bg-white rounded-xl border border-rose-100 p-3 text-sm font-bold text-slate-700 mb-2" style={{ direction: 'rtl' }}>
                        (עלות לנוסע בקו − עלות ממוצעת בקטגוריה) × ממוצע נוסעים בנסיעה × נסיעות בשבוע × 52 שבועות
                      </div>
                      <p className="text-slate-600 text-xs leading-relaxed">
                        מוצג רק כשהקו יקר מהממוצע. <strong>אומדן להמחשה</strong>, לא כולל קווים שבוטלו.
                      </p>
                    </div>

                    <div className="bg-white rounded-2xl border border-rose-100 p-4">
                      <h4 className="font-black text-slate-800 text-sm mb-2">שלב 4: תיוג סטטוס</h4>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-[11px] font-black">
                        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl p-2 text-center">0–24 תקין</div>
                        <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-xl p-2 text-center">25–44 סטייה קלה</div>
                        <div className="bg-orange-50 border border-orange-200 text-orange-600 rounded-xl p-2 text-center">45–64 טעון בדיקה</div>
                        <div className="bg-rose-50 border border-rose-200 text-rose-600 rounded-xl p-2 text-center">65–79 לא יעיל</div>
                        <div className="bg-rose-100 border border-rose-300 text-rose-700 rounded-xl p-2 text-center">80+ חמור</div>
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
                        <li>לכל אזור נסכמים הקווים החמורים, הנסיעות, הק"מ המבוזבזים והעלות. קווים שבוטלו לא נספרים. בתצוגה לפי עיר, קו בין שתי ערים מופיע בשתיהן.</li>
                        <li><strong>מדד חומרה:</strong> ממוצע ציוני הקווים החמורים באזור, ועוד נקודה לכל 15,000 ק"מ מבוזבזים (עד 40 נקודות), ולכל היותר 100.</li>
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
                      <strong>מה הוא עושה:</strong> ממליץ לכל נסיעה אם <strong>לאחד</strong> אותה עם נסיעה צמודה, <strong>לבטל</strong> או <strong>להשאיר</strong>, ומסביר למה.
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
                    <a href="mailto:shlomihartman@gmail.com" className="text-indigo-600 hover:underline" dir="ltr">shlomihartman@gmail.com</a>
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

