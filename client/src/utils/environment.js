/**
 * Environment detection and server routing utility for UniExtract.
 * Automatically identifies where the application is running (Netlify, web.app, Render, PWA, Localhost)
 * and resolves the correct backend endpoint without requiring multiple codebases.
 */

export const DEFAULT_RENDER_SERVER = 'https://universal-media-extractor-vav8.onrender.com';

/**
 * Checks whether the app is running as an installed Progressive Web App in standalone mode.
 */
export function isPwaMode() {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.navigator?.standalone === true ||
    document.referrer?.includes?.('android-app://')
  );
}

/**
 * Checks whether the app is running in an Electron desktop shell.
 */
export function isElectron() {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.electronAPI?.isElectron ||
    navigator.userAgent?.toLowerCase?.()?.includes?.('electron')
  );
}

/**
 * Checks whether the frontend is running on localhost or local loopback.
 */
export function isLocalhost() {
  if (typeof window === 'undefined') return true;
  const hostname = (window.location.hostname || '').toLowerCase();
  const protocol = window.location.protocol;
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '0.0.0.0' ||
    protocol === 'file:' ||
    isElectron()
  );
}

/**
 * Checks whether the frontend is running on Netlify (*.netlify.app).
 */
export function isNetlify() {
  if (typeof window === 'undefined') return false;
  const hostname = (window.location.hostname || '').toLowerCase();
  return hostname.endsWith('.netlify.app') || hostname.includes('netlify');
}

/**
 * Checks whether the frontend is running on Render (*.onrender.com).
 */
export function isRender() {
  if (typeof window === 'undefined') return false;
  const hostname = (window.location.hostname || '').toLowerCase();
  return hostname.endsWith('.onrender.com') || hostname.includes('render');
}

/**
 * Checks whether the frontend is running on web.app, Firebase, or other cloud static web hosts.
 */
export function isCloudWebHost() {
  if (typeof window === 'undefined') return false;
  const hostname = (window.location.hostname || '').toLowerCase();
  return (
    hostname.endsWith('.web.app') ||
    hostname.endsWith('.firebaseapp.com') ||
    hostname.endsWith('.github.io') ||
    hostname.endsWith('.pages.dev') ||
    hostname.endsWith('.vercel.app') ||
    hostname.includes('web.app')
  );
}

/**
 * Returns the default backend base URL for the active environment when no custom server is specified.
 * - On Localhost / Desktop: Returns '' (relative path /api, handled by local Express or Vite proxy)
 * - On Netlify, web.app, Render, or cloud PWA: Returns the cloud Render backend directly
 *   to bypass Netlify proxy timeout/500 issues.
 */
export function getDefaultBackendUrl() {
  if (isLocalhost()) {
    return '';
  }
  // All cloud web deployments and cloud PWAs default directly to the Render cloud backend
  return DEFAULT_RENDER_SERVER;
}

/**
 * Returns rich, contextual metadata and user-facing messages for the active environment.
 * @param {string} customServerUrl - Currently configured custom server URL, if any.
 */
export function getEnvironmentInfo(customServerUrl = '') {
  const isPwa = isPwaMode();
  const isLocal = isLocalhost();
  const isNet = isNetlify();
  const isRen = isRender();
  const isCloudWeb = isCloudWebHost();
  const hasCustom = Boolean(customServerUrl && customServerUrl.trim());

  // 1. Custom Server Active
  if (hasCustom) {
    const cleanCustom = customServerUrl.trim().replace(/\/+$/, '');
    return {
      envId: 'custom',
      name: 'Custom Remote Server',
      badgeText: 'Custom Host',
      badgeColor: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
      headerPill: 'Custom',
      headerTooltip: `Custom Server: ${cleanCustom}`,
      serverTitle: `Custom Host (${cleanCustom})`,
      serverMessage: `All media extraction and download requests are routed to your custom server: ${cleanCustom}. The default cloud and local hosts are bypassed.`,
      defaultOptionDesc: 'Connects to your custom remote endpoint for dedicated processing.',
      targetEndpoint: cleanCustom,
      isCloud: !cleanCustom.includes('localhost') && !cleanCustom.includes('127.0.0.1')
    };
  }

  // 2. Progressive Web App (Standalone Mode)
  if (isPwa) {
    const isInstalledFromLocal = isLocal;
    return {
      envId: 'pwa',
      name: 'Progressive Web App (PWA)',
      badgeText: 'PWA Standalone',
      badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      headerPill: 'PWA Cloud',
      headerTooltip: isInstalledFromLocal
        ? 'PWA connected to Local Machine Server (localhost:3000)'
        : `PWA connected to Cloud Server (${DEFAULT_RENDER_SERVER})`,
      serverTitle: isInstalledFromLocal
        ? 'Local Machine Server (localhost:3000)'
        : 'Render Cloud Backend (Dedicated)',
      serverMessage: isInstalledFromLocal
        ? 'Running as an installed Progressive Web App connected to your local machine (localhost:3000). Video conversion runs on your PC.'
        : 'Running as an installed Progressive Web App. It connects directly to our cloud Render backend (universal-media-extractor-vav8.onrender.com). No local server is running on your device, and no manual setup is required.',
      defaultOptionDesc: isInstalledFromLocal
        ? 'Connects to your local machine (localhost:3000) for native offline transcoding.'
        : 'Connects to our high-performance Render cloud server with zero configuration. Saves battery and device storage.',
      targetEndpoint: isInstalledFromLocal
        ? 'http://localhost:3000'
        : DEFAULT_RENDER_SERVER,
      isCloud: !isInstalledFromLocal
    };
  }

  // 3. Deployed on Cloud Web Platform (*.netlify.app)
  if (isNet) {
    return {
      envId: 'cloud_web',
      name: 'Cloud Web Platform',
      badgeText: 'Cloud Online',
      badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      headerPill: 'Cloud Server',
      headerTooltip: 'UniExtract Cloud Web Platform',
      serverTitle: 'Cloud Media Server',
      serverMessage: 'Connected directly to the dedicated UniExtract Cloud Server. All media extraction, stream analysis, and FFmpeg remuxing run seamlessly in the cloud with zero installation or local dependencies required.',
      defaultOptionDesc: 'Connects directly to the high-performance UniExtract Cloud extraction engine. Fast, reliable, and requires zero software on your PC.',
      targetEndpoint: DEFAULT_RENDER_SERVER,
      isCloud: true
    };
  }

  // 4. Deployed on Render (*.onrender.com)
  if (isRen) {
    return {
      envId: 'render',
      name: 'Cloud Web Platform',
      badgeText: 'Cloud Online',
      badgeColor: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
      headerPill: 'Cloud Server',
      headerTooltip: 'UniExtract Cloud Platform',
      serverTitle: 'Cloud Media Server',
      serverMessage: 'Running on dedicated UniExtract Cloud Infrastructure. The web interface and media engine (yt-dlp & FFmpeg) run natively together on high-speed cloud instances.',
      defaultOptionDesc: 'Connects directly to the dedicated cloud media engine with zero setup.',
      targetEndpoint: DEFAULT_RENDER_SERVER,
      isCloud: true
    };
  }

  // 5. Deployed on Web.app, Firebase, or other static web hosts
  if (isCloudWeb) {
    return {
      envId: 'cloud_web',
      name: 'Cloud Web Platform',
      badgeText: 'Cloud Online',
      badgeColor: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
      headerPill: 'Cloud Server',
      headerTooltip: 'UniExtract Cloud Web Platform',
      serverTitle: 'Cloud Media Server',
      serverMessage: 'Connected directly to the dedicated UniExtract Cloud Server. All stream extraction and media processing execute in the cloud with zero local software required.',
      defaultOptionDesc: 'Connects directly to the cloud media extraction engine with zero configuration.',
      targetEndpoint: DEFAULT_RENDER_SERVER,
      isCloud: true
    };
  }

  // 6. Localhost / Local PC / Electron Desktop
  if (isLocal) {
    return {
      envId: 'localhost',
      name: isElectron() ? 'Desktop Application (Local)' : 'Localhost Development (Local)',
      badgeText: 'Localhost:3000',
      badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      headerPill: 'Localhost',
      headerTooltip: 'Running on Local Machine Server (http://localhost:3000)',
      serverTitle: 'Local Machine Server (http://localhost:3000)',
      serverMessage: 'Running locally on your computer (localhost:3000). Stream extraction, audio conversion, and FFmpeg remuxing run directly on your machine using your local CPU, RAM, and network bandwidth.',
      defaultOptionDesc: 'Connects to your local machine (localhost:3000). Best for unlimited conversions without remote server limits.',
      targetEndpoint: 'http://localhost:3000',
      isCloud: false
    };
  }

  // 7. General Web Fallback
  return {
    envId: 'web',
    name: 'Web Deployment',
    badgeText: 'Cloud Server',
    badgeColor: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
    headerPill: 'Cloud Server',
    headerTooltip: `Connected to Render Cloud Server (${DEFAULT_RENDER_SERVER})`,
    serverTitle: 'Render Cloud Backend',
    serverMessage: 'Connected directly to our dedicated Render Cloud Server (universal-media-extractor-vav8.onrender.com). All media processing executes in the cloud with zero configuration.',
    defaultOptionDesc: 'Connects directly to the default cloud backend server with zero setup required.',
    targetEndpoint: DEFAULT_RENDER_SERVER,
    isCloud: true
  };
}
