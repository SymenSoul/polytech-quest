import { useEffect, useState } from 'react';
import { localApi } from './localBackend.js';

const TOKEN_KEY = 'polytech-quest-token';
const PROBE_TIMEOUT_MS = 2500;

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Где живут данные: 'server' — сервер квеста, 'local' — localStorage этого браузера.
let detectedBackend = 'server';

export function backendKind() {
  return detectedBackend;
}

// Вызывается один раз при старте: есть ли рядом сервер квеста. Если сайт открыт как файл,
// со статического хостинга или сервер не отвечает — работаем в автономном режиме.
export async function detectBackend() {
  if (window.location.protocol === 'file:') {
    detectedBackend = 'local';
    return detectedBackend;
  }

  const controller = new AbortController();
  const timerId = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch('/api/config', { signal: controller.signal, cache: 'no-store' });
    const data = response.ok ? await response.json() : null;
    detectedBackend = data?.mode === 'server' ? 'server' : 'local';
  } catch {
    detectedBackend = 'local';
  } finally {
    window.clearTimeout(timerId);
  }
  return detectedBackend;
}

// Вызов API квеста. backend можно указать явно: сессия всегда работает с тем бэкендом,
// где была создана, даже если сервер позже стал недоступен.
export async function request(path, { method = 'GET', body, token, adminKey, backend = detectedBackend } = {}) {
  if (backend === 'local') {
    try {
      return localApi(method, path, { body, token });
    } catch (error) {
      throw new ApiError(error.status ?? 500, error.message);
    }
  }

  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (adminKey) headers['X-Admin-Key'] = adminKey;

  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Нет связи с сервером.');
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, data?.error ?? `Ошибка сервера (${response.status}).`);
  }
  return data;
}

export const tokenStorage = {
  read: () => safeStorage(() => localStorage.getItem(TOKEN_KEY)),
  save: (token) => safeStorage(() => localStorage.setItem(TOKEN_KEY, token)),
  clear: () => safeStorage(() => localStorage.removeItem(TOKEN_KEY)),
};

const HISTORY_KEY = 'polytech-quest-history';
const HISTORY_LIMIT = 30;

// Прошлые участники с этого компьютера: «Новый участник» не стирает сессию, а переносит её сюда,
// чтобы результат можно было посмотреть на странице «Мой результат».
export const sessionHistory = {
  read: () => jsonStorage.read(HISTORY_KEY, []),
  add: (token, backend) => {
    const items = sessionHistory.read().filter((item) => item.token !== token);
    jsonStorage.save(HISTORY_KEY, [{ token, backend, savedAt: Date.now() }, ...items].slice(0, HISTORY_LIMIT));
  },
};

// Копия текущей сессии: из неё игра восстанавливается после F5, даже если сервер недоступен.
const SESSION_KEY = 'polytech-quest-session';

export const sessionMirror = {
  read: () => jsonStorage.read(SESSION_KEY, null),
  save: (mirror) => jsonStorage.save(SESSION_KEY, mirror),
  clear: () => jsonStorage.remove(SESSION_KEY),
};

// Небольшие данные в localStorage (JSON); если хранилище недоступно, возвращается fallback.
export const jsonStorage = {
  read: (key, fallback) => safeStorage(() => JSON.parse(localStorage.getItem(key))) ?? fallback,
  save: (key, value) => safeStorage(() => localStorage.setItem(key, JSON.stringify(value))),
  remove: (key) => safeStorage(() => localStorage.removeItem(key)),
};

function safeStorage(action) {
  try {
    return action();
  } catch {
    return null;
  }
}

// crypto.randomUUID недоступен по http://ip:порт (не «безопасный контекст»), а getRandomValues работает везде.
export function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timerId = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timerId);
  }, [intervalMs]);

  return now;
}
