import http from 'node:http';
import { createMemoryStore } from '../../src/storage/universal.js';
import { handleVacancyRoutes } from '../../src/server/routes-vacancies.js';
import { bindWire } from '../../src/server/wire.js';
import { encodeWire, decodeWire } from '../../src/transport/lino.js';
import { fixtureServerClose } from './fixture-server.mjs';
import {
  vacancySnapshotFixture,
  searchFixture,
} from '../../../experiments/issue-56/vacancy-fixture.mjs';
import { resumeListFixture } from '../../../experiments/issue-56/resume-list-fixture.mjs';

export const withRoutes = async (work, options = {}) => {
  const store = options.store ?? createMemoryStore();
  const calls = [];
  const context = {
    vacancyOptions: {
      availability: async () => ({ available: true }),
      readVacancy: async () => {
        calls.push('collect');
        return vacancySnapshotFixture();
      },
      readSearch: async (url) => {
        calls.push(url);
        return searchFixture(url);
      },
      readResumes: async () => {
        calls.push('resumes');
        return resumeListFixture();
      },
      ...options.service,
    },
  };
  const server = http.createServer(async (req, res) => {
    bindWire(req, res);
    const handled = await handleVacancyRoutes(
      store,
      req,
      res,
      new URL(req.url, 'http://localhost').pathname,
      context
    );
    if (!handled) {
      res.writeHead(404);
      res.end();
    }
  });
  const close = fixtureServerClose(server, 'vacancies');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    return await work(`http://127.0.0.1:${server.address().port}`, calls, {
      store,
      context,
    });
  } finally {
    await context.vacancies?.stop();
    await close();
  }
};
export const wirePost = async (base, path, value, type, headers = {}) => {
  const response = await fetch(`${base}/api/vacancies/${path}`, {
    method: 'POST',
    headers: { 'content-type': type, accept: type, ...headers },
    body: encodeWire(value, type),
  });
  return {
    status: response.status,
    value: decodeWire(
      await response.arrayBuffer(),
      response.headers.get('content-type')
    ),
  };
};
