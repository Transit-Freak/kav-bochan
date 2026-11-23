const {open}=require('./lib.js');
(async()=>{const {pg,close}=await open(8935);
 console.log(JSON.stringify(await pg.evaluate(()=>{const G=window.__game;const ids=['43365','29006','28617','29003','49078'];const out=[];
  let pins;G.scene.traverse(o=>{if(o.isInstancedMesh&&o.count===G.city.stops.length&&o.geometry.type==='SphereGeometry')pins=o;});
  const M=new (G.camera.matrix.constructor)();
  for(const id of ids){const s=G.stopsById.get(id),i=G.city.stops.indexOf(s);pins.getMatrixAt(i,M);out.push([id,s.world,[M.elements[12],M.elements[13],M.elements[14]].map(Math.round)]);}return out;})));
 await close();})();
