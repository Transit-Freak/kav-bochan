const test=require('node:test'),assert=require('node:assert/strict'),coverage=require('../coverage.js');
const gaps=[{from:.4,to:.6,id:'gap'}];
test('no instruction across gap; suppress on approach and inside, resume after end',()=>{
 const rows=[{f:.2,kind:'right'},{f:.5,kind:'left'},{f:.8,kind:'right'}];
 assert.deepEqual(coverage.visible(rows,coverage.state(gaps,.1,1000)).map(m=>m.f),[.2]);
 for(const f of [.3,.4,.5,.6])assert.deepEqual(coverage.visible(rows,coverage.state(gaps,f,1000)),[]);
 assert.deepEqual(coverage.visible(rows,coverage.state(gaps,.61,1000)),[rows[0],rows[2]]);
 assert.equal(coverage.visible([{f:.6,kind:'left'}],coverage.state(gaps,.601,1000)).length,0);
 assert.match(coverage.warning(coverage.state(gaps,.35,1000)),/במקטע הבא/);
 assert.match(coverage.warning(coverage.state(gaps,.5,1000)),/במקטע הזה/);
});
test('invalid ranges rejected and overlaps merged',()=>{
 const result=coverage.intervals([{from:.4,to:.6},{from:.5,to:.8},{from:NaN,to:1},{from:.9,to:.3}],{},[],[]);
 assert.equal(result.length,1);assert.equal(result[0].to,.8);
});
const fs=require('node:fs'),vm=require('node:vm');const ctx={window:{}};
vm.runInNewContext(fs.readFileSync(require.resolve('../geo.js'),'utf8'),ctx);
const d=require('./fixtures/coverage-68.json');
test('raw GTFS 68 shortcut is blocked without changing geometry or other routes',()=>{
 const metrics=ctx.window.Geo.polylineMetrics(d.geom),snapshot=JSON.stringify(d);
 const rows=coverage.intervals([],metrics,d.geom,d.trip.stops);
 assert.equal(rows.length,1);assert.equal(rows[0].to,1);assert(rows[0].from>.99);
 assert(coverage.state(rows,1,metrics.total).blocked);
 const changed=d.geom.map(p=>[p[0]+.001,p[1]]);
 assert.equal(coverage.intervals([],metrics,changed,d.trip.stops).length,0);
 assert.equal(JSON.stringify(d),snapshot);
});
