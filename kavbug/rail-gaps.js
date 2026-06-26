#!/usr/bin/env node
/*
 * קו באג · רכבות — איתור פערים בין לוח-הזמנים הרשמי (GTFS של משרד התחבורה) לבין
 * ה-API החי של רכבת ישראל (rail.co.il). לכל רכבת (לפי מספרה, שמופיע ב-trip_headsign
 * של ה-GTFS) משווים את *רצף-העצירות המלא* בשני המקורות, ומדווחים על תחנות שמופיעות
 * באחד ולא בשני.
 *
 * שימוש:  node rail-gaps.js <path-to-gtfs.zip> [out-prefix]
 *   ברירת-מחדל ל-out-prefix: ./rail-gaps  → יוצר rail-gaps.json ו-rail-gaps.csv
 *
 * דורש: fflate (להתקין: npm install fflate --no-save). Node 18+ (fetch מובנה).
 *
 * הערה: ה-API של רכבת ישראל חוסם קריאות-דפדפן (CORS מתיר רק את rail.co.il), אבל
 * סקריפט/Action אינם כפופים ל-CORS. ה-subscription-key הוא מפתח ציבורי המוטמע
 * באתר רכבת ישראל; אם יתחלף — יש לעדכן כאן (RAIL_KEY).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const fflate = require("fflate");

const RAIL_KEY = "5e64d66cf03f4547bcac5de2de06b566";
const RAIL_URL = "https://rail-api.rail.co.il/rjpa/api/v1/timetable/searchTrain";
const STATIONS_DATASET = "b6685ecf-2f87-4602-823e-af9790fd6aba"; // data.gov.il — "רכבת כבדה - תחנות נוסעים"

const zipPath = process.argv[2];
const outPrefix = process.argv[3] || "./rail-gaps";
if (!zipPath) { console.error("שימוש: node rail-gaps.js <gtfs.zip> [out-prefix]"); process.exit(1); }

// ---------- פענוח CSV/ZIP (זהה ל-scan-country.js) ----------
function parseCSV(line) {
  if (line.indexOf('"') < 0) return line.split(",");
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else { if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c; }
  }
  out.push(cur); return out;
}
function lineSplitter(onLine) {
  let buf = ""; const dec = new TextDecoder("utf-8");
  return function (chunk, final) {
    buf += dec.decode(chunk, { stream: !final });
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      let line = buf.slice(0, idx); buf = buf.slice(idx + 1);
      if (line.charCodeAt(line.length - 1) === 13) line = line.slice(0, -1);
      if (line) onLine(line);
    }
    if (final && buf.length) { onLine(buf); buf = ""; }
  };
}
function rowHandler(rowFn) {
  let idx = null;
  return function (line) {
    const f = parseCSV(line);
    if (idx === null) { idx = {}; f.forEach((name, i) => (idx[name.trim().replace(/^﻿/, "")] = i)); return; }
    rowFn(f, idx);
  };
}
function runUnzip(u8, handlers) {
  const unzip = new fflate.Unzip();
  unzip.register(fflate.UnzipInflate);
  unzip.onfile = (file) => {
    const key = Object.keys(handlers).find((k) => file.name.endsWith(k));
    if (!key) return;
    const spec = handlers[key];
    const split = lineSplitter(spec.onLine);
    file.ondata = (err, chunk, final) => {
      if (err) throw err;
      if (chunk && chunk.length) split(chunk, false);
      if (final) { split(new Uint8Array(0), true); if (spec.onEnd) spec.onEnd(); }
    };
    file.start();
  };
  const CHUNK = 1 << 22;
  for (let off = 0; off < u8.length; off += CHUNK) {
    const end = Math.min(off + CHUNK, u8.length);
    unzip.push(u8.subarray(off, end), end >= u8.length);
  }
}

// ---------- נרמול שמות-תחנה: הרכבת וה-GTFS קוראים לתחנות אחרת ----------
const ALIAS = {
  "באר שבע אוניברסיטה": "באר שבע צפון", "בית יהושוע": "בית יהושע", "הוד השרון סוקולוב": "הוד השרון",
  "חיפה בת גלים": "בת גלים", "חיפה חוף הכרמל": "חוף הכרמל", "חיפה מרכז השמונה": "חיפה מרכז",
  "חוצות המפרץ": "חוצות מפרץ", "כפר סבא נורדאו": "כפר סבא", "מרכזית המפרץ קו החוף לב המפ": "מרכזית המפרץ קו החוף",
  "נתבג": "נתב ג", "פתח תקווה סגולה": "סגולה", "פתח תקווה קרית אריה": "קרית אריה", "קרית מלאכי יואב": "קרית מלאכי",
  "קרית ספיר נתניה": "נתניה קרית ספיר", "ראשון לציון הראשונים": "ראשונים", "ראשון לציון משה דיין": "רשל צ משה דיין",
  "שער צומת חולון": "צומת חולון", "תל אביב אוניברסיטה": "תא אוניברסיטה", "תל אביב השלום": "השלום",
  "תל אביב סבידור מרכז": "תל אביב מרכז",
};
const norm = (s) => (s || "").replace(/קריית/g, "קרית").replace(/[''"׳״\-\/()]/g, " ").replace(/\s+/g, " ").trim();
const canon = (s) => { const n = norm(s); return ALIAS[n] || n; };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- שאילתת ה-API של רכבת ישראל לרכבת מסוימת (רצף-מלא) ----------
async function railFullStops(fromCode, toCode, hour, trainNum, codeName) {
  const body = {
    methodName: "searchTrainLuzForDateTime", fromStation: +fromCode, toStation: +toCode,
    date: new Date().toISOString().slice(0, 10), hour, systemType: "2", scheduleType: "ByDeparture",
    languageId: "Hebrew", requestLocation: '{"latitude":"0.0","longitude":"0.0"}', requestIP: "0.0.0.0",
    userAgent: "kavbug-rail", screenResolution: '{"height":768,"width":1360}', searchFromFavorites: false,
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(RAIL_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "ocp-apim-subscription-key": RAIL_KEY, origin: "https://www.rail.co.il", referer: "https://www.rail.co.il/" },
        body: JSON.stringify(body),
      });
      if (r.status === 429 || r.status >= 500) { await sleep(1500 * (attempt + 1)); continue; }
      if (!r.ok) return null;
      const j = await r.json();
      for (const t of (j.result && j.result.travels) || []) {
        // רק נסיעה *ישירה* (רכבת אחת): מונע התאמת רכבת כקטע-ביניים במסע עם מעבר —
        // שם רצף-העצירות שלה חלקי ויוצר "פער" מדומה (כמו רכבת 9701: הרצליה↔נתב"ג
        // דרך החלפה בת"א, שבה הרגל השנייה לא מכסה את הרצליה).
        if ((t.trains || []).length !== 1) continue;
        const x = t.trains[0];
        if (x.trainNumber == trainNum) {
          const full = [x.orignStation, ...(x.stopStations || []).map((s) => s.stationId), x.destinationStation];
          return full.filter((id, i) => i === 0 || id !== full[i - 1]).map((id) => canon(codeName[id] || ("?" + id)));
        }
      }
      return null; // הרכבת לא רצה היום/לא נמצאה
    } catch (e) { await sleep(1000 * (attempt + 1)); }
  }
  return null;
}

(async () => {
  const t0 = Date.now();
  console.error("קורא את ה-GTFS:", zipPath);
  const u8 = new Uint8Array(fs.readFileSync(zipPath));

  // ---- מעבר 1: routes (רכבת), stops (שם) ----
  const railRouteIds = new Set();
  const stopName = {};
  runUnzip(u8, {
    "routes.txt": { onLine: rowHandler((f, ix) => { if (f[ix["route_type"]] === "2") railRouteIds.add(f[ix["route_id"]]); }) },
    "stops.txt": { onLine: rowHandler((f, ix) => { stopName[f[ix["stop_id"]]] = f[ix["stop_name"]]; }) },
  });
  console.error("  מסלולי-רכבת:", railRouteIds.size);

  // ---- מעבר 2: trips (trip_id -> trainNumber, רק רכבת) ----
  const tripTrain = {}; const railTripIds = new Set();
  runUnzip(u8, {
    "trips.txt": { onLine: rowHandler((f, ix) => {
      if (railRouteIds.has(f[ix["route_id"]])) { const tid = f[ix["trip_id"]]; tripTrain[tid] = f[ix["trip_headsign"]]; railTripIds.add(tid); }
    }) },
  });
  console.error("  נסיעות-רכבת:", railTripIds.size);

  // ---- מעבר 3: stop_times (רק נסיעות-רכבת) ----
  const tripStops = {}; // trip_id -> [{seq,stop,time}]
  runUnzip(u8, {
    "stop_times.txt": { onLine: rowHandler((f, ix) => {
      const tid = f[ix["trip_id"]]; if (!railTripIds.has(tid)) return;
      (tripStops[tid] = tripStops[tid] || []).push({ seq: +f[ix["stop_sequence"]], stop: f[ix["stop_id"]], time: (f[ix["departure_time"]] || f[ix["arrival_time"]] || "").slice(0, 5) });
    }) },
  });
  // GTFS: trainNumber -> {names[], hour}
  const gtfsByTrain = {};
  for (const [tid, arr] of Object.entries(tripStops)) {
    arr.sort((a, b) => a.seq - b.seq);
    const num = tripTrain[tid]; if (!num) continue;
    gtfsByTrain[num] = { names: arr.map((s) => stopName[s.stop] || ("?" + s.stop)), hour: arr.length ? arr[0].time : "08:00" };
  }
  console.error("  רכבות ב-GTFS:", Object.keys(gtfsByTrain).length, "| זמן:", ((Date.now() - t0) / 1000).toFixed(1) + "ש'");

  // ---- מיפוי קוד-תחנה (ASSET_NO) -> שם, מ-data.gov.il ----
  console.error("מוריד מיפוי-תחנות מ-data.gov.il…");
  const codeName = {}; // stationId -> name
  try {
    const r = await fetch(`https://data.gov.il/api/3/action/datastore_search?resource_id=${STATIONS_DATASET}&limit=200`, { headers: { "user-agent": "kavbug-rail" } });
    const j = await r.json();
    for (const rec of (j.result && j.result.records) || []) if (rec.ASSET_NO && rec.NAME) codeName[rec.ASSET_NO] = rec.NAME;
  } catch (e) { console.error("  אזהרה: כשל בהורדת מיפוי-תחנות:", e.message); }
  console.error("  תחנות-רכבת:", Object.keys(codeName).length);
  const nameToCode = {}; for (const [code, nm] of Object.entries(codeName)) nameToCode[canon(nm)] = code;

  // ---- השוואה: לכל רכבת — שאילתה לפי המסלול-המלא שלה ----
  console.error("משווה מול ה-API החי של רכבת ישראל (רכבת אחר רכבת)…");
  const nums = Object.keys(gtfsByTrain);
  const gaps = []; let checked = 0, queried = 0;
  for (const num of nums) {
    const g = gtfsByTrain[num]; const gc = g.names.map(canon);
    const fromCode = nameToCode[gc[0]], toCode = nameToCode[gc[gc.length - 1]];
    if (!fromCode || !toCode) continue; // תחנת-קצה לא ממופה
    const railC = await railFullStops(fromCode, toCode, g.hour, num, codeName);
    await sleep(120);
    if (!railC) continue; // הרכבת לא רצה היום / לא נמצאה ב-API
    queried++;
    const R = new Set(railC), G = new Set(gc);
    const railOnly = [...R].filter((x) => !G.has(x));
    const gtfsOnly = [...G].filter((x) => !R.has(x));
    if (railOnly.length || gtfsOnly.length) {
      // המרה חזרה לשמות-תצוגה
      const disp = {}; for (const nm of Object.values(codeName)) disp[canon(nm)] = nm;
      gaps.push({ train: +num, from: g.names[0], to: g.names[g.names.length - 1], railOnly: railOnly.map((c) => disp[c] || c), gtfsOnly: gtfsOnly.map((c) => disp[c] || c) });
    }
    checked++;
    if (queried % 50 === 0) console.error("  נבדקו (מול API):", queried);
  }
  gaps.sort((a, b) => a.train - b.train);

  // ---- כתיבה ----
  const report = {
    generatedAt: new Date().toISOString(),
    sources: { gtfs: "gtfs.mot.gov.il (משרד התחבורה)", rail: "rail-api.rail.co.il (רכבת ישראל)" },
    date: new Date().toISOString().slice(0, 10),
    trainsChecked: queried,
    gapsCount: gaps.length,
    gaps,
  };
  fs.writeFileSync(outPrefix + ".json", JSON.stringify(report, null, 1));
  const esc = (s) => '"' + String(s == null ? "" : s).replace(/"/g, '""') + '"';
  const csv = ["train,from,to,railOnly,gtfsOnly"].concat(
    gaps.map((g) => [g.train, esc(g.from), esc(g.to), esc(g.railOnly.join(" | ")), esc(g.gtfsOnly.join(" | "))].join(","))
  ).join("\n");
  fs.writeFileSync(outPrefix + ".csv", "﻿" + csv);

  console.error("\n========== סיכום ==========");
  console.error("רכבות שנבדקו מול ה-API:", queried);
  console.error("רכבות עם פער:", gaps.length);
  console.error("זמן כולל:", ((Date.now() - t0) / 1000).toFixed(1) + "ש'");
  console.error("נכתב:", outPrefix + ".json ,", outPrefix + ".csv");
})();
