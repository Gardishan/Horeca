# HoReCa KZ

Рабочий MVP B2B-маркетплейса проверенных поставщиков для ресторанов, кафе, кофеен, отелей, кейтеринга и food-service операторов Казахстана.

Это не лендинг: проект содержит публичный каталог, кабинет поставщика, ручной биллинг, верификацию и приватные документы, админ-панель, реальные API-переходы статусов, seed-данные и Android WebView wrapper.

## Возможности

- Публичный каталог показывает только опубликованные товары активных, проверенных, незаблокированных поставщиков с активной подпиской.
- Покупатель фильтрует товары и отправляет B2B-запрос поставщику.
- Поставщик заполняет профиль, принимает юридические документы, загружает документы, выбирает тариф, формирует счёт и отправляет компанию на проверку.
- Публикация товара централизованно проверяет статус компании, верификацию, подписку, подтверждённую оплату и лимит тарифа.
- Администратор проверяет документы, журналирует скачивания, подтверждает оплату, активирует/блокирует компании и модерирует товары.
- Все административные изменения критических статусов записываются в audit log.

## Стек

- Next.js 16, React 19, TypeScript
- Tailwind CSS 4
- Next.js Route Handlers
- Prisma 6 + PostgreSQL 17
- Zod 4
- Vitest 4
- Android Java WebView wrapper

## Быстрый запуск

Требования: Node.js 20.19+ (рекомендуется Node 22), npm и Docker.

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npm run db:migrate -- --name init
npm run db:seed
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000).

Если миграции уже созданы в целевой среде, используйте `npm run db:deploy` вместо `db:migrate`.

## Переменные окружения

| Переменная | Назначение |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Секрет подписи cookie, минимум 32 случайных символа |
| `APP_URL` | Серверный origin для проверки mutation-запросов |
| `NEXT_PUBLIC_APP_URL` | Публичный URL приложения |
| `PRIVATE_STORAGE_ROOT` | Корень приватного локального хранилища |
| `DEMO_AUTH_ENABLED` | Резерв для отключения demo-режима перед production |

Для генерации секрета можно использовать `openssl rand -base64 48`.

## Demo-аккаунты

Пароль для всех demo-аккаунтов: `demo123`.

| Роль | Email | Сценарий |
|---|---|---|
| Admin | `admin@horeca.kz` | Модерация, подтверждение оплаты, активация |
| Active supplier | `supplier@horeca.kz` | Активная PRO-подписка и опубликованные товары |
| Pending supplier | `pending@horeca.kz` | Документы и платёж ожидают проверки |

Demo-пароли предназначены только для локальной/тестовой среды.

## Основные страницы

### Публичная часть

- `/catalog` — каталог, поиск и фильтры
- `/catalog/[productId]` — товар, поставщик, блок доверия и B2B-заявка
- `/legal/offer` — MVP-оферта
- `/legal/privacy` — MVP-политика данных
- `/legal/supplier-verification` — правила проверки
- `/legal/refund-policy` — MVP-политика возвратов

### Поставщик

- `/register` — регистрация нового кабинета поставщика
- `/dashboard/company` — статусы и onboarding checklist
- `/dashboard/company/profile` — профиль компании
- `/dashboard/company/billing` — тариф, счёт и подтверждение оплаты
- `/dashboard/company/verification` — согласия и документы
- `/dashboard/products` — ассортимент
- `/dashboard/products/new` и `/dashboard/products/[productId]/edit`

### Администратор

- `/admin` — operational dashboard
- `/admin/verifications` — очередь документов, платежей и решений
- `/admin/company` и `/admin/company/[companyId]`
- `/admin/products`, `/admin/products/new`, `/admin/products/[productId]/edit`

## Ручной payment flow MVP

1. Поставщик выбирает START, PRO или PREMIUM.
2. Система создаёт pending subscription.
3. Поставщик формирует счёт.
4. Система создаёт invoice и payment со статусом `PENDING`.
5. Поставщик нажимает «Я оплатил» и загружает подтверждение.
6. Payment переходит в `PROOF_UPLOADED`.
7. Администратор подтверждает или отклоняет платёж.
8. При подтверждении invoice становится `PAID`, subscription — `ACTIVE`, а событие попадает в billing history и audit log.

В production необходимо подключить реальный платёжный шлюз, webhooks с идемпотентностью, фискальные и бухгалтерские интеграции. Клиентский сигнал «Я оплатил» никогда не активирует подписку сам.

## Бизнес-инварианты

Логика находится в `lib/domain` и `lib/services`, а не в UI:

- публичная видимость: `PUBLISHED + ACTIVE company + APPROVED verification + ACTIVE subscription + !blocked`;
- публикация: те же условия плюс `CONFIRMED payment` и лимит тарифа;
- отправка на проверку: полный профиль, OFFER + PRIVACY, обязательный документ, тариф, счёт и допустимый payment state;
- активация: полный профиль, согласия, все документы `APPROVED`, payment `CONFIRMED` и verification `APPROVED`.

Отказ возвращает все причины сразу, чтобы интерфейс мог объяснить пользователю, что именно осталось сделать.

## API

Route Handlers расположены в `app/api` и возвращают единый envelope:

```json
{ "ok": true, "data": {} }
```

или:

```json
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [] } }
```

Реализованы все публичные, supplier и admin endpoints из MVP-ТЗ: каталог, заявки, профиль, согласия, документы, биллинг, верификация, компании и товары.

## Приватные документы

Документы хранятся в `storage/private/company-documents`, исключены из Git и никогда не отдаются как статические файлы. Upload проверяет размер, расширение, MIME и magic bytes; имя генерируется через UUID. Администратор скачивает файл только через защищённый API, каждое скачивание создаёт `DocumentDownloadLog`.

`antivirusCheck()` — явный MVP seam. Перед production замените его на ClamAV или managed malware scanning и перенесите файлы в private S3-compatible object storage с encryption-at-rest.

## Проверки качества

```bash
npm run quality:quick
npm run verify
npm run security:audit
```

`npm run validate` сохранён как alias полного `verify`. Gate проверяет состав репозитория, Prisma schema, strict TypeScript, coverage thresholds, ESLint и production build.

После `build`, миграции и seed можно выполнить HTTP smoke test: `npm run smoke:http`.

GitHub Actions дополнительно поднимает PostgreSQL 17, применяет migration, выполняет seed и сквозной HTTP smoke. Отдельный security workflow запускает dependency review (или `npm audit`, пока Dependency Graph недоступен) и CodeQL; Dependabot обновляет npm и Actions зависимости.

### Agent-assisted разработка

- `AGENTS.md` — обязательные границы, инварианты и матрица проверки для coding agents.
- `docs/ENGINEERING_PLAYBOOK.md` — search-first, TDD, debugging, security и verification loop.
- `docs/PROJECT_CONTEXT.md` — долговременное текущее состояние и production gaps.
- `CONTRIBUTING.md` — воспроизводимый процесс изменения и PR.

Процесс адаптирован из MIT-проекта [Everything Claude Code / ECC](https://github.com/affaan-m/ECC); атрибуция сохранена в `THIRD_PARTY_NOTICES.md`.

## Android WebView APK

Android-проект находится в `android/`. Откройте его в Android Studio или создайте wrapper и соберите:

```bash
cd android
gradle wrapper
./gradlew assembleDebug -PwebAppUrl=http://10.0.2.2:3000
```

Production URL:

```bash
./gradlew assembleRelease -PwebAppUrl=https://horeca.kz
```

Подробности — в `android/README.md`. Wrapper включает JavaScript и DOM storage, back navigation, loading indicator, cookie session, запрет file/content access и отсутствие JavaScript bridge.

## Структура

```text
app/                 страницы и Route Handlers
components/          UI, формы, каталог и admin-компоненты
lib/domain/          чистые бизнес-правила
lib/services/        транзакционные use cases и запросы к Prisma
prisma/              schema и воспроизводимый seed
storage/private/     приватные локальные файлы (не Git)
tests/               unit-тесты доменных инвариантов
android/             WebView wrapper
docs/                архитектурные решения
```

## Важные ограничения MVP

- Сессионная cookie подписана HMAC, но нет self-service регистрации, восстановления пароля, MFA и ротации сессий.
- Rate limiting хранится в памяти одного процесса; production требует Redis/edge limiter.
- Локальные файлы не подходят для serverless/нескольких реплик.
- Нет реального антивируса и платёжного шлюза.
- Тексты оферты, privacy и refund policy — заготовки и должны быть проверены юристом в Казахстане.
- Перед коммерческим запуском необходимы threat model, pentest, backup/restore drill, мониторинг, алерты и privacy impact review.

## Дальнейшее развитие

Модульный монолит позволяет без преждевременного перехода к микросервисам добавить RFQ/тендеры, supplier trust score, повторные заказы, аналитику цен и спроса, рейтинги, notifications/outbox, payment webhooks и data warehouse. См. `docs/ARCHITECTURE.md`.
