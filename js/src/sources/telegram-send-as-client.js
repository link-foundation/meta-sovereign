// The client every send path uses to send as another identity (R-Y141;
// learned, never copied): its send requests carry `send_as`. Apart from
// telegram-send-as.js so the send modules can use it without a cycle.

const PEER_ID = /^-?\d{1,20}$/;
const SENDS =
  /^(messages\.)?(SendMessage|SendMedia|SendMultiMedia|SendInlineBotResult)$/;
// What a confirmed paid send stamps (R-Y184): those and a forward.
const PAID_SENDS =
  /^(messages\.)?(SendMessage|SendMedia|SendMultiMedia|SendInlineBotResult|ForwardMessages)$/;

/** The most Stars one send may be confirmed for. */
export const PAID_STARS_MAX = 1_000_000;

/** Whether `value` is a confirmed total of Stars (a positive whole number). */
export const validPaidStars = (value) =>
  Number.isSafeInteger(value) && value > 0 && value <= PAID_STARS_MAX;

/**
 * `{ allowPaidStars }` for what a body carries, or nothing (R-Y184): the
 * total the user confirmed for a paid send. A value that is not a whole
 * positive number is dropped, so the send goes unpaid and Telegram
 * refuses it (ALLOW_PAYMENT_REQUIRED) instead of charging.
 */
export const paidField = (body) =>
  validPaidStars(body?.allowPaidStars)
    ? { allowPaidStars: body.allowPaidStars }
    : {};

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

// `client` with `send_as` and the confirmed `allow_paid_stars` set on its
// send requests. The Stars are the very number the user confirmed, never
// computed here: a request that already names its own is left alone.
const stamped = (client, sendAs, paidStars) =>
  new Proxy(client, {
    get: (target, key, receiver) =>
      key === 'invoke'
        ? (request, ...rest) => {
            const name = String(request?.className);
            if (sendAs && SENDS.test(name) && !request.sendAs) {
              request.sendAs = sendAs;
            }
            if (paidStars && PAID_SENDS.test(name) && !request.allowPaidStars) {
              request.allowPaidStars = paidStars;
            }
            return target.invoke(request, ...rest);
          }
        : Reflect.get(target, key, receiver),
  });

/**
 * `client`, or — with a peer id `sendAs` and/or the `paidStars` the user
 * confirmed — a client whose sends go as that peer and carry exactly that
 * many Stars. Rejects (a Telegram error) when the peer is not valid.
 */
export const withSendAs = async (env, client, sendAs, paidStars) => {
  const input = sendAs ? await inputOf(env, client, text(sendAs)) : null;
  return input || validPaidStars(paidStars)
    ? stamped(client, input, validPaidStars(paidStars) ? paidStars : null)
    : client;
};
