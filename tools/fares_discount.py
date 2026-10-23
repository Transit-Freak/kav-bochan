# -*- coding: utf-8 -*-
"""זכאות להנחה לפי כתובת — לכפתור "מגיעה לי הנחה?" במחירון (שלמה 23.10).

ממאגר "זכאות להנחה בתחבורה ציבורית" של משרד התחבורה (data.gov.il, דרך ה-API): לכל רחוב — האם
התושבים זכאים להנחה, לפי המדד החברתי-כלכלי ומדד הפריפריה של הלמ"ס.
כותב fares/data/discount.json: {"updated": תאריך, "c": {עיר: {רחוב: [[מספר בית או null, זכאי 0/1, מדד חב"כ, מדד פריפריה], ...]}}}.
כשל או קובץ שנראה חסר — הקובץ הקיים נשאר.
"""
import collections, json, os, sys, time, urllib.parse, urllib.request

RID = '8c344502-e294-436a-84e2-00a40b318d8b'
API = 'https://data.gov.il/api/3/action/'
OUT = 'fares/data/discount.json'


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
        return int(float(x))
    except (TypeError, ValueError):
        return None


def main():
    rows, off = [], 0
    try:
        while True:
            r = get('datastore_search', resource_id=RID, limit=5000, offset=off)
            rows += r['records']; off += 5000
            if off >= r['total']:
                break
            time.sleep(1)
        meta = get('resource_show', id=RID)
    except Exception as e:
        print('זכאות להנחה: הקריאה נכשלה — הקובץ הקיים נשאר:', e)
        return 0
    if len(rows) < 30000 and os.path.exists(OUT):
        print('זכאות להנחה: רק', len(rows), 'שורות — נראה חסר, הקובץ הקיים נשאר')
        return 0
    c = collections.defaultdict(lambda: collections.defaultdict(list))
    for x in rows:
        city, street = (x.get('CityName') or '').strip(), (x.get('StreetName') or '').strip()
        if not city or not street:
            continue
        c[city][street].append([num(x.get('Hnum')), 1 if num(x.get('discount_approved')) == 1 else 0,
                                num(x.get('socio_economic_score')), num(x.get('peripheral_score'))])
    out = {'updated': (meta.get('last_modified') or meta.get('created') or '')[:10],
           'c': {k: {s: sorted(v, key=lambda r: (r[0] is not None, r[0] or 0)) for s, v in sorted(st.items())} for k, st in sorted(c.items())}}
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    mixed = sum(1 for st in c.values() for v in st.values() if len({r[1] for r in v}) > 1)
    print('זכאות להנחה:', len(rows), 'שורות ·', len(c), 'ערים ·', sum(len(s) for s in c.values()), 'רחובות ·',
          'זכאים:', sum(1 for x in rows if num(x.get('discount_approved')) == 1), '· רחובות שתלויים במספר הבית:', mixed,
          '· שורות עם מספר בית:', sum(1 for x in rows if num(x.get('Hnum')) is not None))
    return 0


if __name__ == '__main__':
    sys.exit(main())
