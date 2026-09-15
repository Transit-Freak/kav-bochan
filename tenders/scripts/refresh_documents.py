"""Refresh one tender's public document links, checking at most four files per run.
Backoff on failures; retain last successful hashes. No automatic map publication.
"""
import datetime,hashlib,html,json,re
from refresh_feed import ROOT,FEED
from check_portal import get,attachment
STATE=ROOT/'documents-state.json'
def next_retry(failures,now):return (now+datetime.timedelta(hours=min(24,2**min(failures-1,5)))).isoformat()
def main():
 now=datetime.datetime.now(datetime.timezone.utc);stamp=now.isoformat();state=json.loads(STATE.read_text()) if STATE.exists() else {'tenders':{}}
 items=json.loads(FEED.read_text())['items'];chosen=None
 items.sort(key=lambda x:state['tenders'].get(x['id'],{}).get('attemptedAt',''))
 for item in items:
  if item['classification']!='operating_tender':continue
  prior=state['tenders'].get(item['id'],{})
  if prior.get('sourceVersionAttempted')!=item.get('updated') or prior.get('nextCheckAt','')<=stamp:chosen=item;break
 if not chosen:print('No document checks due');return
 prior=state['tenders'].get(chosen['id'],{});entry={**prior,'sourceUrl':chosen['url'],'attemptedAt':stamp,'sourceVersionAttempted':chosen.get('updated')}
 try:
  b,cut,_,_=get(chosen['url'])
  if cut:raise ValueError('Truncated detail page')
  links=list({u.split('/')[-2]:u for u in ['https://mr.gov.il'+html.unescape(x) for x in re.findall(r'href="(/ilgstorefront/he/p/attachment/[^\"]+)"',b.decode())]}.values())
  if not links:raise ValueError('No attachment links in current detail response')
  old={x['url'].split('/')[-2]:x for x in prior.get('documents',[])};docs=[];checks=0
  for u in links:
   previous=old.pop(u.split('/')[-2],{});doc={**previous,'url':u,'presentInLatestListing':True}
   if checks<4 and (not previous or previous.get('nextCheckAt','')<=stamp or prior.get('sourceUpdated')!=chosen.get('updated')):
    checks+=1;result=attachment(u);doc['attemptedAt']=stamp
    valid=result.get('complete') and result.get('format') in ('pdf','zip_or_office')
    if valid:doc.update(status='download_verified',sha256=result['sha256'],lastSuccessAt=stamp,failures=0,nextCheckAt=(now+datetime.timedelta(days=7)).isoformat(),error=None)
    else:
     failures=previous.get('failures',0)+1;doc.update(status='retry_pending',failures=failures,error=result.get('error','Incomplete or unexpected file format'),nextCheckAt=next_retry(failures,now))
   else:doc.setdefault('status','pending')
   docs.append(doc)
  # An absent link is not silently discarded.
  docs += [{**d,'presentInLatestListing':False} for d in old.values()]
  entry.update(documents=docs,sourceUpdated=chosen.get('updated'),error=None,linkCheckSucceededAt=stamp,nextCheckAt=(now+datetime.timedelta(hours=1)).isoformat())
 except Exception as e:
  failures=prior.get('failures',0)+1;entry.update(error=str(e),failures=failures,nextCheckAt=next_retry(failures,now))
 state['tenders'][chosen['id']]=entry;state['checkedAt']=stamp
 tmp=STATE.with_suffix('.tmp');tmp.write_text(json.dumps(state,ensure_ascii=False,indent=2));tmp.replace(STATE);print('Checked tender',chosen['id'],'error:',entry.get('error'))
if __name__=='__main__':
 main()
 # Content extraction has its own fair queue; run it even if no link checks were due.
 from extract_documents import main as extract_main
 extract_main([])
