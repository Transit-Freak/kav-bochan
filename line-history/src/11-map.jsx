/* הקו בזמן · 11-map.jsx — לשונית המפה (MapTab).
   חלק מ-line-history/src (הסדר ב-files.json). כל החלקים מחוברים לפי הסדר ומקומפלים יחד בדפדפן (index.html),
   כך שכל השמות משותפים בין החלקים כמו בקובץ אחד. */


/* ---------- אפליקציה ---------- */
// סוגי תחבורה שאינם אוטובוס. עד יולי 2026 הסורק סינן כל route_type שאינו 3,
// ולכן הרכבת, מוניות השירות והרכבת הקלה לא היו באתר כלל — למרות שהם יושבים
// באותו פיד ונושאים route_desc באותו פורמט. הרכבת הקלה והכרמלית מוצגות
// כקבוצה אחת (בקשת המשתמש).
// כל סוג תחבורה הוא קטגוריה עומדת בפני עצמה — רכבת ומוניות שירות אינן
// אותו דבר ואינן חולקות מסך (בקשת המשתמש). "שירות לפי דרישה" אינו כאן:
// הוא מופעל בידי חברות האוטובוס ויושב תחת "קווים".
/* ---------- מפת העיר לפי חודש (שלמה 18.09) ---------- */
// בוחרים עיר, שנה וחודש — ורואים על המפה איך זה נראה אז: תחנות שהשתנו
// באותו חודש (לחיצה על סימן = מה קרה לתחנה), או קווים — מסומנים רק
// הקווים שבהם בוצעו שינויים מהסוגים שנבחרו, על המסלול כפי שהיה אז.
// צבע לכל קו (לפי מספרו) — כל קווי העיר בצבעים, כמו במפת קווים (שלמה 18.09)
const ALL_IL = "כל הארץ";   // בחירת "עיר" שמציגה את כל הארץ (שלמה 22.09)
const LINE_PALETTE = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#65a30d", "#ea580c", "#4f46e5", "#0d9488", "#c026d3", "#b45309"];
const lineHash = (str) => { let h = 0; for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
const STOP_KIND_LIST = ["new", "del", "renamed", "moved", "city", "pubdest", "stype", "platform", "gtfs2012"];
const LINE_KIND_SKIP = new Set(["baseline", "snapshot"]);
function MapTab({ idx, openLine, cities }) {
  const [months, setMonths] = useState(null);
  const [city, setCity] = usePersistedQ("lh-map-city");
  const [yr, setYr] = useState("");
  const [mon, setMon] = useState("");
  const [mode, setMode] = useState("stops");
  const [kinds, setKinds] = useState(() => new Set());
  const [stopChs, setStopChs] = useState(null);
  const [lineChs, setLineChs] = useState(null);
  const [routes, setRoutes] = useState({});       // rd → [[lat,lon],…] של הגרסה שהייתה בתוקף אז
  const [err, setErr] = useState(null);
  // "2012" במפה (שלמה 22.09): כל התחנות שהיו בעיר ברישום התחנות של יוני 2012
  // (GTFS של משרד התחבורה דרך OpenStreetMap, changeset 12028672) — נטען פעם אחת
  const [snap12, setSnap12] = useState(null);
  const is2012 = mon === "snapshot2012";
  useEffect(() => {
    if (!is2012 || snap12) return;
    dfetch("../magihim-2012/data/stops-2012.json").then((r) => (r.ok ? r.json() : { stops: {} })).then((d) => setSnap12(d.stops || {})).catch(() => setSnap12({}));
  }, [is2012, snap12]);
  const mapRef = useRef(null), mapObj = useRef(null), layer = useRef(null);
  const cache = useRef({});
  useEffect(() => { getMonths().then((d) => {
    const ms = (d.months || []).slice().sort();
    setMonths(ms);
    if (ms.length) { const last = ms[ms.length - 1]; setYr((c) => c || last.slice(0, 4)); setMon((c) => c || last); }
  }).catch(() => setErr("months")); }, []);
  const canon = useMemo(() => {
    const c = (city || "").trim();
    if (!c) return "";
    if (c === ALL_IL) return "*";
    return (cities || []).find((x) => x === c) || (cities || []).find((x) => x.includes(c) || c.includes(x)) || c;
  }, [city, cities]);
  const place = canon === "*" ? "כל הארץ" : canon;            // לתצוגה
  const inPlace = canon === "*" ? "בכל הארץ" : "ב" + canon;
  const monthEnd = mon && !is2012 ? periodEnd(mon) : "";
  // מיקוד על העיר ברגע הבחירה (שלמה 18.09) — גבולות התחנות של כל עיר, data/cities.json
  const [cityBox, setCityBox] = useState(null);
  useEffect(() => { dfetch("data/cities.json").then((r) => r.json()).then(setCityBox).catch(() => {}); }, []);
  useEffect(() => {
    const map = mapObj.current;
    if (!map || !canon) return;
    if (canon === "*") { map.fitBounds([[29.45, 34.2], [33.35, 35.95]], { padding: [10, 10] }); return; }
    const b = cityBox && cityBox[canon];
    if (!b) return;
    map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: [20, 20], maxZoom: 14 });
  }, [canon, cityBox]);
  // אירועי תחנות / שינויי קווים של החודש
  // קובצי השינויים של התקופה נשמרים לפי תקופה — מעבר בין תחנות לקווים לא מוריד שוב.
  // שינויי הקווים (6–7 מגה לשנה) נטענים רק במצב קווים; במצב תחנות הם לא מוצגים
  // בכלל, והגעתם הייתה מפעילה מחדש את טעינת המסלולים (סקירה 22.09)
  const chsCache = useRef({});
  useEffect(() => {
    if (!mon || is2012) return;
    setErr(null);
    // ביטול בהחלפת תקופה/מצב: תשובה איטית של שנה שלמה לא דורסת חודש שנבחר אחריה
    let ok = true;
    const get = (prefix) => {
      const k = prefix + mon;
      if (!chsCache.current[k]) chsCache.current[k] = loadPeriod(prefix, mon, months).catch(() => { delete chsCache.current[k]; return []; });
      return chsCache.current[k];
    };
    setStopChs(null);
    get("stops-").then((d) => { if (ok) setStopChs(d); });
    if (mode === "lines") { setLineChs(null); get("").then((d) => { if (ok) setLineChs(d); }); }
    else setLineChs(null);
    return () => { ok = false; };
  }, [mon, months, mode]);
  const lineOf = useMemo(() => { const m = {}; (((idx || {}).lines) || []).forEach((l) => { m[l.rd] = l; }); return m; }, [idx]);
  // תחנות של העיר שהשתנו בחודש — מקובצות לפי מק"ט
  const stopGroups = useMemo(() => {
    if (is2012) {
      if (!snap12 || !canon) return [];
      // העיר היא סוף הכתובת ברישום 2012; שמות ערים שנכתבו אז אחרת
      const ALIAS = { "תל אביב יפו": ["תל אביב"], "נוף הגליל": ["נצרת עילית"], "מעלות תרשיחא": ["מעלות"], "יהוד מונוסון": ["יהוד"], "דייר חנא": ["דיר חנא"] };
      const names = [canon].concat(ALIAS[canon] || []);
      const out = [];
      for (const code in snap12) {
        const [n, la, lo, addr] = snap12[code];
        if (code.length === 7 && code.startsWith("99") && (!(snap12[code][10] || 0) || snap12[code][11])) continue;   // מספר זמני בלי קו ב-2012, או כפילות של תחנה אמיתית
        const a = (addr || "").trim();
        if (canon !== "*" && !names.some((c) => a === c || a.endsWith(" " + c))) continue;
        out.push({ code, evs: [{ c: code, d: "2012-06-26", k: "gtfs2012", n, t: a, la, lo }] });
      }
      return out;
    }
    if (!stopChs || !canon) return [];
    const g = {};
    stopChs.forEach((c) => {
      if (c.la == null || (canon !== "*" && (c.t || "") !== canon)) return;
      if (c.k === "platform" && !c.pv) return;
      if (kinds.size && !kinds.has(c.k)) return;
      (g[c.c] = g[c.c] || []).push(c);
    });
    return Object.entries(g).map(([code, evs]) => ({ code, evs: evs.sort((a, b) => a.d < b.d ? -1 : 1) }));
  }, [stopChs, canon, kinds, is2012, snap12]);
  const stopKindCounts = useMemo(() => {
    const n = {};
    (stopChs || []).forEach((c) => { if (c.la != null && (canon === "*" || (c.t || "") === canon) && !(c.k === "platform" && !c.pv)) n[c.k] = (n[c.k] || 0) + 1; });
    return n;
  }, [stopChs, canon]);
  // קווים של העיר (לפי ערי הקצה) שהשתנו בחודש — לפי סוגי השינוי שנבחרו
  const lineGroups = useMemo(() => {
    if (!lineChs || !canon) return [];
    const g = {};
    lineChs.forEach((c) => {
      const l = lineOf[c.rd];
      if (!l || LINE_KIND_SKIP.has(c.k)) return;
      if (canon !== "*" && !destCities(l.dest).includes(canon)) return;
      (g[c.rd] = g[c.rd] || { rd: c.rd, l, chs: [] }).chs.push(c);
    });
    return Object.values(g).sort((a, b) => lineNum(a.l.line) - lineNum(b.l.line));
  }, [lineChs, canon, lineOf]);
  const lineKindCounts = useMemo(() => {
    const n = {};
    lineGroups.forEach((x) => x.chs.forEach((c) => { n[c.k] = (n[c.k] || 0) + 1; }));
    return n;
  }, [lineGroups]);
  const shownLines = useMemo(() => kinds.size ? lineGroups.filter((x) => x.chs.some((c) => kinds.has(c.k))) : [], [lineGroups, kinds]);
  // כל קווי העיר שיכלו להתקיים באותו חודש (וריאנט שבוטל לפני החודש מדולג);
  // מה שבאמת היה בתוקף אז נקבע מקובץ הקו — הגרסה האחרונה עד סוף החודש
  const cityLines = useMemo(() => {
    if (!canon || !mon) return [];
    // כל הארץ: רק הקווים שהשתנו בתקופה (כל 13 אלף הקווים ברקע היו מאות מגה-בייט)
    if (canon === "*") return lineGroups.map((x) => x.l);
    return (((idx || {}).lines) || []).filter((l) => destCities(l.dest).includes(canon) && !(l.lk === "removed" && (l.ld || "") < periodStart(mon)));
  }, [idx, canon, mon, lineGroups]);
  useEffect(() => setKinds((s) => (s.size ? new Set() : s)), [mode, canon]);
  const toggleKind = (k) => setKinds((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  // מסלולי הקווים המסומנים — הגרסה האחרונה עם שרטוט עד סוף החודש.
  // כל הקווים נטענים (בלי תקרה, בקשת שלמה): במנות של 8 במקביל, המפה
  // מתמלאת תוך כדי ופס התקדמות מראה כמה נשאר.
  const [prog, setProg] = useState(null);   // {done, total} בזמן טעינה
  useEffect(() => {
    if (mode !== "lines" || !monthEnd) return;
    const want = cityLines.map((l) => l.rd).filter((rd) => !(rd + "@" + mon in cache.current));
    // ה-flush מכסה את כל קווי העיר שכבר במטמון, לא רק את מה שהריצה הזו הביאה: הריצה
    // מתחילה מחדש כשקובץ השינויים מגיע (cityLines תלוי ב-lineGroups), וקווים שנטענו
    // בריצה הקודמת היו נעלמים מהמפה (סקירה 22.09)
    const flush = () => setRoutes((r) => { const o = { ...r }; cityLines.forEach((l) => { const k = l.rd + "@" + mon; if (k in cache.current) o[k] = cache.current[k]; }); return o; });
    if (!want.length) { flush(); setProg(null); return; }
    let alive = true, i = 0, done = 0;
    setProg({ done: 0, total: want.length });
    const one = (rd) => dfetch("data/lines/" + fsafe(rd) + ".json").then((r) => r.json()).then((lf) => {
      const m = materializeLf(lf);
      const vs = (m.versions || []).filter((v) => v.d <= monthEnd && !hiddenEv(v));
      const last = vs[vs.length - 1];
      // לא היה בתוקף אז: עוד לא תועד, או שהגרסה האחרונה עד אז היא ביטול
      if (!last || last.k === "removed" || last.k === "planned-dropped") { cache.current[rd + "@" + mon] = null; return; }
      const v = [...vs].reverse().find((x) => typeof x.shp === "string" && x.shp.length > 2);
      cache.current[rd + "@" + mon] = v ? decodeShape(v.shp) : null;
    }).catch(() => { cache.current[rd + "@" + mon] = null; });
    const worker = () => {
      if (!alive) return Promise.resolve();
      if (i >= want.length) return Promise.resolve();
      const rd = want[i++];
      return one(rd).then(() => {
        done++;
        if (!alive) return;
        if (done % 5 === 0 || done === want.length) setProg({ done, total: want.length });   // המפה מצוירת פעם אחת, בסוף
        return worker();
      });
    };
    Promise.all(Array.from({ length: 8 }, worker)).then(() => { if (alive) { flush(); setProg(null); } });
    return () => { alive = false; setProg(null); };   // מעבר למצב תחנות באמצע טעינה — בלי זה הכיסוי נשאר תקוע
  }, [cityLines, mode, monthEnd, mon]);
  // המפה
  useEffect(() => {
    if (!mapRef.current || mapObj.current || !window.L) return;
    const map = L.map(mapRef.current, { scrollWheelZoom: true, preferCanvas: true });   // canvas — מאות מסלולים בלי להיחנק
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>', maxZoom: 19,
    }).addTo(map);
    map.setView([31.9, 35.0], 8);
    mapObj.current = map;
    layer.current = L.featureGroup().addTo(map);   // featureGroup: אירועי לחיצה של הסמנים עולים לקבוצה
    return () => { map.remove(); mapObj.current = null; layer.current = null; };
  }, []);
  const stopLabel = (c) => c.k === "platform" ? (c.st === "add" ? "רציף " + c.pl + " נוסף" : "רציף " + c.pl + " בוטל")
    : c.k === "renamed" ? "שינוי שם: " + esc(c.on || "") + " ← " + esc(c.nn || c.n || "")
    : c.k === "moved" ? "הוזזה " + (c.dist || c.m || "") + " מ׳"
    : c.k === "city" ? "שינוי עיר: " + esc(c.oc || "") + " ← " + esc(c.nc || "")
    : c.k === "pubdest" ? "תחנת היעד לפרסום שוּנתה"
    : c.k === "stype" ? "סוג התחנה: " + esc(c.ot || "") + " ← " + esc(c.nt || "")
    : c.k === "gtfs2012" ? "ברישום 2012"
    : c.k === "new" ? "תחנה חדשה" + (c.lines && c.lines.length ? " · קווים: " + c.lines.slice(0, 8).join(", ") : "")
    : c.k === "del" ? "בוטלה" + (c.reused ? " · המק״ט הוקצה מחדש לתחנה אחרת" : "") + (c.lines && c.lines.length ? " · עצרו בה: " + c.lines.slice(0, 8).join(", ") : "")
    : (SKINDS[c.k] || { label: c.k }).label;
  useEffect(() => {
    const map = mapObj.current, lg = layer.current;
    if (!map || !lg) return;
    lg.clearLayers();
    lg.off("click");
    const pts = [];
    if (mode === "stops") {
      // החלון הקופץ נבנה רק לתחנה שנלחצה (33 אלף חלונות מוכנים מראש = 20 מגה זיכרון; סקירה 22.09)
      const stopHtml = (g) => {
        const last = g.evs[g.evs.length - 1];
        return `<b>${esc(last.nn || last.n || "")}</b> <span class="pcode" dir="ltr">${esc(g.code)}</span><br>` +
          (last.k === "gtfs2012" ? `<span class="pst">${esc(last.t || "")}</span><br><span class="pst">רישום 2012 · GTFS 2012 דרך OSM</span><br>` : "") +
          g.evs.map((c) => `<span class="pst"><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${(SKINDS[c.k] || {}).color || "#64748b"};margin-inline-end:5px"></i>${c.b12 ? "בין 2012 ל-2017" : fmtD(c.d)} · ${stopLabel(c)}</span>`).join("<br>") +
          `<br><a href="#stop=${encodeURIComponent(g.code)}" class="plink">כל ההיסטוריה של התחנה ←</a>`;
      };
      lg.on("click", (e) => {
        const g = e.propagatedFrom && e.propagatedFrom._g;
        if (!g) return;
        L.popup({ className: "lh-pop", maxWidth: 320 }).setLatLng(e.latlng).setContent(stopHtml(g)).openOn(map);
      });
      const big = stopGroups.length > 5000;
      const addOne = (g) => {
        const last = g.evs[g.evs.length - 1];
        const color = (SKINDS[last.k] || {}).color || "#2563eb";
        pts.push([last.la, last.lo]);
        const m = L.circleMarker([last.la, last.lo], { radius: big ? 5 : 8, color: "#fff", weight: big ? 1 : 2, fillColor: color, fillOpacity: 0.95 });
        m._g = g;
        m.addTo(lg);
      };
      // עד 2,500 תחנות מצוירות בבת אחת; מעבר לזה (כל הארץ, רישום 2012 — 33 אלף) במנות
      // עם פס התקדמות, כדי שהדפדפן לא ייתקע (שלמה 22.09: "שיטען כמו כל הקווים בעיר").
      // המנות ממוינות לפי קו רוחב, כדי שכל מנה תצייר מחדש אזור קטן ולא את כל הארץ,
      // והמיקוד נעשה פעם אחת לפני הציור (סקירה 22.09: 237 אלף ציורים חוזרים → 100 אלף)
      const CH = 2500;
      if (stopGroups.length > CH) {
        const ordered = stopGroups.slice().sort((a, b) => a.evs[a.evs.length - 1].la - b.evs[b.evs.length - 1].la);
        if (canon !== "*") map.fitBounds(L.latLngBounds(ordered.map((g) => { const l = g.evs[g.evs.length - 1]; return [l.la, l.lo]; })).pad(0.05), { maxZoom: 15 });
        let i = 0, alive = true, timer = null;
        setProg({ done: 0, total: ordered.length });
        const step = () => {
          if (!alive) return;
          const end = Math.min(i + CH, ordered.length);
          for (; i < end; i++) addOne(ordered[i]);
          if (i < ordered.length) { setProg({ done: i, total: ordered.length }); timer = setTimeout(step, 0); }
          else setProg(null);
        };
        timer = setTimeout(step, 0);
        return () => { alive = false; clearTimeout(timer); setProg(null); };
      }
      stopGroups.forEach(addOne);
    } else {
      const sel = new Set(shownLines.map((x) => x.rd));
      // כל קווי העיר כפי שהיו אז — אפור דק; הקווים שהשתנו (לפי הסוגים שנבחרו) מעליהם, צבועים
      cityLines.forEach((l) => {
        const r = routes[l.rd + "@" + mon];
        if (!r || !r.length || sel.has(l.rd)) return;
        r.forEach((p) => pts.push(p));
        const html = `<b>${esc(l.line ? "קו " + l.line : taxiName(l) || "קו")}</b> · ${esc(l.op || "")}<br><span class="pcode">${esc(l.dest || "")}</span><br><a href="#${encodeURIComponent(l.rd)}" class="plink">לעמוד הקו ←</a>`;
        L.polyline(r, { color: LINE_PALETTE[lineHash(l.line || l.rd) % LINE_PALETTE.length], weight: 2.5, opacity: 0.75 }).bindPopup(html, { className: "lh-pop", maxWidth: 320 }).addTo(lg);
      });
      shownLines.forEach((x) => {
        const r = routes[x.rd + "@" + mon];
        if (!r || !r.length) return;
        r.forEach((p) => pts.push(p));
        const k0 = x.chs.find((c) => kinds.has(c.k)) || x.chs[0];
        const color = catColor(k0.k) || (KINDS[k0.k] || {}).color || "#7c3aed";
        const html = `<b>${esc(x.l.line ? "קו " + x.l.line : taxiName(x.l) || "קו")}</b> · ${esc(x.l.op || "")}<br><span class="pcode">${esc(x.l.dest || "")}</span><br>` +
          x.chs.map((c) => `<span class="pst"><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${catColor(c.k)};margin-inline-end:5px"></i>${fmtD(c.d)} · <b>${esc((KINDS[c.k] || { label: c.k }).label)}</b>${c.note ? " — " + esc(noteFix(c.note)).slice(0, 220) : ""}</span>`).join("<br>") +
          `<br><a href="#${encodeURIComponent(x.rd)}" class="plink">לעמוד הקו ←</a>`;
        // קו שהשתנה: מסגרת לבנה ומעליה צבע הקטגוריה, עבה — בולט מעל שאר הקווים
        L.polyline(r, { color: "#fff", weight: 9, opacity: 0.95 }).addTo(lg);
        L.polyline(r, { color, weight: 5, opacity: 1 }).bindPopup(html, { className: "lh-pop", maxWidth: 340 }).addTo(lg);
      });
    }
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 15 });
  }, [mode, stopGroups, shownLines, cityLines, routes, mon, kinds]);
  const years = months ? [...new Set(months.map((m) => m.slice(0, 4)))].sort().reverse() : [];
  const noRoute = mode === "lines" && shownLines.filter((x) => routes[x.rd + "@" + mon] === null).length;
  return (
    <div className="card">
      <p className="maphint">בחרו עיר וחודש. המפה מראה את התחנות שהשתנו אז, או את קווי העיר כפי שהיו; לחיצה על סימן מסבירה מה קרה.</p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input className="search" style={{ flex: 1, minWidth: 180 }} list="lh-map-cities" value={city} onChange={(e) => setCity(e.target.value)} placeholder="עיר… (למשל חולון)" aria-label="עיר" />
        <button className={"mchip" + (canon === "*" ? " on" : "")} aria-pressed={canon === "*"} title="כל התחנות/הקווים שהשתנו בכל הארץ, בלי לבחור עיר"
          onClick={() => setCity(canon === "*" ? "" : ALL_IL)}>🗺️ כל הארץ</button>
      </div>
      <datalist id="lh-map-cities"><option value={ALL_IL} />{(cities || []).map((c) => <option key={c} value={c} />)}</datalist>
      {months && (
        <div className="months" style={{ marginTop: 10 }}>
          {years.map((y) => (
            <button key={y} className={"mchip" + (yr === y && !is2012 ? " on" : "")} aria-pressed={yr === y && !is2012}
              title={y === "2012" ? "נתוני הקווים של 2012, על המסלול של אז" : undefined}
              onClick={() => { setYr(y); if(y === "2012") setMode("lines"); const ms = months.filter((m) => m.startsWith(y)); if (!ms.includes(mon) && mon !== "Y:" + y) setMon(ms[ms.length - 1]); }}>{y === "2012" ? "2012 · קווים" : y}</button>
          ))}
        </div>
      )}
      {/* צילום התחנות של 2012 — רק במצב "תחנות" (שלמה 28.10) */}
      {months && mode === "stops" && <div className="months" style={{borderTop:"1px solid #e2e8f0",paddingTop:10}}>
          <span className="pdesc">צילום תחנות ממקור נוסף:</span>
          <button className={"mchip" + (is2012 ? " on" : "")} aria-pressed={is2012} title="כל התחנות שהיו בעיר (או בכל הארץ) ברישום התחנות של משרד התחבורה מ-2012"
            onClick={() => { setYr("2012"); setMon("snapshot2012"); setMode("stops"); setKinds(new Set()); }}>2012 · תחנות OpenStreetMap</button>
        </div>}
      {months && yr && !is2012 && (
        <div className="months">
          <button className={"mchip" + (mon === "Y:" + yr ? " on" : "")} aria-pressed={mon === "Y:" + yr} title={"כל השינויים של שנת " + yr + " יחד"} onClick={() => setMon("Y:" + yr)}>🗓️ כל {yr}</button>
          {months.filter((m) => m.startsWith(yr)).slice().reverse().map((m) => (
            <button key={m} className={"mchip" + (mon === m ? " on" : "")} aria-pressed={mon === m} onClick={() => setMon(m)}
              title={DETAILED_EARLY.has(m) ? "החודש היחיד לפני 2015 עם קובץ מלא מארכיון משרד התחבורה — מסלולים ותחנות מפורטים, לא מצילומי האתר" : undefined}>
              {m.split("-").reverse().join(".")}{DETAILED_EARLY.has(m) ? " · מסלול מפורט" : ""}</button>
          ))}
        </div>
      )}
      <div className="tabs" role="tablist" aria-label="מה להציג על המפה">
        <button role="tab" aria-selected={mode === "stops"} className={"tab" + (mode === "stops" ? " on" : "")} onClick={() => setMode("stops")}>🚏 תחנות שהשתנו</button>
        <button role="tab" aria-selected={mode === "lines"} className={"tab" + (mode === "lines" ? " on" : "")} onClick={() => setMode("lines")}>🚌 קווים שהשתנו</button>
      </div>
      {canon && mon && !is2012 && (
        <div className="months">
          {mode === "stops"
            ? STOP_KIND_LIST.filter((k) => stopKindCounts[k]).map((k) => (
              <button key={k} className={"mchip" + (kinds.has(k) ? " on" : "")} aria-pressed={kinds.has(k)} onClick={() => toggleKind(k)}>
                <i className="katdot" style={{ background: SKINDS[k].color, display: "inline-block", width: 9, height: 9, borderRadius: "50%", marginInlineEnd: 5 }} />{SKINDS[k].label} <b>{stopKindCounts[k]}</b></button>))
            : Object.keys(lineKindCounts).sort((a, b) => lineKindCounts[b] - lineKindCounts[a]).map((k) => (
              <button key={k} className={"mchip" + (kinds.has(k) ? " on" : "")} aria-pressed={kinds.has(k)} onClick={() => toggleKind(k)}>
                <i className="katdot" style={{ background: catColor(k), display: "inline-block", width: 9, height: 9, borderRadius: "50%", marginInlineEnd: 5 }} />{(KINDS[k] || { label: k }).label} <b>{lineKindCounts[k]}</b></button>))}
          {kinds.size > 0 && <button className="katclear" onClick={() => setKinds(new Set())}>✖ נקה</button>}
        </div>
      )}
      <div className="mapstat">
        {is2012 ? (!canon ? "בחרו עיר כדי להתחיל" : !snap12 ? "טוען…" : <>{stopGroups.length.toLocaleString()} תחנות {inPlace} ברישום 2012 · לחיצה על תחנה: שם, מק״ט וכתובת של אז · מקור: <a href="https://www.openstreetmap.org/changeset/14265835" target="_blank" rel="noopener" title="רישום התחנות של משרד התחבורה מיוני 2012 (GTFS), כפי שיובא ל-OpenStreetMap: 32,987 תחנות בארץ, רישיון ODbL">OpenStreetMap</a></>)
          : !canon ? "בחרו עיר כדי להתחיל" : !mon ? "בחרו חודש" : (mode === "stops" ? (stopChs === null ? "טוען…" : stopGroups.length ? `${stopGroups.length.toLocaleString()} תחנות ${inPlace} השתנו ${bP(mon)}` : `אין תחנות ${inPlace} שהשתנו ${bP(mon)}`)
          : (lineChs === null || prog ? "טוען…" : canon === "*"
            ? `כל הארץ: ${lineGroups.length.toLocaleString()} קווים השתנו ${bP(mon)} — על המפה רק הם, לא כל קווי הארץ` + (lineGroups.length ? (kinds.size ? ` · ${shownLines.length} מובלטים` : " — סמנו סוגי שינוי כדי להבליט אותם") : "") + (noRoute && shownLines.length ? ` · ל-${noRoute} מהמסומנים אין שרטוט מאותו זמן` : "")
            : `${cityLines.filter((l) => routes[l.rd + "@" + mon]).length} קווים של ${canon} היו בתוקף ${isYear(mon) ? "בסוף " + mon.slice(2) : bP(mon)}` + (lineGroups.length ? (isYear(mon) ? ` · ${lineGroups.length} קווים השתנו באותה שנה` : ` · ${lineGroups.length} מהם השתנו באותו חודש`) + (kinds.size ? ` · ${shownLines.length} מובלטים` : " — סמנו סוגי שינוי כדי לצבוע אותם") : "") + (noRoute && shownLines.length ? ` · ל-${noRoute} מהמסומנים אין שרטוט מאותו זמן` : "")))}
      </div>
      <div className="mapwrap">
        <div className="citymap" ref={mapRef} role="application" aria-label="מפת השינויים לפי מקום ותקופה" />
        {prog && <div className="mapload" role="status" aria-live="polite">
          <div className="mapprog-t">{mode === "stops" ? `מצייר ${prog.total.toLocaleString()} תחנות…` : `טוען את קווי ${place} כפי שהיו ${bP(mon)}…`} {prog.done.toLocaleString()}/{prog.total.toLocaleString()}</div>
          <div className="mapprog-s">{mode === "stops" ? "המפה תוצג כשכל התחנות יהיו מוכנות" : "המפה תוצג כשכל הקווים יהיו מוכנים"}</div>
          <div className="mapprog-b"><i style={{ width: Math.round(prog.done / prog.total * 100) + "%" }} /></div>
        </div>}
      </div>
    </div>
  );
}
