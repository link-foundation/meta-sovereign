import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createVacancyService } from '../src/jobs/service.js';
import {
  technologyCatalog,
  defaultTechnologyEntries,
  technologyCatalogEntries,
} from '../src/jobs/technology-catalog.js';
import {
  technologyMatcher,
  similarTechnologyNames,
} from '../src/jobs/technology-mentions.js';
import { analyzeTechnologies } from '../src/jobs/technology-analysis.js';
import { confirmedTechnologyAnalysis } from '../src/jobs/technology-result.js';
import { modelFingerprint } from '../src/automation/answer-model-context.js';
import {
  technologyFixture,
  technologyCv,
  technologyVacancies,
} from '../../experiments/issue-56/technology-fixture.mjs';

const withService = async (work) => {
  const fixture = await technologyFixture();
  let browserCalls = 0;
  const service = createVacancyService({
    ...fixture,
    availability: async () => ({ available: false }),
    openSession: () => {
      browserCalls++;
      throw new Error('Analysis must stay local');
    },
  });
  try {
    return await work({
      ...fixture,
      service,
      browserCalls: () => browserCalls,
    });
  } finally {
    await service.stop();
    await fixture.close();
  }
};

test('verified explicit resume technology analysis preserves prose and evidence without opening a provider', async () => {
  await withService(async ({ service, input, browserCalls }) => {
    assert.equal(typeof service['technology-analyze'], 'function');
    const catalog = await service['technology-catalog']();
    const answer = await service['technology-analyze']({
      ...input,
      revision: catalog.revision,
    });
    const report = answer.analysis;
    assert.equal(report.vacancies.length, 2);
    assert.equal(
      report.vacancies[0].description,
      technologyVacancies()[0].description
    );
    assert.ok(report.vacancies[0].comparison.mentioned.includes('PostgreSQL'));
    assert.ok(
      report.vacancies[0].comparison.requiredMissing.includes('React Native')
    );
    assert.ok(
      !report.vacancies[0].comparison.mentioned.includes('React Native')
    );
    assert.ok(
      report.vacancies[0].comparison.aliasSuggestions.some(
        (item) => item.spelling === 'Postgres'
      )
    );
    assert.deepEqual(report.vacancies[0].comparison.spellingSuggestions, [
      { spelling: 'Kubernets', candidates: ['Kubernetes'] },
    ]);
    assert.ok(
      report.evidence.some(
        (item) =>
          item.field === 'jobs.0.description' && item.spelling === 'PostgreSQL'
      )
    );
    assert.ok(
      report.evidence.some(
        (item) => item.field === 'about' && item.spelling === 'React'
      )
    );
    assert.equal(browserCalls(), 0);
    assert.deepEqual(
      await service['technology-analysis-stored']({ browserSlot: 'jobs' }),
      answer
    );
    assert.deepEqual(
      await confirmedTechnologyAnalysis(answer, {
        ...input,
        revision: catalog.revision,
      }),
      answer
    );
  });
});
test('longest whole names keep products, versions and common words distinct', () => {
  const scan = technologyMatcher(defaultTechnologyEntries());
  const found = scan(
    'React Native React PHP 8 PHP 9 .NET Core .NET Framework .NET Go go Basic basic Basic knowledge C++ C# SQL MySQL Git GitHub HTML5 CSS3',
    'about'
  );
  const names = found.flatMap((item) => item.candidates);
  assert.equal(names.filter((name) => name === 'React').length, 1);
  assert.equal(names.filter((name) => name === 'PHP').length, 0);
  assert.equal(names.filter((name) => name === 'PHP 8').length, 1);
  assert.equal(names.filter((name) => name === '.NET').length, 1);
  assert.equal(names.filter((name) => name === 'Go').length, 1);
  assert.equal(names.filter((name) => name === 'BASIC').length, 1);
  assert.equal(names.filter((name) => name === 'SQL').length, 1);
  assert.equal(names.filter((name) => name === 'Git').length, 1);
  assert.ok(names.includes('HTML5') && !names.includes('HTML'));
  assert.ok(names.includes('CSS3') && !names.includes('CSS'));
  assert.ok(names.includes('C++') && names.includes('C#'));
});
test('alias collisions are uncertain while case-sensitive npm remains a separate product', () => {
  const found = technologyMatcher(defaultTechnologyEntries())(
    'NPM npm Nginx Proxy Manager',
    'about'
  );
  assert.deepEqual(found[0].candidates, ['Nginx Proxy Manager', 'npm']);
  assert.deepEqual(found[1].candidates, ['npm']);
  assert.deepEqual(found[2].candidates, ['Nginx Proxy Manager']);
});
test('required, preferred, inline preferences and responsibilities retain original offsets', () => {
  const text =
    'Requirements:\nPython and SQL\nDocker would be a plus\nBenefits:\nGit\nЖелательно:\nJava\nОбязанности:\nLinux';
  const found = technologyMatcher(defaultTechnologyEntries())(
    text,
    'description',
    true
  );
  assert.deepEqual(
    found.map((item) => item.requirement),
    [
      'required',
      'required',
      'preferred',
      'unspecified',
      'preferred',
      'unspecified',
    ]
  );
  for (const item of found) {
    assert.equal(text.slice(item.start, item.end), item.spelling);
  }
});
test('corpus counts and spelling frequencies count each vacancy once', async () => {
  const catalog = await technologyCatalog(defaultTechnologyEntries());
  const report = await analyzeTechnologies({
    catalog,
    vacancies: technologyVacancies(),
    cv: technologyCv(),
    resume: {},
  });
  const postgres = report.statistics.find(
    (item) => item.canonical === 'PostgreSQL'
  );
  assert.equal(postgres.vacancies, 2);
  assert.equal(postgres.required, 2);
  assert.deepEqual(
    postgres.spellings.find((item) => item.value === 'Postgres'),
    { value: 'Postgres', count: 2 }
  );
  assert.deepEqual(report.metadata.location, [{ value: 'Москва', count: 2 }]);
  assert.ok(!report.statistics.some((item) => item.canonical === 'npm'));
  assert.ok(report.vacancies[0].unrecognizedSkills.includes('Communication'));
});
test('heading prefixes do not classify unrelated prose as requirements', () => {
  const scan = technologyMatcher(defaultTechnologyEntries());
  assert.deepEqual(
    scan(
      'Requirementssomething Python\nPreferredness SQL',
      'description',
      true
    ).map((item) => item.requirement),
    ['unspecified', 'unspecified']
  );
});
test('saved reports reject malformed nested evidence even with a valid fingerprint', async () => {
  await withService(async ({ service, input }) => {
    const catalog = await service['technology-catalog']();
    const answer = await service['technology-analyze']({
      ...input,
      revision: catalog.revision,
    });
    for (const mutate of [
      (row) => {
        row.evidence[0].candidates = 'PostgreSQL';
      },
      (row) => {
        row.vacancies[0].comparison.missing = null;
      },
      (row) => {
        row.statistics[0].spellings[0].count = 101;
      },
      (row) => {
        row.metadata.extra = 'invalid';
      },
      (row) => {
        row.resume.capturedAt = 'not a date';
      },
    ]) {
      const analysis = globalThis.structuredClone(answer.analysis);
      mutate(analysis);
      const { fingerprint: _hash, capturedAt: _time, ...content } = analysis;
      analysis.fingerprint = await modelFingerprint(content);
      await assert.rejects(confirmedTechnologyAnalysis({ analysis }));
    }
  });
});
test('similar names are suggestions only and never confer CV coverage', () => {
  assert.deepEqual(
    similarTechnologyNames('Kubernets', defaultTechnologyEntries()),
    ['Kubernetes']
  );
  assert.deepEqual(
    similarTechnologyNames('Go', defaultTechnologyEntries()),
    []
  );
  assert.deepEqual(
    similarTechnologyNames('React Native', defaultTechnologyEntries()),
    []
  );
});
test('catalog saves require the current revision and durably retain custom names', async () => {
  await withService(async ({ service }) => {
    const initial = await service['technology-catalog']();
    const changed = await service['technology-catalog-save']({
      ...initial,
      entries: [
        ...initial.entries,
        { canonical: 'Rust', aliases: ['Rustlang'], caseSensitive: false },
      ],
    });
    assert.notEqual(changed.revision, initial.revision);
    assert.deepEqual(await service['technology-catalog'](), changed);
    await assert.rejects(service['technology-catalog-save'](initial), {
      code: 'jobs-technology-conflict',
    });
    assert.deepEqual(await service['technology-catalog'](), changed);
  });
});
test('catalog limits reject duplicate canonical names, control characters and excessive aliases', () => {
  for (const entries of [
    new Array(257).fill({ canonical: 'A', aliases: [], caseSensitive: false }),
    [{ canonical: 'A', aliases: new Array(9).fill('B'), caseSensitive: false }],
    [{ canonical: 'A\nB', aliases: [], caseSensitive: false }],
    [
      { canonical: 'A', aliases: [], caseSensitive: false },
      { canonical: 'a', aliases: [], caseSensitive: false },
    ],
  ]) {
    assert.throws(() => technologyCatalogEntries(entries));
  }
});
test('failed catalog flush restores the prior acknowledged catalog', async () => {
  await withService(async ({ service, store }) => {
    const initial = await service['technology-catalog']();
    store.flush = async () => {
      throw new Error('fixture disk failure');
    };
    await assert.rejects(
      service['technology-catalog-save']({ ...initial, entries: [] })
    );
    assert.deepEqual(await service['technology-catalog'](), initial);
  });
});
test('wrong slot, unknown export, stale catalog or tampered files preserve the saved analysis', async () => {
  await withService(async ({ service, input, folder }) => {
    const catalog = await service['technology-catalog']();
    const valid = { ...input, revision: catalog.revision };
    const previous = await service['technology-analyze'](valid);
    for (const invalid of [
      { ...valid, browserSlot: 'other' },
      { ...valid, exportId: 'invalid' },
      { ...valid, revision: 'old' },
    ]) {
      await assert.rejects(service['technology-analyze'](invalid));
    }
    await writeFile(join(folder, 'resume.json'), '{}');
    await assert.rejects(service['technology-analyze'](valid));
    assert.deepEqual(
      await service['technology-analysis-stored'](input),
      previous
    );
    assert.deepEqual(
      await service['technology-analysis-stored']({ browserSlot: 'other' }),
      { analysis: null }
    );
  });
});
test('analysis limits reject repeated snapshot identities and oversized mention lists', async () => {
  const catalog = await technologyCatalog(defaultTechnologyEntries());
  const vacancy = technologyVacancies()[0];
  await assert.rejects(
    analyzeTechnologies({
      catalog,
      vacancies: [vacancy, vacancy],
      cv: technologyCv(),
      resume: {},
    })
  );
  assert.throws(
    () => technologyMatcher(catalog.entries)('Git '.repeat(2001), 'about'),
    { code: 'jobs-technology-limit' }
  );
});
test('corrupted report digests and mismatched acknowledgement cannot be presented as confirmed', async () => {
  await withService(async ({ service, input }) => {
    const catalog = await service['technology-catalog']();
    const answer = await service['technology-analyze']({
      ...input,
      revision: catalog.revision,
    });
    await assert.rejects(
      confirmedTechnologyAnalysis(answer, { ...input, hash: 'other' })
    );
    await assert.rejects(
      confirmedTechnologyAnalysis({
        analysis: { ...answer.analysis, fingerprint: 'bad' },
      })
    );
  });
});
