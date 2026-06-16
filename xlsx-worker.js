// ─────────────────────────────────────────────────────────────────────
// Web Worker לפרסור קבצי XLSX
// כל לוגיקת הקריאה והעיבוד רצה בthread נפרד כדי שה-UI יישאר חי לחלוטין.
// תקשורת עם ה-main thread דרך postMessage:
//   IN:  { type: 'parse', buffer: ArrayBuffer }
//   OUT: { type: 'progress', percent: N, message: '...' }
//   OUT: { type: 'done', trips: [...], lineCitiesMap: Map }
//   OUT: { type: 'error', message: '...' }
// ─────────────────────────────────────────────────────────────────────

self.importScripts("vendor/xlsx.full.min.js");

const post = (msg) => self.postMessage(msg);
const progress = (pct, message) => post({ type: 'progress', percent: pct, message });

// ── helpers (מועתקים מ-KavPach.jsx) ───────────────────────────────────
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

const parseCity = (stopName) => {
  if (!stopName) return "";
  const s = String(stopName);
  const idx = s.indexOf(' - ');
  return idx > 0 ? s.slice(0, idx).trim() : s.split('/')[0].trim();
};

// מנרמל שם תחנה ללא סיומת כיוון, כדי ששתי תחנות משני צדי הכביש
// יתפסו לאותה נקודה פיזית. משמש כמפתח השוואה בזיהוי תאומים.
const normalizeStopName = (stopName) => {
  if (!stopName) return "";
  return String(stopName)
    .trim()
    .replace(/\s*[-\u2013\u2014]\s*\u05dc\u05db\u05d9\u05d5\u05d5\u05df\s+.*$/, '')
    .replace(/\s*[-\u2013\u2014]\s*\u05de\u05db\u05d9\u05d5\u05d5\u05df\s+.*$/, '')
    .replace(/\s*\((?:\u05d4\u05dc\u05d5\u05da|\u05d7\u05d6\u05d5\u05e8)\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
};

// ── parseBenchmark — טבלת "עלות לנוסע": קבוצת יעילות × מחוז → עלות לנוסע ─
// קוראת רק את הטבלה העליונה (8 קבוצות יעילות), עד "סכום כולל" / כותרת חוזרת.
// מחזירה אובייקט: { 'אזורי': { 'כל הארץ': 34.9, 'גוש דן': 23.9, ... }, ... }
function parseBenchmark(XLSX, sheet) {
  if (!sheet || !sheet['!ref']) return null;
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (!rows.length) return null;
  const header = (rows[0] || []).map(h => String(h).trim());
  const KNOWN = ['אזורי', 'בינעירוני ארוך', 'בינעירוני קצר', 'לילה', 'מזינים', 'עירוני תדירות גבוהה', 'עירוני תדירות נמוכה', 'תלמידים'];
  const out = {};
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const g = String(row[0] || '').trim();
    if (!g) continue;
    if (g === 'סכום כולל' || g === 'קבוצת יעילות תפעולית') break; // סוף הטבלה העליונה
    if (KNOWN.indexOf(g) === -1) continue;
    const rec = {};
    for (let c = 1; c < header.length; c++) {
      const col = header[c];
      const v = parseFloat(String(row[c]).replace(/,/g, ''));
      if (col && !isNaN(v) && v > 0) rec[col] = Number(v.toFixed(2));
    }
    out[g] = rec;
  }
  return Object.keys(out).length ? out : null;
}

// ── parseXLSX — הלוגיקה המלאה ─────────────────────────────────────────
// payload יכול להיות:
//   { buffer }                                  — קובץ יחיד (העלאה ידנית / legacy)
//   { main, schedule, stops, benchmark }        — מספר קבצים נפרדים (טעינה אוטומטית)
function parseXLSX(payload) {
  progress(8, "טוען ספריה...");

  const XLSX = self.XLSX;
  const enc = XLSX.utils.encode_cell;
  const readWB = (buf) => XLSX.read(new Uint8Array(buf), { type: "array", raw: true, cellDates: false });

  const findHeaderRow = (sheet) => {
    const range = XLSX.utils.decode_range(sheet['!ref'] || "A1");
    let bestRow = 0;
    let maxMatches = -1;
    let bestHeaders = [];
    for (let r = 0; r <= Math.min(range.e.r, 15); r++) {
      const headers = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[enc({ r, c })];
        headers.push(cell ? String(cell.v ?? "").replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim() : "");
      }
      let matchCount = 0;
      if (headers.some(h => h.includes("מספר קו") || h === "קו")) matchCount++;
      if (headers.some(h => h.includes("שם יישוב מוצא") || h.includes("מוצא_יעד מאוחד") || h.includes("ישוב מוצא"))) matchCount += 2;
      if (headers.some(h => h.includes("ממוצע תיקופים") || h.includes("נוסעים") || h.includes("אומדן"))) matchCount++;
      if (headers.some(h => h.includes("מקט") || h.includes("מק\"ט") || h.includes("Route_Id"))) matchCount++;
      if (headers.some(h => h.includes("שעת רישוי") || h.includes("Departure_Time") || h.includes("תקופת נסיעה"))) matchCount++;
      if (matchCount > maxMatches) {
        maxMatches = matchCount;
        bestRow = r;
        bestHeaders = headers;
      }
    }
    return { rowIdx: bestRow, headers: bestHeaders, matchCount: maxMatches };
  };

  let ws = null;          // גיליון ראשי
  let schedWs = null;     // גיליון לוז (אופציונלי)
  let stopsSheet = null;  // גיליון תחנות (אופציונלי)
  let headers1 = [];
  let mainHeaderRow = 0;
  let costBenchmark = null;

  if (payload.buffer) {
    // ===== מצב קובץ-יחיד (העלאה ידנית / legacy) =====
    const wb = readWB(payload.buffer);
    progress(14, "מנתח את הקובץ...");

    const stopsSheetName = wb.SheetNames.find(n =>
      n === "ריידרשיפ תחנות" || n.includes("תחנ") || n.toLowerCase().includes("stop") ||
      n.includes("גיליון2") || n.includes("גיליון 2") || n.toLowerCase() === "sheet2"
    );

    let scheduleWsName = wb.SheetNames.find(n =>
      n.replace(/\s/g,'') === "גיליון4" || n.toLowerCase() === "sheet4" ||
      n.replace(/\s/g,'') === "גיליון3" || n.toLowerCase() === "sheet3"
    );
    if (!scheduleWsName && wb.SheetNames.length >= 4) scheduleWsName = wb.SheetNames[3];
    if (!scheduleWsName && wb.SheetNames.length >= 3) scheduleWsName = wb.SheetNames[2];

    let mainWs = null;
    let maxColsMatch = -1;
    for (const sheetName of wb.SheetNames) {
      if (sheetName === scheduleWsName || sheetName === stopsSheetName) continue;
      const sheet = wb.Sheets[sheetName];
      if (!sheet['!ref']) continue;
      const { rowIdx, headers, matchCount } = findHeaderRow(sheet);
      if (matchCount > maxColsMatch) {
        maxColsMatch = matchCount;
        mainWs = sheet;
        headers1 = headers;
        mainHeaderRow = rowIdx;
      }
    }
    if (!mainWs) {
      const fallbackName = wb.SheetNames.find(n => n !== scheduleWsName && n !== stopsSheetName);
      mainWs = wb.Sheets[fallbackName || wb.SheetNames[0]];
      const fallbackRes = findHeaderRow(mainWs);
      headers1 = fallbackRes.headers;
      mainHeaderRow = fallbackRes.rowIdx;
    }
    ws = mainWs;
    schedWs = scheduleWsName ? wb.Sheets[scheduleWsName] : null;
    stopsSheet = stopsSheetName ? wb.Sheets[stopsSheetName] : null;
  } else {
    // ===== מצב רב-קבצים: מצומצם(ראשי) + data.xlsx(לוז) + תחנות + עלות לנוסע =====
    progress(12, "קורא נתוני קווים...");
    const wbMain = readWB(payload.main);
    ws = wbMain.Sheets[wbMain.SheetNames[0]];
    const mh = findHeaderRow(ws);
    headers1 = mh.headers;
    mainHeaderRow = mh.rowIdx;

    // לוז — בוחר את הגיליון עם שעות יציאה פרטניות (שעת רישוי / שעה עגולה)
    if (payload.schedule) {
      progress(16, "קורא לוח זמנים...");
      const wbS = readWB(payload.schedule);
      let bestName = null, bestScore = -1;
      for (const n of wbS.SheetNames) {
        const s = wbS.Sheets[n];
        if (!s || !s['!ref']) continue;
        const { headers, matchCount } = findHeaderRow(s);
        const hasTime = headers.some(h => h.includes("שעת רישוי") || h.includes("שעה עגולה") || h.toLowerCase().includes("departure"));
        const score = (hasTime ? 100 : 0) + matchCount;
        if (score > bestScore) { bestScore = score; bestName = n; }
      }
      schedWs = bestName ? wbS.Sheets[bestName] : null;
    }

    // תחנות — גיליון יחיד
    if (payload.stops) {
      progress(20, "קורא תחנות...");
      const wbT = readWB(payload.stops);
      stopsSheet = wbT.Sheets[wbT.SheetNames[0]];
    }

    // עלות לנוסע — טבלת בנצ'מרק
    if (payload.benchmark) {
      const wbB = readWB(payload.benchmark);
      costBenchmark = parseBenchmark(XLSX, wbB.Sheets[wbB.SheetNames[0]]);
    }
  }

  progress(24, "מנתח את הקובץ...");
  const totalRows = XLSX.utils.decode_range(ws['!ref'] || "A1").e.r;

  const tempMakatCitiesMap = new Map();
  const tempMakatStopsMap = new Map();
  const tempMakatNormStopsMap = new Map(); // makat -> Set of normalized stop names (לזיהוי תאומים גם במקרה שצדי הכביש מקבלים Stop_id שונה)
  const tempMakatStopNamesMap = new Map(); // makat -> Map<stopId, stopName>
  if (stopsSheet) {
    const stopsRows = XLSX.utils.sheet_to_json(stopsSheet, { defval: "" });
    for (const row of stopsRows) {
      const routeId = String(
        row['Route_Full_Id'] || row['route_full_id'] || row['מקט-כיוון'] ||
        row['Route_Id']      || row['route_id']      || row['route']      || ""
      ).trim();
      if (!routeId || routeId === "undefined") continue;
      const stopName = String(row['Stop_name'] || row['stop_name'] || row['שם תחנה'] || "").trim();
      const stopId = String(row['Stop_id'] || row['stop_id'] || row['מס' + "'" + ' תחנה'] || "").trim();
      const city = parseCity(stopName);
      const normName = normalizeStopName(stopName);
      const makat = routeId.split('-')[0].replace(/^0+/, '').trim();
      if (!makat) continue;

      if (city) {
        const cityLc = city.toLowerCase();
        if (!tempMakatCitiesMap.has(makat)) tempMakatCitiesMap.set(makat, new Set());
        tempMakatCitiesMap.get(makat).add(cityLc);
      }
      if (stopId) {
        if (!tempMakatStopsMap.has(makat)) tempMakatStopsMap.set(makat, new Set());
        tempMakatStopsMap.get(makat).add(stopId);
      }
      if (normName) {
        if (!tempMakatNormStopsMap.has(makat)) tempMakatNormStopsMap.set(makat, new Set());
        tempMakatNormStopsMap.get(makat).add(normName);
      }
      if (stopId && stopName) {
        if (!tempMakatStopNamesMap.has(makat)) tempMakatStopNamesMap.set(makat, new Map());
        if (!tempMakatStopNamesMap.get(makat).has(stopId)) // only first occurrence (preserves direction-1 order)
          tempMakatStopNamesMap.get(makat).set(stopId, stopName);
      }
    }
  }

  progress(48, "מעבד שורות...");

  const matchCol = (headersArr, inc, exc = []) => {
    for (let k of inc) {
      const exact = headersArr.findIndex(h => h === k);
      if (exact !== -1) return exact;
    }
    for (let k of inc) {
      const idx = headersArr.findIndex(h => h.includes(k) && !exc.some(e => h.includes(e)));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const C1 = {
    line:      matchCol(headers1, ["מספר קו", "קו"]),
    direction: matchCol(headers1, ["כיוון"]),
    origin:    matchCol(headers1, ["שם יישוב מוצא", "יישוב מוצא", "ישוב מוצא", "מוצא"], ["קוד", "תחנת"]),
    dest:      matchCol(headers1, ["שם יישוב יעד", "יישוב יעד", "ישוב יעד", "יעד"], ["קוד", "תחנת"]),
    unifiedOD: matchCol(headers1, ["מוצא_יעד מאוחד", "מוצא_יעד", "מוצא יעד", "מוצא-יעד"], ["קוד", "מקט", "מק\"ט"]),
    time:      matchCol(headers1, ["תקופת נסיעה", "שעת רישוי", "שעה"]),
    days:      matchCol(headers1, ["תקופת נסיעה", "ימי פעילות", "ימים"]),
    ridership: matchCol(headers1, ["ממוצע תיקופים לנסיעה", "ממוצע נוסעים לנסיעה", "נוסעים לנסיעה", "ממוצע תיקופים", "תיקופים", "נוסעים", "אומדן נוסעים"], ["קילומטר", "ק\"מ", "אומדן", "מירבי", "סך", "אחוז", "למרחק"]),
    peak:      matchCol(headers1, ["אומדן נוסעים (אחוזון 80)", "אומדן נוסעים", "עומס שיא", "אומדן ממשיכים בתחנת שיא", "אומדן ממשיכים", "עומס", "נוסעים בשיא"], ["לנסיעה", "ממוצע", "לקילומטר"]),
    district:  matchCol(headers1, ["מחוז"]),
    cluster:   matchCol(headers1, ["אשכול", "שם אשכול"]),
    lineType:  matchCol(headers1, ["סוג שירות", "סוג קו", "אופי שירות"]),
    uniqueness: matchCol(headers1, ["ייחודיות הקו", "ייחודיות קו", "ייחודיות", "סוג מסלול"]),
    makat:     matchCol(headers1, ["מק\"ט", "מקט", "מק''ט", "Route_Id", "route_id", "Route_Full_Id"]),
    opGroup:   matchCol(headers1, ["קבוצת יעילות תפעולית", "קבוצת יעילות"]),
    distance:  matchCol(headers1, ["אורך מסלול", "אורך", "מרחק"]),
    tripCount: matchCol(headers1, ["כמות נסיעות שבועיות", "מספר נסיעות בשבוע", "מספר נסיעות שבועיות", "נסיעות בשבוע", "מספר נסיעות"], ["מירבי", "לנסיעה"]),
    cost:      matchCol(headers1, ["עלות תפעולית לנוסע", "עלות לנוסע", "עלות", "סובסידיה"]),
    weeklyKm:  matchCol(headers1, ["ק\"מ שבועי", "קילומטר שבועי", "קמ שבועי", "נסועה"]),
    busSize:   matchCol(headers1, ["גודל אוטובוס", "גודל", "סוג רכב", "סוג אוטובוס", "תקן מינימלי לרכב"]),
    exclusive: matchCol(headers1, ["תחנות שקו זה משרת בבלעדיות", "תחנות בבלעדיות", "תחנות יחודיות", "תחנות ייחודיות", "בלעדיות"])
  };

  const cv1 = (r, cidx) => {
    if (cidx < 0) return "";
    const cell = ws[enc({ r, c: cidx })];
    return cell ? cell.v : "";
  };

  let isJoinMode = false;
  let scheduleWs = ws;
  let scheduleC = { ...C1 };
  let ws1MakatMap = new Map();
  let schedHeaderRow = mainHeaderRow;

  if (schedWs && schedWs !== ws) {
    const { rowIdx, headers: headersSched } = findHeaderRow(schedWs);
    schedHeaderRow = rowIdx;

    const CSched = {
      makat: matchCol(headersSched, ["מק\"ט", "מקט", "מק''ט", "Route_Id", "route_id", "Route_Full_Id"]),
      time: matchCol(headersSched, ["שעת רישוי", "שעה", "תקופת נסיעה", "Departure_Time"]),
      days: matchCol(headersSched, ["ימי פעילות", "ימים", "תקופת נסיעה", "Days"]),
      direction: matchCol(headersSched, ["כיוון", "Direction"]),
      ridership: matchCol(headersSched, ["אומדן נוסעים (ממוצע", "ממוצע תיקופים", "נוסעים", "אומדן נוסעים"], ["קילומטר", "ק\"מ", "למרחק"]),
      peak: matchCol(headersSched, ["אומדן ממשיכים", "עומס שיא", "עומס"]),
      tripCount: matchCol(headersSched, ["מספר נסיעות בשבוע", "מספר נסיעות", "כמות נסיעות"])
    };

    if (CSched.makat >= 0 && CSched.time >= 0) {
      isJoinMode = true;
      scheduleWs = schedWs;
      scheduleC = CSched;

      for (let r = mainHeaderRow + 1; r <= totalRows; r++) {
        const tempCluster = C1.cluster >= 0 ? String(cv1(r, C1.cluster) || "").trim() : "";
        if (tempCluster.includes("נתיב מהיר") || tempCluster.includes("נתיבים מהירים")) continue;

        const mRaw = String(cv1(r, C1.makat) || "").trim();
        if (!mRaw) continue;
        const mClean = mRaw.replace(/^0+/, '');

        let origin1 = String(cv1(r, C1.origin) || "").trim();
        let dest1 = String(cv1(r, C1.dest) || "").trim();
        const unifiedOD1 = C1.unifiedOD >= 0 ? String(cv1(r, C1.unifiedOD) || "").trim() : "";

        if (unifiedOD1) {
          if (unifiedOD1.includes('_')) {
            const parts = unifiedOD1.split('_');
            origin1 = parts[0].trim();
            dest1 = parts[1] ? parts[1].trim() : origin1;
          } else if (unifiedOD1.includes('-')) {
            const parts = unifiedOD1.split('-');
            origin1 = parts[0].trim();
            dest1 = parts[1] ? parts[1].trim() : origin1;
          } else {
            origin1 = unifiedOD1;
            dest1 = unifiedOD1;
          }
        }

        const validText = (t) => t && t !== "לא ידוע" && t !== "0";
        const existing = ws1MakatMap.get(mClean) || {};

        const finalOrigin = validText(origin1) ? origin1 : (validText(existing.origin) ? existing.origin : "לא ידוע");
        const finalDest = validText(dest1) ? dest1 : (validText(existing.dest) ? existing.dest : "לא ידוע");

        const rideRaw = parseFloat(String(cv1(r, C1.ridership)).replace(/,/g, ""));
        const peakRaw = parseFloat(String(cv1(r, C1.peak)).replace(/,/g, ""));
        const distRaw = parseFloat(String(cv1(r, C1.distance)).replace(/,/g, ""));
        const costRaw = parseFloat(String(cv1(r, C1.cost)).replace(/,/g, ""));
        const weeklyKmRaw = parseFloat(String(cv1(r, C1.weeklyKm)).replace(/,/g, ""));

        ws1MakatMap.set(mClean, {
          lineNum: existing.lineNum || String(cv1(r, C1.line) || "").trim(),
          origin: finalOrigin,
          dest: finalDest,
          district: (existing.district && existing.district !== "כללי") ? existing.district : String(cv1(r, C1.district) || "כללי").trim(),
          lineType: (existing.lineType && existing.lineType !== "עירוני") ? existing.lineType : String(cv1(r, C1.lineType) || "עירוני").trim(),
          clusterVal: existing.clusterVal || String(cv1(r, C1.cluster) || "").trim(),
          direction: existing.direction || String(cv1(r, C1.direction) || "").trim(),
          ridership: isNaN(rideRaw) ? (existing.ridership || 0) : rideRaw,
          peakLoad: isNaN(peakRaw) ? (existing.peakLoad || 0) : peakRaw,
          distance: isNaN(distRaw) || distRaw === 0 ? (existing.distance || 0) : distRaw,
          cost: isNaN(costRaw) || costRaw === 0 ? (existing.cost || 0) : costRaw,
          weeklyKm: isNaN(weeklyKmRaw) || weeklyKmRaw === 0 ? (existing.weeklyKm || 0) : weeklyKmRaw,
          isNightLine: existing.isNightLine || String(cv1(r, C1.uniqueness) || "").includes("לילה"),
          isFeedingLine: existing.isFeedingLine || String(cv1(r, C1.uniqueness) || "").includes("מזין"),
          opGroupVal: existing.opGroupVal || String(cv1(r, C1.opGroup) || "").trim(),
          uniquenessVal: existing.uniquenessVal || String(cv1(r, C1.uniqueness) || "").trim(),
          exclusiveStops: existing.exclusiveStops || (C1.exclusive >= 0 ? (parseInt(String(cv1(r, C1.exclusive) || "0").replace(/,/g,"")) || 0) : 0),
          busSize: existing.busSize || (C1.busSize >= 0 ? String(cv1(r, C1.busSize) || "").trim() : "") || "אוטובוס"
        });
      }
    }
  }

  const totalRowsSched = isJoinMode ? XLSX.utils.decode_range(scheduleWs['!ref']).e.r : totalRows;
  const cvSched = (r, cidx) => {
    if (cidx < 0) return "";
    const cell = scheduleWs[enc({ r, c: cidx })];
    return cell ? cell.v : "";
  };

  const CHUNK = 2000;  // ב-worker אפשר chunks גדולים יותר כי לא חוסם UI
  const parsed = [];
  const finalLineCitiesMap = new Map();
  const finalLineStopsMap = new Map();
  const finalLineNormStopsMap = new Map();
  const finalLineStopNamesMap = new Map();

  for (let start = schedHeaderRow + 1; start <= totalRowsSched; start += CHUNK) {
    const end = Math.min(start + CHUNK - 1, totalRowsSched);

    for (let r = start; r <= end; r++) {
      let makatVal = String(cvSched(r, scheduleC.makat) || "").trim();
      const mClean = makatVal.replace(/^0+/, '');

      let clusterVal, lineNum, direction, origin, dest, district, lineType, ridership, peakLoad, distance, cost, weeklyKm, isNight, isEilat, isFeeding, tripCount, busSize;
      let opGroupValOut, uniquenessValOut, exclusiveStopsOut;

      let tcStr = scheduleC.tripCount >= 0 ? String(cvSched(r, scheduleC.tripCount) || "") : "";

      if (isJoinMode) {
        if (!mClean || !ws1MakatMap.has(mClean)) continue;
        const data1 = ws1MakatMap.get(mClean);

        clusterVal = data1.clusterVal;
        if (clusterVal && (clusterVal.includes("נתיב מהיר") || clusterVal.includes("נתיבים מהירים"))) continue;

        lineNum = data1.lineNum;
        direction = scheduleC.direction >= 0 ? String(cvSched(r, scheduleC.direction) || "").trim() : data1.direction;
        origin = data1.origin;
        dest = data1.dest;
        district = data1.district;
        lineType = data1.lineType;

        const rideRaw = parseFloat(String(cvSched(r, scheduleC.ridership)).replace(/,/g, ""));
        const peakRaw = parseFloat(String(cvSched(r, scheduleC.peak)).replace(/,/g, ""));
        ridership = isNaN(rideRaw) ? 0 : rideRaw;
        peakLoad = isNaN(peakRaw) ? 0 : peakRaw;

        distance = data1.distance;
        cost = data1.cost;
        weeklyKm = data1.weeklyKm;
        isNight = data1.isNightLine;
        isEilat = (origin.includes("אילת") || dest.includes("אילת")) && data1.opGroupVal.includes("בינעירוני ארוך");
        isFeeding = data1.isFeedingLine;
        busSize = data1.busSize || "אוטובוס";
        opGroupValOut = data1.opGroupVal || "";
        uniquenessValOut = data1.uniquenessVal || "";
        exclusiveStopsOut = data1.exclusiveStops || 0;

        if (scheduleC.tripCount >= 0) {
          const tRaw = Math.round(parseFloat(tcStr.replace(/,/g, "").split('[')[0]));
          tripCount = (!isNaN(tRaw) && tRaw > 0) ? tRaw : 1;
        } else {
          tripCount = 1;
        }
      } else {
        clusterVal = String(cv1(r, C1.cluster) || "").trim();
        if (clusterVal.includes("נתיב מהיר") || clusterVal.includes("נתיבים מהירים")) continue;

        lineNum = String(cv1(r, C1.line) || "").trim();
        if (!lineNum || lineNum === "undefined") continue;

        direction = String(cv1(r, C1.direction) || "").trim();

        let originVal = String(cv1(r, C1.origin) || "").trim();
        let destVal = String(cv1(r, C1.dest) || "").trim();
        const unifiedODVal = C1.unifiedOD >= 0 ? String(cv1(r, C1.unifiedOD) || "").trim() : "";

        if (unifiedODVal) {
          if (unifiedODVal.includes('_')) {
            const parts = unifiedODVal.split('_');
            originVal = parts[0].trim();
            destVal = parts[1] ? parts[1].trim() : originVal;
          } else if (unifiedODVal.includes('-')) {
            const parts = unifiedODVal.split('-');
            originVal = parts[0].trim();
            destVal = parts[1] ? parts[1].trim() : originVal;
          } else {
            originVal = unifiedODVal;
            destVal = unifiedODVal;
          }
        }

        origin = originVal || "לא ידוע";
        dest = destVal || "לא ידוע";

        district = String(cv1(r, C1.district) || "כללי").trim();
        lineType = String(cv1(r, C1.lineType) || "עירוני").trim();

        const rideRaw = parseFloat(String(cv1(r, C1.ridership)).replace(/,/g, ""));
        const peakRaw = parseFloat(String(cv1(r, C1.peak)).replace(/,/g, ""));
        ridership = isNaN(rideRaw) ? 0 : rideRaw;
        peakLoad = isNaN(peakRaw) ? 0 : peakRaw;

        const distanceRaw = parseFloat(String(cv1(r, C1.distance)).replace(/,/g, ""));
        distance = isNaN(distanceRaw) ? 0 : distanceRaw;

        const costRaw = parseFloat(String(cv1(r, C1.cost)).replace(/,/g, ""));
        cost = isNaN(costRaw) ? 0 : costRaw;

        const weeklyKmRaw = parseFloat(String(cv1(r, C1.weeklyKm)).replace(/,/g, ""));
        weeklyKm = isNaN(weeklyKmRaw) ? 0 : weeklyKmRaw;

        const uniquenessVal = String(cv1(r, C1.uniqueness) || "");
        isNight = uniquenessVal.includes("לילה");
        isFeeding = uniquenessVal.includes("קווים מזינים") || uniquenessVal.includes("מזין");
        const opGroupVal = String(cv1(r, C1.opGroup) || "").trim();
        isEilat = (origin.includes("אילת") || dest.includes("אילת")) && opGroupVal.includes("בינעירוני ארוך");
        busSize = C1.busSize >= 0 ? String(cv1(r, C1.busSize) || "אוטובוס").trim() : "אוטובוס";
        opGroupValOut = opGroupVal;
        uniquenessValOut = uniquenessVal;
        exclusiveStopsOut = C1.exclusive >= 0 ? (parseInt(String(cv1(r, C1.exclusive) || "0").replace(/,/g,"")) || 0) : 0;

        if (C1.tripCount >= 0) {
          const tRaw = Math.round(parseFloat(String(cv1(r, C1.tripCount)).replace(/,/g, "")));
          if (!isNaN(tRaw) && tRaw > 0) tripCount = tRaw;
          else tripCount = 1;
        } else {
          tripCount = 1;
        }
      }

      let timeRaw = cvSched(r, scheduleC.time);
      let parsedTime = "";
      let daysRaw = String(cvSched(r, scheduleC.days) || "").trim();

      if (tcStr.includes('[')) {
        const match = tcStr.match(/\[(.*?)\]/);
        if (match) daysRaw = match[1];
      }

      if (typeof timeRaw === 'string' && timeRaw.includes(',') && (timeRaw.includes('יום') || timeRaw.includes('מוצ'))) {
        const parts = timeRaw.split(',');
        daysRaw = parts[0].trim();
        parsedTime = fmtTime(parts[1].split('-')[0].trim());
      } else {
        parsedTime = fmtTime(timeRaw);
      }

      const daysInfo = parseDays(daysRaw);
      const parsedDaysText = daysInfo.text;
      const parsedDaysList = daysInfo.list;

      if (!isJoinMode && C1.tripCount < 0 && parsedDaysList.length > 0) {
        tripCount = parsedDaysList.length;
      }

      const mins = timeToMins(parsedTime);
      const timeMins = mins !== null ? mins : 0;
      const finalTimeStr = mins !== null ? parsedTime : "כללי";

      const capacity = getCapacity(busSize);

      parsed.push({
        id: r,
        lineNum,
        makat: makatVal,
        direction,
        origin,
        dest,
        time: finalTimeStr,
        timeMins: timeMins,
        period: getPeriod(timeMins),
        days: parsedDaysText,
        daysList: parsedDaysList,
        district,
        lineType,
        ridership: Number(ridership.toFixed(2)),
        peakLoad:  Number(peakLoad.toFixed(2)),
        busSize,
        capacity,
        efficiency: Number((Math.max(ridership, peakLoad) / capacity).toFixed(2)),
        distance,
        cost,
        weeklyKm,
        isNightLine: isNight,
        isEilatPrebooked: isEilat,
        isFeedingLine: isFeeding,
        opGroup: opGroupValOut,
        uniquenessVal: uniquenessValOut,
        exclusiveStops: exclusiveStopsOut,
        tripCount
      });

      if (mClean) {
        const citiesSet = tempMakatCitiesMap.get(mClean);
        if (citiesSet) {
          finalLineCitiesMap.set(mClean, citiesSet);
          const cleanLine = lineNum.replace(/^0+/, '');
          if (cleanLine) finalLineCitiesMap.set(cleanLine, citiesSet);
        }
        const stopsSet = tempMakatStopsMap.get(mClean);
        if (stopsSet) {
          finalLineStopsMap.set(mClean, stopsSet);
          const cleanLine = lineNum.replace(/^0+/, '');
          if (cleanLine) finalLineStopsMap.set(cleanLine, stopsSet);
        }
        const normSet = tempMakatNormStopsMap.get(mClean);
        if (normSet) {
          finalLineNormStopsMap.set(mClean, normSet);
          const cleanLine = lineNum.replace(/^0+/, '');
          if (cleanLine) finalLineNormStopsMap.set(cleanLine, normSet);
        }
        const stopNamesSet = tempMakatStopNamesMap.get(mClean);
        if (stopNamesSet) {
          finalLineStopNamesMap.set(mClean, stopNamesSet);
          const cleanLineSnm = lineNum.replace(/^0+/, '');
          if (cleanLineSnm) finalLineStopNamesMap.set(cleanLineSnm, stopNamesSet);
        }
      }
    }

    const pct = 48 + Math.round((end / totalRowsSched) * 49);
    progress(Math.min(pct, 97), `נמצאו ${parsed.length.toLocaleString()} נסיעות...`);
  }

  progress(97, "מאחד נסיעות כפולות...");

  const dedupMap = new Map();
  for (let i = 0; i < parsed.length; i++) {
    const t = parsed[i];
    const key = `${t.lineNum}_${t.direction}_${t.origin}_${t.dest}_${t.timeMins}_${t.days}`;
    if (dedupMap.has(key)) {
      const existing = dedupMap.get(key);
      existing.ridership = ((existing.ridership * existing._mergeCount) + t.ridership) / (existing._mergeCount + 1);
      existing.peakLoad = ((existing.peakLoad * existing._mergeCount) + t.peakLoad) / (existing._mergeCount + 1);
      existing.efficiency = Number((Math.max(existing.ridership, existing.peakLoad) / existing.capacity).toFixed(2));
      if (!String(existing.direction).includes(String(t.direction))) {
        existing.direction = `${existing.direction}, ${t.direction}`;
      }
      existing.tripCount = Math.max(existing.tripCount, t.tripCount);
      existing._mergeCount += 1;
    } else {
      t._mergeCount = 1;
      dedupMap.set(key, t);
    }
  }

  progress(99, "מסיים...");

  const finalParsed = Array.from(dedupMap.values()).map(t => {
    t.ridership = Number(t.ridership.toFixed(2));
    t.peakLoad = Number(t.peakLoad.toFixed(2));
    delete t._mergeCount;
    return t;
  });

  return { trips: finalParsed, lineCitiesMap: finalLineCitiesMap, lineStopsMap: finalLineStopsMap, lineNormStopsMap: finalLineNormStopsMap, lineStopNamesMap: finalLineStopNamesMap, costBenchmark };
}

// ── message handler ───────────────────────────────────────────────────
self.onmessage = (e) => {
  const d = e.data || {};
  if (d.type !== 'parse') return;
  try {
    const r = parseXLSX(d);
    post({ type: 'done', trips: r.trips, lineCitiesMap: r.lineCitiesMap, lineStopsMap: r.lineStopsMap, lineNormStopsMap: r.lineNormStopsMap, lineStopNamesMap: r.lineStopNamesMap, costBenchmark: r.costBenchmark });
  } catch (err) {
    post({ type: 'error', message: err && err.message ? err.message : String(err) });
  }
};
