const {open}=require('./lib.js');
(async()=>{const {pg,errs,close}=await open(8933);
 await pg.addStyleTag({content:'.attr{display:none!important}'});
 const adv=(n,dt=1/24)=>pg.evaluate(([n,dt])=>{for(let i=0;i<n;i++)window.__game.advance(dt)},[n,dt]);
 const shot=async n=>{await adv(2);await pg.screenshot({path:__dirname+`/ex/${n}.jpg`,type:'jpeg',quality:85});};
 const L=[['27010','28111','29003','25951','27212'],['27212','27217','27540','44310','28108'],['42237','44332','12615','29004','27216','26592','28183'],['43365','29006','28617','29003','49078']];
 console.log(JSON.stringify(await pg.evaluate(L=>L.map(ids=>ids.map(i=>{const s=window.__game.stopsById.get(i);return [Math.round(s.world.x),Math.round(s.world.z)]})),L)));
 // plan line 3 (7 stops)
 await pg.evaluate(ids=>{const G=window.__game;document.querySelector('#panel').classList.add('min');G.startPlanning();for(const id of ids)G.planTap(id);
   const xs=ids.map(i=>G.stopsById.get(i).world);const cx=xs.reduce((a,s)=>a+s.x,0)/xs.length,cz=xs.reduce((a,s)=>a+s.z,0)/xs.length;
   G.controls.target.set(cx,0,cz);G.camera.position.set(cx-150,900,cz+500);},L[2]);
 await shot('p_plan');
 const pr=await pg.evaluate(()=>[...document.querySelectorAll('#plan,.bar,#panel')].map(e=>[e.id||e.className,JSON.stringify(e.getBoundingClientRect())]));console.log(pr);
 await pg.evaluate(()=>window.__game.finishPlanning());await shot('p_form');
 console.log(await pg.evaluate(()=>JSON.stringify(document.querySelector('#lineFormCard').getBoundingClientRect())));
 await pg.evaluate(()=>window.__game.saveForm({vtype:'std',fleet:4,headway:10}));await shot('p_saved');
 console.log(errs.filter(e=>!e.startsWith('404')));await close();})();
