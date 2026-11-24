// EventSource requires UTF-8 text/event-stream. Each data field contains a
// single Lino record; escaped message newlines cannot become SSE delimiters.
import { encodeWire, LINO_LINE, JSON_MEDIA } from '../transport/lino.js';
import { legacyWire } from './wire.js';

export const eventWireType = (req) => {
  const compatibility = (req.lino ?? legacyWire).jsonCompatibility;
  const format = new URL(req.url ?? '/', 'http://local').searchParams.get(
    'format'
  );
  if (format === 'lino-line') {
    return LINO_LINE;
  }
  if (format === 'json') {
    return compatibility ? JSON_MEDIA : null;
  }
  return format ? null : compatibility ? JSON_MEDIA : LINO_LINE;
};

export const eventFrame = (event, data, type = LINO_LINE) =>
  `event: ${event}\ndata: ${encodeWire(data, type, {
    jsonCompatibility: type === JSON_MEDIA,
  })}\n\n`;
