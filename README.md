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
