#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""גבולות כל עיר לפי התחנות שלה (stop_desc "עיר: X") — למיקוד המפה בהקו בזמן
בבחירת עיר (שלמה 18.09). הפלט: line-history/data/cities.json
{עיר: [lat_min, lon_min, lat_max, lon_max]} — אחוזון 2/98 כדי שתחנה
משויכת בטעות לא תמתח את המסגרת לחצי מדינה. קלט: STOPS (stops.txt)."""
import csv
import json
import os
import re
import sys

STOPS = os.environ.get('STOPS', 'stops.txt')
OUT = os.environ.get('OUT', 'line-history/data/cities.json')
CITY_RE = re.compile(r'עיר:\s*(.+?)\s*(?:רציף:|קומה:|$)')


def main():
    pts = {}
    with open(STOPS, encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            m = CITY_RE.search(r.get('stop_desc') or '')
            if not m:
                continue
            try:
                la, lo = float(r['stop_lat']), float(r['stop_lon'])
            except (TypeError, ValueError):
                continue
            pts.setdefault(m.group(1).strip(), []).append((la, lo))
    out = {}
    for city, ps in pts.items():
        if len(ps) < 3:
            continue
        las = sorted(p[0] for p in ps)
        los = sorted(p[1] for p in ps)
        lo_i, hi_i = int(len(ps) * 0.02), max(0, int(len(ps) * 0.98) - 1)
        out[city] = [round(las[lo_i], 4), round(los[lo_i], 4), round(las[hi_i], 4), round(los[hi_i], 4)]
    tmp = OUT + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, OUT)
    print(f'ערים: {len(out)} → {OUT}', file=sys.stderr)


if __name__ == '__main__':
    sys.exit(main())
