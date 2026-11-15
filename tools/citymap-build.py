# -*- coding: utf-8 -*-
# מרנדר את כל הערים בכל רמות התצוגה (פנימיים / + מטרופוליניים / כל הקווים).
# שימוש: python3 tools/citymap-build.py <תיקיית קבצי העיר> <תיקיית הפלט maps>
# הדף של רמת ברירת המחדל הוא <עיר>.html; שאר הרמות <עיר>.<רמה>.html. רמה שאין בה שני
# קווים, או שזהה לרמה שלפניה, לא מרונדרת (הכפתור שלה במתג כבוי).
import json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
src,out=sys.argv[1],sys.argv[2]
render=os.path.join(os.path.dirname(os.path.abspath(__file__)),'citymap-render.py')
os.makedirs(out,exist_ok=True)
jobs=[]
for c in json.load(open(os.path.join(src,'cities.json'),encoding='utf-8')):
    prev=None
    for t in ('internal','metro','all'):
        n=c['n'][t]
        if t==c['def'] or (n>=2 and n!=prev):
            jobs.append((c['name'],t,os.path.join(out,c['name']+('' if t==c['def'] else '.'+t)+'.html')))
        prev=n
def run(j):
    name,t,o=j
    r=subprocess.run([sys.executable,render,os.path.join(src,name+'.json'),o],env=dict(os.environ,TIER=t),capture_output=True,text=True)
    return (name,t,r.returncode,r.stderr[-400:])
bad=0
with ThreadPoolExecutor(max_workers=os.cpu_count() or 2) as ex:
    for name,t,rc,err in ex.map(run,jobs):
        if rc: bad+=1; print('נכשל:',name,t,err)
print('דפים:',len(jobs),'| נכשלו:',bad)
sys.exit(1 if bad else 0)
