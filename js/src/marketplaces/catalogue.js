// Issue #42: initial sign-in/profile support, separate from messaging adapters.
// Login and challenges are completed by the person in an app-owned browser.
export const MARKETPLACES = Object.freeze({
  upwork: {
    label: 'Upwork',
    hosts: ['www.upwork.com', 'upwork.com'],
    loginUrl: 'https://www.upwork.com/ab/account-security/login',
    profilePath: '^/(?:freelancers/(?:~[^/]+|settings/profile)|fl/[^/]+)/?$',
    docsUrl:
      'https://support.upwork.com/hc/en-us/articles/360016252373-How-to-build-your-freelancer-profile-the-essentials',
  },
  fiverr: {
    label: 'Fiverr',
    hosts: ['www.fiverr.com', 'fiverr.com'],
    loginUrl: 'https://www.fiverr.com/login',
    profilePath: '^/(?:[a-zA-Z0-9_]{2,32}|users/[a-zA-Z0-9_]{2,32})/?$',
    docsUrl:
      'https://help.fiverr.com/hc/en-us/articles/360010558598-Creating-editing-your-freelancer-profile',
  },
  peopleperhour: {
    label: 'PeoplePerHour',
    hosts: ['www.peopleperhour.com', 'peopleperhour.com'],
    loginUrl: 'https://www.peopleperhour.com/site/login',
    profilePath: '^/(?:freelancer|buyer|profile)/[^?#]+/?$',
    docsUrl:
      'https://support.peopleperhour.com/hc/en-us/articles/115016023568-Create-a-buyer-account',
  },
  wellfound: {
    label: 'Wellfound',
    hosts: ['wellfound.com', 'www.wellfound.com'],
    loginUrl: 'https://wellfound.com/login',
    profilePath: '^/(?:u/[^/]+|profile(?:/edit)?)/?$',
    docsUrl: 'https://help.wellfound.com/article/758-profiles',
  },
});

const NON_PROFILE = new Set([
  'login',
  'signup',
  'join',
  'search',
  'categories',
  'seller_dashboard',
  'settings',
  'users',
  'dashboard',
  'logout',
  'contact',
  'about',
  'terms',
  'privacy',
]);

/** Accept only an HTTPS profile URL on this service, never a redirect query. */
export const marketplaceProfileUrl = (id, value) => {
  const provider = MARKETPLACES[id];
  try {
    const url = new URL(value);
    if (
      !provider ||
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !provider.hosts.includes(url.hostname) ||
      NON_PROFILE.has(url.pathname.replace(/^\/|\/$/g, '')) ||
      !new RegExp(provider.profilePath).test(url.pathname)
    ) {
      return null;
    }
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
};

export const marketplaceProfileId = (id) => `account:marketplace:${id}`;
