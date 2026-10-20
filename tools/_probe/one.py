# זמני — אבחון הודעה אחת בריצה כמו באמת, עם פרטי נקודות היציאה והחזרה
import json, os, sys, tempfile
sys.path.insert(0, 'tools')
if os.environ.get('OLD'):
    sys.path.insert(0, 'tools/_probe/old')
IDS = os.environ['IDS'].split(',')
os.environ['OUT'] = tempfile.mkdtemp(); os.environ['TEMP_DIR'] = tempfile.mkdtemp()
import alerts_fetch as F, alerts_route as AR
og = F.get_json
def gj(url, **k):
    d = og(url, **k)
    if d and 'all_alerts' in url:
        d['alerts'] = [a for a in d['alerts'] if str(a['id']) in IDS]
    return d
F.get_json = gj
oe = F.estimate_routes
def est(alert, routes, stops):
    res = oe(alert, routes, stops)
    for p in AR.parse(alert['description']['he']):
        print('PARA', sorted(p['lines']), p['start'], p['steps'], p.get('dir'))
    for r in routes:
        if r['num'] not in os.environ.get('NUMS', r['num']).split(','):
            continue
        sh = r['shape']; e = r['est']
        print(('OLD ' if os.environ.get('OLD') else 'NEW ') + 'ROUTE', alert['id'], r['num'], r['to'], 'cut', r['cut'], 'len', len(sh), r['why'], e and (e['streets'], e['len'], e['i_out'], e['i_in']))
        if e and r['cut']:
            acc = sum(AR.meters(sh[i], sh[i + 1]) for i in range(r['cut'][1], e['i_in']))
            print('  meters along route from cut end to rejoin:', round(acc), ' detour path start/end', e['path'][0], e['path'][-1])
            print('  shape at cut1', sh[r['cut'][1]], 'shape at i_in', sh[e['i_in']])
    return res
F.estimate_routes = est
F.main()
