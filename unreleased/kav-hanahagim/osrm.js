/* Live OSRM connector — turns a GTFS route shape into real turn-by-turn
   maneuvers (including roundabout exit numbers) via an OSRM server.

   Why /route and not /match: the public demo server blocks /match ("TooBig").
   /route normally picks the fastest CAR path (wrong for a bus), BUT when fed the
   real, dense GTFS shape as many waypoints, it has no room to deviate and simply
   reproduces the bus path — verified: a real 9 km shape comes back at 9 km exactly.
   A sanity check rejects results that wandered (synthetic/off-road shapes).

   window.OSRM.maneuvers(geom, { server }) -> { ok, maneuvers:[{f,kind,exit,name,text}], ... }
*/
(function () {
  const DEFAULT_SERVER = window.DriverServices?.osrmUrl || '';

  const MOD_TURN = {
    'left': 'left', 'slight left': 'left', 'sharp left': 'left',
    'right': 'right', 'slight right': 'right', 'sharp right': 'right',
  };

  function classify(x, name) {
    const t = x.type, mod = x.modifier || '';
    if (t === 'roundabout' || t === 'rotary') {
      return { kind: 'roundabout', exit: x.exit || null, name, text: roundaboutText(x.exit, name) };
    }
    if (t === 'exit roundabout' || t === 'exit rotary') return null; // dup of enter
    const dir = MOD_TURN[mod];
    if (!dir) return null; // straight / continue / uturn — not a turn cue
    // skip trivial slight deviations on the same road (keeps the list clean)
    if ((mod === 'slight left' || mod === 'slight right') && (t === 'continue' || t === 'new name')) return null;
    return { kind: dir, exit: null, name, text: turnText(t, dir, name) };
  }

  const EXIT_HE = ['', 'הראשונה', 'השנייה', 'השלישית', 'הרביעית', 'החמישית', 'השישית'];
  function roundaboutText(exit, name) {
    const ord = EXIT_HE[exit] || ('ה־' + exit);
    return exit ? `בכיכר — צאו ביציאה ${ord}` + (name ? ` אל ${name}` : '')
      : 'בכיכר' + (name ? ` — המשיכו אל ${name}` : '');
  }
  function turnText(type, dir, name) {
    const d = dir === 'right' ? 'ימינה' : 'שמאלה';
    const lead = type === 'end of road' ? 'בסוף הדרך פנו ' : type === 'fork' ? 'הישארו ' : 'פנו ';
    const dd = type === 'fork' ? (dir === 'right' ? 'מימין' : 'משמאל') : d;
    return lead + dd + (name ? ` אל ${name}` : '');
  }

  async function maneuvers(geom, opts) {
    opts = opts || {};
    const server = (opts.server || DEFAULT_SERVER).replace(/\/+$/, '');
    if (!server) return { ok: false, reason: 'server-not-configured' };
    const metrics = window.Geo.polylineMetrics(geom || []);
    if (metrics.pts.length < 2) return { ok: false, reason: 'no-geom' };

    // sample the shape down to a dense-but-bounded set of waypoints
    const N = Math.min(95, metrics.pts.length);
    const stepN = (metrics.pts.length - 1) / (N - 1);
    const wp = [];
    for (let i = 0; i < N; i++) {
      const p = metrics.pts[Math.round(i * stepN)];
      wp.push(p[1].toFixed(6) + ',' + p[0].toFixed(6));
    }
    // waypoints=0;N-1: כל הנקודות מכוונות את המסלול, אבל רק הראשונה והאחרונה הן "עצירות" —
    // בלי זה כל נקודת ביניים מייצרת צעדי הגעה/יציאה עם כיוון, שנספרו כאן כפניות.
    const url = `${server}/route/v1/driving/${wp.join(';')}?steps=true&overview=false&waypoints=0;${wp.length - 1}`;

    let j;
    try {
      const r = await fetch(url);
      j = await r.json();
    } catch (e) { return { ok: false, reason: 'network', detail: String(e.message || e) }; }
    if (!j || j.code !== 'Ok' || !j.routes || !j.routes[0]) return { ok: false, reason: (j && j.code) || 'no-route' };

    const dist = j.routes[0].distance;
    // wander guard: if OSRM's path is far longer than the shape, the input wasn't
    // road-aligned (e.g. a synthetic demo line) — don't trust the maneuvers.
    if (dist > metrics.total * 1.45 + 500) return { ok: false, reason: 'wander', dist, shape: metrics.total };

    const out = [];
    for (const leg of j.routes[0].legs) {
      for (const st of leg.steps) {
        const m = classify(st.maneuver, st.name || '');
        if (!m) continue;
        const loc = st.maneuver.location; // [lon, lat]
        m.f = metrics.locate(loc[1], loc[0]);
        out.push(m);
      }
    }
    out.sort((a, b) => a.f - b.f);
    return { ok: true, dist, shape: metrics.total, maneuvers: out };
  }

  window.OSRM = { maneuvers, DEFAULT_SERVER };
})();

