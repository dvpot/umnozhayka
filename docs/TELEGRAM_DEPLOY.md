# Telegram Serverless — @umnozhayka_tgbot

Официальная документация: https://core.telegram.org/bots/serverless

В CLI 0.2.0 фронтенд Mini App публикуется из каталога `static.source` файла `tgcloud.json`; в этом проекте это `dist/`.

## Безопасная публикация

1. В @BotFather убедиться, что Serverless включён у **@umnozhayka_tgbot**.
2. CLI Access token получить в **Serverless → CLI Access → Access token** именно у этого бота. Это не Bot API token. Не передавать секрет в чат, Issue, PR, логи или репозиторий.
3. Выполнить `npm ci` и `npm run check`.
4. В корне проекта выполнить `npx tgcloud fetch`, затем `npx tgcloud status` и `npx tgcloud diff`. Сверить app ID с настройкой BotFather и убедиться, что diff содержит только ожидаемые изменения. CLI не выводит username бота.
5. Только после проверки выполнить `npm run deploy`. Не использовать `--force`; при конфликте снова fetch/status/diff и разобраться с причиной.
6. После push выполнить `fetch`, `status`, проверить revision, webhook и статические файлы. CLI 0.2.0 может упасть на записи локального snapshot уже после успешной загрузки; в таком случае не повторять push вслепую — fetch/status покажут фактическое состояние сервера.
7. Проверить HTTP-доступность URL приложения и требуемых картинок.

CLI credentials хранятся в игнорируемом Git каталоге `.tgcloud/`. Не читать и не редактировать его вручную, не помещать токен в коммиты.

## Статус публикации и приёмки

- PR [#7](https://github.com/dvpot/umnozhayka/pull/7) принят в `main`; merge commit: `847554e467a73c2d343f66468e6953b9538feba9`.
- Перед публикацией выполнены свежие `fetch/status/diff`. CLI показал app `8854507045`, webhook `in sync`, два существующих модуля. Diff содержал только изменённый `handlers/message.js` и ожидаемые изменения статики; неизвестные модули не удалялись.
- `npm run deploy` загрузил обработчик и 9 static-файлов. Затем CLI 0.2.0 завершился с `ERR_INVALID_ARG_TYPE` при записи snapshot (получил boolean `false`). Последующий `tgcloud fetch` подтвердил revision `2`; `status` показал webhook `in sync`, static `Up to date (9 files)`; `diff` — `No changes`.
- URL <https://app8854507045.tgcloud.ai/> и ресурсы `/assets/welcome.png`, `/assets/favicon.svg` вернули HTTP 200.
- Локально пройдены 7/7 unit-тестов, сборка, Firefox QA на 280/320/390/768 px, `npm audit` (0 уязвимостей) и проверки обработчика на `/start`, адресованную команду, фильтрацию групп и fallback.
- Официальный Serverless SDK подтверждает динамические `api.sendPhoto(params)` и `api.sendMessage(params)`; Bot API принимает `reply_markup.inline_keyboard` с `web_app.url` в личном чате. Реальное получение сообщения Telegram-клиентом требует ручной проверки владельца.

4 ноября 2026 года владелец подтвердил, что настроил бота и проверил Mini App в Telegram; замечаний нет. Эта проверка подтверждает пользовательскую приёмку приложения, но не доказывает фактическую revision Serverless после следующего изменения исходников. Отдельное подтверждение доставки `/start` с картинкой не зафиксировано.

Перед каждым будущим выпуском исходников отдельно выполнить безопасную публикацию выше и проверить новую revision после загрузки. Настройку Menu Button не повторять без причины.

Дополнительные материалы по аватару, описаниям и командам: [BOT_PROFILE.md](BOT_PROFILE.md).
