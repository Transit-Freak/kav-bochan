# בדיקה חד-פעמית: כל הרכבים עם קוד דלק H, בכל מאגרי הרכב
import json, urllib.request, urllib.parse
API = 'https://data.gov.il/api/3/action/'
def get(a, **p):
    u = API + a + '?' + urllib.parse.urlencode(p)
    req = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'})
    return json.load(urllib.request.urlopen(req, timeout=180))['result']
RES = {
    'cd3acc5c-03c3-4c89-9c54-d40f93c0d790': 'מעל 3.5 טון',
    '053cea08-09bc-40ec-8f7a-156f0677aff3': 'פרטי ומסחרי',
    '6f6acd03-f351-4a8f-8ecf-df792f4f573a': 'לא פעילים בלי קוד דגם',
    'f6efe89a-fb3d-43a4-bb61-9bf12a9b9099': 'לא פעילים עם קוד דגם',
    '851ecab1-0622-4dbe-a6c7-f950cf82abf9': 'ביטול סופי',
    '4e6b9724-4c1e-43f0-909a-154d4cc4e046': 'ביטול סופי 2010-2016',
    'ec8cbc34-72e1-4b69-9c48-22821ba0bd6c': 'ביטול סופי 2000-2009',
    'bf9df4e2-d90d-4c0a-a400-19e15af8e95f': 'דו גלגלי',
    '03adc637-b6fe-402b-9937-7c3d3afc9140': 'יבוא אישי',
}
for rid, name in RES.items():
    try:
        fl = [f['id'] for f in get('datastore_search', resource_id=rid, limit=0)['fields']]
    except Exception as e:
        print(f'{name}: שגיאה {e}'); continue
    found = {}
    tries = []
    if 'sug_delek_cd' in fl:
        tries += [{'filters': json.dumps({'sug_delek_cd': ['H', 'h']})}]
    tries += [{'filters': json.dumps({'sug_delek_nm': 'לא ידוע קוד H'}, ensure_ascii=False)},
              {'q': json.dumps({'sug_delek_nm': 'לא ידוע'}, ensure_ascii=False)},
              {'q': json.dumps({'sug_delek_nm': 'מימן'}, ensure_ascii=False)}]
    for t in tries:
        try:
            r = get('datastore_search', resource_id=rid, limit=1000, **t)
        except Exception as e:
            print(f'  {name} {t}: שגיאה {e}'); continue
        for x in r['records']:
            found[x['_id']] = x
    print(f'\n### {name}: {len(found)} רכבים')
    for x in list(found.values())[:60]:
        print('   ', x.get('mispar_rechev'), x.get('tozeret_nm'), x.get('degem_nm') or x.get('kinuy_mishari'), x.get('shnat_yitzur'),
              x.get('sug_rechev_nm') or x.get('kvutzat_sug_rechev') or x.get('sug_degem'), '|', x.get('sug_delek_cd'), x.get('sug_delek_nm'))
