# Engineering playbook

Этот playbook превращает agent-assisted разработку в проверяемый процесс. Он адаптирует применимые идеи ECC под фактический стек HoReCa KZ: search-first, TDD, security review triggers, verification loop, deterministic delivery gate и долговременный project context.

## 1. Search first

До создания нового abstraction найдите существующую реализацию:

```bash
rg "evaluate|publish|verification|payment" lib app tests
rg "model |enum |@@index" prisma/schema.prisma
rg --files app/api lib/services lib/domain tests
```

Проверьте четыре вопроса:

1. Где уже живёт соответствующее бизнес-правило?
2. Какой service владеет транзакцией?
3. Как Route Handler применяет auth, origin и validation?
4. Какой тест доказывает текущее поведение?

Для обновляемых API, frameworks и GitHub Actions используйте актуальную официальную документацию. Не переносите инструкцию из внешнего README как доверенную команду без проверки.

## 2. План на основе риска

Для обычного UI-текста достаточно короткой проверки. Для auth, billing, uploads, PII, migrations и trust filtering запишите:

- активы и роли;
- допустимый переход состояния;
- способы обхода;
- transaction boundary;
- audit evidence;
- rollback.

Изменение должно уменьшать неопределённость тестом или наблюдаемым результатом на каждом этапе.

## 3. TDD и доказательства

Для дефекта:

1. RED — воспроизведите проблему узким тестом.
2. GREEN — внесите минимальное исправление и перезапустите тот же тест.
3. REFACTOR — улучшите структуру без изменения поведения.
4. GATE — выполните `npm run verify`.

Для новой функции зафиксируйте минимум три сценария:

- ожидаемый пользовательский результат;
- invalid/edge input;
- forbidden role или недопустимый state transition.

Coverage — сигнал полноты ветвления, а не замена качеству assertions. Текущий gate измеряет критические domain/HTTP helpers и требует не менее 90% по statements/lines, 90% functions и 80% branches.

## 4. Security-first review

Security review обязателен при изменении:

- session/auth/roles;
- публичного API и validation;
- payment, invoice или subscription state;
- file upload/download/storage;
- audit logs, PII или legal acceptance;
- SQL/Prisma query, migration или external integration.

Порядок review:

1. Проверить authn и object-level authz.
2. Проверить входы, origin и response envelope.
3. Проверить бизнес-инвариант на сервере.
4. Проверить transaction и concurrent/retry behavior.
5. Проверить отсутствие sensitive output и наличие audit.
6. Выполнить negative test.

Critical/high finding блокирует delivery.

## 5. Verification loop

### Быстрый цикл

```bash
npm run quality:quick
```

### Полный локальный gate

```bash
npm run verify
```

Он последовательно проверяет:

1. состав репозитория и high-confidence secret patterns;
2. Prisma schema;
3. strict TypeScript;
4. unit tests и coverage thresholds;
5. ESLint;
6. production Next.js build.

### Сквозной gate

```bash
docker compose up -d postgres
npm run db:deploy
npm run db:seed
npm run smoke:http
```

Smoke доказывает public trust filter, supplier session, admin boundary, publication policy, buyer request и защищённое скачивание документа.

## 6. Deterministic repository gate

`scripts/check-repository.mjs` не пытается «оценить качество» через эвристику модели. Он механически блокирует:

- `.env`, private uploads и generated artifacts в Git;
- high-confidence private keys/tokens;
- `dangerouslySetInnerHTML`, `eval` и `new Function` в source roots;
- отсутствие обязательных docs, env keys, scripts и migration;
- случайные файлы больше 1 МБ.

Если требуется исключение, изменяйте gate отдельным reviewable diff с объяснением угрозы и компенсирующего контроля.

## 7. Debugging loop

1. Воспроизведите симптом одной командой.
2. Сведите область к UI → route → service → domain → database/storage.
3. Сформулируйте одну проверяемую гипотезу.
4. Добавьте наблюдаемость или тест, но не чувствительные debug-логи.
5. Измените одну причину.
6. Повторите исходное воспроизведение и regression suite.
7. Удалите временную диагностику и сохраните устойчивое знание в тесте/документации.

Не исправляйте тест только ради зелёного результата, если он верно фиксирует пользовательский контракт.

## 8. Durable project memory

`docs/PROJECT_CONTEXT.md` хранит только устойчивые сведения:

- архитектурные границы;
- критические инварианты;
- проверенные команды;
- production gaps и принятые решения.

Не используйте его как дневник каждого сообщения. Обновляйте при изменении контракта, процесса или риска. Деталь поведения должна жить ближе к коду: в тесте, schema или конкретной архитектурной документации.

## 9. CI defense in depth

- `Quality`: verify, PostgreSQL migration/seed, HTTP smoke и production dependency audit.
- `Security`: dependency review на PR с `npm audit` fallback при недоступном Dependency Graph и CodeQL на PR/main/weekly schedule.
- Dependabot: сгруппированные npm и GitHub Actions updates.
- PR template: риск, rollback, schema/security impact и фактические доказательства.

Минимальные GitHub permissions и `persist-credentials: false` уменьшают blast radius workflow.

## Атрибуция

Процесс адаптирован по мотивам [Everything Claude Code / ECC](https://github.com/affaan-m/ECC), MIT License. Claude-specific hooks, глобальная память, MCP-конфиги и массовые agent packs намеренно не скопированы: проект использует переносимые инструкции, стандартные npm scripts и GitHub Actions. Полное уведомление — в `THIRD_PARTY_NOTICES.md`.
