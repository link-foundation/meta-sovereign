import { navigateApp, chatHash } from './app-route.js';

export const feedbackEmoji = (emoji) =>
  emoji?.startsWith('custom:') ? '✨' : emoji;

export const openFeedbackMessage = (message) =>
  navigateApp({
    view: 'chat',
    anchor: `#/chat?${new URLSearchParams({ chat: `${message.source}:${message.chat}`, message: message.id })}`,
  });

export const feedbackDirectTarget = (source, actor) => {
  if (actor.kind !== 'user' || actor.deletedAccount || !actor.id) {
    return null;
  }
  if (['telegram', 'vk'].includes(source) && /^\d+$/.test(actor.id)) {
    return { source, chat: actor.id };
  }
  if (actor.chat) {
    return { source, chat: actor.chat };
  }
  return null;
};
export const openFeedbackPerson = (source, actor) => {
  const target = feedbackDirectTarget(source, actor);
  if (target) {
    navigateApp({ view: 'chat', anchor: chatHash(target) });
  }
};
