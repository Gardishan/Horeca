# Private object storage contract

HoReCa KZ сохраняет проверенные документы через S3-compatible boundary в `lib/file-security.ts`. `filesystem` остаётся только локальным режимом для development/test; staging и production запускаются только с `PRIVATE_STORAGE_MODE=s3`.

Этот application-side контракт не означает, что issue #15 закрыта. До production нужны реально созданные private buckets, IAM/KMS policy readback, lifecycle/retention approval, malware-scanner deployment, staging negative paths, rollback и observe-window evidence.

## Runtime configuration

| Имя | Требование |
|---|---|
| `PRIVATE_STORAGE_MODE` | `filesystem` только dev/test; `s3` обязательно staging/production |
| `PRIVATE_STORAGE_ROOT` | локальный путь только для filesystem mode |
| `PRIVATE_STORAGE_S3_ENDPOINT` | HTTPS origin S3-compatible service без path, query и credentials |
| `PRIVATE_STORAGE_S3_REGION` | явный region identifier провайдера |
| `PRIVATE_STORAGE_S3_BUCKET` | отдельный DNS-compatible private bucket для среды |
| `PRIVATE_STORAGE_S3_FORCE_PATH_STYLE` | явное `true` или `false` по контракту провайдера |
| `PRIVATE_STORAGE_S3_SSE` | `AES256` или `aws:kms`; алгоритм не выбирается неявно |
| `PRIVATE_STORAGE_S3_KMS_KEY_ID` | обязателен только для `aws:kms` |
| `AWS_ACCESS_KEY_ID` | optional local/static credential из стандартной AWS SDK chain |
| `AWS_SECRET_ACCESS_KEY` | secret; не хранить в Git, image, logs или URL |
| `AWS_SESSION_TOKEN` | optional short-lived session credential |

В deployed environment предпочтительна workload identity или short-lived credential provider стандартной AWS SDK chain. Runtime validation намеренно не требует static access key: его отсутствие может означать корректную workload identity. Endpoint с embedded credentials всегда запрещён.

## Write and read boundary

1. Upload проходит allowlist расширения, MIME, размера и magic bytes.
2. Fail-closed malware scanner возвращает только `clean` или блокирует upload.
3. Приложение генерирует UUID filename и ключ `company-documents/<company-id>/<stored-name>`.
4. `PutObject` передаёт bytes, content type, content length и обязательный server-side encryption header.
5. В БД хранится только object key, а не endpoint, bucket или credential.
6. Download сначала повторно проверяет admin role, затем выполняет `GetObject`; браузер не получает storage credential или прямой object URL.
7. Успешное admin-скачивание создаёт `DocumentDownloadLog` и отдаётся с `private, no-store` и `nosniff`.

Object key повторно проверяется перед read/write. Traversal и произвольный доступ к другому prefix отклоняются до SDK call. Backend outage, malformed body и объект больше application limit нормализуются в `503 PRIVATE_STORAGE_UNAVAILABLE` без provider details. Только подтверждённый S3 `404`/`NoSuchKey` становится безопасным `404 NOT_FOUND`.

## Required provider controls

- Отдельные staging и production buckets; public ACL/policy и anonymous listing полностью запрещены.
- Application identity получает только необходимые `PutObject`/`GetObject` на утверждённый prefix. Bucket administration, policy changes и destructive bulk actions отделены.
- TLS обязателен in transit. At-rest encryption должен быть подтверждён provider readback; для `aws:kms` нужны key policy, rotation и recovery procedure.
- Версионирование, lifecycle, retention и deletion periods утверждаются владельцем данных и Legal. Они не выводятся из application defaults.
- Provider audit/data-access logs направляются в защищённое централизованное хранилище с alerting.
- Data residency, backup/replication region и restore expectations фиксируются до загрузки реальных документов.
- CORS не нужен текущему server-mediated flow и должен оставаться выключенным, если нет отдельного approved direct-upload design.

Текущий flow сканирует bytes **до** сохранения и поэтому не сохраняет infected object. Если утверждённая production threat model требует отдельные quarantine/clean buckets, это реализуется как внешний scanner-controlled promotion flow с отдельными identities и lifecycle; существующий код и этот документ не выдают такой runtime control за выполненный.

## Preflight and staging evidence

Перед rollout выполните `npm run runtime:validate`. Safe summary показывает только `storageMode`; bucket, endpoint, key ID и credentials не печатаются.

Для issue #15 приложите:

- commit SHA, image digest и timestamped redacted runtime preflight;
- bucket public-access/IAM/encryption/versioning/lifecycle policy readback;
- clean upload + authorized download + `DocumentDownloadLog` evidence;
- infected/EICAR, scanner outage, object-store outage, missing object и oversized-body negative paths;
- cross-company/unauthenticated download denial;
- credential/KMS rotation, rollback rehearsal и observe-window timestamps;
- approved retention/deletion and, if required, quarantine-to-clean promotion evidence.

Полезные первичные источники: [AWS SDK for JavaScript `PutObject`](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/PutObjectCommand/), [AWS SDK for JavaScript `GetObject`](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/GetObjectCommand/), [VK Cloud Kazakhstan: S3-compatible object storage](https://vkcloud.kz/blog/oblako-s-paas/), [VK Cloud Kazakhstan: encryption responsibilities](https://vkcloud.kz/blog/shifrovanie-dannikh-v-oblake-chto-dolzhen-umet-provaider-i-chto-na-storone-klienta/).
