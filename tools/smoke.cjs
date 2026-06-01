// Headless-Chrome smoke test via the DevTools Protocol (no deps; uses Node's
// global fetch + WebSocket). Loads the app, captures console errors/exceptions,
// and reads the in-page log + DOM health.
// Usage: node tools/smoke.cjs <url> <chromePath>
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const URL = process.argv[2] || 'http://127.0.0.1:8011/';
const CHROME = process.argv[3] || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const WAIT_MS = 12000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJSON(u) { const r = await fetch(u); return r.json(); }

(async () => {
  const udd = path.join(os.tmpdir(), 'l2d-smoke-' + Date.now());
  const args = [
    '--headless=new', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--mute-audio',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${udd}`,
    '--window-size=1280,800',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', 'about:blank',
  ];
  const chrome = spawn(CHROME, args, { stdio: 'ignore' });
  const errors = [], warns = [], exceptions = [];

  try {
    // wait for devtools endpoint
    let target = null;
    for (let i = 0; i < 30; i++) {
      try { const list = await getJSON(`http://127.0.0.1:${PORT}/json`); target = list.find(t => t.type === 'page'); if (target) break; } catch {}
      await sleep(300);
    }
    if (!target) throw new Error('DevTools target not found');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let id = 0; const pending = new Map();
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
      if (m.method === 'Runtime.consoleAPICalled') {
        const txt = (m.params.args || []).map(a => a.value ?? a.description ?? a.unserializableValue ?? '').join(' ');
        if (m.params.type === 'error') errors.push(txt);
        else if (m.params.type === 'warning') warns.push(txt);
      } else if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        exceptions.push(d.exception?.description || d.text);
      }
    };
    const send = (method, params) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Log.enable');
    await send('Page.navigate', { url: URL });
    await sleep(WAIT_MS);

    const evalExpr = `JSON.stringify({
      three: typeof THREE, pixi: (window.PIXI&&PIXI.VERSION)||'none', live2d: !!(window.PIXI&&PIXI.live2d), jszip: typeof JSZip,
      infoName: document.getElementById('info-name')?.textContent,
      brand: document.getElementById('brand-model')?.textContent,
      format: document.getElementById('info-format')?.textContent,
      counts: document.getElementById('info-counts')?.textContent,
      exprBtns: document.querySelectorAll('#action-expressions .tag').length,
      modelPresets: document.querySelectorAll('#model-presets .preset').length,
      bgPresets: document.querySelectorAll('#bg-presets .preset').length,
      filterChips: document.querySelectorAll('#filter-presets .tag').length,
      loadingHidden: document.getElementById('loading')?.classList.contains('hide'),
      bgCanvas: document.getElementById('bg-canvas')?.width+'x'+document.getElementById('bg-canvas')?.height,
      l2dCanvas: document.getElementById('live2d-canvas')?.width+'x'+document.getElementById('live2d-canvas')?.height,
      stageFilter: document.getElementById('stage')?.style.filter,
      logTail: (document.getElementById('log-output')?.innerText||'').split('\\n').slice(-22).join('\\n')
    })`;
    const r = await send('Runtime.evaluate', { expression: evalExpr, returnByValue: true });
    const state = JSON.parse(r.result?.result?.value || '{}');

    console.log('\n================ PAGE STATE ================');
    for (const k of Object.keys(state)) if (k !== 'logTail') console.log(`  ${k.padEnd(14)} : ${state[k]}`);
    console.log('\n---------------- IN-APP LOG ----------------');
    console.log(state.logTail);
    console.log('\n---------------- CONSOLE ERRORS ----------------');
    console.log(errors.length ? errors.join('\n') : '  (none)');
    console.log('\n---------------- UNCAUGHT EXCEPTIONS ----------------');
    console.log(exceptions.length ? exceptions.join('\n') : '  (none)');
    if (warns.length) { console.log('\n---------------- WARNINGS ----------------'); console.log(warns.slice(0, 12).join('\n')); }

    const ok = state.live2d && state.loadingHidden && exceptions.length === 0;
    console.log('\n' + (ok ? '✅ SMOKE OK' : '⚠️  REVIEW NEEDED'));
    ws.close();
  } catch (e) {
    console.error('SMOKE ERROR', e);
  } finally {
    try { chrome.kill(); } catch {}
    try { fs.rmSync(udd, { recursive: true, force: true }); } catch {}
  }
})();
