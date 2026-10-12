import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Download,
  KeyRound,
  Lightbulb,
  Medal,
  RotateCcw,
  Star,
  TerminalSquare,
  Trash2,
  UserRound,
  XCircle,
} from 'lucide-react';
import { DEFAULT_SETTINGS, LEVELS, LEVEL_IDS, STATUS_LABELS, formatDuration } from '../shared/quest.js';
import { backendKind, request, useNow } from './api.js';
import { LEVEL_ICONS, OfflineBanner, ScoringRules } from './Registration.jsx';
import { Review } from './Review.jsx';
import { routeHref } from './routes.js';

const ADMIN_KEY_STORAGE = 'polytech-quest-admin-key';

function useLeaderboard(intervalMs = 5000) {
  const [board, setBoard] = useState(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const data = await request('/api/leaderboard');
      setBoard(data);
      setClockOffset(data.now - Date.now());
      setError('');
    } catch (refreshError) {
      setError(refreshError.message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timerId = window.setInterval(refresh, intervalMs);
    return () => window.clearInterval(timerId);
  }, [intervalMs, refresh]);

  return { board, clockOffset, error, refresh };
}

function levelRows(board, levelId) {
  return board?.levels.find((item) => item.id === levelId)?.rows ?? [];
}

function practiceCount(board, levelId) {
  return board?.levels.find((item) => item.id === levelId)?.practice.length ?? 0;
}

function resultLine(player, level, offline) {
  if (player.status === 'playing') {
    return offline ? 'Нет связи с сервером. Результат отправится автоматически...' : 'Подсчитываем результат...';
  }
  if (player.mode === 'practice') return 'очков · игра для себя, в рейтинг не идёт';
  return `очков · ${player.place} место на уровне «${level.name}»`;
}

export function ScoreBreakdown({ player, scoring }) {
  const { score } = player;

  return (
    <dl className="score-breakdown">
      <div>
        <dt>
          <Star size={16} /> Решено заданий: {player.solved.length} из {player.modules.length}
        </dt>
        <dd>+{score.taskPoints}</dd>
      </div>
      <div>
        <dt>
          <XCircle size={16} /> Ошибки: {player.totalMistakes} × {scoring.perMistake}
        </dt>
        <dd>−{score.mistakePenalty}</dd>
      </div>
      <div>
        <dt>
          <Lightbulb size={16} /> Подсказки: {player.totalHints} × {scoring.perHint}
        </dt>
        <dd>−{score.hintPenalty}</dd>
      </div>
    </dl>
  );
}

// Итоги участника после финального этапа.
export function FinalResults({ player, scoring, offline, onNewTeam }) {
  const { board, clockOffset } = useLeaderboard();
  const [reviewOpen, setReviewOpen] = useState(false);
  const level = LEVELS[player.level];

  function startNewTeam() {
    if (
      window.confirm(
        'Результат сохранён: его можно открыть на странице «Мой результат». Перейти к регистрации нового участника?',
      )
    ) {
      onNewTeam();
    }
  }

  return (
    <div className="results-stage">
      <div className="result-card">
        <div className="result-score">
          <span className="eyebrow">
            «{player.team}» · уровень «{level.name}» · {formatDuration(player.elapsedMs)}
          </span>
          {player.status === 'timeout' && (
            <span className="timeout-note">
              Время вышло. Решено заданий: {player.solved.length} из {player.modules.length}
            </span>
          )}
          <strong>{player.score.total}</strong>
          <span>{resultLine(player, level, offline)}</span>
        </div>
        <ScoreBreakdown player={player} scoring={scoring} />
        <ScoringRules scoring={scoring} />
        <div className="action-row result-actions">
          <button
            className="ghost-action"
            disabled={player.status === 'playing'}
            onClick={() => setReviewOpen((open) => !open)}
          >
            <BookOpen size={16} />
            {reviewOpen ? 'Скрыть разбор' : 'Разбор заданий'}
          </button>
          <a className="ghost-action" href={routeHref('me')} target="_blank" rel="noreferrer">
            <UserRound size={16} />
            Мой результат
          </a>
          <button className="primary-action" onClick={startNewTeam}>
            <RotateCcw size={18} />
            Новый участник
          </button>
        </div>
      </div>

      {reviewOpen && <Review player={player} />}

      <div className="data-table">
        <div className="panel-title">
          <Medal size={16} />
          Рейтинг уровня «{level.name}»
        </div>
        {board ? (
          <LeaderboardTable rows={levelRows(board, player.level)} clockOffset={clockOffset} highlightId={player.id} />
        ) : (
          <p className="muted">Загружаем таблицу...</p>
        )}
      </div>
    </div>
  );
}

// Отдельная страница /results — для проектора и организаторов.
export function ResultsPage() {
  const { board, clockOffset, error, refresh } = useLeaderboard();
  const [tab, setTab] = useState(null);
  const [adminKey, setAdminKey] = useState(() => readAdminKey());
  const [keyInput, setKeyInput] = useState('');
  const [adminError, setAdminError] = useState('');

  // В автономном режиме данные лежат на этом компьютере, поэтому ключ организатора не нужен.
  const localMode = backendKind() === 'local';
  const canManage = localMode || Boolean(adminKey);

  // По умолчанию открываем первый уровень, где уже есть участники.
  const activeTab = tab ?? LEVEL_IDS.find((id) => levelRows(board, id).length > 0) ?? 'senior';

  async function login(event) {
    event.preventDefault();
    try {
      await request('/api/admin/check', { adminKey: keyInput.trim() });
      setAdminKey(keyInput.trim());
      saveAdminKey(keyInput.trim());
      setAdminError('');
    } catch (loginError) {
      setAdminError(loginError.message);
    }
  }

  function logoutAdmin() {
    setAdminKey('');
    saveAdminKey('');
  }

  async function adminAction(path, confirmText) {
    if (!window.confirm(confirmText)) return;
    try {
      await request(path, { method: 'DELETE', adminKey });
      await refresh();
    } catch (actionError) {
      window.alert(actionError.message);
      if (actionError.status === 403) logoutAdmin();
    }
  }

  const onDelete = canManage
    ? (row) => adminAction(`/api/players/${row.id}`, `Удалить «${row.team}» из таблицы?`)
    : null;

  return (
    <main className="results-shell">
      <div className="scanlines" aria-hidden="true" />
      <header className="stage-header">
        <div className="brand">
          <div className="brand-mark">
            <TerminalSquare size={23} />
          </div>
          <div>
            <p>Polytech Cyber Quest</p>
            <span>Обновляется автоматически</span>
          </div>
        </div>
        {localMode ? (
          <button className="ghost-action" onClick={downloadLocalCsv}>
            <Download size={16} />
            Скачать CSV для Excel
          </button>
        ) : (
          <a className="ghost-action" href="/api/results.csv">
            <Download size={16} />
            Скачать CSV для Excel
          </a>
        )}
      </header>

      <h1>Рейтинг</h1>
      {localMode && <OfflineBanner />}
      {error && <p className="answer-feedback">{error}</p>}

      {board && (
        <>
          <div className="level-tabs" role="tablist" aria-label="Уровни">
            {LEVEL_IDS.map((id) => {
              const Icon = LEVEL_ICONS[id];
              return (
                <button
                  key={id}
                  role="tab"
                  aria-selected={activeTab === id}
                  className={`level-tab ${activeTab === id ? 'selected' : ''}`}
                  onClick={() => setTab(id)}
                >
                  <Icon size={16} />
                  {LEVELS[id].name}
                  <span>{levelRows(board, id).length}</span>
                </button>
              );
            })}
          </div>

          <section className="data-table">
            <LeaderboardTable rows={levelRows(board, activeTab)} clockOffset={clockOffset} onDelete={onDelete} />
            {practiceCount(board, activeTab) > 0 && (
              <p className="muted practice-note">
                Ещё {practiceCount(board, activeTab)} — играют «просто так», без рейтинга (они есть в CSV).
              </p>
            )}
          </section>

          <ScoringRules scoring={board.scoring} />
        </>
      )}

      <section className="admin-panel">
        <div className="panel-title">
          <KeyRound size={16} />
          Для организатора
        </div>
        {canManage && <SettingsForm adminKey={adminKey} onForbidden={logoutAdmin} />}
        {canManage ? (
          <div className="action-row">
            <span className="muted">Режим управления включен: можно удалять строки.</span>
            <div className="action-row">
              <button
                className="ghost-action danger"
                onClick={() =>
                  adminAction('/api/players', 'Удалить ВСЕ результаты? Перед этим стоит скачать CSV.')
                }
              >
                <Trash2 size={16} />
                Очистить таблицу
              </button>
              {!localMode && (
                <button className="ghost-action" onClick={logoutAdmin}>
                  Выйти
                </button>
              )}
            </div>
          </div>
        ) : (
          <form className="action-row" onSubmit={login}>
            <input
              className="answer-input"
              type="password"
              value={keyInput}
              onChange={(event) => setKeyInput(event.target.value)}
              placeholder="Ключ организатора из консоли сервера"
            />
            <button className="ghost-action" type="submit">
              Войти
            </button>
          </form>
        )}
        {adminError && <p className="answer-feedback">{adminError}</p>}
      </section>
    </main>
  );
}

// Лимиты времени режима «на время»; новые значения действуют для тех, кто зарегистрируется после сохранения.
function SettingsForm({ adminKey, onForbidden }) {
  const [limits, setLimits] = useState(DEFAULT_SETTINGS.timeLimits);
  const [message, setMessage] = useState('');

  useEffect(() => {
    request('/api/config')
      .then((data) => setLimits(data.settings.timeLimits))
      .catch(() => {});
  }, []);

  async function save(event) {
    event.preventDefault();
    try {
      const data = await request('/api/settings', {
        method: 'PUT',
        body: { timeLimits: limits },
        adminKey,
      });
      setLimits(data.settings.timeLimits);
      setMessage('Сохранено. Новые лимиты действуют для тех, кто зарегистрируется дальше.');
    } catch (saveError) {
      setMessage(saveError.message);
      if (saveError.status === 403) onForbidden();
    }
  }

  return (
    <form className="settings-form" onSubmit={save}>
      <span className="muted">Лимит времени для режима «на время», минут:</span>
      {LEVEL_IDS.map((id) => (
        <label key={id} className="query-part">
          <span>{LEVELS[id].name}</span>
          <input
            className="answer-input"
            type="number"
            min="1"
            max="180"
            value={limits[id]}
            onChange={(event) => setLimits({ ...limits, [id]: event.target.value })}
          />
        </label>
      ))}
      <button className="ghost-action" type="submit">
        Сохранить
      </button>
      {message && <span className="muted settings-message">{message}</span>}
    </form>
  );
}

function LeaderboardTable({ rows, clockOffset, highlightId, onDelete }) {
  const now = useNow() + clockOffset;

  if (rows.length === 0) {
    return <p className="muted">На этом уровне пока нет участников.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="leaderboard">
        <thead>
          <tr>
            <th>Место</th>
            <th>Позывной</th>
            <th>Статус</th>
            <th>Задания</th>
            <th>Время</th>
            <th>Ошибки</th>
            <th>Подсказки</th>
            <th>Очки</th>
            {onDelete && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={row.id === highlightId ? 'highlight' : ''}>
              <td className={`place place-${row.place}`}>{row.place}</td>
              <td className="team-cell">
                <strong>{row.team}</strong>
                {row.className && <span>{row.className} класс</span>}
              </td>
              <td>
                <span className={`status-badge status-${row.status}`}>{STATUS_LABELS[row.status] ?? row.status}</span>
              </td>
              <td>
                {row.solved.length} / {row.modules.length}
              </td>
              <td>{formatDuration(row.status === 'playing' ? now - row.startedAt : row.elapsedMs)}</td>
              <td>{row.totalMistakes}</td>
              <td>{row.totalHints}</td>
              <td className="score-cell">{row.score.total}</td>
              {onDelete && (
                <td>
                  <button className="icon-action" title="Удалить из таблицы" onClick={() => onDelete(row)}>
                    <Trash2 size={16} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// В автономном режиме CSV собирается прямо в браузере и сохраняется как файл.
async function downloadLocalCsv() {
  const csv = await request('/api/results.csv');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.download = 'polytech-quest-results.csv';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function readAdminKey() {
  try {
    return sessionStorage.getItem(ADMIN_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

function saveAdminKey(key) {
  try {
    if (key) sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
    else sessionStorage.removeItem(ADMIN_KEY_STORAGE);
  } catch {
    // Без sessionStorage ключ просто придется вводить заново.
  }
}
