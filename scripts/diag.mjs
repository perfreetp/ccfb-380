// 光斑诊断：直接在应用运行环境里计算每个池的世界落点与半径，
// 并统计渲染输出中地面不同区域的颜色，定位整片泛色来源
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', 'dist');
const PORT = 5212;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer(async (req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  const file = path.join(root, url === '/' ? 'index.html' : url);
  try {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(await fs.readFile(file));
  } catch {
    if (!res.headersSent) { res.writeHead(404); res.end(); }
  }
});
await new Promise((r) => server.listen(PORT, r));

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--use-angle=swiftshader',
  '--remote-debugging-port=9334', '--no-first-run',
  '--user-data-dir=' + path.join(__dirname, '.chrome-debug-' + process.pid),
  '--window-size=1920,1080', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) {
  try {
    const list = await fetch('http://127.0.0.1:9334/json/list').then((r) => r.json());
    if (list[0]?.webSocketDebuggerUrl) {
      globalThis.wsUrl = list[0].webSocketDebuggerUrl;
      break;
    }
  } catch { /* retry */ }
  await sleep(250);
}
const ws = new WebSocket(globalThis.wsUrl);
await once(ws, 'open');
let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});
const send = (method, params = {}) => new Promise((resolve) => {
  const mid = ++id; pending.set(mid, resolve);
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};
await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await sleep(2500);
await evalJs(`document.querySelector('.venue-card .btn.primary').click()`);
await sleep(3000);

// 1) 读取 localStorage 里的实际灯具参数（确认新种子生效）
const data = await evalJs(`(() => {
  const v = JSON.parse(localStorage.getItem('lightprep.venues.v1'))[0];
  return v.fixtures.map(f => ({
    name: f.name, pos: f.position,
    state: f.state, tpl: v.templates.find(t => t.id === f.templateId)?.beamAngle
  }));
})()`);
console.log('灯具参数（前 3 台）:');
for (const f of data.slice(0, 3)) console.log(' ', JSON.stringify(f));

// 2) 地面像素采样：取画布下半部分多条扫描线，报告 RGB 分布
const px = await evalJs(`(async () => {
  await new Promise(r => requestAnimationFrame(() => r()));
  const c = document.querySelector('canvas');
  const gl = c.getContext('webgl2');
  const buf = new Uint8Array(c.width * c.height * 4);
  gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  // 输出为普通数组方便回传，按 y 行（GL 原点在左下）取 5 个水平位置的均值
  const sample = [];
  for (const fy of [0.15, 0.3, 0.5, 0.7, 0.85]) {
    const y = Math.round(c.height * fy);
    const row = [];
    for (const fx of [0.2, 0.4, 0.5, 0.6, 0.8]) {
      const x = Math.round(c.width * fx);
      const i = (y * c.width + x) * 4;
      row.push([buf[i], buf[i+1], buf[i+2]]);
    }
    sample.push({ y: fy, row });
  }
  return { w: c.width, h: c.height, sample };
})()`);
console.log('\n地面像素采样 (R,G,B)，行=画面高度比例，列=宽度比例:');
for (const s of px.sample) {
  console.log(' y=' + s.y, s.row.map((c) => '(' + c.join(',') + ')').join(' '));
}

ws.close();
chrome.kill();
server.close();
process.exit(0);
