#!/usr/bin/env python3
"""Link recovered GTFS to existing מגיעים-2012 anchors conservatively.
No route identities are merged. Links remain explicit proposed matches.
"""
import collections,json,gzip
from pathlib import Path
from compact_lines import materialize
from import_early_history import read,write,OUT,ROOT

def main():
    old=collections.defaultdict(list)
    for p in (ROOT/'magihim-2012/data').glob('l*.json'):
        x=read(p);codes=set()
        for rt in x.get('routes',[]):
            for s in rt.get('stops',[]):
                if len(s)>4 and isinstance(s[4],list) and 0<len(s[4])<=3:codes.update(map(str,s[4]))
        if len(codes)>=5:old[str(x.get('no','')).lstrip('0')].append((p.stem[1:],codes))
    links=collections.defaultdict(list);n=0
    for p in (OUT/'lines').glob('archive2012r*.json'):
        lf=materialize(read(p));patterns=[]
        for v in lf['versions']:
            patterns.extend(v.get('earlyPatterns',[]) or (json.loads(gzip.decompress((OUT/'early-patterns'/(v['earlyPatternsFile']+'.json.gz')).read_bytes())) if v.get('earlyPatternsFile') else []))
        codes={s[0] for pat in patterns for s in pat['stops']}
        cand=[]
        for k,cs in old.get(str(lf['line']).lstrip('0'),[]):
            common=len(codes&cs);score=min(common/max(1,len(codes)),common/max(1,len(cs)))
            if common>=5 and score>=.8:cand.append((score,k))
        cand.sort(reverse=True)
        if cand and (len(cand)==1 or cand[0][0]-cand[1][0]>=.1):
            score,k=cand[0];links[k].append({'rd':lf['rd'],'line':lf['line'],'dest':lf['dest'],'overlap':round(score*100)})
            original=read(p);original['magihim2012Match']={'key':k,'overlap':round(score*100)};write(p,original);n+=1
    anchors=read(OUT/'anchor-2012.json',{}).get('anchors',{})
    for rd,a in anchors.items():
        p=OUT/'lines'/(rd.replace('#','H').replace('/','_')+'.json')
        if a.get('k') in links and p.exists():
            lf=read(p);lf['earlyRelated']=links[a['k']];write(p,lf)
    write(OUT/'early-2012-links.json',dict(links));print('Matched recovered variants',n,'existing 2012 keys',len(links))
if __name__=='__main__':main()
