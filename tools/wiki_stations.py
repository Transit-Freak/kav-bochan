#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ויקי-בודק — נתוני אמת על תחנות מרכזיות ומסופים.

לעורכי ויקיפדיה: בערכים של תחנות מרכזיות ומסופים יש הרבה רשימות קווים
לא מעודכנות. כאן בונים מקובץ ה-GTFS הרשמי של משרד התחבורה את רשימת
הקווים שמתחילים או מסתיימים בכל תחנה מרכזית/מסוף — קו, מפעיל ויעדים.

route_long_name בפורמט "תחנה-עיר<->תחנה-עיר-מק" — צד = נקודת קצה של
הקו. תחנה נחשבת מרכזית/מסוף לפי שמה. הפלט: wiki-check/data/stations.json
בפורמט {updated, stations:{"שם התחנה": {city, lines:[[קו, מפעיל, [יעדים], רציף]]}}}.
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
OUT = os.environ.get('OUT', 'wiki-check/data/stations.json')
SUFFIX = re.compile(r'(-\d+[א-ת]?#?\s*)+$')   # מק"ט/כיוון/חלופה בסוף השם
STATION_WORDS = ('מרכזית', 'מסוף')


PLATFORM = re.compile(r'רציפ(?:ים)?\s*[-:]?\s*([A-Za-z0-9א-ת]{1,3})\b')


def parse_side(side):
    """"ת. מרכזית טבריה/רציף 12-טבריה-1א" → (תחנה, עיר, רציף) או None."""
    side = SUFFIX.sub('', side).strip()
    if '-' not in side:
        return None
    stop, city = side.rsplit('-', 1)
    stop, city = stop.strip(), city.strip()
    if not stop or not city:
        return None
    # הרציף — מהחלק שאחרי ה-'/' בשם התחנה (כמו בערכים: עמודת רציף)
    plat = ''
    if '/' in stop:
        m = PLATFORM.search(stop.split('/', 1)[1])
        if m and m.group(1) not in ('ם',):
            plat = m.group(1)
    return stop, city, plat


def station_key(stop):
    """שם התחנה בלי רציף/הורדה/קומה — "ת.מרכזית ת"א קומה 6" → "ת.מרכזית ת"א"."""
    base = stop.split('/')[0].strip()
    base = re.sub(r'\s*קומה\s*\d+\s*$', '', base)
    base = re.sub(r'\s+', ' ', base).strip()
    # מסוף ארלוזורוב (סבידור) — ב-GTFS מופיע בכמה שמות בלי "מסוף" בכלל
    if 'סבידור' in base or base == 'תל אביב מרכז':
        return 'מסוף ארלוזורוב (סבידור)'
    return base


def main():
    day = datetime.date.today() - datetime.timedelta(days=1)
    url = S3.format(y=day.year, m=f'{day.month:02d}', d=f'{day.day:02d}')
    cd = central_dir(url)
    ca, arows = member_rows(url, cd, 'agency.txt')
    agency = {r[ca['agency_id']]: (r[ca['agency_name']] or '').strip() for r in arows}
    cr, rrows = member_rows(url, cd, 'routes.txt')

    stations = {}
    for r in rrows:
        line = (r[cr['route_short_name']] or '').strip()
        if not line:
            continue
        op = agency.get(r[cr['agency_id']], '').strip()
        sides = [parse_side(s) for s in (r[cr['route_long_name']] or '').split('<->')]
        sides = [s for s in sides if s]
        if len(sides) != 2:
            continue
        for me, other in ((sides[0], sides[1]), (sides[1], sides[0])):
            base = station_key(me[0])
            if not any(w in base for w in STATION_WORDS):
                continue
            key = f'{base}|{me[1]}'
            st = stations.setdefault(key, {'name': base, 'city': me[1], 'lines': {}})
            lk = f'{line}|{op}'
            ent = st['lines'].setdefault(lk, {'line': line, 'op': op,
                                              'dests': set(), 'plats': set()})
            # היעד: העיר שבקצה השני, ואם זו אותה עיר — התחנה שבקצה השני
            dest = other[1] if other[1] != me[1] else station_key(other[0])
            ent['dests'].add(dest)
            if me[2]:
                ent['plats'].add(me[2])

    def linekey(x):
        m = re.match(r'\d+', x['line'])
        return (int(m.group()) if m else 10 ** 6, x['line'], x['op'])

    # שם תחנה שחוזר בכמה ערים (נדיר) — מקבל סוגריים עם שם העיר
    from collections import Counter
    names = Counter(st['name'] for st in stations.values())
    out_st = {}
    for st in stations.values():
        # רק תחנות מרכזיות ומסופים ממשיים: בלי מסופים תפעוליים,
        # ורק אם לפחות 5 קווים מתחילים/מסתיימים שם
        if 'תפעול' in st['name'] or len(st['lines']) < 5:
            continue
        lines = sorted(st['lines'].values(), key=linekey)
        label = st['name'] if names[st['name']] == 1 else f"{st['name']} ({st['city']})"
        out_st[label] = {
            'city': st['city'],
            'lines': [[x['line'], x['op'], sorted(x['dests']),
                       '/'.join(sorted(x['plats']))] for x in lines]}
    out = {'updated': datetime.date.today().isoformat(), 'stations': out_st}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    tmp = f'{OUT}.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, OUT)
    print(f'תחנות: {len(out_st)} · קובץ: {OUT}', flush=True)


if __name__ == '__main__':
    sys.exit(main())
