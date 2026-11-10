export const enFollowBacklink = {
  'followBacklink.title': 'Follow: post and monitor backlinks',
  'followBacklink.hint':
    'Review a Telegram or VK invite link before posting it to selected Telegram or VK groups. Monitoring continues on the connected server when you leave this page. Uncertain posts are kept for inspection and are never automatically sent again.',
  'followBacklink.chats':
    'Group IDs, separated by commas (Telegram: -7; VK: 2000000007)',
  'followBacklink.backlink': 'Your Telegram or VK invite link',
  'followBacklink.monitorMs': 'Monitoring duration (milliseconds)',
  'followBacklink.intervalMs': 'Check interval (milliseconds)',
  'followBacklink.delayMs': 'Delay between posts (milliseconds)',
  'followBacklink.deleteIncoming':
    'Delete incoming messages for me after verified survival',
  'followBacklink.historyLimit':
    'Recent messages to inspect for cleanup (1–200)',
  'followBacklink.attempts': 'Timeout attempts per read (1–10)',
  'followBacklink.retryDelayMs': 'Initial retry delay (milliseconds)',
  'followBacklink.retryMaxDelayMs': 'Maximum retry delay (milliseconds)',
  'followBacklink.preview': 'Review posts',
  'followBacklink.apply': 'Confirm these posts and cleanup settings',
  'followBacklink.list': 'Load saved runs',
  'followBacklink.status': 'Refresh result',
  'followBacklink.resume': 'Resume remaining safe steps',
  'followBacklink.cancel': 'Stop remaining steps',
  'followBacklink.working': 'Working…',
  'followBacklink.review': 'Review the exact account, groups and settings',
  'followBacklink.owner': '{source} account {owner}',
  'followBacklink.window':
    'Monitor for {duration} ms; check every {interval} ms.',
  'followBacklink.cleanupHint':
    'After survival is confirmed, inspect up to {limit} recent messages and delete incoming messages for this account only. Outgoing and service messages are kept. Telegram supports this cleanup in basic groups only.',
  'followBacklink.message': 'Message {id}',
  'followBacklink.providerCode': 'VK error {code}',
  'followBacklink.cleanupResult':
    'Cleanup: {status}; {count} deletions confirmed.',
  'followBacklink.skipNotice':
    'A recent chat notice asks to wait for five other links. This removed post will not be retried automatically.',
  'followBacklink.history':
    '{count} saved runs. Inspect an existing run before posting again.',
  'followBacklink.next': 'Next saved runs',
  'followBacklink.queued': 'Queued',
  'followBacklink.running': 'Posting or monitoring',
  'followBacklink.paused': 'Paused; confirmed receipts are kept',
  'followBacklink.confirmed': 'Confirmed',
  'followBacklink.rejected': 'Post removed',
  'followBacklink.unknown': 'Outcome unknown; inspect before further action',
  'followBacklink.failed':
    'The operation failed. Saved receipts are kept; check the connection and provider permissions.',
  'followBacklink.ready': 'Ready for review',
  'followBacklink.sending': 'Send issued; awaiting confirmation',
  'followBacklink.monitoring': 'Delivery confirmed; monitoring survival',
  'followBacklink.survived': 'Still present after the monitoring window',
  'followBacklink.skipped': 'Skipped',
  'followBacklink.bad-request':
    'Check group IDs, invite link, numeric bounds and retry settings.',
  'followBacklink.not-connected':
    'Connect the selected provider’s user account on this server.',
  'followBacklink.account-changed':
    'The connected account changed. Existing receipts are kept.',
  'followBacklink.not-writable':
    'Posting is unavailable in one of the selected groups.',
  'followBacklink.provider-response':
    'The provider returned an unusable receipt. No success is assumed.',
  'followBacklink.timeout':
    'The read timed out after the configured attempts. You can resume safe remaining checks.',
  'followBacklink.rate-limited':
    'VK is limiting requests. Wait before resuming checks.',
  'followBacklink.captcha': 'VK requires a captcha. Resolve it in Connections.',
  'followBacklink.provider-refused':
    'The provider refused this operation. Review its error and permissions.',
  'followBacklink.outcome-unknown':
    'A write could not be confirmed. Inspect the saved run; it will not be automatically replayed.',
  'followBacklink.read-failed':
    'The check failed. Saved results are kept; refresh before further action.',
  'followBacklink.follow-server-required':
    'Connect a server with the selected provider’s user account to post and monitor links.',
  'followBacklink.busy':
    'Another backlink run is active on this server. Inspect it before starting another.',
  'followBacklink.plan-expired':
    'This review expired or was already used. Review the settings again.',
  'followBacklink.not-running':
    'This run is not active here. Refresh its saved result.',
  'followBacklink.unsupported':
    'This provider or connection cannot perform this workflow.',
  'followBacklink.cancelled':
    'Remaining steps stopped; issued writes retain their actual result.',
  'followBacklink.stopped': 'The server is closing; saved receipts are kept.',
  'followBacklink.not-found':
    'This saved run was not found on the connected server.',
  'followBacklink.confirmation-required':
    'Review and explicitly confirm the operation first.',
  'followBacklink.source': 'Account used to post',
  'followBacklink.providerError': 'Telegram error {error}',
  'followBacklink.user-account-required':
    'Connect a Telegram user account on this server; bot accounts cannot run this workflow.',
  'followBacklink.cleanup-unavailable':
    'Telegram offers local-only cleanup in basic groups. Disable cleanup for a channel or supergroup.',
  'followBacklink.flood-wait':
    'Telegram is limiting requests. Wait for the provider’s flood restriction before resuming.',
  'followBacklink.target-unavailable':
    'The group could not be resolved. Load it in Follow first and check its membership and permissions.',
  'followBacklink.autoFollow':
    'Automatically follow incoming links before posting',
  'followBacklink.maxRetries': 'Maximum retries for removed posts (0–10)',
  'followBacklink.maxLinks':
    'Maximum distinct links per chat and round (1–100)',
  'followBacklink.joinDelayMs':
    'Delay after following each link (milliseconds)',
  'followBacklink.followMute': 'Mute joined Telegram chats',
  'followBacklink.followArchive': 'Archive joined Telegram chats',
  'followBacklink.autoPolicy':
    'Follow with {source} account {owner}. Read up to {messages} recent messages and follow up to {links} distinct incoming links per chat in each round. Only removed posts may be repeated, up to {retries} times. Each retry scans fresh links within these limits.',
  'followBacklink.autoPreferences':
    'Joined Telegram chats: mute {mute}; archive {archive}.',
  'followBacklink.autoVkPreferences':
    'VK membership only. This workflow does not change VK notifications or archive settings.',
  'followBacklink.followLimited':
    'This scan reached a configured bound; older messages or additional links may remain.',
  'followBacklink.followingResult':
    'Following confirmed: {confirmed}/{total} links.',
  'followBacklink.previousAttempts': 'Prior removed posts ({count})',
  'followBacklink.round':
    'Posting round {round}; {previous} removed posts retained.',
  'followBacklink.inviteTarget':
    'Invitation target; ID available after joining',
  'followBacklink.fromMessage': 'Found in incoming message {id}',
  'followBacklink.enabled': 'on',
  'followBacklink.disabled': 'off',
  'followBacklink.follow-incomplete':
    'Following is not fully confirmed. Inspect each step before resuming; no backlink is posted for this chat yet.',
  'followBacklink.preferences-unavailable':
    'These membership preferences are unavailable for this provider.',
  'followBacklink.retry-limit':
    'The configured retry limit was reached. Removed posts remain visible and are not counted as successful.',
  'followBacklink.wait-notice':
    'Remaining removed posts are excluded by a wait notice or the configured retry limit.',
  'followBacklink.pending': 'Waiting for membership approval',
};
