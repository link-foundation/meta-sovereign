// React view components for the SPA. The components keep the same API
// surface the vanilla views used: all data flows through ./dom.js so
// offline storage, discovery, WebRTC sync, and server fallbacks stay
// unchanged.

import React, { useEffect, useMemo, useState } from 'react';
import { api } from './dom.js';
import { ConnectionGuide } from './connection-guide.js';
import { navItems } from './nav-items.js';
import { SettingsView } from './settings-view.js';
import { useT } from './i18n.js';
import { ConnectionsList, ConnectionDetail } from './connections/index.js';

const el = React.createElement;
const fmtTs = (ts) => (ts ? new Date(ts).toLocaleString() : '');

export { navItems };

const useAsyncValue = (loader, deps, initialValue) => {
  const [state, setState] = useState({
    loading: true,
    error: null,
    value: initialValue,
  });
  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: null }));
    Promise.resolve()
      .then(loader)
      .then(
        (value) => {
          if (!cancelled) {
            setState({ loading: false, error: null, value });
          }
        },
        (error) => {
          if (!cancelled) {
            setState({
              loading: false,
              error,
              value: initialValue,
            });
          }
        }
      );
    return () => {
      cancelled = true;
    };
  }, deps);
  return state;
};

const Loading = () => {
  const t = useT();
  return el('div', { className: 'meta' }, t('common.loading'));
};

const ErrorMessage = ({ error }) =>
  error ? el('pre', { role: 'alert' }, String(error.message ?? error)) : null;

const AsyncFrame = ({ state, children }) => {
  if (state.loading) {
    return el(Loading);
  }
  if (state.error) {
    return el(ErrorMessage, { error: state.error });
  }
  return children(state.value);
};

const refreshReducer = (value) => value + 1;

export const ChatView = () => {
  const t = useT();
  const [refresh, setRefresh] = useState(0);
  const state = useAsyncValue(() => api.links(), [refresh], []);
  const [active, setActive] = useState('');
  const [text, setText] = useState('');
  const [completions, setCompletions] = useState([]);

  const messages = useMemo(
    () =>
      state.value
        .filter((link) => link.id?.startsWith('msg:'))
        .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp))),
    [state.value]
  );
  const chats = useMemo(
    () => [...new Set(messages.map((msg) => `${msg.source}:${msg.chat}`))],
    [messages]
  );

  useEffect(() => {
    if (!active && chats[0]) {
      setActive(chats[0]);
    } else if (active && chats.length > 0 && !chats.includes(active)) {
      setActive(chats[0]);
    }
  }, [active, chats]);

  const activeMessages = messages.filter(
    (msg) => `${msg.source}:${msg.chat}` === active
  );

  const updateText = async (next) => {
    setText(next);
    if (!next) {
      setCompletions([]);
      return;
    }
    const items = await api.autocomplete(next);
    setCompletions(items.map((item) => item.text ?? item));
  };

  const send = async () => {
    if (!text.trim() || !active) {
      return;
    }
    const [source, chat] = active.split(':');
    const now = Date.now();
    await api.put({
      id: `msg:${source}:${now}`,
      tokens: ['message', source, String(now)],
      sender: 'me',
      chat,
      source,
      body: text,
      timestamp: new Date().toISOString(),
    });
    setText('');
    setCompletions([]);
    setRefresh(refreshReducer);
  };

  return el(AsyncFrame, { state }, () => {
    if (chats.length === 0) {
      return el(ConnectionGuide, { section: 'chat' });
    }
    return el('div', { className: 'chat' }, [
      el('aside', { key: 'aside' }, [
        el('div', { key: 'h', className: 'aside-h' }, t('chat.aside')),
        ...chats.map((chat) =>
          el(
            'button',
            {
              key: chat,
              type: 'button',
              className: chat === active ? 'active' : '',
              onClick: () => setActive(chat),
            },
            chat
          )
        ),
      ]),
      el('div', { key: 'col', className: 'col' }, [
        el(
          'div',
          { key: 'stream', className: 'stream' },
          activeMessages.map((msg) =>
            el(
              'div',
              {
                key: msg.id,
                className: msg.sender === 'me' ? 'msg me' : 'msg',
              },
              [
                el(
                  'div',
                  { key: 'meta', className: 'meta' },
                  `${msg.sender} - ${fmtTs(msg.timestamp)}`
                ),
                el('div', { key: 'body' }, msg.body ?? ''),
              ]
            )
          )
        ),
        el('div', { key: 'composer', className: 'composer' }, [
          el(
            'div',
            { key: 'completions', className: 'completions' },
            completions.map((item) =>
              el(
                'button',
                {
                  key: item,
                  type: 'button',
                  onClick: () => {
                    setText(item);
                    setCompletions([]);
                  },
                },
                item
              )
            )
          ),
          el('textarea', {
            key: 'input',
            rows: 2,
            placeholder: t('chat.placeholder'),
            value: text,
            onChange: (event) => updateText(event.target.value),
          }),
          el(
            'button',
            {
              key: 'send',
              type: 'button',
              className: 'primary',
              onClick: send,
            },
            t('common.send')
          ),
        ]),
      ]),
    ]);
  });
};

export const OperatorView = () => {
  const t = useT();
  const state = useAsyncValue(() => api.links(), [], []);
  const [index, setIndex] = useState(0);
  const queue = useMemo(
    () =>
      state.value
        .filter((link) => link.id?.startsWith('msg:') && link.sender !== 'me')
        .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))),
    [state.value]
  );
  const next = () => setIndex((current) => Math.min(current + 1, queue.length));

  useEffect(() => {
    const onKey = (event) => {
      if (['d', 'D', 'n', 'N'].includes(event.key)) {
        next();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  return el(AsyncFrame, { state }, () => {
    const msg = queue[index];
    if (!msg) {
      return el(ConnectionGuide, { section: 'operator' });
    }
    return el('div', { className: 'col operator' }, [
      el('h2', { key: 'h' }, t('operator.title')),
      el(
        'div',
        { key: 'status', className: 'meta' },
        t('operator.progress', {
          current: index + 1,
          total: queue.length,
        })
      ),
      el('div', { key: 'card', className: 'card' }, [
        el(
          'div',
          { key: 'meta', className: 'meta' },
          `${msg.source} - ${msg.chat} - ${msg.sender} - ${fmtTs(msg.timestamp)}`
        ),
        el('div', { key: 'body', className: 'big' }, msg.body ?? ''),
        el('div', { key: 'actions', className: 'row' }, [
          el(
            'button',
            { key: 'next', type: 'button', onClick: next },
            t('operator.next')
          ),
          el(
            'button',
            {
              key: 'done',
              type: 'button',
              className: 'primary',
              onClick: next,
            },
            t('operator.done')
          ),
        ]),
      ]),
    ]);
  });
};

export const ContactsView = () => {
  const t = useT();
  const state = useAsyncValue(() => api.contacts(), [], []);
  return el(AsyncFrame, { state }, (contacts) => {
    if (!contacts || contacts.length === 0) {
      return el(ConnectionGuide, { section: 'contacts' });
    }
    return el('div', {}, [
      el('h2', { key: 'h' }, t('contacts.title', { count: contacts.length })),
      el('table', { key: 'table' }, [
        el('thead', { key: 'head' }, [
          el('tr', {}, [
            el('th', {}, t('contacts.identity')),
            el('th', {}, t('contacts.networks')),
            el('th', {}, t('contacts.chats')),
            el('th', {}, t('contacts.messages')),
            el('th', {}, t('contacts.lastSeen')),
          ]),
        ]),
        el(
          'tbody',
          { key: 'body' },
          contacts.map((contact) =>
            el('tr', { key: contact.id }, [
              el('td', {}, contact.id),
              el('td', {}, (contact.networks ?? []).join(', ')),
              el('td', {}, String((contact.chats ?? []).length)),
              el('td', {}, String(contact.messageCount ?? contact.count ?? 0)),
              el('td', {}, fmtTs(contact.lastSeen)),
            ])
          )
        ),
      ]),
    ]);
  });
};

const GraphPreview = ({ graph }) => {
  const t = useT();
  return el('div', { className: 'graph' }, [
    ...(graph.nodes ?? []).map((node) =>
      el(
        'span',
        { key: node.id, className: 'node' },
        `${node.kind}: ${node.label ?? node.id}`
      )
    ),
    el(
      'div',
      { key: 'edges', className: 'meta', style: { marginTop: '0.5rem' } },
      t('automation.edges', { count: (graph.edges ?? []).length })
    ),
  ]);
};

export const AutomationView = () => {
  const t = useT();
  const [refresh, setRefresh] = useState(0);
  const state = useAsyncValue(() => api.graphs(), [refresh], []);
  const [current, setCurrent] = useState(null);
  const graphs = state.value;

  useEffect(() => {
    if (!current) {
      setCurrent(
        graphs[0] ?? {
          id: 'graph:default',
          tokens: ['graph'],
          nodes: [],
          edges: [],
        }
      );
    }
  }, [current, graphs]);

  const selected = current ??
    graphs[0] ?? {
      id: 'graph:default',
      tokens: ['graph'],
      nodes: [],
      edges: [],
    };

  const addNode = (kind) => {
    setCurrent((graph) => {
      const base = graph ?? selected;
      const nodes = [...(base.nodes ?? [])];
      const id = `${kind}-${nodes.length + 1}`;
      nodes.push({ id, kind, label: id });
      return { ...base, nodes };
    });
  };

  const save = async () => {
    await api.saveGraph(selected);
    setRefresh(refreshReducer);
  };

  return el(AsyncFrame, { state }, () => {
    if (graphs.length === 0 && (selected.nodes ?? []).length === 0) {
      return el(ConnectionGuide, { section: 'automation' });
    }
    return el('div', { className: 'col' }, [
      el('h2', { key: 'h' }, t('automation.title')),
      el('div', { key: 'actions', className: 'row' }, [
        ...['pattern', 'reply', 'send', 'wait'].map((kind) =>
          el(
            'button',
            { key: kind, type: 'button', onClick: () => addNode(kind) },
            `+ ${kind}`
          )
        ),
        el(
          'button',
          { key: 'save', type: 'button', className: 'primary', onClick: save },
          t('common.save')
        ),
      ]),
      el(
        'div',
        { key: 'list', className: 'col' },
        graphs.map((graph) =>
          el(
            'button',
            {
              key: graph.id,
              type: 'button',
              onClick: () => setCurrent(graph),
            },
            graph.id
          )
        )
      ),
      el(GraphPreview, { key: 'graph', graph: selected }),
    ]);
  });
};

export const PatternsView = () => {
  const t = useT();
  const [refresh, setRefresh] = useState(0);
  const state = useAsyncValue(() => api.patterns(), [refresh], []);
  const [examples, setExamples] = useState('');
  const [mode, setMode] = useState('simple');
  const [patternId, setPatternId] = useState('');
  const [label, setLabel] = useState('');
  const [lastInfer, setLastInfer] = useState(null);
  const [output, setOutput] = useState('');
  const [preview, setPreview] = useState('');

  const exampleList = () => examples.split('\n').filter(Boolean);

  const infer = async () => {
    const list = exampleList();
    const result = await api.inferRegex(list, mode);
    setLastInfer(result);
    setOutput(result.regex);
    const matched = await api.matchPattern(
      result.regex,
      result.flags ?? 'i',
      list
    );
    setPreview(`${matched.engine} ${matched.count}/${list.length}`);
  };

  const save = async () => {
    if (!lastInfer || !patternId) {
      return;
    }
    await api.putPattern({
      id: `pattern:${patternId}`,
      tokens: ['pattern', patternId, label],
      regex: lastInfer.regex,
      flags: lastInfer.flags,
      examples: exampleList(),
    });
    setRefresh(refreshReducer);
  };

  return el(AsyncFrame, { state }, (patterns) => {
    if (!patterns || patterns.length === 0) {
      return el(ConnectionGuide, { section: 'patterns' });
    }
    return el('div', { className: 'col' }, [
      el('h2', { key: 'h' }, t('patterns.title')),
      el('table', { key: 'table' }, [
        el('thead', { key: 'head' }, [
          el('tr', {}, [
            el('th', {}, t('patterns.colId')),
            el('th', {}, t('patterns.colRegex')),
          ]),
        ]),
        el(
          'tbody',
          { key: 'body' },
          patterns.map((pattern) =>
            el('tr', { key: pattern.id }, [
              el('td', {}, pattern.id),
              el('td', {}, String(pattern.regex ?? '')),
            ])
          )
        ),
      ]),
      el('h3', { key: 'infer-h' }, t('patterns.inferTitle')),
      el('textarea', {
        key: 'examples',
        rows: 5,
        placeholder: t('patterns.examplesPlaceholder'),
        value: examples,
        onChange: (event) => setExamples(event.target.value),
      }),
      el('div', { key: 'controls', className: 'row' }, [
        el(
          'select',
          {
            key: 'mode',
            value: mode,
            onChange: (event) => setMode(event.target.value),
          },
          [
            el(
              'option',
              { key: 'simple', value: 'simple' },
              t('patterns.modeSimple')
            ),
            el('option', { key: 'lcs', value: 'lcs' }, t('patterns.modeLcs')),
          ]
        ),
        el(
          'button',
          {
            key: 'infer',
            type: 'button',
            className: 'primary',
            onClick: infer,
          },
          t('common.infer')
        ),
        el('input', {
          key: 'id',
          placeholder: t('patterns.idPlaceholder'),
          value: patternId,
          onChange: (event) => setPatternId(event.target.value),
        }),
        el('input', {
          key: 'label',
          placeholder: t('patterns.labelPlaceholder'),
          value: label,
          onChange: (event) => setLabel(event.target.value),
        }),
        el(
          'button',
          { key: 'save', type: 'button', onClick: save },
          t('common.save')
        ),
      ]),
      el('div', { key: 'preview', className: 'meta' }, preview),
      el('pre', { key: 'out' }, output),
    ]);
  });
};

export const RepliesView = () => {
  const t = useT();
  const [refresh, setRefresh] = useState(0);
  const state = useAsyncValue(() => api.replies(), [refresh], []);
  const [groupId, setGroupId] = useState('');
  const [label, setLabel] = useState('');
  const [variations, setVariations] = useState('');

  const save = async () => {
    if (!groupId) {
      return;
    }
    await api.putReply({
      id: `reply:${groupId}`,
      tokens: ['reply-group', groupId, label],
      children: [],
      variations: variations.split('\n').filter(Boolean),
    });
    setRefresh(refreshReducer);
  };

  return el(AsyncFrame, { state }, (groups) => {
    if (!groups || groups.length === 0) {
      return el(ConnectionGuide, { section: 'replies' });
    }
    return el('div', { className: 'col' }, [
      el('h2', { key: 'h' }, t('replies.title')),
      el(
        'div',
        { key: 'groups' },
        groups.map((group) =>
          el('div', { key: group.id, className: 'card' }, [
            el('div', { key: 'id', className: 'meta' }, group.id),
            ...(group.variations ?? []).map((variation) =>
              el('div', { key: variation }, variation)
            ),
          ])
        )
      ),
      el('h3', { key: 'new' }, t('replies.newTitle')),
      el('div', { key: 'row', className: 'row' }, [
        el('input', {
          key: 'id',
          placeholder: t('replies.idPlaceholder'),
          value: groupId,
          onChange: (event) => setGroupId(event.target.value),
        }),
        el('input', {
          key: 'label',
          placeholder: t('patterns.labelPlaceholder'),
          value: label,
          onChange: (event) => setLabel(event.target.value),
        }),
      ]),
      el('textarea', {
        key: 'vars',
        rows: 4,
        placeholder: t('replies.variationsPlaceholder'),
        value: variations,
        onChange: (event) => setVariations(event.target.value),
      }),
      el(
        'button',
        { key: 'save', type: 'button', className: 'primary', onClick: save },
        t('replies.saveGroup')
      ),
    ]);
  });
};

export const FactsView = () => {
  const t = useT();
  const state = useAsyncValue(() => api.facts(), [], {
    facts: [],
    byAnswerer: {},
  });
  return el(AsyncFrame, { state }, (facts) => {
    const factCount = facts?.facts?.length ?? 0;
    if (factCount === 0) {
      return el(ConnectionGuide, { section: 'facts' });
    }
    return el('div', { className: 'col' }, [
      el('h2', { key: 'h' }, t('facts.title', { count: factCount })),
      ...Object.entries(facts.byAnswerer ?? {}).map(([answerer, list]) =>
        el('section', { key: answerer }, [
          el('h3', { key: 'h' }, answerer),
          el('table', { key: 'table' }, [
            el('thead', { key: 'head' }, [
              el('tr', {}, [
                el('th', {}, t('facts.colQuestion')),
                el('th', {}, t('facts.colAnswer')),
                el('th', {}, t('facts.colPattern')),
              ]),
            ]),
            el(
              'tbody',
              { key: 'body' },
              list.map((item, index) =>
                el('tr', { key: `${item.patternId}-${index}` }, [
                  el('td', {}, item.question),
                  el('td', {}, item.answer),
                  el('td', {}, item.patternId),
                ])
              )
            ),
          ]),
        ])
      ),
    ]);
  });
};

export const AudienceView = () => {
  const t = useT();
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState(null);
  const known = useAsyncValue(() => api.contacts(), [], []);
  const evaluate = async () => setContacts(await api.audience(query));
  if (!known.loading && (known.value ?? []).length === 0 && !contacts) {
    return el(ConnectionGuide, { section: 'audience' });
  }
  return el('div', { className: 'col' }, [
    el('h2', { key: 'h' }, t('audience.title')),
    el('div', { key: 'meta', className: 'meta' }, t('audience.hint')),
    el('div', { key: 'row', className: 'row' }, [
      el('input', {
        key: 'q',
        placeholder: t('audience.queryPlaceholder'),
        style: { minWidth: '32rem' },
        value: query,
        onChange: (event) => setQuery(event.target.value),
      }),
      el(
        'button',
        {
          key: 'eval',
          type: 'button',
          className: 'primary',
          onClick: evaluate,
        },
        t('common.evaluate')
      ),
    ]),
    contacts
      ? el('div', { key: 'out' }, [
          el(
            'div',
            { key: 'count', className: 'meta' },
            t('audience.contactsCount', { count: contacts.length })
          ),
          ...contacts.map((contact) =>
            el(
              'div',
              { key: contact.id },
              `${contact.id} (${(contact.networks ?? []).join(', ')})`
            )
          ),
        ])
      : el('div', { key: 'empty' }),
  ]);
};

const SourceChecks = ({ sources, selected, setSelected }) =>
  el(
    'div',
    { className: 'row' },
    sources.map((source) =>
      el('label', { key: source, className: 'row' }, [
        el('input', {
          key: 'input',
          type: 'checkbox',
          value: source,
          checked: selected.includes(source),
          onChange: (event) => {
            setSelected((current) =>
              event.target.checked
                ? [...new Set([...current, source])]
                : current.filter((item) => item !== source)
            );
          },
        }),
        el('span', { key: 'label' }, source),
      ])
    )
  );

const useSources = () => {
  const state = useAsyncValue(() => api.sources(), [], []);
  const [selected, setSelected] = useState([]);
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!initialized && state.value.length > 0) {
      setSelected(state.value);
      setInitialized(true);
    }
  }, [initialized, state.value]);
  return { state, selected, setSelected };
};

export const BroadcastView = () => {
  const t = useT();
  const { state, selected, setSelected } = useSources();
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const send = async () => {
    const result = await api.broadcast(message, selected);
    setStatus(
      `queued ${result.id} to ${(result.networks ?? []).length} networks`
    );
  };
  return el(AsyncFrame, { state }, (sources) => {
    if (!sources || sources.length === 0) {
      return el(ConnectionGuide, { section: 'broadcast' });
    }
    return el('div', { className: 'col' }, [
      el('h2', { key: 'h' }, t('broadcast.title')),
      el('textarea', {
        key: 'msg',
        rows: 4,
        value: message,
        onChange: (event) => setMessage(event.target.value),
      }),
      el(SourceChecks, {
        key: 'targets',
        sources,
        selected,
        setSelected,
      }),
      el(
        'button',
        { key: 'send', type: 'button', className: 'primary', onClick: send },
        t('common.send')
      ),
      el('div', { key: 'status' }, status),
    ]);
  });
};

export const OutreachView = () => {
  const t = useT();
  const { state, selected, setSelected } = useSources();
  const [query, setQuery] = useState('');
  const [text, setText] = useState('');
  const [output, setOutput] = useState('');
  const run = async (mode) => {
    const result = await api.outreach({
      query,
      text,
      networks: selected,
      mode,
    });
    setOutput(JSON.stringify(result, null, 2));
  };
  return el(AsyncFrame, { state }, (sources) => {
    if (!sources || sources.length === 0) {
      return el(ConnectionGuide, { section: 'outreach' });
    }
    return el('div', { className: 'col' }, [
      el('h2', { key: 'h' }, t('outreach.title')),
      el('div', { key: 'meta', className: 'meta' }, t('outreach.hint')),
      el('input', {
        key: 'q',
        placeholder: t('outreach.queryPlaceholder'),
        style: { minWidth: '32rem' },
        value: query,
        onChange: (event) => setQuery(event.target.value),
      }),
      el('textarea', {
        key: 'text',
        rows: 4,
        placeholder: t('outreach.bodyPlaceholder'),
        value: text,
        onChange: (event) => setText(event.target.value),
      }),
      el(SourceChecks, {
        key: 'targets',
        sources,
        selected,
        setSelected,
      }),
      el('div', { key: 'actions', className: 'row' }, [
        el(
          'button',
          {
            key: 'preview',
            type: 'button',
            className: 'primary',
            onClick: () => run('preview'),
          },
          t('common.preview')
        ),
        el(
          'button',
          { key: 'queue', type: 'button', onClick: () => run('queue') },
          t('common.queue')
        ),
      ]),
      el('pre', { key: 'out' }, output),
    ]);
  });
};

export const BackupView = () => {
  const t = useT();
  const [refresh, setRefresh] = useState(0);
  const state = useAsyncValue(() => api.listBackups(), [refresh], []);
  const [passphrase, setPassphrase] = useState('');
  const [keep, setKeep] = useState('');
  const [status, setStatus] = useState('');

  const create = async () => {
    const opts = { passphrase: passphrase || null };
    const keepCount = parseInt(keep, 10);
    if (Number.isFinite(keepCount) && keepCount > 0) {
      opts.keep = keepCount;
    }
    const result = await api.createBackup(opts);
    setStatus(JSON.stringify(result, null, 2));
    setRefresh(refreshReducer);
  };

  const restore = async (file) => {
    const result = await api.restoreBackup(file, passphrase || null);
    setStatus(JSON.stringify(result, null, 2));
    setRefresh(refreshReducer);
  };

  return el(AsyncFrame, { state }, (backups) =>
    el('div', { className: 'col' }, [
      el('h2', { key: 'h' }, t('backup.title')),
      el('div', { key: 'meta', className: 'meta' }, t('backup.hint')),
      el('div', { key: 'row', className: 'row' }, [
        el('input', {
          key: 'pass',
          type: 'password',
          placeholder: t('backup.passphrasePlaceholder'),
          value: passphrase,
          onChange: (event) => setPassphrase(event.target.value),
        }),
        el('input', {
          key: 'keep',
          type: 'number',
          min: '0',
          placeholder: t('backup.keepPlaceholder'),
          style: { maxWidth: '10rem' },
          value: keep,
          onChange: (event) => setKeep(event.target.value),
        }),
        el(
          'button',
          {
            key: 'create',
            type: 'button',
            className: 'primary',
            onClick: create,
          },
          t('backup.create')
        ),
        el(
          'button',
          {
            key: 'refresh',
            type: 'button',
            onClick: () => setRefresh(refreshReducer),
          },
          t('common.refresh')
        ),
      ]),
      el(
        'div',
        { key: 'list' },
        backups.length === 0
          ? el(ConnectionGuide, { section: 'backup' })
          : backups.map((backup) =>
              el('div', { key: backup.file, className: 'card row' }, [
                el('div', { key: 'info', className: 'col' }, [
                  el('strong', { key: 'file' }, backup.file),
                  el(
                    'div',
                    { key: 'meta', className: 'meta' },
                    t('backup.itemMeta', {
                      size: backup.size,
                      timestamp: fmtTs(backup.mtime),
                      state: backup.encrypted
                        ? t('backup.encrypted')
                        : t('backup.plain'),
                    })
                  ),
                ]),
                el(
                  'button',
                  {
                    key: 'restore',
                    type: 'button',
                    onClick: () => restore(backup.file),
                  },
                  t('backup.restore')
                ),
              ])
            )
      ),
      el('pre', { key: 'status' }, status),
    ])
  );
};

export const ProfileView = () => {
  const t = useT();
  const state = useAsyncValue(
    async () => ({
      profile: (await api.profile()) ?? {},
      resume: (await api.resume()) ?? {},
    }),
    [],
    { profile: {}, resume: {} }
  );
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    const { profile, resume } = state.value;
    setName(profile.name ?? '');
    setBio(profile.bio ?? '');
    setTitle(resume.title ?? '');
    setBody(resume.body ?? '');
  }, [state.value]);

  const saveProfile = async () => {
    const result = await api.putProfile({
      ...state.value.profile,
      name,
      bio,
    });
    setStatus(JSON.stringify(result.plannedSyncs, null, 2));
  };

  const saveResume = async () => {
    const result = await api.putResume({
      ...state.value.resume,
      title,
      body,
    });
    setStatus(JSON.stringify(result.plannedSyncs, null, 2));
  };

  return el(AsyncFrame, { state }, () => {
    const { profile, resume } = state.value;
    const profileEmpty =
      !(profile?.name || profile?.bio) && !(resume?.title || resume?.body);
    if (profileEmpty && !name && !bio && !title && !body) {
      return el(ConnectionGuide, { section: 'profile' });
    }
    return el('div', { className: 'col' }, [
      el('h2', { key: 'profile-h' }, t('profile.title')),
      el('div', { key: 'profile', className: 'col' }, [
        el('input', {
          key: 'name',
          value: name,
          placeholder: t('profile.namePlaceholder'),
          onChange: (event) => setName(event.target.value),
        }),
        el('textarea', {
          key: 'bio',
          rows: 3,
          placeholder: t('profile.bioPlaceholder'),
          value: bio,
          onChange: (event) => setBio(event.target.value),
        }),
        el(
          'button',
          {
            key: 'save',
            type: 'button',
            className: 'primary',
            onClick: saveProfile,
          },
          t('profile.saveProfile')
        ),
      ]),
      el('h2', { key: 'resume-h' }, t('profile.resumeTitle')),
      el('div', { key: 'resume', className: 'col' }, [
        el('input', {
          key: 'title',
          value: title,
          placeholder: t('profile.titlePlaceholder'),
          onChange: (event) => setTitle(event.target.value),
        }),
        el('textarea', {
          key: 'body',
          rows: 5,
          placeholder: t('profile.bodyPlaceholder'),
          value: body,
          onChange: (event) => setBody(event.target.value),
        }),
        el(
          'button',
          {
            key: 'save',
            type: 'button',
            className: 'primary',
            onClick: saveResume,
          },
          t('profile.saveResume')
        ),
      ]),
      el('pre', { key: 'status' }, status),
    ]);
  });
};

export const StatusView = () => {
  const t = useT();
  const state = useAsyncValue(() => api.status(), [], {});
  return el(AsyncFrame, { state }, (status) => {
    if (!status || Object.keys(status).length === 0) {
      return el(ConnectionGuide, { section: 'status' });
    }
    return el('div', {}, [
      el('h2', { key: 'h' }, t('status.title')),
      el('table', { key: 'table' }, [
        el(
          'tbody',
          {},
          Object.entries(status).map(([key, value]) =>
            el('tr', { key }, [el('th', {}, key), el('td', {}, String(value))])
          )
        ),
      ]),
    ]);
  });
};

const connectionProviderFromHash = () => {
  const hash = globalThis.location?.hash ?? '';
  return hash.startsWith('#conn-') ? hash.slice('#conn-'.length) : null;
};

const clearConnectionHash = () => {
  const location = globalThis.location;
  if (!location?.hash?.startsWith('#conn-')) {
    return;
  }
  const next = `${location.pathname}${location.search}`;
  globalThis.history?.replaceState?.(null, '', next);
};

// Connections nav surface (R-N5..R-N8, issue #27). The full per-provider
// grid + detail screen is shipped from `./connections/`; this view threads
// the saved `secret:*` links in so each provider card can classify itself
// and each detail page can render credentials/import/probe controls.
const ConnectionsView = () => {
  const [refresh, setRefresh] = useState(0);
  const [activeProviderId, setActiveProviderId] = useState(
    connectionProviderFromHash
  );
  const linksState = useAsyncValue(() => api.links(), [refresh], []);

  useEffect(() => {
    const onHash = () => setActiveProviderId(connectionProviderFromHash());
    globalThis.addEventListener?.('hashchange', onHash);
    return () => globalThis.removeEventListener?.('hashchange', onHash);
  }, []);

  const status = useMemo(() => {
    const all = linksState.value ?? [];
    const savedSecretIds = all
      .map((link) => link.id)
      .filter((id) => typeof id === 'string' && id.startsWith('secret:'));
    return { savedSecretIds };
  }, [linksState.value]);
  if (activeProviderId) {
    return el(ConnectionDetail, {
      providerId: activeProviderId,
      status,
      links: linksState.value ?? [],
      refresh: async () => setRefresh((value) => value + 1),
      onBack: () => {
        setActiveProviderId(null);
        clearConnectionHash();
        setRefresh((value) => value + 1);
      },
    });
  }
  return el(ConnectionsList, {
    status,
    onOpen: (providerId) => {
      setActiveProviderId(providerId);
      if (globalThis.location) {
        globalThis.location.hash = `#conn-${providerId}`;
      }
    },
  });
};

export const views = {
  chat: ChatView,
  operator: OperatorView,
  contacts: ContactsView,
  automation: AutomationView,
  patterns: PatternsView,
  replies: RepliesView,
  facts: FactsView,
  audience: AudienceView,
  broadcast: BroadcastView,
  outreach: OutreachView,
  profile: ProfileView,
  backup: BackupView,
  status: StatusView,
  connections: ConnectionsView,
  settings: SettingsView,
};
