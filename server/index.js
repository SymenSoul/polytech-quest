import { randomBytes } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SCORING } from '../shared/quest.js';
import { createApi } from './api.js';
import { Store } from './store.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const distDir = path.join(root, 'dist');
const isDev = process.argv.includes('--dev');

const PORT = Number(process.env.PORT) || (isDev ? 5173 : 8080);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_FILE = path.resolve(root, process.env.DATA_FILE || 'data/results.json');
const ADMIN_KEY = process.env.ADMIN_KEY || randomBytes(4).toString('hex');

const scoring = {
  perTask: numberFromEnv('POINTS_PER_TASK', DEFAULT_SCORING.perTask),
  perMistake: numberFromEnv('PENALTY_MISTAKE', DEFAULT_SCORING.perMistake),
  perHint: numberFromEnv('PENALTY_HINT', DEFAULT_SCORING.perHint),
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

if (!isDev && !existsSync(path.join(distDir, 'index.html'))) {
  console.error('Сборка интерфейса не найдена. Сначала выполните: npm run build');
  process.exit(1);
}

const store = new Store(DATA_FILE, scoring);
await store.load();
const handleApi = createApi(store, { adminKey: ADMIN_KEY, scoring });

let vite = null;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname.startsWith('/api/')) {
    await handleApi(req, res, url);
  } else if (vite) {
    vite.middlewares(req, res);
  } else {
    await serveStatic(req, res, url);
  }
});

if (isDev) {
  const { createServer } = await import('vite');
  vite = await createServer({
    root,
    appType: 'spa',
    server: { middlewareMode: true, hmr: { server } },
  });
}

server.listen(PORT, HOST, () => {
  console.log(`\nPolytech Cyber Quest запущен${isDev ? ' (режим разработки)' : ''}.\n`);
  console.log('Адреса для подключения учеников:');
  for (const address of lanAddresses()) {
    console.log(`  http://${address}:${PORT}`);
  }
  console.log(`  http://localhost:${PORT} (на этом компьютере)`);
  console.log(`\nТаблица результатов:  http://localhost:${PORT}/results`);
  console.log(`Ключ организатора:    ${ADMIN_KEY}${process.env.ADMIN_KEY ? '' : ' (задайте ADMIN_KEY, чтобы он не менялся)'}`);
  console.log(`Файл с результатами:  ${DATA_FILE}\n`);
});

async function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }

  let filePath;
  try {
    filePath = path.join(distDir, path.normalize(decodeURIComponent(url.pathname)));
  } catch {
    res.writeHead(400).end();
    return;
  }

  const insideDist = filePath.startsWith(distDir + path.sep);
  const fileStat = insideDist ? await stat(filePath).catch(() => null) : null;

  // Все неизвестные пути (например, /results) отдают интерфейс, дальше маршрут выбирает React.
  if (!fileStat?.isFile()) {
    if (path.extname(url.pathname)) {
      res.writeHead(404).end();
      return;
    }
    filePath = path.join(distDir, 'index.html');
  }

  const isHashedAsset = filePath.startsWith(path.join(distDir, 'assets') + path.sep);
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
  });

  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
}

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && (item.family === 'IPv4' || item.family === 4) && !item.internal)
    .map((item) => item.address);
}

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return process.env[name] !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
}

async function shutdown() {
  await store.flush();
  await vite?.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
