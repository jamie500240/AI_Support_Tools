javascript:(function(){
  const BLOCK_SELECTORS = 'message-content, user-query, model-response, div[data-message-author], div[class*="message-content"], div[class*="chat-message"]';

  function cleanupPrevious(){
    let s = window.__geminiMinimapState;
    if (!s) return;
    if (s.observer) s.observer.disconnect();
    if (s.debounce) clearTimeout(s.debounce);
    if (s.onVisibility) document.removeEventListener('visibilitychange', s.onVisibility);
    if (s.onPagehide) window.removeEventListener('pagehide', s.onPagehide);
    window.__geminiMinimapState = null;
  }
  cleanupPrevious();

  let state = { observer: null, debounce: null, onVisibility: null, onPagehide: null };
  window.__geminiMinimapState = state;

  function rebuild(){
    let existing = document.getElementById('gemini-minimap');
    if(existing) existing.remove();

    let rawBlocks = Array.from(document.querySelectorAll(BLOCK_SELECTORS));
    let blocks = rawBlocks.filter(block => {
      return !rawBlocks.some(parent => parent !== block && parent.contains(block));
    });

    if(blocks.length === 0) return;

    let container = document.createElement('div');
    container.id = 'gemini-minimap';
    Object.assign(container.style, {
      position: 'fixed', right: '20px', top: '50%', transform: 'translateY(-50%)',
      display: 'flex', flexDirection: 'column', gap: '8px', zIndex: '999999',
      width: '32px'
    });

    blocks.forEach(function(block) {
      let line = document.createElement('div');
      let isUser = false;
      let tag = block.tagName ? block.tagName.toLowerCase() : '';
      let author = block.getAttribute('data-message-author') || '';
      let cls = block.getAttribute('class') || '';

      if (tag === 'user-query' || author === 'user') {
          isUser = true;
      } else if (block.closest && (block.closest('user-query') || block.closest('[data-message-author="user"]'))) {
          isUser = true;
      } else if (typeof cls === 'string' && cls.includes('user')) {
          isUser = true;
      }

      let bgColor = isUser ? '#1a73e8' : '#5f6368';
      Object.assign(line.style, {
        width: isUser ? '20px' : '28px', height: '4px', backgroundColor: bgColor,
        borderRadius: '2px', cursor: 'pointer', transition: 'all 0.3s',
        alignSelf: isUser ? 'flex-end' : 'flex-start'
      });

      let text = block.innerText || '';
      text = text.replace(/\s+/g, ' ').trim();
      line.title = (isUser ? '你: ' : 'AI: ') + (text.length > 30 ? text.substring(0, 30) + '...' : (text || '圖片或無文字內容'));

      line.onclick = function(e) {
        try {
          block.scrollIntoView({behavior: 'smooth', block: 'start'});
          let oldBg = block.style.backgroundColor;
          block.style.backgroundColor = 'rgba(255, 235, 59, 0.2)';
          setTimeout(function() { block.style.backgroundColor = oldBg; }, 800);
        } catch(err) { console.log('跳轉失敗', err); }
      };

      line.onmouseover = function() { line.style.backgroundColor = isUser ? '#0d47a1' : '#000000'; };
      line.onmouseout = function() { line.style.backgroundColor = bgColor; };

      container.appendChild(line);
    });

    document.body.appendChild(container);
  }

  function mutationLooksRelevant(mutationsList){
    for (const m of mutationsList) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches && node.matches(BLOCK_SELECTORS)) return true;
        if (node.querySelector && node.querySelector(BLOCK_SELECTORS)) return true;
      }
      for (const node of m.removedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches && node.matches(BLOCK_SELECTORS)) return true;
      }
    }
    return false;
  }

  function scheduleRebuild(){
    clearTimeout(state.debounce);
    state.debounce = setTimeout(rebuild, 500);
  }

  rebuild();
  if (!document.getElementById('gemini-minimap')) {
    alert('找不到對話區塊！');
    cleanupPrevious();
    return;
  }

  state.observer = new MutationObserver(function(mutationsList){
    if (mutationLooksRelevant(mutationsList)) scheduleRebuild();
  });
  state.observer.observe(document.body, { childList: true, subtree: true });

  state.onVisibility = function(){
    if (document.hidden) {
      if (state.observer) state.observer.disconnect();
    } else {
      if (state.observer) state.observer.observe(document.body, { childList: true, subtree: true });
      scheduleRebuild();
    }
  };
  document.addEventListener('visibilitychange', state.onVisibility);

  state.onPagehide = cleanupPrevious;
  window.addEventListener('pagehide', state.onPagehide);
})();
