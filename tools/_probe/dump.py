# זמני — שומר את הקלט הגולמי של ההתראות עם מפה (התראה, מפת שינויים, רחובות OSM) לבדיקה מקומית
import gzip, json, os, sys, time, urllib.parse
sys.path.insert(0, 'tools')
import alerts_fetch as F, alerts_route as AR
os.makedirs('dump', exist_ok=True)
T0 = time.time()
data = F.get_json(f'{F.SRC}/api/all_alerts')
json.dump(data, gzip.open('dump/all.json.gz', 'wt'), ensure_ascii=False)
stops = F.stop_names()
need = set()
for a in data['alerts']:
    if a.get('is_deleted') or a.get('is_expired'):
        continue
    if not (a.get('use_case') in (5, 6, 7, 9) and not a.get('is_national') and (a.get('removed_stop_ids') or a.get('added_stop_ids'))):
        continue
    aid = str(a['id'])
    rc = F.get_json(f'{F.SRC}/api/get_route_changes?id={urllib.parse.quote(aid)}')
    time.sleep(1)
    rec = {'rc': rc}
    need.update(a.get('removed_stop_ids') or []); need.update(a.get('added_stop_ids') or [])
    paras = AR.parse((a.get('description') or {}).get('he', ''))
    if rc and rc.get('route_changes') and paras:
        pts = []
        for ag, per in rc['route_changes'].items():
            for pk, chs in per.items():
                for c in chs:
                    sh = [[p[1], p[0]] for p in (c.get('shape') or [])]
                    pts += sh
                    need.update(s for s, _ in (c.get('updated_stop_sequence') or []))
        if pts:
            la = [p[0] for p in pts]; lo = [p[1] for p in pts]
            # ריבוע של כ-4 ק"מ סביב התחנות המבוטלות (בבדיקה הקודמת 6 ק"מ היו איטיים מדי)
            rm = [F.STOP_POS[s] for s in (a.get('removed_stop_ids') or []) if s in F.STOP_POS] or pts
            cy = sum(p[0] for p in rm) / len(rm); cx = sum(p[1] for p in rm) / len(rm)
            bbox = (cy - 0.02, cx - 0.024, cy + 0.02, cx + 0.024)
            if time.time() - T0 > 55 * 60:
                print('נגמר הזמן', aid); bbox = None
            t = time.time()
            ways = F.overpass(bbox) if bbox else None
            print(aid, 'overpass', round(time.time() - t), 's', len(ways or []), flush=True)
            if ways:
                rec['ways'] = [[tg.get('name', ''), tg.get('ref', ''), tg.get('highway', ''), tg.get('oneway', ''), tg.get('junction', ''),
                                [[round(p[0], 6), round(p[1], 6)] for p in g]] for tg, g in ways]
                rec['bbox'] = bbox
            time.sleep(4)
    json.dump(rec, gzip.open(f'dump/{aid}.json.gz', 'wt'), ensure_ascii=False, separators=(',', ':'))
json.dump({s: [*F.STOP_POS.get(s, (None, None)), *stops.get(s, ('', ''))] for s in need}, open('dump/stops.json', 'w'), ensure_ascii=False)
