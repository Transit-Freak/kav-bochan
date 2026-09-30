#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GIS הקו הבוחן — שכבות "כל התחנות" ו"קווים" לפי תאריך, מתוך נתוני ההיסטוריה של הקו הבוחן (line-history/data).

שלמה 30.09: "שכבה של כל התחנות — פעילות בירוק ולא פעילות באדום, שכבת קווים, ובחירת תאריך
שמציגה את המצב כפי שהיה". אין כאן ניחוש: הכול נגזר מהקבצים שכלי ההיסטוריה עצמו מציג.

· קו (וריאנט rd) פעיל בתאריך — אותו כלל כמו בכלי ההיסטוריה (line-history/app.jsx, מפת החודש):
  הגרסה האחרונה עד התאריך (בלי גרסאות מוסתרות) אינה "removed"/"planned-dropped"; המסלול — הגרסה
  האחרונה עד אז שיש לה מסלול. וריאנט שבוטל בלי removed מפורש (variantGone) — נסגר בתאריך שלו.
  קווי צילום 2012 (archive2012…) — רק ליום הצילום, 07.07.2012.
· תחנה משורתת בידי וריאנט — לפי data/stopev (base/in/mvin פותחים, out/mvout סוגרים), בחיתוך
  עם הזמן שהווריאנט עצמו פעיל. תחנה פעילה בתאריך = יש וריאנט אחד לפחות שמשרת אותה.
  "היום" — כמו בכלי: רק וריאנטים שיש להם לו"ז לשבוע הקרוב (stopev "a").
· מיקום ושם התחנה — המאוחרים ביותר שתועדו (מאגרי התחנות של הקווים ו-stops-hist); עיר — stop-cities.

למה אינדקס ולא קריאה ישירה (שלמה 30.09: "לקרוא את הקבצים של כלי ההיסטוריה, לא להעתיק"): הדפדפן כן קורא ישירות
את line-history/data — stopev/XX.json לקווים שבתחנה ו-lines/<rd>.json לפרטי קו, בלחיצה. אבל כדי לצבוע את כל
37 אלף התחנות ולצייר את כל הקווים של תאריך נתון צריך לעבור על 53MB של stopev ועל 880MB ב-22,944 קובצי קווים —
לא אפשרי בדפדפן (ובטלפון בפרט). לכן רק מה שחייבים בשביל המפה: מיקום ומרווחי פעילות לכל תחנה, מרווחי פעילות
לכל וריאנט, והמסלולים מפושטים ומחולקים למשבצות.

הפלט (gis/data/hist, כל קובץ מתחת ל-6MB, נטען רק כשמסמנים את השכבה):
  meta.json          טווח התאריכים הנתמך
  stops.json         כל התחנות: [מק"ט, lat, lon, שם, עיר, פעילה היום, מרווחי פעילות]
  lines.json         כל הווריאנטים: [rd, קו, מפעיל, יעד, סוג, [[מ-, עד, מזהה מסלול], …]]
  shapeidx.json      לכל מסלול: [משבצת, s, w, n, e] — המזהה הוא גיבוב המסלול, כך שהקבצים יציבים מלילה ללילה
  shapes/<tile>.json המסלולים עצמם (polyline מקודד, מפושט ל-~25 מ'), לפי משבצת של 1/5 מעלה
תאריכים = מספר ימים מ-01.01.2012; עד=null — עדיין בתוקף.
"""
import datetime
import glob
import hashlib
import json
import math
import os
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LH = os.path.join(ROOT, 'line-history', 'data')
OUT = os.path.join(ROOT, 'gis', 'data', 'hist')
EPOCH = datetime.date(2012, 1, 1)
D2012 = '2012-07-07'
TOL = 0.00025  # פישוט מסלול (מעלות, ~25 מ') — לתצוגה בלבד; בלחיצה נטען הקו המלא מכלי ההיסטוריה
TILE = 5       # משבצות מסלולים: 1/5 מעלה, לפי מרכז המסלול


def day(s):
    return (datetime.date.fromisoformat(s[:10]) - EPOCH).days


def jload(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def jdump(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    return os.path.getsize(path)


# ---------------------------------------------------------------- polyline
def decode(s):
    pts, i, la, lo = [], 0, 0, 0
    while i < len(s):
        vals = []
        for _ in (0, 1):
            shift = res = 0
            while True:
                b = ord(s[i]) - 63
                i += 1
                res |= (b & 0x1f) << shift
                shift += 5
                if b < 0x20:
                    break
            vals.append(~(res >> 1) if res & 1 else res >> 1)
        la += vals[0]
        lo += vals[1]
        pts.append((la / 1e5, lo / 1e5))
    return pts


def encode(pts):
    out, pla, plo = [], 0, 0
    for la, lo in pts:
        a, b = int(round(la * 1e4)) * 10, int(round(lo * 1e4)) * 10   # דיוק 4 ספרות (~10 מ') — כך מסלולים כמעט זהים מתאחדים
        for d in (a - pla, b - plo):
            v = ~(d << 1) if d < 0 else d << 1
            while v >= 0x20:
                out.append(chr((0x20 | (v & 0x1f)) + 63))
                v >>= 5
            out.append(chr(v + 63))
        pla, plo = a, b
    return ''.join(out)


def simplify(pts, tol):
    # Douglas–Peucker איטרטיבי
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    st = [(0, len(pts) - 1)]
    k = math.cos(math.radians(pts[0][0]))
    while st:
        a, b = st.pop()
        (y1, x1), (y2, x2) = pts[a], pts[b]
        x1 *= k
        x2 *= k
        dx, dy = x2 - x1, y2 - y1
        L2 = dx * dx + dy * dy
        best, bi = -1, -1
        for i in range(a + 1, b):
            y, x = pts[i][0], pts[i][1] * k
            if L2 == 0:
                d = math.hypot(x - x1, y - y1)
            else:
                t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / L2))
                d = math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
            if d > best:
                best, bi = d, i
        if best > tol:
            keep[bi] = True
            st.append((a, bi))
            st.append((bi, b))
    return [p for p, f in zip(pts, keep) if f]


# ---------------------------------------------------------------- קווים
def hidden(v):
    return v.get('hid') or (v.get('k') == 'platform' and not v.get('pv'))


def variant_gone(l):
    # כמו variantGone בכלי ההיסטוריה
    lk, ld = l.get('lk'), l.get('ld')
    if lk == 'removed':
        return ld or None
    if (lk == 'notrips' or l.get('historicalOnly')) and not (l.get('ntr') or 0) > 0 and ld:
        return ld
    return None


def main():
    if not os.path.isdir(os.path.join(LH, 'lines')):
        print('אין line-history/data/lines — מדלגים')
        return
    idx = {x['rd']: x for x in jload(os.path.join(LH, 'lines.json'))['lines']}
    gen = jload(os.path.join(LH, 'lines.json')).get('gen') or datetime.date.today().isoformat()
    GEN = day(gen)
    shapes, shape_id = {}, {}          # id → [tile, s, w, n, e]; מסלול מקורי → id (יציב: גיבוב של המסלול המפושט)
    tiles = defaultdict(dict)
    lines_out, line_iv = [], {}
    stop_pos = {}                      # code → (date, lat, lon, name)
    files = sorted(glob.glob(os.path.join(LH, 'lines', '*.json')))
    for n, f in enumerate(files):
        try:
            lf = jload(f)
        except Exception as e:  # noqa: BLE001
            print('  ! לא נקרא', f, e)
            continue
        rd = lf.get('rd')
        if not rd:
            continue
        pool, spool = lf.get('pool') or [], lf.get('spool') or []
        vs = sorted([v for v in lf.get('versions') or [] if not hidden(v) and not v.get('syn') and v.get('d')], key=lambda v: v['d'])
        # מיקומי תחנות: המאוחר ביותר שתועד בקווים
        for v in vs:
            for i in v.get('stops') or []:
                if isinstance(i, int) and 0 <= i < len(pool):
                    c, nm, la, lo = pool[i][:4]
                    if la is None or lo is None:
                        continue
                    old = stop_pos.get(str(c))
                    if not old or old[0] <= v['d']:
                        stop_pos[str(c)] = (v['d'], la, lo, nm)
        segs, shp = [], 0
        for i, v in enumerate(vs):
            s = v.get('shp')
            if isinstance(s, int) and 0 < s < len(spool) and len(spool[s] or '') > 2:
                shp = s
            elif isinstance(s, str) and len(s) > 2:
                spool.append(s)
                shp = len(spool) - 1
            on = v.get('k') not in ('removed', 'planned-dropped')
            a = day(v['d'])
            b = day(vs[i + 1]['d']) if i + 1 < len(vs) else None
            if b is not None and b <= a:
                continue
            segs.append([a, b, on, shp])
        meta = idx.get(rd, {})
        g = variant_gone(meta) if meta else None
        if rd.startswith('archive2012'):
            segs = [[max(s[0], day(D2012)), min(s[1] or 10 ** 6, day(D2012) + 1), s[2], s[3]] for s in segs]
            segs = [s for s in segs if s[1] > s[0]]
        elif g and segs and segs[-1][1] is None and day(g) >= segs[-1][0]:
            segs[-1][1] = max(segs[-1][0] + 1, day(g))
        # רק מרווחים פעילים; מרווחים צמודים עם אותו מסלול מתאחדים
        act = []
        for a, b, on, s in segs:
            if not on:
                continue
            if act and act[-1][1] == a and act[-1][2] == s:
                act[-1][1] = b
            else:
                act.append([a, b, s])
        if not act:
            continue
        out_iv = []
        for a, b, s in act:
            sid = None
            if s:
                enc = spool[s]
                if enc in shape_id:
                    sid = shape_id[enc]
                else:
                    try:
                        pts = simplify(decode(enc), TOL)
                    except Exception:  # noqa: BLE001
                        pts = []
                    if len(pts) >= 2:
                        la = [p[0] for p in pts]
                        lo = [p[1] for p in pts]
                        s0, w0, n0, e0 = min(la), min(lo), max(la), max(lo)
                        tile = f'{math.floor((s0 + n0) / 2 * TILE)}_{math.floor((w0 + e0) / 2 * TILE)}'
                        e5 = encode(pts)
                        h = hashlib.sha1(e5.encode()).hexdigest()
                        sid = h[:8]
                        if sid in shapes and tiles[shapes[sid][0]].get(sid) != e5:
                            sid = h[:14]   # התנגשות גיבוב (נדיר) — מזהה ארוך יותר
                        if sid not in shapes:
                            shapes[sid] = [tile, round(s0, 3), round(w0, 3), round(n0, 3), round(e0, 3)]
                            tiles[tile][sid] = e5
                    shape_id[enc] = sid
            out_iv.append([a, b, sid])
        line_iv[rd] = [(a, b) for a, b, _ in out_iv]
        m = idx.get(rd, {})
        tt = m.get('tt') or lf.get('tt') or 'bus'
        lines_out.append([rd, lf.get('line') or m.get('line') or '', lf.get('op') or m.get('op') or '', lf.get('dest') or m.get('dest') or '', tt, out_iv])
        if n % 2000 == 0:
            print(f'  קווים: {n}/{len(files)}', flush=True)

    # ---------------------------------------------------------------- תחנות
    hist = jload(os.path.join(LH, 'stops-hist.json'))
    for c, evs in hist.items():
        for e in evs:
            if e.get('la') is None:
                continue
            old = stop_pos.get(c)
            if not old or old[0] <= e['d']:
                stop_pos[c] = (e['d'], e['la'], e['lo'], e.get('n') or e.get('nn') or (old[3] if old else ''))
    cities = jload(os.path.join(LH, 'stop-cities.json'))
    hcity = {c: next((e.get('t') for e in reversed(evs) if e.get('t')), None) for c, evs in hist.items()}

    def isect(a, b, ivs):
        out = []
        for x, y in ivs:
            lo_ = max(a, x)
            hi = min(b if b is not None else 10 ** 6, y if y is not None else 10 ** 6)
            if hi > lo_:
                out.append([lo_, None if hi >= 10 ** 6 else hi])
        return out

    stops_out = []
    miss = 0
    for f in sorted(glob.glob(os.path.join(LH, 'stopev', '*.json'))):
        for c, v in jload(f).items():
            pos = stop_pos.get(c)
            if not pos:
                miss += 1
                continue
            A = set(v.get('a') or [])
            state, per = {}, defaultdict(list)       # rd → (line, מאז)
            for e in v.get('ev') or []:
                d, ln, rd, k = e[0], e[1], e[2], e[3]
                t = day(d)
                if k in ('base', 'in', 'mvin'):
                    if rd not in state:
                        state[rd] = (ln, t)
                elif k in ('out', 'mvout') and rd in state:
                    ln0, t0 = state.pop(rd)
                    if t > t0:
                        per[rd].append((ln0, t0, t))
            for rd, (ln0, t0) in state.items():
                per[rd].append((ln0, t0, None))
            rows, allv = [], []
            for rd, lst in per.items():
                ivs = line_iv.get(rd)
                if not ivs:
                    continue
                for ln0, a, b in lst:
                    for x, y in isect(a, b, ivs):
                        now = 1 if (y is None and rd in A) else 0
                        rows.append([ln0, rd, x, y, now])
                        allv.append((x, y))
            if not rows:
                continue
            # איחוד מרווחי הפעילות של התחנה
            allv.sort(key=lambda z: z[0])
            mg = []
            for x, y in allv:
                if mg and (mg[-1][1] is None or x <= mg[-1][1]):
                    if mg[-1][1] is not None and (y is None or y > mg[-1][1]):
                        mg[-1][1] = y
                else:
                    mg.append([x, y])
            flat = [z for p in mg for z in p]
            nowact = 1 if any(r[4] for r in rows) else 0
            stops_out.append([c, round(pos[1], 5), round(pos[2], 5), pos[3] or v.get('n') or '', cities.get(c) or hcity.get(c) or '', nowact, flat])
    print(f'תחנות: {len(stops_out)} (בלי מיקום: {miss})')

    os.makedirs(OUT, exist_ok=True)
    for sub in ('shapes',):
        for p in glob.glob(os.path.join(OUT, sub, '*.json')):
            os.remove(p)
    first = min((s[0] for l in lines_out for s in l[5]), default=0)
    meta = {'gen': gen, 'epoch': EPOCH.isoformat(), 'd2012': D2012, 'from': '2015-09-11', 'cont': '2017-03-16', 'to': gen,
            'first': (EPOCH + datetime.timedelta(days=first)).isoformat(),
            'note': 'צילום בודד מ-07.07.2012; מ-11.09.2015 צילומים תקופתיים; תיעוד רציף מ-16.03.2017',
            'counts': {'stops': len(stops_out), 'lines': len(lines_out), 'shapes': len(shapes)}}
    print('meta', jdump(os.path.join(OUT, 'meta.json'), meta))
    print('stops', jdump(os.path.join(OUT, 'stops.json'), {'fields': ['code', 'lat', 'lon', 'name', 'city', 'now', 'iv'], 'rows': stops_out}))
    print('lines', jdump(os.path.join(OUT, 'lines.json'), {'lines': lines_out}))
    print('shapeidx', jdump(os.path.join(OUT, 'shapeidx.json'), shapes))
    tot, big = 0, 0
    for k, v in tiles.items():
        s = jdump(os.path.join(OUT, 'shapes', k + '.json'), v)
        tot += s
        big = max(big, s)
    print('shapes', len(tiles), tot, 'max', big)


if __name__ == '__main__':
    sys.exit(main())
