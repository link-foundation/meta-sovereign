import { answerModelFailure } from './answer-model-config.js';

const invalid = () => {
  throw answerModelFailure(
    'answer-model-response',
    'The draft could not be converted to bounded plain text.'
  );
};
const word = (character) =>
  Boolean(character && /[\p{L}\p{N}_]/u.test(character));
const punctuation = (character) => {
  const code = character?.codePointAt(0) ?? 0;
  return (
    (code >= 33 && code <= 47) ||
    (code >= 58 && code <= 64) ||
    (code >= 91 && code <= 96) ||
    (code >= 123 && code <= 126)
  );
};

const find = (source, needle, from, spend) => {
  const index = source.indexOf(needle, from);
  spend((index < 0 ? source.length : index + needle.length) - from);
  return index;
};
const linkAt = (source, index, spend, depth) => {
  const image = source[index] === '!' && source[index + 1] === '[';
  if (source[index] !== '[' && !image) {
    return null;
  }
  const start = index + (image ? 2 : 1);
  const middle = find(source, '](', start, spend);
  if (middle < 0) {
    return null;
  }
  let end = middle + 2;
  let balance = 1;
  for (; end < source.length && balance; end++) {
    spend(1);
    balance += source[end] === '(' ? 1 : source[end] === ')' ? -1 : 0;
  }
  if (balance) {
    return null;
  }
  const label = inlineText(source.slice(start, middle), spend, depth + 1);
  const url = source.slice(middle + 2, end - 1).trim();
  return { end, text: label === url || !label ? url : `${label} (${url})` };
};
const delimitedAt = (source, index, spend, depth) => {
  const character = source[index];
  if (!'`*_~'.includes(character)) {
    return null;
  }
  let end = index + 1;
  while (source[end] === character) {
    spend(1);
    end++;
  }
  const marker = source.slice(index, end);
  const literal = { text: marker, end };
  const isCode = character === '`';
  const supported =
    isCode || (character === '~' ? marker.length === 2 : marker.length <= 3);
  if (!supported || (!isCode && word(source[index - 1]))) {
    return literal;
  }
  const close = find(source, marker, end, spend);
  const content = close < 0 ? '' : source.slice(end, close);
  if (
    !content ||
    (!isCode &&
      (content.trim() !== content || word(source[close + marker.length])))
  ) {
    return literal;
  }
  return {
    end: close + marker.length,
    text: isCode ? content : inlineText(content, spend, depth + 1),
  };
};

// Each search/descent spends from one input-wide budget. Malformed nested data
// refuses the draft rather than consuming unbounded work or leaving decorations.
const inlineText = (source, spend, depth = 0) => {
  if (depth > 16) {
    invalid();
  }
  let output = '';
  for (let index = 0; index < source.length;) {
    spend(1);
    if (source[index] === '\\' && punctuation(source[index + 1])) {
      output += source[index + 1];
      index += 2;
      continue;
    }
    const match =
      linkAt(source, index, spend, depth) ??
      delimitedAt(source, index, spend, depth);
    if (match) {
      output += match.text;
      index = match.end;
    } else {
      output += source[index];
      index++;
    }
  }
  return output;
};

/** Plain model prose; code contents, identifiers and link destinations survive. */
export const plainAnswerText = (input) => {
  if (typeof input !== 'string' || input.length > 6000) {
    invalid();
  }
  let remaining = 128000;
  const spend = (amount) => {
    remaining -= amount;
    if (remaining < 0) {
      invalid();
    }
  };
  let fence = null;
  const output = [];
  for (let line of input.replace(/\r\n?/gu, '\n').split('\n')) {
    spend(line.length);
    const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
    if (fence) {
      if (
        delimiter &&
        delimiter[1][0] === fence[0] &&
        delimiter[1].length >= fence.length &&
        !delimiter[2].trim()
      ) {
        fence = null;
      } else {
        output.push(line);
      }
      continue;
    }
    if (delimiter && !delimiter[2].includes(delimiter[1][0])) {
      fence = delimiter[1];
      continue;
    }
    line = line.replace(/^ {0,3}(?:>[ \t]?)+/u, '');
    if (/^ {0,3}(?:={3,}|(?:[-*_][ \t]*){3,})$/u.test(line)) {
      continue;
    }
    const heading = /^ {0,3}#{1,6}[ \t]+/u.test(line);
    line = line.replace(/^ {0,3}#{1,6}[ \t]+/u, '');
    if (heading) {
      line = line.replace(/[ \t]+#+[ \t]*$/u, '');
    }
    line = line.replace(/^ {0,6}(?:[-+*]|\d{1,9}[.)])[ \t]+/u, '');
    output.push(inlineText(line, spend));
  }
  return output.join('\n').trim();
};
