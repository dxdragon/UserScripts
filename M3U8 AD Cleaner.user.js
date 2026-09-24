// ==UserScript==
// @name              M3U8 AD Cleaner
// @namespace         http://tampermonkey.net/
// @version           1.0
// @description       拦截和过滤 m3u8 切片广告，支持导出无广告播放列表
// @author            Shay
// @match             *://*/*
// @exclude           *://challenges.cloudflare.com/*
// @exclude           *://*/recaptcha/*
// @exclude           *://*.geetest.com/*
// @exclude           *://*.hcaptcha.com/*
// @run-at            document-start
// @grant             unsafeWindow
// @grant             GM_registerMenuCommand
// @grant             GM_unregisterMenuCommand
// @grant             GM_setValue
// @grant             GM_getValue
// @grant             GM_addStyle
// @license           MIT
// @updateURL         https://github.com/dxdragon/UserScripts/raw/master/M3U8%20AD%20Cleaner.meta.js
// @downloadURL       https://github.com/dxdragon/UserScripts/raw/master/M3U8%20AD%20Cleaner.user.js
// ==/UserScript==

(function () {
    'use strict';

    const DEBUG = false;

    // ============================================================
    // 0. 验证页面检测
    // ============================================================
    function isVerificationPage() {
        const url = (unsafeWindow.location.href || '').toLowerCase();
        const title = (unsafeWindow.document.title || '').toLowerCase();
        const kw = [
            'challenges.cloudflare.com', 'geetest.com', 'captcha', 'challenge-platform',
            'just a moment', 'checking your browser', 'checking browser security',
            'security check', 'verify you are human', 'please verify', 'human verification',
            'security challenge', 'are you a human', 'are you a robot', 'not a robot',
            'bot detection', '验证', '安全防护', '安全检测', '安全检查',
            '正在检查您的浏览器', '请稍候', '我不是机器人'
        ];
        for (let i = 0; i < kw.length; i++) {
            if (url.includes(kw[i]) || (title && title.includes(kw[i]))) return true;
        }
        return false;
    }
    if (isVerificationPage()) return;

    // ============================================================
    // 1. 弱引用标记
    // ============================================================
    const HOOKED_FLAGS = new WeakMap();
    const ATTACHED_VIDEOS = new WeakSet();

    // ============================================================
    // 2. 常量
    // ============================================================
    const TS_MODE = {
        NUMERIC: 0,
        FEATURE: 1,
        SHORT_INTERVAL: 2,
        NONE: 3
    };

    const MEDIA_RE = /(\d+)\.(ts|jpg|jpeg|png)/i;

    const LOG_MAX = 400;
    const MAX_M3U8_LINES = 50000;

    const INTEGER_TOLERANCE = 0.001;

    const MIN_TS_COUNT_FOR_PATH_ANALYSIS = 8;
    const MAIN_PREFIX_RATIO_THRESHOLD = 0.7;
    const MAIN_LENGTH_RATIO_THRESHOLD = 0.7;
    const LENGTH_ANOMALY_RATIO = 0.3;

    const STATUS_DEDUP_WINDOW_MS = 5000;
    const TOAST_DELAY_NO_AD_MS = 500;

    const SHORT_AD_MAX_INTERVALS = 5;
    const SHORT_AD_FRAGMENT_THRESHOLD = 3;   // 短区间超过上限时，只删片段数 ≤ 此值的区间

    const currentHost = unsafeWindow.location.hostname;

    // ============================================================
    // 3. m3u8 域名规则池
    // ============================================================
    const DOMAIN_RULES = [
        {
            name: 'ryplay',
            test: /^(?:[-\w]+\.)*ryplay\d*\.com$/i,
            strategies: ['short', 'integer'],   // ← 只改这里
            options: {
                integerRatioNum: 1,
                integerRatioDen: 1,
            }
        },
        {
            name: 'default',
            test: /.*/,
            strategies: ['short'],
            options: {
                shortMaxCount: 5,
                shortModeThreshold: 5,
                shortFreqMax: 5,
                protectFreq: 5,
                protectRatio: 0.2,
            }
        }
    ];

    function matchDomainRule(host) {
        for (const rule of DOMAIN_RULES) {
            if (rule.test.test(host)) return rule;
        }
        return DOMAIN_RULES[DOMAIN_RULES.length - 1];
    }

    // ============================================================
    // 4. 状态管理
    // ============================================================
    let whitelistMode = GM_getValue('script_whitelist_mode_flag', false);
    let showToastFlag = GM_getValue('show_toast_tip_flag', false);
    let hostInWhitelist = GM_getValue('host:' + currentHost, false);

    let activeSession = createSession('');
    let lastProcessedUrl = '';
    let lastProcessedTime = 0;

    let pendingToastTimer = null;
    let lastToastTime = 0;
    let lastToastHadAds = false;
    let lastNoAdToastEl = null;

    function createSession(url) {
        return {
            url: url || '',
            adLines: [],
            headLines: [],
            logs: [],
            filtered: '',
            changed: false
        };
    }

    // ============================================================
    // 5. 日志
    // ============================================================
    function logPush(session, rule, text) {
        if (session.logs.length >= LOG_MAX) {
            session.logs.splice(0, session.logs.length - LOG_MAX + 50);
        }
        session.logs.push({ rule, text: String(text) });
    }

    function logFilter(session, rule, text) {
        console.log(
            '%c[AD]',
            'font-weight:bold;color:#fff;background:#70b566;padding:2px;border-radius:2px;',
            rule, '\n' + text
        );
        logPush(session, rule, text);
        session.changed = true;
    }

    function logInfo(...args) {
        if (!DEBUG) return;
        console.log(
            '%c[AD]',
            'font-weight:bold;color:#fff;background:#70b566;padding:2px;border-radius:2px;',
            ...args
        );
    }

    function logError(...args) {
        console.error('[AD]', ...args);
    }

    // ============================================================
    // 6. UI
    // ============================================================
    const UI_CSS = `
    .m3u8ar-toast-wrap{position:fixed;top:16px;right:16px;z-index:2147483647;display:flex;flex-direction:column;gap:8px;pointer-events:none;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
    .m3u8ar-toast{pointer-events:auto;min-width:240px;max-width:360px;padding:12px 30px 12px 14px;border-radius:10px;color:#fff;font-size:13px;line-height:1.5;box-shadow:0 6px 18px rgba(0,0,0,.15);position:relative;overflow:hidden;animation:m3u8ar-in .2s ease}
    .m3u8ar-toast.success{background:#22a06b}
    .m3u8ar-toast.error{background:#dc3545}
    .m3u8ar-toast.warning{background:#e8a13a}
    .m3u8ar-toast.info{background:#3b82f6}
    .m3u8ar-toast .close{position:absolute;top:6px;right:10px;cursor:pointer;font-size:16px;line-height:1;opacity:.7}
    .m3u8ar-toast .close:hover{opacity:1}
    .m3u8ar-toast .bar{position:absolute;bottom:0;left:0;height:3px;background:rgba(255,255,255,.6);animation:m3u8ar-bar linear forwards}
    @keyframes m3u8ar-in{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:none}}
    @keyframes m3u8ar-bar{from{width:100%}to{width:0}}
    .m3u8ar-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2147483646;display:flex;align-items:center;justify-content:center;animation:m3u8ar-fade .15s ease}
    @keyframes m3u8ar-fade{from{opacity:0}to{opacity:1}}
    .m3u8ar-modal{background:#fff;color:#222;border-radius:12px;max-width:680px;width:90vw;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3);overflow:hidden;font-family:system-ui,sans-serif}
    .m3u8ar-modal header{padding:14px 18px;font-weight:600;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:15px;box-sizing:border-box}
    .m3u8ar-modal header .m3u8ar-title{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:inherit}
    .m3u8ar-modal header .m3u8ar-close-btn{flex:0 0 auto;width:30px;height:30px;min-width:30px;min-height:30px;max-width:30px;max-height:30px;padding:0;margin:0;background:#ff679a;color:#fff;border:0;border-radius:50%;cursor:pointer;font-size:18px;font-family:system-ui,sans-serif;line-height:1;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;appearance:none;-webkit-appearance:none;text-indent:0;visibility:visible;opacity:1;transition:transform .15s ease,opacity .15s ease;position:static;right:auto;top:auto;bottom:auto;left:auto;z-index:1}
    .m3u8ar-modal header .m3u8ar-close-btn:hover{opacity:.85;transform:scale(1.08)}
    .m3u8ar-modal header .m3u8ar-close-btn:active{transform:scale(.95)}
    .m3u8ar-modal .body{padding:14px 18px;overflow:auto;font-size:13px;line-height:1.6}
    .m3u8ar-modal .body .rule{color:#d63384;font-weight:600;margin:8px 0 4px}
    .m3u8ar-modal .body .ad-badge{display:inline-block;font-weight:bold;color:#fff;background:#70b566;padding:2px 6px;border-radius:3px;font-size:11px;margin-right:6px;vertical-align:middle}
    .m3u8ar-modal .body pre{background:#f5f5f5;padding:6px 8px;border-radius:6px;white-space:pre-wrap;word-break:break-all;margin:2px 0;font-size:12px;font-family:ui-monospace,Consolas,monospace}
    .m3u8ar-modal footer{padding:10px 18px;border-top:1px solid #eee;text-align:right}
    .m3u8ar-modal footer button{background:#ff679a;color:#fff;border:0;padding:8px 20px;border-radius:8px;cursor:pointer;font-size:13px;margin-left:8px}
    .m3u8ar-modal footer button:hover{opacity:.9}
    .m3u8ar-modal footer button.ghost{background:#6b7280}
    @media (prefers-color-scheme: dark){
      .m3u8ar-modal{background:#1f1f1f;color:#eee}
      .m3u8ar-modal header{border-color:#333}
      .m3u8ar-modal .body pre{background:#2a2a2a}
      .m3u8ar-modal footer{border-color:#333}
    }
    `;

    let styleInjected = false;
    function ensureStyle() {
        if (styleInjected) return;
        if (typeof GM_addStyle === 'function') {
            GM_addStyle(UI_CSS);
            styleInjected = true;
            return;
        }
        const target = document.head || document.documentElement;
        if (!target) return;
        const s = document.createElement('style');
        s.textContent = UI_CSS;
        target.appendChild(s);
        styleInjected = true;
    }

    let toastWrap = null;
    function getToastWrap() {
        if (toastWrap && toastWrap.isConnected) return toastWrap;
        ensureStyle();
        toastWrap = document.createElement('div');
        toastWrap.className = 'm3u8ar-toast-wrap';
        (document.body || document.documentElement).appendChild(toastWrap);
        return toastWrap;
    }

    function toast(type, html, duration = 3000) {
        if (!showToastFlag) return null;
        if (!document.body) {
            setTimeout(() => toast(type, html, duration), 200);
            return null;
        }
        const wrap = getToastWrap();
        const el = document.createElement('div');
        el.className = 'm3u8ar-toast ' + type;
        el.innerHTML = `<span class="close">×</span><div>${html}</div>
            <div class="bar" style="animation-duration:${duration}ms"></div>`;
        const close = () => {
            el.style.opacity = '0';
            el.style.transition = 'opacity .2s';
            setTimeout(() => el.remove(), 220);
        };
        el.querySelector('.close').addEventListener('click', close);
        wrap.appendChild(el);
        let t = setTimeout(close, duration);
        el.addEventListener('mouseenter', () => clearTimeout(t));
        el.addEventListener('mouseleave', () => { t = setTimeout(close, 1000); });
        return el;
    }

    function removeToastEl(el) {
        if (!el || !el.isConnected) return;
        el.style.opacity = '0';
        el.style.transition = 'opacity .2s';
        setTimeout(() => el.remove(), 220);
    }

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    }

    function showModal(html, title = '提示', extraButtons = []) {
        ensureStyle();
        const bg = document.createElement('div');
        bg.className = 'm3u8ar-modal-bg';

        const extraHtml = extraButtons.map((b, i) =>
            `<button class="${b.ghost ? 'ghost' : ''}" data-i="${i}">${escapeHtml(b.text)}</button>`
        ).join('');

        const footerHtml = extraHtml ? `<footer>${extraHtml}</footer>` : '';

        bg.innerHTML = `
            <div class="m3u8ar-modal">
                <header><span class="m3u8ar-title">${escapeHtml(title)}</span><button class="m3u8ar-close-btn" data-close="1" aria-label="关闭" title="关闭">×</button></header>
                <div class="body">${html}</div>
                ${footerHtml}
            </div>`;

        const close = () => bg.remove();

        bg.addEventListener('click', e => {
            if (e.target === bg) close();
            if (e.target.dataset && e.target.dataset.close) close();
            if (e.target.dataset && e.target.dataset.i !== undefined) {
                const btn = extraButtons[parseInt(e.target.dataset.i, 10)];
                if (btn && typeof btn.onClick === 'function') btn.onClick();
            }
        });

        document.addEventListener('keydown', function onEsc(e) {
            if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
        });

        (document.body || document.documentElement).appendChild(bg);
    }

    function showFilterLog() {
        if (!activeSession.url) {
            showModal('还没有检测到 m3u8 请求。<br><br>请先在页面中播放视频，然后再点击此菜单。', '提示');
            return;
        }
        if (activeSession.adLines.length === 0) {
            showModal('本次 m3u8 中没有检测到广告片段。<br><br>无需过滤。', '提示');
            return;
        }
        if (activeSession.logs.length === 0) {
            showModal('<p>本次没有任何过滤日志。</p>', '过滤日志');
            return;
        }
        const parts = [];
        for (const entry of activeSession.logs) {
            const rule = entry.rule || '';
            const isAdRule = rule.startsWith('规则:');
            if (rule) {
                const badge = isAdRule ? '<span class="ad-badge">[AD]</span>' : '';
                parts.push(`<div class="rule">${badge}${escapeHtml(rule)}</div>`);
            }
            parts.push(`<pre>${escapeHtml(entry.text)}</pre>`);
        }
        showModal(parts.join(''), '过滤日志');
    }

    // ============================================================
    // 7. 工具
    // ============================================================
    function isM3U8File(url) {
        if (!url) return false;
        return /\.m3u8($|[?#])/i.test(url);
    }

    function isM3U8Content(text) {
        if (!text || typeof text !== 'string') return false;
        return text.indexOf('#EXTM3U') > -1;
    }

    function isBoundary(line) {
        return line.startsWith('#EXT-X-DISCONTINUITY') || line.startsWith('#EXT-X-ENDLIST');
    }

    function isMediaSegment(line) {
        if (!line || line.startsWith('#')) return false;
        return /\.(ts|jpg|jpeg|png)($|[?#])/i.test(line);
    }

    function parseMediaUri(uri) {
        if (!uri) return null;
        const m = MEDIA_RE.exec(uri);
        if (!m) return null;
        const extIdx = uri.indexOf('.' + m[2]);
        if (extIdx <= 0) return null;
        return { num: parseInt(m[1], 10), len: extIdx };
    }

    function parseExtinfDuration(line) {
        if (!line.startsWith('#EXTINF')) return null;
        const m = line.match(/#EXTINF:([\d.]+)/);
        if (!m) return null;
        const v = parseFloat(m[1]);
        return isNaN(v) ? null : v;
    }

    function isIntegerDuration(duration) {
        if (duration === null) return false;
        return Math.abs(duration - Math.round(duration)) < INTEGER_TOLERANCE;
    }

    function makeAbsolute(uri, baseUrl) {
        if (!uri) return uri;
        if (/^(https?:|blob:|data:)/i.test(uri)) return uri;
        if (!baseUrl) return uri;
        try { return new URL(uri, baseUrl).href; } catch (e) { return uri; }
    }

    function extractPathPrefix(uri) {
        const clean = uri.split('?')[0].split('#')[0];
        const idx = clean.lastIndexOf('/');
        if (idx < 0) return '';
        return clean.slice(0, idx + 1);
    }

    function getHostFromUrl(url) {
        if (!url) return '';
        try {
            return new URL(url, unsafeWindow.location.href).hostname;
        } catch (e) {
            return '';
        }
    }

    // 清理冗余的 #EXT-X-DISCONTINUITY
    // 规则：
    // 1. 连续多个 #EXT-X-DISCONTINUITY，只保留第一个；
    // 2. #EXT-X-DISCONTINUITY 后紧跟 #EXT-X-ENDLIST，删除该 #EXT-X-DISCONTINUITY。
    function cleanupRedundantDiscontinuities(lines) {
        const result = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('#EXT-X-DISCONTINUITY')) {
                // 如果上一个保留的行也是 DISC，则跳过当前
                if (result.length > 0 && result[result.length - 1].startsWith('#EXT-X-DISCONTINUITY')) {
                    continue;
                }
                // 如果下一行是 ENDLIST，则跳过当前 DISC
                if (i + 1 < lines.length && lines[i + 1].startsWith('#EXT-X-ENDLIST')) {
                    continue;
                }
            }
            result.push(line);
        }
        return result;
    }

    // ============================================================
    // 8. 区间构建
    // ============================================================
    function buildIntervals(lines) {
        const intervals = [];
        let start = -1, count = 0, integerCount = 0, totalDuration = 0;
        const n = lines.length;

        function pushInterval(end) {
            if (start !== -1) {
                intervals.push({ start, end, count, integerCount, totalDuration });
            }
        }
        function resetInterval(newStart) {
            start = newStart;
            count = 0;
            integerCount = 0;
            totalDuration = 0;
        }

        for (let i = 0; i < n; i++) {
            const line = lines[i];
            if (line.startsWith('#EXT-X-DISCONTINUITY')) {
                pushInterval(i);
                resetInterval(i);
            } else if (line.startsWith('#EXT-X-ENDLIST')) {
                pushInterval(i);
                resetInterval(-1);
            } else if (line.startsWith('#EXTINF')) {
                if (start === -1) resetInterval(i);
                count++;
                const dur = parseExtinfDuration(line);
                if (dur !== null) {
                    totalDuration += dur;
                    if (isIntegerDuration(dur)) integerCount++;
                }
            }
        }
        pushInterval(n);
        return intervals;
    }

    // ============================================================
    // 9. 数字递增检测
    // ============================================================
    function collectNumericSeq(lines) {
        const samples = [];
        for (let i = 0, n = lines.length; i < n && samples.length < 32; i++) {
            const line = lines[i];
            if (line.charCodeAt(0) !== 35) continue;
            if (!line.startsWith('#EXTINF')) continue;
            const uri = lines[i + 1];
            if (!uri) continue;
            if (!isMediaSegment(uri)) continue;
            const info = parseMediaUri(uri);
            if (!info) continue;
            samples.push({ num: info.num, len: info.len });
        }

        if (samples.length < 3) return { ok: false };

        let match = 0;
        for (let i = 1; i < samples.length; i++) {
            if (samples[i].num === samples[i - 1].num + 1) match++;
        }

        return {
            ok: match / (samples.length - 1) >= 0.8,
            firstNum: samples[0].num,
            baseLen: samples[0].len
        };
    }

    // ============================================================
    // 10. 路径/长度分析
    // ============================================================
    function analyzePathPrefixes(lines) {
        const prefixFreq = new Map();
        const lengthFreq = new Map();
        let tsTotal = 0;

        for (const line of lines) {
            if (!isMediaSegment(line)) continue;
            const prefix = extractPathPrefix(line);
            prefixFreq.set(prefix, (prefixFreq.get(prefix) || 0) + 1);
            lengthFreq.set(line.length, (lengthFreq.get(line.length) || 0) + 1);
            tsTotal++;
        }

        if (tsTotal < MIN_TS_COUNT_FOR_PATH_ANALYSIS) {
            return { hasMinority: false, hasLengthAnomaly: false };
        }

        let mainPrefix = '', mainCount = 0;
        for (const [p, c] of prefixFreq) {
            if (c > mainCount) { mainCount = c; mainPrefix = p; }
        }
        const mainRatio = mainCount / tsTotal;
        const hasMinority = mainRatio >= MAIN_PREFIX_RATIO_THRESHOLD && prefixFreq.size > 1;

        let mainLen = 0, mainLenCount = 0;
        for (const [l, c] of lengthFreq) {
            if (c > mainLenCount) { mainLenCount = c; mainLen = l; }
        }
        const mainLenRatio = mainLenCount / tsTotal;
        const hasLengthAnomaly = mainLenRatio >= MAIN_LENGTH_RATIO_THRESHOLD && lengthFreq.size > 1;

        const minorityPrefixes = new Set();
        if (hasMinority) {
            for (const p of prefixFreq.keys()) {
                if (p !== mainPrefix) minorityPrefixes.add(p);
            }
        }

        return { hasMinority, hasLengthAnomaly, mainPrefix, mainLen, minorityPrefixes };
    }

    // ============================================================
    // 11. 模式检测
    // ============================================================
    function detectMode(lines) {
        let hasKeyNone = false, hasAdjump = false;
        for (let i = 0, n = lines.length; i < n; i++) {
            const line = lines[i];
            if (line === '#EXT-X-KEY:METHOD=NONE') { hasKeyNone = true; break; }
            if (line.indexOf('/video/adjump/') !== -1) { hasAdjump = true; break; }
        }

        if (hasKeyNone || hasAdjump) {
            return { mode: TS_MODE.FEATURE, hasKeyNone, hasAdjump, pathInfo: null };
        }

        const seq = collectNumericSeq(lines);
        if (seq.ok) {
            return { mode: TS_MODE.NUMERIC, firstNum: seq.firstNum, baseLen: seq.baseLen };
        }

        const pathInfo = analyzePathPrefixes(lines);
        if (pathInfo.hasMinority || pathInfo.hasLengthAnomaly) {
            return { mode: TS_MODE.FEATURE, hasKeyNone: false, hasAdjump: false, pathInfo };
        }

        return { mode: TS_MODE.SHORT_INTERVAL };
    }

    // ============================================================
    // 12. 通用输出：按 del[] 的连续段分块
    //     相邻广告自动合并，非相邻广告自然分块
    // ============================================================
    function emitDeletedBlocks(lines, del, reasonArr, session, defaultRule) {
        const n = lines.length;
        let hasAd = false;
        let i = 0;

        while (i < n) {
            if (del[i]) {
                hasAd = true;
                const start = i;
                while (i < n && del[i]) i++;

                const reasons = new Set();
                if (reasonArr) {
                    for (let k = start; k < i; k++) {
                        const r = reasonArr[k];
                        if (r) reasons.add(r);
                    }
                }
                const rule = reasons.size
                    ? '规则: ' + [...reasons].join(' + ')
                    : (defaultRule || '规则: 广告段');

                const removed = lines.slice(start, i);
                for (let k = 0; k < removed.length; k++) {
                    session.adLines.push(removed[k]);
                }
                logFilter(session, rule, removed.join('\n'));
            } else {
                i++;
            }
        }

        if (!hasAd) return lines;

        const out = [];
        for (let k = 0; k < n; k++) {
            if (!del[k]) out.push(lines[k]);
        }
        return out;
    }

    // ============================================================
    // 13. 处理器：FEATURE
    //     先按规则标记内容行，最后统一按“相邻性”清理 DISC
    // ============================================================
    function markKeyNone(lines, del, reasonArr) {
        const n = lines.length;
        const RULE_KEY = '#EXT-X-KEY:METHOD=NONE 广告段';
        const RULE_ADJ = '/video/adjump/ 广告段';
        let anyAd = false;
        let i = 0;

        while (i < n) {
            const line = lines[i];

            if (line === '#EXT-X-KEY:METHOD=NONE') {
                const start = i;
                while (i < n && !isBoundary(lines[i])) i++;
                for (let j = start; j < i; j++) {
                    del[j] = 1;
                    reasonArr[j] = RULE_KEY;
                    anyAd = true;
                }
                continue;
            }

            if (line.startsWith('#EXT-X-DISCONTINUITY') &&
                lines[i + 1] && lines[i + 1].startsWith('#EXTINF') &&
                lines[i + 2] && lines[i + 2].indexOf('/video/adjump/') !== -1) {
                const start = i;
                i++;
                while (i < n) {
                    if (lines[i].startsWith('#EXTINF') &&
                        lines[i + 1] && lines[i + 1].indexOf('/video/adjump/') !== -1) {
                        i += 2;
                        continue;
                    }
                    if (lines[i].startsWith('#EXT-X-DISCONTINUITY') &&
                        lines[i + 1] && lines[i + 1].startsWith('#EXTINF') &&
                        lines[i + 2] && lines[i + 2].indexOf('/video/adjump/') !== -1) {
                        i++;
                        continue;
                    }
                    break;
                }
                // 起始 DISC 交给后处理；内容行从 start+1 标起
                for (let j = start + 1; j < i; j++) {
                    del[j] = 1;
                    reasonArr[j] = RULE_ADJ;
                    anyAd = true;
                }
                continue;
            }

            i++;
        }

        return anyAd;
    }

    function markPathAnomaly(lines, pathInfo, del, reasonArr) {
        const intervals = buildIntervals(lines);
        let anyAd = false;

        for (const it of intervals) {
            if (it.count === 0) continue;

            const prefixCount = new Map();
            let totalLen = 0, uriCount = 0;

            for (let i = it.start; i < it.end; i++) {
                const line = lines[i];
                if (!isMediaSegment(line)) continue;
                const prefix = extractPathPrefix(line);
                prefixCount.set(prefix, (prefixCount.get(prefix) || 0) + 1);
                totalLen += line.length;
                uriCount++;
            }

            if (uriCount === 0) continue;

            let itPrefix = '', itPrefixCount = 0;
            for (const [p, c] of prefixCount) {
                if (c > itPrefixCount) { itPrefixCount = c; itPrefix = p; }
            }

            const hitMinority = pathInfo.hasMinority && pathInfo.minorityPrefixes.has(itPrefix);
            const avgLen = totalLen / uriCount;
            const hitLength = pathInfo.hasLengthAnomaly &&
                              Math.abs(avgLen - pathInfo.mainLen) / pathInfo.mainLen > LENGTH_ANOMALY_RATIO;

            if (hitMinority || hitLength) {
                const reason = [];
                if (hitMinority) reason.push('少数派路径');
                if (hitLength) reason.push('长度异常');
                const reasonStr = reason.join('+') + ' 广告段';
                for (let j = it.start; j < it.end; j++) {
                    del[j] = 1;
                    if (!reasonArr[j]) reasonArr[j] = reasonStr;
                    anyAd = true;
                }
            }
        }

        return anyAd;
    }

    function filterFeature(lines, ctx, session) {
        const n = lines.length;
        const del = new Uint8Array(n);
        const reasonArr = new Array(n);
        let anyAd = false;

        if (ctx.hasKeyNone || ctx.hasAdjump) {
            anyAd = markKeyNone(lines, del, reasonArr) || anyAd;
        }
        if (ctx.pathInfo && (ctx.pathInfo.hasMinority || ctx.pathInfo.hasLengthAnomaly)) {
            anyAd = markPathAnomaly(lines, ctx.pathInfo, del, reasonArr) || anyAd;
        }

        if (!anyAd) return lines;

        // 统一清理 DISCONTINUITY：只删与广告内容相邻的
        // #EXT-X-ENDLIST 天然不参与
        for (let k = 0; k < n; k++) {
            if (!lines[k].startsWith('#EXT-X-DISCONTINUITY')) continue;
            if (del[k]) continue;
            const prevDel = k > 0 && del[k - 1] === 1;
            const nextDel = k + 1 < n && del[k + 1] === 1;
            if (prevDel || nextDel) del[k] = 1;
        }

        return emitDeletedBlocks(lines, del, reasonArr, session, '规则: 特征广告段');
    }

    // ============================================================
    // 14. 处理器：NUMERIC
    //     先按数字递增异常标记内容行，最后统一清理 DISC
    // ============================================================
    function filterNumeric(lines, ctx, session) {
        const n = lines.length;
        const del = new Uint8Array(n);
        const reasonArr = new Array(n);
        const RULE = '数字递增异常广告段';
        let anyAd = false;

        let mediaSeq = 0;
        for (let i = 0; i < n; i++) {
            if (lines[i].startsWith('#EXT-X-MEDIA-SEQUENCE')) {
                const m = lines[i].match(/:(\d+)/);
                if (m) mediaSeq = parseInt(m[1], 10);
                break;
            }
        }

        const offset = ctx.firstNum - mediaSeq;

        if (DEBUG) {
            logInfo('NUMERIC 模式:',
                'firstNum=' + ctx.firstNum,
                'mediaSeq=' + mediaSeq,
                'offset=' + offset);
        }

        let prevNum = mediaSeq - 1;

        function normalize(uri) {
            const info = parseMediaUri(uri);
            if (!info) return null;
            return { num: info.num - offset, len: info.len };
        }

        let i = 0;
        while (i < n) {
            const line = lines[i];

            if (line.startsWith('#EXT-X-DISCONTINUITY') && lines[i + 1] && lines[i + 2]) {
                if (i > 0 && lines[i - 1].startsWith('#EXT-X-')) {
                    i++;
                    continue;
                }

                const info = normalize(lines[i + 2]);
                if (info && info.num !== prevNum + 1) {
                    del[i] = 1;
                    del[i + 1] = 1;
                    del[i + 2] = 1;
                    reasonArr[i] = reasonArr[i + 1] = reasonArr[i + 2] = RULE;
                    anyAd = true;
                    i += 3;
                    continue;
                }

                i++;
                continue;
            }

            if (line.startsWith('#EXTINF') && lines[i + 1]) {
                const info = normalize(lines[i + 1]);
                if (info) {
                    if (info.num !== prevNum + 1) {
                        del[i] = 1;
                        del[i + 1] = 1;
                        reasonArr[i] = reasonArr[i + 1] = RULE;
                        anyAd = true;
                        i += 2;
                        continue;
                    }

                    prevNum = info.num;
                    i += 2;
                    continue;
                }
            }

            i++;
        }

        if (!anyAd) return lines;

        // 统一清理 DISCONTINUITY：只删与广告内容相邻的
        for (let k = 0; k < n; k++) {
            if (!lines[k].startsWith('#EXT-X-DISCONTINUITY')) continue;
            if (del[k]) continue;
            const prevDel = k > 0 && del[k - 1] === 1;
            const nextDel = k + 1 < n && del[k + 1] === 1;
            if (prevDel || nextDel) del[k] = 1;
        }

        return emitDeletedBlocks(lines, del, reasonArr, session, '规则: ' + RULE);
    }

    // ============================================================
    // 15. 策略函数
    // ============================================================
    function strategyInteger(intervals, options) {
        const result = new Map();
        const {
            integerRatioNum = 1,
            integerRatioDen = 1,
        } = options || {};

        for (const it of intervals) {
            if (it.count === 0) continue;

            // 整数片段占比 ≥ 1/3
            const countOK = it.integerCount * integerRatioDen >= it.count * integerRatioNum;
            if (!countOK) continue;

            // 总时长为整数
            const totalOK = isIntegerDuration(it.totalDuration);
            if (!totalOK) continue;

            result.set(it, `整数时长广告，总时长为整数`);
        }
        return result;
    }

    function strategyShort(intervals, options, session) {
        const result = new Map();
        const {
            shortMaxCount = 5,
            shortModeThreshold = 5,
            shortFreqMax = 5,
            protectFreq = 5,
            protectRatio = 0.2,
        } = options || {};

        // 过滤掉空区间（count === 0），不参与任何统计与筛选
        const validIntervals = intervals.filter(it => it.count > 0);

        if (validIntervals.length === 0) {
            if (session) {
                logFilter(session, '短区间统计', '无有效区间（非空）');
            }
            return result;
        }

        const freq = new Map();
        for (const it of validIntervals) {
            freq.set(it.count, (freq.get(it.count) || 0) + 1);
        }

        let modeCount = 0, modeValue = 0;
        for (const [cnt, f] of freq) {
            if (f > modeCount || (f === modeCount && cnt > modeValue)) {
                modeCount = f;
                modeValue = cnt;
            }
        }

        const modeRatio = modeCount / validIntervals.length;
        const groupDesc = [...freq.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([cnt, f]) => `${cnt}个×${f}次`)
            .join(', ');

        if (session) {
            logFilter(session, '短区间统计',
                `有效区间总数: ${validIntervals.length}\n` +
                `分组: ${groupDesc}\n` +
                `众数: ${modeValue}（出现 ${modeCount} 次，占比 ${(modeRatio * 100).toFixed(1)}%）`);
        }

        let short;
        if (modeRatio >= 0.5) {
            short = validIntervals.filter(it => {
                if (modeValue > shortModeThreshold) {
                    return it.count <= shortMaxCount;
                } else {
                    return it.count < modeValue;
                }
            });
        } else {
            short = validIntervals.filter(it => {
                const f = freq.get(it.count) || 0;
                return it.count <= shortMaxCount && f <= shortFreqMax;
            });

            short = short.filter(it => {
                const f = freq.get(it.count) || 0;
                const ratio = f / validIntervals.length;
                if (f >= protectFreq && ratio >= protectRatio) {
                    return false;
                }
                return true;
            });
        }

        for (const it of short) result.set(it, '短区间广告');
        return result;
    }

    const STRATEGIES = {
        integer: strategyInteger,
        short: strategyShort,
    };

    // ============================================================
    // 16. 主调度（SHORT 模式）
    //     区间起点已包含起始 DISC，无需 DISC 后处理
    // ============================================================
    function filterIntervals(lines, m3u8Host, session) {
        const intervals = buildIntervals(lines);
        if (intervals.length === 0) return lines;

        const rule = matchDomainRule(m3u8Host || '');
        logInfo(`m3u8 域名: ${m3u8Host || '(unknown)'}，规则: ${rule.name}，策略: [${rule.strategies.join(', ')}]`);

        const toDelete = new Map();
        const shortIntervals = new Set();

        for (const strategyName of rule.strategies) {
            const fn = STRATEGIES[strategyName];
            if (!fn) {
                logInfo(`未知策略: ${strategyName}`);
                continue;
            }
            const partial = fn(intervals, rule.options || {}, session);
            for (const [it, reason] of partial) {
                if (toDelete.has(it)) {
                    toDelete.set(it, toDelete.get(it) + '+' + reason);
                } else {
                    toDelete.set(it, reason);
                }
                if (strategyName === 'short') {
                    shortIntervals.add(it);
                }
            }
        }

        // 短区间数量限制：
        // 短区间广告超过 5 个时，只删除片段个数 ≤ 3 的短区间
        if (shortIntervals.size > SHORT_AD_MAX_INTERVALS) {
            const kept = new Set();
            for (const it of shortIntervals) {
                if (it.count <= SHORT_AD_FRAGMENT_THRESHOLD) kept.add(it);
            }

            for (const it of shortIntervals) {
                if (!kept.has(it)) toDelete.delete(it);
            }

            if (session) {
                const dropped = shortIntervals.size - kept.size;
                logFilter(session, '短区间数量限制',
                    `短区间判断结果 ${shortIntervals.size} 个 > 上限 ${SHORT_AD_MAX_INTERVALS}，` +
                    `仅删除片段数 ≤ ${SHORT_AD_FRAGMENT_THRESHOLD} 的短区间，` +
                    `保留 ${kept.size} 个，丢弃 ${dropped} 个`);
            }
        }

        if (toDelete.size === 0) return lines;

        const del = new Uint8Array(lines.length);
        const reasonArr = new Array(lines.length);
        for (const [it, reason] of toDelete) {
            for (let j = it.start; j < it.end; j++) {
                del[j] = 1;
                if (!reasonArr[j]) reasonArr[j] = reason;
            }
        }

        return emitDeletedBlocks(lines, del, reasonArr, session, '规则: 广告段');
    }

    // ============================================================
    // 17. 统一入口
    // ============================================================
    function processM3U8(text, url) {
        if (!text || text.indexOf('#EXTM3U') === -1) {
            return { modified: text, changed: false, session: null, isMaster: false };
        }

        const session = createSession(url || '');

        let lines = text.split('\n');
        if (lines.length > MAX_M3U8_LINES) {
            logError(`m3u8 行数超过 ${MAX_M3U8_LINES}，跳过过滤以保护性能`);
            return { modified: text, changed: false, session: null, isMaster: false };
        }

        // 清理冗余的 DISCONTINUITY，消除空区间
        const originalLineCount = lines.length;
        lines = cleanupRedundantDiscontinuities(lines);
        const cleaned = lines.length !== originalLineCount;

        // 统计媒体分片。无分片 → master playlist
        let segmentCount = 0;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('#EXTINF')) {
                const uri = lines[i + 1];
                if (uri && isMediaSegment(uri)) segmentCount++;
            }
        }
        if (segmentCount === 0) {
            if (DEBUG) logInfo('master playlist，跳过:', url);
            return { modified: text, changed: false, session: null, isMaster: true };
        }

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('#EXTINF')) break;
            session.headLines.push(lines[i]);
        }
        if (session.headLines.length === 0 || session.headLines[0] !== '#EXTM3U') {
            session.headLines.unshift('#EXTM3U');
        }

        const m3u8Host = getHostFromUrl(url);
        const ctx = detectMode(lines);
        logInfo('模式:', ctx.mode);

        let out;
        switch (ctx.mode) {
            case TS_MODE.FEATURE:        out = filterFeature(lines, ctx, session); break;
            case TS_MODE.NUMERIC:        out = filterNumeric(lines, ctx, session); break;
            case TS_MODE.SHORT_INTERVAL: out = filterIntervals(lines, m3u8Host, session); break;
            case TS_MODE.NONE:
            default:                     out = lines;
        }

        // 如果没有广告过滤，但仍清理了冗余 DISC，则使用清理后的 lines
        const finalLines = session.changed ? out : lines;
        const resultText = finalLines.join('\n');
        session.filtered = resultText;

        // changed 仅表示是否过滤了广告片段
        return { modified: resultText, changed: session.changed, session, isMaster: false };
    }

    // ============================================================
    // 18. 导出
    // ============================================================
    function downloadBlob(content, filename, mime) {
        const blob = new Blob([content], { type: mime || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        (document.body || document.documentElement).appendChild(a);
        a.click();
        setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 200);
    }

    function exportAdM3U8() {
        if (!activeSession.url) { toast('info', '还没有检测到 m3u8，请先播放视频'); return; }
        if (activeSession.adLines.length === 0) { toast('info', '本次未发现广告，无需导出'); return; }

        const resultLines = [];
        if (activeSession.headLines.length > 0) resultLines.push(...activeSession.headLines);
        else { resultLines.push('#EXTM3U'); resultLines.push('#EXT-X-TARGETDURATION:10'); }
        if (resultLines[0] !== '#EXTM3U') resultLines.unshift('#EXTM3U');

        for (const line of activeSession.adLines) {
            if (!line) continue;
            if (line.startsWith('#')) resultLines.push(line);
            else resultLines.push(makeAbsolute(line, activeSession.url));
        }

        if (!resultLines.includes('#EXT-X-ENDLIST')) resultLines.push('#EXT-X-ENDLIST');

        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        downloadBlob(resultLines.join('\n'), `ad_segments_${stamp}.m3u8`, 'application/vnd.apple.mpegurl');
        toast('success', `广告片段已导出（${activeSession.adLines.length} 行）`);
    }

    function exportCleanM3U8() {
        if (!activeSession.url) { toast('info', '还没有检测到 m3u8，请先播放视频'); return; }
        if (!activeSession.filtered) { toast('info', '还没有可导出的 m3u8 内容'); return; }

        const lines = activeSession.filtered.split('\n');
        const out = [];
        for (const line of lines) {
            if (!line) { out.push(line); continue; }
            if (line.startsWith('#')) out.push(line);
            else out.push(makeAbsolute(line, activeSession.url));
        }

        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        downloadBlob(out.join('\n'), `clean_${stamp}.m3u8`, 'application/vnd.apple.mpegurl');
        toast('success', '无广告 m3u8 已导出');
    }

    // ============================================================
    // 19. 状态回调
    // ============================================================
    function updateActiveSession(newSession) {
        if (!newSession) return;
        const hasNewAds = newSession.adLines && newSession.adLines.length > 0;
        const hasOldAds = activeSession && activeSession.adLines && activeSession.adLines.length > 0;
        if (hasNewAds || !hasOldAds) {
            activeSession = newSession;
        }
    }

    function showResultToast(hadAds, adCount) {
        if (!showToastFlag) return;

        const now = Date.now();
        const withinWindow = now - lastToastTime < STATUS_DEDUP_WINDOW_MS;

        if (withinWindow) {
            if (lastToastHadAds) return;
            if (!hadAds) return;
            if (lastNoAdToastEl) {
                removeToastEl(lastNoAdToastEl);
                lastNoAdToastEl = null;
            }
        }

        if (hadAds) {
            if (pendingToastTimer) {
                clearTimeout(pendingToastTimer);
                pendingToastTimer = null;
            }
            lastToastTime = now;
            lastToastHadAds = true;
            toast('success', `已过滤切片广告，可导出 ${adCount} 行广告片段`);
            return;
        }

        if (pendingToastTimer) clearTimeout(pendingToastTimer);
        pendingToastTimer = setTimeout(() => {
            pendingToastTimer = null;
            const t = Date.now();
            if (t - lastToastTime < STATUS_DEDUP_WINDOW_MS && lastToastHadAds) return;
            lastToastTime = t;
            lastToastHadAds = false;
            lastNoAdToastEl = toast('info', '已检查 m3u8，未发现广告');
        }, TOAST_DELAY_NO_AD_MS);
    }

    function onM3U8Processed(result, url) {
        if (!result) return;
        if (result.isMaster) return;

        const key = url || '';
        const now = Date.now();
        if (key && key === lastProcessedUrl && now - lastProcessedTime < STATUS_DEDUP_WINDOW_MS) return;
        lastProcessedUrl = key;
        lastProcessedTime = now;

        updateActiveSession(result.session);

        if (unsafeWindow.self !== unsafeWindow.top) {
            try {
                unsafeWindow.top.postMessage({
                    __m3u8ar: true,
                    type: 'processed',
                    session: activeSession
                }, '*');
            } catch (e) {
                logError('postMessage 失败:', e);
            }
            return;
        }

        updateFilterTip();
        showResultToast(result.changed, activeSession.adLines.length);
    }

    // ============================================================
    // 20. Hook: XHR
    // ============================================================
    const URL_SYM = Symbol('m3u8ar_url');
    const CACHE_SYM = Symbol('m3u8ar_cache');

    function hookXHR() {
        const XHRProto = unsafeWindow.XMLHttpRequest && unsafeWindow.XMLHttpRequest.prototype;
        if (!XHRProto) return;
        if (HOOKED_FLAGS.get(XHRProto)) return;
        HOOKED_FLAGS.set(XHRProto, true);

        const origOpen = XHRProto.open;
        const origSend = XHRProto.send;
        if (typeof origOpen !== 'function' || typeof origSend !== 'function') return;

        const respTextDesc = Object.getOwnPropertyDescriptor(XHRProto, 'responseText');
        const respDesc = Object.getOwnPropertyDescriptor(XHRProto, 'response');
        const origGetResponseText = respTextDesc && respTextDesc.get;
        const origGetResponse = respDesc && respDesc.get;

        const openProxy = new Proxy(origOpen, {
            apply(target, thisArg, args) {
                try {
                    Object.defineProperty(thisArg, URL_SYM, {
                        value: args[1],
                        writable: true,
                        enumerable: false,
                        configurable: true
                    });
                } catch (e) {}
                return Reflect.apply(target, thisArg, args);
            }
        });

        const sendProxy = new Proxy(origSend, {
            apply(target, thisArg, args) {
                const xhr = thisArg;

                function getFiltered() {
                    const cached = xhr[CACHE_SYM];
                    if (cached) return cached.value;

                    let original = '';
                    try {
                        original = origGetResponseText ? origGetResponseText.call(xhr) : '';
                    } catch (e) {
                        original = '';
                    }

                    if (!original || original.indexOf('#EXTM3U') === -1) {
                        const c = { value: original };
                        try { Object.defineProperty(xhr, CACHE_SYM, { value: c, configurable: true }); } catch (e) {}
                        return original;
                    }

                    const url = xhr.responseURL || xhr[URL_SYM] || '';

                    let result;
                    try {
                        result = processM3U8(original, url);
                    } catch (e) {
                        logError('处理失败:', e);
                        const c = { value: original };
                        try { Object.defineProperty(xhr, CACHE_SYM, { value: c, configurable: true }); } catch (e) {}
                        return original;
                    }

                    onM3U8Processed(result, url);

                    const c = { value: result.modified };
                    try { Object.defineProperty(xhr, CACHE_SYM, { value: c, configurable: true }); } catch (e) {}
                    return result.modified;
                }

                try {
                    Object.defineProperty(xhr, 'responseText', {
                        get() {
                            if (xhr.readyState !== 4) {
                                return origGetResponseText ? origGetResponseText.call(xhr) : '';
                            }
                            if (xhr.status !== 200 && xhr.status !== 0) {
                                return origGetResponseText ? origGetResponseText.call(xhr) : '';
                            }
                            return getFiltered();
                        },
                        configurable: true
                    });
                } catch (e) {
                    logError('覆盖 responseText 失败:', e);
                }

                try {
                    Object.defineProperty(xhr, 'response', {
                        get() {
                            const type = xhr.responseType;
                            if (type && type !== '' && type !== 'text') {
                                return origGetResponse ? origGetResponse.call(xhr) : null;
                            }
                            if (xhr.readyState !== 4) {
                                return origGetResponseText ? origGetResponseText.call(xhr) : '';
                            }
                            if (xhr.status !== 200 && xhr.status !== 0) {
                                return origGetResponseText ? origGetResponseText.call(xhr) : '';
                            }
                            return getFiltered();
                        },
                        configurable: true
                    });
                } catch (e) {
                    logError('覆盖 response 失败:', e);
                }

                return Reflect.apply(target, thisArg, args);
            }
        });

        try {
            Object.defineProperty(XHRProto, 'open', {
                value: openProxy,
                writable: true,
                enumerable: false,
                configurable: true
            });
            Object.defineProperty(XHRProto, 'send', {
                value: sendProxy,
                writable: true,
                enumerable: false,
                configurable: true
            });
        } catch (e) {
            logError('hookXHR 失败:', e);
        }
    }

    // ============================================================
    // 21. Hook: fetch
    // ============================================================
    function hookFetch() {
        const origFetch = unsafeWindow.fetch;
        if (typeof origFetch !== 'function') return;
        if (HOOKED_FLAGS.get(origFetch)) return;
        HOOKED_FLAGS.set(origFetch, true);

        const fetchProxy = new Proxy(origFetch, {
            apply(target, thisArg, args) {
                return Reflect.apply(target, thisArg, args).then(function (response) {
                    let url = '';
                    if (typeof args[0] === 'string') url = args[0];
                    else if (args[0] && args[0].url) url = args[0].url;
                    else if (response.url) url = response.url;

                    let needCheck = isM3U8File(url);
                    if (!needCheck) {
                        const ct = response.headers.get('content-type') || '';
                        needCheck = /mpegurl/i.test(ct) || /m3u8/i.test(ct);
                    }
                    if (!needCheck) return response;

                    return response.clone().text().then(function (text) {
                        if (!isM3U8Content(text)) return response;

                        logInfo('hookFetch 命中:', url);

                        let result;
                        try {
                            result = processM3U8(text, url || response.url);
                        } catch (e) {
                            logError('hookFetch 处理失败:', e);
                            return response;
                        }

                        onM3U8Processed(result, url || response.url);
                        if (!result.changed) return response;

                        const headers = new Headers(response.headers);
                        headers.delete('content-length');
                        return new Response(result.modified, {
                            status: response.status,
                            statusText: response.statusText,
                            headers: headers
                        });
                    }).catch(function (e) {
                        logError('hookFetch 处理失败:', e);
                        return response;
                    });
                });
            }
        });

        try {
            const desc = Object.getOwnPropertyDescriptor(unsafeWindow, 'fetch');
            if (desc) {
                Object.defineProperty(unsafeWindow, 'fetch', {
                    value: fetchProxy,
                    writable: desc.writable !== false,
                    enumerable: desc.enumerable === true,
                    configurable: desc.configurable !== false
                });
            } else {
                Object.defineProperty(unsafeWindow, 'fetch', {
                    value: fetchProxy,
                    writable: true,
                    enumerable: false,
                    configurable: true
                });
            }
        } catch (e) {
            logError('hookFetch 失败:', e);
        }
    }

    // ============================================================
    // 22. 主 frame 监听子 frame 的消息
    // ============================================================
    function listenChildMessages() {
        if (unsafeWindow.self !== unsafeWindow.top) return;

        unsafeWindow.addEventListener('message', function (e) {
            const d = e.data;
            if (!d || d.__m3u8ar !== true) return;
            if (d.type !== 'processed') return;

            updateActiveSession(d.session);

            updateFilterTip();

            const hasAds = activeSession.adLines.length > 0;
            showResultToast(hasAds, activeSession.adLines.length);
        });
    }

    // ============================================================
    // 23. 菜单
    // ============================================================
    const menuIds = { mode: null, host: null, toast: null, filterTip: null, exportAd: null, exportClean: null };

    function unregisterMenu(id) {
        if (id !== null && id !== undefined) {
            try { GM_unregisterMenuCommand(id); } catch (e) {}
        }
        return null;
    }

    function shouldEnableHook() {
        return !whitelistMode || hostInWhitelist;
    }

    function updateFilterTip() {
        menuIds.filterTip = unregisterMenu(menuIds.filterTip);
        if (!shouldEnableHook()) return;
        if (unsafeWindow.self !== unsafeWindow.top) return;

        if (!activeSession.url) {
            menuIds.filterTip = GM_registerMenuCommand(
                '⚠️ 还没有过滤视频切片广告',
                () => showModal('还没有检测到 m3u8 请求。<br><br>请先在页面中播放视频，然后再点击此菜单。', '提示')
            );
        } else if (activeSession.adLines.length > 0) {
            menuIds.filterTip = GM_registerMenuCommand('✅ 已过滤视频切片广告（点击查看日志）', showFilterLog);
        } else {
            menuIds.filterTip = GM_registerMenuCommand(
                '✅ 已检查 m3u8，未发现广告',
                () => showModal('本次 m3u8 中没有检测到广告片段。<br><br>无需过滤。', '提示')
            );
        }
    }

    function reloadSoon() {
        setTimeout(() => unsafeWindow.location.reload(), 800);
    }

    function setupMenus() {
        if (unsafeWindow.self !== unsafeWindow.top) return;

        menuIds.mode = unregisterMenu(menuIds.mode);
        if (whitelistMode) {
            menuIds.mode = GM_registerMenuCommand('🌐 当前：白名单模式（点击切换到全匹配）', () => {
                GM_setValue('script_whitelist_mode_flag', false);
                whitelistMode = false;
                toast('success', '已切换：全匹配模式');
                reloadSoon();
            });
        } else {
            menuIds.mode = GM_registerMenuCommand('🌐 当前：全匹配模式（点击切换到白名单）', () => {
                GM_setValue('script_whitelist_mode_flag', true);
                whitelistMode = true;
                toast('success', '已切换：白名单模式');
                reloadSoon();
            });
        }

        menuIds.host = unregisterMenu(menuIds.host);
        if (whitelistMode && unsafeWindow.self === unsafeWindow.top) {
            if (hostInWhitelist) {
                menuIds.host = GM_registerMenuCommand('✅ 本网站已开启过滤（点击关闭）', () => {
                    GM_setValue('host:' + currentHost, false);
                    hostInWhitelist = false;
                    toast('success', '已关闭本网站的广告过滤');
                    reloadSoon();
                });
            } else {
                menuIds.host = GM_registerMenuCommand('❌ 本网站已关闭过滤（点击开启）', () => {
                    GM_setValue('host:' + currentHost, true);
                    hostInWhitelist = true;
                    toast('success', '已开启本网站的广告过滤');
                    reloadSoon();
                });
            }
        }

        menuIds.toast = unregisterMenu(menuIds.toast);
        if (unsafeWindow.self === unsafeWindow.top) {
            if (showToastFlag) {
                menuIds.toast = GM_registerMenuCommand('🔔 已开启弹窗提示（点击关闭）', () => {
                    GM_setValue('show_toast_tip_flag', false);
                    showToastFlag = false;
                    setupMenus();
                });
            } else {
                menuIds.toast = GM_registerMenuCommand('🔕 已关闭弹窗提示（点击开启）', () => {
                    GM_setValue('show_toast_tip_flag', true);
                    showToastFlag = true;
                    setupMenus();
                });
            }
        }

        updateFilterTip();

        menuIds.exportAd = unregisterMenu(menuIds.exportAd);
        if (unsafeWindow.self === unsafeWindow.top) {
            menuIds.exportAd = GM_registerMenuCommand('📥 导出广告片段', exportAdM3U8);
        }

        menuIds.exportClean = unregisterMenu(menuIds.exportClean);
        if (unsafeWindow.self === unsafeWindow.top) {
            menuIds.exportClean = GM_registerMenuCommand('📥 导出无广告 m3u8', exportCleanM3U8);
        }
    }

    // ============================================================
    // 24. 视频加载检测
    // ============================================================
    function monitorVideo() {
        if (!shouldEnableHook()) return;

        let checkTimer = null;

        function scheduleCheck(video) {
            if (activeSession.url) return;
            if (checkTimer) clearTimeout(checkTimer);
            checkTimer = setTimeout(() => {
                if (activeSession.url) return;
                if (showToastFlag && unsafeWindow.self === unsafeWindow.top) {
                    const src = video.src || '';
                    if (src.indexOf('.mp4') > 0) {
                        toast('error', '未检测到 m3u8 请求。<br>视频格式是 mp4，无法过滤广告。');
                    } else {
                        toast('warning', '未检测到 m3u8 请求。<br>ctrl+F5 刷新试试。');
                    }
                }
                updateFilterTip();
            }, 8000);
        }

        function attachVideo(video) {
            if (ATTACHED_VIDEOS.has(video)) return;
            ATTACHED_VIDEOS.add(video);
            video.addEventListener('play', () => {
                if (!activeSession.url) scheduleCheck(video);
            });
            if (!video.paused && !activeSession.url && !checkTimer) {
                scheduleCheck(video);
            }
        }

        const existingVideo = unsafeWindow.document.querySelector('video');
        if (existingVideo) attachVideo(existingVideo);

        const observer = new MutationObserver(() => {
            const video = unsafeWindow.document.querySelector('video');
            if (video) attachVideo(video);
        });

        if (unsafeWindow.document.body) {
            observer.observe(unsafeWindow.document.body, { childList: true, subtree: true });
        } else {
            unsafeWindow.document.addEventListener('DOMContentLoaded', () => {
                if (unsafeWindow.document.body) {
                    observer.observe(unsafeWindow.document.body, { childList: true, subtree: true });
                }
            });
        }
    }

    // ============================================================
    // 25. 初始化
    // ============================================================
    function main() {
        console.log('[AD] loaded in', unsafeWindow.location.href);
        listenChildMessages();
        setupMenus();
        if (!shouldEnableHook()) return;
        hookXHR();
        hookFetch();
        monitorVideo();
    }

    main();

})();