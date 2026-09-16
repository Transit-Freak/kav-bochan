# -*- coding: utf-8 -*-
"""הד של שינוי שכבר נכנס לקו — לא שינוי חדש (שלמה 16.09).

ב-19.07.2026 העביר משרד התחבורה את התחנות "חטיבת הנגב/…" ל"שד' הפלמ"ח/…" ב-47 חלופות של
קווי אשדוד. ב-13.09 אותו שינוי בדיוק (אותן תחנות נוספו, אותן תחנות ירדו) הופיע גם בחלופות
שחזרו לרישום עם שנת הלימודים (350-1-6, 351-1-1, 451-2-2…). מבחינת הנוסע לא קרה שום דבר
חדש, אבל האתר רשם "שינוי מסלול" ושלח התראה שוב — "לא הגיוני שהשינוי הזה פעמיים".

הכלל: אירוע מסלול (route / stops / extend / shorten / terminal / redraw) שהתחנות שנוספו
והתחנות שירדו בו זהות לאירוע מוקדם יותר באותו קו (אותו מספר קו ואותו מפעיל, בכל חלופה),
בתוך 180 יום ולא באותו יום — מקבל echo: {'d': תאריך המקור, 'rd': החלופה שבה נכנס}.
האתר מציג "אותו שינוי כבר נכנס לקו ב-…" ולא מונה אותו בשינויים לפי יום; ההתראות מדלגות עליו.
הסימון מחושב מחדש בכל ריצה (אידמפוטנטי): נוסף כשמתאים, נמחק כשהבסיס נעלם. DRY=1 להדפסה בלבד.
"""
import datetime
import glob
import json
import os

OUTDIR = os.environ.get('OUTDIR', 'line-history/data')
DRY = os.environ.get('DRY') == '1'
KINDS = {'route', 'stops', 'stops-add', 'stops-del', 'extend', 'shorten', 'terminal', 'redraw'}
WINDOW = 180


def signature(v):
    """מה השתנה: קודי התחנות שנוספו ושירדו (ואם אין קודים — השמות)."""
    add = v.get('ac') or v.get('add') or []
    rem = v.get('rc') or v.get('rem') or []
    if not add and not rem:
        return None
    return (frozenset(str(x) for x in add), frozenset(str(x) for x in rem))


def days_between(a, b):
    return (datetime.date.fromisoformat(str(b)[:10]) - datetime.date.fromisoformat(str(a)[:10])).days


def mark(files_versions):
    """files_versions: {rd: (line, op, [version dicts])}. מסמן echo בגרסאות עצמן; מחזיר (נוספו, הוסרו, [(rd, גרסה)])."""
    groups = {}
    for rd, (line, op, versions) in files_versions.items():
        for v in versions:
            if v.get('k') not in KINDS or not v.get('d'):
                continue
            sig = signature(v)
            if sig:
                # אותו קו (מספר + מפעיל) ואותו כיוון — חלופות שונות של אותה נסיעה
                direction = str(rd).split('-')[1] if str(rd).count('-') >= 1 else ''
                groups.setdefault((str(line or ''), str(op or ''), direction), []).append((str(v['d'])[:10], sig, rd, v))
    added = removed = 0
    echoes = []
    for evs in groups.values():
        evs.sort(key=lambda e: e[0])
        first = {}                                  # חתימה → (תאריך, חלופה) של המופע הראשון
        for d, sig, rd, v in evs:
            base = first.get(sig)
            if base is None or days_between(base[0], d) > WINDOW:
                first[sig] = (d, rd)                # מופע ראשון (או ראשון בחלון חדש)
                echo = None
            elif base[1] == rd or days_between(base[0], d) == 0:
                echo = None                         # אותה חלופה שוב (רפרוף), או אותו יום — פריסה אחת של המשרד
            else:
                echo = {'d': base[0], 'rd': base[1]}
            if echo:
                if v.get('echo') != echo:
                    v['echo'] = echo
                    added += 1
                echoes.append((rd, v))
            elif 'echo' in v:
                del v['echo']
                removed += 1
    return added, removed, echoes


def main():
    files = {}
    raw = {}
    for p in sorted(glob.glob(f'{OUTDIR}/lines/*.json')):
        try:
            lf = json.load(open(p, encoding='utf-8'))
        except Exception:
            continue
        rd = lf.get('rd') or os.path.basename(p)[:-5]
        raw[rd] = (p, lf, json.dumps(lf, ensure_ascii=False, separators=(',', ':')))
        files[rd] = (lf.get('line'), lf.get('op'), lf.get('versions') or [])
    added, removed, echoes = mark(files)
    echo_keys = {(rd, str(v['d'])[:10], v.get('k')): v['echo'] for rd, v in echoes}
    written = 0
    if not DRY:
        for rd, (p, lf, before) in raw.items():
            after = json.dumps(lf, ensure_ascii=False, separators=(',', ':'))
            if after != before:
                open(p, 'w', encoding='utf-8').write(after)
                written += 1
        # גם ברשימת השינויים לפי חודש (האתר: "שינויים לפי יום")
        months = {k[1][:7] for k in echo_keys} | {str(v['d'])[:7] for _, (_, _, vs) in files.items() for v in vs if v.get('k') in KINDS and v.get('d')}
        for m in sorted(months):
            mp = f'{OUTDIR}/changes/{m}.json'
            if not os.path.exists(mp):
                continue
            mm = json.load(open(mp, encoding='utf-8'))
            dirty = False
            for c in mm.get('changes') or []:
                key = (c.get('rd'), str(c.get('d', ''))[:10], c.get('k'))
                want = echo_keys.get(key)
                if want and c.get('echo') != want:
                    c['echo'] = want
                    dirty = True
                elif not want and 'echo' in c:
                    del c['echo']
                    dirty = True
            if dirty:
                json.dump(mm, open(mp, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    for rd, v in echoes[-12:]:
        print(f'  הד: {rd} {str(v["d"])[:10]} {v.get("k")} ← נכנס כבר ב-{v["echo"]["d"]} ({v["echo"]["rd"]})')
    print(f'הדים של שינוי שכבר נכנס לקו: {len(echoes)} אירועים ({added} סומנו עכשיו, {removed} הוסרו, {written} קבצים נכתבו)')


if __name__ == '__main__':
    main()
