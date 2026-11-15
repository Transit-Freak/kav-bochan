// node shot.mjs <svg> <png> [צד ארוך בפיקסלים] [x0,y0,x1,y1 בשברים]
import {createRequire} from 'module';import {execSync} from 'child_process';import fs from 'fs';
const {chromium}=createRequire(execSync('npm root -g').toString().trim()+'/')('playwright');
const [src,out,ms,crop]=process.argv.slice(2); const side=+(ms||1500);
const m=fs.readFileSync(src,'utf8').match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/); const w=+m[1],h=+m[2],k=side/Math.max(w,h);
const W=Math.ceil(w*k),H=Math.ceil(h*k);
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:W,height:H}});
await p.goto('file://'+src);
await p.evaluate(([W,H])=>{const s=document.documentElement;s.setAttribute('width',W);s.setAttribute('height',H);s.style.background='#fff'},[W,H]);
const c=crop?crop.split(',').map(Number):null;
await p.screenshot({path:out,clip:c?{x:W*c[0],y:H*c[1],width:W*(c[2]-c[0]),height:H*(c[3]-c[1])}:undefined}); await b.close(); console.log(W,H);
