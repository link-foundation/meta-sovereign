import { promises as fs } from 'node:fs';
import { decodeWire, encodeLinoValue } from '../transport/lino.js';
import {
  listAnswerRules,
  saveAnswerRule,
  deleteAnswerRule,
  previewAnswer,
  learnSavedAnswers,
} from '../automation/question-store.js';
import {
  readAnswerPolicy,
  saveAnswerPolicy,
  updateAnswerPolicy,
} from '../automation/question-policy.js';
import { salaryExchange } from '../automation/salary-exchange.js';

const csv = (value) =>
  String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
const readAnswerFile = async (file) => {
  if ((await fs.stat(file)).size > 4 * 1024 ** 2) {
    throw new Error('answer configuration exceeds 4 MiB');
  }
  const text = await fs.readFile(file, 'utf8');
  return file.endsWith('.json') ? JSON.parse(text) : decodeWire(text);
};
const answerInput = async (args) => {
  const file = args._[2];
  if (file) {
    return readAnswerFile(file);
  } else {
    return {
      id: args.id,
      question: args.question,
      sources: csv(args.sources),
      chats: csv(args.chats),
      answers: [
        {
          text: args.answer,
          count: 0,
          approved: args.approved === true || args.approved === 'true',
          canonical: args.canonical === true || args.canonical === 'true',
        },
      ],
    };
  }
};

const policyCommand = async (args, store) => {
  if (args._[2]) {
    return saveAnswerPolicy(store, await answerInput(args));
  }
  const clear =
    args['clear-rejected'] === true || args['clear-rejected'] === 'true';
  if (args.reject || clear || args['punctuation-equivalent'] !== undefined) {
    return updateAnswerPolicy(store, (current) => ({
      ...current,
      rejected: clear
        ? []
        : [...current.rejected, ...(args.reject ? [args.reject] : [])],
      punctuationEquivalent:
        args['punctuation-equivalent'] === undefined
          ? current.punctuationEquivalent
          : ['true', true].includes(args['punctuation-equivalent']),
    }));
  }
  return readAnswerPolicy(store);
};

const planOverrides = (args) => ({
  ...(args['rule-ids'] !== undefined || args.ruleIds !== undefined
    ? { ruleIds: csv(args['rule-ids'] ?? args.ruleIds) }
    : {}),
  ...(args.profile ? { profile: decodeWire(args.profile) } : {}),
  ...(args.approximate === undefined
    ? {}
    : {
        approximate: args.approximate !== 'false' && args.approximate !== false,
      }),
});

const planInput = async (args, store) => {
  if (args.config && args.automation) {
    throw new Error(
      'choose either --config or --automation for an answer preview'
    );
  }
  let input = {};
  if (args.config) {
    const saved = await readAnswerFile(args.config);
    input = { ...saved, ...(saved.action ?? {}) };
  } else if (args.automation) {
    const id = String(args.automation).replace(/^automation:/u, '');
    const saved = await store.get(`automation:${id}`);
    if (saved?.action?.kind !== 'answer-questions') {
      throw new Error('answer preview requires a saved question automation');
    }
    input = saved.action;
  }
  return {
    ...input,
    question: args.question ?? args._[2] ?? input.question,
    source: args.source ?? input.source,
    chat: args.chat ?? input.chat,
    ...planOverrides(args),
  };
};

export const questionCommands = async ({ args, store, log }) => {
  const sub = args._[1] ?? 'list';
  let result;
  if (sub === 'exchange') {
    result = await salaryExchange(store, {
      refresh: [true, 'true'].includes(args.refresh),
      ...(args['max-age-days'] !== undefined
        ? { maxAgeDays: Number(args['max-age-days']) }
        : {}),
    });
  } else if (sub === 'policy') {
    result = { policy: await policyCommand(args, store) };
  } else if (sub === 'list') {
    result = { rules: await listAnswerRules(store) };
  } else if (sub === 'save') {
    const input = await answerInput(args);
    const options = await planInput(args, store);
    result = {
      rule: await saveAnswerRule(store, {
        ...options,
        ...input,
        contract:
          input.contract === true || [true, 'true'].includes(args.contract),
      }),
    };
  } else if (sub === 'delete') {
    result = await deleteAnswerRule(store, args._[2] ?? args.id);
  } else if (sub === 'plan') {
    result = await previewAnswer(store, await planInput(args, store));
  } else if (sub === 'learn') {
    result = await learnSavedAnswers(store, {
      ...(await planInput(args, store)),
      self: csv(args.self),
      apply: args.apply === true || args.apply === 'true',
      contract: [true, 'true'].includes(args.contract),
    });
  } else {
    throw new Error(
      'answers expects list | save [file.lino] | delete <id> | plan --question=<text> [--config=file.lino|--automation=id] | learn [--apply] [--contract] [--config=file.lino|--automation=id] | policy [file.lino] [--reject=<text>] [--clear-rejected] [--punctuation-equivalent=true|false] | exchange [--refresh] [--max-age-days=7]'
    );
  }
  log(args.json ? JSON.stringify(result, null, 2) : encodeLinoValue(result));
  return 0;
};
