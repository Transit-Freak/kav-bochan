"""Bounded, version-separated extraction. Never infer amendment precedence."""
import datetime
import hashlib
import json
import subprocess
from check_portal import get
from tender_fields import blank


def reconcile(versions):
    merged = blank()
    for key in merged:
        values = [v[key] for v in versions if v[key]['status'] in ('verified', 'verified_conditional', 'conflict')]
        if not values:
            continue
        def signature(v):
            data={k:v.get(k) for k in ('value','unit','currency','vat','period')}
            if v.get('conditions'):
                data['conditions']=[{k:x for k,x in c.items() if k!='sources'} for c in v['conditions']]
            return json.dumps(data,sort_keys=True,ensure_ascii=False)
        signatures = {signature(v) for v in values}
        sources = [s for v in values for s in (v.get('sources', [])+[s for c in v.get('conditions',[]) for s in c.get('sources',[])])]
        if len(signatures)>1 or any(v['status']=='conflict' for v in values):
            merged[key].update(status='conflict', value=None, sources=sources,
                               reason='נמצאו ערכים שונים במסמכים; טרם אומת איזה נוסח חל.')
        else:
            merged[key] = {**values[0], 'sources':sources}
    return merged


def process_versions(item, previous, result, urls, cache):
    from extract_documents import clean, extract
    records = dict(previous.get('versions', {}))
    # Oldest unchecked versions first; large tenders progress across daily runs.
    pending = sorted(urls, key=lambda u: records.get(u, {}).get('attemptedAt', ''))
    incoming = []
    for url in pending[:8]:
        record = {**records.get(url, {}), 'attemptedAt':result['attemptedAt'], 'url':url}
        try:
            body, cut, _, _ = get(url, 30000000)
            if cut or not body.startswith(b'%PDF'):
                raise ValueError('הקובץ אינו PDF מלא; ייתכן שזה נספח הדורש פענוח נפרד.')
            digest = hashlib.sha256(body).hexdigest()
            path = cache / (digest+'.pdf'); path.write_bytes(body)
            text = subprocess.run(['pdftotext','-layout',str(path),'-'], capture_output=True,text=True,check=True,timeout=90).stdout
            pages = [clean(p) for p in text.split('\f')]
            fields, error = extract(pages,item,url,digest)
            record.update(sha256=digest, pages=len(pages)-(not pages[-1]),
                          status='needs_review' if error else 'parsed', reason=error,
                          lastSuccessAt=result['attemptedAt'])
            # Retain old successful fields separately when current identity fails.
            if not error:
                record['fields'] = fields
                incoming.append(fields)
        except Exception as error:
            record.update(status='retry_pending', reason=str(error))
        records[url] = record
    # Include successful historical versions so conflicts survive partial failures.
    versions = [r['fields'] for u,r in records.items() if u in urls and r.get('fields')]
    merged = reconcile(versions) if versions else None
    result.update(versions=records, status='partial' if merged else 'needs_review',
                  reason='מסמכי המכרז נבדקים בנפרד; התאמת ההבהרות והנספחים טרם הושלמה.',
                  verifiedFields=sum(f['status']=='verified' for f in merged.values()) if merged else 0,
                  nextCheckAt=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=20)).isoformat())
    return item['id'], result, merged
