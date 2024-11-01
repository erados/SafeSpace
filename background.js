let isSelecting = false;

// background.js 파일 맨 위에 추가
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'viewFilters',
    title: '필터 목록 보기',
    contexts: ['action']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => { 
  if (info.menuItemId === 'viewFilters') {
    chrome.runtime.openOptionsPage();
  }
});

// 액션 클릭 핸들러
chrome.action.onClicked.addListener(async (tab) => {
  if (isSelecting) {
    // 선택 모드 종료
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: cleanupSelection
      });
    } catch (error) {
      console.error('Cleanup script execution failed:', error);
    }
    
    isSelecting = false;
    // 필터 수를 다시 표시
    updateFilterBadge(tab.id);
  } else {
    // 선택 모드 시작
    isSelecting = true;
    await chrome.action.setBadgeText({ 
      text: 'ON',
      tabId: tab.id 
    });
    await chrome.action.setBadgeBackgroundColor({ 
      color: '#4CAF50',
      tabId: tab.id
    });
    await chrome.action.setTitle({ 
      title: '선택 모드 활성화됨',
      tabId: tab.id
    });
    
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: startSelection
      });
    } catch (error) {
      console.error('스크립트 실행 중 오류:', error);
      isSelecting = false;
      await chrome.action.setBadgeText({ 
        text: 'ERR',
        tabId: tab.id
      });
      await chrome.action.setBadgeBackgroundColor({ 
        color: '#F44336',
        tabId: tab.id
      });
    }
  }
});

// 필터 수 업데이트 함수
async function updateFilterBadge(tabId) {
  try {
    // 선택 모드가 활성화되어 있다면 업데이트하지 않음
    if (isSelecting) return;

    const tab = await chrome.tabs.get(tabId);
    const url = new URL(tab.url);
    const domain = url.hostname;
    
    const { filters = [] } = await chrome.storage.local.get('filters');
    const domainFilters = filters.filter(f => f.domain === domain);
    
    if (domainFilters.length > 0) {
      await chrome.action.setBadgeText({ 
        text: domainFilters.length.toString(),
        tabId: tabId
      });
      await chrome.action.setBadgeBackgroundColor({ 
        color: '#2196F3',
        tabId: tabId
      });
      await chrome.action.setTitle({ 
        title: `활성 필터: ${domainFilters.length}개`,
        tabId: tabId
      });
    } else {
      await chrome.action.setBadgeText({ 
        text: '',
        tabId: tabId
      });
      await chrome.action.setTitle({ 
        title: '요소 선택 시작',
        tabId: tabId
      });
    }
  } catch (error) {
    console.error('배지 업데이트 중 오류:', error);
  }
}

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

function startSelection() {
  // UI 컨테이너 생성
  const uiContainer = document.createElement('div');
  uiContainer.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 10px;
    border-radius: 5px;
    z-index: 10000;
    max-width: 300px;
    max-height: 400px;
    overflow-y: auto;
  `;
  document.body.appendChild(uiContainer);
  
  // 로그 영역 생성
  const logArea = document.createElement('div');
  uiContainer.appendChild(logArea);
  
  let isSelecting = true;
  let hoveredElement = null;
  let selectedElements = null;
  
  function getElementPath(element) {
    const path = [];
    let current = element;
    
    while (current && current !== document.body) {
      let identifier = current.tagName.toLowerCase();
      if (current.className && typeof current.className === 'string' && current.className.trim()) {
        identifier += '.' + current.className.trim().split(/\s+/).join('.');
      }
      path.unshift(identifier);
      current = current.parentElement;
    }
    
    return path;
  }
  
  function findSimilarElements(element) {
    const elementPath = getElementPath(element);
    const selector = elementPath[elementPath.length - 1];
    const elements = Array.from(document.querySelectorAll(selector));
    
    const similarElements = elements.filter(el => {
      const currentPath = getElementPath(el);
      return JSON.stringify(currentPath) === JSON.stringify(elementPath);
    });
    
    return {
      selector,
      fullPath: elementPath.join(' > '),
      elements: similarElements
    };
  }
  
  function updateLog(result) {
    logArea.innerHTML = '';
    
    const logElement = document.createElement('div');
    logElement.style.marginBottom = '10px';
    logElement.innerHTML = `
      <div>선택된 요소: ${result.selector}</div>
      <div>전체 경로: ${result.fullPath}</div>
      <div>비슷한 요소 수: ${result.elements.length}개</div>
    `;
    logArea.appendChild(logElement);
  }
  
  function showFilterUI(result) {
    logArea.innerHTML = '';
    
    // 선택 정보 표시
    const selectionInfo = document.createElement('div');
    selectionInfo.innerHTML = `
      <div style="margin-bottom: 15px;">
        <div>선택된 요소: ${result.selector}</div>
        <div>전체 경로: ${result.fullPath}</div>
        <div>발견된 비슷한 요소: ${result.elements.length}개</div>
      </div>
    `;
    logArea.appendChild(selectionInfo);
    
    // 필터 텍스트 입력 UI
    const filterUI = document.createElement('div');
    filterUI.style.cssText = `
      margin-bottom: 15px;
      width: 100%;
      box-sizing: border-box;
    `;
    
    filterUI.innerHTML = `
      <div style="margin-bottom: 10px;">필터링할 텍스트 입력:</div>
      <input type="text" id="filterText" style="
        width: 100%;
        padding: 8px;
        border: 1px solid #ccc;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.9);
        color: black;
        box-sizing: border-box;
        font-size: 14px;
      ">
    `;
    logArea.appendChild(filterUI);

    // 입력 필드에 포커스
    const filterInput = document.getElementById('filterText');
    filterInput.focus();

    // 엔터 키 이벤트 처리
    filterInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        previewButton.click();
      }
    });

    // 미리보기 버튼
    const previewButton = document.createElement('button');
    previewButton.textContent = '미리보기';
    previewButton.style.cssText = `
      margin-top: 10px;
      padding: 8px;
      background: #2196F3;
      border: none;
      border-radius: 4px;
      color: white;
      cursor: pointer;
      width: 100%;
      font-size: 14px;
      transition: background-color 0.2s;
    `;
    previewButton.addEventListener('mouseover', () => {
      previewButton.style.background = '#1976D2';
    });
    previewButton.addEventListener('mouseout', () => {
      previewButton.style.background = '#2196F3';
    });
    logArea.appendChild(previewButton);

    // 미리보기 영역
    const previewArea = document.createElement('div');
    previewArea.style.marginTop = '15px';
    logArea.appendChild(previewArea);

    // 저장 버튼 (처음에는 숨김)
    const saveButton = document.createElement('button');
    saveButton.textContent = '필터 저장';
    saveButton.style.cssText = `
      margin-top: 10px;
      padding: 8px;
      background: #4CAF50;
      border: none;
      border-radius: 4px;
      color: white;
      cursor: pointer;
      width: 100%;
      display: none;
      font-size: 14px;
      transition: background-color 0.2s;
    `;
    saveButton.addEventListener('mouseover', () => {
      saveButton.style.background = '#388E3C';
    });
    saveButton.addEventListener('mouseout', () => {
      saveButton.style.background = '#4CAF50';
    });
    logArea.appendChild(saveButton);
    
    // 미리보기 버튼 클릭 핸들러
    previewButton.addEventListener('click', () => {
      const filterText = document.getElementById('filterText').value.trim();
      if (!filterText) {
        alert('필터링할 텍스트를 입력해주세요.');
        return;
      }
      
      const filteredElements = result.elements.filter(el => 
        el.textContent.toLowerCase().includes(filterText.toLowerCase())
      );
      
      // 미리보기 표시
      previewArea.innerHTML = `
        <div style="margin-bottom: 10px;">
          필터링될 요소: ${filteredElements.length}개
        </div>
      `;
      
      // 요소 강조 및 미리보기
      filteredElements.forEach((el, index) => {
        el.style.outline = '2px solid #FF5722';
        
        const preview = document.createElement('div');
        preview.style.cssText = `
          margin: 5px 0;
          padding: 5px;
          border: 1px solid #666;
          border-radius: 3px;
          font-size: 12px;
          background: rgba(255, 82, 33, 0.1);
        `;
        preview.textContent = `${index + 1}. ${el.textContent.trim().substring(0, 50)}...`;
        previewArea.appendChild(preview);
      });
      
      saveButton.style.display = 'block';
    });
    
    // 저장 버튼 클릭 핸들러
    saveButton.addEventListener('click', async () => {
      const filterText = document.getElementById('filterText').value.trim();
      const filter = {
        selector: result.selector,
        fullPath: result.fullPath,
        domain: window.location.hostname,
        filterText: filterText,
        timestamp: Date.now()
      };
      
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'saveFilter',
          filter: filter,
          tabId: await new Promise(resolve => 
            chrome.runtime.sendMessage({ action: 'getCurrentTabId' }, response => 
              resolve(response.tabId)
            )
          )
        });
        
        if (response.success) {
          // 모든 테두리 제거
          document.querySelectorAll('[style*="outline"]').forEach(el => {
            el.style.outline = '';
            el.removeAttribute('data-hover');
            el.removeAttribute('data-preview');
          });

          // 성공 메시지 표시
          logArea.innerHTML = `
            <div style="color: #4CAF50;">
              필터가 성공적으로 저장되었습니다!
            </div>
          `;

          setTimeout(() => {
            if (uiContainer && uiContainer.parentNode) {
              uiContainer.remove();
            }
            chrome.runtime.sendMessage({ action: 'filterSaved' });
          }, 1000);

          document.removeEventListener('mouseover', handleMouseOver);
          document.removeEventListener('click', handleClick, true);
        } else {
          throw new Error(response.error || '알 수 없는 오류가 발생했습니다.');
        }
      } catch (error) {
        console.error('필터 저장 중 오류:', error);
        logArea.innerHTML = `
          <div style="color: #F44336;">
            오류: ${error.message}
          </div>
        `;
      }
    });
  }
  
  // 마우스 오버 핸들러
  function handleMouseOver(e) {
    if (!isSelecting) return;
    
    if (hoveredElement) {
      hoveredElement.style.outline = '';
      hoveredElement.removeAttribute('data-hover');
    }
    
    hoveredElement = e.target;
    hoveredElement.style.outline = '2px solid green';
    hoveredElement.setAttribute('data-hover', 'true');
    
    const result = findSimilarElements(e.target);
    updateLog(result);
  }
  
  // 클릭 핸들러
  function handleClick(e) {
    if (!isSelecting) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const result = findSimilarElements(e.target);
    selectedElements = result;
    
    result.elements.forEach(el => {
      el.style.outline = '2px solid green';
    });
    
    showFilterUI(result);
    isSelecting = false;
    
    // 이벤트 리스너 제거
    document.removeEventListener('mouseover', handleMouseOver);
    document.removeEventListener('click', handleClick, true);
  }
  
  // 이벤트 리스너 등록
  document.addEventListener('mouseover', handleMouseOver);
  document.addEventListener('click', handleClick, true);
  
  // ESC 키 처리 수정
  document.addEventListener('keydown', async function(e) {
    if (e.key === 'Escape') {
      // 모든 테두리 제거
      document.querySelectorAll('[style*="outline"]').forEach(el => {
        el.style.outline = '';
        el.removeAttribute('data-hover');
        el.removeAttribute('data-preview');
      });

      // UI 컨테이너 제거
      if (uiContainer && uiContainer.parentNode) {
        uiContainer.remove();
      }

      // 이벤트 리스너 제거
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('click', handleClick, true);

      // background 스크립트에 선택 모드 종료 알림
      try {
        await chrome.runtime.sendMessage({ 
          action: 'selectionCanceled'
        });
      } catch (error) {
        console.error('메시지 전송 중 오류:', error);
      }
    }
  });

  function cleanup(keepPreview = false) {
    // 호버 효과 제거
    document.querySelectorAll('[style*="outline"][data-hover="true"]').forEach(el => {
      el.style.outline = '';
      el.removeAttribute('data-hover');
    });

    // 미리보기 유지 옵션이 false일 때만 미리보기 테두리 제거
    if (!keepPreview) {
      document.querySelectorAll('[style*="outline"][data-preview="true"]').forEach(el => {
        el.style.outline = '';
        el.removeAttribute('data-preview');
      });
    }

    // 이벤트 리스너 제거
    document.removeEventListener('mouseover', handleMouseOver);
    document.removeEventListener('click', handleClick, true);
  }

  // 아이콘 클릭으로 선택 모드 종료 시에도 cleanup 실행
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'stopSelection') {
      cleanup(false);
      uiContainer.remove();
    }
  });
}

// 페이지 로드 완료 시 필터 적용
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId === 0) {
    try {
      const { filters = [] } = await chrome.storage.local.get('filters');
      const url = new URL(details.url);
      const domain = url.hostname;
      
      const domainFilters = filters.filter(f => f.domain === domain);
      
      if (domainFilters.length > 0) {
        // 선택 모드가 아닐 때만 필터 수 표시
        if (!isSelecting) {
          updateFilterBadge(details.tabId);
        }
        
        await chrome.scripting.executeScript({
          target: { tabId: details.tabId },
          func: applyFilters,
          args: [domainFilters]
        });
      } else {
        if (!isSelecting) {
          await chrome.action.setBadgeText({ 
            text: '',
            tabId: details.tabId
          });
        }
      }
    } catch (error) {
      console.error('필터 적용 중 오류:', error);
    }
  }
});

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
  
  // 각 필터에 대한 CSS 규칙 생성
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

// 정리를 위한 새로운 함수
function cleanupSelection() {
  // 모든 테두리 제거
  document.querySelectorAll('[style*="outline"]').forEach(el => {
    el.style.outline = '';
    el.removeAttribute('data-hover');
    el.removeAttribute('data-preview');
  });

  // UI 컨테이너 제거
  const uiContainer = document.querySelector('div[style*="position: fixed"][style*="z-index: 10000"]');
  if (uiContainer) {
    uiContainer.remove();
  }

  // 이벤트 리스너 제거 (startSelection 함수에서 추가된 것들)
  document.removeEventListener('mouseover', handleMouseOver);
  document.removeEventListener('click', handleClick, true);
}

// ESC 키나 저장 완료 후 배지 업데이트
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'selectionCanceled' || message.action === 'filterSaved') {
    isSelecting = false;
    updateFilterBadge(sender.tab.id);
  }
});

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

// 필터 저장 메시지 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
        // 저장 후 즉시 필터 적용
        return applyNewFilter(filter);
      })
      .catch(error => {
        console.error('필터 저장/적용 중 오류:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});