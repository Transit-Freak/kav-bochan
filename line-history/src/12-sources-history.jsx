/* הקו בזמן · 12-sources-history.jsx — הלשוניות והמקורות (TABS, SOURCES), סוגי תחבורה (ModesTab), הארכיון ההיסטורי וההודעות של החברות.
   חלק מ-line-history/src (הסדר ב-files.json). כל החלקים מחוברים לפי הסדר ומקומפלים יחד בדפדפן (index.html),
   כך שכל השמות משותפים בין החלקים כמו בקובץ אחד. */

const TABS = [
  { k: "rail", icon: "🚆", label: "רכבת", tts: ["rail", "lightrail", "cable"],
    tip: "רכבת ישראל, הרכבת הקלה בירושלים, הכרמלית וכבל אקספרס — היסטוריית מסלולים ותחנות",
    groups: [
      { k: "heavy", icon: "🚆", label: "רכבת ישראל", tts: ["rail"] },
      { k: "light", icon: "🚊", label: "רכבת קלה וכרמלית", tts: ["lightrail", "cable"] },
    ] },
  { k: "taxi", icon: "🚕", label: "מוניות שירות", tts: ["taxi"],
    tip: "קווי מוניות השירות שבפיד הארצי — מסלולים, תחנות והשינויים בהם",
    groups: [] },
];
// רשת 2012 היא אוטובוסים בלבד — לסוגים האלה אין שם מקבילה
const NO_2012 = new Set(["rail", "lightrail", "cable", "taxi"]);
// תיבת "2012" בעמוד הקו (המסלול ב-2012, רצף התחנות, התאמה למגיעים) — הוסרה לבקשת שלמה (08.10: "תוריד את 2012").
// עמודי קווי 2012 עצמם, האירועים שלהם בציר הזמן והחיפוש — לא השתנו.
const SHOW_2012_BOX = false;
const TT_ICON = { rail: "🚆", taxi: "🚕", lightrail: "🚊", cable: "🚡", demand: "🚐" };
// מקור האירוע — שלושה מקורות שונים לחלוטין, וכל אחד עם דיוק אחר. בלי
// לנקוב בשם, "מארכיון הפיד הארצי" לא אומר מי מדד ומתי.
// קווי הרכבת מ-2021 (R… — rail_now.py) הם זוג תחנות קצה, אין להם מק"ט של משרד התחבורה
// המק"ט בתצוגה: "42055-#-2" — המק"ט, החלופה (# = ראשית) באמצע, והכיוון בסוף (שלמה 29.10).
// נבנה בסדר המוצג ומוצג משמאל לימין, כדי שהדפדפן לא יערבב את החלקים בתוך השורה העברית.
const mkShow = (rd) => { const p = String(rd || "").split("-"); return p.length === 3 && /^\d+$/.test(p[0]) ? `${p[0]}-${p[2]}-${p[1]}` : String(rd || ""); };
const mkTag = (rd) => String(rd).startsWith("R") ? null : <>{" · מק״ט "}<span className="rdnum" dir="ltr">{mkShow(rd)}</span></>;

const SRC_LABEL = {
  "rail-now": "מקור: לוחות הזמנים של רכבת ישראל שפורסמו — ארכיון TransitFeeds (עד 2022) והארכיון של דאטאבוס, צילום אחד בכל חודש",
  websiteArchive: "מקור: אתר מידע לנוסעים שנשמר ב־Internet Archive. כיסוי חלקי.",
  miu12: "מקור: ארכיון מרחב ו־Internet Archive.",
  obusOld: "מקור: ארכיון אוטובוס פתוח / הסדנא לידע ציבורי.",
  obusLate: "מקור: הארכיון היומי של אוטובוס פתוח / הסדנא לידע ציבורי (2017–2022).",
  "mot-foi": "מקור: משרד התחבורה (חופש מידע) — קובץ \"מסלול לפי שנים\" 2013–2017. התאריכים משוערים.",
  tf: "מקור: ארכיון TransitFeeds / OpenMobilityData.",
  tf17: "מקור: ארכיון TransitFeeds / OpenMobilityData.",
  ob: "מקור: ארכיון הסדנא לידע ציבורי (Open Bus) — צילומים יומיים, 01.2022–07.2026",
  v10: "מקור: קובץ הרישוי היומי Gtfs_10_days של משרד התחבורה — הפורמט שמייצג כמה רכבים באותה יציאה",
  _daily: "מקור: הסריקה היומית שלנו — השוואת הפיד הארצי, יום מול יום",
  rishui: "מקור: מאגר \"רישוי מערך האוטובוסים\" של משרד התחבורה (data.gov.il) — סוג וגודל הרכב שנקבעו לקו, שורה לכל מק\"ט לכל יום מ-2022",
  ctl: "מקור: רשימת האשכולות (ClusterToLine) שמשרד התחבורה מפרסם לצד לוח הזמנים — סוג הקו ואשכול המכרז, צילום יומי מ-03.2022 בארכיון הסדנא לידע ציבורי; הייחודיות (תלמידים/לילה/מזינים) — קובץ הנוסעים של המשרד",
};

// רשימת המקורות המלאה. היא מוצגת למשתמש ולא רק מתועדת בקוד: מי שקורא
// "תחנה בוטלה ב-2019" צריך לדעת מאיפה זה ידוע, ומה הגבול של מה שידוע.
const SOURCES = [
  {
    t: "צילומי אתרי מידע לנוסעים",
    d: "10.2003 – 2015",
    b: "צילומים של אתרי המידע לנוסעים מ-2003, שנשמרו ב-Internet Archive.",
    more: "האתרים: otobusim.com (מ-2003), otobusim.co.il (מ-2007) ו-bus.co.il (מ-2010). אלה המקורות לכל מה שלפני 2012. לכל צילום יש קישור למקור ותאריך שמירה. מזהי התחנות פנימיים לכל אתר, ואין התאמה מוכחת למספרי משרד התחבורה.",
    links: [["Wayback Machine", "https://web.archive.org/"], ["מצב האיסוף", "data/website-archive-summary.json"], ["מאגר הצילומים עם המקורות", "data/website-archive.json.gz"]],
  },
  {
    "t": "קובצי GTFS ששוחזרו מעמותת מרחב",
    "d": "07–21.07.2012",
    "b": "קובצי GTFS אזוריים מ-2012 של נחמן שלף ועמותת מרחב, ששוחזרו מ-Internet Archive.",
    "links": [
      [
        "קובצי המקור ותאריכיהם",
        "https://github.com/Transit-Freak/kav-bochan/blob/main/line-history/data/early-sources.json"
      ],
      [
        "Internet Archive",
        "https://web.archive.org/"
      ]
    ]
  },
  {
    "t": "רשת 2012 מאתר מגיעים",
    "d": "צילום יחיד מ-2012",
    "b": "רצפי תחנות של 3,214 קווים מאתר מגיעים, 2012.",
    "links": [
      [
        "הנתונים ששוחזרו באתר",
        "../magihim-2012/data/index.json"
      ],
      [
        "תהליך בניית רשת מגיעים",
        "https://github.com/Transit-Freak/kav-bochan/blob/main/tools/build_magihim_site.py"
      ]
    ]
  },
  {
    "t": "OpenStreetMap: רישום תחנות 2012",
    "d": "2012",
    "b": "מיקומי התחנות ומספריהן ברישום משרד התחבורה מ-2012, כפי שיובא ל-OpenStreetMap.",
    "links": [
      [
        "OpenStreetMap",
        "https://www.openstreetmap.org/copyright"
      ],
      [
        "תהליך הצלבת התחנות",
        "https://github.com/Transit-Freak/kav-bochan/blob/main/tools/crossref_magihim_stops.py"
      ]
    ]
  },
  {
    "t": "רכבת פתוחה",
    "d": "2013–2014",
    "b": "רישומי רכבת ישראל: מספר רכבת, תחנה, וזמני הגעה ויציאה מתוכננים ובפועל.",
    "links": [
      [
        "ארכיון רכבת פתוחה",
        "https://github.com/hasadna/OpenTrainCommunity/tree/8dd9ba7b3ebed022469723df6974b27bf2c5577d/data"
      ]
    ]
  },
  {
    t: "משרד התחבורה (חופש מידע)",
    d: "12.2013 – 2017",
    b: "רצפי תחנות של כל קו מ-2013 עד 2017, מבקשת חופש מידע. התאריכים משוערים ואין שרטוט מסלול.",
    more: "קובץ \"מסלול לפי שנים\": רצף התחנות של כל גרסת מסלול בכל מק\"ט, מספר הנסיעות שלה בכל שנה ויום הנסיעה האחרון שלה. ממנו ההיסטוריה שלפני התיעוד הרשמי של כל קו (בעיקר 2014–2015), וקווים שהסתיימו לפני 2015. שינוי מסומן ביום שאחרי הנסיעה האחרונה במסלול הקודם. אין בקובץ מספר קו או מפעיל, ושמות התחנות בו הם השמות המאוחרים, ולכן השם נלקח מהתיעוד של התקופה כשיש.",
    links: [["הקבצים המקוריים", "https://github.com/Transit-Freak/kav-bochan/releases/tag/data-foi-routes-2013-2017"], ["סיכום הייבוא", "data/foi-import.json"]],
  },
  {
    "t": "הארכיון הישן של אוטובוס פתוח",
    "d": "2015–2018",
    "b": "קובצי GTFS מ-2015 עד 2018, מארכיון הסדנא לידע ציבורי.",
    "links": [
      [
        "פרויקט אוטובוס פתוח",
        "https://github.com/hasadna/open-bus"
      ],
      [
        "התקדמות קליטת הקבצים",
        "data/early-progress.json"
      ],
      [
        "רשימת קובצי הארכיון",
        "https://github.com/Transit-Freak/kav-bochan/blob/main/line-history/data/early-sources.json"
      ]
    ]
  },
  {
    "t": "ארכיון TransitFeeds / OpenMobilityData",
    "d": "16.03.2017 – 14.01.2022",
    "b": "צילומי GTFS מארכיון OpenMobilityData (לשעבר TransitFeeds), 2017 עד 2022.",
    "links": [
      [
        "תהליך ההורדה ומיקום הארכיון",
        "https://github.com/Transit-Freak/kav-bochan/blob/main/tools/backfill_tf.py"
      ]
    ]
  },
  {
    "t": "רישוי מערך האוטובוסים — משרד התחבורה",
    "d": "מ-01.2022 והלאה",
    "b": "סוג וגודל הרכב שנקבע לכל קו בכל יום, ממאגר ב-data.gov.il.",
    "links": [
      [
        "מאגרי המידע הממשלתיים",
        "https://data.gov.il/"
      ],
      [
        "תהליך קליטת הרישוי",
        "https://github.com/Transit-Freak/kav-bochan/blob/main/tools/linehistory_rishui.py"
      ]
    ]
  },
  {
    "t": "ארכיון אופן באס — הסדנא לידע ציבורי",
    "d": "16.01.2022 – 24.07.2026",
    "b": "צילומים יומיים של הפיד הארצי, כולל שינויים שתוכננו ולא נכנסו לתוקף.",
    "links": [
      [
        "פרויקט אוטובוס פתוח",
        "https://github.com/hasadna/open-bus"
      ],
      [
        "תהליך בדיקת הארכיון",
        "https://github.com/Transit-Freak/kav-bochan/blob/main/tools/audit_archive_daily.py"
      ]
    ]
  },
  {
    "t": "הסריקה היומית שלנו",
    "d": "מ-25.07.2026 והלאה",
    "b": "הורדה יומית של הפיד הארצי והשוואה ליום הקודם. זה המקור החי.",
    "links": [
      [
        "תיעוד משרד התחבורה",
        "https://www.gov.il/BlobFolder/generalpage/gtfs_general_transit_feed_specifications/he/GTFS%20-%20Developer%20Information.pdf"
      ]
    ]
  },
  {
    "t": "קובץ הרישוי היומי Gtfs_10_days",
    "d": "מ-08.2026 והלאה",
    "b": "קובץ הרישוי היומי, היחיד שמראה כמה אוטובוסים יוצאים יחד באותה נסיעה. הארכיונים לא שמרו אותו.",
    "links": [
      [
        "תהליך קליטת הנתונים",
        "https://github.com/Transit-Freak/kav-bochan/blob/main/tools/linehistory.py"
      ]
    ]
  }
];

const TT_LABEL = { rail: "רכבת", taxi: "מונית שירות", lightrail: "רכבת קלה",
                   cable: "רכבל/כרמלית", demand: "שירות לפי דרישה" };

// רכבת (שלמה 03.11): כמעט כל רכבת היא חלופה משלה — ברשימה רק החלופה הראשית של כל מק"ט וכיוון:
// פעילה לפני שבוטלה, חלופה #, ואחר כך זו עם הכי הרבה גרסאות. שאר הרכבות — בלו"ז שבעמוד הקו
function railMainRank(l) { return [lineGoneAt(l) ? 1 : 0, String(l.rd).split("-")[2] === "#" ? 0 : 1, -(l.v || 0)]; }
function railBetter(l, b) { const x = railMainRank(l), y = railMainRank(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i]; return false; }
function collapseRailRows(ls) {
  const best = new Map(), n = new Map();
  for (const l of ls) {
    if (l.tt !== "rail" || !/^\d+-[^-]+-/.test(l.rd)) continue;
    const k = String(l.rd).split("-").slice(0, 2).join("-");
    n.set(k, (n.get(k) || 0) + 1);
    if (!best.has(k) || railBetter(l, best.get(k))) best.set(k, l);
  }
  const out = [];
  for (const l of ls) {
    if (l.tt !== "rail" || !/^\d+-[^-]+-/.test(l.rd)) { out.push(l); continue; }
    const k = String(l.rd).split("-").slice(0, 2).join("-");
    if (best.get(k) === l) out.push(n.get(k) > 1 ? { ...l, nalt: n.get(k) } : l);
  }
  return out;
}
function ModesTab({ idx, openLine, spec }) {
  const citySearch = useRouteCities();
  const [daily, setDaily] = useState(() => !!(spec.k === "rail" && railHash()));
  const [sel, setSel] = useState(() => new Set());
  const [q, setQ] = usePersistedQ("lh-q-" + spec.k);
  const dq = useDeferredValue(q);
  const [lim, setLim] = useState(200);
  useEffect(() => { setLim(200); setSel(new Set()); }, [spec.k]);
  useEffect(() => setLim(200), [q, sel]);

  const mine = useMemo(() => idx.lines.filter((l) => spec.tts.includes(l.tt)), [idx, spec]);
  const counts = useMemo(() => {
    const c = {};
    spec.groups.forEach((m) => { c[m.k] = mine.filter((l) => m.tts.includes(l.tt)).length; });
    return c;
  }, [mine, spec]);
  const toggle = (k) => setSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  // ב-useMemo — שלא ירוץ מחדש על כל רינדור שאינו קשור לחיפוש (סעיף 14)
  const { list, total } = useMemo(() => {
    const needle = dq.trim();
    const allowed = sel.size ? new Set(spec.groups.filter((m) => sel.has(m.k)).flatMap((m) => m.tts)) : null;
    let ls = mine.filter((l) => !allowed || allowed.has(l.tt));
    if (needle) {
      ls = ls.filter(l => matchesRouteSearch(l, needle, citySearch.data, null, true));
    }
    const lnum = (l) => parseInt(l.line) || 1e9;
    ls = ls.slice().sort((a, b) => routeSearchRank(a, needle) - routeSearchRank(b, needle) || lnum(a) - lnum(b) || (a.line || "").localeCompare(b.line || "") || a.rd.localeCompare(b.rd));
    ls = collapseRailRows(collapse2012Rows(ls));
    return { total: ls.length, list: ls.slice(0, lim) };
  }, [mine, spec, sel, dq, lim, citySearch.data]);

  return (
    <div className="card">
      <button className="kathead" aria-expanded={daily} onClick={()=>setDaily(!daily)}>📅 שינויים לפי יום — מה השתנה בכל תאריך, בכל הקווים</button>
      {daily ? <DayFeed key={spec.k} idx={idx} openLine={openLine} mode={spec.k} embedded /> : <>
      {spec.groups.length > 1 && (
        <div className="kfilter">
          <button className={"kchip" + (sel.size ? "" : " on")}
            style={sel.size ? {} : { borderColor: "#7c3aed", color: "#5b21b6" }}
            onClick={() => setSel(new Set())}>הכל<b>{mine.length.toLocaleString()}</b></button>
          {spec.groups.map((m) => (
            <button key={m.k} className={"kchip" + (sel.size && !sel.has(m.k) ? " off" : "")}
              style={sel.has(m.k) ? { borderColor: "#7c3aed", color: "#5b21b6" } : {}}
              onClick={() => toggle(m.k)}>
              {m.icon} {m.label}<b>{(counts[m.k] || 0).toLocaleString()}</b>
            </button>
          ))}
        </div>
      )}
      <input className="search" type="search" dir="rtl"
        placeholder="חיפוש: מספר קו, מק״ט, עיר בדרך, יעד או מפעיל…"
        value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="llist">
        {list.map((l) => (
          <a key={l.rd} className="lrow" href={lineHref(l.rd)}
            onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); openLine(l.rd); }}>
            <span className="badge sm">{l.line || TT_ICON[l.tt] || "—"}</span>
            {l.tt === "rail" && <WhyMark rd={l.rd} />}
            {l.lk === "removed" && (
              <span className="k" style={{ background: isRemovedYear(l) ? "#7f1d1d" : "#dc2626" }}>
                {isRemovedYear(l) ? "בוטל — מעל שנה" : "בוטל"}
              </span>
            )}
            <span className="ldest">{taxiName(l) || destShow(l.dest)}</span>
            <span className="lmeta">{l.op}{mkTag(l.rd)} · {l.nalt ? l.nalt + " רכבות שונות — בלו״ז שבעמוד הקו" : l.v > 1 ? (l.v - 1) + " שינויים" : "ללא שינויים עדיין"}</span>
          </a>
        ))}
        {list.length === 0 && <div className="empty">לא נמצא קו תואם.</div>}
        {total > list.length && (
          <button className="morebtn" onClick={() => setLim(lim + 300)}>
            ⌄ הצג עוד — מוצגים {list.length.toLocaleString()} מתוך {total.toLocaleString()}
          </button>
        )}
      </div>
      </>}
    </div>
  );
}

/* הודעת הבדיקה-מחדש (בקשת שלמה): התגלתה תקלה בחלק מהמידע ההיסטורי —
   שרטוטים ומק"טים חסרים ושינויים בלי תאריך מדויק — וכל הארכיון נבדק
   מחדש מול שני המקורות. הטווחים חיים בקובץ סטטוס נפרד לכל מנוע סריקה
   (recheck-ob / recheck-tf) — קובץ משותף גרם לקונפליקטים בין המנועים —
   ו-recheck.json הישן נשאר כבסיס. המיזוג כאן, בדפדפן. */
function RecheckNotice() {
  const [rc, setRc] = useState(null);
  useEffect(() => {
    const grab = (u) => dfetch(u).then((r) => r.json()).catch(() => ({}));
    Promise.all([grab("data/recheck.json"), grab("data/recheck-ob.json"), grab("data/recheck-tf.json")])
      .then(([a, b, c]) => setRc({ ...a, ...b, ...c }))
      .catch(() => {});
  }, []);
  if (!rc || !rc.ob_young) return null;
  const f = (d) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : "");
  const obDone = rc.ob_pass >= 2 || rc.ob_young <= "2022-01-16";
  const tfDone = rc.tf_young && rc.tf_young <= "2017-03-20";
  if (obDone && tfDone && rc.ob_pass >= 2) return null;   // הבדיקה הסתיימה — ההודעה יורדת
  return (
    <div style={{ background: "#fffbeb", border: "1px solid #f3d9a4", borderRadius: 12,
      padding: "10px 14px", margin: "10px 0 2px", fontSize: 14, lineHeight: 1.55, color: "#57534e" }}>
      <b style={{ color: "#92400e" }}>🛠️ הודעה: התגלתה תקלה בחלק מהמידע ההיסטורי, והארכיון נבדק ומתעדכן מחדש מול שני המקורות.</b>
      <div>
        ✅ <b>טווח הנתונים המעודכן והמאומת: {f(rc.ob_young)} ← היום</b>{rc.ob_pass >= 2 ? " (מעבר אימות שני)" : ""}.
      </div>
      <div>
        🔄 נתונים מלפני {f(rc.ob_young)} (עד מרץ 2017) עדיין בבדיקה מחדש ועשויים להתעדכן בימים הקרובים.
      </div>
    </div>
  );
}

// Recovered sources use the same line pages and maps as the rest of הקו בזמן.
// ‎#t=rail@2013-12-18@33‎ — קישור ישיר ליום בארכיון הרכבת ולנסיעה בו
// קישור שנחתך באמצע קידוד (%D7%9 בלי ההמשך) — decodeURIComponent זורק URIError והדף כולו נפל
function safeHash(){const h=location.hash||"";try{return decodeURIComponent(h);}catch(e){return h;}}
function railHash(){const m=/^#t=rail@(\d{4}-\d{2}-\d{2})(?:@(\w+))?/.exec(safeHash());return m?{day:m[1],no:m[2]||null}:null;}
// קובץ יומי בארכיון הרכבת מסודר לפי שעות היום: בתחילתו סוף רכבות הלילה של אתמול (אחרי חצות),
// וההמשך אחרי חצות של רכבות הערב נמצא בקובץ של מחר. כאן מרכיבים "יום שירות":
// מוציאים את זנב הלילה של אתמול (שורות לפני 04:00 שנגמרות בתחנה אחרונה) ומצרפים את הזנב ממחר.
function railServiceDay(rows,next){
  const early=r=>r[3]!=="0"&&(parseInt(r[5]!=="0"?r[5]:r[3])||0)<400;
  const tails=(rs)=>{const by={};rs.forEach((r,i)=>{(by[r[0]]=by[r[0]]||[]).push(i);});const out=new Set();
    for(const ids of Object.values(by)){const t=[];for(const i of ids){if(rs[i][3]==="0")continue;if(early(rs[i]))t.push(i);}
      // זנב = רצף שורות מוקדמות שנגמר בתחנה אחרונה (יציאה 0) ואחריו שורות ערב של אותה רכבת
      if(t.length&&rs[t[t.length-1]][5]==="0"&&ids.some(i=>!early(rs[i])&&rs[i][3]!=="0"))t.forEach(i=>out.add(i));}
    return out;};
  const drop=tails(rows),own=rows.filter((r,i)=>!drop.has(i));
  const take=tails(next),ends={};own.forEach(r=>{ends[r[0]]=r[5]==="0"&&r[6]==="0";});
  const add=next.filter((r,i)=>take.has(i)&&ends[r[0]]===false);
  // השורות של אותה רכבת נשארות ברצף: הזנב נכנס מיד אחרי השורה האחרונה שלה
  const out=[];const byNo={};add.forEach(r=>{(byNo[r[0]]=byNo[r[0]]||[]).push(r);});
  const last={};own.forEach((r,i)=>{last[r[0]]=i;});
  own.forEach((r,i)=>{out.push(r);if(last[r[0]]===i&&byNo[r[0]])out.push(...byNo[r[0]]);});
  return out;
}
async function earlyGrab(url) { const r = await dfetch(url); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }
async function earlyGzip(url) {
  const r = await archFetch(url);
  if (!r.ok) throw new Error("הקובץ לא נטען (" + r.status + ")");
  if (!window.DecompressionStream) throw new Error("לצפייה בקובץ הדחוס נדרש דפדפן מעודכן.");
  return new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).json();
}
function EarlyMap({ stops, shp }) {
  const el = useRef(null);
  useEffect(() => {
    if (!el.current || !window.L || !stops.length) return;
    const map = L.map(el.current, { scrollWheelZoom: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
    const points = stops.map(s => [s[2], s[3]]);
    // Lines between stops are deliberately dashed when no historical shape exists.
    let route = points;
    if (shp) { try { route = decodeShape(shp); } catch(e) { route = points; } }
    L.polyline(route, { color: "#6d28d9", weight: 4, dashArray: shp ? null : "5 8" }).addTo(map);
    stops.forEach(s => {
      const label = document.createElement("span"); label.textContent = s[1] ? s[0] + " · " + s[1] : s[0];
      L.circleMarker([s[2],s[3]], { radius: 4, color: "#4338ca", fillOpacity: 1 }).addTo(map).bindPopup(label);
    });
    map.fitBounds(L.latLngBounds(points), { padding: [20,20], maxZoom: 15 });
    return () => map.remove();
  }, [stops, shp]);
  return <div ref={el} style={{ height: 330, borderRadius: 14, margin: "12px 0" }} aria-label="מפת התחנות ההיסטוריות" />;
}

// Historical snapshots share the ordinary transport categories and line pages.
function inHistoryMode(line, mode) {
  if (mode === "lines") return !line.tt || line.tt === "bus" || line.tt === "demand";
  return (TABS.find(t => t.k === mode)?.tts || []).includes(line.tt);
}
// Only published snapshots with data in this category are selectable.
function hasHistoricalData(record, mode) {
  if (!record) return false;
  if (mode === "stops") return record.stops > 0;
  const types = mode === "rail" ? ["0","2","5"] : mode === "taxi" ? ["8"] : null;
  return Object.entries(record.modes || {}).some(([type, count]) =>
    Number(count) > 0 && (types ? types.includes(type) : !["0","2","5","8"].includes(type)));
}
// שורת המקור בשינויים לפי חודש: לכל מקור צבע ותיאור משלו, כדי שההבדל ביניהם ייראה מיד (שלמה 21.11)
const SRC_NOTES = {
  gtfs: ["משרד התחבורה", "קובץ ה־GTFS היומי. התאריך מדויק ליום."],
  gtfs2012: ["משרד התחבורה", "קובצי GTFS מיולי 2012, שנשמרו דרך עמותת מרחב ו־Internet Archive."],
  foi: ["משרד התחבורה (חופש מידע)", "קובץ \"מסלול לפי שנים\" שהתקבל בבקשת חופש מידע. התאריכים משוערים, ואין בו שרטוט של המסלול."],
  web: ["צילום ממקור נוסף · אתרי מידע לנוסעים", "צילומים שנשמרו ב־Internet Archive. כיסוי חלקי; צילום אינו הודעה על שינוי."],
  mag: ["צילום ממקור נוסף · אתר מגיעים", "צילום של רשת האוטובוסים מ־2012, כפי שהופיעה באתר."],
  news: ["הודעות החברות · דן ואגד", "הודעות דן ואגד שנשמרו ב-Internet Archive. התאריך הוא יום הפרסום; הודעות על שינויים זמניים לא מוצגות."],
};
function SrcNote({ k, n, u = "שינויים" }) {
  const [t, d] = SRC_NOTES[k];
  return <p className={"srcnote src-" + k}><b>מקור: {t}</b>{n ? <span className="srcn">{n.toLocaleString()} {u}</span> : null}<br />{d}</p>;
}
// הודעות החברות מהארכיון — קובץ אחד קטן, נטען פעם אחת (רק בטאב הקווים)
let NEWS_P = null;
function useCompanyNews(mode) {
  const [n, setN] = useState(null);
  useEffect(() => {
    if (mode !== "lines") return;
    const one = (f) => dfetch("data/" + f).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    if (!NEWS_P) NEWS_P = Promise.all([one("news-dan.json"), one("news-egged.json")]).then(([a, b]) => a.concat(b).sort((x, y) => x.d < y.d ? -1 : x.d > y.d ? 1 : 0));
    let ok = true; NEWS_P.then((d) => { if (ok) setN(d); });
    return () => { ok = false; };
  }, [mode]);
  return mode === "lines" ? n : [];
}
const dmy = (d) => d.split("-").reverse().join(".");
function NewsFeed({ items, needle }) {
  const nd = needle.trim();
  const [opF, setOpF] = useState("");
  const ops = ["דן", "אגד"].filter((o) => items.some((x) => x.op === o));
  const list = items.filter((x) => !opF || x.op === opF).filter((x) => !nd || (x.l || []).includes(nd) || (x.t + " " + (x.b || "")).includes(nd)).slice().reverse();
  const chips = ops.length > 1 && <div className="months">{["", ...ops].map((o) => <button key={o} className={"mchip" + (opF === o ? " on" : "")} aria-pressed={opF === o} onClick={() => setOpF(o)}>{o || "כל החברות"}</button>)}</div>;
  if (!list.length) return <div>{chips}<div className="empty">אין הודעות תואמות בשנה הזו.</div></div>;
  const byM = [];
  for (const x of list) { const m = x.d.slice(0, 7); if (!byM.length || byM[byM.length - 1][0] !== m) byM.push([m, []]); byM[byM.length - 1][1].push(x); }
  return <div>{chips}{byM.map(([m, xs]) => <div key={m}>
    <div className="dayhead">{dmy(m)} · {xs.length} {xs.length === 1 ? "הודעה" : "הודעות"}</div>
    {xs.map((x, i) => <div key={i} className="newsrow">
      <div className="newshead">{(x.l || []).slice(0, 6).map((l) => <span key={l} className="badge sm">{l}</span>)}
        <b>{x.t}</b></div>
      <div className="newsmeta">{x.op} · פורסם {dmy(x.d)}{x.e && x.e !== x.d ? <> · <b>בתוקף מ־{dmy(x.e)}</b></> : null}
        {" · "}<a href={"https://web.archive.org/web/" + x.ts + "/" + x.u} target="_blank" rel="noopener">ההודעה בארכיון ↗</a></div>
      {x.b && <div className="newsbody">{x.b}{x.b.length >= 420 ? "…" : ""}</div>}
    </div>)}
  </div>)}</div>;
}
function useHistoricalMonths(mode) {
  const revision=useWebsiteRevision();
  const [available, setAvailable] = useState([]);
  useEffect(() => {
    let live = true;
    Promise.all([earlyGrab("data/early-progress.json"),
      mode === "rail" ? earlyGrab("data/early-rail/index.json").catch(() => ({days:[]})) : Promise.resolve({days:[]})
    ]).then(([progress,rail]) => {
      const dates = Object.values(progress.done || {}).filter(r => hasHistoricalData(r,mode)).map(r => r.date);
      if (live) setAvailable([...new Set([...dates,...(rail.days||[])].map(d=>d.slice(0,7)))].sort());
    }).catch(()=>{});
    return () => { live=false; };
  },[mode,revision]);
  return available;
}
function HistoricalPeriod({ idx, openLine, mode, year, month = "", embedded = false }) {
  const revision=useWebsiteRevision();
  const [data, setData] = useState(null), [err, setErr] = useState("");
  const [q,setQ] = usePersistedQ("lh-history-q-"+mode);
  const [lim,setLim] = useState(7), [retry,setRetry] = useState(0);
  useEffect(()=>{
    let live=true;setData(null);setErr("");
    Promise.all([earlyGrab("data/early-sources.json"),earlyGrab("data/early-progress.json"),
      mode==="rail"?earlyGrab("data/early-rail/index.json"):Promise.resolve({days:[],sources:[]})])
      .then(([catalog,progress,rail])=>{if(live)setData({catalog,progress,rail});})
      .catch(()=>{if(live)setErr("לא הצלחנו לטעון את הנתונים.");});
    return()=>{live=false;};
  },[mode,retry,revision]);
  useEffect(()=>setLim(7),[mode,month,year]);
  if(err)return <div role="alert">{err} <button onClick={()=>setRetry(retry+1)}>ניסיון נוסף</button></div>;
  if(!data)return <div role="status">טוען את הנתונים…</div>;
  const {catalog,progress,rail}=data;
  const entries=[
    ...catalog.snapshots.filter(s=>s.date.startsWith(month||year)&&hasHistoricalData(progress.done?.[s.id],mode))
      .map(s=>({key:s.id,date:s.date,snapshot:s})),
    ...(rail.days||[]).filter(d=>d.startsWith(month||year)).map(d=>({key:"rail-"+d,date:d,day:d}))
  ].filter(e=>{const rh=mode==="rail"&&railHash();return !rh||!rh.day.startsWith(month||year)||e.date===rh.day;}).sort((a,b)=>b.date.localeCompare(a.date)||a.key.localeCompare(b.key));
  const label=mode==="stops"?"תחנות":mode==="lines"?"קווי אוטובוס":TABS.find(t=>t.k===mode)?.label;
  return <div className={embedded?"":"card"}>
    <input className="search" aria-label={"חיפוש "+label+" בשנת "+year} value={q} onChange={e=>setQ(e.target.value)} placeholder={"חיפוש "+label+": מספר, שם או עיר…"} />
    <p className="pdesc">הנתונים שנשמרו, מסודרים לפי ימים. פער בתיעוד אינו מעיד שהשירות לא פעל.</p>
    {entries.some(e=>e.day)&&<p className="pdesc">רישומי מעבר של רכבת ישראל, מארכיון רכבת פתוחה.</p>}
    {entries.slice(0,lim).map(e=><HistoricalDay key={mode+"-"+e.key} idx={idx} openLine={openLine} mode={mode} catalog={catalog} progress={progress} snapshot={e.snapshot} day={e.day} q={q} />)}
    {!entries.length&&<p>אין נתונים זמינים לחודש הזה.</p>}
    {entries.length>lim&&<button className="morebtn" onClick={()=>setLim(lim+7)}>הצגת ימים נוספים ({entries.length-lim})</button>}
    <details><summary>מקורות וכיסוי הנתונים</summary>
      {(rail.sources||[]).filter(s=>String(s.year)===year).map(s=><p key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">קובץ רכבת {s.year} ↗</a></p>)}
      <p>נקלטו {Object.keys(progress.done||{}).length.toLocaleString()} מתוך {catalog.snapshots.length.toLocaleString()} קבוצות קבצים.</p>
      {catalog.gaps.map(g=><p key={g}>{g}</p>)}
    </details>
  </div>;
}

function HistoricalDay({ idx, openLine, mode, catalog, progress, snapshot, day, q }) {
  const citySearch = useRouteCities();
  const source = snapshot?.id || "";
  const [routes, setRoutes] = useState(null), [stops, setStops] = useState(null);
  const [err, setErr] = useState(""), [lim, setLim] = useState(60), [point, setPoint] = useState(null);
  const [railRows, setRailRows] = useState(null);
  const railJump = useRef(0);
  const [openTrip, setOpenTrip] = useState(null), [railSt, setRailSt] = useState(null);
  useEffect(()=>{if(!day)return;let live=true;earlyGrab("data/early-rail/stations.json").then(d=>{if(live)setRailSt(d);}).catch(()=>{if(live)setRailSt({});});return()=>{live=false;};},[day]);
  useEffect(()=>{setLim(60);setPoint(null);},[q,source,day]);
  useEffect(()=>{
    let live=true;setRoutes(null);setStops(null);setErr("");
    if(!source||!progress?.done?.[source])return;
    const task=mode==="stops" ? earlyGzip("data/early-stops/"+source+".json.gz?v="+BUILD) : earlyGrab("data/early-routes/"+source+".json");
    task.then(d=>{if(live){if(mode==="stops")setStops(d.stops);else setRoutes(new Set(d.routes));}}).catch(e=>{if(live)setErr(e.message);});
    return()=>{live=false;};
  },[source,progress,mode]);
  useEffect(()=>{let live=true;setRailRows(null);if(!day)return;
    // גם הקובץ של היום הבא: רכבת לילה שחצתה את חצות ממשיכה שם (שלמה 26.09)
    const nx=new Date(Date.parse(day)+86400000).toISOString().slice(0,10);
    Promise.all([earlyGzip("data/early-rail/"+day+".json.gz?v="+BUILD),earlyGzip("data/early-rail/"+nx+".json.gz?v="+BUILD).catch(()=>({rows:[]}))])
      .then(([r,n])=>{if(live)setRailRows(railServiceDay(r.rows,n.rows));}).catch(e=>{if(live)setErr(e.message);});return()=>{live=false;};
  },[day]);
  const selected=snapshot;
  const tokens=sQ(q).split(/\s+/).filter(t=>t&&t!=="קו");
  const match=s=>tokens.every(t=>sQ(s).includes(t));
  const lines=collapse2012Rows(routes&&idx ? idx.lines.filter(l=>routes.has(l.rd)&&inHistoryMode(l,mode)&&matchesRouteSearch(l,q,citySearch.data,snapshot.date))
    .sort((a,b)=>routeSearchRank(a,q)-routeSearchRank(b,q)||String(a.line||"").localeCompare(String(b.line||""),"he",{numeric:true})||a.rd.localeCompare(b.rd)) : []);
  const ss=(stops||[]).filter(s=>match([s.c,s.n,s.desc].join(" ")));
  const rr=useMemo(()=>{const rows=railRows||[];const by=new Map();rows.forEach(r=>{if(!by.has(r[0]))by.set(r[0],[]);by.get(r[0]).push(r);});
    // כל רכבת ברצף, ובתוכה לפי סדר הקובץ; חיפוש מסנן רכבות שלמות
    return [...by.values()].filter(g=>!tokens.length||match(g.map(r=>r.join(" ")).join(" "))).flat();},[railRows,q]);
  const label=mode==="stops"?"תחנות":mode==="lines"?"קווי אוטובוס":TABS.find(t=>t.k===mode)?.label;
  return <section className="historical-day" data-date={day || snapshot.date}>
    {!day && <h3 className="dayhead">{fmtD(snapshot.date)}</h3>}
    <CitySearchStatus state={citySearch} />
    {err&&<p role="alert">{err}</p>}
    {snapshot && <>
      <p>מקור: {catalog.credits[selected?.kind]}</p>
      {selected?.validThrough&&<p>תוקף לוח השירות: {fmtD(selected.date)}–{fmtD(selected.validThrough)}.</p>}
      {!progress?.done?.[source] ? <p role="status">הקובץ לתאריך הזה טרם נקלט. הנתונים יוצגו כאן לאחר עיבודו.</p> : mode==="stops" ? <>
        {stops===null ? <p role="status">טוען תחנות…</p> : <><p>{ss.length.toLocaleString()} תחנות</p>{ss.slice(0,lim).map(s=><button className="early-result" key={s.id} onClick={()=>setPoint(s)}>{s.c} · {s.n}<small>{s.desc}</small></button>)}</>}
        {point&&<div><h4>{point.c} · {point.n}</h4><EarlyMap stops={[[point.c,point.n,point.la,point.lo]]} shp="" /></div>}
      </> : <>
        {routes===null||!idx ? <p role="status">טוען קווים…</p> : <><p>{lines.length.toLocaleString()} קווים</p><div className="llist">{lines.slice(0,lim).map(l=><a className="lrow" key={l.rd} href={lineHref(l.rd)} onClick={e=>{if(!plainClick(e))return;e.preventDefault();openLine(l.rd);}}><span className="badge sm">{l.line||TT_ICON[l.tt]||"—"}</span><span className="ldest">{l.dest}</span><span className="lmeta">{l.op}{mkTag(l.rd)}</span></a>)}</div>{!lines.length&&<p>לא נמצאו {label} תואמים בצילום הזה.</p>}</>}
      </>}
      {(lines.length>lim||ss.length>lim)&&<button className="morebtn" onClick={()=>setLim(lim+100)}>הצגת עוד תוצאות</button>}
    </>}
    {day && <>
      {day&&!railRows&&<p role="status">טוען רישומי רכבות…</p>}{railRows&&(()=>{
        // כרטיס לכל נסיעה, באותו עיצוב של שאר השנים; בלחיצה — מפה ורשימת תחנות כמו במפה הרגילה, בלי זמנים (שלמה 26.09)
        const trips=[];let cur=null;
        // אותו מספר רכבת משמש לכמה נסיעות ביום. נסיעה נגמרת ביציאה 0 (תחנה אחרונה) ומתחילה בהגעה 0 (תחנת מוצא); גם קפיצה של יותר משלוש שעות היא נסיעה חדשה
        const mins=v=>{const n=parseInt(v)||0;return Math.floor(n/100)*60+n%100;};
        const tm=r=>mins(r[5]!=="0"?r[5]:r[3]);
        for(const r of rr){const p=cur&&cur.rows[cur.rows.length-1];if(!cur||cur.no!==r[0]||p[1]===r[1]||(p[5]==='0'&&p[6]==='0')||(r[3]==='0'&&r[4]==='0')||(d=>Math.min(d,1440-d))(Math.abs(tm(r)-tm(p))%1440)>180){cur={no:r[0],rows:[]};trips.push(cur);}cur.rows.push(r);}
        const rh=railHash();if(rh&&rh.day===day&&rh.no&&openTrip===null&&!railJump.current){railJump.current=1;const k=trips.findIndex(t=>t.no===rh.no);if(k>=0)setTimeout(()=>{setLim(Math.max(lim,k+1));setOpenTrip(k);setTimeout(()=>{const el=document.getElementById("rtrip-"+k);if(el)el.scrollIntoView({block:"start"});},300);},0);}
        return <><div className="dayhead">{fmtD(day)} · {trips.length.toLocaleString()} נסיעות</div>
          {trips.slice(0,lim).map((t,i)=>{const f=t.rows[0],l=t.rows[t.rows.length-1],on=openTrip===i;
            const st=t.rows.filter(r=>railSt&&railSt[r[2]]);
            return(
            <div key={i} id={"rtrip-"+i} className="lrow" style={{display:"block",cursor:"pointer"}} onClick={()=>setOpenTrip(on?null:i)}>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}>
              <span className="badge sm">🚆 {t.no}</span>
              <span className="k" style={{background:"#475569"}}>נסיעה</span>
              <span className="ldest">{f[1]} ← {l[1]}</span>
              <span className="lmeta">רכבת ישראל · {t.rows.length} נקודות {on?"▴":"▾"}</span></div>
              {on&&<div onClick={e=>e.stopPropagation()}>
                {/* שיתוף כמו בקווי אוטובוס: דף-שיתוף לכל מספר רכבת (s/t-*.html) עם באנר "רכבת N"; היום עובר בסולמית (שלמה 28.09) */}
                <button className="sharebtn" title="שיתוף הקישור לנסיעה הזו" onClick={e=>{
                  const url=location.origin+location.pathname.replace(/line-history\/?[^/]*$/,"")+"s/t-"+ssafe(String(t.no))+".html#"+day;
                  const b=e.currentTarget;
                  if(navigator.share){navigator.share({title:"הקו בזמן — רכבת "+t.no+" ("+fmtD(day)+")",url}).catch(()=>{});return;}
                  const tx=b.textContent;const done=()=>{b.textContent="✓ הועתק";setTimeout(()=>{b.textContent=tx;},1500);};
                  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(url).then(done,()=>prompt("העתקה ידנית:",url));
                }}>🔗 שיתוף</button>
                {st.length>1&&<EarlyMap stops={st.map(r=>[railSt[r[2]][0],"",railSt[r[2]][1],railSt[r[2]][2]])} shp="" />}
                <ol className="pdesc" style={{margin:"6px 0",paddingInlineStart:22}}>{t.rows.map((r,j)=>railSt&&railSt[r[2]]?<li key={j}>{railSt[r[2]][0]}</li>:<li key={j} style={{color:"#94a3b8"}}>{r[1].trim()} <small>(נקודה בלי מיקום במפה)</small></li>)}</ol>
              </div>}
            </div>);})}
          {trips.length>lim&&<button className="recmore" onClick={()=>setLim(lim+100)}>ועוד {(trips.length-lim).toLocaleString()} נסיעות ←</button>}</>;
      })()}
    </>}
    {snapshot && <details><summary>מקור הנתונים ליום הזה</summary>
      {snapshot.coverage&&<p>{snapshot.coverage}</p>}
      {(snapshot.urls||[]).map((u,i)=><p key={u}><a href={u} target="_blank" rel="noopener noreferrer">קובץ המקור {i+1} ↗</a></p>)}
    </details>}
  </section>;
}

function useWebsiteRevision() {
  const [revision,setRevision]=useState(0);
  useEffect(()=>{const update=()=>setRevision(n=>n+1);window.addEventListener("website-history-published",update);return()=>window.removeEventListener("website-history-published",update);},[]);
  return revision;
}
// מעקב אחרי פרסום חדש של צילומי אתרי המידע: כשהאיסוף מפרסם, הדף טוען מחדש את הנתונים.
// בלי תצוגה משלו — סיכום השנה מופיע בתוך "שינויים לפי יום", ליד בחירת השנה (שלמה 08.10).
function WebsiteImportStatus({onPublished}) {
  const stamp=useRef(null),callback=useRef(onPublished);callback.current=onPublished;
  useEffect(()=>{
    let active=true;
    const load=async()=>{
      if(document.hidden)return;
      try{
        const response=await fetch("data/website-archive-summary.json?v="+Date.now(),{cache:"no-store"});
        if(!response.ok)return;
        const next=await response.json();if(!active)return;
        if(stamp.current && stamp.current!==next.updatedAt)callback.current();
        stamp.current=next.updatedAt;
      }catch(e){}
    };
    load();const timer=setInterval(load,30000);document.addEventListener("visibilitychange",load);
    return()=>{active=false;clearInterval(timer);document.removeEventListener("visibilitychange",load);};
  },[]);
  return null;
}
// סיכום לשנה של אתרי המידע לנוסעים: כמה קווים, אילו חברות ואילו אזורים (website-years.json)
function useWebsiteYears() {
  const revision=useWebsiteRevision();
  const [years,setYears]=useState(null);
  useEffect(()=>{let on=true;fetch("data/website-years.json?v="+Date.now(),{cache:"no-store"}).then(r=>r.ok?r.json():null).then(d=>{if(on&&d)setYears(d.years||[]);}).catch(()=>{});return()=>{on=false;};},[revision]);
  return years;
}
const linesWord=n=>n===1?"קו אחד":n.toLocaleString()+" קווים";
function WebsiteYearSummary({year}) {
  const years=useWebsiteYears();
  const cur=(years||[]).find(y=>y.y===year);
  if(!cur)return null;
  const list=(arr)=>arr.map(([n,c])=>n+" ("+linesWord(c)+")").join(" · ");
  return <div className="wysum" role="region" aria-label={"אתרי המידע לנוסעים בשנת "+year}>
    <p><b>{year}</b>: צילומים של {linesWord(cur.lines)} מאתרי החברות, מ{cur.months.length===1?"חודש אחד":"־"+cur.months.length+" חודשים"}.</p>
    <p><b>חברות:</b> {list(cur.ops)}</p>
    {cur.towns.length>0&&<p><b>אזורים עיקריים:</b> {list(cur.towns)}</p>}
  </div>;
}
