# Синхронизация CV между job platforms (languages: [en](CV-SYNC.md) • [zh](CV-SYNC.zh.md) • [hi](CV-SYNC.hi.md) • ru)

CV обычно живёт сразу в семи местах: LinkedIn, hh.ru, Habr Career,
Naukri, VietnamWorks, TopCV, SuperJob. В каждом лежит немного другая и
немного устаревшая копия, и вручную никто все семь в согласии не держит.

Эта подсистема читает каждый из профилей настоящим браузером,
превращает его в один канонический CV, показывает различия и
записывает согласованные значения обратно. Всё происходит локально:
браузер работает на машине пользователя с его же залогиненной session,
и никуда ничего не отправляется, кроме той платформы, которой
пользователь и так пользуется.

Смежные документы: [REQUIREMENTS, раздел V](REQUIREMENTS.ru.md),
[USER-GUIDE](USER-GUIDE.ru.md), [case study по issue 29](case-studies/issue-29/README.md).

## 1. Слои

| Слой      | Файл                           | Ответственность                                                                     |
| --------- | ------------------------------ | ----------------------------------------------------------------------------------- |
| Model     | `js/src/cv/model.js`           | Один канонический формат CV и его проекция в links notation (R-V1).                 |
| Diff      | `js/src/cv/diff.js`            | Сравнение и согласование по ключам и путям (R-V2).                                  |
| Plans     | `js/src/cv/platforms/*.js`     | По одному декларативному плану-данным на платформу (R-V3..R-V11).                   |
| Registry  | `js/src/cv/platforms/index.js` | Каталог, валидация и учёт confidence (R-V12).                                       |
| Telemetry | `js/src/cv/telemetry.js`       | Каждый шаг, значение, fallback и fingerprint, с редактированием (R-V13).            |
| Runner    | `js/src/cv/runner.js`          | Выполняет план через browser-commander (R-V14).                                     |
| Browser   | `js/src/cv/browser.js`         | Открывает постоянную session browser-commander (R-V14).                             |
| Facade    | `js/src/cv/index.js`           | `readCvFrom`, `compareAllCvs`, `updateCvOn`, `syncCvAcross` (R-V15).                |
| HTTP      | `js/src/server/routes-cv.js`   | `/api/cv/*` (R-V16).                                                                |
| CLI       | `js/src/cli/cv-commands.js`    | `cv-platforms`, `cv-plan`, `cv-read`, `cv-diff`, `cv-sync`, `cv-telemetry` (R-V17). |
| SPA       | `js/src/web/cv-view.js`        | Экран CV (R-V18), не затягивающий Node-часть в browser bundle (R-V19).              |

Слои общаются только сверху вниз, и только runner знает, что браузер
вообще существует. Поэтому весь процесс — включая «записать эти четыре
поля в Naukri» — тестируется без браузера.

## 2. Канонический CV

```text
cv
  basics
    name: Anna Ivanova
    headline: Backend Engineer
    location: Yerevan, Armenia
  skills
    skill: Go
    skill: Kubernetes
  experience
    position
      company: Acme
      title: Backend Engineer
      start: 2022-01
```

Секции бывают трёх видов:

- **maps** — `basics` (`name`, `headline`, `summary`, `email`, `phone`,
  `location`, `website`, `birthDate`) и `preferences` (`employment`,
  `schedule`, `salary`, `currency`, `relocation`, `remote`);
- **lists** — `skills`;
- **records** — `experience`, `education`, `languages`, `links`, у
  каждой записи есть ключ идентичности (`experience` — company + title
  - start), поэтому diff сопоставляет одну и ту же работу на двух
    платформах, а не докладывает «изменилось всё», когда один сайт
    перечисляет места работы в обратном порядке.

Каждое значение адресуется путём: `basics.headline`, `skills`,
`experience[0].title`. Пути — это язык diff, ключа `--paths` в CLI и
allow-list `writePaths`, который объявляет каждая платформа.

## 3. Планы — это данные

План — это упорядоченный список шагов. В плане нет ни одной функции,
поэтому план можно напечатать, сравнить, проверить в CI и выпустить
для платформы, чью авторизованную разметку мы ещё не смогли получить.

| Action        | Значение                                                                          |
| ------------- | --------------------------------------------------------------------------------- |
| `goto`        | Перейти по URL (шаблоны вида `{{login}}` подставляются).                          |
| `waitFor`     | Дождаться selector; timeout записывается как drift, а не как crash.               |
| `requireUrl`  | Проверить, что мы всё ещё там, где ожидали, — это и есть проверка «я залогинен?». |
| `click`       | Кликнуть по первому совпадению.                                                   |
| `fill`        | Ввести каноническое значение в поле с проверкой обратным чтением.                 |
| `press`       | Отправить клавишу.                                                                |
| `read`        | Прочитать один скаляр в путь.                                                     |
| `readList`    | Прочитать все совпадения в list-секцию.                                           |
| `readRecords` | Прочитать по одной записи на контейнер, поля — относительно него.                 |
| `extractJson` | Разобрать JSON, отрендеренный сервером, и разложить его именованным mapper.       |
| `snapshot`    | Сохранить HTML области как артефакт запуска.                                      |
| `screenshot`  | Сохранить PNG viewport как артефакт запуска.                                      |

Любой selector может быть списком кандидатов (`a, b, c`). Runner
пробует их по порядку и отправляет событие `selector.fallback` каждый
раз, когда пришлось взять не первый, — это самое раннее возможное
предупреждение о том, что сайт изменил markup.

У каждого шага есть уровень confidence:

- `verified` — увиден в разметке, которую мы получили сами; массив
  `evidence` платформы хранит URL, дату и находку.
- `documented` — взят из документации вендора или публичного API.
- `draft` — выведен из публичных знаний, подтверждается первым
  авторизованным запуском. Draft — это не догадка, спрятанная в коде:
  он помечен, посчитан, печатается в `cv-plan` и виден в SPA.

## 4. Покрытие платформ

| Платформа    | Id             | Регион | Доступ к markup           | Read paths | Write paths | Шагов | Verified          | Drafts |
| ------------ | -------------- | ------ | ------------------------- | ---------- | ----------- | ----- | ----------------- | ------ |
| LinkedIn     | `linkedin`     | global | authenticated             | 7          | 4           | 32    | 7                 | 25     |
| hh.ru        | `hh`           | ru     | authenticated             | 10         | 4           | 30    | 6 (+2 documented) | 22     |
| Habr Career  | `habr-career`  | ru     | public profile            | 2 (+JSON)  | 3           | 17    | 12                | 5      |
| Naukri       | `naukri`       | in     | authenticated             | 10         | 3           | 34    | 7                 | 27     |
| VietnamWorks | `vietnamworks` | vn     | authenticated             | 9          | 8           | 32    | 11                | 21     |
| TopCV        | `topcv`        | vn     | blocked without a browser | 12         | 6           | 32    | 5                 | 27     |
| SuperJob     | `superjob`     | ru     | authenticated             | 6          | 2           | 18    | 5                 | 13     |

`markupAccess` честно говорит, что мы смогли увидеть без session:
`public-profile` — читающая половина проверена на живой разметке,
`authenticated` — профиль перебрасывает на страницу входа,
`blocked-without-browser` — сайт отвечает обычному HTTP-клиенту
страницей-проверкой. Ровно поэтому вся подсистема и управляет
настоящим браузером.

`cv-platforms --json` и `GET /api/cv/platforms` отдают эту таблицу из
самого registry, так что разойтись с кодом она не может.

## 5. Группы обновления

Записи сгруппированы, потому что так устроены сами сайты: открыть
модальное окно «Headline», ввести текст, сохранить и закрыть — это одна
операция. У каждой группы есть id (`intro`, `about`, `skills`,
`headline`, `key-skills`, `employment`, `personal`, `preferences`,
`cv-builder`, `objective`, `expectation`, `cv-document`, `title`,
`publish`), и её можно выбрать через `cv-sync --groups=…` (или
`"groups": [...]` в `/api/cv/sync`), чтобы записать headline, ничего
больше не трогая. `--paths=basics.headline` сужает тот же запуск по
пути CV; путь, который платформа поддерживает, но пользователь не
выбрал, докладывается как `deselected` — намеренно отдельное число от
`unsupported`.

`writePaths` платформы — это allow-list. `syncCvAcross` докладывает
изменения вне него как `unsupported`, а не делает вид, что применил
их: LinkedIn не даёт переписать запись о работе через форму профиля, и
план так и говорит, вместо того чтобы молча не сработать.

## 6. Telemetry

Каждый запуск отдаёт упорядоченный поток событий, который сохраняется в
store под префиксом токенов `cv-telemetry` и воспроизводится через
`cv-telemetry` или `GET /api/cv/telemetry`:

| Событие              | Когда возникает                                               |
| -------------------- | ------------------------------------------------------------- |
| `run.start`          | Начался запуск чтения / обновления / проверки drift.          |
| `step.start`         | Перед каждым шагом, с его action и confidence.                |
| `step.ok`            | Шаг сделал то, что обещал, с реально использованным selector. |
| `step.skip`          | Необязательный шаг, чьё предусловие не выполнилось.           |
| `step.miss`          | Selector ничего не нашёл или истёк timeout ожидания.          |
| `step.error`         | Шаг выбросил ошибку.                                          |
| `value.read`         | Значение попало в CV (с редактированием).                     |
| `value.write`        | Значение введено в страницу, с результатом проверки.          |
| `selector.fallback`  | Использован не первый, а последующий кандидат.                |
| `markup.fingerprint` | FNV-1a fingerprint области, с которой сделан snapshot.        |
| `markup.changed`     | Этот fingerprint отличается от записанного baseline.          |
| `screenshot`         | Записан PNG-артефакт.                                         |
| `run.finish`         | Итоги, длительность и результат.                              |

Редактирование включено по умолчанию: адреса e-mail, телефоны и всё
похожее на длинный токен заменяются до сохранения события. Пути к
артефактам — исключение, потому что путь, который пользователь не может
открыть, доказательством не является.

С `--artifacts=<dir>` шаги `snapshot` и `screenshot` пишут
`<dir>/<runId>/<name>.html` и `.png`. Это и есть запись изменения
markup, о которой просит issue: когда сайт переносит поле, у запуска,
который это заметил, рядом с потоком событий лежат HTML и картинка.

## 7. Обнаружение drift

События `markup.fingerprint` из здорового запуска образуют baseline.
Следующий запуск сравнивается с ним и отдаёт `markup.changed` для
каждой сдвинувшейся области — до того, как что-либо будет записано.
Runner также считает «selector исчез» данными, а не крахом:
пропущенный обязательный шаг прерывает запуск с `code: 'step-missed'`
и причиной, называющей selector, поэтому первый авторизованный запуск
против сайта, для которого у нас только draft, даёт точный список того,
что надо поправить.

## 8. Как этим пользоваться

```bash
# что поддерживается и насколько это verified
meta-sovereign cv-platforms
meta-sovereign cv-plan --platform=linkedin

# прочитать профили в локальный store (открывает браузер)
meta-sovereign cv-read --platforms=linkedin,hh --login=anna --artifacts=./cv-runs

# сравнить то, что уже сохранено — браузер не нужен
meta-sovereign cv-diff --prefer=linkedin

# спланировать сведение; --apply действительно пишет
meta-sovereign cv-sync --platforms=linkedin,hh,naukri
meta-sovereign cv-sync --platforms=linkedin,hh,naukri --apply

# записать только одно поле или только одну группу редактора
meta-sovereign cv-sync --platforms=linkedin --paths=basics.headline --apply
meta-sovereign cv-sync --platforms=linkedin --groups=intro --apply

# что происходило во время запуска
meta-sovereign cv-telemetry --type=step.miss
```

Первый `cv-read` для платформы открывает видимый браузер
(`--headed`), пользователь входит один раз, и session остаётся в
отдельном для платформы profile directory (`--profile=<dir>`).
Следующие запуски её переиспользуют. Пароли этот репозиторий никогда
не спрашивает, не хранит и не передаёт.

Те же операции доступны по HTTP (`/api/cv/platforms`, `/plan`,
`/stored`, `/read`, `/compare`, `/sync`, `/telemetry`) и на экране
**CV** в SPA, который перечисляет платформы с числом draft-шагов,
показывает матрицу сравнения и отказывается запускать живое чтение из
вкладки браузера: браузер не может управлять другим браузером, поэтому
SPA отсылает к CLI.

## 9. Тестирование

| Уровень             | Что выполняется                                                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                | Model, diff, валидация планов, runner, telemetry — с поддельным commander.                                                                                        |
| Fixture             | `js/tests/helpers/markup-fixture.js` восстанавливает ожидаемый DOM каждого плана из самого плана.                                                                 |
| Browser (по выбору) | `RUN_BROWSER_E2E=1 npm run test:e2e:cv` отдаёт эти fixtures по собственным URL платформ через перехват Playwright и прогоняет все семь планов настоящим Chromium. |

Генератор fixtures и делает браузерный тест осмысленным: он выводит
страницу из selectors плана, поэтому план и его fixture не могут
разойтись, а e2e проверяет именно поставляемый путь —
`openBrowserSession` → browser-commander → runner → telemetry, — а не
его mock.
