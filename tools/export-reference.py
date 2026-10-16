#!/usr/bin/env python3
"""Export reviewed ZT Rev A / BZT July resources, palettes and download packs."""
import base64
import hashlib
import json
import struct
import sys
import zipfile
from pathlib import Path
from PIL import Image

SITE = Path(__file__).resolve().parents[1]
ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else SITE.parent
rom = (ROOT/'zt_disasm/bztjuly/build/bztjuly.bin').read_bytes()
expected = '8f0af150b642e1e190566a96d19732695164d926244764407560949cee02d8b0'
assert hashlib.sha256(rom).hexdigest() == expected, 'Expected reviewed BZT July ROM'
# Remove previous reference files, including names no longer exported.
for folder in (SITE/'assets/examples', SITE/'palettes'):
    for path in folder.iterdir():
        if path.is_file(): path.unlink()

game_id='bzt'
palette_prefix='bzt'
game_label='BZT July'
palettes = {}
def palette(key, name, address, world=False):
    words = struct.unpack_from('>16H',rom,address)
    colors = [tuple(((w>>s)&7)*255//7 for s in (1,5,9)) for w in words]
    stem = palette_prefix+'-'+key
    palettes[key] = dict(name=name,address=f'0x{address:06X}',colors=colors,words=[f'{w:04X}' for w in words],stem=stem,world=world)
    path = SITE/'palettes'/stem
    path.with_suffix('.gpl').write_text(f'GIMP Palette\nName: {game_label} - {key}\nColumns: 8\n# Slot 00: transparency; world uses packed-byte pairs.\n'+''.join(f'{r:3} {g:3} {b:3}\t{i:02X}\n' for i,(r,g,b) in enumerate(colors)))
    path.with_suffix('.pal').write_text('JASC-PAL\n0100\n16\n'+''.join(f'{r} {g} {b}\n' for r,g,b in colors))
    path.with_suffix('.aco').write_bytes(struct.pack('>HH',1,16)+b''.join(struct.pack('>HHHHH',0,r*257,g*257,b*257,0) for r,g,b in colors))
    swatch=Image.new('RGB',(256,16))
    for i,color in enumerate(colors): swatch.paste(color,(i*16,0,(i+1)*16,16))
    swatch.save(path.with_suffix('.png'))
for episode in range(1,5): palette(f'world-{episode}','Объекты мира · эпизод '+str(episode),0x97BA0+(episode-1)*0x100,True)
palette('icons','Иконки HUD',0x97C00)
palette('held','Оружие в руках',0x97BC0)
palette('icons-pause','Иконки в паузе',0x1624C8)
# Gameplay sprite palettes are shared by all episodes.
for episode in range(4):
    assert rom[0x97BA0+episode*0x100+0x20:0x97BA0+episode*0x100+0x40] == rom[0x97BC0:0x97BE0]
    assert rom[0x97BA0+episode*0x100+0x60:0x97BA0+episode*0x100+0x80] == rom[0x97C00:0x97C20]

def vdp(blob,tw,th,colors):
    image=Image.new('RGBA',(tw*8,th*8))
    for x in range(tw*8):
        for y in range(th*8):
            b=blob[((x//8)*th+y//8)*32+(y%8)*4+(x%8)//2]
            i=(b&15) if x%2 else (b>>4)
            if i: image.putpixel((x,y),(*colors[i],255))
    return image

def world(blob,colors):
    image=Image.new('RGBA',(32,32))
    for x in range(32):
        for y in range(32):
            b=blob[(x//2)*32+y]
            if b: image.putpixel((x,y),(*colors[(b&15) if x%2 else (b>>4)],255))
    return image

examples=[]
def add(image,key,name,category,episode=None,shape='small',**metadata):
    if game_id=='zt': key='zt-'+key
    if episode and 'tile' in metadata:
        bank=0x10E9BE if game_id=='zt' else [0x9D7F8,0xCBB3C,0xF8664,0x1254F8][episode-1]
        b=rom[bank+(metadata['tile']+1)*512]
        colors=palettes['world' if game_id=='zt' else f'world-{episode}']['colors']
        metadata['overflowPair']=[*colors[b>>4],255,*colors[b&15],255] if b else [0]*8
    path=SITE/'assets/examples'/f'{key}.png';image.save(path)
    examples.append(dict(game=game_id,id=key,name=name,category=category,episode=episode,shape=shape,width=image.width,height=image.height,file=f'assets/examples/{key}.png',src='data:image/png;base64,'+base64.b64encode(path.read_bytes()).decode(),**metadata))
items=[(3,'Биосканер'),(4,'Фонарик'),(5,'Лазерный пистолет'),(6,'Ракетница'),(7,'Ночное зрение'),(8,'Мина'),(10,'Бронежилет'),(12,'Дробовик'),(13,'Граната'),(14,'Buligun'),(15,'Snowman'),(16,'Gunrock'),(17,'Пульс-лазер'),(18,'Аптечка'),(60,'Огнемёт')]
decor=[(0,'Огонь','flame'),(19,'Объект $26 · кадр 1','camera'),(20,'Объект $26 · кадр 2','camera'),
       (46,'Дерево · $37','tree'),(47,'Дерево · $5C','tree'),(48,'Напольная лампа','floorlamp'),
       (49,'Мигающая лампа','lamp'),(50,'Подвесной светильник · низ','base'),
       (51,'Колонна · $60','column'),(52,'Колонна · $76','column'),(53,'Потолочная лампа','lamp'),
       (54,'Колонна · $61','column'),(55,'Низкая мебель · $5E','table'),(55,'Узкая мебель · $5F','stool'),
       (56,'Подвесной светильник · верх','cap'),(57,'Широкий светильник','wide'),
       (58,'Вентилятор · кадр 1','fan'),(59,'Вентилятор · кадр 2','fan')]
for ep,bank in enumerate([0x9D7F8,0xCBB3C,0xF8664,0x1254F8],1):
    for tile,name in items:
        add(world(rom[bank+tile*512:bank+(tile+1)*512],palettes[f'world-{ep}']['colors']),f'pickup-{ep}-{tile}',name,'world',ep,'tall' if tile in (3,60) else 'small',tile=tile)
    for tile,name,shape in decor:
        add(world(rom[bank+tile*512:bank+(tile+1)*512],palettes[f'world-{ep}']['colors']),f'decor-{ep}-{tile}-{shape}',name,'decor',ep,shape,tile=tile)
    covered={tile for tile,_ in items}|{tile for tile,_,_ in decor}
    for tile in sorted(set(range(68))-covered):
        if tile==9: name,category,shape='Мина · кадр 2','world','small'
        elif tile==11: name,category,shape='Сохранённый пикап №11','world','small'
        elif tile==1: name,category,shape='Снаряд / огненный эффект','effects','projectile'
        elif tile==61: name,category,shape='Частица · полёт','effects','projectile'
        elif tile in (62,63,64,65): name,category,shape=f'Попадание · тайл {tile}','effects','projectile'
        else: name,category,shape=(f'Фигура №{tile}' if 21<=tile<=45 else f'Изображение №{tile}'),'other','raw'
        add(world(rom[bank+tile*512:bank+(tile+1)*512],palettes[f'world-{ep}']['colors']),f'tile-{ep}-{tile}',name,category,ep,shape,tile=tile,
            notice='Применение и игровые пропорции не установлены. Показан исходник.' if category=='other' else 'Сохранённый обработчик; штатный вызов не установлен.' if tile in (11,63,64,65) else '')
    variants=[(15,'Сохранённый Snowman · 4:1','world','legacy-wide',0,False),
              (16,'Gunrock · снаряд','effects','projectile',0,False),
              (0,'Огонь · отражённый','decor','flame',0,True),
              (59,'Вентилятор · кадр 3','decor','fan',0,True),
              (58,'Вентилятор · кадр 4','decor','fan',0,True),
              (1,'Медленный снаряд','effects','slow-projectile',0,False),
              (1,'Медленный снаряд · отражённый','effects','slow-projectile',0,True),
              (61,'Частица · полёт, отражённая','effects','projectile',0,True)]
    for shape,count,tile,title in [('explosion',6,1,'Взрыв'),('ground-effect',16,0,'Затухающий огонь'),('charge-fire',6,1,'Огонь при ударе'),('particle-wall',3,62,'Частица · контакт'),('particle-floor',3,62,'Частица · на полу')]:
        for phase in (range(count) if count!=3 else [0,128,255]):
            for mirror in [False,True]:
                variants.append((tile,f'{title} · фаза {phase}'+(' · отражение' if mirror else ''),'effects',shape,phase,mirror))
    for index,(tile,name,category,shape,phase,mirror) in enumerate(variants):
        add(world(rom[bank+tile*512:bank+(tile+1)*512],palettes[f'world-{ep}']['colors']),f'variant-{ep}-{index}',name,category,ep,shape,tile=tile,phase=phase,mirror=mirror,
            notice='Сохранённый вариант; штатный вызов не установлен.' if shape=='legacy-wide' else '')
for i in range(14):
    a=0x162548+i*512
    for pal in ['icons','icons-pause']:
        add(vdp(rom[a:a+512],4,4,palettes[pal]['colors']),f'{pal}-{i+1}',f'Иконка {i+1:02d}'+(' · пауза' if pal=='icons-pause' else ' · HUD'),'icons',palette=pal)
for key,name,a,tw,th in [('laser','Лазерный пистолет',0x15DB78,3,4),('shotgun','Дробовик',0x15E0B8,3,4),('grenade','Граната',0x15E358,3,4),('pulse-projectile','Пульс-лазер · снаряд',0x15E5F8,4,3),('buligun','Buligun',0x15E898,3,4),('rocket','Ракетница / Gunrock',0x15EB38,4,3),('pulse','Пульс-лазер',0x15EDD8,3,4),('flame','Огнемёт',0x15F078,3,4),('snowman','Snowman',0x15F318,3,4)]:
    add(vdp(rom[a:a+672],tw,th,palettes['held']['colors']),'held-'+key,name,'held')
sys.path.insert(0,str(ROOT/'zt_disasm/bztjuly/tools'))
from weapon_graphics_spec import RESOURCE_ROWS, MAPPING_TABLES, parse_sprite_record, mapping_vram_tiles
for index,(name,start,end,note) in enumerate(RESOURCE_ROWS):
    blob=rom[start:end];count=len(blob)//32;columns=7;rows=(count+columns-1)//columns
    atlas=Image.new('RGBA',(columns*8,rows*8))
    for t in range(count): atlas.paste(vdp(blob[t*32:(t+1)*32],1,1,palettes['held']['colors']),((t%columns)*8,(t//columns)*8))
    add(atlas,f'held-bank-{index}',name+' · все тайлы','held',notice='Банк графики; раскладка тайлов здесь справочная, не игровой кадр.')
for name,(address,count) in MAPPING_TABLES.items():
    for index in range(count):
        record=parse_sprite_record(rom,address+index*8)
        blob,context=mapping_vram_tiles(rom,name,index)
        tw,th=record['width_tiles'],record['height_tiles'];first=record['tile']-0x4EF
        sprite=vdp(blob[first*32:(first+tw*th)*32],tw,th,palettes['held']['colors'])
        if record['hflip']: sprite=sprite.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        if record['vflip']: sprite=sprite.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        add(sprite,f'held-map-{name}-{index}',f'{name} · {index}','held',notice='Запись таблицы спрайтов. Для неиспользуемых записей банк выбран по исследовательской модели.')
from sprite_sampling import sampling_tables
data=dict(game='Beyond Zero Tolerance · July 1995',rom_sha256=expected,palettes=palettes,examples=examples,sampling=sampling_tables(rom))
# Independent expected dimensions come from the reviewed research model, not core.js.
sys.path.insert(0,str(ROOT/'zt_disasm/bztjuly/tools'))
from object_graphics_spec import world_draws
entries={'small':(0x1238C,0),'tall':(0x122D0,0),'tree':(0x12444,0),
         'column':(0x1245C,0),'floorlamp':(0x12480,0),'stool':(0x124A4,0),
         'table':(0x124C4,0),'lamp':(0x124E8,0),'cap':(0x12508,0),
         'wide':(0x12530,0),'flame':(0x1229A,0),'camera':(0x123A4,0),
         'base':(0x12508,1),'fan':(0x125B6,0)}
fixtures=[]
for shape,(entry,index) in entries.items():
    for scale in [31,64,95,128]:
        for offset in ([-32,-24,-8,0,8,32] if shape in ('base','fan') else [0]):
            draw=world_draws(entry,scale=scale,pitch_delta=offset)[index]
            fixtures.append(dict(shape=shape,scale=scale,offset=offset,
                                 size=dict(width=2*draw['width_columns'],height=draw['height'])))
(SITE/'tests/geometry-fixtures.json').write_text(json.dumps(fixtures,indent=2)+'\n')

# ZT Rev A has its own palette addresses and scaler tables.
bzt_palettes=palettes
bzt_rom=rom
zt_rom=(ROOT/'zt_disasm/zt/build/zt.bin').read_bytes()
zt_digest='02e98d4dbf68c2279bf1471bfc7df4d6b8dc864435582beea92d2915febd0eeb'
assert hashlib.sha256(zt_rom).hexdigest()==zt_digest
rom=zt_rom;game_id='zt';palette_prefix='zt';game_label='ZT Rev A';palettes={}
palette('world','Объекты мира',0x20F2,True)
palette('icons','Иконки HUD',0x20D2)
palette('held','Оружие в руках',0x2112)
word=lambda a:int.from_bytes(rom[a:a+2],'big',signed=True)
long=lambda a:int.from_bytes(rom[a:a+4],'big')
zt_sampling=dict(rows=[list(rom[long(0xF6E8+4*h):long(0xF6E8+4*h)+h]) for h in range(81)],
                 steps=[[word(0x104D6+32*w+2*i) for i in range(16)] for w in range(32)])
assert all(len(row)==h and all(y<32 for y in row) for h,row in enumerate(zt_sampling['rows']))
sys.path.insert(0,str(ROOT/'zt_disasm/zt/tools'))
from world_object_graphics import TILES as ZT_TILES
pickup_names={3:'Биосканер',4:'Фонарик',5:'Лазерный пистолет',6:'Ракетница',7:'Граната',8:'Мина · кадр 1',9:'Мина · кадр 2',10:'Бронежилет',11:'Огнетушитель',12:'Дробовик',13:'Пистолет',14:'Ночное зрение',15:'Огнезащитный костюм',17:'Пульс-лазер',18:'Аптечка',60:'Огнемёт'}
decor_names={tile:(name,shape) for tile,name,shape in decor if tile not in (0,55)}
for tile in ZT_TILES:
    number=tile['index'];a=tile['address']
    if number in pickup_names:
        category='world';name=pickup_names[number];shape='tall' if number in (3,60) else 'legacy-wide' if number==15 else 'small'
    elif number==0: category,name,shape='effects','Огонь','flame'
    elif number==55: category,name,shape='decor','Стол','table'
    elif number in decor_names: category='decor';name,shape=decor_names[number]
    elif tile['status']=='unassigned': category,name,shape='other',f'Изображение №{number}','raw'
    elif tile['module']=='effects': category,name,shape='effects',tile['description'],'projectile'
    else: category,name,shape='other',f'Изображение №{number}','raw'
    add(world(rom[a:a+512],palettes['world']['colors']),f'tile-{number}',name,category,1,shape,tile=number)
a=0x10E9BE+55*512
add(world(rom[a:a+512],palettes['world']['colors']),'furniture-stool','Табурет','decor',1,'stool',tile=55)
icon_names=['Биосканер','Мина','Бронежилет','Огнетушитель','Огнезащитный костюм','Фонарик','Граната','Пистолет','Ночное зрение','Лазерный пистолет','Ракетница','Дробовик','Огнемёт','Пульс-лазер']
for i,name in enumerate(icon_names):
    a=0x15846E+i*512
    add(vdp(rom[a:a+512],4,4,palettes['icons']['colors']),f'icon-{i+1}',name,'icons')
# Reuse the already reviewed transparent exports, checking their recorded hashes.
manifest=json.loads((ROOT/'zt_weapon_graphics/manifest.json').read_text())
assert manifest['rom_sha256']==zt_digest
for row in manifest['images']:
    if row['category'] not in ('held_frame','held_tile_bank'): continue
    path=ROOT/'zt_weapon_graphics'/row['file']
    assert hashlib.sha256(path.read_bytes()).hexdigest()==row['sha256']
    name=path.stem.replace('_',' ')
    add(Image.open(path).convert('RGBA'),path.stem,name,'held',notice='Собранный кадр оружия.' if row['category']=='held_frame' else 'Графический блок оружия.')

games=dict(bzt=dict(name='BZT July',version='JULY 1995',rom_sha256=expected,palettes=bzt_palettes,sampling=data['sampling'],episodes=4,tile_count=68,archive='assets/bzt-july-resources.zip'),
           zt=dict(name='ZT Rev A',version='REV A',rom_sha256=zt_digest,palettes=palettes,sampling=zt_sampling,episodes=1,tile_count=66,archive='assets/zt-resources.zip'))

# Downloadable pickup variants use the ROM's packed-pair sampler at S=128.
# Geometry of pickups is exact for these three families; no viewport placement.
def stretched(example,game):
    image=Image.open(SITE/example['file']).convert('RGBA');shape=example['shape']
    width,height=(64,64) if shape=='tall' else (128,32) if shape=='legacy-wide' else (64,32)
    tables=game['sampling'];pairs=width//2;columns=[];offset=480 if example.get('mirror') else 0;acc=0
    for x in range(pairs):
        columns.append(offset//32)
        if pairs<16: offset+=tables['steps'][pairs+16*bool(example.get('mirror'))][x]
        else:
            acc+=16
            if acc>=pairs: acc-=pairs;offset+=-32 if example.get('mirror') else 32
    rows=tables['rows'][height]
    out=Image.new('RGBA',(width,height))
    for y,sy in enumerate(rows):
        for x,column in enumerate(columns):
            for n in (0,1): out.putpixel((2*x+n,y),image.getpixel((column*2+(1-n if example.get('mirror') else n),sy)))
    return out
for e in examples:
    if e['category']=='world':
        image=stretched(e,games[e['game']]);path=SITE/'assets/examples'/f"{e['id']}-game.png";image.save(path)
        e.update(stretchedFile=f'assets/examples/{path.name}',stretchedSrc='data:image/png;base64,'+base64.b64encode(path.read_bytes()).decode(),stretchedWidth=image.width,stretchedHeight=image.height)
for key,game in games.items():
    with zipfile.ZipFile(SITE/game['archive'],'w',compression=zipfile.ZIP_DEFLATED) as archive:
        folder={'world':'pickups/original','decor':'objects','effects':'effects','other':'unassigned','icons':'icons','held':'held'}
        for e in examples:
            if e['game']!=key:continue
            archive.write(SITE/e['file'],folder[e['category']]+'/'+Path(e['file']).name)
            if 'stretchedFile' in e:archive.write(SITE/e['stretchedFile'],'pickups/game/'+Path(e['stretchedFile']).name)
        for pal in game['palettes'].values():
            for ext in ('gpl','pal','aco','png'):
                path=SITE/'palettes'/f"{pal['stem']}.{ext}";archive.write(path,'palettes/'+path.name)
data['games']=games
(SITE/'palettes/palettes.json').write_text(json.dumps(dict(games={key:dict(name=g['name'],palettes=g['palettes']) for key,g in games.items()},rgb_conversion='floor(channel3 * 255 / 7)'),ensure_ascii=False,indent=2)+'\n')
(SITE/'reference-data.js').write_text('/* Generated by tools/export-reference.py */\nwindow.ZT_REFERENCE = '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n')
print('Exported:',{key:sum(e['game']==key for e in examples) for key in games},'with pickup variants and ZIP archives')
