document.addEventListener('DOMContentLoaded', async () => {
  const filterList = document.getElementById('filterList');
  const clearAllBtn = document.getElementById('clearAll');
  
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
          <button class="delete-btn" data-index="${index}">삭제</button>
        </div>
      `)
      .join('');
  }
  
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