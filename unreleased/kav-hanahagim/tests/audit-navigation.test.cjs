const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const {spawnSync}=require('node:child_process');
function audit(t,type,data){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nav-audit-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.mkdirSync(path.join(dir,'routes'));fs.writeFileSync(path.join(dir,'index.json'),JSON.stringify({routes:[{id:'1',type}]}));
 if(data)fs.writeFileSync(path.join(dir,'routes/1.json.gz'),zlib.gzipSync(JSON.stringify(data)));
 const report=path.join(dir,'report.json'),env={...process.env};delete env.GITHUB_STEP_SUMMARY;
 const result=spawnSync(process.execPath,[path.join(__dirname,'../tools/audit-navigation.cjs'),dir,report],{env,encoding:'utf8'});
 return {status:result.status,...JSON.parse(fs.readFileSync(report,'utf8'))};
}
const empty=type=>({type,geom:[],totalMeters:0,maneuvers:[],nav:{status:'none'},trip:{stops:[]}});
test('explicit non-road routes are reported separately, without requiring bus geometry',t=>{
 for(const type of ['רכבת','רכבת קלה','קרונית']){const r=audit(t,type,empty(type));assert.equal(r.status,0);assert.equal(r.summary.excludedNonRoad,1);assert.equal(r.summary.filesChecked,1);assert.equal(r.summary.roadRoutesChecked,0);assert.equal(r.issues[0].issue,'non-road-mode-outside-driving-audit');}
});
test('missing geometry still fails for buses, service and unknown modes',t=>{
 for(const type of ['אוטובוס','שירות','קו',undefined]){const r=audit(t,type,empty(type));assert.equal(r.status,1);assert.equal(r.summary.invalidRoutes,1);assert.equal(r.summary.excludedNonRoad,0);}
});
test('non-road label does not hide missing files or inconsistent mode metadata',t=>{
 assert.equal(audit(t,'רכבת',null).summary.missingFiles,1);
 const r=audit(t,'רכבת',empty('אוטובוס'));assert.equal(r.status,1);assert.equal(r.summary.invalidRoutes,1);
});
test('valid road route is replayed and malformed maneuvers still fail',t=>{
 const d={...empty('אוטובוס'),geom:[[32,34],[32.001,34]],totalMeters:111};
 const good=audit(t,'אוטובוס',d);assert.equal(good.status,0);assert(good.summary.samples>0);
 const bad=audit(t,'אוטובוס',{...d,maneuvers:[{f:2,kind:'left'}]});assert.equal(bad.status,1);assert.equal(bad.summary.invalidManeuvers,1);
});
