"""בונה את world/demand.json של משחק האוטובוס: אזורים, תושבים ומקומות עבודה/לימודים/קניות ליד כל תחנה.

קלט (קיימים בריפו, בלי הורדה):
  world/osm_raw.json.gz — פלט Overpass (בניינים עם התגים שלהם, שימושי קרקע, מוסדות)
  world/city.json       — התחנות (אחרי build_city.py)
הרצה:  python3 tools/build_demand.py   (מתוך unreleased/bus-game)

השיטה (פשוטה ושקופה):
  1. כל בניין מקבל שטח רצפה = שטח × מספר קומות (גובה ÷ 3, כמו ב-build_city.py).
  2. סוג הבניין לפי OSM: בתוך אזור תעשייה ← עבודה; קניון/מסחר ← קניות ועבודה; בית ספר/גן ← לימודים ועבודה;
     עירייה/משטרה/דואר/מתנ"ס/תרבות ← עבודה ושונות; בסיס צבאי ← עבודה. כל השאר ← מגורים (רוב הבניינים מסומנים רק building=yes).
     מקומות עבודה בתעשייה נספרים בחצי (מחסנים גדולים, מעט עובדים למ"ר); לכל בית יש גם מעט עבודה, לימודים וקניות
     בשכונה (גנים ובתי ספר שלא מופו, מכולות).
  3. כל בניין שייך לתחנה הקרובה אליו (עד 900 מ'). התושבים: שטח המגורים מנורמל ל-RESIDENTS תושבים.
  4. האזורים: k-means על התחנות (לפי מיקום), K אזורים. שם האזור: לפי הרחוב שחוזר הכי הרבה בשמות התחנות שבו,
     או שם שנקבע ביד ב-NAMES (קניון, אזור תעשייה, מושב — לפי תחנה שבאזור).
פלט: zones [{id, name, x, y}], stops {id: [zone, pop, work, school, shop]} (עבודה/לימודים/קניות — מ"ר רצפה מעוגל)
"""
import gzip, json, math, os, hashlib, collections

HERE = os.path.dirname(os.path.abspath(__file__))
W = os.path.join(os.path.dirname(HERE), 'world')
raw = json.load(gzip.open(os.path.join(W, 'osm_raw.json.gz'), 'rt', encoding='utf-8'))
city = json.load(open(os.path.join(W, 'city.json'), encoding='utf-8'))
STOPS = city['stops']
RESIDENTS = 23000          # תושבים בתחום המפה (קריית מלאכי ~ 23–25 אלף; המושבים מסביב קטנים)
K = 14

LAT0, LON0 = city['meta']['origin']
KX = 111320 * math.cos(math.radians(LAT0)); KY = 110574
def P(lat, lon): return ((lon - LON0) * KX, (lat - LAT0) * KY)
HALF_X, HALF_Y = city['meta']['half']

def hval(s):
    try: return float(str(s).replace('m', '').split(';')[0].strip())
    except Exception: return None
def area(pts):
    a = 0
    for i in range(len(pts)):
        x0, y0 = pts[i]; x1, y1 = pts[(i + 1) % len(pts)]; a += x0 * y1 - x1 * y0
    return a / 2
def rnd(seed, lo, hi):
    h = int(hashlib.md5(str(seed).encode()).hexdigest()[:8], 16) / 0xffffffff
    return lo + (hi - lo) * h
def inpoly(x, y, poly):
    c = False; n = len(poly)
    for i in range(n):
        x0, y0 = poly[i]; x1, y1 = poly[(i + 1) % n]
        if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0) + x0: c = not c
    return c

# ---------- שטחים עם משמעות (פוליגונים)
ZONES_OSM = []     # (kind, poly, name)
KIND_OF = {('landuse', 'industrial'): 'work', ('landuse', 'retail'): 'shop', ('landuse', 'commercial'): 'shop',
           ('amenity', 'school'): 'school', ('amenity', 'kindergarten'): 'school', ('amenity', 'college'): 'school',
           ('landuse', 'military'): 'army', ('shop', 'mall'): 'shop'}
for e in raw['elements']:
    t = e.get('tags', {})
    if e['type'] != 'way' or 'geometry' not in e: continue
    g = [P(p['lat'], p['lon']) for p in e['geometry'] if p]
    for (k, v), kind in KIND_OF.items():
        if t.get(k) == v and len(g) >= 4:
            ZONES_OSM.append((kind, g, t.get('name'))); break

# ---------- בניינים
B = []   # (x, y, floor, kind)
for e in raw['elements']:
    t = e.get('tags', {})
    if e['type'] != 'way' or 'geometry' not in e or 'building' not in t or t.get('building') == 'no': continue
    ring = [P(p['lat'], p['lon']) for p in e['geometry'] if p]
    if len(ring) >= 2 and ring[0] == ring[-1]: ring = ring[:-1]
    if len(ring) < 3: continue
    cx = sum(p[0] for p in ring) / len(ring); cy = sum(p[1] for p in ring) / len(ring)
    if abs(cx) > HALF_X or abs(cy) > HALF_Y: continue
    a = abs(area(ring))
    if a < 8: continue
    b = t.get('building', 'yes'); eid = e['id']
    h = hval(t.get('height')); lv = hval(t.get('building:levels'))
    if h is None and lv is not None: h = lv * 3.0 + 1.0
    if h is None:   # אותם כללים כמו ב-build_city.py
        if b in ('house', 'detached', 'semidetached_house', 'terrace', 'bungalow'): h = rnd(eid, 5.5, 8)
        elif b in ('apartments', 'residential'): h = rnd(eid, 10, 19) if a > 250 else rnd(eid, 7, 11)
        elif b in ('garage', 'garages', 'shed', 'roof', 'carport', 'hut', 'kiosk', 'container'): h = rnd(eid, 2.6, 3.6)
        elif b in ('industrial', 'warehouse', 'retail', 'commercial', 'supermarket'): h = rnd(eid, 6, 10)
        elif b in ('school', 'public', 'civic', 'synagogue', 'kindergarten', 'hospital', 'office'): h = rnd(eid, 6, 11)
        else: h = rnd(eid, 6, 10) if a > 300 else rnd(eid, 3.5, 7)
    h = max(2.5, min(h, 60))
    if b in ('garage', 'garages', 'shed', 'roof', 'carport', 'hut', 'container', 'destroyed'): continue
    floor = a * max(1, round(h / 3))
    am = t.get('amenity')
    kind = 'home'
    if b in ('industrial', 'warehouse') or t.get('man_made') == 'works': kind = 'work'
    elif t.get('shop') or b in ('retail', 'commercial', 'supermarket') or am in ('fast_food', 'restaurant', 'cafe', 'ice_cream', 'marketplace'): kind = 'shop'
    elif b in ('school', 'kindergarten') or am in ('school', 'kindergarten', 'college'): kind = 'school'
    elif am in ('townhall', 'police', 'post_office', 'theatre', 'community_centre', 'library', 'clinic', 'doctors', 'bank') or t.get('office') or b in ('office', 'public', 'civic', 'hospital'): kind = 'civic'
    elif am == 'place_of_worship' or b == 'synagogue': kind = 'worship'
    else:
        for zk, poly, _ in ZONES_OSM:
            if inpoly(cx, cy, poly): kind = zk if zk != 'army' else 'work'; break
        # בניין גדול ונמוך בלי תג — כנראה מחסן/מפעל ולא בית
        if kind == 'home' and a > 1500 and h < 11: kind = 'work'
    B.append((cx, cy, floor, kind))
cnt = collections.Counter(k for *_, k in B)
print('buildings', len(B), dict(cnt))

# ---------- שיוך לתחנה הקרובה
N = len(STOPS)
acc = [{'home': 0.0, 'work': 0.0, 'school': 0.0, 'shop': 0.0, 'civic': 0.0, 'worship': 0.0} for _ in STOPS]
lost = 0
for x, y, f, k in B:
    best, bd = None, 900
    for i, s in enumerate(STOPS):
        d = math.hypot(s['x'] - x, s['y'] - y)
        if d < bd: bd, best = d, i
    if best is None: lost += f; continue
    acc[best][k] += f
home_tot = sum(a['home'] for a in acc)
print('floor area m2:', {k: round(sum(a[k] for a in acc)) for k in acc[0]}, 'far from stops:', round(lost))

# ---------- אזורים: k-means על התחנות, התחלה דטרמיניסטית (הנקודה הרחוקה ביותר)
pts = [(s['x'], s['y']) for s in STOPS]
mass = [1 + (a['home'] + a['work'] + a['shop'] + a['school']) / 20000 for a in acc]
cent = [max(range(N), key=lambda i: mass[i])]
while len(cent) < K:
    cent.append(max(range(N), key=lambda i: min(math.dist(pts[i], pts[c]) for c in cent)))
C = [pts[i] for i in cent]
for _ in range(60):
    lab = [min(range(K), key=lambda k: math.dist(p, C[k])) for p in pts]
    newC = []
    for k in range(K):
        m = [i for i in range(N) if lab[i] == k]
        wsum = sum(mass[i] for i in m) or 1
        newC.append((sum(pts[i][0] * mass[i] for i in m) / wsum, sum(pts[i][1] * mass[i] for i in m) / wsum) if m else C[k])
    if newC == C: break
    C = newC
lab = [min(range(K), key=lambda k: math.dist(p, C[k])) for p in pts]
used = sorted(set(lab)); remap = {k: i for i, k in enumerate(used)}
lab = [remap[k] for k in lab]; C = [C[k] for k in used]

# שמות: מקום מוכר מ-OSM בתוך האזור (קרוב למרכזו), אחרת הרחוב השכיח בשמות התחנות
NAMES = {     # תיקונים ידניים: מזהה תחנה באזור ← שם
    '44519': 'פארק התעשיות',
    '25755': 'שער העיר ואזור התעשייה',
    '48087': 'תימורים',
    '28093': 'וייצמן ובר יהודה',
    '42172': 'דרום העיר',
    '25749': 'שכונת האילן',
    '27212': 'מרכז העיר',
    '28183': 'ביג קסטינה',
    '27216': 'קניון הקריה',
    '42496': 'שכונת אריק שרון',
    '25954': 'באר טוביה',
    '12118': 'כפר ורבורג ואביגדור',
}
zones = []
for z in range(len(C)):
    mem = [i for i in range(N) if lab[i] == z]
    name = None
    for sid, nm in NAMES.items():
        if any(STOPS[i]['id'] == sid for i in mem): name = nm; break
    if not name:
        words = collections.Counter()
        for i in mem:
            for part in STOPS[i]['name'].replace(' / ', '/').split('/'):
                part = part.strip()
                if part: words[part] += 1
        top = words.most_common(1)[0][0]
        name = top
    pop = sum(acc[i]['home'] for i in mem) / home_tot * RESIDENTS
    zones.append({'id': z, 'name': name, 'x': round(C[z][0]), 'y': round(C[z][1]), 'n': len(mem), 'pop': round(pop)})
seen = collections.Counter(z['name'] for z in zones)
for z in zones:
    print(z['id'], z['name'], z['n'], 'stops, pop', z['pop'], [STOPS[i]['name'] for i in range(N) if lab[i] == z['id']][:4])
assert all(v == 1 for v in seen.values()), seen

stops = {}
for i, s in enumerate(STOPS):
    a = acc[i]
    pop = a['home'] / home_tot * RESIDENTS
    work = a['work'] * 0.5 + a['shop'] * 0.6 + a['school'] * 0.4 + a['civic'] + a['worship'] * 0.2 + a['home'] * 0.04
    stops[s['id']] = [lab[i], round(pop, 1), round(work), round(a['school'] + a['home'] * 0.03), round(a['shop'] + a['civic'] * 0.3 + a['home'] * 0.01)]
out = {'meta': {'residents': RESIDENTS, 'built_from': 'osm_raw.json.gz + city.json', 'tool': 'tools/build_demand.py'},
       'zones': [{k: z[k] for k in ('id', 'name', 'x', 'y')} for z in zones], 'stops': stops}
p = os.path.join(W, 'demand.json')
json.dump(out, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('->', p, os.path.getsize(p))
