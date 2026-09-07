#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""'הקו בזמן' — סוג הקו ואשכול המכרז מרשימת ClusterToLine של משרד התחבורה,
ייחודיות הקו מקובץ הנוסעים, ושינוייהם לאורך זמן (בקשת שלמה 07.09: "תוסיף
את זה לקו בזמן, ובנוסף קטגוריה של שינויים בסוג הקו").

המקורות:
  · ClusterToLine — קובץ שהמשרד מפרסם לצד לוח הזמנים: לכל מק"ט סוג הקו
    (עירוני / אזורי / בינעירוני) ואשכול המכרז. יש לו צילום יומי בארכיון
    הסדנא לידע ציבורי (S3) מ-03.2022 — ממנו מילוי לאחור של השינויים.
  · קובץ הנוסעים של המשרד (data-main.json, "מצומצם"): ייחודיות הקו —
    סדיר / תלמידים / לילה / קווים מזינים. אין לו ארכיון; שינוי נרשם כשמגיע
    קובץ חדש.

מה נשמר, בלי לגעת בגרסאות המסלול של הקו (כמו סוג הרכב, linehistory_rishui.py):
  lines/<rd>.json   →  lt: [[תאריך, סוג, ייחודיות, אשכול], …]  (הראשון = מצב הפתיחה,
                       השאר שינויים בסוג או בייחודיות; ייחודיות ריקה = לא ידועה אז)
                       ltc: הסוג הנוכחי · un: הייחודיות הנוכחית · clu: האשכול הנוכחי
  ltype-state.json  →  {"d": תאריך הסריקה האחרון, "m": {מק"ט: [סוג, ייחודיות, אשכול, מאז]}}
  changes/YYYY-MM.json → אירוע k='ltype' לכל שינוי (לפיד החודשי)

הפעלה:
  --day YYYY-MM-DD --clusters ClusterToLine.zip [--main data-main.json]   סריקה יומית
  --backfill [--from 2022-03-01] [--step 7] [--main data-main.json]
      מילוי לאחור מהארכיון: דגימה כל STEP ימים, ולכל שינוי חיפוש בינארי ליום
      המדויק. מצב-ביניים שנמשך פחות משבוע ונעלם — רעש, לא שינוי.
"""
import argparse
import collections
import csv
import datetime
import io
import json
import os
import urllib.error
import urllib.request
import zipfile

OUTDIR = os.environ.get('OUTDIR', 'line-history/data')
STATE = f'{OUTDIR}/ltype-state.json'
S3 = 'https://openbus-stride-public.s3.eu-west-1.amazonaws.com/gtfs_archive'
TYPES = {'1': 'עירוני', '2': 'אזורי', '3': 'בינעירוני'}
NOISE_DAYS = 7
TODAY = datetime.date.today().isoformat()


def log(*a):
    print(*a, flush=True)


def jload(p, dflt):
    try:
        return json.load(open(p, encoding='utf-8'))
    except Exception:  # noqa: BLE001
        return dflt


def jdump(obj, p):
    json.dump(obj, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))


# ---------------------------------------------------------------- קריאה
def parse_clusters(data):
    """ClusterToLine (bytes של zip או txt) → מק"ט → (סוג, אשכול)."""
    if data[:2] == b'PK':
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            name = next(n for n in z.namelist() if n.lower().endswith('.txt'))
            txt = z.read(name).decode('utf-8-sig', 'replace')
    else:
        txt = data.decode('utf-8-sig', 'replace')
    out = {}
    for r in csv.DictReader(io.StringIO(txt)):
        mk = (r.get('OfficeLineId') or '').strip().lstrip('0')
        if not mk:
            continue
        t = (r.get('LineTypeDesc') or '').strip() or TYPES.get((r.get('LineType') or '').strip(), '')
        out[mk] = (t, (r.get('ClusterName') or '').strip())
    return out


def load_uniq(path):
    """קובץ הנוסעים: מק"ט → ייחודיות (סדיר/תלמידים/לילה/קווים מזינים)."""
    un = {}
    for r in jload(path, []) if path else []:
        mk = str(r[0]).strip().lstrip('0')
        if mk and len(r) > 7:
            un[mk] = str(r[7]).strip()
    return un


_cache = {}


def archive(day, tries=4):
    """צילום ClusterToLine מהארכיון ליום נתון (או הימים שאחריו אם חסר); None אם אין."""
    d = datetime.date.fromisoformat(day)
    for i in range(tries):
        dd = d + datetime.timedelta(days=i)
        key = dd.isoformat()
        if key in _cache:
            if _cache[key] is not None:
                return key, _cache[key]
            continue
        url = f'{S3}/{dd.year}/{dd.month:02d}/{dd.day:02d}/ClusterToLine.zip'
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                _cache[key] = parse_clusters(r.read())
            return key, _cache[key]
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
            _cache[key] = None
        except Exception as e:  # noqa: BLE001
            log(f'  {key}: {e!r}')
            _cache[key] = None
    return None, None


# ---------------------------------------------------------------- קבצי הקו והפיד
def line_files():
    by = collections.defaultdict(list)
    for fn in os.listdir(f'{OUTDIR}/lines'):
        if fn.endswith('.json') and '-' in fn:
            by[fn.split('-', 1)[0].lstrip('0')].append(fn)
    return by


UN_NAME = {'סדיר': 'סדיר', 'תלמידים': 'תלמידים', 'לילה': 'לילה', 'קווים מזינים': 'מזין'}


def note_for(pt, pu, t, u):
    parts = []
    if t and pt and t != pt:
        parts.append(f'סוג הקו ברשימת האשכולות של משרד התחבורה שונה: {pt} ← {t}')
    if u and pu and u != pu:
        parts.append(f'ייחודיות הקו בקובץ הנוסעים של המשרד שונתה: {UN_NAME.get(pu, pu)} ← {UN_NAME.get(u, u)}')
    return ' · '.join(parts)


_chm = {}


def add_change(d, lf, note):
    month = d[:7]
    if month not in _chm:
        p = f'{OUTDIR}/changes/{month}.json'
        _chm[month] = (p, jload(p, {'month': month, 'changes': []}))
    p, chm = _chm[month]
    rd = lf.get('rd')
    if any(c.get('d') == d and c.get('rd') == rd and c.get('k') == 'ltype' for c in chm['changes']):
        return
    e = {'d': d, 'rd': rd, 'line': lf.get('line'), 'k': 'ltype', 'note': note}
    if lf.get('op'):
        e['op'] = lf['op']
    chm['changes'].append(e)


def flush_changes():
    for p, chm in _chm.values():
        chm['changes'].sort(key=lambda c: c.get('d', ''))
        jdump(chm, p)


def purge_changes():
    n = 0
    for fn in os.listdir(f'{OUTDIR}/changes'):
        if not fn.endswith('.json'):
            continue
        p = f'{OUTDIR}/changes/{fn}'
        chm = jload(p, None)
        if not chm or not isinstance(chm.get('changes'), list):
            continue
        keep = [c for c in chm['changes'] if c.get('k') != 'ltype']
        removed = len(chm['changes']) - len(keep)
        n += removed
        chm['changes'] = keep
        if len(fn) == 12 and fn[:-5].replace('-', '').isdigit():
            _chm[fn[:-5]] = (p, chm)
        elif removed:
            jdump(chm, p)
    return n


def apply_to_lines(files, mkt, lt, events):
    """כותב lt/ltc/un/clu לכל קובצי הקו של המק"ט; אירועי הפיד — לכל וריאנט."""
    n = 0
    for fn in files.get(mkt, []):
        p = f'{OUTDIR}/lines/{fn}'
        lf = jload(p, None)
        if not lf:
            continue
        cur = lt[-1]
        want = (lt, cur[1], cur[2], cur[3])
        if (lf.get('lt'), lf.get('ltc'), lf.get('un'), lf.get('clu')) != want:
            lf['lt'] = lt
            lf['ltc'], lf['un'], lf['clu'] = cur[1], cur[2], cur[3]
            jdump(lf, p)
            n += 1
        for d, note in events:
            add_change(d, lf, note)
    return n


# ---------------------------------------------------------------- יומי
def daily(day, clusters_path, main_path):
    cl = parse_clusters(open(clusters_path, 'rb').read())
    un = load_uniq(main_path)
    state = jload(STATE, {'d': None, 'm': {}})
    if state.get('d') and day <= state['d']:
        log(f'סוג קו {day}: כבר נסרק (המצב עד {state["d"]})')
        return
    files = line_files()
    n_new = n_chg = n_files = 0
    for mkt, (t, c) in sorted(cl.items()):
        u = un.get(mkt, '')
        st = state['m'].get(mkt)
        if st is None:
            state['m'][mkt] = [t, u, c, day]
            n_new += 1
            for fn in files.get(mkt, []):
                p = f'{OUTDIR}/lines/{fn}'
                lf = jload(p, None)
                if lf and not lf.get('lt'):
                    lf['lt'] = [[day, t, u, c]]
                    lf['ltc'], lf['un'], lf['clu'] = t, u, c
                    jdump(lf, p)
                    n_files += 1
            continue
        pt, pu, pc = st[0], st[1], st[2]
        # ייחודיות: משווים רק כשיש ערך בשני הצדדים (קובץ הנוסעים לא מכסה כל קו)
        changed = (t and pt and t != pt) or (u and pu and u != pu)
        if changed:
            n_chg += 1
            note = note_for(pt, pu, t, u)
            log(f'  שינוי: מק"ט {mkt}: {note} ({day})')
            for fn in files.get(mkt, []):
                p = f'{OUTDIR}/lines/{fn}'
                lf = jload(p, None)
                if not lf:
                    continue
                lt = list(lf.get('lt') or [[st[3], pt, pu, pc]])
                lt.append([day, t, u or pu, c])
                lf['lt'] = lt
                lf['ltc'], lf['un'], lf['clu'] = t, u or pu, c
                jdump(lf, p)
                add_change(day, lf, note)
                n_files += 1
            state['m'][mkt] = [t, u or pu, c, day]
        elif (u and not pu) or c != pc:
            # ייחודיות שנודעה לראשונה, או אשכול ששונה — מצב בלי אירוע
            state['m'][mkt] = [t, u or pu, c, st[3]]
            for fn in files.get(mkt, []):
                p = f'{OUTDIR}/lines/{fn}'
                lf = jload(p, None)
                if lf and (lf.get('un') != (u or pu) or lf.get('clu') != c):
                    lf['un'], lf['clu'] = u or pu, c
                    if lf.get('lt'):
                        lf['lt'][-1][2] = u or pu
                        lf['lt'][-1][3] = c
                    jdump(lf, p)
                    n_files += 1
    state['d'] = day
    jdump(state, STATE)
    flush_changes()
    log(f'סוג קו {day}: {len(cl):,} מק"טים ברשימה · חדשים {n_new:,} · שינויים {n_chg:,} · קובצי קו שעודכנו {n_files:,}')


# ---------------------------------------------------------------- מילוי לאחור
def bisect_change(mkt, a, b, old, new):
    """היום הראשון ב-(a, b] שבו הסוג הוא new (a: old). מוריד רק ימים באמצע."""
    lo, hi = datetime.date.fromisoformat(a), datetime.date.fromisoformat(b)
    while (hi - lo).days > 1:
        mid = lo + datetime.timedelta(days=(hi - lo).days // 2)
        key, snap = archive(mid.isoformat(), tries=(hi - mid).days)
        if snap is None or datetime.date.fromisoformat(key) >= hi:
            break
        t = snap.get(mkt, (None, None))[0]
        if t == new:
            hi = datetime.date.fromisoformat(key)
        else:
            lo = datetime.date.fromisoformat(key)
    return hi.isoformat()


def backfill(start, step, main_path):
    un = load_uniq(main_path)
    files = line_files()
    d = datetime.date.fromisoformat(start)
    end = datetime.date.today()
    samples = []          # [(תאריך, snapshot)]
    while d <= end:
        key, snap = archive(d.isoformat())
        if snap is not None and (not samples or key != samples[-1][0]):
            samples.append((key, snap))
        d += datetime.timedelta(days=step)
    log(f'דגימות: {len(samples)} ({samples[0][0]}…{samples[-1][0]})')
    # רצף מצבים לכל מק"ט: [(תאריך, סוג, אשכול)]
    seq = collections.defaultdict(list)
    prev = {}
    for key, snap in samples:
        for mkt, (t, c) in snap.items():
            p = prev.get(mkt)
            if p is None:
                seq[mkt].append([key, t, c])
            elif p[1] != t:
                exact = bisect_change(mkt, p[0], key, p[1], t)
                seq[mkt].append([exact, t, c])
            elif p[2] != c:
                seq[mkt][-1][2] = c      # אשכול ששונה — לא אירוע; נשמר במצב האחרון
            prev[mkt] = (key, t, c)
        # קו שירד מהרשימה — המצב האחרון שלו נשאר
    # רעש: מצב שנמשך פחות משבוע וחזר לקודמו
    n_noise = 0
    for mkt, s in seq.items():
        i = 1
        while i < len(s) - 1:
            dur = (datetime.date.fromisoformat(s[i + 1][0]) - datetime.date.fromisoformat(s[i][0])).days
            if s[i + 1][1] == s[i - 1][1] and dur < NOISE_DAYS:
                del s[i:i + 2]
                n_noise += 1
            else:
                i += 1
    purged = purge_changes()
    n_files = n_ev = n_mk = 0
    state = {'d': samples[-1][0], 'm': {}}
    for mkt, s in seq.items():
        u = un.get(mkt, '')
        lt = [[x[0], x[1], '', x[2]] for x in s]
        lt[-1][2] = u        # הייחודיות ידועה רק להיום
        events = [(s[i][0], note_for(s[i - 1][1], '', s[i][1], '')) for i in range(1, len(s))]
        n_ev += len(events)
        state['m'][mkt] = [s[-1][1], u, s[-1][2], s[-1][0]]
        if mkt in files:
            n_mk += 1
            n_files += apply_to_lines(files, mkt, lt, events)
    flush_changes()
    jdump(state, STATE)
    log(f'מק"טים ברשימה: {len(seq):,} (עם קובצי קו: {n_mk:,}) · שינויי סוג: {n_ev:,} · רעש שהושמט: {n_noise} · '
        f'קובצי קו שעודכנו: {n_files:,} · אירועי פיד ישנים שנמחקו: {purged}')
    hist = collections.Counter(x[0][:4] for s in seq.values() for x in s[1:])
    log('שינויים לפי שנה: ' + ' · '.join(f'{y}: {n}' for y, n in sorted(hist.items())))
    kinds = collections.Counter(f'{s[i - 1][1]} ← {s[i][1]}' for s in seq.values() for i in range(1, len(s)))
    log('לפי סוג: ' + ' · '.join(f'{k}: {n}' for k, n in kinds.most_common(12)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--day', default='')
    ap.add_argument('--clusters', default='')
    ap.add_argument('--main', default='data-main.json')
    ap.add_argument('--backfill', action='store_true')
    ap.add_argument('--from', dest='start', default='2022-03-01')
    ap.add_argument('--step', type=int, default=7)
    a = ap.parse_args()
    if a.backfill:
        backfill(a.start, a.step, a.main)
    else:
        if not a.clusters:
            ap.error('--clusters נדרש')
        daily(a.day or TODAY, a.clusters, a.main)


if __name__ == '__main__':
    main()
