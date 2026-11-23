const { chromium } = require("playwright");
(async()=>{
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const p = await b.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 1 });
await p.goto('http://localhost:8765/line-changes/', { waitUntil: 'load' });
await p.waitForTimeout(1000);
await p.fill('#q', 'אשדוד'); await p.waitForTimeout(800);
await p.click('#results .res:has(.badge:text-is("29"))');
await p.waitForTimeout(1000);
await p.screenshot({ path: 's3.png' });
console.log(await p.$$eval('#cards > *', els => els.map(e => e.tagName+'.'+e.className+' | '+e.innerText.replace(/\n/g,' / ').slice(0,200))));
await p.click('#cards button, #cards .card');
await p.waitForTimeout(3000);
await p.screenshot({ path: 's4.png' });
const H = await p.evaluate(()=>document.documentElement.scrollHeight);
console.log('H',H, await p.$$eval('.slide', e=>e.map(x=>x.className+' '+x.getBoundingClientRect().top|0)));
await p.screenshot({ path: 's5.png', fullPage:true });
await b.close();
})();
