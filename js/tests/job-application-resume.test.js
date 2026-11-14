import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { applicationResumeFixture } from '../../experiments/issue-56/application-resume-fixture.mjs';
import { applicationIdentity } from '../../experiments/issue-56/application-run-fixture.mjs';
import { applicationResult } from '../src/jobs/application-result.js';

const identity = applicationIdentity;

test(
  'explicit native resume choice uses checked exports without answers, letters or dispatch',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationResumeFixture(t);
    assert.equal(fixture.state.menuClicks, 0);
    let receipt = await fixture.menu(fixture.entered);
    assert.equal(receipt.page.resumeChooser.open, true);
    receipt = await fixture.choose(receipt);
    assert.equal(receipt.resumeSelection.hash, 'english');
    assert.equal(receipt.resumeSelection.languageProof.language, 'ru');
    assert.equal(receipt.page.resumeChooser.open, false);
    assert.equal(fixture.state.resumeWrites, 1);
    assert.equal(fixture.state.menuClicks, 2);
    assert.equal(fixture.state.submitted, 0);
    assert.deepEqual(fixture.state.writes, []);
    assert.equal(receipt.letter, 'not-requested');
    applicationResult(receipt, identity(receipt, { resume: 'english' }));
    const saved = await fixture.store.get('secret:jobs-application:jobs:123');
    assert.equal(Object.hasOwn(saved, 'resumeSelection'), false);
    assert.equal(JSON.stringify(saved).includes('languageProof'), false);
  }
);

test(
  'resume choice requires confirmation, the current revision and an opened observed option',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationResumeFixture(t);
    await assert.rejects(fixture.menu(fixture.entered, { confirm: false }), {
      code: 'jobs-application-confirmation',
    });
    await assert.rejects(fixture.choose(fixture.entered), {
      code: 'jobs-application-resume',
    });
    const opened = await fixture.menu(fixture.entered);
    await assert.rejects(fixture.choose(fixture.entered), {
      code: 'jobs-application-changed',
    });
    await assert.rejects(fixture.choose(opened, { resume: 'missing' }), {
      code: 'jobs-application-resume',
    });
    assert.equal(fixture.state.resumeWrites, 0);
  }
);

test(
  'unexported and corrupted matching resumes refuse without choosing or sending',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationResumeFixture(t);
    const opened = await fixture.menu(fixture.entered);
    await assert.rejects(fixture.choose(opened, { resume: 'russian-old' }), {
      code: 'jobs-application-resume-export',
    });
    await writeFile(join(fixture.folder, 'resume.json'), 'tampered');
    await assert.rejects(fixture.choose(opened), {
      code: 'jobs-export-unconfirmed',
    });
    assert.equal(fixture.state.resumeWrites, 0);
    assert.equal(fixture.state.submitted, 0);
    assert.equal(fixture.state.page.resumeChooser.open, true);
  }
);

test(
  'preview never opens the native menu and an ineffective choice stays unconfirmed',
  { timeout: 5000 },
  async (t) => {
    const preview = await applicationResumeFixture(t, {
      application: { testMode: true },
    });
    // Preview entry deliberately does not create a form; emulate a previously observed review.
    preview.state.page.submit = {
      qa: 'vacancy-response-submit-popup',
      disabled: false,
    };
    preview.state.page.enter = null;
    preview.state.page.scope = true;
    const read = await preview.service['application-read'](
      identity(preview.entered)
    );
    const result = await preview.menu(read);
    assert.equal(result.state, 'test-preview');
    assert.equal(preview.state.menuClicks, 0);
    const ineffective = await applicationResumeFixture(t, {
      ineffective: true,
    });
    const opened = await ineffective.menu(ineffective.entered);
    await assert.rejects(ineffective.choose(opened), {
      code: 'jobs-application-resume',
    });
    assert.equal(ineffective.state.submitted, 0);
  }
);

test(
  'native owner edits after review refuse selection and a fresh read preserves those values',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationResumeFixture(t);
    let opened = await fixture.menu(fixture.entered);
    fixture.state.fields[1].value = 'Owner edited after confirmation';
    await assert.rejects(fixture.choose(opened), {
      code: 'jobs-application-changed',
    });
    assert.equal(fixture.state.resumeWrites, 0);
    opened = await fixture.service['application-read'](identity(opened));
    await fixture.choose(opened);
    assert.equal(
      fixture.state.fields[1].value,
      'Owner edited after confirmation'
    );
    assert.deepEqual(fixture.state.writes, []);
  }
);

test(
  'ambiguous, disabled, replaced and unobserved options never reach native selection',
  { timeout: 5000 },
  async (t) => {
    for (const alter of [
      (page) => {
        page.resumeChooser.ambiguous = true;
      },
      (page) => {
        page.resumeChooser.disabled = true;
      },
      (page) => {
        page.resumeChooser.options[1].disabled = true;
      },
      (page) => {
        page.resumeChooser.options[0].title =
          page.resumeChooser.options[1].title;
      },
      (page) => {
        page.documentKey = 'replacement-document';
      },
      (page) => {
        page.challenge = true;
      },
    ]) {
      const fixture = await applicationResumeFixture(t);
      const opened = await fixture.menu(fixture.entered);
      alter(fixture.state.page);
      await assert.rejects(fixture.choose(opened), {
        code: 'jobs-application-changed',
      });
      assert.equal(fixture.state.resumeWrites, 0);
      assert.equal(fixture.state.submitted, 0);
    }
  }
);

test(
  'stale native list and other-slot exports cannot attest this chooser',
  { timeout: 5000 },
  async (t) => {
    for (const alter of [
      async (fixture) => {
        const list = await fixture.store.get('jobs-resumes:jobs');
        list.entries[0].updatedAt++;
        await fixture.store.put(list);
      },
      async (fixture) => {
        const raw = await fixture.store.get('jobs-resume-export:jobs:english');
        raw.browserSlot = 'another-slot';
        await fixture.store.put(raw);
      },
    ]) {
      const fixture = await applicationResumeFixture(t);
      const opened = await fixture.menu(fixture.entered);
      await alter(fixture);
      await assert.rejects(fixture.choose(opened));
      assert.equal(fixture.state.resumeWrites, 0);
      assert.equal(fixture.state.submitted, 0);
    }
  }
);

test(
  'an already checked resume closes its menu without repeating the native choice',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationResumeFixture(t);
    let receipt = await fixture.menu(fixture.entered);
    receipt = await fixture.choose(receipt);
    receipt = await fixture.menu(receipt);
    assert.equal(
      receipt.page.resumeChooser.options.find((row) => row.hash === 'english')
        .checked,
      true
    );
    receipt = await fixture.choose(receipt);
    assert.equal(fixture.state.resumeWrites, 1);
    assert.equal(receipt.page.resumeChooser.open, false);
    assert.equal(fixture.state.submitted, 0);
  }
);

test(
  'cancellation while checking exports drains the owned review before any choice',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationResumeFixture(t);
    const opened = await fixture.menu(fixture.entered);
    const get = fixture.store.get.bind(fixture.store);
    let release, enter;
    const blocked = new Promise((resolve) => {
      release = resolve;
    });
    const observed = new Promise((resolve) => {
      enter = resolve;
    });
    fixture.store.get = async (id) => {
      if (id.startsWith('jobs-resume-export:')) {
        enter();
        await blocked;
      }
      return get(id);
    };
    const choosing = assert.rejects(fixture.choose(opened), {
      name: 'AbortError',
    });
    try {
      await observed;
      const cancelled = fixture.service.cancel();
      release();
      await Promise.all([choosing, cancelled]);
      assert.equal(fixture.state.resumeWrites, 0);
      assert.equal(fixture.state.submitted, 0);
      assert.equal(fixture.state.closed, 1);
    } finally {
      release();
    }
  }
);

test(
  'a failed acknowledgement after a native choice requires fresh read without replay',
  { timeout: 5000 },
  async (t) => {
    const fixture = await applicationResumeFixture(t);
    const opened = await fixture.menu(fixture.entered);
    const put = fixture.store.put.bind(fixture.store);
    fixture.store.put = async (row) => {
      if (row.id.startsWith('secret:jobs-application:')) {
        throw new Error('held fixture save');
      }
      return put(row);
    };
    await assert.rejects(fixture.choose(opened), /held fixture save/u);
    assert.equal(fixture.state.resumeWrites, 1);
    await assert.rejects(fixture.choose(opened), {
      code: 'jobs-application-changed',
    });
    fixture.store.put = put;
    const read = await fixture.service['application-read'](identity(opened));
    assert.equal(read.resumeSelection, undefined);
    assert.equal(read.page.resumeChooser.title, 'Senior Software Engineer');
    assert.equal(fixture.state.resumeWrites, 1);
    assert.equal(fixture.state.submitted, 0);
  }
);
