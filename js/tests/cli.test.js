import { describe, it, expect } from 'test-anywhere';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../src/cli/index.js';
import { parseArgs } from '../src/cli/lino-args.js';

describe('lino-args parser', () => {
  it('parses flags and positionals', () => {
    const a = parseArgs(['cmd', '--port=8080', '--auto', '--name', 'x']);
    expect(a._.length).toBe(1);
    expect(a.port).toBe('8080');
    expect(a.auto).toBe(true);
    expect(a.name).toBe('x');
  });
});

describe('cli end-to-end', () => {
  it('imports a telegram archive and exports it back', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-cli-'));
    const archiveFile = path.join(dir, 'tg.json');
    await fs.writeFile(
      archiveFile,
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
    const out = [];
    const log = (m) => out.push(m);
    const code = await runCli(
      [
        'import',
        '--source=telegram',
        `--file=${archiveFile}`,
        `--store=${path.join(dir, 'store')}`,
      ],
      { log }
    );
    expect(code).toBe(0);
    expect(out[0]).toMatch(/imported 1/);

    const exportFile = path.join(dir, 'out.json');
    const code2 = await runCli(
      ['export', `--file=${exportFile}`, `--store=${path.join(dir, 'store')}`],
      { log }
    );
    expect(code2).toBe(0);
    const exported = JSON.parse(await fs.readFile(exportFile, 'utf8'));
    expect(exported.length).toBe(1);
  });

  it('lists sources', async () => {
    const out = [];
    const code = await runCli(['sources'], { log: (m) => out.push(m) });
    expect(code).toBe(0);
    expect(out[0].includes('telegram')).toBe(true);
  });
});
