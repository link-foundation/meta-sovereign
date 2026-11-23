import { loadPreviousModule } from './previous-module.mjs';

const parent = 'be5f077910745a5d373d284d274ff16b5ea23ab3';
for (const module of [
  'media-dom',
  'media-link',
  'native',
  'outcome',
  'plan',
  'review',
]) {
  loadPreviousModule(parent, `js/src/cv/linkedin-position-${module}.js`);
}
