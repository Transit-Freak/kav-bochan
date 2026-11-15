"""הגדרות העיר לכלי הבנייה: world/cities.json — לכל עיר שם, מרכז, גבולות, תושבים ותיקיית הקבצים שלה.

כל כלי מקבל את מזהה העיר כפרמטר ראשון (ברירת המחדל: העיר שב-"default", קריית מלאכי):
  python3 tools/build_city.py kiryat-gat
"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

def load_city(cid=None):
    all_ = json.load(open(os.path.join(ROOT, 'world', 'cities.json'), encoding='utf-8'))
    cid = cid or all_['default']
    if cid not in all_['cities']:
        raise SystemExit(f'אין עיר "{cid}" ב-world/cities.json. יש: ' + ', '.join(all_['cities']))
    cfg = dict(all_['cities'][cid]); cfg['id'] = cid
    cfg['dir'] = os.path.join(ROOT, *cfg['dir'].strip('/').split('/'))
    os.makedirs(cfg['dir'], exist_ok=True)
    cfg['path'] = lambda name: os.path.join(cfg['dir'], name)
    return cfg

def P_of(cfg):
    lat0, lon0 = cfg['origin']
    kx = 111320 * math.cos(math.radians(lat0)); ky = 110574
    return lambda lat, lon: ((lon - lon0) * kx, (lat - lat0) * ky)

def bbox_of(cfg, margin=150):
    """תיבת ההורדה מ-OSM (דרום, מערב, צפון, מזרח): מה שכתוב בהגדרות, או גבולות המפה ועוד שוליים"""
    if cfg.get('bbox'): return cfg['bbox']
    lat0, lon0 = cfg['origin']; hx, hy = cfg['half']
    dx = (hx + margin) / (111320 * math.cos(math.radians(lat0))); dy = (hy + margin) / 110574
    return f'{lat0 - dy:.4f},{lon0 - dx:.4f},{lat0 + dy:.4f},{lon0 + dx:.4f}'

if __name__ == '__main__':      # ל-workflow: python3 tools/citycfg.py kiryat-gat  →  bbox|תיקייה|שם
    import sys
    c = load_city(sys.argv[1] if len(sys.argv) > 1 else None)
    print(bbox_of(c) + '|' + os.path.relpath(c['dir'], ROOT) + '|' + c['name'])
