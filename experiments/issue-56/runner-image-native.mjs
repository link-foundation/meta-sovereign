/** Exercise the installed Docker daemon with a private, empty OCI image. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import {
  prepareDockerImage,
  pullRunnerImage,
} from '../../js/src/server/runner-docker.js';
import { runRunnerCommand } from '../../js/src/server/runner-transport.js';

const architecture = { x64: 'amd64', arm64: 'arm64' }[process.arch];
assert(architecture, 'The image fixture requires an amd64 or arm64 host.');
const repository = `meta-sovereign-image-fixture-${randomUUID()}`;
const json = (value) => Buffer.from(JSON.stringify(value));
const digest = (value) =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`;
const config = json({
  architecture,
  os: 'linux',
  config: { Labels: { 'meta-sovereign.fixture': repository } },
  rootfs: { type: 'layers', diff_ids: [] },
});
const imageId = digest(config);
const manifestType = 'application/vnd.oci.image.manifest.v1+json';
const configType = 'application/vnd.oci.image.config.v1+json';
const manifest = json({
  schemaVersion: 2,
  mediaType: manifestType,
  config: { mediaType: configType, digest: imageId, size: config.length },
  layers: [],
});
const manifestPath = `/v2/${repository}/manifests/${digest(manifest)}`;
const configPath = `/v2/${repository}/blobs/${imageId}`;
const responses = new Map([
  ['/v2/', [json({}), 'application/json']],
  [manifestPath, [manifest, manifestType]],
  [configPath, [config, configType]],
]);
const served = new Set();
const server = createServer((request, response) => {
  const entry = responses.get(request.url);
  if (!entry || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(404).end();
    return;
  }
  served.add(request.url);
  const [body, mediaType] = entry;
  response.writeHead(200, {
    'content-type': mediaType,
    'content-length': body.length,
    'docker-content-digest': digest(body),
    'docker-distribution-api-version': 'registry/2.0',
  });
  response.end(request.method === 'GET' ? body : undefined);
});

await once(server.listen(0, '127.0.0.1'), 'listening');
const image = `127.0.0.1:${server.address().port}/${repository}@${digest(manifest)}`;
const host = process.env.RUNNER_IMAGE_PROBE_SSH_HOST;
const target = { directory: process.cwd(), host, image };
const run = (argv) => runRunnerCommand(target, ['docker', 'image', ...argv]);
const inspect = (reference) =>
  run(['inspect', '--format', '{{.Id}}', reference]);
let pulls = 0;
try {
  assert.equal((await inspect(image)).code, 1);
  const prepare = () =>
    prepareDockerImage(
      target,
      runRunnerCommand,
      async (...args) => {
        pulls++;
        const reply = await pullRunnerImage(...args);
        assert.equal(reply.code, 0, reply.stderr);
        return reply;
      },
      {}
    );
  const observed = await prepare();
  const daemon = await inspect(image);
  assert.match(observed, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(observed, daemon.stdout.trim());
  assert.equal((await inspect(observed)).stdout.trim(), observed);
  assert(served.has(manifestPath));
  assert(served.has(configPath));
  assert.equal(await prepare(), observed);
  assert.equal(pulls, 1);
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  if ((await inspect(image)).code === 0) {
    const removed = await run(['rm', image]);
    assert.equal(removed.code, 0, removed.stderr);
  }
  assert.equal((await inspect(image)).code, 1);
}
console.log(
  JSON.stringify({
    actualDocker: true,
    actualSsh: Boolean(host),
    loopbackRegistry: true,
    digestPinned: true,
    pulls,
    localImageIdReused: true,
    resourcesClosed: true,
  })
);
