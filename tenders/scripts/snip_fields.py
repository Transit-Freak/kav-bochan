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
VERSION = 1


def read(path, default):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else default


def needles_for(key, f):
    """מה לחפש בעמוד: קודם המספר (יציב גם בעברית הפוכה), אחר כך מילים קצרות מהכותרת."""
    out = []
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
    previous = read(OUT, {'tenders': {}})['tenders']
    SNIPS.mkdir(exist_ok=True)
    result = {'updated': datetime.date.today().isoformat(), 'tenders': {}}
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
            rel = f'snips/{sha[:16]}-p{pno}-{safe}.webp'
            img.save(ROOT / rel, 'WEBP', quality=82, method=6)
            result['tenders'].setdefault(tid, {})[key] = {'image': rel, 'page': pno, 'needle': needle, 'sha': sha, 'v': VERSION}
            made += 1
    for pdf in pdfs.values():
        pdf.close()
    used = {v['image'] for t in result['tenders'].values() for v in t.values()}
    removed = 0
    for img in SNIPS.glob('*.webp'):
        if f'snips/{img.name}' not in used:
            img.unlink(); removed += 1
    OUT.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    total = sum(len(t) for t in result['tenders'].values())
    print(f'צילומים: {total} ({made} חדשים, {kept} נשמרו, {removed} נמחקו) ב-{len(result["tenders"])} מכרזים', flush=True)


if __name__ == '__main__':
    main()
