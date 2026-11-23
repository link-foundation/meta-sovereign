import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { buildRunnerSource } from '../../js/scripts/build-runner-source.mjs';
import { createRunnerSourcePreparation } from '../../js/src/server/runner-deployment.js';
import { runRunnerCommand } from '../../js/src/server/runner-transport.js';
import { runnerSourceAsset } from '../../js/src/transport/runner-deployment-receipt.js';
import { runnerApplicationFixture } from './runner-application-fixture.mjs';

const execute = promisify(execFile);
const smallPackage = async (output) => {
  const source = await runnerApplicationFixture();
  const cwd = source.target.directory;
  try {
    await execute('git', ['init', '--quiet'], { cwd });
    await execute(
      'git',
      ['add', '--', 'js', 'package.json', 'package-lock.json', 'vendor'],
      { cwd }
    );
    await execute(
      'git',
      [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '--quiet',
        '-m',
        'Fixture source',
      ],
      { cwd }
    );
    return await buildRunnerSource({ ref: 'HEAD', output, cwd });
  } finally {
    await source.close();
  }
};

/** Redirect only the fixture's transport to a private local source archive. */
export const runnerDeploymentFixture = async ({
  production = false,
  host,
} = {}) => {
  const parent = await mkdtemp(path.join(tmpdir(), 'reviewed runner source-'));
  const archive = path.join(parent, runnerSourceAsset);
  let downloads = 0;
  let substitute;
  let server;
  const close = async () => {
    try {
      if (server?.listening) {
        await new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
      }
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  };
  try {
    const recipe = await (production
      ? buildRunnerSource({ ref: 'HEAD', output: parent })
      : smallPackage(parent));
    const size = (await stat(archive)).size;
    server = createServer((_request, response) => {
      downloads++;
      if (substitute) {
        response.end(substitute);
      } else {
        response.setHeader('content-length', String(size));
        createReadStream(archive).pipe(response);
      }
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const hook = path.join(parent, 'fixture-fetch.mjs');
    const url = `http://127.0.0.1:${server.address().port}/source`;
    await writeFile(
      hook,
      `
const read = globalThis.fetch;
globalThis.fetch = (url, options) => {
  if (
    url.origin !== 'https://github.com' ||
    !url.pathname.endsWith('/${runnerSourceAsset}')
  ) throw new Error('Unexpected fixture download');
  return read(${JSON.stringify(url)}, options);
};
`
    );
    const directory = path.join(parent, 'fresh checkout');
    const target = {
      session: 'fixture',
      directory,
      cli: path.join(directory, 'js/bin/meta-sovereign.js'),
      store: path.join(parent, 'independent-store'),
      port: 8877,
      isolation: 'screen',
      node: 'node',
      applicationLock: recipe.applicationLock,
      applicationSource: recipe.applicationSource,
      ...(host ? { host } : {}),
    };
    const prepareSource = createRunnerSourcePreparation({
      install: (selected, argv, options) => {
        assert.equal(selected.directory, parent);
        return runRunnerCommand(
          selected,
          [argv[0], '--import', pathToFileURL(hook).href, ...argv.slice(1)],
          options
        );
      },
    });
    return {
      archive,
      close,
      parent,
      prepareSource,
      recipe,
      target,
      downloads: () => downloads,
      substitute: (replacement) => {
        substitute = replacement;
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
};
