/**
 * Indented Links Notation reader/writer.
 *
 * Implements a minimal subset of the indented dialect described in
 * link-foundation/links-notation: each line is a link, indentation
 * encodes nesting, tokens are whitespace-separated.
 *
 * This is a pragmatic local implementation so the storage layer has
 * something to round-trip in tests today; it can be replaced by the
 * upstream npm package as soon as that is published.
 */

const INDENT = '  ';

const tokenize = (line) => {
  const tokens = [];
  let buf = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') {
      quoted = !quoted;
      buf += ch;
      continue;
    }
    if (!quoted && (ch === ' ' || ch === '\t')) {
      if (buf.length > 0) {
        tokens.push(buf);
        buf = '';
      }
      continue;
    }
    buf += ch;
  }
  if (buf.length > 0) {
    tokens.push(buf);
  }
  return tokens.map((t) =>
    t.startsWith('"') && t.endsWith('"') ? JSON.parse(t) : t
  );
};

const formatToken = (t) => {
  const s = String(t);
  if (s.length === 0 || /[\s"]/.test(s)) {
    return JSON.stringify(s);
  }
  return s;
};

/**
 * Parse an indented links-notation string into an array of link objects.
 * Each link is `{ tokens: string[], children: Link[] }`.
 * @param {string} text
 */
export const parseLino = (text) => {
  const lines = text.split(/\r?\n/);
  const root = { tokens: [], children: [] };
  const stack = [{ depth: -1, node: root }];
  for (const raw of lines) {
    if (raw.trim().length === 0 || raw.trim().startsWith('//')) {
      continue;
    }
    const indent = raw.match(/^( *)/)[1].length;
    const depth = Math.floor(indent / INDENT.length);
    const tokens = tokenize(raw.trim());
    const node = { tokens, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }
    stack[stack.length - 1].node.children.push(node);
    stack.push({ depth, node });
  }
  return root.children;
};

const formatNode = (node, depth) => {
  const head = INDENT.repeat(depth) + node.tokens.map(formatToken).join(' ');
  const childLines = node.children.map((c) => formatNode(c, depth + 1));
  return [head, ...childLines].join('\n');
};

/**
 * Format an array of link objects back into indented links-notation text.
 * @param {Array<{tokens: string[], children: any[]}>} links
 */
export const formatLino = (links) =>
  `${links.map((n) => formatNode(n, 0)).join('\n')}\n`;
