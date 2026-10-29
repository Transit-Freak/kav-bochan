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
    if not adep.startswith('20:55'):
        continue
    tid0 = next(t for t, v in cand.items() if v[3] == start and v[1][3] == adep)
    route_stops = seq[tid0]
    mkt, dirn = r['route_desc'].split('-')[0], r['route_desc'].split('-')[1]
    gr = get('/gtfs_routes/list', route_mkt=mkt, date_from=(today - datetime.timedelta(days=16)).isoformat(), date_to=today.isoformat(), limit=500)
    refs = sorted({str(x['line_ref']) for x in gr if str(x.get('route_direction')) == dirn} | {rid})
    print('קודי תחנות:', stops[a[1]]['stop_code'], stops[b[1]]['stop_code'])
    print(f'\n=== התחלה {start[:5]} · לו"ז: מוצא {adep[:5]} יעד {barr[:5]} · line_refs {refs}')
    import math
    pa = (float(stops[a[1]]['stop_lat']), float(stops[a[1]]['stop_lon']))
    pb = (float(stops[b[1]]['stop_lat']), float(stops[b[1]]['stop_lon']))
    dist = lambda p, q: math.hypot((p[0] - q[0]) * 111000, (p[1] - q[1]) * 94000)
    TZ = ZoneInfo('Asia/Jerusalem')
    DELAYS = {}
    for back in range(1, 16):
        d = today - datetime.timedelta(days=back)
        h, m = int(start[:2]), int(start[3:5])
        t0 = datetime.datetime(d.year, d.month, d.day, h % 24, m, tzinfo=TZ) + datetime.timedelta(days=h // 24)
        rides = get('/siri_rides/list', siri_route__line_refs=','.join(refs), limit=20,
                    scheduled_start_time_from=(t0 - datetime.timedelta(minutes=3)).isoformat(),
                    scheduled_start_time_to=(t0 + datetime.timedelta(minutes=3)).isoformat())
        if not rides:
            print(f'{d} {d.strftime("%a")}: אין נסיעה'); continue
        for ride in rides[:2]:
            locs = get('/siri_vehicle_locations/list', siri_rides__ids=ride['id'], limit=5000)
            pts = [((float(x['lat']), float(x['lon'])), datetime.datetime.fromisoformat(str(x['recorded_at_time']).replace('Z', '+00:00')))
                   for x in locs if x.get('lat') and x.get('recorded_at_time')]
            pts.sort(key=lambda x: x[1])
            def near(pt, after=None):
                c = [(dist(q, pt), t) for q, t in pts if after is None or t >= after]
                return min(c) if c else None
            # כל התחנות לאורך הדרך: הזמן שבו האוטובוס היה הכי קרוב לתחנה (אחרי התחנה הקודמת)
            after, row = None, []
            for sq, sid, arr, dep in route_stops:
                q = (float(stops[sid]['stop_lat']), float(stops[sid]['stop_lon']))
                n = near(q, after)
                hh, mm, ss = map(int, dep.split(':'))
                sch = datetime.datetime(d.year, d.month, d.day, tzinfo=TZ) + datetime.timedelta(hours=hh, minutes=mm, seconds=ss)
                if n and n[0] < 250:
                    after = n[1]
                    row.append((sid, round((n[1] - sch).total_seconds() / 60, 1)))
                else:
                    row.append((sid, None))
            DELAYS.setdefault(d, row)
            na = near(pa)
            nb = near(pb, na[1] if na else None)
            f = lambda n: f"{n[1].astimezone(TZ):%H:%M} ({n[0]:.0f}מ')" if n and n[0] < 400 else ('—' if not n else f"? ({n[0]:.0f}מ')")
            print(f'{d} {d.strftime("%a")}: רכב {ride.get("vehicle_ref")} · התחלה {il(ride.get("scheduled_start_time"))} · שידורים {len(pts)} · מסעף ק. מלאכי {f(na)} · קניותר {f(nb)}')

    # טבלה: עיכוב (דקות) בכל תחנה, לכל יום, וממוצע — רק ימי חול (ראשון–חמישי)
    days = [d for d in sorted(DELAYS) if d.weekday() not in (4, 5)]
    print('\n=== עיכוב בכל תחנה (דקות, + = מאחר) · ימים:', ' '.join(f'{d:%d.%m}' for d in days))
    for k, (sq, sid, arr, dep) in enumerate(route_stops):
        vals = [DELAYS[d][k][1] for d in days]
        ok = [v for v in vals if v is not None]
        avg = f'{sum(ok) / len(ok):+.1f}' if ok else '—'
        print(f'{k + 1:2d} {dep[:5]} {stops[sid]["stop_name"][:28]:28s} ממוצע {avg:>6s} | ' + ' '.join('  —' if v is None else f'{v:+3.0f}' for v in vals))
