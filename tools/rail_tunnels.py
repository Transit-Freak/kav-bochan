#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""מנהרות, גשרים וחתכים במסילות רכבת ישראל — למפת הקליטה ברכבת.

מקור: OpenStreetMap (Overpass). כל way עם railway=rail בישראל שמסומן
tunnel=* / bridge=* / cutting=* / covered=*. לכל קטע נשמרים הסוג, השם (אם יש),
האורך במטרים והפוליליין המקודד. בנוסף נבדקים אתרי אנטנות סלולריות
ב-data.gov.il (חיפוש CKAN) — הריצה מדפיסה מה נמצא ושומרת רשימת מאגרים
מתאימים ב-rail/data/antenna-sources.json לבחירה ידנית.

תוצר: rail/data/tunnels.json — {"updated", "features": [{"k": tunnel|bridge|cutting|covered,
"n": שם, "m": אורך, "p": פוליליין, "id": מזהה OSM, "layer"}]}.
"""
import datetime
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from backfill_geo import enc_polyline  # noqa: E402

OUTDIR = os.environ.get('OUTDIR', 'rail/data')
OUT = f'{OUTDIR}/tunnels.json'
SRC_OUT = f'{OUTDIR}/antenna-sources.json'
MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]
BBOX = '29.4,34.2,33.4,35.95'
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
      'Accept': 'application/json,text/csv,*/*'}


def hav(lat1, lon1, lat2, lon2):
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def overpass(q):
    data = urllib.parse.urlencode({'data': q}).encode()
    for ep in MIRRORS:
        try:
            req = urllib.request.Request(ep, data=data, headers=UA)
            with urllib.request.urlopen(req, timeout=350) as r:
                return json.load(r)
        except Exception as ex:  # noqa: BLE001
            print(f'  {ep} נכשל: {ex!r}', flush=True)
            time.sleep(10)
    raise SystemExit('Overpass נכשל בכל המראות')


def fetch_structures():
    q = ('[out:json][timeout:300];('
         f'way["railway"~"^(rail|light_rail|subway)$"]["tunnel"]({BBOX});'
         f'way["railway"~"^(rail|light_rail|subway)$"]["bridge"]({BBOX});'
         f'way["railway"~"^(rail|light_rail|subway)$"]["cutting"]({BBOX});'
         f'way["railway"~"^(rail|light_rail|subway)$"]["covered"]({BBOX});'
         ');out geom;')
    j = overpass(q)
    feats = []
    for e in j.get('elements', []):
        if e.get('type') != 'way' or not e.get('geometry'):
            continue
        t = e.get('tags', {})
        if t.get('service') in ('siding', 'yard', 'spur'):
            continue
        kind = None
        for k in ('tunnel', 'covered', 'bridge', 'cutting'):
            v = t.get(k)
            if v and v != 'no':
                kind = k
                break
        if not kind:
            continue
        g = e['geometry']
        pts = [(p['lat'], p['lon']) for p in g]
        length = sum(hav(*pts[i - 1], *pts[i]) for i in range(1, len(pts)))
        feats.append({
            'id': e['id'], 'k': kind, 'rw': t.get('railway'),
            'n': t.get('name:he') or t.get('name') or '',
            'm': round(length), 'p': enc_polyline(pts),
            'layer': t.get('layer', ''),
            'el': t.get('electrified', ''),
        })
    return feats


def ckan_search(q):
    url = 'https://data.gov.il/api/3/action/package_search?' + urllib.parse.urlencode({'q': q, 'rows': 20})
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        j = json.load(r)
    out = []
    for p in j.get('result', {}).get('results', []):
        out.append({
            'name': p.get('name'), 'title': p.get('title'), 'org': (p.get('organization') or {}).get('title'),
            'resources': [{'id': rs.get('id'), 'name': rs.get('name'), 'format': rs.get('format'),
                           'url': rs.get('url')} for rs in p.get('resources', [])],
        })
    return out


def main():
    feats = fetch_structures()
    by = {}
    for f in feats:
        by[f['k']] = by.get(f['k'], 0) + f['m']
    print(f'OSM: {len(feats)} קטעים · ' + ' · '.join(f'{k}: {round(v/1000,1)} ק"מ' for k, v in by.items()))
    names = sorted({f['n'] for f in feats if f['n'] and f['k'] == 'tunnel'})
    print('מנהרות עם שם:', ', '.join(names))
    json.dump({'updated': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%MZ'),
               'source': 'OpenStreetMap (ODbL) — railway tunnel/bridge/cutting/covered',
               'features': feats}, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

    found = {}
    for q in ('אנטנות סלולריות', 'אתרי שידור', 'מתקני שידור סלולריים', 'cellular antenna', 'קרינה סלולר'):
        try:
            res = ckan_search(q)
            print(f'data.gov.il "{q}": {len(res)} מאגרים')
            for p in res:
                print(f'   - {p["title"]} ({p["org"]}) — {len(p["resources"])} משאבים')
                found[p['name']] = p
        except Exception as ex:  # noqa: BLE001
            print(f'data.gov.il "{q}" נכשל: {ex!r}')
    json.dump({'updated': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%MZ'), 'packages': list(found.values())},
              open(SRC_OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()


def fetch_antennas():
    """האנטנות הפעילות (המשרד להגנת הסביבה) דרך datastore של data.gov.il —
    ההורדה הישירה של הקובץ חסומה (403). נשמר כ-JSON גולמי לבדיקת המבנה."""
    srcs = json.load(open(SRC_OUT, encoding='utf-8'))['packages']
    rid = None
    for p in srcs:
        if 'פעילות' in (p.get('title') or ''):
            for rs in p['resources']:
                if (rs.get('format') or '').upper() == 'CSV':
                    rid = rs['id']
    if not rid:
        print('לא נמצא משאב אנטנות פעילות')
        return
    recs, fields, off = [], None, 0
    while True:
        url = 'https://data.gov.il/api/3/action/datastore_search?' + urllib.parse.urlencode(
            {'resource_id': rid, 'limit': 5000, 'offset': off})
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=120) as r:
            j = json.load(r)
        res = j['result']
        fields = fields or [f['id'] for f in res.get('fields', [])]
        recs += res.get('records', [])
        if len(res.get('records', [])) < 5000:
            break
        off += 5000
    print(f'אנטנות: {len(recs)} רשומות; שדות: {fields}')
    for rc in recs[:3]:
        print('   ', json.dumps(rc, ensure_ascii=False)[:400])
    json.dump({'updated': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%MZ'), 'resource_id': rid,
               'fields': fields, 'records': recs},
              open(f'{OUTDIR}/antennas-raw.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))


if __name__ == '__main__':
    try:
        fetch_antennas()
    except Exception as ex:  # noqa: BLE001
        print('הורדת האנטנות נכשלה:', repr(ex))
