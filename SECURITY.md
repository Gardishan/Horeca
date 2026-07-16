# Security policy

## Поддерживаемая версия

Security fixes применяются к текущей ветке `main`. Demo-конфигурация и seed не предназначены для production.

## Сообщить об уязвимости

Не публикуйте exploit, реальные документы, credentials или персональные данные в обычном GitHub issue.

1. Используйте **Security → Report a vulnerability** в репозитории, если private vulnerability reporting доступен.
2. Если он недоступен, свяжитесь с владельцем `Gardishan` через GitHub без публикации чувствительных деталей.
3. Укажите затронутый commit, сценарий, влияние, минимальные шаги воспроизведения и безопасное предложение исправления.

Не тестируйте DoS, social engineering, массовую выгрузку данных или изменение чужих данных без письменного разрешения.

## Приоритет

| Severity | Примеры | Цель реакции |
|---|---|---|
| Critical | auth bypass, remote code execution, массовая утечка документов | немедленная изоляция и hotfix |
| High | IDOR, payment/role bypass, stored XSS, path traversal | блок release, срочное исправление |
| Medium | ограниченная утечка metadata, слабый rate limit, hardening gap | запланированное исправление |
| Low | defense-in-depth и неэксплуатируемая конфигурация | backlog с обоснованием |

## Production baseline

Перед обработкой реальных данных обязательны:

- уникальные secrets из managed secret store;
- private object storage с encryption, retention и malware scanning;
- реальный payment provider с подписанными идемпотентными webhooks;
- Redis/edge rate limiter;
- backups и проверенный restore;
- централизованные audit logs, monitoring и alerting;
- юридическая и privacy-проверка для Казахстана;
- threat model, pentest и incident response runbook.

Текущее состояние контролей отслеживается в `SECURITY_CHECKLIST.md`.
