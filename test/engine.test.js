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
import {
  DEFAULT_SCORING,
  DEFAULT_SETTINGS,
  LEVELS,
  HINT_COOLDOWN_MS,
  hintReadyAt,
  normalizeSettings,
  plural,
  recommendedLevel,
} from '../shared/quest.js';

const T0 = Date.UTC(2026, 9, 12, 9, 0, 0);
const MINUTE = 60000;
let eventCounter = 0;

function event(type, module, at) {
  eventCounter += 1;
  return { eventId: `test-event-${eventCounter}`, type, module, at };
}

function register(players, form = {}, now = T0) {
  const player = createPlayer(players, { grade: 8, level: 'senior', mode: 'timed', ...form }, now);
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
  const form = { grade: 8, level: 'senior', mode: 'timed' };
  assert.throws(() => createPlayer([], { ...form, grade: undefined }), QuestError);
  assert.throws(() => createPlayer([], { ...form, level: 'hard' }), QuestError);
  assert.throws(() => createPlayer([], { ...form, grade: 6 }), QuestError);
  assert.throws(() => createPlayer([], { ...form, mode: undefined }), QuestError);

  const player = createPlayer([], { ...form, grade: '7', classLetter: 'б', level: 'junior' }, T0);
  assert.equal(summarize(player, DEFAULT_SCORING, T0).className, '7Б');
  assert.equal(createPlayer([], { ...form, classLetter: '1' }).classLetter, '');
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
  assert.equal(player.solvedAt.security, T0 + 2 * MINUTE);
  assert.equal(player.finishedAt, null);
  applyEvent(player, event('solve', 'network'), T0 + 3 * MINUTE);
  assert.equal(player.finishedAt, T0 + 3 * MINUTE);

  const summary = summarize(player, DEFAULT_SCORING, T0 + 10 * MINUTE);
  assert.equal(summary.status, 'finished');
  assert.equal(summary.score.total, 600);
});

test('подсказок не больше лимита уровня', () => {
  const dragon = register([], { level: 'expert' });
  for (let index = 1; index <= 5; index += 1) applyEvent(dragon, event('hint', 'sql'), T0 + index * MINUTE);
  assert.equal(dragon.hints.sql, LEVELS.expert.hintLimit);
});

test('подсказки открываются с паузой после начала задания и после предыдущей', () => {
  const player = register([]);
  const pause = HINT_COOLDOWN_MS;
  assert.equal(applyEvent(player, event('hint', 'sql'), T0 + 5000), true);
  assert.equal(player.hints.sql, 0, 'сразу после старта рано');

  applyEvent(player, event('hint', 'sql'), T0 + pause);
  applyEvent(player, event('hint', 'sql'), T0 + pause + 10000);
  assert.equal(player.hints.sql, 1, 'вторая подсказка ждёт паузу');
  applyEvent(player, event('hint', 'sql'), T0 + 2 * pause);
  assert.equal(player.hints.sql, 2);

  // Для следующего задания пауза считается от момента решения предыдущего.
  applyEvent(player, event('solve', 'sql'), T0 + 5 * MINUTE);
  assert.equal(hintReadyAt(player, LEVELS.senior.modules, 'python'), T0 + 5 * MINUTE + pause);
});

test('очки: 200 за задание минус штрафы, текущие очки видны до финиша', () => {
  const player = register([]);
  applyEvent(player, event('hint', 'sql'), T0 + MINUTE);
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

test('лимит времени берётся из настроек уровня в момент регистрации', () => {
  const settings = normalizeSettings({ timeLimits: { junior: 10 } });
  assert.equal(settings.timeLimits.senior, DEFAULT_SETTINGS.timeLimits.senior);
  assert.equal(normalizeSettings({ timeLimits: { junior: -5 } }).timeLimits.junior, 15);

  const timed = createPlayer([], { grade: 7, level: 'junior', mode: 'timed' }, T0, settings);
  assert.equal(timed.timeLimitMs, 10 * MINUTE);
  const practice = createPlayer([], { grade: 7, level: 'junior', mode: 'practice' }, T0, settings);
  assert.equal(practice.timeLimitMs, 0);
});

test('после дедлайна события не принимаются, статус — «время вышло»', () => {
  const player = register([], { grade: 7, level: 'junior' });
  const limit = player.timeLimitMs;
  applyEvent(player, event('solve', 'sql'), T0 + MINUTE);
  assert.equal(applyEvent(player, event('solve', 'security'), T0 + limit + 1), false);
  assert.deepEqual(player.solved, ['sql']);

  const summary = summarize(player, DEFAULT_SCORING, T0 + limit + 5 * MINUTE);
  assert.equal(summary.status, 'timeout');
  assert.equal(summary.elapsedMs, limit);
  assert.equal(summary.score.total, 200);
});

test('событие из очереди после обрыва связи учитывается по времени действия', () => {
  const player = register([], { grade: 7, level: 'junior' });
  const limit = player.timeLimitMs;
  // Решено за минуту до конца, а до сервера дошло уже после дедлайна.
  assert.equal(applyEvent(player, event('solve', 'sql', T0 + limit - MINUTE), T0 + limit + MINUTE), true);
  assert.equal(player.solvedAt.sql, T0 + limit - MINUTE);

  // Время из будущего обрезается до текущего момента сервера.
  const other = register([]);
  applyEvent(other, event('solve', 'sql', T0 + 99 * MINUTE), T0 + MINUTE);
  assert.equal(other.solvedAt.sql, T0 + MINUTE);
});

test('«просто так» не попадает в рейтинг и не получает место', () => {
  const players = [];
  const ranked = register(players);
  const practice = register(players, { mode: 'practice' });
  solveAll(practice, T0 + MINUTE);

  const senior = buildLeaderboard(players, DEFAULT_SCORING, T0 + 2 * MINUTE).levels.find(
    (level) => level.id === 'senior',
  );
  assert.deepEqual(
    senior.rows.map((row) => row.id),
    [ranked.id],
  );
  assert.equal(senior.practice[0].id, practice.id);
  assert.equal(summarizeWithPlace(players, practice, DEFAULT_SCORING).place, null);
  assert.equal(summarizeWithPlace(players, ranked, DEFAULT_SCORING).place, 1);
});

test('склонение по числу', () => {
  const forms = ['минута', 'минуты', 'минут'];
  assert.deepEqual(
    [1, 2, 5, 11, 15, 21, 22, 25].map((count) => plural(count, forms)),
    ['минута', 'минуты', 'минут', 'минут', 'минут', 'минута', 'минуты', 'минут'],
  );
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
  assert.equal(summary.mode, 'timed');
  assert.equal(summary.className, '9Б');
});

test('CSV экранирует формулы и разделители', () => {
  const players = [];
  const player = register(players);
  player.team = '=HYPERLINK("x");1';
  applyEvent(player, event('solve', 'sql'), T0 + 90 * 1000);
  register(players, { mode: 'practice' });
  const csv = buildResultsCsv(buildLeaderboard(players, DEFAULT_SCORING, T0 + 2 * MINUTE));
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes(`"'=HYPERLINK(""x"");1"`));
  assert.ok(csv.includes('Тигр;1;'));
  assert.ok(csv.includes(';на время (25 мин);'));
  assert.ok(csv.includes(';просто так;'));
  // Время на первое задание: 1,5 минуты от старта.
  assert.ok(csv.includes(';01:30;0;0;'));
});
