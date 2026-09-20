#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""קריאה אוטומטית של שרטוט "חתך לאורך" של תת"ל (PDF ראסטרי) — טבלאות הגבהים.

בתחתית כל גיליון יש טבלה: שורות "רום מתוכנן" (מסילה), "רום קיים" (קרקע),
"מרחק רץ" (קילומטראז' 9+300.00) — כל תא הוא טקסט מסובב 90°. השלבים:
  1. רינדור העמוד (pdftoppm) ברזולוציה שבה רוחב העמוד ~16000 פיקסלים.
  2. מציאת הקווים האופקיים הארוכים בחצי התחתון (גבולות הטבלה) → רצועות שורות.
  3. OCR עברית על תא התווית בקצה השורה → סוג השורה.
  4. בכל שורה: מציאת הקווים האנכיים (גבולות התאים), OCR ספרות לכל תא אחרי סיבוב.
  5. זיווג לפי עמודה: קילומטראז' ↔ רום מתוכנן ↔ רום קיים.
  6. תוויות בחתך (תחנות, מנהרות, גשרים) — OCR עברית על רצועת החתך, עם מיקום X → קילומטראז'.
פלט: JSON לכל גיליון ב-docs/fetched/taba/ocr/<שם>.json.
מריץ ב-Actions (tesseract + poppler). שלמה 20.09: "מה שיש לך תוכנית — לפי התוכנית".
"""
import json
import os
import re
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageOps

Image.MAX_IMAGE_PIXELS = None
TARGET_W = 16000


def sh(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def render(pdf, page=1):
    info = sh(['pdfinfo', pdf]).stdout
    m = re.search(r'Page size:\s+([\d.]+) x ([\d.]+)', info)
    w_pt = float(m.group(1))
    dpi = round(TARGET_W * 72 / w_pt)
    out = tempfile.mktemp(prefix='taba_')
    sh(['pdftoppm', '-png', '-r', str(dpi), '-f', str(page), '-l', str(page), pdf, out])
    files = sorted(f for f in os.listdir(os.path.dirname(out) or '.') if os.path.basename(f).startswith(os.path.basename(out)))
    path = os.path.join(os.path.dirname(out) or '.', files[0])
    img = Image.open(path).convert('L')
    return img, dpi


def dark_rows(a, x0, x1, thresh=0.55):
    """שורות פיקסלים שבהן חלק גדול מהרוחב כהה — קווים אופקיים ארוכים."""
    band = a[:, x0:x1] < 128
    frac = band.mean(axis=1)
    return np.where(frac > thresh)[0]


def group_runs(idx, gap=3):
    runs = []
    for i in idx:
        if runs and i - runs[-1][1] <= gap:
            runs[-1][1] = i
        else:
            runs.append([i, i])
    return runs


def ocr(img, lang='eng', psm=7, whitelist=None):
    with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
        img.save(f.name)
        cmd = ['tesseract', f.name, '-', '-l', lang, '--psm', str(psm)]
        if whitelist:
            cmd += ['-c', f'tessedit_char_whitelist={whitelist}']
        r = sh(cmd)
    os.unlink(f.name)
    return r.stdout.strip()


def ocr_tsv(img, lang='heb'):
    """OCR עם מיקומים (TSV) — למילים בחתך."""
    with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
        img.save(f.name)
        r = sh(['tesseract', f.name, '-', '-l', lang, '--psm', '11', 'tsv'])
    os.unlink(f.name)
    words = []
    for ln in r.stdout.splitlines()[1:]:
        p = ln.split('\t')
        if len(p) < 12 or not p[11].strip():
            continue
        try:
            words.append({'x': int(p[6]), 'y': int(p[7]), 'w': int(p[8]), 'h': int(p[9]), 'conf': float(p[10]), 't': p[11]})
        except ValueError:
            pass
    return words


def read_sheet(pdf, out_json, debug_dir=None):
    img, dpi = render(pdf)
    W, H = img.size
    a = np.asarray(img)
    print(f'{os.path.basename(pdf)}: {W}x{H} @ {dpi} dpi', flush=True)
    # --- 2. הטבלה לפי תיבות התוויות בעמודה הקיצונית: רוחב עמודת התווית = הקו האנכי
    #        הראשון בקצה; גבולות השורות = הקווים האופקיים בתוך העמודה הזו (חצי תחתון)
    y_from = H // 2
    labeled, rows, ys = [], [], []
    side_used = None
    for side in ('left', 'right'):
        xr = range(60, int(W * 0.06)) if side == 'left' else range(W - 60, int(W * 0.94), -1)
        band = a[y_from:, :] < 128
        lab_edge = None
        for x in xr:
            col = band[:, x]
            # קו אנכי באורך של לפחות 400 פיקסלים רצופים
            runs = group_runs(np.where(col)[0], gap=2)
            if any(r[1] - r[0] > 400 for r in runs):
                lab_edge = x
                break
        if lab_edge is None:
            continue
        lx0, lx1 = (0, lab_edge) if side == 'left' else (lab_edge, W)
        hl = group_runs(dark_rows(a[y_from:, :], lx0 + 10, lx1 - 10, thresh=0.6) + y_from)
        ys_side = [int((r[0] + r[1]) / 2) for r in hl]
        rows_side = [(ys_side[k], ys_side[k + 1]) for k in range(len(ys_side) - 1) if 60 < ys_side[k + 1] - ys_side[k] < H * 0.05]
        lab = []
        for (y0, y1) in rows_side:
            cell = img.crop((lx0, y0 + 4, lx1, y1 - 4))
            cell = cell.resize((cell.width * 2, cell.height * 2))
            txt = ocr(cell, 'heb', 7).replace(' ', '')
            k = ('plan' if ('מתוכנ' in txt or 'מתו' in txt) else 'ground' if ('קיים' in txt or 'קים' in txt) else
                 'chain' if ('מרחק' in txt or txt.endswith('רץ')) else None)
            print(f'   תווית {side} {y0}-{y1}: {txt!r} → {k}', flush=True)
            if k:
                lab.append({'y0': y0, 'y1': y1, 'label': txt, 'kind': k, 'lx0': lx0, 'lx1': lx1})
        if len(lab) >= 2:
            labeled, rows, ys, side_used = lab, rows_side, ys_side, side
            break
    print('  צד התוויות:', side_used, '· רצועות:', rows, flush=True)
    if debug_dir and rows:
        from PIL import ImageDraw
        oy = max(0, rows[0][0] - 200)
        dbg = img.crop((0, oy, W, H)).convert('RGB')
        dr = ImageDraw.Draw(dbg)
        for y in ys:
            dr.line([(0, y - oy), (W, y - oy)], fill=(255, 0, 0), width=6)
        for r in labeled:
            dr.rectangle([(r['lx0'], r['y0'] - oy), (r['lx1'], r['y1'] - oy)], outline=(0, 0, 255), width=6)
        dbg.resize((dbg.width // 4, dbg.height // 4)).save(os.path.join(debug_dir, os.path.basename(pdf) + '.debug.png'))

    def kind_of(label):
        s = label.replace(' ', '')
        if 'מתוכנן' in s or 'מתוכנו' in s:
            return 'plan'
        if 'קיים' in s or 'קים' in s:
            return 'ground'
        if 'מרחק' in s or 'רץ' in s:
            return 'chain'
        return None

    # --- 4. תאים בכל שורה: קווים אנכיים בתוך רצועת השורה
    data = {}
    for r in labeled:
        k = r.get('kind') or kind_of(r['label'])
        if not k:
            continue
        y0, y1 = r['y0'], r['y1']
        inner = a[y0 + 3:y1 - 3, :] < 128
        colfrac = inner.mean(axis=0)
        vx = group_runs(np.where(colfrac > 0.8)[0], gap=2)
        xs = [int((v[0] + v[1]) / 2) for v in vx]
        # תחום הטבלה: בין תא התווית לקצה השני
        if r['lx0'] == 0:
            xs = [x for x in xs if x > r['lx1']]
        else:
            xs = [x for x in xs if x < r['lx0']]
        cells = [(xs[i], xs[i + 1]) for i in range(len(xs) - 1) if 12 < xs[i + 1] - xs[i] < 200]
        vals = []
        for (x0, x1) in cells:
            cell = img.crop((x0 + 2, y0 + 2, x1 - 2, y1 - 2))
            cell = cell.rotate(-90, expand=True)   # הטקסט מסובב 90° נגד כיוון השעון
            cell = ImageOps.autocontrast(cell)
            cell = cell.resize((cell.width * 2, cell.height * 2))
            cell = ImageOps.expand(cell, border=16, fill=255)   # שוליים לבנים — שלא ייחתכו ספרות
            txt = ocr(cell, 'eng', 7, '0123456789.+-')
            vals.append({'x': int((x0 + x1) / 2), 't': txt})
            if debug_dir and len(vals) in (3, 40):
                cell.save(os.path.join(debug_dir, os.path.basename(pdf) + f'.cell_{k}_{len(vals)}.png'))
        data[k] = vals
        print(f'  {k}: {len(cells)} תאים · דוגמה: {[v["t"] for v in vals[:6]]}', flush=True)

    # --- 5. זיווג לפי עמודה (מרכז X קרוב)
    def parse_ch(t):
        m = re.search(r'(\d{1,3})\+(\d{3})', t)
        return int(m.group(1)) * 1000 + int(m.group(2)) if m else None

    def parse_el(t):
        t = t.strip().replace(',', '.')
        m = re.match(r'^(-?\d{1,3})\.(\d{2})$', t)
        if m:
            return float(t)
        m = re.match(r'^(-?\d{3,5})$', t)          # הנקודה אבדה ב-OCR: 3777 → 37.77
        if m:
            d = m.group(1)
            return float(d[:-2] + '.' + d[-2:])
        return None

    chain = [(v['x'], parse_ch(v['t'])) for v in data.get('chain', [])]
    series = []
    for x, ch in chain:
        if ch is None:
            continue
        def near(kind):
            best = None
            for v in data.get(kind, []):
                if best is None or abs(v['x'] - x) < abs(best['x'] - x):
                    best = v
            return parse_el(best['t']) if best and abs(best['x'] - x) < 45 else None
        series.append({'ch': ch, 'rail': near('plan'), 'ground': near('ground')})
    series.sort(key=lambda s: s['ch'])
    ok = sum(1 for s in series if s['rail'] is not None and s['ground'] is not None)
    print(f'  נקודות קילומטראז׳: {len(series)} · עם שני גבהים: {ok}', flush=True)

    # --- 6. תוויות בחתך: רצועת החתך (בין 30% ל-70% מהגובה), OCR עברית עם מיקומים
    band_y0, band_y1 = int(H * 0.22), (rows[0][0] if rows else int(H * 0.75))
    band = img.crop((0, band_y0, W, band_y1))
    small = band.resize((band.width // 2, band.height // 2))
    words = ocr_tsv(small, 'heb')
    labels = []
    ws = sorted([w for w in words if w['conf'] > 30 and re.search(r'[א-ת"\']{2,}|\d', w['t'])], key=lambda w: (w['y'] // 12, -w['x']))
    # מילים באותו קו גובה ובמרחק קטן → תווית אחת (עברית: מימין לשמאל)
    for w in ws:
        if labels and abs(labels[-1]['y'] - (w['y'] * 2 + band_y0)) < 24 and 0 <= labels[-1]['x'] - (w['x'] * 2 + w['w'] * 2) < 60:
            labels[-1]['t'] += ' ' + w['t']
            labels[-1]['x'] = w['x'] * 2
            continue
        labels.append({'x': w['x'] * 2, 'xr': (w['x'] + w['w']) * 2, 'y': w['y'] * 2 + band_y0, 't': w['t'], 'conf': w['conf']})
    for l in labels:
        l['x'] = int((l['x'] + l.get('xr', l['x'])) / 2)
    # קילומטראז' לכל X לפי רגרסיה מנקודות הטבלה
    if len(series) >= 2:
        xs_ = [c[0] for c in chain if c[1] is not None]
        cs_ = [c[1] for c in chain if c[1] is not None]
        A = np.vstack([xs_, np.ones(len(xs_))]).T
        m, b = np.linalg.lstsq(A, np.array(cs_, dtype=float), rcond=None)[0]
        for l in labels:
            l['ch'] = int(m * l['x'] + b)
    key = [l for l in labels if re.search(r'תחנ|מנהר|מינהר|גשר|פורטל', l['t'])]
    print('  תוויות מפתח בחתך:', [(l['t'], l.get('ch')) for l in key][:30], flush=True)

    json.dump({'pdf': os.path.basename(pdf), 'dpi': dpi, 'size': [W, H], 'series': series, 'labels': labels},
              open(out_json, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)


if __name__ == '__main__':
    os.makedirs('docs/fetched/taba/ocr', exist_ok=True)
    for pdf in sys.argv[1:]:
        name = os.path.splitext(os.path.basename(pdf))[0]
        try:
            read_sheet(pdf, f'docs/fetched/taba/ocr/{name}.json', debug_dir='docs/fetched/taba/ocr')
        except Exception as ex:  # noqa: BLE001
            print('נכשל:', pdf, repr(ex)[:300], flush=True)
