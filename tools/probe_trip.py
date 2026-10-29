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
# נסיעות שונות (לפי שעה) — פעם אחת כל אחת
uniq = {}
for tid, (rid, a, b, start) in cand.items():
    r = routes[rid]
    k = (start, a[3], b[2], rid)
    if k not in uniq:
        uniq[k] = (r, a, b)
        print(f'route_id {rid} · מק"ט {r["route_desc"]} · {r["route_long_name"]} · התחלה {start} · מוצא {stops[a[1]]["stop_name"]} {a[3]} · יעד {stops[b[1]]["stop_name"]} {b[2]}')
if not uniq:
    for rid, r in routes.items(): print('מסלול', rid, r['route_desc'], r['route_long_name'])
    sys.exit()
il = lambda t: datetime.datetime.fromisoformat(str(t).replace('Z', '+00:00')).astimezone(ZoneInfo('Asia/Jerusalem')).strftime('%H:%M') if t else '—'
today = datetime.date.today()
for (start, adep, barr, rid), (r, a, b) in sorted(uniq.items()):
    mkt, dirn = r['route_desc'].split('-')[0], r['route_desc'].split('-')[1]
    gr = get('/gtfs_routes/list', route_mkt=mkt, date_from=(today - datetime.timedelta(days=16)).isoformat(), date_to=today.isoformat(), limit=500)
    refs = sorted({str(x['line_ref']) for x in gr if str(x.get('route_direction')) == dirn} | {rid})
    print('קודי תחנות:', stops[a[1]]['stop_code'], stops[b[1]]['stop_code'])
    print(f'\n=== התחלה {start[:5]} · לו"ז: מוצא {adep[:5]} יעד {barr[:5]} · line_refs {refs}')
    for back in range(1, 16):
        d = today - datetime.timedelta(days=back)
        h, m = int(start[:2]), int(start[3:5])
        t0 = datetime.datetime(d.year, d.month, d.day, h % 24, m) + datetime.timedelta(days=h // 24)
        rides = get('/siri_rides/list', siri_route__line_refs=','.join(refs), limit=20,
                    scheduled_start_time_from=(t0 - datetime.timedelta(minutes=3)).isoformat() + '+02:00',
                    scheduled_start_time_to=(t0 + datetime.timedelta(minutes=3)).isoformat() + '+02:00')
        if not rides:
            w = get('/siri_rides/list', siri_route__line_refs=','.join(refs), limit=50,
                    scheduled_start_time_from=f'{d}T19:00:00+02:00', scheduled_start_time_to=f'{d}T22:30:00+02:00')
            print(f'{d} {d.strftime("%a")}: אין נסיעה · נסיעות 19:00–22:30: {sorted(il(x.get("scheduled_start_time")) for x in w)}'); continue
        for ride in rides[:2]:
            rs = get('/siri_ride_stops/list', siri_ride_ids=ride['id'], limit=500)
            if back == 1:
                for x in sorted(rs, key=lambda y: y.get('order') or 0)[:70]:
                    print('   ', x.get('order'), x.get('siri_stop__code'), x.get('gtfs_stop__code'), x.get('gtfs_stop__name'), il(x.get('nearest_siri_vehicle_location__recorded_at_time')), x.get('nearest_siri_vehicle_location__distance_from_siri_ride_stop_meters'))
            got = {}
            for x in rs:
                nm = x.get('gtfs_stop__name') or ''
                cd = str(x.get('siri_stop__code') or x.get('gtfs_stop__code') or '')
                for key, tag, code in ((A_KEY, 'A', stops[a[1]]['stop_code']), (B_KEY, 'B', stops[b[1]]['stop_code'])):
                    if key in nm or cd == code:
                        got[tag] = (x.get('nearest_siri_vehicle_location__recorded_at_time'),
                                    x.get('nearest_siri_vehicle_location__distance_from_siri_ride_stop_meters'),
                                    x.get('gtfs_ride_stop__arrival_time'))
            fmt = lambda v: f"{il(v[0])} ({v[1]}מ', לו\"ז {il(v[2])})" if v and v[0] else '—'
            print(f'{d} {d.strftime("%a")}: רכב {ride.get("vehicle_ref")} · התחלה {il(ride.get("scheduled_start_time"))} · תחנות {len(rs)} · מוצא {fmt(got.get("A"))} · יעד {fmt(got.get("B"))}')
