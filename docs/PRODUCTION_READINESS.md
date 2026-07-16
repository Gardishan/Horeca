# Production readiness

HoReCa KZ имеет проверенный MVP, но на 17.07.2026 не является готовым к коммерческому production-запуску. Канонический machine-readable статус находится в `docs/production-readiness.json`.

## Команды

```bash
npm run check:readiness
npm run release:check
```

Первая команда проверяет схему registry, уникальность controls, наличие владельца, evidence и точного next action. Она не скрывает открытые blockers, но завершается успешно, если статус честно и корректно описан.

`release:check` дополнительно выполняет полный verify, dependency audit и strict readiness. До закрытия всех blocking controls эта команда должна завершаться ошибкой. Удалять blocker или менять `blocking: false` только ради зелёного результата запрещено.

## Как обновлять control

Перевод в `done` разрешён только когда:

1. выполнен технический и управленческий DoD;
2. evidence находится в репозитории или ведёт на стабильный безопасный runtime-артефакт;
3. для infra/runtime подтверждены staging, rollout, rollback и observe window;
4. внешний владелец явно дал необходимое approval;
5. related issue закрывает leaf scope, а не скрывает открытые части parent epic.

Статусы:

- `done` — контроль реально действует и имеет evidence;
- `planned` — close path понятен и работа может быть запланирована;
- `blocked` — сначала требуется внешнее решение, доступ, поставщик или юридическое согласование.

## Текущая очередь

Готово и поддерживается CI:

- критические MVP-сценарии;
- server-side бизнес-инварианты;
- воспроизводимая PostgreSQL schema/migration/seed;
- quality, integration, dependency и CodeQL gates.

Можно планировать после создания leaf issue:

- web perimeter: distributed rate limiting, CSRF, nonce CSP, HSTS/WAF;
- repository protection: ruleset/branch protection и private vulnerability reporting.
- dependency advisory: пересмотр до 01.08.2026 и compatible upgrade без принудительного downgrade Next.js.

Сначала нужен owner decision или внешний доступ:

- hosting/IaC и production cutover;
- managed database и restore drill;
- identity provider;
- object storage и malware scanning;
- payment/fiscal integration;
- monitoring, secret manager, legal/privacy approval;
- Android signing и production distribution.

Подробные владельцы и закрывающие действия хранятся в registry и выводятся `npm run check:readiness`.
