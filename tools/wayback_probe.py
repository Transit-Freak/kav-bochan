"""זמני: בדיקת מבנה הכתובות בארכיון (כמה בקשות CDX קטנות), כדי לדעת איך לחפש את עמודי הקווים 301/311."""
import time, urllib.request, urllib.parse
UA = 'kav-bochan-research/1.0'
qs = [
  {'url': 'moovitapp.com/index/en/public_transit-line-301', 'matchType': 'prefix', 'limit': '15', 'collapse': 'urlkey'},
  {'url': 'moovitapp.com/index/he/', 'matchType': 'prefix', 'limit': '8', 'collapse': 'urlkey', 'filter': 'original:.*line-301.*'},
  {'url': 'egged.co.il', 'matchType': 'domain', 'limit': '15', 'collapse': 'urlkey', 'from': '2018', 'to': '2021', 'filter': 'original:.*(301|311).*'},
  {'url': 'bus.co.il', 'matchType': 'domain', 'limit': '15', 'collapse': 'urlkey', 'filter': 'original:.*(301|311).*'},
  {'url': 'mot.gov.il', 'matchType': 'domain', 'limit': '15', 'collapse': 'urlkey', 'from': '2018', 'to': '2021', 'filter': 'original:.*(ashkelon|Ashkelon|301|311).*'},
]
for q in qs:
    time.sleep(8)
    u = 'https://web.archive.org/cdx/search/cdx?' + urllib.parse.urlencode(q)
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': UA}), timeout=90) as r:
            b = r.read().decode('utf-8', 'replace')
    except Exception as e:  # noqa: BLE001
        b = 'ERR ' + str(e)
    print('===', q, '\n' + '\n'.join(urllib.parse.unquote(l)[:230] for l in b.splitlines()[:15]), flush=True)
