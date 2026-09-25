"""Build display-only 2012 groups. Never replace route IDs or infer license numbers.
Usage: python build_groups.py output.json regional-feed.zip [...]
Every pair in a group must share agency, line, endpoint cities, nearby endpoints,
and >=35% spatial stop overlap on the shorter representative stop pattern.
"""
import sys,json,zipfile,csv,io,collections,math,re
routes={};agencies={};stops={};trips={};seqs={}
def read(z,n):return csv.DictReader(io.TextIOWrapper(z.open(n),encoding='utf-8-sig'))
for path in sys.argv[2:]:
 with zipfile.ZipFile(path) as z:
  for name,d,key in [('routes.txt',routes,'route_id'),('agency.txt',agencies,'agency_id'),('stops.txt',stops,'stop_id'),('trips.txt',trips,'trip_id')]:
   for r in read(z,name):
    if r[key] in d:assert d[r[key]]==r,(name,r[key])
    d[r[key]]=r
  ss=collections.defaultdict(list)
  for r in read(z,'stop_times.txt'):ss[r['trip_id']].append((int(r['stop_sequence']),r['stop_id']))
  for tid,vals in ss.items():
   seq=tuple(s for _,s in sorted(vals))
   if tid in seqs:assert seqs[tid]==seq
   seqs[tid]=seq
patterns=collections.defaultdict(collections.Counter)
for tid,seq in seqs.items():patterns[trips[tid]['route_id']][seq]+=1
norm=lambda s:re.sub(r'\s+',' ',s.strip())
def cities(r):
 parts=r['route_long_name'].split('<->')
 if len(parts)!=2 or any('-' not in p for p in parts):return None
 return tuple(sorted(norm(p.rsplit('-',1)[-1]) for p in parts))
def dist(a,b):
 a,b=stops[a],stops[b];return math.hypot((float(a['stop_lat'])-float(b['stop_lat']))*111320,(float(a['stop_lon'])-float(b['stop_lon']))*94400)
represent={k:sorted(v,key=lambda p:(-v[p],p))[0] for k,v in patterns.items() if v}
def compatible(a,b):
 aa,bb=represent[a],represent[b]
 ends=min(max(dist(aa[0],bb[0]),dist(aa[-1],bb[-1])),max(dist(aa[0],bb[-1]),dist(aa[-1],bb[0])))
 if ends>1200:return False
 aa,bb=set(aa),set(bb)
 if len(aa)>len(bb):aa,bb=bb,aa
 return sum(any(dist(x,y)<=400 for y in bb) for x in aa)/len(aa)>=.35
buckets=collections.defaultdict(list)
for rid,r in routes.items():
 cs=cities(r)
 if cs and rid in represent:buckets[(r['agency_id'],r['route_short_name'],cs)].append(rid)
result=[];singles=0
for (agency,line,cs),ids in sorted(buckets.items()):
 clusters=[]
 for rid in sorted(ids,key=int):
  targets=[g for g in clusters if all(compatible(rid,x) for x in g)]
  if len(targets)==1:targets[0].append(rid)
  else:clusters.append([rid])
 for group in clusters:
  if len(group)<2:singles+=1;continue
  assert all(compatible(a,b) for i,a in enumerate(group) for b in group[i+1:])
  result.append({'op':agencies[agency]['agency_name'].strip(),'line':line,'cities':cs,'members':[[rid,stops[represent[rid][0]]['stop_name'].strip(),stops[represent[rid][-1]]['stop_name'].strip()] for rid in group]})
json.dump({'source':'miu-2012-07','groups':result},open(sys.argv[1],'w'),ensure_ascii=False,separators=(',',':'))
print('routes',len(routes),'groups',len(result),'grouped records',sum(len(g['members']) for g in result),'singletons',singles)
for g in result:
 if g['line']=='46' and g['op']=='קווים':print(g)
