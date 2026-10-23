// The lines of the service messages layer 232 added (R-Y220): a chat put
// into or taken out of a community, a join through one, a Gram transfer,
// a wallet's connection request, an unlocked paid message. Kept apart from
// message-parts.js; `{ key, params }` like giveaway-model.js's.

const num = (value) => Number(value?.value ?? value) || 0;

const walletState = (action) => {
  if (action.accepted) {
    return 'Accepted';
  }
  return action.declined ? 'Declined' : '';
};

const WORDS = {
  MessageActionChangeCommunity: (action) => ({
    key: action.communityId
      ? 'chat.service.communityIn'
      : 'chat.service.communityOut',
    params: {},
  }),
  MessageActionChatJoinedViaCommunity: () => ({
    key: 'chat.service.communityJoined',
    params: {},
  }),
  MessageActionGramTransfer: (action) => ({
    key: action.comment
      ? 'chat.service.gramTransferNote'
      : 'chat.service.gramTransfer',
    params: { amount: num(action.amount), note: action.comment ?? '' },
  }),
  MessageActionWalletTonConnectRequest: (action) => ({
    key: `chat.service.walletConnect${walletState(action)}`,
    params: { app: action.dappName || '' },
  }),
  MessageActionNoPaidMessagesTokenUsed: () => ({
    key: 'chat.service.noPaidToken',
    params: {},
  }),
};

/** `{ key, params }` of the line about one of these actions, or null. */
export const richServiceWords = (service, action = {}) =>
  WORDS[service]?.(action) ?? null;
