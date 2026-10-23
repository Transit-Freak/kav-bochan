# -*- coding: utf-8 -*-
"""ביטול סופי של אוטובוסים — ממאגר "כלי רכב שירדו מהכביש ובסטטוס ביטול סופי" (שלמה 23.10).

בנוסף ל"ירד מהשירות" שלנו (לפי השידורים), לא במקומו: השידורים מראים מתי הרכב הפסיק לנסוע,
והמאגר — מתי הרישום בוטל סופית (בדרך כלל כ-3 חודשים אחרי). רק ביטול סופי (פירוק, אובדן גמור...).

קורא את כל לוחיות צי הרכבים מ-fleet/data/fleet.json ושואל את ה-API במנות (POST עם filters),
לאט, כדי לא להיחסם. כותב fleet/data/fleet-bitul-sofi.json {לוחית: תאריך ביטול}.
כשל בקריאה — הקובץ הקיים נשאר כמו שהוא.
"""
import json, os, sys, time, urllib.request

RID = '851ecab1-0622-4dbe-a6c7-f950cf82abf9'
API = 'https://data.gov.il/api/3/action/datastore_search'
OUT = 'fleet/data/fleet-bitul-sofi.json'
CHUNK = 1000


def post(body):
    req = urllib.request.Request(API, data=json.dumps(body).encode(),
                                 headers={'User-Agent': 'kav-bochan', 'Content-Type': 'application/json'})
    for i in range(4):
        try:
            return json.load(urllib.request.urlopen(req, timeout=120))['result']
        except Exception as e:
            if i == 3:
                raise
            print('ניסיון חוזר:', e, flush=True)
            time.sleep(20 * (i + 1))


def main():
    d = json.load(open('fleet/data/fleet.json', encoding='utf-8'))
    plates = sorted({str(v[0]).replace('-', '').lstrip('0') for o in d['operators'] for v in o['vehicles']} - {''})
    plates = [p for p in plates if p.isdigit()]
    out = {}
    try:
        for i in range(0, len(plates), CHUNK):
            r = post({'resource_id': RID, 'filters': {'mispar_rechev': [int(p) for p in plates[i:i + CHUNK]]},
                      'fields': ['mispar_rechev', 'bitul_dt'], 'limit': 5000})
            for rec in r['records']:
                if rec.get('bitul_dt'):
                    out[str(rec['mispar_rechev']).lstrip('0')] = str(rec['bitul_dt'])[:10]
            time.sleep(2)
    except Exception as e:
        print('ביטול סופי: הקריאה נכשלה — הקובץ הקיים נשאר:', e)
        return 0
    if len(out) < 100 and os.path.exists(OUT):
        print('ביטול סופי: רק', len(out), 'רכבים — נראה חסר, הקובץ הקיים נשאר')
        return 0
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(dict(sorted(out.items())), f, ensure_ascii=False, separators=(',', ':'))
    print('ביטול סופי:', len(out), 'מתוך', len(plates), 'רכבים')
    return 0


if __name__ == '__main__':
    sys.exit(main())
