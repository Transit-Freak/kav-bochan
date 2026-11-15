# -*- coding: utf-8 -*-
# עיבוד אחרי LOOM: שמות אופקיים בגופן עברי רק למסופים/מרכזית/רכבת, תגי מספר בצבע הקו בקצות הקווים,
# מחיקת סמני תחנות שאינן מרכז תחבורה, ובדיקה אוטומטית (check.py).
# שימוש: post.py <svg גולמי> <גרף octi (GeoJSON)> <svg פלט> <תיקיית ה-GTFS הקטן> [<דוח JSON>]
import re,sys,json,math,collections,os
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import check
svg,gj,out,gdir=sys.argv[1:5]
hubf=os.path.join(gdir,'hubs.txt')
HUBN=set(open(hubf,encoding='utf-8').read().split('\n')) if hubf and os.path.exists(hubf) else None
s=open(svg,encoding='utf-8').read(); d=json.load(open(gj,encoding='utf-8'))
W,H=map(float,re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"',s).groups())
lo0,la0,lo1,la1=map(float,re.search(r'latlng-box="([^"]+)"',s).group(1).split(','))
my=lambda la: math.log(math.tan(math.pi/4+math.radians(la)/2))
def xy(lo,la): return ((lo-lo0)/(lo1-lo0)*W, (my(la1)-my(la))/(my(la1)-my(la0))*H)
nodes={};deg=collections.defaultdict(lambda: collections.defaultdict(int));lab={};col={}
for f in d['features']:
    p=f['properties']
    if f['geometry']['type']=='Point': nodes[p['id']]=(xy(*f['geometry']['coordinates']),p.get('station_label'))
    else:
        for l in p.get('lines',[]):
            deg[l['id']][p['from']]+=1; deg[l['id']][p['to']]+=1; lab[l['id']]=l.get('label','?'); col[l['id']]=l.get('color','000000')
# נקודות הציור (להערכת כיסוי) — כל הקואורדינטות של הקווים ב-SVG
pts=[(float(a),float(b)) for m in re.finditer(r'class="transit-edge[^"]*" points="([^"]+)"',s) for a,b in re.findall(r'([\d.]+),([\d.]+)',m.group(1))][::3]
occ=[]
def cover(x,y,w,h): return sum(1 for a,b in pts if abs(a-x)<w/2+1 and abs(b-y)<h/2+1)+50*sum(1 for ox,oy,ow,oh in occ if abs(x-ox)<(w+ow)/2 and abs(y-oy)<(h+oh)/2)
fs=max(6.0,W/75); add=[]
# קצות קווים: צומת שבו הקו נמצא על קשת אחת
ends=collections.defaultdict(list)
for l,dg in deg.items():
    for n in [n for n,c in dg.items() if c==1]: ends[n].append(l)
def place(x,y,w,h,gap):
    c=[(x+gap+w/2,y),(x-gap-w/2,y),(x,y-gap-h/2),(x,y+gap+h/2),(x+gap+w/2,y-h),(x-gap-w/2,y-h),(x+gap+w/2,y+h),(x-gap-w/2,y+h)]
    c=[q for q in c if w/2<q[0]<W-w/2 and h/2<q[1]<H-h/2] or c[:1]
    b=min(c,key=lambda q:cover(q[0],q[1],w,h)); occ.append((b[0],b[1],w,h)); return b
# שמות: רק לתחנות שהוזנו (מסופים/מרכזית/רכבת/קצות קווים), אופקיים, עם הילה לבנה
for nid,((x,y),name) in nodes.items():
    if not name or (HUBN is not None and name.strip() not in HUBN): continue
    w=len(name)*fs*0.56+4; bx,by=place(x,y,w,fs*1.3,fs*1.1)
    add.append(f'<text x="{bx:.1f}" y="{by+fs*0.35:.1f}" text-anchor="middle" font-size="{fs:.1f}" font-weight="800" fill="#1e3a8a" stroke="#fff" stroke-width="{fs*0.35:.1f}" paint-order="stroke" style="direction:rtl">{name}</text>')
# תגי מספר בצבע הקו ליד כל קצה, בשורה אחת לכל מסוף
bh=fs*1.25
for nid,ls in ends.items():
    (x,y),_=nodes[nid]; ls.sort(key=lambda l:(int(re.match(r'\d+',lab[l]).group(0)) if re.match(r'\d+',lab[l]) else 999,lab[l]))
    ws=[len(lab[l])*fs*0.62+fs*0.7 for l in ls]; tw=sum(ws)+1.5*(len(ls)-1)
    bx,by=place(x,y,tw,bh,fs*1.1); cx=bx-tw/2
    for l,w in zip(ls,ws):
        add.append(f'<g class="line-tag line-{lab[l]}"><rect x="{cx:.1f}" y="{by-bh/2:.1f}" width="{w:.1f}" height="{bh:.1f}" rx="{fs*0.3:.1f}" fill="#{col[l]}" stroke="#fff" stroke-width="0.6"/><text x="{cx+w/2:.1f}" y="{by+fs*0.33:.1f}" text-anchor="middle" font-size="{fs*0.9:.1f}" font-weight="900" fill="#fff">{lab[l]}</text></g>')
        cx+=w+1.5
s=re.sub(r'<text class="station-label".*?</text>','',s,flags=re.S)
# transitmap נותן לכל קו class של מספר סידורי (line-N). מחליפים אותו במספר הקו (line-<מספר>) לפי צבע הקו,
# כדי שהדף יוכל להדגיש קו בלחיצה. הצבעים ייחודיים לכל קו (make_gtfs.py).
fed=json.load(open(os.path.join(gdir,'lines.json'),encoding='utf-8')); c2n={r['color'].lower():r['num'] for r in fed}
n2num={m.group(1):c2n[m.group(2).lower()] for m in re.finditer(r'class="[^"]*\bline-(\d+)"[^>]*?stroke:#([0-9a-fA-F]{6})',s) if m.group(2).lower() in c2n}
unk=set(re.findall(r'class="[^"]*\bline-(\d+)"',s))-set(n2num)
s=re.sub(r'(class="[^"]*\bline-)(\d+)"',lambda m:m.group(1)+n2num.get(m.group(2),'x'+m.group(2))+'"',s)
# סימון תחנה נשאר רק למסופים/מרכזית/רכבת: מלבן של תחנת עוגן (או של כל תחנה אחרת) נמחק
if HUBN is not None:
    hp=[xy_ for xy_,nm in nodes.values() if nm and nm.strip() in HUBN]
    def keep_poly(m):
        c=[(float(a),float(b)) for a,b in re.findall(r'([\d.]+),([\d.]+)',m.group(1))]
        x0,x1=min(q[0] for q in c)-2.5,max(q[0] for q in c)+2.5; y0,y1=min(q[1] for q in c)-2.5,max(q[1] for q in c)+2.5
        return m.group(0) if any(x0<=x<=x1 and y0<=y<=y1 for x,y in hp) else ''
    s=re.sub(r'<polygon class="station-poly"[^>]*points="([^"]+)"[^>]*/>',keep_poly,s)
s=re.sub(r'font-family="[^"]*"','font-family="Assistant, Heebo, Arial, sans-serif"',s)
s=s.replace('</svg>','<g font-family="Assistant, Heebo, Arial, sans-serif">'+''.join(add)+'</g></svg>')
open(out,'w',encoding='utf-8').write(s)
rep=check.check(d,fed)
if unk: rep['alerts'].append({'sev':2,'line':'-','msg':'%d קווים ב-SVG בלי זיהוי (class)'%len(unk)})
for r in rep['lines']:
    if r['num'] not in n2num.values() and not r.get('missing'): rep['alerts'].append({'sev':2,'line':r['num'],'msg':'הקו לא מזוהה ב-SVG (אי אפשר להדגיש אותו)'})
if len(sys.argv)>5: json.dump(rep,open(sys.argv[5],'w',encoding='utf-8'),ensure_ascii=False)
print('שמות:',sum(1 for v in nodes.values() if v[1] and (HUBN is None or v[1].strip() in HUBN)),'| תגים:',sum(len(v) for v in ends.values()),'| התרעות:',len(rep['alerts']))
