"""One daily acquisition + analysis pass; semantic reader follows the generated queue."""
import datetime,json,pathlib,subprocess,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
steps=[]
for script,args in [('refresh_feed.py',[]),('package_pipeline.py',['--limit','600']),('ocr_pages.py',['--limit','200']),('analyze_packages.py',[]),('extract_route_tables.py',[]),('route_mentions.py',[]),('audit_routes.py',[])]:
 result=subprocess.run([sys.executable,str(ROOT/'scripts'/script),*args])
 steps.append({'script':script,'ok':result.returncode==0})
 # Keep going on a partial source outage; never skip existing documents.
(ROOT/'pipeline-health.json').write_text(json.dumps({'attemptedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'steps':steps,'semanticReviewComplete':False},ensure_ascii=False,indent=2))
raise SystemExit(0 if all(s['ok'] for s in steps) else 1)
