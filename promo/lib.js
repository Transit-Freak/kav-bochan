const { chromium } = require('playwright'); const http=require('http'),fs=require('fs'),path=require('path');
const GAME='/tmp/claude-0/-home-user/e04ae825-3a71-5659-8839-480e0b6973fc/scratchpad/gt/pub2', PROMO=__dirname;
const T={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.woff2':'font/woff2','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
function serve(port){return http.createServer((q,r)=>{let u=decodeURIComponent(q.url.split('?')[0]);let p=u.startsWith('/__promo/')?path.join(PROMO,u.slice(9)):path.join(GAME,u);if(p.endsWith('/'))p+='bus-game.html';
 fs.readFile(p,(e,d)=>{if(e){r.writeHead(404);r.end();}else{r.writeHead(200,{'content-type':T[path.extname(p)]||'application/octet-stream'});r.end(d);}});}).listen(port);}
async function open(port,{w=540,h=960,dsf=1.5}={}){
 const srv=serve(port);
 const b=process.env.GL==='llvm'?await chromium.launch({headless:false,args:['--use-gl=angle','--use-angle=gl','--ignore-gpu-blocklist']}):await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:dsf});
 await ctx.route(/fonts\.googleapis\.com/,rt=>rt.fulfill({status:200,contentType:'text/css',body:fs.readFileSync(PROMO+'/font/game.css','utf8')}));
 await ctx.route(/fonts\.gstatic\.com/,rt=>rt.abort());
 const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,200))});
 pg.on('response',r=>{if(r.status()>=400)errs.push('404 '+r.url())});pg.on('dialog',d=>d.dismiss());
 await pg.goto(`http://localhost:${port}/?fixedres`);await pg.waitForFunction(()=>window.__game&&window.__game.ready,null,{timeout:400000});
 await pg.evaluate(()=>{const G=window.__game;G.manual=true;G.renderer.setPixelRatio(devicePixelRatio);G.renderer.setSize(innerWidth,innerHeight,false);});
 await pg.evaluate(()=>document.fonts.ready);
 return {b,pg,srv,errs,close:async()=>{await b.close();srv.close();}};
}
module.exports={open};
