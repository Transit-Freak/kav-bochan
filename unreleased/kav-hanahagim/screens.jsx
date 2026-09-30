// Flow screens: GTFS upload + route/makat search.
const { useState: useStateSC, useRef: useRefSC } = React;

// Visually-hidden but focusable/clickable — more reliable than display:none for
// triggering the native file picker on Android.
const srOnly = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
};

function Brandmark({ small }) {
  const s = small ? 30 : 38;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: s, height: s, borderRadius: s * 0.28, background: 'var(--accent)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        boxShadow: '0 2px 8px var(--accent-shadow)',
      }}>
        <IconBus size={small ? 18 : 22} sw={2} />
      </div>
      <div style={{ fontWeight: 800, fontSize: small ? 17 : 20, color: 'var(--text)', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
        קו הנהגים
      </div>
    </div>
  );
}

function DayNightToggle({ dark, onToggle }) {
  return (
    <button onClick={onToggle} aria-label="יום/לילה" style={{
      width: 40, height: 40, borderRadius: 12, border: 'none', cursor: 'pointer',
      background: 'var(--chip)', color: 'var(--text)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {dark ? <IconSun size={20} /> : <IconMoon size={20} />}
    </button>
  );
}

// ── Upload / import screen ────────────────────────────────────
function UploadScreen({ dark, onToggleDark, onLoaded, onDemo }) {
  const [stage, setStage] = useStateSC('idle'); // idle | parsing | done | error
  const [fileName, setFileName] = useStateSC('');
  const [prog, setProg] = useStateSC({ phase: '', pct: 0, detail: '' });
  const [feed, setFeed] = useStateSC(null);
  const [err, setErr] = useStateSC('');

  const handleFile = async (f) => {
    if (!f) return;
    setFileName(f.name); setStage('parsing'); setErr('');
    try {
      if (typeof DecompressionStream === 'undefined')
        throw new Error('הדפדפן לא תומך בפענוח ZIP (DecompressionStream). נסה Chrome/Edge עדכני.');
      const buf = await f.arrayBuffer();
      const parsed = await window.GTFSParser.parseZip(buf, (p) => setProg(p));
      parsed.fileName = f.name;
      setFeed(parsed); setStage('done');
    } catch (e) {
      console.error(e); setErr(e.message || String(e)); setStage('error');
    }
  };
  const pick = (e) => { const f = e.target.files && e.target.files[0]; handleFile(f); };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '0 18px', overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 18 }}>
        <Brandmark />
        <DayNightToggle dark={dark} onToggle={onToggleDark} />
      </div>

      <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', lineHeight: 1.2 }}>טעינת נתוני תחבורה</div>
      <div style={{ fontSize: 15, color: 'var(--text-mut)', marginTop: 6, lineHeight: 1.5 }}>
        טען קובץ GTFS (ZIP) של משרד התחבורה. הקובץ נקרא ומפוענח במכשיר — שום דבר לא נשלח לרשת.
      </div>

      {stage === 'idle' && (
        <label style={{
          marginTop: 22, border: '2px dashed var(--dashed)', background: 'var(--drop-bg)',
          borderRadius: 20, padding: '34px 20px', cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: 'var(--text)',
        }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconUpload size={30} /></div>
          <div style={{ fontWeight: 800, fontSize: 18, whiteSpace: 'nowrap' }}>בחר קובץ GTFS</div>
          <div style={{ fontSize: 13.5, color: 'var(--text-mut)' }}>קובץ ZIP ממשרד התחבורה</div>
          <input type="file" onChange={pick} style={srOnly} />
        </label>
      )}

      {stage === 'parsing' && (
        <div style={{ marginTop: 22, background: 'var(--surface)', borderRadius: 18, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="spin" style={{ width: 38, height: 38, borderRadius: 99, border: '3px solid var(--chip)', borderTopColor: 'var(--accent)', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 15.5, color: 'var(--text)' }}>{prog.phase || 'מפענח…'}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-mut)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', direction: 'ltr', textAlign: 'right' }}>{prog.detail}</div>
            </div>
          </div>
          <div style={{ height: 8, borderRadius: 99, background: 'var(--chip)', marginTop: 16, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: Math.round((prog.pct || 0) * 100) + '%', background: 'var(--accent)', borderRadius: 99, transition: 'width .2s ease' }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-mut)', marginTop: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fileName}</div>
        </div>
      )}

      {stage === 'error' && (
        <div style={{ marginTop: 22 }}>
          <div style={{ background: 'var(--warn-soft)', color: 'var(--warn)', borderRadius: 16, padding: 16, display: 'flex', gap: 10 }}>
            <IconAlert size={20} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>{err}</div>
          </div>
          <button onClick={() => setStage('idle')} style={{ marginTop: 12, background: 'var(--chip)', border: 'none', borderRadius: 12, padding: '10px 16px', fontFamily: 'inherit', fontWeight: 700, fontSize: 14.5, color: 'var(--text)', cursor: 'pointer' }}>נסה קובץ אחר</button>
        </div>
      )}

      {stage === 'done' && feed && (
        <div style={{ marginTop: 22 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 18, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--ok-soft)', color: 'var(--ok)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <IconCheck size={24} sw={2.4} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{feed.fileName}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-mut)' }}>נקרא ופוענח במלואו</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 16 }}>
              {[['קווים', feed.counts.routes], ['תחנות', feed.counts.stops], ['נסיעות', feed.counts.trips]].map(([k, v]) => (
                <div key={k} style={{ background: 'var(--chip)', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{(v || 0).toLocaleString('he-IL')}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-mut)', marginTop: 2 }}>{k}</div>
                </div>
              ))}
            </div>
          </div>
          <label style={{ marginTop: 12, display: 'inline-block', color: 'var(--text-mut)', fontFamily: 'inherit', fontSize: 14, cursor: 'pointer' }}>
            בחר קובץ אחר
            <input type="file" onChange={pick} style={srOnly} />
          </label>
        </div>
      )}

      <div style={{ marginTop: 'auto', paddingTop: 18, paddingBottom: 26 }}>
        <button disabled={stage !== 'done'} onClick={() => onLoaded(feed)} style={{
          width: '100%', height: 56, borderRadius: 16, border: 'none', fontFamily: 'inherit',
          fontWeight: 800, fontSize: 18, cursor: stage === 'done' ? 'pointer' : 'not-allowed',
          background: stage === 'done' ? 'var(--accent)' : 'var(--chip)',
          color: stage === 'done' ? '#fff' : 'var(--text-dim)',
          boxShadow: stage === 'done' ? '0 8px 20px var(--accent-shadow)' : 'none',
        }}>המשך לבחירת קו</button>
        <button onClick={onDemo} style={{
          width: '100%', marginTop: 10, background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 14.5, fontWeight: 600, color: 'var(--text-mut)',
        }}>דלג — המשך עם נתוני דמה</button>
      </div>
    </div>
  );
}

// ── Search screen ─────────────────────────────────────────────
function SearchScreen({ dark, onToggleDark, onSelect, feed, onUpload, search, onSearch }) {
  const { mode, q, page = 0 } = search;
  const setQ = (value) => onSearch((s) => ({ ...s, q: typeof value === 'function' ? value(s.q) : value, page: 0 }));
  const setMode = (mode) => onSearch({ mode, q: '', page: 0 });
  const allRoutes = feed ? feed.routes : window.GTFS_FEED.routes;

  const onKey = (k) => {
    if (k === 'back') setQ((v) => v.slice(0, -1));
    else if (k === 'clear') setQ('');
    else setQ((v) => (v.length >= 80 ? v : v + k));
  };

  // Search all routes, but render only one page to keep return navigation fast.
  let filtered = window.RouteSearch.search(allRoutes, q, mode);
  const total = filtered.length;

  const pageSize = 40;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(total / pageSize) - 1));
  filtered = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 18px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14 }}>
          <Brandmark small />
          <DayNightToggle dark={dark} onToggle={onToggleDark} />
        </div>
        <div style={{ fontSize: 23, fontWeight: 800, color: 'var(--text)', marginBottom: feed && feed.remote ? 4 : 12 }}>איזה קו אתה נוסע?</div>
        {feed && feed.remote && (
          <div style={{ fontSize: 12.5, color: 'var(--text-mut)', marginBottom: 10, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>{feed.fileName} · עודכן {feed.built}</span>
            {onUpload && <button onClick={onUpload} style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, color: 'var(--accent)', cursor: 'pointer' }}>קובץ GTFS אחר</button>}
          </div>
        )}
        <Segmented value={mode} onChange={(v) => { setMode(v); setQ(''); }}
          options={[{ value: 'line', label: 'קו ועיר' }, { value: 'makat', label: 'מק״ט' }]} />

        {/* query display */}
        <div style={{
          marginTop: 12, height: 58, borderRadius: 14, background: 'var(--surface)',
          display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10,
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}>
          <IconSearch size={22} style={{ color: 'var(--text-mut)' }} />
          <input
            aria-label={mode === 'line' ? 'חיפוש לפי קו ועיר' : 'מק״ט'}
            placeholder={mode === 'line' ? 'למשל: 1 יבנה' : 'הקלד מק״ט'}
            type="text" inputMode={mode === 'line' ? 'text' : 'numeric'} autoComplete="off" maxLength={80}
            value={q} onChange={(e) => setQ(e.target.value.slice(0, 80))}
            style={{ flex: 1, minWidth: 0, width: '100%', border: 0, outlineOffset: 4, background: 'transparent', fontFamily: 'inherit', fontWeight: 800, fontSize: 24, color: 'var(--text)' }}
          />
          {q && <button aria-label="ניקוי החיפוש" onClick={() => setQ('')} style={{ border: 'none', background: 'var(--chip)', borderRadius: 99, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-mut)' }}><IconX size={16} /></button>}
        </div>
      </div>

      {/* results */}
      <div key={mode + ':' + q + ':' + currentPage} style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '12px 12px 4px' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-mut)', padding: '0 6px 6px' }}>
          {q ? `${total.toLocaleString('he-IL')} תוצאות${total > filtered.length ? ` · מוצגות ${filtered.length}` : ''}` : (feed ? (feed.remote ? `כל ${total.toLocaleString('he-IL')} הקווים בישראל` : 'כל הקווים') : 'קווים אחרונים')}
        </div>
        {filtered.map((r) => (
          <button key={r.id} onClick={() => onSelect(r)} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 13, textAlign: 'inherit',
            background: 'var(--surface)', border: 'none', cursor: 'pointer', borderRadius: 15,
            padding: '11px 13px', marginBottom: 8, fontFamily: 'inherit',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          }}>
            <RouteBadge num={r.shortName} dark={dark} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.desc || r.longName || r.shortName}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-mut)', marginTop: 2 }}>{r.agency}{r.agency ? ' · ' : ''}מק״ט {r.makat}</div>
            </div>
            <IconChevron size={20} style={{ color: 'var(--text-dim)' }} />
          </button>
        ))}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-mut)', padding: '30px 0', fontSize: 15 }}>לא נמצאו קווים תואמים</div>
        )}
        {total > pageSize && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 12 }}>
          <button disabled={currentPage === 0} onClick={() => onSearch((s) => ({ ...s, page: currentPage - 1 }))}>הקודם</button>
          <span>עמוד {currentPage + 1} מתוך {Math.ceil(total / pageSize)}</span>
          <button disabled={(currentPage + 1) * pageSize >= total} onClick={() => onSearch((s) => ({ ...s, page: currentPage + 1 }))}>הבא</button>
        </div>}
      </div>

      {/* keypad */}
      <div style={{ padding: '10px 16px 24px', background: 'var(--keypad-bg)' }}>
        <NumPad onKey={onKey} />
      </div>
    </div>
  );
}

Object.assign(window, { UploadScreen, SearchScreen, Brandmark, DayNightToggle });
