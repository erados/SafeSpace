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

  // Remove any previously injected safespace style element
  const oldStyle = document.getElementById('safespace-filters');
  if (oldStyle) oldStyle.remove();

  // Disconnect any existing SafeSpace observer
  if (window.__safespaceObserver) {
    window.__safespaceObserver.disconnect();
    window.__safespaceObserver = null;
  }

  // JS-based text matching to hide elements (no CSS :contains())
  filters.forEach(filter => {
    const elements = document.querySelectorAll(filter.selector);
    elements.forEach(element => {
      if (element.textContent.toLowerCase().includes(filter.filterText.toLowerCase())) {
        element.style.display = 'none';
      }
    });
  });
  
  // 새로운 요소에 대한 감시 (single observer for all filters)
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === 1) { // 요소 노드인 경우
          filters.forEach(filter => {
            if (node.matches && node.matches(filter.selector) && 
                node.textContent.toLowerCase().includes(filter.filterText.toLowerCase())) {
              node.style.display = 'none';
            }
            // Also check descendants of added nodes
            if (node.querySelectorAll) {
              node.querySelectorAll(filter.selector).forEach(child => {
                if (child.textContent.toLowerCase().includes(filter.filterText.toLowerCase())) {
                  child.style.display = 'none';
                }
              });
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

  // Store observer reference for cleanup
  window.__safespaceObserver = observer;
  
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
  
  // Reuse existing observer if available, otherwise create one
  if (!window.__safespaceObserver) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1 && node.matches && node.matches(filter.selector)) {
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

    window.__safespaceObserver = observer;
  }

  return true;
}
