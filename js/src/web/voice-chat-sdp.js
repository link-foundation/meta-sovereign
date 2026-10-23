// The join params JSON and the remote SDP of a Telegram voice chat
// (R-Y188; learned from how the web clients behave and from public
// descriptions of the format, never copied). Pure strings in, strings out.
//
// Joining: the browser makes a local offer; from it Telegram wants
//   { ufrag, pwd, fingerprints: [{ hash, setup, fingerprint }], ssrc,
//     "ssrc-groups": [] }
// and answers with a JSON of its own: { transport: { ufrag, pwd,
// fingerprints, candidates, "rtcp-mux" }, audio: { "payload-types",
// "rtp-hdrexts" } }. That is turned back into a remote SDP: the first
// audio section is our own, and — as Telegram's server forwards each
// speaker's stream under its own ssrc — one receive-only section per
// other participant, added by renegotiating with a remote offer.

const lines = (sdp) => String(sdp ?? '').split(/\r?\n/);

/** An ssrc as an unsigned 32-bit number (SDP) and a signed one (TL). */
export const unsigned = (n) => Number(n) >>> 0;
export const signed = (n) => Number(n) | 0;

/**
 * The join params JSON object from a local offer (or null when the offer
 * lacks what Telegram needs: ice credentials, a fingerprint, an ssrc).
 */
export const joinParamsOf = (sdp) => {
  const all = lines(sdp);
  const value = (prefix) =>
    all.find((l) => l.startsWith(prefix))?.slice(prefix.length);
  const ufrag = value('a=ice-ufrag:');
  const pwd = value('a=ice-pwd:');
  const prints = all
    .filter((l) => l.startsWith('a=fingerprint:'))
    .map((l) => {
      const [hash, fingerprint] = l.slice('a=fingerprint:'.length).split(' ');
      return { hash, setup: 'active', fingerprint };
    })
    .filter((f) => f.hash && f.fingerprint);
  const ssrc = /^a=ssrc:(\d+)\s/.exec(all.find((l) => l.startsWith('a=ssrc:')));
  if (!ufrag || !pwd || prints.length === 0 || !ssrc) {
    return null;
  }
  return {
    ufrag,
    pwd,
    fingerprints: prints,
    ssrc: unsigned(ssrc[1]),
    'ssrc-groups': [],
  };
};

const candidateLine = (c) =>
  [
    `a=candidate:${c.foundation} ${c.component}`,
    String(c.protocol).toLowerCase(),
    `${c.priority} ${c.ip} ${c.port} typ ${c.type}`,
    c['rel-addr'] ? `raddr ${c['rel-addr']} rport ${c['rel-port']}` : '',
    c.tcptype ? `tcptype ${c.tcptype}` : '',
    `generation ${c.generation ?? 0}`,
  ]
    .filter(Boolean)
    .join(' ');

const paramText = (parameters) =>
  Object.entries(parameters ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join(';');

// The a= lines of one payload type: rtpmap, fmtp, rtcp-fb.
const payloadLines = (p) => [
  `a=rtpmap:${p.id} ${p.name}/${p.clockrate}${p.channels > 1 ? `/${p.channels}` : ''}`,
  ...(p.parameters && Object.keys(p.parameters).length > 0
    ? [`a=fmtp:${p.id} ${paramText(p.parameters)}`]
    : []),
  ...(p['rtcp-fbs'] ?? []).map(
    (f) => `a=rtcp-fb:${p.id} ${f.type}${f.subtype ? ` ${f.subtype}` : ''}`
  ),
];

const DEFAULT_OPUS = {
  id: 111,
  name: 'opus',
  clockrate: 48000,
  channels: 2,
  parameters: { minptime: 10, useinbandfec: 1 },
  'rtcp-fbs': [{ type: 'transport-cc' }],
};

/** The audio payload types of Telegram's answer (Opus when none). */
export const audioPayloads = (answer) => {
  const list = answer?.audio?.['payload-types'];
  return Array.isArray(list) && list.length > 0 ? list : [DEFAULT_OPUS];
};

// The transport lines every section repeats.
const transportLines = (transport, setup) => [
  `a=ice-ufrag:${transport.ufrag}`,
  `a=ice-pwd:${transport.pwd}`,
  ...(transport.fingerprints ?? []).map(
    (f) => `a=fingerprint:${f.hash} ${f.fingerprint}`
  ),
  `a=setup:${setup}`,
];

const section = (
  answer,
  { mid, direction, setup, source, first, port = 1 }
) => {
  const transport = answer.transport ?? {};
  const payloads = audioPayloads(answer);
  const ssrc = source === undefined ? null : unsigned(source);
  return [
    `m=audio ${port} UDP/TLS/RTP/SAVPF ${payloads.map((p) => p.id).join(' ')}`,
    'c=IN IP4 0.0.0.0',
    'a=rtcp:1 IN IP4 0.0.0.0',
    ...transportLines(transport, setup),
    ...(first ? (transport.candidates ?? []).map(candidateLine) : []),
    `a=mid:${mid}`,
    ...(answer.audio?.['rtp-hdrexts'] ?? []).map(
      (h) => `a=extmap:${h.id} ${h.uri}`
    ),
    `a=${direction}`,
    ...(transport['rtcp-mux'] === false ? [] : ['a=rtcp-mux']),
    ...payloads.flatMap(payloadLines),
    ...(ssrc === null
      ? []
      : [
          `a=msid:stream${ssrc} audio${ssrc}`,
          `a=ssrc:${ssrc} cname:stream${ssrc}`,
          `a=ssrc:${ssrc} msid:stream${ssrc} audio${ssrc}`,
        ]),
  ];
};

/**
 * The remote SDP from Telegram's answer JSON.
 * - `kind: 'answer'` (the first one): only our own section (mid 0);
 * - `kind: 'offer'` (every later one): mid 0 again plus one receive-only
 *   section per entry of `sources` (signed or unsigned ssrcs; a `null`
 *   source keeps its mid but is closed). `version` grows with each offer.
 */
export const remoteSdpOf = (
  answer,
  { kind = 'answer', sources = [], version = 1 } = {}
) => {
  const offer = kind === 'offer';
  const mids = ['0', ...sources.map((_, i) => String(i + 1))];
  const head = [
    'v=0',
    `o=- ${version} ${version} IN IP4 0.0.0.0`,
    's=-',
    't=0 0',
    'a=ice-lite',
    `a=group:BUNDLE ${mids.join(' ')}`,
    'a=msid-semantic: WMS *',
  ];
  const own = section(answer, {
    mid: '0',
    direction: offer ? 'recvonly' : 'sendrecv',
    setup: offer ? 'actpass' : 'passive',
    first: true,
  });
  const others = sources.flatMap((source, i) =>
    source === null
      ? section(answer, {
          mid: String(i + 1),
          direction: 'inactive',
          setup: 'actpass',
          port: 0,
        })
      : section(answer, {
          mid: String(i + 1),
          direction: 'sendonly',
          setup: 'actpass',
          source,
        })
  );
  return `${[...head, ...own, ...others].join('\r\n')}\r\n`;
};

/**
 * The sources to listen to after the participants changed: the previous
 * list keeps its places (a mid never moves), those gone become `null`,
 * new ones are appended. `mine` is our own (never listened to).
 */
export const nextSources = (previous, participants, mine) => {
  const wanted = new Set(
    participants
      .filter((p) => p.source && unsigned(p.source) !== unsigned(mine))
      .map((p) => unsigned(p.source))
  );
  const kept = previous.map((s) => (s !== null && wanted.has(s) ? s : null));
  const known = new Set(kept.filter((s) => s !== null));
  return [...kept, ...[...wanted].filter((s) => !known.has(s))];
};
