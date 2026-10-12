import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MODULE_IDS, computeScore, sumValues } from '../shared/quest.js';
import { generateNickname, isGeneratedNickname } from './nicknames.js';

const EVENT_TYPES = new Set(['hint', 'mistake', 'solve']);
const MAX_REMEMBERED_EVENTS = 500;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Все участники хранятся в памяти и сбрасываются в JSON-файл после каждого изменения.
export class Store {
  constructor(file, scoring) {
    this.file = file;
    this.scoring = scoring;
    this.players = [];
    this.saveTimer = null;
    this.saving = Promise.resolve();
  }

  async load() {
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8'));
      this.players = Array.isArray(data.players) ? data.players : [];
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new Error(`Не удалось прочитать ${this.file}: ${error.message}`);
      }
    }
  }

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 150);
  }

  flush() {
    clearTimeout(this.saveTimer);
    const snapshot = JSON.stringify({ players: this.players }, null, 2);
    const tmpFile = `${this.file}.tmp`;

    this.saving = this.saving
      .then(async () => {
        await mkdir(path.dirname(this.file), { recursive: true });
        await writeFile(tmpFile, snapshot);
        await rename(tmpFile, this.file);
      })
      .catch((error) => console.error('Не удалось сохранить результаты:', error));

    return this.saving;
  }

  isNicknameTaken(name) {
    const lower = name.toLowerCase();
    return this.players.some((player) => player.team.toLowerCase() === lower);
  }

  suggestNickname(exclude) {
    return generateNickname((name) => this.isNicknameTaken(name), exclude);
  }

  register({ nickname, members, school }) {
    // Принимаем только позывной из словаря; если его успела занять другая команда — выдаем новый.
    const requested = String(nickname ?? '');
    const name =
      isGeneratedNickname(requested) && !this.isNicknameTaken(requested)
        ? requested
        : this.suggestNickname();

    const now = Date.now();
    const player = {
      id: randomBytes(6).toString('hex'),
      token: randomBytes(24).toString('hex'),
      team: name,
      members: cleanText(members, 160),
      school: cleanText(school, 60),
      startedAt: now,
      finishedAt: null,
      solved: [],
      mistakes: zeroCounters(),
      hints: zeroCounters(),
      events: [],
    };

    this.players.push(player);
    this.scheduleSave();
    return player;
  }

  byToken(token) {
    return token ? this.players.find((player) => player.token === token) : undefined;
  }

  applyEvent(player, { eventId, type, module }) {
    if (typeof eventId !== 'string' || eventId.length < 8 || eventId.length > 64) {
      throw new HttpError(400, 'Некорректный идентификатор события.');
    }
    if (!EVENT_TYPES.has(type) || !MODULE_IDS.includes(module)) {
      throw new HttpError(400, 'Неизвестное событие.');
    }

    // Повторно присланное событие (например, после обрыва связи) не учитываем дважды.
    if (player.finishedAt || player.events.includes(eventId)) {
      return;
    }

    const moduleIndex = MODULE_IDS.indexOf(module);
    const isCurrent = moduleIndex === player.solved.length;

    if (type === 'solve') {
      if (!isCurrent) {
        throw new HttpError(409, 'Этапы нужно проходить по порядку.');
      }
      player.solved.push(module);
      if (player.solved.length === MODULE_IDS.length) {
        player.finishedAt = Date.now();
      }
    } else if (isCurrent) {
      const counters = type === 'hint' ? player.hints : player.mistakes;
      counters[module] = (counters[module] ?? 0) + 1;
    }

    player.events.push(eventId);
    if (player.events.length > MAX_REMEMBERED_EVENTS) {
      player.events.splice(0, player.events.length - MAX_REMEMBERED_EVENTS);
    }
    this.scheduleSave();
  }

  remove(id) {
    const index = this.players.findIndex((player) => player.id === id);
    if (index === -1) {
      throw new HttpError(404, 'Участник не найден.');
    }
    this.players.splice(index, 1);
    this.scheduleSave();
  }

  clear() {
    this.players = [];
    this.scheduleSave();
  }

  // Публичное представление участника: без токена и служебных полей.
  summary(player, now = Date.now()) {
    const elapsedMs = (player.finishedAt ?? now) - player.startedAt;
    const totalMistakes = sumValues(player.mistakes);
    const totalHints = sumValues(player.hints);

    return {
      id: player.id,
      team: player.team,
      members: player.members,
      school: player.school,
      startedAt: player.startedAt,
      finishedAt: player.finishedAt,
      elapsedMs,
      solved: player.solved,
      mistakes: player.mistakes,
      hints: player.hints,
      totalMistakes,
      totalHints,
      score: player.finishedAt
        ? computeScore({ elapsedMs, mistakes: totalMistakes, hints: totalHints }, this.scoring)
        : null,
      place: null,
    };
  }

  leaderboard(now = Date.now()) {
    const rows = this.players.map((player) => this.summary(player, now));
    const finished = rows
      .filter((row) => row.finishedAt)
      .sort(
        (a, b) =>
          b.score.total - a.score.total || a.elapsedMs - b.elapsedMs || a.finishedAt - b.finishedAt,
      );
    finished.forEach((row, index) => {
      row.place = index + 1;
    });

    const inProgress = rows
      .filter((row) => !row.finishedAt)
      .sort((a, b) => b.solved.length - a.solved.length || a.startedAt - b.startedAt);

    return { finished, inProgress };
  }

  summaryWithPlace(player, now = Date.now()) {
    const row = this.summary(player, now);
    if (row.finishedAt) {
      row.place = this.leaderboard(now).finished.findIndex((item) => item.id === row.id) + 1;
    }
    return row;
  }
}

function zeroCounters() {
  return Object.fromEntries(MODULE_IDS.map((id) => [id, 0]));
}

function cleanText(value, maxLength) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}
