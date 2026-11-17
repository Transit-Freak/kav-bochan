import json, urllib.request, time, sys
pairs = json.load(open(sys.argv[1]))
out = []
for p in pairs:
    f = p['from']; res = []
    for c in p['cands']:
        url = f"https://routing.openstreetmap.de/routed-foot/route/v1/driving/{f[3]},{f[2]};{c[3]},{c[2]}?overview=full&geometries=geojson"
        try:
            r = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'transit-stops-walk-test/0.1'}), timeout=30))
            rt = r['routes'][0]
            res.append({'code': c[0], 'name': c[1], 'air': c[4], 'walk_m': round(rt['distance']), 'walk_s': round(rt['duration']),
                        'line': [[round(y, 6), round(x, 6)] for x, y in rt['geometry']['coordinates']]})
        except Exception as e:
            res.append({'code': c[0], 'name': c[1], 'air': c[4], 'err': str(e)})
        time.sleep(1.1)
    out.append({'dir': p['dir'], 'from': f, 'cands': res})
print('WALKJSON ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')))
