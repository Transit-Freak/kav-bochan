#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""הקו בזמן — "קו ממשיך — השערה" (שלמה 28.10): איזה קו החליף קו שבוטל, לפי התחנות.

משרד התחבורה לא רושם שקו 28 באשקלון הוא קו 19 לשעבר (גם המק"ט התחלף), אבל התחנות מעידות:
קו 19 בוטל ב-21.06.2024, וקו 28 נפתח ב-15.06.2024 עם אותן 20 תחנות באותו סדר. זו השערה, לא
מידע רשמי, ולכן היא מוצגת כך ועם המספרים שעליהם היא נשענת.

לכל וריאנט שבוטל (ולא חזר) — הקווים שנפתחו בין 60 יום לפני הביטול ל-21 יום אחריו, ממק"ט אחר:
  הוחלף  — קו אחד מכסה 90%+ מהתחנות, ו-90%+ מהתחנות שלו מהקו הישן
  השתנה  — קו אחד מכסה 60%+ מהתחנות (ו-50%+ מתחנותיו מהישן)
  פוצל   — כמה קווים (במספרים שונים), שכל אחד מהם שאב 50%+ מתחנותיו מהישן, מכסים יחד 70%+
מסלולי 2012 (archive2012…) מושווים לקווים שפעלו בתחילת הנתונים הרציפים (עד סוף 2015), ואם הקו
ההוא בוטל אחר כך — גם ההמשך שלו (שרשרת).

פלט:
  successors/index.json  — רשימת הווריאנטים שיש להם השערה (לקטגוריה בחיפוש)
  successors/<2 תווים>.json — {rd: {"k": סוג, "d": תאריך, "to": [[מספר, rd, משותפות, בישן, בחדש]],
                                    "then": {...} (2012: ההמשך של הקו של 2015)}}
                             וגם הכיוון ההפוך: {rd החדש: {"from": [[מספר, rd הישן, סוג, תאריך]]}}
"""
import bisect
import collections
import datetime
import json
import os

OUTDIR = os.environ.get('OUTDIR', 'line-history/data')


def fsafe(rd):
    return rd.replace('#', 'H').replace('/', '_')


def jload(p, dflt=None):
    try:
        return json.load(open(p, encoding='utf-8'))
    except Exception:  # noqa: BLE001
        return dflt


def stops_of(f, v):
    pool = f.get('pool') or []
    return [str((pool[x] if isinstance(x, int) else x)[0]) for x in v.get('stops') or []]


def dd(s, n):
    return (datetime.date.fromisoformat(s) + datetime.timedelta(days=n)).isoformat()


def classify(S, cands, info, same_line=None):
    """cands: [(כיסוי הישן, חלק החדש מהישן, rd)] ממוין. מחזיר (סוג, [מועמדים])."""
    if not cands:
        return None, []
    b = cands[0]
    if b[0] >= 0.9 and b[1] >= 0.9:
        return 'הוחלף', [b]
    if b[0] >= 0.6 and b[1] >= 0.5:
        return 'השתנה', [b]
    parts = [c for c in cands if c[1] >= 0.5]
    cover = set()
    for c in parts:
        cover |= S & set(info[c[2]]['firststops'])
    if len({info[c[2]]['line'] for c in parts}) >= 2 and len(cover) / len(S) >= 0.7:
        return 'פוצל', parts[:6]
    return None, []


def main():
    L = jload(f'{OUTDIR}/lines.json', {}).get('lines', [])
    info = {}
    for l in L:
        rd = l['rd']
        if rd.startswith(('archive', 'website', 'R')) or l.get('tt'):
            continue
        f = jload(f'{OUTDIR}/lines/{fsafe(rd)}.json')
        if not f:
            continue
        vs = [v for v in f.get('versions') or [] if v.get('d')]
        withst = [v for v in vs if v.get('stops')]
        if not withst:
            continue
        rem = [v['d'] for v in vs if v.get('k') == 'removed']
        back = rem and any(v['d'] > rem[-1] and v.get('k') != 'removed' for v in vs)
        info[rd] = {'line': l.get('line', ''), 'first': withst[0]['d'], 'firststops': stops_of(f, withst[0]),
                    'last': stops_of(f, withst[-1]), 'removed': rem[-1] if rem and not back else None}
    byfirst = sorted((x['first'], rd) for rd, x in info.items())
    fd = [a for a, _ in byfirst]

    def row(c, S):
        C = set(info[c[2]]['firststops'])
        return [info[c[2]]['line'], c[2], len(S & C), len(S), len(C)]
    out = {}
    for rd, x in info.items():
        if not x['removed']:
            continue
        S = set(x['last'])
        if len(S) < 4:
            continue
        i, j = bisect.bisect_left(fd, dd(x['removed'], -60)), bisect.bisect_right(fd, dd(x['removed'], 21))
        cands = []
        for _, c in byfirst[i:j]:
            if c.split('-')[0] == rd.split('-')[0]:
                continue
            C = set(info[c]['firststops'])
            n = len(S & C)
            if n >= 3:
                cands.append((n / len(S), n / len(C), c))
        cands.sort(reverse=True)
        k, to = classify(S, cands, info)
        if k:
            out[rd] = {'k': k, 'd': x['removed'], 'to': [row(c, S) for c in to]}
    # 2012 — מול הקווים שפעלו בתחילת הנתונים הרציפים
    early = [(rd, set(x['firststops'])) for rd, x in info.items() if x['first'] <= '2015-12-31']
    n12 = 0
    for l in L:
        rd = l['rd']
        if not rd.startswith('archive2012'):
            continue
        f = jload(f'{OUTDIR}/lines/{fsafe(rd)}.json')
        if not f:
            continue
        v = next((v for v in f.get('versions') or [] if v.get('stops')), None)
        S = set(stops_of(f, v)) if v else set()
        if len(S) < 4:
            continue
        cands = []
        for c, C in early:
            n = len(S & C)
            if n >= 3:
                cands.append((n / len(S), n / len(C), c))
        cands.sort(reverse=True)
        if not cands:
            continue
        b = cands[0]
        if b[0] >= 0.8 and b[1] >= 0.7:
            k, to = ('אותו קו' if info[b[2]]['line'] == l.get('line') else 'הוחלף'), [b]
        else:
            k, to = classify(S, cands, info)
            if k == 'השתנה' and info[to[0][2]]['line'] == l.get('line'):
                k = 'אותו מספר, מסלול שונה'
        if not k:
            continue
        e = {'k': k, 'd': '2015', 'to': [row(c, S) for c in to]}
        if len(to) == 1 and to[0][2] in out:
            e['then'] = out[to[0][2]]
        out[rd] = e
        n12 += 1
    # הכיוון ההפוך: בקו החדש — "כנראה מחליף את קו X"
    back = collections.defaultdict(list)
    for rd, e in out.items():
        if rd.startswith('archive'):
            continue
        for t in e['to']:
            back[t[1]].append([info[rd]['line'], rd, e['k'], e['d']])
    shards = collections.defaultdict(dict)
    for rd, e in out.items():
        shards[fsafe(rd)[:2]][rd] = e
    for rd, fr in back.items():
        shards[fsafe(rd)[:2]].setdefault(rd, {})['from'] = fr
    os.makedirs(f'{OUTDIR}/successors', exist_ok=True)
    for f in os.listdir(f'{OUTDIR}/successors'):
        os.remove(f'{OUTDIR}/successors/{f}')
    for k, m in shards.items():
        json.dump(m, open(f'{OUTDIR}/successors/{k}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    # לקטגוריה: רק מה שהשתנה — מסלול של 2012 שנמשך כאותו קו (בלי המשך אחר כך) מוצג בעמוד ולא בקטגוריה
    idx = sorted({rd for rd, e in out.items() if e['k'] != 'אותו קו' or e.get('then')} | set(back))
    json.dump(idx, open(f'{OUTDIR}/successors/index.json', 'w', encoding='utf-8'), separators=(',', ':'))
    c = collections.Counter(e['k'] for e in out.values())
    print(f'קו ממשיך — השערה: {len(out) - n12} קווים שבוטלו, {n12} מסלולי 2012 · {dict(c)} · {len(back)} קווים חדשים עם "מחליף את"')


if __name__ == '__main__':
    main()
