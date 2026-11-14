import assert from 'node:assert/strict';
import { questionBrowserUi } from './question-browser-ui.mjs';
import { openQuestionDisclosure } from './question-preview.mjs';
import { decodeWire, encodeWire } from '../../src/transport/lino.js';
import {
  mountPendingHistory,
  editPendingMessage,
} from '../../../experiments/issue-56/pending-turn-fixture.mjs';

const draft = (ui) => ui.controls.locator('[data-browser-text-draft]');
const send = (ui) => ui.controls.locator('[data-browser-text-send]');
const noEffects = { clicks: 0, textSends: 0, draft: '' };
const reviewed =
  'Expected salary: 100000. I have distributed systems experience.';
const pending = async (ui) => {
  await ui.fixture.reset({ freeText: true });
  await ui.fixture.send.readAnswerChoices({ source: 'hh', chat: '7' });
  await ui.fixture.page.evaluate(mountPendingHistory);
  await ui.readCurrent();
};

const verifyDrafts = async (ui, before) => {
  console.log('[question-text-controls] inspecting the free-text pending turn');
  await ui.inspect();
  await pending(ui);
  if (before) {
    await ui.controls
      .getByRole('button', { name: 'Prefill the reviewed draft', exact: true })
      .scrollIntoViewIfNeeded();
    await ui.shot('before');
    assert.equal(
      await draft(ui).count(),
      1,
      'A free-text review needs an editable reviewed reply'
    );
  }
  await ui.run(
    'whole pending turn is visible and editing sends nothing',
    async () => {
      await ui.controls
        .getByText('Pending rendered messages: 2', { exact: true })
        .waitFor();
      await draft(ui).fill(reviewed);
      assert.deepEqual(await ui.fixture.stats(), noEffects);
      await draft(ui).scrollIntoViewIfNeeded();
      await ui.shot('review-desktop');
    }
  );
  await ui.run(
    'reload restores the exact unsent draft without delivery',
    async () => {
      await ui.open();
      await openQuestionDisclosure(ui.controls);
      await draft(ui).waitFor();
      assert.equal(await draft(ui).inputValue(), reviewed);
      assert.deepEqual(await ui.fixture.stats(), noEffects);
    }
  );
  await ui.run(
    'explicit reply records its positive receipt and cannot replay after reload',
    async () => {
      await send(ui).click();
      await ui.status('sent').waitFor();
      await ui.controls
        .getByText('The provider confirmed this text reply.', { exact: true })
        .waitFor();
      await ui.controls
        .getByText('Provider message receipt: 102', { exact: true })
        .waitFor();
      assert.equal(await draft(ui).inputValue(), reviewed);
      assert.equal(await send(ui).isDisabled(), true);
      assert.deepEqual(await ui.fixture.stats(), {
        ...noEffects,
        textSends: 1,
      });
      await ui.shot('sent-desktop');
      await ui.open();
      await openQuestionDisclosure(ui.controls);
      await ui.status('sent').waitFor();
      assert.equal(await draft(ui).inputValue(), reviewed);
      assert.equal(await send(ui).isDisabled(), true);
      assert.equal((await ui.fixture.stats()).textSends, 1);
    }
  );
};

const verifyRecovery = async (ui) => {
  await ui.run(
    'lost reply response holds the draft until read-only recovery',
    async () => {
      await pending(ui);
      await draft(ui).fill('Lost response reviewed reply');
      const routeUrl = '**/api/automations/answers/browser/reply-text';
      await ui.page.route(routeUrl, async (route) => {
        await route.fetch();
        await route.abort('failed');
      });
      await send(ui).click();
      await ui.controls.getByRole('alert').waitFor();
      assert.equal(await send(ui).isDisabled(), true);
      assert.equal(await draft(ui).isDisabled(), true);
      assert.equal((await ui.fixture.stats()).textSends, 1);
      await ui.page.unroute(routeUrl);
      await ui.controls
        .getByRole('button', { name: 'Recover reply status', exact: true })
        .click();
      await ui.status('sent').waitFor();
      assert.equal((await ui.fixture.stats()).textSends, 1);
      await ui.shot('lost-response-recovered');
    }
  );
  await ui.run(
    'missing native receipt remains unknown and locked across reload',
    async () => {
      await ui.fixture.reset({ freeText: true, receipt: 'none' });
      await ui.readCurrent();
      await draft(ui).fill('Uncertain text must not repeat');
      await send(ui).click();
      await ui.status('unknown').waitFor();
      await ui.open();
      await openQuestionDisclosure(ui.controls);
      await ui.status('unknown').waitFor();
      assert.equal(await send(ui).isDisabled(), true);
      assert.equal(
        await draft(ui).inputValue(),
        'Uncertain text must not repeat'
      );
      assert.equal((await ui.fixture.stats()).textSends, 1);
      await ui.shot('unknown');
    }
  );
};

const verifyGuards = async (ui) => {
  await ui.run('owner provider draft remains protected', async () => {
    await ui.fixture.reset({ freeText: true, draft: 'Keep my own draft' });
    await ui.readCurrent();
    await ui.controls
      .getByText(
        'The provider input contains a draft. Review it there before sending a text reply.',
        { exact: true }
      )
      .waitFor();
    assert.equal(await draft(ui).isDisabled(), true);
    assert.equal(await send(ui).isDisabled(), true);
    assert.deepEqual(await ui.fixture.stats(), {
      ...noEffects,
      draft: 'Keep my own draft',
    });
    await ui.shot('owner-draft');
  });
  await ui.run(
    'changing an earlier pending message refuses without writing or losing reviewed text',
    async () => {
      await pending(ui);
      await draft(ui).fill('The stale draft stays available for review');
      await ui.fixture.page.evaluate(
        editPendingMessage,
        'Earlier question changed'
      );
      await send(ui).click();
      await ui.status('failed').waitFor();
      assert.equal(
        await draft(ui).inputValue(),
        'The stale draft stays available for review'
      );
      assert.deepEqual(await ui.fixture.stats(), noEffects);
      await draft(ui).fill('Edited after a definite refusal');
      await ui.open();
      await openQuestionDisclosure(ui.controls);
      await ui.status('failed').waitFor();
      assert.equal(
        await draft(ui).inputValue(),
        'Edited after a definite refusal'
      );
      assert.deepEqual(await ui.fixture.stats(), noEffects);
    }
  );
  await ui.run(
    'a new review never inherits another question draft',
    async () => {
      await pending(ui);
      assert.notEqual(
        await draft(ui).inputValue(),
        'Edited after a definite refusal'
      );
      assert.notEqual(
        await draft(ui).inputValue(),
        'The stale draft stays available for review'
      );
      assert.deepEqual(await ui.fixture.stats(), noEffects);
    }
  );
  await ui.run(
    'strict options retain native choice controls without a text editor',
    async () => {
      await ui.fixture.reset();
      await ui.readCurrent();
      assert.equal(await draft(ui).count(), 0);
      assert.equal(
        await ui.controls.locator('[data-browser-answer-select]').count(),
        1
      );
      assert.deepEqual(await ui.fixture.stats(), noEffects);
    }
  );
  await ui.run(
    'prefilling a known answer keeps explicit delivery disabled',
    async () => {
      await ui.fixture.reset({ freeText: true });
      await ui.readCurrent();
      await ui.controls
        .getByRole('button', {
          name: 'Prefill the reviewed draft',
          exact: true,
        })
        .click();
      await ui.controls
        .getByRole('button', {
          name: 'Draft prefilled; review it in the provider chat',
          exact: true,
        })
        .waitFor();
      assert.equal(await send(ui).isDisabled(), true);
      assert.deepEqual(await ui.fixture.stats(), {
        ...noEffects,
        draft: 'Yes',
      });
    }
  );
  await ui.run(
    'a server without reviewed text support never offers a text send',
    async () => {
      const routeUrl = '**/api/automations/answers/browser';
      await ui.page.route(routeUrl, async (route) => {
        const response = await route.fetch();
        const type = response.headers()['content-type'];
        const value = decodeWire(await response.body(), type);
        delete value.textSources;
        await route.fulfill({
          response,
          body: encodeWire(value, type),
        });
      });
      await ui.open();
      await ui.inspect();
      assert.equal(await draft(ui).count(), 0);
      assert.deepEqual(await ui.fixture.stats(), {
        ...noEffects,
        draft: 'Yes',
      });
      await ui.page.unroute(routeUrl);
    }
  );
};

const verifySurfaces = async (ui) => {
  for (const [surface, hash, width] of [
    ['chat', '#chat=hh:7', 1180],
    ['operator', '#/operator?chat=hh%3A7', 390],
  ]) {
    await ui.run(
      `${surface} shares explicit text review and fits its viewport`,
      async () => {
        await ui.fixture.reset({ freeText: true });
        await ui.page.setViewportSize({ width, height: 950 });
        await ui.page.goto(`${ui.fixture.base}/?text-review=${surface}${hash}`);
        await ui.page.locator('[data-action="chat-automations"]').click();
        ui.setControls(
          ui.page.locator('.chat-menu-list [data-browser-answer-controls]')
        );
        await ui.inspect();
        await draft(ui).fill(`${surface}: ${reviewed}`);
        assert.deepEqual(await ui.fixture.stats(), noEffects);
        assert.equal(
          await ui.page.evaluate(
            () => document.documentElement.scrollWidth <= globalThis.innerWidth
          ),
          true
        );
        await draft(ui).scrollIntoViewIfNeeded();
        await ui.shot(`review-${surface}`);
        await send(ui).click();
        await ui.status('sent').waitFor();
        assert.deepEqual(await ui.fixture.stats(), {
          ...noEffects,
          textSends: 1,
        });
        await ui.shot(`sent-${surface}`);
      }
    );
  }
};

export const verifyQuestionTextControls = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const ui = await questionBrowserUi(browser, {
    screenshots,
    group: 'question-text-controls',
  });
  try {
    await ui.open();
    await verifyDrafts(ui, before);
    await verifyRecovery(ui);
    await verifyGuards(ui);
    await verifySurfaces(ui);
    return ui.result();
  } catch (error) {
    await ui.shot('failed');
    throw error;
  } finally {
    await ui.close();
  }
};
