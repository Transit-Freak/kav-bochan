# בדיקה חד-פעמית: מה זה קוד דלק H
import json, urllib.request, urllib.parse, collections
API = 'https://data.gov.il/api/3/action/'
def get(a, **p):
    u = API + a + '?' + urllib.parse.urlencode(p)
    req = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'})
    return json.load(urllib.request.urlopen(req, timeout=180))['result']
for rid in ('cd3acc5c-03c3-4c89-9c54-d40f93c0d790', '053cea08-09bc-40ec-8f7a-156f0677aff3', '6f6acd03-f351-4a8f-8ecf-df792f4f573a'):
    print('\n###', rid)
    try:
        r = get('datastore_search', resource_id=rid, fields='sug_delek_cd,sug_delek_nm', distinct='true', limit=200)
        for x in r['records']:
            print('  קוד:', x.get('sug_delek_cd'), '|', x.get('sug_delek_nm'))
    except Exception as e:
        try:
            r = get('datastore_search', resource_id=rid, fields='sug_delek_nm', distinct='true', limit=200)
            print('  ', [x['sug_delek_nm'] for x in r['records']])
        except Exception as e2:
            print('  שגיאה', e, e2)
    for flt in ({'sug_delek_cd': 'H'}, {'sug_delek_nm': 'לא ידוע קוד H'}):
        try:
            r = get('datastore_search', resource_id=rid, filters=json.dumps(flt, ensure_ascii=False), limit=500)
        except Exception:
            continue
        print('  רכבים עם H:', r.get('total'))
        c = collections.Counter((x.get('tozeret_nm'), x.get('degem_nm') or x.get('kinuy_mishari'), x.get('shnat_yitzur'), x.get('kvutzat_sug_rechev')) for x in r['records'])
        for k, n in c.most_common(40):
            print('    ', n, k)
        break
