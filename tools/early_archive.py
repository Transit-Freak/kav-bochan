#!/usr/bin/env python3
"""קריאת קובץ מהארכיון הכבד של "הקו בזמן" (early-patterns, early-stops).

מאז שהייבוא ההיסטורי הסתיים (11.2026) שתי התיקיות נמצאות רק בריפו kav-bochan-archive ובאתר שלו,
ולא בריפו הראשי. קובץ שקיים מקומית (בדיקות, תיקייה זמנית) נקרא מכאן; אחרת — מאתר הארכיון.
"""
import gzip
import json
import time
import urllib.request
from pathlib import Path

ARCHIVE_BASE = 'https://transit-freak.github.io/kav-bochan-archive/'


def read_gz_json(root, rel):
    """rel — נתיב יחסי לתיקיית הנתונים, למשל early-patterns/ab/abcd.json.gz"""
    local = Path(root) / rel
    if local.exists():
        return json.loads(gzip.decompress(local.read_bytes()))
    err = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(ARCHIVE_BASE + str(rel), timeout=60) as r:
                return json.loads(gzip.decompress(r.read()))
        except Exception as e:  # רשת לא יציבה — עד ארבעה ניסיונות
            err = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f'הקובץ {rel} לא נמצא מקומית ולא נטען מהארכיון: {err}')


def patterns(root, key):
    return read_gz_json(root, f'early-patterns/{key[:2]}/{key}.json.gz')


def stops(root, sid):
    return read_gz_json(root, f'early-stops/{sid}.json.gz')
