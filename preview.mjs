import http from 'node:http';
import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
let port = 4317;
if (args.length) {
  const supplied = args.length === 2 && args[0] === '--port'
    ? args[1]
    : args.length === 1 && args[0].startsWith('--port=') ? args[0].slice(7) : '';
  if (!/^\d+$/.test(supplied) || Number(supplied) < 1 || Number(supplied) > 65535) {
    console.error('端口参数不正确。用法：npm start -- --port 4318（端口范围 1–65535）。');
    process.exit(1);
  }
  port = Number(supplied);
}

const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/data.js', ['data.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml; charset=utf-8']]
]);

function respond(response, status, message, headOnly) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(headOnly ? undefined : message);
}

const server = http.createServer(async (request, response) => {
  const headOnly = request.method === 'HEAD';
  if (request.method !== 'GET' && !headOnly) {
    response.setHeader('Allow', 'GET, HEAD');
    respond(response, 405, '仅支持 GET 和 HEAD 请求。', false);
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  } catch {
    respond(response, 400, '请求地址不正确。', headOnly);
    return;
  }
  const entry = files.get(pathname);
  if (!entry) {
    respond(response, 404, '没有找到这个页面。', headOnly);
    return;
  }
  try {
    const contents = await readFile(new URL(entry[0], import.meta.url));
    response.writeHead(200, {
      'Content-Type': entry[1],
      'Content-Length': contents.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    response.end(headOnly ? undefined : contents);
  } catch (error) {
    respond(response, error.code === 'ENOENT' ? 404 : 500, '无法读取页面文件，请检查项目文件是否完整。', headOnly);
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error('端口 ' + port + ' 已被使用。请打开已有页面，或运行：npm start -- --port ' + (port === 65535 ? 4317 : port + 1));
  } else {
    console.error('无法启动本地预览：' + error.message);
  }
  process.exitCode = 1;
});

server.listen(port, '127.0.0.1', () => {
  console.log('时宜 · 生活与健康手账');
  console.log('打开 http://127.0.0.1:' + port);
  console.log('按 Ctrl+C 结束预览。');
});

process.on('SIGINT', () => server.close());
process.on('SIGTERM', () => server.close());
