"""זמני: האם ארכיון ה-GTFS של Open Train (gtfs.otrain.org/static/archive) נשמר בארכיון האינטרנט — CDX בלבד, 3 בקשות."""
import time, urllib.request, urllib.parse
UA = 'kav-bochan-research/1.0'
qs = [
  {'url': 'gtfs.otrain.org/static/archive/', 'matchType': 'prefix', 'limit': '2000', 'collapse': 'urlkey'},
  {'url': 'otrain.org', 'matchType': 'domain', 'limit': '300', 'collapse': 'urlkey', 'filter': 'original:.*(gtfs|zip|archive).*'},
  {'url': '192.241.154.128/gtfs-data/', 'matchType': 'prefix', 'limit': '300', 'collapse': 'urlkey'},
]
for q in qs:
    time.sleep(8)
    u = 'https://web.archive.org/cdx/search/cdx?' + urllib.parse.urlencode(q)
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': UA}), timeout=120) as r:
            b = r.read().decode('utf-8', 'replace')
    except Exception as e:  # noqa: BLE001
        b = 'ERR ' + str(e)
    lines = b.splitlines()
    print('===', q['url'], len(lines), flush=True)
    for l in lines[:2000]:
        print(l[:220])
