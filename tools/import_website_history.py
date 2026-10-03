#!/usr/bin/env python3
"""Recover archived passenger-information snapshots without inventing changes.

All CDX capture dates are retained. Identical payloads share a cached parse.
Source IDs are namespaced; they are not Ministry stop codes. Failed captures
remain visible in the manifest and do not imply a cancelled line or stop.
"""
import argparse
import collections
import hashlib
import json
import re
import time
import gzip
import threading
import datetime
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, urlopen
from lxml import html

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'line-history/data'

def write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')))

def clean(s):
    return ' '.join(s.split())

def read(path):
    raw=path.read_bytes()
    return json.loads(gzip.decompress(raw) if path.suffix=='.gz' else raw)

# Archive timeouts and rate limits are transient; they are retried on later runs.
MAX_ATTEMPTS = 4

def needs_retry(result):
    return result.get('status')=='failed' and result.get('attempts',1)<MAX_ATTEMPTS

# Internet Archive limits: about 15 playback requests a minute for bulk downloads (one every
# 4 seconds, as wayback-machine-downloader does). Above it the archive answers 429; ignoring
# 429 for a minute blocks the address at the firewall ("Connection refused") for an hour,
# doubling on every repeat. A refusal is not a failed capture: wait it out, then ask again.
MIN_INTERVAL = 4.0
RATE_PAUSE = 120        # after 429/503, unless the archive says Retry-After
BLOCK_PAUSE = 1200      # firewall block: at least an hour, so check every 20 minutes
MAX_PAUSE_SECONDS = 3600

def refused(error):
    """Seconds to wait if the archive refused the request, else 0."""
    if getattr(error,'code',None) in (429,503):
        try:return min(max(int(error.headers.get('Retry-After')),RATE_PAUSE),MAX_PAUSE_SECONDS)
        except Exception:return RATE_PAUSE
    reason=getattr(error,'reason',None)
    if isinstance(reason,ConnectionRefusedError) or isinstance(error,ConnectionRefusedError) or 'Connection refused' in str(error):
        return BLOCK_PAUSE
    return 0

def parse_page(payload, original):
    encoding = 'utf-8' if re.search(br'charset\s*=\s*["\']?utf-8', payload[:3000], re.I) else 'cp1255'
    text = payload.decode(encoding, errors='replace')
    doc = html.fromstring(text)
    for e in doc.xpath('//script|//style'):
        e.drop_tree()
    body = clean(doc.text_content())
    title = re.search(r'(?:מסלול|מפה)\s*(?:ל)?קו\s*([\d]+[א-ת]?)\s*\(([^)]+)\)', body)
    if not title:
        return {'status': 'unparsed', 'reason': 'No explicit public line number and operator'}
    line, operator = title.groups()
    query = {k.lower(): v[0] for k,v in parse_qs(urlsplit(original).query).items()}
    company = query.get('companyid', query.get('linecompanyid', 'unknown'))
    internal = query.get('companylinecode', query.get('linecode', 'unknown'))
    patterns = []
    # Only direct table rows: enclosing layout tables must never become routes.
    for table in doc.xpath('//table'):
        rows = table.xpath('./tr|./tbody/tr')
        cells = [[clean(c.text_content()) for c in tr.xpath('./td|./th')] for tr in rows]
        header = next((i for i,c in enumerate(cells) if c[:3] == ['ישוב','תחנה','זמן נסיעה'] or c[:3] == ['תחנה','זמן הגעה','זמן יציאה']), None)
        if header is None:
            continue
        old = cells[header][0] == 'ישוב'
        stops, source_rows = [], []
        previous_row = None
        for tr,c in zip(rows[header+1:], cells[header+1:]):
            if len(c)<3 or not re.fullmatch(r'\d+:\d\d', c[2]):
                continue
            source_rows.append(c)
            # 2003 renderer emits each identical row twice, preserving raw evidence.
            if old and c == previous_row:
                previous_row = None
                continue
            previous_row = c
            name = (c[0]+' - '+c[1]) if old else c[0]
            place = None
            for href in tr.xpath('.//a/@href'):
                match = re.search(r'PlaceID=(\d+)', href, re.I)
                if match: place = match[1]; break
            code = 'website:'+company+':'+(place or hashlib.sha256(name.encode()).hexdigest()[:16])
            stops.append([code,name,None,None])
        if len(stops)>1:
            heading = ' → '.join(clean(s) for s in rows[0].xpath('.//b/text()|.//strong/text()')) or clean(' '.join(cells[0]))
            patterns.append({'heading':heading,'stops':stops,'sourceRows':source_rows,'duplicateRowsRemoved':len(source_rows)-len(stops)})
    # A saved map contains historical coordinates in its own SelectPlace links.
    if not patterns:
        stops=[]
        for a in doc.xpath('//a[@href]'):
            m=re.search(r"SelectPlace\(\s*(\d+)\s*,\s*['\"](.*?)['\"]\s*,\s*([\d.]+)\s*,\s*([\d.]+)", a.get('href',''))
            if m:
                pid,name,lon,lat=m.groups();lat,lon=float(lat),float(lon)
                if pid!='0' and name.strip() and 29<=lat<=34 and 34<=lon<=37: stops.append(['website:'+company+':'+pid,name,lat,lon])
        if len(stops)>1:
            patterns=[{'heading':'נקודות שמורות במפת המקור','stops':stops,'partial':True}]
    if not patterns:
        return {'status':'unparsed','reason':'No supported stop table or saved coordinates','line':line,'operator':operator}
    return {'status':'parsed','line':line,'operator':operator,'company':company,'internalLine':internal,'patterns':patterns}

def variant(original,result):
    query={k.lower():v[0].strip() for k,v in parse_qs(urlsplit(original).query).items()}
    internal=result['internalLine']
    if internal=='unknown' and query.get('lineid'): internal='lineid:'+query['lineid']
    return query.get('linealternatecode',''),query.get('linedirection',''),internal

def toward(stops):
    """'לכיוון רחובות': the town of the last stop, as passengers name a direction."""
    name=stops[-1][1]
    town,_,station=name.partition(' - ')
    return 'לכיוון '+(station if town.startswith('(') or not station else town).strip()

def route_id(result,internal,alt,direction,index,count=1):
    """website<line>-<direction>-<alternative>, like Ministry route ids, so the line page
    groups the alternatives and directions of one archived line.

    The line key is the source's own line code, never a public number, which repeats
    between cities.
    """
    code=internal.lstrip('0') or internal
    if internal=='unknown': code+='|'+result['line']+'|'+result['operator']
    family=hashlib.sha256((result['company']+'|'+code).encode()).hexdigest()[:16]
    alt=re.sub(r'[-/#\s]','',alt)
    # A page without a stated direction lists its alternatives as tables; the direction
    # is unknown (0) and each table is an alternative.
    direction=re.sub(r'\D','',direction) or '0'
    if count>1 or direction=='0': alt+=str(index+1)
    # No invented main alternative: '#' is the Ministry's own mark.
    return f'website{family}-{direction}-{alt}'

def import_records(manifest):
    from compact_lines import materialize, compact
    byroute={}
    for capture in manifest['captures']:
        result=capture.get('result')
        if not result or result.get('status')!='parsed': continue
        d=capture['timestamp'];date=f'{d[:4]}-{d[4:6]}-{d[6:8]}'
        alt,direction,internal=variant(capture['original'],result)
        for index,pat in enumerate(result['patterns']):
            rd=route_id(result,internal,alt,direction,index,len(result['patterns']))
            lf=byroute.setdefault(rd,{'rd':rd,'line':result['line'],'dest':pat['heading'],'op':result['operator'],'tt':'bus','ty':'','historicalOnly':True,'observationOnly':True,'versions':[]})
            v={'d':date,'k':'snapshot','src':'websiteArchive','stops':pat['stops'],'shp':'','noShapeBorrow':True,
               'sourceUrl':capture['archiveUrl'],'captureTimestamp':d,'websitePartial':bool(pat.get('partial')),
               'note':'צילום מאתר מידע לנוסעים. תאריך השמירה בארכיון, לא מועד שינוי הקו. מזהי התחנות פנימיים למקור.'}
            # Preserve every capture in the manifest; the line timeline shows one state per day.
            if not any(w['d']==date and w['stops']==v['stops'] for w in lf['versions']): lf['versions'].append(v)
    # Routes from an earlier identity scheme are replaced, not kept beside the new ones.
    for path in (DATA/'lines').glob('website*.json'):
        if path.stem not in byroute: path.unlink()
    dates={}
    for rd,lf in byroute.items():
        lf['versions'].sort(key=lambda v:(v['d'],v['captureTimestamp']))
        lf['heading']=lf['dest'];lf['dest']=toward(lf['versions'][-1]['stops'])
        write(DATA/'lines'/f'{rd}.json',compact(lf))
        for v in lf['versions']: dates.setdefault(v['d'],set()).add(rd)
    catalog_path=DATA/'early-sources.json';progress_path=DATA/'early-progress.json'
    catalog=json.loads(catalog_path.read_text());progress=json.loads(progress_path.read_text())
    catalog['snapshots']=[s for s in catalog['snapshots'] if s.get('kind')!='websiteArchive']
    for date,routes in sorted(dates.items()):
        sid='website-'+date
        urls=list(dict.fromkeys(c['archiveUrl'] for c in manifest['captures'] if c['timestamp'][:8]==date.replace('-','') and c['result']['status']=='parsed'))
        catalog['snapshots'].append({'id':sid,'date':date,'kind':'websiteArchive','urls':urls,'coverage':'צילום חלקי מאתרי מידע לנוסעים. תאריך השמירה בארכיון אינו תאריך שינוי. מזהי תחנות פנימיים, ללא התאמה מוכחת למספרי משרד התחבורה.'})
        progress['done'][sid]={'date':date,'routes':len(routes),'stops':0,'modes':{'3':len(routes)},'versionsAdded':len(routes)}
        write(DATA/'early-routes'/f'{sid}.json',{'routes':sorted(routes)})
    catalog['snapshots'].sort(key=lambda s:(s['date'],s['id']))
    write(catalog_path,catalog);write(progress_path,progress)
    return len(byroute)

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--catalog-dir',required=True);ap.add_argument('--cache-dir',required=True);ap.add_argument('--max-seconds',type=int,default=0);ap.add_argument('--cache-only',action='store_true');ap.add_argument('--publish-checkpoints',action='store_true')
    args=ap.parse_args();cache=Path(args.cache_dir);cache.mkdir(parents=True,exist_ok=True)
    manifest={'through':'2015-12-31','rule':'Captures are observations, not changes. No assumed MOT identity or geometry.','catalogs':[], 'captures':[]}
    for file in sorted(Path(args.catalog_dir).glob('*.json*')):
        rows=read(file);manifest['catalogs'].append({'domain':file.name.split('.json')[0],'captures':len(rows)-1})
        for timestamp,original,mime,digest in rows[1:]:
            if re.search(r'(LineStations|LinePlaces|PlacesMap)\.asp\?',original,re.I) or ('bus.co.il' in original and re.search(r'LinePlaces|LineStations|PlacesMap',original,re.I)):
                manifest['captures'].append({'timestamp':timestamp,'original':original,'digest':digest,'archiveUrl':f'https://web.archive.org/web/{timestamp}/{original}'})
    manifest['captures'].sort(key=lambda c:(c['timestamp'],c['original']))
    started=time.monotonic();processed=0;groups={};lock=threading.Lock();last_request=[0];pause_until=[0];paused=[0];limited=threading.Event();last_publish=started
    retries={}
    for c in manifest['captures']:
        p=cache/(hashlib.sha256(c['digest'].encode()).hexdigest()+'.json')
        if p.exists():
            c['result']=read(p)
            # Failed downloads stay visible as failed until a retry replaces them.
            if needs_retry(c['result']): retries.setdefault(c['digest'],[]).append(c)
            continue
        c['result']={'status':'pending'}
        groups.setdefault(c['digest'],[]).append(c)
    # New captures first; earlier timeouts are retried with the remaining time.
    for digest,group in retries.items(): groups.setdefault(digest,group)
    def save_checkpoint():
        for c in manifest['captures']:c.setdefault('result',{'status':'pending'})
        manifest['routesImported']=import_records(manifest)
        subprocess.run([sys.executable,str(ROOT/'tools/enrich_website_maps.py')],cwd=ROOT,check=True)
        # מסלולים מוזרים (צורת המסלול, לא מרחק) מכל מה שנאסף עד עכשיו
        from odd_website_routes import find as odd_routes
        def route_of(capture,result,index):
            alt,direction,internal=variant(capture['original'],result)
            return route_id(result,internal,alt,direction,index,len(result['patterns']))
        write(DATA/'website-odd-routes.json',{'rule':'Route shape by the towns in the stop names; one trip (times rise). Not distance.',
              'routes':odd_routes(manifest['captures'],route_of=route_of)})
        manifest['counts']={status:sum(c['result']['status']==status for c in manifest['captures']) for status in ('parsed','unparsed','failed','pending')}
        raw=json.dumps(manifest,ensure_ascii=False,separators=(',',':')).encode()
        (DATA/'website-archive.json.gz').write_bytes(gzip.compress(raw,mtime=0))
        dates={};recent=[]
        for c in manifest['captures']:
            r=c['result']
            if r['status']!='parsed':continue
            ts=c['timestamp'];d=f'{ts[:4]}-{ts[4:6]}-{ts[6:8]}'
            dates[d]=dates.get(d,0)+1
        for path in (DATA/'lines').glob('website*.json'):
            lf=json.loads(path.read_text())
            recent.append({'rd':lf['rd'],'line':lf['line'],'operator':lf['op'],'date':lf['versions'][-1]['d']})
        recent.sort(key=lambda r:(r['date'],r['line'],r['rd']),reverse=True)
        write(DATA/'website-archive-summary.json',{'counts':manifest['counts'],'catalogs':manifest['catalogs'],'routesImported':manifest['routesImported'],'through':manifest['through'],'updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'dates':[{'date':d,'captures':n} for d,n in sorted(dates.items())],'recent':recent[:20]})
    def publish_checkpoint():
        save_checkpoint()
        for script,extra in [('rebuild_lines_index.py',[]),('build_archive_months.py',[]),('check_early_history.py',['--websites-only']),('repair_noop_events.py',[]),('repair_legacy_diffs.py',['--all','--apply']),('check_history_claims.py',[]),('publish_website_history.py',[])]:
            if script=='publish_website_history.py':
                subprocess.run(['node',str(ROOT/'tools/check_website_history_ui.mjs')],cwd=ROOT,check=True)
            subprocess.run([sys.executable,str(ROOT/'tools'/script),*extra],cwd=ROOT,check=True)
    def fetch(c):
        p=cache/(hashlib.sha256(c['digest'].encode()).hexdigest()+'.json')
        previous=c['result']
        if limited.is_set():return previous,True
        with lock:
            delay=max(MIN_INTERVAL-(time.monotonic()-last_request[0]),pause_until[0]-time.monotonic())
            if delay>0:time.sleep(delay)
            last_request[0]=time.monotonic()
        url=f"https://web.archive.org/web/{c['timestamp']}id_/{c['original']}"
        try:
            with urlopen(Request(url,headers={'User-Agent':'KavBochan-Historical-Research/1.0'}),timeout=60) as r:
                payload=r.read();actual=r.geturl()
            found=re.search(r'/web/(\d{14})',actual)
            if found and found[1]!=c['timestamp']: raise ValueError('Archive redirected to a different capture date')
            result=parse_page(payload,c['original'])
        except Exception as e:
            wait=refused(e)
            if wait:
                with lock:
                    # Requests already in flight may be refused too; one pause covers them.
                    if pause_until[0]<=time.monotonic():
                        paused[0]+=wait;pause_until[0]=time.monotonic()+wait
                        print('Archive refused (',str(e)[:60],'); pausing',wait,'s, total',paused[0],'s',flush=True)
                    # More than an hour of continuous refusal: stop; the next run continues.
                    if paused[0]>MAX_PAUSE_SECONDS:limited.set()
                return previous,True
            attempts=previous.get('attempts',1)+1 if previous.get('status')=='failed' else 1
            result={'status':'failed','reason':str(e)[:200],'attempts':attempts}
        with lock:paused[0]=0
        write(p,result);return result,False
    todo=iter(groups.values());active={};again=collections.deque()
    with ThreadPoolExecutor(max_workers=3) as executor:
        while True:
            expired=args.cache_only or bool(args.max_seconds and time.monotonic()-started>=args.max_seconds)
            while len(active)<3 and not expired and not limited.is_set():
                group=again.popleft() if again else next(todo,None)
                if group is None:break
                active[executor.submit(fetch,group[0])]=group
            if not active:break
            done,_=wait(active,return_when=FIRST_COMPLETED)
            for future in done:
                group=active.pop(future);result,later=future.result()
                # Refused by the archive: asked again after the pause, not recorded as a failure.
                if later:
                    if not limited.is_set():again.append(group)
                    continue
                for c in group:c['result']=result
                processed+=1
                if processed%120==0:print('Fetched',processed,'unique payloads of',len(groups),flush=True)
            if args.publish_checkpoints and time.monotonic()-last_publish>=1200:
                publish_checkpoint();last_publish=time.monotonic()
    for c in manifest['captures']: c.setdefault('result',{'status':'pending'})
    save_checkpoint()
    print(manifest['counts'],manifest['routesImported'],flush=True)

if __name__=='__main__':main()
