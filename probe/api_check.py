import urllib.request, time
API='https://open-bus-stride-api.hasadna.org.il'
for path in ['/', '/docs', '/openapi.json', '/gtfs_agencies/list?limit=1', '/siri_rides/list?limit=1',
             '/siri_vehicle_locations/list?limit=1',
             '/siri_vehicle_locations/list?limit=1&recorded_at_time_from=2026-10-27T08:00:00%2B03:00&recorded_at_time_to=2026-10-27T08:05:00%2B03:00']:
    t=time.time()
    try:
        with urllib.request.urlopen(urllib.request.Request(API+path, headers={'User-Agent':'kav-bochan probe'}), timeout=120) as r:
            b=r.read(); print(r.status, round(time.time()-t,1), path, b[:300])
    except Exception as e:
        print('ERR', round(time.time()-t,1), path, e)
try:
    import json; spec=json.load(urllib.request.urlopen(API+'/openapi.json', timeout=120))
    ps=spec['paths']['/siri_vehicle_locations/list']['get']['parameters']; print('PARAMS', [p['name'] for p in ps])
except Exception as e: print('spec', e)
