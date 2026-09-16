#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""מילוי "פרטים שנבדקו" בחוקים קבועים מסעיפי המסמך הראשי (בלי מודל שפה).

הקלט: tenders/sections/<מכרז>.json (מ-tender_sections.py), today.json, route-index.json,
structured-tenders.json ו-automatic-summaries.json (כדי לדעת מה כבר אומת).
הפלט: tenders/fields-rules.json — לכל מכרז שדות במבנה של field-catalog:
  verified            ערך אחד ברור במסמך, עם סעיף ועמוד
  not_applicable      המכרז בנוי אחרת (למשל אין "מחיר לק"מ" — ההצעה היא תוספת לעלות ההפעלה)
  per_line            נקבע לכל קו בנספח, לא ערך אחד למכרז
  not_found           חיפשנו במסמך הראשי ולא נמצא
  later               ייקבע אחרי ההגשה (זוכה, מחיר זכייה)
שדה שכבר אומת במסמך (analyze_packages) לא נדרס.
"""
import datetime
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import tender_sections as ts  # noqa: E402

OUT = ROOT / 'fields-rules.json'
SITE = 'https://transit-freak.github.io/kav-bochan/tenders/'


def read(path, default):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else default


def full(s):
    return ts.tidy(s['t'] + ' ' + s['text'])


def src(doc, s, extra=''):
    where = f"{s['d']}, " if s.get('d') else ''
    return {'url': f"{s.get('u') or doc['doc']}#page={s['p']}", 'locator': f"{where}סעיף {s['n']}, עמוד PDF {s['p']}{extra}"}


def find(secs, pattern, prefix=None, flags=0, strict=False):
    """הסעיף הראשון שמתאים. prefix הוא מספר הסעיף המועדף בתבנית משרד התחבורה (למשל 38 = מצבת האוטובוסים);
    אם אין התאמה שם — מחפשים בכל המסמך, כי במכרזי מוניות ובמכרזים ישנים המספור שונה."""
    rx = re.compile(pattern, flags)
    for only_prefix in ((True,) if (prefix and strict) else (True, False) if prefix else (False,)):
        for s in secs:
            if only_prefix and not (s['n'] == prefix or s['n'].startswith(prefix + '.')):
                continue
            m = rx.search(full(s))
            if m:
                return s, m
    return None, None


HEB_MONTHS = {'ינואר': 1, 'פברואר': 2, 'מרץ': 3, 'מרס': 3, 'אפריל': 4, 'מאי': 5, 'יוני': 6, 'יולי': 7, 'אוגוסט': 8, 'ספטמבר': 9, 'אוקטובר': 10, 'נובמבר': 11, 'דצמבר': 12}
DATE_RX = re.compile(r'(\d{2})/(\d{2})/(\d{4})|(\d{1,2})\s*ב?(' + '|'.join(HEB_MONTHS) + r')\s*,?\s*(\d{4})')


def date_near(text, pos, window=110):
    """התאריך הקרוב ביותר לביטוי (לפניו או אחריו) — "22/01/2026" או "14 בפברואר 2019"."""
    best = None
    for m in DATE_RX.finditer(text, max(0, pos - window), min(len(text), pos + window)):
        dist = min(abs(m.start() - pos), abs(m.end() - pos))
        if best is None or dist < best[0]:
            best = (dist, m)
    if not best:
        return None
    m = best[1]
    if m.group(1):
        return f'{m.group(3)}-{m.group(2)}-{m.group(1)}'
    return f'{m.group(6)}-{HEB_MONTHS[m.group(5)]:02d}-{int(m.group(4)):02d}'


def find_all(secs, pattern, prefix=None):
    rx = re.compile(pattern)
    out = []
    for s in secs:
        if prefix and not (s['n'] == prefix or s['n'].startswith(prefix + '.')):
            continue
        for m in rx.finditer(full(s)):
            out.append((s, m))
    return out


SUBCLAUSE = re.compile(r'\s\d{1,2}(?:\.\d{1,2}){1,3}\s')


def sentence_around(text, pos):
    """המשפט שבו נמצאה ההתאמה: מהנקודה/תת-הסעיף הממוספר האחרון שלפניה ועד הנקודה שאחריה."""
    start = max(text.rfind('. ', 0, pos), text.rfind('; ', 0, pos))
    for m in SUBCLAUSE.finditer(text, 0, pos):
        start = max(start, m.end() - 1)
    end = text.find('. ', pos)
    nxt = SUBCLAUSE.search(text, pos)
    if nxt and (end < 0 or nxt.start() < end):
        end = nxt.start() - 1
    return text[start + 1 if start >= 0 else 0: end + 1 if end >= 0 else len(text)].strip(' .;') + '.'


def iso(d):
    m = re.match(r'(\d{2})/(\d{2})/(\d{4})', d)
    return f'{m.group(3)}-{m.group(2)}-{m.group(1)}' if m else d


def num(s):
    return float(s.replace(',', ''))


def V(value, doc, s, **kw):
    # sec: הסעיף שממנו נלקח הערך — כדי שהאתר יציג "הסעיפים העיקריים שמצאנו" בלי לטעון את כל המסמך
    f = {'status': 'verified', 'value': value, 'sources': [src(doc, s)],
         'sec': {'n': s['n'], 't': s['t'][:90], 'brief': (s.get('brief') or '')[:220], 'p': s['p'], **({'d': s['d']} if s.get('d') else {})}}
    f.update({k: v for k, v in kw.items() if v is not None})
    return f


def rules(doc, secs, today, route_meta, known):
    out = {}
    verified = lambda k: known.get(k, {}).get('status') in ('verified', 'verified_conditional')  # noqa: E731

    # --- מועדים ------------------------------------------------------------------------
    s, m = find(secs, r'הגשת שאלות הבהרה|שאלות הבהרה עד|מועד אחרון (?:להגשת|למשלוח) שאלות', '12')
    if s:
        d = date_near(full(s), m.start())
        if d:
            out['dates.questions'] = V(d, doc, s, notes='לפי טבלת המועדים במסמך המקורי; מועדים עשויים להתעדכן בהודעות הבהרה.')

    s, m = find(secs, r"תקופת הפעלת שלב א['׳] תחל לא יאוחר מ\s*[–-]?\s*(\d+)\s*חודשים", '1')
    if s:
        val = f"עד {m.group(1)} חודשים מההודעה על הזכייה (שלב א')"
        s2, m2 = find(secs, r"שלב ב['׳] תחל לא יאוחר מ\s*[–-]?\s*(\d+)\s*חודשים", '1')
        if s2:
            val += f", שלב ב' עד {m2.group(1)} חודשים"
        out['dates.service_start'] = V(val, doc, s)

    # --- תקופה ---------------------------------------------------------------------------
    s, m = find(secs, r'להאריך את תקופת ההפעלה לתקופה נוספת של\s*(\d+)\s*(חודשים|שנים)')
    if s:
        out['term.extension'] = V(int(m.group(1)), doc, s, unit='months' if m.group(2) == 'חודשים' else 'years', notes='לפי שיקול דעת הממשלה ("תקופת ההפעלה הנוספת").')

    # --- צי ------------------------------------------------------------------------------
    # אוטובוסים: "המספר הכולל של הרכבים באשכול (עד ליישום מלא) לא יפחת מ-166 אוטובוסים"; מוניות: מספר מזערי שמציע המציע
    s, m = find(secs, r'המספר הכולל של(?:\s*\d+)?\s*(?:הרכבים|האוטובוסים|המוניות) באשכול(?: עד ליישום מלא)? לא יפחת מ\s*-?\s*(\d+)\s*-?\s*(?:אוטובוסים|מוניות|כלי רכב)', '38')
    if s:
        out['fleet.operating'] = V(int(m.group(1)), doc, s, notes='"מצבת האוטובוסים הבסיסית", כולל רזרבה תפעולית.')
    else:
        s, m = find(secs, r'המספר הכולל של המוניות באשכול לא יפחת ממספר המוניות המזערי')
        if s:
            out['fleet.operating'] = V('מספר המוניות המזערי שהמציע מתחייב לו בהצעתו, כולל רזרבה', doc, s)
    s, m = find(secs, r'רזרבה תפעולית(?: של|:)?\s*(\d{1,2})\s*%', '38')
    if s:
        out['fleet.reserve'] = V(int(m.group(1)), doc, s, kind='percent')
    sA, mA = find(secs, r'גיל (?:ה)?(?:אוטובוסים|מוניות|רכבים|כלי הרכב) לא יעלה על\s*(\d+)\s*-?\s*שנים|יהיו בגיל נמוך מ\s*-?\s*(\d+)\s*-?\s*שנים')
    sB, mB = find(secs, r'משומש(?:ים|ות) שגיל[םן](?:\s*לא)?(?:\s*•)?\s*(?:יעלה על|עד)\s*(?:•\s*)?(\d+)\s*שנים', '38')
    if sA:
        age = int(mA.group(1) or mA.group(2))
        out['fleet.max_age'] = V(age, doc, sA, unit='years', notes=(f'כלי רכב משומשים בתחילת ההפעלה: עד {mB.group(1)} שנים (סעיף {sB["n"]}).' if sB else None))
    elif sB:
        out['fleet.max_age'] = V(int(mB.group(1)), doc, sB, unit='years', notes='לכלי רכב משומשים במועד הפעלת האשכול.')
    s, m = find(secs, r'כל האוטובוסים באשכול.{0,80}?יופעלו באוטובוסים חשמליים', '38')
    if s:
        out['fleet.electric_share'] = V(100, doc, s, kind='percent', notes='כל האוטובוסים באשכול חשמליים לאורך כל תקופת ההפעלה.')
    else:
        s, m = find(secs, r'האוטובוסים החשמליים לא יפחת מ\s*-?\s*(\d{1,3})\s*(?:אחוז|%)', '38')
        if s:
            out['fleet.electric_share'] = V(int(m.group(1)), doc, s, kind='percent', notes=ts.simplify(sentence_around(full(s), m.start()))[:220])
        else:
            s, m = find(secs, r'לא נדרשים אוטובוסים מונעים בחשמל', '38')
            if s:
                out['fleet.electric_share'] = V('לא נדרש בתחילת ההפעלה', doc, s, notes=ts.simplify(sentence_around(full(s), m.start()))[:220])
    s, m = find(secs, r'יהיה אוטובוס נגיש', '38')
    if s:
        out['fleet.accessibility'] = V('כל האוטובוסים נגישים', doc, s, notes='לפי תקנות שוויון זכויות לאנשים עם מוגבלות (הסדרת נגישות לשירותי תחבורה ציבורית).')
    s, m = find(secs, r'לא יפחת מ\s*(\d+)\s*-?\s*מקומות ישיבה ואורכו\s*(\d+)\s*מטר', '2')
    if s:
        out['fleet.seats'] = V(int(m.group(1)), doc, s, notes=f'לפי ההגדרה בסעיף {s["n"]} (אוטובוס באורך {m.group(2)} מ׳ לפחות).')

    # --- תנאי סף -----------------------------------------------------------------------------
    s, m = find(secs, r'בעל רישיון תקף להסעת נוסעים בקווי שירות', '4')
    if s:
        out['eligibility.licenses'] = V('רישיון תקף להסעת נוסעים בקווי שירות בתחבורה ציבורית', doc, s, notes=ts.simplify(sentence_around(full(s), m.start()))[:260])
    if not verified('eligibility.drivers'):
        s, m = find(secs, r'לפחות\s*\d+\s*נהגים|\d+\s*נהגים לפחות|מעסיק\s*\d+\s*נהגים', '4', strict=True)   # רק בתנאי הסף, לא במענק ההכשרה
        if s:
            out['eligibility.drivers'] = V(ts.simplify(sentence_around(full(s), m.start()))[:200], doc, s)
        elif any(x['n'].startswith('4') for x in secs):
            s4 = next(x for x in secs if x['n'] == '4' or x['n'].startswith('4.'))
            out['eligibility.drivers'] = {'status': 'not_found', 'reason': 'בתנאי הסף (סעיף 4) אין דרישה למספר נהגים.', 'sources': [src(doc, s4)]}

    # --- השירות ------------------------------------------------------------------------------
    counts = (today or {}).get('counts') or {}
    n_routes = counts.get('inTender') or (route_meta or {}).get('uniqueRoutes')
    if n_routes:
        out['service.routes'] = {'status': 'verified', 'value': int(n_routes), 'notes': 'קווים בנספח הקווים של המכרז (טבלת "הקווים במכרז").', 'sources': [{'url': f'{SITE}#q={doc["tender"]}', 'locator': 'טבלת הקווים במכרז'}]}
    if route_meta:
        versions = [v for f in (route_meta.get('files') or [route_meta.get('file')]) if f for v in read(ROOT / f, [])]
        current = [v for v in versions if v.get('sourceStatus') == 'current_download'] or versions
        best = max(current, key=lambda v: (v.get('counts') or {}).get('lines', 0), default=None)
        if best and (best.get('counts') or {}).get('directionVariants'):
            out['service.variants'] = {'status': 'verified', 'value': int(best['counts']['directionVariants']), 'notes': f"כיוונים וחלופות בנספח הקווים ({best['counts'].get('lines')} קווים; נקראו {len(versions)} גרסאות של הנספח).", 'sources': [{'url': best['url'], 'locator': 'נספח הקווים'}]}
    s, m = find(secs, r'המסתכם ב\s*[–-]?\s*([\d.,]+)\s*אלפי נסיעות ו\s*-?\s*([\d.,]+)\s*-?\s*אלפי ק"מ')
    trips = None
    if s:
        trips = num(m.group(1))
        out['service.annual_km'] = V(int(round(num(m.group(2)) * 1000)), doc, s, unit='km', period='לשנה', notes=f'"מפת הבסיס לאשכול": {m.group(1)} אלפי נסיעות ו-{m.group(2)} אלפי ק"מ רכב בשנה.')
    per_line = 'נקבע לכל קו בטבלאות התפעוליות בנספח, לא ערך אחד למכרז.'
    for key in ('service.operating_hours', 'service.frequency'):
        out[key] = {'status': 'per_line', 'reason': per_line}
    out['service.weekly_trips'] = {'status': 'per_line', 'reason': per_line + (f' סך שנתי במפת הבסיס: {m.group(1)} אלפי נסיעות (סעיף {s["n"]}).' if trips else ''), **({'sources': [src(doc, s)]} if trips else {})}

    # --- תמורה ------------------------------------------------------------------------------
    s, m = find(secs, r'תוספת לעלות ההפעלה השנתית|תוספת ק"מ לממשלה')
    if s:
        reason = 'ההצעה הכספית במכרז היא תוספת לעלות ההפעלה השנתית או תוספת ק"מ לממשלה, לא מחיר לק"מ.'
        for key in ('price.per_km', 'price.ceiling_per_km'):
            out[key] = {'status': 'not_applicable', 'reason': reason, 'sources': [src(doc, s)]}
    s, m = find(secs, r'סובסידיה שוטפת')
    if s:
        out['price.fixed_payment'] = {'status': 'not_applicable', 'reason': 'התשלום למפעיל הוא סובסידיה שוטפת שמחושבת מעלות ההפעלה השנתית והכנסות בפועל, לא תשלום קבוע.', 'sources': [src(doc, s)]}
    s, m = find(secs, r'מדד מחירי התשומות', '49')
    if not s:
        s, m = find(secs, r'מדד מחירי התשומות')
    if s:
        out['price.indexation'] = V('מדד מחירי התשומות', doc, s, notes='הרכב המדד והמשקולות מפורטים בסעיף שבו הוא מוגדר.')

    # --- ניקוד ------------------------------------------------------------------------------
    # רכיבי הניקוד בסעיף 28: "28.4 ניסיון עבר … – 24 נקודות", "28.7 תכנית עסקית 10 - נקודות", וגם כותרת שנדבקה לטקסט של הסעיף הקודם
    comps, seen = [], set()
    crit = next((x for x in secs if re.search(r'הקריטריונים והמשקלות|אמות המידה|קריטריונים לבחירת', x['t'])), None)
    base = crit['n'].split('.')[0] if crit else '28'
    COMP = re.compile(r"(?:^|\s)" + re.escape(base) + r"\.(\d)\s*(.{3,70}?)\s*[–-]?\s*(\d{1,2})\s*[–-]?\s*(?:נקודות|נק')")
    for s2 in secs:
        if not s2['n'].startswith(base):
            continue
        for mm in COMP.finditer(base + '.' + s2['n'].split('.')[1] + ' ' + full(s2) if re.fullmatch(re.escape(base) + r'\.\d', s2['n']) else full(s2)):
            sub = mm.group(1)
            if sub in seen:
                continue
            seen.add(sub)
            name = re.split(r' של המציע| לפי | בהתאם ל| – |: ', mm.group(2).strip())[0][:40]
            comps.append((name, int(mm.group(3)), s2))
    pw = known.get('scoring.price_weight', {})
    if pw.get('status') == 'verified' and isinstance(pw.get('value'), (int, float)):
        others = [c for c in comps if 'כספית' not in c[0]]
        total = sum(c[1] for c in others)
        if others and total + pw['value'] == 100:
            out['scoring.quality_weight'] = {'status': 'verified', 'value': 100 - pw['value'], 'kind': 'percent', 'notes': 'משלים ל-100 את משקל המחיר: ' + ', '.join(f'{c[0]} {c[1]}' for c in others) + '.', 'sources': [src(doc, c[2]) for c in others]}
        elif others:
            out['scoring.quality_weight'] = {'status': 'verified', 'value': 100 - pw['value'], 'kind': 'percent', 'notes': 'משלים ל-100 את משקל המחיר. רכיבים שנמצאו: ' + ', '.join(f'{c[0]} {c[1]}' for c in others) + '.', 'sources': [src(doc, c[2]) for c in others]}
    s, m = find(secs, r'ציון (?:איכות )?(?:מזערי|מינימלי|מינימאלי|סף)(?: נדרש)?|ניקוד (?:איכות )?(?:מינימלי|מינימאלי)|סף איכות|ציון סף')
    if s:
        out['scoring.minimum_quality'] = V(ts.simplify(sentence_around(full(s), m.start()))[:220], doc, s)
    elif comps:
        out['scoring.minimum_quality'] = {'status': 'not_found', 'reason': f'בסעיף הקריטריונים ({base}) לא נמצא ציון איכות מזערי.', 'sources': [src(doc, comps[0][2])]}

    # --- פיצויים ------------------------------------------------------------------------------
    pen = [x for x in secs if 'קנסות ופיצויים' in x['topics']]
    s, m = find(secs, r'כפיצוי מוסכם סך מקסימלי של\s*(\d+)\s*אלף ₪\s*(?:בגין|על) כל שבוע איחור')
    if pen or s:
        # טבלת הקנסות עצמה: הנספח שבו מרוכזים רוב סעיפי הקנסות (עמודים צמודים), והסעיף הראשון בו — אליו מקשרים
        table = None
        if pen:
            pages = [x['p'] for x in pen]
            best = max(pages, key=lambda pg: sum(1 for q in pages if abs(q - pg) <= 4))
            table = min((x for x in pen if abs(x['p'] - best) <= 4), key=lambda x: x['p'])
        parts = []
        if table:
            parts.append(f'טבלת הקנסות בעמוד {table["p"]}' + (f' ({table["d"]})' if table.get('d') else '') + f', {len(pen)} סעיפים')
        if s:
            parts.append(f'איחור בתחילת ההפעלה: עד {m.group(1)} אלף ₪ לכל שבוע')
        srcs = []
        if table:
            srcs.append({**src(doc, table), 'locator': f'טבלת הקנסות: עמוד PDF {table["p"]}'})
        if s:
            srcs.append({**src(doc, s), 'locator': f'איחור בתחילת ההפעלה: סעיף {s["n"]}, עמוד PDF {s["p"]}'})
        out['penalties.amount'] = {'status': 'verified', 'value': '; '.join(parts), 'sources': srcs, 'notes': 'הסכומים לכל הפרה מפורטים בטבלת הפיצויים המוסכמים.',
                                   **({'sec': {'n': table['n'], 't': table['t'][:90], 'brief': (table.get('brief') or '')[:220], 'p': table['p']}} if table else {})}

    # --- עובדות במילים פשוטות (לא בקטלוג השדות; משמשות את "בקצרה למי שלא מבין במכרזים") ------------
    s, m = find(secs, r'מענק (?:בסך|של)\s*(\d+)\s*אלף\s*₪\s*(?:בגין|על) כל נהג.{0,80}?(?:עד לתקרה של|עד)\s*(\d+)\s*נהגים')
    if s:
        out['facts.driver_grant'] = V(f'המדינה תשלם לחברה מענק של {m.group(1)} אלף ₪ על כל נהג חדש שהיא תכשיר, עד {m.group(2)} נהגים.', doc, s)
    s, m = find(secs, r'שכר היסוד לשעה')
    if s:
        txt = 'כל חברה שמתמודדת צריכה לכתוב בהצעה כמה שכר לשעה היא תשלם לנהגים, ולעמוד בזה כל תקופת המכרז.'
        s2, m2 = find(secs, r'רשאי לפרסם לנהגים.{0,40}?שכר')
        if s2:
            txt += ' משרד התחבורה יכול לפרסם לנהגים כמה הובטח להם.'
        out['facts.driver_wage'] = V(txt, doc, s)
    s, m = find(secs, r'סובסידיה שוטפת')
    s2, m2 = find(secs, r'עלות ההפעלה השנתית')
    if s and s2:
        out['facts.payment_model'] = V('המדינה משלמת לחברה סובסידיה: עלות ההפעלה השנתית שנקבעה, פחות מה שנכנס מהנוסעים.', doc, s)
    s, m = find(secs, r'תוספת לעלות ההפעלה השנתית|תוספת ק"מ לממשלה')
    if s:
        out['facts.bid_type'] = V('כל חברה אומרת כמה תוספת היא רוצה מעל עלות ההפעלה, או כמה קילומטרים היא מוכנה לתת בחינם. מי שזול יותר למדינה מקבל יותר נקודות.', doc, s)

    # --- זוכה ---------------------------------------------------------------------------------
    for key in ('award.winner', 'award.awarded_price'):
        out[key] = {'status': 'later', 'reason': 'תוצאות המכרז מתפרסמות אחרי ההגשה ובחינת ההצעות.'}

    # לא דורסים שדה שכבר אומת במסמך
    return {k: v for k, v in out.items() if not verified(k)}


def known_fields(tid, structured, automatic):
    fields = dict((structured.get('tenders') or structured).get(tid) or {})
    auto = automatic.get('tenders', {}).get(tid, {})
    for k, f in (auto.get('metadataFields') or {}).items():
        if f.get('status') in ('verified', 'verified_conditional'):
            fields[k] = f
    for d in auto.get('documents', {}).values():
        for k, f in (d.get('fields') or {}).items():
            if f.get('status') in ('verified', 'verified_conditional'):
                fields[k] = f
    return fields


def main():
    index = read(ROOT / 'sections-index.json', {'tenders': {}})['tenders']
    today = read(ROOT / 'today.json', {'tenders': {}})['tenders']
    routes = read(ROOT / 'route-index.json', {'tenders': {}})['tenders']
    structured = read(ROOT / 'structured-tenders.json', {})
    automatic = read(ROOT / 'automatic-summaries.json', {'tenders': {}})
    result = {'updated': datetime.date.today().isoformat(), 'tenders': {}}
    filled = 0
    for tid, meta in index.items():
        doc = read(ROOT / meta['file'], None)
        if not doc:
            continue
        fields = rules(doc, doc['sections'], today.get(tid), routes.get(tid), known_fields(tid, structured, automatic))
        result['tenders'][tid] = fields
        n = sum(1 for f in fields.values() if f['status'] == 'verified')
        filled += n
        print(tid, f"{n} אומתו בחוקים · {sum(1 for f in fields.values() if f['status'] != 'verified')} עם הסבר למה אין ערך", flush=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=0), encoding='utf-8')
    print(f'שדות בחוקים: {filled} ערכים ב-{len(result["tenders"])} מכרזים')


if __name__ == '__main__':
    main()
