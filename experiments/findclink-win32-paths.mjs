// Runs findClink's test logic with Windows path semantics (path.win32) to
// check the Windows CI fix without a Windows host.
import path from 'node:path';

const join = path.win32.join;
const custom = join('/opt', 'clink');
const opt = join('/opt', 'bin');
const cargo = join('/h', '.cargo', 'bin', 'clink');
const exists = (p) => p.startsWith(join('/opt')) || p === cargo;
const find = ({ env, home, platform }) => {
  const names = platform === 'win32' ? ['clink.exe', 'clink'] : ['clink'];
  const dirs = [
    join(home, '.cargo', 'bin'),
    join(home, '.dotnet', 'tools'),
    ...String(env.PATH ?? '')
      .split(';')
      .filter(Boolean),
  ];
  return (
    [env.CLINK_BIN, ...dirs.flatMap((d) => names.map((n) => join(d, n)))]
      .filter(Boolean)
      .find(exists) ?? null
  );
};
console.log(find({ env: { CLINK_BIN: custom }, home: '/h' }) === custom);
console.log(find({ env: {}, home: '/h' }) === cargo);
console.log(find({ env: { PATH: opt }, home: '/x' }) === join(opt, 'clink'));
console.log(
  find({ env: { PATH: opt }, home: '/x', platform: 'win32' }) ===
    join(opt, 'clink.exe')
);
