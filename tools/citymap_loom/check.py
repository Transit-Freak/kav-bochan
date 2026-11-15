# -*- coding: utf-8 -*-
# בדיקה אוטומטית של פלט LOOM מול הקלט. מחזיר {'lines':[...], 'alerts':[...]}.
# חמור (sev=2): קו שהוזן ולא מופיע בפלט; קו שמצויר בכמה חלקים מנותקים (נקטע).
# אזהרה (sev=1): קו עם מספר קצוות שאינו 0 או 2 (מתפצל); יחס אורך מצויר/מסלול מחוץ לטווח.
import math,collections
RATIO_LO,RATIO_HI=0.6,1.6
def _m(p,q): return math.hypot((p[1]-q[1])*110540,(p[0]-q[0])*94000)   # [lon,lat]
def check(g,fed):
    adj=collections.defaultdict(lambda: collections.defaultdict(set)); ln=collections.defaultdict(float)
    for f in g['features']:
        p=f['properties']
        if f['geometry']['type']!='LineString': continue
        c=f['geometry']['coordinates']; L=sum(_m(a,b) for a,b in zip(c,c[1:]))
        for l in p.get('lines',[]):
            k=(l.get('label'),l.get('color','').lower()); ln[k]+=L
            adj[k][p['from']].add(p['to']); adj[k][p['to']].add(p['from'])
    alerts=[]; lines=[]
    for r in fed:
        k=(r['num'],r['color'].lower()); row={'num':r['num'],'color':r['color'],'id':r['id'],'long':r['long'],'cls':r['cls']}
        if k not in adj:
            alerts.append({'sev':2,'line':r['num'],'msg':'קו שהוזן ולא מופיע בפלט'}); row['missing']=True; lines.append(row); continue
        a=adj[k]; seen=set(); comp=0
        for n in a:
            if n in seen: continue
            comp+=1; st=[n]
            while st:
                x=st.pop()
                if x in seen: continue
                seen.add(x); st.extend(a[x])
        ends=sum(1 for n in a if len(a[n])==1); ratio=ln[k]/r['len'] if r['len'] else 0
        row.update(ratio=round(ratio,2),ends=ends,parts=comp)
        if comp>1: alerts.append({'sev':2,'line':r['num'],'msg':'הקו נקטע: מצויר ב-%d חלקים מנותקים'%comp})
        elif ends not in (0,2): alerts.append({'sev':1,'line':r['num'],'msg':'%d קצוות (צפוי 2): הקו מתפצל'%ends})
        if not RATIO_LO<=ratio<=RATIO_HI: alerts.append({'sev':1,'line':r['num'],'msg':'אורך מצויר %.2f מאורך המסלול'%ratio})
        lines.append(row)
    return {'lines':lines,'alerts':alerts}
