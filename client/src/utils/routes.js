/**
 * Client-side routing and deep-linking utility for UniExtract.
 * Supports clean path routes (/downloads, /cookies, /settings, /server, /update)
 * and deep-linking auto-analyze queries (?url=...).
 */

export const ROUTE_HOME = '/';
export const ROUTE_DOWNLOADS = '/downloads';
export const ROUTE_COOKIES = '/cookies';
export const ROUTE_SETTINGS = '/settings';
export const ROUTE_SERVERS = '/server';
export const ROUTE_UPDATES = '/update';

/**
 * Matches a URL pathname to an internal modal/page view identifier.
 */
export function matchRoute(pathname = '') {
  if (!pathname) return 'home';
  const clean = pathname.toLowerCase().replace(/\/+$/, '') || '/';

  if (clean === '/downloads' || clean === '/download') return 'downloads';
  if (clean === '/cookies' || clean === '/cookie' || clean === '/auth') return 'cookies';
  if (clean === '/settings' || clean === '/setting' || clean === '/preferences' || clean === '/pref') return 'settings';
  if (clean === '/servers' || clean === '/server') return 'servers';
  if (clean === '/updates' || clean === '/update') return 'updates';
  return 'home';
}

/**
 * Normalizes and cleans media URLs passed via query parameters or paste.
 * Automatically adds protocols, resolves YouTube IDs, and corrects common typos.
 */
export function sanitizeQueryUrl(raw) {
  if (!raw) return '';
  let url = String(raw).trim();
  if (!url) return '';

  // Prepend https:// if protocol is missing
  if (!/^https?:\/\//i.test(url)) {
    // Check if it's an 11-char YouTube video ID (e.g. jNQXAC9IVRw)
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
      return `https://www.youtube.com/watch?v=${url}`;
    }
    url = `https://${url}`;
  }

  // Correct common domain typos
  url = url.replace(/^https?:\/\/(?:www\.)?(?:youtobe|yotube|ytube)\.com/i, 'https://www.youtube.com');

  // Correct missing 'v=' parameter in YouTube URLs (e.g. watch?=...)
  url = url.replace(/(youtube\.com\/watch\?)=([a-zA-Z0-9_-]+)/i, (_match, p1, p2) => `${p1}v=${p2}`);

  return url;
}

/**
 * Extracts and sanitizes media URL from window.location query or hash params.
 */
export function getAutoAnalyzeUrl() {
  if (typeof window === 'undefined') return '';

  // 1. Check window.location.search (?url=... or ?q=... or ?link=...)
  const searchParams = new URLSearchParams(window.location.search || '');
  let target = searchParams.get('url') || searchParams.get('q') || searchParams.get('link') || searchParams.get('video') || searchParams.get('media');

  // 2. Fallback check for hash query params (#/?url=...)
  if (!target && window.location.hash) {
    const qIndex = window.location.hash.indexOf('?');
    if (qIndex !== -1) {
      const hashParams = new URLSearchParams(window.location.hash.substring(qIndex));
      target = hashParams.get('url') || hashParams.get('q') || hashParams.get('link') || hashParams.get('video') || hashParams.get('media');
    }
  }

  return sanitizeQueryUrl(target);
}

/**
 * Synchronizes the browser address bar with the current view state without page reloads.
 */
export function syncRouteToUrl(targetRoute, searchUrl = null, replace = false) {
  if (typeof window === 'undefined') return;

  const path = targetRoute || '/';
  const params = new URLSearchParams(window.location.search || '');

  if (searchUrl) {
    params.set('url', searchUrl);
  } else if (searchUrl === '') {
    params.delete('url');
    params.delete('q');
    params.delete('link');
    params.delete('video');
    params.delete('media');
  }

  const query = params.toString() ? `?${params.toString()}` : '';
  const newUrl = `${path}${query}`;

  const currentPath = window.location.pathname.toLowerCase().replace(/\/+$/, '') || '/';
  const currentUrl = `${currentPath}${window.location.search || ''}`;

  if (currentUrl !== newUrl) {
    if (replace) {
      window.history.replaceState({ route: targetRoute }, '', newUrl);
    } else {
      window.history.pushState({ route: targetRoute }, '', newUrl);
    }
  }
}
