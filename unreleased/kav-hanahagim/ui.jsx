// Shared UI atoms for the driver app.
const { useState: useStateUI } = React;

// Route-number badge (blue rounded square)
function RouteBadge({ num, size = 46, dark }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.26, background: 'var(--accent)',
      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 800, fontSize: size * (String(num).length > 2 ? 0.36 : 0.44),
      letterSpacing: '-0.02em', flexShrink: 0, boxShadow: '0 2px 8px var(--accent-shadow)',
    }}>{num}</div>
  );
}

// Segmented control (pill)
function Segmented({ options, value, onChange }) {
  return (
    <div style={{
      display: 'flex', background: 'var(--seg-bg)', borderRadius: 12, padding: 3, gap: 3,
    }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} onClick={() => onChange(o.value)} style={{
            flex: 1, border: 'none', cursor: 'pointer', borderRadius: 9,
            padding: '9px 6px', fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
            background: active ? 'var(--surface)' : 'transparent',
            color: active ? 'var(--text)' : 'var(--text-mut)',
            boxShadow: active ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
            transition: 'all .18s ease',
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

// Numeric keypad
function NumPad({ onKey }) {
  const keys = ['1','2','3','4','5','6','7','8','9','clear','0','back'];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
      {keys.map((k) => {
        const special = k === 'clear' || k === 'back';
        return (
          <button key={k} onClick={() => onKey(k)} style={{
            height: 56, border: 'none', cursor: 'pointer', borderRadius: 14,
            background: special ? 'transparent' : 'var(--surface)',
            color: special ? 'var(--text-mut)' : 'var(--text)',
            fontFamily: 'inherit', fontWeight: special ? 600 : 700,
            fontSize: special ? 15 : 24,
            boxShadow: special ? 'none' : '0 1px 2px rgba(0,0,0,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {k === 'back' ? '⌫' : k === 'clear' ? 'נקה' : k}
          </button>
        );
      })}
    </div>
  );
}

// route progress helpers
function routeMeters() { return 6200; }
function distToStop(stopF, driverF) {
  return Math.max(0, Math.round((stopF - driverF) * routeMeters()));
}
function fmtDist(m) {
  if (m >= 1000) return (m / 1000).toFixed(1).replace('.0', '') + ' ק״מ';
  return Math.round(m / 10) * 10 + ' מ׳';
}
function etaMin(m) { return Math.max(1, Math.round(m / 300)); }

// Maneuver badge (turn arrow)
function ManeuverBadge({ dir, size = 52 }) {
  // right / left / keep-right / keep-left → חץ לצד; כל השאר ישר
  const Arrow = /right$/.test(dir) ? IconTurnRight : /left$/.test(dir) ? IconTurnLeft : IconStraight;
  return (
    <div style={{
      width: size, height: size, borderRadius: 16, background: 'rgba(255,255,255,0.18)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <Arrow size={Math.round(size * 0.62)} style={{ color: '#fff' }} />
    </div>
  );
}

const TURN_LABEL = { right: 'פנו ימינה', left: 'פנו שמאלה', 'keep-right': 'היצמדו לימין', 'keep-left': 'היצמדו לשמאל', roundabout: 'בכיכר', straight: 'המשיכו ישר' };

// Driver navigation cue: turn direction + meters to next turn + stop name
function NextStopBanner({ stop, driverF, meters, metersToTurn, dark, compact, maneuver = 'straight' }) {
  if (!stop) return null;
  const mStop = meters != null ? meters : distToStop(stop.f, driverF);
  // If we have a specific distance to the turn, show that in the main cue;
  // otherwise fall back to distance-to-stop. When very close to a stop, always show stop distance.
  const closeToStop = mStop <= 60;
  const showTurn = !closeToStop && maneuver !== 'none' && maneuver !== 'straight' && metersToTurn != null && metersToTurn < mStop;
  const mainDist = showTurn ? metersToTurn : mStop;
  const mainLabel = closeToStop ? 'מגיעים לתחנה' : maneuver === 'none' ? 'התחנה הבאה' : TURN_LABEL[maneuver];

  return (
    <div style={{
      background: 'var(--accent)', color: '#fff', borderRadius: compact ? 18 : 22,
      padding: compact ? '14px 16px' : '18px 20px',
      boxShadow: '0 8px 24px var(--accent-shadow)', pointerEvents: 'auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        {maneuver === 'none' ? <IconPin size={compact ? 32 : 36} /> : <ManeuverBadge dir={closeToStop ? 'straight' : maneuver} size={compact ? 50 : 58} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, opacity: 0.9 }}>
            {mainLabel}
          </div>
          <div style={{ fontSize: compact ? 30 : 36, fontWeight: 800, lineHeight: 1.05, unicodeBidi: 'isolate' }}>
            בעוד {fmtDist(mainDist)}
          </div>
        </div>
      </div>
      <div style={{ height: 1, background: 'rgba(255,255,255,0.22)', margin: compact ? '12px 0' : '14px 0' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <IconPin size={18} sw={2.2} style={{ opacity: 0.9, flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, opacity: 0.8, letterSpacing: '0.02em' }}>התחנה הבאה · {fmtDist(mStop)}</div>
          <div style={{ fontSize: compact ? 19 : 22, fontWeight: 800, lineHeight: 1.15, overflowWrap: 'anywhere' }}>{window.RouteSpeech ? window.RouteSpeech.stopLabel(stop) : stop.name}</div>
        </div>
        <div style={{ textAlign: 'center', flexShrink: 0, opacity: 0.92 }}>
          <div style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{stop.time}</div>
          <div style={{ fontSize: 10.5, opacity: 0.8 }}>לפי לו״ז</div>
        </div>
      </div>
    </div>
  );
}

// Vertical stop timeline
function StopsTimeline({ stops, driverF, onStopClick, focusStopId, dense }) {
  const nextIdx = stops.findIndex((s) => s.f > driverF);
  return (
    <div>
      {stops.map((s, i) => {
        const passed = i < nextIdx || nextIdx === -1 && i < stops.length;
        const isNext = i === nextIdx;
        const isLast = i === stops.length - 1;
        const focus = focusStopId === s.id;
        const m = distToStop(s.f, driverF);
        return (
          <button key={s.id} onClick={() => onStopClick && onStopClick(s)} style={{
            width: '100%', textAlign: 'inherit', border: 'none', cursor: onStopClick ? 'pointer' : 'default',
            background: focus ? 'var(--row-hl)' : 'transparent',
            display: 'grid', gridTemplateColumns: '34px 1fr auto', alignItems: 'center',
            gap: 12, padding: dense ? '8px 14px' : '11px 16px', fontFamily: 'inherit',
            borderRadius: 12, position: 'relative',
          }}>
            {/* rail + node */}
            <div style={{ position: 'relative', height: '100%', display: 'flex', justifyContent: 'center' }}>
              {!isLast && <div style={{ position: 'absolute', top: '50%', bottom: -22, width: 3, background: i < nextIdx ? 'var(--rail-done)' : 'var(--rail)', borderRadius: 2 }} />}
              {i !== 0 && <div style={{ position: 'absolute', top: -22, bottom: '50%', width: 3, background: i <= nextIdx - 1 ? 'var(--rail-done)' : (i === nextIdx ? 'var(--rail-done)' : 'var(--rail)'), borderRadius: 2 }} />}
              <div style={{
                position: 'relative', zIndex: 1,
                width: isNext ? 18 : 13, height: isNext ? 18 : 13, borderRadius: isLast ? 4 : 99,
                background: isNext ? 'var(--accent)' : passed ? 'var(--rail-done)' : 'var(--surface)',
                border: `3px solid ${isNext ? 'var(--accent)' : passed ? 'var(--rail-done)' : 'var(--accent)'}`,
                boxShadow: isNext ? '0 0 0 4px var(--accent-ring)' : 'none',
              }} />
            </div>
            {/* name + code */}
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontWeight: isNext ? 800 : 600, fontSize: isNext ? 17 : 15.5,
                color: passed ? 'var(--text-mut)' : 'var(--text)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{s.name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
                רציף {s.code}{isNext ? ` · ${fmtDist(m)}` : ''}
              </div>
            </div>
            {/* time */}
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontWeight: 700, fontSize: 15, fontVariantNumeric: 'tabular-nums',
                color: isNext ? 'var(--accent)' : passed ? 'var(--text-dim)' : 'var(--text)',
              }}>{s.time}</div>
              {isNext && <div style={{ fontSize: 10.5, color: 'var(--accent)', fontWeight: 700 }}>קרוב</div>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

Object.assign(window, { RouteBadge, Segmented, NumPad, NextStopBanner, StopsTimeline, distToStop, fmtDist, etaMin });
