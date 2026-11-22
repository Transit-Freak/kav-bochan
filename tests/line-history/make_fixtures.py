#!/usr/bin/env python3
"""הנתונים הקבועים של בדיקת "הקו בזמן" בדפדפן (tests/line-history/ui.mjs).

גוזר מהנתונים האמיתיים שב-origin/main (git show, קובץ-קובץ — בלי להוריד את תיקיות הנתונים) כמה קווים, חודשים,
הודעות ותחנה אחת, וכותב אותם ל-tests/fixtures/line-history/data — באותו מבנה של line-history/data.

הרצה (משורש הריפו):
    git fetch --depth 1 --filter=blob:none origin main
    python3 tests/line-history/make_fixtures.py
אחרי הרצה הנתונים משתנים (הם מהיום), ולכן צריך לעדכן גם את הציפיות ב-ui.mjs (הקבועים בראש הקובץ).
"""
import json
import os
import shutil
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(REPO, 'tests', 'fixtures', 'line-history', 'data')
SRC = 'line-history/data/'

MKTS = ('13146', '15145')          # קו 146 וקו 145 (סופרבוס, חולון) — כל הכיוונים והחלופות
OPEN = ('13146-1-0', '13146-2-0', '15145-1-0')   # לקווים האלה יש גם קובץ קו מלא
STOP = '36356'                      # שד' ירושלים/הלהב, חולון — נוספה לקו 146 ב-10.11.2026
MONTHS = ['2026-11', '2026-10']     # משרד התחבורה
OLD = '2012-07'                     # צילום 2012 של משרד התחבורה
WEB = ['2012-05', '2012-01', '2011-08']   # צילומי אתרי מידע לנוסעים
NEWS_YEARS = {'2005': 3, '2011': 5, '2012': 5}   # הודעות החברות: כמה מכל חברה בכל שנה
EXTRA = 10                          # כמה שינויים של קווים אחרים בכל חודש


def show(path):
    r = subprocess.run(['git', 'show', 'origin/main:' + SRC + path], cwd=REPO, capture_output=True)
    return json.loads(r.stdout) if r.returncode == 0 else None


def write(path, data):
    p = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))


def fsafe(rd):
    return rd.replace('#', 'H').replace('/', '_')


def ours(rd):
    return str(rd).split('-')[0] in MKTS


def main():
    shutil.rmtree(OUT, ignore_errors=True)
    idx = show('lines.json')
    by_rd = {l['rd']: l for l in idx['lines']}
    keep = [l['rd'] for l in idx['lines'] if ours(l['rd'])]

    # שינויים לפי חודש: כל השינויים של הקווים שלנו, ועוד כמה של קווים אחרים (רק שורה באינדקס, בלי קובץ קו)
    for m in MONTHS:
        ch = show('changes/%s.json' % m)['changes']
        mine = [c for c in ch if ours(c['rd'])]
        days = {c['d'] for c in mine}
        other = [c for c in ch if not ours(c['rd']) and c['rd'] in by_rd and not by_rd[c['rd']].get('tt')
                 and c['k'] not in ('freq', 'sched') and c['d'] in days][:EXTRA]
        keep += [c['rd'] for c in other]
        write('changes/%s.json' % m, {'month': m, 'changes': sorted(mine + other, key=lambda c: c['d'])})
    for m in [OLD] + WEB:
        ch = [c for c in show('changes/%s.json' % m)['changes'] if c['rd'] in by_rd][:6]
        keep += [c['rd'] for c in ch]
        write('changes/%s.json' % m, {'month': m, 'changes': ch})
    months = sorted(MONTHS + [OLD] + WEB)
    write('months.json', {'months': months, 'stopMonths': MONTHS, 'modeMonths': {'lines': months, 'rail': [], 'taxi': []},
                          'webMonths': sorted(WEB), 'officialMonths': sorted(MONTHS + [OLD])})

    keep = list(dict.fromkeys(keep))
    write('lines.json', {'gen': idx['gen'], 'first': idx.get('first', False), 'lines': [by_rd[r] for r in keep]})
    for rd in OPEN:
        write('lines/%s.json' % fsafe(rd), show('lines/%s.json' % fsafe(rd)))

    # שברים לפי קידומת — רק הקווים שלנו
    for pre in sorted({m[:2] for m in MKTS}):
        s = show('sched/%s.json' % pre)
        write('sched/%s.json' % pre, {'g': s['g'], 'lines': {k: v for k, v in s['lines'].items() if ours(k)}})
        write('successors/%s.json' % pre, {k: v for k, v in (show('successors/%s.json' % pre) or {}).items() if ours(k)})
        write('alt-desc/%s.json' % pre, {k: v for k, v in (show('alt-desc/%s.json' % pre) or {}).items() if k in MKTS})
    write('successors/index.json', [r for r in (show('successors/index.json') or []) if r in keep])
    write('temp/index.json', [])   # בלי "שינוי זמני" — ההודעות מתחלפות כל יום
    write('historical-groups-2012.json', {'source': 'miu-2012-07', 'groups': []})

    # ערים בדרך (לחיפוש לפי עיר): רק הקווים שבאינדקס
    rc = [show('route-cities-0.json'), show('route-cities-1.json')]
    routes = {}
    for p in rc:
        routes.update({k: v for k, v in p['routes'].items() if k in keep})
    write('route-cities-0.json', {'epoch': rc[0]['epoch'], 'cities': rc[0]['cities'], 'routes': routes})
    write('route-cities-1.json', {'epoch': rc[0]['epoch'], 'cities': rc[0]['cities'][:0], 'routes': {}})

    # הודעות החברות (דן ואגד): כמה הודעות מכל שנה
    for f in ('news-dan.json', 'news-egged.json'):
        n = show(f)
        out = []
        for y, k in sorted(NEWS_YEARS.items()):
            out += [x for x in n if x['d'].startswith(y)][:k]
        write(f, out)

    # תחנה אחת: קורות החיים, הקווים שעצרו בה, סוג התחנה; ושינויי התחנות של שני החודשים
    pre = STOP[:2]
    hist = show('stops/%s.json' % pre)
    write('stops/%s.json' % pre, {STOP: hist[STOP]})
    write('stops-hist.json', {STOP: hist[STOP]})
    write('stopev/%s.json' % pre, {STOP: show('stopev/%s.json' % pre)[STOP]})
    write('stop-types/%s.json' % pre, {STOP: show('stop-types/%s.json' % pre).get(STOP, '')})
    for m in MONTHS:
        ch = show('changes/stops-%s.json' % m)['changes']
        write('changes/stops-%s.json' % m, {'month': m, 'changes': ch[:12]})
    plat = show('platforms.json')
    write('platforms.json', {'v': plat['v'], 'updated': plat['updated'], 'st': {}, 'rd': {}})

    total = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(OUT) for f in fs)
    print('נכתבו %d קווים באינדקס, %d KB ב-%s' % (len(keep), total // 1024, os.path.relpath(OUT, REPO)))


if __name__ == '__main__':
    main()
