# Project context

Последнее обновление: 21.07.2026.

Это долговременная память для следующего разработчика или coding agent. Она фиксирует текущее состояние, но не заменяет schema, tests и source code.

## Цель

HoReCa KZ — B2B marketplace проверенных поставщиков для food-service Казахстана. Текущий deliverable — рабочий MVP с public catalog, supplier onboarding, ручным billing/verification, admin moderation и Android WebView wrapper.

## Архитектура

- Один Next.js modular monolith.
- Pure policy: `lib/domain`.
- Transactional use cases: `lib/services`.
- HTTP boundaries: `app/api` + `lib/http.ts`.
- Web perimeter: strict Origin, nonce CSP, production HSTS/API `no-store` и fail-closed remote rate-limit contract.
- PostgreSQL/Prisma: `prisma/schema.prisma` и versioned migrations.
- Private uploads: filesystem только dev/test; staging/production требуют S3-compatible boundary, никогда не `/public`.
- Session: подписанная HMAC HttpOnly cookie.
- Deployment: Next.js standalone non-root image, отдельный migration target, startup validation и split liveness/readiness.

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
npm run check:unused
npm run db:deploy
npm run db:seed
npm run smoke:http
npm run check:readiness
npm run runtime:validate
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

- Application-side S3-compatible storage boundary готов; нужно создать private buckets, IAM/KMS/lifecycle/retention controls и приложить staging evidence.
- Fail-closed HTTPS contract для `antivirusCheck()` готов; нужно развернуть реальный malware scanner и согласованный quarantine/clean flow, затем приложить staging evidence.
- Нужно развернуть shared rate-limit backend по `docs/RATE_LIMIT_BACKEND.md`, WAF и проверить несколько реплик в staging; memory mode разрешён только dev/test.
- Manual payment flow нужно заменить/дополнить подписанными идемпотентными provider webhooks.
- Нужны password reset, MFA для admin, session rotation/revocation.
- Legal/privacy/refund тексты требуют проверки юристом в Казахстане.
- Нужны threat model, pentest, monitoring/alerting и backup/restore drill; nonce CSP и strict mutation Origin уже проверяются автоматически.
- Deployable image и rollback contract готовы, но hosting target, live IaC, domain/TLS, multi-replica staging и cutover evidence ещё не выбраны.

## Принятые решения

| Решение | Причина |
|---|---|
| Modular monolith | Быстрый MVP без преждевременной distributed complexity |
| Central domain policies | UI/API не должны расходиться в trust и billing rules |
| Manual admin payment confirmation | Клиентский сигнал не активирует subscription |
| Private S3-compatible storage boundary | Filesystem ограничен dev/test; deployed runtime fail-fast требует private object storage и явный SSE/KMS mode |
| Deterministic gates + CI | Качество подтверждается командами, а не самоотчётом агента |
| Fact-first incremental delivery | Callers и контракты проверяются до правки; несогласованные defaults/fallbacks и неиспользуемый код блокируются |
| Evidence-driven DoD | Review-ready, merge и runtime completion нельзя смешивать |
| Machine-readable readiness | Production blockers имеют status, owner, evidence и next action |
| Fail-closed abuse boundary | Production не продолжает rate-limited flow при отсутствии shared backend |
| Provider-neutral OCI baseline | Hosting ещё не выбран; immutable standalone image сохраняет переносимость и единый tested artifact |
| Split health probes | Liveness управляет restart, readiness не пускает traffic без config + PostgreSQL |
| Dependabot minor/patch automation | Major toolchain upgrades требуют совместимой migration всей матрицы; security updates остаются независимыми |
| Runtime/type major alignment | Node.js runtime, engine pins и `@types/node` остаются на одной major-ветке; repository gate блокирует drift |
| Fail-closed malware boundary | Mock разрешён только dev/test; deployed runtime требует HTTPS scanner, а outage/unknown verdict блокирует upload до storage |
| Fail-closed storage boundary | Deployed runtime запрещает filesystem; S3 outage/malformed body блокируют flow без утечки provider details |

## Когда обновлять этот файл

Обновите дату и содержание, если изменились архитектурные границы, critical invariant, canonical command, demo flow, production gap или принятое решение. Не добавляйте временные debugging notes.
