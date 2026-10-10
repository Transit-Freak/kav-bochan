# -*- coding: utf-8 -*-
"""שתי בדיקות תחנות ל"התחנה הבאה" (שלמה 10.10):

1. nohs — תחנות שקווים מסתיימים בהן, ואף קו שמסתיים שם לא מקבל ממשרד התחבורה
   תחנת יעד לפרסום (trip_headsign ריק). נבדקות כל הנסיעות שבקובץ, גם עתידיות.
2. stype — תחנות שהסוג שלהן במאגר התחנות של המשרד (data.gov.il, bus_stops,
   השדה StationTypeName) לא מתאים למה שעוצר בהן לפי ה-GTFS: רכבת קלה בתחנה
   שרשומה כתחנת אוטובוס, תחנה במסוף שרשומה "תחנה רגילה", וכדומה.
   מסוף נקבע לפי המקום (יש שם מסוף או תחנה מרכזית), לא לפי קווים שמסתיימים בתחנה.

קלט (משתני סביבה): STOPS ROUTES TRIPS STOP_TIMES (קובצי GTFS),
BUS_STOPS (gis/data/mot/bus_stops.geojson), NBR (תיקיית השכונות),
POI (poi.json מענף osm-poi — מסופים ותחנות מרכזיות במפה), OUT.
"""
import csv, glob, gzip, json, math, os, re, collections, datetime

E = os.environ.get
STOPS = E('STOPS', 'stops.txt'); ROUTES = E('ROUTES', 'routes.txt'); TRIPS = E('TRIPS', 'trips.txt')
STOP_TIMES = E('STOP_TIMES', 'stop_times.txt')
BUS_STOPS = E('BUS_STOPS', 'gis/data/mot/bus_stops.geojson')
NBR = E('NBR', 'line-history/data/neighborhoods')
POI = E('POI', 'poi.json')
MIL = E('MIL', 'military.json')   # שטחים צבאיים מ-OSM (ענף osm-poi, fetch-osm-poi.yml)
OUT = E('OUT', 'next-station/stop-checks.json')

def rows(path):
    with open(path, encoding='utf-8-sig', newline='') as f:
        yield from csv.DictReader(f)

# route_type כמו ב-linehistory.py: 0 רכבת קלה, 2 רכבת, 5 רכבל/כרמלית, 8 מונית שירות, 715 לפי דרישה, אחרת אוטובוס
MODE = {'0': 'lr', '2': 'rail', '5': 'cable', '8': 'taxi', '715': 'demand'}
routes = {}
for r in rows(ROUTES):
    routes[r['route_id']] = {'line': r['route_short_name'].strip(), 'rd': r['route_desc'].strip(),
                             'mode': MODE.get(r['route_type'].strip(), 'bus')}

# נסיעה מייצגת לכל (קו, שרטוט, שלט) — מספיקה כדי לדעת איפה הקו עוצר ואיפה הוא מסתיים
rep = {}
for r in rows(TRIPS):
    if r['route_id'] not in routes: continue
    k = (r['route_id'], r.get('shape_id', ''), (r.get('trip_headsign') or '').strip())
    if k not in rep or r['trip_id'] < rep[k]: rep[k] = r['trip_id']
want = {t: k for k, t in rep.items()}

seqs = collections.defaultdict(list)   # trip_id -> [(seq, stop_id, pickup)]
for r in rows(STOP_TIMES):
    t = r['trip_id']
    if t in want:
        seqs[t].append((int(r['stop_sequence']), r['stop_id'], (r.get('pickup_type') or '0').strip() or '0'))

stops = {}
for r in rows(STOPS):
    city = ''
    d = r.get('stop_desc') or ''
    if 'עיר:' in d: city = d.split('עיר:')[1].split('רציף:')[0].strip()
    stops[r['stop_id']] = {'c': r['stop_code'].strip(), 'n': r['stop_name'].strip(), 't': city,
                           'la': round(float(r['stop_lat']), 6), 'lo': round(float(r['stop_lon']), 6)}

# הכול לפי מספר התחנה (stop_code): לתחנה אחת יכולים להיות כמה stop_id — רציף לכל קו
# במסופים ובתחנות מרכזיות — ומספר התחנה הוא מה שמופיע במאגר של המשרד ובשלט.
serve = collections.defaultdict(lambda: {'modes': set(), 'lines': {}, 'ends': 0, 'starts': 0, 'board': 0, 'hs': collections.Counter(), 'sid': None, 'endln': set()})
def code(sid): return stops[sid]['c'] if sid in stops else None
for t, sq in seqs.items():
    sq.sort()
    sq = [x for x in sq if x[1] in stops]
    if len(sq) < 2: continue
    rid, _sh, hs = want[t]
    ro = routes[rid]
    for i, (_s, sid, pick) in enumerate(sq):
        v = serve[code(sid)]
        v['sid'] = v['sid'] or sid
        v['modes'].add(ro['mode'])
        v['lines'].setdefault(ro['line'] or ro['rd'], ro['mode'])
        if i < len(sq) - 1 and pick != '1': v['board'] += 1
    serve[code(sq[0][1])]['starts'] += 1
    end = serve[code(sq[-1][1])]
    end['ends'] += 1
    end['hs'][hs] += 1
    end['endln'].add(ro['line'] or ro['rd'])

# מאגר התחנות של המשרד — סוג התחנה לפי מספר תחנה
mot = {}
if os.path.exists(BUS_STOPS):
    for ft in json.load(open(BUS_STOPS, encoding='utf-8'))['features']:
        p = ft['properties']
        mot[str(p.get('StationId'))] = (p.get('StationTypeName') or '').strip()

# שכונות (GovMap) — לתחנות בלי שלט: הצעה לשם יעד לפי השכונה
NB = []
for g in sorted(glob.glob(os.path.join(NBR, '*.json.gz'))):
    NB += json.loads(gzip.decompress(open(g, 'rb').read()))
def _in(x, y, ring):
    c = False
    for i in range(len(ring)):
        x1, y1 = ring[i]; x2, y2 = ring[i - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: c = not c
    return c
def hood(lo, la):
    for _id, name, _city, bb, polys in NB:
        if not (bb[0] <= lo <= bb[2] and bb[1] <= la <= bb[3]): continue
        for poly in polys:
            if _in(lo, la, poly[0]) and not any(_in(lo, la, h) for h in poly[1:]): return name.strip()
    return ''

def base(c):
    v = serve[c]; s = stops[v['sid']]
    return {'c': s['c'], 'n': s['n'], 't': s['t'], 'la': s['la'], 'lo': s['lo'],
            'typ': mot.get(s['c'], ''), 'ln': sorted(v['lines'], key=lambda x: (len(x), x))[:12]}

# ---- 1. תחנות סיום בלי תחנת יעד לפרסום ----
nohs = []
for c, v in serve.items():
    if not v['ends']: continue
    if any(h for h in v['hs']): continue
    e = base(c)
    e['hood'] = hood(e['lo'], e['la'])
    e['end'] = sorted(v['endln'], key=lambda x: (len(x), x))   # הקווים שמסתיימים כאן בלי שלט
    nohs.append(e)
nohs.sort(key=lambda e: (e['t'], e['n']))

# ---- 2. סוג תחנה לא מתאים ----
def is_lr(typ): return typ.startswith('רכבת קלה')        # כולל "רכבת קלה - רציפים"
def is_rail(typ): return typ.startswith('רכבת ישראל')     # כולל "רכבת ישראל - רציפים"
# תחנה במסוף: השם אומר מסוף/תחנה מרכזית, או שבמפה (OSM, amenity=bus_station) יש מסוף עד 40 מ' ממנה
TERM_NAME = re.compile(r"מסוף|ת\.\s?מרכזית|תחנה מרכזית|מרכזית רציפים")
BUSST = []
if os.path.exists(POI):
    BUSST = [(p['la'], p['lo'], p['n']) for p in json.load(open(POI, encoding='utf-8')).get('poi', []) if p.get('k') == 'busstation']
def busst_near(la, lo, m=40):
    for pla, plo, pn in BUSST:
        if abs(pla - la) < 0.001 and abs(plo - lo) < 0.001 and ((pla - la) * 111320) ** 2 + ((plo - lo) * 94000) ** 2 <= m * m:
            return pn
    return ''
OPER = {'תחנה תפעולית', 'תחנת התרעננות'}
def check(typ, v, s):
    m = v['modes']
    if 'lr' in m and not is_lr(typ):
        return 'lr', 'הרכבת הקלה עוצרת כאן'
    if is_lr(typ) and 'lr' not in m:
        return 'lr_no', 'רשומה כתחנת רכבת קלה, אבל הרכבת הקלה לא עוצרת בה'
    if 'rail' in m and not is_rail(typ):
        return 'rail', 'רכבת ישראל עוצרת כאן'
    if is_rail(typ) and 'rail' not in m:
        return 'rail_no', 'רשומה כתחנת רכבת ישראל, אבל הרכבת לא עוצרת בה'
    if 'cable' in m and typ != 'רכבל':
        return 'cable', 'רכבל או כרמלית עוצרים כאן'
    if typ == 'רכבל' and 'cable' not in m:
        return 'cable_no', 'רשומה כתחנת רכבל, אבל הרכבל לא עוצר בה'
    if typ == 'מוניות שירות' and 'bus' in m:
        return 'taxi', 'רשומה כתחנת מוניות שירות, אבל אוטובוסים עוצרים בה'
    if typ == 'תחנה רגילה':
        if TERM_NAME.search(s['n']):
            return 'term', 'בשם התחנה כתוב שהיא במסוף, אבל היא רשומה כתחנה רגילה'
        bn = busst_near(s['la'], s['lo'])
        if bn:
            return 'term', 'במפה (OpenStreetMap) יש כאן מסוף («' + bn + '»), אבל התחנה רשומה כתחנה רגילה'
    if typ in OPER and v['board']:
        return 'oper', 'רשומה כתחנה שאין בה עלייה של נוסעים, אבל לפי לוח הזמנים נוסעים עולים בה'
    return None

stype = []
missing = 0
for c, v in serve.items():
    if c not in mot:
        missing += 1
        continue
    r = check(mot[c], v, stops[v['sid']])
    if r:
        e = base(c); e['sub'], e['why'] = r
        stype.append(e)
stype.sort(key=lambda e: (e['sub'], e['t'], e['n']))

# ---- "גבול מחנה צבאי" בלי שטח צבאי במפה (שלמה 10.10) ----
# כל התחנות מהסוג הזה ב-GTFS, גם כאלה שאף קו לא עוצר בהן (בסיס שנסגר או עבר). בסיסים רבים
# לא ממופים ב-OSM בכוונה, ולכן זו הצעה לבדיקה ולא קביעה. רצה רק כשקובץ השטחים נראה שלם.
MIL_M = 300
areas = []
if os.path.exists(MIL):
    try: areas = json.load(open(MIL, encoding='utf-8')).get('areas') or []
    except Exception: areas = []
def _seg_d(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = 0 if dx == dy == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))
def near_military(la, lo):
    kx, ky = 111320 * math.cos(math.radians(la)), 111320
    px, py = lo * kx, la * ky
    pad = MIL_M / 90000
    for a in areas:
        bb = a['bb']
        if lo < bb[0] - pad or lo > bb[2] + pad or la < bb[1] - pad or la > bb[3] + pad: continue
        for r in a['r']:
            if len(r) == 1:
                if math.hypot(r[0][0] * kx - px, r[0][1] * ky - py) <= MIL_M: return True
                continue
            if r[0] == r[-1] and _in(lo, la, r): return True
            for i in range(1, len(r)):
                if _seg_d(px, py, r[i-1][0] * kx, r[i-1][1] * ky, r[i][0] * kx, r[i][1] * ky) <= MIL_M: return True
    return False
if len(areas) >= 50:
    by_code = {}
    for sid, st in stops.items(): by_code.setdefault(st['c'], st)
    for c, typ in mot.items():
        if typ != 'גבול מחנה צבאי' or c not in by_code: continue
        st = by_code[c]
        if near_military(st['la'], st['lo']): continue
        v = serve.get(c)
        ln = sorted(v['lines'], key=lambda x: (len(x), x))[:12] if v else []
        stype.append({'c': c, 'n': st['n'], 't': st['t'], 'la': st['la'], 'lo': st['lo'], 'typ': typ, 'ln': ln, 'sub': 'mil',
                      'why': "רשומה כגבול מחנה צבאי, אבל במפה (OpenStreetMap) אין שטח צבאי עד 300 מ' ממנה"
                             + ('' if ln else ' · אף קו לא עוצר בה היום')})
    stype.sort(key=lambda e: (e['sub'], e['t'], e['n']))

out = {'gen': datetime.date.today().isoformat(), 'stops': len(serve),
       'nohs': nohs, 'stype': stype, 'notInMot': missing,
       'counts': {'nohs': len(nohs), 'stype': len(stype),
                  'sub': dict(collections.Counter(e['sub'] for e in stype))}}
os.makedirs(os.path.dirname(OUT) or '.', exist_ok=True)
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('stop checks:', json.dumps(out['counts'], ensure_ascii=False), 'not in MOT stops db:', missing)
