import { useCallback, useEffect, useMemo, useState } from 'react';
import { activeAccount } from './telegram-account-scope.js';
import { useNowSeconds } from './live-clock.js';
import {
  useBirthdayTomorrow,
  useBirthdayHideGreeted,
} from './birthday-prefs.js';
import {
  birthdayDay,
  greetedToday,
  readBirthdayGreeting,
  reminderBirthdays,
} from './birthday-reminders.js';
import { traceClient } from './client-log.js';
import { READ_RECOVERED_EVENT } from './read-retry.js';

const EMPTY = [];

const useBirthdayRevision = (enabled) => {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const refresh = () => setRevision((n) => n + 1);
    globalThis.addEventListener?.('focus', refresh);
    globalThis.addEventListener?.(READ_RECOVERED_EVENT, refresh);
    return () => {
      globalThis.removeEventListener?.('focus', refresh);
      globalThis.removeEventListener?.(READ_RECOVERED_EVENT, refresh);
    };
  }, [enabled]);
  return revision;
};

const useBirthdayList = (api, enabled, account, day, revision) => {
  const [list, setList] = useState(null);
  useEffect(() => {
    if (!enabled || !api?.telegramContactBirthdays) {
      return undefined;
    }
    let live = true;
    Promise.resolve(api.telegramContactBirthdays())
      .then((answer) => {
        if (live && activeAccount() === account && answer?.ok) {
          setList({ account, day, birthdays: answer.birthdays ?? [] });
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api, enabled, account, day, revision]);
  return list?.account === account && list.day === day ? list.birthdays : EMPTY;
};

const checkHistory = async (api, ids, day, remember, cancelled) => {
  let failed = false;
  for (const chat of ids) {
    if (cancelled()) {
      break;
    }
    try {
      if (
        (await readBirthdayGreeting(api, chat, day, cancelled)) &&
        !cancelled()
      ) {
        remember([chat]);
      }
    } catch (error) {
      failed = true;
      if (!cancelled()) {
        traceClient(api, 'birthday_history_unavailable', {
          chat,
          code: error.code ?? 'read-failed',
        });
      }
    }
  }
  return failed;
};

const useGreetedBirthdays = (
  api,
  { enabled, todayIds, account, day, revision, chats, messages }
) => {
  const [greeted, setGreeted] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const remember = useCallback(
    (ids) => {
      if (!ids.length) {
        return;
      }
      setGreeted((old) => {
        const kept =
          old?.account === account && old.day === day.start
            ? old.ids
            : new Set();
        return ids.every((id) => kept.has(id))
          ? old
          : { account, day: day.start, ids: new Set([...kept, ...ids]) };
      });
    },
    [account, day]
  );
  useEffect(() => {
    if (!enabled || !todayIds) {
      return;
    }
    const ids = new Set(todayIds.split(','));
    const observed = [
      ...messages,
      ...chats.map((chat) => chat.last?.message),
    ].filter(
      (message) =>
        message?.source === 'telegram' &&
        ids.has(String(message.chat)) &&
        greetedToday(message, day)
    );
    remember(observed.map((message) => String(message.chat)));
  }, [enabled, todayIds, day, chats, messages, remember]);
  useEffect(() => {
    if (!enabled || !todayIds) {
      return undefined;
    }
    let live = true;
    let retryTimer = null;
    const cancelled = () => !live || activeAccount() !== account;
    checkHistory(api, todayIds.split(','), day, remember, cancelled).then(
      (failed) => {
        if (!cancelled() && failed) {
          retryTimer = globalThis.setTimeout(
            () => setAttempt((n) => n + 1),
            Math.min(60_000, 5000 * 2 ** Math.min(attempt, 4))
          );
        }
      }
    );
    return () => {
      live = false;
      globalThis.clearTimeout(retryTimer);
    };
  }, [api, enabled, todayIds, account, day, revision, attempt, remember]);
  return greeted?.account === account && greeted.day === day.start
    ? greeted.ids
    : new Set();
};

export const useBirthdayReminders = (
  api,
  enabled,
  chats = EMPTY,
  messages = EMPTY
) => {
  const [tomorrow] = useBirthdayTomorrow();
  const [hideGreeted] = useBirthdayHideGreeted();
  const now = useNowSeconds(enabled, 60_000);
  const account = activeAccount();
  const dayStart = birthdayDay(new Date(now * 1000)).start;
  const day = useMemo(() => birthdayDay(new Date(dayStart)), [dayStart]);
  const revision = useBirthdayRevision(enabled);
  const list = useBirthdayList(api, enabled, account, dayStart, revision);
  const visible = useMemo(
    () => reminderBirthdays(list, tomorrow, new Date(dayStart)),
    [list, tomorrow, dayStart]
  );
  const todayIds = visible
    .filter((one) => one.days === 0)
    .map((one) => String(one.chat))
    .sort()
    .join(',');
  const hidden = useGreetedBirthdays(api, {
    enabled: enabled && hideGreeted,
    todayIds,
    account,
    day,
    revision,
    chats,
    messages,
  });
  return enabled
    ? visible.filter(
        (one) => !hideGreeted || one.days !== 0 || !hidden.has(String(one.chat))
      )
    : EMPTY;
};
