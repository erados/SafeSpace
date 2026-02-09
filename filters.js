document.addEventListener('DOMContentLoaded', async () => {
  const filterList = document.getElementById('filterList');
  const clearAllBtn = document.getElementById('clearAll');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const importFile = document.getElementById('importFile');
  const searchBox = document.getElementById('searchBox');
  const sortSelect = document.getElementById('sortSelect');

  // i18n
  const i18n = (key, subs) => chrome.i18n.getMessage(key, subs) || key;
  document.getElementById('savedFilterListTitle').textContent = i18n('savedFilterList');
  exportBtn.textContent = i18n('export');
  importBtn.textContent = i18n('import');
  clearAllBtn.textContent = i18n('deleteAll');
  searchBox.placeholder = i18n('searchFilters') || 'Search filters...';

  function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast ${type} show`;
    setTimeout(() => { toast.className = 'toast'; }, 3000);
  }

  function sanitizeFilter(filter) {
    return {
      selector: filter.selector,
      fullPath: filter.fullPath,
      domain: filter.domain,
      filterText: filter.filterText,
      enabled: filter.enabled !== false,
      timestamp: filter.timestamp || Date.now()
    };
  }

  let allFilters = [];
  const collapsedDomains = new Set();

  async function loadFilters() {
    const { filters = [] } = await chrome.storage.local.get('filters');
    // Ensure all filters have enabled field
    allFilters = filters.map(f => ({ ...f, enabled: f.enabled !== false }));
    renderFilters();
  }

  function renderFilters() {
    const query = searchBox.value.toLowerCase().trim();
    const sort = sortSelect.value;

    let filtered = allFilters.map((f, i) => ({ ...f, _origIndex: i }));

    // Search
    if (query) {
      filtered = filtered.filter(f =>
        f.domain.toLowerCase().includes(query) ||
        f.filterText.toLowerCase().includes(query) ||
        f.selector.toLowerCase().includes(query)
      );
    }

    // Sort
    switch (sort) {
      case 'newest': filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); break;
      case 'oldest': filtered.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)); break;
      case 'domain': filtered.sort((a, b) => a.domain.localeCompare(b.domain)); break;
      case 'text': filtered.sort((a, b) => a.filterText.localeCompare(b.filterText)); break;
    }

    // Stats
    document.getElementById('statTotal').textContent = allFilters.length;
    document.getElementById('statActive').textContent = allFilters.filter(f => f.enabled).length;
    const domains = new Set(allFilters.map(f => f.domain));
    document.getElementById('statDomains').textContent = domains.size;

    if (filtered.length === 0) {
      filterList.innerHTML = `
        <div class="no-filters">
          <div class="emoji">🛡️</div>
          ${query ? (i18n('noSearchResults') || 'No filters match your search') : i18n('noFiltersSaved')}
        </div>
      `;
      return;
    }

    // Group by domain
    const groups = new Map();
    filtered.forEach(f => {
      if (!groups.has(f.domain)) groups.set(f.domain, []);
      groups.get(f.domain).push(f);
    });

    let html = '';
    for (const [domain, domainFilters] of groups) {
      const isCollapsed = collapsedDomains.has(domain);
      html += `
        <div class="domain-group">
          <div class="domain-header" data-domain="${domain}">
            <span class="domain-name">${domain}</span>
            <span class="domain-count">${domainFilters.length}</span>
            <span class="domain-arrow ${isCollapsed ? 'collapsed' : ''}">▼</span>
          </div>
          <div class="domain-filters ${isCollapsed ? 'collapsed' : ''}">
      `;

      for (const filter of domainFilters) {
        const idx = filter._origIndex;
        html += `
          <div class="filter-item ${filter.enabled ? '' : 'disabled'}" data-index="${idx}">
            <label class="filter-toggle">
              <input type="checkbox" class="toggle-cb" data-index="${idx}" ${filter.enabled ? 'checked' : ''}>
              <span class="slider"></span>
            </label>
            <div class="filter-info">
              <div class="filter-text-display">"${escHtml(filter.filterText)}"</div>
              <div class="filter-meta">
                <code>${escHtml(truncate(filter.selector, 60))}</code>
                <span>${filter.timestamp ? new Date(filter.timestamp).toLocaleDateString() : ''}</span>
              </div>
            </div>
            <div class="filter-actions">
              <button class="share-btn" data-index="${idx}">${i18n('share')}</button>
              <button class="delete-btn" data-index="${idx}">${i18n('delete')}</button>
            </div>
          </div>
        `;
      }

      html += '</div></div>';
    }

    filterList.innerHTML = html;
  }

  function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function truncate(s, n) {
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  // Search & sort
  searchBox.addEventListener('input', renderFilters);
  sortSelect.addEventListener('change', renderFilters);

  // Domain collapse toggle
  filterList.addEventListener('click', (e) => {
    const header = e.target.closest('.domain-header');
    if (header) {
      const domain = header.dataset.domain;
      if (collapsedDomains.has(domain)) collapsedDomains.delete(domain);
      else collapsedDomains.add(domain);
      renderFilters();
    }
  });

  // Filter toggle
  filterList.addEventListener('change', async (e) => {
    if (e.target.classList.contains('toggle-cb')) {
      const index = parseInt(e.target.dataset.index);
      const enabled = e.target.checked;
      allFilters[index].enabled = enabled;
      await chrome.storage.local.set({ filters: allFilters });
      renderFilters();
    }
  });

  // Share
  filterList.addEventListener('click', async (e) => {
    if (e.target.classList.contains('share-btn')) {
      const index = parseInt(e.target.dataset.index);
      const shareableFilter = sanitizeFilter(allFilters[index]);
      try {
        await navigator.clipboard.writeText(JSON.stringify(shareableFilter));
        showToast(i18n('filterCopiedToClipboard'));
      } catch (error) {
        const textarea = document.createElement('textarea');
        textarea.value = JSON.stringify(shareableFilter);
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast(i18n('filterCopiedToClipboard'));
      }
    }
  });

  // Delete
  filterList.addEventListener('click', async (e) => {
    if (e.target.classList.contains('delete-btn')) {
      const index = parseInt(e.target.dataset.index);
      allFilters.splice(index, 1);
      await chrome.storage.local.set({ filters: allFilters });
      renderFilters();
      showToast(i18n('filterDeleted') || 'Filter deleted');
    }
  });

  // Export
  exportBtn.addEventListener('click', async () => {
    if (allFilters.length === 0) {
      showToast(i18n('noFiltersSaved'), 'error');
      return;
    }
    const shareableFilters = allFilters.map(sanitizeFilter);
    const blob = new Blob([JSON.stringify(shareableFilters, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `safespace-filters-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`${i18n('export')}: ${allFilters.length} filters`);
  });

  // Import
  importBtn.addEventListener('click', () => importFile.click());

  importFile.addEventListener('change', async (e) => {
    try {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      let importedFilters = JSON.parse(text);
      if (!Array.isArray(importedFilters)) importedFilters = [importedFilters];

      let added = 0;
      importedFilters.forEach(filter => {
        if (!filter.selector || !filter.domain || !filter.filterText) return;
        const sanitized = sanitizeFilter(filter);
        const isDuplicate = allFilters.some(f =>
          f.domain === sanitized.domain &&
          f.selector === sanitized.selector &&
          f.filterText === sanitized.filterText
        );
        if (!isDuplicate) {
          allFilters.push(sanitized);
          added++;
        }
      });

      await chrome.storage.local.set({ filters: allFilters });
      renderFilters();
      showToast(i18n('filtersImported', [added.toString()]));
    } catch (error) {
      showToast(i18n('filterImportFailed') + ': ' + error.message, 'error');
    }
    importFile.value = '';
  });

  // Clear all
  clearAllBtn.addEventListener('click', async () => {
    if (!confirm(i18n('confirmDeleteAllFilters'))) return;
    allFilters = [];
    await chrome.storage.local.set({ filters: [] });
    renderFilters();
    showToast(i18n('allFiltersDeleted') || 'All filters deleted');
  });

  // Initial load
  loadFilters();
});
