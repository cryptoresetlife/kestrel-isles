// Dev tool: drives headless Chrome over the DevTools protocol to capture screenshots and console errors.
// Usage: node tools/shoot.mjs <outDir> name=query [name=query ...]   (needs `node serve.ts` running on :8080)
//        node tools/shoot.mjs --script <file.json> <outDir>          (a list of {wait, keys, shot} steps)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.BASE || 'http://localhost:8080/';
const W = Number(process.env.W || 1280), H = Number(process.env.H || 720);
const QUALITY = Number(process.env.Q || 86);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  const profile = mkdtempSync(join(tmpdir(), 'kestrel-chrome-'));
  const proc = spawn(CHROME, [
    '--headless=new', `--user-data-dir=${profile}`, '--remote-debugging-port=9333', `--window-size=${W},${H}`,
    '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-first-run', '--autoplay-policy=no-user-gesture-required', 'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch('http://127.0.0.1:9333/json/list'); const list = await r.json(); const page = list.find((t) => t.type === 'page'); if (page) return { proc, ws: page.webSocketDebuggerUrl }; } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('chrome did not start');
}

function connect(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else listeners.forEach((l) => l(msg));
  };
  return new Promise((res) => ws.onopen = () => res({
    send: (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }),
    on: (fn) => listeners.push(fn),
    close: () => ws.close(),
  }));
}

async function evalJs(cdp, expr) {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result && r.result.result ? r.result.result.value : undefined;
}

async function shot(cdp, file) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: QUALITY, clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
  writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  console.log('wrote', file);
}

const KEYMAP = { Shift: ['ShiftLeft', 'Shift', 16], S: ['KeyS', 's', 83], W: ['KeyW', 'w', 87], A: ['KeyA', 'a', 65], D: ['KeyD', 'd', 68], G: ['KeyG', 'g', 71], F: ['KeyF', 'f', 70], B: ['KeyB', 'b', 66], C: ['KeyC', 'c', 67], Z: ['KeyZ', 'z', 90], Q: ['KeyQ', 'q', 81], E: ['KeyE', 'e', 69], Enter: ['Enter', 'Enter', 13], Escape: ['Escape', 'Escape', 27] };
async function key(cdp, name, type) {
  const [code, k, vk] = KEYMAP[name];
  await cdp.send('Input.dispatchKeyEvent', { type, code, key: k, windowsVirtualKeyCode: vk });
}

async function main() {
  const args = process.argv.slice(2);
  const { proc, ws } = await launch();
  const cdp = await connect(ws);
  const errors = [];
  cdp.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) errors.push(m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('log: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
  });
  await cdp.send('Runtime.enable'); await cdp.send('Log.enable'); await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  try {
    if (args[0] === '--script') {
      const steps = JSON.parse(readFileSync(args[1], 'utf8'));
      const out = args[2]; mkdirSync(out, { recursive: true });
      await cdp.send('Page.navigate', { url: BASE + (steps.query || '') });
      await sleep(steps.load || 4000);
      for (const s of steps.steps) {
        if (s.eval) console.log('eval', s.eval, '=>', JSON.stringify(await evalJs(cdp, s.eval)));
        if (s.down) for (const k of s.down) await key(cdp, k, 'keyDown');
        if (s.up) for (const k of s.up) await key(cdp, k, 'keyUp');
        if (s.press) for (const k of s.press) { await key(cdp, k, 'keyDown'); await sleep(60); await key(cdp, k, 'keyUp'); }
        if (s.wait) await sleep(s.wait);
        if (s.log) console.log(s.log, JSON.stringify(await evalJs(cdp, s.log)));
        if (s.shot) await shot(cdp, join(out, s.shot));
      }
    } else {
      const out = args[0]; mkdirSync(out, { recursive: true });
      for (const pair of args.slice(1)) {
        const i = pair.indexOf('='); const name = pair.slice(0, i), query = pair.slice(i + 1);
        await cdp.send('Page.navigate', { url: BASE + '?' + query });
        let ok = false; await sleep(1500);
        for (let i = 0; i < 150 && !ok; i++) { await sleep(200); ok = await evalJs(cdp, 'window.__shotReady === true'); }
        if (!ok) console.log('timeout waiting for', name);
        await sleep(300);
        await shot(cdp, join(out, name));
      }
    }
  } finally {
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
    cdp.close(); proc.kill();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
