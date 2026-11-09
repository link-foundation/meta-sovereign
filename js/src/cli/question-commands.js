import { promises as fs } from 'node:fs';
import { decodeWire, encodeLinoValue } from '../transport/lino.js';
import {
  listAnswerRules,
  saveAnswerRule,
  deleteAnswerRule,
  previewAnswer,
  learnSavedAnswers,
} from '../automation/question-store.js';

const csv = (value) =>
  String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
const answerInput = async (args) => {
  const file = args._[2];
  if (file) {
    const text = await fs.readFile(file, 'utf8');
    return file.endsWith('.json') ? JSON.parse(text) : decodeWire(text);
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
        },
      ],
    };
  }
};

export const questionCommands = async ({ args, store, log }) => {
  const sub = args._[1] ?? 'list';
  let result;
  if (sub === 'list') {
    result = { rules: await listAnswerRules(store) };
  } else if (sub === 'save') {
    const input = await answerInput(args);
    result = { rule: await saveAnswerRule(store, input) };
  } else if (sub === 'delete') {
    result = await deleteAnswerRule(store, args._[2] ?? args.id);
  } else if (sub === 'plan') {
    result = await previewAnswer(store, {
      question: args.question ?? args._[2],
      source: args.source,
      chat: args.chat,
      ruleIds: csv(args['rule-ids'] ?? args.ruleIds),
      profile: args.profile ? decodeWire(args.profile) : {},
      approximate: args.approximate !== 'false' && args.approximate !== false,
    });
  } else if (sub === 'learn') {
    result = await learnSavedAnswers(store, {
      self: csv(args.self),
      apply: args.apply === true || args.apply === 'true',
    });
  } else {
    throw new Error(
      'answers expects list | save [file.lino] | delete <id> | plan --question=<text> | learn [--apply]'
    );
  }
  log(args.json ? JSON.stringify(result, null, 2) : encodeLinoValue(result));
  return 0;
};
