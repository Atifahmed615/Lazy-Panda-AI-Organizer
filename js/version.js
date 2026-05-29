// Single source of truth for the deployed build string.
// Bumped on every release. Read by both window (index.html) and sw.js (importScripts).
// Whenever this changes the service worker invalidates its cache automatically.
var LAZY_PANDA_BUILD = '2026.05.29.1-phases-0-5';
// Expose on window when running in a normal page context.
if (typeof window !== 'undefined') window.LAZY_PANDA_BUILD = LAZY_PANDA_BUILD;
