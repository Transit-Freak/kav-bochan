#!/usr/bin/env python3
"""Estimated maps use the same stop matcher and road router as Magihim 2012.
The archived stop names and coordinates are preserved independently.
"""
import argparse,datetime,gzip,hashlib,json,math,os,sys
from pathlib import Path
from build_magihim_site import make_stop_matcher
from compact_lines import materialize,compact
from shape_2012 import route_shape
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'line-history/data'
CACHE=DATA/'website-map-cache.json.gz'
ALGORITHM='magihim-stops-v1'

def load_cache(path=CACHE):
    return json.loads(gzip.decompress(path.read_bytes())) if path.exists() else {}

def dump_cache(cache,path=CACHE):
    path.write_bytes(gzip.compress(json.dumps(cache,ensure_ascii=False,separators=(',',':')).encode(),mtime=0))

def match_name(name):
    if ' - ' not in name:return name
    city,station=name.split(' - ',1)
    return station if city.startswith('(') else station+' - '+city

def fingerprint(stops):
    return hashlib.sha256(json.dumps([ALGORITHM,stops],ensure_ascii=False,separators=(',',':')).encode()).hexdigest()

def estimate(stops,matcher,osrm=None,old=None):
    if len(stops)<2 or any(isinstance(s[2],(int,float)) and isinstance(s[3],(int,float)) for s in stops):return None
    if old and old.get('algorithm')==ALGORITHM:
        result=dict(old)
    else:
        raw={'stops':[{'seq':i+1,'name':match_name(s[1]),'t':'','type':''} for i,s in enumerate(stops)]}
        mapped=matcher['route_stops'](raw)
        for i,row in enumerate(mapped):row[1]=stops[i][1]
        result={'algorithm':ALGORITHM,'stops':mapped,'matched':sum(len(s)>=7 and all(isinstance(x,(int,float)) and math.isfinite(x) for x in s[5:7]) for s in mapped),
                'total':len(stops),'basis':'Magihim matcher: MOT 2012 and later stop registry; locations are estimated for this capture',
                'updated':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    if osrm and result['matched']>=2 and not result.get('roadChecked'):
        shape,error=route_shape(osrm,result['stops'])
        result['roadChecked']=True
        if shape:result['shape']=shape
        elif error:result['roadUnavailable']=error
    return result

def enrich(osrm=None):
    os.chdir(ROOT)
    cache=load_cache();matcher=None;changed=versions=mapped=roads=0
    for path in sorted((DATA/'lines').glob('website*.json')):
        original=path.read_text();lf=materialize(json.loads(original));dirty=False
        for v in lf.get('versions',[]):
            if v.get('src')!='websiteArchive':continue
            st=v.get('stops',[])
            if len(st)<2 or any(isinstance(s[2],(int,float)) and isinstance(s[3],(int,float)) for s in st):continue
            key=fingerprint(st);old=cache.get(key)
            if not old and matcher is None:matcher=make_stop_matcher()
            result=estimate(st,matcher,osrm,old)
            if not result:continue
            cache[key]=result;versions+=1;mapped+=result['matched'];roads+=bool(result.get('shape'))
            if v.get('websiteMapEstimate')!=result:v['websiteMapEstimate']=result;dirty=True
        if dirty:
            path.write_text(json.dumps(compact(lf),ensure_ascii=False,separators=(',',':')));changed+=1
    dump_cache(cache)
    print({'estimatedVersions':versions,'matchedStops':mapped,'roadMaps':roads,'changedFiles':changed},flush=True)
    return cache

def main():
    p=argparse.ArgumentParser();p.add_argument('--osrm');a=p.parse_args();enrich(a.osrm)
if __name__=='__main__':main()
