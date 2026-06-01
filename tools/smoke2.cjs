// Interaction smoke test: drives the .lpk in-browser decrypt preset, an
// expression, weather, a filter and a background, checking for errors.
const { spawn } = require('child_process');
const os = require('os'); const path = require('path'); const fs = require('fs');

const URL = process.argv[2] || 'http://127.0.0.1:8011/';
const CHROME = process.argv[3] || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9334;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = async u => (await fetch(u)).json();

(async () => {
  const udd = path.join(os.tmpdir(), 'l2d-smoke2-' + Date.now());
  const chrome = spawn(CHROME, ['--headless=new', '--no-first-run', '--disable-extensions', '--mute-audio',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${udd}`, '--window-size=1280,800',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank'], { stdio: 'ignore' });
  const errors = [], exceptions = [];
  try {
    let target = null;
    for (let i = 0; i < 30; i++) { try { const l = await getJSON(`http://127.0.0.1:${PORT}/json`); target = l.find(t => t.type === 'page'); if (target) break; } catch {} await sleep(300); }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pending = new Map();
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push((m.params.args || []).map(a => a.value ?? a.description ?? '').join(' '));
      if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    };
    const send = (method, params) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    const evalJS = async expr => JSON.parse((await send('Runtime.evaluate', { expression: `JSON.stringify(${expr})`, returnByValue: true })).result.result.value);
    const click = sel => send('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(sel)})?.click()` });

    await send('Runtime.enable'); await send('Page.enable');
    await send('Page.navigate', { url: URL });
    await sleep(8000); // initial model A

    console.log('1) click .lpk in-browser decrypt preset…');
    await click('#model-presets .preset[data-mid="b-lpk"]');
    await sleep(7000);
    let st = await evalJS(`({name:document.getElementById('info-name').textContent, fmt:document.getElementById('info-format').textContent, expr:document.querySelectorAll('#action-expressions .tag').length})`);
    console.log('   ->', JSON.stringify(st));

    console.log('2) click first expression, weather=rain, a filter, bg=night…');
    await click('#action-expressions .tag');
    await click('#weather-seg button[data-w="rain"]');
    await click('#filter-presets .tag:nth-child(6)');
    await click('#bg-presets .preset[data-bid="night"]');
    await sleep(3500);
    let st2 = await evalJS(`({
      weatherActive: document.querySelector('#weather-seg button.active')?.dataset.w,
      weatherPoints: !!window.__none,
      stageFilter: document.getElementById('stage').style.filter,
      bgActive: document.querySelector('#bg-presets .preset.active')?.dataset.bid,
      logTail: (document.getElementById('log-output')?.innerText||'').split('\\n').slice(-16).join('\\n')
    })`);
    console.log('\n================ AFTER INTERACTIONS ================');
    console.log('  weatherActive :', st2.weatherActive);
    console.log('  bgActive      :', st2.bgActive);
    console.log('  stageFilter   :', st2.stageFilter);
    console.log('\n--------- IN-APP LOG (tail) ---------\n' + st2.logTail);
    console.log('\n--------- CONSOLE ERRORS ---------\n' + (errors.length ? errors.join('\n') : '  (none)'));
    console.log('\n--------- EXCEPTIONS ---------\n' + (exceptions.length ? exceptions.join('\n') : '  (none)'));

    const lpkLoaded = /特莉波卡/.test(st.name) && st.expr > 0;
    const ok = lpkLoaded && exceptions.length === 0;
    console.log('\n' + (ok ? '✅ INTERACTION SMOKE OK (lpk decrypt+render works in-browser)' : '⚠️  REVIEW: lpk loaded=' + lpkLoaded));
    ws.close();
  } catch (e) { console.error('SMOKE2 ERROR', e); }
  finally { try { chrome.kill(); } catch {} try { fs.rmSync(udd, { recursive: true, force: true }); } catch {} }
})();
