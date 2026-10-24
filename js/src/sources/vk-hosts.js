/**
 * The exact VK hosts the page may load from (R-Z20): one list for the CSP
 * (`img-src`, `media-src`, ../server/index.js) and for the adapter, so a URL
 * is only offered to a player when the CSP would let the browser fetch it.
 * Pictures, audio and video come from VK's CDNs; the captcha picture comes
 * from the API host. Nothing is framed: a VK video page is a link, never an
 * iframe.
 */

/** Hosts VK serves audio and video files from (`media-src`). */
export const VK_MEDIA_HOSTS = [
  '*.userapi.com',
  '*.vk-cdn.net',
  '*.vkuseraudio.net',
  '*.vkuservideo.net',
];

/** Hosts of pictures (`img-src`): the media hosts and VK's photo CDN. */
export const VK_IMAGE_HOSTS = [...VK_MEDIA_HOSTS, '*.vkuserphoto.ru'];

/** Where VK's captcha picture is served from (`img-src`). */
export const VK_CAPTCHA_HOSTS = ['api.vk.com', 'api.vk.ru'];

/** A CSP source list for `hosts`: `https://a https://b`. */
export const cspSources = (hosts) =>
  hosts.map((host) => `https://${host}`).join(' ');

const matches = (host, pattern) =>
  pattern.startsWith('*.')
    ? host.endsWith(pattern.slice(1)) && host.length > pattern.length - 1
    : host === pattern;

/** `url` when it is an https address on one of `hosts`, else null. */
export const onHosts = (url, hosts) => {
  try {
    const parsed = new URL(String(url));
    return parsed.protocol === 'https:' &&
      !parsed.username &&
      hosts.some((pattern) => matches(parsed.hostname, pattern))
      ? parsed.href
      : null;
  } catch {
    return null;
  }
};

/** A direct audio/video file address, only on VK's CDNs. */
export const vkMediaUrl = (url) => onHosts(url, VK_MEDIA_HOSTS);

/** VK's captcha picture address, only on VK's API hosts. */
export const vkCaptchaImage = (url) => onHosts(url, VK_CAPTCHA_HOSTS);
