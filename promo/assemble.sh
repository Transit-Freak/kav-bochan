set -e
P=/tmp/claude-0/-home-user/e04ae825-3a71-5659-8839-480e0b6973fc/scratchpad/promo; cd $P
rm -rf seq; mkdir seq; n=0
for s in s1 s2 s3 s4 s5 s6 s7; do for f in frames/$s/*.jpg; do n=$((n+1)); ln -s ../$f seq/$(printf %05d $n).jpg; done; done
echo frames $n
ffmpeg -y -loglevel error -framerate 24 -i seq/%05d.jpg -vf "scale=1080:1920:flags=lanczos,format=yuv420p" -c:v libx264 -preset slow -crf 20 -profile:v high -movflags +faststart -an bus-game-promo-vertical.mp4
ls -la bus-game-promo-vertical.mp4; ffprobe -v error -show_entries format=duration -of csv=p=0 bus-game-promo-vertical.mp4
