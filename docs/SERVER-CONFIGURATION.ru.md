# Настройки сервера и автоматизаций (языки: [en](SERVER-CONFIGURATION.md) • ru • [hi](SERVER-CONFIGURATION.hi.md) • [zh](SERVER-CONFIGURATION.zh.md))

`meta-sovereign serve` и настольное приложение читают понятный Links Notation:

1. Пользовательский `config.lino` рядом с папкой `store`: Linux —
   `$XDG_CONFIG_HOME/Meta Sovereign/config.lino` или
   `~/.config/Meta Sovereign/config.lino`; macOS —
   `~/Library/Application Support/Meta Sovereign/config.lino`; Windows —
   `%APPDATA%/Meta Sovereign/config.lino`.
2. `.meta-sovereign/config.lino` в текущем каталоге или файл `--app-config=<file>`.
3. Явные параметры команды поверх значений сервера из файлов.

Отсутствующие стандартные файлы необязательны; выбранный явно файл должен
существовать. Относительный путь считается от текущего каталога. `--store` и
`META_SOVEREIGN_STORE_DIR` меняют хранилище, сохраняя путь пользовательских
настроек. Переменные окружения сервера остаются запасными значениями;
`MS_TLS=off` отключает TLS.

```lino
configuration:
  server configuration_server

configuration_server:
  port 8788
  localUi true
  verbose false
  jsonCompatibility false
```

`meta-sovereign serve --port=8787` заменяет только порт. Вложенные объекты
используют именованные ссылки; JSON и маркеры типов не нужны.

| Поля `server`                                    | Значения                                                            | Параметры                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------- |
| `port`                                           | 0–65535; 0 выбирает свободный порт                                  | `--port`                                                   |
| `verbose`, `localUi`, `tls`, `jsonCompatibility` | `true` / `false`                                                    | `--verbose`, `--local-ui`, `--tls`, `--json-compatibility` |
| `backupIntervalHours`, `backupKeep`              | 0–596 часов; 0 отключает; 0–10000 архивов; 0 сохраняет все          | `--backup-interval-hours`, `--backup-keep`                 |
| `recoveryFormats`                                | `text`, `binary`, `text,binary`, `binary,text`, `none`              | `--recovery-formats`                                       |
| `allowOrigin`, `uiUrl`                           | `none` или источники через запятую/пробел; HTTP(S) адрес приложения | `--allow-origin`, `--ui-url`                               |
| `theme`                                          | `system`, `light`, `dark`, `auto`                                   | `--theme`                                                  |
| `skin`                                           | `t3`, `telegram`, `whatsapp`, `signal`                              | `--skin`                                                   |
| `language`                                       | `system`, `en`, `ru`, `zh`, `hi`                                    | `--language`                                               |

Лимит файла — 64 КиБ. Каналы и другие нестандартные файлы отклоняются без
ожидания. Неизвестные поля, недопустимые значения, ошибки чтения и учётные
данные в URL останавливают запуск с общим сообщением. Секреты вводите через
защищённые средства приложения.

Настольное приложение принимает те же параметры. По умолчанию включён
встроенный интерфейс, порт свободный, TLS отключён. При `localUi false`
стандартный порт 8787 позволяет опубликованному приложению найти сервер;
нестандартный порт можно выбрать в настройках. При явном TLS окно использует
HTTPS. Исключение сертификата и доступ к буферу обмена ограничены собственным
локальным окном/источником; исключение проверяет точный отпечаток сертификата.
Сохранённые пользователем язык и оформление браузера важнее значений файла;
сброс снова разрешает использовать текущие значения по умолчанию.

## Шесть автоматизаций VK

В `automations.vk` допустимы `online`, `friends`, `cleanup`, `outgoing`, `wall`,
`birthday`. Скопируйте [полный пример](../examples/desktop-automation-config.lino)
в `.meta-sovereign/config.lino`. Все шесть политик в нём приостановлены;
замените примерные идентификаторы и текст перед включением.

У всех политик есть `enabled` и `everyMinutes`: 1–14 минут для `online`,
1–1440 для остальных. Дополнительные поля:

| Политика              | Поля                                                                                                                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `friends`             | `maxFriends`, `batchSize`, `priorityIds`, `acceptancePolicy` (`ranked-batch` / `desktop-ten-percent`)                                                                                                          |
| `cleanup`, `outgoing` | `limit`, `priorityIds`                                                                                                                                                                                         |
| `wall`                | `limit`, `cooldownDays`, `communities`, `messages`, `marker`, `attachments`, `restrictedCommunities`, `restrictedMessage`, `replaceOwned`, `activeAvatar`, `randomAttachment`, `holdAnyVisible`, `priorityIds` |
| `birthday`            | `limit`, `scanLimit`, `timeZone`, `messages`, `stickers`, `attachments`, `onlineOnly`, `priorityIds`                                                                                                           |

Проверки и ограничения совпадают с обычными средствами автоматизаций. Для
`wall` перед включением нужны адресаты, а во всех приглашениях — маркер.
См. [друзья](VK-FRIEND-REQUESTS.md), [обслуживание](VK-FRIEND-MAINTENANCE.md),
[приглашения](VK-COMMUNITY-INVITATIONS.ru.md), [дни рождения](VK-BIRTHDAY-GREETINGS.ru.md).
Старые пустые значения, скаляры и списки читаются совместимыми обработчиками;
некорректные заполненные структуры отклоняются. Поздний список заменяет ранний.

Приоритет политик: встроенные приостановленные значения → глобальный файл →
локальный/выбранный файл → `--automation-defaults=<readable-Lino>` → сохранённые
настройки владельца → явные параметры сохранения команды политики.
Поля каждой политики объединяются. Документ `--automation-defaults` содержит
`vk` непосредственно, без внешнего `automations`.

`meta-sovereign vk-online --app-config=.meta-sovereign/config.lino` читает
результат; `--every-minutes=7` сохраняет выбор, действующий и после изменения
файла. Чтение не записывает политики и не запускает провайдера. Каждый слой
должен быть корректен до переопределений. Встроенный Lino также ограничен
64 КиБ. Токены, пароли и cookies запрещены; используйте защищённые средства,
например ввод без отображения в `vk-token import`.

Перезапустите настольное приложение или повторите `serve` для перечитывания.
Rolling-сервер заменяет рабочий процесс только при изменении эффективных
значений и сбрасывает удалённые файловые значения. Сохранённый выбор, включая
паузу, сохраняет приоритет. Явное `enabled true` может включить ещё не
настроенную политику при запуске планировщика, с обычными проверками учётных
данных и отправки. Команда чтения статуса планировщик не запускает.
