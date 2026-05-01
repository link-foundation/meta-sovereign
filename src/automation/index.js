/**
 * Automation graph (R-C3, R-C4).
 *
 * A graph is a set of nodes and directed edges. Node kinds:
 *   - `pattern`   — fires when its regex matches an incoming message.
 *   - `reply`     — picks a variation from a `ReplyVariationGroup`.
 *   - `branch`    — conditional split based on previous outputs.
 *   - `wait`      — pauses until the partner sends another message.
 *   - `send`      — outputs a message via the chosen `MessageSource`.
 *
 * `runGraph` evaluates the graph for a given inbound message and
 * returns the planned outbound messages. In `auto` mode they are sent
 * directly; in `semi` mode they are returned as suggestions for the
 * Operator UI to confirm.
 */

import { matchAll } from '../patterns/index.js';
import { pickVariation } from '../replies/index.js';

export const createGraph = () => ({ nodes: new Map(), edges: [] });

export const addNode = (graph, node) => {
  graph.nodes.set(node.id, node);
  return node;
};

export const addEdge = (graph, from, to) => {
  graph.edges.push({ from, to });
};

const nextNodes = (graph, fromId) =>
  graph.edges
    .filter((e) => e.from === fromId)
    .map((e) => graph.nodes.get(e.to));

const firePattern = (node, message) => {
  const text = typeof message === 'string' ? message : (message.body ?? '');
  return matchAll(node.regex, [text]).length > 0;
};

export const runGraph = (graph, message, { mode = 'semi' } = {}) => {
  const plan = [];
  for (const node of graph.nodes.values()) {
    if (node.kind !== 'pattern' || !firePattern(node, message)) {
      continue;
    }
    let cursor = node;
    let safety = 32;
    while (cursor && safety > 0) {
      safety -= 1;
      const successors = nextNodes(graph, cursor.id);
      if (successors.length === 0) {
        break;
      }
      const next = successors[0];
      if (next.kind === 'reply') {
        plan.push({
          kind: 'reply',
          group: next.group,
          text: pickVariation(next.group, mode === 'auto' ? 'random' : 'first'),
        });
      } else if (next.kind === 'send') {
        plan.push({ kind: 'send', text: next.text });
      } else if (next.kind === 'wait') {
        plan.push({ kind: 'wait' });
        break;
      }
      cursor = next;
    }
  }
  return plan;
};
