import React, { useCallback, useEffect, useState } from 'react';
import { Download, KeyRound, Lightbulb, Medal, RotateCcw, Star, TerminalSquare, Trash2, XCircle } from 'lucide-react';
import { LEVELS, LEVEL_IDS, formatDuration } from '../shared/quest.js';
import { request, useNow } from './api.js';
import { LEVEL_ICONS, ScoringRules } from './Registration.jsx';

const ADMIN_KEY_STORAGE = 'polytech-quest-admin-key';

const STATUS_LABELS = {
  playing: 'в игре',
  finished: 'финиш',
};

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
  const level = LEVELS[player.level];
  const waiting = player.status === 'playing';

  function startNewTeam() {
    if (window.confirm('Результат сохранён. Перейти к регистрации нового участника?')) {
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
          <strong>{player.score.total}</strong>
          <span>
            {waiting
              ? offline
                ? 'Нет связи с сервером. Результат отправится автоматически...'
                : 'Подсчитываем результат...'
              : `очков · ${player.place} место на уровне «${level.name}»`}
          </span>
        </div>
        <ScoreBreakdown player={player} scoring={scoring} />
        <ScoringRules scoring={scoring} />
        <button className="primary-action" onClick={startNewTeam}>
          <RotateCcw size={18} />
          Новый участник
        </button>
      </div>

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

  const onDelete = adminKey
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
        <a className="ghost-action" href="/api/results.csv">
          <Download size={16} />
          Скачать CSV для Excel
        </a>
      </header>

      <h1>Рейтинг</h1>
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
          </section>

          <ScoringRules scoring={board.scoring} />
        </>
      )}

      <section className="admin-panel">
        <div className="panel-title">
          <KeyRound size={16} />
          Для организатора
        </div>
        {adminKey ? (
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
              <button className="ghost-action" onClick={logoutAdmin}>
                Выйти
              </button>
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
