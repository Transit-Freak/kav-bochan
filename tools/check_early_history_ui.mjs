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
 await p.getByRole('heading',{name:'חוזרים ל־2012–2018'}).waitFor({timeout:60000});
 await p.getByRole('heading',{name:/קווים בצילום \(5,317\)/}).waitFor({timeout:60000});
 await p.getByRole('heading',{name:/תחנות בצילום \(24,362\)/}).waitFor();
 await p.getByRole('button',{name:'2013',exact:true}).click();
 await p.getByLabel('יום',{exact:true}).selectOption('2013-01-01');
 await p.locator('.early-scroll tbody tr').first().waitFor({timeout:30000});
 await p.getByRole('button',{name:'2012',exact:true}).click();
 await p.locator('.early-result').first().click();
 await p.getByText('תיעוד היסטורי בלבד. הרשומה אינה קובעת אם הקו פועל היום.',{exact:true}).waitFor({timeout:30000});
 await p.locator('summary').filter({hasText:'כל תבניות המסלול ולוחות היציאה ('}).first().click();
 await p.locator('summary').filter({hasText:'כל תבניות המסלול ולוחות היציאה מהקובץ'}).first().waitFor({timeout:30000});
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS: mobile archive, 2012 lines/stops, 2013 railway, line page, lazy schedule details');
}finally{await browser?.close();srv.close();}
