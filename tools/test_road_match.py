"""בדיקות ל-road_match עם כבישים מדומים (בלי OSM): שרטוט מחדש של אותו כביש, כביש מקביל, עקיפה, מחבר קצר, ולא ידוע"""
import os, sys, unittest
sys.path.insert(0, os.environ.get('RM_DIR', os.path.dirname(os.path.abspath(__file__))))
import road_match as rm

LAT = 32.40
def P(x_m, y_m):
    """נקודה במטרים מהראשית (x מזרחה, y צפונה)"""
    return [LAT + y_m / 110540.0, 34.90 + x_m / (111320.0 * 0.8443)]

def line(x, y0, y1, step=50):
    return [P(x, y) for y in range(y0, y1 + 1, step)]

class T(unittest.TestCase):
    def roads(self, *ways):
        return rm.Roads([{'n': n, 'g': g} for n, g in ways])

    def test_redigitised_same_road(self):
        # כביש 4: שני נתיבים 40 מ' זה מזה; הישן על הימני והחדש על השמאלי לאורך 600 מ' — אותו כביש
        R = self.roads(('כביש 4', line(0, -2000, 2000)), ('כביש 4', line(40, -2000, 2000)))
        old = line(40, -1000, 1000)
        new = line(40, -1000, -300) + line(0, -250, 250) + line(40, 300, 1000)
        fl = rm.road_flags(old, new, R)
        self.assertTrue(fl, fl)
        self.assertTrue(all(f[2] == 'same' for f in fl), fl)

    def test_parallel_street(self):
        # הקו עובר מרחוב הרצל לרחוב ז'בוטינסקי המקביל, 80 מ' ממנו — שינוי אמיתי
        R = self.roads(('הרצל', line(0, -2000, 2000)), ("ז'בוטינסקי", line(80, -2000, 2000)), ('ביאליק', [P(0, -500), P(80, -500)]), ('אחד העם', [P(0, 500), P(80, 500)]))
        old = line(0, -1000, 1000)
        new = line(0, -1000, -550) + [P(40, -500)] + line(80, -500, 500) + [P(40, 500)] + line(0, 550, 1000)
        fl = rm.road_flags(old, new, R)
        self.assertTrue(any(f[2] == 'diff' for f in fl), fl)

    def test_detour(self):
        # עקיפה: יציאה לרחוב צדדי ל-400 מ' וחזרה
        R = self.roads(('ראשי', line(0, -2000, 2000)), ('צדדי', [P(0, -200), P(300, -200), P(300, 200), P(0, 200)]))
        old = line(0, -1000, 1000)
        new = line(0, -1000, -250) + [P(0, -200), P(150, -200), P(300, -200), P(300, 0), P(300, 200), P(150, 200), P(0, 200)] + line(0, 250, 1000)
        fl = rm.road_flags(old, new, R)
        self.assertTrue(any(f[2] == 'diff' for f in fl), fl)

    def test_short_connector_ignored(self):
        # קטע קצר (פחות מ-50 מ') ליד מחבר עם שם אחר — עדיין אותו כביש
        R = self.roads(('כביש 2', line(0, -2000, 2000)), ('כביש 2', line(45, -2000, 2000)), ('מחלף', [P(0, 0), P(45, 30)]))
        old = line(0, -800, 800)
        new = line(0, -800, -310) + line(45, -300, 300) + line(0, 310, 800)
        fl = rm.road_flags(old, new, R)
        self.assertTrue(fl and all(f[2] == 'same' for f in fl), fl)

    def test_unknown_roads(self):
        # אין כבישים מוכרים — אין סימון (הדף מחליט לפי המרחק)
        R = self.roads(('רחוב רחוק', line(5000, -100, 100)))
        old = line(0, -1000, 1000)
        new = line(0, -1000, -300) + line(120, -250, 250) + line(0, 300, 1000)
        self.assertEqual(rm.road_flags(old, new, R), [])

    def test_off_runs_like_page(self):
        # כמו offRuns בדף: סטייה של 30 מ' (פחות מ-35) — אין קטע; סטייה של 100 מ' — קטע אחד
        old = line(0, -500, 500)
        self.assertEqual(rm.off_runs(line(0, -500, -50) + [P(30, 0)] + line(0, 50, 500), old), [])
        self.assertEqual(len(rm.off_runs(line(0, -500, -50) + [P(100, 0)] + line(0, 50, 500), old)), 1)

if __name__ == '__main__':
    unittest.main(verbosity=2)
