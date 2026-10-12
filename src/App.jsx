import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Clock3,
  Code2,
  Database,
  GitBranch,
  Globe2,
  Hourglass,
  Lightbulb,
  LockKeyhole,
  LogOut,
  Network,
  Play,
  RotateCcw,
  ShieldAlert,
  TerminalSquare,
  Star,
  Trophy,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react';
import { LEVELS, LEVEL_IDS, MODULE_IDS, formatDuration } from '../shared/quest.js';
import { useNow } from './api.js';
import {
  NETWORK_FACTS,
  NETWORK_NODE_LABELS,
  SECURITY_ACTIONS,
  SECURITY_LOG,
  SECURITY_SIGNALS,
  byLevel,
  glossaryFor,
  hintsFor,
  storyFor,
} from './questContent.js';
import Registration from './Registration.jsx';
import { FinalResults } from './Results.jsx';
import { useQuestSession } from './useQuestSession.js';

// Тексты этапов лежат в questContent.js — отдельно для каждого уровня.
const modules = [
  {
    id: 'sql',
    label: 'SQL',
    icon: Database,
    accent: '#29f0c8',
    accentRgb: '41, 240, 200',
    component: SqlChallenge,
  },
  {
    id: 'python',
    label: 'Python',
    icon: Code2,
    accent: '#ffdd55',
    accentRgb: '255, 221, 85',
    component: PythonChallenge,
  },
  {
    id: 'security',
    label: 'Безопасность',
    icon: ShieldAlert,
    accent: '#ff5f9f',
    accentRgb: '255, 95, 159',
    component: SecurityChallenge,
  },
  {
    id: 'network',
    label: 'Сети',
    icon: Network,
    accent: '#6ea8ff',
    accentRgb: '110, 168, 255',
    component: NetworkChallenge,
  },
  {
    id: 'workflow',
    label: 'Git-процесс',
    icon: GitBranch,
    accent: '#b78cff',
    accentRgb: '183, 140, 255',
    component: WorkflowChallenge,
  },
];

if (modules.some((module, index) => module.id !== MODULE_IDS[index])) {
  throw new Error('Порядок модулей в App.jsx не совпадает с MODULE_IDS в shared/quest.js');
}

// Даёт заданиям текущего этапа доступ к уровню игрока, счетчику подсказок и штрафу из сессии.
const ChallengeContext = createContext({
  level: LEVELS.senior,
  moduleId: 'sql',
  hintsShown: 0,
  hintPenalty: 0,
  revealHint: () => {},
});

const logLines = [
  '[22:31] Орлов вошел в лабораторию',
  '[22:42] проверка хранилища не прошла',
  '[22:48] найден терминал B-14',
  '[22:49] контейнер NOVA-17 запущен',
  '[22:50] маршрут к AURORA частично стерт',
];

export default function App({ route = '' }) {
  const session = useQuestSession();

  if (session.status === 'loading') {
    return (
      <div className="boot-fallback">
        <strong>Подключение к серверу...</strong>
      </div>
    );
  }

  if (session.status === 'error') {
    return (
      <div className="boot-fallback">
        <strong>Нет связи с сервером квеста</strong>
        <span>Проверьте подключение к сети и что сервер запущен.</span>
        <button className="primary-action" onClick={session.reload}>
          <RotateCcw size={18} />
          Повторить
        </button>
      </div>
    );
  }

  if (!session.player) {
    return (
      <Registration onRegister={session.register} presetLevel={LEVEL_IDS.includes(route) ? route : null} />
    );
  }

  return <QuestGame key={session.player.id} session={session} />;
}

function QuestGame({ session }) {
  const { player, scoring, sendEvent } = session;
  const solved = player.solved;
  const level = LEVELS[player.level] ?? LEVELS.senior;
  const levelModules = useMemo(() => modules.filter((item) => level.modules.includes(item.id)), [level]);
  const [active, setActive] = useState(() => Math.min(solved.length, levelModules.length - 1));
  const [showBriefing, setShowBriefing] = useState(true);
  const [showResults, setShowResults] = useState(() => player.status !== 'playing');
  const [timedOut, setTimedOut] = useState(() => player.status === 'timeout');
  const deadline = player.timeLimitMs ? player.startedAt + player.timeLimitMs : null;
  const [readStories, setReadStories] = useState([]);

  const module = levelModules[active];
  const story = storyFor(module.id, level.id);
  const ModuleIcon = module.icon;
  const Challenge = module.component;
  const isSolved = solved.includes(module.id);
  const progress = Math.round((solved.length / levelModules.length) * 100);

  const unlocked = useMemo(() => {
    return levelModules.map((item, index) => index === 0 || solved.includes(levelModules[index - 1].id));
  }, [levelModules, solved]);

  const challengeContext = useMemo(
    () => ({
      level,
      moduleId: module.id,
      hintsShown: player.hints[module.id] ?? 0,
      hintPenalty: scoring.perHint,
      revealHint: () => sendEvent('hint', module.id),
    }),
    [level, module.id, player.hints, scoring.perHint, sendEvent],
  );

  function solveCurrent() {
    sendEvent('solve', module.id);

    if (active < levelModules.length - 1) {
      setActive(active + 1);
    }

    setShowBriefing(true);
  }

  function reportMistake() {
    sendEvent('mistake', module.id);
  }

  function goNext() {
    if (active < levelModules.length - 1) {
      setActive(active + 1);
      setShowBriefing(true);
    }
  }

  function switchTeam() {
    if (window.confirm('Выйти из сессии команды? Незавершенный результат останется в таблице, продолжить его будет нельзя.')) {
      session.logout();
    }
  }

  // Когда время вышло, задания закрываются и показываются итоги.
  useEffect(() => {
    if (!deadline || player.status !== 'playing') return undefined;
    const timerId = window.setTimeout(
      () => {
        setTimedOut(true);
        setShowResults(true);
        session.refresh();
      },
      Math.max(0, deadline - (Date.now() + session.clockOffset)),
    );
    return () => window.clearTimeout(timerId);
  }, [deadline, player.status, session]);

  const markStoryRead = useCallback((storyKey) => {
    setReadStories((items) => (items.includes(storyKey) ? items : [...items, storyKey]));
  }, []);

  let eyebrow = `Модуль ${active + 1} / ${levelModules.length}`;
  if (showResults) eyebrow = timedOut ? 'Время вышло' : 'Дело закрыто';

  return (
    <main className="app-shell" style={{ '--accent': module.accent, '--accent-rgb': module.accentRgb }}>
      <div className="scanlines" aria-hidden="true" />
      <aside className="side-rail">
        <div className="brand">
          <div className="brand-mark">
            <TerminalSquare size={23} />
          </div>
          <div>
            <p>Polytech Cyber Quest</p>
            <span>Комната расследования 07</span>
          </div>
        </div>

        <MissionStats session={session} onLogout={switchTeam} />

        <div className="progress-block">
          <div className="progress-head">
            <span>Расследование</span>
            <strong>{progress}%</strong>
          </div>
          <div className="progress-track">
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>

        <nav className="mission-nav" aria-label="Этапы квеста">
          {levelModules.map((item, index) => {
            const Icon = item.icon;
            const available = unlocked[index];
            const done = solved.includes(item.id);
            return (
              <button
                key={item.id}
                className={`nav-node ${active === index ? 'active' : ''} ${done ? 'done' : ''}`}
                disabled={!available || timedOut}
                onClick={() => {
                  setActive(index);
                  setShowBriefing(true);
                  setShowResults(false);
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                {done && <Check size={16} />}
              </button>
            );
          })}
        </nav>

        <div className="signal-panel">
          <div className="panel-title">
            <Globe2 size={16} />
            Журнал следов
          </div>
          {logLines.map((line) => (
            <code key={line}>{line}</code>
          ))}
        </div>
      </aside>

      <section className="stage">
        <header className="stage-header">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h1>{showResults ? 'Итоги расследования' : story.title}</h1>
          </div>
          <div className="module-token">
            {showResults ? <Trophy size={24} /> : <ModuleIcon size={24} />}
            <span>{showResults ? 'Результат' : module.label}</span>
          </div>
        </header>

        {showResults ? (
          <FinalResults
            player={player}
            scoring={scoring}
            offline={session.offline}
            onNewTeam={session.logout}
          />
        ) : showBriefing ? (
          <StoryInterlude
            key={`${module.id}-${isSolved ? 'outcome' : 'intro'}`}
            moduleId={module.id}
            story={story}
            isSolved={isSolved}
            isFinal={active === levelModules.length - 1}
            hasPlayed={readStories.includes(`${module.id}-${isSolved ? 'outcome' : 'intro'}`)}
            onRead={markStoryRead}
            onStart={() => setShowBriefing(false)}
            onNext={goNext}
            onFinish={() => setShowResults(true)}
          />
        ) : (
          <ChallengeFrame solved={isSolved} onBrief={() => setShowBriefing(true)}>
            <ChallengeContext.Provider value={challengeContext}>
              <Challenge onSolve={solveCurrent} onMistake={reportMistake} solved={isSolved} />
            </ChallengeContext.Provider>
          </ChallengeFrame>
        )}
      </section>
    </main>
  );
}

// Таймер и счетчики команды в боковой панели; перерисовывается раз в секунду отдельно от квеста.
function MissionStats({ session, onLogout }) {
  const { player, clockOffset, offline } = session;
  const now = useNow() + clockOffset;
  const elapsed = player.status === 'playing' ? now - player.startedAt : player.elapsedMs;
  // В режиме «на время» показываем, сколько осталось, иначе — сколько прошло.
  const remaining = player.timeLimitMs ? Math.max(0, player.timeLimitMs - elapsed) : null;

  return (
    <div className="mission-stats">
      <div className="mission-team">
        <strong title={player.team}>{player.team}</strong>
        <button className="icon-action" title="Сменить команду" onClick={onLogout}>
          <LogOut size={16} />
        </button>
      </div>
      <span className="mission-level">
        «{LEVELS[player.level]?.name}» · {player.className} класс ·{' '}
        {player.mode === 'timed' ? 'на время' : 'просто так'}
      </span>
      <div className="stat-row">
        <span title="Очки">
          <Star size={15} />
          {player.score.total}
        </span>
        {remaining === null ? (
          <span title="Прошло времени">
            <Clock3 size={15} />
            {formatDuration(elapsed)}
          </span>
        ) : (
          <span title="Осталось времени" className={remaining < 2 * 60000 ? 'time-warning' : ''}>
            <Hourglass size={15} />
            {formatDuration(remaining)}
          </span>
        )}
        <span title="Ошибки">
          <XCircle size={15} />
          {player.totalMistakes}
        </span>
        <span title="Подсказки">
          <Lightbulb size={15} />
          {player.totalHints}
        </span>
      </div>
      {offline && (
        <span className="offline-note">
          <WifiOff size={14} />
          Нет связи с сервером, повторяем...
        </span>
      )}
    </div>
  );
}

function StoryInterlude({ moduleId, story, isSolved, isFinal, hasPlayed, onRead, onStart, onNext, onFinish }) {
  const storyKey = `${moduleId}-${isSolved ? 'outcome' : 'intro'}`;
  const storyText = isSolved ? story.outcome : story.intro;
  const paragraphs = useMemo(() => splitStory(storyText), [storyText]);
  const [typedParagraphs, setTypedParagraphs] = useState(() =>
    hasPlayed ? paragraphs : paragraphs.map(() => ''),
  );
  const isComplete = paragraphs.every((paragraph, index) => typedParagraphs[index] === paragraph);

  useEffect(() => {
    if (hasPlayed) {
      setTypedParagraphs(paragraphs);
      return undefined;
    }

    setTypedParagraphs(paragraphs.map(() => ''));
    const paragraphChars = paragraphs.map((paragraph) => Array.from(paragraph));
    let paragraphIndex = 0;
    let charIndex = 0;
    let timerId;

    const typeNext = () => {
      if (paragraphIndex >= paragraphs.length) {
        onRead(storyKey);
        return;
      }

      const currentChars = paragraphChars[paragraphIndex];

      if (charIndex < currentChars.length) {
        charIndex += 1;
        setTypedParagraphs((items) => {
          const next = [...items];
          next[paragraphIndex] = currentChars.slice(0, charIndex).join('');
          return next;
        });
        timerId = window.setTimeout(typeNext, 22);
        return;
      }

      paragraphIndex += 1;
      charIndex = 0;

      if (paragraphIndex >= paragraphs.length) {
        onRead(storyKey);
        return;
      }

      timerId = window.setTimeout(typeNext, 2500);
    };

    timerId = window.setTimeout(typeNext, 650);
    return () => window.clearTimeout(timerId);
  }, [hasPlayed, onRead, paragraphs, storyKey]);

  return (
    <div className="story-screen">
      <div className="story-copy console-story">
        <span className="transmission">Брифинг дела</span>
        <div className="console-lines" aria-live="polite">
          {typedParagraphs.map((paragraph, index) =>
            paragraph ? (
              <p key={`${storyKey}-${index}`}>
                <span>&gt;</span>
                {paragraph}
              </p>
            ) : null,
          )}
          {!isComplete && (
            <p className="console-wait">
              <span>&gt;</span>
              <i>печать сообщения...</i>
            </p>
          )}
        </div>
      </div>
      <div className="story-actions">
        {!isSolved && (
          <button className="primary-action" disabled={!isComplete} onClick={onStart}>
            <Play size={18} />
            {isComplete ? 'Открыть задание' : 'Ожидайте брифинг'}
          </button>
        )}
        {isSolved && !isFinal && (
          <button className="primary-action" disabled={!isComplete} onClick={onNext}>
            Следующий след
            <ChevronRight size={18} />
          </button>
        )}
        {isSolved && isFinal && (
          <button className="primary-action" disabled={!isComplete} onClick={onFinish}>
            <Trophy size={18} />
            Подвести итоги
          </button>
        )}
      </div>
    </div>
  );
}

function splitStory(text) {
  return text
    .split('\n\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function ChallengeFrame({ solved, onBrief, children }) {
  return (
    <div className="challenge-frame">
      <div className="challenge-topline">
        <span>{solved ? 'Улика подтверждена' : 'Активная задача'}</span>
        <button className="ghost-action" onClick={onBrief}>
          Вернуться к брифингу
        </button>
      </div>
      {children}
    </div>
  );
}

function HintPanel() {
  const { level, moduleId, hintsShown, hintPenalty, revealHint } = useContext(ChallengeContext);
  const hints = hintsFor(moduleId, level.id).slice(0, level.hintLimit);
  const visibleCount = Math.min(hintsShown, hints.length);
  const canReveal = visibleCount < hints.length;

  return (
    <aside className="hint-dock" aria-label="Подсказки">
      <button className="hint-trigger" disabled={!canReveal} onClick={revealHint}>
        <AlertTriangle size={16} />
        {canReveal
          ? `Подсказка ${visibleCount}/${hints.length} · −${hintPenalty} баллов`
          : 'Все подсказки открыты'}
      </button>
      {visibleCount > 0 && (
        <div className="hint-stack">
          {hints.slice(0, visibleCount).map((hint, index) => (
            <p key={hint}>
              <strong>{index + 1}</strong>
              {hint}
            </p>
          ))}
        </div>
      )}
    </aside>
  );
}

// Проверка ответа: верный — засчитываем этап, неверный — ошибка.
// Один и тот же неверный вариант повторно не штрафуется (например, при двойном клике).
function useAnswerCheck(onSolve, onMistake) {
  const [feedback, setFeedback] = useState(null);
  const checkedWrong = useRef(new Set());

  function check(isCorrect, signature) {
    if (isCorrect) {
      setFeedback(null);
      onSolve();
      return;
    }

    const repeated = checkedWrong.current.has(signature);
    if (!repeated) {
      checkedWrong.current.add(signature);
      onMistake();
    }
    setFeedback({ id: Date.now(), repeated });
  }

  return [feedback, check];
}

function AnswerFeedback({ feedback }) {
  if (!feedback) return null;

  return (
    <p key={feedback.id} className="answer-feedback" role="alert">
      <XCircle size={16} />
      {feedback.repeated
        ? 'Этот вариант уже проверяли — он не подходит.'
        : 'Улика не сходится. Ошибка записана в протокол.'}
    </p>
  );
}

function SqlChallenge({ onSolve, onMistake, solved }) {
  const [feedback, check] = useAnswerCheck(onSolve, onMistake);
  const [query, setQuery] = useState({
    select: '*',
    where: "user_id = 'guest'",
    order: 'ts ASC',
    limit: '10',
  });
  const correct =
    query.select === 'room, terminal' &&
    query.where === "user_id = 'orlov'" &&
    query.order === 'ts DESC' &&
    query.limit === '1';

  const sourceRows = [
    { time: '22:31:08', user: 'orlov', room: 'Лаборатория 3', terminal: 'A-02', action: 'вход в систему', status: 'ok' },
    { time: '22:48:03', user: 'orlov', room: 'Серверная C', terminal: 'B-14', action: 'последний вход', status: 'ok' },
    { time: '22:51:44', user: 'guest', room: 'Коворкинг', terminal: 'K-09', action: 'таймер пропуска', status: 'timeout' },
  ];

  const rows = sourceRows
    .filter((row) => {
      if (query.where === "user_id = 'orlov'") return row.user === 'orlov';
      if (query.where === "user_id = 'guest'") return row.user === 'guest';
      if (query.where === "room = 'lobby'") return row.room === 'Лобби';
      if (query.where === "status = 'ok'") return row.status === 'ok';
      return true;
    })
    .sort((a, b) => {
      if (query.order === 'ts DESC') return b.time.localeCompare(a.time);
      if (query.order === 'ts ASC') return a.time.localeCompare(b.time);
      if (query.order === 'room ASC') return a.room.localeCompare(b.room);
      if (query.order === 'event DESC') return b.action.localeCompare(a.action);
      return 0;
    })
    .slice(0, Number(query.limit));
  const previewColumns = {
    '*': [
      ['time', 'время'],
      ['user', 'пользователь'],
      ['room', 'место'],
      ['terminal', 'терминал'],
      ['action', 'действие'],
      ['status', 'статус'],
    ],
    'event, badge_id': [
      ['action', 'событие'],
      ['terminal', 'badge_id'],
    ],
    'room, terminal': [
      ['room', 'место'],
      ['terminal', 'терминал'],
    ],
    'user_id, status': [
      ['user', 'user_id'],
      ['status', 'статус'],
    ],
  }[query.select];

  return (
    <div className="two-column challenge-area">
      <HintPanel />
      <div className="workbench">
        <h2>Соберите запрос к журналу</h2>
        <div className="query-builder">
          <QuerySelect
            label="Какие поля показать"
            value={query.select}
            options={['*', 'event, badge_id', 'room, terminal', 'user_id, status']}
            onChange={(value) => setQuery({ ...query, select: value })}
          />
          <QuerySelect
            label="Кого ищем"
            value={query.where}
            options={["user_id = 'guest'", "user_id = 'orlov'", "room = 'lobby'", "status = 'ok'"]}
            onChange={(value) => setQuery({ ...query, where: value })}
          />
          <QuerySelect
            label="Порядок записей"
            value={query.order}
            options={['ts ASC', 'room ASC', 'ts DESC', 'event DESC']}
            onChange={(value) => setQuery({ ...query, order: value })}
          />
          <QuerySelect
            label="Сколько строк"
            value={query.limit}
            options={['10', '3', '1', '0']}
            onChange={(value) => setQuery({ ...query, limit: value })}
          />
        </div>
        <pre className="code-window">{`SELECT ${query.select}
FROM access_log
WHERE ${query.where}
ORDER BY ${query.order}
LIMIT ${query.limit};`}</pre>
        <Glossary moduleId="sql" />
        <button
          className="primary-action"
          disabled={solved}
          onClick={() => check(correct, Object.values(query).join('|'))}
        >
          <Database size={18} />
          Подтвердить улику
        </button>
        <AnswerFeedback feedback={feedback} />
      </div>

      <div className="data-table">
        <div className="panel-title">Предпросмотр результата</div>
        <table>
          <thead>
            <tr>
              {previewColumns.map(([key, label]) => (
                <th key={key}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.time}-${row.terminal}`}>
                {previewColumns.map(([key]) => (
                  <td key={key}>{row[key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Варианты — строки или объекты { value, label }, если подпись должна отличаться от значения.
function QuerySelect({ label, value, options, onChange }) {
  const items = options.map((option) => (typeof option === 'string' ? { value: option, label: option } : option));

  return (
    <label className="query-part">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {!items.some((item) => item.value === value) && (
          <option value={value} disabled>
            Выберите вариант
          </option>
        )}
        {items.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// Памятка к заданию; на уровне без памяток не показывается.
function Glossary({ moduleId }) {
  const { level } = useContext(ChallengeContext);
  const items = level.glossary ? glossaryFor(moduleId, level.id) : [];
  if (items.length === 0) return null;

  return (
    <div className="rule-note">
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}

function PythonChallenge({ onSolve, onMistake, solved }) {
  const [feedback, check] = useAnswerCheck(onSolve, onMistake);
  const [condition, setCondition] = useState('if "INFO" in line:');
  const [extractor, setExtractor] = useState("line.split('msg=')[1]");
  const [joiner, setJoiner] = useState("''.join(parts)");
  const [answer, setAnswer] = useState('');
  const parserOk =
    condition === 'if "TRACE" in line:' &&
    extractor === "line.split('code=')[1]" &&
    joiner === "'-'.join(parts)";
  const decoded = parserOk ? 'NOVA-17' : 'не найдено';
  const correct = parserOk && answer.trim().toUpperCase() === 'NOVA-17';

  return (
    <div className="two-column challenge-area">
      <HintPanel />
      <div className="workbench">
        <h2>Восстановите парсер логов</h2>
        <pre className="code-window">{`logs = [
    "22:48 INFO msg=terminal B-14",
    "22:49 TRACE code=NOVA",
    "22:49 DEBUG code=TEST",
    "22:50 TRACE code=17",
]

parts = []
for line in logs:
    ${condition}
        parts.append(${extractor})

print(${joiner})`}</pre>
        <div className="control-grid">
          <QuerySelect
            label="Какие строки брать"
            value={condition}
            options={['if "INFO" in line:', 'if "TRACE" in line:', 'if "DEBUG" in line:', 'if "terminal" in line:']}
            onChange={setCondition}
          />
          <QuerySelect
            label="Как достать код"
            value={extractor}
            options={["line.split('msg=')[1]", "line.split('code=')[1]", 'line[:5]', 'line.lower()']}
            onChange={setExtractor}
          />
        </div>
        <QuerySelect
          label="Как склеить части"
          value={joiner}
          options={["''.join(parts)", "'-'.join(parts)", "','.join(parts)", "' '.join(parts)"]}
          onChange={setJoiner}
        />
        <Glossary moduleId="python" />
        <div className="terminal-output">
          <span>Вывод программы</span>
          <strong>{decoded}</strong>
        </div>
      </div>
      <div className="workbench">
        <h2>Введите найденную метку</h2>
        <input
          className="answer-input"
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder="Введите текст..."
        />
        <button
          className="primary-action"
          disabled={!answer.trim() || solved}
          onClick={() => check(correct, [condition, extractor, joiner, answer.trim().toUpperCase()].join('|'))}
        >
          <Code2 size={18} />
          Записать в дело
        </button>
        <AnswerFeedback feedback={feedback} />
      </div>
    </div>
  );
}

function SecurityChallenge({ onSolve, onMistake, solved }) {
  const [feedback, check] = useAnswerCheck(onSolve, onMistake);
  const { level } = useContext(ChallengeContext);
  const mailSignals = byLevel(SECURITY_SIGNALS, level.id);
  const dangerousSignals = mailSignals.filter((signal) => signal.danger).map((signal) => signal.label);
  const [selected, setSelected] = useState([]);
  const [action, setAction] = useState('delete');
  const correct =
    selected.length === dangerousSignals.length &&
    selected.every((item) => dangerousSignals.includes(item)) &&
    action === 'quarantine';

  function toggle(flag) {
    setSelected((items) => (items.includes(flag) ? items.filter((item) => item !== flag) : [...items, flag]));
  }

  return (
    <div className="two-column challenge-area">
      <HintPanel />
      <div className="mail-view">
        <div className="mail-header">
          <LockKeyhole size={18} />
          <span>security@politech-login.ru</span>
        </div>
        <h2>Срочная проверка доступа</h2>
        <p>
          Уважаемый разработчик, ваш аккаунт будет заблокирован через 15 минут. Откройте вложение
          access_fix.zip и подтвердите доступ. Пароль архива: 8841.
        </p>
        <div className="attachment">
          <AlertTriangle size={18} />
          access_fix.zip
        </div>
        <div className="mini-log">
          {byLevel(SECURITY_LOG, level.id).map((line) => (
            <code key={line}>{line}</code>
          ))}
        </div>
      </div>
      <div className="workbench">
        <h2>Отметьте признаки фишинга</h2>
        <div className="flag-list">
          {mailSignals.map((signal) => (
            <button
              key={signal.label}
              className={`flag-button ${selected.includes(signal.label) ? 'selected' : ''}`}
              onClick={() => toggle(signal.label)}
            >
              {selected.includes(signal.label) && <b className="pick-order">{selected.indexOf(signal.label) + 1}</b>}
              {selected.includes(signal.label) ? <Check size={16} /> : <X size={16} />}
              {signal.label}
            </button>
          ))}
        </div>
        <QuerySelect
          label="Что делать с письмом"
          value={action}
          options={byLevel(SECURITY_ACTIONS, level.id)}
          onChange={setAction}
        />
        <Glossary moduleId="security" />
        <button
          className="primary-action"
          disabled={selected.length === 0 || solved}
          onClick={() => check(correct, [...selected].sort().join('|') + `|${action}`)}
        >
          <ShieldAlert size={18} />
          Закрыть инцидент
        </button>
        <AnswerFeedback feedback={feedback} />
      </div>
    </div>
  );
}

function NetworkChallenge({ onSolve, onMistake, solved }) {
  const [feedback, check] = useAnswerCheck(onSolve, onMistake);
  const { level } = useContext(ChallengeContext);
  const nodeLabels = NETWORK_NODE_LABELS[level.id] ?? {};
  const labelOf = (node) => nodeLabels[node] ?? node;
  const nodes = ['ЛАБ-07', 'Коммутатор 2 этажа', 'Главный маршрутизатор', 'Защитный экран', 'AURORA'];
  const nodeLayout = {
    'ЛАБ-07': { x: '8%', y: '58%' },
    'Коммутатор 2 этажа': { x: '62%', y: '14%' },
    'Главный маршрутизатор': { x: '34%', y: '42%' },
    'Защитный экран': { x: '16%', y: '20%' },
    AURORA: { x: '76%', y: '62%' },
  };
  const correctRoute = nodes.join('>');
  const [route, setRoute] = useState([]);
  const correct = route.join('>') === correctRoute;

  function pick(node) {
    if (route.includes(node)) return;
    setRoute([...route, node]);
  }

  return (
    <div className="network-layout challenge-area">
      <HintPanel />
      <div className="topology">
        {nodes.map((node) => {
          const pickIndex = route.indexOf(node);
          return (
          <button
            key={node}
            className={`node ${route.includes(node) ? 'picked' : ''}`}
            onClick={() => pick(node)}
            style={{ left: nodeLayout[node].x, top: nodeLayout[node].y }}
          >
            {pickIndex >= 0 && <b className="pick-order">{pickIndex + 1}</b>}
            <Network size={22} />
            <span>{labelOf(node)}</span>
          </button>
          );
        })}
      </div>
      <div className="workbench">
        <h2>Собранный маршрут</h2>
        <div className="route-strip">
          {route.length === 0 && <span className="muted">Ожидаем первый узел</span>}
          {route.map((node, index) => (
            <span key={node}>
              {labelOf(node)}
              {index < route.length - 1 && <ChevronRight size={16} />}
            </span>
          ))}
        </div>
        <div className="hint-grid">
          {byLevel(NETWORK_FACTS, level.id).map((fact) => (
            <code key={fact}>{fact}</code>
          ))}
        </div>
        <Glossary moduleId="network" />
        <div className="action-row">
          <button className="ghost-action" onClick={() => setRoute([])}>
            <RotateCcw size={16} />
            Сбросить
          </button>
          <button
            className="primary-action"
            disabled={route.length !== nodes.length || solved}
            onClick={() => check(correct, route.join('>'))}
          >
            <Network size={18} />
            Восстановить маршрут
          </button>
        </div>
        <AnswerFeedback feedback={feedback} />
      </div>
    </div>
  );
}

function WorkflowChallenge({ onSolve, onMistake, solved }) {
  const [feedback, check] = useAnswerCheck(onSolve, onMistake);
  const steps = [
    'Создать задачу: проверить NOVA-17',
    'Создать отдельную ветку',
    'Сделать коммит с изменением',
    'Запустить проверку тестами',
    'Отправить на ревью',
    'Исправить замечание ревью',
    'Слить изменение в main',
  ];
  const [selected, setSelected] = useState([]);
  const [review, setReview] = useState('');
  const correctOrder = selected.length === steps.length && selected.every((step, index) => step === steps[index]);
  const correct = correctOrder && review === 'remove-secret';

  function choose(step) {
    if (selected.includes(step)) return;
    setSelected([...selected, step]);
  }

  return (
    <div className="two-column challenge-area">
      <HintPanel />
      <div className="workbench">
        <h2>Разложите рабочий процесс по порядку</h2>
        <div className="step-pool">
          {steps
            .slice()
            .sort((a, b) => a.length - b.length)
            .map((step) => (
              <button
                key={step}
                className={`step-chip ${selected.includes(step) ? 'used' : ''}`}
                onClick={() => choose(step)}
              >
                {step}
              </button>
            ))}
        </div>
        <button className="ghost-action" onClick={() => setSelected([])}>
          <RotateCcw size={16} />
          Начать заново
        </button>
      </div>
      <div className="workbench">
        <h2>Цепочка действий</h2>
        <ol className="pipeline">
          {selected.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <pre className="code-window">{`Изменение в файле config/nova.env:
+ AURORA_TOKEN="9x7-real-token"
+ TRACE_MODE="restore"`}</pre>
        <QuerySelect
          label="Решение ревью"
          value={review}
          options={['approve-now', 'remove-secret', 'skip-tests', 'commit-to-main']}
          onChange={setReview}
        />
        <Glossary moduleId="workflow" />
        <button
          className="primary-action"
          disabled={selected.length !== steps.length || !review || solved}
          onClick={() => check(correct, `${selected.join('|')}|${review}`)}
        >
          <GitBranch size={18} />
          Выполнить слияние
        </button>
        <AnswerFeedback feedback={feedback} />
      </div>
    </div>
  );
}
