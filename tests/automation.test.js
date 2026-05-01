import { describe, it, expect } from 'test-anywhere';
import {
  createGraph,
  addNode,
  addEdge,
  runGraph,
} from '../src/automation/index.js';
import { inferRegex } from '../src/patterns/index.js';
import { createReplyGroup } from '../src/replies/index.js';

describe('automation graph', () => {
  it('fires a pattern and emits a reply plan', () => {
    const g = createGraph();
    addNode(g, {
      id: 'p1',
      kind: 'pattern',
      regex: inferRegex(['hi how are you']),
    });
    const group = createReplyGroup({
      id: 'r1',
      label: 'greet',
      variations: ['hello!', 'hey!'],
    });
    addNode(g, { id: 'r1', kind: 'reply', group });
    addEdge(g, 'p1', 'r1');
    const plan = runGraph(g, 'hi how are you', { mode: 'semi' });
    expect(plan.length).toBe(1);
    expect(plan[0].kind).toBe('reply');
  });
  it('does not fire when message does not match', () => {
    const g = createGraph();
    addNode(g, { id: 'p1', kind: 'pattern', regex: /^hello$/ });
    addNode(g, { id: 's1', kind: 'send', text: 'hi' });
    addEdge(g, 'p1', 's1');
    expect(runGraph(g, 'goodbye').length).toBe(0);
  });
});
