"""המרת GLB ל-glTF אחד עם הנתונים בתוכו (base64), בשם X.gltf.json — למקומות שלא מגישים קבצי .glb
(למשל התצוגה המקדימה הפרטית). loadAssets ב-js/actors.js מנסה קודם X.glb ואחר כך X.gltf.json.
הקבצים האלה גדולים — לא שומרים אותם בריפו.

הרצה: python3 tools/glb_to_gltf_json.py assets/bus.glb assets/people/*.glb   (נכתב ליד כל קובץ)
"""
import base64, json, struct, sys


def convert(path):
    b = open(path, 'rb').read()
    magic, ver, total = struct.unpack('<4sII', b[:12])
    assert magic == b'glTF' and ver == 2, path
    off, doc, binc = 12, None, b''
    while off < total:
        ln, typ = struct.unpack('<I4s', b[off:off + 8]); chunk = b[off + 8:off + 8 + ln]; off += 8 + ln
        if typ == b'JSON': doc = json.loads(chunk)
        elif typ == b'BIN\x00': binc = chunk
    if doc.get('buffers'):
        doc['buffers'][0] = {'byteLength': len(binc), 'uri': 'data:application/octet-stream;base64,' + base64.b64encode(binc).decode()}
    out = path[:-4] + '.gltf.json'
    json.dump(doc, open(out, 'w'), separators=(',', ':'))
    print(out)


if __name__ == '__main__':
    for p in sys.argv[1:]: convert(p)
