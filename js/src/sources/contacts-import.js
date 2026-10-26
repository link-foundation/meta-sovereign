// Import address-book records without changing or uploading to a network.
import { createHash } from 'node:crypto';
import { MAX_CONTACTS } from './vcard.js';
import { putAll } from '../storage/universal.js';

const clean = (value) =>
  [...String(value ?? '')]
    .filter((c) => c.charCodeAt(0) >= 32 || '\t\n\r'.includes(c))
    .join('')
    .trim();
const values = (list) =>
  [
    ...new Set(
      (Array.isArray(list) ? list : [])
        .map((v) => clean(v?.value ?? v))
        .filter(Boolean)
    ),
  ].sort();
const hash = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

export const normalizeContact = (raw) => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const phones = values(raw.phones);
  const emails = values(values(raw.emails).map((email) => email.toLowerCase()));
  const name =
    clean(raw.name).replace(/\s+/g, ' ') ||
    clean(raw.organization) ||
    emails[0] ||
    phones[0];
  if (!name) {
    return null;
  }
  return {
    name,
    phones,
    emails,
    uid: clean(raw.uid),
    nickname: clean(raw.nickname),
    organization: clean(raw.organization),
    title: clean(raw.title),
    urls: values(raw.urls).filter((url) => /^https?:\/\//i.test(url)),
    addresses: (Array.isArray(raw.addresses) ? raw.addresses : []).map((a) =>
      Object.fromEntries(
        ['street', 'city', 'region', 'postalCode', 'country'].map((key) => [
          key,
          clean(a?.[key]),
        ])
      )
    ),
  };
};

const signature = (contact) =>
  hash([
    String(contact.name ?? '').toLowerCase(),
    contact.emails ?? [],
    (contact.phones ?? []).map((p) => p.replace(/[^\d+]/g, '')),
  ]);
const canMatch = (contact) =>
  Boolean(contact.emails?.length || contact.phones?.length);
const payload = (contact) => {
  const { uid: _uid, ...fields } = contact;
  return fields;
};

const importIndex = (existing) => {
  const byOrigin = new Map();
  const bySignature = new Map();
  for (const person of existing) {
    for (const key of person.contactOrigins ?? []) {
      byOrigin.set(key, person);
    }
    if (canMatch(person)) {
      bySignature.set(signature(person), person);
    }
  }
  return { byOrigin, bySignature };
};

export const planContactsImport = async (
  store,
  rows,
  { source, now = Date.now() }
) => {
  if (
    !['system', 'vcard'].includes(source) ||
    !Array.isArray(rows) ||
    rows.length > MAX_CONTACTS
  ) {
    throw Object.assign(
      new Error(
        'Choose a supported contact source with at most 20,000 entries.'
      ),
      { code: 'bad-contacts' }
    );
  }
  const existing = await store.query((l) =>
    l?.id?.startsWith('person:addressbook:')
  );
  const original = new Map(existing.map((person) => [person.id, person]));
  const { byOrigin, bySignature } = importIndex(existing);
  const links = new Map();
  let invalid = 0;
  const at = new Date(now).toISOString();
  for (const raw of rows) {
    const contact = normalizeContact(raw);
    if (!contact) {
      invalid += 1;
      continue;
    }
    const key = contact.uid
      ? `${source}:${contact.uid}`
      : `${source}:${signature(contact)}`;
    const old =
      byOrigin.get(key) ??
      (canMatch(contact) ? bySignature.get(signature(contact)) : null);
    const user = old?.user ?? `addressbook:${hash(key)}`;
    const id = `person:addressbook:${user}`;
    const contactOrigins = [
      ...new Set([...(old?.contactOrigins ?? []), key]),
    ].sort();
    const fields = payload(contact);
    const contactDigest = hash([fields, contactOrigins]);
    const link = {
      ...old,
      id,
      user,
      source: 'addressbook',
      kind: 'person',
      tokens: ['person', 'addressbook', user],
      ...fields,
      contact: true,
      contactOrigins,
      contactDigest,
      at,
    };
    links.set(id, link);
    byOrigin.set(key, link);
    if (canMatch(contact)) {
      bySignature.set(signature(contact), link);
    }
  }
  const changed = [...links.values()].filter(
    (link) => original.get(link.id)?.contactDigest !== link.contactDigest
  );
  const created = changed.filter((link) => !original.has(link.id)).length;
  return {
    links: changed,
    stats: {
      total: rows.length,
      created,
      updated: changed.length - created,
      unchanged: links.size - changed.length,
      invalid,
      duplicates: rows.length - invalid - links.size,
    },
  };
};

export const applyContactsImport = async (store, plan) => {
  const changed = [];
  for (const link of plan.links) {
    if ((await store.get(link.id))?.contactDigest === link.contactDigest) {
      continue;
    }
    changed.push(link);
  }
  await putAll(store, changed);
  return { ok: true, ...plan.stats, imported: changed.length };
};
