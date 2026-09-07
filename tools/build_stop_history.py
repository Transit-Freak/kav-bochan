#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""היסטוריה לפי תחנה — אילו קווים שירתו כל תחנה ומתי זה השתנה.

הופך את ציר הזמן של הקווים (lines/*.json) לציר זמן של תחנות: לכל
מק"ט תחנה נבנית רשימת אירועים — קו התחיל לעצור בה, קו הפסיק, וקו
שתועד בה מהגרסה הראשונה. מעברי רציפים עולים מהצלבת out+in של אותו
קו באותו תאריך בתחנות סמוכות (הממשק מזהה לפי השם).

פלט: stopev/XX.json — מפוצל לפי שתי הספרות הראשונות של המק"ט, כדי
שעמוד תחנה יטען קובץ קטן אחד. מבנה: {code: {n: שם אחרון, ev:
[[תאריך, קו, מק"ט-וריאנט, סוג], ...]}}. סוגים: base=תועד מהגרסה
הראשונה · in=התחיל לעצור · out=הפסיק לעצור.
"""
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from compact_lines import materialize  # noqa: E402

OUTDIR = os.environ.get('OUTDIR', 'line-history/data')


def main():
    stops = {}   # code → {'n': name, 'ev': [...]}
    coord = {}   # code → (lat, lon) — לזיהוי מעבר בין רציפים של אותו מסוף
    ref = {}     # (date, rd, kind, code) → האירוע עצמו, כדי להפוך in/out למעבר
    moves = {}   # (date, rd) → {'in': [codes], 'out': [codes]}

    def emit(code, name, date, line, rd, kind):
        s = stops.setdefault(code, {'n': '', 'ev': []})
        if name:
            s['n'] = name       # השם האחרון שנראה — עדכני יותר
        e = [date, line, rd, kind]
        s['ev'].append(e)
        if kind in ('in', 'out'):
            ref[(date, rd, kind, code)] = e
            moves.setdefault((date, rd), {'in': [], 'out': []})[kind].append(code)

    n_files = 0
    for p in sorted(glob.glob(f'{OUTDIR}/lines/*.json')):
        try:
            lf = materialize(json.load(open(p, encoding='utf-8')))
        except Exception:
            continue
        vs = lf.get('versions') or []
        rd = lf.get('rd', '')
        line = lf.get('line', '') or ''
        sv = [(v.get('d', ''), v) for v in vs if v.get('stops')]
        if not sv:
            continue
        n_files += 1
        prev_codes, prev_names = None, {}
        for d, v in sv:
            names = {}
            codes = set()
            for s in v['stops']:
                if not isinstance(s, (list, tuple)) or len(s) < 2:
                    continue
                c = str(s[0])
                codes.add(c)
                names[c] = s[1]
                if len(s) >= 4 and s[2] is not None and s[3] is not None:
                    coord[c] = (s[2], s[3])
            if prev_codes is None:
                for c in codes:
                    emit(c, names.get(c), d, line, rd, 'base')
            else:
                for c in codes - prev_codes:
                    emit(c, names.get(c), d, line, rd, 'in')
                for c in prev_codes - codes:
                    emit(c, prev_names.get(c), d, line, rd, 'out')
            prev_codes, prev_names = codes, names
        # ביטול הקו — כל התחנות של הגרסה האחרונה מאבדות אותו
        last = vs[-1]
        if last.get('k') == 'removed' and prev_codes:
            for c in prev_codes:
                emit(c, prev_names.get(c), last.get('d', ''), line, rd, 'out')

    # מעבר בין רציפים: קו ש"הפסיק" לעצור בתחנה א' ו"התחיל" לעצור בתחנה ב' באותו
    # יום, כשהשתיים הן אותו מסוף (עד 300 מ' זו מזו, או אותו שם לפני ה-"/") —
    # זה לא ביטול ותוספת אלא מעבר רציף (שלמה 07.09: "עבר מרציף 2 ל-1"). שני
    # האירועים הופכים ל-mvout/mvin עם התחנה השנייה: [תאריך, קו, וריאנט, סוג,
    # מק"ט התחנה השנייה, שמה].
    def base(name):
        return (name or '').split('/')[0].strip()

    def near(a, b):
        ca, cb = coord.get(a), coord.get(b)
        if ca and cb:
            dy = (ca[0] - cb[0]) * 111_000
            dx = (ca[1] - cb[1]) * 111_000 * 0.845
            return (dx * dx + dy * dy) ** 0.5 <= 300
        return bool(base(stops[a]['n'])) and base(stops[a]['n']) == base(stops[b]['n'])

    n_moves = 0
    for (date, rd), io in moves.items():
        if not io['in'] or not io['out']:
            continue
        used = set()
        for a in io['out']:
            for b in io['in']:
                if b in used or a == b or not near(a, b):
                    continue
                used.add(b)
                eo, ei = ref[(date, rd, 'out', a)], ref[(date, rd, 'in', b)]
                eo[3] = 'mvout'; eo += [b, stops[b]['n']]
                ei[3] = 'mvin'; ei += [a, stops[a]['n']]
                n_moves += 1
                break
    print(f'מעברי רציף שזוהו: {n_moves}')

    # "עוצרים בה היום" = רק וריאנטים שיש להם לו"ז לשבוע הקרוב (פרסום הרישוי
    # ל-10 הימים, sched/XX.json; ובנוסף מי שיש לו נסיעות היום). וריאנט שהתיעוד
    # שלו אומר שהוא עוצר כאן אבל אין לו שום לו"ז אינו פעיל (שלמה 07.09: קו 203
    # בראשל"צ, שהצילום האחרון שלו מ-2022, הוצג כעוצר "היום").
    active = set()
    for p in glob.glob(f'{OUTDIR}/sched/*.json'):
        try:
            for rd, days in (json.load(open(p, encoding='utf-8')).get('lines') or {}).items():
                if any(len(v) for v in (days or {}).values()):
                    active.add(rd)
        except Exception:
            continue
    try:
        active |= set(json.load(open(f'{OUTDIR}/line-trips.json', encoding='utf-8')).keys())
    except Exception:
        pass
    # פיצול לקבצים לפי קידומת המק"ט + מיון אירועים לפי תאריך
    shards = {}
    for c, s in stops.items():
        s['ev'].sort(key=lambda e: e[0])
        if active:
            last = {}
            for e in s['ev']:
                last[e[2]] = e
            s['a'] = sorted(rd for rd, e in last.items() if e[3] not in ('out', 'mvout') and rd in active)
        shards.setdefault((c[:2] if len(c) >= 2 else '0x'), {})[c] = s
    outdir = f'{OUTDIR}/stopev'
    os.makedirs(outdir, exist_ok=True)
    old = set(os.listdir(outdir))
    for pre, data in shards.items():
        fn = f'{pre}.json'
        json.dump(data, open(f'{outdir}/{fn}', 'w', encoding='utf-8'),
                  ensure_ascii=False, separators=(',', ':'))
        old.discard(fn)
    for fn in old:      # קידומות שהתרוקנו
        os.remove(f'{outdir}/{fn}')
    n_ev = sum(len(s['ev']) for s in stops.values())
    print(f'היסטוריית תחנות: {len(stops)} תחנות · {n_ev} אירועים · '
          f'{len(shards)} קבצים (מ-{n_files} קווים)')


if __name__ == '__main__':
    main()
