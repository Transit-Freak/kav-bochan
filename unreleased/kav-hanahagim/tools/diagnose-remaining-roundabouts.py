import json,gzip,pathlib,math,bisect,collections
import argparse
ap=argparse.ArgumentParser(description='Read-only candidate scan; never fills exits.')
ap.add_argument('feed',type=pathlib.Path)
ap.add_argument('--out',type=pathlib.Path,default=pathlib.Path('remaining-diagnosis.json'))
a=ap.parse_args()
root=a.feed; missing=[];known=[]
def distance(a,b):return math.hypot((a[0]-b[0])*110540,(a[1]-b[1])*95000)
def point(pts,cum,d):
 d=max(0,min(d,cum[-1]));i=min(len(pts)-1,max(1,bisect.bisect_left(cum,d)));t=(d-cum[i-1])/(cum[i]-cum[i-1] or 1)
 return [pts[i-1][k]+(pts[i][k]-pts[i-1][k])*t for k in (0,1)]
for path in root.joinpath('routes').glob('*.gz'):
 r=json.load(gzip.open(path));pts=r['geom'];cum=[0]
 if len(pts)<2:continue
 for a,b in zip(pts,pts[1:]):cum.append(cum[-1]+distance(a,b))
 for m in r['maneuvers']:
  if m['kind']!='roundabout':continue
  d=m['f']*cum[-1];entry=point(pts,cum,d)
  x={'route':r['id'],'line':r['shortName'],'name':r['longName'],'f':m['f'],'exit':m.get('exit'),'entry':entry,'edge':min(d,cum[-1]-d), 'samples':[point(pts,cum,d+o) for o in range(-100,251,10)]}
  (known if m.get('exit') else missing).append(x)
index=collections.defaultdict(list)
for k in known:index[(round(k['entry'][0]*10000),round(k['entry'][1]*10000))].append(k)
results=[]
for m in missing:
 la,lo=(round(v*10000) for v in m['entry']);matches=[]
 for i in range(la-2,la+3):
  for j in range(lo-2,lo+3):
   for k in index[(i,j)]:
    if k['route']==m['route'] or min(k['edge'],m['edge'])<250:continue
    errors=[distance(a,b) for a,b in zip(m['samples'],k['samples'])]
    if max(errors)<=5:matches.append({'route':k['route'],'exit':k['exit'],'max_error_m':round(max(errors),2)})
 results.append({k:v for k,v in m.items() if k!='samples'}|{'matches':matches})
summary={'missing':len(missing),'route_variants':len(set(m['route'] for m in missing)),'near_route_end_under_100m':sum(m['edge']<100 for m in missing),'with_same_path_reference':sum(bool(m['matches']) for m in results),'unambiguous_same_path':sum(len(set(k['exit'] for k in m['matches']))==1 for m in results)}
print(json.dumps(summary));print(json.dumps([m for m in results if m['matches']][:4],ensure_ascii=False))
a.out.write_text(json.dumps({'summary':summary,'cases':results},ensure_ascii=False))
