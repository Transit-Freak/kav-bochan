#!/usr/bin/env python3
"""קבצי תקופה למדד הדיוק (שלמה 13.10: "בחירה של 30 יום לוקחת מעל דקה עד שהיא נטענת").

הדף טוען לכל תקופה את כל קבצי הימים שלה (30 קבצים של כ-4MB) ומחבר אותם בטלפון. כאן הם
מחוברים מראש, פעם אחת אחרי כל חישוב: bus/data/periods/7.json ו-30.json — באותו מבנה של קובץ
יום, כך ש-mergeDays ב-bus/app.js מקבל קובץ אחד במקום 30 ומגיע לאותה תוצאה.

הבחירה של הימים זהה לדף (windowDays): N הימים האחרונים ב-index.json, בלי ימים עם שידור חלקי.
שדות שאינם סכום פשוט:
  days / nd       — הימים שבקובץ, ומספרם (Bl.days, Bn.days וכו' נספרים לפיהם)
  s[0]            — הממוצע המשוקלל (sum/meas), כדי ש-addAgg יחזיר את אותו סכום
  routes[r][12]   — sched לכל יום, לפי days (schedByDay, לפרופיל התחנות של קו)
  worst / ex      — כבר עם תאריך בראש השורה; רק השורות שהדף יכול להציג (40 לכל סינון, 30 דוגמאות)
"""
import argparse
import collections
import json
import os

PERIODS = (7, 30)


def partial(d):
    return d.get('sched', 0) > 0 and d.get('obs', 0) < d['sched'] * 0.3


def window(idx_days, n):
    days = [d if isinstance(d, dict) else {'d': d} for d in idx_days]
    return [d['d'] for d in days[-n:] if not partial(d)]


def addl(a, b):
    """חיבור רשימות מספרים באורך משתנה (כמו addV ב-app.js)"""
    if len(a) < len(b):
        a.extend([0] * (len(b) - len(a)))
    for i, v in enumerate(b):
        a[i] += v or 0
    return a


class Agg:
    """צובר נתון בסגנון addAgg: sched/obs/meas/c ו-sum = s[0]*meas"""
    __slots__ = ('sched', 'obs', 'meas', 'c', 'sum', 'o', 'reach', 'cov', 'any_s')

    def __init__(self):
        self.sched = self.obs = self.meas = 0
        self.c, self.o, self.reach, self.cov = [], [], [], []
        self.sum = 0.0
        self.any_s = False

    def add(self, sched, obs, meas, c, s):
        self.sched += sched or 0
        self.obs += obs or 0
        self.meas += meas or 0
        addl(self.c, c or [])
        if s and s[0] is not None:
            self.sum += s[0] * (meas or 0)
            self.any_s = True

    def s(self):
        # רק s[0] משמש בתקופה (s[1], s[2] מוצגים רק ליום בודד)
        return [self.sum / self.meas if self.meas else 0, None, None] if self.any_s else None


def merge_vehicle(cur, vt):
    """vt = [plan, n1, n2, n3, mode, {סוג: נסיעות}, detail] — כמו addVehicleData"""
    if not vt:
        return cur
    if cur is None:
        cur = [vt[0], 0, 0, 0, None, None, None]
    cur[0] = vt[0]
    for i in (1, 2, 3):
        cur[i] += vt[i] or 0
    if len(vt) > 5 and vt[5]:
        cur[5] = cur[5] or {}
        for k, n in vt[5].items():
            cur[5][k] = cur[5].get(k, 0) + n
    det = vt[6] if len(vt) > 6 else None
    if det:
        x = cur[6] or {'observed': 0, 'actual': {}, 'plan': {'labels': [], 'dates': []}, 'fleetDates': []}
        x['observed'] += det.get('observed') or 0
        for k, n in (det.get('actual') or {}).items():
            x['actual'][k] = x['actual'].get(k, 0) + n
        plan = det.get('plan') or {}
        for lab in plan.get('labels') or []:
            if lab not in x['plan']['labels']:
                x['plan']['labels'].append(lab)
        if plan.get('date') and plan['date'] not in x['plan']['dates']:
            x['plan']['dates'].append(plan['date'])
        if det.get('fleetDate') and det['fleetDate'] not in x['fleetDates']:
            x['fleetDates'].append(det['fleetDate'])
        cur[6] = x
    return cur


def build(days, files, catalog):
    nd = len(days)
    tot = Agg()
    tot_extra = {'far': 0, 'extra': 0, 'o': [], 'vt': [], 'reach': [], 'cov': []}
    A, Cc, Rg, H = {}, {}, {}, {}
    R = {}
    worst, bunch_ex, bunch_missing = [], [], []
    B = {'tot': [0, 0, 0], 'agencies': {}, 'cities': {}, 'regions': {}, 'routes': {}, 'hours': {}, 'stops': {}}
    Bl = {'tot': [], 'agencies': {}, 'clusters': {}}
    L = {'tot': [], 'agencies': {}, 'clusters': {}, 'lines': {}}
    bunch_nd = blame_nd = lay_nd = 0
    for i, d in enumerate(files):
        t = d['tot']
        tot.add(t.get('sched'), t.get('obs'), t.get('meas'), t.get('c'), t.get('s'))
        tot_extra['far'] += t.get('far') or 0
        tot_extra['extra'] += t.get('extra') or 0
        addl(tot_extra['vt'], t.get('vt') or [])
        if t.get('reach'):
            addl(tot_extra['reach'], t['reach'])
            addl(tot_extra['cov'], t.get('cov') or [])
        for row in d.get('agencies') or []:
            nm, sched, obs, meas, c, s = row[:6]
            o, va, reach, cov = (list(row[6:10]) + [None] * 4)[:4]
            x = A.get(nm)
            if x is None:
                x = A[nm] = {'agg': Agg(), 'vt': []}
            x['agg'].add(sched, obs, meas, c, s)
            addl(x['agg'].o, o or [])
            addl(x['vt'], va or [])
            if reach:
                addl(x['agg'].reach, reach)
                addl(x['agg'].cov, cov or [])
        for row in d.get('cities') or []:
            nm, meas, c, s, sched, obs = (list(row) + [0, 0])[:6]
            x = Cc.setdefault(nm, Agg())
            x.add(sched, obs, meas, c, s)
        for row in d.get('regions') or []:
            nm, meas, c, s, district, o, sched, obs, nroutes = (list(row) + [None] * 9)[:9]
            x = Rg.get(nm)
            if x is None:
                x = Rg[nm] = {'agg': Agg(), 'district': district, 'nroutes': 0}
            x['agg'].add(sched, obs, meas, c, s)
            addl(x['agg'].o, o or [])
            x['nroutes'] = max(x['nroutes'], nroutes or 0)
        for h, n, on in d.get('hours') or []:
            y = H.setdefault(h, [0, 0])
            y[0] += n
            y[1] += on
        for r in d.get('routes') or []:
            rid, sched, obs, meas, c, s, o, hours, ws, vt, reach, cov = (list(r) + [None] * 12)[:12]
            x = R.get(rid)
            if x is None:
                x = R[rid] = {'agg': Agg(), 'hours': {}, 'vt': None, 'sbd': [None] * nd}
            x['agg'].add(sched, obs, meas, c, s)
            addl(x['agg'].o, o or [])
            if reach:
                addl(x['agg'].reach, reach)
                addl(x['agg'].cov, cov or [])
            x['sbd'][i] = sched or 0
            for h, n, on in hours or []:
                y = x['hours'].setdefault(h, [0, 0])
                y[0] += n
                y[1] += on
            x['vt'] = merge_vehicle(x['vt'], vt)
        for w in d.get('worst') or []:
            worst.append([d['d']] + list(w))
        bn = d.get('bunch')
        if bn:
            bunch_nd += 1
            addl(B['tot'], bn.get('tot') or [])
            for key in ('agencies', 'cities', 'regions', 'routes'):
                for nm, v in (bn.get(key) or {}).items():
                    addl(B[key].setdefault(nm, [0, 0, 0]), v)
            for h, n, b in bn.get('hours') or []:
                y = B['hours'].setdefault(h, [0, 0])
                y[0] += n
                y[1] += b
            for rid, code, name, n, b in bn.get('stops') or []:
                y = B['stops'].setdefault(rid + '|' + code, [rid, code, name, 0, 0])
                y[3] += n
                y[4] += b
            for e in bn.get('examples') or []:
                bunch_ex.append([d['d']] + list(e))
        else:
            bunch_missing.append(d['d'])
        bl = d.get('blame')
        if bl:
            blame_nd += 1
            addl(Bl['tot'], bl.get('tot') or [])
            for key in ('agencies', 'clusters'):
                for nm, v in (bl.get(key) or {}).items():
                    addl(Bl[key].setdefault(nm, []), v)
            lay = bl.get('lay')
            if lay:
                lay_nd += 1
                addl(L['tot'], lay.get('tot') or [])
                for key in ('agencies', 'clusters', 'lines'):
                    for nm, v in (lay.get(key) or {}).items():
                        addl(L[key].setdefault(nm, []), v)

    # הגרועות: הדף ממיין לפי האיחור (w[3]) ומציג 40 — גם אחרי סינון לפי חברה או אשכול
    worst.sort(key=lambda w: -w[3])
    keep, cnt = [], collections.Counter()
    for w in worst:
        c = catalog.get(str(w[1])) or []
        ag = c[3] if len(c) > 3 else ''
        cl = (c[8] if len(c) > 8 else '') or 'ללא אשכול'
        if cnt['*'] < 40 or cnt['a:' + ag] < 40 or cnt['c:' + cl] < 40:
            keep.append(w)
        cnt['*'] += 1
        cnt['a:' + ag] += 1
        cnt['c:' + cl] += 1
    bunch_ex.sort(key=lambda a: (a[6] - a[5]) - (a[4] - a[3]))

    def agg_row(a):
        return a.s()

    out = {
        'fmt': 1, 'd': 'last%d' % nd, 'period': True, 'days': days, 'nd': nd,
        'tot': {'sched': tot.sched, 'obs': tot.obs, 'meas': tot.meas, 'c': tot.c, 's': tot.s(),
                'far': tot_extra['far'], 'extra': tot_extra['extra'], 'vt': tot_extra['vt'],
                'reach': tot_extra['reach'] or None, 'cov': tot_extra['cov'] or None},
        'agencies': [[nm, x['agg'].sched, x['agg'].obs, x['agg'].meas, x['agg'].c, agg_row(x['agg']), x['agg'].o,
                      x['vt'], x['agg'].reach or None, x['agg'].cov or None] for nm, x in A.items()],
        'cities': [[nm, x.meas, x.c, x.s(), x.sched, x.obs] for nm, x in Cc.items()],
        'regions': [[nm, x['agg'].meas, x['agg'].c, x['agg'].s(), x['district'], x['agg'].o, x['agg'].sched,
                     x['agg'].obs, x['nroutes']] for nm, x in Rg.items()],
        'hours': [[h, n, on] for h, (n, on) in sorted(H.items())],
        'routes': [[rid, x['agg'].sched, x['agg'].obs, x['agg'].meas, x['agg'].c, x['agg'].s(), x['agg'].o,
                    [[h, n, on] for h, (n, on) in sorted(x['hours'].items())], [], x['vt'],
                    x['agg'].reach or None, x['agg'].cov or None, x['sbd']] for rid, x in R.items()],
        'worst': keep,
        'bunch': {'tot': B['tot'], 'agencies': B['agencies'], 'cities': B['cities'], 'regions': B['regions'],
                  'routes': B['routes'], 'hours': [[h, n, b] for h, (n, b) in sorted(B['hours'].items())],
                  'stops': list(B['stops'].values()), 'examples': bunch_ex[:100], 'nd': bunch_nd,
                  'missing': bunch_missing} if bunch_nd else None,
        'bunch_missing': bunch_missing,
        'blame': {'tot': Bl['tot'], 'agencies': Bl['agencies'], 'clusters': Bl['clusters'], 'nd': blame_nd,
                  'lay': dict(L, nd=lay_nd) if lay_nd else None} if blame_nd else None,
    }
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', default='bus/data')
    a = ap.parse_args()
    idx = json.load(open(os.path.join(a.data, 'index.json'), encoding='utf-8'))
    try:
        catalog = json.load(open(os.path.join(a.data, 'routes.json'), encoding='utf-8'))
    except FileNotFoundError:
        catalog = {}
    os.makedirs(os.path.join(a.data, 'periods'), exist_ok=True)
    manifest = {'updated': idx.get('updated'), 'periods': {}}
    for n in PERIODS:
        days = window(idx.get('days') or [], n)
        if len(days) < 2:
            continue
        files = [json.load(open(os.path.join(a.data, 'days', d + '.json'), encoding='utf-8')) for d in days]
        out = build(days, files, catalog)
        path = os.path.join(a.data, 'periods', '%d.json' % n)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
        manifest['periods'][str(n)] = days
        print('תקופה %d: %d ימים · %.1fMB' % (n, len(days), os.path.getsize(path) / 1e6))
    with open(os.path.join(a.data, 'periods', 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, separators=(',', ':'))


if __name__ == '__main__':
    main()
