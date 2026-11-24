import { loadPreviousModule } from './previous-module.mjs';

const parent = '99c20eef4ca8521724d1581f9901fd3d1e9f9d4e';
for (const file of [
  'experience-auto-service',
  'experience-review-service',
  'private-job',
]) {
  loadPreviousModule(parent, `js/src/cv/${file}.js`);
}
