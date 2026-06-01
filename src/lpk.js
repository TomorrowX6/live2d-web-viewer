// lpk.js — in-browser decryptor for Live2DViewerEX / Steam Workshop .lpk packages.
// Pure JS port of the LpkUnpacker key/cipher (genkey polynomial hash + LCG XOR).
import { log } from './logger.js';

const ENC_RE = /^[0-9a-f]{32}\.bin3?$/;
const isEnc = s => typeof s === 'string' && ENC_RE.test(s);

// polynomial hash, returns unsigned 32-bit (sign-extension in the original is
// irrelevant because the cipher only uses key mod 2^32).
function genkey(s) {
  let r = 0;
  for (let i = 0; i < s.length; i++) r = (r * 31 + s.charCodeAt(i)) >>> 0;
  return r;
}

// LCG-driven XOR stream cipher, key reset every 1024 bytes.
function decrypt(key, data) {
  const out = new Uint8Array(data.length);
  const SLICE = 1024;
  for (let off = 0; off < data.length; off += SLICE) {
    let k = key >>> 0;
    const end = Math.min(off + SLICE, data.length);
    for (let i = off; i < end; i++) {
      const m = 2531011 + 214013 * k;             // < 2^53, exact in double
      k = Math.floor((m % 4294967296) / 65536) & 0xffff;
      out[i] = (k & 0xff) ^ data[i];
    }
  }
  return out;
}

function tryDecodeJSON(bytes) {
  try {
    const txt = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
    return JSON.parse(txt);
  } catch { return null; }
}

/**
 * Decrypt a .lpk into a ready-to-load Cubism settings object whose file
 * references are replaced with in-memory blob: URLs.
 * @param {ArrayBuffer} lpkBuffer
 * @param {object|null} configJson  external config.json (STM packs need it)
 * @returns {Promise<{json:object, name:string, format:string, objectUrls:string[]}>}
 */
export async function loadLpk(lpkBuffer, configJson) {
  const JSZip = window.JSZip;
  if (!JSZip) throw new Error('JSZip 未加载，无法解析 .lpk');
  const zip = await JSZip.loadAsync(lpkBuffer);

  // locate config.mlve (stored as plaintext JSON, possibly under a hashed name)
  let mlve = null;
  for (const name of Object.keys(zip.files)) {
    const f = zip.files[name];
    if (f.dir || /\.bin3?$/.test(name)) continue;
    const bytes = await f.async('uint8array');
    if (bytes.length > 1 << 18) continue;            // skip large (preview images)
    const j = tryDecodeJSON(bytes);
    if (j && j.list && j.type) { mlve = j; break; }
  }
  if (!mlve) throw new Error('未找到 config.mlve —— 这可能不是有效的 .lpk');
  log.info(`lpk 类型：${mlve.type}，角色 ${mlve.list.length} 个`);

  const type = mlve.type;
  const id = mlve.id || '';
  const encrypt = mlve.encrypt;
  let fileId = configJson ? (configJson.fileId || '') : '';
  const metaData = configJson ? (configJson.metaData || '') : '';

  const getkey = (fname) => {
    if (type === 'STM_1_0' && encrypt !== 'true') return 0;
    if (type === 'STM_1_0') return genkey(id + fileId + fname + metaData);
    return genkey(id + fname);                        // STD2_0 / STD_1_0
  };
  const rawBytes = async (fname) => {
    const f = zip.file(fname);
    if (!f) return null;
    return f.async('uint8array');
  };
  const decryptEntry = async (fname) => {
    const b = await rawBytes(fname);
    if (!b) return null;
    return decrypt(getkey(fname), b);
  };

  // pick first character / first non-empty costume
  const chara = mlve.list[0];
  const costume = (chara.costume || []).find(c => c && c.path);
  if (!costume) throw new Error('lpk 中没有可用的 costume');

  // decrypt entry model json (+ auto-fix fileId like the original tool)
  let modelJson = tryDecodeJSON(await decryptEntry(costume.path));
  if (!modelJson && configJson && configJson.lpkFile) {
    fileId = String(configJson.lpkFile).replace(/\.lpk$/i, '');
    log.warn('解密失败，尝试用 lpkFile 作为 fileId 重试：' + fileId);
    modelJson = tryDecodeJSON(await decryptEntry(costume.path));
  }
  if (!modelJson) throw new Error('模型解密失败：fileId / metaData 可能不正确（请提供配套 config.json）');

  // replace every encrypted reference with a decrypted blob: URL
  const cache = new Map();
  const objectUrls = [];
  const blobFor = async (encName) => {
    if (cache.has(encName)) return cache.get(encName);
    const dec = await decryptEntry(encName);
    if (!dec) { log.warn('lpk 缺少引用文件：' + encName); return encName; }
    const url = URL.createObjectURL(new Blob([dec]));
    cache.set(encName, url); objectUrls.push(url);
    return url;
  };
  const walk = async (node) => {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        const v = node[i];
        if (isEnc(v)) node[i] = await blobFor(v);
        else if (v && typeof v === 'object') await walk(v);
      }
    } else if (node && typeof node === 'object') {
      for (const k of Object.keys(node)) {
        const v = node[k];
        if (isEnc(v)) node[k] = await blobFor(v);
        else if (v && typeof v === 'object') await walk(v);
      }
    }
  };
  await walk(modelJson);

  const name = (configJson && configJson.title) || chara.character || mlve.name || 'LPK 模型';
  log.ok(`lpk 解密完成：${name}（${objectUrls.length} 个资源）`);
  return { json: modelJson, name, format: 'LPK · Cubism', objectUrls };
}
