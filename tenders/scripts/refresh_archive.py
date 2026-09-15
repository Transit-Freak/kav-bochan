"""Bounded archive discovery. Keep known records on blocked/changed source HTML.
Search-index discoveries are leads, not full-document verification.
"""
import datetime, hashlib, json, pathlib, urllib.parse
from html.parser import HTMLParser
from check_portal import get
ROOT = pathlib.Path(__file__).resolve().parents[1]
PAGE = 'https://www.gov.il/he/departments/guides/agreements_for_operating_service_lines_in_public_transportation'
PREFIX = '/BlobFolder/guide/agreements_for_operating_service_lines_in_public_transportation/'

class Links(HTMLParser):
 def __init__(self):
  super().__init__(); self.links = {}; self.url = None; self.label = []
 def handle_starttag(self, tag, attrs):
  if tag == 'a':
   url = urllib.parse.urljoin(PAGE, dict(attrs).get('href', ''))
   p = urllib.parse.urlsplit(url)
   self.url = url if p.scheme == 'https' and p.hostname == 'www.gov.il' and p.path.startswith(PREFIX) and p.path.lower().endswith(('.pdf', '.docx', '.zip', '.xlsx')) else None
   self.label = []
 def handle_data(self, data):
  if self.url: self.label.append(data)
 def handle_endtag(self, tag):
  if tag == 'a' and self.url:
   self.links[self.url] = ' '.join(' '.join(self.label).split()) or 'מסמך ארכיון ללא כותרת'; self.url = None

def collect(previous, seeds, now, fetch=get):
 items = {x['url']: x for x in previous.get('items', [])}
 for seed in seeds:
  items.setdefault(seed['url'], seed)
 report = {'attemptedAt': now, 'ok': False, 'sourceUrl': PAGE, 'coverage': 'partial'}
 for attempt in range(2):
  try:
   body, truncated, _, _ = fetch(PAGE)
   if truncated: raise ValueError('Truncated archive page')
   parser = Links(); parser.feed(body.decode('utf-8'))
   if not parser.links: raise ValueError('No archive links found; source may require JavaScript or use an unfamiliar layout')
   if len(parser.links) > 500: raise ValueError('Archive exceeds bounded limit')
   for url, title in parser.links.items():
    if url not in items:
     items[url] = {'id': 'archive-' + hashlib.sha256(url.encode()).hexdigest()[:16], 'url': url, 'title': title, 'type': 'other', 'classification': 'needs_review', 'number': None, 'status': 'מסמך ארכיון · דורש מיון', 'published': None, 'updated': None, 'deadline': None, 'winner': None, 'discovery': 'archive_listing', 'evidence': {'url': PAGE, 'locator': 'קישור למסמך בארכיון'}, 'summaryStatus': 'pending'}
    items[url]['lastSeenInArchive'] = now
   report.update(ok=True, linksFound=len(parser.links), error=None); break
  except Exception as exc:
   report['error'] = str(exc)
   if getattr(exc, 'code', None) in (403, 404): break
 return {'schemaVersion': 1, 'source': PAGE, 'lastRun': report, 'items': list(items.values())}

def main():
 path = ROOT / 'archive-feed.json'
 previous = json.loads(path.read_text()) if path.exists() else {}
 seeds = json.loads((ROOT / 'archive-seeds.json').read_text())
 result = collect(previous, seeds, datetime.datetime.now(datetime.timezone.utc).isoformat())
 tmp = path.with_suffix('.tmp'); tmp.write_text(json.dumps(result, ensure_ascii=False, indent=2)); tmp.replace(path)
 print(json.dumps({'archiveRecords': len(result['items']), **result['lastRun']}, ensure_ascii=False))
 return 0 if result['lastRun']['ok'] else 1

if __name__ == '__main__': raise SystemExit(main())
