/* ===========================================================================
   קו באג — Web Worker לעיבוד GTFS בתוך הדפדפן
   קורא את ה-ZIP בזרימה (fflate), מחלץ את הקווים של עיר אחת לפי תיבה גאוגרפית,
   ומחזיר מבנה נתונים זהה ל-KavBugData.CITIES — בלי שום שרת.
   הנחה: stop_times.txt מקובץ לפי trip_id (כך מפיק אותו משרד התחבורה).
   =========================================================================== */
importScripts("https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js");

const AGENCY_COLORS = {
  "אגד": "#1565c0", "אגד תעבורה": "#1565c0",
  "דן": "#1976d2", "דן בדרום": "#2b7a3d", "דן באר שבע": "#2b7a3d",
  "מטרופולין": "#9c27b0", "קווים": "#00897b", "סופרבוס": "#e64a19",
  "נתיב אקספרס": "#5e35b1", "אלקטרה אפיקים": "#c62828", "אפיקים": "#c62828",
  "כפיר": "#6d4c41", "גלים": "#0277bd", "מועצה אזורית": "#546e7a",
};
const DEFAULT_COLOR = "#5b6470";

// --- פירוק שורת CSV (עם תמיכה במרכאות) ---
function parseCSV(line) {
  if (line.indexOf('"') < 0) return line.split(","); // מסלול מהיר
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

// --- מפצל בייטים לשורות (חוצה גבולות chunk) ---
function lineSplitter(onLine) {
  let buf = "";
  const dec = new TextDecoder("utf-8");
  return function (chunk, final) {
    buf += dec.decode(chunk, { stream: !final });
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      let line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.charCodeAt(line.length - 1) === 13) line = line.slice(0, -1);
      if (line) onLine(line);
    }
    if (final && buf.length) { onLine(buf); buf = ""; }
  };
}

// --- ממיר onLine למנגנון שורות עם כותרת ---
function rowHandler(rowFn) {
  let idx = null;
  return function (line) {
    const f = parseCSV(line);
    if (idx === null) {
      idx = {};
      f.forEach((name, i) => (idx[name.trim().replace(/^\uFEFF/, "")] = i));
      return;
    }
    rowFn(f, idx);
  };
}

// --- מעבר זרימה אחד על ה-ZIP; מפעיל handlers רק לקבצים הנדרשים ---
function runUnzip(u8, handlers, onProgress) {
  return new Promise((resolve, reject) => {
    const unzip = new fflate.Unzip();
    unzip.register(fflate.UnzipInflate);
    unzip.onfile = (file) => {
      const key = Object.keys(handlers).find((k) => file.name.endsWith(k));
      if (!key) return; // לא קוראים start() => הקובץ לא מפוענח (חיסכון ענק)
      const spec = handlers[key];
      const split = lineSplitter(spec.onLine);
      file.ondata = (err, chunk, final) => {
        if (err) return reject(err);
        if (chunk && chunk.length) split(chunk, false);
        if (final) { split(new Uint8Array(0), true); if (spec.onEnd) spec.onEnd(); }
      };
      file.start();
    };
    const CHUNK = 1 << 22; // 4MB
    let off = 0;
    function pump() {
      const end = Math.min(off + CHUNK, u8.length);
      const last = end >= u8.length;
      try { unzip.push(u8.subarray(off, end), last); }
      catch (e) { return reject(e); }
      off = end;
      if (onProgress) onProgress(off / u8.length);
      if (last) resolve();
      else setTimeout(pump, 0);
    }
    pump();
  });
}

onmessage = async (e) => {
  const { buffer, bbox, cityName, minStops } = e.data;
  const u8 = new Uint8Array(buffer);
  const [minLat, minLng, maxLat, maxLng] = bbox;
  const inBox = (lat, lng) => lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
  const MIN = minStops || 3;
  const prog = (phase, pct) => postMessage({ type: "progress", phase, pct });

  try {
    // ---- מעבר 1: קבצים קטנים (תחנות, מפעילים, קווים) ----
    const stops = new Map();        // stop_id -> {name,lat,lng}
    const cityStops = new Set();    // stop_id בתוך התיבה
    const agencies = new Map();     // agency_id -> name
    const routes = new Map();       // route_id -> {number,name,agencyId}

    await runUnzip(u8, {
      "stops.txt": { onLine: rowHandler((f, ix) => {
        const lat = +f[ix["stop_lat"]], lng = +f[ix["stop_lon"]];
        if (!isFinite(lat) || !isFinite(lng)) return;
        const id = f[ix["stop_id"]];
        stops.set(id, { name: (f[ix["stop_name"]] || "").trim(), lat, lng });
        if (inBox(lat, lng)) cityStops.add(id);
      }) },
      "agency.txt": { onLine: rowHandler((f, ix) => {
        agencies.set(f[ix["agency_id"]], (f[ix["agency_name"]] || "").trim());
      }) },
      "routes.txt": { onLine: rowHandler((f, ix) => {
        routes.set(f[ix["route_id"]], {
          number: (f[ix["route_short_name"]] || "").trim(),
          name: (f[ix["route_long_name"]] || "").trim(),
          agencyId: f[ix["agency_id"]],
        });
      }) },
    }, (p) => prog("קורא תחנות וקווים", p));

    if (cityStops.size === 0) {
      postMessage({ type: "error", message: "לא נמצאו תחנות בתוך התיבה הגאוגרפית. בדקו את הגבולות." });
      return;
    }

    // ---- מעבר 2: stop_times (הקובץ הגדול), מקובץ לפי נסיעה ----
    // דדופ לפי חתימת מסלול (תחנה ראשונה|אחרונה|מספר תחנות) -> נציג אחד.
    const bySig = new Map();
    let curTrip = null, curRows = null;
    const flush = () => {
      if (!curRows || !curRows.length) return;
      let hits = 0;
      for (const r of curRows) if (cityStops.has(r[1])) hits++;
      if (hits >= MIN) {
        curRows.sort((a, b) => a[0] - b[0]);
        const ids = curRows.map((r) => r[1]);
        const sig = ids[0] + "|" + ids[ids.length - 1] + "|" + ids.length;
        const ex = bySig.get(sig);
        if (!ex || hits > ex.hits) bySig.set(sig, { trip: curTrip, hits, ids });
      }
    };
    await runUnzip(u8, {
      "stop_times.txt": {
        onLine: rowHandler((f, ix) => {
          const t = f[ix["trip_id"]];
          if (t !== curTrip) { flush(); curTrip = t; curRows = []; }
          curRows.push([+f[ix["stop_sequence"]], f[ix["stop_id"]]]);
        }),
        onEnd: flush,
      },
    }, (p) => prog("מנתח לוחות תחנות (זה החלק הארוך)", p));

    // ---- מעבר 3: trips רק עבור הנציגים -> route_id + shape_id ----
    const repTrips = new Set();
    for (const v of bySig.values()) repTrips.add(v.trip);
    const tripRoute = new Map();
    const tripShape = new Map();
    await runUnzip(u8, {
      "trips.txt": { onLine: rowHandler((f, ix) => {
        const t = f[ix["trip_id"]];
        if (!repTrips.has(t)) return;
        tripRoute.set(t, f[ix["route_id"]]);
        if (ix["shape_id"] != null) {
          const sid = (f[ix["shape_id"]] || "").trim();
          if (sid) tripShape.set(t, sid);
        }
      }) },
    }, (p) => prog("מקשר קווים", p));

    // ---- בניית קווים: נציג אחד לכל route ----
    // עדיפות ראשונה: נציג שיש לו shape (אחרת אין מסלול לצייר/לנתח — לא במצב
    // הדיווח ולא בגלאי). בין נציגים שווי-shape: הכי הרבה תחנות-בעיר (hits).
    const bestPerRoute = new Map();
    for (const entry of bySig.values()) {
      const rid = tripRoute.get(entry.trip);
      if (!rid) continue;
      const cur = bestPerRoute.get(rid);
      if (!cur) { bestPerRoute.set(rid, entry); continue; }
      const eS = tripShape.has(entry.trip) ? 1 : 0, cS = tripShape.has(cur.trip) ? 1 : 0;
      if (eS > cS || (eS === cS && entry.hits > cur.hits)) bestPerRoute.set(rid, entry);
    }

    // ---- מעבר 4: shapes.txt — המסלול המדויק (רק ל-shape_id של הנציגים) ----
    const neededShapes = new Set();
    for (const entry of bestPerRoute.values()) {
      const sid = tripShape.get(entry.trip);
      if (sid) neededShapes.add(sid);
    }
    const shapeRaw = new Map(); // shape_id -> [[seq,lat,lng], ...]
    if (neededShapes.size) {
      await runUnzip(u8, {
        "shapes.txt": { onLine: rowHandler((f, ix) => {
          const sid = f[ix["shape_id"]];
          if (!neededShapes.has(sid)) return;
          const lat = +f[ix["shape_pt_lat"]], lng = +f[ix["shape_pt_lon"]];
          if (!isFinite(lat) || !isFinite(lng)) return;
          const seq = +f[ix["shape_pt_sequence"]];
          let arr = shapeRaw.get(sid);
          if (!arr) { arr = []; shapeRaw.set(sid, arr); }
          arr.push([seq, lat, lng]);
        }) },
      }, (p) => prog("קורא מסלולים מדויקים (shapes)", p));
    }
    const shapePoly = new Map(); // shape_id -> [[lat,lng], ...] ממוין
    for (const [sid, arr] of shapeRaw) {
      arr.sort((a, b) => a[0] - b[0]);
      shapePoly.set(sid, arr.map((r) => [+r[1].toFixed(5), +r[2].toFixed(5)]));
    }

    const lines = [];
    for (const [rid, entry] of bestPerRoute) {
      const info = routes.get(rid);
      if (!info) continue;
      const pts = [];
      for (const id of entry.ids) {
        const s = stops.get(id);
        if (s) pts.push({ id, name: s.name, lat: +s.lat.toFixed(5), lng: +s.lng.toFixed(5) });
      }
      if (pts.length < 2) continue;
      const op = agencies.get(info.agencyId) || "";
      const sid = tripShape.get(entry.trip);
      const shape = sid ? (shapePoly.get(sid) || null) : null;
      lines.push({
        number: info.number,
        operator: op,
        color: AGENCY_COLORS[op] || DEFAULT_COLOR,
        name: info.name || ("קו " + info.number),
        stops: pts,
        shape,
      });
    }
    lines.sort((a, b) => (a.operator + a.number).localeCompare(b.operator + b.number, "he", { numeric: true }));

    postMessage({
      type: "done",
      cityName,
      city: {
        key: cityName,
        center: { lat: +((minLat + maxLat) / 2).toFixed(5), lng: +((minLng + maxLng) / 2).toFixed(5) },
        zoom: 12,
        lines,
      },
    });
  } catch (err) {
    postMessage({ type: "error", message: "שגיאה בעיבוד הקובץ: " + (err && err.message ? err.message : err) });
  }
};
