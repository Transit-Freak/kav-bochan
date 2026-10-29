# בדיקה חד-פעמית: כמה אוטובוסים במאגר מעל 3.5 טון, לפי סוג דלק
import json, urllib.request, urllib.parse, collections
API = 'https://data.gov.il/api/3/action/'
RID = 'cd3acc5c-03c3-4c89-9c54-d40f93c0d790'
def get(a, **p):
    u = API + a + '?' + urllib.parse.urlencode(p)
    req = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'})
    return json.load(urllib.request.urlopen(req, timeout=180))['result']
print('סה"כ רכבים במאגר:', get('datastore_search', resource_id=RID, limit=0)['total'])
# כל שורות האוטובוסים (קבוצת סוג רכב)
kinds = collections.Counter()
off = 0
while True:
    r = get('datastore_search', resource_id=RID, fields='kvutzat_sug_rechev', limit=32000, offset=off)
    for x in r['records']:
        kinds[x['kvutzat_sug_rechev']] += 1
    off += len(r['records'])
    if not r['records'] or off >= r['total']:
        break
print('קבוצות סוג רכב:', kinds.most_common())
bus = [k for k in kinds if k and 'אוטובוס' in k]
fuel, year, maker = collections.Counter(), collections.Counter(), collections.Counter()
for k in bus:
    off = 0
    while True:
        r = get('datastore_search', resource_id=RID, filters=json.dumps({'kvutzat_sug_rechev': k}, ensure_ascii=False),
                fields='sug_delek_nm,shnat_yitzur,tozeret_nm', limit=32000, offset=off)
        for x in r['records']:
            fuel[(k, x['sug_delek_nm'])] += 1
            if x['sug_delek_nm'] in ('חשמל', 'לא ידוע קוד H'):
                year[x['shnat_yitzur']] += 1
                maker[x['tozeret_nm']] += 1
        off += len(r['records'])
        if not r['records'] or off >= r['total']:
            break
print('\nאוטובוסים לפי דלק:')
for (k, f), n in sorted(fuel.items(), key=lambda t: -t[1]):
    print(f'  {k} | {f}: {n}')
print('שנות ייצור (חשמל/מימן):', sorted(year.items()))
print('יצרנים (חשמל/מימן):', maker.most_common(20))
