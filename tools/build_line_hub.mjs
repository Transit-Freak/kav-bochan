// Build the unified view from the same parser and scoring functions as the old sites.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import crypto from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p));
const json=p=>JSON.parse(read(p));
const core=createRequire(import.meta.url)(path.join(root,'kavpach-core.js'));
const ctx={console,TextDecoder,TextEncoder,importScripts(){},postMessage(){}};ctx.self=ctx;
vm.createContext(ctx);vm.runInContext(read('xlsx-worker.js').toString(),ctx);
const ab=p=>{const b=read(p);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};
ctx.payload={jsonMainBuf:ab('data-main.json'),jsonScheduleBuf:ab('data-schedule.json'),jsonBenchmarkBuf:ab('data-benchmark.json')};
const parsed=vm.runInContext('parseJSON(payload)',ctx);
// Reuse the exact golden calculation from the existing app; fail loudly if its contract changes.
const jsx=read('KavPach.jsx').toString();
const defaults=jsx.match(/const GOLD_DEFAULTS = ([\s\S]*?);\nconst PACH_DEFAULTS/);
const calculation=jsx.match(/const goldenLines = useMemo\(\(\) => \{([\s\S]*?)\n  \}, \[trips, costBenchmarkTable, liveOf, gset\]\);/);
if(!defaults||!calculation)throw Error('Golden calculation changed: update the shared adapter before publishing');
const live=json('kavpach-live.json');
const liveOf=mk=>live.lines[String(mk).replace(/^0+/,'').trim()]||null;
const gc={...core,trips:parsed.trips,costBenchmarkTable:parsed.costBenchmark,liveOf};vm.createContext(gc);
vm.runInContext(`const gset=${defaults[1]}; result=(()=>{${calculation[1]}\n})();`,gc);
const gold=new Map(gc.result.map(x=>[x.groupKey,x]));
const pset=json('data-lines.json').psetDefaults;
const scored=core.aggregateLineGroups(parsed.trips,parsed.costBenchmark);
const scoreContext={pset,liveOf,overlapMap:json('kavpach-overlap.json').lines,dhObs:json('bus/data/deadhead.json')};
const records=new Map();
const get=mk=>{mk=String(mk);if(!records.has(mk))records.set(mk,{makat:mk,number:'',origin:'',dest:'',agencies:[],cities:[],variants:[],groups:[],schedule:[],stops:[],live:liveOf(mk)});return records.get(mk)};
for(const t of parsed.trips){const r=get(t.makat);r.number=t.lineNum;r.origin=t.origin;r.dest=t.dest;r.district=t.district;r.schedule.push([t.direction,t.time,t.daysList,t.ridership,t.peakLoad,t.tripCount,t.busSize]);}
for(const s of scored){const g=gold.get(s.groupKey)||null;const p=core.scoreCore(s,scoreContext);for(const mk of s.makats||[s.makat])get(mk).groups.push({...s,sc:p,gold:g});}
for(const [rid,c] of Object.entries(json('bus/data/routes.json'))){if(!c[1]||c[3]==='רכבת ישראל')continue;const r=get(c[0]);r.number ||= c[1];r.agencies.push(c[3]);r.variants.push({rid,dir:c[4],alt:c[5],name:c[2],agency:c[3],cluster:c[8],type:c[9]});}
for(const [mk,code,city,name] of json('data-stops.json')){const r=records.get(String(mk));if(r){r.cities.push(city);r.stops.push([code,city,name]);}}
const out=path.join(root,'lines/data');fs.mkdirSync(out,{recursive:true});
const buckets=Array.from({length:100},()=>({}));const catalog=[];
for(const r of records.values()){
 r.agencies=[...new Set(r.agencies)].filter(Boolean);r.cities=[...new Set(r.cities)].filter(Boolean);
 r.stops=[...new Map(r.stops.map(s=>[s[0],s])).values()];
 const bucket=String(Number(r.makat)%100).padStart(2,'0');
 buckets[Number(bucket)][r.makat]=r;
 catalog.push({makat:r.makat,number:r.number,origin:r.origin,dest:r.dest,agencies:r.agencies,cities:r.cities,bucket,removed:!!r.live?.rm});
}
const files={};for(let i=0;i<100;i++){const b=String(i).padStart(2,'0');const body=JSON.stringify(buckets[i]);fs.writeFileSync(path.join(out,b+'.json'),body);files[b]=crypto.createHash('sha256').update(body).digest('hex').slice(0,12);}
const sources=['data-main.json','data-schedule.json','data-stops.json','KavPach.jsx','kavpach-core.js','xlsx-worker.js','kavpach-live.json','kavpach-overlap.json','bus/data/routes.json','bus/data/deadhead.json'];
const signatures=Object.fromEntries(sources.map(p=>[p,crypto.createHash('sha256').update(read(p)).digest('hex')]));
fs.writeFileSync(path.join(out,'index.json'),JSON.stringify({schema:1,passengerPeriod:'יוני 2026',liveUpdated:live.gen,scoringUpdated:json('bus/data/deadhead.json').updated,signatures,files,lines:catalog}));
console.log(`Unified catalog: ${catalog.length} lines, ${gc.result.length} golden groups, 100 lazy-loaded buckets`);
