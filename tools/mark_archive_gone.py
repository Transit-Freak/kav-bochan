#!/usr/bin/env python3
# חלופה שהופיעה בארכיון אוטובוס פתוח ונעלמה ממנו — ולא מופיעה בשום מקור מאוחר יותר (2017 ואילך) — בוטלה.
# תאריך מקורב: בין הצילום האחרון שבו הופיעה לצילום הבא שנקלט. רץ מחדש אחרי כל ייבוא: אם החלופה חוזרת
# בצילום מאוחר יותר, הסימון מוסר ומחושב מחדש. (שלמה 27.09, קו 1 גדרה 33001-3-1)
import glob, json
cat = json.load(open('line-history/data/early-sources.json'))
done = json.load(open('line-history/data/early-progress.json'))['done']
dates = sorted({s['date'] for s in cat['snapshots'] if s['id'] in done and s['id'].startswith('obus')})
if not dates: raise SystemExit('אין צילומים')
last_imported = dates[-1]
seen = json.load(open('line-history/data/early-seen.json'))
NEXT_SOURCE = '2017-03-16'   # תחילת התיעוד הרציף (tf17): מה שלא מופיע ממנו והלאה כבר לא פעל
added = removed = 0
for f in glob.glob('line-history/data/lines/*.json'):
    raw = open(f, encoding='utf-8').read()
    if 'obusOld' not in raw: continue
    d = json.loads(raw); vs = d.get('versions', [])
    had = [v for v in vs if v.get('synthGone')]
    real = [v for v in vs if not v.get('synthGone')]
    if not real: continue
    last = real[-1]
    new = None
    ls = seen.get(d['rd'])
    if last.get('src') == 'obusOld' and last.get('k') != 'removed' and ls and ls < NEXT_SOURCE:
        # היום האחרון שבו נראתה בארכיון (גם בלי שינוי) — ומה הצילום הבא שבו כבר לא הייתה
        nxt = next((x for x in dates if x > ls), None) or NEXT_SOURCE
        new = {'d': nxt, 'sd': ls, 'k': 'removed', 'src': 'obusOld', 'synthGone': 1,
               'note': 'לא מופיע ב' + ('צילום הבא של ארכיון אוטובוס פתוח' if nxt != NEXT_SOURCE else 'תיעוד מ-16.03.2017') + ' ולא באף מקור מאוחר יותר. היום המדויק אינו ידוע.'}
    if had and new and had[0].get('d') == new['d'] and len(had) == 1: continue
    if not had and not new: continue
    d['versions'] = real + ([new] if new else [])
    added += bool(new); removed += bool(had) and not new
    json.dump(d, open(f, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('בוטלו לפי הארכיון:', added, '· סימונים שהוסרו:', removed, '· צילום אחרון שנקלט:', last_imported)
