(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ContentAudit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = 1;
  const common = 'header,footer,nav,aside,.breadcrumb,[role="navigation"],[role="contentinfo"],[role="banner"]';
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const rules = [
    { category: '補助與汰舊換新', pattern: /寵物(?:保險|險)?補助|舊換新|汰舊|購車補助|電動(?:機車|車)補助|租屋補助|育兒補助|節能補助|補助(?:金額|申請|資格|方案|政策)|政府補助|保險補助/g },
    { category: '稅務與規費', pattern: /房屋稅|牌照稅|汽車稅|機車稅|汽機車稅|燃料(?:稅|費)|公路養管費|所得稅|地價稅|貨物稅|退稅|免稅額|扣除額/g },
    { category: '法規與強制規定', pattern: /法規|修法|新制|掛牌|寵物登記|寵登|強制投保|最低工資|基本工資|勞保|勞退|健保(?:費|新制)/g },
    { category: '入境、簽證與公共政策', pattern: /入境規定|入境新制|免簽|簽證(?:規定|政策|新制)|數位入境卡|電子入境卡|育嬰(?:假|留停)|生育津貼/g }
  ];
  function snippet(text, keyword, width = 65) {
    const i = text.indexOf(keyword);
    if (i < 0) return text.slice(0, width * 2);
    return (i > width ? '…' : '') + text.slice(Math.max(0, i - width), i + keyword.length + width) + (i + keyword.length + width < text.length ? '…' : '');
  }
  function classifyPolicy(title, description = '', body = '') {
    const evidence = [];
    for (const rule of rules) {
      for (const [location, text, weight] of [['文章標題', title, 3], ['SEO 摘要', description, 2], ['正文（不含連結文字）', body, 1]]) {
        const keywords = [...new Set(text.match(rule.pattern) || [])];
        if (keywords.length) evidence.push({ category: rule.category, location, keywords, excerpt: snippet(text, keywords[0]), weight });
      }
    }
    return { level: evidence.some(e => e.weight >= 2) ? 'likely' : evidence.length ? 'possible' : 'none', categories: [...new Set(evidence.map(e => e.category))], evidence };
  }
  function capture(doc, finalUrl) {
    const fields = [];
    const add = (kind, location, value, caution = '') => {
      const text = clean(value);
      // Keep every year-bearing field, allowing future year searches without another fetch.
      if (/(?:19|20|21)\d{2}/.test(text)) fields.push({ kind, location, text, caution });
    };
    add('seo', 'HTML <title>', doc.title);
    doc.querySelectorAll('meta').forEach((meta, i) => {
      const name = meta.getAttribute('property') || meta.getAttribute('name') || meta.getAttribute('itemprop') || meta.getAttribute('http-equiv') || `第 ${i + 1} 個 meta`;
      const caution = /date|time|published|modified/i.test(name) ? '發布／修改日期：請核對實際日期，不要直接替換年份。' : /image|url/i.test(name) ? '資源網址：請確認檔案或目標頁，不要直接改網址。' : '';
      add('seo', `Meta ${name}`, meta.getAttribute('content'), caution);
    });
    const article = doc.querySelector('article');
    const walker = doc.createTreeWalker(doc.body, 4);
    let node, textIndex = 0;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || parent.closest('script,style,noscript,template')) continue;
      const text = clean(node.textContent); if (!text) continue;
      textIndex++;
      const inArticle = article?.contains(parent) && !parent.closest(common);
      const hidden = parent.closest('[hidden],[aria-hidden="true"],[style*="display:none"],[style*="display: none"]');
      add(inArticle ? 'body' : 'shared', `${inArticle ? '正文' : '正文以外／共用區塊'} · ${parent.localName}${hidden ? '（HTML 標示隱藏）' : ''} · 文字 ${textIndex}`, text, inArticle ? '' : '共用頁首、頁尾或正文以外文字，需確認是否由模板統一更新。');
    }
    doc.querySelectorAll('*').forEach((el, index) => {
      if (el.localName === 'meta') return;
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name;
        if (!['alt','title','aria-label','href','src','srcset','datetime','content','value'].includes(name) && !name.startsWith('data-')) continue;
        const editorial = ['alt','title','aria-label'].includes(name);
        add(editorial ? 'attribute' : 'technical', `${el.localName}${el.id ? '#'+el.id : ''}[${name}] · 元素 ${index + 1}`, attr.value, editorial ? '' : '網址、日期或技術屬性：命中不代表需要更改。');
      }
    });
    const warnings = [];
    doc.querySelectorAll('script[type="application/ld+json"]').forEach((script, i) => {
      try {
        const visit = (value, path, depth = 0) => {
          if (depth > 60) { warnings.push(`JSON-LD ${i + 1} 層級超過限制，部分欄位未盤點。`); return; }
          if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => visit(child, `${path}.${key}`, depth + 1));
          else add('structured', path, String(value ?? ''), /date|published|modified|url|image|@id/i.test(path) ? '結構化日期／資源欄位：需核對原始資料，不要直接換年。' : '結構化資料需與文章內容一致。');
        };
        visit(JSON.parse(script.textContent), `JSON-LD ${i + 1}`);
      } catch { add('structured', `JSON-LD ${i + 1}（格式無法解析，保留原文）`, script.textContent); warnings.push(`JSON-LD ${i + 1} 不是有效 JSON，請檢查。`); }
    });
    add('technical', '文章最終網址', finalUrl, '文章網址：更改可能需要重新導向，不要直接替換年份。');
    const content = article?.cloneNode(true);
    // A linked recommendation alone must not turn an unrelated article into a policy article.
    content?.querySelectorAll(`${common},script,style,a,.related-articles,.related-posts`).forEach(el => el.remove());
    const title = clean(article?.querySelector('h1')?.textContent || doc.title);
    const description = Array.from(doc.querySelectorAll('meta')).filter(el => /^(description|og:description|twitter:description)$/i.test(el.getAttribute('name') || el.getAttribute('property') || '')).map(el => el.getAttribute('content') || '').join(' ');
    if (!article) warnings.push('找不到 article；已盤點 SEO 與其他 HTML，但無法確認正文範圍。');
    return { version: VERSION, capturedAt: new Date().toISOString(), fields, warnings, hasArticle: !!article, policy: classifyPolicy(title, clean(description), clean(content?.textContent)) };
  }
  function yearFindings(audit, year) {
    if (!/^(19|20|21)\d{2}$/.test(String(year))) return [];
    return (audit?.fields || []).filter(f => f.text.includes(String(year))).map(f => ({ ...f, count: f.text.split(String(year)).length - 1, excerpt: snippet(f.text, String(year)) }));
  }
  function csv(rows) {
    return '\ufeff' + rows.map(row => row.map(value => {
      let text = String(value ?? '');
      if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    }).join(',')).join('\r\n');
  }
  return { VERSION, capture, yearFindings, classifyPolicy, snippet, csv };
});
