# Умножайка

Приложение на русском языке для изучения таблицы умножения внутри Telegram: [@umnozhayka_tgbot](https://t.me/umnozhayka_tgbot).

## Возможности

- «Все» — 81 выражение; ×1…×9 — по 9 выражений.
- По порядку либо вразброс без повторений.
- Ответ раскрывается через 10 секунд, если пользователь остаётся на примере.
- Листание влево/вправо, кнопки навигации, экран завершения.
- Позиция, выбранный режим и случайный порядок сохраняются в localStorage; при открытии ответа отсчёт начинается заново.
- Нет серверного хранения учебных данных и персональных данных ребёнка.

## Локальная проверка

Node.js 18+. Команда `npm run check` запускает тесты и собирает статику в `dist/`. Можно открыть `app/index.html` через локальный HTTP-сервер (для ES Modules нужен HTTP, не file://).

## Telegram Serverless

Развёртывание подготовлено для **@umnozhayka_tgbot**, но не является подтверждённым до реального `tgcloud push` и проверки в Telegram. См. [пошаговую инструкцию](docs/TELEGRAM_DEPLOY.md).

```bash
npm ci
npm run check
npx tgcloud login
npx tgcloud fetch
npx tgcloud status
npx tgcloud diff
```

`status` и `diff` сравнивают файлы с локальным снимком. После входа сначала выполните `npx tgcloud fetch`, чтобы получить актуальное состояние облака; проверьте, что `diff` не удаляет неизвестные модули, и только затем запускайте `npm run deploy`. Не используйте `--force`.

После проверки цели и `diff` опубликуйте сборку:

```bash
npm run deploy
```

Для `tgcloud login` нужен отдельный CLI Access token из @BotFather → @umnozhayka_tgbot → Serverless → CLI Access → Access token. Не используйте Bot API token и не публикуйте CLI token в чате, логах или GitHub. Конфигурация использует **Telegram Serverless**, отдельный VPS не нужен.

## Планы

[Дальнейшие версии](docs/PLAN.md). Лицензия MIT.
