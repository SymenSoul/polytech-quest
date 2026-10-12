import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Встраивает собранные JS и CSS прямо в dist/index.html. Так один файл работает везде:
// его раздаёт сервер квеста, его можно положить на любой статический хостинг или открыть
// двойным щелчком — браузеры не загружают module-скрипты из отдельных файлов по file://.
function inlineAssets() {
  return {
    name: 'inline-assets',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = bundle['index.html'];
      let source = html.source;

      for (const [fileName, item] of Object.entries(bundle)) {
        const scriptTag = new RegExp(`<script type="module" crossorigin src="/${fileName}"></script>`);
        const styleTag = new RegExp(`<link rel="stylesheet" crossorigin href="/${fileName}">`);

        if (item.type === 'chunk' && scriptTag.test(source)) {
          // Последовательности </script и <!-- внутри кода сломали бы разбор HTML.
          const code = item.code.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
          // Замена через функцию: в коде могут встречаться $& и подобные шаблоны String.replace.
          source = source.replace(scriptTag, () => `<script type="module">${code}</script>`);
          delete bundle[fileName];
        } else if (fileName.endsWith('.css') && styleTag.test(source)) {
          source = source.replace(styleTag, () => `<style>${item.source}</style>`);
          delete bundle[fileName];
        }
      }

      html.source = source;
    },
  };
}

export default defineConfig({
  plugins: [react(), inlineAssets()],
});
