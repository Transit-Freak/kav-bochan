#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""סגירת וריאנטים שנעלמו מהרישום בלי אירוע ביטול.

הסורק היומי (linehistory.py) מסמן "בוטל" רק לווריאנט שהוא עצמו ראה חי ביום
הקודם. וריאנטים שנבנו ממילוי הארכיון — למשל קו 203 בראשון לציון, שהגרסה
האחרונה שלו היא צילום מ-30.10.2022 — מעולם לא היו במצב היומי, ולכן נשארו
"חיים" לנצח: האינדקס הראה אותם פעילים, ועמוד התחנה אמר שהם עוצרים בה היום
(דיווח שלמה 07.09, תחנה 38772).

כאן: וריאנט שיש לו קובץ, שאינו ברישום היום (state-routes.json — כל מה שיש לו
נסיעות בקובץ, גם אם לא בתוקף היום), שהגרסה האמיתית האחרונה שלו ישנה מחודשיים,
ושעדיין לא סומן — מקבל אירוע ביטול. התאריך המדויק אינו ידוע (הארכיון לא
נסרק יום-יום), אז האירוע מתוארך ליום שאחרי הגרסה האחרונה, מסומן approx,
ואומר זאת במפורש. הפיד החודשי מקבל את אותו אירוע.

הפעלה יומית אחרי הסורק ולפני בניית האינדקס והיסטוריית התחנות.
"""
import datetime
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from compact_lines import materialize  # noqa: E402

OUTDIR = os.environ.get('OUTDIR', 'line-history/data')
TODAY = datetime.date.today()
STALE_DAYS = 90


def fmt_d(d):
    return '.'.join(reversed(d.split('-')))


def main():
    try:
        registered = set(json.load(open(f'{OUTDIR}/state-routes.json', encoding='utf-8')).keys())
    except Exception as e:  # noqa: BLE001
        raise SystemExit(f'אין state-routes.json — {e}')
    if len(registered) < 1000:
        raise SystemExit(f'state-routes.json קטן מדי ({len(registered)}) — לא סוגרים כלום')
    cut = (TODAY - datetime.timedelta(days=STALE_DAYS)).isoformat()
    chm_cache = {}
    n_closed = 0
    for p in sorted(glob.glob(f'{OUTDIR}/lines/*.json')):
        raw = json.load(open(p, encoding='utf-8'))
        lf = materialize(json.loads(json.dumps(raw)))
        rd = lf.get('rd') or ''
        if not rd or rd in registered:
            continue
        if lf.get('tt') and lf.get('tt') != 'demand':      # רכבת/מוניות — לא חלק מהרישום היומי
            continue
        vs = lf.get('versions') or []
        # וריאנט שיש לו רק "תוכנן ולא נכנס לפעול" מעולם לא נסע — הוא לא "בוטל"
        real = [v for v in vs if v.get('k') != 'planned-dropped']
        if not real or real[-1].get('k') == 'removed':
            continue
        last_d = real[-1].get('d') or ''
        if not last_d or last_d >= cut:
            continue
        d = (datetime.date.fromisoformat(last_d) + datetime.timedelta(days=1)).isoformat()
        note = (f'הווריאנט אינו ברישום היום. הוא נעלם מתישהו אחרי {fmt_d(last_d)} — התאריך המדויק '
                f'לא תועד, כי הגרסאות שלו נבנו מצילומי ארכיון ולא מהסריקה היומית')
        ev = {'d': d, 'k': 'removed', 'shp': '', 'stops': [], 'note': note, 'approx': True, 'after': last_d}
        raw.setdefault('versions', []).append(ev)
        json.dump(raw, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        month = d[:7]
        if month not in chm_cache:
            cp = f'{OUTDIR}/changes/{month}.json'
            try:
                chm_cache[month] = (cp, json.load(open(cp, encoding='utf-8')))
            except Exception:  # noqa: BLE001
                chm_cache[month] = (cp, {'month': month, 'changes': []})
        cp, chm = chm_cache[month]
        if not any(c.get('rd') == rd and c.get('k') == 'removed' and c.get('d') == d for c in chm['changes']):
            chm['changes'].append({'d': d, 'rd': rd, 'line': lf.get('line', ''), 'k': 'removed', 'approx': True, 'note': note})
        n_closed += 1
        print(f'  {rd} (קו {lf.get("line", "")}): גרסה אחרונה {last_d} → בוטל ~{d}')
    for cp, chm in chm_cache.values():
        chm['changes'].sort(key=lambda c: c.get('d', ''))
        json.dump(chm, open(cp, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'וריאנטים שנעלמו מהרישום ונסגרו: {n_closed}')


if __name__ == '__main__':
    main()
