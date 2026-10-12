import React, { useCallback, useEffect, useState } from 'react';
import {
  Clock3,
  Download,
  KeyRound,
  Lightbulb,
  Medal,
  RotateCcw,
  TerminalSquare,
  Trash2,
  Trophy,
  Users,
  XCircle,
} from 'lucide-react';
import { MODULE_IDS, formatDuration } from '../shared/quest.js';
import { request, useNow } from './api.js';
import { ScoringRules } from './Registration.jsx';

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

// Итоги команды после финального этапа.
export function FinalResults({ player, scoring, offline, onNewTeam }) {
  const { board } = useLeaderboard();
  const score = player.score;

  function startNewTeam() {
    if (window.confirm('Результат команды сохранен. Перейти к регистрации новой команды?')) {
      onNewTeam();
    }
  }

  return (
    <div className="results-stage">
      <div className="result-card">
        {score ? (
          <>
            <div className="result-score">
              <span className="eyebrow">Итог команды «{player.team}»</span>
              <strong>{score.total}</strong>
              <span>баллов{player.place ? ` · ${player.place} место` : ''}</span>
            </div>
            <dl className="score-breakdown">
              <div>
                <dt>
                  <Trophy size={16} /> Стартовый запас
                </dt>
                <dd>+{score.base}</dd>
              </div>
              <div>
                <dt>
                  <Clock3 size={16} /> Время {formatDuration(player.elapsedMs)}
                </dt>
                <dd>−{score.timePenalty}</dd>
              </div>
              <div>
                <dt>
                  <XCircle size={16} /> Ошибки: {player.totalMistakes}
                </dt>
                <dd>−{score.mistakePenalty}</dd>
              </div>
              <div>
                <dt>
                  <Lightbulb size={16} /> Подсказки: {player.totalHints}
                </dt>
                <dd>−{score.hintPenalty}</dd>
              </div>
            </dl>
          </>
        ) : (
          <div className="result-score">
            <span className="eyebrow">Итог команды «{player.team}»</span>
            <span className="muted">
              {offline ? 'Нет связи с сервером. Результат отправится автоматически...' : 'Подсчитываем результат...'}
            </span>
          </div>
        )}
        <ScoringRules scoring={scoring} />
        <button className="primary-action" onClick={startNewTeam}>
          <RotateCcw size={18} />
          Новая команда
        </button>
      </div>

      <div className="data-table">
        <div className="panel-title">
          <Medal size={16} />
          Таблица результатов
        </div>
        {board ? (
          <FinishedTable rows={board.finished} highlightId={player.id} />
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
  const [adminKey, setAdminKey] = useState(() => readAdminKey());
  const [keyInput, setKeyInput] = useState('');
  const [adminError, setAdminError] = useState('');

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
    ? (row) => adminAction(`/api/players/${row.id}`, `Удалить команду «${row.team}» из таблицы?`)
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
          Скачать CSV
        </a>
      </header>

      <h1>Таблица результатов</h1>
      {error && <p className="answer-feedback">{error}</p>}

      {board && (
        <>
          <section className="data-table">
            <div className="panel-title">
              <Medal size={16} />
              Завершили расследование: {board.finished.length}
            </div>
            <FinishedTable rows={board.finished} onDelete={onDelete} />
          </section>

          <section className="data-table">
            <div className="panel-title">
              <Users size={16} />
              В процессе: {board.inProgress.length}
            </div>
            <InProgressTable rows={board.inProgress} clockOffset={clockOffset} onDelete={onDelete} />
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

function FinishedTable({ rows, highlightId, onDelete }) {
  if (rows.length === 0) {
    return <p className="muted">Пока ни одна команда не завершила квест.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="leaderboard">
        <thead>
          <tr>
            <th>Место</th>
            <th>Команда</th>
            <th>Время</th>
            <th>Ошибки</th>
            <th>Подсказки</th>
            <th>Баллы</th>
            {onDelete && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={row.id === highlightId ? 'highlight' : ''}>
              <td className={`place place-${row.place}`}>{row.place}</td>
              <TeamCell row={row} />
              <td>{formatDuration(row.elapsedMs)}</td>
              <td>{row.totalMistakes}</td>
              <td>{row.totalHints}</td>
              <td className="score-cell">{row.score.total}</td>
              {onDelete && <DeleteCell row={row} onDelete={onDelete} />}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InProgressTable({ rows, clockOffset, onDelete }) {
  const now = useNow() + clockOffset;

  if (rows.length === 0) {
    return <p className="muted">Сейчас никто не проходит квест.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="leaderboard">
        <thead>
          <tr>
            <th>Команда</th>
            <th>Этап</th>
            <th>Время</th>
            <th>Ошибки</th>
            <th>Подсказки</th>
            {onDelete && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <TeamCell row={row} />
              <td>
                {row.solved.length + 1} / {MODULE_IDS.length}
              </td>
              <td>{formatDuration(now - row.startedAt)}</td>
              <td>{row.totalMistakes}</td>
              <td>{row.totalHints}</td>
              {onDelete && <DeleteCell row={row} onDelete={onDelete} />}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamCell({ row }) {
  const details = [row.members, row.school].filter(Boolean).join(' · ');
  return (
    <td className="team-cell">
      <strong>{row.team}</strong>
      {details && <span>{details}</span>}
    </td>
  );
}

function DeleteCell({ row, onDelete }) {
  return (
    <td>
      <button className="icon-action" title="Удалить из таблицы" onClick={() => onDelete(row)}>
        <Trash2 size={16} />
      </button>
    </td>
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
