import { withFollowRetry } from './retry.js';
import { backlinkFailure } from './backlink-shape.js';
import { saveBacklink } from './backlink-journal.js';
import { readFollowReview, readFollowingLinks } from './auto-preview.js';
import { assertFollowingOwner, sameFollowingTarget } from './auto-shape.js';

const readyPhases = (review) =>
  review.phases.every((phase) => ['ready', 'skipped'].includes(phase.status));
const confirmedJoin = (result, review) =>
  result?.ok === true &&
  Array.isArray(result.results) &&
  result.results.length === review.phases.length &&
  result.results.every(
    (phase, i) =>
      phase.phase === review.phases[i].phase &&
      ['confirmed', 'skipped'].includes(phase.status)
  );
export const createAutoFollowing = ({
  store,
  job,
  adapter,
  joining,
  control,
  sleep,
  trace,
}) => {
  const cancelled = () => control.signal.aborted;
  const check = () => {
    if (cancelled()) {
      throw backlinkFailure('cancelled');
    }
  };
  const read = (use) =>
    withFollowRetry(use, {
      policy: job.config.retry,
      cancelled,
      sleep: (ms) => sleep(ms, control.signal),
      trace,
    });
  const save = () => saveBacklink(store, job);
  const sourceAccount = async (row) => {
    const current = await read(() => adapter.describe(row.chat));
    if (current?.owner !== job.owner || current.chat !== row.chat) {
      throw backlinkFailure('account-changed');
    }
    if (current.canWrite !== true) {
      throw backlinkFailure('not-writable');
    }
    check();
  };
  const joinLink = async (joiner, link) => {
    check();
    const review = await read(() =>
      joiner.preview(link.url, job.config.autoFollow)
    );
    try {
      assertFollowingOwner(job.followingAccount.owner, review);
      if (
        !sameFollowingTarget(
          job.config.targetSource,
          link.review.target,
          review.target
        )
      ) {
        throw backlinkFailure('target-changed');
      }
      if (!readyPhases(review)) {
        throw backlinkFailure('outcome-unknown');
      }
      check();
      link.status = 'applying';
      await save();
      check();
      const result = await joiner.apply(review, { cancelled, read });
      link.result = result;
      link.status = confirmedJoin(result, review) ? 'confirmed' : 'unknown';
      await save();
      if (link.status !== 'confirmed') {
        throw backlinkFailure('follow-incomplete');
      }
      check();
    } finally {
      await joiner.discard?.(review);
    }
  };
  return async () => {
    const joiner = await joining(job.config.targetSource);
    const account = await read(() =>
      readFollowReview(joiner, job.config.backlink, job.config.autoFollow)
    );
    assertFollowingOwner(job.followingAccount?.owner, account);
    if (
      !sameFollowingTarget(
        job.config.targetSource,
        job.followingAccount?.target,
        account.target
      )
    ) {
      throw backlinkFailure('target-changed');
    }
    for (const row of job.rows) {
      if (
        !['ready', 'monitoring', 'survived'].includes(row.status) ||
        (row.status !== 'ready' &&
          row.following?.links.every((link) => link.status === 'confirmed'))
      ) {
        continue;
      }
      await sourceAccount(row);
      if (!row.following) {
        const found = await read(() =>
          readFollowingLinks(adapter, job.config, row.chat)
        );
        row.following = { ...found, owner: account.owner, links: [] };
        for (const link of found.links) {
          const review = await read(() =>
            readFollowReview(joiner, link.url, job.config.autoFollow)
          );
          assertFollowingOwner(account.owner, review);
          row.following.links.push({ ...link, review, status: 'ready' });
        }
        await save();
      }
      for (const link of row.following.links) {
        // Re-resolve after restart. Provider journals block uncertain writes;
        // positively observed membership can safely skip an already applied join.
        await sourceAccount(row);
        await joinLink(joiner, link);
        if (job.config.autoFollow.joinDelayMs) {
          await sleep(job.config.autoFollow.joinDelayMs, control.signal);
        }
      }
    }
  };
};
