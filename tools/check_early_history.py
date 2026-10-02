#!/usr/bin/env python3
"""Verify that imported records, links, patterns and railway partitions are reachable."""
import gzip,json,sys
from pathlib import Path
from import_early_history import OUT,read
from compact_lines import materialize

def main():
    website_only='--websites-only' in sys.argv
    progress=read(OUT/'early-progress.json',{'done':{}})
    cat={s['id']:s for s in read(OUT/'early-sources.json')['snapshots']}
    idx={l['rd'] for l in read(OUT/'lines.json')['lines']}
    required={}
    for sid,summary in progress['done'].items():
        assert sid in cat
        if website_only and cat[sid]['kind']!='websiteArchive':continue
        routes=read(OUT/'early-routes'/(sid+'.json'))['routes']
        if cat[sid]['kind']=='websiteArchive':
            assert len(routes)==summary['routes'] and set(routes)<=idx
            for rd in routes:
                d=materialize(read(OUT/'lines'/(rd+'.json')))
                assert any(v['d']==cat[sid]['date'] and v['src']=='websiteArchive' for v in d['versions'])
                assert all(v['k']=='snapshot' and not v.get('add') and not v.get('rem') and not v.get('shp') for v in d['versions'])
            continue
        stops=json.loads(gzip.decompress((OUT/'early-stops'/(sid+'.json.gz')).read_bytes()))['stops']
        assert len(routes)==summary['routes'] and len(stops)==summary['stops']
        assert set(routes)<=idx, f'{sid}: routes missing from search index'
        for rd in routes:
            required.setdefault(rd,set()).add(cat[sid]['date'])
        print('Verified source',sid,len(routes),'routes',len(stops),'stops')
    if website_only:
        print('Verified all published website snapshots')
        return
    checked=set()
    for rd,dates in required.items():
        p=OUT/'lines'/(rd.replace('#','H').replace('/','_')+'.json');d=materialize(read(p))
        assert d['versions']==sorted(d['versions'],key=lambda v:v['d'])
        earlier=[v for v in d['versions'] if v.get('earlyFingerprint')]
        assert earlier and min(v['d'] for v in earlier)<=min(dates),rd
        for v in earlier:
            key=v['earlyPatternsFile']
            if key in checked:continue
            checked.add(key)
            data=json.loads(gzip.decompress((OUT/'early-patterns'/key[:2]/(key+'.json.gz')).read_bytes()))
            for pattern in data:
                assert len(pattern['stops'])==len(pattern['boarding'])
                assert sum(len(s['departures']) for s in pattern['services'])==pattern['trips']
                assert all(-90<=s[2]<=90 and -180<=s[3]<=180 for s in pattern['stops'])
                if 'timeProfiles' in pattern:
                    assert all(len(t)==len(pattern['stops']) for t in pattern['timeProfiles'])
                    for service in pattern['services']:
                        assert len(service['profiles'])==len(service['departures'])
                        assert all(0<=i<len(pattern['timeProfiles']) for i in service['profiles'])
    rail=read(OUT/'early-rail/index.json')
    assert rail
    n=0
    for day in rail['days']:
        rows=json.loads(gzip.decompress((OUT/'early-rail'/(day+'.json.gz')).read_bytes()))['rows']
        n+=len(rows);assert all(len(r)==7 for r in rows)
    assert n==rail['records']
    print('Verified rail:',n,'records in',len(rail['days']),'days')
if __name__=='__main__':main()
