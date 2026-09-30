"""Inspect official attachment bytes for every tender; never infer route identity."""
import concurrent.futures
import datetime
import hashlib
import html
import io
import re
import zipfile
from extract_documents import ROOT, read, write
from check_portal import get


def inspect(item, prior):
    stamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    result = {**prior, 'attemptedAt':stamp, 'sourceUrl':item['url']}
    documents = dict(prior.get('documents', {}))
    try:
        if item['url'].lower().endswith('.pdf'):
            result.update(status='needs_review',reason='המקור הוא חוברת PDF; קישורי נספחים נפרדים טרם אותרו.')
            return item['id'], result
        body, cut, _, _ = get(item['url'])
        if cut: raise ValueError('דף הפרסום התקבל באופן חלקי')
        urls = list(dict.fromkeys('https://mr.gov.il'+html.unescape(u) for u in re.findall(r'href="(/ilgstorefront/he/p/attachment/[^\"]+)"',body.decode())))
        result['listedAttachments'] = urls
        candidates = [u for u in urls if any(w in u for w in ('נספח','מפרט','מסלול','מפה'))]
        candidates.sort(key=lambda u:documents.get(u,{}).get('attemptedAt',''))
        for url in candidates[:12]:
            doc = {**documents.get(url,{}),'url':url,'attemptedAt':stamp}
            try:
                data, cut, _, _ = get(url,30000000)
                if cut:raise ValueError('הנספח גדול ממגבלת ההורדה; נדרשת הורדה נפרדת')
                digest=hashlib.sha256(data).hexdigest()
                if data.startswith(b'PK'):
                    archive=zipfile.ZipFile(io.BytesIO(data))
                    names=archive.namelist()
                    doc.update(format='zip',members=names,sha256=digest,status='inventoried')
                    cache=ROOT.parent.parent/'annex-cache';cache.mkdir(exist_ok=True)
                    (cache/(digest+'.zip')).write_bytes(data)
                    doc['routeFiles']=[n for n in names if n.lower().endswith(('.shp','.geojson','.kml','.kmz'))]
                    doc['spreadsheetFiles']=[n for n in names if n.lower().endswith(('.xlsx','.xls','.csv'))]
                elif data.startswith(b'%PDF'):
                    doc.update(format='pdf',sha256=digest,status='needs_content_review')
                else:raise ValueError('סוג הקובץ עדיין לא נתמך')
                doc['lastSuccessAt']=stamp;doc.pop('error',None)
            except Exception as e:doc.update(status='retry_pending',error=str(e))
            documents[url]=doc
        result.update(status='partial',documents=documents,reason=None)
    except Exception as e:result.update(status='retry_pending',reason=str(e))
    return item['id'],result


def main():
    feed=read(ROOT/'tenders-feed.json',{'items':[]})['items']+read(ROOT/'archive-feed.json',{'items':[]})['items']
    items=list({i['id']:i for i in feed}.values())
    state=read(ROOT/'annex-state.json',{'tenders':{}})
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        jobs=[pool.submit(inspect,i,state['tenders'].get(i['id'],{})) for i in items]
        for job in concurrent.futures.as_completed(jobs):
            id,result=job.result();state['tenders'][id]=result
            state['checkedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
            write(ROOT/'annex-state.json',state)
            print(id,result['status'],sum(len(d.get('routeFiles',[])) for d in result.get('documents',{}).values()),flush=True)


if __name__=='__main__':main()
