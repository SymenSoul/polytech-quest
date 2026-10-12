// Правила квеста без привязки к хранилищу: используются сервером и локальным режимом в браузере.
import { GRADES, LEVELS, LEVEL_IDS, compareResults, computeScore, sumValues } from './quest.js';
import { generateNickname, isGeneratedNickname } from './nicknames.js';

const EVENT_TYPES = new Set(['hint', 'mistake', 'solve']);
const MAX_REMEMBERED_EVENTS = 500;

export class QuestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function randomHex(bytes) {
  const buffer = globalThis.crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function isNicknameTaken(players, name) {
  const lower = name.toLowerCase();
  return players.some((player) => player.team.toLowerCase() === lower);
}

export function suggestNickname(players, exclude = '') {
  return generateNickname((name) => isNicknameTaken(players, name), exclude);
}

// Записи, созданные до появления уровней, считаются уровнем «Тигр».
export function levelOf(player) {
  return LEVELS[player.level] ?? LEVELS.senior;
}

export function createPlayer(players, { nickname, grade, classLetter, level }, now = Date.now()) {
  const gradeNumber = Number(grade);
  if (!GRADES.includes(gradeNumber)) {
    throw new QuestError(400, 'Выберите класс.');
  }
  if (!LEVEL_IDS.includes(level)) {
    throw new QuestError(400, 'Выберите уровень сложности.');
  }

  // Принимаем только позывной из словаря; если его успела занять другая команда — выдаем новый.
  const requested = String(nickname ?? '');
  const name =
    isGeneratedNickname(requested) && !isNicknameTaken(players, requested)
      ? requested
      : suggestNickname(players);
  const letter = String(classLetter ?? '')
    .trim()
    .toUpperCase()
    .match(/^[А-ЯЁA-Z]$/)?.[0] ?? '';

  return {
    id: randomHex(6),
    token: randomHex(24),
    team: name,
    level,
    grade: gradeNumber,
    classLetter: letter,
    startedAt: now,
    finishedAt: null,
    solved: [],
    mistakes: zeroCounters(LEVELS[level].modules),
    hints: zeroCounters(LEVELS[level].modules),
    events: [],
  };
}

// Применяет событие к игроку. Возвращает true, если состояние изменилось.
export function applyEvent(player, { eventId, type, module }, now = Date.now()) {
  const level = levelOf(player);

  if (typeof eventId !== 'string' || eventId.length < 8 || eventId.length > 64) {
    throw new QuestError(400, 'Некорректный идентификатор события.');
  }
  if (!EVENT_TYPES.has(type) || !level.modules.includes(module)) {
    throw new QuestError(400, 'Неизвестное событие.');
  }

  // Повторно присланное событие (например, после обрыва связи) не учитываем дважды.
  if (player.finishedAt || player.events.includes(eventId)) {
    return false;
  }

  const isCurrent = level.modules.indexOf(module) === player.solved.length;

  if (type === 'solve') {
    if (!isCurrent) {
      throw new QuestError(409, 'Этапы нужно проходить по порядку.');
    }
    player.solved.push(module);
    if (player.solved.length === level.modules.length) {
      player.finishedAt = now;
    }
  } else if (type === 'mistake' && isCurrent) {
    player.mistakes[module] = (player.mistakes[module] ?? 0) + 1;
  } else if (type === 'hint' && isCurrent && (player.hints[module] ?? 0) < level.hintLimit) {
    player.hints[module] = (player.hints[module] ?? 0) + 1;
  }

  player.events.push(eventId);
  if (player.events.length > MAX_REMEMBERED_EVENTS) {
    player.events.splice(0, player.events.length - MAX_REMEMBERED_EVENTS);
  }
  return true;
}

// Публичное представление участника: без токена и служебных полей. Очки считаются в любой момент игры.
export function summarize(player, scoring, now = Date.now()) {
  const level = levelOf(player);
  const elapsedMs = (player.finishedAt ?? now) - player.startedAt;
  const totalMistakes = sumValues(player.mistakes);
  const totalHints = sumValues(player.hints);

  return {
    id: player.id,
    team: player.team,
    level: level.id,
    grade: player.grade ?? null,
    className: player.grade ? `${player.grade}${player.classLetter ?? ''}` : (player.school ?? ''),
    startedAt: player.startedAt,
    finishedAt: player.finishedAt,
    status: player.finishedAt ? 'finished' : 'playing',
    elapsedMs,
    modules: level.modules,
    solved: player.solved,
    mistakes: player.mistakes,
    hints: player.hints,
    totalMistakes,
    totalHints,
    score: computeScore(
      { solvedCount: player.solved.length, mistakes: totalMistakes, hints: totalHints },
      scoring,
    ),
    place: null,
  };
}

// Рейтинг: отдельная таблица на каждый уровень, отсортированная по очкам.
export function buildLeaderboard(players, scoring, now = Date.now()) {
  const levels = LEVEL_IDS.map((id) => {
    const rows = players
      .filter((player) => levelOf(player).id === id)
      .map((player) => summarize(player, scoring, now))
      .sort(compareResults);
    rows.forEach((row, index) => {
      row.place = index + 1;
    });
    return { id, rows };
  });

  return { levels };
}

export function summarizeWithPlace(players, player, scoring, now = Date.now()) {
  const level = levelOf(player).id;
  const rows = buildLeaderboard(players, scoring, now).levels.find((item) => item.id === level).rows;
  return rows.find((row) => row.id === player.id);
}

export function allRows(leaderboard) {
  return leaderboard.levels.flatMap((level) => level.rows);
}

function zeroCounters(modules) {
  return Object.fromEntries(modules.map((id) => [id, 0]));
}
