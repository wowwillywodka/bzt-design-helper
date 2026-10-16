const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const core=require('../core.js');
const context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../reference-data.js'),'utf8'),context);
const palettes=JSON.parse(JSON.stringify(context.window.ZT_REFERENCE.palettes));
palettes.world=palettes['world-1'];
const pixel=(r,g,b,a=255)=>[r,g,b,a];
const white=pixel(255,255,255), black=pixel(0,0,0), clear=pixel(0,0,0,0);
const inspect=(pixels,category='world',width=32,height=32)=>core.inspect(Uint8ClampedArray.from(pixels.flat()),width,height,palettes[category].colors,category);
test('reviewed geometry at S=64 including both special pickup families',()=>{
  assert.deepEqual(core.dimensions('small',64),{width:32,height:16});
  assert.deepEqual(core.dimensions('tall',64),{width:32,height:32});
  assert.deepEqual(core.dimensions('small',128),{width:64,height:32});
  assert.deepEqual(core.dimensions('tall',128),{width:64,height:64});
  assert.deepEqual(core.dimensions('small',60),{width:30,height:15});
});
test('all object profiles match the independent July research model, including integer rounding',()=>{
  const cases=JSON.parse(fs.readFileSync(path.join(__dirname,'geometry-fixtures.json'),'utf8'));
  assert.equal(new Set(cases.map(c=>c.shape)).size,14);
  for(const c of cases) assert.deepEqual(core.dimensions(c.shape,c.scale,c.offset),c.size,
    `${c.shape}, S=${c.scale}, height offset=${c.offset}`);
});
test('displayed proportions include all seven ratios and handle a fully flattened image',()=>{
  const shapes=['column','tree','flame','small','table','cap','wide'];
  assert.deepEqual(shapes.map(s=>{const d=core.dimensions(s,128);return core.ratio(d.width,d.height)}),
    ['1:2','1:1','5:4','2:1','8:3','4:1','8:1']);
  const flat=core.dimensions('fan',128,-32);
  assert.deepEqual(flat,{width:128,height:0});
  assert.equal(core.ratio(flat.width,flat.height),'высота 0');
  assert.equal(core.ratio(32,24),'4:3');
});
test('nearest sampling preserves exact alpha and selects source rows, without blending',()=>{
  const input=Uint8ClampedArray.from([pixel(1,2,3),clear,white,black].flat());
  assert.deepEqual([...core.sample(input,2,2,4,1)],[...pixel(1,2,3),...pixel(1,2,3),...clear,...clear]);
  assert.deepEqual([...core.sample(input,2,2,4,1,true)],[...clear,...clear,...pixel(1,2,3),...pixel(1,2,3)]);
});
test('effect dimensions follow all explosion stages and the hit-particle state counters',()=>{
  assert.deepEqual([0,1,2,3,4,5].map(p=>core.dimensions('explosion',128,0,p).height),[128,256,128,64,32,16]);
  assert.deepEqual(core.dimensions('particle-wall',128,0,0),{width:16,height:16});
  assert.deepEqual(core.dimensions('particle-wall',128,0,128),{width:8,height:24});
  assert.deepEqual(core.dimensions('particle-wall',128,0,255),{width:0,height:31});
  assert.deepEqual(core.dimensions('particle-floor',128,0,0),{width:32,height:8});
  assert.deepEqual(core.dimensions('particle-floor',128,0,128),{width:64,height:4});
  assert.deepEqual(core.dimensions('particle-floor',128,0,255),{width:94,height:0});
  assert.deepEqual(core.dimensions('ground-effect',128,0,15),{width:8,height:8});
  assert.deepEqual(core.dimensions('charge-fire',128,0,5),{width:4,height:4});
  assert.deepEqual(core.dimensions('legacy-wide',128),{width:128,height:32});
});
test('world transparency is horizontal-pair based, independent of row boundaries',()=>{
  assert.equal(inspect([clear,white,clear,clear], 'world',2,2).mixedPairs,1);
  assert.equal(inspect([clear,clear,white,black], 'world',2,2).mixedPairs,0);
  assert.equal(inspect([black,black], 'world',2,1).emptyBlackPairs,1);
  assert.equal(core.inspect(Uint8ClampedArray.from([...clear,...white]),2,1,palettes.world.colors,'decor').mixedPairs,1);
});
test('slot 0 RGB is allowed as opaque world black but forbidden for hardware sprites',()=>{
  assert.equal(inspect([black,black]).invalid.length,0);
  assert.equal(inspect([pixel(72,0,109)],'icons').invalid.length,1);
  assert.equal(inspect([pixel(72,0,109,0)],'icons').invalid.length,0);
  assert.equal(inspect([black],'icons').invalid.length,0);
});
test('icons and held weapon palettes are distinct; no union palette is accepted',()=>{
  const iconOnly=pixel(...palettes.icons.colors[2]);
  assert.equal(inspect([iconOnly],'icons').invalid.length,0);
  assert.equal(inspect([iconOnly],'held').invalid.length,1);
});
test('wrong sizes and fractional alpha are reported',()=>{
  assert.equal(inspect([pixel(0,0,0,127)]).semi,1);
  assert.equal(inspect([], 'world',32,16).sizeOK,false);
  assert.equal(inspect([], 'held',24,32).sizeOK,true);
  assert.equal(inspect([], 'held',25,32).sizeOK,false);
  assert.equal(inspect([], 'held',160,96).sizeOK,true);
  assert.equal(inspect([], 'held',168,96).sizeOK,false);
});
