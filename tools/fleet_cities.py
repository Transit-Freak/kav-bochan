#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""צי הרכבים — שיוך רכבים לערים.

לכל רכב נשמרים בסריקה הקווים (line_ref) שבהם שידר. כאן ממפים כל קו
לערי המוצא והיעד שלו מתוך routes.txt של ה-GTFS היומי (בבקשות Range,
בלי להוריד את כל הקובץ), ובונים תמונת-עיר: כמה רכבים שונים פועלים
בכל עיר, מאילו חברות ומאילו שנתונים.

route_long_name בפורמט "תחנה-עיר<->תחנה-עיר-מק" — העיר היא הרכיב
האחרון בכל צד. הפלט: fleet/data/fleet-cities.json.
"""
import datetime
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from backfill_geo import central_dir, member_rows  # noqa: E402

S3 = ('https://openbus-stride-public.s3.eu-west-1.amazonaws.com'
      '/gtfs_archive/{y}/{m}/{d}/israel-public-transportation.zip')
MBASE = 2020 * 12   # ביט 0 במסיכת חודשי-הפעילות = ינואר 2020 (כמו fleet_scan)
OUTDIR = os.environ.get('OUTDIR', 'fleet/data')
STATE = f'{OUTDIR}/fleet-state.json'
FLEET = f'{OUTDIR}/fleet.json'
OUT = f'{OUTDIR}/fleet-cities.json'


def lm_covered(root):
    """מסיכת החודשים שבהם נרשם לכל קו מתי שירת אותו (lm_cov): חודש מכוסה אם נרשמו בו לפחות חצי
    מהימים — מימי החודש כולו, ובחודש הנוכחי מהימים שעברו עד הסריקה האחרונה."""
    days = {}
    cov = root.get('lm_cov') or []
    last = max((datetime.date.fromisoformat(r[1]) for r in cov), default=None)
    for a, b in cov:
        d, e = datetime.date.fromisoformat(a), datetime.date.fromisoformat(b)
        while d <= e:
            mi = d.year * 12 + d.month - 1 - MBASE
            days[mi] = days.get(mi, 0) + 1
            d += datetime.timedelta(days=1)
    m = 0
    for mi, n in days.items():
        y, mo = divmod(mi + MBASE, 12)
        first = datetime.date(y, mo + 1, 1)
        nxt = datetime.date(y + (mo + 1) // 12, (mo + 1) % 12 + 1, 1)
        span = (min(nxt - datetime.timedelta(days=1), last) - first).days + 1
        if mi >= 0 and n * 2 >= span:
            m |= 1 << mi
    return m


def city_masks(vals, rc, covered):
    """לכל עיר: באילו חודשים הרכב פעל בה (מסיכה).
    שלמה 06.11: בחירת חודש הציגה בעיר רכבים שפעלו בה רק בחודש אחר.
    בחודשים המכוסים (covered) — לפי החודשים שבהם הרכב שירת כל קו (vals[6]: קו → [ראשון, אחרון]).
    בחודשים שלא נרשמו בהם קווים — כמו קודם: כל חודש שבו הרכב פעל נספר לכל הערים שלו."""
    mask = vals[5] if len(vals) > 5 else 0
    lm = vals[6] if len(vals) > 6 and isinstance(vals[6], dict) else {}
    lines = [str(x) for x in (vals[4] if len(vals) > 4 else [])]
    lines += [x for x in lm if x not in lines]
    gap = mask & ~covered
    out = {}
    for ln in lines:
        ent = lm.get(ln)
        m = gap
        if ent:
            a, b = ent
            m |= (((1 << (b + 1)) - 1) ^ ((1 << a) - 1)) & covered
        m &= mask
        if not m:
            continue
        for c in rc.get(ln, ()):
            out[c] = out.get(c, 0) | m
    return out

def route_cities():
    """route_id (=line_ref בסירי) → קבוצת ערים, מתוך ה-GTFS של אתמול."""
    day = datetime.date.today() - datetime.timedelta(days=1)
    url = S3.format(y=day.year, m=f'{day.month:02d}', d=f'{day.day:02d}')
    c, rows = member_rows(url, central_dir(url), 'routes.txt')
    out = {}
    for r in rows:
        rid = r[c['route_id']]
        name = (r[c['route_long_name']] or '')
        cities = set()
        for side in name.split('<->'):
            # קיצוץ סיומת מק"ט/כיוון/חלופה: "-12165-1#", "-2#", "-1ב" — לא ערים
            side = re.sub(r'(-\d+[א-ת]?#?\s*)+$', '', side).strip()
            if '-' in side:
                city = side.rsplit('-', 1)[1].strip()
                if city:
                    cities.add(city)
        if cities:
            out[rid] = cities
    print(f'GTFS: {len(out)} מסלולים עם ערים', flush=True)
    return out


def main():
    with open(STATE, encoding='utf-8') as f:
        root = json.load(f)
    state = root['vehicles']
    cov0 = lm_covered(root)
    with open(FLEET, encoding='utf-8') as f:
        fleet = json.load(f)
    # שנת ייצור לפי לוחית (אחרי העשרה, פורמט v2: שנה במקום 4)
    ybase = 4 if fleet.get('v') == 2 else 3
    year_of = {}
    # נספרים רק רכבים שמופיעים באתר עצמו (מפעילי אוטובוסים אמיתיים,
    # מאומתים מול מאגר הרישוי) — בלי רכבת/רק"ל ובלי מזהים פנימיים
    allowed = set()
    for op in fleet['operators']:
        for v in op['vehicles']:
            key = f"{op['ref']}:{v[0]}"
            allowed.add(key)
            if len(v) > ybase and v[ybase]:
                year_of[key] = v[ybase]

    rc = route_cities()
    # אילו רכבים פעילים עכשיו (שידרו בחודש האחרון) — לספירת "פעילים בעיר"
    import datetime as _dt
    _upd = _dt.date.fromisoformat(fleet['updated'])
    _ret = fleet.get('retire_days', 30)
    active = set()
    for op in fleet['operators']:
        for v in op['vehicles']:
            if (_upd - _dt.date.fromisoformat(v[2])).days <= _ret:
                active.add(f"{op['ref']}:{v[0]}")
    cities = {}
    linked = 0
    for key, vals in state.items():
        if key not in allowed:
            continue
        lines = vals[4] if len(vals) > 4 else []
        if not lines:
            continue
        op = int(key.split(':', 1)[0])
        vset = set()
        for ln in lines:
            vset |= rc.get(str(ln), set())
        if vset:
            linked += 1
        cmask = city_masks(vals, rc, cov0)
        is_act = key in active
        for city in vset:
            mask = cmask.get(city, 0)
            ct = cities.setdefault(city,
                                   {'total': 0, 'act': 0, 'ops': {}, 'opsa': {},
                                    'years': {}, 'months': {}, 'opm': {}})
            ct['total'] += 1
            ct['ops'][op] = ct['ops'].get(op, 0) + 1
            if is_act:
                ct['act'] += 1
                ct['opsa'][op] = ct['opsa'].get(op, 0) + 1
            y = year_of.get(key)
            if y:
                ct['years'][str(y)] = ct['years'].get(str(y), 0) + 1
            # ספירה חודשית: הרכב נספר לעיר רק בחודשים שבהם שירת קו שעובר בה (city_masks).
            # opm = אותה ספירה בפילוח לפי חברה (בקשת שלמה: בחירת חודש
            # מציגה את גרף החברות של אותו חודש)
            om = ct['opm'].setdefault(op, {})
            ym = ct.setdefault('ym', {}).setdefault(str(y), {}) if y else None
            b, i = mask, 0
            while b:
                if b & 1:
                    t = MBASE + i
                    m = f'{t // 12}-{t % 12 + 1:02d}'
                    ct['months'][m] = ct['months'].get(m, 0) + 1
                    om[m] = om.get(m, 0) + 1
                    if ym is not None:
                        ym[m] = ym.get(m, 0) + 1
                b >>= 1
                i += 1

    # רק ערים עם נוכחות ממשית, ממוינות לפי גודל
    out = {'updated': datetime.date.today().isoformat(),
           'cities': {c: {'total': d['total'],
                          'act': d.get('act', 0),
                          'ops': sorted(d['ops'].items(), key=lambda x: -x[1]),
                          'opsa': {str(o): n for o, n in d.get('opsa', {}).items()},
                          'years': d['years'],
                          **({'months': dict(sorted(d['months'].items()))}
                             if d.get('months') else {}),
                          **({'opm': {str(o): m for o, m in d['opm'].items() if m}}
                             if any(d.get('opm', {}).values()) else {}),
                          **({'ym': d['ym']} if d.get('ym') else {})}
                      for c, d in cities.items() if d['total'] >= 3}}
    tmp = f'{OUT}.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, OUT)
    print(f'ערים: {len(out["cities"])} · רכבים משויכים: {linked}', flush=True)


if __name__ == '__main__':
    sys.exit(main())
