"""Analyze all decoded document units. Rules produce sourced facts, never a full-read claim."""
import datetime
import json
import pathlib
import re
from extract_documents import ROOT, read, write, extract, clean
from package_pipeline import CACHE, STATE
from tender_fields import blank, validate

TOPICS = {
 'identity.number':r'מכרז|הליך תחרותי', 'identity.issuer':r'משרד התחבורה',
 'identity.cluster':r'אשכול', 'identity.mode':r'אוטובוס|מוניות',
 'dates.publication':r'פרסום', 'dates.submission':r'הגשת הצעות|הגשת ההצעות',
 'dates.questions':r'שאלות הבהרה|שאלות ובקשות', 'dates.service_start':r'תחילת ההפעלה|תחילת השירות',
 'term.base':r'תקופת ההפעלה|תקופת ההתקשרות', 'term.extension':r'הארכ|להאריך',
 'eligibility.turnover':r'מחזור', 'eligibility.equity':r'הון עצמי',
 'eligibility.experience':r'ניסיון', 'eligibility.licenses':r'מיון מוקדם|רישיונות',
 'eligibility.fleet':r'תנאי סף|תנאי הסף', 'eligibility.drivers':r'נהגים',
 'guarantee.bid':r'ערבות.*הצע|המציע יצרף', 'guarantee.performance':r'ערבות.*ביצוע|ימסור הזוכה',
 'fleet.operating':r'מצבת|כלי רכב|צי האוטובוסים', 'fleet.reserve':r'רזרב|עתוד',
 'fleet.seats':r'מושבים|מקומות ישיבה', 'fleet.electric_share':r'חשמל',
 'fleet.max_age':r'גיל.*רכב|גיל.*אוטובוס|גיל.*מיניבוס', 'fleet.accessibility':r'נגיש|מוגבלות',
 'service.routes':r'קווים|מפרטי הקו', 'service.variants':r'חלופ',
 'service.weekly_trips':r'שבוע|נסיעות', 'service.annual_km':r'קילומטר|ק"מ',
 'service.operating_hours':r'שעות פעילות|שעות ההפעלה', 'service.frequency':r'תדירות|תדירויות',
 'price.per_km':r'עלות.*ק"מ|מחיר.*ק"מ', 'price.ceiling_per_km':r'מחיר מרבי|מחיר מירבי|מחיר מקסימ',
 'price.fixed_payment':r'תשלום קבוע|סובסידיה', 'price.indexation':r'הצמד|מדד',
 'scoring.price_weight':r'הצעה כספית|משקל המחיר', 'scoring.quality_weight':r'איכות|ניקוד',
 'scoring.minimum_quality':r'ניקוד.*מינימ|סף.*איכות', 'penalties.amount':r'פיצוי מוסכם|פיצויים מוסכמים',
 'award.winner':r'זכתה|זוכה|זכייה', 'award.awarded_price':r'ההצעה הזוכה|מחיר הזכייה'}


def route_rows(unit, url, digest):
    """Only explicit table columns; route references in prose are not a route inventory."""
    rows = unit.get('rows', [])
    result=[]; header=None
    for index, row in enumerate(rows):
        cells=[clean(c) for c in row]
        number=next((i for i,c in enumerate(cells) if c in ('קו','מספר קו','מספר הקו','מס\' קו','מס׳ קו')),None)
        origin=next((i for i,c in enumerate(cells) if c in ('מוצא','ישוב מוצא','יישוב מוצא','שם יישוב מוצא','שם ישוב מוצא','תחנת מוצא')),None)
        dest=next((i for i,c in enumerate(cells) if c in ('יעד','ישוב יעד','יישוב יעד','שם יישוב יעד','שם ישוב יעד','תחנת יעד')),None)
        if number is not None and origin is not None and dest is not None:
            header=(number,origin,dest);columns={c:i for i,c in enumerate(cells)};continue
        if header is None:continue
        n,o,d=header
        if max(header)>=len(cells) or not re.fullmatch(r'\d{1,4}[א-ת]?',cells[n]):continue
        if not re.search('[א-ת]',cells[o]) or not re.search('[א-ת]',cells[d]):continue
        result.append({'number':cells[n], 'area':cells[o], 'destination':cells[d],
                       'description':f'מ{cells[o]} אל {cells[d]}', 'page':unit['page'],
                       'direction':cells[columns['כיוון']] if 'כיוון' in columns else None,
                       'variant':cells[columns['חלופה']] if 'חלופה' in columns else None,
                       'catalogNumber':cells[columns['מקט']] if 'מקט' in columns else None,
                       'originStop':cells[columns['שם תחנת מוצא']] if 'שם תחנת מוצא' in columns else None,
                       'destinationStop':cells[columns['שם תחנת יעד']] if 'שם תחנת יעד' in columns else None,
                       'weeklyTrips':cells[columns['כמות נסיעות שבועיות']] if 'כמות נסיעות שבועיות' in columns else None,
                       'sheet':unit.get('sheet'), 'member':unit.get('member',''), 'row':index+1,
                       'url':url,'sha256':digest,'coverage':'טבלת המקור; כיוונים וחלופות דורשים בדיקה'})
    return result


def analyze_document(tid,item,doc,units):
    fields=blank();automatic=False
    # Only a PDF with a matching cover can act as the base tender, irrespective of filename.
    if len(units)>50 and all(not u.get('member') and not u.get('sheet') and not u.get('block') for u in units):
        fields,error=extract([u['text'] for u in units],item,doc['url'],doc['sha256'])
        automatic=error is None
    hits={k:[] for k in TOPICS};routes=[];maps=[]
    for index,unit in enumerate(units):
        for key,pattern in TOPICS.items():
            if re.search(pattern,unit['text']):hits[key].append(index)
        routes.extend(route_rows(unit,doc['url'],doc['sha256']))
        # Candidate only; an incidental reference to a map must never publish a map image.
        if re.search(r'מפת\s+(?:קו|מסלול)|מפות\s+(?:קו|מסלול)',unit['text']):maps.append(index)
    return {'url':doc['url'],'sha256':doc['sha256'],'units':len(units),
            'fields':{k:v for k,v in fields.items() if v['status'] in ('verified','verified_conditional')} if automatic else {},
            'fieldLocations':hits,'routes':routes,'mapCandidates':maps,'baseIdentityVerified':automatic}


def main():
    state=read(STATE,{'tenders':{}})
    items={i['id']:i for name in ('tenders-feed.json','archive-feed.json') for i in read(ROOT/name,{'items':[]})['items']}
    output=read(ROOT/'automatic-summaries.json',{'tenders':{}})
    for tid,tender in state['tenders'].items():
        documents={}
        for key,doc in tender['documents'].items():
            if not doc.get('sha256'):continue
            cache=CACHE/doc['sha256']/'units.json'
            if not cache.exists():continue
            units=json.loads(cache.read_text())['units']
            documents[key]=analyze_document(tid,items[tid],doc,units)
            locations=documents[key].pop('fieldLocations')
            (cache.parent/'field-locations.json').write_text(json.dumps(locations,ensure_ascii=False))
        previous=output['tenders'].get(tid,{})
        # Preserve prior successful results when a document could not be re-downloaded.
        merged={**previous.get('documents',{}),**documents}
        metadata={}
        for field, source_key in [('dates.publication','published'),('dates.submission','deadline')]:
            value=items[tid].get(source_key)
            if not value:continue
            try:date=datetime.datetime.strptime(value[:10],'%d/%m/%Y').date().isoformat()
            except ValueError:continue
            metadata[field]={**blank()[field],'status':'verified','value':date,
                             'notes':'לפי פרטי הפרסום בפורטל; יש לבדוק גם הודעות שינוי מועדים.',
                             'sources':[{'tenderId':tid,'fieldKey':field,'url':items[tid]['url'],
                                         'locator':'פרטי הפרסום בפורטל','checkedAt':datetime.date.today().isoformat()}]}
        output['tenders'][tid]={'documents':merged,'metadataFields':metadata}
    output['checkedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    write(ROOT/'automatic-summaries.json',output)
    print('Analyzed packages:',len(output['tenders']))


if __name__=='__main__':main()
