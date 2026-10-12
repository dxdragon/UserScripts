// ==UserScript==
// @name         搜索引擎双列
// @namespace    https://github.com/dxdragon/UserScripts
// @version      1.1.0
// @description  去广告 + 双列瀑布流
// @author       Shay
// @run-at       document-start
// @include      *://cn.bing.com/*
// @include      *://www.bing.com/*
// @include      *://www.google*/search*
// @include      *://duckduckgo.com/*
// @include      *://www.startpage.com/*
// @include      *://search.brave.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @updateURL    https://gh-proxy.com/raw.githubusercontent.com/dxdragon/UserScripts/main/searchengine_dual_column.user.js
// @downloadURL  https://gh-proxy.com/raw.githubusercontent.com/dxdragon/UserScripts/main/searchengine_dual_column.user.js
// ==/UserScript==

(() => {
  'use strict';
  
  const AC_DEBUG = false;   // 调试开关

  /* ============================================================
   * 配置：每站点 { auto, value }
   *   auto=true  → 运行时按导航栏左边界自动留白
   *   auto=false → 使用 value 作为固定左右留白（px）
   * ============================================================ */
  const CONFIG_KEY = 'ac_config_v1';

  const DEFAULT_CONFIG = {
    google:    { auto: false, value: 40 },
    bing:      { auto: false, value: 40 },
    brave:     { auto: true,  value: 40 },
    startpage: { auto: false, value: 40 },
    duck:      { auto: false, value: 40 },
  };

  const SITE_LABEL = {
    google: 'Google', bing: 'Bing',
    brave: 'Brave', startpage: 'Startpage', duck: 'DuckDuckGo',
  };

  function loadConfig() {
    let raw = null;
    try {
      if (typeof GM_getValue === 'function') raw = GM_getValue(CONFIG_KEY, null);
      else raw = localStorage.getItem(CONFIG_KEY);
    } catch {}
    if (raw) {
      try {
        const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const merged = {};
        for (const k of Object.keys(DEFAULT_CONFIG)) {
          merged[k] = Object.assign({}, DEFAULT_CONFIG[k], obj[k] || {});
        }
        return merged;
      } catch {}
    }
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }

  function saveConfig(cfg) {
    const raw = JSON.stringify(cfg);
    try {
      if (typeof GM_setValue === 'function') GM_setValue(CONFIG_KEY, raw);
      else localStorage.setItem(CONFIG_KEY, raw);
    } catch {}
  }

  const state = { cfg: loadConfig() };

  /* ============================================================
   * 站点识别
   * ============================================================ */
  const SITE = (() => {
    const h = location.host;
    if (h.includes('google')) return 'google';
    if (h.includes('bing.com')) return 'bing';
    if (h.includes('duckduckgo.com')) return 'duck';
    if (h.includes('startpage.com')) return 'startpage';
    if (h.includes('brave.com')) return 'brave';
    return '';
  })();
  if (!SITE) return;

  /* ============================================================
   * 每站点导航栏选择器（用于 auto 模式）
   * ============================================================ */
  const SITE_NAV = {
    google:    ['#cnt [role="navigation"]', '#cnt nav', '[role="navigation"]'],
    bing:      ['nav.b_scopebar', 'nav[role="navigation"]', 'nav'],
    brave:     ['nav.tabs', 'nav[role="tablist"]', '[role="tablist"]', '#search-page nav', 'main nav', 'header nav', 'nav'],
    startpage: ['nav.inline-nav', 'nav'],
    duck:      ['#react-duckbar > [class]', '#react-duckbar'],
  };

  /* ============================================================
   * 每站点瀑布流容器
   * ============================================================ */
  const SITE_CONTAINER = {
    google:    '#rso',
    bing:      '#b_results',
    duck:      '.react-results--main',
    startpage: '.w-gl',
    brave:     '#mixed-main',
  };

  /* ---------- 布局常量 ---------- */
  const COL_MIN = 320;
  const COL_GAP = 20;
  const ROW_GAP = 16;
  const FALLBACK_MARGIN = 40;

  /* ============================================================
   * ★ 每站点瀑布流容器顶部间距（px）
   * ============================================================ */
  const SITE_TOP_PAD = {
    google:    0,
    bing:      24,
    duck:      0,
    startpage: 0,
    brave:     20,
  };

  /* ============================================================
   * 导航栏左边界 / margin 解析
   * ============================================================ */
  function getLeftAnchor(site) {
    const sels = SITE_NAV[site] || [];
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const maxLeft = vw * 0.5;
    for (const sel of sels) {
      let els;
      try { els = document.querySelectorAll(sel); } catch { continue; }
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.left >= 0 && r.left < maxLeft) {
          return Math.round(r.left);
        }
      }
    }
    return null;
  }

  function resolveMargin(site) {
    const c = state.cfg[site] || DEFAULT_CONFIG[site] || { auto: false, value: FALLBACK_MARGIN };
    if (c.auto) {
      const a = getLeftAnchor(site);
      if (a != null) return a;
    }
    return Number.isFinite(c.value) ? c.value : FALLBACK_MARGIN;
  }

  /* ---------- 瀑布流卡片模板（所有站点共用） ---------- */
  const MASONRY_CARD_CSS = `
    break-inside: avoid !important;
    -webkit-column-break-inside: avoid !important;
    page-break-inside: avoid !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    margin: 0 0 ${ROW_GAP}px 0 !important;
    padding: 16px !important;
    border: 1px solid #e0e0e0 !important;
    border-radius: 8px !important;
    background: #fff !important;
    box-sizing: border-box !important;
    float: none !important;
  `;

  const MASONRY_CROSS_CSS = `
    column-span: all !important;
    -webkit-column-span: all !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    margin: 0 0 ${ROW_GAP}px 0 !important;
    padding: 0 !important;
    border: none !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    box-sizing: border-box !important;
    float: none !important;
  `;

  const CSS_BASE = `
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

    /* ============================================================
     * 谷歌
     * ============================================================ */
    body.ac-two-col.google #rcnt > :not(#center_col),
    body.ac-two-col.google #rhs, 
    body.ac-two-col.google #gevUs > :not(#search) { display: none !important; }

    body.ac-two-col.google #rcnt,
    body.ac-two-col.google #center_col {
      display: block !important;
      width: 100% !important;
      max-width: none !important;
      min-width: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      float: none !important;
      overflow: visible !important;
      position: static !important;
    }
    body.ac-two-col.google #rso > *:not(.MjjYud.ac-card) { display: none !important; }
    body.ac-two-col.google #rso > .ac-card { ${MASONRY_CARD_CSS} }
    body.ac-two-col.google #botstuff > [data-hveid] > :not([role="navigation"]) { display: none !important; }

    /* ============================================================
     * 必应
     * ============================================================ */
    body.ac-two-col.bing #b_content {
      display: block !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: none !important;
      padding: 0 !important;
      margin: 0 !important;
      box-sizing: border-box !important;
      float: none !important;
    }
    body.ac-two-col.bing #b_results > li.b_algo { ${MASONRY_CARD_CSS} }
    body.ac-two-col.bing #b_results > li.b_ans,
    body.ac-two-col.bing #b_results > li.b_pag { ${MASONRY_CROSS_CSS} }
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
    body.ac-two-col.bing #b_content > main > :not(#b_results),
    body.ac-two-col.bing #b_results > :not(.b_algo) { display: none !important; }
    body.ac-two-col.bing #b_copilot_search,
    body.ac-two-col.bing .b_copilot_search,
    body.ac-two-col.bing .b_copilot_search_container,
    body.ac-two-col.bing [data-copilot-search],
    body.ac-two-col.bing #b_copilot,
    body.ac-two-col.bing .b_copilotContainer,
    body.ac-two-col.bing iframe[id*="copilot" i],
    body.ac-two-col.bing iframe[src*="copilot" i] { display: none !important; }

    /* ============================================================
     * DuckDuckGo
     * ============================================================ */
    body.ac-two-col.duck .react-results--main > li { ${MASONRY_CARD_CSS} }

    /* ============================================================
     * Startpage
     * ============================================================ */
    body.ac-two-col.startpage #main,
    body.ac-two-col.startpage main {
      display: block !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: none !important;
      padding-left: 0 !important;
      padding-right: 0 !important;
      margin: 0 !important;
      box-sizing: border-box !important;
      float: none !important;
      overflow-x: visible !important;
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
    body.ac-two-col.startpage .w-gl > * { ${MASONRY_CARD_CSS} }
    body.ac-two-col.startpage .w-gl > *:not(:has(a[href])) { display: none !important; }
    body.ac-two-col.startpage #sidebar,
    .w-gl-attribution,
    .result.h { display: none !important; }
    body.ac-two-col.startpage { overflow-x: hidden !important; }

    /* Startpage：翻页栏居中 */
    body.ac-two-col.startpage .pagination-container {
      display: flex !important;
      justify-content: center !important;
      align-items: center !important;
      width: 100% !important;
      margin-left: auto !important;
      margin-right: auto !important;
      padding: 0 !important;
      box-sizing: border-box !important;
    }
    body.ac-two-col.startpage nav.pagination {
      display: flex !important;
      justify-content: center !important;
      align-items: center !important;
      margin-left: auto !important;
      margin-right: auto !important;
    }

    /* ============================================================
     * Brave
     * ============================================================ */
    body.ac-two-col.brave #search-elsewhere,#search-elsewhere-result-wrapper,
    body.ac-two-col.brave #related-queries,
    body.ac-two-col.brave .serp-layout > :not(.serp-columns),
    body.ac-two-col.brave #mixed-main > *:not([data-pos]):not(#pagination-snippet),
    body.ac-two-col.brave .serp-columns-side { display: none !important; }

    body.ac-two-col.brave #mixed-main > [data-pos] {
      ${MASONRY_CARD_CSS}
      overflow: hidden !important;
    }
    body.ac-two-col.brave #mixed-main > *:not([data-pos]) { ${MASONRY_CROSS_CSS} }

    /* ============================================================
     * 通用去广告
     * ============================================================ */
    #bottomads, .b_ad, #so_kw-ad, #tads, #tadsb,
    #m-spread-left, #m-spread-bottom, #top_ad,
    #sponsored, .sponsored, .ad-slot,
    div[aria-label="广告"], div[aria-label="Ads"],
    #search-elsewhere-result-wrapper,
    #search-elsewhere, #related-queries,
    .result--ad, .js-result-ad,
    #content_left .ec_ad_results,
    #content_left [data-tuiguang],
    #content_left .result-op[class*="ad"],
    .w-gl__result--ad { display: none !important; }

    /* ============================================================
     * 配置面板
     * ============================================================ */
    #ac-config-panel {
      position: fixed; top: 80px; right: 20px; z-index: 2147483647;
      width: 380px; padding: 18px;
      background: #fff; border: 1px solid #d0d0d0; border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,.18);
      font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      color: #333;
    }
    #ac-config-panel h2 {
      margin: 0 0 14px; font-size: 15px; font-weight: 600;
    }
    .ac-cfg-row {
      display: grid;
      grid-template-columns: 110px 90px 1fr;
      gap: 10px;
      align-items: center;
      margin-bottom: 8px;
    }
    .ac-cfg-head {
      font-weight: 600; color: #666; font-size: 12px;
      padding-bottom: 6px; margin-bottom: 10px;
      border-bottom: 1px solid #eee;
    }
    .ac-cfg-head span:nth-child(2),
    .ac-cfg-row > label { text-align: center; }
    .ac-cfg-row input[type=number] {
      width: 100%; padding: 5px 8px; border: 1px solid #ccc; border-radius: 5px;
      font: inherit; box-sizing: border-box;
    }
    .ac-cfg-row input[type=number]:disabled {
      background: #f5f5f5; color: #999; cursor: not-allowed;
    }
    .ac-cfg-actions {
      display: flex; gap: 8px; justify-content: flex-end; margin-top: 14px;
    }
    .ac-cfg-actions button {
      padding: 6px 14px; border: 1px solid #ccc; background: #f8f8f8;
      border-radius: 6px; cursor: pointer; font: inherit;
    }
    .ac-cfg-actions button:hover { background: #eee; }
    .ac-cfg-actions button[data-act="save"] {
      background: #4e6ef2; color: #fff; border-color: #4e6ef2;
    }
    .ac-cfg-actions button[data-act="save"]:hover { background: #3c5be0; }
  `;

  GM_addStyle(CSS_BASE);

  function markBody() {
    if (!document.body) return;
    document.body.classList.add(SITE, 'ac-two-col');
    document.body.setAttribute(SITE, '1');
  }

  /* ============================================================
   * 通用瀑布流
   * ============================================================ */
  const MASONRY_RESET_PROPS = [
    'display', 'column-count', 'column-gap', 'column-fill',
    'width', 'max-width', 'min-width',
    'margin', 'margin-left', 'margin-right', 'margin-top', 'margin-bottom',
    'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'float', 'position', 'left', 'right', 'top', 'transform',
    'grid-template-columns', 'grid-template-rows', 'grid-auto-flow',
    'grid-column', 'grid-row',
    'flex', 'flex-basis', 'flex-grow', 'flex-shrink',
    'flex-wrap', 'flex-direction', 'justify-content', 'align-items', 'align-content',
    'gap',
  ];

  function applyMasonry(selector, opts) {
    const containers = document.querySelectorAll(selector);
    if (!containers.length) return null;

    const {
      sideMargin = null,
      topPad = 0,
      flattenAncestors = 0,
    } = opts || {};

    const vw = document.documentElement.clientWidth || window.innerWidth;
    const margin = sideMargin != null ? sideMargin : resolveMargin(SITE);
    const cw = Math.max(COL_MIN, vw - margin * 2);
    const canTwo = cw >= COL_MIN * 2 + COL_GAP;

    if (flattenAncestors > 0) {
      let el = containers[0].parentElement, d = 0;
      while (el && el.tagName !== 'BODY' && el.tagName !== 'HTML' && d < flattenAncestors) {
        el.style.setProperty('display', 'block', 'important');
        el.style.setProperty('width', '100%', 'important');
        el.style.setProperty('max-width', 'none', 'important');
        el.style.setProperty('min-width', '0', 'important');
        el.style.setProperty('margin', '0', 'important');
        el.style.setProperty('padding', '0', 'important');
        el.style.setProperty('box-sizing', 'border-box', 'important');
        el.style.setProperty('float', 'none', 'important');
        el.style.setProperty('overflow', 'visible', 'important');
        el.style.setProperty('position', 'static', 'important');
        el.style.setProperty('left', 'auto', 'important');
        el.style.setProperty('transform', 'none', 'important');
        el.style.setProperty('grid-template-columns', 'none', 'important');
        el.style.setProperty('grid-template-rows', 'none', 'important');
        el.style.setProperty('grid-auto-flow', 'row', 'important');
        el.style.setProperty('grid-column', 'auto', 'important');
        el.style.setProperty('grid-row', 'auto', 'important');
        el = el.parentElement; d++;
      }
    }

    containers.forEach((c, i) => {
      MASONRY_RESET_PROPS.forEach(p => c.style.removeProperty(p));
      c.style.setProperty('display', 'block', 'important');
      c.style.setProperty('column-count', canTwo ? '2' : '1', 'important');
      c.style.setProperty('column-gap', COL_GAP + 'px', 'important');
      c.style.setProperty('column-fill', 'balance', 'important');
      c.style.setProperty('width', cw + 'px', 'important');
      c.style.setProperty('max-width', cw + 'px', 'important');
      c.style.setProperty('min-width', '0', 'important');
      c.style.setProperty('margin-left', 'auto', 'important');
      c.style.setProperty('margin-right', 'auto', 'important');
      c.style.setProperty('margin-top', '0', 'important');
      c.style.setProperty('margin-bottom', '0', 'important');
      c.style.setProperty('padding-top', (i === 0 ? topPad : 0) + 'px', 'important');
      c.style.setProperty('padding-right', '0', 'important');
      c.style.setProperty('padding-bottom', '0', 'important');
      c.style.setProperty('padding-left', '0', 'important');
      c.style.setProperty('box-sizing', 'border-box', 'important');
      c.style.setProperty('float', 'none', 'important');
    });

    return { count: containers.length, cw, canTwo, margin };
  }

  /* ============================================================
   * Google 卡片分类
   * ============================================================ */
  function isStandardWebResult(el) {
    const h3 = el.querySelector('h3');
    if (!h3) return false;
    const a = h3.querySelector('a[href]') || h3.closest('a[href]');
    if (!a) return false;
    const href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return false;
    const text = (el.textContent || '');
    return /https?:\/\/[^\s]+\.[a-z]{2,}/i.test(text) || /^[a-z0-9-]+(\.[a-z0-9-]+)+([\/?#]|$)/i.test(href) || !!el.querySelector('cite');
  }

  function normalizeGoogleCards() {
    if (SITE !== 'google') return;
    document.querySelectorAll('#rso').forEach(rso => {
      for (const el of [...rso.children]) {
        const tag = el.tagName;
        if (['SCRIPT', 'STYLE', 'LINK', 'NOSCRIPT'].includes(tag)) continue;
        //el.classList.toggle('ac-card', isStandardWebResult(el));
      }
    });
  }

  /* ============================================================
   * Startpage 空壳隐藏
   * ============================================================ */
  function normalizeStartpage() {
    if (SITE !== 'startpage') return;
    document.querySelectorAll('.w-gl').forEach(wgl => {
      for (const el of [...wgl.children]) {
        if (el.dataset.acClassed) continue;
        el.dataset.acClassed = '1';
        if (['SCRIPT', 'STYLE', 'LINK', 'NOSCRIPT'].includes(el.tagName)) continue;
        const link = el.querySelector('a[href]');
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!link || text.length < 10) el.style.setProperty('display', 'none', 'important');
      }
    });
  }

  /* ============================================================
   * 统一布局入口
   * ============================================================ */
  function layoutSite() {
    const sel = SITE_CONTAINER[SITE];
    if (!sel) return;
    const opts = { topPad: SITE_TOP_PAD[SITE] ?? 0 };
    if (SITE === 'brave') {
      opts.flattenAncestors = 15;
    }
    // DDG：auto 模式需要保留祖先 padding 让锚点有效；
    //      固定 margin 模式需要清掉 padding 才能对称居中
    if (SITE === 'duck' && !state.cfg.duck?.auto) {
      opts.flattenAncestors = 15;
    }
    const r = applyMasonry(sel, opts);
    if (AC_DEBUG && r) console.log(`[ac-${SITE}]`, r, ', auto=', state.cfg[SITE]?.auto);
  }

  /* ============================================================
   * 配置面板
   * ============================================================ */
  function openConfigPanel() {
    if (!document.body) return;
    if (document.getElementById('ac-config-panel')) return;

    const cfg = JSON.parse(JSON.stringify(state.cfg));
    const panel = document.createElement('div');
    panel.id = 'ac-config-panel';

    let rows = '';
    for (const s of Object.keys(DEFAULT_CONFIG)) {
      const c = cfg[s];
      rows += `<div class="ac-cfg-row" data-site="${s}">
        <span>${SITE_LABEL[s] || s}</span>
        <label><input type="checkbox" data-key="auto" ${c.auto ? 'checked' : ''}></label>
        <input type="number" data-key="value" min="0" max="500" value="${c.value}">
      </div>`;
    }

    panel.innerHTML = `
      <h2>搜索引擎双列 · 配置</h2>
      <div class="ac-cfg-row ac-cfg-head">
        <span>站点</span><span>跟随导航栏</span><span>留白(px)</span>
      </div>
      ${rows}
      <div class="ac-cfg-actions">
        <button data-act="reset">恢复默认</button>
        <button data-act="close">取消</button>
        <button data-act="save">保存</button>
      </div>
    `;
    document.body.appendChild(panel);

    // 勾选 auto 时禁用数字输入
    function refreshDisabled() {
      panel.querySelectorAll('.ac-cfg-row[data-site]').forEach(row => {
        const auto = row.querySelector('input[data-key="auto"]').checked;
        row.querySelector('input[data-key="value"]').disabled = auto;
      });
    }
    refreshDisabled();

    panel.addEventListener('change', e => {
      if (e.target.dataset.key === 'auto') refreshDisabled();
    });

    panel.addEventListener('click', e => {
      const act = e.target.dataset.act;
      if (!act) return;

      if (act === 'close') { panel.remove(); return; }

      if (act === 'reset') {
        state.cfg = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        saveConfig(state.cfg);
        panel.remove();
        run();
        return;
      }

      if (act === 'save') {
        panel.querySelectorAll('.ac-cfg-row[data-site]').forEach(row => {
          const site = row.dataset.site;
          const auto = row.querySelector('input[data-key="auto"]').checked;
          let v = parseInt(row.querySelector('input[data-key="value"]').value, 10);
          if (!Number.isFinite(v) || v < 0) v = FALLBACK_MARGIN;
          state.cfg[site] = { auto, value: v };
        });
        saveConfig(state.cfg);
        panel.remove();
        run();
        return;
      }
    });
  }

  /* ============================================================
   * 调度
   * ============================================================ */
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
      normalizeGoogleCards();
      normalizeStartpage();
      layoutSite();
    } finally {
      running = false;
    }
  }

  // 注册菜单
  try {
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand('⚙ 双列配置', openConfigPanel);
    }
  } catch {}

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