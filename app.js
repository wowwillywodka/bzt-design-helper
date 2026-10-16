'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const ref = window.ZT_REFERENCE, core = window.ZTCore;
  const gameData = (key = $('game').value) => ref.games[key];
  let bztEpisode = '1';
  let image = null, activeExample = null, imageName = '', generation = 0, toastTimer;
  const scratch = document.createElement('canvas');
  const scratchCtx = scratch.getContext('2d', {willReadFrequently:true});
  const hex = rgb => '#' + rgb.map(v => v.toString(16).padStart(2,'0')).join('').toUpperCase();
  const isWorld = category => ['world','decor','effects','other'].includes(category);
  const shapeByRatio = {'1:2':'column','1:1':'tall','5:4':'flame','2:1':'small','8:3':'table','4:1':'cap','8:1':'wide'};
  const phaseMax = {explosion:5,'ground-effect':15,'charge-fire':5,'particle-wall':255,'particle-floor':255};
  const iconPalette = () => activeExample?.category === 'icons' ? activeExample.palette || 'icons' : 'icons';
  const worldPalette = () => $('game').value === 'bzt' ? 'world-'+$('episode').value : 'world';
  const paletteKey = () => isWorld($('category').value) ? worldPalette() : $('category').value === 'icons' ? iconPalette() : $('category').value;
  const examples = category => ref.examples.filter(e => e.game === $('game').value && (category === 'all' || e.category === category) && (!isWorld(e.category) || e.episode === Number($('episode').value)));

  function toast(text) {
    $('toast').textContent = text; $('toast').hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3000);
  }
  function openTab(name, focus = false) {
    for (const key of ['stretch','samples']) {
      const selected = key === name, tab = $('tab-'+key);
      tab.setAttribute('aria-selected', String(selected));tab.tabIndex = selected ? 0 : -1;
      $(key).hidden = !selected;
      if (selected && focus) tab.focus();
    }
    if (name === 'stretch') fit();
  }
  function loadImage(src, name, example = null, settings = null) {
    const token = ++generation, next = new Image();
    next.onload = () => {
      if (token !== generation) return;
      image = next; imageName = name; activeExample = example;
      if (example) {
        $('category').value = example.category;
        if (isWorld(example.category)) {
          $('shape').value = example.shape;
          $('height-offset').value = '0';
          $('effect-phase').max = phaseMax[example.shape] ?? 255;
          $('effect-phase').value = example.phase ?? 0;
          $('mirror').checked = !!example.mirror;
        }
      }
      if (settings) {
        $('shape').value = settings.shape;
        $('height-offset').value = settings.heightOffset;
        $('effect-phase').max = phaseMax[settings.shape] ?? 255;
        $('effect-phase').value = settings.phase;
        $('mirror').checked = settings.mirror;
      }
      $('file-name').textContent = name + (example ? ' · образец' : '');
      showPalettes();
      render();
    };
    next.onerror = () => {if (token === generation) toast('Не удалось прочитать PNG.');};
    next.src = src;
  }
  function getPixels() {
    scratch.width = image.naturalWidth;scratch.height = image.naturalHeight;
    scratchCtx.drawImage(image,0,0);
    return scratchCtx.getImageData(0,0,scratch.width,scratch.height).data;
  }
  function sampled(pixels, width, height, size, mirror, overflowPair = null) {
    return width === 32 && height === 32
      ? core.gameSample(pixels,size.width,size.height,gameData().sampling,mirror,overflowPair)
      : core.sample(pixels,width,height,size.width,size.height,mirror);
  }
  function fit() {
    if (!image || $('stretch').hidden) return;
    const source = $('source'), result = $('result'), stage = $('result-stage');
    // Both views use the same integer zoom. Nothing is cropped or normalized independently.
    const available = Math.min(8,
      (Math.min(stage.clientWidth,$('source-stage').clientWidth)-24)/Math.max(source.width,result.width),
      (stage.clientHeight-24)/Math.max(source.height,result.height));
    const zoom = available >= 1 ? Math.floor(available) : available;
    for (const canvas of [source,result]) {
      canvas.style.width = canvas.width*zoom+'px';canvas.style.height = canvas.height*zoom+'px';
    }
  }
  function render() {
    if (!image) return;
    const category = $('category').value, world = isWorld(category);
    const shape = $('shape').value, variable = world && ['base','fan'].includes(shape);
    const w = image.naturalWidth, h = image.naturalHeight;
    $('ratio').hidden = !world;
    $('ratio-description').hidden = !world;
    $('result-title').textContent = world && shape === 'raw' ? 'Исходные пропорции' : world ? `По алгоритму ${$('game').value === 'zt' ? 'ZT' : 'BZT'}` : 'Игровые пропорции';
    $('height-control').hidden = !variable;
    const phased = world && Object.hasOwn(phaseMax,shape);
    $('phase-control').hidden = !phased;
    $('effect-phase').max = phaseMax[shape] ?? 255;
    $('phase-value').value = $('effect-phase').value;
    $('mirror-label').hidden = !world;
    $('source').width = w; $('source').height = h;
    $('source').getContext('2d').drawImage(image,0,0);
    // Physical dimensions at S=128; packed-byte columns occupy two pixels.
    const size = world && shape !== 'raw' ? core.dimensions(shape,128,Number($('height-offset').value),Number($('effect-phase').value)) : {width:w,height:h};
    const pixels = getPixels();
    const visible = size.width > 0 && size.height > 0;
    $('result').width = Math.max(1,size.width);$('result').height = Math.max(1,size.height);
    if (visible) {
      const output = world && shape !== 'raw'
        ? sampled(pixels,w,h,size,$('mirror').checked,activeExample?.overflowPair)
        : core.sample(pixels,w,h,size.width,size.height,world && $('mirror').checked);
      $('result').getContext('2d').putImageData(new ImageData(output,size.width,size.height),0,0);
    }
    $('result').hidden = !visible;
    $('download').disabled = !visible;
    $('source-size').textContent = `${w} × ${h}`;
    const ratio = core.ratio(size.width,size.height);
    $('result-size').textContent = `${size.width} × ${size.height} · ${ratio}`;
    $('height-ratio').value = ratio;
    const selectedRatio = !size.height ? '1:0' : !size.width ? '0:1' : ratio;
    const ratioOptions = Object.keys(shapeByRatio);
    if (!ratioOptions.includes(selectedRatio)) ratioOptions.push(selectedRatio);
    $('ratio').replaceChildren(...ratioOptions.map(value => {
      const option = document.createElement('option');option.value = value;option.textContent = value;return option;
    }));
    $('ratio').value = selectedRatio;
    $('hint').textContent = world ? (shape === 'raw' ? 'Игровые пропорции не установлены. Показан исходник без растяжения.' : phased
      ? visible ? `Фаза ${$('effect-phase').value}. Ползунок показывает изменение формы и размера эффекта.` : 'В этой фазе ширина или высота равна нулю: изображение не рисуется.' : variable
      ? size.height ? 'У этого объекта пропорции зависят от высоты камеры. Ползунок меняет только сжатие; исходник — 32×32.' : 'При таком сжатии высота равна нулю: изображение не рисуется.'
      : 'Исходник сдавай 32×32.')
      : category === 'icons' ? 'Иконка остаётся квадратной: 32×32, без растяжения.' : 'Оружие в руках не растягивается. Здесь показан отдельный блок графики.';
    if (activeExample?.notice && shape !== 'raw') $('hint').textContent += ' ' + activeExample.notice;
    $('download').textContent = world && shape !== 'raw' ? 'Как в игре ↓' : 'Предпросмотр PNG ↓';
    validate(pixels,w,h,category);
    fit();
  }
  function validate(pixels,w,h,category) {
    const r = core.inspect(pixels,w,h,gameData().palettes[paletteKey()].colors,category), issues = [];
    if (!r.sizeOK) issues.push(category === 'held' ? 'Размеры блока должны быть кратны 8, в пределах 160×96.' : 'Нужен исходник 32×32.');
    if (r.invalid.length) issues.push(`Цветов вне палитры: ${r.invalid.length}.`);
    if (r.semi) issues.push(`Полупрозрачных пикселей: ${r.semi}.`);
    if (r.mixedPairs) issues.push(`Неполных прозрачных пар: ${r.mixedPairs}. В мире прозрачность задаётся на пару пикселей.`);
    $('status').textContent = issues.length ? issues.join(' ') : '✓ Размер, палитра и прозрачность в порядке.';
    $('status').classList.toggle('bad',!!issues.length);
  }
  async function upload(file) {
    if (!file) return;
    const token = ++generation;
    if (file.size > 2*1024*1024) {toast('PNG должен быть не больше 2 МБ.');return;}
    const header = new Uint8Array(await file.slice(0,24).arrayBuffer());
    if (header.length < 24 || ![137,80,78,71,13,10,26,10].every((v,i) => header[i] === v)) {toast('Нужен PNG-файл.');return;}
    const view = new DataView(header.buffer);
    if (view.getUint32(16) > 2048 || view.getUint32(20) > 2048) {toast('Слишком большой холст. Максимум — 2048×2048.');return;}
    const reader = new FileReader();
    reader.onload = () => {if (token === generation) loadImage(reader.result,file.name);};
    reader.onerror = () => toast('Не удалось прочитать файл.');
    reader.readAsDataURL(file);
  }
  function showExamples() {
    const query = $('sample-search').value.trim().toLocaleLowerCase('ru');
    const filtered = examples($('sample-category').value).filter(e => !query || `${e.name} ${e.tile ?? ''} ${e.shape} ${e.id}`.toLocaleLowerCase('ru').includes(query));
    $('sample-count').textContent = `Образцов: ${filtered.length}. ${gameData().tile_count} тайлов мира${$('game').value === 'bzt' ? ' в каждом эпизоде' : ''}.`;
    $('sample-grid').replaceChildren(...filtered.map(example => {
      const card = document.createElement('article');card.className = 'sample';
      const button = document.createElement('button');button.type = 'button';button.className = 'sample-open';
      const preview = document.createElement('span');preview.className = 'sample-image';
      const img = document.createElement('img');img.src = example.src;img.alt = '';
      img.loading = 'lazy';
      const size = isWorld(example.category) ? core.dimensions(example.shape,128,0,example.phase ?? 0) : {width:example.width,height:example.height};
      const fit = Math.min(96/Math.max(1,size.width),96/Math.max(1,size.height));
      img.style.width = size.width*fit+'px';img.style.height = size.height*fit+'px';
      if (!size.width || !size.height) img.hidden = true;
      if (isWorld(example.category) && example.shape !== 'raw' && size.width && size.height) {
        // Generate the thumbnail through the same packed-pair scaler as export;
        // stretching the original <img> with CSS gives a different pixel pattern.
        img.onload = () => {
          img.onload = null;
          const canvas = document.createElement('canvas');canvas.width = canvas.height = 32;
          const c = canvas.getContext('2d');c.drawImage(img,0,0);
          const input = c.getImageData(0,0,32,32).data;
          const pixels = core.gameSample(input,size.width,size.height,gameData(example.game).sampling,!!example.mirror,example.overflowPair);
          canvas.width = size.width;canvas.height = size.height;
          c.putImageData(new ImageData(pixels,size.width,size.height),0,0);
          img.src = canvas.toDataURL('image/png');
        };
      }
      const name = document.createElement('span');name.className = 'sample-name';name.textContent = example.name;
      const meta = document.createElement('span');meta.className = 'sample-meta';
      meta.textContent = (example.tile === undefined ? '' : `№${example.tile} · `) + (example.shape === 'raw' ? 'Применение не установлено' : core.ratio(size.width,size.height));
      preview.append(img);button.append(preview,name,meta);
      button.addEventListener('click',() => {loadImage(example.src,example.name,example);openTab('stretch');});
      const downloads = document.createElement('div');downloads.className = 'sample-downloads';
      const original = document.createElement('a');original.href = example.src;original.download = example.id+'-original.png';original.textContent = 'Обычный PNG ↓';downloads.append(original);
      if (example.stretchedSrc) {
        const stretched = document.createElement('a');stretched.href = example.stretchedSrc;stretched.download = example.id+'-game.png';stretched.textContent = 'Как в игре ↓';downloads.append(stretched);
      }
      card.append(button,downloads);
      return card;
    }));
  }
  function showPalettes() {
    $('palette-cards').replaceChildren(...[worldPalette(),iconPalette(),'held'].map(key => {
      const pal = gameData().palettes[key], card = document.createElement('article');card.className = 'palette-card';
      const title = document.createElement('h3');title.textContent = pal.name;
      const swatches = document.createElement('div');swatches.className = 'swatches';
      pal.colors.forEach((color,i) => {
        const value = hex(color), slot = i.toString(16).toUpperCase();
        const b = document.createElement('button');b.type = 'button';b.className = 'swatch';
        b.title = `${slot}: ${value} · CRAM $${pal.words[i]}`;
        b.setAttribute('aria-label',`Скопировать ${value}, слот ${slot}${i===0?', прозрачность':''}`);
        const chip = document.createElement('span');chip.className = 'swatch-color'+(i===0?' transparent':'');
        if (i) chip.style.backgroundColor = value;
        b.append(chip,document.createTextNode(slot));
        b.addEventListener('click',async() => {
          try {await navigator.clipboard.writeText(value);toast(value+' скопирован');}
          catch {toast(value);}
        });
        swatches.append(b);
      });
      const links = document.createElement('div');links.className = 'palette-links';
      for (const ext of ['gpl','pal','aco','png']) {
        const a = document.createElement('a');a.href = `palettes/${pal.stem}.${ext}`;a.download = '';a.textContent = ext.toUpperCase()+' ↓';links.append(a);
      }
      card.append(title,swatches,links);
      if ($('game').value === 'bzt' && (key === 'icons' || key === 'icons-pause')) {
        const pause = document.createElement('a');pause.className = 'pause-link';pause.href = `palettes/bzt-${key === 'icons' ? 'icons-pause' : 'icons'}.gpl`;pause.download = '';
        pause.textContent = key === 'icons' ? 'В паузе — другая палитра (GPL)' : 'Палитра HUD (GPL)';card.append(pause);
      }
      return card;
    }));
  }
  for (const name of ['stretch','samples']) {
    $('tab-'+name).addEventListener('click',() => openTab(name));
    $('tab-'+name).addEventListener('keydown',e => {
      if (['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) {
        e.preventDefault();openTab(e.key === 'Home' ? 'stretch' : e.key === 'End' ? 'samples' : name === 'stretch' ? 'samples' : 'stretch',true);
      }
    });
  }
  $('upload').addEventListener('change',() => {void upload($('upload').files[0]);$('upload').value = '';});
  let dragDepth = 0;
  const hasFiles = e => Array.from(e.dataTransfer?.types || []).includes('Files');
  function resetDrop() {
    dragDepth = 0;
    $('drop-overlay').hidden = true;
    $('dropzone').classList.remove('dragging');
  }
  window.addEventListener('dragenter',e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    $('drop-overlay').hidden = false;
    $('dropzone').classList.add('dragging');
  });
  window.addEventListener('dragover',e => {
    e.preventDefault();
    if (hasFiles(e)) e.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('dragleave',() => {
    if (dragDepth > 0 && --dragDepth === 0) resetDrop();
  });
  window.addEventListener('drop',e => {
    e.preventDefault();
    resetDrop();
    const file = e.dataTransfer?.files[0];
    if (file) {
      openTab('stretch');
      void upload(file);
    }
  });
  window.addEventListener('blur',resetDrop);
  window.addEventListener('dragend',resetDrop);
  $('ratio').addEventListener('change',() => {
    const shape = shapeByRatio[$('ratio').value];
    if (shape) {
      $('shape').value = shape;
      $('effect-phase').value = '0';
      $('height-offset').value = '0';
      render();
    }
  });
  $('height-offset').addEventListener('input',render);
  $('effect-phase').addEventListener('input',render);
  $('mirror').addEventListener('change',render);
  $('category').addEventListener('change',() => {
    if (activeExample) {
      const example = examples($('category').value)[0];loadImage(example.src,example.name,example);
    } else render();
  });
  $('game').addEventListener('change',() => {
    const zt = $('game').value === 'zt';
    $('episode-label').hidden = zt;
    if (zt) {bztEpisode = $('episode').value;$('episode').value = '1';}
    else $('episode').value = bztEpisode;
    $('version').textContent = gameData().version;
    $('game-credit').textContent = zt ? 'Zero Tolerance · Rev A' : 'Beyond Zero Tolerance · July prototype';
    $('download-pack').href = gameData().archive;
    $('download-pack').textContent = `Скачать набор ${gameData().name} · ZIP ↓`;
    showExamples();
    if (activeExample) {
      const example = examples($('category').value)[0];
      loadImage(example.src,example.name,example);
    } else {showPalettes();render();}
  });
  $('episode').addEventListener('change',() => {
    showPalettes();showExamples();
    if (activeExample && isWorld(activeExample.category)) {
      const id = activeExample.id.replace(/-\d+-/,`-${$('episode').value}-`);
      const example = ref.examples.find(e => e.id === id);
      const shape = $('shape').value, heightOffset = $('height-offset').value, phase = $('effect-phase').value, mirror = $('mirror').checked;
      loadImage(example.src,example.name,example,{shape,heightOffset,phase,mirror});
    } else render();
  });
  $('sample-category').addEventListener('change',showExamples);
  $('sample-search').addEventListener('input',showExamples);
  $('download').addEventListener('click',() => {
    if (!image) return;
    const a = document.createElement('a');a.href = $('result').toDataURL('image/png');
    const stem = imageName.replace(/\.png$/i,'').replace(/[^\p{L}\p{N}_-]/gu,'_');
    a.download = `${$('game').value}-${stem}-${$('result').width}x${$('result').height}.png`;a.click();
  });
  $('download-original').addEventListener('click',() => {
    if (!image) return;
    const a = document.createElement('a');a.href = image.src;
    a.download = activeExample ? activeExample.id+'-original.png' : imageName;
    a.click();
  });
  new ResizeObserver(fit).observe($('result-stage'));
  showPalettes();showExamples();
  const initial = ref.examples.find(e => e.id === 'pickup-1-12');loadImage(initial.src,initial.name,initial);
})();
