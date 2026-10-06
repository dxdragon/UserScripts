// ==UserScript==
// @name         外链解码直链跳转
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  外链解码原链接、去跳转，短链接直达（性能优化版）
// @author       Shay
// @match        *://*/*
// @exclude      *://*/*play/*
// @exclude      *://*/vod*/*
// @exclude      *://*/*video/*
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-start
// @updateURL    https://gh-proxy.com/raw.githubusercontent.com/dxdragon/UserScripts/main/link_decoding.user.js
// @downloadURL  https://gh-proxy.com/raw.githubusercontent.com/dxdragon/UserScripts/main/link_decoding.user.js
// ==/UserScript==

(function() {
    'use strict';

    // ============================================================
    // 开关
    // ============================================================
    const ENABLE_SHORTLINK_EXPAND = true;
    const SHORTLINK_TIMEOUT = 5000;

    // ★ 是否重写页面链接 href。关闭后页面加载几乎零开销，
    //   只保留点击拦截 + 地址栏自动跳转。
    const ENABLE_LINK_REWRITE = true;

    // MutationObserver 最长观察时间（毫秒）
    const REWRITE_OBSERVER_TIMEOUT = 15000;

    // 短链缓存上限
    const SHORTLINK_CACHE_MAX = 200;

    // ★ 快速预筛：只有字符串里出现这些特征才进入完整解码流程
    const QUICK_DECODE_RE =
        /(?:\/redirect(?:[?#]|$)|[?&](?:golink|url|target|link)=|go\.php|\/target\/)/i;

    // ============================================================
    // 站点规则
    // ============================================================
    const SITE_RULES = [
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

    // ★ 短链域名 → 规则 的 Map，避免每次线性遍历
    const SHORTLINK_RULE_MAP = new Map();
    for (const rule of SHORTLINK_RULES) {
        for (const d of rule.domains) {
            SHORTLINK_RULE_MAP.set(d.toLowerCase(), rule);
        }
    }

    // ============================================================
    // 解码工具
    // ============================================================
    const BASE64_ONLY_RE = /^[A-Za-z0-9+/_=-]+$/;

    function tryBase64Decode(str) {
        if (!str || typeof str !== 'string' || str.length < 8) return null;
        // ★ 快速预检：含 % 或 :// 一定不是纯 base64，直接放弃
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
                const b64 = tryBase64Decode(raw);
                if (b64) return b64;

                const uri = tryUriDecode(raw);
                if (uri) return uri;

                if (raw.includes('%')) {
                    try {
                        return tryBase64Decode(decodeURIComponent(raw));
                    } catch (e) {}
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

    // ★ 用域名层级查 Map，避免遍历整个规则列表
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
            } catch (e) {
                return false;
            }
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

    // ★ 缓存 + 并发去重
    const shortlinkCache = new Map();
    const shortlinkPending = new Map();

    function resolveShortlink(url) {
        if (!ENABLE_SHORTLINK_EXPAND) return Promise.resolve(url);

        if (shortlinkCache.has(url)) {
            return Promise.resolve(shortlinkCache.get(url));
        }
        if (shortlinkPending.has(url)) {
            return shortlinkPending.get(url);
        }

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
            if (shortlinkCache.size >= SHORTLINK_CACHE_MAX) {
                shortlinkCache.clear();
            }
            shortlinkCache.set(url, final);
            shortlinkPending.delete(url);
            return final;
        });

        shortlinkPending.set(url, p);
        return p;
    }

    // ============================================================
    // 解码入口
    // ============================================================
    function decodeUrl(rawUrl) {
        if (!rawUrl) return null;

        // ★ 快速预筛：绝大多数普通链接在这里就被拒掉
        if (!QUICK_DECODE_RE.test(rawUrl)) return null;

        let urlObj;
        try { urlObj = new URL(rawUrl, location.href); } catch (e) { return null; }
        if (!/^https?:$/i.test(urlObj.protocol)) return null;

        const host = urlObj.hostname;
        const path = urlObj.pathname;

        for (const rule of SITE_RULES) {
            let matched = false;
            try { matched = rule.test(host, path, urlObj); } catch (e) { continue; }
            if (!matched) continue;

            let rawTarget = null;
            try { rawTarget = rule.getTarget(urlObj); } catch (e) { continue; }
            if (!rawTarget) continue;

            const decoded = decodeByMode(rawTarget, rule.decode || 'base64+uri');
            if (decoded) {
                const syncExpanded = trySyncResolveShortlink(decoded);
                return syncExpanded || decoded;
            }
        }
        return null;
    }

    // ============================================================
    // 打开新标签页
    // ============================================================
    function openInNewTab(url, presetWin) {
        if (presetWin && !presetWin.closed) {
            try {
                presetWin.location.replace(url);
            } catch (e) {
                presetWin.location.href = url;
            }
            return;
        }
        const win = window.open(url, '_blank');
        if (!win) {
            location.href = url;
        }
    }

    // ============================================================
    // 1. 点击拦截 → 新标签页打开
    // ============================================================
    document.addEventListener('click', function(e) {
        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

        const link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if (!link) return;

        const href = link.href;

        // ★ 快速预筛：不需要解码、也不像短链 → 立即放行
        const maybeDecode = QUICK_DECODE_RE.test(href);
        const maybeShort = ENABLE_SHORTLINK_EXPAND && findShortlinkRule(href);
        if (!maybeDecode && !maybeShort) return;

        const decoded = maybeDecode ? decodeUrl(href) : null;
        const target = decoded || href;
        const isShortlink = needsShortlinkResolution(target);

        if (!decoded && !isShortlink) return;
        if (decoded === href && !isShortlink) return;

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (isShortlink) {
            const sync = trySyncResolveShortlink(target);
            if (sync) {
                openInNewTab(sync);
                return;
            }

            const presetWin = window.open('about:blank', '_blank');
            resolveShortlink(target).then(finalUrl => {
                const final = finalUrl || target;
                openInNewTab(final, presetWin);
            });
        } else {
            openInNewTab(target);
        }
    }, { capture: true, passive: false });

    // ============================================================
    // 2. 重写页面上链接的 href（可选，同步）
    // ============================================================
    if (ENABLE_LINK_REWRITE) {
        const checkedLinks = new WeakSet();

        function processLink(link) {
            if (!link || !link.href) return;
            if (checkedLinks.has(link)) return;
            checkedLinks.add(link);

            const href = link.href;
            // ★ 快速预筛，避免大量普通链接进入 URL / 规则流程
            if (!QUICK_DECODE_RE.test(href)) return;

            const decoded = decodeUrl(href);
            if (decoded && decoded !== href) {
                link.dataset.__originalHref = href;
                link.href = decoded;
                link.dataset.__decoded = '1';
            }
        }

        function rewriteLinks(root) {
            if (!root || !root.querySelectorAll) return;
            root.querySelectorAll('a[href]').forEach(processLink);
        }

        // ★ 批处理新增节点，降低 MutationObserver 回调压力
        let pendingNodes = new Set();
        let scheduled = false;

        function flushPending() {
            scheduled = false;
            const nodes = pendingNodes;
            pendingNodes = new Set();

            for (const n of nodes) {
                if (n.tagName === 'A') {
                    processLink(n);
                } else {
                    rewriteLinks(n);
                }
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

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => rewriteLinks(document));
        } else {
            rewriteLinks(document);
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
    // 3. 兜底：地址栏直接输入编码 URL 时，当前标签页替换
    // ============================================================
    (function autoRedirect() {
        if (!QUICK_DECODE_RE.test(location.href)) return;
        const decoded = decodeUrl(location.href);
        if (decoded && decoded !== location.href) {
            location.replace(decoded);
        }
    })();

})();