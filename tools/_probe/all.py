# זמני — כל ההודעות עם הקוד החדש: לכל קו המסלול, ותחנות חלופיות שרחוקות מהקו המצויר
import json, os, sys, glob, tempfile
sys.path.insert(0, 'tools')
os.environ['OUT'] = tempfile.mkdtemp(); os.environ['TEMP_DIR'] = tempfile.mkdtemp()
import alerts_fetch as F, alerts_route as AR
F.main()
for f in sorted(glob.glob(os.environ['OUT'] + '/rc/*.json')):
    rc = json.load(open(f)); st = rc['stops']
    for r in rc['routes']:
        e = r.get('est')
        line = [rc['id'], r.get('rd'), r.get('to'), r.get('why'), e and e['len'], e and e['path'][0], e and e['path'][-1]]
        pts = AR._densify([tuple(p) for p in r['shape']], 10.0) + (AR._densify([tuple(p) for p in e['path']], 10.0) if e else [])
        far = []
        alts = [s for s, add in r['seq'] if add] + list(r.get('xadd', rc.get('xadd') or []))
        for s in alts:
            if s in st and s not in r['del']:
                d = min(AR.meters(tuple(st[s][:2]), p) for p in pts)
                if d > 80:
                    far.append([st[s][2], st[s][3], round(d)])
        print('ROW ' + json.dumps(line + [far], ensure_ascii=False))
