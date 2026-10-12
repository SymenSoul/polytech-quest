import React, { useCallback, useEffect, useState } from 'react';
import { Clock3, Lightbulb, Play, RefreshCw, TerminalSquare, Trophy, XCircle } from 'lucide-react';
import { DEFAULT_SCORING } from '../shared/quest.js';
import { request } from './api.js';

export default function Registration({ onRegister }) {
  const [form, setForm] = useState({ members: '', school: '' });
  const [nickname, setNickname] = useState('');
  const [scoring, setScoring] = useState(DEFAULT_SCORING);
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
      .then((data) => setScoring(data.scoring))
      .catch(() => {});
  }, [rollNickname]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      // Если позывной успели занять, сервер выдаст другой — он появится в панели команды.
      await onRegister({ ...form, nickname });
    } catch (registerError) {
      setError(registerError.message);
      setBusy(false);
    }
  }

  function update(field) {
    return (event) => setForm({ ...form, [field]: event.target.value });
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
          <span className="eyebrow">Регистрация следственной группы</span>
          <h1>Исчезновение цифрового гения</h1>
          <p>
            Вашей команде выдан позывной — под ним она появится в таблице результатов. Таймер запустится
            сразу после нажатия кнопки «Начать расследование».
          </p>
        </div>

        <form className="gate-form" onSubmit={submit}>
          <div className="query-part">
            <span>Позывной команды</span>
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
          <label className="query-part">
            <span>Участники (необязательно)</span>
            <input
              className="answer-input"
              value={form.members}
              onChange={update('members')}
              maxLength={160}
              placeholder="Имена через запятую"
            />
          </label>
          <label className="query-part">
            <span>Школа и класс (необязательно)</span>
            <input
              className="answer-input"
              value={form.school}
              onChange={update('school')}
              maxLength={60}
              placeholder="Например: Школа 239, 9Б"
            />
          </label>

          {error && (
            <p className="answer-feedback" role="alert">
              <XCircle size={16} />
              {error}
            </p>
          )}

          <button className="primary-action" type="submit" disabled={busy || !nickname}>
            <Play size={18} />
            {busy ? 'Регистрируем...' : 'Начать расследование'}
          </button>
        </form>

        <ScoringRules scoring={scoring} />
      </section>
    </main>
  );
}

export function ScoringRules({ scoring }) {
  return (
    <div className="scoring-rules">
      <div className="panel-title">
        <Trophy size={16} />
        Как считаются баллы
      </div>
      <ul>
        <li>
          <Trophy size={15} />
          Старт: <strong>{scoring.base}</strong> баллов
        </li>
        <li>
          <Clock3 size={15} />
          <strong>−{scoring.perMinute}</strong> за каждую минуту
        </li>
        <li>
          <XCircle size={15} />
          <strong>−{scoring.perMistake}</strong> за неверный ответ
        </li>
        <li>
          <Lightbulb size={15} />
          <strong>−{scoring.perHint}</strong> за подсказку
        </li>
      </ul>
    </div>
  );
}
