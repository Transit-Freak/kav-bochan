// Central driving screen — real map (Leaflet) with the route, stops and a live driver puck.
const { useState: useStateMS, useEffect: useEffectMS, useRef: useRefMS, useMemo: useMemoMS } = React;

function TripHeader({ route, trip, dark, onToggleDark, onBack, osrmStatus, gpsEnabled = false }) {
  const statusColor = osrmStatus === 'ok' ? 'var(--ok)' : (osrmStatus === 'loading' || osrmStatus === 'weak') ? 'var(--warn)' : 'var(--text-dim)';
  const statusLabel = osrmStatus === 'ok' ? 'הוראות נהיגה' : osrmStatus === 'weak' ? 'הוראות חלקיות' : osrmStatus === 'loading' ? 'טוען ניווט…' : osrmStatus === 'fallback' ? 'אין הוראות פנייה' : '';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 11, padding: '10px 14px',
      background: 'var(--surface)', borderBottom: '1px solid var(--hair)', position: 'relative', zIndex: 5,
    }}>
      <button onClick={onBack} aria-label="חזרה" style={{ border: 'none', background: 'var(--chip)', width: 38, height: 38, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text)', flexShrink: 0 }}>
        <IconChevron size={20} style={{ transform: 'scaleX(-1)' }} />
      </button>
      <RouteBadge num={route.shortName} size={40} dark={dark} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 800, fontSize: 16.5, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{trip.headsign}</span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-mut)', display: 'flex', gap: 8, marginTop: 1, alignItems: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--ok)' }} />{gpsEnabled ? 'מעקב GPS' : 'תצוגה מקדימה'}
          </span>
          <span>· יציאה {trip.departure}</span>
          {statusLabel ? <span style={{ color: statusColor, fontWeight: 700 }}>· {statusLabel}</span> : null}
        </div>
      </div>
      <DayNightToggle dark={dark} onToggle={onToggleDark} />
    </div>
  );
}

const EXIT_HE = ['', 'הראשונה', 'השנייה', 'השלישית', 'הרביעית', 'החמישית'];

function ManeuverBanner({ mv }) {
  // kind: right | left | keep-right | keep-left | roundabout. "היצמדו לימין" (התפצלות, רמפה)
  // אינו "פנו ימינה" — שלמה, מחלף עד הלום 02.09. הכותרת מהטקסט המוכן כשיש.
  const side = mv.kind.endsWith('right') ? 'right' : 'left';
  const Ico = mv.kind === 'roundabout' ? IconRoundabout : side === 'right' ? IconTurnRight : IconTurnLeft;
  const m = Math.max(0, mv.meters);
  const dist = m >= 1000 ? (m / 1000).toFixed(1) + ' ק״מ' : Math.round(m / 10) * 10 + ' מ׳';
  const titleOf = (k) => k.startsWith('keep') ? (k.endsWith('right') ? 'היצמדו לימין' : 'היצמדו לשמאל') : (k.endsWith('right') ? 'פנו ימינה' : 'פנו שמאלה');
  const title = mv.kind === 'roundabout'
    ? (mv.exit ? `צאו ביציאה ${EXIT_HE[mv.exit] || 'ה־' + mv.exit} בכיכר` : 'כיכר בהמשך · מספר היציאה אינו זמין')
    // הוראה מורכבת: שתי הוראות באותה נקודה (מחלף) — "היצמדו לשמאל, ואז לימין"
    : mv.then ? `${titleOf(mv.kind)}, ואז ${titleOf(mv.then).replace(/^(היצמדו|פנו) /, '')}`
    : titleOf(mv.kind);
  return (
    <div style={{ background: 'var(--accent)', color: '#fff', borderRadius: 18, padding: '14px 16px', boxShadow: '0 8px 24px var(--accent-shadow)', pointerEvents: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Ico size={36} style={{ color: '#fff' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, opacity: 0.9 }}>בעוד {dist}</div>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15, overflowWrap: 'anywhere' }}>{title}</div>
          {(mv.street || mv.name) && <div style={{ fontSize: 14, fontWeight: 600, opacity: 0.92, marginTop: 1 }}>אל {mv.street || mv.name}</div>}
        </div>
      </div>
    </div>
  );
}

// navSource: 'ok' | 'weak' | 'none' כשההוראות הגיעו מוכנות מהשרת (data.js) — אז אין קריאה חיה ל-OSRM.
function MapScreen({ route, trip, geom, maneuvers: maneuversProp = [], navSource, uncertainSegments = [], dark, onToggleDark, onBack, startF = 0, animate = true }) {
  const [driverF, setDriverF] = useStateMS(startF);
  const [playing, setPlaying] = useStateMS(false);
  const [gpsEnabled, setGpsEnabled] = useStateMS(false);
  const [gpsStatus, setGpsStatus] = useStateMS('off');
  const gpsSpeed = useRefMS(0);
  const [screenEnabled, setScreenEnabled] = useStateMS(true);
  const [screenStatus, setScreenStatus] = useStateMS('requesting');
  const wakeLock = useRefMS(null);
  useEffectMS(() => {
    const controller = window.RouteWakeLock.create(window, setScreenStatus);
    wakeLock.current = controller;
    controller.setEnabled(true);
    return () => controller.dispose();
  }, []);
  const toggleScreen = () => {
    const enabled = !screenEnabled;
    setScreenEnabled(enabled); wakeLock.current?.setEnabled(enabled);
  };
  const [voiceEnabled, setVoiceEnabled] = useStateMS(false);
  const [speechTick, setSpeechTick] = useStateMS(0);
  useEffectMS(() => {
    if (!voiceEnabled) return;
    const timer = setInterval(() => setSpeechTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, [voiceEnabled]);
  const [voiceMessage, setVoiceMessage] = useStateMS('');
  const speech = useRefMS(null);
  const announcements = useRefMS(null);
  if (!announcements.current) announcements.current = window.RouteSpeech.tracker();
  useEffectMS(() => {
    speech.current = window.RouteSpeech.create(window, message => { setVoiceEnabled(false); setVoiceMessage(message); }, Date.now, timing => { setVoiceMessage(`משך הכריזה האחרונה: ${timing.seconds.toFixed(1)} שניות`); });
    // Voices may arrive asynchronously; query the current list again on each click.
    window.speechSynthesis?.getVoices();
    const hide = () => { if (document.visibilityState !== 'visible') { speech.current?.cancel(); setPlaying(false); } };
    document.addEventListener('visibilitychange', hide);
    return () => { document.removeEventListener('visibilitychange', hide); speech.current?.cancel(); };
  }, []);
  const toggleVoice = () => {
    if (voiceEnabled) { speech.current.cancel(); setVoiceEnabled(false); setVoiceMessage(''); return; }
    if (!speech.current?.supported) { setVoiceMessage('הדפדפן אינו תומך בכריזה.'); return; }
    if (speech.current.speak('כריזת פניות הופעלה')) { setVoiceEnabled(true); setVoiceMessage('כריזה בעברית לפי התקדמות המסלול'); }
  };
  const warnedSegments = useRefMS(new Set());
  const wasCoverageBlocked = useRefMS(false);
  const seek = f => { warnedSegments.current.clear(); speech.current?.cancel(); announcements.current.reset(); setPlaying(false); setDriverF(f); };
  const focusTimer = useRefMS(null);
  useEffectMS(() => () => clearTimeout(focusTimer.current), []);
  const [focus, setFocus] = useStateMS(null);
  const [sheetOpen, setSheetOpen] = useStateMS(false);

  // navigation state: idle | loading | ok | weak | fallback
  const [osrmStatus, setOsrmStatus] = useStateMS('idle');
  const [osrmManeuvers, setOsrmManeuvers] = useStateMS([]);

  const stops = trip.stops;
  const metrics = useMemoMS(() => window.Geo.polylineMetrics(geom || []), [geom]);
  useEffectMS(() => {
    if (!gpsEnabled) { setGpsStatus('off'); return; }
    if (!navigator.geolocation) { setGpsStatus('unsupported'); return; }
    let live = true, timer;
    const tracker = window.RouteGPS.tracker(metrics);
    let previousFix = null;
    setGpsStatus('waiting');
    const stale = () => { if (live) { setGpsStatus('stale'); speech.current?.cancel(); } };
    timer = setTimeout(stale, 15000);
    let watch;
    try {
      watch = navigator.geolocation.watchPosition(position => {
        if (!live) return;
        const result = tracker.next(position);
        setGpsStatus(result.status);
        if (result.status === 'active') {
          const elapsed = previousFix ? (position.timestamp - previousFix.timestamp) / 1000 : 0;
          const derivedSpeed = elapsed > 0 ? Math.max(0, (result.f - previousFix.f) * metrics.total / elapsed) : 0;
          const speed = position.coords.speed;
          gpsSpeed.current = Math.min(40, Number.isFinite(speed) && speed >= 0 ? speed : derivedSpeed);
          previousFix = {f: result.f, timestamp: position.timestamp};
          setDriverF(result.f); clearTimeout(timer); timer = setTimeout(stale, 15000);
        } else speech.current?.cancel();
      }, error => {
        if (!live) return;
        setGpsStatus(error.code === 1 ? 'denied' : 'unavailable'); speech.current?.cancel();
      }, {enableHighAccuracy:true, maximumAge:0, timeout:15000});
    } catch (_) { setGpsStatus('unavailable'); }
    return () => { live = false; clearTimeout(timer); if (watch !== undefined) navigator.geolocation.clearWatch(watch); speech.current?.cancel(); };
  }, [gpsEnabled, metrics]);
  const toggleGps = () => {
    speech.current?.cancel(); announcements.current.reset(); setPlaying(false);
    setGpsStatus(gpsEnabled ? 'off' : 'waiting'); setGpsEnabled(value => !value);
  };

  // הוראות מוכנות מהשרת, או (בקובץ שהועלה ידנית) קריאה חיה ל-OSRM
  useEffectMS(() => {
    if (navSource) {
      setOsrmManeuvers([]);
      setOsrmStatus(maneuversProp.length ? (navSource === 'ok' ? 'ok' : 'weak') : 'fallback');
      return;
    }
    if (!geom || geom.length < 2 || !window.OSRM) return;
    let cancelled = false;
    setOsrmStatus('loading');
    setOsrmManeuvers([]);
    window.OSRM.maneuvers(geom).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setOsrmManeuvers(res.maneuvers);
        setOsrmStatus('ok');
      } else {
        setOsrmStatus('fallback');
      }
    }).catch(() => { if (!cancelled) setOsrmStatus('fallback'); });
    return () => { cancelled = true; };
  }, [geom, navSource]);

  // Animate the driver puck along the route
  useEffectMS(() => {
    if (!animate || !playing) return;
    let raf, last;
    const tick = (t) => {
      if (last != null) {
        const dt = Math.min(0.1, (t - last) / 1000);
        // Preview at 30 km/h, independent of route length; never loop silently.
        setDriverF((f) => Math.min(1, f + dt * (30 / 3.6) / metrics.total));
      }
      last = t;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate, playing, metrics.total]);

  useEffectMS(() => { if (driverF >= 1) setPlaying(false); }, [driverF]);

  const focusStop = (s) => { clearTimeout(focusTimer.current); setFocus(s.id); focusTimer.current = setTimeout(() => setFocus(null), 4000); };
  const nextStop = stops.find((s) => s.f > driverF) || stops[stops.length - 1];
  const metersToNext = nextStop ? Math.max(0, (nextStop.f - driverF) * metrics.total) : 0;

  // Determine active maneuver source: real OSRM if available, else prop (demo), else geometry
  const activeManeuvers = navSource
    ? ((osrmStatus === 'ok' || osrmStatus === 'weak') ? maneuversProp : [])
    : (osrmStatus === 'ok' ? osrmManeuvers : maneuversProp);

  const groupedManeuvers = useMemoMS(
    () => window.RouteNavigation.prepare(activeManeuvers, metrics.total, {metrics, stops}),
    [activeManeuvers, metrics, stops]);
  const coverageIntervals = useMemoMS(() => window.RouteCoverage.intervals(uncertainSegments, metrics, geom, stops), [uncertainSegments, metrics, geom, stops]);
  const coverage = window.RouteCoverage.state(coverageIntervals, driverF, metrics.total, gpsEnabled ? gpsSpeed.current : 30/3.6);
  const visibleManeuvers = window.RouteCoverage.visible(groupedManeuvers, coverage);
  const stopBeyondGap = !!coverage.gap && nextStop?.f >= coverage.gap.from;
  useEffectMS(() => {
    if (coverage.blocked && !wasCoverageBlocked.current) speech.current?.cancel();
    wasCoverageBlocked.current = coverage.blocked;
  }, [coverage.blocked]);
  const upcomingMv = gpsEnabled && gpsStatus !== 'active' ? null : window.RouteNavigation.next(visibleManeuvers, driverF, metrics.total);

  useEffectMS(() => {
    if (!voiceEnabled || (gpsEnabled ? gpsStatus !== 'active' : !playing) || document.visibilityState !== 'visible' || !speech.current) return;
    if (coverage.blocked) {
      if (!warnedSegments.current.has(coverage.gap.id) && !speech.current.busy() && speech.current.speak(window.RouteCoverage.warning(coverage), 3)) warnedSegments.current.add(coverage.gap.id);
      return;
    }
    const speechTurn = window.RouteSpeech.nextTurn(visibleManeuvers, driverF, metrics.total);
    const speed = gpsEnabled ? gpsSpeed.current : 30 / 3.6;
    const lead = window.RouteSpeech.arrivalLead(speed, speech.current.estimate(window.RouteSpeech.instruction(speechTurn)));
    const immediate = speechTurn && speechTurn.meters <= lead;
    const arrivingStop = nextStop && nextStop.f > driverF && metersToNext <= 20.01;
    const stopBeforeTurn = !speechTurn || nextStop?.f < speechTurn.f;
    if (speech.current.busy()) {
      if (immediate || (arrivingStop && stopBeforeTurn)) speech.current.interruptFor(2);
      return;
    }
    const turnIndex = speechTurn ? groupedManeuvers.findIndex(m => m.f === speechTurn.f && m.kind === speechTurn.kind) : -1;
    const segmentMeters = turnIndex >= 0 ? (speechTurn.f - (turnIndex > 0 ? groupedManeuvers[turnIndex - 1].f : 0)) * metrics.total : undefined;
    const preparation = speechTurn ? `בעוד ${Math.round(speechTurn.meters / 10) * 10} מטר, ${window.RouteSpeech.instruction(speechTurn)}` : '';
    if (arrivingStop && stopBeforeTurn && !stopBeyondGap) {
      const arrivalText = announcements.current.nextStop(nextStop, driverF, metrics.total, {nowMs: Date.now()});
      if (arrivalText) { speech.current.speak(arrivalText, 2); return; }
    }
    const text = announcements.current.next(speechTurn, driverF, metrics.total, segmentMeters, {
      arrivalMeters: lead, speedMps: speed, seconds: speech.current.estimate(preparation), nowMs: Date.now()
    });
    if (text) speech.current?.speak(text, immediate ? 2 : 1);
    else if (!stopBeyondGap && !speech.current?.busy() && (!speechTurn || speechTurn.meters > 100)) {
      const expectedStopText = 'המשיכו במסלול ועצרו בתחנה ' + window.RouteSpeech.stopLabel(nextStop) + ' בעוד 250 מטר';
      const untilTurn = speechTurn ? Math.max(0, speechTurn.meters - lead) / Math.max(1, speed) : Infinity;
      if (untilTurn < speech.current.estimate(expectedStopText) + 5) return;
      const stopText = announcements.current.nextStop(nextStop, driverF, metrics.total, {
        nowMs: Date.now(), continueRoute: !!speechTurn && speechTurn.meters >= 1000 && metersToNext < speechTurn.meters,
        straight: osrmStatus === 'ok'
      });
      if (stopText) speech.current?.speak(stopText);
    }
  }, [voiceEnabled, playing, gpsEnabled, gpsStatus, driverF, groupedManeuvers, metrics.total, speechTick, nextStop, coverageIntervals]);

  useEffectMS(() => { if (!playing) speech.current?.cancel(); }, [playing]);

  // A bend in a GTFS shape is not a turn instruction. Between known maneuvers,
  // or when navigation is unavailable, show the next stop without guessing.
  const maneuver = upcomingMv ? upcomingMv.kind : 'none';
  const metersToTurn = upcomingMv ? upcomingMv.meters : undefined;

  const stationFirst = window.RouteSpeech.stationFirst(nextStop, driverF, metrics.total, upcomingMv);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TripHeader route={route} trip={trip} dark={dark} onToggleDark={onToggleDark} onBack={onBack} osrmStatus={coverageIntervals.length ? 'weak' : osrmStatus} gpsEnabled={gpsEnabled} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'var(--surface)', color: 'var(--text)' }}>
        <button disabled={gpsEnabled} onClick={() => { if (driverF >= 1) { warnedSegments.current.clear(); announcements.current.reset(); setDriverF(0); } setPlaying((p) => !p); }} style={{ border: 0, borderRadius: 10, padding: '10px 12px', background: 'var(--accent)', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: gpsEnabled ? .5 : 1 }}>
          {playing ? 'השהיית הדמיה' : 'הפעלת הדמיה'}
        </button>
        <input disabled={gpsEnabled} aria-label="מיקום בהדמיית המסלול" type="range" min="0" max="1" step="0.001" value={Math.min(1, driverF)} onChange={(e) => { seek(Number(e.target.value)); }} style={{ flex: 1, minWidth: 0, accentColor: 'var(--accent)' }} />
        <span style={{ fontSize: 12 }}>{gpsEnabled ? 'GPS' : 'הדמיה'}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '4px 14px 8px', background: 'var(--surface)', color: 'var(--text)' }}>
        <button aria-pressed={screenEnabled} onClick={toggleScreen} style={{ border: '1px solid var(--hair)', borderRadius: 10, padding: '8px 12px', background: 'var(--chip)', color: 'var(--text)', cursor: 'pointer' }}>{screenEnabled ? 'כיבוי שמירת מסך' : 'השארת מסך דולק'}</button>
        <button aria-pressed={voiceEnabled} onClick={toggleVoice} style={{ border: '1px solid var(--hair)', borderRadius: 10, padding: '8px 12px', background: 'var(--chip)', color: 'var(--text)', cursor: 'pointer' }}>{voiceEnabled ? 'כיבוי כריזה' : 'הפעלת כריזה'}</button>
        <button aria-pressed={gpsEnabled} onClick={toggleGps} style={{ border: '1px solid var(--hair)', borderRadius: 10, padding: '8px 12px', background: 'var(--chip)', color: 'var(--text)', cursor: 'pointer' }}>{gpsEnabled ? 'עצירת GPS' : 'הפעלת GPS'}</button>
        {gpsEnabled && <span role="status" style={{ fontSize: 12, width: '100%' }}>{({waiting:'ממתין למיקום מהמכשיר…',active:'GPS פעיל · המיקום מותאם לקו',inaccurate:'המיקום אינו מדויק מספיק · ההוראות מושהות',stale:'המיקום לא עודכן · ההוראות מושהות',offroute:'המיקום אינו תואם להמשך הקו · ההוראות מושהות',ambiguous:'לא ברור באיזה חלק של הקו נמצאים · ההוראות מושהות',denied:'הרשאת המיקום נדחתה. אפשר לשנות בהגדרות האתר ולנסות שוב.',unsupported:'הדפדפן אינו תומך במיקום',unavailable:'לא התקבל מיקום. בדקו ששירותי המיקום מופעלים.'})[gpsStatus]}</span>}
        <span role="status" style={{ fontSize: 12, width: '100%' }}>{({active:'שמירת מסך פעילה',requesting:'מפעיל שמירת מסך…',off:'שמירת מסך כבויה',unsupported:'הדפדפן אינו תומך בשמירת מסך',unavailable:'שמירת המסך לא הופעלה במכשיר',released:'שמירת המסך הופסקה במכשיר'})[screenStatus]}</span>
        <span role="status" style={{ fontSize: 12, flex: 1 }}>{voiceMessage}</span>
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <LeafletMap geom={geom} stops={stops} driverF={driverF} focusStopId={focus} dark={dark} follow compact toggleBottom={sheetOpen ? '62%' : 164} />

        {/* floating navigation cue */}
        <div style={{ position: 'absolute', top: 12, left: 12, right: 12, zIndex: 600, pointerEvents: 'none' }}>
          {coverage.blocked ? <div role="status" style={{background:'var(--surface)',color:'var(--text)',border:'2px solid #d49420',borderRadius:18,padding:16}}>
            <div style={{fontSize:23,fontWeight:800}}>{coverage.active ? 'הוראות חלקיות במקטע הזה' : 'הוראות חלקיות במקטע הבא'}</div>
            <div style={{fontSize:15,marginTop:6}}>אין הוראות פנייה מאומתות</div>
            {nextStop && <div style={{marginTop:10}}>התחנה הבאה: {window.RouteSpeech.stopLabel(nextStop)}</div>}
          </div> : stationFirst ? <div style={{background:'var(--accent)',color:'#fff',borderRadius:18,padding:'16px',pointerEvents:'auto'}}>
              <div style={{fontSize:14,fontWeight:700}}>התחנה הבאה · בעוד {fmtDist(metersToNext)}</div>
              <div style={{fontSize:28,fontWeight:800,lineHeight:1.2,marginTop:8,overflowWrap:'anywhere'}}>{window.RouteSpeech.stopLabel(nextStop)}</div>
              <div style={{fontSize:17,marginTop:10}}>{stopBeyondGap ? 'בהמשך המסלול מקטע עם הוראות חלקיות' : osrmStatus === 'ok' ? 'המשיכו ישר ועצרו בתחנה' : 'המשיכו במסלול ועצרו בתחנה'}</div>
              
            </div> : upcomingMv
            ? <div><ManeuverBanner mv={upcomingMv} />
                {nextStop && <div style={{ marginTop: 6, padding: '10px 14px', borderRadius: 12, background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontWeight: 700 }}>
                  התחנה הבאה: {window.RouteSpeech.stopLabel(nextStop)} · {fmtDist(metersToNext)}
                </div>}
              </div>
            : <NextStopBanner
                stop={nextStop}
                meters={metersToNext}
                dark={dark}
                maneuver={maneuver}
                metersToTurn={metersToTurn}
                compact
              />}
        </div>

        {/* bottom sheet with the stop list */}
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 600,
          background: 'var(--surface)', borderRadius: '22px 22px 0 0',
          boxShadow: '0 -8px 30px rgba(0,0,0,0.20)',
          height: sheetOpen ? '60%' : 150, transition: 'height .32s cubic-bezier(.4,0,.2,1)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <button onClick={() => setSheetOpen((v) => !v)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '10px 0 6px', fontFamily: 'inherit' }}>
            <div style={{ width: 38, height: 5, borderRadius: 99, background: 'var(--rail)', margin: '0 auto' }} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 18px 8px' }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text)' }}>תחנות המסלול</div>
            <div style={{ fontSize: 13, color: 'var(--text-mut)', fontWeight: 700 }}>{stops.length} תחנות</div>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '0 4px 16px' }}>
            <StopsTimeline stops={stops} driverF={driverF} onStopClick={focusStop} focusStopId={focus} dense={!sheetOpen} />
          </div>
        </div>
      </div>
    </div>
  );
}

window.MapScreen = MapScreen;
window.TripHeader = TripHeader;
