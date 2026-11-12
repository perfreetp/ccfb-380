// 无头浏览器冒烟测试：通过 CDP 连接 headless Chromium，
// 加载生产构建，收集页面报错、FPS、截图、持久化与颜色混合指标
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', 'dist');
const PORT = 5211;
const W = parseInt(process.argv[2] ?? '1920', 10);
const H = parseInt(process.argv[3] ?? '1080', 10);
const SHOT_DIR = path.join(__dirname, 'shots');
await fs.mkdir(SHOT_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json'
};

const server = http.createServer(async (req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  const file = path.join(root, url === '/' ? 'index.html' : url);
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(PORT, r));

const chrome = spawn(
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  [
    '--headless=new', '--disable-gpu', '--use-angle=swiftshader',
    '--remote-debugging-port=9333', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + path.join(__dirname, '.chrome-profile-' + process.pid),
    `--window-size=${W},${H}`, 'about:blank'
  ],
  { stdio: 'ignore' }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await fetch('http://127.0.0.1:9333/json/list').then((r) => r.json());
      if (list[0]?.webSocketDebuggerUrl) return list[0].webSocketDebuggerUrl;
    } catch { /* retry */ }
    await sleep(250);
  }
  throw new Error('Chrome 调试端口未就绪');
}

const wsUrl = await getWsUrl();
const ws = new WebSocket(wsUrl);
await once(ws, 'open');

let id = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    errors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    errors.push('EXCEPTION: ' + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text));
  }
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

await send('Runtime.enable');
await send('Page.enable');

const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', {
    expression: expr, returnByValue: true, awaitPromise: true
  });
  return {
    value: r.result?.result?.value,
    exception: r.result?.exceptionDetails?.text
  };
};

const screenshot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(path.join(SHOT_DIR, name), Buffer.from(r.result.data, 'base64'));
  console.log('截图已保存: scripts/shots/' + name);
};

await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await sleep(3000);

// 1) 场馆列表
const probe1 = await evalJs(`(() => ({
  cards: document.querySelectorAll('.venue-card').length,
  seedName: document.querySelector('.venue-card .name')?.textContent
}))()`);
console.log('1. 场馆列表:', JSON.stringify(probe1.value));
await screenshot('01-venues.png');

// 2) 舞台编辑（12 灯全亮场景）
await evalJs(`document.querySelector('.venue-card .btn.primary').click()`);
await sleep(3000);
const probe2 = await evalJs(`(() => {
  const canvas = document.querySelector('canvas');
  return {
    fps: document.querySelector('.fps-badge')?.textContent ?? null,
    canvasSize: canvas ? [canvas.width, canvas.height] : null,
    isWebGL2: canvas ? canvas.getContext('webgl2') instanceof WebGL2RenderingContext : false
  };
})()`);
console.log('2. 舞台编辑页:', JSON.stringify(probe2.value));
await screenshot('02-stage.png');

// 3) 颜色混合指标：在 rAF 回调内（绘制完成后、合成前）回读默认帧缓冲，
//    统计纯白像素与高亮像素占比（ACES 应避免大面积爆白）
const blend = await evalJs(`(async () => {
  await new Promise((r) => requestAnimationFrame(() => r()));
  const canvas = document.querySelector('canvas');
  const gl = canvas.getContext('webgl2');
  const w = canvas.width, h = canvas.height;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let pureWhite = 0, bright = 0, tinted = 0;
  const total = w * h;
  let nonZero = 0;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i+1], b = px[i+2];
    if (r + g + b > 0) nonZero++;
    if (r === 255 && g === 255 && b === 255) pureWhite++;
    const lum = 0.2126*r + 0.7152*g + 0.0722*b;
    if (lum > 200) bright++;
    if (lum > 200 && (Math.max(r,g,b) - Math.min(r,g,b)) > 24) tinted++;
  }
  return {
    sampleOk: nonZero > total * 0.5,
    pureWhitePct: +(100 * pureWhite / total).toFixed(3),
    brightPct: +(100 * bright / total).toFixed(2),
    tintedShareOfBright: bright ? +(100 * tinted / bright).toFixed(1) : 0
  };
})()`);
console.log('3. 颜色混合指标:', JSON.stringify(blend.value));

// 4) Cue 播放
await evalJs(`[...document.querySelectorAll('#nav a')].find(a => a.textContent.includes('Cue')).click()`);
await sleep(1200);
await evalJs(`[...document.querySelectorAll('.cue-row button')].find(b => b.textContent.trim()==='播放')?.click()`);
await sleep(1800); // 渐变中途截图
await screenshot('03-cue-midfade.png');
const probe3 = await evalJs(`(() => ({
  fps: document.querySelector('.fps-badge')?.textContent ?? null,
  cueRows: document.querySelectorAll('.cue-row').length,
  activeCue: document.querySelector('.cue-row.active .idx')?.textContent ?? null,
  progressText: document.querySelector('.transport .muted')?.textContent ?? null
}))()`);
console.log('4. Cue 渐变中:', JSON.stringify(probe3.value));
await sleep(2500);

// 4b) 跳到全亮的 Cue3（副歌），截图检验光束体积感与光斑
await evalJs(`[...document.querySelectorAll('.cue-row')][2].click()`);
await sleep(1200);
await evalJs(`[...document.querySelectorAll('.cue-row')][2].querySelector('button:not(.danger)').click()`);
await sleep(3200);
const probe3b = await evalJs(`(() => ({
  fps: document.querySelector('.fps-badge')?.textContent ?? null,
  progressText: document.querySelector('.transport .muted')?.textContent ?? null
}))()`);
console.log('4b. Cue3 全亮:', JSON.stringify(probe3b.value));
await screenshot('05-cue-full.png');

// 5) 灯具库
await evalJs(`[...document.querySelectorAll('#nav a')].find(a => a.textContent.includes('灯具库')).click()`);
await sleep(2000);
const probe4 = await evalJs(`(() => ({
  fps: document.querySelector('.fps-badge')?.textContent ?? null,
  templates: document.querySelectorAll('.list-item').length
}))()`);
console.log('5. 灯具库页:', JSON.stringify(probe4.value));
await screenshot('04-library.png');

// 6) 持久化：改个名字 -> 刷新 -> 验证 localStorage 里的工程仍在且被加载
const persist = await evalJs(`(async () => {
  const raw0 = JSON.parse(localStorage.getItem('lightprep.venues.v1') || '[]');
  raw0[0].name = '持久化测试改名';
  localStorage.setItem('lightprep.venues.v1', JSON.stringify(raw0));
  return { storedCount: raw0.length, fixtureCount: raw0[0].fixtures.length, cueCount: raw0[0].cues.length };
})()`);
console.log('6a. 写入 localStorage:', JSON.stringify(persist.value));
// hash 变化不会触发整页刷新，必须强制重载才能验证冷启动读取
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await sleep(2500);
const persist2 = await evalJs(`(() => ({
  firstName: document.querySelector('.venue-card .name')?.textContent,
  cards: document.querySelectorAll('.venue-card').length
}))()`);
console.log('6b. 刷新后回读:', JSON.stringify(persist2.value));

console.log('\n--- console.error / 异常 (' + errors.length + ') ---');
for (const e of errors.slice(0, 20)) console.log(e);

const ok =
  errors.length === 0 &&
  probe1.value.cards === 1 &&
  probe2.value.isWebGL2 === true &&
  probe3.value.cueRows === 4 &&
  probe4.value.templates === 2 &&
  persist2.value.firstName === '持久化测试改名' &&
  (blend.value?.sampleOk ?? false) &&
  (blend.value?.pureWhitePct ?? 1) < 0.5;

console.log('\n结论:', ok ? '✅ 全部通过' : '❌ 存在失败项');
ws.close();
chrome.kill();
server.close();
process.exit(ok ? 0 : 1);
