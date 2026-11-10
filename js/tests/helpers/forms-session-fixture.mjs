import { EventEmitter } from 'node:events';

export const reviewUrl = 'https://example.test/form';
const url = reviewUrl;
export const reviewBrowser = () => {
  const calls = [];
  const page = new EventEmitter();
  let currentUrl = url;
  let closed = false;
  page.url = () => currentUrl;
  page.isClosed = () => closed;
  page.bringToFront = async () => {
    calls.push(['focus']);
  };
  page.exposeBinding = async (name, callback) => {
    if (name.startsWith('__formActivity_')) {
      page.activity = callback;
    }
  };
  page.addInitScript = async () => {};
  return {
    calls,
    page,
    policy: { headless: false },
    navigate: (value) => {
      currentUrl = value;
    },
    commander: {
      goto: async (options) => {
        currentUrl = options.url;
        calls.push(['goto', options.url]);
      },
      evaluate: async () => ({
        url: currentUrl,
        documentKey: 'fixture-document-1',
        title: 'Current page',
        fields: [],
        excluded: 0,
        reasons: [],
      }),
    },
    close: async () => {
      calls.push(['close']);
      closed = true;
      page.emit('close');
    },
  };
};
