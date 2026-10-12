import { timingSafeEqual } from 'node:crypto';
import { buildResultsCsv } from '../shared/csv.js';
import { MODULE_IDS } from '../shared/quest.js';
import { HttpError } from './store.js';

const MAX_BODY_BYTES = 16 * 1024;

export function createApi(store, { adminKey, scoring }) {
  const routes = {
    'GET /api/config': () => ({ scoring, modules: MODULE_IDS }),

    'GET /api/nickname': (req, url) => ({ nickname: store.suggestNickname(url.searchParams.get('exclude') ?? '') }),

    'POST /api/register': async (req) => {
      const player = store.register(await readJson(req));
      return { token: player.token, ...sessionPayload(player) };
    },

    'GET /api/session': (req) => sessionPayload(requirePlayer(req)),

    'POST /api/events': async (req) => {
      const player = requirePlayer(req);
      store.applyEvent(player, await readJson(req));
      return sessionPayload(player);
    },

    'GET /api/leaderboard': () => {
      const now = Date.now();
      return { now, scoring, ...store.leaderboard(now) };
    },

    'GET /api/admin/check': (req) => {
      requireAdmin(req);
      return { ok: true };
    },

    'DELETE /api/players': (req) => {
      requireAdmin(req);
      store.clear();
      return { ok: true };
    },
  };

  function sessionPayload(player) {
    const now = Date.now();
    return { now, scoring, player: store.summaryWithPlace(player, now) };
  }

  function requirePlayer(req) {
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const player = store.byToken(token);
    if (!player) {
      throw new HttpError(401, 'Сессия не найдена. Зарегистрируйтесь заново.');
    }
    return player;
  }

  function requireAdmin(req) {
    const given = Buffer.from(String(req.headers['x-admin-key'] ?? ''));
    const expected = Buffer.from(adminKey);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new HttpError(403, 'Неверный ключ организатора.');
    }
  }

  return async function handleApi(req, res, url) {
    try {
      if (req.method === 'GET' && url.pathname === '/api/results.csv') {
        sendCsv(res, store);
        return;
      }

      const playerMatch = url.pathname.match(/^\/api\/players\/([0-9a-f]+)$/);
      if (req.method === 'DELETE' && playerMatch) {
        requireAdmin(req);
        store.remove(playerMatch[1]);
        sendJson(res, 200, { ok: true });
        return;
      }

      const route = routes[`${req.method} ${url.pathname}`];
      if (!route) {
        throw new HttpError(404, 'Неизвестный адрес API.');
      }
      sendJson(res, 200, await route(req, url));
    } catch (error) {
      if (!(error instanceof HttpError)) {
        console.error(error);
      }
      const status = error instanceof HttpError ? error.status : 500;
      sendJson(res, status, { error: status === 500 ? 'Внутренняя ошибка сервера.' : error.message });
    }
  };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'Слишком большой запрос.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        resolve(data && typeof data === 'object' ? data : {});
      } catch {
        reject(new HttpError(400, 'Некорректный JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

function sendCsv(res, store) {
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="polytech-quest-results.csv"',
    'Cache-Control': 'no-store',
  });
  res.end(buildResultsCsv(store.leaderboard()));
}
