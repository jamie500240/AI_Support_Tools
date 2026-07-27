javascript:(async function(){
  try {
    const BLOCK_SELECTORS = 'message-content, user-query, model-response, div[data-message-author], div[class*="message-content"]';

    var blocks = document.querySelectorAll(BLOCK_SELECTORS);
    if(blocks.length === 0) { alert('找不到對話內容！'); return; }

    var toast = document.createElement('div');
    toast.innerText = '正在擷取圖文與程式碼排版（突破圖片限制中），請稍候...';
    toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:12px 24px;border-radius:8px;z-index:999999;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
    document.body.appendChild(toast);

    /* 開頭完整性偵測（盡力而為，非絕對保證）：
       Gemini 對話區同樣可能有虛擬滾動，畫面外舊訊息可能已被移除。
       嘗試把捲軸拉到頂，再檢查是否仍卡在某個高度。 */
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

    let startedAtTop = true;
    try {
      let scrollHost = findScrollableAncestor(blocks[0]);
      let beforeTop = scrollHost.scrollTop;
      scrollHost.scrollTo({ top: 0, behavior: 'instant' });
      await new Promise(r => setTimeout(r, 300));
      let afterTop = scrollHost.scrollTop;
      if (afterTop > 40) startedAtTop = false;
      scrollHost.scrollTop = beforeTop;
    } catch(eProbe) {
      startedAtTop = false;
    }

    var md = `---\n`;
    md += `platform: Gemini\n`;
    md += `export_date: ${new Date().toISOString().split('T')[0]}\n`;
    md += `message_count: ${blocks.length}\n`;
    md += `started_at_top: ${startedAtTop}\n`;
    md += `---\n\n`;
    md += '# Gemini 對話備份 (' + new Date().toLocaleDateString() + ')\n\n';

    /* 誠實範圍揭露：不虛報絕對對話編號，只陳述本次實際擷取到的則數與順序 */
    md += `> ⚠️ **匯出範圍提醒**：本次共擷取 ${blocks.length} 則訊息（依畫面實際擷取順序，第 1 則至第 ${blocks.length} 則），`;
    md += `**不代表**這必然等於完整對話總則數。虛擬滾動介面可能將畫面外的訊息移除，此工具僅能抓到擷取當下畫面實際存在的 DOM 內容。\n`;
    if (!startedAtTop) {
      md += `>\n> 🔺 **偵測到可能未從對話最上方開始擷取**：嘗試捲動至頂端後，仍偵測到上方可能有更早內容尚未載入。建議手動捲動到對話最開頭後再重新執行本工具，確認開頭是否完整。\n`;
    }
    md += `\n---\n\n`;

    for(var i=0; i<blocks.length; i++) {
      var b = blocks[i];

      var imgs = Array.from(b.querySelectorAll('img')).filter(function(img){
        return !img.src.includes('avatar') && img.width > 20;
      });

      var clone = b.cloneNode(true);
      var btns = clone.querySelectorAll('button');
      btns.forEach(function(btn){ btn.remove(); });

      var pres = clone.querySelectorAll('pre');
      pres.forEach(function(pre) {
        var codeNode = pre.querySelector('code');
        var codeText = (codeNode ? codeNode.innerText || codeNode.textContent : pre.innerText || pre.textContent) || '';
        var mdCode = '\n```\n' + codeText.trim() + '\n```\n';
        pre.replaceWith(document.createTextNode(mdCode));
      });

      var codes = clone.querySelectorAll('code');
      codes.forEach(function(c) {
        var text = c.innerText || c.textContent;
        c.replaceWith(document.createTextNode(' `' + text.trim() + '` '));
      });

      clone.style.display = 'block';
      clone.style.position = 'absolute';
      clone.style.left = '-9999px';
      document.body.appendChild(clone);
      var textContent = clone.innerText ? clone.innerText.trim() : '';
      document.body.removeChild(clone);

      if(!textContent && imgs.length === 0) continue;

      md += '### 💬 對話區塊 ' + (i+1) + '\n\n';
      if(textContent) md += textContent + '\n\n';

      for(var j=0; j<imgs.length; j++) {
        var imgEl = imgs[j];
        var src = imgEl.src;
        var b64 = null;

        if(src.startsWith('data:')) {
          b64 = src;
        } else {
          try {
            var res = await fetch(src);
            var blob = await res.blob();
            b64 = await new Promise(function(r){
              var f = new FileReader();
              f.onloadend = function(){ r(f.result); };
              f.readAsDataURL(blob);
            });
          } catch(e1) {
            try {
              b64 = await new Promise(function(resolve, reject){
                var tempImg = new Image();
                tempImg.crossOrigin = 'Anonymous';
                tempImg.onload = function(){
                  var canvas = document.createElement('canvas');
                  canvas.width = tempImg.naturalWidth || tempImg.width;
                  canvas.height = tempImg.naturalHeight || tempImg.height;
                  canvas.getContext('2d').drawImage(tempImg, 0, 0);
                  resolve(canvas.toDataURL('image/png'));
                };
                tempImg.onerror = reject;
                tempImg.src = src;
              });
            } catch(e2) {
              try {
                var c2 = document.createElement('canvas');
                c2.width = imgEl.naturalWidth || imgEl.width;
                c2.height = imgEl.naturalHeight || imgEl.height;
                c2.getContext('2d').drawImage(imgEl, 0, 0);
                b64 = c2.toDataURL('image/png');
              } catch(e3) {
                b64 = null;
              }
            }
          }
        }

        if(b64) {
          md += '<img src="' + b64 + '" alt="圖片" style="max-width:100%; border-radius:8px;" />\n\n';
        } else {
          md += '> ⚠️ **[圖片抓取失敗]**：此圖片受到 Google 跨網域安全機制 (CORS) 嚴格保護，無法透過腳本下載。如果您需要此圖片，請在網頁上手動右鍵另存。\n\n';
        }
      }
      md += '---\n\n';
    }

    var finalBlob = new Blob([md], {type:'text/markdown;charset=utf-8;'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(finalBlob);
    a.download = 'Gemini_Backup_' + Date.now() + '.md';
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

    /* 匯出後新內容監聽（僅提醒，不自動重新下載），與 AI_MdDownloader 同一套 Cleanup 模式 */
    (function setupUpdateWatcher(){
      function cleanupPrevious(){
        let s = window.__geminiExporterWatchState;
        if (!s) return;
        if (s.observer) s.observer.disconnect();
        if (s.debounce) clearTimeout(s.debounce);
        if (s.onPagehide) window.removeEventListener('pagehide', s.onPagehide);
        window.__geminiExporterWatchState = null;
      }
      cleanupPrevious();

      let state = { observer: null, debounce: null, onPagehide: null };
      window.__geminiExporterWatchState = state;

      function mutationLooksRelevant(mutationsList){
        for (const m of mutationsList) {
          for (const node of m.addedNodes) {
            if (node.nodeType !== 1) continue;
            if (node.matches && node.matches(BLOCK_SELECTORS)) return true;
            if (node.querySelector && node.querySelector(BLOCK_SELECTORS)) return true;
          }
        }
        return false;
      }

      function showUpdateToast(){
        let existing = document.getElementById('gemini-exporter-update-toast');
        if (existing) existing.remove();
        let t = document.createElement('div');
        t.id = 'gemini-exporter-update-toast';
        t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#1f2937;color:#fff;padding:10px 20px;border-radius:8px;z-index:9999999;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-family:sans-serif;font-size:13px;';
        t.innerText = '💬 內容已更新，如需匯出最新版本請重新點擊書籤';
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 6000);
      }

      state.observer = new MutationObserver(function(mutationsList){
        if (!mutationLooksRelevant(mutationsList)) return;
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
