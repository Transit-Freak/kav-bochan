# -*- coding: utf-8 -*-
# מסווג את תחנות ה-GTFS לקטגוריות אי-התאמה ומפיק next-station/data.json.
# קלט (נתיבים דרך משתני סביבה, ברירת מחדל = תיקייה נוכחית):
#   STOPS=stops.txt  POI=poi.json  ROADS=roads.json  ACTIVE=active_stops.txt
#   PREV=<data.json קודם> — אם קיים, מעתיק ממנו זמני-הליכה (rt) כדי לא לאבד אותם בריצה שבועית
#   OUT=next-station/data.json
import csv, re, json, math, time, os, datetime
t0=time.time()
STOPS=os.environ.get('STOPS','stops.txt'); POI=os.environ.get('POI','poi.json')
ROADS=os.environ.get('ROADS','roads.json'); ACTIVE_PATH=os.environ.get('ACTIVE','active_stops.txt')
PREV=os.environ.get('PREV',''); OUT=os.environ.get('OUT','next-station/data.json')
PREF=['שדרות','שדרת',"שד'",'שד','רחוב',"רח'",'רח','דרך','סמטת','סמטה',"סמ'",'שכונת',"שכ'",'כיכר','ככר','מחלף','כביש']
TITLES={'הרב','רב','דר','דוקטור','פרופ','השר','ראל','אלוף','סרן','הנשיא','מר','גנרל','בי"ס','ביה"ס','בית','ספר','גן','קניון'}
def sp(t):
    t=t.strip()
    for p in PREF:
        if t.startswith(p+' '): return t[len(p):].strip()
    return t
def nl(t):
    t=sp((t or '').strip()).replace('׳',"'").replace('״','"').replace("'",'').replace('"','')
    return re.sub(r'\s+',' ',t).strip()
def nf(t): return nl(t).replace('יי','י').replace('וו','ו')
def tk(s): return [w for w in s.split() if w not in TITLES and len(w)>1]
def lev(a,b):
    if abs(len(a)-len(b))>2: return 9
    pv=list(range(len(b)+1))
    for i,ca in enumerate(a,1):
        cur=[i]
        for j,cb in enumerate(b,1): cur.append(min(pv[j]+1,cur[-1]+1,pv[j-1]+(ca!=cb)))
        pv=cur
    return pv[-1]
def rel(tok,act):
    if not tok or not act: return None
    if nl(tok)==nl(act): return 'exact'
    if nf(tok)==nf(act): return 'spelling'
    if any(len(t)>=3 for t in set(tk(nl(tok)))&set(tk(nl(act)))): return 'exact'
    if nl(tok) in nl(act) or nl(act) in nl(tok): return 'exact'
    a2,b2=tk(nf(tok)),tk(nf(act))
    if a2 and b2 and lev(a2[-1],b2[-1])<=2 and max(len(a2[-1]),len(b2[-1]))>=4: return 'spelling'
    return None
def fuzzy_in(t,toks):
    for b in toks:
        if t==b or (max(len(t),len(b))>=4 and lev(t,b)<=1): return True
    return False
def same_street(a,b):
    ta=tk(nf(a)); tb=tk(nf(b))
    if not ta or not tb or len(ta)==len(tb): return False
    short,lng=(ta,tb) if len(ta)<len(tb) else (tb,ta)
    return all(fuzzy_in(t,lng) for t in short)
def ktiv_only(a,b):
    sa=re.sub('[יו]','',nf(a)); sb=re.sub('[יו]','',nf(b))
    return sa==sb and len(sa)>=3
def street(d):
    m=re.search(r'רחוב:\s*(.*?)\s*עיר:', d or ''); return re.sub(r'\s+\d+[א-ת]?$','',m.group(1).strip()).strip() if m else ''
def city(d):
    m=re.search(r'עיר:\s*(.*?)\s*רציף:', d or ''); return m.group(1).strip() if m else ''
def named_after_city(name,c):
    if not c or len(c)<3: return False
    return nl(c).replace('-',' ') in nl(name).replace('-',' ')
poi=json.load(open(POI))['poi']; GP={}
for p in poi: GP.setdefault((round(p['la']/0.001),round(p['lo']/0.001)),[]).append(p)
def hav(a,b,c,d):
    Rr=6371000; pr=math.pi/180
    return 2*Rr*math.asin(math.sqrt(math.sin((c-a)*pr/2)**2+math.cos(a*pr)*math.cos(c*pr)*math.sin((d-b)*pr/2)**2))
def nearby(la,lo,rad=500):
    if la is None: return []
    res=[]; ck=(round(la/0.001),round(lo/0.001)); R=range(-5,6)
    for dx in R:
        for dy in R:
            for p in GP.get((ck[0]+dx,ck[1]+dy),[]):
                dd=hav(la,lo,p['la'],p['lo'])
                if dd<=rad: res.append((round(dd),p))
    res.sort(key=lambda x:x[0]); return res
def name_matches_poi(name,plist):
    nt=[t for t in tk(nf(name)) if len(t)>=3]
    for dist,p in plist:
        if dist>500: continue
        for a in nt:
            for b in [t for t in tk(nf(p['n'])) if len(t)>=3]:
                if a==b or (max(len(a),len(b))>=4 and lev(a,b)<=1): return p
    return None
RD=json.load(open(ROADS))['roads']; CELL=0.003; GR={}
for ri,rd in enumerate(RD):
    g=rd['g']
    for i in range(len(g)-1):
        for pt in (g[i],g[i+1]): GR.setdefault((int(pt[0]/CELL),int(pt[1]/CELL)),[]).append((ri,i))
def segdist(plat,plon,a,b):
    cl=math.cos(math.radians(plat))
    ax=(a[1]-plon)*111320*cl; ay=(a[0]-plat)*110540; bx=(b[1]-plon)*111320*cl; by=(b[0]-plat)*110540
    dx=bx-ax; dy=by-ay
    if dx==0 and dy==0: return math.hypot(ax,ay)
    tt=max(0.0,min(1.0,-(ax*dx+ay*dy)/(dx*dx+dy*dy)))
    return math.hypot(ax+tt*dx, ay+tt*dy)
def nearest_roads(la,lo,topn=4):
    if la is None: return []
    ck=(int(la/CELL),int(lo/CELL)); cands={}; seen=set()
    for dx in(-1,0,1):
        for dy in(-1,0,1):
            for ri,i in GR.get((ck[0]+dx,ck[1]+dy),[]):
                if (ri,i) in seen: continue
                seen.add((ri,i)); g=RD[ri]['g']; d=segdist(la,lo,g[i],g[i+1]); nm=RD[ri]['n']; key=nf(nm)
                if key not in cands or d<cands[key][0]: cands[key]=(d,nm)
    return [(nm,round(d)) for d,nm in sorted(cands.values())[:topn]]
print('indexes built %.1fs'%(time.time()-t0))
rows=list(csv.reader(open(STOPS,encoding='utf-8-sig')))
ix={h:i for i,h in enumerate(rows[0])}
SN,SD,SC,LA,LO,SI=ix['stop_name'],ix['stop_desc'],ix['stop_code'],ix['stop_lat'],ix['stop_lon'],ix['stop_id']
ACTIVE=None
if os.path.exists(ACTIVE_PATH):
    ACTIVE=set(l.strip() for l in open(ACTIVE_PATH) if l.strip()); print('active stop_ids:',len(ACTIVE))
PREVRT={}
if PREV and os.path.exists(PREV):
    try:
        pd=json.load(open(PREV))
        for s in pd.get('stops',[]):
            for p in s.get('p',[]):
                if p.get('rt'): PREVRT[(s['c'],p['n'])]=p['rt']
        print('carried-forward rt:',len(PREVRT))
    except Exception as e: print('prev load failed:',e)
from collections import defaultdict, Counter
def norm_ref(part):
    t=part.replace('-',' ').replace('.',' ').replace('׳',"'").replace('״','"').replace("'",'').replace('"','')
    return sp(re.sub(r'\s+',' ',t).strip()).strip()
def strip_seg(s): return re.sub(r'\s[א-ת]$','',s).strip()
def seg_diff(a,b):
    sa,sb=strip_seg(a),strip_seg(b)
    return (sa!=a or sb!=b) and nl(sa)==nl(sb)
_grp=defaultdict(list)
for r in rows[1:]:
    if len(r)<=SD: continue
    nm=r[SN]; stt=street(r[SD]); cc=city(r[SD])
    if not stt or re.fullmatch(r'[\d ]+',stt) or not cc: continue
    for p in re.split(r'[\\/]',nm):
        if rel(p,stt) in ('exact','spelling'):
            _grp[(cc,nf(stt))].append((r[SC],re.sub(r'\s+',' ',p).strip(),norm_ref(p))); break
STREETVAR={}
for key,lst in _grp.items():
    c2=Counter(ref for _,_,ref in lst)
    if len(c2)<2: continue
    top,topn=c2.most_common(1)[0]
    if topn==c2.most_common(2)[1][1]: continue
    maj_raw=Counter(raw for _,raw,ref in lst if ref==top).most_common(1)[0][0]
    tt=len(top.split())
    for code2,raw,ref in lst:
        if ref==top or seg_diff(ref,top): continue
        if abs(len(ref.split())-tt)<=1 or nf(ref)==nf(top): STREETVAR[code2]=(raw,maj_raw,topn)
print('street-variance flags:',len(STREETVAR))
cnt={'exact':0,'settlement':0,'spelling':0,'streetvar':0,'uncertain':0,'reversal':0,'mismatch':0,'landmark':0,'mapok':0,'noaddr':0}
suspects=[]
for r in rows[1:]:
    if len(r)<=SD: continue
    name,desc,code=r[SN],r[SD],r[SC]; st=street(desc); c=city(desc)
    try: la=round(float(r[LA]),5); lo=round(float(r[LO]),5)
    except: la=lo=None
    realstreet=st and not re.fullmatch(r'[\d ]+',st)
    if not realstreet:
        cnt['settlement' if named_after_city(name,c) else 'noaddr']+=1; continue
    parts=re.split(r'[\\/]',name); prim,cross=parts[0],(parts[1] if len(parts)>1 else '')
    sv=STREETVAR.get(code)
    samestreet=rel(prim,st)=='exact' or same_street(prim,st) or (cross and same_street(cross,st))
    if samestreet and not sv: cnt['exact']+=1; continue
    if samestreet: cat='streetvar'
    elif rel(prim,st)=='spelling': cat='uncertain' if ktiv_only(prim,st) else 'spelling'
    elif cross and rel(cross,st) in ('exact','spelling'):
        cat='uncertain' if rel(cross,st)=='spelling' and ktiv_only(cross,st) else 'reversal'
    elif named_after_city(name,c): cnt['settlement']+=1; continue
    else: cat='mismatch'
    if sv and cat in ('spelling','uncertain'): cat='streetvar'
    nr=nearest_roads(la,lo,4); ms,md=(nr[0] if nr else (None,None))
    if cat in ('reversal','mismatch') and ms and rel(prim,ms) in ('exact','spelling'):
        cnt['mapok']+=1; continue
    nb=nearby(la,lo)
    if cat in ('reversal','mismatch') and name_matches_poi(prim,nb): cnt['landmark']+=1; continue
    cnt[cat]+=1
    sug=None
    if nr and cat not in ('uncertain','streetvar'):
        s1=nr[0][0]; s2=None
        for nm2,dd in nr[1:]:
            if dd<=60 and nf(nm2)!=nf(s1): s2=nm2; break
        cand=(s1+'/'+s2) if s2 else s1
        if nf(cand)!=nf(name): sug=cand
    pois=[]
    for dist,p in nb:
        if dist>300: continue
        if len(pois)>=3: break
        pr={'n':p['n'],'k':p['k'],'d':dist,'la':p['la'],'lo':p['lo']}
        rt=PREVRT.get((code,p['n']))
        if rt: pr['rt']=rt
        pois.append(pr)
    rec={'c':code,'n':name,'s':st,'t':c,'la':la,'lo':lo,'k':cat,'p':pois,'ms':ms,'md':md}
    if sug: rec['sug']=sug
    if sv: rec['sv']={'use':sv[0],'maj':sv[1],'n':sv[2]}
    if ACTIVE is not None and r[SI] not in ACTIVE: rec['act']=False
    suspects.append(rec)
print('classification:',cnt)
print('suspects:',len(suspects),'| %.1fs'%(time.time()-t0))
os.makedirs(os.path.dirname(OUT) or '.',exist_ok=True)
json.dump({'generated':datetime.date.today().isoformat(),'counts':cnt,'stops':suspects},
  open(OUT,'w'), ensure_ascii=False, separators=(',',':'))
print('wrote',OUT)
