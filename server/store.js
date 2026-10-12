import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  QuestError,
  applyEvent,
  buildLeaderboard,
  createPlayer,
  suggestNickname,
  summarizeWithPlace,
} from '../shared/engine.js';
import { normalizeSettings } from '../shared/quest.js';

export { QuestError as HttpError };

// Все участники хранятся в памяти и сбрасываются в JSON-файл после каждого изменения.
export class Store {
  constructor(file, scoring, defaultSettings) {
    this.file = file;
    this.scoring = scoring;
    this.settings = normalizeSettings(defaultSettings);
    this.players = [];
    this.saveTimer = null;
    this.saving = Promise.resolve();
  }

  async load() {
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8'));
      this.players = Array.isArray(data.players) ? data.players : [];
      // Настройки, сохранённые из админ-панели, важнее значений по умолчанию.
      if (data.settings) this.settings = normalizeSettings(data.settings);
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
    const snapshot = JSON.stringify({ settings: this.settings, players: this.players }, null, 2);
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

  suggestNickname(exclude) {
    return suggestNickname(this.players, exclude);
  }

  register(form) {
    const player = createPlayer(this.players, form, Date.now(), this.settings);
    this.players.push(player);
    this.scheduleSave();
    return player;
  }

  byToken(token) {
    return token ? this.players.find((player) => player.token === token) : undefined;
  }

  applyEvent(player, event) {
    if (applyEvent(player, event)) {
      this.scheduleSave();
    }
  }

  remove(id) {
    const index = this.players.findIndex((player) => player.id === id);
    if (index === -1) {
      throw new QuestError(404, 'Участник не найден.');
    }
    this.players.splice(index, 1);
    this.scheduleSave();
  }

  updateSettings(settings) {
    this.settings = normalizeSettings({
      timeLimits: { ...this.settings.timeLimits, ...settings?.timeLimits },
    });
    this.scheduleSave();
    return this.settings;
  }

  clear() {
    this.players = [];
    this.scheduleSave();
  }

  leaderboard(now = Date.now()) {
    return buildLeaderboard(this.players, this.scoring, now);
  }

  summaryWithPlace(player, now = Date.now()) {
    return summarizeWithPlace(this.players, player, this.scoring, now);
  }
}
