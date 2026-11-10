// Read the reference contact file's flat key/indented-value format. The
// upstream lossless parser owns quoting; malformed structures never become text.
import { Parser } from 'links-notation';
import { PROFILE_KEY } from './question-profile.js';

const contentTokens = (line) =>
  line.children.filter(
    (token) => !['whitespace', 'newline', 'comment'].includes(token.kind)
  );
const syntax = (text) => {
  try {
    const tree = new Parser({ maxInputSize: 256000, maxDepth: 4 }).parseCst(
      text
    );
    // The general grammar permits bare references starting with an unmatched
    // quote. A contact file must never import that partial literal.
    if (
      tree
        .tokens()
        .some(
          (token) =>
            token.kind === 'reference' &&
            ['"', "'", '`'].includes(token.text[0]) &&
            !token.quote
        )
    ) {
      throw new Error('unfinished contact literal');
    }
    return tree;
  } catch {
    // Parser errors may include the owner's source text.
    throw new Error('legacy contacts must use valid bounded Links Notation');
  }
};

const readBlocks = (text) => {
  const blocks = [];
  let current = null;
  let lineNumber = 1;
  for (const line of syntax(text).children) {
    const start = lineNumber;
    lineNumber += (line.text.match(/\r\n|[\r\n]/gu) ?? []).length;
    if (lineNumber > 4096) {
      throw new Error('legacy contacts exceed 4096 lines');
    }
    const tokens = contentTokens(line);
    if (!tokens.length || line.text.trimStart().startsWith('//')) {
      continue;
    }
    const indent =
      line.children[0]?.kind === 'whitespace' ? line.children[0].text : '';
    if (!indent) {
      if (blocks.length >= 100) {
        throw new Error('legacy contacts exceed 100 entries');
      }
      current = contactBlock(tokens, start);
      blocks.push(current);
    } else if (!current) {
      throw new Error(
        'legacy contacts need a field before its indented values'
      );
    } else {
      const end = lineNumber - (/[\r\n]$/u.test(line.text) ? 1 : 0);
      readValue(current, tokens, indent, start, end);
    }
  }
  return blocks;
};

const contactBlock = (tokens, start) => {
  const key =
    tokens.length === 1 && tokens[0].kind === 'reference'
      ? tokens[0].value
      : null;
  return {
    key: PROFILE_KEY.test(key ?? '') ? key : null,
    line: start,
    end: start,
    values: [],
    invalid: null,
  };
};

const readValue = (block, tokens, indent, start, end) => {
  block.end = Math.max(start, end);
  if (indent !== '  ' || tokens.some((token) => token.kind !== 'reference')) {
    block.invalid = 'unsupported-structure-or-unquoted-colon';
    return;
  }
  if (tokens.length > 1 && tokens.some((token) => token.quote)) {
    block.invalid = 'ambiguous-quoted-value';
    return;
  }
  block.values.push(tokens.map((token) => token.value).join(' '));
};

export const fromLegacyContacts = (text, add, skipped) => {
  for (const block of readBlocks(text)) {
    const evidence = {
      source: 'contacts.lino',
      path: `lines:${block.line}-${block.end}`,
    };
    const reason =
      block.invalid ??
      (!block.key
        ? 'invalid-field-name'
        : !block.values.length
          ? 'missing-value'
          : null);
    if (reason) {
      skipped.push({ key: block.key, evidence, reason });
    } else {
      add(block.key, block.values.join('\n'), evidence);
    }
  }
};
