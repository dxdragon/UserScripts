// ==UserScript==
// @name         外链解码直链跳转
// @namespace    http://tampermonkey.net/
// @version      1.2.0
// @description  外链解码原链接、去跳转，短链接直达
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

(function () {
    'use strict';

    const CFG = {
        ENABLE_SHORTLINK_EXPAND: true,
        ENABLE_LINK_REWRITE: true,
        ENABLE_LANDING_AUTO_SKIP: true,
        OPEN_SEARCH_ENGINE_RESULTS_IN_BACKGROUND: true,
        SHORTLINK_TIMEOUT: 5000,
        SHORTLINK_CACHE_MAX: 200,
        NETWORK_DECODE_TIMEOUT: 6000,
        NETWORK_CONCURRENCY: 4,
        DECODE_CACHE_MAX: 500,
        FETCH_TIMEOUT: 5000,
        REWRITE_OBSERVER_TIMEOUT: 15000,
    };

    // ═══════════════════════════════════════════════════════════
    // 语义词根 —— 行为模式
    // ═══════════════════════════════════════════════════════════
    const ROOTS = {
        // 转移：go / goto / jump / redirect / transfer / forward / pass / visit / follow
        move: 'go(?:to)?|jump|redirect\\w*|transfer|forward|pass(?:port)?|visit|follow',
        // 离开：out / leave / exit / escape / external / ext / outbound / outgoing
        leave: 'out(?:going|bound)?|leave(?:-?site)?|exit|escape|external|ext(?:link)?',
        // 警告：warn / confirm / notice / tip / safety / security / caution
        warn: 'warn(?:ing)?|confirm\\w*|notice|tip|safety|safe\\w*|security|caution',
        // 中介：middle / middleware / uri / linkfilter / linkshim / filter / mask / cloak
        middle: 'middle\\w*|uri(?:confirm)?|link(?:\\w+)?|filter|shim|mask|cloak',
        // 第三方：third / third-party / thirdlink
        third: 'third(?:[-_]?party|[-_]?link)?',
    };

    // 词根 × 格式 = 完整正则
    const ALT_ROOTS = `(?:${Object.values(ROOTS).join('|')})`;

    // 强路径：词根 + 扩展名（.php/.html/.aspx/.jsp）→ 直接触发静默 fetch
    const STRONG_PATH = new RegExp(
        `(?:^|\\/)${ALT_ROOTS}\\.(?:php|html?|aspx?|jsp)(?:[?#]|\\/|$)`, 'i'
    );

    // 弱路径：词根单独出现（带可选扩展词）→ 需配合 query 才信任
    const WEAK_PATH = new RegExp(
        `(?:^|\\/)${ALT_ROOTS}(?:[-_]?[a-z]{0,10})?(?:\\/|$)`, 'i'
    );

    // ═══════════════════════════════════════════════════════════
    // 参数词根 —— 参数名 = 语义词根 + 可选前后缀
    // ═══════════════════════════════════════════════════════════
    // 强参数：语义明确指向目标地址，命中即信任其值
    const PARAM_STRONG = new RegExp(
        '^(?:[a-z0-9]+[_-])*' +
        '(?:url|uri|link|href|target|goto(?:link)?|jump|redirect\\w*|forward|pass|' +
        'dest(?:ination)?|remoteurl|toasturl|pfurl)' +
        '(?:[_-][a-z0-9]+)?$', 'i'
    );

    // 弱参数：语义模糊，值本身必须是 URL 才信任
    const PARAM_WEAK = /^(?:to|from|next|out|dest|source|src|ref(?:er)?|return(?:to)?|back|visit|open|view)$/i;

    // ═══════════════════════════════════════════════════════════
    // 文案词根 —— 用组合模式覆盖中英文按钮/提示
    // ═══════════════════════════════════════════════════════════
    const CONTINUE_TEXT = new RegExp(
        '^(?:' +
        '继续(?:访问|前往|跳转)|立即(?:前往|跳转|访问)|点击(?:前往|访问|跳转)|' +
        '前往(?:目标|网站|链接)?|确定(?:前往|访问)?|确认(?:前往|访问)?|' +
        '已知晓[，,]?\\s*继续访问[！!]?|访问(?:网站|链接)?|跳转|' +
        'go\\s*on|continue|proceed|visit\\s*(?:site|link)?|yes|ok|confirm' +
        ')$', 'i'
    );

    const CONFIRM_TEXT = new RegExp(
        '(?:' +
        '即将(?:离开|前往|跳转)|离开(?:本站|此站点)|您?将?进入第三方|' +
        '注意您?的?账号|安全提醒|外链提示|外部链接|跳转提示|确认前往|' +
        'about\\s*to\\s*leave|leaving|external\\s*link|third[-\\s]?party|redirect' +
        ')', 'i'
    );

    // 按钮候选：CSS 属性选择器模式化
    const CONTINUE_SELECTORS = [
        'a.loading-btn[href]',
        '.continue-btn[href]',
        '.btn-continue[href]',
        '#continue[href]',
        'a.continue[href]',
        'a[rel*="noopener"][target="_self"][href]',
    ];

    // ═══════════════════════════════════════════════════════════
    // 跳转手段词根 —— meta / script / 文字 三种通用手段
    // ═══════════════════════════════════════════════════════════
    const META_REFRESH_URL = /url\s*=\s*['"]?([^'";\s]+)/i;

    const SCRIPT_REDIRECTS = [
        /location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/,
        /location\.(?:replace|assign)\s*\(\s*['"]([^'"]+)['"]\s*\)/,
        /window\.open\s*\(\s*['"](https?:\/\/[^'"]+)['"]/,
    ];

    // ═══════════════════════════════════════════════════════════
    // 名单层：特殊模式
    // ═══════════════════════════════════════════════════════════
    // ① 短链：特征是"响应 3xx"，请求前不可知
    const SHORTLINK_DOMAINS = new Set([
        'youtu.be', 'b23.tv', 't.cn', 'dwz.cn', 'url.cn', 'suo.im',
        'm.tb.cn', 'tb.cn', 's.click.taobao.com', 'u.jd.com', 'jd.cn',
        'sourl.cn', 'urlz.cn', 'sina.lt', 'tinyurl.com', 'bit.ly',
        'goo.gl', 'is.gd', 'ow.ly', 'buff.ly', 'rebrand.ly', 'cutt.ly',
        'shorturl.at', 'rb.gy',
    ]);

    // 短链本地可推导的展开器
    const SHORT_EXPANDERS = [
        { d: ['youtu.be'], f: u => { const m = u.match(/youtu\.be\/([\w-]+)/); return m ? `https://www.youtube.com/watch?v=${m[1]}` : null; } },
        { d: ['youtube.com'], f: u => { const m = u.match(/youtube\.com\/shorts\/([\w-]+)/); return m ? `https://www.youtube.com/watch?v=${m[1]}` : null; } },
    ];

    // ② Google /goto：token 加密，只能读 302 Location
    const GOOGLE_GOTO_RE = /^https?:\/\/(?:www\.)?google\.[a-z.]+\/goto\b/i;
    const GOOGLE_URL_RE = /^https?:\/\/(?:www\.)?google\.[a-z.]+\/url\b/i;

    // ③ 搜索引擎：仅决定前后台行为
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
        const h = location.hostname.toLowerCase(), p = location.pathname;
        return SEARCH_ENGINE_PATTERNS.some(x => x.host.test(h) && x.path.test(p));
    }

    const OPEN_IN_BACKGROUND = CFG.OPEN_SEARCH_ENGINE_RESULTS_IN_BACKGROUND && isSearchEnginePage();

    // 快速预筛：由词根自动生成，不需要手工维护
    const QUICK_RE = new RegExp(`(?:[?&][a-z0-9_-]+=)|${STRONG_PATH.source}|${WEAK_PATH.source}`, 'i');

    // ═══════════════════════════════════════════════════════════
    // 解码器
    // ═══════════════════════════════════════════════════════════
    function tryBase64(str) {
        if (!str || str.length < 8 || str.includes('%') || str.includes('://')) return null;
        if (!/^[A-Za-z0-9+/_=-]+$/.test(str)) return null;
        try {
            const n = str.replace(/-/g, '+').replace(/_/g, '/');
            const p = n + '='.repeat((4 - n.length % 4) % 4);
            const d = atob(p);
            return /^https?:\/\//i.test(d) ? d : null;
        } catch (e) { return null; }
    }
    function tryHex(str) {
        if (!str || !/^[0-9a-f]+$/i.test(str) || str.length % 2 !== 0) return null;
        try {
            const d = str.match(/.{2}/g).map(h => String.fromCharCode(parseInt(h, 16))).join('');
            return /^https?:\/\//i.test(d) ? d : null;
        } catch (e) { return null; }
    }
    function autoDecode(raw) {
        if (!raw) return null;
        let s = String(raw).trim();
        if (!s) return null;
        if (/^https?:\/\//i.test(s)) return s;
        if (s.includes('%')) {
            try {
                let d = s;
                for (let i = 0; i < 2 && d.includes('%'); i++) d = decodeURIComponent(d);
                if (/^https?:\/\//i.test(d)) return d;
            } catch (e) {}
        }
        const b = tryBase64(s); if (b) return b;
        const h = tryHex(s); if (h) return h;
        if (s.includes('%')) {
            try {
                const u = decodeURIComponent(s);
                const bb = tryBase64(u); if (bb) return bb;
                const hh = tryHex(u); if (hh) return hh;
            } catch (e) {}
        }
        return null;
    }
    const looksLikeUrl = v => typeof v === 'string' && /^https?(\/|%3a)/i.test(v);

    // ═══════════════════════════════════════════════════════════
    // 短链
    // ═══════════════════════════════════════════════════════════
    function findShortlinkRule(url) {
        let host;
        try { host = new URL(url).hostname.toLowerCase(); } catch (e) { return null; }
        let h = host;
        while (h) {
            if (SHORTLINK_DOMAINS.has(h)) {
                const ex = SHORT_EXPANDERS.find(x => x.d.includes(h));
                return ex ? { domain: h, expand: ex.f } : { domain: h };
            }
            const i = h.indexOf('.');
            if (i === -1) break;
            h = h.slice(i + 1);
        }
        return null;
    }
    function needsShortlink(url) {
        if (!CFG.ENABLE_SHORTLINK_EXPAND) return false;
        const r = findShortlinkRule(url);
        if (!r) return false;
        if (r.expand) { try { const x = r.expand(url); return !!(x && x !== url); } catch (e) { return false; } }
        return true;
    }
    function trySyncShortlink(url) {
        if (!CFG.ENABLE_SHORTLINK_EXPAND) return null;
        const r = findShortlinkRule(url);
        if (!r || !r.expand) return null;
        try { const x = r.expand(url); return x && x !== url ? x : null; } catch (e) { return null; }
    }
    const shortCache = new Map(), shortPending = new Map();
    function resolveShortlink(url) {
        if (!CFG.ENABLE_SHORTLINK_EXPAND) return Promise.resolve(url);
        if (shortCache.has(url)) return Promise.resolve(shortCache.get(url));
        if (shortPending.has(url)) return shortPending.get(url);
        const p = new Promise(res => {
            const sync = trySyncShortlink(url);
            if (sync) { res(sync); return; }
            if (!findShortlinkRule(url) || typeof GM_xmlhttpRequest !== 'function') { res(url); return; }
            GM_xmlhttpRequest({
                method: 'GET', url, followRedirects: true, timeout: CFG.SHORTLINK_TIMEOUT,
                onload: r => res(r.finalUrl || url),
                onerror: () => res(url),
                ontimeout: () => res(url),
            });
        }).then(f => {
            if (shortCache.size >= CFG.SHORTLINK_CACHE_MAX) shortCache.clear();
            shortCache.set(url, f);
            shortPending.delete(url);
            return f;
        });
        shortPending.set(url, p);
        return p;
    }

    // ═══════════════════════════════════════════════════════════
    // 网络解码队列
    // ═══════════════════════════════════════════════════════════
    const netQueue = []; let netActive = 0;
    function rawNetDecode(url) {
        return new Promise(res => {
            if (typeof GM_xmlhttpRequest !== 'function') { res(null); return; }
            GM_xmlhttpRequest({
                method: 'GET', url, followRedirects: true, timeout: CFG.NETWORK_DECODE_TIMEOUT,
                headers: { 'User-Agent': navigator.userAgent, 'Referer': location.href },
                onload: r => {
                    const f = r.finalUrl;
                    res(f && f !== url && !/\/goto\b/i.test(f) ? f : null);
                },
                onerror: () => res(null), ontimeout: () => res(null),
            });
        });
    }
    function pump() {
        while (netActive < CFG.NETWORK_CONCURRENCY && netQueue.length) {
            const t = netQueue.shift(); netActive++;
            rawNetDecode(t.url).then(d => { netActive--; t.res(d); pump(); });
        }
    }
    function queueNet(url) { return new Promise(res => { netQueue.push({ url, res }); pump(); }); }

    // ═══════════════════════════════════════════════════════════
    // 静默抓取 + 通用提取
    // ═══════════════════════════════════════════════════════════
    function fetchHtml(url) {
        return new Promise(res => {
            if (typeof GM_xmlhttpRequest !== 'function') { res(null); return; }
            GM_xmlhttpRequest({
                method: 'GET', url, followRedirects: true, timeout: CFG.FETCH_TIMEOUT,
                headers: { 'User-Agent': navigator.userAgent, 'Referer': location.href },
                onload: r => {
                    try {
                        const doc = new DOMParser().parseFromString(r.responseText || '', 'text/html');
                        res({ doc, baseUrl: r.finalUrl || url });
                    } catch (e) { res(null); }
                },
                onerror: () => res(null), ontimeout: () => res(null),
            });
        });
    }
    const resolveUrl = (h, b) => { try { return new URL(h, b).href; } catch (e) { return null; } };
    const isExternal = (h, b) => { try { const u = new URL(h, b), x = new URL(b); return /^https?:$/i.test(u.protocol) && u.hostname !== x.hostname; } catch (e) { return false; } };

    // 提取器：按"跳转手段"的优先级遍历
    function extractFromDoc(doc, baseUrl) {
        // 手段 1：meta refresh
        const meta = doc.querySelector('meta[http-equiv="refresh" i]');
        if (meta) {
            const m = (meta.getAttribute('content') || '').match(META_REFRESH_URL);
            if (m) { const u = resolveUrl(m[1], baseUrl); if (u && isExternal(u, baseUrl)) return u; }
        }

        const links = doc.querySelectorAll('a[href]');

        // 手段 2：已知确认按钮
        for (const sel of CONTINUE_SELECTORS) {
            try {
                const el = doc.querySelector(sel);
                if (!el) continue;
                const h = el.getAttribute('href') || el.value;
                if (!h) continue;
                const u = resolveUrl(h, baseUrl);
                if (u && isExternal(u, baseUrl)) return u;
            } catch (e) {}
        }

        // 手段 3：按钮文字匹配
        for (const a of links) {
            if (!CONTINUE_TEXT.test((a.textContent || '').trim())) continue;
            const h = a.getAttribute('href');
            if (!h) continue;
            const u = resolveUrl(h, baseUrl);
            if (u && isExternal(u, baseUrl)) return u;
        }

        // 手段 4：链接文字即 URL
        for (const a of links) {
            const t = (a.textContent || '').trim();
            if (!/^https?:\/\//i.test(t)) continue;
            const u = resolveUrl(t, baseUrl);
            if (u && isExternal(u, baseUrl)) return u;
        }

        // 手段 5：script 内跳转
        for (const s of doc.querySelectorAll('script:not([src])')) {
            const txt = s.textContent || '';
            for (const p of SCRIPT_REDIRECTS) {
                const m = txt.match(p);
                if (m) { const u = resolveUrl(m[1], baseUrl); if (u && isExternal(u, baseUrl)) return u; }
            }
        }

        // 手段 6：确认文案 + 第一个外链
        if (doc.body && CONFIRM_TEXT.test(doc.body.textContent || '')) {
            for (const a of links) {
                const h = a.getAttribute('href');
                if (!h) continue;
                const u = resolveUrl(h, baseUrl);
                if (u && isExternal(u, baseUrl)) return u;
            }
        }
        return null;
    }

    const middleCache = new Map(), middlePending = new Map();
    function resolveMiddlePage(url) {
        if (middleCache.has(url)) return Promise.resolve(middleCache.get(url));
        if (middlePending.has(url)) return middlePending.get(url);
        const p = fetchHtml(url).then(r => {
            if (!r) return null;
            const t = extractFromDoc(r.doc, r.baseUrl);
            if (!t) return null;
            if (needsShortlink(t)) return resolveShortlink(t);
            middleCache.set(url, t);
            return t;
        }).finally(() => middlePending.delete(url));
        middlePending.set(url, p);
        return p;
    }

    // ═══════════════════════════════════════════════════════════
    // URL 分析：词根匹配 → 分类
    // ═══════════════════════════════════════════════════════════
    function analyzeUrl(rawUrl) {
        let u;
        try { u = new URL(rawUrl, location.href); } catch (e) { return null; }
        if (!/^https?:$/i.test(u.protocol)) return null;

        // Google 特例
        if (GOOGLE_GOTO_RE.test(u.href)) return { type: 'network' };
        if (GOOGLE_URL_RE.test(u.href)) {
            const q = u.searchParams.get('q');
            if (q) return { type: 'sync', target: q };
        }

        // 参数层
        for (const [k, v] of u.searchParams) {
            if (!v) continue;
            if (PARAM_STRONG.test(k)) {
                const d = autoDecode(v);
                if (d) return { type: 'sync', target: d };
            }
            if (PARAM_WEAK.test(k) && looksLikeUrl(v)) {
                const d = autoDecode(v);
                if (d) return { type: 'sync', target: d };
            }
        }

        // 路径层
        if (STRONG_PATH.test(u.pathname)) return { type: 'middle' };
        if (WEAK_PATH.test(u.pathname) && u.search) return { type: 'middle' };
        if (needsShortlink(rawUrl)) return { type: 'short' };
        return null;
    }

    // ═══════════════════════════════════════════════════════════
    // 同步 / 异步解码
    // ═══════════════════════════════════════════════════════════
    const decodeCache = new Map();
    function cacheResult(url, r) {
        if (!r) return;
        if (decodeCache.size >= CFG.DECODE_CACHE_MAX) decodeCache.clear();
        decodeCache.set(url, r);
    }
    function trySync(rawUrl) {
        if (decodeCache.has(rawUrl)) return decodeCache.get(rawUrl);
        if (!QUICK_RE.test(rawUrl)) return null;
        const a = analyzeUrl(rawUrl);
        if (!a || a.type !== 'sync') return null;
        cacheResult(rawUrl, a.target);
        return a.target;
    }
    const asyncPending = new Map();
    function decodeAsync(rawUrl) {
        if (decodeCache.has(rawUrl)) return Promise.resolve(decodeCache.get(rawUrl));
        if (asyncPending.has(rawUrl)) return asyncPending.get(rawUrl);
        const sync = trySync(rawUrl);
        if (sync) return Promise.resolve(sync);
        const a = analyzeUrl(rawUrl);
        if (!a) return Promise.resolve(null);
        let promise;
        if (a.type === 'network') {
            promise = queueNet(rawUrl).then(d => { if (!d) return null; const x = trySyncShortlink(d) || d; cacheResult(rawUrl, x); return x; });
        } else if (a.type === 'middle') {
            promise = resolveMiddlePage(rawUrl).then(d => { if (d) cacheResult(rawUrl, d); return d; });
        } else if (a.type === 'short') {
            promise = resolveShortlink(rawUrl).then(d => { if (d && d !== rawUrl) cacheResult(rawUrl, d); return d; });
        } else return Promise.resolve(null);
        const w = promise.finally(() => asyncPending.delete(rawUrl));
        asyncPending.set(rawUrl, w);
        return w;
    }

    // ═══════════════════════════════════════════════════════════
    // 打开
    // ═══════════════════════════════════════════════════════════
    function openUrl(url) {
        if (typeof GM_openInTab === 'function') {
            try { GM_openInTab(url, { active: !OPEN_IN_BACKGROUND, insert: true }); return; } catch (e) {}
        }
        const w = window.open(url, '_blank');
        if (!w) location.href = url;
    }
    function makeAsyncOpener() {
        if (typeof GM_openInTab === 'function') {
            return url => { try { GM_openInTab(url, { active: !OPEN_IN_BACKGROUND, insert: true }); } catch (e) { const w = window.open(url, '_blank'); if (!w) location.href = url; } };
        }
        const w = window.open('about:blank', '_blank');
        if (w) {
            try {
                w.document.title = '正在解析链接...';
                w.document.body.innerHTML = '<div style="padding:40px;color:#666;font:14px sans-serif">正在解析链接，请稍候…</div>';
            } catch (e) {}
            return url => {
                if (!w.closed) { try { w.location.replace(url); } catch (e) { w.location.href = url; } }
                else { const w2 = window.open(url, '_blank'); if (!w2) location.href = url; }
            };
        }
        return url => { const w2 = window.open(url, '_blank'); if (!w2) location.href = url; };
    }

    // ═══════════════════════════════════════════════════════════
    // 事件：点击 / 悬停 / 拖拽
    // ═══════════════════════════════════════════════════════════
    document.addEventListener('click', function (e) {
        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        const link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if (!link) return;
        const href = link.href;
        if (link.dataset.__decoded === '1') {
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            openUrl(href);
            return;
        }
        const sync = trySync(href) || trySyncShortlink(href);
        if (sync) {
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            openUrl(sync);
            return;
        }
        const a = analyzeUrl(href);
        if (!a) return;
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        const opener = makeAsyncOpener();
        decodeAsync(href).then(t => opener(t || href));
    }, { capture: true, passive: false });

    document.addEventListener('mouseover', function (e) {
        const link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if (!link || link.dataset.__decoded === '1') return;
        const href = link.href;
        const sync = trySync(href) || trySyncShortlink(href);
        if (sync && sync !== href) {
            if (link.href === href) {
                link.dataset.__originalHref = href;
                link.href = sync;
                link.dataset.__decoded = '1';
            }
            return;
        }
        const a = analyzeUrl(href);
        if (!a || link.__hovering) return;
        link.__hovering = true;
        const snap = href;
        decodeAsync(href).then(t => {
            link.__hovering = false;
            if (t && t !== snap && link.href === snap && link.dataset.__decoded !== '1') {
                link.dataset.__originalHref = snap;
                link.href = t;
                link.dataset.__decoded = '1';
            }
        });
    }, true);

    document.addEventListener('dragstart', function (e) {
        const link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if (!link) return;
        const href = link.href;
        const sync = trySync(href) || trySyncShortlink(href);
        if (!sync || sync === href) return;
        try {
            e.dataTransfer.setData('text/uri-list', sync);
            e.dataTransfer.setData('text/plain', sync);
            if (e.dataTransfer.types && Array.prototype.includes.call(e.dataTransfer.types, 'text/html')) {
                const c = link.cloneNode(true);
                c.href = sync;
                e.dataTransfer.setData('text/html', c.outerHTML);
            }
        } catch (err) {}
    }, true);

    // ═══════════════════════════════════════════════════════════
    // 批量重写（仅同步）
    // ═══════════════════════════════════════════════════════════
    if (CFG.ENABLE_LINK_REWRITE) {
        function processLink(link) {
            if (!link || !link.href || link.dataset.__decoded === '1') return;
            const href = link.href;
            const sync = trySync(href) || trySyncShortlink(href);
            if (sync && sync !== href) {
                link.dataset.__originalHref = href;
                link.href = sync;
                link.dataset.__decoded = '1';
            }
        }
        function rewriteAll(root) {
            if (!root || !root.querySelectorAll) return;
            root.querySelectorAll('a[href]').forEach(processLink);
        }
        let pending = new Set(), scheduled = false;
        function flush() {
            scheduled = false;
            const nodes = pending; pending = new Set();
            for (const n of nodes) n.tagName === 'A' ? processLink(n) : rewriteAll(n);
        }
        function schedule(node) {
            if (!node || node.nodeType !== 1) return;
            pending.add(node);
            if (scheduled) return;
            scheduled = true;
            if (typeof requestIdleCallback === 'function') requestIdleCallback(flush, { timeout: 1000 });
            else setTimeout(flush, 50);
        }
        function initial() {
            rewriteAll(document);
            setTimeout(() => rewriteAll(document), 1500);
            setTimeout(() => rewriteAll(document), 3500);
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initial);
        else initial();
        function startObs() {
            const target = document.documentElement || document.body || document;
            if (!target) return;
            const o = new MutationObserver(ms => {
                for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) schedule(n);
            });
            o.observe(target, { childList: true, subtree: true });
            setTimeout(() => o.disconnect(), CFG.REWRITE_OBSERVER_TIMEOUT);
        }
        if (document.documentElement) startObs();
        else document.addEventListener('DOMContentLoaded', startObs);
    }

    // ═══════════════════════════════════════════════════════════
    // 落地页自动跳过
    // ═══════════════════════════════════════════════════════════
    if (CFG.ENABLE_LANDING_AUTO_SKIP) {
        let skipped = false;
        function trySkip() {
            if (skipped) return;
            if (!STRONG_PATH.test(location.pathname) && !WEAK_PATH.test(location.pathname)) return;
            const t = extractFromDoc(document, location.href);
            if (!t || !isExternal(t, location.href)) return;
            skipped = true;
            console.log('[外链解码] 落地页跳过 →', t);
            location.replace(t);
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', trySkip);
        else trySkip();
        setTimeout(trySkip, 800);
        setTimeout(trySkip, 2000);
    }

    // ═══════════════════════════════════════════════════════════
    // 兜底：地址栏直接输入中间页
    // ═══════════════════════════════════════════════════════════
    (async function () {
        if (!QUICK_RE.test(location.href)) return;
        if (STRONG_PATH.test(location.pathname)) return;
        const d = await decodeAsync(location.href);
        if (d && d !== location.href) location.replace(d);
    })();

})();