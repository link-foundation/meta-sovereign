/**
 * People and audience API (issue #31, PR #34).
 *
 * Search the people directory, review cross-network matches, keep
 * hand-picked lists and saved audiences, and resolve an audience to the
 * people an automation would be triggered for.
 *
 * Endpoints:
 *   GET    /api/people?q=&limit=&self=   search the directory
 *   GET    /api/people/xref              same-person suggestions
 *   GET    /api/audiences                saved `audience:` links
 *   PUT    /api/audiences                { id?, name, spec | text }
 *   DELETE /api/audiences/<id>
 *   POST   /api/audiences/resolve        { spec | text, self?, limit? }
 *                                        → { count, people }
 *   GET    /api/lists                    saved `list:` links
 *   PUT    /api/lists                    { id?, name, members }
 *   DELETE /api/lists/<id>
 *
 * A spec that does not parse or resolve (unknown kind, missing saved
 * audience, a cycle) is answered with 400 `{ error }`.
 */

import { bodyFailure, json, readBody } from './util.js';
import {
  AUDIENCE_PREFIX,
  LIST_PREFIX,
  audienceLink,
  crossReference,
  listLink,
  resolveAudience,
  searchPeople,
} from '../crm/people.js';
import { scanPeople } from './people-scan.js';

const selfFrom = (value) =>
  (Array.isArray(value) ? value : String(value ?? '').split(','))
    .map((s) => String(s).trim())
    .filter(Boolean);

const peopleOf = async (store, url) =>
  (
    await scanPeople(store, {
      self: selfFrom(url.searchParams.get('self')),
    })
  ).index.people;

const linksWith = async (store, prefix) =>
  store.query((l) => l?.id?.startsWith(prefix));

// Validate by resolving against the store as it would be once saved, so
// a saved audience that refers to itself is rejected as a cycle.
const saveAudience = async (store, body) => {
  const link = audienceLink({
    id: body.id,
    name: body.name,
    spec: body.spec ?? body.text,
  });
  const { links, index, queryMatches } = await scanPeople(store, {
    spec: link.spec,
    replacement: link,
  });
  const count = resolveAudience(links, link.spec, {
    index,
    queryMatches,
  }).length;
  await store.put(link);
  return { audience: link, count };
};

const saveList = async (store, body) => {
  const link = listLink(body);
  await store.put(link);
  return { list: link };
};

const resolve = async (store, body) => {
  const spec = body.spec ?? body.text;
  const { links, index, queryMatches } = await scanPeople(store, {
    spec,
    self: selfFrom(body.self),
  });
  const people = resolveAudience(links, spec, { index, queryMatches });
  const limit = Number(body.limit);
  return {
    count: people.length,
    people: limit > 0 ? people.slice(0, limit) : people,
  };
};

const ROUTES = {
  'GET /api/people': async (store, _body, url) =>
    searchPeople(await peopleOf(store, url), url.searchParams.get('q') ?? '', {
      limit: Number(url.searchParams.get('limit') ?? 50),
    }),
  'GET /api/people/xref': async (store, _body, url) =>
    crossReference(await peopleOf(store, url)),
  'GET /api/audiences': (store) => linksWith(store, AUDIENCE_PREFIX),
  'GET /api/lists': (store) => linksWith(store, LIST_PREFIX),
  'PUT /api/audiences': saveAudience,
  'PUT /api/lists': saveList,
  'POST /api/audiences/resolve': resolve,
};

const DELETABLE = {
  '/api/audiences/': AUDIENCE_PREFIX,
  '/api/lists/': LIST_PREFIX,
};

const handleDelete = async (store, res, p) => {
  const base = Object.keys(DELETABLE).find((b) => p.startsWith(b));
  const id = base ? decodeURIComponent(p.slice(base.length)) : '';
  if (!id) {
    return false;
  }
  const linkId = `${DELETABLE[base]}${id}`;
  const deleted = Boolean(await store.delete(linkId));
  json(res, deleted ? 200 : 404, { id: linkId, deleted });
  return true;
};

export const handlePeopleRoutes = async (store, req, res, p, url) => {
  if (req.method === 'DELETE') {
    return handleDelete(store, res, p);
  }
  const route = ROUTES[`${req.method} ${p}`];
  if (!route) {
    return false;
  }
  try {
    const body = req.method === 'GET' ? {} : await readBody(req);
    json(res, 200, await route(store, body ?? {}, url));
  } catch (error) {
    const [status, body] = bodyFailure(error) ?? [
      400,
      { error: error.message },
    ];
    json(res, status, body);
  }
  return true;
};
