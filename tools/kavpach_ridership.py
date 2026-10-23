# -*- coding: utf-8 -*-
"""נוסעים לפי רבעון לכל קו — לקו פח ולקו המוזהב (שלמה 23.10).

ממאגר "נסועה בקווי אוטובוס" של משרד התחבורה (data.gov.il, דרך ה-API): לכל קו (מק"ט) ולכל רבעון —
נוסעים בשבוע (סכום הכיוונים והחלופות), ומהרבעון האחרון — המלצת המשרד ודירוג ההוספה.
כותב kavpach-ridership.json: {"gen", "q": [רבעונים], "m": {מק"ט: {"w": [נוסעים לכל רבעון או null], "rec", "add"}}}.
כשל או קובץ שנראה חסר — הקובץ הקיים נשאר.
"""
import collections, json, os, sys, time, urllib.parse, urllib.request

PKG = 'ridership'
API = 'https://data.gov.il/api/3/action/'
OUT = 'kavpach-ridership.json'
# סדר ההמלצות מהחמורה לקלה — כשבכיוונים שונים יש המלצות שונות, נשמרת החמורה
REC = ['בעדיפות גבוהה מאד', 'בעדיפות גבוהה', 'בעדיפות בינונית', 'בעדיפות נמוכה', 'בעדיפות נמוכה מאד']


def get(action, **q):
    u = API + action + '?' + urllib.parse.urlencode(q)
    for i in range(4):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'kav-bochan'}), timeout=120))['result']
        except Exception as e:
            if i == 3:
                raise
            print('ניסיון חוזר:', e, flush=True)
            time.sleep(20 * (i + 1))


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def rank(rec):
    for i, k in enumerate(REC):
        if rec and rec.endswith(k):
            return i
    return 99


def main():
    rows = []
    try:
        for res in get('package_show', id=PKG)['resources']:
            if not res.get('datastore_active'):
                continue
            off = 0
            while True:
                # בלי fields: בשנים הישנות אין עמודות המלצה/דירוג, והבקשה נכשלת
                r = get('datastore_search', resource_id=res['id'], limit=5000, offset=off)
                rows += [{k: x.get(k) for k in ('RouteID', 'year', 'Q', 'WeeklyPassengers', 'המלצה', 'דרוג הוספה')} for x in r['records']]
                off += 5000
                if off >= r['total']:
                    break
                time.sleep(1)
            time.sleep(1)
    except Exception as e:
        print('נסועה: הקריאה נכשלה — הקובץ הקיים נשאר:', e)
        return 0
    if len(rows) < 20000 and os.path.exists(OUT):
        print('נסועה: רק', len(rows), 'שורות — נראה חסר, הקובץ הקיים נשאר')
        return 0
    week = collections.defaultdict(lambda: collections.defaultdict(float))
    seen = collections.defaultdict(set)
    rec, add = {}, {}
    for x in rows:
        mk = str(x.get('RouteID') or '').split('.')[0].lstrip('0')
        y, q = num(x.get('year')), num(str(x.get('Q') or '').replace('Q', ''))
        if not mk or not y or not q:
            continue
        key = (int(y), int(q))
        w = num(x.get('WeeklyPassengers'))
        if w is not None:
            week[mk][key] += w; seen[mk].add(key)
        r = (x.get('המלצה') or '').strip()
        if r and rank(r) < rank(rec.get(mk)):
            rec[mk] = r
        a = num(x.get('דרוג הוספה'))
        if a:
            add[mk] = max(add.get(mk, 0), int(a))
    qs = sorted({k for s in seen.values() for k in s})
    out = {'gen': time.strftime('%Y-%m-%d'), 'q': [f'{y}-Q{q}' for y, q in qs], 'm': {}}
    for mk in sorted(week, key=lambda s: int(s) if s.isdigit() else 0):
        e = {'w': [round(week[mk][k]) if k in seen[mk] else None for k in qs]}
        if mk in rec: e['rec'] = rec[mk]
        if add.get(mk): e['add'] = add[mk]
        out['m'][mk] = e
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print('נסועה:', len(rows), 'שורות ·', len(out['m']), 'קווים · רבעונים:', out['q'], '· עם המלצה:', len(rec), '· לתגבור:', len(add))
    return 0


if __name__ == '__main__':
    sys.exit(main())
