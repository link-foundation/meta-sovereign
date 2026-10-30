const FIELDS = [
  'id',
  'source',
  'chat',
  'sender',
  'body',
  'timestamp',
  'replyTo',
  'chatType',
  'forwardedFrom',
  'service',
  'deleted',
  'outgoing',
  'senderName',
  'bot',
];
export const conversationMessage = (record) =>
  Object.fromEntries(
    FIELDS.filter((field) => record[field] !== undefined).map((field) => [
      field,
      field === 'sender' && record.outgoing ? 'me' : record[field],
    ])
  );
