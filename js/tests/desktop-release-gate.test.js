/**
 * Desktop release gate (issue #37): npm publishing failing must not
 * keep desktop installers off the GitHub release, but any other failed
 * check must.
 */

import { describe, it, expect } from 'test-anywhere';

import {
  desktopReleaseGate,
  parseJobPages,
} from '../scripts/desktop-release-gate.mjs';

const job = (name, conclusion, failedStep) => ({
  name,
  conclusion,
  steps: [
    { name: 'Set up job', conclusion: 'success' },
    ...(failedStep ? [{ name: failedStep, conclusion: 'failure' }] : []),
  ],
});

const TESTS = job('Test (node on ubuntu-latest)', 'success');

describe('desktopReleaseGate', () => {
  it('blocks when no upstream job results were received', () => {
    expect(desktopReleaseGate([]).build).toBe(false);
  });
  it('builds after a fully green run', () => {
    expect(desktopReleaseGate([TESTS, job('Release', 'success')]).build).toBe(
      true
    );
  });

  it('builds when only npm publishing failed (E404 on main)', () => {
    const verdict = desktopReleaseGate([
      TESTS,
      job('Instant Release', 'skipped'),
      job('Release', 'failure', 'Publish to npm'),
    ]);
    expect(verdict).toEqual({
      build: true,
      reason: 'only npm publishing failed',
    });
  });

  it('stops on failed tests, a failed version commit or a cancelled job', () => {
    const blocked = (jobs) => desktopReleaseGate(jobs);
    expect(
      blocked([job('Test (node on macos-latest)', 'failure', 'Run tests')])
        .build
    ).toBe(false);
    expect(
      blocked([
        job('Release', 'failure', 'Version packages and commit to main'),
      ]).reason
    ).toBe('blocked by Release / Version packages and commit to main');
    expect(blocked([job('Release', 'cancelled')]).reason).toBe(
      'blocked by Release (cancelled)'
    );
  });
});

describe('parseJobPages', () => {
  it('rejects missing, empty and incomplete API evidence', () => {
    for (const text of [
      '',
      '{}',
      '{"total_count":0,"jobs":[]}',
      '{"total_count":2,"jobs":[{"name":"one"}]}',
    ]) {
      expect(() => parseJobPages(text)).toThrow();
    }
  });
  it('joins the pages `gh api --paginate` prints back to back', () => {
    const page = (names) =>
      JSON.stringify({
        total_count: 3,
        jobs: names.map((name) => ({ name, conclusion: 'success' })),
      });
    const jobs = parseJobPages(`${page(['a', 'b'])}${page(['c'])}\n`);
    expect(jobs.map((j) => j.name)).toEqual(['a', 'b', 'c']);
  });
});
