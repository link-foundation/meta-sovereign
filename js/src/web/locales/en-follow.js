export const enFollow = {
  'followChats.title': 'Follow: discover VK groups',
  'followChats.hint':
    'Read groups from VK through the connected server. Pages include other conversation types, so an empty filtered page can have a next page. Telegram hints match Telegram words in titles or recognized links in the latest message; older history is not searched here. Provider permissions still apply.',
  'followChats.scope': 'VK group discovery',
  'followChats.limit': 'Conversations per provider page',
  'followChats.telegramOnly': 'Only groups with Telegram hints',
  'followChats.load': 'Load group chats',
  'followChats.details': 'Show members and recent messages',
  'followChats.page':
    'Provider offset {offset} · {scanned} records returned · total {total}',
  'followChats.empty': 'No matching groups on this page.',
  'followChats.previous': 'Previous conversations',
  'followChats.next': 'Next conversations',
  'followChats.previousMembers': 'Previous members',
  'followChats.nextMembers': 'Next members',
  'followChats.partial':
    'VK stopped returning records before the reported total. Coverage remains incomplete.',
  'followChats.members': 'Group members',
  'followChats.messages': 'Latest messages (bounded preview)',
  'followChats.messageIdentity': 'Message {id} · sender {sender}',
  'followChats.memberCount': '{count} members',
  'followChats.owner': 'Owner',
  'followChats.admin': 'Administrator',
  'followChats.untitled': 'Untitled group',
  'followChats.unknown': 'Unknown',
  'followChats.not-connected':
    'Connect VK on this server to load groups. Saved results are kept.',
  'followChats.follow-server-required':
    'Connect a server with VK to discover groups.',
  'followChats.unsupported':
    'This provider does not support live group discovery here.',
  'followChats.captcha':
    'VK requires a captcha. Resolve it in Connections before loading again.',
  'followChats.rate-limited':
    'VK is limiting requests. Saved results are kept; wait before loading again.',
  'followChats.failed':
    'Group discovery could not be confirmed. Saved results are kept. Check the connection and provider permissions before loading again.',
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
