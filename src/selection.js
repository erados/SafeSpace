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
      let identifier = `${current.tagName.toLowerCase()}`;
      if (current.className && typeof current.className === 'string' && current.className.trim()) {
        identifier += `[class*='${current.className.trim().split(/\s+/).join(' ')}']`;
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
      <div>${chrome.i18n.getMessage("selectedElement")}: ${result.selector}</div>
      <div>${chrome.i18n.getMessage("foundSimilarElements")}: ${result.elements.length}</div>
    `;
    logArea.appendChild(logElement);
  }
  
  function showFilterUI(result) {
    logArea.innerHTML = '';
    
    // 선택 정보 표시
    const selectionInfo = document.createElement('div');
    selectionInfo.innerHTML = `
      <div style="margin-bottom: 15px;">
        <div>${chrome.i18n.getMessage("selectedElement")}: ${result.selector}</div>
        <div>${chrome.i18n.getMessage("foundSimilarElements")}: ${result.elements.length}</div>
      </div>
    `;
    logArea.appendChild(selectionInfo);
    
    // 상위 요소 선택 버튼 추가
    const parentButton = document.createElement('button');
    parentButton.textContent = chrome.i18n.getMessage("selectParentElement");
    parentButton.style.cssText = `
      margin-bottom: 15px;
      padding: 8px;
      background: #FF9800;
      border: none;
      border-radius: 4px;
      color: white;
      cursor: pointer;
      width: 100%;
      font-size: 14px;
      transition: background-color 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 36px;
    `;
    parentButton.addEventListener('mouseover', () => {
      parentButton.style.background = '#F57C00';
    });
    parentButton.addEventListener('mouseout', () => {
      parentButton.style.background = '#FF9800';
    });
    parentButton.addEventListener('click', () => {
      // 현재 선택된 요소의 부모 요소 찾기
      const currentElement = result.elements[0];
      if (currentElement && currentElement.parentElement) {
        // 기존 선택 효과 제거
        result.elements.forEach(el => {
          el.style.outline = '';
        });
        
        // 새로운 선택 결과 생성
        const newResult = findSimilarElements(currentElement.parentElement);
        selectedElements = newResult;
        
        // 새로운 선택 효과 적용
        newResult.elements.forEach(el => {
          el.style.outline = '2px solid green';
        });
        
        // UI 업데이트
        showFilterUI(newResult);
      }
    });
    logArea.appendChild(parentButton);

    // 필터 텍스트 입력 UI
    const filterUI = document.createElement('div');
    filterUI.style.cssText = `
      margin-bottom: 15px;
      width: 100%;
      box-sizing: border-box;
    `;
    
    filterUI.innerHTML = `
      <div style="margin-bottom: 10px;">${chrome.i18n.getMessage("enterFilterText")}:</div>
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
    previewButton.textContent = chrome.i18n.getMessage("preview");
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
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 36px;
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
    saveButton.textContent = chrome.i18n.getMessage("saveFilter");
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
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 36px;
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
        alert(chrome.i18n.getMessage("pleaseEnterFilterText"));
        return;
      }
      
      const filteredElements = result.elements.filter(el => 
        el.textContent.toLowerCase().includes(filterText.toLowerCase())
      );
      
      // 미리보기 표시
      previewArea.innerHTML = `
        <div style="margin-bottom: 10px;">
          ${chrome.i18n.getMessage("elementsFiltered")}: ${filteredElements.length}
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
              ${chrome.i18n.getMessage("filterSavedSuccessfully")}
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
            throw new Error(response.error || chrome.i18n.getMessage("unknownError"));
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
