#!/usr/bin/env python3
"""Generate pixel hashes by executing the ORIGINAL July 68000 blitters.
Requires the surrounding research workspace and Capstone; never needed by the site.
"""
import base64
import hashlib
import json
import sys
from pathlib import Path
SITE=Path(__file__).resolve().parents[1]
ROOT=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else SITE.parent
sys.path.insert(0,str(ROOT/'zt_disasm/bztjuly/tests/audit'))
from cell_cpu import CellCpu
rom=bytearray((ROOT/'zt_disasm/bztjuly/build/bztjuly.bin').read_bytes())
assert hashlib.sha256(rom).hexdigest()=='8f0af150b642e1e190566a96d19732695164d926244764407560949cee02d8b0'
TILE=0x2B9570; LUT=TILE+1024; FRAME=0xFF624A
packed=bytes((column*47+row*13)%256 for column in range(16) for row in range(32))+b'\x39'
rom[TILE:TILE+len(packed)]=packed
for page in range(13):
    rom[LUT+page*256:LUT+(page+1)*256]=bytes(((i&15)<<4)|(i>>4) if page==12 else i for i in range(256))
rom=bytes(rom);cache={}
def cpu():
    c=CellCpu(rom);c.cache=cache
    for address in (0xFF3D1C,0xFF3D48):c.mem(address,32,LUT)
    c.mem(0xFF10DA,16,128);c.mem(0xFF1094,16,0xFFFF);c.mem(0xFF1096,16,0xFFFF)
    return c

def rgba(values,mask):
    result=bytearray()
    for value,visible in zip(values,mask):
        for index in (value>>4,value&15):result.extend((index*17,index*17,index*17,255) if visible else (0,0,0,0))
    return result

cases=[]
for width in (1,2,7,10,15,16,17,32,48,64,80,128):
    for height in (1,16,20,31,32,48,64,80,81,96,128,256):
        for mirror in (False,True):
            c=cpu();c.mem(0xFF10CE,16,int(mirror));c.reg.update(a1=TILE,d0=height,d1=0,d2=0,d4=width);c.writes.clear()
            c.run(0xF8BC,budget=300000)
            visible_height=min(height,80);values=bytearray(width*visible_height);mask=bytearray(width*visible_height)
            for a,bits,v in c.writes:
                if FRAME<=a<0xFF8A4A and bits==8:
                    block,within=divmod(a-FRAME,320);y,col=divmod(within,4);x=block*4+col
                    if x<width and y<visible_height:values[y*width+x]=v;mask[y*width+x]=1
            cases.append(dict(kind='tile',width=width*2,height=height,cropHeight=visible_height,mirror=mirror,sha256=hashlib.sha256(rgba(values,mask)).hexdigest()))
# Execute the actual large-column routine for the ENTIRE unclipped height,
# including its row-32 read into the next packed column / following ROM byte.
for height in (81,96,128,256):
    for column in (0,7,15):
        for mirror in (False,True):
            c=cpu();c.mem(0xFF10D6,16,height-1);c.mem(0xFF10D4,16,0)
            c.reg.update(a0=FRAME-4,a1=TILE+column*32,a3=LUT+(0xC00 if mirror else 0),d2=0x200000//height)
            c.writes.clear();c.run(0xFC18,budget=10000)
            values=bytearray(height);mask=bytearray(height)
            for a,bits,v in c.writes:
                if FRAME<=a<FRAME+height*4 and bits==8 and (a-FRAME)%4==0:values[(a-FRAME)//4]=v;mask[(a-FRAME)//4]=1
            cases.append(dict(kind='column',width=32,height=height,column=15-column if mirror else column,mirror=mirror,sha256=hashlib.sha256(rgba(values,mask)).hexdigest()))
(SITE/'tests/game-sampling-fixtures.json').write_text(json.dumps(dict(source='Original July instructions $F8BC and $FC18; identity color remap; no walls, top-left origin.',packed=base64.b64encode(packed).decode(),cases=cases),indent=2)+'\n')
print(f'Exported {len(cases)} independent original-code pixel witnesses')
