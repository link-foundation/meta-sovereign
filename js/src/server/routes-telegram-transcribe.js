// Transcribing voice and video notes (R-Y175): the routes of the POSTS
// table in routes-telegram.js, each validated strictly before the account
// is asked. The final text of a pending transcription arrives as the
// `transcript:telegram:<chat>:<id>` link (updateTranscribedAudio).
//
// Its routes:
//   POST /api/telegram/transcribe {chat, id} -> { ok, transcriptionId,
//                       text, pending, trialRemains?, trialUntil? }
//                       messages.transcribeAudio on that message; code
//                       premium | transcription-failed | not-found |
//                       no-access | flood when Telegram refuses
//   POST /api/telegram/transcribe-rate {chat, id, transcriptionId, good}
//                       -> { ok } messages.rateTranscribedAudio

const CHAT = /^-?\d{1,20}$/;
const NUMBER = /^\d{1,20}$/;

const validAsk = (body) =>
  CHAT.test(String(body.chat ?? '')) &&
  Number.isInteger(body.id) &&
  body.id > 0;

const bad = [400, { error: 'chat and id required', code: 'bad-request' }];

export const TRANSCRIBE_POSTS = {
  transcribe: async (account, body) =>
    validAsk(body) && typeof account.transcribeAudio === 'function'
      ? [200, await account.transcribeAudio({ chat: body.chat, id: body.id })]
      : bad,
  'transcribe-rate': async (account, body) =>
    validAsk(body) &&
    NUMBER.test(String(body.transcriptionId ?? '')) &&
    typeof body.good === 'boolean' &&
    typeof account.rateTranscription === 'function'
      ? [
          200,
          await account.rateTranscription({
            chat: body.chat,
            id: body.id,
            transcriptionId: String(body.transcriptionId),
            good: body.good,
          }),
        ]
      : bad,
};
