import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createVacancyService } from '../src/jobs/service.js';
import { buildCvTechnologyReview } from '../src/jobs/cv-technology-review.js';
import { technologyNormalizer } from '../src/jobs/cv-technology-names.js';
import { technologyJobPairs } from '../src/jobs/cv-technology-pairs.js';
import {
  splitTechnologyList,
  jobTechnologyInventory,
} from '../src/jobs/cv-technology-lists.js';
import {
  confirmedCvTechnologyReview,
  fingerprintTechnologyReview,
} from '../src/jobs/cv-technology-result.js';
import {
  technologyCatalog,
  defaultTechnologyEntries,
} from '../src/jobs/technology-catalog.js';
import { sanitizedResumeCv } from '../src/jobs/resume-cv.js';
import {
  cvTechnologyFixture,
  bilingualTechnologyCv,
} from '../../experiments/issue-56/cv-technology-fixture.mjs';
import { gate } from '../../experiments/issue-56/vacancy-fixture.mjs';

export const withCvTechnologyFixture = async (work) => {
  const fixture = await cvTechnologyFixture();
  const service = createVacancyService(fixture);
  try {
    const catalog = await service['technology-catalog']();
    return await work({
      ...fixture,
      service,
      catalog,
      input: { ...fixture.input, revision: catalog.revision },
    });
  } finally {
    await service.stop();
    await fixture.close();
  }
};
const inputReport = async () => ({
  sources: ['ru', 'en'].map((language) => ({
    cv: bilingualTechnologyCv(language),
    identity: { hash: language },
  })),
  catalog: await technologyCatalog(defaultTechnologyEntries()),
  observed: [{ canonical: 'PostgreSQL', spelling: 'Postgres' }],
});

test('bilingual verified exports produce a local technology review without provider access', async () => {
  await withCvTechnologyFixture(async ({ service, input }) => {
    assert.equal(typeof service['technology-review'], 'function');
    const { review } = await service['technology-review'](input);
    assert.equal(review.status, 'draft');
    assert.deepEqual(review.selected, []);
    assert.deepEqual(review.report.pairs, [[0, 0]]);
    assert.deepEqual(review.report.blockers, []);
    assert.equal(review.sources.length, 2);
    assert.ok(review.report.changes.some((change) => change.id === 'en:about'));
    assert.equal(review.providerSaved, undefined);
    assert.deepEqual(await service['technology-review-stored'](input), {
      review,
    });
  });
});
test('raw duplicate evidence survives sanitization and field-local sorting preserves prose', async () => {
  const input = await inputReport();
  const report = buildCvTechnologyReview(input);
  assert.deepEqual(sanitizedResumeCv(input.sources[0].cv).cv.skills, [
    'Postgres',
    'Postgres',
    'JavaScript',
  ]);
  for (const language of ['ru', 'en']) {
    const about = report.changes.find(
      (change) => change.id === `${language}:about`
    );
    const source = input.sources.find((row) => row.cv.language === language);
    assert.ok(
      about.after.startsWith(
        source.cv.about.split(
          language === 'ru' ? 'Технические навыки' : 'Technical Skills'
        )[0]
      )
    );
    assert.ok(
      about.after.includes(
        source.cv.about.slice(
          source.cv.about.indexOf(language === 'ru' ? 'Личные:' : 'Personal:')
        )
      )
    );
    assert.match(about.after, /PostgreSQL \(Postgres\)/u);
    const job = report.changes.find(
      (change) => change.id === `${language}:jobs.0.description`
    );
    assert.match(
      job.after,
      /\.NET Core, \.NET Framework, Docker, Git, PostgreSQL \(Postgres\)/u
    );
    assert.ok(
      job.after.endsWith(source.cv.jobs[0].description.split('\n\n').at(-1))
    );
    assert.equal(
      report.fields.find(
        (field) => field.language === language && field.field === 'skills'
      ).duplicates.length,
      1
    );
  }
  const raw = report.fields.find(
    (field) => field.language === 'ru' && field.field === 'jobs.0.description'
  );
  assert.deepEqual(raw.rawTerms, ['Postgres', 'Git', 'git']);
  assert.equal(raw.duplicates.length, 1);
});
test('applying proposed field text in memory yields an independently complete idempotent review', async () => {
  const input = await inputReport();
  const report = buildCvTechnologyReview(input);
  for (const change of report.changes) {
    const cv = input.sources.find(
      (source) => source.cv.language === change.language
    ).cv;
    if (change.field === 'about') {
      cv.about = change.after;
    } else {
      cv.jobs[Number(change.field.split('.')[1])].description = change.after;
    }
  }
  const second = buildCvTechnologyReview(input);
  assert.deepEqual(second.changes, []);
  assert.equal(second.complete, true);
  assert.deepEqual(second.blockers, []);
});
test('whole names retain versions and qualifiers, expand language components and avoid AWS claims', async () => {
  const input = await inputReport();
  const names = technologyNormalizer(input.catalog);
  assert.deepEqual(
    names.expand('C/C++').map((term) => term.canonical),
    ['C', 'C++']
  );
  assert.deepEqual(
    names
      .expand('C# (.NET Core, .NET Framework)')
      .map((term) => term.canonical),
    ['C#', '.NET Core', '.NET Framework']
  );
  assert.equal(names.expand('Linux (Ubuntu)')[0].canonical, 'Linux (Ubuntu)');
  assert.equal(names.normalize('Custom Engine/').canonical, 'Custom Engine');
  assert.equal(names.normalize('Custom Engine/').malformed, true);
  const cv = input.sources[0].cv;
  cv.about =
    'Amazon S3 compatible storage, PHP 8, PHP, React Native and React.';
  const report = buildCvTechnologyReview(input);
  const terms = report.technologies.map((row) => row.canonical);
  for (const term of [
    'S3-compatible storage',
    'PHP 8',
    'PHP',
    'React Native',
    'React',
  ]) {
    assert.ok(terms.includes(term));
  }
  assert.ok(!terms.includes('AWS'));
  assert.deepEqual(
    splitTechnologyList('C# (.NET Core, .NET Framework), Git; Docker'),
    ['C# (.NET Core, .NET Framework)', 'Git', 'Docker']
  );
  assert.throws(() => splitTechnologyList('Git, Broken (term'));
});
test('known typographical errors are corrected without reinserting them as ATS aliases', async () => {
  const input = await inputReport();
  input.sources[0].cv.skills.push('Cuter', 'Teleric', 'Cutter (Cuter)');
  input.observed.push(
    { canonical: 'Cutter', spelling: 'Cuter' },
    { canonical: 'Telerik', spelling: 'Teleric' }
  );
  const report = buildCvTechnologyReview(input);
  const after = report.changes.find((change) => change.id === 'en:about').after;
  assert.match(after, /Cutter/u);
  assert.match(after, /Telerik/u);
  assert.doesNotMatch(after, /Cuter|Teleric/u);
});

test('legacy alias footers retain unknown terms and personal prose in inline field proposals', async () => {
  const input = await inputReport();
  input.sources[0].cv.about =
    'Biography.\n\nTechnical Skills\nTools:\nGit\nTechnology aliases: Postgres, Custom Engine\nPersonal: keep me.\nTools: this is personal narrative.';
  const report = buildCvTechnologyReview(input);
  const change = report.changes.find((row) => row.id === 'ru:about');
  assert.match(change.after, /Custom Engine/u);
  assert.doesNotMatch(change.after, /Technology aliases:/u);
  assert.ok(
    change.after.endsWith(
      'Personal: keep me.\nTools: this is personal narrative.'
    )
  );
  assert.ok(
    report.fields
      .find((row) => row.language === 'ru' && row.field === 'about')
      .rawTerms.includes('Custom Engine')
  );
  const names = technologyNormalizer(input.catalog);
  assert.equal(
    names.normalize('Amazon AWS S3 compatible storage').canonical,
    'S3-compatible storage'
  );
});
test('unrecognized About structure blocks review and preserves every original character', async () => {
  const input = await inputReport();
  input.sources[0].cv.about =
    'Biography.\n\nTechnical Skills\nTools:\nGit\n\nMy narrative must stay here.';
  const report = buildCvTechnologyReview(input);
  assert.ok(report.blockers.some((row) => row.code === 'about-layout'));
  assert.ok(!report.changes.some((row) => row.id === 'ru:about'));
  const description =
    'Narrative.\nTechnologies:\n\nGit, Docker\nThis sentence must remain here.\nAfterword.';
  const inventory = jobTechnologyInventory(description);
  assert.deepEqual(inventory.terms, ['Git', 'Docker']);
  assert.ok(
    description
      .slice(inventory.blocks[0].end)
      .includes('This sentence must remain here.')
  );
});
test('counterpart pairing requires both company and dates, resolves transliteration and blocks collisions', async () => {
  const input = await inputReport();
  assert.deepEqual(technologyJobPairs(input.sources).pairs, [[0, 0]]);
  input.sources[1].cv.jobs.push({ ...input.sources[1].cv.jobs[0] });
  assert.equal(technologyJobPairs(input.sources).pairs.length, 0);
  assert.ok(
    technologyJobPairs(input.sources).blockers.some(
      (row) => row.code === 'counterpart-ambiguous'
    )
  );
  input.sources[1].cv.jobs.splice(1);
  input.sources[1].cv.jobs[0].company = 'Unrelated Ltd';
  assert.equal(technologyJobPairs(input.sources).pairs.length, 0);
  input.sources[1].cv.jobs[0].company = 'ArtBridge';
  input.sources[1].cv.jobs[0].start = null;
  assert.equal(technologyJobPairs(input.sources).pairs.length, 0);
});
test('ambiguous aliases remain evidence and prevent a false complete report', async () => {
  const input = await inputReport();
  input.sources[0].cv.skills.push('NPM');
  const report = buildCvTechnologyReview(input);
  assert.equal(report.complete, false);
  assert.ok(
    report.blockers.some(
      (row) => row.code === 'alias-ambiguous' && row.raw === 'NPM'
    )
  );
  assert.ok(
    report.fields
      .find((row) => row.field === 'skills')
      .normalized.some((row) => row.ambiguous)
  );
});
test('selected local review is bound to its draft and revalidates exact artifact and catalog evidence', async () => {
  await withCvTechnologyFixture(async ({ service, input, artifactRoot }) => {
    const draft = await service['technology-review'](input);
    const selected = ['ru:about'];
    const saving = {
      browserSlot: 'jobs',
      fingerprint: draft.review.fingerprint,
      selected,
    };
    const saved = await service['technology-review-save'](saving);
    assert.equal(saved.review.status, 'reviewed');
    assert.equal(saved.review.previousFingerprint, saving.fingerprint);
    assert.deepEqual(saved.review.selected, selected);
    assert.deepEqual(await confirmedCvTechnologyReview(saved, saving), saved);
    await assert.rejects(
      confirmedCvTechnologyReview(saved, {
        ...saving,
        fingerprint: 'a'.repeat(64),
      })
    );
    await assert.rejects(service['technology-review-save'](saving));
    const next = await service['technology-review'](input);
    const id = next.review.sources[0].identity;
    await writeFile(
      join(artifactRoot, id.exportId, id.hash, 'resume.json'),
      '{}'
    );
    await assert.rejects(
      service['technology-review-save']({
        ...saving,
        fingerprint: next.review.fingerprint,
      })
    );
    assert.deepEqual(await service['technology-review-stored'](input), next);
  });
});
test('review acknowledgement validates its reconstructed report and selected fields', async () => {
  await withCvTechnologyFixture(async ({ service, input }) => {
    const answer = await service['technology-review'](input);
    const tampered = globalThis.structuredClone(answer);
    tampered.review.report.changes[0].after = 'Invented skills';
    await assert.rejects(confirmedCvTechnologyReview(tampered));
    const forged = await fingerprintTechnologyReview({
      ...answer.review,
      selected: ['ru:about'],
      status: 'reviewed',
      previousFingerprint: answer.review.fingerprint,
      reviewedAt: new Date().toISOString(),
    });
    await assert.rejects(
      confirmedCvTechnologyReview({ review: forged }, input)
    );
    await assert.rejects(
      service['technology-review-save']({
        browserSlot: 'jobs',
        fingerprint: answer.review.fingerprint,
        selected: ['ru:about', 'ru:about'],
      })
    );
  });
});
test('failed durability restores the prior review, and cached reads wait for acknowledgement', async () => {
  await withCvTechnologyFixture(async ({ service, input, store }) => {
    const previous = await service['technology-review'](input);
    store.flush = async () => {
      throw new Error('fixture disk error');
    };
    await assert.rejects(service['technology-review'](input));
    assert.deepEqual(
      await service['technology-review-stored'](input),
      previous
    );
    const flushing = gate();
    const release = gate();
    store.flush = async () => {
      flushing.resolve();
      await release.promise;
    };
    const writing = service['technology-review'](input);
    await flushing.promise;
    let resolved = false;
    const reading = service['technology-review-stored'](input).then(
      (answer) => {
        resolved = true;
        return answer;
      }
    );
    try {
      await assert.rejects(service['technology-review'](input), {
        code: 'jobs-busy',
      });
      assert.equal(resolved, false);
    } finally {
      release.resolve();
    }
    assert.deepEqual(await reading, await writing);
  });
});

test('catalog changes and duplicate or same-language selections preserve the last review', async () => {
  await withCvTechnologyFixture(async ({ service, input, catalog }) => {
    const previous = await service['technology-review'](input);
    await assert.rejects(
      service['technology-review']({
        ...input,
        exports: [input.exports[0], input.exports[0]],
      })
    );
    await service['technology-catalog-save']({ ...catalog, entries: [] });
    await assert.rejects(
      service['technology-review-save']({
        browserSlot: 'jobs',
        fingerprint: previous.review.fingerprint,
        selected: ['ru:about'],
      }),
      { code: 'jobs-technology-conflict' }
    );
    assert.deepEqual(
      await service['technology-review-stored'](input),
      previous
    );
  });
});
test('cached vacancy spelling evidence reaches each relevant position and remains catalog-bound', async () => {
  await withCvTechnologyFixture(async ({ service, input, catalog }) => {
    await service['technology-analyze']({
      ...input.exports[1],
      browserSlot: 'jobs',
      revision: catalog.revision,
    });
    const { review } = await service['technology-review'](input);
    assert.ok(review.observed.some((row) => row.spelling === 'Postgres'));
    for (const change of review.report.changes.filter((row) =>
      row.field.startsWith('jobs.')
    )) {
      assert.match(change.after, /PostgreSQL \(Postgres\)/u);
    }
    const changed = await service['technology-catalog-save']({
      ...catalog,
      entries: catalog.entries.filter((row) => row.canonical !== 'Docker'),
    });
    await assert.rejects(
      service['technology-review']({ ...input, revision: changed.revision }),
      { code: 'jobs-technology-conflict' }
    );
  });
});
test('Stop drains an issued durable local write before releasing shared ownership', async () => {
  await withCvTechnologyFixture(async ({ service, input, store }) => {
    const flushing = gate();
    const release = gate();
    store.flush = async () => {
      flushing.resolve();
      await release.promise;
    };
    const writing = service['technology-review'](input);
    await flushing.promise;
    let stopped = false;
    const stopping = service.stop().then(() => {
      stopped = true;
    });
    try {
      await Promise.resolve();
      assert.equal(stopped, false);
    } finally {
      release.resolve();
    }
    await stopping;
    assert.equal((await writing).review.status, 'draft');
    await assert.rejects(service['technology-review'](input), {
      code: 'jobs-stopped',
    });
  });
});
