/** One-time, AST-bound relocation of existing help text without editing its bytes. */
import { parse } from 'espree';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const root = 'js/src/cli/';
if (existsSync(`${root}help.js`)) {
  throw new Error(
    'Relocation requires the exact published parent without help.js.'
  );
}
const modules = new Map();
const declarations = new Map();
for (const file of readdirSync(root).filter((name) => name.endsWith('.js'))) {
  const source = readFileSync(root + file, 'utf8');
  const ast = parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    range: true,
  });
  modules.set(file, { source, ast });
  for (const node of ast.body) {
    const declaration =
      node.type === 'ExportNamedDeclaration' ? node.declaration : node;
    if (declaration?.type !== 'VariableDeclaration') {
      continue;
    }
    for (const part of declaration.declarations) {
      if (
        part.id.type !== 'Identifier' ||
        !/^(HELP|.*_HELP)$/u.test(part.id.name)
      ) {
        continue;
      }
      if (declaration.declarations.length !== 1) {
        throw Error('Combined help declaration');
      }
      const dependencies =
        part.init.type === 'TemplateLiteral'
          ? part.init.expressions.map((expression) => {
              if (expression.type !== 'Identifier') {
                throw Error('Nonconstant help interpolation');
              }
              return expression.name;
            })
          : [];
      if (!['TemplateLiteral', 'Literal'].includes(part.init.type)) {
        throw Error('Nonconstant help');
      }
      declarations.set(part.id.name, { file, node, part, dependencies });
    }
  }
}
const commands = modules.get('commands.js');
const imports = new Map(
  commands.ast.body
    .filter((node) => node.type === 'ImportDeclaration')
    .flatMap((node) =>
      node.specifiers.map((spec) => [
        spec.local.name,
        { source: node.source.value, name: spec.imported?.name },
      ])
    )
);
const map = commands.ast.body.find(
  (node) =>
    node.type === 'VariableDeclaration' &&
    node.declarations[0].id.name === 'COMMANDS'
).declarations[0].init;
const names = [];
for (const entry of map.properties) {
  if (entry.type !== 'SpreadElement') {
    names.push(entry.key.name ?? entry.key.value);
    continue;
  }
  const imported = imports.get(entry.argument.callee.name);
  const factory = (
    await import(pathToFileURL(resolve(root, imported.source)).href)
  )[imported.name];
  const noStore = () => {
    throw Error('Catalog discovery must not open a store');
  };
  names.push(
    ...Object.keys(factory({ openStore: noStore, openReadOnly: noStore }))
  );
}
const emitted = new Set();
const help = [
  '/** Shared immutable CLI usage text; no providers, stores or command execution. */',
];
const emit = (name) => {
  if (emitted.has(name)) {
    return;
  }
  const item = declarations.get(name);
  if (!item) {
    throw Error(`Missing help dependency ${name}`);
  }
  for (const dependency of item.dependencies) {
    emit(dependency);
  }
  help.push(
    `export const ${modules
      .get(item.file)
      .source.slice(item.part.range[0], item.part.range[1])};`
  );
  emitted.add(name);
};
for (const name of declarations.keys()) {
  emit(name);
}
for (const [file, { source, ast }] of modules) {
  const edits = [];
  for (const node of ast.body.filter(
    (entry) => entry.type === 'ImportDeclaration'
  )) {
    const remaining = node.specifiers.filter(
      (spec) => !declarations.has(spec.local.name)
    );
    if (remaining.length === node.specifiers.length) {
      continue;
    }
    if (remaining.some((spec) => spec.type !== 'ImportSpecifier')) {
      throw Error('Unexpected import');
    }
    const text = remaining.length
      ? `import { ${remaining.map((spec) => (spec.imported.name === spec.local.name ? spec.local.name : `${spec.imported.name} as ${spec.local.name}`)).join(', ')} } from ${source.slice(node.source.range[0], node.source.range[1])};`
      : '';
    edits.push({ range: node.range, text });
  }
  for (const [name, item] of declarations) {
    if (item.file !== file) {
      continue;
    }
    const remainder =
      source.slice(0, item.node.range[0]) + source.slice(item.node.range[1]);
    // Help names imported for interpolation are removed with their declaration.
    const used = new RegExp(`\\b${name}\\b`, 'u').test(remainder);
    edits.push({
      range: item.node.range,
      text:
        name === 'HELP' || used
          ? `import { ${name} } from './help.js';\n${name === 'HELP' ? '' : `export { ${name} };`}`
          : `export { ${name} } from './help.js';`,
    });
  }
  if (edits.length) {
    let next = source;
    for (const edit of edits.sort((a, b) => b.range[0] - a.range[0])) {
      next =
        next.slice(0, edit.range[0]) + edit.text + next.slice(edit.range[1]);
    }
    writeFileSync(root + file, next);
  }
}
writeFileSync(`${root}help.js`, `${help.join('\n\n')}\n`);
writeFileSync(
  `${root}command-names.js`,
  `/** Admission catalog; verified against every ordinary command registration. */\nexport const ordinaryCommandNames = new Set(${JSON.stringify([...new Set(names)].sort())});\n`
);
console.log(
  JSON.stringify({ constants: emitted.size, commands: new Set(names).size })
);
