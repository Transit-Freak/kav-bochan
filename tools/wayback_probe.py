"""זמני: אילו עותקים של קובץ ה-GTFS של משרד התחבורה שמורים בארכיון האינטרנט (CDX בלבד, 4 בקשות)."""
import time, urllib.request, urllib.parse
UA = 'kav-bochan-research/1.0'
qs = [
  {'url': 'gtfs.mot.gov.il/gtfsfiles/israel-public-transportation.zip', 'from': '2015', 'to': '2023', 'limit': '400'},
  {'url': 'ftp://gtfs.mot.gov.il/israel-public-transportation.zip', 'from': '2015', 'to': '2023', 'limit': '400'},
  {'url': 'gtfs.mot.gov.il', 'matchType': 'domain', 'from': '2015', 'to': '2023', 'limit': '200', 'collapse': 'urlkey'},
  {'url': 'transitfeeds.com/p/ministry-of-transport-and-road-safety/820', 'matchType': 'prefix', 'from': '2016', 'to': '2017', 'limit': '50', 'collapse': 'urlkey'},
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
    for l in lines[:400]:
        print(l[:200])
