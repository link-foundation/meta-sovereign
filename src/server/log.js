/**
 * Structured JSON logging (ROADMAP §7).
 *
 * Tiny opt-in factory: when `MS_LOG_FORMAT=json` is set the server
 * emits one JSON object per line on stdout, suitable for ingestion by
 * log shippers (vector, fluent-bit, the Loki agent, ...). Default
 * mode keeps stdout silent so unit tests stay clean.
 *
 * The shape is always:
 *
 *   {"ts":"2024-01-01T00:00:00.000Z","level":"info","event":"http",
 *    "method":"GET","path":"/links","status":200,"duration_ms":3}
 *
 * Tests can pass their own `write` to capture lines.
 */

export const jsonLog =
  ({ write = (line) => process.stdout.write(line) } = {}) =>
  (entry) => {
    const merged = {
      ts: new Date().toISOString(),
      level: entry.level ?? 'info',
      ...entry,
    };
    write(`${JSON.stringify(merged)}\n`);
  };
