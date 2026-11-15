#!/usr/bin/env python3
"""התחנות של עיר למשחק: world/<עיר>/gtfs_stops.csv — מתוך stops.txt של ה-GTFS בארכיון (S3 של "תחבורה פתוחה").

קורא מה-zip רק את stops.txt (בקשות Range), ושומר את התחנות שבתחום המפה של העיר (origin ו-half ב-world/cities.json).
הרצה:  python3 tools/fetch_gtfs_stops.py kiryat-gat [--date 2026-11-10]
"""
import argparse, csv, io, struct, sys, urllib.request, zlib
from citycfg import load_city, P_of

S3 = 'https://openbus-stride-public.s3.eu-west-1.amazonaws.com/gtfs_archive/{}/israel-public-transportation.zip'

def http(url, rng):
    req = urllib.request.Request(url, headers={'User-Agent': 'bus-game-tools', 'Range': rng})
    with urllib.request.urlopen(req, timeout=300) as r: return r.read(), r.headers

def member(url, name):
    tail, h = http(url, 'bytes=-66000')
    total = int(h['Content-Range'].rsplit('/', 1)[-1])
    i = tail.rfind(b'PK\x05\x06'); cd_size, cd_off = struct.unpack('<II', tail[i + 12:i + 20])
    if cd_off == 0xFFFFFFFF:
        j = tail.rfind(b'PK\x06\x06'); cd_size, cd_off = struct.unpack('<QQ', tail[j + 40:j + 56])
    base = total - len(tail)
    cd = tail[cd_off - base:cd_off - base + cd_size] if base <= cd_off else http(url, f'bytes={cd_off}-{cd_off + cd_size - 1}')[0]
    p = 0
    while p + 46 <= len(cd) and cd[p:p + 4] == b'PK\x01\x02':
        method, = struct.unpack('<H', cd[p + 10:p + 12]); csize, usize = struct.unpack('<II', cd[p + 20:p + 28])
        nlen, xlen, clen = struct.unpack('<HHH', cd[p + 28:p + 34]); lho, = struct.unpack('<I', cd[p + 42:p + 46])
        if csize == 0xFFFFFFFF or lho == 0xFFFFFFFF or usize == 0xFFFFFFFF:      # zip64: הערכים האמיתיים בשדה ההרחבה
            x = cd[p + 46 + nlen:p + 46 + nlen + xlen]; q = 0
            while q + 4 <= len(x):
                hid, hsz = struct.unpack('<HH', x[q:q + 4])
                if hid == 1:
                    vals = list(struct.unpack(f'<{hsz // 8}Q', x[q + 4:q + 4 + hsz]))
                    if usize == 0xFFFFFFFF: usize = vals.pop(0)
                    if csize == 0xFFFFFFFF: csize = vals.pop(0)
                    if lho == 0xFFFFFFFF: lho = vals.pop(0)
                q += 4 + hsz
        if cd[p + 46:p + 46 + nlen].decode() == name:
            lh = http(url, f'bytes={lho}-{lho + 29}')[0]; n2, x2 = struct.unpack('<HH', lh[26:30])
            start = lho + 30 + n2 + x2
            data = http(url, f'bytes={start}-{start + csize - 1}')[0]
            return zlib.decompress(data, -15) if method == 8 else data
        p += 46 + nlen + xlen + clen
    sys.exit(name + ' לא נמצא ב-zip')

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('city'); ap.add_argument('--date', default='2026-11-10'); ap.add_argument('--keep', default='')
    a = ap.parse_args()
    cfg = load_city(a.city); P = P_of(cfg); hx, hy = cfg['half']
    txt = member(S3.format(a.date.replace('-', '/')), 'stops.txt').decode('utf-8-sig')
    # city_stops ב-world/cities.json: רק תחנות שבעיר עצמה — לפי שדה העיר של התחנה ב-GTFS (stop_desc: "עיר: ..."),
    # ואם אין שדה כזה — התחנה נשארת (המיקום ייבדק ב-build_city, מול תחום הבנייה). תחנות בצמתים וביישובים מסביב יוצאות.
    # --keep: קודי תחנות שנשארות בכל מקרה (קצה של קו עירוני שנמצא מחוץ לעיר).
    import re
    only = cfg.get('city_stops'); norm = lambda t: re.sub(r'\s+', ' ', t.replace('קריית', 'קרית')).strip()
    keep = set(filter(None, (a.keep or '').split(',')))
    rows, gone = [], []
    for r in csv.DictReader(io.StringIO(txt)):
        x, y = P(float(r['stop_lat']), float(r['stop_lon']))
        if abs(x) <= hx and abs(y) <= hy and r.get('location_type', '0') in ('', '0'):
            m = re.search(r'עיר:\s*(.*?)\s*(?:רציף:|קומה:|$)', r.get('stop_desc') or '')
            town = norm(m.group(1)) if m else ''
            if only and town and town != norm(cfg['gtfs_name']) and r['stop_code'] not in keep:
                gone.append((r['stop_code'], r['stop_name'], town)); continue
            rows.append([r['stop_id'], r['stop_code'], r['stop_name'], r['stop_lat'], r['stop_lon']])
    if only:
        print('לא בעיר — הוסרו', len(gone), 'תחנות:')
        for g in sorted(gone, key=lambda g: (g[2], g[1])): print('  ', g[0], g[1], '·', g[2])
    rows.sort(key=lambda r: int(r[0]))
    out = cfg['path']('gtfs_stops.csv')
    with open(out, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f, lineterminator='\n'); w.writerow(['stop_id', 'stop_code', 'stop_name', 'stop_lat', 'stop_lon']); w.writerows(rows)
    print(len(rows), 'תחנות ->', out, '(GTFS', a.date + ')')

if __name__ == '__main__':
    main()
