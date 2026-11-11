import { payFixtureHtml } from './forms-pay-fixture.mjs';
import { assignmentFixtureHtml } from './forms-assignment-fixture.mjs';
import { captchaFixtureHtml } from './forms-captcha-fixture.mjs';
import { matchingFixtureHtml } from './question-matching-fixture.mjs';
import {
  automaticFixtureHtml,
  automaticChildHtml,
} from './forms-automatic-fixture.mjs';
import { createServer } from 'node:http';
import { modelFixtureHtml } from './forms-model-fixture.mjs';
import { linksFixtureHtml } from './forms-links-fixture.mjs';
import { timezoneFixtureHtml } from './forms-timezone-fixture.mjs';
import { subjectFixtureHtml } from './forms-subject-fixture.mjs';
import { learningFixtureHtml } from './forms-learning-fixture.mjs';
import {
  monitorFixtureHtml,
  monitorChildHtml,
} from './forms-monitor-fixture.mjs';
import { uploadFixtureHtml, uploadChildHtml } from './forms-resume-fixture.mjs';
import { prefillFixtureHtml } from './forms-prefill-fixture.mjs';
import { radioFixtureHtml, radioChildHtml } from './forms-radio-fixture.mjs';
import { customFixtureHtml, customChildHtml } from './forms-custom-fixture.mjs';
import {
  choicesFixtureHtml,
  choicesChildHtml,
} from './forms-choices-fixture.mjs';

const frameHtml = `<!doctype html><html lang="en"><title>Embedded questionnaire</title>
<label for="city">City and time zone</label><input id="city" value="Nha Trang, UTC+7">
<div role="radiogroup" aria-labelledby="remote-question"><h2 id="remote-question">Work arrangement</h2>
<div role="radio" tabindex="0" aria-label="Remote" aria-checked="true">Remote</div>
<div role="radio" tabindex="0" aria-label="Office" aria-checked="false">Office</div></div>
<script>globalThis.events=[];for(const name of ['input','change','click','submit'])document.addEventListener(name,e=>events.push(name));</script>`;

const simplePages = {
  '/assignment': assignmentFixtureHtml,
  '/captcha': captchaFixtureHtml,
  '/matching': matchingFixtureHtml,
  '/pay': payFixtureHtml,
  '/subjects': subjectFixtureHtml,
  '/timezone': timezoneFixtureHtml,
  '/links': linksFixtureHtml,
  '/model': modelFixtureHtml,
};

export const startFormsFixture = async () => {
  const requests = [];
  let submits = 0;
  const child = createServer((req, res) => {
    requests.push({ server: 'child', method: req.method, url: req.url });
    res.setHeader('content-type', 'text/html');
    if (req.url.startsWith('/automatic')) {
      res.end(automaticChildHtml);
      return;
    }
    if (req.url.startsWith('/monitor')) {
      res.end(monitorChildHtml(req.url.includes('hidden')));
      return;
    }
    if (req.url.startsWith('/upload')) {
      res.end(uploadChildHtml);
      return;
    }
    if (req.url.startsWith('/choices')) {
      res.end(choicesChildHtml);
      return;
    }
    if (req.url.startsWith('/custom')) {
      res.end(customChildHtml);
      return;
    }
    if (req.url.startsWith('/radio')) {
      res.end(radioChildHtml);
      return;
    }
    res.end(
      req.url.startsWith('/prefill')
        ? frameHtml.replace('value="Nha Trang, UTC+7"', 'value=""')
        : frameHtml
    );
  });
  await new Promise((resolve) => child.listen(0, '127.0.0.1', resolve));
  const childBase = `http://127.0.0.1:${child.address().port}`;
  const main = createServer((req, res) => {
    requests.push({ server: 'main', method: req.method, url: req.url });
    if (req.method !== 'GET') {
      submits++;
    }
    res.setHeader('content-type', 'text/html');
    if (req.url.startsWith('/automatic')) {
      res.end(
        automaticFixtureHtml(
          childBase,
          new URL(req.url, 'http://fixture.test').searchParams.get('page') ===
            '2'
        )
      );
      return;
    }
    const simple = Object.entries(simplePages).find(([path]) =>
      req.url.startsWith(path)
    );
    if (simple) {
      res.end(simple[1]);
      return;
    }
    if (req.url.startsWith('/learning')) {
      res.end(
        learningFixtureHtml(
          new URL(req.url, 'http://fixture.test').searchParams.get('page') ===
            '2'
        )
      );
      return;
    }
    if (req.url.startsWith('/monitor')) {
      res.end(
        monitorFixtureHtml(
          childBase,
          new URL(req.url, 'http://fixture.test').searchParams.get('page') ===
            '2'
        )
      );
      return;
    }
    if (req.url.startsWith('/upload')) {
      res.end(uploadFixtureHtml(childBase));
      return;
    }
    if (req.url.startsWith('/choices')) {
      res.end(choicesFixtureHtml(childBase));
      return;
    }
    if (req.url.startsWith('/radio')) {
      res.end(radioFixtureHtml(childBase));
      return;
    }
    if (req.url.startsWith('/custom')) {
      res.end(customFixtureHtml(childBase));
      return;
    }
    if (req.url.startsWith('/prefill')) {
      res.end(prefillFixtureHtml(childBase));
      return;
    }
    res.end(`<!doctype html><html lang="en"><title>Application questionnaire</title>
<style>body{font:16px system-ui;max-width:640px;margin:24px}label,input,textarea,select{display:block;margin:8px 0}iframe{width:100%;height:240px}</style>
<form action="/submit" method="post">
<label for="name">Full name</label><input id="name" name="fullName" required value="Owner's current answer">
<label>Email <input type="email" name="email" value="owner@example.test"></label>
<span id="salary-label">Salary expectations</span><span id="salary-unit">per month</span>
<input name="salary" aria-labelledby="salary-label salary-unit" aria-label="less specific" aria-describedby="salary-help" value="450000">
<p id="salary-help">In local currency, after tax.</p>
<fieldset><legend>Availability</legend><input name="start" type="date" value="2026-12-01"></fieldset>
<fieldset disabled><legend>Existing review</legend><label>Approved <input type="checkbox" checked value="yes"></label></fieldset>
<section><h2>Recent experience</h2><textarea name="experience" readonly>First line\n  Second line</textarea></section>
<input placeholder="Portfolio link" name="portfolio" value="https://example.test/work">
<input title="Preferred language" name="language" value="English">
<label>Location <select name="location"><option value="vn" selected>Vietnam</option><option value="ru" disabled>Russia</option></select></label>
<div role="combobox" aria-label="Preferred team" tabindex="0" aria-expanded="false"></div>
<label>Password <input type="password" name="password" value="never-read-this"></label>
<label>Resume <input type="file" name="resume"></label>
<input type="hidden" value="hidden-secret"><div hidden><label>Invisible <input value="invisible"></label></div>
<button type="submit">Submit</button><button type="button">Next</button>
<iframe title="External application questions" src="${childBase}/questions"></iframe>
<iframe hidden title="Hidden questions" src="${childBase}/hidden"></iframe>
</form>
<script>
globalThis.events=[];for(const name of ['input','change','click','submit'])document.addEventListener(name,e=>events.push(name));
for(const name of ['password','resume'])Object.defineProperty(document.querySelector('[name="'+name+'"]'),'value',{get(){throw new Error('Sensitive field was read')}});
</script>`);
  });
  await new Promise((resolve) => main.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${main.address().port}/application`,
    childBase,
    requests,
    get submits() {
      return submits;
    },
    async close() {
      await Promise.all([
        new Promise((resolve) => main.close(resolve)),
        new Promise((resolve) => child.close(resolve)),
      ]);
    },
  };
};

// Deterministic same-document drift, shared by the browser regression and MCP.
export const driftFormDocumentClock = () => {
  const origin = globalThis.performance.timeOrigin;
  let reads = 0;
  Object.defineProperty(globalThis.performance, 'timeOrigin', {
    configurable: true,
    get: () => origin + ++reads,
  });
};
