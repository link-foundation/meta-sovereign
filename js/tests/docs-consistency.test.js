/**
 * Documentation consistency guard for issue #1.
 */

import { describe, it, expect } from 'test-anywhere';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

const readDoc = (relativePath) =>
  fs.readFile(path.join(repoRoot, relativePath), 'utf8');

describe('issue #1 documentation consistency', () => {
  it('keeps the roadmap mapping every scenario to its critical paths (R-Z25)', async () => {
    const roadmap = await readDoc('docs/ROADMAP.md');
    for (const heading of [
      '## Who meta-sovereign is for',
      '## Foundation: what every scenario relies on',
      '## Personal',
      '## Sales',
      '## Marketing',
      '## User support',
      '## Next, in priority order',
    ]) {
      expect(roadmap.includes(heading)).toBe(true);
    }
    expect(roadmap.includes('./REQUIREMENTS.md')).toBe(true);
    for (const lang of ['ru', 'hi', 'zh']) {
      const translated = await readDoc(`docs/ROADMAP.${lang}.md`);
      expect(translated.includes(`./REQUIREMENTS.${lang}.md`)).toBe(true);
      expect((translated.match(/^## /gm) ?? []).length).toBe(
        (roadmap.match(/^## /gm) ?? []).length
      );
    }
  });

  it('keeps the active issue #1 docs aligned with the implemented prototype', async () => {
    const [requirements, caseStudy, plan] = await Promise.all([
      readDoc('docs/REQUIREMENTS.md'),
      readDoc('docs/case-studies/issue-1/README.md'),
      readDoc('docs/case-studies/issue-1/solution-plan.md'),
    ]);

    expect(requirements.includes('docs/ROADMAP.md')).toBe(true);
    expect(caseStudy.includes('Implemented in PR #2')).toBe(true);
    expect(caseStudy.includes('tracked through follow-up issues')).toBe(false);
    expect(plan.includes('Final status: implemented in PR #2')).toBe(true);
    expect(plan.includes('[follow-up]')).toBe(false);
    expect(plan.includes('[skeleton in PR #2]')).toBe(false);
  });
});
