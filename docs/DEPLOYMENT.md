# Deployment contract

HoReCa KZ поставляется как self-hosted Next.js 16 Node.js container. Контракт остаётся provider-neutral: один и тот же image можно запустить в Kubernetes, managed container service или VM orchestration без изменения приложения. Официально Next.js поддерживает Docker и `output: "standalone"`; конфигурация проекта следует этим runtime boundaries.

Код и Dockerfile создают **deployable baseline**, но сами по себе не закрывают production control. Issue #14 закрывается только после выбора платформы, staging readback, rollback rehearsal, разрешённого cutover и observe window.

## Артефакты

| Артефакт | Назначение |
|---|---|
| `Dockerfile` target `runner` | минимальный non-root standalone application image |
| `Dockerfile` target `migration` | отдельный one-shot job для `prisma migrate deploy` |
| `instrumentation.ts` | fail-fast проверка runtime-конфигурации до приёма трафика |
| `/api/health/live` | liveness: процесс способен отвечать HTTP |
| `/api/health/ready` | readiness: конфигурация допустима и PostgreSQL отвечает |
| `docs/SECRETS.md` | inventory и rotation contract без значений секретов |

## Требования к платформе

- OCI/Docker runtime с Node.js container support и минимум двумя replicas для rollout rehearsal.
- TLS завершается на trusted ingress/load balancer; HTTP перенаправляется на HTTPS.
- Managed PostgreSQL доступен по TLS и отдельному least-privilege runtime user.
- WAF и trusted proxy перезаписывают forwarding headers, а не добавляют их после клиентских значений.
- Shared HTTPS rate-limit backend реализует `docs/RATE_LIMIT_BACKEND.md`.
- Managed secret store внедряет секреты только во время запуска; они не являются build args, image labels или IaC outputs.
- Persistent private storage допускается только для staging rehearsal. Production требует object storage/quarantine из issue #15.

## Build и preflight

Собирайте один immutable image на commit и продвигайте тот же digest между средами:

```bash
docker build \
  --build-arg VCS_REF="$(git rev-parse HEAD)" \
  --tag "horeca:$(git rev-parse --short HEAD)" \
  .
```

`builder` использует только безопасные test/build placeholders. Реальные `DATABASE_URL`, `AUTH_SECRET` и integration tokens не передаются в `docker build`.

Перед rollout secret store должен внедрить environment, после чего запустите безопасную preflight-команду в release job:

```bash
npm run runtime:validate
```

Команда выводит только environment, origin, release version и limiter mode. Connection strings и tokens не печатаются.

## Миграции

Миграция выполняется отдельным one-shot job до переключения трафика:

```bash
docker build --target migration --tag horeca-migration:release .
docker run --rm --env-file /run/secrets/horeca-runtime.env horeca-migration:release
```

Путь `/run/secrets/horeca-runtime.env` — пример защищённого runtime mount, а не файл репозитория. На managed platform используйте нативную workload identity/secret injection.

Все изменения schema должны быть backward-compatible для одновременной работы старой и новой версии: expand → backfill → switch → contract. Не откатывайте опубликованную migration destructive-командой.

## Rolling rollout

1. Зафиксировать commit, image digest, migration set и предыдущий healthy digest.
2. Применить migration job и проверить exit code/readback.
3. Запустить новую replica без трафика.
4. Дождаться `200` от `/api/health/live` и `/api/health/ready`.
5. Перевести малую долю трафика, проверить login, catalog и admin negative paths.
6. Постепенно заменить replicas; старые и новые версии должны работать совместно.
7. Наблюдать согласованное окно по availability, latency, 5xx, DB saturation и security signals.

Liveness не обращается к dependencies и подходит для restart policy. Readiness проверяет runtime contract и `SELECT 1`; при отказе возвращает `503`, `Retry-After: 5` и не раскрывает внутреннюю причину.

## Rollback

1. Остановить rollout и снять новую версию с traffic.
2. Вернуть предыдущий **image digest**, не mutable tag.
3. Не откатывать БД, если migration была additive/backward-compatible.
4. Проверить liveness, readiness и критический HTTP smoke на старой версии.
5. Зафиксировать timestamps, affected requests, причину и follow-up action.

Если migration несовместима с предыдущей версией, rollout не допускается: сначала требуется отдельный reviewed recovery plan и проверенный backup/restore path.

## Evidence для #14

К issue приложите:

- approved provider/domain decision и владельца cutover;
- commit SHA, image digest и SBOM digest;
- source-of-truth deployment/IaC paths;
- redacted runtime configuration readback;
- staging URL и TLS/WAF/readiness readback;
- migration, smoke, negative-path и multi-replica evidence;
- rollback rehearsal и observe-window timestamps.

Источники: [Next.js Deploying](https://nextjs.org/docs/app/getting-started/deploying), [Next.js standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), [Next.js Instrumentation](https://nextjs.org/docs/app/guides/instrumentation).
