const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const core=require('../core.js');
const context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../reference-data.js'),'utf8'),context);
const tables=JSON.parse(JSON.stringify(context.window.ZT_REFERENCE.sampling));

test('ROM reduction selects packed columns and its actual vertical rows',()=>{
 const normal=core.gameAxes(10,20,tables),mirror=core.gameAxes(10,20,tables,true);
 assert.deepEqual(normal.columns,[0,0,2,4,5,7,8,10,12,13]);
 assert.deepEqual(mirror.columns,[15,15,13,11,10,8,7,5,3,2]);
 assert.deepEqual(normal.rows,[0,2,4,5,7,8,10,12,13,15,16,18,20,21,23,24,26,28,29,31]);
});
test('2x enlargement repeats AB AB, preserving both pixels of a packed pair',()=>{
 const input=new Uint8ClampedArray(32*32*4);
 input.set([255,0,0,255,0,255,0,255]);
 const game=core.gameSample(input,64,32,tables);
 assert.deepEqual([...game.slice(0,16)],[255,0,0,255,0,255,0,255,255,0,0,255,0,255,0,255]);
 assert.notDeepEqual(game,core.sample(input,32,32,64,32));
});
test('transparent nibble beside an opaque pixel is drawn as opaque black',()=>{
 const input=new Uint8ClampedArray(32*32*4);input.set([0,0,0,0,255,0,0,255]);
 assert.deepEqual([...core.gameSample(input,32,32,tables).slice(0,8)],[0,0,0,255,255,0,0,255]);
});
test('RGBA matches independent execution of original 68000 scaler and full large columns',()=>{
 const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'game-sampling-fixtures.json'),'utf8'));
 const packed=Buffer.from(fixture.packed,'base64'),input=new Uint8ClampedArray(32*32*4);
 function pair(b){return b ? [b>>4,b&15].flatMap(i=>[i*17,i*17,i*17,255]) : [0,0,0,0,0,0,0,0]}
 for(let column=0;column<16;column++)for(let y=0;y<32;y++)input.set(pair(packed[column*32+y]),(y*32+column*2)*4);
 assert.equal(fixture.cases.length,312);
 for(const c of fixture.cases){
  const rendered=core.gameSample(input,c.width,c.height,tables,c.mirror,pair(packed[512]));
  let pixels=rendered.subarray(0,c.width*(c.cropHeight||c.height)*4);
  if(c.kind==='column'){
   pixels=new Uint8ClampedArray(c.height*8);
   for(let y=0;y<c.height;y++)pixels.set(rendered.subarray((y*c.width+c.column*2)*4,(y*c.width+c.column*2)*4+8),y*8);
  }
  assert.equal(crypto.createHash('sha256').update(pixels).digest('hex'),c.sha256,
    `${c.kind} ${c.width}x${c.height}, mirror=${c.mirror}, column=${c.column}`);
 }
});
