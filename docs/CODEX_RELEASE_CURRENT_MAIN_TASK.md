# Codex на Ubuntu VM — выпуск учёта неверных попыток

Рабочий каталог `/home/dvpot/projects/github/umnozhayka`. Источник истины — `dvpot/umnozhayka`, ветка `main`. Прочитай `AGENTS.md`, `README.md`, `docs/PLAN.md`, `docs/TELEGRAM_DEPLOY.md` и `docs/CODEX_CHECK_QA_TASK.md`. Синхронизируй `main` fast-forward, сохрани локальные изменения и запиши SHA.

1. На Node 22.13+ выполни `npm ci && npm run check`, проверь синтаксис изменённых JS и `git diff --check`. Повтори сценарии прогресса из `docs/CODEX_CHECK_QA_TASK.md` и проверь доступность «Проверить» на 320×480 и 400×612.
2. Выполни `npx tgcloud fetch`, `npx tgcloud status`, `npx tgcloud diff`. Подтверди app ID `8854507045`, revision и отсутствие неожиданных изменений. От revision 15 ожидаются `tgcloud/schema.js`, `tgcloud/lib/account-play.js`, `tgcloud/lib/live-progress.js`; в статике — `dist/app.js`, `dist/account-sync.js`, `dist/index.html` и `dist/styles.css`.
3. Проверь `npx tgcloud migrate --local --dry-run`. Ожидается только добавление `account_round_error`. Сначала опубликуй только схему через `npx tgcloud push tgcloud/schema.js`. Проверь `npx tgcloud migrate --dry-run`, примени `npx tgcloud migrate --safe` и подтверди отсутствие ожидающих изменений повторным dry run. Данные в прежних таблицах должны сохраниться. Перед публикацией модулей повтори `fetch/status/diff`. Затем загрузи `npx tgcloud push tgcloud/lib/account-play.js tgcloud/lib/live-progress.js`. Новый серверный код требует, чтобы таблица уже существовала.
4. Повтори `fetch/status/diff`, опубликуй статику отдельно через `npx tgcloud push dist`. Не используй `--force` и не запрашивай секреты. Проверь новую revision, отсутствие неожиданных удалений, HTTP 200 и совпадение файлов со сборкой.
5. В Telegram проверь, что два неверных ответа и исправление в каждом режиме дают «1 верно · 2 неверно», оба режима суммируются, а кнопки «Последнего прохода» переключают баллы. Проверь продолжение занятия и прогресс на втором устройстве одного аккаунта, если клиент доступен.
6. Запиши SHA, revision, миграцию, HTTP и фактическую QA в `docs/TELEGRAM_DEPLOY.md` через отдельный PR. Раздели проверку в реальном Telegram и в браузере. После слияния синхронизируй VM.

Если CLI сообщил ошибку записи snapshot после загрузки, сначала проверь фактическое состояние через `fetch/status/diff`.
