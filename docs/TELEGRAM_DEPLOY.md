# Telegram Serverless — @umnozhayka_tgbot

Официальная документация: https://core.telegram.org/bots/serverless

1. В @BotFather открыть **@umnozhayka_tgbot → Serverless → Turn on**.
2. В **Serverless → CLI Access → Access token** получить **отдельный** CLI-токен формата app<id>:<secret>. Не путать с Bot API token. Не публиковать и не пересылать.
3. На собственной машине в корне клона выполнить:
   - `npm install`
   - `npm run check`
   - `npx tgcloud login`, ввести токен локально
   - `npx tgcloud status` и `npx tgcloud diff`.
4. Убедиться, что CLI привязан именно к @umnozhayka_tgbot и в облаке нет чужих модулей. Полная публикация удаляет отсутствующие локально модули.
5. Выполнить `npm run deploy`. Команда соберёт `dist/` и запустит `tgcloud push`. Записать фактический URL вида `https://app<id>.tgcloud.ai/` из вывода.
6. В @BotFather настроить **Menu Button** на этот URL. При необходимости настроить Main Mini App.
7. Проверить `/start` и запуск Mini App в Telegram на телефоне; отдельная БД и миграции пока не нужны.

Не запускать `tgcloud push --force` при конфликте. Не добавлять токены в коммиты или CI. До реального deploy в Telegram статус — «подготовлено, не опубликовано».
