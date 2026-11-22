/* הקו בזמן · 13-app.jsx — האפליקציה: App, הלשוניות הראשיות, הניתוב, והרצה.
   חלק מ-line-history/src (הסדר ב-files.json). כל החלקים מחוברים לפי הסדר ומקומפלים יחד בדפדפן (index.html),
   כך שכל השמות משותפים בין החלקים כמו בקובץ אחד. */
function App() {
  // תצוגה חדשה (פחות מידע על המסך) או הקודמת — נשמר בדפדפן (שלמה 08.10: "להוסיף לחזור לגרסה הקודמת")
  const [lite, setLite] = useState(() => { try { return localStorage.lhLite !== "0"; } catch (e) { return true; } });
  useEffect(() => { document.body.classList.toggle("lite", lite); try { localStorage.lhLite = lite ? "1" : "0"; } catch (e) {} }, [lite]);
  const [menu, setMenu] = useState(false);
  useEffect(() => { if (!menu) return; const h = (e) => { if (e.key === "Escape") setMenu(false); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [menu]);
  const citySearch = useRouteCities();
  const [idx, setIdx] = useState(null);
  const [err, setErr] = useState(null);
  // ‎#t=stops‎ וכד' — הטאב נשמר בכתובת, כדי שריענון לא יחזיר לעמוד הראשי
  const [tab, setTab] = useState(() => {
    const h = safeHash().slice(1);
    if (h.startsWith("stop=")) return "stops";
    if (h.startsWith("t=")) {
      const t = h.slice(2).split("@")[0];
      if (t === "early") return "lines";
      if (t === "stops" || t === "map" || TABS.some((x) => x.k === t)) return t;
    }
    return "lines";
  });
  const [q, setQ] = usePersistedQ("lh-q-main");
  const dq = useDeferredValue(q);   // הקלדה חלקה: הסינון רץ ברקע
  const [kats, setKats] = useState(() => new Set());   // קטגוריות מסומנות (בחירה מרובה)
  const [katOpen, setKatOpen] = useState(false);
  // דף קו נכנס להיסטוריית הדפדפן (וגם לקישור, אחרי ה-#) — כפתור "אחורה"
  // בטלפון חוזר לרשימה במקום לצאת מהאתר, וקישור לקו נפתח ישירות עליו.
  // ‎#2012/<k>‎ הוא כתובת של קו 2012 בלי מקבילה של היום — נפתח בפיד.
  const H0 = safeHash().slice(1);
  const isStopH = (h) => h.startsWith("stop=");
  // ‎#מקט@תאריך‎ — קישור מציר תחנה שנוחת ישר על גרסת השינוי
  const splitRdDate = (h) => { const i = h.lastIndexOf("@"); return i > 0 ? [h.slice(0, i), h.slice(i + 1)] : [h, null]; };
  const isDigestH = (h) => h.startsWith("digest=");
  const parseDigest = (h) => { const [c, d] = h.slice(7).split("@"); return { city: c, days: Math.min(Math.max(parseInt(d) || 7, 1), 3650) }; };
  const [dig, setDig] = useState(() => (isDigestH(H0) ? parseDigest(H0) : null));
  const _plainH = H0 && !H0.startsWith("2012/") && !isStopH(H0) && !isDigestH(H0) && !H0.startsWith("t=");
  const [rd, setRd] = useState(() => (_plainH ? splitRdDate(H0)[0] : null));
  const [rdDate, setRdDate] = useState(() => (_plainH ? splitRdDate(H0)[1] : null));
  const [stopSel, setStopSel] = useState(() => (isStopH(H0) ? H0.slice(5) : null));
  // מונה פתיחות: לחיצה חוזרת על קישור לאותה תחנה חייבת לפתוח מחדש גם
  // כשהמזהה עצמו לא השתנה
  const [stopSelN, setStopSelN] = useState(0);
  const [byDay, setByDay] = useState(() => location.hash === "#t=early");   // תצוגת "שינויים לפי יום"
  // ‎#2012/<k>‎ הוא עמוד לכל דבר, ולא שורה שנפתחת בתוך הפיד
  const [k12, setK12] = useState(() => (H0.startsWith("2012/") ? H0.slice(5) : null));
  const [anc12, setAnc12] = useState({});      // מפתח קו 2012 -> מק"ט של היום
  useEffect(() => {
    if (!k12) return;
    getAnchors2012().then((d) => {
      const m = {};
      for (const [rd, v] of Object.entries(d.anchors || {})) if (!(v.k in m)) m[v.k] = rd;
      setAnc12(m);
    });
  }, [k12]);
  // ערים להרשמה להתראות — מערי הקצה של כל הקווים בקטלוג
  const notifyCities = useMemo(() => {
    const cnt = {};
    (((idx || {}).lines) || []).forEach((l) => destCities(l.dest).forEach((c) => { cnt[c] = (cnt[c] || 0) + 1; }));
    return Object.keys(cnt).filter((c) => cnt[c] >= 3).sort((a, b) => cnt[b] - cnt[a]);
  }, [idx]);
  const [lim, setLim] = useState(200);   // "הצג עוד" מרחיב; חיפוש חדש מאפס
  useEffect(() => setLim(200), [q, kats]);
  useEffect(() => {
    const onPop = (e) => { setRd((e.state && e.state.rd) || null); setK12((e.state && e.state.k12) || null); };
    const onHash = () => {
      const h = safeHash().slice(1);
      if (h.startsWith("2012/")) { setRd(null); setK12(h.slice(5)); return; }
      if (isStopH(h)) { setRd(null); setStopSel(h.slice(5)); setStopSelN((n) => n + 1); setTab("stops"); return; }
      if (isDigestH(h)) { setRd(null); setK12(null); setDig(parseDigest(h)); return; }
      if (/^t=rail@/.test(h)) { location.reload(); return; }   // קישור ליום בארכיון הרכבת — טעינה מחדש פותחת בדיוק עליו
      if (h.startsWith("t=")) { setRd(null); setK12(null); const t = h.slice(2); if (t === "early") { setTab("lines"); setByDay(true); try { sessionStorage.setItem("lh-day-yr","2012"); sessionStorage.setItem("lh-day-mon","2012-07"); } catch {} } else if (t === "stops" || t === "lines" || t === "map" || TABS.some((x) => x.k === t)) setTab(t); return; }
      // כתובת של קו נקראה רק בטעינה הראשונה: מי שהדביק קישור לקו בשורת
      // הכתובת של לשונית פתוחה, או ערך את הכתובת ידנית, נשאר במסך הקודם.
      // pushState/replaceState אינם מפעילים hashchange, ולכן אין כאן לולאה.
      if (h) { setK12(null); const [r, dt] = splitRdDate(h); setRd(r); setRdDate(dt); }
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onHash);
    return () => { window.removeEventListener("popstate", onPop); window.removeEventListener("hashchange", onHash); };
  }, []);
  const openLine = (r) => {
    setDig(null); setK12(null); setRdDate(null); history.pushState({ rd: r }, "", "#" + encodeURIComponent(r)); setRd(r); };
  const open12 = (k) => { history.pushState({ k12: k }, "", "#2012/" + encodeURIComponent(k)); setK12(k); };
  const switchLine = (r) => { history.replaceState({ rd: r }, "", "#" + encodeURIComponent(r)); setRd(r); };
  // הכתובת חוזרת לשורש רק בטאב "קווים"; בכל טאב אחר נשאר ‎#t=<טאב>‎ —
  // כך ריענון מחזיר לאותו מקום ולא לעמוד הראשי (בקשת שלמה)
  const clearHashKeepTab = (t) => {
    const tt = typeof t === "string" ? t : tab;
    history.replaceState(null, "", tt && tt !== "lines" ? "#t=" + tt : location.pathname + location.search);
  };
  // כתובת הרשימה של טאב (כמו ש-clearHashKeepTab כותב) — ל-href של הלשוניות ושל "חזרה"
  const tabHrefLH = (tt) => (tt && tt !== "lines" ? "#t=" + tt : location.pathname + location.search);
  const backToList = (t) => {
    setRd(null);
    clearHashKeepTab(t);
  };
  const toggleKat = (k) => setKats((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const [rty, setRty] = useState(0);
  useEffect(() => {
    dfetch("data/lines.json")
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(async d => {
        const groups = await dfetch("data/historical-groups-2012.json").then(r => r.ok ? r.json() : {}).catch(() => ({}));
        // קווים עם שינוי זמני (הקו המודיע) — לקטגוריה "שינוי זמני"
        const tmp = await fetch("data/temp/index.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : []).catch(() => []);
        if (tmp.length && d && d.lines) { const ts = new Set(tmp); d.lines.forEach((l) => { if (l.rd && ts.has(l.rd.split("-")[0])) l.tmp = 1; }); }
        // קו ממשיך — השערה (tools/line_successors.py)
        const suc = await fetch("data/successors/index.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : []).catch(() => []);
        if (suc.length && d && d.lines) { const ss = new Set(suc); d.lines.forEach((l) => { if (ss.has(l.rd)) l.succ = 1; }); }
        DATA_GEN = d.gen || null;
        setKnownCities(d && d.lines);
        setIdx(attach2012Groups(d, groups));
      })
      .catch(setErr);
  }, [rty]);
  const counts = useMemo(() => {
    const c = {};
    if (idx) {
      const keys = CAT_GROUPS.flatMap((g) => g.items);
      // אותה אוכלוסייה שהרשימה מציגה. אחרת המספר ליד הקטגוריה גדול ממה
      // שנפתח בלחיצה עליה.
      idx.lines.filter((l) => !l.tt || l.tt === "demand").forEach((l) => {
        keys.forEach((k) => { if (catMatch(l, k)) c[k] = (c[k] || 0) + 1; });
      });
    }
    return c;
  }, [idx]);
  // אילו מק"טים עדיין פעילים — כדי להבדיל חלופה מבוטלת מקו שבוטל כולו
  // הטאב אינו חלק מהכתובת, ולכן ריענון או פתיחת קישור ישיר לקו החזירו
  // תמיד ל"קווים" — וכפתור "חזרה" הוציא את המשתמש מקו רכבת אל רשימת
  // האוטובוסים. הטאב נגזר מסוג הקו הפתוח, כך שהחזרה נוחתת במקום שממנו
  // הגיע גם כשהמצב בזיכרון אבד.
  useEffect(() => {
    if (!idx || !rd) return;
    const l = idx.lines.find((x) => x.rd === rd);
    const t = l && l.tt && TABS.find((x) => x.tts.includes(l.tt));
    setTab(t ? t.k : "lines");
  }, [idx, rd]);
  const mktAlive = useMemo(() => {
    const m = {};
    if (idx) idx.lines.forEach((l) => { if (!lineGoneAt(l) && !l.historicalOnly) m[l.rd.split("-")[0]] = true; });
    return m;
  }, [idx]);
  const isLineGone = (l) => !!lineGoneAt(l) && !mktAlive[l.rd.split("-")[0]];
  // הסינון והמיון של 13 אלף שורות ב-useMemo: קודם הם רצו מחדש גם ברינדורים
  // שאינם קשורים לחיפוש — פתיחת קטגוריות, "הצג עוד" — תקיעות מורגשת בנייד
  // כרטיסי הקווים שנפתחו או נסגרו בחיפוש (הראשון פתוח מעצמו); חיפוש חדש מאפס
  const [gOpen, setGOpen] = useState(() => new Set());
  useEffect(() => setGOpen(new Set()), [dq, kats]);
  const searchRes = useMemo(() => {
    const needle = dq.trim();
    if (!idx || (!needle && !kats.size)) return { list: [], total: 0 };
    const inKats = (l) => {
      if (!kats.size) return true;
      for (const k of kats) { if (catMatch(l, k)) return true; }
      return false;
    };
    // חיפוש רב-מילים: "13 קרית גת" — כל מילה חייבת להתאים לאחד השדות.
    // ההשוואה דרך sQ: גרשיים בכל צורה (רשל"צ / רשל''צ / רשל״צ) מתאימים
    const toks = sQ(needle).split(/\s+/).filter(Boolean);
    // טאב "קווים" הוא אוטובוסים. קווי "שירות לפי דרישה" מופעלים בידי חברות
    // האוטובוס ונשארים גם כאן, ולא רק בטאב סוגי התחבורה (בקשת המשתמש).
    const buses = idx.lines.filter((l) => !l.tt || l.tt === "demand");
    let list = buses.filter((l) => inKats(l) && matchesRouteSearch(l, needle, citySearch.data, null, true));
    const onlyRemoval = kats.size > 0 && [...kats].every((k) => REMOVAL_CATS.has(k));
    // דירוג: קודם מספר הקו המדויק, אחריו קווים שמתחילים בו, ורק בסוף
    // התאמות מק"ט/יעד/מפעיל — ובתוך כל דרגה לפי סדר מספרי
    const numTok = toks.find((t) => /^\d/.test(t)) || toks[0] || "";
    const rank = (l) => !numTok ? 0 : l.line === numTok ? 0 : l.line.startsWith(numTok) ? 1
      : l.rd.startsWith(numTok) ? 2 : ((l.dest || "").includes(numTok) ? 3 : 4);
    const lnum = (l) => parseInt(l.line) || 1e9;
    if (needle) list.sort((a, b) => rank(a) - rank(b) || lnum(a) - lnum(b) || a.line.localeCompare(b.line) || a.rd.localeCompare(b.rd));
    else if (onlyRemoval) list.sort((a, b) => (b.ld || "").localeCompare(a.ld || ""));
    else list.sort((a, b) => lnum(a) - lnum(b) || a.line.localeCompare(b.line) || a.rd.localeCompare(b.rd));
    list = collapse2012Rows(list);
    return { total: list.length, list: list.slice(0, lim) };
  }, [idx, dq, kats, lim, citySearch.data]);
  // סטטוס HTTP = הקובץ באמת לא קיים; כל כשל אחר הוא תקלת רשת — עם כפתור
  // ניסיון חוזר במקום הודעה שגורמת לגולש לחשוב שאין נתונים
  if (err) return (
    <div className="boot">{/^\d+$/.test(String(err && err.message))
      ? "הנתונים עוד לא נוצרו — הריצה הראשונה של הצינור תיצור אותם. נסו לרענן מאוחר יותר."
      : <>📡 הנתונים לא ירדו — כנראה תקלת רשת רגעית.{" "}
        <button className="morebtn" onClick={() => { setErr(null); setRty((n) => n + 1); }}>↻ נסו שוב</button></>}
    </div>);
  // האינדקס (3.6MB) נדרש רק לחיפוש הקווים — טאב התחנות, הפיד היומי ועמודי
  // קווים מקישור ישיר עובדים בלעדיו, ולכן האתר כבר לא מחכה לו כדי להופיע
  const needle = q.trim();
  const { list, total } = searchRes;
  const changed = idx ? idx.lines.filter((l) => (l.ks||[]).some(k=>!["baseline","snapshot","times"].includes(k))).length : 0;
  return (
    <LiteCtx.Provider value={lite}>
    <div className="wrap">
      <RecheckNotice />
      <CitySearchStatus state={citySearch} />
      <header>
        <h1><img src="favicon.svg" alt="" width="34" height="34" style={{ width: "1.4em", height: "1.4em", verticalAlign: "-.38em" }} /> הקו בזמן</h1>
        <button className="dmore" aria-label="עוד אפשרויות" aria-haspopup="dialog" onClick={() => setMenu(true)}>⋯</button>
        {/* כפתור הנגישות (a11y.js) נכנס לכאן — בפס העליון, לא צף */}
        <span data-a11y-slot="" style={{ display: "inline-flex", flex: "none", width: 44, height: 44 }} />
        <p className="tag">היסטוריית מסלולים ותחנות: צילומי אתרי מידע לנוסעים מ־2003 בכיסוי חלקי, נתוני GTFS מ־2012 ותיעוד רציף ממרץ 2017. צילום בארכיון אינו הודעה על שינוי.</p>
        <div className="stats">
          {idx ? (<>
            <span className="stat"><b>{idx.lines.length.toLocaleString()}</b> וריאנטים מתועדים</span>
            <span className="stat"><b>{changed.toLocaleString()}</b> עם שינויים</span>
            <span className="stat mut">עודכן: {idx.gen}</span>
          </>) : <span className="stat mut">טוען את רשימת הקווים ברקע…</span>}
        </div>
      </header>
      {/* פרסום חדש: גם רשימת החודשים נטענת מחדש, אחרת דף פתוח נשאר עם חודשים ומקורות ישנים מול אינדקס חדש */}
      <WebsiteImportStatus onPublished={()=>{MONTHS_P=null;setRty(n=>n+1);window.dispatchEvent(new Event("website-history-published"));}} />
      <div className="tabs" role="tablist" aria-label="אזורי האתר">
        {/* לשוניות כקישורים (‎#t=stops‎ וכו') — אפשר לפתוח לשונית בכרטיסייה חדשה */}
        <a role="tab" aria-selected={tab === "lines"} className={"tab" + (tab === "lines" ? " on" : "")} title="חיפוש בכל קווי האוטובוס בארץ והיסטוריית השינויים של כל קו" href={tabHrefLH("lines")} onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); setTab("lines"); backToList("lines"); }}>🚌 קווים</a>
        <a role="tab" aria-selected={tab === "stops"} className={"tab" + (tab === "stops" ? " on" : "")} title="חיפוש תחנות והיסטוריית השינויים שלהן — שינוי שם, הזזה, ביטול" href={tabHrefLH("stops")} onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); setTab("stops"); backToList("stops"); }}>🚏 תחנות</a>
        <a role="tab" aria-selected={tab === "map"} className={"tab" + (tab === "map" ? " on" : "")} title="מפה לפי עיר וחודש: תחנות שהשתנו וקווים שהשתנו, כפי שהיו אז" href={tabHrefLH("map")} onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); setTab("map"); backToList("map"); }}>🗺️ מפה</a>
        {TABS.map((t) => (
          <a key={t.k} role="tab" aria-selected={tab === t.k} className={"tab" + (tab === t.k ? " on" : "")} title={t.tip} href={tabHrefLH(t.k)}
            onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); setTab(t.k); backToList(t.k); }}>{t.icon} {t.label}</a>
        ))}
      </div>
      {!rd && !k12 && !dig && <NotifyCenter cities={notifyCities} />}
      {dig ? (
        <DigestPage city={dig.city} days={dig.days} openLine={openLine} backHref={tabHrefLH(tab)}
          onBack={() => { setDig(null); clearHashKeepTab(); }} />
      ) : k12 ? (
        <Line2012Page k12={k12} anchorRd={anc12[k12] || null} openLine={openLine} backHref={tabHrefLH(tab)}
          onBack={() => { setK12(null); clearHashKeepTab(); }} />
      ) : tab === "stops" ? <StopsTab idx={idx} openLine={openLine} sel={stopSel} selN={stopSelN} /> : tab === "map" && !rd ? <MapTab idx={idx} openLine={openLine} cities={notifyCities} /> : (TABS.some((t) => t.k === tab) && !rd) ? (
        idx ? <ModesTab key={tab} idx={idx} openLine={openLine} spec={TABS.find((t) => t.k === tab)} />
          : <div className="card">טוען את רשימת הקווים…</div>
      ) : rd ? (
        /* קישור ישיר לקו נפתח לפני שהאינדקס הגיע — בלי ההגנות האלה הדף
           קרס ללבן (הבאג ששלמה מצא): idx עדיין null ו-idx.lines התפוצץ */
        <LinePage rd={rd} lineGone={idx ? (l => !(l?.historicalOnly && !lineGoneAt(l)))(idx.lines.find(l => l.rd === rd)) && !mktAlive[rd.split("-")[0]] : false}
          sibs={lineSiblings(idx, rd)}
          onSwitch={switchLine} onBack={backToList} initDate={rdDate} backHref={tabHrefLH(tab)}
          initCats={[...kats].sort().join(",")} />
        /* עמוד הקו — בעיצוב הקודם גם בתצוגה החדשה (שלמה 08.10: "הדף הראשי בעיצוב החדש, ובכניסה לקו
           העיצוב הישן"). עמוד הקו "הקל" נשאר בקוד (lite) אם יוחלט לחזור אליו */
      ) : (
        <div className="card">
          {/* "שינויים לפי יום" באותו עמוד, מתחת לקטגוריות, והקטגוריות המסומנות
              מסננות גם אותו (שלמה 13.09) */}
          {!byDay && <input className="search" type="search" dir="rtl" autoFocus
            placeholder="חיפוש קו: מספר קו, מק״ט, יעד או מפעיל…"
            value={q} onChange={(e) => setQ(e.target.value)} />}
          <div className="katbox">
            <button className="kathead" aria-pressed={byDay} title={byDay ? "חזרה לחיפוש הקווים" : "פיד כרונולוגי: בחירת שנה וחודש ורואים כל שינוי שקרה, בכל קו בארץ, לפי תאריך"} onClick={() => setByDay(!byDay)}>
              {byDay ? "🔎 חזרה לחיפוש הקווים" : lite ? "🗓️ שינויים לפי יום" : "🗓️ שינויים לפי יום — מה השתנה בכל תאריך, בכל הקווים"}
            </button>
          </div>
          <div className="katbox">
            <button className="kathead" aria-expanded={katOpen} onClick={() => setKatOpen(!katOpen)}>
              <span className="katarrow" aria-hidden="true">{katOpen ? "▼" : "◀"}</span>
              {lite ? "🗂️ סינון לפי סוג שינוי" : "🗂️ קטגוריות לבחירה"}
              {kats.size > 0 && <b className="katn">{kats.size} מסומנות</b>}
            </button>
            {katOpen && (
              <div className="katlist">
                {CAT_GROUPS.map((g) => (
                  <React.Fragment key={g.title}>
                    <div className="katgrp">{g.title}</div>
                    {g.items.map((k) => (
                      <label key={k} className="katrow">
                        <input type="checkbox" checked={kats.has(k)} onChange={() => toggleKat(k)} />
                        <i className="katdot" style={{ background: catColor(k) }} />
                        <span className="katlab">{CAT_LABELS[k]}</span>
                        {/* עד שאינדקס הקווים נטען המונה הראה 0 מטעה */}
                        <b className="katc">{idx === null ? "טוען…" : (counts[k] || 0).toLocaleString()}</b>
                      </label>
                    ))}
                  </React.Fragment>
                ))}
                <div className="katnote">
                  ℹ️ הקטגוריות משותפות לכל השנים. מוצגים שינויים רק כשיש נתונים להשוואה.
                  היוצא מן הכלל הוא שינוי מספר הרכבים באותה יציאה, שנרשם רק מ-08.2026:
                  הוא נשען על קובץ רישוי שהארכיונים לא שמרו.
                </div>
                {kats.size > 0 && (
                  <button className="katclear" onClick={() => setKats(new Set())}>✖ נקה את הבחירה</button>
                )}
              </div>
            )}
          </div>
          {byDay ? (
            <DayFeed idx={idx} openLine={openLine} open12={open12} kats={kats} embedded onBack={() => setByDay(false)} />
          ) : (needle || kats.size > 0) && !idx ? (
            <div className="empty">טוען את רשימת הקווים — החיפוש יעבוד בעוד רגע…</div>
          ) : (needle || kats.size > 0) ? (
            <div className="llist">
              {(() => {
                const renderRow = (l, lab, ad) => (
                <a key={l.rd} className="lrow" href={lineHref(l.rd)}
                  onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); openLine(l.rd); }}>
                  <span className="badge sm">{l.line || TT_ICON[l.tt] || "—"}</span>
                  {lab && <span className="altlab">{lab}</span>}
                  {l.tt === "rail" && <WhyMark rd={l.rd} />}
                  {lineGoneAt(l) && (isLineGone(l) ? (
                    <span className="k" style={{ background: isRemovedYear(l) ? "#7f1d1d" : "#dc2626" }}>
                      {isRemovedYear(l) ? "הקו בוטל — מעל שנה" : "הקו בוטל"}
                    </span>
                  ) : (
                    <span className="k" style={{ background: isRemovedYear(l) ? "#9a3412" : "#ea580c" }}>
                      {isRemovedYear(l) ? "חלופה בוטלה — מעל שנה" : "חלופה בוטלה"}
                    </span>
                  ))}
                  <span className="ldest">{lite ? (routeTitle(l.dest, l) || l.dest) : destShow(l.dest)}{ad && <small className="altdesc">{ad}</small>}</span>
                  <span className="lmeta">{l.op}{mkTag(l.rd)} · {l.v > 1 ? (l.v - 1) + " שינויים" : "ללא שינויים עדיין"}
                    {l.historicalOnly && !goneStale(l) && <> · תיעוד היסטורי בלבד; מצב נוכחי לא נקבע</>}
                    {lineGoneAt(l) && <> · {goneStale(l) ? <>מבוטל (לא נצפה מאז {fmtD(l.ld)})</> : <>מבוטל מאז {fmtD(l.ld)}</>}</>}</span>
                </a>);
                // בתצוגה החדשה בלי רשומות הארכיון (2012 ואתרי המידע 2003–2015) בחיפוש — הן נמצאות ב"לפי יום"
                // (שלמה 09.10: "תמחק את המילה ארכיון, אפשר לחפש את זה בקלות לפי יום")
                const G = groupSearch(lite ? list.filter((l) => /^\d/.test(String(l.rd))) : list, needle);
                const isOpen = (g, i, first) => (first && i === 0) ? !gOpen.has(g.key) : gOpen.has(g.key);
                const tog = (k) => setGOpen((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
                return <>
                  {G.exact.map((g, i) => <SearchGroup key={g.key} g={g} open={isOpen(g, i, true)} onToggle={() => tog(g.key)} renderRow={renderRow} />)}
                  {G.similar.length > 0 && <div className="lgsep">{G.exact.length ? "קווים דומים" : "אין קו " + G.num + " — קווים דומים"}</div>}
                  {G.similar.map((g, i) => <SearchGroup key={g.key} g={g} open={isOpen(g, i, !G.exact.length)} onToggle={() => tog(g.key)} renderRow={renderRow} />)}
                </>;
              })()}
              {list.length === 0 && (
                <div className="empty">{kats.size > 0 && !needle
                  ? "אין עדיין קווים בקטגוריות שסימנתם — קטגוריות של מסלול ותחנות מצטברות מההשוואות היומיות מכאן והלאה."
                  : "לא נמצא קו תואם."}</div>
              )}
              {total > list.length && (
                <button className="morebtn" onClick={() => setLim(lim + 300)}>
                  ⌄ הצג עוד — מוצגים {list.length.toLocaleString()} מתוך {total.toLocaleString()}
                </button>
              )}
              <Res2012 needle={needle} onOpen={open12} />
            </div>
          ) : (
            <RecentChanges idx={idx} openLine={openLine} onAll={() => setByDay(true)} lite={lite} />
          )}
        </div>
      )}
      {menu && (
        <div className="lmenu-ovl" onClick={(e) => { if (e.target === e.currentTarget) setMenu(false); }}>
          <div className="lmenu" role="dialog" aria-modal="true" aria-label="עוד אפשרויות">
            <div className="lmhead"><b>עוד</b><button className="lmx" aria-label="סגירה" onClick={() => setMenu(false)}>✕</button></div>
            {[
              ["🔔 התראות על שינויים", "עיר, סוגי שינויים ותדירות", () => { setTab("lines"); backToList("lines"); setTimeout(() => window.dispatchEvent(new Event("kb-open-notify")), 50); }],
              ["🗓️ שינויים לפי יום", "מה השתנה בכל תאריך, בכל הקווים", () => { setTab("lines"); backToList("lines"); setByDay(true); }],
              ["🗂️ סינון לפי סוג שינוי", "מסלול, תחנות, ביטולים, מפעיל", () => { setTab("lines"); backToList("lines"); setKatOpen(true); }],
              ["📚 על המקורות", "מאיפה הנתונים ומתי הם מתעדכנים", () => { setTimeout(() => { const d = document.getElementById("data-sources"); if (d) { d.open = true; d.scrollIntoView({ block: "start", behavior: "smooth" }); } }, 50); }],
              ["🔗 שיתוף", "קישור למסך הזה", () => { const u = location.href; if (navigator.share) navigator.share({ url: u }).catch(() => {}); else if (navigator.clipboard) navigator.clipboard.writeText(u).catch(() => {}); }],
              [lite ? "↩ לתצוגה הקודמת" : "✨ לתצוגה החדשה", lite ? "כל הפרטים על המסך, כמו קודם" : "פחות מידע על המסך, הפרטים בלחיצה", () => setLite(!lite)],
            ].map(([t, sub, fn]) => (
              <button key={t} className="lmitem" onClick={() => { setMenu(false); fn(); }}>{t}<small>{sub}</small></button>
            ))}
          </div>
        </div>
      )}
      <details className="srcbox" id="data-sources">
        <summary>📚 המקורות — מאיפה מגיע כל פרט, ועד לאן הוא מגיע</summary>
        <div className="srclist">
          {SOURCES.map((s) => (
            <div className="srcitem" key={s.t}>
              <div className="srct">{s.t} <span className="srcd">{s.d}</span></div>
              <div className="srcb">{s.b}</div>
              <div className="srcb">{s.links.map(([label, href], i) => <React.Fragment key={href}>{i > 0 && " · "}<a href={href} target="_blank" rel="noopener noreferrer">{label}</a></React.Fragment>)}</div>
            </div>
          ))}
          <div className="srcfoot">
            רוב היסטוריית הקווים והתחנות מבוססת על צילומי GTFS של משרד התחבורה,
            שנשמרו אצל גופים שונים. לפני 2012 המקור הוא צילומי אתרי המידע לנוסעים.
            רשת מגיעים, רישום התחנות ב־OpenStreetMap ורכבת פתוחה
            הם מקורות נוספים, כמפורט למעלה. שינוי בין צילומים משקף שינוי בפרסום ולא בהכרח
            את מועד השינוי בשטח. כשיש פער בין צילומים, אין ודאות לגבי היום המדויק.
            <p>השנים מציינות את טווחי המקורות, ולא כיסוי מלא לכל יום או לכל קו.
            הקליטה והבדיקה של הארכיונים נמשכות, והכיסוי הזמין מוצג בקטגוריה ובשנה שנבחרו.</p>
            <p><a href="https://gtfs.org/" target="_blank" rel="noopener noreferrer">GTFS.org</a> מתעד את פורמט הנתונים.
            ארכיון GTFS Data Exchange הוזכר במחקר המקורות, אך לא ייבאנו ממנו קבצים;
            אין באתר קובצי GTFS ישראליים מלפני 2012.</p>
          </div>
        </div>
      </details>
      <footer>
        במסגרת <a href="../" target="_blank" rel="noopener">הקו הבוחן</a> · מקורות הנתונים: 
        היסטוריה: אתרי המידע לנוסעים ב־Internet Archive (2003–2015), מרחב ו־Internet Archive (2012), מגיעים ו־OpenStreetMap (2012), רכבת פתוחה (2013–2014), משרד התחבורה — חופש מידע (2013–2017), אוטובוס פתוח והסדנא לידע ציבורי (2015–2018, 2022–2026), TransitFeeds/OpenMobilityData (2017–2022). פירוט וקישורים בסעיף המקורות שמעל.
      </footer>
    </div>
    </LiteCtx.Provider>
  );
}

// רשת ביטחון לכל הדף (שלמה 18.10): בלי זה, שגיאה בכל רכיב מורידה את העמוד כולו ומשאירה דף ריק.
// עם זה מוצגת הודעה קצרה עם כפתור רענון, והשגיאה נכתבת לקונסול.
class RootSafe extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error('RootSafe:', err, info && info.componentStack); }
  render() {
    if (!this.state.err) return this.props.children;
    return <div dir="rtl" style={{ maxWidth: 520, margin: '15vh auto', padding: '24px 20px', textAlign: 'center', font: '16px/1.6 system-ui, sans-serif' }}>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>משהו השתבש בדף</div>
      <div style={{ opacity: .75, marginBottom: 16 }}>רענון של הדף בדרך כלל פותר את זה.</div>
      <button type="button" onClick={() => location.reload()} style={{ font: 'inherit', fontWeight: 700, padding: '10px 22px', borderRadius: 12, border: 0, background: '#0f172a', color: '#fff', cursor: 'pointer' }}>רענון</button>
    </div>;
  }
}
ReactDOM.createRoot(document.getElementById("root")).render(<RootSafe><App /></RootSafe>);
