import { describe, it, expect } from 'test-anywhere';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createMemoryStore,
  createLinoTextStore,
  createDoubletsStore,
  createDualStore,
  parseLino,
  formatLino,
} from '../src/storage/index.js';

const tmpdir = async () => fs.mkdtemp(path.join(os.tmpdir(), 'ms-test-'));

describe('lino codec', () => {
  it('round-trips an indented document', () => {
    const text = 'a 1\n  b 2\nc 3\n';
    const out = formatLino(parseLino(text));
    expect(out).toBe(text);
  });
  it('handles quoted tokens with whitespace', () => {
    const text = 'msg "hello world"\n';
    const parsed = parseLino(text);
    expect(parsed[0].tokens[1]).toBe('hello world');
  });
});

describe('memory store', () => {
  it('puts, gets, and deletes', async () => {
    const s = createMemoryStore();
    await s.put({ id: 'a', tokens: ['x'] });
    expect((await s.get('a')).tokens[0]).toBe('x');
    expect(await s.delete('a')).toBe(true);
    expect(await s.get('a')).toBe(null);
  });
  it('emits events to subscribers', async () => {
    const s = createMemoryStore();
    const seen = [];
    s.subscribe((e) => seen.push(e.type));
    await s.put({ id: 'a', tokens: [] });
    await s.delete('a');
    expect(seen.join(',')).toBe('put,delete');
  });
});

describe('lino text store', () => {
  it('persists across reopen', async () => {
    const dir = await tmpdir();
    const file = path.join(dir, 'data.lino');
    const s1 = await createLinoTextStore(file);
    await s1.put({ id: 'hello', tokens: ['world'] });
    const s2 = await createLinoTextStore(file);
    expect((await s2.get('hello')).tokens[0]).toBe('world');
  });
});

describe('doublets store', () => {
  it('persists across reopen', async () => {
    const dir = await tmpdir();
    const file = path.join(dir, 'data.bin');
    const s1 = await createDoubletsStore(file);
    await s1.put({ id: 'a', tokens: ['b'] });
    const s2 = await createDoubletsStore(file);
    expect((await s2.get('a')).tokens[0]).toBe('b');
  });
});

describe('dual store', () => {
  it('writes to both backends and verify is empty after sync', async () => {
    const dir = await tmpdir();
    const text = await createLinoTextStore(path.join(dir, 'data.lino'));
    const binary = await createDoubletsStore(path.join(dir, 'data.bin'));
    const dual = createDualStore({ binary, text });
    await dual.put({ id: 'a', tokens: ['x'] });
    expect((await dual.verify()).length).toBe(0);
    expect((await text.get('a')).tokens[0]).toBe('x');
    expect((await binary.get('a')).tokens[0]).toBe('x');
  });
});
