import { getDefaultBackendUrl } from './environment';

const STORAGE_KEY = 'umx_custom_server';

/**
 * Returns the configured custom server URL, if any, stripped of trailing slashes.
 */
export function getCustomServerUrl() {
  const custom = localStorage.getItem(STORAGE_KEY);
  if (!custom) return '';
  return custom.trim().replace(/\/+$/, '');
}

/**
 * Returns the active backend base URL (custom server if configured, otherwise environment default).
 */
export function getActiveBackendBase() {
  const custom = getCustomServerUrl();
  if (custom) return custom;
  return getDefaultBackendUrl();
}

/**
 * Persists or clears the custom backend server URL in localStorage.
 * Automatically ensures http:// or https:// protocol is present.
 */
export function setCustomServerUrl(url) {
  if (!url || !url.trim()) {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event('umx-server-changed'));
    return;
  }
  let cleanUrl = url.trim().replace(/\/+$/, '');
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = 'https://' + cleanUrl;
  }
  localStorage.setItem(STORAGE_KEY, cleanUrl);
  window.dispatchEvent(new Event('umx-server-changed'));
}

/**
 * Resolves an API path against the active server (custom endpoint if set, otherwise environment default).
 */
export function apiUrl(path) {
  const base = getActiveBackendBase();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

/**
 * Fetch wrapper automatically resolving through custom endpoint or relative path.
 */
export async function apiFetch(path, options = {}) {
  const url = apiUrl(path);
  return fetch(url, options);
}

/**
 * Tests connection to a given endpoint (or current active endpoint if omitted).
 */
export async function testServerConnection(targetUrl) {
  let testUrl = '';
  if (targetUrl !== undefined && targetUrl !== '') {
    const clean = targetUrl.trim().replace(/\/+$/, '');
    const formatted = (clean.startsWith('http://') || clean.startsWith('https://')) ? clean : `https://${clean}`;
    testUrl = `${formatted}/api/health`;
  } else if (targetUrl === '') {
    // Explicitly testing default server
    const defaultBase = getDefaultBackendUrl();
    testUrl = defaultBase ? `${defaultBase}/api/health` : '/api/health';
  } else {
    testUrl = apiUrl('/api/health');
  }

  const start = performance.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);
    const res = await fetch(testUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    const latency = Math.round(performance.now() - start);

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: true, latency, data, url: testUrl };
    } else {
      return { success: false, error: `HTTP ${res.status} (${res.statusText || 'Error'})`, latency, url: testUrl };
    }
  } catch (err) {
    const latency = Math.round(performance.now() - start);
    let errorMessage = err.name === 'AbortError' ? 'Connection timed out (9s)' : (err.message || 'Server unreachable');

    // Detect browser Mixed Content blocking (HTTPS origin fetching HTTP target)
    const isHttpsOrigin = typeof window !== 'undefined' && window.location.protocol === 'https:';
    if (isHttpsOrigin && testUrl.startsWith('http://')) {
      errorMessage = 'Blocked by browser (Mixed Content: HTTPS cannot call unencrypted HTTP)';
    } else if (isHttpsOrigin && (testUrl.includes('localhost') || testUrl.includes('127.0.0.1')) && err.message?.toLowerCase().includes('failed to fetch')) {
      errorMessage = 'Blocked by browser (Untrusted SSL cert or server offline)';
    }

    return {
      success: false,
      error: errorMessage,
      latency,
      url: testUrl
    };
  }
}

/**
 * Determines whether the dedicated server selector should be shown.
 * All environments (Web, PWA, and Desktop) have the server selector enabled
 * so normal users can use the default server, and advanced users can connect to custom servers.
 */
export function shouldShowServerSelector() {
  return true;
}

