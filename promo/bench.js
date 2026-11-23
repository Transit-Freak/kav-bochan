const {open}=require('./lib.js');
(async()=>{const {pg,errs,close}=await open(8932);
 await pg.addStyleTag({content:'.attr{display:none!important}'});
 await pg.evaluate(()=>document.querySelector('#panel').classList.add('min'));
 const adv=n=>pg.evaluate(n=>{for(let i=0;i<n;i++)window.__game.advance(1/24)},n);
 for(let i=0;i<6;i++){await adv(1);const t=Date.now();await pg.screenshot({path:__dirname+`/ex/b${i}.jpg`,type:'jpeg',quality:90});console.log('shot',Date.now()-t);}
 for(let i=0;i<3;i++){const t=Date.now();await adv(1);console.log('adv+finish',Date.now()-t, await pg.evaluate(()=>{const t=performance.now();window.__game.renderer.getContext().finish();window.__game.advance(1/24);window.__game.renderer.getContext().finish();return performance.now()-t}));}
 console.log(errs.filter(e=>e.startsWith('404')));await close();})();
