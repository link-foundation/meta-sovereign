/**
 * A bot's commands, as Telegram Desktop lists them (R-Y135; learned,
 * never copied): `botCommands({ chat })` for a bot chat
 * (users.getFullUser → botInfo) or a group (messages.getFullChat /
 * channels.getFullChannel → botInfo[], one per bot) →
 * `{ ok, commands: [{ command, description, bot, botName, username }],
 * menu: { kind: 'commands'|'webapp'|'default', text?, url? } }`.
 * `menu` is the bot's menu button of a bot chat. Answers are kept for
 * ten minutes, per chat.
 */

import { runIn, connected, failureOf } from './telegram-stickers.js';

const CODES = {
  CHANNEL_PRIVATE: 'no-access',
  CHAT_ID_INVALID: 'no-access',
  PEER_ID_INVALID: 'no-access',
  USER_ID_INVALID: 'no-access',
};

const failure = failureOf(CODES);

const CHAT = /^-?\d{1,20}$/;
const KEEP_MS = 10 * 60_000;
const textOf = (value) => String(value?.value ?? value);

const nameOf = (user) =>
  [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
  user?.username ||
  '';

const menuOf = (button) => {
  if (button?.className === 'BotMenuButton' && button.url) {
    return { kind: 'webapp', text: button.text || '', url: button.url };
  }
  return {
    kind:
      button?.className === 'BotMenuButtonCommands' ? 'commands' : 'default',
  };
};

// One bot's commands, named by the users Telegram sent along.
const commandsOf = (info, users) => {
  const bot = textOf(info?.userId ?? '');
  const user = users.get(bot);
  return (info?.commands ?? []).map((one) => ({
    command: String(one.command),
    description: String(one.description ?? ''),
    bot,
    botName: nameOf(user),
    username: user?.username ?? null,
  }));
};

const shape = (answer, infos) => {
  const users = new Map((answer?.users ?? []).map((u) => [textOf(u.id), u]));
  return infos.filter(Boolean).flatMap((info) => commandsOf(info, users));
};

// A group's bots: one botInfo each.
const askGroup = async (c, env, chat) => {
  const channel = chat.startsWith('-100');
  const answer = await runIn(env, `bot-commands:${chat}`, () =>
    env.connection.withPeer(c.client, chat, (peer) =>
      c.client.invoke(
        channel
          ? new c.Api.channels.GetFullChannel({ channel: peer })
          : new c.Api.messages.GetFullChat({
              chatId: c.helpers.returnBigInt(chat.slice(1)),
            })
      )
    )
  );
  return {
    ok: true,
    commands: shape(answer, answer?.fullChat?.botInfo ?? []),
    menu: { kind: 'default' },
  };
};

// A bot chat: the bot's own botInfo and menu button.
const askBot = async (c, env, chat) => {
  const answer = await runIn(env, `bot-commands:${chat}`, () =>
    env.connection.withPeer(c.client, chat, (id) =>
      c.client.invoke(new c.Api.users.GetFullUser({ id }))
    )
  );
  const info = answer?.fullUser?.botInfo;
  return {
    ok: true,
    commands: shape(answer, info ? [{ ...info, userId: chat }] : []),
    menu: menuOf(info?.menuButton),
  };
};

export const createBotCommands = (env, context) => {
  const kept = new Map();
  return {
    botCommands: async ({ chat } = {}) => {
      const target = String(chat ?? '');
      if (!CHAT.test(target)) {
        return { ok: false, error: 'bad chat', code: 'failed' };
      }
      const hit = kept.get(target);
      if (hit && Date.now() - hit.at < KEEP_MS) {
        return hit.answer;
      }
      const answer = await connected(env, context.userClient, failure, (c) =>
        target.startsWith('-')
          ? askGroup(c, env, target)
          : askBot(c, env, target)
      );
      if (answer.ok) {
        kept.set(target, { at: Date.now(), answer });
      }
      return answer;
    },
  };
};
