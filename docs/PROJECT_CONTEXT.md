# Project context

Последнее обновление: 17.07.2026.

Это долговременная память для следующего разработчика или coding agent. Она фиксирует текущее состояние, но не заменяет schema, tests и source code.

## Цель

HoReCa KZ — B2B marketplace проверенных поставщиков для food-service Казахстана. Текущий deliverable — рабочий MVP с public catalog, supplier onboarding, ручным billing/verification, admin moderation и Android WebView wrapper.

## Архитектура

- Один Next.js modular monolith.
- Pure policy: `lib/domain`.
- Transactional use cases: `lib/services`.
- HTTP boundaries: `app/api` + `lib/http.ts`.
- PostgreSQL/Prisma: `prisma/schema.prisma` и versioned migrations.
- Private uploads: filesystem seam в MVP, никогда не `/public`.
- Session: подписанная HMAC HttpOnly cookie.

Подробности: `docs/ARCHITECTURE.md`.

## Критические инварианты

1. Public catalog не показывает товар неподтверждённой/заблокированной компании или без активной подписки.
2. Publication требует verification, current subscription, confirmed payment и plan capacity.
3. Activation требует profile + legal acceptance + approved documents + confirmed payment + approved verification.
4. Supplier не управляет чужой компанией или товаром.
5. Admin decisions и private downloads оставляют audit evidence.
6. Client-side state никогда не является источником billing/trust решения.

## Проверенный путь качества

```bash
npm ci
npm run verify
npm run db:deploy
npm run db:seed
npm run smoke:http
npm run check:readiness
```

CI выполняет этот путь на Node.js 22 и PostgreSQL 17. Security workflow отдельно запускает dependency review с `npm audit` fallback, CodeQL и формирует подписанный CycloneDX SBOM на `main`.

## Demo state

- `admin@horeca.kz`
- `supplier@horeca.kz`
- `pending@horeca.kz`
- Локальный demo password: `demo123`

Demo credentials запрещены в production. Seed создаёт только тестовые документы и данные.

## Production readiness

MVP deliverable проверен, но commercial production readiness не заявлена. Канонические статусы, владельцы и exact next actions находятся в `docs/production-readiness.json`; человекочитаемое объяснение — в `docs/PRODUCTION_READINESS.md`.

`npm run check:readiness` валидирует registry. `npm run release:check` является строгим launch gate и должен оставаться красным до закрытия всех blocking controls.

## Известные production gaps

- Local storage нужно заменить на private object storage с encryption и lifecycle.
- `antivirusCheck()` нужно подключить к реальному malware scanner.
- In-memory rate limiter нужно заменить на Redis/edge limiter.
- Manual payment flow нужно заменить/дополнить подписанными идемпотентными provider webhooks.
- Нужны password reset, MFA для admin, session rotation/revocation.
- Legal/privacy/refund тексты требуют проверки юристом в Казахстане.
- Нужны CSP с nonce/hash, threat model, pentest, monitoring/alerting и backup/restore drill.

## Принятые решения

| Решение | Причина |
|---|---|
| Modular monolith | Быстрый MVP без преждевременной distributed complexity |
| Central domain policies | UI/API не должны расходиться в trust и billing rules |
| Manual admin payment confirmation | Клиентский сигнал не активирует subscription |
| Private local storage seam | Безопасный MVP-контур с понятной production replacement boundary |
| Deterministic gates + CI | Качество подтверждается командами, а не самоотчётом агента |
| Evidence-driven DoD | Review-ready, merge и runtime completion нельзя смешивать |
| Machine-readable readiness | Production blockers имеют status, owner, evidence и next action |

## Когда обновлять этот файл

Обновите дату и содержание, если изменились архитектурные границы, critical invariant, canonical command, demo flow, production gap или принятое решение. Не добавляйте временные debugging notes.
