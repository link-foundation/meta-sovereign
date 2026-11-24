import { loadPreviousModule } from './previous-module.mjs';

const parent = '15295714bf4e38e5c8b52f0af724c2526d073bc8';
for (const module of ['dom', 'job', 'native', 'outcome', 'plan', 'receipt']) {
  loadPreviousModule(parent, `js/src/cv/linkedin-position-${module}.js`);
}
