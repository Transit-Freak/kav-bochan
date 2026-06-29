const { useState, useEffect, useRef, useMemo } = React;

// קטגוריות הזיהוי — צבע, תווית והסבר
const CATS = {
  spelling: { label: "טעות כתיב", color: "#d97706", desc: "אותו רחוב, מאוית אחרת" },
  reversal: { label: "היפוך / ציון-דרך", color: "#7c3aed", desc: "הרחוב האמיתי מופיע שני בשם" },
  mismatch: { label: "אי-התאמה מלאה", color: "#dc2626", desc: "הרחוב לא מופיע בשם כלל" },
};

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
            {shown.map((s, i) => (
              <button
                key={s.c + "_" + i}
                className={"item" + (sel && sel.c === s.c ? " on" : "")}
                onClick={() => setSel(s)}
              >
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
            ))}
            {shown.length === 0 && <div className="empty">לא נמצאו תחנות בסינון הנוכחי.</div>}
          </div>
        </div>

        <div className="map-wrap">
          <div id="map"></div>
          {sel && (
            <div className="detail">
              <button className="d-x" onClick={() => setSel(null)}>×</button>
              <div className="d-name">{sel.n}</div>
              <div className="d-row">מס׳ תחנה: <b>{sel.c}</b></div>
              <div className="d-row">רחוב בכתובת: <b>{sel.s}</b></div>
              {sel.t && <div className="d-row">עיר: {sel.t}</div>}
              <div className="d-cat" style={{ color: CATS[sel.k].color }}>
                {CATS[sel.k].label} — {CATS[sel.k].desc}
              </div>
              {sel.la != null && (
                <a className="gmap" href={"https://www.google.com/maps?q=" + sel.la + "," + sel.lo} target="_blank" rel="noopener noreferrer">
                  פתח במפות Google ↗
                </a>
              )}
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
