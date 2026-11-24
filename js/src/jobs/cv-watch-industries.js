const normalize = (value) => value.replace(/\s+/gu, ' ').trim();

/** Enumerate at most two complete interpretations; commas can be part of a label. */
export const confirmedCvIndustryIds = (text, entries = []) => {
  const value = normalize(text);
  if (!value) {
    return [];
  }
  if (entries.length > 10000) {
    return null;
  }
  const labels = entries.map((row) => ({
    id: row.id,
    name: normalize(row.name),
  }));
  const memo = new Map();
  let budget = 50000;
  const visit = (offset, depth) => {
    if (offset === value.length) {
      return [[]];
    }
    if (depth >= 20) {
      return [];
    }
    const key = `${offset}:${depth}`;
    if (memo.has(key)) {
      return memo.get(key);
    }
    const results = [];
    for (const label of labels) {
      if (--budget < 0) {
        return [];
      }
      if (!label.name || !value.startsWith(label.name, offset)) {
        continue;
      }
      const end = offset + label.name.length;
      if (end !== value.length && value.slice(end, end + 2) !== ', ') {
        continue;
      }
      const next = end === value.length ? end : end + 2;
      for (const rest of visit(next, depth + 1)) {
        if (!rest.includes(label.id)) {
          results.push([label.id, ...rest]);
        }
        if (results.length >= 2) {
          break;
        }
      }
      if (results.length >= 2) {
        break;
      }
    }
    memo.set(key, results);
    return results;
  };
  const paths = visit(0, 0);
  return budget >= 0 && paths.length === 1 ? paths[0].sort() : null;
};
