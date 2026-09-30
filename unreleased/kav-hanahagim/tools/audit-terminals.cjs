// Read-only screening, not proof of complete entrance coverage or turn legality.
// node tools/audit-terminals.cjs <feed> <report.json>
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),vm=require('node:vm');
const context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../geo.js'),'utf8'),context);
const Geo=context.window.Geo,nav=require('../navigation.js');
const root=process.argv[2];if(!root)throw Error('Expected feed directory');
const read=p=>JSON.parse(p.endsWith('.gz')?zlib.gunzipSync(fs.readFileSync(path.join(root,p))):fs.readFileSync(path.join(root,p)));
const index=read('index.json'),byStop=new Map(),codes=new Set(),issues=[],errors=[];
let busRoutes=0,visits=0,arrivals=0,originVisits=0;
for(const route of index.routes){
 if(route.type!=='אוטובוס')continue;busRoutes++;
 let d;try{d=read('routes/'+route.id+'.json.gz');}catch(e){errors.push({id:route.id,error:e.message});continue;}
 const stops=d.trip?.stops||[],terminals=stops.filter(s=>/מסוף|מרכזית/.test(s.name||''));
 if(!terminals.length)continue;
 const metrics=Geo.polylineMetrics(d.geom),rows=nav.prepare(d.maneuvers,metrics.total,{metrics,stops});
 for(const stop of terminals){
  visits++;codes.add(stop.code);
  if(stop===stops[0]){originVisits++;continue;}arrivals++;
  const near=rows.filter(m=>(stop.f-m.f)*metrics.total>=0&&(stop.f-m.f)*metrics.total<=600);
  const key=String(stop.code);
  const entry={routeId:route.id,line:route.shortName,stopCode:key,stopName:stop.name,stopF:stop.f,metrics,near,rows};
  if(!byStop.has(key))byStop.set(key,[]);byStop.get(key).push(entry);
  const flags=[];
  if(!near.length)flags.push('no-supplied-instruction-in-600m-approach');
  if(near.some(m=>m.kind==='roundabout'&&!(Number.isInteger(m.exit)&&m.exit>0)))flags.push('unknown-roundabout-exit-on-approach');
  const stopOffset=Geo.metersBetween(metrics.pointAt(stop.f),[stop.lat,stop.lon]);
  if(stopOffset>50)flags.push('stop-position-offset-over-50m');
  if(flags.length)issues.push({routeId:route.id,line:route.shortName,stopCode:key,stopName:stop.name,flags,stopOffsetMeters:Math.round(stopOffset)});
 }
}
// Compare only very similar local traversals serving the same stop. Agreement
// with another route is a review signal; never copy an instruction automatically.
const comparisons=[],seen=new Set();
for(const entries of byStop.values())for(let a=0;a<entries.length;a++)for(let b=a+1;b<entries.length;b++){
 const A=entries[a],B=entries[b];
 for(const ma of A.near){
  const pa=A.metrics.pointAt(ma.f);
  const mb=B.near.find(m=>Geo.metersBetween(pa,B.metrics.pointAt(m.f))<15);
  if(!mb)continue;
  const sig=m=>m.kind==='roundabout'?`roundabout:${m.exit||'unknown'}`:m.kind;
  if(sig(ma)===sig(mb))continue;
  if(![-40,40,80,120].every(offset=>{
   const fa=ma.f+offset/A.metrics.total,fb=mb.f+offset/B.metrics.total;
   return fa>=0&&fb>=0&&fa<=1&&fb<=1&&Geo.metersBetween(A.metrics.pointAt(fa),B.metrics.pointAt(fb))<15;
  }))continue;
  const key=[A.routeId,B.routeId,A.stopCode,ma.f,mb.f].join(':');if(seen.has(key))continue;seen.add(key);
  comparisons.push({stopCode:A.stopCode,stopName:A.stopName,lat:pa[0],lon:pa[1],a:{routeId:A.routeId,line:A.line,f:ma.f,instruction:sig(ma)},b:{routeId:B.routeId,line:B.line,f:mb.f,instruction:sig(mb)}});
 }
}
const summary={busRoutes,terminalStopCodes:codes.size,terminalVisits:visits,originVisits,arrivalVisits:arrivals,flaggedArrivals:issues.length,similarTraversalDisagreements:comparisons.length,readErrors:errors.length};
const report={built:index.built,gtfsDate:index.gtfs_date,scope:'Screen all bus routes for stops whose Hebrew name includes מסוף or מרכזית. Flags and pairwise disagreements require mapped-junction review; they are NOT counts of confirmed missing turns. Origin stops are excluded from arrival checks. No instruction is inferred or changed.',summary,issues,comparisons,errors};
fs.writeFileSync(process.argv[3]||'terminal-audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(summary));
if(errors.length)process.exitCode=1;
