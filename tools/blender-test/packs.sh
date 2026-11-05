# חבילות הבגדים של קהילת MakeHuman: מוצאים מדף האינדקס את דפי החבילות, ומכל דף את קובץ ה-zip והרישיון
UD="$1"; B=https://static.makehumancommunity.org/assets/assetpacks
curl -sL "$B/index.html" -o /tmp/idx.html; echo "index $(wc -c < /tmp/idx.html)"
grep -oE 'href="[^"#]+\.html"' /tmp/idx.html | cut -d'"' -f2 | sort -u > /tmp/pages.txt; cat /tmp/pages.txt | tr '\n' ' '; echo
mkdir -p /tmp/packs; : > /tmp/packlic.txt
for p in $(cat /tmp/pages.txt); do
  case "$p" in *clothes*|*suit*|*dress*|*female*|*uniform*|*casual*|*fashion*|*shirt*|*skirt*|*military*|*army*) ;; *) continue;; esac
  u="$B/$p"; case "$p" in http*) u="$p";; /*) u="https://static.makehumancommunity.org$p";; esac
  curl -sL "$u" -o /tmp/pg.html
  lic=$(grep -oiE 'CC0|CC-BY[^<" ]*|AGPL' /tmp/pg.html | sort | uniq -c | sort -rn | head -2 | tr '\n' ' ')
  for z in $(grep -oE 'href="[^"]+\.zip"' /tmp/pg.html | cut -d'"' -f2 | sort -u); do
    zu="$z"; case "$z" in http*) ;; /*) zu="https://static.makehumancommunity.org$z";; *) zu="$(dirname "$u")/$z";; esac
    echo "PACK $p | $lic | $zu" | tee -a /tmp/packlic.txt
    curl -sL -o /tmp/p.zip "$zu" && unzip -qo /tmp/p.zip -d "/tmp/packs/$(basename $p .html)" || echo "  fail"
  done
done
# כל תיקיית clothes בתוך החבילות → לתיקיית הנתונים של MPFB, עם שם החבילה בתחילת שם הפריט
for d in /tmp/packs/*; do
  pk=$(basename "$d")
  find "$d" -type d -name clothes | while read c; do
    for it in "$c"/*/; do [ -d "$it" ] && cp -r "$it" "$UD/data/clothes/${pk}__$(basename "$it")"; done
  done
done
cp /tmp/packlic.txt "$UD/data/packlic.txt" 2>/dev/null
ls "$UD/data/clothes" | wc -l; ls "$UD/data/clothes" | tr '\n' ' '
