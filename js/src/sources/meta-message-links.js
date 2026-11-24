const unverified = () => {
  throw Object.assign(new Error('Meta message destinations are unverified.'), {
    code: 'question-links-invalid',
  });
};

const records = (value = [], limit = 128) => {
  if (
    !Array.isArray(value) ||
    value.length > limit ||
    value.some(
      (item) => !item || typeof item !== 'object' || Array.isArray(item)
    )
  ) {
    unverified();
  }
  return value;
};

const graphEdge = (edge) => {
  if (!edge || edge.data === undefined || edge.paging?.next) {
    unverified();
  }
  return records(edge.data);
};

const shareTypes = new Set(['share', 'post', 'ig_post', 'reel', 'ig_reel']);

const buttonTargets = (buttons) =>
  records(buttons, 3)
    .filter((button) => button.type === 'web_url')
    .map((button) => button.url);

const templateTargets = (payload) => {
  if (!payload || typeof payload !== 'object') {
    unverified();
  }
  return [
    ...buttonTargets(payload.buttons),
    ...records(payload.elements, 10).flatMap((element) => [
      ...buttonTargets(element.default_action ? [element.default_action] : []),
      ...buttonTargets(element.buttons),
    ]),
  ];
};

const webhookTargets = (attachments) =>
  records(attachments).flatMap(({ type, payload }) => {
    if (shareTypes.has(type)) {
      return [payload?.url];
    }
    return type === 'template' ? templateTargets(payload) : [];
  });

const graphAttachmentTargets = (attachments) =>
  graphEdge(attachments).flatMap(({ generic_template: template }) => {
    const action = template?.cta;
    return action?.url !== undefined || action?.type === 'web_url'
      ? [action.url]
      : [];
  });

const nativeTargets = (raw) => {
  const { shares } = raw;
  const attachments = raw.attachments ?? [];
  const fromAttachments = Array.isArray(attachments)
    ? webhookTargets(attachments)
    : graphAttachmentTargets(attachments);
  return shares === undefined
    ? fromAttachments
    : [...fromAttachments, ...graphEdge(shares).map((entry) => entry.url)];
};

/** Keep whole action URLs and refuse temporary previews, with no fetches. */
const destination = (value) => {
  if (typeof value !== 'string' || value.length > 2000 || /\s/u.test(value)) {
    unverified();
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    unverified();
  }
  if (
    !/^https?:\/\//iu.test(value) ||
    url.username ||
    url.password ||
    (url.hostname === 'lookaside.fbsbx.com' &&
      url.pathname.startsWith('/ig_messaging_cdn/'))
  ) {
    unverified();
  }
  return value;
};

/** Live objects expose provider cards. Older exports keep normalized shares. */
export const metaMessageTargets = ({ raw, attachments, body }) => {
  if (raw?.is_unsupported === true) {
    unverified();
  }
  if (
    (raw?.attachments ?? undefined) !== undefined ||
    raw?.shares !== undefined
  ) {
    const targets = nativeTargets(raw);
    if (targets.length && (raw.message ?? raw.text ?? '') !== body) {
      unverified();
    }
    return targets.map(destination);
  }
  const items = records(attachments ?? []);
  const links = items.filter(({ kind }) => kind === 'link');
  return links.length ? links.map(({ url }) => destination(url)) : undefined;
};
