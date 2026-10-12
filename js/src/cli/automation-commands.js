/**
 * Automations from the terminal (issue #31 / PR #34) — the same engine
 * as the server and the chat menu (`../automation/runner.js`):
 *
 * - `automations` / `automations list` — saved automations and presets.
 * - `automations plan <id>` — who would get what, and why the rest are
 *   left out. Nothing is written.
 * - `automations run <id>` — safe mode queues one draft per person; auto
 *   mode shows the planned messages and sends exactly those (typing,
 *   pacing, daily cap) after a y on the terminal, or with `--yes`
 *   (`--confirm=true`) in scripts.
 * - `automations review` — safe (debug) mode: one pending draft at a
 *   time; each is sent only after the user answers `y`, and can be
 *   edited, switched to the other "ты"/"вы" form, marked as sent by
 *   hand, or skipped.
 * - `automations drafts | history | save <file.json> | delete <id>`.
 *
 * `--chat=vk:101,telegram:5` narrows a plan or run to chosen chats (what
 * the chat menu does); with `--test` the conditions are ignored there.
 */

import { promises as fs } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { getSource } from '../sources/index.js';
import { createDefaultSender } from '../sources/browser-sender.js';
import { setTypingFor } from '../sources/live-links.js';
import {
  AUTOMATION_PREFIX,
  normalizeAutomation,
} from '../automation/automations.js';
import { listAutomations } from '../automation/drafts.js';
import { createAutomationRunner } from '../automation/runner.js';
import { confirmCli } from './confirm.js';

export const AUTOMATION_HELP = `  automations   [list] | plan <id> | run <id> | review | drafts | history | save <file.json> | delete <id>
                [--chat=<source:chat,...>] [--test] [--limit=<n>] [--self=<id,id>] [--automation=<id>] [--json] [--store=<dir>]
                run: safe mode queues drafts; auto mode shows the plan and sends after y (or --yes)
                review: safe mode — send, edit, switch ты/вы, mark sent or skip one draft at a time`;

const parseCsv = (value) =>
  typeof value === 'string' && value.trim()
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

// `--chat=vk:101` → `{ source: 'vk', chat: '101' }`.
const parseTargets = (value) => {
  const targets = parseCsv(value).map((item) => {
    const at = item.indexOf(':');
    if (at <= 0 || at === item.length - 1) {
      throw new Error(`--chat expects source:chat, got "${item}"`);
    }
    return { source: item.slice(0, at), chat: item.slice(at + 1) };
  });
  return targets.length ? targets : undefined;
};

// A shell cannot easily pass a newline, so `\n` stands for one.
const unescapeText = (value) => String(value).replace(/\\n/g, '\n');

const indent = (text) =>
  String(text)
    .split('\n')
    .map((line) => (line ? `    ${line}` : ''))
    .join('\n');

const FORM_LABEL = { informal: 'ты', formal: 'вы', neutral: '—' };

const describeDraft = (draft) => {
  const af = draft.addressForm ?? { reason: 'chosen' };
  const silent = Number.isFinite(draft.daysSilent)
    ? `silent ${draft.daysSilent} days`
    : 'never talked';
  const share =
    af.reason === 'majority' ? ` ${Math.round(af.confidence * 100)}%` : '';
  return (
    `${draft.source}:${draft.chat} ${draft.name ?? draft.contact ?? ''} — ` +
    `${silent}, ${draft.messageCount ?? 0} messages, ` +
    `${FORM_LABEL[draft.form] ?? draft.form} (${af.reason}${share})`
  );
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

const runOptions = (args) => ({
  targets: parseTargets(args.chat),
  test: args.test === true || args.test === 'true',
  limit: args.limit !== undefined ? Number(args.limit) : undefined,
});

const idArg = (args) => {
  const id = args._[1] ?? args.automation ?? args.id;
  if (!id) {
    throw new Error('which automation? pass its id (see `automations list`)');
  }
  return id;
};

const listCmd = async ({ store, log }) => {
  for (const a of await listAutomations(store)) {
    if (a.invalid) {
      log(`${a.id}\tinvalid: ${a.invalid}`);
      continue;
    }
    const triggers = a.triggers.map((t) => t.kind).join('+');
    const state = a.enabled ? '' : ' (off)';
    log(
      `${a.id}\t${a.mode}\t${triggers}${state}\t${a.name}` +
        `${a.saved ? '' : '\t[preset]'}`
    );
  }
  return 0;
};

const logPlan = (plan, log) => {
  log(`${plan.name}: ${plan.total} to message (preview — nothing was sent)`);
  plan.drafts.forEach((draft, i) => {
    log(`${i + 1}. ${describeDraft(draft)}`);
    log(indent(draft.text));
  });
  const reasons = {};
  for (const { reason } of plan.excluded) {
    reasons[reason] = (reasons[reason] ?? 0) + 1;
  }
  const summary = Object.entries(reasons)
    .map(([reason, n]) => `${reason}×${n}`)
    .join(', ');
  if (summary) {
    log(`left out: ${summary}`);
  }
};

const planCmd = async ({ args, runner, log }) => {
  const automation = await runner.load(idArg(args));
  const plan = await runner.plan(automation, runOptions(args));
  if (args.json) {
    log(JSON.stringify(plan, null, 2));
    return 0;
  }
  logPlan(plan, log);
  return 0;
};

const isConfirmed = (args) => args.confirm === true || args.confirm === 'true';

// Auto mode sends: show the planned messages and send exactly those
// once confirmed (`--confirm=true`/`--yes`, or y on a terminal).
const confirmedDrafts = async ({ args, runner, log, automation, ask }) => {
  const plan = await runner.plan(automation, runOptions(args));
  if (!args.json) {
    logPlan(plan, log);
  }
  const ok = await confirmCli(`Send ${plan.drafts.length} message(s) now?`, {
    args: { yes: isConfirmed(args) || args.yes },
    log,
    ask,
  });
  return ok ? plan.drafts : null;
};

const runCmd = async ({ args, runner, log, confirmAsk }) => {
  const automation = await runner.load(idArg(args));
  const confirmed =
    automation.mode === 'auto'
      ? await confirmedDrafts({
          args,
          runner,
          log,
          automation,
          ask: confirmAsk,
        })
      : undefined;
  if (confirmed === null) {
    return 1;
  }
  const result = await runner.run(automation, {
    ...runOptions(args),
    trigger: 'manual',
    confirmed,
  });
  if (args.json) {
    log(JSON.stringify(result, null, 2));
    return 0;
  }
  if (result.queued) {
    log(`${result.queued.length} draft(s) queued; review them one by one:`);
    log('  automations review');
    return 0;
  }
  for (const outcome of result.results) {
    log(
      `${outcome.status}\t${outcome.draft.source}:${outcome.draft.chat}` +
        `${outcome.error ? `\t${outcome.error}` : ''}`
    );
  }
  if (result.capped) {
    log(`${result.capped} left for tomorrow (daily cap)`);
  }
  return result.results.some((r) => r.status === 'failed') ? 1 : 0;
};

const draftFilter = (args) => {
  const [target] = parseTargets(args.chat) ?? [];
  return { ...target, automation: args.automation };
};

const draftsCmd = async ({ args, runner, log }) => {
  const drafts = await runner.drafts(draftFilter(args));
  if (args.json) {
    log(JSON.stringify(drafts, null, 2));
    return 0;
  }
  log(`${drafts.length} pending draft(s)`);
  for (const draft of drafts) {
    log(`${draft.id}\t${draft.automationName ?? draft.automation}`);
    log(indent(draft.text));
  }
  return 0;
};

const historyCmd = async ({ args, runner, log }) => {
  const records = await runner.history({ automation: args.automation });
  if (args.json) {
    log(JSON.stringify(records, null, 2));
    return 0;
  }
  for (const r of records) {
    log(
      `${r.at}\t${r.status}${r.manual ? ' (by you)' : ''}\t` +
        `${r.source}:${r.chat}\t${r.automation}`
    );
  }
  return 0;
};

const saveCmd = async ({ args, store, log }) => {
  const file = args._[1] ?? args.file;
  if (!file) {
    throw new Error('automations save <file.json>');
  }
  const automation = normalizeAutomation(
    JSON.parse(await fs.readFile(file, 'utf8'))
  );
  await store.put(automation);
  log(`saved ${automation.id}`);
  return 0;
};

const deleteCmd = async ({ args, store, log }) => {
  const key = idArg(args);
  const id = key.startsWith(AUTOMATION_PREFIX)
    ? key
    : `${AUTOMATION_PREFIX}${key}`;
  await store.delete(id);
  log(`deleted ${id}`);
  return 0;
};

const PROMPT =
  '[y] send  [m] I sent it myself  [e] edit  [f] switch ты/вы  [s] skip  [q] quit > ';

const logOutcome = (outcome, log, tally) => {
  if (outcome.status === 'failed') {
    tally.failed += 1;
    log(`! not sent: ${outcome.error} — retry, edit, mark or skip`);
    return false;
  }
  tally[outcome.status] += 1;
  log(`${outcome.status}${outcome.record?.manual ? ' (by you)' : ''}`);
  return true;
};

/** One answer for the draft on screen; returns the next state. */
const reviewStep = async ({ draft, answer, runner, ask, log, tally }) => {
  switch (answer.trim().toLowerCase()) {
    case 'y': {
      const outcome = await runner.sendDraft(draft.id, {
        confirm: true,
        text: draft.text,
      });
      return { done: logOutcome(outcome, log, tally) };
    }
    case 'm':
      return { done: logOutcome(await runner.markSent(draft.id), log, tally) };
    case 's':
      return { done: logOutcome(await runner.skip(draft.id), log, tally) };
    case 'e': {
      const text = await ask('new text (\\n for a line break) > ');
      return {
        draft: text.trim() ? { ...draft, text: unescapeText(text) } : draft,
      };
    }
    case 'f': {
      const form = draft.form === 'formal' ? 'informal' : 'formal';
      return { draft: await runner.setDraftForm(draft.id, form) };
    }
    case 'q':
      return { quit: true };
    default:
      log('?');
      return {};
  }
};

const reviewCmd = async ({ args, runner, log, ask }) => {
  const queue = await runner.drafts(draftFilter(args));
  const tally = { sent: 0, skipped: 0, failed: 0 };
  log(`safe mode: ${queue.length} draft(s), one message per "y"`);
  let left = queue.length;
  for (const [i, pending] of queue.entries()) {
    let draft = pending;
    for (;;) {
      log(`\n[${i + 1}/${queue.length}] ${describeDraft(draft)}`);
      log(indent(draft.text));
      if (draft.prefill?.url) {
        log(`    open: ${draft.prefill.url}`);
      }
      const answer = await ask(PROMPT);
      const step = await reviewStep({ draft, answer, runner, ask, log, tally });
      if (step.quit) {
        log(summaryLine(tally, left));
        return 0;
      }
      draft = step.draft ?? draft;
      if (step.done) {
        left -= 1;
        break;
      }
    }
  }
  log(summaryLine(tally, left));
  return 0;
};

const summaryLine = (tally, left) =>
  `sent ${tally.sent}, skipped ${tally.skipped}, failed ${tally.failed}, left ${left}`;

const SUBCOMMANDS = {
  list: listCmd,
  plan: planCmd,
  run: runCmd,
  review: reviewCmd,
  drafts: draftsCmd,
  history: historyCmd,
  save: saveCmd,
  delete: deleteCmd,
};

const runnerFor = (store, args, deps) => {
  const send = deps.send ?? createDefaultSender({ getSource, log: deps.trace });
  const setTyping =
    deps.setTyping ??
    (({ source, chat }) =>
      setTypingFor(getSource, { source, chat }).catch(() => null));
  const now = args.now ? new Date(args.now) : null;
  const runner = createAutomationRunner({
    store,
    send,
    setTyping,
    self: parseCsv(args.self),
    ...(now ? { clock: () => now } : {}),
    ...(deps.sleep ? { sleep: deps.sleep } : {}),
  });
  return { runner, close: () => send.close?.() };
};

const automationsCmd = async (args, log, deps) => {
  const sub = args._[0] ?? 'list';
  const handler = SUBCOMMANDS[sub];
  if (!handler) {
    log(`unknown subcommand "${sub}"\n${AUTOMATION_HELP}`);
    return 1;
  }
  const store = await deps.openStore(args.store ?? '.meta-sovereign');
  const { runner, close } = runnerFor(store, args, deps);
  try {
    return await handler({
      args,
      store,
      runner,
      log,
      ask: deps.ask ?? defaultAsk,
      // y/N before sending (tests answer it; otherwise the terminal).
      confirmAsk: deps.confirm ?? null,
    });
  } finally {
    await close();
  }
};

/**
 * @param {object} deps
 * @param {Function} deps.openStore directory → store
 * @param {Function} [deps.ask] question → answer (tests script the answers)
 * @param {Function} [deps.confirm] question → boolean before a send
 * @param {Function} [deps.send] draft → result (defaults to the adapters
 *   with the official web UI as the fallback)
 * @param {Function} [deps.setTyping] `{ source, chat }` → typing shown
 * @param {Function} [deps.sleep] ms → promise (tests skip the pacing)
 */
export const createAutomationCommands = (deps) => ({
  automations: async (args, log) => {
    try {
      return await automationsCmd(args, log, deps);
    } catch (error) {
      log(`error: ${error.message}`);
      return 1;
    }
  },
});
