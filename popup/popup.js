document.addEventListener('DOMContentLoaded', async () => {
  // i18n
  const i18nMap = {
    totalFiltersLabel: 'popupTotalFilters',
    domainFiltersLabel: 'popupThisSite',
    hiddenCountLabel: 'popupHidden',
    enableFiltersLabel: 'popupEnableFilters',
    selectBtnLabel: 'startElementSelection',
    manageBtnLabel: 'popupManageFilters'
  };
  for (const [id, key] of Object.entries(i18nMap)) {
    const msg = chrome.i18n.getMessage(key);
    if (msg) document.getElementById(id).textContent = msg;
  }

  const globalToggle = document.getElementById('globalToggle');
  const selectBtn = document.getElementById('selectBtn');
  const manageBtn = document.getElementById('manageBtn');
  const statusMessage = document.getElementById('statusMessage');

  // Load global enabled state
  const { filtersEnabled = true } = await chrome.storage.local.get('filtersEnabled');
  globalToggle.checked = filtersEnabled;

  // Load stats
  const { filters = [] } = await chrome.storage.local.get('filters');
  document.getElementById('totalFilters').textContent = filters.length;

  let currentDomain = '';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      const url = new URL(tab.url);
      currentDomain = url.hostname;
      const domainFilters = filters.filter(f => f.domain === currentDomain && f.enabled !== false);
      document.getElementById('domainFilters').textContent = domainFilters.length;

      // Get hidden element count from page
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => document.querySelectorAll('[data-safespace-hidden]').length
        });
        if (results && results[0]) {
          document.getElementById('hiddenCount').textContent = results[0].result || 0;
        }
      } catch (e) {
        // Can't inject into this page
        document.getElementById('hiddenCount').textContent = '-';
      }

      // Disable select button on non-injectable pages
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('about:') || tab.url.startsWith('chrome-extension://')) {
        selectBtn.disabled = true;
      }
    }
  } catch (e) {
    // ignore
  }

  // Global toggle
  globalToggle.addEventListener('change', async () => {
    const enabled = globalToggle.checked;
    await chrome.storage.local.set({ filtersEnabled: enabled });

    // Notify all tabs to reapply or remove filters
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: enabled ? 'enableFilters' : 'disableFilters'
        });
      } catch (e) {
        // Tab may not have content script
      }
    }

    showStatus(enabled ? 'Filters enabled' : 'Filters disabled', 'success');
  });

  // Select element button
  selectBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    // Send message to background to start selection
    await chrome.runtime.sendMessage({ action: 'startSelectionFromPopup', tabId: tab.id });
    window.close();
  });

  // Manage filters button
  manageBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  function showStatus(text, type) {
    statusMessage.textContent = text;
    statusMessage.className = `status-message ${type}`;
    setTimeout(() => {
      statusMessage.className = 'status-message hidden';
    }, 2000);
  }
});
