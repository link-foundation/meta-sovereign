/**
 * Pulling one repository, again and again cheaply (R-Z11).
 *
 * A first pull (no `since`) walks everything. A later one passes the
 * `since` the last successful pull returned: issue comments, review
 * comments and issues are asked `?since=` sorted by update time, pull
 * requests (no `since` parameter exists) are walked newest-update first
 * and the walk stops at the first one older than the cursor, and reviews
 * are fetched only for the pull requests that changed. The first page of
 * each stream is asked with `If-None-Match` (the ETag the last pull
 * returned for that very url), so an idle repository costs a free `304` per stream.
 *
 * The function never stores anything and never moves a cursor: the caller
 * saves `since` and `etags` after its store write succeeded (R-Z14), so a
 * failed write repeats the same window next time.
 */

import { addSearch } from './http.js';

const URL_OF = (ctx, path, search) =>
  addSearch(new URL(`${ctx.baseUrl}${path}`), search).toString();

const olderThan = (since) => (item) =>
  since && Date.parse(item.updated_at ?? item.created_at) < Date.parse(since);

/**
 * @param {object} ctx `{ http, baseUrl, headers, requireRepo, now }`
 * @param {object} options `{ owner, repo, token, since?, etags?, state?,
 *   perPage? }`
 * @param {object} build the link builders `{ issue, pull, issueComment,
 *   reviewComment, review }`
 */
export const syncGithubRepo = async (ctx, options, build) => {
  const { owner: o, repo: r } = ctx.requireRepo(options);
  const auth = ctx.headers(options.token);
  const since = options.since ?? null;
  const etags = options.etags ?? {};
  const startedAt = new Date(ctx.now()).toISOString();
  const state = options.state ?? 'all';
  const newest = {
    per_page: options.perPage ?? 100,
    sort: 'updated',
    direction: 'desc',
  };
  const next = { etags: {} };
  let unchanged = 0;

  const stream = async (name, path, search, { stopAtOld = false } = {}) => {
    const url = URL_OF(ctx, path, search);
    // An ETag answers for the exact url it came from (the `since` is in it).
    const known = etags[name]?.url === url ? etags[name].etag : null;
    const result = await ctx.http.pages(url, {
      headers: auth,
      etag: known,
      until: stopAtOld && since ? olderThan(since) : undefined,
    });
    if (result.notModified) {
      unchanged += 1;
      next.etags[name] = etags[name];
    } else if (result.etag) {
      next.etags[name] = { url, etag: result.etag };
    }
    return result.items;
  };

  const base = `/repos/${o}/${r}`;
  const issues = await stream('issues', `${base}/issues`, {
    ...newest,
    state,
    since,
  });
  const issueComments = await stream('comments', `${base}/issues/comments`, {
    ...newest,
    since,
  });
  const pulls = await stream(
    'pulls',
    `${base}/pulls`,
    { ...newest, state },
    { stopAtOld: true }
  );
  const reviewComments = await stream(
    'reviewComments',
    `${base}/pulls/comments`,
    { ...newest, since }
  );
  const reviews = [];
  for (const pr of pulls) {
    const page = await ctx.http.pages(
      URL_OF(ctx, `${base}/pulls/${pr.number}/reviews`, {
        per_page: newest.per_page,
      }),
      { headers: auth }
    );
    for (const review of page.items) {
      review.pull_request_url = pr.url;
      reviews.push(review);
    }
  }

  const links = [
    ...issues.filter((i) => !i.pull_request).map(build.issue),
    ...issueComments.map(build.issueComment),
    ...pulls.map(build.pull),
    ...reviewComments.map(build.reviewComment),
    ...reviews.map(build.review),
  ];
  const rawCount =
    issues.length +
    issueComments.length +
    pulls.length +
    reviewComments.length +
    reviews.length;
  return {
    links,
    rawCount,
    nextOffset: null,
    // The cursor moves only when something came in, so an idle repository
    // asks the same urls again and gets free 304 answers.
    since: rawCount > 0 || !since ? startedAt : since,
    etags: next.etags,
    notModified: unchanged === 4,
  };
};
