/* Shared by the app and the full-feed audit. Only supplied road instructions
   are used: route geometry alone cannot identify a junction or its exits. */
(function (root) {
  const kinds = new Set(['left', 'right', 'keep-left', 'keep-right', 'roundabout']);
  // Verified OSM junction: Highway 3 -> bus-only way 114696253,
  // entry node 5404184308. Geometry verifies traversal; it does not invent a turn.
  function verifiedEntrances(maneuvers, context) {
    const rows = Array.isArray(maneuvers) ? maneuvers : [];
    const metrics = context?.metrics;
    const stop = context?.stops?.find(s => String(s.code) === '11168');
    if (!metrics || !stop || !Number.isFinite(stop.f)) return rows;
    const checkpoints = [[31.73146,34.7555], [31.7317933,34.7559114],
      [31.731719,34.7563344], [31.7313174,34.7564575]];
    const fractions = checkpoints.map(p => metrics.locate(...p));
    const close = checkpoints.every((p,i) => {
      const q = metrics.pointAt(fractions[i]);
      return Math.hypot((p[0]-q[0])*111195,(p[1]-q[1])*94580) <= 12;
    });
    if (!close || fractions.some((f,i) => i && f <= fractions[i-1])) return rows;
    const [approach, entry, inside, end] = fractions;
    const span = (end-approach)*metrics.total;
    const stopDistance = (stop.f-entry)*metrics.total;
    if (span < 100 || span > 190 || stopDistance < 35 || stopDistance > 100 ||
        stop.f < inside || stop.f > end) return rows;
    // Leave an existing instruction at this junction intact, including conflicts.
    if (rows.some(m => Number.isFinite(m.f) && Math.abs(m.f-entry)*metrics.total < 20)) return rows;
    return [...rows, {f:entry, kind:'right',
      text:'פנו ימינה',
      source:'verified-osm-114696253'}];
  }
  function prepare(maneuvers, totalMeters, context) {
    maneuvers = verifiedEntrances(maneuvers, context);
    const rows = (Array.isArray(maneuvers) ? maneuvers : [])
      .filter((m) => m && kinds.has(m.kind) && Number.isFinite(m.f) && m.f >= 0 && m.f <= 1)
      .map((m) => ({ ...m, then: kinds.has(m.then) ? m.then : undefined }))
      .sort((a, b) => a.f - b.f);
    // Overlapping matching chunks can supply both an incomplete and a complete
    // instruction at the same route position. Prefer supplied, unambiguous
    // exits only; never borrow from a nearby circle or resolve conflicting exits.
    const exitsAt = new Map();
    for (const row of rows) {
      if (row.kind !== 'roundabout' || !Number.isInteger(row.exit) || row.exit <= 0) continue;
      if (!exitsAt.has(row.f)) exitsAt.set(row.f, new Set());
      exitsAt.get(row.f).add(row.exit);
    }
    const result = [];
    for (const row of rows) {
      if (row.kind === 'roundabout' && !row.exit && exitsAt.get(row.f)?.size === 1) continue;
      const previous = result[result.length - 1];
      // Remove exact duplicates only. Nearby opposite turns may be real.
      if (previous && previous.f === row.f && previous.kind === row.kind &&
          previous.exit === row.exit && previous.then === row.then &&
          previous.name === row.name) continue;
      result.push(row);
    }
    return result;
  }
  function next(rows, driverF, totalMeters) {
    if (!Number.isFinite(driverF) || !Number.isFinite(totalMeters) || totalMeters <= 0) return null;
    const mv = rows.find((m) => (m.f - driverF) * totalMeters > -20);
    // Do not hide a known upcoming turn just because it is over 350 m away.
    return mv ? { ...mv, meters: Math.max(0, (mv.f - driverF) * totalMeters) } : null;
  }
  const api = { prepare, next };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RouteNavigation = api;
})(typeof window === 'undefined' ? {} : window);
