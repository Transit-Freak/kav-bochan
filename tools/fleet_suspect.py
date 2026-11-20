# -*- coding: utf-8 -*-
"""נתונים חשודים בצי הרכבים: סתירות וערכים מוזרים במאגרים של משרד התחבורה.

משווה שלושה מקורות שכבר נמצאים ב-fleet/data (בלי גישה לרשת):
  fleet.json             — רכבים שנצפו בשידורים (ראשון/אחרון, שנה, דגם)
  fleet-official.json    — מאגר "ציי רכב אוטובוסים" (ק"מ, מושבים, גודל)
  gov-details-0..9.json  — מאגר הרישוי (מושבים, דגם, שנת ייצור, ביטול, תוקף רישיון)

כותב fleet/data/fleet-suspect.json:
  {updated, checks:[{id, title, note, count, cols:[[key,label]...], rows:[{plate, op, ...}]
                     או groups:[{title, rows}]}]}
רק רכבים שנצפו בשידורים (כדי שיהיה מפעיל וקישור לכרטיס הרכב).
"""
import datetime as dt
import json
import os
import re
import sys
from collections import Counter, defaultdict

BASE = 'fleet/data'
OUT = 'fleet-suspect.json'


def norm(p):
    return str(p or '').replace('-', '').strip().lstrip('0')


def to_int(x):
    try:
        return int(str(x).strip())
    except (TypeError, ValueError):
        return None


def day(s):
    s = str(s or '')[:10]
    try:
        return dt.date.fromisoformat(s)
    except ValueError:
        return None


def seen_index(fleet):
    """לוחית ← {op, first, last, year, model}: המפעיל של הרשומה האחרונה, ההופעה הראשונה מכל הרשומות."""
    out = {}
    for o in fleet.get('operators', []):
        for v in o.get('vehicles', []):
            p = norm(v[0])
            if not p:
                continue
            first, last = v[1], v[2]
            year = v[4] if len(v) > 4 else None
            model = v[5] if len(v) > 5 else None
            cur = out.get(p)
            if cur is None:
                out[p] = {'plate': str(v[0]), 'op': o.get('name', ''), 'first': first, 'last': last,
                          'year': year, 'model': model}
                continue
            if first and (not cur['first'] or first < cur['first']):
                cur['first'] = first
            if last and (not cur['last'] or last > cur['last']):
                cur['last'], cur['op'], cur['plate'] = last, o.get('name', ''), str(v[0])
            cur['year'] = cur['year'] or year
            cur['model'] = cur['model'] or model
    return out


def size_group(bs):
    bs = (bs or '').strip()
    if bs.startswith('מפרקי'):
        return 'מפרקי'
    return bs if bs in ('אוטובוס', 'מיניבוס', 'מידיבוס') else None


def model_name(g, s):
    m = ' '.join(x for x in (g.get('tozeret_nm'), g.get('degem_nm')) if x).strip() if g else ''
    return m or (s.get('model') or '')


def base_row(s, g, **kw):
    r = {'plate': s['plate'], 'op': s['op']}
    m = model_name(g, s)
    if m:
        r['model'] = m
    r.update(kw)
    return r


def sort_rows(rows, key=None):
    rows.sort(key=key or (lambda r: (r['op'], r['plate'])))
    return rows


# ── הבדיקות. כל אחת מקבלת את האינדקסים ומחזירה רשימת שורות ──

def chk_seats_mismatch(seen, off, gov):
    rows = []
    for p, s in seen.items():
        o, g = off.get(p), gov.get(p)
        if not o or not g:
            continue
        a, b = to_int(o[1]), to_int(g.get('mispar_mekomot'))
        if a and b and a != b:
            rows.append(base_row(s, g, seats_off=a, seats_reg=b))
    return sort_rows(rows)


SIZE_RULES = (('מיניבוס', lambda n: n > 30, 'יותר מ-30'), ('אוטובוס', lambda n: n < 20, 'פחות מ-20'),
              ('מפרקי', lambda n: n < 30, 'פחות מ-30'))


def chk_size_seats(seen, off, gov):
    rows = []
    for p, s in seen.items():
        o = off.get(p)
        if not o:
            continue
        n, sg = to_int(o[1]), size_group(o[5])
        if not n:
            continue
        for grp, bad, _ in SIZE_RULES:
            if sg == grp and bad(n):
                rows.append(base_row(s, gov.get(p), size=o[5], seats=n))
    return sort_rows(rows, lambda r: (r['size'], r['seats'], r['plate']))


def chk_model_sizes(seen, off, gov):
    """דגם (degem_nm) שמופיע במאגר הצי ביותר מגודל אחד: שורות לרכבים בגודל של המיעוט."""
    by = defaultdict(Counter)
    for p, o in off.items():
        g, sg = gov.get(p), size_group(o[5])
        if g and g.get('degem_nm') and sg:
            by[g['degem_nm'].strip()][sg] += 1
    rows = []
    for p, s in seen.items():
        o, g = off.get(p), gov.get(p)
        if not o or not g or not g.get('degem_nm'):
            continue
        sg = size_group(o[5])
        c = by.get(g['degem_nm'].strip())
        if not sg or not c or len(c) < 2:
            continue
        top, tn = c.most_common(1)[0]
        if sg != top and c[sg] < tn:
            rows.append(base_row(s, g, size=o[5], usual=top, n_usual=tn, n_this=c[sg]))
    return sort_rows(rows, lambda r: (r.get('model', ''), r['plate']))


def chk_seats_odd(seen, off, gov):
    """מספר מושבים חריג (פחות מ-8 או יותר מ-90) ברכב שרשום כאוטובוס, ומה מקובל באותו דגם."""
    by = defaultdict(Counter)
    for p, g in gov.items():
        n = to_int(g.get('mispar_mekomot'))
        if n and g.get('degem_nm'):
            by[g['degem_nm'].strip()][n] += 1
    rows = []
    for p, s in seen.items():
        g = gov.get(p)
        if not g or 'אוטובוס' not in (g.get('sug_rechev_nm') or ''):
            continue
        n = to_int(g.get('mispar_mekomot'))
        if n is None or 8 <= n <= 90:
            continue
        r = base_row(s, g, seats=n)
        c = by.get((g.get('degem_nm') or '').strip())
        if c:
            common, cn = c.most_common(1)[0]
            if common != n:
                r['usual'], r['n_usual'] = common, cn
        rows.append(r)
    return sort_rows(rows)


def chk_km_zero(seen, off, gov, today):
    """מד ק"מ 0 ברכב שנסע ב-30 הימים האחרונים. מחזיר (רכבים חדשים, רכבים ותיקים)."""
    lim = (today - dt.timedelta(days=30)).isoformat()
    new, old = [], []
    for p, s in seen.items():
        o = off.get(p)
        if not o or o[0] != 0 or not s['last'] or s['last'] < lim:
            continue
        g = gov.get(p)
        y = to_int(g.get('shnat_yitzur')) if g else None
        y = y or to_int(s.get('year'))
        r = base_row(s, g, year=y, first=s['first'], last=s['last'])
        (new if y and y >= today.year else old).append(r)
    k = lambda r: (r['op'], r['plate'])
    return sort_rows(new, k), sort_rows(old, k)


KM_YEAR, KM_MAX = 200_000, 3_000_000


def chk_km_odd(seen, off, gov, today):
    rows = []
    for p, s in seen.items():
        o = off.get(p)
        km = to_int(o[0]) if o else None
        if not km:
            continue
        g = gov.get(p)
        y = (to_int(g.get('shnat_yitzur')) if g else None) or to_int(s.get('year'))
        if not y:
            continue
        cap = (max(0, today.year - y) + 1) * KM_YEAR
        if km > cap or km > KM_MAX:
            rows.append(base_row(s, g, year=y, km=km, cap=min(cap, KM_MAX)))
    return sort_rows(rows, lambda r: (-r['km'], r['plate']))


def chk_after_bitul(seen, off, gov):
    rows = []
    for p, s in seen.items():
        g = gov.get(p)
        if not g:
            continue
        cd = str(g.get('bitul_cd') or '0').strip()
        bd = str(g.get('bitul_dt') or '')[:10]
        if cd in ('', '0') or not bd or not s['last'] or s['last'] <= bd:
            continue
        rows.append(base_row(s, g, status=g.get('bitul_nm') or cd, bitul=bd, last=s['last']))
    rows.sort(key=lambda r: (r['last'], r['plate']), reverse=True)
    return rows


def chk_expired(seen, off, gov, today):
    lim_tokef = (today - dt.timedelta(days=14)).isoformat()
    lim_seen = (today - dt.timedelta(days=10)).isoformat()
    rows = []
    for p, s in seen.items():
        g = gov.get(p)
        if not g or str(g.get('bitul_cd') or '0').strip() not in ('', '0'):
            continue
        tk = str(g.get('tokef_dt') or '')[:10]
        if not tk or tk >= lim_tokef or not s['last'] or s['last'] < lim_seen:
            continue
        rows.append(base_row(s, g, tokef=tk, last=s['last']))
    return sort_rows(rows, lambda r: (r['tokef'], r['plate']))


def chk_before_year(seen, off, gov):
    rows = []
    for p, s in seen.items():
        g = gov.get(p)
        y = to_int(g.get('shnat_yitzur')) if g else None
        if not y or not s['first'] or int(s['first'][:4]) >= y:
            continue
        rows.append(base_row(s, g, year=y, first=s['first']))
    return sort_rows(rows, lambda r: (r['first'], r['plate']))


def build(fleet, official, gov, today=None):
    if today is None:
        today = day(fleet.get('updated')) or dt.date.today()
    seen = seen_index(fleet)
    off = {norm(k): v for k, v in (official.get('of') or {}).items()}
    gov = {norm(k): v for k, v in gov.items()}
    a = (seen, off, gov)
    M = [['model', 'יצרן ודגם']]
    km_new, km_old = chk_km_zero(*a, today)
    checks = [
        {'id': 'seats', 'title': 'מספר מושבים שונה בשני המאגרים',
         'note': 'כנראה אחד המאגרים לא עודכן אחרי החלפת ריפוד או הסבה, או טעות הקלדה.',
         'cols': M + [['seats_off', 'ציי רכב'], ['seats_reg', 'רישוי']], 'rows': chk_seats_mismatch(*a)},
        {'id': 'size', 'title': 'גודל הרכב לא מתאים למספר המושבים',
         'note': 'מיניבוס עם יותר מ-30 מושבים, אוטובוס עם פחות מ-20 או מפרקי עם פחות מ-30. כנראה טעות בשדה הגודל במאגר ציי רכב.',
         'cols': M + [['size', 'גודל במאגר'], ['seats', 'מושבים']], 'rows': chk_size_seats(*a)},
        {'id': 'model-size', 'title': 'אותו דגם רשום בכמה גדלים',
         'note': 'רוב הרכבים מהדגם רשומים בגודל אחד, והרכבים האלה בגודל אחר. כנראה טעות ברישום, אבל לפעמים יש באמת גרסה אחרת של הדגם.',
         'cols': M + [['size', 'גודל ברכב הזה'], ['usual', 'הגודל ברוב הדגם']], 'rows': chk_model_sizes(*a)},
        {'id': 'seats-odd', 'title': 'מספר מושבים חריג',
         'note': 'פחות מ-8 או יותר מ-90 מושבים ברכב שרשום כאוטובוס. כנראה טעות הקלדה במאגר הרישוי.',
         'cols': M + [['seats', 'מושבים'], ['usual', 'מקובל בדגם']], 'rows': chk_seats_odd(*a)},
        {'id': 'km0', 'title': 'מד ק"מ 0 ברכב שנוסע',
         'note': 'כמעט כולם אוטובוסים חדשים: כנראה מד הק"מ במאגר ציי רכב לא מתעדכן ברכבים חדשים אחרי שהם נכנסים למאגר. ברכבים ותיקים זה כנראה ערך חסר.',
         'cols': M + [['year', 'שנת ייצור'], ['first', 'נצפה לראשונה'], ['last', 'נצפה לאחרונה']],
         'groups': [{'title': f'רכבים ותיקים (לפני {today.year})', 'rows': km_old},
                    {'title': f'רכבים חדשים ({today.year})', 'rows': km_new}]},
        {'id': 'km-odd', 'title': 'מד ק"מ לא סביר',
         'note': f'יותר מ-{KM_YEAR:,} ק"מ לכל שנה מאז הייצור, או יותר מ-{KM_MAX:,} ק"מ בכלל. כנראה ספרה מיותרת או טעות הקלדה.',
         'cols': M + [['year', 'שנת ייצור'], ['km', 'מד ק"מ'], ['cap', 'סביר עד']], 'rows': chk_km_odd(*a, today)},
        {'id': 'after-bitul', 'title': 'נוסע אחרי ביטול ברישוי',
         'note': 'לפי מאגר הרישוי הרכב בוטל או הורד מהכביש, ובשידורים הוא נצפה נוסע אחרי התאריך. כנראה איחור או טעות במאגר, או מספר רכב שגוי בשידור.',
         'cols': M + [['status', 'סטטוס ברישוי'], ['bitul', 'מתאריך'], ['last', 'נצפה לאחרונה']], 'rows': chk_after_bitul(*a)},
        {'id': 'expired', 'title': 'נוסע עם רישיון שפג',
         'note': 'תוקף הרישיון במאגר עבר לפני יותר משבועיים, והרכב נצפה נוסע בעשרת הימים האחרונים. כנראה הרישיון חודש והמאגר עוד לא עודכן.',
         'cols': M + [['tokef', 'רישיון עד'], ['last', 'נצפה לאחרונה']], 'rows': chk_expired(*a, today)},
        {'id': 'before-year', 'title': 'נצפה בכביש לפני שנת הייצור',
         'note': 'השידורים הראשונים של הרכב קודמים לשנת הייצור במאגר הרישוי. כנראה שנת הייצור רשומה לפי שנת הדגם, או שמספר הרכב שימש קודם רכב אחר.',
         'cols': M + [['year', 'שנת ייצור'], ['first', 'נצפה לראשונה']], 'rows': chk_before_year(*a)},
    ]
    for c in checks:
        c['count'] = len(c['rows']) if 'rows' in c else sum(len(g['rows']) for g in c['groups'])
    return {'updated': today.isoformat(), 'gov_updated': official.get('gov_updated') or fleet.get('gov_updated'),
            'checks': checks}


def load_gov(base):
    gov = {}
    for d in range(10):
        p = os.path.join(base, f'gov-details-{d}.json')
        if os.path.exists(p):
            gov.update(json.load(open(p, encoding='utf-8')))
    return gov


def main(base=BASE):
    try:
        fleet = json.load(open(os.path.join(base, 'fleet.json'), encoding='utf-8'))
        official = json.load(open(os.path.join(base, 'fleet-official.json'), encoding='utf-8'))
    except (OSError, ValueError) as e:
        print('נתונים חשודים: חסר קובץ —', e)
        return 0
    gov = load_gov(base)
    if not gov or not official.get('of'):
        print('נתונים חשודים: אין נתוני רישוי או ציי רכב — הקובץ הקיים נשאר')
        return 0
    out = build(fleet, official, gov)
    with open(os.path.join(base, OUT), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print('נתונים חשודים:', ', '.join(f"{c['id']}={c['count']}" for c in out['checks']))
    return 0


if __name__ == '__main__':
    sys.exit(main(*sys.argv[1:]))
