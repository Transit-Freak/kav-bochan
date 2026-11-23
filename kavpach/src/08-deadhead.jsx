/* קו פח · 08-deadhead.jsx — נסיעות תפעוליות במסווה: הספירה והניקוד (computeDeadheadCounts, computeDeadhead).
   חלק מ-kavpach/src (הסדר ב-files.json). כל החלקים מחוברים לפי הסדר ומקומפלים יחד (tools/build_kavpach.mjs → KavPach.js),
   כך שכל השמות משותפים בין החלקים כמו בקובץ אחד. */

// ── נסיעות תפעוליות במסווה ─────────────────────────────────────────────
// חברה שלא רוצה לנסוע ריק בלי תשלום רושמת את הסעת הרכב למסוף כנסיעת
// שירות (רעיון שלמה, 18.09: קו 71 קריית מלאכי). הסימן: זוג נסיעות של אותו
// קו, בשני הכיוונים, צמודות בזמן, שבספירות המשרד עלו אליהן ~0 נוסעים.
// נסיעה בודדת עם 0 נוסעים לא מספיקה (קו לילה ריק הוא לא הסעה תפעולית).
const cityOnly2 = (x) => x ? (x.indexOf(' - ') > 0 ? x.slice(0, x.indexOf(' - ')).trim() : x.split('/')[0].trim()) : '';
const DEADHEAD_MAX_RIDERS = 1.5;      // עד כאן "כמעט ריק"
const DEADHEAD_SURE_RIDERS = 0.5;     // עד כאן "ריק"
const DEADHEAD_GAP_MIN = 100;         // כמה דקות בין היציאות של זוג
function computeDeadheadCounts(trips, lineStopsMap, dset) {
  const PC = (dset || DEADHEAD_DEFAULTS).c, PP = (dset || DEADHEAD_DEFAULTS).p;
  const ptsOf = (k, f) => (PC[k].on ? Math.max(0, Math.min(1, f)) * (Number(PC[k].max) || 0) : 0);
  const maxSum = maxSumOf(PC);
  const cityOnly = (x) => x ? (x.indexOf(' - ') > 0 ? x.slice(0, x.indexOf(' - ')).trim() : x.split('/')[0].trim()) : '';
  const groups = new Map();
  for (const t of trips) {
    if (t.timeMins == null || !t.direction) continue;
    const key = `${t.lineNum}_${[cityOnly(t.origin), cityOnly(t.dest)].sort().join('-')}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const daysOverlap = (a, b) => {
    const la = a.daysList || [], lb = b.daysList || [];
    if (!la.length || !lb.length) return true;
    return la.some(d => lb.includes(d));
  };
  // "קו עמוס באזור": נסיעה עמוסה (80% מקיבולת הרכב — ההגדרה של האתר) של קו
  // אחר, באותה עיר, שיוצאת עד 30 דק' מהנסיעה הריקה. הסעה ריקה ליד קו שנחנק
  // היא הבזבוז הבולט ביותר — אותו אוטובוס יכול היה לתגבר אותו (שלמה 18.09).
  const DEADHEAD_NEAR_MIN = 30;
  const crowdedByCity = new Map();
  for (const t of trips) {
    if (t.timeMins == null) continue;
    const cap80 = (t.capacity || 50) * 0.8;
    if (t.ridership < cap80 && t.peakLoad < cap80) continue;
    for (const c of new Set([cityOnly(t.origin), cityOnly(t.dest)])) {
      if (!c) continue;
      if (!crowdedByCity.has(c)) crowdedByCity.set(c, []);
      crowdedByCity.get(c).push(t);
    }
  }
  // "באזור" = אותה עיר, וכשיש מפת תחנות — גם לפחות תחנה משותפת (אותו
  // מסדרון). בלי זה בירושלים או בתל אביב כל נסיעה ריקה הייתה "ליד" קו עמוס.
  const stopsOf = (t) => (lineStopsMap && lineStopsMap.get(String(t.makat || '').replace(/^0+/, ''))) || null;
  const sharesStop = (t, x) => {
    const A = stopsOf(t), B = stopsOf(x);
    if (!A || !B) return true;
    for (const st of A) if (B.has(st)) return true;
    return false;
  };
  const crowdedNear = (t) => {
    let best = null;
    for (const c of new Set([cityOnly(t.origin), cityOnly(t.dest)])) {
      for (const x of (crowdedByCity.get(c) || [])) {
        if (String(x.lineNum) === String(t.lineNum)) continue;
        const d = Math.abs(x.timeMins - t.timeMins);
        if (d > DEADHEAD_NEAR_MIN) continue;
        if (!sharesStop(t, x)) continue;
        if (!best || Math.max(x.ridership, x.peakLoad) > Math.max(best.ridership, best.peakLoad)) best = x;
      }
    }
    return best;
  };
  const pairs = [];
  for (const [groupKey, list] of groups) {
    // קו שכל נסיעותיו 0 — כנראה אין לו ספירות בכלל, לא צי ריק
    if (!list.some(t => t.ridership > DEADHEAD_MAX_RIDERS)) continue;
    const near = list.filter(t => t.ridership <= DEADHEAD_MAX_RIDERS);
    if (near.length < 2) continue;
    const used = new Set();
    near.sort((a, b) => a.timeMins - b.timeMins);
    for (let i = 0; i < near.length; i++) {
      const a = near[i];
      if (used.has(a.id)) continue;
      let best = null;
      for (let j = i + 1; j < near.length; j++) {
        const b = near[j];
        if (used.has(b.id) || String(b.direction) === String(a.direction)) continue;
        const gap = b.timeMins - a.timeMins;
        if (gap > DEADHEAD_GAP_MIN) break;
        if (!daysOverlap(a, b)) continue;
        if (!best || gap < best.gap) best = { b, gap };
      }
      if (!best) continue;
      used.add(a.id); used.add(best.b.id);
      const b = best.b;
      const weekly = Math.min(a.tripCount || 1, b.tripCount || 1);
      const km = ((a.distance || 0) + (b.distance || 0)) * weekly;
      const sure = a.ridership <= DEADHEAD_SURE_RIDERS && b.ridership <= DEADHEAD_SURE_RIDERS;
      const hot = crowdedNear(a) || crowdedNear(b);
      // ניקוד 0–100 לכל זוג, באותה רוח של ציון אי-היעילות לקו:
      //   ריקות (עד 40)   — כמה נוסעים בכל זאת עלו בשני הכיוונים יחד
      //   צמידות (עד 20)  — כמה קרובות היציאות (הסעה למסוף = דקות ספורות)
      //   קו עמוס באזור (עד 30) — האוטובוס יכול היה לתגבר קו שנחנק
      //   היקף (עד 10)    — כמה פעמים בשבוע זה חוזר
      const riders = a.ridership + b.ridership;
      // כל רכיב = שבר 0–1 כפול הנקודות שנקבעו לו; הציון מנורמל ל-100 לפי
      // סכום הרכיבים הדלוקים — בדיוק כמו ציון אי-היעילות של קו
      const parts = {
        empty: ptsOf('obs', 1 - riders / (2 * DEADHEAD_MAX_RIDERS)),
        tight: ptsOf('tight', 1 - Math.max(0, best.gap - 15) / (DEADHEAD_GAP_MIN - 15)),
        hot: ptsOf('hot', hot ? 1 : 0),
        volume: ptsOf('empty', weekly / 6),
      };
      const rawScore = normScore(parts.empty + parts.tight + parts.hot + parts.volume, maxSum);
      Object.keys(parts).forEach(k => { parts[k] = Math.round(parts[k]); });
      // הגנות — נקודות שמופחתות
      const protections = [];
      // קו לילה = רק קו שהמשרד מגדיר כקו לילה (ייחודיות "לילה"), לא נסיעה מוקדמת של קו יום (שלמה 15.10)
      if (PP.night > 0 && (a.isNightLine || b.isNightLine)) protections.push({ name: 'קו לילה', value: PP.night });
      const wk = (a.daysList || []);
      if (PP.weekend > 0 && wk.length && wk.every(d => d === 6 || d === 7)) protections.push({ name: 'קו סופ"ש', value: PP.weekend });
      if (PP.rare > 0 && weekly <= 1) protections.push({ name: 'זוג בודד בשבוע', value: PP.rare });
      const deduction = protections.reduce((s2, x) => s2 + x.value, 0);
      const score = Math.max(0, rawScore - deduction);
      pairs.push({
        near: hot, score, rawScore, parts, protections,
        groupKey, lineNum: a.lineNum, makat: a.makat, origin: a.origin, dest: a.dest,
        cluster: a.cluster || a.clusterVal || '', district: a.district || '', lineType: a.lineType || '',
        a, b, gap: best.gap, weekly, km, sure,
        edge: a.timeMins < 6 * 60 || b.timeMins >= 21 * 60,   // קצה יום — מתאים להוצאה/הכנסה של רכב
      });
    }
  }
  pairs.sort((x, y) => (y.score - x.score) || (y.km - x.km));
  const byLine = new Map();
  for (const p of pairs) {
    const k = p.groupKey;
    if (!byLine.has(k)) byLine.set(k, { groupKey: k, lineNum: p.lineNum, makat: p.makat, origin: p.origin, dest: p.dest, cluster: p.cluster, district: p.district, lineType: p.lineType, pairs: [], weekly: 0, km: 0, sure: 0 });
    const L = byLine.get(k);
    L.pairs.push(p); L.weekly += p.weekly; L.km += p.km; if (p.sure) L.sure += 1; if (p.near) L.near = (L.near || 0) + 1;
  }
  // ציון הקו = ממוצע ציוני הזוגות שלו, משוקלל לפי כמה פעמים בשבוע כל זוג חוזר
  for (const L of byLine.values()) {
    const w = L.pairs.reduce((s2, p) => s2 + p.weekly, 0) || 1;
    L.score = Math.round(L.pairs.reduce((s2, p) => s2 + p.score * p.weekly, 0) / w);
    L.maxScore = Math.max(...L.pairs.map(p => p.score));
    L.statusTier = getStatusTier(L.score);
    L.status = L.statusTier.label;
  }
  const minScore = Number((dset || DEADHEAD_DEFAULTS).minScore) || 0;
  const lines = [...byLine.values()].filter(L => L.score >= minScore).sort((x, y) => (y.score - x.score) || (y.km - x.km));
  return {
    pairs, lines,
    totalPairs: pairs.length,
    weekly: pairs.reduce((s, p) => s + p.weekly, 0),
    km: Math.round(pairs.reduce((s, p) => s + p.km, 0)),
    sure: pairs.filter(p => p.sure).length,
    near: pairs.filter(p => p.near).length,
  };
}

// נסיעות תפעוליות במסווה — ההגדרה של שלמה (18.09): לפי מספר הרכב. הרכב מגיע
// לקצה נסיעה, ותוך 15 דק' יוצא לנסיעה שמסתיימת ליד המקום שבו התחיל — לא
// חייב אותו קו (89 הלוך, 80 חזור). הזוגות נצפים בשידורי המיקום (מדד הדיוק)
// ונאספים ב-bus/data/deadhead.json (14 יום). כאן: הצלבה עם ספירות המשרד
// (האם נסיעת החזרה ריקה גם בספירות), קו עמוס באזור, וניקוד.
const hms = (sec) => sec == null ? '' : `${String(Math.floor(sec / 3600) % 24).padStart(2, '0')}:${String(Math.floor(sec / 60) % 60).padStart(2, '0')}`;
function computeDeadhead(trips, lineStopsMap, dset, obs) {
  if (!obs || !obs.lines || !Object.keys(obs.lines).length) return { mode: 'counts', ...computeDeadheadCounts(trips, lineStopsMap, dset) };
  const PC = (dset || DEADHEAD_DEFAULTS).c, PP = (dset || DEADHEAD_DEFAULTS).p;
  const ptsOf = (k, f) => (PC[k] && PC[k].on ? Math.max(0, Math.min(1, f)) * (Number(PC[k].max) || 0) : 0);
  const maxSum = maxSumOf(PC);
  const cityOnly = cityOnly2;
  const nDays = (obs.days || []).length || 14;
  const byMakat = new Map();
  for (const t of trips) {
    const k = String(t.makat || '').replace(/^0+/, '');
    if (!k) continue;
    if (!byMakat.has(k)) byMakat.set(k, []);
    byMakat.get(k).push(t);
  }
  // קווים עמוסים לפי עיר — ההגדרה של האתר (80% מקיבולת הרכב)
  const crowdedByCity = new Map();
  for (const t of trips) {
    if (t.timeMins == null) continue;
    const cap80 = (t.capacity || 50) * 0.8;
    if (t.ridership < cap80 && t.peakLoad < cap80) continue;
    for (const c of new Set([cityOnly(t.origin), cityOnly(t.dest)])) {
      if (!c) continue;
      if (!crowdedByCity.has(c)) crowdedByCity.set(c, []);
      crowdedByCity.get(c).push(t);
    }
  }
  const stopsOf = (mk) => (lineStopsMap && lineStopsMap.get(String(mk))) || null;
  const sharesStop = (mk, x) => {
    const A = stopsOf(mk), B = stopsOf(String(x.makat || '').replace(/^0+/, ''));
    if (!A || !B) return true;
    for (const st of A) if (B.has(st)) return true;
    return false;
  };
  // התאמת רכב לקו העמוס (שלמה 18.09): רכב בינעירוני לא מבצע קו עירוני ולהפך;
  // תקן הרכב של הקו העמוס הוא מינימום — מיניבוס לא מתגבר קו שדורש אוטובוס,
  // אבל אוטובוס כן מתגבר קו מיניבוס. (נגישות אינה בקובץ המשרד — לא נבדקת.)
  const SIZE_RANK = { 'מיניבוס': 1, 'מידיבוס': 2, 'אוטובוס': 3, 'מפרקי': 4 };
  const sizeRank = (bs) => { const k = String(bs || '').replace(/\s/g, ''); for (const [n, r] of Object.entries(SIZE_RANK)) if (k.includes(n.replace(/\s/g, ''))) return r; return 3; };
  const svcKind = (lt) => { const t = String(lt || ''); return t.includes('בינעירוני') ? 'inter' : t.includes('עירוני') ? 'urban' : 'other'; };
  const vehicleFits = (veh, line) => {
    const a = svcKind(veh.lineType), b = svcKind(line.lineType);
    if ((a === 'inter' && b === 'urban') || (a === 'urban' && b === 'inter')) return false;
    return sizeRank(veh.busSize) >= sizeRank(line.busSize);
  };
  // הקו העמוס חייב לצאת מהעיר שבה הרכב נמצא (קצה הנסיעה שסיים = מוצא החזרה),
  // ובחלון של עד 30 דק' אחרי שהגיע — רכב שנמצא בשוהם לא יתגבר קו שיוצא מבאר יעקב.
  const crowdedNear = (veh, mk, city, arrMins) => {
    if (!city) return null;
    let best = null;
    for (const x of (crowdedByCity.get(city) || [])) {
      if (String(x.lineNum) === String(veh.lineNum)) continue;
      if (cityOnly(x.origin) !== city) continue;
      if (x.timeMins < arrMins || x.timeMins - arrMins > 30) continue;
      if (!vehicleFits(veh, x)) continue;
      if (!sharesStop(mk, x)) continue;
      if (!best || Math.max(x.ridership, x.peakLoad) > Math.max(best.ridership, best.peakLoad)) best = x;
    }
    return best;
  };
  // ספירות המשרד לנסיעת החזרה: הנסיעה המתוכננת הקרובה ביותר (אותו קו וכיוון, עד 10 דק')
  // קו שכל נסיעותיו 0 בקובץ המשרד = אין לו ספירות (הקובץ מתעדכן רבעונית) —
  // לא "ריק". אז אין ראיה מהספירות, לא לטובה ולא לרעה (שלמה 18.09).
  const hasCounts = (mk) => (byMakat.get(String(mk)) || []).some(t => t.ridership > 0);
  const ridersOf = (mk, dir, sec) => {
    if (!hasCounts(mk)) return null;
    const mins = sec / 60;
    let best = null;
    for (const t of (byMakat.get(String(mk)) || [])) {
      if (t.timeMins == null || String(t.direction) !== String(dir)) continue;
      const d = Math.abs(t.timeMins - mins);
      if (d <= 10 && (!best || d < best.d)) best = { d, r: t.ridership };
    }
    return best ? best.r : null;
  };
  const lines = [];
  let unknown = 0, normal = 0, noCountsN = 0;
  for (const [mk, e] of Object.entries(obs.lines)) {
    const ts = byMakat.get(String(mk));
    if (!ts || !ts.length) { unknown++; continue; }
    const info = ts[0];
    const perWeek = e.n / nDays * 7;
    const ex = (e.ex || []).map(x => {
      const [day, veh, mkA, dirA, depA, endA, mkB, dirB, depB, gap, schA, schB] = x;
      const aInfo = (byMakat.get(String(mkA)) || [])[0];
      const bAll = byMakat.get(String(mkB)) || [];
      const bInfo = bAll.find(t => String(t.direction) === String(dirB)) || bAll[0];
      return { day, veh, mkA, dirA, depA, endA, mkB, dirB, depB, gap, schA, schB, aLine: aInfo ? aInfo.lineNum : mkA, bLine: bInfo ? bInfo.lineNum : mkB,
               bOrigin: bInfo ? bInfo.origin : '', bDest: bInfo ? bInfo.dest : '', bRiders: ridersOf(mkB, dirB, schB != null ? schB : depB) };
    });
    const withR = ex.filter(x => x.bRiders != null);
    const emptyFrac = withR.length ? withR.filter(x => x.bRiders <= DEADHEAD_MAX_RIDERS).length / withR.length : 0;
    const noCounts = !withR.length;   // אין ספירות לנסיעות החזרה — הרכיב "ריק בספירות" לא נספר, ולא נטען שהיא ריקה
    // הלוך-חזור צמוד של אותו רכב הוא גם שירות עירוני רגיל (הרכב עומד בקצה
    // ויוצא חזרה). מה שהופך אותו לנסיעה תפעולית הוא שהחזרה ריקה — לכן
    // ספירות המשרד הן תנאי כניסה: בלי ספירות לא נכנס, ועם נוסעים בחזרה זה שירות.
    if (noCounts) { noCountsN++; continue; }
    if (emptyFrac < 0.5) { normal++; continue; }
    // הקו העמוס נבדק לכל דוגמה בנפרד, לפי שעת החזרה שלה — ומוצג מתחתיה
    let hot = null;
    for (const x of ex) {
      // הרכב שסיים את קו A: התקן שלו הוא לפחות תקן קו A — לפיו נבדקת ההתאמה
      const aInfo = (byMakat.get(String(x.mkA)) || [])[0] || info;
      x.hot = crowdedNear(aInfo, mk, cityOnly(x.bOrigin), x.endA / 60);
      if (x.hot && (!hot || Math.max(x.hot.ridership, x.hot.peakLoad) / (x.hot.capacity || 50) > Math.max(hot.ridership, hot.peakLoad) / (hot.capacity || 50))) hot = x.hot;
    }
    // "צריך תגבור": העומס בקו העמוס ביחס לקיבולת הרכב — מעל 100% = מלוא הנקודות, 90% = חצי
    const hotLoad = hot ? Math.max(hot.ridership, hot.peakLoad) / (hot.capacity || 50) : 0;
    const parts = {
      obs: ptsOf('obs', perWeek / 7),
      tight: ptsOf('tight', 1 - Math.max(0, e.gap - 5) / 10),
      hot: ptsOf('hot', hot ? 1 : 0),
      crush: ptsOf('crush', hotLoad >= 1 ? 1 : hotLoad >= 0.9 ? 0.5 : 0),
      empty: ptsOf('empty', emptyFrac),
    };
    const rawScore = normScore(parts.obs + parts.tight + parts.hot + parts.crush + parts.empty, maxSum);
    Object.keys(parts).forEach(k => { parts[k] = Math.round(parts[k]); });
    const protections = [];
    // קו לילה = רק קו שהמשרד מגדיר כקו לילה, לא לפי שעת היציאה (שלמה 15.10)
    const isNightMk = (m) => !!((byMakat.get(String(m)) || [])[0] || {}).isNightLine;
    const nightShare = ex.length ? ex.filter(x => isNightMk(x.mkA) || isNightMk(x.mkB)).length / ex.length : 0;
    if (PP.night > 0 && nightShare >= 0.6) protections.push({ name: 'קו לילה', value: PP.night });
    const wkShare = ex.length ? ex.filter(x => { const d = new Date(x.day + 'T12:00:00').getDay(); return d === 5 || d === 6; }).length / ex.length : 0;
    if (PP.weekend > 0 && ex.length && wkShare >= 0.6) protections.push({ name: 'סופ"ש', value: PP.weekend });
    if (PP.rare > 0 && e.n <= 1) protections.push({ name: 'תצפית בודדת', value: PP.rare });
    const deduction = protections.reduce((s2, x) => s2 + x.value, 0);
    const score = Math.max(0, rawScore - deduction);
    const st = getStatusTier(score);
    lines.push({ groupKey: mk, makat: mk, lineNum: info.lineNum, origin: info.origin, dest: info.dest, cluster: info.cluster || info.clusterVal || '', district: info.district || '',
                 n: e.n, days: e.days, veh: e.veh, other: e.other || 0, gap: e.gap, end: e.end, perWeek, emptyFrac, noCounts, hot, hotLoad, ex,
                 score, rawScore, parts, protections, statusTier: st, status: st.label });
  }
  const minScore = Number((dset || DEADHEAD_DEFAULTS).minScore) || 0;
  lines.sort((x, y) => (y.score - x.score) || (y.n - x.n));
  return {
    mode: 'vehicle', nDays, updated: obs.updated, unknown, normal, noCountsN,
    lines: lines.filter(L => L.score >= minScore), allLines: lines,
    totalPairs: lines.reduce((s2, L) => s2 + L.n, 0),
    other: lines.reduce((s2, L) => s2 + L.other, 0),
    near: lines.filter(L => L.hot).length,
    emptyLines: lines.filter(L => L.emptyFrac >= 0.5).length,
  };
}
