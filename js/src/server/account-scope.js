// Which Telegram account a request is for (R-Y202). The page names an
// extra account (2..5) in `telegramAccount=N` of the query (or the
// `x-telegram-account` header); the server then answers from that
// account's own store and service (./telegram-extras.js). Absent, or 1, is
// account 1, exactly as before: nothing changes for it. An extra account
// on a path that does not belong to an account (src/web/telegram-
// account-scope.js `scopedForExtra`), an unknown one or one that is not
// signed in is refused; it is never answered from account 1.

import { accountSlot } from '../sources/telegram-accounts.js';
import {
  ACCOUNT_HEADER,
  ACCOUNT_PARAM,
  scopedForExtra,
} from '../web/telegram-account-scope.js';
import { scopedContext } from './telegram-extras.js';

const BAD = [400, { error: 'bad account', code: 'bad-request' }];
const NO_ACCOUNT = [404, { error: 'no such account', code: 'no-account' }];
const UNSUPPORTED = [
  400,
  { error: 'not available for this account', code: 'unsupported-account' },
];

/**
 * `{}` for account 1, `{ refuse: [status, body] }`, or `{ store, ctx }`
 * to answer the request with.
 */
export const accountScope = async (req, url, p, ctx) => {
  const raw =
    req.headers?.[ACCOUNT_HEADER] ?? url.searchParams.get(ACCOUNT_PARAM);
  if (raw === undefined || raw === null || raw === '') {
    return {};
  }
  const slot = accountSlot(raw);
  if (slot === null) {
    return { refuse: BAD };
  }
  if (slot === 1) {
    return {};
  }
  if (!scopedForExtra(p, req.method)) {
    return { refuse: UNSUPPORTED };
  }
  const entry = await ctx.telegramExtras?.start(slot);
  return entry
    ? { store: entry.store, ctx: scopedContext(ctx, entry) }
    : { refuse: NO_ACCOUNT };
};
