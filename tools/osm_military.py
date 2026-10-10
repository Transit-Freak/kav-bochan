#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""שטחים צבאיים מ-OpenStreetMap (קובץ ה-PBF של Geofabrik) אל military.json (שלמה 10.10).

הקובץ משמש את בדיקת "סוג תחנה לא מתאים" בהתחנה הבאה (tools/stop_checks.py): תחנה שרשומה
"גבול מחנה צבאי" ואין שטח צבאי עד 300 מ' ממנה. Overpass נכשל לנו שוב ושוב (406/500/504),
ולכן קוראים מה-PBF, כמו ב-gis-layers ו-parks-access.
שימוש: python3 tools/osm_military.py il.osm.pbf military.json
"""
import datetime
import json
import sys

import osmium


class H(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.out = []

    @staticmethod
    def is_mil(t):
        return t.get('landuse') == 'military' or 'military' in t

    def add(self, t, rings):
        rings = [[p for i, p in enumerate(r) if i == 0 or p != r[i - 1]] for r in rings]
        rings = [r for r in rings if r]
        if not rings:
            return
        xs = [p[0] for r in rings for p in r]
        ys = [p[1] for r in rings for p in r]
        self.out.append({'n': t.get('name:he') or t.get('name') or '', 'k': t.get('military') or t.get('landuse') or '',
                         'bb': [min(xs), min(ys), max(xs), max(ys)], 'r': rings})

    def node(self, n):
        if 'military' in n.tags and n.location.valid():
            self.add(n.tags, [[[round(n.location.lon, 4), round(n.location.lat, 4)]]])

    def area(self, a):
        if not self.is_mil(a.tags):
            return
        rings = []
        for o in a.outer_rings():
            rings.append([[round(p.lon, 4), round(p.lat, 4)] for p in o if p.location.valid()])
        self.add(a.tags, rings)


def main():
    h = H()
    h.apply_file(sys.argv[1], locations=True, idx='flex_mem')
    json.dump({'generated': datetime.date.today().isoformat(), 'count': len(h.out), 'areas': h.out},
              open(sys.argv[2], 'w'), ensure_ascii=False, separators=(',', ':'))
    print('military areas:', len(h.out))


if __name__ == '__main__':
    main()
