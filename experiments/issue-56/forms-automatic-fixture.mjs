import { prefillFixtureHtml } from './forms-prefill-fixture.mjs';

export const automaticFixtureHtml = (childBase, second) =>
  second
    ? `<!doctype html><html lang="en"><title>Application: second page</title>
<style>body{font:16px system-ui;max-width:640px;margin:24px}input,textarea{display:block;max-width:100%;box-sizing:border-box}</style>
<form action="/submit" method="post"><label>Preferred language<textarea name="language"></textarea></label><button type="submit">Submit</button></form>
<script>globalThis.events=[];globalThis.navigationClicks=0;for(const name of ['input','change','click','submit'])document.addEventListener(name,e=>events.push(name));</script>`
    : prefillFixtureHtml(childBase)
        .replace('Reviewed application', 'Automatic application: first page')
        .replace(
          '</style>',
          'input,textarea,select{max-width:100%;box-sizing:border-box}iframe{box-sizing:border-box}</style>'
        )
        .replace(
          '<button type="submit"',
          '<label>Resume PDF<input type="file" name="resume" accept=".pdf"></label><label>Something only the owner knows<textarea name="unknown"></textarea></label><button type="submit"'
        )
        .replace(
          'onclick="navigationClicks++">Next',
          'onclick="navigationClicks++;globalThis.location.href=\'/automatic?page=2\'">Next'
        )
        .replace('/prefill', '/automatic');

export const automaticChildHtml = `<!doctype html><html lang="en"><title>Embedded application</title>
<style>body{font:16px system-ui;margin:16px}input{display:block;max-width:100%;box-sizing:border-box}</style>
<label>City and time zone<input name="city"></label><label>CV PDF<input type="file" name="childResume" accept="application/pdf"></label>
<script>globalThis.events=[];for(const name of ['input','change','click','submit'])document.addEventListener(name,e=>events.push(name));</script>`;

/** Independent fixture receipts, read from the actual controls when closed. */
export const automaticControlValues = () =>
  Object.fromEntries(
    [...document.querySelectorAll('input,select,textarea')].map((node) => [
      node.name,
      node.type === 'file'
        ? [...node.files].map(({ name, size, type }) => ({ name, size, type }))
        : node.type === 'checkbox'
          ? node.checked
          : node.value,
    ])
  );
