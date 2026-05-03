import { describe, it, expect } from 'test-anywhere';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../src/cli/index.js';
import { decryptExport } from '../src/storage/export-encrypted.js';

const tmp = (slug) =>
  fs.mkdtemp(path.join(os.tmpdir(), `ms-hard-cli-${slug}-`));

describe('hardening CLI surface (issue #6)', () => {
  it('export-encrypted writes a passphrase-protected file', async () => {
    const dir = await tmp('export');
    const store = path.join(dir, 'store');
    await runCli(
      [
        'import',
        '--source=telegram',
        `--file=${await seedTelegram(dir)}`,
        `--store=${store}`,
      ],
      { log: () => {} }
    );
    const file = path.join(dir, 'export.json');
    const out = [];
    const code = await runCli(
      [
        'export-encrypted',
        `--file=${file}`,
        '--passphrase=hunter2',
        `--store=${store}`,
      ],
      { log: (m) => out.push(m) }
    );
    expect(code).toBe(0);
    const opened = decryptExport(await fs.readFile(file, 'utf8'), 'hunter2');
    expect(opened.links.length).toBeGreaterThan(0);
  });

  it('export-encrypted fails without --passphrase', async () => {
    const dir = await tmp('noopp');
    const out = [];
    const code = await runCli(
      [
        'export-encrypted',
        `--file=${path.join(dir, 'x.json')}`,
        `--store=${path.join(dir, 'store')}`,
      ],
      { log: (m) => out.push(m) }
    );
    expect(code).toBe(1);
    expect(out.join('\n')).toMatch(/passphrase/);
  });

  it('vault-init/list/add/remove via the CLI', async () => {
    const dir = await tmp('vault');
    const file = path.join(dir, 'vault.json');
    const out = [];
    const log = (m) => out.push(m);

    expect(
      await runCli(
        [
          'vault-init',
          '--kind=passphrase',
          '--secret=master',
          `--file=${file}`,
        ],
        { log }
      )
    ).toBe(0);

    expect(
      await runCli(
        [
          'vault-add',
          '--secret=master',
          '--kind=pin',
          '--new-secret=0429',
          `--file=${file}`,
        ],
        { log }
      )
    ).toBe(0);

    out.length = 0;
    expect(await runCli(['vault-list', `--file=${file}`], { log })).toBe(0);
    const list = JSON.parse(out.at(-1));
    expect(list.length).toBe(2);
    const passId = list.find((u) => u.kind === 'passphrase').id;

    expect(
      await runCli(
        ['vault-remove', '--secret=0429', `--id=${passId}`, `--file=${file}`],
        { log }
      )
    ).toBe(0);

    out.length = 0;
    await runCli(['vault-list', `--file=${file}`], { log });
    const after = JSON.parse(out.at(-1));
    expect(after.length).toBe(1);
    expect(after[0].kind).toBe('pin');
  });

  it('purge-tombstones requires --confirm=true', async () => {
    const dir = await tmp('purge');
    const out = [];
    const log = (m) => out.push(m);

    // No --confirm
    const refuse = await runCli(
      ['purge-tombstones', `--store=${path.join(dir, 'store')}`],
      { log }
    );
    expect(refuse).toBe(1);
    expect(out.join('\n')).toMatch(/confirm/);
  });
});

const seedTelegram = async (dir) => {
  const file = path.join(dir, 'tg.json');
  await fs.writeFile(
    file,
    JSON.stringify({
      chats: {
        list: [
          {
            id: 1,
            messages: [
              { id: 5, type: 'message', from_id: 'u', date: 1, text: 'yo' },
            ],
          },
        ],
      },
    })
  );
  return file;
};
