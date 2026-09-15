"""Typed extraction contract. Unknown stays null; evidence belongs to one tender.
This validator prevents structural mixups, not all semantic extraction mistakes.
"""
CATALOG={
 'identity.number':('מספר מכרז','text','identity'), 'identity.issuer':('מפרסם','text','identity'), 'identity.cluster':('אשכול','text','identity'), 'identity.mode':('סוג שירות','text','identity'),
 'dates.publication':('פרסום','date','dates'), 'dates.submission':('הגשת הצעות','date','dates'), 'dates.questions':('שאלות הבהרה','date','dates'), 'dates.service_start':('תחילת שירות','date','dates'),
 'term.base':('תקופת התקשרות בסיסית','duration','term'), 'term.extension':('אפשרויות הארכה','duration','term'),
 'eligibility.turnover':('מחזור כספי נדרש','money','eligibility'), 'eligibility.equity':('הון עצמי נדרש','money','eligibility'), 'eligibility.experience':('ניסיון נדרש','duration','eligibility'), 'eligibility.licenses':('רישיונות נדרשים','text','eligibility'), 'eligibility.fleet':('צי כתנאי סף','count','eligibility'), 'eligibility.drivers':('נהגים כתנאי סף','count','eligibility'),
 'guarantee.bid':('ערבות הצעה','money','bid'), 'guarantee.performance':('ערבות ביצוע','money','execution'),
 'fleet.operating':('כלי רכב להפעלה','count','execution'), 'fleet.reserve':('רכב רזרבי','count','execution'), 'fleet.seats':('מושבים לרכב','count','vehicle'), 'fleet.electric_share':('שיעור צי חשמלי','percent','execution'), 'fleet.max_age':('גיל רכב מרבי','duration','vehicle'), 'fleet.accessibility':('נגישות כלי הרכב','text','vehicle'),
 'service.routes':('קווים','list','service'), 'service.variants':('חלופות מסלול','list','service'), 'service.weekly_trips':('נסיעות בשבוע','count','service'), 'service.annual_km':('קילומטרים בשנה','distance','service'), 'service.operating_hours':('שעות פעילות','text','service'), 'service.frequency':('תדירות שירות','duration','service'),
 'price.per_km':('תמורה לקילומטר','money','pricing'), 'price.ceiling_per_km':('תקרת מחיר לקילומטר','money','pricing'), 'price.fixed_payment':('תשלום קבוע','money','pricing'), 'price.indexation':('הצמדת תמורה','text','pricing'),
 'scoring.price_weight':('משקל המחיר בניקוד','percent','scoring'), 'scoring.quality_weight':('משקל האיכות בניקוד','percent','scoring'), 'scoring.minimum_quality':('סף ניקוד איכות','points','scoring'), 'penalties.amount':('פיצוי מוסכם','money','penalties'), 'award.winner':('זוכה','text','award'), 'award.awarded_price':('מחיר זכייה','money','award')}
STATUSES={'unverified','verified','verified_conditional','source_missing','unrecognized_wording','conflict','not_applicable'}
def blank():return {k:{'label':v[0],'kind':v[1],'scope':v[2],'status':'unverified','value':None,'sources':[]} for k,v in CATALOG.items()}
def validate(tender_id,fields):
 import datetime,math,urllib.parse
 errors=[]
 for key,f in fields.items():
  if key not in CATALOG:errors.append(key+': unknown field');continue
  _,kind,scope=CATALOG[key]
  if f.get('kind')!=kind or f.get('scope')!=scope:errors.append(key+': wrong type or scope')
  if f.get('status') not in STATUSES:errors.append(key+': unknown status')
  if f.get('status')=='verified_conditional':
   if f.get('value') is not None:errors.append(key+': conditional field cannot have a single value')
   conditions=f.get('conditions',[])
   if not isinstance(conditions,list) or not conditions:
    errors.append(key+': missing verified conditions');continue
   for condition in conditions:
    if not isinstance(condition,dict):errors.append(key+': invalid condition');continue
    if not condition.get('label'):errors.append(key+': missing condition scope')
    if condition.get('comparison') not in {'eq','lt','lte','gte'}:errors.append(key+': missing or invalid comparison')
    if kind=='duration' and condition.get('unit') not in {'years','months','days'}:errors.append(key+': invalid duration unit')
    errors.extend(validate(tender_id,{key:{**condition,'kind':kind,'scope':scope,'status':'verified'}}))
   continue
  if f.get('status')!='verified':
   if f.get('value') is not None:errors.append(key+': uncertain value must remain null')
   continue
  value=f.get('value');sources=f.get('sources',[])
  if value is None:errors.append(key+': verified value missing')
  if not sources:errors.append(key+': missing evidence')
  for source in sources:
   if source.get('tenderId')!=tender_id or source.get('fieldKey')!=key:errors.append(key+': evidence belongs to another tender or field')
   if not source.get('url') or not source.get('locator'):errors.append(key+': source location missing')
   parsed=urllib.parse.urlsplit(source.get('url',''))
   if parsed.scheme!='https' or parsed.hostname not in {'www.gov.il','gov.il','mr.gov.il','www.golan.org.il','golan.org.il'}:errors.append(key+': source is not an approved official host')
  if kind=='money':
   if not all(f.get(k) for k in ['currency','unit','vat','period']):errors.append(key+': incomplete monetary context')
   if key.endswith('per_km') and f.get('unit')!='per_km':errors.append(key+': expected per-km unit')
  if kind in {'money','count','duration','percent','points','distance'}:
   if type(value) not in (int,float) or not math.isfinite(value) or value<0:errors.append(key+': expected finite nonnegative number')
  if kind=='count' and (type(value)!=int):errors.append(key+': expected integer count')
  if kind=='text' and (not isinstance(value,str) or not value.strip()):errors.append(key+': expected nonempty text')
  if kind=='date':
   try:datetime.date.fromisoformat(value)
   except (ValueError,TypeError):errors.append(key+': expected ISO calendar date')
  if kind=='percent' and isinstance(value,(float,int)) and not 0<=value<=100:errors.append(key+': invalid percentage')
  if kind in {'duration','distance'} and not f.get('unit'):errors.append(key+': unit missing')
  if kind=='list' and not isinstance(value,list):errors.append(key+': expected list')
 return errors
if __name__=='__main__':
 import json,pathlib
 out=pathlib.Path(__file__).resolve().parents[1]/'field-catalog.json';out.write_text(json.dumps({'version':1,'fields':blank(),'statuses':sorted(STATUSES)},ensure_ascii=False,indent=2));print(len(CATALOG),'typed parameters')
