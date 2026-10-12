import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SCORING, computeScore } from '../shared/quest.js';
import { randomId, request, tokenStorage } from './api.js';

const RETRY_DELAY_MS = 2000;

// Сессия команды: регистрация, восстановление после перезагрузки и отправка событий на сервер.
export function useQuestSession() {
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [player, setPlayer] = useState(null);
  const [scoring, setScoring] = useState(DEFAULT_SCORING);
  const [clockOffset, setClockOffset] = useState(0);
  const [offline, setOffline] = useState(false);
  const tokenRef = useRef(tokenStorage.read());
  const queueRef = useRef([]);
  const flushingRef = useRef(false);
  const scoringRef = useRef(scoring);
  scoringRef.current = scoring;
  const clockOffsetRef = useRef(clockOffset);
  clockOffsetRef.current = clockOffset;

  const accept = useCallback((data) => {
    setPlayer(data.player);
    setScoring(data.scoring);
    setClockOffset(data.now - Date.now());
  }, []);

  const reload = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) {
      setStatus('ready');
      return;
    }

    setStatus('loading');
    try {
      accept(await request('/api/session', { token }));
      setStatus('ready');
    } catch (error) {
      if (error.status === 401) {
        tokenRef.current = null;
        tokenStorage.clear();
        setStatus('ready');
      } else {
        setStatus('error');
      }
    }
  }, [accept]);

  useEffect(() => {
    reload();
  }, [reload]);

  // События отправляются строго по очереди; при обрыве связи очередь повторяется, пока сервер не ответит.
  const flush = useCallback(async () => {
    if (flushingRef.current) return;
    flushingRef.current = true;

    while (queueRef.current.length > 0) {
      const event = queueRef.current[0];
      const token = tokenRef.current;
      try {
        const data = await request('/api/events', { method: 'POST', body: event, token });
        // Пока шел запрос, за компьютер могла сесть другая команда — ее очередь не трогаем.
        if (token !== tokenRef.current) continue;
        queueRef.current.shift();
        setOffline(false);
        if (queueRef.current.length === 0) accept(data);
      } catch (error) {
        if (token !== tokenRef.current) continue;
        if (error.status === 0 || error.status >= 500) {
          setOffline(true);
          await new Promise((resolve) => window.setTimeout(resolve, RETRY_DELAY_MS));
          continue;
        }
        // Сервер отклонил событие — берем его версию прогресса.
        queueRef.current.shift();
        request('/api/session', { token })
          .then((data) => token === tokenRef.current && accept(data))
          .catch(() => {});
      }
    }

    flushingRef.current = false;
  }, [accept]);

  const sendEvent = useCallback(
    (type, module) => {
      // at — момент действия по часам сервера: если связь пропала, событие дойдёт позже, но время будет честным.
      const at = Date.now() + clockOffsetRef.current;
      setPlayer((current) => current && applyLocally(current, { type, module, at }, scoringRef.current));
      queueRef.current.push({ eventId: randomId(), type, module, at });
      flush();
    },
    [flush],
  );

  // Тихо подтягивает актуальное состояние с сервера (например, когда закончилось время).
  const refresh = useCallback(async () => {
    const token = tokenRef.current;
    if (!token || queueRef.current.length > 0) return;
    try {
      const data = await request('/api/session', { token });
      if (token === tokenRef.current) accept(data);
    } catch {
      // Не страшно: очередь событий и следующий запрос всё равно синхронизируют данные.
    }
  }, [accept]);

  const register = useCallback(
    async (form) => {
      const data = await request('/api/register', { method: 'POST', body: form });
      tokenRef.current = data.token;
      tokenStorage.save(data.token);
      accept(data);
    },
    [accept],
  );

  const logout = useCallback(() => {
    tokenRef.current = null;
    queueRef.current = [];
    tokenStorage.clear();
    setPlayer(null);
    setOffline(false);
  }, []);

  return { status, player, scoring, clockOffset, offline, reload, refresh, register, sendEvent, logout };
}

// Мгновенно показываем результат действия, не дожидаясь сервера; его ответ потом заменит эти данные.
function applyLocally(player, { type, module, at }, scoring) {
  let next;
  if (type === 'solve') {
    next = player.solved.includes(module)
      ? player
      : { ...player, solved: [...player.solved, module], solvedAt: { ...player.solvedAt, [module]: at } };
  } else {
    const key = type === 'hint' ? 'hints' : 'mistakes';
    const totalKey = type === 'hint' ? 'totalHints' : 'totalMistakes';
    next = {
      ...player,
      [key]: { ...player[key], [module]: (player[key][module] ?? 0) + 1 },
      [totalKey]: player[totalKey] + 1,
    };
    if (type === 'hint') next.lastHintAt = { ...player.lastHintAt, [module]: at };
  }

  const score = computeScore(
    { solvedCount: next.solved.length, mistakes: next.totalMistakes, hints: next.totalHints },
    scoring,
  );
  return { ...next, score };
}
