// main.js — application bootstrap & wiring.
import { log } from './logger.js';
import { UIManager } from './ui.js';
import { Scene3D } from './scene.js';
import { Viewer } from './viewer.js';
import { FilterController } from './filters.js';
import { AudioPlayer } from './audio.js';
import { importModel, importLpkFiles } from './importer.js';
import { BG_PRESETS, bgSwatch } from './presets.js';

const $ = id => document.getElementById(id);
const PREFS_KEY = 'l2d.prefs';
const HISTORY_KEY = 'l2d.history';

const app = {
  ui: null, scene: null, viewer: null, filters: null, audio: null,
  currentUrls: [], bgState: { blur: 0, bright: 100 },
  prefs: {}, history: [],
};

/* ----------------------------- prefs ----------------------------- */
function loadPrefs() { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch { return {}; } }
function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(app.prefs)); } catch {} }
function setPref(k, v) { app.prefs[k] = v; savePrefs(); }

/* ----------------------------- helpers ----------------------------- */
const setText = (id, t) => { const e = $(id); if (e) e.textContent = t; };
const setLabel = (key, t) => { const e = document.querySelector(`[data-val="${key}"]`); if (e) e.textContent = t; };
function showLoading(text) { const l = $('loading'); if (l) { l.querySelector('.loading-text').textContent = text || '加载中…'; l.classList.remove('hide'); } }
function hideLoading() { $('loading')?.classList.add('hide'); }

/* ----------------------------- model loading ----------------------------- */
async function loadTarget(target) {
  showLoading(`正在加载：${target.name || '模型'}`);
  const old = app.currentUrls;
  app.currentUrls = target.objectUrls || [];
  try {
    await app.viewer.load(target);
  } catch (e) {
    app.ui.toast('模型加载失败：' + (e.message || e));
    hideLoading();
    return false;
  }
  // revoke previous model's blob URLs
  for (const u of old) { try { URL.revokeObjectURL(u); } catch {} }

  setText('info-name', target.name || '—');
  setText('info-format', target.format || '—');
  setText('brand-model', target.name || '已加载模型');
  const acts = app.viewer.getActions();
  setText('info-counts', `${acts.expressions.length} 表情 / ${acts.motions.length} 动作组`);
  buildActions(acts);
  syncTuneUI();
  app.ui.toast('已加载：' + (target.name || '模型'));
  hideLoading();
  return true;
}

/* ----------------------------- import history ----------------------------- */
const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function fmtAgo(t) {
  const d = Date.now() - t;
  if (d < 60000) return '刚刚';
  if (d < 3600000) return Math.floor(d / 60000) + ' 分钟前';
  const dt = new Date(t), p = n => String(n).padStart(2, '0');
  if (d < 86400000) return `${p(dt.getHours())}:${p(dt.getMinutes())}`;
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}
function loadHistory() { try { app.history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { app.history = []; } }
function persistHistory() {
  try {
    const meta = app.history.map(({ id, name, format, kind, time }) => ({ id, name, format, kind, time }));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(meta));
  } catch {}
}
function recordHistory({ name, format, kind, entries }) {
  const id = `${name}|${format}`;
  app.history = app.history.filter(h => h.id !== id);
  app.history.unshift({ id, name, format, kind, time: Date.now(), entries });   // entries kept in-memory only
  if (app.history.length > 12) app.history = app.history.slice(0, 12);
  persistHistory();
  renderHistory();
}
function removeHistory(id) { app.history = app.history.filter(h => h.id !== id); persistHistory(); renderHistory(); }
function clearHistory() { app.history = []; persistHistory(); renderHistory(); app.ui.toast('已清空导入历史'); }
function reloadHistory(id) {
  const h = app.history.find(e => e.id === id);
  if (!h) return;
  if (h.entries) {                                   // same session: reload instantly
    h.kind === 'lpk' ? doImportLpk(h.entries) : doImportModel(h.entries, h.kind);
  } else {                                           // restored from a past session: re-pick files
    app.ui.toast('该记录来自既往会话，请重新选择对应文件');
    if (h.kind === 'lpk') $('import-lpk').click();
    else if (h.kind === 'folder') $('import-folder').click();
    else $('import-files').click();
  }
}
function renderHistory() {
  const c = $('import-history'); if (!c) return;
  c.innerHTML = '';
  if (!app.history.length) { c.innerHTML = '<span class="empty">暂无导入记录</span>'; return; }
  const ico = k => k === 'lpk' ? '🔓' : k === 'folder' ? '📁' : '🗂️';
  for (const h of app.history) {
    const row = document.createElement('div');
    row.className = 'history-item' + (h.entries ? '' : ' stale');
    row.innerHTML = `<span class="hi-ico">${ico(h.kind)}</span>` +
      `<span class="hi-main"><b>${escapeHtml(h.name)}</b><small>${escapeHtml(h.format)} · ${fmtAgo(h.time)}${h.entries ? '' : ' · 需重新选择'}</small></span>` +
      `<button class="hi-del" title="移除">✕</button>`;
    row.addEventListener('click', () => reloadHistory(h.id));
    row.querySelector('.hi-del').addEventListener('click', e => { e.stopPropagation(); removeHistory(h.id); });
    c.appendChild(row);
  }
}

/* ----------------------------- actions UI ----------------------------- */
function buildActions(acts) {
  const ex = $('action-expressions');
  const mo = $('action-motions');
  if (ex) {
    ex.innerHTML = '';
    if (!acts.expressions.length) ex.innerHTML = '<span class="empty">该模型无表情</span>';
    for (const e of acts.expressions) {
      const b = document.createElement('button');
      b.className = 'tag'; b.textContent = e.label;
      b.title = e.id;
      b.addEventListener('click', () => { app.viewer.setExpression(e.id); flashActive(b, ex); });
      ex.appendChild(b);
    }
  }
  if (mo) {
    mo.innerHTML = '';
    if (!acts.motions.length) { mo.innerHTML = '<span class="empty">该模型无独立动作</span>'; }
    for (const m of acts.motions) {
      const b = document.createElement('button');
      b.className = 'tag'; b.textContent = `${m.group} ×${m.count}`;
      b.addEventListener('click', () => app.viewer.playMotion(m.group));
      mo.appendChild(b);
    }
  }
}
function flashActive(btn, container) {
  container.querySelectorAll('.tag').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
}

/* ----------------------------- fine-tune ----------------------------- */
function syncTuneUI() {
  const t = app.viewer.t;
  const set = (id, v) => { const e = $(id); if (e) e.value = v; };
  set('tune-x', t.fx); set('tune-y', t.fy);
  set('tune-scale', Math.round(t.scale * 100)); set('tune-rot', Math.round(t.rot));
  set('tune-alpha', Math.round(t.alpha * 100));
  setLabel('tune-x', t.fx.toFixed(2)); setLabel('tune-y', t.fy.toFixed(2));
  setLabel('tune-scale', Math.round(t.scale * 100) + '%'); setLabel('tune-rot', Math.round(t.rot) + '°');
  setLabel('tune-alpha', Math.round(t.alpha * 100) + '%');
}
function wireTune() {
  const bind = (id, fn, label) => {
    const el = $(id); if (!el) return;
    el.addEventListener('input', e => { fn(parseFloat(e.target.value)); if (label) setLabel(id, label(e.target.value)); });
  };
  bind('tune-x', v => app.viewer.set('fx', v), v => (+v).toFixed(2));
  bind('tune-y', v => app.viewer.set('fy', v), v => (+v).toFixed(2));
  bind('tune-scale', v => app.viewer.set('scale', v / 100), v => v + '%');
  bind('tune-rot', v => app.viewer.set('rot', v), v => v + '°');
  bind('tune-alpha', v => app.viewer.set('alpha', v / 100), v => v + '%');
  $('tune-track')?.addEventListener('change', e => app.viewer.setTrackMouse(e.target.checked));
  $('tune-breath')?.addEventListener('change', e => app.viewer.setBreath(e.target.checked));
  $('tune-idle')?.addEventListener('change', e => app.viewer.setTapMotion(e.target.checked));
  $('tune-fit')?.addEventListener('click', () => { app.viewer.fit(); syncTuneUI(); });
  $('tune-reset')?.addEventListener('click', () => { app.viewer.reset(); syncTuneUI(); });
}

/* ----------------------------- background ----------------------------- */
function applyBgFilter() {
  const b = app.bgState;
  $('bg-canvas').style.filter = `blur(${b.blur}px) brightness(${b.bright}%)`;
}
function wireBackground() {
  const grid = $('bg-presets');
  grid.innerHTML = '';
  for (const p of BG_PRESETS) {
    const el = document.createElement('button');
    el.className = 'preset'; el.dataset.bid = p.id;
    el.style.background = bgSwatch(p);
    el.innerHTML = `<span class="pico">${p.pico}</span>${p.name}`;
    el.addEventListener('click', () => {
      app.scene.applyBackground(p);
      grid.querySelectorAll('.preset').forEach(x => x.classList.toggle('active', x === el));
      setPref('bg', p.id);
    });
    grid.appendChild(el);
  }
  $('bg-apply-grad')?.addEventListener('click', () => {
    app.scene.setCustomGradient($('bg-c1').value, $('bg-c2').value);
    grid.querySelectorAll('.preset').forEach(x => x.classList.remove('active'));
    setPref('bg', null);
  });
  const bindBg = (id, key, label) => $(id)?.addEventListener('input', e => {
    app.bgState[key] = parseFloat(e.target.value); applyBgFilter(); setLabel(id, label(e.target.value)); setPref('bgState', app.bgState);
  });
  bindBg('bg-blur', 'blur', v => v);
  bindBg('bg-bright', 'bright', v => v + '%');
  $('bg-celestial')?.addEventListener('change', e => { app.scene.setCelestial(e.target.checked); setPref('celestial', e.target.checked); });
  $('bg-parallax')?.addEventListener('change', e => { app.scene.setParallax(e.target.checked); setPref('parallax', e.target.checked); });
}
function markActiveBg(id) {
  document.querySelectorAll('#bg-presets .preset').forEach(el => el.classList.toggle('active', el.dataset.bid === id));
}

/* ----------------------------- weather ----------------------------- */
const amountWord = v => v < 500 ? '稀疏' : v < 1200 ? '适中' : v < 2200 ? '较多' : '密集';
function wireWeather() {
  const seg = $('weather-seg');
  seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    seg.querySelectorAll('button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    app.scene.setWeather(b.dataset.w);
    setPref('weather', b.dataset.w);
  }));
  const bindW = (id, key, label) => $(id)?.addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    app.scene.setWeatherParams({ [key]: v });
    setLabel(id, label(v));
    setPref('weatherParams', app.scene.params);
  });
  bindW('w-amount', 'amount', v => amountWord(v));
  bindW('w-speed', 'speed', v => (v / 100).toFixed(1) + '×');
  bindW('w-wind', 'wind', v => String(v));
  bindW('w-size', 'size', v => (v / 100).toFixed(1) + '×');
  // fog overlay
  const fog = document.createElement('div');
  fog.style.cssText = 'position:absolute;inset:auto 0 0 0;height:42%;z-index:2;pointer-events:none;opacity:0;transition:opacity .8s;background:linear-gradient(to top,rgba(225,232,245,.55),transparent);backdrop-filter:blur(1px)';
  $('stage').appendChild(fog);
  $('w-fog')?.addEventListener('change', e => { fog.style.opacity = e.target.checked ? '1' : '0'; setPref('fog', e.target.checked); });
  app._fog = fog;
}
function markActiveWeather(w) {
  const seg = $('weather-seg');
  seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.w === w));
}

/* ----------------------------- import ----------------------------- */
function entriesFromInput(fileList, useRelative) {
  return Array.from(fileList || []).map(f => ({ file: f, path: (useRelative && f.webkitRelativePath) ? f.webkitRelativePath : f.name }));
}

async function doImportModel(entries, kind = 'files') {
  if (!entries.length) return;
  showLoading('正在导入本地模型…');
  let target;
  try {
    target = await importModel(entries);
  } catch (e) {
    log.error('导入失败', e); app.ui.toast('导入失败：' + (e.message || e)); hideLoading(); return;
  }
  if (await loadTarget(target)) recordHistory({ name: target.name, format: target.format, kind, entries });
}
async function doImportLpk(entries) {
  showLoading('正在本地解密 .lpk …');
  let target;
  try {
    target = await importLpkFiles(entries);
  } catch (e) {
    log.error('lpk 导入失败', e); app.ui.toast('lpk 导入失败：' + (e.message || e)); hideLoading(); return;
  }
  if (await loadTarget(target)) recordHistory({ name: target.name, format: target.format, kind: 'lpk', entries });
}
function wireImport() {
  // .lpk import is two steps: choose the .lpk, then its config.json separately
  let pendingLpk = null;
  const finishLpkImport = (lpkFile, cfgFile) => {
    if (!lpkFile) return;
    const entries = [{ file: lpkFile, path: lpkFile.name }];
    if (cfgFile) entries.push({ file: cfgFile, path: 'config.json' });
    pendingLpk = null;
    doImportLpk(entries);
  };

  $('import-folder')?.addEventListener('click', () => $('file-folder').click());
  $('import-files')?.addEventListener('click', () => $('file-files').click());
  $('import-lpk')?.addEventListener('click', () => { pendingLpk = null; const i = $('file-lpk'); i.value = ''; i.click(); });
  $('import-bg')?.addEventListener('click', () => $('file-bg').click());
  $('file-folder')?.addEventListener('change', e => doImportModel(entriesFromInput(e.target.files, true), 'folder'));
  $('file-files')?.addEventListener('change', e => doImportModel(entriesFromInput(e.target.files, false), 'files'));
  // step 1: pick the .lpk -> then pop a second dialog for config.json
  $('file-lpk')?.addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    pendingLpk = f;
    app.ui.toast(`已选择 ${f.name}，请继续选择配套 config.json（无则可取消跳过）`);
    const cfg = $('file-lpk-config'); cfg.value = ''; cfg.click();
  });
  // step 2: pick config.json (or cancel to proceed without it)
  $('file-lpk-config')?.addEventListener('change', e => finishLpkImport(pendingLpk, e.target.files[0] || null));
  $('file-lpk-config')?.addEventListener('cancel', () => { if (pendingLpk) finishLpkImport(pendingLpk, null); });
  $('file-bg')?.addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    app.scene.setBackgroundImage(URL.createObjectURL(f), f.name);
    markActiveBg(null); setPref('bg', null);
  });
  $('btn-clear-model')?.addEventListener('click', () => {
    app.viewer.clear();
    for (const u of app.currentUrls) { try { URL.revokeObjectURL(u); } catch {} }
    app.currentUrls = [];
    setText('info-name', '—'); setText('info-format', '—'); setText('info-counts', '—'); setText('brand-model', '未加载模型');
    buildActions({ expressions: [], motions: [] });
    app.ui.toast('模型已移除');
  });
}

/* drag & drop */
async function traverseEntry(entry, path, out) {
  return new Promise(resolve => {
    if (entry.isFile) {
      entry.file(file => { out.push({ file, path: (path || '') + file.name }); resolve(); }, () => resolve());
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const readBatch = () => reader.readEntries(async list => {
        if (!list.length) return resolve();
        for (const e of list) await traverseEntry(e, (path || '') + entry.name + '/', out);
        readBatch();
      }, () => resolve());
      readBatch();
    } else resolve();
  });
}
function wireDragDrop() {
  const overlay = $('drop-overlay');
  let depth = 0;
  window.addEventListener('dragenter', e => { e.preventDefault(); depth++; overlay.classList.add('show'); });
  window.addEventListener('dragover', e => { e.preventDefault(); });
  window.addEventListener('dragleave', e => { e.preventDefault(); if (--depth <= 0) { depth = 0; overlay.classList.remove('show'); } });
  window.addEventListener('drop', async e => {
    e.preventDefault(); depth = 0; overlay.classList.remove('show');
    const dt = e.dataTransfer; if (!dt) return;
    const out = [];
    const items = dt.items ? Array.from(dt.items) : [];
    const entries = items.map(it => it.webkitGetAsEntry && it.webkitGetAsEntry()).filter(Boolean);
    if (entries.length) {
      for (const en of entries) await traverseEntry(en, '', out);
    } else {
      for (const f of Array.from(dt.files || [])) out.push({ file: f, path: f.name });
    }
    if (!out.length) return;
    classifyAndImport(out);
  });
}
function classifyAndImport(entries) {
  const nameOf = e => (e.path || e.file.name).toLowerCase();
  if (entries.some(e => /\.lpk$/.test(nameOf(e)))) return doImportLpk(entries);
  const hasModel = entries.some(e => /\.(moc3?|json)$/.test(nameOf(e)));
  if (!hasModel) {
    const img = entries.find(e => /\.(png|jpe?g|webp|gif|bmp)$/.test(nameOf(e)));
    if (img) { app.scene.setBackgroundImage(URL.createObjectURL(img.file), img.file.name); markActiveBg(null); app.ui.toast('背景已更新'); return; }
  }
  return doImportModel(entries);
}

/* ----------------------------- console ----------------------------- */
function wireConsole() {
  log.attach($('log-output'));
  $('log-level')?.addEventListener('change', e => log.setFilter(e.target.value));
  const as = $('log-autoscroll');
  as?.addEventListener('click', () => {
    const on = as.dataset.on === '1' ? '0' : '1';
    as.dataset.on = on; as.classList.toggle('off', on === '0');
    log.setAutoscroll(on === '1');
  });
  $('log-copy')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(log.text()); app.ui.toast('日志已复制'); }
    catch { app.ui.toast('复制失败'); }
  });
  $('log-clear')?.addEventListener('click', () => log.clear());
}

/* ----------------------------- settings & topbar ----------------------------- */
function wireSettings() {
  $('set-quality')?.addEventListener('change', e => { app.scene.setQuality(e.target.value); setPref('quality', e.target.value); });
  $('set-aa')?.addEventListener('change', e => { setPref('aa', e.target.checked); app.ui.toast('抗锯齿将在刷新后生效'); });
  $('set-showfps')?.addEventListener('change', e => { app._showFps = e.target.checked; $('btn-fps').style.display = e.target.checked ? '' : 'none'; setPref('showfps', e.target.checked); });
  $('set-glass')?.addEventListener('change', e => { document.body.classList.toggle('no-glass', !e.target.checked); setPref('glass', e.target.checked); });
  $('set-reset-layout')?.addEventListener('click', () => app.ui.resetLayout());
  $('set-screenshot')?.addEventListener('click', () => {
    const data = app.viewer.screenshot();
    if (!data) { app.ui.toast('截图失败'); return; }
    const a = document.createElement('a'); a.href = data; a.download = `live2d-${Date.now()}.png`; a.click();
    app.ui.toast('已保存截图');
  });
}
function startFpsMeter() {
  let frames = 0, last = performance.now();
  app._showFps = true;
  const loop = () => {
    requestAnimationFrame(loop);
    frames++;
    const now = performance.now();
    if (now - last >= 500) {
      const fps = Math.round((frames * 1000) / (now - last));
      frames = 0; last = now;
      if (app._showFps) setText('btn-fps', fps + ' FPS');
    }
  };
  requestAnimationFrame(loop);
}

/* ----------------------------- music ----------------------------- */
function wireMusic() {
  app.audio = new AudioPlayer({ onMouth: v => app.viewer.setMouth(v) });
  app.audio.mount();
  const ls = $('music-lipsync');
  app.viewer.enableLipsync(ls ? ls.checked : true);
  ls?.addEventListener('change', e => app.viewer.enableLipsync(e.target.checked));
}

/* ----------------------------- apply saved prefs ----------------------------- */
function applyPrefs() {
  const p = app.prefs;
  // background
  const bg = BG_PRESETS.find(b => b.id === (p.bg || 'day')) || BG_PRESETS[0];
  app.scene.applyBackground(bg); markActiveBg(bg.id);
  if (p.bgState) { app.bgState = p.bgState; $('bg-blur').value = app.bgState.blur; $('bg-bright').value = app.bgState.bright; setLabel('bg-blur', app.bgState.blur); setLabel('bg-bright', app.bgState.bright + '%'); applyBgFilter(); }
  if (p.celestial === false) { $('bg-celestial').checked = false; app.scene.setCelestial(false); }
  if (p.parallax === false) { $('bg-parallax').checked = false; app.scene.setParallax(false); }
  // weather
  if (p.weatherParams) {
    Object.assign(app.scene.params, p.weatherParams);
    $('w-amount').value = app.scene.params.amount; $('w-speed').value = app.scene.params.speed;
    $('w-wind').value = app.scene.params.wind; $('w-size').value = app.scene.params.size;
    setLabel('w-amount', amountWord(app.scene.params.amount));
    setLabel('w-speed', (app.scene.params.speed / 100).toFixed(1) + '×');
    setLabel('w-wind', String(app.scene.params.wind));
    setLabel('w-size', (app.scene.params.size / 100).toFixed(1) + '×');
  }
  if (p.weather && p.weather !== 'none') { app.scene.setWeather(p.weather); markActiveWeather(p.weather); }
  if (p.fog) { $('w-fog').checked = true; if (app._fog) app._fog.style.opacity = '1'; }
  // filters
  if (p.filter) app.filters.restore(p.filter);
  // settings
  if (p.quality) { $('set-quality').value = p.quality; app.scene.setQuality(p.quality); }
  if (p.glass === false) { $('set-glass').checked = false; document.body.classList.add('no-glass'); }
  if (p.showfps === false) { $('set-showfps').checked = false; app._showFps = false; $('btn-fps').style.display = 'none'; }
  if (p.aa === false) { $('set-aa').checked = false; }
}

/* ----------------------------- boot ----------------------------- */
async function init() {
  log.info('Live2D Web Viewer 启动中…');
  // library checks
  const missing = [];
  if (!window.THREE) missing.push('three.js');
  if (!window.PIXI) missing.push('PixiJS');
  if (!window.PIXI?.live2d) missing.push('pixi-live2d-display');
  if (!window.JSZip) log.warn('JSZip 未加载 —— .lpk 导入将不可用');
  if (missing.length) { log.error('缺少依赖库：' + missing.join(', ')); }

  app.prefs = loadPrefs();
  app.ui = new UIManager();
  wireConsole();

  try {
    app.scene = new Scene3D($('bg-canvas'));
    app.scene.start();
  } catch (e) { log.error('three.js 初始化失败', e); }

  try {
    app.viewer = new Viewer($('live2d-canvas'), { antialias: app.prefs.aa !== false });
  } catch (e) { log.error('PixiJS 初始化失败', e); app.ui.toast('渲染器初始化失败'); }

  app.filters = new FilterController($('stage'), state => setPref('filter', state));
  app.filters.mount();

  // import history
  loadHistory();
  renderHistory();
  $('history-clear')?.addEventListener('click', clearHistory);

  wireTune(); wireBackground(); wireWeather(); wireImport(); wireDragDrop(); wireSettings(); wireMusic();
  applyPrefs();
  startFpsMeter();

  hideLoading();
  log.ok('界面就绪');
  app.ui.open('model');
  app.ui.toast('请导入 Live2D 模型（文件夹 / 多文件 / .lpk）');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
