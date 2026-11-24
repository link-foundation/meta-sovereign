import { runIn } from './telegram-stickers.js';
import { userKey, userProfile } from './telegram-chat-users-shape.js';
import { greetingGroup } from './telegram-group-greeting-shape.js';
import { greetingFailure, greetingTarget } from './telegram-greeting-target.js';

// All reads use the existing account queue. A capped, interrupted or forbidden
// source is explicitly described as partial, never as complete membership.
const walk = async (r, kind, createIterator, limit, use) => {
  const coverage = r.job.coverage[kind];
  let iterator;
  try {
    const source = createIterator();
    iterator = source[Symbol.asyncIterator]();
    for (;;) {
      if (r.cancelled()) {
        break;
      }
      if (limit && coverage.read >= limit) {
        coverage.limited = true;
        break;
      }
      const next = await runIn(
        r.env,
        `chat-users:${r.job.id}:${kind}:${coverage.read}`,
        () => iterator.next()
      );
      if (next.done) {
        coverage.complete = true;
        break;
      }
      use(next.value);
      coverage.read += 1;
      if (coverage.read % 100 === 0) {
        await r.publish();
      }
    }
  } catch (error) {
    if (error.code === 'user-capacity') {
      throw error;
    }
    coverage.error =
      error.errorMessage?.match(/^[A-Z_0-9]{1,80}$/)?.[0] ?? 'read-failed';
  } finally {
    await iterator?.return?.();
  }
};
const resolve = async (r, value) => {
  try {
    const user = await runIn(
      r.env,
      `chat-users:${r.job.id}:resolve:${value}`,
      () =>
        r.c.client.getEntity(
          String(value).startsWith('@')
            ? value
            : r.c.helpers.returnBigInt(value)
        )
    );
    if (userProfile(user)) {
      return user;
    }
  } catch {
    // The unresolved identity remains visible and ineligible for contact writes.
  }
  return null;
};

const validateGroup = (entity, job) => {
  if (
    job.options.greetingGroup &&
    (!greetingGroup(entity) ||
      greetingTarget(entity, 'greeting-sticker').chat !== job.chat)
  ) {
    throw greetingFailure('group-required');
  }
};
export const scanChatUsers = async (r) => {
  const entity = await runIn(r.env, `chat-users:${r.job.id}:peer`, () =>
    r.c.client.getEntity(r.c.helpers.returnBigInt(r.job.chat))
  );
  validateGroup(entity, r.job);
  r.job.title = String(entity.title ?? entity.username ?? r.job.chat);
  const me = await runIn(r.env, `chat-users:${r.job.id}:me`, () =>
    r.c.client.getMe()
  );
  r.job.meId = userKey(me);
  await walk(
    r,
    'participants',
    () =>
      r.c.client.iterParticipants(entity, {
        limit: r.job.options.participantsLimit || undefined,
      }),
    r.job.options.participantsLimit,
    (user) => r.collection.add(user, 'participant')
  );
  if (!r.cancelled() && r.job.options.messagesLimit > 0) {
    r.job.phase = 'messages';
    await r.publish();
    await walk(
      r,
      'messages',
      () =>
        r.c.client.iterMessages(entity, { limit: r.job.options.messagesLimit }),
      r.job.options.messagesLimit,
      (message) => r.collection.message(message)
    );
  }
  r.job.phase = 'resolving';
  await r.publish();
  for (const [id, entry] of r.collection.users) {
    if (r.cancelled()) {
      break;
    }
    if (!entry.resolved) {
      await r.wait(100);
      if (r.cancelled()) {
        break;
      }
      const user = await resolve(r, id);
      if (user) {
        r.collection.add(user, 'resolved');
      }
    }
  }
  for (const [name, sources] of r.collection.mentions) {
    await r.wait(100);
    if (r.cancelled()) {
      break;
    }
    const user = await resolve(r, name);
    if (user) {
      for (const source of sources) {
        r.collection.add(user, source);
      }
    } else {
      r.job.unresolvedMentions += 1;
    }
  }
};
