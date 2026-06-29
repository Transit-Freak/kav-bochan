const { useState, useEffect, useRef, useMemo } = React;

// קטגוריות הזיהוי — צבע, תווית והסבר
const CATS = {
  mismatch: { label: "אי-התאמה מלאה", color: "#dc2626", desc: "הרחוב לא מופיע בשם כלל" },
  reversal: { label: "היפוך / ציון-דרך", color: "#7c3aed", desc: "הרחוב האמיתי מופיע שני בשם" },
  spelling: { label: "טעות כתיב", color: "#d97706", desc: "אותו רחוב, אות שונה — כנראה שגיאה" },
  uncertain: { label: "ספק / כתיב חלופי", color: "#64748b", desc: "כנראה אותו רחוב — הבדל כתיב מלא/חסר בלבד" },
};

// אייקון לסוג נקודת העניין (POI) מ-OpenStreetMap
const POI_ICON = {
  school: "🏫", academia: "🎓", health: "🏥", mall: "🛒", train: "🚉",
  worship: "🕍", police: "🚓", fire: "🚒", library: "📚", community: "🏘️",
  gov: "🏛️", culture: "🎭", busstation: "🚌", park: "🌳", sport: "⚽",
};

// כל פרטי התחנה — משותף לפאנל שעל המפה ולשורה ברשימה.
// inList=true: מדלג על שדות שכבר מוצגים בכותרת השורה (מספר, רחוב, עיר)
function StopDetails({ s, inList }) {
  return (
    <>
      {!inList && <div className="d-row">מס׳ תחנה: <b>{s.c}</b></div>}
      {!inList && <div className="d-row">רחוב בכתובת: <b>{s.s}</b></div>}
      {s.ms && (
        <div className="d-row">🗺️ רחוב לפי המפה: <b>{s.ms}</b> <span className="d-poi-d">{s.md} מ׳</span></div>
      )}
      {!inList && s.t && <div className="d-row">עיר: {s.t}</div>}
      <div className="d-cat" style={{ color: CATS[s.k].color }}>
        {CATS[s.k].label} — {CATS[s.k].desc}
      </div>
      {s.sug && (
        <div className="d-sug">💡 שם מוצע (לפי הרחובות במפה): <b>{s.sug}</b></div>
      )}
      {s.p && s.p.length > 0 && (
        <div className="d-poi">
          <div className="d-poi-h">📍 ליד התחנה (OSM):</div>
          {s.p.map((x, i) => (
            <div className="d-poi-row" key={i}>
              <span>{POI_ICON[x.k] || "•"} {x.n}</span>
              <span className="d-poi-d">{x.d} מ׳</span>
            </div>
          ))}
        </div>
      )}
      {s.la != null && (
        <a className="gmap" href={"https://www.google.com/maps?q=" + s.la + "," + s.lo} target="_blank" rel="noopener noreferrer">
          פתח במפות Google ↗
        </a>
      )}
    </>
  );
}

function App() {
  const [data, setData] = useState(null);
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const mapRef = useRef(null);
  const markRef = useRef(null);

  useEffect(() => {
    fetch("data.json?v=" + window.NS_BUILD)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ counts: {}, stops: [] }));
  }, []);

  // אתחול מפה
  useEffect(() => {
    if (mapRef.current || !document.getElementById("map")) return;
    const m = L.map("map", { center: [31.6, 34.9], zoom: 8, zoomControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap", maxZoom: 19,
    }).addTo(m);
    mapRef.current = m;
  }, [data]);

  // מעבר לתחנה הנבחרת
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !sel || sel.la == null) return;
    m.flyTo([sel.la, sel.lo], 17, { duration: 0.6 });
    if (markRef.current) markRef.current.remove();
    markRef.current = L.marker([sel.la, sel.lo])
      .addTo(m)
      .bindPopup("<b>" + esc(sel.n) + "</b><br>רחוב בכתובת: " + esc(sel.s) + "<br>" + esc(sel.t))
      .openPopup();
  }, [sel]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const qn = q.trim();
    return data.stops.filter(
      (s) =>
        (cat === "all" || s.k === cat) &&
        (!qn || (s.t && s.t.indexOf(qn) >= 0) || s.n.indexOf(qn) >= 0 || s.c.indexOf(qn) >= 0 || s.s.indexOf(qn) >= 0)
    );
  }, [data, cat, q]);

  if (!data) return <div className="boot">טוען נתונים…</div>;
  const CAP = 600;
  const shown = filtered.slice(0, CAP);

  return (
    <div className="app">
      <header className="hdr">
        <div className="brand">
          <div className="logo">🚏</div>
          <div className="brand-txt">
            <h1>התחנה הבאה</h1>
            <p>תחנות אוטובוס ששמן אינו תואם לרחוב שבכתובת הרשמית</p>
          </div>
        </div>
        <div className="src">נתונים: משרד התחבורה (GTFS) · נבנה ע"י שלמה הרטמן</div>
      </header>

      <div className="stats">
        <button className={"stat" + (cat === "all" ? " on" : "")} onClick={() => setCat("all")}>
          <b>{data.stops.length.toLocaleString()}</b>
          <span>סה"כ חשודות</span>
        </button>
        {Object.keys(CATS).map((k) => (
          <button
            key={k}
            className={"stat" + (cat === k ? " on" : "")}
            style={{ "--c": CATS[k].color }}
            onClick={() => setCat(cat === k ? "all" : k)}
            title={CATS[k].desc}
          >
            <b style={{ color: CATS[k].color }}>{(data.counts[k] || 0).toLocaleString()}</b>
            <span>{CATS[k].label}</span>
          </button>
        ))}
      </div>

      <div className="body">
        <div className="panel">
          <input
            className="search"
            placeholder="חיפוש: עיר / שם תחנה / מספר…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="count">
            מציג {shown.length.toLocaleString()} מתוך {filtered.length.toLocaleString()}
            {filtered.length > CAP ? " — צמצמו בחיפוש כדי לראות את השאר" : ""}
          </div>
          <div className="list">
            {shown.map((s, i) => {
              const on = sel && sel.c === s.c;
              return (
                <div className={"item" + (on ? " on" : "")} key={s.c + "_" + i}>
                  <button className="it-head" onClick={() => setSel(s)}>
                    <div className="it-top">
                      <span className="badge" style={{ background: CATS[s.k].color }}>{CATS[s.k].label}</span>
                      <span className="code">{s.c}</span>
                    </div>
                    <div className="it-name">{s.n}</div>
                    <div className="it-street">
                      רחוב בכתובת: <b>{s.s}</b>
                      {s.t ? " · " + s.t : ""}
                    </div>
                  </button>
                  <div className="it-detail">
                    <StopDetails s={s} inList />
                  </div>
                </div>
              );
            })}
            {shown.length === 0 && <div className="empty">לא נמצאו תחנות בסינון הנוכחי.</div>}
          </div>
        </div>

        <div className="map-wrap">
          <div id="map"></div>
          {sel && (
            <div className="detail">
              <button className="d-x" onClick={() => setSel(null)}>×</button>
              <div className="d-name">{sel.n}</div>
              <StopDetails s={sel} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
