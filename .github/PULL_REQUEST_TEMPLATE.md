## Результат

Кратко опишите пользовательский или операционный результат.

## Delivery state

- [ ] Review-ready: PR готов к проверке, но задача ещё не `Done`
- [ ] Code-complete: runtime evidence не относится к scope
- [ ] Runtime verified: staging/live readback и negative path приложены
- [ ] Docs/audit only: runtime completion остаётся отдельной leaf-задачей

## Изменения

- 

## Риск и границы

- Linked leaf issue или причина `no issue`:
- Владелец результата:
- Затронутые роли/сценарии:
- Изменения схемы или данных:
- Изменения auth, billing, файлов или PII:
- Rollback:

## Доказательства

- [ ] Используется Node.js 22 (`npm run check:runtime`)
- [ ] `npm run verify`
- [ ] Миграция применена на чистой PostgreSQL, если менялась схема
- [ ] `npm run db:seed && npm run smoke:http`, если менялись сквозные сценарии
- [ ] Проверены негативные и ролевые сценарии
- [ ] Нет новых секретов, приватных документов и debug-логов
- [ ] Документация и `docs/PROJECT_CONTEXT.md` обновлены при изменении контрактов
- [ ] Parent/leaf closure не скрывает открытые части; известные blockers имеют owner и next action

Фактически выполненные команды и результаты:

```text

```

## Скриншоты / логи

Добавьте только безопасные артефакты без персональных данных и секретов.

Для infra/runtime укажите environment, commit/version, rollout, rollback и результат observe window. Merge без runtime evidence не считается production completion.
