import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {searchLines,aggregate,decodePolyline,archiveGeometry} from '../lines/model.mjs';
const built=fs.existsSync(new URL('../lines/data/index.json',import.meta.url));
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
test('catalog contains every source line and joins reliability only by makat',{skip:!built},()=>{
 const idx=read('lines/data/index.json'),seen=new Set();const buckets=new Map();const routes=read('bus/data/routes.json');
 for(const r of idx.lines){assert(!seen.has(r.makat));seen.add(r.makat);if(!buckets.has(r.bucket))buckets.set(r.bucket,read('lines/data/'+r.bucket+'.json'));const d=buckets.get(r.bucket)[r.makat];assert.equal(d.makat,r.makat);for(const v of d.variants){assert.equal(String(routes[v.rid][0]),r.makat);assert.equal(routes[v.rid][4],v.dir);assert.equal(routes[v.rid][5],v.alt);}for(const g of d.groups)assert(g.makats.includes(r.makat));}
 for(const r of read('data-main.json'))assert(seen.has(String(r[0])),r[0]);
 for(const r of Object.values(routes))if(r[1]&&r[3]!=='רכבת ישראל')assert(seen.has(String(r[0])));
});
test('all bucket hashes match catalog, data finite and scores match existing precompute',{skip:!built},()=>{
 const idx=read('lines/data/index.json'),prior=read('data-lines.json'),old=new Map(prior.lines.map(x=>[x.groupKey,x]));
 const fresh=prior.deps?.live===read('kavpach-live.json').gen && prior.deps?.overlap===read('kavpach-overlap.json').gen && prior.deps?.deadhead===read('bus/data/deadhead.json').updated;
 for(const [b,hash]of Object.entries(idx.files)){const raw=fs.readFileSync(new URL('../lines/data/'+b+'.json',import.meta.url));assert.equal(crypto.createHash('sha256').update(raw).digest('hex').slice(0,12),hash);for(const r of Object.values(JSON.parse(raw))){for(const s of r.schedule){assert(s[5]>0);assert(Number.isFinite(s[3]));assert(Number.isFinite(s[4]));}for(const g of r.groups){if(g.sc){assert(g.sc.score>=0&&g.sc.score<=100);const before=old.get(g.groupKey);if(fresh&&before?.sc)assert.equal(g.sc.score,before.sc.score);}if(g.gold)assert(g.gold.score>=60&&g.gold.score<=100);}}}
});
test('exact line number ranks above partial number, same numbers stay distinct, city spelling matches',()=>{
 const a={makat:'1',number:'1',origin:'קרית מלאכי',dest:'',agencies:[],cities:[]},b={...a,makat:'2',number:'10'},c={...a,makat:'3',origin:'ירושלים'};
 assert.deepEqual(searchLines([b,c,a],'1 קריית מלאכי').map(r=>r.makat),['1','2']);assert.equal(searchLines([a,c],'1').length,2);assert.equal(searchLines([a],'משהו שלא קיים').length,0);
});
test('reliability uses counts, preserves zero observations and no measured arrivals',()=>{
 const a=aggregate([['x',20,0,0,[0,0,0,0,0],[null],[]],['y',10,8,100,[10,50,20,10,10],[4],[0,8,0,0,0]],['z',10,9,10,[0,0,0,0,10],[20],[]]]);
 assert.equal(a.sched,40);assert.equal(a.obs,17);assert.equal(a.meas,110);assert.equal(a.c[1],50);assert.equal(a.sum/a.weighted,600/110);assert.equal(aggregate([]).weighted,0);
});
test('compressed archive decodes ordered stops and shape without making up missing geometry',()=>{
 const shape='_p~iF~ps|U_ulLnnqC_mqNvxq`@';assert.deepEqual(decodePolyline(shape),[[38.5,-120.2],[40.7,-120.95],[43.252,-126.453]]);
 const g=archiveGeometry({pool:[['a','A',1,2]],spool:['',shape],versions:[{d:'2026-01-01',stops:[0],shp:1}]});assert.equal(g.stops[0][0],'a');assert.equal(g.points.length,3);assert.equal(archiveGeometry({versions:[]}),null);
});
