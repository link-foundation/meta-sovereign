import { Parser } from 'htmlparser2';

/** Streaming markup tokens, without regex rescans of malformed input. */
export const visitHtml = (html, handlers, options = {}) => {
  const parser = new Parser(handlers, {
    decodeEntities: false,
    recognizeSelfClosing: true,
    ...options,
  });
  parser.end(String(html ?? ''));
};
