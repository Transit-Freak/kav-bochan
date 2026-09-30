// Usage: node tools/audit-navigation.cjs <nahagim-data checkout> <report.json>
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const nav = require('../navigation.js');
const root = process.argv[2];
if (!root) throw new Error('Expected path to nahagim-data checkout');
function read(p) { const b=fs.readFileSync(path.join(root,p));return JSON.parse(p.endsWith('.gz')?zlib.gunzipSync(b):b); }
const index = read(fs.existsSync(path.join(root,'index.json.gz'))?'index.json.gz':'index.json');
const summary = {routes:index.routes.length,filesChecked:0,roadRoutesChecked:0,excludedNonRoad:0,excludedByType:{},missingFiles:0,invalidRoutes:0,invalidManeuvers:0,invalidStops:0,selectorFailures:0,unknownRoundaboutExits:0,routesWithInstructions:0,status:{},samples:0};
const issues=[];
// Explicit non-road modes have no bus-driving geometry contract. Unknown modes
// remain subject to the strict validation below. Keep file/id checks for all modes.
const nonRoadTypes=new Set(['רכבת','רכבת קלה','קרונית']);
for (const route of index.routes) {
  const id=String(route.id);
  if (!/^[\w-]+$/.test(id)) {summary.invalidRoutes++;issues.push({id,issue:'invalid-route-id'});continue;}
  let data;
  try {data=read('routes/'+id+'.json.gz');summary.filesChecked++;}
  catch (e) {summary.missingFiles++;issues.push({id,issue:'missing-or-unreadable',detail:e.message});continue;}
  if (nonRoadTypes.has(route.type)&&data.type===route.type) {
    summary.excludedNonRoad++;summary.excludedByType[route.type]=(summary.excludedByType[route.type]||0)+1;
    issues.push({id,line:route.shortName,type:route.type,issue:'non-road-mode-outside-driving-audit'});continue;
  }
  summary.roadRoutesChecked++;
  const status=data.nav?.status || 'none';summary.status[status]=(summary.status[status]||0)+1;
  const total=data.totalMeters, raw=Array.isArray(data.maneuvers)?data.maneuvers:[];
  const prepared=nav.prepare(raw,total);
  const flags=[];
  if (!Number.isFinite(total)||total<=0||!Array.isArray(data.geom)||data.geom.length<2||data.geom.some(p=>!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1]))) {summary.invalidRoutes++;flags.push('invalid-geometry');}
  const invalid=raw.filter(m=>!m||!Number.isFinite(m.f)||m.f<0||m.f>1||!['left','right','keep-left','keep-right','roundabout'].includes(m.kind)).length;
  summary.invalidManeuvers+=invalid;if(invalid)flags.push('invalid-maneuvers');
  const stops=data.trip?.stops;
  if (!Array.isArray(stops)) {summary.invalidStops++;flags.push('missing-stops');}
  else {
    let last=-1;
    for(const s of stops) {if(!s||!Number.isFinite(s.f)||s.f<last||s.f<0||s.f>1||!Number.isFinite(s.lat)||!Number.isFinite(s.lon)){summary.invalidStops++;flags.push('invalid-stop');break;}last=s.f;}
  }
  const unknown=prepared.filter(m=>m.kind==='roundabout'&&!(Number.isInteger(m.exit)&&m.exit>0)).length;
  summary.unknownRoundaboutExits+=unknown;if(unknown)flags.push('unknown-roundabout-exit');
  if(prepared.length)summary.routesWithInstructions++;
  // Replay progress at every 100m and immediately around each instruction.
  // A known future turn must never disappear merely because it is far away.
  const positions=new Set([0,1]);
  if(Number.isFinite(total)&&total>0) {
    for(let m=0;m<total;m+=100)positions.add(m/total);
    for(const mv of prepared)for(const offset of [-500,-21,-19,0,19,21])positions.add(Math.max(0,Math.min(1,mv.f+offset/total)));
    let previous=-1;
    for(const f of [...positions].sort((a,b)=>a-b)) {
      summary.samples++;
      const cue=nav.next(prepared,f,total);
      const expected=prepared.find(m=>(m.f-f)*total>-20);
      if(Boolean(cue)!==Boolean(expected)||cue&&(cue.f!==expected.f||cue.f<previous||!Number.isFinite(cue.meters)||cue.meters<0)) {summary.selectorFailures++;flags.push('selector-failure');break;}
      if(cue)previous=cue.f;
    }
  }
  if(status!=='ok')flags.push('source-'+status);
  if(flags.length)issues.push({id,line:route.shortName,flags:[...new Set(flags)],nav:data.nav,instructions:prepared.length});
}
const report={built:index.built,gtfsDate:index.gtfs_date,scope:'All indexed files checked; driving geometry and selection replay exclude explicitly identified non-road modes. Not verification of real-world road legality or complete junction coverage.',summary,issues};
const out=process.argv[3]||'navigation-audit.json';fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## Navigation data audit\n\n```json\n'+JSON.stringify(summary,null,2)+'\n```\n\nPartial source coverage is reported separately; this audit does not invent missing turns.\n');
if(summary.missingFiles||summary.invalidRoutes||summary.invalidManeuvers||summary.invalidStops||summary.selectorFailures)process.exitCode=1;
