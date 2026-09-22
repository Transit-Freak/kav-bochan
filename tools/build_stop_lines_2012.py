#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""רישום התחנות של 2012 מול היום — הכל מחושב כאן, לא בדפדפן (שלמה 22.09: "זה עושה חישוב אצל המשתמש").

קלט: magihim-2012/data/stops-2012.json (רישום 2012 מ-OpenStreetMap; שדות 0–4 קבועים:
שם, רוחב, אורך, כתובת, stop_id), magihim-2012/data/l*.json (קווי 2012 שהוצלבו),
line-history/data/stops-state.json ו-stops-hist.json (הרישום מ-2017 ואילך).

פלט (הכל נבנה מחדש בכל ריצה, ולכן מתעדכן כשהארכיון מתעדכן):
  stops-2012.json שדות 5–11: השם והמיקום הראשונים שידועים מ-2017, המרחק, שינוי שם,
      מספר קווי 2012 בתחנה, ולמק"ט זמני (99xxxxx) — המק"ט האמיתי של כפיל עד 100 מ'
  stops-2012/<XX>.json — אותו רישום בשברים לפי קידומת
  stop-lines/<XX>.json — {מק"ט: [[מפתח קו, מספר, יעד, חברה]]} לעמוד התחנה
  stops-2012-events.json — האירועים המוכנים לתצוגה ("ברישום 2012", ומה השתנה עד 2017)
      במערכים קומפקטיים + ספירה לכל סוג, כדי שהדפדפן רק יציג
"""
import glob
import json
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_magihim_site import norm  # noqa: E402

DATA = 'magihim-2012/data'
LH = 'line-history/data'


def shard_of(code):
    return (code[:2] or '0').rjust(2, '0')


def dist_m(a, b):
    return math.hypot((a[0] - b[0]) * 110540, (a[1] - b[1]) * 111320 * math.cos(math.radians(a[0])))


def nrm(s):
    return re.sub(r'[\s"\'׳״\-/.,()]+', '', s or '')


def is_tmp(code):
    return len(code) == 7 and code.startswith('99')


def main():
    snap_path = f'{DATA}/stops-2012.json'
    snapf = json.load(open(snap_path, encoding='utf-8'))
    snap = snapf['stops']
    idx = {l['k']: l for l in json.load(open(f'{DATA}/index.json', encoding='utf-8')).get('lines', [])}

    # --- 1. קווי 2012 לפי מק"ט (רק תחנות עם מק"ט יחיד ודאי) ---
    by_code = {}
    for f in sorted(glob.glob(f'{DATA}/l*.json')):
        key = os.path.basename(f)[1:-5]
        meta = idx.get(key)
        if not meta:
            continue
        try:
            lf = json.load(open(f, encoding='utf-8'))
        except Exception:
            continue
        for r in lf.get('routes', []):
            for s in r.get('stops', []):
                if len(s) > 4 and s[4] and len(s[4]) == 1:
                    by_code.setdefault(s[4][0], {})[key] = [key, meta.get('no', ''), meta.get('dest', ''), meta.get('an', '')]

    # --- 2. מול הרישום מ-2017 ואילך: השם והמיקום הראשונים שידועים לכל מק"ט ---
    state = json.load(open(f'{LH}/stops-state.json', encoding='utf-8'))
    hist = json.load(open(f'{LH}/stops-hist.json', encoding='utf-8'))
    cnt = {'gone': 0, 'ren': 0, 'moved': 0, 'same': 0}
    for code, row in snap.items():
        n12, la, lo = row[0], row[1], row[2]
        evs = hist.get(code) or []
        st = state.get(code)
        first = None
        if evs:
            e0 = evs[0]
            fn = (e0.get('on') if e0.get('k') == 'renamed' else None) or e0.get('n') or e0.get('nn')
            fc = (e0['ola'], e0['olo']) if e0.get('k') == 'moved' and e0.get('ola') is not None else (e0.get('la'), e0.get('lo'))
            first = (fn, fc)
        elif st:
            first = (st[0], (st[1], st[2]))
        del row[5:]
        if not first or first[1][0] is None or first[1][1] is None:
            row.extend([None, None, None, None, None])
            cnt['gone'] += 1
        else:
            fn, fc = first
            ren = 1 if nrm(fn) != nrm(n12) else 0
            d = round(dist_m((la, lo), fc))
            row.extend([fn, fc[0], fc[1], d, ren])
            cnt['ren'] += ren
            cnt['moved'] += d >= 30
            cnt['same'] += (not ren and d < 30)
    print('מול 2017:', cnt)

    # --- 3. שדה 10: מספר קווי 2012; שדה 11: כפיל אמיתי של מק"ט זמני עד 100 מ' ---
    real = [(k, norm(r[0]), r[1], r[2]) for k, r in snap.items() if not is_tmp(k)]
    n_dup = 0
    for code, row in snap.items():
        row.append(len(by_code.get(code, {})))
        best = None
        if is_tmp(code):
            nm = norm(row[0])
            for k2, nm2, la, lo in real:
                d = dist_m((row[1], row[2]), (la, lo))
                if d <= 100 and nm and (nm == nm2 or nm in nm2 or nm2 in nm):
                    if best is None or d < best[0]:
                        best = (d, k2)
        row.append(best[1] if best else None)
        n_dup += 1 if best else 0
    print(f'מק"טים זמניים עם כפיל אמיתי עד 100 מ\': {n_dup}')
    # קווי 2012 של כפיל עוברים לתחנה האמיתית
    for code, row in snap.items():
        if row[11] and code in by_code:
            by_code.setdefault(row[11], {}).update(by_code[code])

    snapf['note'] = (snapf['note'].split(' שדות 5')[0].split(' שדה 5')[0]
                     + ' שדות 5–9: השם והמיקום הראשונים שידועים מ-2017 ואילך, המרחק במטרים, 1 אם השם השתנה (null = לא ברישום מ-2017). '
                     'שדה 10: מספר קווי 2012 (מגיעים) בתחנה. שדה 11: למק"ט זמני (99xxxxx) — המק"ט האמיתי של תחנה באותו שם עד 100 מ\', כשיש. '
                     'הכל מחושב ב-tools/build_stop_lines_2012.py.')
    json.dump(snapf, open(snap_path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    d2 = f'{DATA}/stops-2012'
    os.makedirs(d2, exist_ok=True)
    for old in glob.glob(f'{d2}/*.json'):
        os.remove(old)
    parts = {}
    for code, row in snap.items():
        parts.setdefault(shard_of(code), {})[code] = row
    for sh, part in parts.items():
        json.dump(part, open(f'{d2}/{sh}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

    # --- 4. קווי 2012 לפי תחנה — שברים ---
    out = f'{DATA}/stop-lines'
    os.makedirs(out, exist_ok=True)
    for old in glob.glob(f'{out}/*.json'):
        os.remove(old)
    shards = {}
    for code, lines in by_code.items():
        rows = sorted(lines.values(), key=lambda x: (int(re.match(r'\d+', x[1]).group()) if re.match(r'\d+', x[1]) else 9999, x[1], x[2]))
        shards.setdefault(shard_of(code), {})[code] = rows
    for sh, part in shards.items():
        json.dump(part, open(f'{out}/{sh}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'קווי 2012 לפי תחנה: {len(by_code):,} מק"טים, {len(shards)} שברים')

    # --- 5. האירועים המוכנים לתצוגה (מה שהדפדפן חישב עד היום), במערכים קצרים ---
    # סוג 0 "ברישום 2012": [מק"ט, 0, שם, כתובת, רוחב, אורך, מק"ט זמני?, קווי 2012]
    # סוג 1 "בוטלה":        [מק"ט, 1, שם, רוחב, אורך] או + [תחנה שקיבלה את המק"ט, מרחקה]
    # סוג 2 "שינוי שם":     [מק"ט, 2, שם חדש, רוחב, אורך, שם 2012]
    # סוג 3 "הזזה":         [מק"ט, 3, שם, רוחב, אורך, רוחב 2012, אורך 2012, מרחק]
    events = []
    counts = {'gtfs2012': 0, 'del': 0, 'renamed': 0, 'moved': 0}
    for code in sorted(snap, key=lambda c: (len(c), c)):
        row = snap[code]
        n, la, lo, addr, _, fn, fla, flo, d, ren, nlines, dup = row[:12]
        tmp = is_tmp(code)
        if tmp and (not nlines or dup):
            continue        # מספר זמני בלי שירות, או כפילות — לא מוצג
        events.append([code, 0, n, addr, la, lo, 1 if tmp else 0, nlines])
        counts['gtfs2012'] += 1
        if tmp:
            continue
        if fn is None:
            events.append([code, 1, n, la, lo])
            counts['del'] += 1
            continue
        if d >= 1000:
            events.append([code, 1, n, la, lo, fn, d])
            counts['del'] += 1
            continue
        if ren:
            events.append([code, 2, fn, fla, flo, n])
            counts['renamed'] += 1
        if d >= 30:
            events.append([code, 3, fn, fla, flo, la, lo, d])
            counts['moved'] += 1
    import time
    gen = time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())
    ev_path = f'{DATA}/stops-2012-events.json'
    json.dump({'gen': gen, 'stops': counts['gtfs2012'], 'counts': counts, 'events': events},
              open(ev_path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    # ספירה לבדה — קובץ זעיר שנטען ראשון, כדי שהמספרים בקטגוריות יופיעו מיד
    json.dump({'gen': gen, 'stops': counts['gtfs2012'], 'counts': counts, 'events_bytes': os.path.getsize(ev_path)},
              open(f'{DATA}/stops-2012-counts.json', 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'אירועי 2012 לתצוגה: {len(events):,} אירועים ל-{counts["gtfs2012"]:,} תחנות · {counts} · {os.path.getsize(ev_path) // 1024} ק"ב')

if __name__ == '__main__':
    main()
