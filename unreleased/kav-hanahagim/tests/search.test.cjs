const {test}=require('node:test'),assert=require('node:assert/strict'),{search}=require('../search.js');
const rows=['100','11','10','1','21','1א'].map((n,i)=>({id:String(i),shortName:n,longName:'יבנה מערב-יבנה <-> יבנה מזרח-יבנה',makat:String(67000+i)}));
rows.push({id:'99',shortName:'1',longName:'ירושלים',makat:'12001'});
test('exact line first, then prefix matches in numeric order',()=>{
 assert.deepEqual(search(rows,'1').map(r=>r.shortName),['1','1','1א','10','11','100']);
});
test('city plus line in either order, spaces and optional line word',()=>{
 for(const q of ['1 יבנה','יבנה 1',' קו  1  יבנה '])assert.deepEqual(search(rows,q).map(r=>r.shortName),['1','1א','10','11','100']);
 assert.equal(search(rows,'1 ירושלים').length,1);
 assert.equal(search(rows,'1 חיפה').length,0);
});
test('multiple city words, punctuation, empty query, makat mode and source order',()=>{
 const input=[{id:'a',shortName:'1',longName:'תל-אביב יפו',makat:'67001'}];
 assert.equal(search(input,'1 תל אביב').length,1);
 assert.equal(search(input,'67001','makat').length,1);
 assert.equal(search(input,'  ').length,1);
 const before=JSON.stringify(rows);search(rows,'1');assert.equal(JSON.stringify(rows),before);
});
