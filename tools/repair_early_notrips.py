#!/usr/bin/env python3
# תיקון חד-פעמי: צילום בארכיון אוטובוס פתוח שבו הקו קיים בלי אף נסיעה נרשם כ"תחנות ירדו" (כל התחנות).
# מסמנים אותו 'notrips', ואם אחריו צילום עם תחנות — משווים אותו מול הצילום האחרון שהיו בו תחנות (שלמה 26.09)
import glob, json, sys
sys.path.insert(0, 'tools')
from backfill_tf import classify
n = m = 0
for f in glob.glob('line-history/data/lines/*.json'):
    raw = open(f, encoding='utf-8').read()
    if '"earlyPatternCount": 0' not in raw and '"earlyPatternCount":0' not in raw: continue
    d = json.loads(raw); vs = d.get('versions', []); ch = False
    pool = d.get('pool', []); spool = d.get('spool', [])
    mat = lambda v: [pool[i] if isinstance(i, int) else i for i in v.get('stops', [])]
    shp = lambda v: spool[v['shp']] if isinstance(v.get('shp'), int) and v['shp'] < len(spool) else v.get('shp', '')
    last_st = None
    for v in vs:
        if v.get('earlySource') and v.get('earlyPatternCount') == 0 and not v.get('stops'):
            v['k'] = 'notrips'; v.pop('add', None); v.pop('rem', None); v.pop('rc', None); v.pop('ac', None)
            v['note'] = 'בקובץ של היום הזה הקו רשום בלי אף נסיעה. זה לא אומר שהתחנות ירדו.'
            ch = True; n += 1; after_empty = True; continue
        prev_vis = next((w for w in reversed(vs[:vs.index(v)]) if not w.get('hid')), None)
        if v.get('earlySource') and v.get('stops') and last_st is not None and prev_vis is not None and prev_vis.get('k') == 'notrips':
            k, add, rem = classify(mat(last_st), mat(v), shp(last_st), shp(v))
            v['k'] = k or 'snapshot'
            for key in ('add', 'rem', 'rc', 'ac'): v.pop(key, None)
            if add: v['add'] = add
            if rem: v['rem'] = rem
            ch = True; m += 1
        if v.get('earlySource') and v.get('stops') and last_st is None and prev_vis is not None and prev_vis.get('k') == 'notrips':
            # לפניו רק צילומים בלי נסיעות — זה התיעוד הראשון של המסלול, לא "כל התחנות נוספו"
            v['k'] = 'snapshot'
            for key in ('add', 'rem', 'rc', 'ac'): v.pop(key, None)
            ch = True; m += 1
        if v.get('stops'): last_st = v
    if ch:
        json.dump(d, open(f, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('notrips', n, 'recompared', m)
