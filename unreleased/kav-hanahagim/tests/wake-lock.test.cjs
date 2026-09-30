const {test}=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../wake-lock.js');
const flush=()=>new Promise(r=>setImmediate(r));
function setup(request) {
 const listeners=new Map(),states=[];
 const doc={visibilityState:'visible',addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)};
 const controller=create({document:doc,navigator:{wakeLock:{request}}},s=>states.push(s));
 return {controller,doc,listeners,states};
}
function sentinel(){return {released:0,addEventListener(n,f){this.event=f},async release(){this.released++;this.event?.();}};}
test('acquire, release on hide, reacquire on return, dispose removes listeners',async()=>{
 const locks=[];const x=setup(async()=>{const s=sentinel();locks.push(s);return s;});
 x.controller.setEnabled(true);await flush();assert.equal(x.states.at(-1),'active');
 x.doc.visibilityState='hidden';x.listeners.get('visibilitychange')();await flush();assert.equal(locks[0].released,1);
 x.doc.visibilityState='visible';x.listeners.get('visibilitychange')();await flush();assert.equal(locks.length,2);
 x.controller.dispose();await flush();assert.equal(locks[1].released,1);assert.equal(x.listeners.size,0);
});
test('late acquisition after leaving is immediately released without state updates',async()=>{
 let resolve;const s=sentinel(),x=setup(()=>new Promise(r=>resolve=r));
 x.controller.setEnabled(true);x.controller.dispose();const count=x.states.length;resolve(s);await flush();
 assert.equal(s.released,1);assert.equal(x.states.length,count);
});
test('turning off stays off after switching tabs',async()=>{
 let calls=0;const x=setup(async()=>{calls++;return sentinel();});
 x.controller.setEnabled(true);await flush();x.controller.setEnabled(false);
 x.listeners.get('visibilitychange')();await flush();assert.equal(calls,1);assert.equal(x.states.at(-1),'off');x.controller.dispose();
});
test('request rejection is reported without an automatic retry loop',async()=>{
 let calls=0;const x=setup(async()=>{calls++;throw Error('battery');});
 x.controller.setEnabled(true);await flush();assert.equal(calls,1);assert.equal(x.states.at(-1),'unavailable');x.controller.dispose();
});
