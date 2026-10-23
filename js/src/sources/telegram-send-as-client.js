// The client every send path uses to send as another identity (R-Y141;
// learned, never copied): its send requests carry `send_as`. Apart from
// telegram-send-as.js so the send modules can use it without a cycle.

const PEER_ID = /^-?\d{1,20}$/;
const SENDS =
  /^(messages\.)?(SendMessage|SendMedia|SendMultiMedia|SendInlineBotResult)$/;

/** Whether `value` is a peer id the page may name, or absent. */
export const validSendAs = (value) =>
  value === undefined || (typeof value === 'string' && PEER_ID.test(value));

const text = (value) => String(value ?? '');

// The input peers an answer named, to send as them without a lookup.
const knownInputs = new WeakMap(); // client -> Map(id -> InputPeer)

export const rememberInputs = (client, inputs) =>
  knownInputs.set(client, inputs);

const invalid = () =>
  Object.assign(new Error('SEND_AS_PEER_INVALID'), {
    errorMessage: 'SEND_AS_PEER_INVALID',
  });

// The input peer of a peer id: one an answer named, else resolved.
export const inputOf = async (env, client, id) => {
  if (!PEER_ID.test(id)) {
    throw invalid();
  }
  return (
    knownInputs.get(client)?.get(id) ??
    env.connection.withPeer(client, id, (peer) => client.getInputEntity(peer))
  );
};

// `client` with `send_as` set on its send requests.
const stamped = (client, sendAs) =>
  new Proxy(client, {
    get: (target, key, receiver) =>
      key === 'invoke'
        ? (request, ...rest) => {
            if (SENDS.test(String(request?.className)) && !request.sendAs) {
              request.sendAs = sendAs;
            }
            return target.invoke(request, ...rest);
          }
        : Reflect.get(target, key, receiver),
  });

/**
 * `client`, or — with a peer id `sendAs` — a client whose sends go as
 * that peer. Rejects (a Telegram error) when the peer is not valid.
 */
export const withSendAs = async (env, client, sendAs) =>
  sendAs ? stamped(client, await inputOf(env, client, text(sendAs))) : client;
