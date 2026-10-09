/* קו באג — רכיבי UI */

function fmt(n, d = 1) {
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

const SEV_LABEL = { high: "חמור", medium: "בינוני", low: "קל", ok: "תקין" };

// גרסת האפליקציה (SemVer: MAJOR.MINOR.PATCH) — מקור-אמת יחיד.
const KAVBUG_VERSION = "1.0.0";

// תיבות גאוגרפיות מוכנות לערים נפוצות [minLat, minLng, maxLat, maxLng]
const CITY_PRESETS = [
  { name: "באר שבע", bbox: [31.18, 34.74, 31.31, 34.86] },
  { name: "תל אביב-יפו", bbox: [32.02, 34.74, 32.13, 34.82] },
  { name: "ירושלים", bbox: [31.74, 35.16, 31.83, 35.25] },
  { name: "חיפה", bbox: [32.76, 34.94, 32.84, 35.06] },
  { name: "ראשון לציון", bbox: [31.94, 34.74, 32.02, 34.83] },
  { name: "פתח תקווה", bbox: [32.07, 34.85, 32.13, 34.92] },
  { name: "אשדוד", bbox: [31.76, 34.61, 31.84, 34.69] },
  { name: "נתניה", bbox: [32.28, 34.83, 32.36, 34.89] },
];

function UploadModal({ open, onClose, onProcess, job }) {
  const [presetIdx, setPresetIdx] = React.useState(0);
  const [file, setFile] = React.useState(null);
  const [drag, setDrag] = React.useState(false);
  const inputRef = React.useRef(null);
  if (!open) return null;

  const busy = job && job.status === "running";
  const preset = CITY_PRESETS[presetIdx];

  const pick = (f) => { if (f) setFile(f); };

  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>העלאת קובץ GTFS</h2>
          <button className="x" onClick={() => !busy && onClose()} disabled={busy}>×</button>
        </div>

        <p className="modal-note">
          הורידו פעם אחת את <b>israel-public-transportation.zip</b> מאתר משרד התחבורה
          (<a className="mot-link" href="https://gtfs.mot.gov.il/gtfsfiles/" target="_blank" rel="noopener noreferrer">https://gtfs.mot.gov.il/gtfsfiles/</a>),
          ואז גררו אותו לכאן (או לחצו לבחירה). העיבוד מתבצע <b>במכשיר שלכם בלבד</b> — הקובץ לא נשלח לשום מקום.
        </p>

        <label className="field-label">עיר לסריקה</label>
        <select
          className="select"
          value={presetIdx}
          disabled={busy}
          onChange={(e) => setPresetIdx(+e.target.value)}
        >
          {CITY_PRESETS.map((p, i) => (
            <option key={p.name} value={i}>{p.name}</option>
          ))}
        </select>

        <div
          className={"drop " + (drag ? "over " : "") + (file ? "has " : "")}
          onClick={() => !busy && inputRef.current.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed,application/octet-stream,multipart/x-zip"
            style={{ display: "none" }}
            onChange={(e) => pick(e.target.files[0])}
          />
          {file ? (
            <div className="drop-file">
              <span className="zip">ZIP</span>
              <div>
                <div className="fn">{file.name}</div>
                <div className="fs num">{(file.size / 1048576).toFixed(0)} MB</div>
              </div>
            </div>
          ) : (
            <div className="drop-empty">
              <div className="up">⬆</div>
              <div>גררו לכאן את ה-ZIP, או לחצו לבחירה</div>
            </div>
          )}
        </div>

        {busy ? (
          <div className="progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: Math.round((job.pct || 0) * 100) + "%" }}></div>
            </div>
            <div className="progress-text">
              <span>{job.phase || "מעבד…"}</span>
              <span className="num">{Math.round((job.pct || 0) * 100)}%</span>
            </div>
          </div>
        ) : (
          <button
            className="btn-primary"
            disabled={!file}
            onClick={() => onProcess(file, preset.bbox, preset.name)}
          >
            {file ? `סרוק את ${preset.name}` : "בחרו קובץ כדי להתחיל"}
          </button>
        )}

        {job && job.status === "error" && (
          <div className="job-error">{job.message}</div>
        )}
        {busy && (
          <p className="modal-hint">הניתוח עשוי לקחת 1–4 דקות לקובץ המלא. אפשר להשאיר את החלון פתוח.</p>
        )}
      </div>
    </div>
  );
}

function TopBar({ query, setQuery, onSelect, cityNames, onUpload, onInfo, onReport }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const q = query.trim();
  const matches = cityNames.filter((c) => c.includes(q));
  return (
    <header className="topbar">
      <div className="brand">
        <div className="glyph">
          <svg viewBox="0 0 140 90" width="22" height="22" aria-hidden="true">
            <line x1="18" y1="64" x2="122" y2="64" stroke="#1f9d57" strokeWidth="9" strokeLinecap="round" />
            <polyline points="18,64 44,18 70,64 96,18 122,64" fill="none" stroke="#ef8a17" strokeWidth="9.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="18" cy="64" r="9" fill="#fff" />
            <circle cx="122" cy="64" r="9" fill="#fff" />
          </svg>
        </div>
        <div>
          <h1>קו באג <span className="beta">בטא</span> <span className="ver">v{KAVBUG_VERSION}</span></h1>
          <p className="tag">איתור קטעים מיותרים בקווי תחבורה · כלי בבדיקה — אמתו כל התראה על המפה</p>
        </div>
      </div>
      <div className="spacer"></div>
      <button className="icon-btn" onClick={onInfo} title="איך זה עובד">?</button>
      <button className="report-btn" onClick={onReport} title="דווח על קו עם תקלה שלא זוהתה">
        <span className="u-ico">⚑</span>דווח על תקלה
      </button>
      <button className="upload-btn" onClick={onUpload}>
        <span className="u-ico">⬆</span>העלאת GTFS
      </button>
      <div className="search" ref={ref}>
        <input
          value={query}
          placeholder="הקלידו שם עיר…"
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && matches[0]) { onSelect(matches[0]); setOpen(false); }
          }}
        />
        <span className="icon"></span>
        {open && (matches.length > 0 || q) && (
          <div className="suggest">
            {matches.map((c) => (
              <button key={c} onClick={() => { onSelect(c); setOpen(false); }}>
                <span className="dot"></span>{c}
              </button>
            ))}
            {matches.length === 0 && q && (
              <button className="suggest-upload" onClick={() => { setOpen(false); onUpload(); }}>
                <span className="plus">+</span>
                <span>“{q}” לא טעונה — העלו GTFS כדי לסרוק אותה</span>
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

// ----- מצב "דווח על תקלה" -----
// המשתמש בוחר קו לפי מספר, רואה את כל התחנות בסדר הנסיעה, מסמן קטע בעייתי
// (תחנת התחלה→תחנת סיום), כותב הסבר — ומקבל דוח שאפשר לשלוח ל-AI לאבחון או לייצא.
function ReportPanel({
  city, lineNum, setLineNum, variantIdx, setVariantIdx,
  markFrom, markTo, setMarkFrom, setMarkTo,
  text, setText, onAnalyze, analysis, onExport, onEmail, onExit,
}) {
  const [q, setQ] = React.useState(lineNum || "");
  // כל המספרים הקיימים בעיר
  const allNums = React.useMemo(() => {
    const seen = [];
    city.lines.forEach((l) => { if (!seen.includes(String(l.number))) seen.push(String(l.number)); });
    return seen;
  }, [city]);
  const matches = q.trim()
    ? allNums.filter((n) => n.startsWith(q.trim())).sort((a, b) => {
        const qa = q.trim();
        // התאמה מדויקת קודם (חיפוש "2" → "2" בראש), אחר כך סדר מספרי עולה
        // (2, 20, 29, 200, 250…), עם שובר-שוויון אלפביתי לסיומות לא-מספריות (218א).
        if (a === qa && b !== qa) return -1;
        if (b === qa && a !== qa) return 1;
        const na = parseInt(a, 10), nb = parseInt(b, 10);
        if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
        return a.localeCompare(b, "he");
      })
    : [];
  const variants = lineNum ? city.lines.filter((l) => String(l.number) === String(lineNum)) : [];
  const line = variants[variantIdx] || null;
  const pick = (n) => { setLineNum(n); setQ(n); setVariantIdx(0); setMarkFrom(null); setMarkTo(null); };
  // נקודות הקואורדינטה של הקו (shape) + אינדקס הנקודה הקרובה לכל תחנה
  const verts = React.useMemo(
    () => line ? (line.shape && line.shape.length > 1 ? line.shape : line.stops.map((s) => [s.lat, s.lng])) : [],
    [line]
  );
  const stopVtx = React.useMemo(() => {
    if (!line) return [];
    return line.stops.map((st) => {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < verts.length; i++) { const dy = verts[i][0] - st.lat, dx = verts[i][1] - st.lng; const d = dy * dy + dx * dx; if (d < bd) { bd = d; bi = i; } }
      return bi;
    });
  }, [line, verts]);
  const lo = markFrom != null && markTo != null ? Math.min(markFrom, markTo) : markFrom;
  const hi = markFrom != null && markTo != null ? Math.max(markFrom, markTo) : markFrom;
  // האם נקודת-הקואורדינטה של תחנה i נמצאת בטווח המסומן
  const inRange = (i) => lo != null && hi != null && stopVtx[i] >= lo && stopVtx[i] <= hi;
  // לחיצה על תחנה → מסמנת את נקודת-הקואורדינטה הקרובה אליה
  const clickStop = (i) => {
    const v = stopVtx[i];
    if (markFrom == null) { setMarkFrom(v); }
    else if (markTo == null) { setMarkTo(v); }
    else { setMarkFrom(v); setMarkTo(null); }
  };
  const markedPts = lo != null && hi != null ? hi - lo + 1 : 0;
  return (
    <aside className="panel report-panel">
      <div className="panel-head report-head">
        <button className="report-back" onClick={onExit}>← חזרה</button>
        <h2 className="city">דיווח על תקלה</h2>
        <p className="sub">בחרו קו, סמנו את הקטע הבעייתי על המפה או ברשימה, והוסיפו הסבר.</p>
      </div>

      <div className="report-step">
        <label className="report-label">1 · מספר הקו</label>
        <div className="report-search">
          <input
            value={q}
            placeholder="הקלידו מספר קו…"
            inputMode="numeric"
            onChange={(e) => { setQ(e.target.value); }}
            onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) pick(matches[0]); }}
          />
          {q.trim() && matches.length > 0 && String(lineNum) !== q.trim() && (
            <div className="report-suggest">
              {matches.slice(0, 8).map((n) => (
                <button key={n} onClick={() => pick(n)}>קו {n}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {variants.length > 1 && (
        <div className="report-step">
          <label className="report-label">2 · כיוון הנסיעה</label>
          <div className="report-dirs">
            {variants.map((v, i) => (
              <button
                key={i}
                className={"report-dir " + (variantIdx === i ? "on" : "")}
                onClick={() => { setVariantIdx(i); setMarkFrom(null); setMarkTo(null); }}
              >
                {dirLabel(v.name)}
              </button>
            ))}
          </div>
        </div>
      )}

      {line && (
        <React.Fragment>
          <div className="report-step">
            <label className="report-label">{variants.length > 1 ? "3" : "2"} · סמנו את הקטע הבעייתי</label>
            <p className="report-hint">
              {markFrom == null
                ? "לחצו על נקודת ההתחלה — על המפה (כל נקודה כחולה היא קואורדינטה) או על תחנה ברשימה."
                : markTo == null
                  ? "עכשיו לחצו על נקודת הסיום של הקטע."
                  : `סומן קטע של ${markedPts} נקודות קואורדינטה. לחיצה נוספת מתחילה סימון חדש.`}
              {markFrom != null && (
                <button className="report-clear" onClick={() => { setMarkFrom(null); setMarkTo(null); }}>נקה</button>
              )}
            </p>
            <p className="report-tip">💡 לחצו בכל מקום על המסלול במפה — הלחיצה נצמדת אוטומטית לנקודת הקואורדינטה הקרובה. הרשימה למטה מסמנת לפי תחנות.</p>
            <div className="report-stops">
              {line.stops.map((s, i) => (
                <button
                  key={s.id + "_" + i}
                  className={"report-stop " + (inRange(i) ? "marked " : "") + (stopVtx[i] === markFrom ? "anchor " : "")}
                  onClick={() => clickStop(i)}
                >
                  <span className="rs-idx">{i + 1}</span>
                  <span className="rs-name">{s.name}</span>
                  <span className="rs-id">{s.id}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="report-step">
            <label className="report-label">{variants.length > 1 ? "4" : "3"} · מה הבעיה?</label>
            <textarea
              className="report-text"
              value={text}
              placeholder="לדוגמה: הקו עושה סיבוב שלם בתוך הצומת בעוד קווים 61 ו-64 ממשיכים ישר."
              onChange={(e) => setText(e.target.value)}
              rows={4}
            ></textarea>
          </div>

          <div className="report-actions">
            <button
              className="report-analyze"
              disabled={lo == null || hi == null || analysis.status === "loading"}
              onClick={onAnalyze}
            >
              {analysis.status === "loading" ? "🤖 מנתח…" : "🤖 נתח עם AI"}
            </button>
            <button
              className="report-export"
              disabled={lo == null || hi == null}
              onClick={onExport}
            >
              ⬇ ייצוא דוח
            </button>
          </div>

          {analysis.status === "done" && (
            <div className={"report-result " + aiVerdictClass(analysis.verdict)}>
              <div className="rr-verd">
                {analysis.verdict}
                <span className={"rr-src " + (analysis.source === "ai" ? "ai" : "quick")}>
                  {analysis.source === "ai" ? "🤖 ניתוח AI" : "⚡ אבחון מהיר"}
                </span>
              </div>
              <div className="rr-reason">{analysis.reason}</div>
              {typeof analysis.engineFlagged === "boolean" && (
                <div className={"rr-engine " + (analysis.engineFlagged ? "caught" : "missed")}>
                  {analysis.engineFlagged
                    ? "✓ האתר כבר סימן את הקטע הזה"
                    : "✗ האתר לא סימן את הקטע הזה"}
                </div>
              )}
              {analysis.engineMissReason && (
                <div className="rr-miss">
                  <b>למה האתר פספס:</b> {analysis.engineMissReason}
                </div>
              )}
              {analysis.verdict === "אמיתי" && (
                <button className="report-email" onClick={onEmail}>
                  ✉ שלחו את התקלה למפתח לבדיקה
                  <span className="re-sub">מוריד קובץ מפורט ופותח מייל מוכן ל-shlomihartman@gmail.com</span>
                </button>
              )}
            </div>
          )}
          {analysis.status === "error" && (
            <div className="report-result doubt"><div className="rr-reason">{analysis.msg}</div></div>
          )}
        </React.Fragment>
      )}
    </aside>
  );
}

// תווית כיוון מתוך שם הקו "מוצא<->יעד-עיר-idx"
function dirLabel(name) {
  if (!name) return "כיוון";
  const parts = String(name).split("<->");
  if (parts.length < 2) return name;
  return "אל " + parts[1].replace(/-\d+#?$/, "").trim();
}

function InfoModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal info-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>איך “קו באג” עובד?</h2>
          <button className="x" onClick={onClose}>×</button>
        </div>
        <p className="modal-note">
          המערכת סורקת את כל קווי התחבורה בעיר, משווה כל קו לשכניו, ומאתרת קטעים שבהם הקו נוסע דרך ארוכה מהנדרש:
        </p>
        <div className="how">
          <div className="how-row">
            <span className="how-step">1</span>
            <div>
              <b>קריאת נתוני ה-GTFS</b>
              <p>הקובץ הרשמי של משרד התחבורה מפורק לקווים, תחנות ומסלולים. המסלול המדויק של כל קו נלקח מ-shapes.txt — רצף נקודות הקואורדינטה לאורך הכביש.</p>
            </div>
          </div>
          <div className="how-row">
            <span className="how-step">2</span>
            <div>
              <b>הצמדת תחנות למסלול</b>
              <p>כל תחנה מוצמדת למיקומה המדויק לאורך מסלול הכביש, כך שאפשר למדוד את המרחק האמיתי שהקו נוסע בין כל שתי תחנות עוקבות — ולא מרחק אווירי.</p>
            </div>
          </div>
          <div className="how-row">
            <span className="how-dot detour"></span>
            <div>
              <b>3 · איתור עיקוף — דרך ארוכה מדי</b>
              <p>כששני קווים עוצרים באותן שתי תחנות אך אחד מהם עושה ביניהן דרך ארוכה בהרבה — קיים נתיב קצר יותר (כי הקו האחר נוסע בו). המערכת מסמנת את הקטע העודף בכתום, ואת הנתיב הקצר של קו-הייחוס בירוק.</p>
            </div>
          </div>
          <div className="how-row">
            <span className="how-dot ok"></span>
            <div>
              <b>4 · סינון התראות-שווא</b>
              <p>לפני שקטע מסומן, סדרת שערים גאומטריים מסננת מצבים שנראים כעיקוף אך אינם: תמרון-יציאה ממסוף, היפוך בתחנת-קצה, אשכולות תחנות צפופים, ושגיאות-דיגיטציה בנתונים. כך מצמצמים התראות-שווא.</p>
            </div>
          </div>
          <div className="how-row">
            <span className="how-dot ai"></span>
            <div>
              <b>5 · אימות (AI / אבחון מהיר)</b>
              <p>כל קטע חשוד מקבל הכרעה — <b>אמיתי</b> או <b>ספק</b>. כשמודל ה-AI זמין הוא מנתח את הקואורדינטות ומנמק (🤖 ניתוח AI); אחרת חישוב-חוקים דטרמיניסטי מכריע (⚡ אבחון מהיר). בכל מקרה החלטות-הברזל הגאומטריות שומרות על הדיוק.</p>
            </div>
          </div>
        </div>
        <p className="modal-hint">⚠️ גרסת בטא — כלי עזר לחקירה. מומלץ לאמת כל התראה על המפה לפני הסקת מסקנות. המסלול והמרחקים נלקחים מ-shapes.txt של משרד התחבורה (בערי הדמו — לפי מיקום התחנות).</p>
        <p className="modal-credit">
          נוצר על ידי <b>שלמה הרטמן</b> בעזרת קלוד · ליצירת קשר: <a href="mailto:shlomihartman@gmail.com">shlomihartman@gmail.com</a>
        </p>
      </div>
    </div>
  );
}

// בונה את הפרומפט לבוררות — קואורדינטות הקו הנבדק מול כמה קווים אחרים.
function buildVerdictPrompt(d) {
  const kindHe = d.kind === "spur" ? "פרסה (יציאה וחזרה לאותה נקודה כדי לשרת תחנה)"
    : d.kind === "loop" ? "סטייה קצרה מהנתיב הישר"
    : d.kind === "selfloop" ? "לולאת תקיפול-עצמי (הקו מתפתל וחוזר אחורה לאותו אזור)"
    : "עיקוף בין שתי תחנות";
  const fmtPath = (poly) => poly && poly.length
    ? poly.map((p) => `[${p[0]},${p[1]}]`).join(" ") : "(אין נתוני מסלול)";
  // קנה-מידה של המקטע והסטייה — לשער ציר-הכניסה תלוי-קנה-המידה.
  const extra = d.excessKm != null ? d.excessKm : ((d.lineRoadKm || 0) - (d.refRoadKm || 0));
  const segScaleKm = d.refRoadKm != null ? d.refRoadKm : (d.crowKm != null ? d.crowKm : (d.lineRoadKm || 0));
  // פער-רצף של קו-הייחוס (כמה תחנות-ביניים שונות הוא עובר בין A ל-B).
  const refGap = (d.referenceSequence && d.referenceSequence.gap != null) ? d.referenceSequence.gap : null;
  const refGapTxt = (refGap != null && refGap > 1) ? `, כאן ${refGap - 1} תחנת/ות ביניים` : "";
  const stopsList = (d.stopsInTravelOrder || [])
    .map((s, i) => `  ${i + 1}. ${s.name} (${s.lat},${s.lng})${s.servedByOtherLines && s.servedByOtherLines.length ? `  ← גם קווים: ${s.servedByOtherLines.join(", ")}` : "  ← רק הקו הנבדק עוצר כאן"}`)
    .join("\n");
  const refsBlock = (d.refLines || []).length
    ? d.refLines.map((r) => {
        const tag = r.loops ? "מתפתל גם הוא באזור" : "עובר ישר";
        const skip = (r.skipsStops && r.skipsStops.length)
          ? `  — מדלג על התחנות: ${r.skipsStops.join(", ")}`
          : ((r.servesStops && r.servesStops.length) ? "  — עוצר בכל תחנות הקטע" : "");
        return `קו ${r.number} (${tag})${skip}:\n  ${fmtPath(r.geometry)}`;
      }).join("\n\n")
    : "(אין קווים אחרים שעוברים באזור)";
  const refsHeading = d.refsAreGeographic
    ? "מסלולי קווים אחרים שעוברים גיאוגרפית באותו אזור (ייתכן מזהי-תחנות שונים) — השווה אם הם עוברים ישר בעוד הקו הנבדק מתפתל:"
    : "מסלולי הקווים האחרים בין אותן שתי תחנות:";
  // עובדות-עזר: ספירת הקווים האחרים שיש באזור (השוואת הישר/לולאה נעשית ע"י
  // ה-AI מהקואורדינטות עצמן — מדויק יותר מהיריסטיקה גסה של המנוע).
  const computedFacts = d.refsAreGeographic && d.refLines && d.refLines.length
    ? `\nיש ${d.refLines.length} קווים אחרים שעוברים באזור (מסלוליהם למעלה) — בדוק בעצמך מהקואורדינטות מי מהם עובר ישר ומי מתפתל.`
    : "";
  // ההכרעה מבוססת *גודל גיאומטרי* בראש ובראשונה. הקו סומן רק משום שקו-ייחוס
  // אחר מחבר את אותן שתי תחנות בדרך קצרה בהרבה — הוכחה מהשטח שהכביש פתוח וישר.
  // לולאה שמוסיפה מרחק רב = עיקוף אמיתי, *גם אם יש בה תחנות*. רק סטייה מתונה
  // שמשרתת תחנה ממש מחוץ-למסדרון עשויה להיחשב "כיסוי לגיטימי".
  // הכרעה לפי *יחס מרחקים בלבד* — אין שום סף מטרים אבסולוטי. אם הקו
  // הנבדק נוסע פי 1.4 ומעלה מקו-הייחוס בין אותן תחנות — עיקוף אמיתי,
  // גם אם יש בו תחנות וגם אם העודף במטרים קטן. מה שקו 9 עושה קצר — קו 16
  // חייב לעשות אותו דבר. רק אם כל הקווים מתפתלים שם זהה = מבנה כביש.
  const ratioVal = d.ratio || (d.refRoadKm > 0 ? d.lineRoadKm / d.refRoadKm : 0);
  const realByRatio = ratioVal >= 1.35;
  const decisiveFact = (d.refLines && d.refLines.length)
    ? (realByRatio
        ? `\n⚠️ עובדה מכריעה (יחס מרחקים): הקו הנבדק נוסע פי ${ratioVal.toFixed(2)} מקו ${d.refNumber} בין אותן שתי התחנות. ${d.approachAngleDiff != null && d.approachAngleDiff <= 90 ? `הפרש זווית-ההגעה ${d.approachAngleDiff}° (≤90°, אותו ציר) — קו-הייחוס תקף. ` : ""}**חוק יחס מוחלט: הפרש זווית ≤90° + יחס ≥1.35 ← "עיקוף אמיתי" באופן מוחלט.** חל איסור מוחלט לברוח דרך "מבנה כביש", "כביש מתפתל טבעי" או "רעש" — אלא אם קו-הייחוס עצמו עושה את אותה לולאה בדיוק (וקו ${d.refNumber} נוסע ישר, ולכן לא). **אל תמציא** שקווים אחרים "עוקבים את אותה צורה מתפתלת" — אם היו, הם לא היו קצרים יותר. קו ${d.refNumber} מוכיח שהכביש פתוח וישר.`
        : `\nℹ️ יחס מתון (פי ${ratioVal.toFixed(2)}) מול קו ${d.refNumber}. הכרע לפי יחס בלבד: אם כל הקווים באזור מתפתלים שם באותו אופן (מבנה כביש) → "כיסוי לגיטימי"; אם היחס קרוב ל-1.0 והקווים כמעט זהים → "רעש".`)
    : "";
  // חיווי סדר-תחנות כרונולוגי מפורש (מ-adjacentStopPair) — כדי שה-AI יבדיל
  // בוודאות בין תחנות *עוקבות* (מקטע אמיתי להשוואה) לבין קצוות-מסלול רחוקים.
  const ts = d.testedSequence, rs = d.referenceSequence;
  const arrow = (prev, a, b, next) =>
    `${prev ? `[${prev}] → ` : ""}"${a}" → "${b}"${next ? ` → [${next}]` : ""}`;
  const seqBlock = (ts && rs)
    ? `\nסדר תחנות (אינדקסים כרונולוגיים מאומתים):\n` +
      `  • הקו הנבדק ${d.lineNumber}: ${arrow(d.testedPrev, ts.fromName, ts.toName, d.testedNext)} — תחנות עוקבות ישירות (מקטע בודד).\n` +
      `  • קו הייחוס ${d.refNumber}: ${arrow(d.refPrev, rs.fromName || d.fromName, rs.toName || d.toName, d.refNext)} — פער ${rs.gap} בסדר הנסיעה (${rs.gap === 1 ? "עוקבות ישירות" : "עם " + (rs.gap - 1) + " תחנות-ביניים"}).\n` +
      (d.uTurnRevisit
        ? `  🔁 הלוך-חזור: התחנה "${d.uTurnRevisit}" חוזרת פעמיים ברצף הנסיעה של הקו הנבדק (א'→ב'→א') — פרסה מיותרת על אותו כביש. **זהו "עיקוף אמיתי" מיידי, ואסור לפסול בשל הפרש זווית-ההגעה של קו-הייחוס.**\n`
        : d.differentApproach
        ? `  ⚠️ כיווני הגעה שונים: הקו הנבדק מגיע למקטע מתחנה קודמת (${d.testedPrev || "—"}) שונה מזו של קו-הייחוס (${d.refPrev || "—"})${d.approachAngleDiff != null ? `, והפרש זווית-ההגעה הוא ${d.approachAngleDiff}°` : ""}. **${d.approachAngleDiff != null && d.approachAngleDiff > 90 ? `הפרש >90° = הקו-הייחוס מגיע מציר אחר/כיוון הפוך ברשת — הוא אינו חלופה תקפה להשוואה. העודף בקו הנבדק הוא תולדה ישירה של כיוון הגישה הפיזי שלו ⇒ "כיסוי לגיטימי עקב כיוון הגעה שונה", לא "אמיתי".` : `הפרש ≤90° = שני הקווים מגיעים מאותו ציר כללי — קו-הייחוס תקף, וההכרעה לפי יחס-מרחקים בלבד (יחס ≥1.4 ⇒ אמיתי, גם אם הכניסה מעט שונה).`}**\n`
        : `  שני הקווים מגיעים מאותו כיוון (תחנה קודמת זהה) — ההשוואה ישירה ותקפה.\n`) +
      `  המשמעות: שני הקווים מחברים את *אותן שתי תחנות* כמקטע מקומי רציף — ההשוואה אינה בין קצוות-מסלול רחוקים.\n`
    : "";
  return (
`אתה מנתח גאומטריית קווי תחבורה ציבורית. נתונות לך הקואורדינטות האמיתיות (lat,lng) של מסלול הקו הנבדק, ושל כמה קווים אחרים שמחברים את אותן שתי תחנות. השווה את הקואורדינטות בעצמך והכרע אם המסלול של הקו הנבדק באמת שונה (סטייה אמיתית), כמעט זהה (רעש-מדידה), או שהסטייה היא כדי לשרת תחנה שאחרים מדלגים עליה (כיסוי לגיטימי).

סוג חשוד: ${kindHe}
קו נבדק: ${d.lineNumber} — כיוון נסיעה: ${d.headsign || d.lineName}
מקטע נבדק: "${d.fromName}" → "${d.toName}"${d.apexName ? ` (דרך "${d.apexName}")` : ""}
${seqBlock}
תחנות הקו הנבדק בקטע, בסדר הנסיעה:
${stopsList}

מסלול הקו הנבדק (${d.lineNumber}) — קואורדינטות בסדר נסיעה:
  ${fmtPath(d.lineGeometry)}

${refsHeading}
${refsBlock}
${computedFacts}${decisiveFact}

מדד מכריע — יחס המרחקים: הקו הנבדק נוסע פי ${ratioVal.toFixed(2)} מקו-הייחוס הקצר (${d.refNumber}) בין אותן שתי התחנות. (המרחקים המוחלטים הם רק להקשר — אסור להכריע לפיהם.)

נתח בעצמך לפי הקואורדינטות:
1. עקוב אחרי הקואורדינטות של הקו הנבדק לפי סדר הנסיעה. האם הן יוצרות **לולאה / טיפה / יציאה-וחזרה** (הקו מתרחק ואז חוזר כמעט לאותה נקודה), או נתיב רציף וחלק? קו ${d.refNumber} מחבר את אותן שתי תחנות — השווה את אורכו ואת צורתו לקו הנבדק.

2. **שער עליון — חוק הלוך-חזור ותחנה כפולה (Absolute U-Turn Bypass) — קודם לכל השאר.** בדוק את רצף התחנות של הקו הנבדק בתוך המקטע (כולל תחנה קודמת ובאה). **אם תחנה כלשהי חוזרת פעמיים ברצף (מצב א'→ב'→א') — הקו מבצע נסיעת הלוך-חזור/פרסה מיותרת על אותו כביש. זהו "עיקוף אמיתי" (באג מסלול) באופן מיידי ומוחלט.** ${d.uTurnRevisit ? `**במקרה זה התחנה "${d.uTurnRevisit}" אכן חוזרת פעמיים ברצף — קבע "אמיתי".**` : ""} חל **איסור מוחלט** לפסול את הדיווח בשל הפרש זווית-הגעה (approachAngleDiff) של קו-הייחוס — שער זה גובר על שער פסילת-הכיוון.

3. **שער פסילת קו-ייחוס עקב כיווני הגעה שונים (Incompatible Approach Disqualification) — רק אם אין הלוך-חזור.** אם מופיעה אזהרת כיווני הגעה (תחנה קודמת שונה), בחן את הפרש זווית-ההגעה: **אם קו-הייחוס מגיע מציר אחר או מכיוון הפוך (הפרש זווית >90°) — הוא אינו חלופה לגיטימית להשוואה**, כי הוא נכנס לרשת ממקום אחר לגמרי. במצב כזה העודף או הלולאה בקו הנבדק הם תולדה ישירה של כיוון הגישה הפיזי שלו לרשת הרחובות ⇒ **"כיסוי לגיטימי עקב כיוון הגעה שונה"** — לא "עיקוף אמיתי", גם אם היחס גבוה. רק אם קו-הייחוס מגיע מאותו ציר כללי (הפרש ≤90°) — הוא תקף, והמשך לשער היחס.

4. **שער היחס (Ratio Only) — כשקו-הייחוס תקף (הפרש זווית ≤90°).** הקו סומן משום שקו ${d.refNumber} מחבר את אותן שתי התחנות — הוכחה מהשטח שהכביש פתוח. **חוק יחס מוחלט (Absolute Ratio Enforcement): אם הפרש הזווית ≤90° והיחס ≥1.4 — זוהי קביעה מוחלטת של "עיקוף אמיתי" (באג רישוי).** חל **איסור מוחלט** להשתמש בשערי "מבנה כביש", "כביש מתפתל טבעי" או "רעש" כדי להפוך זאת ל"כיסוי לגיטימי" — אלא אם כן קו-הייחוס עצמו מבצע **בדיוק את אותה לולאה גיאומטרית**. וזה לא יכול לקרות כאן: קו-הייחוס קצר יותר *דווקא משום שהוא נוסע ישר* — אם הוא נוסע ישר והיחס חורג, זה באג. אסור להמציא שקווים אחרים "עוקבים את אותה צורה" — אם היו עושים זאת, הם לא היו קצרים יותר. מה שקו 60 עושה ישר — קו 36 חייב לעשות אותו דבר.

5. **כיסוי לגיטימי — מבנה כביש (חל רק כשהיחס נמוך):** מותר **רק** אם קו-הייחוס עצמו מתפתל באותו אופן והיחס קרוב ל-1.0 (כלומר אין באמת קו ישר קצר באזור). אם קיים ולו קו-ייחוס אחד שעובר ישר עם יחס ≥1.4 — שער זה **פסול**.

6. חריג — רעש: רק אם היחס קרוב מאוד ל-1.0 (המסלולים כמעט זהים) והקואורדינטות מתנדנדות סביב אותו ציר בלי לולאה ממשית. אסור להשתמש ברעש כשהיחס ≥1.4.

הכלל המכריע (לפי סדר): (0א) בזבוז נטו אפס או זניח (פחות מ-60 מ' / 0.0 ק"מ) ← "כיסוי לגיטימי" מיידי, רעש דגימה — אסור בתכלית לקבוע "אמיתי". (0ב) קו-ייחוס שיוצא מנקודת מוצא רחוקה (מעל 10 ק"מ מנקודת המוצא של הקו הנבדק${d.originDistanceKm != null ? `, כאן ${d.originDistanceKm.toFixed(1)} ק"מ` : ""}) ← קו ייחוס לא תקין, "כיסוי לגיטימי". **(0ג1) אימות סדר-תחנות — פילטר כניסה לפני כל מדידת מרחק:** עיקוף יוכרז אך ורק אם רצף התחנות זהה — הקו הנבדק עובר A→B עוקבות, וגם קו-הייחוס עובר את אותן A→B *ישירות* (ללא תחנות-ביניים שונות). אם קו-הייחוס עובר A→C→B (רצף שונה${refGapTxt}) ← "כיסוי לגיטימי / לא ניתן להשוואה" — זו בחירת תכנון מסלול, לא עיקוף; אל תמדוד מרחק ואל תחשב יחס. **(0ג2) כיווניות מנוגדת — בכל אורך-מקטע:** אם וקטור-ההגעה הפוך (הפרש > 90°${d.approachAngleDiff != null ? `, כאן ${Math.round(d.approachAngleDiff)}°` : ""}) — הקווים מגיעים מצדדים מנוגדים, על צירי-נסיעה הפוכים (כמו קו 74 מדרום מול קו 418 מצפון). "לא ניתן להשוואה" — חל איסור מוחלט "להלביש" את מסלול-הייחוס ולדווח עיקוף, גם במקטע ארוך וגם בסטייה גדולה. (א) תחנה חוזרת ברצף *בתוך המקטע* סביב תחנת GTFS אמיתית (א'→ב'→א', מתחנת A בלבד) ← "אמיתי". לולאה ריקה (בלי תחנת GTFS חוזרת) היא רק כיוון ההגעה — לא באג. (ב) שער ציר-כניסה **תלוי קנה-מידה** (הסטייה במקטע ${extra != null ? extra.toFixed(1) : "?"} ק"מ, אורך המקטע ${segScaleKm != null ? segScaleKm.toFixed(1) : "?"} ק"מ): רק אם המקטע **קצר מ-1 ק"מ וגם הסטייה ≤0.5 ק"מ** — בדוק ציר-כניסה: אם המרחק בין התחנות-הקודמות > 300 מ'${d.prevApproachGapKm != null ? ` (כאן ${Math.round(d.prevApproachGapKm * 1000)} מ')` : ""} או הסטייה בוקטור-הכניסה ≥30°${d.approachAngleDiff != null ? ` (כאן ${Math.round(d.approachAngleDiff)}°)` : ""} או אין קו שחולק וקטור-כניסה ← "כיסוי לגיטימי" (תמרון גישה לצומת, כמו קו 5 מול קו 7). **חשוב:** במקטע ארוך (≥1 ק"מ, כמו קו 36 — 3.1 ק"מ) או כשהסטייה > 0.5 ק"מ — הפרשי התחנה-הקודמת **משניים**, אל תפסול בגללם. (ג) כלל אצבע: סטייה > 0.5 ק"מ במקטע אחד ← "אמיתי" (מסלול עוקף, לא כניסה לצומת). (ד) מקטע ארוך (≥1 ק"מ) ויחס ≥1.3 ← "אמיתי" גם אם נקודות-המוצא שונות. (ה) מקטע קצר עם ציר-כניסה זהה ויחס ≥1.35 ← "אמיתי". **(ה2) מקטע קצר (<1 ק"מ) שבו התחנה הקודמת שונה בין הקווים (כיוון הגעה שונה, גם אם הזווית ≤90°)${d.differentApproach ? " — כך במקרה זה" : ""} ← "ספק" (השוואה לא נקייה, נדרשת בדיקה אנושית; אסור "אמיתי" מוחלט). מקטע ארוך (≥1 ק"מ) פטור מכלל זה.** (ו) יחס נמוך מ-1.35 ← "רעש". (ז) העדר קו-ייחוס ← "ספק".

חשוב — חיתוך מקטע (Clip), חובה מוחלטת: נתח אך ורק את הקואורדינטות מ*נקודת העגינה של תחנה A* ועד תחנת היעד B. כל מה שקורה *לפני* שהקו הגיע לתחנה A (תמרון/פנייה/גישה לצומת/לולאה בכניסה) הוא "שטח מת" — חל איסור מוחלט לכלול אותו בחישוב המרחק, ביחס, או בזיהוי לולאות. אם ה"לולאה" קרתה לפני תחנה A — היא אינה קיימת לצורך הניתוח.
אסור להשתמש במילה "GPS" בתשובה.
חוק שפה מחמיר: כל הניתוח, ה-reason וה-verdict ייכתבו בעברית תקנית ורהוטה בלבד. חל איסור מוחלט לשלב ולו מילה, אות, תו או ביטוי בערבית (כולל מילות-קישור כגון مما يعني) — עברית בלבד.

החזר JSON בלבד: {"verdict":"אמיתי"|"רעש"|"כיסוי לגיטימי"|"לא ניתן להשוואה"|"ספק","reason":"משפט קצר בעברית — אם רצף-התחנות שונה (קו-הייחוס עובר A→C→B דרך תחנות-ביניים נוספות) או הכיוון מנוגד (הפרש זווית הגעה >90°, כמו קו 74 מול קו 418) או התחנות-הקודמות שונות ← 'לא ניתן להשוואה' (ציין את הסיבה: רצף/כיוון/תחנה קודמת שונה); אסור לסווג עיקוף על בסיס יחס-מרחק כשאין מסלול סדרתי משותף. אחרת ציין את יחס המרחקים (פי כמה); אם ≥1.4 ← אמיתי (ציין מול איזה קו); אם כל הקווים מתפתלים זהה ← כיסוי לגיטימי. אל תשתמש במילה GPS"}`
  );
}

// ── שכבת AI עצמאית (Production-Ready) ──────────────────────────────────────
// קריאת ה-AI אינה תלויה בחשבון המשתמש: אם הוגדר endpoint ייעודי בצד-שרת
// (window.KAVBUG_AI_ENDPOINT) — פונים אליו עם מפתח השרת; אחרת נופלים למנגנון
// המובנה. כל כשל תקשורת/זמינות נתפס וממיר לחישוב גיבוי דטרמיניסטי (לא קריסה).
// זמינות AI — תנאי אחיד לכל ה-flows (סקירה אוטומטית ראשית + דיווח על תקלה):
// קיים אם הוגדר endpoint ייעודי *או* מנגנון claude מובנה. כך שני המסלולים
// מפעילים AI בדיוק באותם תנאים (קודם נבדק רק claude, והסקירה דילגה כשהיה endpoint בלבד).
function aiAvailable() {
  return !!(window.KAVBUG_AI_ENDPOINT || (window.claude && window.claude.complete));
}

async function aiComplete(prompt) {
  const ep = window.KAVBUG_AI_ENDPOINT;
  if (ep) {
    const res = await fetch(ep, {
      method: "POST",
      headers: Object.assign(
        { "Content-Type": "application/json" },
        window.KAVBUG_AI_KEY ? { Authorization: "Bearer " + window.KAVBUG_AI_KEY } : {}
      ),
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) throw new Error("AI endpoint " + res.status);
    const j = await res.json();
    return j.completion || j.text || j.content || (typeof j === "string" ? j : "");
  }
  if (window.claude && window.claude.complete) {
    return window.claude.complete({ messages: [{ role: "user", content: prompt }] });
  }
  throw new Error("no-ai-backend");
}

// ניקוי שפה (חוק שפה מחמיר): מסיר כל תו/מילה בערבית מהתשובה, משאיר עברית בלבד.
function stripArabic(s) {
  if (!s) return s;
  return String(s)
    .replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,—–])/g, "$1")
    .trim();
}

// ── פסילה קשיחה לפי ציר-כניסה (Entry-Axis Hard Disqualifier) — תלוית-קנה-מידה ──
// השוואת יחס-מרחקים תקפה אך ורק כששני הקווים מגיעים לתחנה הראשונה במקטע (A)
// מאותו ציר-כניסה. אבל ההחמרה הזו מתאימה *רק למקטעים קצרים* (<1 ק"מ), שבהם
// "תחנה קודמת שונה" כמעט תמיד מעידה על תמרון גישה לצומת. במקטעים ארוכים — או
// כשהסטייה גדולה — הפרשי התחנה-הקודמת משניים, ועיקוף אמיתי גובר.
//   • סטייה > 0.5 ק"מ במקטע אחד  → מסלול עוקף, לא כניסה לצומת: דרישת זהות
//     התחנה-הקודמת מתבטלת לחלוטין (לא פוסל).
//   • מקטע ≥ 1 ק"מ               → הפרשי תחנה-קודמת משניים: לא פוסל.
//   • מקטע < 1 ק"מ והסטייה ≤0.5  → כאן בלבד פוסלים על ציר-כניסה שונה.
// מחזיר {bad, reason} או {bad:false}.
function entryAxisDisqualified(d) {
  if (!d) return { bad: false };
  const extra = d.excessKm != null ? d.excessKm : ((d.lineRoadKm || 0) - (d.refRoadKm || 0));
  // קנה-מידה של המקטע = המרחק הלגיטימי (קו-הייחוס), עם נפילה לקו-אווירי/הנבדק.
  const segKm = d.refRoadKm != null ? d.refRoadKm : (d.crowKm != null ? d.crowKm : (d.lineRoadKm || 0));
  // ── אימות סדר-תחנות (Sequence Validation) — פילטר-כניסה לפני כל מדידת מרחק ──
  // עיקוף יוכרז אך ורק כשרצף התחנות זהה: הקו הנבדק עובר A→B כשתי תחנות עוקבות,
  // וגם קו-הייחוס עובר את אותן A→B עוקבות *ישירות* (gap=1). אם קו-הייחוס עובר
  // דרך תחנות-ביניים שונות (A→C→B, gap>1) — זו בחירת תכנון מסלול, לא עיקוף, ואין
  // שום משמעות ליחס-מרחקים. עוצר לפני חישוב ה-1.4. (חל גם על מקרים כמו 74/418
  // שבהם הרצף/הסדר אינו זהה.)
  const refGap = (d.referenceSequence && d.referenceSequence.gap != null) ? d.referenceSequence.gap : null;
  if (refGap != null && refGap > 1) {
    const mid = refGap - 1;
    return { bad: true, verdict: "לא ניתן להשוואה", reason: `לא ניתן להשוואה — סדר תחנות שונה: קו ${d.refNumber} עובר דרך ${mid} תחנת/ות ביניים נוספת/ות בין "${d.fromName}" ל-"${d.toName}" (A→…→B), בעוד הקו הנבדק עובר ישירות. זו בחירת תכנון מסלול, לא עיקוף — אין משמעות ליחס-מרחקים.` };
  }
  // ── כיווניות מנוגדת (Opposite-Direction) — פסילה קשיחה בכל קנה-מידה ──────────
  // אם וקטור-ההגעה של הקו הנבדק הפוך מזה של קו-הייחוס (הפרש > 90°), הקווים מגיעים
  // לתחנה המשותפת מצדדים מנוגדים — הם על צירי-נסיעה הפוכים (כמו קו 74 מדרום מול
  // קו 418 מצפון). זו אינה השוואה תקפה בשום אורך-מקטע: חל איסור מוחלט "להלביש" את
  // מסלול-הייחוס ולדווח עיקוף. גובר גם על מקטעים ארוכים וגם על סטייה גדולה.
  const OPPOSITE_DEG = 90;
  if (d.approachAngleDiff != null && d.approachAngleDiff > OPPOSITE_DEG) {
    return { bad: true, verdict: "לא ניתן להשוואה", reason: `לא ניתן להשוואה — כיווניות מנוגדת: קו ${d.refNumber} מגיע לתחנה המשותפת מצד מנוגד (הפרש וקטור הגעה ${Math.round(d.approachAngleDiff)}° > 90°). הקווים על צירי נסיעה הפוכים — אין בסיס להשוואת מרחקים.` };
  }
  // כלל אצבע: סטייה גדולה = מסלול עוקף ממשי — בטל את דרישת התחנה-הקודמת.
  if (extra > 0.5) return { bad: false };
  // מקטע ארוך: הפרשי ציר-כניסה משניים — אל תפסול (כמו קו 36, מקטע 3.1 ק"מ).
  if (segKm >= 1.0) return { bad: false };
  // מקטע קצר (<1 ק"מ): "תחנה קודמת שונה" = ציר-כניסה שונה ⇒ לא ניתן להשוואה
  // (תחנות קודמות שונות, כמו קו 5 מול קו 7).
  const PREV_GAP_MAX_KM = 0.3;  // 300 מ' בין התחנות-הקודמות = ציר-כניסה שונה
  const APPROACH_MAX_DEG = 30;  // סטיית וקטור-כניסה
  if (d.approachIncompatible) {
    return { bad: true, verdict: "לא ניתן להשוואה", reason: `לא ניתן להשוואה — מקטע קצר (${segKm.toFixed(1)} ק"מ) ואין קו שחולק את ציר-הכניסה; מסלולי הגעה שונים לצומת, ההשוואה אינה תקפה.` };
  }
  if (d.prevApproachGapKm != null && d.prevApproachGapKm > PREV_GAP_MAX_KM) {
    return { bad: true, verdict: "לא ניתן להשוואה", reason: `לא ניתן להשוואה — מקטע קצר (${segKm.toFixed(1)} ק"מ) והתחנה הקודמת שלו (${d.testedPrev || "—"}) רחוקה ${Math.round(d.prevApproachGapKm * 1000)} מ' מזו של קו ${d.refNumber} (${d.refPrev || "—"}); תחנות קודמות שונות — אותו "מסלול סדרתי" אינו משותף.` };
  }
  if (d.approachAngleDiff != null && d.approachAngleDiff >= APPROACH_MAX_DEG) {
    return { bad: true, verdict: "לא ניתן להשוואה", reason: `לא ניתן להשוואה — מקטע קצר (${segKm.toFixed(1)} ק"מ) וסטיית וקטור הכניסה ${Math.round(d.approachAngleDiff)}° ≥ 30°; מסלולי הגעה שונים לצומת, ההשוואה אינה תקפה.` };
  }
  return { bad: false };
}

// ── תחנה קודמת שונה במקטע קצר ⇒ "ספק" (השוואה לא נקייה, בדיקה אנושית) ──────────
// אם הקו הנבדק וקו-הייחוס מגיעים לתחנת-המוצא של המקטע מ*תחנה קודמת שונה* (כיוון
// הגעה שונה) — אין ביניהם "מסלול סדרתי" משותף נקי, והסטייה הנמדדת עשויה לנבוע
// ממסלול-גישה שונה ולא מעיקוף ודאי. במקרה כזה אסור לקבוע "אמיתי" באופן מוחלט —
// הפסק הוא "ספק" (דורש בדיקה אנושית). זה מונע גם "המצאת תקלות" בערים צפופות
// (ירושלים) שבהן קווים רבים חולקים תחנות אך מגיעים מצירים שונים.
//   • מקטע ארוך (≥1 ק"מ) פטור — שם הפרש התחנה-הקודמת משני (קו 36 נשאר "אמיתי").
//   • כיוון מנוגד (>90°) כבר טופל קודם כ"לא ניתן להשוואה".
function differentApproachDoubt(d) {
  if (!d || !d.differentApproach) return false;
  const segKm = d.refRoadKm != null ? d.refRoadKm : (d.crowKm != null ? d.crowKm : (d.lineRoadKm || 0));
  if (segKm >= 1.0) return false;                                  // מקטע ארוך — פטור
  if (d.approachAngleDiff != null && d.approachAngleDiff > 90) return false; // מנוגד — טופל
  return true;
}
function differentApproachReason(d) {
  return `הקו הנבדק מגיע לתחנה "${d.fromName}" מתחנה קודמת (${d.testedPrev || "—"}) שונה מזו של קו ${d.refNumber} (${d.refPrev || "—"}). במקטע קצר זו אינה השוואה נקייה — ייתכן שהסטייה נובעת ממסלול גישה שונה ולא מעיקוף ודאי. נדרשת בדיקה אנושית.`;
}
// ── גיבוי דטרמיניסטי: אכיפת שערי הברזל לפי הסדר המחייב ──────────────────────
// שער שמתקיים חותם את ההחלטה מיד. משמש גם כשה-API לא נגיש, וגם כברירת-מחדל
// כשהמודל מחזיר תשובה לא תקינה. מחזיר {verdict, reason, fallback:true}.
function fallbackVerdict(d) {
  const extra = d.excessKm != null ? d.excessKm : ((d.lineRoadKm || 0) - (d.refRoadKm || 0));
  const ratio = d.ratio || (d.refRoadKm > 0 ? d.lineRoadKm / d.refRoadKm : 0);
  const NOISE_FLOOR_KM = 0.06; // 60 מ' — מתחת לזה: רעש דגימה, לא עיקוף
  const ORIGIN_MAX_KM = 10;    // טווח קרבה מרבי בין נקודות המוצא של שני הקווים
  // שער 1 — בזבוז אפס/רעש (קדימות עליונה): אם הבזבוז נטו אפס או מתחת לרצפת-הרעש,
  // עצור מיד — אסור בתכלית האיסור לקבוע 'עיקוף אמיתי' או להמשיך בחישובים.
  if (extra == null || Math.abs(extra) < NOISE_FLOOR_KM) {
    return { verdict: "כיסוי לגיטימי", reason: "אין בזבוז מרחק נטו (0.0 ק\"מ) — כיסוי לגיטימי עקב רעש דגימה גיאומטרי / מיקום רציפים.", fallback: true };
  }
  // שער 1.5 — וטו רצף-תחנות + כיווניות (קדימות עליונה, גובר גם על הלוך-חזור):
  // לפני כל השוואת יחס-מרחקים — אם רצף-התחנות שונה (A→C→B) או הכיוון מנוגד, או
  // (במקטע קצר) התחנה-הקודמת שונה — אין "מסלול סדרתי" משותף. ההשוואה פסולה,
  // והסטטוס הוא "לא ניתן להשוואה" — לא עיקוף, לא נספר כבאג אמיתי.
  const eax = entryAxisDisqualified(d);
  if (eax.bad) {
    return { verdict: eax.verdict || "לא ניתן להשוואה", reason: eax.reason, fallback: true };
  }
  // שער 0 — נקודת מוצא משותפת: אם נקודות-המוצא של הקו הנבדק וקו-הייחוס רחוקות
  // מדי, הקווים אינם על אותו ציר — קו-ייחוס לא תקין, אין להשוות (כמו 35↔333).
  if (d.originDistanceKm != null && d.originDistanceKm > ORIGIN_MAX_KM) {
    return { verdict: "כיסוי לגיטימי", reason: `קו ${d.refNumber || "הייחוס"} יוצא מנקודת מוצא רחוקה (${d.originDistanceKm.toFixed(1)} ק"מ) — קו ייחוס לא תקין, אין בסיס להשוואה.`, fallback: true };
  }
  // שער 2 — הלוך-חזור: תחנה חוזרת ברצף (א'→ב'→א'). מבטל את שער הזוויות.
  if (d.uTurnRevisit) {
    return { verdict: "אמיתי", reason: `התחנה "${d.uTurnRevisit}" חוזרת פעמיים ברצף הנסיעה (א'→ב'→א') — פרסה מיותרת על אותו כביש, עיקוף אמיתי.`, fallback: true };
  }
  // אין קו-ייחוס תקף — אי אפשר להכריע בשערים 3–4.
  if (!d.refNumber) {
    return { verdict: "ספק", reason: "אין קו ייחוס שמחבר את אותן שתי התחנות — לא ניתן להכריע.", fallback: true };
  }
  // שער 3 — תמרון כניסה לצומת (רדיוס ≤50 מ'): אם ה"לולאה" כולה מתרחשת בטווח
  // של כ-50 מ' מתחנת המוצא A (פנייה/כניסה לצומת ולא נסיעה מסביב), זהו תמרון
  // גישה לגיטימי ולא עיקוף — גם אם היחס נראה גבוה על מקטע קצרצר.
  if (d.junctionApproach) {
    return { verdict: "כיסוי לגיטימי", reason: `תמרון כניסה לצומת ברדיוס ~50 מ' מתחנת "${d.fromName}" — פנייה/גישה לצומת, לא עיקוף.`, fallback: true };
  }
  // שער 3.5 — תחנה קודמת שונה במקטע קצר ⇒ "ספק". כיוון הגעה שונה (תחנה קודמת
  // שונה) על מקטע קצר אינו השוואה נקייה — בדיקה אנושית, לא "אמיתי" אוטומטי.
  // (גובר על כלל-האצבע extra>0.5 שבא אחריו; מקטע ארוך פטור — קו 36 נשאר "אמיתי".)
  if (differentApproachDoubt(d)) {
    return { verdict: "ספק", reason: differentApproachReason(d), fallback: true };
  }
  // שער 4 — סיווג עיקוף לפי קנה-מידה. ציר-הכניסה כבר אומת (שער 1.5), כעת מכריעים:
  const segKm = d.refRoadKm != null ? d.refRoadKm : (d.crowKm != null ? d.crowKm : (d.lineRoadKm || 0));
  // (4א) כלל אצבע — סטייה > 0.5 ק"מ במקטע אחד: מסלול עוקף ודאי, עיקוף אמיתי.
  if (extra > 0.5) {
    return { verdict: "אמיתי", reason: `סטייה של ${extra.toFixed(1)} ק"מ במקטע אחד מול קו ${d.refNumber} (יחס פי ${ratio.toFixed(2)}) — מסלול עוקף ממשי, עיקוף אמיתי.`, fallback: true };
  }
  // (4ב) מקטע ארוך (≥1 ק"מ, כמו קו 36 — 3.1 ק"מ): יחס ≥1.3 ← עיקוף אמיתי, גם
  //      אם נקודות-המוצא שונות (הפרשי תחנה-קודמת משניים במקטע ארוך).
  if (segKm >= 1.0 && ratio >= 1.3) {
    return { verdict: "אמיתי", reason: `מקטע ארוך (${segKm.toFixed(1)} ק"מ) והקו נוסע פי ${ratio.toFixed(2)} מקו ${d.refNumber} — עיקוף אמיתי.`, fallback: true };
  }
  // (4ג) מקטע קצר עם ציר-כניסה זהה: יחס ≥1.35 ← עיקוף אמיתי. הסף תואם לסף הגלאי
  //      (XREF_RATIO=1.35) כדי שמסלול-הגיבוי יסכים עם ה-AI: כל מה שעבר את שער
  //      ציר-הכניסה (אותה תחנה קודמת, זווית ~0°) ויש בו בזבוז מעל רצפת-הרעש —
  //      הוא עיקוף אמיתי, לא "רעש" (כמו קו 70: יחס 1.38, אותו ציר, לולאה ברורה).
  if (ratio >= 1.35) {
    return { verdict: "אמיתי", reason: `הקו נוסע פי ${ratio.toFixed(2)} מקו ${d.refNumber} בין אותן שתי התחנות (אותו ציר כניסה${d.approachAngleDiff != null ? `, סטייה ${Math.round(d.approachAngleDiff)}°` : ""}) — עיקוף אמיתי.`, fallback: true };
  }
  // יחס נמוך מ-1.35 (מתחת לסף הגלאי) — תנודה זעירה סביב הציר.
  return { verdict: "רעש", reason: `יחס מרחקים פי ${ratio.toFixed(2)} בלבד מול קו ${d.refNumber} — תנודה זעירה סביב אותו ציר.`, fallback: true };
}

// מריץ בוררות אחת. חסין-קריסות: כל שגיאה/תשובה לא תקינה → גיבוי 4 השערים.
// לעולם אינו זורק — תמיד מחזיר {verdict, reason[, fallback]}.
async function runAIVerdict(d) {
  // פסילה קשיחה לפי ציר-כניסה — מוכרעת דטרמיניסטית *לפני* פניית ה-AI, כך
  // שהמודל לעולם אינו יכול לעקוף אותה ולסווג "עיקוף" על קווים מצירי-מוצא שונים.
  const eax = entryAxisDisqualified(d);
  if (eax.bad) return { verdict: eax.verdict || "לא ניתן להשוואה", reason: eax.reason, fallback: true };
  try {
    const txt = await aiComplete(buildVerdictPrompt(d));
    let v = null;
    try { v = JSON.parse(txt.match(/\{[\s\S]*\}/)[0]); } catch (_e) { v = null; }
    if (!v || !v.verdict) return fallbackVerdict(d);
    // רשת-ביטחון: גם אם המודל החזיר "אמיתי" בניגוד לכללים — אם ציר-הכניסה פסול,
    // כופים "כיסוי לגיטימי" (אסור עיקוף בנקודות-מוצא שונות).
    if (v.verdict === "אמיתי" && entryAxisDisqualified(d).bad) return fallbackVerdict(d);
    // רשת-ביטחון: תחנה קודמת שונה במקטע קצר — אסור "אמיתי" מוחלט. מורידים ל"ספק"
    // (השוואה לא נקייה, בדיקה אנושית) כדי למנוע "המצאת תקלות" בערים צפופות.
    if (v.verdict === "אמיתי" && differentApproachDoubt(d)) {
      return { verdict: "ספק", reason: differentApproachReason(d), fallback: true };
    }
    return { verdict: v.verdict, reason: stripArabic(v.reason || "") };
  } catch (_err) {
    return fallbackVerdict(d); // שגיאת תקשורת / API לא נגיש → גיבוי נקי, בלי שגיאה אדומה
  }
}

const aiVerdictClass = (vd) => vd === "אמיתי" ? "real" : vd === "רעש" ? "noise" : vd === "כיסוי לגיטימי" ? "cover" : vd === "לא ניתן להשוואה" ? "incomp" : "doubt";

// ייצוא נתוני קו בודד לקובץ JSON — לשליחה לבדיקת באג גאומטרי (כמו הירוק).
// כולל את כל מה שדרוש כדי לשחזר את הציר על המפה: תחנות, גאומטריית-הכביש לכל
// מקטע (_geom), ונתוני העיקוף (worst) עם הירוק כפי שחושב (refGeom) והאבחון.
// נבנה ישירות מאובייקט הקו שכבר יש לכרטיס — קובץ קטן וממוקד.
function exportLineDebug(line, cityName, members) {
  if (!line) return;
  const w = line.worst || null;
  const slim = (l) => l && {
    number: l.number, name: l.name, operator: l.operator,
    stops: (l.stops || []).map((s) => ({ id: s.id, name: s.name, lat: +(+s.lat).toFixed(6), lng: +(+s.lng).toFixed(6) })),
    geom: l._geom || null,   // גאומטריית-כביש לכל מקטע — מקור הקווים על המפה
    shape: l.shape || null,
  };
  const out = {
    kind: "kavbug-line-debug", version: 1, city: cityName || (line._city || ""),
    line: slim(line),
    worst: w ? {
      type: w.type, km: w.km, refNumber: w.refNumber, refKm: w.refKm,
      longKm: w.longKm,
      from: w.from && { id: w.from.id, name: w.from.name },
      to: w.to && { id: w.to.id, name: w.to.name },
      segIdx: w.segIdx, refSegIdx: w.refSegIdx,
      refGeom: w.refGeom,    // הירוק כפי שחושב בפועל
      diag: w.diag || null,
    } : null,
    // אם הכרטיס מאחד כמה קווים עם אותו עיקוף — מצרפים אותם גם כן
    mergedLines: (members && members.length > 1)
      ? members.map((m) => slim(m.line)).filter(Boolean)
      : null,
  };
  const blob = new Blob([JSON.stringify(out)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `kavbug-קו-${line.number}-${cityName || "עיר"}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// כרטיס תקלה — מציג הכרעת AI אוטומטית אם הגיעה, אחרת כפתור לבדיקה ידנית.
// members (אופציונלי) — רשימת קווים שאוחדו לאותו באג זהה, לפירוט per-line.
function AIVerdict({ w, auto, members }) {
  const [st, setSt] = React.useState(auto || { status: "idle" });
  React.useEffect(() => { if (auto) setSt(auto); }, [auto && auto.status, auto && auto.verdict]);
  const d = w && w.diag;
  const merged = members && members.length > 1;
  const ask = async (e) => {
    if (e) e.stopPropagation();
    if (!d) { setSt({ status: "error", msg: "אין נתוני מסלול" }); return; }
    setSt({ status: "loading" });
    // runAIVerdict חסין-קריסות: לעולם אינו זורק — נופל לגיבוי 4 השערים בעת כשל.
    const v = await runAIVerdict(d);
    setSt({ status: "done", verdict: v.verdict, reason: v.reason, fallback: v.fallback, source: v.fallback ? "quick" : "ai" });
  };
  // שרשרת תחנות-סמך (Flow Context) — נפרסת לרוחב הפאנל הנוכחי
  const chain = (prev, a, b, next) => [prev, a, b, next].filter(Boolean);
  const cls = aiVerdictClass(st.status === "done" ? st.verdict : "doubt");
  // הכרעה-לתצוגה לכל קו מאוחד: מ-auto אם הסתיים, אחרת חישוב גיבוי דטרמיניסטי.
  const memberVerdict = (m) => {
    if (m.auto && m.auto.status === "done") return { verdict: m.auto.verdict, reason: stripArabic(m.auto.reason || "") };
    return m.diag ? fallbackVerdict(m.diag) : { verdict: "ספק", reason: "" };
  };
  return (
    <div className="ai-verdict" onClick={(e) => e.stopPropagation()}>
      {st.status === "idle" && (
        <button className="ai-btn" onClick={ask}>🤖 בדיקת AI — ניתוח מסלול</button>
      )}
      {st.status === "loading" && <div className="ai-loading">מנתח קואורדינטות עם AI…</div>}
      {st.status === "error" && <div className="ai-err">{st.msg}</div>}
      {st.status === "done" && (
        <div className={"ai-analysis " + cls}>
          <div className="aa-head">
            <span className="ai-verd">{st.verdict}</span>
            <span className="aa-title">ניתוח מסלול AI{merged ? ` — קווים ${members.map((m) => m.number).join(", ")}` : (d ? ` — קו ${d.lineNumber}` : "")}</span>
            {(st.fallback || st.source === "quick") && <span className="aa-fallback" title="חושב במצב אבחון-מהיר לפי שערי ההחלטה (ה-AI לא היה נגיש כרגע)">⚡ אבחון מהיר</span>}
            <button className="ai-redo" onClick={ask} title="בדוק שוב">↻</button>
          </div>
          {merged && (
            <div className="aa-merged">
              <div className="aa-merged-lbl">פירוט לכל קו שאוחד</div>
              {members.map((m) => {
                const mv = memberVerdict(m);
                return (
                  <div key={m.number} className={"aa-merged-row " + aiVerdictClass(mv.verdict)}>
                    <span className="amr-num" style={{ background: m.color }}>{m.number}</span>
                    <span className="amr-verd">{mv.verdict}</span>
                    <span className="amr-reason">{mv.reason}</span>
                  </div>
                );
              })}
            </div>
          )}
          {!merged && d && (d.testedSequence || d.referenceSequence) && (
            <div className="aa-flow">
              <div className="aa-flow-lbl">רצף תחנות (סדר נסיעה)</div>
              {d.testedSequence && (
                <div className="seqrow">
                  <span className="seqlbl">קו {d.lineNumber} <span className="seqtag">נבדק</span></span>
                  <span className="seqchain">
                    {chain(d.testedPrev, d.testedSequence.fromName, d.testedSequence.toName, d.testedNext).map((nm, i, arr) => (
                      <React.Fragment key={i}>
                        <span className={"seqstop " + (nm === d.testedSequence.fromName || nm === d.testedSequence.toName ? "core" : "")}>{nm}</span>
                        {i < arr.length - 1 && <span className="seqarrow">←</span>}
                      </React.Fragment>
                    ))}
                  </span>
                </div>
              )}
              {d.referenceSequence && (
                <div className="seqrow">
                  <span className="seqlbl">קו {d.refNumber} <span className="seqtag ref">ייחוס</span></span>
                  <span className="seqchain">
                    {chain(d.refPrev, d.referenceSequence.fromName || d.fromName, d.referenceSequence.toName || d.toName, d.refNext).map((nm, i, arr) => (
                      <React.Fragment key={i}>
                        <span className={"seqstop " + (nm === (d.referenceSequence.fromName || d.fromName) || nm === (d.referenceSequence.toName || d.toName) ? "core" : "")}>{nm}</span>
                        {i < arr.length - 1 && <span className="seqarrow">←</span>}
                      </React.Fragment>
                    ))}
                  </span>
                </div>
              )}
              {d.differentApproach && st.verdict !== "אמיתי" && (
                <div className="aa-note">⚠️ הקווים מגיעים למקטע מתחנה קודמת שונה — ייתכן תמרון גישה/פנייה לצומת.</div>
              )}
            </div>
          )}
          <div className="aa-reason">{st.reason}</div>
        </div>
      )}
    </div>
  );
}

function ProblemCard({ line, active, onClick, auto, dim, members, cityName }) {
  const isOk = line.redundantCount === 0;
  const w = line.worst;
  const merged = members && members.length > 1;
  return (
    <div className={"card " + (active ? "active " : "") + (isOk ? "ok " : "") + (merged ? "merged " : "") + (dim ? "dim" : "")} onClick={onClick}>
      <div className="card-top">
        {merged ? (
          <div className="badge-stack">
            {members.map((m) => (
              <span key={m.number} className="badge-line" style={{ background: m.color }}>{m.number}</span>
            ))}
          </div>
        ) : (
          <span className="badge-line" style={{ background: line.color }}>{line.number}</span>
        )}
        <div className="card-route">
          <div className="name">{line.name}</div>
          <div className="op">{merged ? `${members.length} קווים — אותו עיקוף זהה` : line.operator}</div>
        </div>
        <span className={"sev " + line.severity}>{SEV_LABEL[line.severity]}</span>
      </div>
      {isOk ? (
        <div className="card-body ok-body">
          <span className="ok-text">✓ אין עיקופים מיותרים</span>
        </div>
      ) : w.type === "spur" ? (
        <React.Fragment>
          <div className="card-body detour">
            <div className="big orange">
              <span className="num">{fmt(w.km)}</span> <span className="un">ק"מ מיותרים</span>
            </div>
            <div className="why">
              <div className="why-row">
                <span className="why-lbl">הבעיה</span>
                <span>הקו עושה <b>פרסה</b> — יוצא מהנתיב כדי לעצור ב<b>{w.apex ? w.apex.name : w.to.name}</b> וחוזר כמעט לאותה נקודה.</span>
              </div>
              <div className="why-row">
                <span className="why-lbl">לעומת</span>
                <span>{w.refNumber != null
                  ? <React.Fragment>קו <b>{w.refNumber}</b> עובר באזור ישר, בלי הפרסה.</React.Fragment>
                  : <React.Fragment>קווים אחרים עוברים באזור <b>ישר</b>, בלי הפרסה.</React.Fragment>}</span>
              </div>
              <div className="why-row fix">
                <span className="why-lbl">המלצה</span>
                <span>לוותר על הפרסה — חיסכון של <b>{fmt(w.km)}</b> ק"מ בכל נסיעה.</span>
              </div>
            </div>
          </div>
          <div className="issue-tags">
            {line.spurCount > 0 && (
              <span className="itag"><span className="idot detour"></span>{line.spurCount} פרסה</span>
            )}
            {line.detourCount > 0 && (
              <span className="itag"><span className="idot detour"></span>{line.detourCount} עיקוף</span>
            )}
          </div>
        </React.Fragment>
      ) : w.type === "loop" ? (
        <React.Fragment>
          <div className="card-body detour">
            <div className="big orange">
              <span className="num">{fmt(w.km)}</span> <span className="un">ק"מ מיותרים</span>
            </div>
            <div className="why">
              <div className="why-row">
                <span className="why-lbl">הבעיה</span>
                <span>הקו עושה <b>סטייה קצרה מהנתיב הישר</b> בין <b>{w.from.name}</b> ל-<b>{w.to.name}</b>.</span>
              </div>
              <div className="why-row">
                <span className="why-lbl">לעומת</span>
                <span>{w.refNumber != null
                  ? <React.Fragment>קו <b>{w.refNumber}</b> עובר בין אותן תחנות ישר, ב-<b>{fmt(w.refKm)}</b> ק"מ.</React.Fragment>
                  : <React.Fragment>קווים אחרים עוברים באותו מקום <b>ישר</b>, בלי הסטייה.</React.Fragment>}</span>
              </div>
              <div className="why-row fix">
                <span className="why-lbl">המלצה</span>
                <span>לעבור ישר במקום לעקוף — חיסכון של <b>{fmt(w.km)}</b> ק"מ בכל נסיעה.</span>
              </div>
            </div>
          </div>
          <div className="issue-tags">
            {line.detourCount > 0 && (
              <span className="itag"><span className="idot detour"></span>{line.detourCount} עיקוף</span>
            )}
            {line.loopCount > 0 && (
              <span className="itag"><span className="idot detour"></span>{line.loopCount} סטייה</span>
            )}
          </div>
        </React.Fragment>
      ) : w.type === "selfloop" ? (
        <React.Fragment>
          <div className="card-body detour">
            <div className="big orange">
              <span className="num">{fmt(w.km)}</span> <span className="un">ק"מ מיותרים</span>
            </div>
            <div className="why">
              <div className="why-row">
                <span className="why-lbl">הבעיה</span>
                <span>הקו <b>מתפתל וחוזר אחורה</b> (לולאה) בין <b>{w.from.name}</b> ל-<b>{w.to.name}</b> — נוסע <b>{fmt(w.diag ? w.diag.lineRoadKm : w.km)}</b> ק"מ במקום קו אווירי של <b>{fmt(w.refKm)}</b> ק"מ.</span>
              </div>
              <div className="why-row">
                <span className="why-lbl">לעומת</span>
                <span>מעבר <b>ישר</b> בין שתי התחנות, בלי הלולאה.</span>
              </div>
              <div className="why-row fix">
                <span className="why-lbl">המלצה</span>
                <span>לוותר על הלולאה — חיסכון של <b>{fmt(w.km)}</b> ק"מ בכל נסיעה.</span>
              </div>
            </div>
          </div>
          <div className="issue-tags">
            {line.loopCount > 0 && (
              <span className="itag"><span className="idot detour"></span>{line.loopCount} לולאה</span>
            )}
          </div>
        </React.Fragment>
      ) : (
        <React.Fragment>
          <div className="card-body detour">
            <div className="big orange">
              <span className="num">{fmt(w.km)}</span> <span className="un">ק"מ מיותרים</span>
            </div>
            <div className="why">
              <div className="why-row">
                <span className="why-lbl">הבעיה</span>
                <span>בין <b>{w.from.name}</b> ל-<b>{w.to.name}</b> הקו נוסע <b>{fmt(w.longKm)}</b> ק"מ דרך עוקפת.</span>
              </div>
              <div className="why-row">
                <span className="why-lbl">לעומת</span>
                <span>קו <b>{w.refNumber}</b> מחבר את אותן שתי תחנות ב-<b>{fmt(w.refKm)}</b> ק"מ בלבד.</span>
              </div>
              <div className="why-row fix">
                <span className="why-lbl">המלצה</span>
                <span>לקצר את הקטע לדרך של קו <b>{w.refNumber}</b> ולחסוך <b>{fmt(w.km)}</b> ק"מ בכל נסיעה.</span>
              </div>
            </div>
          </div>
          <div className="issue-tags">
            {line.detourCount > 0 && (
              <span className="itag"><span className="idot detour"></span>{line.detourCount} עיקוף</span>
            )}
            {line.loopCount > 0 && (
              <span className="itag"><span className="idot detour"></span>{line.loopCount} סטייה</span>
            )}
          </div>
        </React.Fragment>
      )}
      {!isOk && w && <AIVerdict w={w} auto={auto} members={members} />}
      {!isOk && w && (
        <button
          className="card-export"
          onClick={(e) => { e.stopPropagation(); exportLineDebug(line, cityName, members); }}
          title="הורדת נתוני הקו (כולל אבחון העיקוף) לקובץ — לשליחה לבדיקה"
        >
          ⬇ הורדת נתוני הקו לבדיקה
        </button>
      )}
    </div>
  );
}

function Stats({ city }) {
  return (
    <div className="stats">
      <div className="stat">
        <div className="v">{city.totalLines}</div>
        <div className="k">קווים נסרקו</div>
      </div>
      <div className="stat">
        <div className={"v " + (city.flaggedCount ? "alert" : "")}>{city.flaggedCount}</div>
        <div className="k">קווים עם באג</div>
      </div>
      <div className="stat">
        <div className={"v " + (city.totalWasted ? "alert" : "")}>{fmt(city.totalWasted)}</div>
        <div className="k">ק"מ מיותרים</div>
      </div>
    </div>
  );
}

function Breakdown({ city }) {
  if (!city.flaggedCount) return null;
  return (
    <div className="breakdown">
      <div className="bd-item">
        <span className="idot detour"></span>
        <b>{city.detourTotal}</b> עיקופים בין תחנות
      </div>
      {city.spurTotal > 0 && (
        <div className="bd-item">
          <span className="idot detour"></span>
          <b>{city.spurTotal}</b> פרסות (יציאה וחזרה)
        </div>
      )}
      <div className="bd-item">
        <span className="idot loop"></span>
        <b>{city.loopTotal}</b> סטיות קצרות מהנתיב
      </div>
    </div>
  );
}

function Panel({ city, activeIdx, setActiveIdx, aiReview }) {
  const [filterMode, setFilterMode] = React.useState("real"); // real | doubt
  const rv = aiReview || { verdicts: {}, total: 0, done: 0, active: false };
  const keyOf = (line) => line.number + "|" + line.name;
  const flagged = city.lines.map((line, i) => ({ line, i })).filter((x) => x.line.redundantCount > 0);
  // קטגוריית הכרעה לכל קו. *לעולם לא מעלימים* — רק מתייגים וממיינים. קו שטרם
  // נבדק או שה-AI אישר כ"אמיתי" => קבוצת "אמיתי/לבדיקה"; רעש/כיסוי/ספק => "בספק".
  const verdictOf = (line) => {
    const v = rv.verdicts[keyOf(line)];
    return v && v.status === "done" ? v.verdict : null;
  };
  const isDoubt = (line) => {
    const vd = verdictOf(line);
    return vd === "רעש" || vd === "כיסוי לגיטימי" || vd === "ספק" || vd === "לא ניתן להשוואה";
  };
  const confirmedCount = flagged.filter((x) => verdictOf(x.line) === "אמיתי").length;
  const doubtCount = flagged.filter((x) => isDoubt(x.line)).length;
  const pendingCount = Math.max(0, flagged.length - confirmedCount - doubtCount);
  // תיאור סיכום דינמי — מציג אך ורק סטטוסים שערכם > 0 (אסור להציג ערך 0).
  // אם "בספק" = 0 → "אמיתיים ולבדיקה בלבד"; אם רק קטגוריה אחת → היא בלבד; וכו'.
  const statusSummary = () => {
    const present = [];
    if (confirmedCount > 0) present.push("אמיתיים");
    if (pendingCount > 0) present.push("לבדיקה");
    if (doubtCount > 0) present.push("בספק");
    if (!present.length) return "אין באגים פעילים";
    const joined = present.length === 1
      ? present[0]
      : present.slice(0, -1).join(", ") + " ו" + present[present.length - 1];
    return joined + (present.length < 3 ? " בלבד" : "");
  };
  // מיון: אמיתי תחילה, אחר כך ממתינים, ואז בספק (אך כולם נשארים ברשימה).
  const rank = (line) => {
    const vd = verdictOf(line);
    if (vd === "אמיתי") return 0;
    if (vd == null) return 1;          // טרם נבדק / ממתין
    return 2;                          // בספק (רעש/כיסוי/ספק)
  };
  const sorted = [...flagged].sort((a, b) => {
    const r = rank(a.line) - rank(b.line);
    return r !== 0 ? r : (b.line.wasted - a.line.wasted);
  });
  const visible = sorted.filter((x) => {
    if (filterMode === "real") return !isDoubt(x.line);
    if (filterMode === "doubt") return isDoubt(x.line);
    return true; // "all" — כל 34 החשדים
  });
  // ── איחוד באגים זהים (Identical Bug Consolidation) ──
  // אם אותו מקטע (מוצא→יעד) מול אותו קו-ייחוס מופיע בכמה קווים נבדקים (כמו 67/70),
  // מאחדים אותם לכרטיס אחד. החתימה מורכבת ממזהי תחנות-הקצה ומספר קו-הייחוס.
  const sigOf = (line) => {
    const ww = line.worst;
    if (!ww || !ww.from || !ww.to) return null;
    return `${ww.from.id}→${ww.to.id}@${ww.refNumber == null ? "-" : ww.refNumber}`;
  };
  const groups = [];
  const bySig = {};
  visible.forEach(({ line, i }) => {
    const s = sigOf(line);
    const member = {
      line, i, number: line.number, color: line.color,
      diag: line.worst && line.worst.diag,
      auto: rv.verdicts[keyOf(line)],
    };
    if (s && bySig[s]) {
      // איחוד באגים זהים — אך כל מספר-קו פעם אחת בלבד (דה-דופ, מונע "35, 35").
      if (!bySig[s].members.some((m) => String(m.number) === String(member.number))) {
        bySig[s].members.push(member);
      }
      return;
    }
    const g = { key: s || (line.number + "|" + line.name), members: [member] };
    if (s) bySig[s] = g;
    groups.push(g);
  });
  return (
    <aside className="panel">
      <Stats city={city} />
      <Breakdown city={city} />
      <div className="list-head">
        <h3 className="list-title">
          קווים עם באג
          <span className="lh-count">
            {rv.active
              ? `(ה-AI בודק… ${rv.done}/${rv.total})`
              : <bdi>{"— " + statusSummary()}</bdi>}
          </span>
        </h3>
      </div>
      {flagged.length > 0 && (rv.done > 0) && (
        <div className="seg-filter" role="tablist">
          <button className={"seg" + (filterMode === "real" ? " on" : "")} onClick={() => setFilterMode("real")}>אמיתי {flagged.length - doubtCount}</button>
          <button className={"seg" + (filterMode === "doubt" ? " on" : "")} onClick={() => setFilterMode("doubt")}>ספק {doubtCount}</button>
        </div>
      )}
      <div className="cards">
        {city.flaggedCount === 0 && (
          <div className="all-ok">✓ לא זוהו תקלות בעיר זו</div>
        )}
        {groups.map((g) => {
          const primary = g.members[0];
          const isMerged = g.members.length > 1;
          const activeHere = g.members.some((m) => activeIdx === m.i);
          return (
            <ProblemCard
              key={g.key}
              line={primary.line}
              active={activeHere}
              onClick={() => setActiveIdx(primary.i)}
              auto={primary.auto}
              dim={isDoubt(primary.line)}
              members={isMerged ? g.members : null}
              cityName={city.name}
            />
          );
        })}
      </div>
    </aside>
  );
}

Object.assign(window, { TopBar, Panel, ReportPanel, Stats, ProblemCard, UploadModal, InfoModal, CITY_PRESETS, fmt, SEV_LABEL, KAVBUG_VERSION, runAIVerdict, buildVerdictPrompt, dirLabel, aiComplete, aiAvailable, fallbackVerdict, stripArabic });
