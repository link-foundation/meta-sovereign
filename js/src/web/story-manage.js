// Managing one's own stories in the viewer, as Telegram Desktop does
// (R-Y210; learned, never copied): the ⋯ menu offers "Edit caption", "Edit
// privacy" (the audience choices of posting), "Save to profile" / "Remove
// from profile", "Copy link" (also for others' public stories) and
// "Delete story" (asked first, in ./story-actions.js). The viewers, the
// profile grid's "Pin to top" and the archive are in ./story-actions.js and
// ./profile-stories.js.

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from './i18n.js';
import { FormDialog, Field } from './chat-create.js';
import { PRIVACY_CHOICES } from './story-post-model.js';
import { Choices, SelectedContacts } from './story-post.js';
import {
  captionForEdit,
  editBody,
  editProblem,
  editedStory,
  manageError,
  manageKeys,
  manageLabel,
} from './story-manage-model.js';

const el = React.createElement;

const copy = async (text) => {
  try {
    await globalThis.navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

/** The edit dialog: the caption in a text area, or the audience. */
export const StoryEditDialog = ({
  api,
  peer,
  story,
  mode,
  onSaved,
  onClose,
}) => {
  const t = useT();
  const [caption, setCaption] = useState(() => captionForEdit(story));
  const [privacy, setPrivacy] = useState(story.privacy ?? 'everyone');
  const [users, setUsers] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState(null);
  const submit = async () => {
    const found = editProblem({ mode, privacy, users });
    if (found) {
      setCode(found);
      return;
    }
    setBusy(true);
    const answer = await Promise.resolve(
      api?.telegramStoryEdit?.(
        editBody({
          chat: peer.peer,
          id: story.id,
          mode,
          caption,
          privacy,
          users,
        })
      )
    ).catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      onSaved(answer);
    } else {
      setCode(answer?.code ?? 'failed');
    }
  };
  const caps = mode === 'caption';
  return createPortal(
    el(
      FormDialog,
      {
        name: caps ? 'story-edit-caption' : 'story-edit-privacy',
        title: t(
          caps ? 'chat.storyManage.editCaption' : 'chat.storyManage.editPrivacy'
        ),
        onClose,
        onSubmit: submit,
        submit: t('chat.storyManage.save'),
        busy,
        error: code ? t(manageError(code)) : null,
      },
      caps
        ? el(Field, {
            label: t('chat.storyPost.caption'),
            name: 'caption',
            area: true,
            value: caption,
            onChange: (e) => setCaption(e.target.value),
          })
        : [
            el(Choices, {
              key: 'w',
              t,
              name: 'privacy',
              label: t('chat.storyPost.who'),
              items: PRIVACY_CHOICES,
              value: privacy,
              onPick: setPrivacy,
            }),
            privacy === 'selected'
              ? el(SelectedContacts, {
                  key: 'c',
                  api,
                  users,
                  setUsers,
                })
              : null,
          ]
    ),
    globalThis.document.body
  );
};

/**
 * What the menu does with a story: the link copied, the profile's pin
 * toggled, an edit saved; `note` is the word shown after.
 */
export const useStoryManage = ({ api, peer, story, update }) => {
  const t = useT();
  const [note, setNote] = useState('');
  const timer = useRef(null);
  useEffect(() => () => globalThis.clearTimeout(timer.current), []);
  const say = (text) => {
    setNote(text);
    globalThis.clearTimeout(timer.current);
    timer.current = globalThis.setTimeout(() => setNote(''), 3000);
  };
  const link = async () => {
    const answer = await Promise.resolve(
      api?.telegramStoryLink?.({ chat: peer.peer, id: story.id })
    ).catch(() => null);
    if (!answer?.ok) {
      say(t(manageError(answer?.code)));
    } else {
      say(
        (await copy(answer.link))
          ? t('chat.storyManage.linkCopied')
          : answer.link
      );
    }
  };
  const pin = async () => {
    const pinned = !story.pinned;
    const answer = await Promise.resolve(
      api?.telegramStoryPin?.({ chat: peer.peer, ids: [story.id], pinned })
    ).catch(() => null);
    if (answer?.ok) {
      update(peer.peer, story.id, { pinned });
      say(t(pinned ? 'chat.storyManage.pinned' : 'chat.storyManage.unpinned'));
    } else {
      say(t(manageError(answer?.code)));
    }
  };
  const saved = (answer) => {
    update(peer.peer, story.id, editedStory(story, answer));
    say(t('chat.storyManage.saved'));
  };
  return { note, link, pin, saved };
};

/** The ⋯ menu's entries for the story: [{ action, label, onClick }]. */
export const manageEntries = ({ t, story, mine, manage, x, onDelete }) => {
  const run = {
    'story-edit-caption': () => x.setOverlay('edit-caption'),
    'story-edit-privacy': () => x.setOverlay('edit-privacy'),
    'story-pin': () => {
      x.setOverlay(null);
      return manage.pin();
    },
    'story-unpin': () => {
      x.setOverlay(null);
      return manage.pin();
    },
    'story-link': () => {
      x.setOverlay(null);
      return manage.link();
    },
    'story-delete-menu': onDelete,
  };
  return manageKeys(story, mine).map((action) => ({
    action,
    label: t(manageLabel(action)),
    onClick: run[action],
  }));
};

/** The edit dialogs over the story, and the note after an action. */
export const ManageLayer = ({ api, peer, story, x, manage }) => {
  const done = () => x.setOverlay(null);
  const mode =
    x.overlay === 'edit-caption'
      ? 'caption'
      : x.overlay === 'edit-privacy'
        ? 'privacy'
        : null;
  return el(React.Fragment, null, [
    story && mode
      ? el(StoryEditDialog, {
          key: mode,
          api,
          peer,
          story,
          mode,
          onSaved: (answer) => {
            manage.saved(answer);
            done();
          },
          onClose: done,
        })
      : null,
    manage.note
      ? el(
          'p',
          {
            key: 'n',
            className: 'story-note story-manage-note',
            role: 'status',
            'data-story-note': 'manage',
          },
          manage.note
        )
      : null,
  ]);
};
