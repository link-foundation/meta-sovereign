// Issue #29 / R-E11..R-E13: Naukri, VietnamWorks and TopCV join the
// source registry as browser-only boards — their archives parse like
// every other source, and every live resume write is delegated to the
// declarative CV plans instead of an API we cannot verify.

import { describe, it, expect } from 'test-anywhere';

import { createFakeCommander } from './helpers/fake-commander.js';
import {
  BrowserOnlySourceError,
  cvPlatformOf,
  getSource,
  jobBoardArchiveToLinks,
  listCvSources,
} from '../src/sources/index.js';

describe('job-board archives', () => {
  it('maps a Naukri recruiter inbox dump to message links', async () => {
    const links = await getSource('naukri').parseArchive(
      JSON.stringify({
        messages: [
          {
            id: 'm-1',
            recruiterName: 'Priya',
            jobId: '77',
            message: 'We liked your profile',
            createdAt: '2026-09-01T10:00:00Z',
          },
        ],
      })
    );
    expect(links.length).toBe(1);
    expect(links[0].id).toBe('msg:naukri:m-1');
    expect(links[0].tokens).toEqual(['message', 'naukri', 'm-1']);
    expect(links[0].sender).toBe('Priya');
    expect(links[0].chat).toBe('job:77');
    expect(links[0].body).toBe('We liked your profile');
    expect(links[0].timestamp).toBe('2026-09-01T10:00:00Z');
  });

  it('flattens VietnamWorks conversations and inherits the thread id', async () => {
    const links = await getSource('vietnamworks').parseArchive({
      conversations: [
        {
          conversationId: 'c-9',
          companyName: 'Acme VN',
          messages: [
            { id: 'a', content: 'Hello', sentAt: '2026-09-02' },
            { id: 'b', content: 'Any update?', sentAt: '2026-09-03' },
          ],
        },
      ],
    });
    expect(links.map((link) => link.id)).toEqual([
      'msg:vietnamworks:a',
      'msg:vietnamworks:b',
    ]);
    // The message rows carry no sender/chat of their own.
    expect(links[0].sender).toBe('Acme VN');
    expect(links[1].chat).toBe('job:c-9');
  });

  it('reads TopCV rows with Vietnamese field names', async () => {
    const links = await getSource('topcv').parseArchive({
      tin_nhan: [
        {
          nha_tuyen_dung: 'FPT',
          noi_dung: 'Chào bạn',
          thoi_gian: '2026-09-04',
        },
      ],
    });
    // No id in the dump: the position becomes the external id.
    expect(links[0].id).toBe('msg:topcv:1');
    expect(links[0].sender).toBe('FPT');
    expect(links[0].body).toBe('Chào bạn');
    expect(links[0].chat).toBe('job:inbox');
  });

  it('ignores collections a dump does not contain', () => {
    expect(jobBoardArchiveToLinks('naukri', { other: [1, 2] })).toEqual([]);
    expect(jobBoardArchiveToLinks('naukri', '{}')).toEqual([]);
  });
});

describe('browser-only boards', () => {
  it('refuses message API calls with a typed error', async () => {
    for (const name of ['naukri', 'vietnamworks', 'topcv']) {
      const { live } = getSource(name);
      let error = null;
      try {
        await live.pullMessages();
      } catch (caught) {
        error = caught;
      }
      expect(error instanceof BrowserOnlySourceError).toBe(true);
      expect(error.code).toBe('browser-only-source');
      expect(error.message).toContain(`cv sync --platform ${name}`);
      expect(live.browserOnly).toBe(true);
    }
  });

  it('points at the inbox a human can open instead', () => {
    expect(getSource('topcv').live.inboxUrl).toBe(
      'https://www.topcv.vn/tin-nhan'
    );
  });
});

describe('sources bound to CV plans', () => {
  it('binds every job board to its declarative plan', () => {
    expect(listCvSources()).toEqual([
      'linkedin',
      'habr-career',
      'hh',
      'superjob',
      'naukri',
      'vietnamworks',
      'topcv',
    ]);
    expect(getSource('hh').cvPlatform).toBe('hh');
    expect(cvPlatformOf(getSource('topcv')).label).toBe('TopCV');
    // API-backed adapters keep their own resume sync.
    expect(typeof getSource('hh').live.pullMessages).toBe('function');
  });

  it('writes a Naukri resume through the CV plan in a browser', async () => {
    const commander = createFakeCommander({
      pages: {
        'https://www.naukri.com/mnjuser/profile': {
          nodes: {
            '.card.resumeHeadline .edit': [{ text: 'edit' }],
            '#resumeHeadlineForm': [{ text: '' }],
            '#resumeHeadlineTxt': [{ text: '' }],
            '.drawer button[type="submit"]': [{ text: 'Save' }],
            '.drawer': [{ text: '', html: '<div class="drawer"></div>' }],
          },
        },
      },
    });
    const result = await getSource('naukri').syncResume(
      { basics: { headline: 'Staff Engineer' } },
      { commander, groups: ['headline'] }
    );
    expect(result.applied).toEqual(['headline']);
    expect(commander.calls.fill[0].text).toBe('Staff Engineer');
    expect(commander.calls.goto[0]).toBe(
      'https://www.naukri.com/mnjuser/profile'
    );
  });

  it('exposes readResume on the boards that already had an API', () => {
    expect(typeof getSource('linkedin').readResume).toBe('function');
    expect(typeof getSource('superjob').writeResume).toBe('function');
    expect(getSource('habr-career').cvPlatform).toBe('habr-career');
  });
});
