# בדיקה חד-פעמית: האם יש סוג דלק לאוטובוסים במאגרי הרכב של data.gov.il
import json, urllib.request, urllib.parse
API = 'https://data.gov.il/api/3/action/'
def get(a, **p):
    u = API + a + '?' + urllib.parse.urlencode(p)
    req = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'})
    return json.load(urllib.request.urlopen(req, timeout=120))['result']
PLATES = [8890101, 50266601, 25858104, 23370002, 7762969, 9031530, 23276402, 17801403, 14930502,
          57813303, 73260603, 1538458, 38748004, 16123104, 23456902, 26113703, 61488903, 62282003]
seen = {}
for q in ('כלי רכב', 'רכב', 'סוג דלק', 'דלק', 'אוטובוס', 'רכב חשמלי', 'רכב כבד', 'רכב ציבורי'):
    for pkg in get('package_search', q=q, rows=50)['results']:
        for r in pkg['resources']:
            if r.get('datastore_active') and r['id'] not in seen:
                seen[r['id']] = (pkg['title'], r.get('name'))
print('משאבים:', len(seen))
for rid, (t, n) in seen.items():
    try:
        fl = [f['id'] for f in get('datastore_search', resource_id=rid, limit=0)['fields']]
    except Exception:
        continue
    fuel = [f for f in fl if 'delek' in f.lower() or 'דלק' in f or 'fuel' in f.lower() or 'hanaa' in f.lower()]
    if not fuel:
        continue
    print(f'\n### {t} · {n} · {rid}\n  שדות דלק: {fuel}\n  כל השדות: {fl}', flush=True)
    pk = next((f for f in fl if f.lower() == 'mispar_rechev'), None)
    if not pk:
        continue
    try:
        res = get('datastore_search', resource_id=rid, filters=json.dumps({pk: PLATES}), limit=100)
        print('  נמצאו אוטובוסים:', res.get('total'))
        for x in res['records']:
            print('   ', x.get(pk), x.get('tozeret_nm'), x.get('degem_nm') or x.get('kinuy_mishari'), '|', {f: x.get(f) for f in fuel})
    except Exception as e:
        print('  שגיאה בסינון:', e)
