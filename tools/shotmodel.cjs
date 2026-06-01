// Capture just the Model panel region to inspect preset-card text layout.
const { spawn } = require('child_process');
const os = require('os'); const path = require('path'); const fs = require('fs');
const URL = process.argv[2] || 'http://127.0.0.1:8011/';
const CHROME = process.argv[3] || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = process.argv[4] || 'model-panel.png';
const PORT = 9336; const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = async u => (await fetch(u)).json();
(async () => {
  const udd = path.join(os.tmpdir(), 'l2d-sm-' + Date.now());
  const chrome = spawn(CHROME, ['--headless=new', '--no-first-run', '--disable-extensions', '--mute-audio',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${udd}`, '--window-size=1280,800', '--hide-scrollbars',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank'], { stdio: 'ignore' });
  try {
    let target = null;
    for (let i = 0; i < 30; i++) { try { const l = await getJSON(`http://127.0.0.1:${PORT}/json`); target = l.find(t => t.type === 'page'); if (target) break; } catch {} await sleep(300); }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pending = new Map();
    ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    const send = (method, params) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.navigate', { url: URL });
    await sleep(7000);
    // ensure model panel open, dark bg for clarity
    await send('Runtime.evaluate', { expression: `document.querySelector('[data-toggle="model"]')?.click(); document.querySelector('#bg-presets .preset[data-bid="midnight"]')?.click();` });
    await sleep(1200);
    const rect = JSON.parse((await send('Runtime.evaluate', { expression: `JSON.stringify((()=>{const r=document.querySelector('[data-panel="model"]').getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}})())`, returnByValue: true })).result.result.value);
    const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: rect.x - 6, y: rect.y - 6, width: rect.w + 12, height: rect.h + 12, scale: 2 } });
    fs.writeFileSync(path.join(__dirname, OUT), Buffer.from(r.result.data, 'base64'));
    console.log('saved', OUT, JSON.stringify(rect));
    ws.close();
  } catch (e) { console.error('ERR', e); }
  finally { try { chrome.kill(); } catch {} try { fs.rmSync(udd, { recursive: true, force: true }); } catch {} }
})();
