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
