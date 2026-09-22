#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""אילו קווי 2012 (מגיעים) עצרו בכל תחנה — לפי המק"ט שהוצלב ברשת 2012.

קורא את magihim-2012/data/l*.json (תוצר build_magihim_site) ומפיק שברים לפי
קידומת המק"ט, כמו שברי התחנות של "הקו בזמן":
  magihim-2012/data/stop-lines/<XX>.json = {מק"ט: [[מפתח קו, מספר, יעד, חברה], ...]}
כדי שעמוד תחנה יציע גם את קווי 2012 שעצרו בה (שלמה 22.09). רק תחנות עם
מק"ט יחיד ודאי; תחנה עם כמה מועמדים לא נספרת.
"""
import glob
import json
import os
import re
import sys

DATA = 'magihim-2012/data'


def shard_of(code):
    return (code[:2] or '0').rjust(2, '0')


def main():
    idx = {l['k']: l for l in json.load(open(f'{DATA}/index.json', encoding='utf-8')).get('lines', [])}
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
    # מספר קווי 2012 לכל תחנה נחתם גם ברישום התחנות (שדה 10) — לסינון מק"טים זמניים
    # (99xxxxx) שאף קו לא עצר בהם ב-2012 (שלמה 22.09: "האתר לא מצא קווים בתחנות אלה")
    snap_path = f'{DATA}/stops-2012.json'
    snapf = json.load(open(snap_path, encoding='utf-8'))
    for code, row in snapf['stops'].items():
        while len(row) < 10:
            row.append(None)
        row[10:] = [len(by_code.get(code, {}))]
    # מק"ט זמני (99xxxxx) שיש לצידו, עד 100 מ', תחנה עם מק"ט אמיתי באותו שם או בשם
    # שמכיל אותו — כפילות בקובץ 2012 (שלמה 22.09: "תבדוק אם לא היו תחנות בשם דומה
    # באזור"); שדה 11 = המק"ט האמיתי, והממשק מציג רק אותו
    import math
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from build_magihim_site import norm
    real = [(k, norm(r[0]), r[1], r[2]) for k, r in snapf['stops'].items() if not (len(k) == 7 and k.startswith('99'))]
    n_dup = 0
    for code, row in snapf['stops'].items():
        if not (len(code) == 7 and code.startswith('99')):
            continue
        nm = norm(row[0])
        best = None
        for k2, nm2, la, lo in real:
            d = math.hypot((row[1] - la) * 110540, (row[2] - lo) * 111320 * math.cos(math.radians(la)))
            if d <= 100 and nm and (nm == nm2 or nm in nm2 or nm2 in nm):
                if best is None or d < best[0]:
                    best = (d, k2)
        while len(row) < 11:
            row.append(None)
        row[11:] = [best[1] if best else None]
        n_dup += 1 if best else 0
    print(f'מק"טים זמניים עם כפיל אמיתי עד 100 מ\': {n_dup}')
    snapf['note'] = snapf['note'].split(' שדה 10')[0] + ' שדה 10: מספר קווי 2012 (מגיעים) שעצרו בתחנה לפי ההצלבה. שדה 11: למק"ט זמני (99xxxxx) — המק"ט האמיתי של תחנה באותו שם עד 100 מ\', כשיש (כפילות בקובץ).'
    json.dump(snapf, open(snap_path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    d2 = f'{DATA}/stops-2012'
    os.makedirs(d2, exist_ok=True)
    for old in glob.glob(f'{d2}/*.json'):
        os.remove(old)
    parts = {}
    for code, row in snapf['stops'].items():
        parts.setdefault(shard_of(code), {})[code] = row
    for sh, part in parts.items():
        json.dump(part, open(f'{d2}/{sh}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    # קווי 2012 של מק"ט זמני כפול עוברים לתחנה האמיתית שלצידו — כדי שעמוד התחנה האמיתית יראה אותם
    for code, row in snapf['stops'].items():
        if len(row) > 11 and row[11] and code in by_code:
            by_code.setdefault(row[11], {}).update(by_code[code])
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
    big = max(os.path.getsize(f'{out}/{sh}.json') for sh in shards) if shards else 0
    print(f'קווי 2012 לפי תחנה: {len(by_code):,} מק"טים, {len(shards)} שברים, הגדול {big // 1024} ק"ב')


if __name__ == '__main__':
    main()
