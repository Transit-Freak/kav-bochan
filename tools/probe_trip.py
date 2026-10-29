# בדיקה חד-פעמית (שלמה 29.10): קו 301, נסיעה של ~20:55 מצומת קריית מלאכי/יגאל הורוביץ אל קניותר/בילו —
# מתי הגיעה בפועל בכל יום בשבועיים האחרונים (דאטאבוס, siri_ride_stops) מול הלו"ז.
from zoneinfo import ZoneInfo
import csv, datetime, io, json, sys, time, urllib.parse, urllib.request, zipfile
API = 'https://open-bus-stride-api.hasadna.org.il'
def get(path, **p):
    u = f'{API}{path}?' + urllib.parse.urlencode(p)
    for a in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'kav-bochan-probe'}), timeout=180) as r:
                return json.load(r)
        except Exception as e:
            print('  retry', e, flush=True); time.sleep(10 * (a + 1))
    return []
day = datetime.date.today() - datetime.timedelta(days=1)
url = f'https://openbus-stride-public.s3.eu-west-1.amazonaws.com/gtfs_archive/{day:%Y/%m/%d}/israel-public-transportation.zip'
z = zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(url, timeout=300).read()))
rd = lambda n: csv.DictReader(io.TextIOWrapper(z.open(n), 'utf-8-sig'))
routes = {r['route_id']: r for r in rd('routes.txt') if r['route_short_name'].strip() == '301'}
trips = {t['trip_id']: t['route_id'] for t in rd('trips.txt') if t['route_id'] in routes}
stops = {s['stop_id']: s for s in rd('stops.txt')}
seq = {}
for st in rd('stop_times.txt'):
    if st['trip_id'] in trips:
        seq.setdefault(st['trip_id'], []).append((int(st['stop_sequence']), st['stop_id'], st['arrival_time'], st['departure_time']))
A_KEY, B_KEY = 'הורוביץ', 'קניותר'
cand = {}
for tid, ss in seq.items():
    ss.sort()
    a = [x for x in ss if A_KEY in stops[x[1]]['stop_name']]
    b = [x for x in ss if B_KEY in stops[x[1]]['stop_name']]
    if a and b and a[0][0] < b[-1][0] and '20:30:00' <= a[0][3] <= '21:20:00':
        cand[tid] = (trips[tid], a[0], b[-1], ss[0][3])
for tid, (rid, a, b, start) in cand.items():
    r = routes[rid]
    print(f'נסיעה {tid} · route_id {rid} · {r["route_long_name"]} · מתחילה {start}')
    print(f'   מוצא: {stops[a[1]]["stop_name"]} ({stops[a[1]]["stop_code"]}) {a[3]} → יעד: {stops[b[1]]["stop_name"]} ({stops[b[1]]["stop_code"]}) {b[2]}')
if not cand:
    for rid, r in routes.items(): print('מסלול', rid, r['route_long_name'])
    sys.exit()
for tid, (rid, a, b, start) in cand.items():
    codes = {stops[a[1]]['stop_code']: 'A', stops[b[1]]['stop_code']: 'B'}
    sr = get('/siri_routes/list', line_refs=rid, limit=10)
    sids = ','.join(str(x['id']) for x in sr)
    print(f'\n=== route {rid} (siri_route {sids}) · לו"ז: יציאה {a[3][:5]} הגעה {b[2][:5]}')
    first = True
    for back in range(1, 16):
        d = datetime.date.today() - datetime.timedelta(days=back)
        h, m = int(start[:2]), int(start[3:5])
        t0 = datetime.datetime(d.year, d.month, d.day, h % 24, m) + datetime.timedelta(days=h // 24)
        rides = get('/siri_rides/list', siri_route_ids=sids, limit=20,
                    scheduled_start_time_from=(t0 - datetime.timedelta(minutes=2)).isoformat() + '+02:00',
                    scheduled_start_time_to=(t0 + datetime.timedelta(minutes=2)).isoformat() + '+02:00')
        if not rides:
            print(f'{d} {d.strftime("%a")}: אין נסיעה ב-SIRI'); continue
        ride = rides[0]
        rs = get('/siri_ride_stops/list', siri_ride_ids=ride['id'], limit=300)
        if first and rs:
            print('שדות:', sorted(rs[0].keys())); first = False
        got = {}
        for x in rs:
            code = str(x.get('siri_stop__code') or x.get('gtfs_stop__code') or '')
            if code in codes:
                got[codes[code]] = (x.get('nearest_siri_vehicle_location__recorded_at_time'),
                                    x.get('nearest_siri_vehicle_location__distance_from_siri_ride_stop_meters'))
        il = lambda t: datetime.datetime.fromisoformat(str(t).replace('Z', '+00:00')).astimezone(ZoneInfo('Asia/Jerusalem')).strftime('%H:%M') if t else '—'
        fmt = lambda v: (il(v[0]) + f' ({v[1]}מ\')') if v and v[0] else '—'
        print(f'{d} {d.strftime("%a")}: רכב {ride.get("vehicle_ref")} · התחלה מתוכננת {il(ride.get("scheduled_start_time"))} · מוצא {fmt(got.get("A"))} · יעד {fmt(got.get("B"))}')
