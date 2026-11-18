import { loadPreviousModule } from './previous-module.mjs';

// Run only the named mocked launch regression: no real browser or download.
const parent = 'af27bb6d591e0b8d0149750ae57e96eaf806c0b2';
loadPreviousModule(parent, 'js/src/cv/browser.js');
loadPreviousModule(parent, 'js/src/cv/persistent-browser.js');
await import('../../js/tests/browser-preparation.test.js');
