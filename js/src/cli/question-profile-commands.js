import { promises as fs } from 'node:fs';
import { decodeWire } from '../transport/lino.js';
import {
  listAnswerProfiles,
  readAnswerProfile,
  saveAnswerProfile,
  deleteAnswerProfile,
} from '../automation/question-profiles.js';

export const namedProfileCommand = async (args, store) => {
  const command = args._[2] ?? 'list';
  const id = args._[3] ?? args.id;
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
    'profiles expects list | show <id> | save <id> --name=<name> --values=<Lino> [--revision=<revision>] | save --file=profile.lino | delete <id> --revision=<revision>'
  );
};
