"""מפות בתוך מסמכי המכרז — זיהוי והעתקה לאתר, בלי מודל שפה (שלמה 16.09).

בחלק מהמכרזים (בעיקר מוניות שירות) יש עמוד עם מפת הקו. הסקריפט עובר על עמודי
ה-PDF שהורדו בריצה (המטמון של package_pipeline) ומזהה עמוד-מפה לפי כללים:
- תמונה גדולה (30% מהעמוד ומעלה) ומעט טקסט, או שהטקסט מזכיר "מפה"/"מפת";
- או המון ציור וקטורי (קווים ומצולעים) ומעט טקסט — מפה שצוירה ולא הודבקה.
עמוד כזה מועתק כתמונה (WebP) ל-tenders/maps/, עם כיתוב מהטקסט שבעמוד ומספרי
הקווים שמופיעים בו. לא מציירים כלום — רק העתק של מה שבמסמך.

פלט: tenders/maps.json  { tid: [ {image, page, url, caption, numbers, sha256, doc, kind} ] }
דורש PyMuPDF (fitz) ו-Pillow; כשהמסמך לא במטמון (ריצה מקומית) — מדלגים.
"""
import datetime
import io
import json
import pathlib
import re
import sys
import urllib.parse

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
from package_pipeline import CACHE, STATE  # noqa: E402

MAPS = ROOT / 'maps'
OUT = ROOT / 'maps.json'
MAX_PER_DOC = 40
NUM = r'N?\d{1,4}[א-ת]?'
HEURISTIC = 2          # גרסת הכללים; כשמשנים אותם, כל העמודים נבדקים מחדש ולא נשמרים מהריצה הקודמת
# מילים שמעידות שהעמוד הוא מפה או תרשים — בשורה קצרה (כיתוב), לא בתוך פסקה
MAP_WORDS = re.compile(r'מפת |מפה\b|מפה |להלן מפה|לאורך המסלול|תיאור מסלול|מסלול הקו|מפת המסלול|תרשים|תוואי|סכמת|סכמה')
TOC_MARK = re.compile(r'תוכן העניינים|תוכן עניינים')
TOC_LINE = re.compile(r'\.\s*\d{1,3}\s*$')
TABLE_LINE = re.compile(r'(?:\S*\d\S*\s+){5,}')


def read(path, default):
    return json.loads(path.read_text()) if path.exists() else default


def caption_of(text):
    lines = [re.sub(r'\s+', ' ', l).strip() for l in text.split('\n') if l.strip()]
    for l in lines:
        if re.search(r'מפ[הת]|מסלול|תרשים', l) and len(l) < 120:
            return l
    for l in lines:
        if re.search(r'\bקו\b', l) and len(l) < 120:
            return l
    return (lines[0][:120] if lines else '')


def numbers_of(text):
    nums = []
    for m in re.finditer(r'(?:קו|קווים|לקו)\s*[:–\-]?\s*(' + NUM + r'(?:\s*(?:,|ו-|ו־|ו)\s*' + NUM + r')*)', text):
        nums += re.findall(NUM, m.group(1))
    return list(dict.fromkeys(nums))[:12]


def is_map_page(page, text):
    area = page.rect.width * page.rect.height or 1
    big_image = 0.0
    try:
        for info in page.get_image_info():
            b = info.get('bbox')
            if b:
                big_image = max(big_image, ((b[2] - b[0]) * (b[3] - b[1])) / area)
    except Exception:
        pass
    drawings = 0
    try:
        drawings = len(page.get_drawings())
    except Exception:
        pass
    words = len(text.split())
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    # עמוד מפה: מעט טקסט, ובו שורת כיתוב קצרה עם "מפה"/"לאורך המסלול"/"תרשים". לא שער, לא תוכן עניינים, לא טבלה
    # (בטבלאות הקווים "חלופת מסלול" היא כותרת עמודה — לכן דורשים את הביטויים המלאים).
    if page.number < 3 or words >= 135:
        return None
    if TOC_MARK.search(text) or sum(1 for l in lines if TOC_LINE.search(l)) >= 6:
        return None
    if sum(1 for l in lines if TABLE_LINE.search(l)) >= 3:
        return None
    if re.search(r'מספר סעיף|סכום הפיצוי|מק"ט קו', text):     # כותרות של טבלאות (פיצויים, קווים) — לא מפה
        return None
    if not any(MAP_WORDS.search(l) and len(l) < 90 for l in lines):
        return None
    if big_image >= 0.3:
        return 'image'
    if drawings >= 60:
        return 'vector'
    return None


def main():
    try:
        import fitz  # PyMuPDF
        from PIL import Image
    except ImportError:
        print('אין PyMuPDF/Pillow — מדלגים על המפות', flush=True)
        return
    MAPS.mkdir(exist_ok=True)
    state = read(STATE, {'tenders': {}})
    feeds = read(ROOT / 'tenders-feed.json', {'items': []})['items'] + read(ROOT / 'archive-feed.json', {'items': []})['items']
    operating = {i['id'] for i in feeds if i.get('classification') == 'operating_tender'}
    previous = read(OUT, {'tenders': {}})['tenders']
    result = {'updated': datetime.date.today().isoformat(), 'tenders': {}}
    scanned = 0
    for tid, tender in state['tenders'].items():
        if tid not in operating:
            continue
        found = []
        for doc in tender.get('documents', {}).values():
            sha = doc.get('sha256')
            if not sha:
                continue
            done = [m for m in previous.get(tid, []) if m.get('sha256') == sha and m.get('v') == HEURISTIC]
            src = CACHE / sha / 'source.bin'
            if done and all((ROOT / m['image']).exists() for m in done):
                found += done          # כבר הופק בריצה קודמת — לא מרנדרים שוב
                continue
            if not src.exists() or not src.read_bytes()[:4] == b'%PDF':
                found += done
                continue
            try:
                pdf = fitz.open(str(src))
            except Exception as error:
                print('  PDF לא נפתח', sha[:8], error, flush=True)
                continue
            scanned += 1
            name = urllib.parse.unquote(doc['url'].rstrip('/').split('/')[-1])
            n = 0
            for pno in range(pdf.page_count):
                page = pdf[pno]
                text = page.get_text()
                kind = is_map_page(page, text)
                if not kind:
                    continue
                pix = page.get_pixmap(matrix=fitz.Matrix(1.6, 1.6), alpha=False)
                img = Image.open(io.BytesIO(pix.tobytes('png')))
                if img.width > 1400:
                    img = img.resize((1400, int(img.height * 1400 / img.width)))
                rel = f'maps/{sha[:16]}-p{pno + 1}.webp'
                img.save(ROOT / rel, 'WEBP', quality=80, method=6)
                found.append({'image': rel, 'page': pno + 1, 'url': f"{doc['url']}#page={pno + 1}", 'caption': caption_of(text),
                              'numbers': numbers_of(text), 'sha256': sha, 'doc': name, 'kind': kind, 'v': HEURISTIC})
                n += 1
                if n >= MAX_PER_DOC:
                    break
            pdf.close()
            if n:
                print(f'  {tid} {name[:30]}: {n} עמודי מפה', flush=True)
        if found:
            result['tenders'][tid] = found
    OUT.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    # תמונות שכבר לא מוזכרות (כללים שהשתנו, מסמך שהוחלף) — נמחקות כדי לא להשאיר עמודים שאינם מפה
    used = {m['image'] for v in result['tenders'].values() for m in v}
    removed = 0
    for img in MAPS.glob('*.webp'):
        if f'maps/{img.name}' not in used:
            img.unlink(); removed += 1
    if removed:
        print(f'  נמחקו {removed} תמונות שאינן מפה לפי הכללים הנוכחיים', flush=True)
    total = sum(len(v) for v in result['tenders'].values())
    size = sum(p.stat().st_size for p in MAPS.glob('*.webp')) // 1024
    print(f'מפות: {total} עמודים ב-{len(result["tenders"])} מכרזים · נסרקו {scanned} מסמכים · {size} KB', flush=True)


if __name__ == '__main__':
    main()
