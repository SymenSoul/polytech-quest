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

export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value) => String(value).padStart(2, '0');

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
