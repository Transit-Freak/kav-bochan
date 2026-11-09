# -*- coding: utf-8 -*-
# ניסוי "קווים שמדלגים": מזהה קווים שנוסעים ממש ליד תחנה פעילה — ולא עוצרים בה.
# האות החזק: "סנדוויץ'" — הקו עוצר בתחנה שלפני ובתחנה שאחרי, ומדלג רק על האמצעית.
# קלט (משתני סביבה): STOPS, STOP_TIMES, TRIPS, ROUTES, SHAPES, MAIN (data-main.json — הקובץ המצומצם)
# פלט: הדפסת ממצאים ליומן; אם OUT מוגדר — נכתב גם JSON לאתר (skip-stops/data.json).
import csv, os, re, sys, math
from collections import defaultdict

STOPS=os.environ.get('STOPS','stops.txt')
STOP_TIMES=os.environ.get('STOP_TIMES','stop_times.txt')
TRIPS=os.environ.get('TRIPS','trips.txt')
ROUTES=os.environ.get('ROUTES','routes.txt')
SHAPES=os.environ.get('SHAPES','shapes.txt')
MAIN=os.environ.get('MAIN','data-main.json')
AGENCY=os.environ.get('AGENCY','')
# CITIES ריק או "ALL" = כל הארץ; אחרת רשימת ערים מופרדת בפסיקים (מצב הניסוי המקורי)
_c=os.environ.get('CITIES','').strip()
CITIES=[] if _c in ('','ALL') else [c.strip() for c in _c.split(',')]

NEAR_M=10        # תחנה נחשבת "על המסלול" עד מרחק זה מהקו — אוטובוס בנתיב הנכון עובר
                 # 2-6 מ' מהעמוד; 15-25 מ' זה לרוב מיסעה מקבילה/דרך שירות (קרית גת)
ALONG_MIN=50     # הקו חייב ללוות את התחנה לאורך לפחות כך (מ׳) — מסנן חציית-צומת
SANDWICH_M=800   # תחנה עצורה לפני ואחרי בטווח זה לאורך המסלול
TURN_DEG=45      # פנייה חדה ליד התחנה (כיוון 50 מ' לפני מול 50 מ' אחרי) — אין איפה לעצור (32 בהרצל/מינץ)
AIR_MIN=120      # ואם הקו עוצר בתחנה אחרת עד כך בקו אווירי — אותו מקום (ההגנה 25638/25636), לא דילוג
SANDWICH_MIN=120 # אבל לא צמוד מדי — עצירה 40 מ' משם היא אותו צומת (עמדה סמוכה), לא דילוג
TERMINAL_M=300   # מתעלמים מקצוות המסלול (אזורי מסוף)
# קו מהיר שחולף בתחנה (בלי עצירה 800 מ' לפני ואחרי — מה שהסנדוויץ' פוסל). כדי שתחנות בכיכרות לא יחזרו:
EXP_STRAIGHT=30  # הכיוון לא משתנה ביותר מכך לאורך 100 מ' לפני ואחרי התחנה (בכיכר האוטובוס מסתובב)
EXP_SPAN=100
EXP_ALONG=100    # ליווי ארוך יותר מהרגיל
EXP_SAME_DIR=20  # קו אחר שעוצר בתחנה נוסע באותו כיוון (עד 20°), באותו צד ועד NEAR_M מהעמוד
EXP_WORDS=('צומת','מסעף','מחלף')   # קו מהיר נבדק רק בצמתים: תחנה שבשמה צומת/מסעף/מחלף
EXP_MIN_INTER=3  # ושעוצרים בה לפחות כך קווים בין-עירוניים/אזוריים (חוץ מהקו עצמו)
# תחנות שהן חלק ממסוף/תחנה מרכזית — לא מועמדות לדילוג: אוטובוס עוצר רק ברציף
# שלו וחולף ליד רציפים אחרים; זה תפעול תקין, לא דילוג (אותו כלל כמו בהתחנה הבאה)
TERM_WORDS=('מסוף','ת.מרכזית','ת. מרכזית','תחנה מרכזית','רציף','תפעולי')

def city(d):
    m=re.search(r'עיר:\s*(.*?)\s*רציף:', d or ''); return m.group(1).strip() if m else ''

# ---- תחנות ----
rows=list(csv.reader(open(STOPS,encoding='utf-8-sig')))
ix={h:i for i,h in enumerate(rows[0])}
SN,SD,SC,LA,LO,SI=ix['stop_name'],ix['stop_desc'],ix['stop_code'],ix['stop_lat'],ix['stop_lon'],ix['stop_id']
stops={}
for r in rows[1:]:
    if len(r)<=SD: continue
    c=city(r[SD])
    if CITIES and c not in CITIES: continue
    try: stops[r[SI]]={'code':r[SC],'name':r[SN],'city':c,'la':float(r[LA]),'lo':float(r[LO])}
    except: pass
print('תחנות בתחום הבדיקה:',len(stops),'(כל הארץ)' if not CITIES else '')

# ---- קווים ----
rroutes={}
for r in csv.DictReader(open(ROUTES,encoding='utf-8-sig')):
    rroutes[r['route_id']]={'num':r.get('route_short_name',''),'desc':r.get('route_desc',''),
                            'long':r.get('route_long_name',''),'agency':r.get('agency_id',''),
                            'rtype':r.get('route_type','3')}   # 3=אוטובוס, 0/2=רכבת/רק"ל
# סוג קו רשמי מהקובץ המצומצם (data-main.json — ההמרה של "מצומצם.xlsx" שקו פח משתמש בה):
# לכל שורה: [0]=מקט, [6]=סוג קו (עירוני/בינעירוני/אזורי), [7]=ייחודיות הקו (סדיר/תלמידים/לילה/מזינים)
import json
linetype={}; linesub={}; linedist={}
if MAIN and os.path.exists(MAIN):
    for r in json.load(open(MAIN,encoding='utf-8')):
        mk=str(r[0]).strip().lstrip('0')
        if mk:
            linetype[mk]=str(r[6]).strip(); linesub[mk]=str(r[7]).strip()
            linedist[mk]=str(r[5]).strip()   # מחוז
    print('קווים מהקובץ המצומצם:',len(linetype))
    print('ערכי סוג קו:',sorted(set(linetype.values())))
    print('ערכי ייחודיות:',sorted(set(linesub.values())))
else:
    print('אזהרה: אין קובץ מצומצם (data-main.json) — סינון סוג-קו לא יפעל')
def _makat(rid):
    return rroutes.get(rid,{}).get('desc','').split('-')[0].strip().lstrip('0')
def route_type(rid):
    return linetype.get(_makat(rid),'')
def route_sub(rid):
    return linesub.get(_makat(rid),'')
def route_dist(rid):
    return linedist.get(_makat(rid),'')
# שמות מפעילים מ-agency.txt (רשות)
agencies={}
if AGENCY and os.path.exists(AGENCY):
    for r in csv.DictReader(open(AGENCY,encoding='utf-8-sig')):
        agencies[r.get('agency_id','')]=r.get('agency_name','')

# הקווים שנבדקים: כל סוגי הקווים (עירוני/בינעירוני/אזורי — האתר מציג עירוני כברירת מחדל
# ומסנן לפי הסוג), חוץ מקווי תלמידים ושאטלי חנה-וסע. אוטובוס בלבד.
def line_ok(rid):
    if 'תלמיד' in route_sub(rid): return False  # קווי תלמידים עוצרים רק איפה שצריך
    if 'חנה וסע' in rroutes.get(rid,{}).get('long',''): return False  # שאטלים ישירים
    if rroutes.get(rid,{}).get('rtype','3')!='3': return False        # רק אוטובוס
    return True

# ---- נסיעות: נציג אחד לכל (קו, מסלול) — רק לקווים הנבדקים ----
trip2route={}; rep={}   # rep[(route_id,shape_id)] = trip_id נציג
for r in csv.DictReader(open(TRIPS,encoding='utf-8-sig')):
    trip2route[r['trip_id']]=r['route_id']
    key=(r['route_id'],r.get('shape_id',''))
    if r.get('shape_id') and key not in rep and line_ok(r['route_id']): rep[key]=r['trip_id']
rep_trips={t:k for k,t in rep.items()}
# ---- מצב דיבוג: DEBUG_LINE (מספר קו) ו-DEBUG_STOP (מק"ט) — מסביר למה קו לא נמצא מדלג על תחנה ----
DBG_LINE=os.environ.get('DEBUG_LINE',''); DBG_STOP=os.environ.get('DEBUG_STOP','')
if DBG_LINE:
    for rid,inf in rroutes.items():
        if inf['num']==DBG_LINE:
            print('DEBUG route',rid,inf['long'][:60],'| makat',_makat(rid),'| type',route_type(rid),'| sub',route_sub(rid),
                  '| line_ok',line_ok(rid),'| shapes',sorted(k[1] for k in rep if k[0]==rid))
print('נסיעות-נציג (קו×מסלול, קווים נבדקים):',len(rep))

# ---- עצירות: רצף התחנות של כל נציג + אילו קווים עוצרים בכל תחנת-עיר ----
served=defaultdict(list)          # trip נציג -> [(seq, stop_id)]
stop_lines=defaultdict(set)       # stop_id עירוני -> קווי אוטובוס שעוצרים בו
stop_rids=defaultdict(set)        # stop_id -> route_id של קווי האוטובוס שעוצרים בו
rail_stops=set()
with open(STOP_TIMES,encoding='utf-8-sig') as f:
    rd=csv.reader(f); hdr=next(rd); hi={h:i for i,h in enumerate(hdr)}
    TI,SIx,SQ=hi['trip_id'],hi['stop_id'],hi['stop_sequence']
    for r in rd:
        t=r[TI]
        if r[SIx] in stops:
            rt=trip2route.get(t)
            if rt and rroutes.get(rt,{}).get('rtype','3')=='3':
                stop_lines[r[SIx]].add(rroutes.get(rt,{}).get('num',''))
                stop_rids[r[SIx]].add(rt)
            elif rt: rail_stops.add(r[SIx])   # תחנת רכבת/רק"ל — לא מועמדת לדילוג-אוטובוס
        if t in rep_trips:
            try: served[t].append((int(r[SQ]),r[SIx]))
            except: pass
print('תחנות-עיר עם שירות:',len(stop_lines))

# ---- מסלולים (shapes): רק של הקווים הנבדקים (הסינון קוצץ את רוב הקובץ) ----
need_shapes={k[1] for k in rep}
shapes={}
with open(SHAPES,encoding='utf-8-sig') as f:
    rd=csv.reader(f); hdr=next(rd); hi={h:i for i,h in enumerate(hdr)}
    SH,SLA,SLO,SSQ=hi['shape_id'],hi['shape_pt_lat'],hi['shape_pt_lon'],hi['shape_pt_sequence']
    cur=None; pts=[]
    def flush():
        global cur,pts
        if cur and pts and cur in need_shapes: shapes[cur]=[p[1:] for p in sorted(pts)]
        cur=None; pts=[]
    for r in rd:
        sh=r[SH]
        if sh!=cur: flush(); cur=sh
        if sh not in need_shapes: continue
        try: pts.append((int(r[SSQ]),float(r[SLA]),float(r[SLO])))
        except: pass
    flush()
print('מסלולים רלוונטיים:',len(shapes))

# ---- גאומטריה ----
def meters(pts,la0):
    cl=math.cos(math.radians(la0))
    return [((lo)*111320*cl,(la)*110540) for la,lo in pts]
def point_at(shape_m,arc,d):
    import bisect
    d=max(0.0,min(arc[-1],d)); i=max(0,min(len(arc)-2,bisect.bisect_right(arc,d)-1))
    L=arc[i+1]-arc[i]; t=0 if L==0 else (d-arc[i])/L
    return (shape_m[i][0]+t*(shape_m[i+1][0]-shape_m[i][0]), shape_m[i][1]+t*(shape_m[i+1][1]-shape_m[i][1]))

def turn_at(shape_m,arc,pos,r=50):
    a,o,b=point_at(shape_m,arc,pos-r),point_at(shape_m,arc,pos),point_at(shape_m,arc,pos+r)
    h1=math.atan2(o[1]-a[1],o[0]-a[0]); h2=math.atan2(b[1]-o[1],b[0]-o[0])
    return abs((math.degrees(h2-h1)+180)%360-180)

def heading(shape_m,arc,pos,r=15):
    a,b=point_at(shape_m,arc,pos-r),point_at(shape_m,arc,pos+r)
    return math.atan2(b[1]-a[1],b[0]-a[0])
def angdiff(h1,h2): return abs((math.degrees(h2-h1)+180)%360-180)
def straightness(shape_m,arc,pos,span=EXP_SPAN,step=25):
    # הסטייה הגדולה ביותר של הכיוון לאורך ±span מהכיוון בתחנה
    h0=heading(shape_m,arc,pos)
    return max(angdiff(h0,heading(shape_m,arc,pos+d)) for d in range(-span,span+1,step))

def project(shape_m,arc,x,y):
    # המרחק המזערי מהקו + מיקום לאורך המסלול + צד (ימין=True)
    best=None
    for i in range(len(shape_m)-1):
        ax,ay=shape_m[i]; bx,by=shape_m[i+1]
        dx,dy=bx-ax,by-ay
        L2=dx*dx+dy*dy
        if L2==0: continue
        t=max(0.0,min(1.0,((x-ax)*dx+(y-ay)*dy)/L2))
        px,py=ax+t*dx,ay+t*dy
        d=math.hypot(x-px,y-py)
        if best is None or d<best[0]:
            cross=dx*(y-ay)-dy*(x-ax)   # שלילי = מימין לכיוון הנסיעה
            best=(d,arc[i]+t*math.sqrt(L2),cross<0,i)
    return best

# אינדקס-רשת לתחנות העיר — בודקים לכל מסלול רק תחנות שבקרבתו (ולא את כל העיר)
GRID=0.001
sgrid=defaultdict(list)
for sid,s in stops.items():
    sgrid[(int(s['la']/GRID),int(s['lo']/GRID))].append(sid)
def near_stop_ids(pts):
    out=set()
    for la,lo in pts:
        c=(int(la/GRID),int(lo/GRID))
        for dx in (-1,0,1):
            for dy in (-1,0,1): out.update(sgrid.get((c[0]+dx,c[1]+dy),()))
    return out

def debug_shape(rid,sh,info,m,arc,total,xy,served_arc,positions,servedset,pts):
    import bisect
    cen=[s for s in stops.values() if s['code']==DBG_STOP]
    print('DEBUG shape',rid,sh,info.get('long','')[:60],'| stops served',len(served_arc),'| length',round(total))
    if not cen: print('  DEBUG stop code',DBG_STOP,'not in stops (city filter?)'); return
    c=cen[0]; cx,cy=xy(c); near_ids=near_stop_ids(pts)
    for sid,s in stops.items():
        x,y=xy(s)
        if math.hypot(x-cx,y-cy)>250: continue
        p=project(m,arc,x,y); r=[]
        r.append('served' if sid in servedset else 'not-served')
        r.append('grid-near' if sid in near_ids else 'NOT-in-grid')
        r.append('active-lines=%d'%len(stop_lines.get(sid,())))
        if any(w in s['name'] for w in TERM_WORDS): r.append('TERM_WORD')
        if not p: r.append('no-projection')
        else:
            pos=p[1]; j=bisect.bisect_left(positions,pos)
            before=pos-positions[j-1] if j>0 else 1e9; after=positions[j]-pos if j<len(positions) else 1e9
            air=min((math.hypot(xy(stops[q])[0]-x,xy(stops[q])[1]-y) for _,q in served_arc[max(0,j-3):j+3] if q in stops),default=1e9)
            near=sum(math.hypot(m[i+1][0]-m[i][0],m[i+1][1]-m[i][1]) for i in range(len(m)-1)
                     if min(math.hypot(m[i][0]-x,m[i][1]-y),math.hypot(m[i+1][0]-x,m[i+1][1]-y))<=45)
            r.append('dist=%.0f(max %d)'%(p[0],NEAR_M)); r.append('right-side' if p[2] else 'LEFT-side')
            r.append('pos=%.0f/%.0f'%(pos,total)); r.append('before=%.0f after=%.0f (range %d..%d)'%(before,after,SANDWICH_MIN,SANDWICH_M))
            r.append('air=%.0f(min %d)'%(air,AIR_MIN)); r.append('turn=%.0f(max %d)'%(turn_at(m,arc,pos),TURN_DEG)); r.append('straight=%.0f(max %d, span %d)'%(straightness(m,arc,pos),EXP_STRAIGHT,EXP_SPAN)); r.append('along=%.0f(min %d)'%(near,ALONG_MIN))
            if sid in rail_stops: r.append('RAIL')
        print('  DEBUG stop',s['code'],s['name'],'|',' | '.join(r))

findings=[]
shape_stops={}   # (route_id, shape_id) -> תחנות העצירה לפי הסדר לאורך המסלול
for (rid,sh),t in rep.items():
    if sh not in shapes: continue
    ty=route_type(rid)   # סינון הקווים כבר נעשה ב-line_ok בשלב הנסיעות
    seq=[s for _,s in sorted(served.get(t,[]))]
    if len(seq)<5: continue
    pts=shapes[sh]
    la0=pts[0][0]
    m=meters(pts,la0)
    arc=[0.0]
    for i in range(len(m)-1): arc.append(arc[-1]+math.hypot(m[i+1][0]-m[i][0],m[i+1][1]-m[i][1]))
    total=arc[-1]
    cl=math.cos(math.radians(la0))
    def xy(s): return (s['lo']*111320*cl, s['la']*110540)
    # מיקומי התחנות העצורות לאורך המסלול (+ מזהה התחנה — לתצוגת "עוצר ב-X לפני")
    served_arc=[]
    servedset=set(seq)
    for sid in seq:
        s=stops.get(sid)
        if not s: continue
        p=project(m,arc,*xy(s))
        if p and p[0]<=60: served_arc.append((p[1],sid))
    served_arc.sort()
    if len(served_arc)<3: continue
    positions=[a for a,_ in served_arc]
    shape_stops[(rid,sh)]=[sid for _,sid in served_arc]   # סדר העצירות לאורך המסלול (לרשימה באתר)
    info=rroutes.get(rid,{})
    if DBG_LINE and info.get('num')==DBG_LINE and DBG_STOP: debug_shape(rid,sh,info,m,arc,total,xy,served_arc,positions,servedset,pts)
    # מועמדות: רק תחנות שבסמוך למסלול (אינדקס רשת), פעילות, שאינן ברצף העצירה
    for sid in near_stop_ids(pts):
        s=stops[sid]
        if sid in servedset or not stop_lines.get(sid): continue
        if any(w in s['name'] for w in TERM_WORDS): continue   # רציף במסוף — לא דילוג
        x,y=xy(s)
        p=project(m,arc,x,y)
        if not p or p[0]>NEAR_M or not p[2]: continue       # רחוק / בצד שמאל
        pos=p[1]
        if pos<TERMINAL_M or pos>total-TERMINAL_M: continue # אזור מסוף
        import bisect
        j=bisect.bisect_left(positions,pos)
        before=pos-positions[j-1] if j>0 else 1e9
        after=positions[j]-pos if j<len(positions) else 1e9
        express=SANDWICH_M<before<1e8 and SANDWICH_M<after<1e8   # קו מהיר: אין עצירה קרובה משני הצדדים (אבל יש עצירה בכל צד)
        if (before>SANDWICH_M or after>SANDWICH_M) and not express: continue
        if before<SANDWICH_MIN or after<SANDWICH_MIN: continue  # עמדה סמוכה באותו צומת
        # עצירה סמוכה בקו אווירי (המסלול מסתובב — המרחק לאורכו מטעה)
        air=min((math.hypot(xy(stops[q])[0]-x,xy(stops[q])[1]-y) for _,q in served_arc[max(0,j-3):j+3] if q in stops),default=1e9)
        if air<AIR_MIN: continue
        if turn_at(m,arc,pos)>TURN_DEG: continue            # פנייה חדה — לא מקום לעצור
        if express and straightness(m,arc,pos)>EXP_STRAIGHT: continue   # קו מהיר: רק נסיעה ישרה (לא כיכר)
        if sid in rail_stops: continue                       # תחנת רק"ל/רכבת
        # ליווי לאורך הרחוב: כמה מטרים מהמסלול נשארים קרוב לתחנה
        near=sum(math.hypot(m[i+1][0]-m[i][0],m[i+1][1]-m[i][1]) for i in range(len(m)-1)
                 if min(math.hypot(m[i][0]-x,m[i][1]-y),math.hypot(m[i+1][0]-x,m[i+1][1]-y))<=45)
        if near<(EXP_ALONG if express else ALONG_MIN): continue
        others=stop_lines[sid]-{info.get('num','')}
        if not others: continue
        # קטע המסלול סביב התחנה (למפה באתר): ±300 מ' לאורך הקו, מדולל עד 24 נקודות
        # (כיסוי ארצי — חוסכים נפח קובץ; המפה ממילא מתמקדת סביב התחנה)
        i0=bisect.bisect_left(arc,pos-300); i1=bisect.bisect_right(arc,pos+300)
        segp=pts[max(0,i0-1):i1+1]
        step=max(1,len(segp)//24)
        seg=[[round(a,5),round(b,5)] for a,b in segp[::step]]+([[round(segp[-1][0],5),round(segp[-1][1],5)]] if len(segp)%step!=1 else [])
        findings.append({'line':info.get('num',''),'agency':info.get('agency',''),'long':info.get('long',''),
                         'type':ty,'stop':s,'sid':sid,'dist':round(p[0]),'before':round(before),'after':round(after),
                         'bsid':served_arc[j-1][1],'asid':served_arc[j][1],'seg':seg,'shp':sh,'rid':rid,
                         'others':sorted(others),'air':round(air),
                         'express':express,'hd':heading(m,arc,pos) if express else 0})

# קו מהיר: נשאר רק אם קו אחר עוצר בתחנה הזו, ונוסע לידה באותו כיוון ובאותו צד — כלומר זו תחנה על הכביש
# ובכיוון של הקו המהיר (ולא תחנה ביציאה אחרת מכיכר, ברמפה מקבילה או בכיוון ההפוך)
stop_shapes=defaultdict(list)
for k,lst in shape_stops.items():
    for q in lst: stop_shapes[q].append(k)
_geo={}
def shape_geo(sh):
    if sh not in _geo:
        pts=shapes[sh]; m=meters(pts,pts[0][0]); arc=[0.0]
        for i in range(len(m)-1): arc.append(arc[-1]+math.hypot(m[i+1][0]-m[i][0],m[i+1][1]-m[i][1]))
        _geo[sh]=(m,arc,math.cos(math.radians(pts[0][0])))
    return _geo[sh]
kept=[]; exp_drop=0
for f in findings:
    if not f['express']: kept.append(f); continue
    s=f['stop']; via=None
    if not any(w in s['name'] for w in EXP_WORDS): exp_drop+=1; continue
    inter=sum(1 for r2 in stop_rids.get(f['sid'],()) if rroutes.get(r2,{}).get('num','')!=f['line'] and route_type(r2) in ('בינעירוני','אזורי'))
    if inter<EXP_MIN_INTER: exp_drop+=1; continue
    for rid2,sh2 in stop_shapes.get(f['sid'],()):
        num2=rroutes.get(rid2,{}).get('num','')
        if num2==f['line'] or sh2 not in shapes: continue
        m2,arc2,cl2=shape_geo(sh2)
        p2=project(m2,arc2,s['lo']*111320*cl2,s['la']*110540)
        if p2 and p2[0]<=NEAR_M and p2[2] and angdiff(f['hd'],heading(m2,arc2,p2[1]))<=EXP_SAME_DIR: via=num2; break
    if DBG_STOP and s['code']==DBG_STOP:
        print('DEBUG EXPCHECK',f['line'],s['code'],'| inter',inter,'| candidates',[(rroutes.get(r2,{}).get('num',''),sh2) for r2,sh2 in stop_shapes.get(f['sid'],())],
              '| all lines at stop',sorted((rroutes.get(r2,{}).get('num',''),route_type(r2),route_sub(r2)) for r2 in stop_rids.get(f['sid'],())))
        for rid2,sh2 in stop_shapes.get(f['sid'],()):
            if sh2 not in shapes: continue
            m2,arc2,cl2=shape_geo(sh2); p2=project(m2,arc2,s['lo']*111320*cl2,s['la']*110540)
            print('   DEBUG cand',rroutes.get(rid2,{}).get('num',''),'dist',round(p2[0]),'right',p2[2],'angdiff',round(angdiff(f['hd'],heading(m2,arc2,p2[1]))))
    if via: f['via']=via; kept.append(f)
    else: exp_drop+=1
print('קו מהיר: נשארו',sum(1 for f in kept if f['express']),'| נפסלו (לא צומת חשוב / אין קו אחר באותו כיוון):',exp_drop)
findings=kept
if DBG_LINE:
    for f in findings:
        if f['line']==DBG_LINE: print('DEBUG FOUND',f['line'],f['stop']['code'],f['stop']['name'],'express' if f['express'] else 'sandwich',f.get('via',''))
    import random; ex=[f for f in findings if f['express']]; random.seed(1)
    for f in random.sample(ex,min(40,len(ex))):
        print('DEBUG EXP sample | קו',f['line'],'|',f['stop']['name'],f['stop']['code'],f['stop']['city'],'| לפני',f['before'],'אחרי',f['after'],'| דרך קו',f['via'],'| https://maps.google.com/?q=%s,%s'%(f['stop']['la'],f['stop']['lo']))

# איחוד כפילויות (אותו קו ואותה תחנה בכמה חלופות) + דירוג
best={}
for f in findings:
    k=(f['line'],f['stop']['code'],f['type'])   # לפי מק"ט — תחנות כפולות באותו מק"ט מתאחדות
    if k not in best or f['before']+f['after']<best[k]['before']+best[k]['after']: best[k]=f
# (מק"ט, סוג קו) -> קווים מדלגים — עירוני ובין-עירוני לא מתערבבים, אבל סוג ריק
# נחשב עירוני (כמו באתר): אחרת קו בלי סוג יושב בדלי נפרד ולא "רואה" את שאר
# המדלגים על אותה תחנה (850 ליד 316 ברבי עקיבא, 96 ליד 27 העירוניים בבלינסון).
# המפתח לפי מק"ט ולא לפי stop_id — תחנות כפולות באותו מק"ט מתאחדות גם כאן.
skippers=defaultdict(set)
def _skkey(f): return (f['stop']['code'], f['type'] or 'עירוני')
# קו מהיר נשמר בנפרד ולא משפיע על הממצאים הרגילים (לא נספר ב"מדלגים על התחנה", לא בדירוג ולא ברשימה)
exp_best=[f for f in best.values() if f.get('express')]
reg_best=[f for f in best.values() if not f.get('express')]
for f in reg_best: skippers[_skkey(f)].add(f['line'])
skippers_exp=defaultdict(set)
for f in exp_best: skippers_exp[_skkey(f)].add(f['line'])
ranked=sorted(reg_best,key=lambda f:(len(skippers[_skkey(f)]),-len(f['others']),f['before']+f['after']))
ranked_exp=sorted(exp_best,key=lambda f:(-len(skippers_exp[_skkey(f)]),f['line']))
print()
print('=== ממצאים: קווים עירוניים שחולפים ליד תחנה פעילה בלי לעצור (סנדוויץ׳) ===')
print('סה"כ:',len(ranked))
for f in ranked[:40]:
    s=f['stop']
    print(' קו %s | %s | מדלג על: %s (%s) [%s] | מרחק מהקו %dמ | עוצר %dמ לפני ו-%dמ אחרי | מדלגים על התחנה: %d קווים | עוצרים בה: %s'%(
        f['line'],f['long'][:40],s['name'],s['code'],s['city'],f['dist'],f['before'],f['after'],len(skippers[_skkey(f)]),','.join(f['others'][:8])))

# ---- פלט JSON לאתר ----
OUT=os.environ.get('OUT','')
OUT2=os.environ.get('OUT2','')   # קווים לא-עירוניים — קובץ נפרד שנטען באתר רק לפי בקשה
if OUT:
    import datetime
    from collections import Counter
    def stop_ref(sid):
        s=stops.get(sid) or {}
        return {'n':s.get('name',''),'c':s.get('code',''),'la':round(s.get('la',0),5),'lo':round(s.get('lo',0),5)}
    def build(sub,skset=None):
        """בונה חבילת JSON עצמאית (ממצאים + מסלולים + רשימות תחנות) לתת-קבוצה של ממצאים.
        skset — מילון "מדלגים על התחנה" (לקווים המהירים: רק קווים מהירים אחרים)"""
        def item(f,sk):
            s=f['stop']
            return {
                'line':f['line'],'dest':f['long'],'city':s['city'],
                'stop':s['name'],'code':s['code'],'sid':f['sid'],
                'la':round(s['la'],5),'lo':round(s['lo'],5),
                'dist':f['dist'],'before':f['before'],'after':f['after'],
                'bstop':stop_ref(f['bsid']),'astop':stop_ref(f['asid']),
                'bsid':f['bsid'],'asid':f['asid'],'skey':f['rid']+'|'+f['shp'],
                'skippers':sorted(sk[_skkey(f)]),
                'ty':f['type'] or '',
                'others':f['others'][:12] if f.get('express') else f['others'],'onum':len(f['others']),
                'seg':f['seg'],'shp':f['shp'],
                'op':agencies.get(f['agency'],''),'mahoz':route_dist(f['rid']),
                'uniq':route_sub(f['rid']) or 'סדיר',
                **({'exp':1,'via':f.get('via','')} if f.get('express') else {}),
            }
        items=[item(f,skset if skset is not None else skippers) for f in sub]
        shp_out={}; shstops_out={}; stopsd={}
        for f in sub:
            sh=f['shp']
            if sh not in shp_out:
                p2=shapes.get(sh) or []
                st=max(1,len(p2)//80)
                dec=[[round(a,5),round(b,5)] for a,b in p2[::st]]
                if p2 and (len(p2)-1)%st!=0: dec.append([round(p2[-1][0],5),round(p2[-1][1],5)])
                shp_out[sh]=dec
            skey=f['rid']+'|'+f['shp']
            if skey in shstops_out: continue
            sl=shape_stops.get((f['rid'],f['shp'])) or []
            shstops_out[skey]=sl
            for sid in sl:
                if sid not in stopsd:
                    s2=stops.get(sid) or {}
                    stopsd[sid]=[s2.get('name',''),s2.get('code',''),round(s2.get('la',0),5),round(s2.get('lo',0),5)]
        ccnt=Counter(it['city'] for it in items if it['city'])
        return {'gen':datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d'),
                'cities':[c for c,_ in ccnt.most_common()],'total':len(items),'items':items,
                'shapes':shp_out,'shapestops':shstops_out,'stopsd':stopsd}
    urban=[f for f in ranked if (f['type'] or 'עירוני')=='עירוני']
    rest=[f for f in ranked if (f['type'] or 'עירוני')!='עירוני']
    os.makedirs(os.path.dirname(OUT) or '.',exist_ok=True)
    json.dump(build(urban),open(OUT,'w',encoding='utf-8'),ensure_ascii=False,separators=(',',':'))
    print('נכתב',OUT,'(%d ממצאים עירוניים)'%len(urban))
    if OUT2:
        json.dump(build(rest),open(OUT2,'w',encoding='utf-8'),ensure_ascii=False,separators=(',',':'))
        print('נכתב',OUT2,'(%d ממצאים לא-עירוניים)'%len(rest))
    # קו מהיר שחולף בצומת — קובץ שלישי, נפרד, שהאתר טוען רק כשלוחצים על הכפתור (שני הקבצים הקיימים לא משתנים)
    OUT3=os.environ.get('OUT3') or os.path.join(os.path.dirname(OUT) or '.','data-exp.json')
    json.dump(build(ranked_exp,skset=skippers_exp),open(OUT3,'w',encoding='utf-8'),ensure_ascii=False,separators=(',',':'))
    print('נכתב',OUT3,'(%d קווים מהירים בצמתים)'%len(ranked_exp))

