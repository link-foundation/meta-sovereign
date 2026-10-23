// Picture-in-picture for videos and round videos (R-Y182; learned, never
// copied): a button where the browser can do it — the standard API
// (document.pictureInPictureEnabled, video.requestPictureInPicture) or
// WebKit's presentation mode — and the playback goes on in the small
// window while another chat is opened: a video in picture-in-picture is
// kept alive in a hidden holder when its message leaves the page, and
// let go when the window closes. The feature tests are pure.

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';

const el = React.createElement;

const WEBKIT = 'picture-in-picture';

/**
 * How `video` can go picture-in-picture here: `'standard'`, `'webkit'`
 * or null. `doc` is the document (for its `pictureInPictureEnabled`).
 */
export const pipModeOf = (video, doc = globalThis.document) => {
  if (!video) {
    return null;
  }
  if (
    doc?.pictureInPictureEnabled === true &&
    typeof video.requestPictureInPicture === 'function' &&
    video.disablePictureInPicture !== true
  ) {
    return 'standard';
  }
  if (
    typeof video.webkitSetPresentationMode === 'function' &&
    typeof video.webkitSupportsPresentationMode === 'function' &&
    video.webkitSupportsPresentationMode(WEBKIT)
  ) {
    return 'webkit';
  }
  return null;
};

/** Whether `video` is in the small window now. */
export const inPip = (video, doc = globalThis.document) =>
  Boolean(video) &&
  (doc?.pictureInPictureElement === video ||
    video.webkitPresentationMode === WEBKIT);

/** Enters or leaves picture-in-picture; false when it is not possible. */
export const togglePip = async (video, doc = globalThis.document) => {
  const mode = pipModeOf(video, doc);
  if (!mode) {
    return false;
  }
  try {
    if (mode === 'webkit') {
      video.webkitSetPresentationMode(inPip(video, doc) ? 'inline' : WEBKIT);
    } else if (doc.pictureInPictureElement === video) {
      await doc.exitPictureInPicture();
    } else {
      await video.requestPictureInPicture();
    }
    return true;
  } catch {
    // A refusal (no gesture, no frames yet) leaves the video as it is.
    return false;
  }
};

const EVENTS = [
  'loadedmetadata',
  'enterpictureinpicture',
  'leavepictureinpicture',
  'webkitpresentationmodechanged',
];

let holder = null;

// A video in the small window outlives its message: it moves to a hidden
// holder, and goes when the window closes.
const keepWhileInPip = (video) => {
  if (!video || !inPip(video) || typeof document === 'undefined') {
    return;
  }
  if (!holder?.isConnected) {
    holder = document.createElement('div');
    holder.className = 'pip-keeper';
    holder.setAttribute('aria-hidden', 'true');
    document.body.append(holder);
  }
  holder.append(video);
  const release = () => {
    if (!inPip(video)) {
      video.pause?.();
      video.remove();
      video.removeEventListener('leavepictureinpicture', release);
      video.removeEventListener('webkitpresentationmodechanged', release);
    }
  };
  video.addEventListener('leavepictureinpicture', release);
  video.addEventListener('webkitpresentationmodechanged', release);
};

/**
 * `{ mode, active, toggle }` for the video `ref` holds once `ready`
 * (the element exists); the video lives on in the small window if its
 * message leaves the page.
 */
export const usePip = (ref, ready) => {
  const [mode, setMode] = useState(null);
  const [active, setActive] = useState(false);
  const held = useRef(null);
  useEffect(() => {
    const video = ref.current;
    held.current = video;
    if (!video) {
      setMode(null);
      return undefined;
    }
    const update = () => {
      setMode(pipModeOf(video));
      setActive(inPip(video));
    };
    update();
    EVENTS.forEach((name) => video.addEventListener(name, update));
    return () =>
      EVENTS.forEach((name) => video.removeEventListener(name, update));
  }, [ready]);
  // Before the element is taken off the page (a layout cleanup runs
  // while it is still in it).
  useLayoutEffect(() => () => keepWhileInPip(held.current), []);
  return { mode, active, toggle: () => togglePip(ref.current) };
};

/** The button over a video; nothing where the browser cannot do it. */
export const PipButton = ({ pip }) => {
  const t = useT();
  if (!pip.mode) {
    return null;
  }
  const label = t(pip.active ? 'chat.media.pipExit' : 'chat.media.pip');
  return el(
    'button',
    {
      type: 'button',
      className: pip.active ? 'media-pip active' : 'media-pip',
      'data-action': 'pip',
      'data-pip': pip.mode,
      'aria-label': label,
      'aria-pressed': pip.active,
      title: label,
      onClick: (event) => {
        event.stopPropagation();
        pip.toggle();
      },
      onKeyDown: (event) => event.stopPropagation(),
      onDoubleClick: (event) => event.stopPropagation(),
    },
    el(Icon, { name: 'pip', size: 16 })
  );
};
