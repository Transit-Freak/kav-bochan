"""Locate route references in ALL units; candidates are never verified route facts.

The scheduled language-model reader reads full surrounding units and emits
routeNotes through apply_review.py. Number matches alone never join routes.
"""
import collections,hashlib,json,re
from package_pipeline import CACHE,STATE
from extract_documents import ROOT,read,write
NUMBER=r'(?:N\s*)?\d{1,4}[א-ת]?'
GROUP=re.compile(r'(?<![א-ת])(?:קו(?:וים)?|קוי|קווי)(?:\s+(?:מספר|מס[׳\x27]))?\s*[:：]?\s*('+NUMBER+r'(?:\s*[,/ו־–-]+\s*'+NUMBER+r')*)')
CHANGE=re.compile(r'שינויים?\s+(?:במסלול|בהפעל|בשירות)|(?:ישונה|ישתנה|יוחלף|ימוספר|יבוטל|יפוצל|יוארך|יקוצר)|חלופות|תחנות|תדירות|לוח(?:ות)?\s+זמנים')

def locate(units):
    candidates=[]
    for i,u in enumerate(units):
        text=u.get('text','')
        numbers=sorted({n.replace(' ','') for m in GROUP.finditer(text) for n in re.findall(NUMBER,m[1])})
        # Varied PDF reading order puts catalog IDs/parentheses between 'route'
        # and its number. Broaden discovery, NEVER the verified joining rule.
        has_route=bool(re.search(r'(?<![א-ת])(?:קו|קווים|קווי|קוי)(?![א-ת])',text))
        if has_route:
            numbers=sorted(set(numbers)|set(re.findall(r'(?<![\d.])\d{1,4}(?![\d.])',text)))
        change=bool(CHANGE.search(text))
        if not has_route and not change:continue
        candidates.append({'unit':i,'page':u.get('page'),'member':u.get('member',''),
                           'sheet':u.get('sheet'),'numbers':numbers,'hasChangeLanguage':change,
                           'contextUnits':[n for n in range(max(0,i-1),min(len(units),i+2))
                                           if units[n].get('member','')==u.get('member','')]})
    return candidates

def main():
    state=read(STATE,{'tenders':{}});groups={};report={'tenders':{}}
    for tid,tender in state['tenders'].items():
        documents={};groups[tid]=[]
        for key,doc in tender['documents'].items():
            digest=doc.get('sha256');path=CACHE/str(digest)/'units.json'
            if not digest or not path.exists():continue
            data=json.loads(path.read_text());units=data['units'];found=locate(units)
            # Do not treat a past generic field review as a route-context review.
            checked=set(doc.get('routeReviewedUnits',[]))
            pending=[c for c in found if c['unit'] not in checked]
            for c in pending:
                groups[tid].append({'tenderId':tid,'documentKey':key,'sha256':digest,'url':doc['url'],**c})
            documents[key]={'sha256':digest,'unitsScanned':len(units),'candidateUnits':len(found),
                            'pendingContextReviews':len(pending),'routeReviewComplete':False}
        report['tenders'][tid]={'documents':documents,'pendingContextReviews':len(groups[tid])}
    queue=[g[i] for i in range(max((len(g) for g in groups.values()),default=0)) for g in groups.values() if i<len(g)]
    (CACHE/'route-review-queue.json').write_text(json.dumps(queue,ensure_ascii=False))
    # Progress only: no unreviewed snippets or inferred route details are published.
    write(ROOT/'route-context-state.json',report)
    print('Route-context scan:',len(report['tenders']),'tenders;',sum(len(t['documents']) for t in report['tenders'].values()),'documents;',len(queue),'pending context reviews')

if __name__=='__main__':main()
