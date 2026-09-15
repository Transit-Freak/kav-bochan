const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const root=path.resolve(__dirname,'..');
const context=vm.createContext({fetch:async()=>({ok:true,json:async()=>({tenders:{}})}),renderFeed(){},documentReviews:{},currentPackageDocuments:()=>[],semanticReviews:{},esc:String,renderSources:s=>s.map(x=>x.locator).join(' · ')});
vm.runInContext(fs.readFileSync(path.join(root,'route-details.js'),'utf8'),context);
const match=context.routeTargetMatches;
test('same number in a different town is not the same route',()=>{assert(!match({number:'2',area:'אשקלון'},{number:'2',area:'קריית מלאכי'}));assert(!match({number:'2',area:'אשקלון'},{number:'12',area:'אשקלון'}));});
test('catalog identity joins both directions but not another catalog',()=>{assert(match({number:'144',area:'חולון',catalogNumber:'10144'},{key:['10144','144','2','#'],area:'נתב״ג'}));assert(!match({number:'144',area:'חולון',catalogNumber:'10144'},{key:['20144','144','2','#'],area:'חולון'}));});
test('variant-specific evidence remains scoped',()=>{assert(!match({number:'6',area:'חיפה',variant:'ת'},{number:'6',area:'חיפה',variant:'#'}));});
test('real reviewed route facts include cross-page references and renumbering',()=>{
 const seeds=JSON.parse(fs.readFileSync(path.join(root,'route-details.json'))).tenders['archive-northern-negev'].notes;
 const n=seeds.find(n=>n.targets.some(t=>t.number==='16'&&t.area==='אשקלון'));
 assert(n.text.includes('גיאה'));assert.equal(n.sources[0].page,85);
 const changed=seeds.find(n=>n.targets.some(t=>t.number==='240'));
 assert(changed.relatedNumbers.includes('24'));assert(changed.text.includes('מהיר'));
 const reviews=JSON.parse(fs.readFileSync(path.join(root,'semantic-reviews.json'))).tenders['4000611926'].documents;
 const notes=Object.values(reviews).flatMap(d=>d.routeNotes||[]).filter(n=>n.targets.some(t=>t.number==='6'));
 assert.deepEqual([...new Set(notes.flatMap(n=>n.sources.map(s=>s.unit)))].sort(),[70,71]);
});
