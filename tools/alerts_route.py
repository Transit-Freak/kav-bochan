# -*- coding: utf-8 -*-
"""הקו המודיע — מסלול משוער לפי נוסח ההודעה (שלמה 18.10.2026).

הודעות משרד התחבורה על עבודות כתובות בתבנית כמעט קבועה:
  "קווים 16, 20 לכיוון תחנה מרכזית: ייסעו במסלול המקורי עד חנה סנש/שדרות הפלמ"ח,
   ימינה שדרות הפלמ"ח, שמאלה שמעון בן שטח, ... והמשך מסלול מקורי."
כאן: פירוק ההודעה לפסקאות (אילו קווים, מאיזה צומת יוצאים, ואיזה רחובות אחר כך),
ואז ניתוב על רשת הרחובות של OpenStreetMap — רחוב אחרי רחוב, כמו במפת העקיפה של אשדוד.

הניתוב לא יודע איך הנהג נוסע בפועל, ולכן זה תמיד "משוער". בלי הוראה בנוסח — אין מסלול,
רק התחנות (שלמה 18.10: "מסלול משוער רק לפי ההודעה").
"""
import collections
import heapq
import math
import re

# ------------------------------------------------------------------ פירוק הנוסח
# מילים שמקדימות שם רחוב ולא שייכות לו
_LEAD = re.compile(r"^(?:(?:ו?(?:ימינה|שמאלה|ישר|המשך|ממשיך|ימשיך|ימשיכו|ממשיכים|יפנה|יפנו|פונים|פנייה|פניה|"
                   r"ייסע|ייסעו|יסע|יסעו|נוסעים|עולים|יורדים|יציאה|כניסה|לכיוון|על|דרך ה?כיכר|בכיכר|כיכר|רחוב|רח'|רח׳|"
                   r"שד'|שד׳|שדרות|שדרת|שד\.|ברחוב|לרחוב|לרח'|לרח׳|ברח'|ברח׳|בשדרות|לשדרות|בשד'|לשד'|ומשם|ואז|במחלף|למחלף|מחלף|"
                   r"חזרה|חזרה ל|וחוזר|חוזרים|ויחזור|יחזור|בנסיעה|בנסיעה ב|להמשך|הרחובות|הכיכר|הכיכר ב|בצומת|צומת|אל|ייכנס|ייכנסו|נכנסים|דרך הרחובות|דרך הרחבות|הרחבות|"
                   r"יפנו|ימשיכו|ייסעו|ממשיך|ימשיך|ישר|לכיון|את נסיעתו|את נסיעתם|\"?במזלג\"?)\s+))+")
_END = re.compile(r"(ו?ימשי(?:ך|כו) (?:על פי |לפי |ב)(?:ה)?מסלול(?:ים)? (?:ה)?(?:קיים|קיימים|רגיל|מקורי)(?! עד)|והמשך|ויתחבר|ויתחברו|להמשך (?:ה)?(?:מסלול|הקו)|ממשיכים במסלול|וממשיכים במסלול|ונמשך במסלול|ו?חזרה למסלול|ו?יסיים|ו?יסיימו|"
                  r"ו?בחזרה למסלול|ו?יחזרו למסלול|ו?יחזור למסלול|ו?ימשיכו במסלול|ו?ימשיך במסלול|ו?חוזרים למסלול|ו?מסיימים|ו?נוסעים במסלול|ונוסעים|במסלולו המקורי|במסלולם|במסלולים המקוריים|במסלול המקורי|ו(?:ע\"פ|על פי) המסלול)")
_START = re.compile(r"עד\s+(?:לפני\s+)?(?:ל(?=כיכר|צומת))?(?:כיכר\s+|צומת\s+הרחובות\s+|צומת\s+|הרחובות\s+|הכיכר\s+)?([^,/()]{2,40}?)(?:\s*/\s*|\s*\\\s*|\s+פינת\s+|\s+פינה\s+|\s+[–-]\s*|\s*–\s+)([^,()/]{2,40}?)"
                    r"\s*(?:\([^)]*\))?\s*(?:ללא שינוי|כרגיל)?\s*(?:,|$|(?=/))")
_LINES = re.compile(r"קו(?:ים|י)?\s+([\d\sא-ת,ו׳'\"]+?)(?=\s*(?:לכיוון|מ|ל|:|ו?קווי|$))")


def norm(s):
    """שם רחוב להשוואה: בלי גרשיים, בלי "רחוב/שד'", יוד ו-וו כפולות כמו ברישום."""
    s = str(s or "")
    s = re.sub(r"[\"'׳״`.]", "", s)
    s = re.sub(r"^כביש\s+מס\s*", "כביש ", s.strip())
    s = re.sub(r"^(?:רחוב|רח|שדרות|שד|שדרת|דרך)\s+", "", s.strip())
    s = s.replace("יי", "י").replace("וו", "ו")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def clean_street(tok):
    t = re.sub(r"\([^)]*\)", " ", tok)
    t = re.sub(r"\(.*$", " ", t)   # סוגריים שלא נסגרו: "ירושלים (כביש 40"
    t = re.sub(r"\s+", " ", t).strip(" .;:/")
    t = _LEAD.sub("", t).strip()
    t = re.sub(r"\s+(?:עד|ללא שינוי|לכיוון.*)$", "", t).strip()
    # "ששת הימים – עד לתחנה הסופית" — השם הוא רק עד המקף או "עד"
    t = re.split(r"\s[–-]\s|\sעד\s", t)[0].strip()
    t = re.sub(r"\s+(?:ממשיך|ממשיכים|ימשיך|ימשיכו)(?:\s+ישר)?$", "", t).strip()
    # "בן גוריון ומיד", "לכביש 5 למזרח", "כביש 4 צפון"
    t = re.sub(r"\s+(?:ו?מיד|ל?(?:מזרח|מערב|צפון|דרום))$", "", t).strip()
    # "לכביש 651 דרך הים" — מספר הכביש מספיק
    t = re.sub(r"^(ל|ב)?(כביש\s+(?:מס['׳]?\s*)?\d+)\s+\S.*$", r"\1\2", t).strip(" )")
    # "בגין דרך הנת"צ הימני" (דן) — הנתיב לא חלק משם הרחוב
    t = re.sub(r"\s+(?:דרך\s+|ב)(?:ה)?(?:נת\"?צ|נתיב).*$", "", t).strip()
    return t


# "לקו 4-3 (סיבובי)" — קו 4 כיוון 3, לא קווים 4 ו-3 (הוד השרון 25.10)
_LINE_DNUM = re.compile(r"(קו(?:ו?ים|ו?י)?\s+(\d+[א-ת]?))-([1-3])(?!\d)")


def line_dnum(text):
    """הכיוון של כל קו שכתוב לידו ("לקוים 1-2 …, 65 …" → {'1': '2'}) — לא של שאר הקווים בכותרת."""
    return {m.group(2): m.group(3) for m in _LINE_DNUM.finditer(text)}


def _with_dnum(nums, dn):
    """"1-2" לקו שכתוב לו כיוון, "65" לקו בלי."""
    return {f"{n}-{dn[n]}" if dn.get(n) else n for n in nums}


def line_numbers(text):
    """"קווים 16, 20, 350 לכיוון..." → {'16','20','350'}; "קו 3 משחמון" → {'3'};
    "וקווי התלמידים 80, 80א" → {'80','80א'} (מילה אחת שמתארת את הקווים לפני המספרים)."""
    out = set()
    text = _LINE_DNUM.sub(r"\1", text)
    for m in re.finditer(r"קו(?:ו?ים|ו?י)?\s*:?\s+(?:(?:ה)?(?:תלמידים|לילה|עירוניים|בינעירוניים|אקספרס|השירות|שירות)\s+)?((?:\d+[א-ת]?\s*(?:,|ו-?|-|/|\+|\s)\s*)*\d+[א-ת]?)", text):
        out.update(re.findall(r"\d+[א-ת]?", m.group(1)))
    # "קו 359 דימונה / 373 רחובות / 378 ת"א" — עוד מספרים אחרי לוכסן, כל אחד עם היעד שלו
    if out:
        out.update(re.findall(r"/\s*(\d{1,3}[א-ת]?)\s+(?=[א-ת])", text))
    return out


# שורה שמתחילה פריט חדש (ולא ממשיכה את המשפט שלפניה): מק"ט תחנה, "תחנות…", כותרת "המסלול החלופי…",
# "קו 5 …", תבליט
_NEW_ITEM = re.compile(r"^(?:\d{4,6}\b|תחנ|המסלול|מסלול חלופי|ו?קו(?:ו?ים|ו?י)?\s*:?\s*\d|[•*·▪-]\s|אין\s|ללא\s|בברכת|הנהלת)")
# הוראת נסיעה בלי "עד…" (קווים, אקסטרה, דן בדרום): פועל נסיעה או פנייה
_DRIVE = re.compile(r"(?:^|[\s:])(?:ו?(?:יפנה|יפנו|פונים|ייסע|ייסעו|יסעו|ימשיך|ימשיכו|ממשיכים|ממשיך|נוסעים|יציאה)|ו?ימינה|ו?שמאלה)(?=\s)")
# משפטים שמתארים את החסימה עצמה, לא את הדרך
_NOT_ROUTE = re.compile(r"^(?:חסימת|תתאפשר|ייחסם|יחסם|ייחסמו|יחסמו|ייסגר|יסגר|ייסגרו|הסדרי|בעקבות|עקב|במסגרת|החל|בימים|בלילות|ביום|מיום|"
                        r"בתאריכים|בתאריך|בין התאריכים|נוסעים נכבדים|לקוחות|לידיעת|מביאים|תבוטל|יבוטלו|תיחסם)")


# קיצור מסלול: "יסיים את מסלול נסיעתו בתחנה…", "מתחילים את הנסיעה ברח' X" (בלי פנייה) — לא עקיפה
_SHORT = re.compile(r"י?סיים(?:ו)? את מסלול|מסיימים\s+בתחנה|יתחיל(?:ו)? את מסלול|מתחילים את הנסיעה")
_TURN = re.compile(r"ימינה|שמאלה|יפנה|יפנו|פונים")


def _is_short(line):
    return bool(_SHORT.search(line)) and not _TURN.search(line)


def short_lines(desc):
    """הקווים שהמסלול שלהם מקוצר ("קו 37…: ויסיים את מסלול נסיעתו זמנית בתחנה זו"); '*' — בלי מספר קו;
    "1-2" — רק כיוון 2 של קו 1 ("לקוים 1-2 …: מתחילים את הנסיעה…", הוד השרון)."""
    out, cur = set(), set()
    for line in _logical_lines(desc):
        nums = line_numbers(line)
        if _is_short(line):
            out |= _with_dnum(nums, line_dnum(line)) or cur or {"*"}
        elif nums or re.match(r"^(?:המסלול החלופי|מסלול חלופי)", line):
            cur = _with_dnum(nums | (_header_numbers(line) if re.match(r"^(?:המסלול החלופי|ו?קו(?:ו?ים|ו?י)?\b)", line) else set()),
                             line_dnum(line))
    return out


def _logical_lines(desc):
    """שורות לוגיות: הודעות של מטרופולין שוברות משפט אחד לכמה שורות ("…עד לצומת א/ב, לא" ⏎ "פונים ימינה…").
    שורה ממשיכה את הקודמת כשהקודמת לא נגמרה בנקודה/נקודתיים והשורה לא מתחילה פריט חדש."""
    out, buf = [], ""
    for raw in (desc or "").split("\n"):
        line = raw.strip()
        if not line:
            if buf:
                out.append(buf)
            buf = ""
            continue
        if buf and not re.search(r"[.:!]\s*$", buf) and not _NEW_ITEM.match(line):
            buf += " " + line
        else:
            if buf:
                out.append(buf)
            buf = line
    if buf:
        out.append(buf)
    return out


def _header_numbers(line):
    """כותרת "המסלול החלופי לקוים 12 לכיוון מכללת לוינסקי, 604 לכיוון תל אביב:" — כל מספרי הקווים בה."""
    line = _LINE_DNUM.sub(r"\1", line)
    out = set(re.findall(r"(?<![\d/:.])(\d{1,3}(?:[א-ת](?![א-ת]))?)(?![\d/:.])", line))
    return {x for x in out if not re.match(r"^0", x)}


def _steps(rest):
    """רחובות הדרך מתוך המשך ההוראה (אחרי נקודת ההתחלה)."""
    # "ייסעו במסלול המקורי עד כביש המנהרות שמאלה…" (בלי צומת א/ב) — "במסלול המקורי עד" לא סוף העקיפה
    e = next((x for x in _END.finditer(rest) if not re.match(r"\s*עד\b", rest[x.end():])), None)
    if e:
        rest = rest[:e.start()]
    # "(אין המשך ישר לולנברג)" — הוראה שלילית בסוגריים, נמחקת כולה
    rest = re.sub(r"\((?:אין|ללא|לא)\s[^)]*\)", " ", rest)
    # הוראה שלילית ("לא פונים שמאלה לויצמן") נמחקת עד הפסיק; "לא X אלא Y" — נשאר Y
    rest = re.sub(r"(?:(?<=[\s,;(])|^)ו?לא\s[^,;)]*?(?=\sאלא\s|[,;)]|$)", "", rest)
    rest = re.sub(r"(?:(?<=[\s,;(])|^)אלא\s", "", rest)
    # מילות קישור בין פניות ("שמאלה לשדרות יצחק רבין ולאחר מכן שמאלה לכביש בגין צפון, ומשם ימשיך…",
    # ירושלים 20.10) — לא חלק משם הרחוב
    rest = re.sub(r"\s+ו?(?:לאחר מכן|אחר כך|אחרי כן|משם)(?=[\s,;]|$)", ",", rest)
    steps = []
    # פסיק, ו"ו" לפני פנייה, פנייה בלי פסיק לפניה ("המשך ביאליק ימינה אבא הלל"), ורשימה במקפים
    # ("ייסעו דרך חנה - אלי הכהן - גרוסברג", אקסטרה ירושלים)
    for tok in re.split(r",|;|\.\s|\s[-–]\s|\sו(?=(?:ימינה|שמאלה|ישר|המשך|יפנה|יפנו|ימשיך|ימשיכו|פונים))|\s(?=(?:ימינה|שמאלה|ישר)\s)", rest):
        t = tok.strip()
        # "פרסה בכיכר" — לא רחוב; "לא…" — הוראה שלילית; "עד X" באמצע ההוראה — סימון צומת, לא רחוב לנסוע בו
        if re.search(r"פרסה|סיבוב|יסתובב", t) or re.match(r"^(?:ו?לא|אלא|אין|עד)\b", t):
            continue
        # "הקווים בכיוון 1 יסעו דרך גולדה מאיר" — הרחוב הוא מה שאחרי הפועל
        t = re.sub(r"^\S.*?\s(?:ייסע|ייסעו|יסע|יסעו|יפנה|יפנו|ימשיך|ימשיכו)\s+(?=\S)", "", t)
        # "יוצאים ממסוף משה ארנס לרח' המכבים" — הרחוב הראשון הוא מה שאחרי "ל"
        y = re.match(r"^(?:יוצאים|יציאה|יוצא)\s+מ\S+.*?\s(?:לרח'|לרח׳|לרחוב|לשד'|לשדרות)\s*(\S.*)$", t)
        if y:
            t = y.group(1)
        if re.match(r"^ללא שינוי", t):
            continue
        # "משדרות בן גוריון יפנה ימינה…" / "יציאה ממקיף ב ימינה…" — מאיפה יוצאים, לא רחוב בדרך
        if re.search(r"\s(?:יפנה|יפנו|ימשיך|ימשיכו|ייסע|ייסעו|פונים)$", t) or re.match(r"^(?:יציאה|יוצאים|יוצא|נוסעים במסלול)\b", t):
            continue
        st = clean_street(t)
        # הוראת נתיב או שיקוע ("ייצמד לנתיבים", "יעברו דרך המנהרה", "לשיקוע") — לא רחוב
        # (רק בתחילת השם — "כביש המנהרות", "נתיבי איילון", "נתיב הל\"ה" הם רחובות)
        if re.match(r"^(?:ל|ב)?(?:היצמד|ייצמד|היצמדות|להיצמד|יש להיצמד)|^ל?ב?שיקוע(?:\s|$)|^להיכנס לשיקוע"
                    r"|^ל?ה?נתיב(?:ים)?\s+ה?(?:שמאלי|ימני)|^(?:יעבור|יעברו|ייכנס|ייכנסו)\b", st):
            continue
        # לא רחוב: "ייצא כרגיל", "על פי המסלולים הקיימים", 'ע"פ המסלול המקורי', "המשך" לבד, מספרי קווים
        # ("קווים 37", "37א", "11-2-0" של קווים)
        if (re.match(r"^ו?(?:ייצא|ייצאו|יצא|יצאו|ייסע|ייסעו|יסע|יסעו|המשך)(?:\s+כרגיל)?$", st) or "מסלול" in st or st.startswith("עד ")
                or re.match(r"^ו?קו(?:ו?ים|ו?י)?\s+\d", st) or re.fullmatch(r"[\d\s\-/,]+[א-ת]?", st) or "/" in st):
            continue
        # פועל בלי רחוב ("יפנה"), ומשפט שלם במקום שם רחוב (יותר מחמש מילים, או מספר תחנה/שעה) — לא שלב
        if (st and len(norm(st)) >= 2 and not re.match(r"^ו?(?:ישר|ימינה|שמאלה|יפנה|יפנו|ימשיך|ימשיכו|פונים|ממשיכים|ממשיך|נוסעים|בכיכר|בצומת|במסלול הרגיל|כרגיל)$", st)
                and len(st.split()) <= 5 and not re.search(r"מק\"?ט|תחנה|\d{3,}|:", re.sub(r"כביש\s+(?:מס['׳]?\s*)?\d+", "", st))):
            steps.append(st)
    return steps


def parse(desc):
    """פסקאות הוראה מתוך נוסח ההודעה: [{'lines': {...}, 'start': (A, B) או None, 'steps': [רחוב, ...], 'text': ...}].
    start=None — הוראה בלי "עד…" ("יפנו ימינה ל…"): היציאה מהמסלול היא במקום שבו הרחוב הראשון חוצה אותו."""
    out = []
    cur_lines = set()
    cur_dir = None
    cur_dnum = {}       # {קו: כיוון} מהכותרת ("לקו 4-3")
    stops_mode = None   # אחרי "תחנות מבוטלות:" — המק"טים שייכים לפסקה האחרונה
    prev_hdr = False    # השורה הקודמת הייתה כותרת "קו N לכיוון…:"
    for line in _logical_lines(desc):
        was_hdr, prev_hdr = prev_hdr, False
        # "תחנות מבוטלות:" / "תחנות זמניות חלופיות:" — המק"טים שאחריהן (או באותה שורה: "האצ"ל/ נוף חרמון
        # (תחנה 53696), …", קריית שמונה) שייכים לפסקה האחרונה: rm — מבוטלות, add — חלופיות (תל אביב 20.10,
        # אבן גבירול: התחנה החלופית של קו 149 היא התחנה המבוטלת של קו 445)
        hdr = re.match(r"^\s*תחנ(?:ה|ות)\b[^:]{0,25}?(מבוטל|בוטל|חלופי)", line)
        if hdr:
            stops_mode = ("add" if hdr.group(1) == "חלופי" else "rm") if out else None
            if stops_mode and ":" in line:
                # מק"ט של 3–6 ספרות ("תחנה מבוטלת: 3007 – שערי ירושלים/ליפתא", ירושלים)
                # כשכתוב "(תחנה 38428)" — רק אלה; מספר אחרי "כביש"/"מס'" הוא כביש, לא תחנה (ראשון לציון, יהוד 20.10)
                tail = line.split(":", 1)[1]
                cs = re.findall(r"תחנה\s+(\d{3,6})(?!\d)", tail) or re.findall(
                    r"(?<![\d./:])\d{3,6}(?![\d./:])", re.sub(r"(?:כביש|מס['׳]?)\s*(?:מס['׳]?\s*)?\d+", " ", tail))
                for c in cs:
                    out[-1].setdefault(stops_mode, set()).add(c)
            continue
        # מק"ט בתחילת שורה; של 3 ספרות רק כשאחריו מקף ושם תחנה — "143 לכיוון חולון:" הוא מספר קו (בת ים 20.10)
        code = re.match(r"^\s*(\d{4,6})(?!\d)(?![./:])", line) or re.match(r"^\s*(\d{3})\s*[-–]\s*\S", line)
        if code and stops_mode:
            out[-1].setdefault(stops_mode, set()).add(code.group(1))
            continue
        nums = line_numbers(line)
        # הכיוון ("לכיוון עתידים:", "מכיוון עתידים:") — מהכותרת שלפני הנקודתיים, כשיש בה כיוון אחד בלבד
        # "קו: 3 מכיוון הטייסים:" (שתי כותרות שהתחברו לשורה אחת) — כל מה שלפני הנקודתיים האחרונות, בלי שעות
        # (תל אביב 20.10, קרליבך: בלי זה הפסקה של "מכיוון" נשארה בלי כיוון ונבחרה לשני הכיוונים)
        segs = re.sub(r"\b\d{1,2}:\d{2}\b", " ", line).split(":")
        head = " ".join(segs[:-1]) if len(segs) > 1 else line
        dirs = re.findall(r"(ל|מ)כיוון\s+([^:()]{2,60})", head)
        line_dir = (("to" if dirs[0][0] == "ל" else "from"), dirs[0][1].strip()) if len(dirs) == 1 else None
        # "קו 201 מתל אביב-יפו לרחובות:" — בלי המילה "לכיוון" (אגד, 20.10)
        if not line_dir and ":" in line:
            h2 = re.sub(r"\([^)]*\)", " ", head)
            h2 = re.sub(r"^.*?קו(?:ו?ים|ו?י)?\s+(?:(?:ה)?\S+\s+)?[\d\sא-ת,'׳\"]*?\d[א-ת]?['׳]?\s+", "", h2)
            fm = re.match(r"^מ(\S.*?)\s+ל(\S.*?)\s*$", h2.strip())
            if fm:
                line_dir = ("to", fm.group(2))
        # תאריכים ושעות ("29/10/2026", "17:00") נראים כמו צומת "א/ב" — מוחקים לפני החיפוש
        clean = re.sub(r"\b\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\b|\b\d{1,2}:\d{2}\b", " ", line)
        # "עד כיכר פעולות האיבה (יהודה הלוי/ האצ"ל)" — שם הכיכר לא רחוב; הצומת הוא מה שבסוגריים (קריית שמונה 19.10)
        clean = re.sub(r"(עד\s+(?:ל)?(?:ה)?(?:כיכר|צומת)\s+)[^,()/]{2,40}?\s*\(([^()/]{2,30}/[^()]{2,30})\)", r"\1\2", clean)
        m = _START.search(clean)
        body = re.sub(r"^.*?מסלול חלופי\s*:?\s*", "", clean) if "מסלול חלופי" in clean else clean
        driving = bool(_DRIVE.search(" " + body)) and not _NOT_ROUTE.match(body.strip())
        if _is_short(line):
            continue
        # "המסלול החלופי לכל שאר הקוים:" — פסקה בלי קווים (חלה על כל מי שאין לו פסקה משלו)
        if re.match(r"^(?:המסלול החלופי|מסלול חלופי)\s+ל?(?:כל\s+)?(?:שאר|יתר)\s+ה?קו", line):
            cur_lines, cur_dir, cur_dnum = set(), None, {}
            continue
        # כותרת ("קו 5 לכיוון…:", "המסלול החלופי לקוים 12 לכיוון…, 604 לכיוון…:") — חלה על השורות הבאות
        if not m and not driving:
            if nums or re.match(r"^(?:המסלול החלופי|מסלול חלופי)", line):
                hdr = nums | (_header_numbers(line) if re.match(r"^(?:המסלול החלופי|ו?קו(?:ו?ים|ו?י)?\b)", line) else set())
                own = bool(re.match(r"^ו?קו(?:ו?ים|ו?י)?\s*:?\s*\d[^:]*:\s*$", line))
                if hdr and was_hdr and own:
                    # כמה כותרות ברצף ("קו 63 לכיוון ספיר:" ⏎ "קו 64 לכיוון ספיר:") — ההוראה שאחריהן לכולן
                    cur_lines = cur_lines | hdr
                    cur_dir = cur_dir if cur_dir == line_dir else None
                    dn = line_dnum(line)
                    cur_dnum = {k: v for k, v in {**cur_dnum, **dn}.items() if cur_dnum.get(k, v) == dn.get(k, v)}
                    prev_hdr = True
                elif hdr:
                    cur_lines = hdr
                    cur_dir = line_dir
                    cur_dnum = line_dnum(line)
                    prev_hdr = own
            elif line_dir and len(line) < 60:
                cur_dir = line_dir   # "מכיוון עתידים:" בשורה משלה (דן)
            continue
        if _NOT_ROUTE.match(clean):
            continue
        if m:
            start = tuple(re.sub(r"^(?:תחנת|התחנה)\s+", "", clean_street(g)) for g in (m.group(1), m.group(2)))
            rest = clean[m.end():]
        else:
            start = None
            rest = body
            # "קו 5 לכיוון X: יפנה…" באותה שורה — מה שאחרי הנקודתיים
            if ":" in rest and nums:
                rest = rest.split(":", 1)[1]
        steps = _steps(rest)
        if start is None and len(steps) < 1:
            continue
        if steps:
            out.append({"lines": set(nums or cur_lines), "start": start, "steps": steps, "text": line,
                        "dir": (line_dir if ":" in line else None) or cur_dir,
                        "dnum": line_dnum(line) if nums else cur_dnum})
            stops_mode = None
    return out


def template(desc, paras=None):
    """לאיזה סוג הודעה הנוסח הכי קרוב (שלמה 19.10) — ולפיו איך מחפשים את המסלול:
      junction  "עד צומת א/ב, ימינה X, שמאלה Y…" — יוצאים מהמסלול בצומת, ואז רחוב אחרי רחוב
      turns     "יפנו ימינה ל-X, שמאלה ל-Y…" בלי צומת — יוצאים איפה שהרחוב הראשון חוצה את המסלול
      short     "יסיים את מסלול נסיעתו בתחנה…" — הקו מקוצר, בלי עקיפה
      skip      "ידלג על תחנה…" — הקו נשאר במסלול, רק תחנה בוטלה
      stops     רשימת תחנות שבוטלו בלבד, בלי תיאור של דרך
      general   הודעה כללית (אירוע, עומס) בלי תחנות ובלי דרך"""
    paras = parse(desc) if paras is None else paras
    if any(p["start"] for p in paras):
        return "junction"
    if paras:
        return "turns"
    t = desc or ""
    if short_lines(t):
        return "short"
    # "יעברו דרך המנהרה בשיקוע" — אותו רחוב מתחת לצומת, הקו לא יוצא מהמסלול
    if re.search(r"ידלג|ידלגו|דילוג|(?:יעבור|יעברו) דרך (?:ה)?מנהר|ימשי(?:ך|כו) ישר ב(?:ה)?שיקוע", t):
        return "skip"
    if re.search(r"(?<!\d)\d{5}(?!\d)|תחנ(?:ה|ות) (?:מבוטל|בוטל)", t):
        return "stops"
    return "general"


# ------------------------------------------------------------------ גרף רחובות
LAT0 = 31.5


def _one_edit(a, b):
    """האם a ו-b שונים באות אחת לכל היותר (החלפה, הוספה, מחיקה או שתי אותיות שהתחלפו)."""
    if a == b:
        return True
    if len(a) == len(b):
        diff = [i for i in range(len(a)) if a[i] != b[i]]
        return len(diff) == 1 or (len(diff) == 2 and diff[1] == diff[0] + 1 and a[diff[0]] == b[diff[1]] and a[diff[1]] == b[diff[0]])
    if len(a) > len(b):
        a, b = b, a
    i = 0
    while i < len(a) and a[i] == b[i]:
        i += 1
    return a[i:] == b[i + 1:]


def meters(a, b):
    kx = 111320 * math.cos(math.radians((a[0] + b[0]) / 2))
    return math.hypot((a[1] - b[1]) * kx, (a[0] - b[0]) * 110574)


class Streets:
    """רשת הרחובות מתשובת Overpass (out geom): צומת = נקודה משותפת בין שני רחובות."""

    def __init__(self, ways):
        self.pos = {}
        self.adj = collections.defaultdict(list)
        self.adj_any = collections.defaultdict(list)   # בלי חד-סטרי — רק כשהדרך לפי החד-סטרי מסתובבת
        self.by_name = collections.defaultdict(set)
        self.names = set()
        for tags, geom in ways:
            name = tags.get("name", "")
            hw = tags.get("highway", "")
            ow = tags.get("oneway")
            rb = tags.get("junction") in ("roundabout", "circular")
            fwd, back = True, not (ow in ("yes", "true", "1") or rb or hw in ("motorway", "motorway_link"))
            if ow == "-1":
                fwd, back = False, True
            nodes = [(round(p[0], 6), round(p[1], 6)) for p in geom]
            for n in nodes:
                self.pos[n] = n
            # שם הרחוב, וגם מספר הכביש ("כביש 461") — ההודעות כותבות כבישים בין-עירוניים במספר
            nn = {x for x in [norm(name)] + [f"כביש {r.strip()}" for r in re.split(r"[;,]", tags.get("ref", "")) if r.strip().isdigit()] if x}
            for x in nn:
                self.names.add(x)
                self.by_name[x].update(nodes)
            nn = frozenset(nn)
            for a, b in zip(nodes, nodes[1:]):
                d = meters(a, b)
                if fwd:
                    self.adj[a].append((b, d, nn, hw))
                if back:
                    self.adj[b].append((a, d, nn, hw))
                self.adj_any[a].append((b, d, nn, hw))
                self.adj_any[b].append((a, d, nn, hw))

    def match(self, street):
        """השמות ברשת שמתאימים לרחוב מההודעה ("לדנמרק" → "דנמרק", "ז'בוטינסקי" → "זבוטינסקי")."""
        s = norm(street)
        cands = [s]
        # "לדרך הרים" → "דרך הרים" → "הרים": אחרי הורדת ל/ב/ו מנרמלים שוב, כדי שגם "דרך"/"שדרות"
        # שאחריה ירדו (אילת, 18.10: לא נמצא מסלול לקווים 5, 32, 80)
        if len(s) > 3 and s[0] in "לבומ":
            cands.append(norm(s[1:]))
        # "א"ס בית"ר" — במפה "דרך אגודת ספורט בית"ר" (ירושלים 19.10)
        cands += [norm(re.sub(r"(^|\s)ל?אס(?=\s)", r"\1אגודת ספורט", c)) for c in list(cands) if re.search(r"(^|\s)ל?אס\s", c)]
        if len(s) > 4 and s[:2] in ("לה", "בה"):
            cands.append(norm(s[1:]))
        # "לכביש בגין" — במפה "שדרות מנחם בגין" (ירושלים 20.10): "כביש" לפני שם, לא לפני מספר
        cands += [norm(re.sub(r"^ל?כביש\s+(?=[א-ת])", "", c)) for c in list(cands) if re.match(r"^ל?כביש\s+[א-ת]", c)]
        out = set()
        for c in cands:
            if len(c) < 2:
                continue
            for n in self.names:
                if n == c or set(n.split(" ")) == set(c.split(" ")) or (len(c) >= 3 and (c in n.split(" ") or n.endswith(" " + c) or n.startswith(c + " ") or (len(c) >= 5 and c in n))):
                    out.add(n)
        # כינוי במקום השם הפרטי ("מוטה גור" — במפה "מרדכי גור", גבעת שמואל 19.10): שם המשפחה,
        # כשיש במפה רחוב אחד בלבד שנגמר בו ושהשם הפרטי שלו מתחיל באותה אות
        if not out:
            for c in cands:
                w = c.split(" ")
                if len(w) == 2 and len(w[1]) >= 3:
                    hit = {n for n in self.names if len(n.split(" ")) == 2 and n.split(" ")[1] == w[1] and n[0] == c[0]}
                    if len(hit) == 1:
                        out |= hit
        # שגיאת כתיב של אות אחת ("שמפפר", "שמטפפר" — שטמפפר)
        if not out:
            for c in cands:
                if len(c) >= 5:
                    k = len(c.split())
                    out |= {n for n in self.names
                            if any(abs(len(x) - len(c)) <= 1 and _one_edit(x, c) for x in (n, " ".join(n.split()[-k:])))}
        return out

    def nodes_of(self, names):
        out = set()
        for n in names:
            out |= self.by_name.get(n, set())
        return out

    def near(self, nodes_a, nodes_b, tol=40):
        """צמתים של רחוב א' בטווח tol מ' מרחוב ב' (שדרה מפוצלת / כיכר בלי שם)."""
        grid = collections.defaultdict(list)
        for q in nodes_b:
            grid[(int(q[0] * 2000), int(q[1] * 2000))].append(q)
        out = set()
        for p in nodes_a:
            cx, cy = int(p[0] * 2000), int(p[1] * 2000)
            if any(meters(p, q) < tol for dx in (-1, 0, 1) for dy in (-1, 0, 1) for q in grid.get((cx + dx, cy + dy), ())):
                out.add(p)
        return out

    def dijkstra(self, src, names, targets, pen=6.0, limit=12000, any_dir=False, no_tunnel=False):
        """הדרך הקצרה מ-src לאחד היעדים, כשקטע שלא ברחוב הנוכחי עולה פי pen.
        src — צומת, או {צומת: עלות התחלה} כשיש כמה נקודות יציאה (שדרה עם שני מסלולים חד-סטריים)."""
        srcs = src if isinstance(src, dict) else {src: 0.0}
        best = None
        dist = dict(srcs)
        prev = {}
        pq = [(c, n) for n, c in srcs.items()]
        heapq.heapify(pq)
        while pq:
            d, u = heapq.heappop(pq)
            if d > dist.get(u, 1e18):
                continue
            if u in targets:
                # targets כמילון {צומת: תוספת} — יעד מאוחר במסלול עולה יותר; ממשיכים עד שאין יעד זול יותר
                extra = targets[u] if isinstance(targets, dict) else 0.0
                if best is None or d + extra < best[0]:
                    best = (d + extra, u, d)
                if not isinstance(targets, dict):
                    break
            if best is not None and d > best[0]:
                break
            if d > limit:
                break
            for v, w, nm, hw in (self.adj_any if any_dir else self.adj)[u]:
                c = w * (1 if nm & names else pen) + (500 if hw in ("service", "track", "footway", "path") else 0)
                # "לא להיכנס לשיקוע" — מנהרה רק אם אין דרך אחרת (תל אביב 20.10, מנהרת קרליבך)
                if no_tunnel and any(x.startswith("מנהרת") for x in nm):
                    c *= 20
                nd = d + c
                if nd < dist.get(v, 1e18):
                    dist[v] = nd
                    prev[v] = u
                    heapq.heappush(pq, (nd, v))
        if best is not None:
            path = [best[1]]
            while path[-1] in prev:
                path.append(prev[path[-1]])
            return path[::-1], best[2]
        return None, None


def cut_range(shape, stops, slack=30.0):
    """הקטע המבוטל על השרטוט: מהתחנה המבוטלת הראשונה עד האחרונה. קו שעובר באותו רחוב פעמיים (הלוך
    ובחזרה בלולאה) — לכל תחנה כמה מקומות אפשריים, ובוחרים את הקטע הקצר ביותר שמכיל את כולן
    (חולון 20.10, קו 22: התחנה בהסתדרות/ויצמן "נפלה" על המעבר השני, והקטע הסגור יצא קילומטרים)."""
    stops = [q for q in stops if q]
    if not stops:
        return None
    ev = []
    for k, q in enumerate(stops):
        d = [meters(p, q) for p in shape]
        lim = min(d) + slack
        ev += [(i, k) for i, x in enumerate(d) if x <= lim]
    ev.sort()
    need, cnt, have, best, j = len(stops), collections.Counter(), 0, None, 0
    for i, k in ev:
        cnt[k] += 1
        have += cnt[k] == 1
        while have == need:
            lo = ev[j][0]
            if best is None or i - lo < best[1] - best[0]:
                best = (lo, i)
            kk = ev[j][1]
            cnt[kk] -= 1
            have -= cnt[kk] == 0
            j += 1
    return list(best)


def _first_pass(idx, dist, last=False):
    """קו שעובר באותה צומת פעמיים (נכנס לשכונה ויוצא באותה דרך): מבין המקומות הקרובים על השרטוט — המעבר
    הראשון אחרי הקטע הסגור (או האחרון לפניו, ביציאה), ובתוכו הנקודה הקרובה (קריית שמונה 20.10, האצ"ל)."""
    idx = sorted(idx)
    runs, cur = [], [idx[0]]
    for i in idx[1:]:
        if i - cur[-1] > 3:
            runs.append(cur)
            cur = []
        cur.append(i)
    runs.append(cur)
    return min(runs[-1 if last else 0], key=dist.get)


def _opposite(seg, d):
    """קטע של השרטוט שנוסעים בו בכיוון ההפוך ל-d (זווית של יותר מ-120°). פנייה בניצב — לא הפוך."""
    (a, b), k = seg, 0.84   # cos(קו רוחב 33°) — מעלות אורך קצרות ממעלות רוחב
    u = (b[0] - a[0], (b[1] - a[1]) * k)
    v = (d[0], d[1] * k)
    nu, nv = math.hypot(*u), math.hypot(*v)
    return nu > 0 and nv > 0 and (u[0] * v[0] + u[1] * v[1]) / (nu * nv) < -0.5


def _despike(path):
    """הלוך-חזור באותה דרך בתוך המסלול (נכנס לרחוב צדדי וחוזר, בין שתי פניות) — לא נסיעה אמיתית,
    רק תוצאה של חיבור שני קטעים בצומת (ירושלים 20.10, קו 616 בהרצל/יצחק רבין)."""
    out = []
    for p in path:
        if out and p == out[-1]:
            continue
        if len(out) >= 2 and p == out[-2]:
            out.pop()
            continue
        out.append(p)
    return out


def _length(path):
    return sum(meters(a, b) for a, b in zip(path, path[1:]))


def seg_dist(p, a, b):
    kx = 111320 * math.cos(math.radians(p[0]))
    ax, ay = (a[1] - p[1]) * kx, (a[0] - p[0]) * 110574
    bx, by = (b[1] - p[1]) * kx, (b[0] - p[0]) * 110574
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, -(ax * dx + ay * dy) / L))
    return math.hypot(ax + t * dx, ay + t * dy)


def dir_fits(para, to):
    """האם הכיוון שבפסקה מתאים ליעד של הקו: True / False, או None כשאין בפסקה כיוון או שאי אפשר לדעת."""
    d = para.get("dir")
    if not d or not to:
        return None
    # "לכיוון חולון, פתח תקווה" (שני קווים, יעד לכל אחד) — מספיק שאחד מהם מתאים
    words = [w for part in re.split(r",|/|\sו", d[1]) for w in norm(part.replace("-", " ")).split() if len(w) >= 3]
    if not words:
        return None
    # כתיב מלא וחסר: "רידינג" בהודעה, "מסוף רדינג" ביעד
    def bare(x):
        return re.sub(r"(?<=\S)[יו](?=\S)", "", x)
    dest = bare(norm(to.replace("-", " ")))
    hit = any(bare(w) in dest for w in words)
    return hit if d[0] == "to" else not hit


def _plan(net, steps):
    """הרחובות שאפשר לנתב בהם, כל אחד עם השמות שלו במפה. "ישראל גלילי ולוי אשכול" — שני רחובות;
    רחוב שלא נמצא במפה (שם של מחלף, כביש מחוץ לאזור) נשמט, כל עוד רוב הרחובות נמצאו; אותו רחוב
    פעמיים ברצף ("ימינה בגין, המשך שמאלה לכיון בגין") — פעם אחת."""
    out = []
    missing = 0
    for st in steps:
        names = net.match(st)
        parts = [(st, names)] if names else []
        if not names:
            sub = [clean_street(x) for x in re.split(r"\s+ו(?=[א-ת])", st)]
            if len(sub) > 1 and all(net.match(x) for x in sub):
                parts = [(x, net.match(x)) for x in sub]
        missing += not parts
        for x, nm in parts:
            if not out or out[-1][1] != nm:
                out.append((x, nm))
    # רחוב אחד לכל היותר שלא נמצא, ורק כשבהוראה שלושה רחובות ומעלה. בהוראה של שניים, רחוב חסר
    # הוא חצי מהדרך, והמסלול יוצא סיבוב בכיכר (גבעת שמואל 19.10)
    if not out or missing > (1 if len(steps) >= 3 else 0):
        return None
    return out


def _densify(pts, step=6.0):
    out = []
    for a, b in zip(pts, pts[1:]):
        n = max(1, int(meters(a, b) / step))
        out += [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n)]
    return out + pts[-1:]


def _exit_point(net, para, shape, cut0, cut1, first):
    """נקודת היציאה מהמסלול: (מקום על השרטוט, הצמתים ברחוב הראשון שליד המקום, i_out) או None."""
    if para.get("start"):
        # צומת היציאה ("עד א/ב"): הנקודות של שני רחובות הצומת שקרובות זו לזו וגם קרובות למסלול, לפני
        # הקטע המבוטל או בתוכו (התחנה המבוטלת הראשונה יכולה להיות לפני הצומת)
        a, b = para["start"]
        na, nb = net.match(a), net.match(b)
        lo = max(0, cut0 - 400)
        before = shape[lo:cut1 + 1]
        if na and nb and before:
            jn = net.near(net.nodes_of(na), net.nodes_of(nb), 40) | net.near(net.nodes_of(nb), net.nodes_of(na), 40)
            dense = _densify(before[::2])
            near_route = [n for n in jn if min(meters(n, q) for q in dense) < 70]
            if near_route:
                # כמה מקומות על המסלול (קו שעובר באותו צומת פעמיים) — זה שהכי קרוב לתחילת הקטע המבוטל
                at = {n: min(range(len(before)), key=lambda i: meters(before[i], n)) for n in near_route}
                pick = min(near_route, key=lambda n: abs(at[n] - (cut0 - lo)))
                near_route = [n for n in near_route if meters(n, pick) < 60]
                cpt = (sum(n[0] for n in near_route) / len(near_route), sum(n[1] for n in near_route) / len(near_route))
                start_c = [n for n in net.nodes_of(first) if meters(n, cpt) < 60 and net.adj[n]]
                if start_c:
                    return cpt, start_c, lo + min(range(len(before)), key=lambda i: meters(before[i], cpt))
    # בלי "עד…" (קווים, אקסטרה), או שהצומת לא נמצא: יוצאים מהמסלול איפה שהרחוב הראשון בהוראה חוצה
    # אותו — הנקודה הקרובה ביותר לקטע הסגור, מתוך 1.5 ק"מ לפניו
    lo = max(0, cut0 - 150)
    before = shape[lo:cut0 + 1]
    if not before:
        return None
    hits = [(i, n) for n in net.nodes_of(first) for i in [min(range(len(before)), key=lambda k: meters(before[k], n))]
            if meters(before[i], n) < 30]
    if not hits:
        return None
    far = sum(meters(x, y) for x, y in zip(before, before[1:]))
    best_i = max(i for i, _ in hits)
    if far > 1500 and sum(meters(x, y) for x, y in zip(before[best_i:], before[best_i + 1:])) > 1500:
        return None
    near_route = [n for i, n in hits if i == best_i]
    cpt = (sum(n[0] for n in near_route) / len(near_route), sum(n[1] for n in near_route) / len(near_route))
    start_c = [n for n in net.nodes_of(first) if meters(n, cpt) < 60 and net.adj[n]]
    if not start_c:
        return None
    return cpt, start_c, lo + best_i


def _trim_shared(path, shape, i_out, i_in, cut1=None, tol=15.0):
    """המסלול החלופי מתחיל איפה שהוא באמת עוזב את המסלול הרגיל, ונגמר איפה שהוא חוזר אליו. בלי זה
    נקודת היציאה (הקרובה לצומת) יכולה ליפול בצד השני של הכיכר, והקו הכתום חוזר לאורך האפור
    (אילת 20.10, קו 5 בכיכר עין יהב/ששת הימים)."""
    lo, hi = max(0, i_out - 300), min(len(shape), i_in + 300)
    # רק המסלול הרגיל שלפני הקטע הסגור ואחריו: קו שעובר באותו רחוב פעמיים (בקטע הסגור ואחריו) "חזר" לתוך
    # הקטע הסגור (חולון 20.10, קו 22)
    c1 = i_in if cut1 is None else max(lo, min(cut1, i_in))
    rngs = [range(lo, min(i_out + 1, c1) - 1), range(c1, hi - 1)]

    # רק קטע של המסלול הרגיל שנוסעים בו באותו כיוון: קו שעושה לולאה וחוזר באותו רחוב בכיוון ההפוך —
    # העקיפה שנוסעת בו בכיוון ההלוך היא לא "חזרה למסלול" (קריית שמונה 20.10, קו 5 ביקותיאל אדם)
    def same_way(i, d):
        return not _opposite((shape[i], shape[i + 1]), d)

    def heading(k):
        a, b = (path[k], path[k + 1]) if k + 1 < len(path) else (path[k - 1], path[k])
        return (b[0] - a[0], b[1] - a[1])

    def off(k):
        d = heading(k)
        return min((seg_dist(path[k], shape[i], shape[i + 1]) for r in rngs for i in r if same_way(i, d)), default=1e9)

    k = 0
    while k < len(path) - 2 and off(k + 1) < tol:
        k += 1
    m = len(path) - 1
    while m > k + 1 and off(m - 1) < tol:
        m -= 1
    if k == 0 and m == len(path) - 1:
        return path, i_out, i_in
    # הכיוון שבו העקיפה נסעה לאורך המסלול הרגיל בחלק שנחתך — הוא הכיוון של המסלול בנקודת החיבור
    d_out = (path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]) if k > 0 else None
    d_in = (path[m + 1][0] - path[m][0], path[m + 1][1] - path[m][1]) if m + 1 < len(path) else None
    path = path[k:m + 1]

    def near(j, a, b):
        # הנקודה הקרובה; כשיש שתיים קרובות כמעט באותה מידה (הלוך וחזור באותו רחוב) — זו שבאותו כיוון
        d = (d_out if j == 0 else d_in) or heading(j)
        dist = {i: meters(shape[i], path[j]) for i in range(a, b)}
        best = min(dist.values())
        cands = [i for i in dist if dist[i] <= max(best + 25, 45) and (i + 1 >= len(shape) or same_way(i, d))]
        return _first_pass(cands, dist, last=j == 0) if cands else min(dist, key=dist.get)
    i_out = near(0, lo, min(hi, i_in))
    a = max(i_out + 1, c1)
    i_in = near(len(path) - 1, a, hi) if a < hi else i_in
    return path, i_out, i_in


def route_detour(net, para, shape, cut0, cut1, max_len=15000):
    """מסלול לפי פסקת הוראה אחת, לקו שהשרטוט שלו shape ([lat,lon]) והקטע המבוטל שלו cut0..cut1.

    מחזיר {'path','i_out','i_in','streets','len'} או None כשאי אפשר לנתב לפי הנוסח."""
    plan = _plan(net, para["steps"])
    tail = shape[cut1 + 1:]
    if not plan or not tail:
        return None
    ex = _exit_point(net, para, shape, cut0, cut1, plan[0][1])
    # "הקו ימשיך בשדרות X, יפנה ימינה ל-Y…" כש-X לא נמצא במפה: הרחוב הראשון שנמצא לא נוגע במסלול — יוצאים
    # רגע לפני הקטע הסגור, וממשיכים ישר עד Y (ירושלים 20.10, קו 616 בשערי ירושלים)
    if not ex and not para.get("start") and para["steps"] and not net.match(para["steps"][0]):
        i0 = max(0, cut0 - 3)
        cpt = tuple(shape[i0])
        start_c = [n for n in net.near(set(net.pos), [cpt], 40) if net.adj[n]]
        if start_c:
            ex = (cpt, start_c, i0)
    if not ex:
        return None
    cpt, start_c, i_out = ex
    # כל הצמתים של הרחוב הראשון ליד היציאה, לא רק הקרוב: בשדרה עם שני מסלולים הקרוב יכול להיות
    # במסלול של הכיוון ההפוך, ואז הדרך עוברת לאורך כל הרחוב וחוזרת (רחובות 19.10, קו 10 ברחוב הרצל)
    src = {n: meters(n, cpt) * 3 for n in start_c}
    # החזרה למסלול: צמתים שעל השרטוט אחרי הקטע המבוטל
    dense_tail = _densify(tail[:600])
    back = net.near(set(net.pos), dense_tail, 12) or net.near(set(net.pos), dense_tail, 30)
    # החזרה למסלול כמה שיותר קרוב לסוף הקטע הסגור: כל מטר לאורך המסלול אחרי הקטע הסגור עולה כמו
    # מטר נסיעה. בלי זה הניתוב "חזר" לחלק מאוחר של הקו ודילג על הרחוב שבהודעה (חולון 20.10, קו 22)
    along, acc = [], 0.0
    for a, b in zip(dense_tail, dense_tail[1:] + dense_tail[-1:]):
        along.append(acc)
        acc += meters(a, b)
    grid = collections.defaultdict(list)
    for k, q in enumerate(dense_tail):
        grid[(int(q[0] * 2000), int(q[1] * 2000))].append(k)

    def tail_pos(n):
        cx, cy = int(n[0] * 2000), int(n[1] * 2000)
        ks = [k for dx in (-1, 0, 1) for dy in (-1, 0, 1) for k in grid.get((cx + dx, cy + dy), ())]
        return min((along[k] for k in ks if meters(n, dense_tail[k]) < 35), default=acc)
    back = {n: tail_pos(n) for n in back}
    legs, streets, cur = [], [], src
    no_tunnel = bool(re.search(r"(?:לא|אין)\s+(?:להיכנס|לרדת|לנסוע)?\s*(?:ל|ב)?(?:שיקוע|מנהרה)", para.get("text", "")))
    for k, (st, names) in enumerate(plan):
        cur_set = set(cur) if isinstance(cur, dict) else {cur}
        if k + 1 < len(plan):
            nodes_next = net.nodes_of(plan[k + 1][1])
            tg = net.near(net.nodes_of(names), nodes_next, 40) - cur_set
            # הרחוב הבא לא נוגע בזה במפה (ההודעה דילגה על רחוב קצר) — נוסעים אליו בדרך הקצרה
            if not tg:
                tg = nodes_next - cur_set
        else:
            tg = {n: c for n, c in back.items() if n not in cur_set}
        if not tg:
            return None
        p, c = net.dijkstra(cur, names, tg, no_tunnel=no_tunnel)
        # הדרך לפי החד-סטרי מסתובבת ברחובות שלא בהודעה (פנייה שמאלה שלא מחוברת במפה, ואז לולאה של
        # קילומטר וחצי מעבר לאיילון — תל אביב 20.10, בגין ← קפלן): מציירים את הפנייה כמו שכתוב בהודעה
        if not p or c > 1.5 * _length(p) + 100:
            p2, c2 = net.dijkstra(cur, names, tg, any_dir=True, no_tunnel=no_tunnel)
            if p2 and (not p or c2 * 2 < c):
                p = p2
        if not p:
            return None
        legs.append(p)
        streets.append(st)
        cur = p[-1]
    path = _despike([n for leg in legs for n in leg])
    # המקום על השרטוט שבו העקיפה חוזרת — מבין הקטעים שנוסעים בהם באותו כיוון (לולאה שחוזרת באותו רחוב)
    d = (path[-1][0] - path[-2][0], path[-1][1] - path[-2][1]) if len(path) > 1 else (0, 0)
    dist = dict(enumerate(meters(q, cur) for q in tail[:1200]))
    lim = max(min(dist.values()) + 25, 45)
    near_i = [i for i in range(len(dist) - 1) if dist[i] <= lim and not _opposite((tail[i], tail[i + 1]), d)]
    i_in = cut1 + 1 + (_first_pass(near_i, dist) if near_i else min(dist, key=dist.get))
    path, i_out, i_in = _trim_shared(path, shape, i_out, i_in, cut1)
    # העקיפה לא חוזרת למסלול אחרי הקטע הסגור (נגמרת באמצעו) — כנראה הפסקה של הכיוון ההפוך
    # (תל אביב 20.10, דיזנגוף, קו 2 להארגזים: סיבוב של 1.4 ק"מ שחזר לאותה נקודה)
    # (60 מ' — נקודת החיבור נבחרת עד 45 מ' מסוף העקיפה, במעבר הראשון)
    if i_out >= cut1 or meters(path[-1], shape[i_in]) > 60:
        return None
    length = sum(meters(x, y) for x, y in zip(path, path[1:]))
    if length > max_len:
        return None
    return {"path": [[round(p[0], 6), round(p[1], 6)] for p in [tuple(shape[i_out])] + path + [tuple(shape[i_in])]],
            "i_out": i_out, "i_in": i_in, "streets": streets, "len": round(length)}


def simplify(pts, tol=4.0):
    """דאגלס-פויקר במטרים — שרטוט של 1,300 נקודות יורד לכמה מאות בלי לשנות את הצורה."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        best, bi = 0, None
        for k in range(i + 1, j):
            d = seg_dist(pts[k], pts[i], pts[j])
            if d > best:
                best, bi = d, k
        if bi is not None and best > tol:
            keep[bi] = True
            stack += [(i, bi), (bi, j)]
    return [p for p, k in zip(pts, keep) if k]
