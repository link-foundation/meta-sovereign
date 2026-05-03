import { describe, it, expect } from 'test-anywhere';
import { planOutreach, runOutreach } from '../src/broadcast/index.js';

const audience = [
  { id: 'alice', networks: ['telegram', 'vk'], chats: ['c1'] },
  { id: 'bob', networks: ['telegram'], chats: ['c2'] },
];

describe('planOutreach', () => {
  it('renders a literal text into one envelope per (contact × network)', () => {
    const plan = planOutreach({ audience, text: 'hi {name}' });
    expect(plan.mode).toBe('preview');
    expect(plan.envelopes.length).toBe(3);
    const alice = plan.envelopes.find(
      (e) => e.contact === 'alice' && e.network === 'telegram'
    );
    expect(alice.text).toBe('hi alice');
    expect(alice.chat).toBe('c1');
  });
  it('forces a single network when networks override is given', () => {
    const plan = planOutreach({
      audience,
      text: 'hi',
      networks: ['x'],
    });
    expect(plan.envelopes.length).toBe(2);
    expect(plan.envelopes.every((e) => e.network === 'x')).toBe(true);
  });
  it('falls back to a reply-group variation when text is omitted', () => {
    const replyGroup = { variations: ['only-variation'] };
    const plan = planOutreach({
      audience: [{ id: 'alice', networks: ['telegram'] }],
      replyGroup,
    });
    expect(plan.envelopes[0].text).toBe('only-variation');
  });
  it('skips contacts when neither text nor variation is available', () => {
    const plan = planOutreach({
      audience: [{ id: 'alice', networks: ['telegram'] }],
      replyGroup: { variations: [] },
    });
    expect(plan.envelopes.length).toBe(0);
  });
  it('renders {networks} and {chats} placeholders', () => {
    const plan = planOutreach({
      audience: [{ id: 'alice', networks: ['telegram', 'vk'], chats: ['c1'] }],
      text: 'on {networks} via {chats}',
    });
    expect(plan.envelopes[0].text).toBe('on telegram,vk via c1');
  });
});

describe('runOutreach', () => {
  it('invokes broadcast for each envelope and returns ok=false for missing live.post', async () => {
    const plan = planOutreach({
      audience: [{ id: 'alice', networks: ['telegram'] }],
      text: 'hi',
    });
    const results = await runOutreach(plan);
    expect(results.length).toBe(1);
    expect(results[0].network).toBe('telegram');
    expect(results[0].result.network).toBe('telegram');
  });
});
