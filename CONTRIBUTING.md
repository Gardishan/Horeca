# Разработка HoReCa KZ

## Быстрый старт

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

## Quality gates

```bash
npm run quality:quick
npm run verify
npm run security:audit
```

Для изменений данных и сквозных сценариев:

```bash
docker compose up -d postgres
npm run db:deploy
npm run db:seed
npm run smoke:http
```

CI повторяет full verification на PostgreSQL 17, включая migration, seed и HTTP smoke.

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
- Реализованные и pending security controls: `SECURITY_CHECKLIST.md`.
