import React, { useCallback, useEffect, useState } from 'react';
import {
  Cat,
  CloudOff,
  Coffee,
  Flame,
  Hourglass,
  Lightbulb,
  PawPrint,
  Play,
  RefreshCw,
  Star,
  TerminalSquare,
  Trophy,
  XCircle,
} from 'lucide-react';
import {
  DEFAULT_SCORING,
  DEFAULT_SETTINGS,
  GRADES,
  LEVELS,
  LEVEL_IDS,
  plural,
  recommendedLevel,
} from '../shared/quest.js';
import { backendKind, request } from './api.js';

export const LEVEL_ICONS = { junior: PawPrint, senior: Cat, expert: Flame };

export default function Registration({ onRegister, presetLevel }) {
  const [nickname, setNickname] = useState('');
  const [grade, setGrade] = useState(null);
  const [classLetter, setClassLetter] = useState('');
  const [level, setLevel] = useState(presetLevel ?? null);
  const [levelChosen, setLevelChosen] = useState(Boolean(presetLevel));
  const [mode, setMode] = useState(null);
  const [scoring, setScoring] = useState(DEFAULT_SCORING);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const rollNickname = useCallback(async (current = '') => {
    try {
      const data = await request(`/api/nickname?exclude=${encodeURIComponent(current)}`);
      setNickname(data.nickname);
      setError('');
    } catch (rollError) {
      setError(rollError.message);
    }
  }, []);

  useEffect(() => {
    rollNickname();
    request('/api/config')
      .then((data) => {
        setScoring(data.scoring);
        setSettings(data.settings);
      })
      .catch(() => {});
  }, [rollNickname]);

  function chooseGrade(value) {
    setGrade(value);
    // Пока участник сам не выбрал уровень, подставляем рекомендованный для его класса.
    if (!levelChosen) setLevel(recommendedLevel(value));
  }

  function chooseLevel(value) {
    setLevel(value);
    setLevelChosen(true);
  }

  async function submit(event) {
    event.preventDefault();
    if (!grade) {
      setError('Выберите свой класс.');
      return;
    }
    if (!mode) {
      setError('Выберите режим: на время или просто так.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      // Если позывной успели занять, сервер выдаст другой — он появится в панели участника.
      await onRegister({ nickname, grade, classLetter, level, mode });
    } catch (registerError) {
      setError(registerError.message);
      setBusy(false);
    }
  }

  return (
    <main className="gate-shell">
      <div className="scanlines" aria-hidden="true" />
      <section className="gate-card">
        <div className="brand">
          <div className="brand-mark">
            <TerminalSquare size={23} />
          </div>
          <div>
            <p>Polytech Cyber Quest</p>
            <span>Комната расследования 07</span>
          </div>
        </div>

        <div className="gate-copy">
          <span className="eyebrow">Регистрация следователя</span>
          <h1>Исчезновение цифрового гения</h1>
          <p>
            Вам выдан позывной — под ним вы появитесь в таблице результатов. Выберите класс и уровень
            сложности. Таймер запустится после кнопки «Начать расследование».
          </p>
        </div>

        {backendKind() === 'local' && <OfflineBanner />}

        <form className="gate-form" onSubmit={submit}>
          <div className="query-part">
            <span>Позывной</span>
            <div className="nickname-row">
              <strong className="nickname" aria-live="polite">
                {nickname || 'Подбираем позывной...'}
              </strong>
              <button
                className="ghost-action"
                type="button"
                disabled={busy}
                onClick={() => rollNickname(nickname)}
              >
                <RefreshCw size={16} />
                Другой вариант
              </button>
            </div>
          </div>

          <div className="query-part">
            <span>Класс *</span>
            <div className="class-row">
              <div className="choice-row" role="radiogroup" aria-label="Класс">
                {GRADES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={grade === value}
                    className={`choice-chip ${grade === value ? 'selected' : ''}`}
                    onClick={() => chooseGrade(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <input
                className="answer-input letter-input"
                value={classLetter}
                onChange={(event) => setClassLetter(event.target.value.slice(-1).toUpperCase())}
                placeholder="Буква"
                aria-label="Буква класса (необязательно)"
              />
            </div>
          </div>

          <div className="query-part">
            <span>Уровень сложности</span>
            <div className="level-grid" role="radiogroup" aria-label="Уровень сложности">
              {LEVEL_IDS.filter((id) => !presetLevel || id === presetLevel).map((id) => (
                <LevelCard
                  key={id}
                  level={LEVELS[id]}
                  selected={level === id}
                  recommended={grade !== null && recommendedLevel(grade) === id}
                  onSelect={() => chooseLevel(id)}
                />
              ))}
            </div>
          </div>

          <div className="query-part">
            <span>Как играем</span>
            <div className="mode-grid" role="radiogroup" aria-label="Режим">
              <ModeCard
                icon={Hourglass}
                title="На время"
                selected={mode === 'timed'}
                onSelect={() => setMode('timed')}
                text={
                  level
                    ? `${minutesText(settings.timeLimits[level])} на все задания. Результат попадает в рейтинг.`
                    : 'Есть лимит времени. Результат попадает в рейтинг.'
                }
              />
              <ModeCard
                icon={Coffee}
                title="Просто так"
                selected={mode === 'practice'}
                onSelect={() => setMode('practice')}
                text="Без таймера и без рейтинга — для себя. Очки и разбор всё равно будут."
              />
            </div>
          </div>

          {error && (
            <p className="answer-feedback" role="alert">
              <XCircle size={16} />
              {error}
            </p>
          )}

          <button className="primary-action" type="submit" disabled={busy || !nickname || !grade || !level || !mode}>
            <Play size={18} />
            {busy ? 'Регистрируем...' : 'Начать расследование'}
          </button>
        </form>

        <ScoringRules scoring={scoring} />
      </section>
    </main>
  );
}

function LevelCard({ level, selected, recommended, onSelect }) {
  const Icon = LEVEL_ICONS[level.id];

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${level.name}: ${level.difficulty}, ${level.description}`}
      className={`level-card ${selected ? 'selected' : ''}`}
      onClick={onSelect}
    >
      <Icon size={26} />
      <strong>{level.name}</strong>
      <span className="level-difficulty">{level.difficulty}</span>
      <span>{level.description}</span>
      {recommended && <em>рекомендуем для вашего класса</em>}
    </button>
  );
}

export function OfflineBanner() {
  return (
    <p className="offline-banner">
      <CloudOff size={18} />
      <span>
        <strong>Автономный режим.</strong> Сервер квеста не найден, поэтому результаты сохраняются только в этом
        браузере. Таблица и выгрузка CSV — на странице рейтинга этого компьютера.
      </span>
    </p>
  );
}

function minutesText(minutes) {
  return `${minutes} ${plural(minutes, ['минута', 'минуты', 'минут'])}`;
}

function ModeCard({ icon: Icon, title, text, selected, onSelect }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${title}: ${text}`}
      className={`level-card ${selected ? 'selected' : ''}`}
      onClick={onSelect}
    >
      <Icon size={24} />
      <strong>{title}</strong>
      <span>{text}</span>
    </button>
  );
}

export function ScoringRules({ scoring }) {
  return (
    <div className="scoring-rules">
      <div className="panel-title">
        <Trophy size={16} />
        Как считаются очки
      </div>
      <ul>
        <li>
          <Star size={15} />
          <strong>+{scoring.perTask}</strong> за решённое задание
        </li>
        <li>
          <XCircle size={15} />
          <strong>−{scoring.perMistake}</strong> за неверный ответ
        </li>
        <li>
          <Lightbulb size={15} />
          <strong>−{scoring.perHint}</strong> за подсказку
        </li>
        <li>
          <Trophy size={15} />
          при равных очках выше тот, кто быстрее
        </li>
      </ul>
    </div>
  );
}
