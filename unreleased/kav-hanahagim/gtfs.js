/* ───────────────────────────────────────────────────────────────
   GTFS reader — parses a real GTFS .zip entirely in the browser.

   - Unzips with the native DecompressionStream (deflate-raw); no libs.
   - Streams each .txt so multi-GB files never fully sit in memory.
   - Keeps ONE representative trip per route (+ its stop_times & shape),
     so the whole national feed stays bounded while every route is searchable.

   window.GTFSParser.parseZip(arrayBuffer, onProgress) -> feed
   window.GTFSParser.buildTripView(feed, routeId)      -> { shape, trip }
   ─────────────────────────────────────────────────────────────── */
(function () {
  const VB_W = 390, VB_H = 720, PAD = 46;

  // ── ZIP central directory (with ZIP64 support) ────────────────
  function readCentralDirectory(buf) {
    const dv = new DataView(buf);
    const u8 = new Uint8Array(buf);
    // locate End Of Central Directory (scan backwards; 0x06054b50)
    let eocd = -1;
    for (let i = dv.byteLength - 22; i >= 0 && i >= dv.byteLength - 22 - 65536; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('לא קובץ ZIP תקין (EOCD לא נמצא)');
    let count = dv.getUint16(eocd + 10, true);
    let cdStart = dv.getUint32(eocd + 16, true);

    // ZIP64: if values are maxed out, read the real ones from the ZIP64 records
    if (count === 0xFFFF || cdStart === 0xFFFFFFFF) {
      // ZIP64 EOCD locator sits 20 bytes before the EOCD
      const loc = eocd - 20;
      if (loc >= 0 && dv.getUint32(loc, true) === 0x07064b50) {
        const z64 = Number(dv.getBigUint64(loc + 8, true));
        if (dv.getUint32(z64, true) === 0x06064b50) {
          count = Number(dv.getBigUint64(z64 + 32, true));
          cdStart = Number(dv.getBigUint64(z64 + 48, true));
        }
      }
    }

    const entries = [];
    let p = cdStart;
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      let compSize = dv.getUint32(p + 20, true);
      let uncompSize = dv.getUint32(p + 24, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      let localOff = dv.getUint32(p + 42, true);
      const name = new TextDecoder('utf-8').decode(u8.subarray(p + 46, p + 46 + nameLen));

      // walk the extra field for a ZIP64 record (header id 0x0001) and pull
      // whichever 64-bit values replaced the maxed-out 32-bit ones, in order.
      const extraStart = p + 46 + nameLen;
      let ep = extraStart;
      const extraEnd = extraStart + extraLen;
      while (ep + 4 <= extraEnd) {
        const id = dv.getUint16(ep, true);
        const sz = dv.getUint16(ep + 2, true);
        if (id === 0x0001) {
          let q = ep + 4;
          if (uncompSize === 0xFFFFFFFF) { uncompSize = Number(dv.getBigUint64(q, true)); q += 8; }
          if (compSize === 0xFFFFFFFF) { compSize = Number(dv.getBigUint64(q, true)); q += 8; }
          if (localOff === 0xFFFFFFFF) { localOff = Number(dv.getBigUint64(q, true)); q += 8; }
          break;
        }
        ep += 4 + sz;
      }

      entries.push({ name: name.split('/').pop(), method, compSize, uncompSize, localOff });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return { entries, u8, dv };
  }

  // resolve where an entry's compressed bytes actually start (local header)
  function entryBytes({ u8, dv }, e) {
    const nameLen = dv.getUint16(e.localOff + 26, true);
    const extraLen = dv.getUint16(e.localOff + 28, true);
    const start = e.localOff + 30 + nameLen + extraLen;
    return u8.subarray(start, start + e.compSize);
  }

  // ── stream a stored/deflated entry as text lines ──────────────
  async function* streamRows(zip, e, onBytes) {
    const bytes = entryBytes(zip, e);
    let stream;
    if (e.method === 8) {
      stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    } else if (e.method === 0) {
      stream = new Blob([bytes]).stream();
    } else {
      throw new Error('שיטת דחיסה לא נתמכת בקובץ ' + e.name);
    }
    const reader = stream.getReader();
    const dec = new TextDecoder('utf-8');
    let buf = '', header = null, done = false, total = 0;
    while (!done) {
      const r = await reader.read();
      done = r.done;
      if (r.value) { buf += dec.decode(r.value, { stream: true }); total += r.value.length; if (onBytes) onBytes(total); }
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        let line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        if (line.charCodeAt(line.length - 1) === 13) line = line.slice(0, -1);
        if (line.charCodeAt(0) === 0xFEFF) line = line.slice(1); // strip BOM
        if (!header) { header = splitCSV(line).map((s) => s.trim()); continue; }
        if (line.length === 0) continue;
        yield rowObject(header, splitCSV(line));
      }
    }
    if (buf.length) {
      if (buf.charCodeAt(0) === 0xFEFF) buf = buf.slice(1);
      if (header) yield rowObject(header, splitCSV(buf));
    }
  }

  function rowObject(header, cells) {
    const o = {};
    for (let i = 0; i < header.length; i++) o[header[i]] = cells[i] !== undefined ? cells[i] : '';
    return o;
  }

  function splitCSV(line) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else {
        if (c === '"') q = true;
        else if (c === ',') { out.push(cur); cur = ''; }
        else cur += c;
      }
    }
    out.push(cur);
    return out;
  }

  const findEntry = (entries, name) => entries.find((e) => e.name.toLowerCase() === name);

  // ── main parse ────────────────────────────────────────────────
  async function parseZip(arrayBuffer, onProgress) {
    const prog = (phase, pct, detail) => onProgress && onProgress({ phase, pct: pct || 0, detail: detail || '' });
    prog('פותח את הקובץ', 0);
    const zip = readCentralDirectory(arrayBuffer);
    const { entries } = zip;

    const feed = {
      agencies: new Map(), routes: [], stops: new Map(),
      repTrip: new Map(),          // route_id -> { tripId, shapeId, headsign, directionId, serviceId }
      stopTimes: new Map(),        // tripId -> [{ stopId, seq, arr }]
      shapes: new Map(),           // shapeId -> [{ lat, lon, seq }]
      calendar: new Map(),
      counts: { routes: 0, stops: 0, trips: 0, shapes: 0, stopTimes: 0, agencies: 0 },
      caps: {},
      fileName: '',
    };

    const bytesProg = (e, label) => (n) => {
      if (e.uncompSize) prog(label, Math.min(0.99, n / e.uncompSize), bytesH(n) + ' / ' + bytesH(e.uncompSize));
    };

    // agency.txt
    let e = findEntry(entries, 'agency.txt');
    if (e) for await (const r of streamRows(zip, e, bytesProg(e, 'קורא מפעילים'))) {
      feed.agencies.set(r.agency_id || '_', r.agency_name || '');
      feed.counts.agencies++;
    }

    // routes.txt
    e = findEntry(entries, 'routes.txt');
    if (e) for await (const r of streamRows(zip, e, bytesProg(e, 'קורא קווים'))) {
      const id = r.route_id;
      if (!id) continue;
      // Israel MOT GTFS encodes the official route code (מק״ט) as the first
      // token of route_desc: "<makat>-<direction>-<alternative>".
      const descMakat = r.route_desc ? String(r.route_desc).split('-')[0].trim() : '';
      feed.routes.push({
        id,
        shortName: r.route_short_name || r.route_long_name || '—',
        longName: r.route_long_name || '',
        makat: descMakat || id,
        routeDesc: r.route_desc || '',
        agencyId: r.agency_id || '_',
        type: ROUTE_TYPE[r.route_type] || 'קו',
      });
    }
    feed.counts.routes = feed.routes.length;
    feed.routesById = new Map(feed.routes.map((r) => [r.id, r]));
    // attach agency display name
    feed.routes.forEach((r) => { r.agency = feed.agencies.get(r.agencyId) || feed.agencies.get('_') || ''; });

    // stops.txt
    e = findEntry(entries, 'stops.txt');
    if (e) for await (const r of streamRows(zip, e, bytesProg(e, 'קורא תחנות'))) {
      const id = r.stop_id;
      if (!id) continue;
      feed.stops.set(id, {
        name: r.stop_name || '',
        code: r.stop_code || '',
        platform: r.platform_code || '',
        lat: parseFloat(r.stop_lat), lon: parseFloat(r.stop_lon),
      });
    }
    feed.counts.stops = feed.stops.size;

    // trips.txt — keep first trip per route only
    e = findEntry(entries, 'trips.txt');
    if (e) for await (const r of streamRows(zip, e, bytesProg(e, 'קורא נסיעות'))) {
      feed.counts.trips++;
      const rid = r.route_id;
      if (!rid || feed.repTrip.has(rid)) continue;
      feed.repTrip.set(rid, {
        tripId: r.trip_id,
        shapeId: r.shape_id || '',
        headsign: r.trip_headsign || '',
        directionId: r.direction_id || '',
        serviceId: r.service_id || '',
      });
    }
    // reverse: tripId -> routeId  (only for representative trips)
    const repTripIds = new Map();
    const neededShapeIds = new Set();
    feed.repTrip.forEach((t, rid) => { repTripIds.set(t.tripId, rid); if (t.shapeId) neededShapeIds.add(t.shapeId); });

    // stop_times.txt — keep only rows of representative trips
    e = findEntry(entries, 'stop_times.txt');
    if (e) for await (const r of streamRows(zip, e, bytesProg(e, 'קורא לוחות זמנים'))) {
      feed.counts.stopTimes++;
      const tid = r.trip_id;
      if (!repTripIds.has(tid)) continue;
      let arr = feed.stopTimes.get(tid);
      if (!arr) { arr = []; feed.stopTimes.set(tid, arr); }
      arr.push({ stopId: r.stop_id, seq: +r.stop_sequence || arr.length + 1, arr: r.arrival_time || r.departure_time || '' });
    }

    // shapes.txt — keep shapes for representative trips, stored as compact flat
    // [lat, lon, lat, lon, …] arrays. Real feeds are pre-sorted by (shape_id,
    // sequence), so a few MB of points for the whole country fit comfortably.
    e = findEntry(entries, 'shapes.txt');
    const SHAPE_PT_CAP = 20000000; // safety valve only; ~320MB worst case
    let shapePts = 0, shapeCapped = false;
    if (e) for await (const r of streamRows(zip, e, bytesProg(e, 'קורא צורות מסלול'))) {
      feed.counts.shapes++;
      const sid = r.shape_id;
      if (!neededShapeIds.has(sid)) continue;
      if (shapePts >= SHAPE_PT_CAP) { shapeCapped = true; continue; }
      let arr = feed.shapes.get(sid);
      if (!arr) { arr = []; feed.shapes.set(sid, arr); }
      arr.push(+r.shape_pt_lat, +r.shape_pt_lon);
      shapePts++;
    }
    feed.caps.shapeCapped = shapeCapped;

    // calendar.txt (optional, for service days)
    e = findEntry(entries, 'calendar.txt');
    if (e) for await (const r of streamRows(zip, e)) {
      feed.calendar.set(r.service_id, r);
    }

    prog('הושלם', 1);
    return feed;
  }

  // ── build a drawable view for one route ───────────────────────
  function buildTripView(feed, routeId) {
    const route = feed.routesById.get(routeId);
    const rep = feed.repTrip.get(routeId);
    if (!rep) return null;

    let stRows = (feed.stopTimes.get(rep.tripId) || []).slice().sort((a, b) => a.seq - b.seq);
    // resolve stop coordinates + names
    let stops = stRows.map((st, i) => {
      const s = feed.stops.get(st.stopId) || {};
      return { id: st.stopId, seq: i + 1, name: s.name || st.stopId, code: s.code || '', platform: s.platform || '', lat: s.lat, lon: s.lon, time: hm(st.arr) };
    });

    // geometry: prefer shapes.txt (flat [lat,lon,…]); fall back to stop coords
    const flat = feed.shapes.get(rep.shapeId);
    let geom = [];
    if (flat && flat.length >= 4) {
      for (let i = 0; i + 1 < flat.length; i += 2) {
        if (isFinite(flat[i]) && isFinite(flat[i + 1])) geom.push([flat[i], flat[i + 1]]);
      }
    }
    if (geom.length < 2) {
      geom = stops.filter((s) => isFinite(s.lat) && isFinite(s.lon)).map((s) => [s.lat, s.lon]);
    }

    // place each stop's fraction f along the geometry (nearest-point projection)
    const metrics = window.Geo.polylineMetrics(geom);
    if (metrics.pts.length >= 2) {
      stops.forEach((s) => { s.f = (isFinite(s.lat) && isFinite(s.lon)) ? metrics.locate(s.lat, s.lon) : null; });
      let last = 0;
      stops.forEach((s) => {
        if (s.f == null || s.f < last) s.f = last + 0.0001;
        last = s.f;
        s.f = Math.min(0.999, Math.max(0.0005, s.f));
      });
    } else {
      stops.forEach((s, i) => { s.f = stops.length > 1 ? i / (stops.length - 1) : 0.5; });
    }

    const headsign = rep.headsign || (stops.length ? stops[stops.length - 1].name : route.longName) || route.longName;
    const cal = feed.calendar.get(rep.serviceId);
    return {
      shape: '',
      geom,
      totalMeters: metrics.total,
      trip: {
        routeId, tripId: rep.tripId, headsign,
        direction: rep.directionId === '1' ? 'חזור' : 'הלוך',
        makat: route.makat, departure: stops.length ? stops[0].time : '',
        serviceDays: cal ? serviceDays(cal) : '',
        stops,
      },
    };
  }

  // equirectangular projection of lat/lon -> viewBox, plus an SVG path
  // and a fractionOf(lat,lon) that returns nearest position along the polyline.
  function makeProjection(points) {
    const pts = points.filter((p) => isFinite(p.lat) && isFinite(p.lon));
    if (pts.length < 2) return null;
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const p of pts) {
      if (p.lat < minLat) minLat = p.lat; if (p.lat > maxLat) maxLat = p.lat;
      if (p.lon < minLon) minLon = p.lon; if (p.lon > maxLon) maxLon = p.lon;
    }
    const midLat = (minLat + maxLat) / 2 * Math.PI / 180;
    const kx = Math.cos(midLat) || 1;
    const w = Math.max(1e-9, (maxLon - minLon) * kx);
    const h = Math.max(1e-9, (maxLat - minLat));
    const scale = Math.min((VB_W - PAD * 2) / w, (VB_H - PAD * 2) / h);
    const offX = (VB_W - w * scale) / 2;
    const offY = (VB_H - h * scale) / 2;
    const X = (lat, lon) => offX + ((lon - minLon) * kx) * scale;
    const Y = (lat, lon) => offY + (maxLat - lat) * scale;

    // screen-space polyline + cumulative length for fraction lookups
    const xy = pts.map((p) => [X(p.lat, p.lon), Y(p.lat, p.lon)]);
    const cum = [0];
    for (let i = 1; i < xy.length; i++) {
      const dx = xy[i][0] - xy[i - 1][0], dy = xy[i][1] - xy[i - 1][1];
      cum.push(cum[i - 1] + Math.hypot(dx, dy));
    }
    const total = cum[cum.length - 1] || 1;

    // build a smooth-ish path (straight segments are fine at this scale)
    let dStr = 'M ' + xy[0][0].toFixed(1) + ' ' + xy[0][1].toFixed(1);
    const step = Math.max(1, Math.floor(xy.length / 2000)); // cap path complexity
    for (let i = step; i < xy.length; i += step) dStr += ' L ' + xy[i][0].toFixed(1) + ' ' + xy[i][1].toFixed(1);
    if ((xy.length - 1) % step !== 0) dStr += ' L ' + xy[xy.length - 1][0].toFixed(1) + ' ' + xy[xy.length - 1][1].toFixed(1);

    const fractionOf = (lat, lon) => {
      const px = X(lat, lon), py = Y(lat, lon);
      let best = Infinity, bestLen = 0;
      for (let i = 1; i < xy.length; i++) {
        const ax = xy[i - 1][0], ay = xy[i - 1][1], bx = xy[i][0], by = xy[i][1];
        const dx = bx - ax, dy = by - ay;
        const segLen2 = dx * dx + dy * dy || 1e-9;
        let t = ((px - ax) * dx + (py - ay) * dy) / segLen2;
        t = Math.max(0, Math.min(1, t));
        const cx = ax + t * dx, cy = ay + t * dy;
        const dist2 = (px - cx) * (px - cx) + (py - cy) * (py - cy);
        if (dist2 < best) { best = dist2; bestLen = cum[i - 1] + Math.sqrt(segLen2) * t; }
      }
      return bestLen / total;
    };

    return { path: dStr, fractionOf };
  }

  // ── small helpers ─────────────────────────────────────────────
  const ROUTE_TYPE = { '0': 'רכבת קלה', '1': 'מטרו', '2': 'רכבת', '3': 'אוטובוס', '4': 'מעבורת', '5': 'קרונית', '6': 'רכבל', '7': 'פוניקולר', '11': 'טרוליבוס', '12': 'מונורייל', '715': 'שירות' };
  function hm(t) {
    if (!t) return '';
    const m = t.split(':');
    if (m.length < 2) return t;
    let h = parseInt(m[0], 10) % 24;
    return String(h).padStart(2, '0') + ':' + m[1];
  }
  function bytesH(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }
  const DAY_KEYS = [['sunday', 'א'], ['monday', 'ב'], ['tuesday', 'ג'], ['wednesday', 'ד'], ['thursday', 'ה'], ['friday', 'ו'], ['saturday', 'ש']];
  function serviceDays(cal) {
    const on = DAY_KEYS.filter(([k]) => cal[k] === '1').map(([, l]) => l);
    if (on.length === 7) return 'כל ימות השבוע';
    if (on.length === 0) return '';
    return on.join('׳, ') + '׳';
  }

  window.GTFSParser = { parseZip, buildTripView };
})();
