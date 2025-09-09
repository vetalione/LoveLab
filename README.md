# LoveLab (Vite + React)

## Скрипты
- `npm run dev` — дев сервер
- `npm run build` — прод сборка
- `npm run preview` — предпросмотр собранного

## Установка
```bash
npm install
npm run dev
```
Открой http://localhost:5173

## Tailwind
Конфиг: `tailwind.config.js`.
Стили: `src/index.css`.

## Компонент
Основной компонент подключён: `src/App.jsx` -> `../lovelab_fixed_connect.jsx`.
Перенеси/переименуй при необходимости в `src/RelationshipLab.jsx` для чистоты.

## Дальше
- Добавить ESLint/Vitest (по запросу)
- Вынести логику в модули (hooks/lib)
- Миграция на TypeScript (опционально)

## Troubleshooting dev сервера

Если ошибка `Port 5173 is already in use` или белый экран:

1. Освободить порт:
	```bash
	npm run dev:reset
	```
2. Если не помогает (порт подвис в CLOSE_WAIT) — перезапусти VS Code терминал или выполни:
	```bash
	pkill -f '/node_modules/.bin/vite'
	npm run dev
	```
3. Альтернативный порт:
	```bash
	npm run dev:alt
	```
4. Проверка ответа:
	```bash
	curl -I http://127.0.0.1:5173/
	```
5. Если index.html 200, но в браузере пусто — открой DevTools Console (наличие overlay ошибки) и очисть кэш (Hard reload).

strictPort в `vite.config.js` намеренно падает с ошибкой вместо тихого переключения — это проще диагностировать.
