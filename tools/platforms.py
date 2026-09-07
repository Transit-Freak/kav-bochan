#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""רציפים — לפי שורות הרציפים בקובץ התחנות של משרד התחבורה (שלמה 07.09).

בקובץ stops.txt יש למסוף שורה (stop_id) לכל רציף, וכולן נושאות את אותו
מק"ט (stop_code): "ת. מרכזית ראשל''צ/רציפים" (33512) הוא 19 שורות — שורת-אם
(location_type=1) ו-18 רציפים (3–20) בתיאור "רציף: N". stop_times מפנה
לשורת הרציף, ולכן לכל נסיעה ידוע הרציף שלה. הסורק היומי (linehistory.py)
עובד לפי מק"ט וקרס את כל השורות למספר אחד — שקפץ 12→17→8→16→3 בלי שרציף
נוסף או בוטל. הכלי הזה עובד לפי השורות עצמן:

  · platforms.json (v2) — st: לכל מק"ט הרציפים שיש בהם נסיעות בתוקף ומי
    עוצר בכל אחד; rd: לכל וריאנט הרציף שלו בכל תחנה שיש לה רציפים.
  · אירועים, רק אחרי STABLE_DAYS ימים רצופים (רפרוף יומי אינו שינוי):
      תחנה — רציף שקיבל קווים / נשאר בלי קווים: k=platform, pv=2, st=add|del
      קו — וריאנט שעבר רציף בתחנה: גרסה k=platform, src=gt, pv=2,
           pl=[[מק"ט, שם, ישן, חדש]] + שורה בפיד החודשי
  · המצב ב-platforms-state.json. ריצה ראשונה = בסיס שקט, בלי אירועים.

קלט: STOPS/STOP_TIMES/TRIPS/ROUTES/CALENDAR (ה-GTFS של היום), או GTFS_URL
(zip בארכיון הסדנא — לבדיקה מקומית). TODAY, OUTDIR, DRY=1 (בלי כתיבה).
"""
import csv
import datetime
import io
import json
import os
import re
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from compact_lines import compact, materialize  # noqa: E402

OUTDIR = os.environ.get('OUTDIR', 'line-history/data')
TODAY = os.environ.get('TODAY') or datetime.date.today().isoformat()
DRY = os.environ.get('DRY') == '1'
GTFS_URL = os.environ.get('GTFS_URL', '')
FILES = {k: os.environ.get(k, f'{k.lower()}.txt') for k in ('STOPS', 'STOP_TIMES', 'TRIPS', 'ROUTES', 'CALENDAR')}
STATE = f'{OUTDIR}/platforms-state.json'
OUT = f'{OUTDIR}/platforms.json'
STABLE_DAYS = 7      # רציף/מעבר נרשם רק אחרי שהחזיק שבוע
MAX_LINES = 12       # כמה קווים לרשום על אירוע תחנה
PV = 2               # גרסת הנתונים — האתר מציג רק אירועי רציף עם pv=2


def log(*a):
    print(*a, flush=True)


def jload(p, dflt):
    try:
        return json.load(open(p, encoding='utf-8'))
    except Exception:
        return dflt


def jdump(obj, p):
    if DRY:
        return
    json.dump(obj, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))


def fsafe(rd):
    return rd.replace('#', 'H').replace('/', '_')


def days_between(a, b):
    return (datetime.date.fromisoformat(b) - datetime.date.fromisoformat(a)).days


def plat_of(desc):
    """'רחוב: X עיר: Y רציף: N קומה: W' → N; ריק/0 = אין רציף."""
    m = re.search(r'רציף:\s*(.*?)\s*(?:קומה:|$)', desc or '')
    p = (m.group(1) if m else '').strip()
    return '' if (p in ('', '0', '-', '—') or ':' in p or len(p) > 6) else p


def city_of(desc):
    m = re.search(r'עיר:\s*(.*?)\s*רציף:', desc or '')
    return m.group(1).strip() if m else ''


def plat_key(p):
    """מיון רציפים: מספרים לפי ערך, אחר כך השאר לפי טקסט."""
    return (0, int(p)) if p.isdigit() else (1, 0, p)


# ---------- קריאת GTFS: קובץ מקומי או חבר ב-zip מרוחק ----------
_cd = None


def open_member(name):
    if not GTFS_URL:
        return open(FILES[name], encoding='utf-8-sig')
    global _cd
    from backfill_geo import central_dir, stream_member
    if _cd is None:
        _cd = central_dir(GTFS_URL)
    buf = io.BytesIO()
    stream_member(GTFS_URL, _cd, FILES[name].split('/')[-1] if FILES[name].endswith('.txt') else FILES[name], buf.write)
    return io.StringIO(buf.getvalue().decode('utf-8-sig'))


def stream_stop_times(cb):
    """שורות stop_times, בזרימה — הקובץ ענק; cb(trip_id, stop_id) לכל שורה."""
    if not GTFS_URL:
        with open(FILES['STOP_TIMES'], encoding='utf-8-sig') as f:
            hdr = next(csv.reader([f.readline()]))
            hi = {h.strip(): i for i, h in enumerate(hdr)}
            ti, si = hi['trip_id'], hi['stop_id']
            for ln in f:
                r = ln.split(',')
                if len(r) > max(ti, si):
                    cb(r[ti], r[si].strip())
        return
    from backfill_geo import central_dir, stream_member
    global _cd
    if _cd is None:
        _cd = central_dir(GTFS_URL)
    buf = [b'']
    hi = {}

    def feed(chunk):
        buf[0] += chunk
        *lines, buf[0] = buf[0].split(b'\n')
        for ln in lines:
            if not ln.strip():
                continue
            if not hi:
                for i, h in enumerate(next(csv.reader([ln.decode('utf-8-sig')]))):
                    hi[h.strip()] = i
                hi['_t'], hi['_s'] = hi['trip_id'], hi['stop_id']
                continue
            r = ln.decode('utf-8', 'replace').split(',')
            if len(r) > max(hi['_t'], hi['_s']):
                cb(r[hi['_t']], r[hi['_s']].strip())
    stream_member(GTFS_URL, _cd, 'stop_times.txt', feed)
    if buf[0].strip():
        feed(b'\n')


def read_gtfs():
    # תחנות: לכל שורה — מק"ט, שם, רציף, מיקום, עיר, שורת-אם
    rows = {}          # stop_id → dict
    by_code = defaultdict(list)
    with open_member('STOPS') as f:
        rd_ = csv.reader(f)
        hdr = next(rd_)
        ix = {h.strip(): i for i, h in enumerate(hdr)}
        for r in rd_:
            try:
                sid = r[ix['stop_id']]
                d = {'c': r[ix['stop_code']].strip(), 'n': ' '.join(r[ix['stop_name']].split()),
                     'p': plat_of(r[ix['stop_desc']]), 't': city_of(r[ix['stop_desc']]),
                     'la': round(float(r[ix['stop_lat']]), 5), 'lo': round(float(r[ix['stop_lon']]), 5),
                     'lt': (r[ix['location_type']].strip() if 'location_type' in ix and len(r) > ix['location_type'] else '') or '0'}
            except Exception:
                continue
            rows[sid] = d
            if d['c']:
                by_code[d['c']].append(sid)
    plat_ids = {sid for sid, d in rows.items() if d['p']}
    # מק"טים עם רציפים; שם/מיקום התחנה — משורת-האם אם יש, אחרת השורה הראשונה
    info = {}
    for c, sids in by_code.items():
        if not any(rows[s]['p'] for s in sids):
            continue
        parent = next((rows[s] for s in sids if rows[s]['lt'] == '1'), None) or rows[sids[0]]
        info[c] = {'n': parent['n'], 't': parent['t'], 'la': parent['la'], 'lo': parent['lo']}
    log(f'תחנות: {len(rows):,} שורות · {len(plat_ids):,} שורות-רציף · {len(info):,} מק"טים עם רציפים')

    routes = {}
    with open_member('ROUTES') as f:
        for r in csv.DictReader(f):
            rd = (r.get('route_desc') or '').strip()
            if rd:
                routes[r['route_id']] = (rd, (r.get('route_short_name') or '').strip())
    active = None
    try:
        with open_member('CALENDAR') as f:
            ymd = TODAY.replace('-', '')
            active = set()
            for r in csv.DictReader(f):
                if (r.get('start_date') or '00000000') <= ymd <= (r.get('end_date') or '99999999'):
                    active.add(r['service_id'])
    except Exception as e:  # noqa: BLE001
        log('אזהרה: אין calendar —', e)
    trip_rd = {}
    with open_member('TRIPS') as f:
        for r in csv.DictReader(f):
            if active is not None and r.get('service_id') not in active:
                continue
            rt = routes.get(r['route_id'])
            if rt:
                trip_rd[r['trip_id']] = rt
    log(f'נסיעות בתוקף: {len(trip_rd):,}')

    cnt = defaultdict(lambda: defaultdict(int))    # (code, plat) → rd → נסיעות
    rdc = defaultdict(lambda: defaultdict(int))    # (rd, code) → plat → נסיעות
    lines = {}                                     # rd → מספר קו
    n = [0]

    def on_row(t, sid):
        if sid not in plat_ids:
            return
        rt = trip_rd.get(t)
        if not rt:
            return
        d = rows[sid]
        rd, line = rt
        cnt[(d['c'], d['p'])][rd] += 1
        rdc[(rd, d['c'])][d['p']] += 1
        lines[rd] = line
        n[0] += 1
    stream_stop_times(on_row)
    log(f'עצירות ברציפים (נסיעות בתוקף): {n[0]:,}')
    return info, cnt, rdc, lines


def build(info, cnt, rdc, lines):
    st = {}
    for (c, p), by_rd in cnt.items():
        e = st.setdefault(c, {'n': info.get(c, {}).get('n', ''), 'p': {}})
        # [[וריאנט, מספר קו], …] — ממוין לפי מספר הקו; המספר נשמר כאן כי עמוד
        # התחנה לא בהכרח מכיר את כל הווריאנטים
        e['p'][p] = [[rd, lines.get(rd, '')] for rd in sorted(by_rd, key=lambda rd: (len(lines.get(rd, '')), lines.get(rd, ''), rd))]
    for c, e in st.items():
        e['p'] = dict(sorted(e['p'].items(), key=lambda kv: plat_key(kv[0])))
    rdm = {}
    for (rd, c), by_p in rdc.items():
        # הרציף הרווח של הווריאנט בתחנה; שוויון — הקטן
        p = min(by_p, key=lambda x: (-by_p[x], plat_key(x)))
        rdm.setdefault(rd, {})[c] = p
    return st, rdm


# ---------- אירועים ----------
def stop_event(shist, feeds, code, date, kind, plat, info, line_nos):
    ev = {'d': date, 'k': 'platform', 'pv': PV, 'st': kind, 'pl': plat,
          'n': info.get('n', ''), 't': info.get('t', ''), 'la': info.get('la'), 'lo': info.get('lo'),
          'lines': line_nos[:MAX_LINES]}
    h = shist.setdefault(code, [])
    h[:] = [x for x in h if not (x.get('k') == 'platform' and x.get('pv') == PV and x.get('st') == kind
                                 and x.get('pl') == plat and x.get('d') == date)]
    h.append(ev)
    h.sort(key=lambda x: x.get('d', ''))
    m = feeds.setdefault(('stops', date[:7]), None)
    if m is None:
        p = f'{OUTDIR}/changes/stops-{date[:7]}.json'
        m = feeds[('stops', date[:7])] = jload(p, {'month': date[:7], 'changes': []})
    m['changes'] = [x for x in m['changes'] if not (x.get('c') == code and x.get('k') == 'platform' and x.get('pv') == PV
                                                    and x.get('st') == kind and x.get('pl') == plat and x.get('d') == date)]
    m['changes'].append({'d': date, 'c': code, **ev})


def line_event(feeds, rd, date, code, name, old, new):
    p = f'{OUTDIR}/lines/{fsafe(rd)}.json'
    lf = materialize(jload(p, None))
    if not lf:
        return False
    vs = lf.get('versions') or []
    base = next((v for v in reversed(vs) if v.get('stops') and v.get('d', '') <= date), None) \
        or next((v for v in reversed(vs) if v.get('stops')), None)
    if base is None:
        return False
    note_of = lambda pl: 'שינוי רציף: ' + ' · '.join(f'בתחנה {nm} עבר מרציף {o} לרציף {nw}' for _c, nm, o, nw in pl)  # noqa: E731
    ex = next((v for v in vs if v.get('d') == date and v.get('k') == 'platform' and v.get('pv') == PV), None)
    if ex is not None:
        ex['pl'] = [x for x in ex.get('pl') or [] if x[0] != code] + [[code, name, old, new]]
        ex['note'] = note_of(ex['pl'])
    else:
        vs.append({'d': date, 'k': 'platform', 'src': 'gt', 'pv': PV, 'stops': base['stops'], 'shp': base.get('shp', ''),
                   'pl': [[code, name, old, new]], 'note': note_of([[code, name, old, new]])})
        vs.sort(key=lambda v: v.get('d', ''))    # מיון יציב — סדר אירועי אותו יום נשמר
        lf['versions'] = vs
    jdump(compact(lf), p)
    m = feeds.get(('lines', date[:7]))
    if m is None:
        m = feeds[('lines', date[:7])] = jload(f'{OUTDIR}/changes/{date[:7]}.json', {'month': date[:7], 'changes': []})
    pl_all = (ex['pl'] if ex is not None else [[code, name, old, new]])
    m['changes'] = [x for x in m['changes'] if not (x.get('rd') == rd and x.get('d') == date and x.get('k') == 'platform' and x.get('pv') == PV)]
    m['changes'].append({'d': date, 'rd': rd, 'line': lf.get('line', ''), 'op': lf.get('op', ''), 'k': 'platform', 'pv': PV,
                         'pl': pl_all[:15], 'note': note_of(pl_all)})
    return True


def main():
    info, cnt, rdc, lines = read_gtfs()
    st, rdm = build(info, cnt, rdc, lines)
    n_multi = sum(1 for e in st.values() if len(e['p']) > 1)
    log(f'מק"טים עם רציפים פעילים: {len(st):,} (מהם {n_multi:,} עם יותר מרציף אחד) · וריאנטים עם רציף: {len(rdm):,}')

    state = jload(STATE, None)
    first = state is None
    if first:
        state = {'st': {}, 'rd': {}}
        log('ריצה ראשונה — בסיס שקט, בלי אירועים')
    sst, srd = state.setdefault('st', {}), state.setdefault('rd', {})
    shist = None
    feeds = {}
    n_add = n_del = n_mv = 0

    def lines_of(rds):
        out = []
        for x in rds:
            rd, ln = (x if isinstance(x, list) else [x, ''])
            ln = ln or lines.get(rd) or rd.split('-')[0]
            if ln not in out:
                out.append(ln)
        return out

    # --- תחנה: רציפים שקיבלו קווים / נשארו בלי קווים ---
    for c, e in st.items():
        s = sst.setdefault(c, {})
        for p, rds in e['p'].items():
            x = s.get(p)
            if x is None:
                s[p] = {'s': TODAY, 'ok': first, 'rds': rds}
                continue
            x.pop('g', None)
            x['rds'] = rds
            if not x.get('ok') and days_between(x['s'], TODAY) >= STABLE_DAYS:
                x['ok'] = True
                if shist is None:
                    shist = jload(f'{OUTDIR}/stops-hist.json', {})
                stop_event(shist, feeds, c, x['s'], 'add', p, info.get(c, {}), lines_of(rds))
                n_add += 1
    for c, s in list(sst.items()):
        today_p = st.get(c, {}).get('p', {})
        for p, x in list(s.items()):
            if p in today_p:
                continue
            if not x.get('ok'):
                del s[p]                      # מועמד שנעלם — לא היה
                continue
            if not x.get('g'):
                x['g'] = TODAY
            elif days_between(x['g'], TODAY) >= STABLE_DAYS:
                if shist is None:
                    shist = jload(f'{OUTDIR}/stops-hist.json', {})
                stop_event(shist, feeds, c, x['g'], 'del', p, info.get(c, {}), lines_of(x.get('rds') or []))
                n_del += 1
                del s[p]
        if not s:
            del sst[c]

    # --- קו: וריאנט שעבר רציף בתחנה ---
    for rd, byc in rdm.items():
        s = srd.setdefault(rd, {})
        for c, p in byc.items():
            x = s.get(c)
            if x is None:
                s[c] = {'p': p}
                continue
            if x['p'] == p:
                x.pop('c', None)
                continue
            cand = x.get('c')
            if cand and cand[0] == p:
                if days_between(cand[1], TODAY) >= STABLE_DAYS:
                    if line_event(feeds, rd, cand[1], c, st.get(c, {}).get('n') or info.get(c, {}).get('n', c), x['p'], p):
                        n_mv += 1
                    x['p'] = p
                    x.pop('c', None)
            else:
                x['c'] = [p, TODAY]
        for c in list(s):
            if c not in byc:
                del s[c]                      # הווריאנט כבר לא עוצר שם (או בלי רציף) — אירועי התחנות מכסים
    for rd in list(srd):
        if rd not in rdm:
            del srd[rd]

    state['updated'] = TODAY
    jdump(state, STATE)
    jdump({'v': 2, 'updated': TODAY, 'st': st, 'rd': rdm}, OUT)
    if shist is not None:
        jdump(shist, f'{OUTDIR}/stops-hist.json')
    for (kind, month), m in feeds.items():
        m['changes'].sort(key=lambda x: x.get('d', ''))
        jdump(m, f'{OUTDIR}/changes/{"stops-" if kind == "stops" else ""}{month}.json')
    log(f'אירועים: רציף נוסף {n_add} · רציף בוטל {n_del} · קו עבר רציף {n_mv}' + (' (DRY)' if DRY else ''))
    for c in ('33512', '4170', '38772'):
        if c in st:
            log(f'  {c} {st[c]["n"]}: {len(st[c]["p"])} רציפים פעילים — ' + ', '.join(st[c]['p']))


if __name__ == '__main__':
    main()
