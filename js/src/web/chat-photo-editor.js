// The photo editor of the send box (R-Y187; Telegram Desktop's media
// editor, learned, never copied): crop with ratios and handles, turn left,
// mirror, brush, marker, arrow and eraser, undo and redo. Canvas only;
// Done replaces the file by the edited picture, Cancel changes nothing.
// Editing again starts from the original with the earlier edits kept
// (and their undo stack, while the send box is open).

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import {
  COLORS,
  RATIOS,
  SIZES,
  TOOLS,
  addStroke,
  canRedo,
  canUndo,
  extendStroke,
  fitRatio,
  flipHorizontal,
  handlesFor,
  initialEdit,
  isMark,
  moveCrop,
  newStroke,
  pushHistory,
  ratioOf,
  redoHistory,
  resizeCrop,
  rotateLeft,
  setCrop,
  startHistory,
  turnedSize,
  undoHistory,
} from './photo-editor-model.js';
import { fitBox, paintTurned, renderEdited } from './photo-editor-render.js';

const el = React.createElement;

const TOOL_ICON = {
  crop: 'crop',
  brush: 'pen',
  marker: 'marker',
  arrow: 'arrow-up-right',
  eraser: 'eraser',
};

const ratioLabel = (t, id) =>
  ['free', 'original', 'square'].includes(id) ? t(`photoEditor.${id}`) : id;

// The room for the picture: the window less the bars and tools.
const roomNow = () => ({
  w: Math.max(120, Math.min(720, (globalThis.innerWidth ?? 800) - 40)),
  h: Math.max(120, (globalThis.innerHeight ?? 700) - 300),
});

const point = (event, box) => {
  const r = box.getBoundingClientRect();
  return {
    x: (event.clientX - r.left) / (r.width || 1),
    y: (event.clientY - r.top) / (r.height || 1),
  };
};

const inside = (p) => ({
  x: Math.min(1, Math.max(0, p.x)),
  y: Math.min(1, Math.max(0, p.y)),
});

const Btn = ({ name, icon, label, onClick, disabled, active, children }) =>
  el(
    'button',
    {
      type: 'button',
      className: `icon-btn photo-editor-btn${active ? ' is-active' : ''}`,
      'data-action': name,
      'aria-label': label,
      'aria-pressed': active === undefined ? undefined : active,
      title: label,
      disabled,
      onClick,
    },
    icon ? el(Icon, { name: icon, size: 20 }) : null,
    children
  );

const Swatches = ({ t, color, size, onColor, onSize }) =>
  el('div', { className: 'photo-editor-pen' }, [
    ...COLORS.map((c) =>
      el('button', {
        key: c,
        type: 'button',
        className: `photo-editor-color${c === color ? ' is-active' : ''}`,
        'data-color': c,
        'aria-label': `${t('photoEditor.color')} ${c}`,
        style: { background: c },
        onClick: () => onColor(c),
      })
    ),
    ...SIZES.map((s, i) =>
      el(
        'button',
        {
          key: `s${s}`,
          type: 'button',
          className: `photo-editor-size${i === size ? ' is-active' : ''}`,
          'data-size': i,
          'aria-label': `${t('photoEditor.size')} ${i + 1}`,
          onClick: () => onSize(i),
        },
        el('span', { style: { width: 4 + i * 4, height: 4 + i * 4 } })
      )
    ),
  ]);

// What the dialog is doing with the pointer: a stroke or a crop drag.
const useDrag = ({ box, edit, size, ratio, tool, pen, commit, setLive }) => {
  const [draft, setDraft] = useState(null);
  const drag = useRef(null);
  const down = (event) => {
    if (event.button > 0 || !box.current) {
      return;
    }
    const p = point(event, box.current);
    const handle = event.target.dataset?.handle;
    const onCrop = event.target.closest?.('.photo-editor-crop');
    if (tool === 'crop') {
      if (!handle && !onCrop) {
        return;
      }
      drag.current = {
        kind: handle ? 'resize' : 'move',
        handle,
        from: p,
        base: edit.crop,
      };
    } else {
      const stroke = newStroke(tool, pen.color, SIZES[pen.size], inside(p));
      drag.current = { kind: 'stroke', stroke };
      setLive(stroke);
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };
  const move = (event) => {
    const d = drag.current;
    if (!d) {
      return;
    }
    const p = point(event, box.current);
    if (d.kind === 'stroke') {
      d.stroke = extendStroke(d.stroke, inside(p));
      setLive(d.stroke);
    } else if (d.kind === 'move') {
      setDraft(moveCrop(d.base, p.x - d.from.x, p.y - d.from.y));
    } else {
      setDraft(resizeCrop(d.base, d.handle, inside(p), size, ratio));
    }
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) {
      return;
    }
    if (d.kind === 'stroke') {
      setLive(null);
      if (isMark(d.stroke)) {
        commit(addStroke(edit, d.stroke));
      }
    } else if (draft) {
      commit(setCrop(edit, draft));
    }
    setDraft(null);
  };
  return {
    draft,
    handlers: {
      onPointerDown: down,
      onPointerMove: move,
      onPointerUp: up,
      onPointerCancel: up,
    },
  };
};

const CropBox = ({ crop, handles, active }) =>
  el(
    'div',
    {
      className: `photo-editor-crop${active ? ' is-active' : ''}`,
      style: {
        left: `${crop.x * 100}%`,
        top: `${crop.y * 100}%`,
        width: `${crop.w * 100}%`,
        height: `${crop.h * 100}%`,
      },
    },
    active
      ? handles.map((h) =>
          el('span', {
            key: h,
            className: `photo-editor-handle is-${h}`,
            'data-handle': h,
          })
        )
      : null
  );

const Tools = ({ t, tool, setTool, pen, setPen, ratioId, onRatio }) =>
  el('div', { className: 'photo-editor-tools' }, [
    el(
      'div',
      { key: 'tools', className: 'photo-editor-row' },
      TOOLS.map((name) =>
        el(Btn, {
          key: name,
          name: `photo-tool-${name}`,
          icon: TOOL_ICON[name],
          label: t(`photoEditor.${name}`),
          active: tool === name,
          onClick: () => setTool(name),
        })
      )
    ),
    tool === 'crop'
      ? el(
          'select',
          {
            key: 'ratio',
            className: 'photo-editor-ratio',
            'data-field': 'ratio',
            'aria-label': t('photoEditor.ratio'),
            value: ratioId,
            onChange: (e) => onRatio(e.target.value),
          },
          RATIOS.map((r) =>
            el('option', { key: r.id, value: r.id }, ratioLabel(t, r.id))
          )
        )
      : el(Swatches, {
          key: 'pen',
          t,
          color: pen.color,
          size: pen.size,
          onColor: (color) => setPen({ ...pen, color }),
          onSize: (size) => setPen({ ...pen, size }),
        }),
  ]);

const keyHandler = (act) => (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const control = e.target?.closest?.(
    'select, input, textarea, [data-action="photo-cancel"]'
  );
  if (e.key === 'Escape') {
    act.cancel();
  } else if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    return e.shiftKey ? act.redo() : act.undo();
  } else if (mod && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    act.redo();
  } else if (e.key === 'Enter' && !control && !e.isComposing) {
    e.preventDefault();
    act.done();
  }
  return undefined;
};

const TopBar = ({ t, edit, history, commit, act }) =>
  el('div', { className: 'photo-editor-row photo-editor-top' }, [
    el(Btn, {
      key: 'rl',
      name: 'photo-rotate',
      icon: 'rotate-left',
      label: t('photoEditor.rotate'),
      onClick: () => commit(rotateLeft(edit)),
    }),
    el(Btn, {
      key: 'fl',
      name: 'photo-flip',
      icon: 'flip',
      label: t('photoEditor.flip'),
      onClick: () => commit(flipHorizontal(edit)),
    }),
    el(Btn, {
      key: 'un',
      name: 'photo-undo',
      icon: 'undo',
      label: t('photoEditor.undo'),
      disabled: !canUndo(history),
      onClick: act.undo,
    }),
    el(Btn, {
      key: 're',
      name: 'photo-redo',
      icon: 'redo',
      label: t('photoEditor.redo'),
      disabled: !canRedo(history),
      onClick: act.redo,
    }),
  ]);

const Footer = ({ t, act, busy, ready }) =>
  el('div', { className: 'delete-dialog-btns' }, [
    el(
      'button',
      {
        key: 'cancel',
        type: 'button',
        'data-action': 'photo-cancel',
        disabled: busy,
        onClick: act.cancel,
      },
      t('common.cancel')
    ),
    el(
      'button',
      {
        key: 'done',
        type: 'button',
        className: 'primary',
        'data-action': 'photo-done',
        disabled: !ready || busy,
        onClick: act.done,
      },
      t('photoEditor.done')
    ),
  ]);

// The original picture, decoded once for as long as the editor is open.
const useBitmap = (original) => {
  const [bitmap, setBitmap] = useState(null);
  useEffect(() => {
    let alive = true;
    let loaded = null;
    globalThis.createImageBitmap(original).then((b) => {
      loaded = b;
      return alive ? setBitmap(b) : b.close?.();
    });
    return () => {
      alive = false;
      loaded?.close?.();
    };
  }, [original]);
  return bitmap;
};

// Keys act on the latest state without re-listening on every change.
const useKeys = (act) => {
  const latest = useRef(act);
  latest.current = act;
  useEffect(() => {
    const on = keyHandler({
      cancel: () => latest.current.cancel(),
      undo: () => latest.current.undo(),
      redo: () => latest.current.redo(),
      done: () => latest.current.done(),
    });
    globalThis.addEventListener?.('keydown', on);
    return () => globalThis.removeEventListener?.('keydown', on);
  }, []);
};

const useRoom = () => {
  const [room, setRoom] = useState(roomNow);
  useEffect(() => {
    const on = () => setRoom(roomNow());
    globalThis.addEventListener?.('resize', on);
    return () => globalThis.removeEventListener?.('resize', on);
  }, []);
  return room;
};

// The preview is the turned picture at most ~1000 px, strokes over it.
const usePreview = (canvas, bitmap, edit, live, turned) =>
  useEffect(() => {
    if (!bitmap || !canvas.current) {
      return;
    }
    const scale = Math.min(1, 1000 / Math.max(turned.w, turned.h));
    const w = Math.max(1, Math.round(turned.w * scale));
    const h = Math.max(1, Math.round(turned.h * scale));
    canvas.current.width = w;
    canvas.current.height = h;
    paintTurned(canvas.current.getContext('2d'), bitmap, edit, w, h, live);
  }, [bitmap, edit, live, turned.w, turned.h]);

/**
 * The editor over the send box. `item`: { file, original?, edit? }.
 * `onDone(file, history)` gets the edited File; `onCancel()` closes.
 */
export const PhotoEditor = ({ item, onDone, onCancel }) => {
  const t = useT();
  const original = item.original ?? item.file;
  const bitmap = useBitmap(original);
  const [history, setHistory] = useState(
    () => item.edit ?? startHistory(initialEdit())
  );
  const [tool, setTool] = useState('crop');
  const [ratioId, setRatioId] = useState('free');
  const [pen, setPen] = useState({ color: COLORS[0], size: 1 });
  const [live, setLive] = useState(null);
  const [busy, setBusy] = useState(false);
  const room = useRoom();
  const canvas = useRef(null);
  const box = useRef(null);
  const edit = history.present;
  const turned = bitmap
    ? turnedSize({ w: bitmap.width, h: bitmap.height }, edit.turns)
    : { w: 1, h: 1 };
  const ratio = ratioOf(ratioId, turned);
  const commit = (next) => setHistory((h) => pushHistory(h, next));
  const { draft, handlers } = useDrag({
    box,
    edit,
    size: turned,
    ratio,
    tool,
    pen,
    commit,
    setLive,
  });
  usePreview(canvas, bitmap, edit, live, turned);

  const act = {
    cancel: () => !busy && onCancel(),
    undo: () => setHistory(undoHistory),
    redo: () => setHistory(redoHistory),
    done: async () => {
      if (!bitmap || busy) {
        return;
      }
      setBusy(true);
      onDone(await renderEdited(bitmap, edit, original), history);
    },
  };
  useKeys(act);

  const pickRatio = (id) => {
    setRatioId(id);
    const r = ratioOf(id, turned);
    if (r) {
      commit(setCrop(edit, fitRatio(edit.crop, r, turned)));
    }
  };
  const shown = fitBox(turned, room.w, room.h);
  const body = el(
    'div',
    {
      className: 'delete-dialog-overlay photo-editor-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': t('photoEditor.title'),
    },
    el('div', { className: 'photo-editor' }, [
      el(TopBar, { key: 'top', t, edit, history, commit, act }),
      el(
        'div',
        { key: 'stage', className: 'photo-editor-stage' },
        el(
          'div',
          {
            ref: box,
            className: 'photo-editor-box',
            'data-tool': tool,
            style: { width: shown.w, height: shown.h },
            ...handlers,
          },
          [
            el('canvas', {
              key: 'c',
              ref: canvas,
              className: 'photo-editor-canvas',
              'data-width': bitmap ? turned.w : 0,
            }),
            bitmap
              ? el(CropBox, {
                  key: 'crop',
                  crop: draft ?? edit.crop,
                  handles: handlesFor(ratio),
                  active: tool === 'crop',
                })
              : null,
          ]
        )
      ),
      el(Tools, {
        key: 'tools',
        t,
        tool,
        setTool,
        pen,
        setPen,
        ratioId,
        onRatio: pickRatio,
      }),
      el(Footer, { key: 'btns', t, act, busy, ready: Boolean(bitmap) }),
    ])
  );
  const parent = globalThis.document?.body;
  return parent ? createPortal(body, parent) : body;
};
