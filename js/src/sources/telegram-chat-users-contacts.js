import { guardedSend, batchStopReason } from '../automation/outbox.js';
import { runIn } from './telegram-stickers.js';
import { inputUserOf } from './telegram-peer-actions.js';
import { contactExclusion, userProfile } from './telegram-chat-users-shape.js';
import { contactReceipt } from './telegram-contact-receipt.js';

const nameOf = (user) => {
  const firstName = (
    user.firstName ||
    user.lastName ||
    user.username ||
    `User ${user.id}`
  )
    .trim()
    .slice(0, 64);
  return {
    firstName,
    lastName: user.firstName ? (user.lastName ?? '').trim().slice(0, 64) : '',
  };
};
const waitSeconds = (error) => {
  const code = String(error?.errorMessage ?? '');
  const match = /^FLOOD_(?:PREMIUM_)?WAIT_(\d+)$/.exec(code);
  return match ? Number(match[1]) : null;
};
const addContact = async (r, user, id) => {
  const invoke = async () => {
    if (r.cancelled()) {
      throw Object.assign(new Error('Cancelled'), {
        errorMessage: 'CANCELLED',
      });
    }
    try {
      const answer = await r.c.client.invoke(
        new r.c.Api.contacts.AddContact({
          id,
          ...nameOf(user),
          phone: '',
          addPhonePrivacyException: r.plan.options.sharePhone,
        })
      );
      contactReceipt(answer);
      return { ok: true, contact: true, via: 'telegram' };
    } catch (error) {
      // Only an actual RPC refusal is definite. Every transport/missing-receipt
      // outcome remains unknown and blocks an automatic repeat.
      if (!error.errorMessage) {
        error.ambiguous = true;
      }
      error.message =
        error.errorMessage?.match(/^[A-Z_0-9]{1,80}$/)?.[0] ??
        'Contact response unavailable';
      throw error;
    }
  };
  try {
    return await invoke();
  } catch (error) {
    const seconds = waitSeconds(error);
    if (!seconds || seconds > 3600) {
      if (seconds) {
        error.code = 'flood';
        error.retryAfter = seconds;
      }
      throw error;
    }
    r.job.retryAfter = seconds;
    await r.publish();
    await r.wait((seconds + 1) * 1000);
    r.job.retryAfter = null;
    if (r.cancelled()) {
      throw Object.assign(new Error('Cancelled before retry'), {
        errorMessage: 'CANCELLED',
      });
    }
    try {
      return await invoke();
    } catch (retryError) {
      if (waitSeconds(retryError)) {
        retryError.code = 'flood';
        retryError.retryAfter = waitSeconds(retryError);
      }
      throw retryError;
    }
  }
};

const attempt = async (r, user) => {
  const current = await runIn(
    r.env,
    `chat-users:recheck:${r.job.id}:${user.id}`,
    () => r.c.client.getEntity(r.c.helpers.returnBigInt(user.id))
  );
  const profile = userProfile(current);
  const skipped = contactExclusion(profile, {
    meId: r.plan.meId,
    ...r.plan.options,
  });
  if (skipped) {
    return { status: 'skipped', reason: skipped };
  }
  const ledgerId = `telegram-contact-intent:${r.plan.meId}:${user.id}`;
  const previous = await r.env.store.get(ledgerId);
  const outbox = previous?.outbox
    ? await r.env.store.get(previous.outbox)
    : null;
  if (previous && (!outbox || ['sending', 'unknown'].includes(outbox.status))) {
    return { status: 'unknown', code: 'previous-outcome-unknown', outbox };
  }
  const id = await runIn(r.env, `chat-users:input:${user.id}`, async () =>
    inputUserOf(
      r.c,
      await r.c.client.getInputEntity(r.c.helpers.returnBigInt(user.id))
    )
  );
  if (r.cancelled()) {
    return { status: 'skipped', reason: 'cancelled' };
  }
  const key = `telegram-contact:${r.plan.meId}:${r.plan.id}:${user.id}`;
  await r.env.store.put({
    id: ledgerId,
    kind: 'telegram-contact-intent',
    source: 'telegram',
    outbox: `outbox:${key}`,
  });
  const outcome = await guardedSend({
    store: r.env.store,
    kind: 'telegram-contact',
    owner: 'telegram-contact',
    key,
    draft: { source: 'telegram', chat: user.id, text: 'Add Telegram contact' },
    userConfirmed: true,
    send: () =>
      runIn(r.env, `chat-users:add:${r.job.id}:${user.id}`, () =>
        addContact(r, profile, id)
      ),
  });
  if (!outcome.outbox) {
    await r.env.store.delete(ledgerId);
  }
  return outcome;
};

const recordOutcome = async (r, user, outcome, failures) => {
  const status = outcome.status === 'sent' ? 'added' : outcome.status;
  r.job.processed += 1;
  r.job.counts[status] = (r.job.counts[status] ?? 0) + 1;
  await r.env.store.put({
    id: `telegram-contact-result:${r.job.id}:${user.id}`,
    kind: 'telegram-contact-result',
    source: 'telegram',
    jobId: r.job.id,
    user: user.id,
    status,
    code: outcome.code ?? outcome.reason ?? null,
    outbox: outcome.outbox?.id ?? null,
    at: new Date().toISOString(),
  });
  return outcome.status === 'sent' || outcome.status === 'skipped'
    ? 0
    : failures + 1;
};

export const addChatContacts = async (r) => {
  const me = await runIn(r.env, 'chat-users:me', () => r.c.client.getMe());
  if (String(me.id?.value ?? me.id) !== r.plan.meId) {
    throw Object.assign(new Error('account-changed'), {
      code: 'account-changed',
    });
  }
  let failures = 0;
  for (const user of r.plan.users) {
    if (r.cancelled() || r.job.stopped) {
      break;
    }
    if (r.job.processed > 0) {
      await r.wait(r.plan.options.delayMs);
    }
    if (r.cancelled()) {
      break;
    }
    let outcome;
    try {
      outcome = await attempt(r, user);
    } catch (error) {
      outcome = {
        status: 'failed',
        code:
          error.errorMessage?.match(/^[A-Z_0-9]{1,80}$/)?.[0] ??
          'recheck-failed',
      };
    }
    failures = await recordOutcome(r, user, outcome, failures);
    if (outcome.status !== 'skipped') {
      r.job.stopped = batchStopReason(outcome, failures);
    }
    await r.publish();
  }
};
