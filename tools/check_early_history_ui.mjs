import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(path.join(process.env.PW_MODULES||process.cwd(),'noop.js'));
const {chromium}=require('playwright-core');
const root=process.cwd();
const srv=http.createServer((req,res)=>{
  let rel=decodeURIComponent(req.url.split('?')[0]);if(rel.endsWith('/'))rel+='index.html';
  const p=path.join(root,rel);try{const b=fs.readFileSync(p);res.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.jsx':'text/plain','.css':'text/css','.json':'application/json'}[path.extname(p)]||'application/octet-stream'});res.end(b)}catch{res.writeHead(404);res.end()}
});
await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
 const p=await browser.newPage({viewport:{width:390,height:844}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/OneSignalSDK.page.js',r=>r.fulfill({body:''}));
 await p.goto(`http://127.0.0.1:${srv.address().port}/line-history/#t=early`);
 if(await p.getByRole('tab',{name:/ארכיון/}).count())throw Error('Separate archive tab still exists');
 if(await p.getByLabel('תקופה',{exact:true}).count())throw Error('Duplicate period selector in lines');
 await p.getByRole('button',{name:'2012',exact:true}).click();
 await p.getByRole('button',{name:'07.2012',exact:true}).click();
 await p.locator('.lrow').first().waitFor({timeout:60000});
 if(await p.getByRole('heading',{name:/תכנון וביצוע/}).count())throw Error('Rail data leaked into buses');
 await p.getByRole('tab',{name:'🚏 תחנות',exact:true}).click();
 if(await p.getByLabel('תקופה',{exact:true}).count())throw Error('Period selector remains in stops');
 await p.getByRole('button',{name:'2012',exact:true}).click();
 await p.getByRole('button',{name:'07.2012',exact:true}).click();
 await p.getByText('24,362 תחנות',{exact:true}).waitFor({timeout:60000});
 if(await p.getByLabel('תאריך צילום',{exact:true}).count())throw Error('Snapshot date selector remains');
 await p.getByRole('tab',{name:'🚆 רכבת',exact:true}).click();
 if(await p.getByLabel('תקופה',{exact:true}).count())throw Error('Period selector remains in rail');
 await p.getByRole('button',{name:/שינויים לפי יום/}).click();
 await p.getByRole('button',{name:'2013',exact:true}).click();
 await p.getByRole('button',{name:'01.2013',exact:true}).click();
 if(await p.locator('select[aria-label="יום"],select[aria-label="תאריך צילום"]').count())throw Error('Extra date selector remains');
 await p.locator('.historical-day').first().waitFor();
 const dates=await p.locator('.historical-day').evaluateAll(es=>es.map(e=>e.dataset.date));
 if(dates.length<2||dates.some(d=>!d.startsWith('2013-01'))||dates.join()!==[...dates].sort().reverse().join())throw Error('Month is not grouped by descending days');
 await p.getByRole('button',{name:/הצגת ימים נוספים/}).click();
 if(await p.locator('.historical-day').count()<=dates.length)throw Error('Older days inaccessible');
 await p.locator('.early-scroll tbody tr').first().waitFor({timeout:30000});
 await p.getByRole('tab',{name:'🚕 מוניות שירות',exact:true}).click();
 if(await p.getByLabel('תקופה',{exact:true}).count())throw Error('Period selector remains in taxis');
 await p.getByRole('button',{name:/שינויים לפי יום/}).click();
 await p.getByRole('button',{name:'2020',exact:true}).waitFor();
 if(await p.getByRole('button',{name:'2012',exact:true}).count())throw Error('Empty taxi year 2012 is offered');
 await p.getByRole('tab',{name:'🚌 קווים',exact:true}).click();
 if(await p.getByLabel('תקופה',{exact:true}).count())throw Error('Duplicate period selector in lines');
 await p.getByRole('button',{name:'07.2012',exact:true}).waitFor();
 await p.locator('.lrow').first().click();
 await p.getByText('תיעוד היסטורי בלבד. הרשומה אינה קובעת אם הקו פועל היום.',{exact:true}).waitFor({timeout:30000});
 await p.locator('summary').filter({hasText:'כל תבניות המסלול ולוחות היציאה ('}).first().click();
 await p.locator('summary').filter({hasText:'כל תבניות המסלול ולוחות היציאה מהקובץ'}).first().waitFor({timeout:30000});
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS: integrated category years, mode separation, 2012 lines/stops, 2013 railway, saved year and line details');
}finally{await browser?.close();srv.close();}

