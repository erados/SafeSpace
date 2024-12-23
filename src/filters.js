async function saveFilter(filter) {
  try {
    const { filters = [] } = await chrome.storage.local.get('filters');
    filters.push(filter);
    await chrome.storage.local.set({ filters });
    
    // 필터 저장 후 즉시 적용
    await applyNewFilter(filter);
    
    return true;
  } catch (error) {
    throw new Error('필터 저장 중 오류가 발생했습니다: ' + error.message);
  }
}


// 필터 적용 함수
function applyFilters(filters) {
  // 기존 테두리 모두 제거
  document.querySelectorAll('[style*="outline"]').forEach(el => {
    el.style.outline = '';
  });
  document.querySelectorAll('[data-highlight]').forEach(el => {
    el.removeAttribute('data-highlight');
  });

  // CSS 스타일 생성
  const style = document.createElement('style');
  style.id = 'safespace-filters';
  
  // 각 필에 대한 CSS 규칙 생성
  const cssRules = filters.map(filter => {
    return `
      ${filter.selector}:has(:contains("${filter.filterText}")) {
        display: none !important;
      }
    `;
  }).join('\n');
  
  style.textContent = cssRules;
  document.head.appendChild(style);
  
  // 텍스트 노드를 포함한 요소 찾기 및 숨기기
  filters.forEach(filter => {
    const elements = document.querySelectorAll(filter.selector);
    elements.forEach(element => {
      if (element.textContent.toLowerCase().includes(filter.filterText.toLowerCase())) {
        element.style.display = 'none';
      }
    });
  });
  
  // 새로운 요소에 대한 감시
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === 1) { // 요소 노드인 경우
          filters.forEach(filter => {
            if (node.matches(filter.selector) && 
                node.textContent.toLowerCase().includes(filter.filterText.toLowerCase())) {
              node.style.display = 'none';
            }
          });
        }
      });
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // 필터 적용 상태 반환
  return {
    filterCount: filters.length,
    appliedAt: new Date().toISOString()
  };
}

// 필터 저장 후 즉시 적용하는 함수 추가
function applyNewFilter(filter) {
  return chrome.scripting.executeScript({
    target: { tabId: filter.tabId },
    func: applyFilterToPage,
    args: [filter]
  });
}

// 페이지에서 실행될 필터 적용 함수
function applyFilterToPage(filter) {
  const elements = document.querySelectorAll(filter.selector);
  elements.forEach(element => {
    if (element.textContent.toLowerCase().includes(filter.filterText.toLowerCase())) {
      element.style.display = 'none';
    }
  });
  
  // 동적 콘텐츠를 위한 옵저버 설정
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === 1 && node.matches(filter.selector)) {
          if (node.textContent.toLowerCase().includes(filter.filterText.toLowerCase())) {
            node.style.display = 'none';
          }
        }
      });
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  return true;
}