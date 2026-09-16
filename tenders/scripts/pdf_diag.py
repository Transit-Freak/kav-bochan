#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""אבחון עמוד ב-PDF של מכרז (רץ בגיטהאב, כי מהמחשב שלנו אתר המכרזים חסום).

למה: בחיפה, עמוד 8 — הטקסט שחילצנו (pdftotext) אומר "לא יאוחר מ-12 חודשים … 18 חודשים", והצילום של אותו
עמוד מאותו קובץ מראה "9 חודשים … 15 חודשים". חשד: המשרד תיקן את המסמך בהערות (annotations) שמצוירות מעל
הטקסט המקורי — הצילום מראה את התיקון, החילוץ קורא את המקור. הסקריפט מדפיס מה יש בעמוד באמת.

שימוש: python3 tenders/scripts/pdf_diag.py <sha256> <page> [<page> …]   (הכתובת נלקחת מ-tenders/text/index.json)
"""
import json
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
from package_pipeline import ensure_cached  # noqa: E402


def main():
    sha, pages = sys.argv[1], [int(p) for p in sys.argv[2:]] or [1]
    index = json.loads((ROOT / 'text' / 'index.json').read_text(encoding='utf-8'))['documents']
    url = (index.get(sha) or {}).get('url')
    full = next((s for s in index if s.startswith(sha)), None)
    if not url and full:
        sha, url = full, index[full]['url']
    print('מסמך:', sha[:16], url)
    path = ensure_cached(sha, url)
    if not path:
        print('ההורדה נכשלה או שהקובץ בכתובת הזאת השתנה (sha אחר)')
        return
    import fitz
    doc = fitz.open(str(path))
    print('עמודים:', doc.page_count, '| מטא:', {k: v for k, v in (doc.metadata or {}).items() if v})
    for pno in pages:
        pg = doc[pno - 1]
        annots = list(pg.annots() or [])
        print(f'\n===== עמוד {pno}: {len(annots)} הערות (annotations), {len(pg.get_images())} תמונות, {len(pg.get_drawings())} ציורים')
        for a in annots:
            info = a.info or {}
            txt = ''
            try:
                txt = a.get_text() if hasattr(a, 'get_text') else ''
            except Exception as e:
                txt = f'(get_text: {e})'
            print(f'  - {a.type[1]} rect={tuple(round(x) for x in a.rect)} content={info.get("content", "")[:120]!r} text={str(txt)[:160]!r}')
        text = pg.get_text('text')
        print('--- PyMuPDF get_text (תוכן העמוד בלבד):')
        print('\n'.join(l for l in text.split('\n') if l.strip())[:1800])
        try:
            out = subprocess.run(['pdftotext', '-layout', '-f', str(pno), '-l', str(pno), str(path), '-'], capture_output=True, text=True, timeout=60).stdout
            print('--- pdftotext -layout:')
            print('\n'.join(l for l in out.split('\n') if l.strip())[:1800])
        except Exception as e:
            print('pdftotext:', e)
        # מה רואים בעמוד עם ההערות — טקסט מתוך המראה (appearance) של כל הערה
        if annots and hasattr(doc, 'bake'):
            try:
                d2 = fitz.open(str(path))
                d2.bake(annots=True, widgets=True)
                print('--- אחרי bake (ההערות הפכו לחלק מהעמוד) get_text:')
                print('\n'.join(l for l in d2[pno - 1].get_text('text').split('\n') if l.strip())[:1800])
            except Exception as e:
                print('bake:', e)


if __name__ == '__main__':
    main()
