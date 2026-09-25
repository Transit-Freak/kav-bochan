"""Prepare GovMap layer 22 (via over.org.il) for the alternative selector.
Usage: python tools/build_neighborhoods.py SOURCE_GEOJSON_OR_GZIP
Coordinates are rounded to ~0.1m, without changing polygon topology or holes.
"""
import gzip,json,sys,pathlib
b=pathlib.Path(sys.argv[1]).read_bytes()
if b[:2]==b'\x1f\x8b': b=gzip.decompress(b)
d=json.loads(b);rows=[]
for f in d['features']:
 p=f['properties'];g=f['geometry']; polys=g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']]
 polys=[[[[round(x,6),round(y,6)] for x,y,*_ in ring] for ring in poly] for poly in polys]
 pts=[xy for poly in polys for ring in poly for xy in ring]
 rows.append([p.get('nbr_id',p.get('objectId')),p.get('fname','').strip(),p.get('setl_name',''),[min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts),max(y for x,y in pts)],polys])
out=pathlib.Path(__file__).resolve().parents[1]/'line-history/data/neighborhoods';out.mkdir(exist_ok=True)
for i in range(8):
 raw=json.dumps(rows[i::8],ensure_ascii=False,separators=(',',':')).encode()
 (out/f'{i}.json.gz').write_bytes(gzip.compress(raw,mtime=0))
meta={'source':'GovMap layer 22, Survey of Israel, mirrored by over.org.il','url':'https://over.org.il/versions/f6a7046f-921d-4fe2-b82d-b4eadc9c8a9b','snapshot':d.get('metadata',{}).get('scraped_at'),'count':len(rows),'shards':8,'columns':['id','name','city','bbox','multipolygon'],'crs':'EPSG:4326'}
(out/'source.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
print(len(rows),'polygons,',sum(p.stat().st_size for p in out.glob('*.gz')),'bytes compressed')
