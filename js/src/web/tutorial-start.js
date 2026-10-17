// Where the tour starts, and whether it opens by itself.
//
// The tour opens by itself for a new user only: nothing saved yet and no
// service connected. Someone whose Telegram account (or any saved
// credential) is already up and running has done the first steps, so the
// tour stays closed until they press "Tutorial" in the header — and then
// it starts after the connection steps (Back still reaches them).

import { useEffect, useState } from 'react';

const isSecret = (link) =>
  typeof link?.id === 'string' && link.id.startsWith('secret:');

/** Whether any service is connected: the Telegram account or a saved key. */
export const anyConnection = async (api) => {
  const status = await Promise.resolve(api.telegramStatus?.()).catch(
    () => null
  );
  if (status?.connected) {
    return true;
  }
  const links = await Promise.resolve(api.links?.()).catch(() => []);
  return (links ?? []).some(isSecret);
};

/** `null` while checking, then whether a service is connected. */
export const useAnyConnection = (api) => {
  const [connected, setConnected] = useState(null);
  useEffect(() => {
    let live = true;
    anyConnection(api).then(
      (value) => live && setConnected(value),
      () => live && setConnected(false)
    );
    return () => {
      live = false;
    };
  }, [api]);
  return connected;
};

/**
 * Open the tour without being asked? Never once it was turned off or
 * finished; a tour in progress resumes; a fresh one only while nothing is
 * connected.
 */
export const shouldAutoOpen = (pref, connected) =>
  !pref?.off && (Boolean(pref?.stepId) || connected === false);

/**
 * The step to show: the saved one, moved past the connection steps
 * (`connecting: true`) when a service is already connected.
 */
export const startIndex = (steps, savedIndex, connected) => {
  if (!connected || !steps[savedIndex]?.connecting) {
    return savedIndex;
  }
  const after = steps.findIndex(
    (step, index) => index > savedIndex && !step.connecting
  );
  return after >= 0 ? after : savedIndex;
};
