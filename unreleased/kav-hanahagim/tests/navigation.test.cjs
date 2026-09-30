const test = require('node:test');
const assert = require('node:assert/strict');
const nav = require('../navigation.js');
test('known turn is visible 525m ahead, even when station is 720m away', () => {
  const total = 18787, stopF = .42316, driverF = stopF - 720 / total;
  const turn = nav.next(nav.prepare([{f:.41279,kind:'right'}]), driverF,total);
  assert.equal(turn.kind,'right'); assert(Math.abs(turn.meters - 525.17881)<.01);
});
test('no arbitrary lookahead cutoff, including intercity routes',()=>{
  assert.equal(nav.next(nav.prepare([{f:.9,kind:'left'}]),0,100000).meters,90000);
});
test('sort without mutating source and reject invalid instructions',()=>{
  const input=[{f:.8,kind:'right'},{f:NaN,kind:'left'},{f:.2,kind:'left'},{f:2,kind:'right'},{f:.3,kind:'bogus'}];
  assert.deepEqual(nav.prepare(input).map(x=>x.f),[.2,.8]);assert.equal(input[0].f,.8);
});
test('nearby opposite turns and roundabouts are not collapsed',()=>{
  const rows=nav.prepare([{f:.1,kind:'left'},{f:.11,kind:'right'},{f:.12,kind:'roundabout',exit:null}],1000);
  assert.equal(rows.length,3);assert.equal(nav.next(rows,.09,1000).kind,'left');
  assert.equal(nav.next(rows,.121,1000).kind,'right');
});
test('only identical duplicates removed; no guessed turns when none exist',()=>{
 const row={f:.2,kind:'right'}; assert.equal(nav.prepare([row,{...row}]).length,1);
 assert.equal(nav.next([],0,1000),null);assert.equal(nav.next([row],.3,1000),null);
});
test('prefer a supplied exit at the exact same position in either input order',()=>{
  const missing={f:.10731,kind:'roundabout',exit:null,name:'כיכר מאי 1945'};
  const known={f:.10731,kind:'roundabout',exit:2,name:'שדרות המייסדים'};
  for(const input of [[missing,known],[known,missing]]) {
    const snapshot=JSON.stringify(input);
    const rows=nav.prepare(input);
    assert.equal(rows.length,1);
    assert.equal(nav.next(rows,.1,10000).exit,2);
    assert.equal(rows[0].name,known.name);
    assert.equal(JSON.stringify(input),snapshot);
  }
});
test('keep missing exits when supplied exits conflict or refer to another position',()=>{
  const missing={f:.2,kind:'roundabout',exit:null};
  assert.equal(nav.prepare([missing,{...missing,exit:1},{...missing,exit:2}]).length,3);
  assert.equal(nav.prepare([missing,{...missing,f:.20001,exit:2}]).length,2);
  assert.equal(nav.prepare([missing,{...missing,f:.8,exit:2}]).length,2);
  for(const exit of [-1,1.5,'2']) assert.equal(nav.prepare([missing,{...missing,exit}]).length,2);
  assert.equal(nav.prepare([missing,{f:.2,kind:'right',exit:2}]).length,2);
});

const fs=require('node:fs'),vm=require('node:vm');
const geoContext={window:{}};
vm.runInNewContext(fs.readFileSync(require.resolve('../geo.js'),'utf8'),geoContext);
const Geo=geoContext.window.Geo, speech=require('../speech.js');
for(const id of ['16558','16579','16687']) test(`Kastina ${id}: entrance precedes terminal and is spoken before entry`,()=>{
 const d=require(`./fixtures/kastina/${id}.json`), metrics=Geo.polylineMetrics(d.geom);
 const context={metrics,stops:d.trip.stops}, snapshot=JSON.stringify(d);
 const rows=nav.prepare(d.maneuvers,metrics.total,context);
 const added=rows.filter(m=>m.source==='verified-osm-114696253');
 assert.equal(added.length,1);
 const m=added[0],stop=d.trip.stops.find(s=>s.code==='11168');
 assert((stop.f-m.f)*metrics.total>35);
 assert.equal(nav.next(rows,m.f-50/metrics.total,metrics.total).source,m.source);
 assert.equal(speech.instruction(speech.nextTurn(rows,m.f-30/metrics.total,metrics.total)),'פנו ימינה');
 assert.equal(nav.prepare(rows,metrics.total,context).length,rows.length);
 assert.equal(JSON.stringify(d),snapshot);
 // Reverse traversal and a shifted parallel road must not receive an entrance.
 for(const geom of [[...d.geom].reverse(),d.geom.map(p=>[p[0]+.001,p[1]])]) {
   const other=Geo.polylineMetrics(geom);
   assert.equal(nav.prepare([],other.total,{metrics:other,stops:d.trip.stops}).length,0);
 }
 assert.equal(nav.prepare([],metrics.total,{metrics,stops:[]}).length,0);
 const existing={f:m.f,kind:'right'};
 assert.deepEqual(nav.prepare([existing],metrics.total,context).map(r=>r.kind),['right']);
});
