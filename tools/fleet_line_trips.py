#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""צי הרכבים — "לפי קו" (שלמה 25.10): אילו אוטובוסים נוסעים בכל קו, לפי רכבים ולפי נסיעות.

הסריקה הלילית (fleet_scan) שומרת רק באילו קווים כל רכב נסע, לא כמה. כאן נספרות הנסיעות
של כל רכב בכל קו, לכל חודש, בשלושת החודשים האחרונים (החודש הנוכחי ושניים לפניו).

מצב: fleet/data/fleet-line-trips-state.json.gz
  {"days": [ימים שנספרו], "m": {"YYYY-MM": {line_ref: {"op:רכב": נסיעות}}},
   "dep": {"YYYY-MM": {line_ref: {"HH:MM": [נסיעות, חשמליות, דגם, נסיעות, דגם, נסיעות...]}}},
   "models": [שמות הדגמים — המספרים ב-dep], "routes": {line_ref: [agency, מספר קו, תווית, כיוון]}}
"dep" — לכל נסיעה (שעת יציאה) בקו: באילו דגמים היא נעשתה (שלמה 25.10: "לבחור נסיעה לבדוק").
נשמרים הדגמים ולא הרכבים עצמם — אחרת המצב היה עשרות מגה.
כל ריצה סורקת את הימים בחלון שעוד לא נספרו, מהחדש לישן (MAX_MIN — עצירה נקייה),
כך שהלילה הראשון ממלא חלק והשאר מתמלא בהמשך (chain ב-workflow). יום נספר פעם אחת בלבד.

פלט לאתר: fleet/data/fleet-lines.json — לכל קו: הדגמים, חשמליים וחדשים, לפי רכבים ולפי נסיעות;
fleet/data/lines/<מפעיל>-<מספר הקו ב-hex>.json — הנסיעות לפי שעה, לכל כיוון (נטען רק כשפותחים את הקו).
BUILD_ONLY=1 — רק בניית הפלט מהמצב הקיים, בלי סריקה.
"""
import datetime
import gzip
import json
import os
import re
import sys
import time
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fleet_scan as fs   # noqa: E402 — אותו API, אותו מיפוי מסלולים, אותו מפתח רכב

OUTDIR = os.environ.get('OUTDIR', 'fleet/data')
STATE = f'{OUTDIR}/fleet-line-trips-state.json.gz'
OUT = f'{OUTDIR}/fleet-lines.json'
MAX_MIN = float(os.environ.get('MAX_MIN', '0'))
PAUSE = float(os.environ.get('PAUSE', '0.3'))
TODAY = datetime.date.today()
PAGE = fs.PAGE
IL = ZoneInfo('Asia/Jerusalem')


def window():
    """החלון: מהראשון של החודש לפני-הקודם ועד אתמול."""
    y, m = TODAY.year, TODAY.month - 2
    if m < 1:
        y, m = y - 1, m + 12
    return datetime.date(y, m, 1), TODAY - datetime.timedelta(days=1)


def load_state():
    if os.path.exists(STATE):
        with gzip.open(STATE, 'rt', encoding='utf-8') as f:
            return json.load(f)
    return {'days': [], 'm': {}, 'routes': {}}


def save_state(st):
    tmp = STATE + '.tmp'
    with gzip.open(tmp, 'wt', encoding='utf-8') as f:
        json.dump(st, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, STATE)


def prune(st, start):
    """זורקים חודשים וימים שיצאו מהחלון."""
    m0 = start.isoformat()[:7]
    st['m'] = {k: v for k, v in st['m'].items() if k >= m0}
    st['dep'] = {k: v for k, v in st.setdefault('dep', {}).items() if k >= m0}
    st['days'] = sorted(d for d in st['days'] if d >= start.isoformat())


def hhmm(t):
    """שעת היציאה המתוכננת בשעון ישראל."""
    try:
        return datetime.datetime.fromisoformat(t.replace('Z', '+00:00')).astimezone(IL).strftime('%H:%M')
    except Exception:  # noqa: BLE001
        return None


def scan_day(day, routes):
    """({line_ref: {"op:רכב": נסיעות}}, {line_ref: {"HH:MM": ["op:רכב", ...]}}) ליום אחד —
    שעה אחר שעה, כמו fleet_scan."""
    out, dep = {}, {}
    n = 0
    for h in range(24):
        frm, to = f'{day}T{h:02d}:00:00+02:00', f'{day}T{h:02d}:59:59+02:00'
        offset = 0
        while True:
            rows = fs.get('/siri_rides/list', limit=PAGE, offset=offset,
                          scheduled_start_time_from=frm, scheduled_start_time_to=to,
                          order_by='id asc')
            for r in rows:
                v = (r.get('vehicle_ref') or '').strip()
                if not v or v == '0':
                    continue
                ent = routes.get(r.get('siri_route_id'))
                if not ent or ent[0] is None or not ent[1]:
                    continue
                op, line = ent
                d = out.setdefault(str(line), {})
                k = f'{op}:{v}'
                d[k] = d.get(k, 0) + 1
                t = hhmm(r.get('scheduled_start_time') or '')
                if t:
                    dep.setdefault(str(line), {}).setdefault(t, []).append(k)
            n += len(rows)
            if len(rows) < PAGE:
                break
            offset += PAGE
            time.sleep(PAUSE)
    print(f'{day}: {n} נסיעות', flush=True)
    return out, dep


def vehicle_info():
    """"op:רכב" → (דגם, שנתון, לוחית), ולוחית → חשמלי — מצי הרכבים המועשר ומהמאגר הרשמי."""
    fleet = json.load(open(f'{OUTDIR}/fleet.json', encoding='utf-8'))
    try:
        of = json.load(open(f'{OUTDIR}/fleet-official.json', encoding='utf-8')).get('of') or {}
    except Exception:  # noqa: BLE001 — בלי המאגר: בלי חשמליים
        of = {}
    info = {}
    for o in fleet['operators']:
        for v in o['vehicles']:
            info[f"{o['ref']}:{v[0]}"] = (v[5] if len(v) > 5 else None, v[4] if len(v) > 4 else None, v[0])
    elec = {p for p, o in of.items() if o and len(o) > 3 and 'חשמל' in (o[3] or '')}
    return fleet, info, elec


def add_dep(st, mon, dep, info, elec):
    """מוסיף יום של נסיעות-לפי-שעה למצב, כספירת דגמים."""
    models = st.setdefault('models', [])
    mi = {m: i for i, m in enumerate(models)}
    dst = st.setdefault('dep', {}).setdefault(mon, {})
    for line, times in dep.items():
        dl = dst.setdefault(line, {})
        for t, keys in times.items():
            cur = dl.get(t) or [0, 0]
            cnt = {cur[i]: cur[i + 1] for i in range(2, len(cur), 2)}
            for k in keys:
                model, _, plate = info.get(k, (None, None, k.split(':', 1)[1]))
                m = model or ''
                if m not in mi:
                    mi[m] = len(models)
                    models.append(m)
                cnt[mi[m]] = cnt.get(mi[m], 0) + 1
                cur[0] += 1
                if plate in elec:
                    cur[1] += 1
            dl[t] = cur[:2] + [x for i, n in sorted(cnt.items(), key=lambda x: -x[1]) for x in (i, n)]


def gtfs_routes():
    """line_ref (=route_id ב-GTFS) → [agency, מספר קו, תווית ערים]."""
    from fleet_cities import S3, member_rows, central_dir
    day = TODAY - datetime.timedelta(days=1)
    url = S3.format(y=day.year, m=f'{day.month:02d}', d=f'{day.day:02d}')
    c, rows = member_rows(url, central_dir(url), 'routes.txt')
    out = {}
    for r in rows:
        nm = r[c['route_long_name']] or ''
        out[r[c['route_id']]] = [r[c['agency_id']], (r[c['route_short_name']] or '').strip(),
                                 label(nm), direction(nm)]
    print(f'GTFS: {len(out)} מסלולים', flush=True)
    return out


def label(name):
    """"מסוף X-פתח תקווה<->ת. Y-בת ים-10" → "פתח תקווה ↔ בת ים" (אותה עיר → שם העיר)."""
    sides = []
    for side in name.split('<->'):
        side = re.sub(r'(-\d+[א-ת]?#?\s*)+$', '', side).strip()
        city = side.rsplit('-', 1)[1].strip() if '-' in side else ''
        sides.append(city)
    sides = [s for s in sides if s]
    if not sides:
        return ''
    if len(sides) == 1 or sides[0] == sides[-1]:
        return sides[0]
    return f'{sides[0]} ↔ {sides[-1]}'


def direction(name):
    """"מסוף X/רציפים-פתח תקווה<->ת. Y/דרך בגין-בת ים-10" → [פתח תקווה, מסוף X, בת ים, ת. Y]."""
    out = []
    for side in name.split('<->')[:2]:
        side = re.sub(r'(-\d+[א-ת]?#?\s*)+$', '', side).strip()
        stop, city = (side.rsplit('-', 1) + [''])[:2] if '-' in side else (side, '')
        out += [city.strip(), stop.split('/')[0].strip()]
    return (out + ['', '', '', ''])[:4]


def build(st):
    fleet, info, elec = vehicle_info()
    names = {o['ref']: o['name'] for o in fleet['operators']}
    newy = TODAY.year - 1
    # קיבוץ: מפעיל + מספר קו + תווית (שני הכיוונים והחלופות של אותו קו — יחד)
    groups, labs, rkey = {}, {}, {}
    for mon in st['m'].values():
        for line, vs in mon.items():
            rt = st['routes'].get(line)
            if not rt or not rt[1]:
                continue
            for k, n in vs.items():
                op = int(k.split(':', 1)[0])
                if op not in names:
                    continue   # רכבת, רק"ל, מוניות — לא בצי הרכבים
                # שני הכיוונים — אותה קבוצה; התווית המוצגת: של הכיוון עם הכי הרבה נסיעות
                key = (op, rt[1], ' ↔ '.join(sorted(rt[2].split(' ↔ '))))
                rkey[line] = key
                g = groups.setdefault(key, {})
                g[k] = g.get(k, 0) + n
                lb = labs.setdefault(key, {})
                lb[rt[2]] = lb.get(rt[2], 0) + n
    lines, shown = [], {}
    mi = {}   # שמות הדגמים פעם אחת, בקווים — מספר הדגם ברשימה
    for key, vs in groups.items():
        op, no = key[0], key[1]
        lab = max(labs[key].items(), key=lambda x: x[1])[0]
        tv, tt = len(vs), sum(vs.values())
        if tv < 3:
            continue
        mods, el, nw = {}, [0, 0], [0, 0]
        for k, n in vs.items():
            model, year, plate = info.get(k, (None, None, k.split(':', 1)[1]))
            e = mods.setdefault(model or '', [0, 0])
            e[0] += 1
            e[1] += n
            if plate in elec:
                el[0] += 1
                el[1] += n
            if year and year >= newy:
                nw[0] += 1
                nw[1] += n
        ms = sorted(([mi.setdefault(m, len(mi)), a, b] for m, (a, b) in mods.items()), key=lambda x: -x[2])
        lines.append([op, no, lab, tv, tt, ms, el, nw])
        shown[key] = f'{op}|{no}|{lab}'
    lines.sort(key=lambda x: (x[0], int(re.sub(r'\D', '', x[1]) or 0), x[1], x[2]))
    days = sorted(st['days'])
    out = {'updated': TODAY.isoformat(), 'from': days[0] if days else None,
           'to': days[-1] if days else None, 'ndays': len(days), 'newy': newy,
           'models': [m for m, _ in sorted(mi.items(), key=lambda x: x[1])], 'lines': lines}
    fs.jdump(out, OUT)
    print(f'{OUT}: {len(lines)} קווים · {len(days)} ימים', flush=True)
    build_dep(st, rkey, shown)


def build_dep(st, rkey, shown):
    """lines/<מפעיל>-<מספר>.json: {"models": [...], "g": {מזהה קו: [[מעיר, מתחנה, לעיר, לתחנה, {"HH:MM":
    [נסיעות, חשמליות, דגם, נסיעות...]}], ...]}} — קובץ לכל מספר קו של מפעיל (קטן — נטען רק כשפותחים קו).
    כיוונים וחלופות עם אותו מוצא ויעד מתאחדים."""
    per = {}
    for mon in st.get('dep', {}).values():
        for line, times in mon.items():
            key = rkey.get(line)
            if key not in shown:
                continue
            d4 = tuple(st['routes'][line][3]) if len(st['routes'][line]) > 3 else ('', '', '', '')
            dirs = per.setdefault((key[0], key[1]), {}).setdefault(shown[key], {}).setdefault(d4, {})
            for t, arr in times.items():
                cur = dirs.setdefault(t, [0, 0, {}])
                cur[0] += arr[0]
                cur[1] += arr[1]
                for i in range(2, len(arr), 2):
                    cur[2][arr[i]] = cur[2].get(arr[i], 0) + arr[i + 1]
    d = os.path.join(OUTDIR, 'lines')
    os.makedirs(d, exist_ok=True)
    keep = set()
    for (op, no), g in per.items():
        out = {}
        for lid, dirs in g.items():
            out[lid] = [list(d4) + [{t: c[:2] + [x for m, n in sorted(c[2].items(), key=lambda y: -y[1]) for x in (m, n)]
                                     for t, c in sorted(dirs[d4].items())}]
                        for d4 in sorted(dirs, key=lambda x: -sum(c[0] for c in dirs[x].values()))]
        fn = f"{op}-{no.encode('utf-8').hex()}.json"
        keep.add(fn)
        used = sorted({x[4][t][i] for v in out.values() for x in v for t in x[4] for i in range(2, len(x[4][t]), 2)})
        fs.jdump({'updated': TODAY.isoformat(), 'models': {i: st['models'][i] for i in used}, 'g': out}, os.path.join(d, fn))
    for fn in os.listdir(d):
        if fn.endswith('.json') and fn not in keep:
            os.remove(os.path.join(d, fn))
    print(f'{d}: {len(keep)} קבצי קווים', flush=True)


def main():
    st = load_state()
    start, end = window()
    prune(st, start)
    try:
        st['routes'].update(gtfs_routes())
    except Exception as e:  # noqa: BLE001 — נשארים עם המיפוי השמור
        print(f'::warning::GTFS לא נטען ({e}) — המיפוי השמור בשימוש', flush=True)
    nscan = 0
    if os.environ.get('BUILD_ONLY') != '1':
        done = set(st['days'])
        todo = []
        d = end
        while d >= start:
            if d.isoformat() not in done:
                todo.append(d.isoformat())
            d -= datetime.timedelta(days=1)
        print(f'חלון {start} → {end} · נספרו {len(done)} ימים · חסרים {len(todo)}', flush=True)
        if todo:
            routes = fs.route_operator_map()
            _, vinfo, elec = vehicle_info()
            t0 = time.time()
            for day in todo:
                if MAX_MIN and (time.time() - t0) / 60 > MAX_MIN:
                    print(f'MAX_MIN — עצירה נקייה לפני {day}', flush=True)
                    break
                try:
                    got, dep = scan_day(day, routes)
                except Exception as e:  # noqa: BLE001 — היום לא נספר וייסרק שוב
                    print(f'::warning::דאטאבוס לא ענה ב-{day} ({e}) — ממשיך בריצה הבאה', flush=True)
                    break
                mon = st['m'].setdefault(day[:7], {})
                for line, vs in got.items():
                    dst = mon.setdefault(line, {})
                    for k, n in vs.items():
                        dst[k] = dst.get(k, 0) + n
                add_dep(st, day[:7], dep, vinfo, elec)
                st['days'].append(day)
                nscan += 1
                save_state(st)   # שמירה אחרי כל יום — ריצה שנקטעת לא מאבדת כלום
    # מסלולים שכבר לא בשימוש בחלון — לא שומרים
    used = {ln for mon in st['m'].values() for ln in mon}
    st['routes'] = {k: v for k, v in st['routes'].items() if k in used}
    save_state(st)
    build(st)
    start2, _ = window()
    left = sum(1 for i in range((end - start2).days + 1)
               if (start2 + datetime.timedelta(days=i)).isoformat() not in set(st['days']))
    print(f'LEFT={left}')
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as f:
            f.write(f'left={left}\nscanned={nscan}\n')


if __name__ == '__main__':
    main()
