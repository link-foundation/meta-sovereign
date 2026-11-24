import { listAnswerRules } from '../../js/src/automation/question-store.js';
import { listOutbox } from '../../js/src/automation/outbox.js';
import {
  applicationRecruiterPanelFixture,
  recruiterPanelQuestion,
  recruiterPanelReply,
  recruiterReuseQuestion,
} from './application-recruiter-panel-fixture.mjs';
import { serveNativeMcpFixture } from './application-native-mcp-server.mjs';
import { originalApplicationSearch } from './application-search-route-fixture.mjs';

let current;
let fixture;
const ownerReply = process.env.E2E_RECRUITER_PANEL_LEARN_REPLY === '1';
const prepareReply = process.env.E2E_RECRUITER_PANEL_PREPARE_REPLY === '1';
const exactReply = process.env.E2E_RECRUITER_PANEL_EXACT_REPLY === '1';
const reuseReply = process.env.E2E_RECRUITER_PANEL_REUSE === '1';
const skipRecruiter = process.env.E2E_RECRUITER_PANEL_SKIP === '1';
const replyControl = async (frame, path) => {
  if (path === '/reply/start') {
    await frame
      .getByRole('textbox', { name: 'Your reply' })
      .fill(recruiterPanelReply);
    await frame
      .getByRole('button', { name: 'Send reply' })
      .click({ timeout: 5000 });
  } else if (path === '/reply/confirm') {
    await frame.locator('[data-qa="status-icon-pending"]').evaluate(
      (node) => {
        node.dataset.qa = 'status-icon-delivered';
        node.textContent = 'Delivered';
      },
      undefined,
      { timeout: 5000 }
    );
  }
};

const observeLearning = async (store, frame, panelOpen) => ({
  recruiterSends: panelOpen
    ? await frame
        .locator('body')
        .evaluate(() => globalThis.fixtureRecruiterSends)
    : undefined,
  savedReply: (await store.get('msg:hh:web:456:2'))?.delivery,
  learned: (await listAnswerRules(store)).find(
    (rule) => rule.question === recruiterPanelQuestion
  )?.answers[0],
});

await serveNativeMcpFixture(
  async (browser) => {
    current = browser;
    fixture = await applicationRecruiterPanelFixture(browser, {
      panelDelayMs:
        prepareReply || exactReply || reuseReply || skipRecruiter ? 0 : 4000,
      ownerReply,
      prepareReply,
      exactReply,
      reuseReply,
      skipRecruiter,
    });
    return fixture;
  },
  async (request) => {
    const searchPage = current
      .contexts()
      .flatMap((context) => context.pages())
      .find((page) => page.url() === originalApplicationSearch);
    const panel = searchPage?.locator('[data-qa="chatik-root"]');
    let panelOpen = Boolean(await panel?.isVisible());
    const frame = panel
      ?.locator('iframe[title="Recruiter chat"]')
      .contentFrame();
    const sends = searchPage
      ? await searchPage.evaluate(() =>
          globalThis.sessionStorage.getItem('fixture-application-sends')
        )
      : undefined;
    let draft;
    if (panelOpen) {
      const composer = frame.locator('textarea[data-qa="text-input"]');
      draft = await composer.inputValue({ timeout: 5000 });
      if (request.method === 'POST') {
        const vacancy = /^\/vacancy\/(123|789)$/u.exec(request.url)?.[1];
        if (vacancy) {
          await frame
            .locator('[data-qa="chatik-header-sub-header"] a')
            .evaluate(
              (node, url) => node.setAttribute('href', url),
              `https://hh.ru/vacancy/${vacancy}`
            );
        } else if (request.url === '/dismiss') {
          await panel
            .getByRole('button', { name: 'Close recruiter panel' })
            .click({ timeout: 5000 });
          panelOpen = false;
        } else if (
          (prepareReply || exactReply || skipRecruiter) &&
          request.url === '/draft/clear'
        ) {
          await frame.getByRole('textbox', { name: 'Your reply' }).fill('');
        } else if (reuseReply && request.url === '/reuse/offer') {
          await frame.locator('body').evaluate((_, summary) => {
            globalThis.fixtureRecruiterReuse({ id: 3, summary });
          }, `Похоже, вы отвечали на часть вопросов:\n${recruiterReuseQuestion}: Да.`);
        } else if (reuseReply && request.url === '/draft/clear') {
          await composer.evaluate((node) => {
            node.value = '';
          });
        } else if (ownerReply) {
          await replyControl(frame, request.url);
        }
      }
    }
    return {
      panelOpen,
      draft,
      sends,
      searchVisits: fixture.searchVisits,
      outcomes: fixture.effects,
      ...(prepareReply &&
        panelOpen &&
        (await frame.locator('#recruiter-messages').evaluate((node) => ({
          draftWrites: globalThis.fixtureRecruiterDraftWrites,
          recruiterSends: globalThis.fixtureRecruiterSends,
          revealed: node.scrollTop > 0,
        })))),
      ...(ownerReply || exactReply || skipRecruiter
        ? await observeLearning(fixture.runtimeStore, frame, panelOpen)
        : {}),
      ...(reuseReply
        ? {
            ...(await observeLearning(fixture.runtimeStore, frame, panelOpen)),
            reuseReceipts: (await listOutbox(fixture.runtimeStore))
              .filter((entry) => entry.kind === 'question-choice')
              .map((entry) => ({
                status: entry.status,
                receipt: entry.receipt,
              })),
          }
        : {}),
    };
  }
);
