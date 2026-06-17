#!/usr/bin/env node
// ── convert-to-json.js ─────────────────────────────────────────────────────
// מריץ פעם אחת לפני פריסה.
// קורא את קבצי ה-XLSX ומייצר JSON קומפקטי — טעינה מהירה 50× בדפדפן.
//
// הפעלה:
//   npm install xlsx          (פעם ראשונה בלבד)
//   node convert-to-json.js
//
// פלט:  data-main.json   (~0.5 MB)
//        data-schedule.json (~8 MB)
//        data-stops.json    (~3 MB)
//        data-benchmark.json (~2 KB)
// ─────────────────────────────────────────────────────────────────────────────

const XLSX = require('xlsx');
const fs   = require('fs');
const path = require('path');

const DIR = __dirname;
const FILES = {
  main:      'מצומצם.xlsx',
  schedule:  'מרחוב.xlsx',
  stops:     'תחנות.xlsx',
  benchmark: 'עלות לנוסע.xlsx',
};

// ── עזרים ────────────────────────────────────────────────────────────────────
const log  = (...a) => console.log('[convert]', ...a);
const readWB = (f) => {
  log(`קורא ${f}…`);
  const buf = fs.readFileSync(path.join(DIR, f));
  return XLSX.read(buf, { type: 'buffer', raw: true, cellDates: false });
};

const matchCol = (headers, inc, exc = []) => {
  for (const k of inc) {
    const exact = headers.findIndex(h => h === k);
    if (exact !== -1) return exact;
  }
  for (const k of inc) {
    const idx = headers.findIndex(h => h.includes(k) && !exc.some(e => h.includes(e)));
    if (idx !== -1) return idx;
  }
  return -1;
};

const findHeader = (sheet) => {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  let best = 0, bestScore = -1, bestH = [];
  for (let r = 0; r <= Math.min(range.e.r, 15); r++) {
    const h = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      h.push(cell ? String(cell.v ?? '').replace(/[\r\n]+/g, ' ').trim() : '');
    }
    let score = 0;
    if (h.some(x => x.includes('מספר קו') || x === 'קו')) score++;
    if (h.some(x => x.includes('מוצא'))) score += 2;
    if (h.some(x => x.includes('נוסעים') || x.includes('תיקופים'))) score++;
    if (h.some(x => x.includes('מקט') || x.includes('מק"ט') || x.includes('Route_Id'))) score++;
    if (h.some(x => x.includes('שעת רישוי') || x.includes('Departure'))) score++;
    if (score > bestScore) { bestScore = score; best = r; bestH = h; }
  }
  return { row: best, headers: bestH };
};

const enc = (r, c) => XLSX.utils.encode_cell({ r, c });
const cellVal = (sheet, r, c) => {
  if (c < 0) return '';
  const cell = sheet[enc(r, c)];
  return cell ? cell.v : '';
};
const num = (v) => {
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

// ── 1. מצומצם (נתוני קווים) ──────────────────────────────────────────────────
function convertMain() {
  const wb = readWB(FILES.main);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const { row: hRow, headers } = findHeader(sheet);
  const C = {
    line:      matchCol(headers, ['מספר קו', 'קו']),
    direction: matchCol(headers, ['כיוון']),
    origin:    matchCol(headers, ['שם יישוב מוצא', 'יישוב מוצא', 'ישוב מוצא', 'מוצא'], ['קוד', 'תחנת']),
    dest:      matchCol(headers, ['שם יישוב יעד', 'יישוב יעד', 'ישוב יעד', 'יעד'], ['קוד', 'תחנת']),
    unifiedOD: matchCol(headers, ['מוצא_יעד מאוחד', 'מוצא_יעד', 'מוצא יעד'], ['קוד', 'מקט', 'מק"ט']),
    district:  matchCol(headers, ['מחוז']),
    cluster:   matchCol(headers, ['אשכול', 'שם אשכול']),
    lineType:  matchCol(headers, ['סוג שירות', 'סוג קו', 'אופי שירות']),
    uniqueness:matchCol(headers, ['ייחודיות הקו', 'ייחודיות קו', 'ייחודיות', 'סוג מסלול']),
    makat:     matchCol(headers, ['מק"ט', 'מקט', "מק''ט", 'Route_Id', 'route_id', 'Route_Full_Id']),
    opGroup:   matchCol(headers, ['קבוצת יעילות תפעולית', 'קבוצת יעילות']),
    distance:  matchCol(headers, ['אורך מסלול', 'אורך', 'מרחק']),
    tripCount: matchCol(headers, ['כמות נסיעות שבועיות', 'מספר נסיעות בשבוע', 'נסיעות בשבוע'], ['מירבי', 'לנסיעה']),
    cost:      matchCol(headers, ['עלות תפעולית לנוסע', 'עלות לנוסע', 'עלות', 'סובסידיה']),
    weeklyKm:  matchCol(headers, ['ק"מ שבועי', 'קילומטר שבועי', 'קמ שבועי', 'נסועה']),
    busSize:   matchCol(headers, ['גודל אוטובוס', 'גודל', 'סוג רכב', 'תקן מינימלי לרכב']),
    exclusive: matchCol(headers, ['תחנות שקו זה משרת בבלעדיות', 'תחנות בבלעדיות', 'תחנות ייחודיות', 'בלעדיות']),
    ridership: matchCol(headers, ['ממוצע תיקופים לנסיעה', 'ממוצע נוסעים לנסיעה', 'ממוצע תיקופים', 'תיקופים', 'נוסעים'], ['קילומטר', 'ק"מ', 'אומדן', 'מירבי', 'סך', 'אחוז', 'למרחק']),
    peak:      matchCol(headers, ['אומדן נוסעים (אחוזון 80)', 'עומס שיא', 'אומדן ממשיכים בתחנת שיא', 'אומדן ממשיכים', 'עומס'], ['לנסיעה', 'ממוצע', 'לקילומטר']),
  };

  const range = XLSX.utils.decode_range(sheet['!ref']);
  const rows = [];
  for (let r = hRow + 1; r <= range.e.r; r++) {
    const mRaw = String(cellVal(sheet, r, C.makat) || '').trim();
    if (!mRaw) continue;
    const cluster = String(cellVal(sheet, r, C.cluster) || '').trim();
    if (cluster.includes('נתיב מהיר') || cluster.includes('נתיבים מהירים')) continue;

    let origin = String(cellVal(sheet, r, C.origin) || '').trim();
    let dest   = String(cellVal(sheet, r, C.dest)   || '').trim();
    const unifiedOD = C.unifiedOD >= 0 ? String(cellVal(sheet, r, C.unifiedOD) || '').trim() : '';
    if (unifiedOD) {
      const sep = unifiedOD.includes('_') ? '_' : '-';
      const parts = unifiedOD.split(sep);
      origin = parts[0].trim();
      dest   = parts[1] ? parts[1].trim() : origin;
    }

    const uniq = String(cellVal(sheet, r, C.uniqueness) || '').trim();
    rows.push([
      mRaw.replace(/^0+/, ''),                                   // 0: makat
      String(cellVal(sheet, r, C.line) || '').trim(),            // 1: lineNum
      String(cellVal(sheet, r, C.direction) || '').trim(),       // 2: direction
      origin,                                                    // 3: origin
      dest,                                                      // 4: dest
      String(cellVal(sheet, r, C.district) || 'כללי').trim(),    // 5: district
      String(cellVal(sheet, r, C.lineType) || '').trim(),        // 6: lineType
      uniq,                                                      // 7: uniqueness
      String(cellVal(sheet, r, C.opGroup) || '').trim(),         // 8: opGroup
      num(cellVal(sheet, r, C.distance)),                        // 9: distance
      Math.round(num(cellVal(sheet, r, C.tripCount))),           // 10: tripCount
      num(cellVal(sheet, r, C.cost)),                            // 11: cost
      num(cellVal(sheet, r, C.weeklyKm)),                        // 12: weeklyKm
      String(cellVal(sheet, r, C.busSize) || 'אוטובוס').trim(), // 13: busSize
      Math.round(num(cellVal(sheet, r, C.exclusive))),           // 14: exclusiveStops
      num(cellVal(sheet, r, C.ridership)),                       // 15: ridership
      num(cellVal(sheet, r, C.peak)),                            // 16: peakLoad
    ]);
  }
  log(`מצומצם: ${rows.length} שורות`);
  return rows;
}

// ── 2. מרחוב (לוח זמנים) ─────────────────────────────────────────────────────
function convertSchedule() {
  const wb = readWB(FILES.schedule);
  // בחר גיליון עם שעות יציאה
  let bestSheet = null, bestScore = -1;
  for (const name of wb.SheetNames) {
    const s = wb.Sheets[name];
    if (!s || !s['!ref']) continue;
    const { headers } = findHeader(s);
    const hasTime = headers.some(h => h.includes('שעת רישוי') || h.includes('Departure_Time'));
    const score = (hasTime ? 100 : 0) + headers.filter(h => h).length;
    if (score > bestScore) { bestScore = score; bestSheet = s; }
  }
  if (!bestSheet) { log('לא נמצא גיליון לוח זמנים'); return []; }

  const { row: hRow, headers } = findHeader(bestSheet);
  const C = {
    makat:     matchCol(headers, ['מק"ט', 'מקט', "מק''ט", 'Route_Id', 'route_id', 'Route_Full_Id']),
    time:      matchCol(headers, ['שעת רישוי', 'שעה', 'תקופת נסיעה', 'Departure_Time']),
    days:      matchCol(headers, ['ימי פעילות', 'ימים', 'תקופת נסיעה', 'Days']),
    direction: matchCol(headers, ['כיוון', 'Direction']),
    ridership: matchCol(headers, ['אומדן נוסעים (ממוצע', 'ממוצע תיקופים', 'נוסעים', 'אומדן נוסעים'], ['קילומטר', 'ק"מ', 'למרחק']),
    peak:      matchCol(headers, ['אומדן ממשיכים', 'עומס שיא', 'עומס']),
    tripCount: matchCol(headers, ['מספר נסיעות בשבוע', 'מספר נסיעות', 'כמות נסיעות']),
  };

  const fmtTime = (v) => {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number') {
      const mins = Math.round(v * 1440);
      const h = Math.floor(mins / 60) % 24;
      const m = mins % 60;
      return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    }
    const s = String(v).trim();
    return /^\d{1,2}:\d{2}/.test(s) ? s.slice(0, 5) : s;
  };
  const toMins = (t) => {
    if (!t || !t.includes(':')) return null;
    const [h, m] = t.split(':').map(Number);
    return (h > 29 || m > 59) ? null : h * 60 + m;
  };

  const enc2 = (r, c) => XLSX.utils.encode_cell({ r, c });
  const cv = (r, c) => { if (c < 0) return ''; const cell = bestSheet[enc2(r, c)]; return cell ? cell.v : ''; };
  const range = XLSX.utils.decode_range(bestSheet['!ref']);

  const rows = [];
  let skipped = 0;
  for (let r = hRow + 1; r <= range.e.r; r++) {
    const mRaw = String(cv(r, C.makat) || '').trim();
    if (!mRaw) { skipped++; continue; }
    const timeStr = fmtTime(cv(r, C.time));
    const mins = toMins(timeStr);
    const tc = Math.round(num(cv(r, C.tripCount)));
    if (!tc && tc !== 0) { skipped++; continue; }

    rows.push([
      mRaw.replace(/^0+/, ''),                            // 0: makat
      String(cv(r, C.direction) || '').trim(),            // 1: direction
      timeStr,                                            // 2: time
      mins,                                               // 3: timeMins
      String(cv(r, C.days) || '').trim(),                 // 4: days
      Math.round(num(cv(r, C.ridership)) * 10) / 10,     // 5: ridership
      Math.round(num(cv(r, C.peak))),                     // 6: peakLoad
      tc,                                                 // 7: tripCount
    ]);
  }
  log(`מרחוב: ${rows.length} שורות (דולגו ${skipped})`);
  return rows;
}

// ── 3. תחנות ──────────────────────────────────────────────────────────────────
function convertStops() {
  const wb = readWB(FILES.stops);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const parseCity = (stopName) => {
    const s = String(stopName || '');
    const idx = s.indexOf(' - ');
    return idx > 0 ? s.slice(0, idx).trim() : s.split('/')[0].trim();
  };
  const normStop = (stopName) => String(stopName || '').trim()
    .replace(/\s*[-–—]\s*לכיוון\s+.*$/, '')
    .replace(/\s*[-–—]\s*מכיוון\s+.*$/, '')
    .replace(/\s*\((הלוך|חזור)\)\s*$/, '')
    .replace(/\s+/g, ' ').trim().toLowerCase();

  const out = [];  // [makat, stopId, city, normName]
  for (const row of rows) {
    const routeId = String(
      row['Route_Full_Id'] || row['route_full_id'] || row['מקט-כיוון'] ||
      row['Route_Id']      || row['route_id']      || row['route']     || ''
    ).trim();
    if (!routeId || routeId === 'undefined') continue;
    const stopName = String(row['Stop_name'] || row['stop_name'] || row['שם תחנה'] || '').trim();
    const stopId   = String(row['Stop_id']   || row['stop_id']   || '').trim();
    const city = parseCity(stopName);
    const norm = normStop(stopName);
    const makat = routeId.split('-')[0].replace(/^0+/, '').trim();
    if (!makat) continue;
    out.push([makat, stopId, city.toLowerCase(), norm]);
  }
  log(`תחנות: ${out.length} שורות`);
  return out;
}

// ── 4. עלות לנוסע (בנצ'מרק) ──────────────────────────────────────────────────
function convertBenchmark() {
  const wb = readWB(FILES.benchmark);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!rows.length) return null;
  const header = (rows[0] || []).map(h => String(h).trim());
  const KNOWN = ['אזורי','בינעירוני ארוך','בינעירוני קצר','לילה','מזינים','עירוני תדירות גבוהה','עירוני תדירות נמוכה','תלמידים'];
  const out = {};
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const g = String(row[0] || '').trim();
    if (!g || g === 'סכום כולל' || g === 'קבוצת יעילות תפעולית') break;
    if (!KNOWN.includes(g)) continue;
    const rec = {};
    for (let c = 1; c < header.length; c++) {
      const col = header[c];
      const v = parseFloat(String(row[c]).replace(/,/g, ''));
      if (col && !isNaN(v) && v > 0) rec[col] = Number(v.toFixed(2));
    }
    out[g] = rec;
  }
  log(`בנצ'מרק: ${Object.keys(out).length} קבוצות`);
  return out;
}

// ── כתיבה ──────────────────────────────────────────────────────────────────────
function writeJSON(filename, data) {
  const out = path.join(DIR, filename);
  fs.writeFileSync(out, JSON.stringify(data));
  const kb = Math.round(fs.statSync(out).size / 1024);
  log(`כתב ${filename} — ${kb} KB`);
}

// ── הרצה ────────────────────────────────────────────────────────────────────────
(async () => {
  try {
    const mainRows = convertMain();
    writeJSON('data-main.json', mainRows);

    const schedRows = convertSchedule();
    writeJSON('data-schedule.json', schedRows);

    const stopsRows = convertStops();
    writeJSON('data-stops.json', stopsRows);

    const bench = convertBenchmark();
    writeJSON('data-benchmark.json', bench);

    log('✅ המרה הסתיימה בהצלחה!');
    log('עדכן את index.html ו-xlsx-worker.js לטעון מה-JSON החדש.');
  } catch (e) {
    console.error('[convert] שגיאה:', e.message);
    process.exit(1);
  }
})();
