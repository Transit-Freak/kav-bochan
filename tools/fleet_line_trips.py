#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""צי הרכבים — "לפי קו" (שלמה 25.10): אילו אוטובוסים נוסעים בכל קו, לפי רכבים ולפי נסיעות.

הסריקה הלילית (fleet_scan) שומרת רק באילו קווים כל רכב נסע, לא כמה. כאן נספרות הנסיעות
של כל רכב בכל קו, לכל חודש, בשלושת החודשים האחרונים (החודש הנוכחי ושניים לפניו).

מצב: fleet/data/fleet-line-trips-state.json.gz
  {"days": [ימים שנספרו], "m": {"YYYY-MM": {line_ref: {"op:רכב": נסיעות}}},
   "routes": {line_ref: [agency, מספר קו, תווית]}}
כל ריצה סורקת את הימים בחלון שעוד לא נספרו, מהחדש לישן (MAX_MIN — עצירה נקייה),
כך שהלילה הראשון ממלא חלק והשאר מתמלא בהמשך (chain ב-workflow). יום נספר פעם אחת בלבד.

פלט לאתר: fleet/data/fleet-lines.json — לכל קו: הדגמים, חשמליים וחדשים, לפי רכבים ולפי נסיעות.
BUILD_ONLY=1 — רק בניית הפלט מהמצב הקיים, בלי סריקה.
"""
import datetime
import gzip
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fleet_scan as fs   # noqa: E402 — אותו API, אותו מיפוי מסלולים, אותו מפתח רכב

OUTDIR = os.environ.get('OUTDIR', 'fleet/data')
STATE = f'{OUTDIR}/fleet-line-trips-state.json.gz'
OUT = f'{OUTDIR}/fleet-lines.json'
MAX_MIN = float(os.environ.get('MAX_MIN', '0'))
PAUSE = float(os.environ.get('PAUSE', '0.3'))
TODAY = datetime.date.today()
PAGE = fs.PAGE


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
    st['days'] = sorted(d for d in st['days'] if d >= start.isoformat())


def scan_day(day, routes):
    """{line_ref: {"op:רכב": נסיעות}} ליום אחד — שעה אחר שעה, כמו fleet_scan."""
    out = {}
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
            n += len(rows)
            if len(rows) < PAGE:
                break
            offset += PAGE
            time.sleep(PAUSE)
    print(f'{day}: {n} נסיעות', flush=True)
    return out


def gtfs_routes():
    """line_ref (=route_id ב-GTFS) → [agency, מספר קו, תווית ערים]."""
    from fleet_cities import S3, member_rows, central_dir
    day = TODAY - datetime.timedelta(days=1)
    url = S3.format(y=day.year, m=f'{day.month:02d}', d=f'{day.day:02d}')
    c, rows = member_rows(url, central_dir(url), 'routes.txt')
    out = {}
    for r in rows:
        out[r[c['route_id']]] = [r[c['agency_id']], (r[c['route_short_name']] or '').strip(),
                                 label(r[c['route_long_name']] or '')]
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


def build(st):
    fleet = json.load(open(f'{OUTDIR}/fleet.json', encoding='utf-8'))
    try:
        of = json.load(open(f'{OUTDIR}/fleet-official.json', encoding='utf-8')).get('of') or {}
    except Exception:  # noqa: BLE001 — בלי המאגר: בלי חשמליים
        of = {}
    names = {o['ref']: o['name'] for o in fleet['operators']}
    info = {}
    for o in fleet['operators']:
        for v in o['vehicles']:
            info[f"{o['ref']}:{v[0]}"] = (v[5] if len(v) > 5 else None, v[4] if len(v) > 4 else None, v[0])
    newy = TODAY.year - 1
    # קיבוץ: מפעיל + מספר קו + תווית (שני הכיוונים והחלופות של אותו קו — יחד)
    groups, labs = {}, {}
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
                g = groups.setdefault(key, {})
                g[k] = g.get(k, 0) + n
                lb = labs.setdefault(key, {})
                lb[rt[2]] = lb.get(rt[2], 0) + n
    lines = []
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
            o = of.get(plate)
            if o and 'חשמל' in (o[3] or ''):
                el[0] += 1
                el[1] += n
            if year and year >= newy:
                nw[0] += 1
                nw[1] += n
        ms = sorted(([mi.setdefault(m, len(mi)), a, b] for m, (a, b) in mods.items()), key=lambda x: -x[2])
        lines.append([op, no, lab, tv, tt, ms, el, nw])
    lines.sort(key=lambda x: (x[0], int(re.sub(r'\D', '', x[1]) or 0), x[1], x[2]))
    days = sorted(st['days'])
    out = {'updated': TODAY.isoformat(), 'from': days[0] if days else None,
           'to': days[-1] if days else None, 'ndays': len(days), 'newy': newy,
           'models': [m for m, _ in sorted(mi.items(), key=lambda x: x[1])], 'lines': lines}
    fs.jdump(out, OUT)
    print(f'{OUT}: {len(lines)} קווים · {len(days)} ימים', flush=True)


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
            t0 = time.time()
            for day in todo:
                if MAX_MIN and (time.time() - t0) / 60 > MAX_MIN:
                    print(f'MAX_MIN — עצירה נקייה לפני {day}', flush=True)
                    break
                try:
                    got = scan_day(day, routes)
                except Exception as e:  # noqa: BLE001 — היום לא נספר וייסרק שוב
                    print(f'::warning::דאטאבוס לא ענה ב-{day} ({e}) — ממשיך בריצה הבאה', flush=True)
                    break
                mon = st['m'].setdefault(day[:7], {})
                for line, vs in got.items():
                    dst = mon.setdefault(line, {})
                    for k, n in vs.items():
                        dst[k] = dst.get(k, 0) + n
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
