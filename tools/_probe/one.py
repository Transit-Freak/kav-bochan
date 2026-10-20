# זמני — הקלט של הודעה אחת כמו בריצה האמיתית (מפת השינויים + הרחובות מקובץ המפה), לבדיקה מקומית
import gzip, json, os, sys, urllib.parse
sys.path.insert(0, 'tools')
import alerts_fetch as F
os.makedirs('dump3', exist_ok=True)
data = F.get_json(f'{F.SRC}/api/all_alerts')
json.dump(data, gzip.open('dump3/all.json.gz', 'wt'), ensure_ascii=False)
F.stop_names()
for aid in os.environ['IDS'].split(','):
    rc = F.get_json(f'{F.SRC}/api/get_route_changes?id={urllib.parse.quote(aid)}')
    pts = [[p[1], p[0]] for per in rc['route_changes'].values() for chs in per.values() for c in chs for p in (c.get('shape') or [])]
    a = next(x for x in data['alerts'] if str(x['id']) == aid)
    rm = [F.STOP_POS[s] for s in (a.get('removed_stop_ids') or []) if s in F.STOP_POS] or pts
    cy = sum(p[0] for p in rm) / len(rm); cx = sum(p[1] for p in rm) / len(rm)
    bbox = (cy - 0.018, cx - 0.022, cy + 0.018, cx + 0.022)
    ways = F.overpass(bbox)
    print(aid, len(ways or []), 'ways')
    rec = {'rc': rc, 'ways': [[tg.get('name', ''), tg.get('ref', ''), tg.get('highway', ''), tg.get('oneway', ''), tg.get('junction', ''),
                               [[round(p[0], 6), round(p[1], 6)] for p in g]] for tg, g in ways or []]}
    json.dump(rec, gzip.open(f'dump3/{aid}.json.gz', 'wt'), ensure_ascii=False, separators=(',', ':'))
