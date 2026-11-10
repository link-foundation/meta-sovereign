import {
  isQuestion,
  MAX_QUESTION_LENGTH,
} from '../crm/question-recognition.js';

const conditional = (text) =>
  /^(?:(?:if|если)(?![\p{L}\p{N}_])|如果|若|(?:यदि|अगर)(?![\p{L}\p{M}]))/iu.test(
    text
  );
const marker = (line) => {
  const match = line.match(/^(\s*)(?:(\d{1,2})[.)]|([-•*]))\s+(.+)$/u);
  return (
    match && {
      indent: match[1].replace(/\t/gu, '    ').length,
      style: match[2] ? 'numbered' : match[3],
      number: match[2] && Number(match[2]),
      text: match[4],
    }
  );
};
const codeLine = (line, fence) => {
  const token = line.trim().match(/^(`{3,}|~{3,})(.*)$/u);
  if (fence) {
    const closes =
      token &&
      token[1][0] === fence[0] &&
      token[1].length >= fence.length &&
      !token[2].trim();
    return { fence: closes ? null : fence, code: true };
  }
  return { fence: token?.[1] ?? null, code: Boolean(token) };
};

// Literal question marks and list markers inside balanced fences are content.
// An unfinished fence cannot establish a complete reusable answer.
export const questionProse = (text) => {
  if (typeof text !== 'string' || text.length > 12000) {
    return null;
  }
  let fence = null;
  const prose = [];
  for (const line of text.split('\n')) {
    const next = codeLine(line, fence);
    fence = next.fence;
    if (!next.code) {
      prose.push(line);
    }
  }
  return fence ? null : prose.join('\n');
};
const append = (state, line, code = false) => {
  if (!state.parts.length) {
    return !line.trim();
  }
  state.parts[state.parts.length - 1] += `\n${code ? line : line.trim()}`;
  return true;
};
const addPart = (state, text) => {
  if (state.parts.length >= 20 || (!state.numberedOnly && conditional(text))) {
    return false;
  }
  state.parts.push(text);
  return true;
};
const listLine = (state, line, item) => {
  if (!item || item.indent > state.indent) {
    return append(state, line);
  }
  if (item.indent !== state.indent || item.style !== state.style) {
    return false;
  }
  if (state.style !== 'numbered' && conditional(item.text)) {
    return append(state, item.text);
  }
  return (
    (!item.number || item.number === state.parts.length + 1) &&
    addPart(state, item.text)
  );
};
const proseLine = (state, line, item) => {
  if (item) {
    return false;
  }
  const text = line.trim();
  return isQuestion(text) && !conditional(text)
    ? addPart(state, text)
    : append(state, text);
};
const blocks = (text, numberedOnly) => {
  const lines = text.split('\n');
  const first = marker(lines.find((line) => line.trim()) ?? '');
  if (numberedOnly && first?.style !== 'numbered') {
    return null;
  }
  const state = {
    parts: [],
    style: first?.style,
    indent: first?.indent,
    fence: null,
    numberedOnly,
  };
  for (const line of lines) {
    const next = codeLine(line, state.fence);
    state.fence = next.fence;
    const valid =
      next.code || !line.trim()
        ? append(state, line, next.code)
        : state.style
          ? listLine(state, line, marker(line))
          : proseLine(state, line, marker(line));
    if (!valid) {
      return null;
    }
  }
  return state.fence ? null : state.parts.map((part) => part.trim());
};

export const splitQuestionBlocks = (text) => {
  const value = String(text ?? '').trim();
  if (value.length > MAX_QUESTION_LENGTH) {
    return [value];
  }
  const parts = blocks(value, false);
  return parts?.length > 1 &&
    parts.every((part) => isQuestion(questionProse(part)))
    ? parts
    : [value];
};
export const splitNumberedAnswers = (text) =>
  typeof text === 'string' && text.length <= 12000 ? blocks(text, true) : null;
