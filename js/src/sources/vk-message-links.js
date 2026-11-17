const invalid = () => {
  throw Object.assign(new Error('VK attachment destinations are unverified.'), {
    code: 'question-links-invalid',
  });
};
const bounded = (attachments) => {
  if (
    !Array.isArray(attachments) ||
    attachments.length > 128 ||
    attachments.some(
      (value) => !value || typeof value !== 'object' || Array.isArray(value)
    )
  ) {
    invalid();
  }
  return attachments;
};
const wallTarget = (wall) => {
  const owner = wall?.owner_id ?? wall?.from_id;
  if (
    !Number.isSafeInteger(owner) ||
    owner === 0 ||
    !Number.isSafeInteger(wall?.id) ||
    wall.id < 1
  ) {
    invalid();
  }
  return `https://vk.com/wall${owner}_${wall.id}`;
};
const nativeTargets = (attachments) =>
  bounded(attachments).flatMap((value) => {
    if (value.type === 'wall') {
      return [wallTarget(value.wall)];
    }
    if (value.type === 'link') {
      return [value.link?.url];
    }
    // The adapter renders these document types as media, not assignment files.
    if (value.type === 'doc' && ![3, 4, 5].includes(value.doc?.type)) {
      return [value.doc?.url];
    }
    return [];
  });
const normalizedTargets = (attachments) =>
  bounded(attachments)
    .filter((value) => ['link', 'file'].includes(value.kind))
    .map((value) => value.url);

/** Bind direct VK destinations without following them or retaining raw payloads. */
export const vkMessageTargets = ({ raw, attachments, body }) => {
  // The actual VK adapter uses null for an empty attachment collection.
  const normalized =
    attachments === undefined || attachments === null
      ? undefined
      : normalizedTargets(attachments);
  if (raw?.attachments === undefined) {
    return normalized;
  }
  if (
    typeof body !== 'string' ||
    body.length > 6000 ||
    (raw.text ?? raw.body ?? '') !== body
  ) {
    invalid();
  }
  const native = nativeTargets(raw.attachments);
  if (
    normalized !== undefined &&
    JSON.stringify(native) !== JSON.stringify(normalized)
  ) {
    invalid();
  }
  return native;
};
