import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, Circle, History, Hourglass, Clock3, Medal, TerminalSquare } from 'lucide-react';
import { LEVELS, MODULE_LABELS, STATUS_LABELS, formatDuration } from '../shared/quest.js';
import { request, sessionHistory, tokenStorage, useNow } from './api.js';
import { ScoreBreakdown } from './Results.jsx';
import { routeHref } from './routes.js';

// Страница /me: результат участника с этого компьютера в любой момент, даже после закрытия итогов.
export function MyResultPage() {
  const [current, setCurrent] = useState(null);
  const [past, setPast] = useState([]);
  const [status, setStatus] = useState('loading');

  const load = useCallback(async () => {
    const token = tokenStorage.read();
    const history = sessionHistory.read().filter((item) => item.token !== token);

    const [currentData, ...pastData] = await Promise.all(
      [token, ...history.map((item) => item.token)].map((itemToken) =>
        itemToken ? request('/api/session', { token: itemToken }).catch((error) => ({ error })) : null,
      ),
    );

    if (currentData?.error && currentData.error.status !== 401) {
      setStatus('error');
      return;
    }
    setCurrent(currentData?.player ? currentData : null);
    setPast(pastData.filter((data) => data?.player));
    setStatus('ready');
  }, []);

  useEffect(() => {
    load();
    const timerId = window.setInterval(load, 5000);
    return () => window.clearInterval(timerId);
  }, [load]);

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
        <div className="action-row">
          <a className="ghost-action" href={routeHref('results')}>
            <Medal size={16} />
            Рейтинг
          </a>
          <a className="primary-action" href={routeHref()}>
            <ArrowLeft size={16} />
            К квесту
          </a>
        </div>
      </header>

      <h1>Мой результат</h1>

      {status === 'loading' && <p className="muted">Загружаем...</p>}
      {status === 'error' && <p className="answer-feedback">Нет связи с сервером. Повторяем каждые 5 секунд...</p>}
      {status === 'ready' && !current && (
        <p className="muted">
          На этом компьютере сейчас нет активного участника. <a href={routeHref()}>Начать квест</a>
        </p>
      )}

      {current && <ResultCard data={current} />}

      {past.length > 0 && (
        <section className="data-table">
          <div className="panel-title">
            <History size={16} />
            Раньше на этом компьютере
          </div>
          <div className="table-scroll">
            <table className="leaderboard">
              <thead>
                <tr>
                  <th>Позывной</th>
                  <th>Уровень</th>
                  <th>Статус</th>
                  <th>Задания</th>
                  <th>Очки</th>
                  <th>Место</th>
                </tr>
              </thead>
              <tbody>
                {past.map(({ player }) => (
                  <tr key={player.id}>
                    <td className="team-cell">
                      <strong>{player.team}</strong>
                      {player.className && <span>{player.className} класс</span>}
                    </td>
                    <td>{LEVELS[player.level].name}</td>
                    <td>{STATUS_LABELS[player.status]}</td>
                    <td>
                      {player.solved.length} / {player.modules.length}
                    </td>
                    <td className="score-cell">{player.score.total}</td>
                    <td>{player.place ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

function ResultCard({ data }) {
  const { player, scoring } = data;
  const clockOffset = data.now - Date.now();
  const now = useNow() + clockOffset;
  const level = LEVELS[player.level];
  const playing = player.status === 'playing';
  const elapsed = playing ? now - player.startedAt : player.elapsedMs;
  const remaining = player.timeLimitMs && playing ? Math.max(0, player.timeLimitMs - elapsed) : null;

  return (
    <div className="results-stage">
      <div className="result-card">
        <div className="result-score">
          <span className="eyebrow">
            «{player.team}» · {player.className} класс · уровень «{level.name}» ·{' '}
            {player.mode === 'timed' ? 'на время' : 'просто так'}
          </span>
          <strong>{player.score.total}</strong>
          <span>
            очков · {STATUS_LABELS[player.status]}
            {player.place ? ` · ${player.place} место` : ''}
          </span>
        </div>
        <div className="stat-row big-stats">
          {remaining === null ? (
            <span title="Время">
              <Clock3 size={16} />
              {formatDuration(elapsed)}
            </span>
          ) : (
            <span title="Осталось" className={remaining < 2 * 60000 ? 'time-warning' : ''}>
              <Hourglass size={16} />
              осталось {formatDuration(remaining)}
            </span>
          )}
        </div>
        <ScoreBreakdown player={player} scoring={scoring} />
      </div>

      <div className="data-table">
        <div className="panel-title">Задания</div>
        <ul className="task-list">
          {player.modules.map((id) => {
            const done = player.solved.includes(id);
            return (
              <li key={id} className={done ? 'done' : ''}>
                {done ? <Check size={16} /> : <Circle size={16} />}
                <strong>{MODULE_LABELS[id]}</strong>
                <span>
                  ошибок: {player.mistakes[id] ?? 0} · подсказок: {player.hints[id] ?? 0}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
