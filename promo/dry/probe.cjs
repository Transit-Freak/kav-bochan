const { chromium } = require("playwright");
(async()=>{
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const p = await b.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 1 });
p.on('console', m => { if (m.type()==='error') console.log('ERR', m.text().slice(0,150)); });
await p.goto('http://localhost:8765/line-changes/', { waitUntil: 'load' });
await p.waitForTimeout(1500);
await p.screenshot({ path: 's1.png' });
await p.fill('#q', 'אשדוד'); await p.waitForTimeout(1500);
await p.screenshot({ path: 's2.png' });
console.log(await p.$$eval('#results .res', els => els.slice(0,12).map(e => e.className+' | '+e.innerText.replace(/\n/g,' / '))));
await b.close();
})();
