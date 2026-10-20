# זמני — מה אתר המקור מחזיר להודעה בלי תחנות
import json, sys
sys.path.insert(0, 'tools')
import alerts_fetch as F
for aid in sys.argv[1:]:
    rc = F.get_json(f'{F.SRC}/api/get_route_changes?id={aid}')
    print('RC', aid, 'keys', list((rc or {}).keys()))
    for ag, per in ((rc or {}).get('route_changes') or {}).items():
        for pk, chs in per.items():
            for c in chs:
                print('  CH', ag, pk, {k: (v if not isinstance(v, list) else len(v)) for k, v in c.items() if k != 'shape'}, 'shape', len(c.get('shape') or []))
    print('  SFM', len((rc or {}).get('stops_for_map') or {}))
    al = F.get_json(f'{F.SRC}/api/all_alerts')
    for a in (al or {}).get('alerts', []):
        if str(a['id']) == aid:
            print('  ALERT', {k: v for k, v in a.items() if k not in ('description', 'header')})
