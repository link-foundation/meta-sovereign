const message = (
  id,
  text,
  outgoing,
  role = outgoing ? 'APPLICANT' : 'EMPLOYER'
) => ({
  id,
  type: 'SIMPLE',
  creation_time: `2026-11-10T10:00:0${id}+0000`,
  last_change_time: null,
  sender_participant_id: outgoing ? 'applicant-56' : 'employer-56',
  sender_display_info: {
    name: outgoing ? 'Applicant' : 'Employer',
    icon: null,
    role,
    is_current_participant: outgoing,
  },
  payload: { text },
  can_edit: outgoing,
  viewed_by_opponent: !outgoing,
});

// Finite, credential-free HH API fixture, following the public OpenAPI schema.
export const hhCommonFixture = () => {
  const chats = new Map([
    [
      '41',
      [
        message('1', 'Where do you live?', false),
        message('2', 'Vietnam.', true),
        {
          ...message('3', null, false),
          type: 'PARTICIPANT_LEFT',
          payload: { moved_participant: { name: 'Employer' } },
        },
      ],
    ],
    [
      '42',
      [
        {
          ...message('1', null, false),
          payload: {
            attachments: [
              {
                content_type: 'application/pdf',
                title: 'Brief.pdf',
                url: 'https://hh.invalid/brief.pdf',
                preview: null,
              },
            ],
          },
        },
        message('2', 'Thanks.', true),
      ],
    ],
  ]);
  const calls = [];
  const state = {
    accountId: 'account-56',
    writeAllowed: true,
    receipt: { id: 'sent-56' },
    unread: new Map(),
    transform: (value) => value,
  };
  const markReadResponse = (path) => {
    const target = /^\/common\/chats\/([^/]+)\/message\/([^/]+)\/read$/u.exec(
      path
    );
    if (!target || chats.get(target[1])?.at(-1)?.id !== target[2]) {
      throw new Error(`Unexpected HH fixture read: ${path}`);
    }
    state.unread.set(target[1], 0);
    return new globalThis.Response(null, { status: 204 });
  };
  const listPage = (request) => {
    const page = Number(request.searchParams.get('page') ?? 0);
    const id = [...chats.keys()][page];
    return {
      items: id
        ? [
            {
              id,
              display: { title: `Vacancy ${id}` },
              unread_message_count: state.unread.get(id) ?? 1,
              last_message: chats.get(id).at(-1),
            },
          ]
        : [],
      page,
      pages: chats.size,
      found: chats.size,
      per_page: 20,
    };
  };
  const messagePage = (request, id) => {
    const all = chats.get(id);
    const start = request.searchParams.get('start_message_id');
    const index = start ? all.findIndex((item) => item.id === start) : 0;
    const limit = Number(request.searchParams.get('limit') ?? 10);
    const messages =
      request.searchParams.get('order') === 'prev'
        ? all.slice(-limit)
        : all.slice(index, index + limit);
    return {
      id,
      type: 'NEGOTIATION',
      display: { title: `Vacancy ${id}` },
      vacancy_id: `vacancy-${id}`,
      unread_message_count: state.unread.get(id) ?? 1,
      block_reason: null,
      chat_states: {
        write_message_state: {
          allowed: state.writeAllowed,
          reason: state.writeAllowed ? null : 'ARCHIVED_BY_EMPLOYER',
        },
      },
      messages,
      has_more: index + limit < all.length,
    };
  };
  const fetchImpl = async (url, init = {}) => {
    const request = new URL(url);
    const path = request.pathname;
    const method = init.method ?? 'GET';
    calls.push({
      path,
      method,
      query: Object.fromEntries(request.searchParams),
      body: init.body ? JSON.parse(init.body) : null,
    });
    if (method === 'PUT') {
      return markReadResponse(path);
    }
    let value;
    if (path === '/me') {
      value = { id: state.accountId, is_applicant: true };
    } else if (path === '/common/chats') {
      value = listPage(request);
    } else {
      const match = /^\/common\/chats\/([^/]+)\/messages$/u.exec(path);
      if (!match || !chats.has(match[1])) {
        throw new Error(`Unexpected HH fixture request: ${method} ${path}`);
      }
      if (method === 'POST') {
        return new globalThis.Response(JSON.stringify(state.receipt), {
          status: 201,
        });
      }
      value = messagePage(request, match[1]);
    }
    return new globalThis.Response(
      JSON.stringify(state.transform(value, calls.at(-1)))
    );
  };
  return { chats, calls, state, fetchImpl, baseUrl: 'https://hh.invalid' };
};
