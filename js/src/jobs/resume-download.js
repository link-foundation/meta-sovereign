import { randomUUID, createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { jobsFailure } from './options.js';
import { RESUME_NATIVE_FORMATS } from './resume-export-options.js';

export const MAX_NATIVE_RESUME_BYTES = 8 * 1024 ** 2;
/** Browser cookies/TLS stay in the owned HH page; only bounded chunks cross out. */
export const streamResumeDownload = async ({
  hash,
  format,
  binding,
  token,
  limit,
}) => {
  const { location, AbortSignal, btoa } = globalThis;
  const url = new URL(
    `/resume_converter/resume.${format === 'html' ? 'txt' : format}`,
    location.origin
  );
  const expected = `https://hh.ru/resume/${hash}`;
  if (`${location.origin}${location.pathname}` !== expected) {
    throw new Error('The owned resume page changed.');
  }
  url.searchParams.set('hash', hash);
  url.searchParams.set('type', format === 'html' ? 'txt' : format);
  const response = await fetch(url, {
    credentials: 'include',
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
  });
  if (
    !response.ok ||
    !response.body ||
    Number(response.headers.get('content-length')) > limit
  ) {
    throw new Error('The native resume export did not load.');
  }
  const reader = response.body.getReader();
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      size += chunk.value.byteLength;
      if (size > limit) {
        throw new Error('The native resume export exceeds its size limit.');
      }
      for (let offset = 0; offset < chunk.value.byteLength; offset += 32768) {
        const part = chunk.value.subarray(offset, offset + 32768);
        await globalThis[binding]({
          token,
          data: btoa(String.fromCharCode(...part)),
        });
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return { size, status: response.status, url: response.url };
};

/** One bounded sink, restricted to the exact page, frame and download token. */
export const createResumeDownloadSink = async ({ session, folder, check }) => {
  const binding = `__resume_export_${randomUUID().replaceAll('-', '')}`;
  let active;
  await session.page.exposeBinding(binding, async (source, input) => {
    check();
    if (
      source.page !== session.page ||
      source.frame !== session.page.mainFrame() ||
      !active ||
      active.writing ||
      input?.token !== active.token ||
      typeof input.data !== 'string' ||
      !input.data ||
      input.data.length > 43692 ||
      !/^[a-zA-Z0-9+/]+={0,2}$/u.test(input.data)
    ) {
      throw jobsFailure(
        'export-chunk',
        'An invalid native export chunk was refused.'
      );
    }
    const bytes = Buffer.from(input.data, 'base64');
    if (
      bytes.toString('base64') !== input.data ||
      active.size + bytes.length > active.limit
    ) {
      throw jobsFailure(
        'export-size',
        'The native resume export exceeds its limit.'
      );
    }
    active.size += bytes.length;
    active.digest.update(bytes);
    const current = active;
    current.writing = true;
    current.pending = current.handle.writeFile(bytes);
    try {
      await current.pending;
    } finally {
      current.writing = false;
    }
  });
  return async (hash, format) => {
    const spec = RESUME_NATIVE_FORMATS[format];
    const limit = format === 'html' ? 2 * 1024 ** 2 : MAX_NATIVE_RESUME_BYTES;
    const handle = await fs.open(path.join(folder, spec.name), 'wx', 0o600);
    const current = {
      handle,
      limit,
      token: randomUUID(),
      size: 0,
      digest: createHash('sha256'),
    };
    active = current;
    try {
      const result = await session.commander.evaluate({
        fn: streamResumeDownload,
        args: [{ hash, format, binding, token: current.token, limit }],
      });
      check();
      const expected = new URL(
        `https://hh.ru/resume_converter/resume.${format === 'html' ? 'txt' : format}`
      );
      expected.searchParams.set('hash', hash);
      expected.searchParams.set('type', format === 'html' ? 'txt' : format);
      if (
        result?.status !== 200 ||
        result.url !== expected.href ||
        !current.size ||
        result.size !== current.size
      ) {
        throw jobsFailure(
          'export-unconfirmed',
          'The native export bytes were not confirmed.'
        );
      }
      await handle.sync();
    } finally {
      active = null;
      await current.pending?.catch(() => {});
      await handle.close();
    }
    const bytes = await fs.readFile(path.join(folder, spec.name));
    const prefix = bytes.subarray(0, 16).toString('ascii');
    if (
      (format === 'pdf' &&
        (!prefix.startsWith('%PDF-') ||
          !bytes.subarray(-8192).includes(Buffer.from('%%EOF')))) ||
      (['doc', 'rtf'].includes(format) && !prefix.startsWith('{\\rtf'))
    ) {
      throw jobsFailure(
        'export-format',
        'The native export has an invalid file signature.'
      );
    }
    return {
      ...spec,
      size: current.size,
      sha256: current.digest.digest('hex'),
      native: true,
    };
  };
};
