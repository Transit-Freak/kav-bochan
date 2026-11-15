# -*- coding: utf-8 -*-
# חילוץ קווים עירוניים לכל עיר מה-GTFS — קלט למחולל מפות הרשת (citymap-render.py).
#
# קו = מק"ט (החלק הראשון של route_desc), לא מספר הקו: שני קווים שונים עם אותו מספר
# (222 של אגד ו-222 של "קווים") נשארים שניהם. לכל מק"ט נבחרת בכל כיוון החלופה עם הכי
# הרבה נסיעות בשבוע; הכיוון הראשי הוא זה עם יותר נסיעות, והכיוון הנגדי נשמר לצידו.
# קו עם פחות מ-MIN_WEEKLY נסיעות בשבוע (שני הכיוונים יחד) לא נכנס למפה.
#
# שיוך לעיר לפי שדה "עיר:" ב-stop_desc (4 תחנות לפחות). לכל (קו, עיר) מחושב סיווג:
#   internal — 85%+ מהתחנות בעיר וקצה אחד לפחות בעיר, או קו מעגלי עם 80%+ בעיר
#   metro    — 50%+ מהתחנות ו-40%+ מהק"מ בעיר, קצה בעיר, 50+ נסיעות בשבוע
#   pass     — כל השאר (קו שרק עובר בעיר)
# הקטע שמצויר: רצף התחנות הארוך ביותר בתוך העיר (+תחנה אחת מכל צד), בלי קטעי חוץ.
# הגאומטריה: shapes.txt — 'path' הוא המסלול האמיתי (מפושט) עם התחנות משובצות בו.
# פלט: OUTDIR/<עיר>.json לכל עיר + OUTDIR/cities.json (רשימה, מונים וברירת מחדל).
import csv, json, os, math, bisect, datetime
from collections import defaultdict

MAIN=os.environ.get('MAIN','data-main.json')
OUTDIR=os.environ.get('OUTDIR','citydata')
MIN_LINES=int(os.environ.get('MIN_LINES','2'))
MIN_STOPS=8          # קו עם פחות תחנות מזה לא תורם למפה
CITY_MIN_STOPS=4     # קו נחשב שייך לעיר אם יש לו לפחות כך תחנות בתוכה
MIN_WEEKLY=int(os.environ.get('MIN_WEEKLY','14'))   # פחות משתי נסיעות ביום בממוצע = קו נדיר
GAP=8                # עד כך תחנות רצופות מחוץ לעיר לא שוברות את הרצף (קו פנימי שחוצה לרגע עיר שכנה נשאר שלם)
INT_PS=85; CIRC_PS=80; METRO_PS=50; METRO_PK=40; METRO_WEEKLY=50
MIN_DEFAULT=5        # פחות מכך קווים פנימיים — ברירת המחדל של העיר עוברת ל"+ מטרופוליניים"
SIMPLIFY=float(os.environ.get('CM_SIMPLIFY','30'))   # פישוט המסלול (מ'): מסיר זיגזג של כיכרות ומפרצי תחנות
BR_FAR=300; BR_NEAR=150; BR_MINLEN=500   # כיוון נגדי שמתרחק מעל 300 מ' מצויר כענף נפרד

rows=json.load(open(MAIN,encoding='utf-8'))
urban=set()
for r in rows:
    if str(r[6]).strip()=='עירוני' and 'תלמיד' not in str(r[7]):
        urban.add(str(r[0]).strip().lstrip('0'))
print('מק"טים עירוניים:',len(urban))

def desc_city(desc):
    i=desc.find('עיר:')
    if i<0: return ''
    return desc[i+4:].split('רציף:')[0].strip()

# ---- נסיעות בשבוע לכל service_id: השבוע הראשון של הקובץ ----
def _d(s): return datetime.date(int(s[:4]),int(s[4:6]),int(s[6:8]))
cal=list(csv.DictReader(open('calendar.txt',encoding='utf-8-sig')))
d0=min(_d(r['start_date']) for r in cal)
week=[d0+datetime.timedelta(days=i) for i in range(7)]
DAYS=['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
svc_days={}
for r in cal:
    a,b=_d(r['start_date']),_d(r['end_date'])
    svc_days[r['service_id']]=sum(1 for d in week if a<=d<=b and r[DAYS[d.weekday()]]=='1')

routes={}
for r in csv.DictReader(open('routes.txt',encoding='utf-8-sig')):
    p=r.get('route_desc','').split('-')
    mk=p[0].strip().lstrip('0')
    if mk in urban and r.get('route_type','3')=='3':
        routes[r['route_id']]={'mk':mk,'dir':p[1] if len(p)>1 else '1','num':r.get('route_short_name',''),
                               'long':r.get('route_long_name',''),'ag':r.get('agency_id',''),'w':0,'trip':None,'shape':''}
for r in csv.DictReader(open('trips.txt',encoding='utf-8-sig')):
    x=routes.get(r['route_id'])
    if x is None: continue
    x['w']+=svc_days.get(r['service_id'],0)
    if x['trip'] is None: x['trip']=r['trip_id']; x['shape']=r.get('shape_id','')

# ---- חלופה ראשית לכל כיוון של כל מק"ט: הכי הרבה נסיעות בשבוע ----
bymk=defaultdict(lambda: defaultdict(list))
for rid,x in routes.items():
    if x['trip']: bymk[x['mk']][x['dir']].append(rid)
picked={}   # mk -> [rid ראשי, rid נגדי או None]
weekly={}
for mk,dirs in bymk.items():
    weekly[mk]=sum(routes[r]['w'] for rs in dirs.values() for r in rs)
    tops=sorted(((sum(routes[r]['w'] for r in rs),d,max(rs,key=lambda r:routes[r]['w'])) for d,rs in dirs.items()),
                key=lambda t:(-t[0],t[1]))
    picked[mk]=[tops[0][2],tops[1][2] if len(tops)>1 else None]
print('קווים (מק"טים):',len(picked),'| מתחת ל-%d נסיעות בשבוע:'%MIN_WEEKLY,sum(1 for m in weekly if weekly[m]<MIN_WEEKLY))
need={r for m,pr in picked.items() if weekly[m]>=MIN_WEEKLY for r in pr if r}
trip2rid={routes[r]['trip']:r for r in need}

seqs=defaultdict(list)
with open('stop_times.txt',encoding='utf-8-sig') as f:
    h=f.readline().strip().split(',')
    it,isq,isd,idt=h.index('trip_id'),h.index('stop_sequence'),h.index('stop_id'),h.index('shape_dist_traveled')
    for ln in f:
        p=ln.rstrip('\r\n').split(',')
        rid=trip2rid.get(p[it])
        if rid: seqs[rid].append((int(p[isq]),p[isd],float(p[idt] or 0)))

stops={}
for r in csv.DictReader(open('stops.txt',encoding='utf-8-sig')):
    try:
        stops[r['stop_id']]=(r['stop_name'],r.get('stop_code',''),float(r['stop_lat']),float(r['stop_lon']),desc_city(r.get('stop_desc','') or ''))
    except (ValueError,KeyError):
        pass

shape_ids={routes[r]['shape'] for r in need}
shp=defaultdict(list)
if os.path.exists('shapes.txt'):
    with open('shapes.txt',encoding='utf-8-sig') as f:
        h=f.readline().strip().split(',')
        i0,ila,ilo,isq=h.index('shape_id'),h.index('shape_pt_lat'),h.index('shape_pt_lon'),h.index('shape_pt_sequence')
        for ln in f:
            p=ln.rstrip('\r\n').split(',')
            if p[i0] in shape_ids: shp[p[i0]].append((int(p[isq]),float(p[ila]),float(p[ilo])))

CL=math.cos(math.radians(31.8))
def xy(la,lo): return (lo*111320*CL, la*110540)
def ll(x,y): return (round(y/110540,5), round(x/(111320*CL),5))

def simplify(pts,tol):
    # Douglas-Peucker לא רקורסיבי
    if len(pts)<3: return pts[:]
    keep=[False]*len(pts); keep[0]=keep[-1]=True; st=[(0,len(pts)-1)]
    while st:
        a,b=st.pop()
        if b-a<2: continue
        ax,ay=pts[a]; bx,by=pts[b]; L2=(bx-ax)**2+(by-ay)**2 or 1.0
        wd,wi=0,None
        for i in range(a+1,b):
            px,py=pts[i]; t=max(0.0,min(1.0,((px-ax)*(bx-ax)+(py-ay)*(by-ay))/L2))
            dd=math.hypot(px-(ax+(bx-ax)*t),py-(ay+(by-ay)*t))
            if dd>wd: wd,wi=dd,i
        if wd>tol: keep[wi]=True; st.append((a,wi)); st.append((wi,b))
    return [p for p,k in zip(pts,keep) if k]

class Var:
    # חלופה אחת: רצף תחנות + קו המסלול (במטרים), עם מרחק מצטבר לכל נקודה
    def __init__(self,rid):
        sq=sorted(seqs.get(rid,[]))
        self.sids=[s for _,s,_ in sq if s in stops]
        dist=[d for _,s,d in sq if s in stops]
        self.sxy=[xy(stops[s][2],stops[s][3]) for s in self.sids]
        pts=[xy(a,b) for _,a,b in sorted(shp.get(routes[rid]['shape'],[]))]
        if len(pts)<2: pts=self.sxy[:]          # אין shape — קו ישר בין התחנות
        self.pts=pts
        self.cum=[0.0]
        for p,q in zip(pts,pts[1:]): self.cum.append(self.cum[-1]+math.hypot(q[0]-p[0],q[1]-p[1]))
        tot=self.cum[-1] or 1.0
        mx=max(dist) if dist and max(dist)>0 else 0
        if mx: self.sd=[d*tot/mx for d in dist]          # shape_dist_traveled מכויל לאורך ה-shape
        else:                                           # אין מרחקים — הטלה מתקדמת על המסלול
            self.sd=[]; k=0
            for q in self.sxy:
                k=min(range(k,len(pts)),key=lambda i:math.hypot(pts[i][0]-q[0],pts[i][1]-q[1])); self.sd.append(self.cum[k])
        self.city=[stops[s][4] for s in self.sids]
    def clip(self,c):
        # הרצף הארוך ביותר בתוך העיר (מגשר על עד GAP תחנות חוץ), +תחנה אחת מכל צד
        idx=[i for i,x in enumerate(self.city) if x==c]
        if not idx: return None
        runs=[[idx[0]]]
        for i in idx[1:]:
            if i-runs[-1][-1]-1<=GAP: runs[-1].append(i)
            else: runs.append([i])
        r=max(runs,key=len)
        return max(0,r[0]-1),min(len(self.sids)-1,r[-1]+1)
    def exact(self,lo,hi):
        # המסלול המדויק (פישוט ל-8 מ' בלבד) — לתצוגת הקו הבודד
        a=bisect.bisect_left(self.cum,self.sd[lo]); b=bisect.bisect_right(self.cum,self.sd[hi])
        seg=simplify(self.pts[a:b],8) if b-a>=2 else self.sxy[lo:hi+1]
        return [list(ll(x,y)) for x,y in seg]
    def path(self,lo,hi):
        # המסלול בין שתי תחנות: נקודות ה-shape (מפושט ל-10 מ', מרווח עד 70 מ') + התחנות לפי מרחק
        a=bisect.bisect_left(self.cum,self.sd[lo]); b=bisect.bisect_right(self.cum,self.sd[hi])
        seg=simplify(self.pts[a:b],SIMPLIFY) if b-a>=2 else []
        out=[]   # (מרחק, x, y, אינדקס תחנה או -1)
        if seg:
            dcur=self.cum[a]
            out.append((dcur,seg[0][0],seg[0][1],-1))
            for p,q in zip(seg,seg[1:]):
                L=math.hypot(q[0]-p[0],q[1]-p[1]); n=max(1,int(math.ceil(L/70)))
                for k in range(1,n+1): out.append((dcur+L*k/n,p[0]+(q[0]-p[0])*k/n,p[1]+(q[1]-p[1])*k/n,-1))
                dcur+=L
        for i in range(lo,hi+1): out.append((self.sd[i],self.sxy[i][0],self.sxy[i][1],i-lo))
        out.sort(key=lambda t:(t[0],t[3]<0))
        if out[0][3]<0:   # הקו מתחיל ונגמר בתחנה
            j=next(k for k,t in enumerate(out) if t[3]>=0); out=out[j:]
        while out[-1][3]<0: out.pop()
        return out

def seg_dist(p,poly):
    best=1e18
    for (ax,ay),(bx,by) in zip(poly,poly[1:]):
        L2=(bx-ax)**2+(by-ay)**2 or 1.0
        t=max(0.0,min(1.0,((p[0]-ax)*(bx-ax)+(p[1]-ay)*(by-ay))/L2))
        dd=math.hypot(p[0]-(ax+(bx-ax)*t),p[1]-(ay+(by-ay)*t))
        if dd<best: best=dd
    return best

def branches(main,opp,ostops):
    # קטעים של הכיוון הנגדי שרחוקים מעל BR_FAR מהכיוון הראשי — מורחבים עד שחוזרים ל-BR_NEAR
    mp=[(t[1],t[2]) for t in main]
    if len(mp)<2: return []
    dd=[seg_dist((t[1],t[2]),mp) for t in opp]
    out=[]; i=0; n=len(opp)
    while i<n:
        if dd[i]<=BR_FAR: i+=1; continue
        a=i
        while a>0 and dd[a-1]>BR_NEAR: a-=1
        b=i
        while b<n-1 and dd[b+1]>BR_NEAR: b+=1
        a2=max(0,a-1); b2=min(n-1,b+1)
        if opp[b][0]-opp[a][0]>=BR_MINLEN:
            out.append([[*ll(t[1],t[2]),(ostops[t[3]][0] if t[3]>=0 else None)] for t in opp[a2:b2+1]])
        i=b+1
    return out

vars_={r:Var(r) for r in need}
agency={}
if os.path.exists('agency.txt'):
    agency={r['agency_id']:r['agency_name'] for r in csv.DictReader(open('agency.txt',encoding='utf-8-sig'))}

bycity=defaultdict(list)
for mk,(rm,ro) in picked.items():
    if weekly[mk]<MIN_WEEKLY: continue
    vm=vars_[rm]; vo=vars_[ro] if ro else None
    if len(vm.sids)<MIN_STOPS: continue
    info=routes[rm]
    both=[vm]+([vo] if vo and len(vo.sids)>=2 else [])
    wts=[max(1,routes[rm]['w'])]+([max(1,routes[ro]['w'])] if len(both)>1 else [])
    circ=(len(both)==1 and math.hypot(vm.sxy[0][0]-vm.sxy[-1][0],vm.sxy[0][1]-vm.sxy[-1][1])<400)
    cities={c for v in both for c in set(v.city) if c and v.city.count(c)>=CITY_MIN_STOPS}
    for c in cities:
        cm=vm.clip(c)
        if cm is None or vm.city.count(c)<CITY_MIN_STOPS:
            # הכיוון הראשי כמעט לא בעיר — אם הנגדי כן, הוא הופך לראשי בעיר הזו
            if vo is None or vo.city.count(c)<CITY_MIN_STOPS: continue
            v1,v2,r1=vo,vm,ro
        else: v1,v2,r1=vm,vo,rm
        lo,hi=v1.clip(c)
        if hi-lo+1<5: continue
        W=sum(wts)
        ps=sum(w*v.city.count(c)/len(v.sids) for v,w in zip(both,wts))/W
        def kmin(v):
            tot=(v.sd[-1]-v.sd[0]) or 1.0
            return sum(v.sd[i+1]-v.sd[i] for i in range(len(v.sids)-1) if v.city[i]==c and v.city[i+1]==c)/tot
        pk=sum(w*kmin(v) for v,w in zip(both,wts))/W
        ends=sum((v.city[0]==c)+(v.city[-1]==c) for v in both)
        ps_=round(100*ps); pk_=round(100*pk)
        if (ps_>=INT_PS and ends>0) or (circ and ps_>=CIRC_PS): cls='internal'
        elif ps_>=METRO_PS and pk_>=METRO_PK and ends>0 and weekly[mk]>=METRO_WEEKLY: cls='metro'
        else: cls='pass'
        P1=v1.path(lo,hi)
        st=[[stops[s][0],stops[s][1],stops[s][2],stops[s][3]] for s in v1.sids[lo:hi+1]]
        L={'id':mk,'rid':r1,'mk':mk,'num':routes[r1]['num'],'long':routes[r1]['long'],'op':agency.get(info['ag'],''),
           'cls':cls,'weekly':weekly[mk],'ps':ps_,'pk':pk_,'ends':ends,'circ':circ,'stops':st,
           'path':[[*ll(t[1],t[2]),t[3]] for t in P1],'exact':v1.exact(lo,hi),'opp':[],'branches':[]}
        if v2 is not None and len(v2.sids)>=2:
            co=v2.clip(c)
            if co and co[1]>co[0]:
                P2=v2.path(*co)
                ost=[[stops[s][0]] for s in v2.sids[co[0]:co[1]+1]]
                L['opp']=v2.exact(*co)
                L['branches']=branches(P1,P2,ost)
        bycity[c].append(L)

os.makedirs(OUTDIR,exist_ok=True)
cities=[]
for c,ls in sorted(bycity.items()):
    if len(ls)<MIN_LINES: continue
    n={'internal':sum(L['cls']=='internal' for L in ls),'metro':sum(L['cls']!='pass' for L in ls),'all':len(ls)}
    # ברירת מחדל: פנימיים; פחות מ-MIN_DEFAULT פנימיים — "+ מטרופוליניים"; ואם גם שם אין שני קווים — הכול
    dflt='internal' if n['internal']>=MIN_DEFAULT else ('metro' if n['metro']>=MIN_LINES else 'all')
    json.dump({'city':c,'def':dflt,'n':n,'lines':ls},open(os.path.join(OUTDIR,c+'.json'),'w',encoding='utf-8'),ensure_ascii=False)
    cities.append({'name':c,'lines':n[dflt],'n':n,'def':dflt})
json.dump(cities,open(os.path.join(OUTDIR,'cities.json'),'w',encoding='utf-8'),ensure_ascii=False)
print('ערים עם מפה:',len(cities))
for c in cities: print(f"  {c['name']}: פנימיים {c['n']['internal']} | +מטרופוליניים {c['n']['metro']} | הכול {c['n']['all']} | ברירת מחדל {c['def']}")
