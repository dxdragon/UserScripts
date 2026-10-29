// ==UserScript==
// @name         外链解码直链跳转
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  外链解码原链接、去跳转，短链接直达（搜索引擎结果后台打开）
// @author       Shay
// @match        *://*/*
// @exclude      *://*/*play/*
// @exclude      *://*/vod*/*
// @exclude      *://*/*video/*
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @connect      *
// @run-at       document-start
// @updateURL    https://gh-proxy.com/raw.githubusercontent.com/dxdragon/UserScripts/main/link_decoding.user.js
// @downloadURL  https://gh-proxy.com/raw.githubusercontent.com/dxdragon/UserScripts/main/link_decoding.user.js
// ==/UserScript==

(function() {
    'use strict';

    // ============================================================
    // 配置
    // ============================================================
    const ENABLE_SHORTLINK_EXPAND = true;
    const SHORTLINK_TIMEOUT = 5000;
    const ENABLE_LINK_REWRITE = true;
    const REWRITE_OBSERVER_TIMEOUT = 15000;
    const SHORTLINK_CACHE_MAX = 200;
    const NETWORK_DECODE_TIMEOUT = 5000;
    const NETWORK_CONCURRENCY = 4;
    const DECODE_CACHE_MAX = 500;

    // ★ 是否在搜索引擎结果页点击链接时后台打开（不抢焦点）
    const OPEN_SEARCH_ENGINE_RESULTS_IN_BACKGROUND = true;

    // ★ 搜索引擎识别规则（host 正则 + path 正则）
    const SEARCH_ENGINE_PATTERNS = [
        { host: /(^|\.)google\.[a-z.]+$/i, path: /^\/search\b/ },
        { host: /(^|\.)bing\.com$/i, path: /^\/search\b/ },
        { host: /(^|\.)baidu\.com$/i, path: /^\/(s|baidu)\b/ },
        { host: /(^|\.)duckduckgo\.com$/i, path: /^\// },
        { host: /(^|\.)sogou\.com$/i, path: /^\/web\b/ },
        { host: /(^|\.)so\.com$/i, path: /^\/s\b/ },
        { host: /(^|\.)startpage\.com$/i, path: /^\/(do\/)?search\b/ },
        { host: /(^|\.)search\.brave\.com$/i, path: /^\/search\b/ },
        { host: /(^|\.)ecosia\.org$/i, path: /^\/search\b/ },
    ];

    function isSearchEnginePage() {
        const host = location.hostname.toLowerCase();
        const path = location.pathname;
        for (const p of SEARCH_ENGINE_PATTERNS) {
            if (p.host.test(host) && p.path.test(path)) return true;
        }
        return false;
    }

    const OPEN_IN_BACKGROUND =
        OPEN_SEARCH_ENGINE_RESULTS_IN_BACKGROUND && isSearchEnginePage();

    const QUICK_DECODE_RE =
        /(?:\/redirect(?:[?#]|$)|[?&](?:golink|url|target|link)=|go\.php|\/target\/|\/goto(?:[?#]|$))/i;

    // ============================================================
    // 站点规则
    // ============================================================
    const SITE_RULES = [
        {
            name: 'google-goto',
            test: (host, path) => /(^|\.)google\.[a-z.]+$/i.test(host) &&
                                   (path === '/goto' || path === '/goto/'),
            decode: 'network'
        },
        {
            name: 'youtube-redirect',
            test: (host, path) => /(^|\.)youtube\.com$/i.test(host) && path === '/redirect',
            getTarget: (urlObj) => urlObj.searchParams.get('q'),
            decode: 'uri'
        },
        {
            name: 'gndown',
            test: (host, path) => /(^|\.)gndown\.com$/i.test(host) && path.startsWith('/target/'),
            getTarget: (urlObj) => {
                const m = urlObj.pathname.match(/^\/target\/(.+)$/);
                if (!m) return null;
                try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
            },
            decode: 'base64'
        },
        {
            name: '423down',
            test: (host, path) => host.includes('423down.com') && path.includes('/go.php'),
            getTarget: (urlObj) => urlObj.searchParams.get('url'),
            decode: 'base64'
        },
        {
            name: 'yudou789',
            test: (host) => host.includes('yudou789.top'),
            getTarget: (urlObj) => urlObj.searchParams.get('golink'),
            decode: 'base64'
        },
        {
            name: '通用-golink',
            test: (host, path, urlObj) => urlObj.searchParams.has('golink'),
            getTarget: (urlObj) => urlObj.searchParams.get('golink'),
            decode: 'base64'
        },
        {
            name: '通用-url',
            test: (host, path, urlObj) => urlObj.searchParams.has('url'),
            getTarget: (urlObj) => urlObj.searchParams.get('url'),
            decode: 'base64+uri'
        },
        {
            name: '通用-target',
            test: (host, path, urlObj) => urlObj.searchParams.has('target'),
            getTarget: (urlObj) => urlObj.searchParams.get('target'),
            decode: 'base64+uri'
        },
        {
            name: '通用-link',
            test: (host, path, urlObj) => urlObj.searchParams.has('link'),
            getTarget: (urlObj) => urlObj.searchParams.get('link'),
            decode: 'base64+uri'
        },
    ];

    // ============================================================
    // 短链接补全规则
    // ============================================================
    const SHORTLINK_RULES = [
        {
            domains: ['youtu.be'],
            expand: (url) => {
                const m = url.match(/^https?:\/\/youtu\.be\/([\w-]+)/i);
                return m ? `https://www.youtube.com/watch?v=${m[1]}` : null;
            }
        },
        {
            domains: ['youtube.com'],
            expand: (url) => {
                const m = url.match(/^https?:\/\/www\.youtube\.com\/shorts\/([\w-]+)/i);
                return m ? `https://www.youtube.com/watch?v=${m[1]}` : null;
            }
        },
        {
            domains: [
                'b23.tv', 't.cn', 'dwz.cn', 'url.cn', 'suo.im',
                'm.tb.cn', 'tb.cn', 's.click.taobao.com',
                'u.jd.com', 'jd.cn', 'sourl.cn', 'urlz.cn', 'sina.lt',
                'tinyurl.com', 'bit.ly', 'goo.gl', 'is.gd', 'ow.ly',
                'buff.ly', 'rebrand.ly', 'cutt.ly', 'shorturl.at', 'rb.gy',
            ]
        },
    ];

    const SHORTLINK_RULE_MAP = new Map();
    for (const rule of SHORTLINK_RULES) {
        for (const d of rule.domains) {
            SHORTLINK_RULE_MAP.set(d.toLowerCase(), rule);
        }
    }

    // ============================================================
    // 同步解码工具
    // ============================================================
    const BASE64_ONLY_RE = /^[A-Za-z0-9+/_=-]+$/;

    function tryBase64Decode(str) {
        if (!str || typeof str !== 'string' || str.length < 8) return null;
        if (str.includes('%') || str.includes('://')) return null;
        if (!BASE64_ONLY_RE.test(str)) return null;
        try {
            const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
            const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
            const decoded = atob(padded);
            return /^https?:\/\//i.test(decoded) ? decoded : null;
        } catch (e) { return null; }
    }

    function tryUriDecode(str) {
        if (!str || typeof str !== 'string') return null;
        if (!str.includes('%')) return null;
        try {
            const decoded = decodeURIComponent(str);
            return /^https?:\/\//i.test(decoded) ? decoded : null;
        } catch (e) { return null; }
    }

    function decodeByMode(raw, mode) {
        if (!raw) return null;
        switch (mode) {
            case 'base64':
                return tryBase64Decode(raw);
            case 'uri':
                return tryUriDecode(raw);
            case 'base64+uri': {
                if (/^https?:\/\//i.test(raw)) return raw;
                const b64 = tryBase64Decode(raw);
                if (b64) return b64;
                const uri = tryUriDecode(raw);
                if (uri) return uri;
                if (raw.includes('%')) {
                    try { return tryBase64Decode(decodeURIComponent(raw)); } catch (e) {}
                }
                return null;
            }
            case 'none':
                return /^https?:\/\//i.test(raw) ? raw : null;
            default:
                return null;
        }
    }

    // ============================================================
    // 短链接工具
    // ============================================================
    function findShortlinkRule(url) {
        let host;
        try { host = new URL(url).hostname.toLowerCase(); } catch (e) { return null; }
        let h = host;
        while (h) {
            const rule = SHORTLINK_RULE_MAP.get(h);
            if (rule) return rule;
            const idx = h.indexOf('.');
            if (idx === -1) break;
            h = h.slice(idx + 1);
        }
        return null;
    }

    function needsShortlinkResolution(url) {
        if (!ENABLE_SHORTLINK_EXPAND) return false;
        const rule = findShortlinkRule(url);
        if (!rule) return false;
        if (rule.expand) {
            try {
                const result = rule.expand(url);
                return !!(result && result !== url);
            } catch (e) { return false; }
        }
        return true;
    }

    function trySyncResolveShortlink(url) {
        if (!ENABLE_SHORTLINK_EXPAND) return null;
        const rule = findShortlinkRule(url);
        if (!rule || !rule.expand) return null;
        try {
            const result = rule.expand(url);
            if (result && result !== url) return result;
        } catch (e) {}
        return null;
    }

    const shortlinkCache = new Map();
    const shortlinkPending = new Map();

    function resolveShortlink(url) {
        if (!ENABLE_SHORTLINK_EXPAND) return Promise.resolve(url);
        if (shortlinkCache.has(url)) return Promise.resolve(shortlinkCache.get(url));
        if (shortlinkPending.has(url)) return shortlinkPending.get(url);

        const p = new Promise((resolve) => {
            const sync = trySyncResolveShortlink(url);
            if (sync) { resolve(sync); return; }

            const rule = findShortlinkRule(url);
            if (!rule || typeof GM_xmlhttpRequest !== 'function') {
                resolve(url);
                return;
            }

            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                followRedirects: true,
                timeout: SHORTLINK_TIMEOUT,
                onload: (res) => resolve(res.finalUrl || url),
                onerror: () => resolve(url),
                ontimeout: () => resolve(url),
            });
        }).then(final => {
            if (shortlinkCache.size >= SHORTLINK_CACHE_MAX) shortlinkCache.clear();
            shortlinkCache.set(url, final);
            shortlinkPending.delete(url);
            return final;
        });

        shortlinkPending.set(url, p);
        return p;
    }

    // ============================================================
    // 网络解码
    // ============================================================
    const networkQueue = [];
    let networkActive = 0;

    function rawNetworkDecode(url) {
        return new Promise((resolve) => {
            if (typeof GM_xmlhttpRequest !== 'function') { resolve(null); return; }
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                followRedirects: true,
                timeout: NETWORK_DECODE_TIMEOUT,
                headers: {
                    'User-Agent': navigator.userAgent,
                    'Referer': location.href,
                },
                onload: (res) => {
                    const final = res.finalUrl;
                    if (final && final !== url && !/\/goto\?/i.test(final)) {
                        resolve(final);
                    } else {
                        resolve(null);
                    }
                },
                onerror: () => resolve(null),
                ontimeout: () => resolve(null),
            });
        });
    }

    function pumpNetworkQueue() {
        while (networkActive < NETWORK_CONCURRENCY && networkQueue.length > 0) {
            const task = networkQueue.shift();
            networkActive++;
            rawNetworkDecode(task.url).then(decoded => {
                networkActive--;
                task.resolve(decoded);
                pumpNetworkQueue();
            });
        }
    }

    function queueNetworkDecode(url) {
        return new Promise((resolve) => {
            networkQueue.push({ url, resolve });
            pumpNetworkQueue();
        });
    }

    // ============================================================
    // 解码缓存（只缓存成功）+ 并发去重
    // ============================================================
    const decodeCache = new Map();
    const decodePending = new Map();

    function cacheDecoded(url, result) {
        if (!result) return;
        if (decodeCache.size >= DECODE_CACHE_MAX) decodeCache.clear();
        decodeCache.set(url, result);
    }

    function needsNetworkDecode(url) {
        if (!QUICK_DECODE_RE.test(url)) return false;
        let urlObj;
        try { urlObj = new URL(url, location.href); } catch (e) { return false; }
        if (!/^https?:$/i.test(urlObj.protocol)) return false;
        for (const rule of SITE_RULES) {
            if (rule.decode !== 'network') continue;
            try { if (rule.test(urlObj.hostname, urlObj.pathname, urlObj)) return true; } catch (e) {}
        }
        return false;
    }

    function tryDecodeSync(rawUrl) {
        if (decodeCache.has(rawUrl)) return decodeCache.get(rawUrl);
        if (!QUICK_DECODE_RE.test(rawUrl)) return null;

        let urlObj;
        try { urlObj = new URL(rawUrl, location.href); } catch (e) { return null; }
        if (!/^https?:$/i.test(urlObj.protocol)) return null;

        for (const rule of SITE_RULES) {
            if (rule.decode === 'network') continue;
            let matched = false;
            try { matched = rule.test(urlObj.hostname, urlObj.pathname, urlObj); } catch (e) { continue; }
            if (!matched) continue;

            let rawTarget = null;
            try { rawTarget = rule.getTarget(urlObj); } catch (e) { continue; }
            if (!rawTarget) continue;

            const decoded = decodeByMode(rawTarget, rule.decode || 'base64+uri');
            if (decoded) {
                const syncExpanded = trySyncResolveShortlink(decoded);
                const result = syncExpanded || decoded;
                cacheDecoded(rawUrl, result);
                return result;
            }
        }
        return null;
    }

    function decodeUrlAsync(rawUrl) {
        if (decodeCache.has(rawUrl)) return Promise.resolve(decodeCache.get(rawUrl));
        if (decodePending.has(rawUrl)) return decodePending.get(rawUrl);

        const sync = tryDecodeSync(rawUrl);
        if (sync) return Promise.resolve(sync);

        if (!needsNetworkDecode(rawUrl)) return Promise.resolve(null);

        const p = queueNetworkDecode(rawUrl).then(decoded => {
            if (decoded) {
                const syncExpanded = trySyncResolveShortlink(decoded);
                const result = syncExpanded || decoded;
                cacheDecoded(rawUrl, result);
                return result;
            }
            return null;
        }).finally(() => {
            decodePending.delete(rawUrl);
        });

        decodePending.set(rawUrl, p);
        return p;
    }

    // ============================================================
    // 标签页打开工具（核心：区分前台/后台）
    // ============================================================
    function hasGMOpenInTab() {
        return typeof GM_openInTab === 'function';
    }

    // 统一入口：根据模式决定前台/后台打开
    // - presetWin：前台模式时，供异步解析后替换地址的预开窗口
    function openResult(url, presetWin) {
        // 1) 有预开窗口 → 直接替换（仅前台异步路径）
        if (presetWin && !presetWin.closed) {
            try { presetWin.location.replace(url); return; }
            catch (e) {
                try { presetWin.location.href = url; return; } catch (e2) {}
            }
        }
        // 2) 后台模式 + GM_openInTab 可用
        if (OPEN_IN_BACKGROUND && hasGMOpenInTab()) {
            try {
                GM_openInTab(url, { active: false, insert: true });
                return;
            } catch (e) {}
        }
        // 3) 前台模式 / 无 GM_openInTab → window.open
        const win = window.open(url, '_blank');
        if (!win) location.href = url;
    }

    // 预开空白标签 + 加载提示（仅前台异步路径使用）
    function openLoadingTab(text) {
        const win = window.open('about:blank', '_blank');
        if (win) {
            try {
                win.document.title = text || '正在解析链接...';
                win.document.body.innerHTML =
                    '<div style="font-family:system-ui,-apple-system,sans-serif;' +
                    'padding:40px;color:#666;font-size:14px;">' +
                    (text || '正在解析链接，请稍候…') + '</div>';
            } catch (e) {}
        }
        return win;
    }

    // ============================================================
    // 后台模式下的轻量 toast 提示
    // ============================================================
    let activeToast = null;
    function showToast(text) {
        if (!activeToast || !activeToast.parentNode) {
            activeToast = document.createElement('div');
            activeToast.style.cssText = [
                'position:fixed', 'bottom:20px', 'right:20px',
                'background:rgba(0,0,0,0.82)', 'color:#fff',
                'padding:10px 16px', 'border-radius:6px',
                'font:13px system-ui,-apple-system,sans-serif',
                'z-index:2147483647', 'pointer-events:none',
                'box-shadow:0 2px 8px rgba(0,0,0,0.3)',
                'transition:opacity 0.3s', 'max-width:60vw'
            ].join(';');
            (document.body || document.documentElement).appendChild(activeToast);
        }
        activeToast.textContent = text;
        activeToast.style.opacity = '1';
        return activeToast;
    }
    function dismissToast(div) {
        if (!div || !div.parentNode) return;
        div.style.opacity = '0';
        setTimeout(() => {
            if (div.parentNode) div.parentNode.removeChild(div);
            if (activeToast === div) activeToast = null;
        }, 300);
    }

    // ============================================================
    // 1. 点击拦截
    // ============================================================
    document.addEventListener('click', function(e) {
        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

        const link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if (!link) return;

        const href = link.href;
        const wasDecoded = link.dataset.__decoded === '1';
        const needsDecode = QUICK_DECODE_RE.test(href);
        const needsShort = ENABLE_SHORTLINK_EXPAND && needsShortlinkResolution(href);

        // 已是真实地址 → 直接按模式打开
        if (wasDecoded && !needsDecode && !needsShort) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            openResult(href);
            return;
        }

        if (!needsDecode && !needsShort) return;

        // 命中缓存 → 立即打开
        if (needsDecode && decodeCache.has(href)) {
            const cached = decodeCache.get(href);
            if (cached) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                if (needsShortlinkResolution(cached)) {
                    resolveShortlink(cached).then(final => openResult(final || cached));
                } else {
                    openResult(cached);
                }
                return;
            }
        }

        // 同步解码
        const sync = needsDecode ? tryDecodeSync(href) : null;
        if (sync) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            if (needsShortlinkResolution(sync)) {
                resolveShortlink(sync).then(final => openResult(final || sync));
            } else {
                openResult(sync);
            }
            return;
        }

        // ---- 异步解析路径 ----
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (OPEN_IN_BACKGROUND) {
            // 后台模式：不预开窗口（用户看不到），先 toast 提示，解析完后台打开
            const toast = showToast('正在解析链接，稍后将在后台打开…');
            decodeUrlAsync(href).then(decoded => {
                const target = decoded || href;
                if (needsShortlinkResolution(target)) {
                    resolveShortlink(target).then(final => {
                        dismissToast(toast);
                        openResult(final || target);
                    });
                } else {
                    dismissToast(toast);
                    openResult(target);
                }
            });
        } else {
            // 前台模式：预开空白标签 + 加载提示，解析完替换地址
            const presetWin = openLoadingTab('正在解析链接，请稍候…');
            decodeUrlAsync(href).then(decoded => {
                const target = decoded || href;
                if (needsShortlinkResolution(target)) {
                    resolveShortlink(target).then(final => openResult(final || target, presetWin));
                } else {
                    openResult(target, presetWin);
                }
            });
        }
    }, { capture: true, passive: false });

    // ============================================================
    // 2. 悬停 → 改写 href（状态栏 + 预热缓存）
    // ============================================================
    document.addEventListener('mouseover', function(e) {
        const link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if (!link) return;

        const href = link.href;
        if (!QUICK_DECODE_RE.test(href) &&
            !(ENABLE_SHORTLINK_EXPAND && findShortlinkRule(href))) return;

        const sync = tryDecodeSync(href);
        if (sync && sync !== href) {
            if (link.href === href) {
                link.dataset.__originalHref = href;
                link.href = sync;
                link.dataset.__decoded = '1';
            }
            return;
        }

        if (needsNetworkDecode(href) && !link.__ld_hovering) {
            link.__ld_hovering = true;
            const snapshot = href;
            decodeUrlAsync(href).then(decoded => {
                link.__ld_hovering = false;
                if (decoded && decoded !== snapshot &&
                    link.href === snapshot &&
                    link.dataset.__decoded !== '1') {
                    link.dataset.__originalHref = snapshot;
                    link.href = decoded;
                    link.dataset.__decoded = '1';
                }
            });
        }
    }, true);

    // ============================================================
    // 3. 拖拽 → 写入真实地址到 dataTransfer
    // ============================================================
    document.addEventListener('dragstart', function(e) {
        const link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if (!link) return;

        const href = link.href;
        if (!QUICK_DECODE_RE.test(href)) return;

        const decoded = tryDecodeSync(href) || trySyncResolveShortlink(href);
        if (!decoded || decoded === href) return;

        try {
            e.dataTransfer.setData('text/uri-list', decoded);
            e.dataTransfer.setData('text/plain', decoded);
            if (e.dataTransfer.types &&
                Array.prototype.includes.call(e.dataTransfer.types, 'text/html')) {
                const clone = link.cloneNode(true);
                clone.href = decoded;
                e.dataTransfer.setData('text/html', clone.outerHTML);
            }
        } catch (err) {}
    }, true);

    // ============================================================
    // 4. 页面链接批量重写 + 动态观察 + 延迟补扫
    // ============================================================
    if (ENABLE_LINK_REWRITE) {
        async function processLink(link) {
            if (!link || !link.href) return;
            if (link.dataset.__decoded === '1') return;
            if (link.__ld_processing) return;
            link.__ld_processing = true;

            try {
                const href = link.href;
                if (!QUICK_DECODE_RE.test(href) &&
                    !(ENABLE_SHORTLINK_EXPAND && findShortlinkRule(href))) return;

                const decoded = await decodeUrlAsync(href);
                if (decoded && decoded !== href &&
                    link.href === href &&
                    link.dataset.__decoded !== '1') {
                    link.dataset.__originalHref = href;
                    link.href = decoded;
                    link.dataset.__decoded = '1';
                }
            } finally {
                link.__ld_processing = false;
            }
        }

        function rewriteLinks(root) {
            if (!root || !root.querySelectorAll) return;
            root.querySelectorAll('a[href]').forEach(processLink);
        }

        let pendingNodes = new Set();
        let scheduled = false;

        function flushPending() {
            scheduled = false;
            const nodes = pendingNodes;
            pendingNodes = new Set();
            for (const n of nodes) {
                if (n.tagName === 'A') processLink(n);
                else rewriteLinks(n);
            }
        }

        function scheduleRewrite(node) {
            if (!node || node.nodeType !== 1) return;
            pendingNodes.add(node);
            if (scheduled) return;
            scheduled = true;
            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(flushPending, { timeout: 1000 });
            } else {
                setTimeout(flushPending, 50);
            }
        }

        function initialScan() {
            rewriteLinks(document);
            setTimeout(() => rewriteLinks(document), 1500);
            setTimeout(() => rewriteLinks(document), 3500);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initialScan);
        } else {
            initialScan();
        }

        function startObserver() {
            const target = document.documentElement || document.body || document;
            if (!target) return;
            const observer = new MutationObserver(mutations => {
                for (const m of mutations) {
                    for (const node of m.addedNodes) {
                        if (node.nodeType !== 1) continue;
                        scheduleRewrite(node);
                    }
                }
            });
            observer.observe(target, { childList: true, subtree: true });
            setTimeout(() => observer.disconnect(), REWRITE_OBSERVER_TIMEOUT);
        }

        if (document.documentElement) startObserver();
        else document.addEventListener('DOMContentLoaded', startObserver);
    }

    // ============================================================
    // 5. 兜底：地址栏直接输入编码 URL 时，当前页替换
    // ============================================================
    (async function autoRedirect() {
        if (!QUICK_DECODE_RE.test(location.href)) return;
        const decoded = await decodeUrlAsync(location.href);
        if (decoded && decoded !== location.href) {
            location.replace(decoded);
        }
    })();

})();