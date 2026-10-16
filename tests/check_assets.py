"""Validate static links, example embeds and palette formats using only stdlib."""
import base64
import json
import struct
import zipfile
from html.parser import HTMLParser
from pathlib import Path

root=Path(__file__).resolve().parents[1]
class Links(HTMLParser):
    def handle_starttag(self,tag,attrs):
        for key,value in attrs:
            if key in ('src','href') and value and not value.startswith(('#','http:','https:','data:')):
                assert (root/value).is_file(), f'Missing {value}'
Links().feed((root/'index.html').read_text())
text=(root/'reference-data.js').read_text()
data=json.loads(text.split('window.ZT_REFERENCE = ',1)[1].rstrip(';\n'))
assert len(data['examples'])==844
assert sum(e['game']=='bzt' for e in data['examples'])==677
assert sum(e['game']=='zt' for e in data['examples'])==167
assert len({e['id'] for e in data['examples']})==len(data['examples'])
assert data['game']=='Beyond Zero Tolerance · July 1995'
assert len(data['sampling']['rows'])==81
assert all(len(row)==height for height,row in enumerate(data['sampling']['rows']))
assert len(data['sampling']['steps'])==32
assert all(len(row)==16 and all(step%32==0 for step in row) for row in data['sampling']['steps'])
for episode in range(1,5):
    rows=[e for e in data['examples'] if e['game']=='bzt' and e['episode']==episode]
    assert {e['tile'] for e in rows}==set(range(68)), f'Missing world tiles, episode {episode}'
    assert sum(e['category']=='other' for e in rows)==28
    assert all(e['shape']=='raw' for e in rows if e['category']=='other')
    assert {e['shape'] for e in rows} >= {'small','tall','tree','column','floorlamp','stool','table','lamp','cap','wide','flame','camera','base','fan','legacy-wide','projectile','slow-projectile','explosion','ground-effect','charge-fire','particle-wall','particle-floor','raw'}
    assert len([e for e in rows if e['shape']=='fan'])==4
    assert {(e['phase'],e['mirror']) for e in rows if e['shape']=='explosion'}=={(p,m) for p in range(6) for m in (False,True)}
assert sum(e['id'].startswith('held-bank-') for e in data['examples'])==12
assert sum(e['id'].startswith('held-map-') for e in data['examples'])==48
assert {e['palette'] for e in data['examples'] if e['game']=='bzt' and e['category']=='icons'}=={'icons','icons-pause'}
assert {e['tile'] for e in data['examples'] if e['game']=='zt' and 'tile' in e}==set(range(66))
assert sum(e['game']=='zt' and e['category']=='icons' for e in data['examples'])==14
for example in data['examples']:
    blob=base64.b64decode(example['src'].split(',',1)[1])
    assert blob==(root/example['file']).read_bytes()
    w,h=struct.unpack('>II',blob[16:24])
    assert (w,h)==(example['width'],example['height'])
    assert (w%8==0 and h%8==0 and w<=160 and h<=96) if example['category']=='held' else (w,h)==(32,32)
    if example['category']=='world':
        blob=base64.b64decode(example['stretchedSrc'].split(',',1)[1])
        assert blob==(root/example['stretchedFile']).read_bytes()
        w,h=struct.unpack('>II',blob[16:24])
        assert (w,h)==(example['stretchedWidth'],example['stretchedHeight'])
        assert (w,h)==((64,64) if example['shape']=='tall' else (128,32) if example['shape']=='legacy-wide' else (64,32))
for key,game in data['games'].items():
    assert len(game['sampling']['rows'])==81
    with zipfile.ZipFile(root/game['archive']) as archive:
        assert archive.testzip() is None
        assert all(name.endswith(('.png','.gpl','.pal','.aco')) for name in archive.namelist())
        rows=[e for e in data['examples'] if e['game']==key]
        assert sum(name.endswith('.png') and not name.startswith('palettes/') for name in archive.namelist())==len(rows)+sum(e['category']=='world' for e in rows)
for pal in [p for game in data['games'].values() for p in game['palettes'].values()]:
    assert len(pal['colors'])==16
    assert pal['colors']==[[((int(word,16)>>s)&7)*255//7 for s in (1,5,9)] for word in pal['words']]
    aco=(root/f"palettes/{pal['stem']}.aco").read_bytes()
    assert struct.unpack('>HH',aco[:4])==(1,16)
    assert len(aco)==164
    for i,rgb in enumerate(pal['colors']):
        assert struct.unpack('>HHHHH',aco[4+i*10:14+i*10])==(0,*(c*257 for c in rgb),0)
    pal_lines=(root/f"palettes/{pal['stem']}.pal").read_text().splitlines()
    assert pal_lines[:3]==['JASC-PAL','0100','16']
    assert [[int(c) for c in line.split()] for line in pal_lines[3:]]==pal['colors']
    gpl=(root/f"palettes/{pal['stem']}.gpl").read_text().splitlines()[4:]
    assert [[int(c) for c in line.split()[:3]] for line in gpl]==pal['colors']
print('OK: static links, 844 ZT/BZT resources, both pickup variants, ZIP archives and exact CRAM palettes, GPL/PAL/ACO')
