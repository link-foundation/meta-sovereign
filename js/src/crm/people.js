/**
 * People directory, cross references and audience specs (issue #31,
 * PR #34).
 *
 * PR #34 asks for automation "triggered manually on selected users
 * (which should be searchable, and cross referenced)" and for audiences
 * merged from friends, chats, communities and lists — e.g. the
 * intersection of several lists, so exactly the right people are
 * targeted.
 *
 * - `buildPeople` folds messages, `person:` links, `member:` links and
 *   saved `list:` links into one entry per `<source>:<user>`.
 * - `crossReference` suggests (never merges) the same human on several
 *   networks by name or handle; confirmed matches live in `sameAs`.
 * - `searchPeople` ranks exact > prefix > substring matches.
 * - Audience specs are JSON (`{ kind: 'intersect', of: [...] }`) with a
 *   compact text form (`friends:vk & chat:vk:2000000001 - list:blocked`)
 *   so an audience can be typed, saved and shown alike.
 *
 * Everything is pure over a list of links, like `./reengage.js`, so the
 * CLI, the server and the offline SPA share one implementation.
 */

import { evalAudience } from './audience.js';
import { detectSelfIds, groupByChat, personalPartner } from './reengage.js';
import { normalizeMessage } from '../replies/reply-graph.js';

export const AUDIENCE_PREFIX = 'audience:';
export const LIST_PREFIX = 'list:';

/** `<source>:<user>` — the directory key of one account. */
export const personKey = (source, user) => `${source}:${user}`;

/** `'vk:42'` → `{ source: 'vk', user: '42' }`; `null` without a source. */
export const splitPersonKey = (key) => {
  const text = String(key ?? '');
  const at = text.indexOf(':');
  return at > 0 && at < text.length - 1
    ? { source: text.slice(0, at), user: text.slice(at + 1) }
    : null;
};

const iso = (value) => {
  const ms = Date.parse(String(value ?? ''));
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
};

// Normalised ISO strings compare chronologically as plain strings.
const later = (a, b) => (!a || (b && b > a) ? b : a);
const latestOf = (messages) =>
  messages.reduce((acc, m) => later(acc, iso(m.timestamp)), null);

const hasPrefix = (prefix) => (l) => Boolean(l?.id?.startsWith(prefix));

const isMessage = (l) =>
  hasPrefix('msg:')(l) && l.chat !== undefined && l.chat !== null;

// Where a member link puts its person: `friends`, `chat:<id>`, ...
const groupLabel = ({ groupKind, group }) =>
  groupKind === 'friends' ? 'friends' : `${groupKind}:${group}`;

const draftPerson = (source, user) => ({
  key: personKey(source, user),
  source,
  user: String(user),
  names: {},
  handle: null,
  personalChat: null,
  chats: new Set(),
  groups: new Set(),
  sent: 0,
  minePersonal: 0,
  lastSentAt: null,
  lastMineAt: null,
  lastTheirsPersonal: null,
  mutual: false,
  sameAs: new Set(),
});

const finishPerson = (d) => ({
  key: d.key,
  source: d.source,
  user: d.user,
  name:
    d.names.person ?? d.names.member ?? d.names.sender ?? d.names.chat ?? null,
  handle: d.handle,
  personalChat: d.personalChat,
  chats: [...d.chats],
  groups: [...d.groups],
  // Messages they wrote anywhere plus mine in our 1:1 chat.
  messages: d.sent + d.minePersonal,
  lastAt: later(d.lastSentAt, d.lastMineAt),
  lastMineAt: d.lastMineAt,
  lastTheirsAt: d.personalChat === null ? d.lastSentAt : d.lastTheirsPersonal,
  mutual: d.mutual,
  sameAs: [...d.sameAs].filter((k) => k !== d.key).sort(),
});

/** A directory entry for an account nothing else is known about. */
export const stubPerson = (key) => {
  const parts = splitPersonKey(key);
  if (!parts) {
    throw new Error(`person key "${key}" must look like <source>:<user>`);
  }
  return finishPerson(draftPerson(parts.source, parts.user));
};

const createDirectory = (selfIds) => {
  const drafts = new Map();
  const isSelf = (user) => selfIds.has(String(user));
  const get = (source, user) => {
    const key = personKey(source, user);
    if (!drafts.has(key)) {
      drafts.set(key, draftPerson(source, user));
    }
    return drafts.get(key);
  };
  return { drafts, isSelf, get };
};

const addPersonalChat = (d, entry, isSelf) => {
  if (d.personalChat !== null) {
    return;
  }
  const mine = entry.messages.filter((m) => isSelf(m.sender));
  const theirs = entry.messages.filter((m) => m.sender && !isSelf(m.sender));
  d.personalChat = entry.chat;
  d.chats.add(entry.chat);
  d.minePersonal = mine.length;
  d.lastMineAt = latestOf(mine);
  d.lastTheirsPersonal = latestOf(theirs);
  d.mutual = mine.length > 0 && theirs.length > 0;
  d.names.chat = entry.messages.find((m) => m.chatName)?.chatName;
};

const addMessages = (dir, messages) => {
  for (const entry of groupByChat(messages)) {
    const partner = personalPartner(entry, dir.isSelf);
    if (partner !== null) {
      addPersonalChat(dir.get(entry.source, partner), entry, dir.isSelf);
    }
    for (const m of entry.messages) {
      if (!m.sender || dir.isSelf(m.sender)) {
        continue;
      }
      const d = dir.get(m.source, m.sender);
      d.chats.add(entry.chat);
      d.groups.add(`chat:${entry.chat}`);
      d.sent += 1;
      d.lastSentAt = later(d.lastSentAt, iso(m.timestamp));
      d.names.sender ??= m.senderName ?? undefined;
    }
  }
};

const addMembers = (dir, members) => {
  for (const l of members) {
    if (!l.source || !l.user || dir.isSelf(l.user)) {
      continue;
    }
    const d = dir.get(l.source, l.user);
    d.groups.add(groupLabel(l));
    if (l.groupKind === 'chat') {
      d.chats.add(String(l.group));
    }
    d.names.member ??= l.name ?? undefined;
  }
};

const addLists = (dir, lists) => {
  for (const l of lists) {
    const label = `list:${l.id.slice(LIST_PREFIX.length)}`;
    for (const parts of (l.members ?? []).map(splitPersonKey)) {
      if (parts && !dir.isSelf(parts.user)) {
        dir.get(parts.source, parts.user).groups.add(label);
      }
    }
  }
};

// `sameAs` is an equivalence: symmetric and transitive, so every key in
// a cluster lists all the others.
const linkSameAs = (dir, persons) => {
  const parent = new Map();
  const find = (k) => {
    while (parent.has(k) && parent.get(k) !== k) {
      k = parent.get(k);
    }
    return k;
  };
  for (const l of persons) {
    const key = personKey(l.source, l.user);
    const others = (l.sameAs ?? []).map(splitPersonKey);
    for (const parts of others.filter((o) => o && !dir.isSelf(o.user))) {
      dir.get(parts.source, parts.user);
      parent.set(find(personKey(parts.source, parts.user)), find(key));
    }
  }
  const clusters = new Map();
  for (const key of dir.drafts.keys()) {
    const root = find(key);
    clusters.set(root, [...(clusters.get(root) ?? []), key]);
  }
  for (const keys of clusters.values()) {
    keys.forEach((k) => keys.forEach((o) => dir.drafts.get(k).sameAs.add(o)));
  }
};

const addPersons = (dir, links) => {
  const persons = links.filter(
    (l) => l.source && l.user && !dir.isSelf(l.user)
  );
  for (const l of persons) {
    const d = dir.get(l.source, l.user);
    d.names.person = l.name ?? undefined;
    d.handle = l.handle ?? l.screenName ?? d.handle;
  }
  linkSameAs(dir, persons);
};

const byRecent = (a, b) =>
  String(b.lastAt ?? '').localeCompare(String(a.lastAt ?? '')) ||
  a.key.localeCompare(b.key);

/**
 * The directory plus what it was built from: `{ people, byKey,
 * selfIds }`. `self` names the owner's ids; without it they are
 * detected the way re-engage does (`detectSelfIds`).
 */
export const peopleIndex = (links = [], { self = [] } = {}) => {
  const messages = links.filter(isMessage);
  const selfIds = detectSelfIds(messages, self);
  const dir = createDirectory(selfIds);
  addMessages(dir, messages);
  addMembers(dir, links.filter(hasPrefix('member:')));
  addLists(dir, links.filter(hasPrefix(LIST_PREFIX)));
  addPersons(dir, links.filter(hasPrefix('person:')));
  const people = [...dir.drafts.values()].map(finishPerson).sort(byRecent);
  return { people, byKey: new Map(people.map((p) => [p.key, p])), selfIds };
};

/** One entry per `<source>:<user>`, most recently active first. */
export const buildPeople = (links, opts) => peopleIndex(links, opts).people;

/**
 * Likely same-person matches across networks: people on at least two
 * sources sharing a normalised name or handle (case, "ё" and
 * punctuation ignored). Suggestions only — pairs already joined by
 * `sameAs` are left out, and nothing is merged.
 */
export const crossReference = (people = []) => {
  const buckets = new Map();
  for (const p of people) {
    for (const reason of ['name', 'handle']) {
      const value = normalizeMessage(p[reason]);
      const id = `${reason}:${value}`;
      if (value) {
        const bucket = buckets.get(id) ?? { reason, value, members: [] };
        bucket.members.push(p);
        buckets.set(id, bucket);
      }
    }
  }
  const suggestions = new Map();
  for (const { reason, value, members } of buckets.values()) {
    const [first] = members;
    const linked = members.every(
      (m) => m.key === first.key || first.sameAs.includes(m.key)
    );
    if (new Set(members.map((m) => m.source)).size < 2 || linked) {
      continue;
    }
    const keys = members.map((m) => m.key).sort();
    const existing = suggestions.get(keys.join(' '));
    suggestions.set(keys.join(' '), {
      keys,
      reasons: [...(existing?.reasons ?? []), reason],
      value: existing?.value ?? value,
      people: members.map(({ key, source, user, name, handle }) => ({
        key,
        source,
        user,
        name,
        handle,
      })),
    });
  }
  return [...suggestions.values()].sort(
    (a, b) =>
      b.reasons.length - a.reasons.length || a.value.localeCompare(b.value)
  );
};

const fold = (value) =>
  String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ё/g, 'е');

const fieldScore = (field, needle) => {
  const hay = fold(field);
  if (!hay) {
    return 0;
  }
  if (hay === needle) {
    return 3;
  }
  const words = hay.split(/[\s._@:-]+/);
  if (hay.startsWith(needle) || words.some((w) => w.startsWith(needle))) {
    return 2;
  }
  return hay.includes(needle) ? 1 : 0;
};

/**
 * Case-insensitive search over name, user id, key and handle. Exact
 * matches rank above prefix (of the field or of a word in it) matches,
 * which rank above substrings; ties go to the most recently active.
 * Accounts linked by `sameAs` to a match come last, so searching a name
 * also finds that person's other networks. An empty query lists
 * everyone.
 */
export const searchPeople = (people = [], query = '', { limit = 50 } = {}) => {
  const cap = Number(limit) > 0 ? Number(limit) : people.length;
  const needle = fold(query).trim();
  if (!needle) {
    return [...people].sort(byRecent).slice(0, cap);
  }
  const scores = new Map();
  for (const p of people) {
    const fields = [p.name, p.user, p.key, p.handle];
    const score = Math.max(...fields.map((f) => fieldScore(f, needle)));
    if (score > 0) {
      scores.set(p.key, score);
    }
  }
  for (const p of people) {
    if (!scores.has(p.key) && p.sameAs.some((k) => scores.has(k))) {
      scores.set(p.key, 0.5);
    }
  }
  return people
    .filter((p) => scores.has(p.key))
    .sort((a, b) => scores.get(b.key) - scores.get(a.key) || byRecent(a, b))
    .slice(0, cap);
};

// ---------------------------------------------------------------------
// Audience specs

const required = (spec, ...fields) => {
  for (const field of fields) {
    const value = spec[field];
    if (value === undefined || value === null || value === '') {
      throw new Error(`audience "${spec.kind}" needs "${field}"`);
    }
  }
};

const keysWhere = (ctx, predicate) =>
  new Set(ctx.people.filter(predicate).map((p) => p.key));

const inGroup = (label, source) => (p) =>
  p.groups.includes(label) && (!source || p.source === String(source));

const operands = (ctx, spec) => {
  if (!Array.isArray(spec.of) || spec.of.length === 0) {
    throw new Error(`audience "${spec.kind}" needs a non-empty "of" list`);
  }
  return spec.of.map((child) => evaluate(ctx, child));
};

const resolveSaved = (ctx, spec) => {
  required(spec, 'id');
  const id = String(spec.id);
  if (ctx.trail.includes(id)) {
    throw new Error(`audience cycle: ${[...ctx.trail, id].join(' -> ')}`);
  }
  const link = ctx.links.find((l) => l?.id === `${AUDIENCE_PREFIX}${id}`);
  if (!link) {
    throw new Error(`no saved audience "${id}"`);
  }
  return evaluate(
    { ...ctx, trail: [...ctx.trail, id] },
    toAudienceSpec(link.spec ?? link.text)
  );
};

const RESOLVERS = {
  all: (ctx) => keysWhere(ctx, () => true),
  friends: (ctx, spec) => keysWhere(ctx, inGroup('friends', spec.source)),
  chat: (ctx, spec) => {
    required(spec, 'source', 'chat');
    return keysWhere(ctx, inGroup(`chat:${spec.chat}`, spec.source));
  },
  community: (ctx, spec) => {
    required(spec, 'source', 'community');
    return keysWhere(ctx, inGroup(`community:${spec.community}`, spec.source));
  },
  list: (ctx, spec) => {
    required(spec, 'id');
    return keysWhere(ctx, inGroup(`list:${spec.id}`));
  },
  personal: (ctx, spec) =>
    keysWhere(
      ctx,
      (p) =>
        p.personalChat !== null &&
        (!spec.source || p.source === String(spec.source))
    ),
  // The message DSL of `./audience.js`: whoever (but me) wrote a match.
  query: (ctx, spec) => {
    required(spec, 'q');
    return new Set(
      evalAudience(ctx.links, spec.q)
        .filter(
          (l) => l.source && l.sender && !ctx.selfIds.has(String(l.sender))
        )
        .map((l) => personKey(l.source, l.sender))
    );
  },
  people: (_ctx, spec) => {
    if (!Array.isArray(spec.keys)) {
      throw new Error('audience "people" needs a "keys" list');
    }
    return new Set(spec.keys.map((k) => stubPerson(k).key));
  },
  saved: resolveSaved,
  union: (ctx, spec) =>
    new Set(operands(ctx, spec).flatMap((keys) => [...keys])),
  intersect: (ctx, spec) => {
    const [first, ...rest] = operands(ctx, spec);
    return new Set([...first].filter((k) => rest.every((s) => s.has(k))));
  },
  // The first set minus every other one.
  difference: (ctx, spec) => {
    const [first, ...rest] = operands(ctx, spec);
    return new Set([...first].filter((k) => !rest.some((s) => s.has(k))));
  },
};

export const AUDIENCE_KINDS = Object.freeze(Object.keys(RESOLVERS));

const evaluate = (ctx, spec) => {
  if (!spec || typeof spec !== 'object') {
    throw new Error('an audience spec is an object with a "kind"');
  }
  if (!Object.hasOwn(RESOLVERS, spec.kind)) {
    throw new Error(
      `unknown audience kind "${spec.kind}"; known: ${AUDIENCE_KINDS.join(', ')}`
    );
  }
  return RESOLVERS[spec.kind](ctx, spec);
};

/** A spec object as is, or its text form parsed. */
export const toAudienceSpec = (value) => {
  if (typeof value === 'string') {
    return parseAudienceSpec(value);
  }
  if (!value) {
    throw new Error('an audience needs a spec or its text form');
  }
  return value;
};

/**
 * The people a spec (object or text) selects, as directory entries so
 * they carry `personalChat`, `mutual` and the rest. Keys the directory
 * does not know (a `people` spec) come back as stubs. Pass `index`
 * (from `peopleIndex`) to resolve many specs over one directory.
 */
export const resolveAudience = (links = [], spec, opts = {}) => {
  const index = opts.index ?? peopleIndex(links, opts);
  const keys = evaluate({ ...index, links, trail: [] }, toAudienceSpec(spec));
  return [
    ...index.people.filter((p) => keys.has(p.key)),
    ...[...keys].filter((k) => !index.byKey.has(k)).map(stubPerson),
  ];
};

const slug = (text) =>
  fold(text)
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

// `id` may be given whole (`list:x`, as read back from the store).
const linkId = (id, name, kind, prefix) => {
  const given = String(id ?? '').trim();
  const value =
    (given.startsWith(prefix) ? given.slice(prefix.length) : given) ||
    slug(name);
  if (!value) {
    throw new Error(`a ${kind} needs an id or a name`);
  }
  return value;
};

/** `audience:<id>` — a saved audience; `id` defaults to the name's slug. */
export const audienceLink = ({ id, name, spec, at = new Date() }) => {
  const key = linkId(id, name, 'saved audience', AUDIENCE_PREFIX);
  const resolved = toAudienceSpec(spec);
  return {
    id: `${AUDIENCE_PREFIX}${key}`,
    tokens: ['audience', key],
    kind: 'audience',
    name: name ?? key,
    spec: resolved,
    text: formatAudienceSpec(resolved),
    at: new Date(at).toISOString(),
  };
};

/** `list:<id>` — a hand-picked list of `<source>:<user>` keys. */
export const listLink = ({ id, name, members, at = new Date() }) => {
  const key = linkId(id, name, 'list', LIST_PREFIX);
  if (!Array.isArray(members)) {
    throw new Error('a list needs "members": ["<source>:<user>", ...]');
  }
  return {
    id: `${LIST_PREFIX}${key}`,
    tokens: ['list', key],
    kind: 'list',
    name: name ?? key,
    members: [...new Set(members.map((k) => stubPerson(k).key))],
    at: new Date(at).toISOString(),
  };
};

// ---------------------------------------------------------------------
// Text form
//
//   union := tight ("|" tight)*
//   tight := primary (("&" | "-") primary)*     left to right
//   primary := "(" union ")" | atom
//
// Atoms: all, personal[:<source>], friends[:<source>],
// chat:<source>:<chat>, community:<source>:<id>, list:<id>,
// audience:<id>, person:<source>:<user>, q:"<audience DSL>". Any part
// of an atom may be a JSON string ("a b"). A "-" starts an operator only
// at the beginning of a token, so `list:do-not-write` stays one atom.

const OPERATORS = { '&': 'intersect', '|': 'union', '-': 'difference' };
const SYMBOLS = { intersect: '&', union: '|', difference: '-' };
const ATOM_END = /[\s&|()]/;

const readQuoted = (src, i) => {
  const m = src.slice(i).match(/^"(?:[^"\\]|\\.)*"/);
  if (!m) {
    throw new Error(`unterminated quote at ${i}`);
  }
  try {
    return { value: JSON.parse(m[0]), end: i + m[0].length };
  } catch {
    throw new Error(`bad escape in the quoted text at ${i}`);
  }
};

const readAtom = (src, start) => {
  let i = start;
  let value = '';
  while (i < src.length && !ATOM_END.test(src[i])) {
    if (src[i] === '"') {
      const quoted = readQuoted(src, i);
      value += quoted.value;
      i = quoted.end;
    } else {
      value += src[i];
      i += 1;
    }
  }
  return { token: { type: 'atom', value, at: start }, end: i };
};

const lex = (text) => {
  const src = String(text ?? '');
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    if (/\s/.test(src[i])) {
      i += 1;
    } else if ('&|-()'.includes(src[i])) {
      tokens.push({ type: src[i], at: i });
      i += 1;
    } else {
      const { token, end } = readAtom(src, i);
      tokens.push(token);
      i = end;
    }
  }
  return tokens;
};

const optionalSource = (kind) => (rest) =>
  rest ? { kind, source: rest } : { kind };

const sourceAnd =
  (atom, field, kind = atom) =>
  (rest) => {
    const parts = splitPersonKey(rest);
    if (!parts) {
      throw new Error(`"${atom}" needs <source>:<${field}>`);
    }
    return kind === 'people'
      ? { kind, keys: [personKey(parts.source, parts.user)] }
      : { kind, source: parts.source, [field]: parts.user };
  };

const valueAtom = (atom, field, kind) => (rest) => {
  if (!rest) {
    throw new Error(`"${atom}" needs a value: ${atom}:<${field}>`);
  }
  return { kind, [field]: rest };
};

const ATOMS = {
  all: (rest) => {
    if (rest) {
      throw new Error('"all" takes no value');
    }
    return { kind: 'all' };
  },
  personal: optionalSource('personal'),
  friends: optionalSource('friends'),
  chat: sourceAnd('chat', 'chat'),
  community: sourceAnd('community', 'community'),
  person: sourceAnd('person', 'user', 'people'),
  list: valueAtom('list', 'id', 'list'),
  audience: valueAtom('audience', 'id', 'saved'),
  q: valueAtom('q', 'q', 'query'),
};

const atomSpec = ({ value: text, at }) => {
  const colon = text.indexOf(':');
  const name = colon < 0 ? text : text.slice(0, colon);
  if (!Object.hasOwn(ATOMS, name)) {
    throw new Error(
      `unknown audience "${text}" at ${at}; known: ${Object.keys(ATOMS).join(', ')}`
    );
  }
  return ATOMS[name](colon < 0 ? '' : text.slice(colon + 1));
};

const describeToken = (t) =>
  t.type === 'atom' ? `"${t.value}" at ${t.at}` : `"${t.type}" at ${t.at}`;

/**
 * Text → spec. `-` and `&` bind tighter than `|` and read left to
 * right, so `a & b - c | d` is `((a & b) - c) | d`; a run of the same
 * operator becomes one combinator (`a & b & c` → `intersect` of three).
 */
export const parseAudienceSpec = (text) => {
  const tokens = lex(text);
  if (tokens.length === 0) {
    throw new Error('the audience text is empty');
  }
  let i = 0;
  const chain = (operand, ops) => {
    let left = operand();
    let built = null;
    while (tokens[i] && ops.includes(tokens[i].type)) {
      const kind = OPERATORS[tokens[i].type];
      i += 1;
      const right = operand();
      if (left === built && left.kind === kind) {
        left.of.push(right);
      } else {
        built = { kind, of: [left, right] };
        left = built;
      }
    }
    return left;
  };
  const primary = () => {
    const t = tokens[i];
    i += 1;
    if (!t) {
      throw new Error('the audience ends where a group or a list is expected');
    }
    if (t.type === 'atom') {
      return atomSpec(t);
    }
    if (t.type !== '(') {
      throw new Error(`unexpected ${describeToken(t)}`);
    }
    const inner = unionExpr();
    if (tokens[i]?.type !== ')') {
      throw new Error(`missing ")" for the "(" at ${t.at}`);
    }
    i += 1;
    return inner;
  };
  const tight = () => chain(primary, ['&', '-']);
  const unionExpr = () => chain(tight, ['|']);
  const spec = unionExpr();
  if (i < tokens.length) {
    throw new Error(`unexpected ${describeToken(tokens[i])}`);
  }
  return spec;
};

const quote = (text) => {
  const s = String(text);
  return /^[^\s&|()"]+$/.test(s) ? s : JSON.stringify(s);
};

const withSource = (atom) => (s) =>
  s.source ? `${atom}:${quote(s.source)}` : atom;

const FORMATTERS = {
  all: () => 'all',
  personal: withSource('personal'),
  friends: withSource('friends'),
  chat: (s) => `chat:${quote(s.source)}:${quote(s.chat)}`,
  community: (s) => `community:${quote(s.source)}:${quote(s.community)}`,
  list: (s) => `list:${quote(s.id)}`,
  saved: (s) => `audience:${quote(s.id)}`,
  query: (s) => `q:${JSON.stringify(String(s.q))}`,
  people: (s) => {
    const atoms = (s.keys ?? []).map((k) => `person:${quote(k)}`);
    if (atoms.length === 0) {
      throw new Error('an empty "people" audience has no text form');
    }
    return atoms.length === 1 ? atoms[0] : `(${atoms.join(' | ')})`;
  },
};

const isCombinator = (spec) => Object.hasOwn(SYMBOLS, spec?.kind ?? '');

/**
 * Spec → text, the inverse of `parseAudienceSpec`. Nested combinators
 * are parenthesised (except `&`/`-` inside `|`, which bind tighter), so
 * the text parses back to the same tree. A `people` spec with several
 * keys comes back as a union of `person:` atoms.
 */
export const formatAudienceSpec = (spec) => {
  if (isCombinator(spec)) {
    const parts = (spec.of ?? []).map((child) => {
      const text = formatAudienceSpec(child);
      const bare =
        !isCombinator(child) ||
        (spec.kind === 'union' && child.kind !== 'union');
      return bare ? text : `(${text})`;
    });
    return parts.join(` ${SYMBOLS[spec.kind]} `);
  }
  const kind = spec?.kind ?? '';
  if (typeof kind !== 'string' || !Object.hasOwn(FORMATTERS, kind)) {
    throw new Error(`unknown audience kind "${spec?.kind}"`);
  }
  return FORMATTERS[kind](spec);
};
