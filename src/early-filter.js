// Runs at document_start to hide filtered content ASAP (prevents flash)
(async () => {
  try {
    const domain = location.hostname;
    if (!domain) return;

    const { filters = [], filtersEnabled = true } = await chrome.storage.local.get(['filters', 'filtersEnabled']);
    if (!filtersEnabled) return;

    const domainFilters = filters.filter(f => f.domain === domain && f.enabled !== false);
    if (domainFilters.length === 0) return;

    // Apply filters as soon as DOM elements appear
    function applyEarlyFilters(root) {
      domainFilters.forEach(filter => {
        try {
          const elements = root.querySelectorAll(filter.selector);
          elements.forEach(el => {
            if (el.getAttribute('data-safespace-hidden')) return;
            if (el.textContent.toLowerCase().includes(filter.filterText.toLowerCase())) {
              el.style.display = 'none';
              el.setAttribute('data-safespace-hidden', 'true');
            }
          });
        } catch (e) { /* invalid selector */ }
      });
    }

    // Watch for DOM changes and filter immediately
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          applyEarlyFilters(node.parentElement || node);
        }
      }
    });

    // Start observing as soon as documentElement exists
    if (document.documentElement) {
      observer.observe(document.documentElement, { childList: true, subtree: true });
    } else {
      // Fallback: wait for documentElement
      const docObserver = new MutationObserver(() => {
        if (document.documentElement) {
          docObserver.disconnect();
          observer.observe(document.documentElement, { childList: true, subtree: true });
        }
      });
      docObserver.observe(document, { childList: true });
    }

    // Store observer ref so main filter can take over
    window.__safespaceEarlyObserver = observer;
  } catch (e) {
    // Silently fail
  }
})();
