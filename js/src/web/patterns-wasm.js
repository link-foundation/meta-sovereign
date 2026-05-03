const encoder = new globalThis.TextEncoder();

const defaultWasmUrl = () => new URL('./pattern-matcher.wasm', import.meta.url);

const readWasmBytes = async ({ bytes, wasmUrl, fetchImpl }) => {
  if (bytes) {
    return bytes instanceof ArrayBuffer
      ? bytes
      : bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        );
  }
  const fetcher = fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!fetcher) {
    throw new Error('fetch is required to load pattern-matcher.wasm');
  }
  const res = await fetcher(wasmUrl ?? defaultWasmUrl());
  if (!res.ok) {
    throw new Error(`pattern-matcher.wasm: HTTP ${res.status}`);
  }
  return res.arrayBuffer();
};

const writeString = (memory, alloc, text) => {
  const bytes = encoder.encode(String(text ?? ''));
  if (bytes.byteLength === 0) {
    return { ptr: 0, len: 0 };
  }
  const ptr = alloc(bytes.byteLength);
  if (!ptr) {
    throw new Error('pattern wasm allocation failed');
  }
  new Uint8Array(memory.buffer, ptr, bytes.byteLength).set(bytes);
  return { ptr, len: bytes.byteLength };
};

export const wasmPatternSourceSupported = (source) => {
  const stripped = String(source ?? '')
    .replaceAll('\\\\', '')
    .replaceAll('\\S+', '')
    .replaceAll('\\s+', '');
  return !/[()[\]{}|.*?+]/.test(stripped);
};

export const instantiateWasmPatternMatcher = async ({
  bytes,
  wasmUrl,
  fetchImpl,
  WebAssemblyImpl = globalThis.WebAssembly,
} = {}) => {
  if (!WebAssemblyImpl?.instantiate) {
    throw new Error('WebAssembly is not available');
  }
  const source = await readWasmBytes({ bytes, wasmUrl, fetchImpl });
  const instantiated = await WebAssemblyImpl.instantiate(source, {});
  const instance = instantiated.instance ?? instantiated;
  const {
    memory,
    ms_alloc,
    ms_dealloc,
    pattern_matches: wasmMatch,
  } = instance.exports;
  if (!memory || !ms_alloc || !ms_dealloc || !wasmMatch) {
    throw new Error('pattern matcher wasm exports are incomplete');
  }

  return {
    engine: 'wasm',
    matches(pattern, input) {
      const p = writeString(memory, ms_alloc, pattern);
      const i = writeString(memory, ms_alloc, input);
      try {
        return wasmMatch(p.ptr, p.len, i.ptr, i.len) === 1;
      } finally {
        ms_dealloc(p.ptr, p.len);
        ms_dealloc(i.ptr, i.len);
      }
    },
  };
};

export const createWasmPatternMatcher = instantiateWasmPatternMatcher;
