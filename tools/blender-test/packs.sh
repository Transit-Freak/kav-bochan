# חבילות נכסים של קהילת MakeHuman — רק CC0 (ובנפרד CC-BY אם צריך קרדיט)
UD="$1"
curl -s http://files.makehumancommunity.org/asset_packs/ | grep -oE 'href="[^"]+/"' | cut -d'"' -f2 | tee /tmp/packs.txt | head -80
for d in $(cat /tmp/packs.txt); do
  case "$d" in *cc0*|*CC0*) ;; *) continue;; esac
  for z in $(curl -s "http://files.makehumancommunity.org/asset_packs/$d" | grep -oE 'href="[^"]+\.zip"' | cut -d'"' -f2); do
    echo "PACK $d$z"; curl -sL -o /tmp/p.zip "http://files.makehumancommunity.org/asset_packs/$d$z" && unzip -qo /tmp/p.zip -d "$UD/data" || true
  done
done
find "$UD/data/clothes" -name '*.mhclo' | sed 's|.*/clothes/||' | sort | tee /tmp/clothes.txt | wc -l
cat /tmp/clothes.txt
