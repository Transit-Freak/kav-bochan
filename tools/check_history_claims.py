#!/usr/bin/env python3
"""Fail publication if a stored addition/removal contradicts observed stop lists."""
import json
from pathlib import Path
from compact_lines import materialize

def check(data):
    bad=[];count=0;files=0
    for path in sorted((data/'lines').glob('*.json')):
        lf=materialize(json.loads(path.read_text()));previous=None;files+=1
        for v in sorted(lf.get('versions',[]),key=lambda v:v['d']):
            st=v.get('stops') or []
            if not st:continue
            cur={str(s[0]) for s in st};count+=1
            if v.get('src')=='websiteArchive':
                if v['k']!='snapshot' or any(v.get(k) for k in ('add','rem','ac','rc','shp','shpref')):
                    bad.append({'rd':lf['rd'],'d':v['d'],'reason':'Website observation labelled as a change or borrowed route'})
            if previous is not None:
                added={str(c) for c in v.get('ac',[]) if c is not None}
                removed={str(c) for c in v.get('rc',[]) if c is not None}
                if added-(cur-previous) or removed-(previous-cur):
                    bad.append({'rd':lf['rd'],'d':v['d'],'reason':'Stored addition/removal contradicts previous observed state'})
            previous=cur
    result={'filesChecked':files,'versionsChecked':count,'invalidClaims':bad}
    if bad:raise RuntimeError(json.dumps(result,ensure_ascii=False))
    return result

if __name__=='__main__':
    data=Path(__file__).resolve().parents[1]/'line-history/data'
    result=check(data)
    (data/'history-claims-check.json').write_text(json.dumps(result,ensure_ascii=False))
    print(result)
