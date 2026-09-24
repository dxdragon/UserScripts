// ==UserScript==
// @name         外链解码直链跳转
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  外链解码原链接、去跳转，短链接直达
// @author       Shay
// @match        *://*/*
// @exclude      *://*/*play/*
// @exclude      *://*/vod*/*
// @exclude      *://*/*video/*
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/dxdragon/UserScripts/raw/main/link_decoding.user.js
// @downloadURL  https://raw.githubusercontent.com/dxdragon/UserScripts/raw/main/link_decoding.user.js
// ==/UserScript==

(function() {
    'use strict';

    // ============================================================
    // 开关
    // ============================================================
    const ENABLE_SHORTLINK_EXPAND = true;
    const SHORTLINK_TIMEOUT = 5000;

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
                // 取出 /target/ 之后的部分
                const m = urlObj.pathname.match(/^\/target\/(.+)$/);
                if (!m) return null;
                // 路径段可能被 URL 编码（如 = 变成 %3D），先解码
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
            // 只用于把 /shorts/ 统一成 /watch?v=（补全而非去短）
            // needsShortlinkResolution 会保证 /watch?v= 这种已经正常的地址不被误判
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

    // ============================================================
    // 解码工具
    // ============================================================
    function tryBase64Decode(str) {
        if (!str || typeof str !== 'string') return null;
        try {
            const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
            const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
            const decoded = atob(padded);
            return /^https?:\/\//i.test(decoded) ? decoded : null;
        } catch (e) { return null; }
    }
    function tryUriDecode(str) {
        if (!str || typeof str !== 'string') return null;
        // 没有 % 说明根本没被 URL 编码，不要当成"解码成功"
        if (!str.includes('%')) return null;
        try {
            const decoded = decodeURIComponent(str);
            return /^https?:\/\//i.test(decoded) ? decoded : null;
        } catch (e) { return null; }
    }
    function decodeByMode(raw, mode) {
        if (!raw) return null;
        switch (mode) {
            case 'base64': return tryBase64Decode(raw);
            case 'uri':    return tryUriDecode(raw);
            case 'base64+uri': {
                let r = tryBase64Decode(raw);
                if (r) return r;
                r = tryUriDecode(raw);
                if (r) return r;
                const uriDecoded = (() => {
                    try { return decodeURIComponent(raw); } catch { return raw; }
                })();
                return tryBase64Decode(uriDecoded);
            }
            case 'none': return /^https?:\/\//i.test(raw) ? raw : null;
            default:     return null;
        }
    }

    // ============================================================
    // 短链接工具
    // ============================================================

    // 找到匹配的短链接规则（只看域名）
    function findShortlinkRule(url) {
        try {
            const host = new URL(url).hostname.toLowerCase();
            for (const rule of SHORTLINK_RULES) {
                if (rule.domains.some(d => host === d || host.endsWith('.' + d))) {
                    return rule;
                }
            }
        } catch (e) {}
        return null;
    }

    // 判断该 URL 是否真的需要短链接处理：
    // - 有 expand 的：只有 expand 结果与原文不同才算需要
    // - 没有 expand 的：域名命中就算需要（走远程解析）
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
        return true; // 无 expand → 需远程解析
    }

    // 同步解析：只有 expand 命中才返回结果，否则返回 null
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

    // 异步解析（本地不能展开时使用）
    function resolveShortlink(url) {
        return new Promise((resolve) => {
            if (!ENABLE_SHORTLINK_EXPAND) { resolve(url); return; }

            const sync = trySyncResolveShortlink(url);
            if (sync) { resolve(sync); return; }

            const rule = findShortlinkRule(url);
            if (!rule) { resolve(url); return; }

            if (typeof GM_xmlhttpRequest !== 'function') { resolve(url); return; }
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                followRedirects: true,
                timeout: SHORTLINK_TIMEOUT,
                onload: (res) => resolve(res.finalUrl || url),
                onerror: () => resolve(url),
                ontimeout: () => resolve(url),
            });
        });
    }

    // ============================================================
    // 解码入口：解码 + 同步短链接展开
    // ============================================================
    function decodeUrl(rawUrl) {
        if (!rawUrl) return null;
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
            //console.warn('[外链解码] 新标签页被拦截，改为当前标签页打开');
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
        const decoded = decodeUrl(href);      // 已经过同步短链展开
        const target = decoded || href;

        // ★ 关键修复：只有当 expand 真的能改变目标、或需远程解析时才算“短链接”
        const isShortlink = needsShortlinkResolution(target);

        // 既不是编码链接，也不是需要处理的短链接 → 放行
        if (!decoded && !isShortlink) return;
        // 解码前后相同，且不需要短链接处理 → 放行
        if (decoded === href && !isShortlink) return;

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (isShortlink) {
            // 优先同步解析（youtu.be 等本地可展开的）
            const sync = trySyncResolveShortlink(target);
            if (sync) {
                //console.log(`[外链解码] 同步直达 → 新标签: ${target}\n          -> ${sync}`);
                openInNewTab(sync);
                return;
            }

            // 同步失败：异步解析，预开空白页占位
            const presetWin = window.open('about:blank', '_blank');
            //console.log(`[外链解码] 异步解析短链接: ${target}`);
            resolveShortlink(target).then(finalUrl => {
                const final = finalUrl || target;
                //console.log(`[外链解码] 新标签页直达: ${final}`);
                openInNewTab(final, presetWin);
            });
        } else {
            // 普通编码链接 / 已解析完成的地址：同步打开
            //console.log(`[外链解码] 点击拦截 → 新标签: ${href}\n          -> ${target}`);
            openInNewTab(target);
        }
    }, true);

    // ============================================================
    // 2. 重写页面上链接的 href（同步）
    // ============================================================
    function rewriteLinks(root) {
        if (!root || !root.querySelectorAll) return;
        root.querySelectorAll('a[href]').forEach(link => {
            if (link.dataset.__decoded) return;
            const href = link.href;
            const decoded = decodeUrl(href);
            if (decoded && decoded !== href) {
                link.dataset.__originalHref = href;
                link.href = decoded;
                link.dataset.__decoded = '1';
            }
        });
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
                    if (node.tagName === 'A' && node.href) {
                        const href = node.href;
                        const decoded = decodeUrl(href);
                        if (decoded && decoded !== href) {
                            node.dataset.__originalHref = href;
                            node.href = decoded;
                            node.dataset.__decoded = '1';
                        }
                    }
                    rewriteLinks(node);
                }
            }
        });
        observer.observe(target, { childList: true, subtree: true });
        setTimeout(() => observer.disconnect(), 15000);
    }
    if (document.documentElement) startObserver();
    else document.addEventListener('DOMContentLoaded', startObserver);

    // ============================================================
    // 3. 兜底：地址栏直接输入编码 URL 时，当前标签页替换
    // ============================================================
    (function autoRedirect() {
        const decoded = decodeUrl(location.href);
        if (decoded && decoded !== location.href) {
            //console.log(`[外链解码] 页面自动跳转: ${location.href}\n          -> ${decoded}`);
            location.replace(decoded);
        }
    })();

})();