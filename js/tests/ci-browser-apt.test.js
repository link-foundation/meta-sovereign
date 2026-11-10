import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';

test('Linux browser dependency installs prepare the primary archive before apt downloads', async () => {
  let installs = 0;
  for (const name of ['pages.yml', 'release.yml']) {
    const workflow = parse(
      await readFile(
        new URL(`../../.github/workflows/${name}`, import.meta.url),
        'utf8'
      )
    );
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      const steps = job.steps ?? [];
      const install = steps.findIndex((step) =>
        step.run?.includes('playwright install --with-deps')
      );
      if (install < 0) {
        continue;
      }
      installs++;
      const prepare = steps.findIndex((step) =>
        step.run?.includes('sudo node js/scripts/prepare-browser-apt.mjs')
      );
      assert.ok(
        prepare >= 0 && prepare < install,
        `${name}/${jobName}: prepare before apt`
      );
      assert.equal(steps[prepare].if, "runner.os == 'Linux'");
      assert.equal(
        job['timeout-minutes'],
        name === 'pages.yml' ? (jobName === 'e2e-bundle' ? 15 : 20) : 35
      );
    }
  }
  assert.equal(installs, 3);
});

test('browser apt preparation preserves signed suites and unrelated repositories in both formats', async () => {
  const { prepareBrowserApt } =
    await import('../scripts/prepare-browser-apt.mjs');
  const root = await mkdtemp(path.join(os.tmpdir(), 'ms-browser-apt-'));
  const deb822 = [
    'Types: deb',
    'URIs: http://azure.archive.ubuntu.com/ubuntu/',
    'Suites: resolute resolute-updates resolute-backports',
    'Components: main restricted universe multiverse',
    'Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg',
    '',
    'Types: deb',
    'URIs: http://security.ubuntu.com/ubuntu/',
    'Suites: resolute-security',
    'Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg',
    '',
  ].join('\n');
  const legacy = 'deb https://azure.archive.ubuntu.com/ubuntu resolute main\n';
  const unrelated =
    'deb https://azure.archive.ubuntu.com.example/ubuntu resolute main\n';
  try {
    await mkdir(path.join(root, 'sources.list.d'));
    await writeFile(path.join(root, 'sources.list'), legacy);
    await writeFile(path.join(root, 'sources.list.d/ubuntu.sources'), deb822);
    await writeFile(path.join(root, 'sources.list.d/other.list'), unrelated);
    await writeFile(path.join(root, 'sources.list.d/old.sources.save'), legacy);
    assert.equal(await prepareBrowserApt(root), 2);
    assert.equal(
      await readFile(path.join(root, 'sources.list'), 'utf8'),
      legacy.replace('https://azure.', 'https://')
    );
    assert.equal(
      await readFile(path.join(root, 'sources.list.d/ubuntu.sources'), 'utf8'),
      deb822.replace('http://azure.', 'https://')
    );
    assert.equal(
      await readFile(path.join(root, 'sources.list.d/other.list'), 'utf8'),
      unrelated
    );
    assert.equal(
      await readFile(
        path.join(root, 'sources.list.d/old.sources.save'),
        'utf8'
      ),
      legacy
    );
    assert.equal(await prepareBrowserApt(root), 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('browser apt preparation tolerates absent legacy files without creating repositories', async () => {
  const { prepareBrowserApt } =
    await import('../scripts/prepare-browser-apt.mjs');
  const root = await mkdtemp(path.join(os.tmpdir(), 'ms-browser-apt-empty-'));
  try {
    assert.equal(await prepareBrowserApt(root), 0);
    await assert.rejects(readFile(path.join(root, 'sources.list')), {
      code: 'ENOENT',
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('browser apt preparation rewrites the hosted mirror list and preserves priorities and source indirection', async () => {
  const { prepareBrowserApt } =
    await import('../scripts/prepare-browser-apt.mjs');
  const root = await mkdtemp(path.join(os.tmpdir(), 'ms-browser-apt-mirrors-'));
  const mirrors = [
    '# hosted runner archive selection',
    'http://azure.archive.ubuntu.com/ubuntu/\tpriority:1',
    'https://archive.ubuntu.com/ubuntu/\tpriority:2',
    'https://security.ubuntu.com/ubuntu/\tpriority:3',
    'https://azure.archive.ubuntu.com.example/ubuntu/\tpriority:4',
    '',
  ].join('\n');
  const source =
    'deb mirror+file:/etc/apt/apt-mirrors.txt resolute main universe\n';
  try {
    await writeFile(path.join(root, 'apt-mirrors.txt'), mirrors);
    await writeFile(path.join(root, 'sources.list'), source);
    assert.equal(await prepareBrowserApt(root), 1);
    assert.equal(
      await readFile(path.join(root, 'apt-mirrors.txt'), 'utf8'),
      mirrors.replace(
        'http://azure.archive.ubuntu.com/ubuntu/',
        'https://archive.ubuntu.com/ubuntu/'
      )
    );
    assert.equal(
      await readFile(path.join(root, 'sources.list'), 'utf8'),
      source
    );
    assert.equal(await prepareBrowserApt(root), 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
