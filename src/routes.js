// Маршрут берётся из адреса: /results или #/results. Hash нужен, чтобы сайт работал, открытый как файл.
export function currentRoute() {
  const fromHash = window.location.hash.replace(/^#\/?/, '');
  const fromPath = window.location.protocol === 'file:' ? '' : window.location.pathname;
  return (fromHash || fromPath).replace(/^\/+|\/+$/g, '').toLowerCase();
}

export function routeHref(name = '') {
  return window.location.protocol === 'file:' ? `#/${name}` : `/${name}`;
}
