/* ===========================================================================
   קו באג — שכבת נתונים + מנוע זיהוי (דמו)
   מודל בסגנון GTFS: ערים → קווים → תחנות {id, name, lat, lng}.
   זיהוי שני סוגי "באגים":
     • פער   — מקטע ארוך ללא אף תחנה (סף ק"מ).
     • עיקוף — הקו עובר בין שתי תחנות משותפות בדרך ארוכה בהרבה מקו אחר
               שמחבר אותן ישירות → המקטע החורג מסומן.
   =========================================================================== */
(function () {
  "use strict";

  function haversine(a, b) {
    const R = 6371, toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // --- תחנות באר שבע (אובייקט אחד לכל תחנה; מזהה משותף בין קווים) ---
  const BS = {
    merkazit: { id: "bs_merkazit", name: "תחנה מרכזית", lat: 31.2435, lng: 34.7995 },
    gimel: { id: "bs_gimel", name: "שכונה ג'", lat: 31.2470, lng: 34.7920 },
    daled: { id: "bs_daled", name: "שכונה ד'", lat: 31.2440, lng: 34.7650 },
    vav: { id: "bs_vav", name: "שכונה ו'", lat: 31.2380, lng: 34.7800 },
    yaalef: { id: "bs_yaalef", name: 'שכונה י"א', lat: 31.2745, lng: 34.8105 },
    soroka: { id: "bs_soroka", name: "סורוקה", lat: 31.2585, lng: 34.8005 },
    bgu: { id: "bs_bgu", name: "אוניברסיטת בן-גוריון", lat: 31.2625, lng: 34.8005 },
    rakevet: { id: "bs_rakevet", name: "רכבת מרכז/אוניברסיטה", lat: 31.2620, lng: 34.7990 },
    ramotW: { id: "bs_ramotw", name: "רמות מערב", lat: 31.2840, lng: 34.8160 },
    ramot: { id: "bs_ramot", name: "רמות מרכז", lat: 31.2885, lng: 34.8230 },
    amek: { id: "bs_amek", name: "אזור תעשייה עמק שרה", lat: 31.2160, lng: 34.7955 },
    big: { id: "bs_big", name: "ביג באר שבע", lat: 31.2120, lng: 34.8120 },
    grand: { id: "bs_grand", name: "קניון גרנד", lat: 31.2510, lng: 34.7720 },
    neve: { id: "bs_neve", name: "נווה זאב", lat: 31.2300, lng: 34.7700 },
    omerIn: { id: "omer_in", name: "עומר — כניסה", lat: 31.2660, lng: 34.8430 },
    omerC: { id: "omer_ctr", name: "עומר — מרכז מסחרי", lat: 31.2700, lng: 34.8490 },
    meitarIn: { id: "meitar_in", name: "מיתר — כניסה", lat: 31.3185, lng: 34.9330 },
    meitarC: { id: "meitar_ctr", name: "מיתר — מרכז", lat: 31.3240, lng: 34.9395 },
  };

  const DAN = "#2b7a3d", METRO = "#9c27b0";

  const CITIES = {
    "באר שבע": {
      key: "beer-sheva",
      center: { lat: 31.252, lng: 34.81 },
      zoom: 12,
      lines: [
        // קו "יעיל" — מחבר מרכזית↔רמות בדרך הקצרה (משמש כעוגן השוואה)
        { number: "5", operator: "דן בדרום", color: DAN, name: "מרכזית ← רמות",
          stops: [BS.merkazit, BS.soroka, BS.bgu, BS.yaalef, BS.ramotW, BS.ramot] },
        // אותן תחנות קצה (מרכזית, רמות) אבל דרך עמק שרה — עיקוף ענק + פער
        { number: "13", operator: "דן בדרום", color: DAN, name: "מרכזית ← עמק שרה ← רמות",
          stops: [BS.merkazit, BS.gimel, BS.amek, BS.ramot] },
        // בין-עירוני למיתר — פער ארוך ללא תחנה
        { number: "462", operator: "מטרופולין", color: METRO, name: "באר שבע ← מיתר",
          stops: [BS.merkazit, BS.rakevet, BS.meitarIn, BS.meitarC] },
        // קו צפוף ותקין
        { number: "25", operator: "דן בדרום", color: DAN, name: "נווה זאב ← סורוקה",
          stops: [BS.neve, BS.vav, BS.gimel, BS.merkazit, BS.soroka] },
        // ביג ← עומר עם פער דרך עמק שרה
        { number: "55", operator: "מטרופולין", color: METRO, name: "ביג ← עמק שרה ← עומר",
          stops: [BS.big, BS.amek, BS.omerIn, BS.omerC] },
        // קו צפוף ותקין
        { number: "9", operator: "דן בדרום", color: DAN, name: "מרכזית ← גרנד ← נווה זאב",
          stops: [BS.merkazit, BS.grand, BS.daled, BS.neve] },
      ],
    },

    "אשדוד": {
      key: "ashdod",
      center: { lat: 31.8, lng: 34.65 },
      zoom: 12,
      lines: [
        { number: "7", operator: "אגד", color: "#1565c0", name: "סיטי ← רובע ט\"ז",
          stops: [
            { id: "ash_city", name: "סיטי", lat: 31.7920, lng: 34.6490 },
            { id: "ash_g", name: "רובע ג'", lat: 31.7980, lng: 34.6420 },
            { id: "ash_z", name: "רובע ז'", lat: 31.8060, lng: 34.6480 },
            { id: "ash_16", name: "רובע ט\"ז", lat: 31.8160, lng: 34.6550 },
          ] },
        { number: "16", operator: "אגד", color: "#1565c0", name: "מרכזית ← אזה\"ת צפוני",
          stops: [
            { id: "ash_mrk", name: "תחנה מרכזית", lat: 31.7900, lng: 34.6510 },
            { id: "ash_a", name: "רובע א'", lat: 31.7960, lng: 34.6560 },
            { id: "ash_ind", name: "אזור תעשייה צפוני", lat: 31.8350, lng: 34.6720 },
            { id: "ash_port", name: "נמל אשדוד", lat: 31.8230, lng: 34.6360 },
          ] },
        { number: "9", operator: "אגד", color: "#1565c0", name: "רובע י\"א ← מרינה",
          stops: [
            { id: "ash_11", name: "רובע י\"א", lat: 31.8090, lng: 34.6620 },
            { id: "ash_h", name: "רובע ח'", lat: 31.8030, lng: 34.6560 },
            { id: "ash_sq", name: "כיכר העיר", lat: 31.7960, lng: 34.6470 },
            { id: "ash_marina", name: "מרינה", lat: 31.7880, lng: 34.6380 },
          ] },
      ],
    },
  };

  // ---------------------------------------------------------------------------
  // מנוע זיהוי
  // ---------------------------------------------------------------------------
  const SEVRANK = { ok: 0, low: 1, medium: 2, high: 3 };
  const sevGap = (km) => (km >= 8 ? "high" : km >= 4 ? "medium" : "low");
  const sevDetour = (km) => (km >= 6 ? "high" : km >= 3 ? "medium" : "low");

  function buildLine(line) {
    const stops = line.stops;
    const cum = [0];
    const segments = [];
    const posById = {};
    const idset = {};
    let isLoop = false; // האם הקו חוזר לתחנה שכבר ביקר בה (לולאת שכונה)
    stops.forEach((s, i) => {
      if (posById[s.id] != null) isLoop = true;
      else posById[s.id] = i;
      idset[s.id] = true;
    });
    for (let i = 0; i < stops.length - 1; i++) {
      const dist = haversine(stops[i], stops[i + 1]);
      cum[i + 1] = cum[i] + dist;
      segments.push({ a: stops[i], b: stops[i + 1], dist, index: i, flags: {} });
    }
    return { ...line, stops, cum, segments, posById, idset, isLoop, hasShape: !!(line.shape && line.shape.length > 1), issues: [] };
  }

  // מאתר בקו O זוג מיקומים (bi של idX, bj של idY) שהם *עוקבים אמיתית בסדר
  // הנסיעה* — כלומר ההפרש בסדר התחנות הוא 1 (צמודות) או עד maxGap (תחנת-ביניים
  // אחת). סורק את *כל* המופעים של שתי התחנות (לא רק posById שמחזיק את הראשון
  // בלבד), ובוחר את הזוג בעל הפער המינימלי בסדר. כך קו מעגלי/הלוך-חזור שמבקר
  // תחנה פעמיים לא יזווג תחנה מתחילת המסלול עם תחנה מסופו. מחזיר {bi,bj,gap}
  // או null אם אין זוג עוקב אמיתי. מכבד כיוון (קדימה או אחורה) אך לא דילוג ארוך.
  function adjacentStopPair(O, idX, idY, maxGap) {
    const xs = [], ys = [];
    for (let i = 0; i < O.stops.length; i++) {
      if (O.stops[i].id === idX) xs.push(i);
      if (O.stops[i].id === idY) ys.push(i);
    }
    let best = null;
    for (const bi of xs) for (const bj of ys) {
      const gap = Math.abs(bj - bi);
      if (gap < 1 || gap > maxGap) continue; // חייב להיות עוקב, לא אותה תחנה ולא רחוק
      if (!best || gap < best.gap) best = { bi, bj, gap };
    }
    return best;
  }

  function polyLen(poly) {
    if (!poly || poly.length < 2) return 0;
    let d = 0;
    for (let i = 1; i < poly.length; i++)
      d += haversine({ lat: poly[i - 1][0], lng: poly[i - 1][1] },
                     { lat: poly[i][0], lng: poly[i][1] });
    return d;
  }

  // מחשב פעם אחת לכל קו (cache על האובייקט): אורך מצטבר לאורך ה-shape, ולכל
  // אורך-המסלול (לפי כביש) שקו L נוסע בין אינדקסי תחנות p,q — חיבור ישיר של
  // מרחקי-המקטע שכבר חושבו ב-snapStopsToShape (_roadDist) / applyRoadDistances
  // (roadCum). O(|p-q|) בלבד — בלי לסרוק את ה-shape בכל קריאה.
  function spanRoadKm(L, p, q) {
    const lo = Math.min(p, q), hi = Math.max(p, q);
    if (L.roadCum) return Math.abs(L.roadCum[hi] - L.roadCum[lo]);
    const rd = L._roadDist;
    if (rd) {
      let d = 0;
      for (let i = lo; i < hi; i++) d += rd[i] != null ? rd[i] : haversine(L.stops[i], L.stops[i + 1]);
      return d;
    }
    if (L.cum) return Math.abs(L.cum[hi] - L.cum[lo]);
    return haversine(L.stops[lo], L.stops[hi]);
  }

  // עיקוף מיותר — השוואת קו אחד מול *כל* הקווים שמחברים את אותן שתי תחנות,
  // ושימוש בקצר שבהם כאמת-מידה (לא מול קו יחיד שרירותי).

  // בונה פוליגון מסלול של קו L בין תחנות p..q מהגאומטריה המדויקת (_geom)
  function pathBetween(L, p, q) {
    const lo = Math.min(p, q), hi = Math.max(p, q);
    if (L._geom) {
      const out = [];
      for (let s = lo; s < hi; s++) {
        const seg = L._geom[s];
        if (!seg || seg.length < 2) continue;
        for (const pt of seg) {
          const last = out[out.length - 1];
          if (!last || last[0] !== pt[0] || last[1] !== pt[1]) out.push(pt);
        }
      }
      if (out.length > 1) return out;
    }
    return L.stops.slice(lo, hi + 1).map((s) => [s.lat, s.lng]);
  }
  // דוגם פוליגון ל-~maxN נקודות (שומר ראש/זנב) — לקלט קומפקטי ל-AI.
  function downsample(poly, maxN) {
    if (!poly || poly.length <= maxN) return poly || [];
    const step = (poly.length - 1) / (maxN - 1);
    const out = [];
    for (let i = 0; i < maxN; i++) out.push(poly[Math.round(i * step)]);
    return out;
  }
  // בונה חבילת-גאומטריה לבוררות AI: פוליגון המסלול של הקו וקו-הייחוס בין שתי
  // התחנות (קואורדינטות אמיתיות, מעוגלות ל-6 ספרות), רשימת התחנות בסדר הנסיעה,
  // וכיוון הנסיעה (מתוך שם הקו). מאפשר ל-AI לנתח את המסלול עצמו — לא רק מספרים.
  // חילוץ כיוון הנסיעה מתוך שם הקו "מוצא<->יעד-עיר-index" — הצד הפעיל הוא היעד.
  function travelDirection(name) {
    if (!name) return "";
    const parts = String(name).split("<->");
    if (parts.length < 2) return name;
    const origin = parts[0].trim();
    let dest = parts[1].replace(/-\d+#?$/, "").trim();
    return `מ-${origin} אל ${dest}`;
  }
  function buildGeoDiag(L, p, q, O, allLines) {
    const round = (pt) => [+pt[0].toFixed(6), +pt[1].toFixed(6)];
    // מסלול הקו לפי _geom — נתיב הנסיעה המונוטוני (סדר הנסיעה האמיתי). זה משקף
    // נכון גם זרועות יציאה-וחזרה (שהצמדת idx-קרוב הייתה מקריסה), ומראה ל-AI את
    // הכביש שהאוטובוס באמת נוסע בו.
    const lineP = pathBetween(L, p, q).map(round);
    const aId = L.stops[p].id, bId = L.stops[q].id;
    // אוסף את *כל* הקווים האחרים שמשרתים את שתי התחנות (לא רק קו-ייחוס יחיד),
    // עם הגאומטריה שלהם בין אותן תחנות — כדי שה-AI ישווה את הקואורדינטות של
    // הקו הנבדק מול כמה קווים ויקבע אם המסלול באמת שונה.
    const baseNum = (n) => String(n).replace(/[^0-9].*$/, "");
    const refMap = new Map(); // מספר-קו -> הגרסה הקצרה ביותר (מדדים מנוקים מכפילות כיוון)
    for (const Oc of (allLines || (O ? [O] : []))) {
      if (Oc === L || baseNum(Oc.number) === baseNum(L.number)) continue;
      // אכיפת סדר-תחנות: רק קו שמחבר את A→B כתחנות עוקבות אמיתיות (לא תחנה
      // מתחילת המסלול מול תחנה מסופו עקב מופע כפול).
      const pair = adjacentStopPair(Oc, aId, bId, 5);
      if (!pair) continue;
      const rp = pair.bi, rq = pair.bj;
      const geo = pathBetween(Oc, Math.min(rp, rq), Math.max(rp, rq)).map(round);
      let len = 0;
      for (let i = 1; i < geo.length; i++) {
        const dy = geo[i][0] - geo[i - 1][0], dx = (geo[i][1] - geo[i - 1][1]) * Math.cos(geo[i][0] * Math.PI / 180);
        len += Math.sqrt(dy * dy + dx * dx);
      }
      const lo = Math.min(rp, rq), hi = Math.max(rp, rq);
      // תחנה נחשבת "משורתת ע"י קו-הייחוס במקטע הזה" רק אם המופע שלה נופל *בתוך
      // טווח האינדקסים הכרונולוגי* של זוג-העוקבות (lo..hi) — לא מופע מקרי
      // בחלק אחר של המסלול (posById הישן תפס את הראשון בלבד והטעה את ה-AI).
      const refIdInRange = new Set();
      for (let i = lo; i <= hi; i++) refIdInRange.add(Oc.stops[i].id);
      const served = [];
      for (let i = p; i <= q; i++) if (refIdInRange.has(L.stops[i].id)) served.push(L.stops[i].name);
      const prev = refMap.get(String(Oc.number));
      if (!prev || len < prev.len) refMap.set(String(Oc.number), {
        number: Oc.number, geometry: downsample(geo, 30), servesStops: served, len,
        refFrom: lo, refTo: hi, refGap: hi - lo,
        refFromName: Oc.stops[lo].name, refToName: Oc.stops[hi].name,
      });
    }
    const refLines = [...refMap.values()].sort((a, b) => a.len - b.len).slice(0, 6).map(({ len, ...r }) => r);
    const stops = [];
    for (let i = p; i <= q; i++) {
      const s = L.stops[i];
      const servedBy = [...new Set((allLines || []).filter((Oc) => Oc !== L && baseNum(Oc.number) !== baseNum(L.number) && Oc.posById[s.id] != null).map((Oc) => String(Oc.number)))];
      stops.push({ name: s.name, lat: +s.lat.toFixed(6), lng: +s.lng.toFixed(6), servedByOtherLines: servedBy });
    }
    return {
      lineGeometry: downsample(lineP, 40),
      refLines,
      stopsInTravelOrder: stops,
      headsign: travelDirection(L.name),
    };
  }

  // אגרגציה לכל קו — מיון, חישוב גרוע ביותר, ספירות, חומרה (עיקופים + סיבובים)
  function finalizeLine(L) {
    L.issues.sort((a, b) => b.km - a.km);
    L.worst = L.issues[0] || null;
    L.wasted = L.issues.reduce((s, x) => s + x.km, 0);
    L.gapCount = 0;
    L.detourCount = L.issues.filter((x) => x.type === "detour").length;
    L.loopCount = L.issues.filter((x) => x.type === "loop" || x.type === "selfloop").length;
    L.spurCount = L.issues.filter((x) => x.type === "spur").length;
    L.redundantCount = L.issues.length;
    L.severity = L.issues.reduce((sv, x) => (SEVRANK[x.severity] > SEVRANK[sv] ? x.severity : sv), "ok");
  }

  // ===========================================================================
  // גלאי מאוחד — הצלבה בין קווים (Cross-Reference)
  // ---------------------------------------------------------------------------
  // עיקרון: סורקים כל מקטע של שתי תחנות עוקבות X→Y בקו הנבדק (A), ומחפשים קו
  // ייחוס (B) שמחבר את אותן שתי תחנות מקומית. משווים את אורך-המסלול ש-A עושה
  // ב-shape שלו בין X ל-Y מול אורך-המסלול שהחלופה ה*קצרה ביותר* עושה בין אותן
  // תחנות. ההכרעה *יחסית בלבד* — אין שום סף אבסולוטי במטרים. אם A ארוך משמעותית
  // מהחלופה (יחס ≥ XREF_RATIO) — זהו חשד: קו B הוא "הוכחה מהשטח" שהכביש פתוח
  // וישר, ובכל זאת A מתפתל/מעקף שם — כמעט בוודאות באג ב-shape של ה-GTFS.
  // אם אף קו אחר לא מחבר את X→Y — אין הוכחה, ואין חשד מהגלאי הזה.
  // נדיב במכוון; הבוררות האוטומטית של ה-AI מסננת רעש מאמיתי.
  // ===========================================================================
  const XREF_RATIO = 1.35; // כמה (יחסית) A ארוך מהחלופה הקצרה כדי להיחשב חשד
  // שער 1 (בזבוז אפס) ברמת הגלאי: מקטע שבו הבזבוז נטו נמוך מרצפת-הרעש הזו
  // (במטרים) הוא רעש דגימה גיאומטרי / מיקום רציפים — לא ייווצר עליו "באג" כלל,
  // כדי שלעולם לא יוצג עיקוף של "0.0 ק"מ".
  const NOISE_FLOOR_KM = 0.06; // 60 מ' — מתחת לזה: כיסוי לגיטימי, לא עיקוף
  // שער 0 (נקודת מוצא משותפת): קו-ייחוס שתחנת-המוצא שלו רחוקה מתחנת-המוצא של
  // הקו הנבדק מעבר לטווח הזה אינו רלוונטי גיאוגרפית — אסור להשוות מולו.
  const ORIGIN_MAX_KM = 10; // טווח קרבה מרבי בין נקודות המוצא של שני הקווים
  // שער ארטיפקט-הצמדה: אם ההצמדה המונוטונית של תחנה "נתקעה" מוקדם על חצייה-עצמית
  // של ה-shape (ה-along שלה קטן בהרבה מהנקודה הקרובה-באמת), המקטע סביבה מנופח
  // לכל הלולאה ואינו אמין למדידת-עיקוף. סף הפער (בק"מ) שמעליו מדלגים על המקטע.
  const SNAP_STUCK_KM = 0.3;
  // שער כיווניות (Directional Gate): סטייה מרבית בין וקטור-הכניסה למקטע של הקו
  // הנבדק לזה של קו-הייחוס. ≥30° (APPROACH_MAX_DEG) — הקווים מגיעים למקטע
  // ממסלול/רחוב שונה, אינם אלטרנטיבה אמיתית; יחס-המרחקים ביניהם חסר משמעות
  // (תמרון גישה לגיטימי לצומת). זהה לסף שבהכרעה ב-components.jsx.
  const APPROACH_MAX_DEG = 30;

  // אורך הפוליגון ה*מצויר* של קו L בין אינדקסי תחנות a..b — סכום אורכי מקטעי
  // ה-_geom, *זהה בדיוק* ל-geomRange שב-app.jsx שצובע את המפה. קריטי שההחלטה
  // (מי עיקוף) תימדד מאותה גאומטריה שמציירים — אחרת קו יכול להימדד "קצר"
  // (לפי roadCum, שעלול להתקצר במקטע בעייתי) אך להיות מצויר "לולאה ארוכה",
  // וכך קו ישר ייחשב בטעות לעיקוף מול קו שמתפתל. נפילה ל-spanRoadKm אם אין _geom.
  function drawnKm(L, a, b) {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    if (!L._geom) return spanRoadKm(L, lo, hi);
    let d = 0;
    for (let s = lo; s < hi; s++) {
      const g = L._geom[s];
      if (!g || g.length < 2) continue;
      for (let j = 1; j < g.length; j++) {
        const dy = g[j][0] - g[j - 1][0];
        const dx = (g[j][1] - g[j - 1][1]) * Math.cos(g[j][0] * Math.PI / 180);
        d += Math.sqrt(dy * dy + dx * dx) * 111.32;
      }
    }
    return d || spanRoadKm(L, lo, hi);
  }

  // מדידת "התקדמות-קדימה נטו" של מקטע הקו הנבדק בין שתי תחנות עוקבות a→b, לאורך
  // ציר A→B, וזיהוי האם המקטע *נסוג מאחורי תחנת-המוצא* (turnaround). מחזיר
  // { fwdKm, behind } כאשר behind=true אם המקטע יורד מתחת ל-~-8% מאורך הציר —
  // כלומר הקו נוסע פיזית מאחורי הנקודה שבה התחיל. תמרון כזה הוא לולאת-היפוך
  // בתחנת-קצה (כמו קו 24 בתחנת הר הרצל: שתי תחנות בשם זהה, הקו מסתובב), *לא*
  // עיקוף-מסלול. במקרה כזה אורך-הפוליגון הגולמי (drawnKm) סופר את כל לולאת-
  // ההיפוך ומנפח את היחס; ה-fwdKm (ההתקדמות המונוטונית בלבד) הוא המידה ההוגנת.
  // עיקוף-קדימה אמיתי (לרוחב או הלוך-חזור בין התחנות) נשאר עם behind=false ואינו
  // מושפע — שכן הוא לעולם אינו עובר מאחורי תחנת-המוצא.
  function forwardKm(L, a, b) {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    if (!L._geom) return null;
    const pts = [];
    for (let s = lo; s < hi; s++) {
      const g = L._geom[s];
      if (!g || g.length < 2) continue;
      for (const p of g) {
        const last = pts[pts.length - 1];
        if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
      }
    }
    if (pts.length < 2) return null;
    const A = pts[0], B = pts[pts.length - 1];
    const ux = B[0] - A[0], uy = (B[1] - A[1]) * Math.cos(A[0] * Math.PI / 180);
    const uu = ux * ux + uy * uy;
    if (uu < 1e-12) return null;
    const tOf = (p) => {
      const px = p[0] - A[0], py = (p[1] - A[1]) * Math.cos(A[0] * Math.PI / 180);
      return (px * ux + py * uy) / uu;
    };
    const segKm = (p, q) => {
      const dy = q[0] - p[0], dx = (q[1] - p[1]) * Math.cos(p[0] * Math.PI / 180);
      return Math.sqrt(dy * dy + dx * dx) * 111.32;
    };
    let frontier = tOf(pts[0]), fwd = 0, minT = 0;
    for (let i = 1; i < pts.length; i++) {
      const ti = tOf(pts[i]);
      if (ti < minT) minT = ti;
      if (ti > frontier) { fwd += segKm(pts[i - 1], pts[i]); frontier = ti; }
    }
    return { fwdKm: fwd, behind: minT < -0.08 };
  }

  // מאפיין "תמרון-קצה": מודד שני סימנים גאומטריים של מקטע הקו הנבדק a→b ביחס
  // לקו-הייחוס O (בין refBi..refBj), על ציר A→B המשותף:
  //   backFrontierKm — הנסיגה-לאחור המקסימלית *אחרי* התקדמות-קדימה (frontier−t,
  //                    כש-t חיובי) במטרים-לאורך-הציר. הלוך-חזור אמיתי = ערך גדול;
  //                    תמרון יציאה/היפוך ליד תחנה = זעיר.
  //   latExtraKm     — כמה הקו הנבדק סוטה הצידה מהציר *מעבר* לסטיית קו-הייחוס.
  //                    אם הוא עוקב אחר אותו כביש מתפתל כמו הייחוס → ≈0 (אין
  //                    עיקוף-צד); אם סוטה הרבה יותר → עיקוף-צד אמיתי.
  // מחזיר null אם אין גאומטריה. (הסף להכרעה נקבע במקום-הקריאה.)
  function terminalManeuver(L, ti, O, rbi, rbj) {
    const g = (function () {
      const lo = ti, hi = ti + 1, pts = [];
      const seg = L._geom && L._geom[lo];
      if (!seg || seg.length < 2) return null;
      for (const p of seg) {
        const last = pts[pts.length - 1];
        if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
      }
      return pts.length >= 2 ? pts : null;
    })();
    if (!g) return null;
    const A = g[0], B = g[g.length - 1];
    const cosLat = Math.cos(A[0] * Math.PI / 180);
    const ux = B[0] - A[0], uy = (B[1] - A[1]) * cosLat;
    const uu = ux * ux + uy * uy;
    if (uu < 1e-12) return null;
    const KM = 111.32;
    const crowKm = Math.sqrt(uu) * KM;
    const tOf = (p) => {
      const px = p[0] - A[0], py = (p[1] - A[1]) * cosLat;
      return (px * ux + py * uy) / uu;
    };
    const latKmOf = (p) => {
      const t = tOf(p);
      const projLat = A[0] + t * (B[0] - A[0]);
      const projLng = A[1] + t * (B[1] - A[1]);
      const dy = (p[0] - projLat), dx = (p[1] - projLng) * cosLat;
      return Math.sqrt(dy * dy + dx * dx) * KM;
    };
    // backFrontier + סטיית-צד של הקו הנבדק
    let frontier = 0, backFrontKm = 0, latTested = 0;
    for (const p of g) {
      const t = tOf(p);
      if (t > frontier) frontier = t;
      if (t > 0) { const drop = (frontier - t) * crowKm; if (drop > backFrontKm) backFrontKm = drop; }
      const lt = latKmOf(p); if (lt > latTested) latTested = lt;
    }
    // סטיית-צד של קו-הייחוס על אותו ציר (מאותה גאומטריית-כביש)
    let latRef = 0;
    if (O && O._geom) {
      const lo = Math.min(rbi, rbj), hi = Math.max(rbi, rbj);
      for (let s = lo; s < hi; s++) {
        const seg = O._geom[s];
        if (!seg) continue;
        for (const p of seg) { const lt = latKmOf(p); if (lt > latRef) latRef = lt; }
      }
    }
    return { backFrontierKm: backFrontKm, latExtraKm: latTested - latRef };
  }

  // הפרש זווית-הגעה (במעלות) בין הקו הנבדק (כניסתו לתחנה באינדקס p) לבין קו-ייחוס
  // O (כניסתו לתחנת-המוצא של מקטע-הייחוס, אינדקס refLo). >90° = הקווים מגיעים
  // למקטע מצירים/כיוונים שונים — קו-הייחוס אינו אלטרנטיבה תחבורתית לגיטימית.
  // מקור-אמת יחיד: גם בחירת קו-הייחוס וגם הדיאגנוסטיקה משתמשות בו.
  function approachAngleDiffAt(L, p, O, refLo) {
    const tP = p - 1 >= 0 ? L.stops[p - 1] : null, tF = L.stops[p];
    const rP = refLo - 1 >= 0 ? O.stops[refLo - 1] : null, rF = O.stops[refLo];
    if (!tP || !tF || !rP || !rF) return null;
    const ang = (a, b) => {
      const dy = b.lat - a.lat, dx = (b.lng - a.lng) * Math.cos(a.lat * Math.PI / 180);
      return Math.atan2(dy, dx) * 180 / Math.PI;
    };
    let diff = Math.abs(ang(tP, tF) - ang(rP, rF)) % 360;
    if (diff > 180) diff = 360 - diff;
    return Math.round(diff);
  }

  // עיקוף נמדד תמיד ומוצג תמיד — אין שום חסימת קילומטראז' עיוורת. ההכרעה אם
  // מדובר בתמרון מקומי (כיכר) או עיקוף אמיתי נעשית ע"י ה-AI לפי הגאומטריה
  // וסדר התחנות, לא ע"י פילטר מספרי שמסתיר נתונים.
  function detectCrossRef(lines) {
    const baseNum = (n) => String(n).replace(/[^0-9].*$/, "");
    for (const L of lines) {
      L.issues = [];
      for (const s of L.segments) { s.flags = {}; s._excess = 0; s._ref = null; s._refKm = 0; }
    }
    // אינדקס תחנה→קווים (רק קווים עם shape) — כדי לא לסרוק את כל הקווים לכל מקטע.
    const servedBy = new Map();
    for (const O of lines) {
      if (!O.hasShape) continue;
      for (const s of O.stops) {
        let arr = servedBy.get(s.id);
        if (!arr) { arr = []; servedBy.set(s.id, arr); }
        arr.push(O);
      }
    }
    for (const L of lines) {
      const found = [];
      // (1) מקטע ממוקד: שתי תחנות עוקבות X→Y בקו הנבדק (רק אם יש shape להשוואה)
      if (L.hasShape) for (let i = 0; i < L.stops.length - 1; i++) {
        const X = L.stops[i], Y = L.stops[i + 1];
        const roadA = drawnKm(L, i, i + 1);          // אורך ה*מצויר* של הקו הנבדק
        if (!(roadA > 0)) continue;
        // שער היפוך-סדר (לולאה חוצה-עצמה): אם המיקום הגלובלי של תחנה Y על ה-shape
        // נמצא *לפני* זה של X (אף שסדר-הנסיעה הוא X→Y), ה-shape חוצה את עצמו כאן
        // ושתי התחנות יושבות עליו בסדר הפוך — אשכול תחנות צפוף על אותו רחוב בקו
        // מעגלי. במצב כזה ההצמדה המונוטונית נאלצת לקפוץ קדימה סביב הלולאה כדי
        // להגיע ל-Y, וכך roadA מנופח לכל היקף הלולאה (היה הבאג בקו 465/469: תחנות
        // 8,9,10 על "הרב פנחס לוין" בסדר-shape הפוך → מקטע 8→9 נמדד 555מ' במקום
        // ~200מ'). מקטע כזה אינו אמין למדידת-עיקוף — מדלגים.
        if (L._snap && L._snap[i] && L._snap[i + 1] &&
            L._snap[i + 1].gnear < L._snap[i].gnear) continue;
        // שער ארטיפקט-הצמדה: אם אחת התחנות "נתקעה" מוקדם (along קטן בהרבה מ-gnearAlong,
        // הנקודה הקרובה-באמת), ה-shape חצה את עצמו וההצמדה תפסה חצייה מוקדמת — המקטע
        // מנופח לכל הלולאה ואינו אמין. (קו 90 בצפת: "קניון/הגליל" נתקעה ב-along 5.0
        // במקום 10.5, והמקטע נמדד 5.5 ק"מ במקום 149 מ'.) מדלגים.
        {
          const A = L._snap && L._snap[i], B = L._snap && L._snap[i + 1];
          if ((A && A.gnearAlong != null && A.gnearAlong - A.along > SNAP_STUCK_KM) ||
              (B && B.gnearAlong != null && B.gnearAlong - B.along > SNAP_STUCK_KM)) continue;
        }
        // מדידת התקדמות-קדימה נטו וזיהוי נסיגה-מאחורי-המוצא (turnaround). משמש
        // בהמשך — אחרי בחירת קו-הייחוס — כדי לסנן לולאת-היפוך בתחנת-קצה.
        const fwd = forwardKm(L, i, i + 1);
        // (2) קו-ייחוס: מבין הקווים שעוצרים ב-X, מי שגם עוצר ב-Y מקומית.
        //     אמת-המידה = הקצר שבכולם (ההוכחה החזקה ביותר שהכביש ישר).
        const cands = servedBy.get(X.id);
        if (!cands) continue;                        // אף קו לא עוצר ב-X → אין הוכחה
        // בחירת קו-ייחוס *הוגנת*, לא "נוחה מתמטית". סורקים את כל המועמדים ומפרידים
        // אותם לפי שער-הכיווניות: וקטור-הכניסה למקטע (תחנה-קודמת→A) חייב להיות
        // דומה (סטייה ≤45°) לזה של הקו הנבדק. רק קו שנכנס למקטע מאותו כיוון רחוב
        // הוא אלטרנטיבה אמיתית — "תואם". קו שמגיע מרחוב/כיוון אחר (>45°) הוא
        // *תמרון גישה שונה*, יחס-המרחקים מולו חסר משמעות; נשמר רק כגיבוי-אחרון
        // כדי שה-UI יוכל להסביר למה אין השוואה, ולא יוצג כעיקוף.
        let best = null, bestAlt = null;
        for (const O of cands) {
          if (O === L || baseNum(O.number) === baseNum(L.number)) continue;
          // אכיפת סדר-תחנות קשיחה: קו-הייחוס חייב לחבר את X→Y כתחנות *עוקבות
          // אמיתיות* בסדר הנסיעה שלו (פער של מקטע אחד, ולכל היותר תחנת-ביניים אחת).
          const pair = adjacentStopPair(O, X.id, Y.id, 5);
          if (!pair) continue;                       // לא עוקבות בקו-הייחוס → לא רלוונטי
          // שער 0 — נקודת מוצא משותפת: קו-ייחוס שיוצא מנקודת מוצא רחוקה מדי אינו
          // על אותו ציר-מוצא — קו זר, אסור להשוות (מונע המצאת עיקופים, כמו 35↔333).
          if (L.stops[0] && O.stops[0] && haversine(L.stops[0], O.stops[0]) > ORIGIN_MAX_KM) continue;
          const roadB = drawnKm(O, pair.bi, pair.bj); // אורך ה*מצויר* של קו-הייחוס
          if (!(roadB > 0)) continue;
          // שער גאומטריה-אמיתית של קו-הייחוס: כדי לשמש "הוכחה שהכביש פתוח וישר",
          // לקו-הייחוס חייבת להיות גאומטריית-כביש *ממשית* במקטע — לא קו-ישר מנוון.
          // מקטע _geom בן ≤2 קודקודים (שאורכו ≈ הקו האווירי בין התחנות) פירושו
          // שאין לקו-הייחוס נתוני-shape כאן (הצמדה שקרסה / shape דליל), ואז roadB
          // הוא סתם המרחק האווירי — והשוואת קו-נבדק על כביש אמיתי מולו מייצרת
          // עיקוף-שווא. קריטי בקווים *מעגליים* שה-shape שלהם חוצה את עצמו וההצמדה
          // פר-מקטע מעורפלת (היה הבאג ב-218/218א/273 מול 207, וכן ב-992).
          const refLoSeg = Math.min(pair.bi, pair.bj);
          const refSegGeom = O._geom && O._geom[refLoSeg];
          const refCrow = haversine(O.stops[pair.bi], O.stops[pair.bj]);
          const refDegenerate = (!refSegGeom || refSegGeom.length < 3) && roadB <= refCrow * 1.06;
          if (refDegenerate) continue; // אין גאומטריית-כביש אמיתית → אינו ראיה
          // שער כיווניות: סטיית וקטור-הכניסה (<30°=תואם) *וגם* פער התחנה-הקודמת
          // ≤300 מ' (אותו ציר-כניסה). אם הסטייה ≥30° או שהתחנה-הקודמת רחוקה
          // >300 מ' — הקו נכנס למקטע ממסלול/רחוב אחר ⇒ גיבוי-אחרון בלבד, לא תואם.
          const ang = approachAngleDiffAt(L, i, O, Math.min(pair.bi, pair.bj));
          const rLo = Math.min(pair.bi, pair.bj);
          const tPrev = i - 1 >= 0 ? L.stops[i - 1] : null;
          const rPrev = rLo - 1 >= 0 ? O.stops[rLo - 1] : null;
          const prevGap = (tPrev && rPrev) ? haversine(tPrev, rPrev) : null;
          const farPrev = prevGap != null && prevGap > 0.3; // 300 מ'
          // כיוון-נסיעה הפוך: קו-הייחוס עובר X→Y בסדר-נסיעה הפוך (bj<bi) — הוא נוסע
          // Y→X, כיוון מנוגד. אינו אלטרנטיבה תקפה בכיוון הנבדק (רחובות חד-סטריים),
          // ולכן אינו "תואם". נשמר רק כגיבוי-אחרון כדי שה-UI יסביר "לא ניתן להשוואה".
          const reversed = pair.bj < pair.bi;
          const compatible = !reversed && (ang == null || ang < APPROACH_MAX_DEG) && !farPrev;
          const cand = { O, roadB, bi: pair.bi, bj: pair.bj, ang };
          if (compatible) {
            if (!best || roadB < best.roadB) best = cand;       // תואם-כיווניות — עדיפות
          } else {
            if (!bestAlt || roadB < bestAlt.roadB) bestAlt = cand; // כיוון/ציר שונה — גיבוי
          }
        }
        // מעדיפים תמיד קו-ייחוס תואם-כיווניות. אם קיים *רק* קו מכיוון שונה,
        // עדיין מייצרים רשומה — אך שער-הכיווניות בהכרעה יסמן 'לא ניתן להשוואה /
        // תמרון גישה לגיטימי', ולא יוצג עיקוף על בסיס מרחק בלבד.
        const chosen = best || bestAlt;
        if (!chosen) continue;                       // אין חלופה → אין הוכחה → אין חשד
        // שער תמרון-קצה (יציאת-מסוף / לולאת-היפוך) — מסנן עודף תפעולי ליד תחנה.
        if (fwd && fwd.behind && chosen) {
          // מבחין עודף שמקורו תמרון תפעולי ליד תחנה (יציאת-מסוף / לולאת-היפוך
          // בתחנת-קצה) מעיקוף אמיתי, בלי תלות בשמות-תחנות. שני סימנים גאומטריים
          // מול קו-הייחוס: backFrontier (נסיגה אחרי התקדמות — הלוך-חזור) ו-latExtra
          // (סטיית-צד מעבר לזו של הייחוס). שניהם זעירים ⇒ כל ה"עודף" תמרון-קצה.
          // קו 34: backFront 33מ', latExtra 5מ' → דילוג. קו 140/64/36: backFront
          // 214–587מ' → נשמרים. דורש גם fwd.behind (נסיגה מאחורי תחנת-המוצא).
          const tm = terminalManeuver(L, i, chosen.O, chosen.bi, chosen.bj);
          if (tm && tm.backFrontierKm < 0.15 && tm.latExtraKm < 0.09) continue;
        }
        // האם נבחר *רק* קו מכיוון-כניסה שונה (אין ולו תאום-כיווניות אחד)? אם כן,
        // אין בסיס להשוואת מרחק — שער-הכיווניות בהכרעה יסמן 'תמרון גישה לגיטימי'.
        const approachIncompatible = !best && !!bestAlt;
        // (3) השוואת חלופות יחסית טהורה — מי קצר ומי מתפתל בין אותן שתי תחנות.
        //     שתי המידות נמדדות מאותה גאומטריה שמציירים (drawnKm), כך שהקו
        //     המסומן הוא *תמיד* הארוך-בפועל על המפה — לעולם לא היפוך.
        const ratio = roadA / chosen.roadB;
        if (ratio < XREF_RATIO) continue;            // הנבדק לא ארוך משמעותית → תקין
        if (!(roadA > chosen.roadB)) continue;       // משמר אנטי-היפוך מפורש
        // שער 1 — בזבוז אפס/רעש: בזבוז נטו מתחת לרצפת-הרעש = כיסוי לגיטימי,
        // לא ייווצר עליו באג (מונע תצוגת "0.0 ק"מ עיקוף").
        if ((roadA - chosen.roadB) < NOISE_FLOOR_KM) continue;
        found.push({ i, excess: roadA - chosen.roadB, ratio, roadA, roadB: chosen.roadB, ref: chosen.O, refBi: chosen.bi, refBj: chosen.bj, approachIncompatible });
      }
      // הגדולים תחילה; מקטעים בודדים — לא חוסמים זה את זה
      found.sort((a, b) => b.excess - a.excess);
      for (const f of found) {
        const p = f.i, q = f.i + 1;
        if (L.segments[p]) L.segments[p].flags.detour = true;
        L.issues.push({
          type: "detour", km: f.excess,
          from: L.stops[p], to: L.stops[q], segIdx: [p],
          refNumber: f.ref.number, refKm: f.roadB, longKm: f.roadA,
          refSegIdx: [f.refBi, f.refBj],
          // גאומטריית קו-הייחוס (הקו שמולו משווים) בין שתי התחנות — לציור הירוק.
          // נבנית מה-shape ה*גולמי* של קו-הייחוס, חתוך בין נקודות-ההטלה של שתי
          // התחנות (refBi, refBj) — בדיוק כמו שמצב "דיווח על תקלה" מצייר את ה-shape
          // המלא. כך הירוק תמיד עוקב אחרי הכביש האמיתי ולעולם אינו "מרחף":
          // לא מסתמכים על מקטע _geom בודד, שעלול לצאת מנוון (2 נקודות בקו-ישר)
          // כשהצמדת-התחנות יוצאת לא-מונוטונית בקו בין-עירוני (היה הבאג בקו 992,
          // שם _geom[21] של קו-הייחוס היה מקטע-ישר מנוון אף שה-shape מלא ותקין).
          refGeom: (function () {
            const RL = f.ref;
            if (!RL.shape || RL.shape.length < 2 || !RL._snap) return null;
            let A = RL._snap[f.refBi], B = RL._snap[f.refBj];
            if (!A || !B) return null;
            if (B.along < A.along) { const t = A; A = B; B = t; } // לפי סדר ה-shape
            const out = [A.proj];
            for (let i = A.seg + 1; i <= B.seg; i++) {
              const pt = [RL.shape[i][0], RL.shape[i][1]];
              const last = out[out.length - 1];
              if (!last || last[0] !== pt[0] || last[1] !== pt[1]) out.push(pt);
            }
            const last = out[out.length - 1];
            if (!last || last[0] !== B.proj[0] || last[1] !== B.proj[1]) out.push(B.proj);
            return out.length > 1 ? out : null;
          })(),
          refColor: f.ref.color,
          severity: sevDetour(f.excess),
          diag: Object.assign({
            kind: "detour", lineNumber: L.number, lineName: L.name,
            fromName: L.stops[p].name, toName: L.stops[q].name,
            // אינדקסים כרונולוגיים מפורשים (מ-adjacentStopPair) — כדי שה-AI
            // יידע שמדובר בתחנות *עוקבות* ולא בקצוות-מסלול רחוקים.
            testedSequence: { from: p, to: q, fromName: L.stops[p].name, toName: L.stops[q].name },
            referenceSequence: { from: f.refBi, to: f.refBj, gap: Math.abs(f.refBj - f.refBi),
              fromName: f.ref.stops[f.refBi] && f.ref.stops[f.refBi].name,
              toName: f.ref.stops[f.refBj] && f.ref.stops[f.refBj].name },
            // האם קו-הייחוס נמצא ב*תחנת-קצה* שלו במקטע הזה (מתחיל/מסתיים בו): אם
            // המופע ב-refBi/refBj הוא התחנה הראשונה (0) או האחרונה ברצף הנסיעה של
            // קו-הייחוס — הוא יוצא/מסיים שם, ואינו "מסדרון מעבר" תקף להשוואה. קו
            // שמתחיל בתחנה עושה קפיצה ישירה קצרה, בעוד הקו הנבדק עשוי לבצע לולאת-
            // שירות לגיטימית באמצע מסלולו (כמו קו 174 מול קו 171 שמוצאו שם).
            refIsTerminus: (Math.min(f.refBi, f.refBj) === 0) ||
              (Math.max(f.refBi, f.refBj) === f.ref.stops.length - 1),
            // תחנות-הסמך (קודמת/באה) של שני הקווים — כדי שה-AI יזהה אם הקו
            // הנבדק מגיע למקטע מ*כיוון אחר* מקו-הייחוס (תמרון גישה לצומת/כיכר).
            testedPrev: p - 1 >= 0 ? L.stops[p - 1].name : null,
            testedNext: q + 1 < L.stops.length ? L.stops[q + 1].name : null,
            refPrev: (() => { const lo = Math.min(f.refBi, f.refBj); return lo - 1 >= 0 ? f.ref.stops[lo - 1].name : null; })(),
            refNext: (() => { const hi = Math.max(f.refBi, f.refBj); return hi + 1 < f.ref.stops.length ? f.ref.stops[hi + 1].name : null; })(),
            differentApproach: (() => {
              const tPrev = p - 1 >= 0 ? L.stops[p - 1].id : null;
              const lo = Math.min(f.refBi, f.refBj);
              const rPrev = lo - 1 >= 0 ? f.ref.stops[lo - 1].id : null;
              return tPrev != null && rPrev != null && tPrev !== rPrev;
            })(),
            // מרחק גיאוגרפי בין התחנה-הקודמת של הקו הנבדק לתחנה-הקודמת של קו-הייחוס
            // (ק"מ). זהו מדד ה*ציר-כניסה*: גדול → הקווים מגיעים למקטע מצירים שונים
            // לחלוטין (כמו "יהושע ייבין" מול "נפתלי הרץ אימבר") ⇒ השוואה לא תקפה.
            // מעל 300 מ' = פסילה קשיחה: אסור לסווג עיקוף.
            prevApproachGapKm: (() => {
              const tPrev = p - 1 >= 0 ? L.stops[p - 1] : null;
              const lo = Math.min(f.refBi, f.refBj);
              const rPrev = lo - 1 >= 0 ? f.ref.stops[lo - 1] : null;
              return (tPrev && rPrev) ? haversine(tPrev, rPrev) : null;
            })(),
            // הפרש זווית-הגעה (במעלות) בין הקו הנבדק לקו-הייחוס שנבחר — מאותו
            // מקור-אמת ששימש לבחירת קו-הייחוס (approachAngleDiffAt). ערך זה תמיד
            // ≤90° כשנבחר קו תואם-ציר; >90° רק כשלא נמצא אף מועמד תואם.
            approachAngleDiff: approachAngleDiffAt(L, p, f.ref, Math.min(f.refBi, f.refBj)),
            // כיוון-נסיעה הפוך: קו-הייחוס עובר את שתי התחנות בסדר-נסיעה הפוך
            // (refBj<refBi → נוסע B→A). כיוון מנוגד — פסילה קשיחה בהכרעה, גם כש-
            // approachAngleDiff אינו ניתן לחישוב (קו-הייחוס בתחנת-מוצא).
            oppositeDirection: f.refBj < f.refBi,
            // שער-כיווניות: true כשנבחר *רק* קו-ייחוס מכיוון-כניסה שונה (>45°),
            // כלומר אין אף קו שחולק את וקטור-הכניסה למקטע — לא ניתן להשוואה.
            approachIncompatible: !!f.approachIncompatible,
            // הלוך-חזור / תחנה כפולה (A→B→A): סורקים *אך ורק* בתוך גבולות המקטע
            // ומעט אחרי B (p..q+1) — לעולם לא לפני תחנה A. כל מה שקרה לפני A הוא
            // "שטח מת" (תמרון/גישה לצומת) ואין לכלול אותו בזיהוי הלולאה. כך לולאה
            // תיספר רק אם הקו באמת חוזר לאותו כביש *בתוך* המקטע הנבדק.
            uTurnRevisit: (() => {
              const lo = p, hi = Math.min(L.stops.length - 1, q + 1);
              const seen = new Map();
              for (let i = lo; i <= hi; i++) {
                const id = L.stops[i].id;
                if (seen.has(id)) return L.stops[i].name; // שם התחנה שחוזרת
                seen.set(id, i);
              }
              return null;
            })(),
            lineRoadKm: f.roadA, refNumber: f.ref.number, refRoadKm: f.roadB,
            excessKm: f.excess, ratio: f.ratio,
            // מרחק בין נקודות-המוצא של שני הקווים (שער 0 — נקודת מוצא משותפת).
            originDistanceKm: (L.stops[0] && f.ref.stops[0]) ? haversine(L.stops[0], f.ref.stops[0]) : null,
            crowKm: haversine(L.stops[p], L.stops[q]), stopsBetween: 0,
            // תמרון כניסה לצומת: A ו-B כמעט באותה נקודה (≤80 מ' אווירי) — כל
            // ה"עודף" הוא גאומטריית הפנייה/הכניסה לצומת ברדיוס ~50 מ', לא נסיעה
            // מסביב. במצב כזה יחס-המרחק חסר משמעות (מקטע קצרצר) ⇒ גישה לגיטימית.
            junctionApproach: haversine(L.stops[p], L.stops[q]) <= 0.08 && f.excess <= 0.15,
          }, buildGeoDiag(L, p, q, f.ref, lines)),
        });
      }
      finalizeLine(L);
    }
  }

  function summarize(city) {
    city.lines.sort((a, b) => b.wasted - a.wasted);
    const flagged = city.lines.filter((l) => l.redundantCount > 0);
    city.flagged = flagged;
    city.totalLines = city.lines.length;
    city.flaggedCount = flagged.length;
    city.totalWasted = city.lines.reduce((s, l) => s + l.wasted, 0);
    city.gapTotal = city.lines.reduce((s, l) => s + l.gapCount, 0);
    city.detourTotal = city.lines.reduce((s, l) => s + (l.detourCount || 0), 0);
    city.loopTotal = city.lines.reduce((s, l) => s + (l.loopCount || 0), 0);
    city.loopLineCount = city.lines.filter((l) => (l.loopCount || 0) > 0).length;
    city.spurTotal = city.lines.reduce((s, l) => s + (l.spurCount || 0), 0);
    city.worstLine = flagged[0] || null;
    return city;
  }

  // מנקה "מחטים" (needles) מפוליגון shape גולמי: שגיאת-דיגיטציה נפוצה ב-GTFS
  // שבה הקו יוצא לנקודה וחוזר כמעט בדיוק לאותו מקום (P[i-1] ≈ P[i+1]), ויוצר
  // דקירה דקיקה חסרת-שטח. מחט כזו מנפחת מדידת-מרחק ומבלבלת את הצמדת-התחנות
  // (היה הבאג בקו 500: מחט של ~75מ' ליד "ישראל טל/המסגר" → המקטע נמדד 640מ'
  // במקום 476מ' והתחנה הוצמדה ל-35מ' במקום 7מ'). שמרני בכוונה: מסיר נקודה רק
  // כשנקודת-החזרה צמודה למוצא (≤30% מאורך הדקירה) והדקירה בטווח 15–250מ' — כך
  // לולאות-כביש אמיתיות (שאינן חוזרות לנקודת-המוצא) נשמרות במלואן.
  function despikeShape(pts) {
    if (!pts || pts.length < 3) return pts;
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
      const ab = haversine({ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] });
      const bc = haversine({ lat: b[0], lng: b[1] }, { lat: c[0], lng: c[1] });
      const ac = haversine({ lat: a[0], lng: a[1] }, { lat: c[0], lng: c[1] });
      if (ab >= 0.015 && ab <= 0.25 && ac < 0.30 * (ab + bc)) continue; // מחט → השמטה
      out.push(b);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  // מצמיד כל תחנה למיקומה לאורך מסלול ה-shape (הטלה, לא קודקוד קרוב), בצורה
  // מונוטונית ועמידה ללולאות — ומחזיר גם פוליגון מדויק לכל מקטע בין תחנות.
  function snapStopsToShape(stops, shape) {
    if (!shape || shape.length < 2) return null;
    // מרחק מצטבר לאורך ה-shape
    // מרחק מצטבר לאורך ה-shape — קירוב מישורי מהיר (בלי trig לכל נקודה).
    // cos(lat) קבוע סביב מרכז ה-shape; מספיק מדויק למרחקים מקומיים.
    const kxc = 111.32 * Math.cos(shape[0][0] * Math.PI / 180), kyc = 110.57;
    const cum = [0];
    for (let i = 1; i < shape.length; i++) {
      const dlat = (shape[i][0] - shape[i - 1][0]) * kyc;
      const dlng = (shape[i][1] - shape[i - 1][1]) * kxc;
      cum[i] = cum[i - 1] + Math.sqrt(dlat * dlat + dlng * dlng);
    }
    const total = cum[cum.length - 1];

    // הצמדה מונוטונית בשני-מצביעים: לכל תחנה סורקים את ה-shape *קדימה* החל
    // ממיקום התחנה הקודמת, שומרים את ההטלה הקרובה ביותר, ועוצרים רק אחרי
    // שעברנו מרחק-נסיעה משמעותי (LOOKAHEAD) מעבר לנקודה הטובה ביותר בלי שיפור.
    // כך כל מקטע-shape נסרק ~פעם אחת בסך הכול (O(shape) לכל קו) — מהיר — בלי
    // החלון הקשיח שגרם ל-cascade והצמיד תחנות לאינדקסים שגויים. הסף נמדד לפי
    // ק"מ אמיתיים על ה-shape, כך שגם עיקופים/פערים גדולים בין תחנות נתפסים.
    // הצמדה מונוטונית בשני-מצביעים: לכל תחנה סורקים את ה-shape *קדימה* מ-jSeg.
    // עוצרים רק כשמצאנו הטלה *קרובה באמת* (≤NEAR מ') לתחנה ועברנו מעט מעבר לה —
    // זה מבטיח שלא נעצר על נקודה "קרובה-למדי" בתחילת לולאה (שגרם לקריסת לולאות
    // ולתקלות הפוכות), אלא נמשיך לסרוק עד נקודת המעבר האמיתית של התחנה גם אם
    // היא אחרי לולאה ארוכה. קו רגיל (תחנה על ה-shape) נעצר מיד → O(shape) לקו.
    // CAP קשיח מונע סריקת מסלול בין-עירוני שלם כשתחנה רחוקה מה-shape (רעש GPS).
    const pos = []; // {along, seg, t}
    let jSeg = 0;
    const ky = 110.57; // ק"מ למעלת-lat
    const NEAR2 = 0.04 * 0.04; // "ודאי": ≤40מ' (בק"מ²)
    // תקרת-בטיחות לסריקה קדימה כשאין הצמדה "ודאית". חייבת לגשר על *הפער הגדול
    // ביותר בין שתי תחנות עוקבות* לאורך ה-shape — בקווים בין-עירוניים הפער מגיע
    // ל-60–70 ק"מ (למשל ירושלים→מחלף בצפון). ערך נמוך מדי (היה 15) גרם לקריסת-
    // הצמדה מצטברת בכל החצי הצפוני של הקו: כל התחנות "נתקעות" בנקודת-shape
    // מוקדמת אחת → גאומטריה מנוונת (קו ירוק מרחף) ומדידת-מרחק שגויה (עיקוף-שווא).
    // 200 ק"מ מכסה כל פער-תחנות סביר בישראל; ההצמדה ה"ודאית" (≤40מ') ממילא עוצרת
    // מוקדם לרוב התחנות, כך שאין עלות-ביצועים מורגשת בקווים עירוניים.
    const CAP_KM = 200;
    for (let s = 0; s < stops.length; s++) {
      const st = stops[s];
      const plat = st.lat, plng = st.lng;
      const kx = 111.32 * Math.cos(plat * Math.PI / 180); // ק"מ למעלת-lng (קבוע לתחנה)
      let best = null;
      for (let i = jSeg; i < shape.length - 1; i++) {
        const sa = shape[i], sb = shape[i + 1];
        const ax = (sa[1] - plng) * kx, ay = (sa[0] - plat) * ky;
        const bx = (sb[1] - plng) * kx, by = (sb[0] - plat) * ky;
        const dx = bx - ax, dy = by - ay;
        const len2 = dx * dx + dy * dy || 1e-12;
        let t = -(ax * dx + ay * dy) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = ax + t * dx, cy = ay + t * dy;
        const d2 = cx * cx + cy * cy; // ק"מ²
        if (!best || d2 < best.d2) {
          const along = cum[i] + t * (cum[i + 1] - cum[i]);
          best = { d2, seg: i, t, along };
        }
        // עצירה רק על הצמדה ודאית (ולאחר שעברנו מעט) — או בתקרת הבטיחות.
        if ((best.d2 < NEAR2 && i > best.seg) || cum[i] - cum[best.seg] > CAP_KM) break;
      }
      if (!best) {
        const i = shape.length - 2;
        best = { d2: 0, seg: i, t: 1, along: cum[cum.length - 1] };
      }
      pos.push(best);
      jSeg = best.seg; // המצביע מתקדם קדימה בלבד (סדר נסיעה)
    }

    // אינדקס נקודת-ה-shape הקרובה ביותר לכל תחנה — *ללא* אילוץ מונוטוני (סריקה
    // גלובלית). משמש לזיהוי "היפוך-סדר": כשתחנה עוקבת B קרובה לנקודת-shape
    // שלפני זו של A, ה-shape חוצה את עצמו והתחנות יושבות עליו בסדר הפוך לסדר
    // הנסיעה (אשכול תחנות צפוף על אותו רחוב בקו מעגלי). במצב כזה ההצמדה
    // המונוטונית נאלצת "לקפוץ" קדימה סביב הלולאה ולנפח את המקטע — ולכן מקטע כזה
    // אינו אמין לזיהוי עיקוף. נסרק בזול (קרבת-קודקוד, לא הטלה).
    const gnear = new Array(stops.length);
    for (let s = 0; s < stops.length; s++) {
      const plat = stops[s].lat, plng = stops[s].lng;
      const kx = 111.32 * Math.cos(plat * Math.PI / 180);
      let bi = 0, bd = Infinity;
      for (let i = 0; i < shape.length; i++) {
        const dy = (shape[i][0] - plat) * ky, dx = (shape[i][1] - plng) * kx;
        const d2 = dy * dy + dx * dx;
        if (d2 < bd) { bd = d2; bi = i; }
      }
      gnear[s] = bi;
    }

    // נקודת-ההטלה המדויקת של כל תחנה על ה-shape (הקואורדינטה שבה הקו *באמת*
    // מגיע לתחנה לאורך מסלולו) — משמשת כקצה-החיתוך המדויק של המקטע.
    const projOf = (P) => {
      const sa = shape[P.seg], sb = shape[P.seg + 1];
      return [sa[0] + P.t * (sb[0] - sa[0]), sa[1] + P.t * (sb[1] - sa[1])];
    };

    // בניית פוליגון לכל מקטע — חתוך *בדיוק* מנקודת ההטלה של תחנה A ועד נקודת
    // ההטלה של תחנה B. כל מה שלפני A (תמרון/פנייה/גישה לצומת) הוא "שטח מת" שאינו
    // נכלל במדידה או בציור — המדידה מתחילה רק מהרגע שהקו פוגע בתחנה A.
    const segs = [], roadDist = [];
    for (let k = 0; k < stops.length - 1; k++) {
      const A = pos[k], B = pos[k + 1];
      let a = A.seg, b = B.seg;
      const pa = projOf(A), pb = projOf(B);
      const poly = [pa]; // קצה-חיתוך מדויק בתחנה A (לא מטר לפניה)
      if (b >= a) {
        for (let i = a + 1; i <= b; i++) poly.push([shape[i][0], shape[i][1]]);
      }
      poly.push(pb); // קצה-חיתוך מדויק בתחנה B
      segs.push(poly.length > 1 ? poly : null);
      // מרחק = הפרש מיקום לאורך ה-shape (עמיד יותר מאורך הפוליגון)
      let d = B.along - A.along;
      if (!(d > 0)) d = haversine(stops[k], stops[k + 1]);
      roadDist.push(d);
    }
    // מיקום-הצמדה לכל תחנה (נקודת-הטלה על ה-shape + אינדקס-מקטע + מרחק-לאורך).
    // נשמר על הקו (_snap) כדי שאפשר יהיה לחתוך את ה-shape הגולמי בין *כל* שתי
    // תחנות בצורה עמידה — גם כשמקטע _geom בודד יצא מנוון (הצמדה לא-מונוטונית).
    const posOut = pos.map((P, i) => ({ seg: P.seg, t: P.t, along: P.along, proj: projOf(P), gnear: gnear[i], gnearAlong: cum[gnear[i]] }));
    return { segs, roadDist, pos: posOut };
  }

  function analyzeCity(cityName, opt) {
    const c = CITIES[cityName];
    if (!c) return null;
    const minExcess = (opt && opt.minExcess) || 0.3;
    const lines = c.lines.map(buildLine);
    // הצמדה למסלול המדויק (shapes.txt) — מציירים ומודדים לפיו
    let anyShape = false;
    for (const L of lines) {
      if (L.shape && L.shape.length > 1) {
        L.shape = despikeShape(L.shape); // ניקוי מחטים לפני הצמדה ומדידה
        const r = snapStopsToShape(L.stops, L.shape);
        if (r) { L._geom = r.segs; L._roadDist = r.roadDist; L._snap = r.pos; anyShape = true; }
      }
    }
    const city = {
      name: cityName, key: c.key, center: c.center, zoom: c.zoom, lines, _minExcess: minExcess,
    };
    if (anyShape) {
      // מדידה לפי הכביש האמיתי, ואז זיהוי+סיכום — פעם אחת בלבד.
      return applyRoadDistances(city);
    }
    // אין shape — זיהוי לפי קו אווירי בלבד
    detectCrossRef(lines);
    return summarize(city);
  }

  // ===========================================================================
  // גלאי לולאה-עצמית — "סיבוב מיותר" (הקפת כיכר / טיפה)
  // ---------------------------------------------------------------------------
  // סורק כל מקטע _geom וסופר כמה פעמים *כיוון-הנסיעה* הסתובב בתוך חלון קצר. הקפת
  // כיכר מלאה = ~1 סיבוב (360°); סיבוב מיותר/כפול = ≥1.15. תמרון-מעבר רגיל או
  // עיקול-כביש = פחות. כך מבדילים "סיבוב מיותר" אמיתי (קווים 67/2/6) מ"זרוע"
  // לגיטימית או מעבר-כיכר רגיל (≤1 סיבוב). עובד על ה-_geom הגולמי — חסין לארטיפקט
  // ההצמדה של הגלאי-המוצלב (465/469): מודד את צורת הכביש עצמה.
  // ===========================================================================
  const SELFLOOP_TURNS = 1.15;   // ≥1.15 סיבובים בחלון קצר = סיבוב מיותר
  const SELFLOOP_WIN_KM = 0.25;  // חלון מרבי (250 מ') — לולאה צמודה, לא עיקול ארוך
  function maxWindowWinding(pts) {
    if (!pts || pts.length < 8) return 0;
    const cum = [0];
    for (let i = 1; i < pts.length; i++)
      cum[i] = cum[i - 1] + haversine({ lat: pts[i - 1][0], lng: pts[i - 1][1] }, { lat: pts[i][0], lng: pts[i][1] });
    const brg = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
    const cturn = [0];
    let prev = null;
    for (let i = 1; i < pts.length; i++) {
      const b = brg(pts[i - 1], pts[i]);
      let t = 0;
      if (prev != null) { let d = b - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; t = d; }
      cturn.push(cturn[i - 1] + t);
      prev = b;
    }
    let best = 0;
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        if (cum[j] - cum[i] > SELFLOOP_WIN_KM) break;
        const w = Math.abs(cturn[j] - cturn[i]);
        if (w > best) best = w;
      }
    return best / (2 * Math.PI);
  }
  const SELFLOOP_MAX_CROW = 1.0; // מקטע עירוני קצר בלבד — לא מקטע בין-עירוני (982: 86 ק"מ!)
  const SELFLOOP_MAX_KM = 0.6;   // בזבוז-לולאה סביר — לא הפרש-מסלול ענק (982: 27.6 ק"מ!)
  const SELFLOOP_REF_RATIO = 1.2; // הקו הנבדק נוסע ≥1.2× מקו-הייחוס הקצר ביותר
  function detectSelfLoops(lines) {
    // אינדקס תחנה→קווים (עם _geom) — לבדיקת-ייחוס: האם קו אחר עושה אותו סיבוב.
    const baseNum = (n) => String(n).replace(/[^0-9].*$/, "");
    const servedBy = new Map();
    for (const O of lines) {
      if (!O._geom) continue;
      for (const s of O.stops) {
        let a = servedBy.get(s.id); if (!a) { a = []; servedBy.set(s.id, a); } a.push(O);
      }
    }
    for (const L of lines) {
      if (!L._geom) continue;
      const last = L._geom.length - 1;
      let added = false;
      for (let i = 0; i < L._geom.length; i++) {
        if (i === 0 || i === last) continue;             // מקטע-קצה = תמרון-היפוך בטרמינל, לא תקלה
        const seg = L._geom[i];
        if (!seg || seg.length < 8) continue;
        const turns = maxWindowWinding(seg);
        if (turns < SELFLOOP_TURNS) continue;
        const from = L.stops[i], to = L.stops[i + 1];
        if (!from || !to) continue;
        const crowKm = haversine(from, to);
        if (crowKm > SELFLOOP_MAX_CROW) continue;        // מקטע ארוך (בין-עירוני) — לא לולאת-כיכר
        const segKm = drawnKm(L, i, i + 1);
        const km = segKm - crowKm;                       // בזבוז = אורך-הלולאה מעבר לקו האווירי
        if (!(km > NOISE_FLOOR_KM) || km > SELFLOOP_MAX_KM) continue; // בזבוז קטן מדי / גדול מדי
        // בדיקת-ייחוס (חובה — לב הכלל): מסמנים סיבוב מיותר *רק* אם קיים קו-ייחוס
        // אחר ששירת את אותן שתי תחנות ונוסע ביניהן דרך *קצרה יותר* (יחס ≥1.2).
        // קו-הייחוס הוא ההוכחה מהשטח שאפשר לעבור את הקטע קצר — והקו הנבדק מקיף
        // לחינם. כיכר *לבדה* (בלי קו אחר שעובר אותה קצר) אינה תקלה. (קו 70: 372 מ',
        // מול קווים 2/16 שעוברים את אותן תחנות ב-~290 מ' — יחס 1.27 → תקלה.)
        let shortestRefKm = Infinity, refLineNum = null, refLine = null, refLo = 0, refHi = 0;
        for (const O of (servedBy.get(from.id) || [])) {
          if (O === L || baseNum(O.number) === baseNum(L.number)) continue;
          const pair = adjacentStopPair(O, from.id, to.id, 2);
          if (!pair) continue;
          // ציר-כניסה לפי תחנות: קו-הייחוס חייב להגיע לתחנה הראשונה במקטע מאותה
          // תחנה-קודמת כמו הקו הנבדק. תחנה-קודמת שונה ⇒ הוא הגיע למקטע בדרך אחרת
          // (אותו זוג-תחנות אך רצף שונה) — והסיבוב נובע מכיוון-ההגעה, לא מבזבוז
          // שאפשר ליישר. (קו שמגיע מאותה תחנה-קודמת — סיבוב מיותר אמיתי — נשמר.)
          const tPrev = i - 1 >= 0 ? L.stops[i - 1] : null;
          const rPrev = pair.bi - 1 >= 0 ? O.stops[pair.bi - 1] : null;
          if (!tPrev || !rPrev || tPrev.id !== rPrev.id) continue;
          const lo = Math.min(pair.bi, pair.bj), hi = Math.max(pair.bi, pair.bj);
          // קו-ייחוס שמתחיל/מסיים את מסלולו באחת התחנות אינו מסדרון-מעבר תקף:
          // הוא עושה משם קפיצה קצרה למסוף, לא חוצה את הקטע. (קו 50 שמסיים שם מול
          // קו 14א.) פוסלים אותו כקו-ייחוס.
          if (lo === 0 || hi === O.stops.length - 1) continue;
          const refKm = drawnKm(O, lo, hi);
          if (refKm > 0 && refKm < shortestRefKm) { shortestRefKm = refKm; refLineNum = O.number; refLine = O; refLo = lo; refHi = hi; }
        }
        if (!(shortestRefKm < Infinity) || segKm / shortestRefKm < SELFLOOP_REF_RATIO) continue;
        const waste = segKm - shortestRefKm;             // בזבוז מול הקו הקצר ביותר
        // גאומטריית קו-הייחוס בין שתי התחנות (לציור הקו הירוק על המפה) — נבנית
        // מה-shape הגולמי של קו-הייחוס, חתוך בין נקודות-ההטלה (refLo→refHi), בדיוק
        // כמו בגלאי ההצלבה. בלעדיה הקו הירוק לא צויר עבור לולאות (היה חסר).
        const refGeom = (function () {
          const RL = refLine;
          if (!RL || !RL.shape || RL.shape.length < 2 || !RL._snap) return null;
          let A = RL._snap[refLo], B = RL._snap[refHi];
          if (!A || !B) return null;
          if (B.along < A.along) { const t = A; A = B; B = t; } // לפי סדר ה-shape
          const out = [A.proj];
          for (let k = A.seg + 1; k <= B.seg; k++) {
            const pt = [RL.shape[k][0], RL.shape[k][1]];
            const lastp = out[out.length - 1];
            if (!lastp || lastp[0] !== pt[0] || lastp[1] !== pt[1]) out.push(pt);
          }
          const lastp = out[out.length - 1];
          if (!lastp || lastp[0] !== B.proj[0] || lastp[1] !== B.proj[1]) out.push(B.proj);
          return out.length > 1 ? out : null;
        })();
        // סיבוב ≥1.15 שקו אחר עושה קצר — תקלה ודאית. גובר על סיווג ההצלבה (שעשוי
        // לכנות אותו "כיסוי לגיטימי"). מסירים תקלה קיימת באותו מקטע ומחליפים.
        const ex = L.issues.findIndex((x) => x.segIdx && x.segIdx[0] === i);
        if (ex >= 0) L.issues.splice(ex, 1);
        if (L.segments[i]) L.segments[i].flags.detour = true;
        L.issues.push({
          type: "selfloop", km: waste, from, to, segIdx: [i], refKm: shortestRefKm, longKm: segKm,
          refNumber: refLineNum, refSegIdx: [refLo, refHi], refGeom,
          refColor: refLine && refLine.color, severity: sevDetour(waste),
          diag: {
            kind: "selfloop", lineNumber: L.number, lineName: L.name,
            fromName: from.name, toName: to.name,
            lineRoadKm: segKm, refRoadKm: shortestRefKm, refNumber: refLineNum,
            excessKm: waste, crowKm, turns: +turns.toFixed(2), stopsBetween: 0,
          },
        });
        added = true;
      }
      if (added) finalizeLine(L);
    }
  }

  // לאחר הצמדה-לכביש (כשגאומטריה נשמרה על L._geom) — מדידה מדויקת לפי כביש.
  function applyRoadDistances(city) {
    if (!city) return city;
    for (const L of city.lines) {
      const rd = L._roadDist;
      L.roadCum = [0];
      for (const s of L.segments) {
        // מרחק כביש מהמדידה לאורך ה-shape, עם רשת ביטחון מול ניפוח
        let d = rd && rd[s.index] != null ? rd[s.index] : s.dist;
        if (d > s.dist * 6 + 0.5) d = s.dist * 6 + 0.5; // עיקוף סביר עד פי 6 מהקו האווירי
        s.roadDist = d;
        L.roadCum[s.index + 1] = L.roadCum[s.index] + d;
      }
    }
    detectCrossRef(city.lines); // גלאי מאוחד — הצלבה בין קווים (יחסי, ללא ספים אבסולוטיים)
    detectSelfLoops(city.lines); // גלאי לולאה-עצמית — סיבוב מיותר בכיכר (משלים, על ה-_geom)
    return summarize(city);
  }

  if (window.GTFS_CITIES) Object.assign(CITIES, window.GTFS_CITIES);

  window.KavBugData = {
    CITIES,
    cityNames: Object.keys(CITIES),
    haversine,
    analyzeCity,
    applyRoadDistances,
    addCity: function (name, obj) {
      CITIES[name] = obj;
      if (!window.KavBugData.cityNames.includes(name)) window.KavBugData.cityNames.push(name);
    },
  };
})();
