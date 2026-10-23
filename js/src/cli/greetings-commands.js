/**
 * Greeting subcommands (issue #35).
 *
 * The terminal gets the same surface as `/api/greetings/*`: browse the
 * built-in or live sticker catalogue, save which stickers and phrases
 * to greet with, preview a plan and send it. Sending pauses between
 * messages the way konard/vk-bot does (30 s by default) so a batch of
 * greetings does not look like a burst of spam.
 *
 * The command map is built by a factory so the CLI entry point injects
 * its own `openStore`, and the tests inject fake source adapters.
 */

import { parseList } from './cv-commands.js';
import { getSource } from '../sources/index.js';
import {
  greetingCatalogue,
  greetingNetworks,
  listLiveGreetingStickers,
  loadGreetingCredentials,
  loadGreetingSelection,
  planFromStore,
  previewGreetings,
  runGreetings,
  saveGreetingSelection,
  vkStickerPreview,
} from '../greetings/index.js';
import { confirmCli } from './confirm.js';

export const GREETINGS_HELP = `  greetings-stickers [--live] [--networks=vk,telegram] [--json] [--store=<dir>]
  greetings-select   [--stickers=vk:21,facebook:<id>] [--sets=<a,b>] [--language=en|ru|zh|hi|vi] [--prefer=sticker|text] [--json] [--store=<dir>]
  greetings-plan     [--mode=initiate|reply] [--networks=<a,b>] [--me=<id,id>] [--limit=<n>] [--stale-days=<n>] [--json] [--store=<dir>]
  greetings-send     (greetings-plan flags) [--delay-ms=<ms>] [--daily-cap=<n>] [--max-per-run=<n>] [--dry-run] [--json] [--store=<dir>]`;

/** vk-bot waits 30 s between greetings. */
export const DEFAULT_SEND_DELAY_MS = 30_000;

const optionalNumber = (value) =>
  value === undefined ? undefined : Number(value);

const asJson = (value) => JSON.stringify(value, null, 2);

const storeOf = (args, openStore) => openStore(args.store ?? '.meta-sovereign');

/**
 * `--stickers=vk:21,facebook:369239263222822` → selection entries. The
 * first colon splits network from id, so Telegram file ids survive.
 */
export const parseStickerList = (value) =>
  (parseList(value) ?? []).map((item) => {
    const at = item.indexOf(':');
    if (at <= 0) {
      throw new Error(`sticker "${item}" must look like <network>:<id>`);
    }
    const network = item.slice(0, at);
    const id = item.slice(at + 1);
    if (!greetingNetworks[network]) {
      throw new Error(`unknown greeting network "${network}"`);
    }
    return {
      network,
      id,
      previewUrl: network === 'vk' ? vkStickerPreview(id) : null,
    };
  });

/** Plan options shared by `greetings-plan` and `greetings-send`. */
export const planOptions = (args) => ({
  mode: args.mode === 'reply' ? 'reply' : 'initiate',
  networks: parseList(args.networks),
  me: parseList(args.me),
  // 1–100: a typo must never mean "everyone".
  limit: Math.min(Math.max(Math.trunc(Number(args.limit ?? 10)) || 10, 1), 100),
  staleDays: Number(args['stale-days'] ?? 30),
});

const stickerLine = (sticker) =>
  [
    sticker.network,
    sticker.id,
    sticker.emoji ?? '',
    sticker.pack ?? sticker.packTitle ?? '',
    sticker.previewUrl ?? sticker.addUrl ?? '',
  ].join('\t');

const stickersCmd = async (args, log, deps) => {
  if (!args.live) {
    const catalogue = greetingCatalogue();
    if (args.json) {
      log(asJson(catalogue));
      return 0;
    }
    for (const sticker of Object.values(catalogue.stickers).flat()) {
      log(stickerLine(sticker));
    }
    for (const set of catalogue.telegram.sets) {
      log(`telegram\tset ${set.name}\t\t\t${set.addUrl}`);
    }
    return 0;
  }
  const store = await storeOf(args, deps.openStore);
  const result = await listLiveGreetingStickers({
    networks: parseList(args.networks) ?? ['vk', 'telegram'],
    selection: await loadGreetingSelection(store),
    resolveSource: deps.resolveSource,
    credentials: await loadGreetingCredentials(store),
  });
  if (args.json) {
    log(asJson(result));
  } else {
    result.stickers.forEach((sticker) => log(stickerLine(sticker)));
    for (const failure of result.failures) {
      log(
        `! ${failure.network}${failure.pack ? ` ${failure.pack}` : ''}: ${failure.error}`
      );
    }
  }
  return result.stickers.length === 0 && result.failures.length ? 1 : 0;
};

const selectionInput = (args, current) => ({
  ...current,
  ...(args.stickers ? { stickers: parseStickerList(args.stickers) } : {}),
  ...(args.sets ? { telegramSets: parseList(args.sets) ?? [] } : {}),
  ...(args.language ? { language: args.language } : {}),
  ...(args.prefer ? { prefer: args.prefer } : {}),
});

const selectCmd = async (args, log, deps) => {
  const store = await storeOf(args, deps.openStore);
  const current = await loadGreetingSelection(store);
  const changed = ['stickers', 'sets', 'language', 'prefer'].some(
    (key) => args[key] !== undefined
  );
  const selection = changed
    ? await saveGreetingSelection(store, selectionInput(args, current))
    : current;
  if (args.json) {
    log(asJson(selection));
    return 0;
  }
  log(`language ${selection.language}, prefer ${selection.prefer}`);
  selection.stickers.forEach((sticker) => log(`  ${stickerLine(sticker)}`));
  log(`  telegram sets: ${selection.telegramSets.join(', ') || '(none)'}`);
  return 0;
};

const envelopeLine = (envelope) => {
  const what =
    envelope.kind === 'sticker'
      ? `sticker ${envelope.sticker?.id ?? envelope.sticker?.url}`
      : `text ${JSON.stringify(envelope.text)}`;
  const skipped = envelope.skipped ? `\tskipped: ${envelope.skipped}` : '';
  return `${envelope.network}\t${envelope.chat}\t${envelope.language}\t${what}${skipped}`;
};

const planCmd = async (args, log, deps) => {
  const store = await storeOf(args, deps.openStore);
  const plan = await planFromStore(store, planOptions(args));
  if (args.json) {
    log(asJson(plan));
    return 0;
  }
  log(`${plan.mode}: ${plan.envelopes.length} chats`);
  plan.envelopes.forEach((envelope) => log(`  ${envelopeLine(envelope)}`));
  return 0;
};

const sendCmd = async (args, log, deps) => {
  const store = await storeOf(args, deps.openStore);
  const plan = await planFromStore(store, planOptions(args));
  const pace = {
    delayMs: Number(args['delay-ms'] ?? DEFAULT_SEND_DELAY_MS),
    dailyCap: optionalNumber(args['daily-cap']),
    maxPerRun: optionalNumber(args['max-per-run']),
  };
  // Show who gets what, then send exactly this plan once confirmed.
  plan.envelopes.forEach((envelope) => log(`  ${envelopeLine(envelope)}`));
  if (args['dry-run']) {
    // Exactly who would get what; nothing is sent or recorded (R-Z3).
    const preview = await previewGreetings(plan, { store, ...pace });
    log(asJson(preview));
    return 0;
  }
  const ok = await confirmCli(`Send ${plan.envelopes.length} greeting(s)?`, {
    args,
    log,
    ask: deps.ask,
  });
  if (!ok) {
    return 1;
  }
  const results = await runGreetings(plan, {
    store,
    resolveSource: deps.resolveSource,
    credentials: await loadGreetingCredentials(store),
    ...pace,
    ...(deps.sleep ? { sleep: deps.sleep } : {}),
    ...(deps.random ? { random: deps.random } : {}),
  });
  if (args.json) {
    log(asJson({ plan, results }));
  } else {
    for (const result of results) {
      const status = result.ok ? 'sent' : `! ${result.error}`;
      log(`${status}\t${envelopeLine(result)}`);
    }
  }
  return results.some((r) => !r.ok && !r.skipped) ? 1 : 0;
};

/** Bad flags and unreachable networks become a message, not a trace. */
const guarded = (fn, deps) => async (args, log) => {
  try {
    return await fn(args, log, deps);
  } catch (error) {
    log(`error: ${error.message}`);
    return 1;
  }
};

/**
 * @param {object} deps
 * @param {Function} deps.openStore directory → store
 * @param {Function} [deps.resolveSource] source name → adapter, for tests
 * @param {Function} [deps.sleep] pause between sends, for tests
 * @param {Function} [deps.random] jitter source, for tests
 */
export const createGreetingCommands = ({
  openStore,
  resolveSource = getSource,
  sleep = null,
  random = null,
}) => {
  const deps = { openStore, resolveSource, sleep, random };
  return {
    'greetings-stickers': guarded(stickersCmd, deps),
    'greetings-select': guarded(selectCmd, deps),
    'greetings-plan': guarded(planCmd, deps),
    'greetings-send': guarded(sendCmd, deps),
  };
};
