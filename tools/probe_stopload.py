# בדיקה חד-פעמית (שלמה 30.10, סבב 2: אילו קווים עומדים יחד בתחנה): עומס בתחנות — כמה אוטובוסים בתחנה באותה דקה, כמה זמן הם עומדים,
# האם זה מאט את הקטע שלפני התחנה, וכמה רציפים לפי משרד התחבורה. מקובצי SIRI הגולמיים ב-S3.
import collections, concurrent.futures as cf, csv, datetime, io, json, math, os, sys, zipfile, urllib.request
sys.path.insert(0, 'tools')
import bus_speed as BS
STOPS = {'21472': (32.07458, 34.79061), '21675': (32.07228, 34.78961), '21188': (32.09538, 34.79414), '20801': (32.08301, 34.80216)}
import brotli
def parse(b):
    try: j = json.loads(brotli.decompress(b))
    except Exception: return []
    out = []
    for sd in j.get('Siri', {}).get('ServiceDelivery', {}).get('StopMonitoringDelivery') or []:
        for v in sd.get('MonitoredStopVisit') or []:
            mj = v.get('MonitoredVehicleJourney') or {}; loc = mj.get('VehicleLocation') or {}
            try: out.append((mj.get('VehicleRef'), v['RecordedAtTime'], float(loc['Latitude']), float(loc['Longitude']), float(mj.get('Velocity') or 0), float(mj.get('Bearing') or 0), str(mj.get('LineRef') or '')))
            except Exception: continue
    return out
NDAYS = int(os.environ.get('NDAYS', '8'))
NEAR, APP = 35.0, 300.0
def m(a, b, c, d): return math.hypot((a - c) * 111000, (b - d) * 111000 * math.cos(math.radians(a)))
def brg(a, b, c, d):
    y = math.sin(math.radians(d - b)) * math.cos(math.radians(c))
    x = math.cos(math.radians(a)) * math.sin(math.radians(c)) - math.sin(math.radians(a)) * math.cos(math.radians(c)) * math.cos(math.radians(d - b))
    return (math.degrees(math.atan2(y, x)) + 360) % 360
# ימי חול אחרונים
days, d = [], datetime.date.today() - datetime.timedelta(days=1)
while len(days) < NDAYS:
    if d.weekday() in (6, 0, 1, 2, 3): days.append(d)
    d -= datetime.timedelta(days=1)
snap = collections.defaultdict(lambda: collections.defaultdict(dict))   # stop -> minute key -> veh -> (dist, vel, toward)
for day in days:
    t0 = datetime.datetime(day.year, day.month, day.day) - datetime.timedelta(hours=3)
    keys = [(t0 + datetime.timedelta(minutes=k)).strftime('%Y/%m/%d/%H/%M') + '.br' for m_ in [0] for k in range(25 * 60)]
    def job(key):
        b = BS.fetch(key)
        return key, parse(b) if b else []
    with cf.ThreadPoolExecutor(24) as ex:
        for key, recs in ex.map(job, keys):
            mk = key[:-3]
            for veh, ts, la, lo, vel, br, lref in recs:
                for code, (sla, slo) in STOPS.items():
                    if abs(la - sla) > .004 or abs(lo - slo) > .005: continue
                    dist = m(la, lo, sla, slo)
                    if dist > APP: continue
                    toward = abs(((brg(la, lo, sla, slo) - br) + 180) % 360 - 180) < 45
                    try:
                        t = datetime.datetime.fromisoformat(ts.replace('Z', '+00:00')).astimezone(datetime.timezone(datetime.timedelta(hours=2 if day >= datetime.date(2026, 10, 25) else 3)))
                    except Exception: continue
                    if t.date() != day: continue
                    snap[code][t.strftime('%Y-%m-%d %H:%M')][veh] = (dist, vel, toward, lref)
    print(day, 'נטען', flush=True)
# רציפים לפי משרד התחבורה: שדה "רציף" ותחנות סמוכות עם אותו שם
z = None
for back in range(0, 5):
    dd = datetime.date.today() - datetime.timedelta(days=back)
    try:
        z = zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(f'https://openbus-stride-public.s3.eu-west-1.amazonaws.com/gtfs_archive/{dd:%Y/%m/%d}/israel-public-transportation.zip', timeout=300).read())); break
    except Exception: pass
st = list(csv.DictReader(io.TextIOWrapper(z.open('stops.txt'), 'utf-8-sig'))) if z else []
res = {}
for code, (sla, slo) in STOPS.items():
    me = next((s for s in st if s['stop_code'] == code), {})
    desc = me.get('stop_desc', '')
    plat = desc.split('רציף:')[1].split('קומה:')[0].strip() if 'רציף:' in desc else ''
    sib = [s['stop_code'] for s in st if s.get('stop_name') == me.get('stop_name') and m(float(s['stop_lat']), float(s['stop_lon']), sla, slo) < 80]
    H = collections.defaultdict(lambda: [0, 0, 0, 0.0])      # שעה -> דקות, דקות עם תור, דקות עם אוטובוס, סכום אוטובוסים
    SP = collections.defaultdict(lambda: [[], []])          # שעה -> מהירות בקטע לפני התחנה: [תור, פנוי]
    seen = collections.defaultdict(list)
    for mk, vs in snap[code].items():
        h = int(mk[11:13])
        at = [v for v, x in vs.items() if x[0] <= NEAR]
        e = H[h]; e[0] += 1; e[3] += len(at)
        if at: e[2] += 1
        if len(at) >= 3: e[1] += 1
        app = [x[1] for v, x in vs.items() if NEAR < x[0] <= APP and x[2]]
        if app and len(at) >= 3:
            SP[h][0].extend(app)
        elif app and len(at) <= 1:
            SP[h][1].extend(app)
        for v in at: seen[v].append(mk)
    # זמן עמידה: דקות רצופות שבהן אותו רכב נראה בתחנה
    dw = []
    for v, ms in seen.items():
        ms.sort(); run = 1
        for a, b in zip(ms, ms[1:]):
            if (datetime.datetime.strptime(b, '%Y-%m-%d %H:%M') - datetime.datetime.strptime(a, '%Y-%m-%d %H:%M')).seconds == 60: run += 1
            else: dw.append(run); run = 1
        dw.append(run)
    q = {h: [e[0], round(100 * e[1] / e[0]), round(e[3] / e[0], 2)] for h, e in sorted(H.items()) if e[0] >= 30}
    sp = {h: [round(sum(a) / len(a), 1) if len(a) >= 15 else None, round(sum(b) / len(b), 1) if len(b) >= 15 else None, len(a), len(b)] for h, (a, b) in sorted(SP.items())}
    res[code] = {'name': me.get('stop_name'), 'platform': plat, 'same_name_nearby': sib, 'hours': q, 'speed': sp,
                 'dwell_minutes': collections.Counter(min(x, 6) for x in dw)}
    print(f"\n### {code} {me.get('stop_name')} · רציף: '{plat}' · קודים באותו שם עד 80 מ': {sib}")
    print('שעה | דקות | % דקות עם 3+ אוטובוסים | אוטובוסים בממוצע | מהירות לפני התחנה: עם תור / פנוי (קמ"ש, דגימות)')
    for h, (n, pq, avg) in q.items():
        s = sp.get(h, [None, None, 0, 0])
        print(f'{h:02d} | {n} | {pq}% | {avg} | {s[0]} / {s[1]} ({s[2]}/{s[3]})')
    print('זמן עמידה (דקות רצופות בתחנה → מספר עצירות):', dict(sorted(res[code]['dwell_minutes'].items())))

rt = {r['route_id']: (r['route_short_name'], r['route_long_name'].split('<->')[-1].split('-')[0].strip()) for r in csv.DictReader(io.TextIOWrapper(z.open('routes.txt'), 'utf-8-sig'))} if z else {}
lines_out = {}
for code in STOPS:
    nm = lambda r: rt.get(r, (r, ''))[0]
    pres = collections.Counter(); inq = collections.Counter(); pair = collections.Counter(); pairh = collections.defaultdict(collections.Counter); qmin = 0
    for mk, vs in snap[code].items():
        at = sorted({x[3] for v, x in vs.items() if x[0] <= NEAR and x[3]})
        for r in at: pres[r] += 1
        if len([1 for v, x in vs.items() if x[0] <= NEAR]) >= 3:
            qmin += 1
            for r in at: inq[r] += 1
        for i in range(len(at)):
            for j in range(i + 1, len(at)):
                pair[(at[i], at[j])] += 1; pairh[(at[i], at[j])][int(mk[11:13])] += 1
    L = [(nm(r), rt.get(r, ('', ''))[1], pres[r], inq[r]) for r in pres if pres[r] >= 20]
    L.sort(key=lambda x: -x[3])
    PR = [(nm(a), rt.get(a, ('', ''))[1], nm(b), rt.get(b, ('', ''))[1], n, pairh[(a, b)].most_common(1)[0][0]) for (a, b), n in pair.most_common(20)]
    lines_out[code] = {'qmin': qmin, 'lines': L[:25], 'pairs': PR}
    print(f"\n### {code} — דקות עם תור: {qmin}")
    print('קו | לכיוון | דקות בתחנה | מהן בזמן תור')
    for x in L[:25]: print(' | '.join(map(str, x)))
    print('זוג קווים שעמדו יחד | דקות (8 ימים) | שעת שיא')
    for a, ta, b, tb, n, h in PR: print(f'{a} ({ta}) + {b} ({tb}) | {n} | {h:02d}')
print('\nLINES_JSON:', json.dumps(lines_out, ensure_ascii=False))

json.dump(res, open('stopload.json', 'w'), ensure_ascii=False)
print('\nJSON:', json.dumps(res, ensure_ascii=False)[:20000])
