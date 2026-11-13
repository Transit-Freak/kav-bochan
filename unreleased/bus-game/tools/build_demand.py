"""בונה את world/demand.json של משחק האוטובוס: שכונות (עם הגבולות שלהן), תושבים ומקומות עבודה/לימודים/קניות ליד כל תחנה.

קלט (קיימים בריפו, בלי הורדה):
  world/osm_raw.json.gz      — פלט Overpass (בניינים עם התגים שלהם, שימושי קרקע, מוסדות, שטחי המושבים)
  world/neighbourhoods.json  — גבולות השכונות של קריית מלאכי: שכבה 22 של GovMap (מפ"י), דרך "גרסאות לעם" (over.org.il),
                               תמונת מצב ספטמבר 2026 — אותם נתונים כמו בכלי "קו בזמן" (line-history/data/neighborhoods)
  world/city.json            — התחנות (אחרי build_city.py)
הרצה:  python3 tools/build_demand.py   (מתוך unreleased/bus-game; צריך shapely: pip install shapely)

השיטה (פשוטה ושקופה):
  1. כל בניין מקבל שטח רצפה = שטח × מספר קומות (גובה ÷ 3, כמו ב-build_city.py), וסוג לפי OSM:
     בתוך אזור תעשייה ← עבודה; קניון/מסחר ← קניות ועבודה; בית ספר/גן ← לימודים ועבודה;
     עירייה/משטרה/דואר/מתנ"ס/תרבות ← עבודה ושונות; בסיס צבאי ← עבודה. כל השאר ← מגורים (רוב הבניינים מסומנים רק building=yes).
     מקומות עבודה בתעשייה נספרים בחצי; לכל בית יש גם מעט עבודה, לימודים וקניות בשכונה.
  2. כל בניין שייך לתחנה הקרובה אליו (עד 900 מ'). התושבים: שטח המגורים מנורמל ל-RESIDENTS תושבים.
  3. השכונות (האזורים): 16 השכונות של קריית מלאכי מ-GovMap, וכל מושב מסביב (שטח המגורים שלו ב-OSM) — רק מה שיש בו תחנה.
     תחנה בתוך שכונה ← השכונה (אם בתוך שתיים — הקטנה). אחרת: בתוך מושב ← המושב; עד 150 מ' משכונה ← השכונה הקרובה;
     עד 400 מ' ממושב ← המושב; אחרת — השכונה של התחנה הקרובה. שכונה או מושב בלי תחנה — לא אזור (גם לא מצויר).
  4. לכל שכונה סמל משלה (sym — שם צורה, הציור ב-js/demandview.js). הגדולות מקבלות את הצורות הברורות,
     ושכנות לא מקבלות צורות דומות (עיגול/משושה, משולש/חץ...).
פלט: zones [{id, name, x, y, sym, kind, poly}] (x, y — נקודה בתוך השטח לסמל ולשם; kind — hood/village;
     poly — טבעות במטרים, החיצונית ואחריה החורים, לכל חלק: [[טבעת], [חור]...]),
     stops {id: [zone, pop, work, school, shop]} (עבודה/לימודים/קניות — מ"ר רצפה מעוגל)
"""
import gzip, json, math, os, hashlib, collections
from shapely.geometry import Point, Polygon, MultiPolygon, box
from shapely.ops import polylabel

HERE = os.path.dirname(os.path.abspath(__file__))
W = os.path.join(os.path.dirname(HERE), 'world')
raw = json.load(gzip.open(os.path.join(W, 'osm_raw.json.gz'), 'rt', encoding='utf-8'))
city = json.load(open(os.path.join(W, 'city.json'), encoding='utf-8'))
NB = json.load(open(os.path.join(W, 'neighbourhoods.json'), encoding='utf-8'))
STOPS = city['stops']
RESIDENTS = 23000          # תושבים בתחום המפה (קריית מלאכי ~ 23–25 אלף; המושבים מסביב קטנים)
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


# ---------- השכונות: GovMap (קריית מלאכי) + המושבים מסביב (OSM)
VIEW = box(-HALF_X, -HALF_Y, HALF_X, HALF_Y)
def PL(lon, lat): return P(lat, lon)
H = []      # {name, kind, geom}
for nid, name, town, bbox, mp in NB['rows']:
    g = MultiPolygon([Polygon([PL(*q) for q in poly[0]], [[PL(*q) for q in h] for h in poly[1:]]) for poly in mp]).buffer(0)
    H.append({'name': name, 'kind': 'hood', 'geom': g})
for e in raw['elements']:
    t = e.get('tags', {})
    if e['type'] == 'way' and t.get('landuse') == 'residential' and t.get('name') and 'geometry' in e:
        g = Polygon([P(q['lat'], q['lon']) for q in e['geometry']]).buffer(0)
        if g.intersects(VIEW): H.append({'name': t.get('name:he') or t['name'], 'kind': 'village', 'geom': g})
hoods = [i for i, h in enumerate(H) if h['kind'] == 'hood']; vill = [i for i, h in enumerate(H) if h['kind'] == 'village']
def assign(s):
    pt = Point(s['x'], s['y'])
    inside = [i for i in range(len(H)) if H[i]['geom'].contains(pt)]
    ih = [i for i in inside if H[i]['kind'] == 'hood']
    if ih: return min(ih, key=lambda i: H[i]['geom'].area), 'in'
    if inside: return min(inside, key=lambda i: H[i]['geom'].area), 'in'
    dh = min(hoods, key=lambda i: H[i]['geom'].distance(pt))
    if H[dh]['geom'].distance(pt) <= 150: return dh, 'near'
    dv = min(vill, key=lambda i: H[i]['geom'].distance(pt))
    if H[dv]['geom'].distance(pt) <= 400: return dv, 'near'
    return dh, 'far'
lab0, how, hw = [], collections.Counter(), []
for s in STOPS:
    i, w = assign(s); lab0.append(i); hw.append(w); how[w] += 1
# רחוק מהכל ← השכונה של התחנה הקרובה שכבר שויכה (כך שתי תחנות של אותו מקום נשארות יחד)
for k, s in enumerate(STOPS):
    if hw[k] == 'far':
        j = min((j for j in range(len(STOPS)) if j != k and hw[j] != 'far'), key=lambda j: math.hypot(STOPS[j]['x'] - s['x'], STOPS[j]['y'] - s['y']))
        lab0[k] = lab0[j]; hw[k] = 'far*'
for k, s in enumerate(STOPS):
    i, w = lab0[k], hw[k]
    if w != 'in': print('  stop', s['id'], s['name'], '->', H[i]['name'], w, round(H[i]['geom'].distance(Point(s['x'], s['y']))), 'm')
print('stops:', dict(how))
used = [i for i in range(len(H)) if i in lab0]
for i in range(len(H)):
    if i not in used: print('  no stops (not a zone):', H[i]['name'])
remap = {k: z for z, k in enumerate(used)}
lab = [remap[i] for i in lab0]
Z = [H[i] for i in used]

# ---------- סמלים: לכל שכונה צורה משלה. המשפחות — צורות שדומות זו לזו בגודל קטן; שכנות לא מקבלות אותה משפחה
SHAPES = [('circle', 'round'), ('triangle', 'tri'), ('square', 'sq'), ('star', 'star'), ('diamond', 'dia'), ('plus', 'cross'),
          ('heart', 'heart'), ('hexagon', 'round'), ('crescent', 'moon'), ('drop', 'drop'), ('flag', 'flag'), ('bolt', 'bolt'),
          ('tridown', 'tri'), ('xmark', 'cross'), ('hourglass', 'hour'), ('shield', 'sq'), ('semicircle', 'moon'), ('chevron', 'tri'),
          ('pentagon', 'round'), ('leaf', 'drop'), ('tee', 'cross'), ('parallelogram', 'sq')]
fam = dict(SHAPES)
mass = []
for z, h in enumerate(Z):
    mem = [i for i in range(len(STOPS)) if lab[i] == z]
    mass.append(sum(acc[i]['home'] + acc[i]['work'] + acc[i]['shop'] + acc[i]['school'] + acc[i]['civic'] for i in mem))
    h['stops'] = mem
nbr = [{j for j in range(len(Z)) if j != i and Z[i]['geom'].distance(Z[j]['geom']) < 60} for i in range(len(Z))]
for i in sorted(range(len(Z)), key=lambda i: -mass[i]):
    taken = {Z[j]['sym'] for j in range(len(Z)) if 'sym' in Z[j]}
    near = {fam[Z[j]['sym']] for j in nbr[i] if 'sym' in Z[j]}
    Z[i]['sym'] = next((s for s, f in SHAPES if s not in taken and f not in near), None) or next(s for s, f in SHAPES if s not in taken)

def rings(g):
    g = g.intersection(VIEW).simplify(1.5, preserve_topology=True)
    ps = [g] if g.geom_type == 'Polygon' else [p for p in getattr(g, 'geoms', []) if p.geom_type == 'Polygon']
    out = []
    for p in ps:
        if p.area < 200: continue
        out.append([[[round(x), round(y)] for x, y in list(r.coords)[:-1]] for r in [p.exterior, *p.interiors]])
    return out
home_all = sum(a['home'] for a in acc)
zones = []
for z, h in enumerate(Z):
    d = h['geom'].intersection(VIEW)
    big = max(d.geoms, key=lambda p: p.area) if d.geom_type != 'Polygon' else d
    lp = polylabel(big, 2)
    pop = sum(acc[i]['home'] for i in h['stops']) / home_all * RESIDENTS
    zones.append({'id': z, 'name': h['name'], 'x': round(lp.x), 'y': round(lp.y), 'sym': h['sym'], 'kind': h['kind'], 'poly': rings(h['geom'])})
    print(z, h['name'], h['kind'], 'sym', h['sym'], 'stops', len(h['stops']), 'pop', round(pop), [STOPS[j]['name'] for j in h['stops']][:3])
assert len(set(z['name'] for z in zones)) == len(zones) and len(set(z['sym'] for z in zones)) == len(zones)

stops = {}
for i, s in enumerate(STOPS):
    a = acc[i]
    pop = a['home'] / home_tot * RESIDENTS
    work = a['work'] * 0.5 + a['shop'] * 0.6 + a['school'] * 0.4 + a['civic'] + a['worship'] * 0.2 + a['home'] * 0.04
    stops[s['id']] = [lab[i], round(pop, 1), round(work), round(a['school'] + a['home'] * 0.03), round(a['shop'] + a['civic'] * 0.3 + a['home'] * 0.01)]
out = {'meta': {'residents': RESIDENTS, 'built_from': 'osm_raw.json.gz + neighbourhoods.json + city.json', 'tool': 'tools/build_demand.py',
                'zones': 'שכונות קריית מלאכי: מפ"י / GovMap (שכבה 22), באמצעות גרסאות לעם, ספטמבר 2026; המושבים: OpenStreetMap'},
       'zones': zones, 'stops': stops}
p = os.path.join(W, 'demand.json')
json.dump(out, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('->', p, os.path.getsize(p))
