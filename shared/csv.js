import { allRows } from './engine.js';
import { LEVELS, MODULE_IDS, MODULE_LABELS, STATUS_LABELS, formatDuration } from './quest.js';

// Таблица результатов в CSV для Excel: BOM и точка с запятой, чтобы русский Excel открыл файл без мастера импорта.
export function buildResultsCsv(leaderboard) {
  const header = [
    'Уровень',
    'Место',
    'Позывной',
    'Класс',
    'Режим',
    'Статус',
    'Решено заданий',
    'Время',
    'Время, сек',
    'Ошибки',
    'Подсказки',
    'Очки за задания',
    'Штраф за ошибки',
    'Штраф за подсказки',
    'Очки',
    ...MODULE_IDS.flatMap((id) => [
      `Время: ${MODULE_LABELS[id]}`,
      `Ошибки: ${MODULE_LABELS[id]}`,
      `Подсказки: ${MODULE_LABELS[id]}`,
    ]),
    'Начало',
    'Окончание',
  ];

  const rows = allRows(leaderboard).map((row) => [
    LEVELS[row.level].name,
    row.place ?? '',
    row.team,
    row.className,
    row.mode === 'timed' ? `на время${row.timeLimitMs ? ` (${row.timeLimitMs / 60000} мин)` : ''}` : 'просто так',
    STATUS_LABELS[row.status] ?? row.status,
    `${row.solved.length}/${row.modules.length}`,
    formatDuration(row.elapsedMs),
    Math.round(row.elapsedMs / 1000),
    row.totalMistakes,
    row.totalHints,
    row.score.taskPoints,
    row.score.mistakePenalty,
    row.score.hintPenalty,
    row.score.total,
    ...MODULE_IDS.flatMap((id) => {
      if (!row.modules.includes(id)) return ['', '', ''];
      const taskTime = taskDurations(row)[id];
      return [taskTime === undefined ? '' : formatDuration(taskTime), row.mistakes[id] ?? 0, row.hints[id] ?? 0];
    }),
    formatDate(row.startedAt),
    row.finishedAt ? formatDate(row.finishedAt) : '',
  ]);

  return '\uFEFF' + [header, ...rows].map((cells) => cells.map(csvCell).join(';')).join('\r\n');
}

// Сколько ушло на каждое задание: от решения предыдущего (или от старта) до решения этого.
// Нужно, чтобы после пробного прохода проверить, хватает ли лимита времени.
function taskDurations(row) {
  const durations = {};
  let previous = row.startedAt;
  for (const id of row.modules) {
    const solvedAt = row.solvedAt[id];
    if (!solvedAt) break;
    durations[id] = solvedAt - previous;
    previous = solvedAt;
  }
  return durations;
}

function csvCell(value) {
  let text = String(value ?? '');
  // Защита от формул в названиях при открытии в Excel.
  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString('ru-RU');
}
