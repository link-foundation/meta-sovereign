import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

// Only the five failing fixture tests; preserve each existing ten-second bound.
// Node's optional native filesystem trace records operation timing independently
// of the store, including an operation that never reaches its next checkpoint.
await mkdir('ci-logs/storage-timeout', { recursive: true });
const child = spawn(
  process.execPath,
  [
    '--trace-event-categories=node.fs.async,node.fs.sync',
    '--trace-event-file-pattern=ci-logs/storage-timeout/fs-${pid}.json',
    '--test',
    '--test-concurrency=1',
    '--test-name-pattern=managed atomic receives|durable reopen reconciles|desktop quota ranks|real Lino restart',
    'js/tests/sync-receive-storage.test.js',
    'js/tests/sync-reconciliation-production.test.js',
    'js/tests/vk-desktop-policy.test.js',
    'js/tests/vk-friends.test.js',
  ],
  { stdio: 'inherit', env: { ...process.env, MS_STORAGE_DEBUG: '1' } }
);
child.once('error', (error) => {
  console.error('Storage diagnostic child could not start:', error.code);
  process.exitCode = 1;
});
await new Promise((resolve) => child.once('close', resolve));
process.exitCode ??= child.exitCode ?? 1;
