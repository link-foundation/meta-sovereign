// Resolve Windows npm/npx shims with cross-spawn's tested argument escaping.
// Never pass raw argument arrays through Node's deprecated shell:true path.
import crossSpawn from 'cross-spawn';

export const spawnCommand = (command, args, options = {}) =>
  crossSpawn(command, args, { ...options, shell: false });

export const spawnCommandSync = (command, args, options = {}) =>
  crossSpawn.sync(command, args, { ...options, shell: false });

/** execFileSync-style stdout/throw contract, also for Windows command shims. */
export const execCommandSync = (command, args, options = {}) => {
  const result = spawnCommandSync(command, args, options);
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw Object.assign(
      new Error(
        `Command ${command} failed (${result.status ?? result.signal})`
      ),
      result
    );
  }
  return result.stdout;
};
