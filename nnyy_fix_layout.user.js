// ==UserScript==
// @name         努努影院修复首页布局
// @namespace    Violentmonkey Scripts
// @version      1.0
// @description  外层固定高度，白卡内部滚动；滚动条边界严格等于白卡边界
// @author       Shay
// @match        *://nnyy.in/*
// @icon         https://nnyy.in/favicon.ico
// @run-at       document-end
// @grant        none
// @updateURL    https://raw.githubusercontent.com/dxdragon/UserScripts/raw/main/nnyy_fix_layout.user.js
// @downloadURL  https://raw.githubusercontent.com/dxdragon/UserScripts/raw/main/nnyy_fix_layout.user.js
// ==/UserScript==

(function () {
  'use strict';

  const MIN_HEIGHT        = 300;
  const MOBILE_BREAKPOINT = 768;

  // ---------- 注入样式 ----------
  (function injectStyle() {
    const css = `
      /* ==========================================================
       * 1. 外层：固定高度容器，禁止自身滚动
       * ========================================================== */
      .container > .content-wrap,
      .container > .sidebar {
        box-sizing: border-box !important;
        overflow: hidden !important;
        display: flex !important;
        flex-direction: column !important;
      }

      /* 左侧多一层 .content，也要 flex 化 */
      .container > .content-wrap > .content {
        flex: 1 1 auto !important;
        min-height: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        overflow: hidden !important;
      }

      /* ==========================================================
       * 2. 白卡 .lists：真正滚动的地方
       *    - flex 撑满外层
       *    - 内容超出时自身滚动，滚动条边界 = 白卡边界
       * ========================================================== */
      .container > .content-wrap > .content > .lists,
      .container > .sidebar > .lists {
        flex: 1 1 auto !important;
        min-height: 0 !important;
        box-sizing: border-box !important;
        overflow-x: hidden !important;
        overflow-y: auto !important;
        overscroll-behavior: contain;
      }

      /* ==========================================================
       * 3. 滚动条：白卡自己的滚动条
       *    注意：不要写 scrollbar-width，否则 WebKit 伪元素会失效
       * ========================================================== */
      .container > .content-wrap > .content > .lists::-webkit-scrollbar,
      .container > .sidebar > .lists::-webkit-scrollbar {
        width: 6px;
        height: 6px;
        background: transparent;
      }

      /* 隐藏上下箭头按钮 */
      .container > .content-wrap > .content > .lists::-webkit-scrollbar-button,
      .container > .sidebar > .lists::-webkit-scrollbar-button {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
        background: transparent !important;
      }

      .container > .content-wrap > .content > .lists::-webkit-scrollbar-track,
      .container > .sidebar > .lists::-webkit-scrollbar-track {
        background: transparent;
        border: 0;
      }

      .container > .content-wrap > .content > .lists::-webkit-scrollbar-thumb,
      .container > .sidebar > .lists::-webkit-scrollbar-thumb {
        background: rgba(0,0,0,.25);
        border-radius: 3px;
        min-height: 24px;
      }
      .container > .content-wrap > .content > .lists::-webkit-scrollbar-thumb:hover,
      .container > .sidebar > .lists::-webkit-scrollbar-thumb:hover {
        background: rgba(0,0,0,.4);
      }

      .container > .content-wrap > .content > .lists::-webkit-scrollbar-corner,
      .container > .sidebar > .lists::-webkit-scrollbar-corner {
        background: transparent;
      }

      /* ==========================================================
       * 4. 移动端还原堆叠
       * ========================================================== */
      @media (max-width: 768px) {
        .container > .content-wrap,
        .container > .sidebar {
          display: block !important;
          overflow: visible !important;
          height: auto !important;
          max-height: none !important;
        }
        .container > .content-wrap > .content {
          display: block !important;
          height: auto !important;
          overflow: visible !important;
        }
        .container > .content-wrap > .content > .lists,
        .container > .sidebar > .lists {
          display: block !important;
          height: auto !important;
          max-height: none !important;
          overflow: visible !important;
        }
      }
    `;
    const s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  })();

  // ---------- 工具 ----------
  function getBoxes() {
    return Array.prototype.filter.call(
      document.querySelectorAll('.container'),
      function (box) {
        return box.querySelector(':scope > .content-wrap') &&
               box.querySelector(':scope > .sidebar');
      }
    );
  }

  function resetOuter(el) {
    el.style.height    = '';
    el.style.maxHeight = '';
  }

  /**
   * 测量外层自然高度。
   * 因为内层 .lists 已被 CSS 约束为 flex: 1 1 auto + overflow: auto，
   * 外层 height:auto 时，内层会随内容自然撑开（不滚动），
   * 因此 getBoundingClientRect 得到的就是内容真实高度。
   */
  function measureNatural(el) {
    const sH = el.style.height;
    const sM = el.style.maxHeight;
    el.style.height    = 'auto';
    el.style.maxHeight = 'none';
    void el.offsetHeight;              // 强制 reflow
    const h = Math.ceil(el.getBoundingClientRect().height);
    el.style.height    = sH;
    el.style.maxHeight = sM;
    return h;
  }

  function setOuterHeight(el, h) {
    el.style.height    = h + 'px';
    el.style.maxHeight = h + 'px';
  }

  function equalize(box) {
    const left  = box.querySelector(':scope > .content-wrap');
    const right = box.querySelector(':scope > .sidebar');
    if (!left || !right) return;

    if (box.clientWidth < MOBILE_BREAKPOINT) {
      resetOuter(left);
      resetOuter(right);
      return;
    }

    resetOuter(left);
    resetOuter(right);

    const hL = measureNatural(left);
    const hR = measureNatural(right);
    const target = Math.max(MIN_HEIGHT, Math.min(hL, hR));

    setOuterHeight(left,  target);
    setOuterHeight(right, target);
  }

  function run() {
    getBoxes().forEach(equalize);
  }

  // ---------- 调度 ----------
  let timer = null;
  function schedule(delay) {
    clearTimeout(timer);
    timer = setTimeout(run, delay == null ? 100 : delay);
  }

  window.addEventListener('load', function () {
    schedule(0);
    setTimeout(run, 400);
    setTimeout(run, 1200);
    setTimeout(run, 2500);
  });
  window.addEventListener('resize', function () { schedule(200); });

  function bindImg() {
    document.querySelectorAll('img').forEach(function (img) {
      if (img.complete) return;
      img.addEventListener('load',  function () { schedule(150); }, { once: true });
      img.addEventListener('error', function () { schedule(150); }, { once: true });
    });
  }

  const mo = new MutationObserver(function () { schedule(250); });
  mo.observe(document.body, { childList: true, subtree: true });

  bindImg();
  schedule(300);
})();