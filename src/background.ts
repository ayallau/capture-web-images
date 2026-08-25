chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('[BG] failed to set panel behavior', error));

console.log('[BG] service worker started');
