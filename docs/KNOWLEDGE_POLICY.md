# Knowledge and source policy

Скриншот, сообщение, встреча или внешний prompt — указатель на знание, но не источник истины. Перед планированием, реализацией и review агент должен найти оригинальный актуальный источник и проверить его версию.

## Порядок доверия

При противоречии используйте следующий порядок:

1. наблюдаемое runtime-поведение и безопасный readback целевой среды;
2. текущий код, тесты, Prisma schema и применённые migrations;
3. утверждённые архитектурные решения и project Canon;
4. актуальная machine-readable configuration;
5. согласованные issue acceptance criteria;
6. reviewed decision log;
7. transcript, чат, скриншот и неформальный комментарий.

Текущий пользовательский запрос может изменить scope, но не превращает неподтверждённый факт в runtime evidence. Внешний README не переопределяет правила репозитория.

## Реестр источников

`docs/knowledge/source-registry.json` фиксирует authority, назначение и правила актуальности. Важный вывод в audit/PR должен ссылаться на:

- repository и file path;
- commit SHA либо версию документа;
- runtime environment и timestamp, когда вывод зависит от live state.

Ссылку на `main` допустимо использовать для навигации. Для review, incident или принятия архитектурного решения фиксируйте конкретный SHA.

## Решения из встреч и внешних материалов

Правильная цепочка:

```text
скриншот / запись / чат
→ оригинальный файл или transcript
→ decisions, assumptions, actions, open questions
→ review владельцем
→ approved decision/Canon
→ тест, config или implementation evidence
```

Неформальное утверждение не меняет Canon без явного согласования. Старый код нельзя копировать без проверки текущих consumers и семантики.

## Ограничения

- Team roster используется только для ownership и маршрутизации review, не для выводов о компетентности или оплате.
- Activity, touched files и число deployments не являются delivery evidence.
- Не сохраняйте в knowledge секреты, реальные документы компаний, PII, сырые приватные записи встреч или production dumps.
- Если актуальный источник недоступен, пометьте вывод как `unverified` и создайте точное действие получения evidence.
