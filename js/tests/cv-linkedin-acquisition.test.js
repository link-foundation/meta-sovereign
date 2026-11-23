import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { linkedinExperienceDocument } from '../src/cv/linkedin-experience-parse.js';
import {
  experienceDocumentToLino,
  experienceDocumentFromLino,
} from '../src/cv/experience-document.js';
import { LINO_BINARY } from '../src/transport/lino.js';
import {
  linkedinExportInput,
  linkedinExperienceRaw,
  linkedinReaderFixture,
} from '../../experiments/issue-56/linkedin-experience-fixture.mjs';

const textRole = (title, period, grouped = false) => ({
  text: [
    title,
    ...(grouped ? [] : ['Fixture Company · Full-time']),
    period,
    'London, United Kingdom',
    'Original narrative.',
    'Skills: Rust',
    'Demo',
  ].join('\n'),
  marks: [
    {
      text: 'Skills: Rust',
      href: 'https://www.linkedin.com/skill-associations-details/Rust/',
    },
    { text: 'Demo', href: 'https://example.test/company/path' },
  ],
});
const fallbackItem = () => ({
  ...textRole('Engineer', 'Jan 2020 - Dec 2022'),
  unparsed: true,
  fallback: true,
  heading: 'Engineer\nFixture Company · Full-time\nJan 2020 - Dec 2022',
  roles: [],
});
const documentFrom = (items) =>
  linkedinExperienceDocument(
    { ...linkedinExperienceRaw(), items },
    linkedinExportInput(),
    '2026-11-16T00:00:00.000Z'
  );

test('text fallback preserves bounded native role fields and original links without entity classes', () => {
  const document = documentFrom([fallbackItem()]);
  const job = document.jobs[0];
  assert.deepEqual(
    [job.company, job.title, job.start, job.end, job.location],
    [
      'Fixture Company',
      'Engineer',
      '2020-01',
      '2022-12',
      'London, United Kingdom',
    ]
  );
  assert.equal(job.description, 'Original narrative.');
  assert.deepEqual(job.skills, ['Rust']);
  assert.equal(job.media[0].url, 'https://example.test/company/path');
  assert.equal(job.native.text, fallbackItem().text);
  assert.equal(job.native.company, 'Fixture Company · Full-time');
  assert.equal(job.native.acquisition, 'rendered-card-text');
  for (const type of [undefined, LINO_BINARY]) {
    assert.deepEqual(
      experienceDocumentFromLino(
        experienceDocumentToLino(document, type),
        type
      ),
      document
    );
  }
});

test('text fallback keeps one dated job per grouped role and retains uncertain location prose', () => {
  const raw = fallbackItem();
  raw.heading = 'Fixture Company\nFull-time · 6 yrs';
  raw.roles = [
    textRole('Lead', 'Jan 2023 - Present', true),
    textRole('Engineer', '2020 - Dec 2022', true),
  ];
  const jobs = documentFrom([raw]).jobs;
  assert.deepEqual(
    jobs.map((job) => [job.company, job.title, job.current]),
    [
      ['Fixture Company', 'Lead', true],
      ['Fixture Company', 'Engineer', false],
    ]
  );
  const unknown = fallbackItem();
  unknown.text = unknown.text.replace(
    'London, United Kingdom',
    'Built original systems, keeping all original prose.'
  );
  const job = documentFrom([unknown]).jobs[0];
  assert.equal(job.location, '');
  assert.ok(
    job.description.includes(
      'Built original systems, keeping all original prose.'
    )
  );
});

test('text fallback refuses ambiguous headers, duplicate date ranges, overlong cards and dateless records', () => {
  for (const patch of [
    { text: 'Engineer\nJan 2020 - Present' },
    { text: `${fallbackItem().text}\n2024 - Present` },
    { text: 'x'.repeat(100001) },
    { text: 'Engineer\nCompany\nOriginal prose' },
    {
      heading: 'Company\n2020 - Present',
      roles: [textRole('Lead', '2023 - Present', true)],
    },
    { roles: new Array(201).fill(textRole('Lead', '2023 - Present', true)) },
  ]) {
    assert.throws(() => documentFrom([{ ...fallbackItem(), ...patch }]), {
      code: 'cv-experience-document',
    });
  }
});

test('profile About is acquired in one owned tab and retained in four private hashed artifacts', async () => {
  const fixture = await linkedinReaderFixture();
  try {
    const result = await fixture.read(linkedinExportInput());
    assert.equal(result.document.profile.about, 'Synthetic profile biography.');
    assert.equal(
      result.document.profile.aboutAcquisition.boundary,
      'rendered-about-section'
    );
    for (const name of [
      'goto',
      'profile-new-page',
      'profile-goto',
      'profile-close',
      'detach',
    ]) {
      assert.equal(
        fixture.calls.filter(([called]) => called === name).length,
        1,
        name
      );
    }
    const folder = path.join(
      fixture.artifactRoot,
      linkedinExportInput().requestId
    );
    const evidence = JSON.parse(
      await readFile(path.join(folder, 'linkedin-experience.json'))
    );
    assert.equal(evidence.profileAbout.about, result.document.profile.about);
    assert.equal(result.files.length, 4);
    await result.discard();
    assert.deepEqual(await readdir(fixture.artifactRoot), []);
  } finally {
    await fixture.close();
  }
});

test('an unrendered About section remains unobserved rather than authorizing an empty replacement', async () => {
  const fixture = await linkedinReaderFixture({
    profileRaw: () => ({
      url: linkedinExportInput().url.replace(/details\/experience\/$/u, ''),
      observed: false,
      reason: 'section-not-rendered',
      bottom: true,
      busy: false,
      more: 0,
    }),
  });
  try {
    const { document } = await fixture.read(linkedinExportInput());
    assert.equal(Object.hasOwn(document.profile, 'about'), false);
    assert.equal(document.profile.aboutAcquisition.observed, false);
    assert.equal(
      document.profile.aboutAcquisition.reason,
      'section-not-rendered'
    );
  } finally {
    await fixture.close();
  }
});

test('a unique owner Add About offer records an empty baseline without opening an editing form', async () => {
  const url = linkedinExportInput().url.replace(/details\/experience\/$/u, '');
  const fixture = await linkedinReaderFixture({
    profileRaw: () => ({
      url,
      observed: false,
      reason: 'section-not-rendered',
      bottom: true,
    }),
    profileMenu: ({ action }) => {
      const steps = {
        open: { state: 'opened' },
        read: { state: 'offered', editor: `${url}add-edit/ABOUT/` },
        close: { state: 'closed' },
      };
      assert.ok(Object.hasOwn(steps, action));
      return steps[action];
    },
  });
  try {
    const { document } = await fixture.read(linkedinExportInput());
    assert.equal(document.profile.about, '');
    assert.equal(document.profile.aboutAcquisition.boundary, 'owner-add-about');
    assert.deepEqual(
      fixture.calls
        .filter(([name]) => name === 'inspectLinkedinAboutMenu')
        .map(([, { action }]) => action),
      ['open', 'read', 'read', 'close']
    );
  } finally {
    await fixture.close();
  }
});

test('LinkedIn export rejects a claimed Add About observation with unknown or nonempty text', () => {
  for (const patch of [
    { observed: false },
    { about: 'Unverified biography.' },
    { reason: 'section-not-rendered' },
  ]) {
    const options = linkedinExportInput();
    assert.throws(
      () =>
        linkedinExperienceDocument(
          {
            ...linkedinExperienceRaw(),
            profileAbout: {
              url: options.url.replace(/details\/experience\/$/u, ''),
              observed: true,
              about: '',
              boundary: 'owner-add-about',
              passes: 3,
              ...patch,
            },
          },
          options,
          '2026-11-16T00:00:00.000Z'
        ),
      { code: 'cv-experience-document' }
    );
  }
});

test('profile walls, markup replacement and unfinished traversal cannot acknowledge an export', async () => {
  for (const patch of [
    {
      profileGate: () => ({
        url: 'https://www.linkedin.com/login',
        wall: true,
        ready: true,
      }),
    },
    { profileRaw: () => ({ blocked: true }) },
    {
      profileRaw: () => ({
        url: linkedinExportInput().url.replace(/details\/experience\/$/u, ''),
        observed: false,
        busy: true,
        bottom: false,
      }),
    },
  ]) {
    const fixture = await linkedinReaderFixture(patch);
    try {
      await assert.rejects(fixture.read(linkedinExportInput()));
      assert.equal(fixture.calls.at(-1)[0], 'detach');
      assert.deepEqual(await readdir(fixture.artifactRoot).catch(() => []), []);
    } finally {
      await fixture.close();
    }
  }
});

test('an owner draft in the temporary profile tab is retained without closing or reading its values', async () => {
  const fixture = await linkedinReaderFixture({
    profileGate: () => ({ draft: true, wall: false }),
  });
  try {
    await assert.rejects(fixture.read(linkedinExportInput()), {
      code: 'cv-linkedin-draft',
    });
    assert.equal(
      fixture.calls.some(([name]) => name === 'profile-close'),
      false
    );
    assert.equal(
      fixture.calls.some(([name]) => name === 'scanLinkedinProfileAbout'),
      false
    );
    assert.equal(fixture.calls.at(-1)[0], 'detach');
  } finally {
    await fixture.close();
  }
});

test('the profile reader waits for main content after DOMContentLoaded within its existing bound', async () => {
  let gates = 0;
  const fixture = await linkedinReaderFixture({
    profileGate: () => ({
      url: linkedinExportInput().url.replace(/details\/experience\/$/u, ''),
      wall: false,
      draft: false,
      ready: ++gates > 1,
    }),
  });
  try {
    const { document } = await fixture.read(linkedinExportInput());
    assert.equal(document.profile.about, 'Synthetic profile biography.');
    assert.ok(gates >= 4);
  } finally {
    await fixture.close();
  }
});

test('profile metadata cannot import a different identity or turn unobserved prose into an empty replacement', () => {
  for (const profileAbout of [
    null,
    { observed: true, about: '' },
    {
      url: linkedinExportInput().url.replace(/details\/experience\/$/u, ''),
      observed: false,
      about: '',
      reason: 'section-not-rendered',
      boundary: 'rendered-bottom',
      passes: 3,
    },
  ]) {
    assert.throws(
      () =>
        linkedinExperienceDocument(
          { ...linkedinExperienceRaw(), profileAbout },
          linkedinExportInput(),
          '2026-11-16T00:00:00.000Z'
        ),
      { code: 'cv-experience-document' }
    );
  }
});

test('Stop during late profile tab creation waits for its close before detaching', async () => {
  const controller = new AbortController();
  const fixture = await linkedinReaderFixture({
    profileOpen: async () => controller.abort(),
  });
  try {
    await assert.rejects(
      fixture.read({ ...linkedinExportInput(), signal: controller.signal }),
      { name: 'AbortError' }
    );
    const names = fixture.calls.map(([name]) => name);
    assert.ok(names.indexOf('profile-close') < names.indexOf('detach'));
    assert.equal(names.includes('profile-goto'), false);
    assert.deepEqual(await readdir(fixture.artifactRoot).catch(() => []), []);
  } finally {
    await fixture.close();
  }
});
