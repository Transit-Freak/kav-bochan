/* kavpach-core.js — הלב החישובי של קו פח, JS טהור בלי React.
   משותף לאתר (נטען לפני KavPach.js) ולחישוב המוקדם ב-GitHub Actions
   (tools/precompute_kavpach.mjs → data-lines.json). שלמה 18.09: "לייזי לאודינג"
   וההצעה להריץ סקריפט שיכין חתיכות מוכנות — במקום שכל טלפון יחשב את הדירוג
   על 205 אלף נסיעות, השרת מחשב פעם אחת וכל דפדפן מקבל ~5,000 רשומות. */

// ── סיווג קווים ל-8 קטגוריות לפי משרד התחבורה ───────────────────────────
// הסיווג מבוסס קודם כל על השדה "קבוצת יעילות תפעולית" (opGroup) אם הוא
// זמין, ואחרת נגזר ממאפיינים: ייחודיות (תלמידים/לילה/מזין), אורך מסלול,
// סוג שירות, ותדירות יומית.
const CATEGORIES = [
  'אזורי',
  'בינעירוני ארוך',
  'בינעירוני קצר',
  'עירוני תדירות גבוהה',
  'עירוני תדירות נמוכה',
  'לילה',
  'קווים מזינים',
  'תלמידים',
];

// ממוצעים ארציים רשמיים — עלות תפעולית לנוסע (ש"ח)
const COST_BENCHMARK = {
  'אזורי': 31.8,
  'בינעירוני ארוך': 34.0,
  'בינעירוני קצר': 23.1,
  'לילה': 46.9,
  'עירוני תדירות גבוהה': 9.4,
  'עירוני תדירות נמוכה': 15.4,
  'קווים מזינים': 17.4,
  'תלמידים': 9.7,
};

// מיפוי שמות מקובץ "מצומצם" → לשמות בטבלת "עלות לנוסע" (הבדלי איות קלים)
const BENCHMARK_DISTRICT_ALIAS = {
  'גולן גליל ועמקים': 'גולן גליל עמקים',
  'מזרח ירושלים': 'מזרח י-ם',
};
const BENCHMARK_GROUP_ALIAS = {
  'קווים מזינים': 'מזינים',
};

// מחזיר בנצ'מרק עלות-לנוסע לפי קטגוריה+מחוז מטבלת "עלות לנוסע" הנטענת.
// נופל ל"כל הארץ" ואז לקבועים הארציים אם אין נתון מחוזי.
const lookupCostBenchmark = (table, category, district) => {
  const cat = BENCHMARK_GROUP_ALIAS[category] || category;
  if (table && table[cat]) {
    const row = table[cat];
    const dist = BENCHMARK_DISTRICT_ALIAS[district] || district;
    if (dist && row[dist] != null) return row[dist];
    if (row['כל הארץ'] != null) return row['כל הארץ'];
  }
  return COST_BENCHMARK[category] || 20;
};

// סף נוסעים לנסיעת שפל לכל קטגוריה
const LOW_RIDER_THRESHOLD = {
  'אזורי': 5,
  'לילה': 5,
  'בינעירוני קצר': 8,
  'קווים מזינים': 8,
  'בינעירוני ארוך': 10,
  'עירוני תדירות נמוכה': 10,
  'עירוני תדירות גבוהה': 15,
  'תלמידים': 15,
};

// מסווג קו לאחת מ-8 הקטגוריות. מקבל אובייקט עם השדות שצריך.
const classifyLine = ({ opGroup, uniqueness, lineType, distance, trips, isNight, isFeeding }) => {
  const og = (opGroup || '').trim();
  const u = (uniqueness || '').trim();

  // 1. הקטגוריות הברורות מ-uniqueness — ייחודיות גוברת
  if (u.includes('תלמיד')) return 'תלמידים';
  if (isNight || u.includes('לילה')) return 'לילה';
  if (isFeeding || u.includes('מזין')) return 'קווים מזינים';

  // 2. opGroup ישיר אם קיים בקטגוריות שלנו
  for (const c of CATEGORIES) {
    if (og === c) return c;
    // התאמה רכה — opGroup לעיתים מכיל את שם הקטגוריה כתת-מחרוזת
    if (og && og.includes(c)) return c;
  }

  // 3. נגזרים מ-lineType
  const lt = (lineType || '').trim();
  if (lt.includes('אזורי') || lt.includes('מועצה') || lt.includes('כפרי')) return 'אזורי';

  // 4. בינעירוני לפי אורך מסלול
  if (lt.includes('בינעירוני') || lt.includes('בין-עירוני') || lt.includes('בין עירוני')) {
    return (distance && distance > 45) ? 'בינעירוני ארוך' : 'בינעירוני קצר';
  }

  // 5. עירוני — תדירות גבוהה/נמוכה לפי נסיעות שבועיות (מקירוב ליום ג')
  //    100 נסיעות ביום ג' ≈ ~600 נסיעות שבועיות (יום-ג' הוא ~17% מהשבוע)
  if (trips && trips >= 600) return 'עירוני תדירות גבוהה';
  return 'עירוני תדירות נמוכה';
};

// תווית סטטוס לפי ציון (5 רמות)
const STATUS_TIERS = [
  { min: 80, label: 'חמור - דורש התערבות', color: 'text-rose-700', bg: 'bg-rose-100 border-rose-300', dot: 'bg-rose-600' },
  { min: 65, label: 'לא יעיל',              color: 'text-rose-600', bg: 'bg-rose-50 border-rose-200',  dot: 'bg-rose-500' },
  { min: 45, label: 'טעון בדיקה',           color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200', dot: 'bg-orange-500' },
  { min: 25, label: 'סטייה קלה',            color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
  { min: 0,  label: 'תקין',                color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
];
const getStatusTier = (score) => STATUS_TIERS.find(t => score >= t.min) || STATUS_TIERS[STATUS_TIERS.length - 1];

// סכום הנקודות האפשריות של הרכיבים הדלוקים — לנרמול הציון ל-100
const maxSumOf = (comps) => Object.values(comps).reduce((s, c) => s + (c.on ? (Number(c.max) || 0) : 0), 0);
const normScore = (total, maxSum) => (maxSum > 0 ? Math.min(100, Math.round(total * 100 / maxSum)) : 0);

const kpCityOnly = (s) => s ? (s.indexOf(' - ') > 0 ? s.slice(0, s.indexOf(' - ')).trim() : s.split('/')[0].trim()) : '';

// ── שלב 1: צבירה לכל קו (כבד) ──────────────────────────────────────────────
// trips → רשומה אחת לכל קבוצה (מספר קו + זוג ערים) עם כל מה שהניקוד צריך,
// בלי תלות בהגדרות המשתמש. זה מה שנשמר ב-data-lines.json.
function aggregateLineGroups(trips, costBenchmarkTable) {
    // שלב 1: ספירת כמה קווים מגיעים לכל יעד (לזיהוי "תחנת קצה ייחודית")
    const destLineCount = new Map();
    {
      const seen = new Set();
      for (let i = 0; i < trips.length; i++) {
        const t = trips[i];
        const dKey = String(t.dest || '').trim().toLowerCase();
        if (!dKey || dKey === 'לא ידוע' || dKey === 'כללי') continue;
        const pairKey = `${t.lineNum}__${dKey}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        destLineCount.set(dKey, (destLineCount.get(dKey) || 0) + 1);
      }
    }

    const groups = {};
    for (let i = 0; i < trips.length; i++) {
      const t = trips[i];
      const o = kpCityOnly(t.origin);
      const d = kpCityOnly(t.dest);
      const cityPair = [o, d].sort().join('-');
      const groupKey = `${t.lineNum}_${cityPair}`;
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(t);
    }

    const records = Object.entries(groups).map(([groupKey, data]) => {
      const lineNum = data[0].lineNum;
      const totalTrips = data.reduce((s, t) => s + t.tripCount, 0);
      const totalRiders = data.reduce((s, t) => s + (t.ridership * t.tripCount), 0);
      const avgRiders = totalTrips > 0 ? (totalRiders / totalTrips) : 0;
      const totalPeaks = data.reduce((s, t) => s + (t.peakLoad * t.tripCount), 0);
      const avgPeak = totalTrips > 0 ? (totalPeaks / totalTrips) : 0;

      // סיווג הקו
      const category = classifyLine({
        opGroup: data[0].opGroup,
        uniqueness: data[0].uniquenessVal,
        lineType: data[0].lineType,
        distance: data[0].distance,
        trips: totalTrips,
        isNight: data[0].isNightLine,
        isFeeding: data[0].isFeedingLine,
      });
      let lowRiderTh = LOW_RIDER_THRESHOLD[category] || 10;
      let costBenchmark = lookupCostBenchmark(costBenchmarkTable, category, data[0].district);

      // החלקת מדרגות הסיווג: קו של 46 ק"מ נמדד מול רף ₪34 וקו של 44 מול
      // ₪23.1 — פער 47% על הבדל של 2 ק"מ; ומעבר מ-599 ל-600 נסיעות שבועיות
      // הקפיץ בבת אחת גם את הבנצ'מרק וגם את סף השפל. ליד הגבול (40-50 ק"מ,
      // 500-700 נסיעות) הרף עובר בהדרגה בין שתי הקטגוריות.
      const dist0 = data[0].distance || 0;
      if ((category === 'בינעירוני ארוך' || category === 'בינעירוני קצר') && dist0 >= 40 && dist0 <= 50) {
        const bLong = lookupCostBenchmark(costBenchmarkTable, 'בינעירוני ארוך', data[0].district);
        const bShort = lookupCostBenchmark(costBenchmarkTable, 'בינעירוני קצר', data[0].district);
        const w = (dist0 - 40) / 10;                       // 0 ב-40 ק"מ, 1 ב-50
        costBenchmark = bShort + (bLong - bShort) * w;
      }
      if ((category === 'עירוני תדירות גבוהה' || category === 'עירוני תדירות נמוכה') && totalTrips >= 500 && totalTrips <= 700) {
        const bHi = lookupCostBenchmark(costBenchmarkTable, 'עירוני תדירות גבוהה', data[0].district);
        const bLo = lookupCostBenchmark(costBenchmarkTable, 'עירוני תדירות נמוכה', data[0].district);
        const w = (totalTrips - 500) / 200;                // 0 ב-500, 1 ב-700
        costBenchmark = bLo + (bHi - bLo) * w;
        lowRiderTh = Math.round((LOW_RIDER_THRESHOLD['עירוני תדירות נמוכה'] +
          (LOW_RIDER_THRESHOLD['עירוני תדירות גבוהה'] - LOW_RIDER_THRESHOLD['עירוני תדירות נמוכה']) * w));
      }

      // נסיעות שפל לפי סף הקטגוריה
      const lowTrips  = data.filter(t => t.ridership < lowRiderTh);
      const lowCount  = lowTrips.reduce((s, t) => s + t.tripCount, 0);
      const percentLow = totalTrips > 0 ? (lowCount / totalTrips) * 100 : 0;

      const deadHoursTrips = data.filter(t => t.timeMins >= 540 && t.timeMins <= 840);
      const avgDeadHours = deadHoursTrips.length > 0 ? deadHoursTrips.reduce((s, t) => s + t.ridership, 0) / deadHoursTrips.length : null;

      const avgCapacity = data.reduce((s,t) => s + (t.capacity || 50), 0) / data.length || 50;
      const scale = avgCapacity / 50;

      const wastedKm = Math.round(
        lowTrips.reduce((s, t) => s + ((t.distance || 0) * t.tripCount), 0)
      );

      const validCosts = data.filter(t => t.cost > 0);
      const avgCost = validCosts.length > 0 ? validCosts.reduce((s, t) => s + t.cost, 0) / validCosts.length : 0;
      const costRatio = costBenchmark > 0 && avgCost > 0 ? avgCost / costBenchmark : 0;

      let totalKm = Math.round(data.reduce((s, t) => s + ((t.distance || 0) * t.tripCount), 0));
      if (data[0].weeklyKm > 0 && totalKm === 0) totalKm = Math.round(data[0].weeklyKm);
      const nonWastedKm = Math.max(0, totalKm - wastedKm);


      // מה שהניקוד וההגנות צריכים — בלי הנסיעות עצמן
      const schoolHourTrips = data.filter(t =>
        (t.timeMins >= 420 && t.timeMins <= 510) ||
        (t.timeMins >= 780 && t.timeMins <= 930)
      ).reduce((s, t) => s + t.tripCount, 0);
      const wkndTrips = data.filter(t => {
        const dl = t.daysList || [];
        return dl.length > 0 && dl.every(d => d === '6' || d === '7');
      }).reduce((s, t) => s + t.tripCount, 0);
      const destKey = String(data[0].dest || '').trim().toLowerCase();
      const sortedData = [...data].sort((a, b) => {
        const dirA = String(a.direction).replace(/\D/g, '');
        const dirB = String(b.direction).replace(/\D/g, '');
        return Number(dirA) - Number(dirB);
      });
      const makats = [...new Set(data.map(t => String(t.makat || '').replace(/^0+/, '')))];
      return {
        groupKey, lineNum, category, lowRiderTh, costBenchmark,
        // בלי עיגול: עיגול קל הזיז קווים מעבר לסף (7.95 → "7.9"/"8.0") ושינה ציונים מול החישוב בדפדפן
        totalTrips, totalRiders, avgRiders, avgPeak, percentLow, avgDeadHours, scale,
        wastedKm, totalKm, nonWastedKm, avgCost, costRatio,
        schoolRatio: totalTrips > 0 ? Math.round(schoolHourTrips / totalTrips * 1000) / 1000 : 0,
        wkndRatio: totalTrips > 0 ? Math.round(wkndTrips / totalTrips * 1000) / 1000 : 0,
        exclusiveStops: data[0].exclusiveStops || 0,
        isExclusiveDest: !!(destKey && (destLineCount.get(destKey) || 0) <= 1),
        uniquenessVal: data[0].uniquenessVal || '',
        origin: sortedData[0].origin, dest: sortedData[0].dest, district: sortedData[0].district,
        makat: sortedData[0].makat, makats,
        isNightLine: !!sortedData[0].isNightLine, isEilatPrebooked: !!sortedData[0].isEilatPrebooked, isFeedingLine: !!sortedData[0].isFeedingLine,
      };
    });
    return records;
}

// ── שלב 2: ניקוד (זול) — רשומה + הגדרות המשתמש + ארכיון/חפיפות/נסיעות תפעוליות ──
function scoreGroup(r, ctx) {
  const { pset, liveOf, overlapMap, dhObs } = ctx;
  const PC = pset.c;
  const componentScores = {};
  const ptsOf = (k, f) => (PC[k] && PC[k].on ? Math.max(0, Math.min(1, f)) * (Number(PC[k].max) || 0) : 0);

  // 1. נסיעות שפל — אחוז הנסיעות שמתחת לסף הנוסעים של הקטגוריה
  componentScores.lowTrips = ptsOf('lowTrips', r.percentLow / 100);
  // 2. ק"מ מבוזבז — חצי לפי החלק המבוזבז, חצי אם יש מעל 100 ק"מ סרק בשבוע
  const wastedRatio = r.totalKm > 0 ? (r.wastedKm / r.totalKm) : 0;
  componentScores.wastedKm = ptsOf('wastedKm', (wastedRatio * 10 + (r.wastedKm > 100 ? 10 : 0)) / 20);
  // 3. עלות תפעולית — יחס לממוצע קטגוריה (מדרגות)
  const costRatio = r.costRatio;
  let fCost = 0;
  if (costRatio === 0) fCost = 0;
  else if (costRatio <= 0.7) fCost = 0;
  else if (costRatio <= 1.3) fCost = 0.25;
  else if (costRatio <= 1.7) fCost = 0.4;
  else if (costRatio <= 2.5) fCost = 0.6;
  else if (costRatio <= 4)   fCost = 0.8;
  else if (costRatio <= 6)   fCost = 0.9;
  else                       fCost = 1;
  componentScores.cost = ptsOf('cost', fCost);
  // 4. נוסעים ועומס שיא — תלוי בקיבולת; המשתמש יכול לקבוע ספים מוחלטים
  const scale = r.scale || 1;
  const lowFull = PC.riders.low != null ? PC.riders.low : r.lowRiderTh * 0.6 * scale;
  const lowHalf = PC.riders.low != null ? PC.riders.low * 2 : r.lowRiderTh * 1.2 * scale;
  const peakTh = PC.riders.peak != null ? PC.riders.peak : 15 * scale;
  let fRiders = 0;
  if (r.avgRiders < lowFull) fRiders += 0.5;
  else if (r.avgRiders < lowHalf) fRiders += 7 / 30;
  if (r.avgPeak < peakTh) fRiders += 0.5;
  componentScores.riders = ptsOf('riders', fRiders);
  // 5. נסיעה תפעולית במסווה — מהשידורים (14 יום); 7 בשבוע ומעלה = מלוא הנקודות
  let dhWeekly = 0;
  if (dhObs && dhObs.lines) {
    const nd = (dhObs.days || []).length || 14;
    let n = 0;
    (r.makats || []).forEach(mk => { const e = dhObs.lines[mk]; if (e) n += e.n; });
    dhWeekly = n / nd * 7;
  }
  componentScores.deadhead = PC.deadhead ? ptsOf('deadhead', dhWeekly / 7) : 0;

  const maxSum = maxSumOf(PC);
  const rawScore = normScore(componentScores.lowTrips + componentScores.wastedKm + componentScores.cost + componentScores.riders + componentScores.deadhead, maxSum);
  Object.keys(componentScores).forEach(k => { componentScores[k] = Math.round(componentScores[k]); });

  // ── הגנות — הנקודות לכל הגנה לבחירת המשתמש; 0 = כבויה ──
  const PP = pset.p;
  const protections = [];
  let totalDeduction = 0;
  if (PP.exclusive > 0 && (r.exclusiveStops > 0 || r.isExclusiveDest)) {
    protections.push({ name: 'תחנות ייחודיות', value: PP.exclusive, detail: r.exclusiveStops > 0 ? `${r.exclusiveStops} תחנות בלעדיות` : 'יעד יחיד באזור' });
    totalDeduction += PP.exclusive;
  }
  const isTrainCoord = (r.uniquenessVal || '').includes('רכבת');
  if (PP.train > 0 && isTrainCoord) {
    protections.push({ name: 'מותאם רכבת', value: PP.train, detail: 'יוצא בתיאום עם לוז רכבת' });
    totalDeduction += PP.train;
  }
  if (PP.school > 0 && r.category === 'תלמידים' && r.schoolRatio >= 0.6) {
    protections.push({ name: 'תלמידים בשעות בי"ס', value: PP.school, detail: `${Math.round(r.schoolRatio * 100)}% מהנסיעות` });
    totalDeduction += PP.school;
  }
  if (PP.prebook > 0 && r.isEilatPrebooked) {
    protections.push({ name: 'הזמנה מראש', value: PP.prebook, detail: 'התיקופים חלקיים — העומס בפועל גבוה מהנמדד' });
    totalDeduction += PP.prebook;
  }
  if (PP.weekend > 0 && r.totalTrips > 0 && r.wkndRatio >= 0.6) {
    protections.push({ name: 'קו סופ"ש', value: PP.weekend, detail: `${Math.round(100 * r.wkndRatio)}% מהנסיעות בשישי-שבת` });
    totalDeduction += PP.weekend;
  }
  // הארכיון של "הקו בזמן": התג "בוטל" רק כשכל המק"טים בוטלו; אחרת נדגם מק"ט חי
  const lv = (mk) => (liveOf ? liveOf(mk) : null);
  const firstAlive = (r.makats || []).find(mk => { const l = lv(mk); return !(l && l.rm); });
  const live = lv(firstAlive || r.makat);
  if (live && !live.rm) {
    if (PP.newLine > 0 && live.newd && !live.gap) {
      protections.push({ name: 'קו חדש בהרצה', value: PP.newLine, detail: `הופיע לראשונה ב-${String(live.newd).split('-').reverse().join('.')}` });
      totalDeduction += PP.newLine;
    }
    if (PP.reduced > 0 && (live.red || 0) >= 2) {
      protections.push({ name: 'כבר צומצם', value: PP.reduced, detail: `${live.red} צמצומי שירות בשנה האחרונה` });
      totalDeduction += PP.reduced;
    }
  }
  if (PP.noAlt > 0 && overlapMap) {
    const ovl = overlapMap[String(r.makat || '').replace(/^0+/, '').trim()];
    const strong = (ovl || []).some(o => (o[3] || 0) >= 40);
    if (!strong) {
      protections.push({ name: 'אין חפיפת תחנות משמעותית', value: PP.noAlt,
        detail: ovl && ovl.length ? 'החפיפה הקיימת חלקית (מתחת ל-40%)' : 'לא נמצאה חפיפת תחנות מעל סף המדד' });
      totalDeduction += PP.noAlt;
    }
  }
  const finalScore = Math.max(0, rawScore - totalDeduction);
  const tier = getStatusTier(finalScore);
  const annualExcess = (r.avgCost > 0 && r.costBenchmark > 0 && r.avgCost > r.costBenchmark)
    ? Math.round((r.avgCost - r.costBenchmark) * r.avgRiders * r.totalTrips * 52) : 0;
  return {
    lineNum: r.lineNum,
    avg: r.avgRiders.toFixed(1),
    count: r.totalTrips,
    totalRiders: r.totalRiders,
    score: finalScore,
    rawScore,
    componentScores,
    dhWeekly,
    protections,
    totalDeduction,
    category: r.category,
    costBenchmark: r.costBenchmark,
    costRatio: Number(r.costRatio.toFixed(2)),
    lowRiderTh: r.lowRiderTh,
    origin: r.origin, dest: r.dest, district: r.district, makat: r.makat,
    status: tier.label,
    statusTier: tier,
    percentLow: Math.round(r.percentLow),
    avgPeak: Math.round(r.avgPeak),
    wastedKm: r.wastedKm,
    cost: r.avgCost,
    totalKm: r.totalKm,
    nonWastedKm: r.nonWastedKm,
    groupKey: r.groupKey,
    isNightLine: r.isNightLine, isEilatPrebooked: r.isEilatPrebooked, isFeedingLine: r.isFeedingLine,
    exclusiveStops: r.exclusiveStops,
    annualExcess,
    live,
  };
}

if (typeof module !== 'undefined') module.exports = { aggregateLineGroups, scoreGroup, classifyLine, lookupCostBenchmark, getStatusTier, maxSumOf, normScore, LOW_RIDER_THRESHOLD, CATEGORIES, STATUS_TIERS };
