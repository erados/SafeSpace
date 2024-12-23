document.addEventListener('DOMContentLoaded', async () => {
  const filterList = document.getElementById('filterList');
  const clearAllBtn = document.getElementById('clearAll');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const importFile = document.getElementById('importFile');
  
  exportBtn.textContent = chrome.i18n.getMessage("export");
  importBtn.textContent = chrome.i18n.getMessage("import");
  
  async function loadFilters() {
    const { filters = [] } = await chrome.storage.local.get('filters');
    
    if (filters.length === 0) {
      filterList.innerHTML = `
        <div class="no-filters">
          ${chrome.i18n.getMessage("noFiltersSaved")}
        </div>
      `;
      return;
    }
    
    filterList.innerHTML = filters
      .sort((a, b) => b.timestamp - a.timestamp)
      .map((filter, index) => `
        <div class="filter-item" data-index="${index}">
          <div><strong>${chrome.i18n.getMessage("domain")}:</strong> ${filter.domain}</div>
          <div><strong>${chrome.i18n.getMessage("selector")}:</strong> ${filter.selector}</div>
          <div><strong>${chrome.i18n.getMessage("filterText")}:</strong> ${filter.filterText}</div>
          <div class="timestamp">
            ${new Date(filter.timestamp).toLocaleString()}
          </div>
          <div class="filter-share">
            <button class="share-btn" data-index="${index}">${chrome.i18n.getMessage("share")}</button>
            <button class="delete-btn" data-index="${index}">${chrome.i18n.getMessage("delete")}</button>
          </div>
        </div>
      `)
      .join('');
  }
  
  // 필터 공유 시 필수 필드만 포함하는 함수 추가
  function sanitizeFilter(filter) {
    return {
      selector: filter.selector,
      fullPath: filter.fullPath,
      domain: filter.domain,
      filterText: filter.filterText,
      timestamp: Date.now() // 새로운 타임스탬프 부여
    };
  }
  
  // 필터 내보내기
  exportBtn.addEventListener('click', async () => {
    const { filters = [] } = await chrome.storage.local.get('filters');
    // 내보낼 때도 필수 필드만 포함
    const shareableFilters = filters.map(sanitizeFilter);
    const blob = new Blob([JSON.stringify(shareableFilters, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `safespace-filters-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
  
  // 필터 가져오기
  importBtn.addEventListener('click', () => {
    importFile.click();
  });
  
  importFile.addEventListener('change', async (e) => {
    try {
      const file = e.target.files[0];
      const text = await file.text();
      let importedFilters = JSON.parse(text);
      
      // 단일 필터인 경우 배열로 변환
      if (!Array.isArray(importedFilters)) {
        importedFilters = [importedFilters];
      }
      
      const { filters = [] } = await chrome.storage.local.get('filters');
      const newFilters = [...filters];
      
      // 중복 체크 및 필터 정제
      importedFilters.forEach(filter => {
        // 필수 필드 확인
        if (!filter.selector || !filter.domain || !filter.filterText) {
          throw new Error(chrome.i18n.getMessage("invalidFilterFormat"));
        }
        
        const sanitizedFilter = sanitizeFilter(filter);
        const isDuplicate = newFilters.some(f => 
          f.domain === sanitizedFilter.domain && 
          f.selector === sanitizedFilter.selector && 
          f.filterText === sanitizedFilter.filterText
        );
        
        if (!isDuplicate) {
          newFilters.push(sanitizedFilter);
        }
      });
      
      await chrome.storage.local.set({ filters: newFilters });
      await loadFilters();
      alert(chrome.i18n.getMessage("filtersImported", [importedFilters.length]));
    } catch (error) {
      alert(chrome.i18n.getMessage("filterImportFailed") + ': ' + error.message);
    }
    importFile.value = '';
  });
  
  // 필터 공유
  filterList.addEventListener('click', async (e) => {
    if (e.target.classList.contains('share-btn')) {
      const index = parseInt(e.target.dataset.index);
      const { filters = [] } = await chrome.storage.local.get('filters');
      filters.sort((a, b) => b.timestamp - a.timestamp);
      const filter = filters[index];
      
      // 필수 필드만 포함하여 공유
      const shareableFilter = sanitizeFilter(filter);
      const filterString = JSON.stringify(shareableFilter);
      
      try {
        await navigator.clipboard.writeText(filterString);
        alert(chrome.i18n.getMessage("filterCopiedToClipboard"));
      } catch (error) {
        console.error(chrome.i18n.getMessage("copyFailed") + ':', error);
        const textarea = document.createElement('textarea');
        textarea.value = filterString;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        alert(chrome.i18n.getMessage("filterCopiedToClipboard"));
      }
    }
  });
  
  // 개별 필터 삭제
  filterList.addEventListener('click', async (e) => {
    if (e.target.classList.contains('delete-btn')) {
      const index = parseInt(e.target.dataset.index);
      const { filters = [] } = await chrome.storage.local.get('filters');
      filters.sort((a, b) => b.timestamp - a.timestamp);
      filters.splice(index, 1);
      await chrome.storage.local.set({ filters });
      await loadFilters();
    }
  });
  
  // 전체 삭제
  clearAllBtn.addEventListener('click', async () => {
    if (confirm(chrome.i18n.getMessage("confirmDeleteAllFilters"))) {
      await chrome.storage.local.set({ filters: [] });
      await loadFilters();
    }
  });
  
  // 초기 로드
  loadFilters();
  
  // 제목 설정
  document.getElementById('savedFilterListTitle').textContent = chrome.i18n.getMessage("savedFilterList");
  
  // 버튼 텍스트 설정
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const messageName = element.getAttribute('data-i18n');
    element.textContent = chrome.i18n.getMessage(messageName);
  });
}); 