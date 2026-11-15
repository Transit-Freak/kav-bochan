# -*- coding: utf-8 -*-
# בדיקת מפות הרשת: המסלול שהמפה הסכמטית מציירת מול המסלול האמיתי מ-shapes.txt.
# שימוש: python3 compare.py <קובץ עיר (פלט citymap.py)> <תיקיית פלט> [תווית]
#   משתני סביבה: TIER (internal/metro/all), וכל משתני CM_* של citymap-render.py.
# מרנדר את העיר (citymap-render.py באותו תהליך), ממיר את הקו המצויר חזרה למטרים דרך
# רשת העמודות/שורות של המפה, ומודד לכל קו:
#   mean/max — מרחק ממוצע/מרבי (מ') מנקודות המסלול האמיתי אל הקו המצויר
#   far300   — אחוז מהמסלול האמיתי שרחוק מעל 300 מ' מהקו המצויר
#   stops_ok — אחוז התחנות שנמצאות עד 150 מ' מהקו המצויר, בסדר הנסיעה
#   opp_far300 — אחוז מהכיוון הנגדי שרחוק מעל 300 מ' מכל מה שצויר לקו (כולל ענפים)
# פלט: <out>/<עיר>.<tier>.html, .metrics.json, .overlay.json, ושורת סיכום ל-<out>/summary.tsv
import sys,os,re,json,math,runpy,io,contextlib,bisect,statistics,html as H
src,out=sys.argv[1],sys.argv[2]; label=sys.argv[3] if len(sys.argv)>3 else ''
render=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','citymap-render.py')
d=json.load(open(src,encoding='utf-8')); city=d['city']
tier=os.environ.get('TIER') or d.get('def','all'); os.environ['TIER']=tier
page=f'{out}/{city}.{tier}.html'
sys.argv=[render,src,page]
with contextlib.redirect_stdout(io.StringIO()): g=runpy.run_path(render)
paths={k:dd for k,dd in re.findall(r'<path class="ln ln-[^"]+" data-k="([^"]+)" d="([^"]+)"',open(page,encoding='utf-8').read())}
cols,rows,U,P,xy=g['cols'],g['rows'],g['U'],g['P'],g['xy']
def frac(v,arr):
    if len(arr)<2: return 0.0
    i=min(max(bisect.bisect_right(arr,v)-1,0),len(arr)-2)
    return i+(v-arr[i])/((arr[i+1]-arr[i]) or 1)
def real2canvas(x,y): return P((frac(x,cols)*U,frac(y,rows)*U))
cx=[P((i*U,0))[0] for i in range(len(cols))]; cy=[P((0,j*U))[1] for j in range(len(rows))]
def inv(v,can,arr):
    a,b=(can,arr) if can[0]<can[-1] else (can[::-1],arr[::-1])
    if len(a)<2: return b[0]
    i=min(max(bisect.bisect_right(a,v)-1,0),len(a)-2)
    return b[i]+(v-a[i])*(b[i+1]-b[i])/((a[i+1]-a[i]) or 1)
def canvas2real(p): return (inv(p[0],cx,cols),inv(p[1],cy,rows))
def parse(dd):
    pts=[]
    for c,a in re.findall(r'([MLQ])([^MLQ]+)',dd):
        v=[float(x) for x in a.split()]
        pts+= [(v[0],v[1]),(v[2],v[3])] if c=='Q' else [(v[0],v[1])]
    return pts
def dens(pts,step):
    o=[]
    for a,b in zip(pts,pts[1:]):
        n=max(1,int(math.hypot(b[0]-a[0],b[1]-a[1])/step))
        o+=[(a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n) for k in range(n)]
    return o+[pts[-1]] if pts else o
def dmin(p,Q): return min(math.hypot(p[0]-q[0],p[1]-q[1]) for q in Q)
def sch_of(k): return dens([canvas2real(p) for p in dens(parse(paths[k]),4)],30)
metrics=[];overlay={}
for L in g['lines']:
    if L['br'] or L['num'] not in paths: continue
    k=L['num']; sch=sch_of(k)
    real=dens([xy(p[0],p[1]) for p in L['path']],30)
    d1=[dmin(p,sch) for p in real]
    pos=0;ok=[]
    for s in L['stops']:
        q=xy(s[2],s[3]);best=None
        for i in range(max(0,pos-3),len(sch)):
            dd=math.hypot(sch[i][0]-q[0],sch[i][1]-q[1])
            if dd<=150 and (best is None or dd<best[0]): best=(dd,i)
            if best and i-best[1]>40: break
        if best: pos=best[1]
        ok.append(1 if best else 0)
    drawn=sch+[q for kk in paths if kk.startswith(k+'b') for q in sch_of(kk)]
    opp=dens([xy(p[0],p[1]) for p in L.get('opp',[])],30); of=None; om=None
    if opp:
        dd=[dmin(p,drawn) for p in opp]; of=round(100*sum(x>300 for x in dd)/len(dd)); om=round(max(dd))
    metrics.append(dict(num=L['label'],id=L['id'],cls=L.get('cls'),weekly=L.get('weekly'),stops=len(L['stops']),mean=round(sum(d1)/len(d1)),max=round(max(d1)),
        far300=round(100*sum(x>300 for x in d1)/len(d1)),stops_ok=round(100*sum(ok)/len(ok)),opp_max=om,opp_far300=of,branches=len(L.get('branches',[]))))
    overlay[L['grp']]=dict(num=L['label'],real=[[round(v,1) for v in real2canvas(*p)] for p in real],opp=[[round(v,1) for v in real2canvas(*p)] for p in opp],
        stops=[[round(v,1) for v in real2canvas(*xy(s[2],s[3]))]+[o] for s,o in zip(L['stops'],ok)])
json.dump(metrics,open(f'{out}/{city}.{tier}.metrics.json','w',encoding='utf-8'),ensure_ascii=False)
json.dump(overlay,open(f'{out}/{city}.{tier}.overlay.json','w'))
med=lambda f:round(statistics.median(m[f] for m in metrics)) if metrics else 0
worst=max(metrics,key=lambda m:m['max']) if metrics else {'num':'','max':0}
row=[label,city,tier,len(metrics),med('mean'),med('max'),sum(m['max']>500 for m in metrics),f"{worst['max']} ({worst['num']})",med('stops_ok'),
     sum((m['opp_far300'] or 0)>20 for m in metrics)]
hdr=['step','city','tier','lines','med_mean','med_max','n_max>500','worst_max(line)','med_stops_ok','n_opp_far300>20%']
f=f'{out}/summary.tsv'; new=not os.path.exists(f)
with open(f,'a',encoding='utf-8') as fh:
    if new: fh.write('\t'.join(hdr)+'\n')
    fh.write('\t'.join(str(x) for x in row)+'\n')
print('\t'.join(str(x) for x in row))
