#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""קישור ישיר בין קווי היום לקווי 2012 של משרד התחבורה (קובצי ה-GTFS מיולי 2012,
line-history/data/lines/archive2012r*.json) — בלי לעבור דרך אתר מגיעים (שלמה 26.09:
"שהבחירה תהיה של 2012 של משרד התחבורה").

לכל קו של היום: הגרסה הישנה ביותר שידועה (רצף התחנות לפי מק"ט), מול כל קווי 2012 עם
אותו מספר קו. ציון = התחנות המשותפות חלקי האורך של הקצר מבין השניים; נקשר כשיש לפחות
5 תחנות משותפות וציון 60% ומעלה. נשמרים הטוב ביותר וכל מי שקרוב אליו (עד 10 נקודות),
כי לקו של היום יכולות להיות כמה חלופות של 2012.

פלט: line-history/data/mot2012-links/<2 ספרות ראשונות>.json =
  {rd של היום: [[rd של 2012, יעד, מפעיל, תחנות, משותפות, ציון %], ...]} מהטוב לפחות טוב.
"""
import collections
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from compact_lines import materialize  # noqa: E402

DIR = os.environ.get('OUTDIR', 'line-history/data')


def num(x):
    return str(x or '').strip().lstrip('0') or '0'


def main():
    by_line = collections.defaultdict(list)
    for p in glob.glob(f'{DIR}/lines/archive2012r*.json'):
        try:
            lf = materialize(json.load(open(p, encoding='utf-8')))
        except Exception:
            continue
        vs = [v for v in lf.get('versions', []) if v.get('stops')]
        if not vs:
            continue
        stops = vs[-1]['stops']
        codes = {str(s[0]) for s in stops if s and s[0]}
        if len(codes) >= 5:
            by_line[num(lf.get('line'))].append((lf['rd'], lf.get('dest', ''), lf.get('op', ''), len(stops), codes))
    print(f'קווי 2012 של משרד התחבורה: {sum(len(v) for v in by_line.values()):,} ב-{len(by_line):,} מספרי קו')
    out = collections.defaultdict(dict)
    n_linked = n_lines = 0
    for p in glob.glob(f'{DIR}/lines/*.json'):
        name = os.path.basename(p)
        if name.startswith('archive'):
            continue
        try:
            lf = materialize(json.load(open(p, encoding='utf-8')))
        except Exception:
            continue
        cands = by_line.get(num(lf.get('line')))
        if not cands:
            continue
        n_lines += 1
        vs = [v for v in lf.get('versions', []) if v.get('stops') and not v.get('syn')]
        if not vs:
            continue
        codes = {str(s[0]) for s in vs[0]['stops'] if s and s[0]}
        if len(codes) < 5:
            continue
        scored = []
        for rd12, dest, op, n, c12 in cands:
            common = len(codes & c12)
            if common < 5:
                continue
            score = common / min(len(codes), len(c12))
            if score >= 0.6:
                scored.append((score, common, rd12, dest, op, n))
        if not scored:
            continue
        scored.sort(key=lambda x: (-x[0], -x[1]))
        best = scored[0][0]
        keep = [x for x in scored if best - x[0] <= 0.10][:4]
        rd = lf['rd']
        out[(rd.split('-')[0][:2]).rjust(2, '0')][rd] = [[x[2], x[3], x[4], x[5], x[1], round(x[0] * 100)] for x in keep]
        n_linked += 1
    d = f'{DIR}/mot2012-links'
    os.makedirs(d, exist_ok=True)
    for old in glob.glob(f'{d}/*.json'):
        os.remove(old)
    for k, v in out.items():
        json.dump(v, open(f'{d}/{k}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'קווי היום שקושרו לקו 2012 של משרד התחבורה: {n_linked:,} מתוך {n_lines:,} שיש להם מספר קו תואם ב-2012 · {len(out)} שברים')


if __name__ == '__main__':
    main()
