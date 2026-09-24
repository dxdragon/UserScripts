// ==UserScript==
// @name         搜索引擎双列
// @namespace    local
// @version      1.0
// @description  去广告 + 双列卡片（响应式）
// @author       local
// @run-at       document-start
// @include      *://www.baidu.com/*
// @include      *://m.baidu.com/*
// @include      *://*.bing.com/*
// @include      *://*.google*/search*
// @include      *://www.so.com/s?*
// @include      *://*.duckduckgo.com/*
// @include      *://*.startpage.com/*
// @include      *://search.brave.com/*
// @grant        GM_addStyle
// @updateURL    https://raw.githubusercontent.com/dxdragon/UserScripts/raw/main/searchengine_two_column.user.js
// @downloadURL  https://raw.githubusercontent.com/dxdragon/UserScripts/raw/main/searchengine_two_column.user.js
// ==/UserScript==

(() => {
  'use strict';

  const SITE = (() => {
    const h = location.host;
    if (h.includes('baidu.com')) return 'baidu';
    if (h.includes('google')) return 'google';
    if (h.includes('bing.com')) return 'bing';
    if (h.includes('so.com')) return 'haosou';
    if (h.includes('duckduckgo.com')) return 'duck';
    if (h.includes('startpage.com')) return 'startpage';
    if (h.includes('brave.com')) return 'brave';
    return '';
  })();
  if (!SITE) return;

  const CFG = {
    baidu: { item: '#content_left > .c-container', link: 'h3.t > a, .c-container article a', root: '#content_left', colW: 600 },
    google: { item: '#rso > .MjjYud, #rso > div.g', link: '.zReHs, h3 a', root: '#rso', colW: 620 },
    bing: { item: '#b_results > li.b_algo', link: 'h2 > a', root: '#b_results', colW: 600 },
    haosou: { item: '.results > .res-list', link: 'h3 > a', root: '.results', colW: 600 },
    duck: { item: '.react-results--main > li', link: 'h2 a', root: '.react-results--main', colW: 600 },
    startpage: { item: '.w-gl > *', link: 'a[href]', root: '.w-gl', colW: 700 },
    brave: { item: 'div[data-type="web"], .snippet.fdb', link: 'a.search-snippet-title, .snippet-title a, a[href]', root: '#results, .snippet-list', colW: 600 },
  }[SITE];

  const CONTAINER_W = CFG.colW * 2 + 20;
  const COL_MIN = 320;
  const CONTAINER_WIDTH_CSS = `min(${CONTAINER_W}px, calc(100vw - 40px))`;

  const CARD_CSS = `
    flex: 0 1 calc(50% - 10px) !important;
    min-width: ${COL_MIN}px !important;
    max-width: ${CFG.colW}px !important;
    box-sizing: border-box !important;
    border: 1px solid #e0e0e0 !important;
    border-radius: 8px !important;
    padding: 16px !important;
    background: #fff !important;
    margin: 0 !important;
    float: none !important;
    height: auto !important;
    align-self: flex-start !important;
  `;

  const FULLROW_CSS = `
    flex: 1 0 100% !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    box-sizing: border-box !important;
    border: none !important;
    padding: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    margin: 0 !important;
  `;

  const FLEX_ROOT_CSS = `
    display: flex !important;
    flex-wrap: wrap !important;
    align-content: flex-start !important;
    align-items: flex-start !important;
    justify-content: space-between !important;
    gap: 16px 20px !important;
    width: ${CONTAINER_WIDTH_CSS} !important;
    min-width: 0 !important;
    max-width: none !important;
    margin: 0 auto !important;
    padding: 0 !important;
    box-sizing: border-box !important;
    float: none !important;
  `;

  const CSS_BASE = `
    /* ===== 加载动画 ===== */
    .ac-loading-spinner {
      position: fixed; top: 220px; left: 0; right: 0;
      display: flex; justify-content: center; z-index: 99999;
      pointer-events: none; transition: opacity .3s;
    }
    .ac-loading-spinner > div {
      width: 4px; height: 26px; background: #4e6ef2;
      border-radius: 2px; margin: 0 2px;
      animation: ac-bar-fast .3s ease-in-out infinite;
    }
    .ac-loading-spinner > div:nth-child(2) { animation-delay: .05s; }
    .ac-loading-spinner > div:nth-child(3) { animation-delay: .1s; }
    .ac-loading-spinner > div:nth-child(4) { animation-delay: .15s; }
    .ac-loading-spinner > div:nth-child(5) { animation-delay: .2s; }
    @keyframes ac-bar-fast {
      0%, 100% { transform: scaleY(.4); opacity: .5; }
      50% { transform: scaleY(1.4); opacity: 1; }
    }
    body.ac-ready .ac-loading-spinner { opacity: 0; pointer-events: none; }

    /* =========================================================
     * 百度
     * ========================================================= */
    body.ac-two-col.baidu #wrapper,
    body.ac-two-col.baidu #container {
      display: block !important;
      width: 100% !important;
      max-width: none !important;
      float: none !important;
    }
    body.ac-two-col.baidu #content_left { ${FLEX_ROOT_CSS} }
    body.ac-two-col.baidu #content_left > .c-container { ${CARD_CSS} }
    body.ac-two-col.baidu #content_left > [tpl]:not(.c-container) { ${FULLROW_CSS} }
    body.ac-two-col.baidu #content_right { display: none !important; }
    .minidiv #logo img { width: 100px; height: unset; margin-top: 0.3rem; }
    .opr-recommends-merge-imgtext { display: none !important; }
    .res_top_banner { display: none !important; }
    .headBlock, body > div.result-op { display: none; }

    /* =========================================================
     * 谷歌
     * ★ 策略：
     *   - 不动 #center_col 宽度（原生 1100px）
     *   - 不动知识面板
     *   - #rso 用 JS 精确计算 left 值使其相对视口居中
     * ========================================================= */
    body.ac-two-col.google #center_col {
      overflow: visible !important;
    }

    /* 初始兜底（JS 未跑时先按这个显示，JS 跑了之后会覆盖） */
    body.ac-two-col.google #rso {
      display: flex !important;
      flex-wrap: wrap !important;
      align-content: flex-start !important;
      align-items: flex-start !important;
      justify-content: space-between !important;
      gap: 16px 20px !important;
      width: ${CONTAINER_WIDTH_CSS} !important;
      max-width: none !important;
      min-width: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      box-sizing: border-box !important;
      float: none !important;
      position: relative !important;
    }

    body.ac-two-col.google #rso > .ac-card { ${CARD_CSS} }
    body.ac-two-col.google #rso > .ac-empty { display: none !important; }
    body.ac-two-col.google #rso > .ac-fullrow { ${FULLROW_CSS} }

    body.ac-two-col.google #bottomads,
    body.ac-two-col.google #tads,
    body.ac-two-col.google #tadsb { display: none !important; }

    /* =========================================================
     * 必应
     * ========================================================= */
    body.ac-two-col.bing #b_content {
      display: flex !important;
      justify-content: center !important;
      align-items: flex-start !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: none !important;
      padding-left: 0 !important;
      padding-right: 0 !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
      box-sizing: border-box !important;
      float: none !important;
    }
    body.ac-two-col.bing #b_results { ${FLEX_ROOT_CSS} }
    body.ac-two-col.bing #b_results > li.b_algo { ${CARD_CSS} }
    body.ac-two-col.bing #b_results > li.b_ans,
    body.ac-two-col.bing #b_results > li.b_pag { ${FULLROW_CSS} }

    body.ac-two-col.bing #b_results > li.b_ans *,
    body.ac-two-col.bing #b_results > li.b_pag * {
      max-width: 100% !important;
      box-sizing: border-box !important;
    }
    body.ac-two-col.bing #b_results > li.b_ans .b_rs,
    body.ac-two-col.bing #b_results > li.b_ans .b_rs ul,
    body.ac-two-col.bing #b_results > li.b_ans .b_rs ol,
    body.ac-two-col.bing #b_results > li.b_ans table,
    body.ac-two-col.bing #b_results > li.b_ans .b_vList {
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
    }
    body.ac-two-col.bing #b_results > li.b_ans .b_rs ul {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      column-gap: 20px !important;
      row-gap: 8px !important;
      padding: 0 !important;
      margin: 0 !important;
    }
    body.ac-two-col.bing #b_results > li.b_ans .b_rs li {
      width: auto !important;
      min-width: 0 !important;
    }

    body.ac-two-col.bing #b_context,
    body.ac-two-col.bing .b_ad { display: none !important; }

    body.ac-two-col.bing #b_copilot_search,
    body.ac-two-col.bing .b_copilot_search,
    body.ac-two-col.bing .b_copilot_search_container,
    body.ac-two-col.bing [data-copilot-search],
    body.ac-two-col.bing #b_copilot,
    body.ac-two-col.bing .b_copilotContainer,
    body.ac-two-col.bing iframe[id*="copilot" i],
    body.ac-two-col.bing iframe[src*="copilot" i] { display: none !important; }

    /* =========================================================
     * 好搜
     * ========================================================= */
    body.ac-two-col.haosou #container,
    body.ac-two-col.haosou #main {
      display: block !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: none !important;
      float: none !important;
    }
    body.ac-two-col.haosou .results { ${FLEX_ROOT_CSS} }
    body.ac-two-col.haosou .results > .res-list { ${CARD_CSS} }
    body.ac-two-col.haosou .results > li:not(.res-list) { ${FULLROW_CSS} }
    body.ac-two-col.haosou #righttop_box,
    body.ac-two-col.haosou #m-spread-left,
    body.ac-two-col.haosou #m-spread-bottom { display: none !important; }

    /* =========================================================
     * DuckDuckGo
     * ========================================================= */
    body.ac-two-col.duck .react-results--main { ${FLEX_ROOT_CSS} }
    body.ac-two-col.duck .react-results--main > li { ${CARD_CSS} }

    /* =========================================================
     * Startpage
     * ========================================================= */
    body.ac-two-col.startpage #main,
    body.ac-two-col.startpage main {
      display: block !important;
      width: ${CONTAINER_WIDTH_CSS} !important;
      min-width: 0 !important;
      max-width: none !important;
      margin-left: auto !important;
      margin-right: auto !important;
      padding-left: 0 !important;
      padding-right: 0 !important;
      box-sizing: border-box !important;
      float: none !important;
    }
    body.ac-two-col.startpage #main > *:not(.w-gl),
    body.ac-two-col.startpage main > *:not(.w-gl) {
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
      box-sizing: border-box !important;
      float: none !important;
    }
    body.ac-two-col.startpage .w-gl {
      display: flex !important;
      flex-wrap: wrap !important;
      align-content: flex-start !important;
      align-items: flex-start !important;
      justify-content: space-between !important;
      gap: 16px 20px !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: none !important;
      margin: 0 !important;
      padding: 0 !important;
      box-sizing: border-box !important;
      float: none !important;
    }
    body.ac-two-col.startpage .w-gl > * { ${CARD_CSS} }
    body.ac-two-col.startpage #sponsored,
    body.ac-two-col.startpage .sponsored { display: none !important; }

    body.ac-two-col.startpage { overflow-x: hidden !important; }
    body.ac-two-col.startpage #main,
    body.ac-two-col.startpage main { overflow-x: visible !important; }

    /* =========================================================
     * Brave Search
     * ========================================================= */
    body.ac-two-col.brave main {
      display: block !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: none !important;
    }
    body.ac-two-col.brave #results,
    body.ac-two-col.brave .snippet-list { ${FLEX_ROOT_CSS} }
    body.ac-two-col.brave div[data-type="web"],
    body.ac-two-col.brave .snippet.fdb { ${CARD_CSS} }
    body.ac-two-col.brave #search-elsewhere-result-wrapper,
    body.ac-two-col.brave .ad-slot { display: none !important; }

    /* =========================================================
     * 去广告
     * ========================================================= */
    #bottomads, .b_ad, #so_kw-ad,
    #m-spread-left, #m-spread-bottom,
    #sponsored, .ad-slot,
    div[aria-label="广告"], div[aria-label="Ads"],
    #search-elsewhere-result-wrapper,
    .result--ad, .js-result-ad { display: none !important; }
  `;

  GM_addStyle(CSS_BASE);

  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  function safeRemove(sel) {
    try { $$(sel).forEach(n => n.remove()); } catch {}
  }

  function markBody() {
    if (!document.body) return;
    document.body.classList.add(SITE, 'ac-two-col');
    document.body.setAttribute(SITE, '1');
  }

  /* ============================================================
   * 清理之前版本残留的内联样式
   * ============================================================ */
  function cleanupGoogleInlineStyles() {
    if (SITE !== 'google') return;

    const PROPS = [
      'width', 'max-width', 'min-width',
      'flex', 'flex-basis', 'flex-grow', 'flex-shrink',
      'grid-column', 'grid-column-start', 'grid-column-end',
      'grid-row', 'grid-template-columns', 'grid-template-rows',
      'grid-template-areas', 'grid-auto-flow',
      'margin-left', 'margin-right',
      'float', 'position', 'box-sizing', 'display',
      'align-self', 'justify-self', 'left', 'transform'
    ];

    const kps = document.querySelectorAll(
      '.kp-wholepage-osrp, [class*="kp-wholepage"], [data-attrid="title"]'
    );
    kps.forEach(kp => {
      let el = kp;
      let d = 0;
      while (el && el.tagName !== 'BODY' && el.tagName !== 'HTML' && d < 25) {
        PROPS.forEach(p => el.style.removeProperty(p));
        el = el.parentElement;
        d++;
      }
    });

    const rcnt = document.getElementById('rcnt');
    if (rcnt) PROPS.forEach(p => rcnt.style.removeProperty(p));
  }

  /* ============================================================
   * ★ 精确计算 #rso 的 left 偏移，让它相对"视口"居中
   * ============================================================ */
  function centerGoogleRso() {
    if (SITE !== 'google') return;
    const rso = document.getElementById('rso');
    const cc = document.getElementById('center_col');
    if (!rso || !cc) return;

    const vw = document.documentElement.clientWidth || window.innerWidth;
    const w = Math.min(CONTAINER_W, vw - 40);

    // #center_col 不能裁剪 #rso 的溢出部分
    cc.style.setProperty('overflow', 'visible', 'important');

    // 设置布局属性
    rso.style.setProperty('display', 'flex', 'important');
    rso.style.setProperty('flex-wrap', 'wrap', 'important');
    rso.style.setProperty('align-content', 'flex-start', 'important');
    rso.style.setProperty('align-items', 'flex-start', 'important');
    rso.style.setProperty('justify-content', 'space-between', 'important');
    rso.style.setProperty('gap', '16px 20px', 'important');
    rso.style.setProperty('width', w + 'px', 'important');
    rso.style.setProperty('max-width', 'none', 'important');
    rso.style.setProperty('min-width', '0', 'important');
    rso.style.setProperty('margin-left', '0', 'important');
    rso.style.setProperty('margin-right', '0', 'important');
    rso.style.setProperty('padding', '0', 'important');
    rso.style.setProperty('box-sizing', 'border-box', 'important');
    rso.style.setProperty('position', 'relative', 'important');
    rso.style.setProperty('float', 'none', 'important');

    // 先把 left 归零，测出"自然位置"
    rso.style.setProperty('left', '0px', 'important');
    // 强制回流
    void rso.offsetWidth;
    const naturalLeft = rso.getBoundingClientRect().left;

    // 目标位置：视口水平居中
    const desiredLeft = (vw - w) / 2;
    const offset = desiredLeft - naturalLeft;

    rso.style.setProperty('left', offset + 'px', 'important');
  }

  /* ============================================================
   * 判断：是否为"标准网页结果"
   * ============================================================ */
  function isStandardWebResult(el) {
    const h3 = el.querySelector('h3');
    if (!h3) return false;
    const a = h3.querySelector('a[href]') || h3.closest('a[href]');
    if (!a) return false;
    const href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return false;
    const text = (el.textContent || '');
    return /https?:\/\/[^\s]+\.[a-z]{2,}/i.test(text) ||
           /^[a-z0-9-]+(\.[a-z0-9-]+)+([\/?#]|$)/i.test(href) ||
           !!el.querySelector('cite');
  }

  function normalizeGoogleCards() {
    if (SITE !== 'google') return;
    const rso = document.querySelector('#rso');
    if (!rso) return;

    for (const el of [...rso.children]) {
      const tag = el.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'NOSCRIPT') continue;

      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();

      if (text.length < 8 && !el.querySelector('a[href]')) {
        el.classList.remove('ac-card', 'ac-fullrow');
        el.classList.add('ac-empty');
        continue;
      }

      if (isStandardWebResult(el)) {
        el.classList.remove('ac-empty', 'ac-fullrow');
        el.classList.add('ac-card');
      } else {
        el.classList.remove('ac-card', 'ac-empty');
        el.classList.add('ac-fullrow');
      }
    }
  }

  function normalizeStartpage() {
    if (SITE !== 'startpage') return;
    const wgl = document.querySelector('.w-gl');
    if (!wgl) return;
    for (const el of [...wgl.children]) {
      if (el.dataset.acClassed) continue;
      el.dataset.acClassed = '1';
      const tag = el.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'NOSCRIPT') continue;
      const link = el.querySelector('a[href]');
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!link || text.length < 10) el.style.setProperty('display', 'none', 'important');
    }
  }

  function removeAds() {
    if (SITE === 'baidu') {
      safeRemove('#content_right br');
      safeRemove('#content_left .ec_ad_results');
      safeRemove('#content_left [data-tuiguang]');
      safeRemove('#content_left .result-op[class*="ad"]');
      safeRemove('div[aria-label="广告"], #bottomads');
    }
    if (SITE === 'google') safeRemove('#bottomads, div[aria-label="广告"], div[aria-label="Ads"]');
    if (SITE === 'bing') safeRemove('.b_ad, #b_results > li.b_ad');
    if (SITE === 'haosou') safeRemove('#so_kw-ad, #m-spread-left, #m-spread-bottom');
    if (SITE === 'duck') safeRemove('.result--ad, .js-result-ad');
    if (SITE === 'startpage') safeRemove('#sponsored, .sponsored, .w-gl__result--ad');
    if (SITE === 'brave') safeRemove('.ad-slot, #search-elsewhere-result-wrapper');
  }

  let timer = null;
  let running = false;

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(run, 100);
  }

  function run() {
    if (running) return;
    running = true;
    try {
      markBody();
      removeAds();
      cleanupGoogleInlineStyles();
      normalizeGoogleCards();
      normalizeStartpage();
      centerGoogleRso();  // ★ 关键：每次 run 都重新居中
    } finally {
      running = false;
    }
  }

  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('load', schedule);

  if (document.body) markBody();
  else {
    const bodyObs = new MutationObserver(() => {
      if (document.body) { markBody(); bodyObs.disconnect(); }
    });
    bodyObs.observe(document.documentElement, { childList: true, subtree: true });
  }

  const loader = document.createElement('div');
  loader.className = 'ac-loading-spinner';
  loader.innerHTML = '<div></div><div></div><div></div><div></div><div></div>';
  const injectLoader = () => {
    if (!document.body) return;
    if (document.querySelector('.ac-loading-spinner')) return;
    document.body.insertBefore(loader, document.body.firstChild);
    setTimeout(() => document.body.classList.add('ac-ready'), 400);
  };
  if (document.body) injectLoader();
  else document.addEventListener('DOMContentLoaded', injectLoader, { once: true });

  schedule();
})();