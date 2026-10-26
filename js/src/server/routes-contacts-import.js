// Local address-book import: preview first, then apply exactly that batch.
// Neither route uploads contacts to Telegram, iCloud or any other network.
import { createHash } from 'node:crypto';
import { json, readBody, bodyFailure } from './util.js';
import { createConfirmations } from './confirmations.js';
import { MAX_VCARD_BYTES, parseVcard } from '../sources/vcard.js';
import {
  planContactsImport,
  applyContactsImport,
} from '../sources/contacts-import.js';
import { readSystemContacts } from '../sources/system-contacts.js';

const ROOT = '/api/contacts/import';
const action = 'contacts:import';
const reply = (res, status, body) => {
  json(res, status, body);
  return true;
};

const preview = async (store, body, ctx) => {
  let contacts;
  if (body.source === 'vcard') {
    contacts = parseVcard(body.text);
  } else if (body.source === 'system') {
    contacts = await (ctx.systemContactsReader ?? readSystemContacts)(
      ctx.storeDir
    );
  } else {
    throw Object.assign(new Error('Choose system contacts or a vCard file.'), {
      code: 'bad-contacts',
    });
  }
  const plan = await planContactsImport(store, contacts, {
    source: body.source,
  });
  const digest = createHash('sha256')
    .update(JSON.stringify(plan))
    .digest('hex');
  ctx.contactImportConfirmations ??= createConfirmations({ maxPending: 3 });
  const confirm = ctx.contactImportConfirmations.issue(
    action,
    { source: body.source, digest },
    plan
  );
  return {
    ok: true,
    ...plan.stats,
    source: body.source,
    digest,
    confirm,
    sample: plan.links
      .slice(0, 5)
      .map(({ name, emails, phones }) => ({ name, emails, phones })),
  };
};

export const handleContactsImport = async (store, req, res, p, ctx) => {
  if (p === ROOT && req.method === 'GET') {
    return reply(res, 200, {
      ok: true,
      vcard: true,
      system: {
        available:
          Boolean(ctx.systemContactsReader) || process.platform === 'darwin',
        platform: process.platform,
      },
    });
  }
  if (
    req.method !== 'POST' ||
    ![`${ROOT}/preview`, `${ROOT}/apply`].includes(p)
  ) {
    return false;
  }
  try {
    // JSON escaping can expand a byte to six characters. The parser still
    // enforces the 10 MiB decoded file limit; apply keeps the normal limit.
    const body = await readBody(
      req,
      p.endsWith('/preview')
        ? { limit: 6 * MAX_VCARD_BYTES + 64 * 1024 }
        : undefined
    );
    if (p.endsWith('/preview')) {
      return reply(res, 200, await preview(store, body, ctx));
    }
    const accepted = ctx.contactImportConfirmations?.consume(
      body.confirmToken,
      action,
      {
        source: body.source,
        digest: body.digest,
      }
    );
    if (!accepted) {
      return reply(res, 409, {
        error: 'The import preview expired. Preview the contacts again.',
        code: 'contacts-preview-expired',
      });
    }
    return reply(res, 200, await applyContactsImport(store, accepted.data));
  } catch (error) {
    const fallback = error.code === 'contacts-permission-denied' ? 403 : 400;
    const [status, body] = bodyFailure(error) ?? [
      fallback,
      { error: error.message, code: error.code ?? 'contacts-import-failed' },
    ];
    return reply(res, status, body);
  }
};
