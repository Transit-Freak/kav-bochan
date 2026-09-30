// Leaflet map using operator-hosted, openly licensed raster tiles.
// Draws the route polyline, stop markers, and a live driver puck.
const { useState: useStateLM, useEffect: useEffectLM, useRef: useRefLM, useMemo: useMemoLM } = React;

function LeafletMap({ geom = [], stops = [], driverF = 0, focusStopId = null, follow = true, dark = false, compact = false, toggleBottom = 16 }) {
  const elRef = useRefLM(null);
  const mapRef = useRefLM(null);
  const layersRef = useRefLM({});
  const routeRef = useRefLM({});
  const stopRef = useRefLM([]);
  const puckRef = useRefLM(null);
  const fittedRef = useRefLM(false);
  const pausedRef = useRefLM(false);
  const [mapUnavailable, setMapUnavailable] = useStateLM(false);
  const [offCenter, setOffCenter] = useStateLM(false);

  const metrics = useMemoLM(() => window.Geo.polylineMetrics(geom), [geom]);

  // ── init map once ───────────────────────────────────────────
  useEffectLM(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { zoomControl: false, attributionControl: true, zoomSnap: 0.25 });
    map.attributionControl.setPrefix('');
    mapRef.current = map;
    map.setView([32.08, 34.78], 14);

    let streets;
    let hasWebGL = false;
    try {
      const context = document.createElement('canvas').getContext('webgl2');
      hasWebGL = !!context;
      context?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch (_) { /* unsupported device: keep route overlays usable */ }
    if (window.maplibregl && hasWebGL) {
    streets = L.maplibreGL({
      style: window.DriverMapStyle(dark),
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · <a href="https://protomaps.com">Protomaps</a>',
      interactive: false,
    }).addTo(map);
    const gl = streets.getMaplibreMap();
    gl.on('error', () => setMapUnavailable(true));
    gl.on('idle', () => setMapUnavailable(false));
    } else setMapUnavailable(true);
    layersRef.current = { streets };
    L.control.zoom({ position: 'topright' }).addTo(map);
    map.setView([32.08, 34.78], 14);

    // pause auto-follow as soon as the driver pans the map by hand
    map.on('dragstart', () => { pausedRef.current = true; setOffCenter(true); });

    const resizeTimer = setTimeout(() => map.invalidateSize(), 60);
    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);
    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(elRef.current);
    }
    return () => { clearTimeout(resizeTimer); window.removeEventListener('resize', onResize); if (ro) ro.disconnect(); map.stop(); map.remove(); mapRef.current = null; };
  }, []);

  useEffectLM(() => {
    const gl = layersRef.current.streets?.getMaplibreMap();
    if (gl) gl.setStyle(window.DriverMapStyle(dark));
  }, [dark]);

  // ── build route + stop markers when geometry changes ────────
  useEffectLM(() => {
    const map = mapRef.current; if (!map || metrics.pts.length < 2) return;
    Object.values(routeRef.current).forEach((l) => l && map.removeLayer(l));
    stopRef.current.forEach((m) => map.removeLayer(m.marker));
    stopRef.current = [];

    const casing = L.polyline(metrics.pts, { color: '#ffffff', weight: 11, opacity: 0.95, lineJoin: 'round', lineCap: 'round' }).addTo(map);
    const ahead = L.polyline(metrics.pts, { color: '#1F5EE0', weight: 6.5, opacity: 1, lineJoin: 'round', lineCap: 'round' }).addTo(map);
    const traveled = L.polyline([], { color: '#9AA6BC', weight: 6.5, opacity: 0.95, lineJoin: 'round', lineCap: 'round' }).addTo(map);
    routeRef.current = { casing, ahead, traveled };

    stops.forEach((s) => {
      if (!isFinite(s.lat) || !isFinite(s.lon)) return;
      const icon = L.divIcon({ className: 'stop-ico', html: '<span class="dot"></span>', iconSize: [18, 18], iconAnchor: [9, 9] });
      const marker = L.marker([s.lat, s.lon], { icon, keyboard: false, interactive: false }).addTo(map);
      stopRef.current.push({ marker, f: s.f != null ? s.f : metrics.locate(s.lat, s.lon), id: s.id, last: s.seq === stops.length });
    });

    const puckIcon = L.divIcon({ className: 'puck-ico', html: '<span class="ring"></span><span class="core"><svg viewBox="0 0 24 24"><path d="M12 3 L18 20 L12 16 L6 20 Z"/></svg></span>', iconSize: [40, 40], iconAnchor: [20, 20] });
    if (puckRef.current) { map.removeLayer(puckRef.current); puckRef.current = null; }
    puckRef.current = L.marker(metrics.pointAt(driverF), { icon: puckIcon, keyboard: false, interactive: false, zIndexOffset: 1000 }).addTo(map);

    fittedRef.current = false;
    if (!follow) { map.fitBounds(casing.getBounds(), { padding: [34, 34] }); fittedRef.current = true; }
    // eslint-disable-next-line
  }, [metrics, stops]);

  // ── live update: puck, traveled split, next-stop highlight ──
  useEffectLM(() => {
    const map = mapRef.current; const r = routeRef.current; if (!map || !r.ahead || metrics.pts.length < 2) return;
    const here = metrics.pointAt(driverF);

    // split polyline at driverF -> traveled (behind) vs ahead
    let idx = 0; const target = driverF * metrics.total;
    while (idx < metrics.cum.length && metrics.cum[idx] < target) idx++;
    const behind = metrics.pts.slice(0, idx).concat([here]);
    const front = [here].concat(metrics.pts.slice(idx));
    r.traveled.setLatLngs(behind);
    r.ahead.setLatLngs(front);

    if (puckRef.current) {
      puckRef.current.setLatLng(here);
      const el = puckRef.current.getElement();
      if (el) { const core = el.querySelector('.core'); if (core) core.style.transform = `rotate(${metrics.bearingAt(driverF)}deg)`; }
    }

    // next stop = first not-yet-passed
    let nextId = null;
    for (const sm of stopRef.current) { if (sm.f > driverF - 0.004) { nextId = sm.id; break; } }
    stopRef.current.forEach((sm) => {
      const el = sm.marker.getElement(); if (!el) return;
      el.classList.toggle('passed', sm.f < driverF - 0.006);
      el.classList.toggle('next', sm.id === (focusStopId || nextId));
      el.classList.toggle('last', !!sm.last);
    });

    if (follow && fittedRef.current === false) { map.setView(here, 16); fittedRef.current = true; }
    else if (follow && !pausedRef.current) { map.panTo(here, { animate: true, duration: 0.5 }); }
  }, [driverF, focusStopId, metrics, follow]);

  const recenter = () => {
    const map = mapRef.current; if (!map || !puckRef.current) return;
    pausedRef.current = false; setOffCenter(false);
    map.setView(puckRef.current.getLatLng(), Math.max(map.getZoom(), 16), { animate: true });
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={elRef} style={{ position: 'absolute', inset: 0, background: dark ? '#0c0f14' : '#e8eaed' }} />
      {/* recenter on driver */}
      {follow && offCenter && (
        <button onClick={recenter} aria-label="מרכז על הנהג" style={{
          position: 'absolute', bottom: typeof toggleBottom === 'number' ? toggleBottom + 52 : toggleBottom, insetInlineEnd: 12, zIndex: 500,
          width: 46, height: 46, borderRadius: 13, border: 'none', cursor: 'pointer',
          background: 'var(--accent, #1F5EE0)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 3px 12px rgba(0,0,0,0.3)',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
        </button>
      )}
      {mapUnavailable && <div role="status" style={{ position: 'absolute', bottom: toggleBottom, insetInlineStart: 12, zIndex: 500, background: 'var(--surface, #fff)', color: 'var(--text, #222)', padding: '6px 10px', borderRadius: 8, fontSize: 12 }}>מפת הרקע אינה זמינה</div>}

    </div>
  );
}

window.LeafletMap = LeafletMap;

