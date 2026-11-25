#!/usr/bin/env bash
# מדד אמינות הרכבת — "היום עד עכשיו" בלולאה (.github/workflows/rail-today.yml): כל 10 דקות (לפי השעון,
# ‎:00, :10, …) עד STOP — הורדת הדקות החסרות, חישוב (tools/rail_reliability.py --partial) ופרסום בענף
# rail-today. הלולאה לא נשענת על ה-cron של GitHub, שלא מופעל כל 10 דקות במאגר הזה.
#
#   tools/rail_today_loop.sh STOP_EPOCH
#
# המטמון: cache/<התאריך בישראל>/{siri/, sched.json.gz}. במעבר חצות נוצרת תיקייה של היום החדש
# והישנה נמחקת. בסוף נכתב d=<התאריך> ל-GITHUB_OUTPUT (למפתח של actions/cache).
# משתנים לבדיקה מקומית: RT_EVERY (שניות בין סבבים, ברירת מחדל 600), RT_SHIFT (שניות שמוסיפים לשעון —
# למשל כדי לעבור חצות), RT_DRY=1 (בלי דחיפה; הפלט נשאר ב-pub/), RT_MAX (מספר סבבים מרבי).
set -uo pipefail
STOP=${1:?STOP_EPOCH}
EVERY=${RT_EVERY:-600}
SHIFT=${RT_SHIFT:-0}
B=https://openbus-stride-public.s3.eu-west-1.amazonaws.com
TOOLS=$(cd "$(dirname "$0")" && pwd)
D=''
n=0

publish() {
  if [ "${RT_DRY:-}" = 1 ]; then echo "  (בדיקה: בלי דחיפה) $(ls pub | tr '\n' ' ')"; return 0; fi
  (
    cd pub && rm -rf .git && git init -q -b rail-today && git add summary.json day.json &&
    git -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
      commit -q -m "data: rail — היום עד עכשיו" &&
    git push -q --force "https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" rail-today
  ) && echo "  פורסם" || echo "  הפרסום נכשל"
}

once() {
  # "עכשיו" = לפני 2 דקות, מעוגל לדקה (הדקה האחרונה ש-S3 כבר קיבל); התאריך — בישראל
  local t=$(( ( $(date +%s) + SHIFT - 120 ) / 60 * 60 ))
  local now; now=$(date -u -d "@$t" +%FT%TZ)
  D=$(TZ=Asia/Jerusalem date -d "@$t" +%F)
  echo "== $(TZ=Asia/Jerusalem date -d "@$t" '+%F %H:%M') (ישראל)"
  for x in cache/*/; do [ -d "$x" ] && [ "$x" != "cache/$D/" ] && { rm -rf "$x"; echo "  מטמון ישן נמחק: $x"; }; done
  mkdir -p "cache/$D/siri"
  if [ ! -s "cache/$D/sched.json.gz" ]; then
    # ה-GTFS של היום עולה לארכיון בסביבות 02:00 בישראל — עד אז אין מה לחשב
    if ! curl -fsSI -o /dev/null "$B/gtfs_archive/${D:0:4}/${D:5:2}/${D:8:2}/israel-public-transportation.zip"; then
      echo "  אין עדיין GTFS של $D בארכיון — מדלגים"; return 0
    fi
  fi
  rm -rf pub
  if ! python3 "$TOOLS/rail_reliability.py" --partial --day "$D" --now "$now" --siri "cache/$D/siri" \
       --sched-cache "cache/$D/sched.json.gz" --out pub; then
    echo "  החישוב נכשל — ננסה שוב בסבב הבא"; return 0
  fi
  [ -s pub/summary.json ] && [ -s pub/day.json ] && publish
  return 0
}

while :; do
  once
  n=$((n + 1))
  [ -n "${RT_MAX:-}" ] && [ "$n" -ge "$RT_MAX" ] && break
  next=$(( ( ($(date +%s) + SHIFT) / EVERY + 1 ) * EVERY - SHIFT ))
  [ "$next" -ge "$STOP" ] && break
  sleep $(( next - $(date +%s) ))
done
echo "d=$D" >> "${GITHUB_OUTPUT:-/dev/null}"
echo "סיום הלולאה אחרי $n סבבים"
