document.addEventListener('DOMContentLoaded', async () => {
  const filterList = document.getElementById('filterList');
  const clearAllBtn = document.getElementById('clearAll');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const importFile = document.getElementById('importFile');
  
  async function loadFilters() {
    const { filters = [] } = await chrome.storage.local.get('filters');
    
    if (filters.length === 0) {
      filterList.innerHTML = `
        <div class="no-filters">
          저장된 필터가 없습니다.
        </div>
      `;
      return;
    }
    
    filterList.innerHTML = filters
      .sort((a, b) => b.timestamp - a.timestamp)
      .map((filter, index) => `
        <div class="filter-item" data-index="${index}">
          <div><strong>도메인:</strong> ${filter.domain}</div>
          <div><strong>선택자:</strong> ${filter.selector}</div>
          <div><strong>필터 텍스트:</strong> ${filter.filterText}</div>
          <div class="timestamp">
            ${new Date(filter.timestamp).toLocaleString()}
          </div>
          <div class="filter-share">
            <button class="share-btn" data-index="${index}">공유</button>
            <button class="delete-btn" data-index="${index}">삭제</button>
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
          throw new Error('잘못된 필터 형식입니다.');
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
      alert(`${importedFilters.length}개의 필터를 가져왔습니다.`);
    } catch (error) {
      alert('필터 가져오기 실패: ' + error.message);
    }
    importFile.value = '';
  });
  
  // 필터 공유
  filterList.addEventListener('click', async (e) => {
    if (e.target.classList.contains('share-btn')) {
      const index = parseInt(e.target.dataset.index);
      const { filters = [] } = await chrome.storage.local.get('filters');
      const filter = filters[index];
      
      // 필수 필드만 포함하여 공유
      const shareableFilter = sanitizeFilter(filter);
      const filterString = JSON.stringify(shareableFilter);
      
      try {
        await navigator.clipboard.writeText(filterString);
        alert('필터가 클립보드에 복사되었습니다.');
      } catch (error) {
        console.error('클립보드 복사 실패:', error);
        const textarea = document.createElement('textarea');
        textarea.value = filterString;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        alert('필터가 클립보드에 복사되었습니다.');
      }
    }
  });
  
  // 개별 필터 삭제
  filterList.addEventListener('click', async (e) => {
    if (e.target.classList.contains('delete-btn')) {
      const index = parseInt(e.target.dataset.index);
      const { filters = [] } = await chrome.storage.local.get('filters');
      
      filters.splice(index, 1);
      await chrome.storage.local.set({ filters });
      await loadFilters();
    }
  });
  
  // 전체 삭제
  clearAllBtn.addEventListener('click', async () => {
    if (confirm('모든 필터를 삭제하시겠습니까?')) {
      await chrome.storage.local.set({ filters: [] });
      await loadFilters();
    }
  });
  
  // 초기 로드
  loadFilters();
}); 