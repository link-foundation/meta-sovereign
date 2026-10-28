#!/usr/bin/env node
// Diff the entire PR or push range. A docs-only follow-up cannot certify
// untested code from an earlier commit; unavailable revisions fail closed.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const event = process.env.GITHUB_EVENT_PATH
  ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  : {};
const nonzero = (sha) => sha && !/^0+$/.test(sha);

function changedFiles() {
  if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    return git('ls-tree', '--name-only', '-rz', 'HEAD')
      .split('\0')
      .filter(Boolean);
  }
  let base;
  let head = 'HEAD';
  if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
    base = process.env.GITHUB_BASE_SHA || event.pull_request?.base?.sha;
    head =
      process.env.GITHUB_HEAD_SHA || event.pull_request?.head?.sha || 'HEAD';
    if (!base) {
      throw new Error('PR base SHA is required for complete change detection');
    }
    base = git('merge-base', base, head);
  } else if (nonzero(event.before)) {
    base = event.before;
    head = event.after || 'HEAD';
  } else {
    const parents = git('rev-list', '--parents', '-n', '1', 'HEAD').split(' ');
    base = parents[1];
  }
  console.log(`Change range: ${base || '(initial tree)'} -> ${head}`);
  // NUL delimiters preserve spaces, tabs and newlines in repository paths.
  const output = base
    ? git('diff', '--name-only', '-z', base, head)
    : git('ls-tree', '--name-only', '-rz', head);
  return output.split('\0').filter(Boolean);
}

const ignored =
  /^(dev\/log\/|docs\/case-studies\/|(?:js\/)?(?:experiments|examples)\/|\.changeset\/)/;
const files = changedFiles().filter((file) => !ignored.test(file));
console.log('Changed files:', JSON.stringify(files));
const outputs = {
  'mjs-changed': files.some((file) => /\.(mjs|cjs)$/.test(file)),
  'js-changed': files.some((file) =>
    /\.(js|jsx|ts|tsx|css|html|swift)$/.test(file)
  ),
  'package-changed': files.some((file) =>
    /^(package(?:-lock)?\.json|deno\.json|bunfig\.toml)$/.test(file)
  ),
  'docs-changed': files.some((file) => file.endsWith('.md')),
  'workflow-changed': files.some(
    (file) =>
      file.startsWith('.github/') ||
      /^(?:\.\w|js\/eslint|js\/scripts\/)/.test(file)
  ),
  'rust-changed': files.some((file) => file.startsWith('rust/')),
  'python-changed': files.some((file) => file.endsWith('.py')),
  'any-code-changed': files.some(
    (file) =>
      !file.endsWith('.md') &&
      !file.startsWith('docs/') &&
      !file.endsWith('.gitkeep')
  ),
};
for (const [name, value] of Object.entries(outputs)) {
  const line = `${name}=${value}\n`;
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, line);
  }
  process.stdout.write(line);
}
