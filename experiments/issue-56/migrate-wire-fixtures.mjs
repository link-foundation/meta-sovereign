// Bounded syntax-aware migration of browser HTTP fixture boundaries.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { parse } from 'espree';

const walk = (node, visit) => {
  if (!node || typeof node !== 'object') {
    return;
  }
  visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, visit));
    } else if (value && typeof value === 'object') {
      walk(value, visit);
    }
  }
};

for (const name of await readdir('js/tests')) {
  if (!/^e2e.*\.mjs$/.test(name)) {
    continue;
  }
  const file = `js/tests/${name}`;
  let source = await readFile(file, 'utf8');
  const edits = [];
  const imports = new Set();
  walk(
    parse(source, { ecmaVersion: 'latest', sourceType: 'module', range: true }),
    (node) => {
      if (
        node.type !== 'CallExpression' ||
        node.callee.type !== 'MemberExpression'
      ) {
        return;
      }
      const method = node.callee.property.name;
      const receiver = source.slice(...node.callee.object.range);
      if (method === 'postDataJSON' && !node.arguments.length) {
        imports.add('requestBody');
        edits.push({ range: node.range, text: `requestBody(${receiver})` });
      }
      if (method === 'fulfill' && node.arguments.length === 1) {
        const options = source.slice(...node.arguments[0].range);
        if (/['"]application\/json['"]/.test(options)) {
          imports.add('fulfilWire');
          edits.push({
            range: node.range,
            text: `fulfilWire(${receiver}, ${options})`,
          });
        }
      }
    }
  );
  // Nested request-body reads inside fulfil options require a separate pass.
  const outer = edits.filter(
    (edit) =>
      !edits.some(
        (other) =>
          other !== edit &&
          other.range[0] <= edit.range[0] &&
          other.range[1] >= edit.range[1]
      )
  );
  for (const {
    range: [start, end],
    text,
  } of outer.sort((a, b) => b.range[0] - a.range[0])) {
    source = source.slice(0, start) + text + source.slice(end);
  }
  if (outer.length) {
    // Only import helpers actually emitted in this pass.
    const used = [...imports].filter((name) => source.includes(`${name}(`));
    source = `import { ${used.join(', ')} } from './helpers/http-wire.mjs';\n${source}`;
    await writeFile(file, source);
    console.log(`${file}: ${outer.length} fixture boundaries`);
  }
}
