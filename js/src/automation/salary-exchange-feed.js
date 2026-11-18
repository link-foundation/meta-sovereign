// Fixed primary source; no caller-supplied URL, redirects or external entities.
import { DOMParser } from '@xmldom/xmldom';
import { normalizeSalaryExchange } from './salary-calculation-config.js';

export const CBR_EXCHANGE_URL = 'https://www.cbr.ru/scripts/XML_daily.asp';
const MAX_BYTES = 1024 * 1024;
const invalid = () => {
  throw new Error('invalid salary exchange feed');
};
const field = (node, name) => {
  const nodes = Array.from(node.childNodes).filter(
    (child) => child.nodeName === name
  );
  if (
    nodes.length !== 1 ||
    nodes[0].childNodes.length !== 1 ||
    nodes[0].firstChild.nodeType !== 3
  ) {
    invalid();
  }
  return nodes[0].textContent.trim();
};

export const parseCbrExchange = (text) => {
  if (
    typeof text !== 'string' ||
    text.length > MAX_BYTES ||
    text.includes('<!') ||
    (text.match(/</gu)?.length ?? 0) > 2000
  ) {
    invalid();
  }
  const document = new DOMParser({ onError: invalid }).parseFromString(
    text,
    'application/xml'
  );
  const root = document.documentElement;
  if (root?.nodeName !== 'ValCurs') {
    invalid();
  }
  const date = /^(\d{2})\.(\d{2})\.(\d{4})$/u.exec(root.getAttribute('Date'));
  if (!date) {
    invalid();
  }
  const entries = Array.from(root.childNodes).filter(
    (node) => node.nodeType === 1
  );
  if (
    !entries.length ||
    entries.length > 100 ||
    entries.some((node) => node.nodeName !== 'Valute')
  ) {
    invalid();
  }
  const rates = entries.map((node) => {
    const code = field(node, 'CharCode');
    const nominal = field(node, 'Nominal');
    const value = field(node, 'Value');
    if (
      !/^[A-Z]{3}$/u.test(code) ||
      !/^[1-9]\d{0,8}$/u.test(nominal) ||
      !/^\d+(?:,\d+)?$/u.test(value)
    ) {
      invalid();
    }
    return { code, rate: Number(value.replace(',', '.')) / Number(nominal) };
  });
  if (!rates.some(({ code }) => code === 'USD')) {
    invalid();
  }
  return normalizeSalaryExchange({
    base: 'RUB',
    rates,
    asOf: `${date[3]}-${date[2]}-${date[1]}`,
    source: 'cbr',
    maxAgeDays: 7,
  });
};

const readBytes = async (response) => {
  if (
    !response.ok ||
    Number(response.headers.get('content-length')) > MAX_BYTES ||
    !response.body
  ) {
    throw new Error('salary exchange feed unavailable');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new Error('salary exchange feed exceeds 1 MiB');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    result.set(chunk, at);
    at += chunk.byteLength;
  }
  return result;
};

export const fetchCbrExchange = async ({
  fetchImpl = globalThis.fetch,
  timeoutMs = 10000,
} = {}) => {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(CBR_EXCHANGE_URL, {
      signal: controller.signal,
      redirect: 'error',
      headers: { accept: 'application/xml, text/xml' },
    });
    const bytes = await readBytes(response);
    return parseCbrExchange(new TextDecoder('windows-1251').decode(bytes));
  } finally {
    globalThis.clearTimeout(timer);
    controller.abort();
  }
};
