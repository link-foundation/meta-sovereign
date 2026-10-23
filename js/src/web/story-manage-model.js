// The pure parts of managing one's own stories (R-Y210; learned, never
// copied): which entries the viewer's ⋯ menu has for a story, what an
// edit asks of the server and how it changes the story shown.

import { toMarkdown } from '../sources/telegram-format.js';

/**
 * The menu entries (action keys) for a story: one's own can be edited,
 * shown on or taken off the profile, linked and deleted; someone else's
 * public story can be linked.
 */
export const manageKeys = (story, mine) => {
  if (!story) {
    return [];
  }
  if (mine) {
    return [
      'story-edit-caption',
      'story-edit-privacy',
      story.pinned ? 'story-unpin' : 'story-pin',
      'story-link',
      'story-delete-menu',
    ];
  }
  return story.public ? ['story-link'] : [];
};

/** The locale key of a menu entry's words. */
export const manageLabel = (key) =>
  ({
    'story-edit-caption': 'chat.storyManage.editCaption',
    'story-edit-privacy': 'chat.storyManage.editPrivacy',
    'story-pin': 'chat.storyManage.pin',
    'story-unpin': 'chat.storyManage.unpin',
    'story-link': 'chat.storyManage.copyLink',
    'story-delete-menu': 'chat.storyManage.delete',
  })[key];

/** The server's request for an edit of the caption or the audience. */
export const editBody = ({ chat, id, mode, caption, privacy, users }) => ({
  chat,
  id,
  ...(mode === 'caption'
    ? { caption: caption.trim() }
    : {
        privacy,
        ...(privacy === 'selected' ? { users: [...users] } : {}),
      }),
});

/** What stops an edit before it is asked, as a code, or null. */
export const editProblem = ({ mode, privacy, users }) =>
  mode === 'privacy' && privacy === 'selected' && users.size === 0
    ? 'users-invalid'
    : null;

/** A caption as the edit box shows it: its formatting as markdown. */
export const captionForEdit = (story) =>
  toMarkdown(story?.caption ?? '', story?.entities ?? []);

/** The story after an edit's answer (only the fields the answer names). */
export const editedStory = (story, answer) => ({
  ...story,
  ...(answer.caption === undefined
    ? {}
    : { caption: answer.caption, entities: answer.entities ?? [] }),
  ...(answer.privacy === undefined ? {} : { privacy: answer.privacy }),
});

const CODES = [
  'no-access',
  'gone',
  'flood',
  'caption-too-long',
  'users-invalid',
  'unchanged',
];

/** The locale key of the words for a code. */
export const manageError = (code) =>
  CODES.includes(code)
    ? `chat.storyManage.err.${code}`
    : 'chat.storyManage.err.failed';
