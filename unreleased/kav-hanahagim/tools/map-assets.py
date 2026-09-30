"""Download versioned map runtime packages and retain original license notices."""
import urllib.request,urllib.parse,json,tarfile,io,hashlib,base64,concurrent.futures
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def fetch(url):
 with urllib.request.urlopen(url,timeout=60) as r:return r.read()
def save(path,data):
 path=ROOT/path;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
def package(spec):
 name,version,expected,files=spec
 folder=ROOT/'packages'/name.replace('/','_')/'package'
 if not folder.exists():
  meta=json.loads(fetch('https://registry.npmjs.org/'+name+'/'+version));assert meta['license']==expected,meta['license']
  data=fetch(meta['dist']['tarball']);alg,digest=meta['dist']['integrity'].split('-',1)
  assert base64.b64encode(hashlib.new(alg,data).digest()).decode()==digest
  folder.parent.mkdir(parents=True,exist_ok=True)
  tarfile.open(fileobj=io.BytesIO(data),mode='r:gz').extractall(folder.parent,filter='data')
 meta=json.loads((folder/'package.json').read_text());assert meta['license']==expected
 for src,dest in files:save(dest,(folder/src).read_bytes())
 return name
SPECS=[
 ('maplibre-gl','5.6.1','BSD-3-Clause',[('dist/maplibre-gl.js','vendor/maplibre-gl.js'),('dist/maplibre-gl.css','vendor/maplibre-gl.css'),('dist/LICENSE.txt','licenses/MapLibre.txt')]),
 ('@maplibre/maplibre-gl-leaflet','0.1.0','ISC',[('leaflet-maplibre-gl.js','vendor/leaflet-maplibre-gl.js'),('LICENSE','licenses/MapLibre-Leaflet.txt')]),
 ('@protomaps/basemaps','5.7.2','BSD-3-Clause',[]),
 ('@mapbox/mapbox-gl-rtl-text','0.2.3','BSD-2-Clause',[('mapbox-gl-rtl-text.js','vendor/rtl-text.js'),('LICENSE.md','licenses/RTL-text.txt')]),
]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for name in pool.map(package,SPECS):print('verified package',name,flush=True)
ASSET='https://raw.githubusercontent.com/protomaps/basemaps-assets/028c18f713baecad011301ff7a69acc39bcc2ae7/'
files=[('fonts/OFL.txt','licenses/Map-fonts.txt')]
for font in ['Noto Sans Regular','Noto Sans Medium','Noto Sans Italic']:
 for start in list(range(0,2304,256))+[8192,64000,64256,65024,65280]:
  path=f'fonts/{font}/{start}-{start+255}.pbf';files.append((path,'maps/'+path))
for theme in ['light','dark']:
 for suffix in ['.json','.png','@2x.json','@2x.png']:
  path='sprites/v4/'+theme+suffix;files.append((path,'maps/'+path))
def asset(item):
 src,dest=item;target=ROOT/dest
 if not target.exists():save(dest,fetch(ASSET+urllib.parse.quote(src)))
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:list(pool.map(asset,files))
save('licenses/Protomaps-basemaps.txt',fetch('https://raw.githubusercontent.com/protomaps/basemaps/main/LICENSE.md'))
print('assets ready',flush=True)
