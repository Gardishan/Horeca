# Definition of Done

Этот Canon отделяет активность и промежуточные состояния от принятого результата. Коммиты, комментарии, открытый PR, merge или deployment сами по себе не означают `Done`.

## Состояния работы

| Состояние | Что доказано | Можно закрывать задачу |
|---|---|---|
| Planned | Есть владелец, критерии и понятный close path | Нет |
| In progress | Работа начата, но результат ещё не принят | Нет |
| Review-ready | PR готов к review, проверки доступны | Нет |
| Merged, runtime pending | Изменение в целевой ветке, но runtime-критерии не подтверждены | Только если runtime не относится к scope |
| Runtime verified | Нужная среда показывает ожидаемый happy и negative path | После выполнения остальных DoD |
| Done | Выполнены технический и управленческий DoD | Да |

Документ, аудит или Terraform/конфигурация, попавшие в `main`, не равны работающему production. Родительская задача не закрывается, пока открыты обязательные leaf-задачи.

## Технический DoD

- Реализован согласованный пользовательский или операционный результат.
- Изменение находится в правильной архитектурной границе и сохраняет доменные инварианты.
- Есть PR либо явная причина `no-PR` для внешнего operational action.
- Выполнены релевантные unit, negative, role и integration/smoke проверки.
- `npm run verify` зелёный на поддерживаемом Node.js 22.
- `npm run check:unused` не находит неиспользуемые файлы/exports и неуказанные прямые зависимости.
- Для schema есть новая migration, чистый deploy и seed/smoke evidence.
- Для runtime/infra есть staging readback, rollout, rollback и observe window.
- Нет необъяснённой security, privacy, cost или reliability регрессии.
- В evidence нет токенов, персональных данных и приватных документов.

## Управленческий DoD

- Задача или PR имеет одного понятного владельца результата.
- Scope, non-goals, acceptance criteria, риск и точное закрывающее действие сформулированы до реализации.
- Callers, публичные/data-контракты и текущее поведение проверены; несогласованные assumptions, defaults и fallbacks отсутствуют.
- Linked issue/leaf и родительская граница не допускают двойного зачёта.
- Evidence comment содержит фактически выполненные команды и безопасные runtime-ссылки/логи.
- Review-ready, merged и runtime verified не смешаны.
- Внешний blocker содержит владельца решения и следующее действие, а не только слово «blocked».
- Документация и `docs/PROJECT_CONTEXT.md` обновлены, если изменился контракт или production gap.
- Следующий разработчик может проверить завершение без памяти автора или ручной интерпретации владельца репозитория.

## Evidence contract

Минимальный пакет доказательств:

1. ссылка на issue/PR и точный commit SHA;
2. перечень выполненных команд с результатом;
3. happy path и минимум один relevant negative/forbidden path;
4. migration/deploy/smoke readback, когда меняются данные или runtime;
5. rollback и observe result для production change;
6. известные ограничения и follow-up issue — без формулировки «полностью готово».

Activity signals можно использовать только для оценки нагрузки. Они не заменяют принятый результат и не используются как доказательство готовности.

## Product completion

`npm run check:readiness` проверяет структуру и evidence production registry. `npm run release:check` — строгий коммерческий gate: он обязан оставаться красным, пока в `docs/production-readiness.json` есть blocking controls без статуса `done`.

Это намеренное различие:

- зелёный `npm run verify` означает, что текущий кодовой deliverable воспроизводим;
- зелёный `npm run release:check` означает, что разрешено заявлять commercial production readiness.
