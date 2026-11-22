/* הקו בזמן · 06-follow.jsx — מעקב והתראות: OneSignal, מעקב לפי עיר וקו, מרכז ההתראות ודף התקציר.
   חלק מ-line-history/src (הסדר ב-files.json). כל החלקים מחוברים לפי הסדר ומקומפלים יחד בדפדפן (index.html),
   כך שכל השמות משותפים בין החלקים כמו בקובץ אחד. */

// --- התראות דפדפן (OneSignal) — פעיל רק כשמזהה האפליקציה מוזן ב-index.html ---
const PUSH_ON = typeof window !== "undefined" && !!window.KB_ONESIGNAL_APP_ID;
// תג עיר: מפתחות תגים חייבים להיות ASCII — האש יציב של שם העיר (djb2→base36),
// זהה לחישוב בצד השולח (tools/send_push.py)
const cityTag = (name) => { let h = 5381; const s = String(name || "").trim(); for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return "c" + h.toString(36); };
// מצב ההתראות בדפדפן הזה (שלמה 07.09: "כל פעם שואל אישור ולא מגיעה הודעה"):
// באייפון התראות עובדות רק מהאתר שנוסף למסך הבית; דפדפן שחסם — צריך לפתוח
// בהגדרות האתר. ההרשאה מתבקשת רק כשאין, והמנוי מופעל אם כבה.
const pushSupport = () => {
  try {
    const ua = navigator.userAgent || "";
    const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
    if (ios && !standalone) return { ok: false, why: "באייפון ובאייפד התראות עובדות רק אחרי שמוסיפים את האתר למסך הבית (כפתור השיתוף ← \"הוסף למסך הבית\"), פותחים אותו משם ונרשמים שוב" };
    if (!("Notification" in window) || !("PushManager" in window)) return { ok: false, why: "הדפדפן הזה לא תומך בהתראות. בכרום, סמסונג אינטרנט או פיירפוקס זה עובד" };
    if (Notification.permission === "denied") return { ok: false, why: "הדפדפן חוסם התראות מהאתר. לאפשר: לחיצה על סמל המנעול ליד הכתובת ← התראות ← אפשר, ואז להירשם שוב" };
  } catch (e) { /* ignore */ }
  return { ok: true };
};
async function ensurePush(OS) {
  const sup = pushSupport();
  if (!sup.ok) return sup;
  if (!OS.Notifications.permission) await OS.Notifications.requestPermission();
  if (!OS.Notifications.permission) return { ok: false, why: "ההרשאה להתראות לא אושרה. כשהדפדפן שואל — \"אפשר\", לא לסגור את השאלה" };
  const ps = OS.User.PushSubscription;
  if (ps && ps.optedIn === false) await ps.optIn();
  if (!(ps && ps.id)) return { ok: false, why: "הדפדפן לא יצר מנוי להתראות (בברייב: להדליק \"Use Google services for push messaging\" בהגדרות)" };
  return { ok: true, id: ps.id };
}
// אימות מול השרת של ספק ההתראות ותיקון ישיר — בלי לסמוך על תור הפעולות של
// ה-SDK בדפדפן. אצל שלמה (07.09) המנוי נוצר, הדף הראה "✓ נשמר — 5 ערים",
// ובשרת לא נרשם אף תג. הנתיבים כאן הם אותם נתיבים שה-SDK עצמו קורא מהדפדפן
// (מזהה האפליקציה בלבד, בלי מפתח). מחזיר {have, fixed, ok} או {err}.
const TAG_RE = /^(kb|c[0-9a-z]+|l\d+|freq|kg_\w+)$/;
async function syncServer(OS, want) {
  const sub = OS.User && OS.User.PushSubscription && OS.User.PushSubscription.id;
  if (!sub) return { err: "אין מנוי בדפדפן הזה" };
  const api = "https://api.onesignal.com/apps/" + window.KB_ONESIGNAL_APP_ID;
  const j = async (path, opt, hdr) => {
    const r = await fetch(api + path, { ...(opt || {}), headers: { "content-type": "application/json", ...(hdr ? { "OneSignal-Subscription-Id": sub } : {}) } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  };
  const jj = async (path, opt) => { try { return await j(path, opt, true); } catch (e) { return j(path, opt, false); } };
  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
  try {
    let idn = null;
    for (let i = 0; i < 3 && !(idn && idn.identity && idn.identity.onesignal_id); i++) {
      if (i) await wait(3000);
      try { idn = await jj("/subscriptions/" + sub + "/user/identity"); } catch (e) { idn = null; }
    }
    const oid = idn && idn.identity && idn.identity.onesignal_id;
    if (!oid) return { err: "המנוי עדיין לא מוכר בשרת — נסו שוב בעוד רגע" };
    const tagsOf = (u) => ((u && u.properties && u.properties.tags) || {});
    const diff = (h) => {
      const d = {};
      for (const k in want) if (h[k] !== want[k]) d[k] = want[k];
      for (const k in h) if (h[k] !== "" && !(k in want) && TAG_RE.test(k)) d[k] = "";   // "" = מחיקת תג
      return d;
    };
    let have = tagsOf(await jj("/users/by/onesignal_id/" + oid));
    let d = diff(have), fixed = false;
    if (Object.keys(d).length) {
      await jj("/users/by/onesignal_id/" + oid, { method: "PATCH", body: JSON.stringify({ properties: { tags: d } }) });
      have = tagsOf(await jj("/users/by/onesignal_id/" + oid));
      fixed = true; d = diff(have);
    }
    return { have, fixed, ok: !Object.keys(d).length };
  } catch (e) { return { err: (e && e.message) || String(e) }; }
}
// מצב לתצוגה: {loading, ok, why, id, srv}. כשהכול תקין — התגים מהדפדפן הזה
// נשלחים שוב לספק (resync) ומאומתים מול השרת (שלמה 07.09)
function readPushState(cb, resync) {
  const sup = pushSupport();
  if (!sup.ok) { cb({ ...sup, loading: false }); return; }
  let got = false;
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (OS) => {
    got = true;
    try {
      const ps = OS.User.PushSubscription;
      const ok = !!OS.Notifications.permission && !!(ps && ps.optedIn !== false && ps.id);
      if (resync && Object.keys(resync).length) {
        try {
          // הספק ישקף בדיוק את מה שנשמר בדפדפן הזה: תגים ישנים (עיר שהוסרה,
          // תדירות קודמת) נמחקים, כל השאר נשלחים שוב. גם כשההרשאה עוד לא
          // אושרה — התגים מחכים אצל הספק ותופסים ברגע שהמנוי נפתח (שלמה 07.09:
          // נמצא מנוי בלי שום תג למרות חמש ערים שמורות)
          const cur = (await OS.User.getTags()) || {};
          const stale = Object.keys(cur).filter((k) => !(k in resync) && TAG_RE.test(k));
          if (stale.length) OS.User.removeTags(stale);
          OS.User.addTags(resync);
        } catch (e) { /* ignore */ }
      }
      const st = { loading: false, ok, id: ps && ps.id, why: ok ? "" : (!OS.Notifications.permission ? "עוד לא אושרה הרשאה להתראות בדפדפן הזה — לחצו \"הפעלת התראות\" ואשרו" : "המנוי כבוי — לחצו \"הפעלת התראות\"") };
      cb(st);
      // גם בפתיחת המרכז (לא רק בשמירה): "בודק מול השרת…" נשאר תקוע עד ששמרו (שלמה 13.09)
      if (ps && ps.id && resync) cb({ ...st, srv: Object.keys(resync).length ? await syncServer(OS, resync) : { have: {}, ok: true, fixed: false, empty: true } });
    } catch (e) { cb({ loading: false, ok: false, why: "שירות ההתראות לא נטען (חוסם פרסומות?)" }); }
  });
  setTimeout(() => { if (!got) cb({ loading: false, ok: false, why: "שירות ההתראות לא נטען (חוסם פרסומות או חוסם תוכן בדפדפן)" }); }, 8000);
}
// כל ההרשמה של הדפדפן הזה בתג אחד. ספק ההתראות מגביל את מספר התגים למשתמש,
// ועם תג לכל עיר ההרשמה של שלמה (5 ערים + תדירות + 4 סוגים = 10 תגים) נדחתה
// ב-409 בלי שנשמר כלום (07.09). kb = "f=<תדירות>|g=<סוגים>|c=<ערי המרכז>|
// w=<ערים מכפתור עקוב>|l=<מק"טים>" — הערים כתגים מגובבים כמו קודם; הצד השולח
// (tools/send_push.py, parse_sub) קורא את אותו מבנה.
function savedTags() {
  const parts = [];
  try {
    const n = JSON.parse(localStorage.kbNotify || "{}");
    const cl = n.cities || (n.city ? [n.city] : []);
    if (cl.length) {
      parts.push("f=" + (n.freq || "1"));
      parts.push("g=" + (n.gs || KIND_GROUPS_N.map((g) => g.tag)).map((g) => String(g).replace(/^kg_/, "")).join(","));
      parts.push("c=" + cl.slice(0, 40).map(cityTag).join(","));
    }
  } catch (e) { /* ignore */ }
  try {
    const m = JSON.parse(localStorage.kbFollow || "{}");
    const w = Object.keys(m).filter((k) => /^c[0-9a-z]+$/.test(k)), l = Object.keys(m).filter((k) => /^l\d+$/.test(k)).map((k) => k.slice(1));
    if (w.length) parts.push("w=" + w.slice(0, 40).join(","));
    if (l.length) parts.push("l=" + l.slice(0, 60).join(","));
  } catch (e) { /* ignore */ }
  return parts.length ? { kb: parts.join("|") } : {};
}
// שולח לספק את מה שנשמר בדפדפן הזה, או מוחק את התג כשאין הרשמה
const pushTags = (done) => { const t = savedTags(); osTags(Object.keys(t).length ? t : { kb: null }, done); };
// שחזור ההרשמה מהספק (שלמה 29.09: "רשום שאני לא רשום, אבל אני מקבל כל שבוע"):
// ההרשמה נשמרת גם בדפדפן (localStorage) וגם אצל ספק ההתראות. כשהשמירה בדפדפן
// אבדה — ניקוי נתוני אתר, כתובת אחרת, או האתר ממסך הבית מול הדפדפן — הספק עדיין
// שולח, והדף הציג "לא רשום". וגרוע מזה: לחיצה על "עקוב" שלחה אז תג ריק ומחקה את
// ההרשמה אצל הספק. כאן, כשאין כלום בדפדפן ויש תג kb אצל הספק, ההרשמה משוחזרת
// לדפדפן (שמות הערים — לפי אותו גיבוב cityTag מול רשימת הערים).
function restoreFromServer() {
  if (!PUSH_ON) return;
  try { if (localStorage.kbNotify || localStorage.kbFollow) return; } catch (e) { return; }
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (OS) => {
    try {
      const t = (await OS.User.getTags()) || {};
      if (!t.kb) return;
      const f = {};
      String(t.kb).split("|").forEach((p) => { const i = p.indexOf("="); if (i > 0) f[p.slice(0, i)] = p.slice(i + 1); });
      const all = Object.keys(await (await dfetch("data/cities.json")).json());
      const byTag = {}; all.forEach((c) => { byTag[cityTag(c)] = c; });
      const list = (s) => String(s || "").split(",").filter(Boolean);
      const cities = list(f.c).map((h) => byTag[h]).filter(Boolean);
      if (cities.length) localStorage.kbNotify = JSON.stringify({ cities, freq: f.f || "1", gs: list(f.g).map((g) => "kg_" + g) });
      const fol = {};
      list(f.w).forEach((h) => { fol[h] = byTag[h] || "עיר"; });
      list(f.l).forEach((code) => { fol["l" + code] = "קו"; });
      if (Object.keys(fol).length) localStorage.kbFollow = JSON.stringify(fol);
      if (cities.length || Object.keys(fol).length) window.dispatchEvent(new Event("kb-notify-restored"));
    } catch (e) { /* ignore */ }
  });
}
restoreFromServer();
// ערי הקצה מהיעד ("מוצא-עיר<->יעד-עיר") — למעקב ברמת עיר
const destCities = (dest) => {
  // העיר = המקטע העברי האחרון; סיומות טכניות ("2#") מדולגות — זהה לצד השולח
  const out = [];
  String(dest || "").split("<->").forEach((side) => {
    const parts = side.trim().split("-");
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i].trim();
      if (p.length >= 2 && !p.includes("#") && /[א-ת]/.test(p) && !/[0-9]/.test(p)) {
        if (!out.includes(p)) out.push(p);
        break;
      }
    }
  });
  return out.slice(0, 2);
};

// הגדרת תגים בבת אחת — הרשאה מתבקשת רק אם אין; done(r) מקבל {ok, why, id}
const osTags = (map, done) => {
  const sup = pushSupport();
  if (!sup.ok) { if (done) done(sup); return; }
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (OS) => {
    let r;
    try {
      r = await ensurePush(OS);
      // התגים נשמרים גם בלי מנוי פעיל — כדי שיחזיקו כשההרשאה תאושר
      const add = {}, rem = [];
      for (const k in map) { if (map[k] == null) rem.push(k); else add[k] = map[k]; }
      if (Object.keys(add).length) OS.User.addTags(add);
      if (rem.length) OS.User.removeTags(rem);
    } catch (e) { r = { ok: false, why: "שגיאה בהרשמה: " + (e && e.message ? e.message : e) }; }
    if (done) done(r);
    // אימות מול השרת ותיקון ישיר: מה שנשמר בדפדפן הזה הוא האמת
    if (r && r.id) { try { const srv = await syncServer(OS, savedTags()); if (done) done({ ...r, srv }); } catch (e) { /* ignore */ } }
  });
};
// שם עיר כפי שהוא בקבצי הקווים — "קריית מלאכי" שהוקלד הופך ל"קרית מלאכי" של
// הרישום, אחרת התג לא יתאים לשום קו והתראה לא תגיע (שלמה 07.09)
const normCity = (s) => String(s || "").trim().replace(/["'׳״]/g, "").replace(/[-–]/g, " ").replace(/\s+/g, " ").replace(/יי/g, "י").replace(/וו/g, "ו");
const canonCity = (name, all) => { const n = normCity(name); if (!n) return null; return (all || []).find((c) => c === name.trim()) || (all || []).find((c) => normCity(c) === n) || null; };
// קבוצות סוגי-שינוי להרשמה (בקשת שלמה) — התג בצד השולח זהה
const KIND_GROUPS_N = [
  { tag: "kg_rem", label: "ביטולי קווים", kinds: ["removed"] },
  { tag: "kg_new", label: "קווים חדשים", kinds: ["new"] },
  { tag: "kg_route", label: "מסלול ותחנות", kinds: ["route", "redraw", "extend", "shorten", "terminal", "stops", "stops-add", "stops-del"] },
  { tag: "kg_ident", label: "יעד, מספר ומפעיל", kinds: ["dest", "renum", "renamed", "operator", "mode"] },
  // הקו המודיע (שלמה 18.10): עבודות, עקיפות ותחנות שבוטלו לזמן קצר — tools/alerts_push.py
  { tag: "kg_temp", label: "שינויים זמניים (עבודות ועקיפות)", kinds: [] },
];
// בכל כניסה לאתר: ההרשמות שנשמרו בדפדפן הזה נשלחות שוב לספק (שלמה 07.09: אצל
// הספק נמצא תג עיר אחד מתוך חמש). בלי בקשת הרשאה — רק אם כבר אושרה.
if (PUSH_ON) { try { const t0 = savedTags(); if (Object.keys(t0).length) readPushState(() => {}, t0); } catch (e) { /* ignore */ } }
// "ההרשמות שלי": כל מה שנרשם מהדפדפן הזה (צ'יפים + המרכז), עם ✖ להסרה
function MyFollows({ bump, onChange }) {
  const read = () => {
    // ערי המרכז לא כאן — הן כבר מוצגות כצ'יפים מעל (הופיעו שלוש פעמים; שלמה 13.09).
    // נשארו רק מעקבים ישנים מכפתור "עקוב" — כדי שאפשר יהיה להסיר אותם
    const out = [];
    try {
      const m = JSON.parse(localStorage.kbFollow || "{}");
      for (const t in m) out.push({ tag: t, label: typeof m[t] === "string" ? m[t] : (t[0] === "l" ? "קו (מקט " + t.slice(1) + ")" : "מעקב ישן") });
    } catch (e) {}
    return out;
  };
  const [items, setItems] = useState(read);
  useEffect(() => { setItems(read()); }, [bump]);
  const drop = (it) => {
    if (it.center) {
      try {
        const n = JSON.parse(localStorage.kbNotify || "{}");
        const cl = (n.cities || (n.city ? [n.city] : [])).filter((c) => c !== it.cityName);
        if (!cl.length) delete localStorage.kbNotify;
        else localStorage.kbNotify = JSON.stringify({ ...n, cities: cl, city: undefined });
      } catch (e) {}
    } else {
      try { const m = JSON.parse(localStorage.kbFollow || "{}"); delete m[it.tag]; localStorage.kbFollow = JSON.stringify(m); } catch (e) {}
    }
    pushTags();
    setItems(read());
    // המרכז שמעל מחזיק את רשימת הערים במצב משלו — בלי עדכון, "שמירה" הבאה הייתה
    // מחזירה את העיר שהוסרה כאן (שלמה 07.09: "במקום להוריד הוא מחזיר את העיר")
    if (onChange) onChange();
  };
  if (!items.length) return null;
  return (
    <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
      <b>ההרשמות הפעילות בדפדפן הזה:</b>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
        {items.map((it) => (
          <span key={it.tag + (it.center ? "c" : "")} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #e2e8f0", borderRadius: 999, padding: "3px 10px" }}>
            🔔 {it.label}
            <button title="הסרת ההרשמה הזו" onClick={() => drop(it)}
              style={{ border: "none", background: "none", cursor: "pointer", color: "#b91c1c", fontWeight: 900 }}>✖</button>
          </span>
        ))}
      </div>
    </div>
  );
}
// הרשמה מדף הקו (שלמה 13.09): לוחצים על עיר, בוחרים סוגי שינוי ותדירות, ונרשמים —
// זו אותה הרשמה כמו במרכז ההתראות בעמוד הראשי: העיר מצטרפת לרשימת הערים שם,
// והתדירות וסוגי השינוי משותפים לכל הערים.
function LineFollow({ cities }) {
  const readN = () => { try { const n = JSON.parse(localStorage.kbNotify || "{}"); if (n.city && !n.cities) n.cities = [n.city]; return n; } catch (e) { return {}; } };
  const [openC, setOpenC] = useState(null);
  const [gs, setGs] = useState(() => new Set(readN().gs || KIND_GROUPS_N.map((g) => g.tag)));
  const [freq, setFreq] = useState(() => readN().freq || "1");
  const [st, setSt] = useState("");
  const [, setBump] = useState(0);
  if (!PUSH_ON || !cities.length) return null;
  const isOn = (c) => (readN().cities || []).includes(c);
  const save = (c) => {
    if (!gs.size) { setSt("✗ סמנו לפחות סוג שינוי אחד"); return; }
    try { const n = readN(); const cl = n.cities || []; if (!cl.includes(c)) cl.push(c); localStorage.kbNotify = JSON.stringify({ cities: cl, freq, gs: [...gs] }); } catch (e) { /* ignore */ }
    setSt("שומר…"); setOpenC(null);
    pushTags((r) => { setSt(r.ok ? (r.srv ? (r.srv.ok ? "✓ נרשמתם בהצלחה" : "✗ ההרשמה לא נקלטה בשרת ההתראות — נסו שוב") : "✓ נרשמתם — ההתראות פעילות בדפדפן הזה") : "✗ " + r.why); setBump((b) => b + 1); });
  };
  const remove = (c) => {
    try { const n = readN(); const cl = (n.cities || []).filter((x) => x !== c); if (cl.length) localStorage.kbNotify = JSON.stringify({ ...n, cities: cl, city: undefined }); else delete localStorage.kbNotify; } catch (e) { /* ignore */ }
    pushTags(); setSt("ההרשמה ל" + c + " הוסרה"); setBump((b) => b + 1);
  };
  const pill = { display: "flex", alignItems: "center", gap: 5, border: "1px solid #e2e8f0", borderRadius: 999, padding: "4px 10px", fontWeight: 400 };
  return <>
    {cities.map((c) => isOn(c)
      ? <button key={c} className="sharebtn" title={"רשומים להתראות על קווי " + c + " — לחיצה מסירה את העיר מההרשמה"} onClick={() => remove(c)}>🔔 רשומים: {c} ✓</button>
      : <button key={c} className="sharebtn" title={"הרשמה להתראות על כל שינוי מהותי בקווים של " + c} aria-expanded={openC === c} onClick={() => setOpenC(openC === c ? null : c)}>🔔 הרשמה: {c}</button>)}
    {st && <small style={{ color: st[0] === "✓" ? "#166534" : "#b91c1c", fontWeight: 700, display: "inline-block", marginInlineStart: 6 }}>{st}</small>}
    {openC && (
      <div style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 12px", marginTop: 6, display: "flex", flexDirection: "column", gap: 8 }}>
        <b>הרשמה להתראות על קווי {openC}</b>
        <div style={{ fontWeight: 700 }}>אילו שינויים:
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
            {KIND_GROUPS_N.map((g) => (
              <label key={g.tag} style={pill}><input type="checkbox" checked={gs.has(g.tag)} onChange={() => setGs((p) => { const n = new Set(p); if (n.has(g.tag)) n.delete(g.tag); else n.add(g.tag); return n; })} /> {g.label}</label>
            ))}
          </div>
        </div>
        <div style={{ fontWeight: 700 }}>באיזו תדירות:
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
            {[["1", "כל יום שיש שינוי"], ["3", "סיכום כל 3 ימים"], ["7", "סיכום שבועי"]].map(([v, l]) => (
              <label key={v} style={pill}><input type="radio" name="lffreq" checked={freq === v} onChange={() => setFreq(v)} /> {l}</label>
            ))}
          </div>
        </div>
        <div className="mut">סוגי השינוי והתדירות משותפים לכל הערים שנרשמתם אליהן — אפשר לשנות במרכז ההתראות בעמוד הראשי.</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="kathead" style={{ width: "auto", padding: "6px 14px" }} onClick={() => save(openC)}>שמירה והרשמה</button>
          <button className="sharebtn" onClick={() => setOpenC(null)}>ביטול</button>
        </div>
      </div>
    )}
  </>;
}
function NotifyCenter({ cities: allCities }) {
  const st0 = (() => { try { const s = JSON.parse(localStorage.kbNotify || "{}"); if (s.city && !s.cities) s.cities = [s.city]; return s; } catch (e) { return {}; } })();
  const [open, setOpen] = useState(false);
  const [city, setCity] = useState("");
  const [cities, setCities] = useState(st0.cities || []);
  const [freq, setFreq] = useState(st0.freq || "1");
  const [gs, setGs] = useState(() => new Set(st0.gs || KIND_GROUPS_N.map((g) => g.tag)));
  const [saved, setSaved] = useState(!!(st0.cities || []).length);
  const [msg, setMsg] = useState("");
  const [ps, setPs] = useState({ loading: true });
  useEffect(() => { if (open && PUSH_ON) { setPs({ loading: true }); readPushState((s) => setPs((p) => (typeof s === "function" ? s(p) : s)), savedTags()); } }, [open]);
  // ההרשמה שוחזרה מהספק אחרי שהדף עלה — מציגים אותה
  useEffect(() => {
    const on = () => { try { const s = JSON.parse(localStorage.kbNotify || "{}"); setCities(s.cities || []); setFreq(s.freq || "1"); if (s.gs) setGs(new Set(s.gs)); setSaved(!!(s.cities || []).length); } catch (e) { /* ignore */ } };
    window.addEventListener("kb-notify-restored", on);
    return () => window.removeEventListener("kb-notify-restored", on);
  }, []);
  if (!PUSH_ON) return null;
  const toggleG =(t) => setGs((p) => { const n = new Set(p); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  // רק שמות ערים כפי שהם ברישום (אחרת התג לא יתאים לשום קו)
  const pick = (raw) => {
    const c = raw.trim(); if (!c) return null;
    const canon = canonCity(c, allCities);
    if (!canon) { setMsg(`"${c}" לא נמצאה בין ערי הקצה של הקווים — בחרו שם מהרשימה שנפתחת בהקלדה`); return null; }
    return canon;
  };
  const addCity = () => { const c = pick(city); if (!c) return; if (!cities.includes(c)) setCities([...cities, c]); setCity(""); setMsg(""); };
  const save = () => {
    const list = [...cities];
    if (city.trim()) { const c = pick(city); if (!c) return; if (!list.includes(c)) list.push(c); }   // מה שהוקלד ולא נלחץ "הוסף"
    if (!list.length) { setMsg("הוסיפו לפחות עיר אחת"); return; }
    if (!gs.size) { setMsg("סמנו לפחות סוג שינוי אחד"); return; }
    setMsg("שומר…");
    try { localStorage.kbNotify = JSON.stringify({ cities: list, freq, gs: [...gs] }); } catch (e) {}
    pushTags((r) => {
      setPs({ loading: false, ok: !!r.ok, why: r.why || "", id: r.id, srv: r.srv });
      setMsg(r.ok ? "✓ נרשמתם בהצלחה. ההתראות פעילות בדפדפן הזה" : `✗ נשמר, אבל ההתראות לא יגיעו: ${r.why}`);
    });
    setCities(list); setCity(""); setSaved(true);
  };
  // קריאה מחדש של מה ששמור בדפדפן — אחרי הסרה מרשימת "ההרשמות הפעילות" שמתחת
  const reload = () => {
    try {
      const s = JSON.parse(localStorage.kbNotify || "{}");
      const cl = s.cities || (s.city ? [s.city] : []);
      setCities(cl); setSaved(!!cl.length); setCity("");
      if (s.freq) setFreq(s.freq);
      if (s.gs) setGs(new Set(s.gs));
    } catch (e) { setCities([]); setSaved(false); }
  };
  // "הפעלת התראות" שולח גם את כל מה שנשמר בדפדפן הזה — לא רק מבקש הרשאה
  const enable = () => { setMsg("…"); pushTags((r) => { setPs({ loading: false, ok: !!r.ok, why: r.why || "", id: r.id, srv: r.srv }); setMsg(r.ok ? "✓ ההתראות פעילות בדפדפן הזה" : "✗ " + r.why); }); };
  // מצב הסנכרון מול שרת ההתראות — בלי לחזור על שמות הערים (הן כבר בצ'יפים; שלמה 13.09)
  const srvText = (s) => {
    if (s.err) return "לא הצלחתי לבדוק מול שרת ההתראות: " + s.err;
    if (s.empty) return "אין עדיין הרשמה בדפדפן הזה";
    if (!s.ok) return "✗ ההרשמה לא נקלטה בשרת ההתראות — נסו לשמור שוב";
    return s.fixed ? "✓ ההרשמה סונכרנה עכשיו עם שרת ההתראות" : "✓ ההרשמה רשומה בשרת ההתראות";
  };
  const cancel = () => {
    try { delete localStorage.kbNotify; } catch (e) {}
    pushTags();
    setCities([]); setSaved(false); setMsg("ההרשמה בוטלה");
  };
  // בתצוגה החדשה התיבה מוסתרת ונפתחת מהתפריט ⋯ (שלמה 08.10)
  useEffect(() => {
    const h = () => { setOpen(true); requestAnimationFrame(() => { const b = document.querySelector(".notifybox"); if (b) b.scrollIntoView({ block: "start", behavior: "smooth" }); }); };
    window.addEventListener("kb-open-notify", h); return () => window.removeEventListener("kb-open-notify", h);
  }, []);
  return (
    <div className={"katbox notifybox" + (open ? " isopen" : "")} style={{ marginTop: 8 }}>
      <button className="kathead" style={{ fontWeight: 800 }} aria-expanded={open} onClick={() => setOpen(!open)}>
        🔔 הרשמה להתראות על שינויים{saved ? (() => { const cl = (st0.cities || [st0.city]).filter(Boolean); return cl.length > 2 ? ` — רשומים ל-${cl.length} ערים` : ` — רשומים ל${cl.join(" ו")}`; })() : " — עיר, סוגי שינויים ותדירות"}
      </button>
      {open && (
        <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* מצב ההתראות בדפדפן הזה — בלי זה ההרשמה נשמרת אבל שום הודעה לא מגיעה */}
          <div style={{ border: "1px solid " + (ps.loading ? "#e2e8f0" : ps.ok ? "#bbf7d0" : "#fecaca"), background: ps.loading ? "#f8fafc" : ps.ok ? "#f0fdf4" : "#fef2f2", borderRadius: 10, padding: "8px 12px", fontWeight: 700, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {ps.loading ? "בודק את מצב ההתראות בדפדפן הזה…" : ps.ok ? "✓ ההתראות פעילות בדפדפן הזה" : "✗ ההתראות לא פעילות בדפדפן הזה: " + ps.why}
            {!ps.loading && !ps.ok && !/אייפון|לא תומך/.test(ps.why || "") && <button className="kathead" style={{ width: "auto", padding: "5px 12px" }} onClick={enable}>הפעלת התראות</button>}
            {!ps.loading && ps.ok && !ps.srv && <small style={{ width: "100%", fontWeight: 400, color: "var(--muted, #64748b)" }}>בודק מול השרת מה רשום שם…</small>}
            {!ps.loading && ps.srv && <div style={{ width: "100%", fontWeight: 600, fontSize: 13, color: ps.srv.ok ? "#166534" : "#b91c1c" }}>{srvText(ps.srv)}</div>}
          </div>
          <label style={{ fontWeight: 700 }}>ערים (אפשר כמה):
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <input list="kbcities" dir="rtl" value={city} onChange={(e) => setCity(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCity(); } }}
                placeholder="הקלידו שם עיר…" style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", font: "inherit" }} />
              <button className="kathead" style={{ width: "auto", padding: "6px 14px" }} onClick={addCity}>+ הוסף</button>
            </div>
            <datalist id="kbcities">{(allCities || []).map((c) => <option key={c} value={c} />)}</datalist>
            {cities.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, fontWeight: 400 }}>
                {cities.map((ct) => (
                  <span key={ct} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#ede9fe", borderRadius: 999, padding: "3px 10px" }}>
                    {ct} <button onClick={() => setCities(cities.filter((x) => x !== ct))}
                      style={{ border: "none", background: "none", cursor: "pointer", color: "#b91c1c", fontWeight: 900 }}>✖</button>
                  </span>
                ))}
              </div>
            )}
          </label>
          <div style={{ fontWeight: 700 }}>אילו שינויים מעניינים אתכם:
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6, fontWeight: 400 }}>
              {KIND_GROUPS_N.map((g) => (
                <label key={g.tag} style={{ display: "flex", alignItems: "center", gap: 5, border: "1px solid #e2e8f0", borderRadius: 999, padding: "4px 10px" }}>
                  <input type="checkbox" checked={gs.has(g.tag)} onChange={() => toggleG(g.tag)} /> {g.label}
                </label>
              ))}
            </div>
            <div className="mut" style={{ fontWeight: 400 }}>שינויי לו״ז ותדירות אינם נשלחים — רק שינויים מהותיים.</div>
          </div>
          <div style={{ fontWeight: 700 }}>באיזו תדירות:
            <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap", fontWeight: 400 }}>
              {[["1", "כל יום שיש שינוי"], ["3", "סיכום כל 3 ימים"], ["7", "סיכום שבועי"]].map(([v, l]) => (
                <label key={v} style={{ display: "flex", alignItems: "center", gap: 5, border: "1px solid #e2e8f0", borderRadius: 999, padding: "4px 10px" }}>
                  <input type="radio" name="kbfreq" checked={freq === v} onChange={() => setFreq(v)} /> {l}
                </label>
              ))}
            </div>
            <div className="mut" style={{ fontWeight: 400 }}>בסיכום, ההתראה נפתחת לעמוד עם כל השינויים בתקופה — מקובצים לפי סוג.</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="kathead" style={{ background: "#4c1d95", color: "#fff", borderRadius: 10, width: "auto", padding: "8px 18px" }} onClick={save}>שמירה והרשמה</button>
            {saved && <button className="kathead" style={{ width: "auto", padding: "8px 14px" }} onClick={cancel}>ביטול ההרשמה</button>}
            {msg && <span style={{ fontWeight: 700 }}>{msg}</span>}
          </div>
          <MyFollows bump={msg} onChange={reload} />
        </div>
      )}
    </div>
  );
}
// עמוד הסיכום שנפתח מהתראת סיכום: כל השינויים בתקופה, מקובצים לפי סוג —
// קווים עם אותו שינוי באותה שורה, כל אחד בקישור משלו (בקשת שלמה)
function DigestPage({ city, days, onBack, openLine, backHref }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch("data/digest.json", { cache: "no-cache" }).then((r) => r.json()).then(setData)
      .catch(() => setData({ items: [] }));
  }, []);
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const cityList = String(city || "").split(",").map((c) => c.trim()).filter(Boolean);
  const items = ((data && data.items) || []).filter((x) => x.d >= since && (x.ct || []).some((c) => cityList.includes(c)));
  const byKind = {};
  items.forEach((x) => { (byKind[x.k] = byKind[x.k] || []).push(x); });
  return (
    <div className="card">
      <BackLink href={backHref} onBack={onBack}>→ לחיפוש</BackLink>
      <h2 style={{ margin: "6px 0" }}>🔔 סיכום השינויים בקווי {String(city || "").split(",").join(", ")} — {days === 7 ? "השבוע האחרון" : `${days} הימים האחרונים`}</h2>
      {!data ? <div>טוען…</div> : !items.length ? <div className="mut">אין שינויים מהותיים בתקופה הזו.</div> : (
        Object.keys(byKind).map((k) => {
          const seen = new Set();
          const rows = byKind[k].filter((x) => !seen.has(x.mk) && seen.add(x.mk));
          return (
            <div key={k} style={{ margin: "10px 0", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 10 }}>
              <b style={{ color: (KINDS[k] || {}).color || "#0f172a" }}>{(KINDS[k] || {}).label || k}</b> · {rows.length} קווים:{" "}
              {rows.map((x, i) => (
                <React.Fragment key={x.rd + x.d}>
                  {i > 0 && " · "}
                  <a href={"#" + encodeURIComponent(x.rd) + "@" + x.d} onClick={(e) => { e.preventDefault(); openLine(x.rd, x.d); }}
                    style={{ fontWeight: 700 }}>קו {x.line || x.mk}</a>
                </React.Fragment>
              ))}
            </div>
          );
        })
      )}
      <div className="mut">שינויי לו״ז ותדירות אינם נכללים בסיכום.</div>
    </div>
  );
}
