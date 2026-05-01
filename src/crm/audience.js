/**
 * Audience expression DSL (R-D2).
 *
 * A small set-algebra over store links so callers can describe a
 * target audience as text — used by the server (`/api/audience`),
 * the CLI (`audience` subcommand) and the outreach flow.
 *
 * Grammar:
 *   expr   := or
 *   or     := and ("OR" and)*
 *   and    := primary ("AND" primary)*
 *   primary := "NOT" primary | "(" expr ")" | atom
 *   atom   := <dim>:<value>
 *   dim    := network | chat | sender | fact | kind | body | since | before | me
 *
 * Examples:
 *   network:telegram AND NOT chat:42
 *   (network:telegram OR network:vk) AND fact:speaks_russian
 *   body:hello AND since:2024-01-01
 *   kind:msg AND me  (every message I sent)
 */

import { intersect, union, difference } from './index.js';

const tokenise = (expr) =>
  String(expr ?? '')
    .replace(/([(),])/g, ' $1 ')
    .split(/\s+/)
    .filter(Boolean);

const makeAtom = (token) => {
  if (token === 'me') {
    return { kind: 'set', predicate: (l) => l.sender === 'me' };
  }
  const m = token?.match(
    /^(network|chat|sender|fact|kind|body|since|before):(.+)$/
  );
  if (!m) {
    return { kind: 'set', predicate: () => false };
  }
  const [, dim, value] = m;
  if (dim === 'network') {
    return { kind: 'set', predicate: (l) => l.source === value };
  }
  if (dim === 'chat') {
    return { kind: 'set', predicate: (l) => String(l.chat) === value };
  }
  if (dim === 'sender') {
    return { kind: 'set', predicate: (l) => l.sender === value };
  }
  if (dim === 'kind') {
    return {
      kind: 'set',
      predicate: (l) => l.id?.startsWith(`${value}:`),
    };
  }
  if (dim === 'body') {
    const needle = value.toLowerCase();
    return {
      kind: 'set',
      predicate: (l) =>
        typeof l.body === 'string' && l.body.toLowerCase().includes(needle),
    };
  }
  if (dim === 'since') {
    return { kind: 'set', predicate: (l) => (l.timestamp ?? '') >= value };
  }
  if (dim === 'before') {
    return { kind: 'set', predicate: (l) => (l.timestamp ?? '') < value };
  }
  return {
    kind: 'set',
    predicate: (l) => (l.facts ?? []).some((f) => f.includes(value)),
  };
};

export const parseAudience = (expr) => {
  const tokens = tokenise(expr);
  let i = 0;
  const peek = () => tokens[i];
  const eat = () => tokens[i++];
  const parsePrimary = () => {
    const t = eat();
    if (t === 'NOT') {
      return { kind: 'not', expr: parsePrimary() };
    }
    if (t === '(') {
      const inner = parseOr();
      eat();
      return inner;
    }
    return makeAtom(t);
  };
  const parseAnd = () => {
    let left = parsePrimary();
    while (peek() === 'AND') {
      eat();
      left = { kind: 'and', left, right: parsePrimary() };
    }
    return left;
  };
  const parseOr = () => {
    let left = parseAnd();
    while (peek() === 'OR') {
      eat();
      left = { kind: 'or', left, right: parseAnd() };
    }
    return left;
  };
  return parseOr();
};

export const evalAudience = (links, expression) => {
  const ast = parseAudience(expression);
  const walk = (node) => {
    if (node.kind === 'set') {
      return links.filter(node.predicate);
    }
    if (node.kind === 'and') {
      return intersect(walk(node.left), walk(node.right));
    }
    if (node.kind === 'or') {
      return union(walk(node.left), walk(node.right));
    }
    if (node.kind === 'not') {
      return difference(links, walk(node.expr));
    }
    return [];
  };
  return walk(ast);
};
