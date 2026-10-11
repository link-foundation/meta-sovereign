/**
 * In-browser checksum check for the download page (issue #37): hash a
 * downloaded installer with WebCrypto and compare it to its line in
 * the release's SHA256SUMS.txt. Nothing leaves the browser.
 */

/** Expected lowercase SHA-256 for `fileName`, or null if not listed. */
export const checksumForFile = (sumsText, fileName) => {
  for (const line of String(sumsText ?? '').split(/\r?\n/)) {
    const match = line.trim().match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
    if (match && match[2].trim() === fileName) {
      return match[1].toLowerCase();
    }
  }
  return null;
};

/** Hex SHA-256 of an ArrayBuffer or typed array. */
export const sha256Hex = async (data, subtle = globalThis.crypto?.subtle) => {
  const digest = await subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
};

/**
 * Compare a file against SHA256SUMS.txt.
 * @returns {Promise<{state: 'match'|'mismatch'|'missing', actual?: string, expected?: string}>}
 */
export const verifyChecksum = async ({ name, data, sumsText, subtle }) => {
  const expected = checksumForFile(sumsText, name);
  if (!expected) {
    return { state: 'missing' };
  }
  const actual = await sha256Hex(data, subtle);
  return {
    state: actual === expected ? 'match' : 'mismatch',
    actual,
    expected,
  };
};
