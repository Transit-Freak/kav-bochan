#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""היסטוריית תחנות 2015–2017 מצילומי "אופן באס" שכבר שמורים אצלנו (early-stops/obus-*).

עד עכשיו החודשים 09.2015–03.2017 בלשונית התחנות הציגו את הצילום עצמו — רשימה של
כל 26 אלף התחנות כפי שנשמרו — במקום מה שהשתנה (שלמה 10.10: "למה העיצוב של
התחנות ב-2015/2016 כל כך שונה"). כאן הצילומים הופכים לאותם אירועים שיש מ-2017
ואילך (backfill_stops_tf.py): תחנה חדשה, ביטול, שינוי שם והזזה — ואז החודשים
האלה מוצגים באותו עיצוב כמו כל השאר.

הכללים כמו ב-backfill_stops_tf: "חדשה" רק בפעם הראשונה שהמק"ט נראה; ביטול רק
למי שנעלם ולא חזר עד הצילום האחרון (11.2017) ואינו ברישום של היום; הזזה מ-35 מ'.
צילום חלקי (פחות מ-90% מהחציון של הצילומים הקודמים) מדולג — אחרת כל תחנה שחסרה
בו הייתה נרשמת כביטול ואז כחזרה.

האירועים נכתבים רק עד TO (ברירת מחדל 2017-03-15), כי מ-16.03.2017 יש כבר
היסטוריה מ-TransitFeeds. DRY=1 — ניתוח בלבד.
"""
import datetime
import glob
import gzip
import json
import math
import os
import re
import statistics
import sys

OUTDIR = os.environ.get('OUTDIR', 'line-history/data')
DRY = os.environ.get('DRY') == '1'
TO = os.environ.get('TO', '2017-03-15')
MOVE_M = 35
TOWN = re.compile(r'עיר:\s*(.*?)\s*רציף:')


def dist_m(a, b, c, d):
    dy = (a - c) * 111320
    dx = (b - d) * 111320 * math.cos(math.radians((a + c) / 2))
    return math.hypot(dx, dy)


def nm(s):
    return re.sub(r'\s+', ' ', (s or '').strip())


def load(p):
    d = json.loads(gzip.decompress(open(p, 'rb').read()))
    out = {}
    for s in d.get('stops') or []:
        c = str(s.get('c') or '').strip()
        if not c or s.get('la') is None:
            continue
        m = TOWN.search(s.get('desc') or '')
        out[c] = [nm(s.get('n')), m.group(1).strip() if m else '', round(float(s['la']), 5), round(float(s['lo']), 5)]
    return d.get('date'), out


def main():
    # הצילום הגדול ביותר בכל יום (יש ימים עם כמה צילומים)
    byday = {}
    for p in sorted(glob.glob(f'{OUTDIR}/early-stops/obus-*.json.gz')):
        day = os.path.basename(p)[5:15]
        sz = os.path.getsize(p)
        if day not in byday or sz > byday[day][1]:
            byday[day] = (p, sz)
    days = sorted(byday)
    print(f'ימים עם צילום: {len(days)} ({days[0]} – {days[-1]})', file=sys.stderr)

    prev, ever, gone, sizes = {}, {}, {}, []
    prev_day = None
    events, skipped = [], 0
    last_day = None
    for day in days:
        d, cur = load(byday[day][0])
        d = d or day
        if sizes and len(cur) < 0.9 * statistics.median(sizes[-15:]):
            skipped += 1
            continue
        sizes.append(len(cur))
        last_day = d
        # בין שני צילומים רחוקים (למשל 07.2016–01.2017) היום המדויק לא ידוע: sd = הצילום הקודם,
        # והממשק מסמן "≈ תאריך מקורב" כמו באירועי הקווים
        apx = {'sd': prev_day} if prev_day and (datetime.date.fromisoformat(d) - datetime.date.fromisoformat(prev_day)).days > 3 else {}
        if prev:
            for code, s in cur.items():
                gone.pop(code, None)
                if code not in ever:
                    ever[code] = d
                    events.append({'d': d, 'c': code, 'k': 'new', 'n': s[0], 't': s[1], 'la': s[2], 'lo': s[3], 'k1': 1, 'src': 'ob', **apx})
                    continue
                o = prev.get(code)
                if o is None:
                    continue
                if o[0] != s[0]:
                    events.append({'d': d, 'c': code, 'k': 'renamed', 'n': s[0], 't': s[1], 'la': s[2], 'lo': s[3],
                                   'on': o[0], 'nn': s[0], 'src': 'ob', **apx})
                elif dist_m(o[2], o[3], s[2], s[3]) >= MOVE_M:
                    events.append({'d': d, 'c': code, 'k': 'moved', 'n': s[0], 't': s[1], 'la': s[2], 'lo': s[3],
                                   'ola': o[2], 'olo': o[3], 'dist': round(dist_m(o[2], o[3], s[2], s[3])), 'src': 'ob', **apx})
            for code in prev:
                if code not in cur and code not in gone:
                    gone[code] = (d, prev[code], apx.get('sd'))
        else:
            for code in cur:
                ever.setdefault(code, d)
        prev = cur
        prev_day = d

    try:
        alive = set(json.load(open(f'{OUTDIR}/stops-state.json', encoding='utf-8')))
    except Exception:
        alive = set()
    for code, (since, o, sd) in gone.items():
        if code in alive:
            continue
        events.append({'d': since, 'c': code, 'k': 'del', 'n': o[0], 't': o[1], 'la': o[2], 'lo': o[3], 'src': 'ob',
                       **({'sd': sd} if sd else {})})

    events = [e for e in events if e['d'] <= TO]
    tally = {}
    for e in events:
        tally[e['k']] = tally.get(e['k'], 0) + 1
    print(f'דולגו {skipped} צילומים חלקיים · אחרון שנבדק {last_day} · אירועים עד {TO}: {len(events)} — '
          + ' · '.join(f'{k}:{v}' for k, v in sorted(tally.items(), key=lambda x: -x[1])), file=sys.stderr)
    bymon = {}
    for e in events:
        bymon.setdefault(e['d'][:7], []).append(e)
    for mo in sorted(bymon):
        print(f'  {mo}: {len(bymon[mo])}', file=sys.stderr)
    if DRY:
        return

    hp = f'{OUTDIR}/stops-hist.json'
    hist = json.load(open(hp, encoding='utf-8')) if os.path.exists(hp) else {}
    for e in events:
        h = hist.setdefault(e['c'], [])
        if not any(x.get('d') == e['d'] and x.get('k') == e['k'] for x in h):
            h.append({k: v for k, v in e.items() if k != 'c'})
    for h in hist.values():
        h.sort(key=lambda x: x['d'])
    json.dump(hist, open(hp, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    os.makedirs(f'{OUTDIR}/changes', exist_ok=True)
    for mo, evs in bymon.items():
        p = f'{OUTDIR}/changes/stops-{mo}.json'
        old = json.load(open(p, encoding='utf-8'))['changes'] if os.path.exists(p) else []
        seen = {(x['d'], x['c'], x['k']) for x in old}
        old += [e for e in evs if (e['d'], e['c'], e['k']) not in seen]
        old.sort(key=lambda x: (x['d'], x['c']))
        json.dump({'month': mo, 'changes': old}, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    mp = f'{OUTDIR}/months.json'
    mj = json.load(open(mp, encoding='utf-8')) if os.path.exists(mp) else {}
    mj['stopMonths'] = sorted(set(mj.get('stopMonths') or []) | set(bymon), reverse=True)
    json.dump(mj, open(mp, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))


if __name__ == '__main__':
    main()
