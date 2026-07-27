javascript:(async function(){
  try {
    let existingToast = document.getElementById('ai-exporter-toast');
    if(existingToast) existingToast.remove();

    let toast = document.createElement('div');
    toast.id = 'ai-exporter-toast';
    toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#1f2937;color:#fff;padding:12px 24px;border-radius:8px;z-index:9999999;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-family:sans-serif;font-size:14px;';
    toast.innerText = '正在初始化匯出引擎...';
    document.body.appendChild(toast);

    let host = location.hostname;
    let platform = 'AI_Chat';

    /* =========================================================
       1. 策略降級鏈設定檔 (Strategy Fallback Pipeline)
       ========================================================= */
    const STRATEGIES = {
      ChatGPT: {
        platformName: 'ChatGPT',
        user: ['[data-message-author-role="user"]', '[data-testid*="user-message"]', '[data-testid*="user"]', '.whitespace-pre-wrap'],
        ai: ['[data-message-author-role="assistant"]', '[data-testid*="assistant-message"]', '.markdown']
      },
      Claude: {
        platformName: 'Claude',
        user: ['[data-testid="user-message"]', '[data-testid*="user-message"]', '.font-user-message', '[class*="font-user"]'],
        ai: ['[data-testid="assistant-message"]', '[data-testid*="assistant-message"]', '.font-claude-response', '[class*="font-claude"]']
      },
      Gemini: {
        platformName: 'Gemini',
        user: ['user-query', '[data-message-author="user"]', 'div[class*="query"]'],
        ai: ['model-response', 'message-content', '[data-message-author="model"]']
      },
      Grok: {
        platformName: 'Grok',
        user: ['[data-testid*="user"]', '[class*="user-message"]', '[class*="userMessage"]'],
        ai: ['[data-testid*="assistant"]', '[data-testid*="grok"]', 'div[class*="response-container"]', '.prose']
      },
      Perplexity: {
        platformName: 'Perplexity',
        user: ['[data-testid="user-query"]', '[data-testid*="user-query"]', '[class*="query"]', '[class*="Query"]', 'h1', '.font-display', '.whitespace-pre-line'],
        ai: ['.prose', '[class*="prose"]', '[class*="answer"]', '[data-testid*="answer"]']
      },
      Copilot: {
        platformName: 'Copilot',
        user: ['[data-content="user-message"]', '[class*="user-message"]', 'cib-message-group[source="user"]'],
        ai: ['[data-content="ai-message"]', '[class*="ai-message"]', '.markdown-body', 'cib-message-group[source="bot"]']
      },
      Fallback: {
        platformName: 'AI_Chat',
        user: ['[data-testid*="user"]', '.user-message', '[class*="user"]'],
        ai: ['[data-testid*="assistant"]', '.markdown', '.prose', 'article']
      }
    };

    let strategy = STRATEGIES.Fallback;
    if (host.includes('openai') || host.includes('chatgpt')) strategy = STRATEGIES.ChatGPT;
    else if (host.includes('claude')) strategy = STRATEGIES.Claude;
    else if (host.includes('gemini') || host.includes('google')) strategy = STRATEGIES.Gemini;
    else if (host.includes('grok') || host.includes('x.ai') || host.includes('x.com')) strategy = STRATEGIES.Grok;
    else if (host.includes('perplexity')) strategy = STRATEGIES.Perplexity;
    else if (host.includes('copilot') || host.includes('bing')) strategy = STRATEGIES.Copilot;

    platform = strategy.platformName;

    /* =========================================================
       2. 懶加載 & 虛擬滾動喚醒機制 (DOM Virtualization Wake-up)
       ========================================================= */
    toast.innerText = '正在觸發脈衝滾動，喚醒懶加載對話內容 (DOM Virtualization Wake-up)...';
    let currentY = window.scrollY;
    window.scrollTo({ top: 0, behavior: 'instant' });
    await new Promise(r => setTimeout(r, 300));
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
    await new Promise(r => setTimeout(r, 400));
    window.scrollTo({ top: currentY, behavior: 'instant' });

    /* =========================================================
       2.5 開頭完整性偵測（盡力而為，非絕對保證）
       原理：虛擬滾動的介面常見「畫面外舊訊息 DOM 直接被移除」，
       因此無法百分之百確認頂端是否為對話真正起點，只能做間接偵測：
       嘗試把捲軸拉到頂，再檢查是否仍卡在某個高度。
       ========================================================= */
    function findScrollableAncestor(el){
      let node = el;
      while (node && node !== document.body && node !== document.documentElement) {
        let style = window.getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 50) {
          return node;
        }
        node = node.parentElement;
      }
      return document.scrollingElement || document.documentElement;
    }

    let probeEl = document.querySelector(strategy.user[0]) || document.body;
    let scrollHost = findScrollableAncestor(probeEl);
    let startedAtTop = true;
    try {
      let beforeTop = scrollHost.scrollTop;
      scrollHost.scrollTo({ top: 0, behavior: 'instant' });
      await new Promise(r => setTimeout(r, 300));
      let afterTop = scrollHost.scrollTop;
      /* 拉到頂後仍有明顯剩餘高度，視為「可能還有更早的內容未載入」 */
      if (afterTop > 40) startedAtTop = false;
      /* 復原使用者原本瀏覽位置，不擅自改變畫面停留點 */
      scrollHost.scrollTop = beforeTop;
    } catch(eProbe) {
      /* 偵測失敗不影響主流程，保守起見標記為未知（視為可能不完整） */
      startedAtTop = false;
    }

    /* =========================================================
       3. 防污染併集降級掃描器 (Union Fallback Scanner with Isolation)
       ========================================================= */
    function queryWithFallback(selectorsArray, isUserRole = false) {
      let accumulated = [];
      for (let sel of selectorsArray) {
        let els = Array.from(document.querySelectorAll(sel)).filter(b => {
          let rect = b.getBoundingClientRect();
          let isNav = b.closest('nav') || b.closest('aside');
          let hasText = (b.innerText || b.textContent || '').trim().length > 0;
          return rect.height > 0 && !isNav && hasText;
        });

        if (isUserRole) {
          if (platform === 'Perplexity') {
            els = els.filter(el => !el.closest('.prose') && !el.closest('[class*="prose"]') && !el.closest('[class*="answer"]') && !el.closest('[data-testid*="answer"]'));
          } else if (platform === 'ChatGPT') {
            els = els.filter(el => !el.closest('[data-message-author-role="assistant"]') && !el.closest('.markdown'));
          }
        }

        accumulated.push(...els);
      }
      return accumulated;
    }

    function dedupeSameRole(els) {
      let uniqueNodes = Array.from(new Set(els));
      return uniqueNodes.filter(b => !uniqueNodes.some(p => p !== b && p.contains(b)));
    }

    let userBlocks = dedupeSameRole(queryWithFallback(strategy.user, true));
    let aiBlocks = dedupeSameRole(queryWithFallback(strategy.ai, false));

    let items = [];
    userBlocks.forEach(el => items.push({ el, isUser: true, y: el.getBoundingClientRect().top + window.scrollY }));
    aiBlocks.forEach(el => items.push({ el, isUser: false, y: el.getBoundingClientRect().top + window.scrollY }));
    items.sort((a, b) => a.y - b.y);

    if (items.length === 0) {
      toast.remove();
      alert(`[${platform}] 策略降級後仍抓不到對話！網頁可能進行了結構性大改版。`);
      return;
    }

    /* =========================================================
       4. Metadata / YAML Front Matter 寫入 (正確 turn_count 語義)
       ========================================================= */
    let pageTitle = document.title.replace(/[\\/:\*\?"<>\|]/g, '').trim() || `${platform} Chat`;
    let exportDate = new Date().toISOString().split('T')[0];

    let md = `---\n`;
    md += `platform: ${platform}\n`;
    md += `export_date: ${exportDate}\n`;
    md += `url: "${location.href}"\n`;
    md += `title: "${pageTitle.replace(/"/g, '\\"')}"\n`;
    md += `turn_count: ${Math.ceil(items.length / 2)}\n`;
    md += `message_count: ${items.length}\n`;
    md += `started_at_top: ${startedAtTop}\n`;
    md += `---\n\n`;
    md += `# ${pageTitle}\n\n`;

    /* 誠實範圍揭露：不虛報絕對對話編號，只陳述本次實際擷取到的則數與順序 */
    md += `> ⚠️ **匯出範圍提醒**：本次共擷取 ${items.length} 則訊息（依畫面實際擷取順序，第 1 則至第 ${items.length} 則），`;
    md += `**不代表**這必然等於完整對話總則數。虛擬滾動介面可能將畫面外的訊息移除，此工具僅能抓到擷取當下畫面實際存在的 DOM 內容。\n`;
    if (!startedAtTop) {
      md += `>\n> 🔺 **偵測到可能未從對話最上方開始擷取**：嘗試捲動至頂端後，仍偵測到上方可能有更早內容尚未載入。建議手動捲動到對話最開頭後再重新執行本工具，確認開頭是否完整。\n`;
    }
    md += `\n---\n\n`;

    /* =========================================================
       5. 佔位符 Code 保護 + 純文字排版 + 全局圖片去重引擎
       ========================================================= */
    toast.innerText = `正在為您解析與轉換 ${items.length} 則訊息 (約 ${Math.ceil(items.length / 2)} 輪對話)...`;
    let seenImg = new Set();

    for (let i = 0; i < items.length; i++) {
      let item = items[i];
      let b = item.el;
      let speaker = item.isUser ? '👤 你 (User)' : `🤖 ${platform}`;

      let clone = b.cloneNode(true);

      if (!item.isUser) {
        let subUsers = clone.querySelectorAll('[data-message-author-role="user"], [data-testid*="user"], user-query, [data-testid="user-query"]');
        subUsers.forEach(su => su.remove());
      }

      clone.querySelectorAll('script, style, svg, button, nav, audio, [aria-hidden="true"], .hidden, .copy-button, [aria-label*="Copy"]').forEach(el => el.remove());

      let codeBlocks = [];
      clone.querySelectorAll('pre').forEach((pre, idx) => {
        let codeNode = pre.querySelector('code') || pre;
        let cls = (codeNode.className || '') + ' ' + (pre.className || '');
        let match = cls.match(/(?:language|lang)-(\w+)/);
        let lang = match ? match[1] : '';
        let codeText = (codeNode.textContent || '').trim();

        let placeholder = `___CODE_BLOCK_PH_${idx}_${Date.now()}___`;
        codeBlocks.push({ placeholder, lang, codeText });

        let phNode = document.createElement('p');
        phNode.textContent = placeholder;
        pre.replaceWith(phNode);
      });

      clone.querySelectorAll('code').forEach(c => {
        let text = c.textContent || '';
        let span = document.createElement('span');
        span.textContent = ' `' + text.trim() + '` ';
        c.replaceWith(span);
      });

      clone.style.cssText = 'position:absolute;left:-9999px;top:-9999px;white-space:pre-wrap;';
      document.body.appendChild(clone);
      let rawText = clone.innerText ? clone.innerText : clone.textContent;
      document.body.removeChild(clone);

      let cleanText = (rawText || '')
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      codeBlocks.forEach(cb => {
        let formattedCode = `\n\n\`\`\`${cb.lang}\n${cb.codeText}\n\`\`\`\n\n`;
        cleanText = cleanText.replace(cb.placeholder, formattedCode);
      });

      cleanText = cleanText.replace(/(#+\s+[^\n]+)\n{3,}/g, '$1\n\n');

      let imgs = Array.from(b.querySelectorAll('img')).filter(img => {
        let src = img.currentSrc || img.src || img.getAttribute('srcset') || '';
        let isAvatar = src.includes('avatar') || src.includes('profile') || src.includes('user');
        let isTooSmall = (img.width > 0 && img.width <= 25) || (img.height > 0 && img.height <= 25);
        if (isAvatar || isTooSmall || !src.length) return false;

        let cleanSrc = img.currentSrc || img.src;
        if (seenImg.has(cleanSrc)) return false;
        seenImg.add(cleanSrc);
        return true;
      });

      if (!cleanText && imgs.length === 0) continue;

      md += `### ${speaker}\n\n`;
      if (cleanText) md += cleanText + '\n\n';

      for (let j = 0; j < imgs.length; j++) {
        let imgEl = imgs[j];
        let src = imgEl.currentSrc || imgEl.src;
        if (!src) continue;
        let b64 = null;

        if (src.startsWith('data:')) {
          b64 = src;
        } else {
          try {
            let res = await fetch(src);
            let blob = await res.blob();
            b64 = await new Promise(r => {
              let f = new FileReader();
              f.onloadend = () => r(f.result);
              f.readAsDataURL(blob);
            });
          } catch(e1) {
            try {
              b64 = await new Promise((resolve, reject) => {
                let tempImg = new Image();
                tempImg.crossOrigin = 'Anonymous';
                tempImg.onload = () => {
                  let canvas = document.createElement('canvas');
                  canvas.width = tempImg.naturalWidth || tempImg.width || 300;
                  canvas.height = tempImg.naturalHeight || tempImg.height || 150;
                  canvas.getContext('2d').drawImage(tempImg, 0, 0);
                  resolve(canvas.toDataURL('image/png'));
                };
                tempImg.onerror = reject;
                tempImg.src = src;
              });
            } catch(e2) {
              b64 = null;
            }
          }
        }

        let finalImgSrc = b64 ? b64 : src;
        md += `<img src="${finalImgSrc}" alt="圖片" style="max-width:100%; border-radius:8px;" />\n\n`;
      }

      md += '---\n\n';
    }

    /* =========================================================
       6. 觸發 Markdown 下載
       ========================================================= */
    let finalBlob = new Blob([md], {type:'text/markdown;charset=utf-8;'});
    let a = document.createElement('a');
    a.href = URL.createObjectURL(finalBlob);
    a.download = `${platform}_${pageTitle.substring(0, 20)}_${Date.now()}.md`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.remove();

    if (!startedAtTop) {
      let warnToast = document.createElement('div');
      warnToast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#92400e;color:#fff;padding:12px 24px;border-radius:8px;z-index:9999999;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-family:sans-serif;font-size:14px;max-width:80vw;text-align:center;';
      warnToast.innerText = '⚠️ 內容可能未從頭開始，如需完整內容請手動捲動到最上方後重新匯出';
      document.body.appendChild(warnToast);
      setTimeout(() => warnToast.remove(), 6000);
    }

    /* =========================================================
       7. 匯出後新內容監聽（僅提醒，不自動重新下載）
       與側邊欄腳本共用同一套 Cleanup 模式：重複執行先釋放舊實例，
       分頁關閉時同步釋放，不留背景殘留監聽器。
       ========================================================= */
    (function setupUpdateWatcher(){
      function cleanupPrevious(){
        let s = window.__aiExporterWatchState;
        if (!s) return;
        if (s.observer) s.observer.disconnect();
        if (s.debounce) clearTimeout(s.debounce);
        if (s.onPagehide) window.removeEventListener('pagehide', s.onPagehide);
        window.__aiExporterWatchState = null;
      }
      cleanupPrevious();

      let state = { observer: null, debounce: null, onPagehide: null };
      window.__aiExporterWatchState = state;

      const COMBINED = [...strategy.user, ...strategy.ai].join(', ');

      function mutationLooksRelevant(mutationsList){
        for (const m of mutationsList) {
          for (const node of m.addedNodes) {
            if (node.nodeType !== 1) continue;
            if (node.matches && node.matches(COMBINED)) return true;
            if (node.querySelector && node.querySelector(COMBINED)) return true;
          }
        }
        return false;
      }

      function showUpdateToast(){
        let existing = document.getElementById('ai-exporter-update-toast');
        if (existing) existing.remove();
        let t = document.createElement('div');
        t.id = 'ai-exporter-update-toast';
        t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#1f2937;color:#fff;padding:10px 20px;border-radius:8px;z-index:9999999;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-family:sans-serif;font-size:13px;';
        t.innerText = '💬 內容已更新，如需匯出最新版本請重新點擊書籤';
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 6000);
      }

      state.observer = new MutationObserver(function(mutationsList){
        if (!mutationLooksRelevant(mutationsList)) return;
        /* 對話串流輸出中會連續觸發，等安靜 2 秒（訊息大致打完）才提醒一次 */
        clearTimeout(state.debounce);
        state.debounce = setTimeout(showUpdateToast, 2000);
      });
      state.observer.observe(document.body, { childList: true, subtree: true });

      state.onPagehide = cleanupPrevious;
      window.addEventListener('pagehide', state.onPagehide);
    })();

  } catch(err) {
    alert('發生錯誤: ' + err.message);
  }
})();
