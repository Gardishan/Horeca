# Аудит закрытой MVP Beta — 29 сентября 2026

## Вердикт и границы

**NEEDS FIX. Функциональный demo-стенд доступен, но завершённая закрытая MVP Beta не подтверждена.** Помимо остановки deployments у Railway обнаружен воспроизводимый обход защиты страниц по приглашению. Утверждение «остался только Railway» оказалось неполным.

Владелец подтвердил аудиторию: небольшая доверенная группа, команда и знакомые. Общие demo-роли, включая администратора, соответствуют этому scope. Коммерческая регистрация, реальные документы, оплаты и отдельная инфраструктура для production не добавляются к критериям этого теста.

Исходный аудит проверял код и runtime без изменения приложения или инфраструктуры. Исторические свидетельства ниже сохраняют исходные даты и версии. Последующие исправления отмечены отдельно; публикация отчёта не является новым runtime-тестом.

Проверяемый source: `3ef4f64fc2b61ca3bc317d72f662f97134e576c6`. Работающий runtime: `00a7b3a03fb6d177aadffb1abf8fa6cbe895bda2`, deployment `a8ce2c69-21f2-4023-b537-00c86d035620`, image `sha256:596a8bf870ed0a996cce82cad0cee3f4ab58105588f0fd75538854588b040e95`. Среда — Railway `horeca-kz-beta / beta`, HTTPS origin `https://horeca-beta.up.railway.app`. Свежие readbacks: 17:44–17:47 UTC, 29.09.2026.

## Обновление после исходного аудита

- F1 исправлен в source: [PR #58](https://github.com/Gardishan/Horeca/pull/58) merged как `023a24e34eaae89abc124ee55816585f80ee6c42`. Полный local verify — 313 tests; 60 HTTP-проверок isolated standalone и GitHub Quality/Security прошли. Рабочая версия всё ещё `00a7b3a`, поэтому источник исправлен, но внешний page gate ещё не подтверждён. Статус safety — `in_progress`.
- В отдельном PDF-проходе 18:17:44–18:17:54 UTC отремонтированы восемь точных синтетических файлов на работающей Beta; семь размеров согласованы в БД. Скачивания проверены strict parser, render, 24 отрицательными auth-проверками и журналом 7+1 downloads. [PR #76](https://github.com/Gardishan/Horeca/pull/76) merged как `5984e4f009026a886418bd0bf63ff3085ba7c4b8`: генератор, regression и [отдельный отчёт](PDF_REPAIR_2026-09-29.md). Quality 36611763760 и Security 36611763739 прошли, включая 357 tests и PostgreSQL 17 HTTP smoke. Ремонт данных не заменял application image. Старый smoke подтверждал HTTP/magic, а не читаемость PDF.
- F2/F3 исправлены в source `fdb3a1f778275559f746457ff123e0f489cc4786`: 365 tests в полном local verify и 17 browser-сценариев production standalone прошли. Проверены ошибки, сохранение ввода, отсутствие автоматического повтора, вход после denied prefetch и доступный с клавиатуры кабинет на 320/390/768/1440 px. [Локальные доказательства](audits/2026-09-29/ui-recovery/verification.json) не подтверждают доставку: runtime остаётся `00a7b3a`. F2/F3 и grid overflow F4 требуют внешней проверки исправленного кандидата.

## Находки по приоритету

### F1 — P1: страницы обходят приглашение через prefetch headers

В [исходнике 3ef4f64, proxy.ts:68](https://github.com/Gardishan/Horeca/blob/3ef4f64fc2b61ca3bc317d72f662f97134e576c6/proxy.ts#L68), `missing` исключал page requests с `purpose: prefetch` или `next-router-prefetch` из выполнения proxy. Именно proxy проверяет Beta invite и kill switch.

Два независимых HTTPS readback без cookie получили обычный `/catalog` → 307 к приглашению, а каждый из этих headers → 200 с реальным HTML товаров. Это не предположение по коду. Локальный helper установленного Next также показал, что proxy не исполняется для `/catalog`, `/login`, `/dashboard/company`, `/admin` с такими headers.

Обход касается Beta-периметра страниц; собственная авторизация кабинетов и API matcher сохраняются. Доступ к чужим приватным документам или административным API без роли этим аудитом не продемонстрирован. Обход kill switch следует из того же matcher; выключение текущего runtime ради отдельного опыта не выполнялось. HTTP `X-Robots-Tag` на обойдённом ответе также отсутствует; это не утверждение об отсутствии всех HTML meta tags.

**Состояние:** PR #58 удалил исключение и покрыл реальный matcher, внешние обычные/prefetch/RSC page requests, отсутствие и валидную cookie, выключенную Beta. Критерий закрытия — защищённый deployed runtime; до внешней проверки `controlled-beta-safety` остаётся `in_progress`. Исходное доказательство ниже относится к старой версии и не переименовывается в результат исправления.

Доказательство: [anonymous-prefetch-gate-readback.json](audits/2026-09-29/anonymous-prefetch-gate-readback.json). Семантика `missing` описана в [официальной документации Next](https://nextjs.org/docs/app/api-reference/file-conventions/proxy#negative-matching).

### F2 — P2: две основные формы зависают после сетевой ошибки

[BetaAccessForm в source 3ef4f64](https://github.com/Gardishan/Horeca/blob/3ef4f64fc2b61ca3bc317d72f662f97134e576c6/components/forms/beta-access-form.tsx#L22) и [BuyerRequestForm](https://github.com/Gardishan/Horeca/blob/3ef4f64fc2b61ca3bc317d72f662f97134e576c6/components/forms/buyer-request-form.tsx#L20) не перехватывали rejected `fetch` и ошибку `response.json()`.

В браузере проверены четыре случая: каждая форма × обрыв сети / HTML 503 вместо JSON. Кнопка остаётся disabled с «Проверяем…» или «Отправляем…»; видимой ошибки нет, возникает необработанный TypeError/SyntaxError. POST перехватывались только в тестовом браузере и не доходили до приложения. На момент исходного аудита код был одинаков в source и runtime.

**Состояние:** source исправлен: безопасное сообщение, восстановление кнопки в `finally`, сохранение заполненных значений, без автоматического повтора. При неизвестном результате заявка могла сохраниться; сообщение предлагает уточнить её получение у поставщика. Happy path, API-отказ, сеть и non-JSON проверены локально в браузере. До доставки на старом runtime обход — reload; перед повторной заявкой нужно проверить её получение.

После исправления page gate локальный браузер выявил дополнительную ошибку перехода после приглашения: denied RSC prefetch мог остаться в client Router Cache. POST выдавал cookie и authenticated GET каталога возвращал 200, но `router.replace`/`refresh` зацикливали переход. Успешный ввод приглашения теперь вызывает `window.location.replace` для уже проверенного сервером `nextPath`, очищая прежний клиентский кэш. Серверные правила доступа и `safeBetaReturnPath` сохранены. [RED](audits/2026-09-29/ui-recovery/invite-cache-red.json) и [GREEN](audits/2026-09-29/ui-recovery/browser-green.json) включают свежий браузер и заранее полученный denied prefetch; это loopback evidence, не тест Railway.

Это дефекты UI error-state DoD, а не новые коммерческие требования. Аналогичный код без recovery есть в profile/product/admin actions; это дополнительная область проверки, не объявленная здесь браузерно подтверждённой.

Доказательство: [form-recovery-readback.json](audits/2026-09-29/form-recovery-readback.json).

### F3 — P2: мобильный пользователь теряет вход в кабинет

[SiteHeader в source 3ef4f64](https://github.com/Gardishan/Horeca/blob/3ef4f64fc2b61ca3bc317d72f662f97134e576c6/components/site-header.tsx#L22): единственная ссылка авторизованного пользователя в кабинет была скрыта классом `hidden ... sm:flex`. Браузерная проверка Pending Supplier в каталоге: при 390 px ссылка существует, но невидима; при 768 px видима. В узкой шапке остаётся ссылка-логотип в каталог и кнопка выхода.

**Состояние:** source показывает ссылку «Кабинет» на телефоне и сохраняет имя пользователя на широком экране. Supplier → `/dashboard/company`, Admin → `/admin` проверены с Tab/Enter на 320/390/768/1440 px; ширина документа равна viewport, пересечений шапки на скриншоте 320 px нет. Внешний runtime ещё не обновлён: прямой `/dashboard/company` или `/admin` остаётся временным обходом. Исправление grid `min-width` — отдельное изменение.

Доказательство: [mobile-navigation-readback.json](audits/2026-09-29/mobile-navigation-readback.json).

### F4 — P2: мобильный overflow исправлен в source, но не доставлен

На runtime `00a7b3a` ранее воспроизведена ширина документа 892 px при viewport 390 px. PR #74 добавил `min-width: 0` grid-элементам в [app/globals.css](../app/globals.css). Main и симуляция 39 измерений прошли, однако пользователь сейчас получает старое изображение приложения.

**Критерий закрытия:** проверить фактически доставленный CSS на 390/768/1440 px и достижимость действий, а не только отсутствие горизонтального overflow. Свидетельство симуляции не заменяет runtime-проверку.

### F5 — внешний блокер: Railway всё ещё отклоняет deployment

[Beta Launch 36605746207](https://github.com/Gardishan/Horeca/actions/runs/36605746207) на source `3ef4f64` прошёл API/SSH preflight и runtime validation, но 17:33:56 UTC `railway up` получил `Deploys have been paused temporarily`. Новый deployment не создан, enable не достигнут. Свежий API readback: pending deployments 0; работающий процесс имеет `BETA_ENABLED=true`, версия `00a7b3a`. Сохранённые переменные следующего deployment — `BETA_ENABLED=false`, версия `3ef4f64`.

**Действие:** после исправлений и зелёного CI развернуть новый exact SHA, когда provider принимает deployments. Само исчезновение баннера или успешный API-read не доказывает готовность deploy. На момент исходного аудита [официальный инцидент](https://status.railway.com/incident/YYTG8I10) остаётся Investigating.

Доказательства: [failed-retry-cause.json](audits/2026-09-29/failed-retry-cause.json), [operations-readback.json](audits/2026-09-29/operations-readback.json).

### F6 — проверка готовности завышает уверенность

В проверенном source `3ef4f64` [beta-safety tests](https://github.com/Gardishan/Horeca/blob/3ef4f64fc2b61ca3bc317d72f662f97134e576c6/tests/beta-safety.test.ts) вызывали policy-функцию напрямую, а [external smoke:127](https://github.com/Gardishan/Horeca/blob/3ef4f64fc2b61ca3bc317d72f662f97134e576c6/scripts/smoke-beta-external.mjs#L127) проверял обычную страницу и API. Выбор маршрута реальным matcher не был покрыт. PR #58 добавил недостающие gate-проверки; их внешний результат ещё требуется. UI recovery tests существуют для billing/verification, но не закрыли две найденные формы. Процент coverage в [vitest.config.ts](../vitest.config.ts) относится к выбранным библиотекам; proxy, страницы и весь пользовательский интерфейс в этот процент не входят.

[check-mvp-readiness.ts](../scripts/check-mvp-readiness.ts) проверяет структуру, статусы, наличие даты и локальных файлов. Он не устанавливает истинность URL evidence, соответствие SHA и свежесть. Изолированная синтетическая проверка приняла все `done` с датой 2001 года и несвязанными HTTPS-ссылками. Реальный registry при этом не подменялся.

**Вывод:** зелёный CI и статус `done` — необходимые сигналы, но не независимый аудит продукта. Нужно добавить недостающие regression-проверки и сверять финальный manifest с runtime. Не следует заводить новую платформу качества или считать число тестов мерой готовности.

Доказательство: [validator-assurance-limit.json](audits/2026-09-29/validator-assurance-limit.json).

## Что уже подтверждено

- [Main Quality 36604287305](https://github.com/Gardishan/Horeca/actions/runs/36604287305) и [Security 36604287314](https://github.com/Gardishan/Horeca/actions/runs/36604287314) успешны. Quality выполнил 276 tests, production build, container build, чистые PostgreSQL migrations/seed, HTTP smoke и emulator APK.
- В этом аудите повторно выполнены 40 security/policy tests в шести файлах; все прошли. Свежий `npm run security:audit` также прошёл. Это не опровергает F1: нужной проверки matcher в этих тестах нет.
- HTTPS liveness/readiness отвечают 200 для точной старой версии. Обычный запрос API без приглашения получает 401. Прежние buyer → supplier inbox, company isolation, supplier/admin role boundaries и авторизация private downloads подтверждены существующим runtime evidence; оно не доказывало читаемость старых PDF; все решения billing/verification заново в этом read-only проходе не выполнялись.
- PostgreSQL 17.11/TLS 1.3, применённая migration, cluster identity и persistent volumes подтверждены свежим readback. Физический restart 24.09 сохранил данные; это не backup/restore drill.
- Подписанный production-npm SBOM `3ef4f64` проверен по source SHA, signer и совпадению predicate. Он не является SBOM всей ОС контейнера или Android. Старый внешний debug APK `00a7b3a` существует и проверен по checksum/origin. Текущего внешнего APK и prerelease нет.

Артефакты: [artifact-identity-audit.json](audits/2026-09-29/artifact-identity-audit.json), [runtime-cluster-readback.json](audits/2026-09-29/runtime-cluster-readback.json), [volume-readback.json](audits/2026-09-29/volume-readback.json).

## Операционные ограничения доверенной группы

- Один invite code и общие demo-аккаунты. Любой приглашённый может выбрать Demo Admin, изменить общую компанию, скачать синтетические документы. Audit log различает demo-учётные записи, а не конкретных тестировщиков. Код передавать отдельно от публичной ссылки; ротация отзывает приглашение всей группы. Cookie приглашения живёт 8 часов, logout кабинета её не удаляет.
- Demo-only проверяет подтверждение пользователя, а не содержание документа на наличие реальных персональных данных. Mock scanner не ищет настоящий malware. Использовать только специально подготовленные вымышленные контакты и файлы.
- Все работают в общей сцене. Terminal decisions не обращаются, а идемпотентный seed не сбрасывает решения и статусы; ограниченное исправление metadata не превращает его в reset. Положительный и отрицательный исходы одного решения нельзя повторять произвольно. Административный проход лучше выполнять по очереди.
- На общем внешнем IP: invite 10 попыток/15 минут, login 10/10 минут, заявки 8/час. Это может дать 429 при командном тесте из одного офиса. Не считать 429 случайной поломкой и не увеличивать лимиты без отдельной причины.
- Проверено ограниченное окно низкой нагрузки, а не SLA/нагрузочная устойчивость. Android на физическом устройстве и Safari в этом проходе не проверены.
- Inbox принимает заявку и показывает контакты. Встроенная переписка, email notification, checkout и реальные оплаты не входят в текущий MVP. Тестировать нужно понятность и доставку запроса, не обещать завершение сделки внутри системы.

## Порядок завершения

1. Доставить source-исправление F1 из PR #58 и проверить разрешённые/запрещённые page-gate сценарии на целевом runtime. Приоритет — Engineering.
2. Доставить source-исправления F2/F3/F4 и повторить локально подтверждённые браузерные сценарии на внешнем кандидате, включая ошибки и переход после приглашения.
3. Получить зелёный CI нового main; провести один контролируемый Beta Launch после снятия Railway pause. Проверить exact runtime SHA, обычные/prefetch/RSC gate requests, mobile и формы. Успех старого `3ef4f64` CI не переносится на новое исправление.
4. Проверить сохранность DB/files, stop/resume и восстановление безопасного кандидата; собрать небольшое timestamped observation window. **Не запускать ранее подготовленный rollback на `00a7b3a`: теперь это известная уязвимая версия.** Его CSS/docs-only compatibility helper также неприменим к security-fix без нового review. Повторять опасный rollback ради отметки не нужно.
5. Для внутренней группы достаточно исправленного и внешне проверенного веб-стенда, инструкции и одного канала обратной связи владельцу. Для объявления MVP Beta выполненной по текущему Canon дополнительно нужны matching APK/SBOM/image/release identity, полный `npm run mvp:release-check` и exact-SHA prerelease. Это завершение согласованного релиза, а не новые продуктовые функции.

Следующий пользовательский шаг: [план теста для команды](BETA_TEST_PLAN.md). Commercial production blockers остаются в отдельном [registry](production-readiness.json) и не являются условиями дружеского demo-теста.

## Границы достоверности

В исходном read-only аудите не выполнялись deploy, rollback, смена kill switch, новые решения по оплатам/документам или нагрузочный тест. Последующий ограниченный ремонт PDF — отдельная операция и evidence, описанные выше. Проверки сетевых ошибок использовали локальный перехват браузера, не реальный сбой провайдера. Fresh tests: узкий suite и dependency audit; полный `verify` подтверждён указанным CI и здесь заново не запускался. `mvp:check-readiness --strict` фактически запускался и остаётся красным. Отчёт сохраняет находки и их историю; актуальные source/runtime статусы исправлений перечислены в обновлении выше.
