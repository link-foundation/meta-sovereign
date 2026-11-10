export const enFollow = {
  'follow.title': 'Follow: discover Telegram links',
  'follow.hint':
    'Extract links from cached incoming messages across providers. Each reference keeps its source message. Link recognition does not verify access or join a chat. Uses the connected server’s cache, or this browser’s store when no server is configured.',
  'follow.scope': 'Cached message scope',
  'follow.source': 'Provider (blank: all)',
  'follow.chat': 'Chat ID (blank: all)',
  'follow.self': 'Your account identifiers, separated by commas',
  'follow.limit': 'Incoming message limit (0: whole cached archive)',
  'follow.filterHint':
    'Outgoing messages are excluded. Supply your account IDs when imported messages have no outgoing marker. The cache may include private invite links; keep it private.',
  'follow.load': 'Load cached references',
  'follow.extract': 'Extract incoming links',
  'follow.clear': 'Clear filtered cache',
  'follow.clearAsk':
    'Remove cached link references matching these filters? Source messages will be kept.',
  'follow.confirmClear': 'Clear these references',
  'follow.cancel': 'Cancel',
  'follow.working': 'Working…',
  'follow.extracted':
    'Scanned {scanned} of {messages} matching incoming messages. Found {found} references; added {added}.',
  'follow.limited':
    'Partial extraction: the message limit was reached or fields in {count} messages exceeded extraction limits. Existing references are kept.',
  'follow.cleared': 'Removed {count} cached references.',
  'follow.failed':
    'The cache operation could not be confirmed. Load the cache to check its state before retrying.',
  'follow.total': '{count} cached message references',
  'follow.kind.public': 'Public username candidate',
  'follow.kind.invite': 'Private invite candidate',
  'follow.kind.message': 'Public message link',
  'follow.kind.private-message':
    'Private message link; requires existing access',
  'follow.provenance': '{source} · chat {chat} · sender {sender}',
  'follow.previous': 'Previous references',
  'follow.next': 'Next references',
};
