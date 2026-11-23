const {open}=require('./lib.js');const fs=require('fs');
const FPS=24, PREV=+(process.env.PREV||0), ONLY=process.env.ONLY?process.env.ONLY.split(','):null;
const OUT=__dirname+(PREV?'/prev':'/frames');
const C={
 t1:'אני בונה משחק', t1b:'משחק קווי אוטובוס בקריית מלאכי, עם הרחובות והתחנות האמיתיים',
 c2:'מתכננים קו: מקישים על תחנות, והמסלול נבנה לאורך הרחובות',
 c3:'קונים אוטובוסים ובוחרים תדירות. התקציב מוגבל',
 c4:'נוסעים מחכים בתחנה, עולים ויורדים',
 c5:'רואים מאיפה לאן אנשים רוצים לנסוע, ואיפה חסר קו',
 c6:'ולכל קו רואים כמה עלו, כמה נשארו בתחנה וכמה הוא עולה',
 e1:'זה עדיין בבנייה.', e2:'מה הייתם רוצים לראות במשחק?', e3:'הקו הבוחן',
};
const L1=['43365','29006','28617','29003','49078'];
const OTHERS=[[['27010','28111','29003','25951','27212'],3,15,'mini'],[['27212','27217','27540','44310','28108'],4,10],[['42237','44332','12615','29004','27216','26592','28183'],4,15]];
(async()=>{const {pg,errs,close}=await open(8934);
 await pg.addScriptTag({path:__dirname+'/overlay.js'});
 await pg.addStyleTag({content:'::-webkit-scrollbar{display:none!important;width:0!important;height:0!important} *{scrollbar-width:none!important} .attr,.toast{display:none!important} body.hideui .bar,body.hideui #panel,body.hideui .plan{display:none!important}'});
 const ev=(f,a)=>pg.evaluate(f,a);
 let total=0;
 async function rec(name,n,fn){ // fn(i) runs per frame in node; must call advance itself via step()
   if(ONLY&&!ONLY.includes(name)){ for(let i=0;i<n;i++) await fn(i,false); return; }
   fs.mkdirSync(`${OUT}/${name}`,{recursive:true}); await ev(()=>{for(const t of P.taps)t.d.remove();P.taps=[];});
   for(let i=0;i<n;i++){ await fn(i,true); await ev(()=>window.P.tickTaps());
     if(!PREV||i%PREV===0||i===n-1) await pg.screenshot({path:`${OUT}/${name}/${String(i).padStart(4,'0')}.jpg`,type:'jpeg',quality:90}); }
   total+=n; console.log(name,n,'frames',errs.filter(e=>!e.startsWith('404')&&!e.includes('404')).slice(-2));
 }
 const step=(dt=1/FPS)=>ev(dt=>window.__game.advance(dt),dt);
 const ease=x=>x<0?0:x>1?1:x*x*(3-2*x);
 const fade=(i,a,b)=>ease((i-a)/b);
 // ---------- 1: aerial + title (3.0s)
 await ev(()=>{document.body.classList.add('hideui');window.__game.sim.time=6.75*3600;});
 for(let k=0;k<5;k++)await step();
 await rec('s1',72,async i=>{const a=0.35+i/72*0.22, R=1150;
   await ev(([a,R,o1,o2])=>{P.cam([-60+Math.sin(a)*R,620-0*a,-80+Math.cos(a)*R],[-60,0,-80]);P.title('אני בונה משחק','משחק קווי אוטובוס בקריית מלאכי, עם הרחובות והתחנות האמיתיים',o1,o2);},[a,R,fade(i,2,10),fade(i,26,10)]);
   await step();});
 await ev(()=>P.hideTitle());
 // ---------- 2: planning (5.5s)
 await ev(()=>{document.body.classList.remove('hideui');document.querySelector('#panel').classList.add('min');window.__game.startPlanning();});
 const F2=await ev(ids=>{const G=window.__game;const pts=ids.map(i=>{const w=G.stopsById.get(i).world;return [w.x,w.z]});return P.fit(pts,[432,858],0.98,[60,250,480,735]);},L1);console.log('fit',JSON.stringify(F2));
 const tapAt=[16,34,52,70,88], N2=132;
 await rec('s2',N2,async i=>{
   const k=ease(i/N2);
   await ev(([k,F])=>{const s=1.07-0.07*k;P.cam([F.t[0]+(F.p[0]-F.t[0])*s,F.p[1]*s,F.t[2]+(F.p[2]-F.t[2])*s],F.t);},[k,F2]);
   const j=tapAt.indexOf(i); if(j>=0) await ev(id=>{const G=window.__game;const p=G.stopScreen(id);P.tap(p.x,p.y);G.planTap(id);},L1[j]);
   if(i===116) await ev(()=>{const r=document.querySelector('#planDone').getBoundingClientRect();P.tap(r.x+r.width/2,r.y+r.height/2);});
   await ev(([t,o])=>P.cap(t,112,o),[C.c2,fade(i,4,8)]);
   await step();});
 // ---------- 3: form (3.5s)
 await ev(()=>{window.__game.finishPlanning();});
 await pg.addStyleTag({content:'#lineFormCard{transform:scale(.93) translateY(52px);transform-origin:50% 0}'});
 const click=sel=>ev(sel=>{const e=document.querySelector(sel);const r=e.getBoundingClientRect();P.tap(r.x+r.width/2,r.y+r.height/2);e.click();},sel);
 await rec('s3',84,async i=>{
   if(i===18) await click('#fTypes [data-type=mini]');
   if(i===38) await click('#fTypes [data-type=artic]');
   if(i===56) await click('#fTypes [data-type=std]');
   if(i===70) await click('#fPlus');
   await ev(([t,o])=>P.cap(t,112,o),[C.c3,fade(i,0,6)]);
   await step();});
 // ---------- setup network + run
 await ev(O=>{const G=window.__game;G.saveForm({});G.bank.money+=3e6;
   const mk=(ids,fleet,hw,vt)=>{G.startPlanning();for(const id of ids)G.planTap(id);G.finishPlanning();return G.saveForm({vtype:vt||'std',fleet,headway:hw});};
   for(const [ids,f,h,vt] of O) mk(ids,f,h,vt);
   G.sim.speed=1; const t1=7.25*3600; while(G.sim.time<t1){G.sim.tick(0.25);G.sim.events.length=0;}
 },OTHERS);
 await pg.addStyleTag({content:'#lineFormCard{transform:none}'});
 // ---------- 4: bus at stop
 await ev(()=>{document.body.classList.add('hideui');const G=window.__game;G.controls.minDistance=0.3;G.controls.maxPolarAngle=1.62;
   const R=G.renderer.render;G.renderer.render=()=>{};let found=null;
   for(let f=0;f<20000&&!found;f++){G.advance(1/24);
     for(const L of G.sim.lines)for(const b of L.buses){if(b.state!=='drive'||b.next<1||b.next>=L.stops.length-1)continue;const d=L.stopS[b.next]-b.s;
       if(d>0.25&&d<0.6&&L.queues[b.next].length>=3&&!L.buses.some(o=>o!==b&&Math.abs(o.s-L.stopS[b.next])<30)){found=b;break;}}}
   G.renderer.render=R;window.__bus=found;window.__bf=found&&{line:found.line.def.number,next:found.next,q:found.line.queues[found.next].length};});
 console.log('bus',await ev(()=>window.__bf));
 const N4=180;let tDw=-1;
 await rec('s4',N4,async i=>{
   const st=await ev(([i])=>{const G=window.__game,b=window.__bus,o=G.cams.game.busObject(b);if(!o)return 'noobj';
     const V=o.position.constructor;o.updateMatrixWorld();const side=new V(-1,0,0).applyQuaternion(o.quaternion),fwd=new V(0,0,1).applyQuaternion(o.quaternion);
     const door=new V(-1.875,0,5.15).applyMatrix4(o.matrixWorld);
     const fp=o.position.clone().addScaledVector(fwd,-13).addScaledVector(side,7).setY(4.2), ft=o.position.clone().addScaledVector(fwd,4).setY(1.6);
     const dp=door.clone().addScaledVector(side,2.2).addScaledVector(fwd,4.2).setY(1.45), dt=door.clone().addScaledVector(side,0.2).addScaledVector(fwd,-0.5).setY(0.85);
     const e=i<54?0:1;
     if(!window.__cp){window.__cp=fp.clone();window.__ct=ft.clone();}
     const tp=fp.clone().lerp(dp,e),tt=ft.clone().lerp(dt,e);
     window.__cp.copy(tp);window.__ct.copy(tt);
     P.cam(window.__cp.toArray(),window.__ct.toArray());G.camera.lookAt(G.controls.target);
     return b.state+' '+(b.line.stopS[b.next]-b.s).toFixed(1)+' q'+b.line.queues[b.next].length+' pax'+b.pax.length;},[i]);
   if(i%12===0)console.log(i,st);
   await ev(([t,o])=>P.cap(t,130,o),[C.c4,fade(i,0,6)]);
   await step();});
 // ---------- 5: demand map (5s)
 await ev(()=>{document.body.classList.remove('hideui');const G=window.__game;G.controls.minDistance=12;G.controls.maxPolarAngle=1.42;G.sim.speed=1;});
 await pg.locator('#demandBtn').click();
 await ev(()=>{document.querySelector('#panel').classList.add('min');window.__game.setDemandView(true,7,true);});
 for(let k=0;k<6;k++)await step();
 await rec('s5',120,async i=>{
   if(i===40){const pt=await ev(()=>{const G=window.__game,z=G.demand.zones.findIndex(z=>z.name==='שדרות ירושלים');const r=document.querySelector('#view').getBoundingClientRect();const p=G.dlayer.screenOf(z,G.camera,r);P.tap(p.x,p.y);return p;});
     await pg.mouse.click(pt.x,pt.y);}
   const top=582;
   await ev(([t,o,top])=>P.cap(t,top,o),[C.c5,fade(i,0,6),top]);
   await step();});
 // ---------- 6: line card (3.5s)
 await ev(()=>{const G=window.__game;G.setDemandView(false);document.querySelector('#dLegend').hidden=true;document.querySelector('#dlFocus').hidden=true;G.showTab('lines');document.querySelector('#panel').classList.remove('min');
   const t1=8.6*3600;while(G.sim.time<t1){G.sim.tick(0.25);G.sim.events.length=0;}G.sim.speed=1;});
 await pg.addStyleTag({content:'#panel:not(.min){bottom:150px!important;height:560px!important;max-height:560px!important} .lcard .dchart{display:none!important}'});
 for(let k=0;k<6;k++)await step();
 await ev(()=>{const c=document.querySelectorAll('.lcard')[1];c.scrollIntoView({block:'start'});});
 await rec('s6',84,async i=>{
   await ev(([t,o])=>P.cap(t,112,o),[C.c6,fade(i,0,6)]);
   await step();});
 // ---------- 7: end card (3.5s)
 await ev(()=>{P.hideCap();document.body.classList.add('hideui');const G=window.__game;G.sim.speed=5;});
 await rec('s7',84,async i=>{const a=0.75+i/84*0.12,R=1050;
   await ev(([a,R,o,o2,e])=>{P.cam([-60+Math.sin(a)*R,600,-80+Math.cos(a)*R],[-60,0,-80]);P.end(e.e1,e.e2,e.e3,o,o2);},[a,R,fade(i,0,10),fade(i,14,10),C]);
   await step();});
 console.log('total frames',total,(total/FPS).toFixed(1)+'s');
 console.log(errs.filter(e=>!e.includes('404')).slice(0,5));await close();})();
