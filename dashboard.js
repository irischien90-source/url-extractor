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
  const Audit = ContentAudit;
  state.policyOverrides ||= {};
  $('audit-year').value = state.auditYear || '2026';
  function chosenYear() { return /^(19|20|21)\d{2}$/.test($('audit-year').value) ? $('audit-year').value : null; }
  function policyFor(r) {
    const automatic = r.audit?.policy || Audit.classifyPolicy(r.title || '');
    const override = state.policyOverrides[r.inputUrl];
    return { ...automatic, level: override === 'policy' ? 'confirmed' : override === 'none' ? 'excluded' : automatic.level, preliminary: !r.audit, override: override || 'auto' };
  }
  const labels = { likely: '建議年度複查', possible: '可能涉及政策，待確認', none: '未命中政策規則', confirmed: '已人工標記為政策', excluded: '已人工排除' };
  const kinds = { body:'正文', seo:'SEO／OG／Meta', attribute:'圖片與文字屬性', structured:'JSON-LD 結構化資料', shared:'共用區塊／正文以外', technical:'網址／日期／技術屬性' };
  function findingsFor(r) { return chosenYear() ? Audit.yearFindings(r.audit, chosenYear()) : []; }
  function highlighted(text) { return escape(text).split(chosenYear() || '\u0000').join(`<mark>${escape(chosenYear())}</mark>`); }
  function auditCard(r) {
    const findings = findingsFor(r), policy = policyFor(r);
    const year = chosenYear();
    const yearSummary = !r.audit ? '尚未盤點完整 HTML，請重新爬取' : !year ? '請輸入 1900–2199 的四位數年份' : `${year}：${findings.length} 個命中欄位／文字片段`;
    const titleHint = !r.audit && year && (r.title || '').includes(year) ? `<p>舊報表標題已包含 <mark>${year}</mark>；正文與 Meta 仍待抓取。</p>` : '';
    return `<section class="article-card audit-card"><div class="article-head"><div><div class="article-number">#${state.urls.indexOf(r.inputUrl)+1}</div><h2>${escape(r.title || '尚未爬取')}</h2><a class="source" href="${escape(r.inputUrl)}" target="_blank" rel="noopener noreferrer">${escape(r.inputUrl)}</a></div></div><div class="audit-content">
      ${r.error ? `<p class="error">本次爬取異常：${escape(r.error)}。${r.audit ? '以下為最近取得的 HTML 盤點，請核對時間與範圍警示。' : '尚無完整盤點資料。'}</p>` : ''}
      <p class="meta">${r.audit ? '盤點時間：'+escape(new Date(r.audit.capturedAt).toLocaleString()) : '目前僅能根據舊標題初步分類，不能確認完整內容。'}</p>
      <div class="audit-tags"><strong>${escape(yearSummary)}</strong><span class="badge">${escape(labels[policy.level])}${policy.preliminary ? '（僅標題初判）' : ''}</span></div>${titleHint}
      <label>政策分類人工覆核 <select data-policy-url="${escape(r.inputUrl)}"><option value="auto" ${policy.override==='auto'?'selected':''}>依關鍵字規則判斷</option><option value="policy" ${policy.override==='policy'?'selected':''}>確認為需年度複查的政策文章</option><option value="none" ${policy.override==='none'?'selected':''}>排除政策文章</option></select></label>
      ${policy.evidence.length ? `<details ${$('audit-view').value==='policy'?'open':''}><summary>政策判斷依據：${escape(policy.categories.join('、'))}</summary>${policy.evidence.map(e=>`<p><strong>${escape(e.category)} · ${escape(e.location)}</strong><br>命中：${escape(e.keywords.join('、'))}<br><span class="meta">${escape(e.excerpt)}</span></p>`).join('')}</details>` : '<p class="meta">未命中規則不代表沒有年度更新需求，可用上方選單手動標記。</p>'}
      ${(r.audit?.warnings||[]).map(w=>`<p class="error">${escape(w)}</p>`).join('')}
      ${findings.length ? `<details open><summary>年份命中明細（${findings.length} 項）</summary><div class="finding-list">${findings.slice(0,100).map(f=>`<div class="finding"><span class="badge">${escape(kinds[f.kind]||f.kind)}</span> <strong>${escape(f.location)}</strong><span class="meta"> · ${f.count} 次</span><p>${highlighted(f.excerpt)}</p>${f.caution?`<p class="meta">${escape(f.caution)}</p>`:''}<details><summary>查看完整欄位／文字片段</summary><p>${highlighted(f.text)}</p></details></div>`).join('')}</div>${findings.length>100?'<p>畫面顯示前 100 項；CSV 包含所有命中欄位與完整文字。</p>':''}</details>` : r.audit && year ? '<p class="meta">這次取得的靜態 HTML 未命中指定年份；不包含圖片內文字與 JavaScript 執行後才產生的內容。</p>' : ''}
      </div></section>`;
  }
  function auditSummary(active) {
    const scanned = active.filter(r => r.audit);
    const candidates = active.filter(r => ['likely','possible','confirmed'].includes(policyFor(r).level));
    $('audit-summary').textContent = `完整 HTML 已盤點 ${scanned.length}/${active.length} 篇；${chosenYear()||'有效年份未選定'} 命中 ${scanned.filter(r=>findingsFor(r).length).length} 篇；政策複查候選 ${candidates.length} 篇（其中 ${candidates.filter(r=>!r.audit).length} 篇僅標題初判）；本次抓取異常 ${active.filter(r=>r.error).length} 篇。`;
  }
  function render() {
    $('article-total').textContent = state.urls.length;
    const active = state.urls.map(url => state.results.find(r => r.inputUrl === url) || { inputUrl: url, title: '尚未爬取', links: [] });
    auditSummary(active);
    $('url-list').innerHTML = active.map((r,i) => `<div class="managed-row"><span>${i+1}.</span><div><strong>${escape(r.title || '尚未爬取')}</strong><br><a class="source" href="${escape(r.inputUrl)}" target="_blank" rel="noopener noreferrer">${escape(r.inputUrl)}</a><div class="meta">${r.error ? '本次失敗：'+escape(r.error)+'；下方保留前次結果' : r.checkedAt ? '最後抓取：'+escape(new Date(r.checkedAt).toLocaleString()) : r.ok ? '原始報表資料' : '尚未爬取'}</div></div><button data-remove="${i}" ${running?'disabled':''}>移除</button></div>`).join('');
    const stats = document.querySelectorAll('.stat strong');
    const links = active.flatMap(r => r.links || []);
    [active.length, links.length, new Set(links.map(l => l.url)).size, active.filter(r => r.error || r.ok === false).length].forEach((n,i) => stats[i].textContent = n);
    const term = $('q').value.trim().toLowerCase();
    let shown = active.filter(r => `${r.title} ${r.inputUrl} ${(r.links||[]).map(l => l.url+' '+l.text).join(' ')} ${(r.audit?.fields||[]).map(f=>f.location+' '+f.text).join(' ')}`.toLowerCase().includes(term));
    if ($('filter').value === 'linked') shown = shown.filter(r => r.links?.length);
    if ($('filter').value === 'empty') shown = shown.filter(r => r.ok && !r.links?.length);
    if ($('filter').value === 'errors') shown = shown.filter(r => r.error || r.ok === false);
    if ($('sort').value !== 'index') shown.sort((a,b) => ($('sort').value === 'count-desc' ? -1 : 1)*((a.links?.length||0)-(b.links?.length||0)));
    $('list').innerHTML = shown.map(r => `<section class="article-card"><div class="article-head"><div><div class="article-number">#${state.urls.indexOf(r.inputUrl)+1}</div><h2>${escape(r.title || '尚未爬取')}</h2><a class="source" href="${escape(r.inputUrl)}" target="_blank" rel="noopener noreferrer">${escape(r.inputUrl)}</a>${r.error?`<p class="error">本次抓取失敗：${escape(r.error)}。以下如有連結，為前次資料。</p>`:''}</div><div class="count">${r.links?.length||0}<span>links</span></div></div><div class="links">${(r.links||[]).map(l => `<a class="link-row ${l.type==='internal'?'internal':'external'}" href="${escape(/^https?:\/\//i.test(l.url)?l.url:'#')}" target="_blank" rel="noopener noreferrer"><span class="link-text">${escape(l.text||'（無連結文字）')}</span><span class="link-url">${escape(l.url)}</span><span class="badge">${l.type==='internal'?'官網':'外部'}・未檢測有效性</span></a>`).join('') || '<p class="empty">'+(r.ok?'正文沒有引用連結。':'尚無可用結果。')+'</p>'}</div></section>`).join('') || '<p class="empty">沒有符合條件的文章。</p>';
    $('top-links').innerHTML = [...active].sort((a,b)=>(b.links?.length||0)-(a.links?.length||0)).slice(0,8).map(r=>`<div class="mini-row"><span>${escape(r.title||r.inputUrl)}</span><strong>${r.links?.length||0}</strong></div>`).join('');
    if ($('audit-view').value !== 'links') {
      if ($('audit-view').value === 'year') shown = shown.filter(r => findingsFor(r).length || (!r.audit && chosenYear() && (r.title||'').includes(chosenYear())));
      if ($('audit-view').value === 'policy') shown = shown.filter(r => ['likely','possible','confirmed'].includes(policyFor(r).level));
      if ($('audit-view').value === 'pending') shown = shown.filter(r => !r.audit || r.error);
      $('list').innerHTML = shown.map(auditCard).join('') || '<p class="empty">目前篩選沒有符合的文章。尚未盤點的文章請重新爬取；這不代表所有文章都不含該年份。</p>';
    }
  }
  function extract(data, inputUrl) {
    const doc = new DOMParser().parseFromString(data.html, 'text/html');
    const audit = Audit.capture(doc, data.finalUrl);
    const article = doc.querySelector('article');
    if (!article) return { inputUrl, finalUrl:data.finalUrl, title:doc.title||inputUrl, status:data.status, ok:false, error:'找不到 article；已保存 Meta 等 HTML 年份盤點，正文連結無法確認', audit, links:[], checkedAt:new Date().toISOString() };
    article.querySelectorAll('header,footer,nav,aside,script,style,.breadcrumb,[role="navigation"],[role="contentinfo"],[role="banner"]').forEach(el=>el.remove());
    const found = new Map();
    for (const a of article.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href').trim(); if (!href || href.startsWith('#')) continue;
      try { const u = new URL(href, data.finalUrl); if (!['https:','http:'].includes(u.protocol)) continue;
        if (!found.has(u.href)) found.set(u.href,{ url:u.href, text:a.textContent.trim()||a.querySelector('img')?.alt||'', type:u.hostname==='www.cathay-ins.com.tw'?'internal':'external' });
      } catch { /* Invalid destination is not a navigable HTTP link. */ }
    }
    const links = [...found.values()];
    return { inputUrl, finalUrl:data.finalUrl, title:article.querySelector('h1')?.textContent.trim()||doc.title||inputUrl, status:data.status, ok:true, checkedAt:new Date().toISOString(), articleSelector:'article', links, linkCount:links.length, audit };
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
    const blob = new Blob([JSON.stringify({urls:state.urls,results:state.results.filter(r=>state.urls.includes(r.inputUrl)),policyOverrides:state.policyOverrides,auditYear:chosenYear()},null,2)],{type:'application/json'});
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
        const result=extract(data,url);if(result.error){failures++;result.links=state.results.find(r=>r.inputUrl===url)?.links||[];}state.results=state.results.filter(r=>r.inputUrl!==url);state.results.push(result);
      }catch(e){if(stop)break;failures++;const old=state.results.find(r=>r.inputUrl===url);const result={...(old||{inputUrl:url,links:[],ok:false}),error:e.name==='AbortError'?'讀取逾時':e.message};state.results=state.results.filter(r=>r.inputUrl!==url);state.results.push(result);
      }finally{clearTimeout(timer);}
      completed++;$('progress').value=completed;save();render();
    }
    running=false;['start','add-urls','import','endpoint','api-key'].forEach(id=>$(id).disabled=false);$('stop').disabled=true;render();
    notice(`${stop?'已停止':'爬取完成'}：處理 ${completed}/${urls.length} 篇，成功 ${completed-failures} 篇，失敗 ${failures} 篇。連結是否過期或 404 仍需另行檢查。`);
  };
  $('stop').onclick=()=>{stop=true;controller?.abort();};
  ['q','filter','sort'].forEach(id=>$(id).addEventListener('input',render));
  $('audit-view').addEventListener('change', render);
  $('audit-year').addEventListener('input', () => { if(chosenYear()){state.auditYear=chosenYear();save();} render(); });
  $('list').addEventListener('change', e => { if(!e.target.matches('[data-policy-url]'))return;state.policyOverrides[e.target.dataset.policyUrl]=e.target.value;save();render(); });
  $('export-audit').onclick = () => {
    if(!chosenYear()){notice('請先輸入 1900–2199 的四位數年份。');return;}
    const rows = [['文章標題','文章網址','盤點時間','資料狀態','政策分類','政策類別','判斷依據','目標年份','位置類型','命中位置','命中次數','完整命中文字','處理提醒']];
    for (const url of state.urls) {
      const r=state.results.find(r=>r.inputUrl===url)||{inputUrl:url,title:'尚未爬取'};
      const policy=policyFor(r), findings=findingsFor(r);
      const status=!r.audit?'未盤點完整 HTML':r.error?'本次異常，請查看錯誤／上次資料':r.audit.warnings?.length?'已盤點，有範圍警示':'已盤點靜態 HTML';
      const base=[r.title,url,r.audit?.capturedAt||'',status,labels[policy.level]+(policy.preliminary?'（僅標題初判）':''),policy.categories.join('、'),policy.evidence.map(e=>e.location+': '+e.keywords.join('、')+' — '+e.excerpt).join('\n'),chosenYear()];
      if(findings.length) for(const f of findings)rows.push([...base,kinds[f.kind]||f.kind,f.location,f.count,f.text,[f.caution,r.error,...(r.audit?.warnings||[])].filter(Boolean).join('；')]);
      else rows.push([...base,'',r.audit?'未命中':'未知（需重新爬取）',r.audit?0:'','',[r.error,...(r.audit?.warnings||[])].filter(Boolean).join('；')]);
    }
    const url=URL.createObjectURL(new Blob([Audit.csv(rows)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`年度內容盤點-${chosenYear()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    notice('已匯出全部管理文章的年份明細與政策依據（不受畫面篩選限制）。');
  };
  render();
})();
