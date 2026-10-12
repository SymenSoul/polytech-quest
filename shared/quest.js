// Общие правила квеста: используются и сервером, и интерфейсом.

// Порядок этапов должен совпадать с массивом modules в src/App.jsx.
export const MODULE_IDS = ['sql', 'python', 'security', 'network', 'workflow'];

export const MODULE_LABELS = {
  sql: 'SQL',
  python: 'Python',
  security: 'Безопасность',
  network: 'Сети',
  workflow: 'Git-процесс',
};

// Уровни сложности. Названия можно поменять здесь — они используются везде.
export const LEVELS = {
  junior: {
    id: 'junior',
    name: 'Лисёнок',
    difficulty: 'лёгкий',
    description: '3 задания, объяснения простыми словами',
    modules: ['sql', 'security', 'network'],
    grades: [7],
    hintLimit: 3,
    glossary: true,
  },
  senior: {
    id: 'senior',
    name: 'Тигр',
    difficulty: 'средний',
    description: 'все 5 заданий с памятками',
    modules: MODULE_IDS,
    grades: [8, 9],
    hintLimit: 3,
    glossary: true,
  },
  expert: {
    id: 'expert',
    name: 'Дракон',
    difficulty: 'сложный',
    description: 'все 5 заданий без памяток, только 2 подсказки на задание',
    modules: MODULE_IDS,
    grades: [],
    hintLimit: 2,
    glossary: false,
  },
};

export const LEVEL_IDS = Object.keys(LEVELS);

// Режим выбирает участник: «на время» попадает в рейтинг, «просто так» — только для себя.
export const MODES = {
  timed: { id: 'timed', name: 'На время', ranked: true },
  practice: { id: 'practice', name: 'Просто так', ranked: false },
};

export const STATUS_LABELS = {
  playing: 'в игре',
  finished: 'финиш',
  timeout: 'время вышло',
};

// Лимиты по умолчанию, минуты. Расчёт: брифинги + чтение условия + перебор вариантов + запас ~25 %
// (подробно в README). Организатор может поменять их в админ-панели /results.
export const DEFAULT_SETTINGS = {
  timeLimits: { junior: 15, senior: 25, expert: 25 },
};

export function normalizeSettings(settings) {
  const timeLimits = {};
  for (const id of LEVEL_IDS) {
    const value = Math.round(Number(settings?.timeLimits?.[id]));
    timeLimits[id] = value >= 1 && value <= 180 ? value : DEFAULT_SETTINGS.timeLimits[id];
  }
  return { timeLimits };
}

export const GRADES = [7, 8, 9];

export function recommendedLevel(grade) {
  return LEVEL_IDS.find((id) => LEVELS[id].grades.includes(grade)) ?? 'senior';
}

// Значения по умолчанию; на сервере их можно переопределить переменными окружения.
export const DEFAULT_SCORING = {
  perTask: 200, // очки за каждое решённое задание
  perMistake: 20, // штраф за неверную отправку ответа
  perHint: 30, // штраф за открытую подсказку
};

export function sumValues(map) {
  return Object.values(map ?? {}).reduce((total, value) => total + value, 0);
}

export function computeScore({ solvedCount, mistakes, hints }, scoring = DEFAULT_SCORING) {
  const taskPoints = solvedCount * scoring.perTask;
  const mistakePenalty = mistakes * scoring.perMistake;
  const hintPenalty = hints * scoring.perHint;

  return {
    taskPoints,
    mistakePenalty,
    hintPenalty,
    total: Math.max(0, taskPoints - mistakePenalty - hintPenalty),
  };
}

// Порядок в рейтинге: очки, затем число решённых заданий, затем затраченное время.
export function compareResults(a, b) {
  return (
    b.score.total - a.score.total ||
    b.solved.length - a.solved.length ||
    a.elapsedMs - b.elapsedMs ||
    a.startedAt - b.startedAt
  );
}

// Склонение по числу: plural(1, ['минута', 'минуты', 'минут']) → «минута».
export function plural(count, [one, few, many]) {
  const tens = Math.abs(count) % 100;
  const units = tens % 10;
  if (tens > 10 && tens < 20) return many;
  if (units === 1) return one;
  if (units >= 2 && units <= 4) return few;
  return many;
}

export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value) => String(value).padStart(2, '0');

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
