javascript:(function(){
  const HEADING_SELECTORS = 'h1, h2, h3';

  function cleanupPrevious(){
    let s = window.__headingMinimapState;
    if (!s) return;
    if (s.observer) s.observer.disconnect();
    if (s.debounce) clearTimeout(s.debounce);
    if (s.onVisibility) document.removeEventListener('visibilitychange', s.onVisibility);
    if (s.onPagehide) window.removeEventListener('pagehide', s.onPagehide);
    window.__headingMinimapState = null;
  }
  cleanupPrevious();

  let state = { observer: null, debounce: null, onVisibility: null, onPagehide: null };
  window.__headingMinimapState = state;

  function rebuild(){
    let existing = document.getElementById('heading-minimap');
    if(existing) existing.remove();

    let rawBlocks = Array.from(document.querySelectorAll(HEADING_SELECTORS));
    let blocks = rawBlocks.filter(block => {
      let rect = block.getBoundingClientRect();
      let text = (block.innerText || '').trim();
      let isVisible = rect.height > 0 && rect.width > 0;
      let hasText = text.length > 0;
      let isNotNav = !block.closest('nav') && !block.closest('aside') && !block.closest('header');
      return isVisible && hasText && isNotNav;
    });

    if(blocks.length === 0) return;

    let container = document.createElement('div');
    container.id = 'heading-minimap';
    Object.assign(container.style, {
      position: 'fixed', right: '12px', top: '50%', transform: 'translateY(-50%)',
      display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
      gap: '6px', zIndex: '999999', maxHeight: '80vh', overflowY: 'auto',
      paddingRight: '6px', paddingLeft: '6px', scrollBehavior: 'smooth'
    });

    let config = {
      'h1': { width: '30px', color: '#1a73e8', hover: '#0d47a1', icon: '📌' },
      'h2': { width: '22px', color: '#129e55', hover: '#0b6635', icon: '📍' },
      'h3': { width: '14px', color: '#e37400', hover: '#b05900', icon: '🔹' }
    };

    blocks.forEach(function(block) {
      let line = document.createElement('div');
      let tag = block.tagName.toLowerCase();
      let cfg = config[tag] || config['h3'];

      Object.assign(line.style, {
        width: cfg.width, height: '4px', flexShrink: '0',
        backgroundColor: cfg.color, borderRadius: '2px',
        cursor: 'pointer', transition: 'all 0.2s ease'
      });

      let titleText = block.innerText.replace(/\s+/g, ' ').trim();
      let previewText = '';
      let nextEl = block.nextElementSibling;
      let grabbedChars = 0;

      while (nextEl && grabbedChars < 120) {
        let text = (nextEl.innerText || '').replace(/\s+/g, ' ').trim();
        if (text.length > 0) {
          previewText += (previewText ? ' ' : '') + text;
          grabbedChars += text.length;
        }
        if (/^h[1-6]$/i.test(nextEl.tagName)) break;
        nextEl = nextEl.nextElementSibling;
      }

      let fullTooltip = cfg.icon + ' ' + titleText;
      if (previewText) {
        let truncated = previewText.length > 100 ? previewText.substring(0, 100) + '...' : previewText;
        fullTooltip += '\n\n📝 ' + truncated;
      }
      line.title = fullTooltip;

      line.onclick = function(e) {
        try {
          block.style.scrollMarginTop = '100px';
          block.scrollIntoView({behavior: 'smooth', block: 'start'});
          let oldBg = block.style.backgroundColor;
          block.style.backgroundColor = 'rgba(255, 235, 59, 0.5)';
          setTimeout(function() { block.style.backgroundColor = oldBg; }, 800);
        } catch(err) { console.log('跳轉失敗', err); }
      };

      line.onmouseover = function() {
        line.style.backgroundColor = cfg.hover;
        line.style.transform = 'scaleX(1.15)';
        line.style.transformOrigin = 'right';
      };
      line.onmouseout = function() {
        line.style.backgroundColor = cfg.color;
        line.style.transform = 'scaleX(1)';
      };

      container.appendChild(line);
    });

    document.body.appendChild(container);
  }

  function mutationLooksRelevant(mutationsList){
    for (const m of mutationsList) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches && node.matches(HEADING_SELECTORS)) return true;
        if (node.querySelector && node.querySelector(HEADING_SELECTORS)) return true;
      }
      for (const node of m.removedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches && node.matches(HEADING_SELECTORS)) return true;
      }
    }
    return false;
  }

  function scheduleRebuild(){
    clearTimeout(state.debounce);
    state.debounce = setTimeout(rebuild, 500);
  }

  rebuild();
  if (!document.getElementById('heading-minimap')) {
    alert('畫面上找不到 H1 ~ H3 標題！');
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
