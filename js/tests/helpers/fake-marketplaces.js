// Fake Upwork and PeoplePerHour servers for tests (R-Z8): a `fetchImpl` for
// each, answering the calls a pull makes. No network.

const reply = (body, status = 200) => ({
  ok: status < 400,
  status,
  statusText: status < 400 ? 'OK' : 'Unauthorized',
  headers: new Map([['Content-Type', 'application/json']]),
  async text() {
    return JSON.stringify(body);
  },
});

// Upwork's GraphQL: contracts, then the room's messages.
export const fakeUpwork = (status = 200) => ({
  fetchImpl: async (url, init) => {
    if (status !== 200) {
      return reply({ error: 'bad token' }, status);
    }
    const { query } = JSON.parse(init.body);
    if (query.includes('roomsRoomMessages')) {
      return reply({
        data: {
          roomsRoomMessages: {
            edges: [
              {
                node: {
                  id: 'mA',
                  text: 'hello from upwork',
                  createdAt: '2026-04-15T05:00:00Z',
                  author: { id: 'f1' },
                },
              },
            ],
            pageInfo: { endCursor: null, hasNextPage: false },
          },
        },
      });
    }
    return reply({
      data: {
        contracts: {
          edges: [
            {
              node: {
                id: 'k1',
                jobId: 'j1',
                status: 'active',
                client: { id: 'c1' },
                freelancer: { id: 'f1' },
                roomId: 'r1',
              },
            },
          ],
          pageInfo: { endCursor: null, hasNextPage: false },
        },
      },
    });
  },
});

export const fakePph = () => ({
  fetchImpl: async (url) => {
    const { pathname } = new URL(String(url));
    if (pathname === '/api/v1/workstreams') {
      return reply({
        items: [
          {
            id: 'w1',
            projectId: 'p1',
            status: 'active',
            buyer: { id: 'b1' },
            freelancer: { id: 'f1' },
          },
        ],
        nextCursor: null,
      });
    }
    if (pathname.endsWith('/messages')) {
      return reply({
        items: [
          {
            id: 'mP',
            text: 'hello from pph',
            createdAt: '2026-04-15T05:00:00Z',
            author: { id: 'b1' },
          },
        ],
        nextCursor: null,
      });
    }
    return reply({ items: [], nextCursor: null });
  },
});
