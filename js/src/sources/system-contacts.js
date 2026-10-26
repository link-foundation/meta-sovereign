// A permission-respecting reader for macOS's unified Contacts store.
// GET/capability checks never request access or read the contact list.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSwiftHelper } from '../server/native-helper.js';

const source = fileURLToPath(
  new URL('./system-contacts.swift', import.meta.url)
);
const plist = fileURLToPath(
  new URL('./system-contacts.plist', import.meta.url)
);

export const readSystemContacts = async (
  storeDir,
  {
    platform = process.platform,
    mode = 'read',
    compile = compileSwiftHelper,
    execute = promisify(execFile),
  } = {}
) => {
  if (platform !== 'darwin') {
    throw Object.assign(
      new Error(
        'System Contacts is available on macOS. Import an exported vCard on this platform.'
      ),
      { code: 'contacts-unavailable' }
    );
  }
  const executable = await compile({
    dir: path.resolve(storeDir, 'native'),
    name: 'system-contacts',
    source,
    extraArgs: [
      '-parse-as-library',
      '-Xlinker',
      '-sectcreate',
      '-Xlinker',
      '__TEXT',
      '-Xlinker',
      '__info_plist',
      '-Xlinker',
      plist,
    ],
    extraFiles: [plist],
  });
  const { stdout } = await execute(executable, [mode], {
    timeout: 180_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  const result = JSON.parse(stdout);
  if (!result.ok) {
    throw Object.assign(
      new Error(
        result.code === 'contacts-permission-denied'
          ? 'Allow Contacts access in System Settings → Privacy & Security → Contacts, then try again.'
          : 'The system contacts could not be read.'
      ),
      { code: result.code }
    );
  }
  return mode === 'status' ? result : result.contacts;
};
