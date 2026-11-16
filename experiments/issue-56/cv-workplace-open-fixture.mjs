import { openNativeCvWorkplace } from '../../js/src/jobs/cv-workplace-open.js';

/** Finite event fixture; navigation and click are recorded without a provider. */
export const cvWorkplaceOpenFixture = (options = {}) => {
  const change = {
    hash: 'abc123',
    workplace: {
      recordId: '123',
      job: { company: 'ArtBridge', position: 'Engineer', description: 'Rust' },
    },
  };
  const editor = 'https://hh.ru/profile/edit/experience/123';
  const list = `https://hh.ru/profile/edit/experience?resumeFrom=${change.hash}&hhtmFrom=resume`;
  const events = [];
  let url = options.url ?? 'https://hh.ru/resume/abc123';
  let reads = 0;
  const handle = {
    evaluate: async () => options.connected !== false,
    click: async () => {
      events.push('click');
      url = options.clickedUrl ?? `${editor}?resumeFrom=abc123&hhtmFrom=resume`;
    },
    dispose: async () => events.push('dispose'),
  };
  const session = {
    page: {
      url: () => url,
      goto: async (value) => {
        events.push(['goto', value]);
        url = options.redirect ?? value;
      },
      locator: (selector) => ({
        nth: (index) => ({
          elementHandle: async () => {
            events.push(['handle', selector, index]);
            return handle;
          },
        }),
      }),
      waitForURL: async (accept) => {
        if (!accept(new URL(url))) {
          throw new Error('Wrong native destination');
        }
      },
    },
    commander: {
      evaluate: async () => {
        reads++;
        return {
          ready: true,
          candidates: [{ index: 3, ready: true }],
          selector: 'native-list-controls',
          ...options.state?.({ reads, url, events }),
        };
      },
    },
  };
  return {
    events,
    change,
    editor,
    list,
    url: () => url,
    run: () =>
      openNativeCvWorkplace({
        session,
        change,
        check: () => options.check?.(events),
        phase: async (state) => {
          events.push(state);
          await options.phase?.();
        },
        readinessMs: options.readinessMs ?? 1000,
      }),
  };
};
