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
    isSelecting = false;
    await chrome.action.setBadgeText({ text: '' });
    await chrome.action.setTitle({ title: '요소 선택 시작' });
  } else {
    isSelecting = true;
    await chrome.action.setBadgeText({ text: 'ON' });
    await chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    await chrome.action.setTitle({ title: '선택 모드 활성화됨' });
    
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: startSelection
      });
    } catch (error) {
      console.error('스크립트 실행 중 오류:', error);
      isSelecting = false;
      await chrome.action.setBadgeText({ text: 'ERR' });
      await chrome.action.setBadgeBackgroundColor({ color: '#F44336' });
    }
  }
});

// 필터 저장 메시지 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'saveFilter') {
    saveFilter(message.filter)
      .then(() => {
        sendResponse({ success: true });
        isSelecting = false;
        chrome.action.setBadgeText({ text: '' });
      })
      .catch(error => {
        console.error('필터 저장 중 오류:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

async function saveFilter(filter) {
  try {
    const { filters = [] } = await chrome.storage.local.get('filters');
    filters.push(filter);
    await chrome.storage.local.set({ filters });
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
    filterUI.innerHTML = `
      <div style="margin-bottom: 15px;">
        <div style="margin-bottom: 10px;">필터링할 텍스트 입력:</div>
        <input type="text" id="filterText" style="
          width: 100%;
          padding: 5px;
          border: 1px solid #ccc;
          border-radius: 3px;
          background: white;
          color: black;
        ">
      </div>
    `;
    logArea.appendChild(filterUI);
    
    // 미리보기 버튼
    const previewButton = document.createElement('button');
    previewButton.textContent = '미리보기';
    previewButton.style.cssText = `
      margin-top: 10px;
      padding: 5px 10px;
      background: #2196F3;
      border: none;
      border-radius: 3px;
      color: white;
      cursor: pointer;
      width: 100%;
    `;
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
      padding: 5px 10px;
      background: #4CAF50;
      border: none;
      border-radius: 3px;
      color: white;
      cursor: pointer;
      width: 100%;
      display: none;
    `;
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
          filter: filter
        });
        
        if (response.success) {
          logArea.innerHTML = `
            <div style="color: #4CAF50;">
              필터가 성공적으로 저장되었습니다!
            </div>
          `;
          
          setTimeout(() => {
            uiContainer.remove();
          }, 2000);
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
    }
    
    hoveredElement = e.target;
    hoveredElement.style.outline = '2px solid red';
    
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
  
  // ESC 키 처리
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      isSelecting = false;
      if (hoveredElement) {
        hoveredElement.style.outline = '';
      }
      uiContainer.remove();
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('click', handleClick, true);
    }
  });
}

// 페이지 로드 완료 시 필터 적용
chrome.webNavigation.onCompleted.addListener(async (details) => {
  // 프레임이 아닌 메인 페이지일 때만 실행
  if (details.frameId === 0) {
    try {
      const { filters = [] } = await chrome.storage.local.get('filters');
      const url = new URL(details.url);
      const domain = url.hostname;
      
      // 현재 도메인에 해당하는 필터만 선택
      const domainFilters = filters.filter(f => f.domain === domain);
      
      if (domainFilters.length > 0) {
        // 배지에 필터 수 표시
        chrome.action.setBadgeText({ 
          text: domainFilters.length.toString(),
          tabId: details.tabId
        });
        chrome.action.setBadgeBackgroundColor({ 
          color: '#4CAF50',
          tabId: details.tabId
        });
        
        // 필터 적용 스크립트 실행
        await chrome.scripting.executeScript({
          target: { tabId: details.tabId },
          func: applyFilters,
          args: [domainFilters]
        });
      } else {
        // 필터가 없으면 배지 제거
        chrome.action.setBadgeText({ 
          text: '',
          tabId: details.tabId
        });
      }
    } catch (error) {
      console.error('필터 적용 중 오류:', error);
    }
  }
});

// 필터 적용 함수
function applyFilters(filters) {
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