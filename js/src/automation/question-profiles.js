// Named owner values shared by question automations. References are resolved
// for each plan and final delivery check; automation records keep overrides only.
import { normalizeAnswerProfile } from './question-profile.js';
import { writeAnswerKnowledge } from './question-knowledge.js';

export const QA_PROFILE_PREFIX = 'qa-profile:';
const KEY = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/u;
const REVISION = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;
const MAX_BYTES = 4 * 1024 ** 2;

export const answerProfileId = (input) => {
  if (typeof input !== 'string') {
    throw new Error('a named answer profile identifier is required');
  }
  const key = input.startsWith(QA_PROFILE_PREFIX)
    ? input.slice(QA_PROFILE_PREFIX.length)
    : input;
  if (!KEY.test(key)) {
    throw new Error('invalid named answer profile identifier');
  }
  return `${QA_PROFILE_PREFIX}${key}`;
};

export const optionalAnswerProfileId = (input) =>
  input === undefined || input === null || input === ''
    ? null
    : answerProfileId(input);

export const answerProfileMetadata = (input) => {
  if (
    input?.id !== answerProfileId(input?.id) ||
    typeof input.name !== 'string' ||
    !input.name.trim() ||
    input.name.length > 120 ||
    !REVISION.test(input.revision) ||
    typeof input.updatedAt !== 'string' ||
    input.updatedAt.length > 40 ||
    !Number.isFinite(Date.parse(input.updatedAt))
  ) {
    throw new Error('invalid named answer profile record');
  }
  return {
    id: input.id,
    name: input.name.trim(),
    revision: input.revision,
    updatedAt: input.updatedAt,
  };
};

export const normalizeSavedAnswerProfile = (input) => {
  const metadata = answerProfileMetadata(input);
  if (!Object.hasOwn(input, 'values')) {
    throw new Error('named answer profile values are required');
  }
  return { ...metadata, values: normalizeAnswerProfile(input.values) };
};

const readProfiles = async (store, project) => {
  const profiles = [];
  let bytes = 0;
  const accept = (batch) => {
    for (const entry of batch) {
      bytes += JSON.stringify(entry).length * 2;
      if (profiles.length >= 50 || bytes > MAX_BYTES) {
        throw new Error('named answer profile capacity exceeded');
      }
      profiles.push(entry);
    }
  };
  const select = (link) => link?.id?.startsWith(QA_PROFILE_PREFIX);
  if (store.scan) {
    await store.scan(select, 16, accept, project);
  } else {
    accept((await store.query(select)).map(project));
  }
  return profiles;
};

export const listAnswerProfiles = async (store) =>
  (await readProfiles(store, answerProfileMetadata)).sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
  );

const missingProfile = (id) =>
  Object.assign(
    new Error(`Named answer profile ${id} is missing; review its reference`),
    {
      code: 'answer-profile-missing',
    }
  );

export const readAnswerProfile = async (store, id) => {
  const key = answerProfileId(id);
  const record = await store.get(key);
  if (!record) {
    throw missingProfile(key);
  }
  const profile = normalizeSavedAnswerProfile(record);
  if (profile.id !== key) {
    throw new Error('named answer profile identifier mismatch');
  }
  return profile;
};

const checkRevision = (current, revision) => {
  if (revision !== (current?.revision ?? null)) {
    throw Object.assign(
      new Error(
        'Named answer profile changed; reload before saving or deleting'
      ),
      {
        code: 'answer-profile-changed',
      }
    );
  }
};

export const saveAnswerProfile = (store, input) =>
  writeAnswerKnowledge(store, async () => {
    const profile = normalizeSavedAnswerProfile({
      ...input,
      id: answerProfileId(input?.id),
      revision: globalThis.crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
    });
    const current = await store.get(profile.id);
    checkRevision(
      current ? normalizeSavedAnswerProfile(current) : null,
      input.revision ?? null
    );
    const profiles = await readProfiles(store, normalizeSavedAnswerProfile);
    const next = [
      ...profiles.filter((entry) => entry.id !== profile.id),
      profile,
    ];
    if (next.length > 50 || JSON.stringify(next).length * 2 > MAX_BYTES) {
      throw new Error('named answer profile capacity exceeded');
    }
    await store.put({ ...profile, tokens: ['qa-profile'] });
    return profile;
  });

export const deleteAnswerProfile = (store, input) =>
  writeAnswerKnowledge(store, async () => {
    const profile = await readAnswerProfile(store, input?.id);
    checkRevision(profile, input.revision);
    await store.delete(profile.id);
    return { deleted: profile.id };
  });

export const resolveAnswerProfile = (action, record) => {
  const id = optionalAnswerProfileId(action.profileId);
  if (!id) {
    return action;
  }
  if (!record) {
    throw missingProfile(id);
  }
  const profile = normalizeSavedAnswerProfile(record);
  if (profile.id !== id) {
    throw new Error('named answer profile identifier mismatch');
  }
  const overrides = normalizeAnswerProfile(action.profile);
  return {
    ...action,
    profileId: id,
    profile: normalizeAnswerProfile({ ...profile.values, ...overrides }),
    profileSource: {
      ...answerProfileMetadata(profile),
      overriddenKeys: Object.keys(overrides).sort(),
    },
  };
};

export const resolveStoredAnswerProfile = async (store, action) =>
  resolveAnswerProfile(
    action,
    optionalAnswerProfileId(action.profileId)
      ? await readAnswerProfile(store, action.profileId)
      : null
  );
