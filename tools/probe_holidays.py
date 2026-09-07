#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""בדיקת תאריכי החגים לפני בניית "שמות חגיגיים" (בקשת שלמה 07.09: "תבדוק
לפחות 3–5 אתרים שהתאריכים נכונים"). רץ ב-Actions (מהמכולה האתרים חסומים),
הפלט ללוג בלבד.

מה מושווה, לשנים 2026–2027 (תשפ"ז ותחילת תשפ"ח):
  · ICU — לוח השנה העברי המובנה בדפדפן (Intl.DateTimeFormat, ca=hebrew): זה
    מה שהאתר ישתמש בו. מודפס בצעד נפרד ב-node.
  · ספריות בלתי-תלויות: convertdate, pyluach (מספור חודשים מניסן: 1=ניסן, 7=תשרי).
  · אתרים: hebcal.com (API), ויקיפדיה אנגלית (תיבת המידע של כל חג), ויקיפדיה
    עברית (דף השנה), jewfaq.org, myjewishlearning.com, jewishvirtuallibrary.org,
    ou.org, aish.com. timeanddate ו-chabad חוסמים שרתים (403) — נרשם.
"""
import html
import json
import re
import urllib.request

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept-Language': 'he,en;q=0.8', 'Accept': 'text/html,application/json;q=0.9,*/*;q=0.8'}
YEARS = (2026, 2027)
# (שם, חודש עברי במספור-מניסן של הספריות: 1=ניסן … 7=תשרי, 12/13=אדר, יום)
HOLIDAYS = [
    ('ראש השנה', 7, 1), ('צום גדליה', 7, 3), ('יום כיפור', 7, 10), ('סוכות', 7, 15), ('שמיני עצרת/שמחת תורה', 7, 22),
    ('חנוכה (כ"ה בכסלו)', 9, 25), ('עשרה בטבת', 10, 10), ('ט"ו בשבט', 11, 15),
    ('תענית אסתר', 'adar', 13), ('פורים (י"ד באדר/אדר ב)', 'adar', 14),
    ('פסח', 1, 15), ('שביעי של פסח', 1, 21), ('יום השואה (כ"ז בניסן)', 1, 27),
    ('יום הזיכרון (ד באייר)', 2, 4), ('יום העצמאות (ה באייר)', 2, 5), ('ל"ג בעומר', 2, 18), ('יום ירושלים', 2, 28),
    ('שבועות', 3, 6), ('י"ז בתמוז', 4, 17), ('תשעה באב', 5, 9),
]
EN_KEYS = ['Rosh Hashana', 'Gedaliah', 'Yom Kippur', 'Sukkot', 'Shmini Atzeret', 'Simchat Torah', 'Chanukah', 'Hanukkah', 'Tevet',
           'Tu BiShvat', "Tu B'Shevat", 'Purim', 'Esther', 'Pesach', 'Passover', 'HaShoah', 'HaZikaron', "HaAtzma", 'Independence',
           'Lag BaOmer', 'Lag B', 'Yerushalayim', 'Jerusalem Day', 'Shavuot', 'Tammuz', 'Tamuz', 'Tish', 'Tisha']
HE_MONTHS = ['בינואר', 'בפברואר', 'במרץ', 'במרס', 'באפריל', 'במאי', 'ביוני', 'ביולי', 'באוגוסט', 'בספטמבר', 'באוקטובר', 'בנובמבר', 'בדצמבר']
EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
             'Jan', 'Feb', 'Mar', 'Apr', 'Jun', 'Jul', 'Aug', 'Sep', 'Sept', 'Oct', 'Nov', 'Dec']


def log(*a):
    print(*a, flush=True)


def get(url, timeout=60):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8', 'replace')


def text_of(h):
    h = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', h, flags=re.S | re.I)
    h = re.sub(r'<br\s*/?>|</(p|div|tr|li|h\d|td|th|dd|dt)>', '\n', h, flags=re.I)
    h = re.sub(r'<[^>]+>', ' ', h)
    h = html.unescape(h)
    return re.sub(r'[ \t\xa0]+', ' ', h)


def date_lines(txt, years=('2026', '2027'), limit=40, must=None):
    """שורות שמכילות שנה + שם חודש (לועזי או עברי) — שם מופיעים התאריכים."""
    out = []
    for ln in txt.split('\n'):
        s = ln.strip()
        if not s or len(s) > 400:
            continue
        if not any(y in s for y in years):
            continue
        if not (any(m in s for m in EN_MONTHS) or any(m in s for m in HE_MONTHS)):
            continue
        if must and not any(k in s for k in must):
            continue
        out.append(s)
        if len(out) >= limit:
            break
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
            for name, m, d in HOLIDAYS:
                mm = m
                if m == 'adar':
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
    for name, cols in lib_dates().items():
        log(f'  {name}: ' + ' · '.join(f'{k}: {v}' for k, v in cols.items()))

    log('\n=== hebcal.com (API, ישראל, כולל צומות) ===')
    for y in YEARS:
        try:
            j = json.loads(get(f'https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=on&mod=on&nx=on&mf=on&year={y}&month=x&ss=off&c=off&geo=none&i=on'))
            for it in j.get('items', []):
                t = it.get('title', '')
                if any(k in t for k in EN_KEYS) and 'CH’’M' not in t and 'Rosh Chodesh' not in t and 'LaBehemot' not in t and 'Sheni' not in t and 'Rabin' not in t:
                    log(f'  {it.get("date")}  {t}  ({it.get("hebrew", "")})')
        except Exception as e:  # noqa: BLE001
            log(f'  {y}: שגיאה {e}')

    log('\n=== ויקיפדיה אנגלית — תיבת המידע של כל חג (שורות עם 2026/2027) ===')
    for art in ['Rosh_Hashanah', 'Yom_Kippur', 'Sukkot', 'Shemini_Atzeret', 'Hanukkah', 'Tenth_of_Tevet', 'Tu_BiShvat', 'Purim', 'Passover',
                'Yom_HaShoah', 'Yom_HaZikaron', 'Independence_Day_(Israel)', 'Lag_BaOmer', 'Jerusalem_Day', 'Shavuot', 'Seventeenth_of_Tammuz', "Tisha_B'Av", 'Fast_of_Gedalia', 'Fast_of_Esther']:
        try:
            txt = text_of(get(f'https://en.wikipedia.org/wiki/{art}'))
            ls = date_lines(txt, limit=6)
            log(f'  {art}: ' + (' | '.join(ls) if ls else '(לא נמצאו שורות תאריך)'))
        except Exception as e:  # noqa: BLE001
            log(f'  {art}: שגיאה {e}')

    log('\n=== ויקיפדיה עברית — דף השנה ה\'תשפ"ז ===')
    for url in ['https://he.wikipedia.org/wiki/%D7%94%27%D7%AA%D7%A9%D7%A4%22%D7%96', 'https://he.wikipedia.org/wiki/%D7%AA%D7%A9%D7%A4%22%D7%96']:
        try:
            txt = text_of(get(url))
            log(f'  {url}: {len(txt):,} תווים')
            for s in date_lines(txt, limit=60):
                log('   ', s[:220])
            # גם השורות עם שמות החגים בלי תאריך לועזי
            for ln in txt.split('\n'):
                s = ln.strip()
                if any(k in s for k in ['ראש השנה', 'יום כיפור', 'יום הכיפורים', 'סוכות', 'חנוכה', 'פורים', 'פסח', 'שבועות', 'יום העצמאות', 'ט"ו בשבט', 'ל"ג בעומר', 'תשעה באב']) and len(s) < 200:
                    log('    ·', s)
            break
        except Exception as e:  # noqa: BLE001
            log(f'  {url}: שגיאה {e}')

    sites = [
        ('jewfaq.org (Judaism 101) — לוח נוכחי', 'https://www.jewfaq.org/current_calendar'),
        ('jewfaq.org — 5787', 'https://www.jewfaq.org/jewish_calendar_5787'),
        ('myjewishlearning.com 2026-2027', 'https://www.myjewishlearning.com/article/jewish-holidays-2026-2027/'),
        ('jewishvirtuallibrary.org', 'https://www.jewishvirtuallibrary.org/jewish-holidays-calendar'),
        ('ou.org', 'https://www.ou.org/holidays/'),
        ('aish.com', 'https://aish.com/jewish-calendar/'),
        ('hebcal.com — דף HTML 2027', 'https://www.hebcal.com/holidays/2027?i=on'),
        ('timeanddate.com 2027', 'https://www.timeanddate.com/holidays/israel/2027'),
        ('chabad.org', 'https://www.chabad.org/holidays/default_cdo/jewish/holidays.htm'),
    ]
    for label, url in sites:
        log(f'\n=== {label} — {url} ===')
        try:
            txt = text_of(get(url))
        except Exception as e:  # noqa: BLE001
            log(f'  שגיאה: {e}')
            continue
        ls = date_lines(txt, limit=45, must=EN_KEYS + ['Fast', 'Memorial', 'Holocaust'])
        log(f'  ({len(txt):,} תווים · {len(ls)} שורות תאריך)')
        for s in ls:
            log('   ', s[:200])


if __name__ == '__main__':
    main()
