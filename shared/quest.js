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

// Значения по умолчанию; на сервере их можно переопределить переменными окружения.
export const DEFAULT_SCORING = {
  base: 1000, // стартовый запас баллов
  perMinute: 10, // штраф за каждую минуту прохождения
  perMistake: 20, // штраф за неверную отправку ответа
  perHint: 30, // штраф за открытую подсказку
};

export function sumValues(map) {
  return Object.values(map ?? {}).reduce((total, value) => total + value, 0);
}

export function computeScore({ elapsedMs, mistakes, hints }, scoring = DEFAULT_SCORING) {
  const timePenalty = Math.round((elapsedMs / 60000) * scoring.perMinute);
  const mistakePenalty = mistakes * scoring.perMistake;
  const hintPenalty = hints * scoring.perHint;

  return {
    base: scoring.base,
    timePenalty,
    mistakePenalty,
    hintPenalty,
    total: Math.max(0, scoring.base - timePenalty - mistakePenalty - hintPenalty),
  };
}

export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value) => String(value).padStart(2, '0');

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
