import {
  inspectLinkedinPositionSkills,
  observedLinkedinProfileSkills,
} from './linkedin-position-skill-dom.js';
import { linkedinExperienceGate } from './linkedin-experience-dom.js';
import { evaluateLinkedin } from './linkedin-experience-session.js';
import { linkedinPositionFailure } from './linkedin-position-plan.js';

export const readLinkedinProfileSkills = async ({
  session,
  plan,
  check,
  wait,
  signal,
}) => {
  if (!plan.skills.length) {
    return [];
  }
  const url = plan.target.url.replace(/experience\/$/u, 'skills/');
  const page = await session.page.context().newPage();
  const found = new Set();
  try {
    check();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
    for (let pass = 0; pass < 18; pass++) {
      check();
      if (page.url() !== url) {
        break;
      }
      const names = plan.skills.filter((name) => !found.has(name));
      const observed = await page.evaluate(observedLinkedinProfileSkills, {
        url,
        names,
      });
      (observed ?? []).forEach((name) => found.add(name));
      if (found.size === plan.skills.length) {
        break;
      }
      await wait(225, signal);
    }
  } catch (error) {
    check();
    if (process.env.MS_CV_LINKEDIN_DEBUG === '1') {
      console.error({ event: 'linkedin-position-skills', name: error.name });
    }
  } finally {
    const gate = await page.evaluate(linkedinExperienceGate).catch(() => null);
    if (gate && (!gate.draft || gate.wall)) {
      await page.close();
    }
  }
  check();
  return plan.skills.filter((name) => found.has(name));
};

const waitForSkill = async (read, accept, wait, signal) => {
  for (let pass = 0; pass < 12; pass++) {
    const state = await read();
    if (state === 'conflict') {
      throw linkedinPositionFailure('owner-draft');
    }
    if (accept(state)) {
      return state;
    }
    await wait(180, signal);
  }
  return null;
};

const prepareSkill = async (read, wait, signal) => {
  if ((await read('read')) === 'selected') {
    return 'present';
  }
  if ((await read('open')) !== 'opened') {
    return 'unavailable';
  }
  const entered = await waitForSkill(
    () => read('enter'),
    (state) => state === 'typed',
    wait,
    signal
  );
  if (!entered) {
    return 'unavailable';
  }
  const choice = await waitForSkill(
    () => read('choose'),
    (state) => ['chosen', 'unsupported'].includes(state),
    wait,
    signal
  );
  if (choice === 'chosen') {
    const selected = await waitForSkill(
      () => read('read'),
      (state) => state === 'selected',
      wait,
      signal
    );
    if (selected) {
      return 'applied';
    }
    // An issued choice may still be changing the draft. Keep it for manual review.
    throw linkedinPositionFailure('skill-review');
  }
  if ((await read('clear')) !== 'cleared') {
    throw linkedinPositionFailure('skill-review');
  }
  return 'unavailable';
};

export const fillLinkedinPositionSkills = async ({
  session,
  plan,
  token,
  eligible,
  form,
  controls,
  check,
  wait,
  signal,
}) => {
  const applied = [];
  const accounted = new Set();
  const read = async (name, action) => {
    check();
    const result = await evaluateLinkedin(
      session,
      inspectLinkedinPositionSkills,
      [{ url: plan.editor, token, name, action }]
    );
    check();
    if (result === 'conflict') {
      throw linkedinPositionFailure('owner-draft');
    }
    return result;
  };
  for (const name of eligible) {
    const result = await prepareSkill(
      (action) => read(name, action),
      wait,
      signal
    );
    if (result !== 'unavailable') {
      accounted.add(name);
    }
    if (result === 'applied') {
      applied.push(name);
    }
  }
  if (eligible.length) {
    const actual = await form.read();
    if (
      !actual.owned ||
      actual.ownerChanged ||
      JSON.stringify(actual.controls) !== JSON.stringify(controls)
    ) {
      throw linkedinPositionFailure('owner-draft');
    }
  }
  return {
    applied,
    unapplied: plan.skills.filter((name) => !accounted.has(name)),
    confirm: async () => {
      for (const name of applied) {
        if ((await read(name, 'read')) !== 'selected') {
          throw linkedinPositionFailure('skill-review');
        }
      }
    },
  };
};
