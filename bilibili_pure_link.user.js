// ==UserScript==
// @name         B站链接净化
// @namespace
// @version      1.0
// @description  白名单模式净化B站链接：只保留列表中的参数，其余全部删除。支持自定义、批量添加和重置。
// @author       Shay
// @match        *://*.bilibili.com/*
// @icon         https://www.bilibili.com/favicon.ico
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addValueChangeListener
// @grant        unsafeWindow
// @run-at       document-start
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/dxdragon/UserScripts/raw/main/bilibili_pure_link.user.js
// @downloadURL  https://raw.githubusercontent.com/dxdragon/UserScripts/raw/main/bilibili_pure_link.user.js
// ==/UserScript==

(function () {
    'use strict';

    if (window.self !== window.top) return;

    // ============ 默认白名单：只保留这些参数 ============
    const DEFAULT_KEEP = [
        // 内容标识
        'bvid', 'aid', 'cid', 'ep_id', 'season_id', 'media_id', 'oid', 'sid',
        // 分P、时间戳、播放位置
        'p', 't', 'start', 'end', 'autoplay',
        // 分页
        'page', 'pn', 'ps', 'offset', 'limit',
        // 搜索
        'keyword', 'search',
        // 用户/空间
        'mid', 'spaceid', 'fid', 'uid',
        // 筛选/排序/分类
        'type', 'order', 'sort', 'tab', 'tid', 'rid', 'mode', 'dynamic_id',
        // 直播
        'room_id',
    ];

    // ============ 读取配置 ============
    const savedKeep = GM_getValue('keepParams', null);
    const initialKeep = Array.isArray(savedKeep) ? savedKeep : DEFAULT_KEEP.slice();

    // ============ 跨沙箱通信 ============
    const pageWindow = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

    pageWindow.addEventListener('blc-save-keep', (event) => {
        if (Array.isArray(event.detail)) GM_setValue('keepParams', event.detail);
    });

    GM_registerMenuCommand('设置', () => {
        pageWindow.dispatchEvent(new CustomEvent('blc-open-settings'));
    });

    GM_addValueChangeListener('keepParams', (name, oldV, newV, remote) => {
        if (remote && Array.isArray(newV)) {
            pageWindow.dispatchEvent(new CustomEvent('blc-keep-updated', { detail: newV }));
        }
    });

    // ============ 样式 ============
    GM_addStyle(`
        #blc-settings-panel {
            display: none; position: fixed; top: 50%; left: 50%;
            transform: translate(-50%, -50%); z-index: 10000;
            width: 500px; max-width: 92vw; height: 480px; max-height: 85vh;
            background: #fff; border-radius: 8px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.35);
            flex-direction: column; overflow: hidden;
            font-size: 14px; color: #333;
        }
        .blc-header {
            display: flex; justify-content: space-between; align-items: center;
            padding: 12px 16px; border-bottom: 1px solid #eee; flex-shrink: 0;
        }
        .blc-header h3 { margin: 0; font-size: 16px; }
        #blc-close-btn { font-size: 22px; cursor: pointer; color: #999; line-height: 1; }
        #blc-close-btn:hover { color: #333; }

        .blc-body { flex: 1; overflow-y: auto; padding: 14px 16px; }
        .blc-hint {
            font-size: 12px; color: #888;
            background: #f5f7fa; padding: 8px 10px;
            border-radius: 4px; margin-bottom: 12px; line-height: 1.6;
        }
        .blc-add { display: flex; gap: 8px; margin-bottom: 10px; }
        .blc-new-param {
            flex: 1; border: 1px solid #ccc; border-radius: 4px;
            padding: 6px 10px; font-size: 13px; outline: none;
        }
        .blc-new-param:focus { border-color: #00a1d6; }
        .blc-add-btn {
            border: none; padding: 6px 14px; border-radius: 4px;
            background-color: #00a1d6; color: #fff; cursor: pointer; font-size: 13px;
        }
        .blc-add-btn:hover { background-color: #00b5e5; }

        .blc-list {
            display: flex; flex-wrap: wrap; gap: 6px;
            padding: 10px; background: #f8f9fa; border-radius: 4px;
            min-height: 60px;
        }
        .blc-param {
            display: inline-flex; align-items: center;
            background: #eef0f2; color: #333;
            padding: 4px 10px; border-radius: 14px;
            font-size: 12px; word-break: break-all;
        }
        .blc-param span:first-child { margin-right: 6px; }
        .blc-delete {
            color: #999; cursor: pointer; font-weight: bold;
            font-size: 15px; line-height: 1;
        }
        .blc-delete:hover { color: #ff4d4d; }

        .blc-footer {
            padding: 10px 16px; border-top: 1px solid #eee;
            text-align: right; flex-shrink: 0;
        }
        #blc-reset-btn {
            border: 1px solid #ccc; background: #f1f1f1; color: #333;
            padding: 6px 14px; border-radius: 4px; cursor: pointer; font-size: 13px;
        }
        #blc-reset-btn:hover { background: #e0e0e0; }
    `);

    // ============ 注入 ============
    const injectedScript = document.createElement('script');
    injectedScript.id = 'blc-injected-script';
    injectedScript.dataset.initialKeep = JSON.stringify(initialKeep);
    injectedScript.dataset.defaultKeep = JSON.stringify(DEFAULT_KEEP);
    injectedScript.textContent = `(${injectedCode.toString()})();`;
    (document.head || document.documentElement).appendChild(injectedScript);
    injectedScript.remove();

    // ============ 页面环境工作代码 ============
    function injectedCode() {
        'use strict';

        const parseArray = (str, fallback) => {
            try {
                const a = JSON.parse(str);
                return Array.isArray(a) ? a : fallback;
            } catch (e) { return fallback; }
        };

        const scriptTag = document.getElementById('blc-injected-script');
        let keepSet = new Set(parseArray(scriptTag.dataset.initialKeep, []));
        const defaultKeep = parseArray(scriptTag.dataset.defaultKeep, []);

        // ---- URL 缓存 ----
        const urlCache = new Map();
        const MAX_CACHE = 500;

        function clearCache() { urlCache.clear(); }

        function saveKeep() {
            clearCache();
            window.dispatchEvent(new CustomEvent('blc-save-keep', {
                detail: Array.from(keepSet)
            }));
        }

        // ---- 核心净化：白名单模式 ----
        function cleanUrl(urlString) {
            if (!urlString) return urlString;
            if (urlString.includes('passport.bilibili.com')) return urlString;
            if (urlCache.has(urlString)) return urlCache.get(urlString);

            let result = urlString;
            try {
                const url = new URL(urlString, location.href);
                const toDelete = [];
                for (const key of url.searchParams.keys()) {
                    if (!keepSet.has(key)) toDelete.push(key);
                }
                if (toDelete.length > 0) {
                    toDelete.forEach(k => url.searchParams.delete(k));
                    result = url.toString();
                }
            } catch (e) { /* 忽略解析失败 */ }

            if (urlCache.size >= MAX_CACHE) {
                const firstKey = urlCache.keys().next().value;
                urlCache.delete(firstKey);
            }
            urlCache.set(urlString, result);
            return result;
        }

        // ---- 文本净化（复制/分享） ----
        function extractAndClean(text) {
            if (!text || typeof text !== 'string') return text;
            const re = /(https?:\/\/(?:www\.|m\.)?bilibili\.com\/[^\s]+|https?:\/\/b23\.tv\/[a-zA-Z0-9]+)/g;
            return text.replace(re, (m) => cleanUrl(m));
        }

        // ---- 单链接处理 ----
        function cleanLinkElement(link) {
            if (!link || !link.href) return false;
            const cleaned = cleanUrl(link.href);
            if (cleaned !== link.href) {
                link.href = cleaned;
                link.dataset.cleanedHref = cleaned;
                return true;
            }
            return false;
        }

        // ---- 事件拦截 ----
        document.addEventListener('mouseover', (e) => {
            const link = e.target.closest('a[href]');
            if (link && !link.dataset.cleanedHref) cleanLinkElement(link);
        }, true);

        const clickFix = (e) => {
            const link = e.target.closest('a[href]');
            if (link) {
                const changed = cleanLinkElement(link);
                if (changed) e.stopImmediatePropagation();
            }
        };
        document.addEventListener('mousedown', clickFix, true);
        document.addEventListener('click', clickFix, true);
        document.addEventListener('contextmenu', clickFix, true);

        // ---- History / window.open 补丁 ----
        const origPush = history.pushState;
        history.pushState = function (state, title, url) {
            const cleaned = url ? cleanUrl(url.toString()) : url;
            return origPush.apply(this, [state, title, cleaned]);
        };
        const origReplace = history.replaceState;
        history.replaceState = function (state, title, url) {
            const cleaned = url ? cleanUrl(url.toString()) : url;
            return origReplace.apply(this, [state, title, cleaned]);
        };

        const origOpen = window.open;
        window.open = function (url, target, features) {
            const cleaned = url ? cleanUrl(url.toString()) : url;
            return origOpen.apply(this, [cleaned, target, features]);
        };

        // ---- 剪贴板净化 ----
        if (navigator.clipboard && navigator.clipboard.writeText) {
            const origWrite = navigator.clipboard.writeText;
            navigator.clipboard.writeText = function (text) {
                return origWrite.apply(this, [extractAndClean(text)]);
            };
        }

        document.addEventListener('copy', (e) => {
            const sel = window.getSelection().toString();
            if (sel && (sel.includes('bilibili.com') || sel.includes('b23.tv'))) {
                const cleaned = extractAndClean(sel);
                if (cleaned !== sel) {
                    e.preventDefault();
                    e.clipboardData.setData('text/plain', cleaned);
                }
            }
        }, true);

        // ---- 初次清理当前 URL ----
        {
            const cur = location.href;
            const cleaned = cleanUrl(cur);
            if (cur !== cleaned) history.replaceState(history.state, '', cleaned);
        }

        // ================= 设置面板 =================
        let settingsPanel = null;

        function escapeHtml(s) {
            return String(s).replace(/[&<>"']/g, c => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;',
                '"': '&quot;', "'": '&#39;'
            })[c]);
        }

        function renderList() {
            return Array.from(keepSet).sort().map(p =>
                `<div class="blc-param"><span>${escapeHtml(p)}</span>` +
                `<span class="blc-delete" data-param="${escapeHtml(p)}">&times;</span></div>`
            ).join('');
        }

        function renderPanelContent() {
            if (!settingsPanel) return;
            settingsPanel.innerHTML = `
                <div class="blc-header">
                    <h3>链接净化设置（白名单）</h3>
                    <span id="blc-close-btn">&times;</span>
                </div>
                <div class="blc-body">
                    <div class="blc-hint">
                        只保留下面的参数，其余参数（包括各种跟踪参数）全部移除。
                    </div>
                    <div class="blc-add">
                        <input type="text" class="blc-new-param"
                               placeholder="输入参数名，多个用逗号,分隔"/>
                        <button class="blc-add-btn">添加</button>
                    </div>
                    <div class="blc-list">${renderList()}</div>
                </div>
                <div class="blc-footer">
                    <button id="blc-reset-btn">重置为默认</button>
                </div>
            `;
        }

        function addParamsFromInput(input) {
            const items = input.value.split(',').map(p => p.trim()).filter(Boolean);
            if (items.length === 0) return;
            items.forEach(p => keepSet.add(p));
            input.value = '';
            saveKeep();
            renderPanelContent();
        }

        function createSettingsPanel() {
            if (settingsPanel) return;
            settingsPanel = document.createElement('div');
            settingsPanel.id = 'blc-settings-panel';
            document.body.appendChild(settingsPanel);

            settingsPanel.addEventListener('click', (e) => {
                const t = e.target;

                if (t.id === 'blc-close-btn') {
                    settingsPanel.style.display = 'none';
                    return;
                }
                if (t.id === 'blc-reset-btn') {
                    if (confirm('确定要重置为默认白名单吗？')) {
                        keepSet = new Set(defaultKeep);
                        saveKeep();
                        renderPanelContent();
                    }
                    return;
                }
                if (t.classList.contains('blc-add-btn')) {
                    const input = settingsPanel.querySelector('.blc-new-param');
                    if (input) addParamsFromInput(input);
                    return;
                }
                if (t.classList.contains('blc-delete')) {
                    const param = t.dataset.param;
                    if (keepSet.has(param)) {
                        keepSet.delete(param);
                        saveKeep();
                        renderPanelContent();
                    }
                }
            });

            settingsPanel.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.target.classList.contains('blc-new-param')) {
                    addParamsFromInput(e.target);
                }
            });
        }

        // 打开设置面板
        window.addEventListener('blc-open-settings', () => {
            if (settingsPanel && settingsPanel.style.display === 'flex') {
                settingsPanel.style.display = 'none';
                return;
            }
            const open = () => {
                createSettingsPanel();
                renderPanelContent();
                settingsPanel.style.display = 'flex';
            };
            if (!document.body) {
                document.addEventListener('DOMContentLoaded', open, { once: true });
            } else {
                open();
            }
        });

        // 多标签页同步
        window.addEventListener('blc-keep-updated', (e) => {
            if (Array.isArray(e.detail)) {
                keepSet = new Set(e.detail);
                clearCache();
                document.querySelectorAll('a[href]').forEach(cleanLinkElement);
            }
        });
    }
})();