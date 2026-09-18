#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ויקי-בודק — נתוני אמת על תחנות מרכזיות ומסופים.

לעורכי ויקיפדיה: לכל תחנה מרכזית/מסוף נבנית רשימת *כל* הקווים שעוצרים
בה — לא רק אלה שמתחילים/מסתיימים בה — מתוך קובץ ה-GTFS המלא של משרד
התחבורה (stops + trips + stop_times). לכל קו: מפעיל, יעדים (קצות
המסלול) והרציף שבו הוא עוצר בתחנה (מתוך stop_desc).

הקובץ המלא גדול (מאות MB) ולכן ההורדה והעיבוד רצים ב-GitHub Actions.
הפלט: wiki-check/data/stations.json
{updated, stations:{"שם": {city, lines:[[קו, מפעיל, [יעדים], רציף, term]]}}}
term=1 אם הקו מתחיל/מסתיים בתחנה.
"""
import csv
import datetime
import io
import json
import os
import re
import sys
import urllib.request
import zipfile

S3 = ('https://openbus-stride-public.s3.eu-west-1.amazonaws.com'
      '/gtfs_archive/{y}/{m}/{d}/israel-public-transportation.zip')
OUT = os.environ.get('OUT', 'wiki-check/data/stations.json')
ZIP = os.environ.get('GTFS_ZIP', '/tmp/gtfs.zip')
SUFFIX = re.compile(r'(-\d+[א-ת]?#?\s*)+$')
STATION_WORDS = ('מרכזית', 'מסוף')
CITY_RE = re.compile(r'עיר:\s*(.+?)\s*(?:רציף:|קומה:|$)')
PLAT_RE = re.compile(r'רציף:\s*([^\s:]+)')


def station_key(stop_name):
    """שם התחנה בלי רציף/הורדה/קומה, עם איחוד שמות של אותו מתחם."""
    base = stop_name.split('/')[0].strip()
    base = re.sub(r'\s*קומה\s*\d+\s*$', '', base)
    base = re.sub(r'\s+', ' ', base).strip()
    base = re.sub(r'^ת\.\s*מרכזית', 'ת. מרכזית', base)   # איחוד "ת.מרכזית"/"ת. מרכזית"
    if 'סבידור' in base or base in ('תל אביב מרכז', 'מסוף 2000'):
        return 'מסוף ארלוזורוב (סבידור)'
    return base


def download():
    if os.path.exists(ZIP) and os.path.getsize(ZIP) > 10 ** 8:
        return
    day = datetime.date.today() - datetime.timedelta(days=1)
    url = S3.format(y=day.year, m=f'{day.month:02d}', d=f'{day.day:02d}')
    print(f'מוריד GTFS מלא: {url}', flush=True)
    req = urllib.request.Request(url, headers={'User-Agent': 'kav-bochan-wiki/1.0'})
    with urllib.request.urlopen(req, timeout=600) as r, open(ZIP, 'wb') as f:
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            f.write(b)
    print(f'הורד: {os.path.getsize(ZIP) / 1e6:.0f}MB', flush=True)


def reader(zf, member):
    return csv.DictReader(io.TextIOWrapper(zf.open(member), encoding='utf-8-sig'))


def endpoint_cities(long_name):
    """קצות המסלול מתוך route_long_name → [(תחנה, עיר), ...]"""
    out = []
    for side in (long_name or '').split('<->'):
        side = SUFFIX.sub('', side).strip()
        if '-' in side:
            stop, city = side.rsplit('-', 1)
            out.append((stop.strip(), city.strip()))
    return out


def main():
    download()
    zf = zipfile.ZipFile(ZIP)

    # 1. תחנות מרכזיות/מסופים מתוך stops.txt — עיר ורציף מתוך stop_desc
    stop_info = {}     # stop_id -> (station_key, city, platform)
    for r in reader(zf, 'stops.txt'):
        name = (r.get('stop_name') or '').strip()
        base = station_key(name)
        if not any(w in base for w in STATION_WORDS):
            continue
        desc = r.get('stop_desc') or ''
        mc = CITY_RE.search(desc)
        city = mc.group(1).strip() if mc else ''
        # נרמול: "תחנה מרכזית" סתמית מקבלת את שם העיר; לסבידור עיר קבועה
        if base in ('תחנה מרכזית', 'ת. מרכזית', 'ת.מרכזית', 'מרכזית') and city:
            base = f'ת. מרכזית {city}'
        if base == 'מסוף ארלוזורוב (סבידור)':
            city = 'תל אביב יפו'
        mp = PLAT_RE.search(desc)
        plat = (mp.group(1).strip() if mp else '')
        if plat in ('0', 'None', 'ם') or plat.startswith('קומה'):
            plat = ''
        stop_info[r['stop_id']] = (base, city, plat)
    print(f'stops: {len(stop_info)} עצירות בתחנות מרכזיות/מסופים', flush=True)

    # 2. routes + agency
    agency = {r['agency_id']: (r.get('agency_name') or '').strip()
              for r in reader(zf, 'agency.txt')}
    routes = {}
    for r in reader(zf, 'routes.txt'):
        routes[r['route_id']] = (
            (r.get('route_short_name') or '').strip(),
            agency.get(r.get('agency_id'), ''),
            r.get('route_long_name') or '')

    # 3. trips: trip_id → route_id
    trip_route = {r['trip_id']: r['route_id'] for r in reader(zf, 'trips.txt')}
    print(f'trips: {len(trip_route)}', flush=True)

    # 4. stop_times — סריקה אחת: אילו מסלולים עוצרים בכל תחנה ובאיזה רציף
    hits = {}          # (route_id, station, city) → set(רציפים)
    n = 0
    for r in reader(zf, 'stop_times.txt'):
        n += 1
        si = stop_info.get(r['stop_id'])
        if si is None:
            continue
        rid = trip_route.get(r['trip_id'])
        if rid is None:
            continue
        key = (rid, si[0], si[1])
        s = hits.get(key)
        if s is None:
            s = hits[key] = set()
        if si[2]:
            s.add(si[2])
    print(f'stop_times: {n} שורות · {len(hits)} צירופי קו-תחנה', flush=True)

    # 5. קיבוץ לתחנות
    stations = {}
    for (rid, base, city), plats in hits.items():
        short, op, long_name = routes.get(rid, ('', '', ''))
        if not short:
            continue
        st = stations.setdefault(f'{base}|{city}',
                                 {'name': base, 'city': city, 'lines': {}})
        ends = endpoint_cities(long_name)
        term = any(station_key(e[0]) == base for e in ends)
        dests = set()
        for stop, ecity in ends:
            if station_key(stop) == base:
                continue
            dests.add(ecity if ecity != city else station_key(stop))
        lk = f'{short}|{op}'
        ent = st['lines'].setdefault(
            lk, {'line': short, 'op': op, 'dests': set(), 'plats': set(),
                 'term': False})
        ent['dests'] |= dests
        ent['plats'] |= plats
        ent['term'] = ent['term'] or term

    def linekey(x):
        m = re.match(r'\d+', x['line'])
        return (int(m.group()) if m else 10 ** 6, x['line'], x['op'])

    from collections import Counter
    names = Counter(st['name'] for st in stations.values())
    out_st = {}
    for st in stations.values():
        if 'תפעול' in st['name'] or len(st['lines']) < 5:
            continue
        lines = sorted(st['lines'].values(), key=linekey)
        label = st['name'] if names[st['name']] == 1 else f"{st['name']} ({st['city']})"
        out_st[label] = {
            'city': st['city'],
            'lines': [[x['line'], x['op'], sorted(x['dests']),
                       '/'.join(sorted(x['plats'])[:3]),
                       1 if x['term'] else 0] for x in lines]}
    out = {'updated': datetime.date.today().isoformat(), 'stations': out_st}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    tmp = f'{OUT}.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, OUT)
    print(f'תחנות: {len(out_st)} · קובץ: {OUT}', flush=True)


if __name__ == '__main__':
    sys.exit(main())
