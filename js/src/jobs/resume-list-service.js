import { jobsBrowserOptions } from './options.js';
import { resumeChoiceOptions } from './resume-list.js';
import { saveResumeList, storedResumeLists } from './resume-cache.js';
import { withResumeLanguages } from './resume-language-files.js';
import { acknowledgedRead, acknowledgedWrite } from './acknowledged-store.js';

export const createResumeListControl = ({ store, read, artifactRoot, run }) => {
  const enrich = (list, signal) =>
    withResumeLanguages({ store, artifactRoot }, list, signal);
  return {
    resumes(input) {
      const options = jobsBrowserOptions(input);
      const choice = resumeChoiceOptions(input);
      return acknowledgedWrite(store, run, (signal) =>
        saveResumeList(store, read, { ...options, signal }, choice, enrich)
      );
    },
    'resumes-stored': () =>
      acknowledgedRead(store, async () => {
        const { lists } = await storedResumeLists((predicate) =>
          store.query(predicate)
        );
        const verified = [];
        for (const list of lists) {
          verified.push(await enrich(list));
        }
        return { lists: verified };
      }),
  };
};
