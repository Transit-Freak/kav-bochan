"""Index towns served by each historical route, with dated service intervals.
Derives from dated stop-line events and recorded stop towns; never joins routes
by public number or license prefix. Interval ends are exclusive.
"""
import collections,datetime,glob,json,os

def read(p,default):
 try:
  with open(p,encoding='utf-8') as f:return json.load(f)
 except FileNotFoundError:return default

def merge(spans):
 out=[]
 for a,b in sorted(spans):
  if a>=b:continue
  if out and a<=out[-1][1]:out[-1][1]=max(out[-1][1],b)
  else:out.append([a,b])
 return out

def build(outdir):
 hist=read(outdir+'/stops-hist.json',{});seed=read(outdir+'/stop-city-seed-2012.json',{})
 cityspans={};FOREVER='9999-12-31'
 for code in set(hist)|set(seed):
  observations=[]
  if code in seed:observations.append(('2012-07-07',seed[code]))
  for v in hist.get(code,[]):
   if v.get('d') and v.get('t'):observations.append((v['d'],v['t']))
  timeline={d:c for d,c in sorted(observations)};spans=[];prev=None;start=None
  for d,c in sorted(timeline.items()):
   if c==prev:continue
   if prev:spans.append((start,d,prev))
   start,prev=d,c
  if prev:spans.append((start,FOREVER,prev))
  cityspans[code]=spans
 routecity=collections.defaultdict(list);unknown=0
 def add(rd,code,a,b):
  if rd.startswith('archive2012r'):b=min(b,'2012-07-22')
  for ca,cb,c in cityspans.get(code,[]):
   lo,hi=max(a,ca),min(b,cb)
   if lo<hi:routecity[rd,c].append((lo,hi))
 for p in sorted(glob.glob(outdir+'/stopev/*.json')):
  for code,s in read(p,{}).items():
   if code not in cityspans:unknown+=1;continue
   events=collections.defaultdict(list)
   for e in s.get('ev',[]):
    if len(e)>=4:events[e[2]].append((e[0],e[3]))
   for rd,es in events.items():
    start=None
    for d,k in sorted(es,key=lambda e:(e[0],0 if e[1] in ('out','mvout') else 1)):
     if k in ('base','in','mvin'):
      if start is None:start=d
     elif k in ('out','mvout') and start is not None:add(rd,code,start,d);start=None
    if start is not None:add(rd,code,start,FOREVER)
 names=sorted({c for rd,c in routecity});ids={c:i for i,c in enumerate(names)};routes=collections.defaultdict(list)
 epoch=datetime.date(2012,1,1)
 def day(d):return (datetime.date.fromisoformat(d)-epoch).days
 for (rd,c),spans in sorted(routecity.items()):
  for a,b in merge(spans):routes[rd].append([ids[c],day(a),None if b==FOREVER else day(b)])
 result={'epoch':'2012-01-01','cities':names,'routes':routes}
 tmp=outdir+'/route-cities.json.tmp'
 with open(tmp,'w',encoding='utf-8') as f:json.dump(result,f,ensure_ascii=False,separators=(',',':'))
 os.replace(tmp,outdir+'/route-cities.json')
 # The browser loads both shards; rebuild them atomically with every data refresh.
 for shard in range(2):
  part={**result,'routes':{rd:routes[rd] for i,rd in enumerate(sorted(routes)) if i%2==shard}}
  dest=outdir+'/route-cities-'+str(shard)+'.json'
  with open(dest+'.tmp','w',encoding='utf-8') as f:json.dump(part,f,ensure_ascii=False,separators=(',',':'))
  os.replace(dest+'.tmp',dest)
 print('City search:' ,len(routes),'routes,',len(names),'towns;',unknown,'stops without a recorded town')
 return result
if __name__=='__main__':build(os.environ.get('OUTDIR','line-history/data'))
