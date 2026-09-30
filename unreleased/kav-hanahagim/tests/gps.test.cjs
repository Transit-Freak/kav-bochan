const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const context={window:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../geo.js'),'utf8'),context);
const {tracker}=require('../gps.js'),geo=context.window.Geo;
const metrics=geo.polylineMetrics([[32,34],[32,34.02]]);
const pos=(lon,stamp=100000,extra={})=>({timestamp:stamp,coords:{latitude:32,longitude:lon,accuracy:5,...extra}});
test('GPS progresses along the actual route and does not move backward with jitter',()=>{
 const t=tracker(metrics);const a=t.next(pos(34.005),100000);assert.equal(a.status,'active');assert(Math.abs(a.f-.25)<.001);
 const b=t.next(pos(34.0052,102000),102000);assert(b.f>a.f);
 const c=t.next(pos(34.0051,103000),103000);assert.equal(c.f,b.f);
});
test('reject inaccurate, stale, off-route and impossible jumps',()=>{
 const t=tracker(metrics);
 assert.equal(t.next(pos(34.005,100000,{accuracy:100}),100000).status,'inaccurate');
 assert.equal(t.next(pos(34.005),120000).status,'stale');
 assert.equal(t.next(pos(34.005,100000,{latitude:32.01}),100000).status,'offroute');
 assert.equal(t.next(pos(34.005),100000).status,'active');
 assert.equal(t.next(pos(34.018,101000),101000).status,'offroute');
});
test('overlapping outbound and return legs are ambiguous unless heading distinguishes them',()=>{
 const m=geo.polylineMetrics([[32,34],[32,34.02],[32,34]]);
 assert.equal(tracker(m).next(pos(34.005),100000).status,'ambiguous');
 const r=tracker(m).next(pos(34.005,100000,{heading:90,speed:8}),100000);
 assert.equal(r.status,'active');assert(r.f<.5);
});
