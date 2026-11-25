#!/usr/bin/env python3
"""מוניות שירות בנתוני חופש המידע ("מסלול לפי שנים" 2013–2017) — סימון כמוניות, בלי מספר קו משוער.

בקובץ של משרד התחבורה יש כ-95 מק"טים של מוניות שירות (7 ספרות, למשל 5230112). הם מזוהים לפי
תחנות הקצה ("תחנת מוניות …") ולפי זה שבכל גרסה יש בדיוק שתי תחנות — מוצא ויעד, בלי תחנות בדרך.
הייבוא (`import_foi_routes.py`) ניחש את מספר הקו משלוש הספרות האחרונות של המק"ט, וזה לא נכון במוניות:
שבעה קווים שונים בין תל אביב לערים אחרות הופיעו כולם כ"קו 112". לכן:
- `tt: "taxi"` (כמו מוניות השירות מתקופת ה-GTFS), ואין מספר קו (`line: ""`). הדף מציג
  "מונית שירות · עיר ↔ עיר".
- מספרים שאומתו (`CONFIRMED`): 5104104 הוא קווים 4 ו-5א בתל אביב (לפי תחנות הקצה), 5208160 הוא קו 16.
  לקווים האלה יש המשך בתקופת ה-GTFS — `foiNext` מקשר לווריאנט שהמשיך, והמפה מציגה את המסלול שלו.
- בתיאור (`dest`) שם התחנה בלי "תחנת מוניות" ושם העיר בלי מקף ("תל אביב -יפו" ← "תל אביב יפו"),
  כי הדף מפריד עיר ותחנה לפי מקף, והאינדקס חותך את התיאור ב-80 תווים.
- ההערה בגרסה הראשונה לא אומרת "מספר הקו משוער" כשאין מספר.

רץ מתוך הייבוא (לכל קו שמוכר רק מהקובץ), וגם לבד על כל קבצי הקווים — אידמפוטנטי:
  OUTDIR=line-history/data python3 tools/foi_taxi.py
ואחריו `rebuild_lines_index.py`, כדי שהאינדקס יקבל את tt/line/dest החדשים.
"""
import json
import math
import os
import re
import sys
from pathlib import Path

OUTDIR = os.environ.get('OUTDIR', 'line-history/data')
TAXI_PREFIX = 'תחנת מוניות'
GUESS_TXT = 'מספר הקו משוער לפי המק״ט, '
STRAIGHT_TXT = 'והמפה מחברת את התחנות בקווים ישרים.'
NEXT_TXT = 'והמפה מציגה את המסלול של הקו שהמשיך אותו.'

# מספרי קו שאומתו. לכל מק"ט: (מספר, מילות מפתח בשם תחנת קצה — ריק = כל וריאנט, הווריאנטים שהמשיכו)
# 5104104: תחנה מרכזית ↔ רדינג = קו 4; תמחת ↔ שכונת בבלי = 5א (שניהם המשיכו ב-GTFS מ-18.07.2019).
# 5208160: הכובשים ↔ רמת גן דרך הטייסים = קו 16 (52016, מ-01.10.2020).
# 3215116 (באר שבע ↔ אופקים) לא נכנס: 15323 נוסע ממרכז הירידים לנתיבות — תחנות הקצה שונות.
CONFIRMED = {
    '5104104': [('5א', ('בבלי',), ['87005-1-א', '87005-2-א']),
                ('4', ('רדינג', 'רידינג'), ['90004-1-#', '90004-2-#'])],
    '5208160': [('16', (), ['52016-1-#', '52016-2-#'])],
}


def fsafe(rd):
    return rd.replace('#', 'H').replace('/', '_')


def _stops(v, pool):
    st = v.get('stops') or []
    if st and isinstance(st[0], int):
        return [pool[i] for i in st] if pool else []
    return st


def stop_lists(lf):
    pool = lf.get('pool')
    return [s for s in (_stops(v, pool) for v in lf.get('versions') or []) if s]


def is_taxi_stop(name):
    return str(name or '').strip().startswith(TAXI_PREFIX)


def is_foi_taxi(lf):
    """קו מוניות שירות שמוכר רק מנתוני חופש המידע."""
    if not lf or not lf.get('foiOnly'):
        return False
    mk = str(lf.get('rd', '')).split('-')[0]
    if not re.fullmatch(r'\d{7}', mk):
        return False
    lists = stop_lists(lf)
    if not lists or any(len(s) != 2 for s in lists):
        return False
    return any(is_taxi_stop(x[1]) for s in lists for x in s)


def clean_city(c):
    """"תל אביב -יפו" ← "תל אביב יפו"; "מודיעין-מכבים-רעות*" ← "מודיעין מכבים רעות"."""
    return re.sub(r'\s+', ' ', re.sub(r'\s*-\s*', ' ', str(c or '').replace('*', ''))).strip()


def clean_dest(dest, first, last):
    """התיאור "תחנה-עיר<->תחנה-עיר": שם התחנה בלי "תחנת מוניות" (הסוג כבר ב-tt, והאינדקס חותך
    את התיאור ב-80 תווים — בלי הקיצור שם העיר השנייה נחתך), ושם העיר בלי מקפים."""
    sides = str(dest or '').split('<->')
    if len(sides) != 2:
        return dest
    out = []
    for side, name in zip(sides, (first, last)):
        for cand in (name, _base(name)):
            if cand and side.startswith(cand + '-'):
                out.append(f'{_base(name)}-{clean_city(side[len(cand) + 1:])}')
                break
        else:
            out.append(side)
    return '<->'.join(out)


def _dist(a, b):
    try:
        la1, lo1, la2, lo2 = float(a[2]), float(a[3]), float(b[2]), float(b[3])
    except (TypeError, ValueError, IndexError):
        return 1e9
    k = math.cos(math.radians((la1 + la2) / 2))
    return math.hypot(la1 - la2, (lo1 - lo2) * k) * 111.2


def _base(name):
    return re.sub(r'^' + TAXI_PREFIX + r'\s*', '', str(name or '')).strip()


def confirmed(rd, first, last):
    """(מספר, רשימת ממשיכים) לווריאנט שהמספר שלו אומת, או None."""
    for line, keys, nxt in CONFIRMED.get(rd.split('-')[0], []):
        names = (first[1], last[1])
        if _base(names[0]) == _base(names[1]):
            continue   # מעגלי, למשל רדינג ↔ רדינג — לא ברור לאיזה קו שייך
        if not keys or any(k in n for k in keys for n in names):
            return line, nxt
    return None


def successor(first, last, cands, lines_dir):
    """הווריאנט הממשיך שתחנות הקצה שלו בגרסה הראשונה הכי קרובות (מוצא למוצא, יעד ליעד)."""
    best = None
    for rd in cands:
        p = Path(lines_dir) / f'{fsafe(rd)}.json'
        if not p.exists():
            continue
        lf = json.load(open(p, encoding='utf-8'))
        vs = sorted((v for v in lf.get('versions') or [] if not v.get('hid')), key=lambda v: v['d'])
        geo = next((v for v in vs if len(_stops(v, lf.get('pool'))) >= 2), None)
        if not geo:
            continue
        st = _stops(geo, lf.get('pool'))
        score = _dist(first, st[0]) + _dist(last, st[-1])
        if best is None or score < best[0]:
            best = (score, {'rd': rd, 'line': lf.get('line', ''), 'd': vs[0]['d']})
    # מוצא ויעד יחד עד 3 ק"מ (תחנה מרכזית ↔ רכבת ההגנה בכיוון ההפוך של קו 4 — כ-1.3 ק"מ)
    return best[1] if best and best[0] <= 3 else None


def fix_note(note, guess, nxt):
    note = note or ''
    if not guess:
        note = note.replace(GUESS_TXT, '')
    if nxt:
        note = note.replace(STRAIGHT_TXT, NEXT_TXT)
    else:
        note = note.replace(NEXT_TXT, STRAIGHT_TXT)
    return note


def apply(lf, lines_dir=None):
    """מסמן קו מוניות של חופש המידע. מחזיר True אם הקובץ השתנה. עובד על קובץ דחוס או פתוח."""
    if not is_foi_taxi(lf):
        return False
    before = json.dumps(lf, ensure_ascii=False, sort_keys=True)
    rd = lf['rd']
    lists = stop_lists(lf)
    first, last = lists[0][0], lists[-1][-1]
    lf['tt'] = 'taxi'
    lf.pop('lineGuess', None)
    conf = confirmed(rd, first, last)
    lf['line'] = conf[0] if conf else ''
    nxt = successor(first, last, conf[1], lines_dir or Path(OUTDIR) / 'lines') if conf else None
    if nxt:
        lf['foiNext'] = nxt
    else:
        lf.pop('foiNext', None)
    lf['dest'] = clean_dest(lf.get('dest'), first[1], last[1])
    for v in lf.get('versions') or []:
        if v.get('note') and v.get('src') == 'mot-foi':
            v['note'] = fix_note(v['note'], False, nxt)
    return json.dumps(lf, ensure_ascii=False, sort_keys=True) != before


def main():
    lines = Path(OUTDIR) / 'lines'
    n = changed = 0
    for p in sorted(lines.glob('*.json')):
        raw = p.read_text(encoding='utf-8')
        if '"foiOnly"' not in raw or TAXI_PREFIX not in raw:
            continue
        lf = json.loads(raw)
        if not is_foi_taxi(lf):
            continue
        n += 1
        if apply(lf, lines):
            p.write_text(json.dumps(lf, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
            changed += 1
    print(f'מוניות שירות מחופש המידע: {n} וריאנטים, {changed} עודכנו', file=sys.stderr)


if __name__ == '__main__':
    main()
