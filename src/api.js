import { useEffect, useState } from 'react';

const TOKEN_KEY = 'polytech-quest-token';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function request(path, { method = 'GET', body, token, adminKey } = {}) {
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
