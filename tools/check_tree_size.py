# -*- coding: utf-8 -*-
"""שומר מפני "tree object too large" של GitHub (שלמה 30.09).

ב-29.09 נכשלה ריצת historical-2012-2018: בתיקייה אחת (early-patterns) היו
כל כך הרבה קבצים שאובייקט ה-tree שלה עבר 50 מגה, ו-GitHub דחה את הדחיפה.
התיקון היה פיצול לתת-תיקיות. הבדיקה הזו מוצאת כל תיקייה שמתקרבת לגבול לפני
שזה קורה: גודל tree ≈ לכל רשומה (מצב + שם + 22 בתים). מעל WARN — אזהרה,
מעל FAIL — כישלון, עם הצעה לפצל לפי שני התווים הראשונים של שם הקובץ.
"""
import collections, subprocess, sys

WARN, FAIL = 10 * 2**20, 30 * 2**20   # הגבול של GitHub: 50 מגה
files = subprocess.run(['git', 'ls-files', '-z'], capture_output=True, text=True, check=True).stdout.split('\0')
size = collections.Counter(); count = collections.Counter(); kids = collections.defaultdict(set)
for f in filter(None, files):
    parts = f.split('/')
    for i in range(len(parts)):
        d = '/'.join(parts[:i]) or '.'
        name = parts[i]
        if name in kids[d]:
            continue
        kids[d].add(name)
        size[d] += 7 + len(name.encode()) + 22
        count[d] += 1
bad = 0
for d, s in size.most_common(10):
    tag = 'FAIL' if s > FAIL else 'WARN' if s > WARN else 'ok'
    print(f'{tag:4} {s / 2**20:6.2f}MB {count[d]:8,} רשומות  {d}')
    if s > FAIL:
        bad += 1
        print(f'     ↳ לפצל: {d}/<2 תווים ראשונים>/<קובץ> — כמו line-history/data/early-patterns')
sys.exit(1 if bad else 0)
