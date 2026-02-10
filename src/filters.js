async function saveFilter(filter) {
  try {
    const { filters = [] } = await chrome.storage.local.get('filters');
    // Don't persist tabId
    const { tabId, ...cleanFilter } = filter;
    cleanFilter.enabled = true;
    filters.push(cleanFilter);
    await chrome.storage.local.set({ filters });

    // Apply immediately if tabId available
    if (tabId) {
      await applyNewFilter({ ...cleanFilter, tabId });
    }
    return true;
  } catch (error) {
    throw new Error('Filter save error: ' + error.message);
  }
}

function applyFilters(filters) {
  // Disconnect early-filter observer (early-filter.js) now that main filter takes over
  if (window.__safespaceEarlyObserver) {
    window.__safespaceEarlyObserver.disconnect();
    window.__safespaceEarlyObserver = null;
  }

  // Clean up previous state
  document.querySelectorAll('[data-safespace-hidden]').forEach(el => {
    el.style.display = '';
    el.removeAttribute('data-safespace-hidden');
  });

  if (window.__safespaceObserver) {
    window.__safespaceObserver.disconnect();
    window.__safespaceObserver = null;
  }

  // Only apply enabled filters
  const activeFilters = filters.filter(f => f.enabled !== false);
  if (activeFilters.length === 0) return { filterCount: 0 };

  // Apply filters
  activeFilters.forEach(filter => {
    try {
      const elements = document.querySelectorAll(filter.selector);
      elements.forEach(element => {
        if (element.textContent.toLowerCase().includes(filter.filterText.toLowerCase())) {
          element.style.display = 'none';
          element.setAttribute('data-safespace-hidden', 'true');
        }
      });
    } catch (e) {
      console.warn('SafeSpace: invalid selector', filter.selector, e);
    }
  });

  // Single observer for all filters
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        activeFilters.forEach(filter => {
          try {
            if (node.matches && node.matches(filter.selector) &&
                node.textContent.toLowerCase().includes(filter.filterText.toLowerCase())) {
              node.style.display = 'none';
              node.setAttribute('data-safespace-hidden', 'true');
            }
            if (node.querySelectorAll) {
              node.querySelectorAll(filter.selector).forEach(child => {
                if (child.textContent.toLowerCase().includes(filter.filterText.toLowerCase())) {
                  child.style.display = 'none';
                  child.setAttribute('data-safespace-hidden', 'true');
                }
              });
            }
          } catch (e) { /* invalid selector */ }
        });
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  window.__safespaceObserver = observer;

  return { filterCount: activeFilters.length, appliedAt: new Date().toISOString() };
}

function applyNewFilter(filter) {
  return chrome.scripting.executeScript({
    target: { tabId: filter.tabId },
    func: applyFilterToPage,
    args: [filter]
  });
}

function applyFilterToPage(filter) {
  if (filter.enabled === false) return true;

  try {
    const elements = document.querySelectorAll(filter.selector);
    elements.forEach(element => {
      if (element.textContent.toLowerCase().includes(filter.filterText.toLowerCase())) {
        element.style.display = 'none';
        element.setAttribute('data-safespace-hidden', 'true');
      }
    });
  } catch (e) {
    console.warn('SafeSpace: invalid selector', filter.selector, e);
  }

  if (!window.__safespaceObserver) {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          try {
            if (node.matches && node.matches(filter.selector) &&
                node.textContent.toLowerCase().includes(filter.filterText.toLowerCase())) {
              node.style.display = 'none';
              node.setAttribute('data-safespace-hidden', 'true');
            }
          } catch (e) { /* ignore */ }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.__safespaceObserver = observer;
  }

  return true;
}
