#!/usr/bin/env bash
# הארכיון הכבד של "הקו בזמן" — line-history/data/early-patterns ו-early-stops, כ-808 אלף קבצים
# ו-4.5GB — מתפרסם גם מהריפו kav-bochan-archive, ו-line-history/app.jsx (archFetch) קורא משם קודם.
# שלמה 13.10: "למה עדכון כזה קטן חצי שעה?" — GitHub Pages מעלה בכל פרסום את כל האתר מחדש.
#
# pages-deploy מוציא את שתי התיקיות מההורדה (sparse checkout), והסקריפט הזה מחזיר לאתר רק את
# הקבצים שאינם בארכיון בדיוק באותו תוכן (אותו blob) — למשל מה שיובא בשעה האחרונה ועוד לא
# סונכרן. כך שום קובץ לא נעלם: מה שלא בארכיון נשאר כאן, ו-archFetch נופל אליו.
#
# אם אי אפשר לקרוא את הארכיון, או שחסרים בו יותר מדי קבצים — כותב full=yes ל-GITHUB_OUTPUT,
# ו-pages-deploy מוריד את הכל כמו קודם.
set -uo pipefail
ARCH=Transit-Freak/kav-bochan-archive
OUT=${GITHUB_OUTPUT:-/dev/stdout}
MAX_NEED=${MAX_NEED:-400000}
full() { echo "::warning::הארכיון לא בשימוש בפרסום הזה: $1 — מעלים את כל הקבצים כמו קודם"; echo "full=yes" >> "$OUT"; exit 0; }

last() {   # התוצאה של הריצה האחרונה *שהסתיימה* של workflow בריפו הארכיון
  # 24.10: סנכרון גדול רץ שעה; ההמתנה לו נגמרה ב"running" ← הורדה מלאה ← חריגה מזמן הריצה.
  # ריצה שבאמצע לא משנה את מה שכבר מפורסם באתר הארכיון — לכן לא מחכים לה
  local wf=$1
  gh api "repos/$ARCH/actions/workflows/$wf/runs?per_page=10" \
    --jq '[.workflow_runs[] | select(.status == "completed")][0].conclusion // "none"' 2>/dev/null || echo "unknown"
}
# סנכרון או בדיקה שנכשלו — רק אזהרה (שלמה 01.11): ההשוואה למטה היא מול מה שבאמת מפורסם באתר הארכיון,
# וכל קובץ שאינו שם חוזר לאתר הראשי, כך שגם אחרי סנכרון כושל שום קובץ לא נעלם. הורדה מלאה כבר לא
# אפשרית — האתר כולו עבר את מגבלת ה-10GB של GitHub Pages (01.11: שש ריצות פרסום נכשלו כך ברצף)
s=$(last sync.yml); [ "$s" = success ] || echo "::warning::הסנכרון האחרון של הארכיון: $s — הקבצים שחסרים שם יעלו מכאן"
v=$(last verify.yml); [ "$v" = success ] || echo "::warning::בדיקת אתר הארכיון האחרונה: $v"

# משווים מול הגרסה שבאמת מפורסמת באתר הארכיון (הפריסה האחרונה ל-Pages), לא מול HEAD — סנכרון
# שבאמצע דוחף מנות שעוד לא עלו לאתר, ואותן אסור להוציא מהאתר הראשי
sha=$(gh api "repos/$ARCH/deployments?environment=github-pages&per_page=1" --jq '.[0].sha' 2>/dev/null)
[ -n "$sha" ] && [ "$sha" != null ] || full "לא מצאתי את הגרסה המפורסמת של הארכיון"
echo "הארכיון המפורסם: $sha"
rm -rf /tmp/arch && git init -q /tmp/arch && git -C /tmp/arch remote add origin "https://github.com/$ARCH.git"
git -C /tmp/arch fetch -q --depth 1 --filter=blob:none origin "$sha" || full "לא הצלחתי לקרוא את הארכיון"
git -C /tmp/arch ls-tree -r "$sha" early-patterns early-stops | awk '{print $3" "$4}' | sort > /tmp/arch.lst
git ls-tree -r HEAD line-history/data/early-patterns line-history/data/early-stops \
  | awk '{sub("^line-history/data/","",$4); print $3" "$4}' | sort > /tmp/main.lst
total=$(wc -l < /tmp/main.lst)
comm -23 /tmp/main.lst /tmp/arch.lst > /tmp/need.pairs
awk '{print "/line-history/data/"$2}' /tmp/need.pairs > /tmp/need.lst
need=$(wc -l < /tmp/need.lst)
echo "בארכיון $(wc -l < /tmp/arch.lst) קבצים · באתר $total · שאינם בארכיון באותו תוכן: $need"
[ "$total" -gt 0 ] || full "אין קבצים בתיקיות הארכיון באתר — משהו לא תקין"
[ "$need" -le "$MAX_NEED" ] || full "$need קבצים חסרים בארכיון (יותר מ-$MAX_NEED)"
# 04.11: הייבוא ההיסטורי רץ ברצף והוסיף עשרות אלפי קבצים לפני שהארכיון הספיק להסתנכרן (65 אלף).
# "sparse-checkout add" לרשימת קבצים כזו איטי מאוד, ו"הכל" כבר מעל מגבלת ה-10GB — שתי ריצות נכשלו.
# במקום זה: מורידים רק את התוכן (blobs) של הקבצים החסרים בבקשה אחת, וכותבים אותם ישר לתיקיית האתר
if [ "$need" -gt 0 ]; then
  head -5 /tmp/need.lst
  cut -d' ' -f1 /tmp/need.pairs | sort -u | git -c fetch.negotiationAlgorithm=noop fetch -q --stdin --no-tags \
    --no-write-fetch-head --recurse-submodules=no --filter=blob:none origin || full "לא הצלחתי להוריד את הקבצים החסרים"
  python3 - <<'PY' || full "לא הצלחתי לכתוב את הקבצים החסרים"
import os, subprocess
pairs = [l.rstrip('\n').split(' ', 1) for l in open('/tmp/need.pairs')]
p = subprocess.Popen(['git', 'cat-file', '--batch'], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
total = 0
for sha, rel in pairs:
    p.stdin.write((sha + '\n').encode()); p.stdin.flush()
    head = p.stdout.readline().split()
    if len(head) < 3 or head[1] != b'blob':
        raise SystemExit(f'missing blob {sha} {rel}')
    n = int(head[2]); data = p.stdout.read(n); p.stdout.read(1)
    path = os.path.join('line-history/data', rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f: f.write(data)
    total += n
p.stdin.close(); p.wait()
print(f'נכתבו {len(pairs):,} קבצים שאינם בארכיון · {total / 1e6:.0f}MB')
PY
fi
# בדיקה: כל קובץ שאינו בארכיון קיים עכשיו בתיקיית האתר
missing=0
while IFS= read -r f; do [ -f ".${f}" ] || missing=$((missing + 1)); done < /tmp/need.lst
[ "$missing" -eq 0 ] || full "$missing קבצים לא הורדו"
echo "full=no" >> "$OUT"
