import { useState } from 'react';
import { readPref, writePref } from './chat-notify.js';

const KEY = 'metaSovereignContinueLastMessage';
let current = false;

export const readContinueLast = () => readPref(KEY, current);

export const useContinueLast = () => {
  const [on, setOn] = useState(readContinueLast);
  return [
    on,
    (next) => {
      current = next;
      writePref(KEY, next);
      setOn(next);
    },
  ];
};
