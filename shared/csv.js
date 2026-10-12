import { MODULE_IDS, MODULE_LABELS, formatDuration } from './quest.js';

// Таблица результатов в CSV для Excel: BOM и точка с запятой, чтобы русский Excel открыл файл без мастера импорта.
export function buildResultsCsv({ finished, inProgress }) {
  const header = [
    'Место',
    'Команда',
    'Участники',
    'Школа / класс',
    'Статус',
    'Этапов пройдено',
    'Время',
    'Время, сек',
    'Ошибки',
    'Подсказки',
    'Штраф за время',
    'Штраф за ошибки',
    'Штраф за подсказки',
    'Баллы',
    ...MODULE_IDS.flatMap((id) => [`Ошибки: ${MODULE_LABELS[id]}`, `Подсказки: ${MODULE_LABELS[id]}`]),
    'Начало',
    'Окончание',
  ];

  const rows = [...finished, ...inProgress].map((row) => [
    row.place ?? '',
    row.team,
    row.members,
    row.school,
    row.finishedAt ? 'завершил' : 'в процессе',
    `${row.solved.length}/${MODULE_IDS.length}`,
    formatDuration(row.elapsedMs),
    Math.round(row.elapsedMs / 1000),
    row.totalMistakes,
    row.totalHints,
    row.score?.timePenalty ?? '',
    row.score?.mistakePenalty ?? '',
    row.score?.hintPenalty ?? '',
    row.score?.total ?? '',
    ...MODULE_IDS.flatMap((id) => [row.mistakes[id] ?? 0, row.hints[id] ?? 0]),
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
