// tab-group-control.js
// Disables automatic tab grouping triggered by the service worker.
// Stores the original chrome.tabs.group so the AI's group_tabs tool can use it.

(function () {
  'use strict';

  if (!chrome.tabs || typeof chrome.tabs.group !== 'function') {
    return;
  }

  const originalTabsGroup = chrome.tabs.group.bind(chrome.tabs);

  // Expose the original function for the API adapter's group_tabs tool.
  globalThis.__chefOriginalTabsGroup = originalTabsGroup;

  // Replace with a no-op so the compiled service worker's automatic grouping on panel open is suppressed.
  chrome.tabs.group = async function () {
    console.log('[Chef] Automatic tab grouping suppressed.');
    return -1;
  };

  console.log('[Chef] Tab group control installed — automatic grouping disabled.');
})();
