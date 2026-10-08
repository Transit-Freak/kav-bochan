import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(path.join(process.env.PW_MODULES||process.cwd(),'noop.js'));
const {chromium}=require('playwright-core');
const root=process.cwd();
const summary=JSON.parse(fs.readFileSync('line-history/data/website-archive-summary.json'));
const files=fs.readdirSync('line-history/data/lines').filter(f=>f.startsWith('website'));
const samples=files.map(f=>JSON.parse(fs.readFileSync('line-history/data/lines/'+f)));
const examples=[samples.find(l=>l.line==='437'),samples.find(l=>l.line==='186'&&l.versions.some(v=>v.websitePartial))].filter(Boolean);
if(examples.length!==2)throw Error('Verified 2003 route and 2010 map samples are missing');
const server=http.createServer((req,res)=>{
 const rel=decodeURIComponent(req.url.split('?')[0]);const filename=path.join(root,rel.endsWith('/')?rel+'index.html':rel);
 try{const bytes=fs.readFileSync(filename);res.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.jsx':'text/plain','.css':'text/css','.json':'application/json'}[path.extname(filename)]||'application/octet-stream'});res.end(bytes);}catch{res.writeHead(404);res.end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
 const base=`http://127.0.0.1:${server.address().port}/line-history/`;
 for(const viewport of [{width:390,height:844},{width:1280,height:900}]){
  const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/OneSignalSDK.page.js',r=>r.fulfill({body:''}));
  for(const sample of examples){
   await page.goto(base+'#'+encodeURIComponent(sample.rd));
   await page.locator('.website-capture').waitFor({timeout:60000});
   const latest=sample.versions.at(-1),stops=latest.stops.map(s=>typeof s==='number'?sample.pool[s]:s);
   if(await page.locator('.website-capture ol li').count()!==stops.length)throw Error('Stop rows are missing or duplicated');
   if(!(await page.locator('.website-capture').innerText()).includes('ולא מועד פתיחת הקו או שינוי בתחנות'))throw Error('Capture date is presented as a change date');
   if(!(await page.locator('.website-capture a[href^="https://web.archive.org/web/"]').getAttribute('href')).startsWith('https://web.archive.org/web/'))throw Error('Missing source capture link');
   const badges=await page.locator('.tl .kbtn').allTextContents();
   if(badges.some(t=>t!=='צילום מתועד'))throw Error('Website observations were labelled as change events');
   if((await page.locator('.wrap').innerText()).match(/לא נצפה מאז|מבוטל כרגע/))throw Error('Sparse historical website coverage is presented as a cancellation');
   if(latest.websiteMapEstimate?.matched>=2&&(!latest.websiteMapEstimate.savedPoints||latest.websiteMapEstimate.shape)){
    await page.locator('.website-estimate [role=img]').waitFor();
    if(!(await page.locator('.website-estimate .legend').innerText()).includes('מסלול משוער'))throw Error('Estimated map lacks the Magihim uncertainty label');
   }
   if(latest.websitePartial&&latest.websiteMapEstimate?.savedPoints&&latest.websiteMapEstimate.shape){
    // A route between saved points is shown only as an estimate, with its label.
    await page.locator('.website-estimate [role=img]').waitFor();
    if(!(await page.locator('.website-estimate .legend').innerText()).includes('מסלול משוער'))throw Error('Road path between saved points lacks the estimate label');
    if(!(await page.locator('.website-capture .katnote').innerText()).includes('אינה מתועדת במקור'))throw Error('Estimated road path is not marked as undocumented');
   }else if(latest.websitePartial){
    await page.getByRole('img',{name:'נקודות שנשמרו במפת המקור',exact:true}).waitFor();
    await page.waitForFunction(()=>document.querySelectorAll('.website-capture .leaflet-interactive').length===6);
    if(await page.locator('.website-capture path.leaflet-interactive').count()!==6)throw Error('Map includes a fake route or map centre as a station');
   }
  }
  if(errors.length)throw Error(errors.join('\n'));
  await page.close();
 }
 const page=await browser.newPage();let updated=false;
 await page.route('**/OneSignalSDK.page.js',r=>r.fulfill({body:''}));
 await page.route('**/website-archive-summary.json?*',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(updated?{...summary,counts:{...summary.counts,parsed:summary.counts.parsed+1},updatedAt:'2099-01-01T00:00:00Z'}:summary)}));
 await page.goto(base);
 const status=page.getByRole('region',{name:'ארכיון אתרי המידע לנוסעים'});
 await status.waitFor();
 // לחיצה על שנה מציגה את החברות והאזורים שלה
 const years=JSON.parse(fs.readFileSync('line-history/data/website-years.json')).years;
 const top=years.reduce((a,b)=>b.lines>a.lines?b:a);
 await status.getByRole('button',{name:new RegExp('^'+top.y)}).click();
 const yr=status.getByRole('region',{name:'שנת '+top.y});await yr.waitFor();
 if(!(await yr.innerText()).includes(top.ops[0][0]))throw Error('Year panel lacks its main operator');
 updated=true;
 await page.waitForFunction(()=>document.querySelector('[aria-label="ארכיון אתרי המידע לנוסעים"]')?.innerText.includes('2099'),null,{timeout:45000});
 console.log('PASS: mobile and desktop source dates, exact stop rows, partial map with six real points, no invented changes, automatic live status update');
}finally{await browser?.close();server.close();}
