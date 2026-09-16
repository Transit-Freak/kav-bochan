"""שמירת הטקסט שחולץ ממסמכי המכרזים בתוך המאגר (tenders/text/<sha>.json.gz).

עד עכשיו הטקסט נשמר רק במטמון זמני על המחשב שהריץ את האיסוף, ולכן אי אפשר
היה לבדוק את כלי הקריאה מקומית או לחזור על התוצאה. כאן כל מסמך של מכרז
הפעלה נשמר פעם אחת (לפי ה-SHA שלו) בקובץ דחוס: לכל עמוד/גיליון — הטקסט
עם שורות (layout) או שורות הטבלה. בלי מודל שפה, בלי פרשנות.

נשמרים רק מסמכים של מכרזי הפעלה (operating_tender) ורק כשהקובץ עוד לא
קיים. מסמך שהשתנה מקבל SHA חדש וקובץ חדש; הישן נשאר להשוואה.
"""
import gzip
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from extract_documents import ROOT, read  # noqa: E402
from package_pipeline import CACHE, STATE  # noqa: E402

TEXT = ROOT / 'text'


def slim(unit):
    """רק מה שצריך לקריאה בקוד: טקסט עם שורות, או שורות טבלה."""
    out = {'page': unit.get('page'), 'status': unit.get('status')}
    for k in ('member', 'sheet', 'block', 'table', 'rowNumbers'):
        if unit.get(k) not in (None, ''):
            out[k] = unit[k]
    if unit.get('rows'):
        out['rows'] = unit['rows']
    else:
        out['text'] = unit.get('layout') or unit.get('text') or ''
    return out


def main(cache=CACHE):
    TEXT.mkdir(exist_ok=True)
    state = read(STATE, {'tenders': {}})
    feeds = read(ROOT / 'tenders-feed.json', {'items': []})['items'] + read(ROOT / 'archive-feed.json', {'items': []})['items']
    operating = {i['id'] for i in feeds if i.get('classification') == 'operating_tender'}
    written = skipped = missing = 0
    index = read(TEXT / 'index.json', {'documents': {}})
    for tid, tender in state['tenders'].items():
        if tid not in operating:
            continue
        for key, doc in tender.get('documents', {}).items():
            sha = doc.get('sha256')
            if not sha:
                continue
            target = TEXT / (sha + '.json.gz')
            index['documents'][sha] = {'tender': tid, 'url': doc['url'], 'units': doc.get('units', 0)}
            if target.exists():
                skipped += 1
                continue
            src = cache / sha / 'units.json'
            if not src.exists():
                missing += 1
                continue
            units = json.loads(src.read_text())['units']
            payload = {'sha256': sha, 'tender': tid, 'url': doc['url'], 'units': [slim(u) for u in units]}
            with gzip.open(target, 'wt', encoding='utf-8') as f:
                json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))
            written += 1
    (TEXT / 'index.json').write_text(json.dumps(index, ensure_ascii=False, indent=1) + '\n')
    total = sum(p.stat().st_size for p in TEXT.glob('*.json.gz'))
    print(f'טקסט מסמכים: {written} נשמרו, {skipped} כבר קיימים, {missing} בלי מטמון · {total // 1024} KB בסך הכול', flush=True)


if __name__ == '__main__':
    main()
