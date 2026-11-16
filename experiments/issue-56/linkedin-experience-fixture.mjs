import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createMemoryStore } from '../../js/src/storage/index.js';
import { createLinkedinExperienceReader } from '../../js/src/cv/linkedin-experience-reader.js';

export const linkedinExportInput = (requestId = 'linkedin-native-fixture') => ({
  requestId,
  url: 'https://www.linkedin.com/in/fixture-owner/details/experience/',
  language: 'en',
});
const role = (title, period) => ({
  id: title,
  title,
  period,
  lines: [period, 'London, United Kingdom'],
  descriptions: ['Worked on Rust and PostgreSQL.'],
  marks: [
    {
      text: 'Skills: Rust',
      href: 'https://www.linkedin.com/skill-associations/Rust/',
    },
    { text: 'Demo', href: 'https://example.test/demo' },
  ],
  text: `${title}\n${period}\nWorked on Rust and PostgreSQL.`,
});
export const linkedinExperienceRaw = () => ({
  url: linkedinExportInput().url,
  language: 'en',
  text: 'Experience\nFixture Company\nLead engineer\nEngineer',
  items: [
    {
      parent: {
        ...role('Fixture Company', '2020 - Present'),
        lines: ['Full-time'],
      },
      roles: [
        role('Lead engineer', 'Jan 2023 - Present'),
        role('Engineer', '2020 - Dec 2022'),
      ],
    },
  ],
  more: 0,
  busy: false,
  bottom: true,
  empty: false,
});

export const linkedinReaderFixture = async (options = {}) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'linkedin-experience-'));
  const store = createMemoryStore();
  const artifactRoot = path.join(dir, 'artifacts');
  const calls = [];
  let navigated = false;
  const cookie = {
    name: 'li_at',
    get value() {
      throw new Error('Credential value read');
    },
  };
  const session = {
    page: {
      setDefaultTimeout: (ms) => calls.push(['timeout', ms]),
      context: () => ({ cookies: async () => options.cookies ?? [cookie] }),
    },
    commander: {
      goto: async (input) => {
        calls.push(['goto', input]);
        navigated = true;
      },
      evaluate: async ({ fn, args }) => {
        calls.push([fn.name, args]);
        if (fn.name === 'linkedinExperienceGate') {
          return (
            options.gate?.({ navigated, calls }) ?? {
              url: navigated ? linkedinExportInput().url : 'about:blank',
              wall: false,
              draft: false,
              ready: navigated,
            }
          );
        }
        if (fn.name === 'advanceLinkedinExperience') {
          return options.advance?.(args[0]) ?? { ambiguous: false, clicked: 0 };
        }
        return options.raw?.() ?? linkedinExperienceRaw();
      },
    },
    detach: async () => {
      calls.push(['detach']);
      await options.detach?.();
    },
  };
  const read = createLinkedinExperienceReader({
    store,
    artifactRoot,
    profileDir: path.join(dir, 'profile'),
    openSession: async (input) => {
      calls.push(['open', input]);
      await options.open?.();
      return session;
    },
    wait: options.wait ?? (async () => {}),
    now: options.now ?? (() => Date.UTC(2026, 10, 16)),
  });
  return {
    store,
    artifactRoot,
    dir,
    calls,
    read,
    close: () => rm(dir, { recursive: true, force: true }),
  };
};
