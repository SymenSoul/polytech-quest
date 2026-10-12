import { allRows } from './engine.js';
import { LEVELS, MODULE_IDS, MODULE_LABELS, formatDuration } from './quest.js';

const STATUS_LABELS = {
  playing: 'в процессе',
  finished: 'завершил',
};

// Таблица результатов в CSV для Excel: BOM и точка с запятой, чтобы русский Excel открыл файл без мастера импорта.
export function buildResultsCsv(leaderboard) {
  const header = [
    'Уровень',
    'Место',
    'Позывной',
    'Класс',
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
    ...MODULE_IDS.flatMap((id) => [`Ошибки: ${MODULE_LABELS[id]}`, `Подсказки: ${MODULE_LABELS[id]}`]),
    'Начало',
    'Окончание',
  ];

  const rows = allRows(leaderboard).map((row) => [
    LEVELS[row.level].name,
    row.place ?? '',
    row.team,
    row.className,
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
    ...MODULE_IDS.flatMap((id) =>
      row.modules.includes(id) ? [row.mistakes[id] ?? 0, row.hints[id] ?? 0] : ['', ''],
    ),
    formatDate(row.startedAt),
    row.finishedAt ? formatDate(row.finishedAt) : '',
  ]);

  return '﻿' + [header, ...rows].map((cells) => cells.map(csvCell).join(';')).join('\r\n');
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
