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
NETS = []
_S = AR.Streets
class Cap(_S):
    def __init__(self, ways):
        super().__init__(ways); NETS.append(self)
AR.Streets = Cap


def names_along(net, pts):
    import collections as C
    grid = C.defaultdict(list)
    for n in net.pos:
        grid[(int(n[0] * 3000), int(n[1] * 3000))].append(n)
    nm = C.defaultdict(set)
    for a, lst in net.adj.items():
        for b, d, nn, hw in lst:
            nm[a] |= nn; nm[b] |= nn
    out = []
    pts = AR._densify([tuple(x) for x in pts], 10.0)
    for i in range(0, len(pts) - 1):
        q = pts[i]; mid = ((q[0] + pts[i+1][0]) / 2, (q[1] + pts[i+1][1]) / 2)
        cx, cy = int(mid[0] * 3000), int(mid[1] * 3000)
        best = None
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for n in grid.get((cx + dx, cy + dy), ()):
                    for b, d, nn, hw in net.adj.get(n, ()):
                        dd = AR.seg_dist(mid, n, b)
                        if nn and (best is None or dd < best[0]):
                            best = (dd, '/'.join(sorted(nn)))
        if best and best[0] < 20 and (not out or out[-1] != best[1]):
            out.append(best[1])
    return out


def est2(alert, routes, stops):
    res = est(alert, routes, stops)
    if os.environ.get('OLD') or str(alert['id']) not in os.environ.get('WALK', ''):
        return res
    net = NETS[-1]
    for r in routes:
        e = r['est']
        if not e:
            continue
        sh = r['shape']
        print('WALK', r['num'], r['to'], 'cut', r['cut'])
        print('   REG ', ' > '.join(names_along(net, sh[max(0, e['i_out'] - 40):e['i_in'] + 40])))
        print('   CUT ', ' > '.join(names_along(net, sh[r['cut'][0]:r['cut'][1] + 1])))
        print('   DET ', ' > '.join(names_along(net, e['path'])))
    return res
F.estimate_routes = est2
F.main()
