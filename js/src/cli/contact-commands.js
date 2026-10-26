// Local address-book imports, with the same parser and plan as the app.
import { defaultStoreDir } from '../storage/app-directory.js';
import { promises as fs } from 'node:fs';
import { decodeVcard, parseVcard } from '../sources/vcard.js';
import { readSystemContacts } from '../sources/system-contacts.js';
import {
  planContactsImport,
  applyContactsImport,
} from '../sources/contacts-import.js';

export const CONTACTS_HELP = `  contacts-import [--file=<contacts.vcf> | --system] [--store=<dir>] [--preview]
                import a vCard export or macOS Contacts (including synced iCloud accounts); nothing is uploaded`;

export const createContactCommands = ({ openStore }) => ({
  'contacts-import': async (args, log) => {
    const system = args.system === true || args.system === 'true';
    if (system === Boolean(args.file)) {
      log('choose --file=<contacts.vcf> or --system');
      return 1;
    }
    const storeDir = args.store ?? defaultStoreDir();
    const store = await openStore(storeDir);
    try {
      const rows = system
        ? await readSystemContacts(storeDir)
        : parseVcard(decodeVcard(await fs.readFile(args.file)));
      const plan = await planContactsImport(store, rows, {
        source: system ? 'system' : 'vcard',
      });
      const preview = args.preview === true || args.preview === 'true';
      log(
        JSON.stringify(
          preview
            ? { preview: true, ...plan.stats }
            : await applyContactsImport(store, plan)
        )
      );
      return 0;
    } finally {
      await store.close?.();
    }
  },
});
