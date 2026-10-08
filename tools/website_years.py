#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""סיכום לפי שנה של צילומי אתרי המידע לנוסעים (2003–2015): אילו חברות ואילו אזורים מופיעים בכל שנה.
שלמה 08.10: במקום "כמה עלה וכמה לא" — לכל שנה מה המידע העיקרי ואילו אזורים מכוסים, בלחיצה על השנה.

קו = חברה + מספר קו (כל הכיוונים והחלופות יחד). קו נספר בשנה שיש לו בה צילום. האזורים — היישובים
שהקו עובר בהם (towns בקובץ הקו). נכתב ל-line-history/data/website-years.json.
"""
import collections
import glob
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'line-history', 'data')
# אותו יישוב בשני שמות; "חסר מעמד" — יישובים בלי שם במאגר, לא אזור
SAME = {'תל אביב': 'תל אביב יפו', 'תל אביב-יפו': 'תל אביב יפו', 'פתח תקווה': 'פתח תקוה'}
SKIP = {'חסר מעמד', ''}


def build(data=DATA):
    Y = collections.defaultdict(lambda: {'lines': set(), 'ops': collections.Counter(), 'towns': collections.Counter(), 'months': set()})
    for f in glob.glob(os.path.join(data, 'lines', 'website*.json')):
        d = json.load(open(f, encoding='utf-8'))
        key = (d.get('op') or '', d.get('line') or '')
        towns = {SAME.get(t, t) for t in (d.get('towns') or [])} - SKIP
        for v in d.get('versions') or []:
            y = (v.get('d') or '')[:4]
            if not y:
                continue
            e = Y[y]
            e['months'].add(v['d'][:7])
            if key in e['lines']:
                continue
            e['lines'].add(key)
            e['ops'][key[0]] += 1
            for t in towns:
                e['towns'][t] += 1
    years = [{'y': y, 'lines': len(e['lines']), 'months': sorted(e['months']),
              'ops': e['ops'].most_common(), 'towns': e['towns'].most_common(12)} for y, e in sorted(Y.items())]
    return {'rule': 'קו = חברה + מספר קו. נספר בשנה שיש לו בה צילום. אזורים = היישובים שהקו עובר בהם.', 'years': years}


def main():
    out = build()
    with open(os.path.join(DATA, 'website-years.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print('website-years:', ', '.join(f"{y['y']}={y['lines']}" for y in out['years']))


if __name__ == '__main__':
    main()
