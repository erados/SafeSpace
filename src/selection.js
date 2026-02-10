// Event handler references are initialized inside startSelection() and cleanupSelection()
// since this file is loaded via importScripts in the service worker (no window object).

function startSelection() {
  window.__safespaceHandlers = window.__safespaceHandlers || {};
  // UI container
  const uiContainer = document.createElement('div');
  uiContainer.id = 'safespace-ui';
  uiContainer.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: #1a1a2e;
    color: #e0e0e0;
    padding: 14px;
    border-radius: 10px;
    z-index: 2147483647;
    max-width: 320px;
    max-height: 450px;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    line-height: 1.5;
    border: 1px solid rgba(255,255,255,0.08);
  `;
  document.body.appendChild(uiContainer);

  // Instruction banner
  const banner = document.createElement('div');
  banner.style.cssText = `
    background: rgba(124,131,255,0.15);
    border: 1px solid rgba(124,131,255,0.3);
    border-radius: 6px;
    padding: 8px 10px;
    margin-bottom: 10px;
    font-size: 12px;
    color: #aab;
  `;
  banner.textContent = chrome.i18n.getMessage("selectionInstructions") || 'Click on any element to select it. Similar elements will be highlighted.';
  uiContainer.appendChild(banner);

  // Log area
  const logArea = document.createElement('div');
  uiContainer.appendChild(logArea);

  // Cancel button (always visible)
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = chrome.i18n.getMessage("cancel") || 'Cancel';
  cancelBtn.style.cssText = `
    margin-top: 10px;
    padding: 8px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 6px;
    color: #ccc;
    cursor: pointer;
    width: 100%;
    font-size: 13px;
    transition: background 0.2s;
  `;
  cancelBtn.addEventListener('mouseover', () => { cancelBtn.style.background = 'rgba(255,255,255,0.15)'; });
  cancelBtn.addEventListener('mouseout', () => { cancelBtn.style.background = 'rgba(255,255,255,0.08)'; });
  cancelBtn.addEventListener('click', () => doCancel());
  uiContainer.appendChild(cancelBtn);

  let isSelecting = true;
  let hoveredElement = null;
  let selectedElements = null;

  function btnStyle(bg, hoverBg) {
    return `
      margin-top: 8px;
      padding: 10px;
      background: ${bg};
      border: none;
      border-radius: 6px;
      color: white;
      cursor: pointer;
      width: 100%;
      font-size: 13px;
      font-weight: 500;
      transition: background 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 36px;
    `;
  }

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
    return { selector, fullPath: elementPath.join(' > '), elements: similarElements };
  }

  function updateLog(result) {
    logArea.innerHTML = '';
    const logElement = document.createElement('div');
    logElement.style.cssText = 'margin-bottom: 8px; color: #aab;';
    logElement.innerHTML = `
      <div><strong style="color:#e0e0e0">${chrome.i18n.getMessage("selectedElement")}:</strong> <code style="color:#7c83ff;font-size:11px">${result.selector}</code></div>
      <div><strong style="color:#e0e0e0">${chrome.i18n.getMessage("similarElementsFound")}:</strong> ${result.elements.length}</div>
    `;
    logArea.appendChild(logElement);
  }

  function showFilterUI(result) {
    // Hide cancel button during filter UI (has its own cancel)
    cancelBtn.style.display = 'none';
    logArea.innerHTML = '';

    const selectionInfo = document.createElement('div');
    selectionInfo.style.cssText = 'margin-bottom: 12px; color: #aab;';
    selectionInfo.innerHTML = `
      <div><strong style="color:#e0e0e0">${chrome.i18n.getMessage("selectedElement")}:</strong> <code style="color:#7c83ff;font-size:11px">${result.selector}</code></div>
      <div><strong style="color:#e0e0e0">${chrome.i18n.getMessage("similarElementsFound")}:</strong> ${result.elements.length}</div>
    `;
    logArea.appendChild(selectionInfo);

    // Parent element button
    const parentButton = document.createElement('button');
    parentButton.textContent = chrome.i18n.getMessage("selectParentElement");
    parentButton.style.cssText = btnStyle('#FF9800', '#F57C00');
    parentButton.addEventListener('mouseover', () => { parentButton.style.background = '#F57C00'; });
    parentButton.addEventListener('mouseout', () => { parentButton.style.background = '#FF9800'; });
    parentButton.addEventListener('click', () => {
      const currentElement = result.elements[0];
      if (currentElement && currentElement.parentElement) {
        result.elements.forEach(el => { el.style.outline = ''; });
        const newResult = findSimilarElements(currentElement.parentElement);
        selectedElements = newResult;
        newResult.elements.forEach(el => { el.style.outline = '2px solid green'; });
        showFilterUI(newResult);
      }
    });
    logArea.appendChild(parentButton);

    // Filter text input
    const filterUI = document.createElement('div');
    filterUI.style.cssText = 'margin-top: 12px;';
    filterUI.innerHTML = `
      <div style="margin-bottom: 6px; font-size: 12px; color: #888;">${chrome.i18n.getMessage("enterFilterText")}:</div>
      <input type="text" id="filterText" style="
        width: 100%;
        padding: 8px 10px;
        border: 1px solid rgba(255,255,255,0.15);
        border-radius: 6px;
        background: rgba(255,255,255,0.06);
        color: #e0e0e0;
        box-sizing: border-box;
        font-size: 13px;
        outline: none;
      " placeholder="${chrome.i18n.getMessage("enterFilterText")}">
    `;
    logArea.appendChild(filterUI);

    const filterInput = document.getElementById('filterText');
    filterInput.focus();

    filterInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        previewButton.click();
      }
    });

    // Preview button
    const previewButton = document.createElement('button');
    previewButton.textContent = chrome.i18n.getMessage("preview");
    previewButton.style.cssText = btnStyle('#2196F3', '#1976D2');
    previewButton.addEventListener('mouseover', () => { previewButton.style.background = '#1976D2'; });
    previewButton.addEventListener('mouseout', () => { previewButton.style.background = '#2196F3'; });
    logArea.appendChild(previewButton);

    const previewArea = document.createElement('div');
    previewArea.style.marginTop = '10px';
    logArea.appendChild(previewArea);

    // Save button (hidden until preview)
    const saveButton = document.createElement('button');
    saveButton.textContent = chrome.i18n.getMessage("saveFilter");
    saveButton.style.cssText = btnStyle('#4CAF50', '#388E3C');
    saveButton.style.display = 'none';
    saveButton.addEventListener('mouseover', () => { saveButton.style.background = '#388E3C'; });
    saveButton.addEventListener('mouseout', () => { saveButton.style.background = '#4CAF50'; });
    logArea.appendChild(saveButton);

    // Back/Cancel button for filter UI
    const backBtn = document.createElement('button');
    backBtn.textContent = chrome.i18n.getMessage("cancel") || 'Cancel';
    backBtn.style.cssText = btnStyle('transparent', 'rgba(255,255,255,0.1)');
    backBtn.style.border = '1px solid rgba(255,255,255,0.15)';
    backBtn.style.color = '#aaa';
    backBtn.addEventListener('mouseover', () => { backBtn.style.background = 'rgba(255,255,255,0.1)'; });
    backBtn.addEventListener('mouseout', () => { backBtn.style.background = 'transparent'; });
    backBtn.addEventListener('click', () => doCancel());
    logArea.appendChild(backBtn);

    // Preview handler
    previewButton.addEventListener('click', () => {
      const filterText = document.getElementById('filterText').value.trim();
      if (!filterText) {
        previewArea.innerHTML = `<div style="color:#ff6b6b;font-size:12px;padding:6px 0;">${chrome.i18n.getMessage("pleaseEnterFilterText")}</div>`;
        return;
      }
      const filteredElements = result.elements.filter(el =>
        el.textContent.toLowerCase().includes(filterText.toLowerCase())
      );
      previewArea.innerHTML = `
        <div style="margin-bottom: 6px; color: #aab;">
          ${chrome.i18n.getMessage("elementsFiltered")}: <strong style="color:#FF5722">${filteredElements.length}</strong>
        </div>
      `;
      filteredElements.forEach((el, index) => {
        el.style.outline = '2px solid #FF5722';
        const preview = document.createElement('div');
        preview.style.cssText = `
          margin: 4px 0; padding: 5px 8px;
          border: 1px solid rgba(255,82,33,0.3);
          border-radius: 4px; font-size: 11px;
          background: rgba(255,82,33,0.08); color: #ccc;
        `;
        preview.textContent = `${index + 1}. ${el.textContent.trim().substring(0, 50)}...`;
        previewArea.appendChild(preview);
      });
      saveButton.style.display = 'flex';
    });

    // Save handler
    saveButton.addEventListener('click', async () => {
      const filterText = document.getElementById('filterText').value.trim();
      const filter = {
        selector: result.selector,
        fullPath: result.fullPath,
        domain: window.location.hostname,
        filterText: filterText,
        timestamp: Date.now(),
        enabled: true
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
          document.querySelectorAll('[style*="outline"]').forEach(el => {
            el.style.outline = '';
            el.removeAttribute('data-hover');
            el.removeAttribute('data-preview');
          });

          logArea.innerHTML = `
            <div style="color: #69f0ae; text-align: center; padding: 16px 0;">
              ✓ ${chrome.i18n.getMessage("filterSavedSuccessfully")}
            </div>
          `;

          setTimeout(() => {
            if (uiContainer && uiContainer.parentNode) uiContainer.remove();
            chrome.runtime.sendMessage({ action: 'filterSaved' });
          }, 1000);

          document.removeEventListener('mouseover', handleMouseOver);
          document.removeEventListener('click', handleClick, true);
        } else {
          throw new Error(response.error || chrome.i18n.getMessage("unknownError"));
        }
      } catch (error) {
        console.error('Filter save error:', error);
        logArea.innerHTML += `
          <div style="color: #ff6b6b; font-size: 12px; margin-top: 8px;">
            ⚠ ${error.message}
          </div>
        `;
      }
    });
  }

  function handleMouseOver(e) {
    if (!isSelecting) return;
    if (e.target.closest('#safespace-ui')) return;
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

  function handleClick(e) {
    if (!isSelecting) return;
    if (e.target.closest('#safespace-ui')) return;
    e.preventDefault();
    e.stopPropagation();
    const result = findSimilarElements(e.target);
    selectedElements = result;
    result.elements.forEach(el => { el.style.outline = '2px solid green'; });
    showFilterUI(result);
    isSelecting = false;
    document.removeEventListener('mouseover', handleMouseOver);
    document.removeEventListener('click', handleClick, true);
  }

  async function doCancel() {
    document.querySelectorAll('[style*="outline"]').forEach(el => {
      el.style.outline = '';
      el.removeAttribute('data-hover');
      el.removeAttribute('data-preview');
    });
    if (uiContainer && uiContainer.parentNode) uiContainer.remove();
    document.removeEventListener('mouseover', handleMouseOver);
    document.removeEventListener('click', handleClick, true);
    try {
      await chrome.runtime.sendMessage({ action: 'selectionCanceled' });
    } catch (error) {
      console.error('Message send error:', error);
    }
  }

  document.addEventListener('mouseover', handleMouseOver);
  document.addEventListener('click', handleClick, true);

  window.__safespaceHandlers.handleMouseOver = handleMouseOver;
  window.__safespaceHandlers.handleClick = handleClick;

  // ESC key handler
  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') {
      document.removeEventListener('keydown', escHandler);
      doCancel();
    }
  });
}

function cleanupSelection() {
  document.querySelectorAll('[style*="outline"]').forEach(el => {
    el.style.outline = '';
    el.removeAttribute('data-hover');
    el.removeAttribute('data-preview');
  });

  const uiContainer = document.getElementById('safespace-ui');
  if (uiContainer) uiContainer.remove();

  const handlers = window.__safespaceHandlers || {};
  if (handlers.handleMouseOver) {
    document.removeEventListener('mouseover', handlers.handleMouseOver);
  }
  if (handlers.handleClick) {
    document.removeEventListener('click', handlers.handleClick, true);
  }
  window.__safespaceHandlers = {};
}
