import { promises as fs } from 'node:fs';
import { decodeWire } from '../transport/lino.js';
import {
  listAnswerProfiles,
  readAnswerProfile,
  saveAnswerProfile,
  deleteAnswerProfile,
  answerProfileMetadata,
} from '../automation/question-profiles.js';
import { extractAnswerProfile } from '../automation/question-profile-source.js';

const importContacts = async (args, store, id) => {
  if (!args.file || (await fs.stat(args.file)).size > 256000) {
    throw new Error(
      'legacy contacts import requires --file up to 256000 bytes'
    );
  }
  const target = id ? await readAnswerProfile(store, id) : null;
  const result = await extractAnswerProfile(store, {
    format: 'contacts-lino',
    text: await fs.readFile(args.file, 'utf8'),
    profile: target?.values,
  });
  return {
    ...result,
    ...(target ? { target: answerProfileMetadata(target) } : {}),
  };
};

export const namedProfileCommand = async (args, store) => {
  const command = args._[2] ?? 'list';
  const id = args._[3] ?? args.id;
  if (command === 'import') {
    return importContacts(args, store, id);
  }
  if (command === 'list') {
    return { profiles: await listAnswerProfiles(store) };
  }
  if (command === 'show') {
    return { profile: await readAnswerProfile(store, id) };
  }
  if (command === 'delete') {
    return deleteAnswerProfile(store, { id, revision: args.revision });
  }
  if (command === 'save') {
    let input;
    if (args.file) {
      if ((await fs.stat(args.file)).size > 1024 ** 2) {
        throw new Error('named answer profile file exceeds 1 MiB');
      }
      const text = await fs.readFile(args.file, 'utf8');
      input = args.file.endsWith('.json') ? JSON.parse(text) : decodeWire(text);
      input = input.profile ?? input;
    } else {
      input = {
        id,
        name: args.name,
        revision: args.revision,
        values: args.values ? decodeWire(args.values) : {},
      };
    }
    return { profile: await saveAnswerProfile(store, input) };
  }
  throw new Error(
    'profiles expects list | show <id> | save <id> --name=<name> --values=<Lino> [--revision=<revision>] | save --file=profile.lino | import [id] --file=contacts.lino | delete <id> --revision=<revision>'
  );
};
