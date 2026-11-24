import { isAmbiguous } from '../automation/outbox.js';
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { confirmationDigest } from './confirmations.js';

const SEND_MEMORY_MS = 10 * 60_000;
const confirmedAction = 'message.send';
const inFlight = new WeakMap();

const failure = (code, message) => Object.assign(new Error(message), { code });
const conflict = () =>
  failure('send-id-conflict', 'This send ID belongs to another draft.');
const unknown = () =>
  failure(
    'send-unknown',
    'Check the HeadHunter conversation before sending again.'
  );

// The text log is authoritative and flushing it avoids a full binary snapshot.
const flushLog = (store) =>
  store.flushLog ? store.flushLog() : store.flush?.();
const saveReceipt = (store, receipt) =>
  saveAcknowledgedRecord(store, receipt, () => flushLog(store));

const replayHhSend = async (store, draft, receipt) => {
  if (receipt.state !== 'sent' || !Array.isArray(receipt.linkIds)) {
    throw unknown();
  }
  const current = await Promise.all(
    receipt.linkIds.map((id) => store.get(id).catch(() => null))
  );
  const links = current.filter(
    (link) => link?.source === 'hh' && link.chat === draft.chat && !link.deleted
  );
  return {
    status: 'sent',
    via: receipt.via,
    link: links.at(-1) ?? null,
    links,
    ...(receipt.stored === false || links.length < current.length
      ? { stored: false }
      : {}),
    ...(receipt.scheduled ? { scheduled: true } : {}),
  };
};

const issueHhSend = async (store, log, draft, id, fingerprint, send) => {
  const existing = await store.get(id);
  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      throw conflict();
    }
    return replayHhSend(store, draft, existing);
  }
  const receipt = {
    id,
    tokens: ['chat-send', 'hh'],
    version: 1,
    fingerprint,
    state: 'sending',
  };
  await saveReceipt(store, receipt).catch(() => {
    throw failure(
      'outbox-unavailable',
      'Could not save the HeadHunter send reservation.'
    );
  });
  let result;
  try {
    result = await send();
  } catch (error) {
    if (error?.safeToRetry !== true && isAmbiguous(error)) {
      throw unknown();
    }
    await store
      .delete(id)
      .then(() => flushLog(store))
      .catch(() => {
        log?.({ level: 'warn', event: 'hh_send_reservation_release_failed' });
      });
    throw error;
  }
  await saveReceipt(store, {
    ...receipt,
    state: 'sent',
    via: result.via,
    linkIds: result.links.map((link) => link.id),
    ...(result.stored === false ? { stored: false } : {}),
    ...(result.scheduled ? { scheduled: true } : {}),
  }).catch(() => {
    log?.({ level: 'warn', event: 'hh_send_receipt_write_failed' });
  });
  return result;
};

const hhSendOnce = (store, ctx, draft, key, fingerprint, send) => {
  const id = `chat-send:${confirmationDigest(confirmedAction, key)}`;
  let active = inFlight.get(store);
  if (!active) {
    active = new Map();
    inFlight.set(store, active);
  }
  const known = active.get(id);
  if (known) {
    if (known.fingerprint !== fingerprint) {
      throw conflict();
    }
    return known.promise;
  }
  const promise = issueHhSend(
    store,
    ctx.log,
    draft,
    id,
    fingerprint,
    send
  ).finally(() => active.delete(id));
  active.set(id, { fingerprint, promise });
  return promise;
};

const memorySendOnce = (ctx, key, fingerprint, send) => {
  const sends = (ctx.sends ??= new Map());
  const now = Date.now();
  for (const [id, entry] of sends) {
    if (now - entry.at > SEND_MEMORY_MS) {
      sends.delete(id);
    }
  }
  const known = sends.get(key);
  if (known) {
    if (known.fingerprint !== fingerprint) {
      throw conflict();
    }
    return known.promise;
  }
  const promise = send().catch((error) => {
    if (sends.get(key)?.promise === promise) {
      sends.delete(key);
    }
    throw error;
  });
  sends.set(key, { at: now, fingerprint, promise });
  return promise;
};

export const sendMessageOnce = (store, ctx, draft, send) => {
  if (!draft.clientId) {
    return send();
  }
  const key = JSON.stringify([draft.source, draft.chat, draft.clientId]);
  const fingerprint = confirmationDigest(confirmedAction, draft);
  return draft.source === 'hh'
    ? hhSendOnce(store, ctx, draft, key, fingerprint, send)
    : memorySendOnce(ctx, key, fingerprint, send);
};
