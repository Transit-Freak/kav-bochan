#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""צי הרכבים — הרכבים של כל עיר (שלמה 16.09: "נכנסים לפי עיר ורואים את כל
הרכבים שפעלו בה, המספרים שלהם, כמה הם פועלים וכמה נסיעות בממוצע — וסינון
לפי חודש").

לכל רכב: באילו ערים פעל (לפי הקווים ששידר, כמו בשיוך הערים) ובאילו
חודשים שידר (מסיכת החודשים של הסריקה). הפלט קטן ככל האפשר, כי הדף טוען
אותו בשלמותו:

  fleet/data/fleet-city-veh.json
  { "updated": "YYYY-MM-DD",
    "cities": ["ירושלים", ...],                    ← שמות, לפי אינדקס
    "v": { "מפעיל:לוחית": ["מסיכת-חודשים בהקסה", [אינדקסי ערים...], [מסיכה לכל עיר...]] } }
    "cov": [מדדי החודשים שבהם נרשם לכל קו מתי שירת אותו],
    המסיכה לכל עיר (שלמה 06.11) — באילו מחודשי cov הרכב פעל באותה עיר (ביט k = cov[k]);
    '' = בכל חודשי cov שבהם פעל. בחודשים שמחוץ ל-cov — המסיכה הכללית.

מסיכת החודשים כמו בסריקה (ביט 0 = ינואר 2020), בהקסה — כי המספר גדול
מדי ל-JavaScript. שאר הפרטים (חברה, דגם, ימי פעילות, נסיעות) כבר בדף.
"""
import datetime
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

OUTDIR = os.environ.get('OUTDIR', 'fleet/data')
STATE = f'{OUTDIR}/fleet-state.json'
FLEET = f'{OUTDIR}/fleet.json'
OUT = f'{OUTDIR}/fleet-city-veh.json'
RC_CACHE = os.environ.get('RC_CACHE')


def load_route_cities():
    if RC_CACHE and os.path.exists(RC_CACHE):
        with open(RC_CACHE, encoding='utf-8') as f:
            return {k: set(v) for k, v in json.load(f).items()}
    from fleet_cities import route_cities
    return route_cities()


def build(fleet, state, rc, cov0=0):
    from fleet_cities import city_masks
    cov_list = [i for i in range(cov0.bit_length()) if cov0 >> i & 1]

    def pack(m):
        """מסיכה על החודשים המכוסים בלבד (ביט k = החודש ה-k ברשימת cov) — קצרה בהרבה"""
        return sum(1 << k for k, i in enumerate(cov_list) if m >> i & 1)
    idx = {}
    names = []
    out = {}
    for op in fleet['operators']:
        for v in op['vehicles']:
            key = f"{op['ref']}:{v[0]}"
            st = state.get(key)
            if not st or len(st) < 5 or not st[4]:
                continue
            cities = set()
            for ln in st[4]:
                cities |= rc.get(str(ln), set())
            if not cities:
                continue
            mask = st[5] if len(st) > 5 else 0
            cm = city_masks(st, rc, cov0)
            ids, cms = [], []
            full = pack(mask & cov0)
            for c in sorted(cities):
                if c not in idx:
                    idx[c] = len(names)
                    names.append(c)
                ids.append(idx[c])
                p = pack(cm.get(c, 0) & cov0)
                cms.append('' if p == full else format(p, 'x'))
            out[key] = [format(mask, 'x') if mask else '', ids] + ([cms] if any(cms) else [])
    return {'updated': datetime.date.today().isoformat(), 'cities': names, 'cov': cov_list, 'v': out}


def main():
    with open(STATE, encoding='utf-8') as f:
        root = json.load(f)
    state = root['vehicles']
    from fleet_cities import lm_covered
    with open(FLEET, encoding='utf-8') as f:
        fleet = json.load(f)
    rc = load_route_cities()
    out = build(fleet, state, rc, lm_covered(root))
    tmp = f'{OUT}.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, OUT)
    print(f'רכבי ערים: {len(out["v"])} רכבים · {len(out["cities"])} ערים · '
          f'{os.path.getsize(OUT) // 1024} KB', flush=True)


if __name__ == '__main__':
    sys.exit(main())
