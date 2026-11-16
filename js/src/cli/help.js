/** Shared immutable CLI usage text; no providers, stores or command execution. */

export const APPLICATION_HELP = `  vacancies-application-batch --vacancies-file=<url-lines.txt> --request-id=<id> [--max-applications=0] [--duration-ms=86400000] [--no-questions=true|false] [--process-chats=true|false] [--chats-interval-minutes=120] [--chat-browser-slot=chat-slot] [--chat-model-draft=true|false] [application settings below]
  vacancies-application-batch-status [--request-id=<id>] [--browser-slot=jobs] [--store=<dir>]
  vacancies-application --url=<hh-vacancy-url> --request-id=<id> [--cover-letter-file=<text-file>] [--standard-letter-en-file=<text-file> --standard-letter-ru-file=<text-file>] [--no-auto-select-resume-language=true|false] [--no-auto-answer-viewed-vacancy=true|false] [--supervised=true|false] [--confirm=answers,cover-letter,send,popup|none] [--auto-exact=true|false] [--review-delay-ms=3000] [--job-application-interval=0|seconds] [--test-mode=true|false] [--recover=true|false] [--browser-slot=jobs] [--headless=true|false] [--store=<dir>]
  vacancies-application-status --url=<hh-vacancy-url> [--request-id=<id>] [--browser-slot=jobs] [--store=<dir>]
                survey start setting: [--auto-answer-viewed-vacancy=true|false] [--configuration=<file.lenv>]
                priority: explicit positive/negative flag > AUTO_ANSWER_VIEWED_VACANCY environment > selected .lenv > current-directory .lenv > true; status never changes saved settings`;

export const AUTOMATION_HELP = `  automations   [list] | plan <id> | run <id> | review | drafts | history | save <file.lino> | delete <id>
                [--chat=<source:chat,...>] [--test] [--limit=<n>] [--self=<id,id>] [--automation=<id>] [--json] [--store=<dir>]
                run: safe mode queues drafts; auto mode shows the plan and sends after y (or --yes)
                answer-questions: saved action modelDraft=true drafts unanswered parts using answers model settings; every model draft requires review
                review: safe mode — send, edit, switch ты/вы, mark sent or skip one draft at a time
                answers: list | save [file.lino] | delete <id> | plan --question=<text> [--model-draft] [--config=file.lino|--automation=id] | learn [--apply] [--contract] [--config=file.lino|--automation=id]
                answers save: --id=<id> --question=<text> --answer=<text> [--kind=question|notice] [--approved] [--canonical] [--sources=hh,telegram] [--chats=hh:123]
                answers policy [file.lino]: [--reject=<text>] [--clear-rejected] [--punctuation-equivalent=true|false]
                answers model show | save --enabled=true|false --revision=<revision|null> [--model=id] [--cv=cv:id] [--timeout-ms=60000]
                answers plan choices: --options='(Yes No)' --strict-options=true (Links Notation labels)
                answers browser show | inspect --source=hh --chat=<web-reference> [--browser-url=<application-url>] | prefill --id=<review> | select --id=<review> --option=<exact-label> --confirm=true | status --id=<review>
                answers browser watch --id=<review> --confirm=true [--duration-ms=7200000] [--watch-id=<request-id>] (foreground; Ctrl+C stops and drains)
                answers browser watch-status | watch-stop --watch-id=<saved-id> (status never resumes a watcher)
                answers browser unread --source=hh --confirm=true [--pass-id=<request-id>] [--max-chats=20] [--budget-ms=30000] [--answer-chats=true|false] [--model-draft=true|false] (inactive browser; opening may mark read; generated text stays in review)
                answers browser unread-status | unread-stop --pass-id=<saved-id> (status never repeats traversal)
                answers exchange: [--refresh] [--max-age-days=7] (cached snapshot unless explicitly refreshed)
                answers profiles list | show <id> | save <id> --name=<name> --values=<lino> [--revision=<revision>] | save --file=profile.lino | delete <id> --revision=<revision> [--json]
                answers profiles import [id] --file=contacts.lino [--json] (read-only draft)
                answers profile-sources | profile [--cv=<platform|cv:id>] [--text=<owner contacts>|--text-file=<path>] [--format=text|resume-markdown|contacts-lino] [--profile=<lino>] [--json] (read-only draft)
                follow: links | extract | clear [--source=<provider>] [--chat=<id>] [--self=<id,id>] [--limit=<n>] [--offset=<n>]
                follow extract: scans cached incoming messages; --limit=0 scans the whole cached archive
                follow chats: [--source=vk] [--telegram-only] [--limit=50] [--offset=0]
                follow details: --chat=<VK peer or local chat ID> [--member-offset=0] [--member-limit=50] [--message-limit=10]
                follow telegram list: [--limit=40] [--cursor=<next>]
                follow telegram join | leave | preferences: --target=<username|signed-id|Telegram-link> [--mute=true|false] [--archive=true|false] [--confirm=true]
                follow chats | details | telegram: [--attempts=3] [--retry-delay-ms=100] [--retry-max-delay-ms=2000] (timeout reads only; total attempts include the first call)
                follow backlinks post: [--source=vk|telegram] --chats=<signed-Telegram-ID-or-VK-peer,...> --backlink=<Telegram-or-VK-invite> [--monitor-ms=200000] [--interval-ms=30000] [--delay-ms=0] [--delete-incoming=false] [--history-limit=200] [--attempts=3] [--retry-delay-ms=100] [--retry-max-delay-ms=2000] [--confirm=true]
                follow backlinks post --auto-follow=true: [--max-retries=10] [--max-links=100] [--join-delay-ms=1000] [--follow-mute=true] [--follow-archive=true] (Telegram preferences; VK joins do not change them)
                follow backlinks list | status | resume | cancel: [--job-id=<saved-id>] [--limit=20] [--offset=0] [--confirm=true]
                Telegram operations preview by default; leave preserves history. Confirmation applies the frozen plan once.`;

export const BROADCAST_HELP = `  broadcast-targets [--store=<dir>]
  broadcast-target-save --id=<id> --label=<name> --network=telegram|vk|x --kind=channel|group|personal-wall|community-wall|account [--destination=<id|@name>] [--auth-mode=<mode>] [--format=plain|html] [--enabled=true|false]
  broadcast-target-remove --id=<id>
  broadcast-credentials --network=telegram|vk|x [--file=<private-json-file>]
  broadcast-setup --network=telegram|vk|x (interactive masked credential input)
  broadcast-preview --text=<message> --targets=<id,id> | --all [--debug=true|false]
  broadcast-send (preview flags) [--request-id=<stable-id>] [--yes]
  broadcast-test --id=<destination-id> (read-only identity test)
  broadcast-history [--id=<publication-id>] [--limit=50]
  broadcast-delete --id=<publication-id> [--targets=<id,id>] [--yes]
                all broadcast commands accept --store=<dir>; legacy broadcast --networks still queues`;

export const BROWSER_HELP = `  vk-token      status | start --confirm | import --confirm | cancel --id=<current-id> [--url=http://127.0.0.1:8787]
                start opens the connected Electron authorization window; import uses a masked terminal prompt. Encrypted secret storage is required; start/import return a task ID. Read status until saved/failed; status never resumes work.
  browser-policies [--platform=hh] [--slot=main] [--case=cv] [--store=<dir>]
  browser-configure --scope=default|case|slot [--key=cv|hh/forms] --mode=visible|headless|inherit [--store=<dir>]`;

export const TRUST_HELP = `  trust         [--store=<dir>] [--remove=true]
                lets Safari use the server from the hosted app: trusts the server's own certificate (localhost and 127.0.0.1 only) once`;

export const CONTACTS_HELP = `  contacts-import [--file=<contacts.vcf> | --system] [--store=<dir>] [--preview]
                import a vCard export or macOS Contacts (including synced iCloud accounts); nothing is uploaded`;

export const TELEGRAM_EXPORT_HELP = `  telegram-export --chat=<id|@username|t.me/link> --folder=<absolute-path>
                [--scope=active|all] [--gap-hours=4] [--max-lines=1500]
                [--formats=markdown|html|json|html,json] [--media=all|none|photos,files,...]
                [--size-limit-mb=8] [--from=YYYY-MM-DD] [--to=YYYY-MM-DD] [--store=<dir>] [--debug=true|false]
                active is the CLI default; Markdown includes linked structured JSON parts`;

export const TELEGRAM_USERS_HELP = `  telegram-users --chat=<id|@username|t.me/link> [--participants-limit=10000] [--messages-limit=100000]
  telegram-chat-contacts --chat=<id|@username|t.me/link> [--limit=0] [--delay-ms=10000]
                [--apply=true] [--share-phone=true] [--include-existing=true] [--store=<dir>]
                Contacts are previewed by default; phone sharing is off. Scan limits also apply.
                Zero participants means unlimited; zero messages disables history. [--debug=true]`;

export const TELEGRAM_GREETING_SEND_HELP = `  telegram-bot-start --chat=<@bot|id> [--confirm=true] [--store=<dir>]
  telegram-greet --chat=<@username|signed-id|t.me/link> [--sticker=<document-id>]
                [--confirm=true] [--store=<dir>]
                Preview by default. Confirmation sends one reviewed /start or cached greeting, with Telegram acknowledgement.`;

export const TELEGRAM_GROUP_GREETING_HELP = `  telegram-greet-group --chat=<group-id|@group|t.me/link> [--limit=0] [--delay-ms=30000]
                [--participants-limit=10000] [--sticker=<document-id>] [--confirm=true] [--store=<dir>]
                Scans participants and previews eligible private greetings by default. Zero limit selects all eligible users.
                Confirmation sends the reviewed selection with acknowledgements and 24-hour deduplication; the first error stops.`;

export const TELEGRAM_GREETINGS_HELP = `  telegram-greeting-stickers [--refresh=true] [--max-sets=1000] [--max-documents=10000]
                [--greetings-only=false] [--offset=0] [--limit=100] [--store=<dir>]
                Reads the connected user's cache. Refresh discovers featured, mask, recent and favourite stickers; it sends nothing.
${TELEGRAM_GREETING_SEND_HELP}
${TELEGRAM_GROUP_GREETING_HELP}`;

export const TELEGRAM_LOGIN_HELP = `  telegram-login [--api-id=<id>] [--store=<dir>]
  telegram-session-import --file=<legacy-string-session-file> [--api-id=<id>] [--store=<dir>]
  telegram-session-import --env-file=<legacy-follow-env-file> [--store=<dir>]
                API hash and phone use TELEGRAM_API_HASH/TELEGRAM_PHONE or masked terminal prompts.
                API ID also accepts TELEGRAM_API_ID; code/2FA prompts are masked. Sessions stay in the store.
                Follow TELEGRAM_USER_BOT_* aliases are accepted. Output is Lino; --json requests JSON.`;

export const CV_HELP = `  cv-platforms  [--json]
  cv-plan       --platform=<id> [--json]
  cv-read       --platforms=<a,b> [--login=<l>] [--vars=<json>] [--headless|--headed] [--browser-slot=<name>] [--profile=<dir>] [--artifacts=<dir>] [--no-save] [--store=<dir>]
  cv-diff       [--platforms=<a,b>] [--prefer=<id>] [--json] [--store=<dir>]
  cv-experience-import --file=<experience.lino|experience.bin|experience.json> [--store=<dir>]
  cv-experience-export --revision=<sha256> [--json] [--store=<dir>]
  cv-experience-stored [--store=<dir>]
  cv-experience-from-hh --export-id=<id> --resume=<hash> [--browser-slot=jobs] [--store=<dir>]
  cv-experience-linkedin-start --url=<https://www.linkedin.com/in/login/details/experience/> [--language=en|ru] [--request-id=<id>] [--store=<dir>]
  cv-experience-linkedin-status --request-id=<id> [--store=<dir>]
  cv-experience-linkedin-stop --request-id=<id> [--store=<dir>]
  cv-experience-linkedin-evidence --request-id=<id> --name=<linkedin-experience.txt|linkedin-experience.json> [--store=<dir>]
  cv-experience-compare --hh=<revision> --linkedin=<revision> [--store=<dir>]
                Private snapshot interchange only. Reuses a verified native HH export; never opens an editor or saves a provider change.
  cv-sync       [--platforms=<a,b>] [--apply] [--prefer=<id>] [--paths=<a,b>] [--groups=<a,b>] [--login=<l>] [--vars=<json>] [--headless|--headed] [--browser-slot=<name>] [--store=<dir>]
  cv-telemetry  [--run=<id>] [--platform=<id>] [--type=<event>] [--limit=<n>] [--json] [--store=<dir>]`;

export const VACANCY_HELP = `${APPLICATION_HELP}
  vacancies-discovery-start [search/filter/browser flags from vacancies-search] [--max-pages=10] [--max-vacancies=100] [--duration-ms=900000] [--refresh=true|false] [--request-id=<id>] [--store=<dir>]
  vacancies-discovery-status|vacancies-discovery-stop [--request-id=<id>] [--browser-slot=jobs] [--store=<dir>]
    Finite native pagination and acknowledged description collection; no applications. Start owns the foreground until completion; SIGINT/SIGTERM stop and drain it. Saved status and repeated IDs never resume discovery. Use completed entries with decision.reason=review as an explicitly reviewed batch URL list. Stop requires a request ID.
  vacancies-search [--query=<text>] [--resume=<hash>] [--area=<id>] [--salary=<amount>] [--currency=RUR|USD|EUR] [--remote=true|false] [--order=salary_desc|publication_time|relevance] [--page=0] [--skip-responded=true|false] [--exclude-text=<literal-lines>] [--browser-slot=jobs] [--headless=true|false] [--store=<dir>]
  vacancies-collect --url=<hh-vacancy-url> [--refresh=true|false] [--browser-slot=jobs] [--headless=true|false] [--store=<dir>]
  vacancies-stored [--store=<dir>]
  vacancies-choices-stored [--browser-slot=jobs] [--store=<dir>]
  vacancies-choice-save --url=<hh-vacancy-url> --title=<text> --state=skipped|deferred --revision=<observed-revision> [--note=<private-text>] [--browser-slot=jobs] [--store=<dir>]
  vacancies-choice-clear --url=<hh-vacancy-url> --revision=<observed-revision> [--browser-slot=jobs] [--store=<dir>]
  vacancies-resumes [--resume=<hash>] [--resume-language=ru|en|any] [--browser-slot=jobs] [--headless=true|false] [--store=<dir>]
  vacancies-resumes-stored [--store=<dir>]
  vacancies-resume-export [--resume=<hash>|--all=true] [--formats=pdf,doc,rtf,html] [--request-id=<id>] [--out=<directory>] [--browser-slot=jobs] [--headless=true|false] [--store=<dir>]
  vacancies-resume-export-status --request-id=<id> [--store=<dir>]
  vacancies-resume-export-cancel --request-id=<id> [--store=<dir>]
  vacancies-resume-exports-stored [--store=<dir>]
  vacancies-cv-publish-plan --repository=<existing-repository-root> --resumes=<saved-hash,...> [--export-id=<native-export-id>] [--remote=origin] [--directory=examples/cv-snapshots] [--request-id=<id>] [--browser-slot=jobs] [--store=<dir>]
  vacancies-cv-publish --request-id=<reviewed-id> --confirmation=<reviewed-digest> --publish=true [--browser-slot=jobs] [--store=<dir>]
  vacancies-cv-publish-status [--request-id=<id>] [--browser-slot=jobs] [--store=<dir>]
    Publication is opt-in: review the sanitized Lino and exact target first. The existing remote branch must match local HEAD. Only saved snapshot paths are committed/pushed; pending plans and unrelated staged changes are preserved. Uncertain attempts and status never retry.
  vacancies-technology-catalog [--store=<dir>]
  vacancies-technology-catalog-save --file=<catalog.lino|catalog.bin|catalog.json> [--store=<dir>]
  vacancies-technology-analyze --export-id=<id> --resume=<hash> --revision=<catalog-revision> [--browser-slot=jobs] [--store=<dir>]
  vacancies-technology-analysis-stored [--browser-slot=jobs] [--store=<dir>]
  vacancies-technology-review --ru-export-id=<id> --ru-resume=<hash> --en-export-id=<id> --en-resume=<hash> --revision=<catalog-revision> [--browser-slot=jobs] [--store=<dir>]
  vacancies-technology-review-stored [--browser-slot=jobs] [--store=<dir>]
  vacancies-technology-review-save --fingerprint=<review-fingerprint> --selected=<change-id>,<change-id> [--browser-slot=jobs] [--store=<dir>]
  vacancies-cv-watch [--request-id=<id>] [--duration-ms=900000] [--target-id=<existing-tab-id>] [--browser-slot=jobs] [--store=<dir>]
  vacancies-cv-watch-status [--request-id=<id>] [--browser-slot=jobs] [--store=<dir>]
  vacancies-cv-watch-stop [--request-id=<id>] [--browser-slot=jobs] [--store=<dir>]
  vacancies-cv-snapshots [--browser-slot=jobs] [--store=<dir>]
  vacancies-cv-workplace-membership --export-id=<id> --resume=<hash> --job-index=<index> --record-id=<existing-id> [--target-id=<existing-tab-id>] [--browser-slot=jobs] [--store=<dir>]
  vacancies-cv-workplace-source --export-id=<id> --resume=<hash> [--job-index=0] [--browser-slot=jobs] [--store=<dir>]
  vacancies-cv-workplace-dictionaries [--store=<dir>]
  vacancies-cv-workplace-plan --export-id=<id> --resume=<hash> --job-index=<index> --record-id=<existing-id> --file=<fields.json|fields.lino|fields.bin> [--browser-slot=jobs] [--store=<dir>]
  vacancies-cv-workplace-plan --operation=detach --export-id=<id> --resume=<hash> --job-index=<index> --record-id=<existing-id> --file=<reviewed-membership.json|.lino|.bin> [--browser-slot=jobs] [--store=<dir>]
  vacancies-cv-workplace-plan-stored [--fingerprint=<plan-fingerprint>] [--browser-slot=jobs] [--store=<dir>]
  vacancies-cv-workplace-review --fingerprint=<plan-fingerprint> [--browser-slot=jobs] [--store=<dir>]
  vacancies-cv-prepare --fingerprint=<review-fingerprint> --change-id=<ru|en>:<about|jobs.N.description|workplace> [--review-kind=workplace] [--record-id=<existing-workplace-id>] [--request-id=<id>] [--target-id=<existing-tab-id>] [--browser-slot=jobs] [--store=<dir>]
  vacancies-cv-prepare-status [--request-id=<id>] [--browser-slot=jobs] [--store=<dir>]
  vacancies-cv-prepare-cancel --request-id=<id> [--browser-slot=jobs] [--store=<dir>]
  vacancies-cv-translate --file=<texts.json|texts.lino|texts.bin> --from=ru|en --to=en|ru [--providers=haiku,luna,formal-ai] [--haiku-model=<id>] [--luna-model=<id>] [--request-id=<id>] [--browser-slot=jobs] [--store=<dir>]
  vacancies-cv-translation-status [--request-id=<id>] [--browser-slot=jobs] [--store=<dir>]
  vacancies-cv-translation-cancel --request-id=<id> [--browser-slot=jobs] [--store=<dir>]`;

export const FORMS_REVIEW_HELP =
  '  forms-review  <url> [<url> ...] | --url=<http-url> | --urls=<Lino-list> [--prefill] [--max-sessions=<n>] [--format=json|markdown] [--capture-pages=false] [--no-learn] [--browser-slot=<name>] [--resume-pdf=<path>] [--profile-id=<id>] [--salary=<Lino>] [--vacancy=<Lino>] [--approximate=false] [--threshold=0.78] [--case-sensitive=false] [--model-draft] [--headed|--headless] [--store=<dir>]';

export const FORMS_WATCHERS_HELP =
  '  forms-watchers [--action=list|status|history|stop] [--browser-slot=<name>] [--store=<dir>]';

export const FORMS_RESUME_HELP =
  '  forms-resume  --action=status|save|delete [--file=<pdf-path>] [--revision=<saved-revision>] [--store=<dir>]';

export const TEST_ASSIGNMENT_HELP =
  '  test-assignment <name|owner/name> --file=<inspection.json>|--url=<form-url> [--vacancy=<hh-url>] [--source=<instruction-url>] [--visibility=private|public] [--employer=<name>] [--dry-run] [--draft-id=<saved-draft>] [--store=<dir>]';

export const FORMS_ASSIGNMENT_HELP = `  forms-assignment-link --file=<inspection.json> --repository=<https://github.com/owner/repo> --revision=<assignment-revision> [--store=<dir>]\n${TEST_ASSIGNMENT_HELP}`;

export const FORMS_HELP = `  forms-read    --url=<http-url> [--format=json|markdown] [--browser-slot=<name>] [--headed|--headless] [--store=<dir>]
  forms-plan    --file=<inspection.json> [--format=json|markdown] [--profile-id=<id>] [--profile=<Lino>] [--salary=<Lino>] [--vacancy=<Lino>] [--approximate=false] [--threshold=0.78] [--case-sensitive=false] [--model-draft] [--source=<provider>] [--chat=<id>] [--store=<dir>]
${FORMS_REVIEW_HELP}
${FORMS_WATCHERS_HELP}
${FORMS_RESUME_HELP}
${FORMS_ASSIGNMENT_HELP}`;

export const GREETINGS_HELP = `  greetings-stickers [--live] [--networks=vk,telegram] [--json] [--store=<dir>]
  greetings-select   [--stickers=vk:21,facebook:<id>] [--sets=<a,b>] [--language=en|ru|zh|hi|vi] [--prefer=sticker|text] [--texts=<phrases separated by newlines>] [--json] [--store=<dir>]
  vk-attachments    [--after=<cursor>] [--limit=1..100] [--enabled=true|false] [--store=<dir>]
  vk-stickers       inspect|refresh|filter|export --account=<VK-user-ID> [--query=<words>] [--category=all|greeting|birthday|thanks|farewell] [--pack=<ID>] [--usable-only=false] [--offset=<n>] [--file=<received-JSON>] [--folder=<new-absolute-path>] [--store=<dir>]
  vk-send-queue     [--enabled=true|false] [--mark-read=true|false] [--typing=true|false] [--chars-per-minute=60..3000] [--store=<dir>]
  vk-cache          inspect|refresh|export --account=<VK-user-ID> [--peer=<ID>] [--kind=history|conversation|friends|profile|friend-count] [--max-pages=1..50] [--page-offset=<cached-offset>] [--restart] [--folder=<new-absolute-path>] [--store=<dir>]
  vk-online         [--enabled=true|false] [--every-minutes=1..14] [--run=true] [--store=<dir>]
  vk-cleanup        status|save|plan|run [--enabled=true|false] [--every-minutes=30] [--limit=10000] [--priority=ID,ID] [--plan=<id> --confirm=true] [--store=<dir>]
  vk-outgoing       status|save|plan|run [--enabled=true|false] [--every-minutes=8] [--limit=20] [--priority=ID,ID] [--plan=<id> --confirm=true] [--store=<dir>]
  vk-friends        status|save|plan|run|seed-priority|clear-priority [--acceptance-policy=ranked-batch|desktop-ten-percent] [--enabled=true|false] [--every-minutes=20] [--max-friends=10000] [--batch-size=23] [--priority=ID,ID] [--plan=<id> --confirm=true] [--store=<dir>]
  vk-greet          status|save|plan|run [--enabled=true|false] [--limit=10] [--scan-limit=100] [--stale-days=30] [--cooldown-days=1] [--message=<text>] [--sticker-id=0] [--online-only=true|false] [--empty-only=true|false] [--order-by-friends=true|false] [--priority=ID,ID] [--plan=<id> --confirm=true] [--store=<dir>]
  vk-wall           status|save|plan|run [--communities=ID,ID] [--messages=<one per line>] [--marker=<text>] [--attachments=photoOWNER_ID_ID,audioOWNER_ID_ID] [--replace-owned=true|false] [--active-avatar=true|false] [--plan=<id> --confirm=true] [--store=<dir>]
  vk-retention      status|save|plan|run [--peers=ID,ID] [--threshold=1000] [--scan-limit=2000] [--plan=<id> --confirm=true] [--store=<dir>]
  vk-suggestions   status|save|plan|run [--limit=1 --scan-limit=100 --max-friends=9900] [--plan=<id> --confirm=true] [--store=<dir>]
  vk-community     status|save|plan|run [--community-id=ID --offset=0 --sex=2] [--online-only=true --photo-required=true --open-only=true] [--plan=<id> --confirm=true]
  vk-rejections    status|save|plan|run [--limit=1 --scan-limit=1000] [--plan=<id> --confirm=true] [--store=<dir>]
  vk-birthday       status|save|plan|run [--time-zone=UTC] [--messages=<one per line>] [--stickers=ID,ID] [--attachments=videoOWNER_ID_ID] [--online-only=false] [--plan=<id> --confirm=true] [--store=<dir>]
  vk-topic          status|save|plan|run [--greeting=<text>] [--questions=<one per line>] [--stale-days=7] [--limit=10] [--plan=<id> --confirm=true] [--store=<dir>]
  vk-help           status|save|plan|run [--greeting=<text>] [--questions=<one per line>] [--stale-days=31] [--limit=10] [--plan=<id> --confirm=true] [--store=<dir>]
  vk-music          status|save|plan|run [--audio=audioOWNER_ID_AUDIO_ID] [--greeting=<text>] [--questions=<one per line>] [--stale-days=31] [--limit=10] [--plan=<id> --confirm=true] [--store=<dir>]
  vk-cancelled      status|save|plan|run [--enabled=true|false] [--every-minutes=20] [--limit=20] [--greeting=<text>] [--question=<text>] [--wait-days=2] [--block-unanswered=true|false] [--block-unwritable=true|false] [--priority=ID,ID] [--plan=<id> --confirm=true] [--store=<dir>]
  greetings-plan     [--mode=initiate|reply] [--networks=<a,b>] [--me=<id,id>] [--limit=<n>] [--stale-days=<n>] [--json] [--store=<dir>]
  greetings-send     (greetings-plan flags) [--delay-ms=<ms>] [--daily-cap=<n>] [--max-per-run=<n>] [--dry-run] [--json] [--store=<dir>]`;

export const MIGRATE_HELP =
  '  migrate       [--store=<dir>] [--dry-run | --status]   bring the store to the current data schema';

export const HELP = `meta-sovereign <command> [options]

Commands:
  import        --source=<name> --file=<path> --store=<dir>
  export        --file=<path> --store=<dir>
  backup        --store=<dir> --archive=<dir> [--keep=<n>] [--formats=text,binary] [--passphrase=<pp>]
  backup-config [--store=<dir>] [--interval-hours=<h>] [--keep=<n>] [--formats=text,binary|none]
  restore       --file=<path> --store=<dir> [--replace] [--passphrase=<pp>]
  passcode      --clear [--store=<dir>]   (remove a forgotten local passcode)
  runner        status|start local|start server|stop local|stop server [--profile=<runner.lino> | --url=<server-origin>]
                inspect local|inspect server [--profile=<runner.lino> | --url=<server-origin>]
                health [--store=<directory>]
                profile|configure --input=<runner.lino> --revision=<saved-revision> [--profile=<runner.lino> | --url=<server-origin>]
                observes isolated server sessions; starts/stops require confirmed backend state
                local and SSH targets use screen via link-foundation/start; no automatic start
  diagnostics   logs [--url=http://127.0.0.1:8787] [--after=0] [--follow]
                reads redacted recent server logs without opening the store; follow stops on SIGINT/SIGTERM
                settings [--url=<server-origin>] [--verbose=true|false]
                reads or saves the server's acknowledged logging preference; no account action is run
  serve         [--port=<n>] [--store=<dir>] [--allow-origin=<origins|none>] [--ui-url=<url>] [--local-ui=true] [--tls=false] [--trust=true|false] [--hardware-key=false] [--open=true|false] [--json-compatibility=true] [--quiet-logs]
                [--backup-interval-hours=<h>] [--backup-keep=<n>] [--recovery-formats=text,binary|none] [--app-config=<file>]
                user config.lino < .meta-sovereign/config.lino (or --app-config) < explicit options
                open https://link-foundation.github.io/meta-sovereign/; the localhost UI is opt-in
                on macOS: protect the TLS key with Secure Enclave; detect trust, set it up once in an interactive terminal
                each runtime retains a private redacted session in <store>/logs/<timestamp>-<pid>-<id>.log
                --verbose=false or MS_VERBOSE=0 omits debug timing; errors remain; --quiet-logs omits only the aggregate
                repeat serve after updating: the current worker serves while its replacement prepares
                https is served on the same port (for Safari); --tls=false or MS_TLS=off turns it off
${TRUST_HELP}
${CONTACTS_HELP}
${TELEGRAM_EXPORT_HELP}
${TELEGRAM_USERS_HELP}
${TELEGRAM_GREETINGS_HELP}
${TELEGRAM_LOGIN_HELP}
  sources
  source-pull   --source=<name> [--protocol=<p>] [--host=<mail-host>] [--owner=<o>] [--repo=<r>] [--state=<s>] [--offset=<n>] [--limit=<n>] [--max-requests=<n>] [--restart-history] [--store=<dir>]
  email-send    --protocol=<gmail|microsoft-graph|jmap|smtp> --to=<email> --subject=<s> --text=<body> [--host=<mail-host>]
  github-clone  --owner=<o> --repo=<r> [--ref=<branch>] --token=<pat> [--store=<dir>]
  github-comment --owner=<o> --repo=<r> --issue-number=<n> --text=<body> --token=<pat>
  upwork-search --query=<q> [--limit=<n>] [--sort=<s>] --token=<pat> [--store=<dir>]
  upwork-message --room-id=<r> --text=<body> --token=<pat> [--store=<dir>]
  peopleperhour-search --query=<q> [--limit=<n>] [--sort=<s>] --token=<pat> [--store=<dir>]
  peopleperhour-message --workstream-id=<w> | --proposal-id=<p> --text=<body> --token=<pat> [--store=<dir>]
  audience      --query=<expr> [--store=<dir>]
  facts         [--store=<dir>]
  search        --query=<text> [--min=<0..1>] [--store=<dir>]
  broadcast     --text=<msg> [--networks=t,vk,...] [--store=<dir>]
  patterns      [--store=<dir>]
  patterns-infer --examples=<a,b,c> [--mode=simple|lcs]
  graphs        [--store=<dir>]
  graphs-run    --id=<graph:id> --message=<text> [--mode=auto|semi] [--store=<dir>]
  replies       [--store=<dir>]
  profile       [--name=<n>] [--bio=<b>] [--store=<dir>]
  resume        [--title=<t>] [--body=<b>] [--store=<dir>]
  sync-listen   [--port=<n>] [--store=<dir>] [--sync-format=lino|binary|json]
  sync-connect  --port=<n> [--host=<h>] [--store=<dir>] [--sync-format=lino|binary|json]
                JSON sync also requires --json-compatibility=true on both ends
  outreach      --query=<expr> --text=<msg> [--reply=<reply:id>] [--networks=t,vk] [--mode=preview|queue] [--store=<dir>]
${AUTOMATION_HELP}
  export-encrypted --file=<path> --passphrase=<pp> [--store=<dir>]
  purge-tombstones --confirm=true [--id-prefix=<msg:tg>] [--older-than=<iso>] [--store=<dir>]
  vault-init    --kind=passphrase|pin|passkey|totp-recovery --secret=<s> [--label=<l>] [--file=<path>]
  vault-add     --secret=<old> --kind=<k> --new-secret=<s> [--label=<l>] [--file=<path>]
  vault-remove  --secret=<s> --id=<unlock-id> [--file=<path>]
  vault-list    [--file=<path>]
${CV_HELP}
${VACANCY_HELP}
${BROWSER_HELP}
${FORMS_HELP}
${GREETINGS_HELP}
${BROADCAST_HELP}
${MIGRATE_HELP}
  help          (also --help, -h)
  version       (also --version, -v)
`;
