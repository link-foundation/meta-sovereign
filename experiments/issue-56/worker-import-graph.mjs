// Read the finite local static import graph without executing provider code.
import { readFile } from 'node:fs/promises';
import { parse } from 'espree';

const root = new URL('../../', import.meta.url);
const entry = new URL('js/src/server/rolling-worker.js', root);
const graph = new Map();
const pending = [entry.href];
while (pending.length) {
  const href = pending.pop();
  if (graph.has(href)) {
    continue;
  }
  if (graph.size >= 4096) {
    throw new Error('Finite import graph bound exceeded');
  }
  const code = await readFile(new URL(href), 'utf8');
  const ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
  const names = ast.body
    .filter((node) =>
      [
        'ImportDeclaration',
        'ExportNamedDeclaration',
        'ExportAllDeclaration',
      ].includes(node.type)
    )
    .map((node) => node.source?.value)
    .filter(Boolean);
  const imports = names
    .filter((name) => name.startsWith('.') && name.endsWith('.js'))
    .map((name) => new URL(name, href).href);
  graph.set(href, {
    imports,
    external: names.filter((name) => !name.startsWith('.')),
    bytes: Buffer.byteLength(code),
  });
  pending.push(...imports);
}
const reachable = (href) => {
  const all = new Set();
  const queue = [href];
  while (queue.length) {
    const next = queue.pop();
    if (!all.has(next)) {
      all.add(next);
      queue.push(...graph.get(next).imports);
    }
  }
  return all;
};
const server = new URL('js/src/server/index.js', root).href;
const roots = graph.get(server).imports;
const closures = roots.map(reachable);
const branches = roots
  .map((href, index) => {
    const other = new Set(
      closures.filter((_, i) => i !== index).flatMap((set) => [...set])
    );
    return {
      name: href.slice(root.href.length),
      reachable: closures[index].size,
      exclusive: [...closures[index]].filter((name) => !other.has(name)).length,
    };
  })
  .sort((a, b) => b.exclusive - a.exclusive);
console.log(
  JSON.stringify(
    {
      relativeStaticModules: graph.size,
      sourceBytes: [...graph.values()].reduce(
        (total, node) => total + node.bytes,
        0
      ),
      externalAndDynamicImports: 'not traversed',
      bareImports: [...graph.entries()]
        .flatMap(([href, node]) =>
          node.external
            .filter((name) => !name.startsWith('node:'))
            .map((name) => ({ name, importer: href.slice(root.href.length) }))
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
      serverBranches: branches,
    },
    null,
    2
  )
);
