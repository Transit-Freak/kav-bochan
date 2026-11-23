"""בדיקות ל-tools/live_bus_index.py (האינדקס הקטן של "האוטובוס הבא", live-bus/index.json)."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
from live_bus_index import build, fix_t, size_lbl, kab_type  # noqa: E402
from kavpach_ridership import build as ridership_build  # noqa: E402


def write(root, rel, data):
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def fixture(root):
    # fleet.json גרסה 2: [מספר, נראה לראשונה, נראה לאחרונה, ציון, שנה, דגם, ?, סוג]
    write(root, "fleet/data/fleet.json", {"v": 2, "updated": "2026-11-23", "operators": [
        {"ref": 31, "name": "דן בדרום", "vehicles": [
            ["0012345", "2024-01-01", "2026-11-20", 1, 2020, "מרצדס", None, "צבורי עירוני"],
            ["777", "2024-01-01", "2026-11-21", 1, 2015, "יוטונג", None, "צבורי להסע מיוחד"],
            ["888", "2024-01-01", "2026-11-21", 1, 2016, "גולדן", None, "צבורי בין-עירוני"],
        ]},
        # חברה בלי אף רכב במאגר הרשמי (10 רכבים ומעלה) — לא מכוסה
        {"ref": 40, "name": "קטנה", "vehicles": [[str(900 + i), "2025-01-01", "2026-11-01", 1, 2019, "סטרים", None, "צבורי עירוני"] for i in range(10)]},
        # אותו רכב אצל חברה אחרת, נראה מאוחר יותר — הרשומה הזאת גוברת
        {"ref": 32, "name": "דן באר שבע", "vehicles": [["888", "2026-01-01", "2026-11-22", 1, 2016, "גולדן", None, "צבורי עירוני מפרק"]]},
        # חברה אחרת — לא באינדקס
        {"ref": 3, "name": "אגד", "vehicles": [["999", "2026-01-01", "2026-11-22", 1, 2016, "מאן", None, "צבורי עירוני"]]},
    ]})
    # fleet-official.json: מספר → [?, מושבים, ארץ, הנעה, סוג, גודל, אזור]
    write(root, "fleet/data/fleet-official.json", {"of": {
        "12345": [1, 50, "גרמניה", "חשמל", "עירוני", "מפרקי", "x"],
        "55555": [1, 0, "סין", "לא ידוע", "לא ידוע", "מיניבוס", "x"],
    }})
    write(root, "fleet/data/gov-details-7.json", {"777": {"mispar_moshavim": "", "mispar_mekomot": "38"}})
    write(root, "fleet/data/gov-details-5.json", {"55555": {"mispar_moshavim": "19"}})
    write(root, "line-history/data/lines.json", {"lines": [
        {"rd": "10001-1-#", "op": "דן בדרום", "dest": "מסוף-חיפה<->טכניון-חיפה-1#", "hs": "חיפה_טכניון", "hso": "חיפה_מסוף"},
        {"rd": "10001-1-1", "op": "דן באר שבע", "dest": "מסוף-חיפה<->נשר-נשר-11"},
        {"rd": "50005-1-0", "op": "אגד", "dest": "א-עפולה<->ב-עפולה-10"},
        {"rd": "20002-1-0", "dest": "א-קרית אונו<->ב-אור יהודה-10", "lk": "removed"},
        {"rd": "30003-2-0", "dest": "ג-טבריה<->ד-צפת-20", "historicalOnly": True},
        {"rd": "website-1", "dest": "x-y<->z-w"},
    ]})
    # מסלול הקו: גרסאות עם אינדקסים ל-pool; הגרסה האחרונה עם תחנות קובעת
    write(root, "line-history/data/lines/10001-1-H.json", {"pool": [["100", "א"], ["200", "ב"], ["300", "ג"]],
        "versions": [{"stops": [0, 1]}, {"stops": [2, 0]}, {"k": "x"}]})
    write(root, "kavpach-ridership.json", {"gen": "2026-11-23", "q": ["2025-Q4", "2026-Q1"], "m": {
        "10001": {"w": [900, 1000], "r": 40},
        "20002": {"w": [10, 20]},
        "40004": {"w": [500, None]},
    }})


def test_fleet_like_the_page(tmp_path):
    fixture(tmp_path)
    ix = build(str(tmp_path))
    assert ix["ops"] == {"31": "דן בדרום", "40": "קטנה", "32": "דן באר שבע", "3": "אגד"}
    assert ix["nocov"] == ["40"] and ix["ofc"] == 1
    vs = ix["vs"]
    row = lambda p: ix["veh"][p] + [None] * (8 - len(ix["veh"][p]))
    # במאגר הרשמי: מושבים, גודל, סוג והנעה משם; המספר בלי אפסים בהתחלה
    op, flag, seats, size, year, model, kind, prop = row("12345")
    assert (op, flag, seats, vs[size], year, vs[model], vs[kind], vs[prop]) == (31, 2, 50, "מפרקי (אקורדיון)", 2020, "מרצדס", "עירוני", "חשמל")
    # רכב הסעות שלא במאגר: דגל 1, מושבים מהרישוי
    op, flag, seats, size, year, model, kind, prop = row("777")
    assert (op, flag, seats, vs[size]) == (31, 1, 38, "אוטובוס רגיל")
    # הרשומה האחרונה (דן) גוברת; לא במאגר, לא הסעות — דגל 0
    op, flag, seats, size, *_ = row("888")
    assert (op, flag, seats, vs[size]) == (32, 0, None, "מפרקי (אקורדיון)")
    # רק רכבים שבצי של דן בדרום / דן באר שבע: לא של אגד, ולא רכב שרק במאגר הרשמי
    assert "999" not in ix["veh"] and "55555" not in ix["veh"] and "900" not in ix["veh"]


def test_lines_cities_and_ride(tmp_path):
    fixture(tmp_path)
    ix = build(str(tmp_path))
    assert ix["lines"] == [["10001-1-#", "מסוף-חיפה<->טכניון-חיפה-1#", "חיפה_טכניון", "חיפה_מסוף"],
                           ["10001-1-1", "מסוף-חיפה<->נשר-נשר-11"]]
    # ערי היעד — מכל הקווים, גם אלה שירדו
    assert ix["cities"] == ["חיפה", "נשר", "עפולה", "קרית אונו", "אור יהודה", "טבריה", "צפת", "y", "w"]
    # התחנות של הקווים (המסלול האחרון), והערים של הקווים — רק אלה שמופיעות מספיק פעמים
    assert ix["stops"] == ["100", "300"]
    assert ix["area"] == []
    # נוסעים — רק לקווים פעילים; הרבעון האחרון שיש בו נתון, ומספר הנסיעות אם יש
    assert ix["rq"] == ["2025-Q4", "2026-Q1"] and ix["ride"] == {"10001": [1000, 1, 40]}


def test_missing_sources(tmp_path):
    write(tmp_path, "kavpach-ridership.json", {"q": ["2026-Q1"], "m": {"5": {"w": [7]}}})
    ix = build(str(tmp_path))
    assert "veh" not in ix and "lines" not in ix and ix["ride"] == {"5": [7, 0]}
    (tmp_path / "fleet" / "data").mkdir(parents=True)
    (tmp_path / "fleet" / "data" / "fleet.json").write_text("{not json")
    assert "veh" not in build(str(tmp_path))


def test_helpers():
    assert fix_t('אוטובוס צבורי להסע מיוחד') == 'אוטובוס הסעות' and kab_type(fix_t('צבורי להסע מיוחד'))
    assert fix_t('צבורי משהו') == 'ציבורי משהו' and not kab_type('אוטובוס עירוני')
    assert size_lbl(None, 'אוטובוס דו-קומתי') == 'דו-קומתי' and size_lbl('מידיבוס', 'x') == 'מידיבוס'
    assert size_lbl(None, '') == '' and size_lbl(None, 'מיניבוס') == 'מיניבוס'


def test_ridership_rides():
    rows = [
        {"RouteID": 10001, "year": 2026, "Q": "Q1", "WeeklyPassengers": 600, "WeekyRides": 20},
        {"RouteID": 10001, "year": 2026, "Q": "Q1", "WeeklyPassengers": 400, "WeekyRides": 20},
        {"RouteID": 10001, "year": 2025, "Q": "Q4", "WeeklyPassengers": 900, "WeekyRides": 30},
        # כיוון בלי מספר נסיעות — בלי ממוצע לנסיעה
        {"RouteID": 20002, "year": 2026, "Q": "Q1", "WeeklyPassengers": 50, "WeekyRides": 5},
        {"RouteID": 20002, "year": 2026, "Q": "Q1", "WeeklyPassengers": 50, "WeekyRides": None},
    ]
    out = ridership_build(rows)
    assert out["q"] == ["2025-Q4", "2026-Q1"]
    assert out["m"]["10001"] == {"w": [900, 1000], "r": 40}
    assert out["m"]["20002"] == {"w": [None, 100]}


def test_area(tmp_path):
    import live_bus_index
    write(tmp_path, "line-history/data/lines.json", {"lines": [
        {"rd": f"{60000 + i}-1-0", "op": "דן באר שבע", "dest": "א-באר שבע<->ב-באר שבע-10"} for i in range(10)] + [
        {"rd": "70001-1-0", "op": "דן בדרום", "dest": "א-אשקלון<->ב-שדרות-10"}]})
    old = live_bus_index.AREA_MIN
    live_bus_index.AREA_MIN = 2
    try:
        assert build(str(tmp_path))["area"] == ["באר שבע"]
    finally:
        live_bus_index.AREA_MIN = old
