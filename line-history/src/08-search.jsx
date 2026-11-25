/* הקו בזמן · 08-search.jsx — חיפוש קווים: תוצאות 2012, קיבוץ תוצאות, שמות ערים ושמות מסלול.
   חלק מ-line-history/src (הסדר ב-files.json). כל החלקים מחוברים לפי הסדר ומקומפלים יחד בדפדפן (index.html),
   כך שכל השמות משותפים בין החלקים כמו בקובץ אחד. */

/* ---------- שינויים לפי יום (כל הקווים) ---------- */
/* ---------- תוצאות מצילום 2012 ---------- */
// חיפוש "548" החזיר את הקו כפי שהוא היום — קרית מלאכי לכפר חב"ד — ולא רמז
// שב-2012 היה 548 אחר, של אגד, מקרית מלאכי לבני ברק. הוא לא נעלם מהאתר:
// הוא נמצא רק בצילום 2012, כי הארכיון של הפיד מתחיל במרץ 2017 והקו כבר לא
// היה שם. מי שמחפש מספר קו צריך לראות גם את זה.
// חיפוש בקווי 2012: "1 קרית מלאכי" = מספר קו + טקסט (שלמה 06.09: החיפוש לא
// מצא כלום, כי המחרוזת כולה הושוותה למספר הקו). התוצאות ממוינות לפי מספר
// הקו, ומספר מדויק לפני מספר שרק מתחיל כך (חיפוש "קרית מלאכי" החזיר את 301 ראשון).
function parse12(needle) {
  const m = /^\s*(\d+[א-ת]?)?\s*(.*)$/.exec(needle || "");
  return { no: (m && m[1]) || "", text: ((m && m[2]) || "").trim() };
}
function match12(v, needle) {
  const { no, text } = parse12(needle);
  if (!no && !text) return true;
  const vno = String(v.no || "");
  if (no && !(vno === no || (!text && vno.startsWith(no)))) return false;
  if (text && !((v.dest || "").includes(text) || (v.an || "").includes(text))) return false;
  return true;
}
function lineNum(no) { const m = /^(\d+)/.exec(String(no || "")); return m ? parseInt(m[1], 10) : 1e9; }
function sort12(list, needle) {
  const { no } = parse12(needle);
  return list.slice().sort((a, b) => {
    if (no) { const ea = String(a.no) === no ? 0 : 1, eb = String(b.no) === no ? 0 : 1; if (ea !== eb) return ea - eb; }
    return lineNum(a.no) - lineNum(b.no) || String(a.no).localeCompare(String(b.no), "he") || (a.dest || "").localeCompare(b.dest || "", "he");
  });
}
function Res2012({ needle, onOpen }) {
  const [idx12, setIdx12] = useState(null);
  useEffect(() => {
    if (!needle || idx12) return;
    fetch("../magihim-2012/data/index.json?v=" + BUILD)
      .then((r) => (r.ok ? r.json() : { lines: [] }))
      .then(setIdx12).catch(() => setIdx12({ lines: [] }));
  }, [needle, idx12]);
  if (!needle || !idx12) return null;
  const found = sort12((idx12.lines || []).filter((v) => match12(v, needle)), needle), list = found.slice(0, 12);
  if (!list.length) return null;
  return (
    <div className="r12">
      <div className="r12head">בצילום 2012 נמצאו גם <b>{found.length}</b> קווים תואמים{found.length > list.length ? " (מוצגים " + list.length + ")" : ""} —
        רשת מגיעים, חמש שנים לפני תחילת הארכיון</div>
      {list.map((v) => (
        <a key={v.k} className="lrow" href={"#2012/" + v.k}
          onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); onOpen(v.k); }}>
          <span className="badge sm">{v.no}</span>
          <span className="k" style={{ background: "#78350f" }}>2012</span>
          <span className="ldest">{v.dest}</span>
          <span className="lmeta">{v.an} · {v.ns} תחנות · רצף התחנות ←</span>
        </a>
      ))}
    </div>
  );
}

/* ---------- שינויים לפי יום (כל הקווים) ---------- */
/* ---------- ביטולים ---------- */
// היה כאן מסך מקובץ משלו — כותרת, מונים ושורת שנים. זו הייתה קטגוריה בתוך
// קטגוריה: מי שמסמן "מבוטל" מצפה לרשימת הקווים הרגילה, כמו בכל קטגוריה
// אחרת, ולא למסך אחר עם חוקים אחרים. הביטולים מוצגים ברשימה הרגילה.

// Display grouping only. Historic route IDs and current license IDs never merge.
function attach2012Groups(idx, data) {
  const rows = new Map((idx.lines || []).map(l => [l.rd, l]));
  const tags = new Map();
  for (const g of data.groups || []) {
    const members = g.members.map(([id, from, to]) => ({rd: "archive2012r" + id + "-0-H", from, to}));
    const valid = members.every(m => {
      const l = rows.get(m.rd), parts = String(l?.dest || "").split("<->");
      const cities = parts.map(p => p.slice(p.lastIndexOf("-") + 1).trim().replace(/\s+/g, " ")).sort();
      return l && l.op === g.op && l.line === g.line && parts.length === 2 &&
        JSON.stringify(cities) === JSON.stringify(g.cities) && !tags.has(m.rd);
    });
    if (!valid || members.length < 2) continue;
    const key = "historical-2012:" + members[0].rd;
    for (const m of members) tags.set(m.rd, {hgroup: key, hfrom: m.from, hto: m.to});
  }
  return {...idx, lines: idx.lines.map(l => tags.has(l.rd) ? {...l, ...tags.get(l.rd)} : l)};
}
// קיבוץ תוצאות החיפוש (שלמה 08.10): כרטיס אחד לכל קו — לפי המק"ט — והכיוונים והחלופות בתוכו.
// שורות בלי מק"ט (ארכיון 2012, אתרי מידע) מצטרפות לקו עם אותו מספר, מפעיל ועיר קצה.
// קווים שרק מתחילים במספר שחיפשו מופיעים אחריהם, תחת "קווים דומים".
// היעד בנוי כך: "תחנה-עיר<->תחנה-עיר-<כיוון><חלופה>"; העיר היא הקטע האחרון בכל צד
const endCities = (d) => String(d || "").replace(/-\d+[#א-ת]?$/, "").split("<->").map((s) => { const p = s.split("-"); return p[p.length - 1].trim(); }).filter(Boolean);
function groupSearch(list, needle) {
  const num = citySearchNorm(needle || "").split(/\s+/).find((t) => /^\d+[א-ת]?$/.test(t)) || null;
  const groups = [], byKey = new Map(), loose = [];
  const add = (key, l) => { let g = byKey.get(key); if (!g) { g = { key, line: l.line, op: l.op, items: [] }; byKey.set(key, g); groups.push(g); } g.items.push(l); };
  // מוניות מחופש המידע: מק"ט אחד יכול להיות כמה קווים (5104104 = קו 4 וקו 5א) — כרטיס לכל מספר
  for (const l of list) { const mk = String(l.rd).split("-")[0]; if (/^\d+$/.test(mk) && String(l.rd).includes("-")) add(l.foi && l.tt === "taxi" ? mk + "|" + (l.line || "") : mk, l); else loose.push(l); }
  for (const l of loose) {
    // רשומת ארכיון מצטרפת לכרטיס של מק"ט רק כששני הקצוות שלה זהים לאחת החלופות — עיר משותפת אחת
    // לא מספיקה (449 אופקים–ירושלים מ-2012 צורף ל-449 קרית גת–ירושלים, שלמה 09.10: "לעשות לפי מק"ט")
    const cs = endCities(l.dest);
    const ends = (e) => (e.length ? [e[0], e[e.length - 1]].sort().join("|") : "");
    const g = cs.length >= 2 && groups.find((x) => x.line === l.line && x.op === l.op && x.items.some((y) => ends(endCities(y.dest)) === ends(cs)));
    if (g) g.items.push(l); else add("x|" + l.rd, l);
  }
  if (!num) return { exact: groups, similar: [], num };
  return { exact: groups.filter((g) => g.line === num), similar: groups.filter((g) => g.line !== num), num };
}
function SearchGroup({ g, open, onToggle, renderRow }) {
  const fam = String(g.items[0].rd).split("-")[0];
  const [desc, setDesc] = useState(null);
  useEffect(() => { if (!open || !/^\d+$/.test(fam)) return; let ok = true; loadAltDesc(fam).then((m) => { if (ok) setDesc(m || {}); }); return () => { ok = false; }; }, [open, fam]);
  if (g.items.length === 1) return renderRow(g.items[0]);
  // רכבת (שלמה 03.11): בחיפוש רק החלופה הראשית בכל כיוון (railBetter); שאר הרכבות — בלו"ז בעמוד הקו
  const rail = g.items.every((l) => l.tt === "rail" && /^\d+-/.test(l.rd));
  const mains = rail ? Object.values(g.items.reduce((m, l) => { const k = String(l.rd).split("-")[1], b = m[k];
    if (!b || railBetter(l, b)) m[k] = l; return m; }, {})) : null;
  const live = g.items.filter((l) => !lineGoneAt(l));
  const dirs = new Set(g.items.filter((l) => /^\d+-/.test(l.rd)).map((l) => String(l.rd).split("-")[1])).size;
  // כותרת הקו: עיר מוצא – עיר יעד, וכשחלופה מגיעה לעיר אחרת היא נוספת אחרי לוכסן (שלמה 08.10:
  // "תל אביב – קרית שמונה / קרית גת"). לפי הכיוון הראשון; החלופה הראשית קובעת את הסדר.
  const withMk = g.items.filter((l) => /^\d+-/.test(l.rd));
  const dir1 = withMk.length ? String(withMk[0].rd).split("-")[1] : null;
  const pool = (withMk.length ? withMk.filter((l) => String(l.rd).split("-")[1] === dir1) : g.items)
    .sort((a, b) => (String(a.rd).split("-")[2] === "#" ? 0 : 1) - (String(b.rd).split("-")[2] === "#" ? 0 : 1));
  const orig = [], dest = [];
  // שם עיר שנחתך באמצע בנתונים ("תל אביב י") נחשב לאותה עיר
  const same = (a, b) => a.startsWith(b) || b.startsWith(a);
  const put = (arr, c) => { if (c && !arr.some((x) => same(x, c))) arr.push(c); };
  for (const l of pool) { const e = endCities(l.dest); put(orig, e[0]); put(dest, e[e.length - 1]); }
  // קו עירוני (אותה עיר בשני הקצוות): "ירושלים – ירושלים" לא אומר כלום, ולכן העיר ותחנות הקצה של
  // החלופה הראשית; הפרטים של שאר החלופות בתוך הכרטיס
  let route = orig.slice(0, 3).join(" / ") + (dest.length ? " – " + dest.slice(0, 4).join(" / ") : "");
  // עיר מוצא אחת ועיר יעד אחת: הכותרת לפי השלטים, כמו בדף הראשי (שלמה 09.10)
  if (orig.length === 1 && dest.length === 1 && pool.length && routeTitle(pool[0].dest, pool[0])) route = routeTitle(pool[0].dest, pool[0]);
  else if (orig.length === 1 && dest.length === 1 && same(orig[0], dest[0]) && pool.length) {
    const cut = (x) => x.length > 26 ? x.slice(0, 25) + "…" : x;
    const st = String(pool[0].dest || "").replace(/-\d+[#א-ת]?$/, "").split("<->").map((x) => { const p = x.split("-"); return cut((p.length > 1 ? p.slice(0, -1) : p).join("-").trim()); });
    route = orig[0] + ": " + st[0] + (st.length > 1 ? " – " + st[st.length - 1] : "");
  }
  if (!g.line && taxiName(pool[0])) route = taxiName(pool[0]);
  // תווית לכל חלופה: ראשית / מקוצר (מתחיל או מסתיים במקום אחר) / חלופה, ותיאור קצר אם יש
  const label = (l) => {
    if (!/^\d+-/.test(l.rd)) return [String(l.rd).startsWith("website") ? "אתר מידע" : "ארכיון 2012", null];
    const d = desc && desc[l.rd], alt = String(l.rd).split("-")[2];
    if (d && /^(מתחיל|מסתיים)/.test(d)) return ["מקוצר", d];
    if (alt === "#" || (d && d.startsWith("חלופה ראשית"))) return ["ראשית", null];
    return ["חלופה", d && !/^(בסיס ההשוואה|אותו מסלול|אין רצף)/.test(d) ? d : null];
  };
  return (
    <div className="lgroup">
      <button className="lghead" aria-expanded={open} onClick={onToggle}>
        <span className="badge sm">{g.line || TT_ICON[g.items[0].tt] || "—"}</span>
        <span className="lgroute">{route}</span>
        <span className="lgarrow" aria-hidden="true">{open ? "▴" : "▾"}</span>
        <span className="lgmeta">{g.op}{!live.length && <> · <b className="lggone">הקו בוטל</b></>} · {dirs > 1 ? dirs + " כיוונים · " : ""}{rail ? "כל הרכבות לפי שעה בעמוד הקו" : g.items.length + " חלופות"}</span>
      </button>
      {open && <div className="lgitems">{rail ? mains.map((l) => renderRow(l, "ראשית", null)) : [...g.items].sort((a, b) => (lineGoneAt(a) ? 1 : 0) - (lineGoneAt(b) ? 1 : 0)).map((l) => { const [t, d] = label(l); return renderRow(l, t, d); })}</div>}
    </div>);
}
// סוגי שינוי "שגרתיים": לו"ז, תגבור, צילום ותיקוני רישום. בתצוגה החדשה הם מקופלים כברירת מחדל
const LOW_KINDS = new Set(["baseline", "snapshot", "freq", "sched", "times", "redraw", "vehicle", "ltype", "access", "renum", "renamed", "board", "platform"]);
// התצוגה החדשה — כדי שרכיבים עמוק בעץ (כמו "שינויים לפי יום") יידעו עליה בלי להעביר prop בכל שלב
const LiteCtx = React.createContext(false);
// שם עיר שנחתך בתיאור הקו (במקור יש מגבלת אורך: "תל א" במקום "תל אביב יפו", שלמה 09.10) — משלימים
// לפי שמות הערים המלאים שבתיאורי כל הקווים, רק כשההשלמה חד-משמעית
let KNOWN_CITIES = null;
function setKnownCities(lines) {
  const c = new Set();
  (lines || []).forEach((l) => String(l.dest || "").replace(/-\d+[#א-ת]?$/, "").split("<->").forEach((x) => {
    const p = x.split("-"); if (p.length > 1) { const t = p[p.length - 1].trim(); if (t) c.add(t); } }));
  KNOWN_CITIES = [...c];
}
function fullCity(city, other) {
  if (!city) return city;
  if (other && other !== city && other.startsWith(city)) return other;   // "תל א" מול "תל אביב יפו" באותו קו
  if (!KNOWN_CITIES || KNOWN_CITIES.includes(city)) return city;
  const m = KNOWN_CITIES.filter((k) => k.length > city.length && k.startsWith(city));
  if (!m.length) return city;
  const best = m.reduce((a, b) => (a.length >= b.length ? a : b));      // "תל אביב" ו"תל אביב יפו" — אותה עיר
  return m.every((k) => best.startsWith(k)) ? best : city;
}
// יעד לפרסום ("עיר_תחנה" או רק "תחנה") → { city, stop }
function hsParts(h) {
  const t = String(h || "").trim();
  if (!t || /^\d+$/.test(t)) return null;
  const i = t.indexOf("_");
  if (i > 0) return { city: t.slice(0, i).trim(), stop: t.slice(i + 1).trim() };
  return KNOWN_CITIES && KNOWN_CITIES.includes(t) ? { city: t, stop: "" } : { city: "", stop: t };
}
// כותרת הקו. בלי שלטים: "תל אביב יפו – רמת גן", ובקו עירוני "ירושלים: תחנה – תחנה".
// עם היעד לפרסום (m.hs) ומה שכתוב על השלט במוצא (m.hso, לפי קו שמסתיים שם) — כמו על השלטים
// (שלמה 09.10): "בני ברק, אזור התעשייה – בת ים, מרכז הספורט", "קרית גת: תחנת הרכבת – כרמי גת"
// "עכו-עכו<->..." (שלמה 03.11): כשהתחנה כבר כוללת את שם העיר — פעם אחת ("עכו", "באר שבע-צפון")
function destShow(d) {
  return String(d || "").split("<->").map((x) => { const i = x.lastIndexOf("-"); if (i <= 0) return x;
    const st = x.slice(0, i).trim(), c = x.slice(i + 1).trim(); return c && (st.includes(c) || st.includes(c.replace(/ יפו$/, ""))) ? st : x; }).join("<->");
}
// מונית שירות בלי מספר קו (מוניות 2013–2019 מנתוני חופש המידע — המספר לא ידוע, tools/foi_taxi.py):
// "מונית שירות · תל אביב יפו ↔ ירושלים", ובתוך עיר אחת — "מונית שירות · אשדוד: מונטיפיורי ↔ הבושם"
function taxiName(l) {
  if (!l || l.line || l.tt !== "taxi" || !l.dest) return "";
  const sides = String(l.dest).replace(/-\d+[#א-ת]?$/, "").split("<->").map((x) => {
    const i = x.lastIndexOf("-");
    return i > 0 ? { st: x.slice(0, i).trim(), c: x.slice(i + 1).trim() } : { st: x.trim(), c: "" };
  });
  const a = sides[0], b = sides[sides.length - 1];
  a.c = fullCity(a.c, b.c); b.c = fullCity(b.c, a.c);
  if (a.c && b.c && a.c !== b.c) return "מונית שירות · " + a.c + " ↔ " + b.c;
  const c = a.c || b.c;
  const short = (st) => { for (const p of [c, c.replace(/ יפו$/, "")]) if (p && st.startsWith(p + " ")) return st.slice(p.length + 1); return st; };
  return "מונית שירות · " + (c ? c + ": " : "") + short(a.st) + (b !== a ? " ↔ " + short(b.st) : "");
}
function routeTitle(dest, m) {
  if (!dest) return "";
  const sides = String(dest).replace(/-\d+[#א-ת]?$/, "").split("<->").map((x) => { const p = x.split("-"); return { stop: (p.length > 1 ? p.slice(0, -1) : p).join("-").trim(), city: p.length > 1 ? p[p.length - 1].trim() : "" }; });
  const a = sides[0], b = sides[sides.length - 1];
  if (!b || a === b) return a.stop || a.city;
  // צד בלי "-עיר" (התיאור נחתך לפני העיר) — שם תחנה, לא שם עיר
  a.city = fullCity(a.city, b.city); b.city = fullCity(b.city, a.city);
  const to = hsParts(m && m.hs), fr = hsParts(m && m.hso);
  const toCity = (to && to.city) || b.city, frCity = (fr && fr.city) || a.city;
  if (frCity && toCity && frCity !== toCity) {
    const side = (city, h) => city + (h && h.stop ? ", " + h.stop : "");
    return side(frCity, fr && (!fr.city || fr.city === frCity) ? fr : null) + " – " + side(toCity, to && (!to.city || to.city === toCity) ? to : null);
  }
  const city = toCity || frCity;
  const from = (fr && fr.stop) || a.stop, to2 = (to && to.stop) || b.stop;
  // קו מעגלי — אותו מוצא ויעד (שלמה 09.10: "ביתר עילית, גבעה ב (מעגלי)"), גם כשרק הרציף שונה:
  // "תחנה מרכזית קריית שמונה/רציפים" ← "…/הורדה"
  const base = (x) => String(x || "").split("/")[0].trim();
  if (from && (from === to2 || (base(from).length > 3 && base(from) === base(to2))))
    return (city ? city + ", " : "") + (from === to2 ? from : base(from)) + " (מעגלי)";
  return (city ? city + ": " : "") + from + " – " + to2;
}
function collapse2012Rows(rows, meta = null) {
  const seen = new Set();
  return rows.filter(r => {
    const m = meta ? meta[r.rd] : r;
    if (!m?.hgroup || (meta && !["snapshot", "baseline"].includes(r.k))) return true;
    const key = m.hgroup + (meta ? ":" + r.d + ":" + r.k : "");
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
function lineSiblings(idx, rd) {
  const lines = idx?.lines || [], current = lines.find(l => l.rd === rd);
  return current?.hgroup ? lines.filter(l => l.hgroup === current.hgroup)
    : lines.filter(l => l.rd.split("-")[0] === rd.split("-")[0]);
}
