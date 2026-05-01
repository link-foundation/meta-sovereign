import { describe, it, expect } from 'test-anywhere';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../src/cli/index.js';

const seedDir = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-cli3-'));
  const store = path.join(dir, 'store');
  // Seed messages so audience/facts/search have something to chew on.
  const out = [];
  const log = (m) => out.push(m);
  const archiveFile = path.join(dir, 'tg.json');
  await fs.writeFile(
    archiveFile,
    JSON.stringify({
      chats: {
        list: [
          {
            id: 1,
            messages: [
              {
                id: 1,
                type: 'message',
                from_id: 'me',
                date: 1,
                text: 'where do you live',
              },
              {
                id: 2,
                type: 'message',
                from_id: 'alice',
                date: 2,
                text: 'I live in Berlin',
              },
            ],
          },
        ],
      },
    })
  );
  await runCli(
    [
      'import',
      '--source=telegram',
      `--file=${archiveFile}`,
      `--store=${store}`,
    ],
    { log }
  );
  return { dir, store, out };
};

describe('cli iteration 3 subcommands', () => {
  it('infers a regex from examples', async () => {
    const out = [];
    const code = await runCli(
      ['patterns-infer', '--examples=where do you live,where do you stay'],
      { log: (m) => out.push(m) }
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(out[0]);
    expect(typeof parsed.regex).toBe('string');
  });

  it('runs broadcast and search', async () => {
    const { store } = await seedDir();
    const out = [];
    const code = await runCli(
      ['broadcast', '--text=hello', '--networks=telegram', `--store=${store}`],
      { log: (m) => out.push(m) }
    );
    expect(code).toBe(0);
    const post = JSON.parse(out[out.length - 1]);
    expect(post.networks).toEqual(['telegram']);

    const out2 = [];
    const code2 = await runCli(
      ['search', '--query=Berlin', '--min=0.1', `--store=${store}`],
      { log: (m) => out2.push(m) }
    );
    expect(code2).toBe(0);
    const hits = JSON.parse(out2[0]);
    expect(hits.length).toBeGreaterThan(0);
  });

  it('updates profile and resume with planned syncs', async () => {
    const { store } = await seedDir();
    const out = [];
    const code = await runCli(
      ['profile', '--name=me', '--bio=hi', `--store=${store}`],
      { log: (m) => out.push(m) }
    );
    expect(code).toBe(0);
    const body = JSON.parse(out[0]);
    expect(body.plannedSyncs.length).toBeGreaterThan(0);

    const out2 = [];
    const code2 = await runCli(
      ['resume', '--title=engineer', '--body=...', `--store=${store}`],
      { log: (m) => out2.push(m) }
    );
    expect(code2).toBe(0);
    const body2 = JSON.parse(out2[0]);
    expect(body2.plannedSyncs.length).toBeGreaterThan(0);
  });

  it('evaluates an audience set-algebra query', async () => {
    const { store } = await seedDir();
    const out = [];
    const code = await runCli(
      ['audience', '--query=network:telegram', `--store=${store}`],
      { log: (m) => out.push(m) }
    );
    expect(code).toBe(0);
    const links = JSON.parse(out[0]);
    expect(links.length).toBeGreaterThan(0);
  });
});
