#!/usr/bin/env python3
"""חלון בעברית לאיסוף הביתי של הקו הבוחן (שלמה 05.10).

"תוכנת פקודות של Windows, כמו מה שאנחנו משתמשים בו עכשיו, אבל בעברית — שאבין מה היא עושה."

The same thing as the black window (home_collect.py), in a small Hebrew window: buttons and Hebrew
commands ("התחל", "עצור", "מצב", "עדכן", "עזרה"), and every line the collector prints explained in
Hebrew. It runs home_collect.py next to it, so the folder, the key (github-token.txt) and
kavbochan-home/ stay exactly as they are. "עצור" stops safely, like Ctrl+C: the collector finishes
what it is doing and uploads what it collected.

Double-click kav_window.pyw (or the desktop shortcut it creates the first time).
"""
import datetime, json, os, queue, re, subprocess, sys, threading, webbrowser
from pathlib import Path
from urllib.request import Request, urlopen

FOLDER = Path(__file__).resolve().parent
HOME = FOLDER / 'kavbochan-home'
COLLECTOR = FOLDER / 'home_collect.py'
RAW = 'https://raw.githubusercontent.com/Transit-Freak/kav-bochan/main/tools/'
SITE = 'https://kavbochan.app/line-history/'
RLM = '\u200f'   # starts every line right-to-left, so punctuation lands on the correct side
DEFAULT_UNTIL = '21:50'

HELP = """הפקודות (אפשר לכתוב אותן בתיבה למטה, או ללחוץ על הכפתורים):
• התחל — מתחיל לאסוף את הצילומים שנשארו מארכיון האינטרנט, ומעלה אותם לאתר כל 30 דקות.
• התחל עד 20:30 — כמו התחל, אבל עוצר לבד בשעה שכתבת (בלי שעה: עד 21:50).
• עצור — עוצר בבטחה: מסיים את מה שבאמצע ומעלה לאתר את כל מה שנאסף. לא הולך לאיבוד כלום.
• מצב — כמה נאסף, כמה נשאר, מה כבר עלה לאתר ומתי.
• עדכן — מוריד מ-GitHub את הגרסה האחרונה של התוכנה (את זה התחל עושה ממילא).
• אתר — פותח את הקו בזמן בדפדפן.
• תיקייה — פותח את התיקייה של התוכנה.
• נקה — מנקה את החלון.
• הפוך — אם העברית בחלון מופיעה הפוכה (מהסוף להתחלה), זה מתקן. עוד פעם הפוך מחזיר.
• עזרה — הרשימה הזו."""

COMMANDS = [
    ('start', ('התחל', 'תתחיל', 'הפעל', 'תפעיל', 'איסוף', 'אסוף', 'start')),
    ('stop', ('עצור', 'תעצור', 'הפסק', 'תפסיק', 'עצירה', 'stop')),
    ('status', ('מצב', 'סטטוס', 'מה המצב', 'מה קורה', 'status')),
    ('update', ('עדכן', 'תעדכן', 'עדכון', 'update')),
    ('help', ('עזרה', 'הסבר', 'פקודות', '?', 'help')),
    ('site', ('אתר', 'פתח אתר', 'הקו בזמן', 'site')),
    ('folder', ('תיקייה', 'תיקיה', 'פתח תיקייה', 'פתח תיקיה', 'folder')),
    ('clear', ('נקה', 'ניקוי', 'clear')),
    ('flip', ('הפוך', 'תהפוך', 'flip')),
    ('close', ('סגור', 'יציאה', 'צא', 'exit')),
]


def parse_command(text):
    """Hebrew command -> (action, argument). Unknown -> ('unknown', text)."""
    t = text.strip().strip('.!').strip()
    if not t:
        return ('none', '')
    until = re.search(r'(\d{1,2}):(\d{2})', t)
    low = t.lower()
    for action, words in COMMANDS:
        if any(low == w or low.startswith(w + ' ') for w in words):
            if action == 'start' and until:
                h, m = int(until[1]), int(until[2])
                if h < 24 and m < 60:
                    return ('start', f'{h:02d}:{m:02d}')
            return (action, '')
    if until and re.search(r'עד|ב-|בשעה', t):
        return ('start', f'{int(until[1]):02d}:{until[2]}')
    return ('unknown', t)


def translate(line):
    """One line from home_collect.py -> (Hebrew line or None to hide, progress (done, total) or None)."""
    s = line.rstrip()
    if not s.strip():
        return None, None
    m = re.match(r'(\d\d:\d\d) (\d+)/(\d+) done \((\d+) routes, (\d+) other pages, (\d+) failed\); one request every (\d+) s', s)
    if m:
        t, done, total, routes, other, failed, every = m.groups()
        return (f'{t} — הורדו {done} מתוך {total} צילומים: {routes} דפי קווים, {other} דפים אחרים, {failed} נכשלו '
                f'(יינסו שוב בהמשך). בקשה לארכיון כל {every} שניות.', (int(done), int(total)))
    m = re.match(r'(\d+) captures to fetch\. Stopping at (\d\d:\d\d)\.', s)
    if m:
        return (f'נשארו {m[1]} צילומים להורדה. האיסוף ייעצר לבד ב-{m[2]}, או כשתלחץ "עצור".', (0, int(m[1])))
    m = re.match(r'(\d\d:\d\d) uploaded (\d+) new captures to GitHub', s)
    if m:
        return f'{m[1]} — עלו ל-GitHub {m[2]} צילומים חדשים. הם יופיעו באתר בעוד כ-15–20 דקות.', None
    m = re.match(r'(\d\d:\d\d) upload failed \((.*)\); will try again later', s)
    if m:
        return f'{m[1]} — ההעלאה לאתר לא הצליחה ({m[2]}). לא נורא: הכול שמור במחשב, וינסה שוב בהמשך.', None
    m = re.match(r'(\d\d:\d\d) archive refused; pausing (\d+) min, then one request every (\d+) s', s)
    if m:
        return (f'{m[1]} — ארכיון האינטרנט מבקש להאט. ממתין {m[2]} דקות, ואחר כך בקשה כל {m[3]} שניות. '
                'זה רגיל, לא צריך לעשות כלום.', None)
    m = re.match(r'(\d+) captures from last time were not uploaded yet', s)
    if m:
        return f'{m[1]} צילומים מהפעם הקודמת עוד לא עלו לאתר. מעלה אותם עכשיו...', None
    m = re.match(r'Done for now: (\d+) fetched this time, (\d+) in total\.', s)
    if m:
        return f'האיסוף נעצר. בהפעלה הזו הורדו {m[1]} צילומים; בסך הכול נאספו {m[2]}.', None
    m = re.match(r'Upload this file: (.*)', s)
    if m:
        return f'אין מפתח GitHub, אז צריך להעלות ידנית את הקובץ: {m[1]}', None
    fixed = {
        'Uploads to GitHub: automatic, every 30 minutes while new routes are found':
            'העלאה לאתר: אוטומטית, כל 30 דקות כשנמצאו קווים חדשים, וגם בסוף.',
        'Uploads to GitHub: by hand (no github-token.txt)':
            'העלאה לאתר: ידנית — לא נמצא הקובץ github-token.txt עם המפתח.',
        'Downloading the list of captures...': 'מוריד מ-GitHub את רשימת הצילומים שעוד חסרים...',
        'Installing lxml (needed to read the archived pages)...': 'מתקין רכיב שצריך כדי לקרוא את הדפים מהארכיון (lxml)...',
        'Stopping...': 'עוצר בבטחה: מסיים את מה שבאמצע ומעלה את מה שנאסף...',
        'Key saved in github-token.txt.': 'המפתח נשמר.',
        'Another collection is already running on this computer.':
            'איסוף אחר כבר רץ במחשב הזה (אולי בחלון השחור). כדי לעבור לחלון הזה: עצור את השני עם Ctrl+C, '
            'חכה שיכתוב Done, ואז לחץ כאן התחל.',
        'That key did not work; continuing without automatic uploads.': 'המפתח לא עבד, ממשיך בלי העלאה אוטומטית.',
    }
    if s in fixed:
        return fixed[s], None
    if s.startswith('GitHub -> '):
        return 'ב-GitHub: התיקייה line-history/data/website-home ← Add file ← Upload files ← Commit.', None
    if s.startswith('Traceback') or re.match(r'\w*(Error|Exception)\b', s):
        return f'שגיאה: {s}  ← צלם את החלון ושלח לקלוד.', None
    return s, None


MIRROR = str.maketrans('()[]{}<>', ')(][}{><')


def visual(text):
    """Right-to-left text in the order a left-to-right screen shows it, for a Tk that does not
    reorder Hebrew by itself (Linux; on Windows Tk does). Hebrew runs are reversed and the runs
    are laid out right to left; numbers, times and Latin words keep their own order."""
    def kind(c):
        if '\u0590' <= c <= '\u05ff':
            return 'R'
        return 'L' if c.isascii() and c.isalnum() else 'N'
    chars = [c for c in text if c != RLM]
    kinds = [kind(c) for c in chars]
    # a neutral between two Latin/digit characters belongs to them (10:58, 15-20, github-token.txt)
    for i, k in enumerate(kinds):
        if k == 'N':
            left = next((kinds[j] for j in range(i - 1, -1, -1) if kinds[j] != 'N'), 'R')
            right = next((kinds[j] for j in range(i + 1, len(kinds)) if kinds[j] != 'N'), 'R')
            kinds[i] = 'L' if left == right == 'L' else 'R'
    runs = []
    for c, k in zip(chars, kinds):
        if runs and runs[-1][0] == k:
            runs[-1][1].append(c)
        else:
            runs.append((k, [c]))
    out = []
    for k, cs in reversed(runs):
        out.append(''.join(reversed(cs)).translate(MIRROR) if k == 'R' else ''.join(cs))
    return ''.join(out)


def collector_python():
    """python.exe next to pythonw.exe, so the collector runs without its own black window."""
    exe = Path(sys.executable)
    if exe.name.lower() == 'pythonw.exe' and exe.with_name('python.exe').exists():
        return str(exe.with_name('python.exe'))
    return sys.executable


def download(name):
    with urlopen(Request(RAW + name, headers={'User-Agent': 'KavBochan-window'}), timeout=60) as r:
        return r.read()


def local_status():
    cache = HOME / 'cache'
    collected = len(list(cache.glob('*.json'))) if cache.exists() else 0
    try:
        uploaded = len(json.loads((HOME / 'uploaded.json').read_text(encoding='utf-8')))
    except Exception:
        uploaded = None
    return collected, uploaded


def make_shortcut():
    """'איסוף קווים' on the desktop, opening this window (Windows only, once)."""
    if os.name != 'nt':
        return False
    target = Path(sys.executable)
    if target.name.lower() == 'python.exe' and target.with_name('pythonw.exe').exists():
        target = target.with_name('pythonw.exe')
    script = ("$d=[Environment]::GetFolderPath('Desktop');$p=Join-Path $d 'איסוף קווים.lnk';"
              "if(-not(Test-Path $p)){$s=(New-Object -ComObject WScript.Shell).CreateShortcut($p);"
              f"$s.TargetPath='{target}';$s.Arguments='\"{Path(__file__).resolve()}\"';"
              f"$s.WorkingDirectory='{FOLDER}';$s.Save();'made'}}")
    r = subprocess.run(['powershell', '-NoProfile', '-Command', script], capture_output=True, text=True,
                       creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    return 'made' in (r.stdout or '')


class App:
    def __init__(self, root):
        import tkinter as tk
        from tkinter import ttk
        self.tk, self.root = tk, root
        self.proc = None
        self.lines = queue.Queue()
        self.last_progress = None
        self.last_upload = None
        self.until = DEFAULT_UNTIL
        self.close_after_stop = False
        self.settings = HOME / 'window.json'
        try:
            self.flip = json.loads(self.settings.read_text(encoding='utf-8'))['flip']
        except Exception:
            self.flip = os.name != 'nt'
        v = self.v

        root.title('איסוף קווים — הקו הבוחן')
        root.geometry('820x560')
        font = ('Segoe UI', 11)
        top = tk.Frame(root)
        top.pack(fill='x', padx=10, pady=8)
        self.state = tk.Label(top, text=v('האיסוף לא רץ'), font=('Segoe UI', 13, 'bold'), anchor='e')
        self.state.pack(side='right')
        self.buttons = []
        for label, action in [('עזרה', 'help'), ('אתר', 'site'), ('מצב', 'status'), ('עצור', 'stop'), ('התחל', 'start')]:
            b = tk.Button(top, text=v(label), font=font, width=7, command=lambda a=action: self.run(a, ''))
            b.pack(side='left', padx=3)
            self.buttons.append((b, label))
        self.bar = ttk.Progressbar(root, mode='determinate')
        self.bar.pack(fill='x', padx=10)
        # the command line first, at the bottom, so a small window never squeezes it out
        bottom = tk.Frame(root)
        bottom.pack(side='bottom', fill='x', padx=10, pady=(0, 10))
        self.prompt = tk.Label(bottom, text=v('פקודה:'), font=font)
        self.prompt.pack(side='right', padx=6)
        self.send = tk.Button(bottom, text=v('שלח'), font=font, command=self.on_enter)
        self.send.pack(side='left', padx=(0, 6))
        self.entry = tk.Entry(bottom, font=font, justify='right')
        self.entry.pack(side='right', fill='x', expand=True)
        self.entry.bind('<Return>', self.on_enter)
        self.log = tk.Text(root, font=font, wrap='word', state='disabled', bg='#fbfbf8')
        self.log.tag_configure('rtl', justify='right', rmargin=8, lmargin1=8, lmargin2=8)
        self.log.tag_configure('me', justify='right', foreground='#1f5fbf')
        self.log.tag_configure('warn', justify='right', foreground='#b3261e')
        self.log.pack(fill='both', expand=True, padx=10, pady=8)
        root.update_idletasks()
        root.protocol('WM_DELETE_WINDOW', self.on_close)

        self.say('שלום! זה החלון של האיסוף הביתי. הוא עושה בדיוק את מה שהחלון השחור עשה, ומסביר הכול בעברית.')
        self.say('כדי להתחיל לחץ "התחל" (או כתוב התחל למטה ולחץ Enter). לרשימת כל הפקודות: עזרה.')
        try:
            if make_shortcut():
                self.say('נוצר קיצור דרך בשולחן העבודה: "איסוף קווים". בפעם הבאה אפשר לפתוח מאיתו.')
        except Exception:
            pass
        self.entry.focus_set()
        root.after(200, self.pump)

    # ---- output ----
    def v(self, text):
        return visual(text) if self.flip else RLM + text

    def lines_for(self, part):
        """When the text is reversed by hand the widget would wrap it from the wrong end, so long
        lines are cut into screen-width pieces first, at spaces."""
        if not self.flip:
            return [part]
        from tkinter import font as tkfont
        width = max(self.log.winfo_width() - 40, 200)
        measure = tkfont.Font(font=self.log.cget('font')).measure
        out, line = [], ''
        for word in part.split(' '):
            trial = (line + ' ' + word) if line else word
            if line and measure(trial) > width:
                out.append(line)
                line = word
            else:
                line = trial
        return out + [line]

    def say(self, text, tag='rtl'):
        self.log.configure(state='normal')
        for part in text.split('\n'):
            for piece in self.lines_for(part):
                self.log.insert('end', self.v(piece) + '\n', tag)
        self.log.see('end')
        self.log.configure(state='disabled')

    def set_state(self, text):
        self.state_text = text
        self.state.configure(text=self.v(text))

    def toggle_flip(self):
        self.flip = not self.flip
        try:
            HOME.mkdir(exist_ok=True)
            self.settings.write_text(json.dumps({'flip': self.flip}), encoding='utf-8')
        except Exception:
            pass
        for b, label in self.buttons:
            b.configure(text=self.v(label))
        self.prompt.configure(text=self.v('פקודה:'))
        self.send.configure(text=self.v('שלח'))
        self.set_state(getattr(self, 'state_text', 'האיסוף לא רץ'))
        self.say('הפכתי את כיוון הכתב. מעכשיו השורות החדשות ייכתבו ככה. אם עכשיו זה הפוך — כתוב שוב הפוך.')

    # ---- commands ----
    def on_enter(self, _event=None):
        text = self.entry.get()
        self.entry.delete(0, 'end')
        if text.strip():
            self.say('> ' + text.strip(), 'me')
        action, arg = parse_command(text)
        self.run(action, arg)

    def run(self, action, arg):
        if action == 'none':
            return
        if action == 'unknown':
            self.say(f'לא הבנתי את "{arg}". כתוב עזרה כדי לראות את הפקודות.', 'warn')
        elif action == 'help':
            self.say(HELP)
        elif action == 'start':
            self.start(arg or DEFAULT_UNTIL)
        elif action == 'stop':
            self.stop()
        elif action == 'status':
            self.status()
        elif action == 'update':
            threading.Thread(target=self.update_files, daemon=True).start()
        elif action == 'site':
            webbrowser.open(SITE)
            self.say('פותח את הקו בזמן בדפדפן.')
        elif action == 'folder':
            if os.name == 'nt':
                os.startfile(FOLDER)
            self.say(f'התיקייה: {FOLDER}')
        elif action == 'clear':
            self.log.configure(state='normal')
            self.log.delete('1.0', 'end')
            self.log.configure(state='disabled')
        elif action == 'flip':
            self.toggle_flip()
        elif action == 'close':
            self.on_close()

    def running(self):
        return self.proc is not None and self.proc.poll() is None

    def update_files(self, then_start=None):
        """The latest home_collect.py (and this window) from GitHub."""
        notes = []
        try:
            new = download('home_collect.py')
            if not COLLECTOR.exists() or COLLECTOR.read_bytes() != new:
                COLLECTOR.write_bytes(new)
                notes.append('התוכנה עודכנה לגרסה האחרונה.')
            else:
                notes.append('התוכנה כבר בגרסה האחרונה.')
            me = Path(__file__).resolve()
            mine = download('kav_window.pyw')
            if me.read_bytes() != mine:
                me.write_bytes(mine)
                notes.append('גם החלון הזה עודכן — הגרסה החדשה תיפתח בפעם הבאה שתפתח אותו.')
        except Exception as e:
            notes.append(f'לא הצלחתי להוריד עדכון ({str(e)[:80]}). ממשיך עם הגרסה שיש במחשב.')
        self.lines.put(('say', '\n'.join(notes)))
        if then_start:
            self.lines.put(('launch', then_start))

    def start(self, until):
        if self.running():
            self.say('האיסוף כבר רץ. כדי לעצור: עצור.')
            return
        self.until = until
        self.say(f'מתחיל: קודם בודק עדכון ב-GitHub, ואז מתחיל לאסוף עד {until}.')
        self.set_state('מתחיל...')
        threading.Thread(target=self.update_files, args=(until,), daemon=True).start()

    def launch(self, until):
        if not COLLECTOR.exists():
            self.say('לא מצאתי את home_collect.py בתיקייה, ולא הצלחתי להוריד אותו. בדוק את החיבור לאינטרנט.', 'warn')
            self.set_state('האיסוף לא רץ')
            return
        env = dict(os.environ, PYTHONIOENCODING='utf-8', PYTHONUNBUFFERED='1')
        self.proc = subprocess.Popen(
            [collector_python(), '-u', str(COLLECTOR), '--until', until], cwd=FOLDER,
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, encoding='utf-8', errors='replace', env=env,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        self.set_state(f'האיסוף רץ (עד {until})')
        threading.Thread(target=self.read_output, args=(self.proc,), daemon=True).start()

    def read_output(self, proc):
        for line in proc.stdout:
            self.lines.put(('line', line))
        proc.wait()
        self.lines.put(('ended', proc.returncode))

    def stop(self):
        if not self.running():
            self.say('האיסוף לא רץ כרגע.')
            return
        HOME.mkdir(exist_ok=True)
        (HOME / 'STOP').write_text('stop', encoding='utf-8')
        self.set_state('עוצר...')
        self.say('ביקשתי לעצור. זה לוקח עד חצי דקה: התוכנה מסיימת את מה שבאמצע ומעלה לאתר את מה שנאסף.')

    def status(self):
        collected, uploaded = local_status()
        parts = [('האיסוף רץ' + f' (ייעצר לבד ב-{self.until})') if self.running() else 'האיסוף לא רץ.']
        if self.last_progress:
            done, total = self.last_progress
            parts.append(f'בהפעלה הזו: הורדו {done} מתוך {total}, נשארו {total - done}.')
        parts.append(f'במחשב שמורים {collected} צילומים' + (f', ומתוכם {uploaded} כבר עלו ל-GitHub.' if uploaded is not None else '.'))
        if self.last_upload:
            parts.append(f'ההעלאה האחרונה: {self.last_upload}. הבאה: כ-30 דקות אחריה, אם נמצאו קווים חדשים.')
        self.say('\n'.join(parts))

    # ---- the loop that moves lines from the collector into the window ----
    def pump(self):
        try:
            while True:
                kind, value = self.lines.get_nowait()
                if kind == 'say':
                    self.say(value)
                elif kind == 'launch':
                    self.launch(value)
                elif kind == 'line':
                    text, progress = translate(value)
                    if progress:
                        self.last_progress = progress
                        self.bar.configure(maximum=max(progress[1], 1), value=progress[0])
                    if text:
                        if 'עלו ל-GitHub' in text:
                            self.last_upload = text.split(' — ')[0]
                        self.say(text, 'warn' if text.startswith('שגיאה') else 'rtl')
                elif kind == 'ended':
                    self.set_state('האיסוף לא רץ')
                    if value not in (0, None):
                        self.say(f'התוכנה נעצרה עם שגיאה (קוד {value}). צלם את החלון ושלח לקלוד.', 'warn')
                    if self.close_after_stop:
                        self.root.destroy()
                        return
        except queue.Empty:
            pass
        self.root.after(200, self.pump)

    def on_close(self):
        from tkinter import messagebox
        if self.running():
            if messagebox.askyesno('איסוף קווים', 'האיסוף עדיין רץ.\nלעצור אותו בבטחה (להעלות את מה שנאסף) ולסגור?'):
                self.close_after_stop = True
                self.stop()
            return
        self.root.destroy()


def main():
    import tkinter as tk
    root = tk.Tk()
    App(root)
    root.mainloop()


if __name__ == '__main__':
    main()
