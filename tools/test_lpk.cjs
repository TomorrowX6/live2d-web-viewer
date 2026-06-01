// Validates the in-browser .lpk decryptor (genkey + LCG XOR) against the
// known-good Python-unpacked output. Run: node tools/test_lpk.cjs
const fs = require('fs');
const path = require('path');
const JSZip = require('./jszip.cjs');

const ROOT = path.resolve(__dirname, '..');

function genkey(s) { let r = 0; for (let i = 0; i < s.length; i++) r = (r * 31 + s.charCodeAt(i)) >>> 0; return r; }
function decrypt(key, data) {
  const out = new Uint8Array(data.length);
  for (let off = 0; off < data.length; off += 1024) {
    let k = key >>> 0; const end = Math.min(off + 1024, data.length);
    for (let i = off; i < end; i++) { const m = 2531011 + 214013 * k; k = Math.floor((m % 4294967296) / 65536) & 0xffff; out[i] = (k & 0xff) ^ data[i]; }
  }
  return out;
}
const tryJSON = b => { try { return JSON.parse(Buffer.from(b).toString('utf8').replace(/^﻿/, '')); } catch { return null; } };

(async () => {
  const lpk = fs.readFileSync(path.join(ROOT, 'b', '3376576902.lpk'));
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'b', 'config.json'), 'utf8'));
  const zip = await JSZip.loadAsync(lpk);

  // locate config.mlve
  let mlve = null;
  for (const name of Object.keys(zip.files)) {
    if (/\.bin3?$/.test(name) || zip.files[name].dir) continue;
    const j = tryJSON(await zip.files[name].async('uint8array'));
    if (j && j.list && j.type) { mlve = j; break; }
  }
  if (!mlve) throw new Error('config.mlve not found');
  console.log('mlve.type =', mlve.type, '| id =', mlve.id);

  const id = mlve.id, fileId = cfg.fileId, meta = cfg.metaData;
  const getkey = f => genkey(id + fileId + f + meta);
  const dec = async f => decrypt(getkey(f), await zip.file(f).async('uint8array'));

  const costume = mlve.list[0].costume.find(c => c.path);
  const model = tryJSON(await dec(costume.path));
  let pass = true;
  const assert = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) pass = false; };

  assert(!!model, 'decrypt + parse entry model json');
  assert(model && model.Version === 3, 'model Version === 3 -> ' + (model && model.Version));
  const moc = model && model.FileReferences && model.FileReferences.Moc;
  assert(/^[0-9a-f]{32}\.bin3$/.test(moc || ''), 'Moc is encrypted ref -> ' + moc);

  // byte-compare decrypted Moc with python output
  const mocBytes = Buffer.from(await dec(moc));
  const pyMoc = fs.readFileSync(path.join(ROOT, 'assets', 'models', 'b', 'Moc_0.moc3'));
  assert(mocBytes.length === pyMoc.length && mocBytes.equals(pyMoc), `Moc bytes match python (${mocBytes.length} bytes)`);
  assert(mocBytes.slice(0, 4).toString() === 'MOC3', 'Moc magic == MOC3');

  // texture
  const tex = model.FileReferences.Textures[0];
  const texBytes = Buffer.from(await dec(tex));
  const pyTex = fs.readFileSync(path.join(ROOT, 'assets', 'models', 'b', 'Textures_0_0.png'));
  assert(texBytes.equals(pyTex), `Texture bytes match python (${texBytes.length} bytes)`);
  assert(texBytes.slice(1, 4).toString() === 'PNG', 'Texture magic == PNG');

  // expressions names sanity vs python-unpacked model0.json
  const pyModel = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'models', 'b', 'model0.json'), 'utf8'));
  const myNames = (model.FileReferences.Expressions || []).map(e => e.Name).sort();
  const pyNames = (pyModel.FileReferences.Expressions || []).map(e => e.Name).sort();
  assert(JSON.stringify(myNames) === JSON.stringify(pyNames), 'expression names match -> ' + myNames.join(','));

  console.log('\n' + (pass ? '✅ ALL PASS — in-browser lpk decryptor is byte-correct' : '❌ FAILURES'));
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
