/* Geometry helpers for working with a lat/lon polyline (the route shape).
   Distances use an equirectangular approximation — accurate enough at city scale
   and much cheaper than full haversine for thousands of segments. */
(function () {
  const R = 6371000; // earth radius (m)
  const rad = (d) => d * Math.PI / 180;

  function metersBetween(a, b) {
    const mLat = (a[0] + b[0]) / 2;
    const x = rad(b[1] - a[1]) * Math.cos(rad(mLat));
    const y = rad(b[0] - a[0]);
    return Math.sqrt(x * x + y * y) * R;
  }

  // Precompute cumulative lengths so we can map fraction <-> position quickly.
  function polylineMetrics(latlngs) {
    const pts = latlngs.filter((p) => p && isFinite(p[0]) && isFinite(p[1]));
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + metersBetween(pts[i - 1], pts[i]));
    const total = cum[cum.length - 1] || 1;

    // local planar coords (meters) for fast nearest-point math
    const lat0 = pts.length ? rad(pts[0][0]) : 0;
    const toXY = (p) => [rad(p[1]) * Math.cos(lat0) * R, rad(p[0]) * R];
    const xy = pts.map(toXY);

    // fraction (0..1) of the nearest point on the polyline to a given lat/lon
    function locate(lat, lon) {
      if (xy.length < 2) return 0;
      const px = rad(lon) * Math.cos(lat0) * R, py = rad(lat) * R;
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
    }

    // lat/lon at a given fraction along the line
    function pointAt(frac) {
      if (pts.length === 0) return [0, 0];
      if (pts.length === 1) return pts[0].slice();
      const target = Math.max(0, Math.min(1, frac)) * total;
      let i = 1;
      while (i < cum.length && cum[i] < target) i++;
      if (i >= cum.length) return pts[pts.length - 1].slice();
      const segLen = cum[i] - cum[i - 1] || 1e-9;
      const t = (target - cum[i - 1]) / segLen;
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
              pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
    }

    // compass bearing (deg) of travel direction at a fraction — sampled over a
    // ~25 m window so it stays stable on noisy shapes.
    function bearingAt(frac) {
      const dd = Math.min(0.1, Math.max(0.0015, 25 / total));
      const a = pointAt(Math.max(0, frac - dd));
      const b = pointAt(Math.min(1, frac + dd));
      const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
      const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
      return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }

    // turn at a fraction: 'left' | 'right' | 'straight' — compares heading a fixed
    // ~70 m before vs after the point, so real junction turns are detected.
    function maneuverAt(frac) {
      const win = Math.min(0.3, Math.max(0.008, 70 / total));
      const b1 = bearingAt(Math.max(0, frac - win));
      const b2 = bearingAt(Math.min(1, frac + win));
      let d = ((b2 - b1 + 540) % 360) - 180; // -180..180, +right
      if (Math.abs(d) < 28) return 'straight';
      return d > 0 ? 'right' : 'left';
    }

    // Scan forward from fromF up to maxMeters to find the next significant turn.
    // Returns { type: 'left'|'right'|'straight', f, meters }.
    // Skips a small dead-zone right at fromF to avoid re-detecting the current position.
    function nextTurn(fromF, maxMeters) {
      if (maxMeters === undefined) maxMeters = 450;
      if (pts.length < 3) return { type: 'straight', f: fromF, meters: 0 };
      // step every ~18 m; coarser on very long routes to stay fast
      const step = Math.max(0.003, 18 / total);
      const deadZone = Math.max(step * 2, 30 / total); // skip 30 m behind current pos
      const limit = Math.min(1, fromF + maxMeters / total);
      for (let f = fromF + deadZone; f < limit; f += step) {
        const t = maneuverAt(f);
        if (t !== 'straight') {
          return { type: t, f, meters: (f - fromF) * total };
        }
      }
      return { type: 'straight', f: limit, meters: (limit - fromF) * total };
    }

    return { pts, cum, total, locate, pointAt, bearingAt, maneuverAt, nextTurn };
  }

  window.Geo = { metersBetween, polylineMetrics };
})();
