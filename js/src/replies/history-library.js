import { inferRegex } from '../patterns/index.js';

// A view of the existing bounded model. No archive scan, generated replies or
// second history cache; counts represent observed messages in its coverage.
export const historyLibrary = (pairs, sent, limit = 50) => {
  const prompts = new Map();
  for (const row of pairs) {
    const group = prompts.get(row.prompt) ?? {
      prompt: row.prompt,
      count: 0,
      variations: [],
    };
    group.count += row.count;
    group.variations.push({ text: row.reply, count: row.count });
    prompts.set(row.prompt, group);
  }
  const groups = [...prompts.values()]
    .filter((group) => group.count >= 2)
    .sort((a, b) => b.count - a.count || a.prompt.localeCompare(b.prompt))
    .slice(0, limit);
  for (const group of groups) {
    group.variations.sort((a, b) => b.count - a.count);
  }
  const repeated = sent
    .filter((row) => row.count >= 2)
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
    .slice(0, limit);
  const patterns = [
    ...groups.map((group) => ({
      count: group.count,
      examples: group.variations.slice(0, 20).map((row) => row.text),
      prompt: group.prompt,
    })),
    ...repeated.map((row) => ({
      count: row.count,
      examples: [row.text],
      prompt: null,
    })),
  ].sort((a, b) => b.count - a.count);
  const seen = new Set();
  const unique = patterns
    .filter((pattern) => {
      const key = JSON.stringify(pattern.examples.toSorted());
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map((pattern) => ({
      ...pattern,
      regex: inferRegex(pattern.examples).source,
      flags: 'i',
    }));
  return { groups, patterns: unique, repeated };
};
