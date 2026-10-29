# בדיקה חד-פעמית: עומסים ברחוב יגאל הורביץ, קרית מלאכי — לפי GPS האוטובוסים (דאטאבוס) בחודש האחרון
import json, math, time, urllib.request, urllib.parse, collections, datetime, statistics, sys
API = 'https://open-bus-stride-api.hasadna.org.il'
# התחנות לאורך הרחוב, מצפון-מערב לדרום-מזרח
AX = [(31.729621, 34.736109), (31.728720, 34.737458), (31.727676, 34.739283), (31.725571, 34.742478),
      (31.724078, 34.744405), (31.723877, 34.745014)]
R = 6371000.0
def xy(lat, lon):
    return (math.radians(lon - AX[0][1]) * R * math.cos(math.radians(AX[0][0])), math.radians(lat - AX[0][0]) * R)
P = [xy(*a) for a in AX]
def proj(lat, lon):
    """(מרחק לאורך הרחוב, מרחק מהרחוב)"""
    x, y = xy(lat, lon); best = None; acc = 0
    for (x1, y1), (x2, y2) in zip(P, P[1:]):
        dx, dy = x2 - x1, y2 - y1; L = math.hypot(dx, dy)
        t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / (L * L)))
        d = math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
        if best is None or d < best[1]: best = (acc + t * L, d)
        acc += L
    return best
LEN = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(P, P[1:]))
def get(path, **q):
    url = API + path + '?' + urllib.parse.urlencode(q)
    for i in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'kav-bochan probe'}), timeout=180) as r:
                return json.load(r)
        except Exception as e:
            print('retry', i, e, flush=True); time.sleep(5 * (i + 1))
    raise SystemExit('failed ' + url)
lat0, lat1 = 31.7232, 31.7303; lon0, lon1 = 34.7350, 34.7460
tz = datetime.timezone(datetime.timedelta(hours=3))
end = datetime.date(2026, 10, 28); start = end - datetime.timedelta(days=60)
m1 = (end - datetime.timedelta(days=30)).isoformat()
sample = get('/siri_vehicle_locations/list', limit=1, recorded_at_time_from='2026-10-20T08:00:00+03:00',
             recorded_at_time_to='2026-10-20T09:00:00+03:00', lat__greater_or_equal=lat0, lat__lower_or_equal=lat1,
             lon__greater_or_equal=lon0, lon__lower_or_equal=lon1)
print('SAMPLE', json.dumps(sample, ensure_ascii=False)[:1500], flush=True)
pts = []
d = start
while d < end:
    for h0 in range(0, 24, 6):
        a = datetime.datetime(d.year, d.month, d.day, h0, tzinfo=tz); b = a + datetime.timedelta(hours=6)
        off = 0
        while True:
            rows = get('/siri_vehicle_locations/list', limit=10000, offset=off, recorded_at_time_from=a.isoformat(),
                       recorded_at_time_to=b.isoformat(), lat__greater_or_equal=lat0, lat__lower_or_equal=lat1,
                       lon__greater_or_equal=lon0, lon__lower_or_equal=lon1)
            pts += rows; off += len(rows)
            if len(rows) < 10000: break
        time.sleep(0.3)
    print(d, len(pts), flush=True)
    d += datetime.timedelta(days=1)
json.dump(pts, open('points.json', 'w'))
# קיבוץ לפי נסיעה
key = next((k for k in ('siri_ride__id', 'siri_ride_stop__siri_ride_id', 'siri_ride_stop_id') if pts and k in pts[0]), None)
print('KEY', key, 'points', len(pts), flush=True)
rides = collections.defaultdict(list)
for p in pts:
    s, off = proj(p['lat'], p['lon'])
    if off > 40: continue
    t = datetime.datetime.fromisoformat(p['recorded_at_time'].replace('Z', '+00:00')).astimezone(tz)
    rides[(p.get(key), p.get('siri_ride__vehicle_ref') or p.get('siri_vehicle_ref') or '')].append((t, s, p))
passes = []
for k, v in rides.items():
    v.sort(key=lambda x: x[0])
    if len(v) < 2: continue
    # מעבר ברחוב: מהנקודה הראשונה לאחרונה — לפחות 300 מ' לאורך הרחוב, עד 30 דק'
    t0, s0, _ = v[0]; t1, s1, _ = v[-1]
    dist = abs(s1 - s0); dt = (t1 - t0).total_seconds()
    if dist < 300 or dt <= 0 or dt > 1800: continue
    passes.append({'t': t0.isoformat(), 'wd': (t0.weekday() + 1) % 7, 'h': t0.hour, 'dir': 'SE' if s1 > s0 else 'NW',
                   'kmh': dist / dt * 3.6, 'sec_per_km': dt / dist * 1000, 'n': len(v),
                   'line': v[0][2].get('siri_route__line_ref') or ''})
json.dump(passes, open('passes.json', 'w'), ensure_ascii=False)
print('PASSES', len(passes), 'street length m', round(LEN))
HE = 'אבגדהוש'
def med(x): return round(statistics.median(x), 1) if x else None
def report(title, ps, hours, step=60):
    print('\n=====', title, '=====')
    print('לפי שעה (ימי א-ה), מהירות חציונית — נמוך = עומס:')
    for m0 in range(hours[0] * 60, hours[1] * 60, step):
        a = [p['kmh'] for p in ps if p['wd'] <= 4 and m0 <= p['h'] * 60 + p['mi'] < m0 + step]
        if a: print(f'{m0//60:02d}:{m0%60:02d}  n={len(a):4d}  חציון={med(a)} קמ"ש  רבעון תחתון={round(sorted(a)[len(a)//4],1)}')
    for dr, nm in (('NW', 'לכיוון שד׳ בן גוריון'), ('SE', 'לכיוון שמעון פרס/בי"ס הראל')):
        print('כיוון', nm)
        for m0 in range(hours[0] * 60, hours[1] * 60, step):
            a = [p['kmh'] for p in ps if p['wd'] <= 4 and p['dir'] == dr and m0 <= p['h'] * 60 + p['mi'] < m0 + step]
            if len(a) >= 5: print(f'   {m0//60:02d}:{m0%60:02d}  n={len(a):4d}  חציון={med(a)}')
    print('לפי יום בשבוע:')
    for wd in range(7):
        a = [p['kmh'] for p in ps if p['wd'] == wd and hours[0] <= p['h'] < hours[1]]
        if a: print('  ', HE[wd], len(a), med(a))
for p in passes: p['mi'] = datetime.datetime.fromisoformat(p['t']).minute
report('החודש האחרון — כל היום', [p for p in passes if p['t'][:10] >= m1], (5, 24))
report('חודשיים — ערב (15:00–22:00), ברבעי שעה', passes, (15, 22), 15)
