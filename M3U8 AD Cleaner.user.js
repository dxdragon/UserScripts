// ==UserScript==
// @name              M3U8 AD Cleaner
// @namespace         https://github.com/dxdragon/UserScripts
// @version           1.3
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
// @grant             GM_addStyle
// @license           MIT
// @updateURL         https://raw.githubusercontent.com/dxdragon/UserScripts/main/M3U8%20AD%20Cleaner.meta.js
// @downloadURL       https://raw.githubusercontent.com/dxdragon/UserScripts/main/M3U8%20AD%20Cleaner.user.js
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
    // 0.5 硬排除名单（无论全匹配 / 白名单模式，一律不启用）
    //     匹配规则：host === 域名 或 host 以 ".域名" 结尾（覆盖所有子域）
    //     列表项一律填「主域名」，如需精确到子域，填子域全称即可
    // ============================================================
    const HARD_EXCLUDE_GROUPS = {

        // ================= 视频网站 =================

        // ---- 国际主流 ----
        videoIntl: [
            'youtube.com', 'youtu.be', 'ytimg.com',
            'netflix.com',
            'hulu.com',
            'disneyplus.com', 'disney-plus.net', 'bamgrid.com', 'dssott.com',
            'hbomax.com', 'max.com',
            'primevideo.com', 'amazonvideo.com',
            'twitch.tv',
            'vimeo.com', 'vhx.tv', 'vimeocdn.com',
            'dailymotion.com', 'dmcdn.net',
            'crunchyroll.com', 'funimation.com',
            'peacocktv.com', 'paramountplus.com',
            'tubitv.com', 'pluto.tv',
            'viki.com',
            'tv.apple.com',
            'soundcloud.com', 'spotify.com',
            'rumble.com', 'odysee.com',
            'tiktok.com', 'tiktokv.com', 'tiktokcdn.com',
            'facebook.com', 'fb.watch', 'fbcdn.net',
            'reddit.com', 'redd.it', 'v.redd.it',
            'x.com', 'twitter.com', 'twimg.com',
        ],

        // ---- 中国 ----
        videoCn: [
            'youku.com', 'tudou.com', 'ykimg.com',
            'iqiyi.com', 'qiyi.com', 'iqiyipic.com', 'qy.net',
            'v.qq.com',                              // 只排腾讯视频，不动 QQ 本体
            'mgtv.com',
            'bilibili.com', 'b23.tv', 'hdslb.com', 'bilivideo.com',
            'sohu.com', 'sohucs.com',
            'le.com', 'letv.com', 'letvimg.com',
            'pptv.com', 'pplive.com',
            'acfun.cn', 'acfun.com', 'acfun.tv',
            'douyin.com', 'iesdouyin.com', 'douyincdn.com', 'douyinpic.com',
            'kuaishou.com', 'kwaicdn.com', 'gifshow.com',
            'ixigua.com',
            '1905.com',
            'cctv.com', 'cntv.cn', 'cctv.cn',
            'music.163.com',
            'weibo.com', 'weibo.cn', 'weibocdn.com', 'sinaimg.cn',
            'miaopai.com',
            'xiaohongshu.com', 'xhscdn.com',
        ],

        // ---- 日本 ----
        videoJp: [
            'nicovideo.jp', 'nimg.jp',
            'abema.tv',
            'tver.jp',
            'dmm.com', 'dmm.co.jp',
            'ameba.jp', 'ameblo.jp',
        ],

        // ---- 韩国 ----
        videoKr: [
            'vlive.tv',
            'tv.naver.com', 'chzzk.naver.com',   // 只排 Naver 视频/直播，不动 Naver 搜索
            'tv.kakao.com',
        ],

        // ---- 东南亚 / 印度 ----
        videoSea: [
            'viu.com', 'viu.tv',
            'iflix.com',
            'hotstar.com',
            'jiocinema.com',
            'sonyliv.com',
            'zee5.com',
            'voot.com',
            'mxplayer.in', 'mxplayer.com',
            'aha.video',
            'loklok.com',
        ],

        // ---- 欧洲 ----
        videoEu: [
            'bbc.co.uk', 'bbc.com', 'bbci.co.uk',
            'itv.com', 'itvstatic.com',
            'channel4.com', 'c4assets.com',
            'channel5.com', 'my5.tv',
            'rte.ie',
            'tf1.fr',
            'francetv.fr', 'france.tv',
            'm6.fr', 'm6web.fr',
            'arte.tv',
            'rtl.de', 'rtl2.de', 'vox.de',
            'prosieben.de', 'sat1.de', 'kabel1.de',
            'rai.it', 'raiplay.it', 'mediaset.it',
            'tv3.cat', 'ccma.cat',
            'rtve.es',
            'nos.nl', 'npo.nl',
            'svt.se', 'svtplay.se',
            'tv4.se', 'tv4play.se',
            'nrk.no', 'tv2.no', 'tv2.dk', 'dr.dk',
            'yle.fi',
            'ardmediathek.de', 'ard.de', 'zdf.de',
        ],

        // ---- 俄罗斯 / 独联体 ----
        videoRu: [
            'rutube.ru',
            'ok.ru', 'odnoklassniki.ru',
            'vk.com', 'vkvideo.ru', 'vk-cdn.net',
            '1tv.ru', '1tv.com',
            'my.mail.ru',
            'kinopoisk.ru',
            'ivi.ru',
            'more.tv',
            'wink.ru',
            'start.ru',
        ],

        // ================= 直播网站 =================

        // ---- 国际直播平台 ----
        liveIntl: [
            'kick.com',
            'trovo.live',
            'dlive.tv',
            'bigo.tv', 'bigo.sg',
            'live.me',
            'younow.com',
            'streamlabs.com',
            'restream.io',
            'lightstream.com',
            'caffeine.tv',
            'theta.tv', 'thetalive.net',
            'streamable.com',
            'livestream.com',
            'ustream.tv',
            'bambuser.com',
            'boxcast.tv',
            'dacast.com',
        ],

        // ---- 国际体育直播 ----
        liveSports: [
            'espn.com', 'espncdn.com', 'espn.co.uk',
            'dazn.com',
            'skysports.com', 'sky.com', 'skygo.com',
            'beinsports.com', 'beinsports.net',
            'eurosport.com', 'eurosport.co.uk',
            'nba.com', 'nba.tv',
            'nfl.com',
            'mlb.com',
            'nhl.com',
            'fifa.com',
            'uefa.com',
            'premierleague.com',
            'laliga.com',
            'bundesliga.com',
            'seriea.com',
            'foxsports.com', 'foxsportsgo.com',
            'cbssports.com', 'cbsivideo.com',
            'nbcsports.com',
            'bleacherreport.com',
            'flosports.com',
            'fubotv.com',
            'sling.com',
            'youtubetv.com',
            'atresplayer.com',
            'movistarplus.es',
            'shahid.net',
            'starzplay.com',
            'osn.com',
            'wavo.tv',
            'globoplay.globo.com', 'globo.com',
            'canalplus-afrique.com',
            'dstv.com', 'multichoice.com',
            'claro.com.br',
        ],

        // ---- 中国直播平台 ----
        liveCn: [
            'douyu.com', 'douyucdn.cn', 'douyucdn2.cn',
            'huya.com', 'huyacdn.com', 'huya.com.cn',
            'longzhu.com', 'plu.cn',
            'quanmin.tv', 'qmcdn.com',
            'zhanqi.tv',
            'yy.com',
            'cc.163.com',                    // 网易 CC，不动 163 邮箱
            'live.qq.com', 'now.qq.com',     // 腾讯直播，不动 QQ 本体
            'live.baidu.com', 'haokan.baidu.com',   // 百度直播，不动百度搜索
            'huajiao.com',
            'laifeng.com',
            '6.cn',
            '17.com',
            'yizhibo.com',
            'inke.cn', 'inke.tv',
            'qiqi.com',
            'taobao.com', 'tmall.com', 'tbcdn.cn',
            'jd.com',
            'live.kuaishou.com',             // kuaishou.com 已在 videoCn，这行是冗余保险
        ],

        // ---- 日本直播 ----
        liveJp: [
            'showroom-live.com',
            'mirrativ.com',
            'openrec.tv',
            'twitcasting.tv',
            '17.live', '17.media',
            'pococha.com',
            'linelive.com', 'line-scdn.net',
        ],

        // ---- 韩国直播 ----
        liveKr: [
            'afreecatv.com',
            'pandatv.com',
            'kakao.com', 'kakaocdn.net',
        ],

        // ---- 东南亚直播 ----
        liveSea: [
            'nonolive.com',
            'booyah.live', 'booyahtv.com',
        ],

        // ================= CDN =================

        // ---- 平台自有 CDN（服务面窄，误伤概率低，建议全开） ----
        cdnOwned: [
            // Google / YouTube
            'googlevideo.com', 'ggpht.com',
            // Netflix
            'nflxvideo.net', 'nflximg.net', 'nflxext.com', 'nflxso.net',
            // Twitch
            'ttvnw.net', 'jtvnw.net', 'twitchcdn.net',
            // Disney+ / Hulu / ESPN
            'dssott.com', 'bamgrid.com', 'disney-plus.net',
            // Amazon Prime
            'aiv-cdn.net', 'aiv-delivery.net', 'pv-cdn.net',
            // Bilibili
            'hdslb.com', 'bilivideo.com', 'bilivideo.cn',
            // TikTok / 抖音
            'tiktokcdn.com', 'tiktokv.com', 'byteoversea.com', 'bytedance.com',
            'douyincdn.com', 'douyinpic.com', 'douyinvod.com',
            // 快手
            'kwaicdn.com', 'gifshow.com',
            // 优酷 / 爱奇艺
            'ykimg.com', 'iqiyipic.com', 'qy.net',
            // 微博
            'weibocdn.com', 'sinaimg.cn',
            // 通用播放器 / 流媒体服务
            'mux.com', 'litix.io',
            'jwplayer.com', 'jwpltx.com',
            'brightcove.com', 'brightcove.net',
            'wowza.com',
        ],

        // ---- 公共 CDN（服务面广，误伤概率高，可按需删减） ----
        cdnPublic: [
            // Akamai
            'akamaihd.net', 'akamaized.net', 'akamai.com',
            // Limelight / Level3 / Edgecast
            'llnwd.net', 'limelight.com',
            'level3.net',
            'edgecastcdn.net',
            // Fastly
            'fastly.net', 'fastlylb.net',
            // AWS CloudFront
            'cloudfront.net',
            // Azure
            'azureedge.net', 'azurefd.net', 'msecnd.net',
            // Cloudflare Stream
            'cloudflarestream.com', 'cloudflarestream.net',
            // 其它国际 CDN
            'cachefly.net',
            'cdn77.org', 'cdn77.com',
            'stackpathdns.com', 'stackpath.com',
            'hwcdn.net', 'highwinds.com',
            'cdnetworks.net', 'cdngc.net',
            'bunnycdn.com', 'b-cdn.net',
            'keycdn.com',
            'gcorelabs.com', 'gcdn.co',
            // 国内公共云 CDN
            'aliyuncs.com', 'alicdn.com',
            'myqcloud.com', 'qcloudcdn.com',
            'baidubce.com',
            'huaweicloud.com', 'hwclouds.com',
            'ksyun.com', 'ksyuncdn.com',
            'chinacache.com', 'ccgslb.com',
            'wscloudcdn.com', 'wsdvs.com', 'wscdns.com',
        ],
    };

    // 扁平化 + 去重
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

    // 匹配：host === 域名 或 host 以 ".域名" 结尾
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

    // ============================================================
    // 1.5 URI 目标匹配（key / map 相对路径补全）
    // ============================================================
    let pendingUriTargets = new Set();
    const uriHits = new Map();
    let requestRecordEnabled = false;
    let uriTargetTimer = null;

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
    const MAX_M3U8_TEXT_LENGTH = 5 * 1024 * 1024;

    const INTEGER_TOLERANCE = 0.001;

    const MIN_TS_COUNT_FOR_PATH_ANALYSIS = 8;
    const MAIN_PREFIX_RATIO_THRESHOLD = 0.7;
    const MAIN_LENGTH_RATIO_THRESHOLD = 0.7;
    const LENGTH_ANOMALY_RATIO = 0.3;

    const STATUS_DEDUP_WINDOW_MS = 5000;
    const TOAST_DELAY_NO_AD_MS = 500;

    const SHORT_AD_MAX_INTERVALS = 5;
    const SHORT_AD_FRAGMENT_THRESHOLD = 3;

    const URI_TARGET_TIMEOUT_MS = 30000;

    const currentHost = unsafeWindow.location.hostname;

    // ============================================================
    // 3. m3u8 域名规则池
    // ============================================================
    const DOMAIN_RULES = [
        {
            name: 'ryplay',
            test: /^(?:[-\w]+\.)*ryplay\d*\.com$/i,
            strategies: ['short', 'integer'],
            options: { integerRatioNum: 1, integerRatioDen: 1 }
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
        session.logs.push({ rule, text });
    }

    function logFilter(session, rule, text) {
        if (DEBUG) {
            const textStr = Array.isArray(text) ? text.join('\n') : text;
            console.log(
                '%c[AD]',
                'font-weight:bold;color:#fff;background:#70b566;padding:2px;border-radius:2px;',
                rule, '\n' + textStr
            );
        }
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
            const textStr = Array.isArray(entry.text) ? entry.text.join('\n') : entry.text;
            parts.push(`<pre>${escapeHtml(textStr)}</pre>`);
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

    function looksLikeM3U8(url) {
        if (!url || typeof url !== 'string') return false;
        return url.indexOf('m3u8') !== -1;
    }

    function isM3U8Content(text) {
        if (!text || typeof text !== 'string') return false;
        return text.slice(0, 64).indexOf('#EXTM3U') > -1;
    }

    function isBoundary(line) {
        return line.startsWith('#EXT-X-DISCONTINUITY') || line.startsWith('#EXT-X-ENDLIST');
    }

    function isMediaSegment(line) {
        if (!line || line.charCodeAt(0) === 35) return false;
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
        if (!line || line.charCodeAt(0) !== 35) return null;
        if (!line.startsWith('#EXTINF')) return null;
        const v = parseFloat(line.slice(8));
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

    function getHostFromUrl(url) {
        if (!url) return '';
        try {
            return new URL(url, unsafeWindow.location.href).hostname;
        } catch (e) {
            return '';
        }
    }

    // ============================================================
    // 7.1 URI 匹配工具
    // ============================================================
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
            unsafeWindow.top.postMessage({
                __m3u8ar: true,
                type: 'uriHit',
                target,
                url
            }, '*');
        } catch (e) {}
    }

    function notifyTopResetUriHits() {
        if (unsafeWindow.self === unsafeWindow.top) return;
        try {
            unsafeWindow.top.postMessage({
                __m3u8ar: true,
                type: 'resetUriHits'
            }, '*');
        } catch (e) {}
    }

    function recordRequestUrl(url) {
        if (!requestRecordEnabled) return;
        if (!url || typeof url !== 'string') return;
        if (pendingUriTargets.size === 0) {
            requestRecordEnabled = false;
            return;
        }

        const reqNoQuery = stripQuery(url);

        // 1. 精确匹配
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

        // 2. 后缀匹配，取最长
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

        try {
            return new URL(uri, m3u8Url).href;
        } catch (e) {
            return uri;
        }
    }

    function absolutizeAttrUri(line, m3u8Url) {
        if (!m3u8Url) return line;
        if (!line.startsWith('#EXT-X-KEY') && !line.startsWith('#EXT-X-MAP')) {
            return line;
        }
        return line.replace(/URI="([^"]*)"/g, (m, uri) => {
            if (!uri) return m;
            return `URI="${resolveUri(uri, m3u8Url)}"`;
        });
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
    // 9. 数字递增检测（公差 + 跳变分析）
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

        // 1. 差值众数作为公差 step
        const diffFreq = new Map();
        for (let i = 1; i < samples.length; i++) {
            const d = samples[i].num - samples[i - 1].num;
            diffFreq.set(d, (diffFreq.get(d) || 0) + 1);
        }

        let step = 0, stepCount = 0;
        for (const [d, c] of diffFreq) {
            if (c > stepCount || (c === stepCount && d > 0)) {
                stepCount = c;
                step = d;
            }
        }

        if (step <= 0 || step > 10) return { ok: false };

        // 2. 比例 ≥ 0.8
        const ratio = stepCount / (samples.length - 1);
        if (ratio < 0.8) return { ok: false };

        // 3. 找第一个跳变点
        let jumpIdx = -1;
        for (let i = 1; i < samples.length; i++) {
            if (samples[i].num !== samples[i - 1].num + step) {
                jumpIdx = i;
                break;
            }
        }

        // 4. 无跳变
        if (jumpIdx === -1) {
            return {
                ok: true,
                firstNum: samples[0].num,
                baseLen: samples[0].len,
                step
            };
        }

        // 5. 有跳变：取更长段
        const beforeCount = jumpIdx - 1;
        const afterCount = samples.length - 1 - jumpIdx;

        if (afterCount > beforeCount) {
            return {
                ok: true,
                firstNum: samples[jumpIdx].num,
                baseLen: samples[jumpIdx].len,
                step
            };
        }
        return {
            ok: true,
            firstNum: samples[0].num,
            baseLen: samples[0].len,
            step
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
    function detectMode(lines, text) {
        const hasAdjump = text.indexOf('/video/adjump/') !== -1;
        const hasKeyNone = text.indexOf('#EXT-X-KEY:METHOD=NONE') !== -1;

        // 1. adjump 优先
        if (hasAdjump) {
            return { mode: TS_MODE.FEATURE, hasAdjump: true, pathInfo: null };
        }

        let pathInfo = null;

        // 2. 有 keynone：先走少数派路径
        if (hasKeyNone) {
            pathInfo = analyzePathPrefixes(lines);
            if (pathInfo.hasMinority || pathInfo.hasLengthAnomaly) {
                return { mode: TS_MODE.FEATURE, hasAdjump: false, pathInfo };
            }
        }

        // 3. 数字递增
        const seq = collectNumericSeq(lines);
        if (seq.ok) {
            return {
                mode: TS_MODE.NUMERIC,
                firstNum: seq.firstNum,
                baseLen: seq.baseLen,
                step: seq.step
            };
        }

        // 4. 少数派路径
        if (!pathInfo) pathInfo = analyzePathPrefixes(lines);
        if (pathInfo.hasMinority || pathInfo.hasLengthAnomaly) {
            return { mode: TS_MODE.FEATURE, hasAdjump: false, pathInfo };
        }

        // 5. 短区间
        return { mode: TS_MODE.SHORT_INTERVAL };
    }

    // ============================================================
    // 12. 通用输出
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
                logFilter(session, rule, removed);
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
    // ============================================================
    function markAdjump(lines, del, reasonArr) {
        const n = lines.length;
        const RULE_ADJ = '/video/adjump/ 广告段';
        let anyAd = false;
        let i = 0;

        while (i < n) {
            const line = lines[i];

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
        const RULE_KEY = '#EXT-X-KEY:METHOD=NONE 广告段';
        const RULE_MINORITY = '少数派路径广告段';

        for (const it of intervals) {
            if (it.count === 0) continue;

            const prefixCount = new Map();
            let totalLen = 0, uriCount = 0;
            let hasKeyNoneInInterval = false;

            if (it.start > 0 && lines[it.start - 1] === '#EXT-X-KEY:METHOD=NONE') {
                hasKeyNoneInInterval = true;
            }

            for (let i = it.start; i < it.end; i++) {
                const line = lines[i];
                if (line === '#EXT-X-KEY:METHOD=NONE') hasKeyNoneInInterval = true;
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
                const reasonStr = hasKeyNoneInInterval ? RULE_KEY : RULE_MINORITY;

                let delStart = it.start;
                if (hasKeyNoneInInterval) {
                    if (it.start > 0 && lines[it.start - 1] === '#EXT-X-KEY:METHOD=NONE') {
                        delStart = it.start - 1;
                    } else {
                        for (let i = it.start; i < it.end; i++) {
                            if (lines[i] === '#EXT-X-KEY:METHOD=NONE') {
                                delStart = i;
                                break;
                            }
                        }
                    }
                }

                for (let j = delStart; j < it.end; j++) {
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
        const RULE_KEY = '#EXT-X-KEY:METHOD=NONE 广告段';

        if (ctx.hasAdjump) {
            anyAd = markAdjump(lines, del, reasonArr) || anyAd;
        }
        if (ctx.pathInfo && (ctx.pathInfo.hasMinority || ctx.pathInfo.hasLengthAnomaly)) {
            anyAd = markPathAnomaly(lines, ctx.pathInfo, del, reasonArr) || anyAd;
        }

        if (!anyAd) return lines;

        for (let k = 0; k < n; k++) {
            if (!lines[k].startsWith('#EXT-X-DISCONTINUITY')) continue;
            if (del[k]) continue;
            const prevDel = k > 0 && del[k - 1] === 1;
            const nextDel = k + 1 < n && del[k + 1] === 1;
            if (prevDel || nextDel) {
                del[k] = 1;
                if (k + 1 < n &&
                    lines[k + 1] === '#EXT-X-KEY:METHOD=NONE' && !del[k + 1]) {
                    del[k + 1] = 1;
                    if (!reasonArr[k + 1]) reasonArr[k + 1] = RULE_KEY;
                }
            }
        }

        return emitDeletedBlocks(lines, del, reasonArr, session, '规则: 广告段');
    }

    // ============================================================
    // 14. 处理器：NUMERIC（内联 normalize）
    // ============================================================
    function filterNumeric(lines, ctx, session) {
        const n = lines.length;
        const del = new Uint8Array(n);
        const reasonArr = new Array(n);
        const RULE = '数字递增异常广告段';
        let anyAd = false;
        const step = ctx.step || 1;

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
                'offset=' + offset,
                'step=' + step);
        }

        let prevNum = mediaSeq - 1;
        let i = 0;

        while (i < n) {
            const line = lines[i];

            if (line.startsWith('#EXT-X-DISCONTINUITY') && lines[i + 1] && lines[i + 2]) {
                if (i > 0 && lines[i - 1].startsWith('#EXT-X-')) {
                    i++;
                    continue;
                }

                const info = parseMediaUri(lines[i + 2]);
                if (info) {
                    const num = info.num - offset;
                    if (num !== prevNum + step) {
                        del[i] = 1;
                        del[i + 1] = 1;
                        del[i + 2] = 1;
                        reasonArr[i] = reasonArr[i + 1] = reasonArr[i + 2] = RULE;
                        anyAd = true;
                        i += 3;
                        continue;
                    }
                }

                i++;
                continue;
            }

            if (line.startsWith('#EXTINF') && lines[i + 1]) {
                const info = parseMediaUri(lines[i + 1]);
                if (info) {
                    const num = info.num - offset;
                    if (num !== prevNum + step) {
                        del[i] = 1;
                        del[i + 1] = 1;
                        reasonArr[i] = reasonArr[i + 1] = RULE;
                        anyAd = true;
                        i += 2;
                        continue;
                    }

                    prevNum = num;
                    i += 2;
                    continue;
                }
            }

            i++;
        }

        if (!anyAd) return lines;

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

            const countOK = it.integerCount * integerRatioDen >= it.count * integerRatioNum;
            if (!countOK) continue;

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
        if (!text || typeof text !== 'string' || text.slice(0, 64).indexOf('#EXTM3U') === -1) {
            return { modified: text, changed: false, session: null, isMaster: false };
        }
        if (text.length > MAX_M3U8_TEXT_LENGTH) {
            logError(`m3u8 文本超过 ${MAX_M3U8_TEXT_LENGTH} 字符，跳过过滤以保护性能`);
            return { modified: text, changed: false, session: null, isMaster: false };
        }

        const rawLines = text.split('\n');
        if (rawLines.length > MAX_M3U8_LINES) {
            logError(`m3u8 行数超过 ${MAX_M3U8_LINES}，跳过过滤以保护性能`);
            return { modified: text, changed: false, session: null, isMaster: false };
        }

        const session = createSession(url || '');

        const lines = [];
        const headLines = [];
        let hasExtinf = false;
        let hasStreamInf = false;
        let inHead = true;

        for (let i = 0; i < rawLines.length; i++) {
            const line = rawLines[i];

            if (line.startsWith('#EXT-X-DISCONTINUITY')) {
                if (lines.length > 0 && lines[lines.length - 1].startsWith('#EXT-X-DISCONTINUITY')) {
                    continue;
                }
                if (i + 1 < rawLines.length && rawLines[i + 1].startsWith('#EXT-X-ENDLIST')) {
                    continue;
                }
            }

            if (line.startsWith('#EXTINF')) {
                inHead = false;
                hasExtinf = true;
            } else if (line.startsWith('#EXT-X-STREAM-INF')) {
                hasStreamInf = true;
            }

            if (inHead) headLines.push(line);
            lines.push(line);
        }

        // ★ 无 #EXTINF → 不是 media playlist
        if (!hasExtinf) {
            if (DEBUG) logInfo(hasStreamInf ? 'master playlist，跳过:' : '无 #EXTINF，跳过:', url);
            return { modified: text, changed: false, session: null, isMaster: true };
        }

        session.headLines = headLines;
        if (session.headLines.length === 0 || session.headLines[0] !== '#EXTM3U') {
            session.headLines.unshift('#EXTM3U');
        }

        // ★ 提取 KEY/MAP 相对 URI，开启请求记录
        const uriTargets = extractUriTargets(lines);
        uriHits.clear();
        pendingUriTargets = uriTargets;
        if (uriTargetTimer) {
            clearTimeout(uriTargetTimer);
            uriTargetTimer = null;
        }
        if (unsafeWindow.self !== unsafeWindow.top) {
            notifyTopResetUriHits();
        }
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

        const m3u8Host = getHostFromUrl(url);
        const ctx = detectMode(lines, text);
        logInfo('模式:', ctx.mode);

        let out;
        switch (ctx.mode) {
            case TS_MODE.FEATURE:        out = filterFeature(lines, ctx, session); break;
            case TS_MODE.NUMERIC:        out = filterNumeric(lines, ctx, session); break;
            case TS_MODE.SHORT_INTERVAL: out = filterIntervals(lines, m3u8Host, session); break;
            case TS_MODE.NONE:
            default:                     out = lines;
        }

        const finalLines = session.changed ? out : lines;
        if (!session.changed && lines.length === rawLines.length) {
            session.filtered = text;
            return { modified: text, changed: false, session, isMaster: false };
        }

        const resultText = finalLines.join('\n');
        session.filtered = resultText;
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
            if (line.startsWith('#')) {
                resultLines.push(absolutizeAttrUri(line, activeSession.url));
            } else {
                resultLines.push(resolveUri(line, activeSession.url));
            }
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
            if (line.startsWith('#')) {
                out.push(absolutizeAttrUri(line, activeSession.url));
            } else {
                out.push(resolveUri(line, activeSession.url));
            }
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
    // 20. Hook: XHR（Proxy）
    // ============================================================
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
                    URL_MAP.set(thisArg, args[1] || '');
                    recordRequestUrl(args[1] || '');
                } catch (e) {}
                return Reflect.apply(target, thisArg, args);
            }
        });

        const sendProxy = new Proxy(origSend, {
            apply(target, thisArg, args) {
                const xhr = thisArg;
                const reqUrl = URL_MAP.get(xhr) || '';

                if (!looksLikeM3U8(reqUrl)) {
                    return Reflect.apply(target, thisArg, args);
                }

                function getFiltered() {
                    const cached = RESP_CACHE.get(xhr);
                    if (cached !== undefined) return cached;

                    let original = '';
                    try {
                        original = origGetResponseText ? origGetResponseText.call(xhr) : '';
                    } catch (e) {
                        original = '';
                    }

                    if (!original || original.slice(0, 64).indexOf('#EXTM3U') === -1) {
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
                    RESP_CACHE.set(xhr, result.modified);
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
    // 21. Hook: fetch（Proxy）
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

                return Reflect.apply(target, thisArg, args).then(function (response) {
                    return response.clone().text().then(function (text) {
                        if (!isM3U8Content(text)) return response;

                        logInfo('hookFetch 命中:', url);

                        let result;
                        try {
                            result = processM3U8(text, url);
                        } catch (e) {
                            logError('hookFetch 处理失败:', e);
                            return response;
                        }

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

            // 子 frame 命中 key/map URI
            if (d.type === 'uriHit') {
                if (d.target && d.url) uriHits.set(d.target, d.url);
                return;
            }

            // 子 frame 处理新 m3u8，清空 top 的 uriHits
            if (d.type === 'resetUriHits') {
                uriHits.clear();
                return;
            }

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
        let moTimer = null;
        let observer = null;
        let foundVideo = null;

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

        function tryAttach() {
            if (foundVideo) return true;
            const video = unsafeWindow.document.querySelector('video');
            if (video) {
                foundVideo = video;
                attachVideo(video);
                if (observer) {
                    observer.disconnect();
                    observer = null;
                }
                return true;
            }
            return false;
        }

        if (tryAttach()) return;

        observer = new MutationObserver(() => {
            if (foundVideo || moTimer) return;
            moTimer = setTimeout(() => {
                moTimer = null;
                tryAttach();
            }, 300);
        });

        const startObserve = () => {
            if (!foundVideo && unsafeWindow.document.body) {
                observer.observe(unsafeWindow.document.body, { childList: true, subtree: true });
            }
        };

        if (unsafeWindow.document.body) {
            startObserve();
        } else {
            unsafeWindow.document.addEventListener('DOMContentLoaded', startObserve, { once: true });
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