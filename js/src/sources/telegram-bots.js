/**
 * A bot's buttons under its message, as Telegram's apps press them
 * (R-Y110): a callback button asks the bot through
 * messages.getBotCallbackAnswer, and the bot answers with words to show
 * (a toast, or a box when it is an alert), a link to open, or nothing —
 * what it changes in the chat (most often the message itself, edited)
 * comes as an update like any other.
 *
 * A button's data is bytes; the app and the store name it in base64
 * (R-Y28).
 */

// A bot that did not answer in time still got the press.
const QUIET = new Set(['BOT_RESPONSE_TIMEOUT']);

// Telegram's refusals the app can name.
const REFUSED = {
  DATA_INVALID: 'data-invalid',
  MESSAGE_ID_INVALID: 'message-gone',
  PEER_ID_INVALID: 'chat-gone',
};

const reasonOf = (error) => String(error?.errorMessage ?? error?.message ?? '');

/** The answer as the app shows it. */
export const answerOf = (answer) => ({
  ok: true,
  message: answer?.message ? String(answer.message) : null,
  alert: Boolean(answer?.alert),
  url: answer?.url ? String(answer.url) : null,
});

/** The bot actions over the user's client. */
export const createBotActions = (env, { userClient }) => {
  const botCallback = async ({ chat, id, data = null, game = false }) => {
    const msgId = Number(id);
    const client = chat && msgId > 0 ? await userClient() : null;
    if (!client) {
      return { ok: false, supported: false };
    }
    const { Api } = await env.importer();
    try {
      const answer = await env.connection.withPeer(
        client,
        String(chat),
        (peer) =>
          env.queue.run(`bot:${chat}:${msgId}:${data ?? ''}`, 'view', () =>
            client.invoke(
              new Api.messages.GetBotCallbackAnswer({
                peer,
                msgId,
                ...(data ? { data: Buffer.from(data, 'base64') } : {}),
                ...(game ? { game: true } : {}),
              })
            )
          )
      );
      return answerOf(answer);
    } catch (error) {
      const reason = reasonOf(error);
      if (QUIET.has(reason)) {
        return { ok: true, message: null, alert: false, url: null };
      }
      if (REFUSED[reason]) {
        return { ok: false, code: REFUSED[reason] };
      }
      throw error;
    }
  };
  return { botCallback };
};
