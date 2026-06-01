// importer.js — turn local files (folder / multi-select / drag-drop) and .lpk
// packages into a load target ready for the viewer.
import { log } from './logger.js';
import { loadLpk } from './lpk.js';

const PIXI = window.PIXI;

function isCubism4(j) { return !!(j && j.FileReferences && typeof j.FileReferences.Moc === 'string'); }
function isCubism2(j) { return !!(j && typeof j.model === 'string' && Array.isArray(j.textures)); }

/** Wrap a settings JSON (refs already blob/absolute URLs) into a ModelSettings. */
export function buildSettings(json) {
  json.url = location.href;
  const L = PIXI.live2d || {};
  const Ctor = isCubism4(json) ? L.Cubism4ModelSettings : (isCubism2(json) ? L.Cubism2ModelSettings : null);
  if (!Ctor) {
    log.warn('未找到 ModelSettings 构造器，回退为 JSON 直载');
    return json;
  }
  try {
    const settings = new Ctor(json);
    settings.resolveURL = (u) => u;          // refs are already absolute blob: URLs
    if (typeof settings.validateFiles === 'function') {
      try { settings.validateFiles(Object.keys({})); } catch { /* skip strict validation */ }
    }
    return settings;
  } catch (e) {
    log.warn('ModelSettings 构造失败，回退为 JSON 直载', e);
    return json;
  }
}

const norm = p => (p || '').replace(/\\/g, '/').replace(/^\.\//, '');
const dirOf = p => { const i = norm(p).lastIndexOf('/'); return i < 0 ? '' : norm(p).slice(0, i + 1); };
const baseOf = p => norm(p).split('/').pop();

/**
 * @param {Array<{file:File, path:string}>} entries
 * @returns {Promise<{source:any, rawJson:object, name:string, format:string}>}
 */
export async function importModel(entries) {
  if (!entries || !entries.length) throw new Error('没有可导入的文件');

  // maps for reference resolution
  const byPath = new Map();
  const byBase = new Map();
  for (const e of entries) {
    const p = norm(e.path || e.file.name);
    byPath.set(p, e.file);
    byBase.set(baseOf(p), e.file);
  }

  // find settings json
  let settingsEntry = null, settingsJson = null;
  const jsonEntries = entries.filter(e => /\.json$/i.test(e.path || e.file.name));
  // prefer canonical names first
  jsonEntries.sort((a, b) => {
    const ra = /\.model3?\.json$/i.test(a.path || a.file.name) ? 0 : 1;
    const rb = /\.model3?\.json$/i.test(b.path || b.file.name) ? 0 : 1;
    return ra - rb || norm(a.path).length - norm(b.path).length;
  });
  for (const e of jsonEntries) {
    let j; try { j = JSON.parse(await e.file.text()); } catch { continue; }
    if (isCubism4(j) || isCubism2(j)) { settingsEntry = e; settingsJson = j; break; }
  }
  if (!settingsJson) throw new Error('未找到模型描述文件（*.model3.json / model.json）');

  const settingsDir = dirOf(settingsEntry.path || settingsEntry.file.name);
  const urlCache = new Map();
  const objectUrls = [];
  const urlFor = (file) => {
    if (urlCache.has(file)) return urlCache.get(file);
    const u = URL.createObjectURL(file);
    urlCache.set(file, u); objectUrls.push(u);
    return u;
  };
  const resolveRef = (ref) => {
    const r = norm(ref).replace(/^\//, '');
    const tries = [settingsDir + r, r];
    for (const t of tries) if (byPath.has(t)) return urlFor(byPath.get(t));
    for (const [p, f] of byPath) if (p === r || p.endsWith('/' + r)) return urlFor(f);
    const b = baseOf(r);
    if (byBase.has(b)) return urlFor(byBase.get(b));
    return null;
  };

  // deep-replace any string that resolves to an uploaded file
  let replaced = 0;
  const walk = (node) => {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        const v = node[i];
        if (typeof v === 'string') { const u = resolveRef(v); if (u) { node[i] = u; replaced++; } }
        else if (v && typeof v === 'object') walk(v);
      }
    } else if (node && typeof node === 'object') {
      for (const k of Object.keys(node)) {
        const v = node[k];
        if (typeof v === 'string') { const u = resolveRef(v); if (u) { node[k] = u; replaced++; } }
        else if (v && typeof v === 'object') walk(v);
      }
    }
  };
  walk(settingsJson);
  log.info(`模型描述：${baseOf(settingsEntry.path)}，已映射 ${replaced} 个资源`);

  const name = (settingsDir.replace(/\/$/, '').split('/').pop()) || baseOf(settingsEntry.path) || '本地模型';
  const format = isCubism4(settingsJson) ? 'Cubism 4 · moc3' : 'Cubism 2 · moc';
  return { source: buildSettings(settingsJson), rawJson: settingsJson, name, format, objectUrls };
}

/** Import a .lpk (+ optional config.json) given as file entries. */
export async function importLpkFiles(entries) {
  const lpk = entries.find(e => /\.lpk$/i.test(e.path || e.file.name)) ||
              entries.find(e => /\.zip$/i.test(e.path || e.file.name));
  if (!lpk) throw new Error('未找到 .lpk 文件');
  const cfgEntry = entries.find(e => /config\.json$/i.test(e.path || e.file.name));
  let configJson = null;
  if (cfgEntry) { try { configJson = JSON.parse(await cfgEntry.file.text()); } catch (e) { log.warn('config.json 解析失败', e); } }
  else log.warn('未提供 config.json —— Steam Workshop 加密包可能无法解密');

  const buf = await lpk.file.arrayBuffer();
  const { json, name, format, objectUrls } = await loadLpk(buf, configJson);
  return { source: buildSettings(json), rawJson: json, name, format, objectUrls };
}

/** Fetch a built-in .lpk preset from the server and decrypt it in-browser. */
export async function importLpkFromUrl(lpkUrl, configUrl, name) {
  const [buf, cfg] = await Promise.all([
    fetch(lpkUrl).then(r => { if (!r.ok) throw new Error('无法读取 ' + lpkUrl); return r.arrayBuffer(); }),
    configUrl ? fetch(configUrl).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null),
  ]);
  const res = await loadLpk(buf, cfg);
  return { source: buildSettings(res.json), rawJson: res.json, name: name || res.name, format: res.format, objectUrls: res.objectUrls };
}

export function imageURL(file) { return URL.createObjectURL(file); }
