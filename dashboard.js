(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const seed = JSON.parse($('seed-data').textContent);
  const key = 'cathay-audit-v2';
  let state = { urls: seed.results.map(r => r.inputUrl), results: seed.results, endpoint: '' };
  let running = false, controller, stop = false;
  const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  function normalize(raw) {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:' || u.hostname !== 'www.cathay-ins.com.tw' || u.port || u.username || u.password || !u.pathname.includes('/knowledge-blog/')) throw Error('請輸入國泰產險 knowledge-blog 文章的 HTTPS 網址');
    u.hash = ''; return u.href;
  }
  function notice(s) { $('message').textContent = s; }
  function save() { try { localStorage.setItem(key, JSON.stringify(state)); } catch { notice('瀏覽器無法儲存，請匯出備份，以免關閉後遺失。'); } }
  try {
    const stored = JSON.parse(localStorage.getItem(key) || 'null');
    if (stored && Array.isArray(stored.urls) && Array.isArray(stored.results)) state = { ...stored, urls: [...new Set(stored.urls.map(normalize))] };
  } catch { notice('無法讀取先前清單，已載入原始 58 篇。'); }
  $('endpoint').value = state.endpoint || 'https://cathay-article-crawler.irischien90.workers.dev/';
  function render() {
    $('article-total').textContent = state.urls.length;
    const active = state.urls.map(url => state.results.find(r => r.inputUrl === url) || { inputUrl: url, title: '尚未爬取', links: [] });
    $('url-list').innerHTML = active.map((r,i) => `<div class="managed-row"><span>${i+1}.</span><div><strong>${escape(r.title || '尚未爬取')}</strong><br><a class="source" href="${escape(r.inputUrl)}" target="_blank" rel="noopener noreferrer">${escape(r.inputUrl)}</a><div class="meta">${r.error ? '本次失敗：'+escape(r.error)+'；下方保留前次結果' : r.checkedAt ? '最後抓取：'+escape(new Date(r.checkedAt).toLocaleString()) : r.ok ? '原始報表資料' : '尚未爬取'}</div></div><button data-remove="${i}" ${running?'disabled':''}>移除</button></div>`).join('');
    const stats = document.querySelectorAll('.stat strong');
    const links = active.flatMap(r => r.links || []);
    [active.length, links.length, new Set(links.map(l => l.url)).size, active.filter(r => r.error || r.ok === false).length].forEach((n,i) => stats[i].textContent = n);
    const term = $('q').value.trim().toLowerCase();
    let shown = active.filter(r => `${r.title} ${r.inputUrl} ${(r.links||[]).map(l => l.url+' '+l.text).join(' ')}`.toLowerCase().includes(term));
    if ($('filter').value === 'linked') shown = shown.filter(r => r.links?.length);
    if ($('filter').value === 'empty') shown = shown.filter(r => r.ok && !r.links?.length);
    if ($('filter').value === 'errors') shown = shown.filter(r => r.error || r.ok === false);
    if ($('sort').value !== 'index') shown.sort((a,b) => ($('sort').value === 'count-desc' ? -1 : 1)*((a.links?.length||0)-(b.links?.length||0)));
    $('list').innerHTML = shown.map(r => `<section class="article-card"><div class="article-head"><div><div class="article-number">#${state.urls.indexOf(r.inputUrl)+1}</div><h2>${escape(r.title || '尚未爬取')}</h2><a class="source" href="${escape(r.inputUrl)}" target="_blank" rel="noopener noreferrer">${escape(r.inputUrl)}</a>${r.error?`<p class="error">本次抓取失敗：${escape(r.error)}。以下如有連結，為前次資料。</p>`:''}</div><div class="count">${r.links?.length||0}<span>links</span></div></div><div class="links">${(r.links||[]).map(l => `<a class="link-row ${l.type==='internal'?'internal':'external'}" href="${escape(/^https?:\/\//i.test(l.url)?l.url:'#')}" target="_blank" rel="noopener noreferrer"><span class="link-text">${escape(l.text||'（無連結文字）')}</span><span class="link-url">${escape(l.url)}</span><span class="badge">${l.type==='internal'?'官網':'外部'}・未檢測有效性</span></a>`).join('') || '<p class="empty">'+(r.ok?'正文沒有引用連結。':'尚無可用結果。')+'</p>'}</div></section>`).join('') || '<p class="empty">沒有符合條件的文章。</p>';
    $('top-links').innerHTML = [...active].sort((a,b)=>(b.links?.length||0)-(a.links?.length||0)).slice(0,8).map(r=>`<div class="mini-row"><span>${escape(r.title||r.inputUrl)}</span><strong>${r.links?.length||0}</strong></div>`).join('');
  }
  function extract(data, inputUrl) {
    const doc = new DOMParser().parseFromString(data.html, 'text/html');
    const article = doc.querySelector('article');
    if (!article) throw Error('找不到 article 正文區塊，請人工確認頁面結構');
    article.querySelectorAll('header,footer,nav,aside,script,style,.breadcrumb,[role="navigation"],[role="contentinfo"],[role="banner"]').forEach(el=>el.remove());
    const found = new Map();
    for (const a of article.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href').trim(); if (!href || href.startsWith('#')) continue;
      try { const u = new URL(href, data.finalUrl); if (!['https:','http:'].includes(u.protocol)) continue;
        if (!found.has(u.href)) found.set(u.href,{ url:u.href, text:a.textContent.trim()||a.querySelector('img')?.alt||'', type:u.hostname==='www.cathay-ins.com.tw'?'internal':'external' });
      } catch { /* Invalid destination is not a navigable HTTP link. */ }
    }
    const links = [...found.values()];
    return { inputUrl, finalUrl:data.finalUrl, title:article.querySelector('h1')?.textContent.trim()||doc.title||inputUrl, status:data.status, ok:true, checkedAt:new Date().toISOString(), articleSelector:'article', links, linkCount:links.length };
  }
  $('add-urls').onclick = () => {
    try {
      const inputs = $('new-urls').value.split(/\s+/).filter(Boolean).map(normalize);
      const before = state.urls.length; state.urls = [...new Set([...state.urls,...inputs])];
      notice(`已新增 ${state.urls.length-before} 篇，略過 ${inputs.length-(state.urls.length-before)} 個重複網址。`);
      $('new-urls').value = ''; save(); render();
    } catch(e) { notice(e.message+'；本次未新增任何網址。'); }
  };
  $('url-list').onclick = e => { const button=e.target.closest('[data-remove]'); if(!button||running)return; state.urls.splice(Number(button.dataset.remove),1); save();render(); };
  $('export').onclick = () => {
    const blob = new Blob([JSON.stringify({urls:state.urls,results:state.results.filter(r=>state.urls.includes(r.inputUrl))},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='文章盤點備份.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  $('import').onchange = async e => {
    try { const file=e.target.files[0]; if(!file)return; if(file.size>5_000_000)throw Error('備份檔過大');
      const data=JSON.parse(await file.text()); const urls=(data.urls||data.results?.map(r=>r.inputUrl)); if(!Array.isArray(urls))throw Error('找不到文章清單');
      const clean=urls.map(normalize);state.urls=[...new Set([...state.urls,...clean])];save();render();notice('已匯入文章網址；按開始爬取可更新內容。');
    }catch(e){notice('匯入失敗：'+e.message);}finally{e.target.value='';}
  };
  $('start').onclick = async () => {
    let endpoint;
    try {endpoint=new URL($('endpoint').value);if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password)throw Error();}catch{notice('請先在服務設定填入有效的 HTTPS 爬取服務網址。');$('settings').open=true;return;}
    if(!$('api-key').value){notice('請輸入爬取服務密碼。');$('settings').open=true;return;}
    if(!state.urls.length){notice('請先新增文章網址。');return;}
    state.endpoint=endpoint.href;save();running=true;stop=false;
    ['start','add-urls','import','endpoint','api-key'].forEach(id=>$(id).disabled=true);$('stop').disabled=false;render();
    const urls=[...state.urls];let completed=0,failures=0;$('progress').max=urls.length;$('progress').value=0;
    for(const url of urls){
      if(stop)break;notice(`正在抓取 ${completed+1}/${urls.length}：${url}`);controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),35000);
      try{
        const res=await fetch(endpoint.href,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${$('api-key').value}`},body:JSON.stringify({url}),signal:controller.signal});
        const data=await res.json();if(!res.ok||data.error)throw Error(data.error||`服務 HTTP ${res.status}`);
        const result=extract(data,url);state.results=state.results.filter(r=>r.inputUrl!==url);state.results.push(result);
      }catch(e){if(stop)break;failures++;const old=state.results.find(r=>r.inputUrl===url);const result={...(old||{inputUrl:url,links:[],ok:false}),error:e.name==='AbortError'?'讀取逾時':e.message};state.results=state.results.filter(r=>r.inputUrl!==url);state.results.push(result);
      }finally{clearTimeout(timer);}
      completed++;$('progress').value=completed;save();render();
    }
    running=false;['start','add-urls','import','endpoint','api-key'].forEach(id=>$(id).disabled=false);$('stop').disabled=true;render();
    notice(`${stop?'已停止':'爬取完成'}：處理 ${completed}/${urls.length} 篇，成功 ${completed-failures} 篇，失敗 ${failures} 篇。連結是否過期或 404 仍需另行檢查。`);
  };
  $('stop').onclick=()=>{stop=true;controller?.abort();};
  ['q','filter','sort'].forEach(id=>$(id).addEventListener('input',render));
  render();
})();
