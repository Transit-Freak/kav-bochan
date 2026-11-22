# -*- coding: utf-8 -*-
"""בונה מחדש את הנתונים הקבועים לבדיקת "צי הרכבים" בדפדפן (tests/fixtures/fleet) מתוך נתוני האתר.

הנתונים מועתקים פעם אחת ונשארים קבועים, כדי שהבדיקה תראה רק שינויים בקוד ולא את עדכוני הלילה.
מריצים את זה רק כשרוצים להחליף את הנתונים שבבדיקה, ואז מעדכנים גם את המספרים והשמות ב-page.mjs (ראו README.md).

מה נשאר: רכב אחד מכל דגם (כל הדגמים — יותר מ-48), כל הרכבים של הדגמים שבבדיקה (MODELS), ועוד כמה רכבים
של החברה שבבדיקה. לכל רכב שנבחר — כל הרשומות שלו, אצל כל החברות. שאר הקבצים מצומצמים לרכבים האלה.

הרצה (מעותק של הריפו, בלי להוריד את תיקיית הנתונים):
    python3 tests/fleet/make_fixtures.py            # קורא מ-origin/main בעזרת git show
    python3 tests/fleet/make_fixtures.py <תיקייה>   # או מתיקייה מקומית שיש בה fleet/data ו-bus/data
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'fixtures', 'fleet')

# הדגמים שבבדיקה: הראשון — רכבי קו עם "נסיעות בודדות" אצל חברות אחרות; השני — רכבי קבלן שעברו בין הרבה חברות
MODELS = ['יוטונג סין TFGBW', 'מאן פולין 430 מנוע RR2']
OP = 35                            # החברה שבבדיקה (בית שמש אקספרס)
OP_EXTRA = 40                      # כמה רכבים נוספים שלה נשארים
GOV_EXTRA = 12                     # לכמה רכבים נוספים נשארים הפרטים מהמאגר הממשלתי


def reader(src):
    if src:
        return lambda p: open(os.path.join(src, p), encoding='utf-8').read()
    return lambda p: subprocess.run(['git', 'show', 'origin/main:' + p], check=True,
                                    capture_output=True, text=True).stdout


def dump(name, obj):
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')


def clean(plate):
    return ''.join(c for c in plate if c.isdigit()).lstrip('0')


def main():
    read = reader(sys.argv[1] if len(sys.argv) > 1 else None)
    js = lambda p: json.loads(read(p))
    fleet = js('fleet/data/fleet.json')

    # הרכבים שנשארים
    by_model, keep = {}, set()
    for o in fleet['operators']:
        for v in o['vehicles']:
            if v[5]:
                by_model.setdefault(v[5], []).append(v[0])
            if v[5] in MODELS:
                keep.add(v[0])
    for m in by_model:
        keep.add(sorted(by_model[m])[0])
    mine = next(o for o in fleet['operators'] if o['ref'] == OP)
    keep.update(sorted(v[0] for v in mine['vehicles'])[:OP_EXTRA])

    ops = []
    for o in fleet['operators']:
        vs = [v for v in o['vehicles'] if v[0] in keep]
        if vs:
            ops.append({'ref': o['ref'], 'name': o['name'], 'vehicles': vs})
    # לא מהנתונים: חברה שהדף מסתיר (מספר 21) וחברה בלי שם ("מפעיל 99") — לבדיקה שהן לא מוצגות
    ops.append({'ref': 21, 'name': 'חברה מוסתרת', 'vehicles': [['99900001', '2023-01-01', fleet['updated'], 5.0, 2020, 'דגם מוסתר', None, 'צבורי עירוני']]})
    ops.append({'ref': 99, 'name': 'מפעיל 99', 'vehicles': [['99900002', '2023-01-01', fleet['updated'], 5.0, 2020, 'דגם מוסתר', None, 'צבורי עירוני']]})
    fleet['operators'] = ops
    dump('fleet.json', fleet)

    keys = {'%s:%s' % (o['ref'], v[0]) for o in ops for v in o['vehicles']}
    cl = {clean(p) for p in keep}

    def cut(path, field, ks):
        j = js(path)
        j[field] = {k: v for k, v in j[field].items() if k in ks}
        return j

    dump('fleet-days.json', cut('fleet/data/fleet-days.json', 'd', keys))
    dump('fleet-km.json', cut('fleet/data/fleet-km.json', 'km', keys))
    dump('fleet-gaps.json', cut('fleet/data/fleet-gaps.json', 'g', keys))
    dump('fleet-armor.json', cut('fleet/data/fleet-armor.json', 'armor', cl))
    ofc = cut('fleet/data/fleet-official.json', 'of', cl)
    ofc['h'] = {k: v for k, v in ofc.get('h', {}).items() if k in cl}
    dump('fleet-official.json', ofc)
    dump('fleet-moves.json', cut('fleet/data/fleet-moves.json', 'm', keep))
    dump('fleet-bitul.json', {k: v for k, v in js('fleet/data/fleet-bitul.json').items() if k in cl})
    dump('fleet-bitul-sofi.json', {k: v for k, v in js('fleet/data/fleet-bitul-sofi.json').items() if k in cl})
    dump('fleet-photos.json', {'p': {}})

    # פרטי הרכב מהמאגר הממשלתי: לרכבי הדגמים שבבדיקה ולעוד כמה רכבים של החברה
    gov = {clean(p) for m in MODELS for p in by_model[m]} | {clean(p) for p in sorted(v[0] for v in mine['vehicles'])[:GOV_EXTRA]}
    for d in range(10):
        sh = js('fleet/data/gov-details-%d.json' % d)
        dump('gov-details-%d.json' % d, {k: v for k, v in sh.items() if k in gov})

    gps = js('bus/data/gps.json')
    gps['v'] = [x for x in gps['v'] if clean(str(x[0])) in cl]
    dump('bus-gps.json', gps)

    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print('%d רכבים, %d חברות, %d דגמים, %d KB' % (len(keep), len(ops), len(by_model), total // 1024))


if __name__ == '__main__':
    main()
