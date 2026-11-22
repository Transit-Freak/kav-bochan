# -*- coding: utf-8 -*-
"""בונה מחדש את הנתונים הקבועים לבדיקת קו פח (tests/fixtures/kavpach) מתוך נתוני האתר.

לוקחים רק את הקווים שהמוצא או היעד שלהם באחת מהערים שב-CITIES, מכל קובצי הנתונים של הכלי.
הנתונים מועתקים פעם אחת ונשארים קבועים, כדי שהבדיקה תראה רק שינויים בקוד ולא את עדכוני הנתונים.
אחרי בנייה מחדש — לעדכן ב-app.mjs את המספרים והקווים שהבדיקה מצפה להם (ראו README.md).

הרצה (מעותק של הריפו, בלי להוריד את קובצי הנתונים):
    git fetch --depth 1 --filter=blob:none origin main
    python3 tests/kavpach/make_fixtures.py
"""
import json
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(HERE, '..', '..')
OUT = os.path.join(HERE, '..', 'fixtures', 'kavpach')
CITIES = ['ערד', 'דימונה', 'שדרות', 'קרית מלאכי']
# כמה קווים חזקים (בני ברק, חולון, אלעד) — בשביל הקו המוזהב
EXTRA = ['28003', '26005', '39017', '21005', '11379', '12180']


def show(path):
    return json.loads(subprocess.check_output(['git', 'show', 'origin/main:' + path], cwd=REPO).decode('utf-8'))


def dump(name, obj):
    p = os.path.join(OUT, name)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    return os.path.getsize(p)


def main():
    pre = show('data-lines.json')
    lines = [l for l in pre['lines'] if l['origin'] in CITIES or l['dest'] in CITIES or l['makat'] in EXTRA]
    mk = set(m for l in lines for m in l['makats'])
    bare = set(m.lstrip('0') for m in mk)

    main_rows = [r for r in show('data-main.json') if r[0] in mk]
    sched = [r for r in show('data-schedule.json') if r[0] in mk]
    stops = [r for r in show('data-stops.json') if r[0] in mk]
    n_main = dump('data-main.json', main_rows)
    n_sched = dump('data-schedule.json', sched)
    dump('data-stops.json', stops)
    dump('data-benchmark.json', show('data-benchmark.json'))

    # הקובץ המוכן: הגדלים של קובצי המקור צריכים להתאים, אחרת הדף מחשב הכל בדפדפן
    pre['lines'] = lines
    pre['src'] = {'main': str(n_main), 'schedule': str(n_sched)}
    dump('data-lines.json', pre)

    live = show('kavpach-live.json')
    live['lines'] = {k: v for k, v in live['lines'].items() if k.split('-')[0] in bare}
    live['opOf'] = {k: v for k, v in live['opOf'].items() if k in bare}
    dump('kavpach-live.json', live)

    ov = show('kavpach-overlap.json')
    # כל החפיפות של הקווים שנבחרו, גם מול קווים שלא בנתונים הקבועים — כדי שהציון יצא כמו בקובץ המוכן
    ov['lines'] = {k: v for k, v in ov['lines'].items() if k in mk}
    dump('kavpach-overlap.json', ov)

    ride = show('kavpach-ridership.json')
    ride['m'] = {k: v for k, v in ride['m'].items() if k in mk}
    dump('kavpach-ridership.json', ride)

    dh = show('bus/data/deadhead.json')
    dh['lines'] = {k: v for k, v in dh['lines'].items() if k in mk}
    dump('bus/data/deadhead.json', dh)

    total = 0
    for root, _, files in os.walk(OUT):
        for f in files:
            total += os.path.getsize(os.path.join(root, f))
    print('%d קווים · %d נסיעות בלוח · %d תחנות · %.0f KB' % (len(lines), len(sched), len(stops), total / 1024))


if __name__ == '__main__':
    main()
