import { decodeWire } from '../transport/lino.js';
import {
  normalizeQuestionMatching,
  normalizeMatchPage,
} from '../automation/question-matching-options.js';

const numberFlag = (value, name) => {
  if (
    !['number', 'string'].includes(typeof value) ||
    (typeof value === 'string' && !value.trim())
  ) {
    throw new Error(`--${name} needs a number`);
  }
  return Number(value);
};

export const questionMatchingFlags = (args) => {
  const supplied =
    args.matching !== undefined ||
    args.threshold !== undefined ||
    args['case-sensitive'] !== undefined;
  if (!supplied) {
    return {};
  }
  if (
    args['case-sensitive'] !== undefined &&
    ![true, false, 'true', 'false'].includes(args['case-sensitive'])
  ) {
    throw new Error('--case-sensitive must be true or false');
  }
  const input = args.matching === undefined ? {} : decodeWire(args.matching);
  normalizeQuestionMatching(input);
  return {
    matching: normalizeQuestionMatching({
      ...input,
      ...(args.threshold === undefined
        ? {}
        : { threshold: numberFlag(args.threshold, 'threshold') }),
      ...(args['case-sensitive'] === undefined
        ? {}
        : { caseSensitive: [true, 'true'].includes(args['case-sensitive']) }),
    }),
  };
};

export const questionMatchPageFlags = (args) => {
  if (args['match-offset'] === undefined && args['match-limit'] === undefined) {
    return {};
  }
  return {
    matchPage: normalizeMatchPage({
      ...(args['match-offset'] === undefined
        ? {}
        : { offset: numberFlag(args['match-offset'], 'match-offset') }),
      ...(args['match-limit'] === undefined
        ? {}
        : { limit: numberFlag(args['match-limit'], 'match-limit') }),
    }),
  };
};
