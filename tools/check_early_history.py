#!/usr/bin/env python3
"""Verify that imported records, links, patterns and railway partitions are reachable."""
import gzip,json
from pathlib import Path
from import_early_history import OUT,read
from compact_lines import materialize

def main():
    progress=read(OUT/'early-progress.json',{'done':{}})
    cat={s['id']:s for s in read(OUT/'early-sources.json')['snapshots']}
    idx={l['rd'] for l in read(OUT/'lines.json')['lines']}
    for sid,summary in progress['done'].items():
        assert sid in cat
        routes=read(OUT/'early-routes'/(sid+'.json'))['routes']
        stops=json.loads(gzip.decompress((OUT/'early-stops'/(sid+'.json.gz')).read_bytes()))['stops']
        assert len(routes)==summary['routes'] and len(stops)==summary['stops']
        assert set(routes)<=idx, f'{sid}: routes missing from search index'
        for rd in routes:
            p=OUT/'lines'/(rd.replace('#','H').replace('/','_')+'.json');d=materialize(read(p))
            assert d['versions']==sorted(d['versions'],key=lambda v:v['d'])
            earlier=[v for v in d['versions'] if v.get('earlyFingerprint') and v['d']<=cat[sid]['date']]
            assert earlier,rd
            v=earlier[-1]
            data=json.loads(gzip.decompress((OUT/'early-patterns'/(v['earlyPatternsFile']+'.json.gz')).read_bytes()))
            for pattern in data:
                assert len(pattern['stops'])==len(pattern['boarding'])
                assert sum(len(s['departures']) for s in pattern['services'])==pattern['trips']
                assert all(-90<=s[2]<=90 and -180<=s[3]<=180 for s in pattern['stops'])
        print('Verified source',sid,len(routes),'routes',len(stops),'stops')
    rail=read(OUT/'early-rail/index.json')
    assert rail
    n=0
    for day in rail['days']:
        rows=json.loads(gzip.decompress((OUT/'early-rail'/(day+'.json.gz')).read_bytes()))['rows']
        n+=len(rows);assert all(len(r)==7 for r in rows)
    assert n==rail['records']
    print('Verified rail:',n,'records in',len(rail['days']),'days')
if __name__=='__main__':main()
