// View renderers for the SPA. Each view is async and returns a DOM
// element ready to mount under <main id="root">. Views talk to the
// server via the `api` object; nothing is held in client-side state
// except transient UI scratch.

import { h, api } from './dom.js';

const fmtTs = (ts) => (ts ? new Date(ts).toLocaleString() : '');

export const chatView = async () => {
  const links = await api.links();
  const messages = links
    .filter((l) => l.id?.startsWith('msg:'))
    .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  const chats = [...new Set(messages.map((m) => `${m.source}:${m.chat}`))];
  let active = chats[0];
  const wrap = h('div', { class: 'chat' });
  const aside = h('aside', {});
  const stream = h('div', { class: 'stream' });
  const composer = h('div', { class: 'composer' });
  const ta = h('textarea', { rows: 2, placeholder: 'Type a message…' });
  const completions = h('div', { class: 'completions' });
  composer.append(
    completions,
    ta,
    h(
      'button',
      {
        class: 'primary',
        on: {
          click: async () => {
            if (!ta.value.trim() || !active) {
              return;
            }
            const [source, chat] = active.split(':');
            const id = `msg:${source}:${Date.now()}`;
            await api.put({
              id,
              tokens: ['message', source, String(Date.now())],
              sender: 'me',
              chat,
              source,
              body: ta.value,
              timestamp: new Date().toISOString(),
            });
            ta.value = '';
            completions.innerHTML = '';
            renderActive();
          },
        },
      },
      'send'
    )
  );
  ta.addEventListener('input', async () => {
    if (!ta.value) {
      completions.innerHTML = '';
      return;
    }
    const items = await api.autocomplete(ta.value);
    completions.innerHTML = '';
    for (const item of items) {
      completions.append(
        h(
          'button',
          {
            on: {
              click: () => {
                ta.value = item;
                completions.innerHTML = '';
              },
            },
          },
          item
        )
      );
    }
  });
  const renderAside = () => {
    aside.innerHTML = '';
    aside.append(h('div', { class: 'aside-h' }, 'Chats'));
    for (const c of chats) {
      aside.append(
        h(
          'button',
          {
            class: c === active ? 'active' : '',
            on: {
              click: () => {
                active = c;
                renderActive();
              },
            },
          },
          c
        )
      );
    }
  };
  const renderActive = async () => {
    renderAside();
    stream.innerHTML = '';
    const refreshed = (await api.links())
      .filter(
        (l) => l.id?.startsWith('msg:') && `${l.source}:${l.chat}` === active
      )
      .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    for (const m of refreshed) {
      stream.append(
        h('div', { class: m.sender === 'me' ? 'msg me' : 'msg' }, [
          h('div', { class: 'meta' }, `${m.sender} • ${fmtTs(m.timestamp)}`),
          h('div', {}, m.body ?? ''),
        ])
      );
    }
  };
  await renderActive();
  wrap.append(aside, h('div', { class: 'col' }, [stream, composer]));
  return wrap;
};

export const operatorView = async () => {
  const links = await api.links();
  const queue = links
    .filter((l) => l.id?.startsWith('msg:') && l.sender !== 'me')
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  let i = 0;
  const wrap = h('div', { class: 'col operator' });
  const card = h('div', { class: 'card' });
  const status = h('div', { class: 'meta' });
  const draw = () => {
    card.innerHTML = '';
    const m = queue[i];
    if (!m) {
      card.append(h('div', {}, 'Inbox empty.'));
      status.textContent = '';
      return;
    }
    status.textContent = `${i + 1} / ${queue.length}`;
    card.append(
      h(
        'div',
        { class: 'meta' },
        `${m.source} · ${m.chat} · ${m.sender} · ${fmtTs(m.timestamp)}`
      ),
      h('div', { class: 'big' }, m.body ?? ''),
      h('div', { class: 'row' }, [
        h(
          'button',
          {
            on: {
              click: () => {
                i = Math.min(i + 1, queue.length);
                draw();
              },
            },
          },
          'NEXT (N)'
        ),
        h(
          'button',
          {
            class: 'primary',
            on: {
              click: () => {
                i = Math.min(i + 1, queue.length);
                draw();
              },
            },
          },
          'DONE (D)'
        ),
      ])
    );
  };
  document.addEventListener('keydown', (e) => {
    if (!wrap.isConnected) {
      return;
    }
    if (e.key === 'd' || e.key === 'D' || e.key === 'n' || e.key === 'N') {
      i = Math.min(i + 1, queue.length);
      draw();
    }
  });
  draw();
  wrap.append(h('h2', {}, 'Operator'), status, card);
  return wrap;
};

export const contactsView = async () => {
  const contacts = await api.contacts();
  return h('div', {}, [
    h('h2', {}, `Contacts (${contacts.length})`),
    h('table', {}, [
      h('thead', {}, [
        h('tr', {}, [
          h('th', {}, 'Identity'),
          h('th', {}, 'Networks'),
          h('th', {}, 'Chats'),
          h('th', {}, 'Messages'),
          h('th', {}, 'Last seen'),
        ]),
      ]),
      h(
        'tbody',
        {},
        contacts.map((c) =>
          h('tr', {}, [
            h('td', {}, c.id),
            h('td', {}, (c.networks ?? []).join(', ')),
            h('td', {}, String((c.chats ?? []).length)),
            h('td', {}, String(c.messageCount ?? 0)),
            h('td', {}, fmtTs(c.lastSeen)),
          ])
        )
      ),
    ]),
  ]);
};

const drawNodes = (editor, current) => {
  editor.innerHTML = '';
  for (const n of current.nodes ?? []) {
    editor.append(
      h('span', { class: 'node' }, `${n.kind}: ${n.label ?? n.id}`)
    );
  }
  editor.append(
    h(
      'div',
      { class: 'meta', style: 'margin-top:0.5rem' },
      `${(current.edges ?? []).length} edges`
    )
  );
};

export const automationView = async () => {
  const graphs = await api.graphs();
  const wrap = h('div', { class: 'col' });
  const list = h('div', { class: 'col' });
  const editor = h('div', { class: 'graph' });
  let current = graphs[0] ?? {
    id: 'graph:default',
    tokens: ['graph'],
    nodes: [],
    edges: [],
  };
  const drawList = () => {
    list.innerHTML = '';
    for (const g of graphs) {
      list.append(
        h(
          'button',
          {
            on: {
              click: () => {
                current = g;
                drawNodes(editor, current);
              },
            },
          },
          g.id
        )
      );
    }
  };
  const addNode = (kind) => {
    current.nodes = current.nodes ?? [];
    const id = `${kind}-${current.nodes.length + 1}`;
    current.nodes.push({ id, kind, label: id });
    drawNodes(editor, current);
  };
  drawList();
  drawNodes(editor, current);
  wrap.append(
    h('h2', {}, 'Automation graphs'),
    h('div', { class: 'row' }, [
      h('button', { on: { click: () => addNode('pattern') } }, '+ pattern'),
      h('button', { on: { click: () => addNode('reply') } }, '+ reply'),
      h('button', { on: { click: () => addNode('send') } }, '+ send'),
      h('button', { on: { click: () => addNode('wait') } }, '+ wait'),
      h(
        'button',
        {
          class: 'primary',
          on: {
            click: async () => {
              await api.saveGraph(current);
            },
          },
        },
        'save'
      ),
    ]),
    list,
    editor
  );
  return wrap;
};

const drawPatternRow = (p) =>
  h('tr', {}, [h('td', {}, p.id), h('td', {}, String(p.regex ?? ''))]);

export const patternsView = async () => {
  const patterns = await api.patterns();
  const wrap = h('div', { class: 'col' });
  const ta = h('textarea', { rows: 5, placeholder: 'one example per line' });
  const idIn = h('input', { placeholder: 'pattern id (e.g. greet)' });
  const labelIn = h('input', { placeholder: 'label' });
  const out = h('pre');
  const mode = h('select', {}, [
    h('option', { value: 'simple' }, 'simple'),
    h('option', { value: 'lcs' }, 'lcs (variable gaps)'),
  ]);
  let lastInfer = null;
  wrap.append(
    h('h2', {}, 'Patterns'),
    h('table', {}, [
      h('thead', {}, [h('tr', {}, [h('th', {}, 'id'), h('th', {}, 'regex')])]),
      h('tbody', {}, patterns.map(drawPatternRow)),
    ]),
    h('h3', {}, 'Infer regex from examples'),
    ta,
    h('div', { class: 'row' }, [
      mode,
      h(
        'button',
        {
          class: 'primary',
          on: {
            click: async () => {
              const examples = ta.value.split('\n').filter(Boolean);
              const r = await api.inferRegex(examples, mode.value);
              lastInfer = r;
              out.textContent = r.regex;
            },
          },
        },
        'infer'
      ),
      idIn,
      labelIn,
      h(
        'button',
        {
          on: {
            click: async () => {
              if (!lastInfer || !idIn.value) {
                return;
              }
              await api.putPattern({
                id: `pattern:${idIn.value}`,
                tokens: ['pattern', idIn.value, labelIn.value],
                regex: lastInfer.regex,
                flags: lastInfer.flags,
                examples: ta.value.split('\n').filter(Boolean),
              });
              location.reload();
            },
          },
        },
        'save'
      ),
    ]),
    out
  );
  return wrap;
};

export const repliesView = async () => {
  const groups = await api.replies();
  const wrap = h('div', { class: 'col' });
  const idIn = h('input', { placeholder: 'group id (e.g. thanks)' });
  const labelIn = h('input', { placeholder: 'label' });
  const variations = h('textarea', {
    rows: 4,
    placeholder: 'one variation per line',
  });
  wrap.append(
    h('h2', {}, 'Reply variation groups'),
    h(
      'div',
      {},
      groups.length === 0
        ? [h('div', { class: 'meta' }, 'No reply groups yet.')]
        : groups.map((g) =>
            h('div', { class: 'card' }, [
              h('div', { class: 'meta' }, g.id),
              ...(g.variations ?? []).map((v) => h('div', {}, v)),
            ])
          )
    ),
    h('h3', {}, 'New / update group'),
    h('div', { class: 'row' }, [idIn, labelIn]),
    variations,
    h(
      'button',
      {
        class: 'primary',
        on: {
          click: async () => {
            if (!idIn.value) {
              return;
            }
            await api.putReply({
              id: `reply:${idIn.value}`,
              tokens: ['reply-group', idIn.value, labelIn.value],
              children: [],
              variations: variations.value.split('\n').filter(Boolean),
            });
            location.reload();
          },
        },
      },
      'save group'
    )
  );
  return wrap;
};

export const factsView = async () => {
  const f = await api.facts();
  const wrap = h('div', { class: 'col' });
  wrap.append(h('h2', {}, `Facts (${f.facts?.length ?? 0})`));
  for (const [answerer, list] of Object.entries(f.byAnswerer ?? {})) {
    wrap.append(
      h('h3', {}, answerer),
      h('table', {}, [
        h('thead', {}, [
          h('tr', {}, [
            h('th', {}, 'Question'),
            h('th', {}, 'Answer'),
            h('th', {}, 'Pattern'),
          ]),
        ]),
        h(
          'tbody',
          {},
          list.map((x) =>
            h('tr', {}, [
              h('td', {}, x.question),
              h('td', {}, x.answer),
              h('td', {}, x.patternId),
            ])
          )
        ),
      ])
    );
  }
  return wrap;
};

export const audienceView = async () => {
  const wrap = h('div', { class: 'col' });
  const q = h('input', {
    placeholder: 'e.g. network:telegram AND chat:general',
    style: 'min-width:32rem',
  });
  const out = h('div');
  wrap.append(
    h('h2', {}, 'Audience builder'),
    h(
      'div',
      { class: 'meta' },
      'Operators: AND, OR, NOT, parens. Dimensions: network:, chat:, sender:, kind:, fact:'
    ),
    h('div', { class: 'row' }, [
      q,
      h(
        'button',
        {
          class: 'primary',
          on: {
            click: async () => {
              const r = await api.audience(q.value);
              out.innerHTML = '';
              out.append(h('div', { class: 'meta' }, `${r.length} contacts`));
              for (const c of r) {
                out.append(
                  h('div', {}, `${c.id} (${(c.networks ?? []).join(', ')})`)
                );
              }
            },
          },
        },
        'evaluate'
      ),
    ]),
    out
  );
  return wrap;
};

export const broadcastView = async () => {
  const sources = await api.sources();
  const wrap = h('div', { class: 'col' });
  const msg = h('textarea', { rows: 4 });
  const targets = h(
    'div',
    { class: 'row' },
    sources.map((s) =>
      h('label', { class: 'row' }, [
        h('input', { type: 'checkbox', value: s, checked: true }),
        h('span', {}, s),
      ])
    )
  );
  const status = h('div');
  wrap.append(
    h('h2', {}, 'Broadcast'),
    msg,
    targets,
    h(
      'button',
      {
        class: 'primary',
        on: {
          click: async () => {
            const networks = [...targets.querySelectorAll('input:checked')].map(
              (i) => i.value
            );
            const r = await api.broadcast(msg.value, networks);
            status.textContent = `queued ${r.id} to ${(r.networks ?? []).length} networks`;
          },
        },
      },
      'send'
    ),
    status
  );
  return wrap;
};

export const outreachView = async () => {
  const sources = await api.sources();
  const wrap = h('div', { class: 'col' });
  const q = h('input', {
    placeholder: 'audience query, e.g. network:telegram AND chat:vip',
    style: 'min-width:32rem',
  });
  const txt = h('textarea', {
    rows: 4,
    placeholder:
      'Body. Use {name}, {networks}, {chats} to personalise per recipient.',
  });
  const targets = h(
    'div',
    { class: 'row' },
    sources.map((s) =>
      h('label', { class: 'row' }, [
        h('input', { type: 'checkbox', value: s, checked: true }),
        h('span', {}, s),
      ])
    )
  );
  const out = h('pre');
  const eval_ = async (mode) => {
    const networks = [...targets.querySelectorAll('input:checked')].map(
      (i) => i.value
    );
    const r = await api.outreach({
      query: q.value,
      text: txt.value,
      networks,
      mode,
    });
    out.textContent = JSON.stringify(r, null, 2);
  };
  wrap.append(
    h('h2', {}, 'Outreach'),
    h(
      'div',
      { class: 'meta' },
      'Mass-personal outreach. Preview always; queue actually dispatches.'
    ),
    q,
    txt,
    targets,
    h('div', { class: 'row' }, [
      h(
        'button',
        { class: 'primary', on: { click: () => eval_('preview') } },
        'preview'
      ),
      h('button', { on: { click: () => eval_('queue') } }, 'queue'),
    ]),
    out
  );
  return wrap;
};

export const backupView = async () => {
  const wrap = h('div', { class: 'col' });
  const list = h('div');
  const status = h('pre');
  const passphrase = h('input', {
    type: 'password',
    placeholder: 'optional passphrase',
  });
  const keep = h('input', {
    type: 'number',
    min: '0',
    placeholder: 'keep N (optional)',
    style: 'max-width:10rem',
  });
  const refresh = async () => {
    const all = await api.listBackups();
    list.innerHTML = '';
    if (!Array.isArray(all) || all.length === 0) {
      list.append(
        h(
          'div',
          { class: 'meta' },
          'No archives yet. Click "create backup" to make one.'
        )
      );
      return;
    }
    for (const b of all) {
      list.append(
        h('div', { class: 'card row' }, [
          h(
            'div',
            { class: 'col' },
            [
              h('strong', {}, b.file),
              h(
                'div',
                { class: 'meta' },
                `${b.size} bytes · ${fmtTs(b.mtime)} · ${b.encrypted ? 'encrypted' : 'plain'}`
              ),
            ].filter(Boolean)
          ),
          h(
            'button',
            {
              on: {
                click: async () => {
                  const r = await api.restoreBackup(b.file, passphrase.value);
                  status.textContent = JSON.stringify(r, null, 2);
                },
              },
            },
            'restore'
          ),
        ])
      );
    }
  };
  wrap.append(
    h('h2', {}, 'Backup'),
    h(
      'div',
      { class: 'meta' },
      'Encrypted archives live under the server store directory.'
    ),
    h('div', { class: 'row' }, [
      passphrase,
      keep,
      h(
        'button',
        {
          class: 'primary',
          on: {
            click: async () => {
              const opts = { passphrase: passphrase.value || null };
              const k = parseInt(keep.value, 10);
              if (Number.isFinite(k) && k > 0) {
                opts.keep = k;
              }
              const r = await api.createBackup(opts);
              status.textContent = JSON.stringify(r, null, 2);
              await refresh();
            },
          },
        },
        'create backup'
      ),
      h('button', { on: { click: () => refresh() } }, 'refresh'),
    ]),
    list,
    status
  );
  await refresh();
  return wrap;
};

export const profileView = async () => {
  const profile = await api.profile();
  const resume = await api.resume();
  const wrap = h('div', { class: 'col' });
  const pn = h('input', { value: profile.name ?? '', placeholder: 'name' });
  const pb = h('textarea', { rows: 3, placeholder: 'bio' });
  pb.value = profile.bio ?? '';
  const rt = h('input', {
    value: resume.title ?? '',
    placeholder: 'job title',
  });
  const rb = h('textarea', { rows: 5, placeholder: 'experience' });
  rb.value = resume.body ?? '';
  const status = h('pre');
  wrap.append(
    h('h2', {}, 'Profile'),
    h('div', { class: 'col' }, [
      pn,
      pb,
      h(
        'button',
        {
          class: 'primary',
          on: {
            click: async () => {
              const r = await api.putProfile({
                ...profile,
                name: pn.value,
                bio: pb.value,
              });
              status.textContent = JSON.stringify(r.plannedSyncs, null, 2);
            },
          },
        },
        'save profile'
      ),
    ]),
    h('h2', {}, 'Resume'),
    h('div', { class: 'col' }, [
      rt,
      rb,
      h(
        'button',
        {
          class: 'primary',
          on: {
            click: async () => {
              const r = await api.putResume({
                ...resume,
                title: rt.value,
                body: rb.value,
              });
              status.textContent = JSON.stringify(r.plannedSyncs, null, 2);
            },
          },
        },
        'save resume'
      ),
    ]),
    status
  );
  return wrap;
};

export const statusView = async () => {
  const s = await api.status();
  return h('div', {}, [
    h('h2', {}, 'Status'),
    h('table', {}, [
      h(
        'tbody',
        {},
        Object.entries(s).map(([k, v]) =>
          h('tr', {}, [h('th', {}, k), h('td', {}, String(v))])
        )
      ),
    ]),
  ]);
};
