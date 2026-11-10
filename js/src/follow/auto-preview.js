import { backlinkFailure, backlinkUrl } from './backlink-shape.js';
import { assertFollowingOwner } from './auto-shape.js';

export const readFollowReview = async (joining, url, options) => {
  const review = await joining.preview(url, options);
  try {
    assertFollowingOwner(null, review);
    if (
      !review.target ||
      !Array.isArray(review.phases) ||
      !review.phases.length
    ) {
      throw backlinkFailure('provider-response');
    }
    const {
      planId: _planId,
      expiresAt: _expires,
      ok: _ok,
      selector: _selector,
      ...data
    } = review;
    return data;
  } finally {
    await joining.discard?.(review);
  }
};
const validLink = (link, source) => {
  if (
    !link ||
    typeof link.url !== 'string' ||
    link.url.length > 2048 ||
    typeof link.messageId !== 'string' ||
    !/^[1-9]\d{0,19}$/u.test(link.messageId)
  ) {
    return false;
  }
  try {
    const target = backlinkUrl(link.url);
    return target.source === source && target.url === link.url;
  } catch {
    return false;
  }
};
export const readFollowingLinks = async (adapter, config, chat) => {
  if (typeof adapter.links !== 'function') {
    throw backlinkFailure('unsupported');
  }
  const answer = await adapter.links({
    chat,
    targetSource: config.targetSource,
    historyLimit: config.historyLimit,
    maxLinks: config.autoFollow.maxLinks,
  });
  if (
    !Array.isArray(answer?.links) ||
    answer.links.length > config.autoFollow.maxLinks ||
    typeof answer.limited !== 'boolean' ||
    !Number.isSafeInteger(answer.scanned) ||
    answer.scanned < 0 ||
    answer.scanned > config.historyLimit ||
    answer.links.some((link) => !validLink(link, config.targetSource)) ||
    new Set(answer.links.map((link) => link.url)).size !== answer.links.length
  ) {
    throw backlinkFailure('provider-response');
  }
  return answer;
};
export const previewAutoFollow = async ({ joining, adapter, plan, read }) => {
  if (!plan.config.autoFollow) {
    return;
  }
  const joiner = await joining(plan.config.targetSource);
  const options = plan.config.autoFollow;
  const account = await read(() =>
    readFollowReview(joiner, plan.config.backlink, options)
  );
  plan.followingAccount = {
    source: plan.config.targetSource,
    owner: account.owner,
    target: account.target,
  };
  for (const row of plan.rows) {
    const found = await read(() =>
      readFollowingLinks(adapter, plan.config, row.chat)
    );
    row.following = { ...found, owner: account.owner, links: [] };
    for (const link of found.links) {
      const review = await read(() =>
        readFollowReview(joiner, link.url, options)
      );
      assertFollowingOwner(account.owner, review);
      row.following.links.push({ ...link, review, status: 'ready' });
    }
  }
};
