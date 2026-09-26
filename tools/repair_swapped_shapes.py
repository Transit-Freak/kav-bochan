#!/usr/bin/env python3
# תיקון חד-פעמי: נקודות שרטוט עם קו רוחב/אורך הפוכים (בקובצי 2012) — הקו "קפץ" לים (שלמה 26.09, קו 143 מ-2012)
import glob, json, math, sys
sys.path.insert(0, 'tools')
from backfill_geo import enc_polyline
def dec(s):
    i = lat = lng = 0; pts = []
    while i < len(s):
        vals = []
        for _ in (0, 1):
            sh = r = 0
            while True:
                b = ord(s[i]) - 63; i += 1; r |= (b & 0x1f) << sh; sh += 5
                if b < 0x20: break
            vals.append(~(r >> 1) if r & 1 else r >> 1)
        lat += vals[0]; lng += vals[1]; pts.append((lat / 1e5, lng / 1e5))
    return pts
inside = lambda p: 29 < p[0] < 33.5 and 34 < p[1] < 36
n = 0
for f in glob.glob('line-history/data/lines/*.json'):
    raw = open(f, encoding='utf-8').read()
    d = json.loads(raw); sp = d.get('spool')
    if not isinstance(sp, list): continue
    ch = False
    for i, s in enumerate(sp):
        if not s: continue
        pts = dec(s)
        if all(inside(p) for p in pts): continue
        pts = [(b, a) if (34 < a < 36 and 29 < b < 33.5) else (a, b) for a, b in pts]
        pts = [p for p in pts if inside(p)]
        # נקודת קצה שנשארה במרחק של יותר מ-2 ק"מ מהשכנה שלה היא שארית של אותה תקלה
        km = lambda a, b: math.hypot((a[0] - b[0]) * 111, (a[1] - b[1]) * 94)
        while len(pts) > 2 and km(pts[0], pts[1]) > 2: pts = pts[1:]
        while len(pts) > 2 and km(pts[-1], pts[-2]) > 2: pts = pts[:-1]
        sp[i] = enc_polyline(pts); ch = True; n += 1
    if ch: json.dump(d, open(f, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('שרטוטים תוקנו:', n)
