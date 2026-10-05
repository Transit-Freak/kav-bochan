#!/usr/bin/env python3
"""Collect the archived passenger-website captures from one home computer.

GitHub's servers are refused by the Internet Archive most of the time, so the
remaining captures can be fetched from a single home address instead, at the
same polite pace (one request every 4 seconds at most, slower after a refusal).
GitHub stops fetching while line-history/data/website-home/ACTIVE exists, so the
two never run together.

Nothing else is needed from the repository: the script downloads the current
list of captures and the parser from GitHub, and keeps its results next to
itself in kavbochan-home/. Stop it any time (or let it stop at --until); the
next start continues where it stopped.

Results to upload: kavbochan-home/website-home.json.gz
(GitHub -> line-history/data/website-home/ -> Add file -> Upload files).
With a GitHub token in github-token.txt next to this script (fine-grained, this
repository only, Contents: read and write) the results upload by themselves, each
time as a small file with only what is new (website-home/part-*.json.gz):
- at start, everything that was not uploaded before the computer turned off;
- every 10 minutes while new routes are being found (the site needs about as long
  to publish them);
- when the script stops.

  python home_collect.py              # runs until 21:50
  python home_collect.py --until 23:30
"""
import argparse, base64, collections, datetime, gzip, hashlib, importlib, json, re, subprocess, sys, threading, time
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
from pathlib import Path
from urllib.request import Request, urlopen

RAW = 'https://raw.githubusercontent.com/Transit-Freak/kav-bochan/main/'
HOME = Path(__file__).resolve().parent / 'kavbochan-home'
UA = {'User-Agent': 'KavBochan-Historical-Research/1.0 (home collection)'}
PACK_EVERY = 50
TOKEN_FILE = Path(__file__).resolve().parent / 'github-token.txt'
CONTENTS = 'https://api.github.com/repos/Transit-Freak/kav-bochan/contents/line-history/data/website-home/'
UPLOAD_TO = CONTENTS + 'website-home.json.gz'
UPLOAD_EVERY = 600
UPLOADED = HOME / 'uploaded.json'


def get(url):
    with urlopen(Request(url, headers=UA), timeout=120) as r:
        return r.read()


def load_importer():
    """The parser and the archive rules, always the version on GitHub."""
    try:
        import lxml  # noqa: F401
    except ImportError:
        print('Installing lxml (needed to read the archived pages)...', flush=True)
        subprocess.run([sys.executable, '-m', 'pip', 'install', '--user', 'lxml'], check=True)
        # A user site folder created just now is not on this run's path yet
        import site
        if site.getusersitepackages() not in sys.path:
            sys.path.append(site.getusersitepackages())
        importlib.invalidate_caches()
    (HOME / 'import_website_history.py').write_bytes(get(RAW + 'tools/import_website_history.py'))
    sys.path.insert(0, str(HOME))
    return importlib.import_module('import_website_history')


def name_of(digest):
    return hashlib.sha256(digest.encode()).hexdigest() + '.json'


def pack(cache):
    """All results so far in one file, ready to upload."""
    results = {p.name: json.loads(p.read_text(encoding='utf-8')) for p in sorted(cache.glob('*.json'))}
    raw = json.dumps(results, ensure_ascii=False, separators=(',', ':')).encode()
    target = HOME / 'website-home.json.gz'
    tmp = target.with_suffix('.tmp')
    tmp.write_bytes(gzip.compress(raw, mtime=0))
    tmp.replace(target)
    return len(results)


def put_file(token, url, payload, message):
    """A new file on GitHub; the workflow there reads every website-home/*.json.gz and publishes it."""
    headers = {**UA, 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json',
               'Content-Type': 'application/json'}
    body = {'message': message, 'branch': 'main', 'content': base64.b64encode(payload).decode()}
    with urlopen(Request(url, data=json.dumps(body).encode(), method='PUT', headers=headers), timeout=300):
        pass


def already_uploaded():
    """Names of the captures GitHub already has. The first time: read from the file uploaded so far."""
    if UPLOADED.exists():
        return set(json.loads(UPLOADED.read_text(encoding='utf-8')))
    try:
        names = set(json.loads(gzip.decompress(get(RAW + 'line-history/data/website-home/website-home.json.gz'))))
    except Exception:
        names = set()
    UPLOADED.write_text(json.dumps(sorted(names)), encoding='utf-8')
    return names


def upload_new(token, cache, uploaded):
    """Only the captures GitHub does not have yet, as one small file. Returns how many went up."""
    new = {p.name: json.loads(p.read_text(encoding='utf-8'))
           for p in sorted(cache.glob('*.json')) if p.name not in uploaded}
    if not new:
        return 0
    routes = sum(1 for r in new.values() if r.get('status') == 'parsed')
    payload = gzip.compress(json.dumps(new, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0)
    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    put_file(token, CONTENTS + f'part-{stamp}.json.gz', payload,
             f'איסוף ביתי: {len(new)} צילומים חדשים ({routes} קווים)')
    uploaded.update(new)
    UPLOADED.write_text(json.dumps(sorted(uploaded)), encoding='utf-8')
    return len(new)


def key_works(token):
    try:
        req = Request(UPLOAD_TO.split('/contents/')[0], headers={**UA, 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json'})
        with urlopen(req, timeout=30):
            return True
    except Exception:
        return False


def try_upload(token, cache, uploaded):
    if not token:
        return False
    try:
        n = upload_new(token, cache, uploaded)
        if n:
            print(f'{datetime.datetime.now():%H:%M} uploaded {n} new captures to GitHub '
                  f'(the site shows them in about 10 minutes)', flush=True)
        return True
    except Exception as e:
        print(f'{datetime.datetime.now():%H:%M} upload failed ({str(e)[:80]}); will try again later', flush=True)
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--until', default='21:50', help='local time to stop, HH:MM')
    args = ap.parse_args()
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
    h, m = map(int, args.until.split(':'))
    now = datetime.datetime.now()
    stop_at = now.replace(hour=h, minute=m, second=0, microsecond=0)
    if stop_at <= now:
        stop_at += datetime.timedelta(days=1)

    HOME.mkdir(exist_ok=True)
    token = TOKEN_FILE.read_text(encoding='utf-8-sig').strip() if TOKEN_FILE.exists() else ''
    if not token and sys.stdin.isatty():
        entered = input('GitHub key for automatic uploads (paste it and press Enter, or just Enter to skip): ').strip().strip('"')
        if entered:
            if key_works(entered):
                TOKEN_FILE.write_text(entered, encoding='utf-8')
                token = entered
                print('Key saved in github-token.txt.', flush=True)
            else:
                print('That key did not work; continuing without automatic uploads.', flush=True)
    print('Uploads to GitHub: ' + ('automatic, every 10 minutes while new routes are found' if token
                                   else 'by hand (no github-token.txt)'), flush=True)
    cache = HOME / 'cache'
    cache.mkdir(exist_ok=True)
    uploaded = already_uploaded() if token else set()
    if token:
        # whatever was collected before the computer turned off and never went up
        waiting = sum(1 for p in cache.glob('*.json') if p.name not in uploaded)
        if waiting:
            print(f'{waiting} captures from last time were not uploaded yet; uploading them now...', flush=True)
            try_upload(token, cache, uploaded)
    last_upload = time.monotonic()
    new_routes = 0
    w = load_importer()
    print('Downloading the list of captures...', flush=True)
    manifest = json.loads(gzip.decompress(get(RAW + 'line-history/data/website-archive.json.gz')))
    captures = manifest['captures']

    groups, retries = {}, {}
    for c in captures:
        local = cache / name_of(c['digest'])
        if local.exists():
            c['result'] = json.loads(local.read_text(encoding='utf-8'))
            if w.needs_retry(c['result']):
                retries.setdefault(c['digest'], []).append(c)
            continue
        r = c.get('result') or {'status': 'pending'}
        c['result'] = r
        if r.get('status') == 'pending':
            groups.setdefault(c['digest'], []).append(c)
        elif w.needs_retry(r):
            retries.setdefault(c['digest'], []).append(c)
    ordered = w.prioritize(captures, groups, retries)
    total = len(ordered)
    print(f'{total} captures to fetch. Stopping at {stop_at:%H:%M}. Ctrl+C stops safely.', flush=True)

    lock = threading.Lock()
    pacer = w.Pacer()
    last_request = [0.0]
    pause_until = [0.0]
    stop = threading.Event()
    counts = collections.Counter()

    def fetch(c):
        previous = c['result']
        with lock:
            delay = max(pacer.interval - (time.monotonic() - last_request[0]), pause_until[0] - time.monotonic())
            # stop.wait: Ctrl+C or the stop time ends a pause at once
            if delay > 0 and stop.wait(delay):
                return None
            last_request[0] = time.monotonic()
        if stop.is_set():
            return None
        url = f"https://web.archive.org/web/{c['timestamp']}id_/{c['original']}"
        try:
            with urlopen(Request(url, headers=UA), timeout=60) as r:
                payload = r.read()
                actual = r.geturl()
            found = re.search(r'/web/(\d{14})', actual)
            if found and found[1] != c['timestamp']:
                raise ValueError('Archive redirected to a different capture date')
            result = w.parse_page(payload, c['original'])
            with lock:
                pacer.answered()
        except Exception as e:
            wait_s = w.refused(e)
            if wait_s:
                with lock:
                    if pause_until[0] <= time.monotonic():
                        pause_until[0] = time.monotonic() + wait_s
                        pacer.refused()
                        print(f'{datetime.datetime.now():%H:%M} archive refused; pausing {wait_s // 60} min, '
                              f'then one request every {round(pacer.interval)} s', flush=True)
                return 'again'
            attempts = previous.get('attempts', 1) + 1 if previous.get('status') == 'failed' else 1
            result = {'status': 'failed', 'reason': str(e)[:200], 'attempts': attempts}
        (cache / name_of(c['digest'])).write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        return result

    todo = iter(ordered.values())
    again = collections.deque()
    active = {}
    done_count = 0
    try:
        with ThreadPoolExecutor(max_workers=w.WORKERS) as executor:
            while True:
                if datetime.datetime.now() >= stop_at:
                    stop.set()
                while len(active) < w.WORKERS and not stop.is_set():
                    group = again.popleft() if again else next(todo, None)
                    if group is None:
                        break
                    active[executor.submit(fetch, group[0])] = group
                if not active:
                    break
                finished, _ = wait(active, timeout=30, return_when=FIRST_COMPLETED)
                for future in finished:
                    group = active.pop(future)
                    result = future.result()
                    if result == 'again':
                        again.append(group)
                        continue
                    if result is None:
                        continue
                    done_count += 1
                    counts[result['status']] += 1
                    new_routes += result['status'] == 'parsed'
                    if token and new_routes and time.monotonic() - last_upload >= UPLOAD_EVERY:
                        if try_upload(token, cache, uploaded):
                            new_routes = 0
                        last_upload = time.monotonic()
                    if done_count % PACK_EVERY == 0:
                        pack(cache)
                        print(f'{datetime.datetime.now():%H:%M} {done_count}/{total} done '
                              f'({counts["parsed"]} routes, {counts["unparsed"]} other pages, {counts["failed"]} failed); '
                              f'one request every {round(pacer.interval)} s', flush=True)
    except KeyboardInterrupt:
        stop.set()
        print('Stopping...', flush=True)
    n = pack(cache)
    print(f'\nDone for now: {done_count} fetched this time, {n} in total.')
    if not try_upload(token, cache, uploaded):
        print(f'Upload this file: {HOME / "website-home.json.gz"}')
        print('GitHub -> line-history/data/website-home/ -> Add file -> Upload files -> Commit.')


if __name__ == '__main__':
    main()
