// Gate both display and requests; stories are optional for this workload.
import { usePref } from './chat-notify.js';

export const STORIES_ENABLED_KEY = 'metaSovereignStoriesEnabled';
export const useStoriesEnabled = () => usePref(STORIES_ENABLED_KEY, false);
