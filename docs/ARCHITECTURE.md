# Architecture: HoReCa KZ MVP

## Решение

Проект построен как **модульный монолит** на Next.js с единой PostgreSQL. Для команды и масштаба MVP это даёт атомарные транзакции, простое развёртывание и быстрые изменения без сетевой сложности микросервисов. Границы модулей уже отражены в коде, поэтому позже их можно выделять по измеренным нагрузкам и организационной необходимости.

Подход опирается на идеи из O’Reilly *Learning Domain-Driven Design*, *Fundamentals of Software Architecture, 2nd Edition*, *Designing Data-Intensive Applications, 2nd Edition* и *Web Application Security, 2nd Edition*: явный язык предметной области, высокая связность внутри модулей, низкое зацепление между ними, атомарные изменения критичного состояния, архитектурные trade-offs и defense in depth.

## Доменные границы

| Контекст | Ответственность | Основные сущности |
|---|---|---|
| Identity & Access | сессии, роли, ownership | User, signed session |
| Supplier Trust | профиль, согласия, документы, верификация | Company, CompanyVerification, CompanyDocument, LegalAcceptance |
| Billing | тариф, счёт, ручной платёж, история | SupplierPlan, Subscription, Invoice, Payment, BillingHistory |
| Catalog | карточки, видимость, ассортимент | Product, ProductCategory, DeliveryCity, ProductImage |
| Demand | B2B-заявки и будущий RFQ | BuyerRequest |
| Operations | модерация и трассируемость | AdminAuditLog, DocumentDownloadLog |

## Инварианты

Инварианты реализованы чистыми policy-функциями в `lib/domain` и транзакционными use cases в `lib/services`.

1. UI не определяет право публикации или активации.
2. Публичный query сам применяет полный trust predicate.
3. Администраторская активация повторно проверяет документы, согласия и оплату.
4. Подтверждение платежа атомарно изменяет Payment, Invoice, Subscription, BillingHistory и AuditLog.
5. Блокировка компании атомарно скрывает её опубликованные товары.

## Потоки данных

```mermaid
flowchart TD
  S[Поставщик] --> P[Профиль и согласия]
  P --> D[Приватные документы]
  D --> B[Счёт и proof of payment]
  B --> V[Ручная верификация]
  V --> A[Активная компания]
  A --> C[Публичный каталог]
```

## Security boundaries

- Browser не получает storage path и не имеет прямого доступа к файлам.
- Route Handler повторно проверяет роль и ownership для каждой операции.
- File pipeline применяет allowlist, MIME/signature validation, UUID naming и private permissions; staging/production дополнительно требуют fail-closed HTTPS malware scanner до сохранения.
- Admin download создаёт неизменяемую запись доступа.
- Payment confirmation отделена от supplier signal.
- Каждая HTML-страница получает уникальный CSP nonce; production CSP не допускает `unsafe-inline`/`unsafe-eval`.
- Mutation API требует явный разрешённый Origin и отклоняет отсутствующий, opaque или cross-site Origin до use case.
- API помечен `no-store`; HSTS и дополнительные browser isolation headers включаются в production build.
- Rate limit использует локальное состояние только в dev/test; production без HTTPS shared backend завершается fail-closed.
- `instrumentation.ts` проверяет deployed runtime до приёма трафика и никогда не возвращает secret values.
- Liveness не зависит от БД; readiness требует допустимую конфигурацию и успешный PostgreSQL probe.

## Deployment boundary

Приложение собирается в Next.js standalone OCI image и запускается non-root. Миграции отделены в one-shot image target, чтобы schema privileges не требовались runtime process. Один immutable image digest продвигается staging → production; rolling rollout требует backward-compatible migrations, readiness gating и возврат на предыдущий digest без destructive DB rollback.

Cloud-specific IaC намеренно не выбран без owner decision. `docs/DEPLOYMENT.md` фиксирует переносимый runtime contract, а production provider, workload identity, TLS/WAF, managed PostgreSQL, object storage и observe evidence остаются внешними controls.

## Эволюция на 3–6 месяцев

1. Добавить outbox table для надёжных уведомлений и аналитических событий.
2. Превратить `BuyerRequest` в RFQ aggregate: лоты, приглашения, предложения, дедлайн, award.
3. Добавить append-only price observations и supplier performance facts для data moat.
4. Рассчитывать trust score из проверяемых факторов, не из непрозрачной ручной оценки.
5. Выделять сервисы только после наблюдаемого bottleneck/ownership boundary; первыми кандидатами будут files/malware scanning и notifications.
6. Для платежей использовать provider webhooks, idempotency key, reconciliation и ledger.

## Architecture fitness functions

CI должен оставаться зелёным по runtime/repository/readiness gates, Prisma validate, strict TypeScript, coverage, ESLint, production build, migration/seed, authenticated HTTP smoke, dependency audit/review и CodeQL. Commercial launch дополнительно требует строгого readiness gate. Следующие fitness functions: dependency boundary linting, migration upgrade test с предыдущей версии, расширенные API contract tests и DAST.
