import { loadPreviousModule } from './previous-module.mjs';

const parent = '4897c725785dc5333b3643bf314a157ad6b73fcc';
for (const module of ['dom', 'job', 'native', 'outcome', 'plan']) {
  loadPreviousModule(parent, `js/src/cv/linkedin-position-${module}.js`);
}
