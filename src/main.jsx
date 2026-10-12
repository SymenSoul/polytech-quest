import { Component, StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { ResultsPage } from './Results.jsx';
import { MyResultPage } from './MyResult.jsx';
import { currentRoute } from './routes.js';
import './styles.css';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return createElement(
        'div',
        { className: 'boot-fallback' },
        createElement('strong', null, 'Интерфейс квеста не запустился'),
        createElement('span', null, this.state.error.message),
      );
    }

    return this.props.children;
  }
}

const route = currentRoute();
const pages = { results: ResultsPage, me: MyResultPage };
const page = pages[route] ? createElement(pages[route]) : createElement(App, { route });

// Переход между маршрутами внутри файла (#/…) — просто перезагружаем страницу.
window.addEventListener('hashchange', () => window.location.reload());

createRoot(document.getElementById('root')).render(
  createElement(
    StrictMode,
    null,
    createElement(ErrorBoundary, null, page),
  ),
);
