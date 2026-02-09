importScripts('src/filters.js');
importScripts('src/selection.js');

// Per-tab selection state (Map<tabId, boolean>)
const selectingTabs = new Map();

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'viewFilters',
    title: chrome.i18n.getMessage("viewFilterList"),
    contexts: ['action']
  });
});

// Clean up selectingTabs when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  selectingTabs.delete(tabId);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'viewFilters') {
    chrome.runtime.openOptionsPage();
  }
});

// Start selection mode for a tab
async function startSelectionForTab(tabId) {
  if (selectingTabs.get(tabId)) {
    // Already selecting, cancel it
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        function: cleanupSelection
      });
    } catch (error) {
      console.error('Cleanup script execution failed:', error);
    }
    selectingTabs.delete(tabId);
    updateFilterBadge(tabId);
    return;
  }

  selectingTabs.set(tabId, true);
  await chrome.action.setBadgeText({ text: 'ON', tabId });
  await chrome.action.setBadgeBackgroundColor({ color: '#4CAF50', tabId });
  await chrome.action.setTitle({
    title: chrome.i18n.getMessage("startSelection"),
    tabId
  });

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      function: startSelection
    });
  } catch (error) {
    console.error('Error when script execution:', error);
    selectingTabs.delete(tabId);
    await chrome.action.setBadgeText({ text: 'ERR', tabId });
    await chrome.action.setBadgeBackgroundColor({ color: '#F44336', tabId });
  }
}

// Update filter badge count
async function updateFilterBadge(tabId) {
  try {
    if (selectingTabs.get(tabId)) return;

    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) {
      await chrome.action.setBadgeText({ text: '', tabId });
      return;
    }

    const url = new URL(tab.url);
    const domain = url.hostname;

    const { filters = [], filtersEnabled = true } = await chrome.storage.local.get(['filters', 'filtersEnabled']);

    if (!filtersEnabled) {
      await chrome.action.setBadgeText({ text: 'OFF', tabId });
      await chrome.action.setBadgeBackgroundColor({ color: '#888', tabId });
      return;
    }

    const domainFilters = filters.filter(f => f.domain === domain && f.enabled !== false);

    if (domainFilters.length > 0) {
      await chrome.action.setBadgeText({ text: domainFilters.length.toString(), tabId });
      await chrome.action.setBadgeBackgroundColor({ color: '#2196F3', tabId });
      await chrome.action.setTitle({
        title: chrome.i18n.getMessage("activeFiltersCount", [domainFilters.length.toString()]),
        tabId
      });
    } else {
      await chrome.action.setBadgeText({ text: '', tabId });
      await chrome.action.setTitle({
        title: chrome.i18n.getMessage("startElementSelection"),
        tabId
      });
    }
  } catch (error) {
    console.error('Badge update error:', error);
  }
}

// Apply filters on page load
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId === 0) {
    try {
      const { filters = [], filtersEnabled = true } = await chrome.storage.local.get(['filters', 'filtersEnabled']);
      if (!filtersEnabled) {
        updateFilterBadge(details.tabId);
        return;
      }

      if (details.url.startsWith('chrome://') || details.url.startsWith('about:')) return;

      const url = new URL(details.url);
      const domain = url.hostname;
      const domainFilters = filters.filter(f => f.domain === domain && f.enabled !== false);

      if (!selectingTabs.get(details.tabId)) {
        updateFilterBadge(details.tabId);
      }

      if (domainFilters.length > 0) {
        await chrome.scripting.executeScript({
          target: { tabId: details.tabId },
          func: applyFilters,
          args: [domainFilters]
        });
      }
    } catch (error) {
      console.error('Filter application error:', error);
    }
  }
});

// Consolidated message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startSelectionFromPopup') {
    startSelectionForTab(message.tabId);
    sendResponse({ success: true });
    return false;
  }

  if (message.action === 'selectionCanceled' || message.action === 'filterSaved') {
    if (sender.tab) {
      selectingTabs.delete(sender.tab.id);
      updateFilterBadge(sender.tab.id);
    }
    return false;
  }

  if (message.action === 'getCurrentTabId') {
    sendResponse({ tabId: sender.tab.id });
    return true;
  }

  if (message.action === 'saveFilter') {
    const filter = message.filter;
    filter.tabId = message.tabId;

    saveFilter(filter)
      .then(() => {
        sendResponse({ success: true });
        return applyNewFilter(filter);
      })
      .catch(error => {
        console.error('Filter save/apply error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.action === 'toggleFilter') {
    toggleFilter(message.filterIndex, message.enabled)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// Toggle individual filter enabled/disabled
async function toggleFilter(filterIndex, enabled) {
  const { filters = [] } = await chrome.storage.local.get('filters');
  if (filterIndex >= 0 && filterIndex < filters.length) {
    filters[filterIndex].enabled = enabled;
    await chrome.storage.local.set({ filters });
  }
}
