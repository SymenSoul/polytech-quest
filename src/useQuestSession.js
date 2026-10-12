import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SCORING, computeScore } from '../shared/quest.js';
import { backendKind, randomId, request, sessionHistory, sessionMirror, tokenStorage } from './api.js';

const RETRY_DELAY_MS = 2000;
const OFFLINE_RETRY_MS = 10000;

// Сессия участника: регистрация, восстановление после перезагрузки и отправка событий.
// Сессия работает с тем бэкендом, где создана (сервер или этот браузер), а её копия лежит
// в localStorage — если сервер упал, игра продолжается из копии, а события досылаются позже.
export function useQuestSession() {
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [player, setPlayer] = useState(null);
  const [scoring, setScoring] = useState(DEFAULT_SCORING);
  const [clockOffset, setClockOffset] = useState(0);
  const [offline, setOffline] = useState(false);
  const [backend, setBackend] = useState(backendKind);
  const tokenRef = useRef(tokenStorage.read());
  const backendRef = useRef(backendKind());
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

  const switchBackend = useCallback((kind) => {
    backendRef.current = kind;
    setBackend(kind);
  }, []);

  // Копия сессии обновляется при каждом изменении прогресса.
  useEffect(() => {
    if (!player || !tokenRef.current) return;
    sessionMirror.save({
      token: tokenRef.current,
      backend: backendRef.current,
      player,
      scoring,
      clockOffset,
      queue: queueRef.current,
    });
  }, [player, scoring, clockOffset]);

  // События отправляются строго по очереди; при обрыве связи очередь повторяется, пока сервер не ответит.
  const flush = useCallback(async () => {
    if (flushingRef.current) return;
    flushingRef.current = true;

    while (queueRef.current.length > 0) {
      const event = queueRef.current[0];
      const token = tokenRef.current;
      try {
        const data = await request('/api/events', { method: 'POST', body: event, token, backend: backendRef.current });
        // Пока шёл запрос, за компьютер мог сесть другой участник — его очередь не трогаем.
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
        // Сервер отклонил событие — берём его версию прогресса.
        queueRef.current.shift();
        request('/api/session', { token, backend: backendRef.current })
          .then((data) => token === tokenRef.current && accept(data))
          .catch(() => {});
      }
    }

    flushingRef.current = false;
  }, [accept]);

  const forget = useCallback(() => {
    tokenRef.current = null;
    queueRef.current = [];
    tokenStorage.clear();
    sessionMirror.clear();
    setPlayer(null);
    setOffline(false);
  }, []);

  const reload = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) {
      setStatus('ready');
      return;
    }

    const mirror = sessionMirror.read();
    const saved = mirror?.token === token ? mirror : null;
    switchBackend(saved?.backend ?? backendKind());

    setStatus('loading');
    try {
      const data = await request('/api/session', { token, backend: backendRef.current });
      accept(data);
      // События, которые не успели уйти до перезагрузки, сразу показываем и досылаем (дубли сервер отбросит).
      if (saved?.queue?.length) {
        queueRef.current = saved.queue;
        setPlayer((current) => saved.queue.reduce((next, event) => applyLocally(next, event, data.scoring), current));
        flush();
      }
      setStatus('ready');
    } catch (error) {
      if (error.status === 401) {
        forget();
        setStatus('ready');
      } else if (saved?.player) {
        // Сервер недоступен — продолжаем игру из сохранённой копии.
        setPlayer(saved.player);
        setScoring(saved.scoring ?? DEFAULT_SCORING);
        setClockOffset(saved.clockOffset ?? 0);
        queueRef.current = saved.queue ?? [];
        setOffline(true);
        setStatus('ready');
        flush();
      } else {
        setStatus('error');
      }
    }
  }, [accept, flush, forget, switchBackend]);

  useEffect(() => {
    reload();
  }, [reload]);

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

  // Тихо подтягивает актуальное состояние (например, когда закончилось время или вернулась связь).
  const refresh = useCallback(async () => {
    const token = tokenRef.current;
    if (!token || queueRef.current.length > 0) return;
    try {
      const data = await request('/api/session', { token, backend: backendRef.current });
      if (token !== tokenRef.current) return;
      accept(data);
      setOffline(false);
    } catch {
      // Не страшно: следующая попытка или очередь событий синхронизируют данные.
    }
  }, [accept]);

  // Пока нет связи, периодически проверяем, не вернулся ли сервер.
  useEffect(() => {
    if (!offline) return undefined;
    const timerId = window.setInterval(refresh, OFFLINE_RETRY_MS);
    return () => window.clearInterval(timerId);
  }, [offline, refresh]);

  const register = useCallback(
    async (form) => {
      let kind = backendKind();
      let data;
      try {
        data = await request('/api/register', { method: 'POST', body: form, backend: kind });
      } catch (error) {
        if (error.status !== 0) throw error;
        // Сервер пропал между загрузкой страницы и регистрацией — играем на этом компьютере.
        kind = 'local';
        data = await request('/api/register', { method: 'POST', body: form, backend: kind });
      }
      tokenRef.current = data.token;
      queueRef.current = [];
      tokenStorage.save(data.token);
      switchBackend(kind);
      accept(data);
    },
    [accept, switchBackend],
  );

  // Сессия не теряется: она переносится в историю компьютера и видна на странице «Мой результат».
  const logout = useCallback(() => {
    if (tokenRef.current) sessionHistory.add(tokenRef.current, backendRef.current);
    forget();
  }, [forget]);

  return { status, player, scoring, clockOffset, offline, backend, reload, refresh, register, sendEvent, logout };
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
