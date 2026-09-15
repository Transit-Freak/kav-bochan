"""Read official tender PDFs, extract supported clauses, keep unresolved fields null.

No model/API service. Poppler is required. All 40 fields are tracked; unsupported
wording is not automatically verified. Published values describe a named document
version, not a claim that every subsequent amendment has been reconciled.
"""
import argparse
import concurrent.futures
import datetime
import hashlib
import html
import json
import pathlib
import re
import subprocess
import tempfile
import urllib.parse

from check_portal import get
from refresh_feed import ROOT
from tender_fields import blank, validate

STATE = ROOT / 'extraction-state.json'
FIELDS = ROOT / 'structured-tenders.json'
VERSION = 3
NOTE = 'לפי גרסת מסמך המכרז המקושרת. ההבהרות המאוחרות עדיין דורשות בדיקה ועשויות לשנות את התנאים.'


def read(path, default):
    return json.loads(path.read_text()) if path.exists() else default


def write(path, data):
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    tmp.replace(path)


def clean(text):
    return re.sub(r'\s+', ' ', re.sub('[\u202a-\u202e\u200e\u200f]', '', text)).strip()


def section(pages, number, following):
    # Anchored section numbers avoid references such as 17.14.1 and the contents.
    joined = '\n'.join(pages)
    start = re.search(r'(?<![\d.])' + re.escape(number) + r'(?!\d)', joined)
    if not start:
        return None
    end = re.search(r'(?<![\d.])' + re.escape(following) + r'(?!\d)', joined[start.end():])
    stop = start.end() + end.start() if end else start.start() + 2500
    return joined[start.start():min(stop, start.start() + 3000)], joined[:start.start()].count('\n') + 1


def extract(pages, item, url, digest):
    fields = blank()
    for f in fields.values():
        f['reason'] = 'המסמך נקרא, אך השדה הזה עדיין דורש בדיקה של הסעיף וההבהרות.'
    head = ' '.join(pages[:2])
    number = re.search(r'(?:הליך תחרותי|מכרז)\s*(?:מספר|מס[\'׳.]*)?\s*(\d{1,3}/(?:20)?\d{2})(?!\d)', head)
    expected = str(item.get('number') or '').strip()
    def normalize_number(n):
        if not re.fullmatch(r'\d{1,3}[/\.]\d{2,4}', n):
            return (n,)
        serial, year = map(int, re.split(r'[/\.]', n))
        return serial, year + 2000 if year < 100 else year
    if not number or (expected and normalize_number(expected) != normalize_number(number[1])):
        return fields, 'לא אומתה התאמה בין מספר המכרז במסמך לבין הפרסום.'
    def put(key, value, page, clause='', **extra):
        fields[key].update(status='verified', value=value, reason=None, notes=NOTE,
            sources=[{'tenderId': item['id'], 'fieldKey': key, 'url': url + '#page=' + str(page),
                      'locator': f'עמוד PDF {page}' + (', סעיף ' + clause if clause else ''),
                      'sha256': digest, 'checkedAt': datetime.date.today().isoformat()}], **extra)
    put('identity.number', number[1], 1)
    if 'משרד התחבורה' in head:
        put('identity.issuer', 'משרד התחבורה והבטיחות בדרכים', 1)
    if 'באוטובוסים' in head:
        put('identity.mode', 'אוטובוסים', 1)
    elif 'מוניות שירות' in head:
        put('identity.mode', 'מוניות שירות', 1)
    # Cluster must be on the cover, not merely copied from a filename.
    cluster = re.search(r'אשכול\s+(.+?)(?=\s+(?:ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר|תוכן עניינים)|$)', pages[0])
    if cluster and len(cluster[1]) < 100:
        put('identity.cluster', cluster[1].strip(), 1)
    for key, first, following, title in [
        ('guarantee.bid', '14.1', '14.2', 'ערבות'),
        ('guarantee.performance', '15.1', '15.2', 'ערבות')]:
        found = section(pages, first, following)
        if not found:
            continue
        text, page = found
        if title not in text or not any(t in text for t in ('המציע יצרף', 'ימסור הזוכה')):
            continue
        matches = list(re.finditer(r'(?:בסכום של|על סך של)\s*([\d,]+)\s*(מיליון)?\s*\(?\s*(?:ש"ח|₪)', text))
        amounts = {int(m[1].replace(',', '')) * (1000000 if m[2] else 1) for m in matches}
        if len(amounts) == 1:
            amount_page = page + text[:matches[0].start()].count('\n')
            put(key, amounts.pop(), amount_page, first, currency='ILS', unit='total', vat='not_applicable', period='ערבות להצעה' if key.endswith('bid') else 'ערבות לקיום ההסכם')
        elif len(amounts) > 1:
            fields[key].update(status='conflict', reason='בסעיף נמצאו סכומים שונים; נדרשת בדיקת תחולתם.')
    for page, text in enumerate(pages, 1):
        if 'הקריטריונים והמשקלות לפיהם תבחנה ותדורגנה ההצעות' not in text:
            continue
        table = text.split('הקריטריונים והמשקלות לפיהם תבחנה ותדורגנה ההצעות', 1)[1]
        weight = re.search(r'(\d{1,3})\s+הצעה כספית', table)
        if weight and re.search(r'100\s+סה', table):
            put('scoring.price_weight', int(weight[1]), page, '28.2', unit='percent')
        break
    # Explicit phase durations: never collapse preparation and operation into one
    # unqualified value, or assume every tender follows the Northern Negev numbers.
    phases = []
    for page, text in enumerate(pages, 1):
        for m in re.finditer(r"(\d{1,2})\s*[:.]?\s*שנים\s+ו\s*[–-]?\s*(\d{1,2})\s*-?\s*חודשים\s+עבור\s+קווי\s+השירות\s+בשלב\s+([אב])", text):
            if 'תקופת ההכנות' not in text or '1.6.2' not in text:
                continue
            phases.append({'label': 'שלב ' + m[3] + ' כולל הכנות',
                           'value': int(m[1])*12+int(m[2]), 'unit':'months', 'comparison':'eq',
                           'sources':[{'tenderId':item['id'],'fieldKey':'term.base',
                                       'url':url+'#page='+str(page),'locator':f'עמוד PDF {page}, סעיף 1.6.2',
                                       'sha256':digest,'checkedAt':datetime.date.today().isoformat()}]})
    if len(phases)==2 and len({c['label'] for c in phases})==2:
        fields['term.base'].update(status='verified_conditional',value=None,conditions=phases,
            reason=None,notes='התקופות כוללות הכנות. כפוף לתנאי תחילת ההתקשרות, אפשרויות קיצור והבהרות במסמכי המקור.')
    from eligibility_fields import add_eligibility
    add_eligibility(fields, pages, item, url, digest)
    errors = validate(item['id'], fields)
    if errors:
        raise ValueError('; '.join(errors))
    return fields, None


def process(item, previous, link_state, cache):
    stamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    result = {**previous, 'attemptedAt': stamp, 'sourceVersion': item.get('updated'), 'sourceFingerprint': fingerprint(item), 'parserVersion': VERSION}
    links = []
    try:
        if urllib.parse.urlsplit(item['url']).path.lower().endswith('.pdf'):
            links = [item['url']]
            body = b''; cut = False
        else:
            body, cut, _, _ = get(item['url'])
        if cut:
            raise ValueError('Detail page truncated')
        links += list(dict.fromkeys('https://mr.gov.il' + html.unescape(u) for u in re.findall(r'href="(/ilgstorefront/he/p/attachment/[^\"]+)"', body.decode())))
    except Exception as error:
        result['listingError'] = str(error)
    if not links:
        links = [d['url'] for d in link_state.get('documents', [])]
    main = [item['url']] if urllib.parse.urlsplit(item['url']).path.lower().endswith('.pdf') else list({u.split('/')[-2]: u for u in links if any(t in urllib.parse.unquote(u) for t in ('מסמכי הליך', 'מסמכי המכרז', 'חוברת המכרז'))}.values())
    result['documentCandidates'] = main
    if not main:
        result.update(status='source_missing', reason='לא אותר קישור למסמך המכרז הראשי; פרטי הפרסום נשמרו.', nextCheckAt=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=6)).isoformat())
        return item['id'], result, None
    # Read each version separately; disagreements must not select an arbitrary winner.
    if len(main) != 1:
        from document_versions import process_versions
        return process_versions(item, previous, result, main, cache)
    url = main[0]
    try:
        pdf = cache / (item['id'] + '.pdf')
        # Re-download on every due check: a publisher may replace bytes at the same URL.
        body, cut, _, _ = get(url, 30000000)
        if cut or not body.startswith(b'%PDF'):
            raise ValueError('הקובץ חסר, גדול ממגבלת ההורדה או אינו PDF תקין.')
        pdf.write_bytes(body)
        digest = hashlib.sha256(pdf.read_bytes()).hexdigest()
        text = subprocess.run(['pdftotext', '-layout', str(pdf), '-'], capture_output=True, text=True, timeout=90, check=True).stdout
        pages = [clean(p) for p in text.split('\f')]
        if len(''.join(pages)) < 100:
            raise ValueError('המסמך סרוק או ללא טקסט קריא; נדרש OCR ובדיקה.')
        fields, error = extract(pages, item, url, digest)
        result.update(status='needs_review' if error else 'partial', reason=error,
                      document={'url': url, 'sha256': digest, 'pages': len(pages) - (not pages[-1])},
                      verifiedFields=sum(f['status']=='verified' for f in fields.values()),
                      lastSuccessAt=stamp, nextCheckAt=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=20)).isoformat())
        return item['id'], result, fields if not error else None
    except Exception as error:
        failures = previous.get('failures', 0) + 1
        result.update(status='retry_pending', reason=str(error), failures=failures,
                      nextCheckAt=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=min(24, 2**min(failures, 4)))).isoformat())
        return item['id'], result, None


def fingerprint(item):
    return hashlib.sha256(json.dumps({k: item.get(k) for k in ('title', 'number', 'updated', 'deadline', 'status', 'url')}, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def is_due(item, previous, now):
    return (previous.get('nextCheckAt', '') <= now or
            previous.get('sourceVersion') != item.get('updated') or
            previous.get('sourceFingerprint') != fingerprint(item) or
            previous.get('parserVersion') != VERSION)


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=40)
    parser.add_argument('--all', action='store_true', help='Check every collected operating tender, including those in backoff')
    parser.add_argument('--cache', default=str(pathlib.Path(tempfile.gettempdir()) / 'tender-extract'))
    args = parser.parse_args(argv)
    cache = pathlib.Path(args.cache); cache.mkdir(parents=True, exist_ok=True)
    state = read(STATE, {'tenders': {}}); fields = read(FIELDS, {})
    links = read(ROOT / 'documents-state.json', {'tenders': {}})['tenders']
    collected = read(ROOT / 'tenders-feed.json', {'items': []})['items'] + read(ROOT / 'archive-feed.json', {'items': []})['items']
    items = list({i['id']: i for i in collected if i['classification']=='operating_tender'}.values())
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    items.sort(key=lambda i: (state['tenders'].get(i['id'], {}).get('sourceFingerprint') == fingerprint(i), state['tenders'].get(i['id'], {}).get('attemptedAt', '')))
    due = items if args.all else [i for i in items if is_due(i, state['tenders'].get(i['id'], {}), now)][:max(1, min(args.limit, 40))]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        jobs = [pool.submit(process, i, state['tenders'].get(i['id'], {}), links.get(i['id'], {}), cache) for i in due]
        for job in concurrent.futures.as_completed(jobs):
            id, result, incoming = job.result()
            state['tenders'][id] = result
            if incoming:
                old = fields.setdefault(id, blank())
                for key, value in incoming.items():
                    prior = old[key]
                    if value['status'] in ('verified','verified_conditional') and prior['status'] not in ('verified', 'verified_conditional', 'conflict'):
                        old[key] = value
                    elif value['status'] in ('verified','verified_conditional') and prior['status'] in ('verified','verified_conditional'):
                        from document_versions import reconcile
                        old[key] = reconcile([{**blank(),key:prior},{**blank(),key:value}])[key]
                    elif value['status']=='conflict':
                        old[key] = {**value, 'sources':prior.get('sources', [])+value.get('sources', [])}
                    elif prior['status']=='unverified':
                        old[key].setdefault('reason', value.get('reason'))
            # Persist completed tenders immediately, even if a later download stalls.
            for field_id, field_data in fields.items():
                errors = validate(field_id, field_data)
                if errors:
                    raise ValueError(field_id + ': ' + '; '.join(errors))
            state['checkedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
            write(FIELDS, fields); write(STATE, state)
            print(id, result['status'], result.get('verifiedFields', 0), flush=True)
    for id, data in fields.items():
        errors = validate(id, data)
        if errors:
            raise ValueError(id + ': ' + '; '.join(errors))
    state['checkedAt'] = now
    write(FIELDS, fields); write(STATE, state)


if __name__ == '__main__':
    main()
