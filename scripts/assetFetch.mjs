/**
 * A request deadline must cover BOTH headers and the complete response body.
 * Prevents CDN image-stream stalls from holding the Netlify build indefinitely.
 */
export async function fetchImageWithTimeout(url, {
  fetchImpl = globalThis.fetch,
  timeoutMs = 5500,
  maxBytes = 2 * 1024 * 1024,
  headers = {},
} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid manufacturer image timeout.');
  const controller = new AbortController();
  let timer;
  const downloading = (async () => {
    const response = await fetchImpl(url, { signal: controller.signal, headers });
    if (!response.ok) throw new Error('Manufacturer image HTTP ' + response.status);
    const lengthHeader = response.headers.get('content-length');
    const declaredLength = lengthHeader ? Number(lengthHeader) : null;
    if (declaredLength !== null && Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new Error('Manufacturer image exceeds maximum allowed bytes.');
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 1500 || bytes.length > maxBytes) {
      throw new Error('Manufacturer image has unexpected size: ' + bytes.length + ' bytes.');
    }
    return { bytes, contentType: (response.headers.get('content-type') || '').toLowerCase() };
  })();
  const expiration = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('Manufacturer image delivery timeout after ' + timeoutMs + ' ms.'));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([downloading, expiration]);
  } finally {
    clearTimeout(timer);
  }
}
