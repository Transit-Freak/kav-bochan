#!/usr/bin/env python3
"""מסלולים מוזרים בצילומי אתרי המידע לנוסעים (2003–2015): קווים שחוזרים לישוב
שכבר יצאו ממנו, מתרחקים מהיעד וחוזרים, או עוברים את אותו סיבוב פעמיים.

הבדיקה היא על צורת המסלול, לא על מרחק: כל תחנה ממוקמת לפי הישוב שבשמה (מרכז
התחנות של הישוב ברישום), כי המיקום של תחנה בודדת מצילום ישן הוא הערכה בלבד.
נכללים רק מסלולים שהזמנים בהם עולים לאורך כל הטבלה — נסיעה אחת, לא שני כיוונים.
"""
import collections, json, math, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from build_magihim_site import norm

ROOT = Path(__file__).resolve().parents[1]


def km(a, b):
    return math.hypot((a[0] - b[0]) * 111, (a[1] - b[1]) * 111 * math.cos(math.radians(a[0])))


def median_point(points):
    return (sorted(p[0] for p in points)[len(points) // 2], sorted(p[1] for p in points)[len(points) // 2])


def places():
    """ישוב -> מרכז, ושם צומת/מחלף -> מיקום (רק כשכל התחנות בשם הזה צמודות)."""
    towns, named = collections.defaultdict(list), collections.defaultdict(list)
    state = json.loads((ROOT / 'line-history/data/stops-state.json').read_text())
    for row in state.values():
        if len(row) > 3 and row[1] and row[3]:
            towns[norm(row[3])].append((row[1], row[2]))
        if len(row) > 2 and row[1]:
            named[norm(row[0])].append((row[1], row[2]))
    try:
        snap = json.loads((ROOT / 'magihim-2012/data/stops-2012.json').read_text())['stops']
        for row in snap.values():
            named[norm(row[0])].append((row[1], row[2]))
    except FileNotFoundError:
        pass
    town_at = {t: median_point(p) for t, p in towns.items()}
    junction_at = {}
    for n, p in named.items():
        c = median_point(p)
        if all(km(c, q) < 3 for q in p):
            junction_at[n] = c
    return town_at, junction_at


def minutes(t):
    h, _, m = t.partition(':')
    return int(h) * 60 + int(m) if h.isdigit() and m.isdigit() else None


def analyse(rows, town_at, junction_at):
    """rows: שורות הטבלה מהמקור [ישוב, תחנה, זמן]. מחזיר את הסיבות למוזרות, או None."""
    times = [minutes(r[2]) for r in rows if len(r) > 2]
    if len(times) < 3 or None in times or any(b < a for a, b in zip(times, times[1:])):
        return None
    # שורה אחרונה באותו זמן כמו הקודמת ובישוב שכבר היה במסלול: שגיאה של אתר המקור
    if len(rows) > 2 and times[-1] == times[-2] and rows[-1][0] in [r[0] for r in rows[:-2]] and rows[-1][0] != rows[-2][0]:
        rows = rows[:-1]
    seq = []
    for r in rows:
        town, station = r[0], r[1]
        at = junction_at.get(norm(station)) if town.startswith('(') else town_at.get(norm(town))
        label = station if town.startswith('(') else town
        if at and (not seq or seq[-1][1] != label):
            seq.append((at, label))
    if len(seq) < 3:
        return None
    dest = seq[-1][0]
    away = sum(max(0, km(seq[i + 1][0], dest) - km(seq[i][0], dest)) for i in range(len(seq) - 1))
    returns = []
    for i, (at, label) in enumerate(seq):
        for j in range(i + 2, len(seq)):
            if seq[j][1] == label and max(km(at, seq[k][0]) for k in range(i + 1, j)) > 3:
                returns.append(label)
                break
    stops = [(r[0], r[1]) for r in rows]
    # אותו רצף של 3 תחנות ומעלה פעמיים: סיבוב כפול
    loops = 0
    for n in range(3, len(stops) // 2 + 1):
        blocks = collections.Counter(tuple(stops[i:i + n]) for i in range(len(stops) - n + 1))
        if any(k > 1 for k in blocks.values()):
            loops = n
    direct = km(seq[0][0], dest)
    score = away / max(direct, 5) + len(returns) + (1 if loops else 0)
    reasons = []
    if returns:
        reasons.append('חוזר ל' + ', '.join(dict.fromkeys(returns)) + ' אחרי שיצא')
    if away > 5:
        reasons.append(f'מתרחק מהיעד בכ-{round(away)} ק"מ בדרך')
    if loops:
        reasons.append(f'עובר את אותן {loops} תחנות פעמיים')
    if not reasons:
        return None
    return {'score': round(score, 2), 'reasons': reasons, 'path': [s[1] for s in seq]}


def find(captures, limit=60, route_of=None):
    town_at, junction_at = places()
    seen, found = set(), []
    for c in captures:
        r = c.get('result') or {}
        if r.get('status') != 'parsed':
            continue
        for p in r['patterns']:
            rows = p.get('sourceRows') or []
            key = (r['line'], r['operator'], json.dumps(rows, ensure_ascii=False))
            if key in seen or not rows:
                continue
            seen.add(key)
            res = analyse(rows, town_at, junction_at)
            if res:
                ts = c['timestamp']
                found.append({'line': r['line'], 'operator': r['operator'], 'date': f'{ts[:4]}-{ts[4:6]}-{ts[6:8]}',
                              'rd': route_of(c, r, r['patterns'].index(p)) if route_of else None,
                              'from': p['stops'][0][1], 'to': p['stops'][-1][1], 'stops': len(p['stops']),
                              'sourceUrl': c['archiveUrl'], **res})
    found.sort(key=lambda f: -f['score'])
    # קו אחד פעם אחת: הצילום המוזר ביותר שלו
    best = {}
    for f in found:
        best.setdefault((f['line'], f['operator']), f)
    return sorted(best.values(), key=lambda f: -f['score'])[:limit]


def main():
    import gzip
    manifest = json.loads(gzip.decompress((ROOT / 'line-history/data/website-archive.json.gz').read_bytes()))
    for f in find(manifest['captures'], 20):
        print(f['score'], f['line'], f['operator'], f['date'], '|', f['from'], '→', f['to'], '|', ' · '.join(f['reasons']))


if __name__ == '__main__':
    main()
