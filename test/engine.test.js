import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildResultsCsv } from '../shared/csv.js';
import {
  QuestError,
  applyEvent,
  buildLeaderboard,
  createPlayer,
  summarizeWithPlace,
} from '../shared/engine.js';
import { generateNickname, isGeneratedNickname } from '../shared/nicknames.js';
import { DEFAULT_SCORING, MODULE_IDS } from '../shared/quest.js';

const T0 = Date.UTC(2026, 9, 12, 9, 0, 0);
let eventCounter = 0;

function event(type, module) {
  eventCounter += 1;
  return { eventId: `test-event-${eventCounter}`, type, module };
}

function solveAll(player, now) {
  for (const module of MODULE_IDS) applyEvent(player, event('solve', module), now);
}

test('позывной из словаря принимается, занятый или чужой заменяется', () => {
  const players = [];
  const first = createPlayer(players, { nickname: 'Мудрая Сова' }, T0);
  players.push(first);
  assert.equal(first.team, 'Мудрая Сова');

  const second = createPlayer(players, { nickname: 'Мудрая Сова' }, T0);
  assert.notEqual(second.team, 'Мудрая Сова');
  assert.ok(isGeneratedNickname(second.team));

  const third = createPlayer(players, { nickname: 'Тупой Осёл' }, T0);
  assert.ok(isGeneratedNickname(third.team));
});

test('позывные не повторяются даже после исчерпания словаря', () => {
  const taken = new Set();
  for (let index = 0; index < 2600; index += 1) {
    const name = generateNickname((candidate) => taken.has(candidate.toLowerCase()));
    assert.ok(!taken.has(name.toLowerCase()), `повтор: ${name}`);
    taken.add(name.toLowerCase());
  }
});

test('этапы проходятся по порядку, повтор события не учитывается', () => {
  const player = createPlayer([], {}, T0);
  const mistake = event('mistake', 'sql');
  applyEvent(player, mistake, T0);
  applyEvent(player, mistake, T0);
  assert.equal(player.mistakes.sql, 1);

  assert.throws(() => applyEvent(player, event('solve', 'python'), T0), QuestError);
  applyEvent(player, event('solve', 'sql'), T0);
  assert.deepEqual(player.solved, ['sql']);
});

test('после финиша считаются баллы и место', () => {
  const players = [createPlayer([], {}, T0), createPlayer([], {}, T0)];
  applyEvent(players[0], event('hint', 'sql'), T0);
  solveAll(players[0], T0 + 10 * 60000);
  solveAll(players[1], T0 + 5 * 60000);

  const board = buildLeaderboard(players, DEFAULT_SCORING, T0 + 11 * 60000);
  assert.deepEqual(
    board.finished.map((row) => row.id),
    [players[1].id, players[0].id],
  );
  assert.equal(summarizeWithPlace(players, players[0], DEFAULT_SCORING).place, 2);
});

test('CSV экранирует формулы и разделители', () => {
  const player = createPlayer([], { school: '=HYPERLINK("x");9Б' }, T0);
  const csv = buildResultsCsv(buildLeaderboard([player], DEFAULT_SCORING, T0));
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes(`"'=HYPERLINK(""x"");9Б"`));
});
