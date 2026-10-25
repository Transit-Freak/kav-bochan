# -*- coding: utf-8 -*-
"""הקו המודיע — בדיקת רגרסיה על ההודעות האמיתיות (25.10.2026).

כל תיקון בקריאת הנוסח נבדק מול כל ההודעות, ולא רק מול ההודעה שבגללה תיקנו. בלי רשת ובלי OSM.

  python3 tools/test_alerts_regression.py                    # בדיקה
  python3 tools/test_alerts_regression.py --update-baseline  # אישור השינויים (באותו PR של התיקון)

שלושה חלקים:
  א. תמונת פירוק: לכל הודעה ב-testdata/alerts-corpus.json (עותק קפוא של alerts.json, כדי שרענון
     הלילה לא ישנה את הבדיקה) — parse, template, הסיבה, מספרי התחנות שבנוסח, מפתח הקיבוץ והאיחוד.
     מושווה ל-alerts-parse-baseline.json; שינוי בהודעה שלא רשומה ב-alerts-expected-changes.json — נכשל.
  ב. כללים על alerts/data/rc/*.json (מה שהריצה האחרונה חישבה) ועל הפירוק. מה שנכשל היום רשום
     ב-alerts-known-failures.json; נכשל רק על הפרה חדשה. --update-baseline רק מקטין את הרשימה.
  ג. דוגמאות מהבדיקה (real1): הנוסחים שנקראים היום לא נכון, מסומנים expectedFailure. מי שמתקן —
     מוריד את הסימון (אחרת "unexpected success" מכשיל את הבדיקה).
"""
import copy
import difflib
import glob
import json
import re
import sys
import time
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parent
sys.path.insert(0, str(TOOLS))
import alerts_route as AR  # noqa: E402
import alerts_fetch as AF  # noqa: E402

DATA = ROOT / 'alerts' / 'data'
TD = TOOLS / 'testdata'
CORPUS = TD / 'alerts-corpus.json'
BASELINE = TD / 'alerts-parse-baseline.json'
EXPECTED = TD / 'alerts-expected-changes.json'
KNOWN = TD / 'alerts-known-failures.json'
UPDATE = False


def _read(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def _load(p, default):
    try:
        return _read(p)
    except FileNotFoundError:
        return default


def _dump(p, obj):
    TD.mkdir(exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write('\n')


# ------------------------------------------------------------------ הקלט הקפוא
_KEEP = ('id', 'h', 'd', 's', 'e', 'per', 'lines', 'rm', 'add', 'map', 'kind', 'ag', 'dep', 'uc', 'nat')


def refresh_corpus():
    """מוסיף לעותק הקפוא הודעות חדשות מ-alerts.json (הודעה שכבר בעותק נשארת כמו שהיא) ואת המיקום של
    התחנות המבוטלות שלהן (לקיבוץ) — מ-GTFS ב-S3, ואם אין רשת — מקובצי rc."""
    corpus = _load(CORPUS, {'alerts': [], 'pos': {}})
    have = {a['id'] for a in corpus['alerts']}
    live = _load(DATA / 'alerts.json', {}).get('alerts', [])
    new = [{k: a.get(k) for k in _KEEP} for a in live if a['id'] not in have]
    corpus['alerts'] += new
    codes = {str(c) for a in corpus['alerts'] for c, _ in a['rm']} - set(corpus['pos'])
    if codes:
        try:
            stops = AF.stop_names()
        except BaseException:   # noqa: B036 — BG.http עושה SystemExit
            stops = {}
        for sid, (code, _) in stops.items():
            if code in codes and sid in AF.STOP_POS:
                corpus['pos'][code] = [round(x, 6) for x in AF.STOP_POS[sid]]
        for f in glob.glob(str(DATA / 'rc' / '*.json')):
            for v in _read(f)['stops'].values():
                if str(v[2]) in codes and str(v[2]) not in corpus['pos']:
                    corpus['pos'][str(v[2])] = v[:2]
    corpus['alerts'].sort(key=lambda a: a['id'])
    _dump(CORPUS, corpus)
    return corpus, len(new)


# ------------------------------------------------------------------ א. תמונת פירוק
def _para(p):
    return {'lines': sorted(p['lines']), 'start': list(p['start']) if p['start'] else None, 'steps': p['steps'],
            'dir': list(p['dir']) if p.get('dir') else None, 'rm': sorted(p.get('rm', ())), 'add': sorted(p.get('add', ())),
            't': p['text'][:70]}


def snapshot(corpus):
    alerts = copy.deepcopy(corpus['alerts'])
    out = {}
    for a in alerts:
        paras = AR.parse(a['d'])
        out[a['id']] = {'paras': [_para(p) for p in paras], 'tpl': AR.template(a['d'], paras),
                        'cause': AF.cause_of(a['h'], a['d']), 'nstops': AF.text_new_stops(a['d']),
                        'city': AF._city(a['h']), 'words': sorted(AF._place_words(a['h']))}
    # קיבוץ ואיחוד — על העותק הקפוא, עם מיקומי התחנות שנשמרו בו (מק"ט במקום stop_id)
    AF.STOP_POS.clear()
    AF.STOP_POS.update({c: tuple(p) for c, p in corpus['pos'].items()})
    stops = {c: (c, '') for c in corpus['pos']}
    AF.group_alerts(alerts, stops)
    for a in alerts:
        out[a['id']]['grp'] = a.get('grp')
    _, into = AF.merge_dups(copy.deepcopy(alerts))
    for a in alerts:
        out[a['id']]['into'] = into.get(a['id'])
    return out


def _short(v):
    s = json.dumps(v, ensure_ascii=False)
    return s if len(s) < 160 else s[:157] + '…'


def diff_alert(old, new):
    """מה השתנה בהודעה אחת: שדה אחרי שדה, ופסקה אחרי פסקה."""
    out = []
    for k in sorted(set(old) | set(new)):
        if k != 'paras' and old.get(k) != new.get(k):
            out.append(f'  {k}: {_short(old.get(k))} → {_short(new.get(k))}')
    po, pn = old.get('paras', []), new.get('paras', [])
    if po != pn:
        sm = difflib.SequenceMatcher(a=[json.dumps(x, sort_keys=True) for x in po], b=[json.dumps(x, sort_keys=True) for x in pn])
        for op, i1, i2, j1, j2 in sm.get_opcodes():
            if op == 'equal':
                continue
            if op == 'replace' and i2 - i1 == j2 - j1:
                for i, j in zip(range(i1, i2), range(j1, j2)):
                    ch = [f'{f}: {_short(po[i].get(f))} → {_short(pn[j].get(f))}' for f in po[i] if po[i].get(f) != pn[j].get(f)]
                    out.append(f'  פסקה {i}: ' + '; '.join(ch))
                continue
            for i in range(i1, i2):
                out.append(f'  פסקה {i} ירדה: {_short(po[i])}')
            for j in range(j1, j2):
                out.append(f'  פסקה {j} נוספה: {_short(pn[j])}')
    return out


# ------------------------------------------------------------------ ב. כללים
def nearest_idx(shape, p):
    """כמו nearestIdx ב-alerts/app.js."""
    best, bd = 0, 1e18
    for i, q in enumerate(shape):
        dx, dy = q[0] - p[0], (q[1] - p[1]) * 0.85
        d = dx * dx + dy * dy
        if d < bd:
            bd, best = d, i
    return best


def closed_range(r, stops):
    """הקטע הסגור שהאתר מסמן (alerts/app.js, closedRange) כשיש est. אם הקובץ שומר אינדקסים מוכנים
    (est.k / est.c), לפיהם; אחרת — זוג נקודות קרובות (עד 40 מ' יותר מהקרובה) שבו היציאה לפני החזרה,
    שמכסה הכי הרבה תחנות מבוטלות, ואחר כך הכי קרוב והכי קצר."""
    shape, est = r.get('shape') or [], r['est']['path']
    k = r['est'].get('k') or r['est'].get('c')
    if isinstance(k, list) and len(k) == 2 and k[0] < k[1] < len(shape):
        return k[0], k[1]

    def m(q, p):
        return ((q[0] - p[0]) ** 2 + ((q[1] - p[1]) * 0.85) ** 2) ** 0.5 * 111320

    def cand(p):
        d = [m(q, p) for q in shape]
        lo = min(d)
        return [(i, x) for i, x in enumerate(d) if x <= lo + 40 and (i == 0 or x <= d[i - 1]) and (i == len(d) - 1 or x <= d[i + 1])]
    dels = [stops[s][:2] for s in r.get('del') or [] if s in stops]
    best = None
    for a, da in cand(est[0]):
        for b, db in cand(est[-1]):
            if b <= a:
                continue
            n = sum(1 for q in dels if any(m(shape[j], q) < 40 for j in range(a, b + 1)))
            sc = (-n, da + db, b - a)
            if best is None or sc < best[2]:
                best = (a, b, sc)
    if best:
        return best[0], best[1]
    c0 = nearest_idx(shape, est[0])
    return c0, max(c0, nearest_idx(shape, est[-1]))


def _len(pts):
    return sum(AR.meters(a, b) for a, b in zip(pts, pts[1:]))


def _through_del(path, pos, edge=60.0, tol=15.0):
    """האם המסלול עובר פחות מ-tol מ' מהתחנה, לא ב-edge המטרים הראשונים או האחרונים."""
    total = _len(path)
    cum = 0.0
    for a, b in zip(path, path[1:]):
        d = AR.meters(a, b)
        if cum + d > edge and cum < total - edge and AR.seg_dist(pos, a, b) < tol:
            # הקטע חוצה את גבול 60 המטרים — בודקים רק את החלק שבפנים
            n = max(1, int(d / 3))
            for i in range(n + 1):
                c = cum + d * i / n
                q = (a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n)
                if edge < c < total - edge and AR.meters(pos, q) < tol:
                    return True
        cum += d
    return False


VAV = re.compile(r'(?:^|\s)ו$')


def invariants(snap):
    """{כלל: {מפתח: פירוט}} — כל ההפרות של היום."""
    bad = {k: {} for k in ('step-vav', 'est-street-vav', 'est-short', 'est-through-del', 'closed-empty',
                           'closed-long', 'closed-misses-del')}
    for aid, s in snap.items():
        for i, p in enumerate(s['paras']):
            v = [x for x in p['steps'] if VAV.search(x)]
            if v:
                bad['step-vav'][f'{aid}#{i}'] = v
    for f in sorted(glob.glob(str(DATA / 'rc' / '*.json'))):
        rc = _read(f)
        aid, stops, seen = rc['id'], rc.get('stops') or {}, {}
        for r in rc['routes']:
            key = f"{aid}/{r.get('rd')}"
            seen[key] = seen.get(key, 0) + 1
            if seen[key] > 1:
                key += f'#{seen[key]}'
            est = r.get('est')
            if not est or not est.get('path'):
                continue
            path = [tuple(p) for p in est['path']]
            v = [x for x in est.get('streets') or [] if VAV.search(x)]
            if v:
                bad['est-street-vav'][key] = v
            ln = _len(path)
            if ln < 20:
                bad['est-short'][key] = round(ln, 1)
            dels = [s for s in r.get('del') or [] if s in stops]
            hit = [s for s in dels if _through_del(path, tuple(stops[s][:2]))]
            if hit:
                bad['est-through-del'][key] = hit
            shape = r.get('shape') or []
            if len(shape) < 2:
                continue
            c0, c1 = closed_range(r, stops)
            closed = _len(shape[c0:c1 + 1])
            if c1 <= c0:
                bad['closed-empty'][key] = [c0, c1]
            # קטע סגור ארוך פי 4 מהעקיפה ויותר מ-3 ק"מ — כמעט תמיד מעבר לא נכון בקו שעובר פעמיים
            elif closed > max(3000, 4 * ln):
                bad['closed-long'][key] = [round(closed), round(ln)]
            # תחנה מבוטלת על השרטוט (עד 40 מ') שמחוץ לקטע המקווקו
            out = []
            for sid in dels:
                q = tuple(stops[sid][:2])
                j = nearest_idx(shape, q)
                if AR.meters(q, tuple(shape[j])) < 40 and not c0 <= j <= c1:
                    # בקו שעובר פעמיים — אולי מעבר אחר בתוך הקטע קרוב גם הוא
                    if not any(AR.meters(q, tuple(x)) < 40 for x in shape[c0:c1 + 1]):
                        out.append(sid)
            if out:
                bad['closed-misses-del'][key] = out
    return bad


# ------------------------------------------------------------------ הבדיקות
_STATE = {}


def _ctx():
    if not _STATE:
        t0 = time.time()
        corpus = _load(CORPUS, None)
        if corpus is None or UPDATE:
            corpus, n = refresh_corpus()
            _STATE['added'] = n
        _STATE['corpus'] = corpus
        _STATE['snap'] = snapshot(corpus)
        _STATE['t_snap'] = time.time() - t0
        t0 = time.time()
        _STATE['bad'] = invariants(_STATE['snap'])
        _STATE['t_inv'] = time.time() - t0
    return _STATE


class ParseSnapshot(unittest.TestCase):
    def test_parse_matches_baseline(self):
        ctx = _ctx()
        snap = ctx['snap']
        live = {a['id'] for a in _load(DATA / 'alerts.json', {}).get('alerts', [])}
        missing = live - set(snap)
        if missing and not UPDATE:
            print(f'\n[מידע] {len(missing)} הודעות חדשות ב-alerts.json שלא בעותק הקפוא (--update-baseline מוסיף)')
        base = _load(BASELINE, None)
        if base is None or UPDATE:
            if base is not None:
                for aid in sorted(snap):
                    if aid in base and base[aid] != snap[aid]:
                        print(f'\n[מאושר] {aid}:\n' + '\n'.join(diff_alert(base[aid], snap[aid])))
            _dump(BASELINE, snap)
            print(f'\nנשמרה תמונת פירוק: {len(snap)} הודעות, {sum(len(s["paras"]) for s in snap.values())} פסקאות')
            return
        expected = _load(EXPECTED, {})
        report, fails = [], []
        for aid in sorted(set(base) | set(snap)):
            if aid not in base or aid not in snap:
                report.append(f'{aid}: {"חדשה" if aid in snap else "ירדה מהעותק"}')
                continue
            if base[aid] == snap[aid]:
                continue
            d = diff_alert(base[aid], snap[aid])
            tag = f'צפוי — {expected[aid]}' if aid in expected else 'לא צפוי'
            report.append(f'{aid} [{tag}] {self._h(aid)}\n' + '\n'.join(d))
            if aid not in expected:
                fails.append(aid)
        stale = [a for a in expected if a in base and a in snap and base[a] == snap[a]]
        if stale:
            report.append(f'[מידע] רשומות ב-expected-changes שלא השתנו: {", ".join(stale)}')
        if report:
            print('\n' + '\n'.join(report))
        self.assertEqual(fails, [], f'שינוי בפירוק של {len(fails)} הודעות שלא ב-alerts-expected-changes.json')

    def _h(self, aid):
        a = next((x for x in _ctx()['corpus']['alerts'] if x['id'] == aid), None)
        return re.sub(r'\s+', ' ', a['h'])[:60] if a else ''


class Invariants(unittest.TestCase):
    def test_no_new_violations(self):
        ctx = _ctx()
        bad = ctx['bad']
        known = _load(KNOWN, None)
        first = known is None
        known = known or {}
        lines, new_all = [], {}
        live = set()
        for f in glob.glob(str(DATA / 'rc' / '*.json')):
            live.add(Path(f).stem)
        for rule in sorted(bad):
            cur, kn = bad[rule], set(known.get(rule, []))
            new = sorted(set(cur) - kn)
            fixed = sorted(k for k in kn - set(cur) if re.split(r'[/#]', k)[0] in live or rule == 'step-vav')
            gone = sorted(k for k in kn - set(cur) if k not in fixed)
            lines.append(f'  {rule}: {len(cur)} (ידועות {len(kn & set(cur))}, חדשות {len(new)}, תוקנו {len(fixed)}'
                         + (f', ירדו מהנתונים {len(gone)}' if gone else '') + ')')
            for k in new:
                lines.append(f'    חדשה: {k} {_short(cur[k])}')
            for k in fixed:
                lines.append(f'    תוקנה: {k}')
            if new:
                new_all[rule] = new
        print('\nכללים:\n' + '\n'.join(lines))
        if first or UPDATE:
            # בפעם הראשונה — כל מה שנכשל היום; אחר כך רק מקטינים (הפרה חדשה מוסיפים ביד, עם סיבה)
            out = {r: sorted(bad[r]) if first else sorted(set(known.get(r, [])) & set(bad[r])) for r in bad}
            _dump(KNOWN, out)
            return
        self.assertEqual(new_all, {}, 'הפרות חדשות (לא ב-alerts-known-failures.json)')


# ------------------------------------------------------------------ ג. דוגמאות מהבדיקה
def _steps_of(desc):
    return [x for p in AR.parse(desc) for x in p['steps']]


class Fixtures(unittest.TestCase):
    """הנוסחים מההודעות האמיתיות. expectedFailure = כך זה היום; מי שמתקן — מוריד את הסימון."""

    def test_line_dash_direction(self):
        # 14585304726: "קו 4-3" הוא קו 4 כיוון 3, לא קווים 4 ו-3
        self.assertEqual(AR.line_numbers('המסלול החלופי לקו 4-3 (סיבובי) לכיוון קניון מרגליות:'), {'4'})

    def test_no_straight_in_parens(self):
        # 14585240416: "(אין המשך ישר לולנברג)" — הוראה שלילית, ולנברג לא רחוב בדרך
        d = ('קו 634 כיוון 1:\nמצומת ראול ולנברג/משמר הירדן פונה שמאלה למשמר הירדן (אין המשך ישר לולנברג), '
             'ימינה דבורה הנביאה,\nהמשך ישר עד מסוף עתידים וסיום הקו.')
        st = _steps_of(d)
        self.assertTrue(st)
        self.assertFalse([x for x in st if 'ולנברג' in x], st)

    def test_vav_before_return(self):
        # 14579280966: "ימינה לשמעון פרס וחזרה למסלול המקורי" — בלי "ו" בסוף הרחוב
        d = ('קו 15\nלכיוון קריית אונו\nייסע במסלול המקורי עד העצמאות/461, המשך ישר לכביש 4622, שמאלה ללוחמי האש, '
             'ימינה לשמעון פרס וחזרה למסלול המקורי')
        st = _steps_of(d)
        self.assertTrue(st)
        self.assertFalse([x for x in st if VAV.search(x)], st)
        self.assertEqual(AR.norm(st[-1]), 'לשמעון פרס')

    def test_continue_existing_route_ends(self):
        # 14587712223 קו 100: "ימשיך על פי המסלול הקיים" — סוף העקיפה הראשונה, לא עוד רחובות בה
        d = ('קו 100 (קו סיבובי מחנה וסע לצומת צריפין וחזרה): ייסע על פי המסלול הקיים עד צומת הרחובות ירושלים/ יגאל אלון, '
             'יפנה ימינה לרחוב יגאל אלון, שמאלה לרחוב מורדי הגטאות, שמאלה לשדרות יעקב, ימינה לרחוב ירושלים, ימשיך על פי '
             'המסלול הקיים לצומת מחנה צריפין וחזרה – כיכר ירושלים/ שדרות יעקב, יפנה שמאלה לשדרות יעקב, ימינה לרחוב מורדי '
             'הגטאות, ימינה לרחוב יגאל אלון, שמאלה לרחוב ירושלים ויתחבר להמשך המסלול הקיים.')
        ps = AR.parse(d)
        self.assertTrue(ps)
        self.assertLessEqual(len(ps[0]['steps']), 4, ps[0]['steps'])

    def test_original_route_without_junction(self):
        # 14585014358: "ייסעו במסלול המקורי עד כביש המנהרות שמאלה…" — ההוראה לא נמחקת
        d = ('קווי קרית ארבע 380, 381, 382, 383, 384\n\nבכיוון מגוש עציון/קרית ארבע לירושלים \n'
             'ייסעו במסלול המקורי עד כביש המנהרות שמאלה לכביש 3755 , ימינה יצחק מודע שמאלה לשדרות מנחם בגין '
             'וחזרה למסלול המקורי.')
        self.assertIn('מנחם בגין', [AR.norm(x) for x in _steps_of(d)])

    def test_lane_and_tunnel_not_street(self):
        # 14587753135, 14589812731, 14589830415: נתיב / שיקוע / מנהרה — לא שם רחוב
        lane = re.compile(r'נתיב|היצמד|ייצמד|שיקוע|מנהר|^יעבור|^יעברו')
        for d in ('קו 43 לכיוון רמת גן:\n\nייסע במסלולו המקורי עד רחוב אלוף שדה פינת יצחק רבין, ימשיך לרחוב '
                  'אלוף שדה, ייצמד לנתיבים השמאליים, ייכנס לשיקוע הירדן וימשיך במסלולו המקורי',
                  'קווים 64, לכיוון פתח תקווה\nייסע במסלול המקורי עד אלוף שדה/מנהרת אלוף שדה, יעברו דרך המנהרה '
                  'בשיקוע והמשך מסלולים מקוריים.',
                  'קו: 62 \nמכיוון רידינג (דרך שיקוע רבין):\nעד לפני צומת רבין פינת הרא"ה ללא שינוי, היצמדות לנתיבים '
                  'השמאליים (לכיוון השיקוע ברח\' רבין), כניסה לשיקוע, המשך אלוף שדה והמשך במסלול הרגיל.'):
            st = _steps_of(d)
            self.assertFalse([x for x in st if lane.search(x)], st)

    def test_lane_words_inside_street_names(self):
        # כביש המנהרות, נתיבי איילון, נתיב הל"ה — רחובות; פנייה אחרי סוף העקיפה לא מוחקת אותה
        d = ('קו 5 לכיוון X:\nנוסעים במסלול הרגיל עד צומת הרצל/בלפור, ימינה לכביש המנהרות, שמאלה לנתיבי איילון, '
             'ימינה לרח\' נתיב הל"ה, שמאלה לרח\' נתיבות שלום וממשיכים במסלול הרגיל.')
        self.assertEqual(len(_steps_of(d)), 4, _steps_of(d))
        for d in ('קו 5 לכיוון X:\nנוסעים במסלול הרגיל עד צומת הרצל/בלפור, ישר לרח\' ויצמן וממשיכים במסלול הרגיל '
                  '(לא פונים ימינה לסוקולוב).',
                  'קו 5 לכיוון X:\nנוסעים במסלול הרגיל עד צומת הרצל/בלפור, ישר לרח\' ויצמן ויתחבר למסלולו המקורי, '
                  'בחזור ימינה לסוקולוב'):
            self.assertEqual(_steps_of(d), ['ויצמן'])

    def test_dnum_per_line(self):
        # "לקוים 4-2 …, 65 …" — הכיוון רק לקו 4; קיצור "1-2" — לא לקו 1 כיוון 3 (הוד השרון)
        d = ('המסלול החלופי לקוים 4-2 לכיוון קניון, 65 לכיוון כפר סבא:\nנוסעים במסלול הרגיל עד לכיכר מבוא קדם/ששת '
             'הימים, פונים שמאלה לרח\' ששת הימים וממשיכים במסלול הרגיל.')
        self.assertEqual(AR.parse(d)[0]['dnum'], {'4': '2'})
        d = ('המסלול החלופי לקוים 1-2 לכיוון נווה נאמן, \n65 לכיוון כפר סבא:\nמתחילים את הנסיעה ברח\' ששת הימים בתחנה \n'
             'ששת הימים/קיבוץ גלויות')
        self.assertEqual(AR.short_lines(d), {'1-2', '65'})

    def test_cause_knes_prefix(self):
        self.assertEqual(AF.cause_of('x', 'בשל הגעת משתתפים לכנס בבנייני האומה'), 'event')

    def test_consecutive_headers(self):
        # 14587894314: ארבע כותרות "קו N לכיוון…:" ברצף, ואז הוראה אחת לכולן
        d = ('קו 63 לכיוון רכבת ספיר:\nקו 64 לכיוון רכבת ספיר:\nקו 66 לכיוון רכבת ספיר:\nקו 68 לכיוון רכבת ספיר:\n'
             'מסלול חלופי: משדרות בנימין ימינה לרח\' יגאל אלון, שמאלה לשדרות בן גוריון, שמאלה לרח\' שלום עליכם '
             'ובחזרה למסלול המקורי.')
        ps = AR.parse(d)
        self.assertEqual(len(ps), 1)
        self.assertEqual(ps[0]['lines'], {'63', '64', '66', '68'})

    def test_all_other_lines_header(self):
        # 14585281235: "המסלול החלופי לכל שאר הקוים:" — הפסקה לכל הקווים, לא לקו 8 שלפניה
        d = ('המסלול החלופי לקו 8 לכיוון השכ\' הירוקה:\nנוסעים במסלול הרגיל עד לכיכר תל חי/בן גוריון, לא \n'
             'ממשיכים ישר ברח\' תל חי אלא פונים שמאלה לרח\' בן גוריון, \nימינה לרח\' רוטשילד, שמאלה לרח\' וייצמן \n'
             'וממשיכים במסלול הרגיל.\nתחנות מבוטלות:\n38936 תל חי/הבנים\n37034 וייצמן/רוטשילד\n\n'
             'המסלול החלופי לכל שאר הקוים:\nנוסעים במסלול הרגיל עד לצומת וייצמן/תל חי, לא \n'
             'ממשיכים ישר ברח\' וייצמן אלא פונים שמאלה לרח\' תל חי, \nימינה לרח\' בן גוריון, ימינה לרח\' רוטשילד, '
             'שמאלה לרח\' וייצמן וממשיכים במסלול הרגיל.\nתחנה מבוטלת:\n37034 וייצמן/רוטשילד\n')
        ps = AR.parse(d)
        self.assertEqual(len(ps), 2)
        self.assertEqual(ps[0]['lines'], {'8'})
        self.assertEqual(ps[1]['lines'], set())

    def test_cause_knes_word_boundary(self):
        # 14584898387: "ולא יכנסו למתחם האוניברסיטה" — לא כנס (אירוע)
        self.assertNotEqual(AF.cause_of('חיפה - ביטול כניסת קווים 37א, 54 דרך השער המזרחי של האוניברסיטה.',
                                        'קווים 37א, 54 מחיפה לדאלית אל כרמל: ימשיכו בנסיעה בשדרות אבא חושי ולא יכנסו '
                                        'למתחם האוניברסיטה.'), 'event')

    def test_date_word_not_place(self):
        # 14585089741 / 14587546470: "תאריך" בכותרת לא מקום משותף
        self.assertNotIn('תאריך', AF._place_words('תל-אביב – עבודות לילה ברח\' מקס ברוד - תאריך - 25.10.2026'))

    def test_short_route(self):
        # 14575709262 / 14584825973: קיצור מסלול — לא עקיפה ולא רחוב
        d = ('קו 37 מבת גלים לאוניברסיטת חיפה: ייסע על פי המסלול הקיים עד תחנת שדרות אבא חושי/ טהון (תחנה 41174) '
             'ויסיים את מסלול נסיעתו זמנית בתחנה זו.')
        self.assertEqual(AR.parse(d), [])
        self.assertEqual(AR.short_lines(d), {'37'})
        self.assertEqual(AR.template(d), 'short')

    def test_makat_line_dir(self):
        # 14584669962 (טכניון): "קו 297-1-0 … מסיים בתחנה זו" — קו-כיוון-חלופה, ו"מסיים" ביחיד;
        # 796/774 לא נקראים כקווים 1 ו-0
        d = ('קו 297-1-0\nבדומה לחלופת שבת   297-1-1\nעד תחנה: 40297 מל"ל/יערי, ללא שינוי.\nמסיים בתחנה זו.\n'
             'קו 297-2-0 \nבדומה לחלופת שבת  297-2-1 מתחיל בתחנה: 42335 מל"ל/קומי. המשך ללא שינוי.\n'
             'קווים: 796-1-0  774-1-0\nעד צומת דרך בר יהודה/פרץ, ללא שינוי. ישר בדרך בר יהודה.')
        self.assertEqual(AR.short_lines(d), {'297-1', '297-2'})
        ps = AR.parse(d)
        self.assertEqual(ps[-1]['lines'], {'796', '774'})
        self.assertEqual(ps[-1]['dnum'], {'796': '1', '774': '1'})

    def test_text_lines(self):
        # 14589665789: "קווים מושפעים" — המספרים נכנסים לרשימת הקווים; תאריך ושעה לא
        d = 'ב-25-26/10 בשעה 22:00 יחסם הכביש.\nקווים מושפעים :- \n691,695,681,690,680'
        self.assertEqual(AF.text_lines(d), {'691', '695', '681', '690', '680'})

    # מה שאסור שיישבר בתיקונים (עובד היום)
    def test_guard_ok_paragraphs(self):
        # 14585281235: קו 8 נשאר עם הרחובות שלו; 14587781763: "ללא שינוי" לא מתחבר לכותרת שאחריו
        d = ('המסלול החלופי לקו 8 לכיוון השכ\' הירוקה:\nנוסעים במסלול הרגיל עד לכיכר תל חי/בן גוריון, לא \n'
             'ממשיכים ישר ברח\' תל חי אלא פונים שמאלה לרח\' בן גוריון, \nימינה לרח\' רוטשילד, שמאלה לרח\' וייצמן \n'
             'וממשיכים במסלול הרגיל.')
        self.assertEqual(AR.parse(d)[0]['steps'], ['בן גוריון', 'רוטשילד', 'וייצמן'])
        d = ('קו 43 לכיוון רמת גן:\n\nללא שינוי במסלול הנסיעה \n\nקו 969 לכיוון טבריה:\n\nייסע במסלולו המקורי עד '
             'רחוב אלוף שדה (לאחר היציאה ממסוף אלוף שדה) ייצמד לשמאל וייכנס למנהרת אלוף שדה, יפנה ימינה לרבין, '
             'ימינה הרא"ה, ימינה משה דיין, ישר לאריה בן אליעזר וימשיך במסלולו המקורי')
        for p in AR.parse(d):
            self.assertNotIn('43', p['lines'])


def _summary():
    s = _STATE
    if not s:
        return
    snap = s['snap']
    print(f"\nכיסוי: {len(snap)} הודעות, {sum(len(x['paras']) for x in snap.values())} פסקאות, "
          f"{len(glob.glob(str(DATA / 'rc' / '*.json')))} קובצי rc. "
          f"פירוק {s['t_snap']:.1f} ש', כללים {s['t_inv']:.1f} ש'.")


if __name__ == '__main__':
    if '--update-baseline' in sys.argv:
        UPDATE = True
        sys.argv.remove('--update-baseline')
    t0 = time.time()
    prog = unittest.main(exit=False, verbosity=1)
    _summary()
    print(f'סה"כ {time.time() - t0:.1f} ש\'')
    sys.exit(0 if prog.result.wasSuccessful() else 1)
