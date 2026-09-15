"""One collection iteration. Scheduled runner must commit and publish after validation.
Only metadata is auto-published. A missing document never erases prior metadata.
"""
import datetime,hashlib,html,json,pathlib,re,urllib.parse
from html.parser import HTMLParser
from check_portal import get
ROOT=pathlib.Path(__file__).resolve().parents[1]
FEED=ROOT/'tenders-feed.json'
QUERY='קווי:updateDate:officeName:משרד התחבורה והבטיחות בדרכים'
class Text(HTMLParser):
 def __init__(self):super().__init__();self.parts=[];self.ignore=0
 def handle_starttag(self,t,a):
  if t in ('script','style'):self.ignore+=1
 def handle_endtag(self,t):
  if t in ('script','style'):self.ignore=max(0,self.ignore-1)
 def handle_data(self,s):
  if not self.ignore and s.strip():self.parts.append(s.strip())
def clean(s):
 p=Text();p.feed(s);return ' '.join(p.parts)
def parse_page(s,n):
 stat=lambda k:int(re.search(r'id="'+k+r'"[^>]*>\s*(\d+)',s).group(1))
 if stat('currentPage')!=n:raise ValueError('Unexpected page number')
 entries=[]
 for block in s.split('class="result-container"')[1:]:
  mid=re.search(r'href="/ilgstorefront/he/p/(\d+)"',block);title=re.search(r'<h2[^>]*>(.*?)</h2>',block,re.S)
  if not mid or not title:raise ValueError('Unrecognized result card')
  text=clean(block);field=lambda name:(re.search(name+r'\s*([^|]+?)(?=\s*\||תאריך פרסום:|תאריך עדכון:|מועד אחרון להגשה:|$)',text).group(1).strip() if re.search(name+r'\s*([^|]+?)(?=\s*\||תאריך פרסום:|תאריך עדכון:|מועד אחרון להגשה:|$)',text) else None)
  date=lambda name:(re.search(name+r'\s*(\d{2}/\d{2}/\d{4}(?:\s+\d{2}:\d{2})?)',text).group(1) if re.search(name+r'\s*(\d{2}/\d{2}/\d{4}(?:\s+\d{2}:\d{2})?)',text) else None)
  title=clean(title.group(1));kind='taxi' if 'מוניות' in title else 'bus' if 'אוטובוס' in title or 'מטרונית' in title else 'other'
  operating=bool(re.search(r'קבלת ר[יש]+ונות|להפעלת קווי',title)) and not any(x in title for x in ['קול קורא','אבטחה','בקרה','התייחסות הציבור'])
  entries.append({'id':mid.group(1),'title':title,'type':kind,'classification':'operating_tender' if operating else 'needs_review','number':field('מס׳ הליך:'),'status':field('סטטוס:'),'published':date('תאריך פרסום:'),'updated':date('תאריך עדכון:'),'deadline':date('מועד אחרון להגשה:'),'url':'https://mr.gov.il/ilgstorefront/he/p/'+mid.group(1)})
 return entries,stat('totalResults'),stat('numberOfPages')
def fetch_page(n):
 u='https://mr.gov.il/ilgstorefront/he/search/ajaxHtml/?'+urllib.parse.urlencode({'q':QUERY,'page':n})
 error=None
 for attempt in range(2):
  try:
   b,cut,_,_=get(u)
   if cut:raise ValueError('Truncated search response')
   return parse_page(b.decode(),n)
  except Exception as e:error=e
 raise error
def merge(old,records,now):
 previous={x['id']:x for x in old.get('items',[])};items=[];changes=[]
 for item in records:
  prior=previous.pop(item['id'],None)
  # Compare only source metadata; internal markers are not source changes.
  changed=prior is not None and any(prior.get(k)!=v for k,v in item.items())
  if prior is None and old.get('items'):changes.append({'id':item['id'],'kind':'discovered','at':now})
  elif changed:changes.append({'id':item['id'],'kind':'updated','at':now})
  item.update(firstSeen=prior.get('firstSeen',now) if prior else now,lastSeen=now,summaryStatus=prior.get('summaryStatus','pending') if prior else 'pending',missingFromLatestSearch=False)
  items.append(item)
 # Disappearance is not evidence of cancellation.
 for prior in previous.values():items.append({**prior,'missingFromLatestSearch':True})
 return {'schemaVersion':1,'checkedAt':now,'query':QUERY,'coverage':'Ministry publisher + keyword קווי. Other wording/publishers may be missed.','items':items,'changes':(changes+old.get('changes',[]))[:200]}
def main():
 old=json.loads(FEED.read_text()) if FEED.exists() else {};now=datetime.datetime.now(datetime.timezone.utc).isoformat()
 try:
  records,total,pages=fetch_page(0)
  if pages>10:raise ValueError('Search exceeds bounded page limit; preserve prior feed')
  for n in range(1,pages):
   batch,t,p=fetch_page(n)
   if (t,p)!=(total,pages):raise ValueError('Pagination changed during scan; retry later')
   records+=batch
  if len(records)!=total or len({x['id'] for x in records})!=total:raise ValueError('Incomplete or duplicate page results')
  feed=merge(old,records,now);feed['lastRun']={'ok':True,'pages':pages,'records':total}
  # Atomic write prevents a partially written JSON publication.
  tmp=FEED.with_suffix('.tmp');tmp.write_text(json.dumps(feed,ensure_ascii=False,indent=2));tmp.replace(FEED)
  print(json.dumps({'ok':True,'records':total,'pages':pages,'operatingCandidates':sum(x['classification']=='operating_tender' for x in records)},ensure_ascii=False))
 except Exception as e:
  # Existing feed remains unchanged; separate health state records the failure.
  (ROOT/'collection-health.json').write_text(json.dumps({'ok':False,'attemptedAt':now,'error':str(e)},ensure_ascii=False,indent=2));print('Collection failed; previous feed preserved:',str(e));return 1
 (ROOT/'collection-health.json').write_text(json.dumps({'ok':True,'attemptedAt':now},indent=2));return 0
if __name__=='__main__':
 portal_status = main()
 from refresh_archive import main as refresh_archive
 archive_status = refresh_archive()
 raise SystemExit(portal_status or archive_status)
