#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""בדיקת תאריכי החגים לפני בניית "שמות חגיגיים" (בקשת שלמה 07.09: "תבדוק
לפחות 3–5 אתרים שהתאריכים נכונים"). רץ ב-Actions (מהמכולה האתרים חסומים),
הפלט ללוג בלבד.

מה מושווה, לשנים 2026–2027 (תשפ"ז ותחילת תשפ"ח):
  · ICU — לוח השנה העברי המובנה בדפדפן (Intl.DateTimeFormat, ca=hebrew): זה
    מה שהאתר ישתמש בו. מודפס בצעד נפרד ב-node.
  · ספריות בלתי-תלויות: convertdate, pyluach.
  · אתרים: hebcal.com (API), timeanddate.com, ויקיפדיה (אנגלית ועברית), chabad.org.
"""
import datetime
import html
import json
import re
import sys
import urllib.request

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept-Language': 'he,en;q=0.8'}
YEARS = (2026, 2027)
# (שם, חודש עברי לפי מספור ICU/ספריות: 1=תשרי … 7=ניסן, 12/13=אדר, יום)
HOLIDAYS = [
    ('ראש השנה', 1, 1), ('צום גדליה', 1, 3), ('יום כיפור', 1, 10), ('סוכות', 1, 15), ('שמיני עצרת/שמחת תורה', 1, 22),
    ('חנוכה (כ"ה בכסלו)', 3, 25), ('עשרה בטבת', 4, 10), ('ט"ו בשבט', 5, 15),
    ('פורים (י"ד באדר/אדר ב)', 'adar', 14), ('תענית אסתר', 'adar', 13),
    ('פסח', 7, 15), ('שביעי של פסח', 7, 21), ('יום השואה (כ"ז בניסן)', 7, 27),
    ('יום הזיכרון (ד באייר)', 8, 4), ('יום העצמאות (ה באייר)', 8, 5), ('ל"ג בעומר', 8, 18), ('יום ירושלים', 8, 28),
    ('שבועות', 9, 6), ('י"ז בתמוז', 10, 17), ('תשעה באב', 11, 9),
]
KEYWORDS = {
    'ראש השנה': ['Rosh Hashana', 'ראש השנה'], 'צום גדליה': ['Gedaliah', 'צום גדליה'], 'יום כיפור': ['Yom Kippur', 'יום כיפור', 'יום הכיפורים'],
    'סוכות': ['Sukkot', 'סוכות'], 'שמיני עצרת/שמחת תורה': ['Shmini Atzeret', 'Shemini Atzeret', 'Simchat Torah', 'שמחת תורה'],
    'חנוכה (כ"ה בכסלו)': ['Chanukah', 'Hanukkah', 'חנוכה'], 'עשרה בטבת': ['Tevet', 'עשרה בטבת'], 'ט"ו בשבט': ["Tu BiShvat", "Tu B'Shevat", 'Tu Bishvat', 'ט"ו בשבט', 'טו בשבט'],
    'פורים (י"ד באדר/אדר ב)': ['Purim', 'פורים'], 'תענית אסתר': ['Esther', 'תענית אסתר'], 'פסח': ['Pesach', 'Passover', 'פסח'],
    'שביעי של פסח': ['Pesach VII', 'Last day of Passover', 'שביעי של פסח'], 'יום השואה (כ"ז בניסן)': ['HaShoah', 'Holocaust', 'יום השואה'],
    'יום הזיכרון (ד באייר)': ['HaZikaron', 'Memorial Day', 'יום הזיכרון'], 'יום העצמאות (ה באייר)': ["HaAtzma", 'Independence', 'יום העצמאות'],
    'ל"ג בעומר': ['Lag B', 'Lag Ba', 'ל"ג בעומר', 'לג בעומר'], 'יום ירושלים': ['Yerushalayim', 'Jerusalem Day', 'יום ירושלים'],
    'שבועות': ['Shavuot', 'שבועות'], 'י"ז בתמוז': ['Tammuz', 'י"ז בתמוז', 'שבעה עשר בתמוז'], 'תשעה באב': ["Tish'a B'Av", 'Tisha B', 'תשעה באב'],
}


def log(*a):
    print(*a, flush=True)


def get(url, timeout=60):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8', 'replace')


def text_of(h):
    h = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', h, flags=re.S | re.I)
    h = re.sub(r'<br\s*/?>|</(p|div|tr|li|h\d|td|th)>', '\n', h, flags=re.I)
    h = re.sub(r'<[^>]+>', ' ', h)
    h = html.unescape(h)
    return re.sub(r'[ \t\xa0]+', ' ', h)


def snippets(txt, words, n=4, w=70):
    out = []
    for word in words:
        for m in re.finditer(re.escape(word), txt):
            s = txt[max(0, m.start() - w):m.end() + w].replace('\n', ' ⏎ ')
            if any(y in s for y in ('2026', '2027', 'Sep', 'Oct', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'ב-20', 'בספטמבר', 'באוקטובר', 'בדצמבר', 'בינואר', 'בפברואר', 'במרץ', 'באפריל', 'במאי', 'ביוני', 'ביולי')):
                out.append(s.strip())
            if len(out) >= n:
                return out
    return out


# ---------- ספריות ----------
def lib_dates():
    rows = {}
    try:
        from convertdate import hebrew as cd
        for hy in (5787, 5788):
            leap = cd.leap(hy)
            for name, m, d in HOLIDAYS:
                mm = (13 if leap else 12) if m == 'adar' else m
                try:
                    y, mo, da = cd.to_gregorian(hy, mm, d)
                    rows.setdefault(name, {})[f'convertdate {hy}'] = f'{y:04d}-{mo:02d}-{da:02d}'
                except Exception as e:  # noqa: BLE001
                    rows.setdefault(name, {})[f'convertdate {hy}'] = f'שגיאה {e}'
    except Exception as e:  # noqa: BLE001
        log('convertdate לא זמין:', e)
    try:
        from pyluach import dates as pl
        for hy in (5787, 5788):
            leap = pl.HebrewDate(hy, 1, 1).year_leap if hasattr(pl.HebrewDate(hy, 1, 1), 'year_leap') else None
            for name, m, d in HOLIDAYS:
                mm = m
                if m == 'adar':
                    # pyluach: 12=אדר (או אדר א'), 13=אדר ב' בשנה מעוברת
                    try:
                        pl.HebrewDate(hy, 13, 1)
                        mm = 13
                    except Exception:  # noqa: BLE001
                        mm = 12
                try:
                    rows.setdefault(name, {})[f'pyluach {hy}'] = pl.HebrewDate(hy, mm, d).to_pydate().isoformat()
                except Exception as e:  # noqa: BLE001
                    rows.setdefault(name, {})[f'pyluach {hy}'] = f'שגיאה {e}'
    except Exception as e:  # noqa: BLE001
        log('pyluach לא זמין:', e)
    return rows


def main():
    log('=== ספריות (5787 = תשפ"ז, 5788 = תשפ"ח) ===')
    rows = lib_dates()
    for name, cols in rows.items():
        log(f'  {name}: ' + ' · '.join(f'{k}: {v}' for k, v in cols.items()))

    log('\n=== hebcal.com (API, ישראל) ===')
    for y in YEARS:
        try:
            j = json.loads(get(f'https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=on&mod=on&nx=on&year={y}&month=x&ss=off&mf=off&c=off&geo=none&i=on'))
            for it in j.get('items', []):
                t = it.get('title', '')
                if any(k in t for ks in KEYWORDS.values() for k in ks if not re.search(r'[א-ת]', k)):
                    log(f'  {it.get("date")}  {t}  ({it.get("hebrew", "")})')
        except Exception as e:  # noqa: BLE001
            log(f'  {y}: שגיאה {e}')

    sites = [
        ('timeanddate.com 2026', 'https://www.timeanddate.com/holidays/israel/2026'),
        ('timeanddate.com 2027', 'https://www.timeanddate.com/holidays/israel/2027'),
        ('ויקיפדיה (en) 2000–2050', 'https://en.wikipedia.org/wiki/Jewish_and_Israeli_holidays_2000%E2%80%932050'),
        ('ויקיפדיה (he) תשפ"ז', 'https://he.wikipedia.org/wiki/%D7%94%27%D7%AA%D7%A9%D7%A4%22%D7%96'),
        ('chabad.org', 'https://www.chabad.org/holidays/default_cdo/jewish/holidays.htm'),
        ('chabad.org 5787 calendar', 'https://www.chabad.org/calendar/view/year.htm?tdate=5787'),
    ]
    for label, url in sites:
        log(f'\n=== {label} — {url} ===')
        try:
            txt = text_of(get(url))
        except Exception as e:  # noqa: BLE001
            log(f'  שגיאה: {e}')
            continue
        log(f'  ({len(txt):,} תווים)')
        if 'timeanddate' in url:
            # טבלת החגים: "Sep 12 Saturday Rosh Hashana National holiday" — שורות עם חודש+יום
            for ln in txt.split('\n'):
                s = ln.strip()
                if re.match(r'^[A-Z][a-z]{2} \d{1,2}\b', s) and any(k in s for ks in KEYWORDS.values() for k in ks):
                    log('  ' + s[:120])
            continue
        if 'en.wikipedia' in url:
            # שורות טבלה שמכילות 2026/2027
            for ln in txt.split('\n'):
                s = ln.strip()
                if ('2026' in s or '2027' in s) and any(k in s for ks in KEYWORDS.values() for k in ks):
                    log('  ' + s[:200])
            # וגם הטבלאות עצמן (שורות של שנת 5787)
            for ln in txt.split('\n'):
                if '5787' in ln:
                    log('  [5787] ' + ln.strip()[:300])
            continue
        for name, words in KEYWORDS.items():
            for s in snippets(txt, words, n=3):
                log(f'  {name}: …{s}…')


if __name__ == '__main__':
    main()
