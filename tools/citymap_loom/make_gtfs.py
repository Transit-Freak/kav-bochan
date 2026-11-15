# -*- coding: utf-8 -*-
# בונה GTFS קטן מקובץ עיר של citymap.py (הקווים של רמה אחת), כקלט ל-LOOM.
# שימוש: python3 make_gtfs.py <קובץ עיר> <תיקיית פלט> <internal|metro|all> ['<הגדרות JSON>']
# ההגדרות (ראו cities.yml): hubs_only, clean, anchor, merge_hubs, skip_lines, cut_boxes.
import json,sys,os,csv,re,math
PAL=['c2185b','00acc1','2e7d32','f9a825','1565c0','d32f2f','7b1fa2','00897b','5d4037','455a64','e91e63']
KEEP={'internal':('internal',),'metro':('internal','metro'),'all':('internal','metro','pass')}
HUB=re.compile(r'מסוף|רכבת|מרכזית')
def nk(n):
    m=re.match(r'(\d+)',n); return (int(m.group(1)) if m else 999,n)
def _m(p,q): return math.hypot((p[0]-q[0])*110540,(p[1]-q[1])*94000)
def plen(pts): return sum(_m(a,b) for a,b in zip(pts,pts[1:]))
def despur(pts):
    # מוחק הלוך-וחזור ולולאות קצרות: כשהמסלול חוזר לעד 35 מ' מנקודה קודמת אחרי 80-600 מ' נסיעה, הקטע שביניהן נמחק
    m=[(p[0]*110540,p[1]*94000) for p in pts]; out=[]; i=0; n=len(pts)
    while i<n:
        out.append(pts[i]); best=None; acc=0.0
        for j in range(i+1,n):
            acc+=math.hypot(m[j][0]-m[j-1][0],m[j][1]-m[j-1][1])
            if acc>600: break
            if acc>=80 and math.hypot(m[j][0]-m[i][0],m[j][1]-m[i][1])<35: best=j
        i=best+1 if best else i+1
    return out
def build(src,out,tier,cfg):
    HUBS=cfg.get('hubs_only',True); CLEAN=cfg.get('clean',True); ANCHOR=cfg.get('anchor',700)
    MERGE=cfg.get('merge_hubs','name')          # name: כל הרציפים עם אותו שם = תחנה אחת (במקום של הראשון) | centroid: אותו דבר, במרכז הכובד | none: בלי איחוד
    skip={str(x) for x in cfg.get('skip_lines',[])}
    boxes=cfg.get('cut_boxes',[])               # [דרום,מערב,צפון,מזרח]: נקודות מסלול ותחנות ביניים בתוך התיבה נמחקות
    inbox=lambda la,lo: any(b[0]<=la<=b[2] and b[1]<=lo<=b[3] for b in boxes)
    d=json.load(open(src,encoding='utf-8'))
    lines=sorted((L for L in d['lines'] if L['cls'] in KEEP[tier] and L['num'] not in skip),key=lambda L:(nk(L['num']),L['id']))
    os.makedirs(out,exist_ok=True)
    def w(name,hdr,rows):
        with open(os.path.join(out,name),'w',encoding='utf-8',newline='') as f:
            cw=csv.writer(f); cw.writerow(hdr); cw.writerows(rows)
    w('agency.txt',['agency_id','agency_name','agency_url','agency_timezone'],[['1','x','http://example.com','Asia/Jerusalem']])
    w('calendar.txt',['service_id','monday','tuesday','wednesday','thursday','friday','saturday','sunday','start_date','end_date'],[['1',1,1,1,1,1,1,1,'20260101','20271231']])
    stops={};routes=[];trips=[];st=[];shapes=[];hubnames=set();meta=[];plat={}
    for i,L in enumerate(lines):
        rid='r'+str(L['id']); col=PAL[i%len(PAL)]
        k=i//len(PAL)          # צבע ייחודי לכל קו (הבדל שלא נראה לעין), כדי ש-post.py יזהה כל קו ב-SVG לפי הצבע
        if k: b=int(col[4:],16); col=col[:4]+'%02x'%(b+k if b+k<=255 else b-k)
        routes.append([rid,'1',L['num'],L['long'][:60],3,col,'FFFFFF'])
        trips.append([rid,'1','t'+rid,'s'+rid])
        sh=L.get('exact') or [[q[0],q[1]] for q in L['path']]
        if CLEAN: sh=despur(sh)
        if boxes: sh=[p for p in sh if not inbox(p[0],p[1])]
        meta.append({'num':L['num'],'color':col,'id':L['id'],'long':L['long'],'cls':L['cls'],'len':round(plen(sh))})
        for j,p in enumerate(sh): shapes.append(['s'+rid,p[0],p[1],j])
        cum=[0.0]
        for p,q in zip(L['stops'],L['stops'][1:]): cum.append(cum[-1]+_m((p[2],p[3]),(q[2],q[3])))
        jj=0; mine=[]; last=-1e9; n=len(L['stops'])
        for j0,s in enumerate(L['stops']):
            end=(j0==0 or j0==n-1); hub=end or bool(HUB.search(s[0]))
            if not end and inbox(s[2],s[3]): continue
            # תחנות עוגן כל ~700 מ' נשארות בקלט (בלי סימון ובלי שם במפה) כדי ש-LOOM ישמור על צורת המסלול
            if HUBS and not hub and cum[j0]-last<ANCHOR: continue
            last=cum[j0]
            name=re.sub(r'/.*$','',s[0])
            key=('hub',name) if (HUB.search(s[0]) and MERGE!='none') else (s[1] or s[0],s[2],s[3])
            if key not in stops: stops[key]=['p%d'%len(stops),name,s[2],s[3]]
            if key[0]=='hub': plat.setdefault(key,set()).add((s[2],s[3]))
            sid=stops[key][0]
            if HUBS and hub: hubnames.add(name.strip())
            if mine and mine[-1]==sid: continue   # שני רציפים רצופים של אותו מרכז
            mine.append(sid)
            t='%02d:%02d:00'%(6+(jj*2)//60,(jj*2)%60); st.append(['t'+rid,t,t,sid,jj]); jj+=1
    if MERGE=='centroid':
        for k,ps in plat.items():
            stops[k][2]=sum(p[0] for p in ps)/len(ps); stops[k][3]=sum(p[1] for p in ps)/len(ps)
    open(os.path.join(out,'hubs.txt'),'w',encoding='utf-8').write('\n'.join(sorted(hubnames)))
    json.dump(meta,open(os.path.join(out,'lines.json'),'w',encoding='utf-8'),ensure_ascii=False)
    w('routes.txt',['route_id','agency_id','route_short_name','route_long_name','route_type','route_color','route_text_color'],routes)
    w('trips.txt',['route_id','service_id','trip_id','shape_id'],trips)
    w('stop_times.txt',['trip_id','arrival_time','departure_time','stop_id','stop_sequence'],st)
    w('stops.txt',['stop_id','stop_name','stop_lat','stop_lon'],list(stops.values()))
    w('shapes.txt',['shape_id','shape_pt_lat','shape_pt_lon','shape_pt_sequence'],shapes)
    return len(lines),len(stops)
if __name__=='__main__':
    print('%d קווים, %d תחנות'%build(sys.argv[1],sys.argv[2],sys.argv[3],json.loads(sys.argv[4]) if len(sys.argv)>4 else {}))
