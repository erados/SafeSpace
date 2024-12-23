importScripts('src/filters.js');
importScripts('src/selection.js');

let isSelecting = false;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'viewFilters',
    title: chrome.i18n.getMessage("viewFilterList"),
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
      title: '${chrome.i18n.getMessage("startSelection")}',
      tabId: tab.id
    });
    
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: startSelection
      });
    } catch (error) {
      console.error('Error when script execution:', error);
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
        title: chrome.i18n.getMessage("activeFiltersCount", [domainFilters.length.toString()]),
        tabId: tabId
      });
    } else {
      await chrome.action.setBadgeText({ 
        text: '',
        tabId: tabId
      });
      await chrome.action.setTitle({ 
        title: chrome.i18n.getMessage("startElementSelection"),
        tabId: tabId
      });
    }
  } catch (error) {
    console.error('배지 업데이트 중 오류:', error);
  }
}

chrome.webNavigation.onCompleted.addListener(async (details) => {
// 페이지 로드 완료 시 필터 적용
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

// ESC 키나 저장 완료 후 배지 업데이트
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'selectionCanceled' || message.action === 'filterSaved') {
    isSelecting = false;
    updateFilterBadge(sender.tab.id);
  }
});

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
