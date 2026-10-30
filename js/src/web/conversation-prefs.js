import { useEffect, useRef, useState } from 'react';
import { getLocalStorage } from '../storage/local-storage.js';
import {
  CONVERSATION_SETTINGS_ID,
  conversationSettings,
} from '../crm/conversation-policy.js';

export const CONVERSATION_PREF_KEY = 'metaSovereignConversationLearning';
export const readConversationSettings = (storage = getLocalStorage()) => {
  try {
    return conversationSettings(
      JSON.parse(storage?.getItem(CONVERSATION_PREF_KEY) ?? '{}')
    );
  } catch {
    return conversationSettings();
  }
};
export const writeConversationSettings = (
  value,
  storage = getLocalStorage()
) => {
  try {
    storage?.setItem(
      CONVERSATION_PREF_KEY,
      JSON.stringify(conversationSettings(value))
    );
  } catch {
    /* The current view still keeps the choice. */
  }
};
export const useConversationSettings = (api) => {
  const [settings, setSettings] = useState(readConversationSettings);
  const [error, setError] = useState(null);
  const latest = useRef(settings);
  const edited = useRef(false);
  const saving = useRef(Promise.resolve());
  latest.current = settings;
  useEffect(() => {
    let live = true;
    Promise.resolve(
      api?.conversationSettings?.() ?? api?.get?.(CONVERSATION_SETTINGS_ID)
    ).then(
      (record) => {
        if (!live || !record || edited.current) {
          return;
        }
        const next = conversationSettings(record);
        writeConversationSettings(next);
        setSettings(next);
      },
      () => {}
    );
    return () => {
      live = false;
    };
  }, [api]);
  return {
    settings,
    error,
    set(key, on) {
      edited.current = true;
      const next = conversationSettings({ ...latest.current, [key]: on });
      latest.current = next;
      setSettings(next);
      writeConversationSettings(next);
      setError(null);
      saving.current = saving.current
        .then(
          () =>
            api?.saveConversationSettings?.(next) ??
            api?.put?.({
              id: CONVERSATION_SETTINGS_ID,
              tokens: ['conversation-learning', 'settings'],
              ...next,
            })
        )
        .then(
          (answer) => {
            if (
              latest.current === next &&
              (answer?.error || answer?.status === 'failed')
            ) {
              setError(answer.error ?? answer.code);
            }
          },
          (failure) => {
            if (latest.current === next) {
              setError(failure.message);
            }
          }
        );
    },
  };
};
