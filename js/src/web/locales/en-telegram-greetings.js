export const enTelegramGreetings = {
  'telegram.group.title': 'Greet group participants privately',
  'telegram.group.note':
    'Scan and review first. Excludes yourself, bots, deleted, fake, scam, verified and visible business accounts. Unavailable business checks stay excluded. Acknowledged greetings are limited to one per person in 24 hours; uncertain outcomes block another attempt.',
  'telegram.group.target': 'Exact group username, ID or Telegram link',
  'telegram.group.participantsLimit':
    'Participant scan limit (0: all available)',
  'telegram.group.limit': 'Greeting limit (0: all eligible)',
  'telegram.group.delayMs': 'Pause between recipients (milliseconds)',
  'telegram.group.scan': 'Scan group participants',
  'telegram.group.preview': 'Preview private greetings',
  'telegram.group.apply': 'Send {count} private greetings',
  'telegram.group.planDelay':
    'Pause: {seconds} seconds between recipients. Stops on the first failed or uncertain send.',
  'telegram.group.sample': 'The first 100 reviewed recipients are shown.',
  'telegram.group.processed': 'Processed {count} of {total} recipients',
  'telegram.group.checkingBusiness': 'Checking visible business profiles…',
  'telegram.group.nextAt': 'Next recipient after {at}',
  'telegram.group.stopped':
    'The batch stopped. Review its results before starting a new scan.',
  'telegram.group.uncertain':
    'The server response was lost. Refresh the job and check Telegram/Outbox before another attempt. This request will not be replayed.',
  'telegram.group.unavailable':
    'The operation could not be completed. Check the connection and job results.',
  'telegram.group.result.sent': 'Acknowledged by Telegram',
  'telegram.group.result.failed': 'Not sent',
  'telegram.group.result.unknown': 'Outcome uncertain',
  'telegram.group.result.skipped': 'Skipped',
  'telegram.group.reason.verified': 'Verified account',
  'telegram.group.reason.business': 'Business account',
  'telegram.group.reason.business-unavailable': 'Business profile unavailable',
  'telegram.group.reason.not-participant': 'Not a scanned participant',
  'telegram.group.reason.group-required':
    'Choose an accessible group or supergroup, rather than a user or broadcast channel.',
  'telegram.group.reason.group-scan-required':
    'Complete a participant scan for this group first.',
  'telegram.group.reason.preview-expired':
    'The preview expired or its scan changed. Review a new selection.',
  'telegram.group.reason.account-changed':
    'The connected account changed. Scan and review again.',
  'telegram.group.reason.target-changed':
    'The group or recipient changed. Scan and review again.',
  'telegram.group.reason.recipient-ineligible':
    'The recipient is no longer eligible.',
  'telegram.group.reason.already-greeted': 'Greeted in the last 24 hours',
  'telegram.group.reason.previous-outcome-unknown':
    'Previous outcome unresolved',
  'telegram.greeting.title': 'Send one Telegram greeting',
  'telegram.greeting.note':
    'Preview the exact account, target and message before sending. Greeting stickers have a rolling 24-hour limit per chat.',
  'telegram.greeting.userRequired':
    'Connect a Telegram user account to a server that supports reviewed greeting sends.',
  'telegram.greeting.target': 'Exact username, chat ID or Telegram link',
  'telegram.greeting.operation': 'Message',
  'telegram.greeting.operation.greeting-sticker': 'Greeting sticker',
  'telegram.greeting.operation.bot-start': 'Start a bot (/start)',
  'telegram.greeting.random':
    'A greeting is chosen from the cache during preview. You can choose a sticker below.',
  'telegram.greeting.useRandom': 'Choose randomly during preview',
  'telegram.greeting.chosen': 'Sticker: {sticker}',
  'telegram.greeting.preview': 'Preview message',
  'telegram.greeting.send': 'Send this message',
  'telegram.greeting.review': 'Account {owner} → {target}',
  'telegram.greeting.expires': 'Preview expires: {at}',
  'telegram.greeting.busy': 'Waiting for Telegram…',
  'telegram.greeting.reload': 'Check greeting connection',
  'telegram.greeting.result.sent': 'Telegram acknowledged message {id}.',
  'telegram.greeting.result.failed':
    'The message was not sent. Review the target and connection before previewing again.',
  'telegram.greeting.result.unknown':
    'Delivery is uncertain. Check the chat and resolve this send in Outbox before sending again.',
  'telegram.greeting.result.skipped':
    'This chat was greeted within the last 24 hours. Nothing was sent.',
  'telegram.greeting.error.bad-request':
    'Check the exact target and selected sticker.',
  'telegram.greeting.error.busy': 'A greeting is already being sent.',
  'telegram.greeting.error.stopped':
    'The account is stopping. Reconnect before continuing.',
  'telegram.greeting.error.cancelled':
    'The preview or send was cancelled before delivery.',
  'telegram.greeting.error.plan-expired':
    'This preview expired or was already used. Preview again.',
  'telegram.greeting.error.account-changed':
    'The account changed. Review a new preview.',
  'telegram.greeting.error.target-changed':
    'The target changed since preview. Review it again.',
  'telegram.greeting.error.bot-required':
    'Choose an available Telegram bot for /start.',
  'telegram.greeting.error.target-unavailable': 'This target is unavailable.',
  'telegram.greeting.error.sticker-unavailable':
    'This greeting is unavailable in the account cache. Refresh or choose another sticker.',
  'telegram.greeting.error.user-account-required':
    'Connect a Telegram user account before continuing.',
  'telegram.greeting.error.already-greeted':
    'This chat was greeted within the last 24 hours.',
  'telegram.greeting.error.previous-outcome-unknown':
    'An earlier send is unresolved. Check the chat and resolve it in Outbox.',
  'telegram.greeting.error.unavailable':
    'Could not complete the request. Your target and sticker selection were retained.',
  'telegram.catalog.title': 'Telegram greeting stickers',
  'telegram.catalog.note':
    'Discover greeting stickers for your connected account. Refresh reads featured, mask, recent and favourite stickers. It sends no messages.',
  'telegram.catalog.userRequired':
    'Connect a Telegram user account to a server that supports greeting sticker discovery.',
  'telegram.catalog.refresh': 'Refresh sticker cache',
  'telegram.catalog.reload': 'Check connection and cache',
  'telegram.catalog.maxSets': 'Maximum sticker sets',
  'telegram.catalog.maxDocuments': 'Maximum stickers',
  'telegram.catalog.busy': 'Reading Telegram sticker data…',
  'telegram.catalog.count':
    '{greetings} greeting stickers in {total} cached stickers.',
  'telegram.catalog.updated': 'Cache updated: {at}',
  'telegram.catalog.stale':
    'Cache is older than ten minutes. Last updated: {at}',
  'telegram.catalog.empty':
    'No cache yet. Refresh to discover greeting stickers.',
  'telegram.catalog.greetingsOnly':
    'Show hi, hello and waving-hand stickers only',
  'telegram.catalog.previous': 'Previous stickers',
  'telegram.catalog.next': 'Next stickers',
  'telegram.catalog.select': 'Choose sticker',
  'telegram.catalog.selected': 'Selected',
  'telegram.catalog.cancel': 'Stop refresh',
  'telegram.catalog.complete': 'Complete',
  'telegram.catalog.unavailable': 'Unavailable',
  'telegram.catalog.partial': 'Incomplete',
  'telegram.catalog.source.featured': 'Featured sets',
  'telegram.catalog.source.masks': 'Mask sets',
  'telegram.catalog.source.recent': 'Recent stickers',
  'telegram.catalog.source.faved': 'Favourite stickers',
  'telegram.catalog.source.set': 'Sticker set',
  'telegram.catalog.state.running':
    'Refreshing… Cached stickers remain available.',
  'telegram.catalog.state.cancelling': 'Stopping after the current request…',
  'telegram.catalog.state.cancelled':
    'Refresh stopped. The previous cache was retained.',
  'telegram.catalog.state.done': 'Refresh complete.',
  'telegram.catalog.state.partial':
    'Refresh incomplete. Usable stickers were kept; review source coverage.',
  'telegram.catalog.state.failed':
    'Refresh failed. The previous cache was retained.',
  'telegram.catalog.error.busy': 'Another sticker refresh is running.',
  'telegram.catalog.error.bad-request': 'Check the sticker and set limits.',
  'telegram.catalog.error.user-account-required':
    'Connect a Telegram user account before continuing.',
  'telegram.catalog.error.stopped':
    'Reconnect to the server before refreshing.',
  'telegram.catalog.error.read-failed':
    'Could not read the sticker cache. Check the connection and try again.',
  'telegram.catalog.error.offline':
    'The server is unavailable. Check the connection to recover the cache.',
};
