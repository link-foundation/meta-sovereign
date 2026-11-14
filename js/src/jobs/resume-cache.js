import { resumeList, resumeListId, chooseSearchResume } from './resume-list.js';
import { jobsFailure } from './options.js';

export const saveResumeList = async (
  store,
  read,
  options,
  selection,
  enrich = async (list) => list
) => {
  const list = resumeList(await read(options), options.browserSlot);
  options.signal.throwIfAborted();
  const result = await enrich(list, options.signal);
  options.signal.throwIfAborted();
  const choice = chooseSearchResume(result, selection);
  await store.put({ id: resumeListId(list.browserSlot), version: 1, ...list });
  return { ...result, selection: choice };
};

export const storedResumeLists = async (query) => {
  const rows = await query((row) => row.id?.startsWith('jobs-resumes:'));
  return {
    lists: rows.slice(0, 100).map((row) => {
      const list = resumeList(row);
      if (row.version !== 1 || row.id !== resumeListId(list.browserSlot)) {
        throw jobsFailure(
          'resumes-cache-invalid',
          'A saved resume list has an invalid identity.'
        );
      }
      return list;
    }),
  };
};
