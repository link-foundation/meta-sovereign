// Compile a bundled Swift helper into a private, content-addressed cache.
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ensurePrivateDir } from '../storage/durable.js';

const execute = promisify(execFile);
const building = new Map();
const compile = async (command, args, options) => {
  try {
    await execute(command, args, options);
    return { status: 0 };
  } catch {
    return { status: 1 };
  }
};

export const compileSwiftHelper = async ({
  dir,
  name,
  source,
  extraArgs = [],
  extraFiles = [],
  run = compile,
}) => {
  const inputs = new Map(
    await Promise.all(
      [source, ...extraFiles].map(async (file) => [
        file,
        await fs.readFile(file),
      ])
    )
  );
  const digest = crypto.createHash('sha256').update(inputs.get(source));
  for (const arg of extraArgs) {
    digest.update(arg);
  }
  for (const file of extraFiles) {
    digest.update(inputs.get(file));
  }
  await ensurePrivateDir(dir);
  const executable = path.join(
    dir,
    `${name}-${digest.digest('hex').slice(0, 20)}`
  );
  try {
    await fs.access(executable, fs.constants.X_OK);
    return executable;
  } catch {
    /* compile once */
  }
  if (building.has(executable)) {
    return building.get(executable);
  }
  const build = async () => {
    const temp = `${executable}.${process.pid}.tmp`;
    // Electron can read bundled ASAR files, but swiftc/the linker cannot.
    // Materialise all compiler inputs in a private real directory first.
    const staging = await fs.mkdtemp(path.join(dir, `${name}-source-`));
    try {
      const staged = new Map();
      for (const [file, bytes] of inputs) {
        const target = path.join(staging, path.basename(file));
        await fs.writeFile(target, bytes, { mode: 0o600 });
        staged.set(file, target);
      }
      const built = await run(
        'xcrun',
        [
          'swiftc',
          '-O',
          staged.get(source),
          ...extraArgs.map((arg) => staged.get(arg) ?? arg),
          '-o',
          temp,
        ],
        { encoding: 'utf8', timeout: 60_000 }
      );
      if (built.status !== 0) {
        throw Object.assign(
          new Error(
            `The ${name} helper could not be built. Install the macOS Command Line Tools.`
          ),
          { code: 'native-helper-unavailable' }
        );
      }
      await fs.chmod(temp, 0o700);
      await fs.rename(temp, executable);
      return executable;
    } finally {
      await fs.rm(temp, { force: true });
      await fs.rm(staging, { recursive: true, force: true });
    }
  };
  const result = build().finally(() => building.delete(executable));
  building.set(executable, result);
  return result;
};
