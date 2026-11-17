import { loadPreviousModule } from './previous-module.mjs';

for (const file of ['discovery.js', 'discovery-data.js']) {
  loadPreviousModule('51047939', `js/src/jobs/${file}`);
}
