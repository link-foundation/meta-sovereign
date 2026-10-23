/**
 * What Telegram Desktop offers on a person or a chat besides talking
 * (R-Y128; learned, never copied):
 * - `peerBlock({ chat, block })` — "Block user" / "Unblock user"
 *   (contacts.block, contacts.unblock);
 * - `peerContact({ chat, add, firstName, lastName, share })` — "Add to
 *   contacts" with the name typed (contacts.addContact; `share` lets them
 *   see our phone number) / "Delete contact" (contacts.deleteContacts);
 * - `peerReport({ chat, option, message, ids })` — "Report" as layer 225
 *   has it (messages.report on the whole chat, or — with `ids`, up to a
 *   hundred message ids of the chat, R-Y175 — on those messages): the first
 *   call, with no option, answers `{ result: 'choose', title, options:
 *   [{ text, option }] }`; a call with a chosen `option` (base64 of its
 *   bytes) answers `choose` again (a narrower list), `comment` (Telegram
 *   asks for words: `optional`, `option`) or `reported`; the comment comes
 *   back in `message`;
 * - `peerReportSpam({ chat })` — "Report spam" on a stranger's chat
 *   (messages.reportSpam).
 * The bar over a chat with a stranger (R-Y137):
 * - `peerSettings({ chat })` — what Telegram offers there
 *   (messages.getPeerSettings) → `{ ok, bar: { reportSpam, addContact,
 *   blockContact, shareContact, autoarchived, registered, country } }`;
 * - `peerHideBar({ chat })` — the bar's × (messages.hidePeerSettingsBar);
 * - `peerShareContact({ chat })` — "Share my phone number"
 *   (contacts.acceptContact).
 * Telegram's errors become codes the page shows as text.
 */

import { runIn, connected, failureOf } from './telegram-stickers.js';

const CODES = {
  USER_ID_INVALID: 'no-user',
  CONTACT_ID_INVALID: 'no-user',
  PEER_ID_INVALID: 'no-access',
  CHANNEL_PRIVATE: 'no-access',
  CHAT_ID_INVALID: 'no-access',
  CONTACT_NAME_EMPTY: 'name-empty',
  OPTION_INVALID: 'bad-option',
  MESSAGE_TOO_LONG: 'too-long',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);

const USER = /^\d{1,20}$/;
const CHAT = /^-?\d{1,20}$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

const bytesOf = (value) => Buffer.from(String(value ?? ''), 'base64');
const base64Of = (bytes) => Buffer.from(bytes ?? []).toString('base64');

// A person as an input user, from the peer the chat resolves to.
export const inputUserOf = async (c, peer) => {
  const known =
    typeof peer === 'string'
      ? await c.client.getInputEntity(c.helpers.returnBigInt(peer))
      : peer;
  return new c.Api.InputUser({
    userId: known.userId,
    accessHash: known.accessHash ?? c.zero,
  });
};

// Telegram's ReportResult as the page reads it.
const shapeReport = (result) => {
  switch (result?.className) {
    case 'ReportResultChooseOption':
      return {
        ok: true,
        result: 'choose',
        title: result.title ?? '',
        options: (result.options ?? []).map((o) => ({
          text: o.text,
          option: base64Of(o.option),
        })),
      };
    case 'ReportResultAddComment':
      return {
        ok: true,
        result: 'comment',
        optional: Boolean(result.optional),
        option: base64Of(result.option),
      };
    default:
      return { ok: true, result: 'reported' };
  }
};

// Checks the request, connects, runs `use` on the peer through the queue,
// and maps Telegram's errors.
const doing = (env, userClient, valid, name, use) => async (request) => {
  const chat = String(request?.chat ?? '');
  if (!valid(chat, request ?? {})) {
    return { ok: false, error: 'bad request', code: 'failed' };
  }
  return connected(
    env,
    userClient,
    failure,
    async (c) =>
      await runIn(env, `${name}:${chat}`, () =>
        env.connection.withPeer(c.client, chat, (peer) => use(c, peer, request))
      )
  );
};

const block = async (c, peer, { block: on }) => {
  const Request = on ? c.Api.contacts.Block : c.Api.contacts.Unblock;
  await c.client.invoke(new Request({ id: peer }));
  return { ok: true, blocked: on };
};

const contact = async (c, peer, request) => {
  const id = await inputUserOf(c, peer);
  if (!request.add) {
    await c.client.invoke(new c.Api.contacts.DeleteContacts({ id: [id] }));
    return { ok: true, contact: false };
  }
  await c.client.invoke(
    new c.Api.contacts.AddContact({
      id,
      firstName: request.firstName.trim(),
      lastName: (request.lastName ?? '').trim(),
      phone: '',
      ...(request.share ? { addPhonePrivacyException: true } : {}),
    })
  );
  return { ok: true, contact: true };
};

const report = async (c, peer, request) =>
  shapeReport(
    await c.client.invoke(
      new c.Api.messages.Report({
        peer,
        id: request.ids ?? [],
        option: bytesOf(request.option),
        message: request.message ?? '',
      })
    )
  );

const reportSpam = async (c, peer) => {
  await c.client.invoke(new c.Api.messages.ReportSpam({ peer }));
  return { ok: true };
};

// Telegram's PeerSettings as the page reads it.
const barOf = (settings = {}) => ({
  reportSpam: Boolean(settings.reportSpam),
  addContact: Boolean(settings.addContact),
  blockContact: Boolean(settings.blockContact),
  shareContact: Boolean(settings.shareContact),
  autoarchived: Boolean(settings.autoarchived),
  registered: settings.registrationMonth ?? null,
  country: settings.phoneCountry ?? null,
});

const peerSettings = async (c, peer) => {
  const answer = await c.client.invoke(
    new c.Api.messages.GetPeerSettings({ peer })
  );
  return { ok: true, bar: barOf(answer?.settings) };
};

const hideBar = async (c, peer) => {
  await c.client.invoke(new c.Api.messages.HidePeerSettingsBar({ peer }));
  return { ok: true };
};

const shareContact = async (c, peer) => {
  const id = await inputUserOf(c, peer);
  await c.client.invoke(new c.Api.contacts.AcceptContact({ id }));
  return { ok: true };
};

const text = (value, max) => typeof value === 'string' && value.length <= max;

const validContact = (chat, r) =>
  USER.test(chat) &&
  (r.add !== true ||
    (text(r.firstName, 64) &&
      r.firstName.trim() !== '' &&
      (r.lastName === undefined || text(r.lastName, 64))));

const validIds = (ids) =>
  ids === undefined ||
  (Array.isArray(ids) &&
    ids.length > 0 &&
    ids.length <= 100 &&
    ids.every((id) => Number.isInteger(id) && id > 0));

const validReport = (chat, r) =>
  CHAT.test(chat) &&
  validIds(r.ids) &&
  (r.option === undefined || (text(r.option, 2048) && BASE64.test(r.option))) &&
  (r.message === undefined || text(r.message, 512));

const anyChat = (chat) => CHAT.test(chat);

export const createPeerActions = (env, { userClient }) => ({
  peerBlock: doing(
    env,
    userClient,
    (chat, r) => USER.test(chat) && typeof r.block === 'boolean',
    'peer-block',
    block
  ),
  peerContact: doing(env, userClient, validContact, 'peer-contact', contact),
  peerReport: doing(env, userClient, validReport, 'peer-report', report),
  peerReportSpam: doing(
    env,
    userClient,
    anyChat,
    'peer-report-spam',
    reportSpam
  ),
  peerSettings: doing(env, userClient, anyChat, 'peer-settings', peerSettings),
  peerHideBar: doing(env, userClient, anyChat, 'peer-hide-bar', hideBar),
  peerShareContact: doing(
    env,
    userClient,
    (chat) => USER.test(chat),
    'peer-share-contact',
    shareContact
  ),
});
