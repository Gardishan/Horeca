# Security checklist

Статус MVP на 16.07.2026. `[x]` означает, что контроль реализован в коде; `[ ]` — обязательная production-задача.

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
- [ ] Удалить demo accounts/пароли из production seed.
- [ ] Подключить полноценный identity provider / Auth.js, email verification и password reset.
- [ ] Добавить MFA для администраторов, session rotation, device/session revocation.
- [ ] Ввести least-privilege admin roles (billing reviewer, document reviewer, catalog moderator).

## Запросы, валидация и web security

- [x] Входы API валидируются Zod; Prisma использует параметризованные запросы.
- [x] Mutation endpoints проверяют `Sec-Fetch-Site` и допустимый Origin.
- [x] Cookie не доступна JavaScript.
- [x] Добавлены security headers: nosniff, frame deny, referrer и permissions policy.
- [x] Есть honeypot и ограничение частоты login/buyer-request в памяти.
- [x] API использует единый безопасный error envelope без stack traces.
- [ ] Добавить synchronizer/double-submit CSRF token для high-risk админских действий.
- [ ] Перенести rate limiting в Redis/managed edge limiter, применять ко всем sensitive endpoints.
- [ ] Добавить CSP с nonce, HSTS и production-specific allowed origins.
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
- [x] Админские решения содержат actor, entity, before/after, IP и user agent.
- [ ] Использовать отдельного DB-пользователя с минимальными правами; TLS до PostgreSQL.
- [ ] Шифровать backups и проверять восстановление по расписанию.
- [ ] Определить RPO/RTO, retention и incident response playbook.
- [ ] Централизовать structured logs, metrics, traces и security alerts.
- [ ] Настроить secret manager и регулярную ротацию секретов.
- [ ] Добавить dependency update policy и SBOM.
- [ ] Провести legal review всех шаблонов в юрисдикции Казахстана.
- [ ] Провести privacy impact assessment и утвердить сроки хранения документов.

