/* קו באג — אפליקציה ראשית + מפה (Leaflet) */

const RED = "#d8392f";
const DETOUR = "#ef8a17"; // כתום — אזור הסטייה
const ROUTE = "#2563eb";  // כחול — מסלול הקו הנבדק (הקו עם התקלה, תואם ל-legend)
const ALT = "#1f9d57";    // ירוק — מסלול קו-הייחוס (הקו שמולו משווים)

// סוגי מפה (רקע). בסיסי = נקי ואפור (הקווים בולטים); מפורט = OSM עם שמות בעברית בכל הזומים.
const BASEMAPS = {
  clean: {
    label: "בסיסי",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    opts: { maxZoom: 19, subdomains: "abcd" },
  },
  detailed: {
    label: "מפורט",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    opts: { maxZoom: 19 },
  },
};

// מצמיד נקודה (תחנה) לאינדקס הקרוב ביותר על מסלול ה-shape
function nearestShapeIdx(shape, lat, lng, from) {
  let best = from || 0, bestD = Infinity;
  for (let i = best; i < shape.length; i++) {
    const dy = shape[i][0] - lat, dx = shape[i][1] - lng;
    const d = dy * dy + dx * dx;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function polyMid(poly) {
  if (!poly || !poly.length) return null;
  return poly[Math.floor(poly.length / 2)];
}

// מרחק (ק"מ) בין שתי נקודות [lat,lng]
function hav2(a, b) {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
  const la1 = toRad(a[0]), la2 = toRad(b[0]);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
// מרחק נקודה מהפוליגון (מינימום מול הקודקודים)
function distToPoly(pt, poly) {
  let m = Infinity;
  for (const q of poly) { const d = hav2(pt, q); if (d < m) m = d; }
  return m;
}
// כיוון נסיעה (מעלות, מצפן) בין שתי נקודות [lat,lng]
function bearingDeg(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const φ1 = toRad(a[0]), φ2 = toRad(b[0]), Δλ = toRad(b[1] - a[1]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
// מתאר את התמרון של מקטע מסלול במילים: ימינה/שמאלה + מטרים.
// מחזיר משפט קצר כמו "פונה ימינה ~40מ' ואז שמאלה חזרה", או "" אם אין תמרון ברור.
function describeManeuver(poly) {
  if (!poly || poly.length < 3) return "";
  // מקטעים עם כיוון ואורך, מדלגים על קטעים זעירים (רעש)
  const segs = [];
  for (let i = 1; i < poly.length; i++) {
    const d = hav2(poly[i - 1], poly[i]) * 1000; // מטרים
    if (d < 4) continue;
    segs.push({ b: bearingDeg(poly[i - 1], poly[i]), d });
  }
  if (segs.length < 2) return "";
  // זיהוי פניות חדות (>35°) + המרחק שנוסע לפני כל פנייה
  const turns = [];
  let run = segs[0].d;
  for (let i = 1; i < segs.length; i++) {
    const delta = ((segs[i].b - segs[i - 1].b + 540) % 360) - 180;
    if (Math.abs(delta) > 35) {
      turns.push({ dir: delta > 0 ? "ימינה" : "שמאלה", before: Math.round(run) });
      run = 0;
    }
    run += segs[i].d;
  }
  if (!turns.length) return "";
  const m = (x) => `${Math.max(10, Math.round(x / 5) * 5)} מ'`;
  if (turns.length === 1) {
    return `הקו פונה ${turns[0].dir} במקום להמשיך ישר`;
  }
  if (turns.length === 2) {
    return `הקו פונה ${turns[0].dir}, נוסע ~${m(turns[1].before)}, ואז ${turns[1].dir} חזרה`;
  }
  return `הקו עושה ${turns.length} פניות חדות במקום לעבור ישר`;
}
// מאתר "לולאה" (כיכר) בתוך פוליגון: נקודה שחוזרת קרוב (≤thr ק"מ) לנקודה קודמת
// אחרי קשת באורך ≥minArc. מחזיר את טווח הלולאה ההדוק ביותר, או null.
function findLoop(poly, thr, minArc) {
  if (!poly || poly.length < 4) return null;
  const cum = [0];
  for (let k = 1; k < poly.length; k++) cum[k] = cum[k - 1] + hav2(poly[k - 1], poly[k]);
  let best = null;
  for (let i = 0; i < poly.length; i++) {
    for (let j = i + 2; j < poly.length; j++) {
      if (cum[j] - cum[i] < minArc) continue;
      if (hav2(poly[i], poly[j]) <= thr) {
        const arc = cum[j] - cum[i];
        if (!best || arc < best.arc) best = { i, j, arc };
      }
    }
  }
  return best;
}

// גוזם את הקידומת והסיומת המשותפות בין polyA ל-polyB, ומחזיר את הרצף הרציף
// של polyA שבו הוא נפרד (>tol ק"מ) מ-polyB — מנקודה ראשונה שנפרדת עד אחרונה.
// מחזיר null אם המסלולים חופפים לכל אורכם (אין היפרדות אמיתית).
function trimCommonEnds(polyA, polyB, tol) {
  if (!polyA || polyA.length < 2 || !polyB || polyB.length < 2) return null;
  let first = -1, last = -1;
  for (let i = 0; i < polyA.length; i++) {
    if (distToPoly(polyA[i], polyB) > tol) { if (first < 0) first = i; last = i; }
  }
  if (first < 0) return null; // הכל חופף
  const lo = Math.max(0, first - 1), hi = Math.min(polyA.length - 1, last + 1);
  if (hi - lo < 1) return null;
  return polyA.slice(lo, hi + 1);
}

function divergentRuns(polyA, polyB, tol) {
  if (!polyA || polyA.length < 2 || !polyB || polyB.length < 2) return [];
  const far = polyA.map((p) => distToPoly(p, polyB) > tol);
  // איחוד פערים קטנים (עד 2 נקודות קרובות בתוך רצף רחוק)
  const runs = [];
  let i = 0;
  while (i < far.length) {
    if (!far[i]) { i++; continue; }
    let j = i;
    let gap = 0;
    let last = i;
    for (let k = i; k < far.length; k++) {
      if (far[k]) { last = k; gap = 0; }
      else { gap++; if (gap > 2) break; }
    }
    j = last;
    runs.push([Math.max(0, i - 1), Math.min(polyA.length - 1, j + 1)]);
    i = j + 1;
  }
  // סינון רצפים זעירים (רעש): פחות מ-30 מ' אורך
  const out = [];
  for (const [lo, hi] of runs) {
    const slice = polyA.slice(lo, hi + 1);
    let len = 0;
    for (let k = 1; k < slice.length; k++) len += hav2(slice[k - 1], slice[k]);
    if (len >= 0.03) out.push(slice);
  }
  return out;
}

function KavBug() {
  const D = window.KavBugData;
  const [query, setQuery] = React.useState("");
  const [cityName, setCityName] = React.useState("באר שבע");
  const [activeIdx, setActiveIdx] = React.useState(null);
  const [panelWidth, setPanelWidth] = React.useState(396);
  const draggingRef = React.useRef(false);
  const [showLabels, setShowLabels] = React.useState(false);
  const [basemap, setBasemap] = React.useState("clean");
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [infoOpen, setInfoOpen] = React.useState(false);

  // מצב "דווח על תקלה"
  const [reportMode, setReportMode] = React.useState(false);
  const [reportLineNum, setReportLineNum] = React.useState("");
  const [reportVariant, setReportVariant] = React.useState(0);
  const [markFrom, setMarkFrom] = React.useState(null);
  const [markTo, setMarkTo] = React.useState(null);
  const [reportText, setReportText] = React.useState("");
  const [reportAnalysis, setReportAnalysis] = React.useState({ status: "idle" });
  const [job, setJob] = React.useState(null);
  const [dataVersion, setDataVersion] = React.useState(0);
  const workerRef = React.useRef(null);
  const minExcess = 0.05;

  const processFile = async (file, bbox, name) => {
    setJob({ status: "running", pct: 0, phase: "קורא את הקובץ" });
    if (workerRef.current) workerRef.current.terminate();
    const worker = new Worker("kavbug/gtfs-worker.js");
    workerRef.current = worker;
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") {
        setJob((j) => ({ ...j, status: "running", pct: m.pct, phase: m.phase }));
      } else if (m.type === "done") {
        D.addCity(m.cityName, m.city);
        worker.terminate();
        // שלב אחרון בהעלאה: ניתוח האתר + בדיקת AI לכל תקלה, עם התקדמות בסרגל.
        const runKey = m.cityName + "#" + "upload";
        const analyzed = D.analyzeCity(m.cityName, { minExcess });
        const flaggedN = analyzed.lines.filter((l) => l.redundantCount > 0 && l.worst && l.worst.diag).length;
        const finish = () => {
          reviewedKeyRef.current = m.cityName + "#" + (dataVersion + 1);
          setJob({ status: "done" });
          setUploadOpen(false);
          setActiveIdx(null);
          setCityName(m.cityName);
          setDataVersion((v) => v + 1);
        };
        if (flaggedN > 0 && window.aiAvailable && window.aiAvailable()) {
          setJob({ status: "running", pct: 0, phase: "בדיקת AI לתקלות (0/" + flaggedN + ")" });
          runAIReview(analyzed, runKey, (done, total) => {
            setJob({ status: "running", pct: total ? done / total : 1, phase: "בדיקת AI לתקלות (" + done + "/" + total + ")" });
          }).then(finish);
        } else {
          finish();
        }
      } else if (m.type === "error") {
        setJob({ status: "error", message: m.message });
        worker.terminate();
      }
    };
    worker.onerror = (err) => setJob({ status: "error", message: "שגיאת עיבוד: " + err.message });
    const buffer = await file.arrayBuffer();
    worker.postMessage({ buffer, bbox, cityName: name, minStops: 3 }, [buffer]);
  };

  const city = React.useMemo(
    () => (cityName ? D.analyzeCity(cityName, { minExcess }) : null),
    [cityName, dataVersion, minExcess]
  );

  // ---- בדיקה-לבדיקה אוטומטית ע"י AI ----
  // אחרי שהאתר מסיים לזהות תקלות, ה-AI עובר על כל אחת (במקביל מוגבל), משווה את
  // הקואורדינטות מול כמה קווים, ומכריע אמיתי / רעש / כיסוי. תוצאות נשמרות לפי
  // מפתח קו, ומשמשות לסינון הרשימה (רעש/כיסוי מועברים לקטע מסונן).
  const [aiReview, setAiReview] = React.useState({ verdicts: {}, total: 0, done: 0, active: false });
  const reviewedKeyRef = React.useRef(null);
  const reviewCancelRef = React.useRef(null);

  // סקירת AI על כל התקלות של עיר נתונה. onProgress(done,total) לעדכון סרגל.
  // מחזיר Promise שמסתיים כשכל הבדיקות הסתיימו, עם מפת ההכרעות.
  const runAIReview = React.useCallback((cityObj, runKey, onProgress) => {
    const keyOf = (l) => l.number + "|" + l.name;
    const flagged = cityObj.lines.filter((l) => l.redundantCount > 0 && l.worst && l.worst.diag);
    if (reviewCancelRef.current) reviewCancelRef.current.cancelled = true;
    const token = { cancelled: false };
    reviewCancelRef.current = token;
    if (!flagged.length || !(window.aiAvailable && window.aiAvailable())) {
      setAiReview({ verdicts: {}, total: 0, done: 0, active: false });
      return Promise.resolve({});
    }
    const verdicts = {};
    flagged.forEach((l) => { verdicts[keyOf(l)] = { status: "loading" }; });
    setAiReview({ verdicts: { ...verdicts }, total: flagged.length, done: 0, active: true });
    if (onProgress) onProgress(0, flagged.length);
    let done = 0, idx = 0;
    const LIMIT = 4;
    const worker = async () => {
      while (idx < flagged.length && !token.cancelled) {
        const l = flagged[idx++];
        try {
          const v = await window.runAIVerdict(l.worst.diag);
          verdicts[keyOf(l)] = { status: "done", verdict: v.verdict, reason: v.reason, source: v.fallback ? "quick" : "ai" };
        } catch (_e) {
          verdicts[keyOf(l)] = { status: "error", msg: "שגיאה" };
        }
        done++;
        if (!token.cancelled) {
          setAiReview({ verdicts: { ...verdicts }, total: flagged.length, done, active: done < flagged.length });
          if (onProgress) onProgress(done, flagged.length);
        }
      }
    };
    return Promise.all(Array.from({ length: Math.min(LIMIT, flagged.length) }, worker)).then(() => verdicts);
  }, []);

  // עיר שנבחרה (פריסט / בחירה) — סקירה אוטומטית אם לא נסרקה כבר במסגרת ההעלאה.
  React.useEffect(() => {
    if (!city) { setAiReview({ verdicts: {}, total: 0, done: 0, active: false }); return; }
    const runKey = cityName + "#" + dataVersion;
    if (reviewedKeyRef.current === runKey) return; // כבר נסקר (למשל בסיום ההעלאה)
    reviewedKeyRef.current = runKey;
    runAIReview(city, runKey);
  }, [city, cityName, dataVersion, runAIReview]);

  const mapRef = React.useRef(null);
  const layerRef = React.useRef(null);
  const tileRef = React.useRef(null);
  const mapEl = React.useRef(null);

  // אתחול מפה
  React.useEffect(() => {
    const map = L.map(mapEl.current, {
      zoomControl: false, attributionControl: false, preferCanvas: true,
    }).setView([31.252, 34.805], 12);
    L.control.zoom({ position: "bottomleft" }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 60);
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      map.remove();
    };
  }, []);

  // החלפת סוג מפה (רקע) — בסיסי / מפורט
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileRef.current) map.removeLayer(tileRef.current);
    const b = BASEMAPS[basemap] || BASEMAPS.clean;
    tileRef.current = L.tileLayer(b.url, b.opts);
    tileRef.current.addTo(map);
    if (tileRef.current.setZIndex) tileRef.current.setZIndex(0);
  }, [basemap]);

  // ציור — רק הקו הנבחר (הבעייתי), עם הדגשת המקטע הבעייתי
  React.useEffect(() => {
    const map = mapRef.current, grp = layerRef.current;
    if (!map || !grp || !city) return;
    grp.clearLayers();
    if (reportMode) return; // במצב דיווח — אפקט נפרד מצייר
    if (activeIdx === null) return;
    const line = city.lines[activeIdx];
    if (!line) return;

    const segPoly = (line, seg) => {
      const g = line._geom, p = g && g[seg.index];
      return p && p.length > 1 ? p : [[seg.a.lat, seg.a.lng], [seg.b.lat, seg.b.lng]];
    };

    // תוכן החלונית שנפתחת בלחיצה על קו — מזהה איזה קו זה
    const linePopup = (line) =>
      `<div class="line-pop">` +
        `<span class="ln" style="background:${line.color}">${line.number}</span>` +
        `<div class="meta"><b>${line.name}</b><span>${line.operator}</span></div>` +
      `</div>`;

    // 1) המסלול המלא של הקו הנבדק (הקו *עם התקלה*) — שכבת-הבסיס המרכזית, מצוירת
    //    *תמיד* לפי ה-shape האמיתי (GTFS) של הקו הנבדק בלבד, בצבע כחול #2563eb.
    //    אינה תלויה בשום תוצאת-חישוב של AI/עיקוף — נתיב הרישוי מוצג כקו רציף וברור
    //    בכל מקרה. אין ציור של קו-ייחוס/השוואה כלשהו (לא מצוירת שום גרסה ירוקה).
    const fullShape = line.shape && line.shape.length > 1 ? line.shape : null;
    if (fullShape) {
      const pl = L.polyline(fullShape, {
        color: ROUTE, weight: 6, opacity: 1, lineCap: "round", lineJoin: "round",
      }).addTo(grp);
      pl.bindPopup(linePopup(line), { className: "line-popup", closeButton: false, offset: [0, -2] });
    } else {
      // אין shape — קו ישר בין תחנות (עדיין הקו הנבדק בלבד, כחול)
      const poly = line.stops.map((s) => [s.lat, s.lng]);
      const pl = L.polyline(poly, {
        color: ROUTE, weight: 6, opacity: 1, lineCap: "round", lineJoin: "round",
      }).addTo(grp);
      pl.bindPopup(linePopup(line), { className: "line-popup", closeButton: false, offset: [0, -2] });
    }

    // 1.5) קו-הייחוס (הקו שמולו משווים) — מצויר בירוק #1f9d57 כקו מקווקו. הוא
    //      ה*היפוך* של הכתום: מסומן אך ורק באזור ההתפצלות — הקטע ה*קצר* שקו-הייחוס
    //      עושה בדיוק היכן שהקו הנבדק מתפצל לדרך הארוכה. (הציור עצמו מתבצע למטה,
    //      אחרי חישוב אזור ההתפצלות, כדי לחתוך את הירוק לאותו אזור.)

    // 2) חישוב אזור הסטייה (כתום) — אך ורק על גבי הגאומטריה המדויקת של הקו הנבדק
    //    עצמו (line._geom / נתיב הרישוי). אין ציור של מסלול קו-ייחוס.
    const geomRange = (ln, a, b) => {
      // משרשר את פוליגוני המקטעים [a..b-1] לכדי קו רציף מדויק לאורך הכביש
      if (ln._geom) {
        const out = [];
        for (let s = a; s < b; s++) {
          const seg = ln._geom[s];
          if (!seg || seg.length < 2) continue;
          for (const p of seg) {
            const last = out[out.length - 1];
            if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
          }
        }
        if (out.length > 1) return out;
      }
      // נפילה לאחור: קו ישר בין תחנות
      return ln.stops.slice(a, b + 1).map((s) => [s.lat, s.lng]);
    };

    // חצי-כיוון לאורך פוליגון: מניח משולשים מסובבים לפי כיוון הנסיעה (a→b)
    // במרווחים קבועים (~לפי מרחק גאוגרפי), כך שרואים בבירור לאן הקו "זורם".
    const arrowsAlong = (latlngs, color, stepKm) => {
      if (!latlngs || latlngs.length < 2) return;
      let acc = stepKm * 0.5; // החץ הראשון מופיע מוקדם
      for (let i = 1; i < latlngs.length; i++) {
        const a = latlngs[i - 1], b = latlngs[i];
        const cos = Math.cos(a[0] * Math.PI / 180);
        const dyN = b[0] - a[0], dxE = (b[1] - a[1]) * cos;
        const segKm = Math.sqrt(dyN * dyN + dxE * dxE) * 111.32;
        if (segKm < 1e-6) continue;
        acc += segKm;
        if (acc >= stepKm) {
          acc = 0;
          const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          // זווית CSS עם כיוון השעון מציר ה-x (מזרח); ציר-y במסך הפוך ל-lat.
          const rot = Math.atan2(-dyN, dxE) * 180 / Math.PI;
          L.marker(mid, {
            interactive: false, keyboard: false,
            icon: L.divIcon({
              className: "",
              iconSize: [14, 14], iconAnchor: [7, 7],
              html: `<div class="dir-arrow" style="color:${color};transform:rotate(${rot}deg)">▶</div>`,
            }),
          }).addTo(grp);
        }
      }
    };

    let detourPoly = null, altPoly = null;
    if (line.worst) {
      const from = line.worst.from, to = line.worst.to;
      const segIdx = line.worst.segIdx || [];
      const a = segIdx.length ? segIdx[0] : line.posById[from.id];
      const b = segIdx.length ? segIdx[segIdx.length - 1] + 1 : line.posById[to.id];
      // המסלול של הקו הנבדק בין שתי התחנות — מהגאומטריה המדויקת של נתוני הרישוי
      // (GTFS) שלו בלבד. *לא* מציירים את מסלול קו-הייחוס: השוואה גרפית של מסלול
      // קו אחר על גבי הקו הנבדק יוצרת "קווים מרחפים" מטעים. הניתוח המתמטי (יחס/
      // הפרש ק"מ) נשאר כטקסט בדו"ח בלבד — המפה נאמנה אך ורק לנתיב הרישוי של הקו.
      detourPoly = geomRange(line, a, b);
    }

    // אזור ההתפצלות: תת-הקטע של מסלול הנבדק שבו הוא *מתרחק* מקו-הייחוס (הירוק)
    // ביותר מ-thrKm — כלומר מהנקודה שבה מתחילה ההתפצלות מהקו האחר ועד החזרה אליו.
    const divergenceRun = (testedPoly, refPoly, thrKm) => {
      if (!testedPoly || testedPoly.length < 2 || !refPoly || refPoly.length < 2) return null;
      const distToRefKm = (pt) => {
        let best = Infinity;
        for (const r of refPoly) {
          const cos = Math.cos(pt[0] * Math.PI / 180);
          const dy = r[0] - pt[0], dx = (r[1] - pt[1]) * cos;
          const d = Math.sqrt(dy * dy + dx * dx) * 111.32;
          if (d < best) best = d;
        }
        return best;
      };
      let lo = -1, hi = -1;
      for (let i = 0; i < testedPoly.length; i++) {
        if (distToRefKm(testedPoly[i]) > thrKm) { if (lo === -1) lo = i; hi = i; }
      }
      if (lo === -1) return null;
      // הרחבה בנקודה לכל צד כך שהכתום יתחבר חזרה לכחול בנקודת ההתפצלות/האיחוי.
      lo = Math.max(0, lo - 1); hi = Math.min(testedPoly.length - 1, hi + 1);
      return [lo, hi];
    };

    // זיהוי "נסיגה/הלוך-חזור" כללי לאורך ציר A→B: עובדים על ההיטל היחסי t של כל
    // נקודה על הציר (0=A, 1=B). מסלול תקין מתקדם מונוטונית 0→1. כל ירידה של t
    // אל *מתחת ל"חזית"* (ה-t המקסימלי שכבר הושג) ואז חזרה אליה = נסיגה מיותרת:
    // הקו חוזר על קטע-ציר שכבר כיסה. מסמן את כל קטעי-הנסיגה (כולל לולאה התחלתית
    // ליד A שבה t יורד מתחת ל-0, וכולל נסיגה ביעד B). תופס גם נסיגה *באמצע*
    // המקטע (קו 64: מתקדם ל-68%, חוזר ל-20%, ושוב מתקדם) וגם נסיגה אחרי הגעה
    // ל-B (קו 140). מחזיר מערך טווחי-פוליגון מיותרים, או null אם אין נסיגה ממשית.
    const retraceRuns = (poly, Apt, Bpt) => {
      if (!poly || poly.length < 4 || !Apt || !Bpt) return null;
      const A = [Apt.lat, Apt.lng], B = [Bpt.lat, Bpt.lng];
      const ux = B[0] - A[0], uy = (B[1] - A[1]) * Math.cos(A[0] * Math.PI / 180);
      const uu = ux * ux + uy * uy || 1e-12;
      const tOf = (p) => {
        const px = p[0] - A[0], py = (p[1] - A[1]) * Math.cos(A[0] * Math.PI / 180);
        return (px * ux + py * uy) / uu;
      };
      const segKm = (i, k) => {
        const cos = Math.cos(poly[i][0] * Math.PI / 180);
        const dy = poly[k][0] - poly[i][0], dx = (poly[k][1] - poly[i][1]) * cos;
        return Math.sqrt(dy * dy + dx * dx) * 111.32;
      };
      const t = poly.map(tOf);
      const eps = 0.03; // 3% מאורך A→B — סף-רעש לזיהוי ירידה
      const runs = [];
      let frontier = t[0], frontierIdx = 0, i = 1;
      while (i < poly.length) {
        if (t[i] >= frontier - eps) {
          if (t[i] > frontier) { frontier = t[i]; }
          frontierIdx = i; i++;
        } else {
          // נסיגה: מהחזית (frontierIdx) דרך הירידה עד החזרה אל רמת-החזית
          const start = frontierIdx;
          let j = i;
          while (j < poly.length && t[j] < frontier - eps) j++;
          const end = Math.min(j, poly.length - 1);
          runs.push([start, end]);
          i = j; frontierIdx = end;
        }
      }
      if (!runs.length) return null;
      // איחוד טווחים חופפים/צמודים
      runs.sort((u, v) => u[0] - v[0]);
      const merged = [runs[0].slice()];
      for (let k = 1; k < runs.length; k++) {
        const last = merged[merged.length - 1];
        if (runs[k][0] <= last[1] + 1) last[1] = Math.max(last[1], runs[k][1]);
        else merged.push(runs[k].slice());
      }
      // רק אם סך-הנסיגה משמעותי (≥120מ' מצטבר) — אחרת זה רעש קטן (findLoop יטפל)
      let totalKm = 0;
      for (const r of merged) for (let s = r[0]; s < r[1]; s++) totalKm += segKm(s, s + 1);
      if (totalKm < 0.12) return null;
      return merged.map(r => poly.slice(r[0], r[1] + 1));
    };

    // צביעת אזור הסטייה — אך ורק על גבי הגאומטריה של הקו הנבדק עצמו (נתיב הרישוי).
    // הכתום מסומן *רק מהנקודה שבה הקו הנבדק מתפצל מקו-הייחוס הירוק* ועד שהוא חוזר
    // אליו — לא לאורך כל המקטע. (פרסה = כל ה-U; אם אין גאומטריית ייחוס — נופלים
    // לזיהוי לולאה.)
    let detourRuns = detourPoly ? [detourPoly] : [];
    const wType0 = line.worst ? line.worst.type : "detour";
    const refG = line.worst && line.worst.refGeom;
    let divRun = null; // [lo,hi] אינדקסים על detourPoly של אזור ההתפצלות
    if (wType0 === "spur") {
      detourRuns = detourPoly ? [detourPoly] : [];
    } else if (detourPoly && refG && refG.length > 1) {
      divRun = divergenceRun(detourPoly, refG, 0.035);
      if (divRun) {
        detourRuns = [detourPoly.slice(divRun[0], divRun[1] + 1)];
      } else {
        // אין סטייה אנכית — ייתכן נסיגה/הלוך-חזור קולינארי (הקו חוזר על אותו כביש)
        const oab = retraceRuns(detourPoly, line.worst.from, line.worst.to);
        if (oab) {
          detourRuns = oab;
        } else {
          const loop = findLoop(detourPoly, 0.045, 0.08);
          detourRuns = loop ? [detourPoly.slice(loop.i, loop.j + 1)] : [detourPoly];
        }
      }
    } else {
      const oab = detourPoly ? retraceRuns(detourPoly, line.worst.from, line.worst.to) : null;
      if (oab) {
        detourRuns = oab;
      } else {
        const loop = detourPoly ? findLoop(detourPoly, 0.045, 0.08) : null;
        if (loop) detourRuns = [detourPoly.slice(loop.i, loop.j + 1)];
      }
    }

    // ציור הקו הירוק (קו-הייחוס) — לאורך הכביש האמיתי שלו בלבד. refG הוא כבר
    // גאומטריית-הכביש (_geom/shapes.txt) של קו-הייחוס בין אותן שתי תחנות, לכן
    // מציירים אותו *כפי שהוא* — בלי מחברים ישרים אל המסלול הכחול (אותם מחברים הם
    // שגרמו לקו "לרחף" ולחצות בין בניינים). אם אין גאומטריית-כביש אמיתית, refG
    // יהיה null (נקבע ב-data.js) — ואז פשוט לא מציירים ירוק, עדיף מאשר קו מרחף.
    // חיתוך הירוק לאזור-ההתפצלות בלבד — סימטרי לכתום. refG מכיל את כל מסלול
    // קו-הייחוס בין שתי תחנות-הקצה, כולל "רגל" משותפת ארוכה שרצה לצד הקו הנבדק
    // *לפני* נקודת הפיצול — מה שגרם לירוק "להתחיל הרבה לפני". כמו שהכתום נחתך
    // לקטע שמתרחק מהירוק, כך הירוק נחתך לקטע שמתרחק מהכתום: שומרים רק את החלק
    // שבו הירוק נפרד בפועל מהקו הנבדק, ומגיעים בדיוק לנקודת ההתפצלות.
    let refDraw = refG;
    if (refG && refG.length > 1 && detourPoly && detourPoly.length > 1) {
      const gRun = divergenceRun(refG, detourPoly, 0.035);
      if (gRun) refDraw = refG.slice(gRun[0], gRun[1] + 1);
    }

    let labelMid = null;
    const wType = line.worst ? line.worst.type : "detour";
    const orangeLbl = wType === "spur" ? "פרסה מיותרת" : wType === "loop" ? "סטייה קצרה מהנתיב" : "עיקוף מיותר";
    // תיאור התמרון (ימינה/שמאלה + מטרים) מתוך גאומטריית המסלול
    const maneuver = describeManeuver(detourPoly);
    const manHtml = maneuver ? `<br><span class="man">↪ ${maneuver}</span>` : "";
    detourRuns.forEach((seg) => {
      if (!seg || seg.length < 2) return;
      if (!labelMid) labelMid = seg[Math.floor(seg.length / 2)];
      L.polyline(seg, {
        color: DETOUR, weight: 9, opacity: 1, lineCap: "round", lineJoin: "round",
      }).addTo(grp).bindTooltip(
        `${orangeLbl} · <span class="km">${fmt(line.worst.km)}</span> ק"מ${manHtml}`,
        { className: "seg-tip", sticky: true }
      );
      arrowsAlong(seg, "#7a3b00", 0.13); // חצי כיוון חומים-כהים על הכתום (ניגודיות)
    });

    // הירוק (קו-הייחוס) מצויר *אחרי* הכתום — שכבה עליונה. כך הוא נשאר רציף ואינו
    // נקטע ע"י הכתום שמעליו. מותר לו להסתיר את הכחול היכן שהם חופפים (קו-הייחוס
    // הוא הנתיב התקין שאותו רוצים להבליט). הכתום שמתחתיו עדיין מבליט את הקטע
    // המיותר בקצוות, שם הירוק אינו עובר.
    if (refDraw && refDraw.length > 1) {
      L.polyline(refDraw, {
        color: ALT, weight: 6, opacity: 0.95, dashArray: "2 9",
        lineCap: "round", lineJoin: "round",
      }).addTo(grp).bindTooltip(
        `מסלול הקו להשוואה · קו ${line.worst.refNumber} · <span class="km">${fmt(line.worst.refKm)}</span> ק"מ`,
        { className: "seg-tip", sticky: true }
      );
    }

    // 3) תחנות — נקודות לבנות אחידות. כשהטוגל "שמות תחנות" דלוק, כל שם מודבק
    //    *בדיוק* מעל הנקודה שלו דרך divIcon מעוגן (iconAnchor 0,0 + מירכוז ב-CSS),
    //    כמו תווית-הפער. לא משתמשים ב-tooltip קבוע של Leaflet — מיקומו לא-אמין
    //    עם שמות עבריים ארוכים (הוא "ברח" שמאלה מהנקודה). כבוי — שם מופיע בריחוף.
    line.stops.forEach((s) => {
      L.circleMarker([s.lat, s.lng], {
        radius: 4.5, color: ROUTE, fillColor: "#fff",
        fillOpacity: 1, weight: 3,
      }).addTo(grp).bindTooltip(s.name, {
        className: "stop-label", direction: "top", offset: [0, -6],
      });
      if (showLabels) {
        L.marker([s.lat, s.lng], {
          interactive: false, keyboard: false,
          icon: L.divIcon({
            className: "stop-pin",
            iconSize: [0, 0], iconAnchor: [0, 0],
            html: `<div class="stop-name">${s.name}</div>`,
          }),
        }).addTo(grp);
      }
    });

    // 4) תווית על אמצע המקטע הבעייתי — מעוגנת בדיוק: בסיס התווית מרכז-אופקי
    //    מעל נקודת ה-lat/lng (iconAnchor 0,0 + מיקום אבסולוטי ב-CSS), בלי סטייה.
    if (labelMid) {
      const mid = labelMid;
      L.marker(mid, {
        icon: L.divIcon({
          className: "gap-pin",
          iconSize: [0, 0], iconAnchor: [0, 0],
          html: `<div class="gap-label detour"><span class="km">${fmt(line.worst.km)}</span> ק"מ עיקוף</div>`,
        }),
      }).addTo(grp);
    }
  }, [city, activeIdx, showLabels, reportMode]);

  // ציור מצב "דווח על תקלה": כל המסלול + כל התחנות כסמנים לחיצים, והדגשת הקטע המסומן
  React.useEffect(() => {
    const map = mapRef.current, grp = layerRef.current;
    if (!map || !grp || !city || !reportMode) return;
    grp.clearLayers();
    const variants = city.lines.filter((l) => String(l.number) === String(reportLineNum));
    const line = variants[reportVariant];
    if (!line) return;
    const ROUTE = "#2563eb", MARK = "#d8392f", VTX = "#1d4ed8";
    // נקודות הקואורדינטה של המסלול (shape). אם אין shape — נופלים לתחנות.
    const verts = line.shape && line.shape.length > 1 ? line.shape : line.stops.map((s) => [s.lat, s.lng]);
    // המסלול המלא
    L.polyline(verts, { color: ROUTE, weight: 5, opacity: 0.55, lineCap: "round", lineJoin: "round" }).addTo(grp);
    // טווח מסומן לפי אינדקסי-קואורדינטה
    const lo = markFrom != null && markTo != null ? Math.min(markFrom, markTo) : markFrom;
    const hi = markFrom != null && markTo != null ? Math.max(markFrom, markTo) : markFrom;
    if (lo != null && hi != null && hi > lo) {
      const seg = verts.slice(lo, hi + 1);
      if (seg.length > 1) L.polyline(seg, { color: MARK, weight: 9, opacity: 1, lineCap: "round", lineJoin: "round" }).addTo(grp);
    }
    const pick = (i) => {
      if (markFrom == null) { setMarkFrom(i); }
      else if (markTo == null) { setMarkTo(i); }
      else { setMarkFrom(i); setMarkTo(null); }
    };
    // הצמדת אינדקס-קואורדינטה הקרוב לתחנה — לציור התחנות כסמני-עוגן
    const nearestVtx = (st) => { let bi = 0, bd = Infinity; for (let i = 0; i < verts.length; i++) { const dy = verts[i][0] - st.lat, dx = verts[i][1] - st.lng; const d = dy * dy + dx * dx; if (d < bd) { bd = d; bi = i; } } return bi; };
    // נקודות הקואורדינטה — כל נקודה לחיצה (יחידת הסימון). דגימה כדי לא להציף את המפה
    // בזום נמוך: צעד מותאם למספר הנקודות, אבל תמיד מציג את העוגנים שנבחרו.
    const N = verts.length;
    const step = N > 600 ? 3 : N > 300 ? 2 : 1;
    for (let i = 0; i < N; i++) {
      const isAnchor = i === markFrom || i === markTo;
      if (i % step !== 0 && !isAnchor) continue;
      const inSeg = lo != null && hi != null && i >= lo && i <= hi;
      const dot = L.circleMarker(verts[i], {
        radius: isAnchor ? 7 : inSeg ? 4.5 : 3.5,
        color: isAnchor ? MARK : inSeg ? MARK : VTX,
        weight: isAnchor ? 3 : 1.5,
        fillColor: isAnchor ? MARK : inSeg ? MARK : "#fff",
        fillOpacity: 1,
      }).addTo(grp);
      dot.bindTooltip(`נקודה ${i + 1}/${N}<br>${verts[i][0].toFixed(5)}, ${verts[i][1].toFixed(5)}`, { direction: "top", offset: [0, -4] });
      dot.on("click", () => pick(i));
    }
    // תחנות — סמנים גדולים יותר עם שם, לחיצה מסמנת את נקודת-הקואורדינטה הקרובה
    line.stops.forEach((s, si) => {
      const vi = nearestVtx(s);
      const inSeg = lo != null && hi != null && vi >= lo && vi <= hi;
      const m = L.circleMarker([s.lat, s.lng], {
        radius: 6.5, color: inSeg ? MARK : ROUTE, weight: 3,
        fillColor: inSeg ? MARK : "#fff", fillOpacity: 1,
      }).addTo(grp);
      m.bindTooltip(`🚏 ${si + 1}. ${s.name}`, { direction: "top", offset: [0, -5] });
      m.on("click", () => pick(vi));
    });
    // לחיצה בכל מקום על/ליד המסלול → נצמדת לנקודת-הקואורדינטה הקרובה ביותר.
    // זה הופך את הסימון לאמין — אין צורך לפגוע בדיוק בנקודה הקטנה.
    const onMapClick = (e) => {
      let bi = -1, bd = Infinity;
      for (let i = 0; i < verts.length; i++) {
        const d = map.distance(e.latlng, L.latLng(verts[i][0], verts[i][1]));
        if (d < bd) { bd = d; bi = i; }
      }
      if (bi >= 0 && bd <= 150) pick(bi);
    };
    map.on("click", onMapClick);
    return () => { map.off("click", onMapClick); };
  }, [city, reportMode, reportLineNum, reportVariant, markFrom, markTo]);

  // מסגור — ממקד את הקו הנבחר
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !city) return;
    // גודל-מיכל-המפה עשוי להשתנות כשנכנסים/יוצאים ממצב דיווח או בוחרים קו (הפאנל
    // משנה פריסה, בעיקר במובייל). בלי עדכון הגודל, fitBounds מחשב לפי מימדים
    // ישנים וקופץ לאזור ריק — והמפה "נעלמת". מסנכרנים את הגודל לפני המסגור, וגם
    // אחרי פריים — שכן שינוי-הפריסה עשוי להסתיים רק אחרי הרינדור (פאנל נפתח).
    const frame = () => {
      map.invalidateSize();
      if (reportMode) {
        const variants = city.lines.filter((l) => String(l.number) === String(reportLineNum));
        const ln = variants[reportVariant];
        if (ln && ln.stops.length) map.fitBounds(L.latLngBounds(ln.stops.map((s) => [s.lat, s.lng])), { padding: [70, 70], maxZoom: 15 });
        return;
      }
      const ln = activeIdx !== null ? city.lines[activeIdx] : null;
      if (ln) map.fitBounds(L.latLngBounds(ln.stops.map((s) => [s.lat, s.lng])), { padding: [80, 80], maxZoom: 14 });
      else map.setView([city.center.lat, city.center.lng], city.zoom || 12);
    };
    frame();
    const raf = requestAnimationFrame(frame);
    const t = setTimeout(frame, 260);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, [city, activeIdx, reportMode, reportLineNum, reportVariant]);

  // בעת מעבר עיר/נתונים — בוחר אוטומטית את הקו הבעייתי ביותר
  React.useEffect(() => {
    if (!city) { setActiveIdx(null); return; }
    const idx = city.lines.findIndex((l) => l.redundantCount > 0);
    setActiveIdx(idx >= 0 ? idx : null);
  }, [city]);

  const selectCity = (name) => { setCityName(name); setActiveIdx(null); setQuery(""); };

  // ── פאנל צד בעל רוחב משתנה (Resizable Split) ──
  // הפאנל מעוגן לימין (RTL); רוחבו = רוחב-החלון פחות מיקום-העכבר האופקי.
  // גבולות: מינימום 350px (לא נעלם) ומקסימום 65vw (המפה תמיד גלויה).
  const startResize = (e) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.classList.add("col-resizing");
    const clampW = (x) => Math.max(350, Math.min(window.innerWidth * 0.65, window.innerWidth - x));
    const onMove = (ev) => {
      if (!draggingRef.current) return;
      const x = ev.touches ? ev.touches[0].clientX : ev.clientX;
      setPanelWidth(clampW(x));
      if (mapRef.current) mapRef.current.invalidateSize();
    };
    const onUp = () => {
      draggingRef.current = false;
      document.body.classList.remove("col-resizing");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
      if (mapRef.current) mapRef.current.invalidateSize();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
  };

  // ייצוא נתוני העיר המעובדת לקובץ JSON קטן — לבדיקה/דיבאג
  const exportCity = () => {
    const c = D.CITIES[cityName];
    if (!c) return;
    const out = {
      name: cityName, center: c.center, zoom: c.zoom,
      lines: c.lines.map((l) => ({
        number: l.number, name: l.name, operator: l.operator,
        stops: l.stops.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng })),
        shape: l.shape || null,
      })),
    };
    const blob = new Blob([JSON.stringify(out)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "kavbug-" + cityName + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  // ייצוא *ממוקד* של הקו הפעיל בלבד — לדיבאג באג גאומטרי ספציפי (כמו הירוק).
  // כולל את כל מה שדרוש כדי לשחזר את הציר על המפה: גאומטריית-הכביש לכל מקטע
  // (_geom), נתוני העיקוף (worst) עם הירוק כפי שחושב (refGeom) והאינדקסים,
  // ואת קו-הייחוס (הירוק) עם הגאומטריה שלו. קובץ קטן וממוקד — בדיוק מה שצריך
  // כדי לשלוח לי לבדיקה.
  const exportLine = () => {
    if (!city || activeIdx === null) return;
    const line = city.lines[activeIdx];
    if (!line) return;
    const w = line.worst || null;
    const refLine = (w && w.refNumber != null)
      ? city.lines.find((l) => String(l.number) === String(w.refNumber)) || null
      : null;
    const slim = (l) => l && {
      number: l.number, name: l.name, operator: l.operator,
      stops: l.stops.map((s) => ({ id: s.id, name: s.name, lat: +(+s.lat).toFixed(6), lng: +(+s.lng).toFixed(6) })),
      geom: l._geom || null,   // גאומטריית-כביש לכל מקטע — מקור הקווים על המפה
      shape: l.shape || null,
    };
    const out = {
      kind: "kavbug-line-debug", version: 1, city: cityName,
      line: slim(line),
      worst: w ? {
        type: w.type, km: w.km, refNumber: w.refNumber, refKm: w.refKm,
        from: w.from && { id: w.from.id, name: w.from.name },
        to: w.to && { id: w.to.id, name: w.to.name },
        segIdx: w.segIdx, refSegIdx: w.refSegIdx,
        refGeom: w.refGeom,    // הירוק כפי שחושב בפועל
        diag: w.diag || null,
      } : null,
      referenceLine: slim(refLine),  // קו-הייחוס (הירוק) המלא
    };
    const blob = new Blob([JSON.stringify(out)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kavbug-קו-${line.number}-${cityName}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  // ----- מצב דיווח: בניית דוח, שליחה ל-AI, וייצוא -----
  const reportLine = React.useMemo(() => {
    if (!city || !reportLineNum) return null;
    return city.lines.filter((l) => String(l.number) === String(reportLineNum))[reportVariant] || null;
  }, [city, reportLineNum, reportVariant]);

  const buildReport = () => {
    const line = reportLine;
    if (!line) return null;
    const verts = line.shape && line.shape.length > 1 ? line.shape : line.stops.map((s) => [s.lat, s.lng]);
    const lo = markFrom != null && markTo != null ? Math.min(markFrom, markTo) : markFrom;
    const hi = markFrom != null && markTo != null ? Math.max(markFrom, markTo) : markFrom;
    if (lo == null || hi == null) return null;
    // קואורדינטות המסלול בקטע המסומן (בין שתי הנקודות שנבחרו)
    const coords = verts.slice(lo, hi + 1).map((p) => [+p[0].toFixed(6), +p[1].toFixed(6)]);
    // התחנות שנקודת-הקואורדינטה הקרובה אליהן נמצאת בטווח המסומן
    const nearestVtx = (st) => { let bi = 0, bd = Infinity; for (let i = 0; i < verts.length; i++) { const dy = verts[i][0] - st.lat, dx = verts[i][1] - st.lng; const d = dy * dy + dx * dx; if (d < bd) { bd = d; bi = i; } } return bi; };
    const segStops = line.stops
      .filter((s) => { const v = nearestVtx(s); return v >= lo && v <= hi; })
      .map((s) => ({ id: s.id, name: s.name, lat: +s.lat.toFixed(6), lng: +s.lng.toFixed(6) }));
    // תחנות-קצה: הקרובות לשתי נקודות-הקצה שנבחרו
    const nearestStop = (pt) => {
      let best = null, bd = Infinity;
      line.stops.forEach((s) => { const dy = s.lat - pt[0], dx = s.lng - pt[1]; const d = dy * dy + dx * dx; if (d < bd) { bd = d; best = s; } });
      return best ? { id: best.id, name: best.name, lat: +best.lat.toFixed(6), lng: +best.lng.toFixed(6) } : null;
    };
    const fromStop = segStops[0] || nearestStop(verts[lo]);
    const toStop = segStops[segStops.length - 1] || nearestStop(verts[hi]);
    return {
      city: cityName,
      lineNumber: line.number,
      lineName: line.name,
      direction: window.dirLabel ? window.dirLabel(line.name) : line.name,
      markedFromCoord: [+verts[lo][0].toFixed(6), +verts[lo][1].toFixed(6)],
      markedToCoord: [+verts[hi][0].toFixed(6), +verts[hi][1].toFixed(6)],
      fromStop, toStop,
      stopsInSegment: segStops,
      routeCoordinates: coords,
      userExplanation: reportText.trim(),
    };
  };

  const analyzeReport = async () => {
    const rep = buildReport();
    if (!rep) {
      setReportAnalysis({ status: "error", msg: "סמנו קטע תקין לפני הניתוח" });
      return;
    }
    setReportAnalysis({ status: "loading" });
    const line = reportLine;
    // קווים אחרים בקטע — זיהוי **גאוגרפי**, לא לפי מזהי-תחנות: כל קו שהמסלול שלו
    // עובר ליד שתי נקודות-הקצה של הקטע המסומן (גם אם התחנה היא תחנה-אל-עצמה, או
    // שלקו האחר יש מזהי-תחנות שונים). זה משקף נכון את "מי עוד נוסע כאן".
    const A = rep.fromStop, B = rep.toStop;
    const R = 6371000, toRad = (d) => d * Math.PI / 180;
    const hav = (la1, lo1, la2, lo2) => {
      const dLa = toRad(la2 - la1), dLo = toRad(lo2 - lo1);
      const x = Math.sin(dLa / 2) ** 2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLo / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    };
    const passesNear = (l, pt, thresh) => {
      const sh = l.shape && l.shape.length ? l.shape : (l.stops || []).map((s) => [s.lat, s.lng]);
      for (let i = 0; i < sh.length; i++) if (hav(sh[i][0], sh[i][1], pt.lat, pt.lng) <= thresh) return true;
      return false;
    };
    const THRESH = 90;
    const others = city.lines.filter((l) => String(l.number) !== String(rep.lineNumber)
      && passesNear(l, A, THRESH) && passesNear(l, B, THRESH));
    const otherNums = [...new Set(others.map((l) => String(l.number)))];
    const refsText = otherNums.length
      ? otherNums.slice(0, 10).join(", ")
      : "(לא נמצא אף קו אחר שעובר ליד שתי נקודות-הקצה)";
    const coordsText = rep.routeCoordinates
      ? rep.routeCoordinates.map((p) => `[${p[0]},${p[1]}]`).join(" ")
      : "(אין shape)";
    // האם המנוע (האתר) כבר סימן תקלה שחופפת לקטע המסומן?
    const markedIdxs = rep.stopsInSegment.map((s) => line.posById[s.id]).filter((x) => x != null);
    const mLo = Math.min(...markedIdxs), mHi = Math.max(...markedIdxs);
    const engineIssues = (line.issues || []).filter((iss) => {
      const a = iss.from && line.posById[iss.from.id], b = iss.to && line.posById[iss.to.id];
      if (a == null || b == null) return false;
      return Math.min(a, b) <= mHi && Math.max(a, b) >= mLo; // חפיפת טווחים
    });
    const engineFlagged = engineIssues.length > 0;
    const otherCount = otherNums.length;
    // האם הקטע מחבר תחנה אל עצמה (אותו מזהה משני הקצוות)?
    const selfLoop = A.id === B.id;
    const engineFacts =
`סטטוס המנוע (האתר) על הקטע: ${engineFlagged ? "סימן תקלה (" + engineIssues.map((i) => i.type).join(", ") + ")" : "לא סימן תקלה"}.
קווים אחרים שעוברים גאוגרפית ליד שתי נקודות-הקצה של הקטע: ${otherCount > 0 ? otherNums.slice(0, 10).join(", ") : "אין"}.
${selfLoop ? "שים לב: הקטע המסומן מחבר תחנה אל עצמה (אותו מזהה תחנה בשני הקצוות) — לולאה.\n" : ""}איך המנוע עובד ומה המגבלה שלו: המנוע מזהה עיקוף **רק בהשוואת מזהי-תחנות** — הוא דורש קו אחר שעוצר ב*אותם מזהי-תחנות* בדיוק. לכן הוא מפספס מקרים שבהם: (א) קווים אחרים עוברים פיזית באותו רחוב אבל עם מזהי-תחנות שונים או בלי לעצור — המנוע לא רואה אותם כהשוואה; (ב) הקטע הוא לולאה של תחנה-אל-עצמה ואין "שתי תחנות" שונות להשוות; (ג) מסנן-הארטיפקטים פוסל בטעות לולאה אמיתית שמתקפלת על עצמה. הערה: גם אם רשומים כאן קווים אחרים שעוברים גאוגרפית, ייתכן שהמנוע לא השווה אליהם כי הם לא עוצרים באותם מזהי-תחנות.`;
    const prompt =
`אתה מנתח גאומטריית קווי תחבורה. משתמש דיווח על תקלה בקטע מסוים של קו. בדוק לפי הקואורדינטות אם הדיווח מוצדק, ואז בדוק אם המנוע האוטומטי כבר תפס אותה.

קו ${rep.lineNumber} — ${rep.direction}
קטע מדווח: "${rep.fromStop.name}" → "${rep.toStop.name}"
תחנות בקטע: ${rep.stopsInSegment.map((s) => s.name).join(" → ")}
קואורדינטות המסלול בקטע (lat,lng בסדר נסיעה):
${coordsText}
קווים אחרים שעוברים גאוגרפית ליד שתי נקודות-הקצה: ${refsText}
הסבר המשתמש: "${rep.userExplanation || "(לא צוין)"}"

${engineFacts}

שלב 1 — נתח לפי הקואורדינטות: האם הקו עושה לולאה / סיבוב / עיקוף מיותר בקטע הזה?
חשוב מאוד: אם הקואורדינטות **חוזרות לאותה נקודה** או **מתקפלות אחורה** (fold-back / לולאה), זו תקלה **אמיתית** — סיבוב מיותר שאפשר היה לחסוך בקו ישר. אסור להתייחס לתקיפול-עצמי או חזרה-לנקודה כ"רעש" או "ארטיפקט" — תקיפול גאומטרי ברור הוא תמיד עיקוף אמיתי. "רעש" שמור אך ורק לתנודות זעירות (מטרים בודדים) סביב ציר ישר, בלי חזרה לאחור. אל תשתמש במילה "GPS" בתשובה.
קבע verdict: "אמיתי" (עיקוף/לולאה/תקיפול), "רעש" (תנודה זעירה בלבד), או "כיסוי לגיטימי" (סטייה *מתונה* לשרת תחנה שיושבת ממש מחוץ למסדרון הישר). **חשוב — גודל גיאומטרי גובר:** לולאה ארוכה שמוסיפה מרחק רב (עודף ≥600 מ' או פי ≥2.2 מהדרך הישרה) היא "אמיתי" גם אם יש בה תחנות — עצם קיום תחנות בתוך לולאה עמוקה אינו מצדיק תוספת מרחק חריגה ואינו הופך אותה ל"כיסוי לגיטימי". "כיסוי לגיטימי" שמור לסטייה מתונה בלבד.

שלב 2 — רק אם verdict="אמיתי" והמנוע *לא* סימן: הסבר למה המנוע **פספס** — כפגם/מגבלה במנוע שצריך לתקן, לא כהתנהגות נכונה. נסח זאת כ"המנוע לא מסוגל לזהות כי..." (למשל: אין קו אחר שעוצר בשתי התחנות ולכן אין השוואה; או מסנן-הארטיפקטים פסל בטעות לולאה אמיתית). אל תאמר שהמנוע "צדק" שהתעלם, ואל תתאר את הלולאה כרעש. אם המנוע כן סימן, או verdict אינו "אמיתי" — engineMissReason ריק.

החזר JSON בלבד: {"verdict":"אמיתי"|"רעש"|"כיסוי לגיטימי","reason":"משפט קצר בעברית בלבד לפי הקואורדינטות (חל איסור מוחלט על מילים/תווים בערבית)","engineMissReason":"אם רלוונטי — איזו מגבלה במנוע גרמה לפספוס, אחרת ריק"}`;
    // גיבוי דטרמיניסטי לדיווח — עמיד-קריסות, *זהה בעקרון* ל-runAIVerdict הראשי:
    // כשה-AI לא זמין/מחזיר תשובה לא תקינה, מפיקים הכרעה בלי שגיאה אדומה.
    //   • אם המנוע כבר סימן את הקטע → מריצים את אותו fallbackVerdict על ה-diag
    //     של אותה תקלה (הכרעה זהה למסלול הראשי).
    //   • אחרת → הערכה גאומטרית מהקואורדינטות המסומנות: יחס אורך-מסלול/קו-אווירי
    //     + זיהוי תקיפול-אחורה (fold-back). יחס גבוה/תקיפול ⇒ "אמיתי" (המנוע
    //     פספס), אחרת "ספק" (דרושה בדיקה אנושית) — לעולם לא שגיאה.
    const reportFallback = () => {
      if (engineFlagged && engineIssues[0] && engineIssues[0].diag && window.fallbackVerdict) {
        const fv = window.fallbackVerdict(engineIssues[0].diag);
        return { verdict: fv.verdict, reason: fv.reason, engineMissReason: "", source: "quick" };
      }
      const co = rep.routeCoordinates || [];
      if (co.length >= 2) {
        let pathM = 0;
        for (let k = 1; k < co.length; k++) pathM += hav(co[k - 1][0], co[k - 1][1], co[k][0], co[k][1]);
        const crowM = hav(co[0][0], co[0][1], co[co.length - 1][0], co[co.length - 1][1]);
        // תקיפול: היטל על ציר ההתחלה→סוף יורד מתחת לחזית שכבר הושגה
        const A0 = co[0], B0 = co[co.length - 1];
        const ux = B0[0] - A0[0], uy = (B0[1] - A0[1]) * Math.cos(A0[0] * Math.PI / 180);
        const uu = ux * ux + uy * uy || 1e-12;
        const tOf = (p) => ((p[0] - A0[0]) * ux + (p[1] - A0[1]) * Math.cos(A0[0] * Math.PI / 180) * uy) / uu;
        let frontier = 0, foldM = 0;
        for (const p of co) { const t = tOf(p); if (t > frontier) frontier = t; const drop = (frontier - t) * Math.sqrt(uu) * 111320; if (drop > foldM) foldM = drop; }
        const ratio = crowM > 5 ? pathM / crowM : 1;
        const fromN = rep.fromStop ? rep.fromStop.name : "התחלה", toN = rep.toStop ? rep.toStop.name : "סוף";
        if (ratio >= 1.6 || foldM >= 200) {
          return {
            verdict: "אמיתי",
            reason: `בקטע "${fromN}" ← "${toN}" המסלול נוסע ${Math.round(pathM)} מ' לעומת ${Math.round(crowM)} מ' בקו ישר (יחס פי ${ratio.toFixed(2)}${foldM >= 200 ? `, ומתקפל אחורה ~${Math.round(foldM)} מ'` : ""}) — סטייה החורגת מסף עיקוף ודאי. זהו סיבוב מיותר שניתן לקצר.`,
            engineMissReason: engineFlagged ? "" : "המנוע משווה עיקוף רק מול קו אחר שעוצר ב*אותם מזהי-תחנות* בדיוק. כאן אין קו כזה (קווים שכנים עוברים פיזית אך לא עוצרים באותן תחנות), ולכן לא נוצרה השוואה והקטע לא סומן.",
            source: "quick",
          };
        }
        // סטייה מתחת לסף — מנוסח באופן מפורט ושימושי (לא רק "יחס פי X")
        return {
          verdict: "ספק",
          reason: `בקטע "${fromN}" ← "${toN}" המסלול נוסע ${Math.round(pathM)} מ' לעומת ${Math.round(crowM)} מ' בקו אווירי ישר (יחס פי ${ratio.toFixed(2)}). הסטייה קלה ואינה מגיעה לסף עיקוף ודאי (פי 1.6, או תקיפול-אחורה ≥200 מ') — ייתכן שזהו מבנה-כביש טבעי ולא עיקוף. מומלץ לבדוק על המפה אם קיים נתיב ישר וקצר יותר בין שתי התחנות.`,
          engineMissReason: "",
          source: "quick",
        };
      }
      return { verdict: "ספק", reason: "אין מספיק נקודות-מסלול בקטע המסומן לאבחון גאומטרי אוטומטי. סמנו קטע ארוך יותר, או בדקו ידנית על המפה.", engineMissReason: "", source: "quick" };
    };
    try {
      const txt = await window.aiComplete(prompt);
      let v;
      try { v = JSON.parse(txt.match(/\{[\s\S]*\}/)[0]); v.source = "ai"; }
      catch (_e) { v = null; }
      if (!v || !v.verdict) v = reportFallback(); // תשובה לא תקינה → גיבוי דטרמיניסטי
      setReportAnalysis({
        status: "done",
        verdict: v.verdict,
        reason: window.stripArabic ? window.stripArabic(v.reason) : v.reason,
        source: v.source || "quick",
        engineFlagged,
        engineMissReason: window.stripArabic ? window.stripArabic(v.engineMissReason || "") : (v.engineMissReason || ""),
      });
    } catch (_e) {
      // AI לא נגיש → גיבוי דטרמיניסטי (כמו במסלול הראשי), לא שגיאה אדומה.
      const v = reportFallback();
      setReportAnalysis({
        status: "done",
        verdict: v.verdict,
        reason: window.stripArabic ? window.stripArabic(v.reason) : v.reason,
        source: "quick",
        engineFlagged,
        engineMissReason: window.stripArabic ? window.stripArabic(v.engineMissReason || "") : (v.engineMissReason || ""),
        fallback: true,
      });
    }
  };

  const exportReport = () => {
    const rep = buildReport();
    if (!rep) return;
    if (reportAnalysis.status === "done") rep.aiVerdict = {
      verdict: reportAnalysis.verdict, reason: reportAnalysis.reason,
      engineFlagged: reportAnalysis.engineFlagged, engineMissReason: reportAnalysis.engineMissReason || "",
    };
    const blob = new Blob([JSON.stringify(rep, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `דוח-תקלה-קו-${rep.lineNumber}-${cityName}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  // שליחת דוח תקלה למפתח במייל. מורידה קובץ JSON מפורט (קואורדינטות מלאות) *וגם*
  // פותחת טיוטת מייל מוכנה עם סיכום קריא — כך שגם בלי לצרף את הקובץ, המפתח מקבל
  // את כל מה שצריך כדי לאתר את הקטע ולבדוק למה המערכת לא סימנה אותו. (mailto אינו
  // יכול לצרף קובץ אוטומטית — לכן הקובץ יורד והמשתמש מתבקש לצרפו.)
  const DEV_EMAIL = "shlomihartman@gmail.com";
  const emailReport = () => {
    const rep = buildReport();
    if (!rep) return;
    const a = reportAnalysis;
    if (a.status === "done") rep.aiVerdict = {
      verdict: a.verdict, reason: a.reason,
      engineFlagged: a.engineFlagged, engineMissReason: a.engineMissReason || "",
    };
    // הורדת הקובץ המפורט לצירוף
    const blob = new Blob([JSON.stringify(rep, null, 2)], { type: "application/json" });
    const dl = document.createElement("a");
    dl.href = URL.createObjectURL(blob);
    dl.download = `דוח-תקלה-קו-${rep.lineNumber}-${cityName}.json`;
    dl.click();
    setTimeout(() => URL.revokeObjectURL(dl.href), 2000);
    // טיוטת מייל עם סיכום קריא
    const body = [
      "שלום,",
      "זוהתה תקלת-מסלול בקו תחבורה ציבורית שכלי \"קו באג\" לא סימן אוטומטית.",
      "",
      `עיר: ${rep.city}`,
      `קו: ${rep.lineNumber} — ${rep.direction}`,
      `קטע בעייתי: "${rep.fromStop ? rep.fromStop.name : "?"}" ← "${rep.toStop ? rep.toStop.name : "?"}"`,
      `מזהי תחנות (GTFS): ${rep.fromStop ? rep.fromStop.id : "?"} → ${rep.toStop ? rep.toStop.id : "?"}`,
      `תחנות בקטע: ${rep.stopsInSegment.map((s) => s.name).join(" ← ")}`,
      "",
      a.status === "done" ? `הכרעת AI: ${a.verdict}${a.reason ? " — " + a.reason : ""}` : "",
      a.status === "done" ? `סטטוס המערכת: ${a.engineFlagged ? "סימן את הקטע" : "לא סימן את הקטע"}` : "",
      a.engineMissReason ? `למה המערכת פספסה: ${a.engineMissReason}` : "",
      rep.userExplanation ? `הסבר המדווח: ${rep.userExplanation}` : "",
      "",
      `נקודות-קצה (lat,lng): ${rep.markedFromCoord.join(",")} ← ${rep.markedToCoord.join(",")}`,
      `מספר נקודות-מסלול בקטע: ${rep.routeCoordinates.length}`,
      "",
      "📎 הקובץ המפורט (קואורדינטות מלאות) הורד למכשיר — נא לצרף אותו למייל לפני השליחה.",
    ].filter((l) => l !== "").join("\n");
    const subject = `קו באג — תקלה בקו ${rep.lineNumber} (${rep.city})`;
    window.location.href = `mailto:${DEV_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const enterReport = () => {
    setReportMode(true);
    setActiveIdx(null);
    setReportLineNum(""); setReportVariant(0);
    setMarkFrom(null); setMarkTo(null);
    setReportText(""); setReportAnalysis({ status: "idle" });
  };
  const exitReport = () => { setReportMode(false); };

  React.useEffect(() => { setReportAnalysis({ status: "idle" }); }, [markFrom, markTo, reportLineNum, reportVariant]);

  return (
    <div className="app">
      <TopBar
        query={query} setQuery={setQuery} onSelect={selectCity} cityNames={D.cityNames}
        onUpload={() => { setJob(null); setUploadOpen(true); }}
        onInfo={() => setInfoOpen(true)}
        onReport={enterReport}
      />
      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onProcess={processFile} job={job} />
      <InfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
      <div className="body" style={{ "--panel-w": panelWidth + "px" }}>
        {reportMode && city ? (
          <ReportPanel
            city={city}
            lineNum={reportLineNum} setLineNum={setReportLineNum}
            variantIdx={reportVariant} setVariantIdx={setReportVariant}
            markFrom={markFrom} markTo={markTo} setMarkFrom={setMarkFrom} setMarkTo={setMarkTo}
            text={reportText} setText={setReportText}
            onAnalyze={analyzeReport} analysis={reportAnalysis}
            onExport={exportReport} onEmail={emailReport} onExit={exitReport}
          />
        ) : city ? (
          <Panel city={city} activeIdx={activeIdx} setActiveIdx={setActiveIdx} aiReview={aiReview} />
        ) : (
          <aside className="panel">
            <div className="empty">
              <div className="e-inner">
                <h2>בחרו עיר</h2>
                <p>הקלידו שם עיר כדי לסרוק את קווי התחבורה שלה, או העלו קובץ GTFS לערים נוספות.</p>
              </div>
            </div>
          </aside>
        )}
        <div className="col-resizer" onMouseDown={startResize} onTouchStart={startResize} title="גרור לשינוי רוחב הפאנל">
          <span className="cr-grip"></span>
        </div>
        <div className="map-wrap">
          <div id="map" ref={mapEl}></div>
          <div className="map-style">
            {Object.keys(BASEMAPS).map((k) => (
              <button
                key={k}
                className={"sbtn " + (basemap === k ? "on" : "")}
                onClick={() => setBasemap(k)}
              >
                {BASEMAPS[k].label}
              </button>
            ))}
          </div>
          <div className="map-legend">
            <div className="row"><span className="swatch normal"></span>מסלול הקו עם התקלה</div>
            <div className="row"><span className="swatch detour"></span>הקטע המיותר (עיקוף)</div>
            <div className="row"><span className="swatch alt"></span>מסלול הקו להשוואה</div>
            <div className="row"><span className="swatch stop"></span>תחנה</div>
          </div>
          <div className="map-toggle">
            <button className={"chip " + (showLabels ? "on" : "")} onClick={() => setShowLabels((v) => !v)}>
              <span className="sw"></span>שמות תחנות
            </button>
            {city && (
              <button className="chip export" onClick={exportCity} title="הורדת נתוני כל העיר לקובץ לבדיקה">
                ⬇ ייצוא לבדיקה
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<KavBug />);
