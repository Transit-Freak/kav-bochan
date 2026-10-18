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
                   r"חזרה|חזרה ל|וחוזר|חוזרים|ויחזור|יחזור|בנסיעה|בנסיעה ב|להמשך|הרחובות|הכיכר|הכיכר ב|בצומת|צומת)\s+))+")
_END = re.compile(r"(והמשך|ויתחבר|ויתחברו|להמשך (?:ה)?מסלול|ממשיכים במסלול|וממשיכים במסלול|ונמשך במסלול|חזרה למסלול|ו?יסיים|ו?יסיימו)")
_START = re.compile(r"עד\s+(?:ל(?=כיכר|צומת))?(?:כיכר\s+|צומת\s+הרחובות\s+|צומת\s+|הרחובות\s+|הכיכר\s+)?([^,/()]{2,40}?)\s*(?:/|\\|פינת|פינה|–|-)\s*([^,()/]{2,40}?)"
                    r"\s*(?:\([^)]*\))?\s*(?:ללא שינוי|כרגיל)?\s*(?:,|$|(?=/))")
_LINES = re.compile(r"קו(?:ים|י)?\s+([\d\sא-ת,ו׳'\"]+?)(?=\s*(?:לכיוון|מ|ל|:|ו?קווי|$))")


def norm(s):
    """שם רחוב להשוואה: בלי גרשיים, בלי "רחוב/שד'", יוד ו-וו כפולות כמו ברישום."""
    s = str(s or "")
    s = re.sub(r"[\"'׳״`.]", "", s)
    s = re.sub(r"^(?:רחוב|רח|שדרות|שד|שדרת|דרך)\s+", "", s.strip())
    s = s.replace("יי", "י").replace("וו", "ו")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def clean_street(tok):
    t = re.sub(r"\([^)]*\)", " ", tok)
    t = re.sub(r"\s+", " ", t).strip(" .;:/")
    t = _LEAD.sub("", t).strip()
    t = re.sub(r"\s+(?:עד|ללא שינוי|לכיוון.*)$", "", t).strip()
    # "ששת הימים – עד לתחנה הסופית" — השם הוא רק עד המקף או "עד"
    t = re.split(r"\s[–-]\s|\sעד\s", t)[0].strip()
    return t


def line_numbers(text):
    """"קווים 16, 20, 350 לכיוון..." → {'16','20','350'}; "קו 3 משחמון" → {'3'}."""
    out = set()
    for m in re.finditer(r"קו(?:ו?ים|ו?י)?\s+((?:\d+[א-ת]?\s*(?:,|ו-?|-|\s)\s*)*\d+[א-ת]?)", text):
        out.update(re.findall(r"\d+[א-ת]?", m.group(1)))
    # "קו 359 דימונה / 373 רחובות / 378 ת"א" — עוד מספרים אחרי לוכסן, כל אחד עם היעד שלו
    if out:
        out.update(re.findall(r"/\s*(\d{1,3}[א-ת]?)\s+(?=[א-ת])", text))
    return out


def parse(desc):
    """פסקאות הוראה מתוך נוסח ההודעה: [{'lines': {...}, 'start': (A, B), 'steps': [רחוב, ...], 'text': ...}]."""
    out = []
    cur_lines = set()
    for raw in re.split(r"\n+", desc or ""):
        line = raw.strip()
        if not line:
            continue
        nums = line_numbers(line)
        # שורה של "קווים ... לכיוון ...:" בלי הוראה — חלה על השורה הבאה
        if nums and "עד" not in line:
            cur_lines = nums
            continue
        # תאריכים ושעות ("29/10/2026", "17:00") נראים כמו צומת "א/ב" — מוחקים לפני החיפוש
        line = re.sub(r"\b\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\b|\b\d{1,2}:\d{2}\b", " ", line)
        m = _START.search(line)
        if not m:
            continue
        lines = nums or cur_lines
        a, b = clean_street(m.group(1)), clean_street(m.group(2))
        rest = line[m.end():]
        e = _END.search(rest)
        if e:
            rest = rest[:e.start()]
        # הוראה שלילית ("לא פונים שמאלה לויצמן") נמחקת עד הפסיק; "לא X אלא Y" — נשאר Y
        rest = re.sub(r"(?:(?<=[\s,;(])|^)ו?לא\s[^,;)]*?(?=\sאלא\s|[,;)]|$)", "", rest)
        rest = re.sub(r"(?:(?<=[\s,;(])|^)אלא\s", "", rest)
        steps = []
        # פסיק, ו"ו" לפני פנייה, וגם פנייה בלי פסיק לפניה ("המשך ביאליק ימינה אבא הלל")
        for tok in re.split(r",|;|\sו(?=(?:ימינה|שמאלה|ישר|המשך|יפנה|ימשיך))|\s(?=(?:ימינה|שמאלה)\s)", rest):
            # "פרסה בכיכר" — לא רחוב; "לא פונים ימינה ל..." / "(לא לפנות)" — הוראה שלילית, לא שלב בדרך
            if re.search(r"פרסה|סיבוב", tok) or re.match(r"^\s*(?:ו?לא|אלא|אין)\b", tok.strip()):
                continue
            st = clean_street(tok)
            # פועל בלי רחוב ("יפנה"), ומשפט שלם במקום שם רחוב (יותר מחמש מילים, או מספר תחנה/שעה) — לא שלב
            if (st and len(norm(st)) >= 2 and not re.match(r"^(?:ישר|ימינה|שמאלה|יפנה|יפנו|ימשיך|ימשיכו|בכיכר|בצומת)$", st)
                    and len(st.split()) <= 5 and not re.search(r"מק\"?ט|תחנה|\d{3,}|:", st)):
                steps.append(st)
        if steps:
            out.append({"lines": set(lines), "start": (a, b), "steps": steps, "text": line})
    return out


# ------------------------------------------------------------------ גרף רחובות
LAT0 = 31.5


def meters(a, b):
    kx = 111320 * math.cos(math.radians((a[0] + b[0]) / 2))
    return math.hypot((a[1] - b[1]) * kx, (a[0] - b[0]) * 110574)


class Streets:
    """רשת הרחובות מתשובת Overpass (out geom): צומת = נקודה משותפת בין שני רחובות."""

    def __init__(self, ways):
        self.pos = {}
        self.adj = collections.defaultdict(list)
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
            nn = norm(name)
            if nn:
                self.names.add(nn)
                self.by_name[nn].update(nodes)
            for a, b in zip(nodes, nodes[1:]):
                d = meters(a, b)
                if fwd:
                    self.adj[a].append((b, d, nn, hw))
                if back:
                    self.adj[b].append((a, d, nn, hw))

    def match(self, street):
        """השמות ברשת שמתאימים לרחוב מההודעה ("לדנמרק" → "דנמרק", "ז'בוטינסקי" → "זבוטינסקי")."""
        s = norm(street)
        cands = [s]
        if len(s) > 3 and s[0] in "לבו":
            cands.append(s[1:])
        if len(s) > 4 and s[:2] in ("לה", "בה"):
            cands.append(s[1:])
        out = set()
        for c in cands:
            if len(c) < 2:
                continue
            for n in self.names:
                if n == c or set(n.split(" ")) == set(c.split(" ")) or (len(c) >= 3 and (c in n.split(" ") or n.endswith(" " + c) or n.startswith(c + " ") or (len(c) >= 5 and c in n))):
                    out.add(n)
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

    def dijkstra(self, src, names, targets, pen=6.0, limit=12000):
        """הדרך הקצרה מ-src לאחד היעדים, כשקטע שלא ברחוב הנוכחי עולה פי pen."""
        dist = {src: 0.0}
        prev = {}
        pq = [(0.0, src)]
        while pq:
            d, u = heapq.heappop(pq)
            if d > dist.get(u, 1e18):
                continue
            if u in targets:
                path = [u]
                while path[-1] != src:
                    path.append(prev[path[-1]])
                return path[::-1], d
            if d > limit:
                break
            for v, w, nm, hw in self.adj[u]:
                c = w * (1 if nm in names else pen) + (500 if hw in ("service", "track", "footway", "path") else 0)
                nd = d + c
                if nd < dist.get(v, 1e18):
                    dist[v] = nd
                    prev[v] = u
                    heapq.heappush(pq, (nd, v))
        return None, None


def seg_dist(p, a, b):
    kx = 111320 * math.cos(math.radians(p[0]))
    ax, ay = (a[1] - p[1]) * kx, (a[0] - p[0]) * 110574
    bx, by = (b[1] - p[1]) * kx, (b[0] - p[0]) * 110574
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, -(ax * dx + ay * dy) / L))
    return math.hypot(ax + t * dx, ay + t * dy)


def route_detour(net, para, shape, cut0, cut1, max_len=15000):
    """מסלול לפי פסקת הוראה אחת, לקו שהשרטוט שלו shape ([lat,lon]) והקטע המבוטל שלו cut0..cut1.

    מחזיר {'path','i_out','i_in','streets','len'} או None כשאי אפשר לנתב לפי הנוסח."""
    a, b = para["start"]
    na, nb = net.match(a), net.match(b)
    if not na or not nb:
        return None
    first = net.match(para["steps"][0])
    if not first:
        return None
    # צומת היציאה: הנקודות של שני רחובות הצומת שקרובות זו לזו וגם קרובות למסלול לפני הקטע המבוטל
    jn = net.near(net.nodes_of(na), net.nodes_of(nb), 40) | net.near(net.nodes_of(nb), net.nodes_of(na), 40)
    lo = max(0, cut0 - 400)
    before = shape[lo:cut0 + 1]
    if not jn or not before:
        return None
    near_route = [n for n in jn if min(meters(n, q) for q in before[::2]) < 60]
    if not near_route:
        return None
    cpt = (sum(n[0] for n in near_route) / len(near_route), sum(n[1] for n in near_route) / len(near_route))
    start_c = [n for n in net.nodes_of(first) if meters(n, cpt) < 60 and net.adj[n]]
    if not start_c:
        return None
    src = min(start_c, key=lambda n: meters(n, cpt))
    i_out = lo + min(range(len(before)), key=lambda i: meters(before[i], cpt))
    legs, streets, cur = [], [], src
    steps = para["steps"]
    for k, st in enumerate(steps):
        names = net.match(st)
        if not names:
            return None
        nxt = net.match(steps[k + 1]) if k + 1 < len(steps) else None
        if k + 1 < len(steps) and not nxt:
            return None
        if nxt:
            tg = net.near(net.nodes_of(names), net.nodes_of(nxt), 40) - {cur}
        else:
            tail = shape[cut1 + 1:]
            tg = {n for n in net.pos if any(meters(n, q) < 12 for q in tail[:600:2])} - {cur}
        if not tg:
            return None
        p, _ = net.dijkstra(cur, names, tg)
        if not p:
            return None
        legs.append(p)
        streets.append(st)
        cur = p[-1]
    path = [n for leg in legs for n in leg]
    tail = shape[cut1 + 1:]
    if not tail:
        return None
    i_in = cut1 + 1 + min(range(min(len(tail), 1200)), key=lambda i: meters(tail[i], cur))
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
