#!/usr/bin/env bash
# מדד דיוק האוטובוסים — "היום": עדכון כל 10 דקות בתוך ריצה אחת ארוכה של .github/workflows/bus-today.yml
# (GitHub כמעט לא מפעיל את ה-cron של */10 במאגר הזה, ולכן לולאה בתוך הריצה ולא תזמון).
#
#   tools/bus_today_loop.sh run UNTIL      — עדכונים כל INTERVAL שניות עד UNTIL (epoch); בסוף כותב d=<תאריך המטמון> ל-GITHUB_OUTPUT
#   tools/bus_today_loop.sh prune KEEP     — מוחק את מטמוני bus-today- חוץ מ-KEEP (רק אם KEEP קיים)
#
# כל עדכון: התאריך בישראל (תאריך חדש אחרי חצות — מטמון חדש מאפס), GTFS של היום (פעם ביום, אחר כך pickle),
# הורדת דקות ה-SIRI שעוד חסרות (מ-00:00 בישראל עד לפני 2 דקות), חישוב (tools/bus_reliability.py --partial)
# ופרסום: today.json וקובצי היום מכווצים (days/D.*.json.gz) ב-commit יחיד בענף bus-today (force).
#
# משתנים: CACHE (cache), SITE (.), INTERVAL (600), B (S3 של דאטאבוס), GH_TOKEN/GITHUB_REPOSITORY לפרסום,
# DRY=1 — בלי פרסום (הקבצים נשארים ב-pub/), NOW_CMD — לבדיקות: פקודה שמדפיסה "עכשיו" ב-epoch.
set -uo pipefail

CACHE=${CACHE:-cache}
SITE=${SITE:-.}
INTERVAL=${INTERVAL:-600}
B=${B:-https://openbus-stride-public.s3.eu-west-1.amazonaws.com}
TOOLS=$(cd "$(dirname "$0")" && pwd)
now() { if [ -n "${NOW_CMD:-}" ]; then eval "$NOW_CMD"; else date -u +%s; fi; }
ilday() { TZ=Asia/Jerusalem date -d "@$1" +%F; }
log() { echo "[$(TZ=Asia/Jerusalem date -d "@$(now)" +%H:%M:%S)] $*"; }

# מורידה את מה שחסר ליום D עד END (epoch). מחזירה 1 אם אין עדיין GTFS ליום
download() {
  local D=$1 END=$2 Y=${1:0:4} M=${1:5:2} DD=${1:8:2}
  mkdir -p "$CACHE/siri"
  if [ ! -s "$CACHE/gtfs.pkl" ] && [ ! -s "$CACHE/gtfs.zip" ]; then
    if ! curl -fsS -o "$CACHE/gtfs.zip" "$B/gtfs_archive/$Y/$M/$DD/israel-public-transportation.zip"; then
      rm -f "$CACHE/gtfs.zip"; log "אין עדיין GTFS של $D בארכיון"; return 1
    fi
  fi
  local start t u l old=$(( END - 3600 )) list="$CACHE/list.txt"
  start=$(TZ=Asia/Jerusalem date -d "$D 00:00" +%s)
  : > "$list"
  for (( t=start; t<=END; t+=60 )); do
    u=$(date -u -d "@$t" +%Y/%m/%d/%H/%M)
    l="$CACHE/siri/${u:0:4}${u:5:2}${u:8:2}${u:11:2}/${u:14:2}.br"
    [ -s "$l" ] && continue
    # דקה שחסרה ב-S3 יותר משעה — לא תגיע; מסומנת כדי שלא ננסה שוב
    [ -e "$l.none" ] && continue
    echo "stride-siri-requester/$u.br $l $t" >> "$list"
  done
  local n; n=$(wc -l < "$list")
  cut -d' ' -f2 "$list" | xargs -r -n1 dirname | sort -u | xargs -r mkdir -p
  OLD=$old B=$B xargs -r -P 16 -n 3 sh -c 'curl -fsS --retry 3 -o "$1.tmp" "$B/$0" && mv "$1.tmp" "$1" || { rm -f "$1.tmp"; [ "$2" -lt "$OLD" ] && touch "$1.none"; true; }' < "$list"
  rm -f "$list"
  log "SIRI: $n דקות חסרו · $(find "$CACHE/siri" -name '*.br' | wc -l) קבצים · $(du -sh "$CACHE/siri" | cut -f1)"
}

publish() {
  rm -rf pub/git && mkdir -p pub/git/days
  cp pub/out/today.json pub/git/
  for f in $(python3 -c "import json; print(' '.join(json.load(open('pub/out/today.json'))['files']))"); do
    gzip -9 -c "pub/out/$f" > "pub/git/$f.gz"
  done
  log "לפרסום: $(du -sb pub/git | cut -f1) בתים ($(ls pub/git/days | wc -l) קבצים)"
  [ "${DRY:-}" = 1 ] && return 0
  ( cd pub/git && git init -q -b bus-today && git add -A &&
    git -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" commit -q -m "data: bus — היום עד עכשיו" &&
    { git push -q --force "https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" bus-today ||
      { sleep 10; git push -q --force "https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" bus-today; }; } )
}

update() {
  local T D END
  T=$(now); D=$(ilday "$T")
  # חצות בישראל: יום חדש — מתחילים מטמון חדש
  if [ "$(cat "$CACHE/day" 2>/dev/null)" != "$D" ]; then
    [ -e "$CACHE/day" ] && log "יום חדש ($D) — המטמון של $(cat "$CACHE/day") נמחק"
    rm -rf "$CACHE"; mkdir -p "$CACHE"; echo "$D" > "$CACHE/day"
  fi
  END=$(( T / 60 * 60 - 120 ))
  download "$D" "$END" || return 0
  rm -rf pub/out
  if ! python3 "$TOOLS/bus_reliability.py" --day "$D" --gtfs "$CACHE/gtfs.zip" --siri "$CACHE/siri" --partial \
      --now "$(date -u -d "@$(( END + 60 ))" +%FT%TZ)" --st-cache "$CACHE/gtfs.pkl" --out pub/out --site "$SITE" \
      --workers 4 --no-rishui > pub.log 2>&1; then
    tail -20 pub.log; log "החישוב נכשל"; return 0
  fi
  tail -1 pub.log
  # ה-zip נדרש רק לריצה הראשונה של היום (ה-pickle מחזיק את מה שצריך)
  [ -s "$CACHE/gtfs.pkl" ] && rm -f "$CACHE/gtfs.zip"
  publish || log "הפרסום נכשל"
  now > "$CACHE/last"
}

case "${1:-}" in
  run)
    UNTIL=$2
    mkdir -p pub "$CACHE"
    while :; do
      T=$(now)
      # עדכון אחרון לפני פחות מ-INTERVAL (המקטע הקודם של אותה ריצה) — מחכים לסימון הבא
      last=$(cat "$CACHE/last" 2>/dev/null || echo 0)
      if [ $(( T - last )) -ge $(( INTERVAL - 60 )) ]; then update; T=$(now); fi
      next=$(( (T / INTERVAL + 1) * INTERVAL ))
      [ "$next" -ge "$UNTIL" ] && break
      sleep $(( next - T ))
    done
    [ -n "${GITHUB_OUTPUT:-}" ] && echo "d=$(cat "$CACHE/day" 2>/dev/null)" >> "$GITHUB_OUTPUT"
    exit 0 ;;
  prune)
    KEEP=$2
    keys=$(gh api "repos/$GITHUB_REPOSITORY/actions/caches?key=bus-today-&per_page=100" --jq '.actions_caches[] | "\(.id) \(.key)"') || exit 0
    echo "$keys" | grep -q " $KEEP\$" || { echo "המטמון $KEEP לא נמצא — לא מוחקים"; exit 0; }
    echo "$keys" | while read -r id key; do
      [ -n "$id" ] && [ "$key" != "$KEEP" ] && gh api -X DELETE "repos/$GITHUB_REPOSITORY/actions/caches/$id" >/dev/null && echo "נמחק $key"
    done
    exit 0 ;;
  *) echo "usage: $0 run UNTIL | prune KEEP" >&2; exit 2 ;;
esac
