import { askTerminalSecret } from './secret-prompt.js';
import { LINO_TEXT, encodeWire, readWireResponse } from '../transport/lino.js';
import {
  isVkTokenStatus,
  isVkTokenRefusal,
} from '../transport/vk-token-status.js';

const endpointFor = (value, action) => {
  const url = new URL(value ?? 'http://127.0.0.1:8787');
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    (url.protocol === 'http:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  ) {
    throw new Error('VK token server must be an HTTPS or loopback HTTP origin');
  }
  return new URL(
    `/api/vk/token${action === 'status' ? '' : `/${action}`}`,
    url
  );
};

const commandInput = (args) => {
  const action = args._?.length ? args._.join(' ') : 'status';
  if (
    !['status', 'start', 'import', 'cancel'].includes(action) ||
    Object.keys(args).some(
      (key) => !['_', 'url', 'confirm', 'id'].includes(key)
    ) ||
    (['start', 'import'].includes(action) && args.confirm !== true) ||
    (action === 'cancel' && !/^[a-f0-9-]{36}$/i.test(args.id ?? ''))
  ) {
    throw new Error(
      'use vk-token status|start|import|cancel; start/import require --confirm, cancel requires --id; tokens use a masked prompt'
    );
  }
  return { action, url: endpointFor(args.url, action) };
};

export const createVkTokenCommands = ({
  fetchImpl = globalThis.fetch,
  askSecret = askTerminalSecret,
} = {}) => ({
  'vk-token': async (args, log) => {
    const { action, url } = commandInput(args);
    const controller = new AbortController();
    const stop = () => controller.abort();
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    try {
      const input = {
        ...(args.confirm === true ? { confirm: true } : {}),
        ...(action === 'cancel' ? { id: args.id } : {}),
      };
      if (action === 'import') {
        input.value = await askSecret(
          'VK token or exact standalone redirect URL',
          {
            signal: controller.signal,
          }
        );
      }
      const response = await fetchImpl(url, {
        signal: controller.signal,
        headers: { accept: LINO_TEXT, 'content-type': LINO_TEXT },
        ...(action === 'status'
          ? {}
          : {
              method: 'POST',
              body: encodeWire(input, LINO_TEXT),
            }),
      });
      const result = await readWireResponse(response);
      if (isVkTokenRefusal(result)) {
        log(encodeWire({ ok: false, code: result.code }, LINO_TEXT));
        return 1;
      }
      if (!response.ok || !isVkTokenStatus(result)) {
        log(
          'VK token action was not confirmed. Read status before retrying; unlock the app and configure protected storage if needed.'
        );
        return 1;
      }
      log(encodeWire(result, LINO_TEXT));
      return ['failed', 'cancelled'].includes(result.state) ? 1 : 0;
    } catch {
      log(
        'VK token action was interrupted or unavailable. Read status before retrying.'
      );
      return 1;
    } finally {
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
    }
  },
});
