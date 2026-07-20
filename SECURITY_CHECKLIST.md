# Security checklist

Статус MVP на 20.07.2026. `[x]` означает, что контроль реализован в коде; `[ ]` — обязательная production-задача. Канонический launch status: `docs/production-readiness.json`.

## Документы и файлы

- [x] Файлы не хранятся в `/public`.
- [x] Приватный storage path настраивается через env и защищён от path traversal.
- [x] Allowlist расширений: PDF, JPG/JPEG, PNG, DOC, DOCX.
- [x] Blocklist исполняемых/активных форматов: EXE, JS, SH, BAT, MSI, APK, DMG, HTML, SVG.
- [x] Проверяются расширение, заявленный MIME type и сигнатура файла.
- [x] Максимальный размер — 10 МБ.
- [x] Storage filename создаётся через UUID; original filename не участвует в пути.
- [x] Файлы создаются с правами `0600`, каталоги — `0700`.
- [x] Frontend получает только безопасные метаданные, без `storagePath`.
- [x] Скачивание идёт через ролевой API с `Cache-Control: private, no-store`.
- [x] Администраторские скачивания журналируются в `DocumentDownloadLog`.
- [x] Есть изолированный `antivirusCheck()` seam.
- [ ] Подключить ClamAV или managed malware scanner; карантин до clean verdict.
- [ ] Перенести storage в private object storage с KMS encryption, versioning и lifecycle policy.
- [ ] Добавить DLP/PII classification и retention schedule.

## Доступ и сессии

- [x] Сессия хранится в `HttpOnly`, `SameSite=Lax`, `Secure` в production cookie.
- [x] Cookie payload подписан HMAC-SHA256 и имеет срок жизни.
- [x] Пароли seed-пользователей хэшируются bcrypt.
- [x] Supplier-операции привязаны к `ownerId`; admin API требует роль `ADMIN`.
- [x] Каталог не доверяет UI и повторно фильтрует все trust/status условия в БД.
- [x] Demo seed fail-closed запрещён в staging/production; test identities не могут быть случайно загружены release job.
- [ ] Подключить полноценный identity provider / Auth.js, email verification и password reset.
- [ ] Добавить MFA для администраторов, session rotation, device/session revocation.
- [ ] Ввести least-privilege admin roles (billing reviewer, document reviewer, catalog moderator).

## Запросы, валидация и web security

- [x] Входы API валидируются Zod; Prisma использует параметризованные запросы.
- [x] Mutation endpoints требуют допустимый Origin и отклоняют missing/opaque/cross-site запросы; статический тест покрывает все state-changing routes.
- [x] Cookie не доступна JavaScript.
- [x] Добавлены per-request nonce CSP, production HSTS, API `no-store`, nosniff, frame deny, referrer, permissions и isolation headers.
- [x] Есть honeypot и rate-limit для login/register/buyer-request; production использует HTTPS shared contract и fail closed, memory разрешена только dev/test.
- [x] API использует единый безопасный error envelope без stack traces.
- [ ] Развернуть Redis/edge/shared limiter по документированному contract и применить edge abuse policy ко всем sensitive endpoints.
- [ ] Настроить WAF/bot protection и abuse monitoring.
- [ ] Провести SAST, dependency scanning, secret scanning, DAST и pentest.

## Биллинг и бизнес-логика

- [x] «Я оплатил» не активирует подписку.
- [x] Только admin confirmation переводит payment/invoice/subscription в подтверждённое состояние.
- [x] Критичные изменения выполняются транзакционно.
- [x] Биллинг и административные решения пишутся в append-style history/audit tables.
- [x] Публикация централизованно проверяет оплату, подписку, верификацию, блокировку и лимит.
- [ ] Подключить платёжный gateway и проверять подписанные webhooks.
- [ ] Добавить idempotency keys, reconciliation job и ledger для финансовых операций.
- [ ] Разделить права создания/подтверждения платежа (four-eyes control).
- [ ] Согласовать фискальные/бухгалтерские интеграции и процесс возвратов.

## Данные, инфраструктура и эксплуатация

- [x] Prisma schema содержит индексы для trust/status и operational queries.
- [x] GitHub Actions проверяет schema, types, tests, lint и production build.
- [x] Runtime fail-fast проверяет HTTPS origins, PostgreSQL TLS, demo mode, storage path и distributed limiter без утечки secret values.
- [x] Разделены liveness и dependency-aware readiness; probes возвращают `no-store` и безопасный `503`.
- [x] Standalone container запускается non-root и не содержит runtime secrets в build layers.
- [x] Админские решения содержат actor, entity, before/after, IP и user agent.
- [ ] Использовать отдельного DB-пользователя с минимальными правами; TLS до PostgreSQL.
- [ ] Шифровать backups и проверять восстановление по расписанию.
- [ ] Определить RPO/RTO, retention и incident response playbook.
- [ ] Централизовать structured logs, metrics, traces и security alerts.
- [ ] Настроить secret manager и регулярную ротацию секретов.
- [x] Dependency update policy автоматизирована; CycloneDX SBOM сохраняется как artifact и подписывается GitHub attestation на `main`.
- [ ] Провести legal review всех шаблонов в юрисдикции Казахстана.
- [ ] Провести privacy impact assessment и утвердить сроки хранения документов.

## Supply chain и delivery

- [x] `npm ci` использует зафиксированный lockfile.
- [x] Repository gate блокирует `.env`, private uploads, generated artifacts и high-confidence secrets.
- [x] Coverage thresholds применяются к критическим domain и HTTP helpers.
- [x] CI применяет migration и seed на PostgreSQL 17 и запускает authenticated HTTP smoke.
- [x] Production dependencies проверяются через `npm audit` на high/critical findings.
- [x] PostCSS advisory устранён совместимым override на patched release; `npm audit` проверяет полный и production dependency graph.
- [x] Dependency Review блокирует новые high-risk зависимости в pull requests; до включения GitHub Dependency Graph автоматически используется `npm audit` fallback.
- [x] CodeQL запускается для PR, `main` и по недельному расписанию.
- [x] Dependabot обновляет npm и GitHub Actions зависимости.
- [x] Workflow permissions минимизированы; checkout не сохраняет credentials.
- [ ] Включить branch protection для `main` с обязательными Quality и Security checks.
- [ ] Настроить private vulnerability reporting и incident response contacts.
