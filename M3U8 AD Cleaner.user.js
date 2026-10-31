// ==UserScript==
// @name              M3U8 AD Cleaner
// @namespace         https://github.com/dxdragon/UserScripts
// @version           1.6.1
// @description       拦截和过滤 m3u8 切片广告，支持导出无广告播放列表
// @author            Shay
// @match             *://*/*
// @exclude           *://challenges.cloudflare.com/*
// @exclude           *://*/recaptcha/*
// @exclude           *://*.geetest.com/*
// @exclude           *://*.hcaptcha.com/*
// @exclude           *://live.*
// @exclude           *://*/live/*
// @exclude           *://*/live?*
// @exclude           *://*/pclive/*
// @run-at            document-start
// @grant             unsafeWindow
// @grant             GM_registerMenuCommand
// @grant             GM_unregisterMenuCommand
// @grant             GM_setValue
// @grant             GM_getValue
// @grant             GM_deleteValue
// @grant             GM_addStyle
// @license           MIT
// @updateURL         https://gh-proxy.com/raw.githubusercontent.com/dxdragon/UserScripts/main/M3U8%20AD%20Cleaner.meta.js
// @downloadURL       https://gh-proxy.com/raw.githubusercontent.com/dxdragon/UserScripts/main/M3U8%20AD%20Cleaner.user.js
// ==/UserScript==

(function () {
    'use strict';

    const DEBUG = false;

    // ============================================================
    // -1. 环境伪装层
    // ============================================================
    const __nativeToString = Function.prototype.toString;
    const __toStringMap = new WeakMap();

    function markAsNative(fn, signature, body) {
        const sig = signature || fn.name || 'anonymous';
        const nativeBody = body || '[native code]';
        __toStringMap.set(fn, `function ${sig}() { ${nativeBody} }`);
        try {
            Object.defineProperty(fn, 'name', {
                value: sig, configurable: true, writable: false, enumerable: false
            });
        } catch (e) {}
        return fn;
    }

    const __toStringProxy = new Proxy(__nativeToString, {
        apply(target, thisArg, args) {
            if (__toStringMap.has(thisArg)) return __toStringMap.get(thisArg);
            return Reflect.apply(target, thisArg, args);
        }
    });
    __toStringMap.set(__toStringProxy, 'function toString() { [native code] }');
    try {
        Object.defineProperty(__toStringProxy, 'name', {
            value: 'toString', configurable: true, writable: false, enumerable: false
        });
    } catch (e) {}

    try {
        Object.defineProperty(Function.prototype, 'toString', {
            value: __toStringProxy, writable: true, enumerable: false, configurable: true
        });
    } catch (e) {
        console.error('[AD] toString 伪装失败:', e);
    }

    function disguiseProxy(proxy, original, signature) {
        markAsNative(proxy, signature || original.name);
        try {
            Object.defineProperty(proxy, 'length', {
                value: original.length, configurable: true, writable: false, enumerable: false
            });
        } catch (e) {}
        return proxy;
    }

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
    // 0.5 硬排除名单
    // ============================================================
    const HARD_EXCLUDE_GROUPS = {
        videoIntl: [
            'youtube.com', 'youtu.be', 'ytimg.com',
            'netflix.com', 'hulu.com',
            'disneyplus.com', 'disney-plus.net',
            'hbomax.com', 'max.com',
            'primevideo.com', 'amazonvideo.com',
            'twitch.tv', 'vimeo.com', 'vhx.tv', 'vimeocdn.com',
            'dailymotion.com', 'dmcdn.net', 'crunchyroll.com',
            'peacocktv.com', 'paramountplus.com', 'tubitv.com', 'pluto.tv',
            'tv.apple.com', 'soundcloud.com', 'spotify.com',
            'rumble.com', 'tiktok.com', 'tiktokcdn.com',
            'facebook.com', 'fbcdn.net',
            'reddit.com', 'redd.it', 'v.redd.it',
            'x.com', 'twitter.com', 'twimg.com',
        ],
        videoCn: [
            'youku.com', 'ykimg.com',
            'iqiyi.com', 'qiyipic.com', 'qy.net',
            'v.qq.com', 'mgtv.com',
            'bilibili.com', 'b23.tv', 'hdslb.com', 'bilivideo.com',
            'sohu.com', 'sohucs.com',
            'le.com', 'letv.com', 'letvimg.com',
            'pptv.com', 'pplive.com',
            'acfun.cn', 'acfun.com', 'acfun.tv',
            'douyin.com', 'iesdouyin.com', 'douyincdn.com', 'douyinpic.com',
            'kuaishou.com', 'kwaicdn.com', 'gifshow.com',
            'ixigua.com', '1905.com', 'cctv.com', 'cntv.cn',
            'weibo.com', 'weibo.cn', 'weibocdn.com', 'sinaimg.cn',
            'xiaohongshu.com', 'xhscdn.com',
        ],
        liveIntl: [
            'kick.com', 'trovo.live', 'dlive.tv',
            'bigo.tv', 'bigo.sg', 'younow.com',
        ],
        liveSports: [
            'espn.com', 'espncdn.com', 'espn.co.uk', 'dazn.com',
            'skysports.com', 'sky.com', 'skygo.com',
            'beinsports.com', 'beinsports.net',
            'nba.com', 'nba.tv', 'nfl.com', 'mlb.com', 'nhl.com',
            'fifa.com', 'uefa.com',
        ],
        liveCn: [
            'douyu.com', 'douyucdn.cn', 'douyucdn2.cn',
            'huya.com', 'huyacdn.com', 'huya.com.cn',
            'yy.com', 'quanmin.tv', 'qmcdn.com',
            'zhanqi.tv', 'longzhu.com',
            'live.qq.com', 'cc.163.com',
        ],
    };

    const HARD_EXCLUDE_HOSTS = (() => {
        const out = [];
        const seen = new Set();
        for (const k in HARD_EXCLUDE_GROUPS) {
            const arr = HARD_EXCLUDE_GROUPS[k];
            for (let i = 0; i < arr.length; i++) {
                const v = String(arr[i]).toLowerCase();
                if (!seen.has(v)) { seen.add(v); out.push(v); }
            }
        }
        return out;
    })();

    function isHardExcludedHost(host) {
        if (!host) return false;
        const h = host.toLowerCase();
        for (let i = 0; i < HARD_EXCLUDE_HOSTS.length; i++) {
            const d = HARD_EXCLUDE_HOSTS[i];
            if (h === d || h.endsWith('.' + d)) return true;
        }
        return false;
    }

    if (isHardExcludedHost(unsafeWindow.location.hostname)) {
        console.log('[AD] 当前站点在硬排除名单中，脚本不启用:', unsafeWindow.location.hostname);
        return;
    }

    // ============================================================
    // 1. 弱引用标记
    // ============================================================
    const HOOKED_FLAGS = new WeakMap();
    const ATTACHED_VIDEOS = new WeakSet();
    const URL_MAP = new WeakMap();
    const RESP_CACHE = new WeakMap();
    const OUR_XHR_HOOKS = new WeakMap();

    // ============================================================
    // 1.1 原生 HLS 能力检测 + 禁用名单
    // ============================================================
    let nativeHlsSupported = false;
    let disableHlsHosts = (GM_getValue('disable_hls_hosts', []) || [])
        .map(s => String(s).toLowerCase())
        .filter(Boolean);

    function isHostHlsDisabled(host) {
        if (!host) return false;
        const h = host.toLowerCase();
        for (let i = 0; i < disableHlsHosts.length; i++) {
            const d = disableHlsHosts[i];
            if (h === d || h.endsWith('.' + d)) return true;
        }
        return false;
    }

    function addHlsDisabledHost(host) {
        if (!host) return;
        const h = host.toLowerCase();
        if (isHostHlsDisabled(h)) return;
        disableHlsHosts.push(h);
        GM_setValue('disable_hls_hosts', disableHlsHosts);
    }

    function removeHlsDisabledHost(host) {
        if (!host) return;
        const h = host.toLowerCase();
        disableHlsHosts = disableHlsHosts.filter(d => d !== h && !d.endsWith('.' + h));
        GM_setValue('disable_hls_hosts', disableHlsHosts);
    }

    function applyDisableHlsNow() {
        try {
            const proto = unsafeWindow.HTMLMediaElement && unsafeWindow.HTMLMediaElement.prototype;
            if (!proto) return false;
            if (proto.__m3u8ar_cpt) return true;
            proto.__m3u8ar_cpt = true;
            const orig = proto.canPlayType;
            if (typeof orig !== 'function') return false;

            const canPlayProxy = new Proxy(orig, {
                apply(target, thisArg, args) {
                    const type = args[0];
                    if (type && /mpegurl|m3u8/i.test(type)) return '';
                    return Reflect.apply(target, thisArg, args);
                }
            });
            disguiseProxy(canPlayProxy, orig, 'canPlayType');

            Object.defineProperty(proto, 'canPlayType', {
                value: canPlayProxy,
                writable: true,
                enumerable: false,
                configurable: true
            });
            return true;
        } catch (e) {
            console.error('[AD] applyDisableHlsNow 失败:', e);
            return false;
        }
    }

    function restoreHlsNow() {
        try {
            const proto = unsafeWindow.HTMLMediaElement && unsafeWindow.HTMLMediaElement.prototype;
            if (!proto || !proto.__m3u8ar_cpt) return false;
            delete proto.__m3u8ar_cpt;
            return true;
        } catch (e) {
            return false;
        }
    }

    function tryReload() {
        try { unsafeWindow.location.reload(); } catch (e) {}
        setTimeout(function () {
            try {
                const href = unsafeWindow.location.href;
                unsafeWindow.location.href = href;
            } catch (e) {}
        }, 300);
    }

    (function initNativeHlsControl() {
        try {
            const v = document.createElement('video');
            const r = v.canPlayType('application/vnd.apple.mpegurl');
            nativeHlsSupported = (r === 'maybe' || r === 'probably');
        } catch (e) {
            nativeHlsSupported = false;
        }
        if (!nativeHlsSupported) return;
        if (!isHostHlsDisabled(unsafeWindow.location.hostname)) return;
        applyDisableHlsNow();
    })();

    function disableNativeHlsAndReload() {
        addHlsDisabledHost(currentHost);
        applyDisableHlsNow();
        refreshHlsMenu();
        toast('success', '已禁用原生 HLS，页面即将刷新生效，若视频异常可恢复原生 HLS', 2000);
        tryReload();
    }

    function restoreNativeHlsAndReload() {
        removeHlsDisabledHost(currentHost);
        restoreHlsNow();
        refreshHlsMenu();
        toast('info', '已恢复原生 HLS，页面即将刷新，因原理限制将无法过滤广告', 2000);
        tryReload();
    }

    let hlsMenuId = null;
    function refreshHlsMenu() {
        if (unsafeWindow.self !== unsafeWindow.top) return;
        if (!nativeHlsSupported) return;

        if (hlsMenuId !== null) {
            try { GM_unregisterMenuCommand(hlsMenuId); } catch (e) {}
            hlsMenuId = null;
        }

        if (isHostHlsDisabled(currentHost)) {
            hlsMenuId = GM_registerMenuCommand(
                '🎬 本网站已禁用原生 HLS（点击恢复）',
                restoreNativeHlsAndReload
            );
            return;
        }

        if (detectedNonM3U8) return;
        if (activeSession.url) return;

        hlsMenuId = GM_registerMenuCommand(
            '🎬 本网站未禁用原生 HLS（点击禁用）',
            disableNativeHlsAndReload
        );
    }

    // ============================================================
    // 1.5 URI 目标匹配
    // ============================================================
    let pendingUriTargets = new Set();
    const uriHits = new Map();
    let requestRecordEnabled = false;
    let uriTargetTimer = null;

    // ============================================================
    // 2. 常量
    // ============================================================
    const MODE = { NUMERIC: 0, FEATURE: 1, SHORT_INTERVAL: 2, NONE: 3 };
    const MODE_NAME = { 0: '数字异常', 1: '特征识别', 2: '短区间', 3: '无' };

    const LOG_MAX = 400;
    const MAX_M3U8_LINES = 50000;
    const MAX_M3U8_TEXT_LENGTH = 5 * 1024 * 1024;
    const MIN_TS_COUNT_FOR_PATH_ANALYSIS = 8;
    const MAIN_PREFIX_RATIO_THRESHOLD = 0.7;
    const MAIN_LENGTH_RATIO_THRESHOLD = 0.7;
    const LENGTH_ANOMALY_RATIO = 0.3;
    const STATUS_DEDUP_WINDOW_MS = 5000;
    const TOAST_DELAY_NO_AD_MS = 500;
    const SHORT_AD_MAX_INTERVALS = 5;
    const SHORT_AD_FRAGMENT_THRESHOLD = 3;
    const URI_TARGET_TIMEOUT_MS = 30000;
    const NATIVE_HLS_DETECT_DELAY_MS = 8000;
    const WATCHDOG_INTERVAL_MS = 500;
    const WATCHDOG_FAIL_THRESHOLD = 5;
    const WATCHDOG_PAUSE_MS = 30000;

    const SHORT_MAX_COUNT = 5;
    const SHORT_MODE_THRESHOLD = 5;
    const SHORT_FREQ_MAX = 5;
    const PROTECT_FREQ = 5;
    const PROTECT_RATIO = 0.2;

    // ---- 数字异常 ----
    const MAX_REMOVE_RATIO = 0.5;            // 熔断阈值：删除分片超过此比例 → 放弃过滤
    const MIN_COALITION_RATIO = 0.5;         // 联盟时长占比 < 此值 → 不可信，回落 FEATURE/SHORT
    const RADIX_EARLY_EXIT = 0.6;            // radix10 联盟占比 > 此值 → 跳过 radix16
    const GAP_MAX = 2;                       // 源站缺号容差（可吸收缺口 = GAP_MAX × step）
    const KEY_DIM_MAX_DISTINCT = 4;          // 全局取值种类 ≤ 此值的数字维 = 限定符

    const currentHost = unsafeWindow.location.hostname;
    const pendingVideoChecks = new Set();
    function cancelAllPendingVideoChecks() {
        for (const t of pendingVideoChecks) clearTimeout(t);
        pendingVideoChecks.clear();
    }

    // ============================================================
    // 3. m3u8 域名规则池
    // ============================================================
    const DOMAIN_RULES = [
        {
            name: 'integer',
            tests: [
                /^(?:[-\w]+\.)*ryi?play\d*\.com$/i,
            ],
            strategies: ['short', 'integer'],
            options: {
                integerRatioNum: 1,
                integerRatioDen: 3,
                minDuration: 19,
                maxDuration: 23,
            },
        },
        {
            name: 'float33',
            tests: [
                /^(?:[-\w]+\.)*(?:jimxtc|xgplay\d*)\.com$/i,
                /^(?:[-\w]+\.)*dytt-?\w+\.com$/i,
                /^(?:[-\w]+\.)*phimgood\.com$/i,
            ],
            strategies: ['short', 'float'],
            float: 33,
            options: {
                minDuration: 9,
                maxDuration: 23,
            },
        },
        {
            name: 'float67',
            tests: [
                /^(?:[-\w]+\.)*(?:ffzy|feifei)-\w+\.com$/i,
            ],
            strategies: ['short', 'float'],
            float: 67,
            options: {
                minDuration: 9,
                maxDuration: 23,
            },
        },
        {
            name: 'default',
            tests: [/.*/],
            strategies: ['short'],
            options: {},
        },
    ];

    function matchDomainRule(host) {
        const h = host || '';
        for (let i = 0; i < DOMAIN_RULES.length; i++) {
            const tests = DOMAIN_RULES[i].tests;
            for (let j = 0; j < tests.length; j++) {
                if (tests[j].test(h)) return DOMAIN_RULES[i];
            }
        }
        return DOMAIN_RULES[DOMAIN_RULES.length - 1];
    }

    // ============================================================
    // 4. 状态管理
    // ============================================================
    let whitelistMode = GM_getValue('script_whitelist_mode_flag', false);
    let showToastFlag = GM_getValue('show_toast_tip_flag', false);

    let whitelistHosts = (GM_getValue('whitelist_hosts', []) || [])
        .map(s => String(s).toLowerCase())
        .filter(Boolean);

    (function migrateLegacyWhitelist() {
        if (!currentHost) return;
        const legacyKey = 'host:' + currentHost;
        try {
            const legacyVal = GM_getValue(legacyKey, false);
            if (legacyVal) {
                const h = currentHost.toLowerCase();
                if (!whitelistHosts.includes(h)) {
                    whitelistHosts.push(h);
                    GM_setValue('whitelist_hosts', whitelistHosts);
                }
                GM_deleteValue(legacyKey);
            }
        } catch (e) {}
    })();

    function isHostInWhitelist(host) {
        if (!host) return false;
        const h = host.toLowerCase();
        for (let i = 0; i < whitelistHosts.length; i++) {
            const d = whitelistHosts[i];
            if (h === d || h.endsWith('.' + d)) return true;
        }
        return false;
    }

    function addWhitelistHost(host) {
        if (!host) return;
        const h = host.toLowerCase();
        if (isHostInWhitelist(h)) return;
        whitelistHosts.push(h);
        GM_setValue('whitelist_hosts', whitelistHosts);
    }

    function removeWhitelistHost(host) {
        if (!host) return;
        const h = host.toLowerCase();
        whitelistHosts = whitelistHosts.filter(d => d !== h && !d.endsWith('.' + h));
        GM_setValue('whitelist_hosts', whitelistHosts);
    }

    let hostInWhitelist = isHostInWhitelist(currentHost);
    let parentWhitelistPassed = false;
    let hookInitialized = false;

    let activeSession = createSession('');
    let lastProcessedUrl = '';
    let lastProcessedTime = 0;

    let pendingToastTimer = null;
    let lastToastTime = 0;
    let lastToastHadAds = false;

    let nativeHlsHintShownThisSession = false;
    let detectedNonM3U8 = false;

    function createSession(url) {
        return {
            url: url || '',
            sourceKey: getSourceKey(url || ''),
            adLines: [],
            headLines: [],
            logs: [],
            filtered: '',
            changed: false,
            outcome: 'none',
            parseError: ''
        };
    }

    // ============================================================
    // 5. 日志
    // ============================================================
    function logPush(session, rule, text, removedLines) {
        if (session.logs.length >= LOG_MAX) {
            session.logs.splice(0, session.logs.length - LOG_MAX + 50);
        }
        // ★ 截断 ads，避免内存膨胀
        const MAX_LINES = 100;
        let storedText = text;
        if (Array.isArray(text) && text.length > MAX_LINES) {
            storedText = text.slice(0, MAX_LINES)
                .concat(['...省略 ' + (text.length - MAX_LINES) + ' 行']);
        }
        const entry = { rule, text: storedText };
        if (removedLines) entry.removedLines = removedLines;
        session.logs.push(entry);
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
    .m3u8ar-modal .body .ad-label{font-size:11px;color:#888;margin:8px 0 2px}
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

    function toast(type, html, duration = 3000, onClick) {
        if (!showToastFlag) return null;
        if (!document.body) {
            setTimeout(() => toast(type, html, duration, onClick), 200);
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
        if (typeof onClick === 'function') {
            el.addEventListener('click', function (e) {
                if (e.target && e.target.classList && e.target.classList.contains('close')) return;
                onClick();
                close();
            });
        }
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
            showModal('尚未检测到 m3u8 请求。<br><br>请先在页面中播放视频，然后再点击此菜单。', '提示');
            return;
        }
        if (activeSession.adLines.length === 0) {
            showModal('本次 m3u8 中未检测到广告片段。<br><br>无需过滤。', '提示');
            return;
        }
        if (activeSession.logs.length === 0) {
            showModal('<p>本次无任何过滤日志。</p>', '过滤日志');
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
            
            const total = entry.removedLines || (Array.isArray(entry.text) ? entry.text.length : 0);
            const shown = Array.isArray(entry.text) ? entry.text.length : 0;
            if (total > 0) {
                if (total > shown) {
                    parts.push(`<div class="ad-label">被删内容 ${total} 行（下方仅显示前 ${shown} 行）：</div>`);
                } else {
                    parts.push(`<div class="ad-label">被删内容 ${total} 行：</div>`);
                }
            }
            const textStr = Array.isArray(entry.text) ? entry.text.join('\n') : entry.text;
            parts.push(`<pre>${escapeHtml(textStr)}</pre>`);
        }
        showModal(parts.join(''), '过滤日志');
    }

    // ============================================================
    // 7. 工具
    // ============================================================
    function looksLikeM3U8(url) {
        if (!url || typeof url !== 'string') return false;
        let end = url.length;
        const q = url.indexOf('?');
        if (q !== -1 && q < end) end = q;
        const h = url.indexOf('#');
        if (h !== -1 && h < end) end = h;
        return /\.m3u8$/i.test(url.slice(0, end));
    }

    // ★ 源标识 —— host + 目录路径（去掉文件名和 query）
    function getSourceKey(url) {
        if (!url) return '';
        try {
            const u = new URL(url);
            const parts = u.pathname.split('/');
            parts.pop();
            return u.host + '/' + parts.filter(Boolean).join('/');
        } catch (e) {
            return url;
        }
    }

    function parseExtinfDuration(line) {
        if (!line || line.charCodeAt(0) !== 35) return null;
        if (!line.startsWith('#EXTINF:')) return null;
        const v = parseFloat(line.slice(8));
        return isNaN(v) ? null : v;
    }

    const FLOAT_PATTERNS = {
        33: /^\d+\.\d?3{2,}$/,     // 末尾至少两个 3
        67: /^\d+\.\d?6{1,}7$/,    // 6 循环至少一次后接 7
    };

    function isFloatDuration(duration, pattern) {
        if (duration === null || duration === undefined) return false;
        return pattern.test(String(duration));
    }

    function cleanUri(uri) {
        let s = uri;
        const schemeIdx = s.indexOf('://');
        if (schemeIdx !== -1) {
            const pathStart = s.indexOf('/', schemeIdx + 3);
            s = pathStart === -1 ? '/' : s.slice(pathStart);
        }
        let end = s.length;
        const q = s.indexOf('?');
        if (q !== -1 && q < end) end = q;
        const h = s.indexOf('#');
        if (h !== -1 && h < end) end = h;
        return s.slice(0, end);
    }

    function extractPathPrefix(uri) {
        if (!uri) return '';
        let end = uri.length;
        const q = uri.indexOf('?');
        if (q !== -1 && q < end) end = q;
        const h = uri.indexOf('#');
        if (h !== -1 && h < end) end = h;
        if (end === 0) return '';
        const idx = uri.lastIndexOf('/', end - 1);
        return idx < 0 ? '' : uri.slice(0, idx + 1);
    }

    function stripQuery(url) {
        if (!url) return url;
        const q = url.indexOf('?');
        return q === -1 ? url : url.slice(0, q);
    }

    function stripRelativePrefix(uri) {
        return uri.replace(/^(?:\.\.?\/)+/, '');
    }

    function extractUriTargets(lines) {
        const targets = new Set();
        for (let i = 0, n = lines.length; i < n; i++) {
            const line = lines[i];
            if (!line.startsWith('#EXT-X-KEY') && !line.startsWith('#EXT-X-MAP')) continue;
            const m = /URI="([^"]*)"/.exec(line);
            if (m && m[1]) {
                const uri = m[1];
                if (!/^(https?:|data:|blob:|skd:)/i.test(uri)) {
                    targets.add(uri);
                }
            }
        }
        return targets;
    }

    function notifyTopUriHit(target, url) {
        if (unsafeWindow.self === unsafeWindow.top) return;
        try {
            unsafeWindow.top.postMessage({ __m3u8ar: true, type: 'uriHit', target, url }, '*');
        } catch (e) {}
    }

    function notifyTopResetUriHits() {
        if (unsafeWindow.self === unsafeWindow.top) return;
        try {
            unsafeWindow.top.postMessage({ __m3u8ar: true, type: 'resetUriHits' }, '*');
        } catch (e) {}
    }

    function recordRequestUrl(url) {
        if (!requestRecordEnabled) return;
        if (!url || typeof url !== 'string') return;
        if (pendingUriTargets.size === 0) { requestRecordEnabled = false; return; }

        const reqNoQuery = stripQuery(url);

        for (const target of pendingUriTargets) {
            const stripped = stripRelativePrefix(target);
            if (reqNoQuery === stripped) {
                uriHits.set(target, url);
                pendingUriTargets.delete(target);
                notifyTopUriHit(target, url);
                if (pendingUriTargets.size === 0) requestRecordEnabled = false;
                return;
            }
        }

        let best = null;
        for (const target of pendingUriTargets) {
            const stripped = stripRelativePrefix(target);
            if (reqNoQuery.endsWith('/' + stripped)) {
                if (!best || stripped.length > best.stripped.length) {
                    best = { target, url, stripped };
                }
            }
        }
        if (best) {
            uriHits.set(best.target, best.url);
            pendingUriTargets.delete(best.target);
            notifyTopUriHit(best.target, best.url);
            if (pendingUriTargets.size === 0) requestRecordEnabled = false;
        }
    }

    function resolveUri(uri, m3u8Url) {
        if (!uri) return uri;
        if (/^(https?:|data:|blob:|skd:)/i.test(uri)) return uri;
        if (uriHits.has(uri)) return uriHits.get(uri);
        try { return new URL(uri, m3u8Url).href; } catch (e) { return uri; }
    }

    function absolutizeAttrUri(line, m3u8Url) {
        if (!m3u8Url) return line;
        if (!line.startsWith('#EXT-X-KEY') && !line.startsWith('#EXT-X-MAP')) return line;
        return line.replace(/URI="([^"]*)"/g, (m, uri) => {
            if (!uri) return m;
            return `URI="${resolveUri(uri, m3u8Url)}"`;
        });
    }

    // ============================================================
    // 7.4 原生 HLS 提示
    // ============================================================
    function isNativeHlsLikelyInUse(video) {
        if (!nativeHlsSupported) return false;
        if (isHostHlsDisabled(currentHost)) return false;
        if (activeSession.url) return false;
        const src = (video && (video.src || video.currentSrc)) || '';
        return /\.m3u8/i.test(src);
    }

    function showNativeHlsHint(video) {
        if (!isNativeHlsLikelyInUse(video)) return;

        if (nativeHlsHintShownThisSession) return;
        nativeHlsHintShownThisSession = true;

        if (!showToastFlag) return;

        toast('warning',
            '检测到当前网站可能使用浏览器原生 HLS，<br>' +
            '请求不经过 JS，脚本无法过滤广告。<br><br>' +
            '<b>点击此提示禁用原生 HLS 并刷新</b>，<br>' +
            '或点击脚本菜单中的 🎬 项。<br><br>' +
            '<span style="opacity:.85;font-size:11px">（本次会话只提示一次；' +
            '如遇到视频问题，请恢复原生 HLS）</span>',
            10000,
            () => disableNativeHlsAndReload()
        );
    }

    // ============================================================
    // 8. 核心过滤算法
    // ============================================================
    const AD_PATH_HIGH = [
        'adjump',
        'adform', 'admaster', 'adsage', 'adwords', 'admedia',
        'atm.youku', 'cupid.iqiyi', 'gtimg.com/qqlive',
        'smartclip', 'samsungads', 'lgsmartad',
        'p1ayer', 'ssai', 'promo', 'sponsor', 'commercial'
    ];

    const AD_PATH_LOW = ['ad', 'ads', 'adx'];

    const AD_LOW_REGEX = new RegExp(
        '(?:^|[/_\\-\.?&=])(?:' + AD_PATH_LOW.join('|') + ')(?=[/_\\-\.?&=]|$)',
        'i'
    );

    const AD_TAG_SOFT = [
        '#EXT-X-KEY:METHOD=NONE',
    ];

    const HEADER_TAGS = [
        '#EXTM3U',
        '#EXT-X-VERSION:',
        '#EXT-X-TARGETDURATION:',
        '#EXT-X-MEDIA-SEQUENCE:',
        '#EXT-X-DISCONTINUITY-SEQUENCE:',
        '#EXT-X-PLAYLIST-TYPE:',
        '#EXT-X-I-FRAMES-ONLY',
        '#EXT-X-INDEPENDENT-SEGMENTS',
        '#EXT-X-START:',
        '#EXT-X-SERVER-CONTROL:',
        '#EXT-X-PART-INF:',
    ];

    function isHeaderTag(line) {
        for (let i = 0; i < HEADER_TAGS.length; i++) {
            if (line.startsWith(HEADER_TAGS[i])) return true;
        }
        return false;
    }

    function matchAdPath(uri) {
        if (!uri) return null;
        for (let i = 0; i < AD_PATH_HIGH.length; i++) {
            if (uri.indexOf(AD_PATH_HIGH[i]) !== -1) {
                return { level: 'high', keyword: AD_PATH_HIGH[i] };
            }
        }
        if (AD_LOW_REGEX.test(uri)) {
            return { level: 'low', keyword: null };
        }
        return null;
    }

    function matchAdTag(line) {
        if (!line || typeof line !== 'string') return null;
        for (let i = 0; i < AD_TAG_SOFT.length; i++) {
            if (line.startsWith(AD_TAG_SOFT[i])) return AD_TAG_SOFT[i];
        }
        return null;
    }

    function isStructuralLine(l) {
        if (typeof l !== 'string') return false;
        if (l.indexOf('#EXT-X-KEY') === 0) {
            // #EXT-X-KEY:METHOD=NONE 是广告标签，不是结构性声明，不上浮
            return !matchAdTag(l);
        }
        if (l.indexOf('#EXT-X-MAP') === 0) return true;
        return false;
    }

    function parsePlaylist(rawLines) {
        const lines = [];
        for (let i = 0; i < rawLines.length; i++) {
            const line = rawLines[i].trim();
            if (!line) continue;
            if (line.startsWith('#') && !line.startsWith('#EXT')) continue;

            if (line.startsWith('#EXT-X-DISCONTINUITY')) {
                if (lines.length > 0 && lines[lines.length - 1].startsWith('#EXT-X-DISCONTINUITY')) continue;
                if (i + 1 < rawLines.length && rawLines[i + 1].startsWith('#EXT-X-ENDLIST')) continue;
            }
            lines.push(line);
        }

        let firstExtinf = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('#EXTINF:')) { firstExtinf = i; break; }
        }

        if (firstExtinf === -1) {
            return {
                header: lines,
                segments: [],
                groups: [],
                lengthIndex: new Map(),
                hasAdTag: false,
                hasKeyword: false,
                empty: true,
                tail: [],
            };
        }

        const header = [];
        const segments = [];
        const groups = [];
        const lengthIndex = new Map();
        const tail = [];
        let pendingPreLines = [];
        let groupId = 0;
        let hasAdTag = false;
        let hasKeyword = false;
        let curGroup = null;

        for (let i = 0; i < firstExtinf; i++) {
            const line = lines[i];
            if (isHeaderTag(line)) {
                header.push(line);
            } else {
                if (line.startsWith('#EXT-X-DISCONTINUITY')) groupId++;
                pendingPreLines.push(line);
            }
        }

        function startGroup() {
            curGroup = {
                groupId,
                segments: [],
                count: 0,
                integerCount: 0,
                floatCounts: new Map(),
                totalDuration: 0,
                totalLength: 0,
                prefixCount: new Map(),
                dominantPrefix: '',
                names: [],
                strippedNames: [],
            };
        }

        function endGroup() {
            if (!curGroup) return;
            if (curGroup.count === 0) { curGroup = null; return; }

            let best = 0, bestP = '';
            curGroup.prefixCount.forEach(function (c, p) {
                if (c > best) { best = c; bestP = p; }
            });
            curGroup.dominantPrefix = bestP;
            groups.push(curGroup);
            curGroup = null;
        }

        let i = firstExtinf;
        while (i < lines.length) {
            const line = lines[i];

            if (line.startsWith('#EXTINF:')) {
                if (i + 1 >= lines.length || lines[i + 1].startsWith('#')) {
                    for (const pl of pendingPreLines) tail.push(pl);
                    pendingPreLines = [];
                    tail.push(line);
                    i++;
                    continue;
                }

                if (!curGroup) startGroup();

                const extinfLine = line;
                const mediaLine = lines[i + 1];
                const duration = parseExtinfDuration(extinfLine);
                const path = cleanUri(mediaLine);
                const prefix = extractPathPrefix(mediaLine);
                const len = mediaLine.length;
                const isIntDur = duration !== null && Number.isInteger(duration);

                const lastSlash = path.lastIndexOf('/');
                const name = lastSlash < 0 ? path : path.slice(lastSlash + 1);
                const strippedName = name.replace(/\.[a-z0-9]{1,8}$/i, '');

                const seg = {
                    preLines: pendingPreLines,
                    extinfLine,
                    mediaLine,
                    path,
                    prefix,
                    num: null,
                    duration,
                    isIntegerDuration: isIntDur,
                    groupId,
                    removed: false,
                    extraAds: [],
                };

                segments.push(seg);
                curGroup.segments.push(seg);
                curGroup.count++;
                if (isIntDur) curGroup.integerCount++;
                if (duration !== null) {
                    for (const fk in FLOAT_PATTERNS) {
                        if (isFloatDuration(duration, FLOAT_PATTERNS[fk])) {
                            curGroup.floatCounts.set(fk, (curGroup.floatCounts.get(fk) || 0) + 1);
                        }
                    }
                }
                if (duration !== null) curGroup.totalDuration += duration;
                curGroup.totalLength += len;
                curGroup.prefixCount.set(prefix, (curGroup.prefixCount.get(prefix) || 0) + 1);

                curGroup.names.push(name);
                curGroup.strippedNames.push(strippedName);

                lengthIndex.set(len, (lengthIndex.get(len) || 0) + 1);

                if (matchAdPath(mediaLine)) {
                    hasKeyword = true;
                    seg.removed = true;
                }

                pendingPreLines = [];
                i += 2;
                continue;
            }

            if (line.startsWith('#EXT-X-DISCONTINUITY')) {
                endGroup();
                groupId++;
                pendingPreLines.push(line);
                i++;
                continue;
            }

            if (line.startsWith('#EXT-X-ENDLIST')) {
                endGroup();
                for (const pl of pendingPreLines) tail.push(pl);
                pendingPreLines = [];
                while (i < lines.length) { tail.push(lines[i]); i++; }
                break;
            }

            if (line.startsWith('#')) {
                if (matchAdTag(line)) hasAdTag = true;
                pendingPreLines.push(line);
                i++;
                continue;
            }

            i++;
        }

        endGroup();
        for (const pl of pendingPreLines) tail.push(pl);

        return {
            header,
            segments,
            groups,
            lengthIndex,
            hasAdTag,
            hasKeyword,
            empty: false,
            tail,
        };
    }

    function analyzePathPrefixes(playlist) {
        const groups = playlist.groups;
        const lengthIndex = playlist.lengthIndex;

        const prefixTotal = new Map();
        let total = 0;
        for (let i = 0; i < groups.length; i++) {
            const grp = groups[i];
            grp.prefixCount.forEach(function (c, p) {
                prefixTotal.set(p, (prefixTotal.get(p) || 0) + c);
                total += c;
            });
        }

        if (total < MIN_TS_COUNT_FOR_PATH_ANALYSIS) {
            return { hasMinority: false, hasLengthAnomaly: false };
        }

        let mainPrefix = '', mainCount = 0;
        prefixTotal.forEach(function (c, p) {
            if (c > mainCount) { mainCount = c; mainPrefix = p; }
        });
        const hasMinority = (mainCount / total) >= MAIN_PREFIX_RATIO_THRESHOLD && prefixTotal.size > 1;

        let mainLen = 0, mainLenCount = 0;
        lengthIndex.forEach(function (c, l) {
            if (c > mainLenCount) { mainLenCount = c; mainLen = l; }
        });
        const hasLengthAnomaly = (mainLenCount / total) >= MAIN_LENGTH_RATIO_THRESHOLD && lengthIndex.size > 1;

        return { hasMinority, hasLengthAnomaly, mainPrefix, mainLen, prefixTotal };
    }

    // ============================================================
    // 数字异常
    //   tokenize → 全局基数分析 → 骨架+限定符分组 → 组内排序切 run → 完美等差联盟
    // ============================================================
    function cmpBig(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

    function modeBig(arr) {
        if (arr.length === 0) return null;
        const freq = new Map();
        let best = null, bestN = 0;
        for (let i = 0; i < arr.length; i++) {
            const k = arr[i].toString();
            const c = (freq.get(k) || 0) + 1;
            freq.set(k, c);
            if (c > bestN) { bestN = c; best = arr[i]; }
        }
        return best;
    }
    
    // 剥离同组计数器字符串的公共前缀。
    // 不变量：真 AP 跨数字宽度边界（…998, 999 → 1000, 1001…）⇒ 首位必从 9 变 1
    //        ⇒ 全组公共前缀必为空 ⇒ 剥离不生效。
    function stripCommonPrefix(values, radix) {
        if (radix !== 10) {
            return values.map(function (t) { return BigInt('0x' + t); });
        }

        let minLen = Infinity;
        for (let i = 0; i < values.length; i++) {
            if (values[i].length < minLen) minLen = values[i].length;
        }
        let p = 0;
        const maxP = minLen - 1;                     // 每个值至少保留 1 位
        while (p < maxP) {
            const c = values[0][p];
            let ok = true;
            for (let i = 1; i < values.length; i++) {
                if (values[i][p] !== c) { ok = false; break; }
            }
            if (!ok) break;
            p++;
        }
        return values.map(function (t) {
            let body = t.slice(p);
            body = body.replace(/^0+(?=.)/, '');     // 前导零兼容："00"→"0"
            if (!body) body = '0';
            return BigInt(body);
        });
    }

    // URI 路径 → { key: 骨架键, nums: BigInt[] }；radix16 把 [0-9a-f]+ 视为一段
    function tokenizeUri(path, radix) {
        const re = radix === 16 ? /[0-9a-fA-F]+/g : /[0-9]+/g;
        const skel = [];
        const nums = [];
        let last = 0, m;
        while ((m = re.exec(path))) {
            if (m.index > last) skel.push(path.slice(last, m.index));
            skel.push('\u0001');
            nums.push(radix === 16 ? BigInt('0x' + m[0]) : BigInt(m[0]));
            last = m.index + m[0].length;
        }
        if (nums.length === 0) return null;
        skel.push(path.slice(last));
        return { key: skel.join('') + '#' + nums.length, nums: nums };
    }

    // 组内选计数器维：取值种类最多者优先，平手看差分众数占比；组内常数维自动落选
    function pickCounterDim(members) {
        let bestDim = -1, bestDistinct = 1, bestRatio = -1;
        const dimCount = members[0].nums.length;
        for (let d = 0; d < dimCount; d++) {
            const distinct = new Set();
            for (let i = 0; i < members.length; i++) distinct.add(members[i].nums[d].toString());
            if (distinct.size < 2) continue;
            const sorted = members.slice().sort(function (a, b) { return cmpBig(a.nums[d], b.nums[d]); });
            const diffs = [];
            for (let i = 1; i < sorted.length; i++) diffs.push(sorted[i].nums[d] - sorted[i - 1].nums[d]);
            const md = modeBig(diffs);
            let ratio = 0;
            if (md !== null) {
                let hit = 0;
                for (let i = 0; i < diffs.length; i++) if (diffs[i] === md) hit++;
                ratio = hit / diffs.length;
            }
            if (distinct.size > bestDistinct || (distinct.size === bestDistinct && ratio > bestRatio)) {
                bestDim = d; bestDistinct = distinct.size; bestRatio = ratio;
            }
        }
        return bestDim;
    }

    function analyzeRadix(segments, radix) {
        /* pass 0: 全量分词 + 收集每个数字维的全局基数（决定谁是限定符） */
        const toks = new Array(segments.length);
        const cards = [];
        for (let i = 0; i < segments.length; i++) {
            const t = tokenizeUri(segments[i].path, radix);
            toks[i] = t;
            if (!t) continue;
            while (cards.length < t.nums.length) cards.push(new Set());
            for (let d = 0; d < t.nums.length; d++) cards[d].add(t.nums[d].toString());
        }
        const isQualifier = cards.map(function (s) { return s.size <= KEY_DIM_MAX_DISTINCT; });

        /* pass 1: 分组键 = 骨架 + 限定符维取值。
           日期广告 / 清晰度变体 / CDN 编号从此与主链隔离成组。 */
        const groups = new Map();
        for (let i = 0; i < segments.length; i++) {
            const t = toks[i];
            if (!t) continue;
            let key = t.key;
            for (let d = 0; d < t.nums.length; d++) {
                if (isQualifier[d]) key += '\u0002' + t.nums[d].toString();
            }
            let g = groups.get(key);
            if (!g) { g = []; groups.set(key, g); }
            g.push({ seg: segments[i], nums: t.nums, len: t.nums.length });
        }

        /* pass 2: 组内 → 选计数器维 → 剥离公共前缀 → 排序 → 去重 → 众数步长 → 切无缝 run */
        const runs = [];
        groups.forEach(function (members) {
            const dim = pickCounterDim(members);
            if (dim < 0) return;

            // 把该维字符串值剥掉组内公共前缀后重新解析。
            const cvs = stripCommonPrefix(
                members.map(function (m) { return m.nums[dim].toString(radix); }),
                radix
            );
            for (let i = 0; i < members.length; i++) members[i].cv = cvs[i];

            members.sort(function (a, b) { return cmpBig(a.cv, b.cv); });
            const dedup = [];
            const seenVal = new Set();
            for (let i = 0; i < members.length; i++) {
                const k = members[i].cv.toString();
                if (seenVal.has(k)) continue;           // 仅同组同值=真重复分片，先出现者占位
                seenVal.add(k);
                dedup.push(members[i]);
            }
            if (dedup.length < 2) return;
            const diffs = [];
            for (let i = 1; i < dedup.length; i++) diffs.push(dedup[i].cv - dedup[i - 1].cv);
            const step = modeBig(diffs);
            if (step === null || step <= 0n) return;
            let start = 0;
            for (let i = 1; i <= dedup.length; i++) {
                if (i === dedup.length || dedup[i].cv - dedup[i - 1].cv !== step) {
                    let dsum = 0;
                    for (let k = start; k < i; k++) dsum += (dedup[k].seg.duration || 0);
                    runs.push({ step: step, dim: dim, len: dedup[0].len, dur: dsum, members: dedup.slice(start, i) });
                    start = i;
                }
            }
        });
        if (runs.length === 0) return { keep: new Set(), score: 0 };

        /* pass 3: 联盟吸收——按时长降序，增量校验"并集仍是无洞等差数列"才收
           全程使用 cv（真计数器空间），跨组比较发生在同一空间。 */
        runs.sort(function (a, b) { return b.dur - a.dur; });
        const seed = runs[0];
        const S = seed.step, dim0 = seed.dim, len0 = seed.len;
        let first = seed.members[0].cv;
        let last = seed.members[seed.members.length - 1].cv;
        const seen = new Set();
        const coalVals = [];
        const keep = new Set();
        for (const m of seed.members) {
            seen.add(m.cv.toString());
            coalVals.push(m.cv);
            keep.add(m.seg);
        }
        let score = seed.dur;

        function absorb(vals, run) {
            for (const v of vals) { seen.add(v.toString()); coalVals.push(v); }
            for (const m of run.members) keep.add(m.seg);
            score += run.dur;
        }

        for (let r = 1; r < runs.length; r++) {
            const run = runs[r];
            if (run.dim !== dim0 || run.len !== len0) continue;       // 结构不同 → 不并入
            const vals = run.members.map(function (m) { return m.cv; }).sort(cmpBig);
            const local = new Set();
            let ok = true;
            for (const v of vals) {
                const k = v.toString();
                if (seen.has(k) || local.has(k)) { ok = false; break; } // 撞号（隔离后的日期广告组在此被拒）
                local.add(k);
                if ((v - first) % S !== 0n) { ok = false; break; }      // 不在网格上
            }
            if (!ok) continue;
            const lo = vals[0], hi = vals[vals.length - 1];
            const reach = S * BigInt(1 + GAP_MAX);
            if (hi < first && first - hi <= reach) {
                absorb(vals, run); first = lo;                          // 向下近邻接：拼回被切断的主链头
            } else if (lo > last && lo - last <= reach) {
                absorb(vals, run); last = hi;                           // 向上近邻接：顺延主链尾
            } else if (lo <= last && hi >= first) {
                // 区间重叠（多 CDN 交错/乱序）→ 全量重校验并集是否完美等差
                const union = coalVals.concat(vals).sort(cmpBig);
                let perfect = union.length >= 2;
                if (perfect) {
                    const U = union[1] - union[0];
                    if (U <= 0n) perfect = false;
                    for (let i = 2; perfect && i < union.length; i++) {
                        if (union[i] - union[i - 1] !== U) perfect = false;
                    }
                }
                if (perfect) {
                    absorb(vals, run);
                    if (lo < first) first = lo;
                    if (hi > last) last = hi;
                }
            }
            // 其余（数值断崖/远离网格）→ 广告，拒收
        }
        return { keep: keep, score: score };
    }

    function detectMode(playlist) {
        const pathInfo = analyzePathPrefixes(playlist);
        const anomaly = pathInfo.hasMinority || pathInfo.hasLengthAnomaly;
        if (playlist.hasAdTag && anomaly) {
            return { mode: MODE.FEATURE, pathInfo, anomaly };
        }
        return { mode: MODE.NUMERIC, pathInfo, anomaly };
    }

    function filterFeature(playlist, ctx) {
        const rules = new Set();
        const pathInfo = ctx.pathInfo;
        if (!pathInfo || (!pathInfo.hasMinority && !pathInfo.hasLengthAnomaly)) {
            return [];
        }

        const groups = playlist.groups;

        for (let g = 0; g < groups.length; g++) {
            const grp = groups[g];
            if (grp.count === 0) continue;

            let hasTagInGroup = false;
            for (let i = 0; i < grp.segments.length; i++) {
                const pre = grp.segments[i].preLines;
                for (let j = 0; j < pre.length; j++) {
                    if (matchAdTag(pre[j])) { hasTagInGroup = true; break; }
                }
                if (hasTagInGroup) break;
            }

            if (grp.prefixCount.size === 1) {
                const hitMinority = pathInfo.hasMinority && grp.dominantPrefix !== pathInfo.mainPrefix;
                const avgLen = grp.totalLength / grp.count;
                const hitLength = pathInfo.hasLengthAnomaly &&
                    Math.abs(avgLen - pathInfo.mainLen) / pathInfo.mainLen > LENGTH_ANOMALY_RATIO;

                if (hitMinority || hitLength) {
                    let reason;
                    if (hasTagInGroup) reason = '标签标识';
                    else if (hitMinority) reason = '少数派';
                    else reason = '长度异常';

                    for (let i = 0; i < grp.segments.length; i++) {
                        grp.segments[i].removed = true;
                    }
                    rules.add(reason);
                }
            } else {
                const groupMain = grp.dominantPrefix;
                let removedAny = false;
                for (let i = 0; i < grp.segments.length; i++) {
                    const seg = grp.segments[i];
                    if (seg.removed) continue;
                    if (seg.prefix !== groupMain) {
                        seg.removed = true;
                        removedAny = true;
                    }
                }
                if (removedAny) rules.add('少数派');
            }
        }
        
        // 前置清理边界标签
        const segments = playlist.segments;
        for (let i = 1; i < segments.length; i++) {
            if (segments[i - 1].removed && !segments[i].removed) {
                const prevSeg = segments[i - 1];
                const seg = segments[i];
                const newPre = [];
                for (let j = 0; j < seg.preLines.length; j++) {
                    const pl = seg.preLines[j];
                    if (pl.startsWith('#EXT-X-DISCONTINUITY') || matchAdTag(pl)) {
                        prevSeg.extraAds.push(pl);
                    } else {
                        newPre.push(pl);
                    }
                }
                seg.preLines = newPre;
            }
        }

        return Array.from(rules);
    }

    function filterNumeric(playlist) {
        const segments = playlist.segments;
        if (segments.length < 3) return { ok: false, rules: [] };
        let totalDur = 0;
        for (let i = 0; i < segments.length; i++) totalDur += (segments[i].duration || 0);
        if (totalDur <= 0) return { ok: false, rules: [] };

        // radix 自校验：真进制下主链无缝 → 联盟时长最大者胜
        let best = null;
        const radices = [10, 16];
        for (let ri = 0; ri < radices.length; ri++) {
            const r = analyzeRadix(segments, radices[ri]);
            if (!best || r.score > best.score) best = r;
            if (best.score >= totalDur * RADIX_EARLY_EXIT) break;
        }
        if (!best || best.keep.size === 0) return { ok: false, rules: [] };
        if (best.score < totalDur * MIN_COALITION_RATIO) return { ok: false, rules: [] };

        let changed = false;
        for (let i = 0; i < segments.length; i++) {
            if (!best.keep.has(segments[i])) {
                segments[i].removed = true;
                changed = true;
            }
        }
        
        // 假边界清理：kept 段紧跟 removed 段时，广告留下的 DISCONTINUITY / 广告标签移入 prev.extraAds
        if (changed) {
            const segments = playlist.segments;
            for (let i = 1; i < segments.length; i++) {
                if (segments[i - 1].removed && !segments[i].removed) {
                    const prevSeg = segments[i - 1];
                    const seg = segments[i];
                    const newPre = [];
                    for (let j = 0; j < seg.preLines.length; j++) {
                        const pl = seg.preLines[j];
                        if (pl.startsWith('#EXT-X-DISCONTINUITY') || matchAdTag(pl)) {
                            prevSeg.extraAds.push(pl);
                        } else {
                            newPre.push(pl);
                        }
                    }
                    seg.preLines = newPre;
                }
            }
        }
        
        
        return { ok: true, rules: changed ? ['数字异常'] : [] };
    }

    function strategyInteger(intervals, options) {
        const result = new Set();
        const integerRatioNum = (options && options.integerRatioNum) || 1;
        const integerRatioDen = (options && options.integerRatioDen) || 1;
        const minDuration = (options && options.minDuration !== undefined) ? options.minDuration : null;
        const maxDuration = (options && options.maxDuration !== undefined) ? options.maxDuration : null;

        for (let i = 0; i < intervals.length; i++) {
            const it = intervals[i];
            if (it.count === 0) continue;
            if (it.integerCount * integerRatioDen < it.count * integerRatioNum) continue;
            if (!Number.isInteger(it.totalDuration)) continue;
            if (minDuration !== null && it.totalDuration < minDuration) continue;
            if (maxDuration !== null && it.totalDuration > maxDuration) continue;
            result.add(it);
        }
        return result;
    }
    
    // float：区间内命中任一指定 float 特征的片段占比 > 0.5 → 广告区间
    // floatKeys 取 DOMAIN_RULES.float，可以是单个 key 或 key 数组。
    function strategyFloat(intervals, options, floatKeys) {
        const result = new Set();
        const keys = Array.isArray(floatKeys) ? floatKeys : [floatKeys];
        const valid = [];
        for (let i = 0; i < keys.length; i++) {
            const k = String(keys[i]);
            if (FLOAT_PATTERNS[k]) valid.push(k);
        }
        if (valid.length === 0) return result;

        const minDuration = (options && options.minDuration !== undefined) ? options.minDuration : null;
        const maxDuration = (options && options.maxDuration !== undefined) ? options.maxDuration : null;

        for (let i = 0; i < intervals.length; i++) {
            const it = intervals[i];
            if (it.count === 0) continue;
            let hit = false;
            for (let k = 0; k < valid.length; k++) {
                const fc = it.floatCounts ? (it.floatCounts.get(valid[k]) || 0) : 0;
                if (fc * 2 > it.count) { hit = true; break; }
            }
            if (!hit) continue;
            if (minDuration !== null && it.totalDuration < minDuration) continue;
            if (maxDuration !== null && it.totalDuration > maxDuration) continue;
            result.add(it);
        }
        return result;
    }

    function strategyShort(intervals) {
        const result = new Set();
        const valid = [];
        for (let i = 0; i < intervals.length; i++) {
            if (intervals[i].count > 0) valid.push(intervals[i]);
        }
        if (valid.length === 0) return result;

        const freq = new Map();
        for (let i = 0; i < valid.length; i++) {
            const c = valid[i].count;
            freq.set(c, (freq.get(c) || 0) + 1);
        }

        let modeCount = 0, modeValue = 0;
        freq.forEach(function (f, cnt) {
            if (f > modeCount || (f === modeCount && cnt > modeValue)) {
                modeCount = f;
                modeValue = cnt;
            }
        });
        const modeRatio = modeCount / valid.length;

        let short;
        if (modeRatio >= 0.5) {
            short = valid.filter(function (it) {
                if (modeValue > SHORT_MODE_THRESHOLD) {
                    return it.count <= SHORT_MAX_COUNT;
                }
                return it.count < modeValue;
            });
        } else {
            short = valid.filter(function (it) {
                const f = freq.get(it.count) || 0;
                return it.count <= SHORT_MAX_COUNT && f <= SHORT_FREQ_MAX;
            });
            short = short.filter(function (it) {
                const f = freq.get(it.count) || 0;
                const ratio = f / valid.length;
                if (f >= PROTECT_FREQ && ratio >= PROTECT_RATIO) return false;
                return true;
            });
        }

        for (let i = 0; i < short.length; i++) result.add(short[i]);
        return result;
    }

    function filterShortInterval(playlist, host) {
        const rule = matchDomainRule(host);
        const groups = playlist.groups;
        if (groups.length === 0) return [];

        const intervals = groups.map(function (grp) {
            return {
                group: grp,
                count: grp.count,
                integerCount: grp.integerCount,
                floatCounts: grp.floatCounts,
                totalDuration: grp.totalDuration,
            };
        });

        const toDelete = new Set();
        const rules = new Set();

        for (let i = 0; i < rule.strategies.length; i++) {
            const name = rule.strategies[i];
            let partial;
            if (name === 'short') {
                partial = strategyShort(intervals);
                if (partial.size > 0) rules.add('短区间');
            } else if (name === 'integer') {
                partial = strategyInteger(intervals, rule.options);
                if (partial.size > 0) rules.add('整数时长');
            } else if (name === 'float') {
                partial = strategyFloat(intervals, rule.options, rule.float);
                if (partial.size > 0) rules.add('浮点时长');
            } else continue;
            partial.forEach(function (it) { toDelete.add(it); });
        }

        if (toDelete.size > SHORT_AD_MAX_INTERVALS) {
            const kept = new Set();
            toDelete.forEach(function (it) {
                if (it.count <= SHORT_AD_FRAGMENT_THRESHOLD) kept.add(it);
            });
            toDelete.clear();
            kept.forEach(function (it) { toDelete.add(it); });
        }

        toDelete.forEach(function (it) {
            for (let i = 0; i < it.group.segments.length; i++) {
                it.group.segments[i].removed = true;
            }
        });
        
        // 前置清理边界标签（短区间需要保留 1 个 DISC 以应对误删音画不同步）
        const segments = playlist.segments;
        for (let i = 1; i < segments.length; i++) {
            if (segments[i - 1].removed && !segments[i].removed) {
                const prevSeg = segments[i - 1];
                const seg = segments[i];
                const newPre = [];
                let keptDisc = false;
                
                for (let j = 0; j < seg.preLines.length; j++) {
                    const pl = seg.preLines[j];
                    if (matchAdTag(pl)) {
                        prevSeg.extraAds.push(pl);
                    } else if (pl.startsWith('#EXT-X-DISCONTINUITY')) {
                        if (!keptDisc) {
                            newPre.push(pl); // 保留 1 个
                            keptDisc = true;
                        } else {
                            prevSeg.extraAds.push(pl);
                        }
                    } else {
                        newPre.push(pl);
                    }
                }
                seg.preLines = newPre;
            }
        }

        return Array.from(rules);
    }

    function serialize(playlist) {
        const out = [];
        const ads = [];
        let removedCount = 0;

        // 广告在开头时，全局 KEY/MAP 声明在被删分片的 preLines 里，会随广告进 ads
        // 导致整流无法解密。仅当保留分片都不含 KEY/MAP（单一全局声明）时抢救上浮；
        // 保留段自带 KEY/MAP（轮换流）则不动，避免错位。
        const hoistSet = new Set();
        let structuralInKept = 0;
        for (let i = 0; i < playlist.segments.length; i++) {
            if (playlist.segments[i].removed) continue;
            const pre = playlist.segments[i].preLines;
            for (let j = 0; j < pre.length; j++) {
                if (isStructuralLine(pre[j])) structuralInKept++;
            }
        }
        if (structuralInKept === 0) {
            for (let i = 0; i < playlist.segments.length; i++) {
                if (!playlist.segments[i].removed) continue;
                const pre = playlist.segments[i].preLines;
                for (let j = 0; j < pre.length; j++) {
                    if (isStructuralLine(pre[j])) hoistSet.add(pre[j]);
                }
            }
        }

        for (let i = 0; i < playlist.header.length; i++) {
            out.push(playlist.header[i]);
        }
        hoistSet.forEach(function (pl) { out.push(pl); });

        for (let i = 0; i < playlist.segments.length; i++) {
            const seg = playlist.segments[i];

            if (seg.removed) {
                for (let j = 0; j < seg.preLines.length; j++) {
                    if (hoistSet.has(seg.preLines[j])) continue;
                    ads.push(seg.preLines[j]);
                    removedCount++;
                }
                ads.push(seg.extinfLine);
                removedCount++;
                ads.push(seg.mediaLine);
                removedCount++;

                // 输出剥离过来的尾部标签
                if (seg.extraAds) {
                    for (let j = 0; j < seg.extraAds.length; j++) {
                        ads.push(seg.extraAds[j]);
                        removedCount++;
                    }
                }
                continue;
            }

            for (let j = 0; j < seg.preLines.length; j++) {
                out.push(seg.preLines[j]);
            }
            out.push(seg.extinfLine);
            out.push(seg.mediaLine);
        }

        for (let i = 0; i < playlist.tail.length; i++) {
            out.push(playlist.tail[i]);
        }

        return { lines: out, ads: ads, removedCount: removedCount };
    }

    function filterM3U8(text, url) {
        const stats = {
            originalLines: 0,
            removedLines: 0,
            mode: MODE.NONE,
            modeName: MODE_NAME[MODE.NONE],
            ruleName: '',
            rules: [],
            error: null,
            master: false,
        };

        const emptyResult = function (mod, changed) {
            return { modified: mod, changed, stats, headLines: [], ads: [] };
        };

        if (!text || typeof text !== 'string' || text.length === 0) {
            stats.error = 'empty';
            return emptyResult(text, false);
        }

        const trimmed = text.replace(/^\uFEFF/, '').replace(/^\s+/, '');

        if (trimmed.length === 0) {
            stats.error = 'empty';
            return emptyResult(text, false);
        }

        if (trimmed.charCodeAt(0) === 0x3C) {
            stats.error = 'html';
            return emptyResult(text, false);
        }

        if (trimmed.slice(0, 64).indexOf('#EXTM3U') === -1) {
            stats.error = 'not-m3u8';
            return emptyResult(text, false);
        }

        if (text.indexOf('#EXT-X-STREAM-INF') !== -1) {
            stats.master = true;
            return emptyResult(text, false);
        }

        let rawLines;
        try { rawLines = text.split('\n'); }
        catch (e) { stats.error = 'split failed'; return emptyResult(text, false); }

        stats.originalLines = rawLines.length;

        if (rawLines.length > MAX_M3U8_LINES) {
            stats.error = 'too many lines';
            return emptyResult(text, false);
        }

        let playlist;
        try { playlist = parsePlaylist(rawLines); }
        catch (e) { stats.error = String(e); return emptyResult(text, false); }

        if (playlist.empty) {
            stats.error = 'empty-playlist';
            return emptyResult(text, false);
        }

        if (playlist.hasKeyword) {
            stats.mode = MODE.FEATURE;
            stats.modeName = MODE_NAME[MODE.FEATURE];
            stats.rules = ['关键词'];

            // 前置边界清理
            const segs = playlist.segments;
            for (let i = 1; i < segs.length; i++) {
                if (segs[i - 1].removed && !segs[i].removed) {
                    const prevSeg = segs[i - 1];
                    const curSeg = segs[i];
                    const newPre = [];
                    for (let j = 0; j < curSeg.preLines.length; j++) {
                        const pl = curSeg.preLines[j];
                        if (pl.startsWith('#EXT-X-DISCONTINUITY') || matchAdTag(pl)) {
                            prevSeg.extraAds.push(pl);
                        } else {
                            newPre.push(pl);
                        }
                    }
                    curSeg.preLines = newPre;
                }
            }

            const ser = serialize(playlist);
            stats.removedLines = ser.removedCount;

            const headLines = playlist.header.slice();
            if (headLines.length === 0 || headLines[0] !== '#EXTM3U') headLines.unshift('#EXTM3U');

            if (ser.removedCount === 0) {
                return { modified: text, changed: false, stats, headLines, ads: [] };
            }
            return {
                modified: ser.lines.join('\n'),
                changed: true, stats, headLines, ads: ser.ads
            };
        }

        const ctx = detectMode(playlist);
        stats.mode = ctx.mode;
        stats.modeName = MODE_NAME[ctx.mode] || MODE_NAME[MODE.NONE];

        let rules;
        try {
            switch (ctx.mode) {
                case MODE.FEATURE:
                    rules = filterFeature(playlist, ctx);
                    break;
                case MODE.NUMERIC: {
                    const nr = filterNumeric(playlist);
                    if (nr.ok) {
                        // 数字异常成功：即使零删除也不回落，否则干净列表会被 SHORT 误伤
                        rules = nr.rules;
                    } else if (ctx.anomaly) {
                        // 数字模式失败 → 回落到 FEATURE，同步更新模式
                        stats.mode = MODE.FEATURE;
                        stats.modeName = MODE_NAME[MODE.FEATURE];
                        rules = filterFeature(playlist, { pathInfo: ctx.pathInfo });
                    } else {
                        // 数字模式失败 → 回落到 SHORT，同步更新模式
                        stats.mode = MODE.SHORT_INTERVAL;
                        stats.modeName = MODE_NAME[MODE.SHORT_INTERVAL];
                        let host = '';
                        try { host = new URL(url).hostname; } catch (e) {}
                        stats.ruleName = matchDomainRule(host).name;
                        rules = filterShortInterval(playlist, host);
                    }
                    break;
                }
                case MODE.SHORT_INTERVAL: {
                    let host = '';
                    try { host = new URL(url).hostname; } catch (e) {}
                    stats.ruleName = matchDomainRule(host).name;
                    rules = filterShortInterval(playlist, host);
                    break;
                }
                default:
                    rules = [];
            }
        } catch (e) {
            stats.error = String(e);
            return emptyResult(text, false);
        }

        stats.rules = rules || [];

        // 熔断：删除分片过半 → 判定失误，放弃本次过滤（宁可不删，不可错杀黑屏）
        let removedSegs = 0;
        for (let i = 0; i < playlist.segments.length; i++) {
            if (playlist.segments[i].removed) removedSegs++;
        }
        if (removedSegs > playlist.segments.length * MAX_REMOVE_RATIO) {
            const headLines = playlist.header.slice();
            if (headLines.length === 0 || headLines[0] !== '#EXTM3U') headLines.unshift('#EXTM3U');
            return { modified: text, changed: false, stats, headLines, ads: [] };
        }

        const ser = serialize(playlist);
        stats.removedLines = ser.removedCount;

        const headLines = playlist.header.slice();
        if (headLines.length === 0 || headLines[0] !== '#EXTM3U') headLines.unshift('#EXTM3U');

        if (ser.removedCount === 0) {
            return { modified: text, changed: false, stats, headLines, ads: [] };
        }
        return {
            modified: ser.lines.join('\n'),
            changed: true, stats, headLines, ads: ser.ads
        };
    }

    // ============================================================
    // 8.1 统一入口
    // ============================================================
    function processM3U8(text, url) {
        if (!text || typeof text !== 'string') {
            return { modified: text, changed: false, session: null, isMaster: false, error: 'empty' };
        }

        if (text.length > MAX_M3U8_TEXT_LENGTH) {
            logError(`m3u8 文本超过 ${MAX_M3U8_TEXT_LENGTH} 字符，跳过过滤以保护性能`);
            return { modified: text, changed: false, session: null, isMaster: false, error: null };
        }

        let result;
        try {
            result = filterM3U8(text, url);
        } catch (e) {
            logError('filterM3U8 异常:', e);
            return { modified: text, changed: false, session: null, isMaster: false, error: String(e) };
        }

        if (result.stats.master) {
            if (DEBUG) logInfo('master playlist，跳过:', url);
            return { modified: text, changed: false, session: null, isMaster: true, error: null };
        }

        if (result.stats.error) {
            return {
                modified: text, changed: false, session: null, isMaster: false,
                error: result.stats.error
            };
        }

        const session = createSession(url || '');
        session.filtered = result.modified;
        session.changed = result.changed;
        session.headLines = result.headLines;
        session.adLines = result.ads || [];
        session.outcome = result.changed ? 'filtered' : 'no-ads';
        session.parseError = '';

        if (result.changed && result.stats.removedLines > 0) {
            const ruleText = (result.stats.rules && result.stats.rules.length)
                ? '规则: ' + result.stats.rules.join('+')
                : '规则: 广告段';
            logPush(session, ruleText, result.ads, result.stats.removedLines);
        }

        const rawLines = text.split('\n');
        const uriTargets = extractUriTargets(rawLines);
        uriHits.clear();
        pendingUriTargets = uriTargets;
        if (uriTargetTimer) { clearTimeout(uriTargetTimer); uriTargetTimer = null; }
        if (unsafeWindow.self !== unsafeWindow.top) notifyTopResetUriHits();
        if (uriTargets.size > 0) {
            requestRecordEnabled = true;
            uriTargetTimer = setTimeout(() => {
                requestRecordEnabled = false;
                pendingUriTargets.clear();
                uriTargetTimer = null;
            }, URI_TARGET_TIMEOUT_MS);
        } else {
            requestRecordEnabled = false;
        }

        return { modified: result.modified, changed: result.changed, session, isMaster: false, error: null };
    }

    // ============================================================
    // 19. 状态回调
    // ============================================================
    // 三分支状态机（对齐 Firefox）
    function updateActiveSession(newSession) {
        if (!newSession) return;

        const hasNewAds = newSession.adLines && newSession.adLines.length > 0;
        const hasOldAds = activeSession && activeSession.adLines && activeSession.adLines.length > 0;
        const sameLine = activeSession && activeSession.sourceKey &&
                         newSession.sourceKey === activeSession.sourceKey;
        const wasPending = activeSession && activeSession.outcome === 'pending';

        // ---- pending：保留旧 filtered / headLines（无广告也能导出） ----
        if (newSession.outcome === 'pending') {
            newSession.filtered = activeSession.filtered || '';
            newSession.headLines = activeSession.headLines || [];
            newSession.adLines = [];
            activeSession = newSession;
            return;
        }

        // ---- 有广告：无条件更新 ----
        if (hasNewAds) {
            activeSession = newSession;
            return;
        }

        // ---- 无广告/错误 且 同源 且 之前不是 pending：完全不动 ----
        // 关键：wasPending 时不能保持（否则 pending → no-ads 转换被拦，永远停在 pending）
        if (sameLine && !wasPending) {
            return;
        }

        // ---- 无广告/错误 且（不同源 或 之前是 pending）：替换 ----
        activeSession = newSession;
    }

    function notifyM3U8Pending(url) {
        if (unsafeWindow.self !== unsafeWindow.top) {
            try {
                unsafeWindow.top.postMessage({
                    __m3u8ar: true, type: 'pending', url: url
                }, '*');
            } catch (e) {}
            return;
        }

        lastProcessedUrl = '';
        lastProcessedTime = 0;

        const s = createSession(url);
        s.outcome = 'pending';
        updateActiveSession(s);
        refreshHlsMenu();
        updateFilterTip();
    }

    function buildStatusToast(session) {
        const outcome = session.outcome || 'none';

        if (outcome === 'pending') return null;

        if (outcome === 'filtered') {
            return {
                type: 'success',
                text: `已过滤切片广告，可导出 ${session.adLines.length} 行广告片段`,
                duration: 3000
            };
        }

        if (outcome === 'no-ads') {
            return {
                type: 'info',
                text: '已检查 m3u8，未发现广告',
                duration: 3000
            };
        }

        if (outcome === 'invalid') {
            const pe = session.parseError;
            let text;
            if (pe === 'empty') text = 'm3u8 响应为空';
            else if (pe === 'html') text = 'm3u8 响应是 HTML（错误页或重定向）';
            else if (pe === 'not-m3u8') text = 'm3u8 响应不是 m3u8 内容';
            else if (pe === 'empty-playlist') text = 'm3u8 无分片内容';
            else text = 'm3u8 响应无效';
            return { type: 'warning', text, duration: 4000 };
        }

        if (outcome === 'parse-error') {
            return {
                type: 'error',
                text: 'm3u8 解析失败',
                duration: 4000
            };
        }

        return null;
    }

    function showResultToast(session) {
        if (!showToastFlag) return;
        if (unsafeWindow.self !== unsafeWindow.top) return;

        const info = buildStatusToast(session);
        if (!info) return;

        const now = Date.now();
        const hasAds = session.outcome === 'filtered';

        if (hasAds) {
            if (pendingToastTimer) { clearTimeout(pendingToastTimer); pendingToastTimer = null; }
            lastToastTime = now;
            lastToastHadAds = true;
            toast(info.type, info.text, info.duration);
            return;
        }

        if (now - lastToastTime < STATUS_DEDUP_WINDOW_MS && lastToastHadAds) return;

        if (pendingToastTimer) clearTimeout(pendingToastTimer);
        pendingToastTimer = setTimeout(() => {
            pendingToastTimer = null;
            const t = Date.now();
            if (t - lastToastTime < STATUS_DEDUP_WINDOW_MS && lastToastHadAds) return;
            lastToastTime = t;
            lastToastHadAds = false;
            toast(info.type, info.text, info.duration);
        }, TOAST_DELAY_NO_AD_MS);
    }

    // ★ 新增：网络失败处理（对齐 Firefox filter.onerror）
    function onM3U8NetworkError(url) {
        if (unsafeWindow.self !== unsafeWindow.top) {
            try {
                unsafeWindow.top.postMessage({
                    __m3u8ar: true, type: 'networkError', url: url
                }, '*');
            } catch (e) {}
            return;
        }

        // 没有历史过滤记录 → 不动（避免首次加载失败清状态）
        const hasOldAds = activeSession && activeSession.adLines && activeSession.adLines.length > 0;
        if (!hasOldAds) return;

        const failedSourceKey = getSourceKey(url);

        // 同源失败 → 不动（音轨失败不影响主视频状态）
        if (failedSourceKey === activeSession.sourceKey) return;

        // 不同源失败 → 视为换线路 → 替换（清 badge）
        const s = createSession(url);
        s.outcome = 'parse-error';
        s.parseError = 'network-error';
        s.filtered = '';
        s.changed = false;
        s.adLines = [];

        activeSession = s;
        updateFilterTip();
    }

    function onM3U8Processed(result, url) {
        if (!result || result.isMaster) return;

        if (result.error) {
            let outcome;
            if (result.error === 'empty' ||
                result.error === 'html' ||
                result.error === 'not-m3u8' ||
                result.error === 'empty-playlist') {
                outcome = 'invalid';
            } else {
                outcome = 'parse-error';
            }

            const s = createSession(url || '');
            s.outcome = outcome;
            s.parseError = result.error;
            s.filtered = '';
            s.changed = false;

            const key = url || '';
            const now = Date.now();
            if (key && key === lastProcessedUrl && now - lastProcessedTime < STATUS_DEDUP_WINDOW_MS) return;
            lastProcessedUrl = key;
            lastProcessedTime = now;

            if (unsafeWindow.self !== unsafeWindow.top) {
                try {
                    unsafeWindow.top.postMessage({
                        __m3u8ar: true, type: 'processed', session: s
                    }, '*');
                } catch (e) { logError('postMessage 失败:', e); }
                return;
            }

            updateActiveSession(s);
            updateFilterTip();
            showResultToast(s);
            return;
        }

        if (!result.session) return;

        const key = url || '';
        const now = Date.now();
        if (key && key === lastProcessedUrl && now - lastProcessedTime < STATUS_DEDUP_WINDOW_MS) return;
        lastProcessedUrl = key;
        lastProcessedTime = now;

        updateActiveSession(result.session);

        if (unsafeWindow.self !== unsafeWindow.top) {
            try {
                unsafeWindow.top.postMessage({
                    __m3u8ar: true, type: 'processed', session: activeSession
                }, '*');
            } catch (e) { logError('postMessage 失败:', e); }
            return;
        }

        updateFilterTip();
        showResultToast(activeSession);
    }

    // ============================================================
    // 20. Hook: XHR
    // ============================================================
    function hookXHR() {
        const XHRProto = unsafeWindow.XMLHttpRequest && unsafeWindow.XMLHttpRequest.prototype;
        if (!XHRProto) return;

        const stored = OUR_XHR_HOOKS.get(XHRProto);
        if (stored && XHRProto.open === stored.open && XHRProto.send === stored.send) {
            return;
        }

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
                    URL_MAP.set(thisArg, args[1] || '');
                    recordRequestUrl(args[1] || '');
                } catch (e) {}
                return Reflect.apply(target, thisArg, args);
            }
        });
        disguiseProxy(openProxy, origOpen, 'open');

        const sendProxy = new Proxy(origSend, {
            apply(target, thisArg, args) {
                const xhr = thisArg;
                const reqUrl = URL_MAP.get(xhr) || '';

                if (!looksLikeM3U8(reqUrl)) {
                    return Reflect.apply(target, thisArg, args);
                }

                notifyM3U8Pending(reqUrl);

                // ★ 网络失败监听（error / timeout），只触发一次
                try {
                    let networkErrNotified = false;
                    const onNetworkErr = function () {
                        if (networkErrNotified) return;
                        networkErrNotified = true;
                        onM3U8NetworkError(reqUrl);
                    };
                    xhr.addEventListener('error', onNetworkErr);
                    xhr.addEventListener('timeout', onNetworkErr);
                } catch (e) {}

                function getFiltered() {
                    const cached = RESP_CACHE.get(xhr);
                    if (cached !== undefined) return cached;

                    let original = '';
                    try {
                        original = origGetResponseText ? origGetResponseText.call(xhr) : '';
                    } catch (e) { original = ''; }

                    if (!original) {
                        RESP_CACHE.set(xhr, original);
                        return original;
                    }

                    const url = xhr.responseURL || reqUrl || '';
                    let result;
                    try {
                        result = processM3U8(original, url);
                    } catch (e) {
                        logError('处理失败:', e);
                        RESP_CACHE.set(xhr, original);
                        return original;
                    }

                    onM3U8Processed(result, url);
                    const out = result.changed ? result.modified : original;
                    RESP_CACHE.set(xhr, out);
                    return out;
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
                        }, configurable: true
                    });
                } catch (e) { logError('覆盖 responseText 失败:', e); }

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
                        }, configurable: true
                    });
                } catch (e) { logError('覆盖 response 失败:', e); }

                return Reflect.apply(target, thisArg, args);
            }
        });
        disguiseProxy(sendProxy, origSend, 'send');

        try {
            Object.defineProperty(XHRProto, 'open', {
                value: openProxy, writable: true, enumerable: false, configurable: true
            });
            Object.defineProperty(XHRProto, 'send', {
                value: sendProxy, writable: true, enumerable: false, configurable: true
            });
            OUR_XHR_HOOKS.set(XHRProto, { open: openProxy, send: sendProxy });
        } catch (e) { logError('hookXHR 失败:', e); }
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
                let url = '';
                if (typeof args[0] === 'string') url = args[0];
                else if (args[0] && typeof args[0].url === 'string') url = args[0].url;

                if (url) recordRequestUrl(url);

                if (!looksLikeM3U8(url)) {
                    return Reflect.apply(target, thisArg, args);
                }

                notifyM3U8Pending(url);

                return Reflect.apply(target, thisArg, args).then(function (response) {
                    return response.clone().text().then(function (text) {
                        if (!text) return response;

                        logInfo('hookFetch 命中:', url);
                        let result;
                        try {
                            result = processM3U8(text, url);
                        } catch (e) {
                            logError('hookFetch 处理失败:', e);
                            return response;
                        }

                        if (result.isMaster) return response;

                        onM3U8Processed(result, url);

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
                }).catch(function (e) {
                    // ★ 请求失败（网络错误、CORS、超时）
                    onM3U8NetworkError(url);
                    throw e;
                });
            }
        });
        disguiseProxy(fetchProxy, origFetch, 'fetch');

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
                    value: fetchProxy, writable: true, enumerable: false, configurable: true
                });
            }
        } catch (e) { logError('hookFetch 失败:', e); }
    }

    // ============================================================
    // 22. 主 frame 监听子 frame
    // ============================================================
    function listenChildMessages() {
        if (unsafeWindow.self !== unsafeWindow.top) return;
        unsafeWindow.addEventListener('message', function (e) {
            const d = e.data;
            if (!d || d.__m3u8ar !== true) return;

            if (d.type === 'uriHit') {
                if (d.target && d.url) uriHits.set(d.target, d.url);
                return;
            }
            if (d.type === 'resetUriHits') { uriHits.clear(); return; }

            if (d.type === 'pending') {
                cancelAllPendingVideoChecks();
                lastProcessedUrl = '';
                lastProcessedTime = 0;

                const s = createSession(d.url);
                s.outcome = 'pending';
                updateActiveSession(s);
                refreshHlsMenu();
                updateFilterTip();
                return;
            }

            if (d.type === 'nonM3U8') {
                detectedNonM3U8 = true;
                refreshHlsMenu();
                updateFilterTip();

                if (showToastFlag) {
                    if (d.isMp4) {
                        toast('error',
                            '未检测到 m3u8 请求。<br>' +
                            '视频格式是 <b>mp4</b>，脚本无法过滤广告。',
                            5000
                        );
                    } else {
                        toast('warning',
                            '未检测到 m3u8 请求。<br>' +
                            '可能是其他视频格式或加载方式，脚本无法过滤广告。',
                            5000
                        );
                    }
                }
                return;
            }

            if (d.type === 'networkError') {
                cancelAllPendingVideoChecks();
                onM3U8NetworkError(d.url);
                return;
            }

            if (d.type !== 'processed') return;

            cancelAllPendingVideoChecks();
            updateActiveSession(d.session);
            refreshHlsMenu();
            updateFilterTip();
            showResultToast(activeSession);
        });
    }

    // 22.1 白名单桥接
    function broadcastWhitelistPass() {
        try {
            const iframes = unsafeWindow.document.querySelectorAll('iframe');
            for (let i = 0; i < iframes.length; i++) {
                try {
                    const w = iframes[i].contentWindow;
                    if (w) w.postMessage({ __m3u8ar: true, type: 'whitelistPass' }, '*');
                } catch (e) {}
            }
        } catch (e) {}
    }

    function watchNewIframes() {
        try {
            let timer = null;
            const schedule = () => {
                if (timer) return;
                timer = setTimeout(() => {
                    timer = null;
                    broadcastWhitelistPass();
                }, 200);
            };
            const mo = new MutationObserver(schedule);
            const start = () => {
                if (unsafeWindow.document.body) {
                    mo.observe(unsafeWindow.document.body, { childList: true, subtree: true });
                }
            };
            if (unsafeWindow.document.body) start();
            else unsafeWindow.document.addEventListener('DOMContentLoaded', start, { once: true });
        } catch (e) {}
    }

    function setupWhitelistBridge() {
        if (unsafeWindow.self === unsafeWindow.top) {
            if (!shouldEnableHook()) return;
            if (unsafeWindow.document.readyState === 'loading') {
                unsafeWindow.document.addEventListener('DOMContentLoaded', broadcastWhitelistPass, { once: true });
            } else {
                broadcastWhitelistPass();
            }
            watchNewIframes();
            return;
        }
        unsafeWindow.addEventListener('message', function (e) {
            const d = e.data;
            if (!d || d.__m3u8ar !== true || d.type !== 'whitelistPass') return;
            if (parentWhitelistPassed) return;
            parentWhitelistPassed = true;
            broadcastWhitelistPass();
            watchNewIframes();
            doInitHooks();
            setupMenus();
        });
    }

    // 22.2 Hook 初始化
    function doInitHooks() {
        if (hookInitialized) return;
        if (!shouldEnableHook()) return;
        hookInitialized = true;
        scheduleInstallHooks();
    }

    // ============================================================
    // 22.3 通用 hook 安装机制
    // ============================================================
    let hookSignatures = null;
    let watchdogTimer = null;
    let watchdogFailCount = 0;
    let watchdogPausedUntil = 0;

    function installHooks() {
        hookXHR();
        hookFetch();

        hookSignatures = {
            fetch: unsafeWindow.fetch,
            xhrOpen: unsafeWindow.XMLHttpRequest && unsafeWindow.XMLHttpRequest.prototype.open,
            xhrSend: unsafeWindow.XMLHttpRequest && unsafeWindow.XMLHttpRequest.prototype.send
        };
    }

    function isHookIntact() {
        if (!hookSignatures) return false;
        if (unsafeWindow.fetch !== hookSignatures.fetch) return false;
        if (!unsafeWindow.XMLHttpRequest) return false;
        const proto = unsafeWindow.XMLHttpRequest.prototype;
        if (proto.open !== hookSignatures.xhrOpen) return false;
        if (proto.send !== hookSignatures.xhrSend) return false;
        return true;
    }

    function startHookWatchdog() {
        if (watchdogTimer) return;
        watchdogTimer = setInterval(function () {
            if (!shouldEnableHook()) return;
            if (Date.now() < watchdogPausedUntil) return;

            if (isHookIntact()) {
                watchdogFailCount = 0;
                return;
            }

            watchdogFailCount++;

            if (watchdogFailCount >= WATCHDOG_FAIL_THRESHOLD) {
                watchdogPausedUntil = Date.now() + WATCHDOG_PAUSE_MS;
                watchdogFailCount = 0;
                return;
            }

            installHooks();
        }, WATCHDOG_INTERVAL_MS);
    }

    function scheduleInstallHooks() {
        installHooks();

        Promise.resolve().then(function () {
            return new Promise(function (resolve) {
                setTimeout(resolve, 0);
            });
        }).then(function () {
            if (!shouldEnableHook()) return;
            installHooks();
            monitorVideo();
            startHookWatchdog();
        }).catch(function (e) {
            logError('scheduleInstallHooks 异常:', e);
        });
    }

    // ============================================================
    // 23. 菜单
    // ============================================================
    const menuIds = {
        mode: null, host: null, toast: null,
        filterTip: null, exportAd: null, exportClean: null
    };

    function unregisterMenu(id) {
        if (id !== null && id !== undefined) {
            try { GM_unregisterMenuCommand(id); } catch (e) {}
        }
        return null;
    }

    function shouldEnableHook() {
        return !whitelistMode || hostInWhitelist || parentWhitelistPassed;
    }

    function buildFilterTipTitle(session) {
        const outcome = session.outcome || 'none';

        if (outcome === 'pending') {
            return '🔄 正在检查 m3u8…';
        }
        if (outcome === 'filtered') {
            return '✅ 已过滤视频切片广告（点击查看日志）';
        }
        if (outcome === 'no-ads') {
            return '✅ 已检查 m3u8，未发现广告';
        }
        if (outcome === 'invalid') {
            const pe = session.parseError;
            if (pe === 'empty') return '⚠️ m3u8 响应为空';
            if (pe === 'html') return '⚠️ m3u8 响应是 HTML';
            if (pe === 'not-m3u8') return '⚠️ m3u8 响应不是 m3u8';
            if (pe === 'empty-playlist') return '⚠️ m3u8 无分片内容';
            return '⚠️ m3u8 响应无效';
        }
        if (outcome === 'parse-error') {
            return '⚠️ m3u8 解析失败';
        }
        return null;
    }

    function showOutcomeModal(session) {
        const outcome = session.outcome || 'none';

        if (outcome === 'pending') {
            showModal('正在检查 m3u8 请求…<br><br>请稍候。', '提示');
            return;
        }

        if (outcome === 'filtered') {
            showFilterLog();
            return;
        }

        if (outcome === 'no-ads') {
            showModal('本次 m3u8 中未检测到广告片段。<br><br>无需过滤。', '提示');
            return;
        }

        if (outcome === 'invalid') {
            const pe = session.parseError;
            let text;
            if (pe === 'empty') text = 'm3u8 响应为空，无法处理。';
            else if (pe === 'html') text = 'm3u8 响应是 HTML 页面（可能是错误页或重定向），无法处理。';
            else if (pe === 'not-m3u8') text = 'm3u8 响应内容不是有效的 m3u8 播放列表。';
            else if (pe === 'empty-playlist') text = 'm3u8 播放列表中无分片内容。';
            else text = 'm3u8 响应无效。';
            showModal(text, '提示');
            return;
        }

        if (outcome === 'parse-error') {
            showModal('m3u8 解析失败：' + escapeHtml(session.parseError || ''), '提示');
            return;
        }

        showModal('还未检测到 m3u8 请求。<br><br>请先在页面中播放视频，然后再点击此菜单。', '提示');
    }

    function updateFilterTip() {
        refreshHlsMenu();

        menuIds.filterTip = unregisterMenu(menuIds.filterTip);
        if (!shouldEnableHook()) return;
        if (unsafeWindow.self !== unsafeWindow.top) return;

        if (!activeSession.url) {
            menuIds.filterTip = GM_registerMenuCommand(
                '⚠️ 尚未过滤视频切片广告',
                () => showModal('尚未检测到 m3u8 请求。<br><br>请先在页面中播放视频，然后再点击此菜单。', '提示')
            );
            return;
        }

        const title = buildFilterTipTitle(activeSession);
        if (title) {
            menuIds.filterTip = GM_registerMenuCommand(
                title,
                () => showOutcomeModal(activeSession)
            );
            return;
        }

        menuIds.filterTip = GM_registerMenuCommand(
            '⚠️ 尚未过滤视频切片广告',
            () => showModal('尚未检测到 m3u8 请求。<br><br>请先在页面中播放视频，然后再点击此菜单。', '提示')
        );
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
                    removeWhitelistHost(currentHost);
                    hostInWhitelist = false;
                    toast('success', '已关闭本网站的广告过滤');
                    reloadSoon();
                });
            } else {
                menuIds.host = GM_registerMenuCommand('❌ 本网站已关闭过滤（点击开启）', () => {
                    addWhitelistHost(currentHost);
                    hostInWhitelist = true;
                    toast('success', '已开启本网站的广告过滤');
                    reloadSoon();
                });
            }
        }

        refreshHlsMenu();

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
    // 24. 导出
    // ============================================================
    function downloadBlob(content, filename, mime) {
        const blob = new Blob([content], { type: mime || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        (document.body || document.documentElement).appendChild(a);
        a.click();
        setTimeout(() => { try { a.remove(); } catch (e) {} }, 3000);
    }

    function exportAdM3U8() {
        if (!activeSession.url) { toast('info', '尚未检测到 m3u8，请先播放视频'); return; }
        if (activeSession.adLines.length === 0) { toast('info', '本次未发现广告，无需导出'); return; }
        const resultLines = [];
        if (activeSession.headLines.length > 0) resultLines.push(...activeSession.headLines);
        else { resultLines.push('#EXTM3U'); resultLines.push('#EXT-X-TARGETDURATION:10'); }
        if (resultLines[0] !== '#EXTM3U') resultLines.unshift('#EXTM3U');
        for (const line of activeSession.adLines) {
            if (!line) continue;
            if (line.startsWith('#')) resultLines.push(absolutizeAttrUri(line, activeSession.url));
            else resultLines.push(resolveUri(line, activeSession.url));
        }
        if (!resultLines.includes('#EXT-X-ENDLIST')) resultLines.push('#EXT-X-ENDLIST');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        downloadBlob(resultLines.join('\n'), `ad_segments_${stamp}.m3u8`, 'application/vnd.apple.mpegurl');
        toast('success', `广告片段已导出（${activeSession.adLines.length} 行）`);
    }

    function exportCleanM3U8() {
        if (!activeSession.url) { toast('info', '尚未检测到 m3u8，请先播放视频'); return; }
        if (!activeSession.filtered) { toast('info', '尚无可导出的 m3u8 内容'); return; }
        const lines = activeSession.filtered.split('\n');
        const out = [];
        for (const line of lines) {
            if (!line) { out.push(line); continue; }
            if (line.startsWith('#')) out.push(absolutizeAttrUri(line, activeSession.url));
            else out.push(resolveUri(line, activeSession.url));
        }
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        downloadBlob(out.join('\n'), `clean_${stamp}.m3u8`, 'application/vnd.apple.mpegurl');
        toast('success', '无广告 m3u8 已导出');
    }

    // ============================================================
    // 25. 视频加载检测
    // ============================================================
    function monitorVideo() {
        if (!shouldEnableHook()) return;
        let checkTimer = null, moTimer = null, observer = null, foundVideo = null;

        function scheduleCheck(video) {
            if (activeSession.url) return;
            if (checkTimer) clearTimeout(checkTimer);
            checkTimer = setTimeout(() => {
                if (activeSession.url) return;
                const src = (video && (video.src || video.currentSrc)) || '';

                if (isNativeHlsLikelyInUse(video)) {
                    showNativeHlsHint(video);
                    return;
                }

                detectedNonM3U8 = true;

                if (unsafeWindow.self !== unsafeWindow.top) {
                    try {
                        unsafeWindow.top.postMessage({
                            __m3u8ar: true,
                            type: 'nonM3U8',
                            isMp4: src.indexOf('.mp4') > 0
                        }, '*');
                    } catch (e) {}
                }

                refreshHlsMenu();
                updateFilterTip();

                if (showToastFlag && unsafeWindow.self === unsafeWindow.top) {
                    if (src.indexOf('.mp4') > 0) {
                        toast('error',
                            '未检测到 m3u8 请求。<br>' +
                            '视频格式是 <b>mp4</b>，脚本无法过滤广告。',
                            5000
                        );
                    } else {
                        toast('warning',
                            '未检测到 m3u8 请求。<br>' +
                            '可能是其他视频格式或加载方式，脚本无法过滤广告。',
                            5000
                        );
                    }
                }
            }, NATIVE_HLS_DETECT_DELAY_MS);
        }

        function attachVideo(video) {
            if (ATTACHED_VIDEOS.has(video)) return;
            ATTACHED_VIDEOS.add(video);
            video.addEventListener('play', () => {
                if (!activeSession.url) scheduleCheck(video);
            });
            if (!video.paused && !activeSession.url && !checkTimer) scheduleCheck(video);
        }

        function tryAttach() {
            if (foundVideo) return true;
            const video = unsafeWindow.document.querySelector('video');
            if (video) {
                foundVideo = video;
                attachVideo(video);
                if (observer) { observer.disconnect(); observer = null; }
                return true;
            }
            return false;
        }

        if (tryAttach()) return;

        observer = new MutationObserver(() => {
            if (foundVideo || moTimer) return;
            moTimer = setTimeout(() => { moTimer = null; tryAttach(); }, 300);
        });
        const startObserve = () => {
            if (!foundVideo && unsafeWindow.document.body) {
                observer.observe(unsafeWindow.document.body, { childList: true, subtree: true });
            }
        };
        if (unsafeWindow.document.body) startObserve();
        else unsafeWindow.document.addEventListener('DOMContentLoaded', startObserve, { once: true });
    }

    // ============================================================
    // 26. 初始化
    // ============================================================
    function main() {
        console.log('[AD] loaded in', unsafeWindow.location.href);
        listenChildMessages();
        setupMenus();
        setupWhitelistBridge();
        doInitHooks();
    }

    main();

})();