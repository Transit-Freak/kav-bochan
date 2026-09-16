"""Read-only bounded portal audit. No login, cookies, or non-public endpoints.
Run manually: python scripts/check_portal.py. Not a scheduled service.
"""
import concurrent.futures, datetime, hashlib, html, json, pathlib, re, urllib.parse, urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
BASE='https://mr.gov.il'
# www.gov.il מחזיר 403 לבקשות בלי כותרות של דפדפן (ריצה מגיטהאב); הכותרות האלה הן של דפדפן רגיל
HEADERS={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
 'Accept':'text/html,application/xhtml+xml,application/pdf,application/xml;q=0.9,*/*;q=0.8','Accept-Language':'he-IL,he;q=0.9,en;q=0.7'}
def get(url,limit=15000000):
 url=urllib.parse.quote(url,safe=':/?=&%')
 req=urllib.request.Request(url,headers={**HEADERS,'Referer':'https://www.gov.il/' if 'www.gov.il' in url else 'https://mr.gov.il/'})
 with urllib.request.urlopen(req,timeout=30) as r:
  b=r.read(limit+1)
  return b[:limit],len(b)>limit,r.status,r.headers.get('Content-Type','')
def page(n):
 params={'q':'מוניות:updateDate','page':n}
 url=BASE+'/ilgstorefront/he/search/ajaxHtml/?'+urllib.parse.urlencode(params)
 try:
  b,cut,status,mime=get(url);s=b.decode();ids=re.findall(r'href="/ilgstorefront/he/p/(\d+)"',s)
  stat=lambda key:int(re.search(r'id="'+key+r'"[^>]*>\s*(\d+)',s).group(1))
  return {'page':n,'url':url,'ids':list(dict.fromkeys(ids)),'total':stat('totalResults'),'pages':stat('numberOfPages'),'returnedPage':stat('currentPage'),'ok':not cut and stat('currentPage')==n}
 except Exception as e:return {'page':n,'url':url,'ok':False,'error':str(e)}
def attachment(url):
 try:
  b,cut,status,mime=get(url)
  return {'url':url,'httpStatus':status,'bytesRead':len(b),'complete':not cut,'format':'pdf' if b.startswith(b'%PDF') else 'zip_or_office' if b.startswith(b'PK') else 'other','sha256':hashlib.sha256(b).hexdigest() if not cut else None}
 except Exception as e:return {'url':url,'error':str(e),'complete':False}
def main():
 first=page(0)
 if not first['ok']:raise RuntimeError(first)
 if first['pages']>15:raise RuntimeError('Search grew beyond audit bound; review before expanding')
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex: pages=[first]+list(ex.map(page,range(1,first['pages'])))
 # Retry only failed pages once; keep failures explicit.
 for i,result in enumerate(pages):
  if not result['ok']: pages[i]=page(result['page'])
 ids=[i for p in pages for i in p.get('ids',[])]
 print('Pages checked:',len(pages),'records:',len(ids),flush=True)
 documents=[]
 for tender_id in ['632739','4000611926']:
  u=BASE+'/ilgstorefront/he/p/'+tender_id
  try:
   b,cut,status,mime=get(u);s=b.decode()
  except Exception as e:
   documents.append({'tenderId':tender_id,'url':u,'error':str(e),'attachmentsFound':None,'attachments':[]});continue
  links=list(dict.fromkeys(BASE+html.unescape(x) for x in re.findall(r'href="(/ilgstorefront/he/p/attachment/[^\"]+)"',s)))
  links=list({u.split('/')[-2]:u for u in links}.values())
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex: checked=list(ex.map(attachment,links))
  documents.append({'tenderId':tender_id,'url':u,'attachmentsFound':len(links),'attachments':checked})
 report={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scheduled':False,'query':'מוניות','pages':pages,'records':len(ids),'uniqueRecords':len(set(ids)),'duplicates':len(ids)-len(set(ids)),'matchesPortalTotal':len(set(ids))==first['total'],'allPagesValidated':all(p['ok'] for p in pages),'documents':documents,'limitations':['Keyword search includes unrelated results; eligibility classification is separate.','Successful retrieval does not prove all annexes were published.','No automatic schedule is configured.','This audit does not claim nationwide tender coverage.']}
 out=ROOT/'access-check.json';out.write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in report.items() if k not in ['pages','documents']},ensure_ascii=False));print('attachments',[(d['tenderId'],d['attachmentsFound'],sum(a['complete'] for a in d['attachments'])) for d in documents])
if __name__=='__main__':main()
