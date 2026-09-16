#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""צי הרכבים — "מעברים": מאיפה לאן עברו רכבים (שלמה 16.09).

השאלה שהגיעה: "כמה מפרקיות עברו לאלעד?" — כדי לענות צריך לדעת, לכל רכב,
אצל איזו חברה ובאילו ערים הוא שירת בכל תקופה. הקובץ הזה מרכז את זה
לכל לוחית:

  fleet/data/fleet-moves.json
  {
    "updated": "YYYY-MM-DD",
    "since":   הצפייה הראשונה במעקב (מאיפה בכלל אפשר לראות מעברים),
    "cov":     [[מ, עד], ...] — הימים שנסרקו עם רישום "קו → חודשים"
               (בתוכם אפשר לראות גם מעבר מעיר לעיר בתוך אותה חברה),
    "m": { לוחית: { מפעיל: [ [ערים...], {עיר: [חודש ראשון, חודש אחרון]} | null ] } }
  }

חודשים — מדד כמו במסיכת החודשים של הסריקה (0 = ינואר 2020). התאריכים
של כל תקופת-חברה (ראשון/אחרון) כבר נמצאים ב-fleet.json, והאתר מחבר.

נכללות לוחיות ששידרו אצל יותר מחברה אחת, וגם לוחיות שאצל חברה אחת
נראה שעברו עיר (תקופת עיר אחת נגמרה לפני שאחרת התחילה) — כשיש כבר
רישום חודשים לקווים. שיוך קו→ערים: routes.txt מה-GTFS של אתמול, כמו
בשיוך הערים; קווים היסטוריים שכבר לא בלוח אינם ממופים.
"""
import datetime
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

OUTDIR = os.environ.get('OUTDIR', 'fleet/data')
STATE = f'{OUTDIR}/fleet-state.json'
FLEET = f'{OUTDIR}/fleet.json'
OUT = f'{OUTDIR}/fleet-moves.json'
# מטמון מקומי של מיפוי קו→ערים (לבדיקות ולריצה בלי רשת): {route_id: [ערים]}
RC_CACHE = os.environ.get('RC_CACHE')


def load_route_cities():
    if RC_CACHE and os.path.exists(RC_CACHE):
        with open(RC_CACHE, encoding='utf-8') as f:
            return {k: set(v) for k, v in json.load(f).items()}
    from fleet_cities import route_cities
    return route_cities()


def city_months(lines_months, rc):
    """{קו: [מ, עד]} → {עיר: [מ, עד]} (מינימום/מקסימום על כל קווי העיר)."""
    out = {}
    for ln, (a, b) in lines_months.items():
        for c in rc.get(str(ln), ()):
            e = out.get(c)
            if e is None:
                out[c] = [a, b]
            else:
                if a < e[0]:
                    e[0] = a
                if b > e[1]:
                    e[1] = b
    return out


def city_shift(cm):
    """האם בתוך אותה חברה יש עיר שנגמרה לפני שעיר אחרת התחילה."""
    if len(cm) < 2:
        return False
    per = sorted(cm.values())
    for i, (a1, b1) in enumerate(per):
        for a2, b2 in per[i + 1:]:
            if b1 < a2 or b2 < a1:
                return True
    return False


def build(fleet, root, rc):
    state = root['vehicles']
    by_plate = {}
    since = None
    for op in fleet['operators']:
        for v in op['vehicles']:
            key = f"{op['ref']}:{v[0]}"
            st = state.get(key) or []
            lines = st[4] if len(st) > 4 else []
            cities = set()
            for ln in lines:
                cities |= rc.get(str(ln), set())
            lm = st[6] if len(st) > 6 and isinstance(st[6], dict) else {}
            cm = city_months(lm, rc) if lm else None
            by_plate.setdefault(v[0], {})[str(op['ref'])] = [sorted(cities), cm or None]
            if since is None or v[1] < since:
                since = v[1]
    m = {}
    for plate, ops in by_plate.items():
        if len(ops) > 1 or any(e[1] and city_shift(e[1]) for e in ops.values()):
            m[plate] = ops
    return {'updated': datetime.date.today().isoformat(),
            'since': since,
            'cov': root.get('lm_cov', []),
            'm': m}


def main():
    with open(STATE, encoding='utf-8') as f:
        root = json.load(f)
    with open(FLEET, encoding='utf-8') as f:
        fleet = json.load(f)
    rc = load_route_cities()
    out = build(fleet, root, rc)
    tmp = f'{OUT}.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, OUT)
    n_multi = sum(1 for ops in out['m'].values() if len(ops) > 1)
    print(f'מעברים: {len(out["m"])} לוחיות ({n_multi} אצל יותר מחברה אחת) · '
          f'כיסוי חודשי-קו: {out["cov"] or "עדיין אין"} · {os.path.getsize(OUT) // 1024} KB',
          flush=True)


if __name__ == '__main__':
    sys.exit(main())
