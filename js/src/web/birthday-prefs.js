// Birthday reminders take space only while there is something left to do.
import { usePref } from './chat-notify.js';

export const BIRTHDAY_TOMORROW_KEY = 'metaSovereignBirthdayTomorrow';
export const BIRTHDAY_HIDE_GREETED_KEY = 'metaSovereignBirthdayHideGreeted';
export const useBirthdayTomorrow = () => usePref(BIRTHDAY_TOMORROW_KEY, false);
export const useBirthdayHideGreeted = () =>
  usePref(BIRTHDAY_HIDE_GREETED_KEY, true);
