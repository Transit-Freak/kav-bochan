# מסנן בין topo ל-loom: מסיר "איסורי פנייה" שגויים שגורמים לקו להיקטע.
# topo מסיק שקו לא ממשיך בין שתי קשתות בצומת. כשהקו נמצא בצומת על שתי קשתות בלבד, האיסור
# ביניהן אומר שהקו נקטע שם — וזה תמיד שגוי אצלנו (כל קו הוא מסלול רציף אחד). איסורים בצומת
# שבו הקו נמצא על שלוש קשתות ומעלה נשארים: הם מה שמונע חיבורים מדומים ("שרבוטים").
import json,sys,collections
d=json.load(sys.stdin)
at=collections.defaultdict(lambda: collections.defaultdict(set))   # צומת -> קו -> שכנים
for f in d['features']:
    p=f['properties']
    if f['geometry']['type']=='LineString':
        for l in p.get('lines',[]): at[p['from']][l['id']].add(p['to']); at[p['to']][l['id']].add(p['from'])
drop=keep=0
for f in d['features']:
    p=f['properties']
    if f['geometry']['type']=='Point' and p.get('excluded_conn'):
        new=[e for e in p['excluded_conn'] if len(at[p['id']][e['line']])>=3]
        # גם בצומת עם 3 קשתות ומעלה: קשת שכל ההמשכים שלה נאסרו היא קו שנקטע — מחזירים לה את החיבורים
        for l in {e['line'] for e in new}:
            nb=at[p['id']][l]; ex={frozenset((e['node_from'],e['node_to'])) for e in new if e['line']==l}
            dead={a for a in nb if all(frozenset((a,b)) in ex for b in nb if b!=a)}
            new=[e for e in new if not (e['line']==l and (e['node_from'] in dead or e['node_to'] in dead))]
        drop+=len(p['excluded_conn'])-len(new); keep+=len(new)
        if new: p['excluded_conn']=new
        else: del p['excluded_conn']
json.dump(d,sys.stdout)
print('איסורי פנייה: הוסרו',drop,'נשארו',keep,file=sys.stderr)
