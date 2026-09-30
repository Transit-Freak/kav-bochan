/* נתונים מוכנים — במקום לפרוס את ה-GTFS בטלפון ולפנות לשרת ניתוב בזמן אמת.

   נבנים פעם בשבוע ב-GitHub Actions של "הקו הבוחן" (Transit-Freak/kav-bochan,
   tools/nahagim_build.py) ונדחפים לענף nahagim-data:
     index.json.gz            כל הקווים: מספר, שם, מק"ט, מפעיל, סוג, סטטוס ניווט
     routes/<route_id>.json.gz  נסיעה מייצגת, תחנות (עם f על הצורה), צורה,
                              הוראות נהיגה מהתאמת מפה ל-OpenStreetMap, ואיכות

   הקבצים דחוסים gzip ונפתחים כאן עם DecompressionStream — אותו מנוע שכבר פורס
   את קובץ ה-GTFS. הוראות הנהיגה נגזרות מ-OpenStreetMap (© OpenStreetMap
   contributors, ODbL).

   window.NahagimData.loadIndex()   -> feed  (כמו התוצאה של GTFSParser.parseZip, בלי הגאומטריה)
   window.NahagimData.loadRoute(id) -> view  (כמו GTFSParser.buildTripView + maneuvers + nav)  */
(function () {
  const BASE = 'https://raw.githubusercontent.com/Transit-Freak/kav-bochan/nahagim-data/';

  async function fetchJson(path) {
    const r = await fetch(BASE + path);
    if (!r.ok) throw new Error('HTTP ' + r.status + ' · ' + path);
    if (!path.endsWith('.gz')) return r.json();
    if (typeof DecompressionStream === 'undefined') throw new Error('הדפדפן לא תומך בפענוח gzip');
    const text = await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text();
    return JSON.parse(text);
  }

  async function loadIndex() {
    let idx;
    try { idx = await fetchJson('index.json.gz'); }
    catch (e) { idx = await fetchJson('index.json'); }   // גיבוי לא דחוס
    const routes = idx.routes.map((r) => ({ ...r, agencyId: '', desc: '' }));
    return {
      remote: true,
      built: idx.built, gtfsDate: idx.gtfs_date, source: idx.source,
      routes,
      routesById: new Map(routes.map((r) => [r.id, r])),
      counts: { routes: idx.counts.routes, stops: idx.counts.stops, trips: idx.counts.trips, withNav: idx.counts.with_nav },
      fileName: 'נתוני משרד התחבורה · ' + idx.gtfs_date,
    };
  }

  async function loadRoute(id) {
    const d = await fetchJson('routes/' + encodeURIComponent(id) + '.json.gz');
    return {
      shape: '',
      geom: d.geom,
      totalMeters: d.totalMeters,
      trip: d.trip,
      maneuvers: d.maneuvers || [],
      nav: d.nav || { status: 'none' },
    };
  }

  window.NahagimData = { BASE, loadIndex, loadRoute };
})();
