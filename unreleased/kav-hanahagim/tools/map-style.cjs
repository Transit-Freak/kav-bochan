const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const b=require(path.join(root,'packages/@protomaps_basemaps/package/dist/cjs/index.cjs'));
const styles={};
for(const theme of ['light','dark'])styles[theme]={version:8,sources:{protomaps:{type:'vector',minzoom:0,maxzoom:14,bounds:[34.2,29.4,35.95,33.5],attribution:'© OpenStreetMap contributors · Protomaps'}},layers:b.layers('protomaps',b.namedFlavor(theme),{lang:'he'})};
fs.writeFileSync(path.join(root,'maps/styles.js'),`window.DriverMapStyle = function(dark) {\nconst styles=${JSON.stringify(styles)};\nconst theme=dark?'dark':'light', s=styles[theme], base=new URL('maps/',document.baseURI).href;\ns.glyphs=base+'fonts/{fontstack}/{range}.pbf';s.sprite=base+'sprites/v4/'+theme;s.sources.protomaps.tiles=[base+'tiles/{z}/{x}/{y}.pbf'];return s;\n};\nmaplibregl.setRTLTextPlugin(new URL('vendor/rtl-text.js',document.baseURI).href,true);\n`);
console.log('Hebrew light/dark styles generated');
