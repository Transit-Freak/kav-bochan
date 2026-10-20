# זמני — הודעה אחת מהקוד, עם מפה מהקו בזמן כשאין מאתר המקור
import json, os, sys, glob, tempfile
sys.path.insert(0, 'tools')
IDS = sys.argv[1:]
os.environ['OUT'] = tempfile.mkdtemp(); os.environ['TEMP_DIR'] = tempfile.mkdtemp()
import alerts_fetch as F, alerts_route as AR
og = F.get_json
def gj(url, **k):
    d = og(url, **k)
    if d and 'all_alerts' in url:
        d['alerts'] = [a for a in d['alerts'] if str(a['id']) in IDS]
    return d
F.get_json = gj
NETS = []
_S = AR.Streets
class Cap(_S):
    def __init__(self, ways):
        super().__init__(ways); NETS.append(self)
AR.Streets = Cap
oe = F.estimate_routes
def est(alert, routes, stops):
    res = oe(alert, routes, stops)
    net = NETS[-1] if NETS else None
    for r in routes:
        sh = [tuple(x) for x in r['shape']]
        print('  E', r['rd'], 'cut', r['cut'], 'why', r['why'])
        for p in AR.parse(alert['description']['he']):
            pl = AR._plan(net, p['steps']) if net else None
            print('    PLAN', p['steps'], '->', [(x[0], sorted(x[1])[:3]) for x in pl] if pl else pl)
            for st in p['steps']:
                print('      match', st, sorted(net.match(st))[:5] if net else '')
            if pl and r['cut']:
                ex = AR._exit_point(net, p, sh, r['cut'][0], r['cut'][1], pl[0][1])
                print('    EXIT', ex and (ex[0], ex[2]))
                try:
                    print('    RD', AR.route_detour(net, p, sh, r['cut'][0], r['cut'][1]))
                except Exception as e:
                    print('    RD ERR', e)
    return res
F.estimate_routes = est
F.main()
for f in glob.glob(os.environ['OUT'] + '/rc/*.json'):
    rc = json.load(open(f)); st = rc['stops']
    print('RC', rc['id'], rc['status'], rc.get('tpl'), 'xadd', [st[x][2] for x in rc.get('xadd') or []])
    for r in rc['routes']:
        e = r.get('est')
        print('  R', r['num'], r['rd'], r['to'], r['why'], 'del', [st[x][2:] for x in r['del'] if x in st], 'xadd', [st[x][2] for x in r.get('xadd', [])],
              e and (e['streets'], e['len'], e['path'][0], e['path'][-1]), 'shape', len(r['shape']))
al = json.load(open(os.environ['OUT'] + '/alerts.json'))
for a in al['alerts']:
    print('A', a['id'], a['kind'], a['map'], a['lines'])
