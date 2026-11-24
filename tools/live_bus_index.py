"""live-bus/index.json — אינדקס קטן ל"האוטובוס הבא" (live-bus/app.js), כדי שהדף לא יוריד קבצים גדולים.
רק לשתי החברות שהדף עובד בהן (OPS: דן בדרום ודן באר שבע) — כ-25KB מכווץ.

בלי האינדקס הדף מוריד את fleet.json ו-fleet-official.json של צי הרכבים, את lines.json של הקו בזמן (‎11.7MB)
ואת gov-details-N.json (מושבים של רכבי קבלן), ובונה מהם אינדקס בדפדפן. כאן אותו חישוב, פעם אחת בפריסה,
ורק מה שהדף מציג:
  ops    — מספר חברה → שם (כמו FLEET.ops)
  nocov  — חברות שהמאגר הרשמי לא מכסה בכלל (FLEET.cov === false): שם לא קובעים "קבלן" רק כי הרכב לא במאגר
  ofc    — 1 אם מאגר "ציי רכב אוטובוסים" נטען (אחרת "קבלן" נקבע רק לפי סוג הרכב)
  veh    — מספר רכב → [חברה בצי (או null), דגל, מושבים, גודל, שנת ייצור, דגם, סוג (עירוני/בינעירוני), הנעה];
           גודל, דגם, סוג והנעה — מספר של מחרוזת ב-vs (0 = ריק). אפסים ו-null בסוף השורה נחתכים.
           דגל: 2 = במאגר הרשמי (רכב של החברה); 1 = לא במאגר, וסוג הרכב הוא הסעות/תיור (קבלן גם בלי מאגר);
           0 = לא במאגר. ההחלטה הסופית "קבלן" תלויה בחברה של הקו — נעשית בדף (vinfo), כמו קודם.
  lines  — [[מק"ט-כיוון-חלופה, תיאור רשמי, יעד לפרסום, שלט במוצא], ...] לקווים פעילים של החברות, בסדר של lines.json
  area   — הערים שבהן הקווים מתחילים ומסתיימים (לפחות AREA_MIN פעמים), מהנפוצה — לשורת הפתיחה
  stops  — קודי התחנות במסלול הנוכחי של הקווים (line-history/data/lines/<rd>.json) — להצעות בחיפוש תחנה
  term   — מק"ט-כיוון-חלופה → [רוחב, אורך של תחנת המוצא, רוחב, אורך של התחנה האחרונה] — לנסיעה הריקה בין מסופים
  cities — כל שמות הערים מהתיאורים של כל הקווים (KNOWN_CITIES), בסדר שבו הדף בנה אותם
  rq, ride — נוסעים בשבוע מ-kavpach-ridership.json (המקור של קו פח): מק"ט → [נוסעים בשבוע ברבעון האחרון,
           מספר הרבעון ב-rq, נסיעות בשבוע באותו רבעון (אם יש)]
קובץ מקור שחסר או שבור — החלק שלו לא נכנס, והדף טוען את הקובץ הגדול במקומו.

שימוש: python3 tools/live_bus_index.py [שורש המאגר] > live-bus/index.json
"""
import collections
import json
import os
import re
import sys
import time

# הדף עובד רק בקווים של שתי החברות שמודיעות מראש איזה רכב ייסע (שלמה 23.11): מספר החברה ב-Open Bus → השם
# בקו בזמן. האינדקס מחזיק רק את הרכבים, הקווים והתחנות שלהן
OPS = {31: 'דן בדרום', 32: 'דן באר שבע'}
# עיר שיש בה לפחות כך הרבה קצוות של קווים של החברות — נכנסת לשורת הפתיחה ("באר שבע, אשקלון…")
AREA_MIN = 20

# ---------- צי הרכבים — כמו loadFleet / vinfo / sizeLbl / fixT ב-live-bus/app.js ----------
TNAMES = {'צבורי עירוני': 'אוטובוס עירוני', 'צבורי בין-עירוני': 'אוטובוס בין-עירוני', 'צבורי להסע מיוחד': 'אוטובוס הסעות',
          'זעצ הסעות מיוחדות': 'מיניבוס הסעות', 'זעיר צבורי': 'מיניבוס', 'זעיר צבורי סיור': 'מיניבוס תיור', 'צבורי עיר מפרק': 'אוטובוס מפרקי',
          'צבורי בע קומתים': 'אוטובוס דו-קומתי', 'עירוני קומותיים': 'אוטובוס דו-קומתי עירוני', 'צבורי לסיור': 'אוטובוס תיור', 'פרטי': 'אוטובוס פרטי'}


def norm(p):
    return re.sub(r'\D', '', str(p if p is not None else '')).lstrip('0')


def fix_t(t):
    if not t:
        return ''
    c = re.sub(r'^אוטובוס ', '', re.sub(r'\s+', ' ', re.sub('["״]', '', t)).strip())
    return TNAMES.get(c) or t.replace('צבורי', 'ציבורי', 1)


def kab_type(t):
    return bool(t) and bool(re.search('הסע|מיוחד|סיור|טיולית|פרטי|תיור', t))


def size_lbl(o5, t):
    t = t or ''
    if 'קומ' in t:
        return 'דו-קומתי'
    if o5:
        if o5.startswith('מפרקי'):
            return 'מפרקי (אקורדיון)'
        if o5 in ('מיניבוס', 'מידיבוס'):
            return o5
        if o5 == 'אוטובוס':
            return 'אוטובוס רגיל'
    if re.search('זעיר|מיניבוס', t):
        return 'מיניבוס'
    if 'מפרק' in t:
        return 'מפרקי (אקורדיון)'
    return 'אוטובוס רגיל' if t else ''


def js_num(x):
    """+x של JavaScript, כשמה שחשוב הוא אם התוצאה "אמיתית": מספר, או None במקום 0/NaN."""
    if isinstance(x, bool) or x is None:
        return None
    if isinstance(x, (int, float)):
        return x or None
    try:
        v = float(str(x).strip() or 0)
    except ValueError:
        return None
    return (int(v) if v == int(v) else v) or None


def js_lt(a, b):
    # idx[p].last < rec.last — מחרוזות תאריך; null מול מחרוזת ב-JS תמיד false
    if isinstance(a, str) and isinstance(b, str):
        return a < b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return a < b
    return False


def load(root, rel):
    try:
        with open(os.path.join(root, rel), encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def build_fleet(root):
    f = load(root, 'fleet/data/fleet.json')
    if not f or not isinstance(f.get('operators'), list):
        return None
    o = load(root, 'fleet/data/fleet-official.json')
    ofc = o.get('of') if isinstance(o, dict) and o.get('of') else None
    off = 1 if f.get('v') == 2 else 0
    ops, cov, idx = {}, {}, {}
    for op in f['operators']:
        ops[str(op['ref'])] = op['name']
        in_ofc = 0
        vs = op.get('vehicles') or []
        for v in vs:
            p = norm(v[0])
            if ofc and ofc.get(p):
                in_ofc += 1
            rec = {'op': op['ref'], 'last': v[2], 'year': v[3 + off], 'model': v[4 + off], 'type': v[6 + off]}
            if p not in idx or js_lt(idx[p]['last'], rec['last']):
                idx[p] = rec
        # חברה שהמאגר לא מכסה בכלל — לא קובעים "קבלן" רק כי הרכב לא במאגר (FLEET.cov)
        cov[str(op['ref'])] = not (ofc and not in_ofc and len(vs) >= 10)
    nocov = [r for r, c in cov.items() if not c]
    # רק רכבים שבצי של החברות של הדף (OPS)
    plates = [p for p in idx if idx[p]['op'] in OPS]
    # מושבים לרכב שאין לו מושבים במאגר הרשמי — מהרישוי (gov-details-<ספרה אחרונה>.json), כמו ensureSeats
    gov, shards = {}, {}
    for p in plates:
        oo = ofc.get(p) if ofc else None
        if oo and oo[1]:
            continue
        d = p[-1:] if p else ''
        if d not in shards:
            shards[d] = load(root, f'fleet/data/gov-details-{d}.json') or {}
        g = shards[d].get(p)
        if g:
            gov[p] = js_num(g.get('mispar_moshavim')) or js_num(g.get('mispar_mekomot'))
    veh, strs, sid = {}, [''], {'': 0}

    def si(x):   # מחרוזות שחוזרות (גודל, דגם, סוג, הנעה) — פעם אחת ב-vs, ובשורה רק המספר שלהן
        x = x or ''
        if x not in sid:
            sid[x] = len(strs)
            strs.append(x)
        return sid[x]
    for p in plates:
        r, oo = idx.get(p), (ofc.get(p) if ofc else None)
        t = fix_t(r['type']) if r else ''
        flag = 2 if oo else (1 if r and kab_type(t) else 0)
        seats = (js_num(oo[1]) if oo else None) or gov.get(p)
        o5 = oo[5] if oo and len(oo) > 5 else None
        kind = oo[4] if oo and len(oo) > 4 and oo[4] and oo[4] != 'לא ידוע' else ''
        prop = oo[3] if oo and len(oo) > 3 and oo[3] and oo[3] != 'לא ידוע' else ''
        row = [r['op'] if r else None, flag, seats, si(size_lbl(o5, t)), r['year'] if r else None, si(r['model'] if r else ''), si(kind), si(prop)]
        while row and row[-1] in (None, 0):
            row.pop()
        veh[p] = row
    return {'ops': ops, 'nocov': nocov, 'ofc': 1 if ofc else 0, 'vs': strs, 'veh': veh, 'fleet_updated': f.get('updated')}


# ---------- הקו בזמן — כמו setKnownCities / loadLH ----------
def build_lines(root):
    j = load(root, 'line-history/data/lines.json')
    L = (j or {}).get('lines')
    if not isinstance(L, list):
        return None
    cities = {}
    for l in L:
        for x in re.sub(r'-\d+[#א-ת]?$', '', str(l.get('dest') or '')).split('<->'):
            p = x.split('-')
            if len(p) > 1:
                t = p[-1].strip()
                if t:
                    cities.setdefault(t, None)
    lines, area, stops, term = [], collections.Counter(), {}, {}
    names = set(OPS.values())
    for l in L:
        if l.get('historicalOnly') or l.get('observationOnly') or l.get('lk') == 'removed':
            continue
        if l.get('op') not in names:
            continue
        q = str(l.get('rd')).split('-')
        if len(q) < 3 or not re.fullmatch(r'\d+', q[0]):
            continue
        for x in re.sub(r'-\d+[#א-ת]?$', '', str(l.get('dest') or '')).split('<->'):
            p = x.split('-')
            if len(p) > 1 and p[-1].strip():
                area[p[-1].strip()] += 1
        codes, tm = line_route(root, l['rd'])
        for c in codes:
            stops[c] = None
        if tm:
            term[l['rd']] = tm
        row = [l['rd'], l.get('dest') or '', l.get('hs') or '', l.get('hso') or '']
        while len(row) > 2 and not row[-1]:
            row.pop()
        lines.append(row)
    out = {'lines': lines, 'cities': list(cities), 'area': [c for c, n in area.most_common() if n >= AREA_MIN]}
    if stops:
        out['stops'] = sorted(stops, key=lambda c: int(c) if c.isdigit() else 0)
    if term:
        out['term'] = term
    return out


def line_route(root, rd):
    """המסלול האחרון של הקו — מ-line-history/data/lines/<rd>.json (כמו fsafe בהקו בזמן):
    (קודי התחנות, [רוחב ואורך של תחנת המוצא, רוחב ואורך של התחנה האחרונה] או None)."""
    lf = load(root, 'line-history/data/lines/' + rd.replace('#', 'H').replace('/', '_') + '.json')
    if not isinstance(lf, dict):
        return [], None
    pool = lf.get('pool') or []
    for v in reversed(lf.get('versions') or []):
        st = v.get('stops')
        if isinstance(st, list) and st:
            out, pts = [], []
            for x in st:
                e = pool[x] if isinstance(x, int) and 0 <= x < len(pool) else x
                c = e[0] if isinstance(e, list) and e else (e.get('c') or e.get('code')) if isinstance(e, dict) else None
                if c:
                    out.append(str(c))
                ll = e[2:4] if isinstance(e, list) and len(e) >= 4 else None
                pts.append(ll if ll and all(isinstance(q, (int, float)) for q in ll) else None)
            term = None
            if pts and pts[0] and pts[-1]:
                term = [round(q, 5) for q in pts[0] + pts[-1]]
            return out, term
    return [], None


# ---------- נוסעים — kavpach-ridership.json (tools/kavpach_ridership.py) ----------
def build_ride(root, makats=None):
    d = load(root, 'kavpach-ridership.json')
    if not isinstance(d, dict) or not isinstance(d.get('m'), dict) or not isinstance(d.get('q'), list):
        return None
    ride = {}
    for mk, e in d['m'].items():
        mk = str(mk).lstrip('0')
        if makats is not None and mk not in makats:
            continue
        w = e.get('w') or []
        last = max((i for i, v in enumerate(w) if v is not None), default=None)
        if last is None or last >= len(d['q']):
            continue
        row = [w[last], last]
        if e.get('r'):
            row.append(e['r'])
        ride[mk] = row
    return {'rq': d['q'], 'ride': ride, 'ride_gen': d.get('gen')}


def build(root):
    out = {'v': 1, 'gen': time.strftime('%Y-%m-%dT%H:%MZ', time.gmtime())}
    fl = build_fleet(root)
    if fl:
        out.update(fl)
    ln = build_lines(root)
    makats = None
    if ln:
        out.update(ln)
        makats = {r[0].split('-')[0].lstrip('0') for r in ln['lines']}
    rd = build_ride(root, makats)
    if rd:
        out.update(rd)
    return out


if __name__ == '__main__':
    res = build(sys.argv[1] if len(sys.argv) > 1 else '.')
    if not any(k in res for k in ('veh', 'lines', 'ride')):
        sys.exit('live_bus_index: אין אף מקור נתונים')
    json.dump(res, sys.stdout, ensure_ascii=False, separators=(',', ':'))
