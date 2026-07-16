# Разработка HoReCa KZ

## Быстрый старт

Используйте Node.js 22.x. `.nvmrc` и `.node-version` являются каноническими runtime pins.

```bash
cp .env.example .env
docker compose up -d postgres
npm ci
npm run db:deploy
npm run db:seed
npm run dev
```

Не используйте реальные документы, реквизиты или пароли в локальной базе и seed.

## Порядок изменения

1. Создайте ветку от актуального `main`.
2. Найдите существующий domain rule, service и тест до добавления нового слоя.
3. Добавьте тест пользовательского результата и отказа.
4. Реализуйте минимальное изменение в правильной архитектурной границе.
5. Запустите узкие тесты, затем `npm run verify`.
6. Для schema/API/auth/billing/uploads выполните дополнительные проверки из `AGENTS.md`.
7. Заполните PR template фактическими командами и результатами.
8. Не закрывайте parent issue, если обязательные leaf-задачи, runtime evidence или external approvals остаются открыты.

## Quality gates

```bash
npm run quality:quick
npm run verify
npm run security:audit
npm run check:readiness
```

Для изменений данных и сквозных сценариев:

```bash
docker compose up -d postgres
npm run db:deploy
npm run db:seed
npm run smoke:http
```

CI повторяет full verification на PostgreSQL 17, включая migration, seed и HTTP smoke.

`npm run release:check` предназначен для commercial production candidate и остаётся красным, пока registry содержит blocking controls.

## Runtime и сбои окружения

Перед выводом о дефекте зафиксируйте `node -v`, `npm -v`, путь runtime и повторите проверку под Node.js 22. Поломка локального package manager или native library классифицируется как environment blocker, пока тот же тест не воспроизведён на поддерживаемом runtime.

Не создавайте ручные symlink между несовместимыми версиями native libraries. Восстановите поддерживаемый runtime через version manager и повторите исходную команду.

## Тесты

- Unit tests проверяют чистые policy, validation и helpers.
- Integration/smoke проверяют реальные HTTP, cookie roles, database и private download.
- Для исправления дефекта сначала добавьте воспроизводящий тест.
- Не ослабляйте coverage threshold без объяснения в PR.
- Не удаляйте негативный тест только потому, что он выявил проблему реализации.

## Prisma migrations

- Меняйте `prisma/schema.prisma` и добавляйте новую папку migration.
- Не переписывайте migration, уже попавшую в `main`.
- Проверяйте migration на чистой PostgreSQL, а не только на существующей локальной базе.
- Для удаления/переименования поля используйте expand-contract и документируйте rollback.

## Pull requests

Используйте conventional title, например:

```text
feat: add supplier RFQ workflow
fix: enforce payment ownership on publication
security: harden document download audit
```

PR блокируется при failing quality/security checks, неизвестном destructive migration, утечке секрета, отсутствии server-side authorization или тестов критического перехода.

## Документация

- Контракты запуска и demo flow: `README.md`.
- Архитектурные решения: `docs/ARCHITECTURE.md`.
- Текущее состояние и известные gaps: `docs/PROJECT_CONTEXT.md`.
- Процесс проверки: `docs/ENGINEERING_PLAYBOOK.md`.
- Definition of Done: `docs/DEFINITION_OF_DONE.md`.
- Иерархия источников: `docs/KNOWLEDGE_POLICY.md`.
- Commercial launch status: `docs/PRODUCTION_READINESS.md` и `docs/production-readiness.json`.
- Реализованные и pending security controls: `SECURITY_CHECKLIST.md`.
