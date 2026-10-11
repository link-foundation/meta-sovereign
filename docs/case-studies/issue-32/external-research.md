# Issue 32 External Research

Every source used by the case study is listed here, grouped by
trust level and quoted verbatim where it matters. Snapshots are in
[`data/`](./data/) and were taken on 2026-10-11.

## 1. VK official documentation (highest trust)

dev.vk.com does not answer from the research environment. The same
documentation is served at dev.vk.ru, which VK has made its primary
domain.

### Access-token flows

Source: https://dev.vk.ru/ru/api/access-token/getting-started
(snapshot: `data/vk-dev-access-token-getting-started.txt`)

> Authorization Code Flow для получения ключа доступа пользователя.
> Отключён с 25 июня 2024 года.
>
> Implicit Flow для получения ключа доступа пользователя. Отключён с
> 25 июня 2024 года.
>
> Client Credentials Flow для получения сервисного ключа доступа.
> Отключён с 17 октября 2022.

("Authorization Code Flow for getting a user access key. Disabled since
25 June 2024. Implicit Flow for getting a user access key. Disabled
since 25 June 2024. Client Credentials Flow for getting a service access
key. Disabled since 17 October 2022.")

These flows are disabled for **new** applications. vkhost still works
because it reuses client_ids registered before the cut-off.

### The `messages` right

Sources: https://dev.vk.ru/ru/reference/access-rights and
https://dev.vk.ru/ru/method/messages (snapshots:
`data/vk-dev-access-rights.txt`, `data/vk-dev-method-messages.txt`)

> …, если вы запрашивали его ранее. Для новых приложений это право не
> выдаётся.

("…, if you requested it earlier. This right is not granted to new
applications.")

Source: https://dev.vk.ru/ru/method/messages.send
(`data/vk-dev-method-messages-send.txt`)

> ключ доступа пользователя, полученный в Standalone‑приложении через
> Implicit Flow (требуется право доступа: messages — выдаётся в
> исключительных случаях через запрос в поддержку по электронной почте
> devsupport@corp.vk.com)

("a user access key obtained in a Standalone application through
Implicit Flow (requires the messages access right, which is granted in
exceptional cases on request to support by email at
devsupport@corp.vk.com)")

### Roadmap

Source: https://dev.vk.ru/ru/reference/roadmap (`data/vk-dev-roadmap.txt`)

> 2024 | Июнь — Переход на VK ID. … Эти изменения затронули процесс
> модерации для доступа к messages с ключом доступа пользователя.
> Получить такой доступ больше нельзя — это противоречит стратегии
> развития продукта. Работать с сообщениями можно только с ключом
> доступа сообщества и от его имени.

("2024 | June — Move to VK ID. … These changes affected moderation of
access to messages with a user access key. Such access can no longer be
obtained, because it contradicts the product's development strategy.
Messages can only be handled with a community access key and on the
community's behalf.")

### Community tokens

Source: https://dev.vk.ru/ru/api/access-token/community-token/in-community-settings
(`data/vk-dev-community-token.txt`)

- Community tokens are created in the community settings (Управление →
  Дополнительно → Работа с API, "Manage → Advanced → API usage").
- They do not expire.
- They work with Bots Long Poll (`groups.getLongPollServer`) and the
  Callback API.

This is the only route VK documents for automated message handling
today.

### Platform rules, edition 19.08.2026

Source: https://dev.vk.ru/ru/rules (`data/vk-platform-rules-2026-08-19.txt`)

> Все интеграции должны использовать только методы, опубликованные в
> официальной документации, и соблюдать установленные лимиты. Методы, не
> входящие в публичную документацию, будут поэтапно ограничены.
>
> С 7 сентября 2026 года для одного аккаунта в Кабинете для бизнеса VK ID
> устанавливаются лимиты на количество вызовов методов VK API в месяц:
> • Для партнёров без верификации бизнес-профиля — 10 000 вызовов в месяц.
> • После верификации бизнес-профиля — 100 000 000 вызовов в месяц.

("All integrations must use only methods published in the official
documentation and respect the set limits. Methods outside the public
documentation will be restricted step by step. From 7 September 2026,
each account in the VK ID Business Cabinet gets monthly limits on VK API
method calls: 10,000 calls a month for partners without business-profile
verification, and 100,000,000 calls a month after verification.")

Rules 1.4, 1.6, 2.1, 2.2 and 4.6 cover:

- not impersonating official VK products;
- no offline download of content;
- collecting only the data an app needs, and not passing it on;
- grounds for blocking.

None of them explicitly names using another app's client_id.

## 2. Our own probe (high trust, limited scope)

`experiments/issue-32/probe-vk-oauth-apps.mjs`, run on 2026-10-11
against oauth.vk.com and oauth.vk.ru. See
`verification-logs/oauth-probe*.txt` and the table in the
[README](./README.md).

The probe sends:

- no cookie and no token;
- `scope=messages,offline`;
- `redirect_uri=https://oauth.vk.com/blank.html`;
- `response_type=token`.

The answers fall into seven classes. Two control client_ids (999999999, 12345) confirm what `deleted` and `no-messages` look like.

A finding from vkhost's own source (`data/vkhost-script-210829.js`,
line 32): the `messages` checkbox is marked «доступ к API сообщений
ограничен» ("access to the messages API is restricted") and is unticked
by default. The default `scope=1073737727` is therefore every right
**except** `messages` (2³⁰ − 1 − 4096). `js/tests/vk-auth.test.js` pins
this.

## 3. vkhost.github.io project and its issue tracker (medium trust)

- https://vkhost.github.io/ (`data/vkhost-index.html`,
  `data/vkhost-script-210829.js`): the 15 client_ids and the URL it
  builds.
- https://github.com/vkhost/vkhost.github.io/issues
  (`data/vkhost-issues.json`, `data/vkhost-issue-*-comments.json`):
  - #4 (2025-09-02) "Новый домен vk" ("New VK domain"): «Не работает ни
    один токен, замените домен» ("No token works, change the domain").
  - #5 (2025-10-31): VK Admin answers "too much tries". A comment on
    2025-11-07: VK Admin (iOS) answers
    `{"error":"invalid_request","error_description":"Security Error"}`,
    «Но часть оставшихся приложений все еще работает» ("But some of the
    remaining apps still work").
  - #6 (2026-04-13): VK Admin answers `application is blocked` and old
    tokens stopped working. On 2026-04-14 a user asks «есть какие
    приложения айдишники где можно получить именно message и offline?»
    ("are there any app IDs where you can get exactly message and
    offline?").
  - #7 (2026-08-08) "Не работает Kate Mobile" ("Kate Mobile doesn't
    work"), quoting «Сервис заблокирован» ("The service is blocked").
    On 2026-09-09 a commenter links the rozetked.me report of the
    shutdown.

The vkhost page itself has not changed since 2021. It still offers
VK Admin and Kate first.

## 4. Community reports (lower trust, dated, first-hand)

### Gist AlexanderPro/26e13137596c4fc6d4e07a269f5debf2

https://gist.github.com/AlexanderPro/26e13137596c4fc6d4e07a269f5debf2
is a widely shared "get a VK token" guide. Its comments are saved in
`data/gist-alexanderpro-comments.json`. Relevant comments, in order:

- 2026-04-13: «сейчас (13.04.2026) VK Admin токены получать нельзя, а
  старые токены отключены» ("right now (13.04.2026) you can't get VK
  Admin tokens, and the old tokens are disabled"). The commenter
  switches to Kate Mobile.
- 2026-05-03: «токены кейт мобайл теперь тоже ограничены вдоль и
  поперек» ("Kate Mobile tokens are now restricted every which way
  too").
- 2026-05-04: «частично работает маруся» ("Marusya partly works").
- 2026-05-21: one user was banned «первый раз когда использовал Kate
  Mobile, второй раз забанили когда использовал vfeed» ("the first time
  when I used Kate Mobile, the second time when I used vfeed").
- 2026-06-25: an account restricted for 24 hours after using a Kate
  Mobile token.
- 2026-05-24: «Я сейчас на Prizma, вроде нормально работает» ("I'm on
  Prisma now, seems to work fine"). On 2026-07-07 the same user reports
  being blocked, without naming the client.
- 2026-07-13: «За последние 2-3 месяца наверное уже раз 6 морозили»
  ("In the last 2-3 months they've frozen me about 6 times"), with Kate
  tokens.
- 2026-07-15: «заморозили аккаунты спустя 1-2 дня за токен сначала Kate,
  потом Маруси. Причем морозит видимо за сам факт выпуска токена»
  ("accounts frozen 1-2 days after a token, first Kate, then Marusya.
  And apparently it freezes for the mere fact of issuing the token").
- 2026-07-16: «Приложение "Звонки ВКонтакте" (ID приложения: 7793118)
  работает с правами offline и message» ("The VK Calls app (app ID: 7793118) works with the offline and message rights"). Later the same
  day, about Marusya (6463690): «Успешно отправил одно сообщение себе в
  личку и через некоторое время заморозило на 4 дня» ("Successfully sent
  one message to myself, and after a while the account was frozen for 4
  days").
- 2026-09-08: «да сегодня все прикрыли, ответы "Flood control"» ("yes,
  they shut everything down today, the answers are 'Flood control'").
- 2026-09-24: on asking devsupport@corp.vk.com, «доступ выдается в
  **исключительных** случаях» ("access is granted in **exceptional**
  cases").

### ItsLouan/VK-Dialog-Photo-Archiver#2

https://github.com/ItsLouan/VK-Dialog-Photo-Archiver/issues/2
(`data/vk-dialog-archiver-issue-2*.json`), 2026-09-30:

> В гайде написано, что получение токена нужно выбрать либо "VK Admin",
> либо "Kate Mobile", но при выборе одного или другого не работает, нужно
> выбирать vk.com и от туда брать токен для работы приложения.

("The guide says that to get the token you should pick either 'VK Admin'
or 'Kate Mobile', but picking either one doesn't work; you need to pick
vk.com and take the token from there for the app to work.")

This is the most recent first-hand report, and the only one after the
September cut-off that names a working client: **vk.com, 6287487**.

## 5. Press coverage of the Kate Mobile shutdown (medium trust)

The full digest with quotes is in `data/news-kate-mobile-ban.md`. The
key points, consistent across sources:

- VK's 7 September limits took effect.
- The 100M/month verified cap would last Kate's users about 1.5 days,
  and `messages.send` alone needs about twice the cap (kod.ru).
- VK did not answer about pricing at first. droidnews.ru reports that
  VK support replied on 10 September that further quota is paid, at
  about 15 million rubles a month.
- info24.ru (2026-10-01) says Kate is «заблокированным с 8 сентября 2026
  года» ("blocked since 8 September 2026"). It adds that "flood control"
  here is «следствие полного отключения приложения от API» ("the result
  of the app being fully cut off from the API").

Sources:

- kod.ru (2026-09-09): https://kod.ru/vkontakte-zablokiroval-kate-mobile-api-limits
- anti-malware.ru (2026-09-09): https://www.anti-malware.ru/news/2026-09-09-111332/51348
- droidnews.ru (2026-09-13, updated 2026-09-20):
  https://droidnews.ru/kate-mobile-ne-rabotaet-posle-blokirovki-vk-chem-zamenit-klient-i-pochemu-v-lente-chuzhie-posty
- info24.ru (2026-10-01):
  https://info24.ru/news/chto-s-kate-mobile-segodnya-1-oktyabrya-pochemu-ne-rabotaet-flood-control-chto-delat.html
- rozetked.me, linked from vkhost issue #7 (not fetched):
  https://rozetked.me/posts/48217-storonniy-klient-vkontakte-kate-mobile-perestal-rabotat

## 6. Domain migration

- https://github.com/vkhost/vkhost.github.io/issues/4

vkhost issue #4 (2025-09-02) quotes VK's notice asking developers to
move to `oauth.vk.ru`, `api.vk.ru` and `vk.ru/dev` by 30 September. On 2026-10-11 both `api.vk.com` and `api.vk.ru` still
answer, and both return error 15 without a token. The token checker run
in `verification-logs/vk-token-check.txt` gets error 5 from api.vk.ru for
a bogus token, as expected.

## Sources deliberately not relied on

- **Lists of "working VK token apps" on small blogs and Telegram
  channels.** They are unverifiable, and several push their own client
  or token-selling service. That is the exact risk the issue asks us to
  avoid.
- **4PDA threads.** They answered 403 to the fetcher. Where a news
  article quotes them, the article is cited instead.
- **Modified Kate builds (e.g. the "Fellin" mod).** droidnews.ru reports
  account freezes on first login and fake copies circulating. An
  unofficial APK is a far larger data risk than any client_id choice.
