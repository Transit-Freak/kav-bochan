#!/usr/bin/env python3
"""rail-reasons.json — "!" ליד רכבת שפעלה שנה או פחות, רק כשנמצאה ואומתה סיבה (שלמה 05.10).

הקלט: rail-short-lived.json (המועמדים, tools/rail_short_lived.py) ו-rail-reasons-research.json
(מה שהפאנל מצא: לכל מועמד סיבה, קישור, מקור, תאריך, ופסק הדין של הבודק). נכנס לאתר רק מה
שהבודק אישר (verdict == "confirmed") ויש לו קישור; כל השאר — בלי סימון.

  OUTDIR=line-history/data python3 tools/build_rail_reasons.py
"""
import json, os
from pathlib import Path

OUT = Path(os.environ.get('OUTDIR', 'line-history/data'))


def build(candidates, research):
    by_id = {r['id']: r for r in research}
    rd, shown = {}, 0
    for c in candidates:
        r = by_id.get(c['id'])
        if not r or r.get('verdict') != 'confirmed' or not r.get('reason') or not r.get('url'):
            continue
        shown += 1
        entry = {'text': r['reason'], 'url': r['url'], 'source': r.get('source') or '', 'published': r.get('published'),
                 'first': c['first'], 'last': c['last'], 'pair': c['id']}
        for x in c['rds']:
            rd[x] = entry
    return {'v': 1, 'trains': shown, 'rd': rd}


def main():
    candidates = json.loads((OUT / 'rail-short-lived.json').read_text(encoding='utf-8'))['candidates']
    research = json.loads((OUT / 'rail-reasons-research.json').read_text(encoding='utf-8'))
    out = build(candidates, research)
    (OUT / 'rail-reasons.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f"{out['trains']} רכבות עם סיבה מאומתת ({len(out['rd'])} חלופות וכיוונים) מתוך {len(candidates)} מועמדות")


if __name__ == '__main__':
    main()
