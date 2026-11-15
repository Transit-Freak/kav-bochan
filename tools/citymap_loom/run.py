# -*- coding: utf-8 -*-
# שרשרת LOOM לערים המאושרות (cities.yml):
#   make_gtfs -> gtfs2graph -> topo -> fixrestr -> loom -> octi -> transitmap -> post (+check)
# שימוש: python3 tools/citymap_loom/run.py <תיקיית קבצי העיר> <תיקיית maps> [--city <עיר>]... [--force] [--set k=v]...
#   LOOM_BIN = התיקייה עם הקבצים הבנויים של LOOM. --force מריץ גם עיר לא מאושרת (לכוונון).
# פלט: <maps>/loom/<עיר>.<רמה>.svg ו-<maps>/loom/index.json (הערים שעברו והקווים בכל רמה).
# רמה עם התרעה חמורה או כשל לא מוצגת; אם זו רמת ברירת המחדל של העיר, העיר לא נכנסת
# ל-index.json והמנוע הישן מצייר אותה.
import json,os,subprocess,sys,shutil,tempfile,time,yaml
H=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,H)
import make_gtfs
a=sys.argv[1:]; src,out=a[0],a[1]; only=[a[i+1] for i,x in enumerate(a) if x=='--city']; force='--force' in a
over={k:yaml.safe_load(v) for k,v in (a[i+1].split('=',1) for i,x in enumerate(a) if x=='--set')}
B=os.environ.get('LOOM_BIN','loom-build'); conf=yaml.safe_load(open(os.path.join(H,'cities.yml'),encoding='utf-8'))
odir=os.path.join(out,'loom'); os.makedirs(odir,exist_ok=True)
keepdir=os.environ.get('LOOM_KEEP')   # לשמירת קבצי הביניים (לכוונון)
def tier_run(name,t,cfg,tmp):
    g=os.path.join(tmp,t); n,_=make_gtfs.build(os.path.join(src,name+'.json'),g,t,cfg)
    topo=[B+'/topo','-d',str(cfg['topo_d'])]+(['--no-infer-restrs'] if cfg['no_infer_restrs'] else [])
    fix=[sys.executable,H+'/fixrestr.py'] if cfg['fix_restrs'] else ['cat']
    q=lambda c: ' '.join("'%s'"%x for x in c)
    cmd=f"set -o pipefail; {B}/gtfs2graph -m bus '{g}' | {q(topo)} | {q(fix)} | {B}/loom | {B}/octi --diag-pen {cfg['diag_pen']} > '{g}.octi.json' && " \
        f"{B}/transitmap -l --line-label-textsize 90 --station-label-textsize 70 --smoothing {cfg['smoothing']} < '{g}.octi.json' > '{g}.raw.svg'"
    r=subprocess.run(['bash','-c',cmd],capture_output=True,text=True,timeout=cfg['timeout'])
    if r.returncode: raise RuntimeError('השרשרת נכשלה: '+r.stderr[-300:])
    svg=os.path.join(odir,f'{name}.{t}.svg')
    r=subprocess.run([sys.executable,H+'/post.py',g+'.raw.svg',g+'.octi.json',svg,g,g+'.rep.json'],capture_output=True,text=True)
    if r.returncode: raise RuntimeError('post נכשל: '+r.stderr[-300:])
    return json.load(open(g+'.rep.json',encoding='utf-8'))
index={}; table=[]; back=[]; dropped=[]
for c in json.load(open(os.path.join(src,'cities.json'),encoding='utf-8')):
    name=c['name']; cfg=dict(conf['defaults'],**(conf.get('cities') or {}).get(name,{})); cfg.update(over)
    if only and name not in only: continue
    if not (cfg['approved'] or (force and only)): continue
    tmp=keepdir or tempfile.mkdtemp(); os.makedirs(tmp,exist_ok=True); tiers={}; prev=None
    for t in ('internal','metro','all'):
        n=c['n'][t]; want=(t==c['def'] or (n>=2 and n!=prev)); prev=n
        if not want or t not in cfg['tiers']: continue
        t0=time.time()
        try: rep=tier_run(name,t,cfg,tmp)
        except subprocess.TimeoutExpired: rep={'lines':[],'alerts':[{'sev':2,'line':'-','msg':'חריגה מ-%d שניות'%cfg['timeout']}]}
        except Exception as e: rep={'lines':[],'alerts':[{'sev':2,'line':'-','msg':str(e)[:200]}]}
        for x in rep['alerts']: table.append((name,t,x['sev'],x['line'],x['msg']))
        sev=[x for x in rep['alerts'] if x['sev']==2]
        print(f"{name} / {t}: {len(rep['lines'])} קווים, {len(rep['alerts'])} התרעות ({len(sev)} חמורות), {time.time()-t0:.0f} שניות",flush=True)
        if sev and not force:
            # רמה עם התרעה חמורה לא מוצגת. אם זו רמת ברירת המחדל, כל העיר חוזרת למפה הישנה
            p=os.path.join(odir,f'{name}.{t}.svg'); os.path.exists(p) and os.remove(p); dropped.append(f'{name} / {t}'); continue
        tiers[t]={'lines':[{k:l[k] for k in ('num','color','long','cls')} for l in rep['lines']]}
    if not keepdir: shutil.rmtree(tmp,ignore_errors=True)
    if c['def'] not in tiers:
        back.append(name)
        for t in tiers:
            p=os.path.join(odir,f'{name}.{t}.svg'); os.path.exists(p) and os.remove(p)
        continue
    index[name]={'def':c['def'],'tiers':tiers}
if only and os.path.exists(os.path.join(odir,'index.json')):   # ריצה על עיר אחת מעדכנת את הקיים
    old=json.load(open(os.path.join(odir,'index.json'),encoding='utf-8')); [old.pop(n,None) for n in only]; index=dict(old,**index)
json.dump(index,open(os.path.join(odir,'index.json'),'w',encoding='utf-8'),ensure_ascii=False,separators=(',',':'))
print('\nטבלת התרעות (2 = חמור, 1 = אזהרה):\n| עיר | רמה | חומרה | קו | התרעה |\n|---|---|---|---|---|')
for r in table: print('| '+' | '.join(str(x) for x in r)+' |')
if not table: print('| — | — | — | — | אין התרעות |')
print('\nמפות LOOM:',', '.join(index) or 'אין')
if dropped: print('רמות שלא מוצגות בגלל התרעה חמורה:',', '.join(dropped))
if back: print('חזרו למפה הישנה (רמת ברירת המחדל נכשלה):',', '.join(back))
