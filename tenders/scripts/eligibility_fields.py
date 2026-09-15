"""Recognized alternative qualification path; never presented as universal thresholds."""
import datetime
import re


def add_eligibility(fields,pages,item,url,digest):
    from extract_documents import section
    found=section(pages,'4.1.1.3','4.1.2')
    if not found:return
    text,page=found
    if not all(t in text for t in ('מחזור מכירות שנתי ממוצע','בעל שליטה','30%','מקומות ישיבה','שירותי הסעות')):return
    turnover=re.search(r'בשלוש השנים האחרונות\s*\(?\s*\)?\s*(20\d{2})\s*[-–]\s*(20\d{2})\)?\s*של לפחות\s*(\d+)\s*מיליון\s*₪\s*לשנה',text)
    equity=re.search(r'בשנת\s*(20\d{2})\s*הוא לפחות\s*(\d+)\s*מיליון\s*\.?₪',text)
    fleet=re.search(r'לפחות\s*(\d+)\s*אוטובוסים שהינם בעלי\s*(\d+)\s*מקומות ישיבה לפחות',text)
    experience=re.search(r'במהלך\s*(\d+)\s*השנים האחרונות',text)
    def put(key,value,label,match,**extra):
        p=page+text[:match.start()].count('\n')
        source={'tenderId':item['id'],'fieldKey':key,'url':url+'#page='+str(p),'locator':f'עמוד PDF {p}, סעיף 4.1.1.3','sha256':digest,'checkedAt':datetime.date.today().isoformat()}
        fields[key].update(status='verified_conditional',value=None,reason=None,
          notes='חלופת זכאות לפי סעיף 4.1.1.3 בלבד. קיימות חלופות נוספות בסעיפים 4.1.1.1–4.1.1.2. יש לבדוק גם את דרישות הבעלות וההבהרות; הסכומים אינם תנאי אחיד לכל מציע.',
          conditions=[{'label':label,'value':value,'comparison':'gte','sources':[source],**extra}])
    if turnover:
        years=sorted([int(turnover[1]),int(turnover[2])])
        put('eligibility.turnover',int(turnover[3])*1000000,f'בחלופת סעיף 4.1.1.3: מחזור שנתי ממוצע בשנים {years[0]}–{years[1]}',turnover,currency='ILS',unit='per_year',vat='unspecified',period=f'ממוצע שנתי {years[0]}–{years[1]}')
    if equity:put('eligibility.equity',int(equity[2])*1000000,f'בחלופת סעיף 4.1.1.3: הון עצמי בשנת {equity[1]}',equity,currency='ILS',unit='total',vat='not_applicable',period='שנת '+equity[1])
    if fleet:put('eligibility.fleet',int(fleet[1]),f'בחלופת סעיף 4.1.1.3: אוטובוסים בבעלות המציע או בעלי הזיקה המוגדרים בסעיף, עם לפחות {fleet[2]} מושבים',fleet)
    if experience:put('eligibility.experience',int(experience[1]),'בחלופת סעיף 4.1.1.3: ביצוע הסעות בתחבורה ציבורית או הסעות מיוחדות במהלך השנים האחרונות',experience,unit='years')
