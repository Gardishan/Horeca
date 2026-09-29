# Project context

Последнее обновление: 29.09.2026.

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
- Private uploads: filesystem разрешён в dev/test и demo-only single-replica Beta; staging/production требуют S3-compatible boundary, никогда не `/public`.
- Session: подписанная HMAC HttpOnly cookie.
- Deployment: Next.js standalone non-root image, отдельный migration target, startup validation, split liveness/readiness и fail-closed проверка состава runtime artifact. Production build использует `next build --webpack`: Turbopack 16.3.6 пропускает Prisma external alias в standalone. HTTP smoke запускает копию runtime вне репозитория и запрещает escaping symlinks, чтобы родительский `node_modules` не скрывал отсутствующие зависимости.
- Controlled Beta: access token → подписанная HttpOnly cookie, runtime kill switch, noindex и demo-only upload/payment policy.
- Заявки: `/dashboard/requests` и `/api/dashboard/requests` читают контакты и сообщения только компании authenticated supplier, по 24 записи на страницу, с `private, no-store` для API.
- Billing UI связывает счёт с выбранной pending subscription; наличие старого счёта не скрывает создание нового.
- Параметры каталога проходят общую Zod-проверку на HTTP, page и service boundary; некорректная пагинация не доходит до Prisma.
- Grid-элементы внутри `.app-shell` имеют `min-width: 0`: на мобильном экране прокручиваются nav/table wrappers, а не весь кабинет.

Подробности: `docs/ARCHITECTURE.md`.

## Критические инварианты

1. Public catalog не показывает товар неподтверждённой/заблокированной компании или без активной подписки.
2. Publication требует verification, current subscription, confirmed payment и plan capacity.
3. Activation требует profile + legal acceptance + approved documents с допустимым antivirus verdict + confirmed payment + approved verification.
4. Supplier не управляет чужой компанией или товаром.
5. Admin decisions и private downloads оставляют audit evidence.
6. Client-side state никогда не является источником billing/trust решения.
7. Generic profile update не меняет trust/block/billing status; payment decision возможен только из `PROOF_UPLOADED`, не обращает terminal status и атомарно конкурирует с противоположным решением.
8. Featured-размещение товара управляется только администратором; supplier API не принимает `isFeatured`.
9. Payment proof доступен администратору только через audited download; storage path не попадает в API, а отклонённый proof нельзя повторно подать сигналом «Я оплатил».
10. Verification/document decisions используют conditional transition из review-состояния; terminal decision нельзя обратить противоположным endpoint.
11. Все payment mutation responses используют безопасный view с `hasProof`; приватный locator не покидает service boundary.
12. Завершённая verification attempt неизменяема: повторная подача создаёт новую попытку, `PENDING` submit идемпотентен, а aggregate company state меняется compare-and-swap.
13. Неожиданный API 500 имеет один correlation ID в response/header/structured log и не журналирует raw error details.
14. `APP_ENV=beta` не обслуживает traffic без `BETA_ENABLED=true` и валидной access cookie; health/readiness сохраняют операторский контроль.
15. Controlled Beta не принимает upload/payment signal без server-side подтверждения demo-only policy; public registration закрыта по умолчанию.

## Проверенный путь качества

```bash
npm ci
npm run verify
npm run check:unused
npm run db:deploy
npm run db:seed
npm run smoke:http
npm run check:readiness
npm run mvp:check-readiness
npm run runtime:validate
```

CI выполняет этот путь на Node.js 22 и PostgreSQL 17. Security workflow отдельно запускает dependency review с policy-aware audit fallback, еженедельный production-zero/full-allowlist audit, CodeQL и формирует подписанный CycloneDX SBOM на `main`.

Production dependency audit должен оставаться без известных уязвимостей.
Временные исключения полного development graph допустимы только в
`docs/security/advisories.json` с владельцем, mitigations, tracking и
непросроченной датой повторной проверки. Gate отклоняет незарегистрированные
high findings, любые critical findings и stale exception после исправления
dependency graph.

На 24.09.2026 advisory registry пуст. Security update использует Next/eslint
config 16.3.6, Vitest/coverage 4.1.11, sharp 0.35.4 и js-yaml 4.3.2.
Prisma остаётся 6.19.3; override фиксирует transitive deepmerge-ts 8.0.2 для закрытия high advisory. Config использует plain objects,
а затронутые breaking changes Maps/deepmergeInto здесь не применяются.
`npm ci`, Prisma generate/validate и audit подтверждают совместимость.

## Demo state

Локальный seed создаёт administrator, active-supplier и pending-supplier
сценарии, доступные через role-buttons на `/login`. Точные demo-credentials
не являются документируемым контрактом. Demo authentication запрещена в
production; seed создаёт только тестовые документы и данные.

## Production readiness

MVP deliverable проверен, но commercial production readiness не заявлена. Канонические статусы, владельцы и exact next actions находятся в `docs/production-readiness.json`; человекочитаемое объяснение — в `docs/PRODUCTION_READINESS.md`.

`npm run check:readiness` валидирует registry. `npm run release:check` является строгим launch gate и должен оставаться красным до закрытия всех blocking controls.

## MVP Beta launch readiness

Registry `docs/mvp-launch-readiness.json` требует восемь обязательных controls.
На 29.09.2026: 3 done, 2 in progress, 3 blocked. Финальный запуск не объявлен;
[issue 44](https://github.com/Gardishan/Horeca/issues/44) остаётся открытой.

Railway Hobby, проект `horeca-kz-beta` / среда `beta`, PostgreSQL 17.11 с TLS 1.3
и persistent volumes настроены. Три GitHub Environment secrets присутствуют;
SSH host pin получен через initial trust, без независимой проверки fingerprint.
GitHub auto-deploy выключен; rollout выполняется ручным **Beta Launch**.

Кандидат `00a7b3a03fb6d177aadffb1abf8fa6cbe895bda2` прошёл workflow 36225121691:
external HTTPS invite/auth/roles/private-download smoke, DB/file persistence,
provider rollback/restore одной версии и APK с внешним origin. Физический restart
PostgreSQL 24.09 и continuity readback 29.09 подтверждают сохранность той же БД.
Свежее ограниченное наблюдение 00a7: 193 HTTP rows / 0 HTTP 5xx; один 401 auth log event
при быстрой смене страниц исследован отдельным успешным обычным logout.

PR #74 исправил мобильный overflow кабинетов; main
`28d066a9b05e24384cc271eb6511973f33b8355d` прошёл Quality 36600977390 и
Security 36600977405 (276 tests, container/DB/HTTP smoke, audit и signed SBOM).
Browser CSS simulation прошла 39/39 измерений, но новый runtime ещё не проверен.
Railway API incident YYTG8I10 задержал deployment; workflow 36601519494 отменён
до enable, deployment e63096f1 подтверждён REMOVED, pending deployments нет.
Внешняя readiness 17:10 UTC продолжает показывать 200 / 00a7. Сохранённые переменные
следующего deployment: BETA_ENABLED=false, DEPLOYMENT_VERSION=28d066a; это не
текущее окружение уже запущенного процесса. Cross-version rehearsal подготовлен,
но не выполнялся; условный launcher остановлен. Tag/Release не созданы.

Возобновление: после восстановления провайдера проверить отсутствие pending
rollouts, выполнить Beta Launch на актуальном зелёном main, собрать matching
SHA/image/APK/SBOM, проверить browser/mobile, rollback с restore и observe window.
Затем полный strict MVP gate, exact-SHA prerelease и закрытие #44. Docs-only merge
меняет следующий launch SHA, поэтому старые артефакты нельзя переименовывать.

Точные факты и ограничения: `docs/releases/mvp-beta-2026-09-29/README.md`;
инструкция участникам/оператору: `docs/BETA_GUIDE.md`. Bootstrap private PDF
остаётся отдельным runtime-шагом; seed runner не переносит файлы в volume.
APK verifier проверяет все root DEX; Railway rollback — scalar Boolean с явным true.
Обычный failure cleanup ждёт до 15 минут; cancellation — best effort 240 секунд.

## Beta page gate: исправление matcher

В проверке 29.09 обнаружен обход page invite/kill switch через клиентские
prefetch-заголовки: `missing` исключал такие запросы из proxy. PR #58 убирает
исключение и проверяет реальный matcher Next для обычной навигации, prefetch
и RSC; cookie не обходит выключенную Beta. Внешний smoke теперь проверяет
`/catalog`, `/dashboard/company` и `/admin` без приглашения в обоих состояниях
Beta, а также каталог с действующим приглашением для каждого класса запроса.
Static/health exemptions и API role guards сохраняются. Registry остаётся
`in_progress` до нового внешнего enabled/disabled smoke; старое evidence 00a7
не подтверждает исправленный page gate. Проверка читаемости demo PDF — отдельное
исправление: этот PR не повышает проверку PDF magic до доказательства валидного PDF.

## Известные production gaps

- Application-side S3-compatible storage boundary готов; нужно создать private buckets, IAM/KMS/lifecycle/retention controls и приложить staging evidence.
- Fail-closed HTTPS contract для `antivirusCheck()` готов; нужно развернуть реальный malware scanner и согласованный quarantine/clean flow, затем приложить staging evidence.
- Нужно развернуть shared rate-limit backend по `docs/RATE_LIMIT_BACKEND.md`, WAF и проверить несколько реплик в staging; memory mode разрешён только dev/test или access-gated single-replica Beta.
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
| Private S3-compatible storage boundary | Filesystem ограничен dev/test и demo-only single-replica Beta; commercial deployed runtime fail-fast требует private object storage и явный SSE/KMS mode |
| Deterministic gates + CI | Качество подтверждается командами, а не самоотчётом агента |
| Fact-first incremental delivery | Callers и контракты проверяются до правки; несогласованные defaults/fallbacks и неиспользуемый код блокируются |
| Evidence-driven DoD | Review-ready, merge и runtime completion нельзя смешивать |
| Machine-readable readiness | Production blockers имеют status, owner, evidence и next action |
| Fail-closed abuse boundary | Production не продолжает rate-limited flow при отсутствии shared backend |
| Provider-neutral OCI baseline | Railway выбран для controlled Beta; commercial cutover ещё не согласован, immutable standalone image сохраняет переносимость |
| Split health probes | Liveness управляет restart, readiness не пускает traffic без config + PostgreSQL |
| Dependabot minor/patch automation | Major toolchain upgrades требуют совместимой migration всей матрицы; security updates остаются независимыми |
| Runtime/type major alignment | Node.js runtime, engine pins и `@types/node` остаются на одной major-ветке; repository gate блокирует drift |
| Fail-closed malware boundary | Mock разрешён только dev/test и demo-only controlled Beta; commercial deployed runtime требует HTTPS scanner, а outage/unknown verdict блокирует upload до storage |
| Fail-closed storage boundary | Deployed runtime запрещает filesystem; S3 outage/malformed body блокируют flow без утечки provider details |
| Minimal standalone artifact | Явные tracing exclusions и build gate не допускают source/tests/docs/coverage в runtime image |
| Time-bound advisory exception | Dev-only finding без совместимого исправления имеет expiry, mitigations и tracking; production audit остаётся блокирующим |
| Guarded privileged transitions | Generic profile update не меняет trust state; payment confirm/reject использует проверяемую state machine и conditional write; deployed activation повторно требует scanner-clean documents |
| Audited payment proof boundary | Admin API возвращает только `hasProof`; скачивание проходит через object-level endpoint и audit, rejected proof требует нового upload |
| Terminal review decisions | Verification/document decisions используют compare-and-swap; одинаковый повтор идемпотентен, reversal и конкурентное противоположное решение запрещены |
| Immutable verification attempts | Terminal review evidence не перезаписывается supplier submit/upload; новая подача создаёт отдельную attempt, а `PENDING` переиспользуется идемпотентно |
| Safe payment mutation view | Billing mutations возвращают `hasProof` вместо приватного `proofFilePath` |
| Correlated safe API failures | Generic 500 связывается одним request ID между клиентом и structured log без raw error details |
| Separate controlled Beta | Beta проверяет продукт на синтетических данных за access gate; её evidence не повышает commercial readiness |

## Читаемость демонстрационных PDF

Seed, volume bootstrap и persistence probes используют общий
`scripts/demo-pdf.mjs`: одностраничный PDF с явной отметкой DEMO ONLY.
Прежние placeholders имели только PDF-header без дерева страниц и xref;
проверка сигнатуры не доказывает читаемость документа. Теперь unit и HTTP smoke
используют независимый `pypdf` parser в strict mode. Для локального `verify`
и smoke нужен Python venv с `scripts/pdf-validation-requirements.txt` и
`PDF_VALIDATION_PYTHON`; порядок установки описан в README. В runtime Python
не добавлен. Bootstrap `--repair-legacy` заменяет только точные старые пять
fixtures при выключенной demo-only Beta; неизвестные файлы не перезаписывает.

## Когда обновлять этот файл

Обновите дату и содержание, если изменились архитектурные границы, critical invariant, canonical command, demo flow, production gap или принятое решение. Не добавляйте временные debugging notes.
