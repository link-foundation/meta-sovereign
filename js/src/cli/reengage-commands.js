/**
 * Re-engage subcommands (issue #31, R-X8).
 *
 * `reengage` previews the plan: every personal contact silent for at
 * least `--days` (90), the "ты"/"вы" form detected in the dialog and
 * the text that would be sent. Nothing is sent without one of:
 *
 * - `--interactive` — safe (debug) mode: one draft at a time; each is
 *   sent only after the user answers `y`, and can be edited, switched
 *   to the other form, marked as sent by hand, or skipped.
 * - `--mode=batch --confirm=true` — send the whole plan in one go.
 *
 * Every decision is stored as a `reengage:<source>:<chat>` link, so the
 * next run does not offer the same contact again.
 */

import { promises as fs } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { getSource } from '../sources/index.js';
import {
  createAdapterSender,
  createReengageSession,
  defaultReengageTemplates,
  normalizeReengageMode,
  planReengagement,
} from '../crm/reengage.js';

export const REENGAGE_HELP = `  reengage      [--days=<90>] [--self=<id,id>] [--networks=vk,telegram] [--limit=<n>] [--informal=<text>] [--formal=<text>] [--templates=<file.json>] [--json] [--store=<dir>]
                [--interactive]  safe mode: confirm, edit, switch ты/вы, mark sent or skip one message at a time
                [--mode=batch --confirm=true]  send every draft without asking`;

const parseCsv = (value) =>
  typeof value === 'string' && value.trim()
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

// `--informal="Привет\n\nКак дела?"` — a shell cannot easily pass a
// newline, so the two-character escape stands for one.
const unescapeText = (value) => String(value).replace(/\\n/g, '\n');

export const loadReengageTemplates = async (args) => {
  const fromFile = args.templates
    ? JSON.parse(await fs.readFile(args.templates, 'utf8'))
    : {};
  const templates = { ...defaultReengageTemplates, ...fromFile };
  for (const form of ['informal', 'formal']) {
    if (typeof args[form] === 'string') {
      templates[form] = unescapeText(args[form]);
    }
  }
  return templates;
};

const planOptions = async (args) => ({
  days: args.days !== undefined ? Number(args.days) : undefined,
  self: parseCsv(args.self),
  networks: parseCsv(args.networks).length ? parseCsv(args.networks) : null,
  limit: args.limit !== undefined ? Number(args.limit) : undefined,
  now: args.now ? Date.parse(args.now) : undefined,
  templates: await loadReengageTemplates(args),
  requireMutual: args['include-unanswered'] !== true,
});

const FORM_LABEL = { informal: 'ты', formal: 'вы' };

const describeDraft = (draft) => {
  const af = draft.addressForm;
  const evidence = Object.entries(af.rules)
    .map(([rule, count]) => `${rule}×${count}`)
    .join(', ');
  return (
    `${draft.source}:${draft.chat} ${draft.name ?? draft.contact} — ` +
    `silent ${draft.daysSilent} days, ${draft.messageCount} messages, ` +
    `${FORM_LABEL[draft.form] ?? draft.form} (${af.reason}` +
    `${af.reason === 'majority' ? ` ${Math.round(af.confidence * 100)}%` : ''}` +
    `${evidence ? `: ${evidence}` : ''})`
  );
};

const indent = (text) =>
  String(text)
    .split('\n')
    .map((line) => (line ? `    ${line}` : ''))
    .join('\n');

const previewPlan = (plan, log) => {
  log(
    `${plan.total} personal contact(s) silent for ≥ ${plan.days} days ` +
      `(preview — nothing was sent)`
  );
  plan.drafts.forEach((draft, i) => {
    log(`${i + 1}. ${describeDraft(draft)}`);
    log(indent(draft.text));
  });
  if (plan.excluded.length) {
    log(`${plan.excluded.length} skipped: contacted or skipped recently`);
  }
  log('send one at a time: reengage --interactive');
  return 0;
};

const defaultAsk = async (question) => {
  const rl = createInterface({
    input: globalThis.process.stdin,
    output: globalThis.process.stdout,
  });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
};

const PROMPT =
  '[y] send  [m] I sent it myself  [e] edit  [f] switch ты/вы  [s] skip  [q] quit > ';

const showCurrent = (session, log) => {
  const draft = session.current();
  const { position, total } = session.progress();
  log(`\n[${position + 1}/${total}] ${describeDraft(draft)}`);
  log(indent(draft.text));
  if (draft.prefill) {
    log(`    open: ${draft.prefill.url}`);
  }
};

const logOutcome = (outcome, log) => {
  if (outcome.status === 'failed') {
    log(`! not sent: ${outcome.error} — retry, edit, mark or skip`);
    return;
  }
  log(`${outcome.status}${outcome.record.manual ? ' (by you)' : ''}`);
};

const interactiveStep = async (session, answer, ask, log) => {
  switch (answer.trim().toLowerCase()) {
    case 'y':
      logOutcome(await session.confirm(), log);
      return true;
    case 'm':
      logOutcome(await session.markSent(), log);
      return true;
    case 's':
      logOutcome(await session.skip(), log);
      return true;
    case 'e': {
      const text = await ask('new text (\\n for a line break) > ');
      if (text.trim()) {
        session.edit(unescapeText(text));
      }
      return true;
    }
    case 'f': {
      const next = session.current().form === 'formal' ? 'informal' : 'formal';
      session.setForm(next);
      return true;
    }
    case 'q':
      return false;
    default:
      log('?');
      return true;
  }
};

const interactive = async ({ plan, templates, send, store, ask, log }) => {
  const session = createReengageSession({
    drafts: plan.drafts,
    mode: 'safe',
    send,
    templates,
    record: (link) => store.put(link),
  });
  log(`safe mode: ${plan.drafts.length} draft(s), one message per "y"`);
  while (session.current()) {
    showCurrent(session, log);
    const keepGoing = await interactiveStep(
      session,
      await ask(PROMPT),
      ask,
      log
    );
    if (!keepGoing) {
      break;
    }
  }
  const p = session.progress();
  log(
    `sent ${p.sent}, skipped ${p.skipped}, failed ${p.failed}, left ${p.remaining}`
  );
  return 0;
};

const batch = async ({ plan, templates, send, store, log }) => {
  const session = createReengageSession({
    drafts: plan.drafts,
    mode: 'batch',
    send,
    templates,
    record: (link) => store.put(link),
  });
  for (const outcome of await session.sendAll()) {
    log(
      `${outcome.status}\t${outcome.draft.source}:${outcome.draft.chat}` +
        `${outcome.error ? `\t${outcome.error}` : ''}`
    );
  }
  return session.progress().failed > 0 ? 1 : 0;
};

const reengageCmd = async (args, log, deps) => {
  const store = await deps.openStore(args.store ?? '.meta-sovereign');
  const options = await planOptions(args);
  const mode = normalizeReengageMode(args.mode ?? 'safe');
  const plan = planReengagement(await store.query(), { ...options, mode });
  if (args.json) {
    log(JSON.stringify(plan, null, 2));
    return 0;
  }
  const ctx = {
    plan,
    templates: options.templates,
    send: deps.send ?? createAdapterSender({ getSource }),
    store,
    ask: deps.ask ?? defaultAsk,
    log,
  };
  if (mode === 'batch') {
    if (args.confirm !== 'true' && args.confirm !== true) {
      log('batch mode sends every draft at once; add --confirm=true');
      return 1;
    }
    return batch(ctx);
  }
  if (args.interactive) {
    return interactive(ctx);
  }
  return previewPlan(plan, log);
};

/**
 * @param {object} deps
 * @param {Function} deps.openStore directory → store
 * @param {Function} [deps.ask] question → answer (tests script the answers)
 * @param {Function} [deps.send] draft → result (defaults to the adapters)
 */
export const createReengageCommands = (deps) => ({
  reengage: async (args, log) => {
    try {
      return await reengageCmd(args, log, deps);
    } catch (error) {
      log(`error: ${error.message}`);
      return 1;
    }
  },
});
