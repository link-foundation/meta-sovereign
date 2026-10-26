/** Only failed HTTP entries need an archive fallback. Redirect lists are valid. */
export const extractBrokenUrls = (content) => {
  const failed =
    /\[(?:4\d\d|5\d\d|ERROR|ERR|TIMEOUT|UNKNOWN)\]\s+<?(https?:\/\/[^\s<>|)\]]+)/gi;
  return [...new Set([...content.matchAll(failed)].map((match) => match[1]))];
};
