#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""מילוי לאחור של "רציף נוסף / רציף בוטל" לפי שורות הרציפים (שלמה 18.09).

הכלי היומי (tools/platforms.py) עובד מ-07.09.2026 לפי השורות עצמן בקובץ
התחנות: למסוף יש שורה (stop_id) לכל רציף, כולן עם אותו מק"ט, ובתיאור
"רציף: N". רציף שהופיע = נוסף, רציף שנעלם = בוטל. המילוי הישן
(backfill_platforms.py) קרס את כל השורות למספר אחד ולכן תוצריו מוסתרים.

כאן אותו כלל כמו בכלי היומי, על כל צילום בארכיון:
  · TransitFeeds 2017–2022 (tf-days.txt) — stops.txt בבקשות Range.
  · הארכיון היומי של הסדנא (openbus) מ-2023 ועד יום לפני הבסיס של הכלי
    היומי — כל יום שני (OB_STEP), stops.txt בבקשות Range.
לכל צילום: {מק"ט: {רציף: (שם, עיר, lat, lon)}}. נספרים רק מסופים — מק"ט
שבצילום כלשהו היו לו לפחות 2 רציפים (תחנה בודדת שמספרה מרצד אינה מסוף).
יציבות כמו בכלי היומי: רציף חדש/חסר נרשם רק אחרי שהחזיק STABLE_DAYS ימים
ולפחות STABLE_SNAPS צילומים ברצף; רציף שחזר בינתיים אינו אירוע.
תאריך האירוע = הצילום שבו נראה לראשונה (או נעלם לראשונה).

פלט: stops-hist.json + changes/stops-YYYY-MM.json, אירועי k=platform עם
pv=2 (הפורמט של הכלי היומי; האתר מציג רק pv=2), src=tf|ob, lines=[] —
מקובץ התחנות לא ידוע מי עצר ברציף.
הצילום הראשון = בסיס שקט. מצב: backfill-platform-rows-state.json.
FROM/TO (YYYYMMDD) · MAX_DAYS · MAX_MIN · DRY=1 · RESET=1
"""
import datetime
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from backfill_geo import central_dir, member_rows  # noqa: E402

TF = ('https://openmobilitydata-data.s3-us-west-1.amazonaws.com'
      '/public/feeds/ministry-of-transport-and-road-safety/820/{ds}/gtfs.zip')
OB = ('https://openbus-stride-public.s3.eu-west-1.amazonaws.com'
      '/gtfs_archive/{y}/{m}/{d}/israel-public-transportation.zip')
OUTDIR = os.environ.get('OUTDIR', 'line-history/data')
STATE = f'{OUTDIR}/backfill-platform-rows-state.json'
FROM = os.environ.get('FROM', '20170101')
TO = os.environ.get('TO', '20260906')        # יום לפני הבסיס של הכלי היומי (07.09.2026)
OB_FROM = '20230101'
OB_STEP = int(os.environ.get('OB_STEP', '2') or 2)
MAX_DAYS = int(os.environ.get('MAX_DAYS', '0') or 0)
MAX_MIN = float(os.environ.get('MAX_MIN', '0') or 0)
DRY = os.environ.get('DRY') == '1'
RESET = os.environ.get('RESET') == '1'
PV = 2
STABLE_DAYS = 7
STABLE_SNAPS = 2


def iso(ds):
    return f'{ds[:4]}-{ds[4:6]}-{ds[6:]}'


def days_between(a, b):
    return (datetime.date.fromisoformat(b) - datetime.date.fromisoformat(a)).days


def jload(p, dflt):
    try:
        return json.load(open(p, encoding='utf-8'))
    except (OSError, ValueError):
        return dflt


def jdump(obj, p):
    tmp = p + '.tmp'
    json.dump(obj, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, p)


def plat_of(desc):
    m = re.search(r'רציף:\s*(.*?)\s*(?:קומה:|$)', desc or '')
    p = (m.group(1) if m else '').strip()
    return '' if (p in ('', '0', '-', '—') or ':' in p or len(p) > 6) else p


def city_of(desc):
    m = re.search(r'עיר:\s*(.*?)\s*רציף:', desc or '')
    return m.group(1).strip() if m else ''


def all_days():
    """[(YYYYMMDD, src)] — צילומי TransitFeeds ואחריהם ימי הסדנא."""
    out = []
    for l in open(f'{OUTDIR}/tf-days.txt'):
        l = l.strip()
        if l:
            out.append((l, 'tf'))
    d = datetime.date.fromisoformat(iso(OB_FROM))
    end = datetime.date.fromisoformat(iso(TO)) if TO else datetime.date.today()
    while d <= end:
        out.append((d.strftime('%Y%m%d'), 'ob'))
        d += datetime.timedelta(days=OB_STEP)
    return [x for x in out if FROM <= x[0] <= TO]


def snapshot(ds, src):
    """{מק"ט: {רציף: [שם, עיר, lat, lon, שורת-אם?]}}"""
    url = TF.format(ds=ds) if src == 'tf' else OB.format(y=ds[:4], m=ds[4:6], d=ds[6:])
    members = central_dir(url)
    c, rows = member_rows(url, members, 'stops.txt')
    out = {}
    parent = {}
    for r in rows:
        try:
            code = (r[c['stop_code']] or '').strip()
            if not code:
                continue
            desc = r[c['stop_desc']] if 'stop_desc' in c else ''
            name = ' '.join(r[c['stop_name']].split())
            la, lo = round(float(r[c['stop_lat']]), 5), round(float(r[c['stop_lon']]), 5)
            lt = (r[c['location_type']].strip() if 'location_type' in c and len(r) > c['location_type'] else '')
            if lt == '1':
                parent[code] = [name, city_of(desc), la, lo]
            p = plat_of(desc)
            if not p:
                continue
            out.setdefault(code, {})[p] = [name, city_of(desc), la, lo]
        except (KeyError, ValueError, IndexError):
            continue
    return out, parent


def stop_event(shist, feeds, code, date, kind, plat, info, src):
    ev = {'d': date, 'k': 'platform', 'pv': PV, 'st': kind, 'pl': plat, 'src': src,
          'n': info[0], 't': info[1], 'la': info[2], 'lo': info[3], 'lines': []}
    h = shist.setdefault(code, [])
    h[:] = [x for x in h if not (x.get('k') == 'platform' and x.get('pv') == PV and x.get('st') == kind
                                 and x.get('pl') == plat and x.get('d') == date)]
    h.append(ev)
    h.sort(key=lambda x: x.get('d', ''))
    m = feeds.get(date[:7])
    if m is None:
        p = f'{OUTDIR}/changes/stops-{date[:7]}.json'
        m = feeds[date[:7]] = jload(p, {'month': date[:7], 'changes': []})
    m['changes'] = [x for x in m['changes'] if not (x.get('c') == code and x.get('k') == 'platform' and x.get('pv') == PV
                                                    and x.get('st') == kind and x.get('pl') == plat and x.get('d') == date)]
    m['changes'].append({'d': date, 'c': code, **ev})


def reset_previous():
    """מחיקת אירועי הכלי הזה (pv=2 עם src=tf|ob) — לא של הכלי היומי (בלי src)."""
    mine = lambda x: x.get('k') == 'platform' and x.get('pv') == PV and x.get('src') in ('tf', 'ob')  # noqa: E731
    p = f'{OUTDIR}/stops-hist.json'
    h = jload(p, {})
    n = 0
    for code in list(h):
        before = len(h[code])
        h[code] = [x for x in h[code] if not mine(x)]
        n += before - len(h[code])
        if not h[code]:
            del h[code]
    jdump(h, p)
    for f in os.listdir(f'{OUTDIR}/changes'):
        if f.startswith('stops-'):
            p = f'{OUTDIR}/changes/{f}'
            m = jload(p, None)
            if m:
                m['changes'] = [x for x in m['changes'] if not mine(x)]
                jdump(m, p)
    try:
        os.remove(STATE)
    except OSError:
        pass
    print(f'איפוס: נמחקו {n} אירועים קודמים של הכלי', file=sys.stderr)


def main():
    if RESET and not DRY:
        reset_previous()
    days = all_days()
    st = jload(STATE, {'done': [], 'cur': {}, 'pend_add': {}, 'pend_del': {}, 'multi': []})
    done = set(st['done'])
    todo = [x for x in days if x[0] not in done]
    if MAX_DAYS:
        todo = todo[:MAX_DAYS]
    print(f'צילומים בטווח: {len(days)} · עובדו: {len(done)} · בריצה זו: {len(todo)}', file=sys.stderr)
    if not todo:
        print('הכל עובד', file=sys.stderr)
        return
    # cur: מק"ט → {רציף: info} — הרציפים המאושרים
    # pend_add/pend_del: "מק"ט|רציף" → [מאז ISO, צילומים ברצף, info]
    cur = st['cur']
    pend_add, pend_del = st['pend_add'], st['pend_del']
    multi = set(st['multi'])
    baseline = not cur and not done
    deadline = time.monotonic() + MAX_MIN * 60 if MAX_MIN else None
    events = []          # (date, code, kind, plat, info, src)
    for ds, src in todo:
        if deadline and time.monotonic() > deadline:
            print('נגמר תקציב הזמן — נמשיך בריצה הבאה', file=sys.stderr)
            break
        try:
            snap, parent = snapshot(ds, src)
        except Exception as e:  # noqa: BLE001
            print(f'  {iso(ds)}: דילוג — {e}', file=sys.stderr)
            done.add(ds)
            continue
        today = iso(ds)
        for code, ps in snap.items():
            if len(ps) >= 2:
                multi.add(code)
        if baseline:
            for code, ps in snap.items():
                cur[code] = {p: v for p, v in ps.items()}
            baseline = False
            done.add(ds)
            print(f'  {today}: בסיס שקט — {len(cur)} מק"טים עם רציפים', file=sys.stderr)
            continue
        n = 0
        # רציפים שהופיעו
        for code, ps in snap.items():
            have = cur.setdefault(code, {})
            for p, v in ps.items():
                key = f'{code}|{p}'
                if p in have:
                    have[p] = v
                    pend_del.pop(key, None)
                    continue
                pa = pend_add.get(key)
                if pa is None:
                    pend_add[key] = [today, 1, v]
                    continue
                pa[1] += 1
                pa[2] = v
                if pa[1] >= STABLE_SNAPS and days_between(pa[0], today) >= STABLE_DAYS:
                    have[p] = v
                    pend_add.pop(key)
                    if code in multi:
                        info = parent.get(code) or v
                        events.append((pa[0], code, 'add', p, info, src))
                        n += 1
        # רציפים שנעלמו
        for code, have in list(cur.items()):
            ps = snap.get(code, {})
            for p in list(have):
                key = f'{code}|{p}'
                if p in ps:
                    continue
                pd = pend_del.get(key)
                if pd is None:
                    pend_del[key] = [today, 1, have[p]]
                    continue
                pd[1] += 1
                if pd[1] >= STABLE_SNAPS and days_between(pd[0], today) >= STABLE_DAYS:
                    v = have.pop(p)
                    pend_del.pop(key)
                    if code in multi:
                        events.append((pd[0], code, 'del', p, parent.get(code) or v, src))
                        n += 1
            if not have:
                cur.pop(code, None)
        # מועמד שנעלם/חזר לפני שהתייצב — לא אירוע
        for key in list(pend_add):
            code, p = key.split('|', 1)
            if p not in snap.get(code, {}):
                pend_add.pop(key)
        for key in list(pend_del):
            code, p = key.split('|', 1)
            if p in snap.get(code, {}):
                pend_del.pop(key)
        done.add(ds)
        print(f'  {today} ({src}): {len(snap)} מק"טים · {n} אירועים · ממתינים {len(pend_add)}+{len(pend_del)}', file=sys.stderr)
    print(f'סה"כ אירועים: {len(events)}', file=sys.stderr)
    if DRY:
        for e in events[:40]:
            print('   ', e, file=sys.stderr)
        return
    shist = jload(f'{OUTDIR}/stops-hist.json', {})
    feeds = {}
    for d, code, kind, p, info, src in events:
        stop_event(shist, feeds, code, d, kind, p, info, src)
    for month, m in feeds.items():
        m['changes'].sort(key=lambda x: x.get('d', ''))
        jdump(m, f'{OUTDIR}/changes/stops-{month}.json')
    if events:
        jdump(shist, f'{OUTDIR}/stops-hist.json')
    st.update({'done': sorted(done), 'cur': cur, 'pend_add': pend_add, 'pend_del': pend_del,
               'multi': sorted(multi),
               'updated': datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')})
    jdump(st, STATE)
    print(f'נכתבו {len(events)} אירועי תחנה', file=sys.stderr)


if __name__ == '__main__':
    main()
