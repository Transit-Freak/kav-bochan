"""Collect entire official document packages for every known operating tender.

Text stays in a reproducible local cache. Public manifests distinguish downloaded,
text-extracted and semantically reviewed pages. No filename is treated as evidence.
The scheduled ChatGPT runner consumes review-queue.json and commits reviewed output.
"""
import argparse
import concurrent.futures
import datetime as dt
import hashlib
import html
import io
import json
import pathlib
import re
import subprocess
import tempfile
import urllib.parse
import zipfile
from html.parser import HTMLParser

from check_portal import get
from extract_documents import clean, extract, read, write, ROOT
from tender_fields import blank, validate

VERSION = 2
HOSTS = {'mr.gov.il', 'www.gov.il', 'gov.il', 'www.golan.org.il', 'golan.org.il'}
STATE = ROOT / 'packages-state.json'
CACHE = pathlib.Path(tempfile.gettempdir()) / 'tender-packages'


def official(url):
    p = urllib.parse.urlsplit(url)
    return p.scheme == 'https' and p.hostname in HOSTS


class AttachmentLinks(HTMLParser):
    def __init__(self, base):
        super().__init__(); self.base = base; self.links = {}
    def handle_starttag(self, tag, attrs):
        if tag != 'a': return
        raw = dict(attrs).get('href', '')
        url = urllib.parse.urljoin(self.base, html.unescape(raw)).split('#')[0]
        path = urllib.parse.urlsplit(url).path
        if official(url) and ('/attachment/' in path or path.lower().endswith(('.pdf', '.zip', '.xlsx', '.xls', '.docx', '.doc'))):
            # Stable attachment ID, even if its human-readable filename changes.
            match = re.search(r'/attachment/([^/]+)', path)
            key = match[1] if match else url
            self.links[key] = url


def stamp(): return dt.datetime.now(dt.timezone.utc).isoformat()
def key_for(url): return hashlib.sha256(url.encode()).hexdigest()[:20]


def discover(item, previous):
    result = {**previous, 'listingAttemptedAt': stamp()}
    documents = dict(previous.get('documents', {}))
    try:
        if urllib.parse.urlsplit(item['url']).path.lower().endswith(('.pdf', '.xlsx', '.zip', '.docx')):
            links = [item['url']]
        else:
            body, cut, *_ = get(item['url'])
            if cut: raise ValueError('עמוד המסמכים התקבל באופן חלקי')
            parser = AttachmentLinks(item['url']); parser.feed(body.decode('utf-8'))
            links = list(parser.links.values())
            if not links: raise ValueError('לא נמצאו קישורי מסמכים בעמוד הפרסום')
        for d in documents.values(): d['presentInLatestListing'] = False
        for url in links:
            key = key_for(url)
            documents[key] = {**documents.get(key, {}), 'url': url, 'presentInLatestListing': True}
        result.update(listingOk=True, listingError=None, listedAt=stamp())
    except Exception as error:
        result.update(listingOk=False, listingError=str(error))
    result['documents'] = documents
    return item['id'], result


def decode_file(body, cache_path, member='', depth=0):
    """Return every page/sheet, preserving boundaries; never silently discard members."""
    units = []; errors = []
    cache_path.write_bytes(body)
    if body.startswith(b'%PDF'):
        cache_path.write_bytes(body)
        result = subprocess.run(['pdftotext', '-layout', str(cache_path), '-'], capture_output=True, text=True, check=True, timeout=180)
        pages = result.stdout.split('\f')
        if pages and not pages[-1].strip(): pages.pop()
        for page, text in enumerate(pages, 1):
            logical = clean(text)
            units.append({'member': member, 'page': page, 'text': logical,
                          'layout': re.sub('[\u202a-\u202e\u200e\u200f]', '', text),
                          'status': 'text_extracted' if len(logical) >= 40 else 'visual_review_needed'})
    elif body.startswith(b'PK'):
        with zipfile.ZipFile(io.BytesIO(body)) as archive:
            infos = archive.infolist()
            if len(infos) > 3000 or sum(i.file_size for i in infos) > 300_000_000:
                raise ValueError('הארכיון חורג ממגבלת העיבוד; נדרשת חלוקה')
            names = set(archive.namelist())
            if 'xl/workbook.xml' in names:
                from extract_route_tables import sheets
                for title, sparse_rows in sheets(body):
                    rows=[];row_numbers=[]
                    for number,cells in sparse_rows:
                        values={i:value for i,value in cells.items() if str(value).strip()}
                        if not values:continue
                        row_numbers.append(number)
                        rows.append([values.get(i,'') for i in range(max(values)+1)])
                    units.append({'member': member, 'sheet': title, 'page': len(units)+1,
                                  'rows': rows, 'rowNumbers':row_numbers,
                                  'text': '\n'.join(str(n)+':\t'+'\t'.join(row) for n,row in zip(row_numbers,rows)),
                                  'status': 'text_extracted'})
            elif 'word/document.xml' in names:
                from docx import Document
                doc = Document(io.BytesIO(body))
                # Word pages have no stable numbering until rendered. Use block indices.
                for n, p in enumerate(doc.paragraphs, 1):
                    if p.text.strip(): units.append({'member': member, 'block': n, 'page': n, 'text': p.text, 'status':'text_extracted'})
                for n, table in enumerate(doc.tables, 1):
                    rows = [[c.text for c in row.cells] for row in table.rows]
                    units.append({'member': member, 'table':n, 'page':len(units)+1, 'rows':rows, 'text':'\n'.join('\t'.join(r) for r in rows), 'status':'text_extracted'})
            elif depth < 2:
                for info in infos:
                    if info.is_dir(): continue
                    name = member + (' / ' if member else '') + info.filename
                    if info.filename.lower().endswith(('.pdf', '.xlsx', '.docx', '.zip')):
                        child = cache_path.with_name(hashlib.sha256(name.encode()).hexdigest()[:20]+'.bin')
                        try:
                            subunits, suberrors = decode_file(archive.read(info), child, name, depth+1)
                            units.extend(subunits); errors.extend(suberrors)
                        except Exception as error: errors.append({'member':name,'error':str(error)})
                    else: errors.append({'member':name,'error':'פורמט זה עדיין דורש קריאה נפרדת'})
            else: errors.append({'member':member,'error':'ארכיון מקונן דורש קריאה נפרדת'})
            if 'xl/workbook.xml' in names or 'word/document.xml' in names:
                for image_name in sorted(n for n in names if '/media/' in n and n.lower().endswith(('.png','.jpg','.jpeg','.webp'))):
                    image_key=hashlib.sha256((member+' / '+image_name).encode()).hexdigest()[:20]+'.image'
                    (cache_path.parent/image_key).write_bytes(archive.read(image_name))
                    units.append({'member':member,'imageMember':image_name,'imageFile':image_key,
                                  'page':len(units)+1,'text':'','status':'visual_review_needed'})
    else:
        raise ValueError('התגובה אינה PDF או מסמך Office נתמך')
    return units, errors


def process(item, key, prior, cache, force=False):
    result = {**prior, 'attemptedAt':stamp()}
    try:
        if not official(prior['url']): raise ValueError('מקור המסמך אינו רשמי')
        body, cut, *_ = get(prior['url'], 80_000_000)
        if cut: raise ValueError('המסמך חורג ממגבלת 80 MB')
        digest = hashlib.sha256(body).hexdigest()
        folder = cache / digest; folder.mkdir(parents=True, exist_ok=True)
        units_path = folder / 'units.json'
        if units_path.exists() and prior.get('parserVersion') == VERSION and not force:
            parsed = json.loads(units_path.read_text())
        else:
            units, errors = decode_file(body, folder/'source.bin')
            parsed = {'units':units, 'errors':errors}
            units_path.write_text(json.dumps(parsed, ensure_ascii=False))
        units = parsed['units']
        if not units: raise ValueError('לא חולצו עמודים או גיליונות מהמסמך')
        changed = prior.get('sha256') != digest
        if changed:
            result['previousSha256'] = prior.get('sha256')
            result['reviewedUnits'] = []
        result.update(sha256=digest, units=len(units), textUnits=sum(u['status'] in ('text_extracted','ocr_extracted') for u in units),
                      visualUnits=sum(u['status']=='visual_review_needed' for u in units),
                      memberErrors=parsed['errors'], parserVersion=VERSION, status='extracted', error=None,
                      failures=0, lastSuccessAt=stamp(), nextCheckAt=(dt.datetime.now(dt.timezone.utc)+dt.timedelta(hours=20)).isoformat())
        # Full unit metadata stays in the local source cache, not the public feed.
        result.pop('unitIndex',None)
    except Exception as error:
        failures = prior.get('failures',0)+1
        result.update(status='retry_pending', error=str(error), failures=failures,
                      nextCheckAt=(dt.datetime.now(dt.timezone.utc)+dt.timedelta(hours=min(24,2**min(failures,5)))).isoformat())
    return item['id'], key, result


def make_queue(state, cache):
    queue = []
    for tid, tender in state['tenders'].items():
        for key, doc in tender['documents'].items():
            digest = doc.get('sha256')
            if not digest: continue
            parsed = cache / digest / 'units.json'
            reviewed = set(doc.get('reviewedUnits', []))
            for start in range(0, doc.get('units',0), 8):
                pending = [n for n in range(start,min(start+8,doc['units'])) if n not in reviewed]
                if pending:
                    queue.append({'tenderId':tid,'documentKey':key,'sha256':digest,'url':doc['url'],
                                  'units':pending,'cache':str(parsed),'available':parsed.exists()})
    groups={}
    for batch in queue:groups.setdefault(batch['tenderId'],[]).append(batch)
    return [group[n] for n in range(max((len(g) for g in groups.values()),default=0))
            for group in groups.values() if n<len(group)]


def main(argv=None):
    parser = argparse.ArgumentParser(); parser.add_argument('--limit',type=int,default=120)
    parser.add_argument('--cache',type=pathlib.Path,default=CACHE); parser.add_argument('--force',action='store_true'); parser.add_argument('--skip-discovery',action='store_true')
    args=parser.parse_args(argv);args.cache.mkdir(parents=True,exist_ok=True)
    feeds=read(ROOT/'tenders-feed.json',{'items':[]})['items']+read(ROOT/'archive-feed.json',{'items':[]})['items']
    items={i['id']:i for i in feeds if i['classification']=='operating_tender'}
    state=read(STATE,{'tenders':{}})
    # Discover all tenders on each run, not just the first one in the feed.
    if not args.skip_discovery:
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            jobs=[pool.submit(discover,i,state['tenders'].get(tid,{})) for tid,i in items.items()]
            for job in concurrent.futures.as_completed(jobs):
                tid,result=job.result();state['tenders'][tid]=result
    write(STATE,state)
    due=[];now=stamp()
    for tid,item in items.items():
        for key,doc in state['tenders'][tid]['documents'].items():
            if doc.get('nextCheckAt','') <= now or args.force or (doc.get('sha256') and not (args.cache/doc['sha256']/'units.json').exists()):
                due.append((item,key,doc))
    # Fresh documents first, then least recently attempted; bounded, fair and resumable.
    groups={}
    for task in due:groups.setdefault(task[0]['id'],[]).append(task)
    for group in groups.values():
        group.sort(key=lambda task:(bool(task[2].get('lastSuccessAt')), task[2].get('attemptedAt',''), 'מסמכי' not in task[2]['url']))
    due=[group[n] for n in range(max((len(g) for g in groups.values()),default=0)) for group in groups.values() if n<len(group)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        jobs=[pool.submit(process,*task,args.cache,args.force) for task in due[:args.limit]]
        for job in concurrent.futures.as_completed(jobs):
            tid,key,result=job.result();state['tenders'][tid]['documents'][key]=result
            write(STATE,state)
            print(tid,key,result['status'],result.get('units',0),flush=True)
    state['checkedAt']=stamp();state['remainingDownloads']=max(0,len(due)-args.limit)
    write(STATE,state)
    queue=make_queue(state,args.cache)
    (args.cache/'review-queue.json').write_text(json.dumps(queue,ensure_ascii=False,indent=2))
    print('Known tenders:',len(items),'review batches:',len(queue),'remaining downloads:',state['remainingDownloads'])


if __name__=='__main__':main()
