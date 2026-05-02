import {
  instantiateWasmPatternMatcher,
  wasmPatternSourceSupported,
} from './patterns-wasm.js';

let matcherPromise = null;
const workerGlobal = globalThis;

const textsFrom = (messages = []) =>
  messages.map((m) => (typeof m === 'string' ? m : String(m?.body ?? '')));

const regexMatch = ({ pattern, flags = 'i', messages }) => {
  const regex = new RegExp(pattern, flags);
  const matches = textsFrom(messages).filter((text) => regex.test(text));
  return { count: matches.length, matches, engine: 'js' };
};

const wasmMatch = async ({ pattern, messages }) => {
  matcherPromise ??= instantiateWasmPatternMatcher();
  const matcher = await matcherPromise;
  const matches = textsFrom(messages).filter((text) =>
    matcher.matches(pattern, text)
  );
  return { count: matches.length, matches, engine: matcher.engine };
};

workerGlobal.onmessage = async (event) => {
  const { id, pattern, flags, messages } = event.data ?? {};
  try {
    const result = wasmPatternSourceSupported(pattern)
      ? await wasmMatch({ pattern, messages })
      : regexMatch({ pattern, flags, messages });
    workerGlobal.postMessage({ id, ok: true, ...result });
  } catch (err) {
    try {
      workerGlobal.postMessage({
        id,
        ok: true,
        ...regexMatch({ pattern, flags, messages }),
      });
    } catch (fallbackErr) {
      workerGlobal.postMessage({
        id,
        ok: false,
        error: fallbackErr.message ?? err.message,
      });
    }
  }
};
