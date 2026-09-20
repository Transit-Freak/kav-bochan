#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""מיזוג תוצאות ה-OCR של גיליונות "חתך לאורך" (docs/fetched/taba/ocr/*.json) לקובץ
המבנים rail/data/taba-structures.json — החלק האוטומטי ("auto"), לצד הרשומות הידניות.

לכל תוכנית (לפי מספר התת"ל בשם הקובץ):
  1. איחוד הסדרות מכל הגיליונות; גיליונות שהקילומטראז' שלהם רציף שייכים לאותה מערכת
     קילומטראז' (בתוכנית יכולות להיות כמה מערכות — "קפיצת קילומטראז'").
  2. עוגנים: תוויות תחנה מה-OCR ("תחנת רכבת X", "רכבת X", "X" ליד "תחנת רכבת קיימת")
     שמתאימות לשם תחנה שלנו (rail/data/stations.json). תחנות "מוצעת"/"עתידית" לא נספרות.
  3. מבנים: חתך (המסילה ≥3 מ' מתחת לקרקע), עמוק (≥6), סוללה (≥3 מעל) — מהפרש
     "רום מתוכנן" פחות "רום קיים" בכל 25 מ'.
מערכת קילומטראז' בלי שני עוגנים לפחות לא נכנסת למפה (אין דרך להצמיד אותה למסילה).
"""
import glob
import json
import os
import re
import sys

OCR_DIR = 'docs/fetched/taba/ocr'
OUT = 'rail/data/taba-structures.json'
STATIONS = 'rail/data/stations.json'


def norm(s):
    s = re.sub(r'["\'״׳]', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def station_index():
    st = json.load(open(STATIONS, encoding='utf-8'))
    idx = {}
    for code, v in st.items():
        name = norm(v[0])
        idx[name] = code
        # גם בלי קידומת העיר ("לוד גני אביב" → "גני אביב")
        parts = name.split(' ')
        if len(parts) > 1:
            idx.setdefault(' '.join(parts[1:]), code)
    return idx


def match_station(label, idx):
    t = norm(label)
    if re.search(r'מוצע|עתיד|מתוכנ', t):
        return None
    t = re.sub(r'^(תחנת )?(רכבת )?', '', t)
    t = re.sub(r' (קיימת|קיים)$', '', t).strip()
    if len(t) < 3:
        return None
    # חץ כיוון ("ללוד", "לחיפה", "לוד ←") אינו תחנה; שם עיר לבדו מתקבל רק כשכתוב "תחנת"
    if t.startswith('ל') and (t[1:] in idx):
        return None
    if not re.search(r'תחנ|רכבת', label) and re.fullmatch(r'(לוד|חיפה|ירושלים|תל אביב|באר שבע|נהריה|אשקלון|נתניה|הרצליה|ראשון לציון)', t):
        return None
    for name, code in idx.items():
        if t == name or (len(t) >= 4 and (t in name or name in t)):
            return code, name
    return None


def main():
    idx = station_index()
    plans = {}
    for f in sorted(glob.glob(os.path.join(OCR_DIR, '*.json'))):
        m = re.search(r'תתל_+(\d+)', os.path.basename(f))
        if not m:
            continue
        d = json.load(open(f, encoding='utf-8'))
        if not d.get('series'):
            continue
        plans.setdefault(m.group(1), []).append(d)
    data = json.load(open(OUT, encoding='utf-8'))
    manual = [p for p in data.get('plans', []) if not p.get('auto')]
    auto = []
    for num, sheets in plans.items():
        # מערכות קילומטראז': מיון לפי תחילת הסדרה, ואיחוד כשיש רציפות (עד 500 מ' פער)
        sheets.sort(key=lambda d: d['series'][0]['ch'])
        systems = []
        for d in sheets:
            lo, hi = d['series'][0]['ch'], d['series'][-1]['ch']
            if systems and lo - systems[-1]['hi'] <= 500:
                systems[-1]['sheets'].append(d)
                systems[-1]['hi'] = max(systems[-1]['hi'], hi)
            else:
                systems.append({'lo': lo, 'hi': hi, 'sheets': [d]})
        for si, sy in enumerate(systems):
            anchors, feats, notes = {}, [], []
            for d in sy['sheets']:
                for l in d.get('labels', []):
                    if not l.get('ch'):
                        continue
                    mt = match_station(l['t'], idx)
                    if not mt:
                        continue
                    # בלי המילה "תחנת"/"רכבת" — רק התאמה מדויקת לשם התחנה (למשל "כפר חב\"ד" ליד "תחנת רכבת קיימת")
                    if not re.search(r'תחנ|רכבת', l['t']) and norm(l['t']) != mt[1]:
                        continue
                    if mt[0] not in anchors:
                        anchors[mt[0]] = {'stop': mt[0], 'name': mt[1], 'chainage': l['ch'], 'label': l['t']}
                for ft in d.get('features', []):
                    feats.append(dict(ft, sheet=d['pdf']))
                for l in d.get('labels', []):
                    if l.get('ch') and re.search(r'מנהר|מינהר', l['t']):
                        notes.append({'chainage': l['ch'], 'label': l['t'], 'sheet': d['pdf']})
            entry = {
                'auto': True, 'plan': f'תת"ל {num}', 'system': si + 1,
                'range': [sy['lo'], sy['hi']],
                'sheets': [d['pdf'] for d in sy['sheets']],
                'anchors': sorted(anchors.values(), key=lambda a: a['chainage']),
                'features': [f for f in feats if f['kind'] in ('cutting', 'deep')],
                'embankments': [f for f in feats if f['kind'] == 'embankment'],
                'tunnel_labels': notes,
                'usable': len(anchors) >= 2,
            }
            auto.append(entry)
            print(f'תת"ל {num} מערכת {si + 1}: {sy["lo"]}–{sy["hi"]} · גיליונות {len(sy["sheets"])} · עוגנים {[(a["name"], a["chainage"]) for a in entry["anchors"]]} · חתכים {len(entry["features"])} · סוללות {len(entry["embankments"])} · מנהרות בתוויות {len(notes)} · שמיש: {entry["usable"]}')
    data['plans'] = manual + auto
    json.dump(data, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
