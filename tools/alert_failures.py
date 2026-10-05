#!/usr/bin/env python3
"""Hebrew failure alerts by email, through GitHub issues (שלמה 05.10).

"האם אפשר שברגע שיש תקלה כזו אני אקבל הודעה מובנת בעברית למייל ומה הייתה התקלה?"

GitHub sends an email for every issue and comment that mentions the repository
owner, so no mail server or password is needed:
- a watched workflow fails (or runs out of time) -> one open issue per workflow,
  with what broke in plain Hebrew, the failing step and the last log lines;
  further failures add a comment to the same issue;
- the next successful run closes the issue with a short "חזר לעבוד" comment;
- --stale: the data the site shows is older than it should be even though nothing
  failed (as with the bus index on 05.10, when GitHub started the run 5–6 hours late).

  python tools/alert_failures.py --run <run id>     # from alert-failures.yml (workflow_run)
  python tools/alert_failures.py --stale            # from the scheduled freshness check
"""
import argparse, datetime, json, os, re, sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError

OWNER = 'Transit-Freak'
LABEL = 'תקלה-אוטומטית'

# workflow name (name: in the yml) -> what the reader knows it as
WATCHED = {
    'line-history': 'הקו בזמן — הסריקה היומית של שינויי הקווים',
    'bus-reliability': 'מדד דיוק האוטובוסים',
    'rail-reliability': 'מדד אמינות הרכבת',
    'kavpach-build': 'קו פח — בנייה',
    'line-hub': 'מרכז הקווים',
    'gis-layers': 'GIS — השכבות הליליות',
    'fleet-registry': 'צי הרכבים — רישוי',
    'ratzif': 'רציף כפול',
    'tenders-collect': 'מסכם המכרזים',
    'historical-passenger-websites': 'הקו בזמן — צילומי אתרי המידע (2003–2015)',
    'notify-push': 'התראות הדפדפן של הקו בזמן',
    'update-weekly': 'רענון יומי של התחנות',
    'update-monthly': 'רענון חודשי של התחנות',
}

# (pattern in the log, explanation). The first match wins, so specific causes come first.
CAUSES = [
    (r'Failed to connect to [\w.-]*gov\.il|Could not resolve host: [\w.-]*gov\.il|gov\.il.*(Timeout|timed out)',
     'אתר ממשלתי (gov.il) לא ענה לשרת של GitHub. זה קורה מדי פעם — אתרי הממשלה חוסמים או לא עונים לשרתים בחו"ל. '
     'בדרך כלל זה עובר לבד עד הריצה הבאה.'),
    (r'\[rejected\].*\(fetch first\)|Updates were rejected|הדחיפה נכשלה|push rejected',
     'החישוב הצליח, אבל השמירה ל-GitHub נדחתה כי צינורות אחרים שמרו באותו זמן, והניסיונות נגמרו. '
     'הנתונים של הריצה הזו לא נשמרו; הריצה הבאה תחשב אותם שוב.'),
    (r'No space left on device',
     'נגמר המקום בדיסק של השרת של GitHub באמצע הריצה.'),
    (r'HTTP Error 429|429 Too Many Requests|status(?: code)? 429',
     'אתר המקור ביקש להאט (429 — יותר מדי בקשות).'),
    (r'HTTP Error 403|403 Forbidden|status(?: code)? 403',
     'אתר המקור סירב לבקשה (403 — אין הרשאה / חסימת בוטים).'),
    (r'HTTP Error 404|404 Not Found|error: 404',
     'קובץ שהריצה צריכה לא נמצא במקור (404). ייתכן שהקובץ של היום עוד לא פורסם.'),
    (r'HTTP Error 5\d\d|50[234] (Bad Gateway|Service Unavailable|Gateway Time)',
     'אתר המקור החזיר שגיאת שרת (5xx) — תקלה אצלם, בדרך כלל זמנית.'),
    (r'Connection refused|Connection reset|Remote end closed connection',
     'החיבור לאתר המקור נותק או נדחה.'),
    (r'Traceback \(most recent call last\)',
     'שגיאה בקוד של הכלי (Python). השורה האחרונה ביומן אומרת מה בדיוק.'),
    (r'SyntaxError|ReferenceError|TypeError:|Error: Cannot find module',
     'שגיאה בקוד של הכלי (JavaScript).'),
]
TIMEOUT = ('הריצה ארכה יותר מהזמן המותר לה ובוטלה באמצע. אם זה קרה בשלב השמירה, '
           'הנתונים של הריצה לא נשמרו.')
UNKNOWN = 'לא זוהתה סיבה מוכרת. השורות האחרונות ביומן מצורפות למטה.'


def api(path, method='GET', body=None, raw=False):
    url = path if path.startswith('http') else f"https://api.github.com/repos/{os.environ['GITHUB_REPOSITORY']}/{path}"
    headers = {'Authorization': 'Bearer ' + os.environ['GH_TOKEN'], 'Accept': 'application/vnd.github+json',
               'User-Agent': 'kavbochan-alerts'}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers['Content-Type'] = 'application/json'
    with urlopen(Request(url, data=data, method=method, headers=headers), timeout=60) as r:
        content = r.read()
    return content.decode('utf-8', 'replace') if raw else (json.loads(content) if content else None)


def clean(log):
    """Log lines without the timestamps and colour codes GitHub adds."""
    out = []
    for line in log.replace('﻿', '').splitlines():
        line = re.sub(r'^\d{4}-\d\d-\d\dT[\d:.]+Z ?', '', line)
        line = re.sub(r'\x1b\[[0-9;]*m|\[\d+;?\d*m', '', line)
        if line.startswith('##[group]') or line.startswith('##[endgroup]'):
            continue
        out.append(line)
    return out


def explain(log_lines, timed_out=False):
    """The cause in Hebrew, from the end of the failing step's log."""
    if timed_out:
        return TIMEOUT
    text = '\n'.join(log_lines[-200:])
    for pattern, why in CAUSES:
        if re.search(pattern, text):
            return why
    if any('The operation was canceled' in l for l in log_lines[-20:]):
        return TIMEOUT
    return UNKNOWN


def failing_step(job):
    for step in job.get('steps') or []:
        if step.get('conclusion') in ('failure', 'cancelled'):
            return step.get('name') or ''
    return ''


def is_timeout(run, jobs):
    """Cancelled by the time limit, not by a newer run of the same workflow (concurrency)."""
    if run['conclusion'] == 'timed_out':
        return True
    if run['conclusion'] != 'cancelled':
        return False
    started = datetime.datetime.fromisoformat(run['run_started_at'].replace('Z', '+00:00'))
    ended = datetime.datetime.fromisoformat(run['updated_at'].replace('Z', '+00:00'))
    return (ended - started).total_seconds() >= 50 * 60 and any(j.get('conclusion') == 'cancelled' for j in jobs)


def il_time(iso):
    t = datetime.datetime.fromisoformat(iso.replace('Z', '+00:00'))
    try:
        from zoneinfo import ZoneInfo
        t = t.astimezone(ZoneInfo('Asia/Jerusalem'))
    except Exception:
        pass
    return t.strftime('%d.%m.%Y %H:%M')


def open_issue(title):
    # by title, not by label: an issue may have been opened without the label
    for issue in api('issues?state=open&per_page=100'):
        if issue['title'] == title and 'pull_request' not in issue:
            return issue
    return None


def report(title, body):
    issue = open_issue(title)
    if issue:
        api(f"issues/{issue['number']}/comments", 'POST', {'body': body})
        return issue['number']
    try:
        return api('issues', 'POST', {'title': title, 'body': body, 'labels': [LABEL]})['number']
    except HTTPError:
        # the label does not exist yet and the token cannot create labels
        return api('issues', 'POST', {'title': title, 'body': body})['number']


def resolve(title, body):
    issue = open_issue(title)
    if issue:
        api(f"issues/{issue['number']}/comments", 'POST', {'body': body})
        api(f"issues/{issue['number']}", 'PATCH', {'state': 'closed', 'state_reason': 'completed'})


def on_run(run_id):
    run = api(f'actions/runs/{run_id}')
    name = run['name']
    if name not in WATCHED:
        print(f'{name}: not watched'); return
    title = f'⚠️ תקלה: {WATCHED[name]}'
    jobs = api(f'actions/runs/{run_id}/jobs?per_page=50').get('jobs', [])
    timed_out = is_timeout(run, jobs)
    if run['conclusion'] == 'success':
        resolve(title, f"✅ חזר לעבוד — הריצה של {il_time(run['run_started_at'])} הצליחה.\n\n[הריצה]({run['html_url']})")
        print(f'{name}: success'); return
    if run['conclusion'] not in ('failure', 'timed_out') and not timed_out:
        print(f"{name}: {run['conclusion']} — not a failure"); return
    job = next((j for j in jobs if j.get('conclusion') in ('failure', 'cancelled', 'timed_out')), jobs[0] if jobs else None)
    lines, step = [], ''
    if job:
        step = failing_step(job)
        try:
            lines = clean(api(f"actions/jobs/{job['id']}/logs", raw=True))
        except Exception as e:
            lines = [f'(היומן לא נקרא: {e})']
    why = explain(lines, timed_out)
    tail = '\n'.join(l for l in lines if l.strip())[-3000:].split('\n')[-25:]
    body = (f"@{OWNER}\n\n"
            f"**{WATCHED[name]}** {'בוטל כי נגמר הזמן' if timed_out else 'נכשל'} — {il_time(run['run_started_at'])} (שעון ישראל).\n\n"
            f"**מה קרה:** {why}\n\n"
            + (f"**השלב שנכשל:** {step}\n\n" if step else '')
            + f"[לריצה ב-GitHub]({run['html_url']})\n\n"
            "<details><summary>השורות האחרונות ביומן</summary>\n\n```\n" + '\n'.join(tail) + "\n```\n</details>\n\n"
            "_הודעה אוטומטית. כשהריצה הבאה תצליח, הנושא ייסגר לבד._")
    n = report(title, body)
    print(f'{name}: reported in #{n}')


def stale_checks(today):
    """(title, problem or None) for the data the site shows."""
    out = []
    yesterday = (today - datetime.timedelta(days=1)).isoformat()
    try:
        days = json.load(open('bus/data/index.json', encoding='utf-8'))['days']
        last = days[-1]['d'] if days else ''
        # the day before yesterday at the latest: yesterday's files are complete only from 06:00 Israel time
        due = (today - datetime.timedelta(days=2)).isoformat()
        out.append(('⚠️ לא מתעדכן: מדד דיוק האוטובוסים',
                    f'היום האחרון במדד הוא {last}, אבל כבר אמור להיות לפחות {due}.' if last < due else None))
    except Exception as e:
        out.append(('⚠️ לא מתעדכן: מדד דיוק האוטובוסים', f'לא הצלחתי לקרוא את bus/data/index.json ({e}).'))
    try:
        gen = json.load(open('line-history/data/lines.json', encoding='utf-8'))['gen']
        out.append(('⚠️ לא מתעדכן: הקו בזמן',
                    f'הסריקה האחרונה שנשמרה היא מ-{gen}. שינויים שבוצעו אחריה לא מופיעים באתר.' if gen < yesterday else None))
    except Exception as e:
        out.append(('⚠️ לא מתעדכן: הקו בזמן', f'לא הצלחתי לקרוא את line-history/data/lines.json ({e}).'))
    return out


def on_stale():
    today = datetime.date.today()
    for title, problem in stale_checks(today):
        if problem:
            body = (f"@{OWNER}\n\n**{title.replace('⚠️ לא מתעדכן: ', '')} לא מתעדכן.** {problem}\n\n"
                    "אף ריצה לא נכשלה בהכרח — ייתכן שהריצה לא הופעלה, או שהיא רצה ולא שמרה. "
                    f"[הריצות האחרונות](https://github.com/{os.environ['GITHUB_REPOSITORY']}/actions)\n\n"
                    "_הודעה אוטומטית. כשהנתונים יתעדכנו, הנושא ייסגר לבד._")
            if not open_issue(title):
                print(f'{title}: reported in #{report(title, body)}')
            else:
                print(f'{title}: still open')
        else:
            resolve(title, '✅ הנתונים מעודכנים שוב.')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--run', type=int)
    ap.add_argument('--stale', action='store_true')
    a = ap.parse_args()
    if a.run:
        on_run(a.run)
    if a.stale:
        on_stale()


if __name__ == '__main__':
    sys.exit(main())
