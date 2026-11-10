import {
  followEntity,
  followFailure,
  followKind,
  followPeerChat,
  followText,
} from './telegram-follow-shape.js';

const membership = async (c, entity, peer) => {
  if (followKind(entity) === 'Chat') {
    return !entity.left;
  }
  try {
    const answer = await c.invoke(
      new c.Api.channels.GetParticipant({
        channel: peer,
        participant: new c.Api.InputPeerSelf(),
      })
    );
    const kind = followKind(answer?.participant);
    if (
      [
        'ChannelParticipant',
        'ChannelParticipantSelf',
        'ChannelParticipantCreator',
        'ChannelParticipantAdmin',
      ].includes(kind)
    ) {
      return true;
    }
    if (kind === 'ChannelParticipantLeft') {
      return false;
    }
    if (
      kind === 'ChannelParticipantBanned' &&
      answer.participant.bannedRights
    ) {
      return (
        !answer.participant.left &&
        !answer.participant.bannedRights.viewMessages
      );
    }
    throw followFailure('membership-unavailable');
  } catch (error) {
    if (error.errorMessage === 'USER_NOT_PARTICIPANT') {
      return false;
    }
    throw error;
  }
};
const preferences = async (c, peer, chat, now) => {
  const answer = await c.invoke(
    new c.Api.messages.GetPeerDialogs({
      peers: [new c.Api.InputDialogPeer({ peer })],
    })
  );
  const dialog = answer?.dialogs?.find((d) => followPeerChat(d.peer) === chat);
  if (
    !dialog ||
    !dialog.notifySettings ||
    !Number.isInteger(dialog.folderId ?? 0)
  ) {
    throw followFailure('preferences-unavailable');
  }
  const until = dialog.notifySettings.muteUntil ?? 0;
  if (!Number.isInteger(until) || until < 0) {
    throw followFailure('preferences-unavailable');
  }
  return {
    muted: until > Math.floor(now() / 1000),
    archived: dialog.folderId === 1,
  };
};
const fromEntity = async (c, selector, now) => {
  const requested =
    selector.kind === 'private-message'
      ? `-100${selector.channel}`
      : selector.chat;
  const entity = await c.entity(selector);
  const target = followEntity(entity);
  if (requested && target.chat !== requested) {
    throw followFailure('target-changed');
  }
  const peer = c.peerFrom(entity);
  if (followPeerChat(peer) !== target.chat) {
    throw followFailure('target-changed');
  }
  const member = await membership(c, entity, peer);
  const state = member
    ? await preferences(c, peer, target.chat, now)
    : { muted: null, archived: null };
  return { target: { ...target, member, ...state }, peer };
};
const fromInvite = async (c, selector, now) => {
  const answer = await c.invoke(
    new c.Api.messages.CheckChatInvite({ hash: selector.invite })
  );
  const kind = followKind(answer);
  if (kind === 'ChatInviteAlready') {
    const target = followEntity(answer.chat);
    const peer = c.peerFrom(answer.chat);
    if (followPeerChat(peer) !== target.chat) {
      throw followFailure('target-changed');
    }
    return {
      target: {
        ...target,
        member: true,
        ...(await preferences(c, peer, target.chat, now)),
      },
      peer,
    };
  }
  if (kind === 'ChatInvitePeek') {
    const target = followEntity(answer.chat);
    return {
      target: {
        ...target,
        member: false,
        muted: null,
        archived: null,
        requestNeeded: answer.chat.joinRequest === true,
      },
      peer: null,
    };
  }
  if (kind !== 'ChatInvite' || typeof answer.title !== 'string') {
    throw followFailure('target-unavailable');
  }
  return {
    target: {
      chat: null,
      kind: answer.channel ? 'Channel' : 'Chat',
      title: answer.title.slice(0, 256),
      username: '',
      broadcast: answer.broadcast === true,
      megagroup: answer.megagroup === true,
      members:
        Number.isSafeInteger(answer.participantsCount) &&
        answer.participantsCount >= 0
          ? answer.participantsCount
          : null,
      member: false,
      muted: null,
      archived: null,
      requestNeeded: answer.requestNeeded === true,
    },
    peer: null,
  };
};
export const resolveFollowTarget = async (c, selector, now = Date.now) => {
  const result =
    selector.kind === 'invite'
      ? await fromInvite(c, selector, now)
      : await fromEntity(c, selector, now);
  // A private message URL supplies no invitation or access hash.
  const joinable =
    selector.kind === 'invite' ||
    (result.target.kind === 'Channel' &&
      selector.kind !== 'private-message' &&
      Boolean(result.target.username));
  return { ...result, joinable };
};

export const followTargetKey = (selector, target) =>
  target.chat ?? `invite:${followText(selector.invite)}`;
