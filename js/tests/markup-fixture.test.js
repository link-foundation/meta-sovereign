// Issue #29: the browser end-to-end run (`js/tests/e2e-cv-browser.mjs`)
// is only as trustworthy as the pages it serves, and those pages are
// generated from the plans themselves. These tests check the generator
// without a browser, so a broken fixture is caught by `npm test`
// instead of surfacing as a confusing Playwright timeout.

import { describe, it, expect } from 'test-anywhere';

import { getCvPlatform } from '../src/cv/platforms/index.js';
import {
  FIXTURE_ROWS,
  fixturePagesFor,
  fixtureText,
  htmlForSelector,
  htmlForStep,
  parseSimpleSelector,
  tokenizeCandidate,
} from './helpers/markup-fixture.js';

describe('selector parsing', () => {
  it('splits a compound selector into tag, id, classes and attributes', () => {
    expect(parseSimpleSelector('button#save.primary[data-qa="x"]')).toEqual({
      tag: 'button',
      id: 'save',
      classes: ['primary'],
      attrs: { 'data-qa': 'x' },
    });
    // `[class*="Module_part"]` is how Next.js sites are addressed.
    expect(parseSimpleSelector('[class*="Skills_name"]').classes).toEqual([
      'Skills_name',
    ]);
  });

  it('keeps whitespace and combinators inside attribute values', () => {
    expect(tokenizeCandidate('main > [data-qa="a b"] span')).toEqual([
      { type: 'element', token: 'main' },
      { type: 'combinator', value: '>' },
      { type: 'element', token: '[data-qa="a b"]' },
      { type: 'element', token: 'span' },
    ]);
  });
});

describe('markup generation', () => {
  it('builds the smallest DOM a selector would match', () => {
    expect(htmlForSelector('section .headline', { text: 'Anna' })).toBe(
      '<section><div class="headline">Anna</div></section>'
    );
    // Only the first candidate is realised: the runner reports a
    // `selector.fallback` whenever it has to use a later one.
    expect(htmlForSelector('#first, #second')).toBe('<div id="first"></div>');
  });

  it('emits a sibling before the subtree for `+` and `~`', () => {
    expect(htmlForSelector('label + input')).toBe('<label></label><input>');
  });

  it('gives each step the element it needs', () => {
    expect(
      htmlForStep('hh', { action: 'fill', path: 'basics.name', selector: '#n' })
    ).toBe('<textarea id="n"></textarea>');
    expect(
      htmlForStep('hh', { action: 'click', selector: '[data-qa="save"]' })
    ).toBe('<button data-qa="save"></button>');
    expect(
      htmlForStep('hh', { action: 'read', path: 'basics.name', selector: 'h1' })
    ).toBe(`<h1>${fixtureText('hh', 'basics.name')}</h1>`);
    // A snapshot wraps the page rather than adding an element of its own.
    expect(htmlForStep('hh', { action: 'snapshot', selector: 'main' })).toBe(
      null
    );
  });

  it('renders list and record sections with several rows', () => {
    const list = htmlForStep('hh', {
      action: 'readList',
      path: 'skills',
      selector: '.skill',
    });
    expect(list.split('<div class="skill">').length - 1).toBe(FIXTURE_ROWS);

    const records = htmlForStep('hh', {
      action: 'readRecords',
      path: 'experience',
      container: '.item',
      fields: { title: '.title', period: '.period' },
      durationField: 'period',
    });
    expect(records.split('<div class="item">').length - 1).toBe(FIXTURE_ROWS);
    expect(records).toContain(fixtureText('hh', 'experience.title', 1));
    // The duration field has to parse as a period, not as fixture text.
    expect(records).toContain('Jan 2001 - Dec 2001');
  });

  it('writes a JSON payload a browser hands back verbatim', () => {
    const html = htmlForStep(
      'habr-career',
      {
        action: 'extractJson',
        selector: 'script[type="application/json"]',
        mapper: 'state',
      },
      { json: { state: { user: { title: 'Anna <b>' } } } }
    );
    // Entities are never decoded inside <script>, so the payload must
    // not be escaped — except for `<`, which JSON escapes itself.
    expect(html).toContain('\\u003c');
    expect(html).not.toContain('&quot;');
    const raw = html.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
    expect(JSON.parse(raw).user.title).toBe('Anna <b>');
  });

  it('leaves the blob out when no payload is declared', () => {
    expect(
      htmlForStep('vietnamworks', {
        action: 'extractJson',
        selector: 'script#__NEXT_DATA__',
        mapper: 'nextData',
      })
    ).toBe(null);
  });
});

describe('pages for a plan', () => {
  const linkedin = getCvPlatform('linkedin');

  it('generates one page per URL the plan visits', () => {
    const pages = fixturePagesFor(linkedin);
    expect(pages.size).toBeGreaterThan(0);
    for (const [url, html] of pages) {
      expect(url.startsWith('https://')).toBe(true);
      expect(html.startsWith('<!doctype html>')).toBe(true);
    }
    const profile = pages.get(linkedin.urls.profile);
    const name = linkedin.read.find(
      (step) => step.action === 'read' && step.path === 'basics.name'
    );
    expect(profile).toContain(fixtureText('linkedin', name.path));
  });

  it('nests the page inside the snapshot containers the plan declares', () => {
    const platform = getCvPlatform('hh');
    const containers = platform.read
      .filter((step) => step.action === 'snapshot' && step.selector !== 'body')
      .map((step) => step.selector.split(',')[0].trim());
    const [, page] = [...fixturePagesFor(platform)][0];
    const body = page.slice(page.indexOf('<body>') + '<body>'.length);
    for (const container of new Set(containers)) {
      // A snapshot names the region the plan photographs, so every
      // element the plan reads has to live inside it.
      expect(body.startsWith(`<${container}>`)).toBe(true);
    }
  });

  it('resolves template variables so the URLs match the runner', () => {
    const habr = getCvPlatform('habr-career');
    const pages = fixturePagesFor(habr, { vars: { login: 'anna' } });
    expect([...pages.keys()]).toContain('https://career.habr.com/anna');
    expect([...pages.keys()].join(' ')).not.toContain('{{');
  });

  it('omits a path so a test can simulate markup drift', () => {
    const pages = fixturePagesFor(linkedin, { omit: ['basics.name'] });
    const profile = pages.get(linkedin.urls.profile);
    expect(profile).not.toContain(fixtureText('linkedin', 'basics.name'));
    expect(profile).toContain(fixtureText('linkedin', 'basics.headline'));
  });

  it('realises an update group instead of the read plan', () => {
    const [group] = linkedin.update;
    const pages = fixturePagesFor(linkedin, {
      plan: 'update',
      groups: [group.id],
    });
    const html = [...pages.values()].join('\n');
    const fills = group.steps.filter((step) => step.action === 'fill');
    expect(fills.length).toBeGreaterThan(0);
    for (const fill of fills) {
      // The element a fill targets is the last token of the selector.
      const tokens = tokenizeCandidate(fill.selector.split(',')[0].trim());
      const target = parseSimpleSelector(tokens.at(-1).token);
      expect(html).toContain(target.id ?? target.classes[0]);
    }
    // A fill needs something typeable, never a bare <div>.
    expect(html).toContain('<textarea');
  });
});
