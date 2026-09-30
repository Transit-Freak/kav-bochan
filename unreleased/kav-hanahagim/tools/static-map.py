"""Export an openly licensed regional PMTiles archive as ordinary static XYZ files."""
from pathlib import Path
import gzip,json,sys
from pmtiles.reader import MmapSource,all_tiles,Reader
src=Path(sys.argv[1]);out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
with src.open('rb') as f:
 source=MmapSource(f);r=Reader(source);header=r.header();count=0;size=0
 assert header['tile_compression'].name in ('GZIP','NONE'),header
 for (z,x,y),data in all_tiles(source):
  if header['tile_compression'].name=='GZIP':data=gzip.decompress(data)
  dest=out/str(z)/str(x)/f'{y}.pbf';dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data);count+=1;size+=len(data)
 (out.parent/'metadata.json').write_text(json.dumps(r.metadata(),ensure_ascii=False))
print(json.dumps({'tiles':count,'bytes':size}))
assert count>1000 and size<800_000_000,'Map outside development Pages budget'
