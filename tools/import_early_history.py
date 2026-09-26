#!/usr/bin/env python3
"""Import recovered GTFS snapshots into הקו בזמן, without inventing continuity.

SOURCE catalog is immutable provenance; progress advances only after successful
validation/write. Missing days and absent routes never imply closure. Old route
IDs without route_desc are kept in a separate namespace. All original tables
remain available through the catalog's source downloads.
"""
import argparse, collections, csv, datetime, gzip, hashlib, io, json, os
from pathlib import Path
import re, shutil, tempfile, time, urllib.request, zipfile
from compact_lines import compact, materialize
from backfill_geo import enc_polyline, fsafe
from backfill_tf import classify
from schedule_diff import annotate_archive_schedule

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'line-history/data'
CAT = OUT / 'early-sources.json'
PROGRESS = OUT / 'early-progress.json'
TYPE = {'0': 'lightrail', '2': 'rail', '5': 'cable', '8': 'taxi', '715': 'demand'}
DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']

def read(p, default=None):
    return json.loads(p.read_text()) if p.exists() else default

def write(p, value):
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + '.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')))
    tmp.replace(p)

def digest(x):
    return hashlib.sha256(json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def rows(z, name):
    names = [n for n in z.namelist() if n.rsplit('/',1)[-1] == name]
    if len(names) != 1: raise ValueError(f'{name}: expected one member, got {len(names)}')
    with z.open(names[0]) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding='utf-8-sig'))

def download(url, target):
    for attempt in range(3):
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'KavBochan historical data import'})
            with urllib.request.urlopen(req,timeout=90) as r, open(target,'wb') as f:
                shutil.copyfileobj(r,f,1024*1024)
            return
        except Exception:
            if attempt == 2: raise
            time.sleep(2*(attempt+1))

def load_snapshot(paths):
    """Merge overlapping regional feeds by primary key; conflicts fail loudly."""
    tables={n:{} for n in ('routes.txt','agency.txt','stops.txt','calendar.txt','trips.txt')}
    keys={'routes.txt':'route_id','agency.txt':'agency_id','stops.txt':'stop_id',
          'calendar.txt':'service_id','trips.txt':'trip_id'}
    stop_times, shapes = {}, {}
    for path in paths:
        with zipfile.ZipFile(path) as z:
            for name, table in tables.items():
                for r in rows(z,name):
                    k=r[keys[name]]
                    if k in table and table[k] != r:
                        raise ValueError(f'Conflicting {name} ID {k}')
                    table[k]=r
            local=collections.defaultdict(list)
            for r in rows(z,'stop_times.txt'):
                local[r['trip_id']].append((int(r['stop_sequence']),r['stop_id'],r.get('arrival_time',''),
                    r.get('departure_time',''),r.get('pickup_type','0'),r.get('drop_off_type','0')))
            for tid, seq in local.items():
                seq.sort()
                if tid in stop_times and stop_times[tid] != seq: raise ValueError('Conflicting trip stops '+tid)
                stop_times[tid]=seq
            local=collections.defaultdict(list)
            for r in rows(z,'shapes.txt'):
                local[r['shape_id']].append((int(r['shape_pt_sequence']),float(r['shape_pt_lat']),float(r['shape_pt_lon'])))
            for sid, pts in local.items():
                pts.sort()
                if sid in shapes and shapes[sid] != pts: raise ValueError('Conflicting shape '+sid)
                shapes[sid]=pts
    stops=tables['stops.txt']; routes=tables['routes.txt']; trips=tables['trips.txt']
    if not routes or not stops or not trips or not stop_times: raise ValueError('Empty GTFS required table')
    for tid, t in trips.items():
        if t['route_id'] not in routes: raise ValueError('Missing route '+t['route_id'])
        if t['service_id'] not in tables['calendar.txt']: raise ValueError('Missing service '+t['service_id'])
        # Some published trips have no stop times. Preserve the source and
        # report this limitation instead of inventing a route for them.
        if tid not in stop_times: stop_times[tid] = []
    for seq in stop_times.values():
        if any(s[1] not in stops for s in seq): raise ValueError('Missing stop reference')
    return tables, stop_times, shapes

def publish(source, paths):
    tables, times, shapes=load_snapshot(paths)
    date=source['date']; src=source['kind']; stops=tables['stops.txt']
    agencies=tables['agency.txt']; calendar=tables['calendar.txt']
    native_keys=[r.get('route_desc') for r in tables['routes.txt'].values() if r.get('route_desc')]
    if len(native_keys)!=len(set(native_keys)): raise ValueError('Duplicate native route_desc; source needs explicit disambiguation')
    byroute=collections.defaultdict(list)
    for tid,t in tables['trips.txt'].items(): byroute[t['route_id']].append(tid)
    seen_path=OUT/'early-seen.json'; seen=read(seen_path,{})
    additions=[]; nversions=0; modes=collections.Counter()
    for rid,r in tables['routes.txt'].items():
        tids=byroute.get(rid,[])
        rd=r.get('route_desc','').strip()
        # 2012 route_id is not a contemporary MOT license number.
        rd=rd if re.fullmatch(r'\d+-[^-]+-[^-]+',rd) else f'archive{date[:4]}r{rid}-0-H'
        mode=TYPE.get(r['route_type']); modes[r['route_type']]+=1
        patterns=collections.defaultdict(list)
        for tid in tids:
            t=tables['trips.txt'][tid]
            if not times[tid]: continue
            pattern=(tuple((s[1],s[4],s[5]) for s in times[tid]), t.get('shape_id',''))
            patterns[pattern].append(tid)
        ordered=sorted(patterns.items(),key=lambda item:(-len(item[1]),str(item[0])))
        # All stop patterns and all service calendars/departures are retained;
        # map defaults to most common pattern, selected deterministically.
        pattern_data=[]
        for (stopseq,shape), ptids in ordered:
            seq=[[stops[s]['stop_code'] or s,stops[s]['stop_name'].strip(),
                  float(stops[s]['stop_lat']),float(stops[s]['stop_lon'])] for s,_,_ in stopseq]
            # בקובצי 2012 יש שרטוטים שבהם חלק מהנקודות נשמרו עם קו רוחב וקו אורך הפוכים (34.8, 32.0 — בים).
            # בישראל קו רוחב 29–33.5 וקו אורך 34–36, כך שהיפוך כזה חד-משמעי ומתוקן כאן
            fix=lambda a,b:(b,a) if (34<a<36 and 29<b<33.5) else (a,b)
            shp=enc_polyline([fix(p[1],p[2]) for p in shapes.get(shape,[])])
            services=collections.defaultdict(list)
            profiles=[]; profile_ids={}
            def seconds(t):
                if not t:return None
                h,m,sec=map(int,t.split(':'));return h*3600+m*60+sec
            for tid in ptids:
                ss=times[tid]; cal=tables['trips.txt'][tid]['service_id']
                departure=ss[0][3] or ss[0][2]
                base=seconds(departure)
                profile=tuple((None if seconds(x[2]) is None or base is None else seconds(x[2])-base,
                               None if seconds(x[3]) is None or base is None else seconds(x[3])-base) for x in ss)
                if profile not in profile_ids:profile_ids[profile]=len(profiles);profiles.append(profile)
                services[cal].append((departure,profile_ids[profile]))
            canonical=sorted(profiles,key=repr)
            remap={i:canonical.index(profile) for i,profile in enumerate(profiles)}
            profiles=canonical
            services={cal:[(departure,remap[profile]) for departure,profile in departures] for cal,departures in services.items()}
            pattern_data.append({'stops':seq,'shp':shp,'trips':len(ptids),
                'boarding':[[a,b] for _,a,b in stopseq],'timeProfiles':profiles,
                'services':[{'calendar':calendar[s], 'departures':[x[0] for x in sorted(dep)],'profiles':[x[1] for x in sorted(dep)]} for s,dep in sorted(services.items())]})
        first=pattern_data[0] if pattern_data else {'stops':[], 'shp':''}
        meta={'line':r.get('route_short_name',''),'dest':r.get('route_long_name',''),
              'op':agencies.get(r.get('agency_id'),{}).get('agency_name','').strip(),'tt':mode}
        # GTFS service IDs and validity windows roll forward daily; those
        # bookkeeping changes alone are not changes to the public route.
        structural = [{'stops':p['stops'],'shp':p['shp'],'boarding':p['boarding'],'timeProfiles':p['timeProfiles'],
            'services':sorted([{'days':[x['calendar'].get(d,'0') for d in DAYS],
                'departures':x['departures'],'profiles':x['profiles']} for x in p['services']],key=lambda x:json.dumps(x,sort_keys=True))}
            for p in pattern_data]
        structural.sort(key=lambda x:json.dumps(x,sort_keys=True))
        fp=digest({'meta':meta,'patterns':structural})
        p=OUT/'lines'/f'{fsafe(rd)}.json'; lf=materialize(read(p,{}))
        previous=[v for v in lf.get('versions',[]) if v.get('earlyFingerprint') and v['d'] <= date and v.get('earlySource') != source['id']]
        prev=previous[-1] if previous else None
        # צילום שבו הקו קיים בלי אף נסיעה אינו "כל התחנות ירדו" — משווים מול הצילום האחרון שהיו בו תחנות
        prev_st=next((v for v in reversed(previous) if v.get('stops')),None)
        if prev and prev.get('earlyFingerprint')==fp:
            additions.append(rd);seen[rd]=date;continue
        if not lf:
            lf={'rd':rd,**meta,'ty':'','versions':[],'historicalOnly':True}
        # Imported evidence does not overwrite present-day route metadata.
        old=[v for v in lf['versions'] if v.get('earlySource')==source['id']]
        lf['versions']=[v for v in lf['versions'] if v.get('earlySource')!=source['id']]
        # Sources and dates are explicit. No claims of exact opening/closure.
        if not pattern_data:
            kind,add,rem = 'notrips',[],[]
        else:
            kind,add,rem = classify(prev_st.get('stops',[]),first['stops'],prev_st.get('shp',''),first['shp']) if prev_st else (None,[],[])
        if prev and not kind:
            pm=prev.get('historicalMeta',{})
            kind='operator' if pm.get('op')!=meta['op'] else 'renum' if pm.get('line')!=meta['line'] else 'dest' if pm.get('dest')!=meta['dest'] else 'sched'
        payload=json.dumps(pattern_data,ensure_ascii=False,separators=(',',':')).encode()
        pattern_hash=hashlib.sha256(payload).hexdigest()
        pattern_path=OUT/'early-patterns'/(pattern_hash+'.json.gz')
        pattern_path.parent.mkdir(parents=True,exist_ok=True)
        if not pattern_path.exists():pattern_path.write_bytes(gzip.compress(payload,mtime=0))
        v={'d':date,'k':kind or 'snapshot','src':src,'stops':first['stops'],'shp':first['shp'],
           'earlySource':source['id'],'earlyFingerprint':fp,'historicalMeta':meta,
           'note':'צילום היסטורי של פרסום משרד התחבורה. מועד התיעוד אינו מועד פתיחת הקו או שינוי המסלול.',
           'earlyPatternsFile':pattern_hash,'earlyPatternCount':len(pattern_data),'routeId':rid}
        if add:v['add']=add
        if rem:v['rem']=rem
        if prev:v['note']='שינוי שנמצא בהשוואת שני צילומים זמינים של אותו מק״ט, כיוון וחלופה.'
        if prev and prev['d']<date: v['sd']=seen.get(rd,prev['d'])
        if prev and v['k'] == 'sched':
            annotate_archive_schedule(v, prev, OUT)
        seen[rd]=date
        lf['versions'].append(v);lf['versions'].sort(key=lambda x:x['d'])
        # Do not borrow a later shape for an early snapshot with missing shape.
        packed=compact(lf)
        for event in packed['versions']:
            if event.get('earlySource')==source['id'] and not first['shp']:
                event['shp']='';event.pop('shpref',None)
        write(p,packed);nversions+=1;additions.append(rd)
    write(seen_path,seen)
    # Preserve every stop, including those unused by representative trips.
    stoplist=[{'c':r['stop_code'] or r['stop_id'],'id':r['stop_id'],'n':r['stop_name'],
               'desc':r.get('stop_desc',''),'la':float(r['stop_lat']),'lo':float(r['stop_lon'])}
              for r in stops.values()]
    out=OUT/'early-stops'/f"{source['id']}.json.gz";out.parent.mkdir(exist_ok=True)
    payload=json.dumps({'source':source['id'],'date':date,'stops':stoplist},ensure_ascii=False,separators=(',',':')).encode()
    out.write_bytes(gzip.compress(payload,mtime=0))
    write(OUT/'early-routes'/f"{source['id']}.json",{'routes':sorted(set(additions))})
    return {'routes':len(additions),'stops':len(stoplist),'trips':len(tables['trips.txt']),
            'modes':dict(modes),'versionsAdded':nversions,'date':date,
            'tripsWithoutStopTimes':sum(not x for x in times.values())}

def main():
    global OUT,CAT,PROGRESS
    ap=argparse.ArgumentParser();ap.add_argument('--max-minutes',type=float,default=45)
    ap.add_argument('--limit',type=int,default=0);ap.add_argument('--only');ap.add_argument('--local-2012')
    ap.add_argument('--out');args=ap.parse_args()
    if args.out: OUT=Path(args.out);PROGRESS=OUT/'early-progress.json'
    catalog=read(CAT);progress=read(PROGRESS,{'done':{},'errors':{}})
    deadline=time.monotonic()+args.max_minutes*60;count=0
    for source in catalog['snapshots']:
        sid=source['id']
        if sid in progress['done'] or (args.only and sid!=args.only):continue
        if time.monotonic()>deadline or (args.limit and count>=args.limit):break
        print('Importing',sid,flush=True)
        failed=False
        try:
            with tempfile.TemporaryDirectory(prefix='early-gtfs-') as tmp:
                paths=[]
                for i,u in enumerate(source['urls']):
                    if args.local_2012 and source['kind']=='miu12':
                        region=u.rsplit('israel-public-transportation-',1)[1][:-4]
                        p=Path(args.local_2012)/(region+'.zip')
                    else:
                        p=Path(os.environ.get('EARLY_GTFS_CACHE',tmp))/(digest(u)+'.zip')
                        p.parent.mkdir(parents=True,exist_ok=True)
                        if not p.exists():download(u,p)
                    paths.append(p)
                result=publish(source,paths)
            progress['done'][sid]=result;progress['errors'].pop(sid,None)
            print(sid,result,flush=True)
        except Exception as e:
            progress['errors'][sid]=str(e);print('FAILED',sid,str(e),flush=True);failed=True
        progress['updatedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
        write(PROGRESS,progress);count+=1
        if failed: break  # keep chronological comparison; retry before advancing
    if progress['errors']:raise SystemExit(1)

if __name__=='__main__':main()
