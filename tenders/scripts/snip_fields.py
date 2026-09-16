#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""צילום מהמסמך לכל עובדה: העמוד ב-PDF שבו כתוב הדבר, עם הדגשה צהובה על המספר/המילה, חתוך לאזור הרלוונטי.

שלמה (16.09): "צילום מסך איפה שזה רשום, עם הדגשה על זה". רץ בגיטהאב, שם ה-PDF במטמון של package_pipeline.
קלט: tenders/fields-rules.json (לכל שדה: מקור עם #page וערך) + tenders/text/index.json (כתובת → sha).
פלט: tenders/snips/<sha16>-p<עמוד>-<שדה>.webp ו-tenders/snips.json {tid: {field: {image, page, needle}}}.
"""
import datetime
import io
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
from package_pipeline import CACHE, ensure_cached  # noqa: E402

SNIPS = ROOT / 'snips'
OUT = ROOT / 'snips.json'
VERSION = 4


def read(path, default):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else default


def needles_for(key, f):
    """מה לחפש בעמוד: קודם המספר (יציב גם בעברית הפוכה), אחר כך מילים קצרות מהכותרת."""
    out = []
    if key == 'penalties.amount':
        # עמוד טבלת הקנסות: מסמנים את הכותרת של הפיצויים, לא מספר עמוד/סעיף מהערך ולא מילים מכותרת סעיף אחר
        # (בחיפה סומן "מוקד טלפוני" שבמקרה היה באותו עמוד)
        return ['סכום הפיצוי', 'פיצויים מוסכמים', 'טבלת פיצויים', 'פיצוי מוסכם', 'קנסות', 'פיצוי', 'קנס']
    v = f.get('value')
    if isinstance(v, (int, float)) and v:
        n = int(v)
        out += [f'{n:,}', str(n)]
        if n >= 1000 and n % 1000 == 0:
            out.append(f'{n // 1000:,}')       # "2,000" בתוך "2,000,000"
    elif isinstance(v, str):
        out += [x.group(0) for x in re.finditer(r'\d[\d,.]*', v)][:3]
    for c in f.get('conditions') or []:
        cv = c.get('value')
        if isinstance(cv, (int, float)) and cv:
            out += [f'{int(cv):,}', str(int(cv))]
    for s in re.findall(r'\d{1,2}/\d{1,2}/\d{4}|\d{4}-\d{2}-\d{2}', str(v)):
        y, m, d = (s.split('-') if '-' in s else reversed(s.split('/')))
        out.append(f'{d}/{m}/{y}')
    sec = f.get('sec') or {}
    words = [w for w in re.findall(r'[א-ת"]{3,}', sec.get('t', '')) if w not in ('של', 'את', 'על')]
    if len(words) >= 2:
        out.append(' '.join(words[:2]))
    out += words[:2]
    hints = {'fleet.accessibility': ['נגיש'], 'fleet.electric_share': ['חשמלי'], 'price.indexation': ['מדד'],
             'eligibility.licenses': ['רישיון'], 'penalties.amount': ['פיצוי'], 'facts.driver_wage': ['שכר היסוד', 'שכר'],
             'facts.payment_model': ['סובסידיה'], 'facts.bid_type': ['תוספת']}
    out += hints.get(key, [])
    seen, res = set(), []
    for n in out:
        n = str(n).strip()
        if len(n) >= 2 and n not in seen:
            seen.add(n); res.append(n)
    return res


STOP = set('''של את על עם בין דרך הקו קו קווים לקו לקווים גם כל אל או כמו יהיה תהיה היום כיום לפי בלבד אשר כאשר וכן ולא לא אין
יש בכל בתוך עד מן ממנו זה זו זאת הזה אחד אחת שני שתי כדי לצורך בגין ידי חדש חדשים הקווים שינוי במסלול מסלול ביטול'''.split())


def quote_words(quote, strict=True):
    """המילים שמחפשים בעמוד: מילים בעברית של 3 אותיות ומעלה ומספרים — בלי מילות קישור, בלי כפילויות.
    ציטוט קצר שכולו מילים כלליות ("קו 3 – שינוי במסלול") — מחפשים גם אותן (strict=False)."""
    words = re.findall(r'[א-ת]{3,}|\d{2,}', quote)
    return [w for w in dict.fromkeys(words) if not strict or w not in STOP][:40]


def line_rects(pg, ys, tol=5):
    """מלבן לכל שורה שנבחרה — כל המילים בעמוד שנמצאות בגובה הזה — כדי שהסימון יהיה פס רציף על המשפט
    ולא כתמים על מילים בודדות."""
    out = []
    words = pg.get_text('words')
    for y in ys:
        row = [w for w in words if abs((w[1] + w[3]) / 2 - y) <= tol]
        if row:
            out.append((min(w[0] for w in row), min(w[1] for w in row), max(w[2] for w in row), max(w[3] for w in row)))
    return out


def find_quote(pg, quote):
    """המקום בעמוד שבו כתוב הציטוט: מחפשים את מילות הציטוט, מקבצים לפי שורות, ובוחרים את רצף השורות
    (לפי אורך הציטוט) שבו נמצאו הכי הרבה מילים שונות. מחזיר את מלבני השורות להדגשה, או [] כשלא בטוחים."""
    hits = []
    for strict in (True, False):
        for w in quote_words(quote, strict):
            for r in pg.search_for(w)[:20]:
                hits.append((w, r))
        if hits:
            break
    if not hits:
        return []
    lines = {}
    for w, r in hits:
        yc = round((r.y0 + r.y1) / 2 / 6) * 6
        e = lines.setdefault(yc, {'words': set(), 'rects': []})
        e['words'].add(w)
        e['rects'].append(r)
    ys = sorted(lines)
    nlines = max(1, min(8, len(quote) // 55 + 1))
    best = None
    for i, y in enumerate(ys):
        win = [y2 for y2 in ys[i:] if y2 - y <= nlines * 14]
        score = len(set().union(*(lines[y2]['words'] for y2 in win)))
        if best is None or score > best[0]:
            best = (score, win)
    distinct = len({w for w, _ in hits})
    if best is None or best[0] < min(3, distinct):
        return []
    import fitz
    centers = [sum((r.y0 + r.y1) / 2 for r in lines[y]['rects']) / len(lines[y]['rects']) for y in best[1]]
    return [fitz.Rect(*box) for box in line_rects(pg, centers)] or [r for y in best[1] for r in lines[y]['rects']]


def snip_quotes(fitz, Image, url_sha, previous, result, pdfs):
    """צילום לכל עמוד שיש בו ציטוטים על קווים (line-changes.json): כל הציטוטים שבעמוד מודגשים בצהוב,
    והתמונה חתוכה לאזור שלהם. שלמה (16.09): "שהתכונה תצלם את המסכים הרלוונטיים לאותו פרק ותסמן את הציטוט"."""
    lc = read(ROOT / 'line-changes.json', {})
    groups = {}
    for tid, items in lc.get('tenders', {}).items():
        for q in items:
            if q.get('sha256') and q.get('page'):
                groups.setdefault((q['sha256'], q['page']), []).append(q['quote'])
    for tid, notes in lc.get('sections', {}).items():
        for q in notes:
            if q.get('sha256') and q.get('page'):
                groups.setdefault((q['sha256'], q['page']), []).append(q['quote'])
    sha_url = {sha: url for url, sha in url_sha.items()}
    made = kept = 0
    for (sha, pno), quotes in sorted(groups.items()):
        key = f'{sha[:12]}:{pno}'
        prev = previous.get(key)
        if prev and prev.get('v') == VERSION and prev.get('n') == len(quotes) and (ROOT / prev['image']).exists():
            result['quotes'][key] = prev
            kept += 1
            continue
        url = sha_url.get(sha)
        path = ensure_cached(sha, url) if url else None
        if not path or path.read_bytes()[:4] != b'%PDF':
            continue
        try:
            pdf = pdfs.get(sha) or fitz.open(str(path))
            pdfs[sha] = pdf
            pg = pdf[pno - 1]
        except Exception:
            continue
        bands = [rects for rects in (find_quote(pg, q) for q in quotes) if rects]
        if not bands:
            continue
        for rects in bands:
            for r in rects:
                a = pg.add_highlight_annot(r)
                a.set_colors(stroke=(1, 0.9, 0.2))
                a.update()
        y0 = min(r.y0 for b in bands for r in b) - 40
        y1 = max(r.y1 for b in bands for r in b) + 40
        clip = pg.rect if (y1 - y0) > 0.75 * pg.rect.height else fitz.Rect(0, max(0, y0), pg.rect.width, min(pg.rect.height, y1))
        pix = pg.get_pixmap(matrix=fitz.Matrix(1.6, 1.6), clip=clip, alpha=False)
        img = Image.open(io.BytesIO(pix.tobytes('png')))
        if img.width > 1400:
            img = img.resize((1400, int(img.height * 1400 / img.width)))
        rel = f'snips/q-{sha[:12]}-p{pno}.webp'
        img.save(ROOT / rel, 'WEBP', quality=80, method=6)
        result['quotes'][key] = {'image': rel, 'page': pno, 'sha': sha, 'v': VERSION, 'n': len(quotes), 'marked': len(bands)}
        made += 1
    print(f'צילומי ציטוטים: {len(result["quotes"])} עמודים ({made} חדשים, {kept} נשמרו) מתוך {len(groups)} עמודים עם ציטוטים', flush=True)


def main():
    try:
        import fitz  # PyMuPDF
        from PIL import Image
    except ImportError:
        print('אין PyMuPDF/Pillow — מדלגים על הצילומים', flush=True)
        return
    rules = read(ROOT / 'fields-rules.json', {'tenders': {}})['tenders']
    index = read(ROOT / 'text' / 'index.json', {'documents': {}})['documents']
    url_sha = {m['url']: sha for sha, m in index.items()}
    prev_all = read(OUT, {'tenders': {}})
    previous = prev_all.get('tenders', {})
    SNIPS.mkdir(exist_ok=True)
    result = {'updated': datetime.date.today().isoformat(), 'tenders': {}, 'quotes': {}}
    made = kept = 0
    pdfs = {}
    for tid, fields in rules.items():
        for key, f in fields.items():
            if f.get('status') != 'verified' or not f.get('sources'):
                continue
            src = f['sources'][0]
            url, _, page = (src.get('url') or '').partition('#page=')
            sha = url_sha.get(url)
            if not sha or not page.isdigit():
                continue
            pno = int(page)
            prev = previous.get(tid, {}).get(key)
            if prev and prev.get('sha') == sha and prev.get('page') == pno and prev.get('v') == VERSION and (ROOT / prev['image']).exists():
                result['tenders'].setdefault(tid, {})[key] = prev; kept += 1
                continue
            path = ensure_cached(sha, url)          # המטמון ריק בכל ריצה — מורידים את המסמך אם צריך
            if not path or path.read_bytes()[:4] != b'%PDF':
                continue
            try:
                pdf = pdfs.get(sha) or fitz.open(str(path)); pdfs[sha] = pdf
                pg = pdf[pno - 1]
            except Exception:
                continue
            hit, needle = None, None
            for n in needles_for(key, f):
                rects = pg.search_for(n)
                if rects:
                    hit, needle = rects[:12], n
                    break
            if not hit:
                continue
            for r in hit:
                a = pg.add_highlight_annot(r)
                a.set_colors(stroke=(1, 0.9, 0.2)); a.update()
            y0 = max(0, min(r.y0 for r in hit) - 110)
            y1 = min(pg.rect.height, max(r.y1 for r in hit) + 150)
            clip = fitz.Rect(0, y0, pg.rect.width, y1)
            pix = pg.get_pixmap(matrix=fitz.Matrix(1.7, 1.7), clip=clip, alpha=False)
            img = Image.open(io.BytesIO(pix.tobytes('png')))
            if img.width > 1400:
                img = img.resize((1400, int(img.height * 1400 / img.width)))
            safe = re.sub(r'[^a-z0-9_]', '_', key)
            rel = f'snips/{re.sub(r"[^a-zA-Z0-9_-]", "_", tid)}-{sha[:12]}-p{pno}-{safe}.webp'   # כולל את המכרז — שני מכרזים יכולים לחלוק מסמך
            img.save(ROOT / rel, 'WEBP', quality=82, method=6)
            result['tenders'].setdefault(tid, {})[key] = {'image': rel, 'page': pno, 'needle': needle, 'sha': sha, 'v': VERSION}
            made += 1
    snip_quotes(fitz, Image, url_sha, prev_all.get('quotes', {}), result, pdfs)
    for pdf in pdfs.values():
        pdf.close()
    used = {v['image'] for t in result['tenders'].values() for v in t.values()} | {v['image'] for v in result['quotes'].values()}
    removed = 0
    for img in SNIPS.glob('*.webp'):
        if f'snips/{img.name}' not in used:
            img.unlink(); removed += 1
    OUT.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    total = sum(len(t) for t in result['tenders'].values())
    print(f'צילומים: {total} ({made} חדשים, {kept} נשמרו, {removed} נמחקו) ב-{len(result["tenders"])} מכרזים', flush=True)


if __name__ == '__main__':
    main()
