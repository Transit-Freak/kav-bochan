#!/usr/bin/env python3
"""הקווים האמיתיים של העיר למשחק: world/real_lines.json.

רק הקווים העירוניים — קו שמתחיל ונגמר בעיר (סוג "עירוני" ושני הקצוות בעיר). קווים בינעירוניים — בהמשך,
כשהמשחק יתרחב לכל הארץ; לכן הקובץ בנוי לפי עיר ("cities": {שם העיר: {...}}).

מקורות (מהמאגר, בלי להוריד את כל ההיסטוריה):
  - bus/data/routes.json — רשימת הקווים (route_id → מק"ט, מספר, תיאור, מפעיל, כיוון, סוג).
  - line-history/data/lines/<makat>-<dir>-H.json — מסלול הקו: הגרסה האחרונה (התחנות לפי קוד, והצורה).
  - bus/data/days/<date>.json — לכל route_id: הנסיעות המתוכננות ביום, וההתפלגות לפי שעה (לתדירות בכל שעה).
  - world/gtfs_stops.csv ו-world/city.json — התחנות של המשחק (כדי להתאים את קודי התחנות).

שימוש:
  # שליפת הקבצים לתיקייה (מתוך ריפו חלקי: git show בלבד)
  python3 tools/build_real_lines.py --fetch SRC_DIR --date 2026-11-09
  python3 tools/build_real_lines.py --src SRC_DIR
"""
import argparse, csv, json, math, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
WORLD = os.path.join(HERE, '..', 'world')
CITY = 'קרית מלאכי'          # כך בנתוני משרד התחבורה (בעיר במשחק: "קריית מלאכי")


def git_show(path, out):
    data = subprocess.run(['git', 'show', f'origin/main:{path}'], capture_output=True, check=True).stdout
    with open(out, 'wb') as f:
        f.write(data)


def urban_routes(routes):
    """route_id → (מק"ט, מספר, כיוון, מפעיל, תיאור) לקווים העירוניים שמתחילים ונגמרים בעיר"""
    out = {}
    for rid, r in routes.items():
        makat, num, desc, op, dirn = r[0], r[1], r[2], r[3], r[4]
        kind = r[9] if len(r) > 9 else ''
        if kind != 'עירוני' or '<->' not in desc:
            continue
        a, b = desc.split('<->', 1)
        if CITY in a and CITY in b:
            out[rid] = dict(makat=makat, number=num, dir=dirn, op=op, desc=desc)
    return out


def decode_polyline(s, prec=5):
    pts, i, lat, lon = [], 0, 0, 0
    while i < len(s):
        for k in range(2):
            shift = res = 0
            while True:
                b = ord(s[i]) - 63; i += 1
                res |= (b & 0x1f) << shift; shift += 5
                if b < 0x20:
                    break
            d = ~(res >> 1) if res & 1 else res >> 1
            if k == 0: lat += d
            else: lon += d
        pts.append((lat / 10 ** prec, lon / 10 ** prec))
    return pts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', help='תיקייה עם routes.json, day.json וקבצי הקווים')
    ap.add_argument('--fetch', help='לשלוף את הקבצים מ-origin/main לתיקייה הזו')
    ap.add_argument('--date', default='2026-11-09')
    a = ap.parse_args()
    src = a.src or a.fetch
    if not src:
        sys.exit('צריך --src או --fetch')
    if a.fetch:
        os.makedirs(src, exist_ok=True)
        git_show('bus/data/routes.json', os.path.join(src, 'routes.json'))
        git_show(f'bus/data/days/{a.date}.json', os.path.join(src, 'day.json'))
    routes = json.load(open(os.path.join(src, 'routes.json')))
    urban = urban_routes(routes)
    if a.fetch:
        for r in urban.values():
            f = f"{r['makat']}-{r['dir']}-H.json"
            try: git_show(f'line-history/data/lines/{f}', os.path.join(src, f))
            except subprocess.CalledProcessError: print('חסר', f)

    # התחנות של המשחק, והמרה מקו רוחב/אורך למערכת המשחק (התאמה ליניארית לפי התחנות עצמן)
    city = json.load(open(os.path.join(WORLD, 'city.json')))
    gtfs = {r['stop_id']: r for r in csv.DictReader(open(os.path.join(WORLD, 'gtfs_stops.csv'), encoding='utf-8'))}
    gstops = city['stops']
    by_code = {s['code']: s for s in gstops}
    o_lat, o_lon = city['meta']['origin']
    kx = 111320 * math.cos(math.radians(o_lat)); ky = 110574
    pairs = [(s, gtfs[s['id']]) for s in gstops if s['id'] in gtfs]
    # x = sx·(lon−lon0)·kx, y = sy·(lat−lat0)·ky — מקדמי הקנה מידה לפי ממוצע (במשחק ייתכן שינוי יחידות)
    sx = sum(s['x'] * (float(g['stop_lon']) - o_lon) * kx for s, g in pairs) / sum(((float(g['stop_lon']) - o_lon) * kx) ** 2 for s, g in pairs)
    sy = sum(s['y'] * (float(g['stop_lat']) - o_lat) * ky for s, g in pairs) / sum(((float(g['stop_lat']) - o_lat) * ky) ** 2 for s, g in pairs)
    to_xy = lambda lat, lon: (round(sx * (lon - o_lon) * kx, 1), round(sy * (lat - o_lat) * ky, 1))

    day = json.load(open(os.path.join(src, 'day.json')))
    rday = {r[0]: r for r in day['routes']}

    lines = []
    for rid, r in sorted(urban.items(), key=lambda kv: (int(''.join(c for c in kv[1]['number'] if c.isdigit()) or 0), kv[1]['dir'])):
        f = os.path.join(src, f"{r['makat']}-{r['dir']}-H.json")
        if not os.path.exists(f):
            print('אין מסלול ל', rid, r['number']); continue
        L = json.load(open(f))
        v = L['versions'][-1]
        pool = L['pool']
        codes = [pool[i][0] for i in v['stops']]
        ids, missing = [], []
        for i, c in zip(v['stops'], codes):
            s = by_code.get(c)
            if not s:
                # תחנה שלא במשחק: הכי קרובה עד 60 מ' (במערכת המשחק)
                x, y = to_xy(pool[i][2], pool[i][3])
                best = min(gstops, key=lambda q: (q['x'] - x) ** 2 + (q['y'] - y) ** 2)
                if math.hypot(best['x'] - x, best['y'] - y) <= 60 * abs(sx): s = best
            if s:
                if not ids or ids[-1] != s['id']: ids.append(s['id'])
            else:
                missing.append(c)
        shape = []
        if v.get('shp') is not None and L.get('spool'):
            try: shape = [list(to_xy(la, lo)) for la, lo in decode_polyline(L['spool'][v['shp']])]
            except Exception: shape = []
        # תדירות לפי שעה: הנסיעות המתוכננות ביום, מחולקות לפי ההתפלגות שנמדדה בכל שעה
        hw, trips = {}, 0
        d = rday.get(rid)
        if d:
            trips = d[1]
            hours = [(h[0], h[1]) for h in d[7]]
            tot = sum(n for _, n in hours) or 1
            for h, n in hours:
                t = trips * n / tot
                if t >= 0.5: hw[str(h)] = max(5, min(60, int(round(60 / t / 5) * 5) or 5))
        a_, b_ = r['desc'].split('<->', 1)
        clean = lambda s: s.split('-')[0].strip()
        lines.append(dict(number=r['number'], makat=r['makat'], dir=r['dir'], route_id=rid, operator=r['op'],
                          origin=clean(a_), dest=clean(b_.rsplit('-', 1)[0]), version=v.get('d'),
                          stops=ids, missing=missing, shape=shape, trips=trips, headway=hw))
        print(f"קו {r['number']} כיוון {r['dir']} ({rid}): {len(ids)} תחנות במשחק, {len(missing)} חסרות, {trips} נסיעות ביום, תדירות {hw}")

    out = dict(built=day.get('d'), src='bus/data/routes.json, line-history/data/lines, bus/data/days', note='רק קווים עירוניים (מתחילים ונגמרים בעיר)',
               cities={city['meta']['city']: dict(lines=lines)})
    with open(os.path.join(WORLD, 'real_lines.json'), 'w', encoding='utf-8') as fo:
        json.dump(out, fo, ensure_ascii=False, separators=(',', ':'))
    print('נכתב world/real_lines.json:', len(lines), 'כיוונים')


if __name__ == '__main__':
    main()
