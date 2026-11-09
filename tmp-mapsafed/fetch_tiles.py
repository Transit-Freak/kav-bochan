import os, math, time, urllib.request, tarfile
UA = "kav-bochan-map/1.0 (one-off render of a bus-change map; github.com/Transit-Freak/kav-bochan)"
def deg2num(lat, lon, z):
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return x, y
boxes = [  # (zmin, zmax, lat0, lat1, lon0, lon1)
    (12, 16, 32.915, 33.005, 35.455, 35.555),
    (17, 17, 32.950, 32.980, 35.480, 35.510),
    (18, 18, 32.962, 32.972, 35.490, 35.502),
]
n = 0
for zmin, zmax, la0, la1, lo0, lo1 in boxes:
    for z in range(zmin, zmax + 1):
        x0, y1 = deg2num(la0, lo0, z); x1, y0 = deg2num(la1, lo1, z)
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                p = f"tiles/{z}/{x}/{y}.png"
                if os.path.exists(p): continue
                os.makedirs(os.path.dirname(p), exist_ok=True)
                req = urllib.request.Request(f"https://tile.openstreetmap.org/{z}/{x}/{y}.png", headers={"User-Agent": UA})
                for a in range(3):
                    try:
                        open(p, "wb").write(urllib.request.urlopen(req, timeout=30).read()); n += 1; break
                    except Exception as e:
                        print("retry", p, e); time.sleep(2)
                time.sleep(0.05)
print("tiles", n)
with tarfile.open("tiles.tgz", "w:gz") as t: t.add("tiles")
