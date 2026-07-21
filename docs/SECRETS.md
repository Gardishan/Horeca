# Runtime secrets and rotation

Этот документ является inventory имён и процедур. Значения секретов, production identifiers, access policies и raw readback здесь не хранятся.

## Inventory

| Имя | Secret | Consumer | Rotation model |
|---|---:|---|---|
| `DATABASE_URL` | да | Prisma runtime и migration job | новый least-privilege DB credential → deploy → revoke старый |
| `AUTH_SECRET` | да | HMAC session cookie | controlled rotation с принудительным повторным login |
| `RATE_LIMIT_BACKEND_TOKEN` | да | shared limiter client | backend принимает old+new → deploy new → revoke old |
| `MALWARE_SCAN_BACKEND_TOKEN` | да | remote malware scanner client | scanner принимает old+new → deploy new → revoke old |
| `APP_ENV` | нет | runtime policy | immutable per environment |
| `DEPLOYMENT_VERSION` | нет | readiness/evidence | commit SHA или release identifier |
| `APP_URL` | нет | same-origin policy | меняется вместе с approved domain/cutover |
| `NEXT_PUBLIC_APP_URL` | нет | public origin contract | тот же origin, что `APP_URL` |
| `PRIVATE_STORAGE_ROOT` | нет | MVP filesystem seam | absolute runtime path; production replacement tracked in #15 |
| `DEMO_AUTH_ENABLED` | нет | demo account guard | всегда `false` в staging/production |
| `RATE_LIMIT_MODE` | нет | abuse boundary | всегда `remote` в staging/production |
| `RATE_LIMIT_ALLOW_IN_MEMORY` | нет | test-only override | всегда `false` в staging/production |
| `RATE_LIMIT_BACKEND_URL` | нет | limiter endpoint | HTTPS only |
| `MALWARE_SCAN_MODE` | нет | file security boundary | `remote` в staging/production; `mock` только dev/test |
| `MALWARE_SCAN_BACKEND_URL` | нет | malware scanner endpoint | HTTPS only; URL не содержит credentials |
| `MALWARE_SCAN_TIMEOUT_MS` | нет | scanner availability bound | явное значение 1000–60000 ms |

`lib/runtime-config.ts` проверяет inventory при запуске и возвращает только безопасный summary. Ошибки перечисляют имена нарушенных controls и не включают secret values.

## Storage policy

- Создайте отдельный secret path/namespace для `staging` и `production`.
- Дайте workload identity только read access к точным secret versions, необходимым приложению.
- Migration identity получает DB migration privileges только на время release job; application identity не должна владеть schema.
- Запретите секреты в Docker build args, image environment defaults, labels, logs, GitHub variables, Terraform outputs и shell history.
- Audit access к secret store и настройте alert на чтение человеком вне approved break-glass procedure.

## Rotation drill

### Database

1. Создать новый credential с теми же минимальными runtime privileges.
2. Обновить secret version и выполнить rolling deployment.
3. Проверить readiness, login, catalog и admin flow.
4. Отозвать старый credential и подтвердить, что новые replicas продолжают работать.

### Rate-limit backend

1. Временно разрешить old и new token на backend.
2. Обновить managed secret и перезапустить replicas.
3. Проверить allow, deny, timeout и malformed-response paths.
4. Отозвать old token и проверить alerts/readback.

### Malware scanner

1. Настроить scanner на временный приём old и new token.
2. Обновить managed secret и выполнить rolling deployment.
3. Проверить clean, infected/EICAR, timeout, malformed-response и outage paths по `docs/MALWARE_SCAN_BACKEND.md`.
4. Отозвать old token и проверить, что application не логирует token или file bytes.

### Session signing

Текущая HMAC cookie поддерживает один `AUTH_SECRET`. Его rotation намеренно инвалидирует существующие sessions: обновите secret, выполните coordinated rollout и потребуйте повторный login. Бесшовный dual-key overlap должен внедряться вместе с session store/revocation в issue #17, а не имитироваться документацией.

## Evidence для #21

Закрытие требует managed secret store, policy readback, workload identity, timestamped rotation drill и rollback. Этот inventory и fail-fast validation закрывают только application-side контракт; статус readiness остаётся `blocked` до runtime evidence.
