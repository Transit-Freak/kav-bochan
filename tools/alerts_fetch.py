# -*- coding: utf-8 -*-
"""הקו המודיע — התראות השירות של משרד התחבורה (שלמה 18.10.2026).

המקור: bus-alerts.com (קוד פתוח בנחלת הכלל, github.com/dvorakroth/bus-alerts), שקורא את פיד
ההתראות בזמן אמת של משרד התחבורה ומפרסם אותו כ-JSON. כל ההתראות בבקשה אחת (/api/all_alerts,
שהשרת שם שומר בזיכרון 10 דקות), ומפת השינויים (/api/get_route_changes) רק להתראה חדשה או שהשתנתה.

פלט (alerts/data/):
  alerts.json      כל ההתראות הפעילות והעתידיות, מצומצמות לאתר, עם סוג הסיבה
  rc/<id>.json     לכל התראה עם שינויי מסלול: השרטוט של כל קו, סדר התחנות החדש, תחנות שבוטלו,
                   והמסלול המשוער לפי נוסח ההודעה (tools/alerts_route.py)
  by-rd.json       מק"ט-כיוון-חלופה (או מק"ט בלבד, כשאין מפה) → מזהי ההתראות ("שינוי זמני" בהקו בזמן)
  state.json       מה כבר נמשך (hash לכל התראה) — כדי לא למשוך שוב מפה שלא השתנתה
  report.json      סיכום הריצה: כמה התראות מכל סוג, לכמה נמצא מסלול לפי הנוסח ולמה לא

env: MAX_MIN (תקציב זמן, ברירת מחדל 25), OUT (ברירת מחדל alerts/data)
"""
import datetime
import glob
import hashlib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import alerts_route as AR  # noqa: E402

SRC = 'https://bus-alerts.com'
OUT = os.environ.get('OUT', 'alerts/data')
MAX_MIN = float(os.environ.get('MAX_MIN', '25'))
# גרסת קריאת הנוסח: כשהיא עולה, התראות ש"לא נמצא בהן מסלול" מחושבות שוב (שלמה 18.10, אילת)
PARSE_V = 15
# PARSE_LOCK=1 (alerts.yml, כשבדיקת הרגרסיה נכשלה): לא מחשבים שוב את כל ההתראות בגלל PARSE_V — רק חדשות ושהשתנו
PARSE_LOCK = os.environ.get('PARSE_LOCK') == '1'
# הארכיון של הקו בזמן: שינויים זמניים שכבר התחילו, לפי מק"ט — נשמרים גם אחרי שההתראה ירדה (שלמה 18.10)
TEMP_DIR = os.environ.get('TEMP_DIR', 'line-history/data/temp')
UA = {'User-Agent': 'kavbochan.app alerts mirror (twice a day; github.com/Transit-Freak/kav-bochan)'}
T0 = time.time()
S3 = 'https://openbus-stride-public.s3.eu-west-1.amazonaws.com'


def left():
    return MAX_MIN * 60 - (time.time() - T0)


def get_json(url, tries=3, timeout=120, data=None):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA, data=data)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except Exception as e:
            print(f'  ניסיון {k + 1} נכשל: {url[:90]} — {e}', file=sys.stderr)
            time.sleep(5 * (k + 1))
    return None


# ------------------------------------------------------------------ סוג הסיבה
# לפי הכותרת והנוסח. הסדר חשוב: "עבודות" מנצח, "תאונה" לפני "עומס".
CAUSES = [
    ('works', 'עבודות', r'עבודות|עבודה|תשתית|חפיר|סליל|ריבוד|שיפוץ|הנחת צנרת|רכבת קלה|קו (?:ה)?סגול|קו (?:ה)?ירוק|הקמת|בנייה|בניה|גשר חדש|הסדרי תנועה זמניים'),
    ('police', 'משטרה וביטחון', r'משטר|ביטחונ|בטחונ|חפץ חשוד|פיגוע|אירוע חריג|סגירה ביטחונית|הנחיית (?:ה)?משטרה|פינוי|תרגיל'),
    ('protest', 'הפגנות', r'הפגנ|מחאה|מחאת|עצרת|חסימת כבישים'),
    ('event', 'אירועים', r'מרתון|מירוץ|מרוץ|ריצת|ריצה|אופניים|טקס|הלוויה|הלויה|פסטיבל|הופעה|משחק|אצטדיון|מצעד|תהלוכ|הקפות|יום הזיכרון|יום הזכרון|יום העצמאות|ל"ג בעומר|לג בעומר|ביקור|(?<![א-ת])(?:[בהולמש]|וב|ול|וה)?כנס(?:ים)?(?![א-ת])|הכנסת ספר תורה|אירוע|חגיגות|הדלקת|יריד|קרנבל|אדלאידע|עדלאידע|הילולה|הילולת|עלייה לקבר|תפילה המונית'),
    ('accident', 'תאונה', r'תאונ'),
    ('stuck', 'רכב תקוע או חסימה', r'תקוע|תקועה|נתקע|חסימת רכבים|רכב חוסם|משאית'),
    ('weather', 'מזג אוויר', r'הצפ|שיטפון|שטפון|גשם|שלג|סערה|מזג האוויר|מזג אוויר'),
    ('strike', 'שביתה או השבתה', r'שביתה|שביתת|השבתה|עיצומים'),
    ('traffic', 'עומסי תנועה', r'עומס|פקק'),
    ('fault', 'תקלה', r'תקלה|תקלת|תקלות|קריסת|נזק'),
    # שלמה 18.10: "סיבה: העתקת תחנה" — לא "לא צוינה סיבה"
    ('relocate', 'העתקת תחנה', r'העתקת (?:ה)?תחנ|העתקה של (?:ה)?תחנ|תועתק (?:ה)?תחנ|תועתקנה|הזזת (?:ה)?תחנ|תחנה זמנית|תחנות זמניות|מיקום (?:ה)?תחנה'),
]
CAUSE_LABEL = dict((k, l) for k, l, _ in CAUSES) | {'other': 'לא צוינה סיבה'}


RELOCATE = dict((k, p) for k, _, p in CAUSES)['relocate']


def cause_of(header, desc):
    # כשהכותרת עצמה אומרת "העתקת תחנה" — זו הסיבה, גם אם בנוסח מוזכרות עבודות
    if re.search(RELOCATE, header or ''):
        return 'relocate'
    t = f'{header}\n{desc}'
    for key, _, pat in CAUSES:
        if re.search(pat, t):
            return key
    return 'other'


# ------------------------------------------------------------------ תחנות (שם ומק"ט לפי stop_id)
STOP_POS = {}   # stop_id → (lat, lon), מאותו stops.txt — לתחנה מבוטלת שאתר המקור לא שייך לקו


def stop_names():
    """stop_id → (code, name) מתוך stops.txt של קובץ ה-GTFS האחרון בארכיון (קריאה של איבר אחד בלבד)."""
    import backfill_geo as BG
    for back in range(0, 6):
        ds = (datetime.date.today() - datetime.timedelta(days=back)).isoformat()
        url = f'{S3}/gtfs_archive/{ds[:4]}/{ds[5:7]}/{ds[8:10]}/israel-public-transportation.zip'
        try:
            members = BG.central_dir(url)
            idx, rows = BG.member_rows(url, members, 'stops.txt')
            out = {}
            for r in rows:
                out[r[idx['stop_id']]] = (r[idx['stop_code']], r[idx['stop_name']])
                try:
                    STOP_POS[r[idx['stop_id']]] = (float(r[idx['stop_lat']]), float(r[idx['stop_lon']]))
                except (KeyError, ValueError):
                    pass
            print(f'תחנות: {len(out):,} מ-GTFS של {ds}')
            return out
        except BaseException as e:   # BG.http עושה SystemExit כשאין קובץ ליום הזה
            print(f'  GTFS {ds}: {e}', file=sys.stderr)
    return {}


# ------------------------------------------------------------------ מסלול לפי הנוסח
# מפת הרחובות נשמרת במשבצות של 0.02° (כ-2 ק"מ) בין ריצה לריצה (actions/cache): שרת המפות עונה לפעמים
# אחרי 5–10 דקות, ובלי שמירה כל ריצה נגמרת לפני שכל ההודעות חושבו (שלמה 19.10: "עוד לא חושב")
OSM_DIR = os.environ.get('OSM_DIR', '.osm-cache')
TILE = 0.02
TILE_DAYS = 30


def overpass_box(s, w, n, e):
    q = (f'[out:json][timeout:90];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|'
         f'living_street|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|busway)$"]'
         f'({s:.5f},{w:.5f},{n:.5f},{e:.5f});out geom tags;')
    for url in ('https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter',
                'https://overpass.private.coffee/api/interpreter'):
        d = get_json(url, tries=1, timeout=100, data=urllib.parse.urlencode({'data': q}).encode())
        if d and 'elements' in d:
            return [[el.get('id'), el.get('tags', {}), [(p['lat'], p['lon']) for p in el['geometry']]]
                    for el in d['elements'] if el.get('type') == 'way' and el.get('geometry')]
        time.sleep(3)
    return None


# מפת ישראל כקובץ (Geofabrik, אותו קובץ שהסריקה היומית מורידה לקו באג): כשהוא קיים, הרחובות
# נחתכים ממנו מקומית, בלי שרת חיצוני (שלמה 20.10: שלושת שרתי Overpass לא ענו בכל ריצת הבוקר)
OSM_PBF = os.environ.get('OSM_PBF', '')
HIGHWAYS = set('motorway trunk primary secondary tertiary unclassified residential living_street service motorway_link '
               'trunk_link primary_link secondary_link tertiary_link busway'.split())


def read_ways(path):
    """הרחובות מקובץ OSM (pbf או xml): [(tags, [(lat, lon), ...]), ...]."""
    import osmium
    out = []
    for o in osmium.FileProcessor(path).with_locations():
        if not o.is_way() or o.tags.get('highway') not in HIGHWAYS:
            continue
        try:
            geom = [(nd.lat, nd.lon) for nd in o.nodes]
        except Exception:   # צומת בלי מיקום (קצה החיתוך)
            continue
        if len(geom) > 1:
            out.append(({t.k: t.v for t in o.tags}, geom))
    return out


def local_ways(bbox):
    import subprocess
    import tempfile
    s, w, n, e = bbox
    with tempfile.TemporaryDirectory() as d:
        box = f'{d}/box.osm.pbf'
        subprocess.run(['osmium', 'extract', '-b', f'{w},{s},{e},{n}', '-s', 'complete_ways', OSM_PBF, '-o', box,
                        '--overwrite', '--no-progress'], check=True, timeout=180, capture_output=True)
        return read_ways(box)


def overpass(bbox):
    """הרחובות באזור: מקובץ מפת ישראל כשיש, אחרת ממשבצות שמורות; משבצת חסרה (או בת יותר מחודש) נמשכת מ-Overpass."""
    if OSM_PBF and os.path.exists(OSM_PBF):
        try:
            ways = local_ways(bbox)
            if ways:
                return ways
        except Exception as ex:
            print(f'  חיתוך מקובץ המפה נכשל: {ex}', file=sys.stderr)
    import gzip
    import math as _m
    s, w, n, e = bbox
    os.makedirs(OSM_DIR, exist_ok=True)
    ways = {}
    for i in range(_m.floor(s / TILE), _m.floor(n / TILE) + 1):
        for j in range(_m.floor(w / TILE), _m.floor(e / TILE) + 1):
            f = f'{OSM_DIR}/{i}_{j}.json.gz'
            tile = None
            if os.path.exists(f) and time.time() - os.path.getmtime(f) < TILE_DAYS * 86400:
                try:
                    tile = json.load(gzip.open(f, 'rt'))
                except Exception:
                    tile = None
            if tile is None:
                if left() < 90:
                    return None
                tile = overpass_box(i * TILE, j * TILE, (i + 1) * TILE, (j + 1) * TILE)
                if tile is None:
                    return None
                json.dump(tile, gzip.open(f, 'wt'), ensure_ascii=False, separators=(',', ':'))
                time.sleep(2)
            for wid, tags, geom in tile:
                ways[wid] = (tags, [tuple(p) for p in geom])
    return list(ways.values())


OSM_CACHE = []   # (bbox, ways) שכבר נטענו בריצה הזו


def estimate_routes(alert, rc_routes, stops):
    """לכל קו בהתראה: ניסיון למצוא את המסלול החלופי לפי הנוסח. לא מתעקשים: אם אין הוראה
    מפורשת, או שהרחובות לא נמצאו במפה, נשארים עם סדר התחנות החדש — ואומרים את זה."""
    desc = alert['description'].get('he', '')
    paras = AR.parse(desc)
    # סוג ההודעה קובע את הדרך: בלי הוראות נסיעה — אין מה לנתב, ואומרים למה (רק תחנות / דילוג)
    alert['_tpl'] = AR.template(desc, paras)
    why = {}
    # קווים שהמסלול שלהם מקוצר ("יסיים בתחנה X" / "יתחיל מתחנה Y") — אין עקיפה לחפש
    short = AR.short_lines(desc)

    def is_short(r):   # 78א כשכתוב 78, כמו בפסקאות; "1-2" — רק לכיוון 2 של קו 1
        ns = {r['num'], re.sub(r'[א-ת]$', '', r['num'])}
        d = (r.get('rd') or '').split('-')[1:2]
        return bool((ns | {f'{n}-{d[0]}' for n in ns if d} | {'*'}) & short)
    if not paras:
        for r in rc_routes:
            r['est'] = None
            r['why'] = 'relocate' if re.search(RELOCATE, desc + (alert.get('header') or {}).get('he', '')) else \
                'short' if is_short(r) else \
                {'skip': 'skip', 'stops': 'stops-only'}.get(alert['_tpl'], 'no-text')
        return 'no-text'
    # אזור הניתוב: הקטע המבוטל של כל הקווים + כ-1 ק"מ (עקיפות ארוכות, כמו ברחובות ראשון לציון)
    pts = []
    for r in rc_routes:
        sh = r['shape']
        if r['cut']:
            pts += sh[max(0, r['cut'][0] - 60):r['cut'][1] + 60]
    if not pts:
        for r in rc_routes:
            r['est'] = None
            r['why'] = 'no-cut'
        return 'no-cut'
    la = [p[0] for p in pts]
    lo = [p[1] for p in pts]
    pad = 0.009
    bbox = (min(la) - pad, min(lo) - pad * 1.2, max(la) + pad, max(lo) + pad * 1.2)
    if (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) > 0.012:   # אזור ענק (יותר מ-~10×12 ק"מ) — לא מנתבים
        for r in rc_routes:
            r['est'] = None
            r['why'] = 'area'
        return 'area'
    # אותו אזור כבר נטען בריצה הזו — רק כשהרחובות מ-Overpass. מקובץ המפה כל הודעה חותכת את האזור שלה
    # (פחות משנייה): אזור גדול יותר של הודעה אחרת מביא רחובות נוספים, ו"מוטה גור" כבר לא חד-משמעי
    # (גבעת שמואל 20.10: נמצא בבדיקה לבד, לא נמצא בריצה המלאה)
    local = bool(OSM_PBF and os.path.exists(OSM_PBF))
    ways = None if local else next((w for b, w in OSM_CACHE if b[0] <= bbox[0] and b[1] <= bbox[1] and b[2] >= bbox[2] and b[3] >= bbox[3]), None)
    if ways is None:
        ways = overpass(bbox)
        if ways and not local:
            OSM_CACHE.append((bbox, ways))
    if not ways:
        for r in rc_routes:
            r['est'] = None
            r['why'] = 'osm'
        return 'osm'
    net = AR.Streets(ways)
    for r in rc_routes:
        r['est'], r['why'] = None, 'no-match'
        if not r['cut']:
            r['why'] = 'no-cut'
            continue
        cand = [p for p in paras if not p['lines'] or r['num'] in p['lines']]
        # "78" בהודעה ו-78א במפה, או "6מ'" בהודעה ו-6 במפה — אותו קו, כשאין לו פסקה משלו
        # (אבל לא פסקה של 72א לקו 72, כשגם 72א בהודעה)
        if not cand:
            base = re.sub(r'[א-ת]$', '', r['num'])
            nums = {x['num'] for x in rc_routes}
            cand = [p for p in paras if any(re.sub(r'[א-ת]$', '', x) == base and not (x != base and x in nums) for x in p['lines'])]
        # "לקו 4-3" — רק לכיוון 3 של קו 4
        rdir = (r.get('rd') or '').split('-')[1:2]
        b0 = re.sub(r'[א-ת]$', '', r['num'])
        cand = [p for p in cand if (p.get('dnum') or {}).get(r['num'], (p.get('dnum') or {}).get(b0)) in (None, *rdir)]
        # קו שכתוב במפורש שהוא מקוצר, ואין לו פסקה עם המספר שלו — לא מקבל עקיפה של פסקה בלי מספר קו
        # (קו 297 בטכניון קיבל את המסלול של 796/774, 25.10). קו 50 שם: כיוון אחד מקוצר, לשני יש פסקה משלו.
        # '*' (קיצור בלי מספר) לא עוצר — אחרת כל הקווים בהודעה נעצרים
        ns = {r['num'], b0}
        if ((ns | {f'{n}-{d}' for n in ns for d in rdir}) & (short - {'*'})) and not any(p['lines'] for p in cand):
            r['why'] = 'short'
            continue
        # כמה פסקאות לאותו קו (כיוון הלוך וכיוון חזור). קודם לפי התחנות המבוטלות שכתובות מתחת לכל פסקה —
        # של הכיוון שלה בלבד (בצד השני של הרחוב יש תחנה אחרת), גם כשהשם בכיוון לא דומה ליעד ("לכיוון
        # רידינג" — קו 2 לנווה דן, תל אביב 20.10). רק כשאין תחנות כאלה — "לכיוון X" / "מכיוון X" מול היעד
        codes = {(stops or {}).get(sid, ('',))[0] for sid in list(r['del']) + [x for x, _ in r['seq']]} - {''}

        def same_stops(p):
            return len(p.get('rm', set()) & codes)
        if any(same_stops(p) for p in cand):
            cand = [p for p in cand if same_stops(p) or not p.get('rm')]
        fit = [p for p in cand if AR.dir_fits(p, r.get('to')) is not False]
        if fit and len(fit) < len(cand) and not any(same_stops(p) for p in cand):
            cand = fit
        # תחנה חלופית של הקו שהמסלול לא עובר לידה — סימן שזו הפסקה של כיוון אחר (קו 201, 20.10):
        # מעדיפים את המסלול שעובר ליד הכי הרבה תחנות חלופיות, ורק אחר כך את הקצר
        alt_pos = [STOP_POS[sid] for sid, add in r['seq'] if add and sid in STOP_POS]

        def near_alts(res):
            pts = AR._densify([tuple(x) for x in res['path']], 15.0)
            return sum(1 for q in alt_pos if min(AR.meters(q, x) for x in pts) < 80)
        best = None
        # התחנות החלופיות של הפסקה של הקו הזה (ולא של כל ההודעה)
        # (None — בפסקה אין רשימת תחנות חלופיות)
        if cand:
            top = [p for p in cand if same_stops(p) == max(same_stops(q) for q in cand)]
            r['_xa'] = sorted(set().union(*(p['add'] for p in top if 'add' in p))) if any('add' in p for p in top) else None
        for p in cand:
            try:
                res = AR.route_detour(net, p, [tuple(x) for x in r['shape']], r['cut'][0], r['cut'][1])
            except Exception as e:   # הנוסח לא תמיד צפוי — לא מפילים את הריצה בגלל הודעה אחת
                print(f'  ניתוב נכשל ({alert["id"]} קו {r["num"]}): {e}', file=sys.stderr)
                res = None
            if res:
                res['_k'] = (-same_stops(p), -(AR.dir_fits(p, r.get('to')) is True), -near_alts(res), res['len'])
            if res and (best is None or res['_k'] < best['_k']):
                best = res
                r['_xa'] = sorted(p['add']) if 'add' in p else None
        if best:
            best.pop('_k', None)
        if best:
            r['est'], r['why'] = best, 'ok'
        elif not cand:
            r['why'] = 'no-text'   # אין בהודעה הוראה לקו הזה ("קווים 350, 355: ע"פ המסלולים המקוריים")
            if is_short(r):
                r['why'] = 'short'
            # "קו 43 ישנה את מסלולו… וידלג על תחנה" — כשלקו אחר בהודעה יש הוראה
            elif re.search(rf'(?<!\d){re.escape(r["num"])}(?![\dא-ת])[^\n]*ידלג', desc):
                r['why'] = 'skip'
        why[r['num']] = r['why']
    return 'ok' if any(r['est'] for r in rc_routes) else 'no-match'


def text_lines(desc):
    """מספרי קווים שכתובים בנוסח ולא תמיד ברשימה של המקור: רשימה מפורשת ("קווים מושפעים: 680, 690",
    "שינוי מסלול בקוים: …") וכותרות הפסקאות — לא כל מספר בטקסט (תאריך, שעה, כביש, מק"ט)."""
    out = set()
    for line in AR._logical_lines(desc):
        m = re.search(r'קווים מושפעים|הקווים הבאים|שינוי (?:ה)?מסלול(?:ים)? (?:ב|ל)קו(?:ו?ים|ו?י)?', line)
        if m:
            tail = re.sub(r'כביש\s*\d+', ' ', line[m.end():])
            out |= set(re.findall(r'(?<![\d/:.\-])\d{1,3}[א-ת]?(?![\d/:.\-א-ת])', tail))
    for p in AR.parse(desc):
        out |= p['lines']
    return out


def text_new_stops(desc):
    """מספרי תחנות חלופיות / חדשות / זמניות שכתובים רק בנוסח ("מקט תחנה חדשה: 25898", "תחנה חלופית: …
    (תחנה 19637)") — אתר המקור לא תמיד מוסיף אותן לרשימה (תל אביב ויצמן/פנקס, 20.10)."""
    out = []
    on = False   # כותרת "תחנות חדשה:" בשורה משלה — המספרים בשורות שאחריה (קו 126, 20.10)
    for line in re.split(r"\n|\.\s", desc or ""):
        line = re.sub(r"\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b|\b\d{1,2}:\d{2}\b", " ", line)   # תאריכים ושעות
        if re.search(r"מבוטל|בוטל", line):
            on = False
            continue
        if re.search(r"חלופי|חדשה|חדשות|זמני|תועתק|הועתק", line):
            on = True
        elif not line.strip() or not re.search(r"\d{4,6}", line):
            on = False   # שורה ריקה או בלי מספר תחנה — סוף הרשימה
        if on:
            out += [c for c in re.findall(r"(?<!\d)(\d{4,6})(?!\d)", line) if c not in out]
            # "תחנה חלופית: 645 – ויצמן/גבעת שאול" — מק"ט של 3 ספרות, אחרי הנקודתיים (ירושלים 20.10)
            if ":" in line:
                tail = re.sub(r"(?:כביש|מס['׳]?|קו(?:ו?ים)?)\s*(?:מס['׳]?\s*)?[\d,\s]+", " ", line.split(":", 1)[1])
                out += [c for c in re.findall(r"(?<![\d./:])(\d{3})(?![\d./:])", tail) if c not in out]
    return out


LINES_DIR = os.environ.get('LINES_DIR', 'line-history/data/lines')


def decode_poly(enc):
    """polyline מקודד (דיוק 5), כמו בקבצי הקו בזמן → [(lat, lon), ...]."""
    pts, i, la, lo = [], 0, 0, 0
    while i < len(enc):
        vals = []
        for _ in (0, 1):
            shift = res = 0
            while True:
                b = ord(enc[i]) - 63
                i += 1
                res |= (b & 0x1f) << shift
                shift += 5
                if b < 0x20:
                    break
            vals.append(~(res >> 1) if res & 1 else res >> 1)
        la, lo = la + vals[0], lo + vals[1]
        pts.append((la / 1e5, lo / 1e5))
    return pts


def history_rc(a, lines, desc, stops):
    """אתר המקור לא החזיר מסלול להודעה בלי תחנות משויכות (ירושלים 20.10, קו 616 בשערי ירושלים): השרטוט
    והתחנות של הקו מקבצי הקו בזמן, והתחנה המבוטלת מהנוסח. רק וריאנט שהתחנה המבוטלת על השרטוט שלו —
    הכיוון שבהודעה — ואחד לכל כיוון (הראשי, -0 / -#, כשיש)."""
    by_code = {v[0]: k for k, v in (stops or {}).items()}
    rm = set().union(*(p.get('rm', set()) for p in AR.parse(desc)))
    rm_ids = [by_code[c] for c in sorted(rm) if c in by_code and STOP_POS.get(by_code[c])]
    if not rm_ids:
        return None
    ag = next((x.get('agency_name') for x in a.get('relevant_agencies') or []), '') or ''
    out = {}
    for num, mk in lines:
        best = {}
        for f in sorted(glob.glob(f'{LINES_DIR}/{mk}-*.json')) if mk else []:
            rd = os.path.basename(f)[:-5]
            try:
                lf = json.load(open(f, encoding='utf-8'))
            except (OSError, ValueError):
                continue
            vs = lf.get('versions') or []
            if not vs or vs[-1].get('k') == 'removed':
                continue
            v = next((v for v in reversed(vs) if isinstance(v.get('shp'), int) and v['shp'] > 0 and v.get('stops')), None)
            spool, pool = lf.get('spool') or [], lf.get('pool') or []
            if not v or v['shp'] >= len(spool):
                continue
            shape = decode_poly(spool[v['shp']])
            codes = [pool[i][0] for i in v['stops'] if isinstance(i, int) and i < len(pool)]
            # התחנה המבוטלת ברצף התחנות של הווריאנט — זה הכיוון שלה; אחרת קרובה לשרטוט (תחנה בצד השני של
            # הכביש קרובה גם לשרטוט של הכיוון ההפוך)
            on = [s for s in rm_ids if (stops or {}).get(s, ('',))[0] in codes]
            near = [s for s in rm_ids if min(AR.meters(p, STOP_POS[s]) for p in shape) < 60]
            if not (on or near):
                continue
            parts = rd.split('-')
            score = (len(on), len(near), parts[-1] in ('0', '#'))
            if parts[1] not in best or score > best[parts[1]][0]:
                best[parts[1]] = (score, rd, lf, shape, codes, on or near)
        # כשיש כיוון שהתחנה ברצף שלו — רק הוא
        if any(b[0][0] for b in best.values()):
            best = {k: b for k, b in best.items() if b[0][0]}
        for _, rd, lf, shape, codes, on in best.values():
            # "...-בית שמש<->הרטום/שדרות גולדה מאיר-ירושלים-20" → "ירושלים - הרטום/שדרות גולדה מאיר"
            to = re.sub(r'-\d+$', '', (lf.get('dest') or '').split('<->')[-1])
            place, _, city = to.rpartition('-')
            out.setdefault(ag, {}).setdefault(f'{num}_{mk}', []).append({
                'line_number': num, 'route_desc': rd, 'route_id': None, 'agency_name': ag,
                'to_text': f'{city} - {place}' if place else to,
                'shape': [[round(p[1], 6), round(p[0], 6)] for p in shape],
                'updated_stop_sequence': [[by_code[c], False] for c in codes if c in by_code and by_code[c] not in on],
                'deleted_stop_ids': on})
    if not out:
        return None
    return {'route_changes': out,
            'stops_for_map': {s: {'stop_lat': STOP_POS[s][0], 'stop_lon': STOP_POS[s][1]} for s in rm_ids}}


def pos_of(s, sfm):
    """מיקום תחנה: מתשובת אתר המקור, ואם אין — מ-GTFS."""
    if s in sfm:
        return (sfm[s]['stop_lat'], sfm[s]['stop_lon'])
    return STOP_POS.get(s)


def iso_ts(x):
    try:
        return datetime.datetime.fromisoformat(str(x).replace('Z', '+00:00')).timestamp()
    except (TypeError, ValueError):
        return None


def merge_dups(alerts):
    """אותו שינוי בכמה הודעות (שלמה 19.10): לרוב אחת עם רשימת תחנות בלבד ואחת מפורטת, עם הפניות
    ("ימינה X, שמאלה Y"). המפורטת נשארת והשנייה מתאחדת לתוכה: הקווים, התחנות והמפה שלה עוברים אליה,
    והקישור הישן מפנה אליה. אותו שינוי = כל התחנות שבוטלו בהודעה החלשה בוטלו גם במפורטת, יש קו משותף,
    והתאריכים חופפים. שתי הודעות באותה רמת פירוט — נשארת זו עם הנוסח הארוך יותר."""
    turns = re.compile(r'ימינה|שמאלה|יפנו|יפנה|ייסעו|ייסע|יסעו|יצא|ייצאו|מסלול חלופי|המסלול החלופי')
    det = {a['id']: (2 if AR.parse(a['d']) or turns.search(a['d'] or '') else 1 if (a['rm'] or a['add'] or a['map']) else 0)
           for a in alerts}
    rmc = {a['id']: {str(x[0]) for x in a['rm']} for a in alerts}
    # מה שהמפורטת מכסה: התחנות שבוטלו בפיד, וגם מספרי תחנות שכתובים בנוסח שלה (קריית שמונה 19.10:
    # תחנה 53865 בנוסח ולא ברשימה)
    cover = {a['id']: rmc[a['id']] | set(re.findall(r'(?<!\d)\d{5}(?!\d)', a['d'] or '')) for a in alerts}
    nums = {a['id']: {str(x[0]) for x in a['lines'] if x[0]} for a in alerts}
    per = {a['id']: [(p[0] or 0, p[1] or 4e9) for p in a['per']] or [(0, 4e9)] for a in alerts}
    num = lambda i: int(i) if i.isdigit() else 0   # noqa: E731
    into = {}
    for a in alerts:
        i = a['id']
        if not rmc[i]:
            continue
        cands = []
        for b in alerts:
            j = b['id']
            if j == i or not rmc[i] <= cover[j] or not nums[i] & nums[j]:
                continue
            # התאריכים של ההודעה החלשה בתוך התקופה של המפורטת (שלוש שעות לכל צד), כדי שלא ילכו לאיבוד
            if not (min(p[0] for p in per[j]) - 10800 <= min(p[0] for p in per[i])
                    and max(p[1] for p in per[i]) <= max(p[1] for p in per[j]) + 10800):
                continue
            # באותה רמת פירוט: הנוסח הארוך יותר, ואם הם שווים — החדשה
            same = (det[j] == det[i] and rmc[i] == rmc[j] and nums[i] <= nums[j]
                    and (len(b['d'] or ''), num(j)) > (len(a['d'] or ''), num(i)))
            if det[j] > det[i] or same:
                cands.append((det[j], len(nums[i] & nums[j]), num(j), j))
        if cands:
            into[i] = max(cands)[3]
    for i in list(into):   # שרשרת (א → ב → ג): הכול לאחרונה
        while into[i] in into:
            into[i] = into[into[i]]
    by_id = {a['id']: a for a in alerts}
    for i, j in sorted(into.items()):
        a, b = by_id[i], by_id[j]
        have = {(x[0], x[1]) for x in b['lines']}
        b['lines'] += [x for x in a['lines'] if (x[0], x[1]) not in have]
        for k in ('rm', 'add'):
            ids = {str(x[0]) for x in b[k]}
            b[k] += [x for x in a[k] if str(x[0]) not in ids]
        b['ag'] = b['ag'] + [x for x in a['ag'] if x not in b['ag']]
        b['dep'] += a['dep']
        b['also'] = b.get('also', []) + [i]
        b['rcs'] = b.get('rcs', [j] if b['map'] else []) + ([i] if a['map'] else [])
        b['map'] = bool(b['rcs'])
        if b['map']:
            b['kind'] = 'route'
    return [a for a in alerts if a['id'] not in into], into


# מילים בכותרת שלא מעידות על אותו מקום
_GENERIC = set("עבודות עבודה עבודת יום לילה תשתית תשתיות רחוב רחובות רח שדרות שד דרך קטע מקטע הכיוונים כיוון "
               "הסדרי תנועה חסימת חסימה רציפה סגירת אירוע אירועי מקומי עקב ימים בין החל תחנה תחנות העתקת ביטול "
               "זמני זמנית שינוי שינויים מסלול מסלולים קווים קו כביש צומת כיכר מחלף תאונה עומסים כבדים צירים סמוכים "
               "צפון דרום מזרח מערב ראשון שני שלישי רביעי חמישי שישי מבוטלת מבוטלות הוספת עתידיות "
               "ריבוי מבקרים מועדים מיוחדים בזמן לצפון לדרום למזרח למערב מצפון מדרום תאריך תאריכים".split())


# מילים שמופיעות בשמות של כמה רחובות שונים ("המלך ג'ורג'", "דוד המלך", "שאול המלך") — לבד הן לא מספיקות
_WEAK = set("מלך המלך דוד יהודה אבן שאול הרב רבי שדרת עין גבעת נוה נווה כפר קרית קריית".split())


def _place_words(h):
    out = set()
    for x in re.sub(r"[\"'׳״`.,:;()\-–/+0-9]", " ", h or "").split():
        # מילה כללית, גם עם אות יחס או ידיעה לפניה ("ברחוב", "בקטע", "לכיוון", "ובצומת", "העבודות")
        if any(x[k:] in _GENERIC for k in range(0, 3) if x[:k] and all(c in "ובלמהש" for c in x[:k]) or k == 0):
            continue
        if len(x) >= 3 and x not in ("ברח", "וברח", "רח", "יפו", "ושני"):
            out.add(x)
    return out


def _city(h):
    """המקום בתחילת הכותרת, עד הפסיק או המקף המפריד: "תל-אביב – …" ו"תל אביב יפו - …" → "תל אביב"."""
    c = re.split(r"\s*,\s*|\s+[–-]\s+|\s+[–-](?=\S)|(?<=\S)[–]\s+", (h or "").strip(), 1)[0]
    c = re.sub(r"[-–]", " ", c)
    c = re.sub(r"\s+יפו$|ראשל\"?צ", lambda m: "" if "יפו" in m.group(0) else "ראשון לציון", c).strip()
    return re.sub(r"\s+", " ", c)


def group_alerts(alerts, stops):
    """כמה הודעות על אותן עבודות מחברות שונות (שלמה 20.10: גבעת שמואל — דן על 17, אפיקים על 18/48/69, ועוד
    חברה על 145). אף אחת לא מכילה את השנייה, אז הן לא מתאחדות (merge_dups) — הן מקובצות לכרטיס אחד.
    אותו שינוי = אותה עיר (המילה הראשונה בכותרת), עוד מילה משותפת בכותרת (רחוב / מקום), תאריכים חופפים,
    ותחנות שבוטלו עד 400 מ' זו מזו (או שבשתיהן אין תחנות). מסמן a['grp'] = מזהה הקבוצה."""
    by_code = {v[0]: k for k, v in (stops or {}).items()}
    pos = {}
    for a in alerts:
        pos[a['id']] = [STOP_POS[by_code[str(c)]] for c, _ in a['rm'] if str(c) in by_code and by_code[str(c)] in STOP_POS]
    per = {a['id']: [(p[0] or 0, p[1] or 4e9) for p in a['per']] or [(0, 4e9)] for a in alerts}
    city = {a['id']: _city(a['h']) for a in alerts}
    words = {a['id']: _place_words(a['h']) - _place_words(city[a['id']]) - {'אביב', 'ראשון', 'לציון', 'יפו', 'ראשלצ'}
             for a in alerts}
    def same(i, j):
        common = words[i] & words[j]
        if not city[i] or city[i] != city[j] or not (common - _WEAK or len(common) >= 2):
            return False
        if not any(x0 < y1 and y0 < x1 for x0, x1 in per[i] for y0, y1 in per[j]):
            return False
        if pos[i] and pos[j]:
            return min(AR.meters(p, q) for p in pos[i] for q in pos[j]) <= 400
        return not (pos[i] or pos[j])
    # כל הודעה בקבוצה דומה לכל האחרות, לא רק לאחת מהן — אחרת עבודות ברחובות סמוכים בתל אביב
    # נשרשרות לקבוצה אחת ענקית (קרליבך ← המלך ג'ורג' ← דיזנגוף ← …)
    groups = []
    for a in sorted(alerts, key=lambda x: (x['s'] or '', x['id'])):
        for g in groups:
            if all(same(a['id'], m) for m in g):
                g.append(a['id'])
                break
        else:
            groups.append([a['id']])
    groups = {g[0]: g for g in groups}
    n = 0
    by_id = {a['id']: a for a in alerts}
    for members in groups.values():
        if len(members) > 1:
            g = min(members)
            for i in members:
                by_id[i]['grp'] = g
            n += 1
    return n


def load_rc(a):
    """מפת השינויים של ההתראה — וגם של הודעות שאוחדו לתוכה (קווים שאין במפה שלה)."""
    out = None
    for i in a.get('rcs') or ([a['id']] if a.get('map') else []):
        try:
            rc = json.load(open(f'{OUT}/rc/{i}.json'))
        except Exception:
            continue
        if out is None:
            out = rc
            continue
        have = {r.get('rd') for r in out['routes']}
        out['routes'] += [r for r in rc['routes'] if r.get('rd') not in have]
        out['stops'] = {**rc.get('stops', {}), **out.get('stops', {})}
    return out


def temp_map(rc):
    """מפה קטנה לכל קו בהתראה, לארכיון של הקו בזמן (שלמה 19.10): השרטוט רק סביב השינוי (כ-1.5 ק"מ לכל
    צד), אינדקס הקטע שנסגר, המסלול המשוער ותחנות שבוטלו/נוספו — [lat, lon, מק"ט, שם]."""
    stops = rc.get('stops') or {}
    out = []
    for r in rc.get('routes') or []:
        sh = r.get('shape') or []
        if len(sh) < 2:
            continue
        near = lambda q: min(range(len(sh)), key=lambda i: AR.meters(sh[i], q))   # noqa: E731
        x = [stops[s] for s in r.get('del') or [] if s in stops]
        a = [stops[s] for s, add in r.get('seq') or [] if add and s in stops]
        est = (r.get('est') or {}).get('path')
        idx = [near(q[:2]) for q in x]
        c = [min(idx), max(idx)] if idx else None
        # תחנת המוצא או הסוף בוטלה — הקטע עד התחנה הראשונה (או מהאחרונה) שנשארה, כמו בהקו המודיע
        kept = [near(stops[s][:2]) for s, add in r.get('seq') or [] if not add and s in stops]
        if c and kept and not est:
            if c[1] < min(kept):
                c = [0, min(kept)]
            elif c[0] > max(kept):
                c = [max(kept), len(sh) - 1]
        if est:
            c0 = near(est[0])
            c = [c0, max(c0, near(est[-1]))]
        lo, hi = (c[0], c[1]) if c else (near((a or x or [sh[0]])[0][:2]),) * 2
        acc = 0
        while lo > 0 and acc < 1500:
            acc += AR.meters(sh[lo], sh[lo - 1])
            lo -= 1
        acc = 0
        while hi < len(sh) - 1 and acc < 1500:
            acc += AR.meters(sh[hi], sh[hi + 1])
            hi += 1
        out.append({'rd': r.get('rd'), 'sh': sh[lo:hi + 1], 'c': [c[0] - lo, c[1] - lo] if c else None,
                    'est': est, 'x': x, 'a': a})
    return out


def archive_temp(alerts, now_ts, merged=()):
    """הקו בזמן שומר רק שינויים שהיו: התראה נכנסת לארכיון של הקו כשהיא כבר התחילה, ומתעדכנת
    כל עוד היא בפיד (תאריכים, נוסח). קובץ לכל מק"ט: {'ev': [...]}, ובכל אירוע rds — הכיוונים
    והחלופות שההתראה חלה עליהם, או None כשההודעה מציינת רק את הקו."""
    from zoneinfo import ZoneInfo
    tz = ZoneInfo('Asia/Jerusalem')
    os.makedirs(f'{TEMP_DIR}-map', exist_ok=True)
    by_mk = {}
    for a in alerts:
        st = iso_ts(a.get('s'))
        if not st or st > now_ts or not a.get('lines'):
            continue
        groups = {}
        for _, rd, *_ in a['lines']:
            rd = str(rd or '')
            mk = rd.split('-')[0]
            if not mk.isdigit():
                continue
            g = groups.setdefault(mk, set())
            g.add(rd if '-' in rd else None)
        # מפת השינוי נשמרת לצד הארכיון, כי rc/<id>.json נמחק כשההתראה יורדת מהפיד
        has_m = False
        if a.get('map'):
            try:
                tm = temp_map(load_rc(a))
            except Exception:
                tm = []
            if tm:
                f = f'{TEMP_DIR}-map/{a["id"]}.json'
                body = json.dumps({'r': tm}, ensure_ascii=False, separators=(',', ':'))
                if not os.path.exists(f) or open(f).read() != body:
                    open(f, 'w').write(body)
                has_m = True
            elif os.path.exists(f'{TEMP_DIR}-map/{a["id"]}.json'):
                has_m = True
        for mk, rds in groups.items():
            by_mk.setdefault(mk, []).append({
                'id': a['id'], 'd': datetime.datetime.fromtimestamp(st, tz).date().isoformat(),
                's': a.get('s'), 'e': a.get('e'), 'c': a.get('cause'), 'cl': CAUSE_LABEL.get(a.get('cause'), '') if a.get('cause') != 'other' else '',
                'h': a.get('h'), 'd2': a.get('d'), 'rm': a.get('rm') or [], 'add': a.get('add') or [], 'k': a.get('kind'),
                'rds': None if None in rds else sorted(rds), **({'m': 1} if has_m else {})})
    os.makedirs(TEMP_DIR, exist_ok=True)
    n = 0
    for mk, evs in by_mk.items():
        f = f'{TEMP_DIR}/{mk}.json'
        try:
            old = json.load(open(f)).get('ev') or []
        except Exception:
            old = []
        cur = {e['id']: e for e in old if e['id'] not in merged}
        changed = len(cur) != len(old)
        for e in evs:
            if cur.get(e['id']) != e:
                cur[e['id']] = e
                changed = True
        if changed:
            json.dump({'ev': sorted(cur.values(), key=lambda e: (e['d'], e['id']))}, open(f, 'w'),
                      ensure_ascii=False, separators=(',', ':'))
            n += 1
    # רשימת המק"טים שיש להם שינוי זמני — לקטגוריה "שינוי זמני" בחיפוש של הקו בזמן (שלמה 20.10)
    mks = sorted(os.path.basename(f)[:-5] for f in glob.glob(f'{TEMP_DIR}/*.json') if not f.endswith('/index.json'))
    json.dump(mks, open(f'{TEMP_DIR}/index.json', 'w'), separators=(',', ':'))
    print(f'הארכיון של הקו בזמן: {n} קבצי קו עודכנו ({len(by_mk)} קווים עם שינוי זמני שהתחיל)')


# ------------------------------------------------------------------ main
def drop_rc(f):
    try:
        os.remove(f)
    except FileNotFoundError:
        pass


def main():
    os.makedirs(f'{OUT}/rc', exist_ok=True)
    try:
        state = json.load(open(f'{OUT}/state.json'))
    except Exception:
        state = {}
    data = get_json(f'{SRC}/api/all_alerts')
    if not data or 'alerts' not in data:
        raise SystemExit('לא התקבלו התראות מ-bus-alerts.com')
    raw = [a for a in data['alerts'] if not a.get('is_deleted') and not a.get('is_expired')]
    # הקרובות קודם: כשנגמר הזמן, מה שנשאר לעדכון הבא הוא ההודעות הרחוקות
    raw.sort(key=lambda a: str(a.get('first_start_time') or ''))
    print(f'התראות: {len(raw)} (מתוך {len(data["alerts"])})')
    stops = None
    alerts, by_rd, report = [], {}, {'causes': {}, 'route': {}, 'kinds': {}}
    seen = set()
    for a in raw:
        aid = str(a['id'])
        seen.add(aid)
        he = lambda o: (o or {}).get('he') or ''   # noqa: E731
        h = hashlib.sha1(json.dumps([a.get('header'), a.get('description'), a.get('active_periods'),
                                     a.get('added_stop_ids'), a.get('removed_stop_ids'), a.get('relevant_route_ids')],
                                    ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:12]
        cause = cause_of(he(a.get('header')), he(a.get('description')))
        st = state.get(aid) or {}
        lines = []
        for ag, pks in (a.get('relevant_lines') or {}).items():
            for pk in pks:
                num, _, mk = str(pk).partition('_')
                lines.append([num, mk])
        has_map = a.get('use_case') in (5, 6, 7, 9) and not a.get('is_national') and (a.get('removed_stop_ids') or a.get('added_stop_ids'))
        # בלי תחנות משויכות, אבל בנוסח יש קו ותחנה מבוטלת — המפה מהקו בזמן (history_rc)
        if not has_map and a.get('use_case') in (5, 6, 7, 9) and not a.get('is_national') and any(mk for _, mk in lines):
            has_map = any(p.get('rm') for p in AR.parse(he(a.get('description'))))
        rc_file = f'{OUT}/rc/{aid}.json'
        # נמשך שוב: התראה חדשה או שהשתנתה, מפה שלא נשמרה, חישוב שלא הסתיים (נגמר הזמן / מפת הרחובות
        # לא ענתה) — אחרת הוא נשאר כך עד שנוסח ההודעה ישתנה — ו"לא נמצא" אחרי שקריאת הנוסח השתפרה
        # (כל התראה עם מפה, גם כשחלק מהקווים כבר קיבלו מסלול — אילת 19.10: 3 מתוך 11 נשארו מגרסה ישנה)
        # (fetch / gtfs — משיכת המסלולים או קובץ התחנות נכשלו בריצה הקודמת)
        redo = (st.get('status') in ('osm', 'time', 'fetch', 'gtfs')
                or (st.get('map') and st.get('pv') != PARSE_V and not PARSE_LOCK))
        if has_map and (st.get('h') != h or not os.path.exists(rc_file) or redo) and left() > 60:
            rc = get_json(f'{SRC}/api/get_route_changes?id={urllib.parse.quote(aid)}')
            time.sleep(2)
            if not (rc and rc.get('route_changes')) and os.path.isdir(LINES_DIR):
                if stops is None:
                    stops = stop_names()
                rc = history_rc(a, lines, he(a.get('description')), stops) or rc
            if rc and rc.get('route_changes') and stops is None:
                stops = stop_names()
            if rc and rc.get('route_changes') and not stops:
                # קובץ התחנות לא נמשך (S3 לא ענה) — לא שומרים מפה בלי שמות ומק"טים. המפה הקודמת נשארת,
                # ונמשך שוב בריצה הבאה
                print(f'::warning::הקו המודיע: GTFS לא נמשך — ההתראה {aid} לא חושבה מחדש', file=sys.stderr)
                st = dict(st, status='gtfs') if os.path.exists(rc_file) else \
                    {'h': h, 'map': False, 'status': 'gtfs', 'first': st.get('first') or datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='minutes')}
            elif rc and rc.get('route_changes'):
                rmset = set(a.get('removed_stop_ids') or [])
                routes = []
                used = set()
                for ag, per_line in rc['route_changes'].items():
                    for pk, chs in per_line.items():
                        for c in chs:
                            if not c.get('shape'):
                                continue
                            shape = [[round(p[1], 6), round(p[0], 6)] for p in c['shape']]
                            seq = c.get('updated_stop_sequence') or []
                            dele = c.get('deleted_stop_ids') or []
                            # הקטע המבוטל על השרטוט: מהתחנה המבוטלת הראשונה עד האחרונה. תחנות חלופיות רק
                            # כשאין מבוטלות — הן ברחובות העקיפה, ועל השרטוט הן יכולות ליפול הרבה לפני הצומת
                            sfm = rc.get('stops_for_map') or {}
                            touched = [s for s in dele if s in sfm] or [s for s, add in seq if add and s in sfm]
                            # אתר המקור לא שייך את התחנה המבוטלת לקו (נס ציונה 19.10: "דרך יצחק רבין/תרמ"ג",
                            # קווים 313, 330) — תחנה מבוטלת של ההתראה שנמצאת על השרטוט של הקו
                            if not touched:
                                for s in sorted(rmset):
                                    q = pos_of(s, sfm)
                                    if q and min(AR.meters(p, q) for p in shape) < 60:
                                        touched.append(s)
                                dele = dele + [s for s in touched if s not in dele]
                            cut = None
                            if touched:
                                # אתר המקור מצמיד לכל קו את כל התחנות שבפסקה, גם תחנה ברחוב אחר שהקו לא עובר
                                # בו (קריית שמונה 20.10, "האצ"ל ג" 120 מ' מקו 5) — היא "נפלה" על סוף הלולאה,
                                # והקטע הסגור יצא כמעט כל הקו. תחנה רחוקה מהשרטוט לא קובעת את הקטע
                                pts = [pos_of(s, sfm) for s in touched]
                                on = [q for q in pts if q and min(AR.meters(p, q) for p in shape) < 60]
                                cut = AR.cut_range(shape, on or pts)
                            used.update(s for s, _ in seq)
                            used.update(dele)
                            routes.append({'num': c.get('line_number'), 'rd': c.get('route_desc'), 'rid': c.get('route_id'), 'to': c.get('to_text'),
                                           'ag': c.get('agency_name'), 'dir': c.get('dir_name'), 'alt': c.get('alt_name'),
                                           'shape': shape, 'seq': seq, 'del': dele, 'cut': cut})
                status = estimate_routes(a, routes, stops) if left() > 120 else 'time'
                if status == 'time':
                    for r in routes:
                        r['est'], r['why'] = None, 'time'
                sfm = rc.get('stops_for_map') or {}
                out_stops = {}
                for s in used:
                    q = pos_of(s, sfm)
                    if q:
                        code, name = (stops or {}).get(s, ('', ''))
                        out_stops[s] = [round(q[0], 6), round(q[1], 6), code, name]
                # תחנות חלופיות שכתובות רק בנוסח: לפי המק"ט ב-GTFS, אם לא כבר על המפה כתחנה חלופית
                have = {x for r in routes for x, add in r['seq'] if add}
                by_code = {v[0]: k for k, v in (stops or {}).items()}
                # וגם תחנות חלופיות של ההודעה שאתר המקור לא שייך לאף קו (תחנת מוצא חדשה, קו 126)
                xadd = [by_code[c] for c in text_new_stops(he(a.get('description'))) if c in by_code] + list(a.get('added_stop_ids') or [])
                xadd = list(dict.fromkeys(xadd))
                # (גם תחנה שכבר במסלול הקבוע של הקו — ויצמן/פנקס: התחנה "החדשה" 25898 היא תחנה קיימת)
                xadd = [x for x in xadd if x not in have and STOP_POS.get(x)]
                for x in xadd:
                    if x not in out_stops:
                        q = STOP_POS[x]
                        out_stops[x] = [round(q[0], 6), round(q[1], 6), *(stops or {}).get(x, ('', ''))]
                # תחנות חלופיות שבנוסח, לכל קו לפי הפסקה שלו — בלי תחנה שמבוטלת בקו הזה או שכבר מסומנת בו
                # (פסקה בלי רשימה משלה — התחנות של ההודעה, חוץ מאלה שרשומות בפסקה של קווים אחרים)
                listed = set().union(*(p.get('add', set()) for p in AR.parse(he(a.get('description')))))
                for r in routes:
                    if '_xa' not in r:
                        continue
                    xa = r.pop('_xa')
                    mine = {x for x, add in r['seq'] if add} | set(r['del'])
                    if xa is None:
                        r['xadd'] = [x for x in xadd if (stops or {}).get(x, ('',))[0] not in listed and x not in mine]
                    else:
                        r['xadd'] = [by_code[c] for c in xa if c in by_code and by_code[c] not in mine
                                     and STOP_POS.get(by_code[c])]
                    for x in r['xadd']:
                        if x not in out_stops:
                            q = STOP_POS[x]
                            out_stops[x] = [round(q[0], 6), round(q[1], 6), *(stops or {}).get(x, ('', ''))]
                for r in routes:
                    full = r.pop('shape')
                    r['shape'] = AR.simplify([tuple(p) for p in full], 4.0)
                    r['shape'] = [[p[0], p[1]] for p in r['shape']]
                    r.pop('cut', None)
                tpl = a.pop('_tpl', None)
                json.dump({'id': aid, 'routes': routes, 'stops': out_stops, 'status': status, 'tpl': tpl, 'xadd': xadd},
                          open(rc_file, 'w'), ensure_ascii=False, separators=(',', ':'))
                st = {'h': h, 'map': True, 'status': status, 'pv': PARSE_V, 'first': st.get('first') or datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='minutes')}
            elif rc is None and st.get('h') == h and os.path.exists(rc_file):
                # המשיכה נכשלה, הנוסח לא השתנה — המפה הקודמת נשארת, ונמשך שוב בריצה הבאה
                st = dict(st, status='fetch')
            else:
                # אין מפה לנוסח הזה (או שהמשיכה נכשלה אחרי שהנוסח השתנה) — מפה ישנה לא נשארת
                drop_rc(rc_file)
                st = {'h': h, 'map': False, 'first': st.get('first') or datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='minutes')}
                if rc is None:
                    st['status'] = 'fetch'
        elif not has_map:
            drop_rc(rc_file)
            st = {'h': h, 'map': False, 'first': st.get('first') or datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='minutes')}
        state[aid] = st
        # הקווים ברשומה: מהמפה אם יש (מק"ט-כיוון-חלופה ויעד), אחרת מרשימת הקווים של ההתראה
        rlines = []
        if os.path.exists(rc_file):
            try:
                rcj = json.load(open(rc_file))
                for r in rcj['routes']:
                    rlines.append([r['num'], r['rd'], r['to'], bool(r.get('est'))])
                    if r.get('rd'):
                        by_rd.setdefault(r['rd'], []).append(aid)
            except Exception:
                pass
        if not rlines:
            rlines = [[n, mk, '', False] for n, mk in lines]
            # בלי מפה אין כיוון וחלופה — המפתח הוא המק"ט, והקו בזמן מחפש גם לפיו
            for n, mk in lines:
                if mk:
                    by_rd.setdefault(str(mk), []).append(aid)
        # קווים שכתובים בנוסח וחסרים ברשימה (בלי מק"ט — לחיפוש)
        have = {str(x[0]) for x in rlines}
        rlines += [[n, '', '', False] for n in sorted(text_lines(he(a.get('description'))) - have)]
        dep = []
        for ag, per in (a.get('departure_changes') or {}).items():
            for pk, chs in per.items():
                for c in chs:
                    dep.append([c.get('line_number'), c.get('route_desc'), c.get('to_text'), c.get('added_hours') or [], c.get('removed_hours') or []])
                    if c.get('route_desc'):
                        by_rd.setdefault(c['route_desc'], []).append(aid)
        add_list = a.get('added_stops') or []
        if not add_list and os.path.exists(rc_file):
            try:
                rcj = json.load(open(rc_file))
                add_list = [[rcj['stops'][x][2], rcj['stops'][x][3]] for x in rcj.get('xadd') or [] if x in rcj['stops']]
            except Exception:
                pass
        kind = 'route' if os.path.exists(rc_file) else ('times' if dep else ('stops' if a.get('removed_stops') else 'info'))
        alerts.append({
            'id': aid, 'uc': a.get('use_case'), 'cause': cause, 'kind': kind,
            'h': he(a.get('header')), 'd': he(a.get('description')),
            's': a.get('first_start_time'), 'e': a.get('last_end_time'),
            'per': (a.get('active_periods') or {}).get('raw') or [],
            'nat': bool(a.get('is_national')),
            'ag': [x.get('agency_name') for x in (a.get('relevant_agencies') or [])],
            'lines': rlines, 'rm': a.get('removed_stops') or [], 'add': add_list,
            'dep': dep, 'map': os.path.exists(rc_file), 'first': st.get('first'),
        })
    alerts, merged = merge_dups(alerts)
    report['merged'] = len(merged)
    if stops is None:
        stops = stop_names()
    report['groups'] = group_alerts(alerts, stops)
    for k, ids in by_rd.items():
        by_rd[k] = [merged.get(i, i) for i in ids]
    # ניקוי: התראות שירדו מהפיד
    for aid in list(state):
        if aid not in seen:
            state.pop(aid, None)
            try:
                os.remove(f'{OUT}/rc/{aid}.json')
            except FileNotFoundError:
                pass
    alerts.sort(key=lambda x: (x['s'] or '', x['id']))
    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='minutes')
    json.dump({'gen': now, 'src': 'bus-alerts.com', 'causes': CAUSE_LABEL, 'alerts': alerts, 'alias': merged},
              open(f'{OUT}/alerts.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    json.dump({k: sorted(set(v)) for k, v in sorted(by_rd.items())}, open(f'{OUT}/by-rd.json', 'w'), separators=(',', ':'))
    json.dump(state, open(f'{OUT}/state.json', 'w'), separators=(',', ':'), sort_keys=True)
    report['gen'] = now
    report['n'] = len(alerts)
    # הסיכום לפי המצב הסופי (אחרי האיחוד והניקוי), לא רק מה שחושב בריצה הזו
    report['causes'], report['kinds'], report['route'], report['tpl'] = {}, {}, {}, {}
    for x in alerts:
        report['causes'][x['cause']] = report['causes'].get(x['cause'], 0) + 1
        report['kinds'][x['kind']] = report['kinds'].get(x['kind'], 0) + 1
    for f in glob.glob(f'{OUT}/rc/*.json'):
        try:
            rcj = json.load(open(f))
        except Exception:
            continue
        s, t = rcj.get('status') or '', rcj.get('tpl')
        report['route'][s] = report['route'].get(s, 0) + 1
        if t:
            report['tpl'].setdefault(t, {})
            report['tpl'][t][s] = report['tpl'][t].get(s, 0) + 1
    # התראות שהמפה שלהן לא חושבה מחדש בריצה הזו (משיכה / GTFS נכשלו) — ייבדקו שוב בריצה הבאה
    report['fail'] = {}
    for x in state.values():
        if x.get('status') in ('fetch', 'gtfs'):
            report['fail'][x['status']] = report['fail'].get(x['status'], 0) + 1
    # התראות שפג תוקפן ועוד לא נמחקו — כבר לא מוצגות בהקו המודיע, אבל קרו: גם הן לארכיון של הקו בזמן
    past = []
    he = lambda o: (o or {}).get('he') or ''   # noqa: E731
    for a in data['alerts']:
        if not a.get('is_expired') or a.get('is_deleted') or str(a['id']) in seen:
            continue
        lines = [[str(pk).partition('_')[0], str(pk).partition('_')[2], '', False]
                 for pks in (a.get('relevant_lines') or {}).values() for pk in pks]
        past.append({'id': str(a['id']), 'cause': cause_of(he(a.get('header')), he(a.get('description'))),
                     'kind': 'stops' if a.get('removed_stops') else 'info', 'h': he(a.get('header')), 'd': he(a.get('description')),
                     's': a.get('first_start_time'), 'e': a.get('last_end_time'), 'lines': lines,
                     'rm': a.get('removed_stops') or [], 'add': a.get('added_stops') or []})
    archive_temp(alerts + past, datetime.datetime.now(datetime.timezone.utc).timestamp(), merged)
    json.dump(report, open(f'{OUT}/report.json', 'w'), ensure_ascii=False, indent=1)
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
