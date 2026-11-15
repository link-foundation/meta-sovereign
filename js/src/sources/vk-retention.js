import { positiveVkId } from '../automation/vk-friends-settings.js';
const incomplete = () => {
  throw new Error('Incomplete VK retention history or deletion receipt');
};
const message = (row, peer) => {
  if (
    !positiveVkId(row?.conversation_message_id) ||
    !Number.isSafeInteger(row.id) ||
    row.id < 0 ||
    row.peer_id !== peer
  ) {
    incomplete();
  }
  return {
    id: row.id,
    cmid: row.conversation_message_id,
    text: row.text ?? '',
    date: row.date,
    fromId: row.from_id,
    attachments: row.attachments ?? [],
  };
};
const validateHistory = (peer, options) => {
  if (
    !Number.isSafeInteger(peer) ||
    !peer ||
    Math.abs(peer) > 2147483647 ||
    !Number.isInteger(options.scanLimit) ||
    options.scanLimit < 1 ||
    options.scanLimit > 10000
  ) {
    incomplete();
  }
};
const validateStep = (step) => {
  if (
    !Number.isSafeInteger(step.peer) ||
    !step.peer ||
    Math.abs(step.peer) > 2147483647 ||
    !['conversation', 'messages'].includes(step.method) ||
    !Array.isArray(step.messages) ||
    !step.messages.length ||
    step.messages.length > (step.method === 'conversation' ? 10000 : 100) ||
    !step.messages.every((m) => positiveVkId(m.cmid)) ||
    new Set(step.messages.map((m) => m.cmid)).size !== step.messages.length
  ) {
    incomplete();
  }
};
const deletionReceipt = (step, response) => {
  if (step.method === 'conversation') {
    if (
      !Number.isSafeInteger(response?.last_deleted_id) ||
      response.last_deleted_id < Math.max(0, ...step.messages.map((m) => m.id))
    ) {
      incomplete();
    }
    return {
      confirmed: true,
      deleted: step.messages.map((m) => m.cmid),
      lastDeletedId: response.last_deleted_id,
    };
  }
  if (
    !Array.isArray(response) ||
    response.length !== step.messages.length ||
    new Set(response.map((row) => row.conversation_message_id)).size !==
      response.length ||
    !step.messages.every((m) =>
      response.some(
        (row) =>
          row.peer_id === step.peer &&
          row.conversation_message_id === m.cmid &&
          [0, 1].includes(row.response)
      )
    )
  ) {
    incomplete();
  }
  return {
    confirmed: true,
    deleted: response
      .filter((row) => row.response === 1)
      .map((row) => row.conversation_message_id),
  };
};
export const createVkRetention = ({ call, once }) => {
  const account = async (options) => {
    const self = await call('users.get', {}, options.token);
    if (
      !Array.isArray(self) ||
      self.length !== 1 ||
      !positiveVkId(self[0]?.id)
    ) {
      incomplete();
    }
    return { accountId: self[0].id };
  };
  const history = async (peer, options) => {
    validateHistory(peer, options);
    const messages = [];
    let total;
    do {
      const page = await call(
        'messages.getHistory',
        {
          peer_id: peer,
          count: Math.min(200, options.scanLimit - messages.length),
          offset: messages.length,
        },
        options.token
      );
      if (
        !Number.isSafeInteger(page?.count) ||
        page.count < 0 ||
        !Array.isArray(page.items) ||
        page.items.length > 200 ||
        (total !== undefined && total !== page.count)
      ) {
        incomplete();
      }
      total = page.count;
      if (total > options.scanLimit) {
        return {
          ...(await account(options)),
          count: total,
          complete: false,
          messages: [],
        };
      }
      if (messages.length < total && !page.items.length) {
        incomplete();
      }
      messages.push(...page.items.map((row) => message(row, peer)));
      if (
        messages.length > total ||
        new Set(messages.map((m) => m.cmid)).size !== messages.length
      ) {
        incomplete();
      }
    } while (messages.length < total);
    return {
      ...(await account(options)),
      count: total,
      complete: true,
      messages,
    };
  };
  const remove = async (step, options, beforeIssue) => {
    validateStep(step);
    const conversation = step.method === 'conversation';
    const response = await once(
      `messages.${conversation ? 'deleteConversation' : 'delete'}`,
      {
        peer_id: step.peer,
        ...(conversation
          ? {}
          : {
              cmids: step.messages.map((m) => m.cmid).join(','),
              delete_for_all: 0,
            }),
      },
      options.token,
      { write: true, retries: 0 },
      beforeIssue
    );
    return deletionReceipt(step, response);
  };
  return {
    retentionSnapshot: account,
    retentionState: history,
    deleteRetention: remove,
  };
};
