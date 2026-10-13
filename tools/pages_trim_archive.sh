#!/usr/bin/env bash
# הארכיון הכבד של "הקו בזמן" — line-history/data/early-patterns ו-early-stops, כ-808 אלף קבצים
# ו-4.5GB — מתפרסם גם מהריפו kav-bochan-archive, ו-line-history/app.jsx (archFetch) קורא משם קודם.
# שלמה 13.10: "למה עדכון כזה קטן חצי שעה?" — GitHub Pages מעלה בכל פרסום את כל האתר מחדש.
#
# pages-deploy מוציא את שתי התיקיות מההורדה (sparse checkout), והסקריפט הזה מחזיר לאתר רק את
# הקבצים שאינם בארכיון בדיוק באותו תוכן (אותו blob) — למשל מה שיובא בשעה האחרונה ועוד לא
# סונכרן. כך שום קובץ לא נעלם: מה שלא בארכיון נשאר כאן, ו-archFetch נופל אליו.
#
# אם אי אפשר לסמוך על הארכיון (הסנכרון או בדיקת האתר שלו לא הצליחו, או חסרים יותר מדי
# קבצים) — כותב full=yes ל-GITHUB_OUTPUT, ו-pages-deploy מוריד את הכל כמו קודם.
set -uo pipefail
ARCH=Transit-Freak/kav-bochan-archive
OUT=${GITHUB_OUTPUT:-/dev/stdout}
MAX_NEED=${MAX_NEED:-20000}
full() { echo "::warning::הארכיון לא בשימוש בפרסום הזה: $1 — מעלים את כל הקבצים כמו קודם"; echo "full=yes" >> "$OUT"; exit 0; }

last() {   # התוצאה של הריצה האחרונה של workflow בריפו הארכיון (מחכה עד 15 דק' לריצה שבאמצע)
  local wf=$1 i st
  for i in $(seq 1 30); do
    st=$(gh api "repos/$ARCH/actions/workflows/$wf/runs?per_page=1" --jq '.workflow_runs[0] | .status + " " + (.conclusion // "")' 2>/dev/null) || { echo "unknown"; return; }
    case "$st" in completed\ *) echo "${st#completed }"; return;; esac
    sleep 30
  done
  echo "running"
}
s=$(last sync.yml); [ "$s" = success ] || full "הסנכרון האחרון של הארכיון: $s"
v=$(last verify.yml); [ "$v" = success ] || full "בדיקת אתר הארכיון האחרונה: $v"

rm -rf /tmp/arch
git clone -q --filter=blob:none --no-checkout --depth 1 "https://github.com/$ARCH.git" /tmp/arch || full "לא הצלחתי לקרוא את הארכיון"
git -C /tmp/arch ls-tree -r HEAD early-patterns early-stops | awk '{print $3" "$4}' | sort > /tmp/arch.lst
git ls-tree -r HEAD line-history/data/early-patterns line-history/data/early-stops \
  | awk '{sub("^line-history/data/","",$4); print $3" "$4}' | sort > /tmp/main.lst
total=$(wc -l < /tmp/main.lst)
comm -23 /tmp/main.lst /tmp/arch.lst | awk '{print "/line-history/data/"$2}' > /tmp/need.lst
need=$(wc -l < /tmp/need.lst)
echo "בארכיון $(wc -l < /tmp/arch.lst) קבצים · באתר $total · שאינם בארכיון באותו תוכן: $need"
[ "$total" -gt 0 ] || full "אין קבצים בתיקיות הארכיון באתר — משהו לא תקין"
[ "$need" -le "$MAX_NEED" ] || full "$need קבצים חסרים בארכיון (יותר מ-$MAX_NEED)"
if [ "$need" -gt 0 ]; then
  head -5 /tmp/need.lst
  git sparse-checkout add --stdin < /tmp/need.lst || full "לא הצלחתי להוסיף את הקבצים החסרים"
fi
# בדיקה: כל קובץ שאינו בארכיון קיים עכשיו בתיקיית האתר
missing=0
while IFS= read -r f; do [ -f ".${f}" ] || missing=$((missing + 1)); done < /tmp/need.lst
[ "$missing" -eq 0 ] || full "$missing קבצים לא הורדו"
echo "full=no" >> "$OUT"
