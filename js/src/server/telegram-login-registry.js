import { randomBytes } from 'node:crypto';

const loginsFor = (ctx) => (ctx.telegramLogins ??= new Map());
const closeEntry = (entry) =>
  Promise.resolve().then(() => entry.login.cancel());

export const beginTelegramLogin = (ctx, task) => {
  if (ctx.telegramLoginsClosing) {
    throw Object.assign(new Error('server is closing'), { status: 409 });
  }
  const starts = (ctx.telegramLoginStarts ??= new Set());
  const pending = Promise.resolve().then(task);
  starts.add(pending);
  return pending.finally(() => starts.delete(pending));
};

const closeTracked = (ctx, entry) => {
  const closings = (ctx.telegramLoginClosings ??= new Set());
  const pending = closeEntry(entry);
  closings.add(pending);
  return pending.finally(() => closings.delete(pending));
};

export const dropTelegramLogin = (ctx, id) => {
  const entry = loginsFor(ctx).get(id);
  if (entry) {
    globalThis.clearTimeout(entry.timer);
    loginsFor(ctx).delete(id);
  }
  return entry;
};

export const trackTelegramLogin = async (
  ctx,
  entry,
  { ttlMs = 300_000 } = {}
) => {
  if (ctx.telegramLoginsClosing || loginsFor(ctx).size >= 8) {
    await closeEntry(entry);
    throw Object.assign(
      new Error('Telegram login unavailable; close a pending sign-in first'),
      { status: 409 }
    );
  }
  const id = `tg-login-${Date.now()}-${randomBytes(12).toString('hex')}`;
  entry.timer = globalThis.setTimeout(() => {
    const expired = dropTelegramLogin(ctx, id);
    if (expired) {
      closeTracked(ctx, expired).catch(() => {});
    }
  }, ttlMs);
  entry.timer.unref?.();
  loginsFor(ctx).set(id, entry);
  return id;
};

export const findTelegramLogin = (ctx, id) => loginsFor(ctx).get(id);

export const closeTelegramLogin = (ctx, id) => {
  const entry = dropTelegramLogin(ctx, id);
  return entry ? closeTracked(ctx, entry) : Promise.resolve();
};

export const closeTelegramLogins = async (ctx) => {
  ctx.telegramLoginsClosing = true;
  const endings = [...loginsFor(ctx).keys()].map((id) =>
    closeTelegramLogin(ctx, id)
  );
  await Promise.allSettled([
    ...endings,
    ...(ctx.telegramLoginStarts ?? []),
    ...(ctx.telegramLoginClosings ?? []),
  ]);
};
