// Автономный режим: тот же API, что у сервера, но база хранится в localStorage этого браузера.
// Включается, когда сервера нет (сайт открыт как файл или со статического хостинга) или он недоступен.
import { buildResultsCsv } from '../shared/csv.js';
import {
  QuestError,
  applyEvent,
  buildLeaderboard,
  createPlayer,
  suggestNickname,
  summarizeWithPlace,
} from '../shared/engine.js';
import { DEFAULT_SCORING, DEFAULT_SETTINGS, LEVELS, normalizeSettings } from '../shared/quest.js';

const DB_KEY = 'polytech-quest-local-db';

function loadDb() {
  let data = null;
  try {
    data = JSON.parse(localStorage.getItem(DB_KEY));
  } catch {
    // Повреждённые или недоступные данные — начинаем с пустой базы.
  }
  return {
    settings: normalizeSettings(data?.settings ?? DEFAULT_SETTINGS),
    players: Array.isArray(data?.players) ? data.players : [],
  };
}

function saveDb(db) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    throw new QuestError(507, 'Браузер не даёт сохранить результаты (приватный режим или переполнено хранилище).');
  }
}

export function localApi(method, path, { body, token } = {}) {
  const db = loadDb();
  const now = Date.now();
  const scoring = DEFAULT_SCORING;
  const url = new URL(path, 'http://local');

  const session = (player) => ({ now, scoring, player: summarizeWithPlace(db.players, player, scoring, now) });
  const requirePlayer = () => {
    const player = token && db.players.find((item) => item.token === token);
    if (!player) throw new QuestError(401, 'Сессия не найдена. Зарегистрируйтесь заново.');
    return player;
  };

  const playerMatch = url.pathname.match(/^\/api\/players\/([0-9a-f]+)$/);
  if (method === 'DELETE' && playerMatch) {
    db.players = db.players.filter((player) => player.id !== playerMatch[1]);
    saveDb(db);
    return { ok: true };
  }

  switch (`${method} ${url.pathname}`) {
    case 'GET /api/config':
      return { mode: 'local', scoring, levels: LEVELS, settings: db.settings };
    case 'GET /api/nickname':
      return { nickname: suggestNickname(db.players, url.searchParams.get('exclude') ?? '') };
    case 'POST /api/register': {
      const player = createPlayer(db.players, body ?? {}, now, db.settings);
      db.players.push(player);
      saveDb(db);
      return { token: player.token, ...session(player) };
    }
    case 'GET /api/session':
      return session(requirePlayer());
    case 'POST /api/events': {
      const player = requirePlayer();
      if (applyEvent(player, body ?? {}, now)) saveDb(db);
      return session(player);
    }
    case 'GET /api/leaderboard':
      return { now, scoring, ...buildLeaderboard(db.players, scoring, now) };
    case 'GET /api/results.csv':
      return buildResultsCsv(buildLeaderboard(db.players, scoring, now));
    // На своём компьютере ключ организатора не нужен: управление защищено только подтверждением.
    case 'GET /api/admin/check':
      return { ok: true };
    case 'PUT /api/settings':
      db.settings = normalizeSettings({ timeLimits: { ...db.settings.timeLimits, ...body?.timeLimits } });
      saveDb(db);
      return { settings: db.settings };
    case 'DELETE /api/players':
      db.players = [];
      saveDb(db);
      return { ok: true };
    default:
      throw new QuestError(404, 'Неизвестный адрес API.');
  }
}
