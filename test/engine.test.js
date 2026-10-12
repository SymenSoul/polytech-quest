import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildResultsCsv } from '../shared/csv.js';
import {
  QuestError,
  applyEvent,
  buildLeaderboard,
  createPlayer,
  summarize,
  summarizeWithPlace,
} from '../shared/engine.js';
import { generateNickname, isGeneratedNickname } from '../shared/nicknames.js';
import { DEFAULT_SCORING, LEVELS, recommendedLevel } from '../shared/quest.js';

const T0 = Date.UTC(2026, 9, 12, 9, 0, 0);
const MINUTE = 60000;
let eventCounter = 0;

function event(type, module) {
  eventCounter += 1;
  return { eventId: `test-event-${eventCounter}`, type, module };
}

function register(players, form = {}, now = T0) {
  const player = createPlayer(players, { grade: 8, level: 'senior', ...form }, now);
  players.push(player);
  return player;
}

function solveAll(player, now) {
  for (const module of LEVELS[player.level].modules) applyEvent(player, event('solve', module), now);
}

test('позывной из словаря принимается, занятый или чужой заменяется', () => {
  const players = [];
  assert.equal(register(players, { nickname: 'Мудрая Сова' }).team, 'Мудрая Сова');

  const second = register(players, { nickname: 'Мудрая Сова' });
  assert.notEqual(second.team, 'Мудрая Сова');
  assert.ok(isGeneratedNickname(second.team));

  assert.ok(isGeneratedNickname(register(players, { nickname: 'Тупой Осёл' }).team));
});

test('позывные не повторяются даже после исчерпания словаря', () => {
  const taken = new Set();
  for (let index = 0; index < 2600; index += 1) {
    const name = generateNickname((candidate) => taken.has(candidate.toLowerCase()));
    assert.ok(!taken.has(name.toLowerCase()), `повтор: ${name}`);
    taken.add(name.toLowerCase());
  }
});

test('регистрация требует класс и уровень, буква класса нормализуется', () => {
  assert.throws(() => createPlayer([], { level: 'senior' }), QuestError);
  assert.throws(() => createPlayer([], { grade: 8, level: 'hard' }), QuestError);
  assert.throws(() => createPlayer([], { grade: 6, level: 'senior' }), QuestError);

  const player = createPlayer([], { grade: '7', classLetter: 'б', level: 'junior' }, T0);
  assert.equal(summarize(player, DEFAULT_SCORING, T0).className, '7Б');
  assert.equal(createPlayer([], { grade: 9, classLetter: '1', level: 'senior' }).classLetter, '');
});

test('рекомендуемый уровень зависит от класса', () => {
  assert.equal(recommendedLevel(7), 'junior');
  assert.equal(recommendedLevel(8), 'senior');
  assert.equal(recommendedLevel(9), 'senior');
});

test('этапы проходятся по порядку уровня, повтор события не учитывается', () => {
  const player = register([]);
  const mistake = event('mistake', 'sql');
  applyEvent(player, mistake, T0);
  applyEvent(player, mistake, T0);
  assert.equal(player.mistakes.sql, 1);

  assert.throws(() => applyEvent(player, event('solve', 'python'), T0), QuestError);
  applyEvent(player, event('solve', 'sql'), T0);
  assert.deepEqual(player.solved, ['sql']);
});

test('«Лисёнок» проходит 3 задания и не может решать задания других уровней', () => {
  const player = register([], { grade: 7, level: 'junior' });
  assert.throws(() => applyEvent(player, event('solve', 'python'), T0), QuestError);

  applyEvent(player, event('solve', 'sql'), T0 + MINUTE);
  applyEvent(player, event('solve', 'security'), T0 + 2 * MINUTE);
  assert.equal(player.finishedAt, null);
  applyEvent(player, event('solve', 'network'), T0 + 3 * MINUTE);
  assert.equal(player.finishedAt, T0 + 3 * MINUTE);

  const summary = summarize(player, DEFAULT_SCORING, T0 + 10 * MINUTE);
  assert.equal(summary.status, 'finished');
  assert.equal(summary.score.total, 600);
});

test('подсказок не больше лимита уровня', () => {
  const dragon = register([], { level: 'expert' });
  for (let index = 0; index < 5; index += 1) applyEvent(dragon, event('hint', 'sql'), T0);
  assert.equal(dragon.hints.sql, LEVELS.expert.hintLimit);
});

test('очки: 200 за задание минус штрафы, текущие очки видны до финиша', () => {
  const player = register([]);
  applyEvent(player, event('hint', 'sql'), T0);
  applyEvent(player, event('mistake', 'sql'), T0);
  applyEvent(player, event('solve', 'sql'), T0);
  assert.deepEqual(summarize(player, DEFAULT_SCORING, T0).score, {
    taskPoints: 200,
    mistakePenalty: 20,
    hintPenalty: 30,
    total: 150,
  });

  // Все 5 заданий без штрафов — те же 1000 очков, что и в прежней формуле.
  const clean = register([]);
  solveAll(clean, T0);
  assert.equal(summarize(clean, DEFAULT_SCORING, T0).score.total, 1000);
});

test('рейтинг отдельный для каждого уровня; при равных очках выше более быстрый', () => {
  const players = [];
  const slow = register(players);
  const fast = register(players);
  const junior = register(players, { grade: 7, level: 'junior' });
  solveAll(slow, T0 + 10 * MINUTE);
  solveAll(fast, T0 + 5 * MINUTE);
  solveAll(junior, T0 + 3 * MINUTE);

  const board = buildLeaderboard(players, DEFAULT_SCORING, T0 + 11 * MINUTE);
  const senior = board.levels.find((level) => level.id === 'senior').rows;
  assert.deepEqual(
    senior.map((row) => row.id),
    [fast.id, slow.id],
  );
  assert.equal(board.levels.find((level) => level.id === 'junior').rows[0].place, 1);
  assert.equal(summarizeWithPlace(players, slow, DEFAULT_SCORING).place, 2);
});

test('старые записи без уровня читаются как «Тигр»', () => {
  const legacy = {
    id: 'aa',
    team: 'Старая Сова',
    school: '9Б',
    startedAt: T0,
    finishedAt: null,
    solved: [],
    mistakes: {},
    hints: {},
    events: [],
  };
  const summary = summarize(legacy, DEFAULT_SCORING, T0);
  assert.equal(summary.level, 'senior');
  assert.equal(summary.className, '9Б');
});

test('CSV экранирует формулы и разделители', () => {
  const players = [];
  const player = register(players);
  player.team = '=HYPERLINK("x");1';
  const csv = buildResultsCsv(buildLeaderboard(players, DEFAULT_SCORING, T0));
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes(`"'=HYPERLINK(""x"");1"`));
  assert.ok(csv.includes('Тигр;1;'));
});
