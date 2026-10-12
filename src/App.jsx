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
  Lightbulb,
  LockKeyhole,
  LogOut,
  Network,
  Play,
  RotateCcw,
  ShieldAlert,
  TerminalSquare,
  Trophy,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react';
import { MODULE_IDS, formatDuration } from '../shared/quest.js';
import { useNow } from './api.js';
import Registration from './Registration.jsx';
import { FinalResults } from './Results.jsx';
import { useQuestSession } from './useQuestSession.js';

const modules = [
  {
    id: 'sql',
    label: 'SQL',
    title: 'След в журнале доступа',
    icon: Database,
    accent: '#29f0c8',
    accentRgb: '41, 240, 200',
    intro:
      'На мониторе Орлова открыт журнал посещений.\n\nВ нем перемешаны записи разных людей и разных терминалов.\n\nКоманде нужно восстановить последнюю точку, где Орлов оставил цифровой след.',
    outcome:
      'Журнал показывает: 22:48, серверная C, терминал B-14.\n\nЗначит, Орлов не покинул вуз. Он спустился туда, где стоит экспериментальный контур проекта.',
    component: SqlChallenge,
  },
  {
    id: 'python',
    label: 'Python',
    title: 'Парсер логов',
    icon: Code2,
    accent: '#ffdd55',
    accentRgb: '255, 221, 85',
    intro:
      'На диске терминала найден Python-скрипт Орлова.\n\nСкрипт просматривал служебные логи и собирал из них имя контейнера.\n\nЧасть строк стерта, но по выводу видно: именно этот скрипт должен привести команду к следующей улике.',
    outcome:
      'Парсер собирает метку NOVA-17.\n\nЭто имя контейнера, который запустился за минуту до исчезновения.',
    component: PythonChallenge,
  },
  {
    id: 'security',
    label: 'Безопасность',
    title: 'Подозрительное письмо',
    icon: ShieldAlert,
    accent: '#ff5f9f',
    accentRgb: '255, 95, 159',
    intro:
      'Перед запуском NOVA-17 Орлов получил письмо якобы от службы безопасности.\n\nПисьмо выглядит правдоподобно, но в журнале рядом с ним есть странные события.\n\nКоманде нужно решить, было ли письмо обычным уведомлением или частью атаки.',
    outcome:
      'Письмо оказалось фишингом.\n\nНо Орлов открыл его не случайно: он запускал вложение в изолированной среде, чтобы поймать отправителя.',
    component: SecurityChallenge,
  },
  {
    id: 'network',
    label: 'Сети',
    title: 'Маршрут сигнала',
    icon: Network,
    accent: '#6ea8ff',
    accentRgb: '110, 168, 255',
    intro:
      'После письма из лаборатории ушел короткий сетевой сигнал.\n\nОн не похож на обычную загрузку файла или вход в почту.\n\nВ сетевом журнале остались названия узлов, но порядок маршрута стерся.',
    outcome:
      'Сигнал ушел не в интернет, а во внутренний архивный кластер AURORA.\n\nСлед ведет к эксперименту внутри кампуса.',
    component: NetworkChallenge,
  },
  {
    id: 'workflow',
    label: 'Git-процесс',
    title: 'След в командной разработке',
    icon: GitBranch,
    accent: '#b78cff',
    accentRgb: '183, 140, 255',
    intro:
      'На AURORA найден репозиторий с последним изменением Орлова.\n\nВ истории проекта есть след, который может открыть финальный лог.\n\nНо доступ к нему появится только после восстановления рабочего процесса команды.',
    outcome:
      'Финальный лог открыт: Орлов не исчез.\n\nОн перенес рабочую среду в изолированный контур, чтобы остановить утечку.\n\nТеперь его можно вернуть аварийным протоколом.',
    component: WorkflowChallenge,
  },
];

if (modules.some((module, index) => module.id !== MODULE_IDS[index])) {
  throw new Error('Порядок модулей в App.jsx не совпадает с MODULE_IDS в shared/quest.js');
}

// Даёт подсказкам текущего этапа доступ к счетчику и штрафу из сессии.
const ChallengeContext = createContext({ hintsShown: 0, hintPenalty: 0, revealHint: () => {} });

const logLines = [
  '[22:31] Орлов вошел в лабораторию',
  '[22:42] проверка хранилища не прошла',
  '[22:48] найден терминал B-14',
  '[22:49] контейнер NOVA-17 запущен',
  '[22:50] маршрут к AURORA частично стерт',
];

export default function App() {
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
    return <Registration onRegister={session.register} />;
  }

  return <QuestGame key={session.player.id} session={session} />;
}

function QuestGame({ session }) {
  const { player, scoring, sendEvent } = session;
  const solved = player.solved;
  const [active, setActive] = useState(() => Math.min(solved.length, modules.length - 1));
  const [showBriefing, setShowBriefing] = useState(true);
  const [showResults, setShowResults] = useState(() => Boolean(player.finishedAt));
  const [readStories, setReadStories] = useState([]);

  const module = modules[active];
  const ModuleIcon = module.icon;
  const Challenge = module.component;
  const isSolved = solved.includes(module.id);
  const progress = Math.round((solved.length / modules.length) * 100);

  const unlocked = useMemo(() => {
    return modules.map((item, index) => index === 0 || solved.includes(modules[index - 1].id));
  }, [solved]);

  const challengeContext = useMemo(
    () => ({
      hintsShown: player.hints[module.id] ?? 0,
      hintPenalty: scoring.perHint,
      revealHint: () => sendEvent('hint', module.id),
    }),
    [module.id, player.hints, scoring.perHint, sendEvent],
  );

  function solveCurrent() {
    sendEvent('solve', module.id);

    if (active < modules.length - 1) {
      setActive(active + 1);
    }

    setShowBriefing(true);
  }

  function reportMistake() {
    sendEvent('mistake', module.id);
  }

  function goNext() {
    if (active < modules.length - 1) {
      setActive(active + 1);
      setShowBriefing(true);
    }
  }

  function switchTeam() {
    if (window.confirm('Выйти из сессии команды? Незавершенный результат останется в таблице, продолжить его будет нельзя.')) {
      session.logout();
    }
  }

  const markStoryRead = useCallback((storyKey) => {
    setReadStories((items) => (items.includes(storyKey) ? items : [...items, storyKey]));
  }, []);

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
          {modules.map((item, index) => {
            const Icon = item.icon;
            const available = unlocked[index];
            const done = solved.includes(item.id);
            return (
              <button
                key={item.id}
                className={`nav-node ${active === index ? 'active' : ''} ${done ? 'done' : ''}`}
                disabled={!available}
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
            <span className="eyebrow">{showResults ? 'Дело закрыто' : `Модуль ${active + 1} / ${modules.length}`}</span>
            <h1>{showResults ? 'Итоги расследования' : module.title}</h1>
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
            module={module}
            isSolved={isSolved}
            isFinal={active === modules.length - 1}
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
  const elapsed = player.finishedAt ? player.elapsedMs : now - player.startedAt;

  return (
    <div className="mission-stats">
      <div className="mission-team">
        <strong title={player.team}>{player.team}</strong>
        <button className="icon-action" title="Сменить команду" onClick={onLogout}>
          <LogOut size={16} />
        </button>
      </div>
      <div className="stat-row">
        <span title="Время">
          <Clock3 size={15} />
          {formatDuration(elapsed)}
        </span>
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

function StoryInterlude({ module, isSolved, isFinal, hasPlayed, onRead, onStart, onNext, onFinish }) {
  const storyKey = `${module.id}-${isSolved ? 'outcome' : 'intro'}`;
  const storyText = isSolved ? module.outcome : module.intro;
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

function HintPanel({ hints }) {
  const { hintsShown, hintPenalty, revealHint } = useContext(ChallengeContext);
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
      <HintPanel
        hints={[
          'Нужно узнать только место и терминал Орлова.',
          'В поле "Кого ищем" выберите пользователя orlov.',
          'Новые записи должны быть сверху, а строка нужна только одна.',
        ]}
      />
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

function QuerySelect({ label, value, options, onChange }) {
  return (
    <label className="query-part">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {!options.includes(value) && (
          <option value={value} disabled>
            Выберите вариант
          </option>
        )}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
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
      <HintPanel
        hints={[
          'Нужные строки в журнале помечены словом TRACE.',
          'Кусок метки стоит после code=.',
          'В результате должны получиться две части: NOVA и 17.',
          'Части нужно соединить через дефис.',
        ]}
      />
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
        <div className="rule-note">
          <span>TRACE: строки служебной трассировки</span>
          <span>code=: место, где спрятана часть метки</span>
          <span>parts: список найденных кусочков</span>
          <span>join: склеивает список в строку</span>
        </div>
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
  const mailSignals = [
    { label: 'В теме письма есть номер обращения', danger: false },
    { label: 'Письмо пугает блокировкой через 15 минут', danger: true },
    { label: 'В подписи указана должность сотрудника', danger: false },
    { label: 'Адрес отправителя похож на настоящий, но написан с ошибкой', danger: true },
    { label: 'Письмо начинается с вежливого обращения', danger: false },
    { label: 'После письма был вход с незнакомого IP-адреса', danger: true },
    { label: 'Нужно открыть архив с паролем из письма', danger: true },
    { label: 'В письме есть вложение access_fix.zip', danger: true },
  ];
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
      <HintPanel
        hints={[
          'Сравните адрес отправителя с настоящим адресом вуза.',
          'Срочность и угрозы блокировки часто используют в фишинге.',
          'Вложение, которое просят срочно открыть, выглядит опасно.',
          'Не все солидно выглядящие детали являются признаком атаки: подпись и номер обращения можно подделать.',
          'После отметок выберите quarantine.',
        ]}
      />
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
          <code>22:49:07 вход с IP 185.17.44.9</code>
          <code>22:49:21 запущена изолированная среда</code>
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
          options={['delete', 'forward', 'quarantine', 'reply']}
          onChange={setAction}
        />
        <div className="rule-note">
          <span>delete: просто удалить</span>
          <span>forward: переслать коллеге</span>
          <span>quarantine: изолировать для анализа</span>
          <span>reply: ответить отправителю</span>
        </div>
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
      <HintPanel
        hints={[
          'Маршрут начинается с компьютера в лаборатории.',
          'После компьютера сигнал обычно идет в коммутатор этажа.',
          'Дальше идут главный маршрутизатор и защитный экран.',
          'Последняя точка маршрута - AURORA.',
        ]}
      />
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
            <span>{node}</span>
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
              {node}
              {index < route.length - 1 && <ChevronRight size={16} />}
            </span>
          ))}
        </div>
        <div className="hint-grid">
          <code>Шагов в маршруте: 5</code>
          <code>Сегмент: лаборатория</code>
          <code>Адрес цели: 10.17.0.77</code>
          <code>Правило: только внутри кампуса</code>
        </div>
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
      <HintPanel
        hints={[
          'Git - это журнал версий проекта. Он хранит историю изменений.',
          'Коммит - сохраненная точка в истории: небольшой законченный кусок работы.',
          'Обычно сначала создают задачу, потом ветку, потом коммит и тесты.',
          'После тестов изменение отправляют на ревью, исправляют замечания и только потом сливают.',
          'Настоящий токен нельзя хранить в коде. На ревью выберите remove-secret.',
        ]}
      />
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
        <div className="rule-note">
          <span>approve-now: сразу одобрить</span>
          <span>remove-secret: убрать секрет из кода</span>
          <span>skip-tests: пропустить тесты</span>
          <span>commit-to-main: писать сразу в main</span>
        </div>
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
