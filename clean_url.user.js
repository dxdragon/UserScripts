// ==UserScript==
// @name         Clean URL
// @namespace    https://github.com/dxdragon/UserScripts
// @version      1.0
// @description  剥离常见跟踪参数，禁止发送至服务器，净化链接
// @author       Shay
// @match        *://*/*
// @exclude      *://*bilibili.com/*
// @run-at       document-start
// @grant        none
// @noframes
// @updateURL    https://raw.githubusercontent.com/dxdragon/UserScripts/raw/main/clean_url.user.js
// @downloadURL  https://raw.githubusercontent.com/dxdragon/UserScripts/raw/main/clean_url.user.js
// ==/UserScript==

(function () {
    'use strict';

    /* ==================== 配置区 ==================== */

    // 精确匹配参数名（不区分大小写）
    const EXACT = new Set([
        // ---- uBO 通用规则 ----
        'x-clickref', 'x-source', 'x-a-medium',
        'ranmid', 'raneaid', 'ransiteid',
        'eml-name', 'eml-mediaplan', 'eml-publisher', 'eurl',
        'link_source', 'taid', 'tgclid',
        'analytics_context', 'analytics_trace_id',
        'bance_xuid',
        'elqtrackid', 'elq', 'elqaid', 'elqat', 'elqak', 'elqcampaignid',
        'winflncrtag', 'ftag', 'janet', 'vs_campaign_id',
        'adsterra_clid', 'adsterra_placement_id',
        'loclid', 'ldtag_cl', 'lt_r', 'srclt',
        '_ly_c', '_ly_r', 'yj_r', 'line_uid',
        'mt_click_id', 'mt_network', 'mt_campaign', 'mt_adset', 'mt_creative', 'mt_medium',
        'mt_sub1', 'mt_sub2', 'mt_sub3', 'mt_sub4', 'mt_sub5',
        'adc_publisher', 'adc_token',
        'tw_medium', 'tw_profile_id', 'tw_source',
        'uzcid', 'beyond_uzcvid', 'beyond_uzmcvid',
        'srsltid',
        '_sgm_campaign', '_sgm_term', '_sgm_pinned', '_sgm_source', '_sgm_action',
        'ebisother1', 'ebisother2', 'ebisother3', 'ebisother4', 'ebisother5', 'ebisadid',
        'bemobdata', '_bhlid', '_bdadid',
        'recommended_by', 'recommended_code', 'personaclick_search_query', 'personaclick_input_query',
        'ems_dl', 'emcs_t', 'cstrackid',
        'affijet-click', 'btag', 'jmtyclid', 'tcsack',
        'vsm_type', 'vsm_cid', 'vsm_pid',
        'cjdata', 'cjevent',
        'at_campaign', 'at_campaign_type', 'at_creation', 'at_emailtype',
        'at_link', 'at_link_id', 'at_link_origin', 'at_link_type', 'at_medium',
        'at_ptr_name', 'at_recipient_id', 'at_recipient_list', 'at_send_date',
        '_ope',
        'af_xp', 'af_ad', 'af_adset', 'af_click_lookback', 'af_force_deeplink', 'is_retargeting',
        'dclid', 'sms_click', 'sms_source', 'sms_uph', 'ttclid',
        'spot_im_redirect_source', 'mt_link_id', 'iclid', 'user_email_address', '_gl',
        'cm_me', 'cm_cr',
        'sscid', 'rtkcid', 'clickid',
        'ir_campaignid', 'ir_adid', 'ir_partnerid',
        '__io_lv', '_io_session_id', 'asgtbndr', 'ymid',
        'gci', 'pk_vid', 'mindbox-click-id', 'click_id', 'famad_xuid', 'twclid',
        'cx_click', 'cx_recsorder', 'cx_recswidget',
        'mkt_tok', 'mindbox-message-key', 'uclick', 'uclickhash', 'zoneid',
        's_cid', 'adobe_mc_ref', 'adobe_mc_sdid', 'awc',
        '_hsmi', '__hsfp', '__hssc', '__hstc', '_hsenc',
        'hsa_acc', 'hsa_ad', 'hsa_cam', 'hsa_grp', 'hsa_kw', 'hsa_la',
        'hsa_mt', 'hsa_net', 'hsa_ol', 'hsa_src', 'hsa_tgt', 'hsa_ver', 'hsctatracking',
        'ysclid', 'yclid',
        'aiad_clid',
        'mc_cid', 'mc_eid', 'maf', '_clde', '_cldee', 'wt_mc', 'oprtrack', 'xtor', 'msclkid',
        'vero_conv', 'vero_id',
        'int_content', 'int_term', 'int_source', 'int_medium', 'int_campaign',
        'itm_source', 'itm_medium', 'itm_campaign', 'itm_content', 'itm_term',
        'gad_campaignid', 'gad_source', 'gbraid', 'wbraid', 'gclsrc', 'gclid', 'usqp',
        'dpg_source', 'dpg_campaign', 'dpg_medium', 'dpg_content',
        'admitad_uid', 'adj_label', 'adj_campaign', 'adj_creative', 'gps_adid', 'unicorn_click_id',
        'adjust_creative', 'adjust_tracker_limit', 'adjust_tracker', 'adjust_adgroup',
        'adjust_campaign', 'adjust_referrer', 'external_click_id',
        'bsft_clkid', 'bsft_eid', 'bsft_mid', 'bsft_uid', 'bsft_aaid', 'bsft_ek',
        'mtm_campaign', 'mtm_cid', 'mtm_content', 'mtm_group', 'mtm_keyword',
        'mtm_medium', 'mtm_placement', 'mtm_source',
        'pk_campaign', 'pk_medium', 'pk_source',
        '_branch_referrer', '_branch_match_id',
        'ml_subscriber', 'ml_subscriber_hash', 'rb_clickid', 'oly_anon_id', 'wickedid', 'irgwc',
        'fbclid', 'fbadid', 'nb_placement', 'nb_expid_meta',
        'adfrom', 'nx_source', '_zucks_suid',
        'guccounter', 'guce_referrer', 'guce_referrer_sig', '_openstat',
        'action_object_map', 'action_ref_map', 'action_type_map',
        'fb_action_ids', 'fb_action_types', 'fb_comment_id', 'fb_ref', 'fb_source',
        // ---- MV3 通用排除规则中的参数 ----
        'cmpid', 'adj_t', 'cuid', 'a8', 'irclickid', 'vc_lpp', 'erid', 'oly_enc_id', '_ga', 'tduid',
        // ---- 之前脚本已有、且属于常见跟踪 ----
        'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'gad_source', 'gad_campaignid',
        'msclkid', 'fbclid', 'ttclid', 'twclid', 'li_fat_id', 'igshid', 'igsh', 'mibextid',
        '__cft__', '__tn__', 'img_index',
    ].map(function (k) { return k.toLowerCase(); }));

    // 前缀匹配：凡是以这些字符串开头的参数一律移除
    const PREFIX = [
        'utm_', 'ga_', 'pk_', 'mtm_', 'hsa_', 'wt_mc', 'wt_zmc',
        'trk_', 'vero_', 'oly_', 'elq', 'sc_', 'at_', 'cm_mmc',
        '_sgm_', 'dpg_', 'adj_', 'adjust_', 'bsft_', 'af_', 'ir_', 'nb_',
        '_ly_', 'cx_', 'adobe_mc_', '__hs', '_hs', 'itm_', 'int_', 'sms_', 'ebis',
    ];

    // 正则匹配（匹配小写后的 key）
    const REGEX = [
        /^weekend-reading-link-\d{6}$/i,
    ];

    // 白名单：优先级最高，命中后永不删除
    const KEEP = new Set([
        // 如果某些参数被误删，可在此加入，例如：
        // 'si', 'ref', 'source', 'from',
    ].map(function (k) { return k.toLowerCase(); }));

    /* ==================== 核心逻辑 ==================== */

    function isTracking(key) {
        if (!key) return false;
        const k = key.toLowerCase();
        if (KEEP.has(k)) return false;
        if (EXACT.has(k)) return true;
        for (let i = 0; i < PREFIX.length; i++) {
            if (k.indexOf(PREFIX[i]) === 0) return true;
        }
        for (let i = 0; i < REGEX.length; i++) {
            if (REGEX[i].test(k)) return true;
        }
        return false;
    }

    function stripSearch(search) {
        if (!search || search.length < 2) return null;

        const body = search.charAt(0) === '?' ? search.slice(1) : search;
        if (!body) return '';

        const parts = body.split('&');
        const kept = [];
        let dropped = false;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (part === '') continue;

            const eq = part.indexOf('=');
            const rawKey = eq === -1 ? part : part.slice(0, eq);

            let key;
            try {
                key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
            } catch (e) {
                key = rawKey;
            }

            if (isTracking(key)) {
                dropped = true;
            } else {
                kept.push(part);
            }
        }

        if (!dropped) return null;
        return kept.length ? '?' + kept.join('&') : '';
    }

    function cleanUrl(raw, base) {
        if (typeof raw !== 'string' || raw === '') return null;

        let u;
        try {
            u = new URL(raw, base || location.href);
        } catch (e) {
            return null;
        }

        if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;

        const newSearch = stripSearch(u.search);
        if (newSearch === null) return null;

        u.search = newSearch;
        return u.href;
    }

    function cleanCurrentLocation() {
        const clean = cleanUrl(location.href);
        if (!clean) return;
        try {
            history.replaceState(history.state, '', clean);
        } catch (e) { /* ignore */ }
    }

    /* ==================== 各入口的拦截 ==================== */

    cleanCurrentLocation();

    function handleActivate(event) {
        if (event.defaultPrevented) return;
        if (event.button !== 0 && event.button !== 1) return;

        let anchor = null;

        if (typeof event.composedPath === 'function') {
            const path = event.composedPath();
            for (let i = 0; i < path.length; i++) {
                const node = path[i];
                if (node && node.nodeType === 1 && node.tagName === 'A' && node.hasAttribute('href')) {
                    anchor = node;
                    break;
                }
            }
        } else if (event.target && event.target.closest) {
            anchor = event.target.closest('a[href]');
        }

        if (!anchor) return;

        const clean = cleanUrl(anchor.href);
        if (clean && clean !== anchor.href) {
            anchor.href = clean;
        }
    }

    document.addEventListener('click', handleActivate, true);
    document.addEventListener('auxclick', handleActivate, true);

    document.addEventListener('pointerover', function (e) {
        const t = e.target;
        if (!t || !t.closest) return;
        const anchor = t.closest('a[href]');
        if (!anchor) return;
        const clean = cleanUrl(anchor.href);
        if (clean && clean !== anchor.href) {
            anchor.href = clean;
        }
    }, true);

    try {
        const nativeOpen = window.open;
        if (typeof nativeOpen === 'function') {
            window.open = function (url, name, features) {
                if (typeof url === 'string') {
                    const clean = cleanUrl(url);
                    if (clean) url = clean;
                }
                return nativeOpen.call(window, url, name, features);
            };
        }
    } catch (e) { /* ignore */ }

    try {
        ['pushState', 'replaceState'].forEach(function (method) {
            const native = History.prototype[method];
            if (typeof native !== 'function') return;

            History.prototype[method] = function (state, title, url) {
                if (typeof url === 'string') {
                    const clean = cleanUrl(url);
                    if (clean) url = clean;
                }
                return native.call(this, state, title, url);
            };
        });
    } catch (e) { /* ignore */ }

    try {
        ['assign', 'replace'].forEach(function (method) {
            const native = Location.prototype[method];
            if (typeof native !== 'function') return;

            Object.defineProperty(Location.prototype, method, {
                configurable: true,
                writable: true,
                value: function (url) {
                    if (typeof url === 'string') {
                        const clean = cleanUrl(url);
                        if (clean) url = clean;
                    }
                    return native.call(this, url);
                }
            });
        });
    } catch (e) { /* ignore */ }

    document.addEventListener('submit', function (e) {
        const form = e.target;
        if (!form || !form.action) return;
        if ((form.method || 'get').toLowerCase() !== 'get') return;
        const clean = cleanUrl(form.action);
        if (clean && clean !== form.action) {
            form.action = clean;
        }
    }, true);

})();