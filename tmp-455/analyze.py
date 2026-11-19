"""בדיקה חד-פעמית: 455 (14:15) ← החלפה לקריית מלאכי, לפי זמני אמת מ-SIRI (Stride)."""
import json, math, sys, time, datetime, statistics, urllib.request, urllib.parse, concurrent.futures
from zoneinfo import ZoneInfo

API = 'https://open-bus-stride-api.hasadna.org.il'
IL = ZoneInfo('Asia/Jerusalem')
D0, D1 = datetime.date(2026, 10, 4), datetime.date(2026, 11, 19)
WALK = 80.0  # מטר לדקה


def log(*a):
    print(*a, flush=True)


def get(path, **p):
    url = f'{API}{path}?{urllib.parse.urlencode(p)}'
    last = None
    for k in range(5):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'transit-analysis (one-off; polite)'})
            with urllib.request.urlopen(req, timeout=120) as r:
                time.sleep(0.2)
                return json.load(r)
        except Exception as e:  # noqa
            last = e
            time.sleep(5 * (k + 1))
    log('API FAIL', url, last)
    return None


def fetch_all(path, page=1000, **p):
    out, off = [], 0
    while True:
        rows = get(path, limit=page, offset=off, **p)
        if rows is None:
            return None
        out += rows
        if len(rows) < page:
            return out
        off += page


def ts(s):
    return datetime.datetime.fromisoformat(s.replace('Z', '+00:00')).timestamp() if s else None


def hhmm(t):
    if t is None:
        return None
    return datetime.datetime.fromtimestamp(t, IL).strftime('%H:%M:%S')


def hav(a, b, c, d):
    r = 6371000.0
    p1, p2 = math.radians(a), math.radians(c)
    x = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(d - b) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(x))


def loc(d, h, m):
    return datetime.datetime.combine(d, datetime.time(h, m), tzinfo=IL).isoformat()


# ---------------------------------------------------------------- מסלולים ותחנות
LINES = {  # שם: (מק"ט, כיוון)
    '455': ('14455', '2'), '140': ('13140', '1'), '141': ('14141', '1'), '142': ('17142', '1'),
    '348': ('12348', '1'),
}
STOPS = {}  # code -> (lat, lon, name)
ROUTE_SEQ = {}  # line_ref -> [codes]


def routes_for(mkt, dr, d):
    rows = get('/gtfs_routes/list', date_from=d.isoformat(), date_to=d.isoformat(), route_mkt=mkt,
               route_direction=dr, limit=20) or []
    return [r for r in rows if str(r.get('route_mkt')).lstrip('0') == mkt.lstrip('0') and str(r.get('route_direction')) == dr]


def ride_stops_for_route(rid, d):
    rides = get('/gtfs_rides/list', gtfs_route_id=rid, limit=200,
                start_time_from=loc(d, 0, 0), start_time_to=loc(d, 23, 59)) or []
    rides = [r for r in rides if r.get('gtfs_route_id') == rid]
    return rides


def stops_of_ride(ride_id):
    rs = get('/gtfs_ride_stops/list', gtfs_ride_ids=ride_id, limit=300) or []
    rs = [r for r in rs if r.get('gtfs_ride_id') == ride_id]
    rs.sort(key=lambda r: r.get('stop_sequence') or 0)
    for r in rs:
        c = str(r.get('gtfs_stop__code'))
        if r.get('gtfs_stop__lat') is not None:
            STOPS.setdefault(c, (float(r['gtfs_stop__lat']), float(r['gtfs_stop__lon']), r.get('gtfs_stop__name')))
    return rs


days = [D0 + datetime.timedelta(n) for n in range((D1 - D0).days + 1)]
days = [d for d in days if d.weekday() in (6, 0, 1, 2, 3)]  # ראשון-חמישי
log('days', len(days), days[0], days[-1])

# מסלולים לכל יום (line_ref יכול להשתנות)
day_routes = {}  # (d, name) -> list of route rows
for d in days:
    for name, (mkt, dr) in LINES.items():
        day_routes[(d, name)] = routes_for(mkt, dr, d)
log('routes per line (unique line_refs):', {n: sorted({r['line_ref'] for (d, nn), rr in day_routes.items() if nn == n for r in rr}) for n in LINES})
op_of = {r['line_ref']: r['operator_ref'] for rr in day_routes.values() for r in rr}
log('operators:', op_of)

# רצף תחנות לכל line_ref (מהיום האחרון שבו הוא קיים)
seen = {}
for (d, n), rr in sorted(day_routes.items(), key=lambda kv: kv[0][0], reverse=True):
    for r in rr:
        if r['line_ref'] in seen:
            continue
        rides = ride_stops_for_route(r['id'], d)
        if not rides:
            continue
        rs = stops_of_ride(rides[0]['id'])
        seen[r['line_ref']] = 1
        ROUTE_SEQ[r['line_ref']] = [str(x.get('gtfs_stop__code')) for x in rs]
        log(f"seq {n} lr={r['line_ref']} alt={r.get('route_alternative')} {r.get('route_long_name')} n={len(rs)}")
KEY = ['10003', '11060', '12008', '13164', '11217', '19120', '11011', '10138', '12003']
for n in LINES:
    for lr in sorted({r['line_ref'] for (d, nn), rr in day_routes.items() if nn == n for r in rr}):
        seq = ROUTE_SEQ.get(lr, [])
        log(f'  {n} lr={lr}:', {k: seq.index(k) for k in KEY if k in seq}, 'of', len(seq))

# קווים עירוניים בקריית מלאכי
city = []
dref = days[-1] if days[-1] < datetime.date(2026, 11, 19) else days[-2]
allr = fetch_all('/gtfs_routes/list', date_from=dref.isoformat(), date_to=dref.isoformat()) or []
log('all routes on', dref, len(allr))
for r in allr:
    ln = r.get('route_long_name') or ''
    if ln.count('קרית מלאכי') >= 2 or ln.count('קריית מלאכי') >= 2:
        city.append(r)
log('city routes:', [(r['route_short_name'], r['route_mkt'], r['route_direction'], r['route_alternative'], r['operator_ref'], r['route_long_name']) for r in city])
city_seq = {}
for r in city:
    rides = ride_stops_for_route(r['id'], dref)
    if rides:
        rs = stops_of_ride(rides[0]['id'])
        city_seq[r['line_ref']] = (r, [str(x.get('gtfs_stop__code')) for x in rs])
if '12003' not in STOPS:
    rows = get('/gtfs_stops/list', date_from=dref.isoformat(), date_to=dref.isoformat(), code='12003', limit=5) or []
    rows = [x for x in rows if str(x.get('code')) == '12003']
    if rows:
        STOPS['12003'] = (float(rows[0]['lat']), float(rows[0]['lon']), rows[0].get('name'))
log('key stops:', {k: STOPS.get(k) for k in KEY})
KKL = STOPS.get('12003')


def dist(a, b):
    A, B = STOPS[a], STOPS[b]
    return hav(A[0], A[1], B[0], B[1])


if KKL:
    for k in ['11217', '19120', '10138']:
        if k in STOPS:
            log(f'crow dist {k}->12003: {dist(k, "12003"):.0f} m')

# קווים עירוניים: עולים ליד 10138 (עד 300 מ'), יורדים ליד 12003 (עד 450 מ') אחרי העלייה
city_opts = []  # (line_ref, board_code, alight_code, walk_board_m, walk_alight_m, row)
if '10138' in STOPS and KKL:
    for lr, (r, seq) in city_seq.items():
        best = None
        for i, b in enumerate(seq):
            if b not in STOPS:
                continue
            wb = dist('10138', b)
            if wb > 300:
                continue
            for a in seq[i + 1:]:
                if a not in STOPS:
                    continue
                wa = dist(a, '12003')
                if wa > 450:
                    continue
                score = wb + wa
                if best is None or score < best[0]:
                    best = (score, b, a, wb, wa)
        if best:
            city_opts.append((lr, best[1], best[2], best[3], best[4], r))
log('city options:', [(o[5]['route_short_name'], o[0], o[1], o[2], round(o[3]), round(o[4]), o[5]['operator_ref']) for o in city_opts])


# ---------------------------------------------------------------- שידורים
def locations(lr, op, d, h0, m0, h1, m1):
    rows = fetch_all('/siri_vehicle_locations/list', page=5000, siri_routes__line_ref=str(lr), siri_routes__operator_ref=str(op),
                     siri_rides__scheduled_start_time_from=loc(d, h0, m0),
                     siri_rides__scheduled_start_time_to=loc(d, h1, m1))
    if rows is None:
        return None
    rides = {}
    for x in rows:
        if x.get('lat') is None:
            continue
        rides.setdefault(x['siri_ride__id'], {'start': x.get('siri_ride__scheduled_start_time'), 'veh': x.get('siri_ride__vehicle_ref'),
                                              'pts': []})['pts'].append((ts(x['recorded_at_time']), x['lat'], x['lon']))
    for v in rides.values():
        v['pts'] = sorted(set(v['pts']))
    return rides


def passes(pts, code, thr=250):
    """זמני מעבר ליד תחנה: אינטרפולציה על הקטע הקרוב ביותר בכל ריצה רציפה מתחת לסף."""
    if code not in STOPS or len(pts) < 2:
        return []
    la, lo, _ = STOPS[code]
    kx = 111320 * math.cos(math.radians(la))
    ky = 110540
    res, cur = [], None
    for (t1, a1, o1), (t2, a2, o2) in zip(pts, pts[1:]):
        x1, y1 = (o1 - lo) * kx, (a1 - la) * ky
        x2, y2 = (o2 - lo) * kx, (a2 - la) * ky
        dx, dy = x2 - x1, y2 - y1
        L = dx * dx + dy * dy
        f = 0 if L == 0 else max(0, min(1, -(x1 * dx + y1 * dy) / L))
        dd = math.hypot(x1 + f * dx, y1 + f * dy)
        t = t1 + f * (t2 - t1)
        if dd <= thr:
            if cur is None or dd < cur[1]:
                cur = (t, dd, t2 - t1)
        elif cur is not None:
            res.append(cur)
            cur = None
    if cur is not None:
        res.append(cur)
    # איחוד מעברים קרובים (פחות מ-3 דק')
    out = []
    for p in res:
        if out and p[0] - out[-1][0] < 180:
            if p[1] < out[-1][1]:
                out[-1] = p
        else:
            out.append(p)
    return out


def first_after(ps, t):
    for p in ps:
        if p[0] >= t:
            return p
    return None


def lrs(d, name):
    return [(r['line_ref'], r['operator_ref']) for r in day_routes.get((d, name), [])]


def analyze_day(d):
    rec = {'date': d.isoformat(), 'dow': 'אבגדהוש'[(d.weekday() + 1) % 7]}
    # 455 ב-14:15
    trip = None
    for lr, op in lrs(d, '455'):
        rides = locations(lr, op, d, 14, 5, 14, 25)
        if rides is None:
            rec['err'] = 'api'
            return rec
        for sid, v in rides.items():
            st = ts(v['start'])
            if trip is None or abs(st - ts(loc(d, 14, 15))) < abs(ts(trip['start']) - ts(loc(d, 14, 15))):
                trip = dict(v, lr=lr, sid=sid)
    if not trip:
        rec['miss'] = 'no 455 SIRI ride'
        return rec
    rec['455_start'] = hhmm(ts(trip['start']))
    rec['455_npts'] = len(trip['pts'])
    rec['455_first_ping'] = hhmm(trip['pts'][0][0]) if trip['pts'] else None
    # לו"ז מתוכנן
    sched = {}
    for r in day_routes.get((d, '455'), []):
        if r['line_ref'] != trip['lr']:
            continue
        rides = ride_stops_for_route(r['id'], d)
        t0 = ts(loc(d, 14, 15))
        rides = [x for x in rides if x.get('start_time') and abs(ts(x['start_time']) - t0) < 600]
        rec['455_gtfs_start'] = hhmm(ts(rides[0]['start_time'])) if rides else None
        if rides:
            for x in stops_of_ride(rides[0]['id']):
                c = str(x.get('gtfs_stop__code'))
                if c in ('10003', '11060', '12008'):
                    sched[c] = ts(x.get('arrival_time'))
    pa = {}
    for c in ('10003', '11060', '12008'):
        if c in STOPS:
            la, lo, _ = STOPS[c]
            md = min(((hav(la, lo, a, o), t) for t, a, o in trip['pts']), default=None)
            rec[f'455_mind_{c}'] = [round(md[0]), hhmm(md[1])] if md else None
        rec['455_last_ping'] = hhmm(trip['pts'][-1][0]) if trip['pts'] else None
        ps = passes(trip['pts'], c)
        pa[c] = ps[0][0] if ps else None
        rec[f'455_at_{c}'] = hhmm(pa[c])
        rec[f'455_sched_{c}'] = hhmm(sched.get(c))
        if pa[c] and sched.get(c):
            rec[f'455_late_{c}_min'] = round((pa[c] - sched[c]) / 60, 1)
    # --- אפשרות A
    if pa['10003']:
        ready = pa['10003'] + 4 * 60
        cand = []
        for name in ('140', '141', '142'):
            for lr, op in lrs(d, name):
                rides = locations(lr, op, d, 14, 30, 18, 30) or {}
                for sid, v in rides.items():
                    b = passes(v['pts'], '13164')
                    if not b:
                        continue
                    a1 = first_after(passes(v['pts'], '11217'), b[0][0])
                    a2 = first_after(passes(v['pts'], '19120'), b[0][0])
                    cand.append({'line': name, 'sched_start': hhmm(ts(v['start'])), 'dep13164': b[0][0],
                                 'arr11217': a1[0] if a1 else None, 'arr19120': a2[0] if a2 else None})
        cand.sort(key=lambda c: c['dep13164'])
        rec['A_buses_seen'] = [(c['line'], c['sched_start'], hhmm(c['dep13164'])) for c in cand]
        nxt = next((c for c in cand if c['dep13164'] >= ready), None)
        prev = [c for c in cand if c['dep13164'] < ready]
        rec['A_ready_13164'] = hhmm(ready)
        if prev:
            rec['A_missed_prev'] = [prev[-1]['line'], hhmm(prev[-1]['dep13164']), round((ready - prev[-1]['dep13164']) / 60, 1)]
        if nxt:
            rec['A_bus'] = [nxt['line'], nxt['sched_start'], hhmm(nxt['dep13164'])]
            rec['A_wait_min'] = round((nxt['dep13164'] - ready) / 60, 1)
            fins = []
            if nxt['arr11217']:
                fins.append(nxt['arr11217'] + 9 * 60)
                rec['A_arr11217'] = hhmm(nxt['arr11217'])
            if nxt['arr19120']:
                fins.append(nxt['arr19120'] + (dist('19120', '12003') * 1.25 / WALK if KKL else 10.5) * 60)
                rec['A_arr19120'] = hhmm(nxt['arr19120'])
            if nxt['arr11217']:
                rec['A_final'] = nxt['arr11217'] + 9 * 60
            elif fins:
                rec['A_final'] = min(fins)
            rec['A_final_best'] = min(fins) if fins else None
    # --- אפשרות B
    alight = None
    for c in ('11060', '12008'):
        if pa[c] and (alight is None or pa[c] < pa[alight]):
            alight = c
    if alight:
        walk = (2.5 if alight == '11060' else 3) * 60
        if '11011' in STOPS:
            walk = max(walk, dist(alight, '11011') * 1.3 / WALK * 60)
        ready = pa[alight] + walk
        rec['B_alight'] = alight
        rec['B_ready_11011'] = hhmm(ready)
        cand = []
        for lr, op in lrs(d, '348'):
            rides = locations(lr, op, d, 14, 30, 18, 0) or {}
            for sid, v in rides.items():
                b = passes(v['pts'], '11011')
                if not b:
                    continue
                a = first_after(passes(v['pts'], '10138'), b[0][0])
                cand.append({'sched_start': hhmm(ts(v['start'])), 'dep': b[0][0], 'arr': a[0] if a else None})
        cand.sort(key=lambda c: c['dep'])
        rec['B_buses_seen'] = [(c['sched_start'], hhmm(c['dep'])) for c in cand]
        nxt = next((c for c in cand if c['dep'] >= ready), None)
        prev = [c for c in cand if c['dep'] < ready]
        if prev:
            rec['B_missed_prev'] = [hhmm(prev[-1]['dep']), round((ready - prev[-1]['dep']) / 60, 1)]
        if nxt:
            rec['B_bus'] = [nxt['sched_start'], hhmm(nxt['dep'])]
            rec['B_wait_min'] = round((nxt['dep'] - ready) / 60, 1)
            if nxt['arr']:
                rec['B_arr10138'] = hhmm(nxt['arr'])
                wk = (dist('10138', '12003') * 1.25 / WALK) if KKL else 20
                rec['B_walk_min'] = round(wk, 1)
                rec['B_final_walk'] = nxt['arr'] + max(wk, 20) * 60
                best = rec['B_final_walk']
                # קו עירוני
                cbest = None
                for (clr, bc, ac, wb, wa, r) in city_opts:
                    rides = locations(clr, r['operator_ref'], d, 15, 0, 18, 30) or {}
                    rdy = nxt['arr'] + max(60, wb * 1.3 / WALK * 60)
                    for sid, v in rides.items():
                        bb = first_after(passes(v['pts'], bc), rdy)
                        if not bb:
                            continue
                        aa = first_after(passes(v['pts'], ac), bb[0])
                        if not aa:
                            continue
                        fin = aa[0] + wa * 1.25 / WALK * 60
                        if cbest is None or fin < cbest[0]:
                            cbest = (fin, r['route_short_name'], hhmm(bb[0]), hhmm(aa[0]), ac)
                if cbest:
                    rec['B_city'] = [cbest[1], cbest[2], cbest[3], cbest[4], hhmm(cbest[0])]
                    best = min(best, cbest[0])
                rec['B_final_best'] = best
    for k in ('A_final', 'A_final_best', 'B_final_walk', 'B_final_best'):
        if rec.get(k):
            rec[k + '_hhmm'] = hhmm(rec[k])
    return rec


res = []
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
    for r in ex.map(analyze_day, days):
        res.append(r)
        log('DAY', json.dumps({k: v for k, v in r.items() if not k.endswith(('_final', '_final_best', '_final_walk'))}, ensure_ascii=False))


def tod(t, d):
    return (t - ts(loc(datetime.date.fromisoformat(d), 0, 0))) / 60  # דקות מחצות


def stat(xs):
    if not xs:
        return None
    m = statistics.mean(xs)
    f = lambda v: f'{int(v // 60):02d}:{int(v % 60):02d}'
    return {'n': len(xs), 'mean': f(m), 'median': f(statistics.median(xs)), 'min': f(min(xs)), 'max': f(max(xs)),
            'sd_min': round(statistics.pstdev(xs), 1)}


S = {}
for k in ('A_final', 'A_final_best', 'B_final_walk', 'B_final_best'):
    S[k] = stat([tod(r[k], r['date']) for r in res if r.get(k)])
for c in ('10003', '11060', '12008'):
    S['455_at_' + c] = stat([int(r[f'455_at_{c}'][:2]) * 60 + int(r[f'455_at_{c}'][3:5]) + int(r[f'455_at_{c}'][6:]) / 60
                             for r in res if r.get(f'455_at_{c}')])
    late = [r[f'455_late_{c}_min'] for r in res if r.get(f'455_late_{c}_min') is not None]
    if late:
        S['455_late_' + c] = {'n': len(late), 'mean': round(statistics.mean(late), 1), 'median': round(statistics.median(late), 1),
                              'min': min(late), 'max': max(late)}
both = [r for r in res if r.get('A_final') and r.get('B_final_walk')]
S['both_n'] = len(both)
S['A_faster_vs_Bwalk'] = sum(r['A_final'] < r['B_final_walk'] for r in both)
S['A_faster_vs_Bbest'] = sum(r['A_final'] < r.get('B_final_best', r['B_final_walk']) for r in both)
S['diff_A_minus_Bwalk_min'] = sorted(round((r['A_final'] - r['B_final_walk']) / 60, 1) for r in both)
S['A_bus_dist'] = {}
for r in res:
    if r.get('A_bus'):
        S['A_bus_dist'][r['A_bus'][0] + '@' + r['A_bus'][1]] = S['A_bus_dist'].get(r['A_bus'][0] + '@' + r['A_bus'][1], 0) + 1
S['B_bus_dist'] = {}
for r in res:
    if r.get('B_bus'):
        S['B_bus_dist'][r['B_bus'][0]] = S['B_bus_dist'].get(r['B_bus'][0], 0) + 1
S['missing_days'] = [(r['date'], r.get('miss') or r.get('err')) for r in res if r.get('miss') or r.get('err')]
log('SUMMARY', json.dumps(S, ensure_ascii=False))
