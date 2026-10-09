"""קריאת קובצי GTFS מתוך ה-zip היומי בארכיון של דאטאבוס (S3), בלי להוריד את כל ה-zip:
המרכזייה נקראת מסוף הקובץ, וכל איבר נמשך בבקשת טווח (Range) ונפתח תוך כדי הורדה.

אותה שיטה כמו ב-backfill_geo.py; כאן כמודול קטן שאפשר לייבא בלי להריץ את הכלי.
"""
import csv
import io
import struct
import sys
import time
import urllib.request
import zlib

S3 = 'https://openbus-stride-public.s3.eu-west-1.amazonaws.com'
UA = 'kav-bochan (gtfs archive reader; polite)'


def archive_url(d):
    """d = datetime.date → כתובת ה-GTFS היומי בארכיון."""
    return f'{S3}/gtfs_archive/{d:%Y}/{d:%m}/{d:%d}/israel-public-transportation.zip'


def http(url, rng=None, tries=4):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            if rng:
                req.add_header('Range', rng)
            with urllib.request.urlopen(req, timeout=300) as r:
                return r.read(), r.headers
        except Exception as e:  # noqa: BLE001
            print(f'  retry {attempt + 1}: {e}', file=sys.stderr)
            time.sleep(6 * (attempt + 1))
    raise OSError(f'HTTP failed: {url}')


def central_dir(url):
    """שם איבר → (היסט הכותרת המקומית, גודל דחוס, שיטת דחיסה). תומך ב-zip64."""
    tail, h = http(url, 'bytes=-66000')
    total = int((h.get('Content-Range') or '/0').rsplit('/', 1)[-1])
    i = tail.rfind(b'PK\x05\x06')
    if i < 0:
        raise ValueError('EOCD not found')
    cd_size, cd_off = struct.unpack('<II', tail[i + 12:i + 20])
    if cd_off == 0xFFFFFFFF:
        j = tail.rfind(b'PK\x06\x06')
        cd_size, cd_off = struct.unpack('<QQ', tail[j + 40:j + 56])
    base = total - len(tail)
    cd = tail[cd_off - base:cd_off - base + cd_size] if base <= cd_off else http(url, f'bytes={cd_off}-{cd_off + cd_size - 1}')[0]
    members = {}
    p = 0
    while p + 46 <= len(cd) and cd[p:p + 4] == b'PK\x01\x02':
        method, = struct.unpack('<H', cd[p + 10:p + 12])
        csize, usize = struct.unpack('<II', cd[p + 20:p + 28])
        nlen, xlen, clen = struct.unpack('<HHH', cd[p + 28:p + 34])
        lho, = struct.unpack('<I', cd[p + 42:p + 46])
        if csize == 0xFFFFFFFF or lho == 0xFFFFFFFF:
            x = cd[p + 46 + nlen:p + 46 + nlen + xlen]
            q = 0
            while q + 4 <= len(x):
                hid, hsz = struct.unpack('<HH', x[q:q + 4])
                if hid == 1:
                    vals = list(struct.unpack(f'<{hsz // 8}Q', x[q + 4:q + 4 + hsz]))
                    if usize == 0xFFFFFFFF:
                        usize = vals.pop(0)
                    if csize == 0xFFFFFFFF:
                        csize = vals.pop(0)
                    if lho == 0xFFFFFFFF:
                        lho = vals.pop(0)
                q += 4 + hsz
        members[cd[p + 46:p + 46 + nlen].decode()] = (lho, csize, method)
        p += 46 + nlen + xlen + clen
    return members


def stream_member(url, members, name, cb):
    lho, csize, method = members[name]
    lh, _ = http(url, f'bytes={lho}-{lho + 29}')
    n2, x2 = struct.unpack('<HH', lh[26:30])
    off = lho + 30 + n2 + x2
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Range': f'bytes={off}-{off + csize - 1}'})
    d = zlib.decompressobj(-15) if method == 8 else None
    # S3 מחזיר לפעמים 404 רגעי לבקשת טווח — ניסיון חוזר לפני שמתחילים לקרוא (אחרי זה אין חזרה)
    for attempt in range(5):
        try:
            r = urllib.request.urlopen(req, timeout=600)
            break
        except Exception as e:  # noqa: BLE001
            if attempt == 4:
                raise
            print(f'  retry {attempt + 1}: {e}', file=sys.stderr)
            time.sleep(5 * (attempt + 1))
    with r:
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            cb(d.decompress(b) if d else b)
    if d:
        cb(d.flush())


def member_rows(url, members, name):
    """קובץ קטן (routes/trips/stops/calendar): כותרת → אינדקס, ושורות."""
    buf = io.BytesIO()
    stream_member(url, members, name, buf.write)
    rd = csv.reader(io.StringIO(buf.getvalue().decode('utf-8-sig')))
    hdr = next(rd)
    return {h.strip(): i for i, h in enumerate(hdr)}, rd


def member_lines(url, members, name, keep):
    """קובץ ענק (stop_times): עובר שורה-שורה בלי להחזיק את כולו בזיכרון.
    keep(first_field) קובע אם לפרק את השורה; מחזיר (כותרת, רשימת שורות שנשמרו)."""
    state = {'rest': b'', 'hdr': None}
    out = []

    def cb(chunk):
        data = state['rest'] + chunk
        lines = data.split(b'\n')
        state['rest'] = lines.pop()
        for ln in lines:
            if state['hdr'] is None:
                state['hdr'] = {h.strip(): i for i, h in enumerate(ln.decode('utf-8-sig').strip().split(','))}
                continue
            k = ln.split(b',', 1)[0]
            if keep(k):
                out.append(next(csv.reader([ln.decode('utf-8').rstrip('\r')])))

    stream_member(url, members, name, cb)
    if state['rest'].strip() and state['hdr'] is not None and keep(state['rest'].split(b',', 1)[0]):
        out.append(next(csv.reader([state['rest'].decode('utf-8').rstrip('\r')])))
    return state['hdr'] or {}, out
