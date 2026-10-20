# זמני — אבחון של הודעה אחת בריצה כמו באמת (הרחובות מקובץ המפה), עם הדפסה של כל שלב בניתוב
import json, os, sys, tempfile
sys.path.insert(0, 'tools')
IDS = os.environ['IDS'].split(',')
os.environ['OUT'] = tempfile.mkdtemp(); os.environ['TEMP_DIR'] = tempfile.mkdtemp()
import alerts_fetch as F, alerts_route as AR
orig_get = F.get_json
def get_json(url, **k):
    d = orig_get(url, **k)
    if d and 'all_alerts' in url:
        d['alerts'] = [a for a in d['alerts'] if str(a['id']) in IDS]
    return d
F.get_json = get_json
orig_est = F.estimate_routes
def est(alert, routes, stops):
    res = orig_est(alert, routes, stops)
    paras = AR.parse(alert['description']['he'])
    for p in paras:
        print('PARA', sorted(p['lines']), p['start'], p['steps'], p.get('dir'))
    for r in routes:
        print('ROUTE', r['num'], r['to'], 'cut', r['cut'], 'len', len(r['shape']), r['why'], r['est'] and r['est']['streets'])
    return res
F.estimate_routes = est
orig_route = AR.route_detour
def rd(net, para, shape, c0, c1, **k):
    plan = AR._plan(net, para['steps'])
    print('  try', para['start'], para['steps'], 'plan', plan and [(a, sorted(b)) for a, b in plan])
    if plan:
        ex = AR._exit_point(net, para, shape, c0, c1, plan[0][1])
        print('  exit', ex and (ex[0], len(ex[1]), ex[2]))
        if para.get('start'):
            a, b = para['start']; print('  start match', sorted(net.match(a)), sorted(net.match(b)))
    r = orig_route(net, para, shape, c0, c1, **k)
    print('  ->', r and (r['streets'], r['len']))
    return r
AR.route_detour = rd
F.main()
