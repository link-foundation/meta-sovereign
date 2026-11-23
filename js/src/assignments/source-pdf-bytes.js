const MAX_PDF_BYTES = 2 * 1024 * 1024;

export const isAssignmentPdf = (headers) =>
  headers['content-type']?.split(';', 1)[0].trim().toLowerCase() ===
  'application/pdf';

const readPdfResponse = async ({ url, token, maxBytes }) => {
  if (globalThis.document.title !== token) {
    return null;
  }
  const response = await fetch(url, {
    method: 'GET',
    mode: 'same-origin',
    credentials: 'same-origin',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    redirect: 'error',
  });
  if (!response.body) {
    return null;
  }
  const reader = response.body.getReader();
  try {
    const type = response.headers.get('content-type')?.split(';', 1)[0];
    if (
      response.status !== 200 ||
      response.url !== url ||
      type?.trim().toLowerCase() !== 'application/pdf' ||
      Number(response.headers.get('content-length')) > maxBytes ||
      response.headers.has('content-range')
    ) {
      return null;
    }
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    let binary = '';
    for (let index = 0; index < total; index += 8192) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
    }
    return globalThis.btoa(binary);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
};

/** Fetch the observed PDF in its browser profile, without retaining a download. */
export const readAssignmentPdfBytes = async (session, url, check) => {
  const context = session.page.context();
  const page = await context.newPage();
  const token = globalThis.crypto.randomUUID();
  const marker = new URL(`/${token}`, url).href;
  let fulfilled = false;
  try {
    check();
    await page.route(
      (requestUrl) => requestUrl.href === marker,
      async (route) => {
        // Unique inert same-origin document. Its GET is fulfilled locally.
        await route.fulfill({
          contentType: 'text/html; charset=utf-8',
          headers: {
            'cache-control': 'no-store',
            'content-security-policy': "default-src 'none'; connect-src 'self'",
          },
          body: `<title>${token}</title>`,
        });
        fulfilled = true;
      }
    );
    await page.goto(marker, { waitUntil: 'domcontentloaded', timeout: 10000 });
    check();
    if (!fulfilled || page.url() !== marker) {
      return null;
    }
    const data = await page.evaluate(readPdfResponse, {
      url,
      token,
      maxBytes: MAX_PDF_BYTES,
    });
    return data ? Uint8Array.fromBase64(data) : null;
  } finally {
    await page.close();
  }
};
