#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ביקורת על כל צילומי העובדות: מה סומן בכל צילום (snips.json → marks) מול הערך שהצילום אמור להראות.

שלמה (16.09), אחרי שבעמוד 80 בחיפה סומנו "2003" ו-"2017" במקום "20%": "ובדקת שאין מקרים כאלה במסכים אחרים?"
בלי לפתוח תמונות: snip_fields.py שומר לכל צילום את המילים שמתחת לכל סימון, וכאן בודקים:
  - ערך מספרי: כל סימון חייב להכיל את המספר כמילה שלמה (לא "2003" בשביל "20"), ומספר הסימונים ≤ 6
  - ערך טקסטואלי עם "מספר יחידה": כל מספר מהערך צריך להופיע באחד הסימונים
  - ערך טקסטואלי בלי מספרים: הסימון צריך להכיל מילה מהערך (לא רק מילה מכותרת הסעיף)
  - שדה מאומת בלי צילום בכלל
שימוש: python3 tenders/scripts/audit_snips.py   (מדפיס דו"ח; קוד יציאה 1 אם יש חריגות)
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
from snip_fields import STOP, UNIT, num_core  # noqa: E402


def numbers_in(marks):
    out = []
    for m in marks:
        for w in m.split():
            c = num_core(w)
            if c and c.isdigit():
                out.append(c)
    return out


def check(key, f, s):
    """רשימת בעיות בצילום אחד (ריקה כשהכול תקין)."""
    v = f.get('value')
    marks = s.get('marks')
    if marks is None:
        return ['צילום מגרסה ישנה, בלי רשימת סימונים']
    if not marks:
        return ['אין סימון בכלל']
    nums = numbers_in(marks)
    probs = []
    if s.get('how') == 'heading':
        n = str((f.get('sec') or {}).get('n'))
        if not any(n in m for m in marks):
            probs.append(f'סומנה כותרת שאינה סעיף {n}: {marks[:2]}')
        return probs
    if key == 'penalties.amount':
        if not any(re.search(r'פיצוי|קנס', m) for m in marks) or len(marks) > 2:
            probs.append(f'טבלת הקנסות: סומן {marks[:3]} ({len(marks)} סימונים) ולא כותרת הפיצויים')
        return probs
    if s.get('how') == 'sentence':
        # הערך לא נמצא בעמוד — סומן משפט המפתח של הסעיף; בודקים שהסימון באמת על המשפט הזה
        brief = (f.get('sec') or {}).get('brief') or ''
        bw = {w for w in re.findall(r'[א-ת]{4,}', brief) if w not in STOP}
        hit = sum(1 for w in bw if any(w in m for m in marks))
        if hit < min(3, len(bw)):
            probs.append(f'סומן משפט שלא דומה למשפט המפתח ({hit} מילים משותפות): {marks[:2]}')
        return probs
    if isinstance(v, str) and re.match(r'^\d{4}-\d{2}-\d{2}$', v):
        y, mo, d = v.split('-')
        if not any(y in m or y[2:] in m for m in marks) or not any(str(int(d)) in numbers_in([m]) or v.replace('-', '') in num_core(m.replace('/', '').replace('.', '')) or re.search(rf'\b0?{int(d)}\b', m) for m in marks):
            probs.append(f'תאריך {v}: סומן {marks[:3]}')
        return probs
    if isinstance(v, (int, float)) and v:
        want = str(int(v))
        bad = [m for m in marks if want not in numbers_in([m]) and (want if int(v) < 1000 or int(v) % 1000 else str(int(v) // 1000)) not in numbers_in([m])]
        if bad:
            probs.append(f'ערך {want}: סומן גם {bad[:4]}')
        if len(marks) > 6:
            probs.append(f'ערך {want}: {len(marks)} סימונים — יותר מדי')
    elif isinstance(v, str):
        vnums = [m.group(1).rstrip('.,').replace(',', '') for m in re.finditer(r'(\d[\d,.]*)\s*' + UNIT, v)]
        missing = [n for n in dict.fromkeys(vnums) if n not in nums]
        if missing:
            probs.append(f'מספרים מהערך שלא סומנו: {missing} (סומן: {marks[:4]})')
        if not vnums:
            words = {w for w in re.findall(r'[א-ת"\']{4,}', v) if w not in STOP}
            vn = [x.group(0) for x in re.finditer(r'\d[\d,.]*', v) if len(x.group(0)) >= 3]
            if not any(any(w in m for w in words) for m in marks) and not any(n.replace(',', '') in nums for n in vn):
                probs.append(f'הסימון {marks[:3]} לא מכיל מילה מהערך "{v[:40]}"')
    return probs


def main():
    rules = json.loads((ROOT / 'fields-rules.json').read_text(encoding='utf-8'))['tenders']
    snips = json.loads((ROOT / 'snips.json').read_text(encoding='utf-8'))
    total = bad = missing = 0
    for tid, fields in rules.items():
        for key, f in fields.items():
            if f.get('status') != 'verified' or not f.get('sources'):
                continue
            total += 1
            s = snips['tenders'].get(tid, {}).get(key)
            if not s:
                missing += 1
                print(f'[אין צילום] {tid} {key}: {str(f.get("value"))[:50]} ({f["sources"][0].get("locator", "")})')
                continue
            probs = check(key, f, s)
            if probs:
                bad += 1
                for p in probs:
                    print(f'[חריג] {tid} {key} עמוד {s["page"]}: {p}')
    print(f'\n{total} שדות מאומתים, {total - missing} עם צילום, {bad} חריגים, {missing} בלי צילום')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
