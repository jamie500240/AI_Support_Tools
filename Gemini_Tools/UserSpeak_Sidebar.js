javascript:(function(){
  const USER_SELECTORS = '[data-testid="user-message"], .font-user-message, user-query, [data-message-author="user"]';

  /* 0. Cleanup：若已有舊實例在跑，統一從單一釋放點關閉，不留任何殘留監聽器/計時器 */
  function cleanupPrevious(){
    let s = window.__robustMinimapState;
    if (!s) return;
    if (s.observer) s.observer.disconnect();
    if (s.debounce) clearTimeout(s.debounce);
    if (s.onVisibility) document.removeEventListener('visibilitychange', s.onVisibility);
    if (s.onPagehide) window.removeEventListener('pagehide', s.onPagehide);
    window.__robustMinimapState = null;
  }
  cleanupPrevious();

  let state = { observer: null, debounce: null, onVisibility: null, onPagehide: null };
  window.__robustMinimapState = state;

  function rebuild(){
    let existing = document.getElementById('robust-minimap');
    if(existing) existing.remove();

    let rawBlocks = Array.from(document.querySelectorAll(USER_SELECTORS));
    rawBlocks = rawBlocks.filter(block => {
      let rect = block.getBoundingClientRect();
      let text = block.innerText || '';
      return rect.height > 0 && text.trim().length > 0;
    });
    let blocks = rawBlocks.filter(block => {
      return !rawBlocks.some(parent => parent !== block && parent.contains(block));
    });

    if(blocks.length === 0) return;

    let container = document.createElement('div');
    container.id = 'robust-minimap';
    Object.assign(container.style, {
      position: 'fixed', right: '20px', top: '50%', transform: 'translateY(-50%)',
      display: 'flex', flexDirection: 'column', gap: '8px', zIndex: '999999',
      width: '32px'
    });

    blocks.forEach(function(block) {
      let line = document.createElement('div');
      Object.assign(line.style, {
        width: '20px', height: '4px', backgroundColor: '#1a73e8',
        borderRadius: '2px', cursor: 'pointer', transition: 'all 0.3s',
        alignSelf: 'flex-end'
      });
      let text = block.innerText || '';
      text = text.replace(/\s+/g, ' ').trim();
      line.title = '你: ' + (text.length > 30 ? text.substring(0, 30) + '...' : text);
      line.onclick = function(e) {
        try {
          block.style.scrollMarginTop = '100px';
          block.scrollIntoView({behavior: 'smooth', block: 'start'});
          let oldBg = block.style.backgroundColor;
          block.style.backgroundColor = 'rgba(255, 235, 59, 0.2)';
          setTimeout(function() { block.style.backgroundColor = oldBg; }, 800);
        } catch(err) { console.log('跳轉失敗', err); }
      };
      line.onmouseover = function() { line.style.backgroundColor = '#0d47a1'; };
      line.onmouseout = function() { line.style.backgroundColor = '#1a73e8'; };
      container.appendChild(line);
    });

    document.body.appendChild(container);
  }

  /* 精準過濾：只有「新增/移除的節點本身或其子孫，符合使用者訊息特徵」才觸發重建，
     單純文字串流變動（AI 逐字打字）不會誤觸發計時器 */
  function mutationLooksRelevant(mutationsList){
    for (const m of mutationsList) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches && node.matches(USER_SELECTORS)) return true;
        if (node.querySelector && node.querySelector(USER_SELECTORS)) return true;
      }
      for (const node of m.removedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches && node.matches(USER_SELECTORS)) return true;
      }
    }
    return false;
  }

  function scheduleRebuild(){
    clearTimeout(state.debounce);
    state.debounce = setTimeout(rebuild, 500);
  }

  rebuild();
  if (!document.getElementById('robust-minimap')) {
    alert('找不到使用者的對話區塊！');
    cleanupPrevious();
    return;
  }

  state.observer = new MutationObserver(function(mutationsList){
    if (mutationLooksRelevant(mutationsList)) scheduleRebuild();
  });
  state.observer.observe(document.body, { childList: true, subtree: true });

  /* 背景分頁自動暫停：分頁不在前景時關閉監聽，省資源；切回前景時恢復並補做一次重建 */
  state.onVisibility = function(){
    if (document.hidden) {
      if (state.observer) state.observer.disconnect();
    } else {
      if (state.observer) state.observer.observe(document.body, { childList: true, subtree: true });
      scheduleRebuild();
    }
  };
  document.addEventListener('visibilitychange', state.onVisibility);

  /* 頁面關閉/跳轉時的最終釋放點，與正常路徑共用同一個 cleanupPrevious */
  state.onPagehide = cleanupPrevious;
  window.addEventListener('pagehide', state.onPagehide);
})();
