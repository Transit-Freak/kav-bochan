"""Print a complete review batch, with exact source and unit indexes; no truncation."""
import argparse,json,pathlib
from package_pipeline import CACHE,STATE
from extract_documents import read
p=argparse.ArgumentParser();p.add_argument('tender');p.add_argument('document');p.add_argument('--start',type=int,default=0);p.add_argument('--count',type=int,default=8);a=p.parse_args()
d=read(STATE,{})['tenders'][a.tender]['documents'][a.document]
u=json.loads((CACHE/d['sha256']/'units.json').read_text())['units']
print(json.dumps({'tenderId':a.tender,'documentKey':a.document,'sha256':d['sha256'],'url':d['url']},ensure_ascii=False))
for n in range(a.start,min(a.start+a.count,len(u))):
 print(json.dumps({'index':n,**{k:v for k,v in u[n].items() if k not in ('layout','rows')}},ensure_ascii=False))
